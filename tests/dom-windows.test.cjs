// «Деньги-1», пакет А, R3 m5: the windows of money in a real DOM - the REAL components and hooks, the server answered by the test (shapes from the server's fixtures).
// For every window: the dry run is asked when it opens; the button waits for it; the real request carries the same body (no `dry_run`); the failures the server has (a closed month,
// a changed lesson, a changed sheet) end where the person can act.
const assert = require("node:assert/strict");
const test = require("node:test");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { fixture, OWNER_EFFECTS, EMPTY_EFFECTS, deferred } = require("./helpers/dom-answers.cjs");

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

const isDry = (call) => /dry_run=true/.test(call.query);
const ok = (page) => page.waitForFunction(() => window.__log.some((line) => line !== "close") || window.__log.includes("close"));
const logOf = (page) => page.evaluate(() => window.__log.slice());
const noise = (errors) => errors.filter((text) => !/404|Failed to load resource|409|422|500/.test(text));
const PERIOD_CLOSED = { code: "PERIOD_CLOSED", message: "Месяц октябрь 2026 у преподавателя Каримова К. закрыт: ведомость сохранена 03.11.2026. Чтобы исправить, владелец переоткрывает месяц.", month: "2026-10", teacherId: "t1", teacherName: "Каримова К.", closedOn: "2026-11-03" };

// ── cancel of a payment, of a write-off, of a refund: the ONE window ───────────────────────────────

test("cancel of a payment: the dry run first (reason «Проверка последствий»), the red button waits; then the real request has the typed reason and no `dry_run`", async () => {
  const hold = deferred();
  const { page, calls, errors } = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.path !== "/auth/org/payments/p1/void") return null;
    if (isDry(request)) return hold.promise.then(() => ({ json: { ...fixture("e1_void_300000"), money_effects: OWNER_EFFECTS } }));
    return { json: { ...fixture("e1_void_300000"), dry_run: false } };
  });
  await page.evaluate(() => window.mount("voidPayment"));
  await page.waitForSelector('[data-testid="money-effects"][data-state="loading"]');
  assert.equal(await page.isDisabled('button[form="record-void-form"]'), true);
  assert.match(await page.textContent('[data-testid="money-effects"]'), /Считаем/);
  hold.open();
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  assert.match(await page.textContent('[data-testid="money-effects"]'), /Зарплата за октябрь(?: 2026)? уменьшится:\s*Каримова К\. — −50\s000\sсум \(было 475\s000, станет 425\s000\)/);
  await page.fill("#record-void-reason", "оплата внесена по ошибке");
  await page.click('button[form="record-void-form"]');
  await page.waitForFunction(() => window.__log.includes("voided"));
  const dry = calls.find(isDry);
  const real = calls.find((call) => !isDry(call));
  assert.deepEqual(dry.body, { reason: "Проверка последствий" });
  assert.deepEqual(real.body, { reason: "оплата внесена по ошибке" });
  assert.deepEqual(noise(errors), []);
  await page.close();
});

test("cancel of a payment: the dry run FAILED - the button stays closed, the block says why with «Повторить»; the retry asks again and opens it", async () => {
  let n = 0;
  const { page, calls } = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.path !== "/auth/org/payments/p1/void" || !isDry(request)) return null;
    n += 1;
    return n === 1 ? { status: 500, json: { detail: { code: "SERVER_ERROR", message: "Расчёт не удался" } } } : { json: { ...fixture("e1_void_300000"), money_effects: EMPTY_EFFECTS } };
  });
  await page.evaluate(() => window.mount("voidPayment"));
  await page.waitForSelector('[data-testid="money-effects-retry"]');
  assert.equal(await page.isDisabled('button[form="record-void-form"]'), true);
  assert.match(await page.textContent('[data-testid="money-effects"]'), /Без этого подтвердить нельзя/);
  await page.click('[data-testid="money-effects-retry"]');
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  assert.equal(await page.isDisabled('button[form="record-void-form"]'), false);
  assert.equal(calls.filter(isDry).length, 2);
  await page.close();
});

