// PAY-TAILS Б11.21, the screens of the walk of stage (part В), in a real browser (headless Chromium, the CSS of the project): «использовано N сум» of a forgiveness (п.1), the refusal of a price (п.2), the label of the reason of a pause (п.3),
// «—» instead of «0» of a forgiveness and no empty «Остаток» caption on a phone (п.5, п.7), the band of the left and the header after a payment (п.6), the phone (п.7), the calm look of the archive of a group (п.8).
// The 409 `BALANCE_CHANGED` of п.4 is in dom-paytails-part2 / money2-w1-effects; the console (п.9) is in dom-paytails-part11-console.  PNGs: node tests/dom/paytails-part11-shots.cjs <dir>.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, isDry, F, OWNER } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { statementServer, statementAllKinds } = require("./helpers/statement-all-kinds.cjs");
const X = require("./helpers/paytails-fixture.cjs");
const { fixture } = require("./helpers/dom-answers.cjs");

const ctx = setup(test);

// ── п.1: «использовано N сум» in «Решения» ────────────────────────────────────────────────────────────────────────────────

const decisionRows = [
  { id: "d1", at: "2026-11-05T09:20:00", kind: "payment_writeoff", kind_label: "Прощено", student_id: "s1", student_name: "Тошматов Бобур", group_name: "Алгебра 7", amount: 220000, used: 94000, used_text: "использовано 94 000 сум", new_amount: null, receipt_no: null, reason: "семья в трудном положении", actor_name: "Рустам Валиев", debt_before: 220000, debt_after: 126000 },
  { id: "d2", at: "2026-11-04T09:20:00", kind: "payment_writeoff", kind_label: "Прощено", student_id: "s2", student_name: "Каримова Дилноза", group_name: "Геометрия 8", amount: 100000, used: 100000, used_text: null, new_amount: null, receipt_no: null, reason: "ошибка начисления", actor_name: "Рустам Валиев", debt_before: 100000, debt_after: 0 },
];
const decisionPage = { as_of: "2026-11-10", from: "2026-11-01", to: "2026-11-30", page: 1, size: 25, total: 2, pages: 1, since: "2026-11-02", rows: decisionRows };
async function decisions(width) {
  const run = await openPage(ctx.browser, "money-v.entry.tsx", (request) => (request.path === "/auth/org/payments/decisions" ? { json: decisionPage } : null), { width, height: 900 });
  await run.page.evaluate(() => window.mount("decisions", undefined, {}));
  await run.page.waitForSelector('[data-testid="decision-row"]');
  return run;
}

for (const width of [1280, 375]) {
  test(`п.1 (${width}): a forgiveness used in part says «использовано 94 000 сум» quietly in the row AND in the opened row (the words of the server); a fully used one says nothing`, async () => {
    const run = await decisions(width);
    const rows = run.page.locator('[data-testid="decision-row"]');
    assert.equal(plain(await rows.nth(0).locator('[data-testid="decision-used"]').innerText()), "использовано 94 000 сум");
    assert.equal(await rows.nth(1).locator('[data-testid="decision-used"]').count(), 0, "no words when all of it was used");
    assert.equal(await run.page.locator('[data-testid="decision-used"]').count(), 1);
    assert.match(await rows.nth(0).locator('[data-testid="decision-used"]').getAttribute("class"), /text-xs text-slate-500/, "quiet: small and grey");
    await rows.nth(0).click();
    // Б11.22 п.2: the opened row does NOT say it a second time (the row does), and the person who decided is said once - in «Кто» (a card and a wide table show it), not again in the opened row
    assert.equal(await run.page.locator('[data-testid="decision-used-detail"]').count(), 0, "«использовано…» only in the row");
    assert.equal(await run.page.locator('[data-testid="decision-used"]').count(), 1, "and it is still in the row");
    // «Кто» is a column of the table from 1100 up and a line of a card; between 880 and 1119 the column goes and the opened row says who decided
    const tableWidth = await run.page.evaluate(() => document.querySelector(".dt").getBoundingClientRect().width);
    assert.equal(await run.page.locator('[data-testid="decision-actor-detail"]').isVisible(), tableWidth >= 880 && tableWidth < 1120, `«Решение принял(а)» does not repeat «Кто» (table ${tableWidth})`);
    // the opened row stays INSIDE the frame of its card on a phone: one border round the row and the details (a table row has no frame of its own)
    const frame = await run.page.evaluate(() => {
      const details = document.querySelector('[data-testid="decision-details"]');
      const li = details.closest("li");
      const box = li.getBoundingClientRect();
      const inner = details.getBoundingClientRect();
      return { border: getComputedStyle(li).borderTopWidth, inside: inner.left >= box.left && inner.right <= box.right && inner.bottom <= box.bottom + 0.5 };
    });
    assert.equal(frame.inside, true);
    assert.equal(frame.border, width === 375 ? "1px" : "0px", "the card has the frame; the table row has none");
    // the chevron of the opened row turns for 150 ms; a box measured in the middle of the turn is wider than itself - wait for the end of the motion, then measure
    await run.page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
    const probe = await run.page.evaluate(layoutProbe, '[data-testid="income-decisions"]');
    assert.deepEqual(probe.bad, []);
    assert.equal(probe.scroll, 0);
    await run.page.close();
  });
}

