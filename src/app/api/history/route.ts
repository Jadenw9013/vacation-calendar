import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { getRepository } from "@/lib/repo";

export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  const entries = await getRepository().history(Number.isInteger(limit) && limit > 0 ? limit : 50);
  return NextResponse.json({ entries });
}
