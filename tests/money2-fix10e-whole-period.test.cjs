// Money-2 fix 10Д (a trifle): a whole period given by DATES is «весь период», a calendar month stays «весь месяц».
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");
const opts = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true };
require.extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: opts }).outputText, f);
require.extensions[".tsx"] = require.extensions[".ts"];
const payFrom = require(path.join(__dirname, "..", "src", "lib", "pay-from.ts"));
const nb = (t) => t.replace(/[  ]/g, " ");
const part = (label, whole) => ({ label, from: "", amount: 450000, lessons: 12, lessons_in_period: 12, whole });

test("a whole period given by dates says «весь период»; a calendar month says «весь месяц»", () => {
  assert.equal(nb(payFrom.immediatePartRows([part("19.11–18.12", true)])[0].label), "19.11–18.12, весь период");
  assert.equal(nb(payFrom.immediatePartRows([part("ноябрь", true)])[0].label), "Ноябрь, весь месяц");
  assert.match(nb(payFrom.immediatePartLines([part("19.11–18.12", true)])[0]), /^19\.11–18\.12, весь период — 450 000 сум$/);
  assert.match(nb(payFrom.immediatePartLines([part("ноябрь", true)])[0]), /^Ноябрь, весь месяц — 450 000 сум$/);
  assert.equal(nb(payFrom.immediatePartRows([part("19.11–18.12", false)])[0].label).includes("весь"), false);
});
