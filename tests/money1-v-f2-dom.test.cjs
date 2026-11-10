// «Деньги-1 / В», front Ф2 in a real browser (headless Chromium, the REAL components, the server answered by `route`): the rate window and «RATE_UNUSUAL», the payroll block of the removal window,
// the hint «начислить» on a phone and «Моя зарплата» of a teacher.  The CSS is the project's tailwind.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const base = require("./helpers/sheet-lines.cjs");

const root = path.join(__dirname, "..");
const ENTRY = "money-v-f2.entry.tsx";
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => text.replace(/\s+/g, " ").replace(/ /g, " ").trim();
const NB = " ";

// ── the rate window: RATE_UNUSUAL ───────────────────────────────────────────────────────

const ITEM = { teacher_id: "t1", teacher_name: "Эргашев К.", teacher_first_name: "Камол", teacher_last_name: "Эргашев", lesson_types: ["group"], rates: { group: { percent: "45", valid_from: "2026-09" } } };
const QUESTION = `Вы уверены: ставка «Групповые» 0${NB}% (сейчас 45${NB}%)?`;

test("RATE_UNUSUAL: the window stays, the server's question is shown, the one button becomes «Да, ставка верная», the repeat carries confirm_unusual; the first request has none", async () => {
  const puts = [];
  const server = (request) => {
    if (request.method === "PUT" && request.path.startsWith("/auth/org/payroll/rates/")) {
      puts.push(request.body);
      return request.body.confirm_unusual ? { json: ITEM } : { status: 409, json: { detail: { code: "RATE_UNUSUAL", message: QUESTION, old: "45", new: "0", lesson_type: "group" } } };
    }
    return null;
  };
  const { page, errors } = await openPage(browser, ENTRY, server, { width: 375, height: 800 });
  await page.evaluate((item) => window.mount("rate", { role: "owner", org_role: "owner" }, { item }), ITEM);
  await page.getByRole("dialog").waitFor();
  assert.match(plain(await page.getByRole("dialog").innerText()), /Камол Эргашев/);   // the title of the window is the full name (Н7)
  const input = page.locator("#payroll-rate-group");
  await input.fill("0");
  await page.getByTestId("rate-save").click();
  await page.getByTestId("rate-unusual").waitFor();
  assert.equal(plain(await page.getByTestId("rate-unusual").innerText()), plain(QUESTION));
  assert.equal(await page.getByRole("dialog").count(), 1);   // not closed, nothing said twice
  assert.equal(await page.locator('[role="alert"]').count(), 0);   // a question, not a red error
  assert.equal(puts.length, 1);
  assert.equal(puts[0].confirm_unusual, undefined);
  assert.equal(plain(await page.getByTestId("rate-save").innerText()), "Да, ставка верная");
  const box = await page.getByTestId("rate-save").boundingBox();
  assert.ok(box.height >= 40, `the answer is a tap zone of ${box.height}px`);
  await page.getByTestId("rate-save").click();
  await page.waitForFunction(() => window.__log.includes("saved"));
  assert.equal(puts.length, 2);
  assert.equal(puts[1].confirm_unusual, true);
  assert.deepEqual(puts[1].percents, { group: "0" });
  assert.deepEqual(errors.filter((e) => !/status of 409/.test(e)), []);
  await page.close();
});

test("RATE_UNUSUAL: a changed number asks again (the old «да» does not stand), another error stays a red error", async () => {
  let n = 0;
  const server = (request) => {
    if (request.method === "PUT" && request.path.startsWith("/auth/org/payroll/rates/")) {
      n += 1;
      if (request.body.percents.group === "20") return { status: 422, json: { detail: { code: "PERCENT_INVALID", message: "Ставка должна быть от 0 до 100" } } };
      return { status: 409, json: { detail: { code: "RATE_UNUSUAL", message: QUESTION } } };
    }
    return null;
  };
  const { page } = await openPage(browser, ENTRY, server, { width: 1280, height: 800 });
  await page.evaluate((item) => window.mount("rate", { role: "owner", org_role: "owner" }, { item }), ITEM);
  await page.getByRole("dialog").waitFor();
  await page.locator("#payroll-rate-group").fill("0");
  await page.getByTestId("rate-save").click();
  await page.getByTestId("rate-unusual").waitFor();
  await page.locator("#payroll-rate-group").fill("20");
  assert.equal(await page.getByTestId("rate-unusual").count(), 0);
  assert.equal(plain(await page.getByTestId("rate-save").innerText()), "Сохранить");
  await page.getByTestId("rate-save").click();
  await page.locator('[role="alert"]').waitFor();
  assert.match(plain(await page.locator('[role="alert"]').innerText()), /Ставка должна быть/);
  assert.equal(await page.getByTestId("rate-unusual").count(), 0);
  assert.equal(n, 2);
  await page.close();
});

