"use client";

import { useEffect, useState } from "react";

type BusinessOption = {
  id: string;
  name: string;
  status: "active" | "paused";
};

type Metrics = {
  scans: number;
  ratings: number;
  aiGenerations: number;
  selectedReviews: number;
  copies: number;
  googleClicks: number;
};

type AnalyticsResponse = {
  range?: {
    days: number;
    start: string;
    end: string;
  };
  metrics?: Metrics;
  error?: string;
};

const emptyMetrics: Metrics = {
  scans: 0,
  ratings: 0,
  aiGenerations: 0,
  selectedReviews: 0,
  copies: 0,
  googleClicks: 0,
};

const metricCards: Array<{ key: keyof Metrics; label: string; helper: string }> = [
  { key: "scans", label: "Total scans", helper: "QR /rate visits" },
  { key: "ratings", label: "Ratings", helper: "Star selections" },
  { key: "aiGenerations", label: "AI generations", helper: "Review sets generated" },
  { key: "selectedReviews", label: "Selected reviews", helper: "Draft selections" },
  { key: "copies", label: "Copies", helper: "Reviews copied" },
  { key: "googleClicks", label: "Google clicks", helper: "Continue-to-Google actions" },
];

export default function AdminAnalytics({
  businesses,
}: {
  businesses: BusinessOption[];
}) {
  const [days, setDays] = useState<7 | 30>(7);
  const [businessId, setBusinessId] = useState("all");
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadAnalytics() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          days: String(days),
          businessId,
        });

        const response = await fetch(
          `/api/admin/analytics?${params.toString()}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const data: AnalyticsResponse = await response.json();

        if (response.status === 401) {
          window.location.href = "/admin/login?next=%2Fadmin";
          return;
        }

        if (response.status === 403) {
          window.location.href = "/admin/forbidden";
          return;
        }

        if (!response.ok) {
          throw new Error(data.error || "Could not load analytics.");
        }

        setMetrics({
          ...emptyMetrics,
          ...(data.metrics || {}),
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Could not load analytics."
        );
        setMetrics(emptyMetrics);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadAnalytics();

    return () => controller.abort();
  }, [businessId, days]);

  const selectedBusiness =
    businessId === "all"
      ? null
      : businesses.find((business) => business.id === businessId);

  return (
    <section className="analytics-section" id="overview">
      <div className="panel analytics-panel">
        <div className="analytics-header">
          <div>
            <p className="eyebrow">LIVE ANALYTICS</p>
            <h2>Review performance</h2>
            <p className="muted">
              {selectedBusiness
                ? `Showing ${selectedBusiness.name}`
                : "Showing all businesses"}
              {" · "}
              Last {days} days
            </p>
          </div>

          <div className="analytics-filters">
            <label className="filter-control">
              <span className="label">Business</span>
              <select
                className="input"
                value={businessId}
                onChange={(event) => setBusinessId(event.target.value)}
              >
                <option value="all">All businesses</option>
                {businesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
                    {business.status === "paused" ? " (paused)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="filter-control">
              <span className="label">Date range</span>
              <div className="filter-buttons" role="group" aria-label="Date range">
                <button
                  className={`filter-button ${days === 7 ? "active" : ""}`}
                  onClick={() => setDays(7)}
                  type="button"
                >
                  7 days
                </button>
                <button
                  className={`filter-button ${days === 30 ? "active" : ""}`}
                  onClick={() => setDays(30)}
                  type="button"
                >
                  30 days
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="error-box analytics-error">{error}</div>}

        <div className={`analytics-grid ${loading ? "is-loading" : ""}`}>
          {metricCards.map((metric) => (
            <div className="metric analytics-metric" key={metric.key}>
              <span className="muted">{metric.label}</span>
              <strong>{loading ? "…" : metrics[metric.key].toLocaleString()}</strong>
              <span className="metric-helper">{metric.helper}</span>
            </div>
          ))}
        </div>

        <p className="analytics-note muted small">
          Analytics counts are aggregated server-side from ReviewFlow events. No
          private customer review text is returned to this dashboard endpoint.
        </p>
      </div>
    </section>
  );
}
