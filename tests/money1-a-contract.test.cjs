// «Деньги-1», пакет А (front), the round of the contract after the server's R3: the dry runs BEFORE the confirmation of payments, write-offs, refunds, transfers and the return of a
// lesson «в разбор» (items 6, 7), «Требует разбора» by month (8), the decided additional lessons (14), the rights (17).  Contract: MONEY1_A_SERVER_REPORT.md,
// «Изменения контракта после R3».  The dialogs are drawn on the server side; the hooks that ask the server are replaced by a state the test sets, so every state of the answer is READ like a person reads it.
const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");
const env = require("./helpers/money1-env.cjs");
const { React, html, textOf, lib, component, read, signIn, plain } = env;

// ── the answer of the dry run, as the test sets it ───────────────────────────────────────────────────
const state = { preview: { status: "idle" } };
const retries = [];
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === "@/lib/use-money-preview") return { ...load.call(this, request, ...rest), useMoneyPreview: () => ({ preview: state.preview, retry: () => retries.push("retry") }), useFormMoneyPreview: () => ({ preview: state.preview, retry: () => retries.push("retry") }) };
  if (request === "@/lib/use-payment-effects") return { usePaymentEffects: () => ({ shown: true, preview: state.preview, retry: () => retries.push("retry") }) };
  return load.call(this, request, ...rest);
};
const E = lib("money-effects.ts");
const MP = lib("money-preview.ts");
const PD = lib("payment-dry-run.ts");
const OPEN = lib("open-lessons.ts");
const OO = lib("one-off.ts");
const RET = lib("lesson-return.ts");

const OWNER_DRY = {
  students: [{ studentId: "s1", name: "Иванов Иван", delta: -1 }],
  payroll: [{ month: "2026-10", state: "open", sheetId: "sh1", teacherId: "t1", teacherName: "Каримова К.", savedTotal: 475000, paid: 475000, freshBefore: 475000, freshAfter: 425000, freshTotal: 425000, changedBy: -50000, driftAfter: -50000 }],
  text: "…", dryRun: true,
};
const ready = (block, answer) => ({ status: "ready", effects: E.normalizeMoneyEffects(block), answer });
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
  const pay = { amount: 300000, paid_on: "2026-11-05", method: "cash" };
  const calls = await recorded(async (api) => {
    await api.dryRunCreatePayment("m1", pay);
    await api.dryRunReplacePayment("p1", { ...pay, reason: "ошибка" });
    await api.dryRunVoidPayment("p1", "Проверка последствий");
    await api.dryRunCreateWriteoff("m1", { amount: 40000, reason: "болезнь", date: "2026-11-05" });
    await api.dryRunVoidWriteoff("w1", "Проверка последствий");
    await api.dryRunCreateRefund("m1", { amount: 100000, method: "cash", reason: "ушёл", date: "2026-11-05" });
    await api.dryRunVoidRefund("r1", "Проверка последствий");
    await api.dryRunTransferStudent("g2", "st1", { price_override: null });
    await api.dryRunBulkTransfer("g2", ["st1", "st2"], { price_override: null });
  });
  assert.deepEqual(calls.map((call) => `${call.method} ${call.url}`), [
    "POST /auth/org/memberships/m1/payments?dry_run=true",
    "POST /auth/org/payments/p1/replace?dry_run=true",
    "POST /auth/org/payments/p1/void?dry_run=true",
    "POST /auth/org/memberships/m1/writeoffs?dry_run=true",
    "POST /auth/org/writeoffs/w1/void?dry_run=true",
    "POST /auth/org/memberships/m1/refunds?dry_run=true",
    "POST /auth/org/refunds/r1/void?dry_run=true",
    "POST /auth/org/groups/g2/students/st1?mode=transfer&dry_run=true",
    "POST /auth/org/groups/g2/students/bulk?mode=transfer&dry_run=true",
  ]);
  for (const call of calls) assert.ok(!Object.keys(call.headers).some((name) => name.toLowerCase() === "idempotency-key"), `${call.url}: a dry run has no key`);
  assert.deepEqual(calls[0].body, pay, "the same body");
  assert.deepEqual(calls[1].body, { ...pay, reason: "ошибка" });
  assert.deepEqual(calls[8].body, { student_ids: ["st1", "st2"] });
});

