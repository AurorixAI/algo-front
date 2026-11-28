import { test, expect } from "../support/fixtures";
import { Org, type GroupInfo, type LessonInfo, type Staff } from "../support/api";
import { addDays, businessNow, requireBillingDayStand, weekdayOf } from "../support/time";
import { clockReaches } from "../support/clock";
import { expectNoHorizontalScroll, moneyPattern } from "../support/ui";

/**
 * LESSON-RULES (26.11): «Урока не было» of a PAST lesson said by a teacher waits for the owner.
 *  1. the teacher reports -> the owner sees the row in «Замены → Ждут решения» (the words of the teacher, «Решить») -> confirms «По вине центра» -> the teacher reads the outcome in «Запросы и изменения уроков»;
 *  2. the teacher reports and takes his report back («Отозвать») before the owner decides -> the owner's list is empty again and the lesson is back among the lessons without a mark.
 * Written for the gate of the screens (run by the lead: `npm run e2e`); the lesson is a one-minute lesson of «this very minute» that the stand clock has left behind (`createEndedLesson`): it is over, so its cancellation is a REPORT.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Правила уроков");
});

/**
 * A lesson that is OVER by the clock of the stand: the server reconciles (and a teacher reports) only a lesson whose time has ended ("current minute > end minute").
 * A lesson cannot be created in the past, and the stand clock must not be moved (it is shared by the parallel workers), so: a ONE-minute lesson of «this very minute»
 * and a wait (at most ~2 minutes of the stand clock) until the minute after its end.
 */
async function createEndedLesson(centre: Org, groupId: string): Promise<LessonInfo> {
  const lesson = await centre.createLessonStartingNow(groupId, centre.owner, 1);
  const [hours, minutes] = lesson.endTime.split(":").map(Number);
  await clockReaches(hours * 60 + minutes + 1, 150);
  return lesson;
}

