// PAY-TAILS, screens part 1, in a real browser (headless Chromium, the CSS of the project): the tab «Аванс» (Б2.1), the action of a row by its state (Б2.2), the band of the closed memberships in a group (Б2.3),
// the right of the administrator (Б2.7), the phone (Б2.8).  The server's answers are the CONTRACT of Б1.1 / Б1.2 (tests/helpers/paytails-fixture.cjs, the only stub).  PNGs: node tests/dom/paytails-part1-shots.cjs.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { touchTargets } = require("./helpers/layout-probe.cjs");
const X = require("./helpers/paytails-fixture.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => (text ?? "").replace(/[\s  ]+/g, " ").trim();
const OWNER = { role: "owner", org_role: "owner" };
const OPENINGS = { accounting_start: "2026-09-01", state: "pending", can_set_opening: true, totals: { left_available: 0, memberships: 40, missing: 38, needs_review: 0 } };
const server = (extra, over = {}) => (request) => {
  if (extra) { const own = extra(request); if (own) return own; }
  if (request.path === "/auth/org/payments/summary") return { json: over.summary ?? X.SUMMARY };
  if (request.path === "/auth/org/payments/status") return { json: over.status ? over.status(request.query) : X.statusOf(request.query) };
  if (request.path === "/auth/org/groups") return { json: [{ id: "g1", name: "Математика 7", teacher_id: "t1" }] };
  if (request.path === "/auth/org/members") return { json: [] };
  if (request.path === "/auth/org/opening-balances/summary") return { json: over.openings ?? { ...OPENINGS, state: "done", totals: { ...OPENINGS.totals, missing: 0 } } };
  return null;
};
async function open(width, height, answer, mountArgs) {
  const ctx = await openPage(browser, "paydue.entry.tsx", answer, { width, height });
  await ctx.page.evaluate(([name, user, props]) => window.mount(name, user, props), mountArgs);
  return ctx;
}
const payments = (search) => ["payments", OWNER, { moneyAvailable: true, search }];
const listLoaded = (page) => page.waitForSelector('[data-testid="payments-table"], [data-testid="payments-phone-list"], [data-testid="advance-empty"]', { timeout: 8000 });

// ── Б2.1: the tab «Аванс» ──────────────────────────────────────────────────────────────────────

test("Б2.1 (frame 1): the tabs stand «Должники · К оплате · Заканчивается оплата · Без долга · Аванс»; the card «Аванс» leads to its tab and says the server's sub-line", async () => {
  const { page } = await open(1280, 900, server(), payments("bucket=debtors"));
  await page.waitForSelector('[data-testid="position-advance"]');
  const tabs = await page.$$eval('[role="tab"]', (els) => els.map((el) => el.textContent.trim().replace(/\s+/g, " ")));
  assert.deepEqual(tabs, ["Должники 12", "К оплате 6", "Заканчивается оплата 0", "Без долга 5", "Аванс 5"]);
  assert.equal(plain(await page.innerText('[data-testid="position-advance"]')), "Аванс 748 000 сум 5 учеников · из них 4 ушли");
  assert.match(await page.getAttribute('[data-testid="position-advance"]', "href"), /^\/owner\/payments\?bucket=advance#payments-list$|\?bucket=advance#payments-list$/);
  await page.close();
});

test("Б2.1 (frame 2b): the tab «Аванс» - ушедшие first (the server's order), the server's words in the label, «Вернуть» in the row of a closed membership, «Внести оплату» + «⋯» in the row of an open one", async () => {
  const { page, calls } = await open(1280, 900, server(), payments("bucket=advance"));
  await listLoaded(page);
  assert.equal(plain(await page.innerText('[role="tab"][aria-selected="true"]')), "Аванс 5");
  const rows = await page.$$eval('[data-testid="payments-table"] li.dt-li, [data-testid="payments-table"] li.dt-row', (els) => els.map((li) => li.innerText.replace(/[\s\u00A0\u202F]+/g, " ").trim()));
  assert.equal(rows.length, 5);
  assert.match(rows[0], new RegExp(`^Яхё Саидов ${X.YAHYO.display_id} · 4 класс Математика 4 .*Аванс 37 000 сум ушёл 28\\.10 Вернуть аванс`));
  assert.match(rows[4], new RegExp(`^Анвар Каримов ${X.ANVAR_ADV.display_id} · .* Аванс 600 000 сум оплачено до 31\\.12$`));
  const status = await page.$$eval('[data-testid="payments-table"] li', (els) => els.map((li) => ({ pay: [...li.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean), menu: Boolean(li.querySelector('button[aria-label^="Действия:"]')) })));
  const rowsOnly = status.filter((s) => s.pay.length || s.menu);
  assert.deepEqual(rowsOnly.slice(0, 4).map((s) => s.pay), [["Вернуть аванс"], ["Вернуть аванс"], ["Вернуть аванс"], ["Вернуть аванс"]]);
  assert.deepEqual(rowsOnly.slice(0, 4).map((s) => s.menu), [false, false, false, false], "a closed row with an advance has no «⋯» (nothing to put in it)");
  assert.deepEqual(rowsOnly[4].pay, [], "an open student who paid ahead: NO «Внести оплату» in the row (frame 1)");
  assert.equal(await page.locator('[data-testid="payments-table"] li:has(button[aria-label="Действия: Анвар Каримов"]) a[data-testid="payment-row-statement"]').count(), 1, "…the statement icon stays");
  assert.equal(rowsOnly[4].menu, true, "an open row with an advance keeps «⋯»");
  await page.click('button[aria-label="Действия: Анвар Каримов"]');
  assert.ok(await page.getByRole("menuitem", { name: "Вернуть аванс" }).count() === 1, "…and «Вернуть аванс» stays in it");
  assert.ok(await page.getByRole("menuitem", { name: "Внести оплату" }).count() === 1, "…and «Внести оплату» moves into it");
  await page.keyboard.press("Escape");
  const asked = calls.filter((c) => c.path === "/auth/org/payments/status" && /bucket=advance/.test(c.query) && /limit=50/.test(c.query));
  assert.ok(asked.length >= 1 && asked.every((c) => !/left_only/.test(c.query)), "«Все» asks without the filter");
  await page.close();
});

test("Б2.1: «Все 5 · Ушедшие 4» - the numbers are the server's; «Ушедшие» asks `left_only=true` and shows the closed ones only; the choice is in the address", async () => {
  const { page, calls } = await open(1280, 900, server(), payments("bucket=advance"));
  await listLoaded(page);
  const toggle = page.getByTestId("advance-left-toggle");
  assert.equal(plain(await toggle.innerText()), "Все 5 Ушедшие 4");
  await page.getByRole("radio", { name: /^Ушедшие/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="payments-table"] li button').length === 4);
  assert.ok(calls.some((c) => /bucket=advance/.test(c.query) && /left_only=true/.test(c.query)));
  const buttons = await page.$$eval('[data-testid="payments-table"] li button', (els) => els.map((b) => b.textContent.trim()));
  assert.deepEqual(buttons, ["Вернуть аванс", "Вернуть аванс", "Вернуть аванс", "Вернуть аванс"]);   // Б11.22 п.7: not «Вернуть» (it reads as «back into the group»)
  assert.equal(plain(await toggle.innerText()), "Все 5 Ушедшие 4", "the numbers do not move with the filter");
  await page.getByRole("radio", { name: /^Все/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="payments-table"] li button').length >= 5);
  await page.close();
});

test("Б2.1: nobody of the advance has left - no toggle (the server says 0); nobody has an advance - «Авансов нет» and the sentence of the layout", async () => {
  const noLeft = { ...X.SUMMARY, advance_left_students: 0 };
  const { page } = await open(1280, 900, server(null, { summary: noLeft, status: (q) => X.statusOf(q, { advance: [X.ANVAR_ADV] }) }), payments("bucket=advance"));
  await listLoaded(page);
  assert.equal(await page.getByTestId("advance-left-toggle").count(), 0);
  await page.close();
  const empty = await open(1280, 900, server(null, { summary: X.SUMMARY_NOBODY, status: (q) => X.statusOf(q, { advance: [] }) }), payments("bucket=advance"));
  await empty.page.waitForSelector('[data-testid="advance-empty"]', { timeout: 8000 });
  assert.equal(plain(await empty.page.innerText('[data-testid="advance-empty"]')), "Авансов нет Никто не оплатил вперёд и возвращать некому");
  assert.equal(await empty.page.getByTestId("advance-left-toggle").count(), 0);
  assert.equal(plain(await empty.page.innerText('[data-testid="position-advance"]')).replace(/\s+/g, " "), "Аванс 0 сум");
  await empty.page.close();
});

test("Б2.2: «Вернуть» of a closed row opens THE window of the refund (the same one as «Вернуть аванс» of the menu); a closed row with a debt has «Внести оплату», not «Вернуть»", async () => {
  const { page } = await open(1280, 900, server(null, { status: (q) => (/bucket=debtors/.test(q) ? X.page([X.FERUZA], { students: 1 }) : X.statusOf(q)) }), payments("bucket=advance"));
  await listLoaded(page);
  await page.getByRole("button", { name: "Вернуть" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Вернуть деньги" });
  await dialog.waitFor({ timeout: 5000 });
  assert.match(plain(await dialog.innerText()), /37 000/);
  await page.keyboard.press("Escape");
  await page.close();
  const debt = await open(1280, 900, server(null, { status: (q) => (/bucket=debtors/.test(q) ? X.page([X.FERUZA], { students: 1 }) : X.statusOf(q)) }), payments("bucket=debtors"));
  await listLoaded(debt.page);
  const text = plain(await debt.page.innerText('[data-testid="payments-table"] li'));
  assert.match(text, /Долг 415 000 сум ушёл 20\.11 · просрочено 14 дней Внести оплату/);
  assert.equal(await debt.page.getByRole("button", { name: "Вернуть", exact: true }).count(), 0);
  await debt.page.close();
});

// ── Б2.3: the band of the closed memberships in a group ──────────────────────────────────────────────

const groupServer = () => server((r) => {
  if (r.path === "/auth/org/groups/g1") return { json: { id: "g1", name: "Математика 7", status: "active", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", max_students: 30, student_count: 3, students: [], price_current: { amount: 600000 }, lesson_type: "group", schedule: [] } };
  if (r.path === "/auth/org/payments/status" && /group_id=g1/.test(r.query)) return { json: X.groupStatus(r.query) };
  return null;
});

test("Б2.3 (frame 4): the group's «Оплаты» - the open ones first, the band «Ушли из группы — расчёт не закрыт 3» FOLDED; open: debt «Внести оплату», «к оплате» «Внести оплату», an advance «Вернуть»; no label of the advance in the header", async () => {
  const { page, calls } = await open(1280, 900, groupServer(), ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }]);
  await page.waitForSelector('[data-testid="payments-left-toggle"]', { timeout: 9000 });
  assert.equal(plain(await page.innerText('[data-testid="payments-left-toggle"]')), "Ушли из группы — расчёт не закрыт 3 показать");
  assert.equal(await page.getAttribute('[data-testid="payments-left-toggle"]', "aria-expanded"), "false");
  assert.equal(await page.getByTestId("group-payment-left-row").count(), 0, "folded: no closed row on the screen");
  assert.equal(await page.getByTestId("group-payment-row").count(), 3);
  await page.click('[data-testid="payments-left-toggle"]');
  assert.equal(await page.getByTestId("group-payment-left-row").count(), 3);
  const left = await page.$$eval('[data-testid="group-payment-left-row"]', (els) => els.map((el) => el.innerText.replace(/[\s  ]+/g, " ").trim()));
  assert.match(left[0], /^Феруза Орипова.*Долг 415 000 сум ушёл 20\.11 · просрочено 14 дней.*Внести оплату.*Выписка/);
  assert.match(left[1], /^Дилшод Эрматов.*К оплате 92 000 сум ушёл 20\.11 · до 22\.11.*Внести оплату.*Выписка/);
  assert.match(left[2], /^Камола Эшонова.*Аванс 85 000 сум ушёл 20\.11.*Вернуть.*Выписка/);
  assert.doesNotMatch(left[2], /Внести оплату/);
  assert.doesNotMatch(left[0], /Вернуть/);
  const header = plain(await page.locator("body").innerText());
  assert.ok(!/Аванс\s+[\d\s]+сум\s*·\s*\d+\s+учени/.test(header.split("Состав")[0] ?? ""), "the header of the group has no label of the advance");
  const asked = calls.filter((c) => c.path === "/auth/org/payments/status" && /group_id=g1/.test(c.query)).map((c) => /bucket=([a-z_]+)/.exec(c.query)[1]);
  assert.ok(asked.includes("all") && asked.includes("left_open"), "the group asks the open ones (`all`) and the closed with a settlement (`left_open`)");
  assert.ok(!asked.includes("advance"), "no request for the advance of the closed ones any more (`left_open` carries every settlement); `debtors` / `to_pay` are the one-row counts of the header chips");
  assert.ok(calls.filter((c) => /bucket=(debtors|to_pay)/.test(c.query) && /group_id=g1/.test(c.query)).every((c) => /limit=1&/.test(c.query)), "the band is not made out of lists of debtors / to_pay");
  assert.equal(asked.filter((bucket) => bucket === "left_open").length, 1, "the band is ONE request, its number is `left_count`");
  await page.close();
});

test("Б2.3: a group without closed memberships with a settlement has no band", async () => {
  const none = server((r) => {
    if (r.path === "/auth/org/groups/g1") return { json: { id: "g1", name: "Математика 7", status: "active", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", max_students: 30, student_count: 1, students: [], price_current: { amount: 600000 }, lesson_type: "group", schedule: [] } };
    if (r.path === "/auth/org/payments/status" && /group_id=g1/.test(r.query)) return { json: X.page(/bucket=all/.test(r.query) ? [X.MADINA] : [], { total: /bucket=all/.test(r.query) ? 1 : 0 }) };
    return null;
  });
  const { page } = await open(1280, 900, none, ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }]);
  await page.waitForSelector('[data-testid="group-payment-row"]', { timeout: 9000 });
  assert.equal(await page.getByTestId("payments-left").count(), 0);
  await page.close();
});

// ── Б2.8: the phone ───────────────────────────────────────────────────────────────────────────────────

/** Every element whose content is wider than its box (not an ellipsis, not a scroller that says so) and every box that leaves the screen. */
const overflow = () => {
  const vw = window.innerWidth;
  const bad = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest(".sr-only, [data-allow-hscroll]")) continue;
    const s = getComputedStyle(el);
    if (s.display === "inline" || s.display === "contents" || s.display === "none" || el.closest("svg")) continue;
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== "ellipsis") bad.push(`${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? ""}] ${el.scrollWidth}>${el.clientWidth}`);
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.left < -1 || r.right > vw + 1) && !el.closest('[data-testid="payments-header-links"]')) bad.push(`${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? ""}] outside ${Math.round(r.left)}..${Math.round(r.right)}`);
  }
  return { bad: [...new Set(bad)], page: document.documentElement.scrollWidth - vw };
};
const NAV = 64; // the bottom menu of a phone (`h-16`)
const BUSY = { summary: { ...X.SUMMARY, price_missing: 5 }, openings: OPENINGS };
const ROWS5 = [X.TIMUR, X.LOLA, X.base({ ...X.LOLA, membership_id: "m-a", student_id: "s-a", student_name: "Рустам Назаров", group_name: "Физика 7" }), X.base({ ...X.LOLA, membership_id: "m-b", student_id: "s-b", student_name: "Мехрибон Алиева" }), X.base({ ...X.LOLA, membership_id: "m-c", student_id: "s-c", student_name: "Дилноза Каримова" })];
/** How many rows of the phone list are whole over the bottom menu (the page is at its top). */
const wholeRows = (page, height) => page.evaluate((limit) => {
  const rows = [...document.querySelectorAll('[data-testid="payments-phone-list"] > li')];
  return { n: rows.filter((li) => { const r = li.getBoundingClientRect(); return r.top >= 0 && r.bottom <= limit; }).length, heights: rows.map((li) => Math.round(li.getBoundingClientRect().height)), top: Math.round(rows[0].getBoundingClientRect().top) };
}, height - NAV);
const phoneServer = (rows, over = {}) => server(null, { ...BUSY, ...over, status: (q) => (/bucket=debtors/.test(q) ? X.page(rows, { total: 12, students: 12, amount_total: 3780000 }) : X.statusOf(q)) });

test("Б2.8 (frames 20-21): 375×812 with EVERY conditional block at once (the label of the prices, the label of the openings, «Давность», the tabs): at least THREE whole rows over the bottom menu; 375×667 - at least one (Б11.22 п.8: the second line WRAPS, a row is up to ~102 px instead of 84)", async () => {
  for (const [height, min] of [[812, 3], [667, 1]]) {
    const { page } = await open(375, height, phoneServer(ROWS5), payments("bucket=debtors"));   // BUSY: the openings are pending, 38 missing
    await page.waitForSelector('[data-testid="payments-phone-list"] li', { timeout: 8000 });
    await page.waitForSelector('[data-testid="payments-price-label"]');
    await page.waitForSelector('[data-testid="openings-header-label"]');
    await page.waitForSelector('[data-testid="debt-age-open"]');
    assert.equal(await page.getByTestId("openings-banner").count(), 0, "a phone: no banner above the list");
    assert.equal(plain(await page.innerText('[data-testid="openings-header-label"]')), "· 38 не заполнено");
    assert.match(await page.getAttribute('[data-testid="openings-header-link"]', "href"), /\/payments\/openings$/);
    const fit = await wholeRows(page, height);
    assert.ok(fit.n >= min, `375×${height}: ${fit.n} whole rows over the menu (need ${min}); row heights ${fit.heights}, the first row starts at ${fit.top}`);
    await page.close();
  }
});

test("Б2.8: from 640 px the banner of the openings stays above the list; the label of the link is a phone's", async () => {
  const { page } = await open(1280, 900, phoneServer(ROWS5), payments("bucket=debtors"));
  await page.waitForSelector('[data-testid="openings-banner"]', { timeout: 8000 });
  assert.equal(await page.getByTestId("openings-header-label").isVisible(), false);
  await page.close();
});

test("the tab «Аванс» has no line «У N учеников не задана цена» (the other tabs keep it)", async () => {
  const { page } = await open(1280, 900, server(null, { summary: { ...X.SUMMARY, price_missing: 5 } }), payments("bucket=advance"));
  await listLoaded(page);
  await page.waitForSelector('[data-testid="position-advance"]');
  assert.equal(await page.getByTestId("payments-price-missing").count(), 0);
  await page.close();
  const other = await open(1280, 900, server(null, { summary: { ...X.SUMMARY, price_missing: 5 } }), payments("bucket=active"));
  await other.page.waitForSelector('[data-testid="payments-price-missing"]', { timeout: 8000 });
  await other.page.close();
});

test("the phone summary says «Аванс 748 000 сум · 5 уч.»", async () => {
  const { page } = await open(375, 812, server(), payments("bucket=debtors"));
  await page.waitForSelector('[data-testid="position-advance-compact"]');
  assert.equal(plain(await page.innerText('[data-testid="position-advance-compact"]')), "Аванс 748 000 сум · 5 уч.");
  await page.close();
});

test("the group's tab from 640: «Внести оплату» is ONE look - the outline - for a debtor and for a paid one alike, as in «Оплатах» (Б11.22 п.11; it was blue for the debtor); «Вернуть аванс» too", async () => {
  const { page } = await open(1280, 900, groupServer(), ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }]);
  await page.waitForSelector('[data-testid="group-payment-row"]', { timeout: 9000 });
  await page.click('[data-testid="payments-left-toggle"]');
  const kinds = await page.$$eval('[data-testid="group-payment-row"], [data-testid="group-payment-left-row"]', (els) => els.map((li) => { const b = [...li.querySelectorAll("button")].find((x) => /Внести оплату|Вернуть/.test(x.textContent)); return [li.innerText.split("\n")[0].trim(), b.dataset.variant]; }));
  assert.deepEqual(Object.fromEntries(kinds), { "Анвар Каримов": "secondary", "Лола Юсупова": "secondary", "Мадина Турсунова": "secondary", "Феруза Орипова": "secondary", "Дилшод Эрматов": "secondary", "Камола Эшонова": "secondary" });
  await page.close();
});

