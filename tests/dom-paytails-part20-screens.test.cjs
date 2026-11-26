// PAY-TAILS Б11.51 (part 20, screens part 2), in a real browser: Э8 the window of a RETURN shows the sentence of the server as it came; the window «Внести оплату» on the real answers with future
// cancellations of the centre; Э7 the entry «Паузы» in the history of enrolments of the REAL profile (only a FORMER stay has it).  The answers are the REAL ones of the server
// (tests/fixtures/paytails/part20, byte copies of `paytails-r7/answers/`, head of the server beb692e); the page clock stands on the day of the world of the answer (25.11 / 26.11.2026).
const assert = require("node:assert/strict");
const nodeTest = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { setup, plain, OWNER } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const F = require("./helpers/money2-fixture.cjs");
const X = require("./helpers/paydue-fixture.cjs");
const { TOSHMATOV } = require("./helpers/stage-numbers.cjs");

const ctx = setup(nodeTest);
const dir = path.join(__dirname, "fixtures", "paytails", "part20");
const real = (name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
const dry = (request) => /dry_run=true/.test(request.query);
const dialogText = async (page) => plain(await page.locator('[role="dialog"]').innerText());

// ── Э8: the window of a return says the sentence of the server, as it came ──────────────────────────────────────────────────────────────────────

const RETURN_WORLD = "2026-11-26";
function returnServer(answer) {
  return F.baseServer((request) => {
    if (request.method === "GET" && request.path === "/auth/org/groups/gt/pay-from-default") return { json: { today: RETURN_WORLD, first_lesson: RETURN_WORLD, default_pay_from: RETURN_WORLD, text: "Оплата с 26.11.2026 — сегодня у группы занятие" } };
    if (request.method === "POST" && request.path === "/auth/org/groups/gt/students/st1") return { json: { ...answer, dry_run: dry(request), status: "added" } };
    return null;
  }, F.SHORT);
}
async function openReturn(answer, width) {
  const run = await openPage(ctx.browser, "money2.entry.tsx", returnServer(answer), { width, height: width <= 375 ? 812 : 900, today: RETURN_WORLD });
  await run.page.evaluate(([u, p]) => window.mount("assign", u, p), [OWNER, { moneyAvailable: true, groupsBasePath: "/owner/groups", mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], sourceGroups: [{ id: "ga", name: F.SHORT.A }] }]);
  await run.page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
  await run.page.waitForSelector('[data-testid="enrol-terms-why"]');
  await run.page.waitForTimeout(400);
  return run;
}
const NO_BREAK = real("return_preview_no_break").billing.text;   // the sentence of the server, read from the answer - the screen shows it as it came
const PAY_FROM_TEXT = real("return_preview_pay_from").billing.text;

for (const width of [1280, 375]) {
  nodeTest(`Э8 (${width}) a return in the same period: the window says the sentence of the answer («${NO_BREAK}») whole under the terms (the real answer, `+"`return_preview_no_break`"+`); the old words are nowhere`, async () => {
    const run = await openReturn(real("return_preview_no_break"), width);
    assert.equal(plain(await run.page.locator('[data-testid="enrol-terms-why"]').innerText()), NO_BREAK);
    const text = await dialogText(run.page);
    assert.ok(NO_BREAK.length > 20 && !/с первого занятия группы|записывается\s+заново/.test(text), text);
    assert.deepEqual((await run.page.evaluate(layoutProbe, '[role="dialog"]')).bad, []);
    await run.page.close();
  });

  nodeTest(`Э8 (${width}) a return with «Оплата с» chosen: the window says «дату выбрали вы», the message after the write carries the server's «${PAY_FROM_TEXT}» (the real answer, `+"`return_preview_pay_from`"+`)`, async () => {
    const run = await openReturn(real("return_preview_pay_from"), width);
    await run.page.waitForSelector('[data-testid="enrol-terms-toggle"]');
    await run.page.click('[data-testid="enrol-terms-toggle"]');
    await run.page.fill('#assign-group-pay-from', "27.11.2026");
    await run.page.waitForTimeout(500);
    assert.equal(plain(await run.page.locator('[data-testid="enrol-terms-why"]').innerText()), "дату выбрали вы");
    assert.ok(!(await dialogText(run.page)).includes(NO_BREAK), "the sentence of another answer is not here");
    await run.page.click('[data-testid="assign-submit"]');
    await run.page.waitForSelector("[data-tone]");
    assert.ok(plain(await run.page.locator("[data-tone]").first().innerText()).includes(PAY_FROM_TEXT), "the toast has the sentence of the server as it came");
    await run.page.close();
  });
}