async function worldWithPastLesson(label: string) {
  const teacher = await org.addStaff("teacher", `Отчитавшийся${label}`);
  const group = await org.createGroup({ name: `Группа П${label}`, teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 600000);
  await org.addStudent(group, "Анвар", `Ученик${label}`);
  const lesson = await createEndedLesson(org, group.id);
  return { teacher, group, lesson };
}

const report = (teacher: { api: { post: (path: string, body: unknown) => Promise<unknown> } }, group: { id: string }, lesson: { id: string; date: string }, reason: string) =>
  teacher.api.post(`/auth/org/groups/${group.id}/attendance/reconcile/cancel`, { lessonDate: lesson.date, lessonId: lesson.id, cancellationReason: reason });

test("the teacher reports «урока не было» -> the owner confirms «По вине центра» -> the teacher sees the outcome", async ({ signIn }) => {
  test.setTimeout(300_000);
  const { teacher, group, lesson } = await worldWithPastLesson("1");
  await report(teacher as never, group, lesson, "Отключили свет");

  // the owner: the row of the waiting cancellation, then the window with three outcomes
  const ownerPage = await signIn(org.owner);
  await ownerPage.goto("/owner/substitutions");
  const row = ownerPage.getByTestId("waiting-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Урока не было: Отключили свет");   // the words of the teacher, as the server gave them
  await expect(row).toContainText(group.name);
  await expect(ownerPage.getByRole("tab", { name: /Ждут решения \(1\)/ })).toBeVisible();   // the number of the tab is the server's waitingTotal
  await row.getByRole("button", { name: /Решить отмену/ }).click();
  const dialog = ownerPage.getByRole("dialog");
  await expect(dialog.getByText("Что произошло на самом деле?")).toBeVisible();
  await expect(dialog.getByTestId("waiting-confirm")).toBeDisabled();
  await dialog.getByText("По вине центра", { exact: true }).click();
  await expect(dialog.getByTestId("waiting-caption")).toContainText("Преподавателю урок не оплачивается");
  await dialog.getByRole("button", { name: "Подтвердить: по вине центра" }).click();
  await expect(ownerPage.getByTestId("waiting-row")).toHaveCount(0);
  await expect(ownerPage.getByRole("tab", { name: /Ждут решения \(0\)/ })).toBeVisible();

  // the history of the owner names the outcome in ONE chip
  await ownerPage.getByRole("tab", { name: "История" }).click();
  await expect(ownerPage.getByTestId("outcome-chip").first()).toHaveText("Отменён: по вине центра");

  // the teacher: the block «Запросы и изменения уроков» says the outcome, nothing to take back any more
  const teacherPage = await signIn(teacher);
  await teacherPage.goto("/teacher/dashboard");
  const mine = teacherPage.getByRole("region", { name: "Запросы и изменения уроков" });
  await expect(mine.getByText("Отменён: по вине центра")).toBeVisible();
  await expect(mine.getByRole("button", { name: /Отозвать отмену/ })).toHaveCount(0);
});

test("the teacher reports and takes the report back -> nothing waits for the owner, the lesson is without a mark again", async ({ signIn }) => {
  test.setTimeout(300_000);
  const { teacher, group, lesson } = await worldWithPastLesson("2");
  await report(teacher as never, group, lesson, "Ошибся датой");

  const teacherPage = await signIn(teacher);
  await teacherPage.goto("/teacher/dashboard");
  const mine = teacherPage.getByRole("region", { name: "Запросы и изменения уроков" });
  await expect(mine.getByText("Отмена ждёт подтверждения")).toBeVisible();
  // «Отозвать» stands only where the server says canWithdraw: the lesson of this minute is inside the window
  await expect(mine.getByRole("button", { name: /Отозвать отмену/ })).toHaveCount(1);
  await mine.getByRole("button", { name: /Отозвать отмену/ }).click();
  await expect(mine.getByText("Отмена ждёт подтверждения")).toHaveCount(0);

  const ownerPage = await signIn(org.owner);
  await ownerPage.goto("/owner/substitutions");
  await expect(ownerPage.getByTestId("waiting-row")).toHaveCount(0);
  // the lesson is among the lessons without a mark again (the teacher's «Ближайшее действие» asks him to settle it)
  await teacherPage.reload();
  await expect(teacherPage.getByTestId("next-action-card")).toContainText(group.name);
});

test("the teacher takes his report back FROM THE JOURNAL of the group (where he sees the cancellation): «Отозвать отмену» is in the column menu, the lesson is not waiting afterwards", async ({ signIn }) => {
  test.setTimeout(300_000);
  const { teacher, group, lesson } = await worldWithPastLesson("4");
  await report(teacher as never, group, lesson, "Ошибся датой");
  const page = await signIn(teacher);
  await page.goto(`/teacher/groups/${group.id}?tab=attendance`);
  const column = page.locator(`th[data-lesson-key="${lesson.date}_${lesson.id}"]`);
  await expect(column, "the head of the column says the cancellation waits, and who wrote it").toHaveAttribute("title", /Сообщил: .*, преподаватель/);
  await column.locator("[data-column-menu-trigger]").click();
  const item = page.getByRole("menuitem", { name: /Отозвать отмену урока/ });
  await expect(item).toHaveCount(1);
  await item.click();
  await expect(page.getByRole("status").filter({ hasText: "Отмена отозвана" })).toBeVisible();
  await expect(column, "the journal is read again: the lesson no longer waits for the owner").not.toHaveAttribute("title", /ждёт подтверждения|Сообщил/);
  const ownerPage = await signIn(org.owner);
  await ownerPage.goto("/owner/substitutions");
  await expect(ownerPage.getByTestId("waiting-row")).toHaveCount(0);
});

/**
 * The journal of a group on a PHONE (375; the project @mobile): the «⋯» of the first column of a lesson lies wholly inside the window and opens its menu with an ordinary press
 * (it lay beyond the edge of the screen: the press scrolled the table and that scroll closed the menu).
 */
test("@mobile the journal on a phone: the «⋯» of the first column is inside the window and the menu opens with an ordinary press and stays", async ({ signIn }) => {
  test.setTimeout(300_000);
  const { group } = await worldWithPastLesson("3");
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}?tab=attendance`);
  const trigger = page.locator("th[data-lesson-key] [data-column-menu-trigger]").first();
  await expect(trigger).toBeVisible();
  const box = await trigger.boundingBox();
  const width = page.viewportSize()?.width ?? 375;
  expect(box, "the trigger has a box").not.toBeNull();
  expect(box!.x, "«⋯» starts inside the window").toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `«⋯» ends inside the window (${width})`).toBeLessThanOrEqual(width);
  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  // two frames later (the scroll that used to close the menu has happened by then): the menu is still open
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  await expect(page.getByRole("menu"), "no scroll closed the menu").toBeVisible();
});

// ── the MONEY of the three outcomes, the roles and the phone ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//
// THE HAND CALCULATION (the centre is in «Общий месяц», the recalculation «Уменьшать долг сразу» is on; the student joins TODAY, so his period is [today, the same day of the next month - 1]):
//   the schedule of the group is THREE weekdays (today's weekday, +2, +4 - rule 137: 2-3 days a week);  N = the number of those weekdays in the period (counted below by the calendar: 12 or 13);
//   the price of the group is N x 50 000 sum - so ONE lesson of the period costs exactly 50 000 sum, whatever N is and however the server rounds;
//   «по вине центра»  -> the student's debt for the period falls by ONE lesson: recalculated 0 -> 50 000, unpaid (charged - paid - recalculated) -50 000;  the window says «по 50 000 сум, всего 50 000 сум»;
//   «праздник»        -> no recalculation: recalculated stays 0, unpaid stays;  the window says «Ученикам: без перерасчёта»;
//   «Урок был»        -> the cancellation is taken off: recalculated 0, unpaid stays, the lesson stands among the lessons without a mark (the teacher marks it);  the window says «Отмена снимается».
// Checked against the server code (C13), not run here: the settings keys period_mode / billing_anchor / billing_day / accounting_start_date / centre_cancel_recalc / admin_can_manage are the fields of the settings
// PUT (payments_schemas.py); the statement has summary.recalculated / summary.unpaid / summary.reconciles and rows of type «recalc» with details.recalc.amount (StatementOut); a role without the money right who
// cancels a lesson that has begun through reconcile/cancel writes `unconfirmed` (lesson_cancel.py, `past_cancel_needs_confirmation` is on by default); the window's sentences are centre_text / holiday_text /
// held_text of the dry run (the server writes «1 ученику» for one student).
// While the cancellation WAITS nothing moves (the statement before the decision = the statement before the report).
const PER_LESSON = 50_000;
const wrap = (weekday: number) => ((weekday - 1 + 7) % 7) + 1;

/** The weekdays of the schedule: today's, +2 and +4 days (three a week). */
function threeWeekdays(): number[] {
  const today = businessNow().isoWeekday;
  return [today, wrap(today + 2), wrap(today + 4)];
}

/** N: the lessons of the three weekdays in the period [today, the same day of the next month - 1]. */
function lessonsInPeriod(start: string, weekdays: number[]): number {
  const [year, month, day] = start.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);   // the month index counts from 0: `month` IS the next month
  let count = 0;
  for (let date = start; date < end; date = addDays(date, 1)) if (weekdays.includes(weekdayOf(date))) count += 1;
  return count;
}

/** The four numbers of an account that a waiting / withdrawn cancellation must not move - compared field by field (the rest of the summary may carry fields that change for their own reasons). */
const accountOf = (summary: { charged: number; paid?: number; recalculated: number; unpaid: number }) => ({ charged: summary.charged, paid: summary.paid, recalculated: summary.recalculated, unpaid: summary.unpaid });

async function moneyWorld(label: string, { adminWithoutRight = false } = {}) {
  const centre = await Org.create(`Деньги правил ${label}`);
  const today = businessNow();
  const weekdays = threeWeekdays();
  const lessons = lessonsInPeriod(today.date, weekdays);
  // N (the lessons of the period) depends on the month and reaches 14: the sums below are counted from N, never from a fixed number of lessons
  expect(lessons).toBeGreaterThan(0);
  const teacher = await centre.addStaff("teacher", `Отчитавшийся${label}`);
  const group = await centre.createGroup({ name: `Группа Д${label}`, teacherId: teacher.userId });
  await centre.setGroupPrice(group.id, lessons * PER_LESSON);
  const lesson = await createEndedLesson(centre, group.id);   // today's weekday, over by the stand clock
  for (const dayOfWeek of weekdays.slice(1)) {
    await centre.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek, startTime: "10:00", endTime: "11:00", topic: "E2E" });
  }
  await centre.setPaymentSettings({ accounting_start_date: today.date, period_mode: "calendar", billing_anchor: "fixed_day", billing_day: today.day, centre_cancel_recalc: true });
  const student = await centre.addStudent(group, "Тимур", `Деньги${label}`);   // AFTER the switch: his period starts today
  const membership = await centre.membershipId(student.id, group.id);
  const admin = adminWithoutRight ? await centre.addStaff("admin", `Безденежная${label}`) : null;
  if (adminWithoutRight) await centre.setPaymentSettings({ admin_can_manage: false });
  const statement = async () => {
    const out = await centre.owner.api.get(`/auth/org/memberships/${membership}/statement`);
    return { summary: out.summary as { recalculated: number; unpaid: number; charged: number; paid?: number; reconciles: boolean }, recalcRows: (out.rows as Array<{ type: string; details?: { recalc?: { amount: number } } }>).filter((row) => row.type === "recalc") };
  };
  return { centre, teacher, group, lesson, student, admin, statement };
}

const reportBy = (who: Staff, group: GroupInfo, lesson: LessonInfo, reason: string) =>
  who.api.post(`/auth/org/groups/${group.id}/attendance/reconcile/cancel`, { lessonDate: lesson.date, lessonId: lesson.id, cancellationReason: reason });

const OUTCOMES = [
  { key: "centre", label: "По вине центра", button: "Подтвердить: по вине центра", caption: new RegExp(`Перерасчёт\\s+1\\s+ученику\\s+по\\s+${moneyPattern(PER_LESSON)}\\s+сум,\\s+всего\\s+${moneyPattern(PER_LESSON)}\\s+сум`), toast: "Отмена подтверждена: по вине центра", recalculated: PER_LESSON },
  { key: "holiday", label: "Праздник, выходной", button: "Подтвердить: праздник, выходной", caption: /Ученикам: без перерасчёта/, toast: "Отмена подтверждена: праздник, выходной", recalculated: 0 },
  { key: "held", label: "Урок был", button: "Вернуть урок на отметку", caption: /Отмена снимается/, toast: "Урок возвращён на отметку", recalculated: 0 },
] as const;

for (const outcome of OUTCOMES) {
  test(`money: the teacher reports, the owner sees the sum BEFORE and the student's statement AFTER - «${outcome.label}» (${outcome.recalculated === 0 ? "no recalculation" : `recalculation ${PER_LESSON}`})`, async ({ signIn }) => {
    requireBillingDayStand();
    test.setTimeout(300_000);
    const world = await moneyWorld(`${outcome.key}`);
    const before = await world.statement();
    expect(before.summary.recalculated).toBe(0);
    await reportBy(world.teacher, world.group, world.lesson, "Отключили свет");
    const waiting = await world.statement();
    expect(accountOf(waiting.summary), "while the cancellation WAITS no account moves").toEqual(accountOf(before.summary));
    expect(waiting.recalcRows).toHaveLength(0);

    const ownerPage = await signIn(world.centre.owner);
    await ownerPage.goto("/owner/substitutions");
    await ownerPage.getByTestId("waiting-row").getByRole("button", { name: /Решить отмену/ }).click();
    const dialog = ownerPage.getByRole("dialog");
    await dialog.getByText(outcome.label, { exact: true }).click();
    await expect(dialog.getByTestId("waiting-caption"), "the window says the sum BEFORE the decision (the server's dry run)").toContainText(outcome.caption);
    await dialog.getByRole("button", { name: outcome.button }).click();
    await expect(ownerPage.getByRole("status").filter({ hasText: outcome.toast })).toBeVisible();   // the toast names the outcome
    await expect(ownerPage.getByTestId("waiting-row")).toHaveCount(0);

    // the statement AFTER: the server's account, compared with the hand calculation of the header of this block
    await expect.poll(async () => (await world.statement()).summary.recalculated).toBe(outcome.recalculated);
    const after = await world.statement();
    expect(after.summary.unpaid).toBe(before.summary.unpaid - outcome.recalculated);
    expect(after.summary.reconciles).toBe(true);
    expect(after.recalcRows).toHaveLength(outcome.recalculated > 0 ? 1 : 0);
    if (outcome.recalculated > 0) expect(after.recalcRows[0].details?.recalc?.amount).toBe(PER_LESSON);
    if (outcome.key === "held") {
      // the lesson is without a mark again: the teacher's «Ближайшее действие» asks him to settle it, nothing is left to wait for
      const teacherPage = await signIn(world.teacher);
      await teacherPage.goto("/teacher/dashboard");
      await expect(teacherPage.getByTestId("next-action-card")).toContainText(world.group.name);
    }
  });
}

