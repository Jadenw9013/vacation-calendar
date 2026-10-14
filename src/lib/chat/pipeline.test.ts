import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { trip as seed } from "@/data/trip";
import { MemoryTripRepository } from "@/lib/repo/memory";
import { FAILURE, handleChat } from "./pipeline";
import { readChunks } from "./replay";

/*
 * What a bad or interrupted model reply does: never a card, a plain message,
 * the trip unchanged. And stopping on the client stops the model.
 */

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: 4 },
};
type Chunk = Record<string, unknown>;
const finish = (unified: string): Chunk => ({ type: "finish", finishReason: { unified, raw: unified.toUpperCase() }, usage });

const OPS = { ops: [{ op: "set_status", id: "activity-zipline", status: "booked" }] };

function modelFrom(chunks: Chunk[], opts: { delayMs?: number } = {}) {
  const seen = { calls: 0, aborted: false };
  const model = new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => {
      seen.calls++;
      abortSignal?.addEventListener("abort", () => (seen.aborted = true));
      return { stream: simulateReadableStream({ chunks: chunks as never, chunkDelayInMs: opts.delayMs ?? 0 }) };
    },
  });
  return { model, seen };
}

function request(text: string, signal?: AbortSignal) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ id: "u1", role: "user", parts: [{ type: "text", text }] }], author: "Sam", outcomes: {} }),
    signal,
  });
}

async function run(chunks: Chunk[], text = "Mark the zipline as booked") {
  const repo = new MemoryTripRepository(seed);
  const before = (await repo.get()).version;
  const { model, seen } = modelFrom(chunks);
  const res = await handleChat(request(text), { repo, models: [model], vision: false, backoffMs: 0 });
  const out = await readChunks(res);
  return { out, seen, versionUnchanged: (await repo.get()).version === before };
}

const card = (out: Chunk[]) => out.filter((c) => c.type === "tool-output-available" || c.type === "tool-input-available");
const errors = (out: Chunk[]) => out.filter((c) => c.type === "error").map((c) => c.errorText);

describe("bad model replies never become cards", () => {
  it("a complete call sends one card, after one model call", async () => {
    const r = await run([{ type: "tool-call", toolCallId: "c1", toolName: "propose_changes", input: JSON.stringify(OPS) }, finish("tool-calls")]);
    expect(r.seen.calls).toBe(1);
    expect(card(r.out).map((c) => c.type)).toEqual(["tool-input-available", "tool-output-available"]);
    expect(r.versionUnchanged).toBe(true); // a card is only a proposal
  });

  it("cut off at the output cap (finish reason length): no card, a plain failure", async () => {
    const r = await run([{ type: "tool-call", toolCallId: "c1", toolName: "propose_changes", input: JSON.stringify(OPS) }, finish("length")]);
    expect(card(r.out)).toEqual([]);
    expect(errors(r.out)).toEqual([FAILURE.length]);
    expect(r.versionUnchanged).toBe(true);
  });

  it("a tool call still streaming when the stream ends: no card", async () => {
    const r = await run([
      { type: "tool-input-start", id: "c1", toolName: "propose_changes" },
      { type: "tool-input-delta", id: "c1", delta: '{"ops":[{"op":"set_st' },
      finish("length"),
    ]);
    expect(card(r.out)).toEqual([]);
    // Cut off mid-call: the SDK reports the forced call as missing. Either way, one plain failure.
    expect(errors(r.out)).toHaveLength(1);
    expect([FAILURE.length, FAILURE.malformed]).toContain(errors(r.out)[0]);
  });

  it("a malformed call (arguments that aren't JSON): no card, a plain failure", async () => {
    const r = await run([{ type: "tool-call", toolCallId: "c1", toolName: "propose_changes", input: '{"ops": [ {"op": "set_status", ' }, finish("tool-calls")]);
    expect(card(r.out)).toEqual([]);
    expect(errors(r.out)).toEqual([FAILURE.malformed]);
    expect(r.versionUnchanged).toBe(true);
  });

  it("a stream that fails halfway: the text so far, then a plain failure, no card, trip unchanged", async () => {
    const r = await run([
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "Here's what I" },
      { type: "error", error: new Error("socket hang up") },
    ], "what should we do on friday");
    expect(card(r.out)).toEqual([]);
    expect(errors(r.out)).toEqual([FAILURE.broken]);
    expect(r.versionUnchanged).toBe(true);
  });
});

/** Reads until the first piece of model text has arrived. */
async function readUntilText(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let seen = "";
  while (!seen.includes('"text-delta"')) {
    const { value, done } = await reader.read();
    if (done) throw new Error("stream ended before any text");
    seen += decoder.decode(value);
  }
}

describe("stopping", () => {
  it("cancelling the response aborts the model call", async () => {
    const repo = new MemoryTripRepository(seed);
    const { model, seen } = modelFrom(
      [{ type: "text-start", id: "t" }, ...Array.from({ length: 50 }, () => ({ type: "text-delta", id: "t", delta: "word " })), { type: "text-end", id: "t" }, finish("stop")],
      { delayMs: 20 },
    );
    const res = await handleChat(request("what should we do on friday"), { repo, models: [model], vision: false, backoffMs: 0 });
    const reader = res.body!.getReader();
    await readUntilText(reader); // the model is streaming
    await reader.cancel("stopped");
    await new Promise((r) => setTimeout(r, 50));
    expect(seen.aborted).toBe(true);
  });

  it("the request being aborted (client gone) aborts the model call", async () => {
    const repo = new MemoryTripRepository(seed);
    const { model, seen } = modelFrom(
      [{ type: "text-start", id: "t" }, ...Array.from({ length: 50 }, () => ({ type: "text-delta", id: "t", delta: "word " })), finish("stop")],
      { delayMs: 20 },
    );
    const ac = new AbortController();
    const res = await handleChat(request("what should we do on friday", ac.signal), { repo, models: [model], vision: false, backoffMs: 0 });
    const reader = res.body!.getReader();
    await readUntilText(reader); // the model is streaming
    ac.abort();
    await new Promise((r) => setTimeout(r, 50));
    expect(seen.aborted).toBe(true);
  });
});
