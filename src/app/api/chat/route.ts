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
import { logTiming, newTiming, publicTiming, serverTimingHeader, timed } from "@/lib/chat/timing";
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

/** The day on screen and the item asked about, if they belong to this trip. Anything else is dropped. */
function readContext(raw: unknown, trip: { firstDay: string; lastDay: string; segments: { id: string }[]; plan?: { id: string }[] }) {
  const c = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const day = typeof c.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.day) && c.day >= trip.firstDay && c.day <= trip.lastDay ? c.day : null;
  const ids = new Set([...trip.segments.map((s) => s.id), ...(trip.plan ?? []).map((p) => p.id)]);
  const itemId = typeof c.itemId === "string" && ids.has(c.itemId) ? c.itemId : null;
  return { day, itemId };
}

/** Body: { messages: UIMessage[], author: string, outcomes?: Record<toolCallId, ProposalOutcome>, context?: { day?, itemId? } } */
export async function POST(request: Request) {
  const started = performance.now();
  const timing = newTiming("model");
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
  const state = await timed(timing, "storeReadMs", () => repo.get());
  const tools = buildTools(() => repo.get(), timing);
  const { instructions, messages: modelMessages } = await timed(timing, "contextMs", async () => ({
    instructions: buildInstructions({
      state,
      author,
      today: todayAt(state.trip.utcOffset),
      outcomes,
      now: Date.now(),
      ...readContext(parsed.body.context, state.trip),
    }),
    messages: await convertToModelMessages(cleaned, { tools }),
  }));

  const modelStart = performance.now();
  const result = streamText({
    model,
    instructions,
    messages: modelMessages,
    tools,
    stopWhen: isStepCount(CHAT_LIMITS.maxSteps),
    maxOutputTokens: CHAT_LIMITS.maxOutputTokens,
    maxRetries: CHAT_LIMITS.maxRetries,
    providerOptions: { google: { thinkingConfig: { thinkingLevel: CHAT_LIMITS.thinkingLevel } } },
  });

  return createUIMessageStreamResponse({
    headers: { "Server-Timing": serverTimingHeader(timing) },
    stream: toUIMessageStream({
      stream: result.stream,
      // Timing rides on the stream: turns and first byte as they happen, the totals on the finish event.
      messageMetadata: ({ part }) => {
        if (part.type === "start-step") timing.turns++;
        if (timing.ttfbMs === null && (part.type === "text-delta" || part.type === "tool-input-start" || part.type === "reasoning-delta" || part.type === "tool-call")) {
          timing.ttfbMs = performance.now() - modelStart;
        }
        if (part.type === "start") return { route: timing.route };
        if (part.type !== "finish") return undefined;
        timing.modelMs = performance.now() - modelStart;
        timing.totalMs = performance.now() - started;
        timing.finishReason = part.finishReason ?? null;
        timing.inputTokens = part.totalUsage?.inputTokens ?? null;
        timing.outputTokens = part.totalUsage?.outputTokens ?? null;
        timing.thoughtsTokens = part.totalUsage?.outputTokenDetails?.reasoningTokens ?? null;
        logTiming(timing);
        return { route: timing.route, timing: publicTiming(timing) };
      },
      onError: (error) => {
        logSafe(error);
        timing.outcome = "error";
        timing.totalMs = performance.now() - started;
        logTiming(timing);
        return chatErrorMessage(error);
      },
    }),
  });
}
