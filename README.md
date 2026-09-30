# Guatemala trip, Nov 24–30, 2026

A one-page site for the trip: where we sleep each night, what's booked, and what still has nobody on it. Anyone in the group can edit it from their phone.

The whole site sits behind one shared passphrase (`TRIP_PASSPHRASE`), because it lists where we'll be and when. Nothing sensitive goes into the data: no confirmation numbers, surnames, phone numbers or payment details. The server strips confirmation numbers, phone numbers and card details from anything saved, as a backstop.

## Where the data lives

- **Upstash Redis** holds the live trip, its version number, and a log of every change (who, when, what, and how to undo it).
- **[`src/data/trip.ts`](src/data/trip.ts)** is the seed. When the store is empty, the site fills it from this file. After that, edits happen on the site, not in this file.
- **[`files/TRIP-DATA.md`](files/TRIP-DATA.md)** is the original notes the seed was transcribed from.

Every edit is a list of **ops** (`add_segment`, `update_segment`, `remove_segment`, `set_status`, `add_todo`, `complete_todo`, `resolve_question`). Each op is checked against a schema in `src/lib/ops.ts` and applied to a copy of the trip, and the result is validated. It's then saved only if nobody else saved in the meantime; if someone did, you get "Someone else changed the trip", and the page reloads.

- **Booked items are protected.** Removing a booked item, or changing its times, needs an extra confirmation. The server enforces this, not just the UI.
- **Undo** replays the inverse of the last change as a new change, so it shows up in the log too.

## Editing on the site

1. On first visit, pick your first name. It's recorded as who made each change. It's bookkeeping, not a login. ("Not you?" at the top changes it.)
2. Use **+ Add item**, the **Edit** link on any item, the tick boxes on to-dos, and **Record the decision** on open questions.
3. After a save, the notice at the bottom has an **Undo** button.

## The day plan

Each day can have timed plan steps alongside its bookings: "8:30 AM leave for Panajachel", "sunrise hike", "lights out". They're plans, not bookings, so they have no status and never count as gaps or beds.

- **+ Add to plan** under any day adds one by hand.
- **Draft with the planner** asks the assistant for that day's schedule around what's booked. It arrives as a proposal card like any other change.
- Times the planner suggests are marked **Suggested** (with a dashed dot) until someone taps **Keep** or edits them.
- Plan steps sit in the day's timeline in time order; steps with no time ("Anytime") go at the end.

Plan items live in `trip.plan` and change through the `add_plan_item`, `update_plan_item` and `remove_plan_item` ops, with undo like everything else.

## The planner (chat assistant)

**Ask the planner** (bottom right) opens a chat: a bottom sheet on phones, a side panel on desktop. It can answer questions about the trip and draft changes. It can't change anything by itself.

- **Proposal cards.** Every change the planner suggests appears as a card listing what it adds, changes or removes, and which gaps that closes or opens. Tap **Apply**, **Discard**, or **Tweak** (which prefills a follow-up).
- **Preview.** While a card is waiting, the timeline shows the proposed items as dashed outlines and items to be removed struck through. Applying makes them solid, with a brief highlight.
- **Booked items.** A card that removes or retimes something booked says so, and its button reads **Confirm and apply**. The server refuses those changes without that confirmation, and the planner itself can't supply it.
- **Questions.** When a request is ambiguous, the planner asks one question with tappable options.
- **Suggestions.** The chips above the input come from the current trip (the first night without a bed, an open question, and so on).
- **Ask about this.** The **Ask** link on any item or gap opens the chat with that item named.
- **Activity tab.** Lists who changed what, with **Undo this** on the latest change.
- **Your name.** On first visit you pick your first name. It's used as the author of changes and as "I" in the chat.
- **Pasted text.** Booking emails can be pasted as they are. Pasted text is treated as data, not instructions, and confirmation numbers, phone numbers and card details are stripped on the server.
- **Rules the code enforces, not just the prompt.** The planner has exactly two tools: `propose_changes` (validated like a manual edit, never writes) and `ask_user`. Applying uses the trip version the proposal was built against. If someone else edited in the meantime, the card is marked stale and the planner is asked to redo it.

