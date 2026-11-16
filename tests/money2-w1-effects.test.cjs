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
  await run.page.click(`text=${F.T.slice(0, 20)}`);
  return run;
}
const sectionTitles = async (page) => (await page.locator('[data-testid="transfer-effects"] h4').allTextContents()).map(plain);
const rows = async (page, key) => (await page.locator(`[data-testid="effects-${key}"] li`).allTextContents()).map(plain);

test("Э1: «Что изменится» is the server's `effects` as sections - «Перейдёт», «Останется в группе …», «Закончится», «Перейдёт вместе с учеником» - each sentence once, the old `carried` sentence is not repeated", async () => {
  const effects = F.transferEffects();
  const run = await open(1280, F.baseServer((request) => request.path === "/auth/org/groups/gt/students/st1"
    ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(request), effects, carried: [{ code: "transfer_balance_after", message: "Старая фраза про 440 000 сум" }] } } : null));
  await run.page.waitForSelector('[data-testid="transfer-effects"]');
  assert.deepEqual(await sectionTitles(run.page), ["Перейдёт", `Останется в группе «${F.A}»`, "Закончится", "Перейдёт вместе с учеником"]);
  assert.deepEqual(await rows(run.page, "money"), [plain(effects.moves[0].text)]);
  assert.deepEqual(await rows(run.page, "stays"), [plain(effects.stays[0].text)]);
  assert.deepEqual(await rows(run.page, "ends"), effects.ends.map((item) => plain(item.text)));
  assert.deepEqual(await rows(run.page, "with"), [plain(effects.moves[1].text), plain(effects.moves[2].text)]);
  const dialog = plain(await run.page.textContent('[role="dialog"]'));
  assert.ok(!/Старая фраза/.test(dialog), "the sentence of `carried` is not said next to `effects`");
  assert.equal((dialog.match(/120 000 сум/g) ?? []).length, 1, "the debt is said once");
  await run.page.close();
});

test("Т5: the sum of the dry run rides in `expected_carried`; 409 `BALANCE_CHANGED` -> the notice «Данные изменились — проверьте числа», a NEW dry run, the new sum is sent by the second press", async () => {
  let carried = 440000;
  let writes = 0;
  const run = await open(1280, F.baseServer((request) => {
    if (request.path !== "/auth/org/groups/gt/students/st1") return null;
    if (isDry(request)) return { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, effects: F.transferEffects({ carried }) } };
    writes += 1;
    if (writes === 1) { carried = 465000; return { status: 409, json: { detail: { code: "BALANCE_CHANGED", message: "Данные оплат изменились — проверьте числа", fresh: [{ carried: 465000 }], carried: 440000 } } }; }
    return { json: { student_id: "st1", group_id: "gt", status: "added", effects: F.transferEffects({ carried }) } };
  }));
  await run.page.waitForSelector('[data-testid="transfer-effects"]');
  assert.ok(/440 000/.test(plain(await run.page.textContent('[data-testid="effects-money"]'))));
  await run.page.click('[data-testid="assign-submit"]');
  await run.page.waitForSelector('[data-testid="transfer-changed"]');
  assert.equal(plain(await run.page.textContent('[data-testid="transfer-changed"]')), "Данные изменились — проверьте числа");
  assert.equal(posts(run.calls).filter((call) => !isDry(call))[0].body.expected_carried, 440000);
  await run.page.waitForFunction(() => /465 000/.test(document.querySelector('[data-testid="effects-money"]')?.textContent ?? ""));
  assert.equal(await run.page.locator('[data-testid="assign-done"]').count(), 0, "nothing is written, the window stays");
  assert.ok(posts(run.calls).filter((call) => isDry(call)).length >= 2, "the dry run is asked again");
  await run.page.click('[data-testid="assign-submit"]');
  await run.page.waitForSelector('[data-testid="assign-done"]');
  assert.equal(posts(run.calls).filter((call) => !isDry(call))[1].body.expected_carried, 465000);
  await run.page.close();
});

test("Т6: coming back the day of the leaving - `leave_undo` in the words of the server: the leaving is undone and what is restored; the same in the transfer and in the add", async () => {
  const undo = { undone: true, text: "Ученик вернулся в день ухода — уход отменён: цены и паузы возвращены", restored: [{ code: "individual_price", text: "Индивидуальная цена 300 000 сум возвращена" }, { code: "pause", text: "Пауза 23.11–26.11 возвращена" }] };
  const answer = (extra) => F.baseServer((request) => request.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(request), leave_undo: undo, ...extra } } : null);
  for (const mode of ["transfer", "add"]) {
    const run = await open(1280, answer(mode === "transfer" ? { effects: F.transferEffects() } : {}), { props: mode === "add" ? { mode: "add", currentGroupName: "Алгебра", excludeGroupIds: ["ga"] } : {} });
    await run.page.waitForSelector('[data-testid="leave-undo"]');
    const text = plain(await run.page.textContent('[data-testid="leave-undo"]'));
    assert.ok(text.includes("уход отменён: цены и паузы возвращены") && text.includes("Индивидуальная цена 300 000 сум возвращена") && text.includes("Пауза 23.11–26.11 возвращена"), `${mode}: ${text}`);
    await run.page.close();
  }
  const plainReturn = { undone: false, text: "Ученик вернулся не в день ухода: возврат обычный — ученика перевели в «Физика»; отменить перевод можно обратным переводом", restored: [] };
  const run = await open(1280, F.baseServer((request) => request.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, leave_undo: plainReturn } } : null), { props: { mode: "add", currentGroupName: "Алгебра" } });
  await run.page.waitForSelector('[data-testid="leave-undo"]');
  assert.ok(plain(await run.page.textContent('[data-testid="leave-undo"]')).includes("возврат обычный"));
  await run.page.close();
});

test("И5: a role without the right to money sees the same facts without a sum, `expected_carried` is not sent and the window is not a dead end; empty effects - no block", async () => {
  const effects = F.transferEffects({ money: false });
  const run = await open(1280, F.baseServer((request) => request.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(request), effects } } : null), { money: false });
  await run.page.waitForSelector('[data-testid="transfer-effects"]');
  const text = plain(await run.page.textContent('[data-testid="transfer-effects"]'));
  assert.ok(!/сум/.test(text.replace(/дни паузы/g, "")), text);
  assert.ok(text.includes("останется долг") && text.includes("Индивидуальная цена в группе"));
  await run.page.click('[data-testid="assign-submit"]');
  await run.page.waitForSelector('[data-testid="assign-done"]');
  const write = posts(run.calls).filter((call) => !isDry(call))[0];
  assert.ok(!write.body || !("expected_carried" in write.body));
  await run.page.close();

  const empty = await open(1280, F.baseServer((request) => request.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(request), effects: { kind: "transfer", moves: [], stays: [], ends: [], money_text: null, texts: [] } } } : null), { money: false });
  await empty.page.waitForTimeout(900);
  assert.equal(await empty.page.locator('[data-testid="transfer-preview"]').count(), 0);
  assert.equal(await empty.page.locator('[data-testid="assign-submit"]').isDisabled(), false);
  await empty.page.close();
});
