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

test("period: day / week (from a Monday) / month / custom, arrows step by the length, the forward arrow stops at today", () => {
  assert.deepEqual(V.PERIOD_TABS.map((t) => t.label), ["День", "Неделя", "Месяц", "Свой период"]);
  assert.deepEqual(V.periodOf("day", TODAY), { kind: "day", from: TODAY, to: TODAY });
  assert.deepEqual(V.periodOf("week", TODAY), { kind: "week", from: "2026-10-19", to: "2026-10-25" }); // 21.10.2026 is a Wednesday
  assert.deepEqual(V.periodOf("week", "2026-10-25"), { kind: "week", from: "2026-10-19", to: "2026-10-25" }); // a Sunday belongs to the week it ends
  assert.deepEqual(V.periodOf("week", "2026-10-19"), { kind: "week", from: "2026-10-19", to: "2026-10-25" });
  assert.deepEqual(V.periodOf("month", TODAY), { kind: "month", from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(V.periodOf("custom", TODAY, { kind: "week", from: "2026-10-12", to: "2026-10-18" }), { kind: "custom", from: "2026-10-12", to: "2026-10-18" });

  assert.deepEqual(V.stepPeriod(V.periodOf("day", TODAY), -1), { kind: "day", from: "2026-10-20", to: "2026-10-20" });
  assert.deepEqual(V.stepPeriod(V.periodOf("week", TODAY), -1), { kind: "week", from: "2026-10-12", to: "2026-10-18" });
  assert.deepEqual(V.stepPeriod(V.periodOf("week", "2026-12-30"), 1), { kind: "week", from: "2027-01-04", to: "2027-01-10" }); // across the new year
  assert.deepEqual(V.stepPeriod(V.periodOf("month", TODAY), -1), { kind: "month", from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(V.stepPeriod(V.periodOf("month", "2026-01-15"), -1), { kind: "month", from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(V.stepPeriod({ kind: "custom", from: "2026-10-10", to: "2026-10-19" }, -1), { kind: "custom", from: "2026-09-30", to: "2026-10-09" });

  assert.equal(V.canStepForward(V.periodOf("month", TODAY), TODAY), false); // this month holds today
  assert.equal(V.canStepForward(V.periodOf("week", TODAY), TODAY), false);
  assert.equal(V.canStepForward(V.periodOf("day", "2026-10-20"), TODAY), true);
  assert.equal(V.canStepForward(V.periodOf("month", "2026-09-10"), TODAY), true);

  // a tab keeps the moment on screen, but never goes after today
  assert.deepEqual(V.switchKind("day", V.periodOf("month", TODAY), TODAY), { kind: "day", from: TODAY, to: TODAY });
  assert.deepEqual(V.switchKind("month", V.periodOf("week", "2026-09-10"), TODAY), { kind: "month", from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(V.switchKind("week", V.periodOf("month", TODAY), TODAY), V.periodOf("week", TODAY));

  assert.equal(V.validatePeriod({ kind: "custom", from: "2026-10-10", to: "2026-10-09" }), "Конец периода раньше начала");
  assert.equal(V.validatePeriod({ kind: "custom", from: "2025-01-01", to: "2026-10-09" }), "Период не длиннее года");
  assert.equal(V.validatePeriod({ kind: "custom", from: "", to: "2026-10-09" }), "Укажите даты периода");
  assert.equal(V.validatePeriod({ kind: "custom", from: "2025-10-09", to: "2026-10-09" }), null); // 366 days
});

test("period titles read like a person: «Сегодня, 21 октября» · «19–25 октября» · «Октябрь 2026 г.»", () => {
  assert.equal(V.periodTitle(V.periodOf("day", TODAY), TODAY), "Сегодня, 21 октября");
  assert.equal(V.periodTitle(V.periodOf("day", "2026-10-20"), TODAY), "Вчера, 20 октября");
  assert.equal(V.periodTitle(V.periodOf("day", "2025-12-31"), TODAY), "31 декабря 2025");
  assert.equal(V.periodTitle(V.periodOf("week", TODAY), TODAY), "19–25 октября");
  assert.equal(V.periodTitle(V.periodOf("week", "2026-09-30"), TODAY), "28 сентября – 4 октября");
  assert.equal(V.periodTitle(V.periodOf("week", "2026-12-30"), TODAY), "28 декабря 2026 – 3 января 2027");
  assert.equal(V.periodTitle(V.periodOf("month", TODAY), TODAY), "Октябрь 2026 г.");
  assert.equal(V.periodTitle({ kind: "custom", from: "2026-10-01", to: "2026-10-21" }, TODAY), "01.10.2026 — 21.10.2026");
});

test("queries: the kind is sent to the server; filters only when set; the journal of a clicked day; export has no page", () => {
  const month = V.periodOf("month", TODAY);
  assert.deepEqual(V.overviewQuery(month, V.NO_FILTERS), { from: "2026-10-01", to: "2026-10-31", period: "month" });
  assert.deepEqual(V.overviewQuery(V.periodOf("week", TODAY), { method: "cash", groupId: "g1", teacherId: "t1" }), { from: "2026-10-19", to: "2026-10-25", period: "week", method: "cash", group_id: "g1", teacher_id: "t1" });
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

// ── «Касса по способам» ─────────────────────────────────────────────────────────────────────────

test("till by method: only the methods that took money; «должно быть в кассе» on the cash row of a day", () => {
  const month = V.methodRows(overview("I01_income_month_october"));
  assert.deepEqual(month.map((m) => [m.label, m.amount, m.count, m.hint]), [["Click", 1250000, 1, null], ["Наличные", 950000, 4, null], ["Перевод", 900000, 1, null], ["Карта", 350000, 1, null]]);
  const day = V.methodRows(overview("I02_income_day_today_cash"));
  assert.equal(day.length, 1);
  assert.equal(plain(day[0].hint), "должно быть в кассе 150 000 сум");
  assert.equal(plain(day[0].hintNote), "принято 250 000 сум, возвращено 100 000 сум");
  // with another method chosen the till is still known: it stands on its own, without a «0 сум · 0 оплат» row of figures
  const o = overview("I02_income_day_today_cash");
  const card = V.methodRows({ ...o, by_method: [{ method: "card", label: "Карта", amount: 100000, count: 1 }] });
  assert.deepEqual(card.map((m) => m.method), ["card", "cash"]);
  assert.equal(card[1].count, 0);
  // a method with zero in zero is not listed
  assert.equal(V.methodRows({ ...o, by_method: [{ method: "payme", label: "Payme", amount: 0, count: 0 }], cash: null }).length, 0);
  assert.equal(V.methodRows({ ...o, cash: { ...o.cash, expected: 0, cash_refunded: 0 }, by_method: [] }).length, 0);
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
  assert.deepEqual(view.destination.map(plain), ["за октябрь — 150 000"]);
  assert.equal(view.note, "=SUM(A1)"); // shown as text, never as a formula
  assert.deepEqual(view.links.map((l) => [l.key, l.label]), [["receipt", "Квитанция № 13"], ["student", "Карточка ученика"], ["statement", "Выписка по группе"]]);
  // «за сентябрь — 200 000 · аванс — 50 000» is two lines
  assert.deepEqual(V.destinationLines({ allocation_text: "за сентябрь — 200 000 · аванс — 50 000", allocations: [] }), ["за сентябрь — 200 000", "аванс — 50 000"]);
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
    "За октябрь пришло 3 450 000 сум — на 130% больше, чем за 1–21 сентября. Собрано 76% стоимости месяца.",
    "Поступило", "3 450 000 сум", "▲ 130% к 1–21 сентября", "7 оплат",
    "Собрано за месяц", "1 900 000 сум", "из 2 500 000 сум · 76%",
    "Долг на сегодня", "500 000 сум", "3 ученика", "Должники",
    "Аванс", "450 000 сум", "2 ученика оплатили вперёд",
    "Куда ушли деньги", "на старые долги", "1 000 000 сум", "29%", "на текущие периоды", "55%", "в аванс", "13%", "возвращено", "3%", "Сходится", "Прощено долгов: 100 000 сум",
    "Пришло по дням", "Касса по способам", "Click", "1 250 000 сум", "Наличные", "4 оплаты", "Перевод", "Карта",
  ]) assert.ok(body.includes(piece), piece);
  assert.ok(!body.includes("NaN") && !body.includes("undefined") && !body.includes("null"));
  {const rest=body.replace(plain(o.summary_text), "");const m=/(^|\s)—(\s|$)/.exec(rest);assert.ok(!m, "dash: "+(m&&rest.slice(m.index-40,m.index+40)));}
  assert.ok(!body.includes("должно быть в кассе")); // the till hint is a day's
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

test("a day: three cards (no «Собрано за месяц»), no chart, the till says how much cash must be in the box; a week: three cards and the chart", () => {
  const { React, text, html, P } = parts();
  const day = text(React.createElement(P.IncomeOverviewView, { overview: overview("I02_income_day_today_cash"), today: TODAY, paymentsBase: "/admin/payments", activeBucket: null, onPick: () => {} }));
  for (const piece of ["Сегодня пришло 250 000 сум; вчера оплат не было.", "Вчера оплат не было", "2 оплаты", "Касса по способам", "должно быть в кассе 150 000 сум", "принято 250 000 сум, возвращено 100 000 сум", "Сходится"]) assert.ok(day.includes(piece), piece);
  assert.ok(!day.includes("Собрано за месяц") && !day.includes("Пришло по дням"));
  const weekMarkup = html(React.createElement(P.IncomeOverviewView, { overview: overview("I03_income_week"), today: TODAY, paymentsBase: "/owner/payments", activeBucket: null, onPick: () => {} }));
  const week = plain(weekMarkup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  assert.ok(week.includes("▼ 69% к прошлой неделе") && week.includes("Пришло по дням") && !week.includes("Собрано за месяц"));
  assert.match(weekMarkup, /sm:grid-cols-2 xl:grid-cols-3/);
});

test("a quiet period: the sentence and the cards, no chart, no line of shares, no till; the zero is said in words", () => {
  const { React, text, P } = parts();
  const o = overview("I02_income_day_today_cash");
  const quiet = { ...o, summary_text: "Сегодня оплат не было; вчера оплат не было.", current: { ...o.current, received: 0, payments_count: 0, to_current: 0, refunded: 0, refunded_from_received: 0 }, by_method: [], cash: null, series: [{ bucket: TODAY, received: 0, count: 0 }], position: { ...o.position, debt_total: 0, students_with_debt: 0, advance_total: 0, students_with_advance: 0 }, delta_text: null, delta_direction: null };
  const body = text(React.createElement(P.IncomeOverviewView, { overview: quiet, today: TODAY, paymentsBase: "/owner/payments", activeBucket: null, onPick: () => {} }));
  for (const piece of ["Сегодня оплат не было", "оплат не было", "Долгов нет", "Авансов нет"]) assert.ok(body.includes(piece), piece);
  for (const absent of ["Куда ушли деньги", "Касса по способам", "Пришло по дням", "Должники"]) assert.ok(!body.includes(absent), absent);
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
  assert.match(markup, /text-right text-sm font-semibold tabular-nums md:col-start-4/);
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
  assert.ok(text(React.createElement(J.JournalSection, { ...base, journal: empty, empty: { kind: "day", focusLabel: null, narrowed: false } })).includes("За этот день оплат не было"));
  const narrowed = text(React.createElement(J.JournalSection, { ...base, journal: empty, empty: { kind: "day", focusLabel: null, narrowed: true } }));
  assert.ok(narrowed.includes("По этому запросу оплат не нашлось") && narrowed.includes("Сбросить поиск и фильтры"));
  assert.match(html(React.createElement(J.JournalSection, { ...base, journal: null })), /data-testid="journal-skeleton"/);
  const error = html(React.createElement(J.JournalSection, { ...base, journal: null, error: "Не удалось загрузить поступления" }));
  assert.match(error, /role="alert"/);
  assert.ok(text(React.createElement(J.JournalSection, { ...base, journal: null, error: "Не удалось загрузить поступления" })).includes("Повторить"));
  // nothing to export from an empty list
  assert.match(html(React.createElement(J.JournalSection, { ...base, journal: empty })), /disabled=""[^>]*>[^<]*<[^>]*>[^<]*<\/svg>Скачать Excel|Скачать Excel/);
});

test("the groups' collection on screen: worst first, bars, a row is a link to «Должники» of the group; one table, not two", () => {
  const { React, text, html, C } = parts();
  const o = overview("I01_income_month_october");
  const el = React.createElement(C.CollectionTable, { collection: o.collection, paymentsBase: "/owner/payments" });
  const body = text(el);
  for (const piece of ["Группа (преподаватель)", "Стоимость за месяц", "Оплачено", "Собрано", "Долг", "С долгом за месяц", "Математика 9А", "Пётр Иванов", "73%", "1 100 000 сум", "300 000 сум", "Всего", "76%"]) assert.ok(body.includes(piece), piece);
  assert.ok(body.indexOf("Математика 9А") < body.indexOf("Английский 7Б") && body.indexOf("Английский 7Б") < body.indexOf("Физика 10В"));
  const markup = html(el);
  assert.match(markup, /href="\/owner\/payments\?bucket=debt&amp;group_id=group%3AA"/);
  assert.equal((markup.match(/role="progressbar"/g) || []).length, 4); // three groups and the total
  assert.equal((markup.match(/data-testid="collection-row"/g) || []).length, 3);
  // a group without a debt says it in words, not with a dash
  const clean = { ...o.collection, groups: [{ ...o.collection.groups[0], debt: 0, students_with_debt: 0, pct: 100, paid: 1500000 }] };
  const quiet = text(React.createElement(C.CollectionTable, { collection: clean, paymentsBase: "/admin/payments" }));
  assert.ok(quiet.includes("нет") && !/(^|\s)—(\s|$)/.test(quiet));
  // a month without groups
  assert.ok(text(React.createElement(C.CollectionTable, { collection: { ...o.collection, groups: [] }, paymentsBase: "/owner/payments" })).includes("В этом месяце в группах ничего не начислено"));
});

// ── the screen's rules, read from the source ────────────────────────────────────────────────────

test("the page: «Поступления» v2 has the period bar, one table at a time, no old tables, the server's endpoints only", () => {
  const page = read("src/components/payments/income-page.tsx");
  const parts_ = ["income-parts", "income-journal", "income-collection"].map((name) => read(`src/components/payments/${name}.tsx`)).join("\n");
  const all = `${page}\n${parts_}`;
  assert.match(page, /role="tablist" aria-label="Период"/);
  assert.match(page, /PERIOD_TABS\.map/);
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
  assert.match(read("src/components/payments/income-parts.tsx"), /ScrollHint className="mt-1 overflow-x-auto"/);
  // cards stack in a column on a phone
  assert.match(read("src/components/payments/income-parts.tsx"), /grid grid-cols-1 gap-3 sm:grid-cols-2/);
  // the old conventions: no shouting captions
  assert.doesNotMatch(all, /uppercase|tracking-wider/);
  // numbers only from the server: the page never adds money up
  assert.doesNotMatch(all, /\.reduce\([^)]*amount|\+ point\.received|\.received \+/);
  // the vocabulary
  for (const word of ["Поступило", "Собрано за месяц", "Долг на сегодня", "Аванс", "Должники", "Куда ушли деньги", "Касса по способам", "Группы — собираемость"]) assert.ok(all.includes(word), word);
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

test("no hover-only reveal: the tooltip of a bar appears by hover and by focus (a tap focuses the pressed bar)", () => {
  const parts_ = read("src/components/payments/income-parts.tsx");
  assert.doesNotMatch(parts_, /onMouseEnter|onMouseOver|onPointerEnter/);
  assert.match(parts_, /opacity-0[^"`]*group-hover:opacity-100 group-focus-within:opacity-100/);
});

test("INCOME-2 addendum: «Способ не указан» as a filter, «Кто внёс» from two authors, the Excel limit, the note of «Должники» of a group", () => {
  const o = overview("I01_income_month_october");
  assert.equal(V.hasUnknownMethod(o), false);
  assert.equal(V.hasUnknownMethod({ by_method: [...o.by_method, { method: "unknown", label: "Способ не указан", amount: 1, count: 1 }] }), true);
  assert.equal(V.hasUnknownMethod(null), false);
  const page = read("src/components/payments/income-page.tsx");
  assert.match(page, /unknownMethod && <option value="unknown">Способ не указан<\/option>/);
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
  assert.match(read("src/components/payments/income-parts.tsx"), /data-testid="compare-hint"/);
});
