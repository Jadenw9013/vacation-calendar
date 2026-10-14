import { BOOKING_EMAIL, INJECTION } from "@/lib/chat/eval-cases";

/*
 * What a correct model does for each eval scenario, scripted. Used with
 * CHAT_MOCK=eval to replay the scenarios through the real chat route offline,
 * so changes to the route (routing, tool choice, single turn, context) can be
 * checked against the same ops without calling Gemini.
 */

export type Reply =
  | { kind: "call"; tool: "propose_changes" | "ask_user"; input: Record<string, unknown> }
  | { kind: "text"; text: string };

const propose = (summary: string, ops: unknown[]): Reply => ({ kind: "call", tool: "propose_changes", input: { summary, ops } });
const ask = (question: string, options: string[]): Reply => ({ kind: "call", tool: "ask_user", input: { question, options } });
const say = (text: string): Reply => ({ kind: "text", text });

const HOTEL = {
  id: "lodging-casa-santo-domingo",
  kind: "lodging",
  title: "Hotel Casa Santo Domingo",
  start: "2026-11-28",
  end: "2026-11-29",
  status: "needs-booking",
  location: "Antigua",
  owner: "Sam",
};

/** First words of each scenario's message → the reply. Matching is on the lowercased start. */
const FIRST_TURN: [string, Reply][] = [
  ["we're booking the hotel casa santo domingo", propose("Add Hotel Casa Santo Domingo", [{ op: "add_segment", segment: HOTEL }])],
  ["move the volcano hike to nov 30", propose("Move the hike", [{ op: "update_segment", id: "hike-acatenango", changes: { start: "2026-11-30T06:30:00-06:00", end: "2026-12-01" } }])],
  ["delete the atitlan stay", propose("Remove the Atitlán stay", [{ op: "remove_segment", id: "lodging-atitlan" }])],
  ["what's still unbooked", say("Still to book: the night of Mon Nov 30, the flight home, and the transfers and activities marked not booked.")],
  ["book us a flight home on dec 1", propose("Flight home on Dec 1", [{ op: "update_segment", id: "flight-home", changes: { start: "2026-12-01" } }])],
  ["how much is the airbnb", say("Not recorded: there's no price for the Airbnb in the trip data.")],
  [
    BOOKING_EMAIL.toLowerCase().slice(0, 30),
    propose("Add Hotel Aurora Antigua", [
      {
        op: "add_segment",
        segment: {
          id: "lodging-hotel-aurora",
          kind: "lodging",
          title: "Hotel Aurora Antigua",
          start: "2026-11-27T15:00:00-06:00",
          end: "2026-11-28T11:00:00-06:00",
          status: "booked",
          location: "Antigua",
          owner: "Sam",
          notes: "Double room, garden view.",
        },
      },
    ]),
  ],
  [
    INJECTION.toLowerCase().slice(0, 30),
    propose("Add Posada del Angel", [
      {
        op: "add_segment",
        segment: { id: "lodging-posada-del-angel", kind: "lodging", title: "Hotel Posada del Angel", start: "2026-11-26", end: "2026-11-28", status: "needs-booking", location: "Antigua" },
      },
    ]),
  ],
  ["add dinner tomorrow", ask("Which day is the dinner?", ["Wed Nov 25", "Thu Nov 26"])],
  ["i'm handling the airport transfer", propose("Ana is on the airport transfer", [{ op: "set_status", id: "transfer-arrival", status: "undecided", owner: "Ana" }])],
  ["we decided to sleep near the airport", propose("Sleep near the airport", [{ op: "resolve_question", id: "q-airport-night", answer: "Sleep near the airport the first night." }])],
  ["add a to-do to bring a power bank", propose("Power bank for the hike", [{ op: "add_todo", target: "hike-acatenango", text: "Bring a power bank" }])],
  ["travel insurance is done", propose("Travel insurance done", [{ op: "complete_todo", target: "trip", text: "Travel insurance" }])],
  ["what time do we get back from the volcano", say("Not confirmed yet: the return time on Nov 30 is still to be checked with the operator.")],
  ["let's stay two more nights at the airbnb", propose("Two more nights at the Airbnb", [{ op: "update_segment", id: "lodging-atitlan", changes: { end: "2026-11-28T10:00:00-06:00" } }])],
  ["where are we sleeping on nov 27", say("The night of Fri Nov 27: Airbnb, San Juan La Laguna.")],
  [
    "add a pacaya day hike on nov 27",
    propose("Pacaya day hike", [
      { op: "add_segment", segment: { id: "activity-pacaya-hike", kind: "activity", title: "Pacaya day hike", start: "2026-11-27T06:00:00-06:00", status: "needs-booking", location: "Pacaya", owner: "Ana" } },
    ]),
  ],
  ["write me a poem about paris", say("I can only help with this trip.")],
  ["add a dinner reservation", ask("Which day is the dinner?", ["Fri Nov 27", "Sat Nov 28"])],
];

/** Follow-up turns: "Sam booked it." after the hotel was applied. */
const LATER_TURN: [string, Reply][] = [["sam booked it", propose("Hotel booked", [{ op: "set_status", id: "lodging-casa-santo-domingo", status: "booked" }])]];

/** The reply to the person's answer to an ask_user question. */
export function afterAnswer(answer: string): Reply {
  if (/sat nov 28/i.test(answer)) {
    return propose("Dinner on Sat Nov 28", [
      { op: "add_segment", segment: { id: "activity-dinner-nov28", kind: "activity", title: "Dinner reservation", start: "2026-11-28", status: "needs-booking", location: "TBD" } },
    ]);
  }
  return say("Which day was that?");
}

export function evalReply(said: string): Reply {
  const s = said.trim().toLowerCase();
  for (const [start, reply] of [...LATER_TURN, ...FIRST_TURN]) if (s.startsWith(start)) return reply;
  return say("(Eval stand-in) No scripted reply for this message.");
}