test("Б2.8: the compact row - name and label on line 1 (the label does not shrink), «group · sub» and a 40 px button on line 2, a third small line only for the second sum; the row is ≤ 110 px (its second line wraps, Б11.22 п.8)", async () => {
  const { page } = await open(375, 812, phoneServer([X.TIMUR, X.LOLA, X.base({ ...X.LOLA, membership_id: "m-z", student_id: "s-z", student_name: X.LONG_NAME, group_name: X.LONG_GROUP })]), payments("bucket=debtors"));
  await page.waitForSelector('[data-testid="payments-phone-list"] li');
  const rows = await page.$$eval('[data-testid="payments-phone-list"] > li', (els) => els.map((li) => ({
    h: Math.round(li.getBoundingClientRect().height), name: li.querySelector('[data-testid="money-row-name"]').textContent.trim(), label: li.querySelector('[data-testid="pay-label"]')?.textContent.trim().replace(/\s+/g, " "),
    line: li.querySelector('[data-testid="money-row-line"]').textContent.trim(), second: li.querySelector('[data-testid="pay-second"]')?.textContent.trim() ?? null,
    button: [...li.querySelectorAll("button")].map((b) => ({ t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height) })),
    menu: Boolean(li.querySelector('button[aria-label^="Действия"]')),
  })));
  const timur = rows[0], lola = rows[1];
  assert.equal(timur.name, "Тимур Рашидов");
  assert.equal(timur.label, "Долг 600 000 сум");
  assert.equal(timur.line, "просрочено 45 дней · оплачено до 30.09 · Математика 7", "the state first, only the group is cut");
  assert.match(timur.second.replace(/[\u00A0\u202F]/g, " "), /^и к оплате 231 000 сум/);
  assert.equal(lola.second, null, "no third line without a second sum");
  assert.ok(lola.h <= 110, `an ordinary row is ${lola.h} px (Б11.22 п.8: the state line wraps to two lines instead of «…»; it was ≤ 84 with the cut)`);
  for (const row of rows) { assert.deepEqual(row.button.map((b) => b.t), ["Внести"]); assert.ok(row.button[0].h >= 40, "the button is 40 px"); assert.equal(row.menu, false, "no «⋯» in a compact row"); }
  assert.deepEqual(await page.evaluate(touchTargets, '[data-testid="payments-phone-list"]'), [], "every tap target is 40 px");
  await page.close();
});

