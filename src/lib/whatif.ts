/**
 * «Деньги-1 / Б», Б3: the window «Что изменится» of a change of a price, of the billing mode and of the day of the shared month - for EVERY student the change moves:
 * «было → станет» in сум, in lessons and in dates (decision of the owner 06.11: the paid-but-not-begun is recalculated by the new price, so the window shows who and by how much BEFORE
 * the confirmation).  Pure: no React, no network.  The numbers and the summary sentence are the server's (`impact.money`, `regime_impact`); this file only arranges them as rows of a table.
 * Contract: `MONEY1_B_SERVER_REPORT.md` («Контракт для фронта» Б3, «Раунд R3»).
 */
import { daysBetween, formatDateRu, formatRecordWhen } from "./business-time";
import { formatMoney, formatSignedMoney, tidyMoneyText } from "./money-format";
import { daysLabel, lessonsWord, pluralRu } from "./plural";

const int = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};
const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export interface LessonsPack {
  covered: number;
  used: number;
  left: number;
  package_size: number;
}

/** The first period of the student that begins AFTER the change reaches him and costs another sum (a student who pays in time has no difference in his account that day, but the next period costs another). */
export interface NextPeriod {
  period_from: string;
  period_to: string;
  amount_before: number;
  amount_after: number;
  difference: number;
}

/** One student of a window of a price / of a mode; the fields after `text` are the window of a MODE only. */
export interface WhatIfItem {
  membership_id: string;
  student_name: string;
  debt_before: number;
  debt_after: number;
  advance_before: number;
  advance_after: number;
  paid_until_before: string | null;
  paid_until_after: string | null;
  has_money: boolean;
  charged_before: number;
  charged_after: number;
  lessons_before: LessonsPack | null;
  lessons_after: LessonsPack | null;
  next_period: NextPeriod | null;
  /** The server's own sentence about the student (the screen reader and the fallback). */
  text: string;
  switch_on: string | null;
  as_of: string | null;
  price_amount: number | null;
  price_unit_before: string | null;
  price_unit_after: string | null;
  per_lesson_before: number | null;
  per_lesson_after: number | null;
}

/** A student with an individual price: the number stays, the meaning of it may change. */
export interface OverrideStudent {
  membership_id: string;
  student_name: string;
  price: number;
  reason: string | null;
  group_price_before: number | null;
  group_price_after: number | null;
  difference_after: number | null;
  text: string | null;
}

export type WhatIfKind = "price" | "regime";

export interface WhatIfWindow {
  kind: WhatIfKind;
  /** The sentence over the list («Изменится у 3 учеников: долг вырастет на …»), the server's. */
  text: string;
  items: WhatIfItem[];
  itemsTotal: number;
  truncated: boolean;
  overrides: OverrideStudent[];
  overrideTotal: number;
  overrideTruncated: boolean;
  /** The day the accounts are read on (price: the day the price reaches the student). */
  asOf: string | null;
  nextPeriodStudents: number;
  nextPeriodDeltaTotal: number;
  lessonsLostTotal: number;
  /** The mode window: the charge in the first `horizonDays` days of the new way, before → after, for all. */
  chargedBeforeTotal: number | null;
  chargedAfterTotal: number | null;
  horizonDays: number | null;
  pendingPackageStudents: number;
}

const lessonsPack = (raw: unknown): LessonsPack | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<LessonsPack>;
  return { covered: int(r.covered), used: int(r.used), left: int(r.left), package_size: int(r.package_size) };
};

const nextPeriod = (raw: unknown): NextPeriod | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<NextPeriod>;
  const from = str(r.period_from);
  if (!from) return null;
  return { period_from: from, period_to: str(r.period_to) ?? from, amount_before: int(r.amount_before), amount_after: int(r.amount_after), difference: int(r.difference) };
};

