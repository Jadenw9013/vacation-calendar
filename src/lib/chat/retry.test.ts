import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { trip as seed } from "@/data/trip";
import { MemoryTripRepository } from "@/lib/repo/memory";
import { FAILURE, handleChat } from "./pipeline";
import { readChunks } from "./replay";

/*
 * Retries and repairs, with stand-in models whose replies are scripted per
 * call. Transient errors get one retry, then the fallback model; a bad tool
 * call gets one repair with its issues; the budgets are separate; nothing is
 * merged across attempts and nothing is applied.
 */

type Chunk = Record<string, unknown>;
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const finish = (unified: string): Chunk => ({ type: "finish", finishReason: { unified, raw: undefined }, usage });
const call = (input: unknown): Chunk[] => [{ type: "tool-call", toolCallId: `c${Math.random()}`, toolName: "propose_changes", input: JSON.stringify(input) }, finish("tool-calls")];
const GOOD = { ops: [{ op: "set_status", id: "activity-zipline", status: "booked" }] };
const BAD = { ops: [{ op: "set_status", id: "no-such-item", status: "booked" }] };
const overloaded = () => Object.assign(new Error("model overloaded"), { statusCode: 503 });

type Step = Chunk[] | Error;

/** A model that plays `steps` in order, one per call, recording what it was sent. */
function scripted(steps: Step[]) {
  const log = { calls: 0, prompts: [] as unknown[] };
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      const step = steps[Math.min(log.calls, steps.length - 1)];
      log.calls++;
      log.prompts.push(prompt);
      if (step instanceof Error) throw step;
      return { stream: simulateReadableStream({ chunks: step as never, chunkDelayInMs: 0 }) };
    },
  });
  return { model, log };
}

async function send(models: ReturnType<typeof scripted>[], text = "Mark the zipline as booked") {
  const repo = new MemoryTripRepository(seed);
  const res = await handleChat(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ id: "u1", role: "user", parts: [{ type: "text", text }] }], author: "Sam", outcomes: {} }),
    }),
    { repo, models: models.map((m) => m.model), vision: false, backoffMs: 0 },
  );
  const out = await readChunks(res);
  return {
    cards: out.filter((c) => c.type === "tool-output-available"),
    errors: out.filter((c) => c.type === "error").map((c) => (c as { errorText: string }).errorText),
    text: out.filter((c) => c.type === "text-delta").map((c) => (c as { delta: string }).delta).join(""),
    version: (await repo.get()).version,
  };
}

describe("transient errors", () => {
  it("one retry on the same model, then a card", async () => {
    const primary = scripted([overloaded(), call(GOOD)]);
    const r = await send([primary]);
    expect(primary.log.calls).toBe(2);
    expect(r.cards).toHaveLength(1);
    expect(r.errors).toEqual([]);
  });

  it("after the retry, the fallback model", async () => {
    const primary = scripted([overloaded(), overloaded()]);
    const fallback = scripted([call(GOOD)]);
    const r = await send([primary, fallback]);
    expect([primary.log.calls, fallback.log.calls]).toEqual([2, 1]);
    expect(r.cards).toHaveLength(1);
  });

  it("no fallback configured: a plain message, no card", async () => {
    const primary = scripted([overloaded(), overloaded(), overloaded()]);
    const r = await send([primary]);
    expect(primary.log.calls).toBe(2);
    expect(r.cards).toEqual([]);
    expect(r.errors).toHaveLength(1);
  });

  it("never retries once text is on screen, so nothing is merged", async () => {
    const primary = scripted([
      [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Partly" }, { type: "error", error: overloaded() }],
      [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: " written twice" }, { type: "text-end", id: "t" }, finish("stop")],
    ]);
    const r = await send([primary], "what should we do on friday");
    expect(primary.log.calls).toBe(1);
    expect(r.text).toBe("Partly");
    expect(r.errors).toEqual([FAILURE.broken]);
  });
});

describe("bad tool calls", () => {
  it("one repair that shows the model its issues, then the card", async () => {
    const primary = scripted([call(BAD), call(GOOD)]);
    const r = await send([primary]);
    expect(primary.log.calls).toBe(2);
    expect(JSON.stringify(primary.log.prompts[1])).toContain("no-such-item");
    expect(JSON.stringify(primary.log.prompts[1])).toContain('"status":"invalid"');
    expect(r.cards).toHaveLength(1);
  });

  it("still bad after the repair: a plain failure, no card", async () => {
    const primary = scripted([call(BAD), call(BAD)]);
    const r = await send([primary]);
    expect(primary.log.calls).toBe(2);
    expect(r.cards).toEqual([]);
    expect(r.errors).toEqual([FAILURE.invalid]);
  });

  it("a repair doesn't use up the retry for a network blip", async () => {
    const primary = scripted([call(BAD), overloaded(), call(GOOD)]);
    const r = await send([primary]);
    expect(primary.log.calls).toBe(3);
    expect(r.cards).toHaveLength(1);
  });

  it("nothing is applied, whatever happens", async () => {
    const primary = scripted([call(BAD), overloaded(), call(GOOD)]);
    expect((await send([primary])).version).toBe(1);
  });
});
