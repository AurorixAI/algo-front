// PAY-TAILS Б11.39 / Б11.40 / Б11.41 / Б11.43 (part 16-17): `node tests/dom/paytails-part16-shots.cjs <out dir>` - the PNGs of the window «Пауза ученика», 1280 and 375, named «<состояние>-<ширина>.png», every state of Э10 + Э9' + the three worlds with `period_begins` (those are shown with the working day of the world, 02.12.2026, and the answer exactly as the server wrote it).
// The window is the REAL component (real React, the real Modal and the CSS of the project) answered by the REAL answers of the server (tests/fixtures/paytails/part16/pause_probe_*.json); in every state with rows the script
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
const { contract, pauseOf, pauseBefore, pauseServer, worldDay, dmy, FIXTURE_DAY } = require("../helpers/paytails-part16.cjs");
// lesson 178: NOTHING of an answer is moved - the clock of the page stands on the working day of the world the answer was taken in; the pauses of the lists are `pauses_list_mixed.json` as the server wrote it
const listMixed = JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "paytails", "part16", "pauses_list_mixed.json"), "utf8"));
const probeOf = (name) => (request) => ({ json: { ...contract(name), dry_run: /dry_run=true/.test(request.query) } });
const withAnswer = (answer) => (request) => ({ json: { ...answer, dry_run: /dry_run=true/.test(request.query) } });

const OWNER = { role: "owner", org_role: "owner" };
const ADMIN = { role: "admin", org_role: "admin" };
const suspicious = [];
const dims = (width) => ({ width, height: width === 375 ? 1500 : 1000 });
const plain = (text) => String(text ?? "").replace(/[\s ]+/g, " ").trim();
const wordFor = (n) => (n % 10 === 1 && n % 100 !== 11 ? "урок" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "урока" : "уроков");
const signed = (n) => `${n < 0 ? "−" : "+"}${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} сум`;

// the real pauses of the server of the world 24.11: the list (a running one 18.11-01.12, a planned one 10.12-14.12, two past ones) and the pause objects of the closed ones
const [PLANNED, RUNNING, PAST_A, PAST_B] = listMixed;
const LEAVE_PAUSE = readReal("pause_closed_by_leave_later");
const RETURN_PAUSE = readReal("pause_closed_by_leave_today");
const TRANSFER_PAUSE = readReal("pause_closed_by_transfer_later");
const FREE_RUNNING = readReal("pause_without_cut");   // 17.11-30.11, free: the card of the confirmations (the dates of the real answers of an ending and of a taking off)
const closedMonth = { status: 422, json: { detail: { code: "PAUSE_LOCKED", message: "Месяц преподавателя закрыт ведомостью: паузу за эти дни не изменить", month: "2026-11", teacherId: "t1", teacherName: "Эргашев К.", closedOn: "2026-11-23" } } };

const typeOf = (answer) => async (page) => { await page.fill("#pause-first", dmy(answer.pause.first_day)); await page.fill("#pause-last", dmy(answer.pause.last_day)); await page.waitForFunction(() => { const box = document.querySelector('[data-testid="pause-calc"]'); return box && !box.textContent.includes("Считаем"); }); await page.waitForTimeout(500); };
const click = (name, exact = false) => async (page) => { await page.getByRole("button", { name, exact }).click(); await page.waitForTimeout(600); };
const none = async () => {};
const openNew = async (page) => { await page.locator('[data-testid="pause-new"]').click(); await page.waitForTimeout(400); };
const openPast = async (page) => { await page.locator('[data-testid="pause-past-summary"]').click(); await page.waitForTimeout(300); };

// a synthetic answer is written in ONE day (the fields, the rows, the line and the debt agree) and its state is named «stress_…»
const real0212 = contract("pause_probe_create_two_months_begun_0212");
const stressSeven = (() => { const real = contract("pause_probe_create_two_months_begun"); return { ...real, pause: { ...real.pause, first_day: "2026-11-24", last_day: "2027-01-30", days: 68 }, charge_rows: [
  { label: "24.11.2026–10.01.2027", first_day: "2026-11-24", last_day: "2027-01-10", days: 48, lessons: 120, lessons_passed: 37, amount: -1234567 },
  { label: "11.01.2027–30.01.2027", first_day: "2027-01-11", last_day: "2027-01-30", days: 20, lessons: 8, lessons_passed: null, amount: -9876543 }], impact: { ...real.impact, charged_delta: -11111110, debt_before: 20000000, debt_after: 8888890 } }; })();