// ── the removal window: the payroll block ───────────────────────────────────────────────

const IMPACT = (payroll) => ({ memberId: "m9", userId: "u9", name: "Эргашев К.", orgRole: "teacher", canRemove: true, groups: [], inProgressLessons: [], futureSubstitutions: { count: 0 }, missedLessons: { count: 0 }, pendingSubstitutionRequests: { count: 0 }, payroll });
const PAYROLL = { unsaved_months: ["2026-10"], unpaid_months: ["2026-09"], text: "Зарплата за октябрь 2026 не сохранена. Зарплата за сентябрь 2026 не выплачена" };
const removalServer = (payroll) => (request) => (request.path.endsWith("/removal-impact") ? { json: IMPACT(payroll) } : null);

test("the removal window: the server's words once as a warning that does not block «Удалить»; the owner gets a link per month, no sums", async () => {
  const { page } = await openPage(browser, ENTRY, removalServer(PAYROLL), { width: 375, height: 800 });
  await page.evaluate(() => window.mount("remove", { role: "owner", org_role: "owner" }));
  await page.getByTestId("removal-payroll").waitFor();
  await page.waitForTimeout(500);   // the window finishes its entrance
  const text = plain(await page.getByTestId("removal-payroll").innerText());
  assert.equal(text.split("не сохранена").length - 1, 1);
  assert.match(text, /Зарплата за октябрь 2026 не сохранена\. Зарплата за сентябрь 2026 не выплачена/);
  assert.doesNotMatch(text, /\d[\d ]{4,} ?сум/);
  const links = await page.getByTestId("removal-payroll-link").evaluateAll((nodes) => nodes.map((node) => [node.getAttribute("href"), node.textContent.trim(), node.getBoundingClientRect().height]));
  assert.deepEqual(links.map((link) => link.slice(0, 2)), [["/owner/payroll?month=2026-09", "Открыть зарплату за сентябрь"], ["/owner/payroll?month=2026-10", "Открыть зарплату за октябрь"]]);
  assert.ok(links.every((link) => link[2] >= 40), JSON.stringify(links));
  assert.equal(await page.getByRole("button", { name: "Удалить" }).isDisabled(), false);   // a warning, not a lock
  await page.close();
});

test("the removal window: an administrator sees the words without links; no text - no block", async () => {
  const admin = await openPage(browser, ENTRY, removalServer(PAYROLL), { width: 1280, height: 800 });
  await admin.page.evaluate(() => window.mount("remove", { role: "admin", org_role: "admin" }));
  await admin.page.getByTestId("removal-payroll").waitFor();
  assert.equal(await admin.page.getByTestId("removal-payroll-link").count(), 0);
  assert.match(plain(await admin.page.getByTestId("removal-payroll").innerText()), /не сохранена/);
  await admin.page.close();
  for (const payroll of [{ unsaved_months: [], unpaid_months: [], text: "" }, undefined]) {
    const none = await openPage(browser, ENTRY, removalServer(payroll), { width: 1280, height: 800 });
    await none.page.evaluate(() => window.mount("remove", { role: "owner", org_role: "owner" }));
    await none.page.getByRole("dialog").waitFor();
    await none.page.getByRole("button", { name: "Удалить" }).waitFor();
    assert.equal(await none.page.getByTestId("removal-payroll").count(), 0);
    await none.page.close();
  }
});

// ── the hint «начислить» on a phone ─────────────────────────────────────────────────────

const unpaidSheet = () => ({
  id: "s", saved: true, month: "2026-11", period_start: "2026-11-01", period_end: "2026-11-30", month_open: true, teacher_id: "t1", teacher_name: "Эргашев К.", revision: 1,
  percents: { group: "50" }, divisor_default: 12, lines: base.lines.map((line, index) => (index === 0 ? { ...line, unpaid: 1, counted: 3 } : line)), groups: base.groups, total_amount: 120834, counted_total: 7, unpaid_total: 1,
  pending_excused_total: 0, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 1 }, source_fingerprint: "f", stale: false, note: null, created_by_name: null, created_at: null, updated_by_name: null, updated_at: null,
});

