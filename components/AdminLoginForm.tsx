"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createSupabaseBrowserClient();

    const { data, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    if (signInError || !data.user) {
      setError(signInError?.message || "Unable to sign in.");
      setLoading(false);
      return;
    }

    // Middleware checks admin_users before allowing /admin.
    // Only allow same-origin application paths; never trust an external URL
    // supplied in the login query string.
    const requestedNext = searchParams.get("next") || "/admin";
    const safeNext =
      requestedNext.startsWith("/") && !requestedNext.startsWith("//")
        ? requestedNext
        : "/admin";
    router.replace(safeNext);
    router.refresh();
  }

  return (
    <form onSubmit={login} className="auth-form">
      {searchParams.get("error") === "not_admin" && (
        <div className="error-box">
          This account is authenticated but is not registered as a ReviewFlow admin.
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      <label className="label" htmlFor="email">Email</label>
      <input
        id="email"
        className="input"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <label className="label" htmlFor="password">Password</label>
      <input
        id="password"
        className="input"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />

      <button className="button primary full" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}