/**
 * The "nothing has happened yet" state for a tool page.
 *
 * These pages previously rendered a form and then blank space, which reads as a
 * page that failed to load rather than one waiting for input. It says what the
 * tool does and offers a concrete example, because the hardest part of a
 * prompt-driven tool is the first prompt.
 */
export function EmptyState({
  title,
  description,
  example,
  onUseExample,
}: {
  title: string;
  description: string;
  example?: string;
  onUseExample?: (example: string) => void;
}) {
  return (
    <div className="mt-6 rounded-[3px] border border-dashed border-[var(--border)] px-6 py-10 text-center">
      <p className="text-sm font-medium text-[var(--text)]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--text-muted)]">
        {description}
      </p>
      {example !== undefined && onUseExample !== undefined && (
        <button
          type="button"
          onClick={() => onUseExample(example)}
          className="btn-secondary mt-4 !px-4 !py-2 text-xs"
        >
          Try “{example}”
        </button>
      )}
    </div>
  );
}
