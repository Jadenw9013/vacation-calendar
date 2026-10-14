// Runs test prompts through the real assistant (Gemini) and prints what it
// proposed, next to what it should do, so a person can read them.
//
//   npm run chat:eval              # all scenarios
//   npm run chat:eval -- 3 4 9     # just these
//
// Needs GEMINI_API_KEY in .env.local. Each scenario starts from a fresh
// in-memory copy of src/data/trip.ts; nothing touches the real store.
import { generateText, isStepCount, type ModelMessage } from "ai";
import { trip as seed } from "../src/data/trip";
import type { Proposal } from "../src/lib/chat/proposal";
import { buildInstructions, buildTools } from "../src/lib/chat/setup";
import { CHAT_LIMITS } from "../src/lib/llm/config";
import { availableModels, isRetryable } from "../src/lib/llm/provider";
import { MemoryTripRepository } from "../src/lib/repo/memory";
import { SCENARIOS } from "../src/lib/chat/eval-cases";

const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 4000); // free tiers are per-minute

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function indent(s: string, n = 6) {
  return s.replace(/^/gm, " ".repeat(n));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isRetryable(e) || attempt >= 3) throw e;
      const wait = 15_000 * (attempt + 1);
      console.log(indent(`(rate limited or server error, retrying in ${wait / 1000}s)`));
      await sleep(wait);
    }
  }
}

async function main() {
  const [provider] = availableModels();
  if (!provider) {
    console.error("No GEMINI_API_KEY. Put it in .env.local and run again.");
    process.exit(1);
  }
  const only = process.argv.slice(2).map(Number).filter(Boolean);
  const today = "2026-09-29"; // fixed so "tomorrow" is reproducible
  console.log(`Model: ${provider.config.id} / ${provider.config.model}. Today pinned to ${today}.\n`);

  for (const [n, sc] of SCENARIOS.entries()) {
    const num = n + 1;
    if (only.length && !only.includes(num)) continue;
    const author = sc.author ?? "Sam";
    const repo = new MemoryTripRepository(seed);
    const messages: ModelMessage[] = [];
    let pendingAsk: { toolCallId: string } | null = null;

    console.log(`━━ ${num}. ${sc.turns[0].split("\n")[0].slice(0, 80)}`);
    console.log(`   expect: ${sc.expect}`);

    for (const [t, turn] of sc.turns.entries()) {
      if (pendingAsk) {
        messages.push({
          role: "tool",
          content: [{ type: "tool-result", toolCallId: pendingAsk.toolCallId, toolName: "ask_user", output: { type: "text", value: turn } }],
        });
        console.log(`   [${author} taps] ${turn}`);
      } else {
        messages.push({ role: "user", content: turn });
        if (t > 0) console.log(`   [${author}] ${turn}`);
      }
      pendingAsk = null;

      const state = await repo.get();
      const res = await withRetry(() =>
        generateText({
          model: provider.model,
          instructions: buildInstructions({ state, author, today }),
          messages,
          tools: buildTools(() => repo.get()),
          stopWhen: isStepCount(CHAT_LIMITS.maxSteps),
          maxOutputTokens: CHAT_LIMITS.maxOutputTokens,
          maxRetries: CHAT_LIMITS.maxRetries,
          providerOptions: { google: { thinkingConfig: { thinkingLevel: CHAT_LIMITS.thinkingLevel } } },
        }),
      );
      messages.push(...res.response.messages);

      let lastProposal: Proposal | null = null;
      for (const step of res.steps) {
        for (const call of step.toolCalls) {
          if (call.toolName === "ask_user") {
            const input = call.input as { question: string; options: string[] };
            console.log(`   → ask_user: ${input.question}  [${input.options.join(" | ")}]`);
            pendingAsk = { toolCallId: call.toolCallId };
          }
        }
        for (const result of step.toolResults) {
          if (result.toolName !== "propose_changes") continue;
          const p = result.output as Proposal;
          lastProposal = p;
          console.log(`   → propose_changes (${p.status}): ${p.summary}`);
          for (const c of p.changes) console.log(indent(`• ${c}`));
          for (const c of p.confirmations) console.log(indent(`! ${c}`));
          for (const i of p.issues) console.log(indent(`✗ op ${i.index}: ${i.message}`));
          if (p.gapDelta.closes.length) console.log(indent(`closes: ${p.gapDelta.closes.join("; ")}`));
          if (p.gapDelta.opens.length) console.log(indent(`opens: ${p.gapDelta.opens.join("; ")}`));
          if (p.redacted.length) console.log(indent(`redacted: ${p.redacted.join(", ")}`));
          console.log(indent(`ops: ${JSON.stringify(p.ops)}`, 6));
        }
      }
      if (res.text.trim()) console.log(`   reply: ${res.text.trim().replace(/\n+/g, " ")}`);

      if (sc.applyAfter === t && lastProposal && lastProposal.status !== "invalid") {
        const applied = await repo.applyOps(lastProposal.ops, state.version, { author });
        console.log(`   (applied: ${applied.ok ? "yes" : JSON.stringify(applied)})`);
      }
      await sleep(DELAY_MS);
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
