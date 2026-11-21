// PAY-TAILS, screens part 3, in a real browser: the screens on the REAL answers of the server (tests/fixtures/paytails, tests/helpers/paytails-server.cjs), not on the stub.
// The stub of part 1 / 2 stays only where the server cannot give the state (see tests/helpers/paytails-server.cjs).  Widths 1440 / 1280 / 1024 / 768 / 375 (LESSONS 155).  LESSONS 143, 151.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { fx, plain, advanceStatus } = require("./helpers/paytails-server.cjs");
const PX = require("./helpers/paytails-fixture.cjs");
const X2 = require("./helpers/paytails-fixture2.cjs");
const F = require("./helpers/money2-fixture.cjs");
const H = require("./helpers/enrol-v2.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const OWNER = { role: "owner", org_role: "owner" };
const WIDTHS = [1440, 1280, 1024, 768, 375];
const OPENINGS = { accounting_start: "2026-09-01", state: "done", can_set_opening: true, totals: { left_available: 0, memberships: 40, missing: 0, needs_review: 0 } };
const heightOf = (width) => (width <= 375 ? 812 : 900);

/** The centre as the server describes it: the summary and the pages of its own fixtures. */
const centre = (extra) => (request) => {
  if (extra) { const own = extra(request); if (own) return own; }
  if (request.path === "/auth/org/payments/summary") return { json: fx("summary_with_advance") };
  if (request.path === "/auth/org/payments/status") return { json: advanceStatus(request.query) };
  if (request.path === "/auth/org/groups") return { json: [{ id: "id-2", name: "Математика 7", teacher_id: "t1" }] };
  if (request.path === "/auth/org/members") return { json: [] };
  if (request.path === "/auth/org/opening-balances/summary") return { json: OPENINGS };
  return null;
};
async function openList(width, answer, search = "bucket=advance") {
  const run = await openPage(browser, "paydue.entry.tsx", answer, { width, height: heightOf(width) });
  await run.page.evaluate(([name, user, props]) => window.mount(name, user, props), ["payments", OWNER, { moneyAvailable: true, search }]);
  await run.page.waitForSelector('[data-testid="payments-table"], [data-testid="payments-phone-list"], [data-testid="advance-empty"]', { timeout: 9000 });
  return run;
}
async function noOverflow(page, selector, label) {
  const facts = await page.evaluate(layoutProbe, selector);
  assert.equal(facts.scroll, 0, `${label}: sideways scroll`);
  assert.deepEqual(facts.bad, [], `${label}: ${facts.bad.join(" | ")}`);
}

test("the tab «Аванс» on the server's pages: `tab_text` / `tab_sub`, the numbers `students` / `left_students`, «Вернуть» for a closed one, «Внести оплату» only in the «⋯» of the open one", async () => {
  const { page, calls } = await openList(1280, centre());
  assert.equal(plain(await page.innerText('[role="tab"][aria-selected="true"]')), "Аванс 3");
  const rows = await page.$$eval('[data-testid="payments-table"] li.dt-li, [data-testid="payments-table"] li.dt-row', (els) => els.map((li) => li.innerText.replace(/[\s  ]+/g, " ").trim()));
  assert.equal(rows.length, 3);
  assert.match(rows[0], /^Ученик Гамма .*Аванс 210 000 сум ушёл 15\.11 Вернуть/);
  assert.match(rows[1], /^Ученик Ученик ЛП .*Аванс 280 000 сум ушёл 10\.11 Вернуть/);
  assert.match(rows[2], /^Ученик Бета .*Аванс 420 000 сум оплачено до 31\.12$/, "an open one: the label of the tab is `tab_text`, not `state_text` («Оплачено до 31.12»)");
  assert.ok(rows.every((row) => (row.match(/ушёл/g) || []).length <= 1), "the sub-line «ушёл ДД.ММ» comes from the server once: the screen adds nothing");
  assert.equal(plain(await page.getByTestId("advance-left-toggle").innerText()), "Все 3 Ушедшие 2");
  await page.getByRole("radio", { name: /^Ушедшие/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="payment-row-refund"]').length === 2 && document.querySelectorAll('[data-testid="payments-table"] li.dt-li, [data-testid="payments-table"] li.dt-row').length === 2);
  // a real closed row has a last payment: its «⋯» holds «Исправить / Отменить последнюю оплату» (the stub had none); «Внести оплату» is nowhere
  assert.equal(await page.getByRole("button", { name: "Внести оплату" }).count(), 0);
  assert.ok(calls.some((c) => /bucket=advance/.test(c.query) && /left_only=true/.test(c.query)));
  assert.equal(plain(await page.getByTestId("advance-left-toggle").innerText()), "Все 3 Ушедшие 2", "`left_students` keeps its number with the filter");
  await page.close();
});

test("the card «Аванс» of the summary: the sub-line is the server's `advance_text`, the number is `buckets.advance`", async () => {
  const run = await openPage(browser, "paydue.entry.tsx", centre(), { width: 1280, height: 900 });
  const page = run.page;
  await page.evaluate(([name, user, props]) => window.mount(name, user, props), ["payments", OWNER, { moneyAvailable: true, search: "bucket=debtors" }]);
  await page.waitForSelector('[role="tab"]', { timeout: 9000 });
  const tab = plain(await page.innerText('[role="tab"]:has-text("Аванс")'));
  assert.equal(tab, "Аванс 3");
  const card = plain(await page.locator('body').innerText());
  assert.ok(card.includes("3 ученика · 2 ушли из группы"), card.slice(0, 400));
  await page.close();
});

test("the tab «Аванс» at 1440 / 1280 / 1024 / 768 / 375: nothing leaves its box", async () => {
  for (const width of WIDTHS) {
    const { page } = await openList(width, centre());
    await noOverflow(page, "body", `advance ${width}`);
    await page.close();
  }
});

// ── the group: ONE request for the band ──────────────────────────────────────────────────────────────

const groupServer = () => centre((r) => {
  if (r.path === "/auth/org/groups/g1") return { json: { id: "g1", name: "Математика 7", status: "active", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", max_students: 30, student_count: 1, students: [], price_current: { amount: 600000, valid_from: "2026-01-01", source: "group" }, price_scheduled: null, schedule: [] } };
  if (r.path === "/auth/org/payments/status" && /group_id=g1/.test(r.query)) {
    if (/bucket=left_open/.test(r.query)) return { json: fx("group_left_open") };
    return { json: PX.page(/bucket=all/.test(r.query) ? [PX.MADINA] : [], { total: /bucket=all/.test(r.query) ? 1 : 0, students: /bucket=all/.test(r.query) ? 1 : 0 }) };
  }
  return null;
});

test("the group: the band «Ушли из группы — расчёт не закрыт» is ONE request `bucket=left_open`, its number is `left_count`, the rows are in the server's order and carry its sub-lines", async () => {
  const run = await openPage(browser, "paydue.entry.tsx", groupServer(), { width: 1280, height: 900 });
  await run.page.evaluate(([name, user, props]) => window.mount(name, user, props), ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }]);
  await run.page.waitForSelector('[data-testid="payments-left-toggle"]', { timeout: 9000 });
  assert.equal(plain(await run.page.locator('[data-testid="payments-left-toggle"]').innerText()), "Ушли из группы — расчёт не закрыт 3 показать");
  const asked = run.calls.filter((c) => c.path === "/auth/org/payments/status" && /group_id=g1/.test(c.query)).map((c) => /bucket=([a-z_]+)/.exec(c.query)[1]);
  assert.equal(asked.filter((bucket) => bucket === "left_open").length, 1);
  assert.ok(!asked.includes("advance"), asked.join(","));
  await run.page.click('[data-testid="payments-left-toggle"]');
  const rows = await run.page.$$eval('[data-testid="group-payment-left-row"]', (els) => els.map((el) => el.innerText.replace(/[\s  ]+/g, " ").trim()));
  assert.equal(rows.length, 3);
  assert.match(rows[0], /^Ученик Дельта.*Долг 168 000 сум ушёл 12\.11 · просрочено 16 дней.*Внести оплату/);
  assert.match(rows[1], /^Ученик Ученик ЛП.*Аванс 280 000 сум ушёл 10\.11.*Вернуть/);
  assert.match(rows[2], /^Ученик Гамма.*Аванс 210 000 сум ушёл 15\.11.*Вернуть/);
  assert.ok(rows.every((row) => (row.match(/ушёл/g) || []).length === 1));
  await run.page.close();
});

test("the group's band at 1440 / 1280 / 1024 / 768 / 375: nothing leaves its box", async () => {
  for (const width of WIDTHS) {
    const run = await openPage(browser, "paydue.entry.tsx", groupServer(), { width, height: heightOf(width) });
    await run.page.evaluate(([name, user, props]) => window.mount(name, user, props), ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }]);
    await run.page.waitForSelector('[data-testid="payments-left-toggle"]', { timeout: 9000 });
    await run.page.click('[data-testid="payments-left-toggle"]');
    await run.page.waitForSelector('[data-testid="group-payment-left-row"]');
    await run.page.waitForTimeout(500); // the chevron turns: measure after it stands
    await noOverflow(run.page, "body", `group band ${width}`);
    await run.page.close();
  }
});

