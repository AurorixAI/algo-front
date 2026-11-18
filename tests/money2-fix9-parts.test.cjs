// Money-2 fix 9 (walk M12, п.7): the row of the break-down «К оплате сразу» for a part from which the earlier charge was taken off: the server sends `from: null`, `whole: false` (MONEY2_FIX_STAGE8).
// whole -> «Ноябрь, весь месяц»; not whole and a day -> «Ноябрь, с 17.11 · 5 уроков из 12»; not whole and no day -> «Ноябрь · 5 уроков из 12».  An old answer (`from` filled) is drawn as before.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const ts = require("typescript");
const fs = require("node:fs");
const Module = require("node:module");

// the library compiled on the fly (as the other tests of the project do)
function load(rel) {
  const file = path.join(__dirname, "..", "src", "lib", rel);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  const orig = m.require.bind(m);
  m.require = (request) => (request.startsWith("@/") ? load(request.slice(2) + ".ts") : request.startsWith(".") ? load(request.replace(/^\.\//, "") + ".ts") : orig(request));
  m._compile(code, file);
  return m.exports;
}
const payFrom = load("pay-from.ts");
const nb = (text) => text.replace(/[  ]/g, " ");
const part = (over) => ({ label: "ноябрь", from: "2026-11-17", amount: 187000, lessons: 5, lessons_in_period: 12, whole: false, ...over });

test("a part with a day: «Ноябрь, с 17.11 · 5 уроков из 12» (as before)", () => {
  assert.equal(payFrom.immediatePartRows(payFrom.normalizeParts([part({})]))[0].label, "Ноябрь, с 17.11 · 5 уроков из 12");
  assert.equal(nb(payFrom.immediatePartLines(payFrom.normalizeParts([part({})]))[0]), "Ноябрь, с 17.11 — 187 000 сум · 5 уроков из 12");
});
test("a part with NO day (`from: null`, `whole: false`): «Ноябрь · 5 уроков из 12» - not «весь месяц»", () => {
  const parts = payFrom.normalizeParts([part({ from: null })]);
  assert.equal(payFrom.immediatePartRows(parts)[0].label, "Ноябрь · 5 уроков из 12");
  assert.equal(nb(payFrom.immediatePartLines(parts)[0]), "Ноябрь — 187 000 сум · 5 уроков из 12");
  assert.equal(payFrom.immediatePartRows(payFrom.normalizeParts([part({ from: undefined })]))[0].label, "Ноябрь · 5 уроков из 12", "a missing key is the same");
});
test("a whole month is «весь месяц» whatever `from` is (null or a day)", () => {
  for (const from of [null, "2026-11-01"]) {
    const parts = payFrom.normalizeParts([part({ from, whole: true, lessons: 12 })]);
    assert.equal(payFrom.immediatePartRows(parts)[0].label, "Ноябрь, весь месяц");
    assert.equal(nb(payFrom.immediatePartLines(parts)[0]), "Ноябрь, весь месяц — 187 000 сум");
  }
});
test("one lesson: «1 урок из 12»; a period label is untouched", () => {
  assert.equal(payFrom.immediatePartRows(payFrom.normalizeParts([part({ from: null, lessons: 1 })]))[0].label, "Ноябрь · 1 урок из 12");
  assert.equal(payFrom.immediatePartRows(payFrom.normalizeParts([part({ label: "06.10–05.11", from: null, lessons: 2 })]))[0].label, "06.10–05.11 · 2 урока из 12");
});
