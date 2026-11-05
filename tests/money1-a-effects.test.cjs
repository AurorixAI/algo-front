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
// R3 #22: the sum of the sheet is there BEFORE the action too (`freshBefore -> freshAfter`, `changedBy` signed - the effect of THIS action; `driftAfter` - fresh minus saved)
const OWNER_DRY_SUMS = { ...OWNER_DRY, payroll: [{ ...OWNER_DRY.payroll[0], freshBefore: 475000, freshAfter: 425000, freshTotal: 425000, changedBy: -50000, driftAfter: -50000 }] };
const OWNER_DONE = { ...OWNER_DRY_SUMS, dryRun: false };
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
  assert.equal(owner[2], "Ведомость Каримова К., октябрь 2026: изменилась на −50 000 сум — пересохраните её");
  const plus = E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: [{ ...OWNER_DONE.payroll[0], changedBy: 125000, driftAfter: 125000 }] }), { done: true });
  assert.equal(plain(plus[0].text), "Ведомость Каримова К., октябрь 2026: изменилась на +125 000 сум — пересохраните её");
  // the sheet had drifted before: «всего к сохранённой» says how far it is from the saved one now (the effect of this action alone is the first number)
  const drifted = E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: [{ ...OWNER_DONE.payroll[0], changedBy: -50000, driftAfter: 25000 }] }), { done: true });
  assert.equal(plain(drifted[0].text), "Ведомость Каримова К., октябрь 2026: изменилась на −50 000 сум (всего к сохранённой +25 000 сум) — пересохраните её");
  // N-4 (walk of 05.11): a cancelled payment took back what had moved the sheet - it is as saved again, so no «пересохраните»; a change that is not zero from the saved asks as before
  const back = E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: [{ ...OWNER_DONE.payroll[0], changedBy: -133333, driftAfter: 0 }] }), { done: true });
  assert.equal(plain(back[0].text), "Ведомость Каримова К., октябрь 2026: изменилась на −133 333 сум — снова как сохранённая, пересохранять не нужно");
  assert.ok(!/пересохраните/.test(back[0].text) && !/\+0/.test(back[0].text), "no «+0 сум» and no request to re-save");
  assert.ok(/пересохраните её/.test(drifted[0].text) && /пересохраните её/.test(plus[0].text), "a sheet that differs from the saved one still asks");
  // an action that did not move the sheet at all has no line about it
  assert.equal(E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: [{ ...OWNER_DONE.payroll[0], changedBy: 0, driftAfter: 0 }] }), { done: true }).length, 0);
  assert.equal(E.toastWithEffects({ moneyEffects: { students: [], payroll: [{ ...OWNER_DONE.payroll[0], changedBy: -133333, driftAfter: 0 }], dryRun: false } }).tone, "warning");
  const admin = E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: [{ month: "2026-10", state: "closed" }, { month: "2026-09", state: "open" }] }), { done: true });
  assert.deepEqual(admin.map((line) => plain(line.text)), ["Изменились ведомости: октябрь 2026 · месяц закрыт ведомостью; сентябрь 2026"]);
  assert.equal(E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: [] }), { done: true }).length, 0);
  // N-5 (walk of 05.11): two sheets of two teachers named by the month only are the same words twice - one line with the count
  const twin = [{ month: "2026-09", state: "closed" }, { month: "2026-09", state: "closed" }];
  assert.deepEqual(E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: twin })).map((line) => plain(line.text)), ["Изменятся 2 ведомости · сентябрь 2026 · месяц закрыт ведомостью"]);
  assert.deepEqual(E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: twin }), { done: true }).map((line) => plain(line.text)), ["Изменились 2 ведомости · сентябрь 2026 · месяц закрыт ведомостью"]);
  assert.equal(E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: twin }))[0].tone, "warn");
  const five = Array.from({ length: 5 }, () => ({ month: "2026-09", state: "open" }));
  assert.equal(plain(E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: five }))[0].text), "Изменятся 5 ведомостей · сентябрь 2026");
  // different words stay apart (and a repeated one inside them is counted); one sheet is as before
  const mixed = E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: [...twin, { month: "2026-10", state: "open" }] }));
  assert.equal(plain(mixed[0].text), "Изменятся ведомости: 2 ведомости · сентябрь 2026 · месяц закрыт ведомостью; октябрь 2026");
  assert.equal(plain(E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: [twin[0]] }))[0].text), "Изменится ведомость: сентябрь 2026 · месяц закрыт ведомостью");
  // the owner's lines name the teachers - they are different, nothing is merged
  const named = (name) => ({ month: "2026-09", state: "closed", teacherName: name, sheetId: `s-${name}`, teacherId: `t-${name}` });
  assert.match(plain(E.effectLines(E.normalizeMoneyEffects({ students: [], payroll: [named("Каримова К."), named("Рахимов Т.")] }))[0].text), /^Изменятся ведомости: Каримова К., сентябрь 2026 · месяц закрыт ведомостью; Рахимов Т., сентябрь 2026/);
});

