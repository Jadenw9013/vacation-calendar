/**
 * A point in time, as an ISO 8601 string.
 *
 * - Full datetime with the local UTC offset when the time is known:
 *   "2026-11-24T11:30:00-08:00". Guatemala is UTC-6 all year (no DST).
 * - Date only when the day is known but the time is not: "2026-11-30".
 *   The UI shows this as "time TBD" rather than inventing a time.
 */
export type IsoMoment = string;

export type SegmentKind = "flight" | "lodging" | "activity" | "transport";

export type SegmentStatus = "booked" | "needs-booking" | "undecided";

export type Currency = "USD" | "GTQ";

export interface Money {
  amount: number;
  currency: Currency;
}

export interface Segment {
  id: string;
  kind: SegmentKind;
  title: string;
  /** null only when even the day is unknown (e.g. a return flight with no date picked). */
  start: IsoMoment | null;
  /** null when the end is unknown (TODO in the source data). */
  end: IsoMoment | null;
  status: SegmentStatus;
  location: string;
  /** First name of whoever booked or owns this. Omitted when nobody has it yet. */
  owner?: string;
  cost?: Money;
  notes?: string;
  todos?: string[];
  /** Highest point, in metres, for activities that climb. Shown as a summit marker. */
  peakElevationM?: number;
  /**
   * Set on a non-lodging segment that includes somewhere to sleep, so the
   * night check counts it. Example: the Acatenango hike camps overnight.
   */
  includesLodging?: boolean;
}

export interface OpenQuestion {
  id: string;
  question: string;
  /** Segment ids this decision blocks. */
  blocks: string[];
  notes?: string;
  /** The decision, once made. A question with an answer no longer blocks anything. */
  answer?: string;
}

export interface Trip {
  name: string;
  /** First day shown on the timeline, "YYYY-MM-DD". */
  firstDay: string;
  /**
   * Last day shown on the timeline, "YYYY-MM-DD": the day you fly home.
   * Nights are counted up to the night before it.
   */
  lastDay: string;
  homeAirport: string;
  /** UTC offset of the destination, used to find local midnight for the night check. */
  utcOffset: string;
  /** null until confirmed. */
  partySize: number | null;
  segments: Segment[];
  openQuestions: OpenQuestion[];
  /** Practical to-dos not tied to a date or segment. */
  todos: string[];
}
