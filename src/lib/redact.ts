/**
 * Strips confirmation numbers, booking references, phone numbers, emails,
 * card details and full names from free text before it reaches the store or
 * the change log. The site is readable by anyone with the
 * passphrase and pasted booking emails are full of these.
 *
 * Deliberately conservative: a false positive loses a number from a note,
 * a false negative leaks one. Dates, times, flight numbers ("AS 501"),
 * prices ("Q200") and elevations ("3,976 m") are left alone.
 */

export type RedactionKind = "confirmation" | "phone-or-card" | "payment" | "email" | "name";

export interface RedactResult {
  text: string;
  removed: RedactionKind[];
}

export const REDACTED = "[removed]";

const CONFIRMATION_RE =
  /\b(confirmation|conf\.?|booking|reservation|record\s+locator|locator|pnr|itinerary|reference|ref\.?|e-?ticket|ticket|order|voucher)(\s*(?:number|no\.?|code|id|#|reference|ref\.?))?(\s*[:#]?\s*)([A-Za-z0-9][A-Za-z0-9-]{4,})/gi;

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/**
 * Full names are only recognisable by context, so this removes names that
 * follow a label ("Guest: Jordan Rivera"), airline-style SURNAME/FIRSTNAME,
 * and honorifics ("Ms. Jordan Rivera"). Hotel and tour names are left alone.
 * First names on their own are fine: that's what `owner` holds.
 */
const NAME_WORD = "\\p{Lu}[\\p{L}'’-]+";

/** "guest" → "[Gg][Uu][Ee][Ss][Tt]": case-insensitive labels without making the name part case-insensitive. */
function ci(label: string): string {
  return label.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);
}

const NAME_LABELS = [
  "guest name",
  "guest",
  "lead guest",
  "primary guest",
  "passenger name",
  "passenger",
  "traveller",
  "traveler",
  "full name",
  "your name",
  "booked by",
  "reservation for",
  "booking for",
  "cardholder",
  "card holder",
  "account holder",
].map((l) => ci(l).replace(/ /g, "\\s+"));

const LABELLED_NAME_RE = new RegExp(
  `\\b(${NAME_LABELS.join("|")})(\\s*[:\\-]\\s*)(${NAME_WORD}(?:\\s+${NAME_WORD}){1,3})`,
  "gu",
);
/** Airline style WONG/JADEN MR. Two three-letter codes (SEA/LAX) are a route, not a name. */
const AIRLINE_NAME_RE = /\b([A-Z]{2,})\/([A-Z]{2,})(?:\s+(?:MR|MRS|MS|MISS|MSTR|DR))?\b/g;
const HONORIFIC_NAME_RE = new RegExp(`\\b(Mr|Mrs|Ms|Miss|Mx|Dr)\\.?\\s+(${NAME_WORD}(?:\\s+${NAME_WORD}){1,2})`, "gu");

const PAYMENT_RE =
  /\b(visa|mastercard|master\s*card|amex|american\s+express|discover|card)\b([^.\n]{0,24}?\b(?:ending|ends)\s*(?:in|with)?\s*)(\d{4})\b/gi;

const CVV_RE = /\b(cvv|cvc|security\s+code)(\s*[:#]?\s*)(\d{3,4})\b/gi;

/** Runs of 8–19 digits with separators: phone numbers, card numbers, account numbers. */
const LONG_NUMBER_RE = /(?<![\w-])\+?\d[\d ().-]{6,}\d(?![\w-])/g;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function looksLikeCode(code: string): boolean {
  // A real code has a digit or is written in capitals ("K7XQ2P", "HX9TQA").
  // This keeps "booking details" or "reservation confirmed" intact.
  return /\d/.test(code) || (code === code.toUpperCase() && /[A-Z]/.test(code));
}

export function redact(input: string): RedactResult {
  const removed = new Set<RedactionKind>();

  let text = input.replace(CONFIRMATION_RE, (match, word, label = "", sep, code: string) => {
    if (!looksLikeCode(code)) return match;
    removed.add("confirmation");
    return `${word}${label}${sep}${REDACTED}`;
  });

  text = text.replace(EMAIL_RE, () => {
    removed.add("email");
    return REDACTED;
  });

  text = text.replace(LABELLED_NAME_RE, (_m, label, sep) => {
    removed.add("name");
    return `${label}${sep}${REDACTED}`;
  });
  text = text.replace(AIRLINE_NAME_RE, (match, a: string, b: string) => {
    if (a.length === 3 && b.length === 3) return match;
    removed.add("name");
    return REDACTED;
  });
  text = text.replace(HONORIFIC_NAME_RE, (_m, title) => {
    removed.add("name");
    return `${title} ${REDACTED}`;
  });

  text = text.replace(PAYMENT_RE, (_m, brand, middle) => {
    removed.add("payment");
    return `${brand}${middle}${REDACTED}`;
  });

  text = text.replace(CVV_RE, (_m, word, sep) => {
    removed.add("payment");
    return `${word}${sep}${REDACTED}`;
  });

  text = text.replace(LONG_NUMBER_RE, (match) => {
    if (ISO_DATE_RE.test(match)) return match;
    const digits = match.replace(/\D/g, "").length;
    if (digits < 8 || digits > 19) return match;
    removed.add("phone-or-card");
    return REDACTED;
  });

  return { text, removed: [...removed] };
}
