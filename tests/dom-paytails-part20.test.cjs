// PAY-TAILS Б11.50 (part 20, screens part 1): the window «Пауза ученика» in a real browser - Э3 «долга нет», Э4 the closed month in the server's words, Э5 one day, Э6 the chunk «долг N сум» does not break on a phone.
// (Э1 «Причина» at once lives in dom-paytails-part16.test.cjs, Э7 in dom-paytails-part20-former.test.cjs.)  The answers are the REAL ones of the server (tests/fixtures/paytails/part16); the page clock stands on the day of the world.
const assert = require("node:assert/strict");
const nodeTest = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { setup, plain, mount, OWNER, ADMIN } = require("./helpers/money2-w2.cjs");
const { contract, pauseOf, pauseServer, setWorld, currentWorld, FIXTURE_DAY, day, dmy, dm } = require("./helpers/paytails-part16.cjs");

const test = (name, fn) => nodeTest(name, async (t) => { setWorld(FIXTURE_DAY); return fn(t); });
const ctx = setup(nodeTest);
const open = (server, props = {}, width = 1280, user = OWNER) => mount(ctx, server, "pause", user, { moneyAvailable: true, ...props }, width, { today: currentWorld() });
const askedFor = (run, method, pattern, dry) => run.calls.filter((call) => call.method === method && pattern.test(call.path) && (dry === undefined || /dry_run=true/.test(call.query) === dry));
const RUNNING = () => pauseOf("pr1", day(-7), day(6), { reason: "уехал к родственникам" });
const withImpact = (answer, impact) => ({ ...answer, impact: { ...answer.impact, ...impact } });

// ── Э3: «долга нет» instead of «0» ─────────────────────────────────────────────────────────────────────

const ZERO_CASES = [
  ["no debt before", { debt_before: 0, debt_after: 200000 }, "Было: долга нет → станет: долг 200 000 сум"],
  ["no debt after", { debt_before: 300000, debt_after: 0 }, "Было: долг 300 000 сум → станет: долга нет"],
  ["an advance after (the form with an advance stays as it was)", { debt_before: 100000, debt_after: 0, advance_before: 0, advance_after: 50000 }, "Было: долг 100 000 сум → станет: аванс 50 000 сум"],
  ["an advance before, no debt after", { debt_before: 0, debt_after: 0, advance_before: 50000, advance_after: 0 }, "Было: аванс 50 000 сум → станет: долга нет"],
];
for (const [name, impact, want] of ZERO_CASES) {
  test(`Э3 «Было → станет» (${name}): «${want}», never «0»`, async () => {
    const answer = withImpact(contract("pause_probe_end_today"), impact);
    const run = await open(pauseServer({ pauses: [RUNNING()], end: (request) => ({ json: { ...answer, dry_run: /dry_run=true/.test(request.query) } }) }));
    await run.page.getByRole("button", { name: "Закончить сегодня" }).click();
    await run.page.waitForSelector('[data-testid="pause-act-calc"]');
    const text = plain(await run.page.locator('[data-testid="pause-act-calc"]').innerText());
    assert.ok(text.includes(want), text);
    assert.ok(!/(→|станет:) 0(\s|$)/.test(text) && !/Было: 0/.test(text), `no bare zero: ${text}`);
    await run.page.close();
  });
}

// ── Э6: the chunk «долг N сум» / «аванс N сум» is not torn on a phone ──────────────────────────────────────

