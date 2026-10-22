import { readFileSync, writeFileSync } from "node:fs";
import { test, expect } from "../support/fixtures";
import { Org, type GroupInfo, type StudentInfo } from "../support/api";
import { addDays, businessNow, weekdayOf } from "../support/time";
import { dm, dmy, expectNoHorizontalScroll, moneyPattern, toast } from "../support/ui";
import { readSheet, readZip, setCellText, writeZip } from "../support/xlsx-lite";

/**
 * ROADMAP #125 «Остатки на начало»: «Оплаты → Остатки на начало» - every active student of the centre by group; «оплачено до» /
 * «долг на начало» in the row or for a whole group; «Проверить» (what it does to the debts) → «Сохранить» (one batch); the Excel round trip;
 * the lessons mode («осталось уроков → оплачено до»); a student who left takes a debt only; an administrator without the money right is refused.
 *
 * The accounting start is 7 days ahead, so everybody enrolled today «came before the start» (the rows are «не заполнено»).  The floor of
 * «оплачено до» is the day before the start.  The banner of «Должники», the checklist of the settings and the button of «Оплаты» are built
 * but wired by the IA pack, so they are not exercised here.
 */
const today = businessNow().date;
const start = addDays(today, 7);
const dayBefore = addDays(start, -1);

let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Остатки");
  await org.setPaymentSettings({ accounting_start_date: start });
});

const groupBlock = (page: import("@playwright/test").Page, group: GroupInfo) => page.getByTestId("openings-group").filter({ hasText: group.name });
/** The accordion opens only the first groups to fill: a test opens its own group, whatever the others do. */
async function openBlock(page: import("@playwright/test").Page, group: GroupInfo) {
  const block = groupBlock(page, group);
  const toggle = block.getByTestId("openings-group-toggle");
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  return block;
}
/** The progress line of a group exists twice (wide and phone layout); the visible one. */
const progressOf = (block: import("@playwright/test").Locator) => block.locator('[data-testid="openings-group-progress"]:visible');
const rowOf = (block: import("@playwright/test").Locator, membershipId: string) => block.locator(`[data-membership-id="${membershipId}"]`);

async function groupWithStudents(name: string, surnames: string[], price = 500000): Promise<{ group: GroupInfo; students: StudentInfo[]; memberships: string[] }> {
  const teacher = await org.addStaff("teacher", `Учитель ${name}`);
  const group = await org.createGroup({ name, teacherId: teacher.userId });
  await org.setGroupPrice(group.id, price);
  const students: StudentInfo[] = [];
  for (const surname of surnames) students.push(await org.addStudent(group, "Анвар", surname));
  const memberships = await Promise.all(students.map((student) => org.membershipId(student.id, group.id)));
  return { group, students, memberships };
}

async function savedOpening(membershipId: string) {
  const list = await org.owner.api.get("/auth/org/opening-balances");
  const row = list.groups.flatMap((g: any) => g.memberships).find((m: any) => m.membership_id === membershipId);
  return row?.opening ?? null;
}

