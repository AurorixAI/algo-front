import { formatIsoDateLabel } from "@/lib/business-time";

/** «Пн» of a day, the way both week grids write it (the dot of «пн.» is dropped; the caller capitalises). */
export const weekdayShort = (date: string): string => formatIsoDateLabel(date, { weekday: "short" }).replace(".", "");

/** «26 окт.» */
export const dayAndMonth = (date: string): string => formatIsoDateLabel(date, { day: "numeric", month: "short" });

/**
 * The head of a day in a week grid - «Пн» and under it «26 окт.», the pill «Сегодня» on today - one for the group's schedule of the
 * owner / administrator and for the teacher's week.  `onAccent`: the head sits on the solid colour of today's column of the teacher's grid.
 */
export function DayHeading({ date, isToday, onAccent = false }: { date: string; isToday: boolean; onAccent?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-2 gap-y-1">
      <div className="min-w-0">
        <p className={`text-sm font-semibold capitalize ${onAccent && isToday ? "text-white" : "text-slate-900"}`}>{weekdayShort(date)}</p>
        <p className={`mt-0.5 whitespace-nowrap text-xs ${onAccent && isToday ? "text-primary-100" : "text-slate-500"}`}>{dayAndMonth(date)}</p>
      </div>
      {isToday && <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${onAccent ? "bg-white/20 text-white" : "bg-primary-600 text-white"}`}>Сегодня</span>}
    </div>
  );
}
