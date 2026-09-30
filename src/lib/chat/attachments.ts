import type { UIMessage } from "ai";

/**
 * Screenshots ride along with a chat message as inline data URLs, go to the
 * model once, and are never stored: not in Redis, not in the change log, not
 * in server logs. Only the newest user message may carry them; images on
 * older messages are replaced with a note so they aren't resent every turn.
 */
export const IMAGE_LIMITS = {
  maxPerMessage: 4,
  /** Data URL length. The client targets ~450 KB JPEGs, which is ~600k chars. */
  maxDataUrlChars: 900_000,
  mediaTypes: ["image/jpeg", "image/png", "image/webp"],
  /** Whole request. Vercel functions reject bodies over 4.5 MB. */
  maxBodyBytes: 4_000_000,
};

type Part = UIMessage["parts"][number];

function isImagePart(p: Part): p is Extract<Part, { type: "file" }> {
  return p.type === "file";
}

function validImage(p: Extract<Part, { type: "file" }>): string | null {
  if (!IMAGE_LIMITS.mediaTypes.includes(p.mediaType)) return `Screenshots must be JPEG, PNG or WebP (got ${p.mediaType}).`;
  // Inline data only: no URLs for the server or the model to fetch.
  if (!p.url.startsWith(`data:${p.mediaType};base64,`)) return "Screenshots must be sent inline.";
  if (p.url.length > IMAGE_LIMITS.maxDataUrlChars) return "A screenshot is too large. Try a tighter crop.";
  return null;
}

export type SanitizeResult = { ok: true; messages: UIMessage[]; imageCount: number } | { ok: false; error: string };

export function sanitizeMessages(messages: UIMessage[], { vision }: { vision: boolean }): SanitizeResult {
  const lastUser = messages.findLastIndex((m) => m.role === "user");
  let imageCount = 0;
  const out: UIMessage[] = [];

  for (const [i, m] of messages.entries()) {
    if (m.role !== "user") {
      out.push(m);
      continue;
    }
    const images = m.parts.filter(isImagePart);
    const others = m.parts.filter((p) => p.type === "text");
    if (!images.length) {
      out.push({ ...m, parts: others });
      continue;
    }
    if (i !== lastUser) {
      const note = `[${images.length} screenshot${images.length > 1 ? "s" : ""} shared earlier; already read, not resent]`;
      out.push({ ...m, parts: [...others, { type: "text", text: note }] });
      continue;
    }
    if (!vision) return { ok: false, error: "Screenshots need a model that can read images, and the assistant is on a text-only one right now. Paste the text instead." };
    if (images.length > IMAGE_LIMITS.maxPerMessage) return { ok: false, error: `Up to ${IMAGE_LIMITS.maxPerMessage} screenshots per message.` };
    for (const img of images) {
      const problem = validImage(img);
      if (problem) return { ok: false, error: problem };
    }
    imageCount = images.length;
    // Drop filenames: they can carry names or booking codes.
    const cleanImages = images.map((p, n) => ({ type: "file" as const, mediaType: p.mediaType, url: p.url, filename: `screenshot-${n + 1}` }));
    out.push({ ...m, parts: [...others, ...cleanImages] });
  }
  return { ok: true, messages: out, imageCount };
}