test("bulk «оплачено до» for a group → «Проверить» → «Сохранить» → the statement shows it", async ({ signIn }) => {
  const { group, students, memberships } = await groupWithStudents("Группа О1", ["Первый", "Второй", "Третий"]);
  const page = await signIn(org.owner);
  await page.goto("/owner/payments/openings");

  // --- the title, the one sentence with the date, the progress
  await expect(page.getByRole("heading", { name: "Остатки на начало" })).toBeVisible();
  await expect(page.getByTestId("openings-intro")).toContainText(`до начала учёта ${dmy(start)}`);
  await expect(page.getByTestId("openings-progress")).toContainText(/^Заполнено \d+ из \d+$/);
  const block = await openBlock(page, group);
  await expect(progressOf(block)).toHaveText("заполнено 0 из 3");
  await expect(block.getByTestId("openings-row")).toHaveCount(3);
  await expect(block.getByTestId("openings-now").first()).toHaveText("Не заполнено");
  // the student is a link to the payments tab of the card
  await expect(block.getByTestId("openings-student-link").first()).toHaveAttribute("href", new RegExp(`/owner/students/${students[0].id}\\?tab=payments$`));

  // --- the whole group, «Оплачено до» a date (the quick dates say what they are)
  await block.getByTestId("openings-group-select").check();
  await expect(page.getByTestId("openings-bulk-count")).toContainText("Выбрано: 3");
  await page.getByTestId("openings-bulk-paid").click();
  await expect(page.locator(`[data-testid="openings-quick-date"][data-date="${dayBefore}"]`)).toHaveText(`${dm(dayBefore)} (долга нет)`);
  await expect(page.getByTestId("openings-quick-date").nth(1)).toContainText("(оплатил ");
  const paidUntil = addDays(start, 20);
  await page.getByLabel("Другая дата").fill(paidUntil);
  await page.getByTestId("openings-bulk-paid-apply").click();
  await expect(rowOf(block, memberships[0]).getByTestId("openings-paid-until")).toHaveValue(paidUntil);
  await expect(page.getByTestId("openings-changed")).toHaveText("Изменено: 3");
  await expect(toast(page, `Оплачено до ${dm(paidUntil)}: 3 ученика`)).toBeVisible();
  // nothing is written yet
  expect(await savedOpening(memberships[0])).toBeNull();

  // --- «Проверить»: the summary is the server's; nothing is saved by it
  await page.getByTestId("openings-check").click();
  const dialog = page.getByRole("dialog", { name: "Проверьте перед сохранением" });
  await expect(dialog.getByTestId("openings-review-headline")).toHaveText("Изменится 3 ученика");
  await expect(dialog.getByTestId("openings-review-parts")).toContainText(`3 — оплачено до ${dm(paidUntil)}`);
  await expect(dialog.getByTestId("openings-review-effect")).toContainText("общий долг не изменится");
  expect(await savedOpening(memberships[0])).toBeNull();
  await dialog.getByTestId("openings-review-save").click();
  await expect(toast(page, "Сохранено: 3 ученика")).toBeVisible();

  // --- the table is read again: filled; the server and the statement agree
  await expect(progressOf(block)).toHaveText("заполнено 3 из 3");
  await expect(page.getByTestId("openings-save-bar")).toHaveCount(0);
  await expect(rowOf(block, memberships[1]).getByTestId("openings-now")).toHaveText(`Оплачено до ${dm(paidUntil)}`);
  expect(await savedOpening(memberships[2])).toMatchObject({ paid_until: paidUntil, debt_amount: null });
  await page.goto(`/owner/payments/statement/${memberships[0]}`);
  const opening = page.getByTestId("statement-row-opening_paid_until");
  await expect(opening).toBeVisible();
  await expect(opening).toContainText(dm(paidUntil));
  await expect(page.getByTestId("statement-reconciles")).toContainText("Сходится");
  await expect.poll(async () => (await org.owner.api.get(`/auth/org/memberships/${memberships[0]}/statement`)).rows.some((r: any) => r.type === "opening_paid_until")).toBe(true);
});

test("«Долга нет» writes «оплачено до» the day before the start; the row says «Долга на начало нет» and counts as filled", async ({ signIn }) => {
  const { group, memberships } = await groupWithStudents("Группа О2", ["Чистый", "Спокойный"]);
  const page = await signIn(org.owner);
  await page.goto("/owner/payments/openings");
  const block = await openBlock(page, group);
  await block.getByTestId("openings-group-select").check();
  await page.getByTestId("openings-bulk-nodebt").click();
  await expect(rowOf(block, memberships[0]).getByTestId("openings-paid-until")).toHaveValue(dayBefore);
  await page.getByTestId("openings-check").click();
  const dialog = page.getByRole("dialog", { name: "Проверьте перед сохранением" });
  await expect(dialog.getByTestId("openings-review-parts")).toContainText("2 — долга на начало нет");
  await dialog.getByTestId("openings-review-save").click();
  await expect(toast(page, "Сохранено: 2 ученика")).toBeVisible();
  await expect(rowOf(block, memberships[0]).getByTestId("openings-now")).toHaveText("Долга на начало нет");
  await expect(progressOf(block)).toHaveText("заполнено 2 из 2");
  expect(await savedOpening(memberships[1])).toMatchObject({ paid_until: dayBefore });
});

