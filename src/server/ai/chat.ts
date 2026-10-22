import "server-only";
import { convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";
import { readSession } from "../auth";
import { getStore } from "../db";
import { jsonError, readJson, sameSite, TRIP_ID } from "../http";
import { assistantModel, errorMessage, googleProvider, isMock, SETTINGS } from "./models";
import { buildInstructions } from "./prompt";
import { buildTools } from "./tools";

/*
 * One assistant turn. The model may look things up (Maps, Search, a pasted
 * link), call our tools (which change the trip through the same rules as a
 * person's edit), and then answer. Removals and changes to booked dates come
 * back as cards a person confirms; nothing else needs a tap.
 */

const LIMITS = {
  bodyBytes: 12_000_000,
  messages: 40,
  textChars: 8000,
  imagesPerMessage: 4,
  imageBytes: 4_000_000,
};

const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|gif|heic|heif);base64,[A-Za-z0-9+/=]+$/;

/** Keeps only what the model should see: text, images we accept, and tool parts from earlier turns. */
export function sanitize(raw: unknown): UIMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: UIMessage[] = [];
  for (const m of raw.slice(-LIMITS.messages)) {
    if (!m || typeof m !== "object") return null;
    const { id, role, parts } = m as UIMessage;
    if ((role !== "user" && role !== "assistant") || !Array.isArray(parts)) return null;
    let images = 0;
    const kept = parts.filter((p) => {
      if (p.type === "text") return typeof p.text === "string" && p.text.length <= LIMITS.textChars;
      if (p.type === "file") {
        if (role !== "user" || ++images > LIMITS.imagesPerMessage) return false;
        return typeof p.url === "string" && p.url.length <= LIMITS.imageBytes * 1.4 && IMAGE_DATA_URL.test(p.url);
      }
      if (p.type.startsWith("tool-") || p.type.startsWith("source-")) return role === "assistant";
      return p.type === "step-start";
    });
    out.push({ id: String(id ?? ""), role, parts: kept } as UIMessage);
  }
  return out.at(-1)?.role === "user" || out.at(-1)?.role === "assistant" ? out : null;
}

export async function handleChat(request: Request, tripId: string): Promise<Response> {
  const denied = sameSite(request);
  if (denied) return denied;
  if (!TRIP_ID.test(tripId)) return jsonError(404, "No such trip.");
  const session = await readSession(tripId);
  if (!session) return jsonError(401, "Join the trip first.", { join: true });

  const parsed = await readJson(request, LIMITS.bodyBytes);
  if (!parsed.ok) return parsed.res;
  const messages = sanitize(parsed.body.messages);
  if (!messages) return jsonError(400, "Nothing to send.");

  const model = isMock() ? (await import("./mock")).mockModel() : assistantModel();
  if (!model) return jsonError(503, "The assistant isn't set up on this site yet: it needs a GEMINI_API_KEY. Everything else works.");

  const store = getStore();
  const state = await store.get(tripId);
  if (!state) return jsonError(404, "No such trip.");
  const trip = state.trip;

  const ctx = parsed.body.context && typeof parsed.body.context === "object" ? (parsed.body.context as Record<string, unknown>) : {};
  const day = typeof ctx.day === "string" && ctx.day >= trip.startDate && ctx.day <= trip.endDate ? ctx.day : null;
  const itemId = typeof ctx.itemId === "string" && trip.items.some((i) => i.id === ctx.itemId) ? ctx.itemId : null;

  const tools = {
    ...buildTools({ store, tripId, me: session.name, trip: async () => (await store.get(tripId))!.trip }),
    // Google's own tools: real places, current facts, and the pages behind pasted links.
    ...(isMock()
      ? {}
      : {
          google_maps: googleProvider().tools.googleMaps({}),
          google_search: googleProvider().tools.googleSearch({}),
          url_context: googleProvider().tools.urlContext({}),
        }),
  };

  const result = streamText({
    model,
    instructions: buildInstructions(trip, { me: session.name, nowMs: Date.now(), day, itemId }),
    messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: isStepCount(SETTINGS.maxSteps),
    maxOutputTokens: SETTINGS.maxOutputTokens,
    maxRetries: 1,
    abortSignal: request.signal,
    providerOptions: { google: { thinkingConfig: { thinkingLevel: SETTINGS.thinkingLevel } } },
    onError: ({ error }) => {
      const e = error as { name?: string; statusCode?: number; message?: string };
      console.error("assistant error", { name: e?.name, statusCode: e?.statusCode, message: (e?.message ?? "").slice(0, 300) });
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream, tools, sendSources: true, onError: errorMessage }),
  });
}
