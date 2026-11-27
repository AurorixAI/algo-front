// LESSON-RULES C10 / Э3 / Э4: the journal of a group for a TEACHER on the server's own answers (journal_teacher.json): the flags of the window of every lesson (`canActSelf`, `monthClosed`, `windowDays`)
// decide what he is offered; a refusal about a decided excuse (EXCUSE_DECIDED) belongs to ONE mark.  1280 / 1024 / 375.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { answer, WORLD_DAY, WORLD_TEACHER_ID, plain } = require("./helpers/lesson-rules-answers.cjs");

const ctx = setup(test);
const JOURNAL = answer("journal_teacher");
const TEACHER = { id: WORLD_TEACHER_ID, role: "teacher", org_role: "teacher" };
const STUDENTS = answer("dry_run_confirm_centre").deductions.map((d, index) => {
  const [last, first] = d.name.split(" ");
  return { id: d.studentId, first_name: first, last_name: last, full_name: d.name, class_level: 7, status: "active", display_id: `AL7-00${index + 1}`, student_phone: null, joined_at: "2026-09-01", last_theta: null, last_level: null };
});
const noise = (errors) => errors.filter((text) => !/404|Failed to load resource|409|422|500/.test(text));
/** Waits (with a limit) for a state of the calls the test wrote down - no fixed pause. */
async function until(condition, limitMs = 5000) {
  const stop = Date.now() + limitMs;
  while (!condition() && Date.now() < stop) await new Promise((resolve) => setTimeout(resolve, 25));
}
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
  return run;
}

for (const width of [1280, 1024, 375]) {
  test(`${width}: a held lesson older than the window (canActSelf false, windowDays 7): no «Исправить отметки» for the teacher - the menu says why in the words of the window`, async () => {
    const { page, errors } = await open(width);
    const old = JOURNAL.lessons.find((l) => l.date === "2026-11-02");
    assert.deepEqual([old.canActSelf, old.monthClosed, old.windowDays], [false, false, 7]);
    await page.click(MENU_OLD);   // the ordinary press: at 375 too the «⋯» of the first column is on the screen
    await page.waitForSelector('[data-testid="menu-teacher-locked"]');
    const item = plain(await page.textContent('[data-testid="menu-teacher-locked"]'));
    assert.match(item, /Исправить отметки/);
    assert.match(item, /Урок старше 7 дн\. — его закрывает администратор или владелец\./);
    assert.equal(await page.locator('[role="menuitem"]:has-text("Исправить отметки")').count(), 1, "the one item is the locked one, not an action");
    assert.equal(await page.getAttribute('[data-testid="menu-teacher-locked"]', "aria-disabled"), "true");
    const probe = await page.evaluate(layoutProbe, "body");
    assert.equal(probe.scroll > 0, false, "the table scrolls inside its own box, the page does not");
    assert.equal(await page.locator('[data-testid="journal-month-closed"]').count(), 0, "an open month (the real journal of November) has no such line");
    assert.deepEqual(noise(errors), []);
    await page.close();
  });
}

for (const width of [1280, 375]) {
  test(`${width}: the lessons given back after a cancellation (the real journal, С11.19: no substitutionOutcome on them) have no chip «Урок отменён»: 02.11 is «Завершён» and «Оформлен задним числом», 09.11 is «Не отмечен»; a lesson that IS cancelled keeps «Не состоялся»`, async () => {
    const { page } = await open(width);
    const header = async (key) => plain(await page.textContent(`th[data-lesson-key="${key}"]`));
    for (const key of ["2026-11-02_lesson-mon", "2026-11-09_lesson-mon"]) {
      const lesson = JOURNAL.lessons.find((l) => `${l.date}_${l.id}` === key);
      assert.equal(lesson.substitutionOutcome ?? null, null, "the real answer: nothing is said about a cancellation");
    }
    const held = await header("2026-11-02_lesson-mon");
    assert.match(held, /Завершён/);
    assert.match(held, /Оформлен задним числом/);
    assert.ok(!held.includes("Урок отменён"), held);
    const waiting = await header("2026-11-09_lesson-mon");
    assert.match(waiting, /Не отмечен/);
    assert.ok(!waiting.includes("Урок отменён"), waiting);
    assert.ok(!waiting.includes("Завершён"), waiting);
    const cancelled = await header("2026-11-16_lesson-mon");
    assert.match(cancelled, /Не состоялся/, "a lesson that is really cancelled says so");
    await page.close();
  });
}

