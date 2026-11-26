// LESSON-RULES Э1 / Э2: the cancellation that WAITS for the owner - the row of «Ждут решения» and the window of the decision, on the server's own answers (tests/fixtures/lessonRules), 1280 / 1024 / 375.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, isDry, OWNER, ADMIN } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe, touchTargets } = require("./helpers/layout-probe.cjs");
const { answer, listServer, WORLD_DAY, plain } = require("./helpers/lesson-rules-answers.cjs");

const ctx = setup(test);
const KIND_PATH = /\/attendance\/cancellation-kind$/;
const noise = (errors) => errors.filter((text) => !/404|Failed to load resource|409|422|500/.test(text));

async function open(server, { user = OWNER, width = 1280 } = {}) {
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", server, { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
  await run.page.evaluate(([who]) => window.mount("substitutions", who, { role: who.org_role === "admin" ? "admin" : "owner" }), [user]);
  await run.page.waitForSelector('[data-testid="waiting-row"], [data-testid="waiting-reported-row"], [data-testid="one-off-decisions-toggle"]');
  return run;
}

for (const width of [1280, 1024, 375]) {
  test(`${width}: the waiting cancellation is a row with the words of the teacher, «сообщено сегодня», «Решить» named by the lesson and no tick (the real answer pending_owner)`, async () => {
    const { page, errors } = await open(listServer(), { width });
    const row = page.locator('[data-testid="waiting-row"]');
    assert.equal(await row.count(), 1);
    const text = plain(await row.textContent());
    assert.match(text, /пн, 23\.11 · 10:00–11:30/);
    assert.match(text, /Г/);
    assert.match(text, /Иванов И\./);
    assert.match(text, /Урока не было/);
    assert.match(text, /сообщено сегодня/, "waitingDays is 0 in this answer: nothing like «ждёт 0 дней»");
    assert.equal(await row.locator('input[type="checkbox"]').count(), 0, "a cancellation is decided one by one: no tick");
    assert.equal(await page.locator('[data-testid="select-all"]').count(), 0, "no request on the page: no «Выбрать все»");
    assert.equal(await page.locator('button[aria-label="Решить отмену: Г, Иванов И., 23.11"]').count(), 1);
    assert.match(plain(await page.textContent('[role="tablist"]')), /Ждут решения \(1\)/);
    const probe = await page.evaluate(layoutProbe, "body");
    assert.deepEqual([probe.bad, probe.scroll > 0], [[], false], `nothing leaves its box at ${width}`);
    if (width === 375) assert.deepEqual(await page.evaluate(touchTargets, "body"), [], "a phone: every tap target is 40 px");
    assert.deepEqual(noise(errors), []);
    await page.close();
  });
}

test("the window: three outcomes, none chosen, the button off with its reason; the dry run asks «по вине центра» with expectedKind unconfirmed and no reason", async () => {
  const run = await open(listServer({ extra: (r) => (r.method === "PUT" && KIND_PATH.test(r.path) && isDry(r) ? { json: answer("dry_run_confirm_centre") } : null) }));
  const { page, calls } = run;
  await page.click('button[aria-label^="Решить отмену"]');
  await page.waitForSelector('[data-testid="waiting-outcomes"]');
  const dialog = plain(await page.textContent('[role="dialog"]'));
  assert.match(dialog, /Преподаватель сообщил: урока не было/);
  assert.match(dialog, /Г · пн, 23\.11 · 10:00–11:30/);
  assert.match(dialog, /Иванов И\., 26\.11 в \d\d:\d\d/);
  assert.match(dialog, /Что произошло на самом деле\?/);
  for (const label of ["По вине центра", "Праздник, выходной", "Урок был"]) assert.ok(dialog.includes(label), label);
  assert.equal(await page.locator('[role="dialog"] input[type="radio"]:checked').count(), 0, "nothing is chosen beforehand");
  assert.equal(await page.isDisabled('[data-testid="waiting-confirm"]'), true);
  assert.match(plain(await page.textContent('[data-testid="confirm-why"]')), /Выберите, что произошло/);
  const dry = calls.filter((c) => KIND_PATH.test(c.path));
  assert.deepEqual(dry.map((c) => [c.method, isDry(c), c.body]), [["PUT", true, { lessonDate: "2026-11-23", lessonId: "lesson-mon", cancellationKind: "centre", expectedKind: "unconfirmed" }]]);
  await page.close();
});

