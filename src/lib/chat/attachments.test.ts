import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { IMAGE_LIMITS, sanitizeMessages } from "./attachments";

const img = (mediaType = "image/jpeg", body = "AAAA", filename = "Jordan Rivera booking HX9TQA.jpg") => ({
  type: "file" as const,
  mediaType,
  url: `data:${mediaType};base64,${body}`,
  filename,
});
const user = (id: string, parts: UIMessage["parts"]): UIMessage => ({ id, role: "user", parts });
const text = (t: string) => ({ type: "text" as const, text: t });

describe("sanitizeMessages", () => {
  it("keeps images on the newest user message, with generic filenames", () => {
    const r = sanitizeMessages([user("1", [text("here"), img(), img("image/png")])], { vision: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.imageCount).toBe(2);
    const files = r.messages[0].parts.filter((p) => p.type === "file");
    expect(files.map((p) => (p.type === "file" ? p.filename : ""))).toEqual(["screenshot-1", "screenshot-2"]);
  });

  it("replaces images on older messages with a note so they aren't resent", () => {
    const r = sanitizeMessages(
      [user("1", [text("first"), img(), img()]), { id: "2", role: "assistant", parts: [text("ok")] }, user("3", [text("next")])],
      { vision: true },
    );
    expect(r.ok && r.messages[0].parts.some((p) => p.type === "file")).toBe(false);
    expect(r.ok && JSON.stringify(r.messages[0])).toContain("2 screenshots shared earlier");
  });

  it("refuses images on a text-only model", () => {
    const r = sanitizeMessages([user("1", [text("x"), img()])], { vision: false });
    expect(r.ok || r.error).toContain("text-only");
  });

  it("caps the count, type, size and requires inline data", () => {
    const five = Array.from({ length: 5 }, () => img());
    expect(sanitizeMessages([user("1", five)], { vision: true }).ok).toBe(false);
    expect(sanitizeMessages([user("1", [img("image/gif")])], { vision: true }).ok).toBe(false);
    expect(sanitizeMessages([user("1", [img("image/jpeg", "A".repeat(IMAGE_LIMITS.maxDataUrlChars))])], { vision: true }).ok).toBe(false);
    const remote = { type: "file" as const, mediaType: "image/jpeg", url: "https://example.com/x.jpg" };
    expect(sanitizeMessages([user("1", [remote])], { vision: true }).ok).toBe(false);
  });

  it("drops non-text, non-image parts from user messages", () => {
    const r = sanitizeMessages([user("1", [text("x"), { type: "file", mediaType: "text/plain", url: "data:text/plain;base64,QQ==" }])], {
      vision: true,
    });
    expect(r.ok).toBe(false);
  });
});
