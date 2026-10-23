// INC-17 («Поступления», owner decision 22.10): the journal shows corrections the way the statement does.  One payment = one row with the CURRENT amount,
// its changes are quiet sub-lines under it; a superseded record is never a row; cancelled payments are behind the toggle «Показать отменённые (N)».
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
const root = path.join(__dirname, "..");
if (!Module.__pay2Alias) {
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    return resolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...rest);
  };
  Module.__pay2Alias = true;
}
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/income2", `${name}.json`), "utf8"));
const V = require(path.join(root, "src/lib/payments-income-v2.ts"));
const J = require(path.join(root, "src/components/payments/income-journal.tsx"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const plain = (value) => value.replace(/[\u00a0\u202f]/g, " ");
const html = (element) => renderToStaticMarkup(element);
const text = (element) => plain(html(element).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")).trim();

const BASE = V.normalizeJournal(fixture("J09_journal_status_active")).rows[0];
const row = (patch = {}) => ({ ...BASE, status: "active", replaces_receipt_no: null, replaces_amount: null, replaced_by_receipt_no: null, void_reason: null, voided_at: null, voided_by_name: null, replaces_reason: null, corrected_by_name: null, corrected_at: null, replaces_method_label: null, ...patch });

// the chain № 10 → № 11 → № 12 of one student; № 12 is the live payment
const LIVE = row({ id: "p12", receipt_no: 12, amount: 300000, paid_on: "2026-10-19", created_at: "2026-10-20T10:00:00", replaces_receipt_no: 11, replaces_amount: 320000, corrected_by_name: "Азиз", corrected_at: "2026-10-20T10:00:00", replaces_reason: "Ошибка в сумме" });
const MID = row({ id: "p11", receipt_no: 11, amount: 320000, status: "replaced", replaced_by_receipt_no: 12, replaces_receipt_no: 10, replaces_amount: 350000, corrected_by_name: "Олег", corrected_at: "2026-10-19T09:00:00", replaces_reason: "опечатка в сумме", replaces_method_label: "Наличные", method_label: "Карта", void_reason: "Ошибка в сумме", voided_by_name: "Азиз", voided_at: "2026-10-20T10:00:00" });
const FIRST = row({ id: "p10", receipt_no: 10, amount: 350000, status: "replaced", replaced_by_receipt_no: 11, void_reason: "опечатка в сумме", voided_by_name: "Олег", voided_at: "2026-10-19T09:00:00" });
const CANCELLED = row({ id: "c1", receipt_no: 20, student_name: "Нуров Жасур", amount: 90000, paid_on: "2026-10-18", created_at: "2026-10-18T08:00:00", status: "voided", void_reason: "ошибочный ввод", voided_by_name: "Олег", voided_at: "2026-10-21T08:00:00" });

test("the sub-line of a correction: «↳ исправлена 19.10: было 350 000 сум · исправил Олег · причина: опечатка в сумме»", () => {
  const single = row({ receipt_no: 11, replaces_receipt_no: 10, replaces_amount: 350000, corrected_by_name: "Олег", corrected_at: "2026-10-19T09:00:00", replaces_reason: "опечатка в сумме" });
  assert.deepEqual(V.journalSubLines(single).map(plain), ["↳ исправлена 19.10: было 350 000 сум · исправил Олег · причина: опечатка в сумме"]);
  // the method only when the correction changed it
  const method = row({ ...single, replaces_method_label: "Наличные" });
  assert.deepEqual(V.journalSubLines(method).map(plain), ["↳ исправлена 19.10: было 350 000 сум, способ: Наличные · исправил Олег · причина: опечатка в сумме"]);
  // missing name / reason / date / amount: each part only when known
  assert.equal(plain(V.journalSubLines({ ...single, corrected_by_name: null })[0]), "↳ исправлена 19.10: было 350 000 сум · причина: опечатка в сумме");
  assert.equal(plain(V.journalSubLines({ ...single, replaces_reason: null })[0]), "↳ исправлена 19.10: было 350 000 сум · исправил Олег");
  assert.equal(plain(V.journalSubLines({ ...single, corrected_by_name: null, replaces_reason: null })[0]), "↳ исправлена 19.10: было 350 000 сум");
  assert.equal(plain(V.journalSubLines({ ...single, corrected_at: null })[0]), "↳ исправлена: было 350 000 сум · исправил Олег · причина: опечатка в сумме");
  assert.equal(plain(V.journalSubLines({ ...single, replaces_amount: null })[0]), "↳ исправлена 19.10 · исправил Олег · причина: опечатка в сумме");
  assert.deepEqual(V.journalSubLines({ ...single, replaces_amount: null, corrected_by_name: null, corrected_at: null, replaces_reason: null }), [], "nothing known = no empty line");
  // the year when the period spans years
  assert.equal(plain(V.journalSubLines(single, [], true)[0]).slice(0, 24), "↳ исправлена 19.10.2026:");
  // a plain payment and an older server (no fields at all) have no sub-lines
  assert.deepEqual(V.journalSubLines(row()), []);
  const bare = { ...single }; for (const key of ["replaces_reason", "corrected_by_name", "corrected_at", "replaces_amount", "replaces_method_label"]) delete bare[key];
  assert.doesNotThrow(() => V.journalSubLines(bare));
  assert.equal(V.normalizeJournal({ ...fixture("J09_journal_status_active"), rows: [{ ...single, replaces_method_label: "Наличные" }] }).rows[0].replaces_method_label, "Наличные", "the method label survives normalizing");
});

test("a chain № 10 → № 11 → № 12: one line per earlier version, OLDEST first; without the superseded records the chain is cut at one level", () => {
  const lines = V.journalSubLines(LIVE, [MID, FIRST]).map(plain);
  assert.deepEqual(lines, [
    "↳ исправлена 19.10: было 350 000 сум, способ: Наличные · исправил Олег · причина: опечатка в сумме",
    "↳ исправлена 20.10: было 320 000 сум · исправил Азиз · причина: Ошибка в сумме",
  ]);
  assert.deepEqual(V.journalSubLines(LIVE, []).map(plain), ["↳ исправлена 20.10: было 320 000 сум · исправил Азиз · причина: Ошибка в сумме"]);
  assert.equal(V.journalSubLines(LIVE, [FIRST]).length, 1, "№ 11 is missing: the chain stops at the live row's own level");
  // another student's record with the same number is not a link; a loop in the data does not hang
  assert.equal(V.journalSubLines(LIVE, [{ ...MID, student_id: "someone-else" }]).length, 1);
  assert.equal(V.journalSubLines(LIVE, [{ ...MID, replaces_receipt_no: 12 }]).length, 2);
  assert.equal(V.journalSubLines(LIVE, [{ ...MID, replaced_by_receipt_no: 99 }]).length, 1, "№ 11 was replaced by another receipt: not this chain");
});

test("a superseded record is NEVER rendered as a row, whatever the server sent; the live correction is one row with the chip and the lines", () => {
  const list = React.createElement(J.JournalList, { rows: [LIVE, MID, FIRST, row({ id: "plain", receipt_no: 30 })], withYear: false, activeId: null, onOpen() {}, history: [MID, FIRST] });
  const markup = html(list);
  assert.equal((markup.match(/data-testid="journal-row"/g) || []).length, 2);
  assert.doesNotMatch(markup, /data-status="replaced"/);
  assert.ok(!text(list).includes("заменена"));
  assert.equal((markup.match(/data-testid="journal-corrected"/g) || []).length, 1);
  assert.match(markup, /title="вместо квитанции № 11"/);
  assert.equal((markup.match(/data-testid="journal-subline"/g) || []).length, 2);
  // the row shows the CURRENT amount, once, not struck through
  const body = text(list);
  assert.ok(body.includes("300 000 сум") && body.includes("было 350 000 сум"), "the current amount on the row, the older ones in the sub-lines");
  assert.equal((body.match(/300 000 сум/g) || []).length, 1, "the current amount is said once (the older versions are 350 000 and 320 000)");
  assert.doesNotMatch(markup.slice(markup.indexOf('data-status="active"'), markup.indexOf("journal-sublines")), /line-through/);
  assert.ok(V.listedRows([LIVE, MID, CANCELLED]).every((r) => r.status !== "replaced"));
  // a list of only superseded records is the empty state, not a table
  const section = React.createElement(J.JournalSection, {
    journal: { ...V.normalizeJournal(fixture("J09_journal_status_active")), rows: [MID], total: 0, totals: { count: 0, sum: 0, voided_count: 1, replaced_count: 1 } }, loading: false, error: null, onRetry() {}, search: "", onSearch() {}, createdBy: "", onCreatedBy() {}, authors: [], focusLabel: null, onClearFocus() {},
    empty: { kind: "month", focusLabel: null, narrowed: false }, onResetNarrowing() {}, onPage() {}, onExport() {}, exporting: false, activeId: null, onOpen() {}, onToggleVoided() {},
  });
  assert.doesNotMatch(html(section), /data-testid="journal-row"/);
});

test("the toggle «Показать отменённые (N)»: N = voided_count − replaced_count; no toggle when only corrections are behind it", () => {
  assert.equal(V.showVoidedLabel({ voided_count: 5, replaced_count: 2 }), "Показать отменённые (3)");
  assert.equal(V.showVoidedLabel({ voided_count: 2, replaced_count: 2 }), "Показать отменённые (0)");
  assert.equal(V.hiddenPaymentsCount({ voided_count: 2, replaced_count: 2 }), 0);
  assert.equal(V.hiddenPaymentsCount({ voided_count: 1, replaced_count: 3 }), 0, "never negative");
  assert.equal(V.hiddenPaymentsCount({ voided_count: 4 }), 4, "an older server: every voided one is a cancellation");
  const data = V.normalizeJournal(fixture("J09_journal_status_active"));
  const props = (totals, extra = {}) => ({
    journal: { ...data, totals }, loading: false, error: null, onRetry() {}, search: "", onSearch() {}, createdBy: "", onCreatedBy() {}, authors: [], focusLabel: null, onClearFocus() {},
    empty: { kind: "month", focusLabel: null, narrowed: false }, onResetNarrowing() {}, onPage() {}, onExport() {}, exporting: false, activeId: null, onOpen() {}, onToggleVoided() {}, ...extra,
  });
  const T = { count: 7, sum: 3450000 };
  assert.match(html(React.createElement(J.JournalSection, props({ ...T, voided_count: 3, replaced_count: 1 }))), /data-testid="journal-voided-toggle"[^>]*>[^<]*Показать отменённые \(2\)/);
  assert.ok(!html(React.createElement(J.JournalSection, props({ ...T, voided_count: 1, replaced_count: 1 }))).includes("journal-voided-toggle"), "only a corrected payment: nothing to bring back");
  assert.match(html(React.createElement(J.JournalSection, props({ ...T, voided_count: 3, replaced_count: 1 }, { showVoided: true }))), /aria-pressed="true"/);
});

test("a cancelled payment: one grey row with «отменена» and «↳ отменена 21.10 · Олег · причина: …»", () => {
  assert.equal(V.cancelledSubLine(CANCELLED), "↳ отменена 21.10 · Олег · причина: ошибочный ввод");
  assert.equal(V.cancelledSubLine({ ...CANCELLED, voided_by_name: null }), "↳ отменена 21.10 · причина: ошибочный ввод");
  assert.equal(V.cancelledSubLine({ ...CANCELLED, void_reason: null, voided_by_name: null, voided_at: null }), "↳ отменена");
  assert.equal(V.cancelledSubLine(row()), null);
  assert.deepEqual(V.journalSubLines(CANCELLED), ["↳ отменена 21.10 · Олег · причина: ошибочный ввод"]);
  const list = React.createElement(J.JournalList, { rows: [LIVE, CANCELLED], withYear: false, activeId: null, onOpen() {}, history: [MID, FIRST] });
  const markup = html(list);
  assert.equal((markup.match(/data-testid="journal-row"/g) || []).length, 2);
  assert.match(markup, /data-status="voided"/);
  assert.match(markup, /data-testid="journal-tag"[^>]*>отменена</);
  assert.match(markup, /line-through/);
  assert.ok(text(list).includes("↳ отменена 21.10 · Олег · причина: ошибочный ввод"));
  const view = V.journalRowView(CANCELLED);
  assert.deepEqual([view.tag, view.muted], ["отменена", true]);
});

test("the sub-lines are quiet and wrap: under the name on a table, under the card on a phone", () => {
  const markup = html(React.createElement(J.JournalList, { rows: [LIVE], withYear: false, activeId: null, onOpen() {}, history: [MID, FIRST] }));
  const sub = /data-testid="journal-sublines" class="([^"]*)"/.exec(markup)[1];
  for (const piece of ["text-xs", "text-slate-400", "col-span-2", "md:col-start-2", "md:row-start-2", "block"]) assert.ok(sub.includes(piece), piece);
  assert.match(markup, /data-testid="journal-subline" class="block break-words"/);
  assert.ok(!sub.includes("truncate") && !sub.includes("whitespace-nowrap"), "long reasons wrap");
});

test("the drawer keeps every version of a payment corrected more than once, with receipts and who / when / why", () => {
  const view = V.drawerView(LIVE, [MID, FIRST]);
  assert.deepEqual(view.versions.map(plain), [
    "№ 10 · 350 000 сум, Наличные — заменена 19.10.2026 · Олег · причина: опечатка в сумме",
    "№ 11 · 320 000 сум — заменена 20.10.2026 · Азиз · причина: Ошибка в сумме",
    "№ 12 · 300 000 сум — действует",
  ]);
  assert.ok(view.notes.some((note) => note.startsWith("Исправляет квитанцию № 11")));
  const body = text(React.createElement(J.JournalDrawerBody, { row: LIVE, history: [MID, FIRST], paymentsBase: "/owner/payments", studentProfileBasePath: "/owner/students" }));
  assert.ok(body.includes("Все версии оплаты") && body.includes("№ 10 · 350 000 сум, Наличные") && body.includes("№ 12 · 300 000 сум — действует"));
  // corrected once: the note already says it, no second list; a plain payment has none
  assert.deepEqual(V.drawerView(LIVE, []).versions, []);
  assert.deepEqual(V.drawerView(row()).versions, []);
});

// ── the page: status=active paging, the history of the corrections, the cancelled ones of the toggle ──────────────────────

function server({ active, voided, activePages, failVoided = false }) {
  const calls = [];
  const fetchPage = async (query) => {
    calls.push(query);
    if (query.status === "voided") {
      if (failVoided) throw new Error("boom");
      const size = query.size, from = (query.page - 1) * size;
      return V.normalizeJournal({ ...fixture("J04_journal_voided_and_replaced"), page: query.page, size, total: voided.length, pages: Math.max(1, Math.ceil(voided.length / size)), rows: voided.slice(from, from + size) });
    }
    assert.equal(query.status, "active", "the list is always the live payments");
    const size = query.size, from = (query.page - 1) * size;
    const pages = activePages ?? Math.max(1, Math.ceil(active.length / size));
    return V.normalizeJournal({ ...fixture("J09_journal_status_active"), page: query.page, size, total: active.length, pages, rows: active.slice(from, from + size),
      totals: { count: active.length, sum: 1, voided_count: voided.length, replaced_count: voided.filter((r) => r.status === "replaced").length } });
  };
  return { calls, fetchPage };
}
const month = V.periodOf("month", "2026-10-21");
const queryOf = (extras = {}, page = 1, size = 25) => V.journalQuery(month, null, V.NO_FILTERS, { q: "", createdBy: "", ...extras }, page, size);
const plainRow = (n, day, extra = {}) => row({ id: `a${n}`, receipt_no: n, paid_on: `2026-10-${day}`, created_at: `2026-10-${day}T10:00:00`, ...extra });

test("loadJournalPage: no corrections and the toggle off = one call, status=active, nothing more", async () => {
  const s = server({ active: [plainRow(5, "20"), plainRow(4, "19")], voided: [CANCELLED, MID, FIRST] });
  const data = await V.loadJournalPage(s.fetchPage, queryOf());
  assert.equal(s.calls.length, 1);
  assert.deepEqual(data.rows.map((r) => r.id), ["a5", "a4"]);
  assert.equal(data.total, 2);
});

test("loadJournalPage: a page with a correction asks the superseded records of the same period, the chain gets its older version, the superseded ones are not rows", async () => {
  const s = server({ active: [LIVE, plainRow(5, "18")], voided: [CANCELLED, MID, FIRST] });
  const data = await V.loadJournalPage(s.fetchPage, queryOf());
  assert.deepEqual(s.calls.map((c) => [c.status, c.page, c.size]), [["active", 1, 25], ["voided", 1, 100]]);
  assert.deepEqual([s.calls[1].from, s.calls[1].to], [month.from, month.to]);
  assert.deepEqual(data.rows.map((r) => r.id), ["p12", "a5"], "the toggle is off: no cancelled row");
  assert.deepEqual(data.history.map((r) => r.receipt_no).sort(), [10, 11]);
  assert.equal(V.journalSubLines(data.rows[0], data.history).length, 2);
  assert.equal(data.total, 2, "paging counts the live payments");
  // the history is asked with the filters of the list, never with `kind` (a kind answer has no hidden payments: nothing to ask)
  const filtered = await V.loadJournalPage(server({ active: [LIVE], voided: [MID, FIRST] }).fetchPage, queryOf({ q: "Нуров", createdBy: "u1" }));
  assert.equal(filtered.history.length, 2);
  const kindServer = server({ active: [LIVE], voided: [MID, FIRST] });
  const kindFetch = async (query) => { const answer = await kindServer.fetchPage(query); return { ...answer, totals: { ...answer.totals, voided_count: 0, replaced_count: 0 } }; };
  assert.equal((await V.loadJournalPage(kindFetch, queryOf({ kind: "advance" }))).history, undefined);
  assert.equal(kindServer.calls.length, 1);
  // the history is a bonus: when it fails the live row still carries one level
  const broken = await V.loadJournalPage(server({ active: [LIVE], voided: [MID, FIRST], failVoided: true }).fetchPage, queryOf());
  assert.deepEqual(broken.rows.map((r) => r.id), ["p12"]);
  assert.equal(V.journalSubLines(broken.rows[0], broken.history ?? []).length, 1);
});

test("loadJournalPage: the toggle brings the cancelled payments in, each above the live payment that follows it; superseded records still never", async () => {
  const live = [plainRow(5, "20"), plainRow(4, "17")];
  const s = server({ active: live, voided: [CANCELLED, MID, FIRST] }); // CANCELLED is the 18th: between № 5 (20th) and № 4 (17th)
  const data = await V.loadJournalPage(s.fetchPage, queryOf({ withVoided: true }));
  assert.deepEqual(data.rows.map((r) => r.id), ["a5", "c1", "a4"]);
  assert.ok(data.rows.every((r) => r.status !== "replaced"));
  assert.equal(s.calls[0].status, "active");
  assert.equal(V.journalPaging(data).text, "1–2 из 2", "the cancelled row is not counted in the page text");
  // the cancelled payment of the last page goes below the last live row
  const tail = await V.loadJournalPage(server({ active: [plainRow(5, "20")], voided: [CANCELLED] }).fetchPage, queryOf({ withVoided: true }));
  assert.deepEqual(tail.rows.map((r) => r.id), ["a5", "c1"]);
  // only cancelled payments in the period
  const only = await V.loadJournalPage(server({ active: [], voided: [CANCELLED] }).fetchPage, queryOf({ withVoided: true }));
  assert.deepEqual(only.rows.map((r) => r.id), ["c1"]);
  // the toggle on and a failure of the cancelled ones is the page's error
  await assert.rejects(() => V.loadJournalPage(server({ active: live, voided: [CANCELLED], failVoided: true }).fetchPage, queryOf({ withVoided: true })));
});

test("loadJournalPage: a cancelled payment is on exactly one page (the one with the live payment below it); the previous page's last row is read with size=1", async () => {
  // 2 live rows a page: page 1 = № 8 (22nd), № 7 (21st); page 2 = № 6 (19th), № 5 (15th)
  const live = [plainRow(8, "22"), plainRow(7, "21"), plainRow(6, "19"), plainRow(5, "15")];
  const between = (id, day) => row({ id, receipt_no: 50, status: "voided", paid_on: `2026-10-${day}`, created_at: `2026-10-${day}T10:00:00`, voided_at: "2026-10-22T08:00:00" });
  const voided = [between("v-top", "23"), between("v-gap", "20"), between("v-mid", "17"), between("v-end", "10")];
  const seen = {};
  for (const page of [1, 2]) {
    const s = server({ active: live, voided });
    const data = await V.loadJournalPage(s.fetchPage, queryOf({ withVoided: true }, page, 2));
    seen[page] = data.rows.map((r) => r.id);
    if (page === 2) assert.deepEqual(s.calls.find((c) => c.size === 1) && [s.calls.find((c) => c.size === 1).page, s.calls.find((c) => c.size === 1).status], [2, "active"], "page 2: the row before the page");
    else assert.ok(!s.calls.some((c) => c.size === 1), "page 1 has no previous page");
  }
  assert.deepEqual(seen[1], ["v-top", "a8", "a7"]);
  assert.deepEqual(seen[2], ["v-gap", "a6", "v-mid", "a5", "v-end"]);
  const all = [...seen[1], ...seen[2]].filter((id) => id.startsWith("v-"));
  assert.deepEqual(all.sort(), ["v-end", "v-gap", "v-mid", "v-top"], "each cancelled payment once");
});

test("the screen and the Excel: the page loads through loadJournalPage; the file asks status=all with the toggle and says so", () => {
  const page = read("src/components/payments/income-page.tsx");
  assert.match(page, /await loadJournalPage\(\(request\) => orgApi\.getPaymentsJournal\(request\), query\)/);
  assert.match(page, /<JournalDrawer row=\{opened\} history=\{journal\.data\?\.history\}/);
  assert.equal(V.exportQuery(queryOf({ withVoided: true })).status, "all");
  assert.equal(V.exportQuery(queryOf()).status, "active");
  const list = read("src/components/payments/income-journal.tsx");
  assert.match(list, /listedRows\(rows\)\.map/);
});
