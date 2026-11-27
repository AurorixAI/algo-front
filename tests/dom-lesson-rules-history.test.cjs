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
    assert.equal(await rows.count(), 14, "7 records of requests (a returned lesson is ONE of them) + 7 entries of the journal: ONE list");
    assert.equal(await page.locator('[data-testid="audit-row"]').count(), 7);
    const text = plain(await page.textContent("section"));
    for (const chip of ["Отменён: по вине центра", "Отменён: праздник", "Урок возвращён", "Разовый урок", "Отметки исправлены", "Добавил урок в расписание", "Задним числом · 2 дн.", "Задним числом · 6 дн.", "Задним числом · 12 дн.", "Задним числом · 14 дн.", "Задним числом · 24 дн."]) assert.ok(text.includes(chip), chip);
    assert.ok(!text.includes("без запроса"), "no chip «без запроса»");
    // С11.17: the lessons 02.11, 09.11 and 25.11 were returned - ONE row each (the return), the cancellation «урок был» is not a second row
    const returned = page.locator('[data-testid="substitution-row"]').filter({ hasText: "Урок возвращён" });
    assert.equal(await returned.count(), 3, "one row per returned lesson");
    for (const date of ["02.11", "09.11", "25.11"]) assert.equal(await page.locator('[data-testid="substitution-row"]').filter({ hasText: new RegExp(`, ${date.replace(".", "\\.")} ·`) }).filter({ hasText: "Урок возвращён" }).count(), 1, `${date}: one return row`);
    assert.equal(await page.locator('[data-testid="substitution-row"]').filter({ hasText: /Урок был/ }).count(), 0, "the old second row «Урок был» is gone");
    assert.ok(!text.includes("Включён в зарплату"), "the cancellation of 02.11 «включён в зарплату» is not a second row of the returned lesson (the words stay in the block of the teacher)");
    // all the rows were written at one moment: their order is the server's tie-break (it follows the ids), so every row is checked, none by its place
    for (const text of await rows.allTextContents()) assert.match(plain(text), /(пн|вт|ср|чт|пт|сб|вс), \d\d\.\d\d · \d\d:\d\d–\d\d:\d\d/, "the time of the lesson is in every record and in every entry of the journal");
    assert.match(plain(await page.locator('[data-testid="substitution-row"]').filter({ hasText: /, 11\.11 ·/ }).first().textContent()), /ср, 11\.11 · 10:00–11:30/);
    assert.match(plain(await page.locator('[data-testid="audit-row"]').filter({ hasText: /, 03\.11 ·/ }).first().textContent()), /вт, 03\.11 · 14:00–15:30/, "and in every entry of the journal");
    assert.match(plain(await page.locator('[data-testid="reason-words"]').first().textContent()), /Отключили свет/);
    assert.match(plain(await page.locator('[data-testid="audit-row"][data-kind="corrected"]').textContent()), /Ошибся/);
    assert.equal(await page.locator('[data-testid="audit-by"]').count(), 3, "the owner wrote three entries over the lessons of the teacher: said under the teacher");
    for (const text of await page.locator('[data-testid="audit-by"]').allTextContents()) assert.match(plain(text), /оформление: Валиев Р\./);
    assert.equal(await page.locator('[data-testid="audit-row"][data-kind="backdated"] [data-testid="audit-by"]').count(), 2, "the teacher closed his own lessons: nobody else is named");
    assert.equal(await page.locator('[data-testid="backdated-only"]').count(), 1);
    assert.equal(await page.locator('text="Только срочные"').count(), 0);
    const probe = await page.evaluate(layoutProbe, "body");
    assert.deepEqual([probe.bad, probe.scroll > 0], [[], false]);
    if (width === 375) assert.deepEqual(await page.evaluate(touchTargets, "section"), []);
    assert.deepEqual(noise(errors), []);
    await page.close();
  });
}

test("an evening lesson started in time and closed after midnight (the real answer history_evening_not_late): the server writes no «задним числом» entry, so the page shows none - the history of the day is empty, not a line that blames the teacher", async () => {
  const empty = answer("history_evening_not_late");
  assert.equal(empty.items.length, 0, "the real answer: no entry at all for that lesson");
  const run = await openHistory(listServer({ decided: empty }));
  const { page } = run;
  await page.waitForSelector('text="Здесь появятся события за последние 30 дней."');
  assert.equal(await page.locator('[data-testid="audit-row"]').count(), 0);
  assert.ok(!/Задним числом/.test(plain(await page.textContent("section"))), "no chip «Задним числом»");
  await page.close();
});

test("an administrator WITH the money right wrote «оформлен задним числом» over the lesson of the teacher (the real answer history_admin_with_right): the line says who in the words of the server, next to the owner's one", async () => {
  const real = answer("history_admin_with_right");
  const run = await openHistory(listServer({ decided: real }));
  const { page } = run;
  await page.waitForSelector('[data-testid="audit-row"]');
  const row = page.locator('[data-testid="audit-row"]', { hasText: "Задним числом · 21 дн." });
  assert.equal(await row.count(), 1);
  assert.match(plain(await row.textContent()), /оформление: Каримова Д\./);
  assert.match(plain(await row.textContent()), /чт, 05\.11/);
  assert.equal(await page.locator('[data-testid="audit-by"]').count(), 4, "owner x3 and the administrator x1 wrote over the lessons of the teacher");
  await page.close();
});

