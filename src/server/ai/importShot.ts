import "server-only";
import { generateText, isStepCount } from "ai";
import type { TripStore } from "../store";
import { assistantModel, isMock, SETTINGS } from "./models";
import { buildInstructions } from "./prompt";
import { buildTools, type ChangeResult } from "./tools";

/*
 * One booking screenshot, read and recorded. Screenshots come one request at
 * a time, in order: each sees what the ones before it added, so a hotel's
 * confirmation and its email don't become two stays; and no request comes
 * near Vercel's 4.5 MB body limit.
 */

const RULES = `
--- Importing screenshots ---
The person is adding bookings from screenshots, one at a time. For this one:
- If it shows a booking or reservation (flight, stay, tour, transport, restaurant, ticket), record it. Use update_items when it matches an item already in the trip (same place and overlapping dates, same flight number and date, same operator and day, including one you added from an earlier screenshot); otherwise add_items.
- A confirmation, receipt or itinerary means booking "booked". A quote, cart, search result or listing means "todo".
- Copy what's visible: the confirmation number, dates and times, address, phone, price with its currency, check-in and check-out times, the booking site's link if shown. Leave out anything blurry or cut off.
- Never copy guests', passengers' or hosts' full names. Never copy card numbers.
- If it isn't a booking, or you can't read it, don't call any tool.
- Then reply with one short line saying what you recorded, or what the screenshot shows if you recorded nothing.`;

export interface ImportResult {
  results: ChangeResult[];
  text: string;
}

export async function importScreenshot(args: { store: TripStore; tripId: string; me: string; image: { data: string; mediaType: string }; index: number; total: number }): Promise<ImportResult | null> {
  const model = isMock() ? (await import("./mock")).mockModel() : assistantModel();
  if (!model) return null;
  const { store, tripId, me } = args;
  const state = await store.get(tripId);
  if (!state) return null;
  const all = buildTools({ store, tripId, me, trip: async () => (await store.get(tripId))!.trip });
  const tools = { add_items: all.add_items, update_items: all.update_items };

  const r = await generateText({
    model,
    instructions: buildInstructions(state.trip, { me, nowMs: Date.now(), day: null, itemId: null }) + RULES,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `Screenshot ${args.index} of ${args.total}. Record the booking it shows.` },
          { type: "file", data: args.image.data, mediaType: args.image.mediaType },
        ],
      },
    ],
    tools,
    stopWhen: isStepCount(3),
    maxOutputTokens: 4096,
    maxRetries: 1,
    providerOptions: { google: { thinkingConfig: { thinkingLevel: SETTINGS.thinkingLevel } } },
  });
  return {
    results: r.steps.flatMap((s) => s.toolResults.map((t) => t.output as ChangeResult)),
    text: r.text.trim(),
  };
}
