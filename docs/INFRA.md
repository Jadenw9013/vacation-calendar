# Infrastructure: regions and Fluid compute

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
