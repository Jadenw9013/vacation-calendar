// Server code only (reads API keys). Not marked "server-only" so scripts/chat-eval.ts can import it.
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { wrapLanguageModel, type LanguageModel } from "ai";
import { PROVIDERS, type ProviderConfig } from "./config";

/** The model interface our providers return (the current, V4 one). */
type ModelV4 = ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;

export interface ResolvedModel {
  config: ProviderConfig;
  model: LanguageModel;
}

/**
 * Tries each model in order, moving on only for overload or rate limits.
 * Any other error (bad request, auth) is ours and is thrown straight away.
 */
export function withFallbacks(models: ModelV4[]): LanguageModel {
  if (models.length === 1) return models[0];
  async function attempt<T>(first: () => PromiseLike<T>, rest: (m: ModelV4) => PromiseLike<T>): Promise<T> {
    let lastError: unknown;
    for (const run of [first, ...models.slice(1).map((m) => () => rest(m))]) {
      try {
        return await run();
      } catch (e) {
        if (!isRetryable(e)) throw e;
        lastError = e;
      }
    }
    throw lastError;
  }
  return wrapLanguageModel({
    model: models[0],
    middleware: {
      wrapStream: ({ doStream, params }) => attempt(doStream, (m) => m.doStream(params)),
      wrapGenerate: ({ doGenerate, params }) => attempt(doGenerate, (m) => m.doGenerate(params)),
    },
  });
}

function build(config: ProviderConfig, apiKey: string): LanguageModel {
  switch (config.kind) {
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey });
      return withFallbacks([config.model, ...(config.fallbackModels ?? [])].map((id) => google(id)));
    }
    case "openai-compatible":
      // Not installed yet. See the note in ./config.ts.
      throw new Error(`Provider "${config.id}" needs @ai-sdk/openai-compatible, which isn't installed.`);
  }
}

/** Providers that have an API key set, in configured order. */
export function availableModels(): ResolvedModel[] {
  return PROVIDERS.flatMap((config) => {
    const key = process.env[config.apiKeyEnv];
    return key ? [{ config, model: build(config, key) }] : [];
  });
}

/** Local UI testing only: CHAT_MOCK=1 swaps in a scripted model. Ignored in production. */
export function isMockModel(): boolean {
  return process.env.CHAT_MOCK === "1" && process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production";
}

/** Status for the UI, without leaking anything secret. */
export function chatAvailability(): { available: boolean; vision: boolean } {
  if (isMockModel()) return { available: true, vision: false };
  const first = PROVIDERS.find((p) => process.env[p.apiKeyEnv]);
  return { available: !!first, vision: !!first?.vision };
}

/** 429 and 5xx mean "try the next model"; anything else is our fault and won't improve. */
export function isRetryable(error: unknown): boolean {
  const e = error as { statusCode?: number; lastError?: unknown };
  // The SDK wraps exhausted retries in a RetryError; judge by the last underlying error.
  if (e?.lastError) return isRetryable(e.lastError);
  const status = e?.statusCode;
  return status === 429 || (typeof status === "number" && status >= 500);
}

/** What the person sees when the model call fails. Never leaks server details. */
export function chatErrorMessage(error: unknown): string {
  if (isRetryable(error)) {
    return "The planner is busy right now: Gemini's free tier allows only a few requests a minute and is sometimes overloaded. Wait a minute and try again. Manual editing still works.";
  }
  return "The planner hit an error. Manual editing still works; try the planner again in a moment.";
}
