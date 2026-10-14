"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type InferUITools, type UIDataTypes, type UIMessage } from "ai";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Proposal } from "@/lib/chat/proposal";
import type { ChatTools, ProposalOutcome } from "@/lib/chat/setup";
import { useEditor } from "@/components/edit/EditorProvider";
import { compressImage, MAX_IMAGES } from "@/lib/images";

export type TripUIMessage = UIMessage<unknown, UIDataTypes, InferUITools<ChatTools>>;

export interface PendingProposal {
  toolCallId: string;
  proposal: Proposal;
}

export interface Attachment {
  id: string;
  part: FileUIPart;
}

interface ChatApi {
  available: boolean;
  /** The active model can read images. False on a text-only fallback: the upload control hides. */
  vision: boolean;
  /** Screenshots waiting to go with the next message. Browser memory only. */
  attachments: Attachment[];
  addImages: (files: Blob[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  attachError: string | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  input: string;
  setInput: (text: string) => void;
  /** Opens the chat with the input prefilled (Tweak, Ask about this, chips). */
  prefill: (text: string) => void;
  send: (text: string, customAuthor?: string) => void;
  chat: ReturnType<typeof useChat<TripUIMessage>>;
  outcomes: Record<string, ProposalOutcome>;
  setOutcome: (toolCallId: string, outcome: ProposalOutcome) => void;
  /** Latest proposal nobody has applied or discarded: drives the ghost preview. */
  pending: PendingProposal | null;
  /** Segment ids to flash briefly after an apply. */
  highlight: Set<string>;
  flash: (ids: string[]) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  /** The day on screen in Trip mode, sent so "today" and "this afternoon" mean the right thing. */
  day: string | null;
  setDay: (day: string | null) => void;
  /** The item someone tapped Ask on: attached to every message until removed. */
  focus: ChatFocus | null;
  askAbout: (item: ChatFocus) => void;
  clearFocus: () => void;
  /** Forget the conversation on this device. */
  clearChat: () => void;
  /** Only with DEBUG_TIMING=1: client-side timings for the last message. */
  timing: { feedbackMs?: number; cardMs?: number; answerMs?: number } | null;
}

export interface ChatFocus {
  id: string;
  title: string;
}

const ChatContext = createContext<ChatApi | null>(null);

export function useTripChat(): ChatApi {
  const c = useContext(ChatContext);
  if (!c) throw new Error("useTripChat outside ChatProvider");
  return c;
}

/** Proposal parts across the conversation, oldest first. */
export function proposalsIn(messages: TripUIMessage[]): PendingProposal[] {
  const out: PendingProposal[] = [];
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === "tool-propose_changes" && p.state === "output-available") {
        out.push({ toolCallId: p.toolCallId, proposal: p.output as Proposal });
      }
    }
  }
  return out;
}

/** Only resubmit on its own after the person answers an ask_user question. */
function answeredAskUser({ messages }: { messages: TripUIMessage[] }): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return false;
  const lastTool = [...last.parts].reverse().find((p) => p.type.startsWith("tool-"));
  return lastTool?.type === "tool-ask_user" && lastTool.state === "output-available";
}

/**
 * Extra fields sent with every chat request. Read at send time, so it lives
 * outside React and an effect keeps it current. One chat per page.
 */
const requestContext = {
  author: "",
  outcomes: {} as Record<string, ProposalOutcome>,
  context: {} as { day?: string; itemId?: string },
};

export function setChatAuthor(author: string) {
  requestContext.author = author;
}

/**
 * Screenshots go to the model once, with the message they're attached to.
 * On later turns they're swapped for a short note so they aren't uploaded
 * again (the server does the same, in case a client doesn't).
 */
export function withoutOldImages(messages: TripUIMessage[]): TripUIMessage[] {
  const lastUser = messages.findLastIndex((m) => m.role === "user");
  return messages.map((m, i) => {
    if (m.role !== "user" || i === lastUser) return m;
    const images = m.parts.filter((p) => p.type === "file").length;
    if (!images) return m;
    const note = `[${images} screenshot${images > 1 ? "s" : ""} shared earlier; already read, not resent]`;
    return { ...m, parts: [...m.parts.filter((p) => p.type !== "file"), { type: "text", text: note }] };
  });
}

