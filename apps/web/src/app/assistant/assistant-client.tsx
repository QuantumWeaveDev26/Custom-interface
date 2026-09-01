"use client";

import type { AssistantAction, AssistantReply } from "@creative-ai/agents";
import Link from "next/link";

import { KnowledgePanel, type KnowledgeDocument } from "./knowledge-panel";
import { useCallback, useEffect, useRef, useState } from "react";

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
export function AssistantClient({
  documents,
  costs,
  creditBalance,
}: {
  documents: readonly KnowledgeDocument[];
  /** What one default take costs in each department. */
  costs: Record<"image" | "video" | "voice" | "model3d", number>;
  creditBalance: number;
}) {
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
              {turn.action !== undefined && (
                <ActionCard
                  action={turn.action}
                  costs={costs}
                  creditBalance={creditBalance}
                />
              )}
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

      {/* Beneath the composer rather than beside it: knowledge is set up once
          and then forgotten, while the conversation is the reason to be here. */}
      <KnowledgePanel initialDocuments={documents} />
    </div>
  );
}

/**
 * The offered action, as a control rather than a claim.
 *
 * Two shapes. A single take can be made from here, because making it *is* the
 * request and sending someone to another page to press a second button is
 * ceremony. Everything else is a link that pre-fills a page, since planning a
 * film or searching a library is work that belongs in the tool built for it.
 *
 * What runs from here states its price first and never reports success before
 * the server says so — the assistant proposes, the person approves, the system
 * executes, and only then is anything called done.
 */
function ActionCard({
  action,
  costs,
  creditBalance,
}: {
  action: AssistantAction;
  costs: Record<"image" | "video" | "voice" | "model3d", number>;
  creditBalance: number;
}) {
  if (action.type === "none") return null;

  if (action.type === "generate" && action.mode !== undefined) {
    return (
      <RunAction
        mode={action.mode}
        prompt={action.text ?? ""}
        cost={costs[action.mode]}
        creditBalance={creditBalance}
      />
    );
  }

  const href =
    action.type === "open"
      ? (action.route ?? "/studio")
      : action.type === "plan_film"
        ? `/director?brief=${encodeURIComponent(action.text ?? "")}`
        : `/gallery?q=${encodeURIComponent(action.text ?? "")}`;

  const label =
    action.type === "open"
      ? `Open ${action.route}`
      : action.type === "plan_film"
        ? "Plan this in Director"
        : "Search the library";

  return (
    <Link href={href} className="btn-secondary mt-3 !px-4 !py-2 text-xs">
      {label}
    </Link>
  );
}

interface GeneratedAsset {
  id: string;
  type: "image" | "video" | "audio" | "model3d";
  url: string;
}

type RunPhase = "idle" | "submitting" | "working" | "complete" | "failed";

/**
 * One take, run from the conversation.
 *
 * The price is on the button because a confirmation without a number is not a
 * confirmation, and the result is the real asset streamed back from the worker
 * rather than a sentence claiming it exists.
 */
function RunAction({
  mode,
  prompt,
  cost,
  creditBalance,
}: {
  mode: "image" | "video" | "voice" | "model3d";
  prompt: string;
  cost: number;
  creditBalance: number;
}) {
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [assets, setAssets] = useState<GeneratedAsset[]>([]);
  const stream = useRef<EventSource | null>(null);

  useEffect(() => () => stream.current?.close(), []);

  const affordable = creditBalance >= cost;

  const run = useCallback(async () => {
    setPhase("submitting");
    setMessage(null);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: mode, prompt }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setPhase("failed");
        setMessage(body.error ?? "The job was refused.");
        return;
      }

      const { jobId } = (await response.json()) as { jobId: string };
      setPhase("working");

      const events = new EventSource(`/api/jobs/${jobId}/stream`);
      stream.current = events;
      events.onmessage = (event) => {
        let parsed: {
          status: string;
          errorMessage?: string;
          assets?: GeneratedAsset[];
        };
        try {
          parsed = JSON.parse(event.data as string) as typeof parsed;
        } catch {
          return;
        }
        if (parsed.status === "complete") {
          setPhase("complete");
          setAssets(parsed.assets ?? []);
          events.close();
        } else if (parsed.status === "failed") {
          setPhase("failed");
          setMessage(parsed.errorMessage ?? "Generation failed.");
          events.close();
        }
      };
      events.onerror = () => events.close();
    } catch {
      setPhase("failed");
      setMessage("Could not reach the server.");
    }
  }, [mode, prompt]);

  const heading =
    mode === "image"
      ? "Make this image"
      : mode === "video"
        ? "Make this video"
        : mode === "voice"
          ? "Speak this"
          : "Make this mesh";

  return (
    <div className="mt-3 rounded-[12px] p-3" style={{ background: "var(--bg-elevated)" }}>
      <p className="rule-cap">{heading}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text)]">{prompt}</p>

      {phase === "idle" && (
        <>
          <div className="composer-footer mt-3">
            {/* The other door: anyone who wants to change the settings first
                goes to the composer, where every control lives. */}
            <Link
              href={`/studio?mode=${mode}&prompt=${encodeURIComponent(prompt)}`}
              className="btn-secondary !px-3 !py-1.5 text-xs"
            >
              Adjust in Studio
            </Link>
            <button
              type="button"
              onClick={() => void run()}
              disabled={!affordable}
              className="btn-primary gap-2 !px-4 !py-2 text-xs"
            >
              <span>Generate</span>
              <span className="val text-[11px] opacity-70">{cost} cr</span>
            </button>
          </div>
          {!affordable && (
            <p className="mt-2 text-[11px] text-[var(--danger)]">
              Not enough credits — this costs {cost}, you have {creditBalance}.
            </p>
          )}
        </>
      )}

      {(phase === "submitting" || phase === "working") && (
        <p className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="spinner h-3 w-3" aria-hidden="true" />
          {phase === "submitting"
            ? "Submitting"
            : "Generating — this takes a few minutes"}
        </p>
      )}

      {phase === "failed" && <p className="mt-3 text-xs text-[var(--danger)]">{message}</p>}

      {phase === "complete" && (
        <div className="mt-3 space-y-2">
          {assets.map((asset) =>
            asset.type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={asset.id} src={asset.url} alt="" className="w-full rounded-[10px]" />
            ) : asset.type === "video" ? (
              <video
                key={asset.id}
                src={asset.url}
                controls
                preload="metadata"
                className="w-full rounded-[10px]"
              />
            ) : (
              <audio key={asset.id} src={asset.url} controls className="w-full" />
            ),
          )}
          <Link href="/gallery" className="btn-secondary !px-3 !py-1.5 text-xs">
            See it in the Gallery
          </Link>
        </div>
      )}
    </div>
  );
}
