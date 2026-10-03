export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  RATE_LIMITS,
  consumeRateLimit,
  getCoarseClientKey,
  isUuid,
  logServerError,
  rateLimitResponse,
  readJsonBody,
} from "@/lib/public-security";

const EVENT_TYPES = new Set([
  "scan",
  "rating",
  "feedback",
  "ai_generated",
  "review_selected",
  "review_copied",
  "google_clicked",
]);

const MAX_METADATA_BYTES = 2048;

type Body = {
  businessId?: unknown;
  sessionId?: unknown;
  eventType?: unknown;
  metadata?: unknown;
};

function getAdminClient() {
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
      "analytics-event",
      getCoarseClientKey(request),
      RATE_LIMITS.analyticsEvent.limit,
      RATE_LIMITS.analyticsEvent.windowMs
    );

    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

    const bodyResult = await readJsonBody<Body>(request, 6 * 1024);
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.error, code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const body = bodyResult.value;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be a JSON object.", code: "INVALID_BODY" }, { status: 400 });
    }

    const businessId = typeof body.businessId === "string" ? body.businessId.trim() : "";
    const sessionId = typeof body.sessionId === "string" && body.sessionId.trim() ? body.sessionId.trim() : null;
    const eventType = typeof body.eventType === "string" ? body.eventType.trim() : "";
    const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};

    if (!businessId || !isUuid(businessId)) {
      return NextResponse.json({ error: "Business ID is invalid.", code: "INVALID_BUSINESS_ID" }, { status: 400 });
    }

    if (sessionId && !isUuid(sessionId)) {
      return NextResponse.json({ error: "Session ID is invalid.", code: "INVALID_SESSION_ID" }, { status: 400 });
    }

    if (!EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ error: "Invalid analytics event.", code: "INVALID_EVENT" }, { status: 400 });
    }

    if (JSON.stringify(metadata).length > MAX_METADATA_BYTES) {
      return NextResponse.json({ error: "Analytics metadata is too large.", code: "METADATA_TOO_LARGE" }, { status: 400 });
    }

    const supabase = getAdminClient();
    if (!supabase) {
      // Analytics is intentionally best-effort and must never break the customer journey.
      logServerError("track config", new Error("Server analytics credentials are not configured."));
      return NextResponse.json({ success: true, recorded: false }, { status: 202 });
    }

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .eq("status", "active")
      .maybeSingle();

    if (businessError) {
      logServerError("track business lookup", businessError);
      return NextResponse.json({ success: true, recorded: false }, { status: 202 });
    }

    if (!business) {
      return NextResponse.json({ success: true, recorded: false }, { status: 202 });
    }

    // Validate that a supplied session belongs to the same business, but do not
    // make session validation failures customer-visible analytics errors.
    let validSessionId: string | null = null;
    if (sessionId) {
      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select("id")
        .eq("id", sessionId)
        .eq("business_id", businessId)
        .maybeSingle();

      if (sessionError) logServerError("track session lookup", sessionError);
      if (session) validSessionId = session.id;
    }

    const { error } = await supabase.from("analytics_events").insert({
      business_id: businessId,
      session_id: validSessionId,
      event_type: eventType,
      metadata,
    });

    if (error) {
      logServerError("track insert", error);
      return NextResponse.json({ success: true, recorded: false }, { status: 202 });
    }

    return NextResponse.json({ success: true, recorded: true });
  } catch (error) {
    logServerError("track unexpected", error);
    return NextResponse.json({ success: true, recorded: false }, { status: 202 });
  }
}
