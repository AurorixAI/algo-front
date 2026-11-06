// Design system, wave 2 (light, no browser): StatusChip / Tag, the ONE table of tones, Notice, EmptyState, Skeleton - markup, roles, data-attributes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const opts = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true };
require.extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: opts }).outputText, f);
require.extensions[".tsx"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: opts }).outputText, f);
const Module = require("node:module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return origResolve.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest); };
const React = require("react");
const { renderToStaticMarkup: html } = require("react-dom/server");
const src = (p) => path.join(__dirname, "..", "src", p);
const { StatusChip, Tag } = require(src("components/ui/chip.tsx"));
const { Notice } = require(src("components/ui/notice.tsx"));
const { EmptyState } = require(src("components/ui/empty-state.tsx"));
const { SkeletonRows } = require(src("components/ui/skeleton.tsx"));
const tones = require(src("lib/chip-tone.ts"));

test("StatusChip is a pill with a tone and an optional dot; Tag is a 6 px rectangle that is never a status colour", () => {
  const status = html(React.createElement(StatusChip, { tone: "ok", dot: true }, "Оплачено"));
  assert.match(status, /rounded-full/); assert.match(status, /data-kind="status"/); assert.match(status, /data-tone="ok"/); assert.match(status, /bg-current/); assert.match(status, /success-/);
  const tag = html(React.createElement(Tag, null, "7 класс"));
  assert.match(tag, /rounded-tag/); assert.doesNotMatch(tag, /rounded-full/); assert.match(tag, /data-kind="tag"/);
});

test("one table of tones: every screen table reads it (no palette of its own); no chip text is smaller than 12 px", () => {
  for (const [name, file] of [["STATUS_CHIP_CLASS", "lib/payroll.ts"], ["PAYOUT_CHIP_CLASS", "lib/payroll-logica.ts"], ["PERIOD_CHIP_CLASS", "lib/closed-period.ts"], ["MARK_TONE_CLASS", "lib/substitutions.ts"]]) {
    const text = fs.readFileSync(src(file), "utf8");
    const block = text.slice(text.indexOf(`export const ${name}`), text.indexOf(`export const ${name}`) + 700);
    assert.doesNotMatch(block.split("\n}")[0], /bg-(amber|emerald|rose|sky|slate)-/, `${name} reads CHIP_TONE_CLASS`);
  }
  assert.doesNotMatch(Object.values(tones.CHIP_TONE_SIZE_CLASS ?? tones.CHIP_SIZE_CLASS).join(" "), /text-\[1\dpx\]/);
  assert.equal(tones.toneClass("warn"), tones.CHIP_TONE_CLASS.warn);
});

test("Notice: four variants with one look each; error is an alert, the rest a status; the action sits in its own slot", () => {
  for (const [variant, role, cls] of [["info", "status", "info-50"], ["warning", "status", "warning-50"], ["blocked", "status", "warning-50"], ["error", "alert", "danger-50"]]) {
    const out = html(React.createElement(Notice, { variant, title: "Т", action: React.createElement("button", null, "Сделать") }, "Текст"));
    assert.match(out, new RegExp(`role="${role}"`)); assert.match(out, new RegExp(`data-variant="${variant}"`)); assert.match(out, new RegExp(cls)); assert.match(out, /Сделать/);
  }
  assert.match(html(React.createElement(Notice, { variant: "blocked", role: "note" }, "x")), /role="note"/);
});

test("EmptyState: a phrase, a hint and one action; three variants; Skeleton is a status with a label", () => {
  const out = html(React.createElement(EmptyState, { title: "Пока пусто", hint: "Добавьте первую запись", action: React.createElement("button", null, "Добавить"), testId: "e" }));
  assert.match(out, /data-testid="e"/); assert.match(out, /border-dashed/); assert.match(out, /Пока пусто/); assert.match(out, /Добавить/);
  assert.doesNotMatch(html(React.createElement(EmptyState, { title: "x", variant: "inline" })), /border-dashed/);
  assert.match(html(React.createElement(EmptyState, { title: "x", variant: "filtered" })), /data-variant="filtered"/);
  assert.match(html(React.createElement(SkeletonRows, { count: 2 })), /role="status"[^>]*aria-label="Загружаем…"/);
});

test("screens use the components: the banners and empty states of the money, groups and payroll screens are Notice / EmptyState", () => {
  const uses = (file, word) => assert.match(fs.readFileSync(src(file), "utf8"), new RegExp(`<${word}\\b`), `${file} uses ${word}`);
  for (const f of ["components/money/dialog-error.tsx", "components/money/period-closed-notice.tsx", "components/ui/phase-lock-banner.tsx", "components/schedule/day-off-warning.tsx", "components/attendance/lesson-panel-error.tsx", "components/ui/data-load-error.tsx"]) uses(f, "Notice");
  for (const f of ["components/payments/statement-view.tsx", "components/payments/income-journal.tsx", "components/payments/income-collection.tsx", "components/groups/group-payments-tab.tsx", "components/payroll/sheet-table.tsx", "components/payroll/sheet-controls.tsx", "components/students/student-payments-block.tsx"]) uses(f, "EmptyState");
  uses("components/groups/group-card.tsx", "StatusChip"); uses("components/groups/group-card.tsx", "Tag");
});
