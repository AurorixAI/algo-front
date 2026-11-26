// LESSON-RULES Э3: «Замены → История» on the server's own answers (history.json, history_backdated_only.json): the new outcomes as one chip, the entries of the journal, the tick «Только задним числом»,
// no chip «без запроса», the words of the teacher, the panel «Подробнее» with the salary line (the money right only), the states of loading / error / empty; 1280 / 1024 / 375.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, OWNER, ADMIN } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { deferred } = require("./helpers/dom-answers.cjs");
const { layoutProbe, touchTargets } = require("./helpers/layout-probe.cjs");
const { answer, listServer, WORLD_DAY, plain } = require("./helpers/lesson-rules-answers.cjs");

const ctx = setup(test);
const noise = (errors) => errors.filter((text) => !/404|Failed to load resource|409|422|500/.test(text));
const isHistory = (request) => request.path === "/auth/org/substitutions" && /status=decided/.test(request.query);

async function openHistory(server, { user = OWNER, width = 1280 } = {}) {
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", server, { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
  await run.page.evaluate(([who]) => window.mount("substitutions", who, { role: who.org_role === "admin" ? "admin" : "owner" }), [user]);
  await run.page.click('[role="tab"]:has-text("История")');
  return run;
}

for (const width of [1280, 1024, 375]) {
  test(`${width}: the history of the real answer - one chip per row, the words of the teacher, the entries of the journal, nobody asked is not said`, async () => {
    const { page, errors } = await openHistory(listServer(), { width });
    await page.waitForSelector('[data-testid="audit-row"]');
    const tabs = plain(await page.textContent('[role="tablist"]'));
    assert.match(tabs, /Ждут решения \(\d+\)/);
    assert.match(tabs, /История/);
    assert.ok(!tabs.includes("Решённые"), "the tab is called «История»");
    const rows = page.locator('[data-testid="substitution-row"], [data-testid="audit-row"]');
    assert.equal(await rows.count(), 3, "the record of the cancellation + the two entries of the journal: ONE list");
    const text = plain(await page.textContent("section"));
    assert.match(text, /Отменён: по вине центра/);
    assert.match(text, /Задним числом · 1 дн\./);
    assert.match(text, /Отметки исправлены/);
    assert.ok(!text.includes("без запроса"), "no chip «без запроса»");
    assert.match(plain(await page.textContent('[data-testid="reason-words"]')), /Урока не было/);
    assert.match(plain(await page.locator('[data-testid="audit-row"][data-kind="corrected"]').textContent()), /Ошибся/);
    assert.match(plain(await page.locator('[data-testid="audit-by"]').textContent()), /оформление: Усманов У\./, "written by another person than the teacher of the lesson: said under the teacher");
    assert.equal(await page.locator('[data-testid="audit-row"][data-kind="backdated"] [data-testid="audit-by"]').count(), 0, "the teacher closed his own lesson: nobody else is named");
    assert.equal(await page.locator('[data-testid="backdated-only"]').count(), 1);
    assert.equal(await page.locator('text="Только срочные"').count(), 0);
    const probe = await page.evaluate(layoutProbe, "body");
    assert.deepEqual([probe.bad, probe.scroll > 0], [[], false]);
    if (width === 375) assert.deepEqual(await page.evaluate(touchTargets, "section"), []);
    assert.deepEqual(noise(errors), []);
    await page.close();
  });
}

test("the tick «Только задним числом» asks the same list with backdated_only=true and shows only what looks back (the real answer history_backdated_only)", async () => {
  const run = await openHistory(listServer({ extra: (r) => (isHistory(r) && /backdated_only=true/.test(r.query) ? { json: answer("history_backdated_only") } : null) }));
  const { page, calls } = run;
  await page.waitForSelector('[data-testid="audit-row"]');
  await page.click('[data-testid="backdated-only"] input[type="checkbox"], [data-testid="backdated-only"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="substitution-row"]').length === 0);
  assert.equal(await page.locator('[data-testid="audit-row"]').count(), 2);
  assert.ok(calls.some((c) => isHistory(c) && /backdated_only=true/.test(c.query)), "the server filters the same list");
  assert.ok(!calls.some((c) => isHistory(c) && /backdatedOnly/.test(c.query)), "the parameter is the server's own name");
  await page.close();
});