test("R3 #22: BEFORE the action the owner sees the sum of the sheet «было → станет» with the signed change; an administrator with the right sees the month only, no sums", () => {
  const owner = E.effectLines(E.normalizeMoneyEffects(OWNER_DRY_SUMS)).map((line) => plain(line.text));
  assert.equal(owner[2], "Ведомость Каримова К., октябрь 2026: 475 000 сум → 425 000 сум (−50 000 сум)");
  const admin = E.effectLines(E.normalizeMoneyEffects({ ...ADMIN_DRY, payroll: [{ month: "2026-10", state: "open" }] })).map((line) => plain(line.text));
  assert.equal(admin[2], "Изменится ведомость: октябрь 2026");
  assert.ok(!/сум/.test(admin[2]));                                  // not one sum for the others (LESSONS 45)
  // the fields are read as the server sends them
  const line = E.normalizeMoneyEffects(OWNER_DRY_SUMS).payroll[0];
  assert.deepEqual([line.freshBefore, line.freshAfter, line.changedBy, line.driftAfter], [475000, 425000, -50000, -50000]);
});

test("a closed month in a dry run of a payment: said as it is («месяц закрыт ведомостью»), a warning; the lesson flows refuse it with PERIOD_CLOSED instead (no «сначала переоткройте» in the lines)", () => {
  const closed = E.normalizeMoneyEffects({ students: [], payroll: [{ month: "2026-10", state: "closed", teacherName: "Каримова К.", sheetId: "s", teacherId: "t" }], dryRun: true });
  const lines = E.effectLines(closed);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].tone, "warn");
  assert.equal(plain(lines[0].text), "Изменится ведомость: Каримова К., октябрь 2026 · месяц закрыт ведомостью");
  assert.equal(E.effectLines(closed, { done: true })[0].tone, "warn");
  const sums = E.normalizeMoneyEffects({ students: [], payroll: [{ month: "2026-10", state: "closed", teacherName: "Каримова К.", sheetId: "s", teacherId: "t", freshBefore: 100000, freshAfter: 90000, changedBy: -10000 }], dryRun: true });
  assert.equal(plain(E.effectLines(sums)[0].text), "Ведомость Каримова К., октябрь 2026: 100 000 сум → 90 000 сум (−10 000 сум) · месяц закрыт ведомостью");
});

test("R3 #15/#27: the numbers could not be counted (`unavailable: true`) is one warning line, not an error, and the block is not «деньги не изменятся»", () => {
  const block = E.normalizeMoneyEffects({ students: [], payroll: [], unavailable: true, text: "", dryRun: true });
  assert.equal(block.unavailable, true);
  assert.equal(E.effectsEmpty(block), false);
  const lines = E.effectLines(block);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].tone, "warn");
  assert.match(plain(lines[0].text), /^Последствия для денег не удалось посчитать\. Действие можно выполнить/);
  assert.match(plain(E.effectLines(block, { done: true })[0].text), /Действие выполнено; проверьте ведомости/);
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
  // R3 #11: the reopening carries the revision of the sheet the screen saw (`sheet_revision`); 409 SHEET_CHANGED is its own kind of refusal
  assert.deepEqual(CP.buildReopenBody("t1", "  ошибочно отметили  ", 3), { teacher_id: "t1", reason: "ошибочно отметили", sheet_revision: 3 });
  assert.equal(CP.isSheetChanged({ status: 409, code: "SHEET_CHANGED" }), true);
  assert.equal(CP.isSheetChanged({ status: 409, code: "PERIOD_CLOSED" }), false);
  assert.equal(CP.reopenToast({ changed: true }), "Месяц переоткрыт");
  assert.equal(CP.reopenToast({ changed: false }), "Месяц уже открыт");          // a double click: nothing is written twice (I-7)
  // R3 #16: the sentence of the SERVER for every coded refusal (its catalogue is the one source); ours only where there is no text at all
  for (const code of ["SHEET_NOT_FOUND", "REASON_REQUIRED", "REVISION_REQUIRED", "SHEET_CHANGED", "MONTH_INVALID", "MONEY_RIGHT_REQUIRED"]) {
    const sentence = Object.assign(new Error(`Слова сервера: ${code}`), { code });
    assert.equal(CP.reopenErrorText(sentence), `Слова сервера: ${code}`);
  }
  assert.equal(CP.reopenErrorText({ code: "SHEET_NOT_FOUND" }), "Ведомости за этот месяц нет: переоткрывать нечего");
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
    assert.equal(signals.length, 2, "both asks were made");
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

test("the button of a confirmation waits for the answer about money (the block of the effects says why - «Считаем…» or the failure with «Повторить» - tested in tests/dom-windows.test.cjs)", () => {
  assert.equal(MP.effectsAllowConfirm({ status: "idle" }), false);
  assert.equal(MP.effectsAllowConfirm({ status: "loading" }), false);
  assert.equal(MP.effectsAllowConfirm({ status: "failed", error: new Error("x") }), false);
  assert.equal(MP.effectsAllowConfirm({ status: "ready", effects: null }), true);          // an older server: no block, nothing to wait for
  assert.equal(MP.effectsAllowConfirm({ status: "ready", effects: E.normalizeMoneyEffects(OWNER_DRY) }), true);
});
