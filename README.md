# Trip

A shared trip app for a small group: what's next and how to get there, where you sleep tonight, every booking with its link, contact and confirmation number, the posts and links you saved, and an assistant that knows the place. It works on a phone with no signal.

It started as the Guatemala trip (Nov 24 – Dec 1, 2026), which is still its first trip. Any group can start another.

## Using it

- **Today**: the next thing on the day, as a big ticket, with one tap to get directions, call, message on WhatsApp or copy the confirmation. Below it, where you sleep tonight, then the rest of the day. Before the trip, a countdown and what's left to book.
- **Plan**: every day in order, where you sleep each night, a link that opens the day's route in Google Maps, and **Ideas**: things saved without a day yet.
- **To-do**: things still to book (with their booking link and a one-tap **Booked** that asks for the confirmation number), what's missing (a night with no bed, the flight home), and the group's list.
- **Trip**: details, people, inviting someone, the passcode, trip notes (entry rules, money), costs, everything that's changed with **Undo**, and display settings: light, dark, **Sunlight** (black on white for reading outdoors) and large text.
- **The + button**: one box for everything.
  - Type a plan ("dinner fri 7 at Sabe Rico") and it's added. It guesses AM or PM when you don't say, and shows the guess.
  - Paste a link (TikTok, Instagram, YouTube, Airbnb, Booking.com, Google Maps, anything) and it's saved to an item or as a new idea.
  - Ask a question and the assistant answers.
- **Tap anything** to open its page:
  - when and where it is
  - the reservation, with link, confirmation, price and who booked it
  - contact details: phone, WhatsApp, email, website, Instagram
  - links and posts, with previews
  - notes and a checklist
  - who's on it
  - **Ask about this**

  Every field is edited in place, and every change can be undone.
- **Sharing from other apps (Android)**: once the app is installed, it appears in the share sheet. Share a TikTok, a Reel or a Maps place and it lands in the trip. On iPhone, copy the link and paste it into the + box.

## Privacy

Each trip has its own link and a passcode the group shares. Joining asks for your first name and the passcode, and sets a cookie for that trip only. The link alone doesn't open the trip.

- The original trip (`/t/guatemala`) takes its passcode from `TRIP_PASSCODE`, or from the first person to join.
- Change the passcode under **Trip** → **Change passcode**. People already in stay in.
- Card numbers and CVV codes are stripped from anything saved. Confirmation numbers, phones and links are kept: that's what the app is for.
- The assistant never sees confirmation numbers.

## The assistant

The assistant runs on Gemini 3.8 Flash through the Vercel AI SDK. It has Google Maps grounding (real places, hours, links), Google Search and URL reading, plus its own tools:

| Tool | Does |
|---|---|
| `add_items`, `update_items`, `add_todos` | Change the trip at once, with Undo in the app. |
| `remove_items` | Never removes anything: shows a card a person confirms. Moving a booked item's dates also asks. |
| `show_options` | 2–4 real places or operators as cards, each added with one tap. |
| `ask_user` | One question with tappable answers when a request is ambiguous. |

Sources from Google Maps are shown under the answer, labeled "Google Maps", as Google's terms require. Pasted text and screenshots are treated as data, never instructions.

Without `GEMINI_API_KEY` the assistant says it isn't set up and everything else works. If a model is busy (429 or 5xx), the next one in `GEMINI_FALLBACK_MODELS` answers. If a model refuses the built-in Google tools, the same request runs without them.

Why Gemini: it's the only provider with Maps grounding, which is the travel-guide job. Google lists Maps and Search grounding as paid-tier only: with billing enabled on the key's project, the first 5,000 grounded queries a month are free, then $14 per 1,000. Without billing, or whenever Google refuses a lookup, the assistant still answers but says it couldn't check current hours or prices. A paid key also keeps prompts out of Google's product training, which matters once trips hold confirmation numbers and phone numbers. See `docs/REBUILD-PLAN.md` for the comparison with Claude and Meta's Muse Spark.