test("Э6 (375) «Было: долг … → станет: долг …» wraps between the chunks, never inside «долг N сум» / «аванс N сум»", async () => {
  for (const [name, impact] of [["debt", { debt_before: 1200000, debt_after: 964000 }], ["advance", { debt_before: 1200000, debt_after: 0, advance_before: 0, advance_after: 1450000 }]]) {
    const answer = withImpact(contract("pause_probe_create_two_months_begun"), impact);
    const run = await open(pauseServer({ pauses: [], create: (request) => ({ json: { ...answer, dry_run: /dry_run=true/.test(request.query) } }) }), {}, 375);
    await run.page.waitForSelector("#pause-first");
    await run.page.fill("#pause-first", dmy(answer.pause.first_day));
    await run.page.fill("#pause-last", dmy(answer.pause.last_day));
    await run.page.waitForSelector('[data-testid="pause-money"]');
    const probe = await run.page.evaluate(() => {
      const holder = [...document.querySelectorAll('[data-testid="pause-calc"] p, [data-testid="pause-calc"] div')].find((node) => node.children.length === 0 && /Было:/.test(node.textContent || ""));
      if (!holder) return null;
      const text = holder.firstChild;
      const full = text.textContent;
      const lines = (from, to) => { const range = document.createRange(); range.setStart(text, from); range.setEnd(text, to); return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size; };
      const chunks = [...full.matchAll(/(?:долг|аванс)[\s ][\d\s ]+[\s ]сум/g)].map((m) => ({ chunk: m[0], lines: lines(m.index, m.index + m[0].length) }));
      const one = parseFloat(getComputedStyle(holder).lineHeight) || 20;
      return { chunks, height: holder.getBoundingClientRect().height, one };
    });
    assert.ok(probe, `${name}: the line «Было …» is on the screen`);
    assert.ok(probe.chunks.length >= 1, `${name}: the chunks are found`);
    assert.ok(probe.height > probe.one * 1.5, `${name}: the sentence wraps on a phone (so the check bites): ${probe.height} vs ${probe.one}`);
    for (const one of probe.chunks) assert.equal(one.lines, 1, `${name}: «${one.chunk}» stays on one line`);
    await run.page.close();
  }
});

// ── Э5: ONE day ─────────────────────────────────────────────────────────────────────────────────────────

for (const width of [1280, 375]) {
  test(`Э5 (${width}) a pause of ONE day: «${dm("2026-11-24")} · 1 день» in the card and in the squeezed row (no «с … по …»), the same in the toast «Пауза поставлена: …»`, async () => {
    const one = pauseOf("p1", day(0), day(0), { reason: "болел" });
    const run = await open(pauseServer({ pauses: [one], end: (request) => ({ json: { ...contract("pause_probe_end_today"), dry_run: /dry_run=true/.test(request.query) } }) }), {}, width);
    await run.page.waitForSelector('[data-testid="pause-card"]');
    assert.equal(plain(await run.page.locator('[data-testid="pause-facts"]').innerText()), `${dm(day(0))} · 1 день`);
    assert.ok(!/ по /.test(plain(await run.page.locator('[data-testid="pause-card"]').innerText())), "no «с … по …» for one day");
    // began today: it cannot be ended «yesterday» - the squeezed row is of a pause that began earlier; the toast is of a new one
    await run.page.close();

    const created = contract("pause_probe_create_week");
    const pause = { ...created.pause, first_day: day(0), last_day: day(0), days: 1 };
    const server = pauseServer({ pauses: [], create: (request) => ({ json: { ...created, pause, dry_run: /dry_run=true/.test(request.query) } }) });
    const second = await open(server, {}, width);
    await second.page.waitForSelector("#pause-first");
    await second.page.fill("#pause-first", dmy(day(0)));
    await second.page.fill("#pause-last", dmy(day(0)));
    await second.page.waitForSelector('[data-testid="pause-money"]');
    await second.page.locator('button[form="pause-form"]').click();
    await second.page.waitForFunction(() => window.__log.some((line) => line.startsWith("changed:Пауза поставлена")));
    const line = await second.page.evaluate(() => window.__log.find((entry) => entry.startsWith("changed:Пауза поставлена")));
    assert.ok(plain(line).startsWith(`changed:Пауза поставлена: ${dm(day(0))} · 1 день`) && !/ по /.test(plain(line)), plain(line));   // the reason of the pause follows the count
    await second.page.close();
  });
}

