import { guard, jsonError, parseAuthor, parseVersion, readJson } from "@/lib/api";
import { applyResponse } from "@/lib/apply-response";
import { getRepository } from "@/lib/repo";

/** Body: { ops: Op[], expectedVersion: number, author: string } */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.res;
  const { ops, expectedVersion, author } = parsed.body;

  const version = parseVersion(expectedVersion);
  if (version === null) return jsonError(400, "expectedVersion must be a positive integer");
  const name = parseAuthor(author);
  if (name === null) return jsonError(400, "author must be a first name");

  return applyResponse(await getRepository().applyOps(ops, version, { author: name }));
}
