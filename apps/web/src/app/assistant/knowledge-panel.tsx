"use client";

import { useCallback, useState } from "react";

export interface KnowledgeDocument {
  id: string;
  title: string;
  collection: string;
  chunks: number;
}

/**
 * Four libraries, kept apart because the question decides which one to read.
 * Craft is general; a project's own bible outranks it for that film.
 */
const COLLECTIONS = [
  { id: "filmmaking", label: "Craft", hint: "How film works, in general" },
  { id: "platform", label: "Platform", hint: "How this product works" },
  { id: "project", label: "This film", hint: "Bible, characters, decisions" },
  { id: "policy", label: "Rights", hint: "Consent, licensing, what may be sold" },
] as const;

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
  const [collection, setCollection] = useState<string>("filmmaking");
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
        body: JSON.stringify({ title, text, collection }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
        title?: string;
        collection?: string;
        chunks?: number;
      };
      if (!response.ok) {
        setError(body.error ?? "Could not store the document.");
        return;
      }
      setDocuments((previous) => [
        {
          id: body.id!,
          title: body.title!,
          collection: body.collection ?? collection,
          chunks: body.chunks!,
        },
        ...previous,
      ]);
      setTitle("");
      setText("");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }, [title, text, collection]);

  /**
   * A PDF is sent as it is and read on the server.
   *
   * Text files are read here because the browser can; a PDF cannot be, and
   * requiring someone to convert every export before it counts as knowledge is
   * requiring them not to bother.
   */
  const addPdf = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("title", title.trim().length > 0 ? title : file.name);
        form.set("collection", collection);
        const response = await fetch("/api/knowledge", { method: "POST", body: form });
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          id?: string;
          title?: string;
          collection?: string;
          chunks?: number;
        };
        if (!response.ok) {
          setError(body.error ?? "Could not read that PDF.");
          return;
        }
        setDocuments((previous) => [
          {
            id: body.id!,
            title: body.title!,
            collection: body.collection ?? collection,
            chunks: body.chunks!,
          },
          ...previous,
        ]);
        setTitle("");
        setText("");
      } catch {
        setError("Could not reach the server.");
      } finally {
        setBusy(false);
      }
    },
    [title, collection],
  );

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
          <div className="flex flex-wrap gap-1.5">
            {COLLECTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setCollection(option.id)}
                data-active={collection === option.id}
                title={option.hint}
                className="opt !py-1 text-[11px]"
              >
                {option.label}
              </button>
            ))}
          </div>

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
              Read a file or PDF
              <input
                type="file"
                accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
                className="sr-only"
                disabled={busy}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file === undefined) return;
                  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
                    await addPdf(file);
                    return;
                  }
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
                <span className="val mr-1.5 text-[var(--text-faint)]">
                  {doc.collection}
                </span>
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
