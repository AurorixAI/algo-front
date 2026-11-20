import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { travel } from "../support/clock";
import { moneyPattern } from "../support/ui";
import { FRI, MON_WED_FRI, TUE_THU, holdLesson, lessonOn, reconcile, rowOf, statementCost, summaryOf, weekly } from "./days-support";

/**
 * «Life of a student by days» (TIME-TESTS, the days project).  One stand, one forward-only clock: the tests are in the order of their DATES.  Each test sets an
 * ABSOLUTE date, creates a centre of its own in that date and checks the money by hand-written numbers.  The formulas of support/time.ts are NOT used: every
 * expected number is written here with its calculation in a comment, from the rules of the server (billing_start.py, billing_ledger.py, leave_service.py).
 *
 * THE CALENDARS.  Mon-Wed-Fri = «А», Tue-Thu = «Б».  A month that begins on a WEDNESDAY and has 31 days has the layout of March 2028 (the task of the lead):
 *   «А» 14 lessons: Mon 6 13 20 27, Wed 1 8 15 22 29, Fri 3 10 17 24 31;   «Б» 9 lessons: Tue 7 14 21 28, Thu 2 9 16 23 30;   Fridays: 3 10 17 24 31.
 * Such months: December 2027, March 2028, August 2029 (September 2027 and November 2028 begin on a Wednesday too, with 30 days: the 15th-28th are the same).
 *
 * WHY NOT ALL IN MARCH 2028.  The first scenario of the task runs 15.03 -> 01.04.2028 and the clock never goes back, so the other scenarios (15.03, 16.03, 20.03 ...
 * windows that overlap it and each other) cannot all live in the same March.  Each one gets a month with the SAME layout and the same day numbers (or, where the
 * schedule does not matter, the same weekdays), the file goes in the order of the dates:
 *   Sep 2027 packages · Dec 2027 weekly-once / transfer / pause · Mar 2028 the first scenario · Nov 2028 personal period · Aug 2029 leave and return.
 */
test.describe.configure({ mode: "serial" });

const RELAX = { timeout: 15_000 };

// =====================================================================================================================
// 15.09.2027 (Wed): PACKAGES - the centre is in the mode of packages of 8 lessons.
// =====================================================================================================================
test("packages: a package of 8 paid on 15.09, lessons 15, 17, 20.09 held - the rest of the package day by day; a lesson after the package is unpaid", async () => {
  await travel.toDate("2027-09-15", "10:00");
  const org = await Org.create("Пакеты");
  await org.setPaymentSettings({ period_mode: "lessons", lessons_per_payment: 8 });
  const teacher = await org.addStaff("teacher", "Пакетов");
  const group = await org.createGroup({ name: "Группа А", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 400_000);                                  // the price of the PACKAGE of 8 lessons: one lesson costs 400 000 / 8 = 50 000
  const slots = await weekly(org, group, MON_WED_FRI);
  const student = await org.addStudent(group, "Анвар", "Пакетов", undefined, null);   // no «Оплата с»: charged from the first lesson - Wed 15.09

  // 15.09 10:00: nothing is held. Charged 0 (a lesson is charged when it is held), the package is paid whole.
  await org.pay(student.id, 400_000);
  let row = await rowOf(org, student, group);
  let sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.advance, sum.debt]).toEqual([0, 400_000, 400_000, 0]);
  expect([row.lessons_used, row.lessons_left]).toEqual([0, 8]);
  await reconcile(org, "15.09 10:00");

  // the lessons of «А» from 15.09: Wed 15, Fri 17, Mon 20, Wed 22, Fri 24, Mon 27, Wed 29, Fri 01.10 (the 8th), Mon 04.10 (the 9th, nobody paid it).
  // after k held lessons: charged 50 000 x k, advance 400 000 - 50 000 x k, left 8 - k
  const days = [
    ["2027-09-15", 3], ["2027-09-17", 5], ["2027-09-20", 1], ["2027-09-22", 3], ["2027-09-24", 5], ["2027-09-27", 1], ["2027-09-29", 3], ["2027-10-01", 5],
  ] as const;
  let held = 0;
  for (const [date, weekday] of days) {
    await travel.toDate(date, "14:50");
    await holdLesson(teacher, lessonOn(group, slots[weekday], date), [student]);
    held++;
    row = await rowOf(org, student, group);
    sum = await summaryOf(org, student, group);
    expect([sum.charged, sum.advance, sum.debt, row.lessons_used, row.lessons_left], `after the lesson of ${date}`).toEqual([50_000 * held, 400_000 - 50_000 * held, 0, held, 8 - held]);
    await reconcile(org, `${date} 14:50`);
  }
  // 8 held: the package is used up (charged 400 000 = paid, nothing left). 04.10 (Mon): the 9th lesson is held without money: charged 50 000 more = a debt of 50 000.
  await travel.toDate("2027-10-04", "14:50");
  await holdLesson(teacher, lessonOn(group, slots[1], "2027-10-04"), [student]);
  row = await rowOf(org, student, group);
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.debt, sum.advance], "the 9th lesson, nobody paid it").toEqual([450_000, 400_000, 50_000, 0]);
  expect([row.lessons_left, row.lessons_unpaid]).toEqual([0, 1]);
  await reconcile(org, "04.10 14:50");
});

