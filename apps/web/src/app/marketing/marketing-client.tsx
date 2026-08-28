"use client";

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

export function MarketingClient() {
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
      setGeneration({ phase: "submitting", errorMessage: null, assetUrl: null });

      void (async () => {
        let response: Response;
        try {
          response = await fetch("/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: adType, prompt }),
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
    [adType],
  );

  const busy =
    generation.phase === "submitting" || generation.phase === "queued" || generation.phase === "processing";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">Marketing</h1>
      <p className="mt-1 text-sm text-gray-600">
        Paste a product URL; the agent extracts the product and proposes an ad creative direction.
      </p>

      <form onSubmit={handlePlan} className="mt-6 space-y-3">
        <label htmlFor="product-url" className="block text-sm font-medium text-gray-700">
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
          className="w-full rounded border border-gray-300 p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-black disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={state.phase === "planning" || state.url.trim().length === 0}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-black disabled:opacity-50"
        >
          {state.phase === "planning" ? "Analyzing..." : "Generate Ad Direction"}
        </button>
      </form>

      {state.phase === "failed" && (
        <p className="mt-4 text-sm text-red-600">{state.errorMessage}</p>
      )}

      {state.phase === "planned" && state.product && state.direction && (
        <div className="mt-8 rounded border border-gray-200 p-4">
          <div className="flex gap-4">
            {state.product.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.product.imageUrl}
                alt={state.product.title}
                className="h-24 w-24 rounded object-cover"
              />
            )}
            <div>
              <h2 className="font-semibold">{state.product.title}</h2>
              <p className="mt-1 text-sm text-gray-600">{state.product.description}</p>
            </div>
          </div>

          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {STYLE_LABELS[state.direction.style] ?? state.direction.style}
            </p>
            <p className="mt-1 text-lg font-semibold">{state.direction.tagline}</p>
            <p className="mt-2 text-sm text-gray-700">{state.direction.prompt}</p>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex gap-2" role="radiogroup" aria-label="Ad type">
              {(["image", "video"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={adType === type}
                  disabled={busy}
                  onClick={() => setAdType(type)}
                  className={`rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                    adType === type ? "bg-black text-white" : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {type === "image" ? "Image" : "Video"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => generateAd(state.direction!.prompt)}
              disabled={busy}
              className="rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? "Working..." : "Generate This Ad"}
            </button>
          </div>

          {generation.phase === "queued" && <p className="mt-2 text-xs text-gray-600">Queued...</p>}
          {generation.phase === "processing" && (
            <p className="mt-2 text-xs text-gray-600">Processing...</p>
          )}
          {generation.phase === "failed" && (
            <p className="mt-2 text-xs text-red-600">{generation.errorMessage}</p>
          )}
          {generation.phase === "complete" && generation.assetUrl && (
            adType === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={generation.assetUrl} alt="Generated ad" className="mt-3 max-w-full rounded" />
            ) : (
              <video
                src={generation.assetUrl}
                controls
                preload="metadata"
                className="mt-3 max-w-full rounded"
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