// ── the student's card: «Начнётся 24.11» (frame 13a) ────────────────────────────────────────────────────

test("the student's card: the charge has not begun - «Начнётся 24.11» and «≈ 150 000 сум», the words of the server", async () => {
  const row = fx("status_row_starts").items[0];
  const PROFILE = {
    student: { id: "st1", org_id: "o", first_name: "Один", last_name: "Ученик", full_name: "Ученик Один", class_level: 9, group_id: "id-3", display_id: "AL-001", student_phone: null, comment: null, status: "active", created_at: "2026-11-01T00:00:00" },
    group: { id: "id-3", name: "Физика 7", class_level: 9, teacher_id: "id-4", teacher_name: "Пётр Teacher" },
    groups: [{ group_id: "id-3", group_name: "Физика 7", class_level: 9, teacher_id: "id-4", teacher_name: "Пётр Teacher", is_primary: true, joined_at: "2026-11-21" }],
    group_history: [], diagnostics: [], exams: [],
  };
  const answer = centre((r) => {
    if (r.path === "/auth/org/students/st1/profile") return { json: PROFILE };
    if (r.path === "/auth/org/students/st1/memberships") return { json: [row] };
    return null;
  });
  for (const width of WIDTHS) {
    const run = await openPage(browser, "paydue.entry.tsx", answer, { width, height: heightOf(width) });
    await run.page.evaluate(([name, user, props]) => { window.mount(name, user, props); }, ["student", OWNER, { moneyAvailable: true }]);
    await run.page.waitForSelector('[data-testid="student-money-chip"]', { timeout: 9000 });
    assert.equal(plain(await run.page.locator('[data-testid="student-money-chip"]').first().innerText()), "Начнётся 24.11");
    assert.equal(plain(await run.page.locator('[data-testid="student-money-sub"]').first().innerText()), "≈ 150 000 сум");
    await noOverflow(run.page, "h1", `student card ${width}`);
    await run.page.close();
  }
});

