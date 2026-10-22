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
  // the server may still send its older wording: the screen says «Цена в месяц» / «Цена пакета» all the same, the unit follows the package
  assert.equal(GP.priceColumnLabel("Оплата в месяц"), "Цена в месяц");
  assert.equal(GP.priceColumnLabel("Стоимость пакета"), "Цена пакета");
  assert.equal(GP.formatPrice(800000, "Стоимость пакета"), GP.formatPrice(800000, "Цена пакета"));
  assert.match(GP.formatPrice(800000, "Стоимость пакета"), /за пакет$/);
  assert.match(read("src/components/groups/group-price-dialog.tsx"), /label=\{priceColumnLabel\(label\)\}/);
  const files = ["src/lib/group-price.ts", "src/lib/payroll.ts", "src/lib/payroll-help.ts", "src/components/groups/group-price-dialog.tsx", "src/components/groups/group-payments-tab.tsx"];
  for (const file of files) assert.doesNotMatch(read(file), /["'`>]Оплата в месяц|["'`>]Стоимость пакета/, file);
  assert.match(read("src/lib/payments-ledger.ts"), /Стоимость обучения/); // the statement's total keeps its word
});

// ── F9 / F30 / F4: one group page and one group list for both workspaces ────────────────────────────────

const stubNavigation = () => {
  const navigation = require.resolve("next/navigation");
  require(navigation);
  require.cache[navigation].exports = {
    ...require(navigation),
    useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {} }),
    useParams: () => ({ id: "g1" }),
    usePathname: () => "/owner/groups",
    useSearchParams: () => new URLSearchParams(""),
  };
};

