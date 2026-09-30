"use client";

import type { DayInfo } from "@/lib/places";
import { weekday } from "@/lib/time";

const MIN_M = 1000;
const MAX_M = 4000;

/**
 * Desktop side rail: one row per day, bar length = how high you'll be, from
 * the trip data (see src/lib/places.ts). The summit day stands out. Each row
 * jumps to its day.
 */
export function ElevationProfile({ days }: { days: DayInfo[] }) {
  return (
    <nav aria-label="Elevation by day" className="w-36 select-none py-2">
      <p className="mb-2 px-1 text-[11px] font-semibold tracking-wide text-gray-400">Altitude</p>
      <ol className="flex flex-col gap-1.5">
        {days.map((d) => {
          const m = d.elevationM;
          const pct = m ? Math.max(6, Math.min(100, ((m - MIN_M) / (MAX_M - MIN_M)) * 100)) : 0;
          return (
            <li key={d.date}>
              <a
                href={`#day-${d.date}`}
                title={m ? `${d.peak ? "Summit" : d.place ?? ""} · ${m.toLocaleString("en-US")} m` : "Unknown"}
                className="group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-white/70"
              >
                <span className="w-9 shrink-0 font-mono text-[10px] text-gray-400 group-hover:text-volcano">
                  {weekday(d.date)} {Number(d.date.slice(8))}
                </span>
                <span className="relative h-1.5 flex-1 rounded-full bg-gray-200">
                  {m && (
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full ${d.peak ? "bg-maya" : "bg-lake/70"}`}
                      style={{ width: `${pct}%` }}
                    />
                  )}
                </span>
                <span className={`w-9 shrink-0 text-right font-mono text-[10px] ${d.peak ? "font-bold text-maya" : "text-gray-400"}`}>
                  {m ? `${(m / 1000).toFixed(1)}k` : "—"}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 px-1 text-[10px] leading-snug text-gray-400">Metres. Towns are approximate; the summit is from the booking.</p>
    </nav>
  );
}
