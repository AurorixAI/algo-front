// Money-2 fix 3 / п.4: `effects.stays[code=money_stays]` - with a sum a row «Аванс · N сум» (once), with 0 one calm sentence of the server; no text fallback of «деньги не переходят».
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
const plain = (text) => text.replace(/\s+/g, " ").replace(/ /g, " ").trim();
const isDry = (request) => /dry_run=true/.test(request.query);
const rows = async (page, key) => (await page.locator(`[data-testid="effects-${key}"] li`).evaluateAll((items) => items.map((li) => [...li.children].map((child) => child.textContent.replace(/[\s ]+/g, " ").trim()))));

async function open(width, effects) {
  const run = await openPage(browser, "money2.entry.tsx", F.baseServer((request) => request.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(request), effects } } : null, F.SHORT), { width, height: 900 });
  await run.page.evaluate((p) => window.mount("assign", { role: "owner", org_role: "owner" }, p), { moneyAvailable: true, sourceGroups: [F.SOURCES[0]], excludeGroupIds: ["ga"] });
  await run.page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
  return run;
}
const base = { membership_id: "m-a", group_id: "ga", group_name: "Алгебра 7" };
const only = (stays) => ({ kind: "transfer", moves: [], stays, ends: [], money_text: "Старая фраза про деньги", texts: [] });

test("п.4: money_stays со суммой — строка «Аванс · 40 000 сум» в блоке «Останется в группе «Алгебра 7»», один раз", async () => {
  const run = await open(1280, only([{ ...base, code: "money_stays", amount: 40000, text: "Деньги остаются в группе «Алгебра 7»: 40 000 сум" }]));
  await run.page.waitForSelector('[data-testid="transfer-effects"]');
  assert.deepEqual(await rows(run.page, "stays"), [["Аванс", "40 000 сум"]]);
  assert.deepEqual((await run.page.locator('[data-testid="transfer-effects"] h4').allTextContents()).map(plain), ["Останется в группе «Алгебра 7»"]);
  assert.equal(await run.page.locator('[data-testid="effects-calm"]').count(), 0);
  assert.ok(!/Старая фраза/.test(plain(await run.page.locator('[role="dialog"]').evaluate((el) => el.innerText))), "no text fallback of money_text");
  await run.page.close();
});

test("п.4: тот же аванс уже пришёл записью advance: — не дублируется", async () => {
  const run = await open(1280, only([{ ...base, code: "advance", amount: 40000, text: "Аванс 40 000 сум останется в группе «Алгебра 7»" }, { ...base, code: "money_stays", amount: 40000, text: "Деньги остаются" }]));
  await run.page.waitForSelector('[data-testid="transfer-effects"]');
  assert.deepEqual(await rows(run.page, "stays"), [["Аванс", "40 000 сум"]]);
  await run.page.close();
});

test("п.4: money_stays с нулём — одна спокойная строка словами сервера, без блока и без строки «Аванс»", async () => {
  const text = "Переносить нечего: в группе «Алгебра 7» нет аванса";
  const run = await open(375, only([{ ...base, code: "money_stays", amount: 0, text }]));
  await run.page.waitForSelector('[data-testid="effects-calm"]');
  assert.equal(plain(await run.page.textContent('[data-testid="effects-calm"]')), text);
  assert.equal(await run.page.locator('[data-testid="effect-row"]').count(), 0);
  assert.equal(await run.page.locator('[data-testid="transfer-effects"] h4').count(), 0);
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  await run.page.close();
});