test("the filter that finds nothing: «За 30 дней уроки задним числом не оформлялись» (the envelope of the real answer, no rows)", async () => {
  const empty = { ...answer("history_backdated_only"), items: [], total: 0 };
  const run = await openHistory(listServer({ extra: (r) => (isHistory(r) && /backdated_only=true/.test(r.query) ? { json: empty } : null) }));
  const { page } = run;
  await page.waitForSelector('[data-testid="audit-row"]');
  await page.click('[data-testid="backdated-only"]');
  await page.waitForSelector('text="За 30 дней уроки задним числом не оформлялись"');
  assert.equal(await page.locator('[data-testid="audit-row"]').count(), 0);
  await page.close();
});

test("loading shows «Загрузка…», a failed read shows «Не удалось загрузить историю» with «Повторить» (the second read succeeds)", async () => {
  const hold = deferred();
  let fail = true;
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", (request) => {
    if (isHistory(request)) return hold.promise.then(() => (fail ? { status: 500, json: { detail: { code: "SERVER", message: "boom" } } } : { json: answer("history") }));
    return listServer()(request);
  }, { today: WORLD_DAY });
  await run.page.evaluate(() => window.mount("substitutions", { role: "owner", org_role: "owner" }, { role: "owner" }));
  await run.page.click('[role="tab"]:has-text("История")');
  await run.page.waitForSelector('text="Загрузка…"');
  hold.open();
  await run.page.waitForSelector('[data-testid="list-error"]');
  assert.equal(plain(await run.page.textContent('[data-testid="list-error"]')).startsWith("Не удалось загрузить историю"), true);
  fail = false;
  await run.page.click('[data-testid="list-error"] button:has-text("Повторить")');
  await run.page.waitForSelector('[data-testid="audit-row"]');
  await run.page.close();
});

test("the panel of an entry: group, lesson, «Сейчас», the teacher, one line of the history (when, what, who); the owner sees the salary line from the dry run and «Вернуть урок»", async () => {
  const effects = { students: [], payroll: [{ month: "2026-11", state: "open", sheetId: "sh1", teacherId: "t1", teacherName: "Иванов И.", savedTotal: 0, paid: 0, freshBefore: 75000, freshAfter: 50000, freshTotal: 50000, changedBy: -25000, driftAfter: 0 }], text: "", dryRun: true };
  const run = await openHistory(listServer({ extra: (r) => (r.method === "POST" && /\/attendance\/return/.test(r.path) ? { json: { ok: true, changed: false, dryRun: true, version: 4, status: "completed", moneyEffects: effects } } : null) }));
  const { page, calls } = run;
  await page.waitForSelector('[data-testid="audit-row"][data-kind="backdated"]');
  await page.click('[data-testid="audit-row"][data-kind="backdated"] [data-testid="audit-details"]');
  await page.waitForSelector('[data-testid="panel-salary"]');
  const panel = plain(await page.textContent('[data-testid="audit-panel"]'));
  assert.match(panel, /Г/);
  assert.match(panel, /ср, 25\.11/);
  assert.match(panel, /Сейчас:\s*Задним числом · 1 дн\./);
  assert.match(panel, /Преподаватель\s*Иванов И\./);
  assert.match(panel, /В зарплате за ноябрь: \+25 000 сум/);
  assert.match(panel, /Урок оформлен задним числом/);
  assert.match(plain(await page.textContent('[data-testid="timeline-author"]')), /Иванов И\., преподаватель/);
  assert.equal(await page.locator('[data-testid="audit-return"]').count(), 1);
  assert.equal(calls.filter((c) => /\/attendance\/return/.test(c.path)).length, 1);
  assert.equal(JSON.parse(JSON.stringify(calls.find((c) => /\/attendance\/return/.test(c.path)).body)).dryRun, true, "only the dry run: nothing is returned by opening the panel");
  await page.close();
});

test("an administrator WITHOUT the money right: the same panel without the salary line and without «Вернуть урок», and no request for the return is made", async () => {
  const run = await openHistory(listServer(), { user: { ...ADMIN, payments_access: false } });
  const { page, calls } = run;
  await page.waitForSelector('[data-testid="audit-row"][data-kind="backdated"]');
  await page.click('[data-testid="audit-row"][data-kind="backdated"] [data-testid="audit-details"]');
  await page.waitForSelector('[data-testid="audit-panel"]');
  assert.equal(await page.locator('[data-testid="panel-salary"]').count(), 0);
  assert.equal(await page.locator('[data-testid="audit-return"]').count(), 0);
  assert.equal(await page.locator('[data-testid="panel-open-lesson"]').count(), 1);
  assert.equal(calls.filter((c) => /\/attendance\/return/.test(c.path)).length, 0);
  await page.close();
});
