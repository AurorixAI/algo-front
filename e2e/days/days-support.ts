/**
 * Helpers of the «life of a student by days» project (TIME-TESTS, the days project).  Nothing here computes an expected number: the numbers live in the tests,
 * written by hand from the rules of the server, with the calculation in a comment (the formulas of support/time.ts are NOT used in this project).
 */
import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import { Org, runLesson, type GroupInfo, type LessonInfo, type Session, type StudentInfo } from "../support/api";
import { businessNow } from "../support/time";
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

/** The money reconciliation of THIS centre only (`python -m scripts.money_reconcile --apply --org <id>`, the product's own tool, run in the auth container of the stand). */
async function runReconcile(org: Org): Promise<{ out: string; code: number; summary: string }> {
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
  return { out, code, summary };
}

/**
 * The BASELINE of the centre: the first call, right after the centre is created (an empty centre: the product takes the baseline of its money rows, no comparison).
 * It must still be clean: one centre, nothing failed, no finding, nothing new, I-5 = 0.
 */
export async function reconcileBaseline(org: Org): Promise<void> {
  const { out, code, summary } = await runReconcile(org);
  expect(summary, `reconciliation baseline: ${out.slice(0, 600)}`).toMatch(/centres=1 failed=0 findings=0 new=0 /);
  expect(out, "reconciliation baseline").toMatch(/I-5=0/);
  expect(code, "reconciliation baseline: exit code").toBe(0);
}

/**
 * The reconciliation of the money of THIS centre after a «day» of a test (every call after the baseline): replaced records (I-5) 0, findings 0, nothing new, no
 * centre of the first night (`first_centres=0`: the baseline was taken at the creation) and nothing the night did not check (`not_checked=0`).
 *
 * A membership that appeared AFTER the baseline has no snapshot until the first run that sees it: the product counts it in `not_checked`
 * (`membership_no_snapshot`, "I-2 has nothing to compare on its first night") and `--apply` writes the snapshot.  That first look is allowed to leave exactly this
 * gap (named in the output, everything else clean); the call then repeats at once and the second look must be fully clean (`not_checked=0`).
 */
export async function reconcile(org: Org, when: string): Promise<void> {
  const clean = (r: { out: string; code: number; summary: string }, label: string) => {
    expect(r.summary, `${label}: ${r.out.slice(0, 600)}`).toMatch(/centres=1 failed=0 findings=0 new=0 /);
    expect(r.summary, `${label}: the baseline of the centre is taken once, at its creation`).toMatch(/ first_centres=0 /);
    expect(r.out, label).toMatch(/I-5=0/);
  };
  let look = await runReconcile(org);
  if (!/ not_checked=0$/.test(look.summary)) {
    clean(look, `reconciliation ${when} (first look)`);
    expect(look.out, `reconciliation ${when}: the only gap of a first look is a membership without a snapshot`).toMatch(/^not checked: membership_no_snapshot=\d+$/m);
    expect(look.out.split("\n").filter((line) => line.startsWith("not checked:")).length, `reconciliation ${when}: one gap line`).toBe(1);
    look = await runReconcile(org);
  }
  clean(look, `reconciliation ${when}`);
  expect(look.summary, `reconciliation ${when}: nothing may stay unchecked`).toMatch(/ not_checked=0$/);
  expect(look.code, `reconciliation ${when}: exit code`).toBe(0);
}


// ------------------------------------------------------------------------------------------------ the owner's screens used by the scenario «the 15th»

const two = (n: number) => String(n).padStart(2, "0");
/** The Monday of the week of an ISO date (UTC arithmetic: only the calendar matters). */
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
}
export function plusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
}

/** The group's schedule tab, on the week of `date` (the page opens on the week of the stand's today). */
export async function openWeek(page: Page, group: GroupInfo, date: string): Promise<void> {
  await page.goto(`/owner/groups/${group.id}?tab=schedule`);
  const weeks = (Date.parse(mondayOf(date)) - Date.parse(mondayOf(businessNow().date))) / (7 * 24 * 3600 * 1000);
  for (let i = 0; i < weeks; i++) await page.getByRole("button", { name: "Следующая неделя" }).click();
}

/** The card of the lesson (found by its topic, one per weekday) and its sheet. */
export async function openCard(page: Page, group: GroupInfo, lesson: { date: string; topic: string }) {
  await openWeek(page, group, lesson.date);
  const card = page.getByTestId("schedule-card").filter({ hasText: lesson.topic });
  await expect(card).toHaveCount(1);
  await card.click();
  const sheet = page.getByRole("dialog", { name: lesson.topic });
  await expect(sheet).toBeVisible();
  return { card, sheet };
}

/** The «Внести оплату» dialog of the student from the list «Ждём оплату»; returns the amount it proposes. */
export async function openPayDialog(page: Page, lastName: string) {
  await page.goto("/owner/payments?bucket=waiting");
  await page.getByRole("tab", { name: /Ждём оплату/ }).click();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: new RegExp(lastName) }) });
  await row.getByRole("button", { name: "Внести оплату" }).click();
  const dialog = page.getByRole("dialog", { name: "Оплата от ученика" });
  await expect(dialog).toBeVisible();
  const amountNow = async () => Number((await dialog.getByLabel("Сумма", { exact: true }).inputValue()).replace(/\D/g, ""));
  await expect.poll(amountNow, { message: "the dialog proposes a sum" }).toBeGreaterThan(0);
  return { dialog, amountNow };
}