test("375: the journal of a group on a phone - the first column of a lesson is wholly on the screen: its head does not cut a chip, the «⋯» lies inside the window and opens the menu with an ordinary press (no scroll that closes it); the names of the students are wrapped, not cut", async () => {
  const { page, errors } = await open(375);
  const geometry = await page.evaluate(() => {
    const th = document.querySelector('th[data-lesson-key="2026-11-02_lesson-mon"]');
    const box = th.getBoundingClientRect();
    const trigger = th.querySelector("[data-column-menu-trigger]").getBoundingClientRect();
    const chips = [...th.querySelectorAll("span, div")].filter((el) => el.children.length === 0 && /Оформлен|Завершён/.test(el.textContent)).map((el) => { const r = el.getBoundingClientRect(); return { text: el.textContent.trim(), width: r.width, left: Math.round(r.left), right: Math.round(r.right), clipped: el.scrollWidth > el.clientWidth + 1 }; }).filter((chip) => chip.width > 20);   // the visible words (the hint text of a chip is not on the screen)
    const sticky = document.querySelector("tbody tr td").getBoundingClientRect();
    const name = document.querySelector("tbody tr td p.break-words");
    return { viewport: window.innerWidth, th: [Math.round(box.left), Math.round(box.right)], trigger: [Math.round(trigger.left), Math.round(trigger.right), Math.round(trigger.width), Math.round(trigger.height)], chips, sticky: Math.round(sticky.width), nameClipped: name.scrollWidth > name.clientWidth + 1 };
  });
  assert.ok(geometry.th[1] <= geometry.viewport, `the whole first column is inside the window: ${JSON.stringify(geometry.th)}`);
  assert.ok(geometry.trigger[0] >= 0 && geometry.trigger[1] <= geometry.viewport, `«⋯» is inside the window: ${JSON.stringify(geometry.trigger)}`);
  assert.ok(geometry.trigger[2] >= 40 && geometry.trigger[3] >= 40, "and it is a 40 px target");
  assert.ok(geometry.chips.length >= 2);
  for (const chip of geometry.chips) assert.ok(chip.left >= geometry.th[0] && chip.right <= geometry.th[1] && !chip.clipped, `a chip is not cut: ${JSON.stringify(chip)}`);
  assert.ok(geometry.sticky <= 150, `the column of the students does not eat the screen: ${geometry.sticky}`);
  assert.equal(geometry.nameClipped, false, "a name is wrapped, not cut");
  await page.click(MENU_OLD);
  await page.waitForSelector('[data-testid="menu-teacher-locked"]');
  await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-testid="menu-teacher-locked"]').count(), 1, "the menu stays open after an ordinary press");
  assert.deepEqual(noise(errors), []);
  await page.close();
});

test("a lesson that is cancelled or still to come has no lock line: the flags matter for a held lesson only; a cancellation the teacher may take back (canWithdraw true) has the one action «Отозвать отмену»", async () => {
  const { page } = await open(1280);
  // the real journal: 11.11 and 16.11 are decided, 18.11 waits but its window passed (canWithdraw false): no «⋯»; 23.11 waits and the server says canWithdraw true: the «⋯» holds ONE action
  for (const key of ["2026-11-11_lesson-wed", "2026-11-16_lesson-mon", "2026-11-18_lesson-wed"]) {
    assert.equal(await page.locator(`th[data-lesson-key="${key}"] [data-column-menu-trigger]`).count(), 0, key);
  }
  const waiting = JOURNAL.lessons.filter((l) => l.waiting === true);
  assert.deepEqual(waiting.map((l) => [l.date, l.canWithdraw]), [["2026-11-18", false], ["2026-11-23", true]], "the real answer");
  const trigger = page.locator('th[data-lesson-key="2026-11-23_lesson-mon"] [data-column-menu-trigger]');
  assert.equal(await trigger.count(), 1);
  await trigger.evaluate((el) => el.click());
  const items = await page.locator('[role="menuitem"]').allTextContents();
  assert.equal(items.length, 1, "the one action");
  assert.ok(plain(items[0]).startsWith("Отозвать отмену"), items[0]);
  assert.equal(await page.getAttribute('[data-testid="menu-withdraw"]', "aria-label"), "Отозвать отмену урока: Математика 7, пн, 23.11, 10:00–11:30", "named by the lesson (the one name of a lesson, lessonLabel)");
  await page.close();
});

