import { createClient } from "@supabase/supabase-js";
import type { Business } from "@/lib/types";
import { isBusinessSlug } from "@/lib/public-security";

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  const normalizedSlug = slug.trim().toLowerCase();

  // Reject malformed slugs before touching the database.
  if (!isBusinessSlug(normalizedSlug)) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase configuration is missing.");
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("businesses")
    .select("id,name,slug,logo_url,google_review_url,description,keywords")
    .eq("slug", normalizedSlug)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data as Business | null;
}