interface ClientTiming {
  sentAt?: number;
  feedbackMs?: number;
  cardMs?: number;
  answerMs?: number;
}

const CHAT_KEY = "trip-chat-v1";
const DRAFT_KEY = "trip-chat-draft";

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full: the conversation just isn't kept.
  }
}

/** Screenshots aren't kept on the device: a note stands in for them. */
function withoutImages(messages: TripUIMessage[]): TripUIMessage[] {
  return messages.map((m) => {
    const n = m.parts.filter((p) => p.type === "file").length;
    if (!n) return m;
    return { ...m, parts: [...m.parts.filter((p) => p.type !== "file"), { type: "text" as const, text: `[${n} screenshot${n > 1 ? "s" : ""} sent]` }] };
  });
}

const transport = new DefaultChatTransport<TripUIMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages, body }) => {
    const localAuthor = typeof window !== "undefined" ? localStorage.getItem("trip-author") || "" : "";
    return {
      body: {
        // Per-request extras, e.g. { force: "model" } from "Ask the planner instead".
        ...(body ?? {}),
        messages: withoutOldImages(messages),
        author: requestContext.author || localAuthor,
        outcomes: requestContext.outcomes,
        context: requestContext.context,
      },
    };
  },
});

export function ChatProvider({
  available,
  vision,
  debugTiming = false,
  children,
}: {
  available: boolean;
  vision: boolean;
  debugTiming?: boolean;
  children: ReactNode;
}) {
  const { author } = useEditor();
  const [open, setOpen] = useState(false);
  // Read on the client only: the panel that shows it isn't rendered on the server.
  const [input, setInput] = useState(() => readStored<string>(DRAFT_KEY) ?? "");
  const [outcomes, setOutcomes] = useState<Record<string, ProposalOutcome>>(
    () => readStored<{ outcomes: Record<string, ProposalOutcome> }>(CHAT_KEY)?.outcomes ?? {},
  );
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  /** DEBUG_TIMING only: timestamps for the last message, taken the moment things happen. */
  const debugClock = useRef<ClientTiming>({});
  const [timingView, setTimingView] = useState<ClientTiming>({});
  const [focus, setFocus] = useState<ChatFocus | null>(null);

  const addImages = useCallback(
    async (files: Blob[]) => {
      setAttachError(null);
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (files.length && !images.length) return setAttachError("Only images can be attached.");
      const room = MAX_IMAGES - attachments.length;
      if (images.length > room) setAttachError(`Up to ${MAX_IMAGES} screenshots per message.`);
      const accepted = images.slice(0, Math.max(0, room));
      try {
        const parts = await Promise.all(accepted.map((f, i) => compressImage(f, attachments.length + i)));
        setAttachments((a) => [...a, ...parts.map((part) => ({ id: crypto.randomUUID(), part }))].slice(0, MAX_IMAGES));
      } catch (e) {
        setAttachError(e instanceof Error ? e.message : "Couldn't read that image.");
      }
    },
    [attachments.length],
  );

  const removeAttachment = useCallback((id: string) => setAttachments((a) => a.filter((x) => x.id !== id)), []);

  useEffect(() => {
    requestContext.author = author;
    requestContext.outcomes = outcomes;
    requestContext.context = { ...(day ? { day } : {}), ...(focus ? { itemId: focus.id } : {}) };
  }, [author, outcomes, day, focus]);

  const askAbout = useCallback((item: ChatFocus) => {
    setFocus(item);
    setOpen(true);
  }, []);
  const clearFocus = useCallback(() => setFocus(null), []);

  const chat = useChat<TripUIMessage>({ transport, sendAutomaticallyWhen: answeredAskUser });

  // First outcome wins: a proposal marked stale stays stale when the follow-up message goes out.
  const setOutcome = useCallback((toolCallId: string, outcome: ProposalOutcome) => {
    setOutcomes((o) => (o[toolCallId] ? o : { ...o, [toolCallId]: outcome }));
  }, []);

  const pending = useMemo(() => {
    const latest = proposalsIn(chat.messages).at(-1);
    if (!latest || outcomes[latest.toolCallId] || latest.proposal.status === "invalid") return null;
    return latest;
  }, [chat.messages, outcomes]);

  const flash = useCallback((ids: string[]) => {
    setHighlight(new Set(ids));
    setTimeout(() => setHighlight(new Set()), 2200);
  }, []);

  const prefill = useCallback((text: string) => {
    setInput(text);
    setOpen(true);
    // On a phone the keyboard would cover the sheet: focus waits for a tap.
    if (window.matchMedia("(pointer: coarse)").matches) return;
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 50);
  }, []);

  // The conversation and an unsent draft survive a reload on this device.
  const restored = useRef(false);
  const { setMessages } = chat;
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = readStored<{ messages: TripUIMessage[]; outcomes: Record<string, ProposalOutcome> }>(CHAT_KEY);
    if (saved?.messages?.length) setMessages(saved.messages);
  }, [setMessages]);
  useEffect(() => {
    if (!restored.current || chat.status === "streaming" || chat.status === "submitted") return;
    writeStored(CHAT_KEY, chat.messages.length ? { messages: withoutImages(chat.messages), outcomes } : null);
  }, [chat.messages, chat.status, outcomes]);
  useEffect(() => {
    if (restored.current) writeStored(DRAFT_KEY, input || null);
  }, [input]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setOutcomes({});
    writeStored(CHAT_KEY, null);
  }, [setMessages]);

  const send = useCallback(
    (text: string, customAuthor?: string) => {
      if (customAuthor) {
        requestContext.author = customAuthor;
      }
      const files = vision ? attachments.map((a) => a.part) : [];
      const t = text.trim() || (files.length ? `Here ${files.length > 1 ? "are some booking screenshots" : "is a booking screenshot"}.` : "");
      if (!t || chat.status === "streaming" || chat.status === "submitted") return;
      // A new message supersedes an unanswered proposal.
      if (pending) setOutcome(pending.toolCallId, "discarded");
      if (debugTiming) {
        const sentAt = performance.now();
        debugClock.current = { sentAt };
        // First frame after the message is echoed and the working state shows.
        requestAnimationFrame(() => {
          debugClock.current.feedbackMs = performance.now() - sentAt;
          setTimingView({ ...debugClock.current });
        });
      }
      chat.sendMessage(files.length ? { text: t, files } : { text: t });
      setInput("");
      setAttachments([]);
      setAttachError(null);
    },
    [chat, pending, setOutcome, attachments, vision, debugTiming],
  );

  // DEBUG_TIMING: when the card (or answer) showed up, measured from the tap.
  const latestCard = proposalsIn(chat.messages).at(-1)?.toolCallId;
  useEffect(() => {
    const sentAt = debugClock.current.sentAt;
    if (!debugTiming || sentAt === undefined) return;
    const now = performance.now();
    if (latestCard && debugClock.current.cardMs === undefined) debugClock.current.cardMs = now - sentAt;
    if (chat.status === "ready" && debugClock.current.answerMs === undefined) debugClock.current.answerMs = now - sentAt;
    const id = requestAnimationFrame(() => setTimingView({ ...debugClock.current }));
    return () => cancelAnimationFrame(id);
  }, [debugTiming, latestCard, chat.status]);
  const timing = debugTiming ? timingView : null;

  return (
    <ChatContext.Provider
      value={{
        available,
        vision,
        attachments,
        addImages,
        removeAttachment,
        attachError,
        open,
        setOpen,
        input,
        setInput,
        prefill,
        send,
        chat,
        outcomes,
        setOutcome,
        pending,
        highlight,
        flash,
        inputRef,
        day,
        setDay,
        focus,
        askAbout,
        clearFocus,
        clearChat,
        timing,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
