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
      shots: [
        { description: "A lone figure walks across a desert", cameraPreset: "aerial", durationSeconds: 5 },
        { description: "Close on the figure's determined eyes", cameraPreset: "close-up", durationSeconds: 3 },
      ],
    }),
  );

  const plan = await planShots(client, "A lone traveler crosses a vast desert");

  assert.equal(plan.shots.length, 2);
  assert.equal(plan.shots[0]?.cameraPreset, "aerial");
  assert.equal(plan.shots[1]?.durationSeconds, 3);
});

test("rejects a response with no shots", async () => {
  const client = fakeChatClient(JSON.stringify({ shots: [] }));
  await assert.rejects(planShots(client, "brief"), DirectorPlanError);
});

test("rejects a response with an unknown camera preset", async () => {
  const client = fakeChatClient(
    JSON.stringify({ shots: [{ description: "x", cameraPreset: "not-real", durationSeconds: 5 }] }),
  );
  await assert.rejects(planShots(client, "brief"), DirectorPlanError);
});

test("rejects a response with an out-of-range duration", async () => {
  const client = fakeChatClient(
    JSON.stringify({ shots: [{ description: "x", cameraPreset: "static", durationSeconds: 999 }] }),
  );
  await assert.rejects(planShots(client, "brief"), DirectorPlanError);
});

test("rejects malformed JSON from the model", async () => {
  const client = fakeChatClient("not json");
  await assert.rejects(planShots(client, "brief"), DirectorPlanError);
});

test("buildShotPrompt combines the shot description with the preset's prompt fragment", () => {
  const prompt = buildShotPrompt({
    description: "A lone figure walks across a desert",
    cameraPreset: "aerial",
    durationSeconds: 5,
  });
  assert.match(prompt, /A lone figure walks across a desert/);
  assert.match(prompt, /aerial drone shot/);
});
