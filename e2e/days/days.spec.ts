import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { travel } from "../support/clock";
import { dm, expectNoHorizontalScroll, moneyPattern, pickOption, toast } from "../support/ui";
import { FRI, MON_WED_FRI, TUE_THU, holdLesson, lessonOn, mondayOf, openCard, openPayDialog, paymentsRow, plusDays, reconcile, reconcileBaseline, rowOf, statementCost, statusRow, summaryOf, weekly } from "./days-support";

/**
 * «Life of a student by days» (TIME-TESTS, the days project).  One stand, one forward-only clock: the tests are in the order of their DATES (but independent:
 * each one sets an ABSOLUTE date, creates a centre of its own in that date, takes the baseline of the reconciliation on the empty centre and checks the money by
 * hand-written numbers; one that fails does not hide the others).  The formulas of support/time.ts are NOT used: every expected number is written here with its
 * calculation in a comment, from the rules of the server (billing_start.py, billing_ledger.py, leave_service.py).
 *
 * THE DATES ARE FROM 2030 ON (the stand clock only goes forward from the real "now": a date that has come by the day of the run would fail on «only forward»).
 * THE CALENDARS.  Mon-Wed-Fri = «А», Tue-Thu = «Б».  A month that begins on a WEDNESDAY and has 31 days has the layout of March 2028 (the task of the lead):
 *   «А» 14 lessons: Mon 6 13 20 27, Wed 1 8 15 22 29, Fri 3 10 17 24 31;   «Б» 9 lessons: Tue 7 14 21 28, Thu 2 9 16 23 30;   Fridays: 3 10 17 24 31;   Tuesdays 7 14 21 28.
 * The next month then begins on a SATURDAY: if it has 30 days, «А» has 12 lessons (Mon 3 10 17 24, Wed 5 12 19 26, Fri 7 14 21 28), Tuesdays 4 11 18 25.
 * A 30-day month that begins on a Wednesday: «А» 13 lessons (1 3 6 8 10 13 15 17 20 22 24 27 29), «Б» 9.  (The calendars were checked against a calendar table, not copied.)
 *
 * WHY NOT ALL IN ONE MONTH.  The first scenario runs 15.10 -> 01.11 and the clock never goes back, so the others live in months of their own with the SAME layout
 * (the same day numbers), the file goes in the order of the dates:
 *   May 2030 packages (31 d) · Jan 2031 weekly-once / transfer / pause (31 d) · Oct 2031 the first scenario (31 d, then Nov 2031: 30 d) ·
 *   Sep 2032 personal period (30 d) · Dec 2032 leave and return (31 d) · Jun 2033 the 15th: «Общий месяц» with the recalculation (30 d) ·
 *   Mar 2034 the 30th, billing day 28 (31 d, then Apr 2034).
 */
test.beforeAll(({}, info) => {
  // the clock of the stand never goes back and the dates of the file grow: a second thread would put a test into the past of the other
  if (info.config.workers !== 1) throw new Error(`the days project runs in ONE thread (workers=${info.config.workers}): the stand clock only goes forward - run it through e2e/scripts/run.mjs (E2E_DAYS=1)`);
});

const RELAX = { timeout: 15_000 };

// =====================================================================================================================
// 15.05.2030 (Wed): PACKAGES - the centre is in the mode of packages of 8 lessons.
// =====================================================================================================================
test("packages: a package of 8 paid on 15.05, lessons 15, 17, 20.05 held - the rest of the package day by day; a lesson after the package is unpaid", async () => {
  await travel.toDate("2030-05-15", "10:00");
  const org = await Org.create("Пакеты");
  await reconcileBaseline(org);                                                // the baseline of the reconciliation: the empty centre
  await org.setPaymentSettings({ period_mode: "lessons", lessons_per_payment: 8 });
  const teacher = await org.addStaff("teacher", "Пакетов");
  const group = await org.createGroup({ name: "Группа А", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 400_000);                                  // the price of the PACKAGE of 8 lessons: one lesson costs 400 000 / 8 = 50 000
  const slots = await weekly(org, group, MON_WED_FRI);
  const student = await org.addStudent(group, "Анвар", "Пакетов", undefined, null);   // no «Оплата с»: charged from the first lesson - Wed 15.05

  // 15.05 10:00: nothing is held. Charged 0 (a lesson is charged when it is held), the package is paid whole.
  await org.pay(student.id, 400_000);
  let row = await rowOf(org, student, group);
  let sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.advance, sum.unpaid]).toEqual([0, 400_000, 400_000, 0]);
  expect([row.lessons_used, row.lessons_left]).toEqual([0, 8]);
  await reconcile(org, "15.05 10:00");

  // the lessons of «А» from 15.05: Wed 15, Fri 17, Mon 20, Wed 22, Fri 24, Mon 27, Wed 29, Fri 31 (the 8th), Mon 03.06 (the 9th, nobody paid it).
  // after k held lessons: charged 50 000 x k, advance 400 000 - 50 000 x k, left 8 - k
  const days = [
    ["2030-05-15", 3], ["2030-05-17", 5], ["2030-05-20", 1], ["2030-05-22", 3], ["2030-05-24", 5], ["2030-05-27", 1], ["2030-05-29", 3], ["2030-05-31", 5],
  ] as const;
  let held = 0;
  for (const [date, weekday] of days) {
    await travel.toDate(date, "14:50");
    await holdLesson(teacher, lessonOn(group, slots[weekday], date), [student]);
    held++;
    row = await rowOf(org, student, group);
    sum = await summaryOf(org, student, group);
    expect([sum.charged, sum.advance, sum.unpaid, row.lessons_used, row.lessons_left], `after the lesson of ${date}`).toEqual([50_000 * held, 400_000 - 50_000 * held, 0, held, 8 - held]);
    await reconcile(org, `${date} 14:50`);
  }
  // 8 held: the package is used up (charged 400 000 = paid, nothing left). 03.06 (Mon): the 9th lesson is held without money: charged 50 000 more = a debt of 50 000.
  await travel.toDate("2030-06-03", "14:50");
  await holdLesson(teacher, lessonOn(group, slots[1], "2030-06-03"), [student]);
  row = await rowOf(org, student, group);
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.unpaid, sum.advance], "the 9th lesson, nobody paid it").toEqual([450_000, 400_000, 50_000, 0]);
  expect([row.lessons_left, row.lessons_unpaid]).toEqual([0, 1]);
  await reconcile(org, "03.06 14:50");
});

