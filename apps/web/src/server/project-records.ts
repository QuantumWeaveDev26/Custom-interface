import { prisma } from "@creative-ai/db";

import { addDocument, deleteDocument, KnowledgeError } from "./knowledge";
import {
  cleanFields,
  recordToText,
  type RecordFields,
  type RecordKind,
} from "./project-record-text";

/**
 * The film's own records: characters, locations, props.
 *
 * Each one is stored twice on purpose. The structured row is the truth a person
 * edits and a future production graph will query — "which shots have Arjun in
 * costume B" is a query, not a prompt. The text projection is indexed into the
 * project knowledge library so the assistant retrieves it like anything else it
 * knows, without a second retrieval path to keep in step.
 */

export interface ProjectRecord {
  id: string;
  kind: RecordKind;
  name: string;
  summary: string;
  fields: RecordFields;
}

export async function listRecords(userId: string): Promise<ProjectRecord[]> {
  const rows = await prisma.projectRecord.findMany({
    where: { userId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as RecordKind,
    name: row.name,
    summary: row.summary,
    fields: cleanFields(row.fields),
  }));
}

/**
 * Writes the record, then indexes its text.
 *
 * The row is written first and the indexing failure is swallowed, because the
 * two are not equally important: a record that exists but is not yet searchable
 * can be re-indexed, while losing what someone typed about their character
 * because an embedding call timed out is unforgivable. A record with no
 * knowledgeDocId is exactly the signal that it needs indexing again.
 */
export async function saveRecord(
  userId: string,
  kind: RecordKind,
  name: string,
  summary: string,
  rawFields: unknown,
): Promise<ProjectRecord> {
  const trimmedName = name.trim();
  if (trimmedName.length === 0) throw new KnowledgeError("Give it a name");
  const trimmedSummary = summary.trim();
  if (trimmedSummary.length === 0) {
    throw new KnowledgeError("One line about what this is, at least");
  }

  const fields = cleanFields(rawFields);
  const row = await prisma.projectRecord.create({
    data: {
      userId,
      kind,
      name: trimmedName,
      summary: trimmedSummary,
      fields,
    },
  });

  try {
    const doc = await addDocument(
      userId,
      `${trimmedName} (${kind})`,
      recordToText(kind, trimmedName, trimmedSummary, fields),
      "project",
    );
    await prisma.projectRecord.update({
      where: { id: row.id },
      data: { knowledgeDocId: doc.id },
    });
  } catch (error) {
    console.error(`Record ${row.id} saved but not indexed:`, error);
  }

  return {
    id: row.id,
    kind,
    name: trimmedName,
    summary: trimmedSummary,
    fields,
  };
}

/**
 * Removes the record and the passage that mirrored it.
 *
 * Both, or the assistant keeps answering from a character the production has
 * deleted — the most confusing possible failure, because nothing on screen
 * shows the source.
 */
export async function deleteRecord(
  userId: string,
  recordId: string,
): Promise<boolean> {
  const row = await prisma.projectRecord.findFirst({
    where: { id: recordId, userId },
    select: { id: true, knowledgeDocId: true },
  });
  if (row === null) return false;

  if (row.knowledgeDocId !== null) {
    await deleteDocument(userId, row.knowledgeDocId);
  }
  await prisma.projectRecord.deleteMany({ where: { id: row.id, userId } });
  return true;
}
