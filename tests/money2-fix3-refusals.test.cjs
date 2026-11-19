// Money-2 fix 3 / п.5: the new refusals are shown in the words of the server ONCE (by the CODE, not by a phrase): PAYMENT_RESTORE_SUPERSEDED (409, «Обновить»), RESTORE_OWNER_ONLY (403), LEAVE_UNDO_NO_START,
// TRANSFER_SOURCE_NOT_MEMBER, TRANSFER_SOURCE_GONE (409, «Обновить»), BACKDATE_OWNER_ONLY in the windows of pause / price; the screen has no number of days and hides no button by age.
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
const plain = (text) => text.replace(/[\s ]+/g, " ").trim();
const isDry = (request) => /dry_run=true/.test(request.query);
const times = (text, part) => text.split(part).length - 1;
const refuse = (status, code, message) => ({ status, json: { detail: { code, message } } });

async function restoreWindow(restore) {
  const answer = F.baseServer((request) => {
    if (request.path === "/auth/org/memberships/m-a/statement") return { json: F.statementWithVoided(F.SHORT) };
    if (request.path === "/auth/org/memberships/m-a/payments") return { json: F.paymentsList() };
    if (request.method === "POST" && request.path === "/auth/org/payments/p3/restore") return restore(request);
    return null;
  }, F.SHORT);
  const run = await openPage(browser, "money2.entry.tsx", answer, { width: 375, height: 800 });
  await run.page.evaluate(() => window.mount("statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
  await run.page.waitForSelector('[data-testid="statement-months"]');
  await run.page.getByText("Показать отменённые").click();
  await run.page.waitForSelector('section[aria-label="Отменённые записи"] li');
  await run.page.getByRole("button", { name: "Восстановить оплату" }).click();
  await run.page.waitForSelector('[data-testid="money-effects"][data-state="failed"]');
  return run;
}

test("п.5: PAYMENT_RESTORE_SUPERSEDED (409) - слова сервера один раз, действие «Обновить», нет «Повторить» и кнопки «Восстановить оплату» в подвале", async () => {
  const WORDS = "После отмены в эту группу уже внесена другая оплата — восстановить нельзя";
  const run = await restoreWindow(() => refuse(409, "PAYMENT_RESTORE_SUPERSEDED", WORDS));
  const dialog = plain(await run.page.locator('[role="dialog"]').evaluate((el) => el.innerText));
  assert.equal(times(dialog, WORDS), 1, dialog);
  assert.equal(await run.page.locator('[data-testid="money-effects-retry"]').count(), 0);
  assert.equal(await run.page.locator('[role="dialog"] button[type="submit"]').count(), 0);
  assert.equal(await run.page.getByRole("button", { name: "Обновить" }).count(), 1);
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  await run.page.close();
});

test("п.5: RESTORE_OWNER_ONLY (403) - слова сервера один раз, без «Повторить»", async () => {
  const WORDS = "Восстановить эту оплату может владелец";
  const run = await restoreWindow(() => refuse(403, "RESTORE_OWNER_ONLY", WORDS));
  const dialog = plain(await run.page.locator('[role="dialog"]').evaluate((el) => el.innerText));
  assert.equal(times(dialog, WORDS), 1, dialog);
  assert.equal(await run.page.locator('[data-testid="money-effects-retry"]').count(), 0);
  await run.page.close();
});

test("п.5: окно перевода — TRANSFER_SOURCE_NOT_MEMBER (422) без «Повторить»; TRANSFER_SOURCE_GONE (409) с «Обновить»; слова сервера один раз", async () => {
  for (const [status, code, words, refresh] of [[422, "TRANSFER_SOURCE_NOT_MEMBER", "Ученик не состоит в группе «Алгебра 7»", false], [409, "TRANSFER_SOURCE_GONE", "Ученика только что перевели или убрали", true]]) {
    const answer = F.baseServer((request) => (request.method === "POST" && request.path === "/auth/org/groups/gt/students/st1" ? refuse(status, code, words) : null), F.SHORT);
    const run = await openPage(browser, "money2.entry.tsx", answer, { width: 375, height: 800 });
    await run.page.evaluate((p) => window.mount("assign", { role: "owner", org_role: "owner" }, p), { moneyAvailable: true, sourceGroups: [F.SOURCES[0]], excludeGroupIds: ["ga"] });
    await run.page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
    await run.page.waitForSelector('[data-testid="transfer-preview"][data-state="failed"]');
    const dialog = plain(await run.page.locator('[role="dialog"]').evaluate((el) => el.innerText));
    assert.equal(times(dialog, words), 1, dialog);
    assert.equal(await run.page.locator('[data-testid="transfer-preview-retry"]').count(), 0, code);
    assert.equal(await run.page.locator('[data-testid="transfer-preview-refresh"]').count(), refresh ? 1 : 0, code);
    await run.page.close();
  }
});

test("п.5: окно записи — LEAVE_UNDO_NO_START (422) при записи: слова сервера один раз", async () => {
  const WORDS = "Ученика убрали сегодня — он возвращается как был. Новую дату оплаты, остаток и цену при этом задать нельзя: цену можно изменить отдельно после возврата";
  const answer = F.baseServer((request) => (request.method === "POST" && request.path === "/auth/org/groups/gt/students/st1" && !isDry(request) ? refuse(422, "LEAVE_UNDO_NO_START", WORDS) : null), F.SHORT);
  const run = await openPage(browser, "money2.entry.tsx", answer, { width: 375, height: 800 });
  await run.page.evaluate((p) => window.mount("assign", { role: "owner", org_role: "owner" }, p), { moneyAvailable: true, mode: "add", sourceGroups: [], excludeGroupIds: [] });
  await run.page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
  await run.page.click('[data-testid="assign-submit"]');
  await run.page.waitForSelector('[role="alert"]');
  assert.equal(times(plain(await run.page.locator('[role="dialog"]').evaluate((el) => el.innerText)), WORDS), 1);
  await run.page.close();
});

test("п.5: BACKDATE_OWNER_ONLY в окне паузы — слова сервера один раз, без «повторите»", async () => {
  const WORDS = "Запись старше 7 дней меняет владелец";
  const answer = F.baseServer((request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m-a/pauses") return { json: [] };
    if (request.method === "POST" && request.path === "/auth/org/memberships/m-a/pauses") return refuse(403, "BACKDATE_OWNER_ONLY", WORDS);
    return null;
  });
  const run = await openPage(browser, "money2.entry.tsx", answer, { width: 375, height: 800 });
  await run.page.evaluate(() => window.mount("pause", { role: "owner", org_role: "owner" }, { moneyAvailable: true, groupName: "Алгебра 7" }));
  await run.page.waitForSelector("#pause-first");
  await run.page.fill("#pause-first", "01.01.2026");
  await run.page.fill("#pause-last", "03.01.2026");
  await run.page.waitForSelector('[data-testid="pause-calc"] [role="alert"]');
  const dialog = plain(await run.page.locator('[role="dialog"]').evaluate((el) => el.innerText));
  assert.equal(times(dialog, WORDS), 1, dialog);
  assert.ok(!/повторите/i.test(dialog), "no «повторите» over a refusal that repeating cannot change");
  await run.page.close();
});

test("п.6 (375): подпись «сейчас в «…»» под названием окна — без точки в начале строки (точка стоит за классом и не отрывается от него); имя ученика — в самом названии", async () => {
  const run = await openPage(browser, "money2.entry.tsx", F.baseServer(() => null, F.SHORT), { width: 375, height: 800 });
  await run.page.evaluate((p) => window.mount("assign", { role: "owner", org_role: "owner" }, p), { moneyAvailable: true, sourceGroups: [F.SOURCES[0]], excludeGroupIds: ["ga"], studentName: "Каримов Фарход Абдуллаевич", currentGroupName: F.A });
  await run.page.waitForSelector('[data-testid="assign-current-caption"]');
  const text = plain(await run.page.textContent('[data-testid="assign-current-caption"]'));
  assert.ok(!text.startsWith("·") && /^сейчас в «/.test(text), text);
  const line = await run.page.evaluate(() => document.querySelector('[data-testid="assign-current-group"]').textContent);
  assert.match(line, /^8 класс\u00a0· сейчас в «/, "the dot is glued to the class by a non-breaking space");
  assert.equal(await run.page.getByRole("dialog", { name: "Перевести: Каримов Фарход Абдуллаевич" }).count(), 1);
  await run.page.close();
});