test("Б2.8: a press on the row opens the statement; the button does not (stopPropagation) and fires ONCE on Enter / Space; the closed row with an advance has «Вернуть»", async () => {
  const { page } = await open(375, 812, phoneServer([X.LOLA]), payments("bucket=debtors"));
  await page.waitForSelector('[data-testid="payments-phone-list"] li');
  assert.match(await page.getAttribute('[data-testid="money-row-statement"]', "href"), /\/statement\/m-lola$/);
  assert.equal(await page.getAttribute('[data-testid="money-row-statement"]', "aria-label"), "Выписка: Лола Юсупова");
  await page.evaluate(() => { window.__nav = 0; document.addEventListener("click", (e) => { if (e.target.closest('[data-testid="money-row-statement"]')) window.__nav += 1; }, true); });
  const button = page.getByRole("button", { name: "Внести оплату: Лола Юсупова" });
  await button.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor({ timeout: 5000 });
  assert.equal(await page.getByRole("dialog").count(), 1, "Enter opened ONE window");
  assert.equal(await page.evaluate(() => window.__nav), 0, "the press on the button did not open the statement");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await button.focus();
  await page.keyboard.press("Space");
  await page.getByRole("dialog").waitFor({ timeout: 5000 });
  assert.equal(await page.getByRole("dialog").count(), 1, "Space opened ONE window");
  assert.equal(await page.evaluate(() => window.__nav), 0, "…and not the statement");
  await page.keyboard.press("Escape");
  await page.close();
  const adv = await open(375, 812, server(), payments("bucket=advance"));
  await adv.page.waitForSelector('[data-testid="payments-phone-list"] li');
  const first = await adv.page.$eval('[data-testid="payments-phone-list"] > li', (li) => ({ t: li.innerText.replace(/\s+/g, " ").trim(), b: li.querySelector("button").textContent.trim() }));
  assert.equal(first.b, "Вернуть аванс");
  assert.match(first.t, /^Яхё Саидов Аванс 37 000 сум ушёл 28\.10 · Математика 4 Вернуть аванс$/);
  await adv.page.close();
});

