// «Деньги-1», обход stage 05.11, D-6: the windows of a transfer (the bulk one of «Добавить ученика» and the single one of the card of a student) in a real DOM say the state of the NEW account after
// the transfer.  The answers are in the shape of the contract (`MONEY1_A_SERVER_REPORT.md`): a bulk answer has no `carried`, only `warnings[]` with `student_id`.
const assert = require("node:assert/strict");
const test = require("node:test");
const { launch, openPage } = require("./helpers/dom-page.cjs");

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

const AFTER_TEXT = "Перенесено 640 000 сум; аванс останется 640 000 сум. Со следующего дня начислят ещё 350 000 сум (аванс останется 290 000 сум)";
const ARRIVED = (id) => ({ code: "payment_carried_over", message: "Остаток денег 640 000 сум перенесён в «7-Б Геометрия»", ...(id ? { student_id: id } : {}) });
const AFTER = (id) => ({ code: "transfer_balance_after", message: AFTER_TEXT, ...(id ? { student_id: id } : {}) });
const STUDENT = { id: "st1", first_name: "Иван", last_name: "Иванов", full_name: "Иванов Иван", class_level: 7, status: "active", group_id: "g1", current_group_id: "g1", groups_count: 1 };
const EMPTY = { students: [], payroll: [], text: "", dryRun: true };
const flat = async (page, selector) => (await page.textContent(selector)).replace(/\s+/g, " ").replace(/ /g, " ");

test("D-6 bulk: «Что переедет» of «Добавить ученика» shows the sentence of the new account from `warnings[]` (the bulk answer has no `carried`) - once, with the sum that stays", async () => {
  const run = await openPage(browser, "enrol.entry.tsx", (request) => {
    if (request.method === "GET" && request.path === "/auth/org/groups") return { json: [{ id: "g1", name: "7-А Алгебра" }, { id: "g2", name: "7-Б Геометрия" }] };
    if (request.method === "GET" && request.path === "/auth/org/students") return { json: { items: [STUDENT], total: 1 } };
    if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/bulk") {
      return { json: { group_id: "g2", added: 1, skipped: 0, skipped_details: [], warnings: [ARRIVED("st1"), AFTER("st1")], dry_run: /dry_run=true/.test(request.query), money_effects: EMPTY } };
    }
    return null;
  });
  await run.page.evaluate((who) => window.mount(who), { role: "owner", org_role: "owner" });
  await run.page.fill('input[placeholder^="Поиск по имени"]', "Ив");
  await run.page.click('button:has-text("Иванов Иван")');
  await run.page.waitForSelector('[data-testid="transfer-carried"]');
  const text = await flat(run.page, '[data-testid="transfer-carried"]');
  assert.equal(text, AFTER_TEXT);
  assert.ok(!text.includes("Остаток денег"), "the older sentence of the same transfer is not said next to it");
  assert.ok(!(await flat(run.page, '[data-testid="transfer-preview"]')).includes("Оплаты и долги не переносятся"), "not «ничего не переносится» - the money is carried");
  await run.page.close();
});

test("D-6 single: the window «Перевести в другую группу» shows `carried[]` once; the sentence is the state after the transfer (= `carry_after.text`)", async () => {
  const run = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.method === "GET" && request.path === "/auth/org/groups") return { json: [{ id: "g1", name: "7-А Алгебра", class_level: 7, status: "active", teacher_id: "t1", teacher_name: "Каримова К." }, { id: "g2", name: "7-Б Геометрия", class_level: 7, status: "active", teacher_id: "t1", teacher_name: "Каримова К." }] };
    if (request.method === "GET" && request.path === "/auth/org/members") return { json: [{ id: "t1", user_id: "t1", org_role: "teacher", first_name: "Каримова", last_name: "К." }] };
    if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/st1") {
      const carryAfter = { carried: 640000, charged_now: 0, advance: 640000, debt: 0, charged_tomorrow: 350000, advance_tomorrow: 290000, text: AFTER_TEXT };
      return { json: { student_id: "st1", group_id: "g2", status: "added", dry_run: true, carried: [ARRIVED(), AFTER()], warnings: [ARRIVED(), AFTER()], carry_after: carryAfter, money_effects: EMPTY } };
    }
    return null;
  });
  await run.page.evaluate(() => window.mount("assign"));
  await run.page.click("text=7-Б Геометрия");
  await run.page.waitForSelector('[data-testid="transfer-carried"]');
  assert.equal(await flat(run.page, '[data-testid="transfer-carried"]'), AFTER_TEXT);
  await run.page.close();
});

test("D-6: a transfer with nothing to carry still says so (nothing invented)", async () => {
  const run = await openPage(browser, "enrol.entry.tsx", (request) => {
    if (request.method === "GET" && request.path === "/auth/org/groups") return { json: [{ id: "g1", name: "7-А Алгебра" }, { id: "g2", name: "7-Б Геометрия" }] };
    if (request.method === "GET" && request.path === "/auth/org/students") return { json: { items: [STUDENT], total: 1 } };
    if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/bulk") return { json: { group_id: "g2", added: 1, skipped: 0, skipped_details: [], warnings: [], dry_run: true, money_effects: EMPTY } };
    return null;
  });
  await run.page.evaluate((who) => window.mount(who), { role: "owner", org_role: "owner" });
  await run.page.fill('input[placeholder^="Поиск по имени"]', "Ив");
  await run.page.click('button:has-text("Иванов Иван")');
  await run.page.waitForSelector('[data-testid="transfer-carried-none"]');
  await run.page.close();
});
