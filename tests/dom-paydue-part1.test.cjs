// PAY-DUE, screens part 1, in a real browser (headless Chromium, the CSS of the project): the map of tones, the list «Оплаты» (cards, tabs, rows, empty tabs, a package centre, the filtered counts, the return after midnight),
// the term in the settings (owner: the example, the dry run, the save; administrator: read only), the tile of the panel, the chips of a group and of the student's card.  The server's answers are the contract of
// section 12 with the data of the layout (tests/helpers/paydue-fixture.cjs).  Layout probe on 1280 / 1024 / 375, long names.  PNGs of the frames: node tests/dom/paydue-shots.cjs.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const X = require("./helpers/paydue-fixture.cjs");

const root = path.join(__dirname, "..");
const WIDTHS = [[1280, 900], [1024, 800], [375, 812]];
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => (text ?? "").replace(/[\s  ]+/g, " ").trim();
const OWNER = { role: "owner", org_role: "owner" };
const ADMIN = { role: "admin", org_role: "admin", payments_access: true };
const isDry = (r) => /dry_run=(true|1)/.test(r.query);
const until = async (check, what) => { const end = Date.now() + 6000; while (Date.now() < end) { if (check()) return; await new Promise((r) => setTimeout(r, 50)); } assert.fail(`waited 6 s: ${what}`); };
async function probe(page, selector, label) {
  const result = await page.evaluate(layoutProbe, selector);
  assert.deepEqual(result.bad, [], `${label}: ${result.bad.join(" | ")}`);
  assert.ok(result.scroll <= 0, `${label}: the page scrolls sideways by ${result.scroll}`);
}
const server = (extra) => (request) => {
  if (extra) { const own = extra(request); if (own) return own; }
  if (request.path === "/auth/org/payments/summary") return { json: X.SUMMARY };
  if (request.path === "/auth/org/payments/status") return { json: X.statusPage(request.query) };
  if (request.path === "/auth/org/groups") return { json: [{ id: "g1", name: "Математика 7", teacher_id: "t1" }] };
  if (request.path === "/auth/org/settings/payments") return { json: isDry(request) ? { ...X.SETTINGS, dry_run: true, pay_due_impact: X.impact(4, 0) } : { ...X.SETTINGS, ...(request.body ?? {}) } };
  return null;
};
async function open(width, height, answer, mountArgs) {
  const ctx = await openPage(browser, "paydue.entry.tsx", answer, { width, height });
  await ctx.page.evaluate(([name, user, props]) => window.mount(name, user, props), mountArgs);
  return ctx;
}

test("frame 0: the map of tones - five looks, «К оплате» a calm blue, red only for «Долг»", async () => {
  const { page } = await open(1280, 400, server(), ["toneMap", OWNER, {}]);
  await page.waitForSelector('[data-testid="tone-map"]');
  const look = (id) => page.evaluate((sel) => { const s = getComputedStyle(document.querySelector(sel)); return [s.backgroundColor, s.color]; }, `[data-testid="tone-${id}"]`);
  const [debt, toPay, paid, expiring, paused] = [await look("debt"), await look("to_pay"), await look("paid"), await look("expiring"), await look("paused")];
  assert.deepEqual(toPay, ["rgb(219, 234, 254)", "rgb(30, 58, 138)"], "accent-100 / accent-900 - the layout's light blue with the dark blue text");
  assert.equal(new Set([debt, toPay, paid, expiring, paused].map((l) => l.join("|"))).size, 5, "five different looks");
  assert.equal(debt[1], "rgb(190, 18, 60)", "the debt's text is rose-700");
  for (const [name, look2] of [["to_pay", toPay], ["paid", paid], ["expiring", expiring], ["paused", paused]]) assert.notEqual(look2[1], "rgb(190, 18, 60)", `${name} is not the red of the debt`);
  await probe(page, "body", "tone map");
});

