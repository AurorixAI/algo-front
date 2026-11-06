// Owner 06.11, UX pack §5.3-2: the window of a decision about an additional lesson - four rows «label - value», the block «Что изменится» in two groups (the salary; the payout), numbers on the right;
// several teachers - a mini-table; an administrator with the right reads one sentence.  Real components, the project's tailwind, 1280 / 1024 / 375.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");

const root = path.join(__dirname, "..");
const SHOTS = process.env.R4_SHOTS || path.join(root, "..", "artifacts", "analysis", "money1_a_ux_pack_screens");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => text.replace(/\s+/g, " ").replace(/ /g, " ").trim();
const ITEM = (over = {}) => ({ lessonId: "l1", groupId: "g1", groupName: "Геометрия 8 (пн/чт)", lessonDate: "2026-11-04", startTime: "10:00", endTime: "11:00", purpose: "extra", title: "x",
  teacher: { id: "t1", name: "Эргашев К." }, createdBy: { id: "o1", name: "Арслан", role: "owner" }, studentsPresent: 2, studentsTotal: 3, studentsPaid: 3,
  moneyEstimate: { amount: 45000, reason: null }, payrollSheet: { month: "2026-11", status: "due" }, periodClosed: false, ...over });
const SHEET = (over = {}) => ({ month: "2026-11", state: "open", sheetId: "sh1", teacherId: "t1", teacherName: "Эргашев К.", savedTotal: 120834, paid: 150000, freshBefore: 120834, freshAfter: 165834, freshTotal: 165834, changedBy: 45000, driftAfter: 45000, ...over });
const answerOf = (payroll) => ({ lessonId: "l1", money: "paid", month: "2026-11", dryRun: true, payrollSheet: { month: "2026-11", status: "due" }, moneyEffects: { students: [], payroll, text: "", dryRun: true } });
const OWNER = { role: "owner", org_role: "owner" };
const ADMIN = { role: "admin", org_role: "admin", payments_access: true };

async function openWindow(width, payroll, user = OWNER, item = ITEM()) {
  const run = await openPage(browser, "money.entry.tsx", (request) => (request.path.endsWith("/money-decision") ? { json: answerOf(payroll) } : null), { width, height: 900 });
  await run.page.evaluate(([who, p]) => window.mount("decisions", who, p), [user, { items: [item] }]);
  await run.page.waitForSelector('[data-testid="one-off-decision-row"]');
  await run.page.click('button[aria-label^="Включить в зарплату"]');
  await run.page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  return run;
}
const shot = (page, name) => page.locator('[role="dialog"]').screenshot({ path: path.join(SHOTS, name) }).catch(() => {});

for (const width of [1280, 1024, 375]) {
  test(`${width}: four rows «label - value», the salary group and the payout group, numbers on the right; nothing leaves its box`, async () => {
    const { page } = await openWindow(width, [SHEET()]);
    const dialog = '[role="dialog"]';
    assert.equal(plain(await page.textContent(`${dialog} h2`)), "Включить урок в зарплату Эргашева К.?");
    assert.ok(plain(await page.innerText(dialog)).replace(/\u2060/g, "").includes("Геометрия 8 (пн/чт) · ср, 4 ноября · 10:00–11:00"));
    const facts = (await page.locator('[data-testid^="decision-fact-"]').allInnerTexts()).map(plain);
    assert.deepEqual(facts, ["Пришли 2 из 3", "Для учеников бесплатно — урок не списывается и не оплачивается", "В зарплату за всех 3 учеников, включая отметку «Не был»", "Отменить можно, пока ноябрь не закрыт"]);
    const boxes = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="decision-fact-"]')].map((row) => { const dt = row.querySelector("dt").getBoundingClientRect(); const dd = row.querySelector("dd").getBoundingClientRect(); return { dtW: Math.round(dt.width), dtBottom: Math.round(dt.bottom), ddTop: Math.round(dd.top), ddLeft: Math.round(dd.left), dtLeft: Math.round(dt.left), ddW: Math.round(dd.width), dlW: Math.round(row.parentElement.getBoundingClientRect().width), ddH: Math.round(dd.height) }; }));
    if (width < 640) {
      // a phone: the label is a caption over the value; the value has the whole width and is not torn into 3-4 lines
      for (const box of boxes) { assert.ok(box.ddTop >= box.dtBottom - 1 && box.ddLeft === box.dtLeft, `the label is over the value: ${JSON.stringify(box)}`); assert.ok(box.ddW >= box.dlW - 2, `the value has the width of the block: ${JSON.stringify(box)}`); }
      assert.ok(boxes.every((box) => box.ddH <= 40), `the values take at most two lines: ${JSON.stringify(boxes)}`);
    } else {
      assert.equal(new Set(boxes.map((box) => box.dtW)).size, 1, `the labels are of one width: ${JSON.stringify(boxes)}`);
      for (const box of boxes) assert.ok(box.ddLeft > box.dtLeft, "the value stands beside its label");
    }
    // the date and the time of the subtitle are not torn: ONE line box for «ср, 4 ноября · 10:00–11:00» (the group name may wrap before it)
    const torn = await page.evaluate(() => { const walker = document.createTreeWalker(document.querySelector('[role="dialog"]'), NodeFilter.SHOW_TEXT); for (let n = walker.nextNode(); n; n = walker.nextNode()) { if (!n.textContent.includes("10:00")) continue; const text = n.textContent; const at = text.indexOf("ср,"); const range = document.createRange(); range.setStart(n, at); range.setEnd(n, text.indexOf("11:00") + 5); return range.getClientRects().length > 0 ? new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size : -1; } return -2; });
    assert.equal(torn, 1, "«ср, 4 ноября · 10:00–11:00» stays on one line");
    const block = plain(await page.innerText('[data-testid="money-effects"]'));
    assert.match(block, /^Что изменится Зарплата Эргашева К\. за ноябрь Было 120 834 сум Станет \+45 000 сум 165 834 сум Уже выплачено 150 000 сум Останется выплатить 15 834 сум$/);
    // the numbers stand on the right edge of the block, in one column
    const edges = await page.evaluate(() => [...document.querySelectorAll('[data-testid="effect-table"] dd')].map((el) => Math.round(el.getBoundingClientRect().right)));
    assert.equal(new Set(edges).size, 1, `the numbers end at one edge: ${edges}`);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="effect-before"]')).fontVariantNumeric.includes("tabular-nums")), true);
    // two groups with a line between
    assert.ok(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="effect-paid"]')).borderTopWidth) >= 1));
    const probe = await page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(probe.bad, [], JSON.stringify(probe.bad));
    await shot(page, `53-decision-window-${width}.png`);
    await page.close();
  });
}

