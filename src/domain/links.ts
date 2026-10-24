import type { Contact, Item, LinkKind, Place, Trip } from "./types";

/*
 * Links in and out: what kind of link someone pasted, and the URLs that open
 * Maps, the phone, WhatsApp or email straight from an item.
 */

const HOSTS: [RegExp, LinkKind, string][] = [
  [/(^|\.)tiktok\.com$/, "tiktok", "TikTok"],
  [/(^|\.)instagram\.com$/, "instagram", "Instagram"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube", "YouTube"],
  [/(^|\.)maps\.app\.goo\.gl$|^goo\.gl$/, "maps", "Google Maps"],
  [/(^|\.)airbnb\.[a-z.]+$/, "booking", "Airbnb"],
  [/(^|\.)booking\.com$/, "booking", "Booking.com"],
  [/(^|\.)expedia\.[a-z.]+$/, "booking", "Expedia"],
  [/(^|\.)hotels\.com$/, "booking", "Hotels.com"],
  [/(^|\.)vrbo\.com$/, "booking", "Vrbo"],
  [/(^|\.)hostelworld\.com$/, "booking", "Hostelworld"],
  [/(^|\.)viator\.com$/, "booking", "Viator"],
  [/(^|\.)getyourguide\.[a-z.]+$/, "booking", "GetYourGuide"],
  [/(^|\.)klook\.com$/, "booking", "Klook"],
  [/(^|\.)tripadvisor\.[a-z.]+$/, "article", "Tripadvisor"],
  [/(^|\.)opentable\.[a-z.]+$/, "booking", "OpenTable"],
  [/(^|\.)alaskaair\.com$|(^|\.)united\.com$|(^|\.)delta\.com$|(^|\.)aa\.com$/, "booking", "Airline"],
];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isMapsUrl(url: string): boolean {
  const host = hostOf(url);
  if (/(^|\.)maps\.app\.goo\.gl$/.test(host)) return true;
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return new URL(url).pathname.startsWith("/maps");
  return host === "maps.apple.com";
}

/** The kind of link and a short name for where it's from. */
export function classifyLink(url: string): { kind: LinkKind; site: string } {
  const host = hostOf(url);
  if (isMapsUrl(url)) return { kind: "maps", site: host === "maps.apple.com" ? "Apple Maps" : "Google Maps" };
  for (const [re, kind, site] of HOSTS) if (re.test(host)) return { kind, site };
  return { kind: "article", site: host };
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'“”]+[^\s<>"'“”.,;:!?)\]]/gi;

/** Every web link in a piece of text, in order, without duplicates. */
export function extractUrls(text: string): string[] {
  return [...new Set(text.match(URL_RE) ?? [])];
}

export const mapsSearchUrl = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

/** Embeddable Google Maps iframe URL for a search query or coordinates (no API key required). */
export const mapsEmbedUrl = (query: string, zoom = 11) =>
  `https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=m&z=${zoom}&ie=UTF8&iwloc=near&output=embed`;

/** What to search Maps for: the exact link if we have one, else the address, else the name plus where the trip is. */
export function mapsLink(place: Place | undefined, trip?: Pick<Trip, "destination">): string | null {
  if (!place) return null;
  if (place.mapsUrl) return place.mapsUrl;
  if (place.lat !== undefined && place.lng !== undefined) return mapsSearchUrl(`${place.lat},${place.lng}`);
  const q = place.address || place.name;
  if (!q) return null;
  return mapsSearchUrl(place.address ? q : [q, trip?.destination].filter(Boolean).join(", "));
}

/** Embeddable Google Maps iframe URL for a specific place on a trip. */
export function placeEmbedUrl(place: Place | undefined, trip?: Pick<Trip, "destination">, zoom = 14): string | null {
  if (!place) return null;
  if (place.lat !== undefined && place.lng !== undefined) return mapsEmbedUrl(`${place.lat},${place.lng}`, zoom);
  const q = place.address || (place.name ? [place.name, trip?.destination].filter(Boolean).join(", ") : null);
  return q ? mapsEmbedUrl(q, zoom) : null;
}

