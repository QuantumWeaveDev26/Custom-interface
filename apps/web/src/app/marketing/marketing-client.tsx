"use client";

import { AttachButton, type Attachment } from "../attach-button";
import { EmptyState } from "../empty-state";
import { useCallback, useEffect, useRef, useReducer, useState } from "react";
import {
  INITIAL_MARKETING_STATE,
  marketingReducer,
  type MarketingProduct,
  type MarketingDirectionResult,
} from "./marketing-state";

interface AdGenerationState {
  phase: "idle" | "submitting" | "queued" | "processing" | "complete" | "failed";
  errorMessage: string | null;
  assetUrl: string | null;
}

const IDLE_GENERATION: AdGenerationState = { phase: "idle", errorMessage: null, assetUrl: null };

interface JobStatusMessage {
  status: "queued" | "processing" | "complete" | "failed";
  errorMessage?: string;
  assets?: { id: string; type: "image" | "video"; url: string }[];
}

const STYLE_LABELS: Record<string, string> = {
  ugc: "UGC (authentic, handheld)",
  cgi: "CGI (polished 3D render)",
  cinematic: "Cinematic (dramatic, film-style)",
};

export function MarketingClient({
  characters,
}: {
  characters: readonly { id: string; name: string; assetIds: string[] }[];
}) {
  // One character per ad — the same reasoning as Director's cast.
  const [castId, setCastId] = useState<string | null>(null);
  // References attached straight from the prompt box, for the common case of
  // "use this photo" where the user has not saved a character and should not
  // have to first.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [state, dispatch] = useReducer(marketingReducer, INITIAL_MARKETING_STATE);
  const [adType, setAdType] = useState<"image" | "video">("image");
  const [generation, setGeneration] = useState<AdGenerationState>(IDLE_GENERATION);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const handlePlan = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (state.phase === "planning" || state.url.trim().length === 0) return;

      dispatch({ type: "PLAN_START" });
      setGeneration(IDLE_GENERATION);

      let response: Response;
      try {
        response = await fetch("/api/marketing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: state.url }),
        });
      } catch {
        dispatch({ type: "PLAN_ERROR", message: "Could not reach the server." });
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        dispatch({ type: "PLAN_ERROR", message: body.error ?? "Planning failed." });
        return;
      }

      const { product, direction } = (await response.json()) as {
        product: MarketingProduct;
        direction: MarketingDirectionResult;
      };
      dispatch({ type: "PLAN_SUCCESS", product, direction });
    },
    [state.phase, state.url],
  );

  const generateAd = useCallback(
    (prompt: string) => {
      const referenceIds = [
        ...(characters.find((character) => character.id === castId)?.assetIds ?? []),
        ...attachments.map((attachment) => attachment.assetId),
      ];
      setGeneration({ phase: "submitting", errorMessage: null, assetUrl: null });

      void (async () => {
        let response: Response;
        try {
          response = await fetch("/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: adType,
              prompt,
              ...(referenceIds.length === 0
                ? {}
                : {
                    inputAssets: referenceIds.map((assetId) => ({
                      assetId,
                      role: "reference",
                    })),
                  }),
            }),
          });
        } catch {
          setGeneration({ phase: "failed", errorMessage: "Could not reach the server.", assetUrl: null });
          return;
        }

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          setGeneration({ phase: "failed", errorMessage: body.error ?? "Submission failed.", assetUrl: null });
          return;
        }

        const { jobId } = (await response.json()) as { jobId: string };
        setGeneration({ phase: "queued", errorMessage: null, assetUrl: null });

        const source = new EventSource(`/api/jobs/${jobId}/stream`);
        eventSourceRef.current = source;

        source.onmessage = (message) => {
          let parsed: JobStatusMessage;
          try {
            parsed = JSON.parse(message.data as string) as JobStatusMessage;
          } catch {
            return;
          }
          if (parsed.status === "queued") return;

          setGeneration({
            phase: parsed.status,
            errorMessage: parsed.errorMessage ?? null,
            assetUrl: parsed.assets?.[0]?.url ?? null,
          });

          if (parsed.status === "complete" || parsed.status === "failed") {
            source.close();
          }
        };

        source.onerror = () => {
          source.close();
        };
      })();
    },
    [adType, characters, castId, attachments],
  );

  const busy =
    generation.phase === "submitting" || generation.phase === "queued" || generation.phase === "processing";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Marketing</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Paste a product URL; the agent extracts the product and proposes an ad creative direction.
      </p>

      <form onSubmit={handlePlan} className="mt-6 space-y-3">
        <label htmlFor="product-url" className="block text-xs font-medium text-[var(--text-muted)]">
          Product URL
        </label>
        <input
          id="product-url"
          type="url"
          value={state.url}
          onChange={(event) => dispatch({ type: "SET_URL", url: event.target.value })}
          disabled={state.phase === "planning"}
          required
          placeholder="https://example.com/product"
          className="input-field"
        />
        <button
          type="submit"
          disabled={state.phase === "planning" || state.url.trim().length === 0}
          className="btn-primary gap-2"
        >
          {state.phase === "planning" && <span className="spinner" aria-hidden="true" />}
          {state.phase === "planning" ? "Analyzing..." : "Generate Ad Direction"}
        </button>

        <AttachButton
          attachments={attachments}
          disabled={state.phase === "planning"}
          accept="images"
          hint="The ad is generated with these references."
          onAttached={(attachment) =>
            setAttachments((previous) => [...previous, attachment])
          }
          onRemove={(assetId) =>
            setAttachments((previous) =>
              previous.filter((item) => item.assetId !== assetId),
            )
          }
        />

      </form>

      {characters.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
            Cast <span className="normal-case tracking-normal">(optional)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {characters.map((character) => {
              const active = castId === character.id;
              return (
                <button
                  key={character.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCastId(active ? null : character.id)}
                  className="pill !px-3 !py-1.5 text-xs"
                  data-active={active}
                  style={
                    active
                      ? undefined
                      : { background: "var(--surface)", border: "1px solid var(--border)" }
                  }
                >
                  {character.name}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            {castId === null
              ? "Pick someone to appear in the ad."
              : "The ad is generated with that character."}
          </p>
        </div>
      )}

      <div aria-live="polite" className="sr-only">
        {state.phase === "planning" && "Reading the product page"}
        {state.phase === "planned" && "Creative direction ready"}
        {state.phase === "failed" && `Planning failed. ${state.errorMessage ?? ""}`}
      </div>

      {state.phase === "idle" && (
        <EmptyState
          title="No ad planned yet"
          description="Paste a product page URL. The page is read for you, then a creative direction, tagline, and shot are proposed from what it actually says."
          example="https://www.apple.com/airpods-pro/"
          onUseExample={(url) => dispatch({ type: "SET_URL", url })}
        />
      )}

      {state.phase === "failed" && (
        <div className="card border-[var(--danger)]/30 mt-4 p-4">
          <p className="text-sm text-[var(--danger)]">{state.errorMessage}</p>
        </div>
      )}

      {state.phase === "planned" && state.product && state.direction && (
        <div className="card mt-8 p-5">
          <div className="flex gap-4">
            {state.product.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.product.imageUrl}
                alt={state.product.title}
                className="h-24 w-24 rounded-lg object-cover"
              />
            )}
            <div>
              <h2 className="font-semibold text-[var(--text)]">{state.product.title}</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{state.product.description}</p>
            </div>
          </div>

          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
              {STYLE_LABELS[state.direction.style] ?? state.direction.style}
            </p>
            <p className="mt-1 text-xl font-semibold text-[var(--text)]">{state.direction.tagline}</p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">{state.direction.prompt}</p>
            <p className="mt-2 text-[11px] text-[var(--text-faint)]">
              {state.direction.cameraLabel} &middot; {state.direction.lensLabel} &middot;{" "}
              {state.direction.lookLabel}
            </p>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex gap-2 rounded-xl bg-[var(--bg-elevated)] p-1" role="radiogroup" aria-label="Ad type">
              {(["image", "video"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={adType === type}
                  disabled={busy}
                  data-active={adType === type}
                  onClick={() => setAdType(type)}
                  className="pill !px-3 !py-1.5 text-xs"
                >
                  {type === "image" ? "Image" : "Video"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => generateAd(state.direction!.composedPrompt)}
              disabled={busy}
              className="btn-secondary gap-2 !px-3 !py-1.5 text-xs"
            >
              {busy && <span className="spinner h-3 w-3" aria-hidden="true" />}
              {busy ? "Working..." : "Generate This Ad"}
            </button>
          </div>

          {(generation.phase === "queued" || generation.phase === "processing") && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <span className="spinner h-3 w-3 text-[var(--accent-via)]" aria-hidden="true" />
              {generation.phase === "queued" ? "Queued..." : "Rendering..."}
            </p>
          )}
          {generation.phase === "failed" && (
            <p className="mt-3 text-xs text-[var(--danger)]">{generation.errorMessage}</p>
          )}
          {generation.phase === "complete" && generation.assetUrl && (
            adType === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={generation.assetUrl} alt="Generated ad" className="mt-4 w-full rounded-lg" />
            ) : (
              <video
                src={generation.assetUrl}
                controls
                preload="metadata"
                className="mt-4 w-full rounded-lg"
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
