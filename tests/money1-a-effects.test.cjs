// «Деньги-1», пакет А (front), part 1: the shared pieces of the screens - the block `moneyEffects` / `money_effects` of the server, the right to money, the closed month and
// «Переоткрыть месяц», the dry-run asker.  Contract: artifacts/analysis/MONEY1_A_SERVER_REPORT.md (money_effects.py, closed_period.py).
const assert = require("node:assert/strict");
const test = require("node:test");
const env = require("./helpers/money1-env.cjs");
const { lib, plain } = env;
const E = lib("money-effects.ts");
const CP = lib("closed-period.ts");
const MP = lib("money-preview.ts");
const { createRequestSequence } = lib("request-sequence.ts");

// ── the block, as the server sends it ──────────────────────────────────────────────────────────────

const OWNER_DRY = {
  students: [{ studentId: "s1", name: "Иванов Иван", delta: 1 }, { studentId: "s2", name: "Петрова Мария", delta: 1 }],
  payroll: [{ month: "2026-10", state: "open", sheetId: "sh1", teacherId: "t1", teacherName: "Каримова К.", savedTotal: 475000, paid: 475000 }],
  text: "В пакеты учеников вернётся занятие: 2; ведомость Каримова К., октябрь 2026 изменится", dryRun: true,
};
const OWNER_DONE = { ...OWNER_DRY, dryRun: false, payroll: [{ ...OWNER_DRY.payroll[0], freshTotal: 425000, changedBy: -50000 }] };
const ADMIN_DRY = { students: OWNER_DRY.students, payroll: [{ month: "2026-10", state: "open" }], text: "…", dryRun: true };

test("normalize: a missing list is empty, a sum that is not a number is absent, a zero delta is no effect; no block at all is null", () => {
  assert.equal(E.normalizeMoneyEffects(null), null);
  assert.equal(E.normalizeMoneyEffects("x"), null);
  assert.equal(E.normalizeMoneyEffects([]), null);
  const empty = E.normalizeMoneyEffects({});
  assert.deepEqual([empty.students, empty.payroll, empty.text, empty.dryRun], [[], [], "", false]);
  const block = E.normalizeMoneyEffects({ students: [{ studentId: "a", name: " ", delta: 0 }, { studentId: "b", name: "Б", delta: -1 }], payroll: [{ month: "2026-10", state: "weird", savedTotal: "x" }, { state: "open" }], dryRun: true });
  assert.equal(block.students.length, 1);
  assert.deepEqual(block.students[0], { studentId: "b", name: "Б", delta: -1 });
  assert.equal(block.payroll.length, 1);                      // a line without a month is dropped
  assert.equal(block.payroll[0].state, "none");               // an unknown state is no state
  assert.equal(block.payroll[0].savedTotal, null);
  assert.equal(block.dryRun, true);
});

test("one reader for both spellings: `moneyEffects` (lessons) and `money_effects` (payments, rates, excuses)", () => {
  assert.equal(E.moneyEffectsOf({ moneyEffects: OWNER_DRY }).students.length, 2);
  assert.equal(E.moneyEffectsOf({ money_effects: OWNER_DRY }).students.length, 2);
  assert.equal(E.moneyEffectsOf({ ok: true }), null);
  assert.equal(E.moneyEffectsOf(null), null);
  assert.equal(E.effectsEmpty(E.normalizeMoneyEffects({})), true);
  assert.equal(E.effectsEmpty(E.normalizeMoneyEffects(ADMIN_DRY)), false);
  assert.equal(E.effectsEmpty(null), true);
});

test("the lines BEFORE the action: the packs by name, the sheets as one sentence; the owner names the teacher, the others the month only", () => {
  const owner = E.effectLines(E.normalizeMoneyEffects(OWNER_DRY)).map((line) => plain(line.text));
  assert.deepEqual(owner, ["Иванов Иван: занятие вернётся в пакет", "Петрова Мария: занятие вернётся в пакет", "Изменится ведомость: Каримова К., октябрь 2026"]);
  const admin = E.effectLines(E.normalizeMoneyEffects(ADMIN_DRY)).map((line) => plain(line.text));
  assert.equal(admin[2], "Изменится ведомость: октябрь 2026");          // LESSONS 45: the teacher of a sheet is the owner's
  assert.ok(!admin.join(" ").includes("Каримова"));
  const spent = E.effectLines(E.normalizeMoneyEffects({ students: [{ studentId: "s", name: "Сидоров", delta: -1 }], payroll: [] }));
  assert.equal(spent[0].text, "Сидоров: занятие спишется из пакета");
});

