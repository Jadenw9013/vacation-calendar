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
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
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

/** Limits on what the chat route accepts and produces. */
export const CHAT_LIMITS = {
  maxMessageChars: 6000,
  maxMessages: 40,
  maxOutputTokens: 2000,
  maxSteps: 4,
};
