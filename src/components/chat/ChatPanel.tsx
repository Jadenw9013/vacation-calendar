"use client";

import { useEffect, useRef, useState } from "react";
import type { Trip } from "@/data/types";
import { computeGaps, nightCoverage, unanswered } from "@/lib/derive";
import { formatDay } from "@/lib/time";
import { useEditor } from "@/components/edit/EditorProvider";
import { Activity } from "./Activity";
import { proposalsIn, useTripChat, type TripUIMessage } from "./ChatProvider";
import { ProposalCard } from "./ProposalCard";

interface Chip {
  label: string;
  /** Sent as-is, or put in the input when `prefill` is set. */
  text: string;
  prefill?: boolean;
}

/** Suggestions built from the trip as it is now, so they're never generic. */
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
  chips.push({ label: "Paste a confirmation", text: "Here's a booking confirmation:\n\n", prefill: true });
  return chips.slice(0, 4);
}

function errorText(error: Error): string {
  try {
    const parsed = JSON.parse(error.message);
    if (parsed?.error) return String(parsed.error);
  } catch {
    // not JSON
  }
  return error.message || "The planner didn't respond.";
}

function MessageView({ m, latestProposalId }: { m: TripUIMessage; latestProposalId: string | null }) {
  const { chat } = useTripChat();
  if (m.role === "user") {
    const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return (
      <div className="ml-8 self-end whitespace-pre-wrap bg-basalt px-3 py-2 text-sm text-ash">{text}</div>
    );
  }
  return (
    <div className="mr-4 flex flex-col gap-2 text-sm">
      {m.parts.map((p, i) => {
        const key = `${m.id}-${i}`;
        if (p.type === "text") return p.text.trim() ? <p key={key} className="whitespace-pre-wrap">{p.text}</p> : null;
        if (p.type === "tool-propose_changes") {
          if (p.state === "output-available") {
            return <ProposalCard key={key} toolCallId={p.toolCallId} proposal={p.output} latest={p.toolCallId === latestProposalId} />;
          }
          if (p.state === "output-error") return <p key={key} className="text-xs text-pumice">Couldn&apos;t draft that change: {p.errorText}</p>;
          return <p key={key} className="text-xs text-pumice">Drafting a change…</p>;
        }
        if (p.type === "tool-ask_user") {
          if (p.state === "input-streaming") return <p key={key} className="text-xs text-pumice">…</p>;
          if (p.state === "input-available") {
            return (
              <div key={key} className="flex flex-col gap-2">
                <p className="font-semibold">{p.input.question}</p>
                <div className="flex flex-wrap gap-2">
                  {p.input.options.map((o) => (
                    <button
                      key={o}
                      onClick={() => chat.addToolOutput({ tool: "ask_user", toolCallId: p.toolCallId, output: o })}
                      className="border-2 border-basalt px-3 py-1 font-semibold"
                    >
                      {o}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-pumice">Or type your own answer below.</p>
              </div>
            );
          }
          if (p.state === "output-available") {
            return (
              <p key={key}>
                <span className="font-semibold">{p.input.question}</span> <span className="text-pumice">→ {String(p.output)}</span>
              </p>
            );
          }
          return null;
        }
        return null;
      })}
    </div>
  );
}

export function ChatPanel({ trip }: { trip: Trip }) {
  const { available, open, setOpen, input, setInput, send, chat, inputRef, prefill } = useTripChat();
  const { author, openPicker } = useEditor();
  const [tab, setTab] = useState<"chat" | "activity">("chat");
  const endRef = useRef<HTMLDivElement>(null);
  const busy = chat.status === "submitted" || chat.status === "streaming";
  const latestProposalId = proposalsIn(chat.messages).at(-1)?.toolCallId ?? null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.messages, open]);

  /** Typing while a question is waiting answers it, rather than leaving it hanging. */
  function submit() {
    const t = input.trim();
    if (!t) return;
    if (!author) return openPicker();
    const last = chat.messages.at(-1);
    const waiting = last?.role === "assistant" ? last.parts.find((p) => p.type === "tool-ask_user" && p.state === "input-available") : undefined;
    if (waiting && waiting.type === "tool-ask_user") {
      chat.addToolOutput({ tool: "ask_user", toolCallId: waiting.toolCallId, output: t });
      setInput("");
      return;
    }
    send(t);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-30 flex items-center gap-2 bg-basalt px-4 py-3 font-bold text-ash shadow-lg"
      >
        <span aria-hidden className="inline-block size-2.5 bg-hazard" />
        Ask the planner
      </button>
    );
  }

  return (
    <aside
      aria-label="Trip planner chat"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[82dvh] flex-col border-t-2 border-basalt bg-ash shadow-2xl md:inset-y-0 md:left-auto md:h-dvh md:w-[26rem] md:border-t-0 md:border-l-2"
    >
      <header className="flex items-center gap-3 border-b border-scree px-4 py-2">
        <h2 className="wide text-xl">Planner</h2>
        <nav className="flex gap-3 text-sm" aria-label="Panel">
          {(["chat", "activity"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={tab === t ? "font-bold underline decoration-2 underline-offset-4" : "text-pumice"}
            >
              {t === "chat" ? "Chat" : "Activity"}
            </button>
          ))}
        </nav>
        <button onClick={() => setOpen(false)} aria-label="Close planner" className="ml-auto px-2 text-lg font-bold">
          ✕
        </button>
      </header>

      {tab === "activity" ? (
        <Activity />
      ) : (
        <>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            {!available && (
              <p className="hazard-label p-3 text-sm">
                The planner isn&apos;t set up yet (no Gemini key), or it&apos;s down. Everything else on the page still works:
                use + Add item and the Edit links.
              </p>
            )}
            {available && chat.messages.length === 0 && (
              <p className="text-sm text-pumice">
                Ask about the trip, or tell it what changed (&ldquo;Sam booked the Antigua hotel for Nov 28&rdquo;). It drafts the
                change as a card, and nothing happens until someone taps Apply. Paste booking emails as they are; confirmation
                and phone numbers are left out automatically.
              </p>
            )}
            {chat.messages.map((m) => (
              <MessageView key={m.id} m={m} latestProposalId={latestProposalId} />
            ))}
            {chat.status === "submitted" && <p className="text-xs text-pumice">Thinking…</p>}
            {chat.error && (
              <div className="hazard-label p-3 text-sm">
                <p className="font-semibold">{errorText(chat.error)}</p>
                <button onClick={() => chat.regenerate()} className="mt-1 underline underline-offset-2">
                  Try again
                </button>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-scree px-4 pt-2 pb-3">
            {available && !busy && (
              <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
                {suggestionChips(trip).map((c) => (
                  <button
                    key={c.label}
                    onClick={() => (c.prefill ? prefill(c.text) : author ? send(c.text) : openPicker())}
                    className="shrink-0 border border-basalt bg-card px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={2}
                maxLength={6000}
                disabled={!available}
                placeholder={available ? "Ask or tell the planner…" : "Planner unavailable"}
                aria-label="Message"
                className="min-h-11 flex-1 resize-none border-2 border-basalt bg-card px-2 py-1.5 text-base disabled:opacity-50"
              />
              {busy ? (
                <button type="button" onClick={() => chat.stop()} className="border-2 border-basalt px-3 py-2 font-bold">
                  Stop
                </button>
              ) : (
                <button type="submit" disabled={!available || !input.trim()} className="bg-basalt px-3 py-2 font-bold text-ash disabled:opacity-40">
                  Send
                </button>
              )}
            </form>
          </div>
        </>
      )}
    </aside>
  );
}
