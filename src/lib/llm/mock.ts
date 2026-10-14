import { simulateReadableStream, type LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterAnswer, evalReply, type Reply } from "./eval-standin";

/**
 * A scripted stand-in for the model, for exercising the chat UI locally
 * without an API key: CHAT_MOCK=1 npm run dev. Never used in production.
 *
 * - "hotel"  → proposes a booked Antigua hotel for the night of Nov 28
 * - "delete" → proposes removing the (booked) Atitlán Airbnb
 * - "timed plan" → drafts three suggested plan steps for Nov 25
 * - "dinner" → asks which day, with options
 * - any screenshot → proposes a booked Antigua stay whose notes carry a
 *   confirmation code, full name and phone, to show the server strips them
 * - after any tool result → one short sentence
 *
 * CHAT_MOCK=eval replies to the eval scenarios instead (./eval-standin.ts).
 * CHAT_MOCK_LATENCY_MS adds a delay before the first chunk, for timing work.
 * `mockStats` counts calls and aborts, for tests.
 */

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

type Chunk = Record<string, unknown>;

function text(t: string): Chunk[] {
  return [
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: t },
    { type: "text-end", id: "t" },
    { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
  ];
}

function call(toolName: string, input: unknown): Chunk[] {
  return [
    { type: "tool-call", toolCallId: `mock-${Date.now()}`, toolName, input: JSON.stringify(input) },
    { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
  ];
}

function lastUserText(prompt: { role: string; content: unknown }[]): string {
  const m = [...prompt].reverse().find((p) => p.role === "user" || p.role === "tool");
  if (!m || m.role === "tool") return "";
  const content = m.content as { type: string; text?: string }[];
  return content.map((c) => c.text ?? "").join(" ").toLowerCase();
}

function script(prompt: { role: string; content: unknown }[]): Chunk[] {
  if (prompt.at(-1)?.role === "tool") {
    const answered = JSON.stringify(prompt.at(-1)?.content ?? "").includes("ask_user");
    return answered ? call("propose_changes", dinner()) : text("Drafted it. Tap Apply if that looks right.");
  }
  const said = lastUserText(prompt);
  const lastUser = [...prompt].reverse().find((p) => p.role === "user");
  const images = ((lastUser?.content as { type: string }[]) ?? []).filter((c) => c.type === "file").length;
  if (images) {
    return call("propose_changes", {
      summary: `Add the stay from ${images} screenshot${images > 1 ? "s" : ""}`,
      ops: [
        {
          op: "add_segment",
          segment: {
            id: "lodging-casa-cielo",
            kind: "lodging",
            title: "Casa Cielo (Airbnb)",
            start: "2026-11-26T15:00:00-06:00",
            end: "2026-11-29T11:00:00-06:00",
            status: "booked",
            location: "Antigua",
            notes: "Confirmation code HMX4Z9QK2P. Guest: Jordan Rivera. Host phone +502 5555 0199.",
          },
        },
      ],
    });
  }
  if (said.includes("timed plan")) {
    return call("propose_changes", {
      summary: "Draft plan for the day",
      ops: [
        { op: "add_plan_item", plan: { title: "Leave for Panajachel", start: "2026-11-25T08:30:00-06:00", tentative: true } },
        { op: "add_plan_item", plan: { title: "Boat to San Marcos", start: "2026-11-25T12:30:00-06:00", tentative: true } },
        { op: "add_plan_item", plan: { title: "Early dinner, then rest", start: "2026-11-25T18:30:00-06:00", tentative: true } },
      ],
    });
  }
  if (said.includes("delete")) {
    return call("propose_changes", { summary: "Remove the Atitlán stay", ops: [{ op: "remove_segment", id: "lodging-atitlan" }] });
  }
  if (said.includes("hotel")) {
    return call("propose_changes", {
      summary: "Add Antigua hotel for Nov 28",
      ops: [
        {
          op: "add_segment",
          segment: {
            id: "lodging-antigua-nov28",
            kind: "lodging",
            title: "Hotel Casa Santo Domingo",
            start: "2026-11-28",
            end: "2026-11-29",
            status: "booked",
            location: "Antigua",
            owner: "Sam",
          },
          blockedBy: ["q-lake-length"],
        },
      ],
    });
  }
  if (said.includes("dinner")) {
    return call("ask_user", { question: "Which night is the dinner?", options: ["Fri Nov 27", "Sat Nov 28"] });
  }
  return text("(Mock model) Try a message with hotel, delete or dinner in it.");
}

function dinner() {
  return {
    summary: "Add dinner on Nov 28",
    ops: [
      {
        op: "add_segment",
        segment: { id: "activity-dinner-nov28", kind: "activity", title: "Group dinner", start: "2026-11-28", status: "needs-booking", location: "Antigua" },
      },
    ],
  };
}

/** What tests can see about calls to the stand-in. */
export const mockStats = {
  calls: 0,
  aborted: 0,
  /** toolChoice the last call was made with. */
  lastToolChoice: undefined as unknown,
  reset() {
    this.calls = 0;
    this.aborted = 0;
    this.lastToolChoice = undefined;
  },
};

function fromReply(r: Reply): Chunk[] {
  return r.kind === "text" ? text(r.text) : call(r.tool, r.input);
}

function evalScript(prompt: { role: string; content: unknown }[]): Chunk[] {
  const last = prompt.at(-1);
  if (last?.role === "tool") {
    const parts = (last.content as { toolName?: string; output?: { value?: unknown } }[]) ?? [];
    const answered = parts.find((p) => p.toolName === "ask_user");
    if (answered) return fromReply(afterAnswer(String(answered.output?.value ?? "")));
    return text("Drafted it. Tap Apply if that looks right.");
  }
  return fromReply(evalReply(lastUserText(prompt)));
}

/** Waits `ms`, or rejects as soon as the call is aborted. */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason);
    });
  });
}

export function mockModel(): LanguageModel {
  const latency = Number(process.env.CHAT_MOCK_LATENCY_MS ?? 0);
  const scriptFor = process.env.CHAT_MOCK === "eval" ? evalScript : script;
  return new MockLanguageModelV4({
    doStream: async ({ prompt, abortSignal, toolChoice }) => {
      mockStats.calls++;
      mockStats.lastToolChoice = toolChoice;
      abortSignal?.addEventListener("abort", () => mockStats.aborted++);
      if (latency) await wait(latency, abortSignal);
      return {
        stream: simulateReadableStream({ chunks: scriptFor(prompt as never) as never, chunkDelayInMs: latency ? Math.min(40, latency) : 40 }),
      };
    },
  });
}