// ── the receipt ──────────────────────────────────────────────────────────────────────────────────────────

/** Every sum of the text stays on ONE line: no digit group and no «сум» is torn off by a wrap. */
const tornSums = (selector) => {
  const el = document.querySelector(selector);
  const bad = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent;
    for (const match of text.matchAll(/\d[\d   ]*\d(?:[   ]сум)?/g)) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const tops = new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top)));
      if (tops.size > 1) bad.push(match[0]);
    }
  }
  return bad;
};

test("the receipt (partial payment): `receipt_state_text` is printed as the server wrote it; at 375 and every other width no sum is torn by a wrap", async () => {
  const receipt = fx("receipt_partial_payment");
  for (const width of WIDTHS) {
    const run = await openPage(browser, "money.entry.tsx", () => null, { width, height: heightOf(width) });
    await run.page.evaluate((r) => window.mount("receipt", undefined, { receipt: r }), receipt);
    await run.page.waitForSelector('[data-testid="receipt-state-text"]');
    assert.equal(await run.page.locator('[data-testid="receipt-state-text"]').innerText(), receipt.receipt_state_text, "not a character is changed by the screen");
    assert.deepEqual(await run.page.evaluate(tornSums, '[data-testid="receipt-state-text"]'), [], `torn sums at ${width}`);
    await noOverflow(run.page, '[aria-label^="Квитанция"]', `receipt ${width}`);
    await run.page.close();
  }
});

