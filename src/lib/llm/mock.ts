import { simulateReadableStream, type LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";

/**
 * A scripted stand-in for the model, for exercising the chat UI locally
 * without an API key: CHAT_MOCK=1 npm run dev. Never used in production.
 *
 * - "hotel"  → proposes a booked Antigua hotel for the night of Nov 28
 * - "delete" → proposes removing the (booked) Atitlán Airbnb
 * - "dinner" → asks which day, with options
 * - after any tool result → one short sentence
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

export function mockModel(): LanguageModel {
  return new MockLanguageModelV4({
    doStream: async ({ prompt }) => ({
      stream: simulateReadableStream({ chunks: script(prompt as never) as never, chunkDelayInMs: 40 }),
    }),
  });
}