test("the lines AFTER the action: the owner gets the sum («−50 000 к сохранённой — пересохраните»), the others «изменилась»", () => {
  const owner = E.effectLines(E.normalizeMoneyEffects(OWNER_DONE), { done: true }).map((line) => plain(line.text));
  assert.equal(owner[0], "Иванов Иван: занятие вернули в пакет");
  assert.equal(owner[2], "Ведомость Каримова К., октябрь 2026: −50 000 сум к сохранённой — пересохраните её");
  const plus = E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: [{ ...OWNER_DONE.payroll[0], changedBy: 125000 }] }), { done: true });
  assert.equal(plain(plus[0].text), "Ведомость Каримова К., октябрь 2026: +125 000 сум к сохранённой — пересохраните её");
  const admin = E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: [{ month: "2026-10", state: "closed" }, { month: "2026-09", state: "open" }] }), { done: true });
  assert.deepEqual(admin.map((line) => plain(line.text)), ["Изменились ведомости: октябрь 2026; сентябрь 2026"]);
  assert.equal(E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: [] }), { done: true }).length, 0);
});

test("a closed month BEFORE the action is a warning with the way out; after it - not (a payment is allowed in a closed month, the sheet is re-saved)", () => {
  const closed = E.normalizeMoneyEffects({ students: [], payroll: [{ month: "2026-10", state: "closed", teacherName: "Каримова К.", sheetId: "s", teacherId: "t" }], dryRun: true });
  const lines = E.effectLines(closed);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].tone, "warn");
  assert.equal(plain(lines[0].text), "Месяц закрыт: Каримова К., октябрь 2026. Сначала переоткройте его");
  assert.equal(E.effectLines(closed, { done: true })[0].tone, "plain");
});

test("toast: amber with the lines when a pack or a sheet was touched, plain success otherwise; the lines that were there stay first", () => {
  const touched = E.toastWithEffects({ money_effects: OWNER_DONE }, ["Долг был 100, стал 0"]);
  assert.equal(touched.tone, "warning");
  assert.equal(touched.details[0], "Долг был 100, стал 0");
  assert.equal(touched.details.length, 4);
  const quiet = E.toastWithEffects({ money_effects: { students: [], payroll: [], text: "", dryRun: false } }, ["x"]);
  assert.deepEqual(quiet, { tone: "success", details: ["x"] });
  assert.deepEqual(E.toastWithEffects({ payment: {} }), { tone: "success", details: [] });          // an older server: nothing is claimed
});

// ── the right to money (I-6) ─────────────────────────────────────────────────────────────────────

test("the money right: the owner; an administrator ONLY when the profile says so; a teacher and an absent flag never (LESSONS 17)", () => {
  assert.equal(E.canManageMoney({ org_role: "owner" }), true);
  assert.equal(E.canManageMoney({ org_role: "admin", payments_access: true }), true);
  assert.equal(E.canManageMoney({ org_role: "admin", payments_access: false }), false);
  assert.equal(E.canManageMoney({ org_role: "admin" }), false);
  assert.equal(E.canManageMoney({ org_role: "teacher", payments_access: true }), false);
  assert.equal(E.canManageMoney(null), false);
  assert.equal(E.canManageMoney(undefined), false);
});

// ── why the dry run failed ────────────────────────────────────────────────────────────────────────────

test("a failed dry run: the server's sentence for a refusal it explains, one general sentence for a dead network / a timeout / a server error", () => {
  assert.equal(E.effectsFailureText({ status: 404, message: "Проведённого урока нет", code: "LESSON_NOT_HELD" }), "Проведённого урока нет");
  assert.equal(E.effectsFailureText({ status: 409, message: "Отметки урока уже изменили. Обновите страницу" }), "Отметки урока уже изменили. Обновите страницу");
  assert.equal(E.effectsFailureText({ status: 500, message: "Internal Server Error" }), E.EFFECTS_FAILED_TEXT);
  assert.equal(E.effectsFailureText(new Error("Failed to fetch")), E.EFFECTS_FAILED_TEXT);
  assert.equal(E.effectsFailureText({ status: 409, message: "x", code: "EFFECTS_TIMEOUT" }), E.EFFECTS_FAILED_TEXT);
  assert.equal(E.effectsFailureText(null), E.EFFECTS_FAILED_TEXT);
});

// ── the closed month ──────────────────────────────────────────────────────────────────────────────

const PERIOD_ERROR = { status: 409, code: "PERIOD_CLOSED", message: "Месяц октябрь 2026 у преподавателя Каримова К. закрыт: ведомость сохранена 03.11.2026. Чтобы исправить урок, владелец или администратор с правом оплат сначала переоткрывает месяц",
  detail: { code: "PERIOD_CLOSED", month: "2026-10", teacherId: "t1", teacherName: "Каримова К.", closedOn: "2026-11-03" } };

