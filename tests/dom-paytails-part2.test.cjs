// PAY-TAILS, screens part 2 (Б2.4): the windows of LEAVING a group and of the ARCHIVE of a student (and the probe of a TRANSFER) in a real browser (headless Chromium, the CSS of the project): «что было → что станет»
// (`recalc`: bold line + grey basis), the sentence about the other group (`others`), the outcome in ONE sentence of the server, the choices with the sums, the item of `settle` for EVERY membership with
// `expected_unpaid` / `expected_advance` / `expected_as_of` (Б5.1), the refusal «Сумма изменилась, откройте окно заново» (the window closes, the server's words, nothing written), the message after (the lines of the result).
// Table «field of the answer -> where it is shown»: tests/PAY_TAILS_PART2_FIELDS in the commit message; the stub of the server is tests/helpers/paytails-fixture2.cjs.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const X = require("./helpers/paytails-fixture2.cjs");
const F = require("./helpers/money2-fixture.cjs");

const root = path.join(__dirname, "..");
const ctx = { browser: null };
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  ctx.browser = await launch();
});
test.after(async () => { await ctx.browser.close(); });

const plain = (text) => text.replace(/[\s  ]+/g, " ").trim();
const OWNER = { role: "owner", org_role: "owner" };
const WIDTHS = [1440, 1280, 1024, 768, 375];
const dialogText = async (page) => plain(await page.locator('[role="dialog"]').innerText());
async function noOverflow(page, label) {
  const facts = await page.evaluate(layoutProbe, '[role="dialog"]');
  assert.equal(facts.scroll, 0, `${label}: sideways scroll`);
  assert.deepEqual(facts.bad, [], `${label}: ${facts.bad.join(" | ")}`);
}
async function openLeave(memberships, { post, width = 1280, user = OWNER, as_of } = {}) {
  const run = await openPage(ctx.browser, "money2.entry.tsx", X.F.baseServer(X.leaveServer(memberships, post, as_of)), { width, height: width <= 375 ? 812 : 900 });
  await run.page.evaluate(([u]) => window.mount("leave-lines", u), [user]);
  await run.page.waitForSelector('[role="dialog"]');
  await run.page.waitForSelector('[data-testid="settle-membership"]');
  return run;
}
const log = (page) => page.evaluate(() => window.__log);
const settleBody = (calls) => calls.find((call) => call.method === "POST" && /\/leave$/.test(call.path))?.body;

test("frame 6 (a debt): «что было → что станет» in bold with the basis grey, the outcome of the server, the choices with the sum; no «Ученик останется в системе…»; the sum of the recalc is the server's", async () => {
  const run = await openLeave([X.LEAVE_DEBT()]);
  const text = await dialogText(run.page);
  assert.equal(plain(await run.page.locator('[data-testid="recalc-line"] p').first().innerText()), "Ноябрь: 600 000 → 415 000 сум");
  assert.equal(plain(await run.page.locator('[data-testid="recalc-basis"]').innerText()), "пересчёт по день ухода · 9 уроков из 13");
  assert.match(await run.page.locator('[data-testid="recalc-line"] p').first().getAttribute("class"), /font-semibold/);
  assert.equal(plain(await run.page.locator('[data-testid="settle-words"]').innerText()), "Останется долг 415 000 сум");
  assert.ok(text.includes("Оставить долг — оплатить можно и после ухода") && text.includes("Простить 415 000 сум"), text);
  assert.ok(!text.includes("останется в системе") && !text.includes("Простить сумму") && !text.includes("Оставить как есть"), text);
  // the order of the block: the recalc, then the outcome, then the choices
  assert.ok(text.indexOf("Ноябрь:") < text.indexOf("Останется долг") && text.indexOf("Останется долг") < text.indexOf("Оставить долг"), text);
  await run.page.close();
});