// ── п.2: the refusal of a price ───────────────────────────────────────────────────────────────────────────────────────────

const FORGIVENESS = "У 1 ученика исправление превратит прощённый долг в переплату. Сначала отмените прощение долга, затем исправьте цену.";
const priceServer = (request) => {
  if (request.method === "PUT" && request.path === "/auth/org/groups/g1/price") {
    return { status: 409, json: { detail: { code: "PRICE_CORRECTION_FORGIVENESS", message: FORGIVENESS, count: 1, students: [{ membership_id: "m0", student_name: "Тошматов Бобур Абдуллаевич" }] } } };
  }
  return null;
};
for (const width of [1280, 375]) {
  test(`п.2 (${width}): a refused price - no «Кнопка включится…» under it, ONE yellow block, the sentence of the server WITH its full stop`, async () => {
    const run = await openPage(ctx.browser, "money-v.entry.tsx", priceServer, { width, height: 900 });
    await run.page.evaluate(() => window.mount("groupPrice", undefined, {}));
    await run.page.waitForSelector("#group-price-amount");
    await run.page.fill("#group-price-amount", "30 000");
    await run.page.waitForSelector('[data-testid="price-blocked"]');
    await run.page.waitForTimeout(500);
    const text = plain(await run.page.locator('[role="dialog"]').innerText());
    assert.ok(!text.includes("Кнопка включится"), text);
    // Б11.22 п.3: the FIRST sentence is the refusal (bold), the second the way out (plain); together they are the words of the server as they came, with the full stop
    const first = run.page.locator('[data-testid="price-blocked"] p').first();
    const way = run.page.locator('[data-testid="price-blocked-way"]');
    assert.equal(plain(await first.innerText()), "У 1 ученика исправление превратит прощённый долг в переплату.");
    assert.equal(plain(await way.innerText()), "Сначала отмените прощение долга, затем исправьте цену.");
    assert.equal(plain(await run.page.locator('[data-testid="price-blocked"]').innerText()).includes(FORGIVENESS), true, "the whole sentence of the server, in order");
    assert.ok(Number(await first.evaluate((el) => getComputedStyle(el).fontWeight)) >= 600, "the first sentence is bold");
    assert.ok(Number(await way.evaluate((el) => getComputedStyle(el).fontWeight)) <= 500, "the way out is plain");
    // the refusal stands ALONE: no grey frame, no «Что изменится» round it
    assert.ok(!text.includes("Что изменится"), "no «Что изменится» over a refusal");
    assert.equal(await run.page.locator('[role="dialog"] .bg-slate-50.border-slate-200').count(), 0, "no grey frame round the refusal");
    // one yellow block: the notice of the refusal; the warning «Дата в прошлом…» is not a second one next to it
    const yellow = await run.page.locator('[role="dialog"] [data-variant="blocked"], [role="dialog"] [data-variant="warning"], [role="dialog"] .bg-amber-50').count();
    assert.equal(yellow, 1, `one yellow block, got ${yellow}`);
    assert.equal(await run.page.locator('button[form="group-price-form"]').isDisabled(), true, "the button stays off");
    await run.page.close();
  });
}

test("п.2: while the consequences are being counted (no refusal) the button still says why it is off", async () => {
  const run = await openPage(ctx.browser, "money-v.entry.tsx", (request) => (request.method === "PUT" ? new Promise(() => undefined) : null), { width: 1280, height: 900 });
  await run.page.evaluate(() => window.mount("groupPrice", undefined, {}));
  await run.page.waitForSelector("#group-price-amount");
  await run.page.fill("#group-price-amount", "30 000");
  await run.page.waitForTimeout(800);
  assert.match(plain(await run.page.locator('[role="dialog"]').innerText()), /Кнопка включится, когда будут показаны последствия/);
  await run.page.close();
});

// ── п.3: the label of the reason of a pause ──────────────────────────────────────────────────────────────────────────────

const day = (shift) => new Date(Date.now() + shift * 86400000).toISOString().slice(0, 10);
const pauseRow = (id, first, last) => ({ id, membership_id: "m-a", first_day: first, last_day: last, days: 4, reason: null, created_by_name: null, created_at: null, voided_at: null, void_reason: null });
test("п.3: the field of the reason of a cancelled / ended pause has a VISIBLE label «Причина (обязательно)» tied to it (for a screen reader too)", async () => {
  const future = pauseRow("pf", day(10), day(13));
  const answer = F.baseServer((request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m-a/pauses") return { json: [future] };
    if (request.method === "POST" && request.path === "/auth/org/pauses/pf/void") return { json: { pause: future, impact: null, row: null, dry_run: true, other_groups_text: null } };
    return null;
  });
  const run = await mount(ctx, answer, "pause", OWNER, { moneyAvailable: true });
  await run.page.waitForSelector('section[aria-label="Паузы ученика"]');
  await run.page.getByRole("button", { name: "Снять паузу", exact: true }).click();         // Б11.39 Э2: a pause that has not begun - «Снять паузу»
  const field = run.page.locator("#pause-act-reason");
  await field.waitFor();
  const label = run.page.locator('label[for="pause-act-reason"]');
  assert.match(plain(await label.innerText()), /^Причина \(обязательно\)$/);
  assert.equal(await run.page.getByLabel("Причина (обязательно)").count(), 1, "the field is found by its label");
  assert.ok((await label.boundingBox()).y < (await field.boundingBox()).y, "the label stands over the field");
  await run.page.close();
});