for (const width of [1280, 375]) {
  test(`${width}: «Отозвать отмену» in the column of the journal: the server's road with the lesson and expectedKind, a toast, the journal and the badge are read again`, async () => {
    const run = await open(width, (r) => {
      if (r.method === "POST" && /\/lessons\/withdraw-cancellation$/.test(r.path)) return { json: { ok: true, restored: true, lessonId: "lesson-mon", lessonDate: "2026-11-23", previousKind: "unconfirmed", returnedToReview: true } };
      return null;
    });
    const { page, calls } = run;
    const before = calls.filter((c) => /\/attendance$/.test(c.path) && c.method === "GET").length;
    await page.locator('th[data-lesson-key="2026-11-23_lesson-mon"] [data-column-menu-trigger]').evaluate((el) => el.click());
    await page.click('[data-testid="menu-withdraw"]');
    await page.waitForSelector("text=Отмена отозвана");
    const sent = calls.filter((c) => c.method === "POST" && /withdraw-cancellation/.test(c.path));
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].body, { lessonId: "lesson-mon", lessonDate: "2026-11-23", expectedKind: "unconfirmed" });
    await until(() => calls.filter((c) => /\/attendance$/.test(c.path) && c.method === "GET").length > before);
    assert.ok(calls.filter((c) => /\/attendance$/.test(c.path) && c.method === "GET").length > before, "the journal is read again");
    assert.ok(calls.some((c) => /\/substitutions\/summary/.test(c.path)), "the badge of «Замены» is read again");
    await page.close();
  });
}

test("«Отозвать отмену» refused by the server (the real ALREADY_DECIDED of the road): the toast says the server's sentence, the journal is read again, nothing is sent twice", async () => {
  const real = answer("refusals").already_decided;
  const run = await open(1280, (r) => (r.method === "POST" && /withdraw-cancellation/.test(r.path) ? { status: 409, json: real } : null));
  const { page, calls } = run;
  const before = calls.filter((c) => /\/attendance$/.test(c.path) && c.method === "GET").length;
  await page.locator('th[data-lesson-key="2026-11-23_lesson-mon"] [data-column-menu-trigger]').evaluate((el) => el.click());
  await page.click('[data-testid="menu-withdraw"]');
  await page.waitForSelector(`text=${real.detail.message}`);
  assert.equal(calls.filter((c) => c.method === "POST" && /withdraw-cancellation/.test(c.path)).length, 1);
  await until(() => calls.filter((c) => /\/attendance$/.test(c.path) && c.method === "GET").length > before);
  assert.ok(calls.filter((c) => /\/attendance$/.test(c.path) && c.method === "GET").length > before, "the journal is read again after the refusal: the lesson is no longer waiting for him");
  await page.close();
});

test("the head of the column of a waiting cancellation says WHO wrote it by the words of the server (reportedBy, reportedByRole), never «Преподаватель сообщил» of its own", async () => {
  const { page } = await open(1280);
  const hint = await page.getAttribute('th[data-lesson-key="2026-11-23_lesson-mon"]', "title");
  assert.equal(hint, "Сообщил: Эргашев К., преподаватель. Отмену подтвердит владелец или администратор с доступом к деньгам");
  assert.ok(!/Преподаватель сообщил/.test(hint));
  await page.close();
});