// =====================================================================================================================
// 16.01.2031 (Thu): a group that meets ONCE A WEEK (Friday), «Общий месяц»
// =====================================================================================================================
test("once a week (Friday): a student who joins on Thursday 16.01 is charged from Friday 17.01 - 3 lessons of 5", async ({ signIn }) => {
  await travel.toDate("2031-01-16", "10:00");
  const org = await Org.create("Раз в неделю");
  await reconcileBaseline(org);
  const teacher = await org.addStaff("teacher", "Пятницын");
  const group = await org.createGroup({ name: "Пятничная", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 500_000);
  await weekly(org, group, FRI);
  const student = await org.addStudent(group, "Дилшод", "Пятничный", undefined, null);      // no «Оплата с»: the default is the first lesson of the group from today
  // the first billable day: Thursday 16.01 has no lesson, the first lesson is Friday 17.01
  const def = await org.owner.api.get(`/auth/org/groups/${group.id}/pay-from-default`);
  expect(def.default_pay_from).toBe("2031-01-17");
  // Thursday 16.01: the stay is written, but its first billable day (Fri 17.01) has not come - nothing is charged yet.
  let sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.unpaid], "Thu 16.01: the first billable day has not come").toEqual([0, 0]);
  // Friday 17.01 10:00: the first billable day.  Fridays of January 2031: 3 10 17 24 31 = 5 (the whole month by the schedule); from 17.01: 17, 24, 31 = 3.
  // 500 000 x 3 / 5 = 300 000 exactly.
  await travel.toDate("2031-01-17", "10:00");
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.unpaid], "Fri 17.01").toEqual([300_000, 300_000]);
  const page = await signIn(org.owner);
  expect(await statementCost(page, await org.membershipId(student.id, group.id))).toBe(300_000);
  await reconcile(org, "17.01 10:00");
});

// =====================================================================================================================
// 17.01.2031 (Fri) -> 20.01 (Mon) -> 21.01 (Tue): TRANSFER «А» -> «Б»
// =====================================================================================================================
test("transfer А -> Б on Monday 20.01 and the day after: what А charged, what moved, what Б charged", async ({ signIn }) => {
  await travel.toDate("2031-01-17", "12:00");
  const org = await Org.create("Перевод");
  await reconcileBaseline(org);
  const teacher = await org.addStaff("teacher", "Переводов");
  const a = await org.createGroup({ name: "Группа А", teacherId: teacher.userId });
  const b = await org.createGroup({ name: "Группа Б", teacherId: teacher.userId });
  await org.setGroupPrice(a.id, 600_000);
  await org.setGroupPrice(b.id, 400_000);
  await weekly(org, a, MON_WED_FRI);
  await weekly(org, b, TUE_THU);
  const student = await org.addStudent(a, "Тимур", "Переводной", undefined, null);          // charged from the first lesson of «А»: today, Fri 17.01
  const membershipA = await org.membershipId(student.id, a.id);

  // 17.01 (Fri) 12:00: «А» from 17.01: 17, 20, 22, 24, 27, 29, 31 = 7 lessons of 14.   600 000 x 7 / 14 = 300 000.   The student pays 200 000: a debt of 100 000.
  await org.pay(student.id, 200_000);
  let sum = await summaryOf(org, student, a);
  expect([sum.charged, sum.paid, sum.unpaid, sum.advance]).toEqual([300_000, 200_000, 100_000, 0]);
  await reconcile(org, "17.01 12:00");

  // 20.01 (Mon) 11:00: the transfer.  «А» keeps the days 17..20.01 (the day of leaving counts): lessons 17, 20 = 2 of 14.   600 000 x 2 / 14 = 85 714 -> 86 000.
  // The money of «А» that has not been spent travels: 200 000 - 86 000 = 114 000 (refundable = min(advance, money received)).
  await travel.toDate("2031-01-20", "11:00");
  await org.owner.api.post(`/auth/org/groups/${b.id}/students/${student.id}`, { from_group_id: a.id });
  const membershipB = await org.membershipId(student.id, b.id);
  sum = await summaryOf(org, student, a);
  expect([sum.charged, sum.paid, sum.transferred_out, sum.unpaid, sum.advance, sum.reconciles], "«А» on the day of the transfer").toEqual([86_000, 200_000, 114_000, 0, 0, true]);
  // «Б» is charged from the DAY AFTER the transfer (first_billable_floor): on the day itself - nothing charged, the 114 000 that came lie as an advance.
  sum = await summaryOf(org, student, b);
  expect([sum.charged, sum.transferred_in, sum.unpaid, sum.advance, sum.reconciles], "«Б» on the day of the transfer").toEqual([0, 114_000, 0, 114_000, true]);
  await reconcile(org, "20.01 11:00");

  // 21.01 (Tue) 10:00: «Б» from 21.01: 21, 23, 28, 30 = 4 lessons of 9 (Tue 7 14 21 28, Thu 2 9 16 23 30).   400 000 x 4 / 9 = 177 778 -> 178 000.   Minus 114 000: a debt of 64 000.
  await travel.toDate("2031-01-21", "10:00");
  sum = await summaryOf(org, student, b);
  expect([sum.charged, sum.transferred_in, sum.unpaid, sum.advance, sum.reconciles], "«Б» the day after").toEqual([178_000, 114_000, 64_000, 0, true]);
  sum = await summaryOf(org, student, a);
  expect([sum.charged, sum.paid, sum.transferred_out, sum.unpaid, sum.advance], "«А» the day after: unchanged").toEqual([86_000, 200_000, 114_000, 0, 0]);
  const page = await signIn(org.owner);
  expect(await statementCost(page, membershipA)).toBe(86_000);
  expect(await statementCost(page, membershipB)).toBe(178_000);
  await reconcile(org, "21.01 10:00");
});