test("F9: both workspaces render the SAME group page and group list (wrappers of one line, a `workspace` param)", () => {
  const W = require(path.join(root, "src/lib/group-workspace.ts"));
  for (const role of ["owner", "admin"]) {
    assert.match(read(`src/app/${role}/groups/[id]/page.tsx`), new RegExp(`<GroupDetailView workspace="${role}" />`));
    assert.match(read(`src/app/${role}/groups/page.tsx`), new RegExp(`<GroupsListView workspace="${role}" />`));
    assert.ok(read(`src/app/${role}/groups/[id]/page.tsx`).split("\n").length <= 12, "a thin wrapper");
    assert.ok(read(`src/app/${role}/groups/page.tsx`).split("\n").length <= 12, "a thin wrapper");
    const paths = W.groupWorkspacePaths(role);
    assert.deepEqual([paths.groups, paths.students, paths.payments, paths.viewerRole], [`/${role}/groups`, `/${role}/students`, `/${role}/payments`, role]);
  }
  // the view has no path of one workspace typed in
  for (const file of ["src/components/groups/group-detail-view.tsx", "src/components/groups/groups-list-view.tsx"]) assert.doesNotMatch(read(file), /["'`]\/(owner|admin)\//, file);
  stubNavigation();
  const { GroupDetailView } = require(path.join(root, "src/components/groups/group-detail-view.tsx"));
  const { GroupsListView } = require(path.join(root, "src/components/groups/groups-list-view.tsx"));
  for (const workspace of ["owner", "admin"]) {
    const detail = renderToStaticMarkup(React.createElement(GroupDetailView, { workspace }));
    assert.match(detail, /animate-spin/, `${workspace}: the page renders its loader first`);
    const list = renderToStaticMarkup(React.createElement(GroupsListView, { workspace }));
    assert.ok(list.length > 0, workspace);
  }
});

test("F9: the class filter is on the shared list (the administrator's list had lost it) and the filters live in the URL (F34)", () => {
  const W = require(path.join(root, "src/lib/group-workspace.ts"));
  const list = read("src/components/groups/groups-list-view.tsx");
  assert.match(list, /data-testid="groups-class-filter"/);
  assert.match(list, /GROUP_CLASS_LEVELS\.map/);
  const groups = [
    { name: "Алгебра 8А", status: "active", teacher_id: "t1", teacher_name: "Иванов", class_level: 8 },
    { name: "Геометрия 9", status: "active", teacher_id: null, class_level: 9 },
    { name: "Старая 8", status: "archived", teacher_id: "t1", teacher_name: "Иванов", class_level: 8 },
    { name: "Без цены 9", status: "active", teacher_id: "t2", class_level: 9, price_current: null },
  ];
  const q = (over) => ({ status: "active", classLevel: null, q: "", ...over });
  assert.deepEqual(W.filterGroups(groups, q({})).map((g) => g.name), ["Алгебра 8А", "Без цены 9"]);
  assert.deepEqual(W.filterGroups(groups, q({ status: "waiting" })).map((g) => g.name), ["Геометрия 9"]);
  assert.deepEqual(W.filterGroups(groups, q({ status: "archived" })).map((g) => g.name), ["Старая 8"]);
  assert.deepEqual(W.filterGroups(groups, q({ classLevel: 9 })).map((g) => g.name), ["Без цены 9"]);
  assert.deepEqual(W.filterGroups(groups, q({ q: "иванов" })).map((g) => g.name), ["Алгебра 8А"]);
  assert.deepEqual(W.filterGroups(groups, q({ status: "archived" }), "none").map((g) => g.name), ["Без цены 9"]); // «Без цены» wins over the tab
  // the URL: defaults are not written, everything round-trips
  assert.equal(W.groupListQueryString(q({})), "?");
  assert.equal(W.groupListQueryString(q({ status: "waiting", classLevel: 9, q: "алг" })), "?status=waiting&class=9&q=%D0%B0%D0%BB%D0%B3");
  const parsed = W.parseGroupListQuery(new URLSearchParams("status=waiting&class=9&q=алг"));
  assert.deepEqual(parsed, { status: "waiting", classLevel: 9, q: "алг" });
  assert.deepEqual(W.parseGroupListQuery(new URLSearchParams("status=zzz&class=3")), { status: "active", classLevel: null, q: "" });
  assert.equal(W.groupListQueryString(q({}), { price: "none" }), "?price=none");
});

test("Q3 / F7 / F30: the header menu of a group is «Изменить группу…» · «Цена группы…» · «В архив»; the lesson type is NOT a separate item", () => {
  const W = require(path.join(root, "src/lib/group-workspace.ts"));
  const labels = (input) => W.groupHeaderActions(input).map((key) => W.GROUP_HEADER_LABEL[key]);
  assert.deepEqual(labels({ archived: false, priceAvailable: true }), ["Изменить группу…", "Цена группы…", "В архив"]);
  assert.deepEqual(labels({ archived: false, priceAvailable: false }), ["Изменить группу…", "В архив"]);   // a role without money has no price
  assert.deepEqual(labels({ archived: true, priceAvailable: true }), []);                                    // an archived group: «Вернуть из архива» is its button
  for (const input of [{ archived: false, priceAvailable: true }]) assert.ok(W.groupHeaderActions(input).length <= 4);
  for (const label of Object.values(W.GROUP_HEADER_LABEL)) assert.doesNotMatch(label, /Тип занятий/);
  const view = read("src/components/groups/group-detail-view.tsx");
  assert.match(view, /<GroupPriceAction\b/);
  assert.match(view, /label="Тип занятий"/); // inside the edit form (owner decision, 292a2a1)
  assert.doesNotMatch(view, /Изменить…|group-lesson-type-change/);
  // F30: the chips of the header
  assert.equal(W.groupPriceChipText(null, "Цена в месяц"), "Цена группы не задана");
  assert.equal(plain(W.groupPriceChipText({ amount: 500000 }, "Цена в месяц")), "Цена 500 000 сум/мес");
  assert.equal(W.groupPriceChipText(undefined, "Цена в месяц"), null);
  assert.deepEqual(W.groupDebtSummary([{ debt: 100000 }, { debt: 0 }, { debt: 50000 }]), { count: 2, total: 150000 });
  assert.equal(plain(W.groupDebtChipText({ count: 2, total: 150000 })), "Долг 150 000 сум · 2 ученика");
  assert.equal(W.groupDebtChipText({ count: 0, total: 0 }), null);
  assert.match(view, /groupPaymentsHref\(paths\.groups, group\.id, "debt"\)/);
});

test("F4 / F8: the roster menu has at most two items, no «Карточка ученика», no legacy confirmation; the name is the link", () => {
  const W = require(path.join(root, "src/lib/group-workspace.ts"));
  assert.deepEqual(W.rosterMenuKeys({ canLeave: true, canTransfer: true }), ["transfer", "leave"]);
  assert.deepEqual(W.rosterMenuKeys({ canLeave: false, canTransfer: false }), []);
  assert.equal(W.ROSTER_TRANSFER_LABEL, "Перевести в другую группу…");
  assert.equal(W.ROSTER_LEAVE_LABEL, "Убрать из группы…");
  const table = read("src/components/groups/group-student-table.tsx");
  assert.doesNotMatch(table, /Карточка ученика|UserRound|Убрать ученика из группы\?|onRemove|confirmRemove/);
  assert.match(table, /href=\{`\$\{basePath\}\/\$\{s\.id\}`\}/); // the name leads to the card
  assert.match(read("src/components/groups/group-detail-view.tsx"), /onTransfer=\{setTransferStudent\}/);
  // the teacher's page has no menu at all
  assert.doesNotMatch(read("src/app/teacher/groups/[id]/page.tsx"), /onRemove|onTransfer|handleRemoveStudent/);
});

test("F3: «Цены групп» has no «⋯» with one item: «История цены» is an icon button of the row", () => {
  const page = read("src/components/payments/group-prices-page.tsx");
  assert.doesNotMatch(page, /RowMenu/);
  assert.match(page, /data-testid="group-price-history"/);
});

test("F36: the dead tab «settings» and the unused group statistics are gone from the group page", () => {
  const view = read("src/components/groups/group-detail-view.tsx");
  assert.doesNotMatch(view, /"settings"|GroupStatsPanel|getGroupStats|diagPct/);
  assert.doesNotMatch(read("src/lib/group-payments.ts"), /"settings"/);
});

test("F21 / F24: «Преподаватель» (not «Учитель») and one H1 size on the group screens", () => {
  for (const file of ["src/components/groups/group-detail-view.tsx", "src/components/groups/groups-list-view.tsx", "src/components/groups/assign-group-modal.tsx"]) {
    assert.doesNotMatch(read(file), /Учитель|учителю/, file);
  }
  for (const file of ["src/components/groups/group-detail-view.tsx", "src/components/groups/groups-list-view.tsx"]) assert.match(read(file), /<h1 className="[^"]*text-xl font-bold [^"]*md:text-2xl/, file);
});

// ── F3 / F35 / F38 / F32 / F33 / F15 / F16 / F36: the card of the student ───────────────────────────────

const C = require(path.join(root, "src/lib/student-card.ts"));
const D = require(path.join(root, "src/lib/student-diagnostic.ts"));
const PT = require(path.join(root, "src/lib/profile-tabs.ts"));
const S = require(path.join(root, "src/lib/students-tabs.ts"));

test("F3: the header «⋯» of the card is about the person - edit, new diagnostic (administrator), copy ID, archive last; at most four items", () => {
  const labels = (input) => C.studentMenuKeys(input).map((key) => C.STUDENT_MENU_LABEL[key]);
  assert.deepEqual(labels({ canEdit: true, diagnostics: true, hasDisplayId: true, canArchive: true }), ["Изменить данные…", "Новая диагностика…", "Копировать ID", "В архив"]);
  assert.deepEqual(labels({ canEdit: true, diagnostics: false, hasDisplayId: true, canArchive: true }), ["Изменить данные…", "Копировать ID", "В архив"]);   // the owner: no diagnostics
  assert.deepEqual(labels({ canEdit: true, diagnostics: false, hasDisplayId: false, canArchive: false }), ["Изменить данные…"]);
  for (const input of [{ canEdit: true, diagnostics: true, hasDisplayId: true, canArchive: true }]) assert.ok(C.studentMenuKeys(input).length <= 4);
  const view = read("src/components/students/student-profile-view.tsx");
  assert.match(view, /<RowMenu label=\{`Действия: \$\{student\.full_name\}`\}/);
  assert.match(view, /studentMenuKeys\(\{/);
  assert.equal(C.studentEditHref("/owner/students/s1"), "/owner/students/s1?tab=contacts&edit=1");
});

test("F38 / Q2: name and class are edited in the card («Изменить данные…»); only what changed is sent", () => {
  const student = { last_name: "Каримова", first_name: "Дилноза", class_level: 8, student_phone: "+998901234567", comment: null };
  const form = C.studentDataForm(student);
  assert.deepEqual(form, { last_name: "Каримова", first_name: "Дилноза", class_level: "8", student_phone: "+998901234567", comment: "" });
  assert.deepEqual(C.studentDataPatch(form, student), {});
  assert.deepEqual(C.studentDataPatch({ ...form, first_name: " Дильноза ", class_level: "9" }, student), { first_name: "Дильноза", class_level: 9 });
  assert.deepEqual(C.studentDataPatch({ ...form, comment: "Сестра Малики" }, student), { comment: "Сестра Малики" });
  assert.equal(C.checkStudentData({ ...form, last_name: " " }), "Укажите фамилию");
  assert.equal(C.checkStudentData({ ...form, first_name: "" }), "Укажите имя");
  assert.equal(C.checkStudentData({ ...form, class_level: "12" }), "Выберите класс");
  assert.equal(C.checkStudentData(form), null);
  const view = read("src/components/students/student-profile-view.tsx");
  for (const id of ["student-profile-familiya", "student-profile-imya", "student-profile-klass"]) assert.ok(view.includes(id), id);
  assert.match(view, /orgApi\.updateStudent\(studentId, patch\)/);
  assert.match(view, /searchParams\?\.get\("edit"\) === "1"/);              // ?tab=contacts&edit=1
  assert.match(view, /Класс влияет на диагностику и уровни/);
});

test("F35: the default tab of the card is «Обучение» (one default); the header says the money in one chip that leads to «Оплаты»", () => {
  assert.equal(PT.DEFAULT_PROFILE_TAB, "learning");
  const owner = PT.visibleProfileTabs({ isTeacher: false, paymentsVisible: true });
  assert.equal(PT.parseProfileTab(null, owner), "learning");
  assert.equal(PT.parseProfileTab("nonsense", owner), "learning");
  assert.equal(PT.parseProfileTab("payments", owner), "payments");
  const row = (over) => ({ debt: 0, advance: 0, is_active: true, paid_until: null, status: "active", ...over });
  const chip = C.studentMoneyChip([row({ debt: 300000 }), row({ debt: 100000, is_active: false }), row({ paid_until: "2026-11-15" })]);
  assert.deepEqual([plain(chip.label), chip.tone, chip.debtGroups], ["Долг 400 000 сум", "danger", 2]);
  assert.deepEqual(C.studentMoneyChip([row({ paid_until: "2026-12-01" }), row({ paid_until: "2026-11-15" })]), { label: "Оплачено до 15.11", tone: "ok", debtGroups: 0 });
  assert.equal(C.studentMoneyChip([]), null);
  assert.equal(C.studentMoneyChip([row({ status: "paused", paid_until: "2026-11-15" })]), null);
  const view = read("src/components/students/student-profile-view.tsx");
  assert.match(view, /href=\{`\$\{pathname\}\?tab=payments`\}/);
  assert.match(view, /data-testid="student-money-chip"/);
});

test("F32 / F15 / Q1: «Новая диагностика…» and the link of a waiting invite are the administrator's; the owner has no diagnostic button and no link into /admin/*", () => {
  assert.equal(D.diagnosticsAllowed({ workspace: "admin", archived: false }), true);
  assert.equal(D.diagnosticsAllowed({ workspace: "admin", archived: true }), false);
  assert.equal(D.diagnosticsAllowed({ workspace: "owner", archived: false }), false);
  assert.equal(D.diagnosticsAllowed({ workspace: "teacher", archived: false }), false);
  assert.equal(D.defaultDiagnosticKind([]), "initial");
  assert.equal(D.defaultDiagnosticKind([{ status: "completed" }]), "recheck");
  assert.equal(D.diagnosticLink("https://app.algo.uz/", "ABC123"), "https://app.algo.uz/d/ABC123");
  assert.deepEqual([D.isShareableInvite("pending"), D.isShareableInvite("confirmed"), D.isShareableInvite("completed"), D.isShareableInvite("cancelled")], [true, true, false, false]);
  assert.match(D.shareUrls("https://x/d/A").whatsapp, /^https:\/\/wa\.me\/\?text=/);
  const view = read("src/components/students/student-profile-view.tsx");
  assert.match(view, /orgApi\.createDiagnostic|StudentDiagnosticDialog/);
  assert.match(read("src/components/students/student-diagnostic-dialog.tsx"), /orgApi\.createDiagnostic\(\{ student_id: studentId, class_level: level, diagnostic_type: kind \}\)/);
  assert.match(view, /workspace === "owner" \?/);                      // the report link is not drawn for the owner
  assert.match(view, /data-testid="student-diagnostic-copy-link"/);
  // no owner-reachable screen points into /admin/*: the shared components of the money / students / groups area
  const walk = (dir, out = []) => { for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const rel = `${dir}/${entry.name}`; if (entry.isDirectory()) walk(rel, out); else if (/\.tsx?$/.test(entry.name)) out.push(rel); } return out; };
  for (const file of [...walk("src/app/owner"), "src/components/students/students-list-view.tsx", "src/components/groups/group-detail-view.tsx", "src/components/groups/groups-list-view.tsx", "src/components/payments/payments-page.tsx", "src/components/payments/statement-view.tsx", "src/components/payments/receipt-view.tsx", "src/components/payments/income-journal.tsx", "src/components/substitutions/substitutions-page.tsx"]) {
    const code = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(file.endsWith("students-list-view.tsx") ? code.replace(/href="\/admin\/diagnostics"/, "") : code, /["'`]\/admin\//, `${file}: a literal /admin/ path`);
  }
  // the card serves both workspaces: its `/admin/...` strings are the administrator's branch of a ternary, the owner's is `/owner/...`
  for (const line of view.split("\n").filter((text) => /["'`]\/admin\//.test(text) && !/startsWith/.test(text))) assert.match(line, /isOwnerPath|isTeacher/, line);
  assert.match(read("src/components/students/students-list-view.tsx"), /\{workspace === "admin" && \(\s*<Link\s+href="\/admin\/diagnostics"/);   // the one link, only in the administrator's list
  assert.equal(require(path.join(root, "src/lib/ia-links.ts")).pointsIntoAdmin("/admin/students/s1"), true);
  assert.equal(require(path.join(root, "src/lib/ia-links.ts")).pointsIntoAdmin("/owner/students/s1"), false);
});

test("F34 / F37: the students list lives in the address (tab, search, teacher, group, page); a teacher filters the students, not a screen of group cards", () => {
  const state = (over) => ({ tab: "grouped", q: "", teacher: "", group: "", page: 0, ...over });
  assert.equal(S.studentsListHref("/owner/students", state({})), "/owner/students");
  assert.equal(S.studentsListHref("/owner/students", state({ tab: "archived", q: "али", teacher: "t1", group: "g1", page: 2 })), "/owner/students?tab=archived&q=%D0%B0%D0%BB%D0%B8&teacher=t1&group=g1&page=3");
  const parsed = S.parseStudentsListQuery(new URLSearchParams("tab=ungrouped&q=али&teacher=t1&group=g1&page=3"));
  assert.deepEqual(parsed, state({ tab: "ungrouped", q: "али", teacher: "t1", group: "g1", page: 2 }));
  assert.deepEqual(S.parseStudentsListQuery(new URLSearchParams("page=0&tab=zzz")), state({}));
  const list = read("src/components/students/students-list-view.tsx");
  assert.doesNotMatch(list, /<GroupCard|Folder|У преподавателя пока нет групп|создать группы в разделе/);
  assert.match(list, /studentsPageQuery\(/);
  assert.doesNotMatch(list, /mergeTeacherStudents|teacherGroupIds|groups\.length === 0\) return/);
});

test("F16 / F36: one «Копировать ID» (useCopy); no dead copy code on the card, no «copyDisplayId»", () => {
  for (const file of ["src/components/students/students-list-view.tsx", "src/components/groups/group-student-table.tsx", "src/components/students/student-profile-view.tsx"]) {
    const code = read(file);
    assert.match(code, /useCopy\(/, file);
    assert.doesNotMatch(code, /navigator\.clipboard/, file);
    assert.doesNotMatch(code, /copyDisplayId/, file);
  }
  assert.match(read("src/lib/use-copy.ts"), /export function useCopy\(/);
});

// ── F26-F29, F31, F34: paths and deep links ─────────────────────────────────────────────────────────────

const L2 = require(path.join(root, "src/lib/ia-links.ts"));
const PAY = require(path.join(root, "src/lib/payments.ts"));
const INC = require(path.join(root, "src/lib/payments-income-v2.ts"));
const OL = require(path.join(root, "src/lib/open-lessons.ts"));

test("ia-links: every link is built from the workspace; money screens lead to the student's «Оплаты» tab, a lesson to its journal", () => {
  assert.equal(L2.workspaceOfPath("/admin/payments"), "admin");
  assert.equal(L2.workspaceOfPath("/owner/payments"), "owner");
  assert.deepEqual(L2.basesOfPayments("/admin/payments/"), L2.workspaceBases("admin"));
  assert.equal(L2.studentHref("/owner/students", "s 1"), "/owner/students/s%201?tab=payments");
  assert.equal(L2.studentHref("/owner/students/", "s1", "learning"), "/owner/students/s1?tab=learning");
  assert.equal(L2.studentHref("/owner/students", "s1", null), "/owner/students/s1");
  assert.equal(L2.groupHref("/admin/groups", "g1"), "/admin/groups/g1");
  assert.equal(L2.groupHref("/admin/groups", "g1", "payments"), "/admin/groups/g1?tab=payments");
  assert.equal(L2.groupPaymentsListHref("/owner/payments", "g1"), "/owner/payments?bucket=debt&group_id=g1");
  assert.equal(L2.teacherHref("t 1"), "/owner/teachers?teacher=t%201");
  assert.equal(INC.debtorsHref("/owner/payments"), "/owner/payments?bucket=debt");
});

test("F26: the card «Долг» of «Оплаты» leads to the debtors tab of the same page; «Аванс» to its card on «Поступления» (#advance)", () => {
  const page = read("src/components/payments/payments-page.tsx");
  assert.match(page, /card\.key === "debt" \? `\$\{debtorsHref\(paymentsBase\)\}#payments-list` : `\$\{incomeHref\(paymentsBase\)\}#advance`/);
  assert.match(page, /id="payments-list"/);
  assert.match(read("src/components/payments/income-parts.tsx"), /<StatCard label="Аванс" id="advance"/);
  assert.match(read("src/components/payments/income-page.tsx"), /window\.location\.hash === "#advance"/);
  const cards = PAY.positionCards({ debt_total: 500000, advance_total: 0, debtors: 2 });
  assert.deepEqual(cards.map((card) => card.label), ["Долг", "Аванс"]);
});

test("F18: «Долг» is the name of the card here and in «Поступления»; the tabs are «Должники» / «Скоро платить» / «Без долга»; «Оплачено» stays an amount and a chip", () => {
  assert.deepEqual(PAY.PAYMENT_BUCKETS.map((bucket) => bucket.label), ["Должники", "Скоро платить", "Без долга"]);
  assert.match(read("src/components/payments/income-parts.tsx"), /<StatCard label="Долг" id="position"/);
  assert.doesNotMatch(read("src/components/payments/income-parts.tsx"), /Долг на сегодня"/);
  assert.equal(PAY.membershipChip({ status: "active", period_mode: "calendar", paid_until: "2026-11-15", debt: 0 }).label, "Оплачено до 15.11");
  assert.match(read("src/components/payments/receipt-view.tsx"), /receipt\.lessons_count \? "Пакет" : "Период"/);
});

test("F29: money screens open the student on «Оплаты» and the group on its page (list, group tab, journal drawer, card)", () => {
  const page = read("src/components/payments/payments-page.tsx");
  assert.match(page, /studentHref\(studentProfileBasePath, row\.student_id, "payments"\)/);
  assert.match(page, /groupHref\(groupsBasePath, row\.group_id, "payments"\)/);
  assert.match(read("src/components/groups/group-payments-tab.tsx"), /studentHref\(studentsBasePath, view\.studentId, "payments"\)/);
  const journal = read("src/components/payments/income-journal.tsx");
  assert.match(journal, /student: studentHref\(studentProfileBasePath, row\.student_id, "payments"\)/);
  assert.match(journal, /data-testid="drawer-group-link"/);
  assert.match(read("src/components/students/student-payments-block.tsx"), /data-testid="payments-group-link"/);
  // no money screen builds a bare student URL by hand any more
  for (const file of ["src/components/payments/payments-page.tsx", "src/components/payments/income-journal.tsx", "src/components/groups/group-payments-tab.tsx"]) {
    assert.doesNotMatch(read(file), /`\$\{(studentProfileBasePath|studentsBasePath)[^`]*\}\/\$\{[^`]*student_?[iI]d\}`/, file);
  }
});

test("F4 / d3: the menu of a row of «Оплаты» is «Простить долг» | «Вернуть аванс», «Исправить последнюю оплату», «Отменить последнюю оплату»; «Выписка» is an icon link, the card is the name", () => {
  const page = read("src/components/payments/payments-page.tsx");
  assert.doesNotMatch(page, /key: "statement"|key: "profile"|Карточка ученика", icon/);
  assert.match(page, /data-testid="payment-row-statement"/);
  assert.match(page, /aria-label=\{`Выписка: \$\{row\.student_name\}`\}/);
  const keys = [...page.matchAll(/menu\.push\(\{ key: "(\w+)"/g)].map((match) => match[1]);
  assert.deepEqual(keys, ["writeoff", "refund", "correct", "void"]); // at most one of the first two is offered (debt XOR advance); never more than 3 items
  assert.match(page, /label: "Исправить последнюю оплату"/);
  assert.match(page, /label: "Отменить последнюю оплату", icon: XCircle, danger: true/);
});

test("F28: the statement leads to the student («Оплаты») and the group and offers «Внести оплату»; the receipt knows where it came from and leads back", () => {
  const statement = read("src/components/payments/statement-view.tsx");
  assert.match(statement, /data-testid="statement-student-link"/);
  assert.match(statement, /data-testid="statement-group-link"/);
  assert.match(statement, /data-testid="statement-pay"/);
  assert.match(statement, /studentLink=\{studentHref\(bases\.students, m\.student_id, "payments"\)\}/);
  assert.equal(PAY.receiptHref("/owner/payments", "p1"), "/owner/payments/receipt/p1");
  assert.equal(PAY.receiptHref("/owner/payments", "p1", { membershipId: "m1", studentId: "s1", groupId: "g1" }), "/owner/payments/receipt/p1?m=m1&s=s1&g=g1");
  assert.deepEqual(PAY.receiptContextOf(new URLSearchParams("m=m1&s=s1&g=g1")), { membershipId: "m1", studentId: "s1", groupId: "g1" });
  assert.deepEqual(PAY.receiptContextOf(new URLSearchParams("m=../x&s=" + "a".repeat(80))), { membershipId: null, studentId: null, groupId: null }); // nothing odd goes into a link
  const receipt = read("src/components/payments/receipt-view.tsx");
  for (const id of ["receipt-link-statement", "receipt-link-student", "receipt-link-group"]) assert.ok(receipt.includes(id), id);
  assert.match(receipt, /<Suspense/);
  assert.match(read("src/components/payments/income-journal.tsx"), /receiptHref\(paymentsBase, row\.id, \{ membershipId: row\.membership_id, studentId: row\.student_id, groupId: row\.group_id \}\)/);
});

test("F27: the owner's dashboard - KPI cards are links (students, staff), the debt and attention tiles lead to their lists, the group rows to the group", () => {
  const D2 = require(path.join(root, "src/lib/owner-dashboard-links.ts"));
  assert.equal(D2.dashboardKpiHref("students"), "/owner/students");
  assert.equal(D2.dashboardKpiHref("staff"), "/owner/teachers");
  const fmt = (n) => `${n} сум`;
  const input = { moneyAvailable: true, debtTotal: 1200000, studentsWithDebt: 3, attention: 4, pendingSubstitutions: 2, format: fmt, debtorsHref: "/owner/payments?bucket=debt" };
  assert.deepEqual(D2.dashboardTiles(input).map((tile) => [tile.key, tile.href]), [["debt", "/owner/payments?bucket=debt"], ["attention", "/owner/attendance"], ["substitutions", "/owner/substitutions"]]);
  assert.equal(D2.dashboardTiles(input)[0].label, "Долг · 3 ученика");
  assert.deepEqual(D2.dashboardTiles({ ...input, moneyAvailable: false, attention: 0, pendingSubstitutions: 0 }), []);   // no money right, nothing to attend: no tiles
  assert.equal(D2.dashboardTiles({ ...input, debtTotal: 0, attention: 0, pendingSubstitutions: 0 })[0].value, "Долга нет");
  const page = read("src/app/owner/dashboard/page.tsx");
  assert.match(page, /data-testid="dashboard-kpi-link"/);
  assert.match(page, /data-testid="dashboard-group-row"/);
  assert.equal((page.match(/href=\{`\/owner\/groups\/\$\{g\.group_id\}`\}/g) || []).length, 2); // leaders and risk groups
  assert.match(page, /dashboardKpiHref\("students"\)/);
  assert.doesNotMatch(page, /["'`]\/admin\//);
});

test("F31: a substitution row leads to the group, to its lesson in the journal and (owner) to the teacher's rate", () => {
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /groupHref\(bases\.groups, item\.group\.id\)/);
  assert.match(page, /journalHref\(bases\.groups, \{ groupId: item\.group\.id, lessonDate: item\.lesson\.date, lessonId: item\.lesson\.lessonId \}\)/);
  assert.match(page, /role === "owner" && item\.teacher\.id \?/);
  assert.equal(OL.journalHref("/owner/groups", { groupId: "g1", lessonDate: "2026-10-22", lessonId: "l1" }), "/owner/groups/g1?tab=attendance&month=2026-10&lesson=l1&date=2026-10-22");
});

test("F5 / F6 / d4: «Незакрытые уроки» has a button for the main action and «Урока не было» in «⋯»; «Пропуски» keeps at most three menu items", () => {
  const open = read("src/components/attendance/open-lessons-view.tsx");
  assert.match(open, /data-testid="open-lesson-action"/);
  assert.equal(OL.openLessonActionLabel({ actionType: "missed" }), "Отметить");
  assert.equal(OL.openLessonActionLabel({ actionType: "in_progress" }), "Открыть");
  const excuses = read("src/components/attendance/excuses-page.tsx");
  const menus = [...excuses.matchAll(/return \[([^\]]+)\];/g)].map((match) => match[1].split(",").length);
  assert.ok(menus.length >= 3 && menus.every((count) => count <= 3), JSON.stringify(menus));
  assert.doesNotMatch(excuses, /key: "journal"|key: "card"/);
  assert.match(excuses, /data-testid="excuse-journal-link"/);
});

// ── F19 / F20-F25: vocabulary, headers, alignment ──────────────────────────────────────────────────────

test("F19 / Q4: no «Начисл…» on the money screens of the student; the payroll columns say «Заработано»", () => {
  const files = [
    "src/components/payments/income-collection.tsx", "src/components/payments/income-parts.tsx", "src/components/payments/payments-page.tsx", "src/components/payments/statement-view.tsx",
    "src/components/payments/membership-payments.tsx", "src/components/payments/membership-price.tsx", "src/components/payments/pause-dialog.tsx", "src/components/groups/group-payments-tab.tsx",
    "src/lib/payments-income-v2.ts", "src/lib/payments-logica.ts", "src/lib/payments.ts", "src/lib/payments-ledger.ts", "src/lib/group-price.ts", "src/lib/membership-actions.ts",
  ];
  for (const file of files) assert.doesNotMatch(read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""), /[Нн]ачисл/, file);
  assert.match(read("src/components/payroll/sheet-table.tsx"), /<th scope="col" className=\{`\$\{HEAD\} text-right`\}>Заработано<\/th>/);
  assert.match(read("src/components/payroll/sheet-controls.tsx"), />Заработано<\/th>/);
  assert.doesNotMatch(read("src/components/payroll/sheet-table.tsx").replace(/\/\*[\s\S]*?\*\//g, ""), /<th[^>]*>Начислено/);
  const L3 = require(path.join(root, "src/lib/payments-logica.ts"));
  assert.deepEqual(L3.pauseCalcLines({ pause: { first_day: "2026-10-20", last_day: "2026-10-24", days: 5 }, impact: null }), ["Дни паузы не входят в стоимость: 5 дней. Место в группе сохраняется."]);
});

test("F22 / F23 / F24: «Прикрепить» + object, «Настройки» everywhere, one H1 size on the owner / admin screens", () => {
  assert.match(read("src/components/attendance/excuses-page.tsx"), /label: "Прикрепить справку"/);
  assert.doesNotMatch(read("src/components/attendance/excuses-page.tsx"), /Приложить справку/);
  assert.match(read("src/components/payments/payment-cheques.tsx"), /label: "Прикрепить чек"/);
  assert.match(read("src/app/admin/diagnostics/page.tsx"), /Карточка ученика: /);
  assert.doesNotMatch(read("src/app/admin/diagnostics/page.tsx"), /Профиль ученика/);
  for (const file of ["src/components/layout/sidebar.tsx", "src/components/layout/bottom-nav.tsx"]) assert.doesNotMatch(read(file), /Настройки аккаунта/, file);
  assert.doesNotMatch(read("src/app/owner/settings/page.tsx"), /Настройки рабочей области/);
  const h1 = /<h1 className="[^"]*text-xl font-bold [^"]*md:text-2xl/;
  for (const file of ["src/app/owner/teachers/page.tsx", "src/app/owner/settings/page.tsx", "src/app/admin/settings/page.tsx", "src/app/admin/diagnostics/page.tsx", "src/app/teacher/settings/page.tsx", "src/components/groups/group-detail-view.tsx", "src/components/groups/groups-list-view.tsx", "src/components/payments/payments-page.tsx", "src/components/students/students-list-view.tsx"]) {
    assert.match(read(file), h1, file);
  }
  for (const file of ["src/app/owner/teachers/page.tsx", "src/components/groups/group-create-modal.tsx", "src/app/invite/[code]/page.tsx"]) assert.doesNotMatch(read(file), />\s*Учител[ьяе]\s*</, file);
});

test("F25: money is right-aligned, dates and counts are centred - the list of «Оплаты», «Цены групп», the payroll sheet", () => {
  const page = read("src/components/payments/payments-page.tsx");
  assert.match(page, /<span className="text-right">\{priceLabelOf\(periodMode\)\}<\/span>/);
  assert.match(page, /<span className="text-right">Последняя оплата<\/span>/);
  assert.match(page, /<span className="text-center">Статус<\/span>/);
  assert.match(read("src/components/payments/group-prices-page.tsx"), /aligns=\{\["left", "right", "right", "center", "right"\]\}/);
  assert.match(read("src/components/payroll/sheet-table.tsx"), /aria-label=\{priceColumn\} className=\{`\$\{HEAD\} text-right/);
  assert.match(read("src/components/groups/group-payments-tab.tsx"), /<span className="text-right">\{label\}<\/span>/);
});

// ── F14 / F17 / F34 / F36 ─────────────────────────────────────────────────────────────────────────────

test("F14: one <Chip> and one registry of statuses (exam, diagnostic, money) instead of copies typed by hand", () => {
  const T = require(path.join(root, "src/lib/chip-tone.ts"));
  const R = require(path.join(root, "src/lib/status-registry.ts"));
  for (const tone of ["neutral", "warn", "danger", "ok", "info", "violet", "muted"]) assert.ok(T.CHIP_TONE_CLASS[tone], tone);
  assert.match(T.chipClass({ tone: "ok", size: "md" }), /rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 px-2 py-0\.5 text-xs/);
  assert.match(T.chipClass({ tone: "danger", pill: true }), /rounded-full/);
  const { Chip } = require(path.join(root, "src/components/ui/chip.tsx"));
  const html = renderToStaticMarkup(React.createElement(Chip, { tone: "warn", testId: "c", title: "t" }, "Ожидает"));
  assert.match(html, /<span class="[^"]*border-amber-200[^"]*" title="t" data-testid="c">Ожидает<\/span>/);
  // exams: three copies became one
  assert.deepEqual(Object.keys(R.EXAM_STATUS), ["draft", "variants_ready", "lobby", "active", "closed", "archived"]);
  assert.equal(R.examStatusView("nonsense").label, "Черновик");
  for (const file of ["src/app/admin/exams/page.tsx", "src/app/admin/exams/[id]/page.tsx"]) {
    assert.doesNotMatch(read(file), /const statusConfig/, file);
    assert.match(read(file), /examStatusView\(exam\.status\)/, file);
  }
  assert.match(read("src/app/admin/diagnostics/page.tsx"), /DIAGNOSTIC_STATUS/);
  // money: the card, the group tab and the list map the same tones
  assert.equal(R.moneyChipTone("ok", true), "ok");
  assert.equal(R.moneyChipTone("ok"), "neutral");
  assert.equal(R.moneyChipTone("warning"), "warn");
  assert.equal(R.moneyChipTone("danger"), "danger");
  for (const file of ["src/components/payments/membership-payments.tsx", "src/components/groups/group-payments-tab.tsx", "src/components/payments/payments-page.tsx"]) assert.match(read(file), /<Chip\b/, file);
});

test("F17: one wording of the lesson actions by the date of the lesson, in the sheet, the journal and «Незакрытые уроки»", () => {
  const A = require(path.join(root, "src/lib/schedule-card-actions.ts"));
  assert.equal(A.cancelLessonLabel(false), "Отменить урок");
  assert.equal(A.cancelLessonLabel(true), "Урока не было");
  assert.equal(A.MARK_LESSON_LABEL, "Отметить посещаемость");
  assert.equal(A.assignActionLabel({ past: false, lacksTeacher: false, isSubstitution: false }), "Назначить замену");
  assert.equal(A.assignActionLabel({ past: true, lacksTeacher: false, isSubstitution: false }), "Назначить того, кто провёл");
  assert.equal(A.assignActionLabel({ past: false, lacksTeacher: false, isSubstitution: true }), "Заменить преподавателя");
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /assignActionLabel\(\{ past: lesson\.date <= today/);
  assert.match(journal, /cancelLessonLabel\(true\)/);
  assert.doesNotMatch(journal, /ASSIGN_TEACHER_ACTION|REPLACE_TEACHER_ACTION/);
  assert.match(read("src/components/attendance/open-lessons-view.tsx"), /cancelLessonLabel\(true\)/);
});

test("F34: the filters and sub-tabs are in the address - payments list, income period, statement month, excuses / substitutions status, staff tab", () => {
  const url = (state) => PAY.paymentsListQueryString({ bucket: "debt", groupId: "", teacherId: "", q: "", page: 0, ...state });
  assert.equal(url({}), "?bucket=debt");
  assert.equal(url({ bucket: "active", groupId: "g1", q: "али", page: 2 }), "?bucket=active&group_id=g1&q=%D0%B0%D0%BB%D0%B8&page=3");
  assert.equal(url({ teacherId: "t1" }), "?bucket=debt&teacher_id=t1");
  assert.deepEqual(PAY.parsePaymentsListQuery(new URLSearchParams("bucket=paused&group_id=g1&teacher_id=t9&q=x&page=4")), { bucket: "paused", groupId: "g1", teacherId: "", q: "x", page: 3 });
  assert.deepEqual(PAY.parsePaymentsListQuery(new URLSearchParams("")), { bucket: "debt", groupId: "", teacherId: "", q: "", page: 0 });
  const today = "2026-10-22";
  const period = (kind, from, to) => ({ kind, from, to });
  assert.equal(INC.incomeQueryString(INC.periodOf("month", today), "journal", today), "?");
  assert.equal(INC.incomeQueryString(INC.periodOf("month", "2026-09-10"), "groups", today), "?month=2026-09&tab=groups");
  assert.equal(INC.incomeQueryString(period("custom", "2026-10-05", "2026-10-20"), "journal", today), "?from=2026-10-05&to=2026-10-20");
  assert.deepEqual(INC.parseIncomeQuery(new URLSearchParams("month=2026-09&tab=groups"), today), { period: INC.periodOf("month", "2026-09-01"), tab: "groups" });
  assert.deepEqual(INC.parseIncomeQuery(new URLSearchParams("from=2026-10-05&to=2026-10-20"), today).period, period("custom", "2026-10-05", "2026-10-20"));
  assert.deepEqual(INC.parseIncomeQuery(new URLSearchParams("month=2026-13&from=x"), today).period, INC.periodOf("month", today));
  assert.equal(L2.queryWith("?tab=excuses&status=confirmed", { status: null }), "?tab=excuses");
  assert.equal(L2.queryWith("tab=excuses", { status: "rejected" }), "?tab=excuses&status=rejected");
  assert.equal(L2.queryWith("", { status: null }), "?");
  assert.match(read("src/components/attendance/excuses-page.tsx"), /queryWith\(searchParams\?\.toString\(\), \{ status: next === "pending" \? null : next \}\)/);
  assert.match(read("src/components/substitutions/substitutions-page.tsx"), /queryWith\(searchParams\?\.toString\(\), \{ status: next === "decided" \? "decided" : null \}\)/);
  assert.match(read("src/app/owner/teachers/page.tsx"), /queryWith\(searchParams\?\.toString\(\), \{ tab: next === "members" \? null : next \}\)/);
  assert.match(read("src/components/payments/statement-view.tsx"), /queryWith\(searchParams\?\.toString\(\), \{ month: value \}\)/);
  assert.match(read("src/components/payments/income-page.tsx"), /incomeQueryString\(period, tab, today\)/);
  assert.match(read("src/components/payments/payments-page.tsx"), /paymentsListQueryString\(\{ bucket, groupId: filter\.groupId/);
});

test("F36: the orphan administrator analytics page is gone; nothing links to it", () => {
  assert.equal(fs.existsSync(path.join(root, "src/app/admin/analytics/page.tsx")), false);
  const walk = (dir, out = []) => { for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const rel = `${dir}/${entry.name}`; if (entry.isDirectory()) walk(rel, out); else if (/\.tsx?$/.test(entry.name)) out.push(rel); } return out; };
  for (const file of walk("src/components")) assert.doesNotMatch(read(file), /\/admin\/analytics/, file);
});