// ── п.5, п.7: the statement ──────────────────────────────────────────────────────────────────────────────────────────────

function statementWith(patch) {
  return F.baseServer((r) => {
    if (r.path === "/auth/org/memberships/m-a/statement") { const data = statementAllKinds(F.SHORT); patch(data); return { json: data }; }
    if (r.path === "/auth/org/memberships/m-a/payments") return { json: [] };
    return null;
  }, F.SHORT);
}
async function statement(width, patch) {
  const run = await mount(ctx, statementWith(patch), "statement", OWNER, { moneyAvailable: true }, width);
  await run.page.waitForSelector('[data-testid="statement-row-writeoff"]');
  return run;
}
test("п.5 (1280): a forgiveness that brings no money has «—» in «Оплачено», not «0»; a payment keeps its «+»", async () => {
  const run = await statement(1280, (data) => { data.rows.find((row) => row.type === "writeoff").credit = 0; });
  const forgive = plain(await run.page.locator('[data-testid="statement-row-writeoff"] [data-col="paid"]').innerText());
  assert.ok(forgive.includes("—") && !/\b0\b/.test(forgive), forgive);
  assert.match(plain(await run.page.locator('[data-testid="statement-row-payment"] [data-col="paid"]').innerText()), /^\+1 800 000$/);
  await run.page.close();
});
test("п.7 (375): a card of the statement has no «Остаток» caption when nothing is open on the row; a row with a word there keeps it; a forgiveness has no «Оплачено 0» line", async () => {
  const run = await statement(375, (data) => { data.rows.find((row) => row.type === "writeoff").credit = 0; });
  const cards = await run.page.locator('[data-testid^="statement-row-"]').evaluateAll((items) => items.map((li) => ({
    type: li.dataset.testid,
    text: li.innerText.replace(/[\s ]+/g, " ").trim(),
    captions: [...li.querySelectorAll(".dt-cell")].filter((cell) => cell.offsetParent !== null).map((cell) => (cell.querySelector(".dt-label, .dt-cap")?.textContent ?? "").trim()).filter(Boolean),
  })));
  for (const card of cards) {
    const hasWord = /Оплачено$|Прощено|Аванс|Долг|К оплате|Закрыто/.test(card.text.split("Остаток")[1] ?? "");
    if (/Остаток/.test(card.text)) assert.ok(hasWord, `${card.type}: «Остаток» is empty: ${card.text}`);
  }
  const forgive = cards.find((card) => card.type === "statement-row-writeoff");
  assert.ok(!/Оплачено/.test(forgive.text), `a forgiveness without money: no «Оплачено» line: ${forgive.text}`);
  await run.page.close();
});

// ── п.7: the phone of «Оплаты» and of the group ───────────────────────────────────────────────────────────────────────

const OPENINGS_DONE = { accounting_start: "2026-09-01", state: "done", can_set_opening: true, totals: { left_available: 0, memberships: 40, missing: 0, needs_review: 0 } };
const paymentsServer = (extra, over = {}) => (request) => {
  if (extra) { const own = extra(request); if (own) return own; }
  if (request.path === "/auth/org/payments/summary") return { json: over.summary ?? { ...X.SUMMARY, price_missing: 5 } };
  if (request.path === "/auth/org/payments/status") return { json: X.statusOf(request.query) };
  if (request.path === "/auth/org/groups") return { json: [{ id: "g1", name: "Математика 7", teacher_id: "t1" }] };
  if (request.path === "/auth/org/members") return { json: [] };
  if (request.path === "/auth/org/opening-balances/summary") return { json: OPENINGS_DONE };
  return null;
};
async function paydue(width, answer, mountArgs) {
  const run = await openPage(ctx.browser, "paydue.entry.tsx", answer, { width, height: width === 375 ? 812 : 900 });
  await run.page.evaluate(([name, user, props]) => window.mount(name, user, props), mountArgs);
  return run;
}

test("п.7 (375): the link of the prices says «Цены · 5 без цены» and stands WHOLE inside the screen; the other widths keep «Цены групп»", async () => {
  const run = await paydue(375, paymentsServer(), ["payments", OWNER, { moneyAvailable: true, search: "bucket=debtors" }]);
  await run.page.waitForSelector('[data-testid="payments-price-label"]');
  const link = run.page.locator('[data-testid="payments-header-links"] > a', { has: run.page.locator('[data-testid="payments-price-label"]') });
  assert.equal(plain(await link.innerText()), "Цены · 5 без цены");
  const box = await link.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 375, `the whole link is on the screen: ${JSON.stringify(box)}`);
  const cut = await link.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  assert.equal(cut, false, "the text is not cut inside the link");
  await run.page.close();
  const wide = await paydue(1280, paymentsServer(), ["payments", OWNER, { moneyAvailable: true, search: "bucket=debtors" }]);
  await wide.page.waitForSelector('[data-testid="payments-header-links"]');
  assert.match(plain(await wide.page.locator('[data-testid="payments-header-links"]').innerText()), /^Поступления Цены групп/);
  await wide.page.close();
});

