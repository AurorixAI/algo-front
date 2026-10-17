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

/** «Дилноза Каримова · 09.10.2026 16:35»: who wrote the reason and when (shown as written, Tashkent clock). */
export function reasonMeta(item: { reason_by?: { name: string } | null; reason_at?: string | null }): string {
  return reasonMetaOf(item.reason_by?.name, item.reason_at);
}

/** The same line from a flat record (the group journal keeps `reason_by_name`). */
export function reasonMetaOf(by: string | null | undefined, at: string | null | undefined): string {
  return [by, formatDateTimeRu(at)].filter(Boolean).join(" · ");
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

/** The decided tabs, first line: «Подтвердил: test admin» (the time and the note follow as muted text). */
export function excuseDecisionLabel(item: {
  status: string;
  reviewed_by?: { name: string } | null;
}): string {
  if (item.status !== "confirmed" && item.status !== "rejected") return "";
  const verb = item.status === "confirmed" ? "Подтвердил" : "Отклонил";
  const who = item.reviewed_by?.name?.trim();
  return who ? `${verb}: ${who}` : verb;
}

/**
 * When the decision was made: «15.10 16:35», with the year («15.10.2025 16:35») when it is not
 * `currentYear` (the year of the business "today"). "" when the time is missing or unreadable.
 */
export function excuseDecisionWhen(item: { reviewed_at?: string | null }, currentYear: string): string {
  const full = formatDateTimeRu(item.reviewed_at); // ДД.ММ.ГГГГ ЧЧ:ММ
  const match = /^(\d{2}\.\d{2})\.(\d{4}) (\d{2}:\d{2})$/.exec(full);
  if (!match) return "";
  return match[2] === currentYear ? `${match[1]} ${match[3]}` : `${match[1]}.${match[2]} ${match[3]}`;
}

/** The secondary line of a decided excuse: «15.10 16:35 · «Справка принесена в офис»» (no note -> just the time). */
export function excuseDecisionDetail(
  item: { reviewed_at?: string | null; review_note?: string | null },
  currentYear: string,
): string {
  const when = excuseDecisionWhen(item, currentYear);
  const note = item.review_note?.trim();
  return [when, note ? `«${note}»` : ""].filter(Boolean).join(" · ");
}

export const EXCUSE_PICKER_ACCEPT = "image/*,application/pdf";
/** A touch screen: «image/*» alone makes Android offer the camera next to the gallery (a PDF in the list hides it). */
export const EXCUSE_PICKER_ACCEPT_TOUCH = "image/*";

/** `accept` of the one certificate picker: photos and PDF on a desktop, photos only where the main pointer is a finger. */
export function excusePickerAccept(coarsePointer: boolean): string {
  return coarsePointer ? EXCUSE_PICKER_ACCEPT_TOUCH : EXCUSE_PICKER_ACCEPT;
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