test("«Оплаты», tab «К оплате»: three cards, the sums of the server, one row per membership with the label and the term; NO notice, NO column of the price", async () => {
  for (const [width, height] of WIDTHS) {
    const { page, calls, errors } = await open(width, height, server(), ["payments", OWNER, { search: "bucket=to_pay" }]);
    await page.waitForSelector('[data-testid="pay-label"]');
    // the cards: Долг · К оплате · Аванс (a phone: ONE compact summary - two lines and the advance as a small third)
    if (width >= 640) {
      const cards = await page.locator('[data-testid="payments-position"] > div').allInnerTexts();
      assert.deepEqual(cards.map(plain), [
        "Долг 3 780 000 сум 12 учеников · срок прошёл", "К оплате 1 524 000 сум 6 учеников · ближайший срок сегодня срок 5 дней", "Аванс 148 000 сум 4 ученика",
      ]);
      // 14А.1: three cards of ONE height, the term link in the TITLE row of «К оплате» (right of the label, above the sum), no empty bottom
      const boxes = await page.evaluate(() => [...document.querySelectorAll(`[data-testid="payments-position"] > div`)].map((el) => Math.round(el.getBoundingClientRect().height)));
      assert.equal(new Set(boxes).size, 1, `the cards have one height: ${boxes}`);
      const geo = await page.evaluate(() => {
        const card = document.querySelector(`[data-testid="position-due"]`).getBoundingClientRect();
        const term = document.querySelector(`[data-testid="pay-due-term"]`).getBoundingClientRect();
        const sum = document.querySelector(`[data-testid="position-due"] p:nth-child(2)`).getBoundingClientRect();
        return { termBottom: term.bottom, sumTop: sum.top, termRight: term.right, cardRight: card.right };
      });
      assert.ok(geo.termBottom <= geo.sumTop + 2, `the term sits above the sum: ${JSON.stringify(geo)}`);
      assert.ok(geo.cardRight - geo.termRight < 40, `the term is at the right edge: ${JSON.stringify(geo)}`);
    } else {
      assert.equal(await page.locator('[data-testid="payments-position"]').isVisible(), false);
      const compactRows = (await page.locator('[data-testid="payments-position-compact"] > div').allInnerTexts()).map(plain);
      assert.deepEqual(compactRows, ["Долг 3 780 000 сум 12", "К оплате срок 5 дней 1 524 000 сум 6"]);
      assert.equal(plain(await page.locator('[data-testid="payments-position-compact"] > p').innerText()), "Аванс 148 000 сум · 4");
      // 14А.2(б): the term stands in the row of «К оплате» (not at the advance)
      assert.equal(await page.locator('[data-testid="payments-position-compact"] > div:has([data-testid="pay-due-term-compact"])').count(), 1);
      assert.match(plain(await page.locator('[data-testid="payments-position-compact"] > div:has([data-testid="pay-due-term-compact"])').innerText()), /^К оплате/);
      assert.equal(await page.locator('[data-testid="payments-position-compact"] > p [data-testid="pay-due-term-compact"]').count(), 0);
      // 14А.2(а): the three links are ONE row (one top), scrolling sideways
      const linkTops = await page.evaluate(() => [...document.querySelectorAll(`[data-testid="payments-header-links"] > a`)].map((el) => Math.round(el.getBoundingClientRect().top)));
      assert.equal(linkTops.length, 3);
      assert.equal(new Set(linkTops).size, 1, `the header links are one row: ${linkTops}`);
      // 14А.2(в): the filter button is IN the row of the search
      const rowTops = await page.evaluate(() => { const s = document.querySelector(`input[aria-label^="Поиск"]`).getBoundingClientRect(); const f = [...document.querySelectorAll("button")].find((b) => /Все ученики|Фильтр/.test(b.getAttribute("aria-label") ?? b.innerText))?.getBoundingClientRect(); return { search: Math.round(s.top), filter: f ? Math.round(f.top) : null, searchBottom: Math.round(s.bottom), filterBottom: f ? Math.round(f.bottom) : null }; });
      assert.ok(rowTops.filter !== null && rowTops.filter < rowTops.searchBottom && rowTops.filterBottom > rowTops.search, `the filter stands in the search row: ${JSON.stringify(rowTops)}`);
    }
    // the tabs: the server's students
    const tabs = (await page.locator('[role="tab"]').allInnerTexts()).map(plain);
    assert.deepEqual(tabs, ["Должники 12", "К оплате 6", "Заканчивается оплата 0", "Без долга 5"]);
    assert.equal(plain(await page.locator('[role="tab"][aria-selected="true"]').first().innerText()), "К оплате 6");
    // the rows: the label of the server, the term under it; the label stands once
    const rows = await page.locator("li").allInnerTexts();
    const kamila = plain(rows.find((t) => t.includes("Камила")));
    assert.match(kamila, /К оплате 323 000 сум до сегодня/);
    assert.match(plain(rows.find((t) => t.includes("Санжар"))), /К оплате 277 000 сум до 22\.11/);
    assert.match(plain(rows.find((t) => t.includes("Азиз"))), /К оплате 231 000 сум до 24\.11/);
    // the sum of the rows of the tab = the card (the invariant 9.1): 323 000 + 277 000 + 4 × 231 000 = 1 524 000
    const labels = (await page.locator('[data-testid="pay-label"]').allInnerTexts()).map(plain);
    const sum = labels.map((t) => Number(/К оплате ([\d ]+) сум/.exec(t)[1].replace(/\s/g, ""))).reduce((a, b) => a + b, 0);
    assert.equal(labels.length, 6);
    assert.equal(sum, 1524000);
    assert.equal(sum, X.SUMMARY.due_total);
    // a student with both sums: the second line says the debt, the term-first line stays «к оплате»
    const timur = plain(rows.find((t) => t.includes("Тимур")));
    assert.match(timur, /К оплате 231 000 сум до 24\.11 и долг 600 000 сум · просрочено 45 дней · оплачено до 30\.09/);
    // no notice above the page, no column of the price, no «Цена»
    assert.equal(await page.locator('[data-testid="payments-alert-banner"]').count(), 0);
    const body = plain(await page.locator("body").first().innerText());
    assert.ok(!/Цена в месяц|Цена пакета|Ждём оплату|Не оплачено|Ещё не платил|Скоро платить|N учеников с долгом/.test(body), body.slice(0, 300));
    assert.ok(!/ученик[а-я]* с долгом —/.test(body));
    assert.equal(await page.locator('[data-testid="payment-row-price-missing"]').count(), 0);
    // the term: the owner's link to the setting
    assert.equal(await page.locator(width >= 640 ? '[data-testid="pay-due-term"] a' : '[data-testid="pay-due-term-compact"] a').getAttribute("href"), "/owner/settings?section=payments#pay-due");
    // the cards lead to the tabs
    const suffix = width >= 640 ? "" : "-compact";
    assert.match(await page.getAttribute(`[data-testid="position-due${suffix}"]`, "href"), /bucket=to_pay#payments-list/);
    assert.match(await page.getAttribute(`[data-testid="position-debt${suffix}"]`, "href"), /bucket=debtors#payments-list/);
    // the request: the server's key of the tab
    assert.match(calls.find((c) => c.path === "/auth/org/payments/status").query, /bucket=to_pay/);
    assert.deepEqual(errors.filter((e) => !/404|Failed to load resource/.test(e)), []);
    await probe(page, "body", `to_pay ${width}`);
    if (width === 375) {
      // 14А.2: the first screen of a phone (375 × 812) holds the tabs and TWO rows of the list WHOLE (the bottom of the second card is inside the screen)
      const first = await page.evaluate(() => { const tabs = document.querySelector(`[role="tablist"]`).getBoundingClientRect(); const rows = [...document.querySelectorAll(`li`)].slice(0, 2).map((el) => el.getBoundingClientRect()); return { tabsBottom: Math.round(tabs.bottom), rows: rows.map((r) => [Math.round(r.top), Math.round(r.bottom)]) }; });
      assert.ok(first.tabsBottom <= 812 && first.rows.length === 2 && first.rows[1][1] <= 812, `tabs and two whole rows on 375 × 812: ${JSON.stringify(first)}`);
      // the card is compact: the group stands in the muted line with the class, no column of its own, no gaps (the name, the meta line, the label, the buttons)
      const card = await page.evaluate(() => { const li = document.querySelector(`li`); return { meta: li.querySelector(`[data-testid="payment-row-meta"]`)?.innerText.replace(/\s+/g, " ").trim(), groupCellShown: [...li.querySelectorAll(`[data-testid="payment-row-group"]`)].some((el) => el.offsetParent !== null), height: Math.round(li.getBoundingClientRect().height) }; });
      assert.equal(card.meta, "7 класс · Математика 7");
      assert.equal(card.groupCellShown, false);
      assert.ok(card.height <= 190, `a compact card: ${card.height} px`);
    }
    await page.close();
  }
});

test("«Оплаты», tab «Должники»: the debt leads, «просрочено K дней · оплачено до», the second sum on its own line; the age strip; «Должников нет» when empty", async () => {
  const { page } = await open(1280, 900, server(), ["payments", OWNER, { search: "bucket=debtors" }]);
  await page.waitForSelector('[data-testid="pay-label"]');
  const rows = (await page.locator("li").allInnerTexts()).map(plain);
  assert.match(rows.find((t) => t.includes("Тимур")), /Долг 600 000 сум просрочено 45 дней · оплачено до 30\.09 и к оплате 231 000 сум · до 24\.11/);
  assert.match(rows.find((t) => t.includes("Лола")), /Долг 600 000 сум просрочено 14 дней · оплачено до 31\.10/);
  assert.ok(!/и к оплате/.test(rows.find((t) => t.includes("Лола"))), "no second line for a student with one sum");
  const strip = plain(await page.locator('[data-testid="debt-ages"]').first().innerText());
  assert.match(strip, /Все 12 уч\./);
  assert.match(strip, /До 30 дней 6 уч\. · 2 100 000 сум/);
  assert.match(strip, /Старше 90 дней нет/);
  await page.close();
  const empty = await open(1280, 600, server((r) => (r.path === "/auth/org/payments/status" ? { json: { items: [], total: 0, students: 0, amount_total: 0, limit: 50, offset: 0 } } : null)), ["payments", OWNER, { search: "bucket=debtors" }]);
  await empty.page.waitForSelector("text=Должников нет");
  await empty.page.close();
  const none = await open(1280, 600, server((r) => (r.path === "/auth/org/payments/status" ? { json: { items: [], total: 0, students: 0, amount_total: 0, limit: 50, offset: 0 } } : null)), ["payments", OWNER, { search: "bucket=to_pay" }]);
  await none.page.waitForSelector("text=К оплате никого нет");
  await none.page.close();
});

test("«Оплаты», a package centre: «К оплате 100 000 сум · 2 урока» + the date, «и долг …» on a second line only for the one with both", async () => {
  const pk = (id, name, over) => X.base({ membership_id: `m-${id}`, student_id: `s-${id}`, student_name: name, period_mode: "lessons", lessons_total: 8, ...over });
  const SAID = pk("said", "Саид Назаров", { debt: 100000, due_amount: 100000, due_until: "2026-12-04", due_lessons: { used: 2 }, state: "to_pay", state_text: "К оплате 100 000 сум · 2 урока", due_text: "К оплате 100 000 сум · 2 урока", due_sub: "до 04.12" });
  const DIL = pk("dil", "Дильноза Ахмедова", { debt: 150000, debt_amount: 50000, due_amount: 100000, due_until: "2026-12-04", due_lessons: { used: 2 }, debt_lessons: 1, state: "debt", state_text: "Долг 50 000 сум · 1 урок", debt_text: "Долг 50 000 сум · 1 урок", debt_sub: "просрочено 3 дня", due_text: "К оплате 100 000 сум · 2 урока", due_sub: "до 04.12" });
  const answer = server((r) => {
    if (r.path === "/auth/org/payments/summary") return { json: { ...X.SUMMARY, period_mode: "lessons", debt_total: 50000, debtors: 1, due_total: 200000, due_students: 2, buckets: { debtors: 1, to_pay: 2, expiring: 0, active: 0, paused: 0 } } };
    if (r.path === "/auth/org/payments/status") return { json: { items: /bucket=to_pay/.test(r.query) ? [SAID, DIL] : [DIL], total: /bucket=to_pay/.test(r.query) ? 2 : 1, students: /bucket=to_pay/.test(r.query) ? 2 : 1, amount_total: 0, limit: 50, offset: 0 } };
    return null;
  });
  const to = await open(1280, 700, answer, ["payments", OWNER, { search: "bucket=to_pay" }]);
  await to.page.waitForSelector('[data-testid="pay-label"]');
  const rows = (await to.page.locator("li").allInnerTexts()).map(plain);
  assert.match(rows.find((t) => t.includes("Саид")), /К оплате 100 000 сум · 2 урока до 04\.12/);
  assert.match(rows.find((t) => t.includes("Дильноза")), /К оплате 100 000 сум · 2 урока до 04\.12 и долг 50 000 сум · 1 урок · просрочено 3 дня/);
  await to.page.close();
  const debt = await open(1280, 700, answer, ["payments", OWNER, { search: "bucket=debtors" }]);
  await debt.page.waitForSelector('[data-testid="pay-label"]');
  assert.match(plain(await debt.page.locator("li").first().innerText()), /Долг 50 000 сум · 1 урок просрочено 3 дня и к оплате 100 000 сум · 2 урока · до 04\.12/);
  await debt.page.close();
});

test("«Оплаты» narrowed to a group: each tab asks the server for ONE row with the same filter and the numbers are its `students` - nothing is counted on the screen", async () => {
  const { page, calls } = await open(1280, 700, server((r) => {
    if (r.path === "/auth/org/payments/status" && /group_id=g1/.test(r.query)) {
      const p = X.statusPage(r.query);
      return { json: { ...p, students: { debtors: 2, to_pay: 3, expiring: 1, active: 4, paused: 0 }[/bucket=([a-z_]+)/.exec(r.query)[1]] } };
    }
    return null;
  }), ["payments", OWNER, { search: "bucket=debtors&group_id=g1" }]);
  await until(() => calls.filter((c) => c.path === "/auth/org/payments/status" && /limit=1&/.test(c.query)).length >= 5, "five one-row asks");
  await page.waitForFunction(() => /Должники 2/.test(document.body.textContent));
  const tabs = (await page.locator('[role="tab"]').allInnerTexts()).map(plain);
  assert.deepEqual(tabs, ["Должники 2", "К оплате 3", "Заканчивается оплата 1", "Без долга 4"]);
  const asks = calls.filter((c) => c.path === "/auth/org/payments/status" && /limit=1&/.test(c.query));
  assert.deepEqual(asks.map((c) => /bucket=([a-z_]+)/.exec(c.query)[1]).sort(), ["active", "debtors", "expiring", "paused", "to_pay"]);
  assert.ok(asks.every((c) => /group_id=g1/.test(c.query)), "the same filter as the list");
  await page.close();
});

test("«Оплаты»: after midnight of Tashkent a return to the tab re-reads the list and the summary; the same day - nothing", async () => {
  const ctx = await openPage(browser, "paydue.entry.tsx", server(), { width: 1280, height: 700 });
  const { page, calls } = ctx;
  await page.clock.install({ time: new Date("2026-11-20T18:50:00Z") });      // 23:50 in Tashkent (UTC+5)
  await page.evaluate(([name, user, props]) => window.mount(name, user, props), ["payments", OWNER, { search: "bucket=to_pay" }]);
  await page.waitForSelector('[data-testid="pay-label"]');
  const asked = () => calls.filter((c) => c.path === "/auth/org/payments/status").length;
  const before = asked();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(300);
  assert.equal(asked(), before, "the same day: no new read");
  await page.clock.setFixedTime(new Date("2026-11-20T19:10:00Z"));            // 00:10 on 21.11 in Tashkent
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await until(() => asked() > before, "the list is read again after midnight");
  await until(() => calls.filter((c) => c.path === "/auth/org/payments/summary").length >= 2, "the summary is read again");
  await page.close();
});

const saveButton = (page) => page.getByRole("button", { name: /^Сохранить$/ });
/** The owner's settings as the SERVER answers them (the example is its sentence for the REQUESTED values: a dry run says it for the typed ones). */
const termServer = (puts, { settings = X.SETTINGS, impact = X.impact(4, 0) } = {}) => server((r) => {
  if (r.path === "/auth/org/settings/payments" && r.method === "PUT") {
    puts.push({ dry: isDry(r), body: r.body });
    const days = r.body?.pay_due_days ?? settings.pay_due_days;
    const lessons = r.body?.pay_due_lessons ?? settings.pay_due_lessons;
    return { json: isDry(r) ? { ...settings, dry_run: true, pay_due_impact: impact, pay_due_example: X.example(days, lessons) } : { ...settings, ...r.body, pay_due_example: null, updated_at: "2026-11-20T10:00:00" } };
  }
  if (r.path === "/auth/org/settings/payments" && r.method === "GET" && puts.saved) return { json: { ...settings, ...puts.saved, pay_due_example: X.example(puts.saved.pay_due_days ?? settings.pay_due_days, puts.saved.pay_due_lessons ?? settings.pay_due_lessons) } };
  if (r.path === "/auth/org/settings/payments") return { json: settings };
  return null;
});

test("settings, the term of a calendar centre (14А.3): a GREY PANEL like its neighbours, no buttons of its own, the server's example, the dry run under the field, the page's ONE «Сохранить» saves it, the message", async () => {
  for (const [width, height] of WIDTHS) {
    const puts = [];
    const { page, calls } = await open(width, height, termServer(puts), ["settings", OWNER, { moneyAvailable: true }]);
    await page.waitForSelector('[data-testid="pay-due-block"]');
    assert.equal(plain(await page.locator('[data-testid="pay-due-block"] h3').first().innerText()), "Срок оплаты");
    assert.equal(await page.inputValue("#pay-due-days"), "5");
    // the example is the SERVER's sentence (`pay_due_example.period` of the GET), not the screen's arithmetic
    assert.equal(plain(await page.locator('[data-testid="pay-due-example"]').first().innerText()), X.example(5, 2).period);
    assert.equal(await page.locator('[data-testid="pay-due-lessons"]').count(), 0, "a calendar centre has no field of lessons");
    // the look of the neighbours: the grey panel without a frame of its own (the same box as «День, с которого начинается общий месяц»)
    const look = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('[data-testid="pay-due-block"]')); return { bg: s.backgroundColor, border: s.borderTopWidth, radius: s.borderTopLeftRadius }; });
    assert.equal(look.border, "0px", "no frame of its own");
    assert.equal(look.bg, "rgb(250, 249, 247)", "the grey panel (slate-50 of the project - the same as the admin switch panel)");
    // no buttons of its own, ever: the page has ONE «Сохранить»
    assert.equal(await page.locator('[data-testid="pay-due-save"], [data-testid="pay-due-cancel"]').count(), 0);
    assert.equal(await saveButton(page).count(), 1, "one button of the section");
    // 5 → 10: the server's example for 10, the server's line under the field while the value differs; the dry run is the term part of the saved body
    await page.fill("#pay-due-days", "10");
    await page.waitForSelector('[data-testid="pay-due-impact"]');
    assert.equal(plain(await page.locator('[data-testid="pay-due-impact"]').first().innerText()), "После сохранения: 4 ученика из должников станут «К оплате»");
    assert.equal(plain(await page.locator('[data-testid="pay-due-example"]').first().innerText()), X.example(10, 2).period);
    assert.deepEqual(puts.at(-1), { dry: true, body: { pay_due_days: 10 } });
    await probe(page, '[data-testid="pay-due-block"]', `settings ${width}`);
    // back to 5: the line goes (the value equals the saved one)
    await page.fill("#pay-due-days", "5");
    await page.waitForFunction(() => !document.querySelector('[data-testid="pay-due-impact"]'));
    assert.equal(plain(await page.locator('[data-testid="pay-due-example"]').first().innerText()), X.example(5, 2).period);
    // save with the page's button: the same term in the body, the message names it, the summary is read again, the line goes, the example is the server's for the saved value (the save answers without it - it is asked again)
    await page.fill("#pay-due-days", "10");
    await page.waitForSelector('[data-testid="pay-due-impact"]');
    const summaryBefore = calls.filter((c) => c.path === "/auth/org/payments/summary").length;
    puts.saved = { pay_due_days: 10 };
    await saveButton(page).click();
    await page.waitForSelector("text=Срок оплаты — 10 дней");
    assert.deepEqual(puts.at(-1), { dry: false, body: { pay_due_days: 10 } }, "the term is the only change: the body holds nothing else");
    await until(() => calls.filter((c) => c.path === "/auth/org/payments/summary").length > summaryBefore, "the summary is read again after the save");
    await page.waitForFunction(() => !document.querySelector('[data-testid="pay-due-impact"]'));
    assert.equal(await page.inputValue("#pay-due-days"), "10");
    await page.waitForFunction((text) => document.querySelector('[data-testid="pay-due-example"]')?.textContent.trim() === text, X.example(10, 2).period);
    await page.close();
  }
});

