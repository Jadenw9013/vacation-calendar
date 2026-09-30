import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { getRepository } from "@/lib/repo";

export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  return NextResponse.json(await getRepository().get());
}