test("Б2.8 (frames 20-22): the warning of the prices is a label «Цены групп · 5 без цены» of the link; the age of the debt is the button «Давность: все» in the row of the search, the choice is a bottom sheet (empty variants are not offered, a swipe down and the backdrop close it)", async () => {
  const baskets = X.SUMMARY.debt_ages;
  const { page } = await open(375, 812, phoneServer([X.LOLA], { summary: { ...X.SUMMARY, price_missing: 5, debt_ages: baskets } }), payments("bucket=debtors"));
  await page.waitForSelector('[data-testid="payments-phone-list"] li');
  assert.equal(plain(await page.innerText('[data-testid="payments-price-label"]')), "· 5 без цены");
  assert.equal(await page.getByTestId("payments-price-missing").isVisible(), false, "no line of its own over the list");
  assert.equal(await page.getByTestId("debt-ages").count(), 0, "no strip of chips");
  assert.equal(plain(await page.innerText('[data-testid="debt-age-open"]')), "Давность: все");
  const box = (sel) => page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; });
  const [btnTop] = await box('[data-testid="debt-age-open"]');
  const [searchTop] = await box('input[aria-label="Поиск по имени или ID ученика"]');
  assert.ok(Math.abs(btnTop - searchTop) <= 8, "the button is in the row of the search");
  await page.click('[data-testid="debt-age-open"]');
  await page.getByTestId("debt-age-sheet").waitFor();
  const options = await page.$$eval('[data-testid="debt-age-sheet"] label', (els) => els.map((el) => el.innerText.replace(/\s+/g, " ").trim()));
  assert.deepEqual(options, ["Все 12 уч.", "До 30 дней 6 уч. · 2 100 000 сум", "31–60 дней 4 уч. · 1 380 000 сум", "61–90 дней 2 уч. · 300 000 сум"], "«Старше 90 дней» (nobody) is not offered");
  // the backdrop closes it (a dialog ignores the first moments after it opens)
  await page.waitForTimeout(500);
  await page.mouse.click(180, 100);
  await page.waitForFunction(() => !document.querySelector('[data-testid="debt-age-sheet"]'));
  // a swipe down on the header closes it
  await page.click('[data-testid="debt-age-open"]');
  await page.getByTestId("debt-age-sheet").waitFor();
  await page.waitForTimeout(400);
  const head = await page.$eval('[role="dialog"] [data-modal-part="header"]', (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left + 60), Math.round(r.top + r.height / 2)]; });
  await page.mouse.move(head[0], head[1]);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(head[0], head[1] + i * 20);
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector('[data-testid="debt-age-sheet"]'), null, { timeout: 4000 });
  // a choice sets the filter and the label of the button
  await page.click('[data-testid="debt-age-open"]');
  await page.getByTestId("debt-age-option-31_60").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="debt-age-open"]')?.textContent.includes("31–60 дней".toLowerCase()));
  assert.equal(plain(await page.innerText('[data-testid="debt-age-open"]')), "Давность: 31–60 дней");
  await page.close();
});

