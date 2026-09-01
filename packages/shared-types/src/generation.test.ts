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
  videoModelForResolution,
  type CreditPricing,
} from "./generation.js";

const PRICING: CreditPricing = {
  imageCredits: 1,
  voiceCredits: 1,
  videoCreditsPerSecond720p: DEFAULT_VIDEO_CREDITS_PER_SECOND_720P,
  model3dCredits: 20,
  videoModels: ["dreamina-seedance-2-5-260628", "dreamina-seedance-2-0-260128"],
};

// This assertion previously pinned 14 credits for 5s/720p, protecting the old
// fixed price through the move to parameterized pricing. That anchor is gone on
// purpose: the default model changed from seedance-2-0-fast to seedance-2-5,
// which costs roughly twice as much per second, and repricing was the point of
// the change rather than an accident of it.
//
// It now pins the new derivation instead, so the rate still cannot drift
// silently: $3.46 per 15s at 720p, 1 credit ~= $0.04, giving 5.77 credits a
// second. 5.77 x 5 x 1.0 = 28.85, rounded up.
test("5s 720p video costs 29 credits on seedance-2-5", () => {
  const cost = creditCostFor(
    { type: "video", resolution: "720p", ratio: "21:9", durationSeconds: 5, withAudio: false, rounds: 1 },
    PRICING,
  );
  assert.equal(cost, 29);
});

test("video cost scales linearly with duration", () => {
  const ten = creditCostFor(
    { type: "video", resolution: "720p", ratio: "16:9", durationSeconds: 10, withAudio: false, rounds: 1 },
    PRICING,
  );
  assert.equal(ten, 58);

  // 30s is now reachable — it is exactly what the model change bought.
  const thirty = creditCostFor(
    { type: "video", resolution: "720p", ratio: "16:9", durationSeconds: 30, withAudio: false, rounds: 1 },
    PRICING,
  );
  assert.equal(thirty, 174);
});

test("video cost scales with resolution", () => {
  const at = (resolution: "480p" | "720p" | "1080p" | "4K") =>
    creditCostFor(
      { type: "video", resolution, ratio: "16:9", durationSeconds: 5, withAudio: false, rounds: 1 },
      PRICING,
    );

  assert.equal(at("480p"), 15); // 5.77 * 5 * 0.5 = 14.425 -> ceil
  assert.equal(at("720p"), 29); // 5.77 * 5 * 1 = 28.85 -> ceil
  assert.equal(at("1080p"), 65); // 5.77 * 5 * 2.25 = 64.91 -> ceil
  // 4K is unreachable on the current default model, which tops out at 1080p.
  // The 9x multiplier behind this number is still UNCONFIRMED; it is asserted
  // only so the arithmetic cannot drift unnoticed if a 4K model is adopted.
  assert.equal(at("4K"), 260); // 5.77 * 5 * 9 = 259.65 -> ceil
});

test("cost always rounds up, never down", () => {
  // 5.77 * 4 * 0.5 = 11.54 -> must not round to 11
  const cost = creditCostFor(
    { type: "video", resolution: "480p", ratio: "16:9", durationSeconds: 4, withAudio: false, rounds: 1 },
    PRICING,
  );
  assert.equal(cost, 12);
});

test("cost is never zero even at the smallest settings", () => {
  const nearlyFree: CreditPricing = {
    imageCredits: 0,
    voiceCredits: 0,
    videoCreditsPerSecond720p: 0,
    model3dCredits: 20,
    // Empty, so the fallback rate above is what gets used — this test is about
    // the floor, not about which model serves the request.
    videoModels: [],
  };
  assert.equal(creditCostFor({ type: "image", size: "2K", count: 1 }, nearlyFree), 1);
  assert.equal(creditCostFor({ type: "voice", style: "standard" }, nearlyFree), 1);
  assert.equal(
    creditCostFor(
      { type: "video", resolution: "480p", ratio: "16:9", durationSeconds: 4, withAudio: false, rounds: 1 },
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

test("the fallback rate applies when no model claims the resolution", () => {
  // Video pricing normally comes from the model the resolution routes to.
  // videoCreditsPerSecond720p is the fallback for a resolution none of the
  // configured models can serve, so an empty model list exercises it.
  const pricier: CreditPricing = {
    ...PRICING,
    videoCreditsPerSecond720p: 5.6,
    videoModels: [],
  };
  const cost = creditCostFor(
    { type: "video", resolution: "720p", ratio: "21:9", durationSeconds: 5, withAudio: false, rounds: 1 },
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

// --- Resolution routes to a model (4K) --------------------------------------

test("4K routes to the model that supports it, not the default", () => {
  // No single model does both 30s and 4K: 2.5 stops at 1080p, 2.0 stops at 15s.
  const models = ["dreamina-seedance-2-5-260628", "dreamina-seedance-2-0-260128"];

  assert.equal(videoModelForResolution("720p", models), "dreamina-seedance-2-5-260628");
  assert.equal(videoModelForResolution("1080p", models), "dreamina-seedance-2-5-260628");
  assert.equal(videoModelForResolution("4K", models), "dreamina-seedance-2-0-260128");
});

test("order expresses preference, so 1080p can be served by either", () => {
  const fourKFirst = ["dreamina-seedance-2-0-260128", "dreamina-seedance-2-5-260628"];
  assert.equal(
    videoModelForResolution("1080p", fourKFirst),
    "dreamina-seedance-2-0-260128",
  );
});

test("a resolution no configured model claims routes nowhere", () => {
  // The caller then falls back rather than silently billing at a rate that
  // belongs to a model which cannot serve the request.
  assert.equal(videoModelForResolution("4K", ["dreamina-seedance-2-5-260628"]), null);
});

test("4K is priced from its own model, not the default rate", () => {
  const cost = creditCostFor(
    { type: "video", resolution: "4K", ratio: "16:9", durationSeconds: 5, withAudio: false, rounds: 1 },
    PRICING,
  );
  // 2.0's rate (5.77) x 5s x the 9x 4K multiplier. That multiplier is still
  // UNCONFIRMED — this pins the arithmetic, not the multiplier's truth.
  assert.equal(cost, 260);
});
