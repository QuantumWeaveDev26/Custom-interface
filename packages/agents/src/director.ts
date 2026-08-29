import type { ChatCompletionResponse } from "@creative-ai/modelark-client";
import {
  CAMERA_PRESETS,
  LENS_PRESETS,
  LOOK_PRESETS,
  composeShotPrompt,
  isCameraPresetId,
  isLensPresetId,
  isLookPresetId,
  type CameraPresetId,
  type LensPresetId,
  type LookPresetId,
} from "@creative-ai/prompt-library";

export interface ChatClient {
  createChatCompletion(params: {
    model: string;
    messages: { role: "system" | "user" | "assistant" | "tool"; content: string }[];
    response_format?: {
      type: "json_schema";
      json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean };
    };
  }): Promise<ChatCompletionResponse>;
}

export interface Shot {
  description: string;
  cameraPreset: CameraPresetId;
  lensPreset: LensPresetId;
  durationSeconds: number;
}

export interface ShotPlan {
  /**
   * One grade for the whole plan.
   *
   * Chosen per plan rather than per shot on purpose: a film has a single look,
   * and letting the model pick a different grade for every shot produces eight
   * clips that do not belong to the same piece.
   */
  lookPreset: LookPresetId;
  shots: Shot[];
}

export class DirectorPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectorPlanError";
  }
}

const MAX_SHOTS = 8;
const MIN_SHOT_DURATION_SECONDS = 2;
const MAX_SHOT_DURATION_SECONDS = 10;
const DEFAULT_DIRECTOR_MODEL = "dola-seed-2-1-turbo-260628";

function buildSystemPrompt(): string {
  const presetList = CAMERA_PRESETS.map((preset) => `- ${preset.id}: ${preset.description}`).join(
    "\n",
  );
  return [
    "You are a film director breaking a one-line creative brief into a short shot list.",
    `Return between 1 and ${MAX_SHOTS} shots.`,
    "Each shot needs a vivid visual description (describe only what is seen, not camera direction), one camera preset id chosen from the list below, and a duration in seconds between " +
      `${MIN_SHOT_DURATION_SECONDS} and ${MAX_SHOT_DURATION_SECONDS}.`,
    "Available camera presets:",
    presetList,
  ].join("\n");
}

function shotPlanJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      lookPreset: { type: "string", enum: LOOK_PRESETS.map((preset) => preset.id) },
      shots: {
        type: "array",
        minItems: 1,
        maxItems: MAX_SHOTS,
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            cameraPreset: { type: "string", enum: CAMERA_PRESETS.map((preset) => preset.id) },
            lensPreset: { type: "string", enum: LENS_PRESETS.map((preset) => preset.id) },
            durationSeconds: { type: "number" },
          },
          required: ["description", "cameraPreset", "lensPreset", "durationSeconds"],
          additionalProperties: false,
        },
      },
    },
    required: ["lookPreset", "shots"],
    additionalProperties: false,
  };
}

export interface PlanShotsOptions {
  model?: string;
}

export async function planShots(
  client: ChatClient,
  brief: string,
  options: PlanShotsOptions = {},
): Promise<ShotPlan> {
  const trimmedBrief = brief.trim();
  if (trimmedBrief.length === 0) {
    throw new DirectorPlanError("Creative brief must not be empty");
  }

  const response = await client.createChatCompletion({
    model: options.model ?? DEFAULT_DIRECTOR_MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: trimmedBrief },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "shot_plan", schema: shotPlanJsonSchema(), strict: true },
    },
  });

  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new DirectorPlanError("Director agent returned no content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new DirectorPlanError("Director agent returned invalid JSON");
  }

  return validateShotPlan(parsed);
}

function validateShotPlan(value: unknown): ShotPlan {
  if (typeof value !== "object" || value === null || !("shots" in value)) {
    throw new DirectorPlanError("Director agent response is missing shots");
  }

  const shotsValue = (value as { shots: unknown }).shots;
  if (!Array.isArray(shotsValue) || shotsValue.length === 0) {
    throw new DirectorPlanError("Director agent returned no shots");
  }
  if (shotsValue.length > MAX_SHOTS) {
    throw new DirectorPlanError(`Director agent returned more than ${MAX_SHOTS} shots`);
  }

  const lookPreset = (value as { lookPreset?: unknown }).lookPreset;
  if (typeof lookPreset !== "string" || !isLookPresetId(lookPreset)) {
    throw new DirectorPlanError(
      `Director agent returned an unknown look: ${String(lookPreset)}`,
    );
  }

  const shots = shotsValue.map((raw, index) => validateShot(raw, index));
  return { lookPreset, shots };
}

function validateShot(raw: unknown, index: number): Shot {
  if (typeof raw !== "object" || raw === null) {
    throw new DirectorPlanError(`Shot ${index} is not an object`);
  }

  const { description, cameraPreset, lensPreset, durationSeconds } = raw as Record<
    string,
    unknown
  >;

  if (typeof description !== "string" || description.trim().length === 0) {
    throw new DirectorPlanError(`Shot ${index} is missing a description`);
  }
  if (typeof cameraPreset !== "string" || !isCameraPresetId(cameraPreset)) {
    throw new DirectorPlanError(`Shot ${index} has an unknown camera preset: ${String(cameraPreset)}`);
  }
  if (typeof lensPreset !== "string" || !isLensPresetId(lensPreset)) {
    throw new DirectorPlanError(`Shot ${index} has an unknown lens preset: ${String(lensPreset)}`);
  }
  if (
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < MIN_SHOT_DURATION_SECONDS ||
    durationSeconds > MAX_SHOT_DURATION_SECONDS
  ) {
    throw new DirectorPlanError(`Shot ${index} has an invalid duration`);
  }

  return { description: description.trim(), cameraPreset, lensPreset, durationSeconds };
}

/**
 * Composes one shot into a prompt, using the same grammar Studio uses.
 *
 * The plan's look is passed in rather than read off the shot, so every clip in
 * a plan is graded identically.
 */
export function buildShotPrompt(shot: Shot, lookPreset: LookPresetId): string {
  return composeShotPrompt({
    description: shot.description,
    cameraPresetIds: [shot.cameraPreset],
    lensPresetId: shot.lensPreset,
    lookPresetId: lookPreset,
  });
}
