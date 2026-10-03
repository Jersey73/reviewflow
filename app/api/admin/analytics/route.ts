export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { hasBusinessAccess, isUuid, requireAdminApi } from "@/lib/admin-api";

const EVENT_TYPES = {
  scans: "scan",
  ratings: "rating",
  aiGenerations: "ai_generated",
  selectedReviews: "review_selected",
  copies: "review_copied",
  googleClicks: "google_clicked",
} as const;

const VALID_DAYS = new Set([7, 30]);

function adminError(status: number, message: string, code: string) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: Request) {
  const auth = await requireAdminApi();

  if (!auth.supabase) {
    return adminError(
      auth.status,
      auth.errorMessage || "Admin access required.",
      auth.errorCode || "ADMIN_AUTH_FAILED"
    );
  }

  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get("days") || "7");
  const days = VALID_DAYS.has(requestedDays) ? requestedDays : 7;
  const businessId = (url.searchParams.get("businessId") || "all").trim();

  if (businessId !== "all" && !isUuid(businessId)) {
    return adminError(400, "Business selector value is invalid.", "INVALID_BUSINESS_ID");
  }

  if (
    businessId !== "all" &&
    !hasBusinessAccess(auth.authorizedBusinessIds, businessId)
  ) {
    return adminError(
      403,
      "Forbidden: you are not authorized to view analytics for this business.",
      "ANALYTICS_FORBIDDEN"
    );
  }

  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  // An empty assignment set is a valid admin state; return zeroes instead of
  // accidentally querying every business.
  if (businessId === "all" && auth.authorizedBusinessIds.length === 0) {
    return NextResponse.json({
      range: { days, start: start.toISOString(), end: end.toISOString() },
      businessId,
      metrics: {
        scans: 0,
        ratings: 0,
        aiGenerations: 0,
        selectedReviews: 0,
        copies: 0,
        googleClicks: 0,
      },
    });
  }

  async function countEvents(eventType: string) {
    let query = auth.supabase!
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", eventType)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString());

    if (businessId === "all") {
      query = query.in("business_id", auth.authorizedBusinessIds);
    } else {
      query = query.eq("business_id", businessId);
    }

    const { count, error } = await query;

    if (error) {
      throw new Error(
        `${eventType} count failed: ${error.message || "Supabase returned an unknown database error."} (code: ${error.code || "unknown"})`
      );
    }

    return count ?? 0;
  }

  try {
    // Only aggregate counts are returned to the browser. No customer event
    // rows, metadata, feedback text, or review content is exposed.
    const [scans, ratings, aiGenerations, selectedReviews, copies, googleClicks] =
      await Promise.all([
        countEvents(EVENT_TYPES.scans),
        countEvents(EVENT_TYPES.ratings),
        countEvents(EVENT_TYPES.aiGenerations),
        countEvents(EVENT_TYPES.selectedReviews),
        countEvents(EVENT_TYPES.copies),
        countEvents(EVENT_TYPES.googleClicks),
      ]);

    return NextResponse.json(
      {
        range: {
          days,
          start: start.toISOString(),
          end: end.toISOString(),
        },
        businessId,
        metrics: {
          scans,
          ratings,
          aiGenerations,
          selectedReviews,
          copies,
          googleClicks,
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error("[admin/analytics GET]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not load analytics.",
        code: "ANALYTICS_QUERY_FAILED",
      },
      { status: 500 }
    );
  }
}
