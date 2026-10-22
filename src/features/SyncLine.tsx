"use client";

import { formatTime, localParts, monthDay, todayIn } from "@/domain/time";
import { useTrip } from "@/client/store";
import { Icon } from "@/ui/Icon";

/** Where the copy on screen came from: live, saved on this phone, or waiting to sync. */
export function SyncLine() {
  const { online, syncedAt, queued, trip } = useTrip();
  const at = localParts(syncedAt, trip.tz);
  const when = at.date === todayIn(trip.tz) ? formatTime(at.time) : `${monthDay(at.date)}, ${formatTime(at.time)}`;
  return (
    <p className="flex items-center gap-2 pb-2 text-sm text-muted" role="status">
      {!online && <Icon name="offline" className="size-4" />}
      {online ? `Up to date as of ${when}` : `Offline. Showing the copy saved on this phone at ${when}.`}
      {queued > 0 && ` ${queued} ${queued === 1 ? "edit" : "edits"} waiting to sync.`}
    </p>
  );
}