test("roles: an administrator WITHOUT the money right sees «решает владелец» with no sums, takes back HIS cancellation; the owner then has nothing to decide", async ({ signIn }) => {
  requireBillingDayStand();
  test.setTimeout(300_000);
  const world = await moneyWorld("admin", { adminWithoutRight: true });
  const admin = world.admin!;
  const before = await world.statement();
  await reportBy(admin, world.group, world.lesson, "Преподаватель заболел");   // a PAST lesson cancelled by a role without the money right waits for the owner
  expect(accountOf((await world.statement()).summary), "waiting: no account moves").toEqual(accountOf(before.summary));

  const adminPage = await signIn(admin);
  await adminPage.goto("/admin/substitutions");
  await expect(adminPage.getByRole("tab", { name: /Ждут решения \(0\)/ })).toBeVisible();   // nothing is HIS to decide: the number of the tab is the server's
  const line = adminPage.getByTestId("one-off-decisions-title");
  await expect(line).toHaveText("Решает владелец: 1 отмена урока");
  await line.click();
  const reported = adminPage.getByTestId("waiting-reported-row");
  await expect(reported).toHaveCount(1);
  await expect(reported).not.toContainText("сум");                                                  // no sum for a role without the right
  await expect(adminPage.getByRole("button", { name: /Решить отмену/ })).toHaveCount(0);
  await reported.getByRole("button", { name: /Отозвать отмену урока/ }).click();
  await expect(adminPage.getByTestId("waiting-reported-row")).toHaveCount(0);
  await expect(line).toHaveCount(0);

  const ownerPage = await signIn(world.centre.owner);
  await ownerPage.goto("/owner/substitutions");
  await expect(ownerPage.getByRole("tab", { name: /Ждут решения \(0\)/ })).toBeVisible();
  await expect(ownerPage.getByTestId("waiting-row")).toHaveCount(0);
  expect(accountOf((await world.statement()).summary), "the withdrawn cancellation moved nothing").toEqual(accountOf(before.summary));
});

