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
/** The dry run has been asked and answered (the screen of a returning student has no plate to wait for - Money-2 fix 10B). */
const settled = async (run, probes = 1) => {
  for (let i = 0; i < 60 && run.calls.filter((c) => c.method === "POST" && X.isDry(c)).length < probes; i += 1) await run.page.waitForTimeout(100);
  await run.page.waitForTimeout(600);
};
const FIXED = '[data-testid="leave-undo-fixed"]';
const FIXED_TEXT = "Дату оплаты и цену здесь задать нельзя — они остаются прежними";
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
    await settled(run);
    const dialog = plain(await run.page.locator('[role="dialog"]').evaluate((el) => el.innerText));
    assert.equal(await run.page.locator('[data-testid="leave-undo"]').count(), 0, "no plate before the action: «как было» is the expected result");
    assert.ok(!dialog.includes("возвращаем как было") && !dialog.includes("вернётся как был") && !dialog.includes(FIXED_TEXT), dialog);
    assert.equal(await run.page.locator("#assign-group-pay-from, [data-testid=\"pay-from\"]").count(), 0, "no «Оплата с»");
    assert.equal(await run.page.locator('[id^="assign-group-opening"]').count(), 0, "no opening balance");
    assert.equal(await run.page.locator('button[role="switch"]:has-text("Индивидуальная цена")').count(), 0, "no individual price");
    assert.doesNotMatch(dialog.replace(FIXED_TEXT, ""), /Оплата с|Остаток на начало/);
    await run.page.waitForSelector('[data-testid="assign-submit"]:not([disabled])');
    await run.page.click('[data-testid="assign-submit"]');
    await run.page.waitForSelector('[data-testid="assign-done"]');
    const done = plain(await run.page.locator('[role="dialog"]').evaluate((el) => el.innerText));
    assert.ok(done.includes("Ученика убрали сегодня — возвращаем как было") && done.includes("Долг снова за учеником"), `after the action the server's words: ${done}`);
    assert.equal(await run.page.locator('[role="dialog"] [role="status"]').filter({ hasText: "возвращаем как было" }).count(), 1, "read by a screen reader (role=status)");
    const body = posts(run.calls).find((c) => c.path === "/auth/org/groups/gt/students/st1").body ?? {};
    for (const key of ["pay_from", "opening_balance", "price_override"]) assert.equal(body[key], undefined, `${key} is not sent`);
    await run.page.close();
  });
}

test("card of a student WITHOUT groups: an ordinary first enrolment keeps «Оплата с» and the price (nothing changed for it), no note", async () => {
  const run = await mount(ctx, X.modalServer({ undone: false }), "assign", OWNER, { moneyAvailable: true, mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] });
  await pick(run.page);
  await run.page.waitForSelector('[data-testid="pay-from"]');
  await settled(run);
  assert.equal(await run.page.locator('[data-testid="leave-undo"]').count(), 0);
  assert.equal(await run.page.locator(FIXED).count(), 0);
  assert.ok(await run.page.locator('button[role="switch"]:has-text("Индивидуальная цена")').count() > 0);
  await run.page.close();
});

const BALANCE = [{ group_id: "gt", group_name: F.SHORT.T, membership_id: "m-old-t", left_on: "2026-11-17", same_group: true, kind: "debt", amount: 38000, text: "Уже был в этой группе, ушёл 17.11.2026 — остался долг 38 000 сум" },
  { group_id: "gb", group_name: F.SHORT.B, membership_id: "m-old-b", left_on: "2026-11-10", kind: "debt", amount: 120000, text: "Был в группе «Геометрия 8», ушёл 10.11.2026 — остался долг 120 000 сум" }];
test("the debt of THIS group from the last time is a row like the rows of the other groups (the structure, the sum, the link)", async () => {
  const run = await mount(ctx, X.modalServer({ undone: false, pastBalances: BALANCE }), "assign", OWNER, { moneyAvailable: true, mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], groupsBasePath: "/owner/groups" });
  await pick(run.page);
  await run.page.waitForSelector('[data-testid="past-balance"]');
  const rows = await run.page.locator('[data-testid="past-balance"]').evaluateAll((items) => items.map((li) => ({ text: li.innerText.replace(/\s+/g, " ").trim(), href: li.querySelector("a")?.getAttribute("href") })));
  assert.equal(rows.length, 2);
  assert.match(rows[0].text, /^Долг · в этой же группе · ушёл 17\.11\s+38 000 сум\s+Выписка$/);
  assert.match(rows[1].text, /^Долг · «Геометрия 8» · ушёл 10\.11\s+120 000 сум\s+Выписка$/);
  assert.equal(rows[0].href, "/owner/payments/statement/m-old-t");
  await run.page.close();
});

