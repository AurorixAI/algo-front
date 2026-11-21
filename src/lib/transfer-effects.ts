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
  /** `due` only (a role with money): the last day of «к оплате» that stays with the group */
  due_until?: string | null;
}
export interface TransferEffects {
  kind: string;
  moves: EffectItem[];
  stays: EffectItem[];
  ends: EffectItem[];
}
/** One short row of «Что изменится»: «что» and «значение» (a sum, a day, a period of a pause); `value` null when the structure has none (a role without money: the fact alone). */
export interface EffectRow { key: string; label: string; value: string | null }
export interface EffectSection { key: "money" | "stays" | "ends"; title: string; rows: EffectRow[] }
export interface LeaveUndo { undone: boolean; text: string; restored: string[] }

export const SECTION_MONEY = "Перейдёт";
export const SECTION_ENDS = "Закончится";
export const staysTitle = (groupName: string) => (groupName ? `Останется в группе «${groupName}»` : "Останется в прошлой группе");
/** ONE vocabulary of the kinds of things a leaving / a transfer touches: «Что изменится» and the journal (what a cancelled leaving gave back) name them alike. */
export const KIND_INDIVIDUAL_PRICE = "Индивидуальная цена";
export const KIND_SCHEDULED_PRICE = "Цена";
export const KIND_PAUSE = "Пауза";
/** `restored` of a cancelled leaving ({individual_price: 1, scheduled_price: 1, pause: 2}) as short names: «индивидуальная цена», «цена с даты», «пауза ×2»; an unknown kind is not guessed. */
export function restoredNames(restored: Record<string, number> | null | undefined): string[] {
  if (!restored) return [];
  const times = (name: string, count: number) => (count > 1 ? `${name} ×${count}` : name);
  const out: string[] = [];
  for (const [key, count] of Object.entries(restored)) {
    if (typeof count !== "number" || count <= 0) continue;
    if (key === "individual_price") out.push(times(KIND_INDIVIDUAL_PRICE.toLowerCase(), count));
    else if (key === "scheduled_price") out.push(times(`${KIND_SCHEDULED_PRICE.toLowerCase()} с даты`, count));
    else if (key === "pause") out.push(times(KIND_PAUSE.toLowerCase(), count));
  }
  return out;
}
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
  return { kind: typeof source.kind === "string" ? source.kind : "", moves: items(source.moves), stays: items(source.stays), ends: items(source.ends) };
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
    // the sum that stays «к оплате» after the action (the student is still in the centre: his term goes on)
    case "due": { const day = dayOf(item.due_until ?? undefined); return { key, label: day ? `К оплате до ${day}` : "К оплате", value: sum(item.amount) }; }
    // a transfer where the money does not go: `money_stays` with a sum is the advance that stays («Аванс · N сум»); with 0 it is the calm line of the server (see `calmMoneyText`), not a row
    case "money_stays": return { key, label: "Аванс", value: sum(item.amount) };
    case "advance": return { key, label: "Аванс", value: sum(item.amount) };
    case "individual_price": return { key, label: KIND_INDIVIDUAL_PRICE, value: sum(item.amount) };
    case "scheduled_price": { const day = dayOf(item.valid_from); return day ? { key, label: `${KIND_SCHEDULED_PRICE} с ${day}`, value: sum(item.amount) } : { key, label: item.text, value: null }; }
    case "pause": { const period = periodShort(item.first_day, item.last_day); return period ? { key, label: KIND_PAUSE, value: period } : { key, label: item.text, value: null }; }
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
  // `money_stays` with 0 is a sentence, not a row; with a sum it is dropped when the same group's advance already came as its own `advance` entry (one advance, once)
  const stays = effects.stays.filter((item) => item.code !== "money_stays" || ((item.amount ?? 0) > 0 && !effects.stays.some((other) => other.code === "advance" && other.group_name === item.group_name)));
  const sections: EffectSection[] = [
    { key: "money", title: target ? `Перейдёт в «${target}»` : SECTION_MONEY, rows: rows(effects.moves) },
    { key: "stays", title: staysTitle(stays[0]?.group_name ?? ""), rows: rows(stays) },
    { key: "ends", title: SECTION_ENDS, rows: rows(effects.ends) },
  ];
  return sections.filter((section) => section.rows.length > 0);
}

/** The full sentences of the server of the block (under «Подробнее»), in the order of the rows. */
export function effectFullTexts(effects: TransferEffects): string[] {
  return [...effects.moves, ...effects.stays, ...effects.ends].map((item) => item.text);
}

/** `money_stays` with no sum to speak of (0): nothing to carry - ONE calm sentence in the words of the server instead of a paragraph; null otherwise. */
export function calmMoneyText(effects: TransferEffects): string | null {
  const calm = effects.stays.find((item) => item.code === "money_stays" && !((item.amount ?? 0) > 0));
  return calm ? calm.text : null;
}

export const effectsEmpty = (effects: TransferEffects): boolean => effects.moves.length + effects.stays.length + effects.ends.length === 0;

/** T5: the sum of the dry run (`moves[code=money].amount`) that the write sends back; null without the right to money (the server sends no sum) or when nothing moves. */
export function expectedCarriedOf(answer: unknown): number | null {
  const effects = effectsOfAnswer(answer);
  const money = effects?.moves.find((item) => item.code === "money");
  return typeof money?.amount === "number" && Number.isFinite(money.amount) ? money.amount : null;
}

/** The business day of the probe (`as_of` of the answer) - sent back as `expected_as_of`; null when the server did not say it. */
export function asOfOf(answer: unknown): string | null {
  const value = (answer as { as_of?: unknown } | null | undefined)?.as_of;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
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

/**
 * The bulk answer (`students[].leave_undo`, mode add and transfer), in the order of the answer: the students whose leaving is cancelled (`undone`) and those who come back in the ordinary way
 * (`ordinary`: `undone` false with the sentence of the server why - nothing is restored).
 */
export function leaveReturnsOfBulk(answer: unknown): { undone: Map<string, LeaveUndo>; ordinary: Map<string, LeaveUndo> } {
  const list = (answer as { students?: unknown } | null | undefined)?.students;
  const out = { undone: new Map<string, LeaveUndo>(), ordinary: new Map<string, LeaveUndo>() };
  if (!Array.isArray(list)) return out;
  list.forEach((item) => {
    const id = (item as { student_id?: unknown } | null)?.student_id;
    const undo = leaveUndoOf(item);
    if (typeof id === "string" && undo) (undo.undone ? out.undone : out.ordinary).set(id, undo);
  });
  return out;
}

/** A leaving / archiving window says only what ENDS (the debt and the advance that stay are the headline of its block - one number, once). */
export function endsOnly(effects: TransferEffects): TransferEffects {
  return { ...effects, moves: [], stays: [] };
}
