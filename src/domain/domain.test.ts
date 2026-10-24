import { describe, expect, it } from "vitest";
import { seedTrip } from "@/server/seed";
import { prepareChange, stripCards } from "./change";
import { dayRows, missing, nights, nowNext, rowVerb, toBook } from "./derive";
import { classifyLink, directionsUrl, extractUrls, mapsLink, whatsappUrl } from "./links";
import { applyOp, type Op } from "./ops";
import { parseLine } from "./parse";
import { formatTime, instantOf, isDate, offsetOn, zonedInstant } from "./time";
import type { Item, Trip, TripState } from "./types";

const seed = seedTrip();
const state = (trip: Trip = seed, version = 1): TripState => ({ trip, version });
const item = (id: string, trip: Trip = seed) => trip.items.find((i) => i.id === id)!;

describe("time", () => {
  it("rejects dates that would roll over into the next month", () => {
    expect(isDate("2027-02-30")).toBe(false);
    expect(isDate("2027-02-29")).toBe(false);
    expect(isDate("2028-02-29")).toBe(true);
    expect(isDate("2027-04-31")).toBe(false);
    expect(isDate("2027-12-31")).toBe(true);
  });
  it("turns wall-clock times in a zone into instants", () => {
    expect(zonedInstant("2026-11-24", "23:52", "America/Guatemala")).toBe(Date.parse("2026-11-24T23:52:00-06:00"));
    expect(zonedInstant("2026-11-24", "11:30", "America/Los_Angeles")).toBe(Date.parse("2026-11-24T11:30:00-08:00"));
    // Summer time in Seattle.
    expect(zonedInstant("2026-07-04", "09:00", "America/Los_Angeles")).toBe(Date.parse("2026-07-04T09:00:00-07:00"));
    expect(offsetOn("2026-11-24", "America/Guatemala")).toBe(-360);
  });

  it("formats times for people", () => {
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(formatTime("13:00")).toBe("1:00 PM");
  });
});

describe("migration of the seed", () => {
  it("keeps every segment, plan step, question and to-do", () => {
    expect(seed.schema).toBe(2);
    expect(seed.tz).toBe("America/Guatemala");
    expect(seed.homeTz).toBe("America/Los_Angeles");
    expect(seed.items.length).toBeGreaterThanOrEqual(16);
    expect(seed.todos.some((t) => t.id === "q-return-date" && !t.done)).toBe(true);
    expect(seed.todos.some((t) => t.id === "q-lake-length" && t.done)).toBe(true);
  });

  it("keeps the flight's departure in Seattle time and arrival in Guatemala time", () => {
    const f = item("flight-out");
    expect(f.start).toEqual({ date: "2026-11-24", time: "11:30", tz: "America/Los_Angeles" });
    expect(f.end).toEqual({ date: "2026-11-24", time: "23:52" });
    expect(instantOf(f.start, seed.tz)).toBe(Date.parse("2026-11-24T11:30:00-08:00"));
  });

  it("moves the operator's email into contact details and to-dos into a checklist", () => {
    const hike = item("hike-acatenango");
    expect(hike.contact?.email).toBe("info@wichoandcharlies.com");
    expect(hike.checklist?.length).toBe(6);
    expect(hike.sleepsHere).toBe(true);
    expect(hike.place?.address).toBe("2 calle oriente #22, Antigua Guatemala");
  });

  it("marks undecided things as maybe, with a booking to-do", () => {
    const n30 = item("lodging-nov30");
    expect(n30.maybe).toBe(true);
    expect(n30.booking?.state).toBe("todo");
  });
});

