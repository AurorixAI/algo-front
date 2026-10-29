/**
 * IA audit F14: the status vocabularies of the owner / administrator screens in ONE place (they were copied: the exam statuses three times, the
 * diagnostic statuses twice, the money tones twice).  A status is a label and a tone of the chip palette (`lib/chip-tone.ts`).  Pure: no React.
 */
import type { ChipTone } from "./chip-tone";

export interface StatusView {
  label: string;
  tone: ChipTone;
}

/** Exam of the administrator's monitor (`/admin/exams`, `/admin/exams/[id]`). */
export const EXAM_STATUS: Record<string, StatusView> = {
  draft: { label: "Черновик", tone: "neutral" },
  variants_ready: { label: "Готов к назначению", tone: "info" },
  lobby: { label: "Запланирован", tone: "info" },          // #159: a fallback only - the screens say «Лобби открыто» / «Запланирован · день» by the lesson (`lobbyExamLabel`)
  active: { label: "Идёт экзамен", tone: "ok" },
  closed: { label: "Завершён", tone: "violet" },
  archived: { label: "В архиве", tone: "muted" },
};

export function examStatusView(status: string | null | undefined): StatusView {
  return EXAM_STATUS[status ?? ""] ?? EXAM_STATUS.draft;
}

/** Diagnostic invite of the administrator's list; `dot` is the colour of the dot of its badge. */
export const DIAGNOSTIC_STATUS: Record<string, StatusView & { dot: string }> = {
  pending: { label: "Ожидает", tone: "warn", dot: "bg-amber-400" },
  confirmed: { label: "Готов к началу", tone: "info", dot: "bg-blue-400" },
  in_progress: { label: "Проходит тест", tone: "violet", dot: "bg-purple-400" },
  completed: { label: "Завершён", tone: "ok", dot: "bg-emerald-400" },
  expired: { label: "Истёк", tone: "muted", dot: "bg-slate-400" },
};

export const DIAGNOSTIC_ENROLLED: StatusView & { dot: string } = { label: "Зачислен", tone: "ok", dot: "bg-emerald-500" };

/**
 * The tone of a money chip (`StatusTone` of `lib/payments.ts`: danger / warning / ok / free / muted) in the chip palette.  `okGreen`: the
 * chip of one membership (card, group tab) is green when paid; the rows of the «Оплаты» list keep a paid status grey (a quiet list).
 */
export function moneyChipTone(tone: string, okGreen = false): ChipTone {
  if (tone === "danger") return "danger";
  if (tone === "warning") return "warn";
  if (tone === "ok" && okGreen) return "ok";
  return "neutral";
}
