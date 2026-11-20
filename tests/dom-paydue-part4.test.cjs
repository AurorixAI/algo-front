// PAY-DUE 18Б.3: the table of the contract of the last server round (section 17) - every field is READ by the screen and shown as the server says it (143, 151).  A real browser (headless Chromium, the CSS of the project)
// for the statement and the window of enrolment, the pure part for the lists and the rules of the equalities.  The words are the server's (`payments_texts.py`): «срок был 06.10», «до 24.11», «Прощено», «Аванс 46 000 сум»,
// «К оплате до следующего урока», «К оплате сегодня: …», «К оплате до завтра, ДД.ММ: …».
//   open_sub              -> under the title of a charge row, before the price (statement-view, `entry.sub`)
//   open_name «forgiven»  -> a quiet word in «Остаток», not a chip, not in the sums of the open
//   recalc row «advance»  -> the green chip «Аванс N сум» on the row of the recalculation; a row the server named null (closed by the recalculation) - empty cell
//   due_sub «до следующего урока» / «до ДД.ММ» -> the quiet line under «К оплате» of a list row (pay-state.payLabel)
//   «К оплате сегодня» / «до завтра, ДД.ММ» -> the caption of the window of enrolment: the sum is cut out, the words are not rewritten
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
require("./helpers/money1-env.cjs");
const H = require("./helpers/enrol-v2.cjs");
const S = require("./helpers/paydue-statement.cjs");

const root = path.join(__dirname, "..");
const L = require(path.join(root, "src/lib/payments-ledger.ts"));
const PS = require(path.join(root, "src/lib/pay-state.ts"));
const B = require(path.join(root, "src/lib/enrol-bar.ts"));
const ctx = { browser: null };
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  ctx.browser = await launch();
});
test.after(async () => { await ctx.browser.close(); });

const plain = (text) => String(text ?? "").replace(/[\s ]+/g, " ").trim();
const OWNER = { role: "owner", org_role: "owner" };
async function openStatement(width, statement) {
  const run = await openPage(ctx.browser, "money2.entry.tsx", (request) => (request.method === "GET" && request.path === "/auth/org/memberships/m-a/statement" ? { json: statement } : null), { width, height: width === 375 ? 812 : 900 });
  await run.page.evaluate((user) => window.mount("statement", user, { moneyAvailable: true }), OWNER);
  await run.page.waitForSelector('[data-testid="statement-summary"]');
  return run;
}
async function noOverflow(page, selector, label) {
  const facts = await page.evaluate(layoutProbe, selector);
  assert.equal(facts.scroll, 0, `${label}: sideways scroll`);
  assert.deepEqual(facts.bad, [], `${label}: ${facts.bad.join(" | ")}`);
}

test("18Б.3 open_sub: the term under the charge row is the server's - «срок был 06.11» (frame 12), «срок был 06.10» and «до 24.11» (frame 13) - before the price, on 1280 and 375", async () => {
  for (const width of [1280, 375]) {
    const debt = await openStatement(width, S.lolaDebt());
    const [debtRow] = await debt.page.locator('[data-testid="statement-row-charge"]').allInnerTexts();
    assert.match(plain(debtRow), /срок был 06\.11/);
    await noOverflow(debt.page, "body", `frame 12 ${width}`);
    await debt.page.close();
    const two = await openStatement(width, S.timurTwo());
    await two.page.getByRole("button", { name: "Все месяцы" }).click();
    await two.page.waitForSelector('[data-testid="statement-row-charge"] >> nth=1');
    const rows = (await two.page.locator('[data-testid="statement-row-charge"]').allInnerTexts()).map(plain);
    assert.match(rows[0], /срок был 06\.10/);
    assert.match(rows[1], /до 24\.11/);
    assert.ok(rows[0].indexOf("срок был 06.10") < (rows[0].indexOf("цена") === -1 ? Infinity : rows[0].indexOf("цена")), "the term stands before the price");
    await noOverflow(two.page, "body", `frame 13 ${width}`);
    await two.page.close();
  }
});