test("the receipt (a period closed / a closed membership): ONE row «Состояние на ДД.ММ.ГГГГ» (the day of `as_of`) with the server's phrase, no second block", async () => {
  for (const [name, phrase, label] of [["receipt_closed_period", "всё оплачено, оплачено до 30.11", "Состояние на 01.11.2026"], ["receipt_closed_membership", "расчёт закрыт", "Состояние на 21.11.2026"]]) {
    const run = await openPage(browser, "money.entry.tsx", () => null, { width: 1280, height: 900 });
    await run.page.evaluate((r) => window.mount("receipt", undefined, { receipt: r }), fx(name));
    await run.page.waitForSelector('[data-testid="receipt-state-text"]');
    assert.equal(await run.page.locator('[data-testid="receipt-state-text"]').innerText(), phrase);
    const sheet = plain(await run.page.locator('[aria-label^="Квитанция"]').innerText());
    assert.ok(sheet.includes(`${label} ${phrase}`), sheet);
    assert.equal((sheet.match(/Состояние на/g) || []).length, 1);
    assert.equal(await run.page.locator('[data-testid="receipt-state-on-issue"]').count(), 0);
    await run.page.close();
  }
});

// ── the statement ────────────────────────────────────────────────────────────────────────────────────────

const statementServer = (statement) => F.baseServer((r) => (r.method === "GET" && /\/auth\/org\/memberships\/[^/]+\/statement$/.test(r.path) ? { json: statement } : r.method === "GET" && /\/payments$/.test(r.path) ? { json: [] } : null));
async function openStatement(name, width = 1280) {
  const statement = fx(name);
  const run = await openPage(browser, "money2.entry.tsx", statementServer(statement), { width, height: heightOf(width) });
  await run.page.evaluate((u) => window.mount("statement", u, { moneyAvailable: true }), OWNER);
  await run.page.waitForSelector('[data-testid="statement-summary"]', { timeout: 9000 });
  return run;
}

test("the statement of a charge that starts later: «Начнётся 24.11» + «платить до 28.11», the grey forecast row «прогноз: начислится 150 000 сум»", async () => {
  const run = await openStatement("statement_forecast");
  const summary = plain(await run.page.locator('[data-testid="statement-summary"]').innerText());
  assert.ok(summary.includes("Начнётся 24.11") && summary.includes("платить до 28.11"), summary);
  const body = plain(await run.page.locator("body").innerText());
  assert.ok(body.includes("Ноябрь 2026 — неполный месяц (с 24.11, 3 урока из 12)") && body.includes("прогноз: начислится 150 000 сум"), body.slice(0, 600));
  await run.page.close();
});