test("Б2.8: the active tab is in view in the row of the tabs of a phone (the link to «Аванс» opens scrolled to it); an empty anchor of the list adds no gap", async () => {
  const { page } = await open(375, 812, server(), payments("bucket=advance"));
  await page.waitForSelector('[data-testid="payments-phone-list"] li');
  await page.waitForTimeout(200);
  const inView = await page.$eval('[role="tab"][aria-selected="true"]', (tab) => { const scroller = tab.closest(".scroll-hint"); const t = tab.getBoundingClientRect(), s = scroller.getBoundingClientRect(); return t.left >= s.left - 1 && t.right <= s.right + 1; });
  assert.equal(inView, true);
  const gap = await page.evaluate(() => { const anchor = document.getElementById("payments-list"); const next = anchor.nextElementSibling; return [Math.round(anchor.getBoundingClientRect().height), Math.round(next.getBoundingClientRect().top - anchor.getBoundingClientRect().bottom)]; });
  assert.equal(gap[0], 0, "the anchor has no height");
  assert.ok(gap[1] <= 20, `the gap under the anchor is ${gap[1]} px`);
  await page.close();
});

test("Б2.8 (LESSONS 155): long name, long group, eight-digit sums - nothing leaves its box and the page has no sideways scroll at 1440 / 1280 / 1024 / 768 / 375, in «Оплаты» and in the group", async () => {
  const rows = [X.longRow("l1"), X.longRow("l2", { student_name: "Ли", group_name: "Г" }), X.longRow("l3", { unpaid: 99999999, debt: 99999999, debt_amount: 99999999, state_text: `Долг ${X.money(99999999)}`, debt_text: `Долг ${X.money(99999999)}` })];
  for (const [width, height] of [[1440, 900], [1280, 900], [1024, 800], [768, 900], [375, 812]]) {
    const { page } = await open(width, height, phoneServer(rows), payments("bucket=debtors"));
    await page.waitForSelector('[data-testid="payments-table"], [data-testid="payments-phone-list"]', { timeout: 8000 });
    await page.waitForTimeout(250);
    const result = await page.evaluate(overflow);
    assert.deepEqual(result.bad, [], `«Оплаты» ${width}: ${result.bad.join(" | ")}`);
    assert.ok(result.page <= 0, `«Оплаты» ${width}: the page scrolls sideways by ${result.page}`);
    if (width === 375) {
      const geo = await page.$$eval('[data-testid="payments-phone-list"] > li', (els) => els.map((li) => { const row = li.getBoundingClientRect(); const label = li.querySelector('[data-testid="pay-label"]').getBoundingClientRect(); const btn = li.querySelector("button").getBoundingClientRect(); return { label: label.right <= row.right && label.left >= row.left, whole: Math.round(label.width) >= 100, btn: btn.right <= row.right && btn.left >= row.left, w: Math.round(btn.width) }; }));
      for (const g of geo) assert.deepEqual([g.label, g.btn], [true, true], "the label and the button stay inside the row");
      assert.ok(geo.every((g) => g.whole), "the label of the sum does not shrink");
    }
    await page.close();
  }
  const groupRows = (query) => X.groupStatus(query);
  for (const [width, height] of [[1440, 900], [1024, 800], [375, 812]]) {
    const longGroup = server((r) => {
      if (r.path === "/auth/org/groups/g1") return { json: { id: "g1", name: X.LONG_GROUP, status: "active", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", max_students: 30, student_count: 3, students: [], price_current: { amount: 600000 }, lesson_type: "group", schedule: [] } };
      if (r.path === "/auth/org/payments/status" && /group_id=g1/.test(r.query)) return { json: /bucket=all/.test(r.query) ? X.page([X.longRow("g1"), X.longRow("g2", { student_name: "Ли" })]) : /bucket=debtors/.test(r.query) ? X.page([X.longRow("g1"), X.FERUZA]) : groupRows(r.query) };
      return null;
    });
    const { page } = await open(width, height, longGroup, ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }]);
    await page.waitForSelector('[data-testid="group-payment-row"]', { timeout: 9000 });
    await page.click('[data-testid="payments-left-toggle"]').catch(() => undefined);
    await page.waitForTimeout(300);
    const result = await page.evaluate(overflow);
    assert.deepEqual(result.bad, [], `the group ${width}: ${result.bad.join(" | ")}`);
    assert.ok(result.page <= 0, `the group ${width}: the page scrolls sideways by ${result.page}`);
    await page.close();
  }
});

