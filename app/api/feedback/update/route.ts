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

type Action = "selected" | "copied" | "google_clicked";

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
      "feedback-update",
      getCoarseClientKey(request),
      RATE_LIMITS.feedbackUpdate.limit,
      RATE_LIMITS.feedbackUpdate.windowMs
    );
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
    const bodyResult = await readJsonBody<Record<string, unknown>>(request, 6 * 1024);
    if (!bodyResult.ok) {
      return NextResponse.json({ error: bodyResult.error, code: "INVALID_BODY" }, { status: 400 });
    }

    const input = bodyResult.value;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json({ error: "Request body must be a JSON object.", code: "INVALID_BODY" }, { status: 400 });
    }

    const feedbackId = boundedString(input.feedbackId, 64);
    const businessId = boundedString(input.businessId, 64);
    const sessionId = boundedString(input.sessionId, 64) || null;
    const action = typeof input.action === "string" ? input.action.trim() : "";

    if (!feedbackId || !isUuid(feedbackId)) {
      return NextResponse.json({ error: "feedbackId is invalid.", code: "INVALID_FEEDBACK_ID" }, { status: 400 });
    }

    if (!businessId || !isUuid(businessId)) {
      return NextResponse.json({ error: "businessId is invalid.", code: "INVALID_BUSINESS_ID" }, { status: 400 });
    }

    if (sessionId && !isUuid(sessionId)) {
      return NextResponse.json({ error: "sessionId is invalid.", code: "INVALID_SESSION_ID" }, { status: 400 });
    }

    if (!["selected", "copied", "google_clicked"].includes(action)) {
      return NextResponse.json({ error: "Invalid action.", code: "INVALID_ACTION" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Feedback service is temporarily unavailable.", code: "SUPABASE_CONFIG_MISSING" }, { status: 503 });
    }

    const updates: Record<string, unknown> = {};

    if (action === "selected") {
      const selectedReview = boundedString(input.selectedReview, 1500);
      const selectedIndex = Number(input.selectedIndex);

      if (!selectedReview) {
        return NextResponse.json({ error: "selectedReview is required.", code: "MISSING_SELECTED_REVIEW" }, { status: 400 });
      }

      if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 2) {
        return NextResponse.json({ error: "selectedIndex must be an integer from 0 to 2.", code: "INVALID_SELECTED_INDEX" }, { status: 400 });
      }

      updates.selected_review = selectedReview;
      updates.selected_index = selectedIndex;
    }

    if (action === "copied") updates.copied_at = new Date().toISOString();
    if (action === "google_clicked") updates.google_redirected_at = new Date().toISOString();

    // Scope the public enrichment update to the business and, when available,
    // the session that created the feedback. A feedback UUID alone is not an
    // authorization credential.
    let target = supabase
      .from("feedback")
      .update(updates)
      .eq("id", feedbackId)
      .eq("business_id", businessId);

    if (sessionId) {
      target = target.eq("session_id", sessionId);
    }

    const { error } = await target;

    if (error) {
      logServerError("feedback update", error);
      return NextResponse.json({ error: "Could not update feedback.", code: "FEEDBACK_UPDATE_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ success: true, feedbackId });
  } catch (error) {
    logServerError("feedback/update unexpected", error);
    return NextResponse.json({ error: "Could not update feedback.", code: "FEEDBACK_UPDATE_UNEXPECTED_ERROR" }, { status: 500 });
  }
}