export function normalizeWhatIfItem(raw: Partial<WhatIfItem> | null | undefined): WhatIfItem {
  const r = (raw ?? {}) as Partial<WhatIfItem>;
  const perBefore = r.per_lesson_before;
  const perAfter = r.per_lesson_after;
  return {
    membership_id: String(r.membership_id ?? ""),
    student_name: String(r.student_name ?? ""),
    debt_before: int(r.debt_before),
    debt_after: int(r.debt_after),
    advance_before: int(r.advance_before),
    advance_after: int(r.advance_after),
    paid_until_before: str(r.paid_until_before),
    paid_until_after: str(r.paid_until_after),
    has_money: Boolean(r.has_money),
    charged_before: int(r.charged_before),
    charged_after: int(r.charged_after),
    lessons_before: lessonsPack(r.lessons_before),
    lessons_after: lessonsPack(r.lessons_after),
    next_period: nextPeriod(r.next_period),
    text: String(r.text ?? ""),
    switch_on: str(r.switch_on),
    as_of: str(r.as_of),
    price_amount: typeof r.price_amount === "number" ? int(r.price_amount) : null,
    price_unit_before: str(r.price_unit_before),
    price_unit_after: str(r.price_unit_after),
    per_lesson_before: typeof perBefore === "number" ? int(perBefore) : null,
    per_lesson_after: typeof perAfter === "number" ? int(perAfter) : null,
  };
}

function normalizeOverride(raw: Partial<OverrideStudent> | null | undefined): OverrideStudent {
  const r = (raw ?? {}) as Partial<OverrideStudent>;
  const maybe = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null);
  return {
    membership_id: String(r.membership_id ?? ""),
    student_name: String(r.student_name ?? ""),
    price: int(r.price),
    reason: str(r.reason),
    group_price_before: maybe(r.group_price_before),
    group_price_after: maybe(r.group_price_after),
    difference_after: maybe(r.difference_after),
    text: str(r.text),
  };
}

/**
 * The window of a change of the price (`impact.money` of `PUT …/price` and `…/price-override`) or of the mode (`regime_impact` of `PUT /org/settings/payments?dry_run`) in one shape.
 * `null` when the server sent nothing (an older server, a role without money).
 */
export function normalizeWhatIf(raw: Record<string, unknown> | null | undefined, kind: WhatIfKind): WhatIfWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const items = list<Partial<WhatIfItem>>(raw.items).map(normalizeWhatIfItem);
  const overrides = list<Partial<OverrideStudent>>(raw.override_students).map(normalizeOverride);
  const maybe = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null);
  return {
    kind,
    text: tidyMoneyText(String(raw.text ?? "")),
    items,
    itemsTotal: Math.max(items.length, int(raw.items_total)),
    truncated: Boolean(raw.truncated),
    overrides,
    overrideTotal: Math.max(overrides.length, int(raw.override_total)),
    overrideTruncated: Boolean(raw.override_truncated),
    asOf: str(raw.as_of),
    nextPeriodStudents: int(raw.next_period_students),
    nextPeriodDeltaTotal: int(raw.next_period_delta_total),
    lessonsLostTotal: int(raw.lessons_lost_total),
    chargedBeforeTotal: maybe(raw.charged_before_total),
    chargedAfterTotal: maybe(raw.charged_after_total),
    horizonDays: maybe(raw.horizon_days),
    pendingPackageStudents: int(raw.pending_package_students),
  };
}

// ── The rows of the table ──────────────────────────────────────────────────

export type RowTone = "worse" | "better" | "plain";

/** «Долг · 0 сум → 100 000 сум · +100 000 сум»: one fact of one student in the table. */
export interface WhatIfRow {
  key: string;
  label: string;
  before: string;
  after: string;
  /** «+100 000 сум» / «−2 урока» / «−5 дней»; null when the change has no size (a unit of the price). */
  delta: string | null;
  tone: RowTone;
}

export interface WhatIfStudent {
  id: string;
  name: string;
  /** The meaning of the price in the new way, ONE line (not a number of the table): «Цена 300 000 сум: за общий месяц → за общий месяц с 10-го числа». */
  priceNote: string | null;
  /** The server's sentence about a student who has no row of numbers (counted by the server, never dropped silently). */
  fallback: string | null;
  /** «на 01.12» / «с 01.11, на 30.11» / «когда закончится пакет»: the day the numbers are read on. */
  when: string | null;
  rows: WhatIfRow[];
}

const NONE = "—";
const sumWord = (value: number): string => formatMoney(value);
/** One date format in the whole window: «ДД.ММ.ГГГГ» (a table and a record, UX pack §1). */
const dateOrNone = (iso: string | null): string => (iso ? formatRecordWhen(iso) : NONE);
const signedCount = (delta: number, unit: (n: number) => string): string => `${delta < 0 ? "−" : "+"}${Math.abs(delta)} ${unit(Math.abs(delta))}`;
const sumTone = (delta: number, risesIsWorse: boolean): RowTone => (delta === 0 ? "plain" : (delta > 0) === risesIsWorse ? "worse" : "better");