test("Б2.8 (frame 23б): the group on a phone - the same compact row, «Внести» for the open ones, the band is a card, the closed rows below it: «Внести» / «Вернуть»; no «⋯»", async () => {
  const { page } = await open(375, 812, groupServer(), ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }]);
  await page.waitForSelector('[data-testid="group-payment-row"]', { timeout: 9000 });
  const open1 = await page.$$eval('[data-testid="group-payment-row"]', (els) => els.map((li) => ({ t: li.innerText.replace(/\s+/g, " ").trim(), b: [...li.querySelectorAll("button")].map((b) => b.textContent.trim()), h: Math.round(li.getBoundingClientRect().height) })));
  assert.ok(open1.length === 3 && open1.every((r) => r.b.length === 1 && r.b[0] === "Внести"), JSON.stringify(open1));
  assert.ok(open1.every((r) => r.h <= 84), `heights ${open1.map((r) => r.h)}`);
  await page.click('[data-testid="payments-left-toggle"]');
  const closed = await page.$$eval('[data-testid="group-payment-left-row"]', (els) => els.map((li) => ({ t: li.innerText.replace(/\s+/g, " ").trim(), b: [...li.querySelectorAll("button")].map((b) => b.textContent.trim()) })));
  assert.deepEqual(closed.map((r) => r.b), [["Внести"], ["Внести"], ["Вернуть аванс"]]);
  assert.match(closed[0].t, /^Феруза Орипова Долг 415 000 сум ушёл 20\.11 · просрочено 14 дней Внести$/);
  assert.equal(await page.locator('[data-testid="group-payment-left-row"] button[aria-label^="Действия"]').count(), 0);
  await page.close();
});

