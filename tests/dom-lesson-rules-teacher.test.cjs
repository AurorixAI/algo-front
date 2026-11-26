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

const mineReal = () => answer("mine_teacher");
const rowOf = (page, date) => page.locator('[data-testid="my-request-row"]', { hasText: date });

for (const width of [375, 1280]) {
  test(`${width}: one list «Запросы и изменения уроков» - ONE row per lesson (the system record of a return is hidden), «Отозвать» only where the server says canWithdraw, the outcomes in the words of the server (the real answer mine_teacher)`, async () => {
    const { page, errors } = await openBlock(mineOf(mineReal()), width);
    assert.match(plain(await page.textContent("section h2")), /Запросы и изменения уроков/);
    const rows = page.locator('[data-testid="my-request-row"]');
    assert.equal(await rows.count(), 8, "10 records of the answer minus the two system records of the returned lessons that have the cancellation «урок был»");
    const texts = (await rows.allTextContents()).map(plain);
    assert.match(texts[0], /ср, 18\.11 · Математика 7/);
    assert.match(texts[0], /Отмена ждёт подтверждения/);
    assert.ok(!texts[0].includes("Отозвать"), "canWithdraw is false (the lesson is older than the window): no button");
    assert.match(texts[1], /пн, 23\.11 · Математика 7/);
    assert.match(texts[1], /Отмена ждёт подтверждения/);
    assert.match(texts[1], /Отозвать/);
    for (const chip of ["Отменён: праздник", "Отменён: по вине центра", "Включён в зарплату"]) assert.ok(texts.some((t) => t.includes(chip)), chip);
    assert.equal(await page.locator('button[aria-label="Отозвать отмену: пн, 23.11 · Математика 7"]').count(), 1);
    assert.equal(await page.locator('[data-testid="withdraw-cancellation"]').count(), 1, "only the one with canWithdraw true");
    assert.equal(await page.locator("text=Новый запрос").count(), 1);
    const link = await page.evaluate(() => { const el = [...document.querySelectorAll("button")].find((b) => /Новый запрос/.test(b.textContent)); const range = document.createRange(); range.selectNodeContents(el); return { lines: new Set([...range.getClientRects()].map((r) => Math.round((r.top + r.bottom) / 8))).size, right: Math.round(el.getBoundingClientRect().right), viewport: window.innerWidth }; });
    assert.equal(link.lines, 1, "«Новый запрос» is on ONE line at every width");
    assert.ok(link.right <= link.viewport, "and inside the screen");
    const probe = await page.evaluate(layoutProbe, "body");
    assert.deepEqual([probe.bad, probe.scroll > 0], [[], false]);
    if (width === 375) assert.deepEqual(await page.evaluate(touchTargets, "body"), []);
    assert.deepEqual(noise(errors), []);
    await page.close();
  });
}

test("a returned lesson is ONE row: the cancellation «урок был» of 09.11 and 25.11 stand, their system records `closed` are hidden; the return of 02.11 has no such cancellation and stays", async () => {
  const mine = mineReal();
  const system = mine.items.filter((i) => i.status === "closed");
  assert.equal(system.length, 3, "the real answer has three system records of a return");
  const run = await openBlock(mineOf(mine));
  const { page } = run;
  assert.equal(await rowOf(page, "пн, 09.11").count(), 1);
  assert.equal(await rowOf(page, "ср, 25.11").count(), 1);
  assert.equal(await rowOf(page, "пн, 02.11").count(), 2, "02.11: «Включён в зарплату» and the return - different outcomes, both stay");
  await page.close();
});

test("«Отозвать»: POST withdraw-cancellation with expectedKind unconfirmed for THIS lesson (23.11), then the block reads again", async () => {
  const mine = mineReal();
  let reads = 0;
  const run = await openBlock((request) => {
    if (request.path === "/auth/org/substitutions/mine") { reads += 1; return { json: reads > 1 ? { ...mine, items: mine.items.filter((i) => i.lesson.date !== "2026-11-23") } : mine }; }
    if (request.method === "POST" && WITHDRAW.test(request.path)) return { json: { ok: true, restored: true, lessonId: "lesson-mon", lessonDate: "2026-11-23", previousKind: "unconfirmed", returnedToReview: true } };
    return null;
  });
  const { page, calls } = run;
  await page.click('[data-testid="withdraw-cancellation"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="withdraw-cancellation"]').length === 0);
  const sent = calls.filter((c) => WITHDRAW.test(c.path));
  const waiting = mine.items.find((i) => i.lesson.date === "2026-11-23" && i.outcome === "cancel_waiting");
  assert.deepEqual(sent.map((c) => [c.method, c.path.includes(waiting.group.id), c.body]), [["POST", true, { lessonId: "lesson-mon", lessonDate: "2026-11-23", expectedKind: "unconfirmed" }]]);
  await page.close();
});

test("the owner decided before the withdrawal (409 ALREADY_DECIDED, the real refusal): the teacher reads the server's sentence and the block reads again - nothing is hidden", async () => {
  const mine = mineReal();
  const refusal = answer("refusals").already_decided;
  const run = await openBlock((request) => {
    if (request.path === "/auth/org/substitutions/mine") return { json: mine };
    if (request.method === "POST" && WITHDRAW.test(request.path)) return { status: 409, json: refusal };
    return null;
  });
  const { page, calls } = run;
  await page.click('[data-testid="withdraw-cancellation"]');
  await page.waitForSelector('[role="alert"]');
  assert.equal(plain(await page.textContent('[role="alert"]')), refusal.detail.message);
  assert.ok(calls.filter((c) => c.path === "/auth/org/substitutions/mine").length >= 2, "the block reads again");
  await page.close();
});

test("a lesson that was given back («Урок был»): the chip says whether he marks it (teacherCanMark of the real answer: 25.11 true, 09.11 false) - «отметьте посещаемость» with «Открыть урок», or «отметит администратор» without it", async () => {
  const run = await openBlock(mineOf(mineReal()));
  const { page } = run;
  const yes = rowOf(page, "ср, 25.11");
  assert.match(plain(await yes.textContent()), /Урок был — отметьте посещаемость/);
  assert.equal(await yes.locator('[data-testid="open-returned-lesson"]').count(), 1);
  const no = rowOf(page, "пн, 09.11");
  assert.match(plain(await no.textContent()), /Урок был — отметит администратор/);
  assert.equal(await no.locator('[data-testid="open-returned-lesson"]').count(), 0, "older than the window: no action for the teacher");
  await page.close();
});

test("«Включён в зарплату» and «Отменён: праздник» are chips of the same list (the real answer: 02.11 and 16.11)", async () => {
  const run = await openBlock(mineOf(mineReal()));
  assert.match(plain(await rowOf(run.page, "пн, 16.11").textContent()), /Отменён: праздник/);
  assert.match(plain(await run.page.locator('[data-testid="my-request-row"]', { hasText: "Включён в зарплату" }).textContent()), /пн, 02\.11/);
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
