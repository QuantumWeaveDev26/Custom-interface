"use client";

import { useCallback, useState } from "react";

export interface ProjectRecordView {
  id: string;
  kind: "character" | "location" | "prop";
  name: string;
  summary: string;
  fields: Record<string, string>;
}

const KINDS = [
  { id: "character", label: "Characters", one: "character" },
  { id: "location", label: "Locations", one: "location" },
  { id: "prop", label: "Props", one: "prop" },
] as const;

/**
 * The film's own bible.
 *
 * Every record written here is indexed into the project library, which the
 * assistant weights above general craft — so "what is Arjun wearing" is
 * answered from this page rather than from what a model imagines a character
 * called Arjun might wear.
 */
export function ProjectClient({
  initialRecords,
  suggestedFields,
}: {
  initialRecords: readonly ProjectRecordView[];
  suggestedFields: Record<string, readonly string[]>;
}) {
  const [records, setRecords] = useState<readonly ProjectRecordView[]>(initialRecords);
  const [kind, setKind] = useState<ProjectRecordView["kind"]>("character");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/project-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name, summary, fields }),
      });
      const body = (await response.json().catch(() => ({}))) as
        | ProjectRecordView
        | { error?: string };
      if (!response.ok) {
        setError("error" in body ? (body.error ?? "Could not save it.") : "Could not save it.");
        return;
      }
      setRecords((previous) => [...previous, body as ProjectRecordView]);
      setName("");
      setSummary("");
      setFields({});
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }, [kind, name, summary, fields]);

  const remove = useCallback(async (id: string) => {
    const previous = records;
    setRecords((current) => current.filter((record) => record.id !== id));
    const response = await fetch(`/api/project-records?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setRecords(previous);
      setError("Could not remove that record.");
    }
  }, [records]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">This film</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Characters, locations and props, written down once. The assistant answers
        from these before it answers from anything general — a decision recorded
        here outranks what a model would otherwise imagine.
      </p>

      <div className="panel mt-5 space-y-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setKind(option.id);
                setFields({});
              }}
              data-active={kind === option.id}
              className="opt"
            >
              {option.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
          maxLength={120}
          placeholder={kind === "character" ? "Arjun" : kind === "location" ? "The night market" : "Arjun's phone"}
          className="input-field !py-2 text-sm"
        />
        <input
          type="text"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          disabled={busy}
          maxLength={300}
          placeholder="One line — who or what this is"
          className="input-field !py-2 text-sm"
        />

        {/* Suggested fields, not required ones. A production's bible carries
            whatever that production cares about, and a form of eleven fixed
            boxes is a form people work around instead of filling in. */}
        <div className="space-y-1.5">
          {(suggestedFields[kind] ?? []).map((field) => (
            <div key={field} className="flex items-center gap-2">
              <span className="w-32 shrink-0 text-[11px] text-[var(--text-faint)]">
                {field}
              </span>
              <input
                type="text"
                value={fields[field] ?? ""}
                onChange={(event) =>
                  setFields((previous) => ({ ...previous, [field]: event.target.value }))
                }
                disabled={busy}
                maxLength={500}
                className="input-field !py-1.5 text-[13px]"
              />
            </div>
          ))}
        </div>

        <div className="composer-footer">
          <span className="text-[11px] text-[var(--text-faint)]">
            Blank fields are left out entirely.
          </span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || name.trim().length === 0 || summary.trim().length === 0}
            className="btn-primary gap-2 !px-4 !py-2 text-xs"
          >
            {busy && <span className="spinner h-3 w-3" aria-hidden="true" />}
            Save to the film
          </button>
        </div>
        {error !== null && <p className="text-xs text-[var(--danger)]">{error}</p>}
      </div>

      {KINDS.map((section) => {
        const inSection = records.filter((record) => record.kind === section.id);
        if (inSection.length === 0) return null;
        return (
          <section key={section.id} className="mt-6">
            <p className="rule-cap mb-2">{section.label}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {inSection.map((record) => (
                <div key={record.id} className="card p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-sm font-semibold text-[var(--text)]">
                      {record.name}
                    </h2>
                    <button
                      type="button"
                      onClick={() => void remove(record.id)}
                      aria-label={`Remove ${record.name}`}
                      className="px-1 text-[var(--text-faint)] hover:text-[var(--danger)]"
                    >
                      ×
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{record.summary}</p>
                  {Object.entries(record.fields).length > 0 && (
                    <dl className="mt-3 space-y-1">
                      {Object.entries(record.fields).map(([field, value]) => (
                        <div key={field} className="flex gap-2 text-[11px]">
                          <dt className="w-28 shrink-0 text-[var(--text-faint)]">{field}</dt>
                          <dd className="text-[var(--text-muted)]">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