describe("derive", () => {
  it("finds a bed for every night except the undecided Nov 30", () => {
    const empty = nights(seed).filter((n) => !n.stay).map((n) => n.date);
    expect(empty).toEqual(["2026-11-30"]);
  });

  it("flags the missing night and the flight home", () => {
    expect(missing(seed)).toEqual([{ kind: "nights", from: "2026-11-30", to: "2026-11-30", count: 1 }, { kind: "flight-home" }]);
  });

  it("orders a day: timed first, then checkouts, other things, check-ins", () => {
    const rows = dayRows(seed, "2026-11-26");
    expect(rows[0].item.id).toBe("lodging-atitlan");
    expect(rowVerb(rows[0])).toBe("Check out");
    expect(rows.at(-1)!.item.kind).toBe("stay");
  });

  it("knows what's next", () => {
    const nn = nowNext(seed, "2026-11-26", Date.parse("2026-11-26T09:15:00-06:00"));
    expect(nn.next?.item.id).toBe("lodging-atitlan");
    expect(nn.minutesToNext).toBe(45);
  });

  it("lists what needs booking", () => {
    expect(toBook(seed).map((i) => i.id)).toContain("activity-zipline");
    expect(toBook(seed).map((i) => i.id)).not.toContain("flight-out");
  });
});

describe("ops", () => {
  const ops: Op[] = [
    { op: "item.add", item: { id: "i_dinner", kind: "food", title: "Dinner", start: { date: "2026-11-26", time: "19:00" } } },
    { op: "item.update", id: "activity-zipline", set: { title: "Zip lining at Atitlán", booking: { state: "booked", confirmation: "ZX12" } } },
    { op: "item.update", id: "transport-to-lake", set: { place: { address: "Panajachel dock" }, notes: null } },
    { op: "item.update", id: "i_new", set: { title: "x" } },
    { op: "item.remove", id: "activity-cliff-jumping" },
    { op: "link.add", itemId: "activity-zipline", link: { id: "l_1", url: "https://www.tiktok.com/@a/video/7301234567890123456", kind: "tiktok", addedAt: 1 } },
    { op: "check.set", itemId: "hike-acatenango", checkId: item("hike-acatenango").checklist![0].id, done: true },
    { op: "todo.add", todo: { id: "t_1", text: "Buy sunscreen", done: false } },
    { op: "todo.update", id: "q-return-date", set: { done: true, note: "Dec 1" } },
    { op: "trip.update", set: { name: "Guate", homeCurrency: null } },
  ];

  for (const op of ops) {
    if (op.op === "item.update" && op.id === "i_new") continue;
    it(`undoes ${op.op} exactly`, () => {
      const { trip, inverse } = applyOp(seed, op);
      let back = trip;
      for (const inv of inverse) back = applyOp(back, inv).trip;
      expect(back).toEqual(seed);
    });
  }

  it("creates a booking with a sensible state when only a confirmation is given", () => {
    const withPlan: Trip = { ...seed, items: [...seed.items, { id: "i_x", kind: "activity", title: "X" }] };
    const r = applyOp(withPlan, { op: "item.update", id: "i_x", set: { booking: { confirmation: "AB12CD" } } });
    expect(r.trip.items.at(-1)!.booking).toEqual({ state: "booked", confirmation: "AB12CD" });
  });
});

