// Server code only (reads API keys). Not marked "server-only" so scripts can import it.
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { wrapLanguageModel, type LanguageModel } from "ai";

/*
 * Which model answers, and what happens when it can't.
 *
 * Gemini 3.8 Flash by default: it has Google Maps and Google Search grounding
 * and can mix them with our own tools in one request. If a model or region
 * rejects the built-in tools, the same request is retried without them. If a
 * model is overloaded or over quota, the next one in the chain is tried.
 */

export const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const FALLBACKS = (process.env.GEMINI_FALLBACK_MODELS || "gemini-3.5-flash-lite,gemini-3.6-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export const SETTINGS = {
  thinkingLevel: (process.env.CHAT_THINKING_LEVEL || "low") as "low" | "medium" | "high",
  maxOutputTokens: Number(process.env.CHAT_MAX_OUTPUT_TOKENS || 8192),
  maxSteps: 6,
};

type ModelV4 = ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;
type CallParams = Parameters<ModelV4["doStream"]>[0];

/** 429 and 5xx: worth trying the next model. */
export function isRetryable(error: unknown): boolean {
  const e = error as { statusCode?: number; lastError?: unknown };
  if (e?.lastError) return isRetryable(e.lastError);
  return e?.statusCode === 429 || (typeof e?.statusCode === "number" && e.statusCode >= 500);
}

/** 400 (a model that doesn't take the tool) or 429 (no grounding quota: Google lists grounding as paid-tier only). */
const builtinsRefused = (error: unknown) => [400, 429].includes((error as { statusCode?: number })?.statusCode ?? 0);

/** Said to the model when it has to answer without Maps or Search, so it doesn't make up what it couldn't check. */
const NO_LOOKUPS =
  "\n\nGoogle Maps and Google Search aren't available for this answer. Only name places you're confident exist, say you couldn't check current hours or prices, and leave out addresses, phone numbers and links you didn't get from the person or the trip data. Don't call show_options with details you couldn't check.";

/** The same call with only our own (function) tools: for keys or models that refuse Maps or Search. */
function withoutBuiltins(params: CallParams): CallParams | null {
  const tools = params.tools ?? [];
  if (!tools.some((t) => t.type !== "function")) return null;
  return {
    ...params,
    tools: tools.filter((t) => t.type === "function"),
    prompt: params.prompt.map((m, i) => (i === 0 && m.role === "system" ? { ...m, content: m.content + NO_LOOKUPS } : m)),
  };
}

/** After Maps or Search is refused while a plain answer works, skip them for a while instead of failing first every time. */
const BUILTINS_PAUSE_MS = 10 * 60_000;
const state = globalThis as unknown as { builtinsOffUntil?: number };

/** DEBUG_ASSISTANT=1: one line per model call, with how long it took and how it ended. */
function timed<T>(run: (m: ModelV4, p: CallParams) => PromiseLike<T>): (m: ModelV4, p: CallParams) => Promise<T> {
  if (process.env.DEBUG_ASSISTANT !== "1") return async (m, p) => run(m, p);
  return async (m, p) => {
    const t = Date.now();
    const tools = (p.tools ?? []).filter((x) => x.type !== "function").length ? "with lookups" : "plain";
    try {
      const r = await run(m, p);
      console.log(`[assistant] ${m.modelId} ${tools}: ok in ${Date.now() - t} ms`);
      return r;
    } catch (e) {
      console.log(`[assistant] ${m.modelId} ${tools}: ${(e as { statusCode?: number }).statusCode ?? "error"} after ${Date.now() - t} ms`);
      throw e;
    }
  };
}

async function attempt<T>(models: ModelV4[], params: CallParams, call: (m: ModelV4, p: CallParams) => PromiseLike<T>): Promise<T> {
  const run = timed(call);
  let lastError: unknown;
  const plain = withoutBuiltins(params);
  const skip = !!plain && Date.now() < (state.builtinsOffUntil ?? 0);
  for (const m of models) {
    try {
      if (skip) return await run(m, plain!);
      try {
        return await run(m, params);
      } catch (e) {
        if (!plain || !builtinsRefused(e)) throw e;
        const r = await run(m, plain);
        state.builtinsOffUntil = Date.now() + BUILTINS_PAUSE_MS;
        return r;
      }
    } catch (e) {
      if (!isRetryable(e)) throw e;
      lastError = e;
    }
  }
  throw lastError;
}

/** Whether Maps and Search are working right now, for the eval and the logs. */
export const groundingPaused = () => Date.now() < (state.builtinsOffUntil ?? 0);

/** The model to use, or null when no key is set. */
export function assistantModel(): LanguageModel | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const google = createGoogleGenerativeAI({ apiKey: key });
  const models = [MODEL, ...FALLBACKS.filter((m) => m !== MODEL)].map((id) => google(id));
  return wrapLanguageModel({
    model: models[0],
    middleware: {
      wrapStream: ({ params }) => attempt(models, params, (m, p) => m.doStream(p)),
      wrapGenerate: ({ params }) => attempt(models, params, (m, p) => m.doGenerate(p)),
    },
  });
}

export function googleProvider() {
  return createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY ?? "missing" });
}

/** Local UI testing only: CHAT_MOCK=1 swaps in a scripted model. Never in production. */
export function isMock(): boolean {
  return process.env.CHAT_MOCK === "1" && process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production";
}

export function assistantAvailable(): boolean {
  return isMock() || !!process.env.GEMINI_API_KEY;
}

/** Plain words for the person, never server details. */
export function errorMessage(error: unknown): string {
  if (isRetryable(error)) return "The assistant is busy right now. Wait a moment and try again.";
  return "The assistant hit a problem. Try again in a moment; everything else keeps working.";
}
