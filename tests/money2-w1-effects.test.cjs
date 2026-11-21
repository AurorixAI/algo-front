// Money-2 wave 1, Э1 (Т3-Т6): the window of the transfer says what MOVES / STAYS / ENDS in the words and sums of the server (`effects`), once; the sum of the dry run rides in `expected_carried`;
// 409 `BALANCE_CHANGED` -> «Данные изменились — проверьте числа» and a new dry run; the leaving undone (`leave_undo`) is said in the server's words; a role without the right to money sees
// the same facts without a sum and is not stopped.
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

const plain = (text) => text.replace(/\s+/g, " ").replace(/ /g, " ").trim();
const isDry = (request) => /dry_run=true/.test(request.query);
const posts = (calls) => calls.filter((call) => call.method === "POST" && /\/groups\/gt\/students\/st1/.test(call.path));

async function open(width, answer, { money = true, props = {} } = {}) {
  const run = await openPage(browser, "money2.entry.tsx", answer, { width, height: 900 });
  await run.page.evaluate((p) => window.mount("assign", { role: "owner", org_role: "owner" }, p), { moneyAvailable: money, sourceGroups: [F.SOURCES[0]], excludeGroupIds: ["ga"], ...props });
  await run.page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
  return run;
}
const sectionTitles = async (page) => (await page.locator('[data-testid="transfer-effects"] h4').allTextContents()).map(plain);
const rows = async (page, key) => (await page.locator(`[data-testid="effects-${key}"] li`).evaluateAll((items) => items.map((li) => [...li.children].map((child) => child.textContent.replace(/[\s\u00a0]+/g, " ").trim()))));
const visible = async (page) => plain(await page.locator('[role="dialog"]').evaluate((el) => el.innerText));

test("Э1 / А7: «Что изменится» is SHORT ROWS «что → значение» from the structure of `effects` - the group is named once in the title of its block; the sentences of the server are under «Подробнее»; the old `carried` sentence is not said", async () => {
  const effects = F.transferEffects({ names: F.SHORT });
  const run = await open(1280, F.baseServer((request) => request.path === "/auth/org/groups/gt/students/st1"
    ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(request), effects, carried: [{ code: "transfer_balance_after", message: "Старая фраза про 440 000 сум" }] } } : null, F.SHORT));
  await run.page.waitForSelector('[data-testid="transfer-effects"]');
  assert.deepEqual(await sectionTitles(run.page), [`Перейдёт в «Физика 9»`, `Останется в группе «Алгебра 7»`, "Закончится"]);
  assert.deepEqual(await rows(run.page, "money"), [["Деньги ученика", "440 000 сум"], ["Пауза", "23–26.11"], ["«Оплата с»", "30.11"]]);
  assert.deepEqual(await rows(run.page, "stays"), [["Аванс", "40 000 сум"]]);
  assert.deepEqual(await rows(run.page, "ends"), [["Индивидуальная цена", "300 000 сум"], ["Цена с 01.12", "250 000 сум"]]);
  const dialog = await visible(run.page);
  assert.ok(!/Старая фраза/.test(dialog), "the sentence of `carried` is not said next to `effects`");
  assert.ok(!/переходят в группу|останется за учеником/.test(dialog), "the whole sentences of the server are folded");
  assert.equal((dialog.match(/(?<!\d)40 000 сум/g) ?? []).length, 1, "the advance that stays is said once");
  const block = plain(await run.page.locator('[data-testid="transfer-effects"]').evaluate((el) => el.innerText));
  assert.equal((block.match(/Алгебра 7/g) ?? []).length, 1, "the source group is named once in the block (the title of its part)");
  assert.equal((block.match(/Физика 9/g) ?? []).length, 1, "the target is named once in the block");
  await run.page.locator('[data-testid="effects-full"] summary').click();
  const opened = await visible(run.page);
  for (const item of [...effects.moves, ...effects.stays, ...effects.ends]) assert.ok(opened.includes(plain(item.text)), `the full text of ${item.code}`);
  await run.page.close();
});

