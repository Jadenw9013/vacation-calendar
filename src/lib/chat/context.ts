import type { TripState } from "@/lib/engine";
import { buildInstructions, planningTools } from "./setup";

/*
 * Everything the model is sent for one request, in one place, so its size can
 * be measured (scripts/context-size.ts) and the route and scripts agree.
 */
export function modelRequestFor(
  state: TripState,
  message: string,
  opts: { author: string; today: string; now?: number; day?: string | null; itemId?: string | null },
) {
  return {
    instructions: buildInstructions({ state, ...opts, message }),
    tools: planningTools(),
    messages: [{ role: "user" as const, content: message }],
  };
}