test("frame 7 (the month is paid whole): the outcome «Останется аванс 185 000 сум», «Вернуть 185 000 сум» / «Оставить на счёте»; the screen makes up no sentence about the advance", async () => {
  const run = await openLeave([X.LEAVE_ADVANCE()]);
  const text = await dialogText(run.page);
  assert.equal(plain(await run.page.locator('[data-testid="settle-words"]').innerText()), "Останется аванс 185 000 сум");
  assert.ok(text.includes("Вернуть 185 000 сум") && text.includes("Оставить на счёте"), text);
  assert.ok(!text.includes("Что сделать?") && !text.includes("После ухода у ученика"), text);
  // the server said nothing about the advance (no sentence in `stays`): the screen says nothing either, the choices keep the number of the server
  const quiet = X.LEAVE_ADVANCE(); quiet.effects.stays = [];
  const silent = await openLeave([quiet]);
  assert.equal(await silent.page.locator('[data-testid="settle-words"]').count(), 0);
  assert.ok((await dialogText(silent.page)).includes("Вернуть 185 000 сум"));
  await run.page.close(); await silent.page.close();
});

test("frame 9 (a second group): the server's sentence with the MONEY of the other group stands between the recalc and the outcome, as it is", async () => {
  const run = await openLeave([X.LEAVE_DEBT({ others: [X.OTHERS_9] })]);
  const text = await dialogText(run.page);
  assert.equal(plain(await run.page.locator('[data-testid="settle-others"]').innerText()), plain(X.OTHERS_9));
  assert.ok(text.indexOf("Ноябрь:") < text.indexOf("В группе «Английский 7»") && text.indexOf("В группе «Английский 7»") < text.indexOf("Останется долг"), text);
  // `others` as one string or as {text} objects: the same
  const asString = await openLeave([X.LEAVE_DEBT({ others: X.OTHERS_9 })]);
  assert.equal(plain(await asString.page.locator('[data-testid="settle-others"]').innerText()), plain(X.OTHERS_9));
  await run.page.close(); await asString.page.close();
});

test("a sum «к оплате» that stays (another group remains) is not named a debt: «Оставить как есть»; the forgiveness names the sum", async () => {
  const run = await openLeave([X.LEAVE_DUE()]);
  const text = await dialogText(run.page);
  assert.ok(text.includes("Оставить как есть — оплатить можно и после ухода") && !text.includes("Оставить долг"), text);
  assert.ok(text.includes("Простить 125 000 сум"), text);
  await run.page.close();
});

test("the list is cut by the server at two lines: «и ещё 2 периода»; a line without a text is dropped; no change of the charge - no block", async () => {
  const cut = await openLeave([X.LEAVE_DEBT({ recalc: X.RECALC_CUT })]);
  const lines = (await cut.page.locator('[data-testid="recalc-line"] p:first-child').allInnerTexts()).map(plain);
  assert.deepEqual(lines, ["Ноябрь: 600 000 → 415 000 сум", "Декабрь не начнётся: 300 000 сум останутся авансом"]);
  assert.equal(plain(await cut.page.locator('[data-testid="recalc-more"]').innerText()), "и ещё 2 периода");
  const none = await openLeave([X.LEAVE_DEBT({ recalc: [{ label: "Ноябрь", before: 1, after: 2 }] })]);
  assert.equal(await none.page.locator('[data-testid="settle-recalc"]').count(), 0, "a line without the server's text is not drawn");
  const quiet = await openLeave([X.LEAVE_DEBT({ recalc: undefined })]);
  assert.equal(await quiet.page.locator('[data-testid="settle-recalc"]').count(), 0, "the server sent no recalc: no block, no invented words");
  await cut.page.close(); await none.page.close(); await quiet.page.close();
});

