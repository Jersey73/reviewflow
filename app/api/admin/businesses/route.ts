export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api";

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

export async function GET() {
  const auth = await requireAdminApi();

  if (!auth.supabase) {
    return adminError(
      auth.status,
      auth.errorMessage || "Admin access required.",
      auth.errorCode || "ADMIN_AUTH_FAILED"
    );
  }

  if (auth.authorizedBusinessIds.length === 0) {
    return NextResponse.json({ businesses: [] });
  }

  const { data, error } = await auth.supabase
    .from("businesses")
    .select(
      "id,name,slug,logo_url,google_review_url,description,keywords,status,created_at"
    )
    .in("id", auth.authorizedBusinessIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/businesses GET] listing failed:", error);
    return NextResponse.json(
      { error: "Could not load businesses.", code: "BUSINESS_LIST_FAILED" },
      { status: 500 }
    );
  }

  return NextResponse.json({ businesses: data || [] });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();

  if (!auth.supabase || !auth.user) {
    return adminError(
      auth.status,
      auth.errorMessage || "Admin access required.",
      auth.errorCode || "ADMIN_AUTH_FAILED"
    );
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    let name = "";
    let slug = "";
    let logoUrl = "";
    let googleReviewUrl = "";
    let description = "";
    let keywords: string[] = [];
    let logoFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      name = String(form.get("name") || "").trim();
      slug = normalizeSlug(String(form.get("slug") || name));
      logoUrl = String(form.get("logoUrl") || "").trim();
      googleReviewUrl = String(form.get("googleReviewUrl") || "").trim();
      description = String(form.get("description") || "").trim();
      keywords = normalizeKeywords(form.get("keywords"));
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
    }

    if (!name) {
      return NextResponse.json({ error: "Business name is required.", code: "MISSING_BUSINESS_NAME" }, { status: 400 });
    }

    if (!slug || slug.length < 2 || slug.length > 80) {
      return NextResponse.json(
        { error: "Slug must be 2–80 characters and contain letters, numbers, and hyphens.", code: "INVALID_SLUG" },
        { status: 400 }
      );
    }

    if (!googleReviewUrl) {
      return NextResponse.json(
        { error: "Google review URL is required.", code: "MISSING_GOOGLE_REVIEW_URL" },
        { status: 400 }
      );
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
        return NextResponse.json({ error: "Uploaded logo must be an image file.", code: "INVALID_LOGO" }, { status: 400 });
      }
      if (logoFile.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Logo file must be 5 MB or smaller.", code: "LOGO_TOO_LARGE" }, { status: 400 });
      }
    }

    const { data: existingSlug, error: slugLookupError } = await auth.supabase
      .from("businesses")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (slugLookupError) {
      return NextResponse.json(
        { error: `Slug validation failed: ${slugLookupError.message}`, code: "SLUG_LOOKUP_FAILED" },
        { status: 500 }
      );
    }

    if (existingSlug) {
      return NextResponse.json(
        { error: `The slug "${slug}" is already in use.`, code: "SLUG_CONFLICT" },
        { status: 409 }
      );
    }

    let finalLogoUrl = logoUrl || null;

    if (logoFile) {
      const safeExt =
        logoFile.type === "image/png" ? "png" :
        logoFile.type === "image/webp" ? "webp" :
        logoFile.type === "image/svg+xml" ? "svg" : "jpg";
      const filePath = `${slug}/${crypto.randomUUID()}.${safeExt}`;
      const arrayBuffer = await logoFile.arrayBuffer();

      const { error: uploadError } = await auth.supabase.storage
        .from("business-logos")
        .upload(filePath, arrayBuffer, { contentType: logoFile.type, upsert: false });

      if (uploadError) {
        return NextResponse.json({ error: `Logo upload failed: ${uploadError.message}`, code: "LOGO_UPLOAD_FAILED" }, { status: 500 });
      }

      const { data: publicData } = auth.supabase.storage
        .from("business-logos")
        .getPublicUrl(filePath);
      finalLogoUrl = publicData.publicUrl;
    }

    const { data, error } = await auth.supabase
      .from("businesses")
      .insert({
        name,
        slug,
        logo_url: finalLogoUrl,
        google_review_url: googleReviewUrl,
        description: description || null,
        keywords,
        status: "active",
      })
      .select(
        "id,name,slug,logo_url,google_review_url,description,keywords,status,created_at"
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `The slug "${slug}" is already in use.`, code: "SLUG_CONFLICT" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: `Business creation failed: ${error.message}`, code: "BUSINESS_CREATE_FAILED" },
        { status: 500 }
      );
    }

    // New businesses are automatically assigned to their creator.
    const { error: assignmentError } = await auth.supabase
      .from("admin_businesses")
      .insert({ admin_user_id: auth.user.id, business_id: data.id });

    if (assignmentError) {
      console.error("[admin/businesses POST] authorization assignment failed:", assignmentError);
      await auth.supabase.from("businesses").delete().eq("id", data.id);
      return NextResponse.json(
        { error: "Business was created but authorization setup failed. The creation was rolled back.", code: "BUSINESS_AUTH_ASSIGNMENT_FAILED" },
        { status: 500 }
      );
    }

    return NextResponse.json({ business: data }, { status: 201 });
  } catch (error) {
    console.error("[admin/businesses POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create business.", code: "BUSINESS_CREATE_UNEXPECTED_ERROR" },
      { status: 500 }
    );
  }
}