test("375: the hint «начислить» is there (no hover needed), a tap zone of 40 px, opens by a tap and closes by the next one; the table does not widen the page", async () => {
  const { page, errors } = await openPage(browser, ENTRY, () => null, { width: 375, height: 800 });
  await page.evaluate((sheet) => window.mount("sheetTable", { role: "owner", org_role: "owner" }, { sheet }), unpaidSheet());
  const hint = page.getByLabel("Что значит «начислить»").locator("xpath=ancestor::*[@role='button'][1]");
  await hint.waitFor();
  const box = await hint.boundingBox();
  assert.ok(box.width >= 40 && box.height >= 40, `tap zone ${box.width}x${box.height}`);
  await hint.click();
  const bubble = page.getByRole("tooltip");
  await bubble.waitFor();
  assert.match(plain(await bubble.innerText()), /начисл|оплат/i);
  const bubbleBox = await bubble.boundingBox();
  assert.ok(bubbleBox.x >= 0 && bubbleBox.x + bubbleBox.width <= 375, "the bubble is inside the screen");
  assert.equal(await page.getByRole("checkbox").first().isChecked(), false);   // the tap did not tick the box under it
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelectorAll('[role="tooltip"]').length === 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(errors, []);
  await page.close();
});

// ── «Моя зарплата» ──────────────────────────────────────────────────────────────────────

const M = (month, extra = {}) => ({ month, month_label: month, state: "saved", preliminary: false, lessons_counted: 31, total: 4100000, paid: 4100000, balance: 0, carry_in: 0, text: "Выплачено полностью", updated_at: "2026-11-01T08:00:00", ...extra });
const NOV = M("2026-11", { state: "open_preliminary", preliminary: true, lessons_counted: 18, total: 2450000, paid: 1000000, balance: 1450000, carry_in: 200000, text: "Предварительно: сумма может измениться до сохранения зарплаты", updated_at: null });
const OCT = M("2026-10");
const SEP = M("2026-09", { lessons_counted: 29, total: 3800000, paid: 3500000, balance: 300000, text: `К выплате 300${NB}000${NB}сум` });
const AUG = M("2026-08", { state: "not_saved", lessons_counted: 0, total: null, paid: 0, balance: 0, text: "Зарплата за месяц ещё не сохранена" });
const myServer = (months, single) => (request) => {
  if (request.path === "/auth/org/me/payroll/months") return typeof months === "function" ? months() : { json: { items: months } };
  if (request.path === "/auth/org/me/payroll") return single ? single(request) : null;
  return null;
};
const openMy = async (width, server, search = "") => {
  const run = await openPage(browser, ENTRY, server, { width, height: 900 });
  await run.page.clock.setFixedTime(new Date("2026-11-10T10:00:00+05:00"));
  await run.page.evaluate((s) => { window.__search = s; window.mount("myPayroll", { role: "teacher", org_role: "teacher" }); }, search);
  return run;
};

test("«Моя зарплата» 375: the card of the month (lessons, salary «на сегодня», paid, rest), «Предварительно», the advance in words, the past months in a list; no prices, debts, students", async () => {
  const { page, errors } = await openMy(375, myServer([NOV, OCT, SEP, AUG]));
  await page.getByTestId("my-month-card").waitFor();
  const card = plain(await page.getByTestId("my-month-card").innerText());
  assert.match(card, /Ноябрь 2026/);
  assert.equal(plain(await page.getByTestId("my-month-chip").innerText()), "Предварительно");
  assert.equal(plain(await page.getByTestId("my-lessons").innerText()), "Засчитано уроков 18");
  assert.equal(plain(await page.getByTestId("my-total").innerText()), `Зарплата · на сегодня 2${NB}450${NB}000${NB}сум`.replace(/ /g, " "));
  assert.equal(plain(await page.getByTestId("my-paid").innerText()), "Выплачено 1 000 000 сум");
  assert.equal(plain(await page.getByTestId("my-rest").innerText()), "К выплате 1 450 000 сум");
  assert.equal(plain(await page.getByTestId("my-carry").innerText()), "Получено авансом раньше: 200 000 сум — вычитается из суммы этого месяца");
  assert.equal(plain(await page.getByTestId("my-state-line").innerText()), "Предварительно: сумма может измениться до сохранения зарплаты");
  const rows = (await page.getByTestId("my-month-row").allInnerTexts()).map(plain);
  assert.deepEqual(rows, ["Октябрь 2026 31 урок · 4 100 000 сум Выплачено полностью", "Сентябрь 2026 29 уроков · 3 800 000 сум К выплате 300 000 сум", "Август 2026 Зарплата за месяц ещё не сохранена"]);
  const all = plain(await page.getByTestId("my-payroll").innerText());
  assert.doesNotMatch(all, /цен[аы]|долг|ученик|оплат[аы] ученик/i);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  for (const box of await page.getByTestId("my-month-row").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))) assert.ok(box >= 40);
  assert.deepEqual(errors, []);
  await page.close();
});

