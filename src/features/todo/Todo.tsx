"use client";

import { useState } from "react";
import { missing, toBook } from "@/domain/derive";
import { newId } from "@/domain/ids";
import { addDays, formatDay } from "@/domain/time";
import type { Item, Todo as TodoT } from "@/domain/types";
import type { View } from "@/client/router";
import { useTrip } from "@/client/store";
import { KindChip } from "@/ui/badges";
import { Icon } from "@/ui/Icon";
import { btn, field, SectionTitle } from "@/ui/kit";
import { Sheet } from "@/ui/Sheet";
import { useCompose } from "../composer/Composer";
import { SyncLine } from "../SyncLine";

/** To-do: what still needs booking, what's missing, and the group's list. */
export function Todo({ go }: { go: (v: View) => void }) {
  const { trip } = useTrip();
  const compose = useCompose();
  const book = toBook(trip);
  const gaps = missing(trip);
  const open = trip.todos.filter((t) => !t.done);
  const done = trip.todos.filter((t) => t.done);
  const [marking, setMarking] = useState<Item | null>(null);

  return (
    <div className="flex flex-col gap-7 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <h1 className="text-2xl font-bold">To-do</h1>

      {gaps.length > 0 && (
        <section aria-labelledby="missing">
          <SectionTitle>
            <span id="missing">Missing</span>
          </SectionTitle>
          <ul className="flex flex-col gap-2">
            {gaps.map((g) => {
              const label =
                g.kind === "flight-home"
                  ? "No flight home yet"
                  : g.count === 1
                    ? `Nowhere to stay the night of ${formatDay(g.from)}`
                    : `Nowhere to stay ${formatDay(g.from)} to ${formatDay(addDays(g.to, 1))} (${g.count} nights)`;
              const ask = g.kind === "flight-home" ? "Help us pick a flight home" : `Find us a place to stay the night of ${formatDay(g.from)}`;
              return (
                <li key={label} className="flex flex-col gap-2 rounded-2xl border border-dashed border-todo bg-todo-soft p-4">
                  <p className="flex items-center gap-2 text-base font-bold text-todo">
                    <Icon name={g.kind === "flight-home" ? "plane" : "bed"} />
                    {label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => compose({ ask: true, text: ask, day: g.kind === "nights" ? g.from : null })} className={btn.secondary}>
                      <Icon name="sparkles" />
                      Find options
                    </button>
                    <button type="button" onClick={() => compose({ day: g.kind === "nights" ? g.from : trip.endDate, kind: g.kind === "nights" ? "stay" : "flight" })} className={btn.quiet}>
                      <Icon name="plus" />
                      Add it
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="to-book">
        <SectionTitle>
          <span id="to-book">To book</span>
        </SectionTitle>
        {book.length === 0 ? (
          <p className="text-base text-muted">Nothing waiting to be booked.</p>
        ) : (
          <ul className="divide-y divide-line">
            {book.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-3">
                <KindChip kind={i.kind} />
                <button type="button" onClick={() => go({ tab: "item", itemId: i.id })} className="min-w-0 flex-1 text-left">
                  <span className="block text-base leading-snug font-semibold">{i.title}</span>
                  <span className="block text-sm text-muted">
                    {i.start ? formatDay(i.start.date) : "No day yet"}
                    {i.booking?.by ? `. ${i.booking.by} is on it` : ""}
                  </span>
                </button>
                {i.booking?.url && (
                  <a href={i.booking.url} target="_blank" rel="noreferrer" className={btn.secondary}>
                    Book
                  </a>
                )}
                <button type="button" onClick={() => setMarking(i)} className={btn.secondary}>
                  <Icon name="check" className="size-4" />
                  Booked
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="list">
        <SectionTitle>
          <span id="list">List</span>
        </SectionTitle>
        <ul className="flex flex-col">
          {open.map((t) => (
            <TodoRow key={t.id} todo={t} onItem={(id) => go({ tab: "item", itemId: id })} />
          ))}
        </ul>
        <AddTodo />
        {done.length > 0 && (
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold text-muted">Done ({done.length})</summary>
            <ul className="flex flex-col">
              {done.map((t) => (
                <TodoRow key={t.id} todo={t} onItem={(id) => go({ tab: "item", itemId: id })} />
              ))}
            </ul>
          </details>
        )}
      </section>

      <SyncLine />
      {marking && <MarkBooked item={marking} onClose={() => setMarking(null)} />}
    </div>
  );
}

function TodoRow({ todo, onItem }: { todo: TodoT; onItem: (id: string) => void }) {
  const { apply, trip } = useTrip();
  const item = todo.itemId ? trip.items.find((i) => i.id === todo.itemId) : null;
  return (
    <li className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={todo.done}
        onChange={(e) => void apply([{ op: "todo.update", id: todo.id, set: { done: e.target.checked } }])}
        aria-label={todo.text}
        className="mt-1 size-6 shrink-0 accent-[var(--accent)]"
      />
      <div className="min-w-0 flex-1">
        <p className={`text-base ${todo.done ? "text-muted line-through" : ""}`}>{todo.text}</p>
        {todo.note && <p className="text-sm text-muted">{todo.note}</p>}
        {item && (
          <button type="button" onClick={() => onItem(item.id)} className="text-sm font-semibold text-accent">
            {item.title}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => void apply([{ op: "todo.remove", id: todo.id }])}
        aria-label={`Remove ${todo.text}`}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-sunken"
      >
        <Icon name="close" className="size-4" />
      </button>
    </li>
  );
}

function AddTodo() {
  const { apply } = useTrip();
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        const r = await apply([{ op: "todo.add", todo: { id: newId("t"), text: t.slice(0, 300), done: false } }]);
        if (r.ok) setText("");
      }}
      className="mt-2 flex gap-2"
    >
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add to the list" aria-label="Add to the list" maxLength={300} className={field} />
      <button type="submit" disabled={!text.trim()} className={btn.secondary}>
        Add
      </button>
    </form>
  );
}

/** Marking something booked asks for the one detail worth having on the road. */
export function MarkBooked({ item, onClose }: { item: Item; onClose: () => void }) {
  const { apply, me } = useTrip();
  const [conf, setConf] = useState(item.booking?.confirmation ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open onClose={onClose} title={`Booked: ${item.title}`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await apply([
            { op: "item.update", id: item.id, set: { booking: { state: "booked", by: item.booking?.by ?? me, ...(conf.trim() ? { confirmation: conf.trim() } : {}) } } },
          ]);
          if (r.ok) onClose();
          else setError(r.error);
        }}
        className="flex flex-col gap-4 pt-1"
      >
        <label className="flex flex-col gap-1 text-sm font-semibold text-muted">
          Confirmation number (optional)
          <input data-autofocus value={conf} onChange={(e) => setConf(e.target.value)} maxLength={100} autoCapitalize="characters" className={`${field} tnum text-lg`} />
        </label>
        <p className="text-sm text-muted">It shows on the item and on Today, one tap to copy.</p>
        {error && <p className="text-base font-semibold text-danger">{error}</p>}
        <button type="submit" className={`${btn.primary} self-start`}>
          <Icon name="check" />
          Mark booked
        </button>
      </form>
    </Sheet>
  );
}
