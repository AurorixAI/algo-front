// IA fix pack (audit 22.10, artifacts/partner_doc_check/ia_audit_2026-10-22.md, F1-F38): menus, one history, links, vocabulary.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
require.extensions[".tsx"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const Module = require("node:module");
if (!Module.__iaAlias) {
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    return resolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...rest);
  };
  Module.__iaAlias = true;
}
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const plain = (text) => String(text).replace(/[  ]/g, " ");
const textOf = (html) => plain(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
const M = require(path.join(root, "src/lib/membership-actions.ts"));
const L = require(path.join(root, "src/lib/membership-learning.ts"));
const E = require(path.join(root, "src/lib/enrol-labels.ts"));
const GP = require(path.join(root, "src/lib/group-price.ts"));

const price = (over = {}) => ({ amount: 500000, source: "group", valid_from: "2000-01-01", group_amount: 500000, reason: null, ...over });
const row = (over = {}) => ({
  membership_id: "m1", student_id: "s1", student_name: "Каримова Дилноза", group_id: "g1", group_name: "Алгебра 8А", is_primary: true, is_active: true,
  price: price(), status: "active", period_mode: "calendar", paid_until: "2026-11-15", debt: 0, past_debt: 0, current_due: 0, advance: 0, refundable: 0, ...over,
});

// ── F1 / F13: the «⋯» of a membership row ───────────────────────────────────────────────────────────────

test("F1: the row menu has at most three items, one per domain, in a fixed order; no pause, no histories, no navigation", () => {
  const states = [
    row(), row({ debt: 100000 }), row({ refundable: 50000, advance: 50000 }), row({ debt: 100000, writeoff_allowed: false }),
    row({ opening: { id: "o", paid_until: "2026-10-01", debt_amount: null, debt_on: null } }), row({ is_active: false, debt: 10 }),
    row({ price: price({ source: "override", reason: "Сестра" }) }), row({ price: price({ scheduled: { row_id: "r", amount: 1, valid_from: "2027-01-01", reason: "x" } }) }),
  ];
  for (const state of states) {
    for (const archived of [false, true]) {
      const labels = M.membershipMenuLabels(state, { archived });
      assert.ok(labels.length <= M.MEMBERSHIP_MENU_MAX, JSON.stringify(labels));
      for (const label of labels) assert.doesNotMatch(label, /Пауза|История|Выписка|Карточка|Исправить|Отменить|Назначить|Вернуть цену/);
    }
  }
  assert.deepEqual(M.membershipMenuLabels(row()), ["Индивидуальная цена…", "Внести остаток на начало…"]);
  assert.deepEqual(M.membershipMenuLabels(row({ debt: 100000 })), ["Простить долг", "Индивидуальная цена…", "Внести остаток на начало…"]);
  assert.deepEqual(M.membershipMenuLabels(row({ refundable: 50000 })), ["Вернуть аванс", "Индивидуальная цена…", "Внести остаток на начало…"]);
  assert.deepEqual(M.membershipMenuLabels(row({ opening: { id: "o", paid_until: null, debt_amount: 1, debt_on: "2026-10-01" } })), ["Индивидуальная цена…", "Остаток на начало…"]);
  // a group the student has left keeps the money actions; an archived student has none
  assert.deepEqual(M.membershipMenuLabels(row({ is_active: false, debt: 100000 })), ["Простить долг"]);
  assert.deepEqual(M.membershipMenuLabels(row({ debt: 100000 }), { archived: true }), []);
});

test("F1 / F13: the student card and the group's «Оплаты» tab render the SAME component for the menu", () => {
  const card = read("src/components/payments/membership-payments.tsx");
  const tab = read("src/components/groups/group-payments-tab.tsx");
  assert.match(card, /<MembershipRowActions\b/);
  assert.match(tab, /<MembershipRowActions\b/);
  for (const file of [card, tab]) {
    assert.doesNotMatch(file, /<RowMenu\b/);                      // no menu of its own
    assert.doesNotMatch(file, /priceMenuActions|<AssignOverrideDialog|<ReturnPriceDialog|<CancelScheduledDialog|<WriteoffDialog|<RefundDialog|<OpeningBalanceDialog/);
  }
  const shared = read("src/components/payments/membership-row-actions.tsx");
  assert.match(shared, /membershipActionKeys\(row, \{ archived \}\)/);
  for (const dialog of ["<WriteoffDialog", "<RefundDialog", "<IndividualPriceDialog", "<OpeningBalanceDialog"]) assert.ok(shared.includes(dialog), dialog);
  // the same labels for the same row: the tab passes its own accessible name only
  assert.match(tab, /label=\{`Действия по оплате: \$\{view\.name\}`\}/);
});

test("F1: the shared menu renders for a live row, and nothing for an archived student (static render)", () => {
  const { MembershipRowActions } = require(path.join(root, "src/components/payments/membership-row-actions.tsx"));
  const html = (props) => renderToStaticMarkup(React.createElement(MembershipRowActions, { row: row({ debt: 5 }), studentName: "Каримова Дилноза", periodMode: "calendar", onRowChange: () => {}, onNotify: () => {}, ...props }));
  assert.match(html({}), /aria-label="Действия по оплате: Алгебра 8А"/);
  assert.match(html({ label: "Действия по оплате: Каримова Дилноза" }), /aria-label="Действия по оплате: Каримова Дилноза"/);
  assert.doesNotMatch(html({ archived: true }), /Действия по оплате/);
});

test("F1: «Индивидуальная цена…» is one window: the modes of the existing rules, the history inside, the old dialogs composed", () => {
  const src = read("src/components/payments/membership-price.tsx");
  assert.match(src, /export function IndividualPriceDialog\(/);
  assert.match(src, /priceMenuActions\(true, price, history\?\.history\)/);                       // the rules decide which modes exist
  for (const dialog of ["<AssignOverrideDialog", "<ReturnPriceDialog", "<CancelScheduledDialog"]) assert.ok(src.includes(dialog), dialog);
  assert.match(src, /aria-label="История цены"/);                                                  // the history is inside the window
  assert.match(src, /data-testid=\{`price-mode-\$\{action\.kind\}`\}/);
  assert.doesNotMatch(src, /useMembershipPriceControls|Скрыть историю цены/);
  // the rules themselves are untouched
  const scheduled = { id: "soon", amount: 1, valid_from: "2026-12-01", is_future: true, is_current: false };
  assert.deepEqual(GP.priceMenuActions(true, price({ source: "override", valid_from: "2026-10-01" }), [scheduled]).map((a) => a.kind), ["assign", "return", "cancel"]);
  assert.deepEqual(GP.priceMenuActions(true, price(), []).map((a) => a.kind), ["assign"]);
  assert.deepEqual(GP.priceMenuActions(false, price(), [scheduled]), []);
  for (const kind of ["assign", "return", "cancel"]) assert.ok(GP.priceModeHint(kind).length > 10);
  assert.equal(GP.INDIVIDUAL_PRICE_TITLE, "Индивидуальная цена");
  // renders closed without a crash (the window is a portal that opens on demand)
  const { IndividualPriceDialog } = require(path.join(root, "src/components/payments/membership-price.tsx"));
  assert.equal(renderToStaticMarkup(React.createElement(IndividualPriceDialog, { open: false, row: row(), studentName: "A", periodMode: "calendar", onClose() {}, onRowChange() {}, onNotify() {} })), "");
});

// ── F10: one history ───────────────────────────────────────────────────────────────────────────────────

test("F10: the card has no embedded history; every action of it moved to the statement, nothing was lost", () => {
  const card = read("src/components/payments/membership-payments.tsx");
  assert.doesNotMatch(card.replace(/\/\*[\s\S]*?\*\//g, ""), /История оплат|HistoryItem|listMembershipPayments|Прикрепить чек|Квитанция|Исправить|Отменить/);
  // what the card keeps: the last payment on one line, and the link to the statement for every state
  const line = M.lastPaymentLine({ last_payment: { id: "p", amount: 450000, paid_on: "2026-10-05", voided_at: null } });
  assert.equal(plain(line), "Последняя оплата: 450 000 сум · 05.10.2026");
  assert.equal(M.lastPaymentLine({ last_payment: null }), "");
  assert.equal(M.lastPaymentLine({ last_payment: { id: "p", amount: 1, paid_on: "2026-10-05", voided_at: "2026-10-06T10:00:00" } }), "");
  const statement = read("src/components/payments/statement-view.tsx");
  const cheques = read("src/components/payments/payment-cheques.tsx");
  // the actions of the old history: receipt, cheque (attach / open / delete), correct, cancel
  for (const [what, pattern] of [["receipt", /label: "Квитанция"/], ["correct", /label: CORRECT_PAYMENT_LABEL/], ["void", /label: VOID_PAYMENT_LABEL/], ["attach", /cheques\.menuItem\(id\)/], ["files", /cheques\.filesOf\(/]]) assert.match(statement, pattern, what);
  for (const [what, pattern] of [["attach", /label: "Прикрепить чек"/], ["open", /Открыть файл/], ["delete", /orgApi\.deletePaymentFile/], ["upload", /orgApi\.uploadPaymentFile/], ["limit", /PAYMENT_FILE_MAX_COUNT/]]) assert.match(cheques, pattern, what);
  assert.match(statement, /\{cheques\.dialogs\}/);
});

test("F11 / F10: one wording of «Исправить оплату» / «Отменить оплату» (statement and list)", () => {
  const statement = read("src/components/payments/statement-view.tsx");
  assert.match(statement, /CORRECT_PAYMENT_LABEL = "Исправить оплату"/);
  assert.match(statement, /VOID_PAYMENT_LABEL = "Отменить оплату"/);
  assert.doesNotMatch(statement, /label: "Исправить"|label: "Отменить"/);
});

// ── F2: the pause is a property of the enrolment ─────────────────────────────────────────────────────────

test("F2: the pause moved from the money menu to «Обучение»; «Оплаты» shows the chip «На паузе до …» and the way there", () => {
  const card = read("src/components/payments/membership-payments.tsx");
  assert.doesNotMatch(card, /PauseDialog|Пауза…|Закончить паузу/);
  assert.match(card, /data-testid="membership-pause-link"/);
  assert.doesNotMatch(M.membershipMenuLabels(row()).join("|"), /Пауза/);
  const block = read("src/components/students/student-groups-block.tsx");
  assert.match(block, /<PauseDialog\b/);
  assert.match(block, /label=\{`Действия по группе: \$\{item\.group_name\}`\}/);
  // the menu of a group's card: the pause (or its end) and leaving
  const today = "2026-10-22";
  assert.deepEqual(L.groupMenuItems({ pauses: [], today, hasMembershipId: true }).map((i) => i.label), ["Пауза…", "Убрать из группы…"]);
  assert.deepEqual(L.groupMenuItems({ pauses: [{ first_day: "2026-10-20", last_day: "2026-11-01" }], today, hasMembershipId: true }).map((i) => i.label), ["Закончить паузу", "Убрать из группы…"]);
  assert.deepEqual(L.groupMenuItems({ pauses: [{ first_day: "2026-10-25", last_day: "2026-11-01" }], today, hasMembershipId: true }).map((i) => i.label), ["Пауза…", "Убрать из группы…"]); // not begun yet
  assert.deepEqual(L.groupMenuItems({ pauses: [], today, hasMembershipId: false }).map((i) => i.key), ["leave"]);
  assert.equal(L.pauseChipOf([{ first_day: "2026-10-20", last_day: "2026-11-01" }], today), "На паузе до 01.11");
  assert.equal(L.pauseChipOf([], today), null);
});

// ── F8 / F12: leaving a group on the card; one enrolment vocabulary ──────────────────────────────────────

test("F8: «Убрать из группы…» is on the card of the group in «Обучение» (the same dialog with the money)", () => {
  const block = read("src/components/students/student-groups-block.tsx");
  assert.match(block, /<LeaveStudentDialog\b/);
  assert.match(block, /LEAVE_MENU_LABEL|groupMenuItems/);
  assert.equal(L.LEAVE_MENU_LABEL, "Убрать из группы…");
});

test("F12: one vocabulary of enrolment - «Зачислить в группу» / «Перевести в другую группу» - on the card, in the dialog and on the group page", () => {
  assert.equal(E.ENROL_ACTION_LABEL, "Зачислить в группу");
  assert.equal(E.TRANSFER_ACTION_LABEL, "Перевести в другую группу");
  assert.equal(E.enrolDialogTitle("add", true), "Зачислить в группу");
  assert.equal(E.enrolDialogTitle("add", false), "Зачислить в группу");
  assert.equal(E.enrolDialogTitle("transfer", true), "Перевести в другую группу");
  assert.equal(E.enrolDialogTitle("transfer", false), "Зачислить в группу");
  const blocks = [read("src/components/students/student-groups-block.tsx"), read("src/components/groups/assign-group-modal.tsx"), read("src/components/groups/add-student-drawer.tsx"), read("src/app/owner/groups/[id]/page.tsx"), read("src/app/admin/groups/[id]/page.tsx")];
  const banned = /Добавить в группу|Добавить в ещё одну группу|Перевести сюда|Перевести в группу|Добавить ученика|Добавить учеников|Добавить ещё и|Зачисление в группу|>\s*Перевести\s*</;
  for (const text of blocks) assert.doesNotMatch(text, banned);
  assert.match(blocks[0], /ENROL_ACTION_LABEL/);
  assert.match(blocks[0], /TRANSFER_ACTION_LABEL/);
  assert.match(blocks[1], /enrolDialogTitle\(/);
  // both forms carry the same extras: an individual price and an opening balance (the two shared form blocks)
  for (const text of [blocks[1], blocks[2]]) { assert.match(text, /<EnrolPriceToggle\b/); assert.match(text, /<OpeningToggle\b/); }
});

// ── F20: «Цена» / «Стоимость» ────────────────────────────────────────────────────────────────────────────

test("F20: «Цена в месяц» / «Цена пакета» name the price; «Стоимость» stays the total of the statement", () => {
  assert.equal(GP.priceLabelOf("calendar"), "Цена в месяц");
  assert.equal(GP.priceLabelOf("lessons"), "Цена пакета");
  const files = ["src/lib/group-price.ts", "src/lib/payroll.ts", "src/lib/payroll-help.ts", "src/components/groups/group-price-dialog.tsx", "src/components/groups/group-payments-tab.tsx"];
  for (const file of files) assert.doesNotMatch(read(file), /["'`>]Оплата в месяц|["'`>]Стоимость пакета/, file);
  assert.match(read("src/lib/payments-ledger.ts"), /Стоимость обучения/); // the statement's total keeps its word
});
