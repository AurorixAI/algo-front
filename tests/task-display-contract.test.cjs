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