test("settings, 10 → 5 says the other way round; a dry run with no change says nothing; a bad number is not saved (the page's own message)", async () => {
  const settings10 = { ...X.SETTINGS, pay_due_days: 10, pay_due_example: X.example(10, 2) };
  const puts = [];
  const { page } = await open(1280, 800, termServer(puts, { settings: settings10, impact: X.impact(0, 4) }), ["settings", OWNER, { moneyAvailable: true }]);
  await page.waitForSelector('[data-testid="pay-due-block"]');
  await page.fill("#pay-due-days", "5");
  await page.waitForSelector('[data-testid="pay-due-impact"]');
  assert.equal(plain(await page.locator('[data-testid="pay-due-impact"]').first().innerText()), "После сохранения: 4 ученика станут должниками");
  await page.fill("#pay-due-days", "15");
  await page.waitForSelector('[data-testid="pay-due-range"]');
  assert.equal(plain(await page.locator('[data-testid="pay-due-range"]').first().innerText()), "Срок: от 0 до 14 дней");
  assert.equal(await page.locator('[data-testid="pay-due-impact"]').count(), 0, "no dry run for a bad number");
  const putsBefore = puts.filter((p) => !p.dry).length;
  await saveButton(page).click();
  await page.waitForSelector("text=Срок оплаты: от 0 до 14 дней");
  assert.equal(puts.filter((p) => !p.dry).length, putsBefore, "a bad number is not sent");
  await page.close();
  // nothing changes name: no line
  const quiet = termServer([], { impact: X.impact(0, 0) });
  const calm = await open(1280, 800, quiet, ["settings", OWNER, { moneyAvailable: true }]);
  await calm.page.waitForSelector('[data-testid="pay-due-block"]');
  await calm.page.fill("#pay-due-days", "6");
  await calm.page.waitForFunction((text) => document.querySelector('[data-testid="pay-due-example"]')?.textContent.trim() === text, X.example(6, 2).period);
  assert.equal(await calm.page.locator('[data-testid="pay-due-impact"]').count(), 0, "at zero changes there is no line");
  await calm.page.close();
});

