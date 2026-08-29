import assert from "node:assert/strict";
import test from "node:test";

import {
  CONSERVATIVE_VIDEO_CAPABILITIES,
  DEFAULT_VIDEO_CREDITS_PER_SECOND_720P,
  RESOLUTION_COST_MULTIPLIER,
  VIDEO_MODEL_CAPABILITIES,
  creditCostFor,
  MODEL3D_QUALITIES,
  MODEL3D_QUALITY_PRESETS,
  videoCapabilitiesFor,
  type CreditPricing,
} from "./generation.js";

const PRICING: CreditPricing = {
  imageCredits: 1,
  voiceCredits: 1,
  videoCreditsPerSecond720p: DEFAULT_VIDEO_CREDITS_PER_SECOND_720P,
  model3dCredits: 20,
};

// The single most important assertion in this file: the previous flat price for
// the previous fixed profile must survive the move to parameterized pricing, or
// every existing user silently gets repriced.
test("5s 720p video still costs exactly 14 credits", () => {
  const cost = creditCostFor(
    { type: "video", resolution: "720p", ratio: "21:9", durationSeconds: 5 },
    PRICING,
  );
  assert.equal(cost, 14);
});

test("video cost scales linearly with duration", () => {
  const ten = creditCostFor(
    { type: "video", resolution: "720p", ratio: "16:9", durationSeconds: 10 },
    PRICING,
  );
  assert.equal(ten, 28);

  const thirty = creditCostFor(
    { type: "video", resolution: "720p", ratio: "16:9", durationSeconds: 30 },
    PRICING,
  );
  assert.equal(thirty, 84);
});

test("video cost scales with resolution", () => {
  const at = (resolution: "480p" | "720p" | "1080p" | "4K") =>
    creditCostFor(
      { type: "video", resolution, ratio: "16:9", durationSeconds: 5 },
      PRICING,
    );

  assert.equal(at("480p"), 7); // 2.8 * 5 * 0.5
  assert.equal(at("720p"), 14); // 2.8 * 5 * 1
  assert.equal(at("1080p"), 32); // 2.8 * 5 * 2.25 = 31.5 -> ceil
  assert.equal(at("4K"), 126); // 2.8 * 5 * 9
});

test("cost always rounds up, never down", () => {
  // 2.8 * 4 * 0.5 = 5.6 -> must not round to 5
  const cost = creditCostFor(
    { type: "video", resolution: "480p", ratio: "16:9", durationSeconds: 4 },
    PRICING,
  );
  assert.equal(cost, 6);
});

test("cost is never zero even at the smallest settings", () => {
  const nearlyFree: CreditPricing = {
    imageCredits: 0,
    voiceCredits: 0,
    videoCreditsPerSecond720p: 0,
  model3dCredits: 20,
  };
  assert.equal(creditCostFor({ type: "image", size: "2K", count: 1 }, nearlyFree), 1);
  assert.equal(creditCostFor({ type: "voice", style: "standard" }, nearlyFree), 1);
  assert.equal(
    creditCostFor(
      { type: "video", resolution: "480p", ratio: "16:9", durationSeconds: 4 },
      nearlyFree,
    ),
    1,
  );
});

test("image and voice are flat-priced regardless of settings", () => {
  assert.equal(creditCostFor({ type: "image", size: "2K", count: 1 }, PRICING), 1);
  assert.equal(creditCostFor({ type: "image", size: "4K", count: 1 }, PRICING), 1);
  assert.equal(creditCostFor({ type: "voice", style: "standard" }, PRICING), 1);
  assert.equal(creditCostFor({ type: "voice", style: "expressive" }, PRICING), 1);
});

test("a higher configured rate raises video cost proportionally", () => {
  const pricier: CreditPricing = { ...PRICING, videoCreditsPerSecond720p: 5.6 };
  const cost = creditCostFor(
    { type: "video", resolution: "720p", ratio: "21:9", durationSeconds: 5 },
    pricier,
  );
  assert.equal(cost, 28);
});

test("resolution multipliers never under-charge relative to pixel count", () => {
  // 480p is ~0.34x of 720p by pixels; billing it at 0.5x is deliberate headroom.
  assert.ok(RESOLUTION_COST_MULTIPLIER["480p"] >= 0.34);
  assert.equal(RESOLUTION_COST_MULTIPLIER["720p"], 1);
  assert.ok(RESOLUTION_COST_MULTIPLIER["1080p"] >= 2.25);
  assert.ok(RESOLUTION_COST_MULTIPLIER["4K"] >= 9);
});

// --- Model capabilities -----------------------------------------------------

test("known models resolve to their documented capabilities", () => {
  const fast = videoCapabilitiesFor("dreamina-seedance-2-0-fast-260128");
  assert.deepEqual([...fast.resolutions], ["480p", "720p"]);
  assert.equal(fast.maxDurationSeconds, 15);

  const latest = videoCapabilitiesFor("dreamina-seedance-2-5-260628");
  assert.ok(latest.resolutions.includes("1080p"));
  assert.equal(latest.maxDurationSeconds, 30);
});

test("an unknown model falls back to the conservative set, not an open one", () => {
  const unknown = videoCapabilitiesFor("not-a-registered-model");
  assert.deepEqual(unknown, CONSERVATIVE_VIDEO_CAPABILITIES);
  assert.equal(unknown.resolutions.includes("4K"), false);
  assert.equal(unknown.maxDurationSeconds, 5);
});

test("the capability registry is frozen against mutation", () => {
  assert.equal(Object.isFrozen(VIDEO_MODEL_CAPABILITIES), true);
  assert.equal(
    Reflect.set(VIDEO_MODEL_CAPABILITIES, "injected-model", {}),
    false,
  );
});

// --- 3D generation (C8) -----------------------------------------------------

test("3D cost scales with the polygon budget, standard being the reference", () => {
  assert.equal(creditCostFor({ type: "model3d", quality: "standard" }, PRICING), 20);
  // draft is 100k of standard's 500k, high is 1M.
  assert.equal(creditCostFor({ type: "model3d", quality: "draft" }, PRICING), 4);
  assert.equal(creditCostFor({ type: "model3d", quality: "high" }, PRICING), 40);
});

test("every 3D quality preset stays inside the documented polygon range", () => {
  // The Model list documents 500 to 1,000,000 for a triangular mesh. Shipping a
  // value outside it repeats the "1K image size" mistake: an option the picker
  // offers and the provider has never accepted.
  for (const quality of MODEL3D_QUALITIES) {
    const budget = MODEL3D_QUALITY_PRESETS[quality];
    assert.ok(budget >= 500 && budget <= 1_000_000, quality);
  }
});
