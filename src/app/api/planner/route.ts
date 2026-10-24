import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { stripCards } from "@/domain/change";
import { PlannerSnapshotSchema } from "@/domain/planner";
import { isZone } from "@/domain/time";
import { readAccount } from "@/server/auth";
import { firstName, getStore, jsonError, readJson, sameSite } from "@/server/http";
import { planConversation } from "@/server/ai/planner";
import { errorMessage } from "@/server/ai/models";

export const maxDuration = 60;
const requestSchema = z.object({ snapshot: PlannerSnapshotSchema, homeTz: z.string().max(64).refine(isZone) });
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const account = await readAccount();
  const raw = account ? await getStore().getPlanner(account.id) : null;
  let snapshot = null;
  try { snapshot = raw ? PlannerSnapshotSchema.parse(JSON.parse(raw)) : null; } catch { /* Older drafts can be restarted. */ }
  return NextResponse.json({ snapshot }, { headers: noStore });
}

export async function POST(request: Request) {
  const denied = sameSite(request);
  if (denied) return denied;
  const body = await readJson(request, 100_000);
  if (!body.ok) return body.res;
  const parsed = requestSchema.safeParse(body.body);
  if (!parsed.success || parsed.data.snapshot.messages.at(-1)?.role !== "user") return jsonError(400, "Send a message to start planning.");
  if (parsed.data.snapshot.messages.length > 37) return jsonError(400, "Save this trip or start a fresh conversation to keep planning.");
  const account = await readAccount();
  const address = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const key = `planner:${account?.id || createHash("sha256").update(address).digest("hex")}`;
  if (await getStore().hit(key, 3600) > 50) return jsonError(429, "You've done a lot of planning. Take a break and try again in an hour.");
  const clean = JSON.parse(stripCards(JSON.stringify(parsed.data.snapshot)));
  const snapshot = PlannerSnapshotSchema.parse(clean);
  try {
    const reply = await planConversation(snapshot, { name: firstName(account?.name.split(/\s+/)[0]) || snapshot.draft?.travelerName || "", homeTz: parsed.data.homeTz, signal: request.signal });
    if (!reply) return jsonError(503, "The planner is not available yet. Your message is kept here; try again once the assistant is connected.");
    const next = PlannerSnapshotSchema.parse(JSON.parse(stripCards(JSON.stringify({ ...snapshot, draft: reply.draft, suggestions: reply.suggestions, messages: [...snapshot.messages, { role: "assistant", content: reply.message }] }))));
    if (account) await getStore().setPlanner(account.id, JSON.stringify(next));
    return NextResponse.json({ snapshot: next, savedToAccount: !!account }, { headers: noStore });
  } catch (error) { return jsonError(502, errorMessage(error)); }
}

export async function DELETE(request: Request) {
  const denied = sameSite(request);
  if (denied) return denied;
  const account = await readAccount();
  if (account) await getStore().setPlanner(account.id, "");
  return NextResponse.json({ ok: true });
}