test("Э5 the squeezed row of a one-day pause that began earlier is «Сейчас на паузе · ДД.ММ» (the confirmation of the ending)", async () => {
  // a one-day pause is over the same day it begins: the only one a card can hold today is the pause of today, which cannot be ended «yesterday» - so the row is read from a pause with the cards of the past (a taking off)
  const one = pauseOf("p1", day(0), day(0), { reason: "болел" });
  const run = await open(pauseServer({ pauses: [one], void: (request) => ({ json: { ...contract("pause_probe_void_running"), dry_run: /dry_run=true/.test(request.query) } }) }));
  await run.page.getByRole("button", { name: "Снять паузу целиком" }).click();
  await run.page.waitForSelector('[data-testid="pause-card-acting"]');
  assert.equal(plain(await run.page.locator('[data-testid="pause-card-acting"] [data-testid="pause-summary"]').innerText()), `Сейчас на паузе · ${dm(day(0))}`);
  await run.page.close();
});

// ── Э4: the closed month - the sentence of the server WHOLE ───────────────────────────────────────────────

// the sentence of the server for PAUSE_LOCKED (the frozen contract tests/fixtures/logicA/logicA_contract.json)
const LOCKED_TEXT = "Месяц закрыт: паузу за эти дни не изменить, пока месяц не переоткрыт. Переоткрыть его может владелец или администратор с доступом к деньгам";
test("Э4 the closed month in the window of a pause: the sentence of the server stands WHOLE (with «это делает владелец или администратор с доступом к деньгам»), in the form and in the confirmation", async () => {
  const locked = { status: 422, json: { detail: { code: "PAUSE_LOCKED", message: LOCKED_TEXT, month: "2026-11", teacherId: "t1", teacherName: "Эргашев К.", closedOn: "2026-11-23" } } };
  const form = await open(pauseServer({ pauses: [], create: locked }));
  await form.page.waitForSelector("#pause-first");
  await form.page.fill("#pause-first", dmy(day(0)));
  await form.page.fill("#pause-last", dmy(day(3)));
  await form.page.waitForSelector('[data-testid="pause-calc"] [data-testid="period-closed-head"]');
  assert.equal(plain(await form.page.locator('[data-testid="pause-calc"] [data-testid="period-closed-head"]').innerText()), LOCKED_TEXT);
  await form.page.close();

  const card = await open(pauseServer({ pauses: [RUNNING()], void: locked }));
  await card.page.getByRole("button", { name: "Снять паузу целиком" }).click();
  await card.page.waitForSelector('[data-testid="pause-card-acting"] [data-testid="period-closed-head"]');
  assert.equal(plain(await card.page.locator('[data-testid="pause-card-acting"] [data-testid="period-closed-head"]').innerText()), LOCKED_TEXT);
  assert.equal(await card.page.locator('[data-testid="pause-act-confirm"]').isDisabled(), true);
  await card.page.close();
});

test("Э4 a lesson's closed month keeps its own words (the screen builds «Октябрь у … закрыт … Чтобы изменить урок, переоткройте месяц») - only the pause shows the server's sentence", async () => {
  const lib = require("typescript");
  require.extensions[".ts"] = require.extensions[".ts"] || ((mod, filename) => { mod._compile(lib.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: lib.ModuleKind.CommonJS, target: lib.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename); });
  const C = require(path.join(__dirname, "..", "src", "lib", "closed-period.ts"));
  const info = { month: "2026-10", teacherId: "t1", teacherName: "Эргашев К.", closedOn: "2026-11-20", message: "Месяц закрыт (зарплата сохранена). Чтобы изменить урок, переоткройте месяц" };
  const text = C.periodClosedText(info, { canReopen: true, purpose: "lesson", today: "2026-11-24" });
  assert.match(text.head, /^Октябрь у .* закрыт \(зарплата сохранена 20\.11\.2026\)\.$/);
  assert.equal(text.advice, "Чтобы изменить урок, переоткройте месяц.");
  assert.equal(C.periodClosedText(info, { canReopen: false, purpose: "pause", today: "2026-11-24" }).head, info.message, "a pause: the server's sentence");
});
