// «Деньги-1», пакет А, R3 M2: «Добавить ученика в группу» in a real DOM.  A transfer carries the paid days and the advance over - the money right only.  An administrator without it
// has no switch «Перевести / Добавить», the request goes with `mode=add`, and the window says BEFORE «Зачислить» that the student will pay in both groups.
const assert = require("node:assert/strict");
const test = require("node:test");
const { launch, openPage } = require("./helpers/dom-page.cjs");

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

const STUDENT = { id: "st1", first_name: "Иван", last_name: "Иванов", full_name: "Иванов Иван", class_level: 7, status: "active", group_id: "g1", current_group_id: "g1", groups_count: 1 };
const answer = (request) => {
  if (request.method === "GET" && request.path === "/auth/org/groups") return { json: [{ id: "g1", name: "7-А Алгебра" }, { id: "g2", name: "7-Б Геометрия" }] };
  if (request.method === "GET" && request.path === "/auth/org/students") return { json: { items: [STUDENT], total: 1 } };
  if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/bulk") {
    if (/dry_run=true/.test(request.query)) return { json: { group_id: "g2", dry_run: true, added: 1, skipped: 0, carried: [{ code: "PAYMENT_CARRIED", message: "Оплата 300 000 сум перенесётся" }], money_effects: { students: [], payroll: [], text: "", dryRun: true } } };
    return { json: { group_id: "g2", added: 1, skipped: 0, skipped_details: [], warnings: [] } };
  }
  return null;
};

async function pickStudent(user) {
  const run = await openPage(browser, "enrol.entry.tsx", answer);
  await run.page.evaluate((who) => window.mount(who), user);
  await run.page.fill('input[placeholder^="Поиск по имени"]', "Ив");
  await run.page.click('button:has-text("Иванов Иван")');
  return run;
}
const plainText = (text) => text.replace(/\s+/g, " ").trim();
const bulkCalls = (calls) => calls.filter((call) => call.method === "POST" && call.path === "/auth/org/groups/g2/students/bulk" && !/dry_run=true/.test(call.query));

test("M2: an administrator WITHOUT the money right - no switch «Перевести / Добавить», the line about the second group is shown, the request is mode=add", async () => {
  const { page, calls, errors } = await pickStudent({ role: "admin", org_role: "admin", payments_access: false });
  await page.waitForSelector('[data-testid="enrol-second-group"]');
  const note = await page.textContent('[data-testid="enrol-second-group"]');
  assert.equal(note.replace(/\s+/g, " ").trim(), "Иванов Иван уже в группе 7-А Алгебра. «Добавить» запишет его во вторую группу — оплата будет в обеих. Перевести с переносом оплат может владелец или администратор с доступом к деньгам");
  assert.equal(await page.locator('[role="radiogroup"]').count(), 0, "no switch");
  assert.equal(await page.locator('[data-testid="transfer-preview"]').count(), 0, "no «что переедет»: nothing is transferred");
  await page.click('button:has-text("Зачислить (1)")');
  await page.waitForTimeout(300);
  const sent = bulkCalls(calls);
  assert.equal(sent.length, 1);
  assert.match(sent[0].query, /(^|&)mode=add($|&)/);
  assert.ok(!calls.some((call) => /mode=transfer/.test(call.query)), "not a single request of a transfer, not even a dry run");
  assert.deepEqual(errors.filter((text) => !/404|Failed to load resource/.test(text)), []);
  await page.close();
});

test("M2: an administrator with `payments_access` and the owner keep the switch (the transfer is the default), the dry run «что переедет» and the transfer", async () => {
  for (const user of [{ role: "owner", org_role: "owner" }, { role: "admin", org_role: "admin", payments_access: true }]) {
    const { page, calls } = await pickStudent(user);
    await page.waitForSelector('[role="radiogroup"]');
    assert.equal(await page.locator('[data-testid="enrol-second-group"]').count(), 0);
    await page.waitForSelector('[data-testid="transfer-carried"]');
    assert.match(await page.textContent('[data-testid="transfer-carried"]'), /Оплата 300 000 сум перенесётся/);
    assert.equal(plainText(await page.textContent('[data-testid="transfer-preview"] h3')), "Что изменится", "ONE title of the block");
    assert.equal(plainText(await page.textContent('button:has-text("Перевести (1)")')), "Перевести (1)", "the button names the action of the mode, not «Зачислить»");
    assert.equal(await page.locator('[data-testid="money-effects"]').count(), 0, "the window is about the money of the student: no salary block");
    assert.ok(!/зарплат/i.test(await page.textContent('[data-testid="transfer-preview"]')), "no line about the salary");
    await page.click('button:has-text("Перевести (1)")');
    await page.waitForTimeout(300);
    const sent = bulkCalls(calls);
    assert.equal(sent.length, 1, JSON.stringify(user));
    assert.match(sent[0].query, /(^|&)mode=transfer($|&)/);
    await page.close();
  }
});

