# Guatemala trip, Nov 24–30, 2026

A one-page static site for the trip: where we sleep each night, what's booked, and what still has nobody on it. It's public by URL, so nothing sensitive goes in here: no confirmation numbers, surnames, phone numbers or payment details.

The source of truth is [`files/TRIP-DATA.md`](files/TRIP-DATA.md). The site reads everything from [`src/data/trip.ts`](src/data/trip.ts).

## Editing the trip

Everything lives in `src/data/trip.ts`. The gaps, the night strip and "Still to book" are all computed from it, so you never edit a gap directly.

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

Each entry in `openQuestions` lists the segment ids it `blocks`. When a question is answered, delete it and update the segments it blocked.

### Checking your edit

```bash
npm run gaps   # prints nights, gaps and still-to-book as plain text
npm test       # unit tests, including a check that trip.ts is valid
```

The build fails on purpose if `trip.ts` has a bad date, a duplicate id, or a question that points at a segment that doesn't exist. That way a typo can't ship a wrong page.

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
npm run build   # static export to out/
```

## Deploying

The site is a static export (`output: "export"`), so there are no servers, database or environment variables.

**First time:** import the repo at [vercel.com/new](https://vercel.com/new). It detects Next.js and needs no settings changed. Or, from this folder:

```bash
npx vercel          # link the project and create a preview deploy
npx vercel --prod   # production
```

**After that:** if the repo is connected to Vercel, push to `main` and it redeploys. Otherwise, run `npx vercel --prod` again after editing `trip.ts`.

## Layout

```
files/TRIP-DATA.md       source notes from the booking confirmations
src/data/types.ts        Segment, OpenQuestion, Trip
src/data/trip.ts         the trip, edited by hand
src/lib/time.ts          date parsing and formatting (times stay local, never the viewer's zone)
src/lib/derive.ts        nights, gaps, still-to-book, timeline, validation
src/components/          UI pieces
src/app/page.tsx         the page
docs/DESIGN.md           palette, type and layout rationale
scripts/print-gaps.ts    npm run gaps
```
