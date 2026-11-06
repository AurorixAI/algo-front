// «Деньги-1 / Б» in a real browser (headless Chromium, the CSS of the project): the window of a price and of the mode show every student «было → станет», «Оплата с» exists only with the money right,
// «Ждём оплату» is apart from «Должники» and the red banner, the group form has a price only for the money right.  Layout probe on 1280 / 1024 / 375; PNGs in artifacts/analysis/money1_b_screens/.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const X = require("./helpers/money-b-fixture.cjs");

const root = path.join(__dirname, "..");
const SHOTS = path.join(root, "..", "artifacts", "analysis", "money1_b_screens");
const WIDTHS = [[1280, 900], [1024, 800], [375, 812]];
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  fs.mkdirSync(SHOTS, { recursive: true });
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => (text ?? "").replace(/[\s ]+/g, " ").trim();
const OWNER = { role: "owner", org_role: "owner" };
const ADMIN_NO_MONEY = { role: "admin", org_role: "admin", payments_access: false };
const ADMIN_MONEY = { role: "admin", org_role: "admin", payments_access: true };
const isDry = (r) => /dry_run=(true|1)/.test(r.query);

async function probe(page, selector, label) {
  const result = await page.evaluate(layoutProbe, selector);
  assert.deepEqual(result.bad, [], `${label}: ${result.bad.join(" | ")}`);
  assert.ok(result.scroll <= 0, `${label}: the page scrolls sideways by ${result.scroll}`);
}
async function atAllWidths(entry, answer, run, shotName) {
  for (const [width, height] of WIDTHS) {
    const ctx = await openPage(browser, entry, answer, { width, height });
    await run(ctx, width);
    if (shotName) await ctx.page.screenshot({ path: path.join(SHOTS, `${shotName}-${width}.png`) });
    await ctx.page.close();
  }
}

const priceServer = (request) => {
  if (request.method === "PUT" && request.path === "/auth/org/groups/g1/price" && isDry(request)) return { json: { dry_run: true, impact: X.PRICE_IMPACT, current: null, history: null } };
  return null;
};

test("Б3: the price window - EVERY affected student «было → станет» in lessons, dates and the next period; individual prices apart; no overflow on 1280 / 1024 / 375", async () => {
  await atAllWidths("money-b.entry.tsx", priceServer, async ({ page, errors }, width) => {
    await page.evaluate(() => window.mount("priceDialog", { role: "owner", org_role: "owner" }, {}));
    await page.fill("#group-price-amount", "700 000");
    await page.waitForSelector('[data-testid="price-impact-money-students"]');
    const names = await page.locator('[data-testid="whatif-student"] > p span:first-child').allTextContents();
    assert.deepEqual(names.map(plain), ["Каримова Алия", "Назаров Тимур", "Юлдашев Рустам"]);
    const text = plain(await page.textContent('[data-testid="price-impact-money-students"]'));
    assert.match(text, /Оплачено уроков.*12.*10.*−2 урока/);
    assert.match(text, /Оплачено до.*04\.12\.2026.*29\.11\.2026.*−5 дней/);
    assert.match(text, /Следующий период с 05\.12\.2026.*300 000 сум.*400 000 сум.*\+100 000 сум/);
    assert.equal(plain(await page.textContent('[data-testid="price-impact-money-summary"]')), "Изменится у 3 учеников");
    const whole = plain(await page.textContent('[role="dialog"]'));
    assert.equal((whole.match(/индивидуальн/gi) ?? []).length, 1, "the individual price is said ONCE (its title), not three times");
    assert.ok(!/аванс уменьшится на 50 000/.test(whole), "the sentence of the server is not repeated over its own table");
    // no inner scroll: the list is as tall as its rows, only the body of the window scrolls
    assert.equal(await page.evaluate(() => { const ul = document.querySelector('[data-testid="price-impact-money-students"] ul'); return ul.scrollHeight - ul.clientHeight; }), 0);
    assert.match(plain(await page.textContent('[data-testid="price-impact-money-overrides"]')), /Индивидуальная цена — не меняется.*Юсупов Бек · 250 000 сум · цена группы 600 000 сум → 700 000 сум/);
    assert.match(plain(await page.textContent('[data-testid="price-impact-money-totals"]')), /Оплаченных уроков станет меньше\s*на 2.*Следующий период дороже в сумме, 1 ученик\s*\+100 000 сум/);
    assert.equal(plain(await page.textContent('[data-testid="price-impact-money-asof"]')), "Числа — на 01.12.2026, когда цена дойдёт до учеников");
    // the numbers go to the right edge on a wide screen (DESIGN decision 1)
    if (width >= 640) {
      const alignOf = (sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).textAlign, sel);
      assert.equal(await alignOf('[data-testid="whatif-row"] [data-col="after"]'), "right");
      assert.equal(await alignOf('[data-testid="whatif-row"] [data-col="delta"]'), "right");
    }
    assert.equal(await page.locator('[data-testid="group-price-save"]').isDisabled(), false);
    await probe(page, '[role="dialog"]', `price ${width}`);
    assert.deepEqual(errors.filter((e) => !/404|Failed to load/.test(e)), []);
  }, "01-price-window");
});

