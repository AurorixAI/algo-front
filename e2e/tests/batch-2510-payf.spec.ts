import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Org, type GroupInfo } from "../support/api";
import { addDays, businessNow, weekdayOf } from "../support/time";
import { dm, expectNoHorizontalScroll, fillDate, moneyPattern, pickOption, toast } from "../support/ui";

/**
 * «Пакет 25.10»: P1.1 (the teacher moves) + P1.2 (the journal of substitutions) + PAY-F (forecast of a package, a day off of the centre, the kind of a
 * cancellation and the deduction for the lessons the centre cancelled), together on one branch.  Two centres:
 *
 *  1. a PACKAGE centre: the owner switches on «Пакет уроков: 12» -> a payment -> «хватит до ~ДД.ММ (по расписанию)» (the 12th lesson of the schedule);
 *     the owner gives a «Выходной день центра» -> the forecast moves by one lesson, and the student's card says «выходной (Хайит)».
 *  2. a MONTHLY centre («Общий месяц», the recalculation on): the owner cancels a lesson «по вине центра» -> the statement has «Перерасчёт: урок ДД.ММ отменён
 *     центром» and the payment dialog asks for less; the teacher cancels HIS lesson - his dialog has no «Праздник» choice and the cancellation is «по вине центра»;
 *     «Изменить причину отмены» turns a cancellation into a holiday -> its line disappears (and the amount is back).
 *
 * The lessons are on three weekdays that are NOT today (tomorrow, +3, +5 days), so "the first lesson in the future" never depends on the time of the run.
 * Screenshots (desktop 1280 and phone 375) go to B2510_SHOTS.
 */
const SHOTS = process.env.B2510_SHOTS || "/Users/arslan/Desktop/ALGO/artifacts/batch_2510/shots";

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(450); // let a dialog finish sliding in
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

const today = () => businessNow().date;
const wrap = (weekday: number) => ((weekday - 1 + 7) % 7) + 1;
const grouped = (amount: number) => String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, "\\s");

interface Weekly { topic: string; weekday: number }

/** Three weekly lessons on the weekdays of tomorrow, +3 and +5 days (never today), 10:00-11:00, each with its own topic. */
async function threeWeekdays(org: Org, group: GroupInfo): Promise<Weekly[]> {
  const base = weekdayOf(today());
  const days: Weekly[] = [
    { topic: "Тема Альфа", weekday: wrap(base + 1) },
    { topic: "Тема Бета", weekday: wrap(base + 3) },
    { topic: "Тема Гамма", weekday: wrap(base + 5) },
  ];
  for (const d of days) {
    await org.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek: d.weekday, startTime: "10:00", endTime: "11:00", topic: d.topic });
  }
  return days;
}

/** The dates (from tomorrow on) of the lessons of the weekly list, in order. */
function upcoming(days: Weekly[], count: number, skip: string[] = []): Array<{ date: string; topic: string }> {
  const out: Array<{ date: string; topic: string }> = [];
  for (let i = 1; out.length < count && i < 400; i++) {
    const date = addDays(today(), i);
    const hit = days.find((d) => d.weekday === weekdayOf(date));
    if (hit && !skip.includes(date)) out.push({ date, topic: hit.topic });
  }
  return out;
}

const mondayOf = (iso: string) => addDays(iso, 1 - weekdayOf(iso));

/** The group's schedule tab, on the week of `date`. */
async function openWeek(page: Page, group: GroupInfo, date: string) {
  await page.goto(`/owner/groups/${group.id}?tab=schedule`);
  const weeks = (Date.parse(mondayOf(date)) - Date.parse(mondayOf(today()))) / (7 * 24 * 3600 * 1000);
  for (let i = 0; i < weeks; i++) await page.getByRole("button", { name: "Следующая неделя" }).click();
}

async function openCard(page: Page, group: GroupInfo, lesson: { date: string; topic: string }) {
  await openWeek(page, group, lesson.date);
  const card = page.getByTestId("schedule-card").filter({ hasText: lesson.topic });
  await expect(card).toHaveCount(1);
  await card.click();
  const sheet = page.getByRole("dialog", { name: lesson.topic });
  await expect(sheet).toBeVisible();
  return { card, sheet };
}

/** The "Внести оплату" dialog of the student from the list of debtors; returns the amount it proposes. */
async function openPayDialog(page: Page, lastName: string) {
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: /Должники/ }).click();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: new RegExp(lastName) }) });
  await row.getByRole("button", { name: "Внести оплату" }).click();
  const dialog = page.getByRole("dialog", { name: "Внести оплату" });
  await expect(dialog).toBeVisible();
  const amount = Number((await dialog.getByLabel("Сумма", { exact: true }).inputValue()).replace(/\D/g, ""));
  return { dialog, amount };
}