/** Turn-by-turn directions to a place from wherever the phone is. */
export function directionsUrl(place: Place | undefined, trip?: Pick<Trip, "destination">): string | null {
  if (!place) return null;
  const dest =
    place.lat !== undefined && place.lng !== undefined
      ? `${place.lat},${place.lng}`
      : place.address || (place.name ? [place.name, trip?.destination].filter(Boolean).join(", ") : null);
  return dest ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}` : null;
}

/** A day's stops in order, as one Google Maps route (up to 9 waypoints). */
export function routeUrl(items: Item[], trip?: Pick<Trip, "destination">): string | null {
  const stops = items
    .filter((i) => i.kind !== "flight")
    .map((i) => i.place?.address || (i.place?.name && !/\bor\b/i.test(i.place.name) ? [i.place.name, trip?.destination].filter(Boolean).join(", ") : null))
    .filter((s): s is string => !!s)
    .filter((s, i, a) => a.indexOf(s) === i);
  if (stops.length < 2) return null;
  const dest = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1).slice(0, 9);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&waypoints=${encodeURIComponent(waypoints.join("|"))}`;
}

const digits = (s: string) => s.replace(/[^\d+]/g, "");

export const telUrl = (phone: string) => `tel:${digits(phone)}`;
export const mailUrl = (email: string) => `mailto:${email.trim()}`;
export const whatsappUrl = (number: string) => `https://wa.me/${digits(number).replace(/^\+/, "")}`;
export const instagramUrl = (handle: string) =>
  /^https?:\/\//.test(handle) ? handle : `https://www.instagram.com/${handle.replace(/^@/, "")}/`;

// ---------------------------------------------------------------------------
// Social posts: TikToks, Reels and YouTube videos, shown as pictures.

export type Platform = "tiktok" | "instagram" | "youtube";

export interface PostInfo {
  platform: Platform;
  /** The platform's id for the post. */
  id: string;
  /** The platform's own embeddable player for it. */
  embedUrl: string;
  /** Portrait video (TikTok, Reels, Shorts) rather than a landscape one. */
  tall: boolean;
  /** "TikTok", "Instagram Reel", "YouTube Short". */
  label: string;
}

export const isPost = (kind: LinkKind) => kind === "tiktok" || kind === "instagram" || kind === "youtube";

/** What a post link points at, or null for anything that isn't a post (or a short link not yet expanded). */
export function postInfo(url: string): PostInfo | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  if (/(^|\.)tiktok\.com$/.test(host)) {
    const id = /\/(?:video|photo)\/(\d{6,25})/.exec(u.pathname)?.[1];
    return id ? { platform: "tiktok", id, embedUrl: `https://www.tiktok.com/player/v1/${id}?description=1&rel=0`, tall: true, label: "TikTok" } : null;
  }
  if (/(^|\.)instagram\.com$/.test(host)) {
    const m = /\/(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})/.exec(u.pathname);
    if (!m) return null;
    const type = m[1] === "p" ? "p" : "reel";
    return { platform: "instagram", id: m[2], embedUrl: `https://www.instagram.com/${type}/${m[2]}/embed/captioned/`, tall: type === "reel", label: type === "p" ? "Instagram post" : "Instagram Reel" };
  }
  if (host === "youtu.be" || /(^|\.)youtube\.com$/.test(host)) {
    const short = /^\/shorts\/([\w-]{6,20})/.exec(u.pathname)?.[1];
    const id = short ?? (host === "youtu.be" ? u.pathname.slice(1).split("/")[0] : (u.searchParams.get("v") ?? /^\/(?:embed|live)\/([\w-]{6,20})/.exec(u.pathname)?.[1]));
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
    return { platform: "youtube", id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0`, tall: !!short, label: short ? "YouTube Short" : "YouTube" };
  }
  return null;
}

/** True when an item has anything worth showing in a "Contact" section. */
export function hasContact(c: Contact | undefined): c is Contact {
  return !!c && Object.values(c).some(Boolean);
}
