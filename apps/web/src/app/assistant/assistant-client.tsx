"use client";

import type { AssistantAction, AssistantReply } from "@creative-ai/agents";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

interface Turn {
  role: "user" | "assistant";
  content: string;
  action?: AssistantAction;
}

/**
 * The assistant, as a conversation that can hand you a button.
 *
 * The button is the point. An assistant that can only describe how to do
 * something leaves the user to go and do it; one that does it unasked spends
 * their credits on its own reading of a sentence. So it proposes, and the
 * proposal is a control the user presses — which also means a misread request
 * costs nothing but a glance.
 */
export function AssistantClient() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const ask = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = question.trim();
      if (trimmed.length === 0 || thinking) return;

      const asked: Turn = { role: "user", content: trimmed };
      // The history sent is the conversation as it was *before* this question,
      // because the question itself is sent separately.
      const history = turns.map((turn) => ({
        role: turn.role,
        content: turn.content,
      }));

      setTurns((previous) => [...previous, asked]);
      setQuestion("");
      setThinking(true);
      setError(null);

      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed, history }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? "The assistant could not answer.");
          return;
        }
        const reply = (await response.json()) as AssistantReply;
        setTurns((previous) => [
          ...previous,
          { role: "assistant", content: reply.reply, action: reply.action },
        ]);
      } catch {
        setError("Could not reach the server.");
      } finally {
        setThinking(false);
        endRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    },
    [question, thinking, turns],
  );

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col px-4 py-6 sm:px-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Assistant</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Ask for something and it will tell you how — or hand you the control
          that does it. It knows what this platform can and cannot do.
        </p>
      </header>

      <div className="strip-scroll flex-1 space-y-3 overflow-y-auto pr-1">
        {turns.length === 0 && (
          <div className="space-y-2">
            {[
              "How do I make an eight-minute film?",
              "Why was my character rejected?",
              "Plan something for a street food stall at night",
              "What lens should I use for a close-up on hands?",
            ].map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuestion(example)}
                className="opt w-full !justify-start text-left"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        {turns.map((turn, index) => (
          <div
            key={index}
            className={turn.role === "user" ? "flex justify-end" : undefined}
          >
            <div
              className={
                turn.role === "user"
                  ? "max-w-[85%] rounded-[12px] px-3.5 py-2.5 text-sm"
                  : "panel max-w-[95%] p-3.5 text-sm"
              }
              style={
                turn.role === "user"
                  ? { background: "var(--bg-elevated)", color: "var(--text)" }
                  : undefined
              }
            >
              <p className="whitespace-pre-wrap leading-relaxed">{turn.content}</p>
              {turn.action !== undefined && <ActionCard action={turn.action} />}
            </div>
          </div>
        ))}

        {thinking && (
          <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="spinner h-3 w-3" aria-hidden="true" />
            Thinking
          </p>
        )}
        {error !== null && <p className="text-xs text-[var(--danger)]">{error}</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={ask} className="composer panel mt-3 space-y-2 p-3">
        <label htmlFor="question" className="sr-only">
          Ask the assistant
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={thinking}
          rows={2}
          maxLength={1000}
          placeholder="Ask anything about making something here…"
        />
        <div className="composer-footer">
          <span className="text-[11px] text-[var(--text-faint)]">
            It offers actions; you press them.
          </span>
          <button
            type="submit"
            disabled={thinking || question.trim().length === 0}
            className="btn-primary !px-5 !py-2 text-sm"
          >
            Ask
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * The offered action, as a control rather than a claim.
 *
 * Everything here is a link that pre-fills a page: nothing is submitted, and
 * nothing is charged, until the user acts on the page they land on. That is
 * deliberate — the assistant's reading of "make me a video of the harbour" is
 * a guess until a person agrees with it.
 */
function ActionCard({ action }: { action: AssistantAction }) {
  if (action.type === "none") return null;

  const href =
    action.type === "open"
      ? (action.route ?? "/studio")
      : action.type === "plan_film"
        ? `/director?brief=${encodeURIComponent(action.text ?? "")}`
        : action.type === "search_library"
          ? `/gallery?q=${encodeURIComponent(action.text ?? "")}`
          : `/studio?mode=${action.mode ?? "image"}&prompt=${encodeURIComponent(action.text ?? "")}`;

  const label =
    action.type === "open"
      ? `Open ${action.route}`
      : action.type === "plan_film"
        ? "Plan this in Director"
        : action.type === "search_library"
          ? "Search the library"
          : `Set this up in Studio`;

  return (
    <Link href={href} className="btn-secondary mt-3 !px-4 !py-2 text-xs">
      {label}
    </Link>
  );
}
