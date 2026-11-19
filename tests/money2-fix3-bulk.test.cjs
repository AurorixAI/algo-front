// Money-2 fix 3 / п.1: a bulk TRANSFER names the source of each student (`sources`), the dry run too; a student with two groups is NOT guessed; the new refusals are shown in the words of the server.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");

const ctx = setup(test);
const mk = (id, last, first, extra) => ({ id, first_name: first, last_name: last, full_name: `${last} ${first}`, class_level: 7, status: "active", ...extra });
const STUDENTS = [
  mk("st1", "Иванов", "Иван", { group_id: "gA", groups_count: 1, current_group_id: "gA" }),
  mk("st2", "Каримов", "Фарход", { group_id: "gB", groups_count: 2, current_group_id: "gB" }),
  mk("st3", "Саидова", "Мадина", { group_id: "gC", groups_count: 1, current_group_id: "gC" }),
];
const GROUPS = [{ id: "g2", name: "Физика 9" }, { id: "gA", name: "Алгебра 7" }, { id: "gB", name: "Геометрия 7" }, { id: "gC", name: "Химия 8" }];
const REASONS = {
  st2: { code: "TRANSFER_SOURCE_REQUIRED", reason: "Ученик учится в нескольких группах — выберите, из какой переводить" },
  st3: { code: "TRANSFER_SOURCE_NOT_MEMBER", reason: "Ученик не состоит в группе «Химия 8»" },
  st1: { code: "CONCURRENT_EDIT", reason: "Другой пользователь сейчас меняет эти данные — повторите через секунду" },
};
function server(refuse) {
  return (request) => {
    if (request.method === "GET" && request.path === "/auth/org/groups") return { json: GROUPS };
    if (request.method === "GET" && request.path === "/auth/org/students") return { json: { items: STUDENTS, total: 3 } };
    if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/bulk") {
      if (/dry_run=true/.test(request.query)) return { json: { students: [] } };
      const results = STUDENTS.map((s) => (refuse.includes(s.id) ? { student_id: s.id, status: "skipped", ...REASONS[s.id] } : { student_id: s.id, status: "added", code: null, reason: null }));
      return { json: { group_id: "g2", added: results.filter((r) => r.status === "added").length, skipped: refuse.length, results, skipped_details: results.filter((r) => r.status === "skipped").map(({ student_id, reason, code }) => ({ student_id, reason, code })) } };
    }
    return null;
  };
}
async function run(refuse, ids) {
  const page = await openPage(ctx.browser, "enrol.entry.tsx", server(refuse), { width: 1280, height: 900 });
  await page.page.evaluate((who) => window.mount(who), { role: "owner", org_role: "owner" });
  for (const id of ids) { const s = STUDENTS.find((x) => x.id === id); await page.page.fill('input[placeholder^="Поиск по имени"]', s.last_name.slice(0, 3)); await page.page.click(`label:has-text("${s.full_name}")`); }
  return page;
}
const bulkCalls = (page) => page.calls.filter((c) => c.method === "POST" && c.path === "/auth/org/groups/g2/students/bulk");

test("fix3 п.1: the request of the transfer and its dry run carry `sources`; the student with two groups is not in it", async () => {
  const r = await run([], ["st1", "st2", "st3"]);
  await r.page.waitForFunction(() => document.querySelector('[data-testid="enrol-submit"]'));
  await r.page.waitForTimeout(600);
  const dry = bulkCalls(r).filter((c) => /dry_run=true/.test(c.query)).pop();
  assert.deepEqual(dry.body.sources, { st1: "gA", st3: "gC" });
  await r.page.click('[data-testid="enrol-submit"]');
  await r.page.waitForTimeout(500);
  const real = bulkCalls(r).filter((c) => !/dry_run=true/.test(c.query)).pop();
  assert.match(real.query, /mode=transfer/);
  assert.deepEqual(real.body.sources, { st1: "gA", st3: "gC" });
  assert.ok(!("st2" in real.body.sources));
  await r.page.close();
});

test("fix3 п.1: the refusals of the rows are shown in the words of the server; the two-groups row has one hint of the action", async () => {
  const r = await run(["st1", "st2", "st3"], ["st1", "st2", "st3"]);
  await r.page.click('[data-testid="enrol-submit"]');
  await r.page.waitForSelector('[data-testid="bulk-outcome"]');
  const shown = plain(await r.page.locator('[data-testid="bulk-outcome"]').evaluate((el) => el.innerText));
  for (const { reason } of Object.values(REASONS)) assert.ok(shown.includes(reason), reason);
  assert.equal(await r.page.locator('[data-testid="bulk-outcome-hint"]').count(), 1);
  assert.match(plain(await r.page.textContent('[data-testid="bulk-outcome-hint"]')), /переведите его отдельно/);
  await r.page.close();
});

test("fix5 п.5: ученик в двух группах - в списке «в 2 группах», под выбранным при «перевести» одна строка, кнопка не заблокирована (375)", async () => {
  const page = await openPage(ctx.browser, "enrol.entry.tsx", server([]), { width: 375, height: 800 });
  await page.page.evaluate((who) => window.mount(who), { role: "owner", org_role: "owner" });
  await page.page.fill('input[placeholder^="Поиск по имени"]', "Кар");
  await page.page.waitForSelector('label:has-text("Каримов Фарход")');
  const row = page.page.locator('label:has-text("Каримов Фарход")');
  assert.match(plain(await row.textContent()), /в 2 группах/);
  assert.doesNotMatch(plain(await row.textContent()), /в «/, "two groups: the count, not one of the names");
  assert.equal(await page.page.locator('[data-testid="student-many-groups-hint"]').count(), 0, "not before the choice");
  await row.click();
  const hint = plain(await page.page.textContent('[data-testid="student-many-groups-hint"]'));
  assert.equal(hint, "Каримов Фарход — учится в нескольких группах — переведите его отдельно", "the hint stands in the row of HIS choice, with his name");
  await page.page.waitForTimeout(500);
  assert.equal(await page.page.locator('[data-testid="enrol-submit"]').isDisabled(), false);
  assert.equal(await page.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  // a one-group student keeps the name of his group in the tag of his row
  await page.page.fill('input[placeholder^="Поиск по имени"]', "Ива");
  await page.page.waitForSelector('label:has-text("Иванов Иван")');
  assert.match(plain(await page.page.locator('label:has-text("Иванов Иван")').textContent()), /в «Алгебра 7»/);
  await page.page.close();
});
