"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { tripDays } from "@/domain/derive";
import { newId } from "@/domain/ids";
import { classifyLink, postInfo } from "@/domain/links";
import type { Op } from "@/domain/ops";
import { parseLine, type Draft } from "@/domain/parse";
import { formatDay, formatTime } from "@/domain/time";
import type { Item, ItemKind, Link } from "@/domain/types";
import { useClock } from "@/client/hooks";
import { useTrip } from "@/client/store";
import { KindChip } from "@/ui/badges";
import { Icon, LINK_ICON } from "@/ui/Icon";
import { btn, field } from "@/ui/kit";
import { Sheet } from "@/ui/Sheet";
import { Assistant } from "../assistant/Assistant";
import { unfurl, type Preview } from "../links/unfurl";
import { InstagramThumb, postThumbSrc } from "../posts/Posts";

/*
 * The one box. Type a plan and it's added; paste a link and it's saved; ask
 * a question and the assistant answers. Opened from the + button, from
 * "Add" on a day, and from "Ask about this" on an item.
 */

export interface ComposeRequest {
  text?: string;
  /** The day it's for, when opened from a day. */
  day?: string | null;
  /** The item it's about, when opened from an item. */
  itemId?: string | null;
  /** Go straight to the assistant with `text`. */
  ask?: boolean;
  kind?: ItemKind;
}

const Ctx = createContext<{ compose: (r?: ComposeRequest) => void } | null>(null);

export function useCompose() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCompose outside ComposerProvider");
  return v.compose;
}

export function ComposerProvider({ children, serverNow }: { children: ReactNode; serverNow: number }) {
  const [req, setReq] = useState<ComposeRequest | null>(null);
  const [session, setSession] = useState(0);
  const compose = useCallback((r: ComposeRequest = {}) => {
    setReq(r);
    setSession((s) => s + 1);
  }, []);
  return (
    <Ctx.Provider value={{ compose }}>
      {children}
      <Sheet open={!!req} onClose={() => setReq(null)} title={req?.ask || req?.itemId ? "Ask" : "Add or ask"} wide>
        {req && <ComposerBody key={session} req={req} serverNow={serverNow} onDone={() => setReq(null)} />}
      </Sheet>
    </Ctx.Provider>
  );
}

const KIND_WORD: Record<ItemKind, string> = { stay: "Place to stay", flight: "Flight", transport: "Getting around", activity: "Activity", food: "Food and drink", other: "Other" };

function ComposerBody({ req, serverNow, onDone }: { req: ComposeRequest; serverNow: number; onDone: () => void }) {
  const { trip } = useTrip();
  const nowMs = useClock(serverNow);
  const [text, setText] = useState(req.text ?? "");
  const [asking, setAsking] = useState<string | null>(req.ask || req.itemId ? (req.text ?? "") : null);
  const parsed = useMemo(() => parseLine(text, { trip, nowMs, day: req.day }), [text, trip, nowMs, req.day]);

  if (asking !== null) return <Assistant first={asking} itemId={req.itemId ?? null} day={req.day ?? null} />;

  return (
    <div className="flex flex-col gap-4 pt-1">
      <textarea
        data-autofocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (parsed.type === "ask") setAsking(text.trim());
            else (document.getElementById("composer-primary") as HTMLButtonElement | null)?.click();
          }
        }}
        rows={2}
        maxLength={4000}
        enterKeyHint="go"
        placeholder={req.day ? `Add to ${formatDay(req.day)}, paste a link, or ask anything` : "Dinner thu 7pm at Sabe Rico, a TikTok link, or a question"}
        aria-label="Add or ask"
        className={`${field} resize-none text-lg`}
      />

      {parsed.type === "empty" && <Hints day={req.day ?? null} onPick={setText} onAsk={(t) => setAsking(t)} />}
      {parsed.type === "ask" && (
        <div className="flex flex-col gap-2">
          <button id="composer-primary" type="button" onClick={() => setAsking(text.trim())} className={`${btn.primary} self-start`}>
            <Icon name="sparkles" />
            Ask the assistant
          </button>
          <p className="text-sm text-muted">It can find places, check hours, plan a day, or add things for you.</p>
        </div>
      )}
      {parsed.type === "item" && <ItemPreview draft={parsed.draft} kindHint={req.kind} onDone={onDone} onAsk={() => setAsking(text.trim())} />}
      {parsed.type === "links" && <LinkSaver urls={parsed.urls} rest={parsed.rest} itemId={req.itemId ?? null} day={req.day ?? null} onDone={onDone} />}
    </div>
  );
}

