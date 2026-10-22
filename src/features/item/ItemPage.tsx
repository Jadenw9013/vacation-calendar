"use client";

import { useState, type ReactNode } from "react";
import { tripDays } from "@/domain/derive";
import { newId } from "@/domain/ids";
import { classifyLink, directionsUrl, extractUrls, hasContact, instagramUrl, isPost, mailUrl, mapsLink, telUrl, whatsappUrl } from "@/domain/links";
import type { Op } from "@/domain/ops";
import type { ItemPatchT } from "@/domain/schema";
import { formatDay, zoneName } from "@/domain/time";
import type { Booking, Contact, Item, ItemKind, Link, Place, When } from "@/domain/types";
import type { View } from "@/client/router";
import { useTrip } from "@/client/store";
import { Avatar, KindChip } from "@/ui/badges";
import { Icon, LINK_ICON, type IconName } from "@/ui/Icon";
import { ActionChip, btn, field, label, useCopy } from "@/ui/kit";
import { Sheet, SheetAction } from "@/ui/Sheet";
import { useCompose } from "../composer/Composer";
import { unfurl } from "../links/unfurl";
import { PostGrid, thumbSrc } from "../posts/Posts";
import { Marks, timeLabel, whenLabel } from "../shared";

type EditKind = "title" | "when" | "where" | "booking" | "contact" | "menu" | "delete" | null;

