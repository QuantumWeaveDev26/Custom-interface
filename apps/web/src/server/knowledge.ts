import { prisma } from "@creative-ai/db";
import { EMBEDDING_DIMENSIONS } from "@creative-ai/shared-types";

import { chunkText } from "./knowledge-chunk";
import { cosineSimilarity } from "./semantic-search";
import {
  EMBEDDING_MODEL,
  semanticSearchDependencies,
} from "./semantic-search-dependencies";

/**
 * House knowledge: what the assistant answers from instead of inventing.
 *
 * Documents are split before they are stored, because a whole style guide is
 * both too much to put in a prompt and too coarse to match a question against.
 * A passage is answerable and affordable; a book is neither.
 */

export const MAX_DOCUMENT_LENGTH = 200_000;
export const MAX_RETRIEVED_CHUNKS = 6;

/**
 * The libraries knowledge is kept in, and why they are kept apart.
 *
 * The question decides which one to read. What an 85mm lens does is craft; what
 * shirt a character wears is this film's own record; whether an asset may be
 * sold is policy. Answering a project question out of the craft library is how
 * an assistant invents facts about somebody's film.
 */
export const KNOWLEDGE_COLLECTIONS = [
  "filmmaking",
  "platform",
  "project",
  "policy",
] as const;

export type KnowledgeCollection = (typeof KNOWLEDGE_COLLECTIONS)[number];

/** Anything unrecognised reads as craft, the least authoritative library. */
export function parseCollection(value: unknown): KnowledgeCollection {
  return KNOWLEDGE_COLLECTIONS.includes(value as KnowledgeCollection)
    ? (value as KnowledgeCollection)
    : "filmmaking";
}

/**
 * How much each library counts when passages compete for the same slot.
 * A thumb on the scale, not a filter.
 */
const COLLECTION_WEIGHT: Record<KnowledgeCollection, number> = {
  project: 1.15,
  policy: 1.1,
  platform: 1.05,
  filmmaking: 1,
};

export class KnowledgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeError";
  }
}

async function embedText(text: string): Promise<number[]> {
  const dependencies = semanticSearchDependencies();
  const response = await dependencies.embed({
    model: dependencies.model,
    dimensions: dependencies.dimensions,
    encoding_format: "float",
    input: [{ type: "text", text }],
  });

  if (response.error !== undefined) {
    throw new KnowledgeError(response.error.message);
  }
  const vector = response.data.embedding;
  if (vector.length !== dependencies.dimensions) {
    throw new KnowledgeError(
      `Embedding has ${vector.length} dimensions, expected ${dependencies.dimensions}`,
    );
  }
  return vector;
}

export interface StoredDocument {
  id: string;
  title: string;
  collection: KnowledgeCollection;
  chunks: number;
  createdAt: Date;
}

/**
 * Stores a document and its embeddings.
 *
 * Every passage is embedded before anything is written, and the document and
 * its passages are stored in one transaction, so a document is never half
 * indexed. A partial document answers questions with holes in it, and nothing
 * in the interface would show that.
 */
export async function addDocument(
  userId: string,
  title: string,
  text: string,
  collection: KnowledgeCollection = "filmmaking",
): Promise<StoredDocument> {
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) throw new KnowledgeError("Give the document a title");
  if (text.trim().length === 0) throw new KnowledgeError("The document is empty");
  if (text.length > MAX_DOCUMENT_LENGTH) {
    throw new KnowledgeError(
      `Documents are limited to ${MAX_DOCUMENT_LENGTH} characters`,
    );
  }

  const pieces = chunkText(text);
  if (pieces.length === 0) throw new KnowledgeError("The document is empty");

  const vectors: number[][] = [];
  for (const piece of pieces) {
    vectors.push(await embedText(piece));
  }

  const doc = await prisma.$transaction(async (tx) => {
    const created = await tx.knowledgeDoc.create({
      data: { userId, title: trimmedTitle, collection },
    });
    await tx.knowledgeChunk.createMany({
      data: pieces.map((piece, ordinal) => ({
        docId: created.id,
        userId,
        collection,
        ordinal,
        text: piece,
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        vector: vectors[ordinal]!,
      })),
    });
    return created;
  });

  return {
    id: doc.id,
    title: doc.title,
    collection,
    chunks: pieces.length,
    createdAt: doc.createdAt,
  };
}

export async function listDocuments(userId: string): Promise<StoredDocument[]> {
  const docs = await prisma.knowledgeDoc.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { chunks: true } } },
  });
  return docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    collection: parseCollection(doc.collection),
    chunks: doc._count.chunks,
    createdAt: doc.createdAt,
  }));
}

/** Deletes a document the user owns. Returns false if it isn't theirs. */
export async function deleteDocument(
  userId: string,
  docId: string,
): Promise<boolean> {
  const deleted = await prisma.knowledgeDoc.deleteMany({
    where: { id: docId, userId },
  });
  return deleted.count === 1;
}

/**
 * The passages worth putting in front of the assistant for this question.
 *
 * Returns nothing when the house has no documents, and does so without an
 * embedding call: charging for a retrieval over an empty library would put a
 * price on every question a new user asks.
 */
export async function retrieveKnowledge(
  userId: string,
  question: string,
): Promise<string> {
  const stored = await prisma.knowledgeChunk.findMany({
    where: { userId, model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS },
    select: { text: true, vector: true, collection: true },
  });
  if (stored.length === 0) return "";

  const queryVector = await embedText(question);

  // Weighted rather than filtered. A project question may still be best served
  // by a craft passage, and filtering would hide it — but where both fit, this
  // film's own decisions beat the textbook. If the visual bible says the night
  // interiors are cyan, no amount of general practice about warm practicals is
  // the right answer.
  return stored
    .map((chunk) => {
      const collection = parseCollection(chunk.collection);
      return {
        text: chunk.text,
        collection,
        score:
          cosineSimilarity(queryVector, chunk.vector) *
          COLLECTION_WEIGHT[collection],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RETRIEVED_CHUNKS)
    .map((chunk) => `[${chunk.collection}] ${chunk.text}`)
    .join("\n\n");
}
