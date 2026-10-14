/*
 * Per-request timing for the chat route: one structured log line and a
 * Server-Timing header. Numbers and fixed labels only: never message text,
 * trip contents, names, keys or passphrases.
 */

export type ChatRoute = "model" | "local" | "quickadd";

export interface ChatTiming {
  route: ChatRoute;
  /** Building the prompt and converting the conversation. */
  contextMs: number;
  storeReadMs: number;
  storeWriteMs: number;
  /** From the model call to its first streamed byte. */
  ttfbMs: number | null;
  /** From the model call to its last byte, across all turns. */
  modelMs: number | null;
  /** Checking proposed ops against the trip. */
  validationMs: number;
  /** Requests made to the model for this message. */
  turns: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Thinking tokens (Gemini thoughtsTokenCount, the SDK's reasoningTokens). */
  thoughtsTokens: number | null;
  finishReason: string | null;
  /** Whole request, server side. */
  totalMs: number;
  /** ok, error, aborted. */
  outcome: "ok" | "error" | "aborted";
}

const ms = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

export function newTiming(route: ChatRoute = "model"): ChatTiming {
  return {
    route,
    contextMs: 0,
    storeReadMs: 0,
    storeWriteMs: 0,
    ttfbMs: null,
    modelMs: null,
    validationMs: 0,
    turns: 0,
    inputTokens: null,
    outputTokens: null,
    thoughtsTokens: null,
    finishReason: null,
    totalMs: 0,
    outcome: "ok",
  };
}

/** Times `fn` into `t[key]` (added, so repeated steps sum). */
export async function timed<T>(t: ChatTiming, key: "contextMs" | "storeReadMs" | "storeWriteMs" | "validationMs", fn: () => T | Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    t[key] += performance.now() - start;
  }
}

/** The fields that are known before the response starts streaming. */
export function serverTimingHeader(t: ChatTiming): string {
  return [`route;desc="${t.route}"`, `context;dur=${ms(t.contextMs)}`, `store-read;dur=${ms(t.storeReadMs)}`].join(", ");
}

/** Rounded copy, safe to log or send to the page. */
export function publicTiming(t: ChatTiming): ChatTiming {
  return {
    ...t,
    contextMs: ms(t.contextMs)!,
    storeReadMs: ms(t.storeReadMs)!,
    storeWriteMs: ms(t.storeWriteMs)!,
    ttfbMs: ms(t.ttfbMs),
    modelMs: ms(t.modelMs),
    validationMs: ms(t.validationMs)!,
    totalMs: ms(t.totalMs)!,
  };
}

export function logTiming(t: ChatTiming) {
  console.log(JSON.stringify({ evt: "chat", ...publicTiming(t) }));
}
