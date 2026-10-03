export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { hasBusinessAccess, isUuid, requireAdminApi } from "@/lib/admin-api";

function adminError(status: number, message: string, code: string) {
  return NextResponse.json({ error: message, code }, { status });
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeKeywords(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30);
  }

  return [];
}

async function getAuthorizedBusinessContext(id: string) {
  const auth = await requireAdminApi();

  if (!auth.supabase || !auth.user) {
    return { auth, response: adminError(auth.status, auth.errorMessage || "Admin access required.", auth.errorCode || "ADMIN_AUTH_FAILED") };
  }

  if (!isUuid(id)) {
    return { auth, response: adminError(400, "Business ID is invalid.", "INVALID_BUSINESS_ID") };
  }

  if (!hasBusinessAccess(auth.authorizedBusinessIds, id)) {
    return { auth, response: adminError(403, "Forbidden: you are not authorized to manage this business.", "BUSINESS_FORBIDDEN") };
  }

  return { auth, response: null };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const context = await getAuthorizedBusinessContext(id);
  if (context.response) return context.response;
  const { supabase } = context.auth;

  try {
    const contentType = request.headers.get("content-type") || "";
    let name = "";
    let slug = "";
    let logoUrl = "";
    let googleReviewUrl = "";
    let description = "";
    let keywords: string[] = [];
    let logoFile: File | null = null;
    let removeLogo = false;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      name = String(form.get("name") || "").trim();
      slug = normalizeSlug(String(form.get("slug") || name));
      logoUrl = String(form.get("logoUrl") || "").trim();
      googleReviewUrl = String(form.get("googleReviewUrl") || "").trim();
      description = String(form.get("description") || "").trim();
      keywords = normalizeKeywords(form.get("keywords"));
      removeLogo = String(form.get("removeLogo") || "") === "true";

      const candidate = form.get("logoFile");
      if (candidate instanceof File && candidate.size > 0) {
        logoFile = candidate;
      }
    } else {
      const body = await request.json();
      name = String(body.name || "").trim();
      slug = normalizeSlug(String(body.slug || name));
      logoUrl = String(body.logoUrl || "").trim();
      googleReviewUrl = String(body.googleReviewUrl || "").trim();
      description = String(body.description || "").trim();
      keywords = normalizeKeywords(body.keywords);
      removeLogo = Boolean(body.removeLogo);
    }

    if (!name) {
      return NextResponse.json({ error: "Business name is required.", code: "MISSING_BUSINESS_NAME" }, { status: 400 });
    }

    if (!slug || slug.length < 2 || slug.length > 80) {
      return NextResponse.json({ error: "Invalid slug.", code: "INVALID_SLUG" }, { status: 400 });
    }

    if (!googleReviewUrl) {
      return NextResponse.json({ error: "Google review URL is required.", code: "MISSING_GOOGLE_REVIEW_URL" }, { status: 400 });
    }

    try {
      const parsedUrl = new URL(googleReviewUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
    } catch {
      return NextResponse.json(
        { error: "Google review URL must be a valid http(s) URL.", code: "INVALID_GOOGLE_REVIEW_URL" },
        { status: 400 }
      );
    }

    if (logoFile) {
      if (!logoFile.type.startsWith("image/")) {
        return NextResponse.json({ error: "Uploaded logo must be an image.", code: "INVALID_LOGO" }, { status: 400 });
      }
      if (logoFile.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Logo file must be 5 MB or smaller.", code: "LOGO_TOO_LARGE" }, { status: 400 });
      }
    }

    const { data: current, error: currentError } = await supabase!
      .from("businesses")
      .select("id,logo_url")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      return NextResponse.json({ error: `Business lookup failed: ${currentError.message}`, code: "BUSINESS_LOOKUP_FAILED" }, { status: 500 });
    }

    if (!current) {
      return NextResponse.json({ error: "Business not found.", code: "BUSINESS_NOT_FOUND" }, { status: 404 });
    }

    const { data: duplicate, error: duplicateError } = await supabase!
      .from("businesses")
      .select("id")
      .eq("slug", slug)
      .neq("id", id)
      .maybeSingle();

    if (duplicateError) {
      return NextResponse.json({ error: `Slug validation failed: ${duplicateError.message}`, code: "SLUG_LOOKUP_FAILED" }, { status: 500 });
    }

    if (duplicate) {
      return NextResponse.json({ error: `The slug "${slug}" is already in use.`, code: "SLUG_CONFLICT" }, { status: 409 });
    }

    let finalLogoUrl = logoUrl || (removeLogo ? null : current.logo_url);

    if (logoFile) {
      const safeExt =
        logoFile.type === "image/png" ? "png" :
        logoFile.type === "image/webp" ? "webp" :
        logoFile.type === "image/svg+xml" ? "svg" : "jpg";
      const filePath = `${slug}/${crypto.randomUUID()}.${safeExt}`;
      const arrayBuffer = await logoFile.arrayBuffer();

      const { error: uploadError } = await supabase!.storage
        .from("business-logos")
        .upload(filePath, arrayBuffer, { contentType: logoFile.type, upsert: false });

      if (uploadError) {
        return NextResponse.json({ error: `Logo upload failed: ${uploadError.message}`, code: "LOGO_UPLOAD_FAILED" }, { status: 500 });
      }

      const { data: publicData } = supabase!.storage
        .from("business-logos")
        .getPublicUrl(filePath);
      finalLogoUrl = publicData.publicUrl;
    }

    const { data, error } = await supabase!
      .from("businesses")
      .update({
        name,
        slug,
        logo_url: finalLogoUrl,
        google_review_url: googleReviewUrl,
        description: description || null,
        keywords,
      })
      .eq("id", id)
      .select("id,name,slug,logo_url,google_review_url,description,keywords,status,created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: `The slug "${slug}" is already in use.`, code: "SLUG_CONFLICT" }, { status: 409 });
      }
      return NextResponse.json({ error: `Business update failed: ${error.message}`, code: "BUSINESS_UPDATE_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ business: data });
  } catch (error) {
    console.error("[admin/businesses PATCH]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update business.", code: "BUSINESS_UPDATE_UNEXPECTED_ERROR" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const context = await getAuthorizedBusinessContext(id);
  if (context.response) return context.response;
  const { supabase } = context.auth;

  const { error } = await supabase!
    .from("businesses")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: `Business deletion failed: ${error.message}`, code: "BUSINESS_DELETE_FAILED" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const context = await getAuthorizedBusinessContext(id);
  if (context.response) return context.response;
  const { supabase } = context.auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request.", code: "INVALID_JSON" }, { status: 400 });
  }

  const nextStatus =
    body &&
    typeof body === "object" &&
    "status" in body &&
    ((body as { status?: unknown }).status === "active" ||
      (body as { status?: unknown }).status === "paused")
      ? (body as { status: "active" | "paused" }).status
      : null;

  if (!nextStatus) {
    return NextResponse.json({ error: "status must be active or paused.", code: "INVALID_STATUS" }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("businesses")
    .update({ status: nextStatus })
    .eq("id", id)
    .select("id,status")
    .single();

  if (error) {
    return NextResponse.json({ error: `Status update failed: ${error.message}`, code: "BUSINESS_STATUS_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ business: data });
}
