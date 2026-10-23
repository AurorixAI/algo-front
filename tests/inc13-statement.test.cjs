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
  assert.match(markup, /text-sm font-medium tabular-nums text-slate-800 md:leading-6">\+231 000/);
  assert.doesNotMatch(markup, /text-emerald-700[^>]*>\+/);
  // empty money cells stay empty: no dash
  assert.doesNotMatch(markup, />[—–-]</);
});

// ── 4. the balance chip ────────────────────────────────────────────────────────────────────────

test("inc13-4: balance chip: «Долг» rose, «Аванс» emerald, «0» slate, one height for all", () => {
  assert.match(L.balanceChipClass("debt"), /bg-rose-50 text-rose-700/);
  assert.match(L.balanceChipClass("advance"), /bg-emerald-50 text-emerald-700/);
  assert.match(L.balanceChipClass("none"), /bg-slate-100 text-slate-600/);
  for (const kind of ["debt", "advance", "none"]) {
    const cls = L.balanceChipClass(kind);
    assert.match(cls, /\bh-6\b/, kind); // the same height
    assert.match(cls, /\binline-flex\b/);
    assert.match(cls, /\bitems-center\b/);
    assert.match(cls, /\btabular-nums\b/);
  }
  const cell = (value) => { const c = L.balanceCell(value); return { kind: c.kind, text: plain(c.text) }; };
  assert.deepEqual(cell(-92000), { kind: "debt", text: "Долг 92 000" });
  assert.deepEqual(cell(508000), { kind: "advance", text: "Аванс 508 000" });
  assert.deepEqual(cell(0), { kind: "none", text: "0" });
  const { React, html } = renderer();
  const { BalanceChip } = View();
  const chip = (balance) => html(React.createElement(BalanceChip, { balance }));
  assert.match(chip(L.balanceCell(-92000)), /data-tone="debt"[^>]*>Долг 92 000/);
  assert.match(chip(L.balanceCell(508000)), /data-tone="advance"/);
  assert.match(chip(L.balanceCell(0)), /data-tone="none"[^>]*>0</);
  assert.equal(chip({ kind: "none", text: "" }), ""); // nothing to say: no empty pill
  // in the rows the chip sits in a centred cell
  const markup = html(React.createElement(View().StatementTimeline, { statement: statementOf(), menuFor: () => [], withVoided: false }));
  assert.match(markup, /data-testid="statement-cell-balance"/);
  assert.ok((markup.match(/data-testid="statement-balance-chip"/g) || []).length >= 4);
});

// ── 5. alignment and the band ──────────────────────────────────────────────────────────────────