// =====================================================================================================================
// 22.01.2031 (Wed): PAUSE from Thu 23.01 to Tue 28.01
// =====================================================================================================================
test("pause 23.01 - 28.01 (across a weekend and the borders of the days): the charge before and after, day by day", async () => {
  await travel.toDate("2031-01-22", "10:00");
  const org = await Org.create("Пауза");
  await reconcileBaseline(org);
  const teacher = await org.addStaff("teacher", "Паузов");
  const group = await org.createGroup({ name: "Группа А", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 600_000);
  await weekly(org, group, MON_WED_FRI);
  const student = await org.addStudent(group, "Бекзод", "Паузный", undefined, null);      // charged from the lesson of today: Wed 22.01
  const membership = await org.membershipId(student.id, group.id);

  // from 22.01: 22, 24, 27, 29, 31 = 5 lessons of 14.   600 000 x 5 / 14 = 214 286 -> 214 000
  let sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.unpaid]).toEqual([214_000, 214_000]);
  await reconcile(org, "22.01 before the pause");

  // the pause 23.01 - 28.01 takes the lessons Fri 24 and Mon 27 out: the lessons left 22, 29, 31 = 3 of 14.   600 000 x 3 / 14 = 128 571 -> 129 000
  await org.owner.api.post(`/auth/org/memberships/${membership}/pauses`, { first_day: "2031-01-23", last_day: "2031-01-28", reason: "Поездка" });
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.unpaid], "the pause is written, the day before it").toEqual([129_000, 129_000]);
  await reconcile(org, "22.01 the pause is written");

  for (const [date, time, paused] of [["2031-01-23", "00:05", true], ["2031-01-25", "12:00", true], ["2031-01-28", "23:55", true], ["2031-01-29", "00:05", false]] as const) {
    await travel.toDate(date, time);
    const row = await rowOf(org, student, group);
    sum = await summaryOf(org, student, group);
    expect(Boolean(row.paused), `${date} ${time}: on pause`).toBe(paused);
    expect([sum.charged, sum.unpaid], `${date} ${time}: the charge does not move`).toEqual([129_000, 129_000]);
    await reconcile(org, `${date} ${time}`);
  }
  // 29.01: the days left to pay for: 22, 29, 30, 31 (the paused days are not billable); the money 129 000 covers all of them: paid until 31.01.
  await org.pay(student.id, 129_000);
  const row = await rowOf(org, student, group);
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.unpaid, sum.advance]).toEqual([129_000, 129_000, 0, 0]);
  expect(row.paid_until).toBe("2031-01-31");
  await reconcile(org, "29.01 paid");
});

