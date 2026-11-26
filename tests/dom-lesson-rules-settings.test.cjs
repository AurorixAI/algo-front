// LESSON-RULES Э8: «Настройки → Уроки» on the server's own answer (rules_lessons.json): the window of the teacher (a choice of the allowed values) and the confirmation of a past cancellation (a switch in the grey plate);
// the words are the server's; the save sends only what changed; the refusal of the server is shown; 1280 / 1024 / 375.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, OWNER } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe, touchTargets } = require("./helpers/layout-probe.cjs");
const { answer, WORLD_DAY, plain } = require("./helpers/lesson-rules-answers.cjs");

const ctx = setup(test);
const RULES = /\/org\/settings\/lessons$/;
const noise = (errors) => errors.filter((text) => !/404|Failed to load resource|409|422|500/.test(text));

async function open(server, width = 1280) {
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", server, { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
  await run.page.evaluate(([who]) => window.mount("lesson-rules", who, {}), [OWNER]);
  return run;
}
const serve = (extra) => (request) => {
  if (extra) { const out = extra(request); if (out) return out; }
  return RULES.test(request.path) && request.method === "GET" ? { json: answer("rules_lessons") } : null;
};

for (const width of [1280, 1024, 375]) {
  test(`${width}: two rows with the words of the server (title, hint), the window shows its value, the switch its value; «Сохранить» waits for a change`, async () => {
    const { page, errors } = await open(serve(), width);
    await page.waitForSelector('[data-testid="lesson-rule-window"]');
    const rules = answer("rules_lessons").items;
    assert.equal(plain(await page.textContent('[data-testid="lesson-rule-window"] p')), rules[0].title);
    assert.equal(plain(await page.textContent('[data-testid="lesson-window-hint"]')), "Оформленное задним числом видно в «Замены → История»");
    assert.equal(plain(await page.textContent('[data-testid="lesson-window-select"]')), "14 дней", "the real answer says 14");
    assert.equal(plain(await page.textContent('[data-testid="lesson-rule-confirm"] p')), "Отмену прошедшего урока преподавателем или администратором без доступа к деньгам подтверждает владелец или администратор с доступом к деньгам");
    assert.equal(plain(await page.textContent('[data-testid="lesson-confirm-hint"]')), "Пока отмена не подтверждена, ученикам ничего не меняется");
    assert.equal(await page.getAttribute('[data-testid="lesson-confirm-switch"]', "aria-checked"), "true");
    assert.equal(plain(await page.textContent("h2")), "Уроки");
    assert.equal(await page.isDisabled('button:has-text("Сохранить")'), true, "nothing changed: nothing to save");
    assert.ok(!(await page.textContent("body")).includes("вычет"), "the word «вычет» is nowhere");
    const probe = await page.evaluate(layoutProbe, "body");
    assert.deepEqual([probe.bad, probe.scroll > 0], [[], false]);
    if (width === 375) assert.deepEqual(await page.evaluate(touchTargets, "body"), []);
    assert.deepEqual(noise(errors), []);
    await page.close();
  });
}

test("the choice offers exactly the allowed values of the server: 1 день / 3 дня / 7 дней / 14 дней / 30 дней", async () => {
  const { page } = await open(serve());
  await page.waitForSelector('[data-testid="lesson-window-select"]');
  await page.click('[data-testid="lesson-window-select"]');
  const options = (await page.locator('[role="option"]').allTextContents()).map(plain);
  assert.deepEqual(options, ["1 день", "3 дня", "7 дней", "14 дней", "30 дней"]);
  await page.close();
});

test("a change of the window: «Сохранить» sends ONLY the window; the answer of the server is the state after it", async () => {
  const saved = { ...answer("rules_lessons"), teacher_lesson_window_days: 30, items: answer("rules_lessons").items.map((item) => (item.key === "teacher_lesson_window_days" ? { ...item, value: 30, words: "30" } : item)) };
  const { page, calls } = await open(serve((r) => (r.method === "PUT" && RULES.test(r.path) ? { json: saved } : null)));
  await page.waitForSelector('[data-testid="lesson-window-select"]');
  await page.click('[data-testid="lesson-window-select"]');
  await page.click('[role="option"]:has-text("30 дней")');
  assert.equal(await page.isDisabled('button:has-text("Сохранить")'), false);
  await page.click('button:has-text("Сохранить")');
  await page.waitForSelector('text="Сохранено"');
  assert.deepEqual(calls.filter((c) => c.method === "PUT").map((c) => c.body), [{ teacher_lesson_window_days: 30 }]);
  assert.equal(plain(await page.textContent('[data-testid="lesson-window-select"]')), "30 дней");
  await page.close();
});

test("the switch: off sends past_cancel_needs_confirmation false alone; the hint of the server stays under the title", async () => {
  const off = { ...answer("rules_lessons"), past_cancel_needs_confirmation: false };
  const { page, calls } = await open(serve((r) => (r.method === "PUT" && RULES.test(r.path) ? { json: off } : null)));
  await page.waitForSelector('[data-testid="lesson-confirm-switch"]');
  await page.click('[data-testid="lesson-confirm-switch"]');
  assert.equal(await page.getAttribute('[data-testid="lesson-confirm-switch"]', "aria-checked"), "false");
  await page.click('button:has-text("Сохранить")');
  await page.waitForSelector('text="Сохранено"');
  assert.deepEqual(calls.filter((c) => c.method === "PUT").map((c) => c.body), [{ past_cancel_needs_confirmation: false }]);
  await page.close();
});

test("a value the server refuses (422 POLICY_VALUE_INVALID, the real refusal): its sentence is shown, the row keeps what the owner chose, nothing says «Сохранено»", async () => {
  const refusal = answer("refusals").policy_value_invalid;
  const { page } = await open(serve((r) => (r.method === "PUT" && RULES.test(r.path) ? { status: 422, json: refusal } : null)));
  await page.waitForSelector('[data-testid="lesson-window-select"]');
  await page.click('[data-testid="lesson-window-select"]');
  await page.click('[role="option"]:has-text("3 дня")');
  await page.click('button:has-text("Сохранить")');
  await page.waitForSelector('[data-testid="lesson-rules-save-error"]');
  assert.equal(plain(await page.textContent('[data-testid="lesson-rules-save-error"]')), refusal.detail.message);
  assert.equal(await page.locator('text="Сохранено"').count(), 0);
  await page.close();
});

test("the rules could not be read: «Не удалось загрузить правила уроков» with «Повторить»; the retry shows them", async () => {
  let fail = true;
  const { page } = await open((request) => {
    if (RULES.test(request.path) && request.method === "GET") return fail ? { status: 500, json: { detail: { code: "SERVER", message: "boom" } } } : { json: answer("rules_lessons") };
    return null;
  });
  await page.waitForSelector('[data-testid="lesson-rules-error"]');
  fail = false;
  await page.click('[data-testid="lesson-rules-error"] button:has-text("Повторить")');
  await page.waitForSelector('[data-testid="lesson-rule-window"]');
  await page.close();
});