test("settings, a package centre: «Без оплаты можно провести [2] урока (не дольше 14 дней)» - the 14 is the server's number, the example its sentence", async () => {
  const lessons = { ...X.SETTINGS, period_mode: "lessons", billing_anchor: "payment_date" };
  const puts = [];
  const { page } = await open(1280, 800, termServer(puts, { settings: lessons }), ["settings", OWNER, { moneyAvailable: true }]);
  await page.waitForSelector('[data-testid="pay-due-lessons"]');
  assert.equal(await page.inputValue("#pay-due-lessons"), "2");
  assert.equal(await page.locator("#pay-due-days").count(), 0);
  assert.equal(plain(await page.locator('[data-testid="pay-due-example"]').first().innerText()), "Третий неоплаченный урок или 15-й день после урока — уже долг");
  assert.match(plain(await page.locator('[data-testid="pay-due-block"]').first().innerText()), /Без оплаты можно провести урока \(не дольше 14 дней\)/);
  await page.fill("#pay-due-lessons", "3");
  await page.waitForFunction(() => /^Четвёртый неоплаченный урок/.test(document.querySelector('[data-testid="pay-due-example"]').textContent.trim()));
  assert.deepEqual(puts.at(-1), { dry: true, body: { pay_due_lessons: 3 } });
  // the server did not say the number of days: the hint is not there (151)
  await page.close();
  const silent = await open(1280, 800, (r) => (r.path === "/auth/org/payments/summary" ? { json: { ...X.SUMMARY, pay_due_package_max_days: undefined } } : termServer([], { settings: lessons })(r)), ["settings", OWNER, { moneyAvailable: true }]);
  await silent.page.waitForSelector('[data-testid="pay-due-lessons"]');
  await silent.page.waitForTimeout(300);
  assert.equal(await silent.page.locator('[data-testid="pay-due-hint"]').count(), 0);
  await silent.page.close();
});

