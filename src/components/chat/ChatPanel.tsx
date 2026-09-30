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

function MessageView({ m, latestProposalId }: { m: TripUIMessage; latestProposalId: string | null }) {
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
                <img key={i} src={p.url} alt={`Screenshot ${i + 1}`} className="h-20 w-auto rounded-lg border border-stone-border object-cover shadow-xs" />
              ) : null,
            )}
          </div>
        )}
        {text && (
          <div className="rounded-2xl rounded-tr-xs bg-volcano px-3.5 py-2.5 text-sm text-white shadow-xs whitespace-pre-wrap">
            {text}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="mr-4 flex flex-col gap-2.5 text-sm">
      {m.parts.map((p, i) => {
        const key = `${m.id}-${i}`;
        if (p.type === "text") {
          return p.text.trim() ? (
            <div key={key} className="rounded-2xl rounded-tl-xs bg-stone-light border border-stone-border/80 px-3.5 py-2.5 text-volcano shadow-xs whitespace-pre-wrap">
              {p.text}
            </div>
          ) : null;
        }
        if (p.type === "tool-propose_changes") {
          if (p.state === "output-available") {
            return <ProposalCard key={key} toolCallId={p.toolCallId} proposal={p.output} latest={p.toolCallId === latestProposalId} />;
          }
          if (p.state === "output-error") {
            return (
              <div key={key} className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                Couldn&apos;t draft that change: {p.errorText}
              </div>
            );
          }
          return (
            <div key={key} className="flex items-center gap-2 text-xs text-gray-500 py-1">
              <span className="size-2 rounded-full bg-lake animate-ping" />
              <span>Drafting a trip change…</span>
            </div>
          );
        }
        if (p.type === "tool-ask_user") {
          if (p.state === "input-streaming") return <p key={key} className="text-xs text-gray-400">Thinking…</p>;
          if (p.state === "input-available") {
            return (
              <div key={key} className="rounded-2xl border border-stone-border bg-white p-3.5 shadow-xs flex flex-col gap-2.5">
                <p className="font-semibold text-volcano">{p.input.question}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.input.options.map((o) => (
                    <button
                      key={o}
                      onClick={() => chat.addToolOutput({ tool: "ask_user", toolCallId: p.toolCallId, output: o })}
                      className="rounded-lg border border-stone-border bg-stone-light/50 px-3 py-1 text-xs font-semibold text-volcano hover:bg-stone-border/50 transition-colors"
                    >
                      {o}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400">Or type your own answer below.</p>
              </div>
            );
          }
          if (p.state === "output-available") {
            return (
              <div key={key} className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-xs">
                <span className="font-semibold text-gray-800">{p.input.question}</span>{" "}
                <span className="text-lake font-medium">→ {String(p.output)}</span>
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

/** Featured mockup hotel card when chat is opened */
function InitialAssistantGreeting({ onOptionClick }: { onOptionClick: (text: string) => void }) {
  const [activeSlide, setActiveSlide] = useState(0);

  return (
    <div className="flex flex-col gap-3">
      {/* Assistant bubble */}
      <div className="rounded-2xl rounded-tl-xs bg-stone-light border border-stone-border/80 px-3.5 py-2.5 text-sm text-volcano shadow-xs leading-relaxed">
        Here are a few options to book a hotel in Guatemala City for Nov 24. Want me to add one to the plan?
      </div>

      {/* Featured hotel card from the design spec */}
      <div className="overflow-hidden rounded-2xl border border-stone-border bg-white shadow-xs">
        <div className="relative h-36 w-full bg-gray-100">
          <Image
            src="/antigua-hotel.jpg"
            alt="Hotel Las Farolas in Antigua Guatemala"
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 360px"
          />
        </div>

        <div className="p-3.5 flex flex-col gap-2">
          <div>
            <h4 className="font-serif font-bold text-volcano text-base">Hotel Las Farolas</h4>
            <p className="text-xs text-gray-500">Guatemala City</p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-md bg-stone-light px-2 py-0.5 text-[11px] font-medium text-gray-600">
              Good location
            </span>
            <span className="rounded-md bg-stone-light px-2 py-0.5 text-[11px] font-medium text-gray-600">
              Free cancellation
            </span>
          </div>

          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={() => onOptionClick("Book Hotel Las Farolas for Nov 24")}
              className="rounded-lg bg-lake px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-lake-hover transition-colors"
            >
              Apply
            </button>
            <button
              onClick={() => onOptionClick("Show other hotel options for Nov 24")}
              className="rounded-lg border border-stone-border bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 transition-colors"
            >
              Discard
            </button>
            <button
              onClick={() => onOptionClick("Tweak this hotel suggestion")}
              className="rounded-lg border border-stone-border bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 transition-colors"
            >
              Tweak
            </button>
          </div>

          {/* Carousel dots */}
          <div className="flex items-center justify-center gap-1.5 pt-1">
            {[0, 1, 2, 3].map((idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveSlide(idx)}
                className={`size-1.5 rounded-full transition-all ${
                  activeSlide === idx ? "bg-lake w-3" : "bg-gray-300"
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatPanel({ trip }: { trip: Trip }) {
  const { available, open, setOpen, input, setInput, send, chat, inputRef, prefill, vision, attachments, addImages, removeAttachment, attachError } =
    useTripChat();
  const fileRef = useRef<HTMLInputElement>(null);
  const { author, openPicker } = useEditor();
  const [tab, setTab] = useState<"chat" | "activity">("chat");
  const endRef = useRef<HTMLDivElement>(null);
  const busy = chat.status === "submitted" || chat.status === "streaming";
  const latestProposalId = proposalsIn(chat.messages).at(-1)?.toolCallId ?? null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.messages, open]);

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

  function handleCardOptionClick(text: string) {
    if (!author) {
      openPicker();
      return;
    }
    send(text);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-5 bottom-5 z-40 flex items-center gap-2.5 rounded-full bg-night px-4 py-3 font-semibold text-white shadow-xl hover:bg-night-card transition-all lg:hidden"
      >
        <span className="flex size-2 rounded-full bg-emerald-400" />
        <span className="text-sm">Trip Assistant</span>
      </button>
    );
  }

  return (
    <aside
      aria-label="Trip Assistant"
      className="flex flex-col h-full w-full rounded-2xl border border-stone-border bg-white shadow-xl overflow-hidden"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-stone-border/80 px-4 py-3.5 bg-white">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-full bg-night text-white">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 19L9 7L13 14L16 9L21 19H3Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h2 className="font-serif font-bold text-volcano text-base leading-tight">Trip Assistant</h2>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Online</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <nav className="flex gap-2 text-xs font-medium" aria-label="Assistant modes">
            <button
              onClick={() => setTab("chat")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                tab === "chat" ? "bg-stone-light font-semibold text-volcano" : "text-gray-400 hover:text-gray-700"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setTab("activity")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                tab === "activity" ? "bg-stone-light font-semibold text-volcano" : "text-gray-400 hover:text-gray-700"
              }`}
            >
              Activity
            </button>
          </nav>

          <button
            onClick={() => setOpen(false)}
            aria-label="Close assistant"
            className="flex size-7 items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>
      </header>

      {tab === "activity" ? (
        <Activity />
      ) : (
        <>
          {/* Messages scroll area */}
          <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-4 bg-stone-light/30">
            {!available && (
              <div className="rounded-xl border border-maya-border bg-maya-light p-3 text-xs text-maya font-medium">
                The Gemini AI assistant requires a <code className="font-mono">GEMINI_API_KEY</code> set in your environment. You can still use manual edits and all features!
              </div>
            )}

            {/* If no chat messages have been sent yet, show the featured initial card matching the mockup */}
            {chat.messages.length === 0 && (
              <InitialAssistantGreeting onOptionClick={handleCardOptionClick} />
            )}

            {chat.messages.map((m) => (
              <MessageView key={m.id} m={m} latestProposalId={latestProposalId} />
            ))}

            {chat.status === "submitted" && (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
                <span className="size-1.5 rounded-full bg-lake animate-ping" />
                <span>Thinking…</span>
              </div>
            )}

            {!chat.error && chat.status === "ready" && isEmptyAnswer(chat.messages.at(-1)) && (
              <div className="rounded-xl border border-maya-border bg-maya-light p-3 text-xs text-maya">
                <p className="font-semibold">No answer came back from the assistant.</p>
                <button onClick={() => chat.regenerate()} className="mt-1 font-medium underline">
                  Try again
                </button>
              </div>
            )}

            {chat.error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <p className="font-semibold">{errorText(chat.error)}</p>
                <button onClick={() => chat.regenerate()} className="mt-1 font-medium underline">
                  Try again
                </button>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Bottom input area */}
          <div className="border-t border-stone-border/80 bg-white p-3">
            {available && !busy && (
              <div className="-mx-1 mb-2.5 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {suggestionChips(trip).map((c) => (
                  <button
                    key={c.label}
                    onClick={() => (c.prefill ? prefill(c.text) : author ? send(c.text) : openPicker())}
                    className="shrink-0 rounded-full border border-stone-border bg-stone-light/60 px-3 py-1 text-[11px] font-medium text-gray-700 hover:bg-stone-border/60 hover:text-volcano transition-colors whitespace-nowrap"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {vision && attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2" aria-label="Screenshots to send">
                {attachments.map((a, i) => (
                  <div key={a.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data URL, never stored or optimized */}
                    <img src={a.part.url} alt={`Screenshot ${i + 1} to send`} className="size-14 rounded-lg border border-stone-border object-cover" />
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      aria-label={`Remove screenshot ${i + 1}`}
                      className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-volcano text-[10px] font-bold text-white shadow-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {attachError && <p className="mb-2 text-[11px] font-medium text-maya">{attachError}</p>}
            {available && !vision && (
              <p className="mb-2 text-[11px] text-gray-400">
                Screenshots are off: the assistant is on a text-only model right now. Paste the confirmation text instead.
              </p>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="flex items-center gap-2 rounded-full border border-stone-border bg-stone-light/40 px-3 py-1.5 focus-within:border-lake focus-within:bg-white focus-within:ring-2 focus-within:ring-lake/20 transition-all"
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
                    disabled={!available || busy || attachments.length >= 4}
                    aria-label="Attach booking screenshots"
                    title="Attach booking screenshots (up to 4)"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-stone-border/60 hover:text-volcano disabled:opacity-40 transition-colors"
                  >
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                disabled={!available}
                placeholder={available ? "Ask anything about the trip…" : "Assistant unavailable"}
                aria-label="Message"
                className="flex-1 bg-transparent px-2 py-1 text-sm outline-none text-volcano placeholder:text-gray-400 disabled:opacity-50"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => chat.stop()}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-300"
                >
                  ■
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!available || (!input.trim() && !attachments.length)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-lake text-white shadow-xs hover:bg-lake-hover disabled:opacity-40 transition-colors"
                  aria-label="Send message"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
