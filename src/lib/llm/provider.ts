// Server code only (reads API keys). Not marked "server-only" so scripts/chat-eval.ts can import it.
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { PROVIDERS, type ProviderConfig } from "./config";

export interface ResolvedModel {
  config: ProviderConfig;
  model: LanguageModel;
}

function build(config: ProviderConfig, apiKey: string): LanguageModel {
  switch (config.kind) {
    case "google":
      return createGoogleGenerativeAI({ apiKey })(config.model);
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

/** Status for the UI, without leaking anything secret. */
export function chatAvailability(): { available: boolean; vision: boolean } {
  const first = PROVIDERS.find((p) => process.env[p.apiKeyEnv]);
  return { available: !!first, vision: !!first?.vision };
}

/** 429 and 5xx mean "try the next provider"; anything else is our fault and won't improve. */
export function isRetryable(error: unknown): boolean {
  const status = (error as { statusCode?: number })?.statusCode;
  return status === 429 || (typeof status === "number" && status >= 500);
}