test("m1: a payment that moves no sheet says «Ведомости преподавателей не изменятся», not «Деньги не изменятся» (the debt of the student does change)", async () => {
  const { page } = await openPage(browser, "money.entry.tsx", (request) => (isDry(request) ? { json: { ...fixture("e1_void_300000"), money_effects: EMPTY_EFFECTS } } : null));
  await page.evaluate(() => window.mount("voidPayment"));
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  const text = await page.textContent('[data-testid="money-effects"]');
  assert.match(text, /Ведомости преподавателей не изменятся/);
  assert.doesNotMatch(text, /Деньги не изменятся/);
  await page.close();
});

test("cancel of a write-off (the one cancel window): the dry run of writeoffs/w1/void, the button waits, the real request has the typed reason", async () => {
  const { page, calls } = await openPage(browser, "money.entry.tsx", (request) => (request.path === "/auth/org/writeoffs/w1/void" ? { json: { ...fixture("e6_writeoff_40000"), dry_run: isDry(request), money_effects: EMPTY_EFFECTS } } : null));
  await page.evaluate(() => window.mount("recordVoid"));
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  await page.fill("#record-void-reason", "простили по ошибке");
  await page.click('button[form="record-void-form"]');
  await page.waitForFunction(() => window.__log.includes("voided"));
  assert.deepEqual(calls.map((call) => `${isDry(call) ? "dry" : "real"}:${JSON.stringify(call.body)}`), ['dry:{"reason":"Проверка последствий"}', 'real:{"reason":"простили по ошибке"}']);
  await page.close();
});

// ── write-off and refund: a form that moves money ───────────────────────────────────────────────

test("write-off: nothing is asked while the form cannot be sent; once it can, the dry run of the SAME body is asked and the button waits for it", async () => {
  const hold = deferred();
  const { page, calls } = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.path !== "/auth/org/memberships/m1/writeoffs") return null;
    if (isDry(request)) return hold.promise.then(() => ({ json: { ...fixture("e6_writeoff_40000"), money_effects: EMPTY_EFFECTS } }));
    return { status: 201, json: fixture("e6_writeoff_40000") };
  });
  await page.evaluate(() => window.mount("writeoff"));
  await page.waitForTimeout(600);
  assert.equal(calls.length, 0, "no reason yet - nothing to ask");
  assert.equal(await page.locator('[data-testid="money-effects"]').count(), 0);
  assert.equal(await page.isDisabled('button[form="writeoff-form"]'), false, "the press shows what is wrong, as it always did");
  await page.fill("#writeoff-reason", "болезнь, договорились с родителем");
  await page.waitForSelector('[data-testid="money-effects"][data-state="loading"]');
  assert.equal(await page.isDisabled('button[form="writeoff-form"]'), true);
  hold.open();
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  assert.match(await page.textContent('[data-testid="money-effects"]'), /Ведомости преподавателей не изменятся/);
  await page.click('button[form="writeoff-form"]');
  await page.waitForFunction(() => window.__log.includes("done"));
  const [dry, real] = calls;
  assert.ok(isDry(dry) && !isDry(real));
  assert.deepEqual(real.body, dry.body, "the real request is the dry run's body");
  assert.equal(real.body.reason, "болезнь, договорились с родителем");
  await page.close();
});

test("refund: the same - asked once the method and the amount make a request, the button waits, the real body equals the dry one", async () => {
  const { page, calls } = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.path !== "/auth/org/memberships/m1/refunds") return null;
    return isDry(request) ? { json: { ...fixture("e7_refund_344000"), money_effects: EMPTY_EFFECTS } } : { status: 201, json: fixture("e7_refund_344000") };
  });
  await page.evaluate(() => window.mount("refund"));
  await page.waitForTimeout(500);
  assert.equal(calls.length, 0, "no method yet - nothing to ask");
  await page.click('[role="radiogroup"] >> text=Наличные');
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  await page.click('button[form="refund-form"]');
  await page.waitForFunction(() => window.__log.includes("done"));
  const [dry, real] = calls;
  assert.ok(isDry(dry) && !isDry(real));
  assert.deepEqual(real.body, dry.body);
  await page.close();
});

// ── the return of a lesson ───────────────────────────────────────────────────────────────────────

