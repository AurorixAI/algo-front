/**
 * Helpers of the «life of a student by days» project (TIME-TESTS, the days project).  Nothing here computes an expected number: the numbers live in the tests,
 * written by hand from the rules of the server, with the calculation in a comment (the formulas of support/time.ts are NOT used in this project).
 */
import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import { Org, runLesson, type GroupInfo, type LessonInfo, type Session, type StudentInfo } from "../support/api";
import { expectStatementReconciles } from "../support/ui";

/** The ISO weekdays of a weekly schedule: Mon-Wed-Fri / Tue-Thu / Fri only. */
export const MON_WED_FRI = [1, 3, 5];
export const TUE_THU = [2, 4];
export const FRI = [5];

/** Weekly lessons of a group, all at 14:00-15:00 (the tests set the clock to 10:00 of a day, so a lesson of the day is still ahead). Returns the slot per weekday. */
export async function weekly(org: Org, group: GroupInfo, weekdays: number[]): Promise<Record<number, string>> {
  const slots: Record<number, string> = {};
  for (const dayOfWeek of weekdays) {
    const lesson = await org.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek, startTime: "14:00", endTime: "15:00", topic: "Дни" });
    slots[dayOfWeek] = lesson.id;
  }
  return slots;
}

/** The lesson of a weekly slot on a date, as the helpers of the lesson API want it. */
export const lessonOn = (group: GroupInfo, slotId: string, date: string): LessonInfo => ({ id: slotId, groupId: group.id, date, startTime: "14:00", endTime: "15:00" });

/** Mark a lesson of the day «был» for the students and finish it (the clock of the stand must be after 14:45: the finish opens 15 minutes before the end). */
export async function holdLesson(actor: Session, lesson: LessonInfo, students: StudentInfo[]): Promise<void> {
  await runLesson(actor, lesson, { records: Object.fromEntries(students.map((s) => [s.id, "present" as const])), complete: true });
}

export interface Row {
  status: string;
  debt: number;
  advance: number;
  refundable: number;
  paid_until: string | null;
  is_active: boolean;
  lessons_total: number | null;
  lessons_used: number | null;
  lessons_left: number | null;
  lessons_unpaid: number;
  paused: { first_day?: string; last_day?: string } | null;
  [key: string]: unknown;
}

/** The row of the student in the group on the page «Оплаты» of the API (`/org/students/{id}/memberships`). */
export async function rowOf(org: Org, student: StudentInfo, group: GroupInfo): Promise<Row> {
  const rows: any[] = await org.owner.api.get(`/auth/org/students/${student.id}/memberships`);
  const row = rows.find((r) => r.group_id === group.id);
  if (!row) throw new Error(`no membership of ${student.fullName} in ${group.name}`);
  return row as Row;
}

export interface Summary {
  charged: number;
  paid: number;
  transferred_in: number;
  transferred_out: number;
  written_off: number;
  refunded: number;
  debt: number;
  advance: number;
  paid_until: string | null;
  reconciles: boolean;
}

/** The totals of the statement of the student's membership in the group (the numbers of the tiles of the page «Выписка»). */
export async function summaryOf(org: Org, student: StudentInfo, group: GroupInfo): Promise<Summary> {
  const membership = await org.membershipId(student.id, group.id);
  const statement = await org.owner.api.get(`/auth/org/memberships/${membership}/statement`);
  return statement.summary as Summary;
}

/** The statement page: «Стоимость обучения» (the charged sum) as the owner reads it, and the totals reconcile. */
export async function statementCost(page: Page, membership: string): Promise<number> {
  await page.goto(`/owner/payments/statement/${membership}`);
  await expect(page.getByRole("heading", { name: "Выписка" })).toBeVisible();
  await expectStatementReconciles(page);
  const text = await page.getByTestId("statement-summary").innerText();
  const match = /Стоимость обучения\s+([\d\s]+?)\s*сум/.exec(text);
  if (!match) throw new Error(`no «Стоимость обучения» on the statement: ${JSON.stringify(text.slice(0, 200))}`);
  return Number(match[1].replace(/\s/g, ""));
}

/**
 * The reconciliation of the money of THIS centre only (`python -m scripts.money_reconcile --apply --org <id>`, the product's own tool, run in the auth
 * container of the stand): replaced records (I-5) 0 and findings 0.  Called after every «day» of a test.
 */
export async function reconcile(org: Org, when: string): Promise<void> {
  const me = await org.owner.api.get("/auth/org");
  const container = `${process.env.E2E_PROJECT || "algo-e2e"}-auth-1`;
  let out = "";
  let code = 0;
  try {
    out = execFileSync("docker", ["exec", container, "python", "-m", "scripts.money_reconcile", "--apply", "--org", String(me.id)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e: any) {
    out = String(e.stdout ?? "") + String(e.stderr ?? "");
    code = e.status ?? 1;
  }
  const summary = out.split("\n").find((line) => line.startsWith("mode=")) ?? out.slice(0, 300);
  expect(summary, `reconciliation ${when}: ${out.slice(0, 600)}`).toMatch(/centres=1 failed=0 findings=0 new=0 /);
  expect(out, `reconciliation ${when}`).toMatch(/I-5=0/);
  expect(code, `reconciliation ${when}: exit code`).toBe(0);
}
