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

type Body = {
  businessId?: unknown;
  userAgent?: unknown;
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
      "session-create",
      getCoarseClientKey(request),
      RATE_LIMITS.sessionCreate.limit,
      RATE_LIMITS.sessionCreate.windowMs
    );
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
    const bodyResult = await readJsonBody<Body>(request, 4 * 1024);
    if (!bodyResult.ok) {
      return NextResponse.json({ error: bodyResult.error, code: "INVALID_BODY" }, { status: 400 });
    }

    const body = bodyResult.value;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be a JSON object.", code: "INVALID_BODY" }, { status: 400 });
    }

    const businessId = typeof body.businessId === "string" ? body.businessId.trim() : "";
    const userAgent = typeof body.userAgent === "string" ? body.userAgent.trim().slice(0, 512) : "";

    if (!businessId || !isUuid(businessId)) {
      return NextResponse.json({ error: "Business ID is invalid.", code: "INVALID_BUSINESS_ID" }, { status: 400 });
    }

    if (body.userAgent !== undefined && body.userAgent !== null && typeof body.userAgent !== "string") {
      return NextResponse.json({ error: "User agent must be a string.", code: "INVALID_USER_AGENT" }, { status: 400 });
    }

    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Session service is temporarily unavailable.", code: "SUPABASE_CONFIG_MISSING" }, { status: 503 });
    }

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .eq("status", "active")
      .maybeSingle();

    if (businessError) {
      logServerError("session business lookup", businessError);
      return NextResponse.json({ error: "Could not verify the business.", code: "BUSINESS_LOOKUP_FAILED" }, { status: 500 });
    }

    if (!business) {
      return NextResponse.json({ error: "Business not found.", code: "BUSINESS_NOT_FOUND" }, { status: 404 });
    }

    const deviceType =
      /android/i.test(userAgent)
        ? "android"
        : /iphone|ipad|ipod/i.test(userAgent)
          ? "ios"
          : /windows|macintosh|linux/i.test(userAgent)
            ? "desktop"
            : "other";

    const { data, error } = await supabase
      .from("sessions")
      .insert({
        business_id: businessId,
        user_agent: userAgent || null,
        device_type: deviceType,
      })
      .select("id")
      .single();

    if (error) {
      logServerError("session insert", error);
      return NextResponse.json({ error: "Could not create session.", code: "SESSION_CREATE_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ sessionId: data.id });
  } catch (error) {
    logServerError("session unexpected", error);
    return NextResponse.json({ error: "Could not create session.", code: "SESSION_CREATE_UNEXPECTED_ERROR" }, { status: 500 });
  }
}
