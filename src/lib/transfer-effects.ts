/**
 * Money-2 T3 / Э1: what a transfer, a leaving and an archiving MOVE, LEAVE BEHIND and END - read from the `effects` of the server (the dry run and the write say the same: И4).  Pure: the sections and the
 * sum of the dry run that rides back as `expected_carried` (T5), the leaving undone (`leave_undo`, T6) and the refusal «числа устарели».  Every sentence and every sum is the server's; the window adds titles only.
 */
export interface EffectItem {
  code: string;
  text: string;
  group_name?: string;
  amount?: number;
}
export interface TransferEffects {
  kind: string;
  moves: EffectItem[];
  stays: EffectItem[];
  ends: EffectItem[];
  /** The sentence of the money alone (a transfer): the carried sum, or the fact that nothing moves. */
  moneyText: string | null;
}
export interface EffectSection { key: "money" | "stays" | "ends" | "with"; title: string; rows: string[] }
export interface LeaveUndo { undone: boolean; text: string; restored: string[] }

export const SECTION_MONEY = "Перейдёт";
export const SECTION_ENDS = "Закончится";
export const SECTION_WITH = "Перейдёт вместе с учеником";
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

/** The blocks of the window in the order of the spec; a section without rows is not shown.  The money alone is «Перейдёт»; the rest that goes on (pauses, «Оплата с», paid days) is «Перейдёт вместе с учеником». */
export function effectSections(effects: TransferEffects): EffectSection[] {
  const rows = (list: EffectItem[]) => list.map((item) => item.text);
  const money = effects.moves.filter((item) => item.code === "money");
  const along = effects.moves.filter((item) => item.code !== "money");
  const sections: EffectSection[] = [
    { key: "money", title: SECTION_MONEY, rows: rows(money) },
    { key: "stays", title: staysTitle(effects.stays[0]?.group_name ?? ""), rows: rows(effects.stays) },
    { key: "ends", title: SECTION_ENDS, rows: rows(effects.ends) },
    { key: "with", title: SECTION_WITH, rows: rows(along) },
  ];
  return sections.filter((section) => section.rows.length > 0);
}

/** The sentence of the money when no money moves (nothing to carry): shown alone, without a title. */
export function lonelyMoneyText(effects: TransferEffects): string | null {
  return effects.moves.some((item) => item.code === "money") ? null : effects.moneyText;
}

export const effectsEmpty = (effects: TransferEffects): boolean => effectSections(effects).length === 0 && lonelyMoneyText(effects) === null;

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
