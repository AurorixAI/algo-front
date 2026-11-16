// Money-2 wave 2, Э4 (Т10): a bulk enrolment answers per student (`results[]`): «Записано 3 из 4», the refused one with the reason of the SERVER; the window stays until «Готово», the page then
// gets the result (the toast carries the numbers only); nobody refused - the window closes at once as before.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, F } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");

const ctx = setup(test);
const NAMES = ["Иванов Иван", "Каримов Фарход", "Саидова Мадина", "Юсупов Бекзод"];
const STUDENTS = NAMES.map((full, index) => ({ id: `st${index + 1}`, first_name: full.split(" ")[1], last_name: full.split(" ")[0], full_name: full, class_level: 7, status: "active", group_id: null, current_group_id: null, groups_count: 0 }));
const REASON = "«Оплата с» не раньше 21.11.2026";

function server(skipped) {
  return (request) => {
    if (request.method === "GET" && request.path === "/auth/org/groups") return { json: [{ id: "g2", name: "Алгебра 7" }] };
    if (request.method === "GET" && request.path === "/auth/org/students") return { json: { items: STUDENTS, total: 4 } };
    if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/bulk") {
      const results = STUDENTS.map((student) => (skipped.includes(student.id) ? { student_id: student.id, status: "skipped", code: "PAY_FROM_RANGE", reason: REASON } : { student_id: student.id, status: "added", code: null, reason: null }));
      return { json: { group_id: "g2", added: 4 - skipped.length, skipped: skipped.length, results, skipped_details: results.filter((row) => row.status === "skipped").map(({ student_id, reason, code }) => ({ student_id, reason, code })), warnings: [] } };
    }
    return null;
  };
}
async function run(width, skipped, user = { role: "owner", org_role: "owner" }) {
  const page = await openPage(ctx.browser, "enrol.entry.tsx", server(skipped), { width, height: width === 375 ? 800 : 900 });
  await page.page.evaluate((who) => window.mount(who), user);
  for (const name of NAMES) { await page.page.fill('input[placeholder^="Поиск по имени"]', name.split(" ")[0].slice(0, 3)); await page.page.click(`button:has-text("${name}")`); }
  await page.page.click('[data-testid="enrol-submit"]');
  return page;
}
const log = (page) => page.evaluate(() => window.__log.map((item) => JSON.parse(item)));

test("Э4: «Записано 3 из 4», the refused student with the reason of the server; the added ones are folded; the window stays, the page is not told yet", async () => {
  const r = await run(1280, ["st2"]);
  await r.page.waitForSelector('[data-testid="bulk-outcome"]');
  assert.equal(plain(await r.page.textContent('[data-testid="bulk-outcome-headline"]')), "Записано 3 из 4");
  const items = await r.page.locator('[data-testid="bulk-outcome-skipped"] li').evaluateAll((list) => list.map((li) => li.innerText.replace(/\s+/g, " ").trim()));
  assert.deepEqual(items, [`Каримов Фарход ${REASON}`]);
  const shown = plain(await r.page.locator('[data-testid="bulk-outcome"]').evaluate((el) => el.innerText));
  assert.ok(!shown.includes("Иванов Иван"), "the added ones are under «Записаны»");
  await r.page.locator('[data-testid="bulk-outcome-added"] summary').click();
  assert.ok(plain(await r.page.locator('[data-testid="bulk-outcome"]').evaluate((el) => el.innerText)).includes("Иванов Иван"));
  assert.deepEqual(await log(r.page), [], "the page is told at «Готово»");
  await r.page.click('[data-testid="enrol-done"]');
  const told = await log(r.page);
  assert.equal(told.length, 1);
  assert.equal(told[0].added, 3);
  assert.equal(told[0].skipped, 1);
  assert.deepEqual(told[0].skippedLines, [], "the reasons are said in the window once; the toast has the numbers");
  await r.page.close();
});

test("Э4: nobody refused - the page is told at once, no result window", async () => {
  const r = await run(1280, []);
  await r.page.waitForFunction(() => window.__log.length === 1);
  assert.equal(await r.page.locator('[data-testid="bulk-outcome"]').count(), 0);
  assert.equal((await log(r.page))[0].added, 4);
  await r.page.close();
});

test("Э4: two refusals with different reasons; a role without the money right gets the same screen; 375 fits", async () => {
  const r = await run(375, ["st1", "st4"], { role: "admin", org_role: "admin", payments_access: false });
  await r.page.waitForSelector('[data-testid="bulk-outcome"]');
  assert.equal(plain(await r.page.textContent('[data-testid="bulk-outcome-headline"]')), "Записано 2 из 4");
  assert.equal(await r.page.locator('[data-testid="bulk-outcome-reason"]').count(), 2);
  const facts = await r.page.evaluate(layoutProbe, '[role="dialog"]');
  assert.equal(facts.scroll, 0);
  assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
  await r.page.close();
});
