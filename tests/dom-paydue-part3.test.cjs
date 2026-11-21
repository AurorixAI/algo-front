// PAY-DUE 16А.2-4 (frames 17 and 18 of the layout) in a real browser (headless Chromium, the CSS of the project): the windows of ENROLMENT name the sum at once with the words of the server («К оплате до ДД.ММ»,
// «Всего к оплате до ДД.ММ», two lines for a debt and a sum in term, the own term of each student in «По ученикам»); the windows of LEAVING, the archive of a STUDENT and the archive of a GROUP say what stays
// unpaid by the state AFTER the action - the sentences of the server, no screen word about a debt; the choices are named without «долг» («Оставить как есть», «Простить N сум»).  Layout probe 1280 / 375 (136, 145).
// Table «field of the answer -> where it is shown» - tests/dom-paydue-part3.test.cjs header of each test and the commit message of 16А.2.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const H = require("./helpers/enrol-v2.cjs");
const P = require("./helpers/paydue-part3.cjs");
const { plain } = H;

const root = path.join(__dirname, "..");
const ctx = { browser: null };
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  ctx.browser = await launch();
});
test.after(async () => { await ctx.browser.close(); });

const labels = async (page) => (await page.locator('[data-testid="summary-bar-label"]').allInnerTexts()).map(plain);
async function noOverflow(page, selector, label) {
  const facts = await page.evaluate(layoutProbe, selector);
  assert.equal(facts.scroll, 0, `${label}: sideways scroll`);
  assert.deepEqual(facts.bad, [], `${label}: ${facts.bad.join(" | ")}`);
}

test("frame 17 (enrolment, three students): the words of the server over the sum - «Всего к оплате до 24.11» (the nearest term); the lessons stay in the line under it; no «К оплате сразу»", async () => {
  for (const width of [1280, 375]) {
    const run = await H.openDrawer(ctx, H.server({ people: H.PEOPLE }), { width, props: { groupName: "М11 БС" } });
    await H.pick(run.page, "Каримов", "Юсупова", "Рашидов"); await H.settled(run.page);
    assert.deepEqual(await labels(run.page), ["Всего к оплате до 24.11"]);
    assert.equal(plain(await run.page.locator('[data-testid="summary-bar-sum"]').innerText()), "564 000 сум");
    assert.ok(!/сразу/.test(await H.barText(run.page)), await H.barText(run.page));
    await noOverflow(run.page, '[role="dialog"]', `frame 17 ${width}`);
    await run.page.close();
  }
});

test("frame 17 (different terms): the bar names the NEAREST term, each student's own stands under his name in «По ученикам» (only because they differ)", async () => {
  const until = { st1: "24.11", st2: "26.11", st3: "26.11" };
  const run = await H.openDrawer(ctx, H.server({ people: H.PEOPLE, dueUntil: (id) => until[id] ?? "24.11" }), { props: { groupName: "М11 БС" } });
  await H.pick(run.page, "Каримов", "Юсупова", "Рашидов"); await H.settled(run.page);
  assert.deepEqual(await labels(run.page), ["Всего к оплате до 24.11"]);
  await run.page.click('[data-testid="enrol-by-student-toggle"]');
  const rows = (await run.page.locator('[data-testid="enrol-by-student-row"]').allInnerTexts()).map((text) => plain(text));
  assert.equal(rows.length, 3);
  assert.match(rows[0], /Каримов.*К оплате до 24\.11.*188 000 сум/);
  assert.match(rows[1], /К оплате до 26\.11/);
  await noOverflow(run.page, '[role="dialog"]', "frame 17 own terms");
  await run.page.close();
  // the same terms for everybody: no term is repeated under the names
  const same = await H.openDrawer(ctx, H.server({ people: H.PEOPLE }), { props: { groupName: "М11 БС" } });
  await H.pick(same.page, "Каримов", "Юсупова"); await H.settled(same.page);
  assert.equal(await same.page.locator('[data-testid="enrol-by-student-toggle"]').count(), 0, "the same sums, the same term: nothing to expand");
  await same.page.close();
});

