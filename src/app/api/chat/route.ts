import { handleChat } from "@/lib/chat/pipeline";
import { chatAvailability, isMockModel, modelChain } from "@/lib/llm/provider";
import { getRepository } from "@/lib/repo";

export const maxDuration = 60;

/** Body: { messages: UIMessage[], author: string, outcomes?: Record<toolCallId, ProposalOutcome>, context?: { day?, itemId? }, force?: "model" } */
export async function POST(request: Request) {
  const models = isMockModel() ? [(await import("@/lib/llm/mock")).mockModel()] : modelChain();
  return handleChat(request, { repo: getRepository(), models, vision: chatAvailability().vision });
}
