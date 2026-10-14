import { handleChat } from "@/lib/chat/pipeline";
import { availableModels, chatAvailability, isMockModel } from "@/lib/llm/provider";
import { getRepository } from "@/lib/repo";

export const maxDuration = 60;

/** Body: { messages: UIMessage[], author: string, outcomes?: Record<toolCallId, ProposalOutcome>, context?: { day?, itemId? } } */
export async function POST(request: Request) {
  const model = isMockModel() ? (await import("@/lib/llm/mock")).mockModel() : (availableModels()[0]?.model ?? null);
  return handleChat(request, { repo: getRepository(), model, vision: chatAvailability().vision });
}
