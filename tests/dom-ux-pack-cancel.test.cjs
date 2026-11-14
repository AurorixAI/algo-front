// UX pack №5 in a real browser: the window «Урока не было» asks «Кто за это платит» and says under EACH option what it does to the money (the student: «перерасчёт» or nothing; the teacher: not paid);
// the main button names the action and is blue (the window is reversible - «Вернуть на отметку»); the line «почему» stands over the off button.  The CSS is the project's tailwind.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");

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
// server 64a929b: `?dry_run=true` answers what the cancellation does to money (`deductions`, `moneyEffects`); «Праздник, выходной» recalculates nothing
const server = (request) => {
  if (request.method === "POST" && request.path === "/auth/org/groups/g1/attendance/reconcile/cancel") {
    if (/dry_run=true/.test(request.query)) {
      const holiday = request.body.cancellationKind === "holiday";
      return { json: { ok: true, cancelled: true, version: 3, warnings: [], dryRun: true, deductions: holiday ? [] : [{ studentId: "s1", name: "Иванов Иван", amount: 46000 }, { studentId: "s2", name: "Петрова Мария", amount: 46000 }], moneyEffects: { students: [], payroll: [], text: "", dryRun: true } } };
    }
    return { json: { ok: true, cancelled: true, version: 3, warnings: [] } };
  }
  return null;
};
async function open(width, user = { role: "owner", org_role: "owner" }) {
  const run = await openPage(browser, "money.entry.tsx", server, { width, height: 900 });
  await run.page.evaluate((who) => window.mount("cancelMissed", who), user);
  await run.page.waitForSelector('[role="dialog"]');
  return run;
}

test("№5: «Кто за это платит» and under each option its consequence for the student and for the teacher", async () => {
  const { page } = await open(1280);
  assert.equal(plain(await page.textContent("legend")).startsWith("Вид отмены"), true);
  const options = [];
  for (const key of ["centre", "holiday"]) {
    const card = page.locator(`[data-testid="cancellation-kind-${key}"]`);
    options.push([plain(await card.locator("span.font-semibold").textContent()), plain(await card.locator('[data-testid="cancellation-kind-students"]').textContent())]);
  }
  assert.deepEqual(options.map((row) => row.slice(0, 2)), [
    ["По вине центра", "Ученикам — перерасчёт: долг уменьшится сразу на 92 000 сум (2 ученика)"],
    ["Праздник, выходной", "Ученикам: без перерасчёта"],
  ]);
  // re-audit С3: the pay of the teacher is the same in both - said ONCE under them, not in each
  assert.equal(await page.locator('[data-testid="cancellation-kind-teacher"]').count(), 1);
  assert.equal(plain(await page.textContent('[data-testid="cancellation-kind-teacher"]')), "Преподавателю: урок не входит в зарплату");
  assert.equal(await page.locator('input[type="radio"]:checked').count(), 1, "«по вине центра» is the default");
  await page.close();
});

test("№5: the main button is «Отметить: урока не было», blue; «Отмена»; off with the line «почему» until the reason has 3 characters", async () => {
  const { page } = await open(1280);
  const submit = page.locator('[data-testid="cancel-missed-submit"]');
  assert.equal(plain(await submit.textContent()), "Отметить: урока не было");
  assert.equal(await submit.isDisabled(), true);
  assert.match(plain(await page.textContent('[data-testid="cancel-missed-why"]')), /Укажите причину — не менее 3 символов/);
  assert.equal(plain(await page.textContent('[data-testid="confirm-cancel"]')), "Отмена");
  const color = await submit.evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.ok(!/rgb\(2(2[0-9]|3[0-9]), (3[0-9]|4[0-9]|5[0-9]|6[0-9]), /.test(color) && !/220, 38, 38|225, 29, 72/.test(color), `blue, not red: ${color}`);
  assert.match(plain(await page.textContent('label[for="cancel-missed-reason"]')), /^Причина \(обязательно\)$/);
  await page.fill("#cancel-missed-reason", "заболел");
  assert.equal(await submit.isDisabled(), false);
  assert.equal(await page.locator('[data-testid="cancel-missed-why"]').count(), 0);
  await page.close();
});

test("№5: the kind chosen goes with the request; a teacher is not asked", async () => {
  const run = await open(1280);
  await run.page.click('[data-testid="cancellation-kind-holiday"]');
  await run.page.fill("#cancel-missed-reason", "праздник");
  await run.page.click('[data-testid="cancel-missed-submit"]');
  await run.page.waitForFunction(() => window.__log && window.__log.some((line) => String(line).startsWith("cancelled:")));
  const sent = run.calls.find((call) => call.path.endsWith("/attendance/reconcile/cancel") && !/dry_run=true/.test(call.query));
  assert.equal(sent.body.cancellationKind, "holiday");
  await run.page.close();
  const teacher = await open(1280, { role: "teacher", org_role: "teacher" });
  assert.equal(await teacher.page.locator('[data-testid="cancellation-kind"]').count(), 0);
  await teacher.page.close();
});

for (const width of [1280, 1024, 375]) {
  test(`${width}: nothing leaves its box, no horizontal scroll; the controls are at least 40 px on a phone`, async () => {
    const { page } = await open(width);
    const facts = await page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    if (width < 1024) {
      await page.waitForTimeout(450); // the opening animation of the window (a scale) is over
      const heights = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] [data-testid^="cancellation-kind-"][data-testid$="re"], [data-testid="cancellation-kind-holiday"], [data-testid="confirm-cancel"], [data-testid="cancel-missed-submit"]')].map((el) => Math.round(el.getBoundingClientRect().height)));
      assert.ok(heights.length >= 3 && heights.every((h) => h >= 40), heights.join(","));
    }
    await page.close();
  });
}

test("№5 / server 64a929b: «Что изменится» comes from the dry run - «перерасчёт: долг уменьшится сразу на 92 000 сум (2 ученика)»; «Праздник, выходной» - «перерасчёта не будет»; nothing is written by the preview", async () => {
  const run = await open(1280);
  const centreLine = '[data-testid="cancellation-kind-centre"] [data-testid="cancellation-kind-students"]';
  await run.page.waitForSelector(centreLine);
  assert.equal(plain(await run.page.textContent(centreLine)), "Ученикам — перерасчёт: долг уменьшится сразу на 92 000 сум (2 ученика)");
  assert.ok(/92\u00a0000\u00a0сум/.test(await run.page.textContent(centreLine)), "non-breaking spaces");
  assert.equal(await run.page.locator('[data-testid="cancel-effects-students"]').count(), 0, "the owner reads it under the kind, not twice");
  assert.ok(!/в следующей оплате|вычет|списан/i.test(plain(await run.page.textContent('[role="dialog"]'))));
  await run.page.click('[data-testid="cancellation-kind-holiday"]');
  await run.page.waitForFunction(() => /перерасчёта/.test(document.querySelector('[data-testid="cancellation-kind-holiday"]')?.textContent ?? ""));
  await run.page.waitForTimeout(600);
  assert.match(plain(await run.page.textContent(centreLine)), /92 000 сум/, "the sentence of the centre's kind stays under it after «Праздник» is chosen");
  const dry = run.calls.filter((call) => call.path.endsWith("/attendance/reconcile/cancel"));
  assert.ok(dry.length >= 2 && dry.every((call) => /dry_run=true/.test(call.query)), "only previews were asked");
  assert.deepEqual(dry.map((call) => call.body.cancellationKind), ["centre", "holiday"]);
  await run.page.close();
});
