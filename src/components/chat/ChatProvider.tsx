"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type InferUITools, type UIDataTypes, type UIMessage } from "ai";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Proposal } from "@/lib/chat/proposal";
import type { ChatTools, ProposalOutcome } from "@/lib/chat/setup";
import { useEditor } from "@/components/edit/EditorProvider";

export type TripUIMessage = UIMessage<unknown, UIDataTypes, InferUITools<ChatTools>>;

export interface PendingProposal {
  toolCallId: string;
  proposal: Proposal;
}

interface ChatApi {
  available: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  input: string;
  setInput: (text: string) => void;
  /** Opens the chat with the input prefilled (Tweak, Ask about this, chips). */
  prefill: (text: string) => void;
  send: (text: string) => void;
  chat: ReturnType<typeof useChat<TripUIMessage>>;
  outcomes: Record<string, ProposalOutcome>;
  setOutcome: (toolCallId: string, outcome: ProposalOutcome) => void;
  /** Latest proposal nobody has applied or discarded: drives the ghost preview. */
  pending: PendingProposal | null;
  /** Segment ids to flash briefly after an apply. */
  highlight: Set<string>;
  flash: (ids: string[]) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
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
const requestContext = { author: "", outcomes: {} as Record<string, ProposalOutcome> };

const transport = new DefaultChatTransport<TripUIMessage>({
  api: "/api/chat",
  body: () => ({ author: requestContext.author, outcomes: requestContext.outcomes }),
});

export function ChatProvider({ available, children }: { available: boolean; children: ReactNode }) {
  const { author } = useEditor();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [outcomes, setOutcomes] = useState<Record<string, ProposalOutcome>>({});
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useEffect(() => {
    requestContext.author = author;
    requestContext.outcomes = outcomes;
  }, [author, outcomes]);

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
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 50);
  }, []);

  const send = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || chat.status === "streaming" || chat.status === "submitted") return;
      // A new message supersedes an unanswered proposal.
      if (pending) setOutcome(pending.toolCallId, "discarded");
      chat.sendMessage({ text: t });
      setInput("");
    },
    [chat, pending, setOutcome],
  );

  return (
    <ChatContext.Provider
      value={{
        available,
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
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