// =====================================================================================================================
// 16.12.2027 (Thu): a group that meets ONCE A WEEK (Friday), «Общий месяц»
// =====================================================================================================================
test("once a week (Friday): a student who joins on Thursday 16.12 is charged from Friday 17.12 - 3 lessons of 5", async ({ signIn }) => {
  await travel.toDate("2027-12-16", "10:00");
  const org = await Org.create("Раз в неделю");
  const teacher = await org.addStaff("teacher", "Пятницын");
  const group = await org.createGroup({ name: "Пятничная", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 500_000);
  await weekly(org, group, FRI);
  const student = await org.addStudent(group, "Дилшод", "Пятничный", undefined, null);      // no «Оплата с»: the default is the first lesson of the group from today
  // the first billable day: Thursday 16.12 has no lesson, the first lesson is Friday 17.12
  const def = await org.owner.api.get(`/auth/org/groups/${group.id}/pay-from-default`);
  expect(def.default_pay_from).toBe("2027-12-17");
  // Thursday 16.12: the stay is written, but its first billable day (Fri 17.12) has not come - nothing is charged yet.
  let sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.debt], "Thu 16.12: the first billable day has not come").toEqual([0, 0]);
  // Friday 17.12 10:00: the first billable day.  Fridays of December 2027: 3 10 17 24 31 = 5 (the whole month by the schedule); from 17.12: 17, 24, 31 = 3.
  // 500 000 x 3 / 5 = 300 000 exactly.
  await travel.toDate("2027-12-17", "10:00");
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.debt], "Fri 17.12").toEqual([300_000, 300_000]);
  const page = await signIn(org.owner);
  expect(await statementCost(page, await org.membershipId(student.id, group.id))).toBe(300_000);
  await reconcile(org, "17.12 10:00");
});