test("settings, an administrator with the right to money: the term is a line of text («Срок оплаты: 5 дней. Меняет владелец»), no field, no request to the owner's settings", async () => {
  const { page, calls } = await open(1280, 800, server(), ["adminSettings", ADMIN, { moneyAvailable: true }]);
  await page.waitForSelector('[data-testid="pay-due-readonly"]');
  assert.equal(plain(await page.locator('[data-testid="pay-due-readonly"]').first().innerText()), "Срок оплаты: 5 дней. Меняет владелец");
  assert.equal(await page.locator("#pay-due-days").count(), 0);
  assert.equal(calls.filter((c) => c.path === "/auth/org/settings/payments").length, 0, "the owner's settings are not asked (403 for an administrator)");
  await page.close();
  // without the right to money: nothing (and no number to show)
  const none = await open(1280, 800, () => ({ status: 403, json: { detail: "no" } }), ["adminSettings", { role: "admin", org_role: "admin", payments_access: false }, { moneyAvailable: false }]);
  await none.page.waitForTimeout(500);
  assert.equal(await none.page.locator('[data-testid="pay-due-readonly"]').count(), 0);
  await none.page.close();
  // the administrator's list: the term is text, not a link
  const list = await open(1280, 700, server(), ["paymentsAdmin", ADMIN, { search: "bucket=to_pay", moneyAvailable: true }]);
  await list.page.waitForSelector('[data-testid="pay-due-term"]');
  assert.equal(await list.page.locator('[data-testid="pay-due-term"] a').count(), 0);
  assert.equal(plain(await list.page.locator('[data-testid="pay-due-term"]').first().innerText()), "срок 5 дней");
  await list.page.close();
});