const stressDeferred = { ...real0212, pause: { ...real0212.pause, first_day: "2026-11-24", last_day: "2027-01-30", days: 68 }, charge_rows: [
  { label: "24.11.2026–10.01.2027", first_day: "2026-11-24", last_day: "2027-01-10", days: 48, lessons: 120, lessons_passed: 37, amount: -1234567 },
  { label: "11.01.2027–30.01.2027", first_day: "2027-01-11", last_day: "2027-01-30", days: 20, lessons: 8, lessons_passed: null, amount: -1876543, period_begins: "2027-01-31", deferred: -7654321, period_label: "11.01.2027–30.01.2027" }], impact: { ...real0212.impact, charged_delta: -10765431, debt_before: 20000000, debt_after: 9234569 } };
// the real answer of a week with `paid_until_after` moved by hand to the last day of the pause (no real probe moves it) - the one hand-made field
const balanceWeek = (() => { const answer = contract("pause_probe_create_week"); return { ...answer, impact: { ...answer.impact, paid_until_after: "2026-11-30" } }; })();
const CALC = '[data-testid="pause-calc"]';
const ACTING = '[data-testid="pause-card-acting"]';
const create = (name) => ({ create: probeOf(name) });
const calcState = (name, user = OWNER, props = {}) => [`calc_${name.replace(/^pause_probe_create_/, "")}`, create(name), props, user, typeOf(contract(name)), [name, CALC], worldDay(name)];
const actState = (state, kind, name, pause, act = click(kind === "end" ? "Закончить сегодня" : "Снять паузу целиком")) => [state, { pauses: [pause], [kind]: probeOf(name) }, {}, OWNER, act, [name, ACTING], worldDay(name)];

// state: [name, server options, props, user, act, [sample answer name, scope of the rows] (the DOM must show its rows), world day]
const STATES = [
  ["none", {}, {}, OWNER, none],
  calcState("pause_probe_create_week"),
  calcState("pause_probe_create_two_months"),
  calcState("pause_probe_create_two_months_begun"),
  calcState("pause_probe_create_backdated"),
  calcState("pause_probe_create_future_month"),
  ["calc_with_balance", { create: withAnswer(balanceWeek) }, {}, OWNER, typeOf(balanceWeek)],
  calcState("pause_probe_create_two_months_begun_0212"),
  calcState("pause_probe_create_backdated_month_start"),
  calcState("pause_probe_create_no_money_role", ADMIN, { moneyAvailable: false }),
  ["calc_old_server", { create: () => { const answer = contract("pause_probe_create_week"); delete answer.charge_rows; delete answer.charge_later; return { json: answer }; } }, {}, OWNER, typeOf(contract("pause_probe_create_week"))],
  ["calc_packages_old_line", create("pause_probe_create_packages"), {}, OWNER, typeOf(contract("pause_probe_create_packages"))],
  ["calc_refused_overlap", { create: { status: 409, json: { detail: { code: "PAUSE_OVERLAP", message: "На эти дни уже есть пауза: с 17.11 по 30.11" } } } }, {}, OWNER, typeOf(contract("pause_probe_create_week"))],
  ["calc_error_retry", { create: { status: 500, json: {} } }, {}, OWNER, typeOf(contract("pause_probe_create_week"))],
  ["calc_closed_month", { create: closedMonth }, {}, OWNER, typeOf(contract("pause_probe_create_week"))],
  ["stress_long_seven_digits", { create: withAnswer(stressSeven) }, {}, OWNER, typeOf(stressSeven), [stressSeven, CALC]],
  ["stress_long_period_deferred", { create: withAnswer(stressDeferred) }, {}, OWNER, typeOf(stressDeferred), [stressDeferred, CALC]],
  ["card_running", { pauses: [RUNNING] }, {}, OWNER, none],
  ["card_running_planned", { pauses: [PLANNED, RUNNING] }, {}, OWNER, none],
  ["card_planned", { pauses: [PLANNED] }, {}, OWNER, none],
  actState("confirm_end", "end", "pause_probe_end_today", FREE_RUNNING),
  actState("confirm_void_running_reason_empty", "void", "pause_probe_void_running", FREE_RUNNING),
  actState("confirm_void_running_reason_filled", "void", "pause_probe_void_running", FREE_RUNNING, async (page) => { await click("Снять паузу целиком")(page); await page.fill("#pause-act-reason", "ученик передумал"); }),
  actState("confirm_void_two_months_0212", "void", "pause_probe_void_two_months_0212", pauseBefore("pause_probe_void_two_months_0212")),
  actState("confirm_void_planned", "void", "pause_probe_void_future", pauseBefore("pause_probe_void_future"), click("Снять паузу", true)),
  ["confirm_error_write_in_card", { pauses: [FREE_RUNNING], void: (request) => (/dry_run=true/.test(request.query) ? { json: { ...contract("pause_probe_void_running"), dry_run: true } } : { status: 409, json: { detail: { code: "PAUSE_RANGE", message: "Слишком давняя дата: паузу уже не изменить" } } }) }, {}, OWNER, async (page) => { await click("Снять паузу целиком")(page); await page.fill("#pause-act-reason", "ошибка"); await page.locator('[data-testid="pause-act-confirm"]').click(); await page.waitForTimeout(600); }],
  ["confirm_closed_month_in_card", { pauses: [FREE_RUNNING], void: closedMonth }, {}, OWNER, click("Снять паузу целиком")],
  ["confirm_probe_error_retry", { pauses: [FREE_RUNNING], void: { status: 500, json: {} } }, {}, OWNER, click("Снять паузу целиком")],
  ["new_over_one_live", { pauses: [RUNNING] }, {}, OWNER, openNew],
  ["new_over_two_live", { pauses: [PLANNED, RUNNING] }, {}, OWNER, openNew],
  ["past_closed_over_form", { pauses: [PAST_A, PAST_B, LEAVE_PAUSE] }, {}, OWNER, none],
  ["past_open_with_locked", { pauses: [PAST_A, PAST_B, LEAVE_PAUSE] }, {}, OWNER, openPast],
  ["left_today_return_way", { pauses: [RETURN_PAUSE] }, { active: false }, OWNER, none],
  ["left_transfer_earlier", { pauses: [TRANSFER_PAUSE] }, { active: false }, OWNER, none],
  ["left_old_data_free_running", { pauses: [FREE_RUNNING, PAST_A] }, { active: false }, OWNER, none],   // no card: the fold is open by itself
  ["left_locked_and_plain_past", { pauses: [LEAVE_PAUSE, PAST_A] }, { active: false }, OWNER, openPast],
];