test("Б5.1: the request carries an item for EVERY membership - also «оставить» - with what was shown (`expected_unpaid`, `expected_advance`, `expected_as_of` of the probe)", async () => {
  const run = await openLeave([X.LEAVE_DEBT()]);
  await run.page.getByRole("button", { name: "Убрать из группы" }).click();
  await run.page.waitForFunction(() => window.__log.length > 0);
  assert.deepEqual(settleBody(run.calls), { settle: [{ membership_id: "m-a", action: "keep", expected_unpaid: 415000, expected_advance: 0, expected_as_of: "2026-11-21" }] });
  await run.page.close();
  // forgive: the reason is needed, the sum shown rides along
  const forgive = await openLeave([X.LEAVE_DEBT()]);
  await forgive.page.getByLabel("Простить 415 000 сум").check();
  await forgive.page.getByLabel(/Причина/).fill("договорённость с родителем");
  await forgive.page.getByRole("button", { name: "Убрать из группы" }).click();
  await forgive.page.waitForFunction(() => window.__log.length > 0);
  assert.deepEqual(settleBody(forgive.calls).settle, [{ membership_id: "m-a", action: "writeoff", expected_unpaid: 415000, expected_advance: 0, expected_as_of: "2026-11-21", reason: "договорённость с родителем" }]);
  await forgive.page.close();
  // an advance given back: the sum of the refund + the check of the shown advance
  const refund = await openLeave([X.LEAVE_ADVANCE()]);
  await refund.page.getByLabel("Вернуть 185 000 сум").check();
  await refund.page.getByRole("radio", { name: "Наличные" }).click();
  await refund.page.getByRole("button", { name: "Убрать из группы" }).click();
  await refund.page.waitForFunction(() => window.__log.length > 0);
  assert.deepEqual(settleBody(refund.calls).settle, [{ membership_id: "m-a", action: "refund", expected_unpaid: 0, expected_advance: 185000, expected_as_of: "2026-11-21", expected_refundable: 185000, method: "cash" }]);
  await refund.page.close();
  // a membership with nothing to settle is still an item (the day of the probe is checked too)
  const nothing = await openLeave([X.leaveRow({ amount: 0, stay: "x" })].map((m) => ({ ...m, money: { ...m.money, unpaid: 0, debt_amount: 0 }, has_open_balance: false, effects: null })));
  await nothing.page.getByRole("button", { name: "Убрать из группы" }).click();
  await nothing.page.waitForFunction(() => window.__log.length > 0);
  assert.deepEqual(settleBody(nothing.calls).settle, [{ membership_id: "m-a", action: "keep", expected_unpaid: 0, expected_advance: 0, expected_as_of: "2026-11-21" }]);
  await nothing.page.close();
});

test("Б5.1: a role without the right to money has no `money`: no item and no `expected_*` - it is not refused by the check", async () => {
  const blind = X.LEAVE_DEBT(); blind.money = null; blind.effects.stays = blind.effects.stays.map(({ amount, ...rest }) => rest);
  const run = await openLeave([blind], { user: { role: "admin", org_role: "admin" } });
  await run.page.getByRole("button", { name: "Убрать из группы" }).click();
  await run.page.waitForFunction(() => window.__log.length > 0);
  assert.deepEqual(settleBody(run.calls), { settle: [] });
  await run.page.close();
});

test("frame 8 (the message after): the lines of the result - what the charge became (`recalc`), then what stays - are given to the page, the server's words", async () => {
  const run = await openLeave([X.LEAVE_DEBT()]);
  await run.page.getByRole("button", { name: "Убрать из группы" }).click();
  await run.page.waitForFunction(() => window.__log.length > 0);
  assert.deepEqual((await log(run.page)).map(plain), ["left:Ноябрь: 600 000 → 415 000 сум | Долг 415 000 сум остался за учеником", "close"].map(plain));
  await run.page.close();
  // `others` of the result (a second group) is told too
  const second = await openLeave([X.LEAVE_DEBT()], { post: () => ({ json: { ...X.LEAVE_RESULT_DEBT, others: [X.OTHERS_9] } }) });
  await second.page.getByRole("button", { name: "Убрать из группы" }).click();
  await second.page.waitForFunction(() => window.__log.length > 0);
  assert.match(plain((await log(second.page))[0]), /Ноябрь: .* \| В группе «Английский 7».* \| Долг 415 000 сум остался за учеником/);
  await second.page.close();
});

