// ROADMAP #126: the tab «Оплаты» of the group page - who pays what, who has an individual price (spec: artifacts/partner_doc_check/group_payments_tab_spec.md).
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
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const Module = require("node:module");
if (!Module.__gpAlias) {
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    return resolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...rest);
  };
  Module.__gpAlias = true;
}
const G = require(path.join(root, "src/lib/group-payments.ts"));
const P = require(path.join(root, "src/lib/payments.ts"));
const GP = require(path.join(root, "src/lib/group-price.ts"));
const plain = (text) => String(text).replace(/[\u00a0\u202f]/g, " ");

const TODAY = "2026-10-22";
const price = (over = {}) => ({ amount: 500000, source: "group", valid_from: "2000-01-01", group_amount: 500000, reason: null, ...over });
const row = (id, name, over = {}) => ({
  membership_id: `m-${id}`, student_id: `s-${id}`, student_name: name, display_id: `AL1-00${id}`, group_id: "g1", group_name: "Группа А",
  is_primary: true, is_active: true, price: price(), status: "active", period_mode: "calendar", paid_until: "2026-11-15",
  debt: 0, past_debt: 0, current_due: 0, advance: 0, partial_credit: 0, price_missing: false, ...over,
});
const override = (amount, reason = "Сестра ученика", from = "2026-10-15", more = {}) => price({ amount, source: "override", valid_from: from, reason, ...more });

const ROWS = [
  row(1, "Алиев Анвар"),                                                                              // group price only
  row(2, "Бекова Мадина", { price: override(400000, "Сестра ученика", "2026-10-15", { set_by_name: "Иванова А." }) }), // individual today
  row(3, "Валиев Тимур", { price: price({ scheduled: { row_id: "r9", amount: 400000, valid_from: "2026-12-01", reason: "С нового месяца" } }) }), // scheduled, not in force
  row(4, "Гафуров Али", { price: price({ valid_from: "2026-09-01" }) }),                              // an override ended: the group price again
  row(5, "Дадаев Саид", { status: "paused", paused: { from: "2026-10-20", to: "2026-11-01" }, price: override(300000, "Пауза не влияет") }),
  row(6, "Ёрова Лола", { status: "expired", debt: 900000, past_debt: 500000, days_overdue: 5, paid_until: "2026-10-01" }),
  row(7, "Жураева Нилуфар", { price: { amount: null, source: "none", valid_from: null, group_amount: null, reason: null }, price_missing: true, status: "none" }),
  row(8, "Зокиров Рустам", { price: override(0, "Грант"), status: "active" }),                         // free by an exception
];
const VIEWS = G.paymentRowViews(ROWS, { periodMode: "calendar", today: TODAY });
const view = (n) => VIEWS.find((v) => v.membershipId === `m-${n}`);

// ── who sees the tab ────────────────────────────────────────────────────────────────────────

test("visibility: the owner and an administrator with the money right see it; a teacher, an admin without the right, an archived group, the demo do not", () => {
  const base = { moneyAvailable: true, moneyLoaded: true };
  assert.equal(G.groupPaymentsAccess(base), "show");                                   // owner / money admin: summary answered 200
  assert.equal(G.groupPaymentsAccess({ moneyAvailable: false, moneyLoaded: true }), "hidden"); // admin without the right: 403/404
  assert.equal(G.groupPaymentsAccess({ moneyAvailable: false, moneyLoaded: false }), "pending"); // not known yet: a deep link waits
  assert.equal(G.groupPaymentsAccess({ ...base, isTeacher: true }), "hidden");
  assert.equal(G.groupPaymentsAccess({ ...base, archived: true }), "hidden");
  assert.equal(G.groupPaymentsAccess({ ...base, demo: true }), "hidden");
});

test("the tab of ?tab=: payments only where it may be seen; a deep link waits while the right is unknown; the others as before", () => {
  assert.equal(G.resolveGroupTab("payments", "show"), "payments");
  assert.equal(G.resolveGroupTab("payments", "pending"), "payments");
  assert.equal(G.resolveGroupTab("payments", "hidden"), "students");
  assert.equal(G.resolveGroupTab("attendance", "hidden"), "attendance");
  assert.equal(G.resolveGroupTab("bogus", "show"), "students");
  assert.equal(G.resolveGroupTab(null, "show"), "students");
  assert.equal(G.GROUP_PAYMENTS_LABEL, "Оплаты");
});

