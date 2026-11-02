/**
 * Month arithmetic on `YYYY-MM-DD` dates, shared by the income screen (`payments-income-v2.ts`).
 * (The first PAY-2 report - period picker, drill-downs, series filling - was replaced by v2 and is gone.)
 */

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string): string {
  const [year, month] = iso.slice(0, 7).split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export function shiftMonth(iso: string, delta: number): string {
  const [year, month] = iso.slice(0, 7).split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
}