test("a debt for one student → the effect says a debtor appears → saved → the student is among «Должники»", async ({ signIn }) => {
  const { group, students, memberships } = await groupWithStudents("Группа О3", ["Должный", "Платящий"]);
  const page = await signIn(org.owner);
  await page.goto("/owner/payments/openings");
  const block = await openBlock(page, group);
  const row = rowOf(block, memberships[0]);
  await row.getByTestId("openings-debt").fill("250000");
  await expect(row.getByTestId("openings-debt")).toHaveValue(/250\s000/);
  // the date of the debt is the floor of the row until the user picks another
  await expect(row.getByTestId("openings-debt-on")).toHaveValue(dayBefore);
  // a debt that happened before the start: a few days earlier is fine, a day after the start is refused on the spot
  const debtDay = addDays(today, -10);
  await row.getByTestId("openings-debt-on").fill(debtDay);
  await expect(page.getByTestId("openings-changed")).toHaveText("Изменено: 1");
  await row.getByTestId("openings-debt-on").fill(addDays(start, 3));
  await expect(row.getByTestId("openings-row-problem")).toContainText(`не позже ${dmy(dayBefore)}`);
  await page.getByTestId("openings-check").click();
  await expect(page.getByText(/Исправьте 1 строку/)).toBeVisible();
  await row.getByTestId("openings-debt-on").fill(debtDay);
  await expect(row.getByTestId("openings-row-problem")).toHaveCount(0);

  await page.getByTestId("openings-check").click();
  const dialog = page.getByRole("dialog", { name: "Проверьте перед сохранением" });
  await expect(dialog.getByTestId("openings-review-parts")).toContainText(new RegExp(`1 — долг ${moneyPattern(250000)}\\sсум`));
  await expect(dialog.getByTestId("openings-review-effect")).toContainText(/Должников станет \d+/);
  await expect(dialog.getByTestId("openings-review-effect")).toContainText(new RegExp(`общий долг \\+${moneyPattern(250000)}\\sсум`));
  await dialog.getByTestId("openings-review-save").click();
  await expect(toast(page, /Сохранено: 1 ученик · долг центра \+/)).toBeVisible();
  await expect(row.getByTestId("openings-now")).toContainText(new RegExp(`Долг ${moneyPattern(250000)}\\sсум на ${dm(debtDay)}`));

  expect(await savedOpening(memberships[0])).toMatchObject({ debt_amount: 250000, debt_on: debtDay });
  await page.goto("/owner/payments?bucket=debt");
  await expect(page.getByText(students[0].lastName).first()).toBeVisible();
  await expect(page.getByText(students[1].lastName)).toHaveCount(0);
});

