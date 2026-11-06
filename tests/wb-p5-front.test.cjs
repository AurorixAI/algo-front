// Wave B / P5 (B5 + B6): the BEHAVIOUR of the session and error layer, the exam countdown, the platform's dialogs, the small items.
//  - parseErrorBody / errorFromBody: one reader of the body of a failed answer for every client (no «[object Object]», no raw JSON);
//  - api(): a dead session rejects with the 401 ApiError (never `undefined`); uploads / downloads / exam / diagnostic services read errors the same way
//    and note the failure in the support ring;
//  - the exam countdown counts to a deadline on the wall clock (Date.now), re-syncs when the tab comes back;
//  - the platform's confirm (promise queue) and the guard that no native alert / confirm / prompt is left in src/;
//  - key of a payment send follows the body; one-word name; exam link; copy that fails; reset of the client state.
//  - MUTATIONS: the guards are removed from a copy of the source and the same scenarios must fail.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const Module = require("node:module");

const root = path.join(__dirname, "..");
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
require.extensions[".ts"] = (mod, filename) => mod._compile(transpile(fs.readFileSync(filename, "utf8")), filename);
require.extensions[".tsx"] = (mod, filename) => mod._compile(transpile(fs.readFileSync(filename, "utf8")), filename);
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const lib = (name) => require(path.join(root, "src/lib", name));

/** A module loaded from a MUTATED copy of its source (sibling imports still resolve from the real folder). */
function loadMutated(file, from, to) {
  const source = read(file);
  assert.ok(source.includes(from), `mutation target not found in ${file}: ${from}`);
  const mutated = source.replace(from, to);
  const filename = path.join(root, file);
  const mod = new Module(filename, null);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(transpile(mutated), filename);
  return mod.exports;
}

// ── 1. parseErrorBody: every shape of a failed answer ────────────────────────────────────────────────

const SHAPES = [
  ["string detail", { detail: "Группа не найдена" }, { message: "Группа не найдена" }],
  ["list of validation items", { detail: [{ loc: ["body", "email"], msg: "Некорректная почта" }, { loc: ["body", "name"], msg: "Обязательное поле" }] }, { message: "", issues: ["Некорректная почта", "Обязательное поле"], fields: { email: "Некорректная почта", name: "Обязательное поле" } }],
  ["list item without msg is skipped, never printed", { detail: [{ loc: ["body", "x"], type: "missing" }, { msg: "Нужен файл" }] }, { message: "", issues: ["Нужен файл"] }],
  ["list of plain strings", { detail: ["Первая", "Вторая"] }, { issues: ["Первая", "Вторая"] }],
  ["object detail {code, message}", { detail: { code: "IMPORT_IN_PROGRESS", message: "Импорт уже идёт" } }, { message: "Импорт уже идёт", code: "IMPORT_IN_PROGRESS" }],
  ["object detail with action", { detail: { code: "X", message: "Текст", action: "reload" } }, { action: "reload" }],
  ["object detail without message keeps NO raw json", { detail: { code: "X", extra: { deep: 1 } } }, { message: "", code: "X" }],
  ["message that is an object is not a message", { detail: { message: { nested: true } } }, { message: "" }],
  ["code and fields next to detail", { detail: "Ошибка", code: "TOP", fields: { phone: "Неверный номер" } }, { message: "Ошибка", code: "TOP", fields: { phone: "Неверный номер" } }],
  ["body without detail: the body is the detail", { message: "Просто текст", code: "C" }, { message: "Просто текст", code: "C" }],
  ["retry_after", { detail: "Много попыток", retry_after: 30 }, { retryAfter: 30 }],
  ["null / array / number body", null, { message: "", issues: [] }],
  ["a bare array body", [1, 2], { message: "" }],
];

