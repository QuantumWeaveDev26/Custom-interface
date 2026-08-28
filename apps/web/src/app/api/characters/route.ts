import { auth } from "@/auth";
import {
  CharacterNameTakenError,
  InvalidCharacterError,
  createCharacter,
  listCharacters,
  parseAssetIds,
  parseCharacterName,
} from "@/server/characters";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ characters: await listCharacters(session.user.id) });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    const raw = (body ?? {}) as { name?: unknown; assetIds?: unknown };
    const name = parseCharacterName(raw.name);
    const assetIds = parseAssetIds(raw.assetIds);

    const character = await createCharacter(session.user.id, name, assetIds);
    return NextResponse.json({ character }, { status: 201 });
  } catch (error) {
    if (error instanceof CharacterNameTakenError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof InvalidCharacterError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Character create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