test("Б3: the window of the mode - per student with the charge of 30 days, a package in progress, the confirm waits for the answer and names the action", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const server = async (request) => {
    if (request.method === "PUT" && request.path === "/auth/org/settings/payments" && isDry(request)) { await gate; return { json: { dry_run: true, regime_impact: X.REGIME_IMPACT, period_mode: "calendar" } }; }
    return null;
  };
  const { page } = await openPage(browser, "money-b.entry.tsx", server, { width: 1280, height: 900 });
  await page.evaluate(() => window.mount("regime", { role: "owner", org_role: "owner" }, { changes: { billing_day: 10 } }));
  await page.waitForSelector('[data-testid="regime-skeleton"]');
  assert.equal(await page.locator('[data-testid="regime-confirm"]').isDisabled(), true, "the button waits for the answer");
  assert.equal(plain(await page.textContent('[role="dialog"] h2')), "Изменить день общего месяца?");
  release();
  await page.waitForSelector('[data-testid="regime-whatif-students"]');
  assert.equal(await page.locator('[data-testid="regime-confirm"]').isDisabled(), false);
  assert.equal(plain(await page.textContent('[data-testid="regime-confirm"]')), "Изменить день");
  const text = plain(await page.textContent('[data-testid="regime-whatif-students"]'));
  assert.match(text, /Каримова Алия.*с 01\.11\.2026, на 30\.11\.2026.*Начислено за 30 дней.*900 000 сум.*1 176 000 сум.*\+276 000 сум/);
  assert.match(text, /Пакетов Закир.*когда закончится пакет.*Цена 600 000 сум: за пакет из 12 уроков → за общий месяц/);
  assert.ok(!/Долг/.test(text), "the debt equal to the charge of 30 days is not said twice");
  assert.match(text, /≈ за урок.*50 000 сум.*23 077 сум/);
  assert.equal((plain(await page.textContent('[role="dialog"]')).match(/Что изменится/g) ?? []).length, 1, "one title");
  assert.match(plain(await page.textContent('[data-testid="regime-whatif-overrides"]')), /Юсупов Бек/);
  await page.close();
  await atAllWidths("money-b.entry.tsx", (r) => (r.method === "PUT" && isDry(r) ? { json: { dry_run: true, regime_impact: X.REGIME_IMPACT } } : null), async ({ page: p }, width) => {
    await p.evaluate(() => window.mount("regime", { role: "owner", org_role: "owner" }, { changes: { billing_day: 10 } }));
    await p.waitForSelector('[data-testid="regime-whatif-students"]');
    await p.waitForTimeout(600);      // the window fades in
    await probe(p, '[role="dialog"]', `regime ${width}`);
  }, "02-regime-window");
});

