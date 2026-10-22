// INCOME-2 («Поступления» v2, ROADMAP #123): the front reads the frozen contract (tests/fixtures/income2 = income2_fixtures of the
// backend) and words it: the period switch, the sentence and four cards, one line of «where the money went», the chart, the till,
// the journal with its drawer, the collection of the groups, the empty / error states, the routes and the link to «Должники».
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/income2", `${name}.json`), "utf8"));
const V = require(path.join(root, "src/lib/payments-income-v2.ts"));
const plain = (text) => text.replace(/ /g, " ");
const money = (n) => plain(require(path.join(root, "src/lib/payments.ts")).formatMoney(n));

const TODAY = "2026-10-21";
const overview = (name) => V.normalizeOverview(fixture(name));
const journal = (name) => V.normalizeJournal(fixture(name));

function renderer() {
  require.extensions[".tsx"] = (mod, filename) => {
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
  };
  const Module = require("node:module");
  if (!Module.__pay2Alias) {
    const resolveFilename = Module._resolveFilename;
    Module._resolveFilename = function (request, ...rest) {
      return resolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...rest);
    };
    Module.__pay2Alias = true;
  }
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  return {
    React,
    text: (element) => plain(renderToStaticMarkup(element).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")),
    html: (element) => renderToStaticMarkup(element),
  };
}
const parts = () => ({
  ...renderer(),
  P: require(path.join(root, "src/components/payments/income-parts.tsx")),
  J: require(path.join(root, "src/components/payments/income-journal.tsx")),
  C: require(path.join(root, "src/components/payments/income-collection.tsx")),
});

// ── the contract ────────────────────────────────────────────────────────────────────────────────

