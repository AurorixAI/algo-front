import { formatDayMonthRu } from "./business-time";
import { formatMoney } from "./money-format";
/**
 * Money-2 T3 / Э1: what a transfer, a leaving and an archiving MOVE, LEAVE BEHIND and END - read from the `effects` of the server (the dry run and the write say the same: И4).  Pure: the sections and the
 * sum of the dry run that rides back as `expected_carried` (T5), the leaving undone (`leave_undo`, T6) and the refusal «числа устарели».  Every sentence and every sum is the server's; the window adds titles only.
 */
export interface EffectItem {
  code: string;
  text: string;
  group_name?: string;
  amount?: number;
  first_day?: string;
  last_day?: string;
  date?: string;
  since?: string;
  valid_from?: string;
}
export interface TransferEffects {
  kind: string;
  moves: EffectItem[];
  stays: EffectItem[];
  ends: EffectItem[];
  /** The sentence of the money alone (a transfer): the carried sum, or the fact that nothing moves. */
  moneyText: string | null;
}
/** One short row of «Что изменится»: «что» and «значение» (a sum, a day, a period of a pause); `value` null when the structure has none (a role without money: the fact alone). */
export interface EffectRow { key: string; label: string; value: string | null }
export interface EffectSection { key: "money" | "stays" | "ends"; title: string; rows: EffectRow[] }
export interface LeaveUndo { undone: boolean; text: string; restored: string[] }

export const SECTION_MONEY = "Перейдёт";
export const SECTION_ENDS = "Закончится";
export const staysTitle = (groupName: string) => (groupName ? `Останется в группе «${groupName}»` : "Останется в прошлой группе");
export const BALANCE_CHANGED_TEXT = "Данные изменились — проверьте числа";

const items = (value: unknown): EffectItem[] =>
  Array.isArray(value)
    ? value.filter((item): item is EffectItem => Boolean(item) && typeof (item as EffectItem).text === "string" && (item as EffectItem).text.trim() !== "" && typeof (item as EffectItem).code === "string")
    : [];

/** `answer.effects` of a dry run / write; null when the server sent none (an older one) - then nothing is claimed. */
export function effectsOfAnswer(answer: unknown): TransferEffects | null {
  const raw = (answer as { effects?: unknown } | null | undefined)?.effects;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const moneyText = typeof source.money_text === "string" && source.money_text.trim() ? source.money_text : null;
  return { kind: typeof source.kind === "string" ? source.kind : "", moves: items(source.moves), stays: items(source.stays), ends: items(source.ends), moneyText };
}

/** «23–26.11» (one month) or «28.11–02.12»: a period of a pause from the two days of the server. */
export function periodShort(first: string | undefined, last: string | undefined): string | null {
  if (!first || !last) return null;
  const a = formatDayMonthRu(first);
  const b = formatDayMonthRu(last);
  if (!a || !b) return null;
  return a.slice(3) === b.slice(3) && first.slice(0, 4) === last.slice(0, 4) ? `${a.slice(0, 2)}–${b}` : `${a}–${b}`;
}

const sum = (amount: number | undefined): string | null => (typeof amount === "number" && Number.isFinite(amount) ? formatMoney(amount) : null);
const dayOf = (iso: string | undefined): string | null => (iso ? formatDayMonthRu(iso) || null : null);

/**
 * One item of the server as a short row «что → значение» by its CODE and its STRUCTURAL fields (the sum, the days).  An item whose code is not known, or whose field the server did not send, is
 * not guessed: the sentence of the server stands as the row (the full text is under «Подробнее» in any case).
 */
