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
  assert.ok(bar.includes("7 октября") && bar.includes("В этот день оплат не было"));
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
  const chartSrc = src.slice(src.indexOf("export function IncomeChart"), src.indexOf("// ── «Чем платили»"));
  assert.match(chartSrc, /box\.scrollLeft = chartScrollLeft\(/);
  assert.doesNotMatch(chartSrc, /scrollIntoView/, "the page never jumps");
  assert.match(chartSrc, /\[days, focusIndex\]/); // again only for another set of days
  assert.match(chartSrc, /h-24[^"]*md:h-auto md:min-h-\[9rem\] md:flex-1/); // lower on a phone, fills the card from md
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
  // the tab bar reads the narrowed numbers: «Должники (2) / Без долга (7)»; none while they are on their way
  const summary = P.narrowedTabSummary(counts);
  assert.deepEqual(P.visibleBuckets(summary, "debt").map((tab) => P.bucketTabLabel(tab.label, P.bucketCount(summary, tab.key))), ["Должники (2)", "Скоро платить (1)", "Без долга (7)"]);
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

test("the till of today reads only the server's `cash` block (normalised); the old scope_text stays in the contract", () => {
  const raw = fixture("I02_income_day_today_cash");
  assert.equal(V.normalizeOverview({ ...raw, cash: { ...raw.cash, scope_text: "в кассе центра за сегодня (все группы)" } }).cash.scope_text, "в кассе центра за сегодня (все группы)");
  assert.equal(V.cashHint, undefined, "the per-method till hint is gone: the donut card has one line for it");
  assert.equal(V.cashIsCentreWide, undefined);
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

// ── 9. INCOME-4 (inc4 review): the drawer names the kind, the debt numbers explain each other, contrast, phone tabs, strip colours ──

const hexLum = (hex) => {
  const channel = (i) => { const v = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
};
const contrast = (a, b) => { const [hi, lo] = [hexLum(a), hexLum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

const alloc = (bucket, from, to, amount) => ({ segment_id: `s:${from}`, period_from: from, period_to: to, amount, days: 1, bucket, closes: false, label: "", price: 0, segment_remaining_after: 0 });
const splitRow = (split, allocations, extra = {}) => ({ allocation_text: "за что-то — 1 сум", allocations, split, paid_on: "2026-10-15", ...extra });

test("I03: «Куда пошли деньги» names the kind from the row's split (forward / advance / old debt / current), the server's allocation_text only as the fallback", () => {
  const forward = splitRow([{ kind: "forward", label: "вперёд (за будущие периоды)", amount: 100000 }], [alloc("advance", "2026-10-20", "2026-11-19", 100000)]);
  assert.deepEqual(V.destinationLines(forward).map(plain), ["Вперёд — за период 20.10–19.11 (начался после оплаты) · 100 000 сум"]);
  const advance = splitRow([{ kind: "advance", label: "пока не потрачено (аванс)", amount: 200000 }], [alloc("advance", "2026-11-01", "2026-11-30", 200000)]);
  assert.deepEqual(V.destinationLines(advance).map(plain), ["Аванс (пока не потрачен) · 200 000 сум"]);
  const old = splitRow([{ kind: "old_debt", label: "на старые долги", amount: 300000 }], [alloc("past_debt", "2026-09-01", "2026-09-30", 300000)]);
  assert.deepEqual(V.destinationLines(old).map(plain), ["Старый долг за сентябрь · 300 000 сум"]);
  const oldOdd = splitRow([{ kind: "old_debt", label: "на старые долги", amount: 300000 }], [alloc("past_debt", "2026-09-20", "2026-10-19", 300000)]);
  assert.deepEqual(V.destinationLines(oldOdd).map(plain), ["Старый долг за период 20.09–19.10 · 300 000 сум"]);
  const mixed = splitRow([{ kind: "current", label: "за текущий период", amount: 600000 }, { kind: "forward", label: "x", amount: 100000 }, { kind: "advance", label: "y", amount: 200000 }],
    [alloc("current", "2026-10-01", "2026-10-31", 600000), alloc("advance", "2026-11-01", "2026-11-30", 100000), alloc("advance", "2026-12-01", "2026-12-31", 200000)]);
  assert.deepEqual(V.destinationLines(mixed).map(plain), ["Текущий период — за октябрь · 600 000 сум", "Вперёд — за ноябрь (начался после оплаты) · 100 000 сум", "Аванс (пока не потрачен) · 200 000 сум"]);
  // allocations that do not add up to the part: the kind and the amount are still said, no guessed period
  assert.deepEqual(V.destinationLines(splitRow([{ kind: "old_debt", label: "", amount: 5 }], [])).map(plain), ["Старый долг · 5 сум"]);
  // an unknown kind uses the server's label; a zero part is not shown
  assert.deepEqual(V.destinationLines(splitRow([{ kind: "refunded", label: "возвращено", amount: 7000 }, { kind: "advance", label: "", amount: 0 }], [])).map(plain), ["Возвращено · 7 000 сум"]);
  // no split (an older server) -> the sentence of the server, as before
  assert.deepEqual(V.destinationLines({ allocation_text: "за сентябрь — 200 000 · аванс — 50 000", allocations: [], split: [] }), ["за сентябрь — 200 000 сум", "аванс — 50 000 сум"]);
  assert.deepEqual(V.normalizeJournal({ ...fixture("J01_journal_page1"), rows: [{ ...fixture("J01_journal_page1").rows[0], split: undefined }] }).rows[0].split, []);
});

test("I03: the drawer lines carry the colour dot of the kind, the same as the strip legend", () => {
  const { React, html, text, J } = parts();
  const row = { ...V.normalizeJournal(fixture("J01_journal_page1")).rows[0], status: "active", ...splitRow([{ kind: "forward", label: "", amount: 100000 }, { kind: "advance", label: "", amount: 200000 }],
    [alloc("advance", "2026-10-20", "2026-11-19", 100000), alloc("advance", "2026-12-01", "2026-12-31", 200000)]) };
  const drawer = React.createElement(J.JournalDrawerBody, { row, paymentsBase: "/owner/payments", studentProfileBasePath: "/owner/students" });
  const markup = html(drawer);
  const list = markup.slice(markup.indexOf('data-testid="drawer-destination"'));
  assert.ok(list.includes(`rounded-sm ${V.flowDot("forward")}`) && list.includes(`rounded-sm ${V.flowDot("advance")}`));
  assert.ok(text(drawer).includes("Вперёд — за период 20.10–19.11 (начался после оплаты) · 100 000 сум"));
});

test("strip colours: «вперёд» is violet, clearly apart from «аванс» (green) and «за текущий период» (blue); each segment has ≥3:1 against white", () => {
  assert.equal(V.flowDot("forward"), "bg-violet-500");
  assert.equal(V.flowDot("advance"), "bg-emerald-600");
  assert.notEqual(V.flowDot("forward"), V.flowDot("current"));
  // tailwind 3 hexes
  const hex = { forward: "#8b5cf6", advance: "#059669", current: "#2563eb", old_debt: "#334155", refunded: "#fbbf24", transferred: "#cbd5e1" };
  for (const kind of ["forward", "advance", "current", "old_debt"]) assert.ok(contrast(hex[kind], "#ffffff") >= 3, `${kind} against white`);
  const unit = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = unit(hex.forward), [r2, g2, b2] = unit(hex.advance), [r3, g3, b3] = unit(hex.current);
  assert.ok(Math.hypot(r1 - r2, g1 - g2, b1 - b2) > 120, "forward vs advance");
  assert.ok(Math.hypot(r1 - r3, g1 - g3, b1 - b3) > 100, "forward vs current");
  assert.ok(!/teal/.test(read("src/lib/payments-income-v2.ts").slice(read("src/lib/payments-income-v2.ts").indexOf("FLOW_DOT"), read("src/lib/payments-income-v2.ts").indexOf("FLOW_DOT_UNKNOWN"))));
});

test("debt numbers: «Долг» header, and one quiet line under the total when the month's debt differs from «Долг на сегодня»", () => {
  const { React, text, html } = parts();
  const C = require(path.join(root, "src/components/payments/income-collection.tsx"));
  const o = overview("I01_income_month_october");
  const total = o.collection.total.debt;
  assert.equal(V.collectionDebtNote(o.collection, total), null, "the same number: nothing is said");
  assert.equal(V.collectionDebtNote(o.collection, null), null);
  const note = V.collectionDebtNote({ ...o.collection, month_label: "октябрь 2026", total: { ...o.collection.total, debt: 1800000 } }, 1950000);
  assert.equal(plain(note), "Долг за октябрь — 1 800 000 сум. Всего долг на сегодня — 1 950 000 сум (с прошлыми месяцами).");
  const el = (debtToday) => React.createElement(C.CollectionTable, { collection: o.collection, paymentsBase: "/owner/payments", debtToday });
  assert.match(html(el(total + 150000)), /data-testid="collection-debt-note"/);
  assert.ok(text(el(total + 150000)).includes("(с прошлыми месяцами)"));
  assert.ok(!html(el(total)).includes("collection-debt-note") && !html(el(undefined)).includes("collection-debt-note"));
  assert.ok(text(el(total)).includes("Долг") && !text(el(total)).includes("Долг за месяц"), "the column is «Долг»");
  const src = read("src/components/payments/income-collection.tsx");
  assert.match(src, /<span data-col="debt" className="text-right">Долг<\/span>/);
  assert.match(read("src/components/payments/income-page.tsx"), /debtToday=\{overview\.data\?\.position\.debt_total \?\? null\}/);
});

test("I07: «Журнал оплат пуст» is the normal secondary grey (slate-600 ≥ 4.5:1), not slate-400", () => {
  const src = read("src/components/payments/income-journal.tsx");
  assert.match(src, /className="px-1 text-sm text-slate-600" data-testid="journal-quiet"/);
  assert.ok(contrast("#475569", "#ffffff") >= 4.5);
  assert.ok(contrast("#94a3b8", "#ffffff") < 4.5, "slate-400 was the defect");
});

test("the period bar: the month navigator and one «Свой период» button; no tab strip, no day / week UI", () => {
  const page = read("src/components/payments/income-page.tsx");
  const bar = page.slice(page.indexOf("export function PeriodBar"), page.indexOf("function FiltersBar"));
  assert.doesNotMatch(bar, /role="tablist"|PERIOD_TABS|type="date" aria-label=\{`Выбрать|Предыдущий день|Предыдущая неделя/);
  assert.match(bar, /Свой период/);
  assert.match(bar, /aria-label="Вернуться к месяцу"/); // the ✕ of the chip
  assert.match(bar, /aria-label="С какого дня"/); // the existing custom-range picker
  assert.match(bar, /aria-label="По какой день"/);
  assert.match(bar, /rangeChipText\(period, today\)/);
  assert.match(bar, /monthOfPeriod\(period, today\)/);
  assert.match(page, /useState<Period>\(initial\.period\)/, "the page opens on the period of the address, the current month without one (IA audit F34)");
  assert.equal(require(path.join(root, "src/lib/payments-income-v2.ts")).parseIncomeQuery(new URLSearchParams(""), "2026-10-22").period.from, "2026-10-01");
  const { React, html } = parts();
  const P = require(path.join(root, "src/components/payments/income-page.tsx"));
  const month = html(React.createElement(P.PeriodBar, { period: V.periodOf("month", TODAY), today: TODAY, onChange() {} }));
  assert.match(month, /data-testid="period-title"[^>]*>Октябрь 2026 г\./);
  assert.ok(!month.includes("period-chip") && month.includes("Свой период") && !month.includes("Неделя") && !month.includes("День"));
  const custom = html(React.createElement(P.PeriodBar, { period: { kind: "custom", from: "2026-10-12", to: "2026-10-18" }, today: TODAY, onChange() {} }));
  assert.match(custom, /data-testid="period-chip"[^>]*>12\.10 – 18\.10<button[^>]*aria-label="Вернуться к месяцу"/);
  assert.ok(!custom.includes("period-title"));
});