### Model and provider

The planner uses Google Gemini through the Vercel AI SDK. The model id and provider list live in [`src/lib/llm/config.ts`](src/lib/llm/config.ts). The default is `gemini-3.8-flash`; override it with `GEMINI_MODEL` if AI Studio shows a different id or limits for your key.

If the main model is overloaded (503) or over its rate limit (429), the planner tries `gemini-3.5-flash` and then `gemini-3.5-flash-lite` before giving up. Gemini's free-tier limits are per model, so each fallback brings its own quota. Override the list with `GEMINI_FALLBACK_MODELS=id1,id2`. If every model is busy, the chat says so in plain words instead of "An error occurred".

Groq and NVIDIA are listed there as commented-out entries. Both are OpenAI-compatible: to add one, install `@ai-sdk/openai-compatible`, add its case in `src/lib/llm/provider.ts`, uncomment its config entry, and set its key.

If there's no key, or the provider is down, the planner shows a notice and everything else keeps working.

### Checking the planner's behaviour

```bash
npm run chat:eval            # 20 scripted prompts against real Gemini, printed for reading
npm run chat:eval -- 3 8 9   # just some
```

This needs `GEMINI_API_KEY` in `.env.local`. Each scenario starts from a fresh in-memory copy of the seed and never touches the real store. Set `EVAL_DELAY_MS` to space out calls on the free tier.

To click through the chat UI without a key, run `CHAT_MOCK=1 npm run dev`. That swaps in a scripted fake model: try messages containing "hotel", "delete" or "dinner". It's ignored in production.

## Resetting to the seed

To start over from `trip.ts`, delete the keys `trip:v1:state`, `trip:v1:version` and `trip:v1:log` in the Upstash console. The next page load reseeds from `trip.ts`.

## Editing the seed file

This section only matters before the store is first filled, or after a reset. The gaps, the night strip and "Still to book" are computed from the trip data, so you never edit a gap directly.

### Booking something that already has a placeholder

For example, you've booked a hotel in Antigua for the nights of Nov 26–28:

```ts
{
  id: "lodging-nov26-28",
  kind: "lodging",
  title: "Hotel name",
  start: "2026-11-26T14:00:00-06:00", // check-in
  end: "2026-11-29T05:45:00-06:00",   // checkout
  status: "booked",                   // was "undecided"
  location: "Antigua",
  owner: "Sam",                       // first name of whoever booked it
},
```

Once it's booked, the "No bed" cells for those nights turn solid.

### Adding something new

Add an object to `segments`. The fields:

| Field | Values |
| --- | --- |
| `id` | Unique, kebab-case. Open questions refer to it. |
| `kind` | `flight`, `lodging`, `activity`, `transport` |
| `start`, `end` | See "Dates and times" below. |
| `status` | `booked`, `needs-booking`, `undecided` |
| `owner` | First name only. Leave it out if nobody has it. |
| `cost` | Optional: `{ amount: 450, currency: "GTQ" }` or `"USD"` |
| `notes`, `todos` | Optional free text, or a list of strings. |
| `includesLodging` | `true` on a non-lodging segment you sleep in, such as the overnight hike. |
| `peakElevationM` | Optional summit height in metres. |

### Dates and times

- **Known time:** a full ISO datetime with the local UTC offset, e.g. `"2026-11-28T08:00:00-06:00"`. Guatemala is always `-06:00` (it has no daylight saving time). Seattle in November is `-08:00`.
- **Known day, unknown time:** the date only, e.g. `"2026-11-30"`. It shows as "TBD".
- **Unknown:** `null`, e.g. a return flight with no date picked yet.

Don't guess a time to make something look complete. Unknown stays unknown.

### Open questions

Each entry in `openQuestions` lists the segment ids it `blocks`. On the site, **Record the decision** stores an `answer`. An answered question moves to "Decided" and stops blocking anything.

### Checking your edit

```bash
npm run gaps   # prints nights, gaps and still-to-book as plain text
npm test       # unit tests, including a check that trip.ts is valid
```

`npm test` fails if `trip.ts` has a bad date, a duplicate id, or a question that points at a segment that doesn't exist. Edits made on the site go through the same validation before they're saved.

