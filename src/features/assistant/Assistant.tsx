"use client";

import { useChat } from "@ai-sdk/react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { newId } from "@/domain/ids";
import { directionsUrl, mapsSearchUrl, telUrl } from "@/domain/links";
import { formatDay, formatTime } from "@/domain/time";
import type { Op } from "@/domain/ops";
import type { Item } from "@/domain/types";
import { useView } from "@/client/router";
import { useTrip } from "@/client/store";
import type { ChangeResult, Option } from "@/server/ai/tools";
import { KindChip } from "@/ui/badges";
import { Icon, KIND_ICON } from "@/ui/Icon";
import { btn, field } from "@/ui/kit";
import { chatFor, newConversation, setAssistantContext, type AssistantMessage } from "./chat";
import { shrink } from "./images";

/**
 * The assistant: answers with real places and sources, changes the trip
 * with Undo, and asks before removing anything.
 */
export function Assistant({ first, itemId, day }: { first: string; itemId: string | null; day: string | null }) {
  const { tripId, online, refresh, trip } = useTrip();
  // The same conversation all session, until "New conversation" (which re-renders to pick up the new one).
  const [, setFresh] = useState(0);
  const chat = chatFor(tripId);
  const { messages, sendMessage, status, error, regenerate, stop, addToolOutput } = useChat<AssistantMessage>({ chat });
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const sent = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const focus = itemId ? trip.items.find((i) => i.id === itemId) : null;

  setAssistantContext(day, itemId);

  useEffect(() => {
    if (sent.current || !first.trim()) return;
    sent.current = true;
    void sendMessage({ text: first.trim() });
  }, [first, sendMessage]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  // The assistant changed the trip on the server: fetch it so the screens catch up.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const m of messages)
      for (const p of m.parts) {
        if (!("toolCallId" in p) || p.state !== "output-available" || seen.current.has(p.toolCallId)) continue;
        seen.current.add(p.toolCallId);
        const out = p.output as ChangeResult | undefined;
        if (out && typeof out === "object" && "entryId" in out) void refresh();
      }
  }, [messages, refresh]);

  async function attach(files: FileList | null) {
    const list = Array.from(files ?? []).slice(0, 4 - images.length);
    const urls = await Promise.all(list.map((f) => shrink(f)));
    setImages((cur) => [...cur, ...urls.filter((u): u is string => !!u)].slice(0, 4));
  }

  // Typed while an answer is still coming in: kept, and sent the moment it's done.
  const [queued, setQueued] = useState<{ text: string; images: string[] } | null>(null);
  useEffect(() => {
    if (busy || !queued) return;
    const q = queued;
    // The answer just finished streaming (outside React): send what was waiting.
    queueMicrotask(() => {
      setQueued(null);
      void sendMessage({ text: q.text || "Here's a screenshot.", files: q.images.map((url, i) => ({ type: "file" as const, mediaType: "image/jpeg", url, filename: `screenshot-${i + 1}.jpg` })) });
    });
  }, [busy, queued, sendMessage]);

  function send() {
    const text = input.trim();
    if (!text && !images.length) return;
    if (busy) {
      setQueued({ text, images });
      setInput("");
      setImages([]);
      return;
    }
    const waiting = messages.at(-1)?.parts.find((p) => p.type === "tool-ask_user" && p.state === "input-available");
    if (waiting && waiting.type === "tool-ask_user" && !images.length) {
      void addToolOutput({ tool: "ask_user", toolCallId: waiting.toolCallId, output: text });
    } else {
      void sendMessage({
        text: text || "Here's a screenshot.",
        files: images.map((url, i) => ({ type: "file" as const, mediaType: "image/jpeg", url, filename: `screenshot-${i + 1}.jpg` })),
      });
    }
    setInput("");
    setImages([]);
  }

  return (
    <div className="flex min-h-[50dvh] flex-col gap-4 pt-1">
      {focus && (
        <p className="flex items-center gap-2 rounded-xl bg-sunken px-3 py-2 text-sm">
          <Icon name={KIND_ICON[focus.kind]} className="size-4" />
          About <strong className="truncate">{focus.title}</strong>
        </p>
      )}
      {messages.length === 0 && !first && (
        <p className="text-base text-muted">Ask anything: where to eat tonight, how to get to the lake, what to pack, or paste a booking email or screenshot.</p>
      )}
      <div className="flex flex-col gap-4">
        {messages.map((m) => (
          <Message key={m.id} m={m} onAnswer={(toolCallId, output) => void addToolOutput({ tool: "ask_user", toolCallId, output })} />
        ))}
        {status === "submitted" && <p className="text-base text-muted">Thinking…</p>}
        {queued && (
          <div className="ml-10 flex flex-col items-end gap-1 self-end opacity-70">
            <p className="rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-base whitespace-pre-wrap text-on-accent">{queued.text}</p>
            <p className="text-sm text-muted">Sends when this answer finishes</p>
          </div>
        )}
        {error && (
          <div role="alert" className="flex flex-col gap-2 rounded-2xl bg-todo-soft p-3">
            <p className="text-base font-semibold text-todo">{online ? friendly(error.message) : "You're offline. The assistant needs a connection; your message is kept."}</p>
            <button type="button" onClick={() => void regenerate()} disabled={!online} className={`${btn.secondary} self-start`}>
              Try again
            </button>
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col gap-2 border-t border-line bg-surface px-4 pt-3 pb-1">
        {images.length > 0 && (
          <ul className="flex gap-2">
            {images.map((u, i) => (
              <li key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- in-memory screenshot */}
                <img src={u} alt={`Screenshot ${i + 1}`} className="size-14 rounded-lg object-cover" />
                <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label={`Remove screenshot ${i + 1}`} className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-ink text-canvas">
                  <Icon name="close" className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2"
        >
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void attach(e.target.files).then(() => (e.target.value = ""))} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={images.length >= 4} aria-label="Add a screenshot" className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-sunken">
            <Icon name="image" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
              if (files.length) {
                e.preventDefault();
                const dt = new DataTransfer();
                files.forEach((f) => dt.items.add(f));
                void attach(dt.files);
              }
            }}
            rows={Math.min(5, Math.max(1, input.split("\n").length))}
            placeholder={online ? "Ask or tell it what to change" : "Needs a connection"}
            aria-label="Message the assistant"
            data-autofocus
            maxLength={6000}
            className={`${field} min-w-0 flex-1 resize-none`}
          />
          {busy ? (
            <button type="button" onClick={() => void stop()} aria-label="Stop" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sunken">
              <span className="size-3 rounded-sm bg-ink" />
            </button>
          ) : (
            <button type="submit" disabled={!online || (!input.trim() && !images.length)} aria-label="Send" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent disabled:opacity-40">
              <Icon name="send" />
            </button>
          )}
        </form>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              newConversation(tripId);
              sent.current = true;
              setFresh((k) => k + 1);
            }}
            className="self-start text-sm font-semibold text-muted hover:text-ink"
          >
            New conversation
          </button>
        )}
      </div>
    </div>
  );
}