test("«Вернуть в разбор»: whose deduction goes away is listed above the block; the real request has the reason and no dryRun", async () => {
  const { page, calls } = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.path !== "/auth/org/groups/g1/lessons/restore") return null;
    return request.body.dryRun
      ? { json: { ok: true, restored: false, dryRun: true, returnedToReview: true, moneyEffects: OWNER_EFFECTS, deductions: [{ studentId: "s1", name: "Иванов Иван", amount: 46000 }, { studentId: "s2", name: "Петрова Мария", amount: 46000 }] } }
      : { json: { ok: true, restored: true, lessonId: "l1", lessonDate: "2026-10-28", returnedToReview: true } };
  });
  await page.evaluate(() => window.mount("review"));
  await page.waitForSelector('[data-testid="return-review-deductions"]');
  const text = (await page.textContent('[data-testid="return-review-deductions"]')).replace(/\s+/g, " ");
  assert.match(text, /Иванов Иван: 46 000 сум/);
  assert.match(text, /Петрова Мария: 46 000 сум/);
  await page.fill("#return-review-reason", "нажали «Урока не было» по ошибке");
  await page.click('[data-testid="return-review-submit"]');
  await page.waitForFunction(() => window.__log.includes("done"));
  assert.equal(calls[0].body.dryRun, true);
  assert.equal(calls[1].body.dryRun, undefined);
  assert.equal(calls[1].body.reason, "нажали «Урока не было» по ошибке");
  await page.close();
});

test("«Вернуть урок»: the real request carries the version the dry run read; a 409 ATTENDANCE_CONFLICT forgets it, asks again, tells the page (`stale`) and the next press carries the NEW version", async () => {
  let version = 4;
  let attempt = 0;
  const { page, calls } = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.path !== "/auth/org/groups/g1/attendance/return") return null;
    if (request.body.dryRun) { const answer = { ok: true, changed: true, version, status: "completed", dryRun: true, moneyEffects: EMPTY_EFFECTS }; return { json: answer }; }
    attempt += 1;
    if (attempt === 1) { version = 7; return { status: 409, json: { detail: { code: "ATTENDANCE_CONFLICT", message: "Отметки урока уже изменили", currentVersion: 7 } } }; }
    return { json: { ok: true, changed: true, version: 8, status: "in_progress" } };
  });
  await page.evaluate(() => window.mount("return"));
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  await page.fill("#lesson-return-reason", "ошибочно завершили");
  await page.click('[data-testid="lesson-return-submit"]');
  await page.waitForFunction(() => window.__log.includes("stale"));
  assert.match(await page.textContent('[role="alert"]'), /Мы прочитали урок заново/);
  await page.waitForFunction(() => !document.querySelector('[data-testid="lesson-return-submit"]').disabled);
  await page.click('[data-testid="lesson-return-submit"]');
  await page.waitForFunction(() => window.__log.includes("done"));
  const reals = calls.filter((call) => !call.body.dryRun);
  assert.deepEqual(reals.map((call) => call.body.expectedVersion), [4, 7], "the second press carries the version the window read again");
  assert.equal(calls.filter((call) => call.body.dryRun).length, 2, "the dry run was asked again after the conflict");
  await page.close();
});

// ── «Переоткрыть месяц» ────────────────────────────────────────────────────────────────────────────

test("«Переоткрыть месяц»: the revision of the sheet is read first (the button waits), the request carries it; 409 SHEET_CHANGED reads it again and the next press carries the new one", async () => {
  let revision = 3;
  let attempt = 0;
  const { page, calls } = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.method === "GET" && request.path === "/auth/org/payroll-periods") return { json: { month: "2026-10", items: [{ teacherId: "t1", teacherName: "Каримова К.", month: "2026-10", state: "closed", closedOn: "2026-11-03", sheetId: "s1", sheetRevision: revision, reopened: null }] } };
    if (request.path === "/auth/org/payroll-periods/2026-10/reopen") {
      attempt += 1;
      if (attempt === 1) { revision = 4; return { status: 409, json: { detail: { code: "SHEET_CHANGED", message: "Ведомость уже изменили. Обновите страницу и проверьте, нужно ли переоткрывать месяц" } } }; }
      return { json: { ok: true, changed: true, teacherId: "t1", month: "2026-10", state: "reopened", closedOn: "2026-11-03", sheetId: "s1", reopened: { at: "2026-11-05T09:00:00", by: "Арслан", reason: "ошибка" } } };
    }
    return null;
  });
  await page.evaluate(() => window.mount("reopen"));
  await page.fill("#reopen-month-reason", "ошибочно отметили");
  await page.waitForSelector('[data-testid="reopen-submit"]:not([disabled])');
  await page.click('[data-testid="reopen-submit"]');
  await page.waitForSelector('[role="alert"]');
  assert.match(await page.textContent('[role="alert"]'), /Ведомость уже изменили/, "the sentence of the server");
  await page.waitForSelector('[data-testid="reopen-submit"]:not([disabled])');
  await page.click('[data-testid="reopen-submit"]');
  await page.waitForFunction(() => window.__log.includes("reopened"));
  assert.deepEqual(calls.filter((call) => call.path.endsWith("/reopen")).map((call) => call.body.sheet_revision), [3, 4]);
  await page.close();
});

