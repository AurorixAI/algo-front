/** PAY-F: the words of the setting «Уроки, отменённые центром, при помесячной оплате» (the screen is `components/payments/centre-cancel-setting.tsx`). */
export const CENTRE_CANCEL_TITLE = "Уроки, отменённые центром, при помесячной оплате";

export const CENTRE_CANCEL_OPTIONS: ReadonlyArray<{ value: boolean; label: string; hint: string }> = [
  { value: false, label: "Не пересчитывать", hint: "Отменённый центром урок не меняет оплату месяца (как раньше)." },
  { value: true, label: "Вычитать из следующей оплаты", hint: "Урок, отменённый «по вине центра», вычтут из следующей оплаты ученика. Праздники и выходные не пересчитываются. Действует для уроков с дня включения." },
];

/** A package never charges a cancelled lesson, so «Уроки, отменённые центром» is not a setting there: one quiet hint takes its place. */
export const PACKAGE_CANCEL_HINT_TITLE = "Отменённые уроки считаются автоматически";
export const PACKAGE_CANCEL_HINT_TEXT = "Из пакета списываются только проведённые уроки. Урок, отменённый по вине центра или в праздник, пакет не тратит — пакет продлится на следующий урок.";
