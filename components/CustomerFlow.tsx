"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

type Business = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  google_review_url: string;
  description?: string | null;
  keywords?: string[] | null;
};

type GeneratorResponse = {
  reviews?: unknown;
  error?: string;
  warning?: string;
  demo?: boolean;
};

const stars = [1, 2, 3, 4, 5];

function track(
  businessId: string,
  eventType: string,
  sessionId: string | null,
  metadata: Record<string, unknown> = {}
) {
  void fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessId,
      eventType,
      sessionId,
      metadata,
    }),
    keepalive: true,
  }).catch(() => {
    // Analytics must never interrupt the customer flow.
  });
}

export default function CustomerFlow({
  business,
}: {
  business: Business;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [step, setStep] = useState<
    "rate" | "generating" | "reviews" | "done"
  >("rate");

  const [drafts, setDrafts] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [clipboardBlocked, setClipboardBlocked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [copying, setCopying] = useState(false);

  // Refs make the customer journey safe against rapid repeated taps and
  // React dev-mode effect replays.
  const generatingRef = useRef(false);
  const redirectingRef = useRef(false);
  const copyingRef = useRef(false);
  const sessionPromiseRef = useRef<Promise<string | null> | null>(null);
  const feedbackPromiseRef = useRef<Promise<string | null> | null>(null);
  const journeyIdRef = useRef<string | null>(null);
  const feedbackUpdateChainRef = useRef(Promise.resolve());

  const selectedText = useMemo(
    () => drafts[selected] ?? "",
    [drafts, selected]
  );

  // Create at most one session request for this mounted journey. This avoids
  // duplicate sessions in React Strict Mode and gives later background writes
  // a single promise they can await if the session is still being created.
  useEffect(() => {
    if (sessionPromiseRef.current) return;

    sessionPromiseRef.current = (async () => {
      try {
        const response = await fetch("/api/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            businessId: business.id,
            userAgent: navigator.userAgent,
          }),
          cache: "no-store",
        });

        if (!response.ok) return null;

        const data = await response.json().catch(() => ({}));
        const createdSessionId =
          typeof data.sessionId === "string" ? data.sessionId : null;

        if (!createdSessionId) return null;

        setSessionId(createdSessionId);
        track(business.id, "scan", createdSessionId, {
          slug: business.slug,
        });

        return createdSessionId;
      } catch {
        // Session creation is optional and must never block the customer.
        return null;
      }
    })();
  }, [business.id, business.slug]);

  function getJourneyId() {
    if (!journeyIdRef.current) {
      journeyIdRef.current = crypto.randomUUID();
    }
    return journeyIdRef.current;
  }

  async function getBestSessionId() {
    if (sessionId) return sessionId;
    return (await sessionPromiseRef.current) ?? null;
  }

  async function createFeedbackRecord(
    selectedRating: number,
    reviews: string[]
  ): Promise<string | null> {
    const currentSessionId = await getBestSessionId();
    const idempotencyKey = getJourneyId();
    try {
      const response = await fetch(
        "/api/feedback",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            businessId: business.id,
            sessionId: currentSessionId,
            idempotencyKey,
            rating: selectedRating,
            aiReviews: reviews,
          }),
          keepalive: true,
        }
      );

      const data = await response.json().catch(
        () => ({})
      );

      if (!response.ok || !data.feedbackId) {
        console.warn(
          "Feedback record could not be created:",
          data.error || response.status
        );
        return null;
      }

      return String(data.feedbackId);
    } catch (error) {
      console.warn(
        "Feedback record could not be created:",
        error
      );
      return null;
    }
  }

  function updateFeedbackInBackground(
    action:
      | "selected"
      | "copied"
      | "google_clicked",
    payload: Record<string, unknown> = {}
  ) {
    const feedbackPromise =
      feedbackPromiseRef.current;

    if (!feedbackPromise) {
      return;
    }

    // Serialize enrichment so a rapid sequence such as select → edit → copy
    // cannot leave the database with an older update that arrives last.
    feedbackUpdateChainRef.current = feedbackUpdateChainRef.current
      .then(async () => {
        const feedbackId = await feedbackPromise;
        if (!feedbackId) return;

        try {
          await fetch("/api/feedback/update", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              feedbackId,
              businessId: business.id,
              sessionId,
              action,
              ...payload,
            }),
            keepalive: true,
          });
        } catch {
          // Enrichment must never interrupt the customer.
        }
      })
      .catch(() => {
        // Keep the chain usable after an individual enrichment failure.
      });
  }

  async function generateReviews(
    selectedRating: number
  ) {
    if (generatingRef.current) return;

    generatingRef.current = true;
    setLoading(true);
    setStatus("");
    setRating(selectedRating);
    setStep("generating");

    try {
      track(
        business.id,
        "rating",
        sessionId,
        {
          rating: selectedRating,
        }
      );

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 15000);

      let response: Response;
      try {
        response = await fetch(
          "/api/generate-review",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              businessId: business.id,
              sessionId,
              businessName: business.name,
              rating: selectedRating,
              businessContext: {
                description: business.description ?? "",
                keywords: business.keywords ?? [],
              },
            }),
            signal: controller.signal,
            cache: "no-store",
          }
        );
      } finally {
        window.clearTimeout(timeoutId);
      }

      const raw = await response.text();

      let data: GeneratorResponse = {};

      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(
          `Server returned an unexpected response (${response.status}).`
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Could not generate reviews (${response.status}).`
        );
      }

      const reviews = Array.isArray(
        data.reviews
      )
        ? data.reviews.filter(
            (
              item
            ): item is string =>
              typeof item === "string" &&
              item.trim().length > 0
          )
        : [];

      if (reviews.length !== 3) {
        throw new Error(
          "The generator returned an invalid result. Please try again."
        );
      }

      setDrafts(reviews);
      setSelected(0);
      setStep("reviews");

      // Create exactly ONE feedback record for this journey.
      // The request starts immediately but is never awaited by the UI.
      if (!feedbackPromiseRef.current) {
        feedbackPromiseRef.current =
          createFeedbackRecord(
            selectedRating,
            reviews
          );
      }

      track(
        business.id,
        "feedback",
        sessionId,
        {
          rating: selectedRating,
          mode: "stars_only",
        }
      );

      track(
        business.id,
        "ai_generated",
        sessionId,
        {
          count: 3,
          demo: Boolean(data.demo),
          mode: "stars_only",
        }
      );

      if (data.warning) {
        setStatus(data.warning);
      }
    } catch (error) {
      setStep("rate");
      setDrafts([]);
      setSelected(0);
      setStatus(
        error instanceof DOMException && error.name === "AbortError"
          ? "The connection is taking too long. Please try again."
          : error instanceof Error
            ? error.message
            : "Something went wrong."
      );
    } finally {
      generatingRef.current = false;
      setLoading(false);
    }
  }

  function selectDraft(index: number) {
    setSelected(index);

    track(
      business.id,
      "review_selected",
      sessionId,
      {
        index,
      }
    );

    updateFeedbackInBackground(
      "selected",
      {
        selectedReview:
          drafts[index] ?? "",
        selectedIndex: index,
      }
    );
  }

  async function copyTextWithFallback(text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to the legacy selection-based copy path.
      }
    }

    // Best-effort fallback for older/in-app browsers that block the Async
    // Clipboard API. This still requires a direct user gesture.
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "true");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    helper.style.pointerEvents = "none";
    document.body.appendChild(helper);
    helper.focus();
    helper.select();

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    } finally {
      document.body.removeChild(helper);
    }

    return copied;
  }

  function continueToGoogle() {
    if (redirectingRef.current) return;

    redirectingRef.current = true;
    setRedirecting(true);
    const finalText = selectedText.trim();
    if (finalText) {
      updateFeedbackInBackground("selected", {
        selectedReview: finalText,
        selectedIndex: selected,
      });
    }
    updateFeedbackInBackground("google_clicked");
    track(business.id, "google_clicked", sessionId);
    window.location.assign(business.google_review_url);
  }

  async function copyAndContinue() {
    if (redirectingRef.current || copyingRef.current) return;

    const text = selectedText.trim();

    if (!text) {
      setStatus("Please choose a review first.");
      return;
    }

    copyingRef.current = true;
    setCopying(true);
    setStatus("");
    setClipboardBlocked(false);

    try {
      const copied = await copyTextWithFallback(text);

      if (!copied) {
        setClipboardBlocked(true);
        setEditing(true);
        setStatus(
          "This browser blocked automatic copying. Select the review text, copy it manually, then continue to Google."
        );
        return;
      }

      updateFeedbackInBackground("selected", {
      selectedReview: text,
      selectedIndex: selected,
    });

      track(
        business.id,
        "review_copied",
        sessionId,
        { characterCount: text.length }
      );

      updateFeedbackInBackground("copied");

      setStatus("Review copied. Opening Google…");
      setStep("done");

      // Keep the current user gesture path separate from background Supabase
      // updates. The server endpoints use keepalive; navigation must not wait
      // for analytics or feedback enrichment.
      window.setTimeout(() => {
        continueToGoogle();
      }, 450);
    } finally {
      copyingRef.current = false;
      setCopying(false);
    }
  }

  return (
    <main className="customer-page">
      <div className="customer-card">
        <div className="brand-mark">
          {business.logo_url ? (
            <Image
              src={business.logo_url}
              alt={`${business.name} logo`}
              className="logo"
              width={72}
              height={72}
              unoptimized
            />
          ) : (
            <div className="logo-fallback">
              {business.name
                .slice(0, 1)
                .toUpperCase()}
            </div>
          )}
        </div>

        <p className="eyebrow">
          {business.name}
        </p>

        {step === "rate" && (
          <>
            <h1>
              How was your experience?
            </h1>

            <p className="muted center">
              Tap a star to continue.
            </p>

            <div
              className="stars"
              aria-label="Rating"
            >
              {stars.map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`star ${
                    rating &&
                    star <= rating
                      ? "active"
                      : ""
                  }`}
                  aria-label={`${star} star${
                    star > 1 ? "s" : ""
                  }`}
                  onClick={() =>
                    void generateReviews(
                      star
                    )
                  }
                  disabled={loading}
                >
                  ★
                </button>
              ))}
            </div>
          </>
        )}

        {step === "generating" && (
          <>
            <div className="rating-pill">
              {"★".repeat(
                rating || 0
              )}
              {"☆".repeat(
                5 - (rating || 0)
              )}
            </div>

            <div className="loading-state" aria-busy="true">
              <div
                className="spinner"
                aria-hidden="true"
              />
              <h1>
                Creating your review
              </h1>
              <p className="muted center" aria-live="polite">
                This can take a few seconds…
              </p>
            </div>
          </>
        )}

        {step === "reviews" && (
          <>
            <h1>
              Choose your review draft
            </h1>

            <p className="muted center">
              Choose a draft and edit it
              before copying.
            </p>

            <div className="drafts">
              {drafts.map(
                (
                  draft,
                  index
                ) => (
                  <button
                    key={index}
                    type="button"
                    className={`draft ${
                      index ===
                      selected
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      selectDraft(
                        index
                      )
                    }
                  >
                    <span className="draft-number">
                      {index + 1}
                    </span>

                    <span>
                      {draft}
                    </span>
                  </button>
                )
              )}
            </div>

            {editing ? (
              <textarea
                className="textarea"
                id="review-text"
                aria-label="Selected review text"
                value={
                  drafts[
                    selected
                  ] ?? ""
                }
                onChange={(event) => {
                  const updated =
                    [...drafts];

                  updated[
                    selected
                  ] =
                    event.target.value;

                  setDrafts(
                    updated
                  );
                }}
              />
            ) : (
              <div className="selected-preview">
                {selectedText}
              </div>
            )}

            <div className="actions full">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Done editing" : "Edit review"}
              </button>

              <button
                type="button"
                className="button primary"
                onClick={() => void copyAndContinue()}
                disabled={redirecting || copying}
              >
                {redirecting || copying ? "Preparing…" : "Copy & continue to Google"}
              </button>

              {clipboardBlocked && (
                <>
                  <button
                    type="button"
                    className="button secondary full"
                    onClick={() => {
                      const textarea = document.getElementById("review-text");
                      if (textarea instanceof HTMLTextAreaElement) {
                        textarea.focus();
                        textarea.select();
                      }
                    }}
                  >
                    Select review text
                  </button>

                  <button
                    type="button"
                    className="button secondary full"
                    onClick={continueToGoogle}
                    disabled={redirecting}
                  >
                    I copied it — continue to Google
                  </button>
                </>
              )}
            </div>

            {status && (
              <p className="status" aria-live="polite">
                {status}
              </p>
            )}
          </>
        )}

        {step === "done" && (
          <>
            <div className="success-icon">
              ✓
            </div>

            <h1>
              Review copied
            </h1>

            <p className="muted center">
              Opening{" "}
              {business.name}
              &apos;s Google review
              page…
            </p>
          </>
        )}

        {status &&
          step !== "reviews" &&
          step !== "done" && (
            <p className="status" aria-live="polite">
              {status}
            </p>
          )}
      </div>
    </main>
  );
}