export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  RATE_LIMITS,
  boundedString,
  consumeRateLimit,
  getCoarseClientKey,
  isUuid,
  logServerError,
  rateLimitResponse,
  readJsonBody,
} from "@/lib/public-security";

type Body = Record<string, unknown>;

function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: Request) {
  try {
    const limit = consumeRateLimit(
      "feedback-create",
      getCoarseClientKey(request),
      RATE_LIMITS.feedbackCreate.limit,
      RATE_LIMITS.feedbackCreate.windowMs
    );
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

    const bodyResult = await readJsonBody<Body>(request, 12 * 1024);
    if (!bodyResult.ok) {
      return NextResponse.json({ error: bodyResult.error, code: "INVALID_BODY" }, { status: 400 });
    }

    const input = bodyResult.value;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json({ error: "Request body must be a JSON object.", code: "INVALID_BODY" }, { status: 400 });
    }

    const businessId = boundedString(input.businessId, 64);
    const sessionId = boundedString(input.sessionId, 64) || null;
    const idempotencyKey = boundedString(input.idempotencyKey, 64);
    const rating = Number(input.rating);
    const hasExperienceField = Object.prototype.hasOwnProperty.call(input, "experienceText");
    const experienceText = typeof input.experienceText === "string" ? input.experienceText.trim().slice(0, 1000) : "";
    const rawReviews = input.aiReviews;
    const aiReviews = Array.isArray(rawReviews)
      ? rawReviews.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim().slice(0, 1500))
      : [];

    if (!businessId || !isUuid(businessId)) {
      return NextResponse.json({ error: "Business ID is invalid.", code: "INVALID_BUSINESS_ID" }, { status: 400 });
    }

    if (sessionId && !isUuid(sessionId)) {
      return NextResponse.json({ error: "Session ID is invalid.", code: "INVALID_SESSION_ID" }, { status: 400 });
    }

    if (!idempotencyKey || !isUuid(idempotencyKey)) {
      return NextResponse.json({ error: "Idempotency key is invalid.", code: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating must be an integer from 1 to 5.", code: "INVALID_RATING" }, { status: 400 });
    }

    if (!Array.isArray(rawReviews) || aiReviews.length !== 3) {
      return NextResponse.json({ error: "Exactly 3 AI review drafts are required.", code: "INVALID_AI_REVIEWS" }, { status: 400 });
    }

    const totalReviewBytes = new TextEncoder().encode(aiReviews.join("\n")).byteLength;
    if (totalReviewBytes > 4500) {
      return NextResponse.json({ error: "AI review drafts are too large.", code: "AI_REVIEWS_TOO_LARGE" }, { status: 400 });
    }

    if (hasExperienceField && input.experienceText !== null && input.experienceText !== undefined && typeof input.experienceText !== "string") {
      return NextResponse.json({ error: "experienceText must be a string, null, or omitted.", code: "INVALID_EXPERIENCE_TYPE" }, { status: 400 });
    }

    if (experienceText && experienceText.length < 8) {
      return NextResponse.json({ error: "Written experience must contain at least 8 characters when provided.", code: "INVALID_EXPERIENCE" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Feedback service is temporarily unavailable.", code: "SUPABASE_CONFIG_MISSING" }, { status: 503 });
    }

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .eq("status", "active")
      .maybeSingle();

    if (businessError) {
      logServerError("feedback business lookup", businessError);
      return NextResponse.json({ error: "Could not verify the business.", code: "BUSINESS_LOOKUP_FAILED" }, { status: 500 });
    }

    if (!business) {
      return NextResponse.json({ error: "Business was not found or is not active.", code: "BUSINESS_NOT_FOUND" }, { status: 404 });
    }

    let validSessionId: string | null = null;
    if (sessionId) {
      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select("id")
        .eq("id", sessionId)
        .eq("business_id", businessId)
        .maybeSingle();

      if (sessionError) {
        logServerError("feedback session lookup", sessionError);
        return NextResponse.json({ error: "Could not verify the session.", code: "SESSION_LOOKUP_FAILED" }, { status: 500 });
      }

      if (session) validSessionId = session.id;
    }

    // Idempotency is server-enforced so client retries cannot create duplicate
    // feedback records for the same customer journey.
    const { data: existingFeedback, error: existingFeedbackError } = await supabase
      .from("feedback")
      .select("id,business_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingFeedbackError) {
      logServerError("feedback idempotency lookup", existingFeedbackError);
      return NextResponse.json({ error: "Could not verify the feedback request.", code: "FEEDBACK_IDEMPOTENCY_LOOKUP_FAILED" }, { status: 500 });
    }

    if (existingFeedback) {
      if (existingFeedback.business_id !== businessId) {
        return NextResponse.json({ error: "This idempotency key is already in use.", code: "IDEMPOTENCY_KEY_CONFLICT" }, { status: 409 });
      }

      return NextResponse.json({ success: true, feedbackId: existingFeedback.id, idempotent: true });
    }

    const insertData: Record<string, unknown> = {
      business_id: businessId,
      rating,
      ai_reviews: aiReviews,
      idempotency_key: idempotencyKey,
    };

    if (validSessionId) insertData.session_id = validSessionId;
    if (experienceText) insertData.experience_text = experienceText;

    const { data: feedback, error: insertError } = await supabase
      .from("feedback")
      .insert(insertData)
      .select("id")
      .single();

    if (insertError) {
      // Two legitimate retries can race between the lookup and insert. The
      // unique index makes the second insert fail atomically; return the
      // original row rather than creating a second record or exposing the DB
      // error to the customer.
      if (insertError.code === "23505") {
        const { data: concurrentFeedback } = await supabase
          .from("feedback")
          .select("id,business_id")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

        if (concurrentFeedback?.business_id === businessId) {
          return NextResponse.json({ success: true, feedbackId: concurrentFeedback.id, idempotent: true });
        }
      }

      logServerError("feedback insert", insertError);
      return NextResponse.json({ error: "Could not save feedback.", code: "FEEDBACK_INSERT_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ success: true, feedbackId: feedback.id });
  } catch (error) {
    logServerError("feedback unexpected", error);
    return NextResponse.json({ error: "Could not save feedback.", code: "FEEDBACK_UNEXPECTED_ERROR" }, { status: 500 });
  }
}