// ── the sheet of a lesson of the schedule (K2) ──────────────────────────────────────────────────────

test("K2: «Вернуть урок» of a cancelled lesson in the sheet of the schedule shows the deductions and the money BEFORE the button, which waits; the real restore has no dryRun", async () => {
  const hold = deferred();
  const { page, calls } = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.path !== "/auth/org/groups/g1/lessons/restore") return null;
    if (request.body.dryRun) return hold.promise.then(() => ({ json: { ok: true, restored: false, dryRun: true, moneyEffects: EMPTY_EFFECTS, deductions: [{ studentId: "s1", name: "Иванов Иван", amount: 46000 }] } }));
    return { json: { ok: true, restored: true, lessonId: "l1", lessonDate: "2026-11-20", previousKind: "centre", warnings: [] } };
  });
  await page.evaluate(() => window.mount("sheet"));
  await page.click('[data-testid="sheet-restore"]');
  await page.waitForSelector("#sheet-reason");
  await page.fill("#sheet-reason", "центр работает, выходной отменили");
  await page.waitForSelector('[data-testid="money-effects"][data-state="loading"]');
  const confirm = 'button:has-text("Вернуть урок")';
  assert.equal(await page.locator(confirm).last().isDisabled(), true, "the answer about money is not here: the button waits");
  hold.open();
  await page.waitForSelector('[data-testid="return-review-deductions"]');
  assert.match((await page.textContent('[data-testid="return-review-deductions"]')).replace(/\s+/g, " "), /Иванов Иван: 46 000 сум/);
  assert.equal(await page.locator(confirm).last().isDisabled(), false);
  await page.locator(confirm).last().click();
  await page.waitForFunction(() => window.__log.some((line) => line.startsWith("changed:")));
  assert.deepEqual(calls.map((call) => Boolean(call.body.dryRun)), [true, false]);
  assert.equal(calls[1].body.reason, "центр работает, выходной отменили");
  await page.close();
});

// ── the rest of the windows ───────────────────────────────────────────────────────────────────────

test("LESSONS 27: a double press of the red button sends ONE request (the window holds the second press with a ref, not only with the state)", async () => {
  const hold = deferred();
  const { page, calls } = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.path !== "/auth/org/groups/g1/attendance/return") return null;
    if (request.body.dryRun) return { json: { ok: true, changed: true, version: 4, status: "completed", dryRun: true, moneyEffects: EMPTY_EFFECTS } };
    return hold.promise.then(() => ({ json: { ok: true, changed: true, version: 5, status: "in_progress" } }));
  });
  await page.evaluate(() => window.mount("return"));
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  await page.fill("#lesson-return-reason", "ошибочно завершили");
  await page.evaluate(() => { const button = document.querySelector('[data-testid="lesson-return-submit"]'); button.click(); button.click(); });
  await page.waitForTimeout(300);
  hold.open();
  await page.waitForFunction(() => window.__log.includes("done"));
  assert.equal(calls.filter((call) => !call.body.dryRun).length, 1, "one request for two presses");
  await page.close();
});

