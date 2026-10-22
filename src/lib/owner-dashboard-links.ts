/**
 * IA audit F27: where the KPI cards and tiles of the owner's dashboard lead.  Pure: no React, so node:test loads it.  The owner has no
 * diagnostics (they are the administrator's): «Пройдено диагностик» and θ stay plain figures.
 */
import { pluralRu } from "./plural";

export function dashboardKpiHref(kpi: "students" | "staff"): string {
  return kpi === "students" ? "/owner/students" : "/owner/teachers";
}

export interface DashboardTile {
  key: "debt" | "attention" | "substitutions";
  label: string;
  value: string;
  href: string;
  tone: "alert" | "plain";
}

/**
 * The tiles under the KPIs: «Долг» (only a role that sees money; → the debtors tab), «Требуют внимания» (the unclosed lessons and the
 * absences waiting for a decision; → «Посещаемость») and the pending substitution requests (→ «Замены»).  A tile with nothing to do is not
 * drawn, except the debt, which says «Долга нет».
 */
export function dashboardTiles(input: {
  moneyAvailable: boolean;
  debtTotal: number;
  studentsWithDebt: number;
  attention: number;
  pendingSubstitutions: number;
  format: (amount: number) => string;
  debtorsHref: string;
}): DashboardTile[] {
  const tiles: DashboardTile[] = [];
  if (input.moneyAvailable) {
    const debt = Math.max(0, Math.round(Number(input.debtTotal) || 0));
    const students = Math.max(0, Math.floor(Number(input.studentsWithDebt) || 0));
    tiles.push({
      key: "debt",
      label: debt > 0 ? `Долг · ${students} ${pluralRu(students, "ученик", "ученика", "учеников")}` : "Долг",
      value: debt > 0 ? input.format(debt) : "Долга нет",
      href: input.debtorsHref,
      tone: debt > 0 ? "alert" : "plain",
    });
  }
  const attention = Math.max(0, Math.floor(Number(input.attention) || 0));
  if (attention > 0) tiles.push({ key: "attention", label: "Посещаемость: требуют внимания", value: String(attention), href: "/owner/attendance", tone: "alert" });
  const requests = Math.max(0, Math.floor(Number(input.pendingSubstitutions) || 0));
  if (requests > 0) tiles.push({ key: "substitutions", label: "Замены: ждут решения", value: String(requests), href: "/owner/substitutions", tone: "alert" });
  return tiles;
}
