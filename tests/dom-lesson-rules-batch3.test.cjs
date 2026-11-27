// LESSON-RULES пачка 3, фаза Б (Э3, Э8, Э9, Э10, Э11): the screens read the SERVER's new words - `waiting`, `reportedBy` / `reportedByRole`, `canWithdraw`, `canReturn`, the sentences of the dry run -
// in a real DOM on the server's own answers (tests/fixtures/lessonRules, the unload of step C13).  1280 / 375, the page clock stands on 26.11.2026.
//  Э3  an administrator without the money right cancels a past lesson: the toast and the words follow `waiting` and the sentence of the server
//  Э8  who reported - the words of the server (the window, the sheet, the panel); the sentences of the outcomes are the server's (`centre_text` / `holiday_text` / `held_text`)
//  Э9  «Вернуть урок» in the panel of an entry follows `canReturn`; a failed preview is said, the button is not shown; the toast after the return carries the money
//  Э10 «Отозвать отмену» where the person SEES the cancellation: the journal (see dom-lesson-rules-journal), the sheet of the lesson, the panel of the teacher's lesson
//  Э11 the window «Сообщить, что урока не было» follows `waiting` of cancel-consequence (off: the ordinary «Урока не было»)
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, isDry, OWNER, ADMIN } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe, touchTargets } = require("./helpers/layout-probe.cjs");
const { answer, listServer, WORLD_DAY, WORLD_TEACHER_ID, plain } = require("./helpers/lesson-rules-answers.cjs");

const ctx = setup(test);
const noise = (errors) => errors.filter((text) => !/404|Failed to load resource|409|422|500/.test(text));
const TEACHER = { id: WORLD_TEACHER_ID, role: "teacher", org_role: "teacher" };
const JOURNAL = answer("journal_teacher");
const WAITING_SENTENCE = answer("cancel_consequence_waiting_admin").consequence;   // «Отмену подтвердит владелец или администратор с доступом к деньгам: до подтверждения ученикам ничего не меняется»
const ALREADY = answer("refusals").already_decided;
const spaced = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const STUDENTS = answer("dry_run_confirm_centre").deductions.map((d, index) => {
  const [last, first] = d.name.split(" ");
  return { id: d.studentId, first_name: first, last_name: last, full_name: d.name, class_level: 7, status: "active", display_id: `AL7-00${index + 1}`, student_phone: "" };
});

/** Waits (with a limit) for a state of the written-down calls - no fixed pause. */
async function until(condition, what, limitMs = 6000) {
  const stop = Date.now() + limitMs;
  while (!condition() && Date.now() < stop) await new Promise((resolve) => setTimeout(resolve, 25));
  assert.ok(condition(), `not reached: ${what}`);
}

async function mount(name, who, props, width = 1280, server = () => null) {
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", server, { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
  await run.page.evaluate(([n, u, p]) => window.mount(n, u, p), [name, who, props]);
  return run;
}

// ── Э11: the window «Сообщить, что урока не было» follows `waiting` of the server ──────────────────────────────────────────────────────────────────────────