const GROUP = { id: "g1", name: "Математика 7", status: "active", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", max_students: 30, student_count: 3, students: [], price_current: { amount: 600000 }, lesson_type: "group", schedule: [] };
const groupServer = (statusOf) => paymentsServer((r) => {
  if (r.path === "/auth/org/groups/g1") return { json: GROUP };
  if (r.path === "/auth/org/payments/status" && /group_id=g1/.test(r.query)) return { json: statusOf(r.query) };
  return null;
});
test("п.7 (375): a press on a row of a student who left opens his statement (the row is the link; «Внести» does not)", async () => {
  const run = await paydue(375, groupServer(X.groupStatus), ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }]);
  await run.page.waitForSelector('[data-testid="payments-left-toggle"]', { timeout: 9000 });
  await run.page.click('[data-testid="payments-left-toggle"]');
  const row = run.page.locator('[data-testid="group-payment-left-row"]').first();
  await row.waitFor();
  const link = row.locator('[data-testid="money-row-statement"]');
  assert.match(await link.getAttribute("href"), /\/payments\/statement\/[^/]+$/);
  // the press on the NAME (not on a button) lands on the link that covers the row
  await row.scrollIntoViewIfNeeded();
  const name = await row.locator('[data-testid="money-row-name"]').boundingBox();
  const hit = await run.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute("data-testid"), [name.x + 8, name.y + name.height / 2]);
  assert.equal(hit, "money-row-statement", "the press on the row lands on the link to the statement");
  await run.page.close();
});

// ── п.8: the archive of a group ──────────────────────────────────────────────────────────────────────────────────────────

const archiveImpact = () => ({ groupId: "gz", groupName: F.SHORT.A, status: "active", canArchive: false, examService: "ok", blockers: [{ code: "ACTIVE_STUDENTS", count: 2, students: [{ id: "s1", name: "Иванов Али", displayId: "AL-001" }, { id: "s2", name: "Саидова Мадина", displayId: "AL-002" }] }], autoActions: [], warnings: [] });
for (const width of [1280, 375]) {
  test(`п.8 (${width}): the top line «В группе N учеников…» is a calm WARNING (amber, with a triangle), not the red look of an error; the ways out stay`, async () => {
    const run = await mount(ctx, F.baseServer((request) => (request.path === "/auth/org/groups/gz/archive-impact" ? { json: archiveImpact() } : null), F.SHORT), "group-archive", OWNER, { moneyAvailable: true, groupsBasePath: "/owner/groups" }, width);
    const block = run.page.locator('[data-testid="archive-students-stop"]');
    await block.waitFor();
    assert.equal(await block.getAttribute("data-variant"), "warning");
    assert.doesNotMatch(await block.evaluate((el) => el.outerHTML), /rose-|red-/, "no red token in the block");
    assert.match(plain(await block.innerText()), /^В группе 2 ученика/);
    assert.equal(await block.getByRole("button", { name: "В архив" }).count(), 2, "the way out of every student stays");
    const probe = await run.page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(probe.bad, []);
    await run.page.close();
  });
}

// ── п.6: after a payment from the card of a group the band of the left and the header follow at once ──────────────────

test("п.6: a payment of a student who left, made from the card of the group, changes the band «Ушли из группы» (its number and its rows) and the «Долг» of the header at once, without a reload", async () => {
  let paid = false;
  const debtors = () => (paid ? X.page([X.LOLA], { total: 1, students: 1, amount_total: 200000 }) : X.page([X.LOLA, X.FERUZA], { total: 2, students: 2, amount_total: 615000 }));
  const status = (query) => {
    const bucket = new URLSearchParams(query).get("bucket");
    if (bucket === "left_open") return paid ? X.page([X.DILSHOD, X.KAMOLA], { total: 2, students: 2, left_count: 2 }) : X.page([X.FERUZA, X.DILSHOD, X.KAMOLA], { total: 3, students: 3, left_count: 3 });
    if (bucket === "debtors") return debtors();
    return X.groupStatus(query);
  };
  const answer = groupServer(status);
  const wrapped = (request) => {
    const m = /^\/auth\/org\/memberships\/([^/]+)\/payments(\/preview)?$/.exec(request.path);
    if (m && request.method === "GET" && m[2]) return { json: fixture("e1_preview_300000") };
    if (m && request.method === "POST" && !m[2] && !/dry_run/.test(request.query)) { paid = true; return { status: 201, json: fixture("e1_create_300000") }; }
    return answer(request);
  };
  const run = await paydue(1280, wrapped, ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }]);
  await run.page.waitForSelector('[data-testid="payments-left-toggle"]', { timeout: 9000 });
  assert.match(plain(await run.page.innerText('[data-testid="payments-left-toggle"]')), /расчёт не закрыт 3/);
  assert.match(plain(await run.page.locator("body").innerText()), /Долг 615 000 сум/);
  await run.page.click('[data-testid="payments-left-toggle"]');
  await run.page.locator('[data-testid="group-payment-left-row"]').first().getByRole("button", { name: "Внести оплату" }).click();
  await run.page.waitForSelector("#payment-amount");
  await run.page.fill("#payment-amount", "300000");
  await run.page.click('[data-testid="payment-methods"] >> text=Наличные');
  await run.page.waitForFunction(() => !document.querySelector('button[form="payment-form"]')?.disabled);
  await run.page.click('button[form="payment-form"]');
  await run.page.waitForFunction(() => /расчёт не закрыт 2/.test(document.body.innerText), null, { timeout: 8000 });
  assert.ok(paid, "the payment was written");
  await run.page.waitForFunction(() => /Долг 200 000 сум/.test(document.body.innerText.replace(/[\s\u00A0\u202F]+/g, " ")), null, { timeout: 8000 });
  assert.equal(await run.page.locator('[data-testid="group-payment-left-row"]').count(), 2, "the open band shows two rows now");
  assert.doesNotMatch(plain(await run.page.locator("body").innerText()), /расчёт не закрыт 3|Долг 615 000/);
  await run.page.close();
});