const STUDENT2 = { id: "st8", first_name: "Второй", last_name: "Ученик", full_name: "Ученик Второй", class_level: 7, status: "new", group_id: null, current_group_id: null, groups_count: 0 };
const STUDENT = { id: "st9", first_name: "Новый", last_name: "Ученик", full_name: "Ученик Новый", class_level: 7, status: "new", group_id: null, current_group_id: null, groups_count: 0 };
const drawerServer = (extra) => (request) => {
  const own = extra ? extra(request) : null;
  if (own) return own;
  if (request.method === "GET" && request.path === "/auth/org/groups") return { json: [{ id: "g2", name: "7-Б Геометрия" }] };
  if (request.method === "GET" && request.path === "/auth/org/students") return { json: { items: [STUDENT, STUDENT2], total: 2 } };
  if (request.method === "GET" && request.path === "/auth/org/groups/g2/pay-from-default") return { json: { today: "2026-11-06", first_lesson: "2026-11-09", default_pay_from: "2026-11-09", text: "Оплата с 09.11.2026 — первое занятие группы с сегодня" } };
  if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/st9" && !isDry(request)) return { json: { status: "added", billing: { pay_from: "2026-11-12", explicit: true, default_pay_from: "2026-11-09", first_lesson: "2026-11-09", text: "Оплата считается с 12.11.2026: так выбрал сотрудник" } } };
  if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/bulk") return { json: { group_id: "g2", added: 1, skipped: 0, skipped_details: [], warnings: [] } };
  return null;
};
async function openDrawer(user, server) {
  const ctx = await openPage(browser, "money-b.entry.tsx", drawerServer(server), { width: 1280, height: 900 });
  await ctx.page.evaluate(([u]) => window.mount("addDrawer", u, { summary: u.payments_access === false ? undefined : { accountingStart: "2026-09-01" }, refresh: false }), [user]);
  if (user.payments_access !== false) await ctx.page.evaluate(() => 0);
  await ctx.page.fill('input[placeholder^="Поиск по имени"]', "Ув");
  await ctx.page.click('button:has-text("Ученик Новый")');
  return ctx;
}
const bulk = (calls) => calls.filter((c) => c.method === "POST" && c.path === "/auth/org/groups/g2/students/bulk" && !isDry(c));
const single = (calls) => calls.filter((c) => c.method === "POST" && c.path === "/auth/org/groups/g2/students/st9" && !isDry(c));

test("Б1: the owner sees «Оплата с» with the first lesson by default; the default is NOT sent; a changed day is sent", async () => {
  for (const user of [OWNER, ADMIN_MONEY]) {
    const { page, calls } = await openDrawer(user);
    await page.waitForSelector('[data-testid="pay-from"]');
    assert.equal(await page.inputValue("#add-student-pay-from"), "09.11.2026");
    assert.match(plain(await page.textContent('[data-testid="pay-from-hint"]')), /Оплата с 09\.11\.2026 — первое занятие группы с сегодня/);
    await page.click('button:has-text("Зачислить (1)")');
    await page.waitForTimeout(250);
    assert.equal(bulk(calls).length, 1);
    assert.equal(bulk(calls)[0].body.pay_from, undefined, "the default day is not sent");
    await page.close();
  }
  const { page, calls } = await openDrawer(OWNER);
  await page.waitForSelector('[data-testid="pay-from"]');
  await page.fill("#add-student-pay-from", "12.11.2026");
  await page.keyboard.press("Tab");
  await page.waitForSelector('[data-testid="pay-from-reset"]');
  await page.click('button:has-text("Зачислить (1)")');
  await page.waitForTimeout(250);
  assert.equal(bulk(calls).length, 0);
  assert.equal(single(calls)[0].body.pay_from, "2026-11-12", "a chosen day goes through the route that answers the server's sentence");
  await page.waitForTimeout(100);
  assert.match(await page.evaluate(() => window.__log.join("|")), /Оплата считается с 12\.11\.2026: так выбрал сотрудник/);
  await page.close();
});

test("Б1: a day in the past - the dry run says «Сразу начислится N сум (за K уроков)» before the button", async () => {
  const server = (request) => {
    if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/bulk" && isDry(request)) return { json: { group_id: "g2", dry_run: true, added: 1, skipped: 0, students: [{ student_id: "st9", billing: { pay_from: "2026-10-26", explicit: true, default_pay_from: "2026-11-09", first_lesson: "2026-11-09", text: "x", immediate: { amount: 300000, lessons: 14, text: "Сразу начислится 300 000 сум (за 14 уроков)" } } }], immediate_total: { amount: 300000, lessons: 14, students: 1, text: "Всего сразу начислится 300 000 сум (за 14 уроков)" } } };
    return null;
  };
  const { page, calls } = await openDrawer(OWNER, server);
  await page.waitForSelector('[data-testid="pay-from"]');
  await page.fill("#add-student-pay-from", "26.10.2026");
  await page.keyboard.press("Tab");
  await page.waitForSelector('[data-testid="pay-from-immediate"]:has-text("Сразу начислится")');
  assert.equal(plain(await page.textContent('[data-testid="pay-from-immediate"]')), "Сразу начислится 300 000 сум (за 14 уроков)", "ONE student: his line, the total would say the same again (R3 №12)");
  const dry = calls.filter((c) => isDry(c) && /students\/bulk$/.test(c.path));
  assert.equal(dry.length >= 1, true);
  assert.equal(dry[dry.length - 1].body.pay_from, "2026-10-26");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, "09-pay-from-past-immediate-1280.png") });
  await page.close();
});