test("the panel: ONE tile of the money with two rows («Долг N · K учеников», «К оплате N · K учеников»), no notice, no second tile of the debt", async () => {
  for (const [width, height] of WIDTHS) {
    const answer = server((r) => {
      if (r.path === "/auth/org/stats") return { json: { total_students: 30, total_groups: 3, total_members: 5, active_diagnostics: 0, completed_diagnostics: 0, new_students: 1 } };
      if (r.path === "/auth/org/groups-overview") return { json: { groups: [], avg_theta: null } };
      return null;
    });
    const { page } = await open(width, height, answer, ["dashboard", OWNER, { moneyAvailable: true }]);
    await page.waitForSelector('[data-testid="dashboard-tile-money"]', { timeout: 8000 });
    const rows = (await page.locator('[data-testid="dashboard-tile-money"] a').allInnerTexts()).map(plain);
    assert.deepEqual(rows, ["3 780 000 сум Долг · 12 учеников →", "1 524 000 сум К оплате · 6 учеников →"]);
    assert.equal(await page.getAttribute('[data-testid="dashboard-tile-debt"]', "href"), "/owner/payments?bucket=debtors");
    assert.equal(await page.getAttribute('[data-testid="dashboard-tile-due"]', "href"), "/owner/payments?bucket=to_pay");
    assert.equal(await page.locator('[data-testid="payments-alert-banner"]').count(), 0);
    const red = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="dashboard-tile-debt"] p')).color);
    const calm = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="dashboard-tile-due"] p')).color);
    assert.notEqual(red, calm, "the debt is red, the sum within its term is not");
    await page.waitForTimeout(900);      // the blocks of the panel slide in: the probe is taken after they settle
    await probe(page, '[data-testid="dashboard-tiles"]', `dashboard ${width}`);
    await page.close();
  }
});