// ══ Б11.22: the finish after the acceptance of the screens ═══════════════════════════════════════════════════════════════════════
const X2 = require("./helpers/paytails-fixture2.cjs");
const F2 = require("./helpers/money2-fixture.cjs");
const STALE_LINE = "Счёт изменился, пока окно было открыто. Проверьте числа и подтвердите ещё раз.";
const STALE_409 = { status: 409, json: { detail: { code: "BALANCE_CHANGED", message: "Сумма изменилась, откройте окно заново", fresh: [] } } };

/** The calm sentence stands right under the heading, OUT of the scroll, inside the screen, above the footer - whatever the body scrolls to. */
async function assertStaleInView(page, label) {
  const facts = await page.evaluate(() => {
    const notice = document.querySelector('[data-testid="balance-stale"]');
    const rect = notice.getBoundingClientRect();
    const part = (name) => document.querySelector(`[role="dialog"] [data-modal-part="${name}"]`)?.getBoundingClientRect();
    const header = part("header"); const body = part("body"); const footer = part("footer");
    return { inBody: Boolean(notice.closest('[data-modal-part="body"]')), top: rect.top, bottom: rect.bottom, height: rect.height, viewport: window.innerHeight, header: header && header.bottom, body: body && body.top, footerTop: footer && footer.top };
  });
  assert.equal(facts.inBody, false, `${label}: the sentence is not inside the scrolling body`);
  assert.ok(facts.top >= facts.header - 1 && facts.bottom <= facts.body + 1, `${label}: it stands between the heading and the body ${JSON.stringify(facts)}`);
  assert.ok(facts.top >= 0 && facts.bottom <= facts.footerTop && facts.bottom <= facts.viewport, `${label}: in view, above the footer ${JSON.stringify(facts)}`);
}

for (const width of [1280, 375]) {
  test(`п.1 (${width}): «Счёт изменился…» stands under the heading, out of the scroll, in view above the footer - in the window of leaving, of a transfer and of the archive of a student`, async () => {
    // leaving
    const memberships = [X2.LEAVE_DEBT()];
    const leave = await openPage(ctx.browser, "money2.entry.tsx", F2.baseServer(X2.leaveServer(memberships, () => X2.STALE_409)), { width, height: width === 375 ? 812 : 900 });
    await leave.page.evaluate(() => window.mount("leave-lines", { role: "owner", org_role: "owner" }, { groupName: "Алгебра 7" }));
    await leave.page.waitForSelector('[data-testid="settle-membership"]');
    await leave.page.getByRole("button", { name: "Убрать из группы" }).click();
    await leave.page.waitForSelector('[data-testid="balance-stale"]');
    assert.equal(plain(await leave.page.locator('[data-testid="balance-stale"]').innerText()), STALE_LINE);
    await assertStaleInView(leave.page, "leave");
    await leave.page.close();
    // the archive of a student
    const archive = await openPage(ctx.browser, "money2.entry.tsx", F2.baseServer(X2.archiveServer([X2.LEAVE_DEBT()], () => X2.STALE_409)), { width, height: width === 375 ? 812 : 900 });
    await archive.page.evaluate(() => window.mount("archive-lines", { role: "owner", org_role: "owner" }, { groupNames: ["Математика 7"] }));
    await archive.page.waitForSelector('[data-testid="settle-membership"]');
    await archive.page.getByRole("button", { name: "В архив" }).click();
    await archive.page.waitForSelector('[data-testid="balance-stale"]');
    await assertStaleInView(archive.page, "student archive");
    await archive.page.close();
    // a transfer
    let writes = 0;
    const transfer = await mount(ctx, F2.baseServer((request) => {
      if (request.path !== "/auth/org/groups/gt/students/st1") return null;
      if (isDry(request)) return { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, as_of: "2026-11-21", effects: F2.transferEffects({ carried: 440000 }) } };
      writes += 1;
      return STALE_409;
    }), "assign", OWNER, { moneyAvailable: true, sourceGroups: [F2.SOURCES[0]], excludeGroupIds: ["ga"] }, width);
    await transfer.page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
    await transfer.page.waitForSelector('[data-testid="transfer-effects"]');
    await transfer.page.click('[data-testid="assign-submit"]');
    await transfer.page.waitForSelector('[data-testid="balance-stale"]');
    assert.equal(writes, 1);
    await assertStaleInView(transfer.page, "transfer");
    await transfer.page.close();
  });
}

