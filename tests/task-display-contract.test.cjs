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
const { renderMathText, allowBreakAfterPunctuation } = require(path.join(__dirname, "../src/components/ui/math-renderer.tsx"));
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

test("break opportunities are added after top-level commas, quads, product groups and long digit runs only", () => {
  const abp = allowBreakAfterPunctuation;
  assert.equal(abp("x_1=2, x_2=5"), "x_1=2,\\allowbreak  x_2=5");
  assert.equal(abp("1;2;3"), "1;\\allowbreak 2;\\allowbreak 3");
  assert.equal(abp("12,5+1,5"), "12,5+1,5", "decimal comma stays whole");
  assert.equal(abp("x_{1,2}"), "x_{1,2}", "nothing inside braces");
  assert.equal(abp("\\left(a,b\\right)"), "\\left(a,b\\right)", "nothing inside \\left..\\right");
  assert.equal(abp("\\begin{cases}a,b\\\\c\\end{cases}"), "\\begin{cases}a,b\\\\c\\end{cases}", "nothing inside environments");
  assert.equal(abp("\\left(a\\right)\\left(b\\right)"), "\\left(a\\right)\\allowbreak \\left(b\\right)", "between factors");
  assert.equal(abp("\\left(a\\right)^{2}"), "\\left(a\\right)^{2}", "never before a script");
  assert.equal(abp("\\left(a\\right),"), "\\left(a\\right),", "trailing comma needs no break");
  assert.equal(abp("A\\quad B"), "A\\quad\\allowbreak  B");
  assert.equal(abp("x=1\\text{ или }x=2"), "x=1\\text{ или }\\allowbreak x=2");
  assert.equal(abp("\\text{слово}x"), "\\text{слово}x", "unpadded text is a word, not a connector");
  assert.equal(abp("123456789012345678"), "123456789\\allowbreak 012345678");
  assert.equal(abp("1234567890123"), "1234567890123", "short numbers stay whole");
  assert.equal(abp(abp("a, b")), abp("a, b"), "idempotent");
  assert.equal(abp("1, 2, ..., n"), "1,\\allowbreak  2, ...,\\allowbreak  n", "no break before an ellipsis");
  assert.equal(abp("1, \\dots, n"), "1, \\dots,\\allowbreak  n");
  const html = renderMathText("$x_1=2, x_2=5, x_3=7, x_4=9$");
  assert.equal((html.match(/<span class="base"/g) || []).length >= 7, true, "list now has a break opportunity per item");
  assert.equal(/<wbr>/.test(html), true);
});

test("fitMathElement scales formulas by at most 15 % and otherwise leaves the scroll alone", () => {
  const { fitMathElement, MIN_MATH_FIT } = require(path.join(__dirname, "../src/components/ui/math-fit.ts"));
  const attrs = new Map();
  const box = (clientWidth, widthAt) => {
    const el = {
      clientWidth,
      get scrollWidth() { return widthAt(attrs.get("--math-fit") ? Number(attrs.get("--math-fit")) : 1); },
      querySelectorAll: () => [],
      removeAttribute: () => attrs.delete("data-math-fit"),
      setAttribute: (k) => attrs.set(k, ""),
      style: { removeProperty: (k) => attrs.delete(k), setProperty: (k, v) => attrs.set(k, v) },
    };
    return el;
  };
  attrs.clear();
  assert.equal(fitMathElement(box(200, () => 200)), 1, "fits: untouched");
  attrs.clear();
  const fit = fitMathElement(box(200, (f) => 220 * f));
  assert.ok(fit < 1 && fit >= MIN_MATH_FIT && 220 * fit <= 200 + 1, `10 % over -> scaled (${fit})`);
  attrs.clear();
  assert.equal(fitMathElement(box(200, (f) => 300 * f)), 1, "50 % over: scale cannot help, keep size and scroll");
  assert.equal(attrs.has("data-math-fit"), false);
});