nodeTest("Э8 the screen builds no sentence of its own about the day: «Оплата считается с» is in no source of the window, the old exceptions title of a refused undoing («записывается» + «заново») is nowhere", () => {
  const root = path.join(__dirname, "..");
  const walk = (dirPath) => fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dirPath, entry.name)) : [path.join(dirPath, entry.name)]));
  const sources = walk(path.join(root, "src")).filter((file) => /\.(ts|tsx)$/.test(file));
  const own = sources.filter((file) => /`Оплата считается с|"Оплата считается с/.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(own, [], "no source builds the sentence");
  const old = [...sources, ...walk(path.join(root, "tests")).filter((file) => /\.(cjs|ts)$/.test(file) && !file.endsWith("dom-paytails-part20-screens.test.cjs"))].filter((file) => /поэтому он записывается\s+заново/.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(old, [], "the refusal of an undoing is the server's («поэтому уход не отменяется, ученик зачисляется обычным порядком»)");
});

// ── the window «Внести оплату» on the real answers with future cancellations of the centre ───────────────────────────────────────────────────────

const PAY_WORLD = "2026-11-25";
async function openPayment(name, width) {
  const answer = real(name);
  const server = (request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m1/payments/preview") return { json: /amount=\d+/.test(request.query) ? answer : { ...answer, amount: null, result: null } };
    return null;
  };
  const run = await openPage(ctx.browser, "money.entry.tsx", server, { width, height: width === 375 ? 812 : 900, today: PAY_WORLD });
  await run.page.evaluate(([u, membership]) => window.mount("till", u, { membership }), [undefined, TOSHMATOV]);
  for (let waited = 0; !run.calls.some((call) => call.path.endsWith("/payments/preview")) && waited < 5000; waited += 25) await run.page.waitForTimeout(25);
  await run.page.fill("#payment-amount", String(answer.amount));
  await run.page.click('[data-testid="payment-methods"] >> text=Наличные');
  await run.page.waitForSelector('[data-testid="payment-split"]');
  return { run, answer };
}
const readSplit = async (page) => ({
  rows: await page.locator('[data-testid="payment-split-row"]').evaluateAll((items) => items.map((item) => [item.querySelector('[data-testid="payment-split-label"]').textContent, item.querySelector('[data-testid="payment-split-amount"]').textContent, item.querySelector('[data-testid="payment-split-mark"]')?.textContent ?? null].map((cell) => (cell === null ? null : cell.replace(/[\s ]+/g, " ").trim())))),
  total: await page.locator('[data-testid="payment-split-total-label"]').innerText().then(plain),
  totalAmount: (await page.locator('[data-testid="payment-split-total-amount"]').count()) ? plain(await page.locator('[data-testid="payment-split-total-amount"]').innerText()) : null,
  whole: plain(await page.locator('[data-testid="payment-split"]').innerText()),
});

for (const width of [1280, 375]) {
  nodeTest(`(${width}) future cancellation, the period is closed: «Ноябрь — 200 000 ✓ оплачен», «Всё оплачено», no word «остаток» (real answer payment_preview_future_cancel_closed)`, async () => {
    const { run, answer } = await openPayment("payment_preview_future_cancel_closed", width);
    const shown = await readSplit(run.page);
    assert.deepEqual(shown.rows, [["Ноябрь", "200 000", "✓ оплачен"]]);
    assert.equal(shown.total, "Всё оплачено");
    assert.ok(!/остаток/i.test(shown.whole), shown.whole);
    assert.equal(answer.result.money_rows.reduce((total, row) => total + row.amount, 0), answer.amount, "the rows are the typed amount");
    assert.deepEqual((await run.page.evaluate(layoutProbe, '[data-testid="payment-calc"]')).bad, []);
    await run.page.close();
  });

  nodeTest(`(${width}) future cancellation, part of the period: «Ноябрь — 150 000 из 200 000», «Останется долг 50 000 сум»; the amount that stays = what the server leaves (real answer payment_preview_future_cancel_part)`, async () => {
    const { run, answer } = await openPayment("payment_preview_future_cancel_part", width);
    const shown = await readSplit(run.page);
    assert.deepEqual(shown.rows, [["Ноябрь", "150 000", "из 200 000"]]);
    assert.equal(shown.total, "Останется долг");
    assert.equal(shown.totalAmount, "50 000 сум");
    assert.ok(!/остаток/i.test(shown.whole), shown.whole);
    assert.equal(200000 - 150000, answer.result.debt_amount_after, "of − amount = what is left");
    assert.deepEqual((await run.page.evaluate(layoutProbe, '[data-testid="payment-calc"]')).bad, []);
    await run.page.close();
  });
}

// ── Э7: «Паузы» in the history of enrolments of the REAL profile ────────────────────────────────────────────────────────────────────────────

const PROFILE = real("student_profile_former_stay");
const PAUSES = real("pauses_list_former_stay");
const FORMER = PROFILE.group_history.find((row) => !row.is_active);
const ACTIVE = PROFILE.group_history.find((row) => row.is_active);
async function openProfile(width, answerPauses = PAUSES) {
  const server = (request) => {
    if (/^\/auth\/org\/students\/[^/]+\/profile$/.test(request.path)) return { json: PROFILE };
    if (/^\/auth\/org\/students\/[^/]+\/memberships$/.test(request.path)) return { json: [] };
    const list = /^\/auth\/org\/memberships\/([^/]+)\/pauses$/.exec(request.path);
    if (list && request.method === "GET") return { json: list[1] === FORMER.membership_id ? answerPauses : [] };
    if (request.path === "/auth/org/payments/summary") return { json: X.SUMMARY };
    if (request.path === "/auth/org/payments/status") return { json: X.statusPage(request.query) };
    if (request.path === "/auth/org/settings/payments") return { json: X.SETTINGS };
    return null;
  };
  const run = await openPage(ctx.browser, "paydue.entry.tsx", server, { width, height: width <= 375 ? 812 : 900, today: PAY_WORLD });
  await run.page.evaluate(([name, who, props]) => window.mount(name, who, props), ["student", OWNER, { moneyAvailable: true }]);
  await run.page.waitForSelector("text=История зачислений и переводов", { timeout: 8000 });
  return run;
}
for (const width of [1280, 375]) {
  nodeTest(`Э7 (${width}) the real profile: «Паузы» at the FORMER stay with the pause closed by the leaving; the window says the server's sentence and «Снять паузу целиком»; the current stay has no action in the history`, async () => {
    assert.ok(FORMER && ACTIVE && FORMER.membership_id && PAUSES[0].membership_id === FORMER.membership_id, "the real answers belong together (membership_id of the server)");
    const run = await openProfile(width);
    const buttons = run.page.locator('[data-testid="former-pauses"]');
    await buttons.first().waitFor();
    assert.equal(await buttons.count(), 1, "one action: at the former stay only");
    assert.equal(await buttons.first().getAttribute("aria-label"), `Паузы: ${FORMER.group_name}`);
    assert.ok(!run.calls.some((call) => new RegExp(`memberships/${ACTIVE.membership_id}/pauses$`).test(call.path) && /groups|history/.test(call.path)), "the current stay is not asked for the history row");
    await buttons.first().click();
    await run.page.waitForSelector('[data-testid="pause-locked-text"]');
    assert.equal(plain(await run.page.locator('[data-testid="pause-locked-text"]').innerText()), plain(PAUSES[0].days_locked_text));
    assert.equal(plain(PAUSES[0].days_locked_text), "Пауза закрыта уходом ученика. Верните ученика в группу, затем измените паузу.");
    assert.equal(await run.page.locator('[role="dialog"]').getByRole("button", { name: "Снять паузу целиком" }).count(), 1);
    assert.equal(await run.page.locator('[role="dialog"] #pause-first').count(), 0, "no form of a new pause for a former stay");
    assert.deepEqual((await run.page.evaluate(layoutProbe, '[role="dialog"]')).bad, []);
    await run.page.close();
  });
}
