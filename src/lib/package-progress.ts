/**
 * The status of a PACKAGE of lessons («Пакет уроков») as a progress line: «Осталось 8 из 12 уроков», the share used, and under it what the schedule promises.
 * ONE source for the card of the student, the «Оплаты» tab of a group, the list of payments and the debtors (`components/payments/package-progress.tsx`).
 * The header chip of a package says only the short status; the count and the date live here.  Pure: no React.
 */
import { statusTone, type MembershipPaymentRow } from "./payments";

export type PackageTone = "ok" | "warning" | "danger" | "muted";

export interface PackageProgress {
  total: number;
  left: number;
  used: number;
  /** 0..100, the share of the package that is used. */
  percent: number;
  tone: PackageTone;
  /** «Осталось 8 из 12 уроков». */
  leftText: string;
  /** «Хватит примерно до 21.11 по расписанию» / «Пакет закончился» / «Прогноз недоступен»; null when the server sent no forecast field at all (an older server). */
  forecastLine: string | null;
  /** «21.11» for the compact view (grey, secondary); null when there is none. */
  forecastDay: string | null;
  /** «8/12 уроков». */
  shortText: string;
  /** For the screen reader. */
  ariaLabel: string;
}

type Row = Pick<MembershipPaymentRow, "period_mode" | "status" | "lessons_total" | "lessons_left"> & Partial<Pick<MembershipPaymentRow, "paid_through_forecast">>;

/** `null` for a calendar mode, and for a package nothing was paid for yet (no count to show). */
export function packageProgress(row: Row): PackageProgress | null {
  if (row.period_mode !== "lessons") return null;
  const total = Number(row.lessons_total);
  const leftRaw = row.lessons_left;
  if (!Number.isFinite(total) || total <= 0 || leftRaw === null || leftRaw === undefined) return null;
  const left = Math.max(0, Math.min(total, Number(leftRaw)));
  const used = total - left;
  const status = statusTone(row.status);
  const tone: PackageTone = left === 0 ? "danger" : status === "danger" ? "danger" : status === "warning" ? "warning" : status === "ok" ? "ok" : "muted";
  const day = typeof row.paid_through_forecast === "string" && /^\d{4}-\d{2}-\d{2}/.test(row.paid_through_forecast) ? `${row.paid_through_forecast.slice(8, 10)}.${row.paid_through_forecast.slice(5, 7)}` : null;
  let forecastLine: string | null = null;
  if (left === 0) forecastLine = "Пакет закончился";
  else if (day) forecastLine = `Хватит примерно до ${day} по расписанию`;
  else if (row.paid_through_forecast === null) forecastLine = "Прогноз недоступен";
  const verb = left === 1 ? "Остался" : "Осталось";
  return {
    total, left, used, percent: Math.round((used / total) * 100), tone,
    leftText: `${verb} ${left} из ${total} уроков`,
    forecastLine,
    forecastDay: left > 0 ? day : null,
    shortText: `${left}/${total} уроков`,
    ariaLabel: `Пакет уроков: использовано ${used} из ${total}`,
  };
}

/** The classes of the bar by tone: the tones of the status chips (green normal, amber when it runs out, red when used up). */
export const PACKAGE_FILL_CLASS: Record<PackageTone, string> = { ok: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-rose-500", muted: "bg-slate-400" };
export const PACKAGE_TEXT_CLASS: Record<PackageTone, string> = { ok: "text-emerald-700", warning: "text-amber-800", danger: "text-rose-700", muted: "text-slate-600" };