function friendly(message: string): string {
  try {
    const parsed = JSON.parse(message);
    if (parsed?.error) return String(parsed.error);
  } catch {
    // Plain text.
  }
  return message || "The assistant didn't answer. Try again.";
}

function Message({ m, onAnswer }: { m: AssistantMessage; onAnswer: (toolCallId: string, output: string) => void }) {
  if (m.role === "user") {
    const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    const pics = m.parts.filter((p) => p.type === "file");
    return (
      <div className="ml-10 flex flex-col items-end gap-1.5 self-end">
        {pics.length > 0 && (
          <div className="flex gap-1.5">
            {pics.map((p, i) =>
              p.type === "file" ? (
                // eslint-disable-next-line @next/next/no-img-element -- in-memory screenshot
                <img key={i} src={p.url} alt={`Screenshot ${i + 1}`} className="h-20 rounded-lg object-cover" />
              ) : null,
            )}
          </div>
        )}
        {text && <p className="rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-base whitespace-pre-wrap text-on-accent">{text}</p>}
      </div>
    );
  }

  const sources = m.parts.filter((p) => p.type === "source-url");
  return (
    <div className="mr-4 flex flex-col gap-3">
      {m.parts.map((p, i) => {
        const key = `${m.id}-${i}`;
        if (p.type === "text") return p.text.trim() ? <Prose key={key} text={p.text} /> : null;
        if (p.type === "tool-show_options") return p.input ? <Options key={key} heading={p.input.heading} options={(p.input.options ?? []) as Option[]} /> : null;
        if (p.type === "tool-ask_user") return <Question key={key} part={p} onAnswer={onAnswer} />;
        if (p.type === "tool-add_items" || p.type === "tool-update_items" || p.type === "tool-remove_items" || p.type === "tool-add_todos") {
          if (p.state === "output-available") return <ChangeCard key={key} result={p.output as ChangeResult} />;
          if (p.state === "output-error") return <p key={key} className="text-base text-danger">That change didn&apos;t work: {p.errorText}</p>;
          return (
            <p key={key} className="text-base text-muted">
              Updating the trip…
            </p>
          );
        }
        // Google's own tools aren't in our tool types: they arrive as provider-run parts.
        const t = p.type as string;
        if (t.startsWith("tool-google_") || t === "tool-url_context") {
          const what = t === "tool-google_maps" ? "Checking Google Maps…" : t === "tool-url_context" ? "Reading the link…" : "Searching Google…";
          return "state" in p && p.state !== "output-available" ? (
            <p key={key} className="text-sm text-muted">
              {what}
            </p>
          ) : null;
        }
        return null;
      })}
      {sources.length > 0 && <Sources sources={sources as { url: string; title?: string }[]} />}
    </div>
  );
}