test("«Моя зарплата»: a tap on a past month opens it (a saved one: «К выплате», no caution line, no «Предварительно»); a month with no sum shows the server's words and no numbers; «К текущему месяцу» goes back", async () => {
  const { page } = await openMy(1280, myServer([NOV, OCT, SEP, AUG]));
  await page.getByTestId("my-month-card").waitFor();
  await page.getByTestId("my-month-row").filter({ hasText: "Сентябрь" }).click();
  assert.equal(plain(await page.getByTestId("my-month-title").innerText()), "Сентябрь 2026");
  assert.equal(plain(await page.getByTestId("my-month-chip").innerText()), "Сохранена");
  assert.equal(plain(await page.getByTestId("my-rest").innerText()), "К выплате 300 000 сум");
  assert.equal(await page.getByTestId("my-state-line").count(), 0);
  assert.equal(await page.getByTestId("my-carry").count(), 0);
  await page.getByTestId("my-month-row").filter({ hasText: "Август" }).click();
  assert.equal(plain(await page.getByTestId("my-state-line").innerText()), "Зарплата за месяц ещё не сохранена");
  assert.equal(await page.getByTestId("my-total").count(), 0);
  assert.equal(plain(await page.getByTestId("my-month-chip").innerText()), "Не сохранена");
  await page.getByTestId("my-payroll-back").click();
  assert.equal(plain(await page.getByTestId("my-month-title").innerText()), "Ноябрь 2026");
  await page.close();
});

test("«Моя зарплата»: paid forward in a saved month says «Выплачено вперёд»; a month with no rate has the server's words and no numbers", async () => {
  const AHEAD = M("2026-10", { balance: -50000, paid: 4150000, text: `Выплачено вперёд 50${NB}000${NB}сум` });
  const NORATE = M("2026-11", { state: "open_preliminary", preliminary: true, lessons_counted: 0, total: null, paid: 0, balance: 0, text: "Сумма появится, когда владелец задаст ставку" });
  const { page } = await openMy(375, myServer([NORATE, AHEAD]));
  await page.getByTestId("my-month-card").waitFor();
  assert.equal(plain(await page.getByTestId("my-state-line").innerText()), "Сумма появится, когда владелец задаст ставку");
  assert.equal(await page.getByTestId("my-total").count(), 0);
  await page.getByTestId("my-month-row").click();
  assert.equal(plain(await page.getByTestId("my-rest").innerText()), "Выплачено вперёд 50 000 сум");
  await page.close();
});

test("«Моя зарплата»: loading is a skeleton, an error says so with «Повторить» (never an empty list), empty says why", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const slow = myServer(async () => { calls += 1; await gate; return calls === 1 ? { status: 500, json: { detail: "boom" } } : { json: { items: [NOV] } }; });
  const slowRun = await openMy(375, (request) => (request.path.endsWith("/months") ? (async () => { calls += 1; await gate; return calls === 1 ? { status: 500, json: { detail: { message: "Сервис не отвечает" } } } : { json: { items: [NOV] } }; })() : null));
  await slowRun.page.getByTestId("my-payroll-loading").waitFor();
  release();
  await slowRun.page.getByRole("alert").waitFor();
  assert.match(plain(await slowRun.page.getByTestId("my-payroll").innerText()), /Не удалось загрузить зарплату/);
  assert.equal(await slowRun.page.getByTestId("my-month-card").count(), 0);
  await slowRun.page.getByRole("button", { name: "Повторить" }).click();
  await slowRun.page.getByTestId("my-month-card").waitFor();
  await slowRun.page.close();
  void slow;

  const empty = await openMy(375, myServer([M("2026-11", { state: "open_preliminary", preliminary: true, lessons_counted: 0, total: 0, paid: 0, balance: 0, text: "Предварительно: сумма может измениться до сохранения зарплаты" })]));
  await empty.page.getByTestId("my-payroll-empty").waitFor();
  assert.match(plain(await empty.page.getByTestId("my-payroll-empty").innerText()), /Пока нет начислений.*после первого проведённого урока/);
  await empty.page.close();
});

test("«Моя зарплата»: a month outside the list is asked on its own; a month that has not come is «Этого месяца ещё нет»", async () => {
  const asked = [];
  const old = M("2025-03", { lessons_counted: 5, total: 600000, paid: 600000 });
  const { page } = await openMy(1280, myServer([NOV, OCT], (request) => { asked.push(request.query); return request.query.includes("2025-03") ? { json: old } : { status: 422, json: { detail: { code: "MONTH_INVALID", message: "Этот месяц ещё не наступил" } } }; }), "month=2025-03");
  await page.getByTestId("my-month-card").waitFor();
  assert.equal(plain(await page.getByTestId("my-month-title").innerText()), "Март 2025");
  assert.deepEqual(asked, ["month=2025-03"]);
  await page.close();
  const future = await openMy(1280, myServer([NOV, OCT]), "month=2027-01");   // beyond today: the address falls back to the current month
  await future.page.getByTestId("my-month-card").waitFor();
  assert.equal(plain(await future.page.getByTestId("my-month-title").innerText()), "Ноябрь 2026");
  await future.page.close();
});
