// Money-2 fix 7 (LESSONS 139: one action - one rule at every entrance): a student who comes back the day of the leaving (`leave_undo.undone` in the dry run) sees the SAME note of the server
// at every entrance of the enrolment - the card of a student with groups and without, the drawer «Зачислить учеников» of the group page (one and several chosen) - and none of the fields the
// server refuses then (`LEAVE_UNDO_NO_START`): «Оплата с», the opening balance and the individual price are not offered, one line says why.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, OWNER } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const X = require("./helpers/money2-fix7.cjs");
const { F } = X;

const ctx = setup(test);
const FIXED = '[data-testid="leave-undo-fixed"]';
const FIXED_TEXT = "уход отменяется — дата начала оплаты, остаток и индивидуальная цена не меняются";
const pick = (page) => page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
const posts = (calls) => calls.filter((c) => c.method === "POST" && !X.isDry(c));
const ADMIN_FIELDS = /Оплата с|Остаток на начало|Индивидуальная цена|Своя цена/i;

for (const [label, props] of [
  ["a student with groups (mode add)", { mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"] }],
  ["a student WITHOUT groups (first enrolment)", { mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] }],
]) {
  test(`card of a student, ${label}: the note of the server stands, the fields that do not act are not offered, one line says why, nothing of them is sent`, async () => {
    const run = await mount(ctx, X.modalServer({ undone: true }), "assign", OWNER, { moneyAvailable: true, groupsBasePath: "/owner/groups", ...props });
    await pick(run.page);
    await run.page.waitForSelector('[data-testid="leave-undo"]');
    const dialog = plain(await run.page.locator('[role="dialog"]').evaluate((el) => el.innerText));
    assert.ok(dialog.includes("Ученик вернулся в день ухода — уход отменён"), "the server's sentence");
    assert.ok(dialog.includes("Прощение долга, отменённое при уходе, не возвращено"), "the forgiveness is said");
    assert.equal(plain(await run.page.locator(FIXED).textContent()), FIXED_TEXT);
    assert.equal(await run.page.locator("#assign-group-pay-from, [data-testid=\"pay-from\"]").count(), 0, "no «Оплата с»");
    assert.equal(await run.page.locator('[id^="assign-group-opening"]').count(), 0, "no opening balance");
    assert.equal(await run.page.locator('button[role="switch"]:has-text("Индивидуальная цена")').count(), 0, "no individual price");
    const withoutNotes = dialog.replace(/Ученик вернулся[^]*?(?=Индивидуальная цена 300|$)/, "").replace(FIXED_TEXT, "");
    assert.doesNotMatch(withoutNotes, /Оплата с|Остаток на начало/);
    await run.page.waitForSelector('[data-testid="assign-submit"]:not([disabled])');
    await run.page.click('[data-testid="assign-submit"]');
    await run.page.waitForSelector('[data-testid="assign-done"]');
    const body = posts(run.calls).find((c) => c.path === "/auth/org/groups/gt/students/st1").body ?? {};
    for (const key of ["pay_from", "opening_balance", "price_override"]) assert.equal(body[key], undefined, `${key} is not sent`);
    await run.page.close();
  });
}

test("card of a student WITHOUT groups: an ordinary first enrolment keeps «Оплата с» and the price (nothing changed for it), no note", async () => {
  const run = await mount(ctx, X.modalServer({ undone: false }), "assign", OWNER, { moneyAvailable: true, mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] });
  await pick(run.page);
  await run.page.waitForSelector('[data-testid="pay-from"]');
  assert.equal(await run.page.locator('[data-testid="leave-undo"]').count(), 0);
  assert.equal(await run.page.locator(FIXED).count(), 0);
  assert.ok(await run.page.locator('button[role="switch"]:has-text("Индивидуальная цена")').count() > 0);
  await run.page.close();
});

const BALANCE = [{ group_id: "gt", group_name: F.SHORT.T, membership_id: "m-old-t", left_on: "2026-11-17", kind: "debt", amount: 38000, text: "В этой группе с прошлого раза (ушёл 17.11.2026) остался долг 38 000 сум" },
  { group_id: "gb", group_name: F.SHORT.B, membership_id: "m-old-b", left_on: "2026-11-10", kind: "debt", amount: 120000, text: "Геометрия 8 (ушёл 10.11): долг 120 000 сум" }];
test("the debt of THIS group from the last time is a row like the rows of the other groups (the structure, the sum, the link)", async () => {
  const run = await mount(ctx, X.modalServer({ undone: false, pastBalances: BALANCE }), "assign", OWNER, { moneyAvailable: true, mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], groupsBasePath: "/owner/groups" });
  await pick(run.page);
  await run.page.waitForSelector('[data-testid="past-balance"]');
  const rows = await run.page.locator('[data-testid="past-balance"]').evaluateAll((items) => items.map((li) => ({ text: li.innerText.replace(/\s+/g, " ").trim(), href: li.querySelector("a")?.getAttribute("href") })));
  assert.equal(rows.length, 2);
  assert.match(rows[0].text, /^Долг · «Физика 9» · ушёл 17\.11\s+38 000 сум\s+Выписка$/);
  assert.match(rows[1].text, /^Долг · «Геометрия 8» · ушёл 10\.11\s+120 000 сум\s+Выписка$/);
  assert.equal(rows[0].href, "/owner/payments/statement/m-old-t");
  await run.page.close();
});

