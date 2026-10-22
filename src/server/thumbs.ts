import "server-only";
import { postInfo } from "@/domain/links";
import type { Link } from "@/domain/types";
import { safeFetch, tiktokPage } from "./unfurl";

/*
 * Pictures for saved links. TikTok's cover links expire within days, so the
 * cover is looked up again from the video page when it's needed (and the
 * phone keeps a copy). YouTube's thumbnails are permanent. Instagram shows
 * servers a login wall, so the app shows Instagram's own embed instead.
 */

const MAX_IMAGE_BYTES = 5_000_000;
const COVER_TTL_MS = 6 * 60 * 60 * 1000;
const covers = new Map<string, { url: string; at: number }>();

/** The picture to show for a link right now, or null when there isn't one to fetch. */
export async function thumbnailUrl(link: Link): Promise<string | null> {
  const post = postInfo(link.url);
  if (post?.platform === "youtube") return `https://i.ytimg.com/vi/${post.id}/hqdefault.jpg`;
  if (post?.platform === "instagram" || link.kind === "instagram") return null;
  if (post?.platform === "tiktok" || link.kind === "tiktok") {
    const hit = covers.get(link.url);
    if (hit && Date.now() - hit.at < COVER_TTL_MS) return hit.url;
    const page = await tiktokPage(link.url);
    if (!page?.cover) return null;
    if (covers.size > 500) covers.delete(covers.keys().next().value!);
    covers.set(link.url, { url: page.cover, at: Date.now() });
    return page.cover;
  }
  return link.image ?? null;
}

/** The image itself, through the same public-address guard as link previews. */
export async function fetchImage(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const r = await safeFetch(url, { accept: "image/avif,image/webp,image/jpeg,image/png,image/*", maxBytes: MAX_IMAGE_BYTES, browser: true });
  if (!r?.ok || !r.type.startsWith("image/") || r.bytes.length === 0 || r.bytes.length >= MAX_IMAGE_BYTES) return null;
  return { bytes: r.bytes, type: r.type.split(";")[0] };
}