test("п.4: the window of leaving names the student AND the group under the heading («Каримов Фарход · Алгебра 7»)", async () => {
  const run = await openPage(ctx.browser, "money2.entry.tsx", F2.baseServer(X2.leaveServer([X2.LEAVE_DEBT()])), { width: 1280, height: 900 });
  await run.page.evaluate(() => window.mount("leave-lines", { role: "owner", org_role: "owner" }, { groupName: "Алгебра 7" }));
  await run.page.waitForSelector('[data-testid="settle-membership"]');
  const header = run.page.locator('[role="dialog"] [data-modal-part="header"]');
  assert.match(plain(await header.innerText()), /Убрать ученика из группы\?\s*Каримов Фарход · Алгебра 7/);
  await run.page.close();
});

for (const width of [1280, 375]) {
  test(`п.5 (${width}): the transfer - the main button says «Перевести» (not the name of the group), the bottom is the one of every window (the same footer, the divider, «Отмена»); the group is named in the list and in the block «Перейдёт в…»`, async () => {
    const run = await mount(ctx, F2.baseServer((request) => (request.path === "/auth/org/groups/gt/students/st1"
      ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(request), as_of: "2026-11-21", effects: F2.transferEffects({ carried: 440000 }) } } : null)),
    "assign", OWNER, { moneyAvailable: true, sourceGroups: [F2.SOURCES[0]], excludeGroupIds: ["ga"] }, width);
    await run.page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
    await run.page.waitForSelector('[data-testid="transfer-effects"]');
    const submit = run.page.locator('[data-testid="assign-submit"]');
    assert.equal(plain(await submit.innerText()), "Перевести");
    assert.equal(await run.page.locator('[data-testid="summary-bar"]').count(), 0, "a transfer has no sum: no bar of its own");
    const cancel = run.page.locator('[role="dialog"] [data-modal-part="footer"] [data-testid="confirm-cancel"]');
    assert.equal(plain(await cancel.innerText()), "Отмена");
    const footer = await run.page.locator('[role="dialog"] [data-modal-part="footer"]').evaluate((el) => ({ border: getComputedStyle(el).borderTopWidth, bg: getComputedStyle(el).backgroundColor }));
    assert.equal(footer.border, "1px", "the divider of the footer");
    assert.equal(footer.bg, "rgba(0, 0, 0, 0)", "the same (white) ground as the other windows");
    const box = await submit.evaluate((el) => ({ h: el.getBoundingClientRect().height, scroll: el.scrollWidth > el.clientWidth + 1 }));
    assert.ok(box.h <= 48, `one line, got ${box.h}`);
    assert.equal(box.scroll, false);
    const probe = await run.page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(probe.bad, []);
    await run.page.close();
  });
}

test("п.5: a first enrolment keeps its bar with the sum and the button «Зачислить в «…»» (the sum is the reason of the bar)", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src/components/groups/assign-group-modal.tsx"), "utf8");
  assert.match(src, /isTransfer \? "Перевести" : selectedGroup \? enrolIntoLabel\(selectedGroup\.name, verb\) : "Зачислить"/);
  assert.match(src, /<SummaryBar\b/, "the enrolment still has its bar");
});

test("п.6 (1280): «Стоимость» and «Оплачено» stand on the RIGHT edge with tabular digits - digits under digits, their headers over the same edge; «Остаток» stays in the centre", async () => {
  // a forgiveness without money has «—» in «Оплачено»: it stands on the SAME right edge as the digits (the edge of the TEXT is measured)
  const run = await statement(1280, (data) => { data.rows.find((row) => row.type === "writeoff").credit = 0; });
  const facts = await run.page.evaluate(() => {
    const textRight = (el) => { const range = document.createRange(); range.selectNodeContents(el); const rects = [...range.getClientRects()].filter((rect) => rect.width > 0); return Math.round(Math.max(...rects.map((rect) => rect.right)) * 10) / 10; };
    const edge = (col) => [...document.querySelectorAll(`[data-testid="statement-table"] .dt-row [data-col="${col}"] .dt-value`)].filter((el) => el.textContent.trim().length > 0 && el.getBoundingClientRect().width > 0)
      .map((el) => ({ right: textRight(el), align: getComputedStyle(el.closest(".dt-cell")).textAlign, tabular: getComputedStyle(el).fontVariantNumeric.includes("tabular-nums") || getComputedStyle(el.firstElementChild ?? el).fontVariantNumeric.includes("tabular-nums") }));
    const head = (col) => getComputedStyle(document.querySelector(`[data-testid="statement-table"] .dt-head-cell[data-col="${col}"]`)).textAlign;
    return { charged: edge("charged"), paid: edge("paid"), headCharged: head("charged"), headPaid: head("paid"), headBalance: head("balance") };
  });
  for (const key of ["charged", "paid"]) {
    assert.ok(facts[key].length >= 2, `${key}: rows with a sum`);
    assert.equal(new Set(facts[key].map((cell) => cell.right)).size, 1, `${key}: one right edge ${JSON.stringify(facts[key])}`);
    assert.ok(facts[key].every((cell) => cell.align === "right" && cell.tabular), `${key}: right and tabular`);
  }
  assert.equal(facts.headCharged, "right");
  assert.equal(facts.headPaid, "right");
  assert.equal(facts.headBalance, "center");
  await run.page.close();
});

