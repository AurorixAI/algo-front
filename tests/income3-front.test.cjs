// INCOME-3 (owner review of the stand 22.10): the card «Поступило» says two quiet lines, an empty period is said once, the phone chart opens at
// the last day with money, the tabs of «Оплаты» follow the group filter, the drawer speaks in «сум», the till says «центра», the week of the teacher
// does not count a lesson moved away or cancelled and says «11:00–12:00».
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
const P = require(path.join(root, "src/lib/payments.ts"));
const Plan = require(path.join(root, "src/lib/schedule-plan.ts"));
const plain = (text) => text.replace(/[\u00a0\u202f]/g, " ");
const overview = (name, patch = {}) => ({ ...V.normalizeOverview(fixture(name)), ...patch });
const TODAY = "2026-10-21";

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
    html: (element) => renderToStaticMarkup(element),
    text: (element) => plain(renderToStaticMarkup(element).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")).trim(),
  };
}
const parts = () => ({
  ...renderer(),
  P: require(path.join(root, "src/components/payments/income-parts.tsx")),
  J: require(path.join(root, "src/components/payments/income-journal.tsx")),
});
const count = (text, piece) => text.split(piece).length - 1;

// ── 1. the card «Поступило»: two quiet lines ────────────────────────────────────────────────────

test("«Поступило»: line 1 the delta (or the quiet «В августе оплат не было»), line 2 the count; no «сравнение с» line, the hint is a tooltip", () => {
  const month = overview("I01_income_month_october");
  const up = V.receivedCard(month);
  assert.deepEqual([up.delta.arrow, up.delta.text, up.countText], ["▲", "130% к 1–21 сентября", "7 оплат"]);
  assert.equal(up.hint, "сравнение с 1–21 сент."); // only the title of line 1
  const { React, text, html, P } = parts();
  const card = React.createElement(P.IncomeCards, { overview: month, paymentsBase: "/owner/payments" });
  const body = text(card);
  assert.ok(body.includes("▲ 130% к 1–21 сентября") && body.includes("7 оплат"));
  assert.ok(!body.includes("сравнение с"), "no third line");
  assert.match(html(card), /data-testid="received-delta"[^>]*title="сравнение с 1–21 сент\."/);
  // the previous period took nothing: the quiet sentence is line 1, the count is line 2
  const quiet = V.receivedCard(overview("I04_income_september_closed"));
  assert.deepEqual([quiet.delta.text, quiet.delta.tone, quiet.countText.length > 0], ["В августе оплат не было", "none", true]);
  // the server says what a running comparison means: it replaces the bare label at the end of the sentence
  const hinted = V.receivedCard({ ...month, delta_text: "170% к 12–15 окт.", previous_hint: "тем же дням прошлой недели", previous_period: { ...month.previous_period, label: "12–15 окт." } });
  assert.equal(hinted.delta.text, "170% к тем же дням прошлой недели");
  assert.equal(hinted.hint, "Сравнение с тем же дням прошлой недели");
  assert.equal(V.foldPreviousHint("130% к июлю", { ...month, previous_hint: "тем же дням" }), "130% к июлю", "the label is not at the end: the sentence stays");
  assert.equal(V.foldPreviousHint("130% к июлю", { ...month, previous_hint: "" }), "130% к июлю");
});

