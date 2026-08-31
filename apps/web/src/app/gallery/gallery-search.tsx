"use client";

import { useCallback, useState } from "react";

export interface SearchResult {
  id: string;
  type: string;
  score: number;
}

const TYPE_LABELS: Record<string, string> = {
  image: "Image",
  video: "Video",
  audio: "Voice",
};

export function GallerySearch({ unindexedCount }: { unindexedCount: number }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Server-rendered at page load; kept in state so indexing updates it without
  // a reload.
  const [remaining, setRemaining] = useState(unindexedCount);

  const runSearch = useCallback(
    async (params: string, label: string) => {
      setMessage(null);
      setSearching(true);
      try {
        const response = await fetch(`/api/search?${params}`);
        if (!response.ok) {
          setMessage("Search failed.");
          return;
        }
        const body = (await response.json()) as { results: SearchResult[] };
        setResults(body.results);
        if (body.results.length === 0) {
          setMessage(
            remaining > 0
              ? `No matches for ${label}. ${remaining} asset(s) are still unindexed.`
              : `No matches for ${label}.`,
          );
        }
      } catch {
        setMessage("Could not reach the server.");
      } finally {
        setSearching(false);
      }
    },
    [remaining],
  );

  const handleSearch = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = query.trim();
      if (trimmed.length === 0) return;
      void runSearch(`q=${encodeURIComponent(trimmed)}`, `“${trimmed}”`);
    },
    [query, runSearch],
  );

  const handleIndex = useCallback(async () => {
    setMessage(null);
    setIndexing(true);
    try {
      const response = await fetch("/api/search/index", { method: "POST" });
      if (!response.ok) {
        setMessage("Indexing failed.");
        return;
      }
      const body = (await response.json()) as {
        indexed: number;
        remaining: number;
        failed: number;
      };
      setRemaining(body.remaining);
      setMessage(
        `Indexed ${body.indexed} asset(s).` +
          (body.failed > 0 ? ` ${body.failed} failed.` : "") +
          (body.remaining > 0 ? ` ${body.remaining} still to go — run it again.` : ""),
      );
    } catch {
      setMessage("Could not reach the server.");
    } finally {
      setIndexing(false);
    }
  }, []);

  return (
    <div className="mt-6">
      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={searching}
          maxLength={200}
          placeholder="Search by meaning — “someone running at sunset”…"
          className="input-field !w-auto flex-1 !py-2 text-sm"
        />
        <button
          type="submit"
          disabled={searching || query.trim().length === 0}
          className="btn-primary gap-2 !px-4 !py-2 text-sm"
        >
          {searching && <span className="spinner h-3.5 w-3.5" aria-hidden="true" />}
          Search
        </button>
        {results !== null && (
          <button
            type="button"
            onClick={() => {
              setResults(null);
              setMessage(null);
            }}
            className="btn-secondary !px-4 !py-2 text-sm"
          >
            Clear
          </button>
        )}
      </form>

      {remaining > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-[var(--text-muted)]">
            {remaining} asset(s) not yet indexed — search only covers what is
            indexed.
          </p>
          <button
            type="button"
            onClick={handleIndex}
            disabled={indexing}
            className="btn-secondary gap-1.5 !px-3 !py-1 text-[11px]"
          >
            {indexing && <span className="spinner h-3 w-3" aria-hidden="true" />}
            Index up to 20
          </button>
        </div>
      )}

      {message !== null && (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">{message}</p>
      )}

      {results !== null && results.length > 0 && (
        <div className="mt-5">
          <p className="rule-cap mb-2">
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((result) => (
              <div key={result.id} className="card group overflow-hidden">
                <div className="relative">
                  <span className="absolute left-2 top-2 z-10 rounded-[2px] bg-black/75 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                    {TYPE_LABELS[result.type] ?? result.type}
                  </span>
                  <span className="absolute right-2 top-2 z-10 rounded-[2px] tabular bg-black/75 px-2 py-1 font-mono text-[10px] font-semibold text-white">
                    {/* Cosine similarity, shown so a weak match reads as weak
                        rather than as the best the library has. */}
                    {(result.score * 100).toFixed(0)}%
                  </span>
                  {result.type === "image" ? (
                    <img
                      src={`/api/assets/${result.id}`}
                      alt=""
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <video
                      src={`/api/assets/${result.id}`}
                      controls
                      preload="metadata"
                      className="aspect-square w-full object-cover"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void runSearch(
                      `similarTo=${encodeURIComponent(result.id)}`,
                      "that asset",
                    )
                  }
                  disabled={searching}
                  className="w-full px-3 py-2 text-left text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
                >
                  More like this →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