test("the statement of a settled closed membership: «Расчёт закрыт» + «ушёл 21.11» as a plain word, the forgiveness «использовано 194 000 сум» under the record", async () => {
  const run = await openStatement("statement_settled_with_used_forgiveness");
  const summary = plain(await run.page.locator('[data-testid="statement-summary"]').innerText());
  assert.ok(summary.includes("Расчёт закрыт") && summary.includes("ушёл 21.11"), summary);
  const body = plain(await run.page.locator("body").innerText());
  assert.ok(body.includes("Прощено 220 000 сум") && body.includes("использовано 194 000 сум"), body.slice(0, 900));
  assert.equal((body.match(/использовано 194 000 сум/g) || []).length, 1, "said once");
  // B6.12: a period closed by money AND a used forgiveness: the column «Остаток» says the server's «Закрыто» as a quiet word (not a chip, not «Оплачено», not «Прощено»)
  const quiet = (await run.page.locator('[data-testid="statement-open-paid"]').allInnerTexts()).map(plain);
  assert.ok(quiet.includes("Закрыто"), JSON.stringify(quiet));
  assert.equal(await run.page.locator('[data-testid="statement-open-chip"]', { hasText: "Закрыто" }).count(), 0);
  await run.page.close();
});

test("the statement «Прощено до 30.11» (`covered_by: forgiven`) and the one with no charges «Расчётов нет · ушёл 05.11»", async () => {
  const forgiven = await openStatement("statement_forgiven_until");
  assert.ok(plain(await forgiven.page.locator('[data-testid="statement-summary"]').innerText()).includes("Прощено до 30.11"));
  await forgiven.page.close();
  const none = await openStatement("statement_no_charges");
  const text = plain(await none.page.locator('[data-testid="statement-summary"]').innerText());
  assert.ok(text.includes("Расчётов нет") && text.includes("ушёл 05.11"), text);
  await none.page.close();
});

test("the statements at 1440 / 1280 / 1024 / 768 / 375: nothing leaves its box", async () => {
  for (const name of ["statement_forecast", "statement_settled_with_used_forgiveness", "statement_forgiven_until"]) {
    for (const width of WIDTHS) {
      const run = await openStatement(name, width);
      await noOverflow(run.page, "body", `${name} ${width}`);
      await run.page.close();
    }
  }
});

// ── leaving, archive, transfer: the server's lines ──────────────────────────────────────────────────────

const plainDialog = async (page) => plain(await page.locator('[role="dialog"]').innerText());
async function openLeave(memberships, { post, width = 1280 } = {}) {
  const run = await openPage(browser, "money2.entry.tsx", F.baseServer(X2.leaveServer(memberships, post)), { width, height: heightOf(width) });
  await run.page.evaluate(([u]) => window.mount("leave-lines", u), [OWNER]);
  await run.page.waitForSelector('[data-testid="settle-membership"]');
  return run;
}

test("the leaving: «что было → что станет» of the server (the line and its basis), the sentence about the other group as it is («В группе «…»»), the outcome `effects.stays`; the result is in the past tense, in the server's words", async () => {
  const preview = fx("leave_preview_recalc_others");
  const result = fx("leave_result_recalc_others");
  const run = await openLeave(preview.memberships, { post: () => ({ json: result }) });
  assert.equal(plain(await run.page.locator('[data-testid="recalc-line"] p').first().innerText()), "Ноябрь: 600 000 → 450 000 сум");
  assert.equal(plain(await run.page.locator('[data-testid="recalc-basis"]').innerText()), "пересчёт по день ухода · 9 уроков из 12");
  const text = await plainDialog(run.page);
  assert.ok(text.includes("В группе «Английский 7»: 500 000 → 400 000 сум — сегодняшний урок оплачен в группе «Математика 7»"), text);
  assert.equal(plain(await run.page.locator('[data-testid="settle-words"]').innerText()), "Останется долг 450 000 сум");
  assert.ok(text.indexOf("Ноябрь:") < text.indexOf("В группе") && text.indexOf("В группе") < text.indexOf("Останется долг"), text);
  await run.page.getByRole("button", { name: "Убрать из группы" }).click();
  await run.page.waitForFunction(() => window.__log.length > 0);
  const said = plain((await run.page.evaluate(() => window.__log))[0]);
  assert.ok(said.startsWith("left:Ноябрь: 600 000 → 450 000 сум"), said);
  assert.ok(said.includes("В группе «Английский 7»") && said.includes("Долг 450 000 сум остался за учеником"), said);
  await run.page.close();
});

