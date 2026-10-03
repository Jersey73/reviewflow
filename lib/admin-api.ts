import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AdminApiResult = {
  user: User | null;
  supabase: SupabaseClient | null;
  status: 200 | 401 | 403 | 500;
  authorizedBusinessIds: string[];
  errorCode?: "UNAUTHENTICATED" | "FORBIDDEN" | "CONFIGURATION_ERROR" | "AUTHORIZATION_LOOKUP_FAILED";
  errorMessage?: string;
};

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function requireAdminApi(): Promise<AdminApiResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Fail closed if server configuration is incomplete.
  if (!url || !publishableKey || !serviceRoleKey) {
    return {
      user: null,
      supabase: null,
      status: 500,
      authorizedBusinessIds: [],
      errorCode: "CONFIGURATION_ERROR",
      errorMessage: "Admin server configuration is incomplete.",
    };
  }

  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return {
      user: null,
      supabase: null,
      status: 401,
      authorizedBusinessIds: [],
      errorCode: "UNAUTHENTICATED",
      errorMessage: "Authentication required.",
    };
  }

  const { data: admin, error: adminError } = await authClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError) {
    console.error("[admin auth] admin_users lookup failed:", adminError);
    return {
      user,
      supabase: null,
      status: 500,
      authorizedBusinessIds: [],
      errorCode: "AUTHORIZATION_LOOKUP_FAILED",
      errorMessage: "Could not verify admin authorization.",
    };
  }

  if (!admin) {
    return {
      user,
      supabase: null,
      status: 403,
      authorizedBusinessIds: [],
      errorCode: "FORBIDDEN",
      errorMessage: "Forbidden: this account is not a ReviewFlow admin.",
    };
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: assignments, error: assignmentError } = await supabase
    .from("admin_businesses")
    .select("business_id")
    .eq("admin_user_id", user.id);

  if (assignmentError) {
    console.error("[admin auth] business authorization lookup failed:", assignmentError);
    return {
      user,
      supabase: null,
      status: 500,
      authorizedBusinessIds: [],
      errorCode: "AUTHORIZATION_LOOKUP_FAILED",
      errorMessage: "Could not load business authorization.",
    };
  }

  return {
    user,
    supabase,
    status: 200,
    authorizedBusinessIds: (assignments || []).map((row) => row.business_id),
  };
}

export function hasBusinessAccess(
  authorizedBusinessIds: string[],
  businessId: string
) {
  return authorizedBusinessIds.includes(businessId);
}
