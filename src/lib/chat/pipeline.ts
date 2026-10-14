import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  type LanguageModel,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import { guard, jsonError, parseAuthor, readJson } from "@/lib/api";
import type { TripState } from "@/lib/engine";
import { CHAT_LIMITS, MODEL_SETTINGS } from "@/lib/llm/config";
import { chatErrorMessage } from "@/lib/llm/provider";
import type { TripRepository } from "@/lib/repo/types";
import { IMAGE_LIMITS, sanitizeMessages } from "./attachments";
import { classifyIntent, type Intent } from "./intent";
import { quickAddOps, routeMessage } from "./router";
import { buildProposal, type FlatOp, type Proposal } from "./proposal";
import { buildInstructions, planningTools, todayAt, type ProposalOutcome } from "./setup";
import { logTiming, newTiming, publicTiming, serverTimingHeader, timed, type ChatTiming } from "./timing";

/*
 * One planner request, end to end. One model call per message: the model's
 * turn ends at its tool call, the server checks the ops and sends the card.
 *
 * Safety, in order of importance:
 * - Nothing here writes to the trip. A card is a proposal; only a person's
 *   tap on Apply (POST /api/ops) changes anything.
 * - Tool calls are never forwarded as they stream. They're held until the
 *   model has finished, then parsed and validated, then sent whole. A reply
 *   cut short (finish reason "length"), a stream that fails partway, or a
 *   call that doesn't parse sends a plain failure message and no card.
 * - When the client goes away, the model call is aborted.
 */

export interface ChatDeps {
  repo: TripRepository;
  /** The model to use, or null when none is configured. */
  model: LanguageModel | null;
  vision: boolean;
}

const OUTCOMES = new Set<ProposalOutcome>(["applied", "discarded", "stale"]);

/** Plain words for the person, never server details. */
export const FAILURE = {
  length: "The planner ran out of room before it finished, so nothing was proposed. Try asking for less at once.",
  malformed: "The planner's answer didn't come through properly, so nothing was proposed. Try again, or use Quick add.",
  invalid: "The planner couldn't put that into a change that fits the trip. Try saying it another way, or use Quick add.",
  broken: "The connection to the planner dropped partway, so nothing was proposed. Nothing was changed; try again.",
};

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
export function readContext(raw: unknown, trip: TripState["trip"]) {
  const c = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const day = typeof c.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.day) && c.day >= trip.firstDay && c.day <= trip.lastDay ? c.day : null;
  const ids = new Set([...trip.segments.map((s) => s.id), ...(trip.plan ?? []).map((p) => p.id)]);
  const itemId = typeof c.itemId === "string" && ids.has(c.itemId) ? c.itemId : null;
  return { day, itemId };
}

/** The last thing the person said, and whether it was an answer to the planner's question. */
function lastTurn(messages: UIMessage[]): { text: string; images: number; answeringQuestion: boolean } {
  const last = messages.at(-1);
  if (last?.role === "assistant") {
    // The page resubmits after the person taps an ask_user option.
    const answered = last.parts.some((p) => p.type === "tool-ask_user" && "state" in p && p.state === "output-available");
    return { text: "", images: 0, answeringQuestion: answered };
  }
  const text = last?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ") ?? "";
  const images = last?.parts.filter((p) => p.type === "file").length ?? 0;
  return { text, images, answeringQuestion: false };
}

interface HeldCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
  invalid: boolean;
}

