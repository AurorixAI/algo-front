// UX-1 stream C - «Зарплата и группа»: one calm status line over the payroll, guided setup of the percents (a hint instead of a
// premature red error, the buttons wait for the percents), a bar over the selected, sentence-case headers, and the price of
// the group as one compact line under its title.
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
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const R = require(path.join(root, "src/lib/payroll.ts"));
const G = require(path.join(root, "src/lib/group-price.ts"));
/** Normal spaces instead of the non-breaking ones: what the user reads. */
const plain = (text) => text.replace(/[  ]/g, " ");
const textOf = (html) => plain(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

/** `types`: [lesson type, the rate in force or null]; a type with no rate is in `missing_rates`. */
const teacher = (id, types, name = id) => ({
  teacher_id: id, teacher_name: name, lessons_count: 5,
  lesson_types: types.map(([lesson_type]) => ({ lesson_type, groups: 1 })),
  rates: Object.fromEntries(types.filter(([, percent]) => percent !== null).map(([type, percent]) => [type, percent])),
  missing_rates: types.filter(([, percent]) => percent === null).map(([type]) => type),
  sheet: null, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 },
});

// ---- 1. the status line ---------------------------------------------------------------------------------------------

test("the month status: the name of the month in the nominative, only for an open month", () => {
  assert.equal(R.monthNameRu("2026-10"), "Октябрь");
  assert.equal(R.monthNameRu("2026-03"), "Март");
  assert.equal(R.monthNameRu("2026-05"), "Май");
  assert.equal(R.monthStatusText("2026-10", true), "Октябрь ещё идёт — расчёт предварительный");
  assert.equal(R.monthStatusText("2026-02", true), "Февраль ещё идёт — расчёт предварительный");
  assert.equal(R.monthStatusText("2026-09", false), null);
});

test("PayrollMonthSummary: one line - «К выплате за …: N сум · сохранено X из Y»; «Как считается» and «Делитель» sit in the «⋯» menu, not next to the text", () => {
  const { PayrollMonthSummary } = require(path.join(root, "src/components/payroll/month-status.tsx"));
  const teachers = [{ sheet: { total_amount: 900000 } }, { sheet: { total_amount: 510415 } }, { sheet: null }];
  const summary = R.monthSummary("2026-10", teachers);
  const open = renderToStaticMarkup(React.createElement(PayrollMonthSummary, { summary, month: "2026-10", open: true }));
  const text = textOf(open);
  assert.ok(text.includes("К выплате за октябрь: 1 410 415 сум · сохранено 2 из 3"));
  assert.ok(text.includes("Октябрь ещё идёт — расчёт предварительный"));
  assert.doesNotMatch(text, /Как считается|Делитель/); // no floating links
  assert.doesNotMatch(open, /<details|bg-amber-50\b|border-amber/); // no card, no accordion
  const closed = textOf(renderToStaticMarkup(React.createElement(PayrollMonthSummary, { summary: R.monthSummary("2026-09", [{ sheet: null }]), month: "2026-09", open: false })));
  assert.doesNotMatch(closed, /ещё идёт/);
  assert.ok(closed.includes("К выплате за сентябрь: — · сохранено 0 из 1"));
  // the menu: the explanation in a dialog (closed until asked for) and the divisor in the settings
  const menu = read("src/components/payroll/month-status.tsx");
  assert.match(menu, /label: "Как считается"/);
  assert.match(menu, /label: "Делитель в настройках"[\s\S]*?\/owner\/settings\?section=payroll/);
  assert.match(menu, /<PayrollHowItWorksDialog open=\{helpOpen\}/);
  for (const page of ["payroll-month-page.tsx", "payroll-sheet-page.tsx"]) assert.match(read(`src/components/payroll/${page}`), /<PayrollPageMenu divisor=/, page);
});