describe("prepareChange", () => {
  it("asks for confirmation before deleting or moving something booked", () => {
    const del = prepareChange(state(), [{ op: "item.remove", id: "lodging-atitlan" }], { author: "Sam" });
    expect(del.ok).toBe(false);
    if (!del.ok) expect(del.issues[0].code).toBe("needs_confirmation");
    const move = prepareChange(state(), [{ op: "item.update", id: "lodging-atitlan", set: { start: { date: "2026-11-26", time: "14:00" } } }], { author: "Sam" });
    expect(move.ok).toBe(false);
    const ok = prepareChange(state(), [{ op: "item.remove", id: "lodging-atitlan" }], { author: "Sam", confirmed: true });
    expect(ok.ok).toBe(true);
  });

  it("lets a note change on a booked item through without asking", () => {
    const r = prepareChange(state(), [{ op: "item.update", id: "lodging-atitlan", set: { notes: "Door code on the host's message" } }], { author: "Sam" });
    expect(r.ok).toBe(true);
  });

  it("applies two edits made against the same version (rebase)", () => {
    const a = prepareChange(state(seed, 5), [{ op: "item.update", id: "activity-zipline", set: { notes: "Ask for the 11 AM slot" } }], { author: "Sam" });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    // Someone else's edit was prepared against version 5 too; it lands on top of version 6.
    const b = prepareChange({ trip: a.trip, version: 6 }, [{ op: "todo.add", todo: { id: "t_2", text: "Sunscreen", done: false } }], { author: "Ana" });
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect(b.entry.version).toBe(7);
      expect(item("activity-zipline", b.trip).notes).toBe("Ask for the 11 AM slot");
    }
  });

  it("refuses an item that ends before it starts", () => {
    const r = prepareChange(state(), [{ op: "item.update", id: "lodging-atitlan", set: { notes: "x", end: { date: "2026-11-20" } } }], { author: "Sam", confirmed: true });
    expect(r.ok).toBe(false);
  });

  it("strips card numbers but keeps confirmation codes, phones and long ids in links", () => {
    expect(stripCards("Card 4111 1111 1111 1111, CVV 123")).toBe("Card [card number removed], CVV [removed]");
    expect(stripCards("Call +502 5555 1234, conf HX9TQA")).toBe("Call +502 5555 1234, conf HX9TQA");
    const r = prepareChange(
      state(),
      [{ op: "link.add", itemId: "lodging-nov26-28", link: { id: "l_a", url: "https://www.airbnb.com/rooms/53812345678901234", kind: "booking", addedAt: 1 } }],
      { author: "Sam" },
    );
    expect(r.ok && item("lodging-nov26-28", r.trip).links![0].url).toBe("https://www.airbnb.com/rooms/53812345678901234");
  });

  it("writes a readable summary", () => {
    const r = prepareChange(state(), [{ op: "item.update", id: "activity-zipline", set: { booking: { state: "booked" } } }], { author: "Sam" });
    expect(r.ok && r.entry.summary).toEqual(["marked “Zip lining” booked"]);
  });
});

describe("parseLine", () => {
  const ctx = { trip: seed, nowMs: Date.parse("2026-10-22T12:00:00Z") };

  it("reads a dinner with a bare hour as evening, and finds the place", () => {
    const p = parseLine("dinner thu 7 at sabe rico", ctx);
    expect(p.type).toBe("item");
    if (p.type !== "item") return;
    expect(p.draft.kind).toBe("food");
    expect(p.draft.start).toEqual({ date: "2026-11-26", time: "19:00" });
    expect(p.draft.guessedTime).toBe(true);
    expect(p.draft.placeName).toBe("Sabe Rico");
    expect(p.draft.title).toBe("Dinner at Sabe Rico");
  });

  it("reads 'zipline thu 11am'", () => {
    const p = parseLine("zipline thu 11am", ctx);
    expect(p.type === "item" && p.draft).toMatchObject({ title: "Zipline", kind: "activity", start: { date: "2026-11-26", time: "11:00" }, guessedTime: false });
  });

  it("saves something with no day as an idea", () => {
    const p = parseLine("Semuc Champey", ctx);
    expect(p.type === "item" && p.draft.start).toBeUndefined();
  });

  it("uses the day on screen for a time with no day", () => {
    const p = parseLine("coffee 8:30", { ...ctx, day: "2026-11-28" });
    expect(p.type === "item" && p.draft.start).toEqual({ date: "2026-11-28", time: "08:30" });
  });

  it("hands questions and links on", () => {
    expect(parseLine("where should we eat in Antigua?", ctx).type).toBe("ask");
    expect(parseLine("find a zipline near San Marcos", ctx).type).toBe("ask");
    const l = parseLine("look https://www.tiktok.com/@x/video/1 cool", ctx);
    expect(l).toEqual({ type: "links", urls: ["https://www.tiktok.com/@x/video/1"], rest: "look cool" });
  });
});