test("R3 item 6: the REAL request after the dry run is the same body with its Idempotency-Key and without `dry_run`", async () => {
  const pay = { amount: 300000, paid_on: "2026-11-05", method: "cash" };
  const calls = await recorded(async (api) => { await api.createPayment("m1", pay, "key-1"); await api.replacePayment("p1", pay, "key-2"); });
  assert.equal(calls[0].url, "/auth/org/memberships/m1/payments");
  assert.equal(calls[0].headers["Idempotency-Key"], "key-1");
  assert.equal(calls[1].url, "/auth/org/payments/p1/replace");
  assert.equal(calls[1].headers["Idempotency-Key"], "key-2");
  assert.deepEqual(calls[0].body, pay);
});

test("R3 item 6: the draft of a payment - nothing to ask while the form cannot be sent; the key is everything the real request will carry; a correction carries its reason", () => {
  const values = { amount: "300 000", paidOn: "2026-11-05", method: "cash", note: "", reason: "" };
  assert.equal(PD.paymentDraft({ ...values, amount: "" }, "2026-11-05", "create"), null);
  assert.equal(PD.paymentDraft({ ...values, method: null }, "2026-11-05", "create"), null);
  assert.equal(PD.paymentDraft({ ...values, paidOn: "2026-11-09" }, "2026-11-05", "create"), null, "a date in the future is not sent");
  const draft = PD.paymentDraft(values, "2026-11-05", "create");
  assert.deepEqual(draft.body, { amount: 300000, paid_on: "2026-11-05", method: "cash" });
  assert.notEqual(PD.paymentDraft({ ...values, amount: "250 000" }, "2026-11-05", "create").key, draft.key, "another amount - another ask");
  assert.notEqual(PD.paymentDraft({ ...values, note: "наличные" }, "2026-11-05", "create").key, draft.key, "another body - another ask");
  assert.deepEqual(PD.paymentDraft({ ...values, reason: " ошибка " }, "2026-11-05", "replace").body, { amount: 300000, paid_on: "2026-11-05", method: "cash", reason: "ошибка" });
  assert.deepEqual(PD.paymentDraft({ ...values, reason: "ошибка" }, "2026-11-05", "create").body, { amount: 300000, paid_on: "2026-11-05", method: "cash" }, "a new payment has no reason");
});

test("R3 item 6: a form asks only once it can be sent, and then its button waits for the answer, always with a reason said", () => {
  assert.deepEqual(MP.formConfirmState(null, { status: "idle" }), { allowed: true, reason: null });
  assert.equal(MP.formConfirmState("k", { status: "loading" }).allowed, false);
  assert.equal(MP.formConfirmState("k", { status: "loading" }).reason, "Считаем, что изменится с деньгами…");
  assert.equal(MP.formConfirmState("k", failed()).allowed, false);
  assert.equal(MP.formConfirmState("k", failed()).reason, "Сначала нужно увидеть, что изменится с деньгами");
  assert.deepEqual(MP.formConfirmState("k", { status: "ready", effects: null }), { allowed: true, reason: null });
});

// ── the windows ─────────────────────────────────────────────────────────────────────────────────────

const PAYMENT = { id: "p1", paid_on: "2026-11-05", amount: 300000 };
const voidModal = (ownerOrAdmin = { org_role: "owner" }) => {
  signIn(ownerOrAdmin);
  const { PaymentVoidModal } = component("payments/payment-void-modal.tsx");
  return html(React.createElement(PaymentVoidModal, { payment: PAYMENT, studentName: "Иванов Иван", onClose() {}, onVoided() {} }));
};

