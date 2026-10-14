// Size of what the planner sends the model for each eval scenario's first
// message: system prompt + tool schemas + conversation. Approximate tokens as
// characters / 4 (the SDK has no token counter for Gemini).
//
//   npx tsx scripts/context-size.ts --label before
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { trip as seed } from "../src/data/trip";
import { SCENARIOS } from "../src/lib/chat/eval-cases";
import { modelRequestFor } from "../src/lib/chat/context";

const label = process.argv[process.argv.indexOf("--label") + 1] || "now";
const state = { trip: seed, version: 1 };
const rows = SCENARIOS.map((sc, i) => {
  const req = modelRequestFor(state, sc.turns[0], { author: sc.author ?? "Sam", today: "2026-09-29", now: Date.parse("2026-09-29T12:00:00-06:00") });
  const tools = JSON.stringify(Object.fromEntries(Object.entries(req.tools).map(([k, t]) => [k, { d: t.description, s: z.toJSONSchema(t.inputSchema as z.ZodType) }])));
  const chars = req.instructions.length + tools.length + JSON.stringify(req.messages).length;
  return { scenario: i + 1, instructions: req.instructions.length, tools: tools.length, messages: JSON.stringify(req.messages).length, chars, approxTokens: Math.round(chars / 4) };
});
const total = rows.reduce((n, r) => n + r.approxTokens, 0);
const out = { label, method: "approximate: characters / 4", median: rows.map((r) => r.approxTokens).sort((a, b) => a - b)[Math.floor(rows.length / 2)], mean: Math.round(total / rows.length), rows };
writeFileSync(`bench/results/context-${label}.json`, JSON.stringify(out, null, 2) + "\n");
console.log(`context (${label}): mean ≈ ${out.mean} tokens, median ≈ ${out.median} tokens per request (${out.method})`);
