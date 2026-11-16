// Money-2 R3c Г1 (front): the server's `can_set_opening` decides - nothing is guessed by role.  false: the switch «Остаток на начало учёта» of the enrolment window, the item of the «⋯» of a
// membership, the table of the openings and the file upload are NOT offered (the table says it in one calm line); true / absent: as before.  The refusal `OPENING_OWNER_ONLY` (403) is the
// server's words, once, without «Повторить» and without the page of «Нет доступа к оплатам».
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const ts = require("typescript");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const F = require("./helpers/money2-fixture.cjs");

const root = path.join(__dirname, "..");
const LOCKED = "Учёт запущен — остаток на начало вносит и меняет владелец";
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/openings", `${name}.json`), "utf8"));
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const summaryOf = (can) => ({ ...fixture("O03_summary_pending"), state: "done", ...(can === undefined ? {} : { can_set_opening: can }) });
const listOf = (can) => ({ ...fixture("O01_list_pending"), state: "done", ...(can === undefined ? {} : { can_set_opening: can }) });

async function enrolWindow(can) {
  const answer = F.baseServer((r) => (r.method === "GET" && r.path === "/auth/org/opening-balances/summary" ? { json: summaryOf(can) } : null), F.SHORT);
  const run = await openPage(browser, "money2.entry.tsx", answer, { width: 375, height: 800 });
  await run.page.evaluate(() => window.mount("assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true, mode: "add", currentGroupName: "Алгебра", excludeGroupIds: ["ga"], groupsBasePath: "/owner/groups" }));
  await run.page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
  await run.page.waitForTimeout(400);
  return run;
}
const toggle = (run) => run.page.getByRole("switch", { name: /Остаток на начало учёта/ });
const summaryCalls = (run) => run.calls.filter((c) => c.path === "/auth/org/opening-balances/summary").length;

test("the enrolment window: can_set_opening false hides the switch, true and an absent field show it; ONE summary request per window", async () => {
  for (const [can, shown] of [[false, 0], [true, 1], [undefined, 1]]) {
    const run = await enrolWindow(can);
    assert.equal(await toggle(run).count(), shown, `can_set_opening=${can}`);
    assert.equal(summaryCalls(run), 1, `one request, can_set_opening=${can}`);
    await run.page.close();
  }
});

async function table(can, extra = null) {
  const answer = (r) => {
    if (r.method === "GET" && r.path === "/auth/org/opening-balances/summary") return { json: summaryOf(can) };
    if (r.method === "GET" && r.path === "/auth/org/opening-balances") return { json: listOf(can) };
    if (r.method === "GET" && r.path === "/auth/org/groups") return { json: [] };
    return extra ? extra(r) : null;
  };
  const run = await openPage(browser, "money2.entry.tsx", answer, { width: 375, height: 800 });
  await run.page.evaluate(() => window.mount("openings", { role: "admin", org_role: "admin" }, { moneyAvailable: true }));
  await run.page.waitForSelector('[data-testid="openings-progress"]');
  return run;
}

test("the table of the openings: false = one calm line (the constant) and no inputs, no upload; true = the table", async () => {
  const locked = await table(false);
  assert.equal(await locked.page.locator('[data-testid="openings-locked"]').innerText(), LOCKED);
  assert.equal(await locked.page.locator('[data-testid="openings-upload"]').count(), 0);
  assert.equal(await locked.page.locator('[data-testid="openings-filters"]').count(), 0);
  assert.equal(await locked.page.locator("input[type=checkbox]").count(), 0);
  await locked.page.close();
  for (const can of [true, undefined]) {
    const open = await table(can);
    assert.equal(await open.page.locator('[data-testid="openings-locked"]').count(), 0);
    assert.equal(await open.page.locator('[data-testid="openings-upload"]').count(), 1);
    assert.equal(await open.page.locator('[data-testid="openings-filters"]').count(), 1);
    await open.page.close();
  }
});

test("a 403 OPENING_OWNER_ONLY is the server's words (kind other), not «Нет доступа к оплатам»; the menu item of a membership follows the lock", () => {
  require.extensions[".ts"] = (mod, filename) => {
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
  };
  const O = require(path.join(root, "src/lib/openings.ts"));
  const M = require(path.join(root, "src/lib/membership-actions.ts"));
  const failure = O.classifyOpeningsError({ status: 403, code: "OPENING_OWNER_ONLY", message: LOCKED });
  assert.deepEqual([failure.kind, failure.message], ["other", LOCKED]);
  assert.equal(O.classifyOpeningsError({ status: 403 }).kind, "denied");
  assert.equal(O.OPENING_LOCKED_TEXT, LOCKED);
  const row = { is_active: true, debt: 0, writeoff_allowed: false, refundable: 0 };
  assert.ok(M.membershipActionKeys(row, {}).includes("opening"));
  assert.ok(M.membershipActionKeys(row, { openingLocked: false }).includes("opening"));
  assert.ok(!M.membershipActionKeys(row, { openingLocked: true }).includes("opening"));
  assert.equal(O.openingLocked({ can_set_opening: false }), true);
  assert.equal(O.openingLocked({}), false);
  assert.equal(O.openingLocked(null), false);
  assert.equal(O.normalizeSummary({ ...summaryOf(false) }).can_set_opening, false);
  assert.equal("can_set_opening" in O.normalizeSummary(summaryOf(undefined)), false);
});

test("the refusal in the enrolment window is shown once, in the server's words, without «Повторить» (card window of the opening too)", async () => {
  const words = LOCKED;
  const answer = F.baseServer((r) => {
    if (r.method === "GET" && r.path === "/auth/org/opening-balances/summary") return { json: summaryOf(true) };       // the summary was true a moment ago: the refusal still comes (the start was finished meanwhile)
    if (r.method === "POST" && r.path === "/auth/org/groups/gt/students/st1") return { status: 403, json: { detail: { code: "OPENING_OWNER_ONLY", message: words } } };
    return null;
  }, F.SHORT);
  const run = await openPage(browser, "money2.entry.tsx", answer, { width: 375, height: 800 });
  await run.page.evaluate(() => window.mount("assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true, mode: "add", currentGroupName: "Алгебра", excludeGroupIds: ["ga"], groupsBasePath: "/owner/groups" }));
  await run.page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
  await run.page.waitForTimeout(300);
  await toggle(run).click();
  await run.page.locator("#assign-group-opening-paid-until").fill("30.11.2026");
  await run.page.getByRole("button", { name: /^(Добавить|Зачислить)/ }).last().click();
  await run.page.waitForTimeout(600);
  const text = await run.page.locator("body").innerText();
  assert.equal(text.split(words).length - 1, 1, "the words once");
  assert.equal(await run.page.getByRole("button", { name: "Повторить" }).count(), 0);
  await run.page.close();
});
