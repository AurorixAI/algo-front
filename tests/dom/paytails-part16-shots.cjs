// PAY-TAILS Б11.39 / Б11.40 (part 16): `node tests/dom/paytails-part16-shots.cjs <out dir>` - the PNGs of the window «Пауза ученика», 1280 and 375, named «<состояние>-<ширина>.png», every state of Э10 + Э9'.
// The window is the REAL component (real React, the real Modal and the CSS of the project) answered by the contract samples (tests/fixtures/paytails/part16/contract_*.json); in every state with rows the script
// ALSO reads the DOM and compares it with the rows of the sample (lesson 178: the window = the answer).  Prints ONLY suspicious things (sideways scroll, text off its block, a console error, a row that is not the sample's).
// Run with TMPDIR in `artifacts/money1-stage/.cache` (the css of the run goes there).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.join(__dirname, "..", "..");
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
process.env.DOM_CSS = css;
const { launch, openPage } = require("../helpers/dom-page.cjs");
const { layoutProbe } = require("../helpers/layout-probe.cjs");
const { readReal } = require("../helpers/paytails-part13.cjs");
const { contract: sample, pauseOf, pauseServer, day, dmy } = require("../helpers/paytails-part16.cjs");
// the pictures show the days of today: the labels move with them
const contract = (name) => sample(name, { labels: true });

const OWNER = { role: "owner", org_role: "owner" };
const ADMIN = { role: "admin", org_role: "admin" };
const suspicious = [];
const dims = (width) => ({ width, height: width === 375 ? 1500 : 1000 });
const plain = (text) => String(text ?? "").replace(/[\s ]+/g, " ").trim();
const wordFor = (n) => (n % 10 === 1 && n % 100 !== 11 ? "урок" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "урока" : "уроков");
const signed = (n) => `${n < 0 ? "−" : "+"}${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} сум`;

const RUNNING = () => pauseOf("pr1", day(-7), day(6), { reason: "уехал к родственникам" });
const PLANNED = () => pauseOf("pf1", day(14), day(20), { reason: "соревнования" });
const LEAVE_TEXT = readReal("pause_closed_by_leave_later").days_locked_text;
const RETURN_TEXT = readReal("pause_closed_by_leave_today").days_locked_text;
const TRANSFER_TEXT = readReal("pause_closed_by_transfer_later").days_locked_text;
const locked = (id, first, last, text, over = {}) => pauseOf(id, first, last, { days_locked: true, days_locked_text: text, reason: "уехал к родственникам", ...over });
const probeOf = (name) => (request) => ({ json: { ...contract(name), dry_run: /dry_run=true/.test(request.query) } });
const createFrom = (name) => ({ create: probeOf(name) });
const closedMonth = { status: 422, json: { detail: { code: "PAUSE_LOCKED", message: "Месяц преподавателя закрыт ведомостью: паузу за эти дни не изменить", month: "2026-11", teacherId: "t1", teacherName: "Эргашев К.", closedOn: "2026-11-23" } } };

const typeDates = (first, last) => async (page) => { await page.fill("#pause-first", dmy(first)); await page.fill("#pause-last", dmy(last)); await page.waitForFunction(() => { const box = document.querySelector('[data-testid="pause-calc"]'); return box && !box.querySelector(".animate-spin"); }); await page.waitForTimeout(250); };
const click = (name, exact = false) => async (page) => { await page.getByRole("button", { name, exact }).click(); await page.waitForTimeout(600); };

