import { handleChat } from "@/server/ai/chat";

// Answers that look up several places can take a while. 300 s is the Hobby plan's limit with Fluid compute.
export const maxDuration = 300;

/** Body: { messages: UIMessage[], context?: { day?, itemId? } }. Streams the assistant's reply. */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return handleChat(request, tripId);
}
