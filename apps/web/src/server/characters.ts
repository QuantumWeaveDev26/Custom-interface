import { prisma } from "@creative-ai/db";

export const MAX_CHARACTER_NAME_LENGTH = 60;
// Matches MAX_INPUT_ASSETS_PER_JOB — a character is loaded straight into the
// reference slots, so it can never hold more than a job accepts.
export const MAX_CHARACTER_REFERENCES = 8;

export class InvalidCharacterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCharacterError";
  }
}

export class CharacterNameTakenError extends Error {
  constructor(public readonly name: string) {
    super(`A character named "${name}" already exists`);
    this.name = "CharacterNameTakenError";
  }
}

export interface CharacterSummary {
  id: string;
  name: string;
  assetIds: string[];
}

export function parseCharacterName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new InvalidCharacterError("Name must be a string");
  }
  const name = raw.trim();
  if (name.length === 0) {
    throw new InvalidCharacterError("Name is required");
  }
  if (name.length > MAX_CHARACTER_NAME_LENGTH) {
    throw new InvalidCharacterError(
      `Name must be ${MAX_CHARACTER_NAME_LENGTH} characters or fewer`,
    );
  }
  return name;
}

export function parseAssetIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new InvalidCharacterError("At least one reference image is required");
  }
  if (raw.length > MAX_CHARACTER_REFERENCES) {
    throw new InvalidCharacterError(
      `At most ${MAX_CHARACTER_REFERENCES} reference images are allowed`,
    );
  }
  const ids = raw.map((value) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new InvalidCharacterError("Each reference must be an asset id");
    }
    return value;
  });
  if (new Set(ids).size !== ids.length) {
    throw new InvalidCharacterError("Duplicate reference images");
  }
  return ids;
}

export async function listCharacters(userId: string): Promise<CharacterSummary[]> {
  const characters = await prisma.character.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { references: { orderBy: { position: "asc" } } },
  });
  return characters.map((character) => ({
    id: character.id,
    name: character.name,
    assetIds: character.references.map((reference) => reference.assetId),
  }));
}

/**
 * Creates a named character from assets the user owns.
 *
 * Ownership is verified inside the transaction, exactly as job submission does
 * it — otherwise a user could name a character after someone else's images and
 * quietly gain a handle to them.
 */
export async function createCharacter(
  userId: string,
  name: string,
  assetIds: string[],
): Promise<CharacterSummary> {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.asset.findMany({
      where: { id: { in: assetIds }, userId, type: "image" },
      select: { id: true },
    });
    if (owned.length !== assetIds.length) {
      throw new InvalidCharacterError("Reference image not found");
    }

    const existing = await tx.character.findFirst({
      where: { userId, name },
      select: { id: true },
    });
    if (existing) {
      throw new CharacterNameTakenError(name);
    }

    const character = await tx.character.create({
      data: {
        userId,
        name,
        references: {
          // Position preserves the caller's order, which is what the prompt
          // addresses as "image 1", "image 2".
          create: assetIds.map((assetId, position) => ({ assetId, position })),
        },
      },
    });

    return { id: character.id, name: character.name, assetIds };
  });
}

/** Deletes a character the user owns. Returns false if it isn't theirs. */
export async function deleteCharacter(
  userId: string,
  characterId: string,
): Promise<boolean> {
  // userId is part of the WHERE, so this cannot delete another user's row.
  const result = await prisma.character.deleteMany({
    where: { id: characterId, userId },
  });
  return result.count === 1;
}
