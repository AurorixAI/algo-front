// ROADMAP #125 «Остатки на начало»: the front reads the frozen contract (tests/fixtures/openings = openings_fixtures + openings_contract.json of the
// backend) and words it: the rows of the table, the drafts and the items of a batch, the bulk actions, the lessons conversion, the summary before
// saving, every refusal of the endpoints, the Excel report, and the predicates of the banner / the checklist / the header button.
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
const dir = path.join(__dirname, "fixtures/openings");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
const O = require(path.join(root, "src/lib/openings.ts"));
const plain = (text) => String(text).replace(/\u00a0/g, " ");
const clone = (value) => JSON.parse(JSON.stringify(value));

const START = "2026-11-01";
const list = () => O.normalizeList(fixture("O01_list_pending"));
const rowsById = () => Object.fromEntries(O.flatRows(list().groups).map((row) => [row.membership_id.slice(-3), row]));
// the ids of the fixtures end with 101..110: «r(103)» is the row of Орлова Дана
const r = (n) => rowsById()[String(n)];
const CTX = { accountingStart: START, paidUntilMax: "2027-10-23" };

// ── the contract ─────────────────────────────────────────────────────────────

test("the contract: every operation has a helper in orgApi, every golden answer is read without losing a field", () => {
  const contract = fixture("_contract");
  const operations = Object.entries(contract.paths).flatMap(([route, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${route}`));
  assert.equal(operations.length, 7);
  const api = read("src/lib/api.ts");
  const needed = {
    "GET /org/opening-balances": /opening-balances\$\{suffix \? `\?\$\{suffix\}` : ""\}`\)\.then\(normalizeOpeningsList\)/,
    "GET /org/opening-balances/summary": /"\/auth\/org\/opening-balances\/summary"/,
    "POST /org/opening-balances/batch/preview": /opening-balances\/batch\/preview/,
    "POST /org/opening-balances/batch": /"\/auth\/org\/opening-balances\/batch", \{ method: "POST"/,
    "POST /org/opening-balances/state": /opening-balances\/state/,
    "GET /org/opening-balances/export": /opening-balances\/export/,
    "POST /org/opening-balances/import/preview": /opening-balances\/import\/preview/,
  };
  for (const operation of operations) assert.ok(needed[operation] && needed[operation].test(api), `orgApi has no helper for ${operation}`);
  // the answers are read whole
  const o01 = fixture("O01_list_pending");
  const listed = O.normalizeList(o01);
  assert.equal(listed.groups.length, o01.groups.length);
  assert.equal(O.flatRows(listed.groups).length, 9);
  assert.equal(listed.accounting_start, START);
  assert.equal(listed.paid_until_max, "2027-10-23");
  for (const name of ["O04_preview_ok", "O05_preview_errors_and_reason", "O06_preview_lessons"]) {
    const raw = fixture(name);
    const preview = O.normalizePreview(raw);
    assert.equal(preview.digest, raw.digest);
    assert.equal(preview.items.length, raw.items.length);
    assert.deepEqual(preview.impact, raw.impact);
    assert.deepEqual(preview.summary, raw.summary);
  }
  const applied = O.normalizeApplied(fixture("O07_applied"));
  assert.equal(applied.batch_id, "00000000-0000-4000-8000-0000000004b1");
  assert.equal(applied.replayed, false);
  assert.equal(O.normalizeApplied(fixture("O08_applied_replayed")).replayed, true);
  const imp = O.normalizeImport(fixture("O09_import_preview"));
  assert.equal(imp.rows.length, 6);
  assert.equal(imp.batch_items.length, 3);
  assert.equal(O.normalizeSummary(fixture("O03_summary_pending")).totals.missing, 6);
});

test("the contract: a state the front does not know is «none»; an answer with holes is zeros and empty lists, never a crash", () => {
  assert.equal(O.normalizeState("off"), "none");
  assert.equal(O.normalizeState("pending"), "pending");
  assert.equal(O.normalizeState(undefined), "none");
  const empty = O.normalizeList({});
  assert.deepEqual(empty.groups, []);
  assert.equal(empty.totals.missing, 0);
  const preview = O.normalizePreview(null);
  assert.equal(preview.ok, false);
  assert.deepEqual(preview.items, []);
  assert.equal(O.normalizeImport(undefined).file.rows_read, 0);
});

// ── the rows ─────────────────────────────────────────────────────────────────

test("rows: «Сейчас» is said in words of the owner (opening, debt, both, nothing, «на начало долга нет»)", () => {
  assert.equal(plain(O.currentText(r(101), START)), "Оплачено до 30.11");
  assert.equal(plain(O.currentText(r(102), START)), "Долг 550 000 сум на 31.10");
  assert.equal(O.currentText(r(103), START), "Не заполнено");
  assert.equal(O.currentText(r(104), START), "Остатка нет"); // money exists, no opening, not «missing»
  // paid until the day before the start is a real opening now: «на начало долга нет»
  assert.equal(O.currentText({ opening: { paid_until: "2026-10-31", debt_amount: null, debt_on: null }, missing: false, status: "active" }, START), "Долга на начало нет");
  assert.equal(plain(O.currentText({ opening: { paid_until: "2026-10-31", debt_amount: 250000, debt_on: "2026-10-31" }, missing: false, status: "active" }, START)), "Оплачено до 31.10 · Долг 250 000 сум на 31.10");
  assert.equal(O.valueText(null, START), "не заполнено");
  assert.equal(plain(O.valueText({ paid_until: "2026-11-30", debt_amount: null, debt_on: null }, START)), "оплачено до 30.11");
});

test("rows: price and mode («за пакет» in a lessons centre, «инд.» for an individual price), the marks and the reason a row is locked", () => {
  assert.equal(plain(O.priceText(r(101))), "600 000 сум/мес");
  assert.equal(plain(O.priceText(r(104))), "450 000 сум/мес · инд.");
  assert.equal(plain(O.priceText(r(106))), "1 200 000 сум за пакет");
  assert.equal(O.priceText(r(108)), "бесплатно");
  assert.equal(O.priceText({ mode: "calendar", price: { amount: null, source: "none" } }), "цена не задана");
  const labels = (n) => O.rowChips(r(n), START).map((chip) => chip.label);
  assert.deepEqual(labels(104), ["индивид. цена", "есть оплаты"]);
  assert.deepEqual(labels(105), ["пауза"]);
  assert.deepEqual(labels(107), ["пришёл переводом"]);
  assert.deepEqual(labels(108), ["бесплатно"]);
  assert.deepEqual(labels(109), ["пришёл 03.11"]); // came after the start: «остаток обычно не нужен»
  assert.match(O.notEditableText("transfer"), /другой группы/);
  assert.match(O.notEditableText("free"), /Бесплатное/);
  assert.equal(O.notEditableText(null), null);
  assert.equal(r(107).editable, false);
  assert.equal(r(107).reason_not_editable, "transfer");
  // an opening that no longer fits the start (additive field) is marked for review
  assert.ok(O.rowChips({ ...clone(r(101)), needs_review: true }, START).some((chip) => chip.key === "review"));
});

test("rows: the left students come from the second fixture, only their debt is editable", () => {
  const left = O.normalizeList(fixture("O02_list_include_left"));
  const row = left.groups[0].memberships[0];
  assert.equal(row.status, "left");
  assert.equal(row.only_debt, true);
  assert.deepEqual(O.rowChips(row, START).map((chip) => chip.label), ["ушёл 30.06"]);
  assert.equal(plain(O.currentText(row, START)), "Долг 300 000 сум на 30.06");
  // a paid-until date for a student who left is refused on the screen, a debt is fine
  assert.match(O.validateDraft(row, { ...O.draftOfRow(row), paidUntil: "2026-11-30" }, CTX), /только долг/);
  assert.equal(O.validateDraft(row, { ...O.draftOfRow(row), debt: "400 000" }, CTX), null);
  // «Выбрать» does not take a left student
  assert.equal(O.isSelectable(row), false);
});

test("progress: «Заполнено 38 из 120»; 100% exactly when nobody is missing; the group counts its own rows", () => {
  assert.equal(O.progressOf({ with_opening: 38, missing: 82 }).text, "Заполнено 38 из 120");
  assert.equal(O.progressOf({ with_opening: 38, missing: 82 }).left, 82);
  assert.equal(O.progressOf({ with_opening: 38, missing: 82 }).percent, 31);
  assert.equal(O.progressOf({ with_opening: 90, missing: 0 }).percent, 100);
  assert.equal(O.progressOf({ with_opening: 0, missing: 0 }).percent, 100);
  const totals = list().totals;
  assert.equal(O.progressOf(totals).text, `Заполнено ${totals.with_opening} из ${totals.with_opening + totals.missing}`);
  const [first] = list().groups;
  assert.equal(O.groupProgress(first.memberships).text, "заполнено 2 из 4");
  // left students are not counted
  const withLeft = O.normalizeList(fixture("O02_list_include_left")).groups[0].memberships;
  assert.equal(O.groupProgress(withLeft).text, "заполнено 0 из 0");
});

test("the intro is the sentence of the lead with the date of the start", () => {
  assert.equal(O.openingsIntro(START), "Отметьте, что было у учеников до начала учёта 01.11.2026: кто оплатил вперёд и кто должен. Начисления в ALGO идут с этой даты.");
  assert.equal(O.OPENINGS_TITLE, "Остатки на начало");
  assert.equal(O.noDebtDay(START), "2026-10-31");
});

// ── drafts and items ─────────────────────────────────────────────────────────

test("items: a draft becomes one item of the batch with the version of the row; an untouched or restored draft is no item", () => {
  const row = r(103);
  assert.equal(O.itemOf(row, undefined), null);
  assert.equal(O.itemOf(row, O.draftOfRow(row)), null);
  assert.deepEqual(O.itemOf(row, { ...O.draftOfRow(row), paidUntil: "2026-11-30" }), {
    membership_id: row.membership_id, version: "-", paid_until: "2026-11-30", debt_amount: null, debt_on: null,
  });
  // a debt without a date takes the floor of the row (the front never invents another day)
  assert.deepEqual(O.itemOf(row, { ...O.draftOfRow(row), debt: "1 250 000" }), {
    membership_id: row.membership_id, version: "-", paid_until: null, debt_amount: 1250000, debt_on: "2026-10-31",
  });
  assert.equal(O.itemOf(row, { ...O.draftOfRow(row), debt: "250 000", debtOn: "2026-09-30" }).debt_on, "2026-09-30");
  // a date without an amount is dropped, an amount of 0 is no debt
  assert.equal(O.itemOf(row, { ...O.draftOfRow(row), debtOn: "2026-09-30" }), null);
  assert.equal(O.itemOf(row, { ...O.draftOfRow(row), debt: "0" }), null);
  // an opening that exists keeps its version; editing one field keeps the other (the item replaces the whole opening)
  const saved = r(102);
  const item = O.itemOf(saved, { ...O.draftOfRow(saved), paidUntil: "2026-11-30" });
  assert.equal(item.version, saved.version);
  assert.equal(item.debt_amount, 550000);
  assert.equal(item.paid_until, "2026-11-30");
  // everything blanked over a saved opening = remove it; blanked over nothing = nothing
  assert.deepEqual(O.itemOf(saved, { paidUntil: "", debt: "", debtOn: "", lessons: "", clear: false }), { membership_id: saved.membership_id, version: saved.version, clear: true });
  assert.equal(O.itemOf(row, { paidUntil: "", debt: "", debtOn: "", lessons: "", clear: false }), null);
  assert.deepEqual(O.itemOf(saved, { ...O.draftOfRow(saved), clear: true }), { membership_id: saved.membership_id, version: saved.version, clear: true });
});

test("items: «осталось уроков» is sent as lessons_left (never together with paid_until)", () => {
  const row = r(106);
  const item = O.itemOf(row, { ...O.draftOfRow(row), lessons: "8" });
  assert.deepEqual(item, { membership_id: row.membership_id, version: "-", lessons_left: 8, debt_amount: null, debt_on: null });
  assert.ok(!("paid_until" in item));
  assert.deepEqual(O.lessonItems([item, O.itemOf(r(103), { ...O.draftOfRow(r(103)), paidUntil: "2026-11-30" })]).map((i) => i.lessons_left), [8]);
  assert.match(O.validateDraft(row, { ...O.draftOfRow(row), lessons: "8", paidUntil: "2026-11-30" }, CTX), /либо/);
  assert.match(O.validateDraft(row, { ...O.draftOfRow(row), lessons: "401" }, CTX), /от 0 до 400/);
  assert.equal(O.validateDraft(row, { ...O.draftOfRow(row), lessons: "0" }, CTX), null);
});

test("items: itemsOf lists the changed rows in the order of the table and leaves out the ones the user dropped", () => {
  const rows = O.flatRows(list().groups);
  const drafts = {
    [r(103).membership_id]: { ...O.draftOfRow(r(103)), paidUntil: "2026-11-30" },
    [r(105).membership_id]: { ...O.draftOfRow(r(105)), debt: "500 000" },
    [r(101).membership_id]: O.draftOfRow(r(101)), // no change
  };
  assert.deepEqual(O.itemsOf(rows, drafts).map((i) => i.membership_id.slice(-3)), ["103", "105"]);
  assert.deepEqual(O.itemsOf(rows, drafts, new Set([r(103).membership_id])).map((i) => i.membership_id.slice(-3)), ["105"]);
  assert.equal(O.changedCount(rows, drafts), 2);
  assert.deepEqual(Object.keys(O.prunedDrafts(rows, drafts)).map((id) => id.slice(-3)).sort(), ["103", "105"]);
});

test("validation: the floor comes from the server row; the words say what to do", () => {
  const row = r(103);
  const draft = O.draftOfRow(row);
  assert.equal(O.validateDraft(row, { ...draft, paidUntil: "2026-10-31" }, CTX), null); // the day before the start: «долга нет»
  assert.match(O.validateDraft(row, { ...draft, paidUntil: "2026-10-30" }, CTX), /не раньше 31\.10\.2026: за более ранние дни внесите долг/);
  assert.match(O.validateDraft(row, { ...draft, paidUntil: "2028-01-01" }, CTX), /не дальше чем на год/);
  assert.match(O.validateDraft(row, { ...draft, paidUntil: "not-a-date" }, CTX), /дату/);
  assert.match(O.validateDraft(row, { ...draft, debt: "100", debtOn: "2026-11-05" }, CTX), /не позже 31\.10\.2026/);
  assert.match(O.validateDraft(row, { ...draft, debt: "100", debtOn: "2019-12-31" }, CTX), /01\.01\.2020/);
  assert.match(O.validateDraft(row, { ...draft, debt: "99 999 999 999" }, CTX), /слишком большая/);
  assert.equal(O.validateDraft(r(107), { ...draft, paidUntil: "2026-11-30" }, CTX), O.notEditableText("transfer"));
  assert.equal(O.validateDraft(row, { ...draft, clear: true }, CTX), null);
  const problems = O.draftProblems(O.flatRows(list().groups), { [row.membership_id]: { ...draft, paidUntil: "2026-10-01" } }, CTX);
  assert.deepEqual(Object.keys(problems), [row.membership_id]);
});

// ── bulk actions ─────────────────────────────────────────────────────────────

test("bulk: «Оплачено до» for a group fills every row it may, skips the locked ones with the reason, keeps a saved debt", () => {
  const group = list().groups[1]; // Физика 10Б: lessons, transfer, free, after the start
  const result = O.applyBulk(group.memberships, {}, { kind: "paid_until", date: "2026-11-30" }, CTX);
  assert.deepEqual(Object.keys(result.drafts).map((id) => id.slice(-3)), ["106", "109"]);
  assert.equal(result.applied, 2);
  assert.deepEqual(result.skipped.map((s) => [s.id.slice(-3), s.reason]), [["107", "transfer"], ["108", "free"]]);
  assert.equal(O.skipText(result.skipped), "Пропущено 2: 1 пришёл переводом, 1 бесплатный");
  assert.equal(O.itemOf(r(106), result.drafts[r(106).membership_id]).paid_until, "2026-11-30");
  // 103 and 105 in the first group, 102 has a saved debt that stays
  const first = list().groups[0];
  const all = O.applyBulk(first.memberships, {}, { kind: "paid_until", date: "2026-11-30" }, CTX);
  const item = O.itemOf(r(102), all.drafts[r(102).membership_id]);
  assert.equal(item.paid_until, "2026-11-30");
  assert.equal(item.debt_amount, 550000);
  // a date earlier than the floor of a row skips that row (109 came on 03.11: floor 03.11)
  const early = O.applyBulk([r(103), r(109)], {}, { kind: "paid_until", date: "2026-10-31" }, CTX);
  assert.deepEqual(early.skipped.map((s) => [s.id.slice(-3), s.reason]), [["109", "before_floor"]]);
});

test("bulk: a date next to a debt the user is typing keeps that debt", () => {
  const row = r(103);
  const typed = { [row.membership_id]: { ...O.draftOfRow(row), debt: "100 000", debtOn: "2026-09-30" } };
  const result = O.applyBulk([row], typed, { kind: "paid_until", date: "2026-11-30" }, CTX);
  assert.deepEqual(O.itemOf(row, result.drafts[row.membership_id]), { membership_id: row.membership_id, version: "-", paid_until: "2026-11-30", debt_amount: 100000, debt_on: "2026-09-30" });
});

test("bulk: «Долга нет» writes paid_until = start − 1 and drops a saved debt; «Очистить» removes an opening, drops a draft where there is none", () => {
  const rows = [r(102), r(103), r(109)];
  const none = O.applyBulk(rows, {}, { kind: "no_debt" }, CTX);
  const i102 = O.itemOf(r(102), none.drafts[r(102).membership_id]);
  assert.deepEqual([i102.paid_until, i102.debt_amount, i102.debt_on], ["2026-10-31", null, null]);
  assert.equal(O.itemOf(r(103), none.drafts[r(103).membership_id]).paid_until, "2026-10-31");
  assert.deepEqual(none.skipped.map((s) => [s.id.slice(-3), s.reason]), [["109", "late"]]); // came after the start
  assert.equal(O.skipText(none.skipped), "Пропущено 1: 1 пришёл после начала учёта");
  assert.equal(O.bulkDoneText({ kind: "no_debt" }, none, START), "Долга на начало нет: 2 ученика. Пропущено 1: 1 пришёл после начала учёта");
  // «Оплачено до 31.10» from the date picker reads the same as «Долга нет»
  assert.equal(O.bulkDoneText({ kind: "paid_until", date: "2026-10-31" }, { applied: 3, skipped: [] }, START), "Долга на начало нет: 3 ученика");
  assert.equal(O.bulkDoneText({ kind: "paid_until", date: "2026-11-30" }, { applied: 12, skipped: [] }, START), "Оплачено до 30.11: 12 учеников");
  const cleared = O.applyBulk([r(101), r(103)], { [r(103).membership_id]: { ...O.draftOfRow(r(103)), paidUntil: "2026-11-30" } }, { kind: "clear" }, CTX);
  assert.equal(O.itemOf(r(101), cleared.drafts[r(101).membership_id]).clear, true);
  assert.equal(cleared.drafts[r(103).membership_id], undefined); // nothing saved there: the edit is simply dropped
  assert.equal(cleared.applied, 2);
});

test("bulk: the quick dates of the bar and the selection of a group (with the filters), «all / some / none»", () => {
  assert.deepEqual(O.quickDates(START).map((q) => [q.date, q.label]), [["2026-10-31", "31.10 (долга нет)"], ["2026-11-30", "30.11 (оплатил ноябрь)"]]);
  assert.equal(O.quickDates("2026-12-01")[1].label, "31.12 (оплатил декабрь)");
  assert.deepEqual(O.quickDates("garbage"), []);
  const group = list().groups[1];
  assert.equal(O.groupSelection(group.memberships, new Set()), "none");
  const one = new Set([r(106).membership_id]);
  assert.equal(O.groupSelection(group.memberships, one), "some");
  const all = O.toggleGroupSelection(group.memberships, new Set());
  assert.deepEqual([...all].map((id) => id.slice(-3)).sort(), ["106", "109"]); // the locked rows are not selectable
  assert.equal(O.groupSelection(group.memberships, all), "all");
  assert.equal(O.toggleGroupSelection(group.memberships, all).size, 0);
  assert.deepEqual(O.selectedRows(O.flatRows(list().groups), all).map((row) => row.membership_id.slice(-3)), ["106", "109"]);
});

test("filters: the search looks at the name and the ID, «Только незаполненные» keeps a row that is being edited, empty groups vanish", () => {
  const { groups } = list();
  const find = (filters, drafts) => O.filterGroups(groups, { ...O.NO_FILTERS, ...filters }, drafts).flatMap((g) => g.memberships.map((m) => m.membership_id.slice(-3)));
  assert.deepEqual(find({ search: "орлова" }), ["103"]);
  assert.deepEqual(find({ search: "A-1006" }), ["106"]);
  assert.deepEqual(find({ search: "  каримова   алия " }), ["101"]);
  assert.deepEqual(find({ onlyMissing: true }), ["103", "105", "106", "107", "108"].filter((id) => r(id).missing));
  assert.ok(find({ onlyMissing: true }, { [r(101).membership_id]: { ...O.draftOfRow(r(101)), paidUntil: "2026-12-01" } }).includes("101"));
  assert.deepEqual(O.filterGroups(groups, { ...O.NO_FILTERS, groupId: groups[1].id }).map((g) => g.name), ["Физика 10Б"]);
  assert.deepEqual(O.filterGroups(groups, { ...O.NO_FILTERS, search: "нет такого" }), []);
  // the first group with an empty row is open, a search opens everything
  assert.deepEqual([...O.initiallyOpenGroups(groups, false)], [groups[0].id]);
  assert.equal(O.initiallyOpenGroups(groups, true).size, 2);
});

// ── lessons mode ─────────────────────────────────────────────────────────────

test("lessons: the server's conversion is shown as an arrow under the field (O06) and in words in the summary", () => {
  const preview = O.normalizePreview(fixture("O06_preview_lessons"));
  const item = preview.items[0];
  assert.equal(item.lessons.text, "осталось 8 уроков → оплачено до 14.11");
  assert.equal(O.lessonsArrow(item.lessons), "→ оплачено до 14.11");
  assert.equal(O.lessonsArrow({ lessons_left: 0, paid_until: "2026-10-31", text: "" }), "→ долга на начало нет");
  assert.equal(O.lessonsArrow(null), null);
  assert.equal(O.lessonsArrow({ lessons_left: 3, paid_until: null, text: "" }), null);
  assert.equal(O.reviewParts(preview).parts[0], "1 — оплачено до 14.11");
});

// ── the summary before saving ────────────────────────────────────────────────

test("review: the sentence of the owner from the server's figures (O04)", () => {
  const preview = O.normalizePreview(fixture("O04_preview_ok"));
  const review = O.reviewParts(preview);
  assert.equal(review.headline, "Изменится 2 ученика");
  assert.deepEqual(review.parts.map(plain), ["1 — оплачено до 30.11", "1 — долг 550 000 сум"]);
  assert.equal(plain(review.effect), "Должников станет 1, общий долг +550 000 сум");
  assert.equal(plain(O.reviewSentence(preview)), "Изменится 2 ученика: 1 — оплачено до 30.11 · 1 — долг 550 000 сум · Должников станет 1, общий долг +550 000 сум");
  assert.deepEqual(review.notes, []);
});

test("review: 38 students «долга нет» and 4 debts of 1 250 000 in all (the example of the spec)", () => {
  const preview = clone(fixture("O04_preview_ok"));
  const make = (n, target) => ({ ...clone(preview.items[0]), membership_id: `m${n}`, status: "ok", changed: true, kind: target.debt_amount ? "debt" : "paid_until", target });
  preview.items = [
    ...Array.from({ length: 38 }, (_, n) => make(n, { paid_until: "2026-10-31", debt_amount: null, debt_on: null })),
    ...Array.from({ length: 4 }, (_, n) => make(100 + n, { paid_until: null, debt_amount: n === 0 ? 650000 : 200000, debt_on: "2026-10-31" })),
  ];
  preview.summary = { ...preview.summary, items: 42, changed: 42 };
  preview.impact = { ...preview.impact, debtors_before: 8, debtors_after: 12, debt_delta: 1250000 };
  preview.impact.advance_delta = -300000;
  preview.impact.indirect_changed = 2;
  const normal = O.normalizePreview(preview);
  const review = O.reviewParts(normal);
  assert.equal(review.headline, "Изменится 42 ученика");
  assert.deepEqual(review.parts.map(plain), ["38 — долга на начало нет", "4 — долг 1 250 000 сум"]);
  assert.equal(plain(review.effect), "Должников станет 12, общий долг +1 250 000 сум");
  assert.deepEqual(review.notes.map(plain), ["Аванс учеников: −300 000 сум", "Баланс изменится ещё у 2 учеников, связанных переводом"]);
  // nothing moves: the debtors and the debt stay
  const calm = O.normalizePreview({ ...preview, impact: { ...preview.impact, debtors_after: 8, debt_delta: 0, advance_delta: 0, indirect_changed: 0 } });
  assert.equal(O.reviewParts(calm).effect, "Число должников не изменится, общий долг не изменится");
});

test("review: errors per row (O05) are put in words, the reason is needed for the rows with money, «Сохранить» follows", () => {
  const preview = O.normalizePreview(fixture("O05_preview_errors_and_reason"));
  assert.equal(preview.ok, false);
  const errors = O.previewErrors(preview);
  assert.deepEqual(Object.keys(errors).map((id) => id.slice(-3)), ["104"]);
  assert.match(errors[Object.keys(errors)[0]], /не раньше 31\.10\.2026: за более ранние дни внесите как долг/); // the server's cell message
  assert.deepEqual(O.errorRowIds(preview).map((id) => id.slice(-3)), ["104"]);
  assert.equal(O.reasonNeeded(preview), true);
  assert.equal(O.canSave(preview, "сверили с тетрадью"), false); // an error row: not ok
  const ok = O.normalizePreview({ ...fixture("O05_preview_errors_and_reason"), ok: true, items: fixture("O05_preview_errors_and_reason").items.slice(1) });
  assert.equal(O.canSave(ok, ""), false);
  assert.equal(O.canSave(ok, "ab"), false);
  assert.equal(O.canSave(ok, "  сверили  "), true);
  assert.match(O.reasonProblem("ab"), /не короче 3/);
  assert.match(O.reasonProblem("x".repeat(501)), /не длиннее 500/);
  assert.equal(O.reasonProblem("сверка"), null);
  assert.equal(O.canSave(O.normalizePreview(fixture("O04_preview_ok")), ""), true);
  assert.equal(O.canSave(null, ""), false);
  // the soft warnings of the preview that deserve a line (not «HAS_MONEY»: the reason field says it)
  assert.deepEqual(O.previewWarnings(preview), []);
  const warned = O.normalizePreview(fixture("O04_preview_ok"));
  assert.match(O.previewWarnings(warned)[0].text, /ничего не должен на начало/);
});

test("review: a row somebody else changed since the table was read (STALE_VERSION) is refreshed, not shown as an error", () => {
  const raw = clone(fixture("O05_preview_errors_and_reason"));
  raw.items[0].code = "STALE_VERSION";
  raw.items[0].message = "Строку уже изменил кто-то другой";
  const preview = O.normalizePreview(raw);
  assert.deepEqual(O.staleIds(preview).map((id) => id.slice(-3)), ["104"]);
  assert.deepEqual(O.staleIds(O.normalizePreview(fixture("O05_preview_errors_and_reason"))), []); // an OPENING_RANGE row is a real error
  assert.deepEqual(O.staleIds(null), []);
  assert.match(O.itemErrorText("STALE_VERSION", null), /кто-то другой/);
});

test("saved: the toast says how many and what the debt of the centre did (O07, O08)", () => {
  assert.equal(plain(O.appliedText(O.normalizeApplied(fixture("O07_applied")))), "Сохранено: 2 ученика · долг центра +550 000 сум");
  assert.equal(plain(O.appliedText(O.normalizeApplied(fixture("O08_applied_replayed")))), "Сохранено: 2 ученика · долг центра +550 000 сум");
  assert.equal(O.appliedText({ changed: 0, impact: { debt_delta: 0 } }), "Всё уже было так — менять нечего");
  assert.equal(plain(O.appliedText({ changed: 5, impact: { debt_delta: -200000 } })), "Сохранено: 5 учеников · долг центра −200 000 сум");
});

// ── refusals ─────────────────────────────────────────────────────────────────

const errors = fixture("errors");
const asApiError = (name) => {
  const { status, body } = errors[name];
  return { status, code: body.detail.code, message: body.detail.message, detail: body.detail };
};

test("errors: every code of errors.json has the words of the owner, none says «Начисление»", () => {
  for (const code of Object.keys(errors)) {
    const text = O.OPENINGS_ERROR_TEXT[code];
    assert.ok(text && text.length > 10, `no words for ${code}`);
    assert.ok(!/начислени/i.test(text), `${code}: wrong vocabulary`);
    assert.equal(O.classifyOpeningsError(asApiError(code)).message.length > 0, true, code);
  }
  assert.ok(O.OPENINGS_ERROR_TEXT.EMPTY_BATCH);
});

test("errors: STALE_ITEMS carries the fresh rows and a message that keeps the other edits (409)", () => {
  const failure = O.classifyOpeningsError(asApiError("STALE_ITEMS"));
  assert.equal(failure.kind, "stale");
  assert.deepEqual(failure.ids, ["00000000-0000-4000-8000-000000000103"]);
  assert.equal(failure.fresh[0].version, "00000000-0000-4000-8000-0000000003ff");
  assert.deepEqual(failure.fresh[0].opening, { paid_until: "2026-11-30", debt_amount: null, debt_on: null });
  assert.equal(failure.message, "Кто-то уже изменил 1 строку: показали новые значения. Остальные ваши правки сохранены — проверьте и сохраните ещё раз.");
  assert.match(O.staleMessage(3), /изменил 3 строки/);
  assert.match(O.staleMessage(5), /изменил 5 строк:/);
});

test("errors: the stale rows get the saved values of the other user and lose the edits; every other edit stays", () => {
  const { groups } = list();
  const failure = O.classifyOpeningsError(asApiError("STALE_ITEMS"));
  const fresh = O.applyFresh(groups, failure.fresh);
  const row = O.flatRows(fresh).find((x) => x.membership_id.endsWith("103"));
  assert.equal(row.version, "00000000-0000-4000-8000-0000000003ff");
  assert.equal(row.opening.paid_until, "2026-11-30");
  assert.equal(row.missing, false);
  assert.equal(O.flatRows(fresh).find((x) => x.membership_id.endsWith("105")).missing, true); // untouched
  assert.equal(O.flatRows(groups).find((x) => x.membership_id.endsWith("103")).version, "-"); // the old data is not mutated
  const drafts = { [r(103).membership_id]: { ...O.draftOfRow(r(103)), paidUntil: "2026-11-30" }, [r(105).membership_id]: { ...O.draftOfRow(r(105)), debt: "100 000" } };
  assert.deepEqual(Object.keys(O.withoutDrafts(drafts, failure.ids)), [r(105).membership_id]);
  assert.equal(O.applyFresh(groups, []).length, groups.length);
});

test("errors: PREVIEW_STALE carries the fresh preview (digest), BATCH_INVALID the rows, REASON_REQUIRED the ids, 403 is «нет доступа»", () => {
  const stale = O.classifyOpeningsError(asApiError("PREVIEW_STALE"));
  assert.equal(stale.kind, "preview_stale");
  assert.equal(stale.preview.digest, errors.PREVIEW_STALE.body.detail.preview.digest);
  assert.equal(stale.preview.items.length, 3);
  assert.match(stale.message, /проверьте ещё раз/);
  const invalid = O.classifyOpeningsError(asApiError("BATCH_INVALID"));
  assert.equal(invalid.kind, "invalid");
  assert.equal(invalid.items[0].code, "OPENING_RANGE");
  assert.match(O.itemErrorText(invalid.items[0].code, invalid.items[0].message), /не раньше 31\.10\.2026/);
  const reason = O.classifyOpeningsError(asApiError("REASON_REQUIRED"));
  assert.equal(reason.kind, "reason");
  assert.deepEqual(reason.ids, ["00000000-0000-4000-8000-000000000101"]);
  assert.equal(O.classifyOpeningsError(asApiError("TOO_MANY_ROWS")).kind, "too_many_rows");
  assert.equal(O.classifyOpeningsError({ status: 403, message: "Нет доступа" }).kind, "denied");
  assert.equal(O.classifyOpeningsError(asApiError("CONCURRENT_EDIT")).kind, "other");
  assert.equal(O.classifyOpeningsError(new Error("boom"), "Не вышло").message, "boom");
  assert.equal(O.classifyOpeningsError(undefined, "Не вышло").message, "Не вышло");
});

test("errors: every code of an item / a row of a file has words (the server's text only where it names the cell)", () => {
  const itemCodes = ["NOT_FOUND", "STUDENT_ARCHIVED", "MEMBERSHIP_CLOSED", "DUPLICATE_ITEM", "STALE_VERSION", "EMPTY_ITEM", "CLEAR_WITH_VALUES", "OPENING_RANGE", "AMOUNT_RANGE",
    "OPENING_NOT_ALLOWED", "FREE_MEMBERSHIP", "VOID_BREAKS_REFUND", "LESSONS_NOT_APPLICABLE", "LESSONS_RANGE", "LESSONS_AND_PAID_UNTIL"];
  const rowCodes = ["UNKNOWN", "AMBIGUOUS", "ID_MISMATCH", "DUPLICATE", "BAD_DATE", "BAD_AMOUNT", "FORMULA", "ROW_CONFLICT"];
  for (const code of [...itemCodes, ...rowCodes]) {
    const words = O.itemErrorText(code, null);
    assert.ok(words && words.length > 8, `no words for ${code}`);
    assert.ok(!/начислени/i.test(words), code);
    assert.notEqual(words, "строку нельзя сохранить", code);
  }
  assert.equal(O.itemErrorText("SOMETHING_NEW", "Текст сервера"), "Текст сервера");
  assert.equal(O.itemErrorText(null, null), "строку нельзя сохранить");
  assert.equal(O.itemErrorText("BAD_DATE", "Оплачено до: «31.13.2026» — не дата"), "Оплачено до: «31.13.2026» — не дата");
});

test("the one key of a request: kept while the body is the same, new when the items, the reason or the digest change", () => {
  let n = 0;
  const make = () => `key-${++n}`;
  const body = { items: [{ membership_id: "a", version: "-", paid_until: "2026-11-30" }], reason: null, digest: "d1" };
  const first = O.keyForBody(null, body, make);
  assert.equal(first.key, "key-1");
  assert.equal(O.keyForBody(first, { ...body }, make).key, "key-1"); // a retry after a lost answer
  assert.equal(O.keyForBody(first, { ...body, digest: "d2" }, make).key, "key-2");
  assert.equal(O.keyForBody(first, { ...body, reason: "сверка" }, make).key, "key-3");
  assert.equal(O.keyForBody(first, { ...body, items: [] }, make).key, "key-4");
});

// ── Excel ────────────────────────────────────────────────────────────────────

test("excel: the report of the file in words (O09): the counts, the missing students, the rows with the numbers and codes in plain Russian", () => {
  const report = O.normalizeImport(fixture("O09_import_preview"));
  assert.equal(O.excelFileLine(report.file), "Прочитано 6 строк: изменится 2, без изменений 1, ошибок 3 (не найдено 1)");
  assert.equal(O.excelMissingLine(report.file), "В файле нет 4 учеников — у них всё останется как было");
  assert.equal(O.excelMissingLine({ ...report.file, missing_in_file: 0 }), null);
  assert.equal(O.excelFileLine({ rows_read: 1, changed: 0, unchanged: 1, errors: 0, unknown: 0, missing_in_file: 0 }), "Прочитано 1 строку: изменится 0, без изменений 1, ошибок нет");
  const rows = O.excelReportRows(report.rows);
  assert.deepEqual(rows.errors.map((row) => row.row), [5, 6, 7]);
  assert.deepEqual(rows.changes.map((row) => row.row), [2, 3]);
  assert.equal(rows.unchanged, 1);
  assert.deepEqual(rows.errors.map(O.excelRowText), [
    "строка 5: ученик не найден",
    "строка 6: ID не подходит ученику: проверьте, не сдвинулись ли колонки",
    "строка 7: Оплачено до: «31.13.2026» — не дата",
  ]);
  assert.equal(O.excelRowText({ row: 14, code: "UNKNOWN", message: "Ученика нет в центре" }), "строка 14: ученик не найден");
  assert.equal(O.excelRowText({ row: 9, code: "DUPLICATE", message: null }), "строка 9: этот ученик указан в файле дважды — ни одна строка не применена");
  assert.equal(O.excelApplyLabel(2), "Применить 2 изменения");
  assert.equal(O.excelApplyLabel(1), "Применить 1 изменение");
  assert.equal(O.excelApplyLabel(41), "Применить 41 изменение");
  assert.equal(O.excelApplyLabel(5), "Применить 5 изменений");
});

test("excel: «Применить» sends batch_items with the digest of the file preview; a reason is needed when there is money; 0 changes = no button", () => {
  const report = O.normalizeImport(fixture("O09_import_preview"));
  assert.equal(report.batch_items.length, 3);
  assert.deepEqual(report.batch_items[0], { membership_id: "00000000-0000-4000-8000-000000000103", version: "-", paid_until: "2026-11-30", debt_amount: null, debt_on: null, lessons_left: null, clear: false });
  assert.equal(O.canApplyImport(report, ""), true);
  const money = { ...report, needs_reason: [report.batch_items[0].membership_id] };
  assert.equal(O.canApplyImport(money, ""), false);
  assert.equal(O.canApplyImport(money, "сверка"), true);
  assert.equal(O.canApplyImport({ ...report, batch_items: [] }, ""), false);
  assert.equal(O.canApplyImport({ ...report, ok: false }, ""), false);
  assert.equal(O.canApplyImport(null, ""), false);
  // «было → станет» of a row of the file
  const item = report.items[0];
  assert.equal(`${O.valueText(item.before.opening, START)} → ${plain(O.valueText(item.target, START))}`, "не заполнено → оплачено до 30.11");
  const file = fixture("excel");
  assert.equal(file.sheet, "Остатки");
  assert.equal(file.limits.max_changes, 2000);
});

// ── the banner, the checklist, the button ────────────────────────────────────

const summary = (state, missing, extra = {}) => ({ accounting_start: START, state, totals: { memberships: 90, with_opening: 90 - missing, missing, left_available: 0, shown: 0, needs_review: 0, ...extra } });

test("banner: shows only while the state is pending and somebody is missing (every other case is hidden)", () => {
  for (const state of ["none", "pending", "done", "skipped"]) {
    for (const missing of [0, 1, 38]) {
      const expected = state === "pending" && missing > 0;
      assert.equal(O.bannerVisible(summary(state, missing)), expected, `${state}/${missing}`);
    }
  }
  assert.equal(O.bannerVisible(null), false);
  assert.equal(O.bannerVisible(undefined), false);
  assert.equal(O.bannerVisible(O.normalizeSummary(fixture("O03_summary_pending"))), true);
});

test("banner: the sentence and the number on the button of «Оплаты»", () => {
  assert.equal(O.bannerText(38), "Остатки на начало не заполнены у 38 учеников — долги могут быть неточными");
  assert.equal(O.bannerText(1), "Остатки на начало не заполнены у 1 ученика — долги могут быть неточными");
  assert.equal(O.bannerText(21), "Остатки на начало не заполнены у 21 ученика — долги могут быть неточными");
  assert.equal(O.bannerText(5), "Остатки на начало не заполнены у 5 учеников — долги могут быть неточными");
  assert.equal(O.headerBadge(summary("pending", 38)), 38);
  assert.equal(O.headerBadge(summary("pending", 0)), null);
  assert.equal(O.headerBadge(summary("skipped", 38)), null);
  assert.equal(O.headerBadge(summary("done", 0)), null);
  assert.equal(O.openingsHref("/owner/payments"), "/owner/payments/openings");
  assert.equal(O.openingsHref("/admin/payments/"), "/admin/payments/openings");
});

test("checklist: «Дата начала учёта → Остатки на начало → Готово», each step in its state", () => {
  const status = (checklist) => checklist.steps.map((step) => step.status);
  const pending = O.checklistOf(summary("pending", 38));
  assert.deepEqual(status(pending), ["done", "current", "todo"]);
  assert.deepEqual(pending.steps.map((step) => step.key), ["date", "openings", "launch"]);
  assert.equal(pending.steps[0].detail, "01.11.2026");
  assert.equal(pending.steps[0].action, "change_date");
  assert.equal(pending.steps[1].detail, "заполнено 52 из 90");
  assert.equal(pending.steps[1].action, "open");
  assert.equal(pending.steps[2].detail, "с 01.11 центр считает долги");
  assert.equal(pending.launched, false);
  assert.equal(pending.line, null);
  // everything filled: the state is done on the server, the card folds into one line
  const done = O.checklistOf(summary("done", 0));
  assert.deepEqual(status(done), ["done", "done", "done"]);
  assert.equal(done.launched, true);
  assert.equal(done.line, "Учёт оплат запущен с 01.11.2026 ✓");
  // nobody missing even before the state flips (the server turns it a moment later)
  assert.deepEqual(status(O.checklistOf(summary("pending", 0))), ["done", "done", "done"]);
  // «Не нужно»: the centre starts from zero, the step can be reopened
  const skipped = O.checklistOf(summary("skipped", 38));
  assert.deepEqual(status(skipped), ["done", "done", "done"]);
  assert.equal(skipped.steps[1].action, "reopen");
  assert.equal(skipped.steps[1].detail, "пропущено — центр начинает с нуля");
  // «none»: not asked yet - the step is open and works
  assert.deepEqual(status(O.checklistOf(summary("none", 10))), ["done", "current", "todo"]);
});

// ── the screen itself (rendered, no browser) ─────────────────────────────────

function renderer() {
  require.extensions[".tsx"] = (mod, filename) => {
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
  };
  const Module = require("node:module");
  if (!Module.__openingsAlias) {
    const resolveFilename = Module._resolveFilename;
    Module._resolveFilename = function (request, ...rest) {
      return resolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...rest);
    };
    Module.__openingsAlias = true;
  }
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  return { React, html: (element) => renderToStaticMarkup(element) };
}

test("screen: the rows of a group render the student link to ?tab=payments, the fields, the reasons of the locked rows, the lessons input, no table on a phone", () => {
  const { React, html } = renderer();
  const { OpeningsGroups } = require(path.join(root, "src/components/payments/openings-rows.tsx"));
  const groups = list().groups;
  const markup = html(React.createElement(OpeningsGroups, {
    groups,
    drafts: { [r(103).membership_id]: { ...O.draftOfRow(r(103)), paidUntil: "2026-11-30" } },
    problems: { [r(105).membership_id]: "Оплачено до — не раньше 31.10.2026" },
    arrows: { [r(106).membership_id]: "→ оплачено до 14.11" },
    selected: new Set([r(103).membership_id]),
    openIds: new Set(groups.map((g) => g.id)),
    accountingStart: START,
    paidUntilMax: "2027-10-23",
    studentsBase: "/owner/students",
    onToggleOpen() {}, onToggleRow() {}, onToggleGroup() {}, onEdit() {}, onUndo() {},
  }));
  const text = plain(markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " "));
  // the group header: name, teacher, «заполнено x из y»
  assert.match(text, /Математика 9А Иванова А\. заполнено 2 из 4/);
  assert.match(text, /Физика 10Б Петров П\./);
  // the student links lead to the payments tab of the card
  assert.ok(markup.includes(`href="/owner/students/${r(101).student.id}?tab=payments"`));
  // «Сейчас» in words
  assert.match(text, /Оплачено до 30\.11/);
  assert.match(text, /Долг 550 000 сум на 31\.10/);
  assert.match(text, /Не заполнено/);
  // the reasons of the locked rows, no fields there
  assert.match(text, /Пришёл переводом из другой группы/);
  assert.match(text, /Бесплатное обучение/);
  assert.ok(!markup.includes(`aria-label="Оплачено до — Ким Софья"`));
  assert.ok(markup.includes(`aria-label="Оплачено до — Орлова Дана"`));
  // the draft is shown, marked as changed; the problem is under its row
  assert.ok(markup.includes(`data-changed="1"`));
  assert.match(text, /Оплачено до — не раньше 31\.10\.2026/);
  // lessons mode: «Осталось уроков» only for the student of the lessons group, with the arrow of the server once something is typed
  assert.ok(!markup.includes(`aria-label="Осталось уроков — Каримова Алия"`));
  assert.ok(markup.includes(`aria-label="Осталось уроков — Ахмедов Руслан"`));
  // phone: rows are cards (the grid starts at xl), the fields are 16 px (text-base) so iOS does not zoom, nothing forces a horizontal scroll
  assert.ok(markup.includes("xl:grid-cols-["));
  assert.ok(/text-base/.test(markup));
  assert.ok(!/min-w-\[/.test(markup) || !/overflow-x-auto/.test(markup));
  // the selected row and the group checkbox
  assert.ok(markup.includes(`aria-label="Выбрать всю группу Математика 9А"`));
  assert.match(markup, /checked=""[^>]*aria-label="Выбрать: Орлова Дана"|aria-label="Выбрать: Орлова Дана"[^>]*checked=""/);
});

test("screen: with a lessons figure typed the row shows the conversion; without a preview it says the date will appear", () => {
  const { React, html } = renderer();
  const { OpeningsGroups } = require(path.join(root, "src/components/payments/openings-rows.tsx"));
  const groups = list().groups;
  const base = { groups, problems: {}, selected: new Set(), openIds: new Set(groups.map((g) => g.id)), accountingStart: START, paidUntilMax: "2027-10-23", studentsBase: "/admin/students",
    onToggleOpen() {}, onToggleRow() {}, onToggleGroup() {}, onEdit() {}, onUndo() {} };
  const drafts = { [r(106).membership_id]: { ...O.draftOfRow(r(106)), lessons: "8" } };
  const withArrow = html(React.createElement(OpeningsGroups, { ...base, drafts, arrows: { [r(106).membership_id]: "→ оплачено до 14.11" } }));
  assert.match(plain(withArrow.replace(/<[^>]+>/g, " ")), /→ оплачено до 14\.11/);
  const without = html(React.createElement(OpeningsGroups, { ...base, drafts, arrows: {} }));
  assert.match(plain(without.replace(/<[^>]+>/g, " ")), /дата появится после проверки/);
  assert.ok(without.includes(`href="/admin/students/${r(106).student.id}?tab=payments"`));
});

test("screen: a left student has the paid-until field off and the debt field on", () => {
  const { React, html } = renderer();
  const { OpeningsGroups } = require(path.join(root, "src/components/payments/openings-rows.tsx"));
  const left = O.normalizeList(fixture("O02_list_include_left"));
  const markup = html(React.createElement(OpeningsGroups, {
    groups: left.groups, drafts: {}, problems: {}, arrows: {}, selected: new Set(), openIds: new Set(left.groups.map((g) => g.id)), accountingStart: START, paidUntilMax: "2027-10-23", studentsBase: "/owner/students",
    onToggleOpen() {}, onToggleRow() {}, onToggleGroup() {}, onEdit() {}, onUndo() {},
  }));
  const paid = /<input[^>]*aria-label="Оплачено до — Мирзаев Одил"[^>]*>/.exec(markup)[0];
  const debt = /<input[^>]*aria-label="Долг на начало — Мирзаев Одил"[^>]*>/.exec(markup)[0];
  assert.match(paid, /disabled=""/);
  assert.ok(!/disabled=""/.test(debt));
  assert.match(debt, /value="300\u00a0000"/);
  assert.match(plain(markup.replace(/<[^>]+>/g, " ")), /ушёл 30\.06/);
});

test("pages: both routes use the one page; the page guards unsaved edits, handles the conflicts and never writes before «Проверить»", () => {
  const owner = read("src/app/owner/payments/openings/page.tsx");
  const admin = read("src/app/admin/payments/openings/page.tsx");
  assert.match(owner, /OpeningsPage paymentsHref="\/owner\/payments"/);
  assert.match(admin, /OpeningsPage paymentsHref="\/admin\/payments"/);
  const page = read("src/components/payments/openings-page.tsx");
  assert.match(page, /useUnsavedGuard\(dirtyCount > 0, OPENINGS_UNSAVED\)/);
  assert.match(page, /failure\.kind === "stale"/);
  assert.match(page, /failure\.kind === "preview_stale"/);
  assert.match(page, /failure\.kind === "reason"/);
  assert.match(page, /keyForBody\(/);
  assert.match(page, /orgApi\.previewOpeningBatch/);
  assert.match(page, /digest: preview\.digest/);
  assert.match(page, /report\.batch_items/);
  // the only place that applies a batch is confirmSave / applyExcel (both after a preview)
  assert.equal((page.match(/orgApi\.applyOpeningBatch/g) ?? []).length, 2);
  // the money area is for money roles only: a refusal shows the «недоступен» card (the server answers 403)
  assert.match(page, /failure\.kind === "denied"/);
  assert.match(page, /Раздел «Оплаты» недоступен/);
});

test("vocabulary: no screen of the pack says «Начисление» (the one sentence of the lead has «Начисления» and is a constant)", () => {
  const files = ["src/components/payments/openings-page.tsx", "src/components/payments/openings-rows.tsx", "src/components/payments/openings-dialogs.tsx", "src/components/payments/openings-widgets.tsx"];
  for (const file of files) assert.ok(!/начислени/i.test(read(file)), file);
  const lib = read("src/lib/openings.ts").split("\n").filter((line) => /начислени/i.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line));
  assert.equal(lib.length, 1, lib.join("\n"));
  assert.match(lib[0], /Начисления в ALGO идут с этой даты/);
});

test("pieces: the banner, the checklist and the button render from a summary (and nothing when the rules say so)", () => {
  const { React, html } = renderer();
  const W = require(path.join(root, "src/components/payments/openings-widgets.tsx"));
  const text = (markup) => plain(markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim());
  // banner
  const banner = html(React.createElement(W.OpeningsBanner, { paymentsBase: "/owner/payments", summary: summary("pending", 38) }));
  assert.match(text(banner), /Остатки на начало не заполнены у 38 учеников — долги могут быть неточными/);
  assert.ok(banner.includes(`href="/owner/payments/openings"`));
  assert.match(text(banner), /Заполнить/);
  assert.match(text(banner), /Не нужно/);
  for (const hidden of [summary("pending", 0), summary("none", 38), summary("done", 0), summary("skipped", 38), null]) {
    assert.equal(html(React.createElement(W.OpeningsBanner, { paymentsBase: "/owner/payments", summary: hidden })), "");
  }
  // the button of the header: the title, the counter only while the checklist is open
  const link = html(React.createElement(W.OpeningsHeaderLink, { paymentsBase: "/admin/payments", summary: summary("pending", 38) }));
  assert.ok(link.includes(`href="/admin/payments/openings"`));
  assert.match(text(link), /Остатки на начало 38/);
  assert.doesNotMatch(text(html(React.createElement(W.OpeningsHeaderLink, { paymentsBase: "/admin/payments", summary: summary("skipped", 38) }))), /38/);
  // the checklist
  const open = text(html(React.createElement(W.OpeningsChecklist, { paymentsBase: "/owner/payments", summary: summary("pending", 38), onChangeDate() {} })));
  assert.match(open, /Запуск учёта оплат/);
  assert.match(open, /1\. Дата начала учёта — 01\.11\.2026 Изменить/);
  assert.match(open, /2\. Остатки на начало — заполнено 52 из 90 Открыть →/);
  assert.match(open, /3\. Готово — с 01\.11 центр считает долги/);
  const folded = text(html(React.createElement(W.OpeningsChecklist, { paymentsBase: "/owner/payments", summary: summary("done", 0) })));
  assert.match(folded, /Учёт оплат запущен с 01\.11\.2026 ✓/);
  assert.doesNotMatch(folded, /Открыть/);
  assert.match(text(html(React.createElement(W.OpeningsChecklist, { paymentsBase: "/owner/payments", summary: summary("skipped", 38) }))), /пропущено — центр начинает с нуля|Учёт оплат запущен/);
  assert.equal(html(React.createElement(W.OpeningsChecklist, { paymentsBase: "/owner/payments", summary: null })), "");
});

test("the three pieces for the other screens exist and are not wired into the files of the IA pack yet", () => {
  const widgets = read("src/components/payments/openings-widgets.tsx");
  for (const name of ["OpeningsBanner", "OpeningsChecklist", "OpeningsHeaderLink"]) assert.match(widgets, new RegExp(`export function ${name}\\(`));
  // the banner calls the state endpoint with `skipped`, the checklist and the button read the summary
  assert.match(widgets, /setOpeningsState\("skipped"\)/);
  assert.match(read("src/lib/openings-summary.ts"), /getOpeningsSummary\(\)/);
});