test("EXCUSE_DECIDED (the real refusal) belongs to ONE mark: the administrator corrects a held lesson, the server refuses - the cell of that student is outlined, the sentence of the server stands over the table as an information, with the student", async () => {
  // the real refusal, as the server gave it: the student is of THIS group («Математика 7»), the answer is not touched
  const real = answer("refusals").excuse_decided;
  const refusal = real;
  const mine = STUDENTS.find((student) => student.id === real.detail.studentId);
  assert.equal(mine.full_name, real.detail.studentName, "the student of the refusal is on the roster of the journal");
  const run = await openAs({ id: "owner-1", role: "owner", org_role: "owner" }, 1280, true, (r) => {
    if (r.method === "POST" && /\/attendance\/impact$/.test(r.path)) return { json: answer("attendance_impact") };   // the real answer of the preview of money
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

// A SCROLL OF THE TABLE MUST NOT CLOSE A MENU THE PERSON HAS JUST OPENED (the defect of the full e2e run: on a phone the swipe that brought the column into view - or its momentum - is
// delivered AFTER the press, the menu opened and vanished within 50 ms).  The menu follows its «⋯» while the table or the page moves, and goes only when the «⋯» has left the window.
for (const width of [1280, 375]) {
  test(`${width}: a scroll of the table or a change of the window after the press does not close the column menu - it follows its «⋯»; it goes when the «⋯» is out of the window (a press elsewhere and Esc still close it)`, async () => {
    const { page, errors } = await open(width);
    const frames = (count) => page.evaluate((n) => new Promise((done) => { const step = (left) => (left === 0 ? done() : requestAnimationFrame(() => step(left - 1))); step(n); }), count);
    const geometry = () => page.evaluate(() => {
      const trigger = document.querySelector('th[data-lesson-key="2026-11-02_lesson-mon"] [data-column-menu-trigger]').getBoundingClientRect();
      const th = document.querySelector('th[data-lesson-key="2026-11-02_lesson-mon"]').getBoundingClientRect();
      const menu = document.querySelector('[role="menu"]')?.getBoundingClientRect() ?? null;
      return { viewport: window.innerWidth, triggerRight: trigger.right, headBottom: th.bottom, menu: menu && { left: menu.left, top: menu.top } };
    });
    const expectedLeft = (g) => Math.min(Math.max(8, g.triggerRight - 240), g.viewport - 240 - 8);
    await page.click(MENU_OLD);
    await page.waitForSelector('[role="menu"]');
    const before = await geometry();
    // the table is moved by 24 px after the press (the scroll that began before it is delivered now)
    await page.evaluate(() => { const box = document.querySelector("div.overflow-x-auto"); box.scrollLeft += 24; });
    await frames(3);
    const moved = await geometry();
    assert.notEqual(Math.round(moved.triggerRight), Math.round(before.triggerRight), "the table really moved under the «⋯»");
    assert.equal(await page.locator('[role="menu"]').count(), 1, "the scroll after the press did not close the menu");
    assert.ok(Math.abs(moved.menu.left - expectedLeft(moved)) <= 1.5, `the menu follows its «⋯»: menu ${moved.menu.left}, expected ${expectedLeft(moved)}`);
    assert.ok(Math.abs(moved.menu.top - (moved.headBottom + 6)) <= 1.5, `and stays right under the head of the column: ${moved.menu.top} vs ${moved.headBottom + 6}`);
    // a change of the window (the address bar of a phone, the keyboard) does not close it either
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await frames(2);
    assert.equal(await page.locator('[role="menu"]').count(), 1, "a resize event did not close the menu");
    // the «⋯» leaves the window: the menu would point at nothing - it goes
    await page.evaluate(() => { const box = document.querySelector("div.overflow-x-auto"); box.scrollLeft = box.scrollWidth; });
    await frames(3);
    const gone = await page.evaluate(() => { const r = document.querySelector('th[data-lesson-key="2026-11-02_lesson-mon"] [data-column-menu-trigger]').getBoundingClientRect(); return { out: r.right <= 0 || r.left >= window.innerWidth, menus: document.querySelectorAll('[role="menu"]').length }; });
    if (gone.out) assert.equal(gone.menus, 0, "the «⋯» is out of the window: the menu is closed");
    // the person's own actions still close it: Esc, a press elsewhere
    await page.evaluate(() => { document.querySelector("div.overflow-x-auto").scrollLeft = 0; });
    await frames(2);
    await page.click(MENU_OLD);
    await page.waitForSelector('[role="menu"]');
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="menu"]', { state: "detached" });
    await page.click(MENU_OLD);
    await page.waitForSelector('[role="menu"]');
    await page.mouse.click(width - 4, 4);
    await page.waitForSelector('[role="menu"]', { state: "detached" });
    assert.deepEqual(noise(errors), []);
    await page.close();
  });
}
