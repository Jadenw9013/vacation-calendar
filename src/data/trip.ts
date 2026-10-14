import type { Trip } from "./types";

/**
 * Transcribed from files/TRIP-DATA.md. Edit this file and redeploy.
 *
 * Rules:
 * - Only `booked` segments count as coverage when gaps are computed.
 *   Placeholders with `needs-booking` / `undecided` exist so they show up in
 *   "Still to book"; they never hide a gap.
 * - Unknown stays unknown: use a date-only start/end ("2026-11-30") when the
 *   time is not known, and null when even that is not known.
 * - Nothing sensitive: no confirmation numbers, surnames, phone numbers or
 *   payment details. The site is public by URL.
 */
export const trip: Trip = {
  name: "Guatemala",
  firstDay: "2026-11-24",
  lastDay: "2026-12-01", // departure day; nights run Nov 24 – Nov 30
  homeAirport: "SEA",
  utcOffset: "-06:00", // Guatemala, no DST
  partySize: null, // TODO: confirm. Affects lodging and shuttle bookings.

  segments: [
    {
      id: "flight-out",
      kind: "flight",
      title: "Alaska SEA → GUA via LAX",
      start: "2026-11-24T11:30:00-08:00",
      end: "2026-11-24T23:52:00-06:00",
      status: "booked",
      location: "Seattle → Los Angeles → Guatemala City",
      notes:
        "AS 501 SEA 11:30 AM → LAX 2:20 PM. Layover 2h 56m. AS 1637 LAX 5:16 PM → GUA 11:52 PM. Main fare. Seats 20D and 25C (subject to change). Paid. Lands near midnight.",
    },
    {
      id: "lodging-atitlan",
      kind: "lodging",
      title: "Lumina, AMATE Atitlán (Airbnb)",
      start: "2026-11-25T14:00:00-06:00",
      end: "2026-11-26T10:00:00-06:00",
      status: "booked",
      location: "San Marcos La Laguna, Lake Atitlán (Barrio 2)",
      notes: "One night only. Host: AMATE Atitlán. Check-in 2:00 PM, checkout 10:00 AM.",
    },
    {
      id: "hike-acatenango",
      kind: "activity",
      title: "Acatenango overnight hike (Wicho & Charlie's)",
      start: "2026-11-29T06:30:00-06:00",
      end: "2026-11-30", // TODO: return time unconfirmed. Typically early to mid afternoon.
      status: "booked",
      location: "Meet at 2 calle oriente #22, Antigua Guatemala",
      includesLodging: true,
      peakElevationM: 3976,
      notes:
        "Be on time for the 6:30 AM start. Operator reachable 8 AM–3 PM at info@wichoandcharlies.com. Near freezing at the summit overnight. No alcohol the night before; hydrate.",
      todos: [
        "Confirm return time on Nov 30 with the operator",
        "Confirm what the operator provides vs. what we rent or bring: tent, sleeping bag, jacket, headlamp, gloves, water",
        "Arrange luggage storage in Antigua for the night of Nov 29 (hotel or operator)",
        "Bring Q100 cash each for entrance fees, plus Q200–300 each for extras",
        "High calorie snacks",
        "Hiking shoes, broken in before the trip",
      ],
    },
    {
      id: "transfer-arrival",
      kind: "transport",
      title: "Transfer from GUA after landing",
      start: "2026-11-24T23:52:00-06:00",
      end: null,
      status: "undecided",
      location: "Guatemala City airport → airport hotel or Antigua",
      notes: "Nothing arranged. Short hop if we sleep near GUA; roughly an hour by late shuttle to Antigua.",
    },
    {
      id: "lodging-nov24",
      kind: "lodging",
      title: "Arrival night hotel (name TBD)",
      start: "2026-11-24", // Check-in and checkout times unknown.
      end: "2026-11-25",
      status: "booked",
      location: "TBD",
      notes: "Name, location, check-in and checkout times TBD.",
    },
    {
      id: "transport-to-lake",
      kind: "transport",
      title: "To San Marcos La Laguna",
      start: "2026-11-25",
      end: "2026-11-25",
      status: "needs-booking",
      location: "Hotel → San Marcos La Laguna",
      notes: "Must arrive by the 2:00 PM check-in. Usual route: shuttle to Panajachel, then boat across the lake.",
    },
    {
      id: "activity-cliff-jumping",
      kind: "activity",
      title: "Cliff jumping",
      start: "2026-11-25",
      end: "2026-11-25",
      status: "needs-booking",
      location: "Lake Atitlán",
      notes: "After arriving at the lake. Time TBD.",
    },
    {
      id: "lodging-nov26-28",
      kind: "lodging",
      title: "Airbnb, San Juan La Laguna",
      start: "2026-11-26", // Check-in and checkout times unknown.
      end: "2026-11-28",
      status: "booked",
      location: "San Juan La Laguna, Lake Atitlán",
      notes: "Check-in and checkout times TBD.",
    },
    {
      id: "transport-nov26-transfers",
      kind: "transport",
      title: "Transfers: San Marcos → zipline → jet skis → San Juan",
      start: "2026-11-26",
      end: "2026-11-26",
      status: "needs-booking",
      location: "San Marcos La Laguna → zipline → jet ski spot → San Juan La Laguna",
      notes: "Times TBD.",
    },
    {
      id: "activity-zipline",
      kind: "activity",
      title: "Zip lining",
      start: "2026-11-26",
      end: "2026-11-26",
      status: "needs-booking",
      location: "Lake Atitlán",
      notes: "After the 10:00 AM checkout in San Marcos. Operator and time TBD.",
    },
    {
      id: "activity-jet-ski",
      kind: "activity",
      title: "Jet skiing",
      start: "2026-11-26T17:00:00-06:00",
      end: null,
      status: "needs-booking",
      location: "Lake Atitlán",
      notes:
        "To verify: 5 PM is close to sunset, and the lake is often choppy in the afternoon. Confirm an operator and the time.",
    },
    {
      id: "activity-indian-nose",
      kind: "activity",
      title: "Indian Nose hike, then paraglide down",
      start: "2026-11-28",
      end: "2026-11-28",
      status: "needs-booking",
      location: "Indian Nose, Lake Atitlán",
      notes:
        "To verify: this is usually a pre-dawn sunrise hike, so confirm the start time. Confirm paragliding is offered from it. The same day includes the trip to Antigua, and the Acatenango hike starts at 6:30 AM on Nov 29.",
    },
    {
      id: "transport-lake-to-antigua",
      kind: "transport",
      title: "Lake Atitlán → Antigua",
      start: "2026-11-28",
      end: "2026-11-28",
      status: "needs-booking",
      location: "Lake Atitlán → Antigua",
    },
    {
      id: "lodging-antigua",
      kind: "lodging",
      title: "Airbnb, Antigua Guatemala",
      start: "2026-11-28", // Check-in and checkout times unknown.
      end: "2026-11-29",
      status: "booked",
      location: "Antigua Guatemala",
      notes: "Check-in and checkout times TBD. Night before the 6:30 AM Acatenango start.",
    },
    {
      id: "lodging-nov30",
      kind: "lodging",
      title: "Night after the hike",
      start: "2026-11-30",
      end: "2026-12-01",
      status: "undecided",
      location: "Antigua (assumed; depends on return flight)",
      notes: "Not needed if we take a late flight home on Nov 30.",
    },
    {
      id: "flight-home",
      kind: "flight",
      title: "Return flight GUA → SEA",
      start: null, // TODO: date not picked. Nov 30 late, Dec 1, or later.
      end: null,
      status: "undecided",
      location: "Guatemala City → Seattle",
      notes: "Flying Nov 30 means a late departure on no sleep after the summit.",
    },
  ],

  openQuestions: [
    {
      id: "q-airport-night",
      question: "Arrival night: sleep near GUA airport, or shuttle straight to Antigua at midnight?",
      answer: "Booked a hotel for the night of Nov 24. Name and location not recorded yet.",
      blocks: ["lodging-nov24", "transfer-arrival", "transport-to-lake"],
    },
    {
      id: "q-lake-length",
      question: "How long on Lake Atitlán?",
      blocks: ["lodging-nov26-28", "transport-lake-to-antigua"],
      notes: "Extending the Airbnb covers Nov 26 and 27 and cuts one transfer. Leaving early gives more Antigua time before the hike.",
      answer:
        "On the lake through Nov 28: San Marcos the night of Nov 25, San Juan La Laguna the nights of Nov 26 and 27, then Antigua the night of Nov 28.",
    },
    {
      id: "q-return-date",
      question: "Return flight date: Nov 30 late, Dec 1, or later?",
      blocks: ["flight-home", "lodging-nov30"],
    },
    {
      id: "q-side-trips",
      question: "Add anything else: Tikal, Pacaya, Semuc Champey?",
      blocks: ["lodging-nov26-28"],
      notes: "Tikal needs its own flight or a long overnight bus and would eat two of the open days.",
    },
    {
      id: "q-party-size",
      question: "Party size, and who is sharing rooms?",
      blocks: [
        "lodging-nov24",
        "lodging-nov26-28",
        "lodging-nov30",
        "transfer-arrival",
        "transport-to-lake",
        "transport-lake-to-antigua",
      ],
      notes: "Blocks every lodging booking; also affects shuttle bookings.",
    },
  ],

  // Timed day plan (see PlanItem). Added on the site or by the planner.
  plan: [],

  todos: [
    "Get quetzales at the GUA airport ATM on arrival (Q100 + Q200–300 each for the hike)",
    "Travel insurance",
    "eSIM or local SIM",
    "Check passports have at least six months of validity",
  ],
};
