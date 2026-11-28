// LESSON-RULES Э1 / Э2: the cancellation that WAITS for the owner - the row of «Ждут решения» and the window of the decision, on the server's own answers (tests/fixtures/lessonRules), 1280 / 1024 / 375.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, isDry, OWNER, ADMIN } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe, touchTargets } = require("./helpers/layout-probe.cjs");
const { answer, listServer, WORLD_DAY, plain } = require("./helpers/lesson-rules-answers.cjs");

const ctx = setup(test);
const KIND_PATH = /\/attendance\/cancellation-kind$/;
const MON = 'button[aria-label="Решить отмену: Математика 7, Эргашев К., 23.11"]';   // the dry run answers of the world are for the lesson of 23.11 (the rows are found by their lesson: the order of two rows reported at one moment is the server's tie-break)
const noise = (errors) => errors.filter((text) => !/404|Failed to load resource|409|422|500/.test(text));

async function open(server, { user = OWNER, width = 1280 } = {}) {
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", server, { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
  await run.page.evaluate(([who]) => window.mount("substitutions", who, { role: who.org_role === "admin" ? "admin" : "owner" }), [user]);
  await run.page.waitForSelector('[data-testid="waiting-row"], [data-testid="waiting-reported-row"], [data-testid="one-off-decisions-toggle"]');
  return run;
}

