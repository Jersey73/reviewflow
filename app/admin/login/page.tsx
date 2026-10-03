import { Suspense } from "react";
import AdminLoginForm from "@/components/AdminLoginForm";

export default function AdminLoginPage() {
  return (
    <main className="center-page">
      <div className="panel auth-panel">
        <p className="eyebrow">REVIEWFLOW</p>
        <h1>Admin login</h1>
        <p className="muted">
          Sign in to manage businesses, QR links, and customer operations.
        </p>
        <Suspense fallback={<div className="muted">Loading login…</div>}>
          <AdminLoginForm />
        </Suspense>
      </div>
    </main>
  );
}