test("Б1: an administrator WITHOUT the money right - no date field at all, one quiet line, no pay_from and no sum in the request or on the screen", async () => {
  const { page, calls } = await openDrawer(ADMIN_NO_MONEY);
  await page.waitForSelector('[data-testid="pay-from-line"]');
  assert.equal(await page.locator("#add-student-pay-from").count(), 0, "not blocked - absent");
  assert.equal(plain(await page.textContent('[data-testid="pay-from-line"]')), "Оплата с 09.11.2026 — первое занятие группы с сегодня");
  assert.ok(!/сум/.test(await page.textContent('[role="dialog"]')), "no sum");
  await page.click('button:has-text("Зачислить (1)")');
  await page.waitForTimeout(250);
  assert.equal(bulk(calls)[0].body.pay_from, undefined);
  assert.ok(!calls.some((c) => isDry(c)), "no dry run of the charge without the money right");
  await page.close();
});

test("Б1: PAY_FROM_RANGE is told in words under the form", async () => {
  const server = (request) => (request.method === "POST" && request.path === "/auth/org/groups/g2/students/st9" && !isDry(request)
    ? { status: 422, json: { detail: { code: "PAY_FROM_RANGE", message: "«Оплата с» — не раньше начала учёта центра (01.09.2026) и не позже чем через 62 дня от сегодня" } } } : null);
  const { page } = await openDrawer(OWNER, server);
  await page.waitForSelector('[data-testid="pay-from"]');
  await page.fill("#add-student-pay-from", "12.11.2026");
  await page.keyboard.press("Tab");
  await page.click('button:has-text("Зачислить (1)")');
  await page.waitForSelector('[role="alert"]');
  assert.match(plain(await page.textContent('[role="alert"]')), /«Оплата с» — не раньше начала учёта центра \(01\.09\.2026\) и не позже чем через 62 дня от сегодня/);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, "13-pay-from-range-error-1280.png") });
  await page.close();
});

test("Б1 screens: the field of the owner on 1280 / 1024 / 375", async () => {
  for (const [width, height] of WIDTHS) {
    const ctx = await openPage(browser, "money-b.entry.tsx", drawerServer(), { width, height });
    await ctx.page.evaluate(([u]) => window.mount("addDrawer", u, { summary: { accountingStart: "2026-09-01" } }), [OWNER]);
    await ctx.page.fill('input[placeholder^="Поиск по имени"]', "Ув");
    await ctx.page.click('button:has-text("Ученик Новый")');
    await ctx.page.waitForSelector('[data-testid="pay-from"]');
    await ctx.page.waitForTimeout(700);      // the drawer slides in
    await probe(ctx.page, '[role="dialog"]', `add ${width}`);
    await ctx.page.screenshot({ path: path.join(SHOTS, `03-add-student-pay-from-${width}.png`) });
    await ctx.page.close();
  }
});

test("Б2: the price field of a new group - owner and administrator with money only; a teacher / no money - the field is not there, no price is sent", async () => {
  const create = (calls) => calls.filter((c) => c.method === "POST" && c.path === "/auth/org/groups");
  const server = (request) => (request.method === "POST" && request.path === "/auth/org/groups" ? { json: { id: "g9", name: "5А", class_level: 9 } } : null);
  for (const [user, props, has] of [[OWNER, {}, true], [ADMIN_MONEY, {}, true], [ADMIN_NO_MONEY, {}, false], [{ role: "teacher", org_role: "teacher" }, { self: true }, false]]) {
    const { page, calls } = await openPage(browser, "money-b.entry.tsx", server, { width: 1280, height: 900 });
    await page.evaluate(([u, p]) => window.mount("groupCreate", u, p), [user, props]);
    await page.fill("#group-create-nazvanie-gruppy", "5А");
    assert.equal(await page.locator("#group-create-price").count(), has ? 1 : 0, JSON.stringify(user));
    if (has) {
      assert.match(plain(await page.textContent('label[for="group-create-price"]')), /^Цена в месяц \(необязательно\)$/);
      await page.fill("#group-create-price", "450000");
      if (user === OWNER) { await page.waitForTimeout(600); await page.screenshot({ path: path.join(SHOTS, "11-group-create-price-1280.png") }); }
    }
    await page.click('button:has-text("Создать группу")');
    await page.waitForTimeout(250);
    assert.equal(create(calls).length, 1);
    assert.equal(create(calls)[0].body.price, has ? 450000 : undefined);
    await page.close();
  }
});

