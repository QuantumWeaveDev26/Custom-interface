import { createModelArkClient } from "@creative-ai/modelark-client";
import { buildShotPrompt, planShots, type Shot } from "@creative-ai/agents";
import {
  getCameraPreset,
  getLensPreset,
  getLookPreset,
  type LookPresetId,
} from "@creative-ai/prompt-library";
import { DIRECTOR_MODEL } from "./config";

export interface PlannedShot {
  description: string;
  cameraPreset: Shot["cameraPreset"];
  cameraLabel: string;
  /**
   * Carried alongside the label because the shot can be rewritten after
   * planning. Recomposing an edited description needs the same preset ids the
   * server composed with — a prompt rebuilt from labels would be a different
   * prompt.
   */
  lensPreset: Shot["lensPreset"];
  lensLabel: string;
  durationSeconds: number;
  prompt: string;
}

export interface PlannedFilm {
  /** One grade for every shot, so the clips read as a single piece. */
  lookLabel: string;
  /** The grade's id, for recomposing a shot the user rewrites. */
  lookPreset: LookPresetId;
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
    lookPreset: plan.lookPreset,
    shots: plan.shots.map((shot) => ({
      description: shot.description,
      cameraPreset: shot.cameraPreset,
      cameraLabel: getCameraPreset(shot.cameraPreset).label,
      lensPreset: shot.lensPreset,
      lensLabel: getLensPreset(shot.lensPreset).label,
      durationSeconds: shot.durationSeconds,
      prompt: buildShotPrompt(shot, plan.lookPreset),
    })),
  };
}