/** «Долг 0 → 100 000» is worse for the student when it rises; «Аванс», «Оплачено до», «Оплачено уроков» when they fall. */
export function whatIfStudentOf(item: WhatIfItem, kind: WhatIfKind): WhatIfStudent {
  const rows: WhatIfRow[] = [];
  const push = (row: WhatIfRow) => rows.push(row);
  const meaning = item.price_unit_before && item.price_unit_after && item.price_unit_before !== item.price_unit_after;
  let priceNote: string | null = null;
  if (kind === "regime" && meaning && item.price_amount) {
    priceNote = tidyMoneyText(`Цена ${formatMoney(item.price_amount)}: ${item.price_unit_before} → ${item.price_unit_after}`);
    if (item.per_lesson_before && item.per_lesson_after) {
      push({ key: "per-lesson", label: "≈ за урок", before: sumWord(item.per_lesson_before), after: sumWord(item.per_lesson_after), delta: formatSignedMoney(item.per_lesson_after - item.per_lesson_before), tone: sumTone(item.per_lesson_after - item.per_lesson_before, true) });
    }
  }
  if (kind === "regime" && item.switch_on !== null && item.charged_before !== item.charged_after) {
    const delta = item.charged_after - item.charged_before;
    push({ key: "charged", label: "Начислено за 30 дней", before: sumWord(item.charged_before), after: sumWord(item.charged_after), delta: formatSignedMoney(delta), tone: sumTone(delta, true) });
  }
  // a mode window whose debt IS the charge of the 30 days says it once (one fact - once)
  const chargeIsDebt = kind === "regime" && item.switch_on !== null && item.debt_before === item.charged_before && item.debt_after === item.charged_after;
  if (item.debt_before !== item.debt_after && !chargeIsDebt) {
    const delta = item.debt_after - item.debt_before;
    push({ key: "debt", label: "Долг", before: sumWord(item.debt_before), after: sumWord(item.debt_after), delta: formatSignedMoney(delta), tone: sumTone(delta, true) });
  }
  if (item.advance_before !== item.advance_after) {
    const delta = item.advance_after - item.advance_before;
    push({ key: "advance", label: "Аванс", before: sumWord(item.advance_before), after: sumWord(item.advance_after), delta: formatSignedMoney(delta), tone: sumTone(delta, false) });
  }
  if (item.paid_until_before !== item.paid_until_after) {
    const days = item.paid_until_before && item.paid_until_after ? daysBetween(item.paid_until_before, item.paid_until_after) : 0;
    push({
      key: "paid-until",
      label: "Оплачено до",
      before: dateOrNone(item.paid_until_before),
      after: dateOrNone(item.paid_until_after),
      delta: days !== 0 ? `${days < 0 ? "−" : "+"}${daysLabel(Math.abs(days))}` : null,
      tone: days === 0 ? "plain" : days < 0 ? "worse" : "better",
    });
  }
  const lb = item.lessons_before;
  const la = item.lessons_after;
  if (lb && la) {
    if (lb.covered !== la.covered) {
      const delta = la.covered - lb.covered;
      push({ key: "covered", label: "Оплачено уроков", before: String(lb.covered), after: String(la.covered), delta: signedCount(delta, lessonsWord), tone: sumTone(delta, false) });
    }
    if (lb.left !== la.left) {
      const delta = la.left - lb.left;
      push({ key: "left", label: "Осталось уроков", before: String(lb.left), after: String(la.left), delta: signedCount(delta, lessonsWord), tone: sumTone(delta, false) });
    }
  }
  const next = item.next_period;
  if (next) {
    push({
      key: "next-period",
      label: `Следующий период с ${formatRecordWhen(next.period_from)}`,
      before: sumWord(next.amount_before),
      after: sumWord(next.amount_after),
      delta: formatSignedMoney(next.difference),
      tone: sumTone(next.difference, true),
    });
  }
  let when: string | null = null;
  if (kind === "regime") {
    when = item.switch_on === null ? "когда закончится пакет" : `с ${formatRecordWhen(item.switch_on)}${item.as_of ? `, на ${formatRecordWhen(item.as_of)}` : ""}`;
  }
  // a price window says its day ONCE, over the table (`whatIfAsOfText`), not under every student
  return { id: item.membership_id, name: item.student_name, priceNote, fallback: rows.length === 0 && !priceNote ? item.text || null : null, when, rows };
}

