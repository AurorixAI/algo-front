/**
 * N13 P4 #105 «цена группы» and #104 «понятная зарплата» (frontend): the pure helpers of `group-price.ts` and
 * `payroll-help.ts`, the per-lesson prices of the sheet preview, the rendered screens (price block pieces, student card,
 * payroll sheet and month list) and the source contracts (no per-student fee input, no money for a teacher).
 */
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
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const rel = (file) => path.relative(root, file).replace(/\\/g, "/");
/** Normal spaces instead of the non-breaking ones: what the user reads. */
const plain = (text) => text.replace(/ /g, " ");
const textOf = (html) => plain(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const G = require(path.join(root, "src/lib/group-price.ts"));
const H = require(path.join(root, "src/lib/payroll-help.ts"));
const R = require(path.join(root, "src/lib/payroll.ts"));
const P = require(path.join(root, "src/lib/payments.ts"));

// ── group-price.ts: labels and descriptions ─────────────────────────────────────────────────────────────────

test("the price is named by the centre's mode and carries its unit", () => {
  assert.equal(G.priceLabelOf("calendar"), "Оплата в месяц");
  assert.equal(G.priceLabelOf("lessons"), "Стоимость пакета");
  assert.equal(plain(G.formatPrice(500000, "Оплата в месяц")), "500 000 сум/мес");
  assert.equal(plain(G.formatPrice(500000, "Стоимость пакета")), "500 000 сум за пакет");
  assert.equal(G.formatPrice(null, "Оплата в месяц"), "не задана");
  assert.equal(G.sinceText("2026-10-15"), "с 15.10.2026");
  assert.equal(G.sinceText(null), "");
  assert.equal(plain(G.priceBriefText({ amount: 450000, valid_from: "2026-10-01" })), "450 000 сум");
  assert.equal(G.priceBriefText(null), null);
});

test("what a student pays in a group: the price of the group, the individual one with its reason, or nothing", () => {
  const label = "Оплата в месяц";
  const group = G.membershipPriceView({ amount: 500000, source: "group", valid_from: "2000-01-01", group_amount: 500000, reason: null }, label);
  assert.equal(group.kind, "group");
  assert.equal(plain(group.text), "Цена группы: 500 000 сум/мес");
  assert.equal(group.note, null);

  const own = G.membershipPriceView({ amount: 400000, source: "override", valid_from: "2026-10-01", group_amount: 500000, reason: "Сестра ученика" }, label);
  assert.equal(own.kind, "override");
  assert.equal(own.title, "Индивидуальная цена");
  assert.equal(plain(own.text), "Индивидуальная цена: 400 000 сум/мес · Сестра ученика (цена группы 500 000 сум)");
  assert.equal(plain(own.note), "Сестра ученика · цена группы 500 000 сум");
  // the group has no price (yet): the exception says so
  assert.equal(plain(G.membershipPriceView({ amount: 400000, source: "override", valid_from: "2026-10-01", group_amount: null, reason: "Договорённость" }, label).note), "Договорённость · цена группы не задана");

  for (const none of [null, undefined, { amount: null, source: "none", valid_from: null, group_amount: null, reason: null }]) {
    const view = G.membershipPriceView(none, label);
    assert.equal(view.kind, "none");
    assert.equal(view.text, "Цена группы не задана");
    assert.equal(view.value, null);
  }
  // a package centre
  assert.equal(plain(G.membershipPriceView({ amount: 600000, source: "group", valid_from: null, group_amount: 600000, reason: null }, "Стоимость пакета").text), "Цена группы: 600 000 сум за пакет");
});

test("an older server has no `price`: the row is read from monthly_fee", () => {
  assert.deepEqual(G.priceOfRow({ monthly_fee: 450000 }), { amount: 450000, source: "group", valid_from: null, group_amount: 450000, reason: null });
  assert.equal(G.priceOfRow({ monthly_fee: null }).source, "none");
  const price = { amount: 1, source: "override", valid_from: null, group_amount: 2, reason: "x" };
  assert.equal(G.priceOfRow({ price, monthly_fee: 7 }), price);
  assert.equal(G.priceSourceTag(price), "индивидуальная цена");
  assert.equal(G.priceSourceTag({ ...price, source: "group" }), null);
  assert.equal(G.priceSourceTag(undefined), null);
});

test("links: the price block of a group, the groups without a price, the base of the group pages", () => {
  assert.equal(G.groupPriceHref("/owner/groups", "g1"), "/owner/groups/g1#price");
  assert.equal(G.groupPriceHref("/admin/groups/", "a b"), "/admin/groups/a%20b#price");
  assert.equal(G.groupsWithoutPriceHref("/owner/groups"), "/owner/groups?price=none");
  assert.equal(G.groupsBaseOf("/owner/payments"), "/owner/groups");
  assert.equal(G.parsePriceFilter("none"), "none");
  for (const other of [null, undefined, "", "all", "NONE"]) assert.equal(G.parsePriceFilter(other), "all");
});

test("a group «без цены»: only a money role sees the key; archived groups are not counted", () => {
  assert.equal(G.lacksGroupPrice({ price_current: null }), true);
  assert.equal(G.lacksGroupPrice({ price_current: { amount: 1, valid_from: "2026-10-01" } }), false);
  assert.equal(G.lacksGroupPrice({}), false); // the key is absent: a role without money
  assert.equal(G.countGroupsWithoutPrice([
    { status: "active", price_current: null },
    { status: "archived", price_current: null },
    { status: "active", price_current: { amount: 5, valid_from: "2026-10-01" } },
    { status: "active" },
  ]), 1);
});

// ── group-price.ts: the forms ───────────────────────────────────────────────────────────────────────────────

test("«Изменить цену»: a sum 0…10 000 000 000, a day from 2000-01-01 to a year ahead, a note up to 200", () => {
  const today = "2026-10-17";
  const form = (over) => G.checkGroupPriceForm({ amount: "500 000", validFrom: today, note: "", ...over }, today);
  assert.deepEqual(form({}), { error: null, request: { amount: 500000, valid_from: today } });
  assert.deepEqual(form({ note: "  Новый год  " }).request, { amount: 500000, valid_from: today, note: "Новый год" });
  assert.deepEqual(form({ amount: "0" }).request, { amount: 0, valid_from: today }); // free
  assert.equal(form({ amount: "10 000 000 000" }).error, null);
  assert.equal(form({ amount: "10 000 000 001" }).error, "Сумма слишком большая");
  assert.equal(form({ amount: "" }).error, "Укажите сумму");
  assert.equal(form({ amount: "" }).request, null);
  // dates: the borders of the server (2000-01-01 … today + 366 days)
  assert.deepEqual(G.priceDateRange(today), { min: "2000-01-01", max: "2027-10-18" });
  assert.equal(form({ validFrom: "2000-01-01" }).error, null);
  assert.match(form({ validFrom: "1999-12-31" }).error, /далеко в прошлом/);
  assert.equal(form({ validFrom: "2027-10-18" }).error, null);
  assert.match(form({ validFrom: "2027-10-19" }).error, /далеко в будущем/);
  assert.match(form({ validFrom: "" }).error, /Укажите дату/);
  assert.match(form({ note: "я".repeat(201) }).error, /не более 200/);
  assert.equal(form({ note: "я".repeat(200) }).error, null);
});

test("the dry run asks for the sum and the day only: the note does not change the consequences", () => {
  const a = G.checkGroupPriceForm({ amount: "500 000", validFrom: "2026-10-17", note: "a" }, "2026-10-17").request;
  const b = G.checkGroupPriceForm({ amount: "500 000", validFrom: "2026-10-17", note: "b" }, "2026-10-17").request;
  assert.equal(G.groupPriceKey(a), G.groupPriceKey(b));
  assert.notEqual(G.groupPriceKey(a), G.groupPriceKey(G.checkGroupPriceForm({ amount: "600 000", validFrom: "2026-10-17", note: "a" }, "2026-10-17").request));
  assert.notEqual(G.groupPriceKey(a), G.groupPriceKey(G.checkGroupPriceForm({ amount: "500 000", validFrom: "2026-10-18", note: "a" }, "2026-10-17").request));
  assert.equal(G.groupPriceKey(null), "");
});

test("an individual price needs a reason of 3…200 characters; «вернуть цену группы» needs none", () => {
  const today = "2026-10-17";
  const form = (over) => G.checkOverrideForm({ amount: "400 000", validFrom: today, reason: "Сестра ученика", ...over }, today);
  assert.deepEqual(form({}), { error: null, request: { amount: 400000, valid_from: today, reason: "Сестра ученика" } });
  assert.match(form({ reason: "" }).error, /причину/);
  assert.match(form({ reason: "  ab " }).error, /от 3 до 200/);
  assert.equal(form({ reason: "abc" }).error, null);
  assert.equal(form({ reason: "я".repeat(200) }).error, null);
  assert.match(form({ reason: "я".repeat(201) }).error, /не более 200/);
  assert.equal(form({ amount: "" }).error, "Укажите сумму");
  assert.match(form({ validFrom: "2000-01-01" }).error ?? "", /^$/);
  // back to the group price: a day, no sum, no reason
  assert.deepEqual(G.checkReturnForm(today, today), { error: null, request: { amount: null, valid_from: today } });
  assert.match(G.checkReturnForm("", today).error, /Укажите дату/);
  assert.match(G.checkReturnForm("1999-01-01", today).error, /прошлом/);
});

test("the individual price of an enrolment: off sends nothing, on needs a sum and a reason", () => {
  assert.deepEqual(G.checkEnrolOverride({ enabled: false, amount: "garbage", reason: "" }), { error: null, request: null });
  assert.deepEqual(G.checkEnrolOverride({ enabled: true, amount: "400 000", reason: " Скидка " }), { error: null, request: { amount: 400000, reason: "Скидка" } });
  assert.equal(G.checkEnrolOverride({ enabled: true, amount: "", reason: "Скидка" }).error, "Укажите сумму");
  assert.match(G.checkEnrolOverride({ enabled: true, amount: "1", reason: "" }).error, /причину/);
});

// ── group-price.ts: consequences of a change ────────────────────────────────────────────────────────────────

test("the consequences in the owner's words: who gets the price, whose individual price stays", () => {
  const t = (following, exceptions) => G.impactStudentsText({ students_following: following, students_with_override: exceptions });
  assert.equal(t(12, 2), "Цену получат 12 учеников; у 2 — индивидуальная цена, их не затронет");
  assert.equal(t(1, 1), "Цену получит 1 ученик; у 1 — индивидуальная цена, её не затронет");
  assert.equal(t(2, 0), "Цену получат 2 ученика");
  assert.equal(t(5, 0), "Цену получат 5 учеников");
  assert.equal(t(21, 0), "Цену получит 21 ученик");
  assert.equal(t(11, 0), "Цену получат 11 учеников");
  assert.equal(t(0, 3), "В группе пока нет учеников, которые получат эту цену; у 3 — индивидуальная цена, их не затронет");
  assert.equal(t(0, 0), "В группе пока нет учеников, которые получат эту цену");
});

test("saved payroll sheets that turn «данные изменились»: the owner gets the list, an administrator the count", () => {
  assert.equal(G.staleSheetsText({ stale_payroll_sheets: 0, stale_sheets: [] }), null);
  const owner = G.staleSheetsText({
    stale_payroll_sheets: 2,
    stale_sheets: [
      { sheet_id: "s1", month: "2026-09", teacher_id: "t1", teacher_name: "Иванова А." },
      { sheet_id: "s2", month: "2026-10", teacher_id: "t2", teacher_name: null },
    ],
  });
  assert.match(owner.text, /^Сохранённые ведомости зарплаты станут «данные изменились» \(2\)/);
  assert.deepEqual(owner.items.map(plain), ["Иванова А. — сентябрь 2026", "преподаватель — октябрь 2026"]);
  const admin = G.staleSheetsText({ stale_payroll_sheets: 3, stale_sheets: [] });
  assert.equal(admin.text, "Сохранённые ведомости зарплаты станут «данные изменились»: 3. Их надо будет пересчитать.");
  assert.deepEqual(admin.items, []);
  // a long list is cut
  const many = Array.from({ length: 9 }, (_, i) => ({ sheet_id: `s${i}`, month: "2026-09", teacher_id: `t${i}`, teacher_name: `Учитель ${i}` }));
  const cut = G.staleSheetsText({ stale_payroll_sheets: 9, stale_sheets: many });
  assert.equal(cut.items.length, 7);
  assert.equal(cut.items[6], "и ещё 3");
});

test("a past day warns that calculations change and payments never do; a future day says when it starts", () => {
  const warning = G.pastDateWarning("2026-09-01", "2026-10-17");
  assert.match(warning, /Дата в прошлом/);
  assert.match(warning, /с 01\.09\.2026/);
  assert.match(warning, /Уже внесённые оплаты не меняются никогда\./);
  assert.equal(G.pastDateWarning("2026-10-17", "2026-10-17"), null);
  assert.equal(G.pastDateWarning("2026-11-01", "2026-10-17"), null);
  assert.equal(G.pastDateWarning("", "2026-10-17"), null);
  assert.equal(G.futureDateNote("2026-11-01", "2026-10-17"), "Новая цена начнёт действовать с 01.11.2026; до этого дня остаётся прежняя.");
  assert.equal(G.futureDateNote("2026-10-17", "2026-10-17"), null);
});

// ── group-price.ts: history and the audit trail ─────────────────────────────────────────────────────────────

test("the audit trail of a group price: who, when (business clock), from what to what, the note", () => {
  const change = (over) => ({ at: "2026-10-17T09:05:00", actor_name: "Ахмедов", old_amount: 450000, new_amount: 500000, note: "Новый год", ...over });
  // `at` is naive UTC: 09:05 UTC is 14:05 in Tashkent
  assert.equal(plain(G.groupChangeLine(change({}))), "17.10.2026 14:05 · Ахмедов: 450 000 → 500 000 · Новый год");
  assert.equal(plain(G.groupChangeLine(change({ note: null }))), "17.10.2026 14:05 · Ахмедов: 450 000 → 500 000");
  assert.equal(plain(G.groupChangeLine(change({ note: "   " }))), "17.10.2026 14:05 · Ахмедов: 450 000 → 500 000");
  // the first price has nothing before it
  assert.equal(plain(G.groupChangeLine(change({ old_amount: null, note: null }))), "17.10.2026 14:05 · Ахмедов: не была задана → 500 000");
  // a write near midnight lands on the next business day
  assert.equal(plain(G.groupChangeLine(change({ at: "2026-10-17T19:30:00", note: null }))), "18.10.2026 00:30 · Ахмедов: 450 000 → 500 000");
  // an unknown writer / time (a row the migration made) never prints «null»
  assert.equal(plain(G.groupChangeLine(change({ actor_name: null }))), "17.10.2026 14:05: 450 000 → 500 000 · Новый год");
  assert.equal(plain(G.groupChangeLine(change({ at: null, actor_name: "Ахмедов", note: null }))), "Ахмедов: 450 000 → 500 000");
  assert.equal(plain(G.groupChangeLine(change({ at: null, actor_name: null, note: null }))), "450 000 → 500 000");
  // a price of 0 is a price: «бесплатно», never «0»
  assert.equal(plain(G.groupChangeLine(change({ new_amount: 0, note: null }))), "17.10.2026 14:05 · Ахмедов: 450 000 → бесплатно");
  assert.equal(plain(G.groupChangeLine(change({ old_amount: 0, note: null }))), "17.10.2026 14:05 · Ахмедов: бесплатно → 500 000");
  for (const text of [G.groupChangeLine(change({})), G.groupChangeLine(change({ old_amount: null, actor_name: null, at: null }))]) assert.doesNotMatch(text, /null|undefined|object/);
});

test("the audit trail of an individual price: what stood before, what stands now, the reason", () => {
  const change = (over) => ({ at: "2026-10-17T09:05:00", actor_name: "Ахмедов", old_amount: 500000, old_source: "group", new_amount: 400000, reason: "Сестра ученика", ...over });
  assert.equal(plain(G.overrideChangeLine(change({}))), "17.10.2026 14:05 · Ахмедов: цена группы 500 000 → индивидуальная 400 000 · Сестра ученика");
  // back to the price of the group
  assert.equal(plain(G.overrideChangeLine(change({ old_amount: 400000, old_source: "override", new_amount: null, reason: null }))), "17.10.2026 14:05 · Ахмедов: индивидуальная 400 000 → цена группы");
  // an exception changed to another sum
  assert.equal(plain(G.overrideChangeLine(change({ old_amount: 400000, old_source: "override", new_amount: 350000, reason: "Договорённость" }))), "17.10.2026 14:05 · Ахмедов: индивидуальная 400 000 → индивидуальная 350 000 · Договорённость");
  // nothing was in force before (the group had no price)
  assert.equal(plain(G.overrideChangeLine(change({ old_amount: null, old_source: "none" }))), "17.10.2026 14:05 · Ахмедов: цена не задана → индивидуальная 400 000 · Сестра ученика");
  assert.equal(plain(G.overrideChangeLine(change({ old_amount: null, old_source: null, actor_name: null, at: null, reason: null }))), "цена не задана → индивидуальная 400 000");
  // the reason of a return is shown when there is one
  assert.equal(plain(G.overrideChangeLine(change({ old_amount: 400000, old_source: "override", new_amount: null, reason: "Скидка закончилась" }))), "17.10.2026 14:05 · Ахмедов: индивидуальная 400 000 → цена группы · Скидка закончилась");
});

test("history rows: amount, start, state, note, author and the audit lines", () => {
  const rows = [
    { id: "3", amount: 600000, valid_from: "2026-11-01", note: null, created_by_name: "Владелец", created_at: "2026-10-17T09:30:00", is_current: false, is_future: true,
      changes: [{ at: "2026-10-17T09:30:00", actor_name: "Владелец", old_amount: null, new_amount: 600000, note: null }] },
    { id: "2", amount: 500000, valid_from: "2026-10-01", note: " Новый год ", created_by_name: "Админ", created_at: "2026-09-20T05:00:00", is_current: true, is_future: false,
      changes: [
        { at: "2026-09-21T05:00:00", actor_name: "Админ", old_amount: 480000, new_amount: 500000, note: "Новый год" },
        { at: "2026-09-20T05:00:00", actor_name: "Админ", old_amount: 450000, new_amount: 480000, note: null },
      ] },
    { id: "1", amount: 450000, valid_from: "2000-01-01", note: null, created_by_name: null, created_at: null, is_current: false, is_future: false, changes: [] },
  ];
  const views = G.historyViews(rows, "Оплата в месяц");
  assert.deepEqual(views.map((v) => [v.id, plain(v.amount), v.since, v.status]), [
    ["3", "600 000 сум/мес", "с 01.11.2026", "future"],
    ["2", "500 000 сум/мес", "с 01.10.2026", "current"],
    ["1", "450 000 сум/мес", "с самого начала", "past"],
  ]);
  assert.equal(views[1].note, "Новый год");
  assert.equal(views[0].author, "Владелец · 17.10.2026 14:30");
  assert.equal(views[2].author, "");
  // newest first, as the server sends them
  assert.deepEqual(views[1].changes.map(plain), [
    "21.09.2026 10:00 · Админ: 480 000 → 500 000 · Новый год",
    "20.09.2026 10:00 · Админ: 450 000 → 480 000",
  ]);
  assert.deepEqual(views[0].changes.map(plain), ["17.10.2026 14:30 · Владелец: не была задана → 600 000"]);
  assert.deepEqual(views[2].changes, []);
  // the individual-price history
  const row = { id: "a", amount: 400000, valid_from: "2026-10-15", reason: "Сестра", created_by_name: null, created_at: null, is_current: true, is_future: false, changes: [] };
  assert.equal(plain(G.overrideRowText(row, "Оплата в месяц")), "с 15.10.2026 — 400 000 сум/мес · Сестра");
  assert.equal(G.overrideRowText({ ...row, id: "b", amount: null, valid_from: "2026-11-20", reason: "лишнее", is_current: false, is_future: true }, "Оплата в месяц"), "с 20.11.2026 — цена группы");
});

test("the audit shapes are typed in api.ts and rendered by the screens, with nothing defensive left", () => {
  const api = read("src/lib/api.ts");
  assert.match(api, /export type \{ GroupPriceCancelled, GroupPriceChange, GroupPriceRow, PriceOverrideCancelled, PriceOverrideChange, PriceOverrideRow \} from "\.\/group-price";/);
  const lib = read("src/lib/group-price.ts");
  assert.doesNotMatch(lib, /describeChange|\bPriceChange\b|FIELD_WORDS/);
  for (const field of ["at: string | null;", "actor_name: string | null;", "old_amount: number | null;", "new_amount: number;", "note: string | null;", "old_source: PriceSource | null;", "new_amount: number | null;", "reason: string | null;"]) {
    assert.ok(lib.includes(field), field);
  }
  assert.match(lib, /groupChangeLine\(change, formatAt\)/);
  assert.match(lib, /formatAt: \(value: string \| null \| undefined\) => string = formatUtcNaiveAsBusinessDateTime/);
  assert.match(read("src/components/payments/membership-price.tsx"), /overrideChangeLine\(change\)/);
  assert.match(read("src/components/groups/group-price-block.tsx"), /historyViews\(data\.history, label, formatUtcNaiveAsBusinessDateTime\)/);
});

// ── group-price.ts: enrolment and transfer ──────────────────────────────────────────────────────────────────

test("an enrolment says which price the student takes; money roles only", () => {
  assert.equal(G.enrolPriceHint({ transfer: true, moneyAvailable: false }), null);
  assert.equal(G.enrolPriceHint({ transfer: false, moneyAvailable: false }), null);
  assert.equal(G.enrolPriceHint({ transfer: true, moneyAvailable: true }), "Ученик берёт цену новой группы; индивидуальная цена прежней группы не переносится");
  assert.equal(G.enrolPriceHint({ transfer: false, moneyAvailable: true }), "В новой группе ученик берёт цену этой группы");
  assert.equal(plain(G.targetGroupPriceText({ amount: 500000, valid_from: "2026-10-01" }, "Оплата в месяц")), "Цена группы: 500 000 сум/мес");
  assert.equal(G.targetGroupPriceText(null, "Оплата в месяц"), "Цена группы не задана");
  assert.equal(G.targetGroupPriceText(undefined, "Оплата в месяц"), null); // the key is absent: no money to show
  assert.equal(G.targetGroupPriceHint({ amount: 1, valid_from: "2026-10-01" }, 1), "Эту цену получит ученик");
  assert.equal(G.targetGroupPriceHint({ amount: 1, valid_from: "2026-10-01" }, 3), "Эту цену получат все добавляемые ученики");
  assert.match(G.targetGroupPriceHint(null, 1), /не подсказывается/);
  assert.equal(G.targetGroupPriceHint(undefined, 1), null);
});

// ── payroll: the price of a lesson, the preview of an edited line ───────────────────────────────────────────

test("the amount of a line whose price changed in the month: each lesson at its own price, rounded once", () => {
  // 2 lessons at 400 000 and 3 at 500 000, 50 %, D = 12: (800 000 + 1 500 000) x 0.5 / 12 = 95 833.33
  assert.equal(R.amountByPrices(5000, [[400000, 12], [400000, 12], [500000, 12], [500000, 12], [500000, 12]]), 95833);
  // the same sum with one price is the old formula
  assert.equal(R.amountByPrices(5000, [[450000, 12], [450000, 12]]), R.lineAmount({ fee: 450000, percentHundredths: 5000, divisor: 12, lessons: 2 }));
  // a lesson with no price or a price of 0 adds nothing; a mix of divisors is exact
  assert.equal(R.amountByPrices(5000, [[null, 12], [0, 12], [600000, 12]]), 25000);
  assert.equal(R.amountByPrices(5000, [[600000, 8], [600000, 12]]), 600000 * 0.5 / 8 + 600000 * 0.5 / 12);
  assert.equal(R.amountByPrices(0, [[600000, 12]]), 0);
  assert.equal(R.amountByPrices(5000, []), 0);

  // the real wire shape of a priced mark: `price_source` is set (a priced mark with no price that day carries "none")
  const marks = [
    { state: "counted", divisor: 12, price: 400000, price_source: "group" },
    { state: "counted", divisor: 12, price: 500000, price_source: "group" },
    { state: "unpaid", divisor: 12, price: 500000, price_source: "group" },
    { state: "excused_confirmed", divisor: null, price: null, price_source: null },
  ];
  const base = { fee: 500000, percentHundredths: 5000, marks, defaultDivisor: 12 };
  assert.equal(R.marksAmount({ ...base, includeUnpaid: false }), Math.round((400000 + 500000) * 0.5 / 12));
  assert.equal(R.marksAmount({ ...base, includeUnpaid: true }), Math.round((400000 + 500000 + 500000) * 0.5 / 12));
  // the owner's overwrite of the price replaces the price of EVERY lesson
  assert.equal(R.marksAmount({ ...base, fee: 700000, overridden: true, includeUnpaid: false }), Math.round(2 * 700000 * 0.5 / 12));
  // a priced mark with no price that day is worth nothing
  assert.equal(R.marksAmount({ ...base, marks: [{ state: "counted", divisor: 12, price: null, price_source: "none" }, { state: "counted", divisor: 12, price: 600000, price_source: "group" }], includeUnpaid: false }), 25000);
});

test("a mark of a sheet saved BEFORE #105 is not priced: the wire shape {price: null, price_source: null} is worth source_fee", () => {
  // the API serialises the missing fields as nulls: `price === undefined` can never tell an old mark from a priced one
  assert.equal(R.isPricedMark({ price: null, price_source: null }), false);
  assert.equal(R.isPricedMark({}), false);
  assert.equal(R.isPricedMark({ price: null, price_source: "none" }), true);
  assert.equal(R.isPricedMark({ price: 5, price_source: "override" }), true);
  const wire = (date) => ({ date, lesson_id: `l-${date}`, mark: 1, state: "counted", divisor: 12, price: null, price_source: null });
  const dates = ["2026-09-01", "2026-09-03", "2026-09-08", "2026-09-10", "2026-09-15"];
  const line = {
    membership_id: "m1", student_id: "s1", student_name: "Каримова Дилноза", display_id: null, group_id: "g1", group_name: "Алгебра 8А", lesson_type: "group", lesson_time: null,
    monthly_fee: 500000, source_fee: 500000, fee_overridden: false, price_source: null, price_changed: false, price_steps: [], no_price_lessons: null, unpaid_due: null,
    percent: "50", divisor: 12, marks: dates.map(wire), counted: 5, unpaid: 0, pending_excused: 0, include_unpaid: false, amount: 104167, warnings: [],
  };
  const sheet = {
    id: "s", saved: true, month: "2026-09", period_start: "2026-09-01", period_end: "2026-09-30", month_open: false, teacher_id: "t1", teacher_name: "Иванов", revision: 1,
    percents: { group: "50" }, divisor_default: 12, lines: [line],
    groups: [{ group_id: "g1", group_name: "Алгебра 8А", lesson_type: "group", lesson_time: null, percent: "50", dates: line.marks.map((m) => ({ date: m.date, lesson_id: m.lesson_id })), line_count: 1, counted: 5, unpaid: 0, total_amount: 104167 }],
    total_amount: 104167, counted_total: 5, unpaid_total: 0, pending_excused_total: 0, warnings: { open_lessons: null, pending_excused: 0, no_fee: 0, unpaid: 0 },
    source_fingerprint: "f", stale: false, note: null, created_by_name: null, created_at: null, updated_by_name: null, updated_at: null,
  };
  // 50 -> 60 %: 5 lessons at source_fee 500 000 / 12 x 0.6 = 125 000 (the server's recompute_line) - NOT 0
  const edited = R.buildLineViews(sheet, R.setPercentEdit(R.EMPTY_EDITS, sheet, "group", "60"))[0];
  assert.equal(edited.amount, 125000);
  assert.equal(R.sheetTotal(sheet, R.buildLineViews(sheet, R.setPercentEdit(R.EMPTY_EDITS, sheet, "group", "60")), R.setPercentEdit(R.EMPTY_EDITS, sheet, "group", "60")), 125000);
  // the same line after a reset of an overwrite, and with an overwrite of the price
  assert.equal(R.buildLineViews(sheet, R.setFeeEdit(R.EMPTY_EDITS, sheet, "m1", 600000))[0].amount, Math.round(5 * 600000 * 0.5 / 12));
  const overwritten = { ...sheet, lines: [{ ...line, fee_overridden: true, monthly_fee: 600000 }] };
  assert.equal(R.buildLineViews(overwritten, R.setFeeEdit(R.EMPTY_EDITS, overwritten, "m1", null))[0].amount, 104167);
  // «начислить» on a line of an old sheet: the unpaid lesson is worth source_fee too
  const withUnpaid = { ...sheet, lines: [{ ...line, marks: [...line.marks, { ...wire("2026-09-17"), state: "unpaid" }], unpaid: 1 }] };
  const included = R.buildLineViews(withUnpaid, R.setIncludeEdit(R.EMPTY_EDITS, withUnpaid, "m1", true))[0];
  assert.equal(included.amount, Math.round(6 * 500000 * 0.5 / 12));
});

test("an edited line of a sheet with a price step is previewed per lesson", () => {
  const mark = (date, price, state = "counted") => ({ date, lesson_id: `l-${date}`, mark: 1, state, divisor: 12, price, price_source: "group" });
  const line = {
    membership_id: "m1", student_id: "s1", student_name: "Каримова Дилноза", display_id: null, group_id: "g1", group_name: "Алгебра 8А", lesson_type: "group", lesson_time: null,
    monthly_fee: 500000, source_fee: 500000, fee_overridden: false, price_source: "group", price_changed: true,
    price_steps: [{ date: "2026-10-01", amount: 400000 }, { date: "2026-10-15", amount: 500000 }], no_price_lessons: 0, unpaid_due: 0,
    percent: "50", divisor: 12,
    marks: [mark("2026-10-01", 400000), mark("2026-10-08", 400000), mark("2026-10-15", 500000), mark("2026-10-22", 500000), mark("2026-10-29", 500000)],
    counted: 5, unpaid: 0, pending_excused: 0, include_unpaid: false, amount: 95833, warnings: [],
  };
  const sheet = {
    id: "s", saved: true, month: "2026-10", period_start: "2026-10-01", period_end: "2026-10-31", month_open: false, teacher_id: "t1", teacher_name: "Иванов",
    revision: 1, percents: { group: "50" }, divisor_default: 12, lines: [line],
    groups: [{ group_id: "g1", group_name: "Алгебра 8А", lesson_type: "group", lesson_time: null, percent: "50", dates: line.marks.map((m) => ({ date: m.date, lesson_id: m.lesson_id })), line_count: 1, counted: 5, unpaid: 0, total_amount: 95833 }],
    total_amount: 95833, counted_total: 5, unpaid_total: 0, pending_excused_total: 0, warnings: { open_lessons: null, pending_excused: 0, no_fee: 0, unpaid: 0 },
    source_fingerprint: "f", stale: false, note: null, created_by_name: null, created_at: null, updated_by_name: null, updated_at: null,
  };
  // the percent goes from 50 to 60: 2 x 400 000 + 3 x 500 000 at 60 % / 12 = 115 000 (not 5 x 500 000)
  const edits = R.setPercentEdit(R.EMPTY_EDITS, sheet, "group", "60");
  assert.equal(R.buildLineViews(sheet, edits)[0].amount, 115000);
  // an overwrite of the price on the sheet is one sum for every lesson
  const overwritten = R.buildLineViews(sheet, R.setFeeEdit(R.EMPTY_EDITS, sheet, "m1", 600000))[0];
  assert.equal(overwritten.amount, Math.round(5 * 600000 * 0.5 / 12));
  // and a reset goes back to the prices of the lessons
  const reset = { ...sheet, lines: [{ ...line, fee_overridden: true, monthly_fee: 600000 }] };
  assert.equal(R.buildLineViews(reset, R.setFeeEdit(R.EMPTY_EDITS, reset, "m1", null))[0].amount, 95833);
  // a missing price on part of the lessons is said, with the number
  const partial = R.buildLineViews({ ...sheet, lines: [{ ...line, no_price_lessons: 2 }] }, R.EMPTY_EDITS)[0];
  assert.deepEqual(R.lineNotes(partial), ["Цена не задана на 2 урока месяца"]);
  const none = R.buildLineViews({ ...sheet, lines: [{ ...line, monthly_fee: null, source_fee: null }] }, R.EMPTY_EDITS)[0];
  assert.deepEqual(R.lineNotes(none), ["Не задана цена группы"]);
});

// ── payroll-help.ts ─────────────────────────────────────────────────────────────────────────────────────────

test("each status of a teacher's month has a short explanation", () => {
  const none = H.statusHint(null);
  assert.match(none, /ещё не сохранена/);
  assert.match(none, /«Рассчитать»/);
  const saved = H.statusHint({ revision: 2, stale: false });
  assert.match(saved, /редакция 2/);
  assert.match(saved, /данные не менялись/);
  const stale = H.statusHint({ revision: 3, stale: true });
  assert.match(stale, /редакция 3/);
  assert.match(stale, /изменились посещаемость, оплаты, подтверждения пропусков или цены/);
  assert.match(stale, /«Пересчитать»/);
  assert.equal(new Set([none, saved, stale]).size, 3);
  assert.deepEqual(H.savedRevisionLine(2).text, "Уже сохранена: редакция 2. Новое сохранение создаст редакцию 3.");
  assert.match(H.savedRevisionLine(2).hint, /Прежняя редакция останется в истории/);
});

test("every warning of the month is a link with a meaning and an action", () => {
  const views = R.warningViews({ open_lessons: 1, pending_excused: 2, no_fee: 4, unpaid: 140 });
  const byKey = Object.fromEntries(views.map((v) => [v.key, v]));
  assert.equal(byKey.open_lessons.href, "/owner/attendance?tab=open");
  assert.equal(byKey.open_lessons.target, "Посещаемость → Незакрытые уроки");
  assert.equal(byKey.no_fee.text, "не задана цена: 4");
  assert.equal(byKey.no_fee.href, "/owner/groups?price=none");
  assert.equal(byKey.unpaid.text, "140 уроков не оплачено");
  assert.equal(byKey.unpaid.hint, "Ученики были на уроках, но эти уроки не покрыты оплатой — в сумму не входят. Их можно начислить в ведомости.");
  assert.match(byKey.open_lessons.hint, /не попадёт в расчёт/);
  assert.match(byKey.pending_excused.hint, /пока ждёт решения, урок засчитывается/);
  for (const view of views) assert.ok(view.hint.length > 20 && view.target, view.key);
});

test("the sheet's own words: the dashed «1», «начислить», «Не оплачено»", () => {
  assert.equal(R.UNPAID_MARK_HINT, "Был на уроке, урок не оплачен — не входит в сумму");
  assert.equal(R.markCell(1, "unpaid", {}).title, R.UNPAID_MARK_HINT);
  assert.equal(R.markCell(1, "unpaid", { includeUnpaid: true }).title, R.UNPAID_INCLUDED_MARK_HINT);
  assert.equal(H.INCLUDE_LABEL, "начислить");
  assert.equal(H.INCLUDE_HINT, "Начислить преподавателю и за неоплаченные уроки этого ученика");
  assert.match(H.UNPAID_HEADER_HINT, /не оплачен|не покрыты оплатой/);
  const legend = Object.fromEntries(H.SHEET_LEGEND.map((item) => [item.key, item.text]));
  assert.equal(legend.unpaid, "был на уроке, урок не оплачен — не входит в сумму");
  assert.deepEqual(H.SHEET_LEGEND.map((item) => item.key), ["counted", "zero", "pending", "unpaid", "empty"]);
});

test("the price of a line: who sets it and where it changed", () => {
  assert.equal(H.priceSourceNote({ price_source: "override", fee_overridden: false }), "индивидуальная");
  assert.equal(H.priceSourceNote({ price_source: "group", fee_overridden: false }), null);
  assert.equal(H.priceSourceNote({ price_source: "override", fee_overridden: true }), null); // the owner's overwrite has its own note
  assert.equal(H.priceSourceNote({}), null);
  assert.equal(plain(H.priceStepText({ date: "2026-10-15", amount: 500000 })), "с 15.10 — 500 000");
  assert.equal(H.priceStepText({ date: "2026-10-01", amount: null }), "с 01.10 — цена не задана");
  const steps = [{ date: "2026-10-01", amount: 400000 }, { date: "2026-10-15", amount: 500000 }];
  assert.deepEqual(H.priceStepsLines({ price_changed: true, price_steps: steps, fee_overridden: false }).map(plain), ["с 01.10 — 400 000", "с 15.10 — 500 000"]);
  assert.deepEqual(H.priceStepsLines({ price_changed: false, price_steps: [], fee_overridden: false }), []);
  assert.deepEqual(H.priceStepsLines({ price_changed: true, price_steps: steps, fee_overridden: true }), []);
  assert.deepEqual(H.priceStepsLines({}), []);
});

test("«Как считается зарплата»: the formula in words and one example whose arithmetic is the sheet's", () => {
  const example = H.payrollExample(12);
  // 600 000 x 50 % / 12 x 3 = 75 000
  assert.equal(example.amount, 75000);
  assert.equal(example.amount, R.lineAmount({ fee: 600000, percentHundredths: 5000, divisor: 12, lessons: 3 }));
  assert.equal(plain(example.text), "600 000 сум × 50 % ÷ 12 × 3 урока = 75 000 сум");
  assert.equal(H.payrollExample(8).amount, 112500);
  const lines = H.howItWorksLines(12);
  assert.ok(lines.length >= 4);
  assert.match(lines[0], /÷ 12/);
  assert.ok(lines.some((line) => /пунктирная «1»/.test(line)));
  assert.ok(lines.some((line) => /день каждого урока/.test(line)));
  assert.ok(lines.some((line) => /«начислить»/.test(line)));
  assert.match(H.howItWorksLines(10)[0], /÷ 10/);
});

// ── rendered screens ────────────────────────────────────────────────────────────────────────────────────────

function priceRow(over = {}) {
  return {
    membership_id: "m1", student_id: "s1", student_name: "Каримова Дилноза", display_id: "A-1", class_level: 8, group_id: "g1", group_name: "Алгебра 8А",
    teacher_id: "t1", teacher_name: "Иванов", is_primary: true, is_active: true,
    price: { amount: 500000, source: "group", valid_from: "2026-10-01", group_amount: 500000, reason: null }, monthly_fee: 500000,
    status: "active", period_mode: "calendar", paid_until: "2026-10-31", days_overdue: null, days_left: 14, lessons_total: null, lessons_used: null, lessons_left: null, last_payment: null,
    ...over,
  };
}

test("the student card shows the price in one line with no field to type it; the exception has its actions in «⋯»", () => {
  // the card of a group uses the router (the receipt page): a stub is enough for a static render
  const navigation = require.resolve("next/navigation");
  require(navigation);
  require.cache[navigation].exports = { ...require(navigation), useRouter: () => ({ push() {}, replace() {}, refresh() {} }) };
  const { MembershipPayments } = require(path.join(root, "src/components/payments/membership-payments.tsx"));
  const html = (row, editable = true, mode = "calendar") => renderToStaticMarkup(React.createElement(MembershipPayments, {
    row: { ...row, is_active: editable }, heading: React.createElement("span", null, "Алгебра 8А"),
    studentName: "Каримова Дилноза", periodMode: mode, lessonsDefault: null, paymentsBasePath: "/owner/payments", groupsBasePath: "/owner/groups",
    onRowChange: () => {}, onNotify: () => {},
  }));
  const priceOf = (markup) => {
    const found = /<p[^>]*data-testid="membership-price"[^>]*>([\s\S]*?)<\/p>/.exec(markup);
    return found ? textOf(found[0]) : "";
  };

  const group = html(priceRow());
  assert.equal(textOf(priceOf(group)), "Цена 500 000 сум/мес · цена группы");
  assert.doesNotMatch(group, /<input(?![^>]*type="file")/); // nothing to type per student (the cheque picker is a hidden file input)
  assert.equal(priceOf(html(priceRow(), true, "lessons")), "Цена 500 000 сум за пакет · цена группы");
  // rare actions are not on the card: they are in the «⋯» menu (rendered when it is opened)
  assert.doesNotMatch(textOf(group), /Назначить индивидуальную цену|Вернуть цену группы|История цены|История оплат/);
  assert.match(group, /aria-label="Действия по оплате: Алгебра 8А"/);

  const own = html(priceRow({ price: { amount: 400000, source: "override", valid_from: "2026-10-05", group_amount: 500000, reason: "Сестра ученика" } }));
  assert.equal(priceOf(own), "Индивидуальная цена 400 000 сум/мес · Сестра ученика");
  assert.match(plain(own), /title="Цена группы 500 000 сум"/); // the group's price stays one hover away

  const none = html(priceRow({ price: { amount: null, source: "none", valid_from: null, group_amount: null, reason: null }, monthly_fee: null }));
  assert.match(textOf(none), /Цена группы не задана/);
  assert.match(none, /href="\/owner\/groups\/g1#price"/);
  assert.match(textOf(none), /Задать цену группы/);

  // an archived student / a closed membership: the price is shown, nothing can be changed (no status, no main button)
  const readOnly = textOf(html(priceRow({ price: { amount: 400000, source: "override", valid_from: null, group_amount: 500000, reason: "Сестра" } }), false));
  assert.match(readOnly, /Индивидуальная цена 400 000 сум\/мес · Сестра/);
  assert.doesNotMatch(readOnly, /Внести оплату|Продлить|Оплачено/);
  // status chip + one main button by the situation of the row
  assert.match(textOf(html(priceRow({ last_payment: { id: "p" } }))), /Оплачено .*оплачено до 31\.10\.2026 .*Продлить/);
  assert.match(textOf(html(priceRow())), /Оплачено .*оплачено до 31\.10\.2026 .*Внести оплату/); // never paid: «Внести оплату»
  const overdue = textOf(html(priceRow({ status: "expired", days_overdue: 31, days_left: null, last_payment: { id: "p" } })));
  assert.match(overdue, /Просрочено на 31 день .*оплачено до 31\.10\.2026 .*Внести оплату/);
  assert.doesNotMatch(overdue, /дн\./);
});

test("the «⋯» menu of the card offers the price actions in order, and nothing to a membership that cannot change", () => {
  const price = { amount: 400000, source: "override", valid_from: "2026-10-05", group_amount: 500000, reason: "Сестра" };
  const scheduled = { id: "soon", amount: 350000, valid_from: "2026-11-20", reason: "Договорённость", created_by_name: null, created_at: null, is_current: false, is_future: true, changes: [] };
  const labels = (editable, p, h) => G.priceMenuActions(editable, p, h).map((a) => a.label);
  assert.deepEqual(labels(true, { ...price, source: "group" }, []), ["Назначить индивидуальную цену"]);
  assert.deepEqual(labels(true, price, [scheduled]), ["Назначить индивидуальную цену", "Вернуть цену группы", "Отменить запланированную индивидуальную цену"]);
  assert.deepEqual(labels(false, price, [scheduled]), []);
  assert.deepEqual(labels(false, null, null), []);
});

test("a group card shows its price to a money role and nothing to anybody else", () => {
  const { GroupCard } = require(path.join(root, "src/components/groups/group-card.tsx"));
  const base = { id: "g1", org_id: "o", name: "Алгебра 8А", class_level: 8, teacher_id: "t", teacher_name: "Иванов", description: null, status: "active", max_students: 20, student_count: 5, created_at: null };
  const html = (group) => renderToStaticMarkup(React.createElement(GroupCard, { group, href: "/owner/groups/g1" }));
  const priced = html({ ...base, price_current: { amount: 500000, valid_from: "2026-10-01" } });
  assert.match(textOf(priced), /500 000 сум\/мес/);
  const unset = html({ ...base, price_current: null });
  assert.match(textOf(unset), /Цена не задана/);
  assert.match(unset, /href="\/owner\/groups\/g1#price"/);
  // a teacher's list has no `price_current`: not a word about money
  const teacher = html(base);
  assert.doesNotMatch(textOf(teacher), /сум|Цена/);
  assert.doesNotMatch(teacher, /group-card-price/);
});

test("the payroll sheet: legend above the table, tooltips, «начислить», the price and its steps", () => {
  const { PayrollSheetTable } = require(path.join(root, "src/components/payroll/sheet-table.tsx"));
  const mark = (date, state, price, source = "group") => ({ date, lesson_id: `l-${date}`, mark: state === "excused_confirmed" ? 0 : 1, state, divisor: 12, price, price_source: source });
  const marks = [mark("2026-10-01", "counted", 400000), mark("2026-10-15", "counted", 500000), mark("2026-10-22", "unpaid", 500000)];
  const line = {
    membership_id: "m1", student_id: "s1", student_name: "Каримова Дилноза", display_id: null, group_id: "g1", group_name: "Алгебра 8А", lesson_type: "group", lesson_time: null,
    monthly_fee: 500000, source_fee: 500000, fee_overridden: false, price_source: "override", price_changed: true,
    price_steps: [{ date: "2026-10-01", amount: 400000 }, { date: "2026-10-15", amount: 500000 }], no_price_lessons: 0, unpaid_due: 1,
    percent: "50", divisor: 12, marks, counted: 2, unpaid: 1, pending_excused: 0, include_unpaid: false, amount: 37500, warnings: [],
  };
  const sheet = {
    id: "s", saved: true, month: "2026-10", period_start: "2026-10-01", period_end: "2026-10-31", month_open: false, teacher_id: "t1", teacher_name: "Иванов", revision: 1,
    percents: { group: "50" }, divisor_default: 12, lines: [line],
    groups: [{ group_id: "g1", group_name: "Алгебра 8А", lesson_type: "group", lesson_time: null, percent: "50", dates: marks.map((m) => ({ date: m.date, lesson_id: m.lesson_id })), line_count: 1, counted: 2, unpaid: 1, total_amount: 37500 }],
    total_amount: 37500, counted_total: 2, unpaid_total: 1, pending_excused_total: 0, warnings: { open_lessons: null, pending_excused: 0, no_fee: 0, unpaid: 1 },
    source_fingerprint: "f", stale: false, note: null, created_by_name: null, created_at: null, updated_by_name: null, updated_at: null,
  };
  const html = renderToStaticMarkup(React.createElement(PayrollSheetTable, { sheet, edits: R.EMPTY_EDITS, editable: true, onEdits: () => {} }));
  const text = textOf(html);
  // the legend is ABOVE the first table, and says what the dashed «1» is
  assert.ok(html.indexOf('aria-label="Обозначения"') >= 0 && html.indexOf('aria-label="Обозначения"') < html.indexOf("<table"));
  assert.match(text, /был на уроке, урок не оплачен — не входит в сумму/);
  assert.match(text, /Неоплаченные уроки входят в сумму строки, только если отметить «начислить»/);
  assert.doesNotMatch(text, /включить|включены/);
  // «начислить» with its tooltip, the unpaid header and cell with theirs (read by a screen reader too)
  assert.match(text, /начислить/);
  assert.ok(text.includes("Начислить преподавателю и за неоплаченные уроки этого ученика"));
  assert.ok(text.includes("Уроки, на которых ученик был, но которые не покрыты оплатой"));
  assert.ok(text.includes(R.UNPAID_MARK_HINT));
  assert.match(html, /aria-label="Начислить за неоплаченные уроки \(1\): Каримова Дилноза, Алгебра 8А"/);
  // the price: whose it is and where it changed
  assert.match(html, />индивидуальная<\/span>/);
  assert.match(text, /цена менялась/);
  assert.match(text, /с 01\.10 — 400 000/);
  assert.match(text, /с 15\.10 — 500 000/);
  // a line whose price did not change shows none of it
  const calmHtml = renderToStaticMarkup(React.createElement(PayrollSheetTable, {
    sheet: { ...sheet, lines: [{ ...line, price_source: "group", price_changed: false, price_steps: [] }] }, edits: R.EMPTY_EDITS, editable: true, onEdits: () => {},
  }));
  assert.doesNotMatch(textOf(calmHtml), /цена менялась|с 01\.10 —/);
  assert.doesNotMatch(calmHtml, />индивидуальная<\/span>/);
  // printed (read-only): the words of the state, not a checkbox
  const printed = renderToStaticMarkup(React.createElement(PayrollSheetTable, { sheet, edits: R.EMPTY_EDITS, editable: false }));
  assert.match(textOf(printed), /не начислены/);
  assert.doesNotMatch(printed, /<input/);
});

test("the month list: a status chip with its explanation, warnings with links and meanings, the formula", () => {
  const { TeacherRow } = require(path.join(root, "src/components/payroll/payroll-month-page.tsx"));
  const { PayrollHowItWorksBody } = require(path.join(root, "src/components/payroll/how-it-works.tsx"));
  const teacher = {
    teacher_id: "t1", teacher_name: "Иванов Пётр", lessons_count: 12,
    lesson_types: [{ lesson_type: "group", groups: 2, suggested_percent: "50" }],
    sheet: { id: "s1", revision: 2, total_amount: 900000, stale: true, updated_at: "2026-10-02T08:00:00" },
    warnings: { open_lessons: 1, pending_excused: 0, no_fee: 2, unpaid: 140 },
  };
  const html = renderToStaticMarkup(React.createElement(TeacherRow, {
    teacher, typed: {}, showErrors: false, selected: false, calculating: false,
    onToggle: () => {}, onType: () => {}, onCalculate: () => {}, onOpen: () => {}, onExport: () => {},
  }));
  const text = textOf(html);
  assert.ok(text.includes("данные изменились"));
  assert.ok(text.includes(H.statusHint(teacher.sheet))); // the explanation is read by a screen reader and shown on hover / tap
  assert.match(html, /href="\/owner\/attendance\?tab=open"[^>]*>1 незакрытый урок</);
  assert.match(html, /href="\/owner\/groups\?price=none"[^>]*>не задана цена: 2</);
  assert.match(html, /href="\/owner\/payments\?bucket=due"[^>]*>140 уроков не оплачено</);
  assert.ok(text.includes("Ученики были на уроках, но эти уроки не покрыты оплатой — в сумму не входят. Их можно начислить в ведомости."));
  // a sheet that was never calculated
  const fresh = textOf(renderToStaticMarkup(React.createElement(TeacherRow, {
    teacher: { ...teacher, sheet: null, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 } }, typed: {}, showErrors: false, selected: false, calculating: false,
    onToggle: () => {}, onType: () => {}, onCalculate: () => {}, onOpen: () => {}, onExport: () => {},
  })));
  assert.ok(fresh.includes("не рассчитано"));
  assert.ok(fresh.includes(H.statusHint(null)));
  // the formula with the example: the body of the dialog «Как считается зарплата» (UX-1 C: no accordion over the table any more)
  const how = renderToStaticMarkup(React.createElement(PayrollHowItWorksBody, { divisor: 12 }));
  assert.doesNotMatch(how, /<details/);
  assert.ok(textOf(how).includes("Оплата в месяц × % ÷ 12 × засчитанные уроки"));
  assert.ok(textOf(how).includes("600 000 сум × 50 % ÷ 12 × 3 урока = 75 000 сум"));
  assert.match(read("src/components/payroll/how-it-works.tsx"), /title=\{HOW_TITLE\}/);
  assert.equal(H.HOW_TITLE, "Как считается зарплата");
});