test("the tick «Только задним числом» asks the same list with backdated_only=true and shows only what looks back (the real answer history_backdated_only)", async () => {
  const run = await openHistory(listServer({ extra: (r) => (isHistory(r) && /backdated_only=true/.test(r.query) ? { json: answer("history_backdated_only") } : null) }));
  const { page, calls } = run;
  await page.waitForSelector('[data-testid="audit-row"]');
  await page.click('[data-testid="backdated-only"] input[type="checkbox"], [data-testid="backdated-only"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="substitution-row"]').length === 0);
  assert.equal(await page.locator('[data-testid="audit-row"]').count(), 6);
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
  const run = await openHistory(listServer({ extra: (r) => (r.method === "POST" && /\/attendance\/return/.test(r.path) ? { json: answer("dry_run_return_payroll") } : null) }));
  const { page, calls } = run;
  await page.waitForSelector('[data-testid="audit-row"][data-kind="backdated"]');
  // the entry of the lesson of 02.11 (24 days late: the owner formalised it); the order of the rows is the server's tie-break, so it is found by its lesson
  await page.locator('[data-testid="audit-row"][data-kind="backdated"]').filter({ hasText: /, 02\.11 ·/ }).locator('[data-testid="audit-details"]').click();
  await page.waitForSelector('[data-testid="panel-salary"]');
  const panel = plain(await page.textContent('[data-testid="audit-panel"]'));
  assert.match(panel, /Математика 7/);
  assert.match(panel, /пн, 02\.11 · 10:00–11:30/, "the panel names the time of the lesson, as the row does");
  assert.match(panel, /Сейчас:\s*Задним числом · 24 дн\./);
  assert.match(panel, /Преподаватель\s*Эргашев К\./);
  assert.match(panel, /В зарплате за ноябрь: \+168 750 сум/);
  assert.match(panel, /Урок оформлен задним числом/);
  assert.match(plain(await page.textContent('[data-testid="timeline-author"]')), /Валиев Р\., владелец/);
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

// ── Э6: «Решения по дополнительным урокам» under «История» ─────────────────────────────────────────────────────────────
// The real answer of `GET /org/one-off-decisions/decided` (one «Не оплачивать» and one «Оплатить»).
const DECIDED_ONE_OFFS = answer("one_off_decided").items;
const decidedRoute = (items) => (request) => (request.path === "/auth/org/one-off-decisions/decided" ? { json: { total: items.length, items } } : null);

for (const width of [1280, 375]) {
  test(`${width}: no decided additional lessons - the block is not on the page; some - ONE folded line «Решения по дополнительным урокам · N» (as «Решает владелец»), the month is switched inside`, async () => {
    const none = await openHistory(listServer(), { width });
    await none.page.waitForSelector('[data-testid="audit-row"]');
    await none.page.waitForTimeout(150);
    assert.equal(await none.page.locator('[data-testid="decided-one-offs"]').count(), 0, "nothing decided: nothing shown");
    await none.page.close();

    const some = await openHistory(listServer({ extra: decidedRoute(DECIDED_ONE_OFFS) }), { width });
    await some.page.waitForSelector('[data-testid="decided-toggle"]');
    assert.equal(plain(await some.page.textContent('[data-testid="decided-title"]')), "Решения по дополнительным урокам · 2");
    assert.equal(await some.page.getAttribute('[data-testid="decided-toggle"]', "aria-expanded"), "false");
    assert.equal(await some.page.locator('[data-testid="decided-row"]').count(), 0, "folded: no rows");
    assert.equal(await some.page.locator('[data-testid="decided-prev"]').count(), 0, "folded: no month switch");
    await some.page.click('[data-testid="decided-toggle"]');
    await some.page.waitForSelector('[data-testid="decided-row"]');
    assert.equal(await some.page.locator('[data-testid="decided-hint"]').count(), 1, "the explanation is a «?»");
    assert.equal(plain(await some.page.textContent('[data-testid="decided-month"]')), "Ноябрь 2026 г.");
    assert.equal(await some.page.getAttribute('[data-testid="decided-prev"]', "aria-label"), "Предыдущий месяц");
    assert.equal(await some.page.getAttribute('[data-testid="decided-next"]', "aria-label"), "Следующий месяц");
    assert.equal(await some.page.isDisabled('[data-testid="decided-next"]'), true, "the month of today is the last");
    for (const id of ["decided-prev", "decided-next"]) {
      const icon = await some.page.locator(`[data-testid="${id}"] svg`).evaluate((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      assert.deepEqual(icon, [16, 16], `${id}: the arrow is drawn (it was squeezed to nothing by the padding of the button)`);
    }
    await some.page.click('[data-testid="decided-prev"]');
    await some.page.waitForFunction(() => /Октябрь 2026 г\./.test(document.querySelector('[data-testid="decided-month"]')?.textContent ?? ""));
    assert.equal(await some.page.locator('[data-testid="decided-one-offs"]').count(), 1, "a month browsed inside the block keeps it");
    const probe = await some.page.evaluate(layoutProbe, "body");
    assert.deepEqual([probe.bad, probe.scroll > 0], [[], false]);
    if (width === 375) assert.deepEqual(await some.page.evaluate(touchTargets, '[data-testid="decided-one-offs"]'), []);
    await some.page.close();
  });
}
