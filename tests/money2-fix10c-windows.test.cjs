// Money-2 fix 10В (LESSONS 148): (1) after «Зачислить в группу» there is no second window - the window closes and the page shows ONE message (a headline, a second line only when there is something to say);
// (2) «Остаток на начало учёта» is offered by ONE rule to the one who may use it; (3) «Подходит по классу» is gone, the deviation «Другой класс» is shown; (4) no sentence about the expected price under the choice;
// (5) a role without the right to money sees no «Оплата считается с …».
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { setup, plain, mount, OWNER, ADMIN } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const X = require("./helpers/money2-fix7.cjs");
const { F } = X;

const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
};
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};

const ctx = setup(test);
const read = (relative) => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "openings", `${name}.json`), "utf8"));
const pick = (page) => page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
const OPEN_SUMMARY = (canSet) => ({ ...fixture("O03_summary_pending"), state: "done", launch_closed: canSet === false, can_set_opening: canSet, can_reopen_launch: canSet });
const toastOf = async (page) => { await page.waitForSelector("[data-tone]"); return { text: plain(await page.locator("[data-tone] p").first().textContent()), whole: plain(await page.locator("[data-tone]").first().innerText()), tone: await page.locator("[data-tone]").first().getAttribute("data-tone"), role: await page.locator("[data-tone]").first().getAttribute("role") }; };

async function finish(props, server = X.modalServer({ undone: false, names: F.SHORT }), width = 1280) {
  const run = await mount(ctx, server, "assign", OWNER, { moneyAvailable: true, groupsBasePath: "/owner/groups", ...props }, width);
  await pick(run.page);
  await run.page.waitForSelector('[data-testid="assign-submit"]:not([disabled])');
  await run.page.waitForTimeout(500);
  await run.page.click('[data-testid="assign-submit"]');
  return run;
}

test("1. add: no success window - the message «<Имя> зачислен в «Группа»» and one line «В «Прежняя» тоже остаётся»; the window closes itself and tells the page", async () => {
  const run = await finish({ mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], sourceGroups: [{ id: "ga", name: F.SHORT.A }] });
  const toast = await toastOf(run.page);
  assert.equal(toast.text, `Каримов Фарход зачислен в «${F.SHORT.T}»`);
  assert.equal(toast.whole, `${toast.text} В «${F.SHORT.A}» тоже остаётся`);
  assert.equal(toast.role, "status");
  assert.equal(toast.tone, "success");
  for (const gone of ["assign-done"]) assert.equal(await run.page.locator(`[data-testid="${gone}"]`).count(), 0);
  const dialog = plain(await run.page.locator("body").innerText());
  assert.ok(!/Зачисление подтверждено|Отлично, закрыть|Прежние группы сохранены|Ученик занимается и в прежних/.test(dialog), dialog);
  const log = await run.page.evaluate(() => window.__log);
  assert.deepEqual(log.filter((line) => line === "assigned" || line === "close"), ["assigned", "close"], "the page is told, then the window closes");
  await run.page.close();
});

test("1. add into the 3rd group: «В прежних группах тоже остаётся»; a toast with a second line stays 10 s (not shorter than 6)", async () => {
  const run = await finish({ mode: "add", currentGroupName: `${F.SHORT.A}, ${F.SHORT.B}`, excludeGroupIds: ["ga", "gb"], sourceGroups: [{ id: "ga", name: F.SHORT.A }, { id: "gb", name: F.SHORT.B }] });
  const toast = await toastOf(run.page);
  assert.equal(toast.whole, `${toast.text} В прежних группах тоже остаётся`);
  const { toastLifetimeMs } = require("../src/lib/toast-timing.ts");
  assert.ok(toastLifetimeMs("success", true) >= 6000);
  await run.page.close();
});

test("1. first enrolment and a transfer: ONE line (nothing to add), «переведён» for a transfer", async () => {
  const first = await finish({ mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] });
  const one = await toastOf(first.page);
  assert.equal(one.whole, `Каримов Фарход зачислен в «${F.SHORT.T}»`);
  await first.page.close();
  const move = await finish({ mode: "transfer", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], sourceGroups: [{ id: "ga", name: F.SHORT.A }] }, F.baseServer((r) => (r.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: X.isDry(r), effects: F.transferEffects({ names: F.SHORT }) } } : r.path === "/auth/org/groups/gt/pay-from-default" ? { json: null } : null), F.SHORT));
  const two = await toastOf(move.page);
  assert.equal(two.whole, `Каримов Фарход переведён в «${F.SHORT.T}»`);
  await move.page.close();
});

