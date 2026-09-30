import type { NightStatus } from "@/lib/derive";
import { monthDay, weekday } from "@/lib/time";

/** One cell per night. The loudest thing on the page. */
export function NightStrip({ nights }: { nights: NightStatus[] }) {
  return (
    <nav aria-label="Where we sleep each night">
      <ol className="grid grid-cols-7 gap-1">
        {nights.map((n) => {
          const day = monthDay(n.date).split(" ")[1];
          const label = n.booked ? `Night of ${weekday(n.date)} ${day}: ${n.booked.title}` : `Night of ${weekday(n.date)} ${day}: no bed booked`;
          return (
            <li key={n.date}>
              <a
                href={`#day-${n.date}`}
                aria-label={label}
                title={label}
                className={`flex h-24 flex-col justify-between p-1.5 ${n.booked ? "bg-lake text-on-lake" : "hazard"}`}
              >
                <span className={`flex flex-col leading-none ${n.booked ? "" : "hazard-label -m-0.5 p-0.5"}`}>
                  <span className="text-[11px] font-semibold">{weekday(n.date)}</span>
                  <span className="font-mono text-lg font-semibold">{day}</span>
                </span>
                <span
                  className={`text-[10px] font-bold leading-tight uppercase ${n.booked ? "" : "hazard-label -m-0.5 p-0.5"}`}
                >
                  {n.booked ? "Bed ✓" : "No bed"}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