const dueServer = (total) => groupServer((query) => (new URLSearchParams(query).get("bucket") === "to_pay" ? X.page([X.LOLA], { total: 1, students: 3, amount_total: total }) : X.groupStatus(query)));
test("п.7: the plate «К оплате» of the card of a group is not shown at the sum 0 (it is shown at a real sum, with the students); «Долг» is as before", async () => {
  const zero = await paydue(1280, dueServer(0), ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }]);
  await zero.page.waitForSelector('[data-testid="group-debt-chip"], [data-testid="group-price-chip"]', { timeout: 9000 });
  await zero.page.waitForTimeout(600);
  assert.equal(await zero.page.locator('[data-testid="group-due-chip"]').count(), 0, "no plate at 0");
  assert.doesNotMatch(plain(await zero.page.locator("body").innerText()), /К оплате 0 сум|Долг 0 сум/, "and no «Долг 0 сум» either: a sum of nothing is no plate");
  await zero.page.close();
  const some = await paydue(1280, dueServer(92000), ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }]);
  await some.page.waitForSelector('[data-testid="group-due-chip"]', { timeout: 9000 });
  assert.match(plain(await some.page.locator('[data-testid="group-due-chip"]').innerText()), /^К оплате 92 000 сум · 3 ученика/);
  await some.page.close();
});

for (const width of [1280, 375]) {
  test(`п.7 (${width}): the action of a student who left with an advance says «Вернуть аванс» - in the band of the group and in the tab «Аванс» of «Оплаты»`, async () => {
    const group = await paydue(width, groupServer(X.groupStatus), ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }]);
    await group.page.waitForSelector('[data-testid="payments-left-toggle"]', { timeout: 9000 });
    await group.page.click('[data-testid="payments-left-toggle"]');
    await group.page.locator('[data-testid="group-payment-left-row"]').first().waitFor();
    const refunds = await group.page.locator('[data-testid="group-payment-left-row"] [data-testid="payment-row-refund"]').allInnerTexts();
    assert.ok(refunds.length >= 1 && refunds.every((text) => plain(text) === "Вернуть аванс"), JSON.stringify(refunds));
    await group.page.close();
    const centre = await paydue(width, paymentsServer(), ["payments", OWNER, { moneyAvailable: true, search: "bucket=advance" }]);
    await centre.page.waitForSelector('[data-testid="payment-row-refund"]', { timeout: 9000 });
    const words = (await centre.page.locator('[data-testid="payment-row-refund"]').allInnerTexts()).map(plain);
    assert.ok(words.length >= 1 && words.every((text) => text === "Вернуть аванс"), JSON.stringify(words));
    await centre.page.close();
  });
}

test("п.8 (375): the second line of a compact row of money is WRAPPED, not cut by «…» («оплачено до 31.07» is read whole); a row that opens the statement has the arrow on the right", async () => {
  const long = X.longRow("long");
  const run = await paydue(375, paymentsServer((request) => (request.path === "/auth/org/payments/status" ? { json: X.page([long], { total: 1, students: 1, amount_total: 12345678 }) } : null)), ["payments", OWNER, { moneyAvailable: true, search: "bucket=debtors" }]);
  const row = run.page.locator('[data-testid="payments-phone-list"] > li').first();
  await row.waitFor();
  const facts = await row.evaluate((li) => {
    const line = li.querySelector('[data-testid="money-row-line"]');
    const chevron = li.querySelector('[data-testid="money-row-chevron"]');
    const button = li.querySelector("button");
    const box = li.getBoundingClientRect();
    return {
      text: line.innerText.replace(/[\s  ]+/g, " ").trim(), ellipsis: getComputedStyle(line).textOverflow === "ellipsis", cutWidth: line.scrollWidth > line.clientWidth + 1, cutHeight: line.scrollHeight > line.clientHeight + 1,
      chevron: chevron ? { right: chevron.getBoundingClientRect().right, left: chevron.getBoundingClientRect().left } : null, button: button ? button.getBoundingClientRect().right : null, li: { left: box.left, right: box.right },
    };
  });
  assert.match(facts.text, /оплачено до 31\.07/, "the key words are all there");
  assert.equal(facts.ellipsis, false);
  assert.equal(facts.cutWidth || facts.cutHeight, false, "nothing is clipped");
  assert.ok(facts.chevron && facts.chevron.left >= facts.button && facts.chevron.right <= facts.li.right, `the arrow stands right of the button inside the card ${JSON.stringify(facts)}`);
  const probe = await run.page.evaluate(layoutProbe, '[data-testid="payments-phone-list"]');
  assert.deepEqual(probe.bad.filter((line) => !line.startsWith("p[money-row-name]")), [], "the name keeps its one line with «…» (it is not this point)");
  assert.equal(probe.scroll, 0);
  await run.page.close();
});