test("1. a leaving cancelled the same day: the server's words are the second line, once; with the groups he keeps both lines", async () => {
  const run = await finish({ mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], sourceGroups: [{ id: "ga", name: F.SHORT.A }] }, X.modalServer({ undone: true, names: F.SHORT }));
  const toast = await toastOf(run.page);
  assert.ok(toast.whole.includes("Ученика убрали сегодня — возвращаем как было") && toast.whole.includes("Долг снова за учеником"), toast.whole);
  assert.ok(toast.whole.endsWith(`В «${F.SHORT.A}» тоже остаётся`), toast.whole);
  assert.equal(toast.whole.split("возвращаем как было").length - 1, 1);
  await run.page.close();
});

test("1. the long names wrap inside the message, nothing is cut (phone)", async () => {
  const run = await finish({ mode: "add", currentGroupName: F.LONG.A, excludeGroupIds: ["ga"], sourceGroups: [{ id: "ga", name: F.LONG.A }] }, X.modalServer({ undone: false, names: F.LONG }), 375);
  await toastOf(run.page);
  const fits = await run.page.evaluate(() => { const el = document.querySelector("[data-tone]"); const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && el.scrollWidth <= el.clientWidth + 1; });
  assert.ok(fits, "the toast stays inside the screen");
  await run.page.close();
});

test("1. pure: assignDoneToast - lines in the order undo, stays, warnings, infos; a warning makes the tone warning", () => {
  const { assignDoneToast, staysLine } = require("../src/lib/group-enrol.ts");
  assert.deepEqual(assignDoneToast({ studentName: "А Б", groupName: "Г", transfer: false }), { text: "А Б зачислен в «Г»", type: "success" });
  assert.deepEqual(assignDoneToast({ studentName: "А Б", groupName: "Г", transfer: true, undoText: "вернули", stays: ["Х"], warnings: ["третья группа"], infos: ["оплата перенесена"] }),
    { text: "А Б переведён в «Г»", type: "warning", details: ["вернули", "В «Х» тоже остаётся", "третья группа", "оплата перенесена"] });
  assert.equal(staysLine([]), null);
  assert.equal(staysLine(["a", "b"]), "В прежних группах тоже остаётся");
});

test("1. no caller keeps the old window: the pages show the toast (card, group page, archive dialog)", () => {
  const modal = read("src/components/groups/assign-group-modal.tsx");
  assert.doesNotMatch(modal, /assignedSuccessGroup|Зачисление подтверждено|Отлично, закрыть|assign-done/);
  for (const file of ["src/components/students/student-profile-view.tsx", "src/components/groups/group-detail-view.tsx", "src/components/groups/group-archive-dialog.tsx"]) {
    const text = read(file);
    assert.match(text, /onAssigned=\{\(_group, done\) =>/, file);
    assert.match(text, /if \(done\) showToast\(done\.text, done\.type, done\.details\)/, file);
  }
});

// ── 2. the opening balance toggle: one rule ───────────────────────────────────────────────────────────
const PEOPLE = [["st9", "Новый"]];
async function drawerWith(summary, user) {
  const base = X.drawerServer([], (r) => (r.method === "GET" && r.path === "/auth/org/students" ? { json: { items: PEOPLE.map(([id, last]) => X.STUDENT(id, last)), total: 1 } } : r.method === "GET" && r.path === "/auth/org/opening-balances/summary" ? { json: summary } : null));
  const run = await openPage(ctx.browser, "money-b.entry.tsx", base, { width: 1280, height: 900 });
  await run.page.evaluate(([w]) => window.mount("addDrawer", w, { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 380000, valid_from: "2026-09-01" } }), [user]);
  await run.page.click('button:has-text("Новый")');
  await run.page.waitForSelector('[data-testid="add-price-settings"]');
  await run.page.waitForTimeout(600);
  return run;
}
test("2. «Зачислить учеников»: the owner before the launch is closed sees the toggle; an administrator after it does not (and the frame of the price is not touched)", async () => {
  const open = await drawerWith(OPEN_SUMMARY(true), OWNER);
  assert.equal(await open.page.locator('button[role="switch"]:has-text("Остаток на начало")').count() === 1, true, "the owner has the toggle");
  await open.page.close();
  const locked = await drawerWith(OPEN_SUMMARY(false), ADMIN);
  assert.equal(await locked.page.locator('button[role="switch"]:has-text("Остаток на начало")').count(), 0);
  assert.doesNotMatch(plain(await locked.page.locator('[role="dialog"]').innerText()), /Остаток на начало/);
  assert.equal(await locked.page.locator('button[role="switch"]:has-text("Индивидуальная цена")').count(), 1, "the price switch stays");
  await locked.page.close();
});
test("2. the card of the student: the same rule - owner yes, administrator after the launch no; no divider left in the frame", async () => {
  const server = (summary) => F.baseServer((r) => (r.method === "GET" && r.path === "/auth/org/opening-balances/summary" ? { json: summary } : r.path === "/auth/org/groups/gt/pay-from-default" ? { json: { today: "2026-11-06", first_lesson: "2026-11-09", default_pay_from: "2026-11-09", text: "x" } } : null), F.SHORT);
  const props = { moneyAvailable: true, groupsBasePath: "/owner/groups", mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] };
  const owner = await mount(ctx, server(OPEN_SUMMARY(true)), "assign", OWNER, props);
  await pick(owner.page); await owner.page.waitForTimeout(700);
  assert.equal(await owner.page.locator('button[role="switch"]:has-text("Остаток на начало")').count() === 1, true);
  await owner.page.close();
  const admin = await mount(ctx, server(OPEN_SUMMARY(false)), "assign", ADMIN, props);
  await pick(admin.page); await admin.page.waitForTimeout(700);
  assert.equal(await admin.page.locator('button[role="switch"]:has-text("Остаток на начало")').count(), 0);
  assert.equal(await admin.page.locator('[data-testid="assign-price"] .border-t').count(), 0, "no divider without the second switch");
  await admin.page.close();
});
test("2. one function decides for both windows (no copy of the rule)", () => {
  for (const file of ["src/components/groups/assign-group-modal.tsx", "src/components/groups/add-student-drawer.tsx"]) {
    const text = read(file);
    assert.match(text, /openingOffered\(moneyAvailable, openingsSummary\)/, file);
    assert.doesNotMatch(text, /openingLocked|can_set_opening/, file);
  }
});