test("R3 item 6: «Отменить оплату» - the owner reads the sheet «было → станет» before the red button; loading and a failure hold the button, with the reason said and «Повторить»", () => {
  state.preview = ready(OWNER_DRY);
  const done = voidModal();
  const text = plain(textOf(done));
  assert.match(done, /data-testid="money-effects"/);
  assert.ok(text.includes("Иванов Иван: занятие спишется из пакета"));
  assert.ok(text.includes("Ведомость Каримова К., октябрь 2026: 475 000 сум → 425 000 сум (−50 000 сум)"));
  assert.doesNotMatch(done, /form="payment-void-form"[^>]*disabled=""/, "the answer is here - the button works");
  state.preview = { status: "loading" };
  const loading = voidModal();
  assert.match(loading, /form="payment-void-form"[^>]*disabled=""/);
  assert.match(loading, /data-testid="payment-void-wait"/);
  assert.ok(plain(textOf(loading)).includes("Считаем, что изменится с деньгами…"));
  state.preview = failed();
  const broken = voidModal();
  assert.match(broken, /form="payment-void-form"[^>]*disabled=""/);
  assert.match(broken, /data-testid="money-effects-retry"/);
  assert.match(broken, /data-testid="payment-void-wait"/, "and says why the button waits");
});

test("R3 item 6: an administrator with the right sees the month and the state of the sheet, no sum (LESSONS 45)", () => {
  state.preview = ready({ students: [], payroll: [{ month: "2026-10", state: "open" }], text: "", dryRun: true });
  const text = plain(textOf(voidModal({ org_role: "admin", payments_access: true })));
  assert.ok(text.includes("Изменится ведомость: октябрь 2026"));
  assert.ok(!text.includes("→") && !/сум\)/.test(text));
});

test("R3 item 6: a closed month in the dry run of a payment is a warning, not a refusal: the window still works (a payment is allowed in a closed month, the sheet is re-saved)", () => {
  state.preview = ready({ students: [], payroll: [{ month: "2026-10", state: "closed", teacherName: "Каримова К.", sheetId: "s", teacherId: "t", freshBefore: 475000, freshAfter: 425000, changedBy: -50000 }], text: "", dryRun: true });
  const markup = voidModal();
  assert.ok(plain(textOf(markup)).includes("месяц закрыт ведомостью"));
  assert.doesNotMatch(markup, /form="payment-void-form"[^>]*disabled=""/);
});

test("R3 item 15: the numbers could not be counted - one calm line, not an error; the action is still possible", () => {
  state.preview = ready({ students: [], payroll: [], unavailable: true, text: "", dryRun: true });
  const markup = voidModal();
  assert.ok(plain(textOf(markup)).includes("Последствия для денег не удалось посчитать"));
  assert.doesNotMatch(markup, /role="alert"/);
  assert.doesNotMatch(markup, /form="payment-void-form"[^>]*disabled=""/);
  assert.ok(!plain(textOf(markup)).includes("Деньги не изменятся"), "not «nothing changes»");
});