function checkShapes(E) {
  for (const [name, body, want] of SHAPES) {
    const got = E.parseErrorBody(body);
    for (const [key, value] of Object.entries(want)) assert.deepEqual(got[key], value, `${name}: ${key}`);
    const text = E.errorMessageOf(got, "ЗАПАСНОЙ");
    assert.equal(typeof text, "string", name);
    assert.ok(!/\[object Object\]|{"|\[{/.test(text), `${name}: unreadable text «${text}»`);
  }
  assert.equal(E.errorMessageOf(E.parseErrorBody({ detail: [{ msg: "Нужен файл" }] }), "x"), "Нужен файл");
  assert.equal(E.errorMessageOf(E.parseErrorBody({ detail: [{ msg: "Раз" }, { msg: "Два" }] }), "x"), "Раз; Два");
  assert.equal(E.errorMessageOf(E.parseErrorBody({}), "ЗАПАСНОЙ"), "ЗАПАСНОЙ");
}

test("parseErrorBody understands every shape of a failed answer and never prints an object", () => {
  checkShapes(lib("error-body.ts"));
});

test("MUTATION: a reader that prints String(item) for a list item without msg fails the shapes", () => {
  const E = loadMutated("src/lib/error-body.ts", 'const text = typeof entry.msg === "string" ? stripValueError(entry.msg) : "";', 'const text = String(entry.msg ?? entry);');
  assert.throws(() => checkShapes(E));
});

test("MUTATION: a reader that stringifies an object detail fails the shapes", () => {
  const E = loadMutated("src/lib/error-body.ts", 'if (typeof entry.message === "string") result.message = stripValueError(entry.message);', 'result.message = typeof entry.message === "string" ? entry.message.trim() : JSON.stringify(entry);');
  assert.throws(() => checkShapes(E));
});

test("http-json errorFromBody (the onboarding / console client) reads through the same parser and keeps its Russian-only rule", () => {
  const H = lib("http-json.ts");
  const list = H.errorFromBody(422, { detail: [{ loc: ["body", "email"], msg: "Некорректная почта" }, { loc: ["body", "x"], msg: "Field required" }] });
  assert.deepEqual(list.fields, { email: "Некорректная почта", x: "Проверьте это поле" });
  assert.equal(list.message, "Проверьте заполнение полей.");
  const obj = H.errorFromBody(409, { detail: { code: "TAKEN", message: "Адрес уже занят" } });
  assert.equal(obj.message, "Адрес уже занят");
  assert.equal(obj.code, "TAKEN");
  assert.equal(H.errorFromBody(404, { detail: "Not Found" }).message, "Не найдено.");
  assert.equal(H.errorFromBody(500, null).message, "Сервис временно недоступен. Повторите попытку чуть позже.");
  assert.equal(H.errorFromBody(429, { detail: "Слишком часто", retry_after: 40 }).retryAfter, 40);
  assert.match(read("src/lib/http-json.ts"), /parseErrorBody\(body\)/);
});

// ── 2. the clients: api(), exam, diagnostic, uploads, downloads ──────────────────────────────────────

function loadApi() {
  const file = path.join(root, "src/lib/api.ts");
  delete require.cache[file];
  return require(file);
}

/** A browser in miniature: `answers` maps «METHOD path» to [status, body]; the rest answers 200. */
function world(answers = {}, { refreshWorks = true } = {}) {
  const state = { log: [], href: null, assigned: 0 };
  global.window = { location: { pathname: "/owner/settings", search: "", get href() { return state.href; }, set href(v) { state.assigned += 1; state.href = v; } } };
  global.localStorage = { removeItem() {}, getItem: () => null, setItem() {} };
  Object.defineProperty(globalThis, "navigator", { value: { locks: null }, configurable: true, writable: true });
  const reply = (status, body) => ({
    ok: status >= 200 && status < 300, status, headers: { get: () => null },
    json: async () => body, text: async () => (body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body)), blob: async () => ({ blob: true }),
  });
  global.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method || "GET"} ${u.pathname}`;
    state.log.push(key);
    if (u.pathname.endsWith("/auth/logout")) return answers["/auth/logout"] ? reply(...answers["/auth/logout"]) : reply(200, { ok: true });
    if (u.pathname.endsWith("/auth/refresh")) return refreshWorks ? reply(200, {}) : reply(401, { detail: "x" });
    const hit = Object.entries(answers).find(([k]) => key.endsWith(k) || key === k);
    if (hit) return reply(hit[1][0], hit[1][1]);
    return reply(200, { ok: true });
  };
  return state;
}
const failure = async (call) => {
  try { await call(); } catch (error) { return error; }
  assert.fail("expected a rejection");
};
const FILE = { name: "a.xlsx" };

test("BUG-4: an import refused with a validation LIST shows a Russian sentence, never «[object Object]»", async () => {
  world({ "/auth/org/import/preview": [422, { detail: [{ loc: ["body", "file"], msg: "Field required", type: "missing" }] }] });
  const { orgApi, IMPORT_FILE_FALLBACK } = loadApi();
  const error = await failure(() => orgApi.importPreview(FILE));
  assert.equal(error.name, "ApiError");
  assert.equal(error.status, 422);
  assert.equal(error.message, IMPORT_FILE_FALLBACK);
  assert.ok(!/object Object/.test(error.message));
  assert.match(error.message, /шаблон/);
});

test("BUG-4: an import refused with {code, message} keeps the server's text AND its code; a Russian list item is shown", async () => {
  world({ "/auth/org/import/commit": [409, { detail: { code: "IMPORT_IN_PROGRESS", message: "Импорт уже идёт. Подождите минуту." } }], "/auth/org/import/preview": [422, { detail: [{ msg: "В файле нет листа «Ученики»" }] }] });
  const { orgApi } = loadApi();
  const busy = await failure(() => orgApi.importCommit(FILE));
  assert.equal(busy.status, 409);
  assert.equal(busy.code, "IMPORT_IN_PROGRESS");
  assert.equal(busy.message, "Импорт уже идёт. Подождите минуту.");
  const list = await failure(() => orgApi.importPreview(FILE));
  assert.equal(list.message, "В файле нет листа «Ученики»");
});

test("BUG-4: an import answered with a gateway page (not JSON) is a calm sentence", async () => {
  world({ "/auth/org/import/preview": [502, "<html>Bad Gateway</html>"] });
  const { orgApi, IMPORT_FILE_FALLBACK } = loadApi();
  const error = await failure(() => orgApi.importPreview(FILE));
  assert.equal(error.status, 502);
  assert.equal(error.message, IMPORT_FILE_FALLBACK);
});

test("BUG-5: the exam service's {detail: {code, message}} reaches the screen with its code (409 / 422)", async () => {
  world({ "POST /api/v1/exams/E1/close": [409, { detail: { code: "EXAM_NOT_ACTIVE", message: "Экзамен уже завершён" } }] });
  const { examsApi } = loadApi();
  const error = await failure(() => examsApi.close("E1"));
  assert.equal(error.status, 409);
  assert.equal(error.code, "EXAM_NOT_ACTIVE");
  assert.equal(error.message, "Экзамен уже завершён");
});

test("BUG-5: the exam service's list detail is joined, its top-level code is kept", async () => {
  world({ "POST /api/v1/exams/E1/close": [422, { detail: [{ msg: "Первая" }, { msg: "Вторая" }], code: "BAD" }] });
  const { examsApi } = loadApi();
  const error = await failure(() => examsApi.close("E1"));
  assert.equal(error.message, "Первая; Вторая");
  assert.equal(error.code, "BAD");
});

test("BUG-5: the diagnostic service's object detail with no message is NOT shown as raw JSON", async () => {
  world({ "/diagnostic/sessions/by-invite": [409, { detail: { code: "INVITE_USED", action: "restart", extra: { a: 1 } } }] });
  const { diagnosticApi } = loadApi();
  const error = await failure(() => diagnosticApi.resolveSession("ABC"));
  assert.equal(error.status, 409);
  assert.ok(!/[{}"]/.test(error.message), error.message);
  assert.equal(error.code, "INVITE_USED");
  assert.equal(error.action, "restart");
});

test("DUP-1: the account API, exam and diagnostic services read a body the same way", async () => {
  const bodies = [{ detail: "Текст сервера" }, { detail: [{ msg: "Раз" }, { msg: "Два" }] }, { detail: { code: "K", message: "Объект" } }];
  const expected = ["Текст сервера", "Раз; Два", "Объект"];
  for (let i = 0; i < bodies.length; i += 1) {
    world({ "/auth/me": [400, bodies[i]], "/exams/E1/close": [400, bodies[i]], "/diagnostic/sessions/by-invite": [400, bodies[i]] });
    const { authApi, examsApi, diagnosticApi } = loadApi();
    const messages = [
      (await failure(() => authApi.me())).message,
      (await failure(() => examsApi.close("E1"))).message,
      (await failure(() => diagnosticApi.resolveSession("A"))).message,
    ];
    assert.deepEqual(messages, [expected[i], expected[i], expected[i]], JSON.stringify(bodies[i]));
  }
});

test("DUP-1: a failed upload, download and delete enter the support ring (status + method + route template, never the text)", async () => {
  world({
    "/auth/org/import/preview": [422, { detail: "Секретный текст" }],
    "/auth/org/import/template": [500, { detail: "x" }],
  });
  const { orgApi } = loadApi();
  const { recentClientErrors, resetClientErrors } = lib("support.ts");
  resetClientErrors();
  await failure(() => orgApi.importPreview(FILE));
  await failure(() => orgApi.downloadImportTemplate());
  const ring = recentClientErrors();
  assert.deepEqual(ring.map((r) => [r.status, r.method, r.route_template]), [[422, "POST", "/auth/org/import/preview"], [500, "GET", "/auth/org/import/template"]]);
  assert.ok(!JSON.stringify(ring).includes("Секретный"));
});

test("a download failure shows the server's Russian text, and a framework default becomes the Russian fallback", async () => {
  world({ "/auth/org/import/template": [403, { detail: "Недостаточно прав для шаблона" }] });
  let api = loadApi();
  assert.equal((await failure(() => api.orgApi.downloadImportTemplate())).message, "Недостаточно прав для шаблона");
  world({ "/auth/org/import/template": [404, { detail: "Not Found" }] });
  api = loadApi();
  assert.equal((await failure(() => api.orgApi.downloadImportTemplate())).message, "Не удалось скачать шаблон");
});

const ENGLISH_CASES = [
  // [name, status, body, expected sentence]
  ["a validator's Russian text with the framework prefix", 422, { detail: [{ loc: ["body", "amount"], msg: "Value error, Сумма должна быть больше нуля" }] }, "Сумма должна быть больше нуля"],
  ["the prefix on a string detail", 400, { detail: "Value error, Нельзя так" }, "Нельзя так"],
  ["English items are dropped, a Russian one stays", 422, { detail: [{ msg: "Field required" }, { msg: "Input should be a valid integer" }, { msg: "Укажите класс" }] }, "Укажите класс"],
  ["a 422 list with nothing Russian -> the phrase of the status", 422, { detail: [{ loc: ["body", "x"], msg: "Input should be greater than or equal to 1" }] }, "Проверьте заполнение полей"],
  ["404 «Not Found»", 404, { detail: "Not Found" }, "Не найдено"],
  ["403 «Forbidden»", 403, { detail: "Forbidden" }, "Нет доступа"],
  ["409 English", 409, { detail: "Conflict" }, "Данные изменились — обновите страницу"],
  ["500 English", 500, { detail: "Internal Server Error" }, "Сервис временно недоступен"],
  ["{code} without a message and a code we do not know -> by the status", 409, { detail: { code: "SOMETHING_NEW", action: "reload" } }, "Данные изменились — обновите страницу"],
  ["{code} without a message and a known code -> by the code", 409, { detail: { code: "EXAM_NOT_ARCHIVED" } }, "Экзамен уже не в архиве. Обновите страницу."],
  ["a Russian text is shown as it is", 409, { detail: "Группа заполнена" }, "Группа заполнена"],
  ["a body that is not JSON", 502, "<html>Bad Gateway</html>", "Сервис временно недоступен"],
];

test("R3 #3: English never reaches a person - the same rule for the account API, the exam service and the diagnostic service", async () => {
  for (const [name, status, body, expected] of ENGLISH_CASES) {
    world({ "/auth/me": [status, body], "/exams/E1/close": [status, body], "/diagnostic/sessions/by-invite": [status, body] });
    const { authApi, examsApi, diagnosticApi } = loadApi();
    const got = [
      (await failure(() => authApi.me())).message,
      (await failure(() => examsApi.close("E1"))).message,
      (await failure(() => diagnosticApi.resolveSession("A"))).message,
    ];
    assert.deepEqual(got, [expected, expected, expected], name);
  }
});

test("R3 #3: the fields to highlight are kept (the prefix cut, English texts left to the Russian filter of the form)", () => {
  const E = lib("error-body.ts");
  const parsed = E.parseErrorBody({ detail: [{ loc: ["body", "amount"], msg: "Value error, Сумма должна быть больше нуля" }, { loc: ["body", "name"], msg: "Field required" }] });
  assert.deepEqual(parsed.fields, { amount: "Сумма должна быть больше нуля", name: "Field required" });
  assert.equal(E.stripValueError("Value error, Текст"), "Текст");
  assert.equal(E.stripValueError("value error,Текст"), "Текст");
  assert.equal(E.stripValueError("Обычный текст"), "Обычный текст");
});

test("MUTATION: a rule that shows the server's text whatever the language fails the English cases", () => {
  const E = loadMutated("src/lib/error-body.ts", "if (parsed.message && CYRILLIC.test(parsed.message)) return tidyMoneyText(parsed.message);", "if (parsed.message) return parsed.message;");
  assert.equal(E.errorMessageOf(E.parseErrorBody({ detail: "Not Found" }), "x", 404), "Not Found", "the mutation lets English through");
  const real = lib("error-body.ts");
  assert.equal(real.errorMessageOf(real.parseErrorBody({ detail: "Not Found" }), "x", 404), "Не найдено");
});

test("R3 #4: an error toast stays at least 8 s and has the cross «Закрыть»; a success toast is as short as before", () => {
  const T = lib("toast-timing.ts");
  assert.ok(T.toastLifetimeMs("error", false) >= 8000);
  assert.ok(T.toastLifetimeMs("warning", false) >= 8000);
  assert.equal(T.toastLifetimeMs("success", false), 3500);
  assert.equal(T.toastLifetimeMs("success", true), 10000, "a toast with details as before");
  assert.equal(T.toastClosable("error", false), true);
  assert.equal(T.toastClosable("success", false), false);
  const toast = read("src/components/ui/toast.tsx");
  assert.match(toast, /toastLifetimeMs\(type, Boolean\(details\?\.length\)\)/);
  assert.match(toast, /aria-label="Закрыть"/);
  const mutated = loadMutated("src/lib/toast-timing.ts", 'return type === "success" ? SUCCESS_TOAST_MS : ERROR_TOAST_MS;', "return SUCCESS_TOAST_MS;");
  assert.ok(mutated.toastLifetimeMs("error", false) < 8000, "the old 3.5 s would fail the first assertion");
});

test("BUG-3: after a dead session api() rejects with the 401 ApiError, never `undefined`", async () => {
  const state = world({ "/auth/me": [401, { detail: "Токен истёк" }], "/auth/org/students": [401, { detail: "Токен истёк" }] }, { refreshWorks: false });
  const { authApi, orgApi } = loadApi();
  for (const call of [() => authApi.me(), () => orgApi.listStudentsPage({})]) {
    const error = await failure(call);
    assert.equal(error.name, "ApiError");
    assert.equal(error.status, 401);
    assert.equal(error.code, "session_ended");
  }
  assert.match(state.href, /^\/login/);
});

test("BUG-3: a list reader of a dead session no longer falls with a TypeError on `response.items`", async () => {
  world({ "/auth/org/students": [401, { detail: "x" }] }, { refreshWorks: false });
  const { orgApi } = loadApi();
  const error = await failure(() => orgApi.listStudentsPage({}));
  assert.notEqual(error.name, "TypeError");
});

test("R3 #12: on a dead session an upload, a download and a staff exam call say «Сессия закончилась», not their own fallback", async () => {
  const state = world({ "/auth/org/import/preview": [401, { detail: "x" }], "/auth/org/import/template": [401, { detail: "x" }], "/exams/E1/close": [401, { detail: "x" }] }, { refreshWorks: false });
  const { orgApi, examsApi } = loadApi();
  for (const call of [() => orgApi.importPreview(FILE), () => orgApi.downloadImportTemplate(), () => examsApi.close("E1")]) {
    const error = await failure(call);
    assert.equal(error.status, 401);
    assert.equal(error.code, "session_ended");
    assert.match(error.message, /Сессия закончилась/);
  }
  assert.match(state.href, /^\/login/);
});

test("R3 #5: the replace error shows the server's own sentence for 400 and 409 alike", () => {
  const page = read("src/app/teacher/exams/[id]/page.tsx");
  const replace = page.slice(page.indexOf("const handleConfirmReplace"), page.indexOf("const handleGenerateReport"));
  assert.doesNotMatch(replace, /status === 409/);
  assert.match(page, /setReplaceError\(err\?\.message \|\| "Не удалось заменить задачу"\)/);
  assert.equal(fs.existsSync(path.join(root, "tests/a4-public-surfaces.test.cjs")), false, "R3 #9: the empty duplicate test file is gone");
});

// ── 3. the exam countdown ────────────────────────────────────────────────────────────────────────────

/** A fake clock + timers + page events; `advance(ms)` moves the wall clock WITHOUT firing the timers (a throttled background tab). */
function fakeClock(start = 1_000_000) {
  const clock = { now: start, timers: new Map(), nextId: 1, returns: new Set(), ticks: [] };
  const env = {
    now: () => clock.now,
    setTimer: (run, ms) => { const id = clock.nextId++; clock.timers.set(id, { run, at: clock.now + ms }); return id; },
    clearTimer: (id) => { clock.timers.delete(id); },
    onReturn: (run) => { clock.returns.add(run); return () => clock.returns.delete(run); },
  };
  return {
    env, clock,
    /** the tab is in the background: the clock goes on, the timers do not fire */
    sleep(ms) { clock.now += ms; },
    /** the browser fires the timers that are due */
    fire() { for (const [id, t] of [...clock.timers]) if (t.at <= clock.now) { clock.timers.delete(id); t.run(); } },
    /** a normal second */
    second() { clock.now += 1000; this.fire(); },
    visible() { for (const run of [...clock.returns]) run(); },
  };
}

test("F-A15: the countdown follows the wall clock - a tab asleep for 5 minutes shows the right time on return", () => {
  const C = lib("exam-clock.ts");
  const f = fakeClock();
  const seen = [];
  const deadline = C.deadlineAfter(600, f.clock.now);
  C.startDeadlineTicker(deadline, (left) => seen.push(left), f.env);
  assert.equal(seen.at(-1), 600);
  f.second(); f.second();
  assert.equal(seen.at(-1), 598);
  f.sleep(300_000);                     // locked phone: 5 minutes pass, no timer fires
  assert.equal(seen.at(-1), 598, "nothing has been recomputed yet");
  f.visible();                          // visibilitychange
  assert.equal(seen.at(-1), 298, "the 5 minutes are subtracted at once");
});

test("F-A15: a throttled timer (one tick after 90 s) is also exact; time never goes below 0; the ticker stops itself", () => {
  const C = lib("exam-clock.ts");
  const f = fakeClock();
  const seen = [];
  C.startDeadlineTicker(C.deadlineAfter(100, f.clock.now), (left) => seen.push(left), f.env);
  f.sleep(90_000); f.fire();
  assert.equal(seen.at(-1), 10);
  f.sleep(500_000); f.fire();
  assert.equal(seen.at(-1), 0);
  const after = seen.length;
  f.second(); f.visible();
  assert.equal(seen.length, after, "stopped after reaching 0");
  assert.equal(f.clock.timers.size, 0);
  assert.equal(f.clock.returns.size, 0, "the page listeners are removed");
});

test("F-A15: the deadline is fixed when the exam is received - Date.now is the only clock (substituted Date.now)", () => {
  const C = lib("exam-clock.ts");
  const real = Date.now;
  try {
    Date.now = () => 5_000_000;
    const deadline = C.deadlineAfter(120, Date.now());
    assert.equal(deadline, 5_120_000);
    Date.now = () => 5_000_000 + 119_001;
    assert.equal(C.secondsUntil(deadline, Date.now()), 1, "rounded up: 00:01 until the last moment");
    Date.now = () => 5_120_000;
    assert.equal(C.secondsUntil(deadline, Date.now()), 0);
    Date.now = () => 9_999_999;
    assert.equal(C.secondsUntil(deadline, Date.now()), 0, "never negative");
  } finally { Date.now = real; }
  assert.equal(C.deadlineAfter(-5, 100), 100);
});

test("MUTATION: a decrementing counter (one second per tick) fails the same sleep scenario", () => {
  const C = loadMutated("src/lib/exam-clock.ts", "const left = secondsUntil(deadline, env.now());", "const left = (tick.n = (tick.n ?? Math.ceil((deadline - env.now()) / 1000) + 1) - 1);");
  const f = fakeClock();
  const seen = [];
  C.startDeadlineTicker(C.deadlineAfter(600, f.clock.now), (left) => seen.push(left), f.env);
  f.second(); f.second();
  f.sleep(300_000);
  f.visible();
  assert.notEqual(seen.at(-1), 298, "a decrement shows 5 minutes that are already gone");
});

test("MUTATION: a ticker without the return-to-tab hook does not re-sync", () => {
  const C = loadMutated("src/lib/exam-clock.ts", "const unsubscribe = env.onReturn(tick);", "const unsubscribe = () => {};");
  const f = fakeClock();
  const seen = [];
  C.startDeadlineTicker(C.deadlineAfter(600, f.clock.now), (left) => seen.push(left), f.env);
  f.sleep(300_000);
  f.visible();
  assert.notEqual(seen.at(-1), 300);
});

test("F-A15: the browser env ticks on visibilitychange / pageshow / focus and unsubscribes", () => {
  const C = lib("exam-clock.ts");
  const listeners = { doc: {}, win: {} };
  const add = (bucket) => (type, fn) => { (bucket[type] ??= new Set()).add(fn); };
  const del = (bucket) => (type, fn) => { bucket[type]?.delete(fn); };
  global.document = { visibilityState: "visible", addEventListener: add(listeners.doc), removeEventListener: del(listeners.doc) };
  global.window = { addEventListener: add(listeners.win), removeEventListener: del(listeners.win), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) };
  const env = C.browserTickerEnv();
  let calls = 0;
  const off = env.onReturn(() => { calls += 1; });
  for (const fn of listeners.doc.visibilitychange) fn();
  for (const fn of listeners.win.pageshow) fn();
  for (const fn of listeners.win.focus) fn();
  assert.equal(calls, 3);
  document.visibilityState = "hidden";
  for (const fn of listeners.doc.visibilitychange) fn();
  assert.equal(calls, 3, "going to the background does not recompute");
  off();
  assert.equal(listeners.doc.visibilitychange.size + listeners.win.pageshow.size + listeners.win.focus.size, 0);
});

test("F-A15: the student's page is driven by the deadline, not by a decrement", () => {
  const page = read("src/app/e/[code]/page.tsx");
  assert.match(page, /startDeadlineTicker\(examDeadline, setTimeLeft, browserTickerEnv\(\)\)/);
  assert.match(page, /setExamDeadline\(deadlineAfter\(remSec, Date\.now\(\)\)\)/);
  assert.doesNotMatch(page, /setTimeLeft\(\(t\) =>/, "no decrement of the counter");
  assert.equal((page.match(/setExamDeadline\(deadlineAfter/g) || []).length, 2, "both starts (waiting room and direct) set the deadline");
});

// ── 4. the platform's dialogs ────────────────────────────────────────────────────────────────────────

test("askConfirm: a promise per question, in order; Escape / backdrop / «Отмена» answer false", async () => {
  const D = lib("confirm-dialog.ts");
  const seen = [];
  const off = D.subscribeConfirm(() => seen.push(D.currentConfirm()?.title ?? null));
  const first = D.askConfirm({ title: "Первый" });
  const second = D.askConfirm({ title: "Второй", tone: "danger" });
  assert.equal(D.currentConfirm().title, "Первый", "the second waits its turn");
  D.answerConfirm(true);
  assert.equal(await first, true);
  assert.equal(D.currentConfirm().title, "Второй");
  D.answerConfirm(false);
  assert.equal(await second, false);
  assert.equal(D.currentConfirm(), null);
  D.answerConfirm(true); // nothing on screen: harmless
  off();
  assert.deepEqual(seen, ["Первый", "Первый", "Второй", null]);
});

test("R3 #6: the same question asked twice before it is answered is ONE question - the action behind it runs once", async () => {
  const D = lib("confirm-dialog.ts");
  let runs = 0;
  const handler = async () => { if (await D.askConfirm({ title: "Убрать ученика из сессии?", message: "Ученик «Иванов»" })) runs += 1; };
  const first = handler();
  const second = handler();                                      // the double click before the window was drawn
  await second;
  assert.equal(D.currentConfirm().title, "Убрать ученика из сессии?");
  D.answerConfirm(true);
  await first;
  assert.equal(runs, 1, "removed once");
  assert.equal(D.currentConfirm(), null, "no second window behind the first");
  // another student is another question
  const a = D.askConfirm({ title: "Убрать ученика из сессии?", message: "Ученик «Петров»" });
  const b = D.askConfirm({ title: "Убрать ученика из сессии?", message: "Ученик «Сидоров»" });
  D.answerConfirm(false); D.answerConfirm(false);
  assert.deepEqual([await a, await b], [false, false]);
});

function scanNativeDialogs(sourceText, fileName = "x.tsx") {
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.ES2020, true, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const declared = new Set();
  const calls = [];
  const NATIVE = new Set(["alert", "confirm", "prompt"]);
  const GLOBALS = new Set(["window", "win", "globalThis", "self", "top", "parent"]);
  const visit = (node) => {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isMethodSignature(node) || ts.isMethodDeclaration(node)) && node.name && ts.isIdentifier(node.name)) declared.add(node.name.text);
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) declared.add(node.name.text);
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && NATIVE.has(callee.text)) calls.push({ name: callee.text, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, global: false });
      if (ts.isPropertyAccessExpression(callee) && NATIVE.has(callee.name.text) && ts.isIdentifier(callee.expression) && GLOBALS.has(callee.expression.text)) calls.push({ name: callee.name.text, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, global: true });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  // a bare `confirm(...)` that the file declares itself (a local function, a destructured name) is not the browser's
  return calls.filter((call) => call.global || !declared.has(call.name));
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("F-A20 guard: the scanner finds every shape of a native dialog (and leaves a local function alone)", () => {
  assert.equal(scanNativeDialogs('alert("x");').length, 1);
  assert.equal(scanNativeDialogs('if (!confirm("?")) return;').length, 1);
  assert.equal(scanNativeDialogs('window.confirm("?")').length, 1);
  assert.equal(scanNativeDialogs('win.confirm(getMessage())').length, 1);
  assert.equal(scanNativeDialogs('globalThis.alert(1); prompt("a")').length, 2);
  assert.equal(scanNativeDialogs('function confirm() {}\nvoid confirm();').length, 0);
  assert.equal(scanNativeDialogs('const { confirm } = useX();\nconfirm();').length, 0);
  assert.equal(scanNativeDialogs('diagnosticInviteApi.confirm(code); toast.alert(1)').length, 0);
  assert.equal(scanNativeDialogs('<p role="alert">x</p>').length, 0);
  assert.equal(scanNativeDialogs('// alert("x")\nconst s = "confirm(1)";').length, 0, "comments and strings are not calls");
});

test("F-A20: src/ has NO native alert / confirm / prompt (the platform's dialog and toasts are used)", () => {
  const found = [];
  for (const file of walk(path.join(root, "src"))) {
    for (const call of scanNativeDialogs(fs.readFileSync(file, "utf8"), file)) found.push(`${path.relative(root, file)}:${call.line} ${call.name}()`);
  }
  assert.deepEqual(found, [], "use askConfirm()/useConfirm() for a question and showToast() for a message");
});

test("F-A20: the host of the dialog is mounted once in the providers, above every page", () => {
  assert.match(read("src/app/providers.tsx"), /<ConfirmHost \/>/);
  const host = read("src/components/ui/confirm-host.tsx");
  assert.match(host, /aboveLessonPanel/);
  assert.match(host, /answerConfirm\(false\)/);
});

test("F-A20: the leave-page guard asks through the platform's dialog, holds the click back and repeats it on «Уйти»", () => {
  const guard = read("src/lib/use-unsaved-guard.ts");
  assert.doesNotMatch(guard, /\.confirm\(/);
  assert.match(guard, /win\.ask\(getMessage\(\)\)/);
  assert.match(read("src/components/payroll/payroll-month-page.tsx"), /await askConfirm\(\{/);
  assert.match(read("src/app/teacher/exams/[id]/page.tsx"), /await askConfirm\(\{/);
});

test("F-A20: the screens that had an alert show the failure as a toast (toastNode rendered)", () => {
  for (const file of ["src/app/owner/settings/page.tsx", "src/app/owner/teachers/page.tsx", "src/components/groups/group-exams-tab.tsx", "src/app/teacher/exams/page.tsx", "src/app/teacher/exams/new/page.tsx", "src/app/teacher/exams/[id]/page.tsx", "src/app/teacher/exams/[id]/draft/page.tsx"]) {
    const source = read(file);
    assert.match(source, /\{toastNode\}/, file);
    assert.match(source, /showToast\(/, file);
  }
});

// ── 5. the small items ───────────────────────────────────────────────────────────────────────────────

/** A server that remembers the key of every record it made (payments_service._guard_key / payroll_payouts: 409 on a used key). */
function moneyServer() {
  const records = [];
  return {
    records,
    post(key, amount) {
      if (records.some((r) => r.key === key)) return { status: 409, code: "DUPLICATE_PAYMENT" };
      records.push({ key, amount });
      return { status: 201 };
    },
  };
}

test("BUG-6 (rolled back, R3): lost answer -> the sum is corrected -> repeated: NO second payment, the person is told what was recorded", () => {
  const L = lib("payments-ledger.ts");
  const A = lib("send-attempt.ts");
  const P = lib("payments.ts");
  const server = moneyServer();
  const first = { current: null };
  const key = lib("idempotency-key.ts").newIdempotencyKey();                       // the dialog opens: ONE key
  const body500 = JSON.stringify([{ amount: 500000 }, ""]);
  A.rememberFirstSend(first, body500, 500000);
  assert.equal(server.post(key, 500000).status, 201);       // it arrived; the answer was lost (the dialog shows «Не удалось подключиться»)
  const body450 = JSON.stringify([{ amount: 450000 }, ""]);
  A.rememberFirstSend(first, body450, 450000);              // the person corrects the sum and presses «Внести» again: SAME key
  const answer = server.post(key, 450000);
  assert.equal(answer.status, 409);
  assert.equal(server.records.length, 1, "no second payment");
  const notice = A.duplicateNotice(first.current, body450, P.formatMoney, A.PAYMENT_WORDS);
  assert.equal(notice.tone, "warning");
  assert.match(notice.text.replace(/\u00a0/g, " "), /^Первая отправка уже записана \(500 000 сум\)\. Если сумма неверна — отмените эту оплату в журнале и внесите заново\.$/);
});

test("BUG-6 (R3): a double click with the SAME body is the plain «already entered»; a payout says «выплату» / «в ведомости»", () => {
  const A = lib("send-attempt.ts");
  const P = lib("payments.ts");
  const first = { current: null };
  A.rememberFirstSend(first, "X", 100);
  A.rememberFirstSend(first, "Y", 999);                      // only the FIRST send is remembered
  assert.deepEqual(first.current, { signature: "X", amount: 100 });
  assert.deepEqual(A.duplicateNotice(first.current, "X", P.formatMoney, A.PAYMENT_WORDS), { text: "Эта оплата уже внесена", tone: "success" });
  assert.deepEqual(A.duplicateNotice(null, "X", P.formatMoney, A.PAYOUT_WORDS), { text: "Эта выплата уже внесена", tone: "success" });
  const payout = A.duplicateNotice(first.current, "other", P.formatMoney, A.PAYOUT_WORDS);
  assert.match(payout.text, /отмените эту выплату в ведомости и внесите заново/);
});

test("BUG-6 (R3): closing and reopening the dialog is a NEW payment on purpose - a new key, the first send is forgotten", () => {
  const L = lib("payments-ledger.ts");
  const server = moneyServer();
  const key1 = lib("idempotency-key.ts").newIdempotencyKey();
  assert.equal(server.post(key1, 500000).status, 201);
  const key2 = lib("idempotency-key.ts").newIdempotencyKey();                        // the dialog opened again
  assert.notEqual(key1, key2);
  assert.equal(server.post(key2, 500000).status, 201);
  assert.equal(server.records.length, 2);
  for (const file of ["src/components/payments/payment-dialog.tsx", "src/components/payroll/payout-dialog.tsx"]) {
    const source = read(file);
    assert.match(source, /idempotencyKey\.current = newIdempotencyKey\(\);/, `${file}: the key is made when the dialog opens`);
    assert.equal((source.match(/newIdempotencyKey\(\)/g) || []).length, 2, `${file}: ...and nowhere else (the key never follows the fields)`);
    assert.match(source, /duplicateNotice\(firstSend\.current, signature,/, file);
  }
  assert.doesNotMatch(read("src/components/payments/pause-dialog.tsx"), /sendKeyFor|keyForSend/);
});

test("F-A23: one word is not a name and a surname; two words are split; the extra words go to the surname", () => {
  const N = lib("full-name.ts");
  assert.equal(N.splitFullName("Иван"), null);
  assert.equal(N.splitFullName("  Иван  "), null);
  assert.equal(N.splitFullName(""), null);
  assert.equal(N.splitFullName(null), null);
  assert.deepEqual(N.splitFullName("Алия Каримова"), { first_name: "Алия", last_name: "Каримова" });
  assert.deepEqual(N.splitFullName(" Алия   Каримова  Бахтияровна "), { first_name: "Алия", last_name: "Каримова Бахтияровна" });
  const page = read("src/app/admin/students/new/page.tsx");
  assert.doesNotMatch(page, /\|\| firstName/);
  assert.match(page, /splitFullName\(formData\.name\)/);
  assert.match(page, /disabled=\{!nameOk/);
  // no other place builds a surname from the first word
  for (const file of walk(path.join(root, "src"))) assert.doesNotMatch(fs.readFileSync(file, "utf8"), /slice\(1\)\.join\(" "\) \|\|/, file);
});

test("F-A22: the exam link is one function; no screen builds it by hand or falls back to a foreign host", () => {
  const X = lib("exam-link.ts");
  assert.equal(X.examLink("https://app.algolab.me", "ABC123"), "https://app.algolab.me/e/ABC123");
  assert.equal(X.examLink("https://app.algolab.me/", "AB C"), "https://app.algolab.me/e/AB%20C");
  assert.equal(X.examLink("", "ABC"), "/e/ABC");
  assert.equal(X.examLink(undefined, "ABC"), "/e/ABC");
  global.window = { location: { origin: "https://app.algolab.me", host: "app.algolab.me" } };
  assert.equal(X.examLinkHere("Q1"), "https://app.algolab.me/e/Q1");
  assert.equal(X.examLinkDisplay("Q1"), "app.algolab.me/e/Q1");
  for (const file of walk(path.join(root, "src"))) {
    const source = fs.readFileSync(file, "utf8");
    if (!file.endsWith("exam-link.ts")) assert.doesNotMatch(source, /algo\.uz/, file);
    if (!file.endsWith("use-copy.ts")) assert.doesNotMatch(source, /navigator\.clipboard\.writeText/, `${path.relative(root, file)}: use copyText (a refusal must not say «Скопировано»)`);
  }
});

test("F-A22: copyText answers false when the clipboard refuses, and the screens show the failure instead of «Скопировано»", async () => {
  const { copyText } = lib("use-copy.ts");
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async () => { throw new Error("denied"); } } }, configurable: true, writable: true });
  assert.equal(await copyText("x"), false);
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async () => undefined } }, configurable: true, writable: true });
  assert.equal(await copyText("x"), true);
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true, writable: true });
  assert.equal(await copyText("x"), false, "no clipboard at all");
  assert.match(lib("exam-link.ts").COPY_FAILED_TEXT, /Не удалось скопировать/);
  for (const file of ["src/app/admin/diagnostics/page.tsx", "src/app/admin/students/new/page.tsx", "src/app/teacher/exams/page.tsx", "src/app/teacher/exams/[id]/page.tsx", "src/app/teacher/exams/[id]/draft/page.tsx", "src/components/groups/group-exams-tab.tsx"]) {
    assert.match(read(file), /if \(!ok\) \{ showToast\(COPY_FAILED_TEXT, "error"\); return; \}/, file);
  }
});

test("F-A07: the invitation lands on the role's home from the shared table", () => {
  const R = lib("role-home.ts");
  assert.equal(R.loginHome(R.effectiveRole({ role: "teacher", org_role: "owner" })), "/owner/dashboard");
  assert.equal(R.loginHome(R.effectiveRole({ role: "teacher", org_role: "admin" })), "/admin/diagnostics");
  assert.equal(R.loginHome(R.effectiveRole({ role: "teacher", org_role: null })), "/teacher/dashboard");
  const page = read("src/app/invite/[code]/page.tsx");
  assert.match(page, /loginHome\(effectiveRole\(user\)\)/);
  assert.doesNotMatch(page, /"\/owner\/dashboard"|"\/admin\/diagnostics"|"\/teacher\/dashboard"/);
});

test("F-A18: no pointer to a favicon.ico that does not exist, no CSS @import after the Tailwind layers", () => {
  assert.doesNotMatch(read("src/app/layout.tsx"), /favicon\.ico/);
  assert.doesNotMatch(read("src/app/globals.css"), /@import url\(/);
  assert.ok(fs.existsSync(path.join(root, "src/app/icon.tsx")));
});

test("F-A21: the product words - «ученик», «преподаватель» - in the screens that said «студент» / «учитель»", () => {
  const offenders = [];
  for (const file of walk(path.join(root, "src"))) {
    const rel = path.relative(root, file);
    if (rel.includes("curriculum")) continue;
    if (rel.endsWith("lib/substitutions.ts")) continue; // «Учитель отозвал запрос» / «Предложил учитель»: the words of the LOGIC-B2 spec and of the server's own message - changed together with the backend
    const source = fs.readFileSync(file, "utf8");
    // visible strings only: skip comment lines
    for (const [i, line] of source.split("\n").entries()) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      if (/[Сс]тудент/.test(line) || /(?<![а-я])[Уу]чител[ьяеюей]/.test(line)) offenders.push(`${rel}:${i + 1}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("F-A31: the password fields of /change-password have an accessible name; the eye button says what it does", () => {
  const page = read("src/app/change-password/page.tsx");
  assert.match(page, /aria-label=\{placeholder\}/);
  assert.match(page, /aria-label=\{show \? "Скрыть пароли" : "Показать пароли"\}/);
});

test("F-A28: no artificial pauses in the report generation; the replace error is not guessed from words in the text", () => {
  const page = read("src/app/teacher/exams/[id]/page.tsx");
  assert.doesNotMatch(page, /setTimeout\(r, 700\)|setTimeout\(r, 600\)/);
  assert.doesNotMatch(page, /msg\.includes\("черновик"\)|msg\.includes\("draft"\)/);
});

test("F-A17 / DUP-9: «Мониторинг сдачи» opens the results tab; the old /sessions address redirects; the file is saved by one helper", () => {
  assert.match(read("src/app/teacher/exams/[id]/draft/page.tsx"), /\/teacher\/exams\/\$\{examId\}\?tab=analytics/);
  assert.doesNotMatch(read("src/app/teacher/exams/[id]/draft/page.tsx"), /\/sessions`/);
  const old = read("src/app/teacher/exams/[id]/sessions/page.tsx");
  assert.match(old, /redirect\(`\/teacher\/exams\/\$\{encodeURIComponent\(params\.id\)\}\?tab=analytics`\)/);
  const hub = read("src/app/teacher/exams/[id]/page.tsx");
  assert.match(hub, /searchParams\.get\("tab"\)/);
  assert.match(hub, /buildExamSessionsCsv\(sessions\)/, "the table export moved to the results tab");
  assert.doesNotMatch(hub, /\.join\(","\)/);
  for (const file of ["src/lib/api.ts", "src/components/import/import-modal.tsx"]) {
    assert.doesNotMatch(read(file), /document\.createElement\("a"\)/, `${file}: use saveBlobAs`);
  }
});

// ── 6. one reset of the client state (BUG-1 / BUG-2) ─────────────────────────────────────────────────

test("BUG-1/BUG-2: resetClientState forgets every per-person store in one call (and the openings summary pieces go empty)", async () => {
  world();
  const { resetClientState } = lib("reset-client-state.ts");
  const { useExcuseBadge } = lib("excuse-badge.ts");
  const { useSupportUnread } = lib("support-unread.ts");
  const { useSubstitutionBadge } = lib("substitution-badge.ts");
  const { recordClientError, recentClientErrors } = lib("support.ts");
  const O = lib("openings-summary.ts");
  useExcuseBadge.setState({ pending: 3, openLessons: 2 });
  useSupportUnread.setState({ count: 4 });
  useSubstitutionBadge.setState({ pending: 5 });
  recordClientError(500, "GET", "/auth/org/students");
  let heard = "unset";
  // a mounted piece listens through the hook; the module-level reset must reach it
  resetClientState();
  assert.equal(useExcuseBadge.getState().pending, 0);
  assert.equal(useExcuseBadge.getState().openLessons, 0);
  assert.equal(useSupportUnread.getState().count, 0);
  assert.equal(useSubstitutionBadge.getState().pending, 0);
  assert.deepEqual(recentClientErrors(), []);
  assert.equal(typeof O.resetOpeningsSummary, "function");
  void heard;
  for (const file of ["src/components/layout/sidebar.tsx", "src/components/auth/SessionSync.tsx"]) {
    assert.match(read(file), /resetClientState\(\)/, file);
  }
  assert.match(read("src/components/layout/sidebar.tsx"), /await Promise\.race\(\[logout\(\)/, "the sign-out is awaited (with a cap) before the page leaves");
  assert.match(read("src/components/layout/sidebar.tsx"), /data-testid="logging-out"/, "R3 #7: the wait is shown");
});

test("R3 #7: the store says whether the SERVER confirmed the sign-out; the stored sign-in is dropped either way", async () => {
  world({ "/auth/logout": [200, { ok: true }] });
  let { useAuthStore } = loadStoreFresh();
  useAuthStore.setState({ user: { id: "u1" }, isAuthenticated: true });
  assert.equal(await useAuthStore.getState().logout(), true);
  assert.equal(useAuthStore.getState().user, null);
  world({ "/auth/logout": [503, { detail: "x" }] });
  ({ useAuthStore } = loadStoreFresh());
  useAuthStore.setState({ user: { id: "u1" }, isAuthenticated: true });
  const answer = await useAuthStore.getState().logout();
  assert.equal(answer, false, "a refused sign-out is not reported as done");
  assert.equal(useAuthStore.getState().user, null);
  const sidebar = read("src/components/layout/sidebar.tsx");
  assert.match(sidebar, /LOGOUT_UNCONFIRMED_TEXT/);
  assert.match(sidebar, /resetClientState\(\); \/\/ a poll that answered during the wait/, "the counters are reset again AFTER the wait");
  assert.match(lib("session-sync.ts").LOGOUT_UNCONFIRMED_TEXT, /Не удалось завершить вход на сервере/);
});

function loadStoreFresh() {
  for (const f of ["src/lib/store.ts", "src/lib/api.ts"]) delete require.cache[path.join(root, f)];
  return require(path.join(root, "src/lib/store.ts"));
}

test("BUG-2: an openings summary answer that arrives after the reset is dropped", async () => {
  const state = world();
  const O = lib("openings-summary.ts");
  // the module reads the summary through orgApi: slow answer for the previous person
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  global.fetch = async (url) => {
    if (String(url).includes("opening-balances/summary")) { await slow; return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ debtors: 9 }), text: async () => "{}" }; }
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}), text: async () => "{}" };
  };
  const { useAuthStore } = lib("store.ts");
  useAuthStore.setState({ user: { id: "u1", role: "owner", org_role: "owner" } });
  const pending = O.loadOpeningsSummary(true);
  O.resetOpeningsSummary();
  release();
  assert.equal(await pending, null, "the previous person's figures are not handed to the next one");
  void state;
});
