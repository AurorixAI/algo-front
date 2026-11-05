// «Деньги-1», пакет А (front), the round of the contract after the server's R3 - the PURE parts: the calls of the dry runs (`?dry_run=true`, no key, the same body), the draft of a payment,
// the states of a confirmation, the words of the deductions, «Требует разбора» by month, the decided additional lessons.  The WINDOWS themselves (the real hooks, the real components,
// the server answered by the test) are read in a real DOM: tests/dom-till.test.cjs, tests/dom-windows.test.cjs, tests/dom-enrol.test.cjs, tests/dom-hooks.test.cjs.
const assert = require("node:assert/strict");
const test = require("node:test");
const env = require("./helpers/money1-env.cjs");
const { React, html, textOf, lib, component, read, signIn, plain } = env;

const E = lib("money-effects.ts");
const MP = lib("money-preview.ts");
const PD = lib("dry-run.ts");
const OPEN = lib("open-lessons.ts");
const OO = lib("one-off.ts");
const RET = lib("lesson-return.ts");

const OWNER_DRY = {
  students: [{ studentId: "s1", name: "Иванов Иван", delta: -1 }],
  payroll: [{ month: "2026-10", state: "open", sheetId: "sh1", teacherId: "t1", teacherName: "Каримова К.", savedTotal: 475000, paid: 475000, freshBefore: 475000, freshAfter: 425000, freshTotal: 425000, changedBy: -50000, driftAfter: -50000 }],
  text: "…", dryRun: true,
};
const ready = (block, answer) => ({ status: "ready", effects: E.normalizeMoneyEffects(block), answer });
const DEDUCTIONS = [{ studentId: "s1", name: "Иванов Иван", amount: 46000 }, { studentId: "s2", name: "Петрова Мария", amount: 46000 }];
const failed = (status = 500) => ({ status: "failed", error: Object.assign(new Error("x"), { status }) });

// ── the calls: the dry run is the same request with `?dry_run=true`, NO Idempotency-Key, the same body ─────────────────────

async function recorded(run) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url).replace(/^.*\/api\/v1/, ""), method: init.method || "GET", headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : undefined });
    return { ok: true, status: 200, headers: new Map([["content-type", "application/json"]]), json: async () => ({ money_effects: {} }), text: async () => "{}" };
  };
  try { await run(lib("api.ts").orgApi); } finally { global.fetch = original; }
  return calls;
}

test("R3 item 6: every dry run is the request of the action with `?dry_run=true` and the same body - and has no Idempotency-Key", async () => {
  // UX pack §5.1-тер: the windows of a payment / write-off / refund (and their cancels) do not ask the dry run any more - only the transfers of a student do
  const calls = await recorded(async (api) => {
    for (const name of ["dryRunCreatePayment", "dryRunReplacePayment", "dryRunVoidPayment", "dryRunCreateWriteoff", "dryRunVoidWriteoff", "dryRunCreateRefund", "dryRunVoidRefund"]) assert.equal(typeof api[name], "undefined", name);
    await api.dryRunTransferStudent("g2", "st1", { price_override: null });
    await api.dryRunBulkTransfer("g2", ["st1", "st2"], { price_override: null });
  });
  assert.deepEqual(calls.map((call) => `${call.method} ${call.url}`), [
    "POST /auth/org/groups/g2/students/st1?mode=transfer&dry_run=true",
    "POST /auth/org/groups/g2/students/bulk?mode=transfer&dry_run=true",
  ]);
  for (const call of calls) assert.ok(!Object.keys(call.headers).some((name) => name.toLowerCase() === "idempotency-key"), `${call.url}: a dry run has no key`);
  assert.deepEqual(calls[1].body, { student_ids: ["st1", "st2"] });
});

test("R3 item 7: the deductions of the answer are read without surprises", () => {
  assert.deepEqual(RET.deductionsOf({ deductions: DEDUCTIONS }).map((line) => line.name), ["Иванов Иван", "Петрова Мария"]);
  assert.deepEqual(RET.deductionsOf({ deductions: [{ studentId: "x", name: "", amount: 5 }, { studentId: "y", name: "Без суммы", amount: 0 }, { studentId: "z", name: "Нечисло", amount: "много" }] }), []);
  assert.deepEqual(RET.deductionsOf(null), []);
  assert.deepEqual(RET.deductionsOf({}), []);
  assert.equal(plain(RET.deductionText({ studentId: "s", name: "Иванов Иван", amount: 46000 })), "Иванов Иван: 46 000 сум");
});

// ── item 8: «Требует разбора» by month ────────────────────────────────────────────────────────────