for (const width of [1280, 375]) {
  test(`${width}: the window of a lesson that has begun - waiting true (the real cancel-consequence): the quiet blue «Сообщить, что урока не было» with the sentence of the server; waiting false (the centre switched the confirmation off): the ordinary red «Урока не было» with the server's sentence about the students`, async () => {
    const waiting = answer("cancel_consequence_waiting_admin");
    const off = answer("cancel_consequence_setting_off_admin");
    assert.deepEqual([waiting.waiting, off.waiting], [true, false], "the two real answers");
    const on = await mount("cancel-panel", TEACHER, { date: "2026-11-23", reason: "Отключили свет", consequence: waiting.consequence, waiting: waiting.waiting }, width);
    await on.page.waitForSelector('[data-testid="lesson-cancel-panel"]');
    assert.equal(plain(await on.page.textContent('[data-testid="past-cancel-question"]')), "Урок 23 ноября не отмечен. Что произошло?");
    assert.equal(spaced(await on.page.textContent('[data-testid="past-cancel-consequence"]')), spaced(WAITING_SENTENCE));
    assert.equal(await on.page.locator('button:has-text("Сообщить, что урока не было")').count(), 1);
    assert.equal(await on.page.locator('[data-testid="lesson-cancel-panel"]').evaluate((el) => /rose|danger/.test(el.className)), false);
    await on.page.close();

    const plainRun = await mount("cancel-panel", TEACHER, { date: "2026-11-23", reason: "Отключили свет", consequence: off.consequence, waiting: off.waiting }, width);
    const { page, errors } = plainRun;
    await page.waitForSelector('[data-testid="lesson-cancel-panel"]');
    assert.equal(await page.locator('[data-testid="past-cancel-question"]').count(), 0, "no «Что произошло?»: the cancellation is an ordinary one");
    assert.equal(await page.locator('button:has-text("Сообщить, что урока не было")').count(), 0);
    const panel = plain(await page.textContent('[data-testid="lesson-cancel-panel"]'));
    assert.match(panel, /Урока не было: 23 ноября/);
    assert.equal(spaced(await page.textContent('[data-testid="past-cancel-consequence"]')), spaced(off.consequence), "the sentence of the server, as it comes (50 000 each)");
    assert.equal(await page.locator('[data-testid="lesson-cancel-panel"]').evaluate((el) => /rose/.test(el.className)), true, "the red box of an ordinary cancellation");
    assert.equal(await page.locator('button:has-text("Урока не было")').count(), 1);
    const probe = await page.evaluate(layoutProbe, "body");
    assert.deepEqual([probe.bad, probe.scroll > 0], [[], false]);
    if (width === 375) assert.deepEqual(await page.evaluate(touchTargets, "body"), []);
    assert.deepEqual(errors, []);
    await page.close();
  });
}

test("the panel of the teacher reads `waiting` of GET cancel-consequence for the lesson it opens: true - «Сообщить», false - «Урока не было» (the real answers; the action is the real one of the unload with the window of the centre open)", async () => {
  // the real open action is older than the window (requiresAdmin): the same action as the server would give a lesson inside the window - the two fields that say so are the only ones changed
  const real = answer("open_actions_teacher")[0];
  const action = { ...real, requiresAdmin: false, ageDays: 3 };
  for (const [file, expectReport] of [["cancel_consequence_waiting_admin", true], ["cancel_consequence_setting_off_admin", false]]) {
    const groups = [{ id: action.groupId, name: action.groupName, status: "active", teacher_id: TEACHER.id, class_level: 9, student_count: 9, subject: "math" }];
    const run = await mount("lesson-panel", TEACHER, { lesson: null, groups, missedAction: action }, 1280, (r) => {
      if (/\/lessons\/cancel-consequence$/.test(r.path)) return { json: answer(file) };
      if (r.path === `/auth/org/groups/${action.groupId}`) return { json: { id: action.groupId, name: action.groupName, status: "active", teacher_id: TEACHER.id, class_level: 9, student_count: STUDENTS.length, students: STUDENTS } };
      return null;
    });
    const { page } = run;
    await page.click('button:has-text("Урока не было")');
    await page.waitForSelector('[data-testid="lesson-cancel-panel"]');
    await page.waitForSelector('[data-testid="past-cancel-consequence"]');
    assert.equal(spaced(await page.textContent('[data-testid="past-cancel-consequence"]')), spaced(answer(file).consequence), file);
    assert.equal(await page.locator('[data-testid="past-cancel-question"]').count(), expectReport ? 1 : 0, file);
    assert.equal(await page.locator('button:has-text("Сообщить, что урока не было")').count(), expectReport ? 1 : 0, file);
    await page.close();
  }
});

// ── Э3: the administrator without the money right cancels a past lesson ───────────────────────────────────────────────────────────────────────────────────

async function openJournalAs(who, width, server) {
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", (r) => {
    const out = server && server(r);
    if (out) return out;
    return /\/attendance(\?|$)/.test(r.path + (r.query ? `?${r.query}` : "")) ? { json: JOURNAL } : null;
  }, { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
  await run.page.evaluate(([user, props]) => window.mount("journal", user, props), [who, { groupId: JOURNAL.groupId, students: STUDENTS, adminMode: true }]);
  await run.page.waitForSelector('th[data-lesson-key="2026-11-09_lesson-mon"]');
  return run;
}

