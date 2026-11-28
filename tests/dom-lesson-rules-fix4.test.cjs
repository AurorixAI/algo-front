// LESSON-RULES FIX4 (Б4, Б5): the history of the owner turns its pages without losing the list when one page fails; the panel «Подробнее» of an entry without the date of the lesson
// does not fall and does not ask for the return.  The answers are the server's own (history.json); 1280 and 375.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, OWNER } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { deferred } = require("./helpers/dom-answers.cjs");
const { answer, listServer, WORLD_DAY, plain } = require("./helpers/lesson-rules-answers.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");

const ctx = setup(test);
const noise = (errors) => errors.filter((text) => !/404|Failed to load resource|409|422|500/.test(text));
const isHistory = (request) => request.path === "/auth/org/substitutions" && /status=decided/.test(request.query);
const offsetOf = (request) => Number((/offset=(\d+)/.exec(request.query) || [0, 0])[1]);

async function openHistory(server, { user = OWNER, width = 1280 } = {}) {
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", server, { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
  await run.page.evaluate(([who]) => window.mount("substitutions", who, { role: "owner" }), [user]);
  await run.page.click('[role="tab"]:has-text("История")');
  return run;
}

const secondPageFails = (state) => listServer({
  decided: { ...answer("history"), total: 120 },
  extra: (request) => {
    if (!isHistory(request) || offsetOf(request) !== 50) return null;
    state.asked += 1;
    return state.fail ? { status: 500, json: { detail: { code: "SERVER", message: "boom" } } } : { json: { ...answer("history"), total: 120 } };
  },
});

for (const width of [1280, 375]) {
  test(`${width}: a failed turn of the page keeps the page on screen, says it at the pager and «Повторить» opens the page`, async () => {
    const state = { fail: true, asked: 0 };
    const { page, errors } = await openHistory(secondPageFails(state), { width });
    await page.waitForSelector('[data-testid="audit-row"]');
    const before = plain(await page.textContent("section"));
    assert.match(plain(await page.textContent("body")), /1 из 3/);
    await page.click('button[aria-label="Следующая страница"]');
    await page.waitForSelector('[data-testid="page-error"]');
    assert.equal(state.asked, 1);
    assert.equal(plain(await page.textContent("section")), before, "the list of the page that is shown is not touched");
    assert.equal(await page.locator('[data-testid="audit-row"]').count() > 0, true);
    assert.match(plain(await page.textContent("body")), /1 из 3/, "the pager says the page that is on screen");
    assert.match(plain(await page.textContent('[data-testid="page-error"]')), /Не удалось открыть страницу 2\. Показана страница 1\./);
    assert.equal(await page.locator('[data-testid="load-error"], [role="alert"]:has-text("Не удалось загрузить")').count(), 0, "no error panel in place of the list");
    // the same state is not read a second time by itself
    await page.waitForTimeout(300);
    assert.equal(state.asked, 1);
    state.fail = false;
    await page.click('[data-testid="page-retry"]');
    await page.waitForSelector('[data-testid="page-error"]', { state: "detached" });
    assert.match(plain(await page.textContent("body")), /2 из 3/);
    assert.equal(await page.locator('[data-testid="page-error"]').count(), 0);
    assert.equal(state.asked, 2);
    assert.equal(await page.locator('[data-testid="audit-row"]').count() > 0, true);
    assert.deepEqual(noise(errors), []);
    await page.close();
  });
}

test("a failed turn and then the other arrow: the error goes away with the new reading", async () => {
  const state = { fail: true, asked: 0 };
  const { page } = await openHistory(secondPageFails(state));
  await page.waitForSelector('[data-testid="audit-row"]');
  await page.click('button[aria-label="Следующая страница"]');
  await page.waitForSelector('[data-testid="page-error"]');
  state.fail = false;
  await page.click('button[aria-label="Следующая страница"]');
  await page.waitForSelector('[data-testid="page-error"]', { state: "detached" });
  assert.match(plain(await page.textContent("body")), /2 из 3/);
  assert.equal(await page.locator('[data-testid="page-error"]').count(), 0);
  await page.close();
});

