# Planner infrastructure: regions, Fluid compute, Redis calls, bundle size

Written for the phase 3 speed work. Two items couldn't be read from here and
need a minute in the Vercel dashboard; the steps are below.

## Function region and database region

| | Setting | Status |
|---|---|---|
| Vercel function region | No `vercel.json`/`vercel.ts` in the repo, so the project default applies: **iad1 (Washington, D.C.)** unless it was changed in the dashboard | Not confirmed: the Vercel API returned 403 for this project's team from here, and the Vercel CLI isn't installed |
| Upstash database region | Chosen when the database was created; not visible in the code or the REST URL | Not confirmed (no access from here) |

**How to check (2 minutes):**

1. Vercel → the `calendar` project → Settings → Functions → **Function Region**. Note it (e.g. `iad1`).
2. Vercel → Storage → the Upstash database (or console.upstash.com → the database) → **Region** (e.g. `us-east-1`).
3. They should be the same place. iad1 is AWS `us-east-1`, so an Upstash database in `us-east-1` is already co-located.

**If they differ:** move the functions, not the database. Add `vercel.json` at the
repo root with the function region nearest the database, e.g. for an Upstash
database in `us-west-2` (Oregon):

```json
{ "regions": ["pdx1"] }
```

The Hobby plan allows exactly one region, which is all this needs. Common pairs:
`iad1` ↔ `us-east-1`, `pdx1` ↔ `us-west-2`, `cle1` ↔ `us-east-2`, `fra1` ↔ `eu-central-1`.
Redeploy after changing it. Don't move or recreate the database.

## Fluid compute

Not confirmed from here (same 403). To check: Vercel → project → Settings →
Functions → **Fluid Compute** should be on (it is the default for projects
created since 2025). Or, with the CLI logged in to the right team:
`vercel project inspect calendar`. With Fluid compute, warm instances are
reused across requests, so the chat route's module setup (zod schemas, the
Gemini client) is paid once per instance, not per message.

## Redis calls

Counted with a recording stand-in for the Upstash client
(`src/lib/chat/redis-calls.test.ts`). `@upstash/redis` 1.39 pipelines
commands issued together by default (`enableAutoPipelining` defaults to true),
so the two reads in `repo.get()` go as one HTTP round trip.

| Request | Before (phase 2) | After |
|---|---|---|
| Chat message | 4 GETs, 2 round trips (the route read the trip, then the proposal tool read it again) | **2 GETs, 1 round trip** (read once, reused for validation) |
| Schedule question answered locally | n/a (went to the model) | 2 GETs, 1 round trip, no model call |
| Apply | 2 GETs + 1 EVAL, 2 round trips | unchanged: the compare-and-set needs the version it read first. Combining them would mean changing the storage layer, which is out of scope |
| Page refresh after Apply | GET, GET, LRANGE in 1 round trip | unchanged |

An Apply that comes back with the same idempotency key after a conflict adds
one LRANGE (recent history) to find the earlier result.

## Chat route bundle

The route's server entry plus every chunk it loads at start
(`npx tsx scripts/route-size.ts .next-e2e api/chat`):

| | Raw | Gzip |
|---|---|---|
| Before (redesign-phase2) | 1,171 KB | 298 KB |
| After, first pass | 1,372 KB | 348 KB |
| After (date parser loaded on demand) | **1,195 KB** | **306 KB** |

The first pass grew by chrono-node (282 KB), which the router needs only for
Quick Add lines and dated sleep questions; it now loads on demand. The
remaining +24 KB is the pipeline, router and summary code. Only the Gemini
SDK is imported (the one provider in use); the stand-in model is a dynamic
import used only with CHAT_MOCK outside production.