```bash
npm run assistant:eval          # 10 realistic requests (2 with screenshots) against real Gemini, on a copy of the trip
npm run assistant:eval -- 1 7   # just some
```

To click through the assistant without a key, run `CHAT_MOCK=1 npm run dev`. That uses a scripted stand-in (its places are made up and say so).

## How it works

Read the architecture and the reasons behind it in [`docs/REBUILD-PLAN.md`](docs/REBUILD-PLAN.md). In short:

- **One kind of thing.** Everything on a trip is an *item* (stay, flight, transport, activity, food) with optional details. Booking status is one of those details, never something you must choose to add a thing.
- **Edits are ops.** Every change, from a person, the offline outbox or the assistant, is a list of ops, checked by the same zod schemas and rules (`src/domain/`).
  - The server applies them to the latest trip, so two people editing at once both land.
  - Each change is logged with its inverse for Undo.
  - Deleting a booked item or moving its dates needs `confirmed: true`, which only a person can give.
- **Offline first.**
  - The trip is kept in localStorage.
  - Edits show at once and wait in an outbox until there's a connection.
  - Moving between screens happens on the phone (`history.pushState`), so every screen opens with no signal. The service worker serves the trip's page when it can't reach the server.
- **Storage.** Upstash Redis, one JSON document per trip with compare-and-set writes: `t:{id}:state`, `t:{id}:version`, `t:{id}:log`, `t:{id}:pass`, plus a `trips` index. The original v1 trip (`trip:v1:state`) is migrated on first read, so nothing typed on the old site is lost.

```
src/domain/     types, schemas, ops with inverses, derived views, quick-add parsing, v1 migration (pure, tested)
src/server/     trip store (Redis / memory), passcodes and sessions, link previews, the assistant
src/client/     the trip on the phone (store, outbox, snapshot), screen routing, display settings
src/features/   Today, Plan, To-do, Trip, the item page, the composer, the assistant, join, home
src/ui/         icons, sheets, buttons
src/app/        pages and API routes
src/data/       the original v1 seed (migrated on read)
```

### API

All trip routes need the trip's cookie, from joining. POST routes refuse cross-site requests.

| Route | Does |
|---|---|
| `GET /api/trips` / `POST /api/trips` | Trips this browser has joined / create a trip and join it |
| `GET` / `POST /api/t/{id}/join` | Trip name and whether it has a passcode / join with `{ name, passcode }` |
| `POST /api/t/{id}/me` | Change your name, or the trip's passcode |
| `GET /api/t/{id}` | `{ trip, version, me }` |
| `POST /api/t/{id}/ops` | `{ ops, key?, confirmed? }`. 200 applied; 422 rejected; 428 needs a person to confirm (a booked item) |
| `POST /api/t/{id}/undo` | `{ entryId }`. Undoes that change on top of whatever happened since |
| `GET /api/t/{id}/history` | The change log, newest first |
| `POST /api/t/{id}/unfurl` | `{ url }`. A link's title, picture and kind |
| `POST /api/t/{id}/chat` | The assistant (AI SDK UI message stream) |

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000. Trips live in memory until you add Redis
npm test             # unit and API tests
npm run e2e          # browser tests at phone and desktop sizes (in-memory store, scripted assistant)
npm run lint
npm run typecheck
npm run build
npm run summary      # the seed trip as the app sees it: nights, what's missing, what to book
```

## Deploying to Vercel

1. Import the repo at vercel.com/new. Leave the build settings alone.
2. Storage → Upstash for Redis → connect it. That sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. Settings → Environment Variables: `GEMINI_API_KEY`. Optionally also `SESSION_SECRET` and `TRIP_PASSCODE`.
4. Redeploy. Environment variable changes only apply to new deployments.

The first visit to `/t/guatemala` migrates the old trip if there is one, or seeds it from `src/data/trip.ts`.

## Before the trip

Run through [`docs/DEVICE-CHECKLIST.md`](docs/DEVICE-CHECKLIST.md) on one iPhone and one Android phone. In particular: install the app on each phone, open the trip once with signal, then check it in airplane mode.