test("PERIOD_CLOSED (and the pause's PAUSE_LOCKED) carry the month and the teacher; any other failure is not one", () => {
  const info = CP.periodClosedOf(PERIOD_ERROR);
  assert.deepEqual([info.month, info.teacherId, info.teacherName, info.closedOn], ["2026-10", "t1", "Каримова К.", "2026-11-03"]);
  assert.match(info.message, /сначала переоткрывает месяц/);
  assert.equal(CP.periodClosedOf({ ...PERIOD_ERROR, code: "PAUSE_LOCKED" }).month, "2026-10");
  assert.equal(CP.periodClosedOf({ status: 409, code: "ATTENDANCE_CONFLICT" }), null);
  assert.equal(CP.periodClosedOf(null), null);
  assert.equal(CP.periodClosedOf(new Error("x")), null);
  const bare = CP.periodClosedOf({ code: "PERIOD_CLOSED", message: "закрыт", detail: { month: "bad" } });
  assert.equal(bare.month, "");
  assert.equal(bare.teacherId, null);
});

test("«Переоткрыть месяц» is offered only to a person with the money right AND only when the refusal named the teacher and the month", () => {
  const info = CP.periodClosedOf(PERIOD_ERROR);
  assert.equal(CP.canReopenFrom(info, true), true);
  assert.equal(CP.canReopenFrom(info, false), false);
  assert.equal(CP.canReopenFrom(null, true), false);
  assert.equal(CP.canReopenFrom(CP.periodClosedOf({ code: "PERIOD_CLOSED", message: "m", detail: {} }), true), false);
});

test("the state of the month: closed has the way out, reopened says what to do next, open says it is open; no sheet = nothing", () => {
  const closed = CP.periodView({ state: "closed", closedOn: "2026-11-03", reopened: null });
  assert.deepEqual([closed.tone, closed.label, closed.canReopen], ["closed", "Месяц закрыт", true]);
  assert.match(closed.hint, /03\.11\.2026/);
  const reopened = CP.periodView({ state: "reopened", closedOn: "2026-11-03", reopened: { at: "2026-11-05T09:00:00", by: "Арслан", reason: "ошибка" } });
  assert.deepEqual([reopened.tone, reopened.label, reopened.canReopen], ["reopened", "Месяц переоткрыт", false]);
  assert.match(reopened.hint, /пересохраните ведомость — месяц закроется снова/);
  assert.match(reopened.hint, /Арслан/);
  const open = CP.periodView({ state: "open", closedOn: null, reopened: null });
  assert.deepEqual([open.tone, open.label, open.canReopen], ["open", "Месяц открыт", false]);
  assert.equal(CP.periodView({ state: "none", closedOn: null, reopened: null }), null);
  assert.equal(CP.periodView(null), null);
});

test("the list of months: by teacher; a teacher with no sheet has no state", () => {
  const periods = CP.normalizePeriods({ month: "2026-10", items: [
    { teacherId: "t1", teacherName: "Каримова К.", month: "2026-10", state: "closed", closedOn: "2026-11-03", sheetId: "s1", reopened: null },
    { teacherId: "t2", teacherName: "Рахимов Т.", month: "2026-10", state: "garbage", closedOn: null, sheetId: "s2", reopened: null },
    { teacherName: "без id" },
  ] });
  assert.equal(periods.items.length, 2);
  assert.equal(CP.periodOf(periods, "t1").state, "closed");
  assert.equal(CP.periodOf(periods, "t2"), null);          // «none»
  assert.equal(CP.periodOf(periods, "t9"), null);
  assert.equal(CP.periodOf(null, "t1"), null);
  assert.deepEqual(CP.normalizePeriods(null), { month: "", items: [] });
});

