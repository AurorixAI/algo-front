// Money-2 wave 1, Э1 (Т1): a student in several groups chooses «Из какой группы» in the window of the transfer - nothing is asked until it is chosen; the choice rides in `from_group_id` of the
// dry run and of the transfer; the refusal 422 `TRANSFER_SOURCE_REQUIRED` of the server turns into the same selector; 409 `TRANSFER_SOURCE_GONE` is shown in the server's words.
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

const plain = (text) => text.replace(/\s+/g, " ").trim();
const isDry = (request) => /dry_run=true/.test(request.query);
const posts = (calls) => calls.filter((call) => call.method === "POST" && /\/groups\/gt\/students\/st1/.test(call.path));

/** the dry run has answered: the server said nothing about the money of this move, so no block stands - the button is the sign (Money-2 fix 11, F1) */
const ready = (page) => page.waitForFunction(() => { const b = document.querySelector('[data-testid="assign-submit"]'); return b && !b.disabled; });

const server = (overrides = {}) => F.baseServer((request) => {
  if (request.method === "POST" && request.path === "/auth/org/groups/gt/students/st1") {
    if (overrides.post) { const answer = overrides.post(request); if (answer) return answer; }
    return { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(request) } };
  }
  return null;
});

async function open(width, answer, props = {}) {
  const run = await openPage(browser, "money2.entry.tsx", answer, { width, height: 900 });
  await run.page.evaluate((p) => window.mount("assign", { role: "owner", org_role: "owner" }, p), { moneyAvailable: true, sourceGroups: F.SOURCES, excludeGroupIds: ["ga", "gb", "gc"], ...props });
  return run;
}

test("Э1: three groups - «Из какой группы» is empty, the button says why, no dry run is asked until the source is chosen", async () => {
  const run = await open(1280, server());
  await run.page.click(`text=${F.T.slice(0, 20)}`);
  const field = run.page.locator('[data-testid="assign-source"]');
  assert.equal(await field.count(), 1);
  assert.ok(/Из какой группы/.test(plain(await field.textContent())));
  assert.ok(!plain(await field.textContent()).includes(F.A), "nothing is chosen by default");
  assert.equal(await run.page.locator('[data-testid="assign-submit"]').isDisabled(), true);
  assert.ok(/Выберите, из какой группы/.test(plain(await run.page.textContent('[role="dialog"]'))));
  await run.page.waitForTimeout(700);
  assert.equal(posts(run.calls).length, 0, "no dry run before the choice");
  assert.ok(!/сейчас в/.test(plain(await run.page.textContent('[role="dialog"]'))), "the main group is not named as «сейчас в» when the person chooses");
  await run.page.close();
});

test("Э1: the chosen source rides in `from_group_id` of the dry run and of the transfer", async () => {
  const run = await open(1280, server());
  await run.page.click(`text=${F.T.slice(0, 20)}`);
  await run.page.click("#assign-group-source");
  await run.page.click(`[role="option"]:has-text("Геометрия 8")`);
  await ready(run.page);
  const dry = posts(run.calls).filter((call) => isDry(call));
  assert.ok(dry.length >= 1);
  assert.equal(dry[dry.length - 1].body.from_group_id, "gb");
  await run.page.click('[data-testid="assign-submit"]');
  await run.page.waitForSelector('[data-tone]');
  const real = posts(run.calls).filter((call) => !isDry(call));
  assert.equal(real.length, 1);
  assert.equal(real[0].body.from_group_id, "gb");
  await run.page.close();
});

test("Э1: a caller that did not know the groups - the 422 `TRANSFER_SOURCE_REQUIRED` of the server makes the selector with ITS groups", async () => {
  const refusal = { status: 422, json: { detail: { code: "TRANSFER_SOURCE_REQUIRED", message: "Ученик учится в нескольких группах — выберите, из какой его перевести", groups: [{ group_id: "ga", group_name: F.A }, { group_id: "gc", group_name: F.C }] } } };
  const run = await open(1280, server({ post: (request) => (request.body && request.body.from_group_id ? null : refusal) }), { sourceGroups: undefined, currentGroupId: null, currentGroupName: "Алгебра", excludeGroupIds: ["ga", "gc"] });
  await run.page.click(`text=${F.T.slice(0, 20)}`);
  await run.page.waitForSelector('[data-testid="assign-source"]');
  assert.equal(await run.page.locator('[data-testid="assign-submit"]').isDisabled(), true);
  await run.page.click("#assign-group-source");
  assert.equal(await run.page.locator('[role="option"]').count(), 2);
  await run.page.click(`[role="option"]:has-text("Английский")`);
  await ready(run.page);
  await run.page.close();
});

test("Э1: 409 `TRANSFER_SOURCE_GONE` is shown in the words of the server; one group - no selector, the source is sent", async () => {
  const gone = "Ученик уже не учится в группе «Алгебра»: обновите страницу";
  const run = await open(1280, server({ post: (request) => (!isDry(request) ? { status: 409, json: { detail: { code: "TRANSFER_SOURCE_GONE", message: gone } } } : null) }));
  await run.page.click(`text=${F.T.slice(0, 20)}`);
  await run.page.click("#assign-group-source");
  await run.page.click(`[role="option"]:has-text("Алгебра")`);
  await ready(run.page);
  await run.page.click('[data-testid="assign-submit"]');
  await run.page.waitForSelector('[role="alert"]');
  const alert = plain(await run.page.textContent('[role="alert"]'));
  assert.ok(alert.startsWith(gone) && alert.endsWith("Обновить") && alert.split(gone).length === 2, "the words of the server once, then the one action");
  await run.page.close();

  const one = await open(1280, server(), { sourceGroups: [F.SOURCES[0]], excludeGroupIds: ["ga"] });
  await one.page.click(`text=${F.T.slice(0, 20)}`);
  await ready(one.page);
  assert.equal(await one.page.locator('[data-testid="assign-source"]').count(), 0);
  assert.equal(posts(one.calls).filter((call) => isDry(call)).pop().body.from_group_id, "ga");
  await one.page.close();
});

test("Э1 (375): the long name of the only source group wraps under the title, nothing leaves the window; the placeholder of «Из какой группы» fits the field", async () => {
  const one = await open(375, server(), { sourceGroups: [F.SOURCES[0]], excludeGroupIds: ["ga"] });
  await one.page.click(`text=${F.T.slice(0, 20)}`);
  await ready(one.page);
  const cut = await one.page.evaluate(() => {
    const box = document.querySelector('[role="dialog"]').getBoundingClientRect();
    const line = document.querySelector('[data-testid="assign-current-group"]');
    return [...line.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > box.right + 1).length;
  });
  assert.equal(cut, 0, "a long name of the source group does not leave the window");
  await one.page.close();

  const many = await open(375, server());
  await many.page.click(`text=${F.T.slice(0, 20)}`);
  const field = await many.page.evaluate(() => { const el = document.querySelector("#assign-group-source"); return { cut: el.scrollWidth > el.clientWidth + 1, text: el.textContent }; });
  assert.equal(field.cut, false, `the placeholder is cut: ${field.text}`);
  await many.page.close();
});