/** One model call: text forwarded as it streams, tool calls held. */
async function callModel(
  writer: UIMessageStreamWriter,
  args: { model: LanguageModel; instructions: string; messages: Awaited<ReturnType<typeof convertToModelMessages>>; intent: Intent; signal: AbortSignal; timing: ChatTiming },
) {
  const { timing } = args;
  const start = performance.now();
  timing.turns++;
  const result = streamText({
    model: args.model,
    instructions: args.instructions,
    messages: args.messages,
    tools: planningTools(),
    // Edits must come back as a tool call: no turn spent on prose.
    toolChoice: args.intent === "edit" ? "required" : "auto",
    activeTools: ["propose_changes", "ask_user"],
    stopWhen: isStepCount(1),
    maxOutputTokens: MODEL_SETTINGS.maxOutputTokens,
    maxRetries: CHAT_LIMITS.maxRetries,
    abortSignal: args.signal,
    providerOptions: { google: { thinkingConfig: { thinkingLevel: MODEL_SETTINGS.thinkingLevel } } },
  });

  const calls: HeldCall[] = [];
  let finishReason: string | null = null;
  let streamError: unknown = null;
  let sentText = false;
  for await (const part of result.fullStream) {
    if (timing.ttfbMs === null && part.type !== "start" && part.type !== "start-step") timing.ttfbMs = performance.now() - start;
    switch (part.type) {
      case "text-start":
        writer.write({ type: "text-start", id: part.id });
        break;
      case "text-delta":
        sentText = true;
        writer.write({ type: "text-delta", id: part.id, delta: part.text });
        break;
      case "text-end":
        writer.write({ type: "text-end", id: part.id });
        break;
      case "tool-call":
        calls.push({ toolCallId: part.toolCallId, toolName: part.toolName, input: part.input, invalid: !!(part as { invalid?: boolean }).invalid });
        break;
      case "tool-error":
        calls.push({ toolCallId: part.toolCallId, toolName: part.toolName, input: part.input, invalid: true });
        break;
      case "finish":
        finishReason = part.finishReason;
        timing.inputTokens = (timing.inputTokens ?? 0) + (part.totalUsage.inputTokens ?? 0);
        timing.outputTokens = (timing.outputTokens ?? 0) + (part.totalUsage.outputTokens ?? 0);
        if (part.totalUsage.outputTokenDetails?.reasoningTokens !== undefined) {
          timing.thoughtsTokens = (timing.thoughtsTokens ?? 0) + part.totalUsage.outputTokenDetails.reasoningTokens;
        }
        break;
      case "error":
        streamError = part.error;
        break;
    }
  }
  timing.modelMs = (timing.modelMs ?? 0) + (performance.now() - start);
  timing.finishReason = finishReason;
  return { calls, finishReason, streamError, sentText };
}

