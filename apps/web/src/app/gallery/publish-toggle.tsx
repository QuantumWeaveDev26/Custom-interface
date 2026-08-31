"use client";

import { useState } from "react";

/**
 * Shares one asset to the feed, or takes it back.
 *
 * The label says what the click will do rather than reporting current state, so
 * there is no "Published — click to unpublish?" ambiguity. The first publish
 * says what else goes public with the image, because the prompt travelling with
 * it is not obvious.
 */
export function PublishToggle({
  assetId,
  published: initiallyPublished,
}: {
  assetId: string;
  published: boolean;
}) {
  const [published, setPublished] = useState(initiallyPublished);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = async () => {
    const next = !published;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/assets/${assetId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: next }),
      });
      if (!response.ok) {
        setFailed(true);
        return;
      }
      setPublished(next);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      data-active={published}
      className="opt !py-1 text-[11px]"
      title={
        published
          ? "Remove this from the public feed"
          : "Show this in the public feed, along with its prompt"
      }
    >
      {failed ? "Try again" : published ? "In the feed" : "Share"}
    </button>
  );
}