test("«Как считается»: the formula (with the centre's name of the price), the rules and the example in one dialog body", () => {
  const { PayrollHowItWorksBody } = require(path.join(root, "src/components/payroll/how-it-works.tsx"));
  const body = textOf(renderToStaticMarkup(React.createElement(PayrollHowItWorksBody, { divisor: 12, priceLabel: "Оплата в месяц" })));
  assert.ok(body.includes("Оплата в месяц × % ÷ 12 × засчитанные уроки"));
  assert.ok(body.includes("600 000 сум × 50 % ÷ 12 × 3 урока = 75 000 сум"));
  const pack = textOf(renderToStaticMarkup(React.createElement(PayrollHowItWorksBody, { divisor: 8, priceLabel: "Стоимость пакета" })));
  assert.ok(pack.includes("Стоимость пакета × % ÷ 8 × засчитанные уроки"));
  const dialog = read("src/components/payroll/how-it-works.tsx");
  assert.match(dialog, /import \{ Modal \} from "@\/components\/ui\/modal"/); // the common dialog
  assert.doesNotMatch(dialog, /<details/);
});

// ---- 2. guided setup of the percents --------------------------------------------------------------------------------

test("the gate of «Рассчитать всех»: off until every teacher has a rate, one short hint with the count of those left", () => {
  const teachers = [teacher("t1", [["group", "45"], ["pair", null]]), teacher("t2", [["individual", "60"]]), teacher("t3", [["group", null]])];
  const all = R.calculationGate(teachers);
  assert.equal(all.ready, false);
  assert.deepEqual([all.missing, all.total], [2, 3]);
  assert.equal(all.text, "Не задана ставка у 2 преподавателей");
  // the rates are set in «Сотрудники»: the gate opens when none is missing, and the text goes
  const ready = R.calculationGate([teachers[1]]);
  assert.deepEqual([ready.ready, ready.missing, ready.text], [true, 0, null]);
  assert.equal(R.calculationGate([teachers[0]]).text, "Не задана ставка у 1 преподавателя");
  assert.deepEqual(R.calculationGate([]), { ready: false, missing: 0, total: 0, text: null });
  // the number of teachers declines
  const many = Array.from({ length: 21 }, (_, i) => teacher(`m${i}`, [["group", null]]));
  assert.equal(R.calculationGate(many).text, "Не задана ставка у 21 преподавателя");
  // the rate cell of a row says the same: «Не задана · Указать» (the link is the row's), a partial one names the type
  assert.deepEqual(R.monthRateSummary(teachers[2]), { text: "Не задана", missing: true });
  assert.deepEqual(R.monthRateSummary(teachers[0]), { text: "Группа 45% · Парный не задана", missing: true });
  assert.deepEqual(R.monthRateSummary(teachers[1]), { text: "Индивидуально 60%", missing: false });
  assert.deepEqual(R.monthRateSummary(teacher("t4", [["individual", "40"], ["group", "33.5"]])), { text: "Группа 33,5% · Индивидуально 40%", missing: false });
  assert.deepEqual(R.monthRateSummary({ rates: {}, missing_rates: [], lesson_types: [] }), { text: "—", missing: false });
});

test("the month page wires the gate: no toast for a state the screen prevents, the rate is set in «Сотрудниках»", () => {
  const page = read("src/components/payroll/payroll-month-page.tsx");
  assert.match(page, /calculationGate\(teachers\)/);
  assert.match(page, /disabled=\{!overview \|\| teachers\.length === 0 \|\| busy \|\| !gate\.ready\}/);
  assert.match(page, /id="payroll-calculate-hint"/);
  assert.match(page, /aria-describedby=\{gate\.text \? "payroll-calculate-hint" : undefined\}/);
  assert.match(page, /Указать в «Сотрудниках»/);
  // no percent is typed, kept or sent from this page any more
  assert.doesNotMatch(page, /percentKey|monthPercentText|percentProblems|buildCalculateBody|markAttempted|PercentEditor|sanitizePercentTyping/);
  // a server's refusal for want of a rate (a real answer to a real action) refreshes the table, whose rates are what the buttons wait for
  assert.match(page, /isRateRequired\(cause as PayrollErrorLike\)\) void load\(true\)/);
  assert.match(page, /\{ teacher_ids: ids \}/); // only the teachers are sent (never an empty body: that would mean everybody)
});

// ---- 3. the bar over the selected -----------------------------------------------------------------------------------