test("the reopening: a reason of 3..500, the body, the toast of a repeat, the words of the refusals", () => {
  assert.match(CP.validateReopenReason(""), /Укажите причину/);
  assert.match(CP.validateReopenReason("  ab "), /не короче 3/);
  assert.equal(CP.validateReopenReason("abc"), null);
  assert.equal(CP.validateReopenReason("x".repeat(500)), null);
  assert.match(CP.validateReopenReason("x".repeat(501)), /не длиннее 500/);
  assert.deepEqual(CP.buildReopenBody("t1", "  ошибочно отметили  "), { teacher_id: "t1", reason: "ошибочно отметили" });
  assert.equal(CP.reopenToast({ changed: true }), "Месяц переоткрыт");
  assert.equal(CP.reopenToast({ changed: false }), "Месяц уже открыт");          // a double click: nothing is written twice (I-7)
  assert.equal(CP.reopenErrorText({ code: "SHEET_NOT_FOUND", message: "x" }), "Ведомости за этот месяц нет: переоткрывать нечего");
  assert.equal(CP.reopenErrorText({ code: "REASON_REQUIRED", message: "x" }), "Укажите причину (от 3 до 500 символов)");
  assert.match(CP.reopenErrorText({ code: "MONEY_RIGHT_REQUIRED" }), /Переоткрыть месяц может владелец/);
  assert.equal(CP.reopenErrorText(new Error("Сервер недоступен")), "Сервер недоступен");
  assert.equal(CP.reopenErrorText(null), "Не удалось переоткрыть месяц. Данные не изменены.");
  assert.equal(plain(CP.reopenDescription("Каримова К.", "2026-10")), "Каримова К. · октябрь 2026");
});

// ── the dry-run asker (LESSONS 89) ─────────────────────────────────────────────────────────────────

function fakeTimers() {
  const original = { setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
  const timers = new Map();
  let nextId = 1;
  global.setTimeout = (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; };
  global.clearTimeout = (id) => { timers.delete(id); };
  return { fire: (id) => { const t = timers.get(id); timers.delete(id); t?.fn(); }, ids: () => [...timers.keys()], restore: () => Object.assign(global, original) };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("the asker: the answer is applied once, as the block of the answer; the one of an older ask is dropped; cancelling aborts the request", async () => {
  const timers = fakeTimers();
  try {
    const sequence = createRequestSequence();
    const seen = [];
    const signals = [];
    const resolvers = [];
    const ask = () => MP.startEffectsRun({
      load: (signal) => new Promise((resolve) => { signals.push(signal); resolvers.push(resolve); }),
      sequence, onReady: (effects) => seen.push(["ready", effects?.students.length ?? null]), onFailed: (error) => seen.push(["failed", error.message]),
    });
    const cancelFirst = ask();
    const cancelSecond = ask();           // a newer ask: the first answer is stale
    resolvers[0]({ moneyEffects: OWNER_DRY });
    resolvers[1]({ moneyEffects: ADMIN_DRY });
    await tick();
    assert.deepEqual(seen, [["ready", 2]]);          // only the second answer, once
    cancelFirst();
    cancelSecond();
    assert.equal(signals.every((signal) => signal.aborted), true);
  } finally {
    timers.restore();
  }
});

test("the asker: a request that does not answer in time FAILS (the window never waits for ever); a failure and a late answer after it are one failure", async () => {
  const timers = fakeTimers();
  try {
    const sequence = createRequestSequence();
    const seen = [];
    let resolve;
    let signal;
    MP.startEffectsRun({
      load: (s) => new Promise((r) => { signal = s; resolve = r; }),
      sequence, onReady: () => seen.push("ready"), onFailed: (error) => seen.push(error.code),
    }, 5000);
    assert.equal(timers.ids().length, 1);
    timers.fire(timers.ids()[0]);
    assert.deepEqual(seen, ["EFFECTS_TIMEOUT"]);
    assert.equal(signal.aborted, true);
    resolve({ moneyEffects: OWNER_DRY });          // the late answer
    await tick();
    assert.deepEqual(seen, ["EFFECTS_TIMEOUT"]);
    // a rejected request
    MP.startEffectsRun({ load: () => Promise.reject(Object.assign(new Error("boom"), { status: 500 })), sequence, onReady: () => seen.push("ready"), onFailed: (error) => seen.push(error.message) });
    await tick();
    assert.deepEqual(seen, ["EFFECTS_TIMEOUT", "boom"]);
  } finally {
    timers.restore();
  }
});

test("the button of a confirmation waits for the answer about money; the reason it waits is always said (LESSONS 8)", () => {
  assert.equal(MP.effectsAllowConfirm({ status: "idle" }), false);
  assert.equal(MP.effectsAllowConfirm({ status: "loading" }), false);
  assert.equal(MP.effectsAllowConfirm({ status: "failed", error: new Error("x") }), false);
  assert.equal(MP.effectsAllowConfirm({ status: "ready", effects: null }), true);          // an older server: no block, nothing to wait for
  assert.equal(MP.effectsAllowConfirm({ status: "ready", effects: E.normalizeMoneyEffects(OWNER_DRY) }), true);
  assert.equal(MP.effectsWaitReason({ status: "loading" }), "Считаем, что изменится с деньгами…");
  assert.equal(MP.effectsWaitReason({ status: "failed", error: null }), "Сначала нужно увидеть, что изменится с деньгами");
  assert.equal(MP.effectsWaitReason({ status: "ready", effects: null }), null);
});
