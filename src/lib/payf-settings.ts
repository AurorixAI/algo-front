/** PAY-F: the words of the setting «Уроки, отменённые центром, при помесячной оплате» (the screen is `components/payments/centre-cancel-setting.tsx`). */
export const CENTRE_CANCEL_TITLE = "Уроки, отменённые центром, при помесячной оплате";

export const CENTRE_CANCEL_OPTIONS: ReadonlyArray<{ value: boolean; label: string; hint: string }> = [
  { value: false, label: "Не пересчитывать", hint: "Отменённый центром урок не меняет оплату месяца (как раньше)." },
  { value: true, label: "Вычитать из следующей оплаты", hint: "Урок, отменённый «по вине центра», вычтут из следующей оплаты ученика. Праздники и выходные не пересчитываются. Действует для уроков с дня включения." },
];

/** A package never charges a cancelled lesson, so «Уроки, отменённые центром» is not a setting there: one quiet hint takes its place. */
export const PACKAGE_CANCEL_HINT_TITLE = "Отменённые уроки считаются автоматически";
export const PACKAGE_CANCEL_HINT_TEXT = "Из пакета списываются только проведённые уроки. Урок, отменённый по вине центра или в праздник, пакет не тратит — пакет продлится на следующий урок.";

// ── «Настройки → Оплаты»: a calm section (owner 26.10).  Every long explanation is behind a «?», one short line stays. ──────────────────────

export const PAYMENTS_SECTION_DESCRIPTION = "Как считать оплату и кто может вносить оплаты.";
/** Behind the «?» of the section: what a change of the settings does to the money that is already booked. */
export const PAYMENTS_SECTION_HELP = "Внесённые оплаты не меняются: сумма долга и аванса пересчитывается по новым настройкам.";
export const HELP_LABEL = "Подробнее";

/** The three ways to count a payment: ONE line each (the long hint of `PAYMENT_MODELS` is the «?» of the card). */
export const PAYMENT_MODEL_SHORT_HINT: Record<"payment_date" | "fixed_day" | "lessons", string> = {
  payment_date: "Месяц считается с первого занятия ученика",
  fixed_day: "У всех один период, например с 1-го числа",
  lessons: "Оплата закрывает N проведённых уроков",
};

/** The accounting start is one quiet line at the top of the section; «Изменить» opens the date with its hint. */
export function accountingLineText(date: string): string {
  return `ALGO ведёт оплаты центра с ${date}`;
}
export const ACCOUNTING_CHANGE_LABEL = "Изменить";
export const ACCOUNTING_CANCEL_LABEL = "Не менять";
export const ACCOUNTING_DATE_LABEL = "Дата начала учёта оплат";
export const ACCOUNTING_HINT = {
  before: "До этой даты ничего не начисляется. Что ученики оплатили или были должны раньше — внесите в «",
  link: "Остатки на начало",
  after: "» (по одному или одним файлом Excel).",
};
/** Behind the «?» of the date field: the limit of the server. */
export const ACCOUNTING_LIMIT_HELP = "Не позже чем через 31 день от сегодня и не позже первой внесённой оплаты центра.";
export const BILLING_DAY_SHORT_HINT = "Новый ученик платит за неполный первый месяц — по урокам.";