// ── Б2.7: the right of the administrator ───────────────────────────────────────────────────────────────

test("Б2.7: the settings of the owner - «Администратор работает с деньгами» and the hint of the layout; the switch is named by it", async () => {
  const answer = (r) => {
    if (r.path === "/auth/org/settings/payments") return { json: { ...X.SETTINGS, ...(r.body ?? {}) } };
    if (r.path === "/auth/org/payments/summary") return { json: X.SUMMARY };
    if (r.path === "/auth/org/opening-balances/summary") return { json: { ...OPENINGS, state: "done" } };
    return null;
  };
  const { page } = await open(1280, 900, answer, ["settings", OWNER, { moneyAvailable: true }]);
  const toggle = page.getByRole("switch", { name: "Администратор работает с деньгами" });
  await toggle.waitFor({ timeout: 8000 });
  const hint = plain(await page.locator("#payments-admin-label + p").innerText());
  assert.equal(hint, "Принимает оплаты, исправляет и отменяет их, прощает суммы, возвращает деньги, меняет цены групп и остатки на начало. Зарплата остаётся скрытой.");
  assert.equal(await toggle.getAttribute("aria-checked"), "false", "the right itself is unchanged");
  await page.close();
});

// ── the ID of a student (owner's remark 21.11): under the name from 640 px everywhere, none in the compact row of a phone, the search finds it ──