// =====================================================================================================================
// 17.12.2027 (Fri) -> 20.12 (Mon) -> 21.12 (Tue): TRANSFER «А» -> «Б»
// =====================================================================================================================
test("transfer А -> Б on Monday 20.12 and the day after: what А charged, what moved, what Б charged", async ({ signIn }) => {
  await travel.toDate("2027-12-17", "12:00");
  const org = await Org.create("Перевод");
  const teacher = await org.addStaff("teacher", "Переводов");
  const a = await org.createGroup({ name: "Группа А", teacherId: teacher.userId });
  const b = await org.createGroup({ name: "Группа Б", teacherId: teacher.userId });
  await org.setGroupPrice(a.id, 600_000);
  await org.setGroupPrice(b.id, 400_000);
  await weekly(org, a, MON_WED_FRI);
  await weekly(org, b, TUE_THU);
  const student = await org.addStudent(a, "Тимур", "Переводной", undefined, null);          // charged from the first lesson of «А»: today, Fri 17.12
  const membershipA = await org.membershipId(student.id, a.id);

  // 17.12 (Fri) 12:00: «А» from 17.12: 17, 20, 22, 24, 27, 29, 31 = 7 lessons of 14.   600 000 x 7 / 14 = 300 000.   The student pays 200 000: a debt of 100 000.
  await org.pay(student.id, 200_000);
  let sum = await summaryOf(org, student, a);
  expect([sum.charged, sum.paid, sum.debt, sum.advance]).toEqual([300_000, 200_000, 100_000, 0]);
  await reconcile(org, "17.12 12:00");

  // 20.12 (Mon) 11:00: the transfer.  «А» keeps the days 17..20.12 (the day of leaving counts): lessons 17, 20 = 2 of 14.   600 000 x 2 / 14 = 85 714 -> 86 000.
  // The money of «А» that has not been spent travels: 200 000 - 86 000 = 114 000 (refundable = min(advance, money received)).
  await travel.toDate("2027-12-20", "11:00");
  await org.owner.api.post(`/auth/org/groups/${b.id}/students/${student.id}`, { from_group_id: a.id });
  const membershipB = await org.membershipId(student.id, b.id);
  sum = await summaryOf(org, student, a);
  expect([sum.charged, sum.paid, sum.transferred_out, sum.debt, sum.advance, sum.reconciles], "«А» on the day of the transfer").toEqual([86_000, 200_000, 114_000, 0, 0, true]);
  // «Б» is charged from the DAY AFTER the transfer (first_billable_floor): on the day itself - nothing charged, the 114 000 that came lie as an advance.
  sum = await summaryOf(org, student, b);
  expect([sum.charged, sum.transferred_in, sum.debt, sum.advance, sum.reconciles], "«Б» on the day of the transfer").toEqual([0, 114_000, 0, 114_000, true]);
  await reconcile(org, "20.12 11:00");

  // 21.12 (Tue) 10:00: «Б» from 21.12: 21, 23, 28, 30 = 4 lessons of 9 (Tue 7 14 21 28, Thu 2 9 16 23 30).   400 000 x 4 / 9 = 177 778 -> 178 000.   Minus 114 000: a debt of 64 000.
  await travel.toDate("2027-12-21", "10:00");
  sum = await summaryOf(org, student, b);
  expect([sum.charged, sum.transferred_in, sum.debt, sum.advance, sum.reconciles], "«Б» the day after").toEqual([178_000, 114_000, 64_000, 0, true]);
  sum = await summaryOf(org, student, a);
  expect([sum.charged, sum.paid, sum.transferred_out, sum.debt, sum.advance], "«А» the day after: unchanged").toEqual([86_000, 200_000, 114_000, 0, 0]);
  const page = await signIn(org.owner);
  expect(await statementCost(page, membershipA)).toBe(86_000);
  expect(await statementCost(page, membershipB)).toBe(178_000);
  await reconcile(org, "21.12 10:00");
});

// =====================================================================================================================
// 22.12.2027 (Wed): PAUSE from Thu 23.12 to Tue 28.12
// =====================================================================================================================
test("pause 23.12 - 28.12 (across a weekend and the borders of the days): the charge before and after, day by day", async () => {
  await travel.toDate("2027-12-22", "10:00");
  const org = await Org.create("Пауза");
  const teacher = await org.addStaff("teacher", "Паузов");
  const group = await org.createGroup({ name: "Группа А", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 600_000);
  await weekly(org, group, MON_WED_FRI);
  const student = await org.addStudent(group, "Бекзод", "Паузный", undefined, null);      // charged from the lesson of today: Wed 22.12
  const membership = await org.membershipId(student.id, group.id);

  // from 22.12: 22, 24, 27, 29, 31 = 5 lessons of 14.   600 000 x 5 / 14 = 214 286 -> 214 000
  let sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.debt]).toEqual([214_000, 214_000]);
  await reconcile(org, "22.12 before the pause");

  // the pause 23.12 - 28.12 takes the lessons Fri 24 and Mon 27 out: the lessons left 22, 29, 31 = 3 of 14.   600 000 x 3 / 14 = 128 571 -> 129 000
  await org.owner.api.post(`/auth/org/memberships/${membership}/pauses`, { first_day: "2027-12-23", last_day: "2027-12-28", reason: "Поездка" });
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.debt], "the pause is written, the day before it").toEqual([129_000, 129_000]);
  await reconcile(org, "22.12 the pause is written");

  for (const [date, time, paused] of [["2027-12-23", "00:05", true], ["2027-12-25", "12:00", true], ["2027-12-28", "23:55", true], ["2027-12-29", "00:05", false]] as const) {
    await travel.toDate(date, time);
    const row = await rowOf(org, student, group);
    sum = await summaryOf(org, student, group);
    expect(Boolean(row.paused), `${date} ${time}: on pause`).toBe(paused);
    expect([sum.charged, sum.debt], `${date} ${time}: the charge does not move`).toEqual([129_000, 129_000]);
    await reconcile(org, `${date} ${time}`);
  }
  // 29.12: the days left to pay for: 22, 29, 30, 31 (the paused days are not billable); the money 129 000 covers all of them: paid until 31.12.
  await org.pay(student.id, 129_000);
  const row = await rowOf(org, student, group);
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.debt, sum.advance]).toEqual([129_000, 129_000, 0, 0]);
  expect(row.paid_until).toBe("2027-12-31");
  await reconcile(org, "29.12 paid");
});