/** An item's own page: everything about it, and every way to act on it, in one place. */
export function ItemPage({ itemId, back, go }: { itemId: string; back: () => void; go: (v: View) => void }) {
  const { trip, apply } = useTrip();
  const compose = useCompose();
  const copy = useCopy();
  const [edit, setEdit] = useState<EditKind>(null);
  const item = trip.items.find((i) => i.id === itemId);

  if (!item) {
    return (
      <div className="flex flex-col items-start gap-4 px-4 pt-6">
        <p className="text-lg font-semibold">This isn&apos;t on the trip any more.</p>
        <p className="text-base text-muted">Someone may have removed it. Undo from Trip, Activity if that was a mistake.</p>
        <button type="button" onClick={() => go({ tab: "plan" })} className={btn.secondary}>
          Go to the plan
        </button>
      </div>
    );
  }

  const update = (set: ItemPatchT, message?: string) => apply([{ op: "item.update", id: item.id, set }], { message });
  const c = item.contact;
  const b = item.booking;
  const dir = directionsUrl(item.place, trip);
  const posts = (item.links ?? []).filter((l) => isPost(l.kind)).map((link) => ({ link, item }));
  const coverLink = posts.length ? undefined : item.links?.find((l) => l.image);

  return (
    <article className="flex flex-col pb-6">
      <div className="sticky top-0 z-20 flex items-center justify-between bg-canvas/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur">
        <button type="button" onClick={back} className="flex min-h-11 items-center gap-1 rounded-xl px-2 text-base font-semibold text-accent hover:bg-sunken">
          <Icon name="back" />
          Back
        </button>
        <button type="button" onClick={() => setEdit("menu")} aria-label="More actions" className="flex size-11 items-center justify-center rounded-xl hover:bg-sunken">
          <Icon name="more" />
        </button>
      </div>

      {coverLink && (
        <div className="cover-photo mx-4 mb-3 h-44 overflow-hidden rounded-3xl bg-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element -- through our own route; not worth the image optimizer */}
          <img src={thumbSrc(trip.id, item.id, coverLink.id)} alt="" className="size-full object-cover" />
        </div>
      )}

      <header className="flex flex-col gap-2 px-4">
        <button type="button" onClick={() => setEdit("title")} className="group flex items-start gap-3 text-left">
          <KindChip kind={item.kind} size="lg" />
          <h1 className="pt-1 text-2xl leading-tight font-bold">
            {item.title}
            <Icon name="pencil" className="ml-2 inline size-4 align-baseline text-muted opacity-60 group-hover:opacity-100" />
          </h1>
        </button>
        <div className="pl-14">
          <Marks item={item} />
        </div>
      </header>

      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {dir && (
          <ActionChip icon="directions" href={dir}>
            Directions
          </ActionChip>
        )}
        {c?.phone && (
          <ActionChip icon="phone" href={telUrl(c.phone)}>
            Call
          </ActionChip>
        )}
        {c?.whatsapp && (
          <ActionChip icon="whatsapp" href={whatsappUrl(c.whatsapp)}>
            WhatsApp
          </ActionChip>
        )}
        {b?.url && (
          <ActionChip icon="ticket" href={b.url}>
            {b.state === "booked" ? "Booking" : "Book"}
          </ActionChip>
        )}
        {b?.confirmation && (
          <ActionChip icon="copy" onClick={() => copy(b.confirmation!, "Confirmation")}>
            {b.confirmation}
          </ActionChip>
        )}
        {c?.website && (
          <ActionChip icon="globe" href={c.website}>
            Website
          </ActionChip>
        )}
        <ActionChip icon="sparkles" onClick={() => compose({ ask: true, itemId: item.id, text: "" })}>
          Ask about this
        </ActionChip>
      </div>

      {posts.length > 0 && (
        <section aria-label="Saved posts" className="mt-4 px-4">
          <h2 className="mb-2 text-sm font-bold text-muted">
            Posts <span className="tnum">{posts.length}</span>
          </h2>
          <PostGrid entries={posts} go={go} />
        </section>
      )}

      <div className="mt-4 flex flex-col divide-y divide-line px-4">
        <Section title="When" onEdit={() => setEdit("when")}>
          {item.start ? (
            <p className="text-base">
              {whenLabel(item.start, trip)}
              {item.end && (
                <>
                  <br />
                  <span className="text-muted">{item.kind === "stay" ? "Check out " : item.kind === "flight" ? "Lands " : "Until "}</span>
                  {item.end.date === item.start.date ? (timeLabel(item.end, trip) ?? "") : whenLabel(item.end, trip)}
                </>
              )}
            </p>
          ) : (
            <Empty onClick={() => setEdit("when")}>Not on a day yet. Pick one</Empty>
          )}
        </Section>

        <Section title="Where" onEdit={() => setEdit("where")}>
          {item.place?.name || item.place?.address || item.place?.mapsUrl ? (
            <div className="flex flex-col gap-1">
              {item.place.name && <p className="text-base font-semibold">{item.place.name}</p>}
              {item.place.address && (
                <button type="button" onClick={() => copy(item.place!.address!, "Address")} className="text-left text-base text-muted">
                  {item.place.address}
                </button>
              )}
              {mapsLink(item.place, trip) && (
                <a href={mapsLink(item.place, trip)!} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 self-start font-semibold text-accent">
                  <Icon name="pin" className="size-4" />
                  Open in Maps
                </a>
              )}
            </div>
          ) : (
            <Empty onClick={() => setEdit("where")}>Add an address or a Maps link</Empty>
          )}
        </Section>

        <Section title="Reservation" onEdit={() => setEdit("booking")}>
          <BookingState item={item} onSet={(state) => update(state === null ? { booking: null } : { booking: { state } })} />
          {b && (b.confirmation || b.url || b.price || b.by || b.note) && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-base">
              {b.confirmation && (
                <>
                  <dt className="text-muted">Confirmation</dt>
                  <dd>
                    <button type="button" onClick={() => copy(b.confirmation!, "Confirmation")} className="tnum inline-flex items-center gap-2 font-bold">
                      {b.confirmation}
                      <Icon name="copy" className="size-4 text-muted" />
                    </button>
                  </dd>
                </>
              )}
              {b.price && (
                <>
                  <dt className="text-muted">Price</dt>
                  <dd className="tnum">{money(b.price.amount, b.price.currency)}</dd>
                </>
              )}
              {b.by && (
                <>
                  <dt className="text-muted">{b.state === "booked" ? "Booked by" : "Booking"}</dt>
                  <dd>{b.by}</dd>
                </>
              )}
              {b.url && (
                <>
                  <dt className="text-muted">Link</dt>
                  <dd className="min-w-0">
                    <a href={b.url} target="_blank" rel="noreferrer" className="block truncate font-semibold text-accent">
                      {classifyLink(b.url).site}
                    </a>
                  </dd>
                </>
              )}
              {b.note && (
                <>
                  <dt className="text-muted">Note</dt>
                  <dd>{b.note}</dd>
                </>
              )}
            </dl>
          )}
        </Section>

        <Section title="Contact" onEdit={() => setEdit("contact")}>
          {hasContact(c) ? <ContactList contact={c} /> : <Empty onClick={() => setEdit("contact")}>Add a phone, WhatsApp or email</Empty>}
        </Section>

        <Section title={posts.length ? "Links" : "Links and posts"}>
          <Links item={item} />
        </Section>

        <Section title="Notes">
          <Notes item={item} />
        </Section>

        <Section title="Checklist">
          <Checklist item={item} />
        </Section>

        <Section title="Who's on it">
          <Who item={item} />
        </Section>
      </div>

      {edit === "title" && <TitleSheet item={item} onClose={() => setEdit(null)} />}
      {edit === "when" && <WhenSheet item={item} onClose={() => setEdit(null)} />}
      {edit === "where" && <PlaceSheet item={item} onClose={() => setEdit(null)} />}
      {edit === "booking" && <BookingSheet item={item} onClose={() => setEdit(null)} />}
      {edit === "contact" && <ContactSheet item={item} onClose={() => setEdit(null)} />}
      {edit === "delete" && <DeleteSheet item={item} onClose={() => setEdit(null)} onDeleted={() => back()} />}
      {edit === "menu" && (
        <Sheet open onClose={() => setEdit(null)} title={item.title}>
          <div className="flex flex-col gap-1">
            <SheetAction icon="idea" onClick={() => (setEdit(null), void update({ maybe: item.maybe ? null : true }))}>
              {item.maybe ? "It's happening (not a maybe)" : "Mark as maybe"}
            </SheetAction>
            {item.start && (
              <SheetAction icon="idea" onClick={() => (setEdit(null), void update({ start: null, end: null }))}>
                Move to ideas (no day)
              </SheetAction>
            )}
            <SheetAction
              icon="copy"
              onClick={() => {
                setEdit(null);
                const copyOf: Item = { ...structuredClone(item), id: newId("i"), title: `${item.title} (copy)`.slice(0, 200) };
                delete copyOf.booking;
                void apply([{ op: "item.add", item: copyOf }], { message: "Duplicated" }).then((r) => r.ok && go({ tab: "item", itemId: copyOf.id }));
              }}
            >
              Duplicate
            </SheetAction>
            <SheetAction icon="trash" tone="danger" onClick={() => setEdit("delete")}>
              Delete
            </SheetAction>
          </div>
        </Sheet>
      )}
    </article>
  );
}

