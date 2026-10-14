// Times the planner end to end over HTTP, against any running copy of the site.
//
//   npm run chat:bench -- --label before --base http://localhost:3100
//   npm run chat:bench -- --label after  --base http://localhost:3000
//
// Options:
//   --label <name>   results go to bench/results/<name>.json (required)
//   --base <url>     the site to measure (default http://localhost:3000)
//   --delay <ms>     pause between requests, to stay under the free-tier
//                    rate limit (default 13000, about 4.5 requests a minute)
//   --repeat <n>     run each prompt n times (default 1)
//
// Sends the 12 most representative eval prompts, one per request, as "Bench".
// Client-side stages are measured here; server stages come from the reply's
// finish metadata and Server-Timing header when the server provides them (an
// older build without instrumentation just leaves those columns empty).
// Retries 429s and "busy" replies with backoff. Nothing is applied: a
// proposal is read and discarded.
import { mkdirSync, writeFileSync } from "node:fs";
import { SCENARIOS } from "../src/lib/chat/eval-cases";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const label = arg("label");
const base = (arg("base", "http://localhost:3000") as string).replace(/\/$/, "");
const delay = Number(arg("delay", "13000"));
const repeat = Number(arg("repeat", "1"));
if (!label || !/^[\w.-]+$/.test(label)) {
  console.error("Give a --label, e.g. --label before (letters, digits, dots, dashes).");
  process.exit(1);
}

/** 1-based scenario numbers: proposals, booked-item changes, questions, paste, injection, text answers. */
const PICK = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18];

interface Run {
  scenario: number;
  attempt: number;
  kind: "proposal" | "question" | "text" | "error";
  status: number;
  client: { headersMs: number; firstChunkMs: number | null; firstContentMs: number | null; cardMs: number | null; doneMs: number };
  server: Record<string, number | string | null> | null;
  serverTiming: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function once(scenario: number, attempt: number): Promise<Run> {
  const text = SCENARIOS[scenario - 1].turns[0];
  const t0 = performance.now();
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({
      messages: [{ id: `bench-${scenario}-${attempt}`, role: "user", parts: [{ type: "text", text }] }],
      author: "Bench",
      outcomes: {},
      context: {},
    }),
  });
  const headersMs = performance.now() - t0;
  const run: Run = {
    scenario,
    attempt,
    kind: "text",
    status: res.status,
    client: { headersMs, firstChunkMs: null, firstContentMs: null, cardMs: null, doneMs: 0 },
    server: null,
    serverTiming: res.headers.get("server-timing"),
  };
  if (!res.ok || !res.body) {
    run.kind = "error";
    run.client.doneMs = performance.now() - t0;
    return run;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let sawError = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const now = performance.now() - t0;
    run.client.firstChunkMs ??= now;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      const c = JSON.parse(line.slice(6));
      if (["text-delta", "tool-input-start", "tool-input-available", "tool-output-available", "error"].includes(c.type)) run.client.firstContentMs ??= now;
      if (c.type === "tool-output-available") {
        run.client.cardMs ??= now;
        run.kind = "proposal";
      }
      if (c.type === "tool-input-available" && c.toolName === "ask_user") run.kind = "question";
      if (c.type === "error") sawError = true;
      if (c.messageMetadata?.timing) run.server = c.messageMetadata.timing;
    }
  }
  run.client.doneMs = performance.now() - t0;
  if (sawError) run.kind = "error";
  return run;
}

/** Retries rate limits and overload with backoff: 15 s, 30 s, 45 s. */
async function measure(scenario: number): Promise<Run> {
  for (let attempt = 0; ; attempt++) {
    const run = await once(scenario, attempt);
    const transient = run.status === 429 || run.status >= 500 || (run.kind === "error" && run.status === 200);
    if (!transient || attempt >= 3) return run;
    const wait = 15_000 * (attempt + 1);
    console.log(`  scenario ${scenario}: busy or rate limited, retrying in ${wait / 1000} s`);
    await sleep(wait);
  }
}

/** Nearest-rank percentile. */
function pct(values: number[], p: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1)];
}

export function summarize(runs: Run[]) {
  const ok = runs.filter((r) => r.kind !== "error");
  const stages: [string, (r: Run) => number | null | undefined][] = [
    ["client: headers", (r) => r.client.headersMs],
    ["client: first content", (r) => r.client.firstContentMs],
    ["client: card shown", (r) => r.client.cardMs],
    ["client: done", (r) => r.client.doneMs],
    ["server: store read", (r) => r.server?.storeReadMs as number],
    ["server: context build", (r) => r.server?.contextMs as number],
    ["server: model first byte", (r) => r.server?.ttfbMs as number],
    ["server: model total", (r) => r.server?.modelMs as number],
    ["server: validation", (r) => r.server?.validationMs as number],
    ["server: total", (r) => r.server?.totalMs as number],
    ["model turns", (r) => r.server?.turns as number],
    ["input tokens", (r) => r.server?.inputTokens as number],
    ["output tokens", (r) => r.server?.outputTokens as number],
    ["thinking tokens", (r) => r.server?.thoughtsTokens as number],
  ];
  return Object.fromEntries(
    stages.map(([name, get]) => {
      const values = ok.map(get).filter((x): x is number => typeof x === "number");
      return [name, { n: values.length, median: pct(values, 50), p90: pct(values, 90) }];
    }),
  );
}

async function main() {
  console.log(`Benchmarking ${base} as "${label}": ${PICK.length} prompts × ${repeat}, ${delay} ms apart.\n`);
  const runs: Run[] = [];
  let first = true;
  for (let r = 0; r < repeat; r++) {
    for (const n of PICK) {
      if (!first) await sleep(delay);
      first = false;
      const run = await measure(n);
      runs.push(run);
      console.log(`  ${String(n).padStart(2)}  ${run.kind.padEnd(8)}  first content ${fmt(run.client.firstContentMs)}  done ${fmt(run.client.doneMs)}`);
    }
  }
  const summary = summarize(runs);
  console.log(`\n${"stage".padEnd(26)}${"n".padStart(4)}${"median".padStart(10)}${"p90".padStart(10)}`);
  for (const [stage, s] of Object.entries(summary)) {
    const unit = stage.includes("tokens") || stage === "model turns" ? "" : " ms";
    console.log(`${stage.padEnd(26)}${String(s.n).padStart(4)}${fmtN(s.median, unit).padStart(10)}${fmtN(s.p90, unit).padStart(10)}`);
  }
  mkdirSync("bench/results", { recursive: true });
  const file = `bench/results/${label}.json`;
  writeFileSync(file, JSON.stringify({ label, base, startedAt: new Date().toISOString(), prompts: PICK, runs, summary }, null, 2) + "\n");
  console.log(`\nSaved ${file}. Errors: ${runs.filter((r) => r.kind === "error").length} of ${runs.length}.`);
}

const fmt = (n: number | null) => (n === null ? "    –   " : `${Math.round(n).toString().padStart(6)} ms`);
const fmtN = (n: number | null, unit: string) => (n === null ? "–" : `${Math.round(n)}${unit}`);

if (process.argv[1]?.endsWith("chat-bench.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : "Bench failed.");
    process.exit(1);
  });
}