describe("links", () => {
  it("knows what a link is", () => {
    expect(classifyLink("https://www.tiktok.com/@x/video/1").kind).toBe("tiktok");
    expect(classifyLink("https://www.instagram.com/reel/abc/").kind).toBe("instagram");
    expect(classifyLink("https://maps.app.goo.gl/abc").kind).toBe("maps");
    expect(classifyLink("https://www.google.com/maps/place/Antigua").kind).toBe("maps");
    expect(classifyLink("https://www.airbnb.com/rooms/1").kind).toBe("booking");
    expect(classifyLink("https://someblog.com/post").kind).toBe("article");
  });

  it("builds Maps, directions and WhatsApp links", () => {
    const hike: Item = item("hike-acatenango");
    expect(mapsLink(hike.place, seed)).toContain("2%20calle%20oriente");
    expect(directionsUrl({ name: "Sabe Rico" }, seed)).toContain("Sabe%20Rico%2C%20Guatemala");
    expect(whatsappUrl("+502 5555-1234")).toBe("https://wa.me/50255551234");
    expect(extractUrls("a https://x.com/a. b (https://y.com/b)")).toEqual(["https://x.com/a", "https://y.com/b"]);
  });
});

describe("posts", () => {
  it("recognises TikToks, Reels and YouTube videos, with their players", async () => {
    const { postInfo } = await import("./links");
    expect(postInfo("https://www.tiktok.com/@scout2015/video/6718335390845095173?lang=en")).toMatchObject({ platform: "tiktok", id: "6718335390845095173", tall: true });
    expect(postInfo("https://www.instagram.com/reel/C9xYz12AbCd/")).toMatchObject({ platform: "instagram", id: "C9xYz12AbCd", tall: true, label: "Instagram Reel" });
    expect(postInfo("https://www.instagram.com/p/BsOGulcndj-/")).toMatchObject({ platform: "instagram", tall: false, embedUrl: "https://www.instagram.com/p/BsOGulcndj-/embed/captioned/" });
    expect(postInfo("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({ platform: "youtube", id: "dQw4w9WgXcQ", tall: false });
    expect(postInfo("https://www.youtube.com/shorts/abcDEF12345")).toMatchObject({ platform: "youtube", tall: true, label: "YouTube Short" });
    // A short link has no id until it's expanded; an article isn't a post.
    expect(postInfo("https://vm.tiktok.com/ZMabc123/")).toBeNull();
    expect(postInfo("https://someblog.com/post")).toBeNull();
  });

  it("leaves vague places like 'airport hotel or Antigua' out of a day's route", async () => {
    const { routeUrl } = await import("./links");
    const items: Item[] = [
      { id: "a", kind: "activity", title: "A", place: { name: "Airport hotel or Antigua" } },
      { id: "b", kind: "food", title: "B", place: { address: "5a Avenida Norte 10, Antigua" } },
      { id: "c", kind: "activity", title: "C", place: { name: "Cerro de la Cruz" } },
    ];
    const url = decodeURIComponent(routeUrl(items, seed)!);
    expect(url).not.toContain("Airport hotel or Antigua");
    expect(url).toContain("Cerro de la Cruz, Guatemala");
  });
});

describe("booked items", () => {
  it("lets a missing time be filled in without asking, but asks before moving the day or changing a time", () => {
    // The hike's return is known only by day (Nov 30): adding 2:00 PM isn't a move.
    const fill = prepareChange(state(), [{ op: "item.update", id: "hike-acatenango", set: { end: { date: "2026-11-30", time: "14:00" } } }], { author: "Sam" });
    expect(fill.ok).toBe(true);
    const moveDay = prepareChange(state(), [{ op: "item.update", id: "hike-acatenango", set: { end: { date: "2026-12-01" } } }], { author: "Sam" });
    expect(moveDay.ok).toBe(false);
    const retime = prepareChange(state(), [{ op: "item.update", id: "lodging-atitlan", set: { start: { date: "2026-11-25", time: "16:00" } } }], { author: "Sam" });
    expect(retime.ok).toBe(false);
  });
});
