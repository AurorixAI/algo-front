// Money-2 wave 1, Т9: the windows of the pause (make, end, cancel) say what the pause does in the OTHER groups of the student - the sentence of the server (`other_groups_text`), once; the cancel of a pause
// asks the dry run first; 409 `PAUSE_BREAKS_REFUND` is the server's text and the button is off; a role without the right to money has no such sentence and is not stopped.
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

const plain = (text) => text.replace(/\s+/g, " ").replace(/ /g, " ").trim();
const day = (shift) => { const date = new Date(Date.now() + shift * 86400000); return date.toISOString().slice(0, 10); };
const dmy = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const OTHER = `В группе «${F.T}» аванс уменьшится на 30 000 сум — до 390 000 сум`;
const BREAKS = `Из группы «${F.T}» уже возвращены деньги, которые перешли туда из этой группы: 390 000 сум. Сначала отмените возврат в группе «${F.T}»`;
const pause = (id, first, last) => ({ id, membership_id: "m-a", first_day: first, last_day: last, days: 4, reason: null, created_by_name: null, created_at: null, voided_at: null, void_reason: null });
const saved = (p, text, extra = {}) => ({ pause: p, impact: { charged_delta: -80000, paid_until_before: null, paid_until_after: null, debt_before: 0, debt_after: 0, advance_before: 0, advance_after: 0 }, lessons: { excluded: [], attended: [] }, payroll: null, dry_run: true, row: null, other_groups_text: text, ...extra });

function server({ text = OTHER, breaks = false } = {}) {
  const running = pause("pr", day(-2), day(3));
  const future = pause("pf", day(10), day(13));
  return F.baseServer((request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m-a/pauses") return { json: [running, future] };
    const dry = /dry_run=true/.test(request.query);
    if (request.method === "POST" && request.path === "/auth/org/memberships/m-a/pauses") return { status: dry ? 200 : 201, json: saved(pause("pn", day(1), day(4)), text, { dry_run: dry }) };
    if (breaks && /^\/auth\/org\/pauses\//.test(request.path)) return { status: 409, json: { detail: { code: "PAUSE_BREAKS_REFUND", message: BREAKS } } };
    if (request.method === "PATCH" && request.path === "/auth/org/pauses/pr") return { json: saved(running, text, { dry_run: dry }) };
    if (request.method === "POST" && request.path === "/auth/org/pauses/pf/void") return { json: { pause: future, impact: null, row: null, dry_run: dry, other_groups_text: text } };
    return null;
  });
}
async function open(width, answer) {
  const run = await openPage(browser, "money2.entry.tsx", answer, { width, height: 900 });
  await run.page.evaluate(() => window.mount("pause", { role: "owner", org_role: "owner" }, { moneyAvailable: true, groupName: "Алгебра 7 класс, углублённая программа подготовки к олимпиаде (вторник и пятница, 16:00)" }));
  await run.page.waitForSelector('section[aria-label="Паузы ученика"]');
  return run;
}
const dryCalls = (run, pathPattern) => run.calls.filter((call) => pathPattern.test(call.path) && /dry_run=true/.test(call.query));

test("Т9 (создание): the sentence about the other group stands once under the calculation of the pause", async () => {
  const run = await open(1280, server());
  await run.page.locator('[data-testid="pause-new"]').click();                // Б11.39 Э1: there are live pauses - the form of a new one is behind «+ Новая пауза»
  await run.page.fill("#pause-first", dmy(day(1)));
  await run.page.fill("#pause-last", dmy(day(4)));
  await run.page.waitForSelector('[data-testid="pause-calc"] p');
  await run.page.waitForFunction((text) => (document.querySelector('[data-testid="pause-calc"]')?.textContent ?? "").replace(/\s/g, " ").includes(text), OTHER);
  const calc = plain(await run.page.textContent('[data-testid="pause-calc"]'));
  assert.equal(calc.split(OTHER.replace(/ /g, " ")).length - 1, 1, calc);
  await run.page.close();
});

test("Т9 (отмена и окончание): the dry run is asked when the action opens, its sentence is shown once, the write follows", async () => {
  const run = await open(1280, server());
  await run.page.locator('[data-testid="pause-card"][data-state="planned"]').getByRole("button", { name: /^Снять паузу, пауза с \d\d\.\d\d по \d\d\.\d\d$/ }).click();   // two cards: the name says whose pause (rule 142)              // the planned pause: «Снять паузу»
  await run.page.waitForSelector('[data-testid="pause-act-effects"]');
  assert.equal(dryCalls(run, /\/pauses\/pf\/void$/).length, 1, "the cancel asks the dry run");
  assert.equal(plain(await run.page.textContent('[data-testid="pause-act-effects"]')), plain(OTHER));
  await run.page.close();

  const ending = await open(1280, server());
  await ending.page.getByRole("button", { name: "Закончить сегодня" }).first().click();
  await ending.page.waitForSelector('[data-testid="pause-act-effects"]');
  assert.equal(dryCalls(ending, /\/pauses\/pr$/).length, 1);
  assert.equal(plain(await ending.page.textContent('[data-testid="pause-act-effects"]')), plain(OTHER));
  await ending.page.close();
});

test("Т9: 409 `PAUSE_BREAKS_REFUND` - the server's text (with the name of the group), the button is off; without the right to money no sentence and no dead end", async () => {
  const run = await open(1280, server({ breaks: true }));
  await run.page.locator('[data-testid="pause-card"][data-state="planned"]').getByRole("button", { name: /^Снять паузу, пауза с \d\d\.\d\d по \d\d\.\d\d$/ }).click();   // two cards: the name says whose pause (rule 142)
  await run.page.waitForSelector('[data-testid="pause-act-effects"]');
  assert.equal(plain(await run.page.textContent('[data-testid="pause-act-effects"]')), plain(BREAKS));
  const confirm = run.page.locator('[data-testid="pause-act-confirm"]');
  assert.equal(await confirm.isDisabled(), true);
  await run.page.close();

  const blind = await open(1280, server({ text: null }));
  await blind.page.locator('[data-testid="pause-card"][data-state="planned"]').getByRole("button", { name: /^Снять паузу, пауза с \d\d\.\d\d по \d\d\.\d\d$/ }).click();   // two cards: the name says whose pause (rule 142)
  await blind.page.waitForTimeout(700);
  assert.equal(await blind.page.locator('[data-testid="pause-act-effects"]').count(), 0);
  assert.equal(await blind.page.locator('[data-testid="pause-act-confirm"]').isDisabled(), false);
  await blind.page.close();
});