test("«Поступило» with nothing received: «0 сум», «Оплат не было» once; line 2 only when the previous period took money", () => {
  const base = overview("I02_income_day_today_cash");
  const zero = { ...base, current: { ...base.current, received: 0, payments_count: 0 }, previous: { ...base.previous, received: 300000, payments_count: 1 }, previous_label: "22 авг.", delta_text: null, delta_direction: null };
  const withPrevious = V.receivedCard(zero);
  assert.deepEqual([plain(withPrevious.amount), withPrevious.delta.text, plain(withPrevious.countText)], ["0 сум", "Оплат не было", "22 авг.: 300 000 сум"]);
  const nothingBefore = { ...zero, previous: { ...zero.previous, received: 0, payments_count: 0 } };
  const alone = V.receivedCard(nothingBefore);
  assert.deepEqual([alone.delta.text, alone.countText], ["Оплат не было", ""]);
  const { React, text, P } = parts();
  const body = text(React.createElement(P.IncomeCards, { overview: nothingBefore, paymentsBase: "/owner/payments" }));
  const card = body.slice(body.indexOf("Поступило"), body.indexOf("Долг на сегодня"));
  assert.equal(count(card.toLowerCase(), "оплат не было"), 1, `once: ${card}`);
  assert.ok(card.includes("0 сум"));
  // «вчера» → a capital letter
  assert.equal(plain(V.receivedCard({ ...zero, previous_label: "вчера" }).countText), "Вчера: 300 000 сум");
});

// ── 2. an empty period: one quiet line in the journal ──────────────────────────────────────────

