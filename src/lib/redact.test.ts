import { describe, expect, it } from "vitest";
import { trip as seed } from "@/data/trip";
import { REDACTED, redact } from "./redact";

describe("redact", () => {
  it.each([
    ["Confirmation number: HX9TQA", "Confirmation number: [removed]"],
    ["Your booking ref #4829301 is confirmed", "Your booking ref #[removed] is confirmed"],
    ["Reservation code K7XQ2P", "Reservation code [removed]"],
    ["PNR: ABCDEF", "PNR: [removed]"],
    ["Record locator XYZ123", "Record locator [removed]"],
  ])("removes confirmation codes: %s", (input, expected) => {
    expect(redact(input).text).toBe(expected);
  });

  it.each([
    "Call +502 7832 0000",
    "WhatsApp +1 (206) 555-0142",
    "Card 4111 1111 1111 1111",
    "acct 12345678",
  ])("removes long numbers: %s", (input) => {
    const r = redact(input);
    expect(r.text).toContain(REDACTED);
    expect(r.text.replace(REDACTED, "")).not.toMatch(/\d{4}/);
  });

  it("removes card endings and CVVs", () => {
    expect(redact("Paid with Visa ending in 4242").text).toBe("Paid with Visa ending in [removed]");
    expect(redact("CVV: 123").text).toBe("CVV: [removed]");
  });

  it.each([
    "Booking details below",
    "Your reservation is confirmed",
    "AS 501 SEA 11:30 AM → LAX 2:20 PM",
    "Check-in 2026-11-25 at 14:00",
    "Summit 3,976 m (13,044 ft)",
    "Bring Q100 cash, plus Q200–300",
    "Meet at 2 calle oriente #22",
    "info@wichoandcharlies.com",
  ])("leaves ordinary text alone: %s", (input) => {
    expect(redact(input)).toEqual({ text: input, removed: [] });
  });

  it("leaves every string in the seed data alone", () => {
    const strings = JSON.stringify(seed).match(/"(?:[^"\\]|\\.)*"/g)!.map((s) => JSON.parse(s) as string);
    for (const s of strings) expect(redact(s).text, s).toBe(s);
  });
});
