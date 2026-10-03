import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">REVIEWFLOW</p>
          <h1>Make it easier for real customers to share their experience.</h1>
          <p className="hero-copy">
            A lightweight QR-to-Google review workflow for restaurants and local businesses.
          </p>
          <div className="actions">
            <Link className="button primary" href="/rate/mandi-house">Open customer demo</Link>
            <Link className="button secondary" href="/admin">Open admin demo</Link>
          </div>
        </div>
        <div className="hero-card">
          <div className="stat-label">Demo business</div>
          <div className="stat-value">Mandi House</div>
          <div className="muted">/rate/mandi-house</div>
        </div>
      </section>
    </main>
  );
}