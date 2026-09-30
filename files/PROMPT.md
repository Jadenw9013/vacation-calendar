# Build prompt: Guatemala trip planning site

Paste this into Claude Code in an empty repo. `TRIP-DATA.md` must be in the repo root alongside it.

---

Build a small static website that my travel companions and I use to see our Guatemala trip (Nov 24 to Nov 30, 2026) at a glance, spot the gaps where nothing is booked yet, and track what still needs booking.

Read `TRIP-DATA.md` first. It is the ground truth for every confirmed booking and every known gap. Do not invent bookings, prices, or times. Anything unknown stays marked unknown in the UI.

## What it is for

Three or four people planning one trip, checking this on their phones, mostly to answer: where am I sleeping that night, who booked it, and what still has nobody on it. It is not a general travel app. It is this one trip.

## Stack and constraints

- Next.js (App Router) with TypeScript, deployed on Vercel as a static site. `next build` with no server runtime required.
- No database, no auth, no API routes. All trip content lives in a typed data file (`src/data/trip.ts`) that we edit by hand and redeploy.
- Tailwind for styling. No component library.
- No login, so the site is public by URL. Nothing sensitive in the repo: no confirmation numbers, no full names beyond first names, no phone numbers, no payment details.
- Mobile first. It will mostly be read on a phone in a shuttle.

## Data model

Define these types in `src/data/types.ts` and populate `src/data/trip.ts` from `TRIP-DATA.md`.

- `Segment`: an item on the timeline. Fields: `id`, `kind` (`flight` | `lodging` | `activity` | `transport`), `title`, `start` (ISO datetime), `end` (ISO datetime), `status` (`booked` | `needs-booking` | `undecided`), `location`, `owner` (who booked or owns it, optional), `cost` (optional, with currency), `notes` (optional), `todos` (optional string array).
- `OpenQuestion`: decisions blocking a booking, with `id`, `question`, `blocks` (segment ids), `notes`.

Derive gaps in code. Do not hardcode them. Sort segments by start time, then flag any stretch where nobody has lodging for a night, and any stretch over 90 minutes between the end of one segment and the start of the next where no transport segment covers it. The gap list must recompute correctly when we edit the data file, because we will.

## Pages

One page is enough. A single scrollable timeline grouped by day, Nov 24 through Nov 30, plus two summary sections.

1. Timeline. Each day is a section header with the date and weekday. Under it, segments in time order. Each segment shows title, time range, location, status, and owner. Booked and unbooked must be distinguishable at a glance without relying on color alone.
2. Gaps. Derived, at the top so it is the first thing anyone sees. Each gap says what is missing, which night or window, and how long.
3. Still to book. Every segment with status `needs-booking` or `undecided`, plus the open questions, each showing what decision is blocking it.

Add a small countdown to departure if it is genuinely useful. Skip it if it is just decoration.

## Design direction

Do not reach for the generic AI landing-page look: no cream background with a serif display face and a terracotta accent, no identical rounded cards with soft grey shadows, no all-caps eyebrow labels, no arrows appended to link text. Pick a palette and typeface deliberately and say why in your plan. The subject is a week that goes from a red-eye arrival to a 13,000 foot volcano summit, so the design has somewhere to go.

Legibility beats cleverness. The thing that needs to be loud is which nights nobody has booked.

## How to work

Go in phases and stop for my review at the end of each. Do not run ahead.

1. Scaffold the Next.js app, define the types, and transcribe `TRIP-DATA.md` into `src/data/trip.ts`. Show me the data file and your reading of it, including anything in the doc you found ambiguous. Stop.
2. Write the gap and derived-state logic with unit tests, no UI. Show me the computed gaps as plain output so I can check them against reality. Stop.
3. Propose the design plan in prose: palette as named hex values, typefaces and their roles, layout concept. No code yet. Stop.
4. Build the UI. Stop.
5. Prepare for deploy: README with how to edit `trip.ts` and redeploy, and confirm `next build` passes clean. Stop.

Keep commits small and tell me what to verify at each stop.
