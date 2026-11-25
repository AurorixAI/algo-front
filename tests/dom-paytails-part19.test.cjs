// PAY-TAILS Б11.48 (part 19): the pause from the «⋯» of a row of the roster of a group, in a real browser.  The roster is the REAL answer of the server
// (tests/fixtures/paytails/part19/group_detail_with_pause.json: the first student on a running pause until 30.11.2026, the second without one; the page clock stands on 24.11.2026).
// The table of the analysis (roles × states) is the list of tests below; the words of the menu and of the toasts are the constants / the words of the card of the student (not retyped from the code).
const assert = require("node:assert/strict");
const nodeTest = require("node:test");
const { setup, plain } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { setWorld, dmy, FIXTURE_DAY } = require("./helpers/paytails-part16.cjs");
const { GROUP_FIXTURE, WORLD, ON_PAUSE, FREE, OWNER, ADMIN_MONEY, ADMIN_NO_MONEY, TEACHER, groupServer } = require("./helpers/paytails-part19.cjs");
const { PAUSE_MENU_LABEL, END_PAUSE_MENU_LABEL } = require("./helpers/part19-labels.cjs");

const test = (name, fn) => nodeTest(name, async (t) => { setWorld(FIXTURE_DAY); return fn(t); });
const ctx = setup(nodeTest);
const TRANSFER = "Перевести в другую группу…";
const TRANSFER_NO_RIGHT_TEXT = "Переводить может владелец или администратор с доступом к деньгам.";
const LEAVE = "Убрать из группы…";

/** `touch`: a phone with a touch screen (the menu of a row opens by a TAP - the same way as the test of the leaving in `money2-fix7-leave-undo`). */
async function open(server, { user = OWNER, width = 1280, props = {}, pathname = null, touch = false } = {}) {
  const browser = touch ? { newPage: (options) => ctx.browser.newPage({ ...options, hasTouch: true, isMobile: true }) } : ctx.browser;
  const run = await openPage(browser, "money-b.entry.tsx", server, { width, height: width === 375 ? 812 : 900, today: WORLD });
  if (pathname) await run.page.evaluate((value) => { window.__pathname = value; }, pathname);
  await run.page.evaluate(([who, extra]) => window.mount("groupHeader", who, { refresh: true, ...extra }), [user, props]);
  await run.page.waitForSelector('[data-testid="roster-table"]', { timeout: 8000 }).catch(() => null);
  return run;
}
const rowOf = (page, student) => page.locator(`[data-testid="roster-table"] >> text=${student.full_name}`).first();
const menuButton = (page, student) => page.locator(`button[aria-label="Действия: ${student.full_name}"]`);
async function menuItems(page, student, { tap = false } = {}) {
  if (tap) {
    // the rows settle in an animation of the page: a tap on a moving button misses; the person taps again, the test taps again once
    await page.waitForTimeout(600);
    for (let attempt = 0; attempt < 2 && !(await page.locator('[role="menu"]').count()); attempt += 1) {
      await menuButton(page, student).scrollIntoViewIfNeeded();
      const box = await menuButton(page, student).boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(400);
    }
  } else await menuButton(page, student).click();
  await page.waitForSelector('[role="menu"]');
  return (await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()).map(plain);
}
const closeMenu = async (page) => { await page.keyboard.press("Escape"); await page.waitForSelector('[role="menu"]', { state: "detached" }); };
const chipOf = async (page, student) => {
  const row = page.locator(`[data-testid="roster-table"] a:has-text("${student.full_name}")`).first();
  const chip = row.locator('[data-kind="chip"]');
  return (await chip.count()) ? plain(await chip.innerText()) : null;
};
const groupReads = (run) => run.calls.filter((call) => call.method === "GET" && call.path === "/auth/org/groups/g1").length;
const toasts = async (page) => (await page.locator('[role="status"], [role="alert"]').allInnerTexts()).map(plain);
const dialog = (page) => page.locator('[role="dialog"]');

test("the real answer: the chip is in the row of the student on a pause only (the server's words), «⋯» in both rows", async () => {
  const run = await open(groupServer());
  assert.equal(await chipOf(run.page, ON_PAUSE), "На паузе до 30.11");
  assert.equal(await chipOf(run.page, FREE), null);
  assert.equal(await menuButton(run.page, ON_PAUSE).count(), 1);
  assert.equal(await menuButton(run.page, FREE).count(), 1);
  await run.page.close();
});