const lesson = (over) => ({ actionType: "missed", groupId: "g1", groupName: "7-А", classLevel: 7, lessonId: "l1", lessonDate: "2026-09-14", subject: "Алгебра", startTime: "10:00", endTime: "11:00", markedCount: 0, rosterCount: 8, remainingCount: 8, teacherId: "t1", teacherName: "Каримова К.", ...over });
const BY_MONTH = { total: 3, since: "2026-09-01", months: [
  { month: "2026-09", title: "Сентябрь 2026", count: 2, missed: 1, inProgress: 1, items: [lesson({}), lesson({ lessonId: "l2", actionType: "in_progress", lessonDate: "2026-09-20", markedCount: 3, remainingCount: 5 })] },
  { month: "2026-10", title: "Октябрь 2026", count: 1, missed: 1, inProgress: 0, items: [lesson({ lessonId: "l3", lessonDate: "2026-10-05" })] },
] };

test("R3 item 8: the heads of the months, the counters and the day the list starts from", () => {
  assert.equal(OPEN.monthHeading(BY_MONTH.months[0]), "Сентябрь 2026 · 2 урока");
  assert.equal(OPEN.monthHeading(BY_MONTH.months[1]), "Октябрь 2026 · 1 урок");
  assert.equal(OPEN.monthCountsText(BY_MONTH.months[0]), "не отмечено 1 · не завершено 1");
  assert.equal(OPEN.monthCountsText(BY_MONTH.months[1]), "не отмечено 1");
  assert.equal(OPEN.sinceLine("2026-09-01"), "Показаны неразобранные уроки с 01.09.2026");
  assert.equal(OPEN.sinceLine(""), null);
  assert.equal(OPEN.sinceLine(null), null);
  assert.deepEqual(OPEN.openLessonsOf(BY_MONTH).map((item) => item.lessonId), ["l1", "l2", "l3"], "the oldest month first, as the server sent it");
  const after = OPEN.withoutOpenLessons(BY_MONTH, (item) => item.lessonId === "l3");
  assert.deepEqual([after.total, after.months.length], [2, 1], "a month without lessons goes");
  const less = OPEN.withoutOpenLessons(BY_MONTH, (item) => item.lessonId === "l1");
  assert.deepEqual([less.months[0].count, less.months[0].missed, less.months[0].inProgress], [1, 0, 1]);
});

test("R3 item 8: the list is read from `attendance/open-actions/by-month`; the view shows the months and the day the list starts from", async () => {
  const calls = await recorded(async (api) => { await api.getOpenAttendanceActionsByMonth(); });
  assert.equal(calls[0].url, "/auth/org/attendance/open-actions/by-month");
  const view = read("src/components/attendance/open-lessons-view.tsx");
  assert.match(view, /orgApi\.getOpenAttendanceActionsByMonth\(\)/);
  assert.match(view, /data-testid="open-month"/);
  assert.match(view, /data-testid="open-since"/);
  assert.match(view, /monthHeading\(month\)/);
  assert.match(view, /monthCountsText\(month\)/);
});

test("R3 item 8 / 17: «Отметить» a lesson nobody started is for the money right only; the link carries the teacher of the row", () => {
  const view = read("src/components/attendance/open-lessons-view.tsx");
  assert.match(view, /const moneyRight = canManageMoney\(useAuthStore\(\(state\) => state\.user\)\);/);
  assert.match(view, /href=\{journalHref\(groupsBasePath, item\)\}/, "the whole row (with its teacherId) goes to the journal link");
  assert.match(OPEN.journalHref("/owner/groups", lesson({})), /&lesson=l1&date=2026-09-14&teacher=t1$/);
});

// ── item 14: decided additional lessons ───────────────────────────────────────────────────────────

const DECIDED = { lessonId: "l9", groupId: "g1", groupName: "7-А", lessonDate: "2026-10-27", startTime: "16:00", endTime: "17:00", purpose: "extra", title: "…", teacher: { id: "t1", name: "Каримова К." }, createdBy: null,
  studentsPresent: 2, studentsTotal: 3, payrollSheet: null, money: "paid", decidedAt: "2026-10-28T09:30:00", decidedBy: { id: "o1", name: "Арслан", role: "owner" }, canUndo: true, periodClosed: false };