test("the ID under the name: the tab «Аванс» and the band «Ушли из группы — расчёт не закрыт» (from 640 px) like the other tabs; the group's search finds by ID", async () => {
  const idOf = (rowOf) => rowOf.display_id;
  const advance = await open(1280, 900, server(), payments("bucket=advance"));
  await listLoaded(advance.page);
  const cells = await advance.page.$$eval('[data-testid="payments-table"] li.dt-li, [data-testid="payments-table"] li.dt-row', (els) => els.map((li) => (li.querySelector(".dt-wide-only")?.textContent ?? "").replace(/\s+/g, " ").trim()));
  assert.deepEqual(cells, X.ADVANCE_ALL.map((row) => `${idOf(row)} · ${row.class_level} класс`), "every row of «Аванс»: «AL-… · N класс» under the name");
  await advance.page.close();

  const group = await open(1280, 900, groupServer(), ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }]);
  await group.page.waitForSelector('[data-testid="payments-left-toggle"]', { timeout: 9000 });
  await group.page.click('[data-testid="payments-left-toggle"]');
  const under = await group.page.$$eval('[data-testid="group-payment-row"], [data-testid="group-payment-left-row"]', (els) => els.map((li) => [li.querySelector("a")?.textContent.trim(), li.querySelector("a + p")?.textContent.trim()]));
  assert.equal(under.length, 6);
  for (const [name, id] of under) assert.match(id ?? "", /^AL-\d{3}$/, `${name}: the ID stands under the name`);
  await group.page.close();
});

test("the ID on a phone: no ID in the compact row; the search of the list takes the ID (the server finds the student by it)", async () => {
  const asked = [];
  const answer = server((request) => {
    if (request.path !== "/auth/org/payments/status" || /bucket=advance/.test(request.query)) return null;
    asked.push(request.query);
    const q = new URLSearchParams(request.query).get("search");
    const all = X.statusPage(request.query).items.map(X.withId);
    return { json: X.page(q ? all.filter((row) => row.display_id.toLowerCase().includes(q.toLowerCase())) : all) };
  });
  const { page } = await open(375, 812, answer, payments("bucket=debtors"));
  await page.waitForSelector('[data-testid="payments-phone-list"] li', { timeout: 8000 });
  const before = await page.$$eval('[data-testid="payments-phone-list"] > li', (els) => els.map((li) => li.innerText));
  assert.ok(before.length >= 2 && before.every((text) => !/AL-\d{3}/.test(text)), "the compact row of a phone has no ID");
  const target = X.statusPage("bucket=debtors").items.map(X.withId)[0];
  await page.getByLabel("Поиск по имени или ID ученика").fill(target.display_id);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="payments-phone-list"] > li').length === 1, null, { timeout: 5000 });
  assert.ok(asked.some((query) => new URLSearchParams(query).get("search") === target.display_id), "the ID went to the server as the search");
  assert.match(await page.innerText('[data-testid="payments-phone-list"] > li'), new RegExp(target.student_name.split(" ")[0]));
  await page.close();
});