for (const [who, user] of [["the owner", OWNER], ["an administrator with the money right", ADMIN_MONEY]]) {
  test(`Б11.48 roles - ${who}: the pause FIRST («Закончить паузу» while a pause runs today, else «Пауза…»), then the transfer, the danger «Убрать из группы…» LAST`, async () => {
    const run = await open(groupServer(), { user });
    assert.deepEqual(await menuItems(run.page, FREE), [PAUSE_MENU_LABEL, TRANSFER, LEAVE]);
    await closeMenu(run.page);
    assert.deepEqual(await menuItems(run.page, ON_PAUSE), [END_PAUSE_MENU_LABEL, TRANSFER, LEAVE]);
    await run.page.close();
  });
}

test("Б11.48 roles - an administrator WITHOUT the money right: no pause item (as the card of the student); the rest of the menu is as before", async () => {
  const run = await open(groupServer(), { user: ADMIN_NO_MONEY });
  for (const student of [FREE, ON_PAUSE]) {
    const items = await menuItems(run.page, student);
    assert.equal(items.length, 2);
    assert.ok(items[0].startsWith(TRANSFER) && items[0].includes(TRANSFER_NO_RIGHT_TEXT), "the transfer is shown off, with the reason");
    assert.equal(items[1], LEAVE);
    assert.ok(!items.some((item) => /паузу|Пауза/.test(item)));
    await closeMenu(run.page);
  }
  await run.page.close();
});

test("Б11.48 roles - a teacher: the roster has no «⋯» at all, the chip stays", async () => {
  const run = await open(groupServer(), { user: TEACHER, props: { workspace: "teacher" }, pathname: "/teacher/groups/g1" });
  assert.equal(await run.page.locator('button[aria-label^="Действия:"]').count(), 0);
  assert.equal(await chipOf(run.page, ON_PAUSE), "На паузе до 30.11");
  await run.page.close();
});

test("Б11.48 an older server (no `membership_id` in the roster): no pause item - nothing to put on pause; the transfer and leaving still work", async () => {
  const run = await open(groupServer({ withoutMembershipId: true }));
  assert.deepEqual(await menuItems(run.page, FREE), [TRANSFER, LEAVE]);
  await closeMenu(run.page);
  assert.deepEqual(await menuItems(run.page, ON_PAUSE), [TRANSFER, LEAVE]);
  assert.equal(await chipOf(run.page, ON_PAUSE), "На паузе до 30.11", "the chip comes from on_pause / paused_until, it does not need the id");
  await run.page.close();
});

test("Б11.48 an archived group: rows without «⋯», so no pause either", async () => {
  const run = await open(groupServer({ answer: { ...GROUP_FIXTURE, status: "archived" } }));
  assert.equal(await run.page.locator('button[aria-label^="Действия:"]').count(), 0);
  await run.page.close();
});

test("Б11.48 the window of the row is the window of the card: «Пауза ученика», «Ученик · Группа», the memberships of THIS row; after the write the toast has the words of the card and the roster is read again (the chip, the item)", async () => {
  const server = groupServer();
  const run = await open(server);
  const reads = groupReads(run);
  await menuItems(run.page, FREE);
  await run.page.getByRole("menuitem", { name: PAUSE_MENU_LABEL }).click();
  await run.page.waitForSelector("#pause-first");
  assert.equal(plain(await dialog(run.page).locator("h2, [data-modal-part=\"title\"]").first().innerText()).includes("Пауза"), true);
  assert.ok(plain(await dialog(run.page).innerText()).includes(`${FREE.full_name} · ${GROUP_FIXTURE.name}`));
  assert.ok(run.calls.some((call) => call.method === "GET" && call.path === `/auth/org/memberships/${FREE.membership_id}/pauses`), "the pauses of the membership of THIS student were asked");
  assert.equal(run.calls.some((call) => call.path === `/auth/org/memberships/${ON_PAUSE.membership_id}/pauses` && call.method === "GET"), false, "the other student's memberships are not touched");
  await run.page.fill("#pause-first", dmy("2026-11-24"));
  await run.page.fill("#pause-last", dmy("2026-11-30"));
  await run.page.waitForSelector('[data-testid="pause-calc-wrap"]');
  await run.page.getByRole("button", { name: "Поставить на паузу" }).click();
  await run.page.waitForSelector('[role="dialog"]', { state: "detached" });
  assert.ok((await toasts(run.page)).some((text) => /^Пауза поставлена: /.test(text)), "the same text as from the card of the student");
  await run.page.waitForFunction(() => document.querySelectorAll('[data-testid="roster-table"] [data-kind="chip"]').length === 2);
  assert.ok(groupReads(run) > reads, "the roster is read again");
  assert.equal(await chipOf(run.page, FREE), "На паузе до 30.11");
  assert.deepEqual((await menuItems(run.page, FREE))[0], END_PAUSE_MENU_LABEL);
  await run.page.close();
});

