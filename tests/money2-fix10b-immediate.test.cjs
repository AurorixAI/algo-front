// Money-2 fix 10B in the form of the mock-up of 19.11: the sum at once is the BOTTOM BAR (the caption, one big sum, one line; «По ученикам» / «По периодам» for the details); «Сразу платить не нужно».
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { setup, plain, mount, OWNER } = require("./helpers/money2-w2.cjs");
const X = require("./helpers/money2-fix7.cjs");

const ctx = setup(test);
const H = require("./helpers/enrol-v2.cjs");
const PEOPLE = [H.STUDENT("st9", "Новый", "Ученик"), H.STUDENT("st8", "Второй", "Ученик"), H.STUDENT("st7", "Третий", "Ученик")];
const PART = (label, from, amount, lessons, inPeriod, whole = false) => ({ label, from, amount, lessons, lessons_in_period: inPeriod, whole });
const ONE = [PART("ноябрь", "2026-11-04", 187000, 5, 12)];
const IMMEDIATE = { st9: ONE, st8: [PART("октябрь", "2026-10-27", 89000, 2, 9), PART("ноябрь", "", 380000, 12, 12, true)], st7: ONE };
const NAMES = ["Новый", "Второй", "Третий"];

async function drawer(chosen, { width = 1280 } = {}) {
  const run = await H.openDrawer(ctx, H.server({ people: PEOPLE, parts: (id) => IMMEDIATE[id] ?? null }), { width, props: { groupPrice: { amount: 380000, valid_from: "2026-09-01" } } });
  for (const i of chosen) await H.pick(run.page, NAMES[i]);
  return run;
}
const pickDay = async (page) => { await page.click('[data-testid="enrol-terms-toggle"]'); await page.fill("#add-student-pay-from", "04.11.2026"); await page.keyboard.press("Tab"); await page.waitForSelector('[data-testid="summary-bar-sum"]'); await H.settled(page); };

// the card of several students (title + total, a row per student, the notes, eight students) and the hints per student moved to money2-fix10e-summary.test.cjs

test("«Сразу платить не нужно» replaces «К оплате сразу — ничего»", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "pay-from.ts"), "utf8");
  assert.ok(src.includes('PAY_FROM_NOTHING_NOW = "Сразу платить не нужно"'));
  assert.ok(!src.includes("К оплате сразу — ничего"));
});

test("the message of success with the server's words of a returned student stays at least 6 s (details toast) and is read by a screen reader (role=status)", () => {
  const timing = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "toast-timing.ts"), "utf8");
  assert.ok(Number(/DETAILS_TOAST_MS = (\d+)/.exec(timing)[1]) >= 6000 && /if \(hasDetails\) return DETAILS_TOAST_MS/.test(timing));
  const toast = fs.readFileSync(path.join(__dirname, "..", "src", "components", "ui", "toast.tsx"), "utf8");
  assert.ok(/role=\{toast\.type === "error" \? "alert" : "status"\}/.test(toast));
});

