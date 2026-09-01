import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSISTANT_ROUTES,
  AssistantError,
  askAssistant,
  buildAssistantSystemPrompt,
  validateAssistantReply,
} from "./assistant.js";
import type { ChatClient } from "./director.js";

function clientReturning(content: string): ChatClient {
  return {
    createChatCompletion: async () => ({
      id: "chat-1",
      model: "test",
      created: 0,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }),
  };
}

test("an action is offered, never reported as done", () => {
  const prompt = buildAssistantSystemPrompt("");

  // The whole safety position of this feature: the assistant proposes paid work
  // and the user presses the button. An assistant that says "I have generated
  // it" is describing something that did not happen.
  assert.match(prompt, /The user presses it themselves/);
  assert.match(prompt, /Never claim to have done the action/);
});

test("the blueprint states the limits, not just the features", () => {
  const prompt = buildAssistantSystemPrompt("");

  // Promising 4K at thirty seconds, or a face swap on a photograph, costs a
  // failed job and the user's trust. Every one of these is confirmed.
  assert.match(prompt, /at most 30s at 720p or 1080p/);
  assert.match(prompt, /at most 15s at 4K/);
  assert.match(prompt, /may show a real person/);
  assert.match(prompt, /16 clips/);
});

test("house knowledge is included when there is some, and skipped when there is not", () => {
  assert.doesNotMatch(buildAssistantSystemPrompt("   "), /HOUSE KNOWLEDGE/);
  assert.match(
    buildAssistantSystemPrompt("Anamorphic flares belong to the 1970s look."),
    /HOUSE KNOWLEDGE[\s\S]*Anamorphic flares/,
  );
});

test("a page the app does not have is refused", async () => {
  // A model naming /timeline sends the user to a 404 and teaches them the
  // assistant is unreliable. Cheaper to catch here than to debug there.
  await assert.rejects(
    askAssistant(
      clientReturning(
        JSON.stringify({ reply: "Sure", action: { type: "open", route: "/timeline" } }),
      ),
      "where do I edit",
    ),
    AssistantError,
  );

  for (const route of ASSISTANT_ROUTES) {
    const reply = await askAssistant(
      clientReturning(JSON.stringify({ reply: "Sure", action: { type: "open", route } })),
      "take me there",
    );
    assert.equal(reply.action.route, route);
  }
});

test("a generate action must name a department the platform runs", async () => {
  await assert.rejects(
    askAssistant(
      clientReturning(
        JSON.stringify({
          reply: "Making it",
          action: { type: "generate", text: "a fox", mode: "hologram" },
        }),
      ),
      "make me a fox",
    ),
    AssistantError,
  );
});

test("an action that carries no text is refused", () => {
  // "Plan a film" with nothing to plan is a button that fails when pressed.
  assert.throws(
    () => validateAssistantReply({ reply: "Planning", action: { type: "plan_film" } }),
    AssistantError,
  );
});

test("a plain answer needs no action", () => {
  const reply = validateAssistantReply({
    reply: "A long lens flattens the background and isolates the subject.",
    action: { type: "none" },
  });
  assert.equal(reply.action.type, "none");
});

test("malformed model output fails loudly rather than reaching the interface", async () => {
  await assert.rejects(
    askAssistant(clientReturning("not json at all"), "hello"),
    AssistantError,
  );
  await assert.rejects(
    askAssistant(clientReturning(JSON.stringify({ action: { type: "none" } })), "hello"),
    AssistantError,
  );
});

test("house knowledge arrives with an order of authority", () => {
  const prompt = buildAssistantSystemPrompt("[project] Arjun wears an olive shirt.");

  // The failure this prevents: answering "what is he wearing" out of general
  // filmmaking knowledge, which is how an assistant invents facts about
  // somebody's film. A project decision beats the textbook.
  assert.match(prompt, /A project decision beats general practice/);
  assert.match(prompt, /Never state a project fact/);
  assert.match(prompt, /Arjun wears an olive shirt/);
});