const num = (text) => Number(text.replace(/\D/g, ""));
// the rows of the DOM must be the rows of the sample (lesson 178) and the number must add up as the person reads it: the debt before + Σ rows + Σ moved periods = the debt after
async function compare(page, label, [sampleName, scope]) {
  const answer = typeof sampleName === "string" ? contract(sampleName) : sampleName;
  const rows = (answer.charge_rows ?? []).filter((row) => row.amount !== 0 && row.lessons !== 0);
  const shown = await page.locator(`${scope} [data-testid="pause-money-row"]`).evaluateAll((items) => items.map((li) => [li.querySelector('[data-testid="pause-money-label"]').textContent.replace(/[\s ]+/g, " ").trim(), li.querySelector('[data-testid="pause-money-amount"]')?.textContent.replace(/[\s ]+/g, " ").trim() ?? null]));
  if (shown.length !== rows.length) { suspicious.push(`${label}: ${shown.length} rows on the screen, ${rows.length} in the sample`); return; }
  rows.forEach((row, index) => {
    const count = row.lessons !== null ? `${row.lessons} ${wordFor(row.lessons)}` : `${row.days} дн`;
    if (!shown[index][0].startsWith(`${row.label} · ${count}`)) suspicious.push(`${label}: row ${index} says «${shown[index][0]}», the sample «${row.label} · ${count}»`);
    const amount = row.amount === null ? null : signed(row.amount);
    if (shown[index][1] !== amount) suspicious.push(`${label}: row ${index} sum «${shown[index][1]}», the sample «${amount}»`);
  });
  const lines = (await page.locator(`${scope} [data-testid="pause-money-deferred"]`).allInnerTexts()).map(plain);
  const moved = (answer.charge_rows ?? []).filter((row) => row.period_label);
  if (lines.length !== moved.length) suspicious.push(`${label}: ${lines.length} lines of moved periods, ${moved.length} in the sample`);
  const text = plain(await page.locator(scope).innerText());
  const balance = text.match(/Остаток: долг ([\d\s]+) сум → долг ([\d\s]+) сум/);
  if (balance) {
    const rowsSum = shown.reduce((total, [, amount]) => total + (amount ? (amount.startsWith("−") ? -1 : 1) * num(amount) : 0), 0);
    const movedSum = lines.reduce((total, line) => total + (/начнётся/.test(line) ? -1 : 1) * num(line.match(/оплата ([\d\s]+) сум/)[1]), 0);
    if (num(balance[1]) + rowsSum + movedSum !== num(balance[2])) suspicious.push(`${label}: debt ${balance[1]} + rows ${rowsSum} + moved ${movedSum} is not debt ${balance[2]}`);
  }
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
    for (const [state, options, props, user, act, sample, world = FIXTURE_DAY] of STATES) {
      const server = pauseServer(options);
      const { page, errors } = await openPage(browser, "money2.entry.tsx", server, { ...dims(width), today: world });
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
