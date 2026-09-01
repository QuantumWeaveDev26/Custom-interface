"use client";

import { useCallback, useState } from "react";

import { AssetTile } from "./asset-tile";

export interface SearchResult {
  id: string;
  type: string;
  score: number;
}

export function GallerySearch({
  unindexedCount,
  autoIndex,
}: {
  unindexedCount: number;
  autoIndex: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Server-rendered at page load; kept in state so indexing updates it without
  // a reload.
  const [remaining, setRemaining] = useState(unindexedCount);
  const [auto, setAuto] = useState(autoIndex);

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

  // Optimistic, then reverted if the server refuses: the checkbox is a
  // preference, and a control that lags a round trip behind the click reads as
  // broken.
  const handleAutoIndex = useCallback(async (enabled: boolean) => {
    setAuto(enabled);
    setMessage(null);
    try {
      const response = await fetch("/api/search/auto-index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) {
        setAuto(!enabled);
        setMessage("Could not change that setting.");
      }
    } catch {
      setAuto(!enabled);
      setMessage("Could not reach the server.");
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

      <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-[var(--text-muted)]">
        <input
          type="checkbox"
          checked={auto}
          onChange={(event) => void handleAutoIndex(event.target.checked)}
          className="accent-[var(--signal)]"
        />
        Index new generations automatically
        <span className="text-[var(--text-faint)]">
          — costs a little on every image and video you make
        </span>
      </label>

      {message !== null && (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">{message}</p>
      )}

      {results !== null && results.length > 0 && (
        <div className="mt-5">
          <p className="rule-cap mb-2">
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
          {/* The same tile the library uses. These were hand-built duplicates:
              their own type pill, their own media rules, their own frame — so a
              result and the identical asset one scroll away did not look like
              the same thing. The score rides in the tile's badge slot, shown so
              a weak match reads as weak rather than as the best there is. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {results.map((result) => (
              <div key={result.id}>
                <AssetTile
                  asset={{ id: result.id, type: result.type }}
                  badge={`${(result.score * 100).toFixed(0)}%`}
                />
                <button
                  type="button"
                  onClick={() =>
                    void runSearch(
                      `similarTo=${encodeURIComponent(result.id)}`,
                      "that asset",
                    )
                  }
                  disabled={searching}
                  className="w-full px-1 pt-1.5 text-left text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
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
