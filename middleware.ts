import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  // Login and forbidden pages must remain reachable without an active admin session.
  if (pathname === "/admin/login" || pathname === "/admin/forbidden") {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return NextResponse.json(
      { error: "Admin authentication is unavailable because server configuration is incomplete." },
      { status: 500 }
    );
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

        response = NextResponse.next({
          request: { headers: request.headers },
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const { data: admin, error: adminError } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError) {
    return NextResponse.json(
      { error: "Could not verify admin authorization." },
      { status: 500 }
    );
  }

  if (!admin) {
    const forbiddenUrl = request.nextUrl.clone();
    forbiddenUrl.pathname = "/admin/forbidden";
    forbiddenUrl.search = "";
    return NextResponse.redirect(forbiddenUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