// ---- fix 10B, item 6: what does not help to decide or to act is gone
test("«Оплата с»: under the field one short line «По умолчанию 09.11» (no sentence, no «?»); the day by default is the way back once the day is changed (drawer and card)", async () => {
  const run = await drawer([0]);
  await run.page.click('[data-testid="enrol-terms-toggle"]');
  await run.page.waitForSelector("#add-student-pay-from");
  assert.equal(await run.page.locator('[data-testid="pay-from-hint"]').count(), 0);
  assert.equal(plain(await run.page.locator('[data-testid="pay-from"]').innerText()).replace(/^Оплата с\s*/, ""), "По умолчанию 19.11", "the field and ONE short line under it");
  assert.ok(!/первое занятие|Дату выбрали вы/.test(plain(await run.page.locator('[data-testid="pay-from"]').innerText())));
  assert.equal(await run.page.getByLabel("Пояснение").count(), 0, "no «?»");
  assert.equal(await run.page.locator('[data-testid="pay-from-reset"]').count(), 0, "the default day needs no way back");
  await run.page.fill("#add-student-pay-from", "04.11.2026");
  await run.page.keyboard.press("Tab");
  assert.equal(plain(await run.page.locator('[data-testid="pay-from-reset"]').innerText()), "19.11");
  assert.equal(await run.page.locator('[data-testid="pay-from-reset"]').getAttribute("aria-label"), "Вернуть дату по умолчанию 19.11.2026");
  await run.page.close();
  const X2 = require("./helpers/money2-fix7.cjs");
  const card = await mount(ctx, X2.modalServer({ undone: false }), "assign", OWNER, { moneyAvailable: true, mode: "add", currentGroupName: X2.F.SHORT.A, excludeGroupIds: ["ga"], groupsBasePath: "/owner/groups" });
  await card.page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
  await card.page.click('[data-testid="enrol-terms-toggle"]');
  await card.page.waitForSelector('[data-testid="pay-from"]');
  assert.equal(await card.page.locator('[data-testid="pay-from-hint"]').count(), 0);
  assert.match(plain(await card.page.locator('[data-testid="pay-from"]').innerText()), /По умолчанию 09\.11$/);
  assert.equal(await card.page.getByLabel("Пояснение").count(), 0);
  await card.page.close();
});

test("the sum at once of one student: the sum once (in the bar), the period in its line; two periods - the line names them and «По периодам» gives a sum per period", async () => {
  const run = await drawer([0]);
  await pickDay(run.page);
  const bar = run.page.locator('[data-testid="summary-bar"]');
  const text = plain(await bar.innerText());
  assert.equal(text.split("187 000").length - 1, 1, text);
  assert.equal(plain(await bar.locator('[data-testid="summary-bar-line"]').innerText()), "5 уроков из 12 в ноябре");
  assert.equal(await run.page.locator('[data-testid="enrol-by-student-toggle"]').count(), 0, "one period: nothing to open");
  await run.page.close();
  const two = await drawer([1]);
  await pickDay(two.page);
  assert.equal(plain(await two.page.locator('[data-testid="summary-bar-sum"]').innerText()), "469 000 сум");
  assert.match(plain(await two.page.locator('[data-testid="summary-bar-line"]').innerText()), /^за октябрь и ноябрь По периодам$/);
  await two.page.click('[data-testid="enrol-by-student-toggle"]');
  assert.deepEqual((await two.page.locator('[data-testid="enrol-by-student-row"]').allInnerTexts()).map(plain), ["Октябрь, с 27.10 · 2 урока из 9 89 000 сум", "Ноябрь, весь месяц 380 000 сум"]);
  await two.page.close();
});

test("«Зачислить в группу»: no «Выбрано: N» under the title, no «Эту цену получат…»; the price of the group is under the name and the count is on the button", async () => {
  for (const chosen of [[0], [0, 1]]) {
    const run = await drawer(chosen);
    await run.page.waitForSelector('[data-testid="enrol-terms"]');
    const dialog = plain(await run.page.locator('[role="dialog"]').evaluate((el) => { const c = el.cloneNode(true); c.querySelectorAll(".sr-only").forEach((n) => n.remove()); return c.textContent; }));
    assert.ok(!/Выбрано:|Эту цену/.test(dialog), dialog);
    assert.equal(plain(await run.page.locator('[data-testid="enrol-group-line"]').innerText()).split(" · ").pop(), "380 000 сум в месяц");
    assert.equal(plain(await run.page.locator('[data-testid="enrol-submit"]').innerText()), chosen.length === 1 ? "Зачислить" : "Зачислить двоих");
    await run.page.close();
  }
});

test("the statement: the green «Всё сходится» is not drawn, the red «Не сходится» stays (the source)", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "components", "payments", "statement-view.tsx"), "utf8");
  assert.ok(!src.includes('"Всё сходится"}') && /\{!reconciles && \(/.test(src) && src.includes("Не сходится: расхождение"));
});