// ---- the drawer «Зачислить учеников» of the group page
async function openDrawer(undoneIds, names, width = 1280, extra, balancesBy = {}, long = false) {
  const run = await openPage(ctx.browser, "money-b.entry.tsx", X.drawerServer(undoneIds, extra, long, balancesBy), { width, height: width === 375 ? 800 : 900 });
  await run.page.evaluate(() => window.mount("addDrawer", { role: "owner", org_role: "owner" }, { summary: { accountingStart: "2026-09-01" }, refresh: false }));
  await run.page.fill('input[placeholder^="Поиск по имени"]', "Уч");
  for (const name of names) await run.page.click(`button:has-text("${name}")`);
  return run;
}
const added = async (page) => { await page.waitForFunction(() => window.__log.some((line) => line.startsWith("{")), null, { timeout: 4000 }); return JSON.parse((await page.evaluate(() => window.__log)).filter((line) => line.startsWith("{")).pop()); };
const writes = (calls) => calls.filter((c) => c.method === "POST" && !X.isDry(c)).map((c) => ({ path: c.path, body: c.body ?? {} }));
const SERVER_LINE = "Общие «Оплата с» и цена на них не действуют";
const noFields = async (page) => {
  assert.equal(await page.locator('[data-testid="pay-from"], [data-testid="pay-from-line"]').count(), 0);
  assert.equal(await page.locator('button[role="switch"]:has-text("Индивидуальная цена")').count(), 0);
};

test("drawer, ONE chosen student who comes back the day of the leaving: the server's note from the ONE bulk probe, no fields, ONE write without them", async () => {
  const run = await openDrawer(["st9"], ["Новый Ученик"]);
  await settled(run);
  assert.equal(await run.page.locator('[data-testid="leave-undo"], [data-testid="leave-undo-many"], [data-testid="leave-shared-note"]').count(), 0, "no plate before the action");
  await noFields(run.page);
  assert.equal(X.bulkProbes(run.calls).length, 1, "one bulk probe");
  assert.equal(X.singleProbes(run.calls).length, 0, "no probe per student");
  await run.page.click('button:has-text("Зачислить (1)")');
  await run.page.waitForTimeout(300);
  const sent = writes(run.calls);
  assert.equal(sent.length, 1, JSON.stringify(sent));
  for (const key of ["pay_from", "opening_balance", "price_override"]) assert.equal(sent[0].body[key], undefined, key);
  const summary = await added(run.page);
  assert.ok(summary.infos[0].startsWith("Ученика убрали сегодня — возвращаем как было") && summary.infos[0].includes("Долг снова за учеником"), JSON.stringify(summary.infos));
  await run.page.close();
});

