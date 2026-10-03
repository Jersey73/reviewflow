"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

type Business = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  status: "active" | "paused";
};

export default function QRPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrSvg, setQrSvg] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadBusinesses() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/admin/businesses", {
          cache: "no-store",
        });

        const data = await response.json();

        if (response.status === 401) {
          window.location.href = "/admin/login?next=%2Fadmin%2Fqr";
          return;
        }

        if (response.status === 403) {
          window.location.href = "/admin/forbidden";
          return;
        }

        if (!response.ok) {
          throw new Error(data.error || "Could not load businesses.");
        }

        const items = Array.isArray(data.businesses)
          ? data.businesses
          : [];

        setBusinesses(items);

        const querySlug =
          new URLSearchParams(window.location.search).get("slug");

        const fromSlug = querySlug
          ? items.find((item: Business) => item.slug === querySlug)
          : null;

        const firstActive =
          items.find((item: Business) => item.status === "active");

        setSelectedId(
          fromSlug?.id ||
            firstActive?.id ||
            items[0]?.id ||
            ""
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load businesses."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadBusinesses();
  }, []);

  const selectedBusiness = useMemo(
    () =>
      businesses.find(
        (business) => business.id === selectedId
      ) || null,
    [businesses, selectedId]
  );

  const targetUrl = useMemo(() => {
    if (!selectedBusiness || typeof window === "undefined") {
      return "";
    }

    // IMPORTANT: QR contains ONLY our public ReviewFlow route.
    // Prefer the configured production URL so printable QRs never accidentally
    // encode a Vercel preview or localhost URL.
    const configuredBase = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");

    if (configuredBase) {
      try {
        const parsed = new URL(configuredBase);
        const allowed =
          parsed.protocol === "https:" ||
          (parsed.protocol === "http:" &&
            (parsed.hostname === "localhost" ||
              parsed.hostname === "127.0.0.1"));

        if (allowed) {
          return `${parsed.origin}/rate/${selectedBusiness.slug}`;
        }
      } catch {
        // Fall back to the current origin below if the env value is malformed.
      }
    }

    return `${window.location.origin}/rate/${selectedBusiness.slug}`;
  }, [selectedBusiness]);

  useEffect(() => {
    let cancelled = false;

    async function generate() {
      if (!targetUrl) {
        setQrDataUrl("");
        setQrSvg("");
        return;
      }

      setGenerating(true);
      setError("");

      try {
        const [dataUrl, svg] = await Promise.all([
          QRCode.toDataURL(targetUrl, {
            width: 1200,
            margin: 4,
            errorCorrectionLevel: "H",
            type: "image/png",
          }),
          QRCode.toString(targetUrl, {
            type: "svg",
            width: 12,
            margin: 4,
            errorCorrectionLevel: "H",
          }),
        ]);

        if (!cancelled) {
          setQrDataUrl(dataUrl);
          setQrSvg(svg);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not generate QR code."
          );
          setQrDataUrl("");
          setQrSvg("");
        }
      } finally {
        if (!cancelled) {
          setGenerating(false);
        }
      }
    }

    void generate();

    return () => {
      cancelled = true;
    };
  }, [targetUrl]);

  function downloadPng() {
    if (!qrDataUrl || !selectedBusiness) return;

    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `${selectedBusiness.slug}-reviewflow-qr.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function downloadSvg() {
    if (!qrSvg || !selectedBusiness) return;

    const blob = new Blob([qrSvg], {
      type: "image/svg+xml;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedBusiness.slug}-reviewflow-qr.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function printQr() {
    window.print();
  }

  return (
    <main className="center-page">
      <div className="panel qr-panel">
        <p className="eyebrow">QR GENERATOR</p>
        <h1>Business QR code</h1>

        <p className="muted">
          Generate a print-ready QR that points to the business&apos;s
          ReviewFlow page.
        </p>

        <label className="label" htmlFor="business-select">
          Business
        </label>

        <select
          id="business-select"
          className="input"
          value={selectedId}
          onChange={(event) =>
            setSelectedId(event.target.value)
          }
          disabled={loading || businesses.length === 0}
        >
          {businesses.map((business) => (
            <option
              key={business.id}
              value={business.id}
            >
              {business.name}
              {business.status === "paused"
                ? " (paused)"
                : ""}
            </option>
          ))}
        </select>

        {loading && (
          <p className="muted">Loading businesses…</p>
        )}

        {error && (
          <div className="error-box">{error}</div>
        )}

        {selectedBusiness && (
          <>
            <div className="qr-business-summary">
              <div>
                <span className="muted small">
                  Business
                </span>
                <strong>{selectedBusiness.name}</strong>
              </div>

              <div>
                <span className="muted small">
                  Target URL
                </span>
                <code className="qr-target-url">
                  {targetUrl}
                </code>
              </div>
            </div>

            <div className="qr-preview" id="print-qr">
              {generating ? (
                <div className="qr-loading">
                  Generating…
                </div>
              ) : qrDataUrl ? (
                <>
                  <Image
                    className="qr-image"
                    src={qrDataUrl}
                    alt={`ReviewFlow QR code for ${selectedBusiness.name}`}
                    width={390}
                    height={390}
                    unoptimized
                  />
                  <strong>{selectedBusiness.name}</strong>
                  <span className="muted">
                    Scan to open ReviewFlow
                  </span>
                </>
              ) : (
                <div className="qr-loading">
                  QR unavailable
                </div>
              )}
            </div>

            <div className="qr-actions">
              <button
                className="button primary"
                onClick={downloadPng}
                disabled={!qrDataUrl || generating}
              >
                Download PNG
              </button>

              <button
                className="button secondary"
                onClick={downloadSvg}
                disabled={!qrSvg || generating}
              >
                Download SVG
              </button>

              <button
                className="button secondary"
                onClick={printQr}
                disabled={!qrDataUrl || generating}
              >
                Print
              </button>
            </div>

            <p className="muted small center">
              The QR stores only the public ReviewFlow URL. No
              customer data, session IDs, or Google URL is encoded.
            </p>
          </>
        )}

        {!loading && businesses.length === 0 && !error && (
          <div className="empty-state">
            Create a business first, then generate its QR code.
          </div>
        )}
      </div>
    </main>
  );
}