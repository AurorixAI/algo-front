// Wave A / A1 (F-A20): the BEHAVIOUR of useExamRemoval - what the teacher's clicks do - with the exam API stubbed.
// There is no DOM renderer in this repo, so the hook runs in a minimal hook harness (useState / useRef / useCallback /
// useEffect over a slot array, a synchronous re-render on every state change); the logic under test is the real file.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const Module = require("node:module");

const root = path.join(__dirname, "..");
const compile = (jsx) => (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText, filename);
};
require.extensions[".ts"] = compile(false);
require.extensions[".tsx"] = compile(true);

// the stubbed exam API: only `delete` exists, and the test decides what it does
const calls = [];
let deleteImpl = async () => ({ ok: true });
const apiPath = path.join(root, "src/lib/api.ts");
require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: { examsApi: { delete: (...args) => { calls.push(args); return deleteImpl(...args); } } } };

// the hook harness
const realReact = require("react");
let slots = [];
let cursor = 0;
let rerender = () => {};
const harness = {
  ...realReact,
  useState(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = initial;
    return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; rerender(); }];
  },
  useRef(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = { current: initial };
    return slots[i];
  },
  useCallback: (fn) => { cursor++; return fn; },
  useEffect: () => { cursor++; },
};
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === "react") return harness;
  if (request.startsWith("@/")) request = path.join(root, "src", request.slice(2));
  return load.call(this, request, ...rest);
};
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...rest);
};
const { useExamRemoval } = require(path.join(root, "src/components/exam/exam-removal.tsx"));

function mount() {
  slots = [];
  const removed = [];
  const view = { current: null };
  const run = () => { cursor = 0; view.current = useExamRemoval((mode, examId) => removed.push([mode, examId])); };
  rerender = run;
  run();
  return { view, removed };
}
const refusal = (status, message) => Object.assign(new Error(message), { status });
const target = { mode: "delete", examId: "EXAM_1", title: "Контрольная" };

test.beforeEach(() => { calls.length = 0; deleteImpl = async () => ({ ok: true }); });

test("asking opens the dialog and sends nothing; confirm sends exactly the chosen action", async () => {
  const { view } = mount();
  assert.equal(view.current.removal, null);
  view.current.ask(target);
  assert.deepEqual(view.current.removal, target);
  assert.equal(calls.length, 0);
  await view.current.confirm();
  assert.deepEqual(calls, [["EXAM_1", true]]);

  const archive = mount();
  archive.view.current.ask({ ...target, mode: "archive" });
  await archive.view.current.confirm();
  assert.deepEqual(calls[1], ["EXAM_1", false]);
});

test("success closes the dialog and tells the page which exam went away", async () => {
  const { view, removed } = mount();
  view.current.ask(target);
  await view.current.confirm();
  assert.equal(view.current.removal, null);
  assert.equal(view.current.busy, false);
  assert.equal(view.current.error, null);
  assert.deepEqual(removed, [["delete", "EXAM_1"]]);
});

test("a 409 keeps the dialog open with the server's sentence and leaves no second try", async () => {
  const sentence = "У экзамена есть результаты учеников — его можно только отправить в архив";
  deleteImpl = async () => { throw refusal(409, sentence); };
  const { view, removed } = mount();
  view.current.ask(target);
  await view.current.confirm();
  assert.deepEqual(view.current.removal, target);
  assert.equal(view.current.error, sentence);
  assert.equal(view.current.blocked, true);
  assert.equal(view.current.busy, false);
  assert.deepEqual(removed, []);
  view.current.close();
  assert.equal(view.current.removal, null);
  assert.equal(view.current.error, null);
  assert.equal(view.current.blocked, false);
});

test("another failure keeps the dialog open and may be repeated", async () => {
  deleteImpl = async () => { throw refusal(503, "Сервис недоступен"); };
  const { view } = mount();
  view.current.ask(target);
  await view.current.confirm();
  assert.equal(view.current.error, "Сервис недоступен");
  assert.equal(view.current.blocked, false);
  deleteImpl = async () => ({ ok: true });
  await view.current.confirm();
  assert.equal(view.current.removal, null);
  assert.equal(calls.length, 2);
});

test("a 404 means a twin request already deleted it: the dialog closes and the page is told the exam is gone", async () => {
  deleteImpl = async () => { throw refusal(404, "Экзамен не найден"); };
  const { view, removed } = mount();
  view.current.ask(target);
  await view.current.confirm();
  assert.equal(view.current.removal, null);
  assert.equal(view.current.error, null);
  assert.deepEqual(removed, [["delete", "EXAM_1"]]);
});

test("a double click sends one request, even when both clicks land in the same render", async () => {
  let release;
  deleteImpl = () => new Promise((resolve) => { release = () => resolve({ ok: true }); });
  const { view, removed } = mount();
  view.current.ask(target);
  const click = view.current.confirm; // both clicks hold the same render's handler
  const first = click();
  const second = click();
  assert.equal(view.current.busy, true);
  view.current.close(); // Escape / backdrop mid-request does nothing either
  assert.deepEqual(view.current.removal, target);
  release();
  await Promise.all([first, second]);
  assert.equal(calls.length, 1);
  assert.deepEqual(removed, [["delete", "EXAM_1"]]);
  assert.equal(view.current.removal, null);
});

test("confirm without an open dialog does nothing", async () => {
  const { view } = mount();
  await view.current.confirm();
  assert.equal(calls.length, 0);
});