// =====================================================================================================================
// 15.03.2028 (Wed) -> 17.03 (Fri) -> 31.03 23:50 -> 01.04 00:10: THE FIRST SCENARIO OF THE TASK
// =====================================================================================================================
test("the first scenario: enrol on Wed 15.03.2028 - 343 000 in the window and the statement, paid, a lesson on Fri 17.03, the month turns over", async ({ signIn }) => {
  await travel.toDate("2028-03-15", "10:00");
  const org = await Org.create("Общий месяц");
  const teacher = await org.addStaff("teacher", "Мартов");
  const group = await org.createGroup({ name: "А", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 600_000);
  const slots = await weekly(org, group, MON_WED_FRI);
  const student = await org.createStudent("Алишер", "Мартовский");

  // Lessons of «А» in March 2028: 1 3 6 8 10 13 15 17 20 22 24 27 29 31 = 14.  From Wed 15.03: 15 17 20 22 24 27 29 31 = 8.
  // 600 000 x 8 / 14 = 342 857.1 -> to the thousand 343 000.
  const SHARE = 343_000;
  const page = await signIn(org.owner);
  await page.goto(`/owner/groups/${group.id}`);
  await page.getByRole("button", { name: /Добавить ученика|Зачислить/ }).first().click();
  const drawer = page.getByRole("dialog");
  await drawer.getByPlaceholder(/Поиск по имени/).fill("Мартов");
  await drawer.getByRole("checkbox", { name: /Мартовский Алишер/ }).click();
  await expect(drawer.getByTestId("picked-chips")).toContainText("Мартовский Алишер");
  await expect(drawer.getByTestId("summary-bar-sum")).toHaveText(new RegExp(`^${moneyPattern(SHARE)}\\sсум$`), RELAX);       // the window: «К оплате сразу 343 000 сум»
  await drawer.getByTestId("enrol-submit").click();
  await expect(drawer).toHaveCount(0);

  const membership = await org.membershipId(student.id, group.id);
  expect(await statementCost(page, membership), "the statement: the cost of the study").toBe(SHARE);
  let sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.debt, sum.advance]).toEqual([SHARE, 0, SHARE, 0]);
  await reconcile(org, "15.03 enrolled");

  // the payment of 343 000: the balance is 0, paid until the end of the month
  await org.pay(student.id, SHARE);
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.debt, sum.advance]).toEqual([SHARE, SHARE, 0, 0]);
  expect((await rowOf(org, student, group)).paid_until).toBe("2028-03-31");
  await reconcile(org, "15.03 paid");

  // Fri 17.03: the lesson, the mark «был» - the statement does not change (a month mode charges days, not marks)
  await travel.toDate("2028-03-17", "14:50");
  await holdLesson(teacher, lessonOn(group, slots[5], "2028-03-17"), [student]);
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.debt, sum.advance], "after the lesson of 17.03").toEqual([SHARE, SHARE, 0, 0]);
  expect(await statementCost(page, membership)).toBe(SHARE);
  await reconcile(org, "17.03 after the lesson");

  // Fri 31.03 23:50: still March; the April period has not begun - nothing is owed
  await travel.toDate("2028-03-31", "23:50");
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.debt, sum.advance], "31.03 23:50").toEqual([SHARE, SHARE, 0, 0]);
  await reconcile(org, "31.03 23:50");

  // Sat 01.04 00:10: the April cell begins on the 1st (the billing day of the centre): the FIRST BILLABLE DAY is 01.04 (not the first lesson, Mon 03.04).
  // April 2028 «А»: 3 5 7 10 12 14 17 19 21 24 26 28 = 12 lessons; the student is in the group the whole month, so the whole price: 600 000.
  await travel.toDate("2028-04-01", "00:10");
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.debt, sum.advance], "01.04 00:10").toEqual([SHARE + 600_000, SHARE, 600_000, 0]);
  const row = await rowOf(org, student, group);
  expect(row.paid_until, "paid until stays at the end of March").toBe("2028-03-31");
  const status = await org.owner.api.get("/auth/org/payments/status", { bucket: "all", search: "Мартовский" });
  const listed = status.items.find((item: any) => item.membership_id === membership);
  expect(listed, "the student is in the list of payments").toBeTruthy();
  expect(listed.student_name).toContain("Мартовский");
  expect(listed.debt).toBe(600_000);
  expect(await statementCost(page, membership)).toBe(SHARE + 600_000);
  await reconcile(org, "01.04 00:10");
});