test("the leaving with an advance: the outcome «Останется аванс 700 000 сум», «Вернуть 700 000 сум» comes from `money.advance`", async () => {
  const preview = fx("leave_preview_paid_ahead");
  const run = await openLeave(preview.memberships);
  const text = await plainDialog(run.page);
  assert.ok(text.includes("Останется аванс 700 000 сум") && text.includes("Вернуть 700 000 сум"), text);
  await run.page.close();
});

test("the leaving at 1440 / 1280 / 1024 / 768 / 375: nothing leaves its box", async () => {
  const preview = fx("leave_preview_recalc_others");
  for (const width of WIDTHS) {
    const run = await openLeave(preview.memberships, { width });
    await noOverflow(run.page, '[role="dialog"]', `leave ${width}`);
    await run.page.close();
  }
});

// ── adding: the forecast of the charge that starts later ────────────────────────────────────────────────

test("adding (one student, the server's probe): the bar says «Начисление с 24 ноября» and the server's forecast; the message after is the server's sentence", async () => {
  const probe = fx("enrol_upcoming_probe");
  const server = F.baseServer((r) => {
    if (r.method === "GET" && r.path === "/auth/org/groups/gt/pay-from-default") return { json: { today: "2026-11-21", first_lesson: "2026-11-24", default_pay_from: "2026-11-24", text: probe.billing.text } };
    if (r.method === "POST" && r.path === "/auth/org/groups/gt/students/st1") return { json: { ...probe, dry_run: /dry_run=true/.test(r.query) } };
    return null;
  }, F.SHORT);
  const run = await openPage(browser, "money2.entry.tsx", server, { width: 1280, height: 900 });
  await run.page.evaluate((p) => window.mount("assign", { role: "owner", org_role: "owner" }, p), { moneyAvailable: true, groupsBasePath: "/owner/groups", mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], sourceGroups: [{ id: "ga", name: F.SHORT.A }] });
  await run.page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
  await run.page.waitForSelector('[data-testid="summary-bar-sum"]');
  assert.equal(plain(await run.page.locator('[data-testid="summary-bar-label"]').first().innerText()), "Начисление с 24 ноября");
  assert.equal(plain(await run.page.locator('[data-testid="summary-bar-sum"]').innerText()), "150 000 сум");
  assert.equal(plain(await run.page.locator('[data-testid="summary-bar-line"]').innerText()), "3 урока из 12 в ноябре · платить до 28.11");
  await run.page.click('[data-testid="assign-submit"]');
  await run.page.waitForSelector("[data-tone]");
  assert.ok(plain(await run.page.locator("[data-tone]").first().innerText()).includes("Начисление с 24.11: 150 000 сум"));
  await run.page.close();
});

test("adding a batch (the server's probe): the bar takes `upcoming_total` (300 000 сум, «платить до 28.11»), the screen adds nothing up", async () => {
  const bulk = fx("enrol_upcoming_bulk_probe");
  const server = (r) => {
    const out = H.server({ people: H.PEOPLE, defaultPayFrom: "2026-11-24" })(r);
    if (!out || !out.json || r.method !== "POST") return out;
    return { ...out, json: { ...out.json, students: out.json.students?.map((student, index) => ({ ...student, billing: { ...(student.billing ?? {}), upcoming: bulk.students[index % bulk.students.length].billing.upcoming } })), upcoming_total: bulk.upcoming_total } };
  };
  const ctx = { browser };
  const run = await H.openDrawer(ctx, server, { props: { groupName: "М11 БС" } });
  await H.pick(run.page, "Каримов", "Юсупова"); await H.settled(run.page);
  assert.equal(plain(await run.page.locator('[data-testid="summary-bar-label"]').first().innerText()), "Начисление с 24 ноября");
  assert.equal(plain(await run.page.locator('[data-testid="summary-bar-sum"]').innerText()), "300 000 сум");
  assert.equal(plain(await run.page.locator('[data-testid="summary-bar-line"]').innerText()), "платить до 28.11");
  await run.page.close();
});
