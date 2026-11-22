// inc13 (owner 23.10, the «Выписка»): no «Печать»; the money columns are a band with dividers; a type icon at the start of every
// operation; «+600 000» for a payment in slate, not green; the balance is a chip (debt / advance / zero); date and money centred;
// month rows are only the name; a quiet «С сентября перенесён аванс …» line in a single month; the page opens on the current month,
// `?month=YYYY-MM` / `?month=all` are deep links.
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
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/pay2", `${name}.json`), "utf8"));
const L = require(path.join(root, "src/lib/payments-ledger.ts"));
const plain = (text) => text.replace(/ /g, " ");

function renderer() {
  require.extensions[".tsx"] = (mod, filename) => {
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
  };
  const Module = require("node:module");
  if (!Module.__inc13Alias) {
    const resolveFilename = Module._resolveFilename;
    Module._resolveFilename = function (request, ...rest) {
      return resolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...rest);
    };
    Module.__inc13Alias = true;
  }
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  return {
    React,
    text: (element) => plain(renderToStaticMarkup(element).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ")),
    html: (element) => plain(renderToStaticMarkup(element)),
  };
}
const statementOf = () => L.normalizeStatement(fixture("e1_statement_790000"));
const View = () => require(path.join(root, "src/components/payments/statement-view.tsx"));

// ── 1. «Печать» is gone, «Внести оплату» and «Excel» stay ───────────────────────────────────────

test("inc13-1: no «Печать» button and no print-only code; «Внести оплату» and «Excel» stay", () => {
  const src = read("src/components/payments/statement-view.tsx");
  assert.doesNotMatch(src, /Печать|window\.print|Printer|print:|@page/);
  assert.match(src, /data-testid="statement-pay"/);
  assert.match(src, /\n\s*Excel\n/);
  assert.match(src, /exportExcel/);
  // the document title was set for «Save as PDF» only: it went with the print button
  assert.doesNotMatch(src, /document\.title/);
});

// ── 2. the icon of a row ───────────────────────────────────────────────────────────────────────

test("inc13-2: row type → icon kind and tint (charge slate calendar, payment emerald wallet, the rest from the same set)", () => {
  const kind = (type, extra = {}) => L.statementIconKind({ type, cancelled: false, replaced: null, ...extra });
  assert.equal(kind("charge"), "charge");
  assert.equal(kind("payment"), "payment");
  assert.equal(kind("payment", { replaced: "исправлена: было 450 000" }), "correction");
  assert.equal(kind("payment", { cancelled: true }), "void");
  assert.equal(kind("writeoff"), "writeoff");
  assert.equal(kind("refund"), "refund");
  assert.equal(kind("transfer_in"), "transfer");
  assert.equal(kind("transfer_out"), "transfer");
  assert.equal(kind("opening_debt"), "opening");
  assert.equal(kind("opening_paid_until"), "opening");
  assert.equal(kind("pause"), "pause");
  assert.match(L.STATEMENT_ICON_TONE.charge, /text-slate-/);
  assert.match(L.STATEMENT_ICON_TONE.payment, /text-emerald-/);
  assert.deepEqual(Object.keys(L.STATEMENT_ICON_TONE).sort(), ["charge", "correction", "opening", "pause", "payment", "refund", "transfer", "void", "writeoff"]);
  // drawn: the charge has the calendar, the payment the wallet
  const { React, html } = renderer();
  const { StatementRowIcon } = View();
  const icon = (type) => html(React.createElement(StatementRowIcon, { entry: { type, cancelled: false, replaced: null } }));
  assert.match(icon("charge"), /data-icon="charge"[^>]*bg-slate-100 text-slate-500[\s\S]*lucide-calendar-days/);
  assert.match(icon("payment"), /data-icon="payment"[^>]*bg-emerald-50 text-emerald-600[\s\S]*lucide-wallet/);
  for (const [type, name] of [["writeoff", "heart-handshake"], ["refund", "undo2"], ["transfer_in", "arrow-left-right"], ["pause", "pause-circle"]]) assert.match(icon(type), new RegExp(`lucide-${name}`), type);
  // every row of the timeline carries one
  const markup = html(React.createElement(View().StatementTimeline, { statement: statementOf(), menuFor: () => [], withVoided: false }));
  const rows = (markup.match(/data-testid="statement-row-(charge|payment)"/g) || []).length;
  assert.equal((markup.match(/data-testid="statement-row-icon"/g) || []).length, rows);
  assert.ok(rows >= 4);
});