test("R3 item 14: a decided lesson says what was decided, by whom and when; «Отменить решение» while the month is open", () => {
  signIn({ org_role: "owner" });
  const { DecidedRow } = component("substitutions/decided-one-offs.tsx");
  const open = html(React.createElement("ul", null, React.createElement(DecidedRow, { item: DECIDED, onUndo() {}, onReopened() {} })));
  const text = plain(textOf(open));
  assert.ok(text.includes("Включён в зарплату"));
  assert.ok(text.includes("решил Арслан") && text.includes("28.10.2026 09:30"));
  assert.ok(text.includes("провёл Каримова К."));
  assert.match(open, /data-testid="decided-undo"/);
  assert.doesNotMatch(open, /period-closed/);
  const none = plain(textOf(html(React.createElement("ul", null, React.createElement(DecidedRow, { item: { ...DECIDED, money: "none" }, onUndo() {}, onReopened() {} })))));
  assert.ok(none.includes("Не включён в зарплату"));
});

test("R3 item 14: a closed month - no «Отменить решение», the sentence «месяц закрыт — сначала переоткройте» and «Переоткрыть месяц» for the money right only", () => {
  const { DecidedRow } = component("substitutions/decided-one-offs.tsx");
  const draw = (user) => { signIn(user); return html(React.createElement("ul", null, React.createElement(DecidedRow, { item: { ...DECIDED, canUndo: false, periodClosed: true }, onUndo() {}, onReopened() {} }))); };
  const owner = draw({ org_role: "owner" });
  assert.doesNotMatch(owner, /data-testid="decided-undo"/);
  assert.match(plain(textOf(owner)), /У Каримовой К\.|Каримовой К\. закрыт/, "the block of the closed month names the teacher");
  assert.ok(plain(textOf(owner)).includes("Чтобы изменить решение, переоткройте месяц."));
  assert.match(owner, /data-testid="period-closed-reopen"/);
  assert.doesNotMatch(draw({ org_role: "admin", payments_access: false }), /period-closed-reopen/);
});

test("R3 item 14: the list is read from `one-off-decisions/decided?month=` and read without surprises (`canUndo` is false unless the server said true)", async () => {
  const calls = await recorded(async (api) => { await api.getDecidedOneOffs("2026-10"); });
  assert.equal(calls[0].url, "/auth/org/one-off-decisions/decided?month=2026-10&limit=200");
  const out = OO.normalizeDecided({ total: 2, items: [DECIDED, { ...DECIDED, lessonId: "l10", canUndo: undefined, money: "weird" }, { groupName: "нет урока" }, null] });
  assert.equal(out.total, 2);
  assert.equal(out.items.length, 2);
  assert.equal(out.items[1].canUndo, false);
  assert.equal(out.items[1].money, "none");
  assert.deepEqual(OO.normalizeDecided(null), { total: 0, items: [] });
  assert.equal(OO.decidedMoneyText("paid"), "Включён в зарплату");
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /\{!pendingTab && canDecideMoney\(user\) && !moneyRightLost && \(\s*<DecidedOneOffsBlock/, "the money right only, on the tab «Решённые»");
  const block = html(React.createElement(component("substitutions/decided-one-offs.tsx").DecidedOneOffsBlock, { showToast() {} }));
  assert.ok(plain(textOf(block)).includes("Решённые дополнительные уроки"));
});

// ── item 17: the rights of the rest of the screens ────────────────────────────────────────────────────

test("R3 item 17: «Оформить» a lesson of somebody else (reconcile) is hidden from an administrator without `payments_access`; the owner and an administrator with the right keep it", () => {
  const { canManageMoney } = E;
  assert.equal(canManageMoney({ org_role: "admin", payments_access: false }), false);
  assert.equal(canManageMoney({ org_role: "admin" }), false);
  assert.equal(canManageMoney({ org_role: "admin", payments_access: true }), true);
  const view = read("src/components/attendance/open-lessons-view.tsx");
  assert.match(view, /moneyRight/);
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /moneyRight/);
});

// ── item 5: the type of the lessons of a group ────────────────────────────────────────────────────────

test("R3 item 5: the type of the lessons moves the pay of the teacher - the field is open only with the money right; a refusal of the server (403 MONEY_RIGHT_REQUIRED) is shown in the server's own words", () => {
  const view = read("src/components/groups/group-detail-view.tsx");
  assert.match(view, /const moneyRight = canManageMoney\(user\);/);
  assert.match(view, /label="Тип занятий"[\s\S]{0,200}disabled=\{!moneyRight\}/);
  assert.match(view, /\{moneyRight \? LESSON_TYPE_EDIT_NOTE : LESSON_TYPE_NO_RIGHT_NOTE\}/);
  assert.match(view, /showToast\(e\.message \|\| "Ошибка сохранения", "error"\);/, "no text of ours for MONEY_RIGHT_REQUIRED");
  assert.equal(lib("group-lesson-type.ts").LESSON_TYPE_NO_RIGHT_NOTE, "Тип занятий меняет зарплату преподавателя: его меняет владелец или администратор с правом на оплаты");
  // R3 #4: no window «с начала прошлого месяца» in the form; a closed month is the server's 409 PERIOD_CLOSED with the way out
  assert.match(read("src/components/groups/group-lesson-type-dialog.tsx"), /PeriodClosedNotice/);
});

