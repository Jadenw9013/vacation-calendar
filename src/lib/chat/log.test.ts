import { afterEach, describe, expect, it, vi } from "vitest";
import { trip as seed } from "@/data/trip";
import { mockModel } from "@/lib/llm/mock";
import { MemoryTripRepository } from "@/lib/repo/memory";
import { handleChat } from "./pipeline";

/** The timing log line: numbers and fixed labels only. */
describe("chat log line", () => {
  afterEach(() => vi.restoreAllMocks());

  it("has no message text, trip contents, names, keys or passphrases", async () => {
    process.env.CHAT_MOCK = "eval";
    process.env.GEMINI_API_KEY = "canary-not-a-real-key";
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")));
    const message = "Move the volcano hike to Nov 30.";
    const res = await handleChat(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ id: "u", role: "user", parts: [{ type: "text", text: message }] }], author: "Sam", outcomes: {} }),
      }),
      { repo: new MemoryTripRepository(seed), models: [mockModel()], vision: false },
    );
    await res.text();
    const line = lines.find((l) => l.includes('"evt":"chat"'))!;
    console.info(`SAMPLE LOG LINE: ${line}`);
    const parsed = JSON.parse(line);
    expect(Object.keys(parsed).sort()).toEqual(
      ["contextMs", "evt", "finishReason", "inputTokens", "modelMs", "outcome", "outputTokens", "route", "storeReadMs", "storeWriteMs", "thoughtsTokens", "totalMs", "ttfbMs", "turns", "validationMs"].sort(),
    );
    for (const [k, v] of Object.entries(parsed)) {
      if (["evt", "route", "finishReason", "outcome"].includes(k)) expect(String(v)).toMatch(/^[a-z-]+$/);
      else expect(v === null || typeof v === "number", k).toBe(true);
    }
    for (const secret of [message, "volcano", "Acatenango", "Sam", "hike-acatenango", "canary-not-a-real-key", "2026-11"]) {
      expect(line).not.toContain(secret);
    }
    delete process.env.GEMINI_API_KEY;
  });
});
