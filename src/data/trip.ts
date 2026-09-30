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
  lastDay: "2026-11-30",
  homeAirport: "SEA",
  utcOffset: "-06:00", // Guatemala, no DST
  partySize: null, // TODO: confirm. Affects lodging and shuttle bookings.

  segments: [
    // ---- Confirmed -------------------------------------------------------
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

    // ---- Not booked (placeholders for "Still to book") -------------------
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
      title: "Arrival night",
      start: "2026-11-24",
      end: "2026-11-25",
      status: "undecided",
      location: "Near GUA airport or Antigua",
    },
    {
      id: "transport-to-lake",
      kind: "transport",
      title: "To San Marcos La Laguna",
      start: "2026-11-25",
      end: "2026-11-25",
      status: "undecided",
      location: "Guatemala City or Antigua → Panajachel → boat to San Marcos",
      notes: "Must arrive by the 2:00 PM check-in. Usual route: shuttle to Panajachel, then boat across the lake.",
    },
    {
      id: "lodging-nov26-28",
      kind: "lodging",
      title: "Nights of Nov 26, 27, 28",
      start: "2026-11-26",
      end: "2026-11-29",
      status: "undecided",
      location: "Lake Atitlán and/or Antigua",
      notes:
        "Extending the Airbnb covers Nov 26–27 and cuts a transfer. The night of Nov 28 must be in Antigua, or close enough for the 6:30 AM hike meeting.",
    },
    {
      id: "transport-lake-to-antigua",
      kind: "transport",
      title: "Lake Atitlán → Antigua",
      start: "2026-11-28", // Source says Sat Nov 28, "whenever we leave the lake". Depends on q-lake-length.
      end: null,
      status: "undecided",
      location: "Lake Atitlán → Antigua",
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
      blocks: ["lodging-nov24", "transfer-arrival", "transport-to-lake"],
    },
    {
      id: "q-lake-length",
      question: "How long on Lake Atitlán?",
      blocks: ["lodging-nov26-28", "transport-lake-to-antigua"],
      notes: "Extending the Airbnb covers Nov 26 and 27 and cuts one transfer. Leaving early gives more Antigua time before the hike.",
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

  todos: [
    "Get quetzales at the GUA airport ATM on arrival (Q100 + Q200–300 each for the hike)",
    "Travel insurance",
    "eSIM or local SIM",
    "Check passports have at least six months of validity",
  ],
};
