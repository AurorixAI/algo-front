/** PAY-F: the words of the setting «Уроки, отменённые центром, при помесячной оплате» (the screen is `components/payments/centre-cancel-setting.tsx`). */
export const CENTRE_CANCEL_TITLE = "Уроки, отменённые центром, при помесячной оплате";

export const CENTRE_CANCEL_OPTIONS: ReadonlyArray<{ value: boolean; label: string; hint: string }> = [
  { value: false, label: "Не пересчитывать", hint: "Отменённый центром урок не меняет оплату месяца (как раньше)." },
  { value: true, label: "Вычитать из следующей оплаты", hint: "Урок, отменённый «по вине центра», вычтут из следующей оплаты ученика. Праздники и выходные не пересчитываются. Действует для уроков с дня включения." },
];
