# Voyroo infrastructure: regions and Fluid compute

Updated during the Voyroo rename in October 2026. The Vercel project is
`voyroo`, linked to GitHub repository `Jadenw9013/voyroo` (repository ID
`1396936798`). The project ID stays `prj_ZLxbK1uOHBb49fxLNpo4MAZnqeGZ`.

The primary production address is `https://www.voyroo.com`, with
`https://voyroo.com` redirecting to it. Both domains are verified in Vercel
and HTTPS is working. Metadata uses the `www` address. The original
`calendar-omega-weld.vercel.app` domain remains assigned for existing links.

Google OAuth must use the same host where sign-in starts: register
`https://www.voyroo.com/api/auth/google/callback` in Google Cloud, then set
the Production `GOOGLE_REDIRECT_URI` to that exact URL and redeploy. Keep
localhost's callback in `.env.local`. Account cookies are host-specific,
so people sign in once on the new domain to restore existing memberships.

## Function region and database region

| | Setting | Status |
|---|---|---|
| Vercel function region | Project default: **iad1 (Washington, D.C.)** | Confirmed through the authenticated Vercel project API during the rename |
| Upstash database region | Chosen when the database was created; not visible in the code or the REST URL | Not confirmed (no access from here) |

**How to check (2 minutes):**

1. Vercel → the `voyroo` project → Settings → Functions → **Function Region**. Note it (e.g. `iad1`).
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

**Enabled**, confirmed through the authenticated Vercel project API during
the rename. To inspect later, use Vercel → project → Settings → Functions,
or `vercel project inspect voyroo`. With Fluid compute, warm instances are
reused across requests, so the chat route's module setup (zod schemas, the
Gemini client) is paid once per instance, not per message.
