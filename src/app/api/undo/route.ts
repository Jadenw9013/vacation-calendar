import { guard, jsonError, parseAuthor, parseVersion, readJson } from "@/lib/api";
import { applyResponse } from "@/lib/apply-response";
import { getRepository, undoLatest } from "@/lib/repo";

/** Body: { expectedVersion: number, author: string }. Undoes the most recent change. */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.res;

  const version = parseVersion(parsed.body.expectedVersion);
  if (version === null) return jsonError(400, "expectedVersion must be a positive integer");
  const name = parseAuthor(parsed.body.author);
  if (name === null) return jsonError(400, "author must be a first name");

  const result = await undoLatest(getRepository(), version, name);
  if (!result) return jsonError(404, "nothing to undo");
  return applyResponse(result);
}
