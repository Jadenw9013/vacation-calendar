import { describe, expect, it } from "vitest";
import { parsePlan, PLAN_EXAMPLE, planRowItem, planRowProblem } from "./planImport";
import { prepareChange } from "./change";
import { seedTrip } from "@/server/seed";

const trip = { ...seedTrip(), startDate: "2027-03-01", endDate: "2027-03-04", items: [] };

describe("pasted travel plans", () => {
  it("imports a complete plan with nights, bookings and ideas as one undoable change", () => {
    const rows = parsePlan(PLAN_EXAMPLE, trip);
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => !planRowProblem(row))).toBe(true);
    expect(rows[1]).toMatchObject({ title: "Casa Oaxaca", kind: "stay", date: "2027-03-01", time: "15:00", endDate: "2027-03-04", endTime: "11:00", booking: "booked", confirmation: "CASA-123" });
    expect(rows[4]).toMatchObject({ title: "Cooking class", date: "", time: "" });
    const result = prepareChange({ trip, version: 1 }, rows.map((row, i) => ({ op: "item.add", item: planRowItem(row, `i_${i}`, "Ana") })), { author: "Ana" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trip.items).toHaveLength(5);
    expect(result.trip.items.every((item) => item.who === "Ana")).toBe(true);
    const undo = prepareChange({ trip: result.trip, version: 2 }, result.entry.inverse, { author: "Ana", confirmed: true });
    expect(undo.ok && undo.trip.items).toEqual([]);
  });

  it("reads markdown, absolute dates and am/pm without discarding unknown details", () => {
    const rows = parsePlan("## 2027-03-02\n- 9am Food: Breakfast | notes: Bring cash | address: Main square\n* 2027-03-03 12:30 pm Activity: Museum\nIdeas:\nCooking class", trip);
    expect(rows[0]).toMatchObject({ date: "2027-03-02", time: "09:00", notes: "Bring cash\naddress: Main square", title: "Breakfast" });
    expect(rows[1]).toMatchObject({ date: "2027-03-03", time: "12:30", title: "Museum" });
    expect(rows[2].date).toBe("");
  });

  it("unchecks matching existing items and defaults stays to one night", () => {
    const [stay] = parsePlan("Day 1\nStay: Casa Oaxaca", trip);
    expect(stay.endDate).toBe("2027-03-02");
    const existing = planRowItem(stay, "stay_1", "Ana");
    expect(parsePlan("Day 1\nStay: Casa Oaxaca", { ...trip, items: [existing] })[0].selected).toBe(false);
  });

  it("requires corrections for impossible dates, reversed stays and times without a day", () => {
    for (const text of ["2027-02-30 09:00 Breakfast", "Day 2\nStay: Hotel | end: day 1 11:00", "09:00 Breakfast", "Day 1\n25:00 Breakfast"]) {
      expect(planRowProblem(parsePlan(text, trip)[0]), text).toBeTruthy();
    }
    expect(parsePlan("unstructured note about the trip", trip)[0].title).toBe("unstructured note about the trip");
  });

  it("unchecks duplicate lines within the pasted plan", () => {
    const rows = parsePlan("Day 1\n09:00 Museum\n09:00 Museum", trip);
    expect(rows.map((row) => row.selected)).toEqual([true, false]);
  });

  it("validates flight arrival using both time zones instead of wall-clock order", () => {
    const [row] = parsePlan("2027-03-02 18:00 Flight: Tokyo to Los Angeles | end: 2027-03-02 11:00 | tz: Asia/Tokyo | end tz: America/Los_Angeles", trip);
    expect(planRowProblem(row, trip.tz)).toBeNull();
    expect(planRowItem(row, "flight_1", "Ana")).toMatchObject({ start: { tz: "Asia/Tokyo" }, end: { tz: "America/Los_Angeles" } });
    expect(planRowProblem({ ...row, tz: "Mars/Base" }, trip.tz)).toContain("valid time zone");
    expect(planRowProblem({ ...row, endTime: "00:00" }, trip.tz)).toContain("after the start");
  });

  it("catches pasted metadata beyond storage limits before saving", () => {
    const [row] = parsePlan("Day 1\nMuseum", trip);
    expect(planRowProblem({ ...row, notes: "x".repeat(5001) })).toContain("5,000");
    expect(planRowProblem({ ...row, confirmation: "x".repeat(101) })).toContain("100");
  });
});