// state: [name, server options, props, user, act, sample (the answer whose rows the DOM must show; scope of the rows)]
const STATES = [
  ["none", {}, {}, OWNER, async () => {}],
  ["calc_week", createFrom("pause_probe_create_week"), {}, OWNER, typeDates(day(0), day(6)), ["pause_probe_create_week", '[data-testid="pause-calc"]']],
  ["calc_two_months_later", createFrom("pause_probe_create_two_months"), {}, OWNER, typeDates(day(0), day(9)), ["pause_probe_create_two_months", '[data-testid="pause-calc"]']],
  ["calc_two_months_begun", createFrom("pause_probe_create_two_months_begun"), {}, OWNER, typeDates(day(0), day(9)), ["pause_probe_create_two_months_begun", '[data-testid="pause-calc"]']],
  ["calc_backdated", createFrom("pause_probe_create_backdated"), {}, OWNER, typeDates(day(-7), day(6)), ["pause_probe_create_backdated", '[data-testid="pause-calc"]']],
  ["calc_future_month", createFrom("pause_probe_create_future_month"), {}, OWNER, typeDates(day(7), day(16)), ["pause_probe_create_future_month", '[data-testid="pause-calc"]']],
  ["calc_with_balance", createFrom("pause_probe_create_week_with_balance"), {}, OWNER, typeDates(day(0), day(6)), ["pause_probe_create_week_with_balance", '[data-testid="pause-calc"]']],
  ["calc_no_money_role", createFrom("pause_probe_create_no_money_role"), { moneyAvailable: false }, ADMIN, typeDates(day(0), day(6)), ["pause_probe_create_no_money_role", '[data-testid="pause-calc"]']],
  ["calc_old_server", { create: () => { const answer = contract("pause_probe_create_week"); delete answer.charge_rows; delete answer.charge_later; return { json: answer }; } }, {}, OWNER, typeDates(day(0), day(6))],
  ["calc_packages_old_line", createFrom("pause_probe_create_packages"), {}, OWNER, typeDates(day(0), day(6))],
  ["calc_refused_overlap", { create: { status: 409, json: { detail: { code: "PAUSE_OVERLAP", message: "На эти дни уже есть пауза: с 17.11 по 30.11" } } } }, {}, OWNER, typeDates(day(0), day(6))],
  ["calc_error_retry", { create: { status: 500, json: {} } }, {}, OWNER, typeDates(day(0), day(6))],
  ["calc_closed_month", { create: closedMonth }, {}, OWNER, typeDates(day(0), day(6))],
  ["calc_long_seven_digits", { create: { ...contract("pause_probe_create_two_months_begun"), impact: { ...contract("pause_probe_create_two_months_begun").impact, charged_delta: -11111110 }, charge_rows: [
    { label: "24.11.2026–10.01.2027", first_day: "2026-11-24", last_day: "2027-01-10", days: 48, lessons: 120, lessons_passed: 37, amount: -1234567 },
    { label: "11.01.2027–30.01.2027", first_day: "2027-01-11", last_day: "2027-01-30", days: 20, lessons: 8, lessons_passed: null, amount: -9876543 }] } }, {}, OWNER, typeDates(day(0), day(9))],
  ["card_running", { pauses: [RUNNING()] }, {}, OWNER, async () => {}],
  ["card_running_planned", { pauses: [RUNNING(), PLANNED()] }, {}, OWNER, async () => {}],
  ["card_planned", { pauses: [PLANNED()] }, {}, OWNER, async () => {}],
  ["card_started_today", { pauses: [pauseOf("pt", day(0), day(5), { reason: "семейные дела" })] }, {}, OWNER, async () => {}],
  ["card_running_locked_in_group", { pauses: [locked("pl", day(-3), day(9), LEAVE_TEXT)] }, {}, OWNER, async () => {}],
  ["confirm_end", { pauses: [RUNNING()], end: probeOf("pause_probe_end_today") }, {}, OWNER, click("Закончить сегодня"), ["pause_probe_end_today", '[data-testid="pause-card-acting"]']],
  ["confirm_void_running_reason_empty", { pauses: [RUNNING()], void: probeOf("pause_probe_void_running") }, {}, OWNER, click("Снять паузу целиком"), ["pause_probe_void_running", '[data-testid="pause-card-acting"]']],
  ["confirm_void_running_reason_filled", { pauses: [RUNNING()], void: probeOf("pause_probe_void_running") }, {}, OWNER, async (page) => { await click("Снять паузу целиком")(page); await page.fill("#pause-act-reason", "ученик передумал"); }, ["pause_probe_void_running", '[data-testid="pause-card-acting"]']],
  ["confirm_void_planned", { pauses: [PLANNED()], void: probeOf("pause_probe_void_future") }, {}, OWNER, click("Снять паузу", true), ["pause_probe_void_future", '[data-testid="pause-card-acting"]']],
  ["confirm_error_write_in_card", { pauses: [RUNNING()], void: (request) => (/dry_run=true/.test(request.query) ? { json: { ...contract("pause_probe_void_running"), dry_run: true } } : { status: 409, json: { detail: { code: "PAUSE_RANGE", message: "Слишком давняя дата: паузу уже не изменить" } } }) }, {}, OWNER, async (page) => { await click("Снять паузу целиком")(page); await page.fill("#pause-act-reason", "ошибка"); await page.locator('[data-testid="pause-act-confirm"]').click(); await page.waitForTimeout(500); }],
  ["confirm_closed_month_in_card", { pauses: [RUNNING()], void: closedMonth }, {}, OWNER, click("Снять паузу целиком")],
  ["confirm_probe_error_retry", { pauses: [RUNNING()], void: { status: 500, json: {} } }, {}, OWNER, click("Снять паузу целиком")],
  ["new_over_one_live", { pauses: [RUNNING()] }, {}, OWNER, async (page) => { await page.locator('[data-testid="pause-new"]').click(); await page.waitForTimeout(400); }],
  ["new_over_two_live", { pauses: [RUNNING(), PLANNED()] }, {}, OWNER, async (page) => { await page.locator('[data-testid="pause-new"]').click(); await page.waitForTimeout(400); }],
  ["past_closed_over_form", { pauses: [pauseOf("a", day(-60), day(-54), { reason: "болел" }), pauseOf("b", day(-100), day(-98)), locked("c", day(-8), day(-6), LEAVE_TEXT)] }, {}, OWNER, async () => {}],
  ["past_open_with_locked", { pauses: [pauseOf("a", day(-60), day(-54), { reason: "болел" }), pauseOf("b", day(-100), day(-98)), pauseOf("y", "2025-10-05", "2025-10-11", { reason: "прошлый год" }), locked("c", day(-8), day(-6), LEAVE_TEXT)] }, {}, OWNER, async (page) => { await page.locator('[data-testid="pause-past-summary"]').click(); await page.waitForTimeout(300); }],
  ["left_today_return_way", { pauses: [locked("l1", day(-5), day(-3), RETURN_TEXT, { reason: "Болезнь" })] }, { active: false }, OWNER, async () => {}],
  ["left_transfer_earlier", { pauses: [locked("l2", day(-5), day(-3), TRANSFER_TEXT)] }, { active: false }, OWNER, async () => {}],
  ["left_locked_and_plain_past", { pauses: [locked("l1", day(-5), day(-3), LEAVE_TEXT), pauseOf("p2", day(-40), day(-35), { reason: "болел" })] }, { active: false }, OWNER, async (page) => { await page.locator('[data-testid="pause-past-summary"]').click(); await page.waitForTimeout(300); }],
];