// ── 3. the chip of the class ─────────────────────────────────────────────────────────────────────────
test("3. cards: a group that fits the class has no chip; another class - «Другой класс» (muted); no class of the student - no chip at all", async () => {
  const props = { moneyAvailable: true, groupsBasePath: "/owner/groups", mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], sourceGroups: [{ id: "ga", name: F.SHORT.A }] };
  const run = await mount(ctx, F.baseServer(() => null, F.SHORT), "assign", OWNER, props);
  await run.page.waitForSelector('[data-testid="assign-group-card"]');
  const chips = await run.page.$$eval('[data-testid="assign-group-card"]', (cards) => cards.map((card) => ({ group: card.getAttribute("data-group"), chip: card.querySelector('[data-testid="group-grade-chip"]')?.textContent?.trim() ?? null })));
  assert.deepEqual(chips, [{ group: "gb", chip: null }, { group: "gc", chip: null }, { group: "gt", chip: "Другой класс" }]);
  assert.doesNotMatch(plain(await run.page.locator("body").innerText()), /Подходит по классу/);
  await run.page.close();
  const none = await mount(ctx, F.baseServer(() => null, F.SHORT), "assign", OWNER, { ...props, studentGrade: 0 });
  await none.page.waitForSelector('[data-testid="assign-group-card"]');
  assert.equal(await none.page.locator('[data-testid="group-grade-chip"]').count(), 0);
  await none.page.close();
});

// ── 4. the hint under the price ──────────────────────────────────────────────────────────────────────
test("4. nothing about the expected price under the choice «Перевести/Добавить» and under the price of the group; the hint of a group WITHOUT a price stays", async () => {
  const G = require("../src/lib/group-price.ts");
  assert.equal(G.enrolPriceHint, undefined);
  const drawer = read("src/components/groups/add-student-drawer.tsx");
  assert.doesNotMatch(drawer, /enrolPriceHint|priceHint|берёт цену/);
  assert.match(G.targetGroupPriceHint(null, 1), /Пока цена не задана/);
  assert.equal(G.targetGroupPriceHint({ amount: 1, valid_from: "2026-01-01" }, 1), null);
});

// ── 5. a role without the right to money ─────────────────────────────────────────────────────────────
test("5. a role without the right to money: no «Оплата считается с …» in the card and in the drawer; no sum, no field", async () => {
  const run = await mount(ctx, X.modalServer({ undone: false, names: F.SHORT }), "assign", ADMIN, { moneyAvailable: false, groupsBasePath: "/admin/groups", mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] });
  await pick(run.page); await run.page.waitForTimeout(800);
  assert.equal(await run.page.locator('[data-testid="pay-from-line"], [data-testid="pay-from"]').count(), 0);
  assert.doesNotMatch(plain(await run.page.locator('[role="dialog"]').innerText()), /Оплата с|сум/);
  await run.page.close();
});