test("Excel round trip: the file without edits changes nothing; edited cells change exactly those rows; a bad cell is a visible error with its row", async ({ signIn }) => {
  const { group, memberships, students } = await groupWithStudents("Группа О5", ["Эксель-А", "Эксель-Б", "Эксель-В"]);
  const page = await signIn(org.owner);
  await page.goto("/owner/payments/openings");
  await expect(groupBlock(page, group)).toBeVisible();
  await page.getByTestId("openings-group-filter").selectOption(group.id); // the file holds this group only

  // --- download
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("openings-download").click()]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  const path = test.info().outputPath("ostatki.xlsx");
  await download.saveAs(path);
  const sheet = readSheet(readZip(readFileSync(path)), "Остатки");
  const byName = (surname: string) => sheet.find((r) => r.cells.A === surname);
  expect(byName(students[0].lastName)?.cells.K).toBe(memberships[0]); // the key of the row: «ID членства»

  // --- the file as it is: 0 changes
  await page.getByTestId("openings-file").setInputFiles(path);
  const dialog = page.getByRole("dialog", { name: "Файл с остатками" });
  await expect(dialog.getByTestId("openings-excel-file-line")).toContainText("изменится 0");
  await expect(dialog.getByTestId("openings-excel-nothing")).toBeVisible();
  await expect(dialog.getByTestId("openings-excel-apply")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // --- three cells edited: «оплачено до» of A, a debt of B, a broken date of C
  const parts = readZip(readFileSync(path));
  const paidUntil = addDays(start, 25);
  const a = byName(students[0].lastName)!;
  const b = byName(students[1].lastName)!;
  const c = byName(students[2].lastName)!;
  setCellText(parts, "Остатки", `G${a.row}`, dmy(paidUntil));
  setCellText(parts, "Остатки", `H${b.row}`, "120000");
  setCellText(parts, "Остатки", `G${c.row}`, "31.13.2026");
  const edited = test.info().outputPath("ostatki-edited.xlsx");
  writeFileSync(edited, writeZip(parts));

  await page.getByTestId("openings-file").setInputFiles(edited);
  await expect(dialog.getByTestId("openings-excel-file-line")).toContainText("изменится 2");
  await expect(dialog.getByTestId("openings-excel-file-line")).toContainText("ошибок 1");
  await expect(dialog.getByTestId("openings-excel-error-row")).toHaveCount(1);
  await expect(dialog.getByTestId("openings-excel-error-row")).toContainText(`строка ${c.row}:`);
  await expect(dialog.getByTestId("openings-excel-error-row")).toContainText("31.13.2026");
  await expect(dialog.getByTestId("openings-excel-changes")).toContainText(students[0].lastName);
  await expect(dialog.getByTestId("openings-excel-changes")).toContainText(`оплачено до ${dm(paidUntil)}`);
  await expect(dialog.getByTestId("openings-excel-changes")).toContainText(new RegExp(`долг ${moneyPattern(120000)}\\sсум`));
  expect(await savedOpening(memberships[0])).toBeNull(); // nothing is written by the report
  await expect(dialog.getByTestId("openings-excel-apply")).toHaveText("Применить 2 изменения");
  await dialog.getByTestId("openings-excel-apply").click();
  await expect(toast(page, "Сохранено: 2 ученика")).toBeVisible();

  expect(await savedOpening(memberships[0])).toMatchObject({ paid_until: paidUntil });
  expect(await savedOpening(memberships[1])).toMatchObject({ debt_amount: 120000 });
  expect(await savedOpening(memberships[2])).toBeNull(); // the broken row was not applied
  await expect(progressOf(groupBlock(page, group))).toHaveText("заполнено 2 из 3");
});

test("a student who left before the start: «Показать ушедших» → only the debt can be entered", async ({ signIn }) => {
  const { group, students, memberships } = await groupWithStudents("Группа О6", ["Остающийся", "Ушедший"]);
  await org.owner.api.post(`/auth/org/groups/${group.id}/students/${students[1].id}/leave`, { settle: [] });
  const page = await signIn(org.owner);
  await page.goto("/owner/payments/openings");
  const block = await openBlock(page, group);
  await expect(block.getByTestId("openings-row")).toHaveCount(1); // the left student is not in the table...
  await page.getByTestId("openings-show-left").check(); // ... until the toggle
  await expect(block.getByTestId("openings-row")).toHaveCount(2);
  const left = rowOf(block, memberships[1]);
  await expect(left).toContainText("ушёл");
  await expect(left.getByTestId("openings-paid-until")).toBeDisabled();
  await expect(left.getByTestId("openings-debt")).toBeEnabled();
  await expect(left.getByTestId("openings-row-select")).toBeDisabled();
  await left.getByTestId("openings-debt").fill("300000");
  await left.getByTestId("openings-debt-on").fill(addDays(today, -20));
  await page.getByTestId("openings-check").click();
  const dialog = page.getByRole("dialog", { name: "Проверьте перед сохранением" });
  await expect(dialog.getByTestId("openings-review-parts")).toContainText(new RegExp(`1 — долг ${moneyPattern(300000)}\\sсум`));
  await dialog.getByTestId("openings-review-save").click();
  await expect(toast(page, /Сохранено: 1 ученик/)).toBeVisible();
  expect(await savedOpening(memberships[1])).toBeNull(); // the table of the active ones does not list him; ask with include_left
  const withLeft = await org.owner.api.get("/auth/org/opening-balances", { include_left: true });
  const saved = withLeft.groups.flatMap((g: any) => g.memberships).find((m: any) => m.membership_id === memberships[1]);
  expect(saved.opening).toMatchObject({ debt_amount: 300000 });
  expect(saved.only_debt).toBe(true);
});