test("Б11.48 a pause that began TODAY (just set) is taken off whole with a reason: «Закончить паузу» -> «Снять паузу целиком» -> the toast «Пауза снята», the chip is gone, the item is «Пауза…» again", async () => {
  const run = await open(groupServer());
  await menuItems(run.page, FREE);
  await run.page.getByRole("menuitem", { name: PAUSE_MENU_LABEL }).click();
  await run.page.fill("#pause-first", dmy("2026-11-24"));
  await run.page.fill("#pause-last", dmy("2026-11-30"));
  await run.page.waitForSelector('[data-testid="pause-calc-wrap"]');
  await run.page.getByRole("button", { name: "Поставить на паузу" }).click();
  await run.page.waitForSelector('[role="dialog"]', { state: "detached" });
  await run.page.waitForFunction(() => document.querySelectorAll('[data-testid="roster-table"] [data-kind="chip"]').length === 2);
  await menuItems(run.page, FREE);
  await run.page.getByRole("menuitem", { name: END_PAUSE_MENU_LABEL }).click();
  const card = run.page.locator('[data-testid="pause-card"]');
  await card.waitFor();
  assert.equal(await card.getByRole("button", { name: "Закончить сегодня" }).count(), 0, "began today: it cannot be ended «yesterday»");
  await card.getByRole("button", { name: "Снять паузу целиком" }).click();
  await run.page.waitForSelector('[data-testid="pause-money"]');
  await run.page.fill("#pause-act-reason", "ученик передумал");
  await run.page.locator('[data-testid="pause-card-acting"]').getByRole("button", { name: "Снять паузу целиком" }).click();
  await run.page.waitForSelector('[role="dialog"]', { state: "detached" });
  await run.page.waitForFunction(() => document.querySelectorAll('[data-testid="roster-table"] [data-kind="chip"]').length === 1);
  assert.equal(await chipOf(run.page, FREE), null);
  assert.ok((await toasts(run.page)).includes("Пауза снята"), "the toast says what the card says");
  assert.equal((await menuItems(run.page, FREE))[0], PAUSE_MENU_LABEL);
  await run.page.close();
});

test("Б11.48 a running pause is ended from the row: «Закончить паузу» -> «Закончить сегодня» -> «Закончить паузу» (main) -> the toast of the card, the chip is gone, the item is «Пауза…»", async () => {
  const run = await open(groupServer());
  const reads = groupReads(run);
  await menuItems(run.page, ON_PAUSE);
  await run.page.getByRole("menuitem", { name: END_PAUSE_MENU_LABEL }).click();
  const card = run.page.locator('[data-testid="pause-card"]');
  await card.waitFor();
  await card.getByRole("button", { name: "Закончить сегодня" }).click();
  await run.page.waitForSelector('[data-testid="pause-money"]');
  await run.page.locator('[data-testid="pause-card-acting"]').getByRole("button", { name: "Закончить паузу", exact: true }).click();
  await run.page.waitForSelector('[role="dialog"]', { state: "detached" });
  await run.page.waitForFunction(() => document.querySelectorAll('[data-testid="roster-table"] [data-kind="chip"]').length === 0);
  assert.ok((await toasts(run.page)).some((text) => text.startsWith("Пауза закончена")));
  assert.ok(groupReads(run) > reads);
  assert.equal((await menuItems(run.page, ON_PAUSE))[0], PAUSE_MENU_LABEL);
  await run.page.close();
});

test("Б11.48 the window is closed without a write («Отмена»): no toast, the roster is not read again, the chip stays as it was", async () => {
  const run = await open(groupServer());
  const reads = groupReads(run);
  await menuItems(run.page, FREE);
  await run.page.getByRole("menuitem", { name: PAUSE_MENU_LABEL }).click();
  await run.page.waitForSelector("#pause-first");
  await run.page.getByRole("button", { name: "Отмена" }).click();
  await run.page.waitForSelector('[role="dialog"]', { state: "detached" });
  assert.equal(groupReads(run), reads);
  assert.equal(run.calls.filter((call) => call.method !== "GET" && /pauses/.test(call.path) && !/dry_run=true/.test(call.query)).length, 0);
  await run.page.close();
});

test("Б11.48 375: the menu of a row on a phone has the same items and fits the screen; the items are tappable", async () => {
  const run = await open(groupServer(), { width: 375, touch: true });
  const items = await menuItems(run.page, FREE, { tap: true });
  assert.deepEqual(items, [PAUSE_MENU_LABEL, TRANSFER, LEAVE]);
  const box = await run.page.locator('[role="menu"]').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 375, `the menu is inside the screen: ${JSON.stringify(box)}`);
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no horizontal scroll");
  await run.page.close();
});
