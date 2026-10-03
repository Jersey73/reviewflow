import { createHash } from "node:crypto";

// Lightweight MVP limiter: intentionally process-local so no Redis/extra service is required.
// It is effective per running instance; distributed coordination can be added later if needed.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export const RATE_LIMITS = {
  aiGeneration: { limit: 15, windowMs: 10 * 60 * 1000 },
  analyticsEvent: { limit: 60, windowMs: 5 * 60 * 1000 },
  sessionCreate: { limit: 10, windowMs: 10 * 60 * 1000 },
  feedbackCreate: { limit: 10, windowMs: 10 * 60 * 1000 },
  feedbackUpdate: { limit: 30, windowMs: 10 * 60 * 1000 },
} as const;

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isBusinessSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length >= 2 && value.length <= 80;
}

function getClientIp(request: Request) {
  // On Vercel, x-vercel-forwarded-for is the platform-provided client IP and
  // x-forwarded-for is overwritten by Vercel to prevent IP spoofing.
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) return vercelForwarded.split(",")[0]?.trim() || "unknown";

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function getCoarseClientKey(request: Request, _sessionId?: string | null) {
  // Never trust a caller-supplied session UUID as the primary rate-limit key.
  // Session IDs are application identifiers, not authenticated identities, and
  // rotating them would otherwise fragment the limiter.
  const ip = getClientIp(request);
  const digest = createHash("sha256").update(ip).digest("hex").slice(0, 24);
  return `ip:${digest}`;
}

export function consumeRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowMs: number
) {
  const now = Date.now();
  const key = `${scope}:${identifier}`;
  const existing = rateBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    pruneRateBuckets(now);
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

function pruneRateBuckets(now: number) {
  if (rateBuckets.size < 5000) return;

  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please try again later.",
      code: "RATE_LIMITED",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function readJsonBody<T>(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, error: "Content-Type must be application/json." };
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const length = Number(declaredLength);
    if (!Number.isFinite(length) || length < 0) {
      return { ok: false, error: "Invalid Content-Length header." };
    }
    if (length > maxBytes) {
      return { ok: false, error: `Request body must be ${maxBytes} bytes or smaller.` };
    }
  }

  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    return { ok: false, error: `Request body must be ${maxBytes} bytes or smaller.` };
  }

  const text = new TextDecoder().decode(buffer);

  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, error: "Invalid JSON request body." };
  }
}

export function logServerError(scope: string, error: unknown) {
  // Intentionally logs only the route scope + error message. Never log request
  // bodies, Authorization headers, cookies, API keys, or customer text.
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${scope}] ${message}`);
}

export function boundedString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
