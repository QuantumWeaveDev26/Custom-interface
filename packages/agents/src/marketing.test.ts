import assert from "node:assert/strict";
import test from "node:test";

import {
  MarketingPlanError,
  MarketingScrapeError,
  proposeCreativeDirection,
  scrapeProductPage,
} from "./marketing.js";
import type { ChatClient } from "./director.js";

function htmlResponse(html: string, init: ResponseInit = {}): Response {
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
    ...init,
  });
}

function fakeChatClient(content: string): ChatClient {
  return {
    createChatCompletion: async () => ({
      id: "chatcmpl-1",
      model: "seed-2-1",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    }),
  };
}

test("rejects a non-http(s) URL before fetching", async () => {
  await assert.rejects(
    scrapeProductPage("file:///etc/passwd", { fetch: async () => htmlResponse("") }),
    MarketingScrapeError,
  );
});

test("rejects localhost and private IP literals (SSRF guard)", async () => {
  const neverCalled = async () => {
    throw new Error("fetch should not be called");
  };
  await assert.rejects(scrapeProductPage("http://localhost:5432", { fetch: neverCalled }));
  await assert.rejects(scrapeProductPage("http://127.0.0.1/", { fetch: neverCalled }));
  await assert.rejects(scrapeProductPage("http://192.168.1.1/", { fetch: neverCalled }));
  await assert.rejects(scrapeProductPage("http://169.254.169.254/latest/meta-data/", { fetch: neverCalled }));
});

test("rejects a malformed URL", async () => {
  await assert.rejects(scrapeProductPage("not a url", { fetch: async () => htmlResponse("") }));
});

test("extracts title, description, and image from OpenGraph tags", async () => {
  const html = `
    <html><head>
      <meta property="og:title" content="Cool Sneakers" />
      <meta property="og:description" content="The best sneakers ever made." />
      <meta property="og:image" content="https://example.test/sneaker.png" />
    </head></html>
  `;
  const product = await scrapeProductPage("https://example.test/product", {
    fetch: async () => htmlResponse(html),
  });
  assert.equal(product.title, "Cool Sneakers");
  assert.equal(product.description, "The best sneakers ever made.");
  assert.equal(product.imageUrl, "https://example.test/sneaker.png");
});

test("falls back to <title> and <meta name=description> when OG tags are absent", async () => {
  const html = `
    <html><head>
      <title>Fallback Title</title>
      <meta name="description" content="Fallback description text" />
    </head></html>
  `;
  const product = await scrapeProductPage("https://example.test/product", {
    fetch: async () => htmlResponse(html),
  });
  assert.equal(product.title, "Fallback Title");
  assert.equal(product.description, "Fallback description text");
  assert.equal(product.imageUrl, null);
});

test("throws when the page has no title at all", async () => {
  await assert.rejects(
    scrapeProductPage("https://example.test/product", { fetch: async () => htmlResponse("<html></html>") }),
    MarketingScrapeError,
  );
});

test("throws on a non-2xx response", async () => {
  await assert.rejects(
    scrapeProductPage("https://example.test/missing", {
      fetch: async () => htmlResponse("not found", { status: 404 }),
    }),
    MarketingScrapeError,
  );
});

test("throws when fetch itself fails", async () => {
  await assert.rejects(
    scrapeProductPage("https://example.test/product", {
      fetch: async () => {
        throw new Error("network down");
      },
    }),
    MarketingScrapeError,
  );
});

test("parses a valid creative direction from the model response", async () => {
  const client = fakeChatClient(
    JSON.stringify({
      style: "cinematic",
      tagline: "Step into tomorrow",
      prompt: "A pair of sneakers glowing under dramatic studio light",
    }),
  );
  const direction = await proposeCreativeDirection(client, {
    url: "https://example.test/product",
    title: "Cool Sneakers",
    description: "The best sneakers",
    imageUrl: null,
  });
  assert.equal(direction.style, "cinematic");
  assert.equal(direction.tagline, "Step into tomorrow");
});

test("rejects an unknown creative style", async () => {
  const client = fakeChatClient(
    JSON.stringify({ style: "not-a-real-style", tagline: "x", prompt: "y" }),
  );
  await assert.rejects(
    proposeCreativeDirection(client, { url: "u", title: "t", description: "d", imageUrl: null }),
    MarketingPlanError,
  );
});

test("rejects malformed JSON from the marketing model", async () => {
  const client = fakeChatClient("not json");
  await assert.rejects(
    proposeCreativeDirection(client, { url: "u", title: "t", description: "d", imageUrl: null }),
    MarketingPlanError,
  );
});
