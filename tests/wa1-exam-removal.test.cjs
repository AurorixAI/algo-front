// Wave A / A1 (F-A20, exam delete dialog only): archive and «delete forever» go through ui/modal, not the browser's confirm,
// the text says the difference, and the server's refusal (409: results exist / not archived) stays on screen.
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
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const R = require(path.join(root, "src/components/exam/exam-removal.tsx"));
const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const body = (mode, error = null) => textOf(renderToStaticMarkup(React.createElement(R.ExamRemovalBody, {
  removal: { mode, examId: "EXAM_1", title: "Контрольная 8А" }, error,
})));

test("delete forever says it cannot be undone, that results are never erased, and that archive is the way to just hide it", () => {
  const text = body("delete");
  assert.match(text, /«Контрольная 8А» будет удалён без возможности восстановления/);
  assert.match(text, /результаты учеников, удалить его не получится|есть результаты учеников/);
  assert.match(text, /оставьте его в архиве/);
  assert.equal(R.examRemovalCopy("delete", "x").heading, "Удалить экзамен навсегда?");
  assert.equal(R.examRemovalCopy("delete", "x").destructive, true);
});

test("archive says nothing is lost, that it can be restored, and when delete forever becomes possible", () => {
  const text = body("archive");
  assert.match(text, /ничего не будет потеряно/);
  assert.match(text, /Результаты учеников и история экзамена сохранятся/);
  assert.match(text, /восстановить|Вернуть экзамен/);
  assert.match(text, /только из архива и только если у него нет результатов/);
  assert.equal(R.examRemovalCopy("archive", "x").destructive, false);
});

test("an untitled exam still reads as a sentence", () => {
  assert.match(R.examRemovalCopy("delete", "").lead, /^Этот экзамен будет удалён/);
});

test("the server's refusal is shown in the dialog as an alert, verbatim", () => {
  const sentence = "У экзамена есть результаты учеников — его можно только отправить в архив";
  const html = renderToStaticMarkup(React.createElement(R.ExamRemovalBody, { removal: { mode: "delete", examId: "E", title: "T" }, error: sentence }));
  assert.match(html, /role="alert"/);
  assert.ok(textOf(html).includes(sentence));
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(R.ExamRemovalBody, { removal: { mode: "delete", examId: "E", title: "T" }, error: null })), /role="alert"/);
});

test("a 409 is final (no second try), anything else may be repeated; the message is the server's", () => {
  const refusal = Object.assign(new Error("Сначала отправьте экзамен в архив"), { status: 409 });
  assert.deepEqual(R.removalFailure(refusal), { error: "Сначала отправьте экзамен в архив", blocked: true });
  assert.deepEqual(R.removalFailure(Object.assign(new Error("Сервис недоступен"), { status: 503 })), { error: "Сервис недоступен", blocked: false });
  assert.deepEqual(R.removalFailure(new Error("   ")), { error: "Не удалось выполнить действие. Повторите попытку.", blocked: false });
  assert.deepEqual(R.removalFailure(null), { error: "Не удалось выполнить действие. Повторите попытку.", blocked: false });
});

test("archive asks the server to archive, delete asks for the erasure", () => {
  assert.deepEqual(R.removalRequest({ mode: "archive", examId: "E1", title: "" }), { examId: "E1", permanent: false });
  assert.deepEqual(R.removalRequest({ mode: "delete", examId: "E2", title: "" }), { examId: "E2", permanent: true });
});

test("the dialog is a ui/modal that cannot be dismissed mid-request, and a refusal leaves only «Закрыть»", () => {
  const src = read("src/components/exam/exam-removal.tsx");
  assert.match(src, /import \{ Modal \} from "@\/components\/ui\/modal"/);
  assert.match(src, /<Modal[\s\S]{0,200}busy=\{busy\}/);
  assert.match(src, /\{blocked \? "Закрыть" : "Отмена"\}/);
  assert.match(src, /\{!blocked && copy && \(/);
  // success closes it, failure keeps it (and the text) open
  assert.match(src, /await examsApi\.delete\(examId, permanent\);\s*const done = removal;\s*setRemoval\(null\);/);
  assert.match(src, /catch \(err\) \{\s*const failure = removalFailure\(err\);\s*setError\(failure\.error\);/);
});

test("no page asks about deleting or archiving an exam with the browser's confirm() / alert()", () => {
  for (const file of ["src/app/teacher/exams/page.tsx", "src/app/teacher/exams/[id]/page.tsx", "src/app/teacher/exams/[id]/draft/page.tsx"]) {
    const src = read(file);
    assert.doesNotMatch(src, /confirm\([^)]*(навсегда|в архив)/, file);
    assert.doesNotMatch(src, /alert\([^)]*(удалить экзамен|в архив: )/, file);
    assert.match(src, /useExamRemoval\(/, file);
    assert.match(src, /<ExamRemovalDialog/, file);
  }
  assert.match(read("src/app/teacher/exams/page.tsx"), /removal\.ask\(\{ mode: "delete", examId, title: exam\?\.title \?\? "" \}\)/);
  assert.match(read("src/app/teacher/exams/[id]/page.tsx"), /removal\.ask\(\{ mode: "archive"[\s\S]{0,1200}removal\.ask\(\{ mode: "delete"/);
});