for (const width of [1280, 375]) {
  test(`${width}: an administrator WITHOUT the money right says «урока не было» for the lesson of 09.11 from the journal: the real answer has waiting true - the toast says «Отмена урока … ждёт подтверждения» and the sentence of the server, never «отмечен как не состоявшийся»`, async () => {
    const real = answer("cancel_admin_without_right_waiting");
    assert.equal(real.waiting, true);
    const run = await openJournalAs({ id: "admin-1", ...ADMIN, payments_access: false }, width, (r) => (r.method === "POST" && /\/attendance\/reconcile\/cancel$/.test(r.path) ? { json: real } : null));
    const { page, calls, errors } = run;
    await page.locator('th[data-lesson-key="2026-11-09_lesson-mon"] [data-column-menu-trigger]').evaluate((el) => el.click());
    await page.click('[role="menuitem"]:has-text("Урока не было")');
    await page.fill("#cancel-missed-reason", "Преподаватель заболел");
    await page.click('[data-testid="cancel-missed-submit"]');
    const toast = page.locator('[role="status"]', { hasText: "Отмена урока" });
    await toast.waitFor();
    const text = plain(await toast.textContent());
    assert.match(text, /Отмена урока .* ждёт подтверждения/);
    assert.ok(text.includes(spaced(real.consequence)), "the sentence of the server is under the title");
    assert.ok(!/отмечен как не состоявшийся/.test(text), "not the words of a cancellation that is done");
    const sent = calls.filter((c) => c.method === "POST" && /reconcile\/cancel$/.test(c.path) && !isDry(c));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.cancellationReason, "Преподаватель заболел");
    assert.deepEqual(noise(errors), []);
    await page.close();
  });
}

// ── Э8: who reported - the words of the server ───────────────────────────────────────────────────────────────────────────────────────────────────────

test("the window of a cancellation made by an ADMINISTRATOR (the real pending_admin_author): the title says «Администратор сообщил» by reportedByRole of the server, the head names reportedBy; the sentences of the three outcomes are the server's own (centre_text / holiday_text / held_text)", async () => {
  const pending = answer("pending_admin_author");
  const dry = answer("dry_run_confirm_centre");
  // the administrator author WITHOUT the right does not decide: the window is the owner's - the same row seen by the owner (the same item; the money right is the caller's: canDecide)
  const owner = { ...pending, waitingTotal: 1, items: pending.items.map((item) => ({ ...item, canDecide: true })) };
  const ownerRun = await openPage(ctx.browser, "lesson-rules.entry.tsx", listServer({
    pending: owner,
    extra: (r) => (r.method === "PUT" && /cancellation-kind$/.test(r.path) && isDry(r) ? { json: dry } : null),
  }), { width: 1280, height: 900, today: WORLD_DAY });
  const { page } = ownerRun;
  await page.evaluate(([who]) => window.mount("substitutions", who, { role: "owner" }), [OWNER]);
  await page.waitForSelector('[data-testid="waiting-row"]');
  await page.click('[data-testid="waiting-row"] button:has-text("Решить")');
  await page.waitForSelector('[data-testid="waiting-outcomes"]');
  const dialog = plain(await page.textContent('[role="dialog"]'));
  assert.match(dialog, /Администратор сообщил: урока не было/, "by reportedByRole: admin");
  assert.ok(!/Преподаватель сообщил/.test(dialog), "the screen does not say «преподаватель» for an administrator");
  assert.match(dialog, /Каримова Д\., 26\.11 в 12:00/, "the head names reportedBy");
  for (const [outcome, field] of [["centre", "centre_text"], ["holiday", "holiday_text"], ["held", "held_text"]]) {
    await page.click(`[data-testid="waiting-outcome-${outcome}"]`);
    await page.waitForFunction(([text]) => (document.querySelector('[data-testid="waiting-caption"]')?.textContent ?? "").replace(/\s+/g, " ").includes(text), [spaced(dry[field])]);
  }
  assert.equal(spaced(await page.textContent('[data-testid="waiting-caption"]')), spaced(dry.held_text));
  await page.close();
});

