// Money-2 wave 1, И5: a TEACHER never reaches the windows of transfer / leaving / archive / restore / pause (no action, no sum); the journal of decisions answers him with the sentence of no access, not a broken list.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const F = require("./helpers/money2-fixture.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

test("И5: the teacher has no group action and no payment action on a student, active or archived", () => {
  const ts = require("typescript");
  require.extensions[".ts"] = (mod, filename) => { mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename); };
  const A = require(path.join(root, "src/lib/student-archive.ts"));
  for (const status of ["active", "archived"]) {
    const access = A.studentArchiveAccess({ isTeacher: true, status });
    assert.equal(access.groupActions, false, status);
    assert.equal(access.paymentActions, false, status);
    assert.equal(access.canArchive, false, status);
    assert.equal(access.canRestore, false, status);
  }
});

test("И5: the teacher opens the journal of decisions - the server refuses, the window says it in words, no rows, no sums", async () => {
  const refuse = (request) => (request.path === "/auth/org/payments/decisions" ? { status: 403, json: { detail: { code: "MONEY_RIGHT_REQUIRED", message: "Нет права на деньги" } } } : null);
  const run = await openPage(browser, "money2.entry.tsx", F.baseServer(refuse), { width: 375, height: 800 });
  await run.page.evaluate(() => window.mount("decisions", { role: "teacher", org_role: "teacher" }));
  await run.page.waitForSelector('[data-testid="income-decisions"] [role="alert"], [data-testid="income-decisions"] p');
  assert.equal(await run.page.locator('[data-testid="decision-row"]').count(), 0);
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  await run.page.close();
});