// ── the states of a confirmation (pure) ──────────────────────────────────────────────────────────────

test("R3 K1 / m2: a transfer FORM asks only once it can be sent and then waits for the answer (the windows of a payment ask nothing: UX pack §5.1-тер)", () => {
  assert.equal(MP.formAllowsConfirm(null, { status: "idle" }), true, "the form cannot be sent: nothing to ask, the press shows what is wrong");
  assert.equal(MP.formAllowsConfirm("k", { status: "loading" }), false);
  assert.equal(MP.formAllowsConfirm("k", failed()), false);
  assert.equal(MP.formAllowsConfirm("k", { status: "ready", effects: null }), true);
  for (const name of ["tillAllowsConfirm", "tillNotice", "TILL_NOT_COUNTED_TEXT", "effectsWaitReason"]) assert.equal(typeof MP[name], "undefined", name);
});

test("UX pack: an off main button of a window of confirmation says why - while the answer is counted, a closed month, a failed count", () => {
  assert.equal(MP.effectsWhyOff({ status: "ready", effects: null }), null);
  assert.equal(MP.effectsWhyOff({ status: "loading" }), "Считаем, что изменится…");
  assert.equal(MP.effectsWhyOff(failed()), "Не удалось посчитать, что изменится: нажмите «Повторить»");
  assert.equal(MP.effectsWhyOff({ status: "failed", error: Object.assign(new Error("x"), { code: "PERIOD_CLOSED", detail: { month: "2026-10", teacherId: "t1" } }) }), "Месяц закрыт: сначала переоткройте его");
});

test("the empty block of a LESSON action is ONE grey line «Деньги не изменятся» and no block; a payment window has no such block at all", () => {
  assert.equal(E.EFFECTS_NONE_TEXT, "Деньги не изменятся");
  assert.equal(E.EFFECTS_NONE_PAYMENTS_TEXT, undefined);
  assert.equal(E.EFFECTS_TITLE, "Что изменится");
});

test("R3 m7: the cancel of a payment is the one window of the cancels of money; a carry-over is named by words, never «0 сум»", () => {
  const { paymentVoidTarget } = component("payments/payment-void-modal.tsx");
  const carried = paymentVoidTarget({ id: "p1", paid_on: "2026-10-22", amount: 0, carried_from: { group_name: "7-А", payment_id: "p0", paid_on: "2026-10-01", amount: 300000, method: "cash" } }, "Иванов Иван", () => {});
  assert.doesNotMatch(String(carried.description), /(^|\D)0\sсум/);
  assert.ok(carried.explain.some((line) => /Исходная оплата в «7-А» снова начнёт действовать/.test(line)));
  assert.ok(!carried.explain.some((line) => /Деньги группы распределятся заново/.test(line)));
  const plainPayment = paymentVoidTarget({ id: "p2", paid_on: "2026-10-22", amount: 300000 }, "Иванов Иван", () => {});
  assert.ok(plainPayment.explain.some((line) => /Деньги группы распределятся заново/.test(line)));
  assert.equal(plainPayment.key, "p2");
  assert.equal(plainPayment.preview, undefined, "no dry run: the window is about the student only");
  assert.equal(plainPayment.action, "Отменить оплату");
});

test("R3 n5: one literal for each sentence of the block of effects (no copy, no `.replace` of a sentence); the reason of a dry run lives in the shared module", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const all = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? all(path.join(dir, entry.name)) : [path.join(dir, entry.name)])).filter((file) => /\.(ts|tsx)$/.test(file));
  const sources = all(path.join(env.root, "src")).map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.equal(sources.split("Считаем, что изменится…").length - 1, 1, "the loading sentence is written once");
  assert.equal(sources.split("Считаем, что изменится при переводе").length - 1, 1);
  assert.equal(sources.split("Проверка последствий").length - 1, 1, "the reason of a dry run is written once");
  assert.doesNotMatch(sources, /EFFECTS_LOADING_TEXT\.replace/);
  assert.equal(PD.DRY_RUN_REASON, "Проверка последствий");
});