test("@mobile the journal on a phone: the owner decides a waiting cancellation from the column menu of the lesson - the window fits the screen and the money is the server's", async ({ signIn }) => {
  requireBillingDayStand();
  test.setTimeout(300_000);
  const world = await moneyWorld("phone");
  await reportBy(world.teacher, world.group, world.lesson, "Отключили свет");
  const page = await signIn(world.centre.owner);
  await page.goto(`/owner/groups/${world.group.id}?tab=attendance`);
  const trigger = page.locator(`th[data-lesson-key="${world.lesson.date}_${world.lesson.id}"] [data-column-menu-trigger]`);
  await expect(trigger).toBeVisible();
  await trigger.click();
  await page.getByTestId("menu-decide-waiting").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("По вине центра", { exact: true }).click();
  await expect(dialog.getByTestId("waiting-caption")).toContainText(new RegExp(`всего\\s+${moneyPattern(PER_LESSON)}\\s+сум`));
  await expectNoHorizontalScroll(page);
  const box = await dialog.getByTestId("waiting-confirm").boundingBox();
  expect(box, "the button has a box").not.toBeNull();
  expect(box!.x + box!.width, "the button lies inside the phone").toBeLessThanOrEqual(page.viewportSize()?.width ?? 375);
  await dialog.getByRole("button", { name: "Подтвердить: по вине центра" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(async () => (await world.statement()).summary.recalculated).toBe(PER_LESSON);
});