// =====================================================================================================================
// 15.10.2031 (Wed) -> 17.10 (Fri) -> 31.10 23:50 -> 01.11 00:10: THE FIRST SCENARIO OF THE TASK
// =====================================================================================================================
test("the first scenario: enrol on Wed 15.10.2031 - 343 000 in the window and the statement, paid, a lesson on Fri 17.10, the month turns over", async ({ signIn }) => {
  await travel.toDate("2031-10-15", "10:00");
  const org = await Org.create("Общий месяц");
  await reconcileBaseline(org);
  const teacher = await org.addStaff("teacher", "Мартов");
  const group = await org.createGroup({ name: "А", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 600_000);
  const slots = await weekly(org, group, MON_WED_FRI);
  const student = await org.createStudent("Алишер", "Мартовский");

  // Lessons of «А» in October 2031: 1 3 6 8 10 13 15 17 20 22 24 27 29 31 = 14.  From Wed 15.10: 15 17 20 22 24 27 29 31 = 8.
  // 600 000 x 8 / 14 = 342 857.1 -> to the thousand 343 000.
  const SHARE = 343_000;
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}`);
  await page.getByRole("button", { name: /Добавить ученика|Зачислить/ }).first().click();
  const drawer = page.getByRole("dialog");
  await drawer.getByPlaceholder(/Поиск по имени/).fill("Мартов");
  await drawer.getByRole("checkbox", { name: /Мартовский Алишер/ }).click();
  await expect(drawer.getByTestId("picked-chips")).toContainText("Мартовский Алишер");
  await expect(drawer.getByTestId("summary-bar-sum")).toHaveText(new RegExp(`^${moneyPattern(SHARE)}\\sсум$`), RELAX);       // the window: the sum, and over it the words of the server «К оплате до 19.10» (the term 5 days from the first charged day 15.10: 15 16 17 18 19)
  await drawer.getByTestId("enrol-submit").click();
  await expect(drawer).toHaveCount(0);

  const membership = await org.membershipId(student.id, group.id);
  expect(await statementCost(page, membership), "the statement: the cost of the study").toBe(SHARE);
  let sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.unpaid, sum.advance]).toEqual([SHARE, 0, SHARE, 0]);
  await reconcile(org, "15.10 enrolled");

  // the payment of 343 000: the balance is 0, paid until the end of the month
  await org.pay(student.id, SHARE);
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.unpaid, sum.advance]).toEqual([SHARE, SHARE, 0, 0]);
  expect((await rowOf(org, student, group)).paid_until).toBe("2031-10-31");
  await reconcile(org, "15.10 paid");

  // Fri 17.10: the lesson, the mark «был» - the statement does not change (a month mode charges days, not marks)
  await travel.toDate("2031-10-17", "14:50");
  await holdLesson(teacher, lessonOn(group, slots[5], "2031-10-17"), [student]);
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.unpaid, sum.advance], "after the lesson of 17.10").toEqual([SHARE, SHARE, 0, 0]);
  expect(await statementCost(page, membership)).toBe(SHARE);
  await reconcile(org, "17.10 after the lesson");

  // Fri 31.10 23:50: still October; the November period has not begun - nothing is owed
  await travel.toDate("2031-10-31", "23:50");
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.unpaid, sum.advance], "31.10 23:50").toEqual([SHARE, SHARE, 0, 0]);
  await reconcile(org, "31.10 23:50");

  // Sat 01.11 00:10: the November cell begins on the 1st (the billing day of the centre): the FIRST BILLABLE DAY is 01.11 (not the first lesson, Mon 03.11).
  // November 2031 «А»: 3 5 7 10 12 14 17 19 21 24 26 28 = 12 lessons; the student is in the group the whole month, so the whole price: 600 000.
  await travel.toDate("2031-11-01", "00:10");
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.unpaid, sum.advance], "01.11 00:10").toEqual([SHARE + 600_000, SHARE, 600_000, 0]);
  const row = await rowOf(org, student, group);
  expect(row.paid_until, "paid until stays at the end of October").toBe("2031-10-31");
  const status = await org.owner.api.get("/auth/org/payments/status", { bucket: "all", search: "Мартовский" });
  const listed = status.items.find((item: any) => item.membership_id === membership);
  expect(listed, "the student is in the list of payments").toBeTruthy();
  expect(listed.student_name).toContain("Мартовский");
  expect(listed.unpaid, "everything unpaid").toBe(600_000);
  // the term of the centre is 5 days (the default): the first charged day of the November cell is 01.11 (the 1st day), so the term is the 5th day = 05.11 - the sum is «к оплате до 05.11», not a debt
  expect([listed.debt_amount, listed.due_amount, listed.due_until], "01.11 00:10: the new month is a sum in term").toEqual([0, 600_000, "2031-11-05"]);
  expect(await statementCost(page, membership)).toBe(SHARE + 600_000);
  await reconcile(org, "01.11 00:10");
});

// =====================================================================================================================
// 15.09.2032 (Wed): «ЛИЧНЫЙ ПЕРИОД» - the period of the student begins on the day he joins
// =====================================================================================================================
test("personal period: joins 15.09, period 15.09 - 14.10, paid; leaves 25.09 - what is left; comes back 26.09", async () => {
  await travel.toDate("2032-09-15", "10:00");
  const org = await Org.create("Личный период");
  await reconcileBaseline(org);
  await org.setPersonalPeriod();                                                // BEFORE the first student
  const teacher = await org.addStaff("teacher", "Личнов");
  const group = await org.createGroup({ name: "Группа Л", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 600_000);
  const student = await org.addStudent(group, "Санжар", "Личный", undefined, null);   // no schedule: charged from today

  // the period: 15.09 + one month - a day = 14.10 = 16 days of September + 14 of October = 30 days; the whole price 600 000, a debt until the payment
  let sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.unpaid]).toEqual([600_000, 600_000]);
  await org.pay(student.id, 600_000);
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.unpaid, sum.advance]).toEqual([600_000, 600_000, 0, 0]);
  expect((await rowOf(org, student, group)).paid_until).toBe("2032-10-14");
  await reconcile(org, "15.09 paid");

  // 25.09 (Sat) 10:00: leaves.  The days of the stay 15.09 .. 25.09 = 11 of 30 (the day of leaving counts): 600 000 x 11 / 30 = 220 000 (to the thousand: exactly).
  // Left: 600 000 - 220 000 = 380 000 = 19 calendar days (26.09 .. 14.10) at 20 000 a day - the advance, refundable.
  await travel.toDate("2032-09-25", "10:00");
  const preview = await org.owner.api.get(`/auth/org/groups/${group.id}/students/${student.id}/leave-preview`);
  const money = preview.memberships.find((m: any) => m.group_id === group.id).money;
  expect([money.charged_after_leave, money.advance, money.refundable, money.unpaid], "the preview of the leaving").toEqual([220_000, 380_000, 380_000, 0]);
  await org.owner.api.post(`/auth/org/groups/${group.id}/students/${student.id}/leave`, { settle: [] });
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.unpaid, sum.advance], "after the leaving (the advance stays)").toEqual([220_000, 600_000, 0, 380_000]);
  await reconcile(org, "25.09 left");

  // 26.09 (Sun) 10:00: comes back INSIDE the period he has been charged for: the period goes on (the gap is a pause), no second full period (Money-1 B5):
  // charged 600 000 again, nothing owed, paid until 14.10.
  await travel.toDate("2032-09-26", "10:00");
  await org.enrol(group.id, student.id);
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.unpaid, sum.advance], "back the next day").toEqual([600_000, 600_000, 0, 0]);
  expect((await rowOf(org, student, group)).paid_until).toBe("2032-10-14");
  await reconcile(org, "26.09 back");
});

// =====================================================================================================================
// 15.12.2032 (Wed) -> 21.12 (Tue) -> 22.12 (Wed): LEAVE AND RETURN - with a debt and with an advance
// =====================================================================================================================
test("leave on Tue 21.12 and return on Wed 22.12: the debt of the first stay and the new charge; an advance that goes back into the account", async () => {
  await travel.toDate("2032-12-15", "10:00");
  const org = await Org.create("Уход");
  await reconcileBaseline(org);
  const teacher = await org.addStaff("teacher", "Уходов");
  const group = await org.createGroup({ name: "Группа А", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 600_000);
  await weekly(org, group, MON_WED_FRI);
  const debtor = await org.addStudent(group, "Рустам", "Долгов", undefined, null);
  const payer = await org.addStudent(group, "Зафар", "Авансов", undefined, null);

  // from Wed 15.12: 15 17 20 22 24 27 29 31 = 8 of 14.   600 000 x 8 / 14 = 342 857 -> 343 000 for both.  «Авансов» pays it.
  await org.pay(payer.id, 343_000);
  let d = await summaryOf(org, debtor, group);
  let p = await summaryOf(org, payer, group);
  expect([d.charged, d.unpaid]).toEqual([343_000, 343_000]);
  expect([p.charged, p.paid, p.unpaid, p.advance]).toEqual([343_000, 343_000, 0, 0]);
  await reconcile(org, "15.12");

  // Tue 21.12 10:00: both leave, the money is kept.  The stay 15.12 .. 21.12 (the day of leaving counts): lessons 15, 17, 20 = 3 of 14.   600 000 x 3 / 14 = 128 571 -> 129 000.
  await travel.toDate("2032-12-21", "10:00");
  for (const [student, debt, advance] of [[debtor, 129_000, 0], [payer, 0, 214_000]] as const) {                  // «Авансов»: 343 000 - 129 000 = 214 000
    const preview = await org.owner.api.get(`/auth/org/groups/${group.id}/students/${student.id}/leave-preview`);
    const money = preview.memberships.find((m: any) => m.group_id === group.id).money;
    expect([money.charged_after_leave, money.unpaid, money.advance, money.refundable], `the preview of ${student.fullName}`).toEqual([129_000, debt, advance, advance]);
    await org.owner.api.post(`/auth/org/groups/${group.id}/students/${student.id}/leave`, { settle: [] });
  }
  d = await summaryOf(org, debtor, group);
  p = await summaryOf(org, payer, group);
  expect([d.charged, d.unpaid, d.advance], "the debtor after leaving").toEqual([129_000, 129_000, 0]);
  expect([p.charged, p.paid, p.unpaid, p.advance], "the payer after leaving").toEqual([129_000, 343_000, 0, 214_000]);
  await reconcile(org, "21.12 left");

  // Wed 22.12 10:00: both come back (the first lesson from today: 22.12).  The stays of ONE month are ONE charge of the cell: the days 15..21 and 22..31 -
  // lessons 15 17 20 + 22 24 27 29 31 = 8 of 14 = 343 000 (the same as if nobody had left: 129 000 of the first stay + 600 000 x 5 / 14 = 214 000 of the second).
  await travel.toDate("2032-12-22", "10:00");
  await org.enrol(group.id, debtor.id);
  await org.enrol(group.id, payer.id);
  d = await summaryOf(org, debtor, group);
  p = await summaryOf(org, payer, group);
  expect([d.charged, d.unpaid, d.advance], "the debtor is back: the old debt and the new charge").toEqual([343_000, 343_000, 0]);
  expect([p.charged, p.paid, p.unpaid, p.advance], "the payer is back: the advance went into the account").toEqual([343_000, 343_000, 0, 0]);
  expect((await rowOf(org, payer, group)).paid_until).toBe("2032-12-31");
  await reconcile(org, "22.12 back");
});

// =====================================================================================================================
// 15.06.2033 (Wed): «ОБЩИЙ МЕСЯЦ» FROM THE 15TH WITH THE RECALCULATION - the scenario of batch-2510-payf.spec.ts that the ordinary suite SKIPS on the 29th-31st
// =====================================================================================================================
test("the 15th: «Общий месяц» from the 15th, the centre cancels lessons - «Перерасчёт» lines and a smaller payment; the teacher has no «праздник»; «Изменить причину» takes the lines away", async ({ signIn }) => {
  test.setTimeout(300_000);
  await travel.toDate("2033-06-15", "10:00");
  const org = await Org.create("Месяц с 15-го");
  await reconcileBaseline(org);
  const teacher = await org.addStaff("teacher", "Месяцев");
  const group = await org.createGroup({ name: "Группа ПФ-2", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 600_000);
  // Mon-Wed-Fri at 14:00, a topic of its own for each weekday (the cards of the schedule are found by it)
  const topics: Record<number, string> = { 1: "Тема Альфа", 3: "Тема Бета", 5: "Тема Гамма" };
  for (const [dayOfWeek, topic] of Object.entries(topics)) {
    await org.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek: Number(dayOfWeek), startTime: "14:00", endTime: "15:00", topic });
  }
  await org.setPaymentSettings({ accounting_start_date: "2033-06-15" });
  const page = await signIn(org.owner);

  // --- 1. the setting (BEFORE the first student, so the regime of the centre is the new one from the first day): «Общий месяц для всех» from the 15th + «Уменьшать долг сразу»
  await page.goto("/owner/settings?section=payments");
  const section = page.getByRole("region", { name: "Оплаты" });
  await section.getByRole("radio", { name: /Общий месяц для всех/ }).check();
  await pickOption(page, section.getByRole("combobox", { name: "День, с которого начинается общий месяц" }), "15");
  await expect(section.getByTestId("centre-cancel-setting")).toBeVisible();
  await section.getByRole("radio", { name: "Уменьшать долг сразу" }).check();
  await section.getByRole("button", { name: "Сохранить" }).click();
  await page.getByTestId("regime-confirm").click();      // Money-1 B3: the window of a change of the mode
  await expect(section.getByRole("button", { name: "Сохранено" })).toBeVisible();
  expect(await org.owner.api.get("/auth/org/settings/payments")).toMatchObject({ billing_anchor: "fixed_day", billing_day: 15, centre_cancel_recalc: true });
  await reconcile(org, "15.06 the setting");

  // --- 2. a student joins on the 15th (the lesson of today is at 14:00, ahead): the cell of the centre is 15.06 - 14.07 = 30 days, he is in it whole - the whole price.
  // Lessons of «А» in the cell: Jun 15 17 20 22 24 27 29 (7) + Jul 1 4 6 8 11 13 (6) = 13.  The student has ALL its days: 600 000 (basis «full»).
  const student = await org.addStudent(group, "Тимур", "Помесячный");        // «Оплата с» = today = the 15th
  const membership = await org.membershipId(student.id, group.id);
  let sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.unpaid, sum.advance], "the whole cell is charged").toEqual([600_000, 0, 600_000, 0]);
  expect(await statementCost(page, membership)).toBe(600_000);
  await reconcile(org, "15.06 enrolled");

  // --- 3. before any cancellation: no lines, the dialog proposes the debt 600 000
  const before = await openPayDialog(page, "Помесячный");
  await expect(before.dialog.getByTestId("recalc-note")).toHaveCount(0);
  expect(await before.amountNow()).toBe(600_000);
  await page.keyboard.press("Escape");

  // --- 4. the owner cancels Fri 17.06 (the kind «По вине центра» is the default).  The price of a lesson of the month is the price of the REGULAR schedule:
  // round_1000(600 000 / 13 lessons) = 46 153.8 -> 46 000.   One line of 46 000; the debt 600 000 - 46 000 = 554 000.
  const first = { date: "2033-06-17", topic: topics[5] };
  const { sheet } = await openCard(page, group, first);
  await sheet.getByRole("button", { name: "Отменить урок" }).click();
  await sheet.getByLabel("Причина отмены", { exact: true }).fill("Заболел преподаватель");
  await expect(sheet.getByTestId("cancellation-kind")).toBeVisible();
  await expect(sheet.getByRole("radio", { name: "По вине центра" })).toBeChecked();
  await sheet.getByRole("button", { name: "Отменить урок" }).click();
  await expect(toast(page, "Урок отменён")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const lines = async () => {
    const statement = await org.owner.api.get(`/auth/org/memberships/${membership}/statement`);
    return { statement, recalc: statement.rows.filter((r: any) => r.type === "recalc") as any[] };
  };
  const one = await lines();
  expect(one.recalc).toHaveLength(1);
  expect(one.statement.summary.reconciles).toBe(true);
  expect(one.recalc[0].details.recalc.amount, "46 000 = 600 000 / 13 rounded to the thousand").toBe(46_000);
  expect(one.recalc[0].details.recalc.lesson_date).toBe(first.date);
  expect([one.statement.summary.charged, one.statement.summary.unpaid], "the charge stays, the debt is smaller").toEqual([600_000, 554_000]);
  await page.goto(`/owner/payments/statement/${membership}`);
  await expect(page.getByText(`Перерасчёт: урок ${dm(first.date)} отменён центром`)).toBeVisible();
  await expect(page.getByText(new RegExp(`−${moneyPattern(46_000)}\\sсум`)).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  const after = await openPayDialog(page, "Помесячный");
  await expect.poll(after.amountNow).toBe(554_000);
  await expect(after.dialog.getByTestId("recalc-note")).toContainText(`урок ${dm(first.date)} отменён центром`);
  await page.keyboard.press("Escape");
  await reconcile(org, "15.06 one lesson cancelled");

  // --- 5. the teacher has no «Отменить этот урок» (W1 S3, 27.10: he asks «Не смогу провести», the administrator decides); the owner cancels the LAST lesson of next week
  // (Fri 24.06, «по вине центра»): a second line of 46 000 (the same unit), the debt 600 000 - 92 000 = 508 000
  const nextMonday = plusDays(mondayOf("2033-06-15"), 7);
  const mine = { date: "2033-06-24", topic: topics[5] };
  expect(nextMonday).toBe("2033-06-20");
  const teacherPage = await signIn(teacher);
  await teacherPage.goto("/teacher/schedule");
  await teacherPage.getByRole("button", { name: /На неделю/ }).click();
  await Promise.all([teacherPage.waitForResponse((r) => r.url().includes(`/attendance?date_from=${nextMonday}`)), teacherPage.getByTitle("Следующая неделя").click()]);
  await teacherPage.getByRole("heading", { name: group.name, level: 4 }).last().click();
  await teacherPage.getByRole("button", { name: "Дополнительные действия с уроком" }).click();
  await expect(teacherPage.getByRole("menuitem", { name: /Не смогу провести/ })).toBeVisible();
  await expect(teacherPage.getByRole("menuitem", { name: /Отменить этот урок/ })).toHaveCount(0);
  await expect(teacherPage.getByText("Праздник, выходной")).toHaveCount(0);
  await expectNoHorizontalScroll(teacherPage);
  const second = await openCard(page, group, mine);
  await second.sheet.getByRole("button", { name: "Отменить урок" }).click();
  await second.sheet.getByLabel("Причина отмены", { exact: true }).fill("Заболел, урока не будет");
  await expect(second.sheet.getByRole("radio", { name: "По вине центра" })).toBeChecked();
  await second.sheet.getByRole("button", { name: "Отменить урок" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const two = await lines();
  expect(two.recalc).toHaveLength(2);
  expect(two.recalc.map((r: any) => r.details.recalc.lesson_date).sort()).toEqual([first.date, mine.date]);
  expect(two.recalc.map((r: any) => r.details.recalc.amount)).toEqual([46_000, 46_000]);
  expect(two.statement.summary.reconciles).toBe(true);
  expect([two.statement.summary.charged, two.statement.summary.unpaid]).toEqual([600_000, 508_000]);
  await reconcile(org, "15.06 two lessons cancelled");

  // --- 6. «Изменить причину отмены»: both cancellations become holidays -> the lines disappear, the amount is back to 600 000
  for (const lesson of [first, mine]) {
    const opened = await openCard(page, group, lesson);
    await opened.sheet.getByTestId("sheet-change-kind").click();
    await opened.sheet.getByRole("radio", { name: "Праздник, выходной" }).check();
    await opened.sheet.getByLabel("Почему меняете (останется в журнале)").fill("Это был праздничный день");
    await opened.sheet.getByRole("button", { name: "Сохранить причину" }).click();
    await expect(toast(page, "Причина отмены изменена")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  const none = await lines();
  expect(none.recalc).toHaveLength(0);
  expect(none.statement.summary.reconciles).toBe(true);
  expect([none.statement.summary.charged, none.statement.summary.unpaid]).toEqual([600_000, 600_000]);
  await page.goto(`/owner/payments/statement/${membership}`);
  await expect(page.getByText(/Перерасчёт: урок/)).toHaveCount(0);
  const back = await openPayDialog(page, "Помесячный");
  await expect.poll(back.amountNow).toBe(600_000);
  await expect(back.dialog.getByTestId("recalc-note")).toHaveCount(0);
  await reconcile(org, "15.06 the lines are gone");
});

// =====================================================================================================================
// 30.03.2034 (Thu): THE 30TH - a student joins a group that has NO lesson left in the month; the billing day of the centre is the 28th
// =====================================================================================================================
test("the 30th: a student joins on Thu 30.03.2034 a group (Tuesdays) with no lesson left in March, billing day 28 - the cell 28.03 - 27.04: what is charged on the 30th, the 31st, the 1st, the first lesson and the next cell", async () => {
  await travel.toDate("2034-03-30", "10:00");
  const org = await Org.create("Тридцатое");
  await reconcileBaseline(org);
  // «Общий месяц» from the 28th (the centre allows 1..28), BEFORE the first student: the cell of the centre is 28.03 - 27.04 (31 days) and 28.04 - 27.05 (30 days)
  await org.setPaymentSettings({ period_mode: "calendar", billing_anchor: "fixed_day", billing_day: 28 });
  expect(await org.owner.api.get("/auth/org/settings/payments")).toMatchObject({ billing_anchor: "fixed_day", billing_day: 28 });
  const teacher = await org.addStaff("teacher", "Тридцатов");
  const group = await org.createGroup({ name: "Вторники", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 600_000);
  await weekly(org, group, [2]);                                                 // Tuesdays 14:00: March 2034 - 7 14 21 28; April - 4 11 18 25: no lesson on Thu 30.03 and Fri 31.03
  // «Оплата» (student) A: no «Оплата с» - the server's default is the FIRST LESSON of the group from today = Tue 04.04.  Student B: «Оплата с» = today (30.03) on purpose.
  const a = await org.addStudent(group, "Азиз", "Тридцатый", undefined, null);
  const b = await org.addStudent(group, "Бахтиёр", "Сегодняшний", undefined, "2034-03-30");
  const def = await org.owner.api.get(`/auth/org/groups/${group.id}/pay-from-default`);
  expect(def.default_pay_from, "the first lesson from the 30th is Tue 04.04").toBe("2034-04-04");

  // The cell 28.03 - 27.04: 31 days; the lessons of the schedule in it: Tue 28.03, 04.04, 11.04, 18.04, 25.04 = 5 (the divisor).
  //  A is charged from 04.04: his days 04.04 .. 27.04, lessons 04.04, 11.04, 18.04, 25.04 = 4 of 5 -> 600 000 x 4 / 5 = 480 000 - but only from the day it BEGINS (04.04).
  //  B is charged from 30.03: his days 30.03 .. 27.04, the same 4 lessons of 5 (28.03 is before him) -> 480 000 from 30.03.
  // The 30th (10:00), the 31st (23:50) and the 1st (00:10): the cell is the same all three days - nothing new begins (the next cell begins on 28.04).
  const expectDay = async (label: string, aCharged: number, bCharged: number) => {
    const sumA = await summaryOf(org, a, group);
    const sumB = await summaryOf(org, b, group);
    expect([sumA.charged, sumA.paid, sumA.unpaid, sumA.advance], `${label}: A`).toEqual([aCharged, 0, aCharged, 0]);
    expect([sumB.charged, sumB.paid, sumB.unpaid, sumB.advance], `${label}: B`).toEqual([bCharged, 0, bCharged, 0]);
  };
  await expectDay("Thu 30.03 10:00", 0, 480_000);
  await reconcile(org, "30.03 10:00");
  await travel.toDate("2034-03-31", "23:50");
  await expectDay("Fri 31.03 23:50", 0, 480_000);
  await reconcile(org, "31.03 23:50");
  await travel.toDate("2034-04-01", "00:10");
  await expectDay("Sat 01.04 00:10", 0, 480_000);
  await reconcile(org, "01.04 00:10");
  // Tue 04.04 10:00: the first billable day of A has come: the same 480 000 appears for him; B has nothing new.
  await travel.toDate("2034-04-04", "10:00");
  await expectDay("Tue 04.04 10:00", 480_000, 480_000);
  await reconcile(org, "04.04 10:00");
  // Fri 28.04 00:10: the next cell 28.04 - 27.05 (30 days) begins; both are in it whole: the full price 600 000 more.
  await travel.toDate("2034-04-28", "00:10");
  await expectDay("Fri 28.04 00:10", 480_000 + 600_000, 480_000 + 600_000);
  await reconcile(org, "28.04 00:10");
});

// =====================================================================================================================
// 15.11.2034 (Wed) -> 19.11 23:50 -> 20.11 00:10 -> a term of 10 days -> payment: THE TERM OF PAYMENT (PAY-DUE 9.13б, 10.12): «К оплате» -> «Долг» by the clock
// =====================================================================================================================
// November 2034 begins on a WEDNESDAY and has 30 days.  «А» (Mon-Wed-Fri) lessons: Wed 1 8 15 22 29, Fri 3 10 17 24, Mon 6 13 20 27 = 13.  From Wed 15.11 (a lesson of the day, ahead at 14:00): 15 17 20 22 24 27 29 = 7.
// The share: 600 000 x 7 / 13 = 323 076.9 -> to the thousand 323 000.  The term of the centre is set to 5 days: the first charged day is 15.11 (the 1st day), so the term is the 5th day: 15 16 17 18 19 -> D = 19.11.
test("term of payment: enrol on the day of a lesson, term 5 days - «К оплате до 19.11»; 19.11 23:50 «до сегодня»; 20.11 00:10 «Долг · просрочено 1 день»; the term 10 brings «К оплате до 24.11» back; the payment says «Оплачено до 30.11»", async ({ signIn }) => {
  await travel.toDate("2034-11-15", "10:00");
  const org = await Org.create("Срок оплаты");
  await reconcileBaseline(org);
  await org.setPaymentSettings({ pay_due_days: 5 });                                   // the setting is read by the owner and written by the owner only (10.6)
  const teacher = await org.addStaff("teacher", "Сроков");
  const group = await org.createGroup({ name: "А", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 600_000);
  await weekly(org, group, MON_WED_FRI);
  const student = await org.createStudent("Алишер", "Сроковый");
  const SHARE = 323_000;

  // Wed 15.11 10:00, the window of enrolment: the words of the server over the sum - «К оплате до 19.11» (the term of the first charged day); the sum 323 000; the line under it - the lessons: 7 of 13 in November.
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}`);
  await page.getByRole("button", { name: /Добавить ученика|Зачислить/ }).first().click();
  const drawer = page.getByRole("dialog");
  await drawer.getByPlaceholder(/Поиск по имени/).fill("Сроков");
  await drawer.getByRole("checkbox", { name: /Сроковый Алишер/ }).click();
  await expect(drawer.getByTestId("summary-bar-sum")).toHaveText(new RegExp(`^${moneyPattern(SHARE)}\\sсум$`), RELAX);
  await expect(drawer.getByTestId("summary-bar-label")).toHaveText("К оплате до 19.11");
  await expect(drawer.getByTestId("summary-bar-line")).toContainText(/7 уроков из 13 в ноябре/);
  await drawer.getByTestId("enrol-submit").click();
  await expect(drawer).toHaveCount(0);

  const membership = await org.membershipId(student.id, group.id);
  let row = await statusRow(org, "Сроковый");
  expect([row.state, row.due_amount, row.debt_amount, row.due_until, row.due_sub], "15.11 10:00 after enrolling").toEqual(["to_pay", SHARE, 0, "2034-11-19", "до 19.11"]);
  expect(await statementCost(page, membership), "the statement: the cost of the study").toBe(SHARE);
  await expect(page.getByTestId("statement-summary")).toContainText(/К оплате/);
  await expect(page.getByTestId("statement-summary")).toContainText("до 19.11");
  let line = await paymentsRow(page, /К оплате/, "Сроковый");
  await expect(line, "the tab «К оплате»: the student, the sum, the term").toContainText(new RegExp(`К оплате\\s+${moneyPattern(SHARE)}`));
  await expect(line).toContainText("до 19.11");
  await reconcile(org, "15.11 enrolled");

  // Sun 19.11 23:50: the LAST day of the term - still «К оплате», and the word for it is «до сегодня».
  await travel.toDate("2034-11-19", "23:50");
  row = await statusRow(org, "Сроковый");
  expect([row.state, row.due_amount, row.debt_amount, row.due_sub], "19.11 23:50").toEqual(["to_pay", SHARE, 0, "до сегодня"]);
  line = await paymentsRow(page, /К оплате/, "Сроковый");
  await expect(line).toContainText("до сегодня");
  await reconcile(org, "19.11 23:50");

  // Mon 20.11 00:10: the term has passed by one day: «Долг 323 000 · просрочено 1 день»; the student is in the tab «Должники» and no more in «К оплате».
  await travel.toDate("2034-11-20", "00:10");
  row = await statusRow(org, "Сроковый");
  expect([row.state, row.debt_amount, row.due_amount, row.overdue_days, row.debt_sub], "20.11 00:10").toEqual(["debt", SHARE, 0, 1, "просрочено 1 день"]);
  line = await paymentsRow(page, /Должники/, "Сроковый");
  await expect(line, "the tab «Должники»").toContainText(new RegExp(`Долг\\s+${moneyPattern(SHARE)}`));
  await expect(line).toContainText("просрочено 1 день");
  await reconcile(org, "20.11 00:10");

  // the owner moves the term 5 -> 10: the term is the 10th day, 15 .. 24 -> D = 24.11.  Before saving the server says who changes the name (dry run): one student from the debtors becomes «К оплате»;
  // after saving the number is the fact: «К оплате до 24.11», the debtors are gone.  The money did not move (the reconciliation below).
  const dry = await org.owner.api.put("/auth/org/settings/payments?dry_run=true", { pay_due_days: 10 });
  expect([dry.pay_due_impact.to_due, dry.pay_due_impact.to_debt], "the dry run of the term 5 -> 10").toEqual([1, 0]);
  expect(String(dry.pay_due_impact.texts[0]).replace(/\u00a0/g, " ")).toBe("1 ученик из должников станет «К оплате»");
  await org.setPaymentSettings({ pay_due_days: 10 });
  row = await statusRow(org, "Сроковый");
  expect([row.state, row.due_amount, row.debt_amount, row.due_until, row.due_sub], "20.11 00:10, the term 10").toEqual(["to_pay", SHARE, 0, "2034-11-24", "до 24.11"]);
  line = await paymentsRow(page, /К оплате/, "Сроковый");
  await expect(line).toContainText("до 24.11");
  await expect(page.getByRole("tab", { name: /Должники/ })).toContainText("0");
  const sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.unpaid, sum.advance], "the term moves the NAME only, not a sum").toEqual([SHARE, 0, SHARE, 0]);
  await reconcile(org, "20.11 term 10");

  // the payment of 323 000: nothing is unpaid, «Оплачено до 30.11» (the end of the cell)
  await org.pay(student.id, SHARE);
  row = await statusRow(org, "Сроковый");
  expect([row.state, row.due_amount, row.debt_amount, row.paid_until], "after the payment").toEqual(["paid", 0, 0, "2034-11-30"]);
  line = await paymentsRow(page, /Без долга/, "Сроковый");
  await expect(line, "the tab «Без долга»: paid until the end of the month").toContainText("Оплачено до 30.11");
  await reconcile(org, "20.11 paid");
});