test("a conflict: somebody else changed the row between the table and the save → the row is refreshed, the other edits stay", async ({ signIn }) => {
  const { group, memberships } = await groupWithStudents("Группа О7", ["Конфликтный", "Спокойный"]);
  const page = await signIn(org.owner);
  await page.goto("/owner/payments/openings");
  const block = await openBlock(page, group);
  await rowOf(block, memberships[0]).getByTestId("openings-paid-until").fill(addDays(start, 10));
  await rowOf(block, memberships[1]).getByTestId("openings-paid-until").fill(addDays(start, 11));
  // «Проверить» is done: the summary is on the screen ...
  await page.getByTestId("openings-check").click();
  const dialog = page.getByRole("dialog", { name: "Проверьте перед сохранением" });
  await expect(dialog.getByTestId("openings-review-headline")).toHaveText("Изменится 2 ученика");
  // ... and another administrator saves the first row meanwhile (the same API the page uses)
  const list = await org.owner.api.get("/auth/org/opening-balances");
  const live = list.groups.flatMap((g: any) => g.memberships).find((m: any) => m.membership_id === memberships[0]);
  const body = { items: [{ membership_id: memberships[0], version: live.version, paid_until: addDays(start, 5) }] };
  const preview = await org.owner.api.post("/auth/org/opening-balances/batch/preview", body);
  await org.owner.api.post("/auth/org/opening-balances/batch", { ...body, idempotency_key: crypto.randomUUID(), digest: preview.digest });

  await dialog.getByTestId("openings-review-save").click();
  await expect(page.getByTestId("openings-notice")).toContainText("Кто-то уже изменил 1 строку");
  await expect(page.getByTestId("openings-notice")).toContainText("Остальные ваши правки сохранены");
  await expect(rowOf(block, memberships[0]).getByTestId("openings-now")).toHaveText(`Оплачено до ${dm(addDays(start, 5))}`);
  await expect(rowOf(block, memberships[1]).getByTestId("openings-paid-until")).toHaveValue(addDays(start, 11)); // the other edit is kept
  await expect(page.getByTestId("openings-changed")).toHaveText("Изменено: 1");
  await page.getByTestId("openings-check").click();
  await dialog.getByTestId("openings-review-save").click();
  await expect(toast(page, "Сохранено: 1 ученик")).toBeVisible();
  expect(await savedOpening(memberships[1])).toMatchObject({ paid_until: addDays(start, 11) });
});

test("unsaved edits are guarded: leaving the page asks first, and a phone shows cards without a sideways scroll", async ({ signIn }) => {
  const { group, memberships } = await groupWithStudents("Группа О8", ["Телефонный"]);
  const page = await signIn(org.owner);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/owner/payments/openings");
  const block = await openBlock(page, group);
  await expect(block.getByTestId("openings-row")).toHaveCount(1);
  await expectNoHorizontalScroll(page);
  await rowOf(block, memberships[0]).getByTestId("openings-paid-until").fill(addDays(start, 10));
  await expect(page.getByTestId("openings-save-bar")).toBeVisible(); // sticky at the bottom
  await expectNoHorizontalScroll(page);
  const dialogs: string[] = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); void d.dismiss(); });
  await page.getByTestId("openings-back").click();
  expect(dialogs.join(" ")).toContain("не сохранены");
  await expect(page).toHaveURL(/\/owner\/payments\/openings/);
});

