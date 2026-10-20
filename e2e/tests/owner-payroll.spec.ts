import { test, expect } from "../support/fixtures";
import { Org, runLesson } from "../support/api";
import { businessNow, payrollLine } from "../support/time";
import { groupedDigits, moneyPattern, toast } from "../support/ui";

/** «Итого» and the sum are two elements: no space between them in the text content. */
const total = (amount: number) => new RegExp(`Итого\\s*${moneyPattern(amount)}\\s*сум`);

/**
 * Owner: «Зарплата». Percent per teacher and kind of lessons -> «Рассчитать всех» -> the sheet total equals the
 * partner's formula for the seeded marks (computed here independently):
 *     line = round_half_up( price x percent / 100 x counted lessons / 12 )
 * where the price is the price of the GROUP (#105) or, for three of the students, an individual price with a reason.
 * -> «Сохранить ведомость» -> edit a fee on the sheet -> «Сохранить как редакцию 2» -> «История редакций».
 *
 * Seeded lesson of today (one lesson per teacher, both completed):
 *   teacher 1, «Группа» (price of the group 600 000), 62.5 %:  Анвар 600 000 (the group's) present
 *                                 | Мадина 900 000 (individual) absent | Булат 300 000 (individual) excused (not yet confirmed)
 *                                 | Эльдар 450 000 (individual) present but NEVER PAID (shown, not in the sum)
 *   teacher 2, «Индивидуально» (price of the group 800 000), 40 %:  Дилшод 800 000 present
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Зарплата");
});

test("percent -> «Рассчитать всех» -> total by the formula -> save -> edit fee -> revision 2 -> history", async ({ signIn }) => {
  const month = businessNow().date.slice(0, 7);
  const t1 = await org.addStaff("teacher", "Групповой");
  const t2 = await org.addStaff("teacher", "Индивидуальный");
  const group = await org.createGroup({ name: "Группа З1", teacherId: t1.userId, lessonType: "group" });
  const solo = await org.createGroup({ name: "Индивид З2", teacherId: t2.userId, lessonType: "individual" });
  // #105: the price lives on the group; three students carry an individual price (a sum and a reason)
  await org.setGroupPrice(group.id, 600000);
  await org.setGroupPrice(solo.id, 800000);
  const anvar = await org.addStudent(group, "Анвар", "Первый");
  const madina = await org.addStudent(group, "Мадина", "Второй", { amount: 900000, reason: "Договорённость с родителями" });
  const bulat = await org.addStudent(group, "Булат", "Третий", { amount: 300000, reason: "Скидка многодетным" });
  const eldar = await org.addStudent(group, "Эльдар", "Неплательщик", { amount: 450000, reason: "Рассрочка" });
  const dilshod = await org.addStudent(solo, "Дилшод", "Одиночкин");
  for (const [s, fee] of [[anvar, 600000], [madina, 900000], [bulat, 300000], [dilshod, 800000]] as const) await org.pay(s.id, fee);

  const lesson1 = await org.createLessonStartingNow(group.id);
  const lesson2 = await org.createLessonStartingNow(solo.id);
  await runLesson(t1, lesson1, {
    records: { [anvar.id]: "present", [madina.id]: "absent", [bulat.id]: "excused", [eldar.id]: "present" },
    reasons: { [bulat.id]: "Болел" },
    complete: true,
  });
  await runLesson(t2, lesson2, { records: { [dilshod.id]: "present" }, complete: true });

  // the oracle
  const t1Total = payrollLine(600000, "62.5", 1) + payrollLine(900000, "62.5", 1) + payrollLine(300000, "62.5", 1); // Эльдар: not paid
  const t2Total = payrollLine(800000, "40", 1);
  expect(t1Total).toBe(31250 + 46875 + 15625); // sanity of the oracle itself: 600k, 900k, 300k x 0.625 / 12
  expect(t2Total).toBe(26667);

  const page = await signIn(org.owner);
  await page.goto(`/owner/payroll?month=${month}`);
  const teachers = page.getByRole("region", { name: "Преподаватели месяца" });
  await expect(teachers).toContainText("Групповой");
  await expect(teachers).toContainText("Индивидуальный");

  // --- UX-1 C: one calm line over the table (the month is still going), the explanation in a dialog
  await expect(page.getByRole("status").filter({ hasText: "ещё идёт — расчёт предварительный" })).toBeVisible();
  await page.getByRole("button", { name: "Как считается" }).click();
  const how = page.getByRole("dialog", { name: "Как считается зарплата" });
  await expect(how).toContainText("Оплата в месяц × % ÷ 12 × засчитанные уроки");
  await how.getByRole("button", { name: "Понятно" }).click();
  await expect(how).toHaveCount(0);

  // --- guided setup: no percent yet -> a calm hint (no red error), «Рассчитать всех» waits and says how many are left
  await expect(teachers).toContainText("Укажите процент — это делается один раз");
  await expect(teachers.getByRole("textbox", { name: /Процент для .*Групповой, Группа/ })).toHaveAttribute("aria-invalid", "false");
  await expect(page.getByRole("button", { name: "Рассчитать всех" })).toBeDisabled();
  await expect(page.getByText("Не указан процент у 2 из 2 преподавателей — укажите его, чтобы рассчитать всех")).toBeVisible();

  // --- percents and the calculation of everybody
  await teachers.getByRole("textbox", { name: /Процент для .*Групповой, Группа/ }).fill("62.5");
  await expect(page.getByText("осталось 1 из 2 преподавателей")).toBeVisible();
  await teachers.getByRole("textbox", { name: /Процент для .*Индивидуальный, Индивидуально/ }).fill("40");
  await expect(page.getByRole("button", { name: "Рассчитать всех" })).toBeEnabled();
  await page.getByRole("button", { name: "Рассчитать всех" }).click();
  const preview = page.getByRole("region", { name: "Предпросмотр расчёта" });
  await expect(preview).toBeVisible();

  await preview.getByRole("tab", { name: /Групповой/ }).click();
  await expect(preview).toContainText(total(t1Total));
  const lineOf = (name: string) => preview.getByRole("row", { name: new RegExp(name) });
  await expect(lineOf("Первый Анвар")).toContainText(`${groupedDigits(payrollLine(600000, "62.5", 1))} сум`);
  await expect(lineOf("Второй Мадина")).toContainText(`${groupedDigits(payrollLine(900000, "62.5", 1))} сум`);
  await expect(lineOf("Третий Булат")).toContainText("Ждёт"); // the excuse waits for a decision, the lesson counts
  await expect(lineOf("Третий Булат")).toContainText(`${groupedDigits(payrollLine(300000, "62.5", 1))} сум`);
  await expect(lineOf("Неплательщик Эльдар")).toContainText("Был на уроке, урок не оплачен — не входит в сумму"); // shown, but not in the sum
  await expect(lineOf("Второй Мадина")).toContainText("индивидуальная"); // the individual price is marked on the sheet
  await expect(lineOf("Первый Анвар")).not.toContainText("индивидуальная"); // the price of the group is not
  await expect(lineOf("Неплательщик Эльдар")).toContainText("0 сум");
  await preview.getByRole("tab", { name: /Индивидуальный/ }).click();
  await expect(preview).toContainText(total(t2Total));

  // --- save the sheet of teacher 1
  await preview.getByRole("tab", { name: /Групповой/ }).click();
  await preview.getByRole("button", { name: "Сохранить ведомость" }).click();
  await expect(toast(page, "Ведомость сохранена · редакция 1")).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: "Групповой" });
  await expect(row).toContainText(`Сохранено · редакция 1 · ${groupedDigits(t1Total)} сум`);

  // --- the saved sheet: change one fee on it, save as revision 2
  await row.getByRole("link", { name: "Открыть ведомость" }).click();
  await expect(page).toHaveURL(/\/owner\/payroll\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toContainText("Групповой");
  await expect(page.getByText(new RegExp(`редакция 1 · ${moneyPattern(t1Total)}\\s*сум`))).toBeVisible();
  await page.getByRole("textbox", { name: /Оплата в месяц: Первый Анвар/ }).fill("700000");
  const newTotal = payrollLine(700000, "62.5", 1) + payrollLine(900000, "62.5", 1) + payrollLine(300000, "62.5", 1);
  await expect(page.getByRole("tabpanel")).toContainText(total(newTotal));
  await expect(page.getByText("изменена · было 600 000 сум")).toBeVisible();
  await page.getByRole("button", { name: "Сохранить как редакцию 2" }).click();
  await expect(toast(page, /Сохранено · редакция 2/)).toBeVisible();
  await expect(page.getByText(new RegExp(`редакция 2 · ${moneyPattern(newTotal)}\\s*сум`))).toBeVisible();

  // --- history of revisions
  await page.getByRole("tab", { name: "История редакций" }).click();
  const history = page.getByRole("tabpanel");
  await expect(history).toContainText("Редакция 2");
  await expect(history).toContainText("Редакция 1");
  await expect(history).toContainText(groupedDigits(newTotal));
  await expect(history).toContainText(groupedDigits(t1Total));

  // --- and the API holds the same two revisions
  const sheets = await org.owner.api.get("/auth/org/payroll/sheets", { month });
  const sheet = sheets.find((s: any) => s.teacher_id === t1.userId);
  expect(sheet.revision).toBe(2);
  const revisions = await org.owner.api.get(`/auth/org/payroll/sheets/${sheet.id}/revisions`);
  expect(Object.fromEntries(revisions.map((r: any) => [r.revision, r.total_amount]))).toEqual({ 1: t1Total, 2: newTotal });
});
