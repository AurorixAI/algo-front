/**
 * Diagnostics list: status pills and action buttons are one compact size (owner feedback 22.10: no «bricks», no «stairs»).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
require.extensions[".tsx"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const chrome = require(path.join(root, "src/components/diagnostics/list-chrome.tsx"));
const invite = require(path.join(root, "src/lib/diagnostic-invite.ts"));

const page = read("src/app/admin/diagnostics/page.tsx");
// every label the list can show: the statusConfig of the page, «Зачислен», and the student card badge
const statusBlock = page.slice(page.indexOf("const statusConfig"), page.indexOf("const typeLabels"));
const listLabels = [...statusBlock.matchAll(/label: ("[^"]+"|INVITE_CANCELLED_LABEL)/g)].map((m) => (m[1] === "INVITE_CANCELLED_LABEL" ? invite.INVITE_CANCELLED_LABEL : JSON.parse(m[1])));
const cardLabels = ["pending", "confirmed", "in_progress", "expired", "cancelled"].map(invite.studentCardInviteLabel);
const LABELS = [...new Set([...listLabels, ...cardLabels])];
const TONE = "bg-slate-100 text-slate-600 border-slate-200";

test("pills: the status set is complete (admin list + «Зачислен» + student card)", () => {
  for (const label of ["Ожидает", "Готов к началу", "Проходит тест", "Завершён", "Истёк", "Отменён", "Зачислен", "Не начата", "В процессе"]) {
    assert.ok(LABELS.includes(label) || label === "Зачислен", label);
  }
  assert.match(page, /label: "Зачислен"/);
});

test("pills: one width class for every status, text centred, h-8, text-sm font-medium, rounded-full", () => {
  const classes = new Set();
  for (const label of [...LABELS, "Зачислен"]) {
    const html = renderToStaticMarkup(React.createElement(chrome.DiagnosticStatusBadge, { tone: TONE, dot: "bg-slate-300" }, label));
    const cls = /<span[^>]*class="([^"]*)"/.exec(html)[1].split(/\s+/);
    const widths = cls.filter((c) => /^(sm:|lg:)?(min-|max-)?w-/.test(c) && !/^w-\d/.test(c));
    assert.deepEqual(widths, ["w-[9.5rem]"], label);
    for (const part of ["h-8", "rounded-full", "text-sm", "font-medium", "justify-center", "items-center", "whitespace-nowrap", "shrink-0"]) assert.ok(cls.includes(part), `${label}: ${part}`);
    classes.add(cls.join(" "));
  }
  assert.equal(classes.size, 1, "the same shape for every status");
});

test("pills: no w-full and no flex-1 on the pill or the action (no bricks)", () => {
  for (const tone of ["primary", "neutral", "solid"]) {
    const cls = chrome.diagnosticActionClass(tone).split(/\s+/);
    for (const bad of ["w-full", "flex-1", "grow", "sm:w-full", "lg:w-full"]) assert.ok(!cls.includes(bad), `${tone}: ${bad}`);
    assert.ok(cls.includes("w-[9.5rem]") && cls.includes("h-8"), tone);
  }
  const html = renderToStaticMarkup(React.createElement(chrome.DiagnosticStatusBadge, { tone: TONE, dot: "x" }, "Завершён"));
  const cls = /<span[^>]*class="([^"]*)"/.exec(html)[1].split(/\s+/);
  for (const bad of ["w-full", "flex-1", "grow"]) assert.ok(!cls.includes(bad), bad);
  const src = read("src/components/diagnostics/list-chrome.tsx");
  const base = /const BADGE_BASE =\s*"([^"]*)"/.exec(src)[1].split(/\s+/);
  for (const bad of ["w-full", "flex-1", "grow"]) assert.ok(!base.includes(bad), `BADGE_BASE: ${bad}`);
});

test("pills: no label is longer than the widest real one (14 chars) - a long label is shortened, the pill is not widened", () => {
  for (const label of [...LABELS, "Зачислен"]) assert.ok(label.length <= 14, `${label} (${label.length})`);
  assert.equal(chrome.DIAGNOSTIC_PILL_WIDTH, "w-[9.5rem]");
  assert.equal(chrome.DIAGNOSTIC_BADGE_WIDTH, chrome.DIAGNOSTIC_ACTION_WIDTH);
});

test("row: the badge and the action sit in one non-stretching column (gap-2); under the name block below lg", () => {
  assert.match(chrome.DIAGNOSTIC_ACTIONS_COLUMN, /\bgap-2\b/);
  assert.match(chrome.DIAGNOSTIC_ACTIONS_COLUMN, /\bw-full\b[^"]*\blg:w-auto\b/);
  assert.match(chrome.DIAGNOSTIC_ACTIONS_COLUMN, /lg:shrink-0/);
  assert.doesNotMatch(chrome.DIAGNOSTIC_ACTIONS_COLUMN, /flex-1|lg:w-full|lg:w-\[/);
  assert.match(page, /<div className=\{DIAGNOSTIC_ACTIONS_COLUMN\}>/);
  assert.match(page, /<div className="flex-1 min-w-0">/, "the middle column takes the free space");
});

test("row: a row without an action (cancelled, expired, enrolled without a profile) gets an invisible placeholder of the pill width", () => {
  const html = renderToStaticMarkup(React.createElement(chrome.DiagnosticActionSpacer));
  assert.match(html, /aria-hidden="true"/);
  const cls = /class="([^"]*)"/.exec(html)[1].split(/\s+/);
  for (const part of ["h-8", "w-[9.5rem]", "shrink-0", "hidden", "lg:block"]) assert.ok(cls.includes(part), part);
  // the page renders the placeholder as the last branch of the action chain
  assert.match(page, /\) : \(\s*<DiagnosticActionSpacer \/>\s*\)\}/);
});

test("the student card reuses the same pill and action sizing (one component)", () => {
  const card = read("src/components/students/student-profile-view.tsx");
  assert.match(card, /<DiagnosticStatusBadge/);
  assert.match(card, /diagnosticActionClass\("solid"\)/);
});

test("phone (below sm): the four KPI cards are a compact 2x2 grid; desktop classes are kept", () => {
  const grid = /data-testid="diagnostic-kpi-grid" className="([^"]*)"/.exec(page)[1].split(/\s+/);
  for (const c of ["grid", "grid-cols-2", "gap-2", "sm:gap-4", "xl:grid-cols-4"]) assert.ok(grid.includes(c), c);
  assert.ok(!grid.includes("grid-cols-1"), "no single full-width column on a phone");
  const card = /data-testid="diagnostic-kpi-card"\s*className=\{`([^`]*)`/.exec(page)[1];
  for (const c of ["p-3", "sm:p-5", "rounded-2xl", "sm:rounded-[2rem]"]) assert.ok(card.split(/\s+/).includes(c), c);
  // all four tiles are the same white card below sm: a border and a subtle shadow (the active one keeps its ring); desktop keeps its look
  const whole = card.replace(/\$\{[^}]*\}/g, "");
  assert.match(whole, /border border-slate-200 sm:border-transparent/);
  assert.match(page, /: "bg-white shadow-sm sm:bg-white\/60 sm:shadow-none sm:hover:bg-white"/, "the inactive tiles are white cards on a phone");
  assert.match(page, /\? "bg-white ring-1 ring-slate-200\/50 shadow-sm"/);
  assert.doesNotMatch(page, /: "bg-white\/60 hover:bg-white"/, "no borderless 60%-white tile on a phone");
  // the label: small, at most 2 lines
  const label = /data-testid="diagnostic-kpi-label" className=\{`([^`]*)`/.exec(page)[1];
  for (const c of ["text-xs", "line-clamp-2", "leading-tight"]) assert.ok(label.includes(c), c);
  // the number: text-2xl font-semibold on a phone, the big one from sm up
  assert.match(page, /text-2xl font-semibold sm:text-4xl sm:font-bold/);
  // decorative bits (watermark, icon tile, mini chart) are hidden below sm and come back at sm
  assert.match(page, /absolute -right-4 -bottom-4 hidden sm:block/);
  assert.match(page, /hidden sm:flex w-10 h-10 rounded-xl items-center justify-center/);
  assert.match(page, /hidden sm:flex w-12 h-6 items-end gap-1/);
});

test("D02: the invite pills on the student card carry a data-testid (tests do not rely on .h-8)", () => {
  const card = read("src/components/students/student-profile-view.tsx");
  assert.match(card, /<DiagnosticStatusBadge\s+testId="student-diagnostic-status"/);
  const html = renderToStaticMarkup(React.createElement(chrome.DiagnosticStatusBadge, { tone: TONE, dot: "x", testId: "student-diagnostic-status" }, "Не начата"));
  assert.match(html, /data-testid="student-diagnostic-status"/);
});