function Hints({ day, onPick, onAsk }: { day: string | null; onPick: (t: string) => void; onAsk: (t: string) => void }) {
  const { trip } = useTrip();
  const asks = [
    day ? `Plan ${formatDay(day)} around what's booked` : "What's still left to sort out?",
    `Where should we eat near our place in ${trip.destination}?`,
    "What should we pack?",
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Try <button type="button" className="font-semibold text-accent underline-offset-2 hover:underline" onClick={() => onPick("Sunrise hike sat 5am")}>“Sunrise hike sat 5am”</button>, paste a link from TikTok, Instagram or a booking site, or ask:
      </p>
      <ul className="flex flex-col gap-2">
        {asks.map((a) => (
          <li key={a}>
            <button type="button" onClick={() => onAsk(a)} className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-line px-3 text-left text-base hover:bg-sunken">
              <Icon name="sparkles" className="size-4 text-accent" />
              {a}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemPreview({ draft, kindHint, onDone, onAsk }: { draft: Draft; kindHint?: ItemKind; onDone: () => void; onAsk: () => void }) {
  const { trip, apply } = useTrip();
  const [kind, setKind] = useState<ItemKind>(kindHint ?? draft.kind);
  const [needsBooking, setNeedsBooking] = useState(false);
  const [day, setDay] = useState(draft.start?.date ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = draft.start ? { ...draft.start, date: day || draft.start.date } : day ? { date: day } : null;
  const canAdd = !!draft.title && !busy;

  async function add() {
    if (!canAdd) return;
    setBusy(true);
    const item: Item = {
      id: newId("i"),
      kind,
      title: draft.title,
      ...(start ? { start } : {}),
      ...(draft.end && start ? { end: draft.end } : {}),
      ...(draft.placeName ? { place: { name: draft.placeName } } : {}),
      ...(needsBooking ? { booking: { state: "todo" as const } } : {}),
    };
    const r = await apply([{ op: "item.add", item }]);
    setBusy(false);
    if (r.ok) onDone();
    else setError(r.error);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-canvas p-4">
      <div className="flex items-start gap-3">
        <KindChip kind={kind} />
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-snug font-bold">{draft.title || <span className="text-muted">What is it?</span>}</p>
          <p className="text-base text-muted">
            {start ? formatDay(start.date) : "No day yet: saved to ideas"}
            {start && "time" in start && start.time ? `, ${formatTime(start.time)}` : ""}
            {draft.guessedTime && <span> (guessed; add am or pm to change it)</span>}
            {draft.placeName && <span>. At {draft.placeName}</span>}
          </p>
          {draft.outsideTrip && <p className="mt-1 text-sm font-semibold text-todo">That day is outside the trip.</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as ItemKind)} className={`${field} w-auto min-w-0 flex-1`}>
          {(Object.keys(KIND_WORD) as ItemKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_WORD[k]}
            </option>
          ))}
        </select>
        <select aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)} className={`${field} w-auto min-w-0 flex-1`}>
          <option value="">No day (idea)</option>
          {tripDays(trip).map((d) => (
            <option key={d} value={d}>
              {formatDay(d)}
            </option>
          ))}
          {draft.start && !tripDays(trip).includes(draft.start.date) && <option value={draft.start.date}>{formatDay(draft.start.date)}</option>}
        </select>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-base">
        <input type="checkbox" checked={needsBooking} onChange={(e) => setNeedsBooking(e.target.checked)} className="size-5 accent-[var(--accent)]" />
        Needs booking
      </label>

      {error && <p className="text-base font-semibold text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button id="composer-primary" type="button" onClick={add} disabled={!canAdd} className={btn.primary}>
          <Icon name="plus" />
          Add
        </button>
        <button type="button" onClick={onAsk} className={btn.quiet}>
          <Icon name="sparkles" />
          Ask instead
        </button>
      </div>
    </div>
  );
}

/** Pasted links: preview them, then save onto an item or as new ideas. */
function LinkSaver({ urls, rest, itemId, day, onDone }: { urls: string[]; rest: string; itemId: string | null; day: string | null; onDone: () => void }) {
  const { trip, apply, me } = useTrip();
  const [target, setTarget] = useState<string>(itemId ?? "new");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Previews load as soon as a link is pasted, so the picture shows before anything is saved.
  const [metas, setMetas] = useState<Record<string, Preview | null>>({});
  const key = urls.join(" ");
  useEffect(() => {
    let live = true;
    void Promise.all(urls.map(async (u) => [u, await unfurl(trip.id, u)] as const)).then((r) => live && setMetas(Object.fromEntries(r)));
    return () => {
      live = false;
    };
    // The list of links is the key; re-run only when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, trip.id]);
  const loading = urls.some((u) => !(u in metas));
  const dated = trip.items.filter((i) => i.start).sort((a, b) => a.start!.date.localeCompare(b.start!.date));
  const undated = trip.items.filter((i) => !i.start);

  async function save() {
    setBusy(true);
    setError(null);
    // A link whose preview never came is still worth saving.
    const links: Link[] = urls.map((url) => {
      const m = metas[url];
      const c = classifyLink(url);
      return {
        id: newId("l"),
        url: m?.url ?? url,
        kind: m?.kind ?? c.kind,
        site: m?.site ?? c.site,
        ...(m?.title ? { title: m.title.slice(0, 300) } : {}),
        ...(m?.image ? { image: m.image } : {}),
        addedBy: me,
        addedAt: Date.now(),
      };
    });
    let ops: Op[];
    if (target === "new") {
      const placeName = Object.values(metas).find((m) => m?.placeName)?.placeName;
      const title = (rest || placeName || links[0].title || `Saved from ${links[0].site}`).slice(0, 200);
      const maps = links.find((l) => l.kind === "maps");
      const item: Item = {
        id: newId("i"),
        kind: "activity",
        title,
        ...(day ? { start: { date: day } } : {}),
        ...(maps ? { place: { name: placeName ?? title, mapsUrl: maps.url } } : {}),
        links,
      };
      ops = [{ op: "item.add", item }];
    } else {
      ops = links.map((link) => ({ op: "link.add" as const, itemId: target, link }));
      const maps = links.find((l) => l.kind === "maps");
      const item = trip.items.find((i) => i.id === target);
      if (maps && item && !item.place?.mapsUrl) ops.push({ op: "item.update", id: target, set: { place: { mapsUrl: maps.url } } });
      if (rest && item) ops.push({ op: "item.update", id: target, set: { notes: [item.notes, rest].filter(Boolean).join("\n").slice(0, 5000) } });
    }
    const r = await apply(ops, { message: target === "new" ? "Saved as a new idea" : `Saved to ${trip.items.find((i) => i.id === target)?.title}` });
    setBusy(false);
    if (r.ok) onDone();
    else setError(r.error);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-canvas p-4">
      <ul className="flex flex-col gap-3">
        {urls.map((u) => (
          <LinkPreview key={u} url={u} meta={metas[u]} loading={!(u in metas)} />
        ))}
      </ul>
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted">
        Save to
        <select value={target} onChange={(e) => setTarget(e.target.value)} className={field}>
          <option value="new">A new idea{rest ? `: ${rest.slice(0, 40)}` : ""}</option>
          {dated.length > 0 && (
            <optgroup label="On the plan">
              {dated.map((i) => (
                <option key={i.id} value={i.id}>
                  {formatDay(i.start!.date)}: {i.title}
                </option>
              ))}
            </optgroup>
          )}
          {undated.length > 0 && (
            <optgroup label="Ideas">
              {undated.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {error && <p className="text-base font-semibold text-danger">{error}</p>}
      <button id="composer-primary" type="button" onClick={save} disabled={busy || loading} className={`${btn.primary} self-start`}>
        <Icon name="link" />
        {busy ? "Saving…" : loading ? "Getting the preview…" : urls.length > 1 ? `Save ${urls.length} links` : "Save link"}
      </button>
    </div>
  );
}

/** A pasted link as it will look once saved: a post's picture and caption, or a page's image and title. */
function LinkPreview({ url, meta, loading }: { url: string; meta: Preview | null | undefined; loading: boolean }) {
  const { trip } = useTrip();
  const c = classifyLink(meta?.url ?? url);
  const post = postInfo(meta?.url ?? url);
  const title = meta?.title ?? meta?.placeName;
  return (
    <li className="flex items-start gap-3">
      <span className={`relative shrink-0 overflow-hidden rounded-xl bg-sunken ${post ? "h-28 w-21" : "size-16"}`}>
        {post?.platform === "instagram" ? (
          <InstagramThumb code={post.id} />
        ) : post ? (
          // eslint-disable-next-line @next/next/no-img-element -- through our own route: TikTok's image servers refuse other sites
          <img src={postThumbSrc(trip.id, meta?.url ?? url)} alt="" className="absolute inset-0 size-full object-cover" />
        ) : meta?.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- a fresh preview, shown once
          <img src={meta.image} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <Icon name={LINK_ICON[meta?.kind ?? c.kind]} className={`size-6 ${loading ? "animate-pulse" : ""}`} />
          </span>
        )}
        {post && (
          <span className="absolute top-1 left-1 flex size-6 items-center justify-center rounded-full bg-black/50 text-white">
            <Icon name={LINK_ICON[meta?.kind ?? c.kind]} className="size-3.5" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-muted">{post?.label ?? meta?.site ?? c.site}</span>
        <span className="line-clamp-3 text-base leading-snug font-semibold">{loading ? "Getting the preview…" : (title ?? url.replace(/^https?:\/\/(www\.)?/, ""))}</span>
        {meta?.description && <span className="block truncate text-sm text-muted">{meta.description}</span>}
      </span>
    </li>
  );
}
