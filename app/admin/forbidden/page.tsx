import Link from "next/link";

export default function AdminForbiddenPage() {
  return (
    <main className="center-page">
      <div className="panel auth-panel">
        <p className="eyebrow">REVIEWFLOW</p>
        <h1>Access forbidden</h1>
        <p className="muted">
          This account is authenticated, but it is not authorized to access the
          ReviewFlow admin control panel.
        </p>
        <Link className="button secondary full" href="/admin/login">
          Back to admin login
        </Link>
      </div>
    </main>
  );
}