test("«Вернуть в разбор»: a closed month in the dry run is the sentence of the server with «Переоткрыть месяц»; the red button waits", async () => {
  const { page } = await openPage(browser, "money.entry.tsx", (request) => (request.path === "/auth/org/groups/g1/lessons/restore" ? { status: 409, json: { detail: PERIOD_CLOSED } } : null));
  await page.evaluate(() => window.mount("review"));
  await page.waitForSelector('[data-testid="period-closed"]');
  assert.match(await page.textContent('[data-testid="period-closed"]'), /владелец переоткрывает месяц/);
  assert.ok(await page.locator('[data-testid="period-closed-reopen"]').count(), "the owner can reopen it from here");
  assert.equal(await page.isDisabled('[data-testid="return-review-submit"]'), true);
  await page.close();
});

test("«Вернуть в разбор»: deductions that go away are money - the block never says «Ведомости не изменятся» next to them; without deductions it says so", async () => {
  const deductionsOnly = await openPage(browser, "money.entry.tsx", (request) => (request.path === "/auth/org/groups/g1/lessons/restore" ? { json: { ok: true, restored: false, dryRun: true, moneyEffects: EMPTY_EFFECTS, deductions: [{ studentId: "s1", name: "Иванов Иван", amount: 46000 }] } } : null));
  await deductionsOnly.page.evaluate(() => window.mount("review"));
  await deductionsOnly.page.waitForSelector('[data-testid="return-review-deductions"]');
  assert.equal(await deductionsOnly.page.locator('[data-testid="money-effects"]').count(), 0, "no «nothing changes» beside a deduction that goes away");
  await deductionsOnly.page.close();
  const none = await openPage(browser, "money.entry.tsx", (request) => (request.path === "/auth/org/groups/g1/lessons/restore" ? { json: { ok: true, restored: false, dryRun: true, moneyEffects: EMPTY_EFFECTS, deductions: [] } } : null));
  await none.page.evaluate(() => window.mount("review"));
  await none.page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  assert.equal(await none.page.locator('[data-testid="return-review-deductions"]').count(), 0);
  assert.match(await none.page.textContent('[data-testid="money-effects"]'), /Деньги не изменятся/);
  await none.page.close();
});

test("K2: a 409 ATTENDANCE_CONFLICT of «Вернуть урок» in the sheet reads the schedule behind again (`onReload`) and keeps the sheet - it does not close it (`onRefresh` does)", async () => {
  const { page } = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.path !== "/auth/org/groups/g1/attendance/return") return null;
    return request.body.dryRun
      ? { json: { ok: true, changed: true, version: 4, status: "completed", dryRun: true, moneyEffects: EMPTY_EFFECTS } }
      : { status: 409, json: { detail: { code: "ATTENDANCE_CONFLICT", message: "Отметки урока уже изменили", currentVersion: 6 } } };
  });
  await page.evaluate(() => window.mount("sheet", undefined, { actions: ["returnHeld"] }));
  await page.click('[data-testid="sheet-return-held"]');
  await page.waitForSelector("#lesson-return-reason");
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  await page.fill("#lesson-return-reason", "ошибочно завершили");
  await page.click('[data-testid="lesson-return-submit"]');
  await page.waitForFunction(() => window.__log.includes("reload"));
  const log = await logOf(page);
  assert.ok(log.includes("reload") && !log.includes("refresh") && !log.includes("close"), `the schedule is read again, the sheet stays: ${log}`);
  await page.close();
});

// ── the closed-month window of an action that has no window of its own (m4) ───────────────────────