const paymentsServer = (extra) => (request) => {
  if (extra) { const own = extra(request); if (own) return own; }
  if (request.path === "/auth/org/payments/summary") return { json: X.SUMMARY };
  if (request.path === "/auth/org/payments/status") {
    const tab = /bucket=([a-z]+)/.exec(request.query)[1];
    const items = tab === "waiting" ? [X.WAITING] : tab === "debtors" ? [X.DEBTOR] : [];
    return { json: { items, total: items.length, limit: 50, offset: 0 } };
  }
  if (request.path === "/auth/org/groups") return { json: [{ id: "g1", name: "7-А Алгебра", teacher_id: "t1" }] };
  return null;
};

test("Б7: «Ждём оплату» is a calm tab next to «Должники»; the waiting row is grey with «Ждём оплату до 07.11»; the debtors tab holds only debtors; the card says debt and waiting apart", async () => {
  await atAllWidths("money-b.entry.tsx", paymentsServer(), async ({ page: firstPage, calls }, width) => {
    let page = firstPage;
    await page.evaluate(() => window.mount("payments", { role: "owner", org_role: "owner" }, { refresh: true, search: "bucket=debt" }));
    await page.waitForSelector('[role="tab"]');
    const tabs = (await page.locator('[role="tab"]').allTextContents()).map(plain);
    assert.deepEqual(tabs.slice(0, 2), ["Должники (1)", "Ждём оплату (1)"]);
    const debtCall = calls.find((c) => c.path === "/auth/org/payments/status");
    assert.match(debtCall.query, /bucket=debtors/);
    await page.waitForSelector('li:has-text("Иванов Иван")');
    assert.match(plain(await page.textContent("ul")), /Просрочено на 20 дней/);
    assert.ok(!/Петров/.test(await page.textContent("body")), "the waiting student is not among the debtors");
    assert.equal(plain(await page.textContent('[data-testid="position-debt"]')).replace(/\s+/g, " ").includes("600 000 сум"), true, "the red card is the debtors' debt only");
    assert.equal(plain(await page.textContent('[data-testid="position-waiting"]')), "Ждём оплату: 300 000 сум · 1 ученик");
    if (width === 375) {
      // R3 №13: the buttons of a row are ≥ 40 px on a phone
      const heights = await page.evaluate(() => ["button:has(+ *), li button", "a[data-testid=payment-row-statement]"].flatMap((sel) => [...document.querySelectorAll(sel)].filter((el) => el.offsetParent).map((el) => [el.textContent.trim().slice(0, 14) || el.getAttribute("aria-label") || sel, Math.round(el.getBoundingClientRect().height)])));
      const small = heights.filter(([, h]) => h < 40);
      assert.deepEqual(small, [], `touch targets under 40 px: ${JSON.stringify(small)}`);
    }
    await probe(page, "body", `debtors ${width}`);
    if (width === 1280) await page.screenshot({ path: path.join(SHOTS, "04-payments-debtors-1280.png") });
    // the router of the test does not move the address: the waiting tab is opened by its own address, as a link does
    const other = await openPage(browser, "money-b.entry.tsx", paymentsServer(), { width, height: width === 375 ? 812 : 900 });
    await other.page.evaluate(() => window.mount("payments", { role: "owner", org_role: "owner" }, { refresh: true, search: "bucket=waiting" }));
    page = other.page; // eslint-disable-line no-param-reassign
    await page.waitForSelector('li:has-text("Петров Пётр")');
    assert.match(plain(await page.textContent('[role="tab"][aria-selected="true"]')), /^Ждём оплату \(1\)$/);
    assert.match(other.calls.find((c) => c.path === "/auth/org/payments/status").query, /bucket=waiting/);
    const chipText = plain(await page.textContent('li:has-text("Петров Пётр")'));
    assert.match(chipText, /Ждём оплату до 07\.11/);
    assert.equal((chipText.match(/Ждём оплату до 07\.11/g) ?? []).length, 1, "said once");
    const chipColor = await page.evaluate(() => { const chip = [...document.querySelectorAll("li span")].find((e) => /Ждём оплату до/.test(e.textContent)); return getComputedStyle(chip).color; });
    assert.ok(chipColor !== "rgb(185, 28, 28)" && chipColor !== "rgb(190, 18, 60)", `the waiting chip is not red/rose: ${chipColor}`);
    assert.equal(await page.locator('[data-testid="balance-note"]').evaluate((el) => /rose/.test(el.className)), false, "the sum of a waiting student is not red");
    assert.ok(!/Просрочено/.test(await page.textContent("main, body")), "no «Просрочено» on the waiting tab");
    await probe(page, "body", `waiting ${width}`);
    await page.screenshot({ path: path.join(SHOTS, `05-payments-waiting-${width}.png`) });
    await other.page.close();
  });
});

