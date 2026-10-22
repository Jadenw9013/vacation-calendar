import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { classifyLink, isMapsUrl } from "@/domain/links";
import type { LinkKind } from "@/domain/types";

/*
 * Link previews: a title and a picture for a pasted link. TikTok and YouTube
 * have public oEmbed endpoints; everything else gets its Open Graph tags read.
 * Instagram usually shows a login wall to servers, so its links often come
 * back with no picture, and that's fine.
 *
 * The server fetches URLs people paste, so it only ever talks to public
 * addresses: every hop is resolved and checked, with a short timeout and a
 * size cap.
 */

export interface Preview {
  url: string;
  kind: LinkKind;
  site: string;
  title?: string;
  image?: string;
  description?: string;
  /** For Google Maps links: the place's name, read from the expanded link. */
  placeName?: string;
}

const TIMEOUT_MS = 5000;
const MAX_BYTES = 1_000_000;
const MAX_HOPS = 4;

function privateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return privateV4(ip);
  const v6 = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return privateV4(mapped[1]);
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb");
}

/** Throws unless the URL is http(s) on a public address. */
async function assertPublic(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only web links");
  if (u.username || u.password) throw new Error("No credentials in links");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Private host");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("Private address");
  return u;
}

/** A browser's user agent: TikTok and others serve the real page (with its data) only to browsers. */
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** GET with manual redirects, each hop checked. Returns the final URL and up to `maxBytes` of body. */
export async function safeFetch(raw: string, opts: { accept: string; maxBytes?: number; browser?: boolean }): Promise<{ url: string; bytes: Uint8Array; type: string; ok: boolean } | null> {
  let url = raw;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      await assertPublic(url);
      const res = await fetch(url, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { accept: opts.accept, "user-agent": opts.browser ? BROWSER_UA : "Mozilla/5.0 (compatible; TripLinkPreview/1.0)", "accept-language": "en" },
      });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) return null;
        url = new URL(next, url).toString();
        continue;
      }
      if (!res.ok || !res.body) return { url, bytes: new Uint8Array(), type: "", ok: false };
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (size < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
      }
      void reader.cancel().catch(() => {});
      return { url, bytes: new Uint8Array(Buffer.concat(chunks.map((c) => Buffer.from(c)))), type: res.headers.get("content-type") ?? "", ok: true };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function safeGet(raw: string, accept = "text/html,application/json", browser = false): Promise<{ url: string; body: string; type: string } | null> {
  const r = await safeFetch(raw, { accept, browser });
  return r && { url: r.url, body: new TextDecoder().decode(r.bytes), type: r.type };
}

/** A JSON string value from a page's embedded data: "cover":"https://…". */
function jsonField(html: string, key: string): string | undefined {
  const m = new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`).exec(html);
  if (!m) return undefined;
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return undefined;
  }
}

/** The caption, author and cover image from a TikTok video page's embedded data. */
export function readTikTok(html: string): { caption?: string; author?: string; cover?: string } {
  return {
    caption: jsonField(html, "desc"),
    author: jsonField(html, "uniqueId"),
    cover: jsonField(html, "cover") ?? jsonField(html, "originCover"),
  };
}

/** A TikTok video page, read for its caption, author and cover. Also expands vm.tiktok.com short links. */
export async function tiktokPage(url: string): Promise<{ url: string; caption?: string; author?: string; cover?: string } | null> {
  const page = await safeGet(url, "text/html", true);
  if (!page?.body) return null;
  return { url: page.url, ...readTikTok(page.body) };
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();

function meta(html: string, names: string[]): string | undefined {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
    const tag = re.exec(html)?.[0];
    const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (content) return decode(content);
  }
  return undefined;
}

function httpsImage(src: string | undefined, base: string): string | undefined {
  if (!src) return undefined;
  try {
    const u = new URL(src, base);
    return u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** "/maps/place/Caf%C3%A9+Sabe+Rico/@14.55..." → "Café Sabe Rico". */
function placeFromMapsUrl(url: string): string | undefined {
  const m = /\/maps\/place\/([^/@]+)/.exec(new URL(url).pathname);
  return m ? decodeURIComponent(m[1].replace(/\+/g, " ")).slice(0, 200) : undefined;
}

async function oembed(endpoint: string): Promise<{ title?: string; thumbnail_url?: string; author_name?: string } | null> {
  const r = await safeGet(endpoint, "application/json");
  if (!r?.body) return null;
  try {
    return JSON.parse(r.body);
  } catch {
    return null;
  }
}

const cache = new Map<string, Preview>();

export async function unfurl(raw: string): Promise<Preview | null> {
  let start: URL;
  try {
    start = new URL(raw.trim());
  } catch {
    return null;
  }
  const key = start.toString();
  const hit = cache.get(key);
  if (hit) return hit;

  const base = classifyLink(key);
  let preview: Preview = { url: key, ...base };

  if (base.kind === "tiktok") {
    const t = await tiktokPage(key);
    if (t) {
      preview = {
        ...preview,
        url: t.url.split("?")[0],
        ...(t.caption ? { title: t.caption.slice(0, 300) } : {}),
        ...(t.author ? { description: `@${t.author}`, site: `@${t.author}` } : {}),
        ...(httpsImage(t.cover, key) ? { image: httpsImage(t.cover, key) } : {}),
      };
    }
  } else if (base.kind === "youtube") {
    const o = await oembed(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(key)}`);
    if (o) {
      preview = {
        ...preview,
        ...(o.title ? { title: o.title.slice(0, 300) } : {}),
        ...(httpsImage(o.thumbnail_url, key) ? { image: httpsImage(o.thumbnail_url, key) } : {}),
        ...(o.author_name ? { description: o.author_name } : {}),
      };
    }
  } else if (base.kind === "instagram") {
    // Instagram shows servers a login wall; the app shows its official embed instead.
  } else {
    const page = await safeGet(key);
    if (page) {
      const finalUrl = page.url;
      const isHtml = !page.type || page.type.includes("html");
      const html = isHtml ? page.body : "";
      const title = meta(html, ["og:title", "twitter:title"]) ?? (/<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)?.[1] ? decode(/<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)![1]) : undefined);
      const image = httpsImage(meta(html, ["og:image", "og:image:url", "twitter:image"]), finalUrl);
      const description = meta(html, ["og:description", "description"]);
      const site = meta(html, ["og:site_name"]);
      const finalKind = classifyLink(finalUrl);
      preview = {
        url: isMapsUrl(finalUrl) || finalKind.kind !== "article" ? finalUrl : key,
        kind: base.kind === "article" ? finalKind.kind : base.kind,
        site: site ?? (base.kind === "article" ? finalKind.site : base.site),
        ...(title ? { title: title.slice(0, 300) } : {}),
        ...(image ? { image } : {}),
        ...(description ? { description: description.slice(0, 300) } : {}),
      };
      if (isMapsUrl(finalUrl)) {
        const placeName = placeFromMapsUrl(finalUrl);
        if (placeName) preview = { ...preview, kind: "maps", site: "Google Maps", placeName, title: placeName };
      }
    }
  }

  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  cache.set(key, preview);
  return preview;
}