function Section({ title, onEdit, children }: { title: string; onEdit?: () => void; children: ReactNode }) {
  return (
    <section className="py-4">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-sm font-bold text-muted">{title}</h2>
        {onEdit && (
          <button type="button" onClick={onEdit} className="-my-2 min-h-11 rounded-xl px-3 text-sm font-semibold text-accent hover:bg-sunken">
            Edit
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 text-left text-base text-muted underline decoration-line underline-offset-4 hover:text-ink">
      {children}
    </button>
  );
}

export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function BookingState({ item, onSet }: { item: Item; onSet: (s: Booking["state"] | null) => void }) {
  const cur = item.booking?.state ?? null;
  const opts: [Booking["state"] | null, string][] = [
    [null, "Not needed"],
    ["todo", "To book"],
    ["booked", "Booked"],
  ];
  return (
    <div role="radiogroup" aria-label="Reservation" className="grid grid-cols-3 gap-1 rounded-xl bg-sunken p-1">
      {opts.map(([v, l]) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={cur === v}
          onClick={() => cur !== v && onSet(v)}
          className={`min-h-10 rounded-lg px-2 text-sm font-semibold ${cur === v ? "bg-surface text-ink shadow-lift" : "text-muted"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function ContactList({ contact: c }: { contact: Contact }) {
  const rows: [IconName, string, string][] = [];
  if (c.phone) rows.push(["phone", c.phone, telUrl(c.phone)]);
  if (c.whatsapp) rows.push(["whatsapp", `WhatsApp ${c.whatsapp}`, whatsappUrl(c.whatsapp)]);
  if (c.email) rows.push(["mail", c.email, mailUrl(c.email)]);
  if (c.website) rows.push(["globe", classifyLink(c.website).site, c.website]);
  if (c.instagram) rows.push(["instagram", c.instagram.startsWith("http") ? "Instagram" : `@${c.instagram.replace(/^@/, "")}`, instagramUrl(c.instagram)]);
  return (
    <ul className="flex flex-col">
      {rows.map(([icon, text, href]) => (
        <li key={href}>
          <a href={href} {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})} className="flex min-h-11 items-center gap-3 text-base font-semibold text-accent">
            <Icon name={icon} className="size-5" />
            <span className="truncate">{text}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Links({ item }: { item: Item }) {
  const { apply, trip, me, online } = useTrip();
  const links = (item.links ?? []).filter((l) => !isPost(l.kind));
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const urls = extractUrls(url);
    if (!urls.length) return setError("Paste a link that starts with https://");
    setBusy(true);
    setError(null);
    const ops: Op[] = [];
    for (const u of urls) {
      const p = await unfurl(trip.id, u);
      const c = classifyLink(p?.url ?? u);
      const link: Link = {
        id: newId("l"),
        url: p?.url ?? u,
        kind: p?.kind ?? c.kind,
        site: p?.site ?? c.site,
        ...(p?.title ? { title: p.title.slice(0, 300) } : {}),
        ...(p?.image ? { image: p.image } : {}),
        addedBy: me,
        addedAt: Date.now(),
      };
      ops.push({ op: "link.add", itemId: item.id, link });
      if (link.kind === "maps" && !item.place?.mapsUrl) ops.push({ op: "item.update", id: item.id, set: { place: { mapsUrl: link.url, ...(p?.placeName && !item.place?.name ? { name: p.placeName } : {}) } } });
      if (link.kind === "booking" && !item.booking?.url) ops.push({ op: "item.update", id: item.id, set: { booking: { url: link.url } } });
    }
    const r = await apply(ops, { message: urls.length > 1 ? "Links saved" : "Link saved" });
    setBusy(false);
    if (r.ok) setUrl("");
    else setError(r.error);
  }

  return (
    <div className="flex flex-col gap-3">
      {links.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {links.map((l) => (
            <li key={l.id} className="flex items-stretch gap-0 overflow-hidden rounded-2xl border border-line bg-surface">
              <a href={l.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3 p-2 hover:bg-sunken">
                {l.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- through our own route
                  <img src={thumbSrc(trip.id, item.id, l.id)} alt="" className="size-16 shrink-0 rounded-xl bg-sunken object-cover" />
                ) : (
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-sunken">
                    <Icon name={LINK_ICON[l.kind]} className="size-6" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-muted">
                    <Icon name={LINK_ICON[l.kind]} className="size-3.5" />
                    {l.site ?? classifyLink(l.url).site}
                  </span>
                  <span className="line-clamp-2 text-base leading-snug font-semibold">{l.title ?? l.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                </span>
              </a>
              <button
                type="button"
                onClick={() => void apply([{ op: "link.remove", itemId: item.id, linkId: l.id }], { message: "Link removed" })}
                aria-label={`Remove ${l.title ?? "link"}`}
                className="flex w-11 shrink-0 items-center justify-center text-muted hover:bg-sunken"
              >
                <Icon name="close" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex gap-2"
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          placeholder="Paste a TikTok, Reel, booking or Maps link"
          aria-label="Add a link"
          className={field}
        />
        <button type="submit" disabled={!url.trim() || busy} className={btn.secondary}>
          {busy ? "Saving…" : "Add"}
        </button>
      </form>
      {!online && <p className="text-sm text-muted">Offline: links save now, previews come later.</p>}
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}

function Notes({ item }: { item: Item }) {
  const { apply } = useTrip();
  const [text, setText] = useState(item.notes ?? "");
  const [last, setLast] = useState(item.notes ?? "");
  // Someone else changed the notes while this was open and untouched: show theirs.
  if ((item.notes ?? "") !== last && text === last) {
    setText(item.notes ?? "");
    setLast(item.notes ?? "");
  }
  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = text.trim();
        if (t === (item.notes ?? "")) return;
        setLast(t);
        void apply([{ op: "item.update", id: item.id, set: { notes: t || null } }], { message: "Notes saved" });
      }}
      rows={Math.min(12, Math.max(3, text.split("\n").length + 1))}
      maxLength={5000}
      placeholder="Door codes, what to bring, what the host said…"
      aria-label="Notes"
      className={`${field} resize-y leading-relaxed`}
    />
  );
}

function Checklist({ item }: { item: Item }) {
  const { apply } = useTrip();
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col">
        {(item.checklist ?? []).map((c) => (
          <li key={c.id} className="flex items-start gap-3 py-1.5">
            <input
              type="checkbox"
              checked={c.done}
              onChange={(e) => void apply([{ op: "check.set", itemId: item.id, checkId: c.id, done: e.target.checked }])}
              aria-label={c.text}
              className="mt-0.5 size-6 shrink-0 accent-[var(--accent)]"
            />
            <span className={`flex-1 text-base ${c.done ? "text-muted line-through" : ""}`}>{c.text}</span>
            <button
              type="button"
              onClick={() => void apply([{ op: "check.remove", itemId: item.id, checkId: c.id }])}
              aria-label={`Remove ${c.text}`}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sunken"
            >
              <Icon name="close" className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          const r = await apply([{ op: "check.add", itemId: item.id, check: { id: newId("c"), text: t.slice(0, 300), done: false } }]);
          if (r.ok) setText("");
        }}
        className="flex gap-2"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add to the checklist" aria-label="Add to the checklist" maxLength={300} className={field} />
        <button type="submit" disabled={!text.trim()} className={btn.secondary}>
          Add
        </button>
      </form>
    </div>
  );
}

function Who({ item }: { item: Item }) {
  const { trip, me, apply } = useTrip();
  const people = [...new Set([me, ...trip.people, ...(item.who ? [item.who] : [])])];
  return (
    <div className="flex flex-wrap gap-2">
      {people.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={item.who === p}
          onClick={() => void apply([{ op: "item.update", id: item.id, set: { who: item.who === p ? null : p } }])}
          className={`inline-flex min-h-10 items-center gap-2 rounded-full py-1 pr-4 pl-1 text-base font-semibold ${item.who === p ? "bg-ink text-canvas" : "border border-line text-ink hover:bg-sunken"}`}
        >
          <Avatar name={p} />
          {p === me ? `${p} (you)` : p}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit sheets. Each saves only what changed, so two people editing different
// fields of the same item never overwrite each other.

type SaveResult = null | string | { confirm: string };

function EditSheet({ title, onClose, onSave, children }: { title: string; onClose: () => void; onSave: (confirmed: boolean) => Promise<SaveResult>; children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(confirmed: boolean) {
    setBusy(true);
    const r = await onSave(confirmed);
    setBusy(false);
    if (r === null) onClose();
    else if (typeof r === "string") setError(r);
    else setConfirm(r.confirm);
  }
  return (
    <Sheet open onClose={onClose} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(false);
        }}
        className="flex flex-col gap-4 pt-1"
      >
        {children}
        {error && <p className="text-base font-semibold text-danger">{error}</p>}
        {confirm && (
          <div className="flex flex-col gap-2 rounded-xl bg-todo-soft p-3">
            <p className="text-base font-semibold text-todo">{confirm}</p>
            <button type="button" onClick={() => void run(true)} disabled={busy} className={`${btn.secondary} self-start`}>
              Save anyway
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className={btn.primary}>
            Save
          </button>
          <button type="button" onClick={onClose} className={btn.secondary}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** The nested patch that turns `prev` into `next`: changed keys only, null for cleared ones. */
function diff<T extends object>(prev: T | undefined, next: Partial<T>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  const p = (prev ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(next)) {
    const empty = v === undefined || v === "" || v === null;
    if (empty && p[k] !== undefined) out[k] = null;
    else if (!empty && JSON.stringify(v) !== JSON.stringify(p[k])) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

function useSave(item: Item) {
  const { apply } = useTrip();
  return async (set: Record<string, unknown> | null, confirmed = false): Promise<SaveResult> => {
    if (!set) return null;
    const r = await apply([{ op: "item.update", id: item.id, set: set as ItemPatchT }], { confirmed });
    if (r.ok) return null;
    return r.needsConfirmation ? { confirm: r.error } : r.error;
  };
}

function TitleSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const save = useSave(item);
  const [title, setTitle] = useState(item.title);
  const [kind, setKind] = useState<ItemKind>(item.kind);
  const kinds: [ItemKind, string][] = [
    ["activity", "Activity"],
    ["food", "Food and drink"],
    ["stay", "Place to stay"],
    ["transport", "Getting around"],
    ["flight", "Flight"],
    ["other", "Other"],
  ];
  return (
    <EditSheet title="Name" onClose={onClose} onSave={(ok) => save(diff(item, { title: title.trim() || item.title, kind }), ok)}>
      <label className={label}>
        Name
        <input data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={field} />
      </label>
      <label className={label}>
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value as ItemKind)} className={field}>
          {kinds.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
    </EditSheet>
  );
}

function WhenSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const { trip } = useTrip();
  const save = useSave(item);
  const days = tripDays(trip);
  const [sDate, setSDate] = useState(item.start?.date ?? "");
  const [sTime, setSTime] = useState(item.start?.time ?? "");
  const [eDate, setEDate] = useState(item.end?.date ?? "");
  const [eTime, setETime] = useState(item.end?.time ?? "");
  const [tz, setTz] = useState(item.start?.tz ?? "");
  const zones = [...new Set([trip.tz, trip.homeTz, item.start?.tz, item.end?.tz].filter((z): z is string => !!z))];
  const when = (date: string, time: string, zone: string): When | null => (date ? { date, ...(time ? { time } : {}), ...(zone && zone !== trip.tz && time ? { tz: zone } : {}) } : null);
  const endLabel = item.kind === "stay" ? "Check out" : item.kind === "flight" ? "Lands" : "Ends";
  return (
    <EditSheet
      title="When"
      onClose={onClose}
      onSave={(ok) => {
        const start = when(sDate, sTime, tz);
        const end = when(eDate || (eTime ? sDate : ""), eTime, item.end?.tz ?? (item.kind === "flight" ? "" : tz));
        return save(diff(item, { start, end: start ? end : null }), ok);
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-muted">{item.kind === "stay" ? "Check in" : "Starts"}</legend>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} aria-label="Day" list="trip-days" className={field} />
          <input type="time" value={sTime} onChange={(e) => setSTime(e.target.value)} aria-label="Time" className={field} />
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-muted">{endLabel} (optional)</legend>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} aria-label={`${endLabel} day`} className={field} />
          <input type="time" value={eTime} onChange={(e) => setETime(e.target.value)} aria-label={`${endLabel} time`} className={field} />
        </div>
      </fieldset>
      {zones.length > 1 && (
        <label className={label}>
          Time zone of the start time
          <select value={tz || trip.tz} onChange={(e) => setTz(e.target.value)} className={field}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {zoneName(z)}
                {z === trip.tz ? ` (${trip.destination})` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <datalist id="trip-days">
        {days.map((d) => (
          <option key={d} value={d}>
            {formatDay(d)}
          </option>
        ))}
      </datalist>
      <p className="text-sm text-muted">Leave the time empty if it isn&apos;t known yet. Clear the day to move it to ideas.</p>
    </EditSheet>
  );
}

function PlaceSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const save = useSave(item);
  const [p, setP] = useState<Place>({ name: item.place?.name ?? "", address: item.place?.address ?? "", mapsUrl: item.place?.mapsUrl ?? "" });
  return (
    <EditSheet
      title="Where"
      onClose={onClose}
      onSave={(ok) => {
        const d = diff(item.place, { name: p.name?.trim(), address: p.address?.trim(), mapsUrl: p.mapsUrl?.trim() });
        return save(d ? { place: d } : null, ok);
      }}
    >
      <label className={label}>
        Place name
        <input data-autofocus value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} maxLength={300} className={field} />
      </label>
      <label className={label}>
        Address
        <input value={p.address} onChange={(e) => setP({ ...p, address: e.target.value })} maxLength={300} autoComplete="street-address" className={field} />
      </label>
      <label className={label}>
        Google Maps link
        <input value={p.mapsUrl} onChange={(e) => setP({ ...p, mapsUrl: e.target.value })} inputMode="url" placeholder="https://maps.app.goo.gl/…" className={field} />
      </label>
      <p className="text-sm text-muted">In Google Maps, tap Share on the place and paste the link here. Directions then go to the exact spot.</p>
    </EditSheet>
  );
}

function BookingSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const { trip } = useTrip();
  const save = useSave(item);
  const b = item.booking;
  const [state, setState] = useState<Booking["state"]>(b?.state ?? "todo");
  const [conf, setConf] = useState(b?.confirmation ?? "");
  const [url, setUrl] = useState(b?.url ?? "");
  const [amount, setAmount] = useState(b?.price ? String(b.price.amount) : "");
  const [currency, setCurrency] = useState(b?.price?.currency ?? trip.currency);
  const [by, setBy] = useState(b?.by ?? "");
  const [note, setNote] = useState(b?.note ?? "");
  const currencies = [...new Set([trip.currency, trip.homeCurrency ?? "USD", currency])];
  return (
    <EditSheet
      title="Reservation"
      onClose={onClose}
      onSave={(ok) => {
        const n = Number(amount.replace(/[^\d.]/g, ""));
        const next: Partial<Booking> = {
          state,
          confirmation: conf.trim(),
          url: url.trim(),
          price: amount.trim() && Number.isFinite(n) ? { amount: n, currency } : undefined,
          by: by.trim(),
          note: note.trim(),
        };
        const d = b ? diff(b, next) : Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && v !== ""));
        return save(d && Object.keys(d).length ? { booking: d } : null, ok);
      }}
    >
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-sunken p-1">
        {(["todo", "booked"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={state === s} onClick={() => setState(s)} className={`min-h-10 rounded-lg text-sm font-semibold ${state === s ? "bg-surface shadow-lift" : "text-muted"}`}>
            {s === "todo" ? "To book" : "Booked"}
          </button>
        ))}
      </div>
      <label className={label}>
        Confirmation number
        <input value={conf} onChange={(e) => setConf(e.target.value)} maxLength={100} autoCapitalize="characters" className={`${field} tnum`} />
      </label>
      <label className={label}>
        {state === "booked" ? "Link to the booking" : "Where to book it"}
        <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder="https://" className={field} />
      </label>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <label className={label}>
          Price
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={`${field} tnum`} />
        </label>
        <label className={label}>
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label className={label}>
        {state === "booked" ? "Booked by" : "Who's booking it"}
        <input value={by} onChange={(e) => setBy(e.target.value)} maxLength={30} placeholder="First name" className={field} />
      </label>
      <label className={label}>
        Note
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Free cancellation until Nov 20" className={field} />
      </label>
    </EditSheet>
  );
}

function ContactSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const save = useSave(item);
  const [c, setC] = useState<Contact>({ phone: "", whatsapp: "", email: "", website: "", instagram: "", ...item.contact });
  const set = (k: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: e.target.value });
  return (
    <EditSheet
      title="Contact"
      onClose={onClose}
      onSave={(ok) => {
        const trimmed = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, (v ?? "").trim()])) as Contact;
        const d = diff(item.contact, trimmed);
        return save(d ? { contact: d } : null, ok);
      }}
    >
      <label className={label}>
        Phone
        <input value={c.phone} onChange={set("phone")} inputMode="tel" autoComplete="off" placeholder="+502 …" className={field} />
      </label>
      <label className={label}>
        WhatsApp
        <input value={c.whatsapp} onChange={set("whatsapp")} inputMode="tel" placeholder="Same as the phone, or another number" className={field} />
      </label>
      <label className={label}>
        Email
        <input value={c.email} onChange={set("email")} inputMode="email" className={field} />
      </label>
      <label className={label}>
        Website
        <input value={c.website} onChange={set("website")} inputMode="url" placeholder="https://" className={field} />
      </label>
      <label className={label}>
        Instagram
        <input value={c.instagram} onChange={set("instagram")} placeholder="@handle" className={field} />
      </label>
    </EditSheet>
  );
}

function DeleteSheet({ item, onClose, onDeleted }: { item: Item; onClose: () => void; onDeleted: () => void }) {
  const { apply } = useTrip();
  const booked = item.booking?.state === "booked";
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open onClose={onClose} title={`Delete ${item.title}?`}>
      <div className="flex flex-col gap-4 pt-1">
        {booked && <p className="rounded-xl bg-todo-soft p-3 text-base font-semibold text-todo">This is booked. Cancel it with whoever it&apos;s booked with too.</p>}
        <p className="text-base text-muted">You can undo this right after, or later from Trip, Activity.</p>
        {error && <p className="text-base font-semibold text-danger">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              const r = await apply([{ op: "item.remove", id: item.id }], { confirmed: booked, message: `Deleted ${item.title}` });
              if (r.ok) {
                onClose();
                onDeleted();
              } else setError(r.error);
            }}
            className={`${btn.primary} bg-danger`}
          >
            <Icon name="trash" />
            Delete
          </button>
          <button type="button" onClick={onClose} className={btn.secondary}>
            Keep it
          </button>
        </div>
      </div>
    </Sheet>
  );
}