test("no checkboxes without an action: a row has one button by its status; «Рассчитать всех» is the one main button of the page", () => {
  const page = read("src/components/payroll/payroll-month-page.tsx");
  assert.doesNotMatch(page, /type="checkbox"|Рассчитать выбранных|Снять выбор|Действия над выбранными|selectedGate/);
  assert.match(page, /onClick=\{\(\) => void calculate\(calculationScope\(teachers\)\.map\(\(teacher\) => teacher\.teacher_id\), true\)\}/);
  assert.match(page, /rowAction\(teacher\.sheet\)/);
  assert.match(page, /const run = action\.kind === "open" \? onOpen : onCalculate;/);
  // the API has no Excel of several chosen sheets (one sheet or the whole month): no such button
  assert.doesNotMatch(page, /Скачать Excel выбранных/);
  // the table has the shared header: identity left, rate and status centred, the money right, the action column without a title
  assert.match(page, /labels=\{\["Преподаватель", "Ставка", "К выплате", "Статус", ""\]\}/);
  assert.match(page, /aligns=\{\["left", "center", "right", "center", "right"\]\}/);
  // what the old label did is kept: the teachers to calculate travel as teacher_ids
  assert.deepEqual(R.rowAction(null), { kind: "calculate", label: "Рассчитать" });
  assert.deepEqual(R.rowAction({ stale: false }), { kind: "open", label: "Открыть" });
  // data changed: the row opens the sheet, whose card has the one «Пересчитать» (a single path to a new version)
  assert.deepEqual(R.rowAction({ stale: true }), { kind: "open", label: "Открыть" });
});

// ---- 4. sentence-case headers ---------------------------------------------------------------------------------------

