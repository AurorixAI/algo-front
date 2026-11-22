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
const P3 = require("./helpers/paydue-part3.cjs");

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
  await run.page.close();
});

test("a sum «к оплате» that stays (another group remains) is not named a debt: «Оставить как есть»; the forgiveness names the sum", async () => {
  const run = await openLeave([X.LEAVE_DUE()]);
  const text = await dialogText(run.page);
  assert.ok(text.includes("Оставить как есть — оплатить можно и после ухода") && !text.includes("Оставить долг"), text);
  assert.ok(text.includes("Простить 125 000 сум"), text);
  await run.page.close();
});

test("the list is cut by the server at two periods: «и ещё 2 периода», then «Прощено: N → M» (above the two, after the tail); a line without a text is dropped; no change of the charge - no block", async () => {
  const cut = await openLeave([X.LEAVE_DEBT({ recalc: X.RECALC_CUT })]);
  const lines = (await cut.page.locator('[data-testid="recalc-line"] p:first-child').allInnerTexts()).map(plain);
  assert.deepEqual(lines, ["Ноябрь: 600 000 → 415 000 сум", "Декабрь не начнётся: 300 000 сум останутся авансом", "Прощено: 600 000 → 415 000 сум"]);
  assert.equal(plain(await cut.page.locator('[data-testid="recalc-more"]').innerText()), "и ещё 2 периода");
  const order = await cut.page.locator('[data-testid="settle-recalc"] > li').evaluateAll((items) => items.map((item) => item.getAttribute("data-testid")));
  assert.deepEqual(order, ["recalc-line", "recalc-line", "recalc-more", "recalc-line"], "the tail of the periods stands before the forgiveness");
  const none = await openLeave([X.LEAVE_DEBT({ recalc: X.recalcBlock([{ label: "Ноябрь", before: 1, after: 2 }]) })]);
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

const STALE_LINE = "Счёт изменился, пока окно было открыто. Проверьте числа и подтвердите ещё раз.";
test("Б5.1 + Б11.21 п.4: a payment came in / the midnight passed (409 `BALANCE_CHANGED`) - the window STAYS, the calm sentence stands ABOVE the numbers, the numbers are read again (the NEW debt), the page behind is told, nothing is written; the second press sends the new numbers; no old «Данные оплат изменились»", async () => {
  const memberships = [X.LEAVE_DEBT()];
  let writes = 0;
  const run = await openLeave(memberships, { post: () => {
    writes += 1;
    if (writes > 1) return { json: X.LEAVE_RESULT_DEBT };
    memberships[0] = X.LEAVE_DEBT(P3.leaveRow({ group: "Математика 7", amount: 430000, becomes: 430000, stay: "Останется долг 430 000 сум" }));
    return X.STALE_409;
  } });
  await run.page.getByRole("button", { name: "Убрать из группы" }).click();
  await run.page.waitForSelector('[data-testid="balance-stale"]');
  assert.equal(plain(await run.page.locator('[data-testid="balance-stale"]').innerText()), STALE_LINE);
  await run.page.waitForFunction(() => /Останется долг 430/.test(document.querySelector('[role="dialog"]')?.innerText.replace(/\s/g, " ") ?? ""));
  const box = async (selector) => (await run.page.locator(selector).first().boundingBox()).y;
  assert.ok(await box('[data-testid="balance-stale"]') < await box('[data-testid="settle-words"]'), "the sentence is above the numbers");
  assert.deepEqual(await log(run.page), ["stale:Сумма изменилась, откройте окно заново"], "the page is told; the window did not close");
  assert.equal(run.calls.filter((call) => call.method === "POST").length, 1, "one write attempt so far");
  assert.equal(run.calls.filter((call) => call.method === "GET" && /leave-preview/.test(call.path)).length, 2, "the numbers were read again");
  assert.ok(!(await dialogText(run.page)).includes("Данные оплат изменились"));
  await run.page.getByRole("button", { name: "Убрать из группы" }).click();
  await run.page.waitForFunction(() => window.__log.some((line) => String(line).startsWith("left:")));
  assert.equal(run.calls.filter((call) => call.method === "POST" && /\/leave$/.test(call.path)).at(-1).body.settle[0].expected_unpaid, 430000, "the second press sends the NEW number");
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

test("the archive of a student, Б11.21 п.4: a 409 `BALANCE_CHANGED` - the window STAYS with the calm sentence above the numbers, the probe is read again, the page behind is told (`balance`), nothing is written", async () => {
  const run = await openPage(ctx.browser, "money2.entry.tsx", X.F.baseServer(X.archiveServer([X.LEAVE_DEBT()], () => X.STALE_409)), { width: 1280, height: 900 });
  await run.page.evaluate(() => window.mount("archive-lines", { role: "owner", org_role: "owner" }, { groupNames: ["Математика 7"] }));
  await run.page.waitForSelector('[data-testid="settle-membership"]');
  await run.page.getByRole("button", { name: "В архив" }).click();
  await run.page.waitForSelector('[data-testid="balance-stale"]');
  assert.equal(plain(await run.page.locator('[data-testid="balance-stale"]').innerText()), STALE_LINE);
  assert.deepEqual(await log(run.page), ["balance"], "the page is told; the window did not close and `stale` (an archived card) is not said");
  assert.equal(run.calls.filter((call) => call.method === "POST").length, 1);
  await run.page.waitForFunction(() => document.querySelectorAll('[data-testid="settle-membership"]').length === 1);
  assert.equal(run.calls.filter((call) => call.method === "GET" && /archive-preview/.test(call.path)).length, 2, "the probe was read again");
  await run.page.close();
});

test("the probe of a TRANSFER: the lines `recalc` of the group the student leaves and `others` (the new group) stand over the sections; no lines - the sections only", async () => {
  const effects = F.transferEffects({ names: F.SHORT });
  const answer = (extra) => F.baseServer((request) => request.path === "/auth/org/groups/gt/students/st1"
    ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: /dry_run=true/.test(request.query), effects, ...extra } } : null, F.SHORT);
  const run = await openPage(ctx.browser, "money2.entry.tsx", answer({ recalc: X.recalcBlock([X.RECALC_NOV]), others: ["Начисление в «Физика 9» начнётся с 23.11"] }), { width: 1280, height: 900 });
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
    money: { unpaid: BIG, debt_amount: BIG, due_amount: 0, due_until: null, becomes_debt: 0, advance: 0, paid_until: null, charged_after_leave: 0, individual_price_ends: false },
    effects: { kind: "leave", moves: [], texts: [], ends: [], stays: [{ code: "debt", amount: BIG, text: `Останется долг ${money(BIG)}: это единственная группа ученика` }] },
    recalc: X.recalcBlock([{ text: `Ноябрь: ${money(24850000)} → ${money(BIG)}`, basis_text: "пересчёт по день ухода · 9 уроков из 13" }, { text: `Декабрь не начнётся: ${money(24850000)} останутся авансом`, basis_text: null }]),
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

// ── Б2.5: the windows of ADDING when the charge starts later (frames 10, 14) ─────────────────────────────────────────────────────────────────────────────────────

const H = require("./helpers/enrol-v2.cjs");
async function openAssign(server, { width = 1280, props = {}, user = OWNER } = {}) {
  const run = await openPage(ctx.browser, "money2.entry.tsx", server, { width, height: width <= 375 ? 812 : 900 });
  await run.page.evaluate(([u, p]) => window.mount("assign", u, p), [user, { moneyAvailable: true, groupsBasePath: "/owner/groups", mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], sourceGroups: [{ id: "ga", name: F.SHORT.A }], ...props }]);
  await run.page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
  await run.page.waitForSelector('[data-testid="summary-bar-sum"], [data-testid="summary-bar-idle"]:not(:has-text("Считаем"))');
  await run.page.waitForTimeout(400);
  return run;
}
const barOf = async (page) => ({
  label: plain(await page.locator('[data-testid="summary-bar-label"]').first().innerText().catch(() => "")),
  sum: plain(await page.locator('[data-testid="summary-bar-sum"]').innerText().catch(() => "")),
  line: plain(await page.locator('[data-testid="summary-bar-line"]').innerText().catch(() => "")),
  idle: plain(await page.locator('[data-testid="summary-bar-idle"]').innerText().catch(() => "")),
});

test("frame 10: «Начисление с 24 ноября» / the forecast sum of the server / «2 урока из 8 в ноябре · платить до 28.11»; the sum is the server's `upcoming.amount`, not counted here", async () => {
  const run = await openAssign(X.enrolServer());
  assert.deepEqual(await barOf(run.page), { label: "Начисление с 24 ноября", sum: "120 000 сум", line: "2 урока из 8 в ноябре · платить до 28.11", idle: "" });
  assert.ok(!(await dialogText(run.page)).includes("Сразу платить не нужно"), "the bar says when the charge starts, not that nothing is paid");
  await run.page.close();
});

test("frame 10 (the message after): «<Имя> зачислен в «Группа»» and the server's sentence «Начисление с 24.11: 120 000 сум»", async () => {
  const run = await openAssign(X.enrolServer());
  await run.page.click('[data-testid="assign-submit"]');
  await run.page.waitForSelector("[data-tone]");
  const whole = plain(await run.page.locator("[data-tone]").first().innerText());
  assert.ok(whole.startsWith(`Каримов Фарход зачислен в «${F.SHORT.T}»`) && whole.includes("Начисление с 24.11: 120 000 сум"), whole);
  await run.page.close();
});

test("frame 14: the day was moved by the group the student left today - the terms say the server's note instead of the reason of the default day; the date and the sum are the shifted ones", async () => {
  const run = await openAssign(X.enrolServer({ upcoming: X.UPCOMING_14, payFrom: "2026-11-23" }));
  assert.deepEqual(await barOf(run.page), { label: "Начисление с 23 ноября", sum: "160 000 сум", line: "4 урока из 13 в ноябре · платить до 27.11", idle: "" });
  assert.equal(plain(await run.page.locator('[data-testid="enrol-terms-why"]').innerText()), "сегодня ученик ещё числился в «Математике 7»");
  assert.ok(!(await dialogText(run.page)).includes("ближайшее занятие группы"), "the note replaces the reason of the default day");
  await run.page.close();
});

test("the server gave no sum (a role without the right / a forecast it could not make): the bar says only when the charge starts; no `upcoming` - nothing is added to the bar", async () => {
  const noSum = await openAssign(X.enrolServer({ upcoming: { ...X.UPCOMING_10, amount: null, due_until: null, sub: null, lessons_text: null } }));
  const bar = await barOf(noSum.page);
  assert.equal(bar.sum, "");
  assert.equal(bar.idle, "Начисление с 24 ноября");
  await noSum.page.close();
  const none = await openAssign(X.enrolServer({ upcoming: null }));
  assert.equal(await none.page.locator('[data-testid="summary-bar-label"]').count(), 0);
  assert.ok(!/Начисление с 24 ноября.*120/.test(await dialogText(none.page)));
  await none.page.close();
});

test("the drawer (a batch): the bar takes the sum of `upcoming_total` of the server, never the sum of the students' forecasts; without it - the date only; the sentence of the message after is the server's (unit test)", async () => {
  const withUpcoming = (inner, total) => (r) => {
    const out = inner(r);
    if (!out || !out.json || r.method !== "POST") return out;
    const json = JSON.parse(JSON.stringify(out.json));
    if (Array.isArray(json.students)) for (const student of json.students) if (student.billing) student.billing.upcoming = { ...X.UPCOMING_10, amount: 120000 };
    if (total) json.upcoming_total = total;
    return { ...out, json };
  };
  const TOTAL = { from: "2026-11-24", amount: 240000, lessons_text: "2 урока из 8 в ноябре", due_until: "2026-11-28", text: `Начисление с 24.11: ${X.money(240000)} (по 2 учеников)`, sub: "платить до 28.11" };
  const run = await H.openDrawer(ctx, withUpcoming(H.server({ people: H.PEOPLE, defaultPayFrom: "2026-11-24" }), TOTAL), { props: { groupName: "М11 БС" } });
  await H.pick(run.page, "Каримов", "Юсупова"); await H.settled(run.page);
  assert.deepEqual(await barOf(run.page), { label: "Начисление с 24 ноября", sum: "240 000 сум", line: "2 урока из 8 в ноябре · платить до 28.11", idle: "" });
  await run.page.close();
  const quiet = await H.openDrawer(ctx, withUpcoming(H.server({ people: H.PEOPLE, defaultPayFrom: "2026-11-24" }), null), { props: { groupName: "М11 БС" } });
  await H.pick(quiet.page, "Каримов", "Юсупова"); await H.settled(quiet.page);
  const bar = await barOf(quiet.page);
  assert.equal(bar.sum, "", "two forecasts are not added up by the screen");
  assert.equal(bar.idle, "Начисление с 24 ноября");
  await quiet.page.close();
});

test("LESSONS 155 (Б2.5): the bar of the window with an eight-digit forecast and the long note at 1440 / 1280 / 1024 / 768 / 375 - no sideways scroll", async () => {
  const big = { ...X.UPCOMING_14, amount: 24850000, terms_note: "сегодня ученик ещё числился в «Подготовка к олимпиаде по математике, 7 класс (углублённый курс)»" };
  for (const width of WIDTHS) {
    const run = await openAssign(X.enrolServer({ upcoming: big, payFrom: "2026-11-23" }), { width });
    assert.equal((await barOf(run.page)).sum, "24 850 000 сум");
    await noOverflow(run.page, `enrol bar ${width}`);
    await run.page.close();
  }
});

// ── Б2.6: the words and the labels (frames 0, 11-13, 15-18) ─────────────────────────────────────────────────────────────────────────────────────────────────────

const PX = require("./helpers/paytails-fixture.cjs");
const paymentsServer = (rows) => (r) => {
  if (r.path === "/auth/org/payments/summary") return { json: PX.SUMMARY };
  if (r.path === "/auth/org/payments/status") return { json: PX.page(rows, { total: rows.length, students: rows.length }) };
  if (r.path === "/auth/org/groups") return { json: [{ id: "g1", name: "Математика 7", teacher_id: "t1" }] };
  if (r.path === "/auth/org/members") return { json: [] };
  if (r.path === "/auth/org/opening-balances/summary") return { json: { accounting_start: "2026-09-01", state: "done", can_set_opening: true, totals: { left_available: 0, memberships: 40, missing: 0, needs_review: 0 } } };
  return null;
};
async function openList(rows, width = 1280) {
  const run = await openPage(ctx.browser, "paydue.entry.tsx", paymentsServer(rows), { width, height: width <= 375 ? 812 : 900 });
  await run.page.evaluate(() => window.mount("payments", { role: "owner", org_role: "owner" }, { moneyAvailable: true, search: "bucket=debtors" }));
  await run.page.waitForSelector('[data-testid="payments-table"], [data-testid="payments-phone-list"]');
  await run.page.waitForTimeout(300);
  return run;
}
const chipClass = (page, text) => page.locator('[data-testid="pay-label"]', { hasText: text }).first().getAttribute("class");

test("frames 0, 11, 16, 17: «Начнётся 24.11» is a white label with a grey outline and its sub-line «≈ 120 000 сум»; «Прощено до» is grey, «Оплачено до» stays green with «из них прощено N сум»; the words are the server's", async () => {
  const run = await openList(X.WORD_ROWS);
  const rows = (await run.page.locator('[data-testid="payments-table"] li').allInnerTexts()).map(plain).filter((t) => /Алиев|Турсунова|Тошев|Умарова/.test(t));
  assert.equal(rows.length, 4);
  assert.match(rows[0], /Сардор Алиев.*Начнётся 24\.11.*≈ 120 000 сум/);
  assert.match(rows[2], /Бекзод Тошев.*Оплачено до 30\.11.*из них прощено 300 000 сум/);
  assert.match(rows[3], /Зарина Умарова.*Прощено до 30\.11/);
  assert.match(await chipClass(run.page, "Начнётся 24.11"), /border-slate-300 bg-white/);
  assert.match(await chipClass(run.page, "Прощено до 30.11"), /bg-slate-50/);
  assert.match(await chipClass(run.page, "Оплачено до 30.11"), /bg-success-50/);
  assert.ok(!(await chipClass(run.page, "Начнётся 24.11")).includes("bg-danger"), "red is for a debt only");
  // the forecast is in no sum: the tabs and the card are the server's numbers
  assert.equal(plain(await run.page.innerText('[data-testid="position-advance"]')).includes("120 000"), false);
  await run.page.close();
});

test("frame 15 (a pack centre, no lessons yet): «Уроков ещё не было» + the server's «50 000 сум за урок · без оплаты 2 урока»", async () => {
  const run = await openList([X.TIMUR_PACK]);
  const row = plain(await run.page.locator('[data-testid="payments-table"] li').filter({ hasText: "Тимур" }).first().innerText());
  assert.match(row, /Уроков ещё не было.*50 000 сум за урок · без оплаты 2 урока/);
  await run.page.close();
});

test("frame 20-23 (a phone): the new labels stand in the compact row, one line each, nothing sticks out", async () => {
  const run = await openList(X.WORD_ROWS, 375);
  const text = plain(await run.page.locator('[data-testid="payments-phone-list"]').innerText());
  assert.ok(text.includes("Начнётся 24.11") && text.includes("Прощено до 30.11"), text);
  const facts = await run.page.evaluate(layoutProbe, '[data-testid="payments-phone-list"]');
  assert.equal(facts.scroll, 0);
  // the long group of a compact row is cut with an ellipsis by design (Б2.8)
  assert.deepEqual(facts.bad.filter((b) => !/«· [^»]*»|leaves its block/.test(b)), []);
  await run.page.close();
});

async function openStatement(key, width = 1280) {
  const run = await openPage(ctx.browser, "money2.entry.tsx", F.baseServer((r) => (r.method === "GET" && r.path === "/auth/org/memberships/m-a/statement" ? { json: X.STATEMENTS[key] } : r.method === "GET" && r.path === "/auth/org/memberships/m-a/payments" ? { json: [] } : null)), { width, height: width <= 375 ? 812 : 900 });
  await run.page.evaluate(() => window.mount("statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
  await run.page.waitForSelector('[data-testid="statement-summary"]');
  await run.page.waitForTimeout(300);
  return run;
}
const stateOf = async (page) => plain(await page.locator('[data-testid="statement-state"]').innerText());

test("frame 12 (the statement of a student whose charge has not begun): «Начнётся 24.11» + «платить до 28.11»; a grey forecast row «прогноз: начислится 120 000 сум»; «Стоимость» and «Оплачено» are 0 - the forecast is in no column", async () => {
  const run = await openStatement("f12");
  assert.equal(await stateOf(run.page), "Начнётся 24.11 платить до 28.11");
  assert.ok(!(await run.page.locator('[data-testid="statement-state"] p').first().getAttribute("class")).includes("emerald"), "a plain word, not the green of money");
  const forecast = plain(await run.page.locator('[data-testid="statement-forecast"]').innerText());
  assert.match(forecast, /^24\.11\.2026 Ноябрь 2026 — неполный месяц \(с 24\.11, 2 урока из 8\) прогноз: начислится 120 000 сум$/);
  assert.equal(await run.page.locator('[data-testid="statement-row-charge"]').count(), 0, "the forecast is not a charge row");
  const summary = plain(await run.page.locator('[data-testid="statement-summary"]').innerText());
  assert.match(summary, /Стоимость обучения 0 сум/);
  assert.equal(await run.page.locator('[data-testid="statement-reconciles"]').count(), 0);
  assert.equal(await run.page.getByText("В выписке пока нет записей").count(), 0);
  await run.page.close();
});

test("frames 16, 17: «Прощено до 30.11» is a plain word beside the tiles «Прощено 600 000 сум»; «Оплачено до 30.11» keeps no sub-line the server did not send", async () => {
  const f16 = await openStatement("f16");
  assert.equal(await stateOf(f16.page), "Прощено до 30.11");
  assert.match(plain(await f16.page.locator('[data-testid="statement-summary"]').innerText()), /Прощено.*600 000 сум/);
  await f16.page.close();
  const f17 = await openStatement("f17");
  assert.equal(await stateOf(f17.page), "Оплачено до 30.11");
  assert.match(await f17.page.locator('[data-testid="statement-state"] p').first().getAttribute("class"), /emerald/, "money covers the period: green");
  await f17.page.close();
});

test("frame 18 (the left ones): «Расчёт закрыт» (paid; paid + forgiven) and «Расчётов нет» stand in the summary as a plain word, not as a label", async () => {
  for (const [key, word] of [["f18a", "Расчёт закрыт"], ["f18b", "Расчёт закрыт"], ["f18c", "Расчётов нет"]]) {
    const run = await openStatement(key);
    assert.equal(await stateOf(run.page), word);
    assert.equal(await run.page.locator('[data-testid="statement-state"] [data-kind="chip"], [data-testid="statement-state"] [data-kind="status-chip"]').count(), 0, "text, not a chip");
    await run.page.close();
  }
  const longName = await openStatement("f18c", 375);
  const facts = await longName.page.evaluate(layoutProbe, '[data-testid="statement-summary"]');
  assert.equal(facts.scroll, 0);
  await longName.page.close();
});

test("frame 5 (a forgiveness used in part): the server's «использовано 35 000 сум» under the record; the column «Оплачено» is the used part +35 000; the state «Расчёт закрыт»", async () => {
  const run = await openStatement("f5");
  const row = plain(await run.page.locator('[data-testid="statement-row-writeoff"]').innerText());
  assert.match(row, /Прощено 220 000 сум — причина: семейные обстоятельства.*использовано 35 000 сум.*35 000/);
  assert.equal(await stateOf(run.page), "Расчёт закрыт");
  const tiles = plain(await run.page.locator('[data-testid="statement-summary"]').innerText());
  assert.match(tiles, /Стоимость обучения 415 000 сум.*Оплачено 380 000 сум.*Прощено.*35 000 сум/);
  await run.page.close();
});

test("LESSONS 155 (Б2.6): the statement with an eight-digit forecast, a long name and a long group at 1440 / 1280 / 1024 / 768 / 375 - no sideways scroll", async () => {
  const wide = JSON.parse(JSON.stringify(X.STATEMENTS.f12));
  wide.membership.student_name = X.LONG_NAME; wide.membership.group_name = X.LONG_GROUP;
  wide.forecast.sub = "прогноз: начислится 24 850 000 сум";
  for (const width of WIDTHS) {
    const run = await openPage(ctx.browser, "money2.entry.tsx", F.baseServer((r) => (r.method === "GET" && r.path === "/auth/org/memberships/m-a/statement" ? { json: wide } : r.method === "GET" && r.path === "/auth/org/memberships/m-a/payments" ? { json: [] } : null)), { width, height: 900 });
    await run.page.evaluate(() => window.mount("statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
    await run.page.waitForSelector('[data-testid="statement-forecast"]');
    const facts = await run.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    assert.ok(facts.scroll <= 0, `statement ${width}: scroll ${facts.scroll}`);
    await run.page.close();
  }
  for (const width of WIDTHS) {
    const rows = X.WORD_ROWS.map((r, i) => (i === 0 ? { ...r, student_name: X.LONG_NAME, group_name: X.LONG_GROUP, state_sub: "≈ 24 850 000 сум" } : r));
    const run = await openList(rows, width);
    const scroll = await run.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(scroll <= 0, `list ${width}: scroll ${scroll}`);
    await run.page.close();
  }
});
