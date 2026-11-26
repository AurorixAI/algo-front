// LESSON-RULES C10 / Э3 / Э4: the journal of a group for a TEACHER on the server's own answers (journal_teacher.json): the flags of the window of every lesson (`canActSelf`, `monthClosed`, `windowDays`)
// decide what he is offered; a refusal about a decided excuse (EXCUSE_DECIDED) belongs to ONE mark.  1280 / 1024 / 375.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { answer, WORLD_DAY, plain } = require("./helpers/lesson-rules-answers.cjs");

const ctx = setup(test);
const JOURNAL = answer("journal_teacher");
const TEACHER = { id: "85364d94-c8fb-5916-ae84-9583524e23fd", role: "teacher", org_role: "teacher" };
const STUDENTS = answer("dry_run_confirm_centre").deductions.map((d, index) => {
  const [last, first] = d.name.split(" ");
  return { id: d.studentId, first_name: first, last_name: last, full_name: d.name, class_level: 7, status: "active", display_id: `AL7-00${index + 1}`, student_phone: null, joined_at: "2026-09-01", last_theta: null, last_level: null };
});
const noise = (errors) => errors.filter((text) => !/404|Failed to load resource|409|422|500/.test(text));
const MENU_OLD = 'th[data-lesson-key="2026-11-02_lesson-mon"] [data-column-menu-trigger]';

function serve(extra) {
  return (request) => {
    if (extra) { const out = extra(request); if (out) return out; }
    if (/\/attendance$/.test(request.path) || /\/attendance\?/.test(request.path + (request.query ? `?${request.query}` : ""))) return { json: JOURNAL };
    return null;
  };
}

const open = (width, extra) => openAs(TEACHER, width, false, extra);
async function openAs(who, width, adminMode, extra) {
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", serve(extra), { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
  await run.page.evaluate(([user, props]) => window.mount("journal", user, props), [who, { groupId: JOURNAL.groupId, students: STUDENTS, adminMode }]);
  await run.page.waitForSelector('th[data-lesson-key="2026-11-02_lesson-mon"]');
  await run.page.waitForTimeout(900);   // the journal reads once more after the first draw (a phone): a menu opened before that is closed by it
  return run;
}

for (const width of [1280, 1024, 375]) {
  test(`${width}: a held lesson older than the window (canActSelf false, windowDays 7): no «Исправить отметки» for the teacher - the menu says why in the words of the window`, async () => {
    const { page, errors } = await open(width);
    const old = JOURNAL.lessons.find((l) => l.date === "2026-11-02");
    assert.deepEqual([old.canActSelf, old.monthClosed, old.windowDays], [false, false, 7]);
    await page.locator(MENU_OLD).evaluate((el) => el.click());   // at 375 the «⋯» of the column lies beyond the edge of the screen (the table scrolls inside its box): a click of Playwright scrolls to it and that scroll closes the menu
    await page.waitForSelector('[data-testid="menu-teacher-locked"]');
    const item = plain(await page.textContent('[data-testid="menu-teacher-locked"]'));
    assert.match(item, /Исправить отметки/);
    assert.match(item, /Урок старше 7 дн\. — его закрывает администратор или владелец\./);
    assert.equal(await page.locator('[role="menuitem"]:has-text("Исправить отметки")').count(), 1, "the one item is the locked one, not an action");
    assert.equal(await page.getAttribute('[data-testid="menu-teacher-locked"]', "aria-disabled"), "true");
    const probe = await page.evaluate(layoutProbe, "body");
    assert.equal(probe.scroll > 0, false, "the table scrolls inside its own box, the page does not");
    assert.deepEqual(noise(errors), []);
    await page.close();
  });
}

test("a lesson that is cancelled or still to come has no lock line: the flags matter for a held lesson only", async () => {
  const { page } = await open(1280);
  for (const key of ["2026-11-11_lesson-wed", "2026-11-16_lesson-mon", "2026-11-18_lesson-wed", "2026-11-23_lesson-mon"]) {
    assert.equal(await page.locator(`th[data-lesson-key="${key}"] [data-column-menu-trigger]`).count(), 0, key);
  }
  await page.close();
});

test("EXCUSE_DECIDED (the real refusal) belongs to ONE mark: the administrator corrects a held lesson, the server refuses - the cell of that student is outlined, the sentence of the server stands over the table as an information, with the student", async () => {
  // the unload has this refusal for a student of «Физика 8»: ONLY `studentId` is replaced by a student of this roster so that the cell of the journal can be found (said in the report)
  const real = answer("refusals").excuse_decided;
  const mine = STUDENTS[0];
  const refusal = { detail: { ...real.detail, studentId: mine.id, studentName: mine.full_name } };
  const run = await openAs({ id: "owner-1", role: "owner", org_role: "owner" }, 1280, true, (r) => {
    if (r.method === "POST" && /\/attendance\/impact$/.test(r.path)) return { json: { ok: true, moneyEffects: answer("dry_run_return_payroll").moneyEffects } };   // the money effects of the real family: the preview is not under test
    return r.method === "POST" && /\/attendance$/.test(r.path) ? { status: 409, json: refusal } : null;
  });
  const { page } = run;
  await page.locator(MENU_OLD).evaluate((el) => el.click());   // at 375 the «⋯» of the column lies beyond the edge of the screen (the table scrolls inside its box): a click of Playwright scrolls to it and that scroll closes the menu
  await page.click('[role="menuitem"]:has-text("Исправить отметки")');
  const cell = page.locator(`tr:has-text("${mine.full_name}") td[data-lesson-key], tr:has-text("${mine.full_name}") td`).nth(1);
  await cell.locator("button").first().click();
  await page.click('[role="menuitemradio"]:not([aria-checked="true"])');
  await page.click('button:visible:has-text("Сохранить исправление")');
  await page.fill("#correction-reason", "Исправляю отметку ученика");
  await page.click('[data-testid="correction-submit"]');
  await page.waitForSelector('[data-testid="excuse-decided-notice"]');
  const notice = plain(await page.textContent('[data-testid="excuse-decided-notice"]'));
  assert.ok(notice.includes(mine.full_name) && notice.includes(real.detail.message), notice);
  assert.equal(await page.getAttribute('[data-testid="excuse-decided-notice"]', "data-variant"), "info", "an information, not a red error");
  await page.waitForSelector('[data-testid="correction-submit"]', { state: "detached" });
  assert.equal(await page.locator('[data-testid="correction-submit"]').count(), 0, "the window of the correction is closed: the sentence is not said twice, in red");
  assert.equal(await page.locator('td[data-excuse-decided="true"]').count(), 1, "ONE cell is outlined");
  assert.ok(plain(await page.locator('td[data-excuse-decided="true"]').evaluate((el) => el.closest("tr").textContent)).includes(mine.full_name));
  await page.close();
});