test("m4: «Сбросить решение» in a closed month - the sentence of the server and «Переоткрыть месяц» (the right), then the action is asked again; without the right - the sentence only", async () => {
  const owner = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.method === "GET" && request.path === "/auth/org/payroll-periods") return { json: { month: "2026-10", items: [{ teacherId: "t1", teacherName: "Каримова К.", month: "2026-10", state: "closed", closedOn: "2026-11-03", sheetId: "s1", sheetRevision: 3, reopened: null }] } };
    if (request.path === "/auth/org/payroll-periods/2026-10/reopen") return { json: { ok: true, changed: true, teacherId: "t1", month: "2026-10", state: "reopened", closedOn: "2026-11-03", sheetId: "s1", reopened: { at: "2026-11-05T09:00:00", by: "Арслан", reason: "ошибка" } } };
    return null;
  });
  await owner.page.evaluate(() => window.mount("closedMonth"));
  await owner.page.click("#ask");
  await owner.page.waitForSelector('[data-testid="period-closed"]');
  assert.match(await owner.page.textContent('[data-testid="period-closed"]'), /Месяц октябрь 2026 у преподавателя Каримова К\. закрыт/);
  await owner.page.click('[data-testid="period-closed-reopen"]');
  await owner.page.fill("#reopen-month-reason", "ошибочно отметили");
  await owner.page.waitForSelector('[data-testid="reopen-submit"]:not([disabled])');
  await owner.page.click('[data-testid="reopen-submit"]');
  await owner.page.waitForFunction(() => window.__log.includes("retry"));
  await owner.page.close();
  const admin = await openPage(browser, "money.entry.tsx");
  await admin.page.evaluate(() => window.mount("closedMonth", { role: "admin", org_role: "admin", payments_access: false }));
  await admin.page.click("#ask");
  await admin.page.waitForSelector('[data-testid="period-closed"]');
  assert.equal(await admin.page.locator('[data-testid="period-closed-reopen"]').count(), 0);
  await admin.page.close();
});

test("write-off: a submit that is not a press of the button (the form sent from elsewhere) while the effects are counted sends nothing", async () => {
  const hold = deferred();
  const { page, calls } = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.path !== "/auth/org/memberships/m1/writeoffs") return null;
    return isDry(request) ? hold.promise.then(() => ({ json: { ...fixture("e6_writeoff_40000"), money_effects: EMPTY_EFFECTS } })) : { status: 201, json: fixture("e6_writeoff_40000") };
  });
  await page.evaluate(() => window.mount("writeoff"));
  await page.waitForTimeout(400);
  await page.fill("#writeoff-reason", "болезнь, договорились с родителем");
  await page.waitForSelector('[data-testid="money-effects"][data-state="loading"]');
  await page.evaluate(() => document.getElementById("writeoff-form").requestSubmit());
  await page.waitForTimeout(300);
  assert.equal(calls.filter((call) => !isDry(call)).length, 0, "the money was not written before the person saw what it does");
  hold.open();
  await page.close();
});

// ── the payout of a teacher above what is left: the hint by the basis of the month (R3 #20) ───────────────

const PAYOUT_STATE = { saved_total: 25000, fresh_total: 25000, target: 25000, paid: 0, balance: 25000, state: "unpaid", basis: "saved", changed_by: 0, change_text: null, text: "", items: [], carry_in: 0, carry_used: 0, advance_out: 0 };

test("payout above the balance: the question and the hint of a CLOSED month («Аванс уменьшит выплату следующего месяца») and of an OPEN one (it hands nothing on yet)", async () => {
  for (const [basis, question, hint] of [
    ["saved", /Выплата больше остатка на 15\s000\sсум — записать как аванс\?/, "Аванс уменьшит выплату следующего месяца"],
    ["fresh", /Выплата больше начисленного сейчас на 15\s000\sсум — записать как аванс\?/, "Месяц ещё идёт: если к его концу начислится меньше выплаченного, разница уменьшит выплату следующего месяца"],
  ]) {
    const { page, calls } = await openPage(browser, "money.entry.tsx", (request) => (request.path === "/auth/org/payroll/sheets/s1/payouts" ? { status: 409, json: { detail: { code: "OVERPAY_CONFIRM_REQUIRED", message: "Выплата больше остатка на 15 000 сум", overpay: 15000, balance: 25000 } } } : null));
    await page.evaluate(([state]) => window.mount("payout", undefined, { state }), [{ ...PAYOUT_STATE, basis }]);
    await page.fill("#payout-amount", "40 000");
    await page.click('[role="radio"]:has-text("Наличные")');
    await page.click('button[form="payout-form"]');
    await page.waitForSelector('[data-testid="payout-overpay"]');
    const text = (await page.textContent('[data-testid="payout-overpay"]')).replace(/\s+/g, " ");
    assert.match(text, question, basis);
    assert.ok(text.includes(hint), `${basis}: the hint says what the advance does - ${text}`);
    assert.equal(calls.length, 1, "the first request carries no confirmation");
    await page.close();
  }
});