// ── source contracts ────────────────────────────────────────────────────────────────────────────────────────

const sources = walk(path.join(root, "src")).filter((f) => /\.(tsx?|jsx?)$/.test(f));

test("the per-student fee is gone: no input, no call of the retired endpoint, no `monthly_fee` sent", () => {
  const api = read("src/lib/api.ts");
  assert.doesNotMatch(api, /setMembershipFee/);
  assert.doesNotMatch(api, /memberships\/\$\{[^}]+\}\/fee/);
  // the enrolment sends the exception only, never `monthly_fee` (the server answers 422)
  const enrol = api.slice(api.indexOf("addStudentToGroup:"), api.indexOf("// ── Schedule"));
  assert.match(enrol, /price_override/);
  assert.doesNotMatch(enrol, /monthly_fee/);
  for (const file of sources) {
    const text = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(text, /setMembershipFee|setFeeText|setEditingFee|startFeeEdit|saveFee\b/, rel(file));
  }
  // the fields that used to take a fee
  for (const file of ["src/components/groups/add-student-drawer.tsx", "src/components/payments/payments-page.tsx", "src/components/payments/membership-payments.tsx", "src/components/groups/assign-group-modal.tsx"]) {
    assert.doesNotMatch(read(file), /Оплата в месяц, сум|Стоимость пакета, сум|add-student-fee|-fee`/, file);
  }
  // the enrolment dialogs offer the exception only to a role that sees money
  assert.match(read("src/components/groups/add-student-drawer.tsx"), /moneyAvailable[\s\S]*?checkEnrolOverride/);
  assert.match(read("src/components/groups/assign-group-modal.tsx"), /moneyAvailable[\s\S]*?checkEnrolOverride/);
});

test("the group page shows the price block only when the group carries `price_current` (money roles)", () => {
  for (const role of ["owner", "admin"]) {
    const page = read(`src/app/${role}/groups/[id]/page.tsx`);
    assert.match(page, /\{"price_current" in group && \(\s*<GroupPriceBlock/, role);
    assert.match(page, /groupPrice=\{group\.price_current\}/, role);
    const list = read(`src/app/${role}/groups/page.tsx`);
    assert.match(list, /GroupPriceFilter/, role);
    assert.match(list, /parsePriceFilter\(searchParams\?\.get\("price"\)\)/, role);
  }
  assert.match(read("src/components/groups/group-card.tsx"), /const showPrice = "price_current" in group && !\(group\.status === "archived" && group\.price_current === null\);/);
});

test("no money for a teacher: the teacher screens never touch a price", () => {
  const teacherFiles = sources.filter((f) => rel(f).startsWith("src/app/teacher/"));
  assert.ok(teacherFiles.length > 5);
  for (const file of teacherFiles) {
    const text = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(text, /price_current|group-price|GroupPriceBlock|MembershipPriceSection|priceOfRow|getGroupPrices|setGroupPrice|getMembershipPrice|setMembershipPrice|monthly_fee/, rel(file));
  }
  // the components a teacher's group page and student card use
  for (const file of ["src/components/groups/group-student-table.tsx", "src/components/groups/group-stats-panel.tsx", "src/components/students/student-groups-block.tsx"]) {
    assert.doesNotMatch(read(file), /price|monthly_fee|сум/i, file);
  }
  // the student card asks for money only when it is a money role (existing rule) and the price section lives inside that block
  assert.match(read("src/components/students/student-payments-block.tsx"), /const moneyEnabled = !isTeacher && !DEMO_MODE && available;/);
  assert.match(read("src/components/students/student-payments-block.tsx"), /if \(!moneyEnabled\) return null;/);
  // the group card shows a price only for the key a money role gets; a teacher's list never has it
  assert.match(read("src/components/groups/group-card.tsx"), /"price_current" in group/);
  // the price endpoints are called from money-only screens
  for (const file of sources) {
    const text = fs.readFileSync(file, "utf8");
    if (!/getGroupPrices|setGroupPrice\(|getMembershipPrice|setMembershipPrice/.test(text) || rel(file) === "src/lib/api.ts") continue;
    assert.match(rel(file), /^src\/components\/(groups|payments)\//, rel(file));
  }
});

test("the payroll warnings and tooltips are wired to the screens", () => {
  const controls = read("src/components/payroll/sheet-controls.tsx");
  assert.match(controls, /<StatusChip status=\{status\}|export function StatusChip\(\{ status, hint \}/);
  assert.match(read("src/components/payroll/payroll-month-page.tsx"), /<StatusChip status=\{status\} hint=\{statusHint\(teacher\.sheet\)\} \/>/);
  assert.match(read("src/components/payroll/payroll-month-page.tsx"), /<PayrollMonthStatus month=\{month\} open=\{monthOpen\} divisor=\{overview\.divisor\} \/>/);
  assert.match(read("src/components/payroll/payroll-sheet-page.tsx"), /<PayrollMonthStatus\s+month=\{sheet\.month\}[\s\S]*?divisor=\{sheet\.divisor_default\}/);
  assert.match(read("src/components/payroll/month-status.tsx"), /<PayrollHowItWorksDialog open=\{helpOpen\} divisor=\{divisor\}/);
  assert.match(controls, /<Hint text=\{view\.hint\}/);
  // the saved-revision banner is one line
  const month = read("src/components/payroll/payroll-month-page.tsx");
  const banner = month.slice(month.indexOf("{activeExisting && ("), month.indexOf("{active.conflict && ("));
  assert.match(banner, /savedRevisionLine\(activeExisting\.revision\)\.text/);
  assert.doesNotMatch(banner, /сохранение создаст новую редакцию, прежние правки/);
});

test("the payment forms: «Цена группы не задана» with a link, one-off sum only through the quote", () => {
  const modal = read("src/components/payments/payment-form-modal.tsx");
  assert.match(modal, /quoteLacksPrice\(fresh\) && groupsBasePath && membership\.group_id/);
  assert.match(modal, /groupPriceHref\(groupsBasePath, membership\.group_id\)/);
  const page = read("src/components/payments/payments-page.tsx");
  assert.match(page, /цена группы не задана/);
  assert.doesNotMatch(page, /не задана<\/span>/);
  assert.match(page, /priceSourceTag\(price\)/);
  assert.equal(P.PRICE_NOT_SET_TEXT, "Цена группы не задана — введите сумму вручную");
});

test("«Изменить цену»: «Сохранить» waits for the consequences of exactly this sum and day; a conflict reloads", () => {
  const dialog = read("src/components/groups/group-price-dialog.tsx");
  // the question for the consequences is the dry run, with the sum and the day only
  assert.match(dialog, /orgApi\.setGroupPrice\(groupId, asked, \{ dryRun: true \}\)/);
  assert.match(dialog, /const asked = \{ amount: check\.request\.amount, valid_from: check\.request\.valid_from \};/);
  // the answer counts for the key it was asked for, and the button waits for it
  assert.match(dialog, /const ready = Boolean\(check\.request\) && impact !== null && impact\.key === key && !checking;/);
  assert.match(dialog, /const canSave = ready && !noop;/);
  assert.match(dialog, /disabled=\{!canSave \|\| saving\}/);
  assert.match(dialog, /if \(!check\.request \|\| !canSave \|\| saving\) return;/);
  // the shown words are the helpers' (tested above)
  for (const helper of ["impactStudentsText(shownImpact)", "staleSheetsText(shownImpact)", "pastDateWarning(", "futureDateNote("]) assert.ok(dialog.includes(helper), helper);
  // PRICE_CONFLICT: the block reads the price again, the old answer is dropped, the message stays
  assert.match(dialog, /if \(isPriceConflict\(cause\)\) \{\s*onConflict\(\);\s*setImpact\(null\);\s*setNonce/);
  assert.match(read("src/components/groups/group-price-block.tsx"), /onConflict=\{\(\) => void load\(true\)\}/);
  // the individual price: 422 REASON_REQUIRED and 409 «в архиве» come with the server's Russian text
  assert.match(read("src/components/payments/membership-price.tsx"), /setError\(cause instanceof Error \? cause\.message : "Не удалось сохранить цену"\)/);
});

// ── R3 follow-ups ────────────────────────────────────────────────────────────────────────────────────────────

test("a price from 2000-01-01 has always been so: «с самого начала», everywhere a date would show", () => {
  assert.equal(G.sinceText("2000-01-01"), "с самого начала");
  assert.equal(G.sinceText("2000-01-02"), "с 02.01.2000");
  assert.equal(G.sinceText("2026-10-15"), "с 15.10.2026");
  assert.match(G.pastDateWarning("2000-01-01", "2026-10-17"), /за период с самого начала пересчитаются/);
  assert.doesNotMatch(G.pastDateWarning("2000-01-01", "2026-10-17"), /01\.01\.2000/);
  const row = { id: "a", amount: 450000, valid_from: "2000-01-01", reason: "Цена до введения цены группы", created_by_name: null, created_at: null, is_current: true, is_future: false, changes: [] };
  assert.equal(plain(G.overrideRowText(row, "Оплата в месяц")), "с самого начала — 450 000 сум/мес · Цена до введения цены группы");
  assert.equal(G.historyViews([{ id: "1", amount: 1, valid_from: "2000-01-01", note: null, created_by_name: null, created_at: null, is_current: true, is_future: false, changes: [] }], "Оплата в месяц")[0].since, "с самого начала");
  // nothing in the screens writes the epoch by hand
  for (const file of ["src/components/groups/group-price-block.tsx", "src/components/payments/membership-price.tsx", "src/components/groups/group-price-dialog.tsx"]) {
    assert.doesNotMatch(read(file), /01\.01\.2000|2000-01-01/, file);
  }
});

test("«Вернуть цену группы»: the day is not before the individual price in force; a scheduled price has its own action", () => {
  const today = "2026-10-17";
  const price = { amount: 400000, source: "override", valid_from: "2026-10-05", group_amount: 500000, reason: "Сестра" };
  // (b) an earlier day changes nothing: refused with a clear message, the day itself and later are fine
  assert.equal(G.activeOverrideFrom(price), "2026-10-05");
  assert.equal(G.activeOverrideFrom({ ...price, source: "group" }), null);
  assert.equal(G.activeOverrideFrom(null), null);
  const early = G.checkReturnForm("2026-10-04", today, "2026-10-05");
  assert.equal(early.request, null);
  assert.match(early.error, /Индивидуальная цена действует с 05\.10\.2026 — выберите эту дату или позже/);
  assert.deepEqual(G.checkReturnForm("2026-10-05", today, "2026-10-05"), { error: null, request: { amount: null, valid_from: "2026-10-05" } });
  assert.equal(G.checkReturnForm(today, today, "2026-10-05").error, null);
  assert.equal(G.checkReturnForm("2026-10-04", today).error, null); // no individual price in force: no lower bound
  assert.match(G.checkReturnForm("2026-10-01", today, "2000-01-01").error ?? "", /^$/); // an always-so price: nothing is earlier
  assert.match(G.checkReturnForm("2026-10-04", today, "2026-10-05").error, /ничего не изменится/);
  assert.match(G.checkReturnForm("2026-10-04", today, "2026-10-05").error, /^Индивидуальная цена действует с 05\.10\.2026/);
  const startOfTime = G.checkReturnForm("2000-01-01", today, "2000-01-01");
  assert.equal(startOfTime.error, null);

  // (a) scheduled individual prices: only future rows with a sum, soonest first
  const row = (over) => ({ id: "r", amount: 350000, valid_from: "2026-11-20", reason: "Договорённость", created_by_name: null, created_at: null, is_current: false, is_future: true, changes: [], ...over });
  const history = [
    row({ id: "far", valid_from: "2026-12-20", amount: 300000 }),
    row({ id: "soon" }),
    row({ id: "returned", valid_from: "2026-11-25", amount: null }), // a scheduled return is not an individual price
    row({ id: "now", valid_from: "2026-10-05", amount: 400000, is_current: true, is_future: false }),
  ];
  assert.deepEqual(G.scheduledOverrides(history).map((r) => r.id), ["soon", "far"]);
  assert.deepEqual(G.scheduledOverrides(null), []);
  // the actions the card offers, with the exact labels
  const labels = (p, h) => G.overrideActions(p, h).map((a) => [a.kind, a.label]);
  assert.deepEqual(labels({ ...price, source: "group" }, []), []);
  assert.deepEqual(labels(price, []), [["return", "Вернуть цену группы"]]);
  assert.deepEqual(labels({ ...price, source: "group" }, [row({ id: "soon" })]), [["cancel", "Отменить запланированную индивидуальную цену"]]);
  assert.deepEqual(labels(price, [row({ id: "soon" })]), [["return", "Вернуть цену группы"], ["cancel", "Отменить запланированную индивидуальную цену"]]);
  assert.deepEqual(labels({ ...price, source: "group" }, [row({ id: "a" }), row({ id: "b", valid_from: "2026-12-20" })]), [
    ["cancel", "Отменить запланированную индивидуальную цену (с 20.11.2026)"],
    ["cancel", "Отменить запланированную индивидуальную цену (с 20.12.2026)"],
  ]);

  // the screens wire it: the section, the history read at once, the confirmation with the exact words
  const section = read("src/components/payments/membership-price.tsx");
  assert.match(section, /priceMenuActions\(editable, price, history\?\.history\)/);
  assert.match(section, /if \(!historyOpen && !editable\) return undefined;/);
  assert.match(section, /checkReturnForm\(validFrom, today, notBefore\)/);
  assert.match(section, /orgApi\.cancelMembershipPrice\(row\.membership_id, target\.id\)/);
  assert.match(section, /min=\{earliest\}/);
});

test("a price of 0 is «бесплатно»: never «0 сум/мес», never «не задана»", () => {
  assert.equal(G.formatPrice(0, "Оплата в месяц"), "бесплатно");
  assert.equal(G.formatPrice(0, "Стоимость пакета"), "бесплатно");
  assert.equal(G.formatPrice(null, "Оплата в месяц"), "не задана");
  assert.equal(G.priceBriefText({ amount: 0, valid_from: "2026-10-01" }), "бесплатно");
  const free = G.membershipPriceView({ amount: 0, source: "group", valid_from: null, group_amount: 0, reason: null }, "Оплата в месяц");
  assert.equal(free.kind, "group");
  assert.equal(free.text, "Цена группы: бесплатно");
  const own = G.membershipPriceView({ amount: 0, source: "override", valid_from: null, group_amount: 500000, reason: "Стипендия" }, "Оплата в месяц");
  assert.equal(own.value, "бесплатно");
  assert.equal(plain(own.text), "Индивидуальная цена: бесплатно · Стипендия (цена группы 500 000 сум)");
  assert.equal(G.membershipPriceView({ amount: 400000, source: "override", valid_from: null, group_amount: 0, reason: "Договорённость" }, "Оплата в месяц").note, "Договорённость · цена группы — бесплатно");
  assert.equal(G.targetGroupPriceText({ amount: 0, valid_from: "2026-10-01" }, "Оплата в месяц"), "Цена группы: бесплатно");
  // the list card and the history
  const { GroupCard } = require(path.join(root, "src/components/groups/group-card.tsx"));
  const base = { id: "g1", org_id: "o", name: "Алгебра", class_level: 8, teacher_id: "t", teacher_name: "Иванов", description: null, status: "active", max_students: 20, student_count: 5, created_at: null };
  const card = textOf(renderToStaticMarkup(React.createElement(GroupCard, { group: { ...base, price_current: { amount: 0, valid_from: "2026-10-01" } }, href: "/owner/groups/g1" })));
  assert.match(card, /бесплатно/);
  assert.doesNotMatch(card, /0 сум|не задана/);
  assert.equal(G.historyViews([{ id: "1", amount: 0, valid_from: "2026-10-01", note: null, created_by_name: null, created_at: null, is_current: true, is_future: false, changes: [] }], "Оплата в месяц")[0].amount, "бесплатно");
  assert.equal(G.overrideRowText({ id: "a", amount: 0, valid_from: "2026-10-15", reason: "Стипендия", created_by_name: null, created_at: null, is_current: true, is_future: false, changes: [] }, "Оплата в месяц"), "с 15.10.2026 — бесплатно · Стипендия");
  // the override audit line
  assert.equal(plain(G.overrideChangeLine({ at: null, actor_name: null, old_amount: 0, old_source: "group", new_amount: 0, reason: null })), "цена группы — бесплатно → индивидуальная — бесплатно");
  const block = read("src/components/groups/group-price-block.tsx");
  assert.match(block, /formatPrice\(current\.amount, label\)/); // the big number is formatPrice's: «бесплатно» for 0
  assert.match(read("src/components/groups/group-price-dialog.tsx"), /current\.amount === 0 \? "Сейчас: бесплатно\. "/);
});

test("a group card of an ARCHIVED group with no price has no «Цена не задана · задать»", () => {
  const { GroupCard } = require(path.join(root, "src/components/groups/group-card.tsx"));
  const base = { id: "g1", org_id: "o", name: "Алгебра", class_level: 8, teacher_id: "t", teacher_name: "Иванов", description: null, max_students: 20, student_count: 5, created_at: null };
  const html = (group) => renderToStaticMarkup(React.createElement(GroupCard, { group, href: "/owner/groups/g1" }));
  assert.doesNotMatch(textOf(html({ ...base, status: "archived", price_current: null })), /Цена не задана|задать/);
  assert.doesNotMatch(html({ ...base, status: "archived", price_current: null }), /group-card-price/);
  assert.match(textOf(html({ ...base, status: "archived", price_current: { amount: 500000, valid_from: "2026-10-01" } })), /500 000 сум\/мес/); // a price is still shown
  assert.match(textOf(html({ ...base, status: "active", price_current: null })), /Цена не задана/);
});

test("the conflict text does not contradict itself; «Сохранить» is off when nothing would change", () => {
  assert.equal(G.PRICE_CONFLICT_TEXT, "Цену только что изменил другой пользователь. Данные обновлены — проверьте и сохраните ещё раз.");
  assert.equal(G.isPriceConflict({ code: "PRICE_CONFLICT", message: "Цену только что изменили. Обновите страницу и повторите." }), true);
  assert.equal(G.isPriceConflict({ code: "REASON_REQUIRED" }), false);
  assert.equal(G.isPriceConflict(null), false);
  assert.equal(G.isPriceConflict(new Error("x")), false);
  const dialog = read("src/components/groups/group-price-dialog.tsx");
  assert.match(dialog, /setError\(PRICE_CONFLICT_TEXT\)/);
  assert.doesNotMatch(dialog, /Обновите страницу|повторите\./);
  assert.match(read("src/components/payments/membership-price.tsx"), /isPriceConflict\(cause\)\) \{ setError\(PRICE_CONFLICT_TEXT\); onConflict\(\); \}/);
  // no-op: the day already has this sum and this note
  const history = [
    { id: "2", amount: 500000, valid_from: "2026-10-01", note: " Новый год ", created_by_name: null, created_at: null, is_current: true, is_future: false, changes: [] },
    { id: "1", amount: 450000, valid_from: "2026-09-01", note: null, created_by_name: null, created_at: null, is_current: false, is_future: false, changes: [] },
  ];
  const request = (over) => ({ amount: 500000, valid_from: "2026-10-01", note: "Новый год", ...over });
  assert.equal(G.isNoopPriceChange(history, request({})), true);
  assert.equal(G.isNoopPriceChange(history, request({ note: undefined })), false); // a note would be erased
  assert.equal(G.isNoopPriceChange(history, request({ note: "Другое" })), false);
  assert.equal(G.isNoopPriceChange(history, request({ amount: 510000 })), false);
  assert.equal(G.isNoopPriceChange(history, request({ valid_from: "2026-10-17" })), false); // the same sum from another day is a new row
  assert.equal(G.isNoopPriceChange(history, { amount: 450000, valid_from: "2026-09-01" }), true);
  assert.equal(G.isNoopPriceChange([], request({})), false);
  assert.equal(G.isNoopPriceChange(null, request({})), false);
  assert.equal(G.isNoopPriceChange(history, null), false);
  assert.match(dialog, /const noop = isNoopPriceChange\(history, check\.request\);/);
  assert.match(dialog, /const canSave = ready && !noop;/);
  assert.match(dialog, /disabled=\{!canSave \|\| saving\}/);
  assert.match(read("src/components/groups/group-price-block.tsx"), /history=\{data\?\.history \?\? \[\]\}/);
});

test("the payroll table speaks the centre's mode, names its headers, has one tooltip per cell, explains a changed price", () => {
  const { PayrollSheetTable } = require(path.join(root, "src/components/payroll/sheet-table.tsx"));
  const mark = (date, state, price) => ({ date, lesson_id: `l-${date}`, mark: 1, state, divisor: 12, price, price_source: "group" });
  const marks = [mark("2026-10-01", "counted", 400000), mark("2026-10-15", "counted", 500000), mark("2026-10-22", "unpaid", 500000)];
  const line = {
    membership_id: "m1", student_id: "s1", student_name: "Каримова Дилноза", display_id: null, group_id: "g1", group_name: "Алгебра 8А", lesson_type: "group", lesson_time: null,
    monthly_fee: 500000, source_fee: 500000, fee_overridden: false, price_source: "group", price_changed: true,
    price_steps: [{ date: "2026-10-01", amount: 400000 }, { date: "2026-10-15", amount: 500000 }], no_price_lessons: 0, unpaid_due: 1,
    percent: "50", divisor: 12, marks, counted: 2, unpaid: 1, pending_excused: 0, include_unpaid: false, amount: 37500, warnings: [],
  };
  const sheet = {
    id: "s", saved: true, month: "2026-10", period_start: "2026-10-01", period_end: "2026-10-31", month_open: false, teacher_id: "t1", teacher_name: "Иванов", revision: 1,
    percents: { group: "50" }, divisor_default: 12, lines: [line],
    groups: [{ group_id: "g1", group_name: "Алгебра 8А", lesson_type: "group", lesson_time: null, percent: "50", dates: marks.map((m) => ({ date: m.date, lesson_id: m.lesson_id })), line_count: 1, counted: 2, unpaid: 1, total_amount: 37500 }],
    total_amount: 37500, counted_total: 2, unpaid_total: 1, pending_excused_total: 0, warnings: { open_lessons: null, pending_excused: 0, no_fee: 0, unpaid: 1 },
    source_fingerprint: "f", stale: false, note: null, created_by_name: null, created_at: null, updated_by_name: null, updated_at: null,
  };
  const render = (editable = true, priceLabel = undefined) => renderToStaticMarkup(React.createElement(PayrollSheetTable, { sheet, edits: R.EMPTY_EDITS, editable, onEdits: () => {}, priceLabel }));
  {
    // a calendar centre (the default of the store)
    const calendar = render();
    assert.match(calendar, /<th scope="col" aria-label="Оплата в месяц"/);
    assert.match(calendar, /aria-label="Оплата в месяц: Каримова Дилноза, Алгебра 8А"/);
    // a package centre: the page hands the label of the centre's mode (the table reads the same store by default)
    const pack = render(true, "Стоимость пакета");
    assert.match(read("src/components/payroll/sheet-table.tsx"), /priceLabelOf\(usePaymentsSummary\(\(state\) => state\.periodMode\)\)/);
    assert.match(pack, /<th scope="col" aria-label="Стоимость пакета"/);
    assert.match(pack, /aria-label="Стоимость пакета: Каримова Дилноза, Алгебра 8А"/);
    assert.doesNotMatch(pack, /Оплата в месяц/);
    // the column headers are named by themselves, the tooltip text is not part of their names
    for (const name of ["Засчитано", "Не оплачено"]) assert.match(pack, new RegExp(`<th scope="col" aria-label="${name}"`));
    // one tooltip per unpaid cell: the Hint, not a title next to it
    assert.doesNotMatch(pack, /title="Каримова Дилноза, 22\.10: Был на уроке/);
    assert.match(pack, /title="Каримова Дилноза, 01\.10: Засчитан"/); // a counted cell keeps its own title
    assert.ok(textOf(pack).includes(R.UNPAID_MARK_HINT));
    // the changed price explains itself (editable and read-only)
    assert.ok(textOf(pack).includes("Если ввести сумму, она заменит цену во всех уроках строки; ввод показанной цены вернёт цены по дням уроков."));
    assert.ok(textOf(render(false)).includes("Цена менялась в течение месяца: каждый урок посчитан по цене своего дня."));
    assert.ok(!textOf(render(false)).includes("ввод показанной цены"));
  }
  // the pure words
  assert.equal(H.priceFieldHint({ price_changed: false, fee_overridden: false }, true), null);
  assert.equal(H.priceFieldHint({ price_changed: true, fee_overridden: true }, true), null);
  assert.match(H.priceFieldHint({ price_changed: true, fee_overridden: false }, true), /ввод показанной цены вернёт цены по дням уроков/);
  assert.doesNotMatch(H.priceFieldHint({ price_changed: true, fee_overridden: false }, false), /ввод/);
  // typing the shown (last) price of such a line is no overwrite: it brings the prices of the days back
  assert.deepEqual(R.setFeeEdit(R.EMPTY_EDITS, sheet, "m1", 500000), R.EMPTY_EDITS);
  assert.deepEqual(R.setFeeEdit(R.EMPTY_EDITS, sheet, "m1", 600000).fees, { m1: 600000 });
  // the formula of the month speaks the same words
  assert.equal(R.payrollFormulaText(12), "Оплата в месяц × % ÷ 12 × засчитанные уроки");
  assert.equal(R.payrollFormulaText(8, "Стоимость пакета"), "Стоимость пакета × % ÷ 8 × засчитанные уроки");
  // no stale words of the old name
  assert.doesNotMatch(read("src/lib/payroll.ts"), /включить|включён/i);
});

test("a scheduled price is taken back with a DELETE: typed in api.ts, confirmed, refusals refresh", () => {
  const api = read("src/lib/api.ts");
  assert.match(api, /cancelGroupPrice: \(groupId: string, rowId: string\) =>\s*api<GroupPrices>\(`\/auth\/org\/groups\/\$\{encodePathId\(groupId\)\}\/prices\/\$\{encodePathId\(rowId\)\}`, \{ method: "DELETE" \}\)/);
  assert.match(api, /cancelMembershipPrice: \(membershipId: string, rowId: string\) =>\s*api<MembershipPriceChanged>\(`\/auth\/org\/memberships\/\$\{encodePathId\(membershipId\)\}\/price-override\/\$\{encodePathId\(rowId\)\}`, \{ method: "DELETE" \}\)/);
  assert.match(api, /export type \{ GroupPriceCancelled, GroupPriceChange, GroupPriceRow, PriceOverrideCancelled, PriceOverrideChange, PriceOverrideRow \} from "\.\/group-price";/);
  // the workaround of the same-day correction is gone
  assert.doesNotMatch(read("src/lib/group-price.ts"), /cancelScheduledRequest/);
  assert.doesNotMatch(read("src/components/payments/membership-price.tsx"), /cancelScheduledRequest/);
  // the group block: «Отменить» on a future row only, a confirmation, the answer replaces the block
  const block = read("src/components/groups/group-price-block.tsx");
  assert.match(block, /item\.status === "future" && \(\s*<button type="button" onClick=\{\(\) => setCancelTarget\(item\)\}/);
  assert.match(block, /onRefused=\{\(\) => void load\(true\)\}/);
  assert.match(block, /onNotify\("Запланированная цена отменена"\)/);
  const dialog = read("src/components/groups/group-price-cancel-dialog.tsx");
  assert.match(dialog, /orgApi\.cancelGroupPrice\(groupId, target\.id\)/);
  assert.match(dialog, /if \(isCancelRefused\(cause\)\) \{\s*setRefused\(true\);[\s\S]*?onRefused\(\);/);
  assert.match(read("src/components/payments/membership-price.tsx"), /if \(isCancelRefused\(cause\)\) \{\s*setRefused\(true\);[\s\S]*?onConflict\(\);/);
  // 409 «уже действует» and 404 «не найдена» are refusals, anything else is not
  assert.equal(G.isCancelRefused({ status: 409, message: "Нельзя отменить цену, которая уже действует — задайте новую с нужной даты" }), true);
  assert.equal(G.isCancelRefused({ status: 404 }), true);
  assert.equal(G.isCancelRefused({ status: 403 }), false);
  assert.equal(G.isCancelRefused({ status: 500 }), false);
  assert.equal(G.isCancelRefused(null), false);
  assert.equal(G.isCancelRefused(new Error("x")), false);
});

test("the cancelled scheduled prices are rendered in words, in both histories", () => {
  const group = (over) => ({ at: "2026-10-20T06:05:00", actor_name: "Ахмедов", amount: 500000, valid_from: "2026-11-01", note: null, ...over });
  // 06:05 UTC is 11:05 in Tashkent
  assert.equal(plain(G.groupCancelledLine(group({}))), "20.10.2026 11:05 · Ахмедов отменил запланированную цену 500 000 с 01.11.2026");
  assert.equal(plain(G.groupCancelledLine(group({ note: "Новый год" }))), "20.10.2026 11:05 · Ахмедов отменил запланированную цену 500 000 с 01.11.2026 · Новый год");
  assert.equal(plain(G.groupCancelledLine(group({ amount: 0 }))), "20.10.2026 11:05 · Ахмедов отменил запланированную цену бесплатно с 01.11.2026");
  assert.equal(plain(G.groupCancelledLine(group({ actor_name: null }))), "20.10.2026 11:05 · Запланированная цена 500 000 с 01.11.2026 отменена");
  assert.equal(plain(G.groupCancelledLine(group({ at: null, valid_from: null }))), "Ахмедов отменил запланированную цену 500 000");
  const own = (over) => ({ at: "2026-10-20T06:05:00", actor_name: "Ахмедов", amount: 400000, valid_from: "2026-11-20", reason: "Сестра ученика", ...over });
  assert.equal(plain(G.overrideCancelledLine(own({}))), "20.10.2026 11:05 · Ахмедов отменил запланированную индивидуальную цену 400 000 с 20.11.2026 · Сестра ученика");
  // a scheduled «цена группы» (no sum) was a scheduled return
  assert.equal(plain(G.overrideCancelledLine(own({ amount: null, reason: null }))), "20.10.2026 11:05 · Ахмедов отменил запланированный возврат цены группы с 20.11.2026");
  assert.equal(plain(G.overrideCancelledLine(own({ amount: null, reason: null, actor_name: null }))), "20.10.2026 11:05 · Запланированный возврат цены группы с 20.11.2026 отменён");
  for (const text of [G.groupCancelledLine(group({})), G.overrideCancelledLine(own({ amount: null }))]) assert.doesNotMatch(text, /null|undefined/);
  // the histories show them
  assert.match(read("src/components/groups/group-price-block.tsx"), /groupCancelledLine\(item\)/);
  assert.match(read("src/components/payments/membership-price.tsx"), /overrideCancelledLine\(item\)/);
});
