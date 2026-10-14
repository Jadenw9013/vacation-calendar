"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Trip } from "@/data/types";
import { computeGaps, nightCoverage, unanswered } from "@/lib/derive";
import { formatDay } from "@/lib/time";
import { useEditor } from "@/components/edit/EditorProvider";
import { Activity } from "./Activity";
import { proposalsIn, useTripChat, type TripUIMessage } from "./ChatProvider";
import { ProposalCard } from "./ProposalCard";
import { QuickAdd, type ManualPrefill } from "@/components/quickadd/QuickAdd";
import { missingPrompt, parseQuickAdd } from "@/lib/quickadd";
import { Icon } from "@/components/ui/Icon";

interface Chip {
  label: string;
  text: string;
  prefill?: boolean;
}

function suggestionChips(trip: Trip): Chip[] {
  const chips: Chip[] = [];
  const firstNoBed = nightCoverage(trip).find((n) => !n.booked);
  if (firstNoBed) {
    const day = formatDay(firstNoBed.date);
    chips.push({ label: `Fix the ${day} night`, text: `Help me sort out where we sleep the night of ${day}.` });
  }
  const gaps = computeGaps(trip);
  if (gaps.length) chips.push({ label: "What's still unbooked?", text: "What's still unbooked?" });
  const q = unanswered(trip)[0];
  if (q) chips.push({ label: `Decide: ${q.question.split(/[:?]/)[0]}`, text: `Help me decide: ${q.question}` });
  chips.push({ label: "Paste confirmation", text: "Here's a booking confirmation:\n\n", prefill: true });
  return chips.slice(0, 4);
}

/** An assistant turn with no text and no tool call: Gemini occasionally returns nothing. */
function isEmptyAnswer(m: TripUIMessage | undefined): boolean {
  if (!m || m.role !== "assistant") return false;
  return !m.parts.some((p) => (p.type === "text" && p.text.trim()) || p.type.startsWith("tool-"));
}

function errorText(error: Error): string {
  try {
    const parsed = JSON.parse(error.message);
    if (parsed?.error) return String(parsed.error);
  } catch {
    // not JSON
  }
  return error.message || "The assistant didn't respond.";
}

function MessageView({ m, latestProposalId, trip, said }: { m: TripUIMessage; latestProposalId: string | null; trip: Trip; said?: string }) {
  const { chat } = useTripChat();
  if (m.role === "user") {
    const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    const images = m.parts.filter((p) => p.type === "file" && p.mediaType.startsWith("image/"));
    return (
      <div className="ml-8 flex flex-col items-end gap-1.5 self-end">
        {images.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {images.map((p, i) =>
              p.type === "file" ? (
                // eslint-disable-next-line @next/next/no-img-element -- in-memory data URL, never stored or optimized
                <img key={i} src={p.url} alt={`Screenshot ${i + 1}`} className="h-20 w-auto rounded-lg border border-line object-cover" />
              ) : null,
            )}
          </div>
        )}
        {text && (
          <div className="rounded-2xl rounded-tr-sm bg-ink px-4 py-2.5 text-base text-canvas whitespace-pre-wrap">
            {text}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="mr-4 flex flex-col gap-2.5 text-base">
      {m.parts.map((p, i) => {
        const key = `${m.id}-${i}`;
        if (p.type === "text") {
          return p.text.trim() ? (
            <div key={key} className="rounded-2xl rounded-tl-sm border border-line bg-canvas px-4 py-2.5 whitespace-pre-wrap">
              {p.text}
            </div>
          ) : null;
        }
        if (p.type === "tool-propose_changes") {
          if (p.state === "output-available") {
            return (
              <ProposalCard key={key} toolCallId={p.toolCallId} proposal={p.output} latest={p.toolCallId === latestProposalId} trip={trip} said={said} />
            );
          }
          if (p.state === "output-error") {
            return (
              <div key={key} className="rounded-xl border-2 border-action bg-action-soft p-3 text-base">
                Couldn&apos;t draft that change: {p.errorText}
              </div>
            );
          }
          return (
            <div key={key} className="flex items-center gap-2 py-1 text-base text-muted">
              <span className="size-2 animate-pulse rounded-full bg-now" />
              <span>Drafting a trip change…</span>
            </div>
          );
        }
        if (p.type === "tool-ask_user") {
          if (p.state === "input-streaming") return <p key={key} className="text-base text-muted">Thinking…</p>;
          if (p.state === "input-available") {
            return (
              <div key={key} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
                <p className="font-semibold">{p.input.question}</p>
                <div className="flex flex-wrap gap-2">
                  {p.input.options.map((o) => (
                    <button
                      key={o}
                      onClick={() => chat.addToolOutput({ tool: "ask_user", toolCallId: p.toolCallId, output: o })}
                      className="min-h-11 rounded-xl border border-line px-4 text-base font-semibold hover:bg-sunken"
                    >
                      {o}
                    </button>
                  ))}
                </div>
                <p className="text-base text-muted">Or type your own answer below.</p>
              </div>
            );
          }
          if (p.state === "output-available") {
            return (
              <div key={key} className="rounded-xl border border-line bg-canvas px-3 py-2 text-base">
                <span className="font-semibold">{p.input.question}</span> <span className="text-muted">→ {String(p.output)}</span>
              </div>
            );
          }
          return null;
        }
        return null;
      })}
    </div>
  );
}

/** First thing in an empty chat: what the planner can do. */
function Greeting() {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-36 overflow-hidden rounded-2xl bg-sunken">
        {/* The photo has a frame painted round its edge; the zoom crops it off. */}
        <Image
          src="/antigua-hotel.jpg"
          alt="Calle del Arco in Antigua, with the yellow Santa Catalina Arch and Volcán de Agua behind it"
          fill
          sizes="(max-width: 768px) 100vw, 448px"
          className="scale-110 object-cover"
        />
      </div>
      <div className="rounded-2xl rounded-tl-sm border border-line bg-canvas px-4 py-3 text-base">
      Ask anything about the trip, paste a booking confirmation, or have me draft a day&apos;s plan. I&apos;ll propose changes; nothing is
      saved until you apply it.
      </div>
    </div>
  );
}

/** Plain text of a user message. */
function userText(m: TripUIMessage): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim();
}