test("several teachers: the mini-table «Преподаватель · Было · Станет · ±», the payouts one line per teacher under it", async () => {
  const { page } = await openWindow(1280, [SHEET(), SHEET({ teacherId: "t2", teacherName: "Мирзаева Л.", freshBefore: 36666, freshAfter: 49999, changedBy: 13333, paid: 20000, sheetId: "sh2" })]);
  const block = plain(await page.innerText('[data-testid="money-effects"]'));
  assert.equal(block, "Что изменится Зарплата за ноябрь Преподаватель Было Станет ± Эргашев К. 120 834 сум 165 834 сум +45 000 сум Мирзаева Л. 36 666 сум 49 999 сум +13 333 сум Эргашев К.: уже выплачено 150 000 сум · останется выплатить 15 834 сум Мирзаева Л.: уже выплачено 20 000 сум · останется выплатить 29 999 сум");
  const probe = await page.evaluate(layoutProbe, '[role="dialog"]');
  assert.deepEqual(probe.bad, [], JSON.stringify(probe.bad));
  await shot(page, "53-decision-window-several-1280.png");
  await page.close();
  const phone = await openWindow(375, [SHEET(), SHEET({ teacherId: "t2", teacherName: "Мирзаева Л.", freshBefore: 36666, freshAfter: 49999, changedBy: 13333, paid: 20000, sheetId: "sh2" })]);
  const phoneProbe = await phone.page.evaluate(layoutProbe, '[role="dialog"]');
  assert.deepEqual(phoneProbe.bad, [], JSON.stringify(phoneProbe.bad));
  await shot(phone.page, "53-decision-window-several-375.png");
  await phone.page.close();
});

test("an administrator with the right: one sentence with the name, no sums", async () => {
  const { page } = await openWindow(1280, [{ ...SHEET(), teacherName: null, sheetId: null, savedTotal: null, paid: null, freshBefore: null, freshAfter: null, freshTotal: null, changedBy: null, driftAfter: null }], ADMIN);
  const block = plain(await page.innerText('[data-testid="money-effects"]'));
  assert.equal(block, "Что изменится Изменится зарплата Эргашева К. за ноябрь · суммы видит владелец");
  await shot(page, "53-decision-window-admin-1280.png");
  await page.close();
});

test("«Не включать»: the same look, «В зарплату — не войдёт»", async () => {
  const run = await openPage(browser, "money.entry.tsx", (request) => (request.path.endsWith("/money-decision") ? { json: answerOf([SHEET({ freshAfter: 120834, freshBefore: 120834, changedBy: 0 })]) } : null), { width: 1280, height: 900 });
  await run.page.evaluate(([who, p]) => window.mount("decisions", who, p), [OWNER, { items: [ITEM()] }]);
  await run.page.waitForSelector('[data-testid="one-off-decision-row"]');
  await run.page.click('button[aria-label^="Не включать"]');
  await run.page.waitForSelector('[data-testid="decision-fact-pay"]');
  assert.equal(plain(await run.page.innerText('[data-testid="decision-fact-pay"]')), "В зарплату не войдёт");
  assert.equal(plain(await run.page.textContent('[role="dialog"] h2')), "Не включать урок в зарплату Эргашева К.?");
  await run.page.close();
});
