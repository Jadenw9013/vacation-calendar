import type { Op } from "./schema";
import { formatDay } from "./time";
import type { CheckItem, Item, Link, Todo, Trip } from "./types";

export type { Op } from "./schema";

export type OpErrorCode = "missing" | "duplicate" | "invalid" | "needs_confirmation";

export class OpError extends Error {
  constructor(
    public code: OpErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Keys of an item whose values are objects that merge one level deep. */
const NESTED = new Set(["place", "contact", "booking"]);

type Patch = Record<string, unknown>;
type Obj = Record<string, unknown>;

const clamp = (i: number | undefined, len: number) => (i === undefined ? len : Math.max(0, Math.min(i, len)));

function insertAt<T>(list: T[], value: T, index?: number): T[] {
  const out = list.slice();
  out.splice(clamp(index, out.length), 0, value);
  return out;
}

/** Applies a patch: null removes a key; nested details merge. */
function patchItem(prev: Item, set: Patch): Item {
  const next: Obj = { ...prev };
  for (const [k, v] of Object.entries(set)) {
    if (v === null || v === undefined) {
      delete next[k];
    } else if (NESTED.has(k)) {
      const merged: Obj = { ...((prev as unknown as Obj)[k] as Obj | undefined) };
      for (const [sk, sv] of Object.entries(v as Obj)) {
        if (sv === null) delete merged[sk];
        else merged[sk] = sv;
      }
      if (k === "booking" && !merged.state) merged.state = merged.confirmation ? "booked" : "todo";
      if (Object.keys(merged).length) next[k] = merged;
      else delete next[k];
    } else {
      next[k] = v;
    }
  }
  return next as unknown as Item;
}

/** The patch that puts back whatever `set` is about to change. */
function inversePatch(prev: Obj, set: Patch): Patch {
  const inv: Patch = {};
  for (const [k, v] of Object.entries(set)) {
    const before = prev[k];
    if (NESTED.has(k) && v !== null && before !== undefined) {
      const sub: Obj = {};
      for (const sk of Object.keys(v as Obj)) sub[sk] = (before as Obj)[sk] ?? null;
      inv[k] = sub;
    } else {
      // Includes a booking this patch creates from nothing: undo removes it whole, default state and all.
      inv[k] = before ?? null;
    }
  }
  return inv;
}

function findItem(trip: Trip, id: string): { item: Item; index: number } {
  const index = trip.items.findIndex((i) => i.id === id);
  if (index < 0) throw new OpError("missing", `No item "${id}". Someone may have removed it.`);
  return { item: trip.items[index], index };
}

function replaceItem(trip: Trip, index: number, item: Item): Trip {
  const items = trip.items.slice();
  items[index] = item;
  return { ...trip, items };
}

function findTodo(trip: Trip, id: string): { todo: Todo; index: number } {
  const index = trip.todos.findIndex((t) => t.id === id);
  if (index < 0) throw new OpError("missing", `No to-do "${id}". Someone may have removed it.`);
  return { todo: trip.todos[index], index };
}

/** Applies one op. Returns the new trip and the ops that would undo it. Never mutates `trip`. */
export function applyOp(trip: Trip, op: Op): { trip: Trip; inverse: Op[] } {
  switch (op.op) {
    case "item.add": {
      if (trip.items.some((i) => i.id === op.item.id)) throw new OpError("duplicate", `An item "${op.item.id}" already exists.`);
      return { trip: { ...trip, items: insertAt(trip.items, op.item as Item, op.index) }, inverse: [{ op: "item.remove", id: op.item.id }] };
    }
    case "item.update": {
      const { item, index } = findItem(trip, op.id);
      const inverse = inversePatch(item as unknown as Obj, op.set as Patch);
      return {
        trip: replaceItem(trip, index, patchItem(item, op.set as Patch)),
        inverse: [{ op: "item.update", id: op.id, set: inverse } as Op],
      };
    }
    case "item.remove": {
      const { item, index } = findItem(trip, op.id);
      return {
        trip: { ...trip, items: trip.items.filter((i) => i.id !== op.id) },
        inverse: [{ op: "item.add", item, index } as Op],
      };
    }
    case "link.add": {
      const { item, index } = findItem(trip, op.itemId);
      const links = item.links ?? [];
      if (links.some((l) => l.id === op.link.id)) throw new OpError("duplicate", `That link is already on "${item.title}".`);
      return {
        trip: replaceItem(trip, index, { ...item, links: insertAt(links, op.link as Link, op.index) }),
        inverse: [{ op: "link.remove", itemId: op.itemId, linkId: op.link.id }],
      };
    }
    case "link.update": {
      const { item, index } = findItem(trip, op.itemId);
      const links = item.links ?? [];
      const li = links.findIndex((l) => l.id === op.linkId);
      if (li < 0) throw new OpError("missing", `That link is no longer on "${item.title}".`);
      const before = links[li] as unknown as Obj;
      const next: Obj = { ...before };
      for (const [k, v] of Object.entries(op.set)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      const updated = links.slice();
      updated[li] = next as unknown as Link;
      return {
        trip: replaceItem(trip, index, { ...item, links: updated }),
        inverse: [{ op: "link.update", itemId: op.itemId, linkId: op.linkId, set: inversePatch(before, op.set as Patch) } as Op],
      };
    }
    case "link.remove": {
      const { item, index } = findItem(trip, op.itemId);
      const links = item.links ?? [];
      const li = links.findIndex((l) => l.id === op.linkId);
      if (li < 0) throw new OpError("missing", `That link is no longer on "${item.title}".`);
      const rest = links.filter((l) => l.id !== op.linkId);
      const next: Item = { ...item, links: rest };
      if (!rest.length) delete next.links;
      return { trip: replaceItem(trip, index, next), inverse: [{ op: "link.add", itemId: op.itemId, link: links[li], index: li } as Op] };
    }
    case "check.add": {
      const { item, index } = findItem(trip, op.itemId);
      const list = item.checklist ?? [];
      if (list.some((c) => c.id === op.check.id)) throw new OpError("duplicate", "That checklist entry already exists.");
      return {
        trip: replaceItem(trip, index, { ...item, checklist: insertAt(list, op.check as CheckItem, op.index) }),
        inverse: [{ op: "check.remove", itemId: op.itemId, checkId: op.check.id }],
      };
    }
    case "check.set": {
      const { item, index } = findItem(trip, op.itemId);
      const list = item.checklist ?? [];
      const ci = list.findIndex((c) => c.id === op.checkId);
      if (ci < 0) throw new OpError("missing", `That checklist entry is no longer on "${item.title}".`);
      const before = list[ci];
      const after = { ...before, ...(op.text !== undefined ? { text: op.text } : {}), ...(op.done !== undefined ? { done: op.done } : {}) };
      const updated = list.slice();
      updated[ci] = after;
      return {
        trip: replaceItem(trip, index, { ...item, checklist: updated }),
        inverse: [
          {
            op: "check.set",
            itemId: op.itemId,
            checkId: op.checkId,
            ...(op.text !== undefined ? { text: before.text } : {}),
            ...(op.done !== undefined ? { done: before.done } : {}),
          },
        ],
      };
    }
    case "check.remove": {
      const { item, index } = findItem(trip, op.itemId);
      const list = item.checklist ?? [];
      const ci = list.findIndex((c) => c.id === op.checkId);
      if (ci < 0) throw new OpError("missing", `That checklist entry is no longer on "${item.title}".`);
      const rest = list.filter((c) => c.id !== op.checkId);
      const next: Item = { ...item, checklist: rest };
      if (!rest.length) delete next.checklist;
      return { trip: replaceItem(trip, index, next), inverse: [{ op: "check.add", itemId: op.itemId, check: list[ci], index: ci }] };
    }
    case "todo.add": {
      if (trip.todos.some((t) => t.id === op.todo.id)) throw new OpError("duplicate", "That to-do already exists.");
      return { trip: { ...trip, todos: insertAt(trip.todos, op.todo as Todo, op.index) }, inverse: [{ op: "todo.remove", id: op.todo.id }] };
    }
    case "todo.update": {
      const { todo, index } = findTodo(trip, op.id);
      const next: Obj = { ...todo };
      for (const [k, v] of Object.entries(op.set)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      const todos = trip.todos.slice();
      todos[index] = next as unknown as Todo;
      return { trip: { ...trip, todos }, inverse: [{ op: "todo.update", id: op.id, set: inversePatch(todo as unknown as Obj, op.set as Patch) } as Op] };
    }
    case "todo.remove": {
      const { todo, index } = findTodo(trip, op.id);
      return { trip: { ...trip, todos: trip.todos.filter((t) => t.id !== op.id) }, inverse: [{ op: "todo.add", todo, index } as Op] };
    }
    case "trip.update": {
      const next: Obj = { ...trip };
      for (const [k, v] of Object.entries(op.set)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      return { trip: next as unknown as Trip, inverse: [{ op: "trip.update", set: inversePatch(trip as unknown as Obj, op.set as Patch) } as Op] };
    }
  }
}

/** True when `op` deletes a booked item or moves its dates: those need a person to confirm. */
export function touchesBooked(trip: Trip, op: Op): Item | null {
  if (op.op !== "item.remove" && op.op !== "item.update") return null;
  const item = trip.items.find((i) => i.id === op.id);
  if (item?.booking?.state !== "booked") return null;
  if (op.op === "item.remove") return item;
  const s = op.set;
  const moved = (k: "start" | "end") => {
    if (!(k in s)) return false;
    const before = item[k] ?? null;
    const after = s[k] ?? null;
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    // Filling in a time nobody knew yet, on the same day, isn't moving the booking.
    if (before && after && before.date === after.date && !before.time && after.time) return false;
    return true;
  };
  return moved("start") || moved("end") ? item : null;
}

const quote = (t: string) => `“${t}”`;

const LINK_WORD: Record<Link["kind"], string> = {
  booking: "a booking link",
  website: "a website",
  maps: "a map link",
  tiktok: "a TikTok",
  instagram: "an Instagram post",
  youtube: "a YouTube video",
  article: "a link",
  other: "a link",
};

function describeUpdate(item: Item, set: Patch): string {
  const t = quote(item.title);
  const keys = Object.keys(set);
  if (keys.length === 1) {
    const [k] = keys;
    const v = set[k] as Obj | null;
    if (k === "title") return `renamed ${t} to ${quote(String(v))}`;
    if (k === "start" || k === "end") return v === null && k === "start" ? `moved ${t} to ideas` : `changed when ${t} is`;
    if (k === "booking") {
      if (v === null) return `cleared the booking on ${t}`;
      if (v.state === "booked") return `marked ${t} booked`;
      if (v.state === "todo") return `marked ${t} as needing booking`;
      if ("confirmation" in v) return `updated the confirmation for ${t}`;
      return `updated the booking for ${t}`;
    }
    if (k === "notes") return `edited the notes on ${t}`;
    if (k === "place") return `updated where ${t} is`;
    if (k === "contact") return `updated contact details for ${t}`;
    if (k === "who") return v === null ? `cleared who's on ${t}` : `put ${String(v)} on ${t}`;
    if (k === "maybe") return v ? `marked ${t} as maybe` : `confirmed ${t}`;
  }
  // Several at once (a booking read from a screenshot): say which parts changed.
  const WORDS: Record<string, string> = { title: "name", kind: "kind", start: "time", end: "time", place: "place", booking: "booking", contact: "contact", notes: "notes", who: "who's on it", maybe: "maybe", sleepsHere: "overnight", peakM: "summit" };
  const parts = [...new Set(keys.map((k) => WORDS[k] ?? k))];
  return `updated ${t}: ${parts.join(", ")}`;
}

/** One plain-language line for an op, from the trip as it was before the op. */
export function describeOp(before: Trip, op: Op): string {
  const itemTitle = (id: string) => quote(before.items.find((i) => i.id === id)?.title ?? "an item");
  switch (op.op) {
    case "item.add":
      return `added ${quote(op.item.title)}${op.item.start ? ` on ${formatDay(op.item.start.date)}` : " to ideas"}`;
    case "item.update": {
      const item = before.items.find((i) => i.id === op.id);
      return item ? describeUpdate(item, op.set as Patch) : "updated an item";
    }
    case "item.remove":
      return `removed ${itemTitle(op.id)}`;
    case "link.add":
      return `added ${LINK_WORD[op.link.kind]} to ${itemTitle(op.itemId)}`;
    case "link.update":
      return `updated a link on ${itemTitle(op.itemId)}`;
    case "link.remove":
      return `removed a link from ${itemTitle(op.itemId)}`;
    case "check.add":
      return `added ${quote(op.check.text)} to ${itemTitle(op.itemId)}`;
    case "check.set": {
      const text = before.items.find((i) => i.id === op.itemId)?.checklist?.find((c) => c.id === op.checkId)?.text ?? "an entry";
      if (op.done !== undefined) return `${op.done ? "ticked" : "unticked"} ${quote(text)}`;
      return `edited ${quote(text)}`;
    }
    case "check.remove":
      return `removed an entry from ${itemTitle(op.itemId)}`;
    case "todo.add":
      return `added the to-do ${quote(op.todo.text)}`;
    case "todo.update": {
      const text = before.todos.find((t) => t.id === op.id)?.text ?? "a to-do";
      if (op.set.done === true) return `finished ${quote(text)}`;
      if (op.set.done === false) return `reopened ${quote(text)}`;
      return `edited ${quote(text)}`;
    }
    case "todo.remove":
      return `removed the to-do ${quote(before.todos.find((t) => t.id === op.id)?.text ?? "")}`;
    case "trip.update":
      return "updated the trip details";
  }
}

/** Ids of items an op adds or changes, for highlighting and "Updated" markers. */
export function itemsTouched(op: Op): string[] {
  switch (op.op) {
    case "item.add":
      return [op.item.id];
    case "item.update":
    case "item.remove":
      return [op.id];
    case "link.add":
    case "link.update":
    case "link.remove":
    case "check.add":
    case "check.set":
    case "check.remove":
      return [op.itemId];
    default:
      return [];
  }
}

