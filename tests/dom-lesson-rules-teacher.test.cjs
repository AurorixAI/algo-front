// LESSON-RULES Э4: the teacher's main page - the block «Запросы и изменения уроков» on the server's own answer (mine_teacher.json): «Отмена ждёт подтверждения» with «Отозвать», «Отменён: по вине центра»;
// the card «Ближайшее действие» says «Не закрыт N дн.» from the `ageDays` of the server; 375 and 1280.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe, touchTargets } = require("./helpers/layout-probe.cjs");
const { answer, WORLD_DAY, plain } = require("./helpers/lesson-rules-answers.cjs");

const ctx = setup(test);
const TEACHER = { role: "teacher", org_role: "teacher" };
const WITHDRAW = /\/lessons\/withdraw-cancellation$/;
const noise = (errors) => errors.filter((text) => !/404|Failed to load resource|409|422|500/.test(text));
const mineOf = (mine) => (request) => (request.path === "/auth/org/substitutions/mine" ? { json: mine } : null);

async function openBlock(server, width = 375) {
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", server, { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
  await run.page.evaluate(([who]) => window.mount("teacher-block", who, {}), [TEACHER]);
  await run.page.waitForSelector('[data-testid="my-request-row"]');
  return run;
}

for (const width of [375, 1280]) {
  test(`${width}: one list «Запросы и изменения уроков» - the waiting cancellation first, with «Отозвать» named by the lesson; the decided one «Отменён: по вине центра»`, async () => {
    const { page, errors } = await openBlock(mineOf(answer("mine_teacher")), width);
    assert.match(plain(await page.textContent("section h2")), /Запросы и изменения уроков/);
    const rows = page.locator('[data-testid="my-request-row"]');
    assert.equal(await rows.count(), 2);
    const first = plain(await rows.nth(0).textContent());
    assert.match(first, /пн, 23\.11 · Г/);
    assert.match(first, /Отмена ждёт подтверждения/);
    assert.match(first, /Отозвать/);
    const second = plain(await rows.nth(1).textContent());
    assert.match(second, /ср, 18\.11 · Г/);
    assert.match(second, /Отменён: по вине центра/);
    assert.ok(!second.includes("Отозвать"), "decided: nothing to take back");
    assert.equal(await page.locator('button[aria-label="Отозвать отмену: пн, 23.11 · Г"]').count(), 1);
    assert.equal(await page.locator("text=Новый запрос").count(), 1);
    const probe = await page.evaluate(layoutProbe, "body");
    assert.deepEqual([probe.bad, probe.scroll > 0], [[], false]);
    if (width === 375) assert.deepEqual(await page.evaluate(touchTargets, "body"), []);
    assert.deepEqual(noise(errors), []);
    await page.close();
  });
}

test("«Отозвать»: POST withdraw-cancellation with expectedKind unconfirmed for THIS lesson, then the block reads again", async () => {
  const mine = answer("mine_teacher");
  let reads = 0;
  const run = await openBlock((request) => {
    if (request.path === "/auth/org/substitutions/mine") { reads += 1; return { json: reads > 1 ? { ...mine, items: mine.items.slice(1) } : mine }; }
    if (request.method === "POST" && WITHDRAW.test(request.path)) return { json: { ok: true, restored: true, lessonId: "lesson-mon", lessonDate: "2026-11-23", previousKind: "unconfirmed", returnedToReview: true } };
    return null;
  });
  const { page, calls } = run;
  await page.click('[data-testid="withdraw-cancellation"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="my-request-row"]').length === 1);
  const sent = calls.filter((c) => WITHDRAW.test(c.path));
  assert.deepEqual(sent.map((c) => [c.method, c.path.includes(mine.items[0].group.id), c.body]), [["POST", true, { lessonId: "lesson-mon", lessonDate: "2026-11-23", expectedKind: "unconfirmed" }]]);
  await page.close();
});

test("the owner decided before the withdrawal (409 ALREADY_DECIDED, the real refusal): the teacher reads the server's sentence and the block reads again - nothing is hidden", async () => {
  const mine = answer("mine_teacher");
  const refusal = answer("refusals").already_decided;
  const run = await openBlock((request) => {
    if (request.path === "/auth/org/substitutions/mine") return { json: mine };
    if (request.method === "POST" && WITHDRAW.test(request.path)) return { status: 409, json: refusal };
    return null;
  });
  const { page } = run;
  await page.click('[data-testid="withdraw-cancellation"]');
  await page.waitForSelector('[role="alert"]');
  assert.match(plain(await page.textContent('[role="alert"]')), /Отмену подтвердил Улугбек Усманов/);
  await page.close();
});

test("a lesson that was given back («Урок был»): the chip says whether he marks it (the window of the centre) - «отметьте посещаемость» with «Открыть урок», or «отметит администратор» without it", async () => {
  const mine = answer("mine_teacher");
  const base = mine.items[1];
  const returned = (id, teacherCanMark) => ({ ...base, id, outcome: "lesson_restored", teacherCanMark });
  const run = await openBlock(mineOf({ ...mine, items: [returned("r1", true), returned("r2", false)] }));
  const { page } = run;
  const rows = page.locator('[data-testid="my-request-row"]');
  assert.match(plain(await rows.nth(0).textContent()), /Урок был — отметьте посещаемость/);
  assert.equal(await rows.nth(0).locator('[data-testid="open-returned-lesson"]').count(), 1);
  assert.match(plain(await rows.nth(1).textContent()), /Урок был — отметит администратор/);
  assert.equal(await rows.nth(1).locator('[data-testid="open-returned-lesson"]').count(), 0, "older than the window: no action for the teacher");
  await page.close();
});

test("«Включён в зарплату» and «Отменён: праздник» are chips of the same list (the words of the outcome codes of the server)", async () => {
  const mine = answer("mine_teacher");
  const base = mine.items[1];
  const run = await openBlock(mineOf({ ...mine, items: [{ ...base, id: "a", outcome: "included_in_payroll" }, { ...base, id: "b", outcome: "cancelled_holiday" }] }));
  const text = plain(await run.page.textContent("section"));
  assert.match(text, /Включён в зарплату/);
  assert.match(text, /Отменён: праздник/);
  await run.page.close();
});

test("the card «Ближайшее действие» says «Не закрыт 2 дня» over the date from the ageDays of the server; today's lesson says nothing", async () => {
  const open = (age) => ({ kind: "action", action: { lesson: { id: "l", groupName: "Индивидуально: Азизов" }, tone: "rose", actionType: "in_progress", label: "Завершите урок", description: "вт, 24 нояб. · Индивидуально: Азизов", ageDays: age } });
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", () => null, { width: 375, height: 800, today: WORLD_DAY });
  await run.page.evaluate(([who, step]) => window.mount("next-card", who, { step }), [TEACHER, open(2)]);
  await run.page.waitForSelector('[data-testid="next-action-card"]');
  assert.equal(plain(await run.page.textContent('[data-testid="next-action-age"]')), "Не закрыт 2 дня");
  await run.page.close();
  const today = await openPage(ctx.browser, "lesson-rules.entry.tsx", () => null, { width: 375, height: 800, today: WORLD_DAY });
  await today.page.evaluate(([who, step]) => window.mount("next-card", who, { step }), [TEACHER, open(0)]);
  await today.page.waitForSelector('[data-testid="next-action-card"]');
  assert.equal(await today.page.locator('[data-testid="next-action-age"]').count(), 0);
  await today.page.close();
});
