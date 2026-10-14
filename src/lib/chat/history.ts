import type { UIMessage } from "ai";
import type { Proposal } from "./proposal";
import type { ProposalOutcome } from "./setup";

/** How much conversation goes to the model. */
export const HISTORY_MESSAGES = 6;

/**
 * The conversation as the model sees it: the last few messages, starting on
 * something the person said, with every proposal except the newest cut down
 * to one line. The newest stays whole in case they're asking about it.
 */
export function compactHistory(messages: UIMessage[], outcomes: Record<string, ProposalOutcome> = {}): UIMessage[] {
  let recent = messages.slice(-HISTORY_MESSAGES);
  // The model needs to see a person's message first, not a reply.
  while (recent.length > 1 && recent[0].role !== "user") recent = recent.slice(1);

  const proposalIds = recent.flatMap((m) =>
    m.parts.flatMap((p) => (p.type === "tool-propose_changes" && "toolCallId" in p && "state" in p && p.state === "output-available" ? [p.toolCallId] : [])),
  );
  const newest = proposalIds.at(-1);

  return recent.map((m) => ({
    ...m,
    parts: m.parts.map((p) => {
      if (p.type !== "tool-propose_changes" || !("state" in p) || p.state !== "output-available" || p.toolCallId === newest) return p;
      const out = p.output as Partial<Proposal> | undefined;
      // One line instead of the whole card: what it was and what happened to it.
      const line = { summary: out?.summary ?? "a proposal", status: out?.status, outcome: outcomes[p.toolCallId] ?? "not applied" };
      return { ...p, input: { ops: [] }, output: line };
    }),
  })) as UIMessage[];
}
