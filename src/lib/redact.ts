/**
 * Strips confirmation numbers, phone numbers and payment details from free
 * text before it reaches the store. The site is readable by anyone with the
 * passphrase and pasted booking emails are full of these.
 *
 * Deliberately conservative: a false positive loses a number from a note,
 * a false negative leaks one. Dates, times, flight numbers ("AS 501"),
 * prices ("Q200") and elevations ("3,976 m") are left alone.
 */

export type RedactionKind = "confirmation" | "phone-or-card" | "payment";

export interface RedactResult {
  text: string;
  removed: RedactionKind[];
}

export const REDACTED = "[removed]";

const CONFIRMATION_RE =
  /\b(confirmation|conf\.?|booking|reservation|record\s+locator|locator|pnr|itinerary|reference|ref\.?)(\s*(?:number|no\.?|code|id|#))?(\s*[:#]?\s*)([A-Za-z0-9][A-Za-z0-9-]{4,})/gi;

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
