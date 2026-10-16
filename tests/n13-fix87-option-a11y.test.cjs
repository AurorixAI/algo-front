// N13 carry-over #87: the option buttons of the online exam have a name (aria-label) and a state (aria-pressed).
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
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};
const root = path.join(__dirname, "..");
const src = (p) => path.join(root, "src", p);
const read = (p) => fs.readFileSync(src(p), "utf8");

const { latexToSpeechText, optionAriaLabel, optionAriaPressed } = require(src("lib/math-speech.ts"));

// ---- #87 option buttons: a name and a state ------------------------------------------------------

test("latexToSpeechText: delimiters, fractions, roots, powers, operators", () => {
  const t = latexToSpeechText;
  assert.equal(t("$\\frac{1}{2}$"), "1/2");
  assert.equal(t("\\(\\dfrac{x+1}{x-1}\\)"), "(x+1)/(x-1)");
  assert.equal(t("\\frac{\\sqrt{3}}{2}"), "√3/2");
  assert.equal(t("$\\sqrt{5}$"), "√5");
  assert.equal(t("\\sqrt{x+1}"), "√(x+1)");
  assert.equal(t("\\sqrt[3]{8}"), "∛8");
  assert.equal(t("$x^2$"), "x в квадрате");
  assert.equal(t("x^{3}"), "x в кубе");
  assert.equal(t("2^{10}"), "2 в степени 10");
  assert.equal(t("a^{n+1}"), "a в степени (n+1)");
  assert.equal(t("90^{\\circ}"), "90°");
  assert.equal(t("\\text{см}^2"), "см в квадрате");
  assert.equal(t("2\\cdot 3"), "2 · 3");
  assert.equal(t("$x \\leq 5$ или $x \\geq 7$"), "x ≤ 5 или x ≥ 7");
  assert.equal(t("\\left(x+1\\right)^3"), "(x+1) в кубе");
  assert.equal(t("\\sin^2 x + \\cos x"), "sin в квадрате x + cos x");
  assert.equal(t("a_1 + a_{n}"), "a_1 + a_n");
  assert.equal(t("\\alpha+\\beta"), "α+β");
  assert.equal(t("\\begin{cases} x=1 \\\\ y=2 \\end{cases}"), "x=1; y=2");
  assert.equal(t("$$ 5 \\% $$"), "5 %");
});

test("latexToSpeechText: unknown commands go, spaces collapse, plain text and nothing pass through, it never throws", () => {
  const t = latexToSpeechText;
  assert.equal(t("\\foo{bar}"), "bar");
  assert.equal(t("\\overline{AB}"), "AB");
  assert.equal(t("a \\, b \\; c   d"), "a b c d");
  assert.equal(t("  Москва   и   Ташкент  "), "Москва и Ташкент");
  assert.equal(t("\\$5"), "$5"); // an escaped dollar is a dollar, not a delimiter
  assert.equal(t(""), "");
  assert.equal(t(null), "");
  assert.equal(t(undefined), "");
  for (const broken of ["\\frac{1", "\\frac", "x^", "\\sqrt[", "{{{", "}}}", "\\", "$", "a_", "\\begin{cases"]) {
    assert.doesNotThrow(() => t(broken), broken);
    assert.equal(typeof t(broken), "string");
  }
});

test("the option's name is «Вариант A: …»; the first press says how to confirm; aria-pressed has three states", () => {
  assert.equal(optionAriaLabel("A", "$\\frac{1}{2}$"), "Вариант A: 1/2");
  assert.equal(optionAriaLabel("C", "12"), "Вариант C: 12");
  assert.equal(optionAriaLabel("D", ""), "Вариант D");
  assert.equal(optionAriaLabel("B", "x^2", "pending"), "Вариант B: x в квадрате (отмечен, нажмите ещё раз, чтобы подтвердить)");
  assert.equal(optionAriaLabel("B", "x^2", "confirmed"), "Вариант B: x в квадрате");
  assert.equal(optionAriaPressed("idle"), false);
  assert.equal(optionAriaPressed("pending"), "mixed");
  assert.equal(optionAriaPressed("confirmed"), true);
});

test("every rendered option button has an aria-label with its plain text and an aria-pressed, formulas or not", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { OptionGrid } = require(src("components/ui/option-grid.tsx"));
  const options = [
    { id: "t-0", key: "1/2", label: "A", content: "1/2", contentLatex: "\\frac{1}{2}" },
    { id: "t-1", key: "x^2", label: "B", content: "x^2", contentLatex: null },
    { id: "t-2", key: "корень из 5", label: "C", content: "корень из 5", contentLatex: "\\sqrt{5}" },
    { id: "t-3", key: "нет решений", label: "D", content: "нет решений" },
  ];
  const html = renderToStaticMarkup(React.createElement(OptionGrid, { options, selected: "корень из 5", onSelect: () => {}, questionKey: "t" }));
  const buttons = html.match(/<button\b[^>]*>/g) || [];
  assert.equal(buttons.length, options.length);
  for (const button of buttons) {
    assert.match(button, /aria-label="Вариант [A-D](?::[^"]+)?"/, button);
    assert.match(button, /aria-pressed="(true|false|mixed)"/, button);
  }
  assert.match(buttons[0], /aria-label="Вариант A: 1\/2"/);
  assert.match(buttons[1], /aria-label="Вариант B: x в квадрате"/);
  assert.match(buttons[2], /aria-label="Вариант C: √5"/);
  assert.match(buttons[3], /aria-label="Вариант D: нет решений"/);
  assert.match(buttons[2], /aria-pressed="true"/);  // the confirmed option
  assert.match(buttons[0], /aria-pressed="false"/);
});

test("the grid labels its buttons from the same projection it draws, and both student pages use that grid", () => {
  const grid = read("components/ui/option-grid.tsx");
  assert.match(grid, /aria-label=\{optionAriaLabel\(opt\.label, display\.text, phase\)\}/);
  assert.match(grid, /aria-pressed=\{optionAriaPressed\(phase\)\}/);
  assert.match(grid, /const phase: OptionPhase = isConfirmed \? "confirmed" : isPending \? "pending" : "idle"/);
  // the two-step behaviour is untouched
  assert.match(grid, /const tap = resolveOptionTap\(pending, answerValue, disabled\)/);
  assert.match(read("app/e/[code]/page.tsx"), /<OptionGrid/);
  assert.match(read("app/d/[code]/page.tsx"), /<OptionGrid/);
});