for (const width of [1280, 375]) {
  test(`${width}: an entry without the date of the lesson - the panel stands, no «Вернуть урок», no request of the return`, async () => {
    const history = answer("history_admin_with_right");
    const entry = history.items.find((item) => item.kind === "backdated" && item.canReturn === true);
    assert.ok(entry, "the answer has a held lesson that can be returned");
    entry.lesson = { ...entry.lesson, date: null };
    const { page, calls, errors } = await openHistory(listServer({ decided: history }), { width });
    await page.waitForSelector('[data-testid="audit-row"][data-kind="backdated"]');
    await page.locator('[data-testid="audit-row"][data-kind="backdated"]').first().locator('[data-testid="audit-details"]').click();
    await page.waitForSelector('[data-testid="audit-panel"]');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-testid="audit-return"]').count(), 0);
    assert.equal(await page.locator('[data-testid="panel-return-error"]').count(), 0, "not an error: the return is just not offered");
    assert.equal(calls.filter((c) => /\/attendance\/return/.test(c.path)).length, 0, "no request with an empty date");
    assert.deepEqual(noise(errors), []);
    await page.close();
  });
}

// FIX4-B2: the words of the person are not changed; a long reason wraps in the window and is cut after two lines in the list
const LONG = "М23 — Эргашев К. сообщил, что в здании отключили свет и воду с самого утра, занятия отменила администрация школы, ученики не приходили, ждали до одиннадцати часов и ушли домой, подробности у завуча.";
for (const width of [1280, 375]) {
  test(`${width}: a reason of ${LONG.length} signs: «М23» keeps its capital, two lines in the list, the whole text in the window of the decision`, async () => {
    const pending = answer("pending_owner");
    const waiting = pending.items.find((item) => item.reason);
    assert.ok(waiting, "the answer has a cancellation that waits");
    waiting.reason = LONG;
    const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", listServer({ pending }), { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
    const { page, errors } = run;
    await page.evaluate(([who]) => window.mount("substitutions", who, { role: "owner" }), [OWNER]);
    await page.waitForSelector('[data-testid="waiting-reason"]');
    const cell = page.locator('[data-testid="waiting-reason"]').first();
    assert.match(plain(await cell.textContent()), /^Урока не было: М23 — Эргашев К\./, "no letter is made small");
    const lines = await cell.evaluate((el) => { const span = el.querySelector("span"); const style = getComputedStyle(span); return Math.round(span.getBoundingClientRect().height / parseFloat(style.lineHeight)); });
    assert.ok(lines <= 2, `at most two lines in the list, got ${lines}`);
    assert.equal(await cell.getAttribute("title"), `Урока не было: ${LONG}`, "the whole text stays in the tooltip");
    await page.locator('button[aria-label^="Решить отмену"]').first().click();
    await page.waitForSelector('[data-testid="waiting-head"]');
    assert.ok(plain(await page.textContent('[data-testid="waiting-head"]')).includes(LONG), "the window shows the reason whole");
    const probe = await page.evaluate(layoutProbe, "body");
    assert.deepEqual([probe.bad, probe.scroll > 0], [[], false]);
    assert.deepEqual(noise(errors), []);
    await page.close();
  });
}

test("FIX4: while another page is read the counter names the page that is on screen; after the success the new one; after a failure the old one", async () => {
  const hold = deferred();
  let fail = false;
  const server = listServer({
    decided: { ...answer("history"), total: 120 },
    extra: (request) => (isHistory(request) && offsetOf(request) === 50 ? hold.promise.then(() => (fail ? { status: 500, json: { detail: { code: "SERVER", message: "boom" } } } : { json: { ...answer("history"), total: 120 } })) : null),
  });
  const { page, calls } = await openHistory(server);
  await page.waitForSelector('[data-testid="audit-row"]');
  const counter = async () => plain(await page.textContent('[data-testid="page-counter"]'));
  assert.equal(await counter(), "1 из 3");
  await page.click('button[aria-label="Следующая страница"]');
  await page.waitForTimeout(200);
  assert.equal(await counter(), "1 из 3", "reading: the list on screen is page 1");
  hold.open();
  await page.waitForFunction(() => document.querySelector('[data-testid="page-counter"]').textContent.replace(/[\s\u00a0]+/g, " ").trim() === "2 из 3");
  await page.close();
  const hold2 = deferred();
  fail = true;
  const second = listServer({
    decided: { ...answer("history"), total: 120 },
    extra: (request) => (isHistory(request) && offsetOf(request) === 50 ? hold2.promise.then(() => ({ status: 500, json: { detail: { code: "SERVER", message: "boom" } } })) : null),
  });
  const run = await openHistory(second);
  await run.page.waitForSelector('[data-testid="audit-row"]');
  await run.page.click('button[aria-label="Следующая страница"]');
  await run.page.waitForTimeout(200);
  assert.equal(plain(await run.page.textContent('[data-testid="page-counter"]')), "1 из 3");
  hold2.open();
  await run.page.waitForSelector('[data-testid="page-error"]');
  assert.equal(plain(await run.page.textContent('[data-testid="page-counter"]')), "1 из 3", "failure: the old page");
  await run.page.close();
});