// the rows of the DOM must be the rows of the sample: label, count word, sign and digits (lesson 178)
async function compare(page, label, [sampleName, scope]) {
  const answer = contract(sampleName);
  const rows = answer.charge_rows ?? [];
  const shown = await page.locator(`${scope} [data-testid="pause-money-row"]`).evaluateAll((items) => items.map((li) => [li.querySelector('[data-testid="pause-money-label"]').textContent.replace(/[\s ]+/g, " ").trim(), li.querySelector('[data-testid="pause-money-amount"]')?.textContent.replace(/[\s ]+/g, " ").trim() ?? null]));
  if (shown.length !== rows.length) { suspicious.push(`${label}: ${shown.length} rows on the screen, ${rows.length} in the sample`); return; }
  rows.forEach((row, index) => {
    const count = row.lessons !== null ? `${row.lessons} ${wordFor(row.lessons)}` : `${row.days} дн`;
    if (!shown[index][0].startsWith(`${row.label} · ${count}`)) suspicious.push(`${label}: row ${index} says «${shown[index][0]}», the sample «${row.label} · ${count}»`);
    const amount = row.amount === null ? null : signed(row.amount);
    if (shown[index][1] !== amount) suspicious.push(`${label}: row ${index} sum «${shown[index][1]}», the sample «${amount}»`);
  });
}

async function check(page, rawErrors, label, scope) {
  // a refusal of the test server (4xx / 5xx on purpose) is written by the browser as a console error: not a defect
  const errors = rawErrors.filter((text) => !/Failed to load resource: the server responded with a status of (4|5)\d\d/.test(text));
  const probe = await page.evaluate(layoutProbe, scope);
  const pageScroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (probe.bad.length || probe.scroll > 0 || pageScroll > 0 || errors.length) suspicious.push(`${label}: scroll ${pageScroll}/${probe.scroll} bad ${JSON.stringify(probe.bad).slice(0, 240)} errors ${JSON.stringify(errors).slice(0, 200)}`);
}
// the height of the shot of a phone is the height of the content: measure in a tall viewport, then cut the viewport to the window plus its margins
const shot = async (page, name) => {
  if (name.endsWith("-375")) {
    await page.setViewportSize({ width: 375, height: 4000 });
    await page.waitForTimeout(250);
    const height = await page.evaluate(() => { const box = document.querySelector('[role="dialog"]'); return box ? Math.ceil(box.getBoundingClientRect().height) : null; });
    if (height) { await page.setViewportSize({ width: 375, height: height + 24 }); await page.waitForTimeout(250); }
  }
  await page.screenshot({ path: path.join(out, `${name}.png`) });
};

(async () => {
  const browser = await launch();
  for (const width of [1280, 375]) {
    for (const [state, options, props, user, act, sample] of STATES) {
      const server = pauseServer(options);
      const { page, errors } = await openPage(browser, "money2.entry.tsx", server, dims(width));
      await page.evaluate(([n, u, p]) => window.mount(n, u, p), ["pause", user, { moneyAvailable: true, groupName: "Алгебра", ...props }]);
      await page.waitForSelector('[data-testid="pause-loading"], #pause-first, [data-testid="pause-card"], [data-testid="pause-past"]');
      await page.waitForTimeout(500);
      await act(page);
      await page.waitForTimeout(400);
      if (sample) await compare(page, `${state}-${width}`, sample);
      await check(page, errors, `${state}-${width}`, '[role="dialog"]');
      await shot(page, `${state}-${width}`);
      await page.close();
    }
  }
  await browser.close();
  console.log(suspicious.length ? suspicious.join("\n") : "no suspicious");
})().catch((error) => { console.error(error); process.exit(1); });
