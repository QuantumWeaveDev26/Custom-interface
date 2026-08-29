"use client";

import { useCallback, useRef, useState } from "react";

export interface Attachment {
  assetId: string;
  kind: "image" | "video";
  name: string;
}

/**
 * Attach references directly from the prompt box.
 *
 * The dedicated pickers elsewhere in Studio answer "which of my existing assets
 * do I mean"; this answers "use this file I have right here", which is what
 * someone typing a prompt actually reaches for. Both feed the same job input
 * assets, so nothing downstream needs to know which route a reference took.
 */
export function AttachButton({
  attachments,
  disabled,
  accept,
  hint,
  onAttached,
  onRemove,
}: {
  attachments: readonly Attachment[];
  disabled: boolean;
  /** What this surface can actually use. Video is meaningless for a still. */
  accept: "images" | "images-and-video";
  hint?: string;
  onAttached(attachment: Attachment): void;
  onRemove(assetId: string): void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptAttribute =
    accept === "images"
      ? "image/png,image/jpeg,image/webp"
      : "image/png,image/jpeg,image/webp,video/mp4,video/quicktime";

  const handleChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = [...(event.target.files ?? [])];
      // Reset immediately so re-picking the same file still fires onChange.
      event.target.value = "";
      if (files.length === 0) return;

      setError(null);
      setUploading(true);
      try {
        for (const file of files) {
          const formData = new FormData();
          formData.append("file", file);
          const response = await fetch("/api/uploads", {
            method: "POST",
            body: formData,
          });
          if (!response.ok) {
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            // Named, because "Upload failed" on a five-file drop tells the user
            // nothing about which one to swap.
            setError(`${file.name}: ${body.error ?? "upload failed"}`);
            return;
          }
          const { assetId } = (await response.json()) as { assetId: string };
          onAttached({
            assetId,
            kind: file.type.startsWith("video/") ? "video" : "image",
            name: file.name,
          });
        }
      } catch {
        setError("Could not reach the server.");
      } finally {
        setUploading(false);
      }
    },
    [onAttached],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="btn-secondary gap-1.5 !px-3 !py-1.5 text-xs"
        >
          {uploading ? (
            <span className="spinner h-3 w-3" aria-hidden="true" />
          ) : (
            <span aria-hidden="true">+</span>
          )}
          {accept === "images" ? "Attach image" : "Attach image or video"}
        </button>

        {attachments.map((attachment) => (
          <span
            key={attachment.assetId}
            className="inline-flex max-w-[14rem] items-center gap-1 rounded-full border px-1 py-0.5 text-xs"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <span className="truncate px-2 py-0.5 text-[var(--text)]" title={attachment.name}>
              {attachment.name}
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(attachment.assetId)}
              aria-label={`Remove ${attachment.name}`}
              className="px-1 text-[var(--text-faint)] hover:text-[var(--danger)] disabled:opacity-50"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptAttribute}
        onChange={handleChange}
        disabled={disabled || uploading}
        className="sr-only"
      />

      {hint !== undefined && attachments.length > 0 && (
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{hint}</p>
      )}
      {error !== null && (
        <p className="mt-1.5 text-[11px] text-[var(--danger)]">{error}</p>
      )}
    </div>
  );
}