test("Б5.1: «Сумма изменилась, откройте окно заново» (a payment came in / the midnight passed): the window closes, the server's words go to the page, nothing is written twice; no old «Данные оплат изменились»", async () => {
  const run = await openLeave([X.LEAVE_DEBT()], { post: () => X.STALE_409 });
  await run.page.getByRole("button", { name: "Убрать из группы" }).click();
  await run.page.waitForFunction(() => window.__log.length > 0);
  assert.deepEqual(await log(run.page), ["close", "stale:Сумма изменилась, откройте окно заново"]);
  assert.equal(run.calls.filter((call) => call.method === "POST").length, 1, "one write attempt, no repeat");
  assert.ok(!(await dialogText(run.page)).includes("Данные оплат изменились"));
  await run.page.close();
});

test("the archive of a student: each group has its block; every membership is an item with the shown numbers; the message after carries the lines of the result", async () => {
  const second = X.LEAVE_ADVANCE({ membership_id: "m-b", group_id: "gb", group_name: "Физика 8" });
  second.effects.stays[0] = { ...second.effects.stays[0], membership_id: "m-b" };
  const run = await openPage(ctx.browser, "money2.entry.tsx", X.F.baseServer(X.archiveServer([X.LEAVE_DEBT({ others: [X.OTHERS_9] }), second])), { width: 1280, height: 900 });
  await run.page.evaluate(() => window.mount("archive-lines", { role: "owner", org_role: "owner" }, { groupNames: ["Математика 7", "Физика 8"] }));
  await run.page.waitForSelector('[data-testid="settle-membership"]');
  assert.equal(await run.page.locator('[data-testid="settle-membership"]').count(), 2);
  assert.equal(await run.page.locator('[data-testid="settle-recalc"]').count(), 2);
  const text = await dialogText(run.page);
  assert.ok(text.includes("Простить 415 000 сум") && text.includes("Вернуть 185 000 сум") && text.includes("Оставить на счёте"), text);
  await run.page.getByRole("button", { name: "В архив" }).click();
  await run.page.waitForFunction(() => window.__log.length > 0);
  assert.deepEqual(run.calls.find((call) => call.method === "POST").body.settle, [
    { membership_id: "m-a", action: "keep", expected_unpaid: 415000, expected_advance: 0, expected_as_of: "2026-11-21" },
    { membership_id: "m-b", action: "keep", expected_unpaid: 0, expected_advance: 185000, expected_as_of: "2026-11-21" },
  ]);
  assert.equal(plain((await log(run.page))[0]), "archived:Ноябрь: 600 000 → 415 000 сум | Долг 415 000 сум остался за учеником");
  await run.page.close();
});

test("the archive of a student: «Сумма изменилась…» - the window is left to the page with the server's words, nothing is written", async () => {
  const run = await openPage(ctx.browser, "money2.entry.tsx", X.F.baseServer(X.archiveServer([X.LEAVE_DEBT()], () => X.STALE_409)), { width: 1280, height: 900 });
  await run.page.evaluate(() => window.mount("archive-lines", { role: "owner", org_role: "owner" }, { groupNames: ["Математика 7"] }));
  await run.page.waitForSelector('[data-testid="settle-membership"]');
  await run.page.getByRole("button", { name: "В архив" }).click();
  await run.page.waitForFunction(() => window.__log.length > 0);
  assert.deepEqual(await log(run.page), ["stale:Сумма изменилась, откройте окно заново"]);
  await run.page.close();
});