test("frame 17 (a debt and a sum in term of ONE student): two lines of the server over the sum, as they are", async () => {
  const lines = [`Долг ${P.money(100000)} · срок был 03.11`, `К оплате ${P.money(88000)} до 24.11`];
  const run = await H.openDrawer(ctx, H.server({ people: H.PEOPLE, immediateLines: () => lines }), { props: { groupName: "М11 БС" } });
  await H.pick(run.page, "Каримов"); await H.settled(run.page);
  assert.deepEqual(await labels(run.page), lines.map(plain));
  await noOverflow(run.page, '[role="dialog"]', "two names");
  await run.page.close();
});

test("frame 17 (a debt at once): «Долг сразу · срок был 03.11» - the term that was, not a word of the screen", async () => {
  const run = await H.openDrawer(ctx, H.server({ people: H.PEOPLE, immediateLines: (id, parts) => P.dueLines(188000, 5, { debt: true, was: "03.11" }) }), { props: { groupName: "М11 БС" } });
  await H.pick(run.page, "Каримов"); await H.settled(run.page);
  assert.deepEqual(await labels(run.page), ["Долг сразу · срок был 03.11"]);
  await run.page.close();
});

test("frame 18a (leaving the only group): the sentence of the server by the state AFTER the leaving - «К оплате N. Это единственная группа ученика: после ухода сумма станет долгом»; the choices have no word «долг»", async () => {
  for (const width of [1280, 375]) {
    const preview = { as_of: "2026-11-20", memberships: [P.ONLY_GROUP()] };
    const run = await openPage(ctx.browser, "money2.entry.tsx", P.F.baseServer((r) => (r.method === "GET" && r.path === "/auth/org/groups/ga/students/st1/leave-preview" ? { json: preview } : null)), { width, height: width === 375 ? 812 : 900 });
    await run.page.evaluate(() => window.mount("leave"));
    await run.page.waitForSelector('[data-testid="settle-words"]');
    const text = plain(await run.page.locator('[role="dialog"]').innerText());
    assert.ok(text.includes("К оплате 231 000 сум. Это единственная группа ученика: после ухода сумма станет долгом"), text);
    // PAY-TAILS Б2.4 (frame 6): the whole sum is a debt after the leaving (the single group): «Оставить долг», «Простить N сум»
    assert.ok(text.includes("Оставить долг — оплатить можно и после ухода") && text.includes("Простить 231 000 сум"), text);
    assert.equal(text.split("231 000 сум").length - 1, 2, "the sum is said by the sentence of the server and by the choice that forgives it (the approved layout)");
    assert.ok(!text.includes("После ухода у ученика долг") && !text.includes("Простить долг") && !text.includes("Простить сумму"), text);
    assert.equal(await run.page.locator('[data-testid="settle-words"]').count(), 1, "one sentence, once");
    await noOverflow(run.page, '[role="dialog"]', `frame 18a ${width}`);
    await run.page.close();
  }
});

test("frame 18a (one of two groups): «К оплате N до ДД.ММ, срок не меняется» - the server's words; a role without money - the fact without a sum", async () => {
  const preview = { as_of: "2026-11-20", memberships: [P.OTHER_GROUP_LEFT()] };
  const run = await openPage(ctx.browser, "money2.entry.tsx", P.F.baseServer((r) => (r.method === "GET" && r.path === "/auth/org/groups/ga/students/st1/leave-preview" ? { json: preview } : null)), { width: 1280, height: 900 });
  await run.page.evaluate(() => window.mount("leave"));
  await run.page.waitForSelector('[data-testid="settle-words"]');
  assert.match(plain(await run.page.locator('[data-testid="settle-words"]').innerText()), /^К оплате 231 000 сум до 24\.11, срок не меняется: оплатить или простить сумму можно в выписке группы «Математика 7»$/);
  await run.page.close();
});

