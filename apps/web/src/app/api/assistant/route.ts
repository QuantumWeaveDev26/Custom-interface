import { auth } from "@/auth";
import { DIRECTOR_MODEL } from "@/server/config";
import { retrieveKnowledge } from "@/server/knowledge";
import { AssistantError, askAssistant } from "@creative-ai/agents";
import { createModelArkClient } from "@creative-ai/modelark-client";
import { NextResponse } from "next/server";

const MAX_QUESTION_LENGTH = 1000;
/**
 * How much conversation the assistant is given back.
 *
 * Enough to follow a thread, capped because every turn is re-sent on every
 * request and the whole history is billed each time.
 */
const MAX_HISTORY_TURNS = 8;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    question?: unknown;
    history?: unknown;
  } | null;

  const question = body?.question;
  if (typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json({ error: "Ask something" }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { error: `Keep it under ${MAX_QUESTION_LENGTH} characters` },
      { status: 400 },
    );
  }

  const history = Array.isArray(body?.history)
    ? body.history
        .filter(
          (turn): turn is { role: "user" | "assistant"; content: string } =>
            typeof turn === "object" &&
            turn !== null &&
            ((turn as { role?: unknown }).role === "user" ||
              (turn as { role?: unknown }).role === "assistant") &&
            typeof (turn as { content?: unknown }).content === "string",
        )
        .slice(-MAX_HISTORY_TURNS)
    : [];

  const baseUrl = process.env.ARK_BASE_URL;
  const client = createModelArkClient({
    apiKey: process.env.ARK_API_KEY || "",
    ...(baseUrl ? { baseUrl } : {}),
  });

  try {
    // Retrieval before the answer, and only when there is something stored —
    // see retrieveKnowledge. A house with no documents pays nothing for this.
    const knowledge = await retrieveKnowledge(session.user.id, question);

    return NextResponse.json(
      await askAssistant(client, question, {
        model: DIRECTOR_MODEL,
        history,
        knowledge,
      }),
    );
  } catch (error) {
    if (error instanceof AssistantError) {
      // The model's own failure, not the user's. Surfaced rather than hidden:
      // a silent generic error here is indistinguishable from the assistant
      // simply having nothing to say.
      console.error("Assistant error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("Assistant request failed:", error);
    return NextResponse.json({ error: "The assistant is unavailable" }, { status: 500 });
  }
}
