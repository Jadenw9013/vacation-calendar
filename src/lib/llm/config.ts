/**
 * LLM providers, in the order they're tried. Model ids and order live here
 * because free tiers change without notice.
 *
 * Only Gemini is implemented for now. Groq and NVIDIA are both
 * OpenAI-compatible: to add one, install @ai-sdk/openai-compatible, add its
 * factory to src/lib/llm/provider.ts (one case), and uncomment its entry below.
 */

export type ProviderKind = "google" | "openai-compatible";

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  /** Overridable per deploy, e.g. GEMINI_MODEL=gemini-3.5-flash. */
  model: string;
  /**
   * Same-provider models tried in order when the main one is overloaded (503)
   * or over its rate limit (429). Gemini free-tier quotas are per model, so
   * each fallback brings its own allowance.
   */
  fallbackModels?: string[];
  /** Env var holding the API key. The provider is skipped when it's unset. */
  apiKeyEnv: string;
  baseURL?: string;
  /** Accepts images (screenshots of confirmations). The upload button hides when false. */
  vision: boolean;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "gemini",
    kind: "google",
    // Newest Flash in @ai-sdk/google's docs at the time of writing. Check AI Studio for your key's limits.
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    // Override with GEMINI_FALLBACK_MODELS=comma,separated,ids.
    fallbackModels: (process.env.GEMINI_FALLBACK_MODELS || "gemini-flash-lite-latest,gemini-3.8-flash,gemini-3.5-flash")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    apiKeyEnv: "GEMINI_API_KEY",
    vision: true,
  },
  // {
  //   id: "groq",
  //   kind: "openai-compatible",
  //   model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  //   apiKeyEnv: "GROQ_API_KEY",
  //   baseURL: "https://api.groq.com/openai/v1",
  //   vision: false,
  // },
  // {
  //   id: "nvidia",
  //   kind: "openai-compatible",
  //   model: process.env.NVIDIA_MODEL || "<pick on build.nvidia.com>",
  //   apiKeyEnv: "NVIDIA_API_KEY",
  //   baseURL: "https://integrate.api.nvidia.com/v1",
  //   vision: false,
  // },
];

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";
const LEVELS: ThinkingLevel[] = ["minimal", "low", "medium", "high"];

/**
 * Thinking levels each model accepts. gemini-3.8-flash takes low, medium and
 * high and rejects minimal with an error. Models not listed are held to the
 * same three: minimal is never sent.
 */
export const SUPPORTED_THINKING: Record<string, ThinkingLevel[]> = {
  "gemini-3.8-flash": ["low", "medium", "high"],
};
const DEFAULT_SUPPORTED: ThinkingLevel[] = ["low", "medium", "high"];

/**
 * The one place for how the planner's model is called.
 *
 * - thinkingLevel: low by default. Lower thinking is the lever for speed;
 *   thinking tokens are billed and count toward maxOutputTokens, so the cap
 *   stays generous instead of being cut. Override with CHAT_THINKING_LEVEL.
 * - maxOutputTokens: room for thinking plus a full proposal. A reply that
 *   still hits it (finish reason "length") is treated as a failure.
 *
 * No temperature, top_p, top_k or candidate count: Gemini 3.8 Flash removed
 * them and errors if they're sent. No prefilled model turns either.
 */
export const MODEL_SETTINGS = {
  model: PROVIDERS[0].model,
  thinkingLevel: (process.env.CHAT_THINKING_LEVEL || "low") as ThinkingLevel,
  maxOutputTokens: Number(process.env.CHAT_MAX_OUTPUT_TOKENS || 8192),
};

/** null when the settings are usable; otherwise what's wrong and how to fix it. */
export function checkModelSettings(settings = MODEL_SETTINGS, providers = PROVIDERS): string | null {
  const level = settings.thinkingLevel;
  if (!LEVELS.includes(level)) {
    return `CHAT_THINKING_LEVEL="${level}" isn't a thinking level. Use low, medium or high.`;
  }
  for (const model of [settings.model, ...(providers[0]?.fallbackModels ?? [])]) {
    const ok = SUPPORTED_THINKING[model] ?? DEFAULT_SUPPORTED;
    if (!ok.includes(level)) {
      return `Thinking level "${level}" isn't supported by ${model} (it accepts ${ok.join(", ")}). Set CHAT_THINKING_LEVEL to one of those.`;
    }
  }
  if (!Number.isFinite(settings.maxOutputTokens) || settings.maxOutputTokens < 4096) {
    return `CHAT_MAX_OUTPUT_TOKENS=${settings.maxOutputTokens} is too small: thinking counts toward it. Use 4096 or more (default 8192).`;
  }
  return null;
}

/** Limits on what the chat route accepts and produces. */
export const CHAT_LIMITS = {
  maxMessageChars: 6000,
  maxMessages: 40,
  maxOutputTokens: MODEL_SETTINGS.maxOutputTokens,
  thinkingLevel: MODEL_SETTINGS.thinkingLevel,
  maxSteps: 4,
  /**
   * SDK-level retries per request. Kept low: every retry spends free-tier
   * quota, and the fallback models already cover overload.
   */
  maxRetries: 1,
};
