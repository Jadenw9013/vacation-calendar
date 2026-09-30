import { APICallError, generateText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { chatErrorMessage, isRetryable, withFallbacks } from "./provider";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function apiError(statusCode: number) {
  return new APICallError({ message: `status ${statusCode}`, url: "https://example.test", requestBodyValues: {}, statusCode });
}

function model(id: string, behaviour: "ok" | number, calls: string[]) {
  return new MockLanguageModelV4({
    modelId: id,
    doGenerate: async () => {
      calls.push(id);
      if (behaviour !== "ok") throw apiError(behaviour);
      return { content: [{ type: "text", text: `from ${id}` }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] };
    },
  });
}

const run = (m: ReturnType<typeof withFallbacks>) => generateText({ model: m, prompt: "hi", maxRetries: 0 });

describe("withFallbacks", () => {
  it("moves to the next model when one is overloaded or rate limited", async () => {
    const calls: string[] = [];
    const r = await run(withFallbacks([model("a", 503, calls), model("b", 429, calls), model("c", "ok", calls)] as never));
    expect(r.text).toBe("from c");
    expect(calls).toEqual(["a", "b", "c"]);
  });

  it("stops at the first model that works", async () => {
    const calls: string[] = [];
    await run(withFallbacks([model("a", "ok", calls), model("b", "ok", calls)] as never));
    expect(calls).toEqual(["a"]);
  });

  it("does not fall back on our own errors (bad request, auth)", async () => {
    const calls: string[] = [];
    await expect(run(withFallbacks([model("a", 400, calls), model("b", "ok", calls)] as never))).rejects.toThrow();
    expect(calls).toEqual(["a"]);
  });

  it("gives a busy message when every model is out", async () => {
    const calls: string[] = [];
    const err = await run(withFallbacks([model("a", 429, calls), model("b", 503, calls)] as never)).catch((e) => e);
    expect(isRetryable(err)).toBe(true);
    expect(chatErrorMessage(err)).toContain("busy");
    expect(chatErrorMessage(apiError(400))).not.toContain("busy");
  });
});