test("Б7: the red banner counts the debtors only - not those who wait", async () => {
  const { page } = await openPage(browser, "money-b.entry.tsx", paymentsServer(), { width: 1280, height: 600 });
  await page.evaluate(() => { window.__pathname = "/owner/dashboard"; window.mount("banner", { role: "owner", org_role: "owner" }, { refresh: true }); });
  await page.waitForSelector('[data-testid="payments-alert-banner"]');
  const text = plain(await page.textContent('[data-testid="payments-alert-banner"]'));
  assert.match(text, /^1 ученик с долгом — 600 000 сум/);
  assert.ok(!/900 000|2 ученика|ждём/i.test(text), text);
  assert.ok(!/из них просрочено/.test(text) || /просрочено: 1/.test(text));
  await page.waitForTimeout(700);      // the banner opens with an animation: the picture is taken after it (R3 №14)
  assert.ok((await page.locator('[data-testid="payments-alert-banner"]').boundingBox()).height > 40);
  assert.match(await page.getAttribute('button[aria-label="Скрыть напоминание"]', "title"), /пока должников не станет больше/);
  await page.screenshot({ path: path.join(SHOTS, "06-banner-1280.png") });
  await page.close();
  // only waiting students: no banner at all
  const calm = paymentsServer((r) => (r.path === "/auth/org/payments/summary"
    ? { json: { ...X.SUMMARY, debt_total: 300000, students_with_debt: 1, debtors: 1, students_expired: 1, expired: 1, debt_split: { ...X.SPLIT, debtors: 0, debtors_memberships: 0, debtors_debt_total: 0, expired: 0, due: 0, students_expired: 0, students_due: 0, all_debt_total: 300000, all_students_with_debt: 1 } } } : null));
  const ctx = await openPage(browser, "money-b.entry.tsx", calm, { width: 1280, height: 600 });
  await ctx.page.evaluate(() => { window.__pathname = "/owner/dashboard"; window.mount("banner", { role: "owner", org_role: "owner" }, { refresh: true }); });
  await ctx.page.waitForTimeout(600);
  assert.equal(await ctx.page.locator('[data-testid="payments-alert-banner"]').count(), 0, "nobody is a debtor: the banner is not drawn");
  await ctx.page.close();
});

test("Б9: the repeated payment - the server's sentence as it is, the button is NOT off", async () => {
  const server = (request) => {
    if (request.method === "GET" && /memberships\/m1\/payments\/preview/.test(request.path)) {
      const base = require("./helpers/stage-numbers.cjs").toshmatovPreview(Number(/amount=(\d+)/.exec(request.query)?.[1]) || undefined);
      return { json: { ...base, warnings: [{ code: "payment_repeated", message: "Такая же оплата уже внесена сегодня в 10:15 — внести ещё одну?" }] } };
    }
    return null;
  };
  const { page } = await openPage(browser, "money-b.entry.tsx", server, { width: 1280, height: 900 });
  await page.evaluate(() => window.mount("till", { role: "owner", org_role: "owner" }, {}));
  await page.waitForSelector('[data-testid="payment-repeated"]');
  assert.equal(plain(await page.textContent('[data-testid="payment-repeated"]')), "Такая же оплата уже внесена сегодня в 10:15 — внести ещё одну?");
  assert.equal((await page.textContent('[data-testid="payment-plan"]')).includes("сегодня в 10:15") , true);
  assert.equal((plain(await page.textContent('[role="dialog"]')).match(/сегодня в 10:15/g) ?? []).length, 1, "said once");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, "12-payment-repeated-1280.png") });
  await page.close();
});

