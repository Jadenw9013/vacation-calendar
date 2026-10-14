/*
 * Is this message asking for a change? Edits get a forced tool call
 * (propose_changes or ask_user), so the model can't spend a turn writing
 * prose about what it would do. Anything else is "unclear" and the model
 * chooses freely, which still allows a proposal.
 */

export type Intent = "edit" | "unclear";

const QUESTION = /^(what|what's|whats|when|where|who|why|how|which|is|are|do|does|did|can|could|should|would|will)\b/i;

const EDIT = new RegExp(
  [
    // Verbs that change the trip.
    "^(please\\s+)?(add|move|change|reschedule|push|shift|cancel|delete|remove|rename|update|swap|switch|replace|mark|set|put|schedule|book|extend|plan|draft|undo|drop|make)\\b",
    // "We're booking…", "Sam booked it", "I'm handling…", "We decided…", "… is done", "Let's stay…"
    "\\b(we're|we are|i'm|i am)\\s+(booking|handling|doing|taking)\\b",
    "\\b(booked|reserved|confirmed)\\s+(it|the|a|our)\\b",
    "\\b(sam|ana|\\w+)\\s+booked\\b",
    "^we\\s+(decided|booked|changed|moved|cancelled|canceled)\\b",
    "\\bis\\s+done\\b",
    "^let'?s\\s+(stay|move|add|do|book|go|skip|drop)\\b",
    "\\bcan you add\\b",
    "\\badd it\\b",
  ].join("|"),
  "i",
);

/** A pasted booking confirmation or forwarded message: long, with booking words. */
const PASTED_BOOKING = /\b(reservation|confirmation|check-in|check-out|itinerary|booking)\b/i;

export function classifyIntent(text: string, opts: { images?: number; answeringQuestion?: boolean } = {}): Intent {
  // Answering the planner's own question, or sending a screenshot: they want something recorded.
  if (opts.answeringQuestion || (opts.images ?? 0) > 0) return "edit";
  const t = text.trim();
  if (!t) return "unclear";
  if (t.length > 200 && PASTED_BOOKING.test(t)) return "edit";
  if (QUESTION.test(t) || t.endsWith("?")) return "unclear";
  return EDIT.test(t) ? "edit" : "unclear";
}
