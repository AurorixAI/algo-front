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
const bulkCalls = (calls) => calls.filter((call) => call.method === "POST" && call.path === "/auth/org/groups/g2/students/bulk" && !/dry_run=true/.test(call.query));

test("M2: an administrator WITHOUT the money right - no switch «Перевести / Добавить», the line about the second group is shown, the request is mode=add", async () => {
  const { page, calls, errors } = await pickStudent({ role: "admin", org_role: "admin", payments_access: false });
  await page.waitForSelector('[data-testid="enrol-second-group"]');
  const note = await page.textContent('[data-testid="enrol-second-group"]');
  assert.equal(note.replace(/\s+/g, " ").trim(), "Иванов Иван уже в группе 7-А Алгебра. «Добавить» запишет его во вторую группу — оплата будет в обеих. Перевести с переносом оплат может владелец или администратор с правом на деньги");
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
    await page.click('button:has-text("Зачислить (1)")');
    await page.waitForTimeout(300);
    const sent = bulkCalls(calls);
    assert.equal(sent.length, 1, JSON.stringify(user));
    assert.match(sent[0].query, /(^|&)mode=transfer($|&)/);
    await page.close();
  }
});
