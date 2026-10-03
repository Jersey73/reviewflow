import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Supabase server configuration is missing.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server components cannot always mutate cookies.
          // Middleware handles token refresh.
        }
      },
    },
  });
}

export async function getAdminAuthState() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { user: null, status: 401 as const };
  }

  const { data: admin, error: adminError } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError) {
    console.error("[admin page auth] admin_users lookup failed:", adminError);
    throw new Error("Could not verify admin authorization.");
  }

  if (!admin) {
    return { user, status: 403 as const };
  }

  return { user, status: 200 as const };
}

export async function requireAdminPage() {
  const state = await getAdminAuthState();

  if (state.status === 401) {
    redirect("/admin/login");
  }

  if (state.status === 403) {
    redirect("/admin/forbidden");
  }

  return state.user;
}

export async function requireAdminUser() {
  const state = await getAdminAuthState();
  return state.status === 200 ? state.user : null;
}