test("18Б.3 «Прощено» and «Аванс» of a recalculation: the forgiven charge says a quiet «Прощено» (no chip, not in the open sums), the charge closed by money «Оплачено», the row of the recalculation carries the green chip «Аванс 46 000 сум»; the equalities hold", async () => {
  const statement = S.forgivenRecalc();
  for (const width of [1280, 375]) {
    const { page } = await openStatement(width, statement);
    await page.getByRole("button", { name: "Все месяцы" }).click();
    await page.waitForSelector('[data-testid="statement-row-recalc"]');
    assert.deepEqual((await page.locator('[data-testid="statement-cell-balance"]').allInnerTexts()).map((text) => plain(text).replace(/^Остаток ?/, "")), ["Прощено", "", "Оплачено", "", "Аванс 46 000 сум"]);
    assert.equal(await page.locator('[data-testid="statement-open-chip"]').count(), 1, "only the advance is a chip");
    assert.equal(plain(await page.locator('[data-testid="statement-row-recalc"] [data-testid="statement-open-chip"]').innerText()), "Аванс 46 000 сум");
    assert.equal(await page.getAttribute('[data-testid="statement-summary"]', "data-reconciles"), "true");
    assert.equal(plain(await page.locator('[data-testid="statement-state-state"]').innerText()), "Аванс 46 000 сум");
    await noOverflow(page, "body", `forgiven + recalc ${width}`);
    await page.close();
  }
});

test("18Б.3 the equalities of 10.11 on the new names: the forgiven part is not counted, a row the server named null (closed by the recalculation to zero) has no cell; the sums of the rows = the summary", () => {
  const statement = L.normalizeStatement(S.forgivenRecalc());
  assert.deepEqual(L.openSums(statement), { due: 0, debt: 0, advance: 46000, paid: 0 });
  assert.deepEqual(L.statementChecks(statement), { identity: true, due: true, debt: true, advance: true });
  const closed = L.normalizeStatement({ ...S.forgivenRecalc(), rows: S.forgivenRecalc().rows.map((row) => (row.type === "recalc" ? { ...row, open_name: null, open_text: null, open_amount: 0, open_parts: [] } : row)) });
  assert.deepEqual(L.openParts(closed.rows.find((row) => row.type === "recalc")), []);
});

test("18Б.3 the lists: «К оплате» of a package is the server's «до следующего урока» / «до ДД.ММ» under the label, as it came; the tab «Должники» leads with its own part", () => {
  const row = { state: "to_pay", state_text: "К оплате 300 000 сум · 2 урока", due_amount: 300000, due_text: "К оплате 300 000 сум · 2 урока", due_sub: "до следующего урока", debt_amount: 0, debt_text: null };
  assert.deepEqual([PS.payLabel(row, "to_pay").text, PS.payLabel(row, "to_pay").sub], ["К оплате 300 000 сум · 2 урока", "до следующего урока"]);
  assert.equal(PS.payLabel({ ...row, due_sub: "до 05.12" }, "worst").sub, "до 05.12");
  assert.equal(PS.payLabel({ ...row, due_sub: null }, "to_pay").sub, null, "the server is silent - no term");
});

test("18Б.3 the window of enrolment: «К оплате сегодня» and «К оплате до завтра, ДД.ММ» - the server's words, the sum is cut out of them and drawn apart; the lines of two names stay whole", async () => {
  assert.equal(B.captionOf(plain("К оплате сегодня: 188 000 сум (за 4 урока)")), "К оплате сегодня");
  assert.equal(B.captionOf(plain("К оплате до завтра, 22.11: 188 000 сум (за 4 урока)")), "К оплате до завтра, 22.11");
  assert.equal(B.captionOf(plain("Всего к оплате сегодня: 564 000 сум")), "Всего к оплате сегодня");
  assert.equal(B.captionOf(plain("К оплате 88 000 сум до завтра, 22.11")), "К оплате 88 000 сум до завтра, 22.11", "two names: the line stays whole");
  for (const [text, width] of [["К оплате сегодня: 188 000 сум (за 4 урока)", 1280], ["К оплате до завтра, 22.11: 188 000 сум (за 4 урока)", 375]]) {
    const run = await H.openDrawer(ctx, H.server({ people: H.PEOPLE, immediateLines: () => [text.replace(/ (?=\d{3}\b)/g, " ").replace(/(\d) (\d{3} сум)/, "$1 $2")] }), { width, props: { groupName: "М11 БС" } });
    await H.pick(run.page, "Каримов"); await H.settled(run.page);
    const labels = (await run.page.locator('[data-testid="summary-bar-label"]').allInnerTexts()).map(plain);
    assert.deepEqual(labels, [B.captionOf(plain(text))]);
    assert.equal(plain(await run.page.locator('[data-testid="summary-bar-sum"]').innerText()), "188 000 сум");
    await noOverflow(run.page, '[role="dialog"]', `enrol ${width}`);
    await run.page.close();
  }
});