test("Б9: the journal of the settings - closed by default, opens with the records of the server", async () => {
  const server = (request) => (request.path === "/auth/org/settings/payments/history" ? { json: { items: [
    { id: "1", at: "2026-11-06T05:15:00", actor_id: "u", actor_name: "Owner Иван", action: "billing_regime_changed", text: "Изменён способ оплаты: способ «Свой месяц у каждого ученика» → «Пакет уроков». Перейдут на новый способ 3 ученика: за первые 30 дней после перехода начислено 1 640 000 сум → 820 000 сум", details: { items_total: 1, items: [{ text: "Каримова Алия (с 01.11, на 30.11): долг 900 000 сум → 1 176 000 сум" }] } },
    { id: "2", at: "2026-11-05T09:00:00", actor_id: "u", actor_name: "Owner Иван", action: "centre_cancel_recalc_changed", text: "Перерасчёт за отмены центра: выключен → включён; действует на уроки с 05.11", details: {} },
  ] } } : null);
  for (const [width, height] of WIDTHS) {
    const { page, calls } = await openPage(browser, "money-b.entry.tsx", server, { width, height });
    await page.evaluate(() => window.mount("history", { role: "owner", org_role: "owner" }, {}));
    assert.equal(calls.length, 0, "nothing is asked until it is opened");
    await page.click('button:has-text("Журнал настроек оплат")');
    await page.waitForSelector('[data-testid="history-entry"]');
    const first = plain(await page.locator('[data-testid="history-entry"]').first().textContent());
    assert.match(first, /Способ оплаты.*06\.11\.2026 10:15 · Owner Иван.*Изменён способ оплаты/);
    await probe(page, "body", `history ${width}`);
    await page.screenshot({ path: path.join(SHOTS, `07-settings-journal-${width}.png`) });
    await page.close();
  }
});

test("R3 №5: the window of the mode asks the dry run with EXACTLY the body that is saved (mode AND accounting start together); №20: the error of saving is shown once", async () => {
  const body = { billing_day: 10, accounting_start_date: "2026-09-15", centre_cancel_recalc: true };
  const server = (request) => (request.method === "PUT" && request.path === "/auth/org/settings/payments" && isDry(request)
    ? { json: { dry_run: true, regime_impact: X.REGIME_IMPACT, impact: { memberships_with_new_debt: 2, debt_delta: 140000 } } } : null);
  const { page, calls } = await openPage(browser, "money-b.entry.tsx", server, { width: 1280, height: 900 });
  await page.evaluate((b) => window.mount("regime", { role: "owner", org_role: "owner" }, { changes: { billing_day: 10 }, body: b }), body);
  await page.waitForSelector('[data-testid="regime-whatif-students"]');
  const dry = calls.filter((c) => c.method === "PUT" && isDry(c));
  assert.deepEqual(dry[0].body, body, "the preview body = the body of saving");
  assert.match(plain(await page.textContent('[data-testid="regime-start-impact"]')), /140 000 сум/, "the impact of the start of the accounting is shown too");
  await page.close();
});

test("R3 №19/20: the journal is read again when the settings are saved (the key of the page = `updated_at`); the error of saving is under the section only while the window is closed", () => {
  const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
  assert.match(read("src/components/settings/payments-history.tsx"), /\}, \[open, nonce, refreshKey\]\);/);
  assert.match(read("src/app/owner/settings/page.tsx"), /<PaymentsHistory refreshKey=\{loaded\.updated_at \?\? ""\} \/>/);
  assert.match(read("src/app/owner/settings/page.tsx"), /\{state\.error && !regimeOpen && \(/);
});

