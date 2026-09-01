"use client";

import { useCallback, useState } from "react";

export interface KnowledgeDocument {
  id: string;
  title: string;
  chunks: number;
}

/**
 * What the house knows.
 *
 * Paste a guide, a grading note, anything the assistant should answer from
 * rather than invent. Text is accepted directly and files are read in the
 * browser, because the alternative — uploading, storing, and parsing formats
 * server-side — is a document pipeline, and what is needed here is the words.
 */
export function KnowledgePanel({
  initialDocuments,
}: {
  initialDocuments: readonly KnowledgeDocument[];
}) {
  const [documents, setDocuments] = useState<readonly KnowledgeDocument[]>(
    initialDocuments,
  );
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const add = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, text }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
        title?: string;
        chunks?: number;
      };
      if (!response.ok) {
        setError(body.error ?? "Could not store the document.");
        return;
      }
      setDocuments((previous) => [
        { id: body.id!, title: body.title!, chunks: body.chunks! },
        ...previous,
      ]);
      setTitle("");
      setText("");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }, [title, text]);

  const remove = useCallback(async (id: string) => {
    // Optimistic, then restored if the server refuses: the list is a local
    // reflection of a delete that either happened or did not.
    const previous = documents;
    setDocuments((current) => current.filter((doc) => doc.id !== id));
    const response = await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setDocuments(previous);
      setError("Could not remove that document.");
    }
  }, [documents]);

  return (
    <div className="panel mt-3 p-3">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="rule-cap">
          What the house knows{" "}
          <span className="normal-case tracking-normal">
            ({documents.length} document{documents.length === 1 ? "" : "s"})
          </span>
        </span>
        <span className="text-xs text-[var(--text-muted)]">{open ? "Hide" : "Add"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={busy}
            maxLength={200}
            placeholder="What is this? e.g. House grading notes"
            className="input-field !py-2 text-sm"
          />
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={busy}
            rows={5}
            placeholder="Paste the text. The assistant answers from this instead of guessing."
            className="input-field resize-none text-sm"
          />

          <div className="composer-footer">
            <label className="btn-secondary cursor-pointer !px-3 !py-1.5 text-xs">
              Read a file
              <input
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                className="sr-only"
                disabled={busy}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file === undefined) return;
                  setText(await file.text());
                  if (title.trim().length === 0) setTitle(file.name);
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => void add()}
              disabled={busy || title.trim().length === 0 || text.trim().length === 0}
              className="btn-primary gap-2 !px-4 !py-2 text-xs"
            >
              {busy && <span className="spinner h-3 w-3" aria-hidden="true" />}
              Add to knowledge
            </button>
          </div>
          {error !== null && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </div>
      )}

      {documents.length > 0 && (
        <ul className="mt-3 space-y-1">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]"
            >
              <span className="truncate">
                {doc.title}{" "}
                <span className="val text-[var(--text-faint)]">
                  {doc.chunks} passage{doc.chunks === 1 ? "" : "s"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void remove(doc.id)}
                aria-label={`Remove ${doc.title}`}
                className="px-1 text-[var(--text-faint)] hover:text-[var(--danger)]"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