// ---- the drawer «Зачислить учеников» of the group page
async function openDrawer(undoneIds, names, width = 1280, extra) {
  const run = await openPage(ctx.browser, "money-b.entry.tsx", X.drawerServer(undoneIds, extra), { width, height: width === 375 ? 800 : 900 });
  await run.page.evaluate(() => window.mount("addDrawer", { role: "owner", org_role: "owner" }, { summary: { accountingStart: "2026-09-01" }, refresh: false }));
  await run.page.fill('input[placeholder^="Поиск по имени"]', "Уч");
  for (const name of names) await run.page.click(`button:has-text("${name}")`);
  return run;
}
const writes = (calls) => calls.filter((c) => c.method === "POST" && !X.isDry(c)).map((c) => ({ path: c.path, body: c.body ?? {} }));

test("drawer, ONE chosen student who comes back the day of the leaving: the note, no «Оплата с» / opening / price, nothing of them sent", async () => {
  const run = await openDrawer(["st9"], ["Новый Ученик"]);
  await run.page.waitForSelector('[data-testid="leave-undo"]');
  assert.ok(plain(await run.page.locator('[data-testid="leave-undo"]').textContent()).includes("Ученик вернулся в день ухода — уход отменён"));
  assert.equal(plain(await run.page.locator(FIXED).textContent()), FIXED_TEXT);
  assert.equal(await run.page.locator('[data-testid="pay-from"], [data-testid="pay-from-line"]').count(), 0);
  assert.equal(await run.page.locator('button[role="switch"]:has-text("Индивидуальная цена")').count(), 0);
  await run.page.click('button:has-text("Зачислить (1)")');
  await run.page.waitForTimeout(300);
  const sent = writes(run.calls);
  assert.equal(sent.length, 1);
  for (const key of ["pay_from", "opening_balance", "price_override"]) assert.equal(sent[0].body[key], undefined, key);
  await run.page.close();
});

test("drawer, SEVERAL chosen, one comes back the day of the leaving: a summary line with the name under a disclosure; «Оплата с» stays for the others and is NOT sent for him", async () => {
  const run = await openDrawer(["st9"], ["Новый Ученик", "Второй Ученик"]);
  await run.page.waitForSelector('[data-testid="leave-undo-many"]');
  assert.match(plain(await run.page.locator('[data-testid="leave-undo-many"] summary').textContent()), /^1 ученик возвращается в день ухода — уход отменяется$/);
  await run.page.click('[data-testid="leave-undo-many"] summary');
  const inside = plain(await run.page.locator('[data-testid="leave-undo-many"]').textContent());
  assert.ok(inside.includes("Новый Ученик") && inside.includes("уход отменён"), inside);
  assert.ok(!inside.includes("Второй Ученик"), "the ordinary one is not listed");
  assert.ok(await run.page.locator('[data-testid="pay-from"]').count() > 0, "the others still have «Оплата с»");
  await run.page.fill("#add-student-pay-from", "08.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.click('button:has-text("Зачислить (2)")');
  await run.page.waitForTimeout(400);
  const sent = writes(run.calls);
  const forHim = sent.find((w) => w.path === "/auth/org/groups/g2/students/st9");
  assert.ok(forHim, JSON.stringify(sent));
  assert.equal(forHim.body.pay_from, undefined, "no date for the returning one (the server would refuse)");
  const rest = sent.find((w) => /students\/bulk$/.test(w.path) || w.path === "/auth/org/groups/g2/students/st8");
  assert.ok(rest && JSON.stringify(rest.body).includes("2026-11-08"), "the others go with the chosen day: " + JSON.stringify(sent));
  await run.page.close();
});

test("drawer, SEVERAL chosen, all come back the day of the leaving: the summary, no fields, no «Оплата с» in any request", async () => {
  const run = await openDrawer(["st9", "st8"], ["Новый Ученик", "Второй Ученик"]);
  await run.page.waitForSelector('[data-testid="leave-undo-many"]');
  assert.match(plain(await run.page.locator('[data-testid="leave-undo-many"] summary').textContent()), /^2 ученика возвращаются в день ухода — уход отменяется$/);
  assert.equal(await run.page.locator('[data-testid="pay-from"], [data-testid="pay-from-line"]').count(), 0);
  assert.equal(plain(await run.page.locator(FIXED).textContent()), FIXED_TEXT);
  await run.page.click('button:has-text("Зачислить (2)")');
  await run.page.waitForTimeout(400);
  const sent = writes(run.calls);
  assert.equal(sent.length, 2, JSON.stringify(sent));
  assert.ok(sent.every((w) => w.body.pay_from === undefined && w.body.price_override === undefined));
  await run.page.close();
});

// the walk reported: on 375 the first tap on «⋯» of a roster row did not open the menu, the second did - not reproduced (12 touch taps, with and without waiting for the data); the guard stays
test("375, touch: ONE tap on «⋯» of a roster row opens the menu", async () => {
  const M = require("./helpers/money2-fix7-menu.cjs");
  const touch = { newPage: (options) => ctx.browser.newPage({ ...options, hasTouch: true, isMobile: true }) };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const run = await openPage(touch, "money-b.entry.tsx", M.groupServer, { width: 375, height: 812 });
    await run.page.evaluate(() => window.mount("groupHeader", { role: "owner", org_role: "owner" }, { refresh: true }));
    const button = run.page.locator('button[aria-label^="Действия: Номер1"]');
    await button.waitFor({ timeout: 8000 });
    const box = await button.boundingBox();
    await run.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await run.page.waitForSelector('[role="menu"]', { timeout: 2000 });
    await run.page.close();
  }
});