test("R3 №11/12: a failed calculation of «сразу начислится» says so with «Повторить» (never «ничего не начислится»); several students - a line each and the total", async () => {
  let fail = true;
  const server = (request) => {
    if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/bulk" && isDry(request)) {
      if (fail) return { status: 500, json: { detail: "boom" } };
      const one = (id, amount) => ({ student_id: id, billing: { pay_from: "2026-10-26", immediate: { amount, lessons: 14, text: "Сразу начислится 300 000 сум (за 14 уроков)" } } });
      return { json: { students: [one("st9", 300000), one("st8", 300000)], immediate_total: { amount: 600000, lessons: 28, students: 2, text: "Всего сразу начислится 600 000 сум (за 28 уроков)" } } };
    }
    return null;
  };
  const { page } = await openDrawer(OWNER, server);
  await page.click('button:has-text("Ученик Второй")');
  await page.waitForSelector('[data-testid="pay-from"]');
  await page.fill("#add-student-pay-from", "26.10.2026");
  await page.keyboard.press("Tab");
  await page.waitForSelector('[data-testid="pay-from-failed"]');
  const failed = plain(await page.textContent('[data-testid="pay-from-failed"]'));
  assert.match(failed, /Не удалось посчитать, сколько начислится сразу Повторить/);
  assert.equal(await page.locator('[data-testid="pay-from-immediate"]').count(), 0, "never «ничего не начислится» after a failure");
  fail = false;
  await page.click('[data-testid="pay-from-failed"] button');
  await page.waitForSelector('[data-testid="pay-from-immediate-total"]');
  const text = plain(await page.textContent('[data-testid="pay-from-immediate"]'));
  assert.match(text, /Ученик Новый: Сразу начислится 300 000 сум.*Ученик Второй: Сразу начислится 300 000 сум.*Всего сразу начислится 600 000 сум \(за 28 уроков\)/);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, "10-pay-from-bulk-total-1280.png") });
  await page.close();
});

test("R3 №22: no flash of «Укажите дату» before the default of the server arrives", async () => {
  const { page } = await openDrawer(OWNER);
  await page.waitForSelector('[data-testid="pay-from"]');
  assert.equal(await page.locator('[data-testid="enrol-why"]').count(), 0);
  assert.equal(await page.locator('button:has-text("Зачислить")').first().isDisabled(), false);
  await page.close();
});

test("R3 №6/DOM: the header of a group - the red chip «Долг» for the debtors and the GREY «Ждём оплату: M сум · N ученик» chip that leads to the waiting filter; both from the same split of the list", async () => {
  const GROUP = { id: "g1", name: "7-А Алгебра", status: "active", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", max_students: 30, student_count: 2, students: [], price_current: { amount: 300000 }, lesson_type: "group", schedule: [] };
  const server = (request) => {
    if (request.path === "/auth/org/groups/g1") return { json: GROUP };
    if (request.path === "/auth/org/payments/summary") return { json: X.SUMMARY };
    if (request.path === "/auth/org/payments/status") {
      const tab = /bucket=([a-z]+)/.exec(request.query)[1];
      const items = tab === "waiting" ? [X.WAITING] : tab === "debtors" ? [X.DEBTOR] : [];
      return { json: { items, total: items.length } };
    }
    return null;
  };
  const { page } = await openPage(browser, "money-b.entry.tsx", server, { width: 1280, height: 900 });
  await page.evaluate(() => window.mount("groupHeader", { role: "owner", org_role: "owner" }, { refresh: true }));
  await page.waitForSelector('[data-testid="group-waiting-chip"]', { timeout: 8000 });
  assert.equal(plain(await page.textContent('[data-testid="group-waiting-chip"]')), "Ждём оплату: 300 000 сум · 1 ученик");
  assert.match(plain(await page.textContent('[data-testid="group-debt-chip"]')), /^Долг 600 000 сум · 1 ученик$/);
  const colorOf = (sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).color, sel);
  assert.equal(await colorOf('[data-testid="group-waiting-chip"]'), "rgb(82, 79, 72)", "neutral-600 (warm slate-600), not red");
  assert.equal(await colorOf('[data-testid="group-debt-chip"]'), "rgb(190, 18, 60)", "rose-700");
  assert.match(await page.getAttribute('[data-testid="group-waiting-chip"]', "href"), /tab=payments&filter=waiting/);
  assert.match(await page.getAttribute('[data-testid="group-debt-chip"]', "href"), /tab=payments&filter=debt/);
  await page.screenshot({ path: path.join(SHOTS, "08-group-header-chips-1280.png") });
  await page.close();
});
