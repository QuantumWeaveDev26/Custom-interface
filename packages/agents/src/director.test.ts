import assert from "node:assert/strict";
import test from "node:test";

import { buildShotPrompt, DirectorPlanError, planShots } from "./director.js";
import type { ChatClient } from "./director.js";

function fakeChatClient(content: string): ChatClient {
  return {
    createChatCompletion: async () => ({
      id: "chatcmpl-1",
      model: "seed-2-1",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    }),
  };
}

test("rejects an empty creative brief before calling the model", async () => {
  const client = fakeChatClient("{}");
  await assert.rejects(planShots(client, "   "), DirectorPlanError);
});

test("parses a valid shot plan from the model response", async () => {
  const client = fakeChatClient(
    JSON.stringify({
      lookPreset: "golden-hour",
      shots: [
        { description: "A lone figure walks across a desert", cameraPreset: "aerial", lensPreset: "wide", durationSeconds: 5 },
        { description: "Close on the figure's determined eyes", cameraPreset: "close-up", lensPreset: "portrait", durationSeconds: 3 },
      ],
    }),
  );

  const plan = await planShots(client, "A lone traveler crosses a vast desert");

  assert.equal(plan.shots.length, 2);
  assert.equal(plan.shots[0]?.cameraPreset, "aerial");
  assert.equal(plan.shots[1]?.durationSeconds, 3);
  assert.equal(plan.lookPreset, "golden-hour");
  assert.equal(plan.shots[0]?.lensPreset, "wide");
});

test("rejects a plan with no look, since every shot is graded with it", async () => {
  const client = fakeChatClient(
    JSON.stringify({
      shots: [{ description: "x", cameraPreset: "static", lensPreset: "wide", durationSeconds: 5 }],
    }),
  );
  await assert.rejects(planShots(client, "brief"), DirectorPlanError);
});

test("rejects a shot with an unknown lens preset", async () => {
  const client = fakeChatClient(
    JSON.stringify({
      lookPreset: "cinematic",
      shots: [{ description: "x", cameraPreset: "static", lensPreset: "not-real", durationSeconds: 5 }],
    }),
  );
  await assert.rejects(planShots(client, "brief"), DirectorPlanError);
});

test("rejects a response with no shots", async () => {
  const client = fakeChatClient(JSON.stringify({ lookPreset: "cinematic", shots: [] }));
  await assert.rejects(planShots(client, "brief"), DirectorPlanError);
});

test("rejects a response with an unknown camera preset", async () => {
  const client = fakeChatClient(
    JSON.stringify({ lookPreset: "cinematic", shots: [{ description: "x", cameraPreset: "not-real", lensPreset: "wide", durationSeconds: 5 }] }),
  );
  await assert.rejects(planShots(client, "brief"), DirectorPlanError);
});

test("rejects a response with an out-of-range duration", async () => {
  const client = fakeChatClient(
    JSON.stringify({ lookPreset: "cinematic", shots: [{ description: "x", cameraPreset: "static", lensPreset: "wide", durationSeconds: 999 }] }),
  );
  await assert.rejects(planShots(client, "brief"), DirectorPlanError);
});

test("rejects malformed JSON from the model", async () => {
  const client = fakeChatClient("not json");
  await assert.rejects(planShots(client, "brief"), DirectorPlanError);
});

test("buildShotPrompt stacks camera, lens, and the plan's look behind the description", () => {
  const prompt = buildShotPrompt(
    {
      description: "A lone figure walks across a desert",
      cameraPreset: "aerial",
      lensPreset: "telephoto",
      durationSeconds: 5,
    },
    "golden-hour",
  );

  assert.ok(prompt.startsWith("A lone figure walks across a desert,"));
  assert.match(prompt, /aerial drone shot/);
  assert.match(prompt, /200mm telephoto/);
  assert.match(prompt, /golden hour/);
});

test("every shot in a plan is graded with the same look", () => {
  // A different grade per shot produces clips that do not belong to one film,
  // which is why look lives on the plan rather than on the shot.
  const shots = [
    { description: "wide desert", cameraPreset: "aerial", lensPreset: "wide", durationSeconds: 5 },
    { description: "tight eyes", cameraPreset: "close-up", lensPreset: "portrait", durationSeconds: 3 },
  ] as const;

  for (const shot of shots) {
    assert.match(buildShotPrompt(shot, "film-noir"), /film noir lighting/);
  }
});