test("a group: the header says «Долг N · K учеников» and «К оплате N · K учеников» from `students` / `amount_total`; the tab shows ONE label per student", async () => {
  const GROUP = { id: "g1", name: "Математика 7", status: "active", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", max_students: 30, student_count: 4, students: [], price_current: { amount: 600000 }, lesson_type: "group", schedule: [] };
  const answer = server((r) => {
    if (r.path === "/auth/org/groups/g1") return { json: GROUP };
    if (r.path === "/auth/org/payments/status" && /group_id=g1/.test(r.query)) {
      const bucket = /bucket=([a-z_]+)/.exec(r.query)[1];
      const all = [X.ANVAR, X.LOLA, X.MADINA, X.TIMUR];
      if (bucket === "debtors") return { json: { items: [X.LOLA, X.TIMUR].slice(0, Number(/limit=(\d+)/.exec(r.query)[1])), total: 2, students: 2, amount_total: 1200000, limit: 1, offset: 0, as_of: "2026-11-20" } };
      if (bucket === "to_pay") return { json: { items: [X.ANVAR, X.TIMUR].slice(0, Number(/limit=(\d+)/.exec(r.query)[1])), total: 2, students: 2, amount_total: 462000, limit: 1, offset: 0, as_of: "2026-11-20" } };
      return { json: { items: all, total: 4, students: 4, amount_total: 0, limit: 500, offset: 0, as_of: "2026-11-20" } };
    }
    return null;
  });
  const { page, calls } = await open(1280, 900, answer, ["group", OWNER, { moneyAvailable: true, search: "" }]);
  await page.waitForSelector('[data-testid="group-due-chip"]', { timeout: 8000 });
  assert.equal(plain(await page.locator('[data-testid="group-debt-chip"]').first().innerText()), "Долг 1 200 000 сум · 2 ученика");
  assert.equal(plain(await page.locator('[data-testid="group-due-chip"]').first().innerText()), "К оплате 462 000 сум · 2 ученика");
  assert.match(await page.getAttribute('[data-testid="group-debt-chip"]', "href"), /tab=payments&filter=debt/);
  assert.match(await page.getAttribute('[data-testid="group-due-chip"]', "href"), /tab=payments&filter=due/);
  const header = calls.filter((c) => c.path === "/auth/org/payments/status" && /limit=1&/.test(c.query));
  assert.ok(header.length >= 2 && header.every((c) => /group_id=g1/.test(c.query)), "one row asked for each part");
  assert.equal(plain(await page.locator('[data-testid="group-due-chip"] span').first().innerText()), "К оплате 462 000 сум · 2 ученика");
  const tone = (sel) => page.evaluate((s) => { const el = document.querySelector(s + " span"); const c = getComputedStyle(el); return [c.backgroundColor, c.color]; }, sel);
  assert.deepEqual(await tone('[data-testid="group-due-chip"]'), ["rgb(219, 234, 254)", "rgb(30, 58, 138)"]);
  assert.notDeepEqual(await tone('[data-testid="group-debt-chip"]'), await tone('[data-testid="group-due-chip"]'));
  await probe(page, "body", "group header");
  await page.close();
});

test("the student's card: ONE label next to the name - the worst state of his groups, the server's words", async () => {
  const PROFILE = {
    student: { id: "st1", org_id: "o", first_name: "Анвар", last_name: "Каримов", full_name: "Анвар Каримов", class_level: 7, group_id: "g1", display_id: "AL-1", student_phone: null, comment: null, status: "active", created_at: "2026-11-20T08:00:00" },
    group: { id: "g1", name: "Математика 7", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К." },
    groups: [{ group_id: "g1", group_name: "Математика 7", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", is_primary: true, joined_at: "2026-11-20" }],
    group_history: [], diagnostics: [], exams: [],
  };
  const answer = server((r) => {
    if (r.path === "/auth/org/students/st1/profile") return { json: PROFILE };
    if (r.path === "/auth/org/students/st1/memberships") return { json: [X.ANVAR] };
    return null;
  });
  const { page } = await open(1280, 800, answer, ["student", OWNER, { moneyAvailable: true }]);
  await page.waitForSelector('[data-testid="student-money-chip"]', { timeout: 8000 });
  assert.equal(plain(await page.locator('[data-testid="student-money-chip"]').first().innerText()), "К оплате 231 000 сум");
  assert.equal(plain(await page.locator('[data-testid="student-money-sub"]').first().innerText()), "до 24.11");
  const look = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('[data-testid="student-money-chip"] span')); return [c.backgroundColor, c.color]; });
  assert.deepEqual(look, ["rgb(219, 234, 254)", "rgb(30, 58, 138)"]);
  await probe(page, "h1", "student card");
  await page.close();
});

test("the menu badge reads the server's `debtors` (12), the summary is kept fresh by the shell and not by a notice", async () => {
  const { page, calls } = await open(1280, 800, server(), ["sidebar", OWNER, {}]);
  await page.waitForSelector('a[href="/owner/payments"]');
  await until(() => calls.some((c) => c.path === "/auth/org/payments/summary"), "the shell asks for the summary");
  await page.waitForFunction(() => /12/.test(document.querySelector('a[href="/owner/payments"]').textContent));
  const badge = plain(await page.locator('a[href="/owner/payments"]').first().innerText());
  assert.match(badge, /Оплаты/);
  assert.match(badge, /\b12\b/);
  await page.close();
});