test("the pages of the owner and of the administrator carry the 4th tab; the teacher's page does not", () => {
  for (const role of ["owner", "admin"]) {
    // IA audit F9: one shared page for both workspaces; the wrapper only names the workspace
    assert.match(read(`src/app/${role}/groups/[id]/page.tsx`), new RegExp(`<GroupDetailView workspace="${role}" />`), role);
    const page = read("src/components/groups/group-detail-view.tsx");
    assert.match(page, /<GroupPaymentsTab/, role);
    assert.match(page, /\.\.\.\(paymentsAccess === "show" \? \[\{ key: "payments", Icon: Wallet \}\]/, role);
    assert.match(page, /groupsBasePath=\{paths\.groups\}/, role);
    assert.match(page, /paymentsBasePath=\{paths\.payments\}/, role);
    assert.match(page, /archived: group\?\.status === "archived"/, role);
    assert.match(page, /demo: DEMO_MODE/, role);
    assert.match(page, /tab === "payments" && paymentsAccess === "pending"/, role);
  }
  const teacher = read("src/app/teacher/groups/[id]/page.tsx");
  assert.doesNotMatch(teacher, /GroupPaymentsTab|group-payments/);
});

// ── filter and deep link ────────────────────────────────────────────────────────────────────

test("deep link: ?tab=payments&filter=individual; unknown filter = all", () => {
  assert.equal(G.parsePaymentsFilter("individual"), "individual");
  assert.equal(G.parsePaymentsFilter("debt"), "debt");
  assert.equal(G.parsePaymentsFilter("zzz"), "all");
  assert.equal(G.parsePaymentsFilter(null), "all");
  assert.equal(G.groupPaymentsHref("/owner/groups", "g 1", "individual"), "/owner/groups/g%201?tab=payments&filter=individual");
  assert.equal(G.groupPaymentsHref("/admin/groups/", "g1"), "/admin/groups/g1?tab=payments");
  assert.equal(G.paymentsFilterQuery("debt"), "?tab=payments&filter=debt");
  assert.equal(G.paymentsFilterQuery("all"), "?tab=payments");
});

test("«Цены групп»: «5 учеников» is a link to that deep link", () => {
  assert.equal(G.individualPricesHref("/owner/groups", "abc"), "/owner/groups/abc?tab=payments&filter=individual");
  const page = read("src/components/payments/group-prices-page.tsx");
  assert.match(page, /<Link href=\{individualPricesHref\(groupsBasePath, item\.group_id\)\}[^>]*data-testid="group-individual-link"[^>]*>\{individual\}<\/Link>/);
  assert.equal(GP.individualPricesText(5), "5 учеников");
});

// ── rows ────────────────────────────────────────────────────────────────────────────────────

test("rows: the price is the server's price.amount (what the statement charges); free is «бесплатно», none is «Не задана»", () => {
  for (const r of ROWS) {
    const v = G.paymentRowViews([r], { periodMode: "calendar", today: TODAY })[0];
    const p = GP.priceOfRow(r);
    assert.equal(v.priceText, p.amount === null ? "Не задана" : GP.formatPrice(p.amount, "Цена в месяц"), r.student_name);
  }
  assert.equal(plain(view(1).priceText), "500 000 сум/мес");
  assert.equal(view(8).priceText, "бесплатно");
  assert.equal(view(7).priceText, "Не задана");
  assert.equal(view(7).priceMissing, true);
});

test("lessons mode: «Цена пакета», the price is «за пакет», the chip says the lessons left", () => {
  const r = row(1, "Алиев", { period_mode: "lessons", lessons_total: 12, lessons_left: 9, lessons_used: 3, paid_until: null });
  const v = G.paymentRowViews([r], { periodMode: "lessons", today: TODAY })[0];
  assert.equal(plain(v.priceText), "500 000 сум за пакет");
  assert.equal(v.chip.label, "Оплачено");                       // the header chip is short; the count is the progress line of the package
  assert.equal(require(path.join(root, "src/lib/package-progress.ts")).packageProgress(r).leftText, "Осталось 9 из 12 уроков");
  assert.equal(plain(G.scheduledLine({ amount: 400000, valid_from: "2026-12-01" }, TODAY, "Цена пакета")), "с 01.12 — 400 000 сум за пакет");
});

test("invariant: the chip of a row is the chip of the student card (membershipChip of the same row)", () => {
  for (const r of ROWS) {
    const v = G.paymentRowViews([r], { periodMode: "calendar", today: TODAY })[0];
    assert.deepEqual(v.chip, P.membershipChip(r), r.student_name);
  }
  assert.match(view(5).chip.label, /На паузе/);
  assert.match(view(6).chip.label, /Долг 900/);
  const src = read("src/components/payments/membership-payments.tsx");
  assert.match(src, /const chip = membershipChip\(row\)/);
  assert.match(read("src/lib/group-payments.ts"), /chip: membershipChip\(row\)/);
});

test("individual price: the badge is for an override in force today (source=override); scheduled / ended / group price are not", () => {
  assert.deepEqual(VIEWS.filter((v) => v.individual).map((v) => v.membershipId), ["m-2", "m-5", "m-8"]);
  assert.equal(view(3).individual, false); // scheduled: today the group price
  assert.equal(view(4).individual, false); // ended: the group price again
  assert.equal(view(1).individualHint, null);
});

test("the hint of the badge: reason · since · who; no author - no author; no reason - said so", () => {
  assert.equal(view(2).individualHint, "Сестра ученика · с 15.10.2026 · назначил Иванова А.");
  assert.equal(view(5).individualHint, "Пауза не влияет · с 15.10.2026");
  assert.equal(G.individualHint(override(1, "  ", "2000-01-01"), null), "Причина не указана · с самого начала");
  // the author the extra call knew: the list's own field wins when it is there
  const withExtras = G.paymentRowViews([ROWS[4]], { periodMode: "calendar", today: TODAY, extras: { "m-5": { setBy: "Каримов Б.", scheduled: null } } })[0];
  assert.match(withExtras.individualHint, /назначил Каримов Б\./);
  const own = G.paymentRowViews([ROWS[1]], { periodMode: "calendar", today: TODAY, extras: { "m-2": { setBy: "Другой", scheduled: null } } })[0];
  assert.match(own.individualHint, /Иванова А\./);
});

test("a scheduled individual price is a quiet second line «с 01.12 — 400 000 сум» (the year only when it is not this year)", () => {
  assert.equal(plain(view(3).scheduledText), "с 01.12 — 400 000 сум");
  assert.equal(plain(G.scheduledLine({ amount: 400000, valid_from: "2027-01-10" }, TODAY)), "с 10.01.2027 — 400 000 сум");
  assert.equal(G.scheduledLine({ amount: null, valid_from: "2026-12-01" }, TODAY), "с 01.12 — цена группы");
  assert.equal(G.scheduledLine({ amount: 0, valid_from: "2026-12-01" }, TODAY), "с 01.12 — бесплатно");
  assert.equal(G.scheduledLine(null, TODAY), null);
  assert.equal(view(1).scheduledText, null);
});

test("filters and counts: «Все (8)», «Индивидуальная цена (3)», «С долгом (1)»; individual by name, debt by the biggest debt", () => {
  const counts = G.paymentsCounts(VIEWS);
  assert.deepEqual(counts, { all: 8, individual: 3, debt: 1 });
  assert.equal(G.filterChipLabel("all", counts), "Все (8)");
  assert.equal(G.filterChipLabel("individual", counts), "Индивидуальная цена (3)");
  assert.equal(G.filterChipLabel("debt", counts), "С долгом (1)");
  assert.deepEqual(G.filterPaymentRows(VIEWS, "individual").map((v) => v.name), ["Бекова Мадина", "Дадаев Саид", "Зокиров Рустам"]);
  assert.deepEqual(G.filterPaymentRows(VIEWS, "debt").map((v) => v.name), ["Ёрова Лола"]);
  assert.equal(G.filterPaymentRows(VIEWS, "all").length, 8);
  assert.deepEqual(G.filterPaymentRows(VIEWS, "all", "мадина").map((v) => v.name), ["Бекова Мадина"]);
  assert.deepEqual(G.filterPaymentRows(VIEWS, "all", "AL1-003").map((v) => v.name), ["Валиев Тимур"]);
  assert.equal(G.emptyFilterText("individual", ""), "Индивидуальных цен нет: все платят по цене группы");
  assert.equal(G.emptyFilterText("all", "яяя"), "Ничего не найдено");
  const many = G.paymentRowViews([row(1, "А", { debt: 100, status: "expired" }), row(2, "Б", { debt: 900, status: "expired" })], { periodMode: "calendar", today: TODAY });
  assert.deepEqual(G.filterPaymentRows(many, "debt").map((v) => v.name), ["Б", "А"]);
});

test("invariant: the count of the filter «Индивидуальная цена» equals the count on «Цены групп» (individual prices in force today)", () => {
  // the server counts active memberships with an override that is in force today and not «цена группы снова»; the tab counts source=override
  const serverCount = ROWS.filter((r) => r.is_active && r.price.source === "override" && r.price.amount !== null && r.price.valid_from <= TODAY).length;
  assert.equal(G.paymentsCounts(VIEWS).individual, serverCount);
  assert.equal(GP.individualPricesText(serverCount), "3 ученика");
  // 100 students: one list, one number
  const hundred = Array.from({ length: 100 }, (_, i) => row(i + 10, `Ученик ${String(i).padStart(3, "0")}`, i % 20 === 0 ? { price: override(400000) } : {}));
  const views = G.paymentRowViews(hundred, { periodMode: "calendar", today: TODAY });
  assert.equal(G.paymentsCounts(views).individual, 5);
  assert.equal(G.filterPaymentRows(views, "individual").length, 5);
  assert.ok(views.length >= G.PAYMENTS_SEARCH_FROM);
});

test("a student in two groups: the tab asks for this group only (group_id) and rows are by membership", () => {
  const src = read("src/components/groups/group-payments-tab.tsx");
  assert.match(src, /getPaymentsStatus\(\{ bucket, groupId, limit: PAGE/);
  assert.match(src, /fetchAll\("all", groupId\)/);
  const two = G.paymentRowViews([row(1, "Алиев"), { ...row(1, "Алиев"), membership_id: "m-other", group_id: "g2" }], { periodMode: "calendar", today: TODAY });
  assert.equal(new Set(two.map((v) => v.key)).size, 2);
  assert.equal(two[0].studentId, two[1].studentId);
});

test("students who left: only those with a debt, not among the active ones, the biggest debt first", () => {
  const debtors = [row(6, "Ёрова", { debt: 900 }), row(21, "Ушёл А", { is_active: false, debt: 100 }), row(22, "Ушёл Б", { is_active: false, debt: 700 }), row(23, "Ушёл В", { is_active: false, debt: 0 })];
  const left = G.leftDebtRows(debtors, new Set(["m-6"]));
  assert.deepEqual(left.map((r) => r.student_name), ["Ушёл Б", "Ушёл А"]);
  assert.equal(G.leftDebtToggleLabel(2, false), "Показать ушедших с долгом (2)");
  assert.equal(G.leftDebtToggleLabel(2, true), "Скрыть ушедших с долгом");
  const leftView = G.paymentRowViews(left, { periodMode: "calendar", today: TODAY })[0];
  assert.equal(leftView.left, true);
});

// ── the extra call (an older server) ────────────────────────────────────────────────────────

test("the author and the scheduled price from `price-override` when the list does not carry them", () => {
  const history = [
    { id: "h1", amount: 400000, valid_from: "2026-10-15", reason: "Сестра", created_by_name: "Иванова А.", created_at: null, is_current: true, is_future: false, changes: [] },
    { id: "h2", amount: 350000, valid_from: "2026-12-01", reason: "Зима", created_by_name: "Иванова А.", created_at: null, is_current: false, is_future: true, changes: [] },
  ];
  const extras = G.extrasFromHistory(override(400000), history);
  assert.equal(extras.setBy, "Иванова А.");
  assert.deepEqual(extras.scheduled, { row_id: "h2", amount: 350000, valid_from: "2026-12-01", reason: "Зима" });
  assert.deepEqual(G.extrasFromHistory(price(), []), { setBy: null, scheduled: null });
  const asRow = G.scheduledAsOverrideRow(extras.scheduled);
  assert.equal(asRow.id, "h2");
  assert.equal(asRow.is_future, true);
  assert.equal(G.scheduledAsOverrideRow({ amount: 1, valid_from: "2026-12-01" }), null); // no row id: it cannot be cancelled here
  // who needs the call: an active individual price the list does not describe completely
  assert.equal(G.needsExtras(ROWS[0]), false);
  assert.equal(G.needsExtras(ROWS[4]), true);                // override without set_by_name / scheduled
  assert.equal(G.needsExtras({ ...ROWS[4], price: override(1, "x", "2026-10-15", { set_by_name: null, scheduled: null }) }), false);
  assert.equal(G.needsExtras({ ...ROWS[4], is_active: false }), false);
});

// ── the line above the table: gone (INC-14), only the «price not set» prompt stays ──────────

test("no summary line: no price/individual/collection sentence is built any more", () => {
  for (const name of ["summaryParts", "collectionBrief", "individualCountText"]) assert.equal(G[name], undefined, name);
});

// ── the component: its words, its actions, the phone ────────────────────────────────────────

test("the tab: columns, actions and the shared dialogs (payment, individual price, opening balance), cards on a phone", () => {
  const src = read("src/components/groups/group-payments-tab.tsx");
  for (const word of ["Ученик", "Оплата", "PAY_ACTION_LABEL", "Выписка", "индивидуальная", "Оплатить долг"]) assert.ok(src.includes(word), word);
  assert.ok(src.includes("<PaymentDialog"));
  assert.match(src, /<span className="text-center">\{label\}<\/span>/); // the column is named by the centre's mode (priceLabelOf), never hard-coded
  // IA audit F1 / F13: the «⋯» of a row is the student card's own component (the dialogs and the rules live there)
  assert.match(src, /<MembershipRowActions\b/);
  const shared = read("src/components/payments/membership-row-actions.tsx");
  for (const dialog of ["<WriteoffDialog", "<RefundDialog", "<IndividualPriceDialog", "<OpeningBalanceDialog"]) assert.ok(shared.includes(dialog), dialog);
  assert.match(read("src/lib/membership-actions.ts"), /Остаток на начало…/);
  assert.match(src, /onFilterChange\(key\)/);
  assert.match(src, /data-testid=\{`payments-filter-\$\{key\}`\}/);
  assert.match(src, /flex flex-col gap-2 rounded-xl border[^`]*lg:grid/);   // a card below lg, a table row from lg
  assert.doesNotMatch(src, /overflow-x-auto|min-w-\[/);                    // no horizontal scroll
  assert.doesNotMatch(src, /getIncomeOverview|collection|loadIncome/); // the month's collection is in the header chips and «Поступления», not here
  // never requested for a teacher: the pages render the tab only for «show»
  assert.match(read("src/lib/group-payments.ts"), /if \(input\.isTeacher \|\| input\.demo \|\| input\.archived\) return "hidden"/);
});

test("the dialogs of the individual price are shared with the student card (exported, same rules: a reason is required)", () => {
  const src = read("src/components/payments/membership-price.tsx");
  for (const name of ["AssignOverrideDialog", "ReturnPriceDialog", "CancelScheduledDialog"]) assert.match(src, new RegExp(`export function ${name}\\(`));
  assert.match(src, /checkOverrideForm\(\{ amount, validFrom, reason \}, today\)/);
  const menu = GP.priceMenuActions(true, override(400000), [{ id: "r", amount: 1, valid_from: "2026-12-01", is_future: true }]).map((a) => a.label);
  assert.deepEqual(menu, ["Назначить индивидуальную цену", "Вернуть цену группы", "Отменить запланированную индивидуальную цену"]);
  assert.deepEqual(GP.priceMenuActions(true, price(), []).map((a) => a.label), ["Назначить индивидуальную цену"]);
  assert.match(GP.checkOverrideForm({ amount: "400000", validFrom: TODAY, reason: "ab" }, TODAY).error, /причин/i);
});

test("the tab renders the line of the group and a loader first (no table before the data)", () => {
  require.extensions[".tsx"] = (mod, filename) => {
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
  };
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { GroupPaymentsTab } = require(path.join(root, "src/components/groups/group-payments-tab.tsx"));
  const html = renderToStaticMarkup(React.createElement(GroupPaymentsTab, {
    groupId: "g1", groupName: "Группа А", groupPrice: { amount: 500000, valid_from: "2026-01-01" }, groupsBasePath: "/owner/groups",
    studentsBasePath: "/owner/students", paymentsBasePath: "/owner/payments", joinedAt: {}, filter: "all", onFilterChange: () => undefined,
  }));
  const text = plain(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  assert.doesNotMatch(text, /Цена группы|индивидуальной ценой|собрано|долг за месяц/); // INC-14: the summary line is gone (the header chips, the filter counts and «Поступления» carry it)
  assert.doesNotMatch(html, /group-payments-summary/);
  assert.match(text, /Загрузка/);
  assert.doesNotMatch(html, /group-payment-row/);
  const noPrice = renderToStaticMarkup(React.createElement(GroupPaymentsTab, {
    groupId: "g1", groupName: "Группа А", groupPrice: null, groupsBasePath: "/owner/groups",
    studentsBasePath: "/owner/students", paymentsBasePath: "/owner/payments", joinedAt: {}, filter: "all", onFilterChange: () => undefined,
  }));
  assert.match(noPrice, /Цена группы не задана/);
  assert.match(noPrice, /href="\/owner\/payments\/prices\?group=g1"/); // «Задать цену группы»
});

test("e2e finding: the debt chip of the group header is read again after the price is set or a student leaves", () => {
  const view = read("src/components/groups/group-detail-view.tsx");
  assert.match(view, /\[debtEnabled, groupId, tab, debtTick\]/);
  assert.ok((view.match(/setDebtTick\(\(n\) => n \+ 1\)/g) ?? []).length >= 2);
});

// ── the group page on a 390 px phone (lead review 23.10: the active «Оплаты» tab cut at the edge, «⋯» alone under the title) ──

test("phone: the four tabs have short labels below sm (ids and the desktop names stay), the strip is full width and shows the active tab", () => {
  assert.deepEqual(Object.keys(G.GROUP_TAB_LABELS), ["students", "schedule", "attendance", "payments"]);
  assert.equal(G.GROUP_TAB_LABELS.attendance.full, "Посещаемость");
  assert.equal(G.GROUP_TAB_LABELS.attendance.short, "Журнал");
  assert.equal(G.GROUP_TAB_LABELS.payments.short, "Оплаты");
  // four short labels fit 358 px at 13 px: about 6 characters of the longest each side of the padding
  const widest = Math.max(...Object.values(G.GROUP_TAB_LABELS).map((l) => l.short.length));
  const total = Object.values(G.GROUP_TAB_LABELS).reduce((sum, l) => sum + l.short.length, 0);
  assert.ok(widest <= 10 && total * 7.2 + 4 * 16 + 12 + 8 <= 358, `the short labels are ${total} characters`);
  const view = read("src/components/groups/group-detail-view.tsx");
  assert.match(view, /<span className="sm:hidden">\{GROUP_TAB_LABELS\[key as Tab\]\.short\}<\/span>/);
  assert.match(view, /<span className="hidden sm:inline">\{GROUP_TAB_LABELS\[key as Tab\]\.full\}<\/span>/);
  assert.match(view, /data-testid="group-tabs" className="flex w-full max-w-full[^"]*sm:w-fit/);
  // a strip that still overflows scrolls the active tab into view
  assert.match(view, /ref=\{tabStrip\}/);
  assert.match(view, /querySelector<HTMLElement>\('\[aria-selected="true"\]'\)/);
  assert.match(view, /strip\.scrollLeft \+= over/);
});

test("phone: the «⋯» of the group header stays top-right of the title at every width (a row, not a column), only the archive button wraps", () => {
  const view = read("src/components/groups/group-detail-view.tsx");
  const line = view.split("\n").find((l) => l.includes('data-testid="group-header-row"'));
  assert.ok(line, "the header row exists");
  assert.match(line, /className=\{`flex items-start justify-between gap-3 \$\{group\.status === "archived" \? "flex-col sm:flex-row sm:gap-4" : "sm:gap-4"\}`\}/);
  assert.ok(!/flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between/.test(view), "the old column layout is gone");
  assert.match(view, /<div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">/);
  assert.match(view, /<div className="flex shrink-0 flex-wrap items-center gap-2">\s*\{group\.status === "archived"/);
});
