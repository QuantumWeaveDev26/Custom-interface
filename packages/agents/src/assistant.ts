import type { ChatClient } from "./director.js";

/**
 * The assistant that knows this platform.
 *
 * It answers in two parts: something to say, and at most one action to offer.
 * The action is offered, never performed here — an assistant that submits paid
 * work because it read a sentence a particular way is a way to spend someone
 * else's money on a misreading. The interface presents it; the user presses it.
 *
 * Built on JSON-schema structured output rather than tool calling, because
 * structured output is the contract this account is known to honour — Director
 * and Marketing have run on it for days — while tool calling has never been
 * tried here. Once it has been, this becomes a small change.
 */

export type AssistantActionType =
  | "none"
  | "open"
  | "plan_film"
  | "generate"
  | "search_library";

export interface AssistantAction {
  type: AssistantActionType;
  /** For "open": a route in this app. */
  route?: string;
  /** The brief to plan, the prompt to generate, or the query to search. */
  text?: string;
  /** For "generate": which department does the work. */
  mode?: "image" | "video" | "voice" | "model3d";
}

export interface AssistantReply {
  reply: string;
  action: AssistantAction;
}

export class AssistantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantError";
  }
}

export const ASSISTANT_ROUTES = [
  "/studio",
  "/director",
  "/marketing",
  "/transcribe",
  "/voice-clone",
  "/gallery",
  "/feed",
] as const;

export const DEFAULT_ASSISTANT_MODEL = "deepseek-v3";

/**
 * What the assistant knows about the product it lives in.
 *
 * Written from the system as it actually is, limits included. An assistant that
 * promises 4K at thirty seconds, or a face swap on a photograph, produces a
 * failed job and a confused user — every number here is one this project has
 * confirmed against the provider.
 */
export function buildAssistantSystemPrompt(knowledge: string): string {
  const lines = [
    "You are the in-house assistant for Creative AI, a generative film studio.",
    "Answer briefly and concretely. Never invent a capability.",
    "",
    "WHAT THE PLATFORM DOES",
    "- Studio: images (up to 15 in a batch), video, voice, and 3D meshes.",
    "- Director: turns a one-line brief into a shot list, each shot with a camera move, a lens and a duration, all graded alike. Shots can be rewritten before filming, and the whole plan can be filmed as one continuous piece.",
    "- Marketing: reads a product page and proposes an ad direction.",
    "- Transcribe: speech to text. Voice Clone: currently blocked at the provider.",
    "- Gallery: everything made, searchable by meaning, with per-asset publishing to the Feed.",
    "",
    "HARD LIMITS, ALL CONFIRMED - never promise past them",
    "- A clip is at most 30s at 720p or 1080p, and at most 15s at 4K, because 4K runs on an older model.",
    "- Longer pieces are chains: up to 16 clips, each continuing the last, joined into one film. They run one at a time, minutes per clip, so an eight-minute film takes hours.",
    "- The provider rejects input images that may show a real person. A character must be built from images generated here, and stops being accepted 30 days after it was made.",
    "- Video comes back with sound by default.",
    "- Everything costs credits: video priced per second, images per image.",
    "",
    "FILM CRAFT",
    "Speak like someone who has been on a set. A shot has a lens and a move for a",
    "reason: a long lens flattens and isolates, a wide one implies space and",
    "context. Cutting between wildly different focal lengths reads as a different",
    "film. One grade holds a sequence together.",
  ];

  if (knowledge.trim().length > 0) {
    lines.push(
      "",
      "HOUSE KNOWLEDGE",
      "Passages retrieved for this question, each tagged with the library it came",
      "from. When they disagree, this is the order of authority:",
      "1. what the user just told you;",
      "2. [project] — this film's own bible, characters, wardrobe, decisions;",
      "3. [policy] — rights, consent, what may be licensed or sold;",
      "4. [platform] — how this product works;",
      "5. [filmmaking] — general craft.",
      "A project decision beats general practice. If the bible says the night",
      "interiors are cyan, cyan is the answer, whatever the textbook prefers.",
      "Never state a project fact — a character's wardrobe, a rights status, an",
      "approval — that is not in these passages. Say you do not have it.",
      "",
      knowledge.trim(),
    );
  }

  lines.push(
    "",
    "ACTIONS",
    "Offer at most one, and only when it plainly answers the request:",
    "- open: send them to a page. route must be one of " +
      ASSISTANT_ROUTES.join(", ") +
      ".",
    "- plan_film: they described something to film. text is the brief.",
    "- generate: they asked for one specific thing. text is the prompt, mode is the department.",
    "- search_library: they are looking for something they already made. text is the query.",
    "- none: anything else, including questions you simply answer.",
    "Never claim to have done the action. The user presses it themselves.",
  );

  return lines.join("\n");
}

function assistantJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["reply", "action"],
    properties: {
      reply: { type: "string" },
      action: {
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: {
            type: "string",
            enum: ["none", "open", "plan_film", "generate", "search_library"],
          },
          route: { type: "string", enum: [...ASSISTANT_ROUTES] },
          text: { type: "string" },
          mode: { type: "string", enum: ["image", "video", "voice", "model3d"] },
        },
      },
    },
  };
}

export interface AskAssistantOptions {
  model?: string;
  /** Retrieved house knowledge, already selected for this question. */
  knowledge?: string;
  /** Prior turns, oldest first, so the assistant can follow a conversation. */
  history?: readonly { role: "user" | "assistant"; content: string }[];
}

export async function askAssistant(
  client: ChatClient,
  question: string,
  options: AskAssistantOptions = {},
): Promise<AssistantReply> {
  const trimmed = question.trim();
  if (trimmed.length === 0) {
    throw new AssistantError("Ask something");
  }

  const response = await client.createChatCompletion({
    model: options.model ?? DEFAULT_ASSISTANT_MODEL,
    messages: [
      {
        role: "system",
        content: buildAssistantSystemPrompt(options.knowledge ?? ""),
      },
      ...(options.history ?? []).map((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
      { role: "user", content: trimmed },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "assistant_reply",
        schema: assistantJsonSchema(),
        strict: true,
      },
    },
  });

  const content = response.choices[0]?.message.content;
  if (!content) throw new AssistantError("The assistant returned nothing");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AssistantError("The assistant returned invalid JSON");
  }

  return validateAssistantReply(parsed);
}

/**
 * Checked rather than trusted.
 *
 * A model that names a route we do not have sends the user to a 404, and a mode
 * we do not run reaches the job API as a rejection. Both are cheap to catch here
 * and confusing to debug anywhere else.
 */
export function validateAssistantReply(value: unknown): AssistantReply {
  if (typeof value !== "object" || value === null) {
    throw new AssistantError("The assistant returned a non-object");
  }
  const candidate = value as { reply?: unknown; action?: unknown };
  if (typeof candidate.reply !== "string" || candidate.reply.trim().length === 0) {
    throw new AssistantError("The assistant returned no reply");
  }
  if (typeof candidate.action !== "object" || candidate.action === null) {
    throw new AssistantError("The assistant returned no action");
  }

  const action = candidate.action as Record<string, unknown>;
  const type = action.type;
  if (
    type !== "none" &&
    type !== "open" &&
    type !== "plan_film" &&
    type !== "generate" &&
    type !== "search_library"
  ) {
    throw new AssistantError("Unknown assistant action: " + String(type));
  }

  if (type === "open") {
    if (
      typeof action.route !== "string" ||
      !ASSISTANT_ROUTES.includes(action.route as (typeof ASSISTANT_ROUTES)[number])
    ) {
      throw new AssistantError("The assistant named a page that does not exist");
    }
  }

  if (type === "plan_film" || type === "generate" || type === "search_library") {
    if (typeof action.text !== "string" || action.text.trim().length === 0) {
      throw new AssistantError("The " + type + " action carries no text");
    }
  }

  if (type === "generate") {
    const mode = action.mode;
    if (mode !== "image" && mode !== "video" && mode !== "voice" && mode !== "model3d") {
      throw new AssistantError("The generate action names no department");
    }
  }

  const mode = action.mode;
  return {
    reply: candidate.reply.trim(),
    action: {
      type,
      ...(typeof action.route === "string" ? { route: action.route } : {}),
      ...(typeof action.text === "string" ? { text: action.text.trim() } : {}),
      ...(mode === "image" || mode === "video" || mode === "voice" || mode === "model3d"
        ? { mode }
        : {}),
    },
  };
}