test("a lesson of the world with NO words of the server in the dry run (a preview without centre_text / holiday_text / held_text) is not a preview: the window does not write the sentences itself", async () => {
  const dry = { ...answer("dry_run_confirm_centre") };
  delete dry.centre_text; delete dry.holiday_text; delete dry.held_text;
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", listServer({ extra: (r) => (r.method === "PUT" && /cancellation-kind$/.test(r.path) && isDry(r) ? { json: dry } : null) }), { width: 1280, height: 900, today: WORLD_DAY });
  await run.page.evaluate(([who]) => window.mount("substitutions", who, { role: "owner" }), [OWNER]);
  await run.page.waitForSelector('[data-testid="waiting-row"]');
  await run.page.click('[data-testid="waiting-row"] button:has-text("Решить")');
  await run.page.click('[data-testid="waiting-outcome-holiday"]');
  await run.page.waitForSelector('[data-testid="waiting-caption"] button');
  const caption = plain(await run.page.textContent('[data-testid="waiting-caption"]'));
  assert.ok(!/Ученикам: без перерасчёта/.test(caption) && !/не оплачивается/.test(caption), caption);
  assert.match(caption, /Не удалось посчитать последствия/);
  await run.page.close();
});

// ── Э10: «Отозвать отмену» in the sheet of the lesson and in the panel of the teacher ───────────────────────────────────────────────────────────────────────

const WITHDRAW = /\/lessons\/withdraw-cancellation$/;
const WITHDRAWN_BODY = { ok: true, restored: true, lessonId: "lesson-mon", lessonDate: "2026-11-23", previousKind: "unconfirmed", returnedToReview: true };
const AUTHOR = answer("pending_admin_author").items[0];

test("the sheet of a lesson whose cancellation waits: the author (an administrator without the right; canWithdraw true of the server) reads who wrote it and has «Отозвать отмену» named by the lesson - one POST with expectedKind, the sheet is told; a refusal of the server is said in the sheet", async () => {
  const lesson = { reportedBy: AUTHOR.reportedBy, reportedByRole: AUTHOR.reportedByRole, canWithdraw: AUTHOR.canWithdraw };
  const run = await mount("sheet-waiting", { ...ADMIN, payments_access: false }, { kind: "unconfirmed", moneyRight: false, lesson }, 1280, (r) => (r.method === "POST" && WITHDRAW.test(r.path) ? { json: WITHDRAWN_BODY } : null));
  const { page, calls } = run;
  await page.waitForSelector('[data-testid="sheet-waiting"]');
  assert.equal(plain(await page.textContent('[data-testid="sheet-waiting-by"]')), "Сообщил: Каримова Д., администратор");
  assert.equal(await page.locator('[data-testid="sheet-decide-waiting"]').count(), 0, "no right: no «Решить»");
  assert.equal(await page.getAttribute('[data-testid="sheet-withdraw"]', "aria-label"), "Отозвать отмену урока: Математика 7, пн, 23.11, 10:00–11:30");
  await page.click('[data-testid="sheet-withdraw"]');
  await page.waitForFunction(() => window.__log.some((line) => line.startsWith("withdrawn:")));
  assert.deepEqual(calls.filter((c) => WITHDRAW.test(c.path)).map((c) => c.body), [{ lessonId: "lesson-mon", lessonDate: "2026-11-23", expectedKind: "unconfirmed" }]);
  assert.match(await page.evaluate(() => window.__log.find((line) => line.startsWith("withdrawn:"))), /Отмена отозвана/);
  await page.close();

  const refused = await mount("sheet-waiting", { ...ADMIN, payments_access: false }, { kind: "unconfirmed", moneyRight: false, lesson }, 1280, (r) => (r.method === "POST" && WITHDRAW.test(r.path) ? { status: 409, json: ALREADY } : null));
  await refused.page.click('[data-testid="sheet-withdraw"]');
  await refused.page.waitForSelector('[data-testid="sheet-withdraw-problem"]');
  assert.equal(plain(await refused.page.textContent('[data-testid="sheet-withdraw-problem"]')), ALREADY.detail.message);
  assert.deepEqual(await refused.page.evaluate(() => window.__log), ["withdraw-failed"], "the schedule behind is read again; no green words");
  await refused.page.close();
  // a lesson whose server says canWithdraw false (the window passed / not the author): no button at all
  const none = await mount("sheet-waiting", { ...ADMIN, payments_access: false }, { kind: "unconfirmed", moneyRight: false, lesson: { ...lesson, canWithdraw: false } }, 1280);
  await none.page.waitForSelector('[data-testid="sheet-waiting"]');
  assert.equal(await none.page.locator('[data-testid="sheet-withdraw"]').count(), 0);
  await none.page.close();
});

