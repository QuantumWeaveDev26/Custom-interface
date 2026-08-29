import assert from "node:assert/strict";
import test from "node:test";

import { CAMERA_PRESETS } from "./camera-presets.js";
import {
  LENS_PRESETS,
  LOOK_PRESETS,
  composeShotPrompt,
  getLensPreset,
  getLookPreset,
  isLensPresetId,
  isLookPresetId,
} from "./shot-grammar.js";

test("every preset id is unique within its axis", () => {
  for (const presets of [CAMERA_PRESETS, LENS_PRESETS, LOOK_PRESETS]) {
    const ids = presets.map((preset) => preset.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("every preset carries a non-empty fragment", () => {
  for (const presets of [CAMERA_PRESETS, LENS_PRESETS, LOOK_PRESETS]) {
    for (const preset of presets) {
      assert.ok(preset.promptFragment.trim().length > 0, preset.id);
      assert.ok(preset.label.trim().length > 0, preset.id);
    }
  }
});

test("lookups reject unknown ids rather than returning undefined", () => {
  assert.throws(() => getLensPreset("nope" as never));
  assert.throws(() => getLookPreset("nope" as never));
  assert.equal(isLensPresetId("portrait"), true);
  assert.equal(isLensPresetId("nope"), false);
  assert.equal(isLookPresetId("film-noir"), true);
  assert.equal(isLookPresetId("nope"), false);
});

test("a description with no presets is returned untouched", () => {
  assert.equal(composeShotPrompt({ description: "a fox in snow" }), "a fox in snow");
});

test("the description leads and presets trail it", () => {
  const composed = composeShotPrompt({
    description: "a fox in snow",
    cameraPresetIds: ["dolly-in"],
    lookPresetId: "golden-hour",
  });

  // Early tokens carry the most weight, so the subject must come first.
  assert.ok(composed.startsWith("a fox in snow,"));
  assert.ok(composed.includes("dolly-in"));
  assert.ok(composed.includes("golden hour"));
});

test("stacked camera moves keep their selection order", () => {
  const composed = composeShotPrompt({
    description: "a fox in snow",
    cameraPresetIds: ["dolly-in", "tilt-up"],
  });

  // "dolly in, then tilt up" is a sequence; reordering changes the shot.
  assert.ok(composed.indexOf("dolly-in") < composed.indexOf("tilt upward"));
});

test("a repeated camera move is collapsed rather than duplicated", () => {
  const composed = composeShotPrompt({
    description: "a fox in snow",
    cameraPresetIds: ["orbit", "orbit"],
  });

  assert.equal(composed.split("orbit shot").length - 1, 1);
});

test("axes are ordered camera, then lens, then look", () => {
  const composed = composeShotPrompt({
    description: "a fox in snow",
    cameraPresetIds: ["orbit"],
    lensPresetId: "anamorphic",
    lookPresetId: "low-key",
  });

  assert.ok(composed.indexOf("orbit shot") < composed.indexOf("anamorphic"));
  assert.ok(composed.indexOf("anamorphic") < composed.indexOf("low-key"));
});

test("presets alone compose without a leading comma", () => {
  const composed = composeShotPrompt({
    description: "  ",
    lookPresetId: "cinematic",
  });

  assert.equal(composed.startsWith(","), false);
  assert.ok(composed.startsWith("cinematic"));
});
