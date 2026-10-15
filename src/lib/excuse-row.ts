/**
 * Pure helpers of one row/card of the «Пропуски» list (N13 P1.6): short names, the lesson line,
 * the certificate link text, the decision line and the journal deep link.
 * No React and no network, so node:test can load this file directly.
 */
import { formatDateTimeRu } from "./attendance-excuses";
import { journalHref } from "./open-lessons";

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** «Дилноза Каримова» -> «Д. Каримова»; one word stays as is; empty -> "". */
export function shortPersonName(full: string | null | undefined): string {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  const initial = Array.from(parts[0])[0].toLocaleUpperCase("ru");
  return `${initial}. ${parts[parts.length - 1]}`;
}

/** «2026-10-16» -> «16.10» (no Date object: the calendar day never drifts with the timezone). */
export function dayMonthRu(isoDate: string | null | undefined): string {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(isoDate ?? "");
  return match ? `${match[2]}.${match[1]}` : "";
}

/** «2026-10-15» -> «Чт, 15.10»; "" for anything that is not a real calendar day. */
export function lessonShortLabel(isoDate: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate ?? "");
  if (!match) return "";
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const real = new Date(Date.UTC(year, month - 1, day));
  if (real.getUTCFullYear() !== year || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) return "";
  return `${WEEKDAYS[real.getUTCDay()]}, ${match[3]}.${match[2]}`;
}

/** The link under the reason: «справка, 1 фото», «справка, 2 фото, 1 PDF»; «справки нет» when nothing is attached. */
export function excuseFilesLabel(files: ReadonlyArray<{ content_type: string }> | null | undefined): string {
  const list = files ?? [];
  if (list.length === 0) return "справки нет";
  const pdfs = list.filter((file) => file.content_type === "application/pdf").length;
  const photos = list.length - pdfs;
  const parts: string[] = [];
  if (photos > 0) parts.push(`${photos} фото`);
  if (pdfs > 0) parts.push(`${pdfs} PDF`);
  return `справка, ${parts.join(", ")}`;
}

/** The decided tabs: «Подтвердил: test admin · 15.10» (the time and the note go to the tooltip). */
export function excuseDecisionLabel(item: {
  status: string;
  reviewed_by?: { name: string } | null;
  reviewed_at?: string | null;
}): string {
  if (item.status !== "confirmed" && item.status !== "rejected") return "";
  const verb = item.status === "confirmed" ? "Подтвердил" : "Отклонил";
  const who = item.reviewed_by?.name?.trim();
  const day = formatDateTimeRu(item.reviewed_at).slice(0, 5);
  const tail = [who, day].filter(Boolean).join(" · ");
  return tail ? `${verb}: ${tail}` : verb;
}

/** `lesson_key` is `<date>_<lessonId>`: the id the journal highlights, or null when the key has another shape. */
export function excuseLessonId(item: { lesson_date: string; lesson_key?: string | null }): string | null {
  const prefix = `${item.lesson_date}_`;
  const key = item.lesson_key ?? "";
  return key.startsWith(prefix) && key.length > prefix.length ? key.slice(prefix.length) : null;
}

/** Group journal on the lesson's month with the lesson's column highlighted (`?tab=attendance&month=&lesson=&date=`). */
export function excuseJournalHref(
  groupsBasePath: string,
  item: { lesson_date: string; lesson_key?: string | null; group: { id: string } },
): string {
  return journalHref(groupsBasePath, {
    groupId: item.group.id,
    lessonDate: item.lesson_date,
    lessonId: excuseLessonId(item) ?? undefined,
  });
}