test("А7: a field the structure lacks is not guessed - the sentence of the server stands as the row", async () => {
  const effects = F.transferEffects({ names: F.SHORT });
  effects.moves[1] = { ...effects.moves[1], first_day: undefined, last_day: undefined };
  const run = await open(1280, F.baseServer((request) => request.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, effects } } : null, F.SHORT));
  await run.page.waitForSelector('[data-testid="transfer-effects"]');
  assert.deepEqual((await rows(run.page, "money"))[1], [plain(effects.moves[1].text)]);
  await run.page.close();
});

test("Т5: the sum of the dry run rides in `expected_carried`; 409 `BALANCE_CHANGED` -> the server's words «Сумма изменилась, откройте окно заново» in the window, a NEW dry run, the day of the probe rides in `expected_as_of`, the new sum is sent by the second press", async () => {
  let carried = 440000;
  let writes = 0;
  const run = await open(1280, F.baseServer((request) => {
    if (request.path !== "/auth/org/groups/gt/students/st1") return null;
    if (isDry(request)) return { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, as_of: "2026-11-21", effects: F.transferEffects({ carried }) } };
    writes += 1;
    if (writes === 1) { carried = 465000; return { status: 409, json: { detail: { code: "BALANCE_CHANGED", message: "Сумма изменилась, откройте окно заново", fresh: [{ carried: 465000 }], carried: 440000 } } }; }
    return { json: { student_id: "st1", group_id: "gt", status: "added", effects: F.transferEffects({ carried }) } };
  }));
  await run.page.waitForSelector('[data-testid="transfer-effects"]');
  assert.ok(/440 000/.test(plain(await run.page.textContent('[data-testid="effects-money"]'))));
  await run.page.click('[data-testid="assign-submit"]');
  await run.page.waitForSelector('[data-testid="transfer-changed"]');
  assert.equal(plain(await run.page.textContent('[data-testid="transfer-changed"]')), "Сумма изменилась, откройте окно заново", "the words are the server's, not the screen's");
  assert.equal(posts(run.calls).filter((call) => !isDry(call))[0].body.expected_carried, 440000);
  assert.equal(posts(run.calls).filter((call) => !isDry(call))[0].body.expected_as_of, "2026-11-21", "the business day of the probe is sent back");
  await run.page.waitForFunction(() => /465 000/.test(document.querySelector('[data-testid="effects-money"]')?.textContent ?? ""));
  assert.equal(await run.page.locator('[data-tone]').count(), 0, "nothing is written, the window stays");
  assert.ok(posts(run.calls).filter((call) => isDry(call)).length >= 2, "the dry run is asked again");
  await run.page.click('[data-testid="assign-submit"]');
  await run.page.waitForSelector('[data-tone]');
  assert.equal(posts(run.calls).filter((call) => !isDry(call))[1].body.expected_carried, 465000);
  await run.page.close();
});

test("PAY-TAILS: a page that gives `onStale` - the refusal «Сумма изменилась, откройте окно заново» of a transfer closes the window and the page says the server's words; nothing is written", async () => {
  const run = await open(1280, F.baseServer((request) => {
    if (request.path !== "/auth/org/groups/gt/students/st1") return null;
    if (isDry(request)) return { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, as_of: "2026-11-21", effects: F.transferEffects({ carried: 440000 }) } };
    return { status: 409, json: { detail: { code: "BALANCE_CHANGED", message: "Сумма изменилась, откройте окно заново" } } };
  }), { props: { withStale: true } });
  await run.page.waitForSelector('[data-testid="transfer-effects"]');
  await run.page.click('[data-testid="assign-submit"]');
  await run.page.waitForFunction(() => window.__log.some((line) => String(line).startsWith("stale:")));
  const log = await run.page.evaluate(() => window.__log);
  assert.ok(log.includes("close") && log.includes("stale:Сумма изменилась, откройте окно заново"), JSON.stringify(log));
  assert.ok(!log.includes("assigned"));
  assert.equal(await run.page.locator('[data-testid="transfer-changed"]').count(), 0, "the window is gone: no second notice");
  await run.page.close();
});