for (const width of [1280, 375]) {
  test(`${width}: the panel of the TEACHER's lesson (the real schedule and journal): 23.11 waits and the server says canWithdraw true - «Отмена ждёт подтверждения», who wrote it, «Отозвать отмену» named by the lesson; 18.11 waits but the window passed (canWithdraw false) - no button`, async () => {
    const schedule = answer("schedule_teacher");
    for (const [date, canWithdraw] of [["2026-11-23", true], ["2026-11-18", false]]) {
      const lesson = schedule.find((o) => o.occurrenceDate === date);
      assert.deepEqual([lesson.waiting, lesson.canWithdraw, lesson.reportedBy, lesson.reportedByRole], [true, canWithdraw, "Эргашев К.", "teacher"], date);
      const groups = [{ id: lesson.groupId, name: lesson.groupName, status: "active", teacher_id: TEACHER.id, class_level: 7, student_count: 9, subject: "math" }];
      const run = await mount("lesson-panel", TEACHER, { lesson, groups }, width, (r) => {
        if (r.method === "POST" && WITHDRAW.test(r.path)) return { json: { ...WITHDRAWN_BODY, lessonDate: date } };
        if (r.path === `/auth/org/groups/${lesson.groupId}`) return { json: { id: lesson.groupId, name: lesson.groupName, status: "active", teacher_id: TEACHER.id, class_level: 7, student_count: STUDENTS.length, students: STUDENTS } };
        return /\/attendance(\?|$)/.test(r.path + (r.query ? `?${r.query}` : "")) ? { json: JOURNAL } : null;
      });
      const { page, calls, errors } = run;
      await page.waitForSelector('p:has-text("Отмена ждёт подтверждения")', { timeout: 8000 });
      assert.equal(plain(await page.textContent('[data-testid="panel-reported-by"]')), "Сообщил: Эргашев К., преподаватель", date);
      const button = page.locator('[data-testid="panel-withdraw"]');
      assert.equal(await button.count(), canWithdraw ? 1 : 0, date);
      if (canWithdraw) {
        assert.equal(await button.getAttribute("aria-label"), "Отозвать отмену урока: Математика 7, пн, 23.11, 10:00–11:30", "named by the lesson (the one name of a lesson)");
        await button.click();
        await page.waitForFunction(() => window.__log.some((line) => line.startsWith("withdrawn:")));
        assert.deepEqual(calls.filter((c) => WITHDRAW.test(c.path)).map((c) => c.body), [{ lessonId: lesson.id, lessonDate: date, expectedKind: "unconfirmed" }]);
      }
      const probe = await page.evaluate(layoutProbe, "body");
      assert.deepEqual([probe.bad, probe.scroll > 0], [[], false], date);
      assert.deepEqual(noise(errors), [], date);
      await page.close();
    }
  });
}

// ── Э9: «Вернуть урок» in the panel of an entry of the history ───────────────────────────────────────────────────────────────────────────────────────────

async function openHistoryPanel(server, rowFilter, { user = OWNER, width = 1280 } = {}) {
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", server, { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
  await run.page.evaluate(([who]) => window.mount("substitutions", who, { role: "owner" }), [user]);
  await run.page.click('[role="tab"]:has-text("История")');
  await run.page.waitForSelector('[data-testid="audit-row"]');
  await run.page.locator('[data-testid="audit-row"]').filter(rowFilter).first().locator('[data-testid="audit-details"]').click();
  await run.page.waitForSelector('[data-testid="audit-panel"]');
  return run;
}
const RETURN_PATH = /\/attendance\/return/;

