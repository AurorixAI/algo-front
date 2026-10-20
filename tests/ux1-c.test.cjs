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

const teacher = (id, types, name = id) => ({
  teacher_id: id, teacher_name: name, lessons_count: 5,
  lesson_types: types.map(([lesson_type, suggested_percent]) => ({ lesson_type, groups: 1, suggested_percent })),
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

test("PayrollMonthStatus: one line - status, «Как считается», «Делитель — в настройках»; no amber card, no accordion", () => {
  const { PayrollMonthStatus } = require(path.join(root, "src/components/payroll/month-status.tsx"));
  const open = renderToStaticMarkup(React.createElement(PayrollMonthStatus, { month: "2026-10", open: true, divisor: 12 }));
  const text = textOf(open);
  assert.ok(text.includes("Октябрь ещё идёт — расчёт предварительный"));
  assert.ok(text.includes("Как считается"));
  assert.ok(text.includes("Делитель — в настройках"));
  assert.match(open, /href="\/owner\/settings\?section=payroll"/);
  assert.doesNotMatch(open, /<details|bg-amber-50\b|border-amber/); // no card, no accordion
  assert.doesNotMatch(text, /Месяц ещё не закончился|Оплата в месяц × %/);
  // the explanation is a dialog, closed until asked for
  assert.doesNotMatch(text, /Пример\./);
  const closed = textOf(renderToStaticMarkup(React.createElement(PayrollMonthStatus, { month: "2026-09", open: false, divisor: 12 })));
  assert.doesNotMatch(closed, /ещё идёт/);
  assert.ok(closed.includes("Как считается") && closed.includes("Делитель — в настройках"));
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

test("a percent that is not set is a calm hint until the owner tries to calculate; a wrong value is an error at once", () => {
  assert.deepEqual(R.percentFieldState("", false), { kind: "pending" });
  assert.deepEqual(R.percentFieldState("  ", false), { kind: "pending" });
  assert.deepEqual(R.percentFieldState("", true), { kind: "error", message: R.PERCENT_REQUIRED_TEXT });
  assert.deepEqual(R.percentFieldState("45", false), { kind: "ok" });
  assert.deepEqual(R.percentFieldState("33,5", true), { kind: "ok" });
  assert.deepEqual(R.percentFieldState("101", false), { kind: "error", message: R.PERCENT_MAX_TEXT });
  assert.deepEqual(R.percentFieldState(".", false), { kind: "error", message: R.PERCENT_FORMAT_TEXT });
  assert.equal(R.PERCENT_HINT_TEXT, "Укажите процент — это делается один раз");
  assert.equal(R.percentInputId(R.percentKey("t1", "group")), "payroll-percent-t1_group");
});

test("the gate of «Рассчитать»: off until every teacher of the scope has a percent, with the count of those left", () => {
  const teachers = [teacher("t1", [["group", "45"], ["pair", null]]), teacher("t2", [["individual", "60"]]), teacher("t3", [["group", null]])];
  assert.deepEqual(R.teachersNeedingPercent(teachers, {}).map((t) => t.teacher_id), ["t1", "t3"]);
  const all = R.calculationGate(teachers, {}, "all");
  assert.equal(all.ready, false);
  assert.deepEqual([all.missing, all.total], [2, 3]);
  assert.equal(all.text, "Чтобы рассчитать всех, укажите процент: осталось 2 из 3 преподавателей");
  // typing the percents opens the gate, and the text goes
  const typed = { [R.percentKey("t1", "pair")]: "40", [R.percentKey("t3", "group")]: "50" };
  const ready = R.calculationGate(teachers, typed, "all");
  assert.deepEqual([ready.ready, ready.missing, ready.text], [true, 0, null]);
  assert.equal(R.buildCalculateBody(teachers, typed, new Set()) !== null, true); // the body the gate lets through exists
  // a wrong percent keeps it shut
  assert.equal(R.calculationGate(teachers, { ...typed, [R.percentKey("t3", "group")]: "101" }, "all").ready, false);
  // the selected only: the others' missing percents do not matter
  const chosen = R.calculationGate(teachers.filter((t) => t.teacher_id === "t2"), {}, "selected");
  assert.deepEqual([chosen.ready, chosen.text], [true, null]);
  assert.equal(R.calculationGate(teachers.filter((t) => t.teacher_id !== "t2"), {}, "selected").text,
    "Чтобы рассчитать выбранных, укажите процент: осталось 2 из 2 преподавателей");
  // one teacher, nobody
  assert.equal(R.calculationGate([teachers[0]], {}, "all").text, "Чтобы рассчитать, укажите процент преподавателя");
  assert.equal(R.calculationGate([teachers[0]], {}, "selected").text, "Чтобы рассчитать выбранного, укажите процент преподавателя");
  assert.deepEqual(R.calculationGate([], {}, "all"), { ready: false, missing: 0, total: 0, text: null });
  // the number of teachers declines
  const many = Array.from({ length: 21 }, (_, i) => teacher(`m${i}`, [["group", null]]));
  assert.equal(R.calculationGate(many, {}, "all").text, "Чтобы рассчитать всех, укажите процент: осталось 21 из 21 преподавателя");
});

test("the row of a teacher: the calm hint is not red; after an attempt the field shows the error next to it", () => {
  const { TeacherRow } = require(path.join(root, "src/components/payroll/payroll-month-page.tsx"));
  const t = teacher("t1", [["group", null]], "Иванов Пётр");
  const render = (props) => renderToStaticMarkup(React.createElement(TeacherRow, {
    teacher: t, typed: {}, showErrors: false, selected: false, calculating: false,
    onToggle: () => {}, onType: () => {}, onCalculate: () => {}, onOpen: () => {}, onExport: () => {}, ...props,
  }));
  const calm = render({});
  assert.ok(textOf(calm).includes("Укажите процент — это делается один раз"));
  assert.doesNotMatch(calm, /rose-/); // nothing is red
  assert.match(calm, /aria-invalid="false"/);
  const tried = render({ showErrors: true });
  assert.doesNotMatch(textOf(tried), /это делается один раз/);
  assert.match(tried, /<p id="payroll-percent-t1_group-error"[^>]*text-rose-700[^>]*>Укажите процент<\/p>/);
  assert.match(tried, /aria-invalid="true"/);
  // typed: no hint
  const typed = render({ typed: { [R.percentKey("t1", "group")]: "50" } });
  assert.doesNotMatch(textOf(typed), /это делается один раз|Укажите процент/);
  // two kinds, one of them set: one hint for the row, not one per field
  const two = render({ teacher: teacher("t1", [["group", "45"], ["pair", null]], "Иванов Пётр") });
  assert.equal((textOf(two).match(/это делается один раз/g) ?? []).length, 1);
});

test("the month page wires the gate: no toast for a state the screen prevents, errors only after an action", () => {
  const page = read("src/components/payroll/payroll-month-page.tsx");
  assert.match(page, /calculationGate\(teachers, typed, "all"\)/);
  assert.match(page, /disabled=\{!overview \|\| teachers\.length === 0 \|\| calculating \|\| !allGate\.ready\}/);
  assert.match(page, /id="payroll-calculate-hint"/);
  assert.match(page, /aria-describedby=\{allGate\.text \? "payroll-calculate-hint" : undefined\}/);
  // the old red toast and the global flag are gone
  assert.doesNotMatch(page, /Укажите процент для каждого типа занятий — без него расчёт не запускается/);
  assert.doesNotMatch(page, /setShowErrors|calculateButtonLabel/);
  // a refused row's «Рассчитать» marks its teacher and focuses the field
  assert.match(page, /markAttempted\(problems\.map\(\(problem\) => problem\.teacherId\)\)/);
  assert.match(page, /document\.getElementById\(percentInputId\(/);
  assert.match(page, /showErrors=\{attempted\.has\(teacher\.teacher_id\)\}/);
  // a server's PERCENT_REQUIRED after an action is still shown (a real answer to a real action)
  assert.match(page, /isPercentRequired\(cause as PayrollErrorLike\)\) markAttempted\(scope\.map/);
});

// ---- 3. the bar over the selected -----------------------------------------------------------------------------------

test("the selection checkboxes have a real bulk action: a bar with the count, «Рассчитать выбранных», «Снять выбор»", () => {
  const page = read("src/components/payroll/payroll-month-page.tsx");
  assert.match(page, /selected\.size > 0 && \(\s*<div\s+role="region"\s+aria-label="Действия над выбранными"/);
  assert.match(page, /Выбрано: \{selected\.size\} из \{teachers\.length\}/);
  assert.match(page, /onClick=\{\(\) => void calculate\(selected\)\}/);
  assert.match(page, /disabled=\{calculating \|\| !selectedGate\.ready\}/);
  assert.match(page, /\}\s*Рассчитать выбранных\s*<\/button>/);
  assert.match(page, />\s*Снять выбор\s*</);
  // the top button always means everybody (one main button: it steps back while a bar is on screen)
  assert.match(page, /onClick=\{\(\) => void calculate\(new Set\(\)\)\}/);
  // the API has no Excel of several chosen sheets (one sheet or the whole month): no such button
  assert.doesNotMatch(page, /Скачать Excel выбранных/);
  // what the old label did is kept: the selected calculate with teacher_ids
  const teachers = [teacher("t1", [["group", "45"]]), teacher("t2", [["individual", "60"]])];
  assert.deepEqual(R.buildCalculateBody(teachers, {}, new Set(["t2"])),
    { percents: [{ teacher_id: "t2", lesson_type: "individual", percent: "60" }], teacher_ids: ["t2"] });
});

// ---- 4. sentence-case headers ---------------------------------------------------------------------------------------

test("the payroll pages have no ALL CAPS headers: no `uppercase`, «Итого» instead of «ИТОГО»", () => {
  for (const file of ["payroll-month-page.tsx", "payroll-sheet-page.tsx", "sheet-table.tsx", "sheet-controls.tsx", "month-status.tsx", "how-it-works.tsx"]) {
    const text = read(`src/components/payroll/${file}`);
    assert.doesNotMatch(text, /\buppercase\b|tracking-wide|tracking-wider/, file);
    assert.doesNotMatch(text, /ИТОГО/, file);
  }
  assert.match(read("src/components/payroll/sheet-table.tsx"), /<span className="text-sm font-semibold">Итого<\/span>/);
  assert.match(read("src/components/payroll/sheet-table.tsx"), /const HEAD = "px-2 py-2 text-left text-xs font-semibold text-slate-500 /);
});

// ---- 5. the price of the group --------------------------------------------------------------------------------------

test("a scheduled price in one small line: «с 01.11 — 480 000», the year only when it is not this one, 0 is «бесплатно»", () => {
  const row = (amount, valid_from, over = {}) => ({ id: valid_from, amount, valid_from, note: null, created_by_name: null, created_at: null, is_current: false, is_future: true, changes: [], ...over });
  assert.equal(plain(G.scheduledPriceText(row(480000, "2026-11-01"), "2026-10-20")), "с 01.11 — 480 000");
  assert.equal(plain(G.scheduledPriceText(row(480000, "2027-01-15"), "2026-10-20")), "с 15.01.2027 — 480 000");
  assert.equal(plain(G.scheduledPriceText(row(0, "2026-11-01"), "2026-10-20")), "с 01.11 — бесплатно");
  assert.equal(plain(G.scheduledPriceText(row(480000, "2026-11-01"), null)), "с 01.11.2026 — 480 000");
  const history = [
    row(520000, "2026-12-01"), row(480000, "2026-11-01"),
    row(500000, "2026-10-01", { is_future: false, is_current: true }), row(450000, "2000-01-01", { is_future: false }),
  ];
  assert.deepEqual(G.scheduledPriceLines(history, "2026-10-20").map(plain), ["с 01.11 — 480 000", "с 01.12 — 520 000"]); // the soonest first
  assert.deepEqual(G.scheduledPriceLines([], "2026-10-20"), []);
  assert.deepEqual(G.scheduledPriceLines(null, "2026-10-20"), []);
});

test("the group price block is one line under the title, with the history behind «История цены»", () => {
  const block = read("src/components/groups/group-price-block.tsx");
  assert.doesNotMatch(block, /text-2xl|rounded-2xl|shadow-sm|uppercase|Wallet/); // no big card, no big number, no caps heading
  assert.match(block, /История цены\s*<ChevronDown/);
  assert.match(block, /aria-expanded=\{historyOpen\}/);
  assert.match(block, /Запланировано: \{upcoming\.join\("; "\)\}/);
  assert.match(block, /\{current \? "Изменить цену" : "Задать цену"\}/);
  assert.match(block, /Цена не задана/);
  assert.match(block, /aria-label="Цена группы"/); // the region keeps its name
  // the dialogs are the same ones
  assert.match(block, /<GroupPriceDialog/);
  assert.match(block, /<GroupPriceCancelDialog/);
  for (const role of ["owner", "admin"]) {
    const page = read(`src/app/${role}/groups/[id]/page.tsx`);
    // inside the header card, hidden while the group is edited (it stays mounted: no new read on leaving the form)
    const card = page.slice(page.indexOf("Group header card"), page.indexOf("{/* Tabs */}"));
    assert.match(card, /<GroupPriceBlock[\s\S]*className=\{editing \? "hidden" : "mt-3 sm:pl-\[4\.5rem\]"\}/, role);
    assert.doesNotMatch(page, /bg-gradient-to-r from-primary-500 via-violet-400 to-emerald-400/, role);
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