// =====================================================================================================================
// 15.11.2028 (Wed): «ЛИЧНЫЙ ПЕРИОД» - the period of the student begins on the day he joins
// =====================================================================================================================
test("personal period: joins 15.11, period 15.11 - 14.12, paid; leaves 25.11 - what is left; comes back 26.11", async () => {
  await travel.toDate("2028-11-15", "10:00");
  const org = await Org.create("Личный период");
  await org.setPersonalPeriod();                                                // BEFORE the first student
  const teacher = await org.addStaff("teacher", "Личнов");
  const group = await org.createGroup({ name: "Группа Л", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 600_000);
  const student = await org.addStudent(group, "Санжар", "Личный", undefined, null);   // no schedule: charged from today

  // the period: 15.11 + one month - a day = 14.12 = 16 days of November + 14 of December = 30 days; the whole price 600 000, a debt until the payment
  let sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.debt]).toEqual([600_000, 600_000]);
  await org.pay(student.id, 600_000);
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.debt, sum.advance]).toEqual([600_000, 600_000, 0, 0]);
  expect((await rowOf(org, student, group)).paid_until).toBe("2028-12-14");
  await reconcile(org, "15.11 paid");

  // 25.11 (Sat) 10:00: leaves.  The days of the stay 15.11 .. 25.11 = 11 of 30 (the day of leaving counts): 600 000 x 11 / 30 = 220 000 (to the thousand: exactly).
  // Left: 600 000 - 220 000 = 380 000 = 19 calendar days (26.11 .. 14.12) at 20 000 a day - the advance, refundable.
  await travel.toDate("2028-11-25", "10:00");
  const preview = await org.owner.api.get(`/auth/org/groups/${group.id}/students/${student.id}/leave-preview`);
  const money = preview.memberships.find((m: any) => m.group_id === group.id).money;
  expect([money.charged_after_leave, money.advance, money.refundable, money.debt], "the preview of the leaving").toEqual([220_000, 380_000, 380_000, 0]);
  await org.owner.api.post(`/auth/org/groups/${group.id}/students/${student.id}/leave`, { settle: [] });
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.debt, sum.advance], "after the leaving (the advance stays)").toEqual([220_000, 600_000, 0, 380_000]);
  await reconcile(org, "25.11 left");

  // 26.11 (Sun) 10:00: comes back INSIDE the period he has been charged for: the period goes on (the gap is a pause), no second full period (Money-1 B5):
  // charged 600 000 again, nothing owed, paid until 14.12.
  await travel.toDate("2028-11-26", "10:00");
  await org.enrol(group.id, student.id);
  sum = await summaryOf(org, student, group);
  expect([sum.charged, sum.paid, sum.debt, sum.advance], "back the next day").toEqual([600_000, 600_000, 0, 0]);
  expect((await rowOf(org, student, group)).paid_until).toBe("2028-12-14");
  await reconcile(org, "26.11 back");
});