export function effectRow(item: EffectItem, index: number): EffectRow {
  const key = `${item.code}-${index}`;
  switch (item.code) {
    case "money": return { key, label: "Деньги ученика", value: sum(item.amount) };
    case "debt": return { key, label: "Долг", value: sum(item.amount) };
    case "advance": return { key, label: "Аванс", value: sum(item.amount) };
    case "individual_price": return { key, label: "Индивидуальная цена", value: sum(item.amount) };
    case "scheduled_price": { const day = dayOf(item.valid_from); return day ? { key, label: `Цена с ${day}`, value: sum(item.amount) } : { key, label: item.text, value: null }; }
    case "pause": { const period = periodShort(item.first_day, item.last_day); return period ? { key, label: "Пауза", value: period } : { key, label: item.text, value: null }; }
    case "billing_from": { const day = dayOf(item.date); return day ? { key, label: "«Оплата с»", value: day } : { key, label: item.text, value: null }; }
    default: return { key, label: item.text, value: null };
  }
}

/**
 * The blocks of the window as short rows.  What moves with the student (the money, the pauses, «Оплата с») is ONE block «Перейдёт в «цель»» (the target is named once, in its title; `target` is
 * the group the window is about); what stays is «Останется в «источник»»; what ends is «Закончится».  A section without rows is not shown.
 */
export function effectSections(effects: TransferEffects, target: string | null = null): EffectSection[] {
  const rows = (list: EffectItem[]) => list.map(effectRow);
  const sections: EffectSection[] = [
    { key: "money", title: target ? `Перейдёт в «${target}»` : SECTION_MONEY, rows: rows(effects.moves) },
    { key: "stays", title: staysTitle(effects.stays[0]?.group_name ?? ""), rows: rows(effects.stays) },
    { key: "ends", title: SECTION_ENDS, rows: rows(effects.ends) },
  ];
  return sections.filter((section) => section.rows.length > 0);
}

/** The full sentences of the server of the block (under «Подробнее»): the money alone, then what stays and ends, in the order of the rows. */
export function effectFullTexts(effects: TransferEffects): string[] {
  const texts = [...effects.moves, ...effects.stays, ...effects.ends].map((item) => item.text);
  const lonely = lonelyMoneyText(effects);
  return lonely ? [lonely, ...texts] : texts;
}

/** The sentence of the money when no money moves (nothing to carry): shown alone, without a title. */
export function lonelyMoneyText(effects: TransferEffects): string | null {
  return effects.moves.some((item) => item.code === "money") ? null : effects.moneyText;
}

export const effectsEmpty = (effects: TransferEffects): boolean => effects.moves.length + effects.stays.length + effects.ends.length === 0 && lonelyMoneyText(effects) === null;

/** T5: the sum of the dry run (`moves[code=money].amount`) that the write sends back; null without the right to money (the server sends no sum) or when nothing moves. */
export function expectedCarriedOf(answer: unknown): number | null {
  const effects = effectsOfAnswer(answer);
  const money = effects?.moves.find((item) => item.code === "money");
  return typeof money?.amount === "number" && Number.isFinite(money.amount) ? money.amount : null;
}

/** T5: 409 `BALANCE_CHANGED` - nothing is written, the numbers must be looked at again. */
export function isBalanceChanged(error: unknown): boolean {
  const source = error as { code?: unknown; detail?: { code?: unknown } | null } | null | undefined;
  return (source?.code ?? source?.detail?.code) === "BALANCE_CHANGED";
}

/** T6: `leave_undo` of a dry run / write - null for an ordinary entry; `undone` false: the return is ordinary and the text says why. */
export function leaveUndoOf(answer: unknown): LeaveUndo | null {
  const raw = (answer as { leave_undo?: unknown } | null | undefined)?.leave_undo as { undone?: unknown; text?: unknown; restored?: unknown } | null | undefined;
  if (!raw || typeof raw !== "object" || typeof raw.text !== "string" || !raw.text.trim()) return null;
  const restored = Array.isArray(raw.restored) ? raw.restored.map((item) => (item as { text?: unknown } | null)?.text).filter((text): text is string => typeof text === "string" && text.trim() !== "") : [];
  return { undone: raw.undone === true, text: raw.text, restored };
}

/** A leaving / archiving window says only what ENDS (the debt and the advance that stay are the headline of its block - one number, once). */
export function endsOnly(effects: TransferEffects): TransferEffects {
  return { ...effects, moves: [], stays: [], moneyText: null };
}