test("frame 18 (the archive of a STUDENT): each group says «Ученик уходит из центра: вся неоплаченная сумма N в группе «…» станет долгом» (the server's)", async () => {
  const rows = [P.ARCHIVE_ROW("Математика 7", 231000, "m-a", "ga"), P.ARCHIVE_ROW("Физика 8", 100000, "m-b", "gb")];
  const run = await openPage(ctx.browser, "money2.entry.tsx", P.F.baseServer((r) => (r.method === "GET" && r.path === "/auth/org/students/st1/archive-preview" ? { json: { as_of: "2026-11-20", memberships: rows } } : null)), { width: 375, height: 812 });
  await run.page.evaluate(() => window.mount("archive"));
  await run.page.waitForSelector('[data-testid="settle-words"]');
  const words = (await run.page.locator('[data-testid="settle-words"]').allInnerTexts()).map(plain);
  assert.deepEqual(words, ["Ученик уходит из центра: вся неоплаченная сумма 231 000 сум в группе «Математика 7» станет долгом", "Ученик уходит из центра: вся неоплаченная сумма 100 000 сум в группе «Физика 8» станет долгом"]);
  await noOverflow(run.page, '[role="dialog"]', "archive of a student 375");
  await run.page.close();
});

test("frame 18 (the archive of a GROUP): the two lines of the server by the facts of the window; a row «К оплате» is named so (not «Аванс»); the actions are the server's, with the sum", async () => {
  for (const width of [1280, 375]) {
    const impact = P.archiveImpact(P.BALANCES, P.ARCHIVE_TEXTS);
    const run = await openPage(ctx.browser, "money2.entry.tsx", P.F.baseServer((r) => (r.path === "/auth/org/groups/gz/archive-impact" ? { json: impact } : null), P.F.SHORT), { width, height: width === 375 ? 812 : 900 });
    await run.page.evaluate(() => window.mount("group-archive", { role: "owner", org_role: "owner" }, { moneyAvailable: true, groupsBasePath: "/owner/groups" }));
    await run.page.waitForSelector('[data-testid="archive-balance-words"]');
    assert.deepEqual((await run.page.locator('[data-testid="archive-balance-words"]').allInnerTexts()).map(plain), P.ARCHIVE_TEXTS.map(plain));
    const rows = await run.page.locator('[data-testid="archive-balance"]').evaluateAll((items) => items.map((li) => li.innerText.replace(/[\s ]+/g, " ").trim()));
    assert.match(rows[0], /^Иванов Али 190 000 сум Долг · ушёл 20\.11/);
    assert.match(rows[1], /^Саидова Мадина 231 000 сум К оплате/);
    const links = await run.page.locator('[data-testid="archive-balance-writeoff"]').allInnerTexts();
    assert.deepEqual(links.map(plain), ["Простить 190 000 сум", "Простить 231 000 сум"]);
    await noOverflow(run.page, '[role="dialog"]', `archive of a group ${width}`);
    await run.page.close();
  }
  // the server says nothing about the facts (only advances): no sentence is made up
  const quiet = P.archiveImpact([P.BALANCES[0]], []);
  const run = await openPage(ctx.browser, "money2.entry.tsx", P.F.baseServer((r) => (r.path === "/auth/org/groups/gz/archive-impact" ? { json: quiet } : null), P.F.SHORT), { width: 1280, height: 900 });
  await run.page.evaluate(() => window.mount("group-archive", { role: "owner", org_role: "owner" }, { moneyAvailable: true, groupsBasePath: "/owner/groups" }));
  await run.page.waitForSelector('[data-testid="archive-balance"]');
  assert.equal(await run.page.locator('[data-testid="archive-balance-words"]').count(), 0);
  await run.page.close();
});
