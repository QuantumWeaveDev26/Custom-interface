"use client";

import { useCallback, useState } from "react";

type Phase = "idle" | "writing" | "submitting" | "queued" | "done" | "failed";

/**
 * Speak over a finished film.
 *
 * Offered only on a film, because narration over one clip of a chain would be
 * narration over a fragment nobody watches. The film's own sound is ducked
 * rather than replaced — that decision lives in the worker, and the copy here
 * says so, since "add narration" otherwise reads like losing the ambience.
 */
export function NarrateButton({ assetId }: { assetId: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setPhase("submitting");
    setMessage(null);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "narration",
          prompt: text,
          inputAssets: [{ assetId, role: "source_video" }],
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setPhase("failed");
        setMessage(body.error ?? "The narration was refused.");
        return;
      }
      setPhase("queued");
    } catch {
      setPhase("failed");
      setMessage("Could not reach the server.");
    }
  }, [assetId, text]);

  if (phase === "idle") {
    return (
      <button
        type="button"
        onClick={() => setPhase("writing")}
        className="btn-secondary !px-3 !py-1.5 text-xs"
      >
        Narrate
      </button>
    );
  }

  if (phase === "queued") {
    return (
      <p className="text-[11px] text-[var(--text-muted)]">
        Narrating. The narrated cut appears here when it is done.
      </p>
    );
  }

  return (
    <div className="w-full space-y-2">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={phase === "submitting"}
        rows={3}
        maxLength={2000}
        placeholder="What the narrator says over this film…"
        className="input-field resize-none text-sm"
      />
      <div className="composer-footer">
        <span className="text-[11px] text-[var(--text-faint)]">
          The film keeps its own sound, pulled down under the voice.
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPhase("idle")}
            className="btn-secondary !px-3 !py-1.5 text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={phase === "submitting" || text.trim().length === 0}
            className="btn-primary gap-2 !px-4 !py-2 text-xs"
          >
            {phase === "submitting" && (
              <span className="spinner h-3 w-3" aria-hidden="true" />
            )}
            Speak it
          </button>
        </div>
      </div>
      {message !== null && <p className="text-xs text-[var(--danger)]">{message}</p>}
    </div>
  );
}
