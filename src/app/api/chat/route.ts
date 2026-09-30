import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { guard, jsonError, parseAuthor, readJson } from "@/lib/api";
import { buildInstructions, buildTools, todayAt, type ProposalOutcome } from "@/lib/chat/setup";
import { CHAT_LIMITS } from "@/lib/llm/config";
import { availableModels } from "@/lib/llm/provider";
import { getRepository } from "@/lib/repo";

export const maxDuration = 60;

const OUTCOMES = new Set<ProposalOutcome>(["applied", "discarded", "stale"]);

function textLength(m: UIMessage): number {
  return m.parts.reduce((n, p) => n + (p.type === "text" ? p.text.length : 0), 0);
}

/** Body: { messages: UIMessage[], author: string, outcomes?: Record<toolCallId, ProposalOutcome> } */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const parsed = await readJson(request, 400_000);
  if (!parsed.ok) return parsed.res;

  const author = parseAuthor(parsed.body.author);
  if (!author) return jsonError(400, "Pick your first name first.");
  const messages = parsed.body.messages;
  if (!Array.isArray(messages) || messages.length === 0) return jsonError(400, "messages must be a non-empty array");
  const recent = (messages as UIMessage[]).slice(-CHAT_LIMITS.maxMessages);
  if (recent.some((m) => m.role === "user" && textLength(m) > CHAT_LIMITS.maxMessageChars)) {
    return jsonError(413, `Messages are capped at ${CHAT_LIMITS.maxMessageChars} characters. Trim the paste to the relevant part.`);
  }
  // Text only until the screenshot path exists.
  const cleaned = recent.map((m) => (m.role === "user" ? { ...m, parts: m.parts.filter((p) => p.type === "text") } : m));

  const outcomes: Record<string, ProposalOutcome> = {};
  const rawOutcomes = parsed.body.outcomes;
  if (rawOutcomes && typeof rawOutcomes === "object") {
    for (const [id, o] of Object.entries(rawOutcomes).slice(0, 50)) {
      if (OUTCOMES.has(o as ProposalOutcome)) outcomes[id.slice(0, 100)] = o as ProposalOutcome;
    }
  }

  const [primary] = availableModels();
  if (!primary) return jsonError(503, "The assistant isn't set up (no GEMINI_API_KEY). Manual editing still works.");

  const repo = getRepository();
  const state = await repo.get();
  const tools = buildTools(() => repo.get());

  const result = streamText({
    model: primary.model,
    instructions: buildInstructions({ state, author, today: todayAt(state.trip.utcOffset), outcomes }),
    messages: await convertToModelMessages(cleaned, { tools }),
    tools,
    stopWhen: isStepCount(CHAT_LIMITS.maxSteps),
    maxOutputTokens: CHAT_LIMITS.maxOutputTokens,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