test("R3 item 6: «Отменить прощение» / «Отменить возврат» - the dry run rides on the target; without one the dialog is as it was", () => {
  const { RecordVoidModal } = component("payments/record-void-modal.tsx");
  const target = (preview) => ({ key: "w1", title: "Отменить прощение долга?", description: "05.11 · 40 000", action: "Отменить прощение", run: async () => {}, ...(preview ? { preview } : {}) });
  state.preview = { status: "loading" };
  const asked = html(React.createElement(RecordVoidModal, { target: target(() => Promise.resolve({})), onClose() {} }));
  assert.match(asked, /form="record-void-form"[^>]*disabled=""/);
  assert.match(asked, /data-testid="record-void-wait"/);
  state.preview = ready(OWNER_DRY);
  const done = html(React.createElement(RecordVoidModal, { target: target(() => Promise.resolve({})), onClose() {} }));
  assert.match(done, /data-testid="money-effects"/);
  assert.doesNotMatch(done, /form="record-void-form"[^>]*disabled=""/);
  state.preview = { status: "loading" };
  const plainTarget = html(React.createElement(RecordVoidModal, { target: target(null), onClose() {} }));
  assert.doesNotMatch(plainTarget, /record-void-wait|money-effects/);
  assert.doesNotMatch(plainTarget, /form="record-void-form"[^>]*disabled=""/);
  const statement = read("src/components/payments/statement-view.tsx");
  assert.match(statement, /preview: \(signal\) => orgApi\.dryRunVoidWriteoff\(id, DRY_RUN_REASON, signal\),\s*run: async \(reason\) => \{ const result = await orgApi\.voidWriteoff\(id, reason\);/);
  assert.match(statement, /preview: \(signal\) => orgApi\.dryRunVoidRefund\(id, DRY_RUN_REASON, signal\),\s*run: async \(reason\) => \{ const result = await orgApi\.voidRefund\(id, reason\);/);
});

test("R3 item 6: the sources - every confirming dialog asks the dry run of the SAME body and sends nothing real before the answer is here", () => {
  const writeoff = read("src/components/payments/writeoff-dialog.tsx");
  assert.match(writeoff, /const draftBody = row && validateWriteoff\(values, debt\) === null \? buildWriteoffPayload\(values, today\) : null;/);
  assert.match(writeoff, /orgApi\.dryRunCreateWriteoff\(row\.membership_id, draftBody, signal\)/);
  assert.match(writeoff, /orgApi\.createWriteoff\(row\.membership_id, buildWriteoffPayload\(values, today\)\)/);
  assert.match(writeoff, /if \(!row \|\| busy \|\| !allowed\) return;/);
  assert.match(writeoff, /disabled=\{busy \|\| !allowed\}/);
  const refund = read("src/components/payments/refund-dialog.tsx");
  assert.match(refund, /const draftBody = row && validateRefund\(values, refundable\) === null \? buildRefundPayload\(values, today\) : null;/);
  assert.match(refund, /orgApi\.dryRunCreateRefund\(row\.membership_id, draftBody, signal\)/);
  assert.match(refund, /orgApi\.createRefund\(row\.membership_id, buildRefundPayload\(values, today\)\)/);
  assert.match(refund, /if \(!row \|\| busy \|\| !allowed\) return;/);
  assert.match(refund, /disabled=\{busy \|\| !allowed\}/);
  const voidPayment = read("src/components/payments/payment-void-modal.tsx");
  assert.match(voidPayment, /orgApi\.dryRunVoidPayment\(paymentId, DRY_RUN_REASON, signal\)/);
  assert.match(voidPayment, /if \(!payment \|\| busy \|\| !effectsAllowConfirm\(effects\.preview\)\) return;/);
  assert.match(voidPayment, /disabled=\{busy \|\| !effectsAllowConfirm\(effects\.preview\)\}/);
  // a payment at the till: the block informs, the button is NOT held back (the till never waits for a calculation)
  const dialog = read("src/components/payments/payment-dialog.tsx");
  assert.match(dialog, /<MoneyEffectsBlock preview=\{effects\.preview\} onRetry=\{effects\.retry\} blocking=\{false\} \/>/);
  assert.match(dialog, /disabled=\{busy \|\| blocker !== null\}/);
  const hook = read("src/lib/use-payment-effects.ts");
  assert.match(hook, /orgApi\.dryRunReplacePayment\(paymentId, body, signal\) : orgApi\.dryRunCreatePayment\(membershipId, body, signal\)/);
});

test("R3 item 6: a payment at the till - the block shows the sheet; a failed calculation says the payment can still be entered", () => {
  signIn({ org_role: "owner" });
  const { PaymentDialog } = component("payments/payment-dialog.tsx");
  const membership = { membership_id: "m1", group_id: "g1", student_name: "Иванов Иван", group_name: "7-А" };
  const draw = () => html(React.createElement(PaymentDialog, { open: true, kind: "create", membership, onClose() {}, onSaved() {} }));
  state.preview = ready(OWNER_DRY);
  assert.ok(plain(textOf(draw())).includes("Ведомость Каримова К., октябрь 2026: 475 000 сум → 425 000 сум (−50 000 сум)"));
  state.preview = failed();
  const broken = plain(textOf(draw()));
  assert.ok(broken.includes("Действие можно выполнить; ведомости проверьте после"));
  assert.ok(!broken.includes("Без этого подтвердить нельзя"), "the till is not held back");
  state.preview = failed(409);
});

test("R3 item 6: a transfer - «Что переедет в новую группу» lists what the server carries over; loading and a failure hold «Перевести»", () => {
  const { TransferPreviewBlock } = component("groups/transfer-preview-block.tsx");
  const draw = (preview) => html(React.createElement(TransferPreviewBlock, { preview, onRetry() {} }));
  const carried = [{ code: "PAYMENT_CARRIED", message: "Оплата 300 000 сум перенесена в новую группу" }, { code: "DEBT_CARRIED", message: "Долг 50 000 сум перенесён" }];
  const done = draw(ready({ students: [], payroll: [], text: "", dryRun: true }, { dry_run: true, carried }));
  const text = plain(textOf(done));
  assert.ok(text.includes("Что переедет в новую группу"));
  assert.ok(text.includes("Оплата 300 000 сум перенесена в новую группу") && text.includes("Долг 50 000 сум перенесён"));
  assert.match(done, /data-testid="transfer-carried"/);
  const none = plain(textOf(draw(ready({ students: [], payroll: [], text: "", dryRun: true }, { dry_run: true, carried: [] }))));
  assert.ok(none.includes("Оплаты и долги не переносятся"));
  assert.match(draw({ status: "loading" }), /data-state="loading"/);
  const broken = draw(failed());
  assert.match(broken, /data-testid="transfer-preview-retry"/);
  assert.equal(draw({ status: "idle" }), "");
  assert.deepEqual(PD.carriedOf({ carried: [{ code: "A", message: " один " }, { code: "B" }, null] }).map((line) => line.message), ["один"]);
  assert.deepEqual(PD.carriedOf({}), []);
  for (const file of ["src/components/groups/assign-group-modal.tsx", "src/components/groups/add-student-drawer.tsx"]) {
    const source = read(file);
    assert.match(source, /formConfirmState\(transferKey, transferPreview\.preview\)\.allowed/, file);
    assert.match(source, /<TransferPreviewBlock preview=\{transferPreview\.preview\} onRetry=\{transferPreview\.retry\} \/>/, file);
  }
  assert.match(read("src/components/groups/assign-group-modal.tsx"), /orgApi\.dryRunTransferStudent\(selectedGroupId, studentId, \{ price_override: dryException\.request \}, signal\)/);
  assert.match(read("src/components/groups/add-student-drawer.tsx"), /orgApi\.dryRunBulkTransfer\(groupId, transferIds, \{ price_override: dryException\.request \}, signal\)/);
  assert.match(read("src/components/groups/assign-group-modal.tsx"), /if \(!selectedGroupId \|\| assigning \|\| !transferAllowed\) return;/);
  assert.match(read("src/components/groups/add-student-drawer.tsx"), /if \(selected\.size === 0 \|\| !transferAllowed\) return;/);
});

// ── item 7: «Урока не было» → «В разбор» ──────────────────────────────────────────────────────────

const REVIEW = { groupId: "g1", lessonId: "l1", lessonDate: "2026-10-28", cancelKind: "centre" };
const reviewDialog = () => {
  signIn({ org_role: "owner" });
  const { ReturnToReviewDialog } = component("groups/lesson-return-dialogs.tsx");
  return html(React.createElement(ReturnToReviewDialog, { target: REVIEW, onClose() {}, onDone() {} }));
};
const DEDUCTIONS = [{ studentId: "s1", name: "Иванов Иван", amount: 46000 }, { studentId: "s2", name: "Петрова Мария", amount: 46000 }];

test("R3 item 7: «Вернуть в разбор» asks the dry run (`dryRun: true`) and shows WHOSE deduction goes away and how much, then the sheet of the teacher", () => {
  state.preview = ready({ students: [], payroll: [{ month: "2026-10", state: "open", sheetId: "s", teacherId: "t", teacherName: "Каримова К.", freshBefore: 475000, freshAfter: 429000, changedBy: -46000 }], text: "У 2 учеников исчезнет вычет", dryRun: true }, { dryRun: true, deductions: DEDUCTIONS });
  const done = reviewDialog();
  const text = plain(textOf(done));
  assert.match(done, /data-testid="return-review-deductions"/);
  assert.ok(text.includes("Вычеты за этот урок исчезнут"));
  assert.ok(text.includes("Иванов Иван: 46 000 сум") && text.includes("Петрова Мария: 46 000 сум"));
  assert.ok(text.includes("Ведомость Каримова К., октябрь 2026: 475 000 сум → 429 000 сум (−46 000 сум)"));
  assert.doesNotMatch(done, /data-testid="return-review-submit"[^>]*disabled=""/);
  assert.ok(!text.includes("исчезнет вычет за этот урок (если центр"), "the general line is gone");
});

test("R3 item 7: deductions only - the block never says «деньги не изменятся» next to a deduction that goes away; with none, it says so", () => {
  state.preview = ready({ students: [], payroll: [], text: "У 2 учеников исчезнет вычет за этот урок: 92 000 сум", dryRun: true }, { dryRun: true, deductions: DEDUCTIONS });
  const text = plain(textOf(reviewDialog()));
  assert.ok(text.includes("Иванов Иван: 46 000 сум"));
  assert.ok(!text.includes("Деньги не изменятся"));
  state.preview = ready({ students: [], payroll: [], text: "", dryRun: true }, { dryRun: true, deductions: [] });
  const none = reviewDialog();
  assert.doesNotMatch(none, /return-review-deductions/);
  assert.ok(plain(textOf(none)).includes("Деньги не изменятся"));
});

test("R3 item 7: loading and a failure hold «Вернуть в разбор» (the reason is said); a closed month is the server's sentence with the way out", () => {
  state.preview = { status: "loading" };
  const loading = reviewDialog();
  assert.match(loading, /data-testid="return-review-submit"[^>]*disabled=""/);
  assert.match(loading, /data-testid="return-review-wait"/);
  state.preview = failed();
  assert.match(reviewDialog(), /data-testid="return-review-submit"[^>]*disabled=""/);
  state.preview = { status: "failed", error: { status: 409, code: "PERIOD_CLOSED", message: "Месяц октябрь 2026 у преподавателя Каримова К. закрыт", detail: { month: "2026-10", teacherId: "t1", teacherName: "Каримова К." } } };
  const closed = reviewDialog();
  assert.match(closed, /data-testid="period-closed"/);
  assert.match(closed, /data-testid="period-closed-reopen"/);
  const src = read("src/components/groups/lesson-return-dialogs.tsx");
  assert.match(src, /orgApi\.restoreLesson\(target\.groupId, \{ lessonId: target\.lessonId, lessonDate: target\.lessonDate, reason: DRY_RUN_REASON, dryRun: true \}, signal\)/);
  assert.match(src, /if \(!target \|\| busy \|\| sending\.current \|\| !effectsAllowConfirm\(preview\)\) return;/);
  assert.match(src, /disabled=\{busy \|\| !effectsAllowConfirm\(preview\)\}/);
  assert.match(src, /orgApi\.restoreLesson\(target\.groupId, \{ lessonId: target\.lessonId, lessonDate: target\.lessonDate, reason: reason\.trim\(\) \}\)/, "the real request has no dryRun");
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
  assert.ok(text.includes("Оплачен преподавателю"));
  assert.ok(text.includes("решил Арслан") && text.includes("28.10.2026 09:30"));
  assert.ok(text.includes("провёл Каримова К."));
  assert.match(open, /data-testid="decided-undo"/);
  assert.doesNotMatch(open, /period-closed/);
  const none = plain(textOf(html(React.createElement("ul", null, React.createElement(DecidedRow, { item: { ...DECIDED, money: "none" }, onUndo() {}, onReopened() {} })))));
  assert.ok(none.includes("Без оплаты"));
});

test("R3 item 14: a closed month - no «Отменить решение», the sentence «месяц закрыт — сначала переоткройте» and «Переоткрыть месяц» for the money right only", () => {
  const { DecidedRow } = component("substitutions/decided-one-offs.tsx");
  const draw = (user) => { signIn(user); return html(React.createElement("ul", null, React.createElement(DecidedRow, { item: { ...DECIDED, canUndo: false, periodClosed: true }, onUndo() {}, onReopened() {} }))); };
  const owner = draw({ org_role: "owner" });
  assert.doesNotMatch(owner, /data-testid="decided-undo"/);
  assert.ok(plain(textOf(owner)).includes("Месяц закрыт ведомостью — сначала переоткройте его, потом отмените решение"));
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
  assert.equal(OO.decidedMoneyText("paid"), "Оплачен преподавателю");
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