test("inc13-5: date and the three money columns are centred with tabular digits, «Операция» left; the money band has dividers", () => {
  assert.equal(L.STATEMENT_ALIGN.date, "text-center");
  assert.equal(L.STATEMENT_ALIGN.operation, "text-left");
  assert.match(L.STATEMENT_ALIGN.money, /text-center/);
  assert.match(L.STATEMENT_ALIGN.money, /tabular-nums/);
  const src = read("src/components/payments/statement-view.tsx");
  // the header
  for (const [word, align] of [["Дата", "date"], ["Операция", "operation"]]) assert.match(src, new RegExp(`STATEMENT_ALIGN\\.${align}\\}\`\\}>${word}</span>`), word);
  for (const word of ["Стоимость", "Оплачено", "Баланс"]) assert.match(src, new RegExp(`HEAD_MONEY\\} \\$\\{STATEMENT_ALIGN\\.money\\}\`\\}>${word}</span>`), word);
  // the band: a thin divider (slate-100) and a very light background; the same constant in header, rows and month rows
  const band = src.match(/const CELL_MONEY = "([^"]*)"/)[1];
  assert.match(band, /md:border-l md:border-slate-100/);
  assert.match(band, /md:bg-slate-50\/60/);
  assert.match(src.match(/const HEAD_MONEY = "([^"]*)"/)[1], /md:border-l md:border-slate-100/);
  assert.match(src, /grid-cols-\[104px_minmax\(0,1fr\)_128px_128px_160px_48px\]/);
  const { React, html } = renderer();
  const markup = html(React.createElement(View().StatementTimeline, { statement: statementOf(), menuFor: () => [], withVoided: false }));
  for (const id of ["charged", "paid", "balance"]) {
    const cells = markup.match(new RegExp(`class="[^"]*"[^>]*data-testid="statement-cell-${id}"`, "g")) || [];
    assert.ok(cells.length >= 4, id);
    for (const cell of cells) assert.match(cell, /md:border-l md:border-slate-100[^"]*text-center tabular-nums/, id);
  }
  // the date cells are centred too
  assert.match(markup, /md:px-2 md:py-3 text-center">\d\d\.\d\d\.\d{4}/);
  // month rows keep the band (empty money cells with the same divider)
  assert.match(markup, /data-testid="statement-month"[\s\S]*?md:border-l md:border-slate-100/);
});

// ── 6. month rows: only the name; the carry line ───────────────────────────────────────────────

test("inc13-6: a month row is only «Октябрь 2026»; one month shows «С сентября перенесён долг …», never in «Все месяцы», never when zero", () => {
  const { React, text } = renderer();
  const { StatementTimeline } = View();
  const statement = statementOf();
  const all = text(React.createElement(StatementTimeline, { statement, menuFor: () => [], withVoided: false }));
  assert.ok(all.includes("Сентябрь 2026") && all.includes("Октябрь 2026"));
  assert.ok(!/стоимость \d[\d ]* ·|оплачено \d[\d ]* ·|осталось/.test(all.replace(/\(осталось [\d ]+\)/g, ""))); // no summary on a month row
  assert.ok(!all.includes("перенесён")); // «Все месяцы»: no carry line
  // October: 269 000 of debt comes from September
  const october = L.buildStatementItems(statement, "2026-10");
  const carry = october.find((item) => item.kind === "carry");
  assert.equal(plain(carry.text), "С сентября перенесён долг 269 000");
  assert.equal(carry.balance.kind, "debt");
  assert.ok(text(React.createElement(StatementTimeline, { statement, menuFor: () => [], withVoided: false, month: "2026-10" })).includes("С сентября перенесён долг 269 000"));
  // November: an advance of 21 000 (an empty month says so, quietly)
  const november = L.buildStatementItems(statement, "2026-11");
  assert.equal(plain(november.find((item) => item.kind === "carry").text), "С октября перенесён аванс 21 000");
  assert.equal(november.find((item) => item.kind === "month").empty, true);
  // the first month of the enrolment: nothing is carried, nothing is drawn
  assert.equal(L.buildStatementItems(statement, "2026-09").some((item) => item.kind === "carry"), false);
  // a zero balance is not told
  assert.equal(L.carryLine("2026-10", L.balanceCell(0)), null);
  assert.equal(L.carryLine("2026-10", { kind: "none", text: "" }), null);
  // the money columns stay empty on that line (no amounts, no icon, no date)
  const { html } = renderer();
  const line = html(React.createElement(StatementTimeline, { statement, menuFor: () => [], withVoided: false, month: "2026-10" })).match(/<li[^>]*data-testid="statement-carry".*?<\/li>/s)[0];
  assert.match(line, /text-sm text-slate-500/);
  assert.match(line, /text-rose-700[^>]*>долг 269 000/);
  assert.doesNotMatch(line, /<svg|statement-row-icon|\d\d\.\d\d\.\d{4}|statement-balance-chip/);
});

test("inc13-7: the month named after «С»: genitive, with the year only when it is another year", () => {
  const names = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  names.forEach((name, index) => {
    const key = `2026-${String(index + 1).padStart(2, "0")}`;
    assert.equal(L.monthFromWords(key, key), name, key);
  });
  assert.equal(L.monthFromWords("2025-12", "2026-01"), "декабря 2025");
  const carry = (month, amount) => plain(L.carryLine(month, L.balanceCell(amount)).text);
  assert.equal(carry("2026-09", 508000), "С августа перенесён аванс 508 000");
  assert.equal(carry("2026-10", -92000), "С сентября перенесён долг 92 000");
  assert.equal(carry("2026-01", 1000), "С декабря 2025 перенесён аванс 1 000");
  assert.equal(carry("2026-12", -5000), "С ноября перенесён долг 5 000");
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
