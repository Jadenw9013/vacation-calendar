import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import type { Trip } from "@/data/types";
import type { Proposal } from "./proposal";
import type { Scenario } from "./eval-cases";

/*
 * Replays eval scenarios through the chat route handler, offline, the way the
 * page would: send, read the stream, apply between turns when the scenario
 * says so, answer an ask_user question with the next turn.
 */

export interface TurnResult {
  proposals: { status: Proposal["status"]; ops: unknown[] }[];
  asks: { question: string; options: string[] }[];
  text: string;
  errors: string[];
  /** Calls the route made to the model for this turn. */
  modelCalls: number;
  /** Message metadata the route attached (route, timings). */
  metadata?: Record<string, unknown>;
}

/** Parses an SSE body of UI message chunks. */
export async function readChunks(res: Response): Promise<UIMessageChunk[]> {
  const body = await res.text();
  return body
    .split("\n")
    .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]")
    .map((l) => JSON.parse(l.slice(6)) as UIMessageChunk);
}

function toStream(chunks: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  });
}

export function summarize(chunks: UIMessageChunk[], modelCalls: number): TurnResult {
  const r: TurnResult = { proposals: [], asks: [], text: "", errors: [], modelCalls };
  for (const c of chunks) {
    if (c.type === "text-delta") r.text += c.delta;
    if (c.type === "error") r.errors.push(c.errorText);
    if (c.type === "tool-input-available" && c.toolName === "ask_user") r.asks.push(c.input as TurnResult["asks"][number]);
    if (c.type === "tool-output-available") {
      const p = c.output as Proposal;
      if (p && "ops" in p) r.proposals.push({ status: p.status, ops: p.ops });
    }
    if ((c.type === "start" || c.type === "finish" || c.type === "message-metadata") && c.messageMetadata) {
      r.metadata = { ...(r.metadata ?? {}), ...(c.messageMetadata as Record<string, unknown>) };
    }
  }
  return r;
}

export interface ReplayDeps {
  /** The route handler. */
  post: (req: Request) => Promise<Response>;
  /** Model calls so far (from the stand-in's counter). */
  calls: () => number;
  /** Apply ops to the store, as a tap on Apply would. */
  apply: (ops: unknown[], author: string) => Promise<void>;
  extraBody?: Record<string, unknown>;
}

export async function replay(sc: Scenario, deps: ReplayDeps): Promise<TurnResult[]> {
  const author = sc.author ?? "Sam";
  let messages: UIMessage[] = [];
  const results: TurnResult[] = [];
  for (const [t, turn] of sc.turns.entries()) {
    const last = messages.at(-1);
    const waiting = last?.role === "assistant" ? last.parts.find((p) => p.type === "tool-ask_user" && "state" in p && p.state === "input-available") : undefined;
    if (waiting && last) {
      // Answering the question: the tool part gets the answer, as addToolOutput does.
      const answered = { ...last, parts: last.parts.map((p) => (p === waiting ? { ...p, state: "output-available", output: turn } : p)) } as UIMessage;
      messages = [...messages.slice(0, -1), answered];
    } else {
      messages = [...messages, { id: `u${t}`, role: "user", parts: [{ type: "text", text: turn }] }];
    }
    const before = deps.calls();
    const res = await deps.post(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages, author, outcomes: {}, ...deps.extraBody }),
      }),
    );
    if (!res.ok) throw new Error(`chat route answered ${res.status}: ${await res.text()}`);
    const chunks = await readChunks(res);
    const result = summarize(chunks, deps.calls() - before);
    results.push(result);
    // The assistant message as the page would hold it, for the next turn.
    let assistant: UIMessage | undefined;
    for await (const m of readUIMessageStream({ stream: toStream(chunks) })) assistant = m;
    if (assistant) {
      if (waiting) {
        // The reply continues the same assistant message.
        const prev = messages.at(-1)!;
        messages = [...messages.slice(0, -1), { ...prev, parts: [...prev.parts, ...assistant.parts] }];
      } else {
        messages = [...messages, { ...assistant, id: `a${t}` }];
      }
    }
    if (sc.applyAfter === t && result.proposals[0] && result.proposals[0].status !== "invalid") await deps.apply(result.proposals[0].ops, author);
  }
  return results;
}

export type { Trip };
