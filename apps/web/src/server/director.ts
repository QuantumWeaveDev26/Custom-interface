import { createModelArkClient } from "@creative-ai/modelark-client";
import { buildShotPrompt, planShots, type Shot } from "@creative-ai/agents";
import { getCameraPreset } from "@creative-ai/prompt-library";
import { DIRECTOR_MODEL } from "./config";

export interface PlannedShot {
  description: string;
  cameraPreset: Shot["cameraPreset"];
  cameraLabel: string;
  durationSeconds: number;
  prompt: string;
}

export async function planShotsForBrief(brief: string): Promise<PlannedShot[]> {
  const baseUrl = process.env.ARK_BASE_URL;
  const client = createModelArkClient({
    apiKey: process.env.ARK_API_KEY || "",
    ...(baseUrl ? { baseUrl } : {}),
  });

  const plan = await planShots(client, brief, { model: DIRECTOR_MODEL });

  return plan.shots.map((shot) => ({
    description: shot.description,
    cameraPreset: shot.cameraPreset,
    cameraLabel: getCameraPreset(shot.cameraPreset).label,
    durationSeconds: shot.durationSeconds,
    prompt: buildShotPrompt(shot),
  }));
}
