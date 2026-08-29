import { createModelArkClient } from "@creative-ai/modelark-client";
import { buildShotPrompt, planShots, type Shot } from "@creative-ai/agents";
import { getCameraPreset, getLensPreset, getLookPreset } from "@creative-ai/prompt-library";
import { DIRECTOR_MODEL } from "./config";

export interface PlannedShot {
  description: string;
  cameraPreset: Shot["cameraPreset"];
  cameraLabel: string;
  lensLabel: string;
  durationSeconds: number;
  prompt: string;
}

export interface PlannedFilm {
  /** One grade for every shot, so the clips read as a single piece. */
  lookLabel: string;
  shots: PlannedShot[];
}

export async function planShotsForBrief(brief: string): Promise<PlannedFilm> {
  const baseUrl = process.env.ARK_BASE_URL;
  const client = createModelArkClient({
    apiKey: process.env.ARK_API_KEY || "",
    ...(baseUrl ? { baseUrl } : {}),
  });

  const plan = await planShots(client, brief, { model: DIRECTOR_MODEL });

  return {
    lookLabel: getLookPreset(plan.lookPreset).label,
    shots: plan.shots.map((shot) => ({
      description: shot.description,
      cameraPreset: shot.cameraPreset,
      cameraLabel: getCameraPreset(shot.cameraPreset).label,
      lensLabel: getLensPreset(shot.lensPreset).label,
      durationSeconds: shot.durationSeconds,
      prompt: buildShotPrompt(shot, plan.lookPreset),
    })),
  };
}
