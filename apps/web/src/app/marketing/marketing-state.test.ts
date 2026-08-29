import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_MARKETING_STATE,
  marketingReducer,
  type MarketingDirectionResult,
  type MarketingProduct,
  type MarketingState,
} from "./marketing-state.js";

const SAMPLE_PRODUCT: MarketingProduct = {
  url: "https://example.test/product",
  title: "Cool Sneakers",
  description: "The best sneakers ever made.",
  imageUrl: "https://example.test/sneaker.png",
};

const SAMPLE_DIRECTION: MarketingDirectionResult = {
  style: "cinematic",
  tagline: "Step into tomorrow",
  prompt: "A pair of sneakers glowing under dramatic studio light",
  cameraLabel: "Orbit",
  lensLabel: "Macro 100mm",
  lookLabel: "Low Key",
  composedPrompt:
    "A pair of sneakers glowing under dramatic studio light, cinematic orbit shot",
};

test("starts idle with an empty url", () => {
  assert.equal(INITIAL_MARKETING_STATE.phase, "idle");
  assert.equal(INITIAL_MARKETING_STATE.url, "");
});

test("set url updates only the url field", () => {
  const next = marketingReducer(INITIAL_MARKETING_STATE, {
    type: "SET_URL",
    url: "https://example.test/product",
  });
  assert.equal(next.url, "https://example.test/product");
  assert.equal(next.phase, "idle");
});

test("plan start moves to planning and clears prior results", () => {
  const state: MarketingState = {
    ...INITIAL_MARKETING_STATE,
    phase: "failed",
    errorMessage: "old error",
    product: SAMPLE_PRODUCT,
    direction: SAMPLE_DIRECTION,
  };
  const next = marketingReducer(state, { type: "PLAN_START" });
  assert.equal(next.phase, "planning");
  assert.equal(next.errorMessage, null);
  assert.equal(next.product, null);
  assert.equal(next.direction, null);
});

test("plan success stores the product and direction", () => {
  const state: MarketingState = { ...INITIAL_MARKETING_STATE, phase: "planning" };
  const next = marketingReducer(state, {
    type: "PLAN_SUCCESS",
    product: SAMPLE_PRODUCT,
    direction: SAMPLE_DIRECTION,
  });
  assert.equal(next.phase, "planned");
  assert.deepEqual(next.product, SAMPLE_PRODUCT);
  assert.deepEqual(next.direction, SAMPLE_DIRECTION);
});

test("plan error stores a message and clears results", () => {
  const state: MarketingState = { ...INITIAL_MARKETING_STATE, phase: "planning" };
  const next = marketingReducer(state, { type: "PLAN_ERROR", message: "Could not reach the URL" });
  assert.equal(next.phase, "failed");
  assert.equal(next.errorMessage, "Could not reach the URL");
  assert.equal(next.product, null);
});