export function ChatPanel({
  trip,
  online,
  nowMs,
  onManual,
}: {
  trip: Trip;
  online: boolean;
  nowMs: number;
  /** Open the full add form (the chat closes first: one sheet at a time). */
  onManual: (prefill: ManualPrefill) => void;
}) {
  const { available, setOpen, input, setInput, send, chat, inputRef, prefill, vision, attachments, addImages, removeAttachment, attachError, day, focus, clearFocus } =
    useTripChat();
  const [quick, setQuick] = useState({ key: 0, text: "" });
  const lastUser = [...chat.messages].reverse().find((m) => m.role === "user");
  const lastSaid = lastUser ? userText(lastUser) : "";
  // When the planner can't help, say what's missing in a few words and offer Quick add with their text.
  const lastParse = lastSaid ? parseQuickAdd(lastSaid, { trip, nowMs, selectedDay: day }) : null;
  const missingHint = lastParse?.type === "draft" && lastParse.missing.length ? missingPrompt(lastParse.missing) : null;
  function quickAddFromChat() {
    setQuick((q) => ({ key: q.key + 1, text: lastSaid }));
    scrollRef.current?.scrollTo({ top: 0 });
  }
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { author, openPicker } = useEditor();
  const [tab, setTab] = useState<"chat" | "activity">("chat");
  const endRef = useRef<HTMLDivElement>(null);
  const busy = chat.status === "submitted" || chat.status === "streaming";
  const latestProposalId = proposalsIn(chat.messages).at(-1)?.toolCallId ?? null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.messages]);
  const usable = available && online;

  function submit() {
    const t = input.trim();
    if (!t && !attachments.length) return;
    if (!author) return openPicker();
    const last = chat.messages.at(-1);
    const waiting = last?.role === "assistant" ? last.parts.find((p) => p.type === "tool-ask_user" && p.state === "input-available") : undefined;
    if (waiting && waiting.type === "tool-ask_user" && !attachments.length) {
      chat.addToolOutput({ tool: "ask_user", toolCallId: waiting.toolCallId, output: t });
      setInput("");
      return;
    }
    send(t);
  }

  return (
    <aside aria-label="Ask the planner" className="flex h-full w-full flex-col overflow-hidden bg-surface">
      <header className="flex items-center gap-2 border-b border-line py-1.5 pr-1.5 pl-4">
        <h2 className="mr-auto min-w-0 truncate text-lg font-bold">
          <span className="sm:hidden">Planner</span>
          <span className="hidden sm:inline">Ask the planner</span>
        </h2>
        <nav className="flex shrink-0 gap-2" aria-label="Planner views">
          {(["chat", "activity"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-current={tab === t ? "page" : undefined}
              className={`min-h-11 rounded-xl px-3 text-base font-semibold ${tab === t ? "bg-ink text-canvas" : "text-muted hover:bg-sunken"}`}
            >
              {t === "chat" ? "Chat" : "Activity"}
            </button>
          ))}
        </nav>
        <button onClick={() => setOpen(false)} aria-label="Close the planner" className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-sunken">
          <Icon name="close" />
        </button>
      </header>

      {tab === "activity" ? (
        <Activity />
      ) : (
        <>
          <div ref={scrollRef} className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            <QuickAdd
              key={quick.key}
              initial={quick.text}
              trip={trip}
              nowMs={nowMs}
              selectedDay={day}
              online={online}
              chatAvailable={available}
              onAsk={(t) => (author ? send(t) : setInput(t))}
              onManual={onManual}
            />
            {!online && (
              <p className="flex items-start gap-2 rounded-xl border-2 border-line p-3 text-base" role="status">
                <Icon name="offline" className="mt-0.5 shrink-0" />
                You&apos;re offline. The planner needs a connection; your trip is still here in Trip mode.
              </p>
            )}
            {online && !available && (
              <p className="rounded-xl border-2 border-action bg-action-soft p-3 text-base">
                The planner isn&apos;t set up on this site yet (it needs a <code>GEMINI_API_KEY</code>). Manual editing still works.
              </p>
            )}

            {chat.messages.length === 0 && <Greeting />}

            {chat.messages.map((m, i) => {
              const prior = chat.messages.slice(0, i).reverse().find((x) => x.role === "user");
              return <MessageView key={m.id} m={m} latestProposalId={latestProposalId} trip={trip} said={prior ? userText(prior) : undefined} />;
            })}

            {chat.status === "submitted" && (
              <div className="flex items-center gap-2 py-1 text-base text-muted">
                <span className="size-2 animate-pulse rounded-full bg-now" />
                <span>Thinking…</span>
              </div>
            )}

            {!chat.error && chat.status === "ready" && isEmptyAnswer(chat.messages.at(-1)) && (
              <SoftFailure
                headline={missingHint ?? "No answer came back from the planner."}
                online={online}
                onRetry={() => chat.regenerate()}
                onQuickAdd={lastSaid ? quickAddFromChat : undefined}
              />
            )}

            {chat.error && (
              <SoftFailure
                headline={online ? (missingHint ?? errorText(chat.error)) : "That didn't send: you're offline. Your message is kept."}
                online={online}
                onRetry={() => chat.regenerate()}
                onQuickAdd={lastSaid ? quickAddFromChat : undefined}
              />
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-line p-3">
            {usable && !busy && (
              <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
                {suggestionChips(trip).map((c) => (
                  <button
                    key={c.label}
                    onClick={() => (c.prefill ? prefill(c.text) : author ? send(c.text) : openPicker())}
                    className="min-h-11 shrink-0 rounded-full border border-line px-4 text-base font-medium whitespace-nowrap hover:bg-sunken"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {vision && attachments.length > 0 && (
              <ul className="mb-3 flex flex-wrap gap-3" aria-label="Screenshots to send">
                {attachments.map((a, i) => (
                  <li key={a.id} className="flex items-center gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data URL, never stored or optimized */}
                    <img src={a.part.url} alt={`Screenshot ${i + 1} to send`} className="size-14 rounded-lg border border-line object-cover" />
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      aria-label={`Remove screenshot ${i + 1}`}
                      className="flex size-11 items-center justify-center rounded-xl hover:bg-sunken"
                    >
                      <Icon name="close" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {attachError && <p className="mb-2 text-base font-medium text-action">{attachError}</p>}
            {focus && (
              <p className="mb-2 flex items-center gap-2 rounded-xl bg-sunken py-0.5 pr-0.5 pl-3 text-base">
                <span className="min-w-0 flex-1 truncate">
                  About: <strong>{focus.title}</strong>
                </span>
                <button type="button" onClick={clearFocus} aria-label={`Stop asking about ${focus.title}`} className="flex size-11 shrink-0 items-center justify-center rounded-xl">
                  <Icon name="close" />
                </button>
              </p>
            )}
            {available && !vision && (
              <p className="mb-2 text-base text-muted">Screenshots are off: the planner is on a text-only model right now. Paste the confirmation text instead.</p>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="flex items-center gap-2 rounded-2xl border border-line bg-canvas p-1 focus-within:border-now"
            >
              {vision && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                      void addImages(Array.from(e.target.files ?? []));
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={!usable || busy || attachments.length >= 4}
                    aria-label="Attach booking screenshots"
                    title="Attach booking screenshots (up to 4)"
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ink hover:bg-sunken disabled:opacity-50"
                  >
                    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                  </button>
                </>
              )}
              <input
                ref={inputRef as React.Ref<HTMLInputElement>}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  if (!vision) return;
                  const images = Array.from(e.clipboardData.items)
                    .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
                    .map((it) => it.getAsFile())
                    .filter((f): f is File => !!f);
                  if (images.length) {
                    e.preventDefault();
                    void addImages(images);
                  }
                }}
                maxLength={6000}
                disabled={!usable}
                placeholder={!online ? "Needs a connection" : available ? "Ask anything about the trip…" : "Planner unavailable"}
                aria-label="Message"
                className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-muted disabled:opacity-60"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => chat.stop()}
                  aria-label="Stop"
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sunken font-bold"
                >
                  ■
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!usable || (!input.trim() && !attachments.length)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink text-canvas disabled:opacity-40"
                  aria-label="Send message"
                >
                  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              )}
            </form>
          </div>
        </>
      )}
    </aside>
  );
}

/** Never a dead end: what's missing, Try again, and Quick add with their words already in it. */
function SoftFailure({ headline, online, onRetry, onQuickAdd }: { headline: string; online: boolean; onRetry: () => void; onQuickAdd?: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl border-2 border-action bg-action-soft p-3 text-base">
      <p className="font-semibold">{headline}</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={onRetry} disabled={!online} className="min-h-11 rounded-xl border border-line bg-surface px-4 font-semibold disabled:opacity-60">
          Try again
        </button>
        {onQuickAdd && (
          <button onClick={onQuickAdd} className="min-h-11 rounded-xl border border-line bg-surface px-4 font-semibold">
            Add it with Quick add
          </button>
        )}
      </div>
    </div>
  );
}
