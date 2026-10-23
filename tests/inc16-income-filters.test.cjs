// INC-16 («Поступления», owner-approved): one insight under «Куда ушли деньги», the parts of the strip filter the journal (`kind`), a click never moves the page
// (a notice near the widget + «К списку ↓» + chips above the journal), cancelled and corrected payments are behind a toggle (`status=active` by default).
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
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/income2", `${name}.json`), "utf8"));
const V = require(path.join(root, "src/lib/payments-income-v2.ts"));
const P = require(path.join(root, "src/components/payments/income-parts.tsx"));
const J = require(path.join(root, "src/components/payments/income-journal.tsx"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const plain = (value) => value.replace(/[  ]/g, " ");
const html = (element) => renderToStaticMarkup(element);
const text = (element) => plain(html(element).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")).trim();

/** The elements of a React tree (a function component without hooks is called, so that its own markup is walked too). */
function walk(node, visit) {
  if (node === null || node === undefined || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return;
  if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return; }
  visit(node);
  walk(node.props?.children, visit);
}
const find = (node, testId) => { const out = []; walk(node, (element) => { if (element.props?.["data-testid"] === testId) out.push(element); }); return out; };

const overview = (name, patch = {}) => ({ ...V.normalizeOverview(fixture(name)), ...patch });
const withStrip = (received, parts) => {
  const base = overview("I01_income_month_october");
  return { ...base, current: { ...base.current, received }, strip: parts.map(([kind, amount]) => ({ kind, label: kind, amount })) };
};

// ── 1. the insight ──────────────────────────────────────────────────────────────────────────────

test("the insight: old debts ≥ 50 % → «оплаты отстают»; advance ≥ 30 % → «запас»; otherwise nothing; the thresholds are constants", () => {
  assert.equal(V.INSIGHT_OLD_DEBT_PERCENT, 50);
  assert.equal(V.INSIGHT_ADVANCE_PERCENT, 30);
  assert.equal(V.INSIGHT_OLD_DEBT_TEXT, "Больше половины денег закрыли старые долги — оплаты отстают.");
  assert.equal(V.INSIGHT_ADVANCE_TEXT, "Много оплат вперёд — у центра запас на следующие периоды.");
  // old debts: 49.9 % → nothing, exactly 50 % → the sentence, more → the sentence
  assert.equal(V.flowInsight(withStrip(1000, [["old_debt", 499], ["current", 501]])), null);
  assert.equal(V.flowInsight(withStrip(1000, [["old_debt", 500], ["current", 500]])), V.INSIGHT_OLD_DEBT_TEXT);
  assert.equal(V.flowInsight(withStrip(1000, [["old_debt", 800], ["current", 200]])), V.INSIGHT_OLD_DEBT_TEXT);
  // advance: 29.9 % → nothing, exactly 30 % → the sentence
  assert.equal(V.flowInsight(withStrip(1000, [["current", 701], ["advance", 299]])), null);
  assert.equal(V.flowInsight(withStrip(1000, [["current", 700], ["advance", 300]])), V.INSIGHT_ADVANCE_TEXT);
  // «вперёд» (forward) is not an advance; a calm month says nothing
  assert.equal(V.flowInsight(withStrip(1000, [["current", 400], ["forward", 600]])), null);
  assert.equal(V.flowInsight(withStrip(1000, [["old_debt", 200], ["current", 600], ["advance", 200]])), null);
  // both: the worse news first
  assert.equal(V.flowInsight(withStrip(1000, [["old_debt", 500], ["advance", 500]])), V.INSIGHT_OLD_DEBT_TEXT);
  // nothing received: nothing to say
  assert.equal(V.flowInsight(withStrip(0, [["old_debt", 0]])), null);
  // an older server (fixed fields): the fixture has 29 % of old debts and 13 % of advance → nothing; a patched one speaks
  assert.equal(V.flowInsight(overview("I01_income_month_october")), null);
  const old = overview("I01_income_month_october");
  assert.equal(V.flowInsight({ ...old, current: { ...old.current, to_past_debt: 2000000 } }), V.INSIGHT_OLD_DEBT_TEXT);
});

test("the insight is one sentence under the legend, only when it means something", () => {
  const speaking = withStrip(1000, [["old_debt", 600], ["current", 400]]);
  const markup = html(React.createElement(P.FlowLine, { overview: speaking }));
  assert.equal((markup.match(/data-testid="flow-insight"/g) || []).length, 1);
  assert.ok(text(React.createElement(P.FlowLine, { overview: speaking })).includes(V.INSIGHT_OLD_DEBT_TEXT));
  assert.ok(markup.indexOf('data-testid="flow-insight"') > markup.lastIndexOf('data-testid="flow-current"'), "under the legend");
  assert.ok(!html(React.createElement(P.FlowLine, { overview: withStrip(1000, [["old_debt", 100], ["current", 900]]) })).includes("flow-insight"));
});

// ── 2. the strip and the legend filter the journal ──────────────────────────────────────────────

test("strip segments and legend lines are buttons (aria-label, aria-pressed); returned / moved are not; a click reports the kind", () => {
  const data = withStrip(1000, [["old_debt", 300], ["current", 300], ["forward", 100], ["advance", 100], ["refunded", 100], ["transferred", 100]]);
  const picked = [];
  const tree = P.FlowLine({ overview: data, kind: "current", onPickKind: (kind) => picked.push(kind) });
  const segments = find(tree, "flow-segment");
  const legend = find(tree, "flow-legend-row");
  assert.deepEqual(segments.map((el) => el.props["data-kind"]), ["old_debt", "current", "forward", "advance"]);
  assert.deepEqual(legend.map((el) => el.props["data-kind"]), ["old_debt", "current", "forward", "advance"]);
  assert.deepEqual(segments.map((el) => el.props["aria-pressed"]), [false, true, false, false]);
  assert.deepEqual(legend.map((el) => el.props["aria-pressed"]), [false, true, false, false]);
  for (const el of [...segments, ...legend]) assert.ok(el.props.type === "button" && /Показать оплаты/.test(el.props["aria-label"]), "a native button: Enter / Space work; the label says what it does");
  segments[0].props.onClick();
  legend[3].props.onClick();
  assert.deepEqual(picked, ["old_debt", "advance"]);
  // «возвращено» / «переведено» have no payment rows of their own: plain text
  const markup = html(React.createElement(P.FlowLine, { overview: data, onPickKind: () => {} }));
  assert.equal((markup.match(/data-testid="flow-segment"/g) || []).length, 4);
  assert.match(markup, /data-testid="flow-refunded"/);
  assert.match(markup, /role="group"[^>]*aria-label="Куда ушли деньги по видам"|aria-label="Куда ушли деньги по видам"[^>]*role="group"/);
});

test("the older server's fixed fields map to the same kinds; unknown parts are not clickable", () => {
  assert.deepEqual(["old_debt", "current", "forward", "advance", "refunded", "transferred", "to_past_debt", "to_current", "to_advance", "other"].map(V.flowKindOf),
    ["old_debt", "current", "forward", "advance", null, null, "old_debt", "current", "advance", null]);
});

test("a click on a part → the query has `kind`; again → no `kind`; combined with the day and the method; defensively: a refusing server makes the strip static", () => {
  const month = V.periodOf("month", "2026-10-21");
  const day = { from: "2026-10-15", to: "2026-10-15", label: "15 октября" };
  assert.equal(V.toggleKind("", "old_debt"), "old_debt");
  assert.equal(V.toggleKind("old_debt", "old_debt"), "");
  assert.equal(V.toggleKind("old_debt", "advance"), "advance");
  const one = V.journalQuery(month, null, V.NO_FILTERS, { q: "", createdBy: "", kind: V.toggleKind("", "old_debt") });
  assert.equal(one.kind, "old_debt");
  assert.equal("kind" in V.journalQuery(month, null, V.NO_FILTERS, { q: "", createdBy: "", kind: V.toggleKind("old_debt", "old_debt") }), false);
  const all = V.journalQuery(month, day, { method: "cash" }, { q: "", createdBy: "", kind: "advance" });
  assert.deepEqual([all.from, all.to, all.method, all.kind], ["2026-10-15", "2026-10-15", "cash", "advance"]);
  assert.equal(V.exportQuery(all).kind, "advance", "the Excel has the same filter");
  // the page: a click toggles the kind and does not scroll; a refused `kind` (422 / 400) clears it and the strip is no longer clickable
  assert.equal(V.kindRejected({ status: 422 }), true);
  assert.equal(V.kindRejected({ status: 400 }), true);
  assert.equal(V.kindRejected({ status: 500 }), false);
  assert.equal(V.kindRejected(new Error("x")), false);
  const page = read("src/components/payments/income-page.tsx");
  assert.match(page, /onPickKind=\{kindUnsupported \? undefined : pickKind\}/);
  assert.match(page, /if \(query\.kind && kindRejected\(cause\)\) \{\s*setKindUnsupported\(true\);\s*setKind\(""\);\s*return;/);
  assert.match(page, /setKind\(\(current\) => toggleKind\(current, clicked\)\)/);
  const lib = fs.readFileSync(path.join(root, "src/lib/api.ts"), "utf8");
  assert.match(lib, /for \(const key of \["method", "created_by", "q", "status", "kind"\] as const\)/);
  // without the handler (an older server) the strip is plain text
  const plainStrip = html(React.createElement(P.FlowLine, { overview: withStrip(1000, [["old_debt", 600], ["current", 400]]) }));
  assert.ok(!plainStrip.includes("flow-segment") && !plainStrip.includes("flow-legend-row"));
  assert.match(plainStrip, /role="img"/);
});

// ── 3. no page jump: the notice and «К списку ↓» ────────────────────────────────────────────────

test("the notice: «Показаны 5 оплат за 15 октября» with the plural of the number; method and kind clauses; loading; none", () => {
  const day = "15 октября";
  assert.equal(V.filterNoticeText({ count: 5, day }), "Показаны 5 оплат за 15 октября");
  assert.equal(V.filterNoticeText({ count: 1, day }), "Показана 1 оплата за 15 октября");
  assert.equal(V.filterNoticeText({ count: 2, day }), "Показаны 2 оплаты за 15 октября");
  assert.equal(V.filterNoticeText({ count: 4, day }), "Показаны 4 оплаты за 15 октября");
  assert.equal(V.filterNoticeText({ count: 11, day }), "Показаны 11 оплат за 15 октября");
  assert.equal(V.filterNoticeText({ count: 21, day }), "Показана 21 оплата за 15 октября");
  assert.equal(V.filterNoticeText({ count: 12, method: "Наличные" }), "Показаны 12 оплат способом Наличные");
  assert.equal(V.filterNoticeText({ count: 3, kind: "old_debt" }), "Показаны 3 оплаты на старые долги");
  assert.equal(V.filterNoticeText({ count: 3, kind: "advance" }), "Показаны 3 оплаты в аванс");
  assert.equal(V.filterNoticeText({ count: 2, day, method: "Карта", kind: "current" }), "Показаны 2 оплаты за 15 октября способом Карта на текущие периоды");
  assert.equal(V.filterNoticeText({ count: 6, day: "Октябрь 2026 г." }), "Показаны 6 оплат за октябрь 2026 г.");
  assert.equal(V.filterNoticeText({ count: 0, day }), "Оплат нет за 15 октября");
  assert.equal(V.filterNoticeText({ count: null, day }), "Загружаю оплаты…");
  assert.equal(V.JUMP_TEXT, "К списку ↓");
});

test("the notice sits under the widget that was clicked (chart / donut / strip), with «К списку ↓»; a phone: wraps, no horizontal scroll", () => {
  const data = overview("I01_income_month_october");
  const jump = () => {};
  const bars = V.chartBars(data, "2026-10-21");
  const chart = html(React.createElement(P.IncomeChart, { bars, title: "Пришло по дням", activeBucket: null, onPick: () => {}, today: "2026-10-21", notice: "Показаны 5 оплат за 15 октября", onJump: jump }));
  assert.match(chart, /data-testid="filter-notice"/);
  assert.ok(text(React.createElement(P.IncomeChart, { bars, title: "t", activeBucket: null, onPick: () => {}, today: "2026-10-21", notice: "Показаны 5 оплат за 15 октября", onJump: jump })).includes("Показаны 5 оплат за 15 октября · К списку ↓"));
  assert.ok(!html(React.createElement(P.IncomeChart, { bars, title: "t", activeBucket: null, onPick: () => {}, today: "2026-10-21" })).includes("filter-notice"));
  assert.match(chart, /role="status"[^>]*aria-live="polite"/);
  assert.match(chart, /flex min-w-0 flex-wrap/);
  const donut = html(React.createElement(P.MethodsDonut, { overview: data, selected: "cash", notice: "Показаны 4 оплаты способом Наличные", onJump: jump }));
  assert.match(donut, /Показаны 4 оплаты способом Наличные/);
  const strip = html(React.createElement(P.FlowLine, { overview: data, notice: "Показаны 3 оплаты на старые долги", onJump: jump }));
  assert.match(strip, /Показаны 3 оплаты на старые долги/);
  // the overview hands the line to ONE widget only
  const view = (widget) => html(React.createElement(P.IncomeOverviewView, { overview: data, today: "2026-10-21", paymentsBase: "/owner/payments", activeBucket: null, onPick: () => {}, notice: { widget, text: "NOTICE-TEXT", onJump: jump } }));
  for (const widget of ["chart", "methods", "flow"]) assert.equal((view(widget).match(/NOTICE-TEXT/g) || []).length, 1, widget);
  const ids = ["income-chart", "income-methods", "income-flow"];
  const owner = (widget) => { const markup = view(widget); const at = markup.indexOf("NOTICE-TEXT"); const starts = ids.map((id) => markup.lastIndexOf(`data-testid="${id}"`, at)); return ids[starts.indexOf(Math.max(...starts))]; };
  assert.deepEqual(["chart", "methods", "flow"].map(owner), ids, "each notice is inside the card of its own widget");
});

test("no scrollIntoView on a click of a day, a donut segment or a strip segment; the page does not move", () => {
  const page = read("src/components/payments/income-page.tsx");
  const handlers = page.slice(page.indexOf("const pickBar = "), page.indexOf("// «Сегодня наличными»"));
  assert.ok(handlers.includes("const pickMethod") && handlers.includes("const pickKind") && handlers.includes("const jumpToList"));
  const clicks = handlers.slice(0, handlers.indexOf("const jumpToList"));
  assert.doesNotMatch(clicks, /scrollIntoView|scrollTo|requestAnimationFrame/);
  assert.doesNotMatch(read("src/components/payments/income-parts.tsx"), /scrollIntoView/);
  assert.doesNotMatch(read("src/components/payments/income-journal.tsx"), /scrollIntoView/);
  // the only place that scrolls is «К списку ↓», and `#position` / `#advance` from «Оплаты» (a link, not a click on the page)
  assert.equal((page.match(/scrollIntoView/g) || []).length, 1);
  assert.match(page, /document\.getElementById\(target\)\?\.scrollIntoView/);
});

test("«К списку ↓» scrolls SMOOTHLY (at once for prefers-reduced-motion), leaving the toolbar of the journal in view", () => {
  const smooth = V.journalScrollOptions({ journalTop: 900, scrollY: 300, reducedMotion: false });
  assert.deepEqual(smooth, { top: 1200 - V.JOURNAL_SCROLL_OFFSET, behavior: "smooth" });
  assert.equal(V.journalScrollOptions({ journalTop: 900, scrollY: 300, reducedMotion: true }).behavior, "auto");
  assert.equal(V.journalScrollOptions({ journalTop: -500, scrollY: 100, reducedMotion: false }).top, 0, "never above the page");
  assert.ok(V.JOURNAL_SCROLL_OFFSET >= 64, "the offset clears the sticky header");
  const page = read("src/components/payments/income-page.tsx");
  const jump = page.slice(page.indexOf("const jumpToList"), page.indexOf("// «Сегодня наличными»"));
  assert.match(jump, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(jump, /window\.scrollTo\(journalScrollOptions\(/);
  assert.match(read("src/lib/payments-income-v2.ts"), /behavior: "smooth"/);
  const parts = read("src/components/payments/income-parts.tsx");
  assert.match(parts, /onClick=\{onJump\}[^>]*>\{JUMP_TEXT\}/);
});

// ── 4. the chips above the journal ──────────────────────────────────────────────────────────────

test("chips: «15 октября ✕», «Наличные ✕», «Старые долги ✕» combine; each is removed alone; «Сбросить всё» clears them all", () => {
  assert.deepEqual(V.filterChips({}), []);
  assert.deepEqual(V.filterChips({ day: "15 октября" }).map((c) => c.label), ["15 октября"]);
  assert.deepEqual(V.filterChips({ day: "15 октября", method: "Наличные", kind: "old_debt" }).map((c) => [c.key, c.label]), [["day", "15 октября"], ["method", "Наличные"], ["kind", "Старые долги"]]);
  assert.deepEqual(["old_debt", "current", "forward", "advance"].map((k) => V.KIND_WORDS[k].chip), ["Старые долги", "Текущие периоды", "Периоды вперёд", "Аванс"]);

  const data = V.normalizeJournal(fixture("J01_journal_page1"));
  const calls = [];
  const base = {
    journal: data, loading: false, error: null, onRetry() {}, search: "", onSearch() {}, createdBy: "", onCreatedBy() {}, authors: data.authors,
    focusLabel: null, onClearFocus: () => calls.push("day"), methodLabel: null, onClearMethod: () => calls.push("method"), kind: "", onClearKind: () => calls.push("kind"), onClearAll: () => calls.push("all"),
    empty: { kind: "month", focusLabel: null, narrowed: false }, onResetNarrowing() {}, onPage() {}, onExport() {}, exporting: false, activeId: null, onOpen() {},
  };
  assert.ok(!html(React.createElement(J.JournalSection, base)).includes("journal-chips"), "no filter, no chips, no reset");
  const full = { ...base, focusLabel: "15 октября", methodLabel: "Наличные", kind: "old_debt" };
  const markup = html(React.createElement(J.JournalSection, full));
  for (const id of ["journal-focus", "journal-method", "journal-kind", "journal-clear-all"]) assert.match(markup, new RegExp(`data-testid="${id}"`), id);
  const body = text(React.createElement(J.JournalSection, full));
  for (const piece of ["15 октября", "Наличные", "Старые долги", "Сбросить всё"]) assert.ok(body.includes(piece), piece);
  for (const label of ["Показать весь период", "Показать все способы", "Показать все виды"]) assert.match(markup, new RegExp(`aria-label="${label}"`));
  const tree = J.JournalSection(full);
  const crosses = []; walk(tree, (el) => { if (typeof el.props?.["aria-label"] === "string" && /^Показать (весь|все) /.test(el.props["aria-label"])) crosses.push(el); });
  crosses.forEach((el) => el.props.onClick());
  find(tree, "journal-clear-all")[0].props.onClick();
  assert.deepEqual(calls, ["day", "method", "kind", "all"]);
  // a single chip is removable without touching the others (the page: three independent setters)
  const page = read("src/components/payments/income-page.tsx");
  assert.match(page, /onClearKind=\{\(\) => \{ setKind\(""\); setPage\(1\); \}\}/);
  assert.match(page, /const clearAll = \(\) => \{ setFocus\(null\); setFilters\(\(state\) => \(\{ \.\.\.state, method: "" \}\)\); setKind\(""\); setPage\(1\); \};/);
});

// ── 5. cancelled and corrected payments ─────────────────────────────────────────────────────────

const row = (patch = {}) => ({ ...V.normalizeJournal(fixture("J01_journal_page1")).rows[0], ...patch });
const CORRECTION = { status: "active", receipt_no: 12, amount: 300000, replaces_receipt_no: 9, replaces_amount: 350000, replaces_reason: "Опечатка в сумме", corrected_by_name: "Нодира Саидова", corrected_at: "2026-10-15T09:30:00" };

test("the journal asks for live payments by default (status=active); the toggle asks for all; the Excel follows", () => {
  const month = V.periodOf("month", "2026-10-21");
  const off = V.journalQuery(month, null, V.NO_FILTERS, V.NO_JOURNAL_EXTRAS);
  assert.equal(off.status, "active");
  assert.equal(V.journalQuery(month, null, V.NO_FILTERS, { q: "", createdBy: "", withVoided: false }).status, "active");
  const on = V.journalQuery(month, null, V.NO_FILTERS, { q: "", createdBy: "", withVoided: true });
  assert.equal(on.status, "all");
  assert.equal(V.exportQuery(off).status, "active");
  assert.equal(V.exportQuery(on).status, "all");
  const page = read("src/components/payments/income-page.tsx");
  assert.match(page, /const \[showVoided, setShowVoided\] = useState\(false\)/);
  assert.match(page, /withVoided: showVoided/);
  assert.match(page, /orgApi\.exportPaymentsJournal\(exportQuery\(query\)/);
  assert.match(page, /onToggleVoided=\{\(\) => \{ setShowVoided\(\(on\) => !on\); setPage\(1\); \}\}/);
});

test("the toggle «Показать отменённые и исправленные (N)»: N = voided + replaced; the count line has no «отменено»; hidden when nothing is hidden", () => {
  const totals = { count: 19, sum: 7885000, voided_count: 3, replaced_count: 2 };
  assert.equal(V.hiddenPaymentsCount(totals), 5);
  assert.equal(V.hiddenPaymentsCount({ count: 1, sum: 1, voided_count: 4 }), 4, "an older server sends no replaced_count");
  assert.equal(V.showVoidedLabel(totals), "Показать отменённые и исправленные (5)");
  assert.equal(plain(V.journalTotalsText(totals)), "19 оплат на 7 885 000 сум");
  const data = V.normalizeJournal({ ...fixture("J01_journal_page1"), totals });
  assert.equal(data.totals.replaced_count, 2);
  assert.equal(V.normalizeJournal(fixture("J01_journal_page1")).totals.replaced_count, 0);
  const base = {
    journal: data, loading: false, error: null, onRetry() {}, search: "", onSearch() {}, createdBy: "", onCreatedBy() {}, authors: [], focusLabel: null, onClearFocus() {},
    empty: { kind: "month", focusLabel: null, narrowed: false }, onResetNarrowing() {}, onPage() {}, onExport() {}, exporting: false, activeId: null, onOpen() {}, onToggleVoided() {},
  };
  const off = html(React.createElement(J.JournalSection, base));
  assert.match(off, /data-testid="journal-voided-toggle"[^>]*>[^<]*Показать отменённые и исправленные \(5\)/);
  assert.match(off, /aria-pressed="false"/);
  assert.ok(!text(React.createElement(J.JournalSection, base)).includes("отменено"));
  assert.ok(text(React.createElement(J.JournalSection, base)).includes("19 оплат на 7 885 000 сум"));
  const onMarkup = html(React.createElement(J.JournalSection, { ...base, showVoided: true }));
  assert.match(onMarkup, /aria-pressed="true"/);
  assert.match(onMarkup, /Показать отменённые и исправленные \(5\)/);
  // nothing hidden → no toggle (unless it is on: then it can be switched off)
  const none = { ...base, journal: { ...data, totals: { ...totals, voided_count: 0, replaced_count: 0 } } };
  assert.ok(!html(React.createElement(J.JournalSection, none)).includes("journal-voided-toggle"));
  assert.ok(html(React.createElement(J.JournalSection, { ...none, showVoided: true })).includes("journal-voided-toggle"));
  // no handler (a caller that knows nothing of the toggle): no button
  assert.ok(!html(React.createElement(J.JournalSection, { ...base, onToggleVoided: undefined })).includes("journal-voided-toggle"));
  // a period with only cancelled payments is not an empty period
  const hiddenOnly = { ...data, rows: [], total: 0, totals: { count: 0, sum: 0, voided_count: 2, replaced_count: 0 } };
  assert.equal(V.journalIsQuiet(hiddenOnly, { narrowed: false, focusLabel: null }), false);
  assert.equal(V.journalIsQuiet({ ...hiddenOnly, totals: { count: 0, sum: 0, voided_count: 0 } }, { narrowed: false, focusLabel: null }), true);
});

test("a live payment that corrected another one: the chip «исправлена» next to the amount; a plain one has none", () => {
  const corrected = V.journalRowView(row(CORRECTION));
  assert.equal(corrected.correctedChip, "исправлена");
  assert.equal(corrected.muted, false);
  assert.equal(V.journalRowView(row()).correctedChip, null);
  assert.equal(V.journalRowView(row({ status: "replaced", replaced_by_receipt_no: 12 })).correctedChip, null, "the superseded row has its own grey tag");
  const list = html(React.createElement(J.JournalList, { rows: [row(CORRECTION), row({ id: "payment:other" })], withYear: false, activeId: null, onOpen() {} }));
  assert.equal((list.match(/data-testid="journal-corrected"/g) || []).length, 1);
  assert.ok(list.indexOf("journal-corrected") < list.indexOf("tabular-nums tracking-tight md:col-start-4") + 400);
});

test("the drawer of a correction: «Было 350 000 сум → стало 300 000 сум · исправил <имя> 15.10 · причина: …»; absent fields do not break it", () => {
  assert.equal(plain(V.correctionLine(row(CORRECTION))), "Было 350 000 сум → стало 300 000 сум · исправил Нодира Саидова 15.10 · причина: Опечатка в сумме");
  const drawer = text(React.createElement(J.JournalDrawerBody, { row: row(CORRECTION), paymentsBase: "/owner/payments", studentProfileBasePath: "/owner/students" }));
  assert.ok(drawer.includes("Было 350 000 сум → стало 300 000 сум · исправил Нодира Саидова 15.10 · причина: Опечатка в сумме"));
  assert.ok(drawer.includes("Исправляет квитанцию № 9") && drawer.includes("исправлена"));
  // defensive
  assert.equal(plain(V.correctionLine(row({ ...CORRECTION, replaces_reason: null }))), "Было 350 000 сум → стало 300 000 сум · исправил Нодира Саидова 15.10");
  assert.equal(plain(V.correctionLine(row({ ...CORRECTION, corrected_by_name: null, corrected_at: null, replaces_reason: null }))), "Было 350 000 сум → стало 300 000 сум");
  assert.equal(plain(V.correctionLine(row({ ...CORRECTION, replaces_amount: null }))), "Исправил Нодира Саидова 15.10 · причина: Опечатка в сумме");
  assert.equal(V.correctionLine(row({ ...CORRECTION, replaces_amount: null, corrected_by_name: null, corrected_at: null, replaces_reason: null })), null);
  const bare = { ...CORRECTION }; for (const key of ["replaces_reason", "corrected_by_name", "corrected_at", "replaces_amount"]) delete bare[key];
  assert.doesNotThrow(() => V.drawerView(row(bare)));
  assert.equal(V.correctionLine(row()), null, "a plain payment has no correction line");
  assert.ok(!text(React.createElement(J.JournalDrawerBody, { row: row(), paymentsBase: "/owner/payments", studentProfileBasePath: "/owner/students" })).includes("Было"));
  assert.equal(V.normalizeJournal({ ...fixture("J01_journal_page1"), rows: [CORRECTION] }).rows[0].corrected_by_name, "Нодира Саидова");
  assert.equal(V.normalizeJournal(fixture("J01_journal_page1")).rows[0].corrected_by_name, null, "an older server: the fields are absent");
});

test("the drawer of a cancelled payment: «Отменена <дата> · <кто> · причина: …»; absent fields do not break it", () => {
  const voided = { status: "voided", void_reason: "Ошибочный ввод", voided_by_name: "Нодира Саидова", voided_at: "2026-10-20T09:00:00" };
  assert.equal(V.voidedLine(row(voided)), "Отменена 20.10 · Нодира Саидова · причина: Ошибочный ввод");
  const drawer = text(React.createElement(J.JournalDrawerBody, { row: row(voided), paymentsBase: "/owner/payments", studentProfileBasePath: "/owner/students" }));
  assert.ok(drawer.includes("Отменена 20.10 · Нодира Саидова · причина: Ошибочный ввод") && !drawer.includes("Куда пошли деньги"));
  assert.equal(V.voidedLine(row({ ...voided, voided_at: null })), "Отменена · Нодира Саидова · причина: Ошибочный ввод");
  assert.equal(V.voidedLine(row({ ...voided, voided_by_name: null })), "Отменена 20.10 · причина: Ошибочный ввод");
  assert.equal(V.voidedLine(row({ status: "voided", void_reason: null, voided_by_name: null, voided_at: null })), "Отменена");
  assert.equal(V.voidedLine(row()), null);
  assert.equal(V.drawerView(row(voided)).notes[0], "Отменена 20.10 · Нодира Саидова · причина: Ошибочный ввод");
});