test("R3 item 6: «Что изменится» is asked when somebody from another group is chosen; «Перевести (N)» waits for it; a failure holds it with «Повторить», the retry opens it", async () => {
  let attempts = 0;
  const hold = require("./helpers/dom-answers.cjs").deferred();
  const run = await openPage(browser, "enrol.entry.tsx", (request) => {
    if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/bulk" && /dry_run=true/.test(request.query)) {
      attempts += 1;
      if (attempts === 1) return hold.promise.then(() => ({ status: 500, json: { detail: { code: "SERVER_ERROR", message: "Расчёт не удался" } } }));
      return { json: { group_id: "g2", dry_run: true, added: 1, skipped: 0, carried: [], money_effects: { students: [], payroll: [], text: "", dryRun: true } } };
    }
    return answer(request);
  });
  await run.page.evaluate((who) => window.mount(who), { role: "owner", org_role: "owner" });
  await run.page.fill('input[placeholder^="Поиск по имени"]', "Ив");
  await run.page.click('button:has-text("Иванов Иван")');
  await run.page.waitForSelector('[data-testid="transfer-preview"][data-state="loading"]');
  assert.equal(await run.page.isDisabled('button:has-text("Перевести (1)")'), true, "the answer is not here: the button waits");
  hold.open();
  await run.page.waitForSelector('[data-testid="transfer-preview-retry"]');
  assert.equal(await run.page.isDisabled('button:has-text("Перевести (1)")'), true, "a failure holds it too");
  await run.page.click('[data-testid="transfer-preview-retry"]');
  await run.page.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]');
  assert.match(await run.page.textContent('[data-testid="transfer-none"], [data-testid="transfer-carried-none"]'), /Деньги не изменятся: в прошлой группе у ученика нет оплат и долга/);
  assert.equal(await run.page.isDisabled('button:has-text("Перевести (1)")'), false);
  await run.page.close();
});

test("R3 item 6: «Перевести» of the card of a student (the window «Перевести в другую группу») waits for «что переедет» too; the transfer goes with mode=transfer", async () => {
  const hold = require("./helpers/dom-answers.cjs").deferred();
  const run = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.method === "GET" && request.path === "/auth/org/groups") return { json: [{ id: "g1", name: "7-А Алгебра", class_level: 7, status: "active", teacher_id: "t1", teacher_name: "Каримова К." }, { id: "g2", name: "7-Б Геометрия", class_level: 7, status: "active", teacher_id: "t1", teacher_name: "Каримова К." }] };
    if (request.method === "GET" && request.path === "/auth/org/members") return { json: [{ id: "t1", user_id: "t1", org_role: "teacher", first_name: "Каримова", last_name: "К." }] };
    if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/st1") {
      if (/dry_run=true/.test(request.query)) return hold.promise.then(() => ({ json: { student_id: "st1", group_id: "g2", status: "added", dry_run: true, carried: [{ code: "PAYMENT_CARRIED", message: "Оплата перенесётся" }], money_effects: { students: [], payroll: [], text: "", dryRun: true } } }));
      return { json: { student_id: "st1", group_id: "g2", status: "added", warnings: [] } };
    }
    return null;
  });
  await run.page.evaluate(() => window.mount("assign"));
  await run.page.click('text=7-Б Геометрия');
  await run.page.waitForSelector('[data-testid="transfer-preview"][data-state="loading"]');
  const confirm = run.page.getByRole("button", { name: /Перевести/ }).last();
  assert.equal(await confirm.isDisabled(), true, "the answer is not here: the button waits");
  await run.page.evaluate(() => { const form = [...document.querySelectorAll("button")].find((button) => /Перевести/.test(button.textContent) && !button.disabled); return form; });
  hold.open();
  await run.page.waitForSelector('[data-testid="transfer-carried"]');
  assert.equal(await confirm.isDisabled(), false);
  await confirm.click();
  await run.page.waitForFunction(() => document.body.textContent.includes("Перевод подтверждён"));
  const sent = run.calls.filter((call) => call.method === "POST" && call.path === "/auth/org/groups/g2/students/st1");
  assert.deepEqual(sent.map((call) => /dry_run=true/.test(call.query)), [true, false]);
  assert.match(sent[1].query, /mode=transfer/);
  await run.page.close();
});
