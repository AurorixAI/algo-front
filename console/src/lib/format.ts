import { displayPhone } from "@/lib/phone";
import { formatUtcNaiveAsBusinessDate, formatUtcNaiveAsBusinessDateTime } from "@/lib/business-time";

export const DASH = "—";

/** «25.10.2026 14:30» on the Tashkent clock (the server sends UTC with a Z). */
export function fmtDateTime(value: string | null | undefined): string {
  return formatUtcNaiveAsBusinessDateTime(value) || DASH;
}

export function fmtDate(value: string | null | undefined): string {
  return formatUtcNaiveAsBusinessDate(value) || DASH;
}

export function fmtPhone(value: string | null | undefined): string {
  return displayPhone(value) || DASH;
}

export function fmtCount(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : String(value);
}

/** «Иванов Иван» -> «ИИ» for the round badge. */
export function initials(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

/** `utm_source=instagram, utm_campaign=autumn` -> «instagram · autumn»; the first tags that carry a value. */
export function sourceLabel(source: Record<string, string> | null | undefined): string {
  if (!source) return DASH;
  const parts = [source.utm_source, source.utm_campaign || source.utm_medium].filter((part): part is string => Boolean(part && part.trim()));
  if (parts.length) return parts.join(" · ");
  return source.referrer?.trim() || DASH;
}

/** `YYYY-MM-DD` of a date field, or "" when it is not one. */
export function onlyDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}
