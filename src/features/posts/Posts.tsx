"use client";

import { useEffect, useRef, useState } from "react";
import { isPost, postInfo, type Platform } from "@/domain/links";
import { formatDay } from "@/domain/time";
import type { Item, Link, Trip } from "@/domain/types";
import type { View } from "@/client/router";
import { useTrip } from "@/client/store";
import { Icon, LINK_ICON } from "@/ui/Icon";

/*
 * Saved TikToks, Reels and YouTube videos, shown the way people know them:
 * a grid of tall pictures, and a full-screen viewer that plays the post.
 */

export interface PostEntry {
  link: Link;
  item: Item;
}

/** Every post saved on the trip: the planned days in order, then ideas, newest saved first within an item. */
export function postsOf(trip: Trip): PostEntry[] {
  return trip.items
    .filter((i) => i.links?.some((l) => isPost(l.kind)))
    .sort((a, b) => (a.start?.date ?? "9999").localeCompare(b.start?.date ?? "9999"))
    .flatMap((item) =>
      item.links!
        .filter((l) => isPost(l.kind))
        .sort((a, b) => b.addedAt - a.addedAt)
        .map((link) => ({ link, item })),
    );
}

export const thumbSrc = (tripId: string, itemId: string, linkId: string) => `/api/t/${tripId}/thumb?item=${encodeURIComponent(itemId)}&link=${encodeURIComponent(linkId)}`;

/** A post's picture before it's saved (the + box preview). Only post links are accepted. */
export const postThumbSrc = (tripId: string, url: string) => `/api/t/${tripId}/thumb?post=${encodeURIComponent(url)}`;

const PLATFORM_NAME: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

/** Shown when there's no picture to be had: the platform's colors, its mark and the caption. */
const PLATFORM_FILL: Record<Platform | "other", string> = {
  tiktok: "bg-[linear-gradient(160deg,#111_40%,#25f4ee33,#fe2c5544)]",
  instagram: "bg-[linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)]",
  youtube: "bg-[linear-gradient(160deg,#c4302b,#7a1512)]",
  other: "bg-[linear-gradient(160deg,#3c4a52,#1d2428)]",
};

/**
 * Instagram's own embed, scaled and cropped so its photo fills the tile. Instagram
 * doesn't give servers the picture, but it does give it to the phone.
 */
export function InstagramThumb({ code }: { code: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The embed is 326px wide: a 54px header, then the photo. Scale the photo to the tile's height and center it.
  const s = size ? size.h / 326 : 0;
  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      {size && (
        <iframe
          src={`https://www.instagram.com/p/${code}/embed/`}
          title="Instagram post"
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
          scrolling="no"
          className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
          style={{ width: 326, height: 420, transform: `translate(${-(326 * s - size.w) / 2}px, ${-54 * s}px) scale(${s})` }}
        />
      )}
    </div>
  );
}

