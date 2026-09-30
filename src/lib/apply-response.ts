import "server-only";
import { NextResponse } from "next/server";
import type { ApplyResult } from "./repo";

/** 200 applied, 409 someone else edited first, 422 the ops were rejected. */
export function applyResponse(result: ApplyResult) {
  if (result.ok) return NextResponse.json(result);
  return NextResponse.json(result, { status: result.reason === "conflict" ? 409 : 422 });
}