export async function handleChat(request: Request, deps: ChatDeps): Promise<Response> {
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
  const sanitized = sanitizeMessages(recent, { vision: deps.vision });
  if (!sanitized.ok) return jsonError(400, sanitized.error);
  const cleaned = sanitized.messages;

  const outcomes: Record<string, ProposalOutcome> = {};
  const rawOutcomes = parsed.body.outcomes;
  if (rawOutcomes && typeof rawOutcomes === "object") {
    for (const [id, o] of Object.entries(rawOutcomes).slice(0, 50)) {
      if (OUTCOMES.has(o as ProposalOutcome)) outcomes[id.slice(0, 100)] = o as ProposalOutcome;
    }
  }

  const state = await timed(timing, "storeReadMs", () => deps.repo.get());
  const turn = lastTurn(cleaned);
  const context = readContext(parsed.body.context, state.trip);

  // Before the model: schedule questions from the saved trip, Quick Add lines as cards.
  const routed = routeMessage(turn.text, {
    trip: state.trip,
    nowMs: Date.now(),
    day: context.day,
    images: turn.images,
    answeringQuestion: turn.answeringQuestion,
    force: parsed.body.force === "model",
  });
  if (routed.kind !== "model") {
    timing.route = routed.kind;
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: "start", messageMetadata: { route: timing.route } });
        if (routed.kind === "local") {
          writer.write({ type: "text-start", id: "local" });
          writer.write({ type: "text-delta", id: "local", delta: routed.answer });
          writer.write({ type: "text-end", id: "local" });
        } else {
          const ops = quickAddOps(routed.draft);
          const proposal = await timed(timing, "validationMs", () => buildProposal(state, undefined, ops));
          const toolCallId = `quickadd-${ops[0].segment.id}`;
          writer.write({ type: "tool-input-available", toolCallId, toolName: "propose_changes", input: { ops } });
          writer.write({ type: "tool-output-available", toolCallId, output: proposal });
        }
        timing.totalMs = performance.now() - started;
        logTiming(timing);
        writer.write({ type: "finish", messageMetadata: { route: timing.route, timing: publicTiming(timing) } });
      },
    });
    return createUIMessageStreamResponse({ headers: { "Server-Timing": serverTimingHeader(timing) }, stream });
  }

  const model = deps.model;
  if (!model) return jsonError(503, "The assistant isn't set up (no GEMINI_API_KEY). Manual editing still works.");
  const intent = classifyIntent(turn.text, turn);
  const tools = planningTools();
  const { instructions, modelMessages } = await timed(timing, "contextMs", async () => ({
    instructions: buildInstructions({
      state,
      author,
      today: todayAt(state.trip.utcOffset),
      outcomes,
      now: Date.now(),
      ...context,
    }),
    modelMessages: await convertToModelMessages(cleaned, { tools }),
  }));

  // Abort the model call when the person stops or leaves.
  const abort = new AbortController();
  request.signal?.addEventListener("abort", () => abort.abort(request.signal.reason));

  const finish = (writer: UIMessageStreamWriter, outcome: ChatTiming["outcome"] = "ok") => {
    timing.outcome = abort.signal.aborted ? "aborted" : outcome;
    timing.totalMs = performance.now() - started;
    logTiming(timing);
    writer.write({ type: "finish", messageMetadata: { route: timing.route, timing: publicTiming(timing) } });
  };

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start", messageMetadata: { route: timing.route } });
      const out = await callModel(writer, { model, instructions, messages: modelMessages, intent, signal: abort.signal, timing });

      // Cut off by the output cap: whatever arrived is incomplete. No card.
      if (out.finishReason === "length") {
        writer.write({ type: "error", errorText: FAILURE.length });
        return finish(writer, "error");
      }
      if (out.streamError) {
        logSafe(out.streamError);
        // Forced to call a tool and didn't: the reply isn't usable.
        const violation = (out.streamError as { name?: string })?.name === "AI_ToolChoiceViolationError";
        writer.write({ type: "error", errorText: violation ? FAILURE.malformed : out.sentText ? FAILURE.broken : chatErrorMessage(out.streamError) });
        return finish(writer, "error");
      }
      for (const call of out.calls) {
        if (call.invalid) {
          writer.write({ type: "error", errorText: FAILURE.malformed });
          return finish(writer, "error");
        }
      }
      // Complete, parsed calls only: now the card (or the question) goes out, whole.
      for (const call of out.calls) {
        if (call.toolName === "propose_changes") {
          const ops = ((call.input as { ops?: FlatOp[] })?.ops ?? []) as FlatOp[];
          const proposal: Proposal = await timed(timing, "validationMs", () => buildProposal(state, undefined, ops));
          writer.write({ type: "tool-input-available", toolCallId: call.toolCallId, toolName: call.toolName, input: call.input });
          writer.write({ type: "tool-output-available", toolCallId: call.toolCallId, output: proposal });
        } else if (call.toolName === "ask_user") {
          writer.write({ type: "tool-input-available", toolCallId: call.toolCallId, toolName: call.toolName, input: call.input });
        }
      }
      finish(writer);
    },
    onError: (error) => {
      logSafe(error);
      timing.outcome = abort.signal.aborted ? "aborted" : "error";
      timing.totalMs = performance.now() - started;
      logTiming(timing);
      return chatErrorMessage(error);
    },
  });

  // If the reader goes away (Stop, closed tab), stop the model too.
  const reader = stream.getReader();
  const body = new ReadableStream({
    async pull(c) {
      const { value, done } = await reader.read();
      if (done) c.close();
      else c.enqueue(value);
    },
    cancel(reason) {
      abort.abort(reason);
      return reader.cancel(reason);
    },
  });

  return createUIMessageStreamResponse({ headers: { "Server-Timing": serverTimingHeader(timing) }, stream: body });
}
