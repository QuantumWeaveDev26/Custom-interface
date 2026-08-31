/**
 * The vector width every stored embedding uses.
 *
 * It lives here, shared, because two processes write embeddings — the web app's
 * user-triggered index sweep and the worker's index-on-completion — and vectors
 * of different widths cannot be compared. If the two sides ever disagreed, the
 * worker's vectors would be written and then silently ignored by search, which
 * is the kind of failure that looks like "indexing does nothing" for weeks.
 *
 * The model name is deliberately not here: it is read from
 * MODELARK_EMBEDDING_MODEL by both sides, so one environment variable moves
 * them together.
 *
 * Changing this number invalidates every stored vector.
 */
export const EMBEDDING_DIMENSIONS = 2048;