test("«Вернуть урок» follows canReturn of the server: the entry of a held lesson (true) has it; «добавил урок в расписание» (null) has neither the button nor a request for the money; a failed preview is SAID and the button is not shown", async () => {
  const history = answer("history");
  const held = history.items.find((row) => row.source === "audit" && row.kind === "backdated");
  assert.equal(held.canReturn, true);
  const added = history.items.find((row) => row.source === "audit" && row.kind === "lesson_added");
  assert.equal(added.canReturn, null);
  // 1. the real entry of a held lesson: the preview is the real dry run, the button is there
  const ok = await openHistoryPanel(listServer({ extra: (r) => (r.method === "POST" && RETURN_PATH.test(r.path) ? { json: answer("dry_run_return_payroll") } : null) }), { hasText: "Задним числом" });
  await ok.page.waitForSelector('[data-testid="panel-salary"]');
  assert.equal(await ok.page.locator('[data-testid="audit-return"]').count(), 1);
  assert.equal(await ok.page.locator('[data-testid="panel-return-error"]').count(), 0);
  await ok.page.close();
  // 2. the entry that is not a held lesson: no button, no dry run at all
  const addedRun = await openHistoryPanel(listServer(), { hasText: "Добавил урок в расписание" });
  assert.equal(await addedRun.page.locator('[data-testid="audit-return"]').count(), 0);
  assert.equal(addedRun.calls.filter((c) => RETURN_PATH.test(c.path)).length, 0);
  await addedRun.page.close();
  // 3. the preview fails (the server is down / refuses): the panel says it, «Вернуть урок» is not offered
  for (const [label, result] of [["500", { status: 500, json: { detail: { code: "INTERNAL", message: "Сервис временно недоступен" } } }], ["409", { status: 409, json: answer("confirm_period_closed_409") }]]) {
    const bad = await openHistoryPanel(listServer({ extra: (r) => (r.method === "POST" && RETURN_PATH.test(r.path) ? result : null) }), { hasText: "Задним числом" });
    await bad.page.waitForSelector('[data-testid="panel-return-error"]');
    assert.ok(plain(await bad.page.textContent('[data-testid="panel-return-error"]')).length > 10, label);
    assert.equal(await bad.page.locator('[data-testid="audit-return"]').count(), 0, `${label}: no button over a preview that failed`);
    assert.equal(await bad.page.locator('[data-testid="panel-salary"]').count(), 0, label);
    await bad.page.close();
  }
});

test("canReturn false (the month is closed / the caller has no right): the panel offers no «Вернуть урок» and asks the server for nothing", async () => {
  const history = answer("history");
  const locked = { ...history, items: history.items.map((row) => (row.source === "audit" && row.kind === "backdated" ? { ...row, canReturn: false } : row)) };   // the server says false for the entries of a closed month: the one field changed
  const run = await openHistoryPanel(listServer({ decided: locked }), { hasText: "Задним числом" });
  assert.equal(await run.page.locator('[data-testid="audit-return"]').count(), 0);
  assert.equal(run.calls.filter((c) => RETURN_PATH.test(c.path)).length, 0);
  await run.page.close();
});

test("after «Вернуть урок» from the history the toast carries the money consequence like the journal's (the lines of the server's answer) and the list and the badge are read again", async () => {
  const dry = answer("dry_run_return_payroll");
  const run = await openHistoryPanel(listServer({ extra: (r) => (r.method === "POST" && RETURN_PATH.test(r.path) ? { json: r.body && r.body.dryRun ? dry : { ...dry, dryRun: false, status: "in_progress", changed: true } } : null) }), { hasText: "Задним числом" });
  const { page, calls } = run;
  await page.waitForSelector('[data-testid="panel-salary"]');
  const lists = () => calls.filter((c) => c.method === "GET" && c.path === "/auth/org/substitutions").length;
  const before = lists();
  await page.click('[data-testid="audit-return"]');
  await page.waitForSelector("#lesson-return-reason");
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"], [data-testid="money-effects-none"]');
  await page.fill("#lesson-return-reason", "Урок не проводился, отметили по ошибке");
  await page.click('[data-testid="lesson-return-submit"]');
  await page.waitForSelector("text=Урок");
  await until(() => calls.some((c) => RETURN_PATH.test(c.path) && c.body && !c.body.dryRun), "the real return was sent");
  await until(() => lists() > before, "the list is read again");
  const toast = plain(await page.textContent("body"));
  assert.match(toast, /возвращён/, "the toast names the return");
  assert.ok(/зарплат|Ведомост|ведомост/.test(toast), "the toast carries what the return does to the salary (the effect lines of the answer)");
  await page.close();
});