test("the contract: three operations, each with a helper of the api; every fixture reads without NaN or a missing list", () => {
  const contract = fixture("_contract");
  const operations = Object.entries(contract.paths).flatMap(([route, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${route}`));
  assert.deepEqual(operations.sort(), ["GET /org/payments/income", "GET /org/payments/journal", "GET /org/payments/journal/export"]);
  const api = read("src/lib/api.ts");
  assert.match(api, /payments\/income\?\$\{params\.toString\(\)\}/);
  assert.match(api, /payments\/journal\?\$\{journalParams\(q\)\.toString\(\)\}/);
  assert.match(api, /payments\/journal\/export\?\$\{params\.toString\(\)\}/);
  assert.match(api, /params\.set\("format", "xlsx"\)/);
  for (const name of fs.readdirSync(path.join(__dirname, "fixtures/income2")).map((file) => file.replace(/\.json$/, "")).filter((n) => /^[IJ]\d/.test(n))) {
    if (name.startsWith("I")) {
      const o = overview(name);
      assert.ok(Array.isArray(o.series) && Array.isArray(o.by_method) && Array.isArray(o.checks), name);
      assert.ok(Number.isInteger(o.current.received) && Number.isInteger(o.position.debt_total), name);
      assert.ok(!JSON.stringify(o).includes("NaN"), name);
    } else {
      const j = journal(name);
      assert.ok(Array.isArray(j.rows) && Array.isArray(j.authors) && j.rows.every((r) => Array.isArray(r.allocations)), name);
    }
  }
  // a reader that gets less than the contract promises still gives whole numbers and lists
  const bare = V.normalizeOverview({});
  assert.deepEqual([bare.current.received, bare.position.students_with_debt, bare.series.length, bare.ok], [0, 0, 0, true]);
  assert.equal(V.normalizeJournal({}).rows.length, 0);
});

test("identities of the fixtures hold in what the screen shows: Σ methods = Σ days = received", () => {
  for (const name of ["I01_income_month_october", "I03_income_week", "I04_income_september_closed", "I05_income_group_filter"]) {
    const o = overview(name);
    const methods = o.by_method.reduce((acc, m) => acc + m.amount, 0);
    const days = o.series.reduce((acc, d) => acc + d.received, 0);
    assert.equal(methods, o.current.received, name);
    assert.equal(days, o.current.received, name);
    assert.equal(o.ok, true, name);
    assert.equal(V.checkView(o).text, "Сходится", name);
  }
});

// ── period switch ───────────────────────────────────────────────────────────────────────────────

test("period: a month (the arrows step by month) and a custom range (the arrows step by its length); no day / week switch; the forward arrow stops at today", () => {
  assert.equal(V.PERIOD_TABS, undefined, "no tab strip");
  assert.equal(V.switchKind, undefined);
  assert.deepEqual(V.periodOf("day", TODAY), { kind: "day", from: TODAY, to: TODAY }); // only the till of today asks for a day
  assert.deepEqual(V.periodOf("month", TODAY), { kind: "month", from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(V.periodOf("custom", TODAY, { kind: "month", from: "2026-10-12", to: "2026-10-18" }), { kind: "custom", from: "2026-10-12", to: "2026-10-18" });

  assert.deepEqual(V.stepPeriod(V.periodOf("month", TODAY), -1), { kind: "month", from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(V.stepPeriod(V.periodOf("month", "2026-01-15"), -1), { kind: "month", from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(V.stepPeriod(V.periodOf("month", "2026-12-15"), 1), { kind: "month", from: "2027-01-01", to: "2027-01-31" });
  assert.deepEqual(V.stepPeriod({ kind: "custom", from: "2026-10-10", to: "2026-10-19" }, -1), { kind: "custom", from: "2026-09-30", to: "2026-10-09" });

  assert.equal(V.canStepForward(V.periodOf("month", TODAY), TODAY), false); // this month holds today
  assert.equal(V.canStepForward(V.periodOf("month", "2026-09-10"), TODAY), true);
  assert.equal(V.canStepForward({ kind: "custom", from: "2026-10-12", to: "2026-10-18" }, TODAY), true);

  // the ✕ of the chip: back to the month of the end of the range, never after today
  assert.deepEqual(V.monthOfPeriod({ kind: "custom", from: "2026-09-20", to: "2026-10-05" }, TODAY), V.periodOf("month", "2026-10-05"));
  assert.deepEqual(V.monthOfPeriod({ kind: "custom", from: "2026-11-01", to: "2026-12-05" }, TODAY), V.periodOf("month", TODAY));
  // the chip «12.10 – 18.10» (the year only when the range leaves the year of today)
  assert.equal(V.rangeChipText({ from: "2026-10-12", to: "2026-10-18" }, TODAY), "12.10 – 18.10");
  assert.equal(V.rangeChipText({ from: "2025-12-20", to: "2026-01-05" }, TODAY), "20.12.2025 – 05.01.2026");
  assert.equal(V.isCurrentMonth(V.periodOf("month", TODAY), TODAY), true);
  assert.equal(V.isCurrentMonth(V.periodOf("month", "2026-09-10"), TODAY), false);
  assert.equal(V.isCurrentMonth({ kind: "custom", from: "2026-10-01", to: "2026-10-21" }, TODAY), false, "a custom range is not «the month»");

  assert.equal(V.validatePeriod({ kind: "custom", from: "2026-10-10", to: "2026-10-09" }), "Конец периода раньше начала");
  assert.equal(V.validatePeriod({ kind: "custom", from: "2025-01-01", to: "2026-10-09" }), "Период не длиннее года");
  assert.equal(V.validatePeriod({ kind: "custom", from: "", to: "2026-10-09" }), "Укажите даты периода");
  assert.equal(V.validatePeriod({ kind: "custom", from: "2025-10-09", to: "2026-10-09" }), null); // 366 days
});

test("the title between the arrows: «Октябрь 2026 г.»; the dead day / week titles are gone", () => {
  assert.equal(V.periodTitle(V.periodOf("month", TODAY)), "Октябрь 2026 г.");
  assert.equal(V.periodTitle({ kind: "custom", from: "2026-10-01", to: "2026-10-21" }), "01.10.2026 — 21.10.2026");
  assert.equal(V.mondayOf, undefined);
});

test("queries: the kind is sent to the server; filters only when set; the journal of a clicked day; export has no page", () => {
  const month = V.periodOf("month", TODAY);
  assert.deepEqual(V.overviewQuery(month, V.NO_FILTERS), { from: "2026-10-01", to: "2026-10-31", period: "month" });
  // the overview never takes the method (the donut shows every method); the method narrows only the journal
  assert.deepEqual(V.overviewQuery(month, { method: "cash", groupId: "g1", teacherId: "t1" }), { from: "2026-10-01", to: "2026-10-31", period: "month", group_id: "g1", teacher_id: "t1" });
  assert.deepEqual(V.overviewQuery(V.periodOf("day", TODAY), V.NO_FILTERS), { from: TODAY, to: TODAY, period: "day" }); // the till of today
  assert.equal(V.overviewQuery({ kind: "custom", from: "2026-10-01", to: "2026-10-09" }, V.NO_FILTERS).period, "custom");

  assert.deepEqual(V.journalQuery(month, null, V.NO_FILTERS, V.NO_JOURNAL_EXTRAS), { from: "2026-10-01", to: "2026-10-31", page: 1, size: 25 });
  const day = { from: "2026-10-07", to: "2026-10-07", label: "7 октября" };
  const q = V.journalQuery(month, day, { method: "cash", groupId: "", teacherId: "t1" }, { q: "  Алиев ", createdBy: "u1" }, 2);
  assert.deepEqual(q, { from: "2026-10-07", to: "2026-10-07", page: 2, size: 25, method: "cash", teacher_id: "t1", created_by: "u1", q: "Алиев" });
  assert.deepEqual(V.exportQuery(q), { from: "2026-10-07", to: "2026-10-07", method: "cash", teacher_id: "t1", created_by: "u1", q: "Алиев" });
});

// ── the sentence and the four cards ─────────────────────────────────────────────────────────────

test("card «Поступило»: the sum, ▲/▼ with the server's words, green for up and red for down, the number of payments", () => {
  const up = V.receivedCard(overview("I01_income_month_october"));
  assert.equal(plain(up.amount), "3 450 000 сум");
  assert.deepEqual([up.delta.arrow, up.delta.text, up.delta.tone, up.countText], ["▲", "130% к 1–21 сентября", "up", "7 оплат"]);
  const down = V.receivedCard(overview("I03_income_week"));
  assert.deepEqual([down.delta.arrow, down.delta.text, down.delta.tone, down.countText], ["▼", "69% к прошлой неделе", "down", "2 оплаты"]);
  assert.equal(V.DELTA_CLASS.up, "text-emerald-700");
  assert.equal(V.DELTA_CLASS.down, "text-rose-700");
  // nothing to compare with: a quiet word, no arrow, no invented percent
  const none = V.receivedCard(overview("I04_income_september_closed"));
  assert.deepEqual([none.delta.arrow, none.delta.text, none.delta.tone], ["", "В августе оплат не было", "none"]);
  assert.equal(V.receivedCard(overview("I02_income_day_today_cash")).delta.text, "Вчера оплат не было");
  // the label of the comparison: declined only where it is safe, never guessed
  assert.equal(V.noPaymentsBefore("вчера"), "Вчера оплат не было");
  assert.equal(V.noPaymentsBefore("прошлая неделя"), "На прошлой неделе оплат не было");
  assert.equal(V.noPaymentsBefore("сентябрь"), "В сентябре оплат не было");
  assert.equal(V.noPaymentsBefore("декабрь 2025"), "В декабре 2025 оплат не было");
  assert.equal(V.noPaymentsBefore("март"), "В марте оплат не было");
  assert.equal(V.noPaymentsBefore("5–11 окт."), "5–11 окт.: оплат не было");
  assert.equal(V.noPaymentsBefore("1–21 сент."), "1–21 сент.: оплат не было");
  assert.equal(V.noPaymentsBefore("14 окт."), "14 окт.: оплат не было");
  assert.equal(V.noPaymentsBefore(""), "");
  // a running period is compared like for like and says so quietly; a closed one does not
  assert.equal(V.receivedCard(overview("I01_income_month_october")).hint, "сравнение с 1–21 сент.");
  assert.equal(V.receivedCard(overview("I03_income_week")).hint, "");
  assert.equal(V.receivedCard(overview("I02_income_day_today_cash")).hint, "");
  assert.equal(overview("I03_income_week").previous_label, "5–11 окт.");
  // the same sum: grey, no arrow
  const same = { ...overview("I01_income_month_october"), delta_direction: "same", delta_text: "0% к 1–21 сентября" };
  assert.deepEqual([V.deltaView(same).arrow, V.deltaView(same).tone], ["", "same"]);
  assert.equal(V.paymentsCountText(1), "1 оплата");
  assert.equal(V.paymentsCountText(0), "оплат не было");
  assert.equal(V.paymentsCountText(21), "21 оплата");
});

test("card «Собрано за месяц»: X из Y (Z%) with a bar, month mode only; the numbers are the server's", () => {
  const c = V.collectedCard(overview("I01_income_month_october"));
  assert.deepEqual([plain(c.amount), plain(c.caption), c.pct], ["1 900 000 сум", "из 2 500 000 сум · 76%", 76]);
  assert.equal(V.collectedCard(overview("I03_income_week")), null);
  assert.equal(V.collectedCard(overview("I02_income_day_today_cash")), null);
  assert.equal(V.collectedCard(overview("I04_income_september_closed")).pct, 100);
  // a month with nothing charged says so in words and draws no bar
  const o = overview("I01_income_month_october");
  const empty = V.collectedCard({ ...o, collection: { ...o.collection, total: { ...o.collection.total, charged: 0, paid: 0, pct: null } } });
  assert.deepEqual([empty.caption, empty.pct], ["За этот месяц ничего не начислено", null]);
});

test("cards «Долг на сегодня» and «Аванс»: the sum and the students; a quiet word when there is none; the link to «Должники»", () => {
  const o = overview("I01_income_month_october");
  const debt = V.debtCard(o);
  assert.deepEqual([plain(debt.amount), debt.caption, debt.none], ["500 000 сум", "3 ученика", false]);
  const advance = V.advanceCard(o);
  assert.deepEqual([plain(advance.amount), advance.caption], ["450 000 сум", "2 ученика оплатили вперёд"]);
  // the verb agrees with the number: «1 ученик оплатил вперёд», «21 ученик оплатил», «5 учеников оплатили»
  for (const [n, caption] of [[1, "1 ученик оплатил вперёд"], [21, "21 ученик оплатил вперёд"], [3, "3 ученика оплатили вперёд"], [5, "5 учеников оплатили вперёд"]]) {
    assert.equal(V.advanceCard({ ...o, position: { ...o.position, advance_total: 100000, students_with_advance: n } }).caption, caption);
  }
  const clean = { ...o, position: { ...o.position, debt_total: 0, students_with_debt: 0, advance_total: 0, students_with_advance: 0 } };
  assert.deepEqual([V.debtCard(clean).amount, V.debtCard(clean).none, V.advanceCard(clean).amount], ["Долгов нет", true, "Авансов нет"]);
  assert.equal(V.debtorsHref("/owner/payments/"), "/owner/payments?bucket=debt");
  assert.equal(V.debtorsHref("/owner/payments", { groupId: "g 1" }), "/owner/payments?bucket=debt&group_id=g+1");
  assert.equal(V.debtorsHref("/admin/payments", { teacherId: "t1" }), "/admin/payments?bucket=debt&teacher_id=t1");
  assert.equal(V.debtorsHref("/admin/payments", { groupId: "g1", teacherId: "t1" }), "/admin/payments?bucket=debt&group_id=g1"); // the group is narrower
});

// ── «Куда ушли деньги» ──────────────────────────────────────────────────────────────────────────

test("the line «Куда ушли деньги»: only the non-zero parts, shares that add up to 100, «Сходится»", () => {
  const parts_ = V.flowParts(overview("I01_income_month_october"));
  assert.deepEqual(parts_.map((p) => [p.key, p.amount, p.percent]), [["to_past_debt", 1000000, 29], ["to_current", 1900000, 55], ["to_advance", 450000, 13], ["refunded", 100000, 3]]);
  assert.equal(parts_.reduce((acc, p) => acc + p.percent, 0), 100);
  assert.deepEqual(V.flowParts(overview("I02_income_day_today_cash")).map((p) => p.key), ["to_current"]); // zero parts are not drawn
  assert.deepEqual(V.sharesOf([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(V.sharesOf([0, 0]), [0, 0]);
  assert.equal(V.sharesOf([333, 333, 334]).reduce((a, b) => a + b, 0), 100);
  assert.equal(plain(V.writtenOffText(overview("I01_income_month_october"))), "Прощено долгов: 100 000 сум");
  assert.equal(V.writtenOffText(overview("I03_income_week")), ""); // nothing is said about zero
  const transferred = { ...overview("I03_income_week"), current: { ...overview("I03_income_week").current, transferred: 50000 } };
  assert.ok(V.flowParts(transferred).some((p) => p.key === "transferred" && p.label === "переведено в другие группы"));
});

test("«Сходится»: the server's checks, and a gap is said in money when they do not add up", () => {
  assert.deepEqual([V.checkView(overview("I01_income_month_october")).ok, V.checkView(overview("I01_income_month_october")).text], [true, "Сходится"]);
  const o = overview("I01_income_month_october");
  const broken = { ...o, ok: false, checks: o.checks.map((c, i) => (i === 1 ? { ...c, right: c.right - 500, diff: 500 } : c)) };
  const view = V.checkView(broken);
  assert.equal(plain(view.text), "Не сходится: расхождение 500 сум");
  assert.deepEqual(view.lines.filter((l) => !l.ok).map((l) => l.label), ["Поступило = сумма по способам оплаты"]);
  assert.equal(V.checkView({ ok: false, checks: [] }).text, "Не сходится");
});

// ── the chart ───────────────────────────────────────────────────────────────────────────────────

test("chart: a bar per day with the sum and the count; the tallest is 100; a click range only for a day with payments; days after today are faint", () => {
  const o = overview("I01_income_month_october");
  assert.equal(V.showChart(o), true);
  const bars = V.chartBars(o, TODAY);
  assert.equal(bars.length, 31);
  const oct7 = bars.find((b) => b.bucket === "2026-10-07");
  assert.deepEqual([oct7.height, oct7.label, oct7.title, plain(oct7.detail), oct7.range], [100, "7", "7 октября, ср", "1 250 000 сум · 1 оплата", { from: "2026-10-07", to: "2026-10-07", label: "7 октября" }]);
  assert.equal(plain(bars.find((b) => b.bucket === "2026-10-21").detail), "250 000 сум · 2 оплаты");
  const quiet = bars.find((b) => b.bucket === "2026-10-01");
  assert.deepEqual([quiet.height, quiet.range, quiet.detail], [0, null, "оплат не было"]);
  assert.ok(bars.find((b) => b.bucket === "2026-10-12").height >= 4); // a small sum is never invisible
  assert.deepEqual([bars.find((b) => b.bucket === "2026-10-22").future, bars.find((b) => b.bucket === "2026-10-21").future], [true, false]);
  // a week reads «пн 12»; a day has no chart at all
  const week = V.chartBars(overview("I03_income_week"), TODAY);
  assert.deepEqual(week.map((b) => b.label), ["пн 12", "вт 13", "ср 14", "чт 15", "пт 16", "сб 17", "вс 18"]);
  assert.equal(V.showChart(overview("I02_income_day_today_cash")), false);
  // a period without money: no chart, the sentence says it
  assert.equal(V.showChart({ ...o, series: o.series.map((d) => ({ ...d, received: 0, count: 0 })) }), false);
  // a long period goes month by month: the click narrows the journal to the month cut by the period
  const long = { ...o, series_by: "month", period: { ...o.period, from: "2026-08-15", to: "2026-10-31" }, series: [{ bucket: "2026-08", received: 100, count: 1 }, { bucket: "2026-09", received: 0, count: 0 }, { bucket: "2026-10", received: 200, count: 2 }] };
  const months = V.chartBars(long, TODAY);
  assert.deepEqual(months.map((b) => b.label), ["авг", "сен", "окт"]);
  assert.deepEqual(months[0].range, { from: "2026-08-15", to: "2026-08-31", label: "Август 2026 г." });
  assert.equal(months[1].range, null);
  assert.equal(V.focusBucket(months[2].range, long), "2026-10");
  assert.equal(V.focusBucket(oct7.range, o), "2026-10-07");
  assert.equal(V.focusBucket(null, o), null);
});

// ── «Чем платили»: the donut ─────────────────────────────────────────────────────────────────

const SPEC_METHODS = [
  { method: "cash", label: "Наличные", amount: 235000, count: 1 },
  { method: "card", label: "Карта", amount: 3000000, count: 8 },
  { method: "bank_transfer", label: "Перевод", amount: 2650000, count: 6 },
  { method: "click", label: "Click", amount: 2000000, count: 4 },
];

test("donut geometry: the angles add up to 360 and are contiguous; a single method is a full ring; a method with no money is not drawn", () => {
  const segments = V.methodSegments(SPEC_METHODS);
  assert.equal(segments.length, 4);
  assert.ok(Math.abs(segments.reduce((acc, seg) => acc + seg.sweep, 0) - 360) < 1e-9, "sweeps add up to 360");
  assert.equal(segments[0].start, 0);
  assert.equal(segments[3].end, 360);
  for (let i = 1; i < segments.length; i++) assert.equal(segments[i].start, segments[i - 1].end, "no gap, no overlap");
  assert.ok(Math.abs(segments[0].sweep - (3000000 * 360) / 7885000) < 1e-9, "the angle is the share of the sum");
  // one method: the whole ring (not an arc whose ends coincide)
  const single = V.methodSegments([{ method: "cash", label: "Наличные", amount: 500000, count: 2 }]);
  assert.equal(single.length, 1);
  assert.equal(single[0].sweep, 360);
  assert.equal(V.isFullRing(single[0]), true);
  assert.equal(V.isFullRing(segments[0]), false);
  // zero (and a refund taking it below zero) is not shown; nothing at all → no donut
  const zero = V.methodSegments([{ method: "cash", label: "Наличные", amount: 100, count: 1 }, { method: "payme", label: "Payme", amount: 0, count: 0 }, { method: "other", label: "Другое", amount: -5, count: 1 }]);
  assert.deepEqual(zero.map((seg) => seg.method), ["cash"]);
  assert.deepEqual(V.methodSegments([{ method: "payme", label: "Payme", amount: 0, count: 0 }]), []);
  assert.deepEqual(V.methodSegments([]), []);
  assert.deepEqual(V.methodSegments(null), []);
  // an arc: a quarter of the ring from twelve o'clock goes to three o'clock; more than half uses the large-arc flag
  assert.equal(V.arcPath(90, 90, 70, 0, 90), "M 90.000 20.000 A 70 70 0 0 1 160.000 90.000");
  assert.match(V.arcPath(90, 90, 70, 0, 200), /A 70 70 0 1 1/);
  // the colours: every known method has its own, «Способ не указан» is slate-400 (darker than the empty track)
  const colors = ["cash", "card", "bank_transfer", "click", "payme", "other", "unknown"].map((key) => V.METHOD_COLOR[key].dot);
  assert.equal(new Set(colors).size, 7);
  assert.deepEqual(colors, ["bg-emerald-500", "bg-blue-600", "bg-violet-500", "bg-amber-400", "bg-cyan-600", "bg-pink-400", "bg-slate-400"]);
});

test("legend: the biggest sum first, shares add up to 100, the centre says the total and the number of payments, the tooltip has the four facts", () => {
  const segments = V.methodSegments(SPEC_METHODS);
  assert.deepEqual(segments.map((seg) => [seg.label, seg.percent, seg.percentText]), [["Карта", 38, "38%"], ["Перевод", 34, "34%"], ["Click", 25, "25%"], ["Наличные", 3, "3%"]]);
  assert.equal(segments.reduce((acc, seg) => acc + seg.percent, 0), 100);
  const total = V.methodsTotal(segments);
  assert.equal(plain(total.amountText), "7 885 000 сум");
  assert.equal(plain(total.countText), "19 оплат");
  const cash = segments.find((seg) => seg.method === "cash");
  assert.equal(plain(V.methodTooltip(cash)), "Наличные · 235 000 сум · 1 оплата · 3%");
  assert.equal(plain(V.methodTooltip(segments[0])), "Карта · 3 000 000 сум · 8 оплат · 38%");
  // a method under one percent never reads «0%»
  const tiny = V.methodSegments([{ method: "cash", label: "Наличные", amount: 1, count: 1 }, { method: "card", label: "Карта", amount: 1000000, count: 9 }]);
  assert.equal(tiny.find((seg) => seg.method === "cash").percentText, "<1%");
  assert.equal(tiny.reduce((acc, seg) => acc + seg.percent, 0), 100);
  // ties keep the order of the methods of the form; a label missing from the server says «Способ не указан»
  assert.deepEqual(V.methodSegments([{ method: "card", label: "Карта", amount: 5, count: 1 }, { method: "cash", label: "Наличные", amount: 5, count: 1 }]).map((seg) => seg.method), ["cash", "card"]);
  assert.equal(V.methodSegments([{ method: "unknown", label: "", amount: 5, count: 1 }])[0].label, "Не указан");
  assert.equal(V.methodChipLabel("cash", SPEC_METHODS), "Наличные");
  assert.equal(V.methodChipLabel("payme", []), "Payme");
  assert.equal(V.methodChipLabel("unknown", []), "Способ не указан");
});

test("click-to-filter at the state level: a click chooses the method for the journal only, the same one again clears it, the overview never takes it", () => {
  assert.equal(V.toggleMethod("", "cash"), "cash");
  assert.equal(V.toggleMethod("cash", "cash"), "");
  assert.equal(V.toggleMethod("cash", "card"), "card");
  const month = V.periodOf("month", TODAY);
  const chosen = { method: V.toggleMethod("", "cash"), groupId: "", teacherId: "" };
  assert.equal(V.journalQuery(month, null, chosen, V.NO_JOURNAL_EXTRAS).method, "cash");
  assert.equal("method" in V.journalQuery(month, null, { ...chosen, method: V.toggleMethod("cash", "cash") }, V.NO_JOURNAL_EXTRAS), false);
  assert.equal("method" in V.overviewQuery(month, chosen), false, "the donut keeps showing every method");
  // the page: the chip above the journal clears it, a new period / group drops it, the old select is gone
  const page = read("src/components/payments/income-page.tsx");
  assert.match(page, /toggleMethod\(filters\.method, method\)/);
  assert.match(page, /onClearMethod=\{\(\) => \{ setFilters\(\(state\) => \(\{ \.\.\.state, method: "" \}\)\); setPage\(1\); \}\}/);
  assert.match(page, /const changeFilters = \(next: IncomeFilters\) => \{ setFilters\(\{ \.\.\.next, method: "" \}\)/);
  assert.match(page, /const changePeriod = \(next: Period\) => \{ setPeriod\(next\); setFilters\(\(state\) => \(\{ \.\.\.state, method: "" \}\)\)/);
  assert.doesNotMatch(page, /Все способы|methodOptions|<select/);
  assert.equal(V.methodFilterOptions, undefined);
  assert.equal(V.hasUnknownMethod, undefined);
  assert.equal(V.methodRows, undefined);
  // the chip on the journal
  const { React, text, html, J } = parts();
  const data = journal("J03_journal_cash");
  const base = { journal: data, loading: false, error: null, onRetry: () => {}, search: "", onSearch: () => {}, createdBy: "", onCreatedBy: () => {}, authors: [], focusLabel: null, onClearFocus: () => {}, empty: { kind: "month", focusLabel: null, narrowed: true }, onResetNarrowing: () => {}, onPage: () => {}, onExport: () => {}, exporting: false, activeId: null, onOpen: () => {} };
  assert.ok(!html(React.createElement(J.JournalSection, base)).includes("journal-method"));
  const withChip = React.createElement(J.JournalSection, { ...base, methodLabel: "Наличные", onClearMethod: () => {} });
  assert.match(text(withChip), /Наличные/);
  assert.match(html(withChip), /data-testid="journal-method"[^>]*>Наличные<button[^>]*aria-label="Показать все способы"/);
});

test("the donut on screen: buttons with aria-labels, the total in the centre, the legend, the chosen one pressed; a single method is a full circle", () => {
  const { React, text, html, P } = parts();
  const o = { ...overview("I01_income_month_october"), by_method: SPEC_METHODS };
  const view = (extra = {}) => React.createElement(P.MethodsDonut, { overview: o, ...extra });
  const body = text(view());
  for (const piece of ["Чем платили", "7 885 000 сум", "19 оплат", "Карта", "3 000 000 сум", "38%", "Перевод", "Click", "Наличные", "235 000 сум", "3%"]) assert.ok(body.includes(piece), piece);
  assert.ok(!body.includes("Касса по способам") && !body.includes("Все способы"));
  const markup = plain(html(view()));
  assert.equal((markup.match(/data-testid="method-segment"/g) || []).length, 4);
  assert.equal((markup.match(/data-testid="method-legend-row"/g) || []).length, 4);
  assert.match(markup, /aria-label="Наличные · 235 000 сум · 1 оплата · 3%\. Показать оплаты"/);
  assert.equal((markup.match(/role="button"/g) || []).length, 4, "the segments are buttons");
  assert.ok(markup.indexOf('data-method="card"') < markup.indexOf('data-method="cash"'), "ordered by amount");
  assert.equal((markup.match(/aria-pressed="true"/g) || []).length, 0);
  assert.equal((markup.match(/aria-pressed="true"/g) || plain(html(view({ selected: "cash" }))).match(/aria-pressed="true"/g)).length, 2, "the chosen method is pressed in the ring and in the legend");
  // ordering of the legend dots
  assert.ok(markup.indexOf("bg-blue-600") < markup.indexOf("bg-emerald-500"));
  // a single method: a whole ring (a circle), no arcs
  const one = html(React.createElement(P.MethodsDonut, { overview: { ...o, by_method: [SPEC_METHODS[0]] } }));
  assert.equal((one.match(/data-testid="method-segment"/g) || []).length, 1);
  assert.match(one, /<circle[^>]*data-testid="method-segment"/);
  assert.doesNotMatch(one, /<path/);
  // nothing taken: no card
  assert.equal(html(React.createElement(P.MethodsDonut, { overview: { ...o, by_method: [] } })), "");
  // the focus / hover handlers are on both the ring and the legend (a tap focuses a button)
  const src = read("src/components/payments/income-parts.tsx");
  assert.match(src, /onFocus: \(\) => setHover\(method\)/);
  assert.match(src, /onMouseEnter: \(\) => setHover\(method\)/);
  assert.equal((src.match(/\.\.\.hoverProps\(/g) || []).length, 2);
});

test("«Сегодня наличными»: one quiet line on the current month only; hidden when the request failed; «оплат не было» instead of 0", () => {
  const day = overview("I02_income_day_today_cash");
  const line = V.cashTodayLine(day.cash);
  assert.equal(plain(line.text), "Сегодня наличными: 150 000 сум — столько должно быть в кассе");
  assert.equal(plain(line.note), "принято 250 000 сум, возвращено 100 000 сум");
  assert.equal(V.cashTodayLine(null), null, "the request failed / no block: no line");
  assert.equal(V.cashTodayLine(undefined), null);
  assert.deepEqual(V.cashTodayLine({ expected: 0, cash_received: 0, cash_refunded: 0 }), { text: "Сегодня наличными оплат не было", note: null }, "never «0 сум»");
  assert.equal(plain(V.cashTodayLine({ expected: 0, cash_received: 100000, cash_refunded: 100000 }).text), "Сегодня наличными: 0 сум — столько должно быть в кассе", "a refund took it back to zero: the figure is real");
  assert.equal(V.cashTodayLine({ expected: 235000, cash_received: 235000, cash_refunded: 0 }).note, null);
  // on screen
  const { React, text, html, P } = parts();
  const o = { ...overview("I01_income_month_october"), by_method: SPEC_METHODS };
  assert.ok(!html(React.createElement(P.MethodsDonut, { overview: o })).includes("cash-today"), "no line without the till");
  const withCash = text(React.createElement(P.MethodsDonut, { overview: o, cashToday: { ...day.cash, expected: 235000, cash_received: 235000, cash_refunded: 0 } }));
  assert.ok(withCash.includes("Сегодня наличными: 235 000 сум — столько должно быть в кассе"));
  assert.ok(text(React.createElement(P.MethodsDonut, { overview: o, cashToday: { ...day.cash, expected: 0, cash_received: 0, cash_refunded: 0 } })).includes("Сегодня наличными оплат не было"));
  // the page: ONE request for today (period=day, no filters), only on the current month; the answer is not shown elsewhere
  const page = read("src/components/payments/income-page.tsx");
  assert.match(page, /const cashWanted = !blocked && isCurrentMonth\(period, today\);/);
  assert.match(page, /overviewQuery\(periodOf\("day", today\), \{ groupId: "", teacherId: "" \}\)/);
  assert.match(page, /cashToday=\{cashWanted \? cashToday : null\}/);
  assert.match(page, /\.catch\(\(\) => \{ if \(live\) setCashToday\(null\); \}\)/);
  assert.equal((page.match(/getIncomeOverview\(/g) || []).length, 2, "the overview and the till of today, nothing else");
});

test("softer numbers: semibold (not bold), tabular, tight; neutral slate-800, debt rose-600, advance emerald-600; money stays right-aligned", () => {
  const { React, html, P, J } = parts();
  const o = overview("I01_income_month_october");
  assert.equal(P.ACCENT, "mt-1 text-2xl font-semibold leading-8 tabular-nums tracking-tight");
  const markup = plain(html(React.createElement(P.IncomeCards, { overview: o, paymentsBase: "/owner/payments" })));
  assert.equal((markup.match(/font-semibold leading-8 tabular-nums tracking-tight/g) || []).length, 4, "four big numbers");
  assert.ok(!/font-(bold|extrabold)/.test(markup), "nothing shouts");
  assert.match(markup, /tracking-tight text-slate-800">3 450 000/);
  assert.match(markup, /tracking-tight text-rose-600">500 000/);
  assert.match(markup, /tracking-tight text-emerald-600">450 000/);
  assert.doesNotMatch(markup, /text-slate-900|text-rose-700|text-emerald-700">\d/);
  // «Куда ушли деньги» and the journal amounts are font-medium
  const flow = plain(html(React.createElement(P.FlowLine, { overview: o })));
  assert.match(flow, /font-medium tabular-nums tracking-tight text-slate-800">1 000 000/);
  assert.doesNotMatch(flow, /font-semibold tabular-nums/);
  const list = html(React.createElement(J.JournalList, { rows: journal("J04_journal_voided_and_replaced").rows, withYear: false, activeId: null, onOpen: () => {} }));
  assert.match(list, /text-right text-sm font-medium tabular-nums tracking-tight md:col-start-4/);
  assert.ok(!/text-sm font-semibold tabular-nums/.test(list));
  // contrast of the lighter colours on white: rose-600 and emerald-600 on 24 px (large) text
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  assert.ok(ratio("#e11d48", "#ffffff") >= 4.5, "rose-600");
  assert.ok(ratio("#059669", "#ffffff") >= 3, "emerald-600, large text");
  assert.ok(ratio("#1e293b", "#ffffff") >= 12, "slate-800");
});

// ── the groups' collection ──────────────────────────────────────────────────────────────────────

test("«Группы — собираемость»: worst first, a group with nothing charged last, the total; a row opens «Должники» of the group", () => {
  const rows = V.collectionRows(overview("I01_income_month_october").collection);
  assert.deepEqual(rows.map((r) => [r.title, r.pct, r.debt, r.debtors]), [["Математика 9А", 73, 300000, 1], ["Английский 7Б", 75, 150000, 1], ["Физика 10В", 87, 50000, 1]]);
  assert.equal(rows[0].teacher, "Пётр Иванов");
  assert.equal(rows[0].debtorsText, "1 ученик с долгом за месяц");
  const total = V.collectionTotalView(overview("I01_income_month_october").collection);
  assert.deepEqual([total.title, total.charged, total.paid, total.pct], ["Всего", 2500000, 1900000, 76]);
  // ties go by the bigger debt; no percent goes last
  const base = overview("I01_income_month_october").collection;
  const make = (id, pct, debt, charged = 100) => ({ ...base.groups[0], group_id: id, group_name: id, pct, debt, charged, students_with_debt: debt > 0 ? 1 : 0 });
  const sorted = V.collectionRows({ ...base, groups: [make("e", null, 0, 0), make("a", 50, 10), make("b", 50, 90), make("c", 0, 5)] });
  assert.deepEqual(sorted.map((r) => r.title), ["c", "b", "a", "e"]);
  assert.equal(sorted[3].pctText, "");
  assert.equal(V.collectionRows(null).length, 0);
  // the total counts distinct students: the tooltip is always there, the «*» only when total != sum of the rows
  assert.equal(V.collectionTotalDebtorsHint(null), null);
  assert.match(V.collectionTotalDebtorsHint(base).title, /без повторов/);
  const rowsSum = base.groups.reduce((a, g) => a + g.students_with_debt, 0);
  assert.equal(V.collectionTotalDebtorsHint({ ...base, total: { ...base.total, students_with_debt: rowsSum } }).marker, false);
  assert.equal(V.collectionTotalDebtorsHint({ ...base, total: { ...base.total, students_with_debt: rowsSum - 1 } }).marker, true);
  assert.equal(V.collectionTotalView(null), null);
  // «долгов нет» in words
  assert.equal(V.collectionRows({ ...base, groups: [make("z", 100, 0)] })[0].debtorsText, "долгов за месяц нет");
});

// ── the journal ─────────────────────────────────────────────────────────────────────────────────

test("journal rows: date · time | student | group | amount | method; a cancelled or corrected payment is grey and says «отменена»", () => {
  const rows = journal("J01_journal_page1").rows;
  const live = V.journalRowView(rows[0]);
  assert.deepEqual([live.date, live.time, live.student, live.group, plain(live.amount), live.method, live.tag, live.muted], ["21.10", "11:40", "Алиев Тимур", "Английский 7Б", "150 000 сум", "Наличные", null, false]);
  const voided = V.journalRowView(rows[2]);
  assert.deepEqual([voided.tag, voided.muted], ["отменена", true]);
  const replaced = V.journalRowView(rows[4]);
  assert.deepEqual([replaced.tag, replaced.muted], ["исправлена → № 11", true]);
  assert.equal(V.statusTag({ status: "replaced", replaced_by_receipt_no: null }), "исправлена");
  // the time is paid_on + paid_time; without a time only the date
  assert.equal(V.journalRowView({ ...rows[0], paid_time: null }).time, "");
  assert.equal(V.journalRowView(rows[0], true).date, "21.10.2026");
  assert.equal(V.journalSpansYears("2026-12-01", "2027-01-31"), true);
  assert.equal(V.journalSpansYears("2026-10-01", "2026-10-31"), false);
});

test("the drawer: who entered it, where the money went, the receipt, the way to the student; the history of a cancelled payment", () => {
  const rows = journal("J01_journal_page1").rows;
  const view = V.drawerView(rows[0]);
  assert.equal(view.title, "Оплата № 13");
  assert.equal(view.when, "21.10.2026 · 11:40");
  assert.deepEqual(view.facts, [{ label: "Ученик", value: "Алиев Тимур" }, { label: "Группа", value: "Английский 7Б · Мария Ким" }, { label: "Кто внёс", value: "Азиз Хакимов" }]);
  assert.deepEqual(view.destination.map(plain), ["за октябрь — 150 000 сум"]);
  assert.equal(view.note, "=SUM(A1)"); // shown as text, never as a formula
  assert.deepEqual(view.links.map((l) => [l.key, l.label]), [["receipt", "Квитанция № 13"], ["student", "Карточка ученика"], ["statement", "Выписка по группе"]]);
  // «за сентябрь — 200 000 · аванс — 50 000» is two lines
  assert.deepEqual(V.destinationLines({ allocation_text: "за сентябрь — 200 000 · аванс — 50 000", allocations: [] }), ["за сентябрь — 200 000 сум", "аванс — 50 000 сум"]);
  assert.deepEqual(V.destinationLines({ allocation_text: null, allocations: [{ label: "На текущий период 01.10–31.10", amount: 5000 }, { label: "ноль", amount: 0 }] }).map(plain), ["На текущий период 01.10–31.10 — 5 000 сум"]);
  // cancelled: the reason and who, and no «куда пошли деньги» (the money did not go anywhere)
  const voided = V.drawerView(rows[2]);
  assert.deepEqual([voided.tag, voided.destination, voided.notes[0].startsWith("Оплата отменена: Ошибочный ввод")], ["отменена", [], true]);
  // corrected: points at the receipt that replaced it; and the new one points back
  const replaced = V.drawerView(rows[4]);
  assert.match(replaced.notes[0], /Оплата исправлена: действует квитанция № 11/);
  const correcting = V.drawerView(rows[3]);
  assert.match(plain(correcting.notes.join(" ")), /Исправляет квитанцию № 9, было 400 000 сум/);
  // someone unknown is not a row of dashes
  assert.ok(!V.drawerView({ ...rows[0], created_by_name: null }).facts.some((f) => f.label === "Кто внёс"));
});

test("journal paging and totals as the server gives them", () => {
  const p1 = V.journalPaging(journal("J01_journal_page1"));
  assert.deepEqual([p1.text, p1.canPrev, p1.canNext, p1.page, p1.pages], ["1–5 из 9", false, true, 1, 2]);
  const p2 = V.journalPaging(journal("J02_journal_page2"));
  assert.deepEqual([p2.text, p2.canPrev, p2.canNext], ["6–9 из 9", true, false]);
  assert.equal(V.journalPaging({ page: 1, size: 25, total: 0, pages: 1, rows: [] }).text, "");
  assert.equal(plain(V.journalTotalsText(journal("J01_journal_page1").totals)), "7 оплат на 3 450 000 сум · отменено 2");
  assert.equal(plain(V.journalTotalsText({ count: 4, sum: 950000, voided_count: 0 })), "4 оплаты на 950 000 сум");
  assert.equal(V.journalTotalsText({ count: 0, sum: 0, voided_count: 0 }), "");
});

// ── empty and error states are human sentences ──────────────────────────────────────────────────

test("empty states are sentences, by period and by what narrowed the list", () => {
  const e = (kind, focusLabel = null, narrowed = false) => V.journalEmptyText({ kind, focusLabel, narrowed });
  assert.equal(e("day"), "За этот день оплат не было");
  assert.equal(e("week"), "За эту неделю оплат не было");
  assert.equal(e("month"), "За этот месяц оплат не было");
  assert.equal(e("custom"), "За этот период оплат не было");
  assert.equal(e("month", "7 октября"), "В этот день оплат не было");
  assert.equal(e("month", null, true), "По этому запросу оплат не нашлось");
  assert.deepEqual(V.incomeErrorText({ status: 403 }), { text: "Нет доступа к поступлениям. Доступ даёт владелец центра в настройках.", denied: true });
  assert.deepEqual(V.incomeErrorText(new Error("Период не длиннее 366 дней")), { text: "Период не длиннее 366 дней", denied: false });
  assert.deepEqual(V.incomeErrorText(null), { text: "Не удалось загрузить поступления", denied: false });
});

// ── what is drawn ───────────────────────────────────────────────────────────────────────────────

test("the month on screen: the sentence of the server, four cards, one line, the chart, the till — and no table, no dashes", () => {
  const { React, text, html, P } = parts();
  const o = overview("I01_income_month_october");
  const view = (extra = {}) => React.createElement(P.IncomeOverviewView, { overview: o, today: TODAY, paymentsBase: "/owner/payments", activeBucket: null, onPick: () => {}, ...extra });
  const body = text(view());
  for (const piece of [
    "Поступило", "3 450 000 сум", "▲ 130% к 1–21 сентября", "7 оплат",
    "Собрано за месяц", "1 900 000 сум", "из 2 500 000 сум · 76%",
    "Долг на сегодня", "500 000 сум", "3 ученика", "Должники",
    "Аванс", "450 000 сум", "2 ученика оплатили вперёд",
    "Куда ушли деньги", "на старые долги", "1 000 000 сум", "29%", "на текущие периоды", "55%", "в аванс", "13%", "возвращено", "3%", "Сходится", "Прощено долгов: 100 000 сум",
    "Пришло по дням", "Чем платили", "Click", "1 250 000 сум", "Наличные", "Перевод", "Карта", "36%", "28%",
  ]) assert.ok(body.includes(piece), piece);
  assert.ok(!body.includes("NaN") && !body.includes("undefined") && !body.includes("null"));
  assert.ok(!body.includes("За октябрь пришло") && !html(view()).includes("income-summary"), "the sentence of the server is not shown");
  {const m=/(^|\s)—(\s|$)/.exec(body);assert.ok(!m, "dash: "+(m&&body.slice(m.index-40,m.index+40)));}
  assert.ok(!body.includes("должно быть в кассе") && !body.includes("Сегодня наличными")); // the till of today is the page's own request
  const markup = html(view());
  assert.ok(!markup.includes("<table") && !markup.includes('role="table"'));
  assert.ok(!body.includes("По преподавателям") && !body.includes("По дням"));
  // the link to «Должники» keeps the workspace
  assert.match(markup, /href="\/owner\/payments\?bucket=debt"/);
  assert.match(markup, /id="position"/);
  // 31 bars, each with its sentence for a screen reader
  assert.equal((markup.match(/data-testid="income-bar"/g) || []).length, 6); // only the 6 days with payments (7 payments) are pressed
  assert.match(plain(markup), /aria-label="7 октября, ср: 1 250 000 сум · 1 оплата\. Показать оплаты"/);
  // the pressed day is marked
  assert.match(html(view({ activeBucket: "2026-10-07" })), /aria-pressed="true"/);
});

test("a day answer (the shape the till of today asks for): three cards (no «Собрано за месяц»), no chart, the donut; a week: three cards and the chart", () => {
  const { React, text, html, P } = parts();
  const day = text(React.createElement(P.IncomeOverviewView, { overview: overview("I02_income_day_today_cash"), today: TODAY, paymentsBase: "/admin/payments", activeBucket: null, onPick: () => {} }));
  for (const piece of ["Вчера оплат не было", "2 оплаты", "Чем платили", "Сходится"]) assert.ok(day.includes(piece), piece);
  assert.ok(!day.includes("Сегодня пришло") && !day.includes("должно быть в кассе"), "no sentence, and the till of today is not in the overview view");
  assert.ok(!day.includes("Собрано за месяц") && !day.includes("Пришло по дням"));
  const weekMarkup = html(React.createElement(P.IncomeOverviewView, { overview: overview("I03_income_week"), today: TODAY, paymentsBase: "/owner/payments", activeBucket: null, onPick: () => {} }));
  const week = plain(weekMarkup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  assert.ok(week.includes("▼ 69% к прошлой неделе") && week.includes("Пришло по дням") && !week.includes("Собрано за месяц"));
  assert.match(weekMarkup, /sm:grid-cols-2 xl:grid-cols-3/);
});

test("a quiet period: the cards, no chart, no line of shares, no till; the zero is said in words", () => {
  const { React, text, P } = parts();
  const o = overview("I02_income_day_today_cash");
  const quiet = { ...o, current: { ...o.current, received: 0, payments_count: 0, to_current: 0, refunded: 0, refunded_from_received: 0 }, by_method: [], cash: null, series: [{ bucket: TODAY, received: 0, count: 0 }], position: { ...o.position, debt_total: 0, students_with_debt: 0, advance_total: 0, students_with_advance: 0 }, delta_text: null, delta_direction: null };
  const body = text(React.createElement(P.IncomeOverviewView, { overview: quiet, today: TODAY, paymentsBase: "/owner/payments", activeBucket: null, onPick: () => {} }));
  for (const piece of ["Оплат не было", "Долгов нет", "Авансов нет"]) assert.ok(body.includes(piece), piece);
  for (const absent of ["Куда ушли деньги", "Чем платили", "Пришло по дням", "Должники"]) assert.ok(!body.includes(absent), absent);
  assert.ok(body.includes("Сходится") === false); // the mark lives with the line; nothing to reconcile in an empty day
  // but a mismatch is never hidden
  const broken = { ...quiet, ok: false, checks: [{ code: "received_eq_journal", left: 0, right: 1000, diff: -1000 }] };
  assert.match(text(React.createElement(P.IncomeOverviewView, { overview: broken, today: TODAY, paymentsBase: "/owner/payments", activeBucket: null, onPick: () => {} })), /Не сходится: расхождение 1 000 сум/);
});

test("loading skeleton and the error with a retry; no access has no retry", () => {
  const { React, text, html, P } = parts();
  assert.match(html(React.createElement(P.IncomeSkeleton)), /animate-pulse/);
  assert.match(html(React.createElement(P.IncomeSkeleton)), /aria-busy="true"/);
  const failed = html(React.createElement(P.IncomeError, { message: "Не удалось загрузить поступления", onRetry: () => {} }));
  assert.match(failed, /role="alert"/);
  assert.ok(text(React.createElement(P.IncomeError, { message: "Не удалось загрузить поступления", onRetry: () => {} })).includes("Повторить"));
  assert.ok(!text(React.createElement(P.IncomeError, { message: "Нет доступа", denied: true, onRetry: () => {} })).includes("Повторить"));
});

test("the journal on screen: compact rows, cancelled ones grey with «отменена»; a phone gets the same rows as cards", () => {
  const { React, text, html, J } = parts();
  const rows = journal("J04_journal_voided_and_replaced").rows;
  const list = React.createElement(J.JournalList, { rows, withYear: false, activeId: null, onOpen: () => {} });
  const body = text(list);
  for (const piece of ["Дата · время", "Ученик", "Группа", "Сумма", "Способ", "Алиев Тимур", "20.10 · 13:08", "777 000 сум", "Нуров Жасур", "отменена"]) assert.ok(body.includes(piece), piece);
  const markup = html(list);
  assert.equal((markup.match(/data-testid="journal-row"/g) || []).length, 2);
  assert.match(markup, /data-status="voided"/);
  assert.match(markup, /data-status="replaced"/);
  assert.match(markup, /line-through/);
  assert.match(markup, /text-slate-400/);
  assert.match(markup, /aria-haspopup="dialog"/);
  // money is right-aligned and the date centred in the table; one markup, the grid decides
  assert.match(markup, /md:text-center/);
  assert.match(markup, /text-right text-sm font-medium tabular-nums tracking-tight md:col-start-4/);
  assert.match(markup, /md:grid-cols-\[6\.5rem_/);
});

test("the drawer body: amount, method, who entered it, where the money went, links to the receipt and the student", () => {
  const { React, text, html, J } = parts();
  const row = journal("J01_journal_page1").rows[0];
  const el = React.createElement(J.JournalDrawerBody, { row, paymentsBase: "/owner/payments", studentProfileBasePath: "/owner/students" });
  const body = text(el);
  for (const piece of ["150 000 сум", "Наличные", "Алиев Тимур", "Английский 7Б · Мария Ким", "Кто внёс", "Азиз Хакимов", "Куда пошли деньги", "за октябрь — 150 000", "Комментарий", "=SUM(A1)", "Квитанция № 13", "Карточка ученика", "Выписка по группе"]) assert.ok(body.includes(piece), piece);
  const markup = html(el);
  assert.match(markup, new RegExp(`href="/owner/payments/receipt/${encodeURIComponent(row.id)}"`));
  assert.match(markup, new RegExp(`href="/owner/students/${encodeURIComponent(row.student_id)}"`));
  assert.match(markup, new RegExp(`href="/owner/payments/statement/${encodeURIComponent(row.membership_id)}"`));
  // a cancelled payment has its history in words and no destination block
  const voided = text(React.createElement(J.JournalDrawerBody, { row: journal("J04_journal_voided_and_replaced").rows[0], paymentsBase: "/owner/payments", studentProfileBasePath: "/owner/students" }));
  assert.ok(voided.includes("Оплата отменена: Ошибочный ввод") && voided.includes("отменена") && !voided.includes("Куда пошли деньги"));
});

test("the journal section: search and filters, the focus chip, pages; empty and error states in words", () => {
  const { React, text, html, J } = parts();
  const data = journal("J01_journal_page1");
  const base = {
    journal: data, loading: false, error: null, onRetry: () => {}, search: "", onSearch: () => {}, createdBy: "", onCreatedBy: () => {}, authors: data.authors,
    focusLabel: null, onClearFocus: () => {}, empty: { kind: "month", focusLabel: null, narrowed: false }, onResetNarrowing: () => {}, onPage: () => {}, onExport: () => {},
    exporting: false, activeId: null, onOpen: () => {},
  };
  const full = text(React.createElement(J.JournalSection, base));
  for (const piece of ["Скачать Excel", "7 оплат на 3 450 000 сум · отменено 2", "1–5 из 9", "1 из 2"]) assert.ok(full.includes(piece), piece);
  const markup = html(React.createElement(J.JournalSection, base));
  assert.match(markup, /aria-label="Поиск по оплатам"/);
  assert.match(markup, /aria-label="Кто внёс оплату"/);
  assert.match(markup, /Азиз Хакимов · 4/);
  assert.match(markup, /aria-label="Следующая страница"/);
  // one author: nothing to choose, no select
  assert.ok(!html(React.createElement(J.JournalSection, { ...base, authors: [data.authors[0]] })).includes("Кто внёс оплату"));
  assert.match(text(React.createElement(J.JournalSection, { ...base, focusLabel: "7 октября" })), /Оплаты: 7 октября/);
  const empty = { ...data, rows: [], total: 0, totals: { count: 0, sum: 0, voided_count: 0 } };
  assert.ok(text(React.createElement(J.JournalSection, { ...base, journal: empty, empty: { kind: "day", focusLabel: null, narrowed: false } })).includes("Журнал оплат пуст")); // nothing in the period and nothing narrowed: one quiet line, no toolbar (income3)
  const narrowed = text(React.createElement(J.JournalSection, { ...base, journal: empty, empty: { kind: "day", focusLabel: null, narrowed: true } }));
  assert.ok(narrowed.includes("По этому запросу оплат не нашлось") && narrowed.includes("Сбросить поиск и фильтры"));
  assert.match(html(React.createElement(J.JournalSection, { ...base, journal: null })), /data-testid="journal-skeleton"/);
  const error = html(React.createElement(J.JournalSection, { ...base, journal: null, error: "Не удалось загрузить поступления" }));
  assert.match(error, /role="alert"/);
  assert.ok(text(React.createElement(J.JournalSection, { ...base, journal: null, error: "Не удалось загрузить поступления" })).includes("Повторить"));
  // nothing to export from an empty (narrowed) list
  assert.match(html(React.createElement(J.JournalSection, { ...base, journal: empty, empty: { kind: "day", focusLabel: null, narrowed: true } })), /disabled=""[^>]*>[^<]*<[^>]*>[^<]*<\/svg>Скачать Excel|Скачать Excel/);
});

test("the groups' collection on screen: worst first, bars, a row is a link to «Должники» of the group; one table, not two", () => {
  const { React, text, html, C } = parts();
  const o = overview("I01_income_month_october");
  const el = React.createElement(C.CollectionTable, { collection: o.collection, paymentsBase: "/owner/payments", caption: V.collectionCaption(V.periodOf("month", TODAY), TODAY) });
  const body = text(el);
  for (const piece of ["Октябрь 2026 · по группам", "Группа", "Стоимость", "Оплачено", "Собрано", "Долг", "Должников", "Математика 9А", "Пётр Иванов", "73%", "1 100 000 сум", "300 000 сум", "Всего", "76%"]) assert.ok(body.includes(piece), piece);
  assert.ok(body.indexOf("Математика 9А") < body.indexOf("Английский 7Б") && body.indexOf("Английский 7Б") < body.indexOf("Физика 10В"));
  const markup = html(el);
  assert.match(markup, /href="\/owner\/payments\?bucket=debt&amp;group_id=group%3AA"/);
  assert.equal((markup.match(/role="progressbar"/g) || []).length, 4); // three groups and the total
  assert.equal((markup.match(/data-testid="collection-row"/g) || []).length, 3);
  // a group without a debt says it with a quiet green tick, not «нет» or a dash
  const clean = { ...o.collection, groups: [{ ...o.collection.groups[0], debt: 0, students_with_debt: 0, pct: 100, paid: 1500000 }] };
  const quiet = text(React.createElement(C.CollectionTable, { collection: clean, paymentsBase: "/admin/payments" }));
  assert.ok(quiet.includes("✓ оплачено") && !/(^|\s)нет(\s|$)/.test(quiet) && !/(^|\s)—(\s|$)/.test(quiet));
  // a month without groups
  assert.ok(text(React.createElement(C.CollectionTable, { collection: { ...o.collection, groups: [] }, paymentsBase: "/owner/payments" })).includes("В этом месяце в группах ничего не начислено"));
});

test("collection table: one-line headers (no «за месяц»), the caption, alignment per column, ✓ оплачено and a muted 0, the ⓘ of «Стоимость»", () => {
  const { React, text, html, C } = parts();
  const o = overview("I01_income_month_october");
  const month = V.periodOf("month", TODAY);
  assert.equal(V.collectionCaption(month, TODAY), "Октябрь 2026 · по группам");
  assert.equal(V.collectionCaption({ kind: "custom", from: "2026-10-12", to: "2026-10-18" }, TODAY), "12.10–18.10 · по группам");
  const el = React.createElement(C.CollectionTable, { collection: o.collection, paymentsBase: "/owner/payments", caption: V.collectionCaption(month, TODAY) });
  const markup = plain(html(el));
  assert.match(markup, /data-testid="collection-caption"[^>]*>Октябрь 2026 · по группам/);
  // the headers: the six short words, each a single-line span
  const head = /data-testid="collection-head">(.*?)<\/div>/s.exec(markup)[1];
  const headText = text(React.createElement("div", { dangerouslySetInnerHTML: { __html: head } }));
  for (const word of ["Группа", "Стоимость", "Оплачено", "Собрано", "Долг", "Должников"]) assert.ok(headText.includes(word), word);
  assert.ok(!/за месяц|С долгом|\(преподаватель\)/.test(headText), headText);
  assert.match(markup, /whitespace-nowrap/);
  // money columns right, «Должников» centred, the header like its cells
  for (const col of ["charged", "paid", "debt"]) assert.match(head, new RegExp(`data-col="${col}" class="text-right"`), `${col} header`);
  assert.match(head, /data-col="debtors" class="text-center"/);
  assert.match(head, /data-col="group">Группа<\/span>/);
  for (const col of ["charged", "paid", "debt"]) assert.match(markup, new RegExp(`data-col="${col}" class="flex [^"]*md:text-right`), `${col} cells`);
  assert.match(markup, /data-col="debtors" class="flex [^"]*md:text-center/);
  assert.ok(!/data-col="debtors" class="flex [^"]*md:text-right/.test(markup));
  // the cell labels on a phone are the same short words
  const cards = text(el);
  assert.ok(!cards.includes("Стоимость за месяц") && !cards.includes("Долг за месяц") && !cards.includes("С долгом за месяц"));
  // softer numbers: font-medium money, the debt in rose-600
  assert.match(markup, /font-medium text-rose-600">300 000/);
  assert.ok(!/font-semibold tabular-nums|text-rose-700/.test(markup));
  // the ⓘ is the shared Hint (hover, focus, a tap, Escape) with the same text for a screen reader; the header cell has it as a title too
  assert.match(markup, /data-testid="collection-cost-info"[^>]*><span[^>]*role="button"[^>]*aria-describedby=[^>]*>.*?<span class="sr-only">Что значит «Стоимость»<\/span>/);
  assert.ok((markup.match(/<span id="[^"]*" class="sr-only">Сколько ученики группы должны заплатить за этот месяц: цена × ученики, с учётом индивидуальных цен, пауз и прихода в середине месяца<\/span>/g) || []).length >= 1);
  assert.match(markup, /data-col="charged" class="text-right">Стоимость /, "the bubble is the Hint's: no second native title");
  assert.match(read("src/components/payments/income-collection.tsx"), /import \{ Hint \} from "@\/components\/ui\/hint"/);
  assert.equal(V.COLLECTION_COST_HINT, "Сколько ученики группы должны заплатить за этот месяц: цена × ученики, с учётом индивидуальных цен, пауз и прихода в середине месяца");
  // debt 0 → ✓ оплачено (emerald-700 for AA at small size, font-medium, small, right in the debt column); debtors 0 → a muted 0 in the centred column
  const clean = { ...o.collection, groups: [{ ...o.collection.groups[0], debt: 0, students_with_debt: 0, pct: 100, paid: 1500000 }], total: { ...o.collection.total, debt: 0, students_with_debt: 0 } };
  const cleanMarkup = html(React.createElement(C.CollectionTable, { collection: clean, paymentsBase: "/owner/payments" }));
  assert.equal((cleanMarkup.match(/data-testid="collection-paid"/g) || []).length, 2, "the row and the total follow the same rule");
  assert.match(cleanMarkup, /<span class="text-xs font-medium text-emerald-700" data-testid="collection-paid">✓ оплачено<\/span>/);
  assert.match(cleanMarkup, /data-col="debtors"[^>]*><span class="text-xs text-slate-400 md:hidden">Должников<\/span><span class="tabular-nums"><span class="text-slate-400">0<\/span>/);
  assert.ok(!text(React.createElement(C.CollectionTable, { collection: clean, paymentsBase: "/owner/payments" })).includes(" нет"));
  // nothing charged: no «оплачено» for a debt that never existed
  const idle = { ...clean, groups: [{ ...clean.groups[0], charged: 0, paid: 0, pct: null }] };
  assert.equal((html(React.createElement(C.CollectionTable, { collection: idle, paymentsBase: "/owner/payments" })).match(/data-testid="collection-paid"/g) || []).length, 1);
  // the «*» marker and the title of the total «Должников» cell and the debt note stay
  const src = read("src/components/payments/income-collection.tsx");
  assert.match(src, /title=\{debtorsHint\?\.title\}/);
  assert.match(src, /data-testid="collection-total-marker"/);
  assert.match(src, /data-testid="collection-debt-note"/);
  const page = read("src/components/payments/income-page.tsx");
  assert.match(page, /caption=\{collectionCaption\(period, today\)\}/);
});

// ── the screen's rules, read from the source ────────────────────────────────────────────────────

test("the page: «Поступления» v2 has the period bar, one table at a time, no old tables, the server's endpoints only", () => {
  const page = read("src/components/payments/income-page.tsx");
  const parts_ = ["income-parts", "income-journal", "income-collection"].map((name) => read(`src/components/payments/${name}.tsx`)).join("\n");
  const all = `${page}\n${parts_}`;
  assert.doesNotMatch(page, /aria-label="Период"|PERIOD_TABS|period-tabs|switchKind/, "no tab strip");
  assert.match(page, /data-testid="period-custom"/);
  assert.match(page, /data-testid="period-chip"/);
  assert.match(page, /orgApi\.getIncomeOverview\(/);
  assert.match(page, /orgApi\.getPaymentsJournal\(/);
  assert.match(page, /orgApi\.exportPaymentsJournal\(/);
  assert.doesNotMatch(all, /getReceiptsReport|getReceiptItems|getBalances|MoneyTable|По преподавателям|По дням"|DrillPanel/);
  // one table at a time: the journal or the groups, switched by tabs; the groups only in month mode (the server sends `collection`)
  assert.match(page, /role="tablist" aria-label="Оплаты и группы"/);
  assert.match(page, /tab === "groups" && collection \? \(\s*<CollectionTable/);
  assert.match(page, /requestedTab === "groups" && collection \? "groups" : "journal"/);
  // the drawer is the shared Modal as a side sheet / bottom sheet
  assert.match(read("src/components/payments/income-journal.tsx"), /placement="sheet"/);
  // the chart scrolls inside its own box
  assert.match(read("src/components/payments/income-parts.tsx"), /ScrollHint className="mt-1 flex flex-1 flex-col overflow-x-auto"/);
  // cards stack in a column on a phone
  assert.match(read("src/components/payments/income-parts.tsx"), /grid grid-cols-1 gap-3 sm:grid-cols-2/);
  // the old conventions: no shouting captions
  assert.doesNotMatch(all, /uppercase|tracking-wider/);
  // numbers only from the server: the page never adds money up
  assert.doesNotMatch(all, /\.reduce\([^)]*amount|\+ point\.received|\.received \+/);
  // the vocabulary
  for (const word of ["Поступило", "Собрано за месяц", "Долг на сегодня", "Аванс", "Должники", "Куда ушли деньги", "Чем платили", "Группы — собираемость"]) assert.ok(all.includes(word), word);
  assert.doesNotMatch(all, /Начислено|Списано|Списать долг/);
  assert.doesNotMatch(all, /сальдо|дебет|кредит|проводк/i);
  // the hash link of «Оплаты» still lands on the debt card
  assert.match(read("src/components/payments/income-parts.tsx"), /id="position"/);
  assert.match(page, /window\.location\.hash === "#position"/);
});

test("routes: owner and admin share the page; the «Должники» tab reads the group and teacher of the link", () => {
  for (const role of ["owner", "admin"]) {
    assert.match(read(`src/app/${role}/payments/income/page.tsx`), new RegExp(`<IncomePage paymentsHref="/${role}/payments" studentProfileBasePath="/${role}/students" />`), role);
  }
  const payments = read("src/components/payments/payments-page.tsx");
  assert.match(payments, /searchParams\?\.get\("group_id"\)/);
  assert.match(payments, /searchParams\?\.get\("teacher_id"\)/);
  // switching the tab keeps the narrowing in the address
  assert.match(payments, /params\.set\("group_id", filter\.groupId\)/);
  assert.match(payments, /groupId: filter\.groupId \|\| undefined/);
});

test("the shared Modal has a `sheet` placement: a bottom sheet on a phone, the side drawer from md", () => {
  const { modalLayout } = require(path.join(root, "src/lib/modal-layout.ts"));
  const sheet = modalLayout({ placement: "sheet" });
  assert.match(sheet.card, /rounded-t-3xl/);
  assert.match(sheet.card, /max-h-\[88vh\]/);
  assert.match(sheet.card, /md:rounded-none md:h-full md:max-h-none/);
  assert.match(sheet.header, /border-b/); // the header of a side sheet
  // the old placements are untouched
  assert.match(modalLayout({ placement: "right" }).card, /h-full/);
  assert.doesNotMatch(modalLayout({ placement: "right" }).card, /rounded-t-3xl/);
  assert.match(modalLayout({}).card, /rounded-\[24px\]/);
  const modal = read("src/components/ui/modal.tsx");
  assert.match(modal, /placement === "sheet"/);
  assert.match(modal, /initial=\{slideUp \? \{ y: "100%" \} : \{ x: "100%" \}\}/);
});

test("no hover-only reveal: the tooltip of a bar appears by hover and by focus (a tap focuses the pressed bar); the donut reacts to focus as well as hover", () => {
  const parts_ = read("src/components/payments/income-parts.tsx");
  const chart = parts_.slice(parts_.indexOf("export function IncomeChart"), parts_.indexOf("// ── «Чем платили»"));
  assert.doesNotMatch(chart, /onMouseEnter|onMouseOver|onPointerEnter/);
  assert.match(chart, /opacity-0[^"`]*group-hover:opacity-100 group-focus-within:opacity-100/);
  assert.match(parts_, /onFocus: \(\) => setHover\(method\)/);
});

