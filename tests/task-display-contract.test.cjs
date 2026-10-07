const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

// Execute the production selector, including its real math-display dependency.
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
const { renderMathText } = require(path.join(__dirname, "../src/components/ui/math-renderer.tsx"));
const { pickTaskDisplayProjection, pickTaskDisplayText } = require(
  path.join(__dirname, "../src/lib/task-display.ts"),
);

const canonical = [
  ["longer legacy statement", "Старое подробное условие. ".repeat(20), "Найдите $x$."],
  ["bare formula", "Вычислите значение выражения.", String.raw`$\frac{3}{4}$`],
  ["legacy includes its own formula", "Решите $x^2 = 9$.", "$x^{2} = 9$"],
  ["Latin wording", "Решите уравнение и проверьте ответ.", "Solve $x+1=2$."],
  ["immutable LaTeX spelling", "Другой текст", String.raw`$x^{\dfrac{5}{6}}$`],
];
for (const [name, question_text, question_latex] of canonical) {
  test(`canonical column: ${name}`, () => {
    const fields = { question_text, question_latex, latex_attested: false };
    assert.deepEqual(pickTaskDisplayProjection(fields), { text: question_latex, renderMode: "trusted" });
    assert.equal(pickTaskDisplayText(fields), question_latex);
    assert.equal(fields.question_latex, question_latex);
  });
}
for (const question_latex of [undefined, null, "", "   "]) {
  test(`empty column falls back: ${String(question_latex)}`, () => {
    assert.deepEqual(pickTaskDisplayProjection({ question_text: "Найдите $x$.", question_latex }), {
      text: "Найдите $x$.", renderMode: "legacy",
    });
  });
}

// ---- line-break rules: glue formulas to the characters they touch ----------
const glue = (html) => [...html.matchAll(/<span class="math-glue">/g)].length;
const plain = (html) => html.replace(/<[^>]*>/g, "");
// text of every glue group, with KaTeX markup removed
const groups = (html) => {
  const res = [];
  let i = 0;
  while ((i = html.indexOf('<span class="math-glue">', i)) !== -1) {
    let depth = 0, j = i;
    for (const m of html.slice(i).matchAll(/<(\/?)span\b[^>]*>/g)) {
      depth += m[1] ? -1 : 1;
      j = i + m.index + m[0].length;
      if (depth === 0) break;
    }
    res.push(plain(html.slice(i, j)));
    i = j;
  }
  return res;
};

test("unit with superscript stays in one nowrap group", () => {
  const html = renderMathText("Площадь равна $10$ см$^{2}$ (ответ округлите до сотых)");
  const g = groups(html);
  assert.equal(g.length, 1);
  assert.match(g[0], /^10\s?см/);
  assert.ok(g[0].includes("2"));
  assert.ok(!g[0].includes("ответ"));
  assert.ok(html.includes("равна <span"), "space before the number stays breakable");
});

test("script-only formula after a space attaches to the word (legacy drops the space)", () => {
  const html = renderMathText("в см $^{2}$ ок");
  assert.equal(groups(html).length, 1);
  assert.ok(!/см\s+<span class="math-glue">/.test(html));
  assert.ok(plain(groups(html)[0]).startsWith("см"));
});

test("punctuation and brackets around a formula are glued", () => {
  const a = renderMathText("Ответ $(x_1;x_2)$, далее");
  assert.deepEqual(groups(a).map((t) => t.endsWith(",")), [true]);
  const b = renderMathText("значение ($a$) равно");
  assert.equal(groups(b).length, 1);
  assert.ok(groups(b)[0].startsWith("(") && groups(b)[0].endsWith(")"));
});

test("number and unit are not separated", () => {
  const html = renderMathText("Длина $12{,}3$ см, ширина");
  const g = groups(html);
  assert.equal(g.length, 1);
  assert.match(g[0], /12.*3.*см,$/);
  assert.equal(glue(renderMathText("Длина $12{,}3$ и ширина")), 0, "not a unit: normal breakable space");
});

test("spaced formulas stay free to wrap", () => {
  assert.equal(glue(renderMathText("Найдите $x$ и $y$ сейчас")), 0);
});

test("long sum breaks only at top-level operators, never inside fractions or parentheses", () => {
  const terms = Array.from({ length: 8 }, (_, i) => `\\frac{x^{${i + 1}}}{${i + 1}}`);
  const html = renderMathText(`$${terms.join("+")}+(a+b-c)=0$`);
  const bases = html.match(/<span class="base"/g) || [];
    assert.equal(bases.length, 10, "8 fraction terms + merged \"(a+b-c)=\" + \"0\"; without the merge it would be 12");
});