## How gaps are computed

Only segments with `status: "booked"` count as coverage. Placeholders show up in "Still to book" but never hide a gap.

- **Nights.** The night of a date is covered if a booked lodging segment (or an activity with `includesLodging`) spans it by calendar date, or if a booked flight is in the air at local midnight. Consecutive empty nights merge into one gap.
- **Transport.** Booked segments are sorted by start time. Any window longer than 90 minutes between two segments is flagged, unless one side of it is a booked `transport` segment. If either end has no time yet, the length shows as "unknown".
- **Flight home.** Flagged when the last booked segment isn't a flight.

The logic is in `src/lib/derive.ts`, with tests in `src/lib/derive.test.ts`.

## Running locally

```bash
npm install
npm run dev     # http://localhost:3000
npm test
npm run build
```

With no env vars set, local dev keeps edits in memory (they reset when the server restarts) and skips the passphrase. The page shows a note about both. To try the real setup locally, copy `.env.example` to `.env.local` and fill it in.

## Deploying to Vercel

1. **Import the repo** at [vercel.com/new](https://vercel.com/new). It detects Next.js; leave the build settings alone.
2. **Add storage:** Project → Storage → Upstash for Redis (free tier) → connect it to the project. That sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. **Set the variables:** Project → Settings → Environment Variables:
   - `TRIP_PASSPHRASE`. Share it with the group out of band, not in the repo.
   - `GEMINI_API_KEY`, from Google AI Studio.
4. **Redeploy** so the new variables take effect. The first page load seeds the store from `trip.ts`.

After that, every push to `main` redeploys. Without a passphrase, production shows a locked page. Without Redis, it refuses to start unless you set `ALLOW_MEMORY_STORE=1`. That's a stopgap only: on Vercel, in-memory edits vanish whenever a new server instance starts, and different instances can show different versions. Once Redis is connected, the app uses it automatically and `ALLOW_MEMORY_STORE` can be deleted.

Environment variable changes only apply to new deployments. Redeploy after changing one.

Changing `TRIP_PASSPHRASE` signs everyone out.

## Layout

```
files/TRIP-DATA.md       source notes from the booking confirmations
src/data/types.ts        Segment, OpenQuestion, Trip
src/data/trip.ts         the seed
src/lib/time.ts          date parsing and formatting (times stay local, never the viewer's zone)
src/lib/derive.ts        nights, gaps, still-to-book, timeline, validation
src/lib/ops.ts           op schemas (zod), applying one op, and its inverse
src/lib/engine.ts        batches of ops: validate, redact, apply, build the change-log entry
src/lib/redact.ts        strips confirmation numbers, phone numbers and card details
src/lib/repo/            TripRepository: Redis in production, in-memory for tests and local dev
src/lib/auth.ts          passphrase and session cookie
src/proxy.ts             gates every page and API route behind the passphrase
src/app/api/             login, logout, trip, ops, undo, history
src/components/edit/     manual edit forms, name picker
src/components/chat/     planner panel, proposal cards, activity list
src/components/TripShell.tsx  the page layout and the proposal preview
src/lib/chat/            system prompt, tools, proposal building and gap delta
src/lib/llm/             provider config (Gemini), the scripted mock model
docs/DESIGN.md           palette, type and layout rationale
scripts/print-gaps.ts    npm run gaps (reads the seed file)
scripts/chat-eval.ts     npm run chat:eval
```

### API

All routes need the session cookie. POST routes also reject cross-origin requests.

| Route | Does |
| --- | --- |
| `GET /api/trip` | `{ trip, version }` |
| `POST /api/ops` | `{ ops, expectedVersion, author }`. Returns 200 if applied, 409 if someone else edited first, 422 if rejected (the issues say why; `needs_confirmation` means a booked item was touched without `confirmBooked: true`). |
| `POST /api/undo` | `{ expectedVersion, author }`. Undoes the latest change. |
| `GET /api/history?limit=50` | Change log, newest first. |
| `POST /api/chat` | `{ messages, author, outcomes }`. Streams the planner's reply (AI SDK UI message stream). |