test("drawer, 2 of 3 come back: ONE probe, the summary with the words of the server, the line under it, «Оплата с» stays; ONE write with all three and the common day", async () => {
  const run = await openDrawer(["st9", "st7"], ["Новый Ученик", "Второй Ученик", "Третий Ученик"], 1280, (r) => (r.method === "GET" && r.path === "/auth/org/students" ? { json: { items: [X.STUDENT("st9", "Новый"), X.STUDENT("st8", "Второй"), X.STUDENT("st7", "Третий")], total: 3 } } : null));
  await settled(run);
  assert.equal(await run.page.locator('[data-testid="leave-undo-many"], [data-testid="leave-shared-note"]').count(), 0, "nothing common entered: no line");
  assert.ok(await run.page.locator('[data-testid="pay-from"]').count() > 0, "the others still have «Оплата с»");
  await run.page.fill("#add-student-pay-from", "08.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForTimeout(700);
  assert.equal(X.singleProbes(run.calls).length, 0, "no probe per student");
  await run.page.waitForSelector('[data-testid="leave-shared-note"]');
  assert.match(plain(await run.page.locator('[data-testid="leave-shared-line"]').textContent()), /^На 2 ученика общие цена и дата не действуют — у них остаются прежние$/);
  const inside = (await X.hintsOf(run.page.locator('[data-testid="leave-shared-note"]')))[0];
  assert.ok(inside.includes("Новый Ученик: Ученика убрали сегодня — возвращаем как было") && inside.includes("Третий Ученик") && !inside.includes("Второй Ученик"), inside);
  await run.page.fill("#add-student-pay-from", "09.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForTimeout(700);
  assert.equal(await run.page.locator('[data-testid="leave-shared-note"]').count(), 0, "the day is the default again: the line is gone");
  await run.page.fill("#add-student-pay-from", "08.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForTimeout(700);
  await run.page.click('button:has-text("Зачислить (3)")');
  await run.page.waitForTimeout(400);
  const sent = writes(run.calls);
  assert.equal(sent.length, 1, JSON.stringify(sent));
  assert.match(sent[0].path, /students\/bulk$/);
  assert.deepEqual([...sent[0].body.student_ids].sort(), ["st7", "st8", "st9"]);
  assert.ok(JSON.stringify(sent[0].body).includes("2026-11-08"), JSON.stringify(sent[0].body));
  const summary = await added(run.page);
  assert.ok(summary.infos.some((line) => line.startsWith("Новый Ученик: Ученика убрали сегодня — возвращаем как было")) && summary.infos.some((line) => line.startsWith("Третий Ученик:")), JSON.stringify(summary.infos));
  await run.page.close();
});

test("drawer, picking three students quickly: exactly ONE bulk probe asked", async () => {
  const run = await openDrawer([], ["Новый Ученик", "Второй Ученик", "Третий Ученик"], 1280, (r) => (r.method === "GET" && r.path === "/auth/org/students" ? { json: { items: [X.STUDENT("st9", "Новый"), X.STUDENT("st8", "Второй"), X.STUDENT("st7", "Третий")], total: 3 } } : null));
  await run.page.waitForTimeout(1200);
  assert.equal(X.bulkProbes(run.calls).length, 1, JSON.stringify(X.bulkProbes(run.calls).map((c) => c.body)));
  assert.equal(X.singleProbes(run.calls).length, 0);
  await run.page.close();
});

test("drawer, all come back: the summary, no fields, no «Оплата с» anywhere, ONE write (one request)", async () => {
  const run = await openDrawer(["st9", "st8"], ["Новый Ученик", "Второй Ученик"]);
  await settled(run);
  assert.equal(await run.page.locator('[data-testid="leave-undo-many"], [data-testid="leave-shared-note"]').count(), 0, "all come back: no plate, no line");
  await noFields(run.page);
  await run.page.click('button:has-text("Зачислить (2)")');
  await run.page.waitForTimeout(400);
  const sent = writes(run.calls);
  assert.equal(sent.length, 1, JSON.stringify(sent));
  assert.ok(sent[0].body.pay_from === undefined && sent[0].body.price_override === undefined);
  const summary = await added(run.page);
  assert.ok(summary.infos.length === 2 && summary.infos.every((line) => line.includes("возвращаем как было")), JSON.stringify(summary.infos));
  await run.page.close();
});

const SAME = { group_id: "g2", group_name: "7-Б Геометрия", membership_id: "m-same", left_on: "2026-11-17", kind: "debt", amount: 38000, same_group: true, text: "Уже был в этой группе, ушёл 17.11.2026 — остался долг 38 000 сум" };
const OTHER = (n) => ({ group_id: "gx" + n, group_name: "Алгебра " + n, membership_id: "m-x" + n, left_on: "2026-11-1" + n, kind: n === 2 ? "advance" : "debt", amount: 10000 * n, text: "Был в группе «Алгебра " + n + "», ушёл 1" + n + ".11.2026 — остался " + (n === 2 ? "аванс " : "долг ") + 10 * n + " 000 сум" });
test("drawer, ONE student with a debt of THIS group: the compact row says «в этой же группе», the title is «Долги и авансы с прошлого раза»", async () => {
  const run = await openDrawer([], ["Новый Ученик"], 1280, undefined, { st9: [SAME] });
  await run.page.waitForSelector('[data-testid="past-balance"]');
  assert.equal(await X.shown(run.page.locator('[data-testid="past-balances"] h3')), "Долги и авансы с прошлого раза");
  const row = (await run.page.locator('[data-testid="past-balance"]').evaluate((li) => li.innerText)).replace(/\s+/g, " ").trim();
  assert.match(row, /^Долг · в этой же группе · ушёл 17\.11 38 000 сум( Выписка)?$/);
  assert.ok(!row.includes("Геометрия"), row);
  await run.page.close();
});

test("drawer, THREE students with balances: one summary line, the rows by student under a disclosure", async () => {
  const run = await openDrawer([], ["Новый Ученик", "Второй Ученик", "Третий Ученик"], 1280, (r) => (r.method === "GET" && r.path === "/auth/org/students" ? { json: { items: [X.STUDENT("st9", "Новый"), X.STUDENT("st8", "Второй"), X.STUDENT("st7", "Третий")], total: 3 } } : null), { st9: [SAME], st8: [OTHER(2)], st7: [OTHER(3)] });
  await run.page.waitForSelector('[data-testid="past-balances"]');
  assert.match(plain(await run.page.locator('[data-testid="past-balances"] summary').textContent()), /^У 3 учеников остались долги или авансы с прошлого раза$/);
  await run.page.click('[data-testid="past-balances"] summary');
  const text = plain(await run.page.locator('[data-testid="past-balances"]').textContent());
  assert.ok(text.includes("Новый Ученик") && text.includes("Долг · в этой же группе") && text.includes("Аванс · «Алгебра 2»") && text.includes("Третий Ученик"), text);
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

// item 4 (server fix MONEY2_FIX_STAGE6): coming back into the SAME group - the row of its debt + «К оплате сразу: 187 000 сум (за 5 уроков)»: the word «ещё» and the lessons are the server's
test("return to the same group: the debt row of the group and the server's «ещё N» reach the screen without being rebuilt from numbers", async () => {
  const immediate = { amount: 187000, lessons: 5, text: "К оплате сразу: 187 000 сум (за 5 уроков)", parts: [{ label: "ноябрь", from: "2026-11-04", amount: 187000, lessons: 5, lessons_in_period: 12, whole: false }] };
  const server = F.baseServer((request) => {
    if (request.method === "GET" && request.path === "/auth/org/groups/gt/pay-from-default") return { json: { today: "2026-11-06", first_lesson: "2026-11-09", default_pay_from: "2026-11-09", text: "Оплата с 09.11.2026 — первое занятие группы с сегодня" } };
    if (request.method === "POST" && request.path === "/auth/org/groups/gt/students/st1") {
      const past = request.body && request.body.pay_from;
      return { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, leave_undo: null, past_balances: BALANCE.slice(0, 1), billing: past ? { pay_from: request.body.pay_from, explicit: true, default_pay_from: "2026-11-09", first_lesson: "2026-11-09", text: "Оплата с 04.11.2026", immediate } : null } };
    }
    return null;
  });
  const run = await mount(ctx, server, "assign", OWNER, { moneyAvailable: true, mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], groupsBasePath: "/owner/groups" });
  await pick(run.page);
  await run.page.waitForSelector('[data-testid="past-balance"]');
  await run.page.fill("#assign-group-pay-from", "04.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForSelector('[data-testid="pay-from-immediate"]:not(:has-text("Считаем"))');
  const block = run.page.locator('[data-testid="pay-from-immediate"]');
  const text = await X.shown(block);
  assert.match(text, /^К оплате сразу/, text);
  assert.ok(text.includes("187 000") && !/Сразу начислится|ещё|Неполный месяц/.test(text), text);
  const [hint] = await X.hintsOf(block);
  assert.equal(hint, "Стоимость уроков с даты «Оплата с» до конца оплачиваемого периода — её ученик платит сейчас. Неполный месяц округляется до 1 000 сум. Долг или аванс с прошлого раза сюда не входит — он показан ниже.");
  assert.ok(!/долг/i.test(hint.replace("Долг или аванс с прошлого раза сюда не входит — он показан ниже.", "")), "the sum is not called a debt");
  await run.page.close();
});

// ---- no empty settings container when the leaving is undone (fix9): nothing to show -> the frame is not drawn
const EMPTY_FRAMES = () => Array.from(document.querySelectorAll('[role="dialog"] .rounded-xl.border-slate-200.bg-slate-50')).filter((el) => el.textContent.trim() === "" && el.querySelector("input,button,select") === null).length;
for (const [label, props] of [
  ["mode add", { mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"] }],
  ["mode transfer", { mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] }],
]) {
  test(`card, leaving undone (${label}): no empty settings frame where the plate was`, async () => {
    const run = await mount(ctx, X.modalServer({ undone: true }), "assign", OWNER, { moneyAvailable: true, groupsBasePath: "/owner/groups", ...props });
    await pick(run.page);
    await settled(run);
    assert.equal(await run.page.locator('[data-testid="assign-price"]').count(), 0, "the container of the settings is absent");
    assert.equal(await run.page.evaluate(EMPTY_FRAMES), 0, "no empty frame");
    await run.page.close();
  });
}

test("drawer, all come back: no empty settings frame where the summary was", async () => {
  const run = await openDrawer(["st9", "st8"], ["Новый Ученик", "Второй Ученик"]);
  await settled(run);
  assert.equal(await run.page.locator('[data-testid="add-price-settings"]').count(), 0, "the container of the settings is absent");
  assert.equal(await run.page.evaluate(EMPTY_FRAMES), 0, "no empty frame");
  await run.page.close();
});