for (const width of [1280, 375]) {
  test(`п.9 (${width}): the archive of a group says the instruction ONCE (in the warning, not again over the button); the action of a student's row is «Ученика в архив», the button of the window stays «В архив»`, async () => {
    const run = await mount(ctx, F.baseServer((request) => (request.path === "/auth/org/groups/gz/archive-impact" ? { json: archiveImpact() } : null), F.SHORT), "group-archive", OWNER, { moneyAvailable: true, groupsBasePath: "/owner/groups" }, width);
    const block = run.page.locator('[data-testid="archive-students-stop"]');
    await block.waitFor();
    assert.equal(await block.getByRole("button", { name: "Ученика в архив" }).count(), 2);
    assert.equal(await block.getByRole("button", { name: "В архив", exact: true }).count(), 0, "no second meaning of «В архив» in the list");
    assert.equal(await run.page.locator('[role="dialog"] [data-modal-part="footer"]').getByRole("button", { name: "В архив", exact: true }).count(), 1);
    assert.equal(await run.page.locator("#group-archive-why").count(), 0, "no line over the button");
    const text = plain(await run.page.locator('[role="dialog"]').innerText());
    assert.equal((text.match(/отправьте в архив/g) ?? []).length, 1, "the instruction is said once");
    assert.equal(await run.page.locator('[role="dialog"] [data-modal-part="footer"] button[form], [role="dialog"] [data-modal-part="footer"] [data-testid="group-archive-submit"]').first().isDisabled(), true, "the button stays off");
    await run.page.close();
  });
}

test("п.10 (Б11.39 Э3 / Э7'): the pause that has not begun - «Снять паузу» is secondary, the confirmation stands in the card (the card squeezed into a row, ONE sentence, a reason, «Снять паузу» + «Назад»); the heading «Отменить будущую паузу» is gone; the one main button of the window is not blue here (there is none: «Закрыть»)", async () => {
  const future = pauseRow("pf", day(10), day(13));
  const answer = F.baseServer((request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m-a/pauses") return { json: [future] };
    if (request.method === "POST" && request.path === "/auth/org/pauses/pf/void") return { json: { pause: future, impact: null, row: null, dry_run: true, other_groups_text: null } };
    return null;
  });
  const run = await mount(ctx, answer, "pause", OWNER, { moneyAvailable: true });
  await run.page.waitForSelector('section[aria-label="Паузы ученика"]');
  assert.equal(await run.page.locator('[data-testid="pause-cancel-title"]').count(), 0, "the heading «Отменить будущую паузу» is gone for good");
  await run.page.getByRole("button", { name: "Снять паузу", exact: true }).click();
  await run.page.locator("#pause-act-reason").waitFor();
  assert.equal(await run.page.locator('[data-testid="pause-cancel-title"]').count(), 0);
  const block = run.page.locator('[data-testid="pause-card-acting"]');
  assert.match(plain(await block.locator('[data-testid="pause-summary"]').innerText()), /^Пауза запланирована · с \d\d\.\d\d по \d\d\.\d\d$/, "the card is squeezed into one row");
  assert.equal(plain(await block.locator('[data-testid="pause-act-sentence"]').innerText()), "Пауза не начнётся, её дни войдут в стоимость.");
  const text = plain(await block.innerText());
  assert.ok(!text.includes("останутся платными") && !text.includes("Не надо") && !text.includes("придётся оплатить"), text);
  assert.equal(await block.getByRole("button", { name: "Назад", exact: true }).count(), 1);
  const colour = async (locator) => locator.evaluate((el) => getComputedStyle(el).backgroundColor);
  const confirm = block.getByRole("button", { name: "Снять паузу", exact: true });
  assert.equal(await colour(confirm), "rgb(255, 255, 255)", "it is the outline button");
  assert.equal(await run.page.locator('button[form="pause-form"]').count(), 0, "no form of a new pause, no blue main button under a confirmation");
  assert.equal(plain(await run.page.locator('[role="dialog"] [data-modal-part="footer"] [data-testid="confirm-cancel"]').innerText()), "Закрыть", "the only way out is «Закрыть»");
  await run.page.close();
});

test("п.11 (1280): «Внести оплату» of a debtor has ONE look in «Оплатах» and in the card of a group - the outline of the design system (frames 1-4, 23), never the blue one", async () => {
  const look = (locator) => locator.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, border: s.borderTopColor, colour: s.color, height: Math.round(el.getBoundingClientRect().height), radius: s.borderTopLeftRadius, weight: s.fontWeight, size: s.fontSize }; });
  const centre = await paydue(1280, paymentsServer(), ["payments", OWNER, { moneyAvailable: true, search: "bucket=debtors" }]);
  const centreButton = centre.page.getByRole("button", { name: "Внести оплату" }).first();
  await centreButton.waitFor({ timeout: 9000 });
  const a = await look(centreButton);
  await centre.page.close();
  const group = await paydue(1280, groupServer(X.groupStatus), ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }]);
  const debtorRow = group.page.locator('[data-testid="group-payment-row"]', { hasText: "Долг" }).first();
  await debtorRow.waitFor({ timeout: 9000 });
  const b = await look(debtorRow.getByRole("button", { name: "Внести оплату" }));
  await group.page.close();
  assert.deepEqual(b, a);
  assert.equal(a.bg, "rgb(255, 255, 255)");
});
