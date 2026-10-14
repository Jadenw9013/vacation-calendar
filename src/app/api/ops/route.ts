import { NextResponse } from "next/server";
import { guard, jsonError, parseAuthor, parseVersion, readJson } from "@/lib/api";
import { applyResponse } from "@/lib/apply-response";
import type { ChangeMeta } from "@/lib/engine";
import { getRepository } from "@/lib/repo";

const KEY = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Body: { ops: Op[], expectedVersion: number, author: string, key?: string }
 *
 * `key` makes Apply idempotent: if the same request arrives twice (a double
 * tap, a retry after a dropped connection), the second finds the version has
 * moved on, sees its own key on the latest changes, and gets the first
 * result back instead of a conflict. Nothing is applied twice.
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.res;
  const { ops, expectedVersion, author, key } = parsed.body;

  const version = parseVersion(expectedVersion);
  if (version === null) return jsonError(400, "expectedVersion must be a positive integer");
  const name = parseAuthor(author);
  if (name === null) return jsonError(400, "author must be a first name");
  const requestKey = typeof key === "string" && KEY.test(key) ? key : undefined;

  const repo = getRepository();
  // Passed through the repository as-is to the engine, which records it on the change.
  const meta: ChangeMeta = { author: name, ...(requestKey ? { requestKey } : {}) };
  const result = await repo.applyOps(ops, version, meta);
  if (!result.ok && result.reason === "conflict" && requestKey) {
    const earlier = (await repo.history(10)).find((e) => e.requestKey === requestKey);
    if (earlier) return NextResponse.json({ ok: true, state: result.state, entry: earlier, replayed: true });
  }
  return applyResponse(result);
}