// =====================================================================================================================
// 15.08.2029 (Wed) -> 21.08 (Tue) -> 22.08 (Wed): LEAVE AND RETURN - with a debt and with an advance
// =====================================================================================================================
test("leave on Tue 21.08 and return on Wed 22.08: the debt of the first stay and the new charge; an advance that goes back into the account", async () => {
  await travel.toDate("2029-08-15", "10:00");
  const org = await Org.create("Уход");
  const teacher = await org.addStaff("teacher", "Уходов");
  const group = await org.createGroup({ name: "Группа А", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 600_000);
  await weekly(org, group, MON_WED_FRI);
  const debtor = await org.addStudent(group, "Рустам", "Долгов", undefined, null);
  const payer = await org.addStudent(group, "Зафар", "Авансов", undefined, null);

  // from Wed 15.08: 15 17 20 22 24 27 29 31 = 8 of 14.   600 000 x 8 / 14 = 342 857 -> 343 000 for both.  «Авансов» pays it.
  await org.pay(payer.id, 343_000);
  let d = await summaryOf(org, debtor, group);
  let p = await summaryOf(org, payer, group);
  expect([d.charged, d.debt]).toEqual([343_000, 343_000]);
  expect([p.charged, p.paid, p.debt, p.advance]).toEqual([343_000, 343_000, 0, 0]);
  await reconcile(org, "15.08");

  // Tue 21.08 10:00: both leave, the money is kept.  The stay 15.08 .. 21.08 (the day of leaving counts): lessons 15, 17, 20 = 3 of 14.   600 000 x 3 / 14 = 128 571 -> 129 000.
  await travel.toDate("2029-08-21", "10:00");
  for (const [student, debt, advance] of [[debtor, 129_000, 0], [payer, 0, 214_000]] as const) {                  // «Авансов»: 343 000 - 129 000 = 214 000
    const preview = await org.owner.api.get(`/auth/org/groups/${group.id}/students/${student.id}/leave-preview`);
    const money = preview.memberships.find((m: any) => m.group_id === group.id).money;
    expect([money.charged_after_leave, money.debt, money.advance, money.refundable], `the preview of ${student.fullName}`).toEqual([129_000, debt, advance, advance]);
    await org.owner.api.post(`/auth/org/groups/${group.id}/students/${student.id}/leave`, { settle: [] });
  }
  d = await summaryOf(org, debtor, group);
  p = await summaryOf(org, payer, group);
  expect([d.charged, d.debt, d.advance], "the debtor after leaving").toEqual([129_000, 129_000, 0]);
  expect([p.charged, p.paid, p.debt, p.advance], "the payer after leaving").toEqual([129_000, 343_000, 0, 214_000]);
  await reconcile(org, "21.08 left");

  // Wed 22.08 10:00: both come back (the first lesson from today: 22.08).  The stays of ONE month are ONE charge of the cell: the days 15..21 and 22..31 -
  // lessons 15 17 20 + 22 24 27 29 31 = 8 of 14 = 343 000 (the same as if nobody had left: 129 000 of the first stay + 600 000 x 5 / 14 = 214 000 of the second).
  await travel.toDate("2029-08-22", "10:00");
  await org.enrol(group.id, debtor.id);
  await org.enrol(group.id, payer.id);
  d = await summaryOf(org, debtor, group);
  p = await summaryOf(org, payer, group);
  expect([d.charged, d.debt, d.advance], "the debtor is back: the old debt and the new charge").toEqual([343_000, 343_000, 0]);
  expect([p.charged, p.paid, p.debt, p.advance], "the payer is back: the advance went into the account").toEqual([343_000, 343_000, 0, 0]);
  expect((await rowOf(org, payer, group)).paid_until).toBe("2029-08-31");
  await reconcile(org, "22.08 back");
});