/** Light formatting for the assistant's text: paragraphs, "- " lists, **bold**, links. */
function Prose({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2 text-base leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<strong key={m.index}>{m[1]}</strong>);
    else {
      const href = m[3] ?? m[4];
      out.push(
        <a key={m.index} href={href} target="_blank" rel="noreferrer" className="font-semibold text-accent underline underline-offset-2">
          {m[2] ?? href.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** Sources right under the answer, as Google's terms ask: "Google Maps" written exactly so, linked. */
function Sources({ sources }: { sources: { url: string; title?: string }[] }) {
  const unique = sources.filter((s, i, a) => a.findIndex((x) => x.url === s.url) === i).slice(0, 8);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {unique.map((s) => {
          const maps = /google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl/.test(s.url);
          return (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted underline underline-offset-2 hover:text-ink">
                {maps ? (
                  <>
                    <span translate="no" className="whitespace-nowrap">
                      Google Maps
                    </span>
                    {s.title && `: ${s.title}`}
                  </>
                ) : (
                  (s.title ?? new URL(s.url).hostname.replace(/^www\./, ""))
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Question({ part, onAnswer }: { part: Extract<AssistantMessage["parts"][number], { type: "tool-ask_user" }>; onAnswer: (id: string, o: string) => void }) {
  if (!part.input) return null;
  if (part.state === "output-available") {
    return (
      <p className="text-base">
        <span className="text-muted">{part.input.question}</span> {String(part.output)}
      </p>
    );
  }
  if (part.state !== "input-available") return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base font-semibold">{part.input.question}</p>
      <div className="flex flex-wrap gap-2">
        {(part.input.options ?? []).map((o) => (
          <button key={o} type="button" onClick={() => onAnswer(part.toolCallId, o!)} className={btn.secondary}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

const VERBS: Record<string, string> = { removed: "Remove", changed: "Change", moved: "Move", updated: "Update", added: "Add", marked: "Mark", renamed: "Rename", edited: "Edit", cleared: "Clear", put: "Put" };

/** "removed “X”" → "Remove “X”": a change that hasn't happened yet. */
export const asProposal = (s: string) => s.replace(/^(\w+)/, (v) => VERBS[v] ?? v.charAt(0).toUpperCase() + v.slice(1));

function ChangeCard({ result }: { result: ChangeResult }) {
  const { undo, tripId, trip } = useTrip();
  const { go } = useView(tripId);
  const [undone, setUndone] = useState(false);
  if (!result) return null;
  if ("error" in result) return <p className="text-base text-danger">That didn&apos;t work: {result.error}</p>;
  if (!result.ok) return <ConfirmCard pending={result} />;
  const items = result.itemIds.map((id) => trip.items.find((i) => i.id === id)).filter((i): i is Item => !!i);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 rounded-2xl bg-sunken p-3">
        <p className="flex items-start gap-2 text-base">
          <Icon name="check" className="mt-0.5 size-5 text-accent" />
          <span>{undone ? "Undone." : result.summary.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(". ")}</span>
        </p>
        {!undone && (
          <div className="flex flex-wrap gap-2 pl-7">
            {items.slice(0, 3).map((i) => (
              <button key={i.id} type="button" onClick={() => go({ tab: "item", itemId: i.id })} className="text-sm font-semibold text-accent underline underline-offset-2">
                {i.title}
              </button>
            ))}
            <button
              type="button"
              onClick={async () => {
                await undo(result.entryId);
                setUndone(true);
              }}
              className="text-sm font-semibold text-muted underline underline-offset-2"
            >
              Undo
            </button>
          </div>
        )}
      </div>
      {result.pending && <ConfirmCard pending={result.pending} />}
    </div>
  );
}

/** A change only a person can make: removing something, or moving something booked. */
export function ConfirmCard({ pending }: { pending: { message: string; ops: Op[]; summary: string[] } }) {
  const { apply } = useTrip();
  const [state, setState] = useState<"idle" | "confirmed" | "dismissed">("idle");
  if (state === "confirmed") return <p className="text-base font-semibold text-accent">Done.</p>;
  if (state === "dismissed") return <p className="text-base text-muted">Left as it was.</p>;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-todo bg-todo-soft p-4">
      <p className="text-base font-bold text-todo">{pending.message}</p>
      {pending.summary.length > 0 && (
        <ul className="list-disc pl-5 text-base">
          {pending.summary.map((s) => (
            <li key={s}>{asProposal(s)}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            const r = await apply(pending.ops, { confirmed: true });
            if (r.ok) setState("confirmed");
          }}
          className={btn.primary}
        >
          Confirm
        </button>
        <button type="button" onClick={() => setState("dismissed")} className={btn.secondary}>
          Keep it as is
        </button>
      </div>
    </div>
  );
}

/** Real places as cards: Maps, website, call, and one tap to put it on the trip. */
function Options({ heading, options }: { heading?: string; options: Option[] }) {
  const { apply, trip } = useTrip();
  const [added, setAdded] = useState<Record<string, string>>({});
  return (
    <div className="flex flex-col gap-2">
      {heading && <p className="text-base font-bold">{heading}</p>}
      <ul className="flex flex-col gap-2">
        {options.map((o) => {
          if (!o?.name) return null;
          const maps = o.mapsUrl ?? mapsSearchUrl([o.name, o.address ?? trip.destination].join(", "));
          return (
            <li key={o.name} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
              <div className="flex items-start gap-3">
                <KindChip kind={o.kind ?? "activity"} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-base leading-snug font-bold">{o.name}</p>
                  {o.why && <p className="text-base">{o.why}</p>}
                  <p className="text-sm text-muted">{[o.address, o.priceHint, o.date && `${formatDay(o.date)}${o.time ? `, ${formatTime(o.time)}` : ""}`].filter(Boolean).join(". ")}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-8">
                {added[o.name] ? (
                  <span className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-accent">
                    <Icon name="check" className="size-4" />
                    {added[o.name]}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      const item: Item = {
                        id: newId("i"),
                        kind: o.kind ?? "activity",
                        title: o.name.slice(0, 200),
                        ...(o.date ? { start: { date: o.date, ...(o.time ? { time: o.time } : {}) } } : {}),
                        place: { name: o.name, ...(o.address ? { address: o.address } : {}), ...(o.mapsUrl ? { mapsUrl: o.mapsUrl } : {}) },
                        ...(o.website || o.phone ? { contact: { ...(o.website ? { website: o.website } : {}), ...(o.phone ? { phone: o.phone } : {}) } } : {}),
                        ...(o.why ? { notes: o.why } : {}),
                      };
                      const r = await apply([{ op: "item.add", item }]);
                      if (r.ok) setAdded({ ...added, [o.name]: o.date ? `Added to ${formatDay(o.date)}` : "Saved to ideas" });
                    }}
                    className={`${btn.primary} min-h-10 px-3 text-sm`}
                  >
                    <Icon name="plus" className="size-4" />
                    {o.date ? `Add to ${formatDay(o.date)}` : "Save idea"}
                  </button>
                )}
                <a href={maps} target="_blank" rel="noreferrer" className={`${btn.secondary} min-h-10 px-3 text-sm`}>
                  <Icon name="pin" className="size-4" />
                  Maps
                </a>
                {o.address && (
                  <a href={directionsUrl({ address: o.address })!} target="_blank" rel="noreferrer" className={`${btn.secondary} min-h-10 px-3 text-sm`}>
                    <Icon name="directions" className="size-4" />
                    Go
                  </a>
                )}
                {o.website && (
                  <a href={o.website} target="_blank" rel="noreferrer" className={`${btn.secondary} min-h-10 px-3 text-sm`}>
                    <Icon name="globe" className="size-4" />
                    Website
                  </a>
                )}
                {o.phone && (
                  <a href={telUrl(o.phone)} className={`${btn.secondary} min-h-10 px-3 text-sm`}>
                    <Icon name="phone" className="size-4" />
                    Call
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
