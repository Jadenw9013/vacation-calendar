import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Nothing the model produces is applied without a person tapping Apply.
 * This scans the code: the chat side never writes, and the only places that
 * send ops to /api/ops are tap or submit handlers on screen.
 */

const root = join(__dirname, "..", "..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}
const all = files(root);
/** Source without comments, so a comment that mentions /api/ops doesn't count as a call. */
const code = (p: string) => readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const rel = (p: string) => p.slice(root.length + 1);

describe("no path applies model output without a tap", () => {
  it("the chat server code never writes to the trip", () => {
    const chatServer = all.filter((p) => /lib\/chat\/|app\/api\/chat\//.test(p));
    expect(chatServer.length).toBeGreaterThan(5);
    for (const p of chatServer) {
      const src = code(p);
      expect(src, rel(p)).not.toMatch(/\.applyOps\(|\/api\/ops|\.set\(|\beval\(/);
    }
  });

  it("only the Apply and Undo routes call applyOps", () => {
    const callers = all.filter((p) => /\.applyOps\(/.test(code(p))).map(rel).sort();
    // The Apply route, and undoLatest (used only by the undo route), which applies a change's inverse.
    expect(callers).toEqual(["app/api/ops/route.ts", "lib/repo/index.ts"]);
    expect(callers.some((f) => f.startsWith("lib/chat") || f.startsWith("components/chat"))).toBe(false);
  });

  it("only the editor posts to /api/ops", () => {
    const posting = all.filter((p) => code(p).includes('"/api/ops"')).map(rel);
    expect(posting).toEqual(["components/edit/EditorProvider.tsx"]);
  });

  it("the chat UI applies only from the Apply button's click handler", () => {
    const card = readFileSync(join(root, "components/chat/ProposalCard.tsx"), "utf8");
    // apply(…) appears once, inside onApply, which is wired only to onClick.
    expect(card.match(/\bapply\(/g)).toHaveLength(1);
    expect(card).toMatch(/async function onApply\(\)[\s\S]*?await apply\(chosen/);
    expect(card.match(/onApply/g)!.length).toBe(2); // the definition and onClick={onApply}
    expect(card).toContain("onClick={onApply}");
    // Nothing in the chat provider, panel or sheet calls apply or submit.
    for (const f of ["ChatProvider.tsx", "ChatPanel.tsx", "ChatSheet.tsx"]) {
      const src = readFileSync(join(root, "components/chat", f), "utf8");
      expect(src, f).not.toMatch(/\b(apply|submit)\(\s*\[/);
      expect(src, f).not.toMatch(/useEditor\(\)[^;]*\b(apply|submit)\b/);
    }
  });
});
