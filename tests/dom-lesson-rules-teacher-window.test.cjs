// LESSON-RULES Э5 / Э9: the question of the report «Урока не было» of a lesson that has begun, the refusals of the rules as an information, and the sheet of a lesson whose cancellation waits - 1280 / 375.
// The refusals are the server's own answers (refusals.json); the sentence about what happens next is the constant of the server (`money_effects.WAITING_CONSEQUENCE`, 143: the screen shows it as it comes).
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, isDry, OWNER } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe, touchTargets } = require("./helpers/layout-probe.cjs");
const { answer, WORLD_DAY, plain } = require("./helpers/lesson-rules-answers.cjs");

const ctx = setup(test);
const TEACHER = { role: "teacher", org_role: "teacher" };
const WAITING = "Отмену подтвердит владелец или администратор с доступом к деньгам: до подтверждения ученикам ничего не меняется";
const KIND = /\/attendance\/cancellation-kind$/;

async function mount(name, who, props, width = 375, server = () => null) {
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", server, { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
  await run.page.evaluate(([n, u, p]) => window.mount(n, u, p), [name, who, props]);
  return run;
}

for (const width of [1280, 375]) {
  test(`${width}: the report of a lesson that has begun - the question, the server's sentence as plain text, the usual blue button «Сообщить, что урока не было» (no red box)`, async () => {
    const { page, errors } = await mount("cancel-panel", TEACHER, { date: "2026-11-23", reason: "Отключили свет", consequence: WAITING }, width);
    await page.waitForSelector('[data-testid="lesson-cancel-panel"]');
    assert.equal(plain(await page.textContent('[data-testid="past-cancel-question"]')), "Урок 23 ноября не отмечен. Что произошло?");
    assert.equal(plain(await page.textContent('[data-testid="past-cancel-consequence"]')), WAITING);
    const button = page.locator('button:has-text("Сообщить, что урока не было")');
    assert.equal(await button.count(), 1);
    assert.equal(await page.locator('[data-testid="lesson-cancel-panel"]').evaluate((el) => /rose|danger/.test(el.className)), false, "no red frame: the message is not dangerous");
    assert.equal(await button.evaluate((el) => /danger|rose/.test(el.className)), false, "the button is not the red one");
    assert.equal(await page.locator('button:has-text("Назад")').count(), 1);
    await button.click();
    assert.deepEqual(await page.evaluate(() => window.__log), ["confirm"]);
    const probe = await page.evaluate(layoutProbe, "body");
    assert.deepEqual([probe.bad, probe.scroll > 0], [[], false]);
    if (width === 375) assert.deepEqual(await page.evaluate(touchTargets, "body"), []);
    assert.deepEqual(errors, []);
    await page.close();
  });
}

test("without the sentence of the server (not read yet / refused) the question and the button stay, nothing is invented under them", async () => {
  const { page } = await mount("cancel-panel", TEACHER, { date: "2026-11-23", reason: "Отключили свет", consequence: null });
  await page.waitForSelector('[data-testid="lesson-cancel-panel"]');
  assert.equal(await page.locator('[data-testid="past-cancel-consequence"]').count(), 0);
  assert.equal(await page.locator('button:has-text("Сообщить, что урока не было")').count(), 1);
  await page.close();
});

test("the refusals of the rules (the real answers) are an information, not a red error: no one to come backdated, a lesson older than the window", async () => {
  for (const key of ["nobody_came_backdated", "lesson_too_old"]) {
    const message = answer("refusals")[key].detail.message;
    const { page } = await mount("rule-notice", TEACHER, { message, info: true });
    await page.waitForSelector('[data-testid="lesson-rule-refusal"]');
    assert.equal(plain(await page.textContent('[data-testid="lesson-rule-refusal"]')), message);
    assert.equal(await page.getAttribute('[data-testid="lesson-rule-refusal"]', "data-variant"), "info");
    await page.close();
  }
  const red = await mount("rule-notice", TEACHER, { message: "Не удалось сохранить", info: false });
  await red.page.waitForSelector('[data-variant="error"]');
  assert.equal(await red.page.locator('[data-testid="lesson-rule-refusal"]').count(), 0, "an ordinary failure stays red");
  await red.page.close();
});

test("Э9: the sheet of a lesson whose cancellation waits - the chip «Отмена ждёт подтверждения»; the money right has «Решить» and the window of «Замены» (the same three outcomes, the real dry run)", async () => {
  const run = await mount("sheet-waiting", OWNER, { kind: "unconfirmed", moneyRight: true }, 1280, (r) => (r.method === "PUT" && KIND.test(r.path) ? { json: isDry(r) ? answer("dry_run_confirm_centre") : { ok: true, changed: true, cancellationKind: "centre", version: 3 } } : null));
  const { page, calls } = run;
  await page.waitForSelector('[data-testid="sheet-waiting"]');
  assert.equal(plain(await page.textContent('[data-testid="sheet-waiting-chip"]')), "Отмена ждёт подтверждения");
  await page.click('[data-testid="sheet-decide-waiting"]');
  await page.waitForSelector('[data-testid="waiting-outcomes"]');
  const dialog = plain(await page.textContent('[role="dialog"]'));
  assert.match(dialog, /Отмена урока ждёт подтверждения/, "the sheet does not know who wrote it: the window does not say it");
  assert.match(dialog, /Г · пн, 23\.11 · 10:00–11:30/);
  assert.equal(await page.locator('[data-testid="waiting-head"]').count(), 0, "no invented author");
  await page.click('[data-testid="waiting-outcome-centre"]');
  await page.waitForFunction(() => /Перерасчёт/.test(document.querySelector('[data-testid="waiting-caption"]')?.textContent ?? ""));
  await page.click('[data-testid="waiting-confirm"]');
  await page.waitForFunction(() => window.__log.includes("decided"));
  assert.deepEqual(calls.filter((c) => KIND.test(c.path) && !isDry(c)).map((c) => c.body), [{ lessonDate: "2026-11-23", lessonId: "lesson-mon", cancellationKind: "centre", expectedKind: "unconfirmed" }]);
  await page.close();
});

test("Э9: without the money right the sheet shows the chip alone; a cancellation with a kind of its own shows nothing of this", async () => {
  const noMoney = await mount("sheet-waiting", OWNER, { kind: "unconfirmed", moneyRight: false }, 1280);
  await noMoney.page.waitForSelector('[data-testid="sheet-waiting"]');
  assert.equal(await noMoney.page.locator('[data-testid="sheet-decide-waiting"]').count(), 0);
  await noMoney.page.close();
  for (const kind of ["centre", "holiday", null]) {
    const run = await mount("sheet-waiting", OWNER, { kind, moneyRight: true }, 1280);
    await run.page.waitForTimeout(150);
    assert.equal(await run.page.locator('[data-testid="sheet-waiting"]').count(), 0, String(kind));
    await run.page.close();
  }
});
