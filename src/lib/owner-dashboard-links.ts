/**
 * IA audit F27: where the KPI cards and tiles of the owner's dashboard lead.  Pure: no React, so node:test loads it.  The owner has no
 * diagnostics (they are the administrator's): «Пройдено диагностик» and θ stay plain figures.
 */
import { pluralRu } from "./plural";

export function dashboardKpiHref(kpi: "students" | "staff"): string {
  return kpi === "students" ? "/owner/students" : "/owner/teachers";
}

export interface DashboardMoneyRow {
  key: "debt" | "due";
  label: string;
  value: string;
  href: string;
  tone: "alert" | "due" | "plain";
}

export type DashboardTile =
  /** The money of the centre: ONE tile with two rows - «Долг» (the term has passed) and «К оплате» (still within it). */
  | { key: "money"; rows: DashboardMoneyRow[] }
  | { key: "attention" | "substitutions"; label: string; value: string; href: string; tone: "alert" | "plain" };

/**
 * The tiles under the KPIs: the money (only a role that sees it; one tile, two rows: «Долг N сум · K учеников» → the debtors tab, «К оплате N сум · K учеников» → its tab), «Требуют внимания» (the unclosed lessons and the
 * absences waiting for a decision; → «Посещаемость») and the pending substitution requests (→ «Замены»).  A tile with nothing to do is not drawn, except the debt, which says «Долга нет»; the row «К оплате» is there only
 * while something is to be paid.  The sums and the numbers of students are the server's (`/org/payments/summary`).
 */
export function dashboardTiles(input: {
  moneyAvailable: boolean;
  debtTotal: number;
  debtors: number;
  dueTotal: number;
  dueStudents: number;
  attention: number;
  pendingSubstitutions: number;
  format: (amount: number) => string;
  debtorsHref: string;
  dueHref: string;
}): DashboardTile[] {
  const tiles: DashboardTile[] = [];
  const whole = (value: number) => Math.max(0, Math.round(Number(value) || 0));
  const students = (value: number) => Math.max(0, Math.floor(Number(value) || 0));
  if (input.moneyAvailable) {
    const debt = whole(input.debtTotal);
    const debtors = students(input.debtors);
    const due = whole(input.dueTotal);
    const dueStudents = students(input.dueStudents);
    const rows: DashboardMoneyRow[] = [{
      key: "debt",
      label: debt > 0 ? `Долг · ${debtors} ${pluralRu(debtors, "ученик", "ученика", "учеников")}` : "Долг",
      value: debt > 0 ? input.format(debt) : "Долга нет",
      href: input.debtorsHref,
      tone: debt > 0 ? "alert" : "plain",
    }];
    if (due > 0) rows.push({ key: "due", label: `К оплате · ${dueStudents} ${pluralRu(dueStudents, "ученик", "ученика", "учеников")}`, value: input.format(due), href: input.dueHref, tone: "due" });
    tiles.push({ key: "money", rows });
  }
  const attention = Math.max(0, Math.floor(Number(input.attention) || 0));
  if (attention > 0) tiles.push({ key: "attention", label: "Посещаемость: требуют внимания", value: String(attention), href: "/owner/attendance", tone: "alert" });
  const requests = Math.max(0, Math.floor(Number(input.pendingSubstitutions) || 0));
  if (requests > 0) tiles.push({ key: "substitutions", label: "Замены: ждут решения", value: String(requests), href: "/owner/substitutions", tone: "alert" });
  return tiles;
}