// ── 3. amounts: «+600 000» for money in, slate, not green ──────────────────────────────────────

test("inc13-3: «Оплачено» is «+600 000» (a refund «−»), «Стоимость» is «600 000»; both slate-800, none of them green", () => {
  assert.equal(plain(L.statementPaidText({ paid: 600000 })), "+600 000");
  assert.equal(plain(L.statementPaidText({ paid: -500000 })), "−500 000");
  assert.equal(L.statementPaidText({ paid: null }), "");
  assert.equal(plain(L.statementChargedText({ charged: 600000 })), "600 000");
  assert.equal(L.statementChargedText({ charged: null }), "");
  assert.match(L.STATEMENT_AMOUNT_CLASS, /text-slate-800/);
  assert.match(L.STATEMENT_PAID_CLASS, /text-slate-800/);
  assert.match(L.STATEMENT_PAID_CLASS, /font-medium/);
  assert.match(L.STATEMENT_PAID_CLASS, /tabular-nums/);
  assert.doesNotMatch(L.STATEMENT_AMOUNT_CLASS + L.STATEMENT_PAID_CLASS, /emerald|green/);
  const { React, html, text } = renderer();
  const markup = html(React.createElement(View().StatementTimeline, { statement: statementOf(), menuFor: () => [], withVoided: false }));
  assert.ok(plain(text(React.createElement(View().StatementTimeline, { statement: statementOf(), menuFor: () => [], withVoided: false }))).includes("+231 000"));
  // the payment's amount span has no green class
  assert.match(markup, /text-sm font-medium tabular-nums text-slate-800">\+231 000/);
  assert.doesNotMatch(markup, /text-emerald-700[^>]*>\+/);
  // empty money cells stay empty: no dash
  assert.doesNotMatch(markup, />[—–-]</);
});

// ── 4. the balance chip ────────────────────────────────────────────────────────────────────────

test("inc13-4 (14Б.7): «Остаток» of a row - the debt rose, «К оплате» the calm blue, the advance green, «Оплачено» a quiet word; two parts stand one under another; nothing from the server - no empty pill", () => {
  const { React, html } = renderer();
  const { OpenCell } = View();
  const cell = (parts) => html(React.createElement(OpenCell, { parts }));
  assert.match(cell([{ name: "debt", amount: 92000, text: "Долг 92 000 сум" }]), /data-tone="danger"[^>]*data-testid="statement-open-chip"|data-testid="statement-open-chip"[^>]*>|Долг 92 000 сум/);
  assert.match(cell([{ name: "debt", amount: 92000, text: "Долг 92 000 сум" }]), /data-tone="danger"/);
  assert.match(cell([{ name: "due", amount: 231000, text: "К оплате 231 000 сум" }]), /data-tone="due"[^>]*>К оплате 231 000 сум/);
  assert.match(cell([{ name: "advance", amount: 21000, text: "Аванс 21 000 сум" }]), /data-tone="ok"[^>]*>Аванс 21 000 сум/);
  const paid = cell([{ name: "paid", amount: 0, text: "Оплачено" }]);
  assert.match(paid, /data-testid="statement-open-paid"[^>]*>Оплачено</);
  assert.doesNotMatch(paid, /data-kind="status"/, "«Оплачено» is a quiet word, not a pill");
  const two = cell([{ name: "debt", amount: 50000, text: "Долг 50 000 сум" }, { name: "due", amount: 100000, text: "К оплате 100 000 сум" }]);
  assert.ok(two.indexOf("Долг 50 000 сум") < two.indexOf("К оплате 100 000 сум"), "the debt first");
  assert.equal((two.match(/statement-open-chip/g) || []).length, 2);
  assert.equal(cell([]), "", "nothing from the server: no empty pill");
  // in the rows the cell sits in the centred column «Остаток»
  const markup = html(React.createElement(View().StatementTimeline, { statement: statementOf(), menuFor: () => [], withVoided: false }));
  assert.match(markup, /data-testid="statement-cell-balance"/);
  assert.ok((markup.match(/data-testid="statement-open"/g) || []).length >= 3, "every row the server named something for");
  assert.doesNotMatch(markup, /statement-balance-chip/);
});

// ── 5. alignment and the band ──────────────────────────────────────────────────────────────────

test("inc13-5 (wave 3): the date and «Операция» are LEFT, the three money columns are CENTRED (fix 10) with tabular digits (their headers too); one DataTable", () => {
  assert.equal(L.STATEMENT_ALIGN.date, "text-left");
  assert.equal(L.STATEMENT_ALIGN.operation, "text-left");
  assert.match(L.STATEMENT_ALIGN.money, /text-right/);
  assert.match(L.STATEMENT_ALIGN.money, /tabular-nums/);
  const src = read("src/components/payments/statement-view.tsx");
  const cols = src.match(/const STATEMENT_COLUMNS: DataColumn\[\] = \[([\s\S]*?)\];/)[1];
  assert.match(cols, /key: "date", header: "Дата", width: "max-content"/);
  assert.match(cols, /key: "operation", header: "Операция"/);
  // PAY-TAILS Б11.22 п.6: the sums («Стоимость», «Оплачено») stand on the RIGHT edge with tabular digits (digits under digits); «Остаток» (chips and words) stays centred
  for (const [key, word] of [["charged", "Стоимость"], ["paid", "Оплачено"]]) assert.match(cols, new RegExp(`key: "${key}", header: "${word}", align: "end", numeric: true`), word);
  assert.match(cols, /key: "balance", header: "Остаток", align: "center", numeric: "center"/);
  const { React, html } = renderer();
  const markup = html(React.createElement(View().StatementTimeline, { statement: statementOf(), menuFor: () => [], withVoided: false }));
  for (const [id, align] of [["charged", "end"], ["paid", "end"], ["balance", "center"]]) {
    const cells = markup.match(new RegExp(`<div class="dt-cell[^"]*"[^>]*data-align="${align}"[^>]*data-testid="statement-cell-${id}"`, "g")) || [];
    assert.ok(cells.length >= 4, id);
  }
  assert.match(markup, /data-col="date" data-align="start"[^>]*><div class="dt-value"><span class="text-sm tabular-nums text-slate-700">\d\d\.\d\d\.\d{4}/);
  // a month row spans every column
  assert.match(markup, /data-testid="statement-month"[^>]*><div class="dt-span-cell">/);
});

// ── 6. month rows: only the name; NO carry line (14Б.7) ─────────────────────────────────────────

test("inc13-6 (14Б.7): a month row is only «Октябрь 2026»; one month shows its rows and NO «С сентября перенесён …» line (it repeated the running total that is gone)", () => {
  const { React, text } = renderer();
  const { StatementTimeline } = View();
  const statement = statementOf();
  const all = text(React.createElement(StatementTimeline, { statement, menuFor: () => [], withVoided: false }));
  assert.ok(all.includes("Сентябрь 2026") && all.includes("Октябрь 2026"));
  assert.ok(!/стоимость \d[\d ]* ·|оплачено \d[\d ]* ·|осталось/.test(all.replace(/\(осталось [\d ]+\)/g, ""))); // no summary on a month row
  for (const month of [null, "2026-10", "2026-11", "2026-09"]) {
    assert.equal(L.buildStatementItems(statement, month).some((item) => item.kind === "carry"), false, String(month));
    assert.ok(!text(React.createElement(StatementTimeline, { statement, menuFor: () => [], withVoided: false, month })).includes("перенесён"), String(month));
  }
  // November: an empty month says so, quietly
  assert.equal(L.buildStatementItems(statement, "2026-11").find((item) => item.kind === "month").empty, true);
});

// ── 8. the month the statement opens on, the deep links ────────────────────────────────────────

test("inc13-8: opens on the current month, else the latest month with rows; ?month=YYYY-MM / ?month=all are deep links", () => {
  const rows = (...dates) => ({ rows: dates.map((date) => ({ date, voided_at: null })) });
  // the current month has rows
  assert.equal(L.defaultStatementMonth(rows("2026-09-15", "2026-10-21"), "2026-10"), "2026-10");
  // no rows this month: the latest month that has rows (left earlier / future enrolment)
  assert.equal(L.defaultStatementMonth(rows("2026-08-15", "2026-09-30"), "2026-10"), "2026-09");
  assert.equal(L.defaultStatementMonth(rows("2026-12-01"), "2026-10"), "2026-12");
  // an empty statement opens on the current month
  assert.equal(L.defaultStatementMonth(rows(), "2026-10"), "2026-10");
  // a cancelled row does not make a month
  assert.equal(L.defaultStatementMonth({ rows: [{ date: "2026-09-15", voided_at: null }, { date: "2026-10-02", voided_at: "2026-10-03T00:00:00" }] }, "2026-10"), "2026-09");
  // the address
  assert.equal(L.parseStatementMonth("2026-09"), "2026-09");
  assert.equal(L.parseStatementMonth("all"), "all");
  for (const bad of [null, undefined, "", "2026-13", "2026-9", "abc", "ALL", "2026-10-01"]) assert.equal(L.parseStatementMonth(bad), null, String(bad));
  const statement = { rows: rows("2026-09-15", "2026-10-21").rows };
  assert.equal(L.resolveStatementMonth(null, statement, "2026-10"), "2026-10"); // no ?month=: the current month
  assert.equal(L.resolveStatementMonth("2026-09", statement, "2026-10"), "2026-09"); // ?month=2026-09
  assert.equal(L.resolveStatementMonth("all", statement, "2026-10"), null); // ?month=all: every month
  assert.equal(L.resolveStatementMonth("2026-13" && L.parseStatementMonth("2026-13"), statement, "2026-11"), "2026-10"); // a broken value falls back to the default
  // what goes back to the address
  assert.equal(L.statementMonthParam("all"), "all");
  assert.equal(L.statementMonthParam("2026-09"), "2026-09");
  assert.equal(L.statementMonthParam(null), null);
  assert.equal(L.statementMonthLabel("2026-10"), "Октябрь 2026");
  assert.equal(L.statementMonthLabel(null), "Все месяцы");
  // the page: the choice starts from the address; «Все месяцы» is a toggle; the export follows the month on screen
  const src = read("src/components/payments/statement-view.tsx");
  assert.match(src, /parseStatementMonth\(searchParams\?\.get\("month"\)\)/);
  assert.match(src, /formatBusinessDate\(\)\.slice\(0, 7\)/); // the business date of Tashkent, not the browser's
  assert.match(src, /queryWith\(searchParams\?\.toString\(\), \{ month: value \}\)/);
  assert.match(src, /setMonth\(month === null \? null : "all"\)/);
  assert.match(src, /const range = month \? monthRange\(month\) : \{\}/);
  assert.match(src, /buildStatementItems\(statement, month\)/);
});

test("method names inside the operation text: brands keep capitals, generic words are lower case (owner 23.10)", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src/lib/payments-ledger.ts"), "utf8");
  assert.match(src, /method === "click" \|\| method === "payme" \? label : label\.toLowerCase\(\)/);
});
