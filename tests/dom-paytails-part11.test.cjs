// PAY-TAILS Б11.21, the screens of the walk of stage (part В), in a real browser (headless Chromium, the CSS of the project): «использовано N сум» of a forgiveness (п.1), the refusal of a price (п.2), the label of the reason of a pause (п.3),
// «—» instead of «0» of a forgiveness and no empty «Остаток» caption on a phone (п.5, п.7), the band of the left and the header after a payment (п.6), the phone (п.7), the calm look of the archive of a group (п.8).
// The 409 `BALANCE_CHANGED` of п.4 is in dom-paytails-part2 / money2-w1-effects; the console (п.9) is in dom-paytails-part11-console.  PNGs: node tests/dom/paytails-part11-shots.cjs <dir>.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, F, OWNER } = require("./helpers/money2-w2.cjs");
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
    assert.equal(plain(await run.page.locator('[data-testid="decision-used-detail"]').innerText()), "использовано 94 000 сум");
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
    assert.equal(plain(await run.page.locator('[data-testid="price-blocked"] p').first().innerText()), FORGIVENESS, "the server's words as they came, with the full stop");
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
  await run.page.getByRole("button", { name: "Отменить паузу" }).first().click();
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
