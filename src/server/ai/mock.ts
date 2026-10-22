import { simulateReadableStream, type LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";

/**
 * A scripted stand-in for Gemini, for clicking through the assistant without
 * an API key: CHAT_MOCK=1 npm run dev. Never used in production. Its places
 * are made up and say so.
 *
 * - "eat", "restaurant", "dinner near" → show_options with three places
 * - "plan"   → add_items: three suggested steps on the day on screen
 * - "remove" or "delete" → remove_items for cliff jumping (a confirm card)
 * - "add dinner" with no day → ask_user: which day?
 * - a screenshot → add_items: a made-up booked stay with a confirmation number
 * - anything else → a short text answer
 * - after a tool result → one line
 */

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

type Chunk = Record<string, unknown>;
type Prompt = { role: string; content: unknown }[];

const text = (t: string): Chunk[] => [
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: t },
  { type: "text-end", id: "t" },
  { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
];

const call = (toolName: string, input: unknown): Chunk[] => [
  { type: "tool-call", toolCallId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, toolName, input: JSON.stringify(input) },
  { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
];

function lastUser(prompt: Prompt): string {
  const m = [...prompt].reverse().find((p) => p.role === "user");
  return ((m?.content as { type: string; text?: string }[]) ?? []).map((c) => c.text ?? "").join(" ").toLowerCase();
}

/** The day the app said is on screen, from the instructions. */
function dayFrom(prompt: Prompt): string {
  const sys = prompt.find((p) => p.role === "system");
  const m = /looking at \w{3} \w{3} \d+[^)]*?(\d{4}-\d{2}-\d{2})?/.exec(String(sys?.content ?? ""));
  return m?.[1] ?? "2026-11-26";
}

function script(prompt: Prompt): Chunk[] {
  const last = prompt.at(-1);
  if (last?.role === "tool") {
    const out = JSON.stringify(last.content);
    if (out.includes("ask_user")) return call("add_items", { items: [{ title: "Group dinner", kind: "food", date: "2026-11-28", time: "19:30", booking: "todo", maybe: true }] });
    if (out.includes("needsConfirmation")) return text("That needs a tap from you to confirm.");
    if (out.includes("shown")) return text("Tap Add on any of these to put it on the day. (These are made-up places from the test assistant.)");
    if (out.includes("Test Posada")) return text("Recorded a made-up test booking from the screenshot.");
    return text("Done. You can undo it from the message below.");
  }
  const said = lastUser(prompt);
  const user = [...prompt].reverse().find((p) => p.role === "user");
  const pictures = ((user?.content as { type: string }[]) ?? []).filter((c) => c.type === "file").length;
  if (pictures) {
    const n = /screenshot (\d+)/.exec(said)?.[1] ?? "1";
    return call("add_items", {
      items: [
        {
          title: `Test Posada ${n}`,
          kind: "stay",
          date: "2026-11-30",
          time: "15:00",
          endDate: "2026-12-01",
          endTime: "11:00",
          booking: "booked",
          confirmation: `TEST-${n}00`,
          address: "3a Calle Oriente 28, Antigua",
        },
      ],
    });
  }
  if (/\b(eat|restaurant|dinner near|food)\b/.test(said)) {
    return call("show_options", {
      heading: "Places to eat near your stay",
      options: [
        { name: "Test Café Uno", why: "Quiet courtyard, good for a slow breakfast", kind: "food", address: "5a Avenida Norte 10, Antigua", priceHint: "Q60 a person" },
        { name: "Test Cocina Dos", why: "Local dishes, walkable from the Airbnb", kind: "food", address: "3a Calle Poniente 7, Antigua", website: "https://example.com" },
        { name: "Test Rooftop Tres", why: "Volcano view at sunset", kind: "food", address: "6a Calle Oriente 2, Antigua", phone: "+502 5555 0100" },
      ],
    });
  }
  if (/\bplan\b/.test(said)) {
    const day = dayFrom(prompt);
    return call("add_items", {
      items: [
        { title: "Breakfast near the dock", kind: "food", date: day, time: "08:00", maybe: true },
        { title: "Boat across the lake", kind: "transport", date: day, time: "09:30", maybe: true },
        { title: "Afternoon swim", kind: "activity", date: day, time: "15:00", maybe: true },
      ],
    });
  }
  if (/\b(remove|delete)\b/.test(said)) return call("remove_items", { ids: ["activity-cliff-jumping"] });
  if (/\badd dinner\b/.test(said)) return call("ask_user", { question: "Which night?", options: ["Fri Nov 27", "Sat Nov 28"] });
  return text("(Test assistant) Try asking where to eat, to plan a day, or to remove something.");
}

/** The same script as one response, for calls that don't stream (reading screenshots). */
function generated(prompt: Prompt) {
  const chunks = script(prompt);
  const content: Chunk[] = chunks.flatMap((c): Chunk[] =>
    c.type === "text-delta" ? [{ type: "text", text: c.delta }] : c.type === "tool-call" ? [{ type: "tool-call", toolCallId: c.toolCallId, toolName: c.toolName, input: c.input }] : [],
  );
  const finish = chunks.find((c) => c.type === "finish") as { finishReason: unknown };
  return { content, finishReason: finish.finishReason, usage, warnings: [] };
}

export function mockModel(): LanguageModel {
  return new MockLanguageModelV4({
    doStream: async ({ prompt }) => ({
      stream: simulateReadableStream({ chunks: script(prompt as unknown as Prompt) as never, chunkDelayInMs: 30 }),
    }),
    doGenerate: async ({ prompt }) => generated(prompt as unknown as Prompt) as never,
  });
}
