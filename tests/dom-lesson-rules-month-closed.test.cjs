// LESSON-RULES C10 / п.7: a CLOSED month on the screens of the teacher, on the server's own answers - the journal of October (journal_teacher_month_closed) and the panel of a lesson of the schedule
// (schedule_teacher_month_closed / schedule_teacher): «Месяц закрыт — обратитесь к владельцу», no buttons of the teacher.  1280 and 375.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { answer, WORLD_DAY, plain } = require("./helpers/lesson-rules-answers.cjs");

const ctx = setup(test);
const TEACHER = { id: "42110e14-fb74-5185-9f18-4ab04bd042da", role: "teacher", org_role: "teacher" };
const MONTH_CLOSED = "Месяц закрыт — обратитесь к владельцу";
const noise = (errors) => errors.filter((text) => !/404|Failed to load resource|409|422|500/.test(text));
const STUDENTS = answer("dry_run_confirm_centre").deductions.map((d, index) => {
  const [last, first] = d.name.split(" ");
  return { id: d.studentId, first_name: first, last_name: last, full_name: d.name, class_level: 7, status: "active", display_id: `AL7-00${index + 1}`, student_phone: null, joined_at: "2026-09-01", last_theta: null, last_level: null };
});

for (const width of [1280, 375]) {
  test(`${width}: the journal of a CLOSED month (the real answer, monthClosed true on every lesson) gives the teacher nothing to do: no menu of a column, no «Отметить», no «Завершить», no «Урока не было»; the page does not scroll`, async () => {
    const journal = answer("journal_teacher_month_closed");
    assert.ok(journal.lessons.length > 0 && journal.lessons.every((l) => l.monthClosed === true && l.canActSelf === false && l.windowDays === 7));
    const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", (r) => (/\/attendance(\?|$)/.test(r.path + (r.query ? `?${r.query}` : "")) ? { json: journal } : null), { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
    const { page, errors } = run;
    await page.evaluate(([user, props]) => window.mount("journal", user, props), [TEACHER, { groupId: journal.groupId, students: STUDENTS, adminMode: false, month: "2026-10" }]);
    await page.waitForSelector('th[data-lesson-key="2026-10-05_lesson-mon"]');
    await page.waitForTimeout(900);
    assert.equal(plain(await page.textContent('[data-testid="journal-month-closed"]')), MONTH_CLOSED, "ONE line over the table says why there is nothing to do");
    assert.equal(await page.locator('[data-testid="journal-month-closed"]').count(), 1);
    assert.equal(await page.locator("[data-column-menu-trigger]").count(), 0, "no menu of a column");
    for (const word of ["Отметить посещаемость", "Исправить отметки", "Завершить", "Урока не было", "Вернуть урок"]) assert.equal(await page.locator(`button:has-text("${word}"), [role="menuitem"]:has-text("${word}")`).count(), 0, word);
    const probe = await page.evaluate(layoutProbe, "body");
    assert.equal(probe.scroll > 0, false);
    assert.deepEqual(noise(errors), []);
    await page.close();
  });

  test(`${width}: a HELD lesson of a closed month - the menu of its column says «Месяц закрыт — обратитесь к владельцу» as a locked item, the action «Исправить отметки» is not offered (the real November journal; only the flag monthClosed of the lesson of 02.11 is raised - the October answer of the server has no held lesson)`, async () => {
    const journal = JSON.parse(JSON.stringify(answer("journal_teacher")));
    const held = journal.lessons.find((l) => l.date === "2026-11-02");
    assert.equal(held.monthClosed, false);
    held.monthClosed = true;
    const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", (r) => (/\/attendance(\?|$)/.test(r.path + (r.query ? `?${r.query}` : "")) ? { json: journal } : null), { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
    const { page, errors } = run;
    await page.evaluate(([user, props]) => window.mount("journal", user, props), [TEACHER, { groupId: journal.groupId, students: STUDENTS, adminMode: false }]);
    await page.waitForSelector('th[data-lesson-key="2026-11-02_lesson-mon"]');
    await page.waitForTimeout(900);
    await page.locator('th[data-lesson-key="2026-11-02_lesson-mon"] [data-column-menu-trigger]').evaluate((el) => el.click());
    await page.waitForSelector('[data-testid="menu-teacher-locked"]');
    assert.equal(await page.locator('[data-testid="journal-month-closed"]').count(), 1, "and the line over the table (a lesson of the month is closed)");
    const item = plain(await page.textContent('[data-testid="menu-teacher-locked"]'));
    assert.match(item, /Исправить отметки/);
    assert.ok(item.includes(MONTH_CLOSED), item);
    assert.equal(await page.getAttribute('[data-testid="menu-teacher-locked"]', "aria-disabled"), "true");
    assert.equal(await page.locator('[role="menuitem"]:has-text("Исправить отметки")').count(), 1, "the one item is the locked one");
    assert.deepEqual(noise(errors), []);
    await page.close();
  });

  test(`${width}: the panel of a lesson of the schedule in a CLOSED month (the real schedule of October): ONE line «Месяц закрыт — обратитесь к владельцу», no «Начать», no «Урока не было», no marks; a lesson older than the window (the real schedule of November) has the sentence of the window`, async () => {
    const october = answer("schedule_teacher_month_closed").find((o) => o.occurrenceDate === "2026-10-05");
    const november = answer("schedule_teacher");
    const old = november.find((o) => o.occurrenceDate === "2026-11-09");   // the lesson that waits for a mark and is older than the window of 7 days (the held lesson of 02.11 says «Урок завершён» instead)
    assert.deepEqual([old.canActSelf, old.monthClosed, old.windowDays], [false, false, 7]);
    assert.ok(october && old);
    for (const [lesson, line] of [[october, MONTH_CLOSED], [old, "Урок старше 7 дн. — его закрывает администратор или владелец."]]) {
      const groups = [{ id: lesson.groupId, name: lesson.groupName, status: "active", teacher_id: TEACHER.id, class_level: 7, student_count: 9, subject: "math" }];
      const journal = lesson === october ? answer("journal_teacher_month_closed") : answer("journal_teacher");   // the panel reads the journal of the group as the real screen does
      const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", (r) => {
        if (r.path === `/auth/org/groups/${lesson.groupId}`) return { json: { id: lesson.groupId, name: lesson.groupName, status: "active", teacher_id: TEACHER.id, class_level: 7, student_count: STUDENTS.length, students: STUDENTS } };   // the roster of the group (the screen reads it before the journal)
        return /\/attendance(\?|$)/.test(r.path + (r.query ? `?${r.query}` : "")) ? { json: journal } : null;
      }, { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
      const { page, errors } = run;
      await page.evaluate(([user, props]) => window.mount("lesson-panel", user, props), [TEACHER, { lesson, groups }]);
      await page.waitForSelector(`[role="status"]:has-text("${line.slice(0, 12)}")`, { timeout: 8000 }).catch(async (e) => { throw new Error(`${e.message} :: ${plain(await page.textContent("body")).slice(0, 500)}`); });
      const lock = page.locator('[role="status"]', { hasText: line });
      assert.equal(await lock.count(), 1, "ONE line of the lock");
      assert.equal(plain(await lock.textContent()), line);
      for (const word of ["Начать урок", "Урока не было", "Завершить урок", "Сохранить отметки", "Разобрать"]) assert.equal(await page.locator(`button:has-text("${word}")`).count(), 0, word);
      const probe = await page.evaluate(layoutProbe, "body");
      assert.deepEqual([probe.bad, probe.scroll > 0], [[], false]);
      assert.deepEqual(noise(errors), []);
      await page.close();
    }
  });
}
