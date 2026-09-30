import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { guard, jsonError, parseAuthor, readJson } from "@/lib/api";
import { IMAGE_LIMITS, sanitizeMessages } from "@/lib/chat/attachments";
import { buildInstructions, buildTools, todayAt, type ProposalOutcome } from "@/lib/chat/setup";
import { CHAT_LIMITS } from "@/lib/llm/config";
import { availableModels, chatAvailability, chatErrorMessage, isMockModel } from "@/lib/llm/provider";
import { getRepository } from "@/lib/repo";

export const maxDuration = 60;

const OUTCOMES = new Set<ProposalOutcome>(["applied", "discarded", "stale"]);

function textLength(m: UIMessage): number {
  return m.parts.reduce((n, p) => n + (p.type === "text" ? p.text.length : 0), 0);
}

/** Only what's needed to debug: never the request body, which holds the conversation and any screenshots. */
function logSafe(error: unknown) {
  const e = error as { name?: string; message?: string; statusCode?: number; lastError?: { statusCode?: number; message?: string } };
  console.error("chat stream error", {
    name: e?.name,
    statusCode: e?.statusCode ?? e?.lastError?.statusCode,
    message: (e?.lastError?.message ?? e?.message ?? "").slice(0, 300),
  });
}

/** Body: { messages: UIMessage[], author: string, outcomes?: Record<toolCallId, ProposalOutcome> } */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const parsed = await readJson(request, IMAGE_LIMITS.maxBodyBytes);
  if (!parsed.ok) return parsed.res;

  const author = parseAuthor(parsed.body.author);
  if (!author) return jsonError(400, "Pick your first name first.");
  const messages = parsed.body.messages;
  if (!Array.isArray(messages) || messages.length === 0) return jsonError(400, "messages must be a non-empty array");
  const recent = (messages as UIMessage[]).slice(-CHAT_LIMITS.maxMessages);
  if (recent.some((m) => m.role === "user" && textLength(m) > CHAT_LIMITS.maxMessageChars)) {
    return jsonError(413, `Messages are capped at ${CHAT_LIMITS.maxMessageChars} characters. Trim the paste to the relevant part.`);
  }
  const sanitized = sanitizeMessages(recent, { vision: chatAvailability().vision });
  if (!sanitized.ok) return jsonError(400, sanitized.error);
  const cleaned = sanitized.messages;

  const outcomes: Record<string, ProposalOutcome> = {};
  const rawOutcomes = parsed.body.outcomes;
  if (rawOutcomes && typeof rawOutcomes === "object") {
    for (const [id, o] of Object.entries(rawOutcomes).slice(0, 50)) {
      if (OUTCOMES.has(o as ProposalOutcome)) outcomes[id.slice(0, 100)] = o as ProposalOutcome;
    }
  }

  const model = isMockModel() ? (await import("@/lib/llm/mock")).mockModel() : availableModels()[0]?.model;
  if (!model) return jsonError(503, "The assistant isn't set up (no GEMINI_API_KEY). Manual editing still works.");

  const repo = getRepository();
  const state = await repo.get();
  const tools = buildTools(() => repo.get());

  const result = streamText({
    model,
    instructions: buildInstructions({ state, author, today: todayAt(state.trip.utcOffset), outcomes }),
    messages: await convertToModelMessages(cleaned, { tools }),
    tools,
    stopWhen: isStepCount(CHAT_LIMITS.maxSteps),
    maxOutputTokens: CHAT_LIMITS.maxOutputTokens,
    maxRetries: CHAT_LIMITS.maxRetries,
    providerOptions: { google: { thinkingConfig: { thinkingLevel: CHAT_LIMITS.thinkingLevel } } },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        logSafe(error);
        return chatErrorMessage(error);
      },
    }),
  });
}