test("the payroll pages have no ALL CAPS headers: no `uppercase`, «Итого» instead of «ИТОГО»", () => {
  for (const file of ["payroll-month-page.tsx", "payroll-sheet-page.tsx", "sheet-table.tsx", "sheet-controls.tsx", "month-status.tsx", "how-it-works.tsx", "sheet-summary.tsx", "rate-dialog.tsx"]) {
    const text = read(`src/components/payroll/${file}`);
    assert.doesNotMatch(text, /\buppercase\b|tracking-wide|tracking-wider/, file);
    assert.doesNotMatch(text, /ИТОГО/, file);
  }
  assert.match(read("src/components/payroll/sheet-table.tsx"), /Итого по группе/);
  assert.match(read("src/components/payroll/sheet-table.tsx"), /const HEAD = "px-2 py-2 text-left text-xs font-semibold text-slate-500 /);
});

// ---- 5. the price of the group --------------------------------------------------------------------------------------

test("the page «Цены групп»: the cells say the price, the scheduled price, the individual prices; a save or a cancel patches the row", () => {
  assert.equal(plain(G.priceCellText({ amount: 500000, valid_from: "2026-10-21" })), "500 000 сум");
  assert.equal(G.priceCellText({ amount: 0, valid_from: "2026-10-21" }), "бесплатно");
  assert.equal(G.priceCellText(null), null);
  assert.equal(plain(G.scheduledCellText({ row_id: "r", amount: 520000, valid_from: "2026-12-01" })), "520 000 сум с 01.12.2026");
  assert.equal(G.scheduledCellText(null), null);
  assert.equal(G.individualPricesText(0), null);
  assert.equal(G.individualPricesText(1), "1 ученик");
  assert.equal(G.individualPricesText(2), "2 ученика");
  assert.equal(G.individualPricesText(5), "5 учеников");
  assert.equal(G.individualPricesText(11), "11 учеников");
  assert.equal(G.individualPricesText(21), "21 ученик");
  assert.equal(G.priceColumnLabel("Оплата в месяц"), "Цена в месяц");
  assert.equal(G.priceColumnLabel("Стоимость пакета"), "Стоимость пакета");
  const item = (name) => ({ group_id: name, name, teacher_id: null, teacher_name: null, kind: "group", current: null, scheduled: null, scheduled_count: 0, students_with_override: 0 });
  assert.deepEqual(G.filterGroupPrices([item("Алгебра 8А"), item("Геометрия")], "  АЛГЕ ").map((i) => i.name), ["Алгебра 8А"]);
  assert.equal(G.filterGroupPrices([item("a"), item("b")], "").length, 2);
  const row = (amount, valid_from, over = {}) => ({ id: valid_from, amount, valid_from, note: null, created_by_name: null, created_at: null, is_current: false, is_future: true, changes: [], ...over });
  const history = [
    row(520000, "2026-12-01"), row(480000, "2026-11-01"),
    row(500000, "2026-10-01", { is_future: false, is_current: true }), row(450000, "2000-01-01", { is_future: false }),
  ];
  const patched = G.rowWithPrices({ ...item("g"), students_with_override: 3 }, { current: { amount: 500000, valid_from: "2026-10-01", note: null }, history });
  assert.deepEqual(patched.current, { amount: 500000, valid_from: "2026-10-01" });
  assert.deepEqual(patched.scheduled, { row_id: "2026-11-01", amount: 480000, valid_from: "2026-11-01" }); // the soonest
  assert.equal(patched.scheduled_count, 2);
  assert.equal(patched.students_with_override, 3);
  assert.equal(G.rowWithPrices(item("g"), { current: null, history: [] }).current, null);
  assert.equal(G.rowWithPrices(item("g"), { current: null, history: null }).scheduled, null);
  assert.equal(G.GROUP_PRICES_SEARCH_FROM, 9); // a search box above 8 groups
});

test("the page «Цены групп» is the one place of the group price: a table with the shared header, actions, empty state; the group header has no price line", () => {
  const page = read("src/components/payments/group-prices-page.tsx");
  assert.match(page, /<TableHeader[\s\S]*labels=\{\["Группа", priceColumnLabel\(label\), "Запланировано", "Индивидуальные цены", ""\]\}[\s\S]*aligns=\{\["left", "center", "center", "center", "right"\]\}/);
  assert.match(page, /\{item\.current \? "Изменить цену" : "Задать цену"\}/);
  assert.match(page, /label: "История цены"/);
  assert.match(page, /Не задана/);
  assert.match(page, /Групп пока нет/);
  assert.match(page, /showToast\(item\.current \? "Цена группы изменена" : "Цена группы задана"\)/);
  assert.match(page, /<GroupPriceDialog/);
  assert.match(page, /<GroupPriceCancelDialog/);
  assert.match(page, /<GroupPriceHistoryModal/);
  assert.match(page, /const searchable = items\.length >= GROUP_PRICES_SEARCH_FROM;/);
  // «Оплаты» leads here (a secondary button on the right of the header), the page leads back
  assert.match(read("src/components/payments/payments-page.tsx"), /href=\{pricesBaseOf\(groupsBasePath\)\}[\s\S]*?Цены групп/);
  assert.match(page, /<Link href=\{paymentsHref\}[\s\S]*?Оплаты\s*<\/Link>/);
  for (const role of ["owner", "admin"]) {
    const group = read(`src/app/${role}/groups/[id]/page.tsx`);
    assert.doesNotMatch(group, /<GroupPriceBlock|GroupPriceDialog/, role);
    assert.doesNotMatch(group, /bg-gradient-to-r from-primary-500 via-violet-400 to-emerald-400/, role);
  }
});

test("no decorative colour strip on the group header and the group cards (it encoded nothing: the same three colours everywhere)", () => {
  assert.doesNotMatch(read("src/components/groups/group-card.tsx"), /via-violet-400|gradient ribbon/i);
  const { GroupCard } = require(path.join(root, "src/components/groups/group-card.tsx"));
  const base = { id: "g1", org_id: "o", name: "Алгебра", class_level: 8, teacher_id: "t", teacher_name: "Иванов", description: null, status: "active", max_students: 20, student_count: 5, created_at: null };
  const html = renderToStaticMarkup(React.createElement(GroupCard, { group: { ...base, price_current: { amount: 500000, valid_from: "2026-10-01" } }, href: "/owner/groups/g1" }));
  assert.doesNotMatch(html, /via-violet-400|from-primary-500/);
  assert.match(textOf(html), /500 000 сум\/мес/); // the card still shows the price
});
