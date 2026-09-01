/**
 * Turning a structured record into the text the assistant reads.
 *
 * Kept pure and apart from storage so the projection — the part that decides
 * what the assistant will and will not know about a character — can be tested
 * directly.
 *
 * The fields are deliberately not a fixed schema per kind. A production's bible
 * carries whatever that production cares about, and a form that only accepts
 * eleven predetermined fields is a form people work around rather than fill in.
 */

export const RECORD_KINDS = ["character", "location", "prop"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export function parseRecordKind(value: unknown): RecordKind | null {
  return RECORD_KINDS.includes(value as RecordKind) ? (value as RecordKind) : null;
}

/**
 * Field names worth suggesting for each kind, from the owner's own knowledge
 * base. Suggestions, not requirements — every one is optional and anything else
 * is allowed.
 */
export const SUGGESTED_FIELDS: Record<RecordKind, readonly string[]> = {
  character: [
    "age",
    "role",
    "face",
    "hair",
    "build",
    "wardrobe",
    "accessories",
    "personality",
    "goal",
    "voice",
    "continuity notes",
  ],
  location: [
    "type",
    "architecture",
    "palette",
    "lighting",
    "signage",
    "time variants",
    "weather variants",
    "continuity notes",
  ],
  prop: ["owner", "model", "condition", "damage", "continuity notes"],
};

export interface RecordFields {
  [field: string]: string;
}

/**
 * The record as a passage.
 *
 * Written as prose with the name in every heading rather than as a bare table,
 * because retrieval matches on meaning: a passage that says "Arjun wears a
 * faded olive shirt" is found by "what is Arjun wearing", while a row reading
 * "wardrobe: olive shirt" under a distant title often is not.
 */
export function recordToText(
  kind: RecordKind,
  name: string,
  summary: string,
  fields: RecordFields,
): string {
  const lines = [`${name} — ${kind}`, "", summary.trim()];

  for (const [field, value] of Object.entries(fields)) {
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    lines.push("", `${name}'s ${field}: ${trimmed}`);
  }

  return lines.join("\n").trim();
}

/**
 * Rejects fields that carry nothing, so an empty form does not become an empty
 * passage that competes with real knowledge for a place in the prompt.
 */
export function cleanFields(raw: unknown): RecordFields {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};

  const cleaned: RecordFields = {};
  for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const trimmedField = field.trim();
    const trimmedValue = value.trim();
    if (trimmedField.length === 0 || trimmedValue.length === 0) continue;
    cleaned[trimmedField] = trimmedValue;
  }
  return cleaned;
}