test.describe("package centre", () => {
  test("the package of 12: a payment, «хватит до ~…»; a day off of the centre moves the forecast and the student's card says «выходной» @mobile", async ({ signIn }, info) => {
    test.setTimeout(240_000);
    const project = info.project.name;
    const org = await Org.create("Пакет 25.10");
    const fee = 600000;
    const teacher = await org.addStaff("teacher", "Пакетов");
    const group = await org.createGroup({ name: "Группа ПФ-1", teacherId: teacher.userId });
    await org.setGroupPrice(group.id, fee);
    const days = await threeWeekdays(org, group);
    // the accounting of the centre starts tomorrow: the switch below is then in force for the student from his first day (a mode saved today is
    // deferred to the next period of a student who already counts today - LOGIC-A F12)
    await org.setPaymentSettings({ accounting_start_date: addDays(today(), 1) });
    const page = await signIn(org.owner);

    // --- 1. the owner switches on «Пакет уроков: 12» in the settings
    await page.goto("/owner/settings?section=payments");
    const section = page.getByRole("region", { name: "Оплаты" });
    await expect(section.getByRole("radio", { name: /Свой месяц у каждого ученика/ })).toBeVisible(); // the names of PAY-F
    await expect(section.getByRole("radio", { name: /Общий месяц для всех/ })).toBeVisible();
    await section.getByRole("radio", { name: /Пакет уроков/ }).check();
    await section.getByLabel("Уроков в одной оплате").fill("12");
    await shot(page, `01-settings-package-${project}`);
    await section.getByRole("button", { name: "Сохранить" }).click();
    await expect(section.getByRole("button", { name: "Сохранено" })).toBeVisible();
    expect(await org.owner.api.get("/auth/org/settings/payments")).toMatchObject({ period_mode: "lessons", lessons_per_payment: 12 });

    // the student joins after the switch
    const student = await org.addStudent(group, "Анвар", "Пакетный");

    // --- 2. a payment: the package is paid
    const membership = await org.membershipId(student.id, group.id);
    await page.goto(`/owner/payments/statement/${membership}`);   // nothing is due before the accounting starts: the payment is made from the statement
    await page.getByTestId("statement-pay").click();
    const dialog = page.getByRole("dialog", { name: "Внести оплату" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Сумма", { exact: true }).fill(String(fee));   // nothing is due yet: the owner types the price of the package
    await shot(page, `01b-pay-package-${project}`);
    await dialog.getByRole("radio", { name: "Карта" }).click();
    await dialog.getByRole("button", { name: new RegExp(`^Внести\\s*${grouped(fee)}`) }).click();
    await expect(toast(page, "Оплата внесена")).toBeVisible();

    // --- 3. «хватит до ~ДД.ММ (по расписанию)» = the day of the 12th lesson of the schedule
    const twelfth = upcoming(days, 12)[11].date;
    const row = (await org.owner.api.get(`/auth/org/students/${student.id}/memberships`)).find((r: any) => r.membership_id === membership);
    expect(row).toMatchObject({ period_mode: "lessons", lessons_left: 12, paid_through_forecast: twelfth });
    await page.goto(`/owner/students/${student.id}`);
    await page.getByRole("tab", { name: "Оплаты" }).click();
    await expect(page.getByText(`хватит до ~${dm(twelfth)} (по расписанию)`).first()).toBeVisible();
    await expect(page.getByText(/осталось 12 уроков из 12/).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, `02-forecast-${project}`);

    // --- 4. a day off of the centre on the second lesson: the dry run says what happens, then «Отменить уроки»
    const [, second] = upcoming(days, 2);
    await page.goto("/owner/settings?section=days_off");
    await page.getByTestId("day-off-new").click();
    const off = page.getByRole("dialog", { name: "Выходной день центра" });
    await fillDate(off.getByLabel("Первый день"), second.date);
    await off.getByLabel("Причина").fill("Хайит");
    await expect(off.getByTestId("day-off-plan-text")).toContainText(/Будут отменены 1 урок в 1 группе/);
    await expect(off.getByTestId("day-off-plan")).toContainText("Группа ПФ-1");
    await expectNoHorizontalScroll(page);
    await shot(page, `03-day-off-dialog-${project}`);
    await off.getByTestId("day-off-apply").click();
    await expect(page.getByTestId("days-off-list")).toContainText("Хайит");
    await shot(page, `04-day-off-list-${project}`);

    // --- 5. the forecast moved by one lesson; the lesson is cancelled as a holiday; the student's card says «выходной»
    const moved = upcoming(days, 12, [second.date])[11].date;
    expect(moved).not.toBe(twelfth);
    await expect.poll(async () => (await org.owner.api.get(`/auth/org/students/${student.id}/memberships`)).find((r: any) => r.membership_id === membership).paid_through_forecast).toBe(moved);
    await page.goto(`/owner/students/${student.id}`);
    await page.getByRole("tab", { name: "Оплаты" }).click();
    await expect(page.getByText(`хватит до ~${dm(moved)} (по расписанию)`).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, `05-student-forecast-moved-${project}`);
    // the attendance of the student says why the lesson did not take place (the month of the day off)
    await page.getByRole("tab", { name: "Обучение" }).click();
    if (second.date.slice(0, 7) !== today().slice(0, 7)) await page.getByRole("button", { name: /Следующий месяц|Вперёд/ }).first().click();
    await expect(page.getByText(/Урок отменён: выходной \(Хайит\)/).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, `05b-student-day-off-${project}`);
  });
});

test.describe("monthly centre", () => {
  test("«Общий месяц» with the recalculation: «по вине центра» -> «Перерасчёт…» and a smaller payment; the teacher has no «праздник»; «Изменить причину» removes the lines @mobile", async ({ signIn }, info) => {
    test.setTimeout(300_000);
    const project = info.project.name;
    const org = await Org.create("Месяц 25.10");
    const fee = 600000;
    const billingDay = Math.min(businessNow().day, 28); // the common month starts today: the whole period (4 weeks of lessons) is ahead
    const teacher = await org.addStaff("teacher", "Месяцев");
    const group = await org.createGroup({ name: "Группа ПФ-2", teacherId: teacher.userId });
    await org.setGroupPrice(group.id, fee);
    const days = await threeWeekdays(org, group);
    const student = await org.addStudent(group, "Тимур", "Помесячный");
    await org.setPaymentSettings({ accounting_start_date: today() });
    const membership = await org.membershipId(student.id, group.id);
    const page = await signIn(org.owner);

    // --- 1. the setting: «Общий месяц для всех» + «Вычитать из следующей оплаты»
    await page.goto("/owner/settings?section=payments");
    const section = page.getByRole("region", { name: "Оплаты" });
    await section.getByRole("radio", { name: /Общий месяц для всех/ }).check();
    await pickOption(page, section.getByRole("combobox", { name: "День, с которого начинается общий месяц" }), String(billingDay));
    await expect(section.getByTestId("centre-cancel-setting")).toBeVisible();
    await section.getByRole("radio", { name: "Вычитать из следующей оплаты" }).check();
    await shot(page, `06-settings-recalc-${project}`);
    await section.getByRole("button", { name: "Сохранить" }).click();
    await expect(section.getByRole("button", { name: "Сохранено" })).toBeVisible();
    expect(await org.owner.api.get("/auth/org/settings/payments")).toMatchObject({ billing_anchor: "fixed_day", centre_cancel_recalc: true });
    // (the amount is whatever the server says: the checks below compare it with itself)

    // --- 2. before any cancellation: no lines, the dialog proposes the amount A0
    const before = await openPayDialog(page, "Помесячный");
    expect(before.amount).toBeGreaterThan(0);
    await expect(before.dialog.getByTestId("recalc-note")).toHaveCount(0);
    const A0 = before.amount;
    await page.keyboard.press("Escape");

    // --- 3. the owner cancels the first coming lesson, the kind is «По вине центра» (the default)
    const [first] = upcoming(days, 1);
    const { sheet } = await openCard(page, group, first);
    await sheet.getByRole("button", { name: "Отменить урок" }).click();
    await sheet.getByLabel("Причина отмены", { exact: true }).fill("Заболел преподаватель");
    await expect(sheet.getByTestId("cancellation-kind")).toBeVisible();
    await expect(sheet.getByRole("radio", { name: "По вине центра" })).toBeChecked();
    await shot(page, `07-owner-cancel-dialog-${project}`);
    await sheet.getByRole("button", { name: "Отменить урок" }).click();
    await expect(toast(page, "Урок отменён")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // --- 4. the statement has the line «Перерасчёт: урок ДД.ММ отменён центром»; the payment dialog asks for less
    const lines = async () => {
      const statement = await org.owner.api.get(`/auth/org/memberships/${membership}/statement`);
      return { statement, recalc: statement.rows.filter((r: any) => r.type === "recalc") as any[] };
    };
    const one = await lines();
    expect(one.recalc).toHaveLength(1);
    expect(one.statement.summary.reconciles).toBe(true);
    const X = one.recalc[0].details.recalc.amount as number;
    expect(X).toBeGreaterThan(0);
    expect(X % 1000).toBe(0);
    await page.goto(`/owner/payments/statement/${membership}`);
    await expect(page.getByText(`Перерасчёт: урок ${dm(first.date)} отменён центром`)).toBeVisible();
    await expect(page.getByText(new RegExp(`−${moneyPattern(X)}\\sсум`)).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, `08-statement-recalc-${project}`);
    const after = await openPayDialog(page, "Помесячный");
    expect(after.amount).toBe(A0 - X);
    await expect(after.dialog.getByTestId("recalc-note")).toContainText(`урок ${dm(first.date)} отменён центром`);
    await expectNoHorizontalScroll(page);
    await shot(page, `09-pay-dialog-recalc-${project}`);
    await page.keyboard.press("Escape");

    // --- 5. the teacher cancels HIS lesson (the last one of next week): no «Праздник» choice, and the cancellation is «по вине центра»
    const nextMonday = addDays(mondayOf(today()), 7);
    const lastWeekday = Math.max(...days.map((d) => d.weekday));
    const mine = { date: addDays(nextMonday, lastWeekday - 1), topic: days.find((d) => d.weekday === lastWeekday)!.topic };
    expect(mine.date).not.toBe(first.date);
    const teacherPage = await signIn(teacher);
    await teacherPage.goto("/teacher/schedule");
    await teacherPage.getByRole("button", { name: /На неделю/ }).click();
    await teacherPage.getByTitle("Следующая неделя").click();
    await teacherPage.getByRole("heading", { name: group.name, level: 4 }).last().click();
    await teacherPage.getByRole("button", { name: "Дополнительные действия с уроком" }).click();
    await teacherPage.getByRole("menuitem", { name: /Отменить этот урок/ }).click();
    await teacherPage.getByPlaceholder("Причина отмены (обязательно)").fill("Заболел, урока не будет");
    await expect(teacherPage.getByTestId("cancellation-kind")).toHaveCount(0); // the teacher has no choice
    await expect(teacherPage.getByText("Праздник, выходной")).toHaveCount(0);
    await expectNoHorizontalScroll(teacherPage);
    await shot(teacherPage, `10-teacher-cancel-${project}`);
    await expect(teacherPage.getByRole("button", { name: "Подтвердить отмену" })).toBeEnabled();
    await teacherPage.getByRole("button", { name: "Подтвердить отмену" }).click();
    await expect(teacherPage.getByText("Урок отменён").first()).toBeVisible();
    await shot(teacherPage, `11-teacher-cancelled-${project}`);
    const two = await lines();
    expect(two.recalc).toHaveLength(2);
    expect(two.recalc.map((r: any) => r.details.recalc.lesson_date).sort()).toEqual([first.date, mine.date].sort());
    expect(two.statement.summary.reconciles).toBe(true);

    // --- 6. «Изменить причину отмены»: the owner turns both cancellations into holidays -> the lines disappear, the amount is back
    for (const lesson of [first, mine]) {
      const opened = await openCard(page, group, lesson);
      await opened.sheet.getByTestId("sheet-change-kind").click();
      await opened.sheet.getByRole("radio", { name: "Праздник, выходной" }).check();
      await opened.sheet.getByLabel("Почему меняете (останется в журнале)").fill("Это был праздничный день");
      if (lesson === first) await shot(page, `12-change-kind-${project}`);
      await opened.sheet.getByRole("button", { name: "Сохранить причину" }).click();
      await expect(toast(page, "Причина отмены изменена")).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    const none = await lines();
    expect(none.recalc).toHaveLength(0);
    expect(none.statement.summary.reconciles).toBe(true);
    await page.goto(`/owner/payments/statement/${membership}`);
    await expect(page.getByText(/Перерасчёт: урок/)).toHaveCount(0);
    await shot(page, `13-statement-no-recalc-${project}`);
    const back = await openPayDialog(page, "Помесячный");
    expect(back.amount).toBe(A0);
    await expect(back.dialog.getByTestId("recalc-note")).toHaveCount(0);
    await shot(page, `14-pay-dialog-back-${project}`);
  });
});
