import type { NightStatus } from "@/lib/derive";
import { monthDay, weekday } from "@/lib/time";

/** One cell per night: Lake Teal for booked nights, Maya Clay dashed border for unbooked */
export function NightStrip({ nights }: { nights: NightStatus[] }) {
  return (
    <nav aria-label="Where we sleep each night" className="my-4">
      <ol className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {nights.map((n) => {
          const day = monthDay(n.date).split(" ")[1];
          const label = n.booked
            ? `Night of ${weekday(n.date)} ${day}: ${n.booked.title}`
            : `Night of ${weekday(n.date)} ${day}: no bed booked`;
          return (
            <li key={n.date}>
              <a
                href={`#day-${n.date}`}
                aria-label={label}
                title={label}
                className={`flex h-20 sm:h-22 flex-col justify-between p-2 rounded-xl text-center transition-all ${
                  n.booked
                    ? "bg-lake text-white shadow-xs hover:bg-lake-hover"
                    : "border-1.5 border-dashed border-maya bg-maya-light text-maya shadow-xs hover:bg-maya-border/30"
                }`}
              >
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] font-medium opacity-80">{weekday(n.date)}</span>
                  <span className="font-mono text-base sm:text-lg font-bold">{day}</span>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider">
                  {n.booked ? (
                    <>
                      {/* "Booked" doesn't fit a phone-width cell; the solid fill plus a tick says it. */}
                      <span className="sm:hidden" aria-hidden="true">✓</span>
                      <span className="hidden sm:inline">Booked</span>
                    </>
                  ) : (
                    "No bed"
                  )}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
