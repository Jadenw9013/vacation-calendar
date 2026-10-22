"use client";

import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type InferUITools, type UIMessage } from "ai";
import type { AssistantTools } from "@/server/ai/tools";

export type AssistantMessage = UIMessage<unknown, never, InferUITools<AssistantTools>>;

/*
 * One conversation per trip, kept while the app is open, so closing the
 * sheet to look at something and coming back picks up where you were.
 */

const chats = new Map<string, Chat<AssistantMessage>>();
const context: { day: string | null; itemId: string | null } = { day: null, itemId: null };

/** What's on screen, sent with every message so "this" and "tomorrow" mean the right thing. */
export function setAssistantContext(day: string | null, itemId: string | null) {
  context.day = day;
  context.itemId = itemId;
}

/** Sends again on its own only after the person answers one of the assistant's questions. */
function answeredQuestion({ messages }: { messages: AssistantMessage[] }): boolean {
  const last = messages.at(-1);
  if (last?.role !== "assistant") return false;
  const part = last.parts.filter((p) => p.type !== "step-start").at(-1);
  return part?.type === "tool-ask_user" && part.state === "output-available";
}

export function chatFor(tripId: string): Chat<AssistantMessage> {
  let chat = chats.get(tripId);
  if (!chat) {
    chat = new Chat<AssistantMessage>({
      id: `trip-${tripId}`,
      transport: new DefaultChatTransport({
        api: `/api/t/${tripId}/chat`,
        // Screenshots go once, with the message they came with: earlier ones aren't resent every turn.
        prepareSendMessagesRequest: ({ id, messages }) => {
          const last = messages.findLastIndex((m) => m.role === "user");
          return {
            body: {
              id,
              context: { ...context },
              messages: messages.map((m, i) => (i === last ? m : { ...m, parts: m.parts.filter((p) => p.type !== "file") })),
            },
          };
        },
      }),
      sendAutomaticallyWhen: answeredQuestion,
    });
    chats.set(tripId, chat);
  }
  return chat;
}

export function newConversation(tripId: string) {
  chats.delete(tripId);
}
