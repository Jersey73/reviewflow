"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AdminAnalytics from "@/components/AdminAnalytics";

type Business = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  google_review_url: string;
  description: string | null;
  keywords: string[];
  status: "active" | "paused";
  created_at: string;
};

type FormState = {
  name: string;
  slug: string;
  logoUrl: string;
  googleReviewUrl: string;
  description: string;
  keywords: string;
  status: "active" | "paused";
};

const emptyForm: FormState = {
  name: "",
  slug: "",
  logoUrl: "",
  googleReviewUrl: "",
  description: "",
  keywords: "",
  status: "active",
};

export default function AdminDashboard({
  adminEmail,
}: {
  adminEmail: string;
}) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Business | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  async function loadBusinesses() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/businesses", {
        cache: "no-store",
      });

      const data = await response.json();

      if (response.status === 401) {
        window.location.href = "/admin/login?next=%2Fadmin";
        return;
      }

      if (response.status === 403) {
        window.location.href = "/admin/forbidden";
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "Could not load businesses.");
      }

      setBusinesses(data.businesses || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load businesses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBusinesses();
  }, []);

  const filtered = useMemo(
    () =>
      businesses.filter((business) =>
        `${business.name} ${business.slug}`
          .toLowerCase()
          .includes(query.toLowerCase())
      ),
    [businesses, query]
  );

  const activeCount = businesses.filter((b) => b.status === "active").length;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setLogoFile(null);
    setError("");
    setShowForm(true);
  }

  function openEdit(business: Business) {
    setEditing(business);
    setForm({
      name: business.name,
      slug: business.slug,
      logoUrl: business.logo_url || "",
      googleReviewUrl: business.google_review_url,
      description: business.description || "",
      keywords: business.keywords.join(", "),
      status: business.status,
    });
    setLogoFile(null);
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setEditing(null);
    setLogoFile(null);
    setForm(emptyForm);
  }

  async function saveBusiness(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const formData = new FormData();
    formData.append("name", form.name);
    formData.append("slug", form.slug);
    formData.append("logoUrl", form.logoUrl);
    formData.append("googleReviewUrl", form.googleReviewUrl);
    formData.append("description", form.description);
    formData.append("keywords", form.keywords);

    if (logoFile) {
      formData.append("logoFile", logoFile);
    }

    try {
      const endpoint = editing
        ? `/api/admin/businesses/${editing.id}`
        : "/api/admin/businesses";

      const response = await fetch(endpoint, {
        method: editing ? "PATCH" : "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save business.");
      }

      await loadBusinesses();
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save business.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePause(business: Business) {
    setError("");

    try {
      const response = await fetch(
        `/api/admin/businesses/${business.id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: business.status === "active" ? "paused" : "active",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not change business status.");
      }

      setBusinesses((current) =>
        current.map((item) =>
          item.id === business.id
            ? { ...item, status: data.business.status }
            : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change status.");
    }
  }

  async function deleteBusiness(business: Business) {
    if (
      !window.confirm(
        `Delete ${business.name}? This will also delete related feedback and analytics because of the database cascade.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/businesses/${business.id}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not delete business.");
      }

      setBusinesses((current) =>
        current.filter((item) => item.id !== business.id)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete business.");
    }
  }

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/admin/login";
  }

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <p className="eyebrow">REVIEWFLOW</p>
        <h2>Admin</h2>

        <div className="admin-user">
          <span className="muted">Signed in as</span>
          <strong>{adminEmail}</strong>
        </div>

        <nav>
          <a href="#overview">Overview</a>
          <a href="#businesses">Businesses</a>
          <a href="/admin/qr">QR Generator</a>
        </nav>

        <button className="button secondary full logout-button" onClick={logout}>
          Sign out
        </button>
      </aside>

      <section className="dashboard">
        <div className="dash-head">
          <div>
            <p className="eyebrow">CONTROL PANEL</p>
            <h1>Businesses</h1>
            <p className="muted">
              Manage live customer destinations and business branding.
            </p>
          </div>

          <button className="button primary" onClick={openCreate}>
            + Add business
          </button>
        </div>

        {error && <div className="error-box">{error}</div>}

        <AdminAnalytics businesses={businesses} />

        <div className="panel business-summary-panel">
          <div className="business-summary-grid">
            <div className="metric compact-metric">
              <span className="muted">Total businesses</span>
              <strong>{businesses.length}</strong>
            </div>
            <div className="metric compact-metric">
              <span className="muted">Active</span>
              <strong>{activeCount}</strong>
            </div>
            <div className="metric compact-metric">
              <span className="muted">Paused</span>
              <strong>{businesses.length - activeCount}</strong>
            </div>
            <div className="business-route-summary">
              <span className="muted">Public route</span>
              <code>/rate/[slug]</code>
            </div>
          </div>
        </div>

        <div className="panel" id="businesses">
          <div className="row-between">
            <div>
              <h3>Business directory</h3>
              <p className="muted">
                {loading ? "Loading…" : `${businesses.length} business${businesses.length === 1 ? "" : "es"}`}
              </p>
            </div>

            <input
              className="input compact"
              placeholder="Search name or slug…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Public route</th>
                  <th>Status</th>
                  <th>Google</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((business) => (
                  <tr key={business.id}>
                    <td>
                      <div className="business-cell">
                        {business.logo_url ? (
                          <Image
                            src={business.logo_url}
                            alt=""
                            className="table-logo"
                            width={42}
                            height={42}
                            unoptimized
                          />
                        ) : (
                          <div className="table-logo-fallback">
                            {business.name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <strong>{business.name}</strong>
                          <div className="muted small">
                            {business.keywords.join(", ") || "No keywords"}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <a
                        href={`/rate/${business.slug}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        /rate/{business.slug}
                      </a>
                    </td>

                    <td>
                      <span
                        className={`status-badge ${business.status}`}
                      >
                        {business.status}
                      </span>
                    </td>

                    <td>
                      <a
                        href={business.google_review_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open
                      </a>
                    </td>

                    <td>
                      <div className="table-actions">
                        <button
                          className="button secondary small-button"
                          onClick={() => openEdit(business)}
                        >
                          Edit
                        </button>

                        <button
                          className="button secondary small-button"
                          onClick={() => togglePause(business)}
                        >
                          {business.status === "active" ? "Pause" : "Activate"}
                        </button>

                        <a
                          className="button secondary small-button"
                          href={`/admin/qr?slug=${encodeURIComponent(business.slug)}`}
                        >
                          QR Code
                        </a>

                        <button
                          className="button danger small-button"
                          onClick={() => deleteBusiness(business)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">
                        {query ? "No matching businesses." : "No businesses yet. Add your first one."}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {showForm && (
        <div className="modal-backdrop" onMouseDown={closeForm}>
          <div
            className="modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="row-between">
              <div>
                <p className="eyebrow">
                  {editing ? "EDIT BUSINESS" : "NEW BUSINESS"}
                </p>
                <h2>{editing ? "Update business" : "Add business"}</h2>
              </div>

              <button
                className="button secondary small-button"
                onClick={closeForm}
                disabled={saving}
              >
                Close
              </button>
            </div>

            <form onSubmit={saveBusiness} className="business-form">
              <label className="label">Business name</label>
              <input
                className="input"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Velora Unisex Salon"
                required
              />

              <label className="label">Slug</label>
              <input
                className="input"
                value={form.slug}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    slug: event.target.value,
                  }))
                }
                placeholder="velora-unisex-salon"
                required
              />
              <p className="muted small">
                Public URL: /rate/{form.slug || "your-slug"}
              </p>

              <label className="label">Google review URL</label>
              <input
                className="input"
                type="url"
                value={form.googleReviewUrl}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    googleReviewUrl: event.target.value,
                  }))
                }
                placeholder="https://..."
                required
              />

              <label className="label">Logo URL (optional)</label>
              <input
                className="input"
                type="url"
                value={form.logoUrl}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    logoUrl: event.target.value,
                  }))
                }
                placeholder="https://..."
              />

              <label className="label">Or upload a logo (max 5 MB)</label>
              <input
                className="input"
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setLogoFile(event.target.files?.[0] || null)
                }
              />

              <label className="label">Description / context</label>
              <textarea
                className="textarea"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="General business context for the customer experience."
              />

              <label className="label">Keywords / context</label>
              <input
                className="input"
                value={form.keywords}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    keywords: event.target.value,
                  }))
                }
                placeholder="haircut, salon, styling, service"
              />

              <button className="button primary full" disabled={saving}>
                {saving
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Create business"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}