for (const width of [1280, 1024, 375]) {
  test(`${width}: two waiting cancellations are two rows with the words of the teacher, «сообщено сегодня», «Решить» named by the lesson and no tick (the real answer pending_owner)`, async () => {
    const { page, errors } = await open(listServer(), { width });
    const rows = page.locator('[data-testid="waiting-row"]');
    assert.equal(await rows.count(), 2);
    // the two rows were reported at one moment: the order between them is the server's tie-break (it follows the ids), so each row is found by its lesson, not by its place
    const first = plain(await rows.filter({ hasText: "18.11" }).textContent());
    assert.match(first, /ср, 18\.11 · 10:00–11:30/);
    const text = plain(await rows.filter({ hasText: "23.11" }).textContent());
    assert.match(text, /пн, 23\.11 · 10:00–11:30/);
    assert.match(text, /Математика 7/);
    assert.match(text, /Эргашев К\./);
    assert.match(text, /Урока не было/);
    assert.match(text, /Урока не было: Отключили свет/, "the words of the teacher are shown as the server gave them");
    assert.match(text, /сообщено сегодня/, "waitingDays is 0 in this answer: nothing like «ждёт 0 дней»");
    const row = rows;
    assert.equal(await row.locator('input[type="checkbox"]').count(), 0, "a cancellation is decided one by one: no tick");
    assert.equal(await page.locator('[data-testid="select-all"]').count(), 0, "no request on the page: no «Выбрать все»");
    assert.equal(await page.locator(MON).count(), 1);
    assert.equal(await page.locator('button[aria-label="Решить отмену: Математика 7, Эргашев К., 18.11"]').count(), 1);
    assert.match(plain(await page.textContent('[role="tablist"]')), /Ждут решения \(2\)/);
    assert.equal(answer("pending_owner").waitingTotal, 2, "the tab says the server's waitingTotal (owner: 2; the administrator without the right: 0 - the test below)");
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
  await page.click(MON);
  await page.waitForSelector('[data-testid="waiting-outcomes"]');
  const dialog = plain(await page.textContent('[role="dialog"]'));
  assert.match(dialog, /Преподаватель сообщил: урока не было/);
  assert.match(dialog, /Математика 7 · пн, 23\.11 · 10:00–11:30/);
  assert.match(dialog, /Эргашев К\., 26\.11 в 12:00/);
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
  await page.click(MON);
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

for (const name of ["dry_run_zero_packages", "dry_run_zero_nobody_charged", "dry_run_zero_one_off"]) {
  test(`the recalculation is zero (${name}, the real dry run): the window says the sentence of the server about WHY (zero_text), never «Перерасчёт 0 ученикам»`, async () => {
    const zero = answer(name);
    assert.deepEqual([zero.total, zero.students, typeof zero.zero_text, Boolean(zero.zero_reason)], [0, 0, "string", true]);
    const run = await open(listServer({ extra: (r) => (r.method === "PUT" && KIND_PATH.test(r.path) && isDry(r) ? { json: zero } : null) }));
    const { page } = run;
    await page.click(MON);
    await page.click('[data-testid="waiting-outcome-centre"]');
    const caption = plain(await page.textContent('[data-testid="waiting-caption"]'));
    assert.equal(caption, `${zero.zero_text} Преподавателю урок не оплачивается.`);
    assert.ok(!/Перерасчёт 0|0 учени/.test(await page.textContent('[role="dialog"]')), "no «0 ученикам» anywhere in the window");
    await page.close();
  });
}

test("«Праздник, выходной»: no recalculation, the button names the outcome; «Урок был»: the lesson goes back to the mark (restore with expectedKind), the teacher marks it", async () => {
  const run = await open(listServer({ extra: (r) => {
    if (r.method === "PUT" && KIND_PATH.test(r.path)) return { json: isDry(r) ? answer("dry_run_confirm_centre") : { ok: true, changed: true, cancellationKind: "holiday", version: 3 } };
    if (r.method === "POST" && /\/lessons\/restore$/.test(r.path)) return { json: { ok: true, restored: true, lessonId: "lesson-mon", lessonDate: "2026-11-23", previousKind: "unconfirmed", returnedToReview: true } };
    return null;
  } }));
  const { page, calls } = run;
  await page.click(MON);
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
  await page.click(MON);
  await page.waitForSelector('[data-testid="waiting-decided"]');
  assert.equal(plain(await page.textContent('[data-testid="waiting-decided"]')), refusal.detail.message);
  assert.equal(plain(await page.textContent('[role="dialog"] h2, [role="dialog"] [id$="-title"]')).includes("Отмена уже решена"), true);
  assert.equal(await page.locator('[data-testid="waiting-confirm"]').count(), 0);
  assert.equal(plain(await page.textContent('[data-testid="confirm-cancel"]')), "Закрыть");
  await page.close();
});

test("the month is closed (409 PERIOD_CLOSED, the real answer confirm_period_closed_409): the window says it in the notice with the way out; no outcome to choose", async () => {
  const refusal = answer("confirm_period_closed_409");
  const run = await open(listServer({ extra: (r) => (r.method === "PUT" && KIND_PATH.test(r.path) ? { status: 409, json: refusal } : null) }));
  const { page } = run;
  await page.click(MON);
  await page.waitForSelector('[data-testid="period-closed"]');
  assert.match(plain(await page.textContent('[data-testid="period-closed"]')), /Ноябрь у Эргашева К\. закрыт \(зарплата сохранена 02\.12\.2026\)/);
  assert.equal(await page.locator('[data-testid="waiting-outcomes"]').count(), 0);
  assert.equal(plain(await page.textContent('[data-testid="confirm-cancel"]')), "Закрыть");
  await page.close();
});

test("an administrator WITHOUT the money right: the waiting cancellation is not a row of the table - it is a line of the block «Решает владелец» (no sum, no button); the real answer pending_admin with the one field the server derives from the caller, canDecide, false", async () => {
  const pending = answer("pending_admin");
  const run = await open(listServer({ pending }), { user: { ...ADMIN, payments_access: false } });
  const { page } = run;
  assert.equal(await page.locator('[data-testid="waiting-row"]').count(), 0);
  assert.equal(pending.waitingTotal, 0, "the real answer: nothing here is his to decide");
  assert.match(plain(await page.textContent('[role="tablist"]')), /Ждут решения \(0\)/, "the number of the tab is the server's waitingTotal: the rows «решает владелец» are not counted (C10.6)");
  assert.equal(plain(await page.textContent('[data-testid="one-off-decisions-title"]')), "Решает владелец: 2 отмены урока");
  await page.click('[data-testid="one-off-decisions-toggle"]');
  assert.equal(plain(await page.textContent('[data-testid="one-off-decisions-hint"]')), "Отмену урока и оплату дополнительного урока решает владелец или администратор с доступом к деньгам.");
  const lines = page.locator('[data-testid="waiting-reported-row"]');
  assert.equal(await lines.count(), 2);
  // found by the lesson: two lines reported at one moment stand in the server's tie-break order
  const line = plain(await lines.filter({ hasText: "23.11" }).textContent());
  assert.match(plain(await lines.filter({ hasText: "18.11" }).textContent()), /Эргашев К\. сообщил 26\.11, что урока не было · ср, 18\.11, Математика 7/);
  assert.match(line, /Эргашев К\. сообщил 26\.11, что урока не было · пн, 23\.11, Математика 7/);
  assert.ok(!/сум/.test(line), "no sum for a role without the right");
  assert.equal(await page.locator('button:has-text("Решить")').count(), 0);
  assert.deepEqual(pending.items.map((i) => i.canWithdraw), [false, false], "the real answer: the cancellations of the teacher are not his to take back");
  assert.equal(await page.locator('[data-testid="withdraw-cancellation"]').count(), 0, "«Отозвать» only where the server says canWithdraw");
  assert.equal(await page.locator('text="Запросов на замену нет"').count(), 0, "the empty text is not said while lines of money («решает владелец») wait");
  await page.close();
});

test("the real «Ждут решения» of the owner with a request of a teacher (pending_owner_with_request: one `source:\"request\"` row for the lesson of 30.11 and two waiting cancellations): the three models stand together, the tab says the server's number", async () => {
  const real = answer("pending_owner_with_request");
  const request = real.items.find((r) => r.source === "request");
  assert.deepEqual([real.items.length, real.pendingTotal, real.unconfirmedTotal, real.waitingTotal, request.lesson.date], [3, 1, 2, 3, "2026-11-30"], "the real answer");
  const run = await open(listServer({ pending: real }));
  const { page } = run;
  await page.waitForSelector('[data-testid="waiting-row"]');
  assert.equal(await page.locator('[data-testid="substitution-row"]').count(), 1, "the request is a row of the table");
  assert.equal(await page.locator('[data-testid="waiting-row"]').count(), 2, "and the two waiting cancellations");
  assert.match(plain(await page.textContent('[role="tablist"]')), /Ждут решения \(3\)/, "the number of the server: the request and the two cancellations");
  assert.match(plain(await page.textContent('[data-testid="substitution-row"]')), /30\.11/, "the request of the lesson of 30.11");
  await page.close();
});

test("an administrator WITHOUT the money right who cancelled the past lesson himself (the real answer pending_admin_author, canWithdraw true): his line of the block «Решает владелец» has «Отозвать»; it sends the withdrawal for THIS lesson and the list is read again", async () => {
  const pending = answer("pending_admin_author");
  const [item] = pending.items;
  assert.equal(item.canWithdraw, true);
  let reads = 0;
  const run = await open(listServer({ pending, extra: (r) => {
    if (r.path === "/auth/org/substitutions" && /status=pending/.test(r.query)) { reads += 1; return { json: reads > 1 ? { ...pending, items: [], total: 0, unconfirmedTotal: 0 } : pending }; }
    if (r.method === "POST" && /\/lessons\/withdraw-cancellation$/.test(r.path)) return { json: { ok: true, restored: true, lessonId: item.lesson.lessonId, lessonDate: item.lesson.date, previousKind: "unconfirmed", returnedToReview: true } };
    return null;
  } }), { user: { ...ADMIN, payments_access: false } });
  const { page, calls } = run;
  await page.click('[data-testid="one-off-decisions-toggle"]');
  assert.equal(await page.locator('[data-testid="waiting-reported-row"]').count(), 1);
  assert.equal(await page.locator('[data-testid="waiting-row"]').count(), 0, "still no sum and no «Решить»");
  assert.equal(plain(await page.textContent('[data-testid="withdraw-cancellation"]')), "Отозвать");
  await page.click('[data-testid="withdraw-cancellation"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="waiting-reported-row"]').length === 0);
  const sent = calls.filter((c) => c.method === "POST" && /withdraw-cancellation$/.test(c.path));
  assert.deepEqual(sent.map((c) => [c.path.includes(item.group.id), c.body]), [[true, { lessonId: item.lesson.lessonId, lessonDate: item.lesson.date, expectedKind: "unconfirmed" }]]);
  await page.close();
});