test("the probe of a TRANSFER: the lines `recalc` of the group the student leaves and `others` (the new group) stand over the sections; no lines - the sections only", async () => {
  const effects = F.transferEffects({ names: F.SHORT });
  const answer = (extra) => F.baseServer((request) => request.path === "/auth/org/groups/gt/students/st1"
    ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: /dry_run=true/.test(request.query), effects, ...extra } } : null, F.SHORT);
  const run = await openPage(ctx.browser, "money2.entry.tsx", answer({ recalc: [X.RECALC_NOV], others: ["Начисление в «Физика 9» начнётся с 23.11"] }), { width: 1280, height: 900 });
  await run.page.evaluate((p) => window.mount("assign", { role: "owner", org_role: "owner" }, p), { moneyAvailable: true, sourceGroups: [F.SOURCES[0]], excludeGroupIds: ["ga"] });
  await run.page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
  await run.page.waitForSelector('[data-testid="transfer-recalc"]');
  assert.equal(plain(await run.page.locator('[data-testid="transfer-recalc"] [data-testid="recalc-line"] p').first().innerText()), "Ноябрь: 600 000 → 415 000 сум");
  assert.equal(plain(await run.page.locator('[data-testid="transfer-others"]').innerText()), "Начисление в «Физика 9» начнётся с 23.11");
  assert.ok(await run.page.locator('[data-testid="transfer-effects"]').count() > 0, "the sections stay under the lines");
  const block = plain(await run.page.locator('[data-testid="transfer-preview"]').innerText());
  assert.ok(block.indexOf("Ноябрь:") < block.indexOf("Начисление в") && block.indexOf("Начисление в") < block.indexOf("Перейдёт"), block);
  await run.page.close();
  const bare = await openPage(ctx.browser, "money2.entry.tsx", answer({}), { width: 1280, height: 900 });
  await bare.page.evaluate((p) => window.mount("assign", { role: "owner", org_role: "owner" }, p), { moneyAvailable: true, sourceGroups: [F.SOURCES[0]], excludeGroupIds: ["ga"] });
  await bare.page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
  await bare.page.waitForSelector('[data-testid="transfer-effects"]');
  assert.equal(await bare.page.locator('[data-testid="transfer-recalc"]').count(), 0);
  await bare.page.close();
});

test("LESSONS 155: the window of leaving and the archive at 1440 / 1280 / 1024 / 768 / 375 with eight-digit sums and the longest group name - no sideways scroll, nothing off its block", async () => {
  const BIG = 12345678;
  const money = (n) => X.money(n);
  const long = X.LEAVE_DEBT({
    group_name: X.LONG_GROUP,
    money: { unpaid: BIG, debt_amount: BIG, due_amount: 0, due_until: null, becomes_debt: 0, advance: 0, refundable: 0, paid_until: null, charged_after_leave: 0, individual_price_ends: false },
    effects: { kind: "leave", moves: [], texts: [], ends: [], stays: [{ code: "debt", amount: BIG, text: `Останется долг ${money(BIG)}: это единственная группа ученика` }] },
    recalc: [{ text: `Ноябрь: ${money(24850000)} → ${money(BIG)}`, basis_text: "пересчёт по день ухода · 9 уроков из 13" }, { text: `Декабрь не начнётся: ${money(24850000)} останутся авансом`, basis_text: null }],
    others: [`В группе «${X.LONG_GROUP}»: ${money(24850000)} → ${money(BIG)} — сегодняшний урок оплачен в «${X.LONG_GROUP}»`],
  });
  for (const width of WIDTHS) {
    const run = await openLeave([long, X.LEAVE_ADVANCE({ membership_id: "m-b", group_id: "gb", group_name: X.LONG_GROUP })], { width });
    await noOverflow(run.page, `leave ${width}`);
    await run.page.getByLabel(`Простить ${money(BIG)}`).check();
    await noOverflow(run.page, `leave forgive ${width}`);
    await run.page.close();
  }
});
