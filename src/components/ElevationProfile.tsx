"use client";

interface ElevationProfileProps {
  days: { date: string; elevationM?: number }[];
}

const DEFAULT_ELEVATIONS: Record<string, number> = {
  "2026-11-24": 1502, // Guatemala City
  "2026-11-25": 1562, // Lake Atitlán
  "2026-11-26": 1562, // Lake Atitlán
  "2026-11-27": 1530, // Antigua
  "2026-11-28": 1530, // Antigua
  "2026-11-29": 3976, // Acatenango summit
  "2026-11-30": 1502, // Guatemala City
};

export function ElevationProfile({ days }: ElevationProfileProps) {
  // 4000m down to 1000m scale
  const minM = 800;
  const maxM = 4200;

  return (
    <aside aria-label="Trip elevation profile" className="relative flex w-20 shrink-0 select-none flex-col justify-between py-6 pr-2">
      {/* Altitude labels */}
      <div className="flex flex-col justify-between h-full text-[11px] font-mono font-medium text-gray-400">
        <div className="flex items-center gap-1.5">
          <span className="w-12 text-right">4,000 m</span>
          <span className="h-px w-2 bg-gray-200" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-12 text-right">3,000 m</span>
          <span className="h-px w-2 bg-gray-200" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-12 text-right">2,000 m</span>
          <span className="h-px w-2 bg-gray-200" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-12 text-right">1,000 m</span>
          <span className="h-px w-2 bg-gray-200" />
        </div>
      </div>

      {/* Vertical spline line representing the elevation profile */}
      <svg
        className="pointer-events-none absolute right-0 top-6 bottom-6 w-6 h-[calc(100%-3rem)]"
        viewBox="0 0 24 600"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d="M 12 500 Q 14 460, 10 400 T 12 300 Q 8 200, 16 90 T 12 10"
          stroke="#0F766E"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Acatenango peak marker */}
        <circle cx="16" cy="90" r="3.5" fill="#C2410C" />
        <circle cx="12" cy="500" r="3" fill="#0F766E" />
        <circle cx="10" cy="400" r="3" fill="#0F766E" />
        <circle cx="12" cy="300" r="3" fill="#0F766E" />
      </svg>
    </aside>
  );
}

export function dayElevation(date: string): number {
  return DEFAULT_ELEVATIONS[date] ?? 1500;
}