/** The picture for a post, or the platform's colors when there isn't one. */
export function PostImage({ tripId, entry, className = "" }: { tripId: string; entry: PostEntry; className?: string }) {
  const [failed, setFailed] = useState(false);
  const info = postInfo(entry.link.url);
  const platform = info?.platform ?? "other";
  if (info?.platform === "instagram") {
    return (
      <div className={`absolute inset-0 ${PLATFORM_FILL.instagram} ${className}`}>
        <InstagramThumb code={info.id} />
      </div>
    );
  }
  if (failed) {
    return (
      <div className={`absolute inset-0 flex items-center justify-center ${PLATFORM_FILL[platform]} ${className}`}>
        <Icon name={LINK_ICON[entry.link.kind]} className="size-8 text-white/90" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a fresh picture from our own route; not worth the image optimizer
    <img
      src={thumbSrc(tripId, entry.item.id, entry.link.id)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`absolute inset-0 size-full bg-sunken object-cover ${className}`}
    />
  );
}

/** One tile in the grid: the picture, the platform's mark, a play mark, the caption. */
export function PostTile({ entry, onOpen, showItem }: { entry: PostEntry; onOpen: () => void; showItem?: boolean }) {
  const { tripId } = useTrip();
  const info = postInfo(entry.link.url);
  const name = info?.label ?? PLATFORM_NAME[entry.link.kind as Platform] ?? "Post";
  const caption = entry.link.title;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${name}${caption ? `: ${caption}` : ""}${showItem ? `, saved to ${entry.item.title}` : ""}`}
      className="group relative block aspect-[3/4] w-full overflow-hidden rounded-xl bg-sunken text-left text-white focus-visible:outline-offset-2"
    >
      <PostImage tripId={tripId} entry={entry} className="transition-transform duration-300 group-hover:scale-[1.03]" />
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/50 to-transparent" />
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      <span className="absolute top-1.5 left-1.5 flex size-7 items-center justify-center rounded-full bg-black/45">
        <Icon name={LINK_ICON[entry.link.kind]} className="size-4" />
      </span>
      {info && (
        <span className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-black/45">
          <svg viewBox="0 0 24 24" className="ml-0.5 size-3.5 fill-white" aria-hidden="true">
            <path d="M7 4v16l13-8z" />
          </svg>
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-2">
        {showItem && <span className="truncate text-xs font-bold text-white/85">{entry.item.title}</span>}
        <span className="line-clamp-2 text-[0.8rem] leading-snug font-semibold drop-shadow">{caption ?? entry.link.site ?? name}</span>
      </span>
    </button>
  );
}

/** Posts as a grid, like a profile. Tapping one opens the viewer on it. */
export function PostGrid({ entries, showItem, go }: { entries: PostEntry[]; showItem?: boolean; go: (v: View) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <ul className="grid grid-cols-3 gap-1.5">
        {entries.map((e, i) => (
          <li key={`${e.item.id}:${e.link.id}`}>
            <PostTile entry={e} showItem={showItem} onOpen={() => setOpen(i)} />
          </li>
        ))}
      </ul>
      {open !== null && entries[open] && <PostViewer entries={entries} index={open} onIndex={setOpen} onClose={() => setOpen(null)} go={go} />}
    </>
  );
}

/** Full screen: the post playing in its own platform's player, with the trip around it. */
export function PostViewer({ entries, index, onIndex, onClose, go }: { entries: PostEntry[]; index: number; onIndex: (i: number) => void; onClose: () => void; go: (v: View) => void }) {
  const { apply, online, tripId } = useTrip();
  const ref = useRef<HTMLDialogElement>(null);
  const entry = entries[index];
  const info = postInfo(entry.link.url);
  const appName = info ? PLATFORM_NAME[info.platform] : (entry.link.site ?? "the site");

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && index < entries.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, entries.length, onIndex]);

  const frame = info?.platform === "youtube" && !info.tall ? "aspect-video w-full max-w-3xl" : info?.platform === "instagram" ? "h-[min(72dvh,46rem)] w-full max-w-[26rem]" : "aspect-[9/16] h-[min(72dvh,46rem)] max-w-full";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={`${info?.label ?? "Post"} ${index + 1} of ${entries.length}`}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-black p-0 text-white backdrop:bg-black"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-full hover:bg-white/10">
            <Icon name="close" />
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              go({ tab: "item", itemId: entry.item.id });
            }}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-xl px-2 text-left hover:bg-white/10"
          >
            <span className="min-w-0">
              <span className="block truncate text-base font-bold">{entry.item.title}</span>
              <span className="block text-sm text-white/70">{entry.item.start ? formatDay(entry.item.start.date) : "Idea, no day yet"}</span>
            </span>
            <Icon name="chevronRight" className="size-4 text-white/70" />
          </button>
          <span className="tnum shrink-0 px-2 text-sm text-white/70">
            {index + 1} / {entries.length}
          </span>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
          {online && info ? (
            <iframe
              key={entry.link.id}
              src={info.embedUrl}
              title={`${info.label}${entry.link.title ? `: ${entry.link.title}` : ""}`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className={`rounded-2xl border-0 bg-neutral-900 ${frame}`}
            />
          ) : (
            <div className="relative aspect-[3/4] h-[min(60dvh,36rem)] max-w-full overflow-hidden rounded-2xl">
              <PostImage tripId={tripId} entry={entry} />
              {!online && <p className="absolute inset-x-0 bottom-0 bg-black/70 p-3 text-center text-sm">It plays when you&apos;re back online.</p>}
            </div>
          )}
          {index > 0 && (
            <button type="button" onClick={() => onIndex(index - 1)} aria-label="Previous post" className="absolute left-1 flex size-12 items-center justify-center rounded-full bg-black/60 hover:bg-black/80">
              <Icon name="back" />
            </button>
          )}
          {index < entries.length - 1 && (
            <button type="button" onClick={() => onIndex(index + 1)} aria-label="Next post" className="absolute right-1 flex size-12 items-center justify-center rounded-full bg-black/60 hover:bg-black/80">
              <Icon name="chevronRight" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {(entry.link.title || entry.link.site) && (
            <p className="line-clamp-2 text-sm text-white/85">
              {entry.link.title}
              {entry.link.title && info?.platform === "tiktok" && entry.link.site && entry.link.site !== "TikTok" ? ` ${entry.link.site}` : ""}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <a href={entry.link.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-base font-bold text-black hover:bg-white/90">
              <Icon name="external" className="size-4" />
              Open in {appName}
            </a>
            <button
              type="button"
              onClick={async () => {
                const r = await apply([{ op: "link.remove", itemId: entry.item.id, linkId: entry.link.id }], { message: "Post removed" });
                if (!r.ok) return;
                if (entries.length <= 1) onClose();
                else onIndex(Math.min(index, entries.length - 2));
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-base font-semibold text-white/80 hover:bg-white/10"
            >
              <Icon name="trash" className="size-4" />
              Remove
            </button>
          </div>
          {entries.length > 1 && (
            <ul className="no-scrollbar flex gap-1.5 overflow-x-auto" aria-label="Other posts">
              {entries.map((e, i) => (
                <li key={`${e.item.id}:${e.link.id}`} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => onIndex(i)}
                    aria-label={`Post ${i + 1}${e.link.title ? `: ${e.link.title}` : ""}`}
                    aria-current={i === index}
                    className={`relative block h-16 w-12 overflow-hidden rounded-lg ${i === index ? "ring-2 ring-white" : "opacity-70"}`}
                  >
                    <PostImage tripId={tripId} entry={e} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  );
}