test("an empty period: the journal is ONE quiet line (no search, no Excel); with a search / filter / bar the toolbar and the words stay", () => {
  const { React, html, text, J } = parts();
  const data = V.normalizeJournal(fixture("J01_journal_page1"));
  const empty = { ...data, rows: [], total: 0, totals: { count: 0, sum: 0, voided_count: 0 } };
  const base = { journal: empty, loading: false, error: null, onRetry() {}, search: "", onSearch() {}, createdBy: "", onCreatedBy() {}, authors: [], focusLabel: null, onClearFocus() {}, onResetNarrowing() {}, onPage() {}, onExport() {}, exporting: false, activeId: null, onOpen() {} };
  const quiet = React.createElement(J.JournalSection, { ...base, empty: { kind: "day", focusLabel: null, narrowed: false } });
  assert.equal(text(quiet), "Журнал оплат пуст");
  assert.ok(!html(quiet).includes("<input") && !html(quiet).includes("Скачать Excel"));
  assert.ok(!text(quiet).includes("оплат не было"), "the sentence and the card say it; the journal does not repeat it");
  const narrowed = html(React.createElement(J.JournalSection, { ...base, empty: { kind: "day", focusLabel: null, narrowed: true } }));
  assert.ok(narrowed.includes("<input") && narrowed.includes("Скачать Excel") && narrowed.includes("По этому запросу оплат не нашлось"));
  const bar = text(React.createElement(J.JournalSection, { ...base, focusLabel: "7 октября", empty: { kind: "month", focusLabel: "7 октября", narrowed: false } }));
  assert.ok(bar.includes("Оплаты: 7 октября") && bar.includes("В этот день оплат не было"));
  assert.equal(V.journalIsQuiet(empty, { narrowed: false, focusLabel: null }), true);
  assert.equal(V.journalIsQuiet(data, { narrowed: false, focusLabel: null }), false);
  assert.equal(V.journalIsQuiet(null, { narrowed: false, focusLabel: null }), false);
  // an error is never «пусто»
  assert.ok(html(React.createElement(J.JournalSection, { ...base, error: "Не удалось загрузить", empty: { kind: "day", focusLabel: null, narrowed: false } })).includes('role="alert"'));
  // the page drops the «Оплаты» heading as well, so nothing but the line is left
  const page = read("src/components/payments/income-page.tsx");
  assert.match(page, /quietJournal = !journal\.error && journalIsQuiet\(journal\.data, \{ narrowed, focusLabel/);
  assert.match(page, /\) : quietJournal \? null : \(\s*<h2/);
});

// ── 3. the chart on a phone ────────────────────────────────────────────────────────────────────

test("the chart opens at the last day with money (else today, else the end) and scrolls only its own box; lower on a phone", () => {
  const month = overview("I01_income_month_october");
  const bars = V.chartBars(month, TODAY);
  const lastWithData = bars.map((bar) => bar.range !== null).lastIndexOf(true);
  assert.equal(V.chartFocusIndex(bars, TODAY), lastWithData);
  assert.ok(lastWithData > 0, "there is money in the period");
  // no money at all: today; today outside the series: the last bar
  const blank = bars.map((bar) => ({ ...bar, range: null }));
  assert.equal(V.chartFocusIndex(blank, TODAY), blank.findIndex((bar) => bar.bucket === TODAY));
  assert.equal(V.chartFocusIndex(blank, "2027-01-01"), blank.length - 1);
  assert.equal(V.chartFocusIndex([], TODAY), 0);
  assert.equal(V.chartFocusIndex([{ bucket: "2026-10", range: null }, { bucket: "2026-11", range: null }], "2026-11-05"), 1, "months: the month of today");
  // the right edge of the bar at the right edge of the view; never negative, never beyond the end
  assert.equal(V.chartScrollLeft({ barRight: 600, viewWidth: 358, contentWidth: 806 }), 250);
  assert.equal(V.chartScrollLeft({ barRight: 100, viewWidth: 358, contentWidth: 806 }), 0);
  assert.equal(V.chartScrollLeft({ barRight: 800, viewWidth: 358, contentWidth: 806 }), 448);
  assert.equal(V.chartScrollLeft({ barRight: 300, viewWidth: 358, contentWidth: 300 }), 0, "nothing to scroll on a desktop");
  const src = read("src/components/payments/income-parts.tsx");
  const chartSrc = src.slice(src.indexOf("export function IncomeChart"), src.indexOf("// ── «Касса по способам»"));
  assert.match(chartSrc, /box\.scrollLeft = chartScrollLeft\(/);
  assert.doesNotMatch(chartSrc, /scrollIntoView/, "the page never jumps");
  assert.match(chartSrc, /\[days, focusIndex\]/); // again only for another set of days
  assert.match(chartSrc, /h-24[^"]*md:h-36/); // lower on a phone
  assert.match(chartSrc, /md:hidden">Нажмите на день, чтобы увидеть оплаты/); // a short hint on a phone
  const { React, html, P } = parts();
  const markup = html(React.createElement(P.IncomeChart, { bars, today: TODAY, title: "Пришло по дням", activeBucket: null, onPick() {} }));
  assert.ok(markup.includes("Нажмите на столбик, и ниже появятся оплаты этого дня") && markup.includes("Нажмите на день"));
});

// ── 4. the tabs of «Оплаты» follow the filter ──────────────────────────────────────────────────

test("tab counts under a group / teacher filter come from /payments/status with the same filter; the centre's summary stays for the banner", async () => {
  const calls = [];
  const rows = (ids) => ids.map((id) => ({ student_id: id }));
  const answers = { debt: { total: 3, items: rows(["a", "b", "a"]) }, expiring: { total: 1, items: rows(["c"]) }, active: { total: 7, items: rows(["d"]) }, paused: { total: 0, items: [] } };
  const counts = await P.filteredTabCounts(async (query) => { calls.push(query); return answers[query.bucket]; });
  assert.deepEqual(counts, { debt: 2, expiring: 1, active: 7, paused: 0 }, "debtors are students (a, b), the rest memberships");
  assert.deepEqual(calls.map((query) => query.bucket).sort(), ["active", "debt", "expiring", "paused"]);
  assert.ok(calls.filter((query) => query.bucket !== "debt").every((query) => query.limit === 1), "only the total is wanted");
  // more debtors than one answer holds: the exact total instead of a guess
  assert.equal((await P.filteredTabCounts(async (query) => (query.bucket === "debt" ? { total: 900, items: rows(["a", "b"]) } : { total: 0, items: [] }))).debt, 900);
  // the tab bar reads the narrowed numbers: «Должники (2) / Оплачено (7)»; none while they are on their way
  const summary = P.narrowedTabSummary(counts);
  assert.deepEqual(P.visibleBuckets(summary, "debt").map((tab) => P.bucketTabLabel(tab.label, P.bucketCount(summary, tab.key))), ["Должники (2)", "Скоро платить (1)", "Оплачено (7)"]);
  assert.equal(P.narrowedTabSummary(null), null);
  assert.equal(P.bucketCount(P.narrowedTabSummary(null), "debt"), null);
  const page = read("src/components/payments/payments-page.tsx");
  assert.match(page, /const summaryForTabs = narrowed \? narrowedTabSummary\(narrowedCounts\) : summaryLoaded \?/);
  assert.match(page, /teacherId: filter\.groupId \? undefined : filter\.teacherId \|\| undefined,\s*limit: query\.limit/); // the same filter as the list
  assert.match(page, /void loadNarrowedCounts\(\);\s*void refreshSummary\(true\)/); // refreshed after a payment
  // the banner and the badge are the centre's: they never read the narrowed counts
  assert.doesNotMatch(read("src/components/payments/payments-alert-banner.tsx"), /narrowed|filteredTabCounts/);
  assert.doesNotMatch(read("src/lib/payments-summary.ts"), /filteredTabCounts/);
});

// ── 5. the drawer ──────────────────────────────────────────────────────────────────────────────

test("«Куда пошли деньги»: «сум» after every amount, «за период 22.10–21.11 — 450 000 сум»; the server's own words are kept", () => {
  assert.equal(plain(V.humanDestinationLine("за 22.10–21.11 — 450 000")), "за период 22.10–21.11 — 450 000 сум");
  assert.equal(plain(V.humanDestinationLine("за период 22.10–21.11 — 450 000 сум")), "за период 22.10–21.11 — 450 000 сум");
  assert.equal(plain(V.humanDestinationLine("за октябрь — 150 000")), "за октябрь — 150 000 сум");
  assert.equal(plain(V.humanDestinationLine("аванс — 50 000 сум")), "аванс — 50 000 сум");
  assert.equal(plain(V.humanDestinationLine("возвращено — 100 000")), "возвращено — 100 000 сум");
  const row = { allocation_text: "за 22.10–21.11 — 450 000 · аванс — 50 000", allocations: [{ label: "из списка", amount: 1 }] };
  assert.deepEqual(V.destinationLines(row).map(plain), ["за период 22.10–21.11 — 450 000 сум", "аванс — 50 000 сум"], "the server's text wins over the list of allocations");
  assert.deepEqual(V.destinationLines({ allocation_text: null, allocations: [{ label: "Аванс на 01.11–30.11", amount: 50000 }] }).map(plain), ["Аванс на 01.11–30.11 — 50 000 сум"]);
});

// ── 6. the till ────────────────────────────────────────────────────────────────────────────────

test("the till says the server's scope_text verbatim; without it the front's words as before", () => {
  const day = overview("I02_income_day_today_cash");
  const scoped = { ...day, cash: { ...day.cash, filtered_view: true, scope_text: "в кассе центра за 15 октября (все группы)" } };
  const cash = V.methodRows(scoped, { groupId: "g1" }).find((row) => row.method === "cash");
  assert.equal(plain(cash.hint), `в кассе центра за 15 октября (все группы): ${plain(P.formatMoney(day.cash.expected))}`);
  assert.ok(V.cashHint({ expected: 5000, scope_text: "в кассе центра за сегодня (все группы)" }, true).startsWith("в кассе центра за сегодня (все группы): "));
  assert.equal(V.cashHint({ expected: 5000, scope_text: "в кассе центра: 5 000 сум" }, true), "в кассе центра: 5 000 сум", "a text that already has the sum is not extended");
  assert.equal(plain(V.cashHint({ expected: 5000, scope_text: null }, true)), "В кассе центра за сегодня (все группы): 5 000 сум");
  assert.equal(plain(V.cashHint({ expected: 5000 }, false)), "должно быть в кассе 5 000 сум");
  const raw = fixture("I02_income_day_today_cash");
  assert.equal(V.normalizeOverview({ ...raw, cash: { ...raw.cash, scope_text: "в кассе центра за сегодня (все группы)" } }).cash.scope_text, "в кассе центра за сегодня (все группы)");
});

// ── «Куда ушли деньги»: the kinds are the server's ─────────────────────────────────────────────

test("«Куда ушли деньги» shows whatever kinds and labels the server sends; a kind keeps its colour, an unknown one is grey", () => {
  const month = overview("I01_income_month_october");
  const strip = [
    { kind: "old_debt", label: "на старые долги", amount: 1000000 },
    { kind: "current", label: "на текущий месяц", amount: 1000000 },
    { kind: "forward", label: "за будущие месяцы", amount: 500000 },
    { kind: "advance", label: "в аванс", amount: 500000 },
    { kind: "mystery", label: "что-то новое", amount: 1000000 },
    { kind: "zero", label: "ноль", amount: 0 },
  ];
  const shown = V.flowParts({ ...month, strip });
  assert.deepEqual(shown.map((part) => part.key), ["old_debt", "current", "forward", "advance", "mystery"], "a zero part is not drawn, the order is the server's");
  assert.deepEqual(shown.map((part) => part.label), ["на старые долги", "на текущий месяц", "за будущие месяцы", "в аванс", "что-то новое"]);
  assert.equal(shown.reduce((total, part) => total + part.percent, 0), 100);
  assert.equal(shown[4].dot, V.FLOW_DOT_UNKNOWN);
  assert.equal(new Set(shown.slice(0, 4).map((part) => part.dot)).size, 4, "four kinds, four colours");
  // a kind has one colour whatever else is present
  assert.equal(V.flowParts({ ...month, strip: [strip[3]] })[0].dot, shown[3].dot);
  assert.equal(V.flowDot("to_advance"), V.flowDot("advance"), "the older server's names keep theirs");
  // without `strip` (an older server): the fixed fields, as before
  assert.deepEqual(V.flowParts(month).map((part) => part.key), ["to_past_debt", "to_current", "to_advance", "refunded"]);
  // the screen draws them
  const { React, text, P: Parts } = parts();
  const body = text(React.createElement(Parts.FlowLine, { overview: { ...month, strip } }));
  assert.ok(body.includes("за будущие месяцы") && body.includes("что-то новое"));
  const raw = fixture("I01_income_month_october");
  assert.equal(V.normalizeOverview({ ...raw, strip: [{ kind: "current", label: "на текущий", amount: 5 }] }).strip[0].kind, "current");
  assert.equal(V.normalizeOverview(raw).strip, null);
});

// ── 7. the teacher's week ──────────────────────────────────────────────────────────────────────

test("the week plan counts only the lessons of the plan: a lesson moved away or cancelled is muted and not counted", () => {
  const moved = { kind: "rescheduled", movedTo: { date: "2026-10-24", startTime: "14:00" } };
  const items = [
    { date: "2026-10-23", status: "cancelled", outcome: moved }, // the original of a move (Fri 11:00)
    { date: "2026-10-23", status: "scheduled" },
    { date: "2026-10-24", status: "scheduled" },
    { date: "2026-10-24", status: "scheduled" }, // the new lesson of the move
    { date: "2026-10-21", status: "cancelled", outcome: { kind: "cancelled" } },
    { date: "2026-10-20", status: "completed" },
  ];
  const plan = Plan.weekPlan(items, "2026-10-22");
  assert.deepEqual([plan.planned, plan.completed, plan.cancelled, plan.moved], [4, 1, 1, 1]);
  assert.equal(plan.remaining, 3);
  // the moved original is out of the plan even before its status has reached the page
  assert.equal(Plan.weekPlan([{ date: "2026-10-23", status: "scheduled", outcome: moved }], "2026-10-22").planned, 0);
  assert.equal(Plan.outOfPlan({ status: "scheduled", outcome: moved }), "moved");
  assert.equal(Plan.outOfPlan({ status: "cancelled" }), "cancelled");
  assert.equal(Plan.outOfPlan({ status: "completed" }), null);
  const progress = (done, total) => `Завершено: ${done} из ${total}`;
  assert.equal(Plan.weekPlanDescription(plan, progress), "Завершено: 1 из 4");
  assert.equal(Plan.weekPlanDescription({ planned: 0, completed: 0, cancelled: 1, moved: 1 }, progress), "Все занятия недели отменены или перенесены");
  assert.equal(Plan.weekPlanDescription({ planned: 0, completed: 0, cancelled: 0, moved: 0 }, progress), "На эту неделю уроков нет");
  assert.equal(Plan.weekPlanDescription({ planned: 2, completed: 2, cancelled: 0, moved: 0 }, progress), "План недели выполнен");
  // the words of the card
  assert.equal(Plan.movedAwayChip(moved.movedTo), "Перенесён на сб, 24.10, 14:00");
  assert.equal(Plan.movedAwayChip(null), "Перенесён");
  assert.equal(Plan.timeRange("11:00", "12:00"), "11:00–12:00");
  assert.equal(Plan.placeText({ room: null }), null);
  assert.equal(Plan.placeText({ room: "  " }), null);
  assert.equal(Plan.placeText({ room: "204" }), "204");
  assert.equal(Plan.placeText({ format: "online", room: null }), "Онлайн");
});

test("the teacher's schedule page is wired to it: the muted card, the counts from weekPlan, no «Кабинет не указан», «11:00–12:00»", () => {
  const page = read("src/app/teacher/schedule/page.tsx");
  assert.match(page, /const plan = weekPlan\(/);
  assert.match(page, /return \{ \.\.\.plan, completionTarget: plan\.planned \}/);
  assert.match(page, /data-testid="week-card-muted"/);
  assert.match(page, /movedAwayChip\(l\.substitutionOutcome\?\.movedTo\)/);
  const at = page.indexOf('data-testid="week-card-muted"');
  const card = page.slice(at - 200, at + 900);
  assert.doesNotMatch(card, /onClick|openLesson/, "no action on a muted card");
  assert.match(card, /line-through/);
  assert.match(page, /weekPlanDescription\(weekKpi, completedLessonsProgressLabel\)/);
  assert.match(page, /isMovedAway\(lesson\.substitutionOutcome\)\) \{\s*return \{ lesson, lifecycle, label: "Перенесён"/);
  assert.doesNotMatch(page, /roomLabel\(/, "the room only when it is set");
  assert.doesNotMatch(page, /\{l\.startTime\} - \{l\.endTime\}|\{l\.startTime\} — \{l\.endTime\}|\{row\.lesson\.startTime\} — /, "an en dash without spaces");
  assert.match(page, /timeRange\(l\.startTime, l\.endTime\)/);
});

// ── 8. the group's schedule ────────────────────────────────────────────────────────────────────

test("the group's card of a lesson moved away is muted and does not count in «today»", () => {
  const src = read("src/components/groups/group-schedule-overview.tsx");
  assert.match(src, /const off = outOfPlan\(\{ status: lessonState, outcome \}\)/);
  assert.match(src, /off \? "bg-slate-50 opacity-75"/);
  assert.match(src, /off \? "text-slate-400 line-through"/);
  assert.match(src, /statuses\.length === 1 \? "Занятие ожидает начала" : `Сегодня запланировано занятий: \$\{statuses\.length\}`/);
  assert.deepEqual([Plan.todayPlanLines(["moved"]).title, Plan.todayPlanLines(["moved", "cancelled"]).title, Plan.todayPlanLines(["cancelled"]).title], ["Занятие на сегодня перенесено", "Занятие на сегодня отменено", "Занятие на сегодня отменено"]);
  assert.equal(Plan.todayPlanLines(["moved"]).moved, true);
});

test("income3 is part of test:display", () => {
  assert.match(read("package.json"), /tests\/income3-front\.test\.cjs/);
});