test("«По вине центра»: the sentence of the server's numbers (9 × 50 000 = 450 000), the button names the outcome, the real request has no reason and no dry run", async () => {
  const run = await open(listServer({ extra: (r) => (r.method === "PUT" && KIND_PATH.test(r.path) ? { json: isDry(r) ? answer("dry_run_confirm_centre") : { ok: true, changed: true, cancellationKind: "centre", version: 3 } } : null) }));
  const { page, calls } = run;
  await page.click('button[aria-label^="Решить отмену"]');
  await page.click('[data-testid="waiting-outcome-centre"]');
  await page.waitForFunction(() => /Перерасчёт/.test(document.querySelector('[data-testid="waiting-caption"]')?.textContent ?? ""));
  assert.equal(plain(await page.textContent('[data-testid="waiting-caption"]')), "Перерасчёт 9 ученикам по 50 000 сум, всего 450 000 сум. Преподавателю урок не оплачивается.");
  assert.equal(plain(await page.textContent('[data-testid="waiting-confirm"]')), "Подтвердить: по вине центра");
  await page.click('[data-testid="waiting-confirm"]');
  await page.waitForSelector('[role="dialog"]', { state: "detached" });
  const real = calls.filter((c) => KIND_PATH.test(c.path) && !isDry(c));
  assert.deepEqual(real.map((c) => c.body), [{ lessonDate: "2026-11-23", lessonId: "lesson-mon", cancellationKind: "centre", expectedKind: "unconfirmed" }]);
  assert.ok(calls.filter((c) => c.path === "/auth/org/substitutions" && /status=pending/.test(c.query)).length >= 2, "the list is read again after the decision");
  await page.close();
});

test("«Праздник, выходной»: no recalculation, the button names the outcome; «Урок был»: the lesson goes back to the mark (restore with expectedKind), the teacher marks it", async () => {
  const run = await open(listServer({ extra: (r) => {
    if (r.method === "PUT" && KIND_PATH.test(r.path)) return { json: isDry(r) ? answer("dry_run_confirm_centre") : { ok: true, changed: true, cancellationKind: "holiday", version: 3 } };
    if (r.method === "POST" && /\/lessons\/restore$/.test(r.path)) return { json: { ok: true, restored: true, lessonId: "lesson-mon", lessonDate: "2026-11-23", previousKind: "unconfirmed", returnedToReview: true } };
    return null;
  } }));
  const { page, calls } = run;
  await page.click('button[aria-label^="Решить отмену"]');
  await page.click('[data-testid="waiting-outcome-holiday"]');
  assert.equal(plain(await page.textContent('[data-testid="waiting-caption"]')), "Ученикам: без перерасчёта. Преподавателю урок не оплачивается.");
  assert.equal(plain(await page.textContent('[data-testid="waiting-confirm"]')), "Подтвердить: праздник, выходной");
  await page.click('[data-testid="waiting-outcome-held"]');
  await page.waitForFunction(() => /Отмена снимается/.test(document.querySelector('[data-testid="waiting-caption"]')?.textContent ?? ""));
  assert.equal(plain(await page.textContent('[data-testid="waiting-caption"]')), "Отмена снимается, преподаватель отметит посещаемость. Деньги считаются как за обычный урок.");
  assert.equal(plain(await page.textContent('[data-testid="waiting-confirm"]')), "Вернуть урок на отметку");
  await page.click('[data-testid="waiting-confirm"]');
  await page.waitForSelector('[role="dialog"]', { state: "detached" });
  const restore = calls.filter((c) => /\/lessons\/restore$/.test(c.path));
  assert.equal(restore.length, 1);
  assert.equal(restore[0].body.expectedKind, "unconfirmed");
  assert.equal(restore[0].body.lessonId, "lesson-mon");
  assert.ok(restore[0].body.reason.length >= 3, "the restore needs a reason: the window writes its own words");
  assert.equal(calls.filter((c) => KIND_PATH.test(c.path) && !isDry(c)).length, 0, "no kind was written");
  await page.close();
});

