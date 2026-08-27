import assert from "node:assert/strict";
import test from "node:test";

import { CAMERA_PRESETS, getCameraPreset, isCameraPresetId } from "./camera-presets.js";

test("exposes at least ten distinct camera presets", () => {
  assert.ok(CAMERA_PRESETS.length >= 10);
  const ids = new Set(CAMERA_PRESETS.map((preset) => preset.id));
  assert.equal(ids.size, CAMERA_PRESETS.length);
});

test("every preset has a non-empty label, description, and prompt fragment", () => {
  for (const preset of CAMERA_PRESETS) {
    assert.ok(preset.label.trim().length > 0);
    assert.ok(preset.description.trim().length > 0);
    assert.ok(preset.promptFragment.trim().length > 0);
  }
});

test("getCameraPreset returns the matching preset", () => {
  const preset = getCameraPreset("dolly-in");
  assert.equal(preset.label, "Dolly In");
});

test("getCameraPreset throws on an unknown id", () => {
  assert.throws(() => getCameraPreset("not-a-real-preset" as never));
});

test("isCameraPresetId narrows valid and rejects invalid ids", () => {
  assert.equal(isCameraPresetId("static"), true);
  assert.equal(isCameraPresetId("not-a-real-preset"), false);
});