test("INCOME-2 addendum: «Кто внёс» from two authors, the Excel limit, the note of «Должники» of a group", () => {
  const o = overview("I01_income_month_october");
  assert.match(read("src/components/payments/income-journal.tsx"), /const showAuthors = authors\.length > 1;/);
  const { React, text, J } = parts();
  const data = journal("J03_journal_cash");
  const base = { journal: data, loading: false, error: null, onRetry: () => {}, search: "", onSearch: () => {}, createdBy: "user:admin", onCreatedBy: () => {}, authors: data.authors, focusLabel: null, onClearFocus: () => {}, empty: { kind: "month", focusLabel: null, narrowed: false }, onResetNarrowing: () => {}, onPage: () => {}, onExport: () => {}, exporting: false, activeId: null, onOpen: () => {} };
  assert.ok(text(React.createElement(J.JournalSection, base)).includes("Кто внёс: все")); // an author is chosen, the options stay
  const e = Object.assign(new Error("Слишком много оплат для файла — сузьте период или фильтры"), { code: "EXPORT_TOO_LONG", status: 422 });
  assert.equal(V.exportErrorText(e), "Слишком много строк — сузьте период или фильтры");
  assert.equal(V.exportErrorText(new Error("Нет сети")), "Нет сети");
  assert.equal(V.exportErrorText(null), "Не удалось скачать Excel");
  assert.equal(V.DEBTORS_GROUP_NOTE, "Показаны все долги группы, не только за месяц");
  assert.match(read("src/components/payments/payments-page.tsx"), /bucket === "debt" && filter\.groupId && \(/);
  assert.doesNotMatch(read("src/components/payments/income-parts.tsx"), /data-testid="compare-hint"/); // income3: the hint is the tooltip of line 1, not a third line
});

test("phone polish (stage walk 22.10): the status chip leaves the name line and the total tooltip", () => {
  const journal = read("src/components/payments/income-journal.tsx");
  // the name has the whole first line of a card; the chip goes to row 3 under the amount on a phone and stays beside the name from md
  assert.match(journal, /col-start-1 row-start-1 min-w-0 truncate">\{view\.student\}/);
  assert.match(journal, /data-testid="journal-tag" className="col-start-2 row-start-3 [^"]*whitespace-nowrap[^"]*md:justify-self-auto"/);
  assert.match(journal, /contents text-sm font-medium md:col-start-2 md:flex/);
  assert.doesNotMatch(read("src/components/payments/income-parts.tsx"), /\{paymentsCountText\(row\.count\)\}/);
  // the total row says why its number is smaller than the sum of the rows
  const collection = read("src/components/payments/income-collection.tsx");
  assert.match(collection, /debtorsHint=\{totalHint\}/);
  assert.match(collection, /title=\{debtorsHint\?\.title\}/);
});

// ── inc8 review of the lead (22.10) ───────────────────────────────────────────────────────────

test("inc8-1: the chart fills the card from md (flexible columns, no inner scroll for 31 days), a phone keeps its sideways scroll", () => {
  const src = read("src/components/payments/income-parts.tsx");
  const chart = src.slice(src.indexOf("export function IncomeChart"), src.indexOf("// ── «Чем платили»"));
  assert.match(chart, /<section aria-label=\{title\} className="flex min-w-0 flex-col /, "the card is a column the chart can fill");
  assert.match(chart, /<ScrollHint className="mt-1 flex flex-1 flex-col overflow-x-auto"/);
  assert.match(chart, /className="relative flex flex-1 items-end gap-1\.5 pt-14 min-w-\[var\(--chart-min\)\] md:min-w-0 md:gap-1"/, "26 px a day on a phone, none from md");
  assert.match(chart, /"--chart-min": `\$\{count \* 26\}px`/);
  assert.match(chart, /flex min-w-0 flex-1 flex-col items-center md:self-stretch/, "every column is as tall as the card");
  assert.match(chart, /md:h-auto md:min-h-\[9rem\] md:flex-1/, "the plot takes what is left under the labels");
  assert.match(chart, /absolute bottom-0 left-1\/2 w-full max-w-\[28px\] -translate-x-1\/2 [^`]*md:max-w-\[36px\]/, "bars are a share of the plot's height whatever it is");
  assert.doesNotMatch(chart, /md:h-36/);
  assert.match(chart, /box\.scrollLeft = chartScrollLeft\(/, "the phone still opens at the last day with money");
  // 31 days: every column is there, labelled 1–31, and the phone's min width is 31 × 26
  const { React, html, P } = parts();
  const o = overview("I01_income_month_october");
  const bars = V.chartBars(o, TODAY);
  assert.equal(bars.length, 31);
  const markup = html(React.createElement(P.IncomeChart, { bars, today: TODAY, title: "Пришло по дням", activeBucket: null, onPick() {} }));
  assert.match(markup, /--chart-min:806px/);
  assert.equal((markup.match(/md:self-stretch/g) || []).length, 31);
  for (const label of ["1", "28", "29", "30", "31"]) assert.ok(markup.includes(`tabular-nums text-slate-500">${label}</span>`) || markup.includes(`tabular-nums text-slate-300">${label}</span>`), `label ${label}`);
});

test("inc8-2: the donut centre — exact below 1 000 000, compact from there (≤ 3 significant digits), the exact sum in the title, font ≥ 16 / 18 px and ≥ 8 px from the ring", () => {
  const text = (amount) => plain(V.donutCenterAmount(amount).text);
  assert.equal(text(0), "0 сум");
  assert.equal(text(850000), "850 000 сум", "below a million: exact");
  assert.equal(text(999999), "999 999 сум");
  assert.equal(text(1000000), "1 млн сум");
  assert.equal(text(3050000), "3,05 млн сум");
  assert.equal(text(7885000), "7,89 млн сум");
  assert.equal(text(9996000), "10 млн сум", "9,996 rounds up to 10, no «10,00»");
  assert.equal(text(10000000), "10 млн сум", "trailing zeros are trimmed");
  assert.equal(text(21400000), "21,4 млн сум");
  assert.equal(text(21449999), "21,4 млн сум");
  assert.equal(text(21450000), "21,5 млн сум", "integer rounding, not a float's 21,4");
  assert.equal(text(123456000), "123 млн сум");
  assert.equal(text(999400000), "999 млн сум");
  assert.equal(text(999600000), "1 млрд сум", "999,6 млн rolls over to a billion");
  assert.equal(text(1200000000), "1,2 млрд сум");
  assert.equal(text(1250000000), "1,25 млрд сум");
  assert.equal(text(12340000000), "12 млрд сум", "from 10 billions no decimals");
  assert.equal(plain(V.donutCenterAmount(21400000).title), "21 400 000 сум", "the exact sum is the tooltip");
  assert.equal(plain(V.donutCenterAmount(850000).title), "850 000 сум");
  // the geometry: ≥ 8 px between the farthest corner of the centre block and the inner edge of the thickest (highlighted) ring; the ring stays in the 180 box
  const inner = V.DONUT.radius - V.DONUT.widthActive / 2;
  assert.ok(V.DONUT.radius + V.DONUT.widthActive / 2 <= V.DONUT.size / 2);
  for (const amount of [0, 5, 235000, 850000, 999999, 1000000, 3050000, 7885000, 9996000, 21400000, 21450000, 99960000, 123456000, 999400000, 1200000000, 12340000000, 123400000000]) {
    const centre = V.donutCenterAmount(amount).text;
    const phone = V.donutCenterFont(centre, 16);
    const desk = V.donutCenterFont(centre, 18);
    assert.equal(phone, 16, `${amount}: phone font ${phone}`);
    assert.equal(desk, 18, `${amount}: desktop font ${desk}`);
    for (const font of [phone, desk]) assert.ok(inner - V.donutCenterReach(centre, font) >= V.DONUT.clearance, `${amount}@${font}: clearance ${inner - V.donutCenterReach(centre, font)}`);
  }
  // the fit still protects an absurd sum: the font shrinks, the clearance holds
  const absurd = "123 456 789 012 345 сум";
  assert.ok(V.donutCenterFont(absurd, 18) < 18);
  assert.ok(inner - V.donutCenterReach(absurd, V.donutCenterFont(absurd, 18)) >= V.DONUT.clearance);
  // on screen: «21,4 млн сум» + «7 оплат», the exact sum in the title and for a screen reader
  const { React, text: toText, html, P } = parts();
  const o = { ...overview("I01_income_month_october"), by_method: [{ method: "cash", label: "Наличные", amount: 21400000, count: 7 }] };
  const view = React.createElement(P.MethodsDonut, { overview: o });
  const body = toText(view);
  assert.ok(body.includes("21,4 млн сум") && body.includes("7 оплат"));
  const markup = plain(html(view));
  assert.match(markup, /title="21 400 000 сум"/);
  assert.match(markup, /<span class="sr-only">21 400 000 сум<\/span>/);
  assert.match(markup, /font-semibold tabular-nums tracking-tight text-slate-800 \[font-size:var\(--fs\)\] md:\[font-size:var\(--fs-md\)\]/);
  assert.match(markup, /--fs:16px;--fs-md:18px/);
});

test("inc8-3: the palette of the donut and the tooltip dot of the same colour", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(V.METHOD_COLOR).map(([key, value]) => [key, value.dot])), {
    cash: "bg-emerald-500", card: "bg-blue-600", bank_transfer: "bg-violet-500", click: "bg-amber-400", payme: "bg-cyan-600", other: "bg-pink-400", unknown: "bg-slate-400",
  });
  assert.deepEqual(Object.fromEntries(Object.entries(V.METHOD_COLOR).map(([key, value]) => [key, value.stroke])), {
    cash: "stroke-emerald-500", card: "stroke-blue-600", bank_transfer: "stroke-violet-500", click: "stroke-amber-400", payme: "stroke-cyan-600", other: "stroke-pink-400", unknown: "stroke-slate-400",
  });
  // the segments, the legend dots and the tooltip dot all come from the same `segment.dot` / `segment.stroke`
  const seg = V.methodSegments([{ method: "other", label: "Другое", amount: 5, count: 1 }])[0];
  assert.equal(seg.dot, "bg-pink-400");
  assert.equal(seg.stroke, "stroke-pink-400");
  const src = read("src/components/payments/income-parts.tsx");
  assert.match(src, /\$\{tip\.dot\}`\} data-testid="method-tooltip-dot"/);
  assert.match(src, /\$\{segment\.dot\}`\} aria-hidden/);
  assert.match(src, /className: `\$\{segment\.stroke\} /);
});

test("inc8-4: the ⓘ of «Стоимость» opens below the header on desktop; a phone has one quiet line instead of a popover", () => {
  const { React, html, C } = parts();
  const o = overview("I01_income_month_october");
  const markup = plain(html(React.createElement(C.CollectionTable, { collection: o.collection, paymentsBase: "/owner/payments", caption: "Октябрь 2026 · по группам" })));
  // phone: always visible, text-xs slate-500, hidden from md
  assert.match(markup, /<p class="mt-0\.5 text-xs leading-snug text-slate-500 md:hidden" data-testid="collection-cost-line">Стоимость — сколько ученики группы должны заплатить за этот месяц: цена × ученики, с учётом индивидуальных цен, пауз и прихода в середине месяца<\/p>/);
  assert.equal(V.COLLECTION_COST_LINE, "Стоимость — сколько ученики группы должны заплатить за этот месяц: цена × ученики, с учётом индивидуальных цен, пауз и прихода в середине месяца");
  // no ⓘ outside the header (it is inside the md-only header row)
  assert.equal((markup.match(/data-testid="collection-cost-info"/g) || []).length, 1);
  assert.match(markup, /data-testid="collection-head"/);
  assert.ok(markup.indexOf("collection-cost-info") > markup.indexOf("collection-head"));
  const src = read("src/components/payments/income-collection.tsx");
  assert.match(src, /<Hint text=\{text\} side="below" width=\{320\}/);
  assert.doesNotMatch(src, /label="Что значит «Стоимость»" className="md:hidden"/, "no ⓘ on a phone");
  // the shared Hint: above by default, below on request, with its own width
  const hint = read("src/components/ui/hint.tsx");
  assert.match(hint, /side = "above"/);
  assert.match(hint, /width = 256/);
  assert.match(hint, /preferSide: side/);
});

test("inc8-5: the quiet delta line is one line: «Сентябрь: оплат не было» for a running month, «9–15 окт.: оплат не было» for a range; the long words are the title", () => {
  const base = overview("I01_income_month_october");
  const nothing = (extra) => ({ ...base, delta_text: null, delta_direction: null, delta_pct: null, previous: { ...base.previous, payments_count: 0, received: 0 }, previous_label: "те же дни сентября", ...extra });
  const running = V.receivedCard(nothing({}));
  assert.equal(running.delta.text, "Сентябрь: оплат не было");
  assert.equal(running.hint, "Те же дни сентября: оплат не было", "the full words are the tooltip");
  const custom = V.receivedCard(nothing({ period: { ...base.period, kind: "custom", in_progress: false }, previous_period: { ...base.previous_period, from: "2026-10-05", to: "2026-10-11", label: "5–11 окт." }, previous_label: "5–11 окт." }));
  assert.equal(custom.delta.text, "5–11 окт.: оплат не было");
  // a closed month keeps the usual words («В августе оплат не было»)
  assert.equal(V.receivedCard(nothing({ period: { ...base.period, in_progress: false }, previous_label: "август", previous_period: { ...base.previous_period, from: "2026-08-01", label: "август" } })).delta.text, "В августе оплат не было");
  assert.ok(V.shortNoPaymentsBefore(nothing({})).length <= 24, "short enough for a 1440 px card");
  // on screen: truncate, never wrap; the title says the whole thing
  const { React, html, P } = parts();
  const markup = html(React.createElement(P.IncomeCards, { overview: nothing({}), paymentsBase: "/owner/payments" }));
  assert.match(markup, /class="mt-1 truncate text-sm font-medium [^"]*" data-testid="received-delta" data-tone="none" title="Те же дни сентября: оплат не было">Сентябрь: оплат не было</);
  // a delta with a percent also truncates and carries the comparison as its title
  assert.match(html(React.createElement(P.IncomeCards, { overview: base, paymentsBase: "/owner/payments" })), /class="mt-1 truncate text-sm font-medium [^"]*" data-testid="received-delta" data-tone="up" title="сравнение с 1–21 сент\."/);
});