test("the owner decided first (409 ALREADY_DECIDED, the real refusal): «Отмена уже решена» with the sentence of the server and one button «Закрыть»", async () => {
  const refusal = answer("refusals").already_decided;
  const run = await open(listServer({ extra: (r) => (r.method === "PUT" && KIND_PATH.test(r.path) ? { status: 409, json: refusal } : null) }));
  const { page } = run;
  await page.click('button[aria-label^="Решить отмену"]');
  await page.waitForSelector('[data-testid="waiting-decided"]');
  assert.equal(plain(await page.textContent('[data-testid="waiting-decided"]')), refusal.detail.message);
  assert.equal(plain(await page.textContent('[role="dialog"] h2, [role="dialog"] [id$="-title"]')).includes("Отмена уже решена"), true);
  assert.equal(await page.locator('[data-testid="waiting-confirm"]').count(), 0);
  assert.equal(plain(await page.textContent('[data-testid="confirm-cancel"]')), "Закрыть");
  await page.close();
});

test("the month is closed (409 PERIOD_CLOSED, the real refusal): the window says it in the notice with the way out; no outcome to choose", async () => {
  const refusal = answer("refusals").period_closed;
  const run = await open(listServer({ extra: (r) => (r.method === "PUT" && KIND_PATH.test(r.path) ? { status: 409, json: refusal } : null) }));
  const { page } = run;
  await page.click('button[aria-label^="Решить отмену"]');
  await page.waitForSelector('[data-testid="period-closed"]');
  assert.match(plain(await page.textContent('[data-testid="period-closed"]')), /Ноябрь у Иванова И\. закрыт \(зарплата сохранена 02\.12\.2026\)/);
  assert.equal(await page.locator('[data-testid="waiting-outcomes"]').count(), 0);
  assert.equal(plain(await page.textContent('[data-testid="confirm-cancel"]')), "Закрыть");
  await page.close();
});

test("an administrator WITHOUT the money right: the waiting cancellation is not a row of the table - it is a line of the block «Решает владелец» (no sum, no button); the real answer pending_admin with the one field the server derives from the caller, canDecide, false", async () => {
  const pending = answer("pending_admin");
  pending.items[0].canDecide = false;       // the real answer of an administrator WITH the right has canDecide true; the answer for one without it was not exported (listed in the report)
  const run = await open(listServer({ pending }), { user: { ...ADMIN, payments_access: false } });
  const { page } = run;
  assert.equal(await page.locator('[data-testid="waiting-row"]').count(), 0);
  assert.equal(plain(await page.textContent('[data-testid="one-off-decisions-title"]')), "Решает владелец: 1 отмена урока");
  await page.click('[data-testid="one-off-decisions-toggle"]');
  assert.equal(plain(await page.textContent('[data-testid="one-off-decisions-hint"]')), "Отмену урока и оплату дополнительного урока решает владелец или администратор с доступом к деньгам.");
  const line = plain(await page.textContent('[data-testid="waiting-reported-row"]'));
  assert.match(line, /Иванов И\. сообщил 26\.11, что урока не было · пн, 23\.11, Г/);
  assert.ok(!/сум/.test(line), "no sum for a role without the right");
  assert.equal(await page.locator('button:has-text("Решить")').count(), 0);
  await page.close();
});
