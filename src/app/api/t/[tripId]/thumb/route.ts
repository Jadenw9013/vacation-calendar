import { postInfo } from "@/domain/links";
import type { Link } from "@/domain/types";
import { getStore, jsonError, requireSession } from "@/server/http";
import { fetchImage, thumbnailUrl } from "@/server/thumbs";

/**
 * GET ?item=…&link=… The picture for a link saved on this trip.
 * GET ?post=… The picture for a TikTok, Reel or YouTube video not saved yet
 * (the + box preview): only links recognised as posts, so this never fetches
 * an arbitrary address.
 */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const q = new URL(request.url).searchParams;
  const post = q.get("post");
  let link: Link | undefined;
  if (post) {
    const info = postInfo(post);
    if (!info) return jsonError(400, "Not a post link.");
    link = { id: "preview", url: post, kind: info.platform, addedAt: 0 };
  } else {
    const state = await getStore().get(tripId);
    link = state?.trip.items.find((i) => i.id === q.get("item"))?.links?.find((l) => l.id === q.get("link"));
  }
  if (!link) return jsonError(404, "No such link.");

  const src = await thumbnailUrl(link);
  const image = src ? await fetchImage(src) : null;
  if (!image) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(image.bytes as BodyInit, {
    headers: {
      "Content-Type": image.type,
      // Private: it sits behind the trip's passcode. A week is fine; the phone's offline copy keeps it longer.
      "Cache-Control": "private, max-age=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