/** The students of a window that really move (a student with nothing to show is not listed). */
export function whatIfStudents(window: WhatIfWindow | null | undefined): WhatIfStudent[] {
  if (!window) return [];
  return window.items.map((item) => whatIfStudentOf(item, window.kind)).filter((student) => student.rows.length > 0 || student.priceNote !== null || student.fallback !== null);
}

/** «ещё 14 учеников» under a truncated list; null when the list is whole. */
export function whatIfMoreText(window: WhatIfWindow | null | undefined): string | null {
  if (!window || !window.truncated) return null;
  const rest = window.itemsTotal - window.items.length;
  return rest > 0 ? `и ещё ${rest} ${pluralRu(rest, "ученик", "ученика", "учеников")}` : null;
}

/** «Остальные ученики с индивидуальной ценой: ещё 3»; null when the list is whole. */
export function overrideMoreText(window: WhatIfWindow | null | undefined): string | null {
  if (!window || !window.overrideTruncated) return null;
  const rest = window.overrideTotal - window.overrides.length;
  return rest > 0 ? `и ещё ${rest}` : null;
}

/** The line of a student with an individual price: «Юсупов Бек · 250 000 сум · цена группы 600 000 → 700 000 сум; число не меняется». */
export function overrideLine(student: OverrideStudent, kind: WhatIfKind): string {
  if (kind === "regime") return tidyMoneyText(student.text ?? `${student.student_name}: индивидуальная цена ${formatMoney(student.price)}`);
  const group = student.group_price_before !== null && student.group_price_after !== null && student.group_price_before !== student.group_price_after
    ? ` · цена группы ${formatMoney(student.group_price_before)} → ${formatMoney(student.group_price_after)}`
    : "";
  return tidyMoneyText(`${student.student_name} · ${formatMoney(student.price)}${group}`);
}

/** The title over the individual prices: they do not follow the change. */
export const OVERRIDES_TITLE = "Индивидуальная цена — не меняется";

/** The day the price reaches the student - for the caption over the table.  The window of ONE student's individual price says it in its own words (`single`). */
export function whatIfAsOfText(window: WhatIfWindow | null | undefined, single = false): string | null {
  if (window?.kind !== "price" || !window.asOf) return null;
  return single ? `Числа — на ${formatDateRu(window.asOf)}, когда начнёт действовать цена ученика` : `Числа — на ${formatDateRu(window.asOf)}, когда цена дойдёт до учеников`;
}

/** The line over the table: HOW MANY the change moves - the rows say who and by how much, so the sentence of the server is not repeated (one fact - once). */
export function whatIfCaption(window: WhatIfWindow | null | undefined): string | null {
  if (!window || window.items.length === 0) return null;
  // the students that are drawn + those the server counted beyond its cut of the list
  const n = whatIfStudents(window).length + Math.max(0, window.itemsTotal - window.items.length);
  return window.kind === "regime"
    ? `Перейдут на новый способ ${n} ${pluralRu(n, "ученик", "ученика", "учеников")}`
    : `Изменится у ${n} ${pluralRu(n, "ученика", "учеников", "учеников")}`;
}

/** When every student has the same meaning of the price, it is said ONCE over the table, not under every name. */
export function whatIfCommonPriceNote(students: ReadonlyArray<WhatIfStudent>): string | null {
  const notes = students.map((student) => student.priceNote);
  return notes.length > 0 && notes[0] !== null && notes.every((note) => note === notes[0]) ? notes[0] : null;
}


// ── The window of a change of the billing mode ─────────────────────────────

/** What the owner is changing: the way to count (a mode / a shared month), the day of the shared month, the size of a package. */
export type RegimeChangeKind = "mode" | "day" | "package";

export function regimeChangeKind(changes: Record<string, unknown>): RegimeChangeKind {
  if ("period_mode" in changes || "billing_anchor" in changes) return "mode";
  if ("billing_day" in changes) return "day";
  return "package";
}

export const REGIME_WINDOW: Record<RegimeChangeKind, { title: string; primary: string }> = {
  mode: { title: "Изменить способ оплаты?", primary: "Изменить способ оплаты" },
  day: { title: "Изменить день общего месяца?", primary: "Изменить день" },
  package: { title: "Изменить размер пакета?", primary: "Изменить размер пакета" },
};
export const REGIME_WAIT_WHY = "Кнопка включится, когда будет посчитано, что изменится";
