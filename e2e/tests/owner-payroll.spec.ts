import { test, expect } from "../support/fixtures";
import { Org, runLesson } from "../support/api";
import { businessNow, payrollLine } from "../support/time";
import { groupedDigits, moneyPattern, toast } from "../support/ui";

/** The total of the card on top of a sheet: «К выплате» and the sum are two elements, no space between them in the text content. */
const total = (amount: number) => new RegExp(`К выплате\\s*${moneyPattern(amount)}\\s*сум`);

/**
 * Owner: «Зарплата» (UX-2). The rate is set ONCE, in «Сотрудники» («Изменить ставку»); «Зарплата» only reads it:
 * no percent field on the month page or on the sheet, no price field on the sheet (the price is «Оплаты -> Цены групп»).
 * «Рассчитать всех» waits for the rates -> the sheet total equals the partner's formula for the seeded marks (computed here
 * independently):
 *     line = round_half_up( price x percent / 100 x counted lessons / 12 )
 * where the price is the price of the GROUP (#105) or, for three of the students, an individual price with a reason.
 * -> «Сохранить» -> «начислить» for the student who never paid -> «Сохранить» (version 2) -> «История сохранений»;
 * -> the rate changes -> «Есть изменения» -> «Пересчитать».
 *
 * Seeded lesson of today (one lesson per teacher, both completed):
 *   teacher 1, «Группа» (price of the group 600 000), 62.5 %:  Анвар 600 000 (the group's) present
 *                                 | Мадина 900 000 (individual) absent | Булат 300 000 (individual) excused (not yet confirmed)
 *                                 | Эльдар 450 000 (individual) present but NEVER PAID (shown, not in the sum until «начислить»)
 *   teacher 2, «Индивидуально» (price of the group 800 000), 40 %:  Дилшод 800 000 present
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Зарплата");
});

test("rate in «Сотрудники» -> «Рассчитать всех» -> total by the formula -> save -> «начислить» -> version 2 -> history -> new rate -> «Пересчитать»", async ({ signIn }) => {
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
  const withEldar = t1Total + payrollLine(450000, "62.5", 1); // «начислить» for the student who never paid

  const page = await signIn(org.owner);
  await page.goto(`/owner/payroll?month=${month}`);
  const teachers = page.getByRole("region", { name: "Преподаватели месяца" });
  await expect(teachers).toContainText("Групповой");
  await expect(teachers).toContainText("Индивидуальный");

  // --- the month: the summary line, one calm line for an open month, «Как считается» and «Делитель» in the «⋯» menu
  await expect(page.getByTestId("payroll-month-summary")).toContainText("сохранено 0 из 2");
  await expect(page.getByRole("status").filter({ hasText: "ещё идёт — расчёт предварительный" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Как считается", exact: true })).toHaveCount(0); // not floating next to the text
  await page.getByRole("button", { name: /^Ещё: как считается/ }).click();
  await page.getByRole("menuitem", { name: "Как считается" }).click();
  const how = page.getByRole("dialog", { name: "Как считается зарплата" });
  await expect(how).toContainText("Оплата в месяц × % ÷ 12 × засчитанные уроки");
  await how.getByRole("button", { name: "Понятно" }).click();
  await expect(how).toHaveCount(0);

  // --- no rate yet: no field on this page, «Не задана · Указать», «Рассчитать всех» waits and says how many are left
  await expect(page.locator("main").getByRole("textbox")).toHaveCount(0);
  await expect(page.locator("main").getByRole("checkbox")).toHaveCount(0);
  await expect(teachers).toContainText("Не задана · Указать");
  await expect(page.getByRole("button", { name: "Рассчитать всех" })).toBeDisabled();
  await expect(page.getByText("Не задана ставка у 2 преподавателей")).toBeVisible();

  // --- the rate is set in «Сотрудники»: «Указать» of the row opens the dialog of that teacher
  await teachers.getByRole("listitem").filter({ hasText: "Групповой" }).getByRole("link", { name: "Указать" }).click();
  await expect(page).toHaveURL(/\/owner\/teachers\?teacher=/);
  const dialog = page.getByRole("dialog", { name: "Изменить ставку" });
  await expect(dialog).toContainText("Групповой");
  await expect(dialog.getByLabel("Действует с")).toHaveValue(month); // the current month by default
  await dialog.getByRole("textbox", { name: "Группа" }).fill("62.5");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Ставка сохранена")).toBeVisible();
  await expect(page).toHaveURL(/\/owner\/teachers$/);
  await expect(page.getByText("Ставка: Группа 62,5%")).toBeVisible();
  // the other teacher through the button of his card
  await page.getByRole("button", { name: /Изменить ставку: .*Индивидуальный/ }).click();
  await page.getByRole("dialog", { name: "Изменить ставку" }).getByRole("textbox", { name: "Индивидуально" }).fill("40");
  await page.getByRole("dialog", { name: "Изменить ставку" }).getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Ставка сохранена")).toBeVisible();
  await expect(page.getByText("Ставка: Индивидуально 40%")).toBeVisible();

  // --- back on the month: the rates are read, «Рассчитать всех» is on
  await page.goto(`/owner/payroll?month=${month}`);
  await expect(teachers).toContainText("Группа 62,5%");
  await expect(teachers).toContainText("Индивидуально 40%");
  await expect(page.getByRole("button", { name: "Рассчитать всех" })).toBeEnabled();
  await page.getByRole("button", { name: "Рассчитать всех" }).click();
  const preview = page.getByRole("region", { name: "Предпросмотр расчёта" });
  await expect(preview).toBeVisible();

  await preview.getByRole("tab", { name: /Групповой/ }).click();
  await expect(preview.getByTestId("payroll-total")).toContainText(groupedDigits(t1Total));
  await expect(preview).toContainText("Ставка: Группа 62,5%");
  const lineOf = (name: string) => preview.getByRole("row", { name: new RegExp(name) });
  await expect(lineOf("Первый Анвар")).toContainText(`${groupedDigits(payrollLine(600000, "62.5", 1))} сум`);
  await expect(lineOf("Второй Мадина")).toContainText(`${groupedDigits(payrollLine(900000, "62.5", 1))} сум`);
  await expect(lineOf("Третий Булат")).toContainText(`${groupedDigits(payrollLine(300000, "62.5", 1))} сум`);
  await expect(lineOf("Неплательщик Эльдар")).toContainText("0 сум"); // shown, but not in the sum
  await expect(lineOf("Второй Мадина")).toContainText("индивидуальная"); // the individual price is marked on the sheet
  await expect(lineOf("Первый Анвар")).not.toContainText("индивидуальная"); // the price of the group is not
  await expect(lineOf("Второй Мадина")).toContainText("900 000"); // the price is text: nothing to type
  await expect(preview.getByRole("textbox")).toHaveCount(1); // the only field is the note of the version
  // the dates are behind «По датам» of the group
  await expect(preview).not.toContainText("Ждёт");
  await preview.getByRole("button", { name: "По датам" }).click();
  await expect(preview).toContainText("Ждёт"); // the excuse waits for a decision, the lesson counts
  await expect(preview).toContainText("Был на уроке, урок не оплачен — не входит в сумму");
  await preview.getByRole("tab", { name: /Индивидуальный/ }).click();
  await expect(preview.getByTestId("payroll-total")).toContainText(groupedDigits(t2Total));

  // --- save the sheet of teacher 1 with the one button of the card
  await preview.getByRole("tab", { name: /Групповой/ }).click();
  await preview.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Ведомость сохранена · версия 1")).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: "Групповой" });
  await expect(row).toContainText(/Сохранено \d\d\.\d\d/);
  await expect(row).toContainText(`${groupedDigits(t1Total)} сум`);
  await expect(page.getByTestId("payroll-month-summary")).toContainText(`${groupedDigits(t1Total)} сум`);
  await expect(page.getByTestId("payroll-month-summary")).toContainText("сохранено 1 из 2");

  // --- the saved sheet: the card, then «начислить» for the student who never paid -> version 2
  await row.getByRole("button", { name: /Открыть: .*Групповой/ }).click();
  await expect(page).toHaveURL(/\/owner\/payroll\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toContainText("Групповой");
  const card = page.getByRole("region", { name: "Итог ведомости" });
  await expect(card).toContainText(total(t1Total));
  await expect(card).toContainText(/Сохранено \d\d\.\d\d\.\d{4} в \d\d:\d\d/);
  await expect(card).toContainText("засчитано 3 посещения");
  await expect(card.getByRole("button", { name: "Пересчитать" })).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0); // no price field, no percent field
  await page.getByRole("checkbox", { name: /Начислить за неоплаченные уроки .*Неплательщик Эльдар/ }).check();
  await expect(card).toContainText(total(withEldar));
  await expect(card).toContainText("начислено 1");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(toast(page, /Сохранено · версия 2/)).toBeVisible();
  await expect(card).toContainText(total(withEldar));

  // --- the history of the saves
  await page.getByRole("tab", { name: "История сохранений" }).click();
  const history = page.getByRole("tabpanel");
  await expect(history).toContainText("Версия 2");
  await expect(history).toContainText("Версия 1");
  await expect(history).toContainText(groupedDigits(withEldar));
  await expect(history).toContainText(groupedDigits(t1Total));
  await expect(history).not.toContainText("редакци");

  // --- the rate changes: the saved sheet is a snapshot, but it says the data moved and offers «Пересчитать»
  await org.setPayrollRate(t1.userId, { group: "70" });
  await page.reload();
  await page.getByRole("tab", { name: "Ведомость" }).click();
  await expect(card).toContainText("После сохранения изменились данные");
  await expect(card).toContainText(/\+[\s\d]+\s*сум/); // the difference of the total
  await card.getByText("Что изменилось").click();
  await expect(card).toContainText(/ставка/i);
  await card.getByRole("button", { name: "Пересчитать" }).click();
  await expect(toast(page, /Ведомость пересчитана · версия 3/)).toBeVisible();
  await expect(card).toContainText("Ставка: Группа 70%");

  // --- and the API holds the same versions
  const sheets = await org.owner.api.get("/auth/org/payroll/sheets", { month });
  const sheet = sheets.find((s: any) => s.teacher_id === t1.userId);
  expect(sheet.revision).toBe(3);
  const revisions = await org.owner.api.get(`/auth/org/payroll/sheets/${sheet.id}/revisions`);
  const byRevision = Object.fromEntries(revisions.map((r: any) => [r.revision, r.total_amount]));
  expect(byRevision[1]).toBe(t1Total);
  expect(byRevision[2]).toBe(withEldar);
  expect(byRevision[3]).toBeGreaterThan(withEldar);
});