// =====================================================================================================================
// 15.08.2035 (Wed) -> 17.08 (Fri): LEAVE OF THE ONLY GROUP BEFORE THE TERM - the sum becomes a debt, without words of being late
// =====================================================================================================================
// August 2035 begins on a WEDNESDAY and has 31 days: «А» (Mon-Wed-Fri) 14 lessons: Mon 6 13 20 27, Wed 1 8 15 22 29, Fri 3 10 17 24 31.  Term 5 days from 15.08: 15 16 17 18 19 -> D = 19.08.
// Enrolled on 15.08 (a lesson of the day): 15 17 20 22 24 27 29 31 = 8 of 14 -> 600 000 x 8 / 14 = 342 857 -> 343 000, «к оплате до 19.08».
// Leaves on Fri 17.08 (the day of leaving counts): the stay 15..17 holds the lessons 15, 17 = 2 of 14 -> 600 000 x 2 / 14 = 85 714 -> 86 000.
test("leave of the only group before the term: the window says the sum becomes a debt; after it «Долг 86 000» without «просрочено»; after the old term (20.08 00:10) the days count: 1 day", async ({ signIn }) => {
  await travel.toDate("2035-08-15", "10:00");
  const org = await Org.create("Уход до срока");
  await reconcileBaseline(org);
  await org.setPaymentSettings({ pay_due_days: 5 });
  const teacher = await org.addStaff("teacher", "Уходов");
  const group = await org.createGroup({ name: "А", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 600_000);
  await weekly(org, group, MON_WED_FRI);
  const student = await org.addStudent(group, "Рустам", "Единственный", undefined, null);      // no «Оплата с»: from the first lesson, Wed 15.08
  let row = await statusRow(org, "Единственный");
  expect([row.state, row.due_amount, row.due_until], "15.08 after enrolling").toEqual(["to_pay", 343_000, "2035-08-19"]);
  await reconcile(org, "15.08 enrolled");

  // Fri 17.08 10:00, before the term: the window of leaving names the sum by the state AFTER the leaving, in the words of the server
  await travel.toDate("2035-08-17", "10:00");
  const page = await signIn(org.owner);
  const preview = await org.owner.api.get(`/auth/org/groups/${group.id}/students/${student.id}/leave-preview`);
  const stay = preview.memberships[0].effects.stays.find((item: any) => item.code === "debt");
  expect(String(stay.text).replace(/\u00a0/g, " "), "the server's sentence in the window").toBe("К оплате 86 000 сум. Это единственная группа ученика: после ухода сумма станет долгом");
  await org.owner.api.post(`/auth/org/groups/${group.id}/students/${student.id}/leave`, { settle: [] });

  // after the leaving: a DEBT of 86 000 at once, the term was 19.08 (it has not come): no words about being late
  row = await statusRow(org, "Единственный", "debtors");
  expect([row.state, row.debt_amount, row.due_amount, row.debt_text], "17.08 after leaving").toEqual(["debt", 86_000, 0, "Долг 86\u00a0000\u00a0сум"]);
  expect(String(row.debt_sub ?? ""), "no word about being late").not.toContain("просрочено");
  const line = await paymentsRow(page, /Должники/, "Единственный");
  await expect(line).toContainText(new RegExp(`Долг\\s+${moneyPattern(86_000)}`));
  await expect(line).not.toContainText("просрочено");
  await reconcile(org, "17.08 left");

  // Sun 19.08 23:50 -> Mon 20.08 00:10: the old term (19.08) has passed: the debt is overdue by 1 day (the days go by rule 2)
  await travel.toDate("2035-08-20", "00:10");
  row = await statusRow(org, "Единственный", "debtors");
  expect([row.state, row.debt_amount, row.overdue_days, row.debt_sub], "20.08 00:10").toEqual(["debt", 86_000, 1, "просрочено 1 день"]);
  await reconcile(org, "20.08 00:10");
});