test("Т6: coming back the day of the leaving - `leave_undo` in the words of the server: the leaving is undone and what is restored; the same in the transfer and in the add", async () => {
  const undo = { undone: true, text: "Ученика убрали сегодня — возвращаем как было: цены и паузы возвращены", restored: [{ code: "individual_price", text: "Индивидуальная цена 300 000 сум возвращена" }, { code: "pause", text: "Пауза 23.11–26.11 возвращена" }] };
  const answer = (extra) => F.baseServer((request) => request.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(request), leave_undo: undo, ...extra } } : null);
  for (const mode of ["transfer", "add"]) {
    const run = await open(1280, answer(mode === "transfer" ? { effects: F.transferEffects() } : {}), { props: mode === "add" ? { mode: "add", currentGroupName: "Алгебра", excludeGroupIds: ["ga"] } : {} });
    await run.page.waitForSelector('[data-testid="assign-submit"]:not([disabled])');
    await run.page.waitForTimeout(600);
    assert.equal(await run.page.locator('[data-testid="leave-undo"]').count(), 0, `${mode}: no plate before the action`);
    await run.page.click('[data-testid="assign-submit"]');
    await run.page.waitForSelector('[data-tone]');
    const text = plain(await run.page.locator('[data-tone]').evaluate((el) => el.innerText));
    assert.ok(text.includes("возвращаем как было: цены и паузы возвращены") && !text.includes("Индивидуальная цена 300 000 сум возвращена") && !text.includes("Пауза 23.11–26.11 возвращена"), `${mode}: ${text}`);
    await run.page.close();
  }
  const plainReturn = { undone: false, text: "Сегодня ученика перевели в группу «Физика». Чтобы вернуть всё как было, переведите его обратно из этой группы", restored: [] };
  const run = await open(1280, F.baseServer((request) => request.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, leave_undo: plainReturn } } : null), { props: { mode: "add", currentGroupName: "Алгебра" } });
  await run.page.waitForSelector('[data-testid="enrol-note-rewrite"]');
  assert.ok(plain(await run.page.textContent('[data-testid="enrol-note-rewrite"]')).includes("переведите его обратно из этой группы"), "an ordinary return: the server's words under «Записывается заново»");
  await run.page.close();
});

test("И5: a role without the right to money sees the same facts without a sum, `expected_carried` is not sent and the window is not a dead end; empty effects - no block", async () => {
  const effects = F.transferEffects({ money: false });
  const run = await open(1280, F.baseServer((request) => request.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(request), effects } } : null), { money: false });
  await run.page.waitForSelector('[data-testid="transfer-effects"]');
  const text = plain(await run.page.textContent('[data-testid="transfer-effects"]'));
  assert.ok(!/сум/.test(text.replace(/дни паузы/g, "")), text);
  assert.ok(text.includes("останется аванс") && text.includes("Индивидуальная цена в группе"));
  await run.page.click('[data-testid="assign-submit"]');
  await run.page.waitForSelector('[data-tone]');
  const write = posts(run.calls).filter((call) => !isDry(call))[0];
  assert.ok(!write.body || !("expected_carried" in write.body));
  await run.page.close();

  const empty = await open(1280, F.baseServer((request) => request.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(request), effects: { kind: "transfer", moves: [], stays: [], ends: [], money_text: null, texts: [] } } } : null), { money: false });
  await empty.page.waitForTimeout(900);
  assert.equal(await empty.page.locator('[data-testid="transfer-preview"]').count(), 0);
  assert.equal(await empty.page.locator('[data-testid="assign-submit"]').isDisabled(), false);
  await empty.page.close();
});

test("А7: a role without the right to money - the same short rows without a sum: «Аванс», «Индивидуальная цена», a pause with its days; no digit of money, no dead end", async () => {
  const effects = F.transferEffects({ money: false, names: F.SHORT });
  const run = await open(375, F.baseServer((request) => request.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(request), effects } } : null, F.SHORT), { money: false });
  await run.page.waitForSelector('[data-testid="transfer-effects"]');
  assert.deepEqual(await rows(run.page, "stays"), [["Аванс"]]);
  assert.deepEqual((await rows(run.page, "money")).map((row) => row[0]), ["Пауза", "«Оплата с»"]);
  assert.ok(!/сум/.test(await visible(run.page)), "no sum without the right");
  assert.equal(await run.page.locator('[data-testid="assign-submit"]').isDisabled(), false);
  await run.page.close();
});