test.describe("lessons mode", () => {
  let lessonsOrg: Org;
  test.beforeAll(async () => {
    lessonsOrg = await Org.create("Остатки пакеты");
    await lessonsOrg.setPaymentSettings({ period_mode: "lessons", lessons_per_payment: 8, accounting_start_date: start });
  });

  test("«осталось уроков» → the server's date is shown → saved as «оплачено до»", async ({ signIn }) => {
    const teacher = await lessonsOrg.addStaff("teacher", "Пакетов");
    const group = await lessonsOrg.createGroup({ name: "Группа П1", teacherId: teacher.userId });
    await lessonsOrg.setGroupPrice(group.id, 800000);
    const student = await lessonsOrg.addStudent(group, "Анвар", "Пакетный");
    // a weekly lesson on tomorrow's weekday: the K-th lesson from the start is a day the schedule knows
    await lessonsOrg.owner.api.post("/auth/org/schedule/lessons", { groupId: group.id, dayOfWeek: weekdayOf(addDays(today, 1)), startTime: "10:00", endTime: "11:00", topic: "E2E" });
    const membership = await lessonsOrg.membershipId(student.id, group.id);
    const page = await signIn(lessonsOrg.owner);
    await page.goto("/owner/payments/openings");
    const block = await openBlock(page, group);
    const row = rowOf(block, membership);
    await expect(row.getByTestId("openings-price")).toContainText(new RegExp(`${moneyPattern(800000)}\\sсум за пакет`));
    await row.getByTestId("openings-lessons").fill("4");
    const arrow = row.getByTestId("openings-lessons-arrow");
    await expect(arrow).toContainText(/→ оплачено до \d{2}\.\d{2}/);
    const shown = /оплачено до (\d{2}\.\d{2})/.exec((await arrow.textContent()) ?? "")![1];
    await page.getByTestId("openings-check").click();
    const dialog = page.getByRole("dialog", { name: "Проверьте перед сохранением" });
    await expect(dialog.getByTestId("openings-review-parts")).toContainText(`1 — оплачено до ${shown}`);
    await dialog.getByTestId("openings-review-save").click();
    await expect(toast(page, "Сохранено: 1 ученик")).toBeVisible();
    const list = await lessonsOrg.owner.api.get("/auth/org/opening-balances");
    const saved = list.groups.flatMap((g: any) => g.memberships).find((m: any) => m.membership_id === membership);
    expect(dm(saved.opening.paid_until)).toBe(shown);
    // «0 уроков» = nothing is left = «на начало долга нет»
    await row.getByTestId("openings-lessons").fill("0");
    await expect(row.getByTestId("openings-lessons-arrow")).toContainText("долга на начало нет");
  });
});

test("an administrator without the money right is refused (page and API); with the right the same page opens", async ({ signIn }) => {
  const admin = await org.addStaff("admin", "Безденежный");
  await org.setPaymentSettings({ admin_can_manage: false });
  const page = await signIn(admin);
  await page.goto("/admin/payments/openings");
  await expect(page.getByText("Раздел «Оплаты» недоступен")).toBeVisible();
  await expect(page.getByTestId("openings-group")).toHaveCount(0);
  await expect(admin.api.get("/auth/org/opening-balances")).rejects.toMatchObject({ status: 403 });
  await expect(admin.api.get("/auth/org/opening-balances/summary")).rejects.toMatchObject({ status: 403 });
  await expect(admin.api.post("/auth/org/opening-balances/batch/preview", { items: [] })).rejects.toMatchObject({ status: 403 });

  await org.setPaymentSettings({ admin_can_manage: true });
  await page.goto("/admin/payments/openings");
  await expect(page.getByRole("heading", { name: "Остатки на начало" })).toBeVisible();
  await expect(page.getByTestId("openings-intro")).toContainText(dmy(start));
  const summary = await admin.api.get("/auth/org/opening-balances/summary");
  expect(summary.accounting_start).toBe(start);
});
