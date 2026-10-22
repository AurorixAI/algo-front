// N13 P1.6 - compact «Пропуски» rows, one action + «⋯», calm «Оплаты» rows.
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
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const lib = (name) => require(path.join(root, `src/lib/${name}.ts`));
const row = lib("excuse-row");
const deadline = lib("excuse-deadline");
const chipTone = lib("chip-tone");
const payments = lib("payments");

// ---- helpers of one row --------------------------------------------------------

test("teacher name is shortened to «Д. Каримова»", () => {
  assert.equal(row.shortPersonName("Дилноза Каримова"), "Д. Каримова");
  assert.equal(row.shortPersonName("  дилноза   каримова "), "Д. каримова");
  assert.equal(row.shortPersonName("Иван Петрович Сидоров"), "И. Сидоров");
  assert.equal(row.shortPersonName("Каримова"), "Каримова");
  for (const empty of ["", "   ", null, undefined]) assert.equal(row.shortPersonName(empty), "", String(empty));
});

test("lesson line «Чт, 15.10» is computed from the calendar day, not the time zone", () => {
  assert.equal(row.lessonShortLabel("2026-10-15"), "Чт, 15.10");
  assert.equal(row.lessonShortLabel("2026-10-13"), "Вт, 13.10");
  assert.equal(row.lessonShortLabel("2026-10-11"), "Вс, 11.10");
  assert.equal(row.lessonShortLabel("2028-02-29"), "Вт, 29.02");
  for (const bad of ["", null, undefined, "nope", "2026-02-30", "2026-13-01"]) assert.equal(row.lessonShortLabel(bad), "", String(bad));
  const before = process.env.TZ;
  try {
    for (const tz of ["UTC", "Pacific/Auckland", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      assert.equal(row.lessonShortLabel("2026-10-15"), "Чт, 15.10", tz);
    }
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
  assert.equal(row.dayMonthRu("2026-10-16"), "16.10");
  assert.equal(row.dayMonthRu("nope"), "");
});

test("certificate link: «справка, N фото», PDF counted apart, «справки нет» when empty", () => {
  const img = { content_type: "image/jpeg" };
  const pdf = { content_type: "application/pdf" };
  assert.equal(row.excuseFilesLabel([]), "справки нет");
  assert.equal(row.excuseFilesLabel(null), "справки нет");
  assert.equal(row.excuseFilesLabel([img]), "справка, 1 фото");
  assert.equal(row.excuseFilesLabel([img, img, img]), "справка, 3 фото");
  assert.equal(row.excuseFilesLabel([pdf]), "справка, 1 PDF");
  assert.equal(row.excuseFilesLabel([img, img, pdf]), "справка, 2 фото, 1 PDF");
});

test("decided tabs: «Подтвердил: test admin», then the time and the note as muted text", () => {
  const item = (over) => ({ status: "confirmed", reviewed_by: { name: "test admin" }, reviewed_at: "2026-10-15T16:35:12", review_note: null, ...over });
  assert.equal(row.excuseDecisionLabel(item({})), "Подтвердил: test admin");
  assert.equal(row.excuseDecisionLabel(item({ status: "rejected" })), "Отклонил: test admin");
  assert.equal(row.excuseDecisionLabel(item({ reviewed_by: null })), "Подтвердил");
  assert.equal(row.excuseDecisionLabel(item({ status: "pending" })), "");
  // the year appears only when it is not the current one
  assert.equal(row.excuseDecisionWhen(item({}), "2026"), "15.10 16:35");
  assert.equal(row.excuseDecisionWhen(item({}), "2027"), "15.10.2026 16:35");
  assert.equal(row.excuseDecisionWhen(item({ reviewed_at: "2025-12-31T23:59:00" }), "2026"), "31.12.2025 23:59");
  // an explicit zone is shown on the Tashkent clock: 19:30Z on the 14th is 00:30 on the 15th there
  assert.equal(row.excuseDecisionWhen(item({ reviewed_at: "2026-10-14T19:30:00Z" }), "2026"), "15.10 00:30");
  for (const bad of [null, undefined, "", "nope"]) assert.equal(row.excuseDecisionWhen(item({ reviewed_at: bad }), "2026"), "", String(bad));
  // the note is inline, not only in a tooltip
  assert.equal(row.excuseDecisionDetail(item({ review_note: "Справка принесена в офис" }), "2026"), "15.10 16:35 · «Справка принесена в офис»");
  assert.equal(row.excuseDecisionDetail(item({ review_note: "  " }), "2026"), "15.10 16:35");
  assert.equal(row.excuseDecisionDetail(item({ reviewed_at: null, review_note: "Только примечание" }), "2026"), "«Только примечание»");
  assert.equal(row.excuseDecisionDetail(item({ reviewed_at: null }), "2026"), "");
});

test("the certificate picker offers photos only on a touch screen so Android shows the camera", () => {
  assert.equal(row.excusePickerAccept(false), "image/*,application/pdf");
  assert.equal(row.excusePickerAccept(true), "image/*");
  const page = read("src/components/attendance/excuses-page.tsx");
  assert.match(page, /matchMedia\("\(pointer: coarse\)"\)/);
  assert.match(page, /accept=\{excusePickerAccept\(coarsePointer\)\}/);
  assert.equal((page.match(/type="file"/g) || []).length, 1); // still one picker, one «Прикрепить справку»
  assert.equal((page.match(/Прикрепить справку/g) || []).length, 1);
});

test("journal deep link keeps tab, month, lesson and date from the lesson key", () => {
  const item = { lesson_date: "2026-10-09", lesson_key: "2026-10-09_s1", group: { id: "g-1" } };
  assert.equal(row.excuseLessonId(item), "s1");
  assert.equal(row.excuseJournalHref("/admin/groups", item), "/admin/groups/g-1?tab=attendance&month=2026-10&lesson=s1&date=2026-10-09");
  assert.equal(row.excuseJournalHref("/owner/groups", item), "/owner/groups/g-1?tab=attendance&month=2026-10&lesson=s1&date=2026-10-09");
  // a lesson without its own id is stored as lesson_<date>
  const bare = { lesson_date: "2026-10-09", lesson_key: "2026-10-09_lesson_2026-10-09", group: { id: "g-1" } };
  assert.equal(row.excuseLessonId(bare), "lesson_2026-10-09");
  // an unexpected key still opens the month, without a highlight
  for (const key of ["", null, undefined, "other", "2026-10-09_"]) {
    const odd = { lesson_date: "2026-10-09", lesson_key: key, group: { id: "g-1" } };
    assert.equal(row.excuseLessonId(odd), null, String(key));
    assert.equal(row.excuseJournalHref("/admin/groups", odd), "/admin/groups/g-1?tab=attendance&month=2026-10", String(key));
  }
});

// ---- the deadline column is in words now (UX-1 B): see tests/n13-ux1b.test.cjs ------------------

// ---- one palette for deadline and payment chips -----------------------------------------

test("payment status chips use the same grey / amber / red as the deadline chips", () => {
  const classes = payments.STATUS_TONE_CLASS;
  assert.equal(classes.danger, chipTone.CHIP_TONE_CLASS.danger);
  assert.equal(classes.warning, chipTone.CHIP_TONE_CLASS.warn);
  for (const quiet of ["ok", "free", "muted"]) assert.equal(classes[quiet], chipTone.CHIP_TONE_CLASS.neutral, quiet);
  assert.match(chipTone.CHIP_TONE_CLASS.danger, /rose/);
  assert.match(chipTone.CHIP_TONE_CLASS.warn, /amber/);
  assert.match(chipTone.CHIP_TONE_CLASS.neutral, /slate/);
  // no loud colours left in the chip palette
  assert.doesNotMatch(JSON.stringify(chipTone.CHIP_TONE_CLASS), /emerald|green|sky/);
  assert.equal(payments.statusTone("active"), "ok");
});

// ---- the screens ---------------------------------------------------------------------

test("«Пропуски»: «Подтвердить» (primary) and «Отклонить» (secondary) side by side + «⋯», no note field in the row, no separate camera button", () => {
  const page = read("src/components/attendance/excuses-page.tsx");
  assert.match(page, /RowMenu/);
  // IA audit F6: the menu keeps the three rare actions; the journal and the card are links of the row
  assert.doesNotMatch(page, /label: "Открыть журнал"|label: "Карточка ученика"/);
  for (const label of ["Отклонить…", "Прикрепить справку", "Подтвердить с примечанием…", "Сбросить решение"]) {
    assert.ok(page.includes(label), label);
  }
  assert.match(page, /excuseJournalHref\(groupsBasePath, item\)/);
  // owner decision 20.10: both decisions sit side by side in every waiting row; the filled one is the main action, the outlined one is calm (not red: it is reversible)
  assert.match(page, /bg-emerald-600 px-3 text-xs font-semibold text-white/);
  assert.match(page, /border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700/);
  assert.doesNotMatch(page, /Примечание \(необязательно\)|aria-label="Примечание к решению"/);
  assert.doesNotMatch(page, /Снять фото|capture=|Camera/);
  assert.match(page, /справки нет|excuseFilesLabel/);
  assert.match(page, /xl:line-clamp-2/); // reason clamps to two lines on the wide layout
  // the reason is in full on a card, two lines + click-to-expand on the wide table; author and time under it
  assert.match(page, /<ExpandableText text=\{item\.reason\} meta=\{reasonMeta\(item\)\} \/>/);
  assert.match(page, /aria-expanded=\{interactive \? expanded : undefined\}/);
  assert.match(page, /expanded \? "" : "xl:line-clamp-2"/);
  assert.doesNotMatch(page, /line-clamp-3/);
  assert.match(read("src/lib/excuse-row.ts"), /formatDateTimeRu\(at\)/);
  // ...and in the confirmation dialog (#103), which shows the student, the lesson and the reason before any request
  const body = read("src/components/attendance/excuse-decision-body.tsx");
  assert.match(body, /label="Причина"/);
  assert.match(body, /single\.reasonMeta/);
  assert.match(page, /<ExcuseDecisionDialog target=\{dialog\}/);
  // the phone is not in the list (owner 21.10): it lives in the student's card
  assert.doesNotMatch(page, /<Phone|item\.student\.phone/);
  // the decided tabs show the time and the note inline
  assert.match(page, /excuseDecisionDetail\(item, businessToday\.slice\(0, 4\)\)/);
  assert.doesNotMatch(page, /decisionTitle|cursor-help/);
  // the lesson cell shows the short teacher name
  assert.match(page, /shortPersonName\(item\.teacher\?\.name\)/);
  // the decided tabs show the decision instead of the deadline
  assert.match(page, /excuseDecisionLabel\(item\)/);
  assert.match(page, /pendingTab \? "Срок" : "Решение"/);
});

test("the camera button is gone from every screen", () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  for (const file of walk(path.join(root, "src")).filter((f) => /\.(tsx?|jsx?)$/.test(f))) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /Снять фото|capture="environment"/, file);
  }
});

test("the groups base path reaches the excuses list for the journal link", () => {
  assert.match(read("src/components/attendance/attendance-section.tsx"), /<ExcusesPage studentProfileBasePath=\{studentProfileBasePath\} groupsBasePath=\{groupsBasePath\} \/>/);
});

test("«Оплаты»: one «Внести оплату» + «⋯», unset fee reads «не задана»", () => {
  const page = read("src/components/payments/payments-page.tsx");
  assert.match(page, /не задана/);
  assert.doesNotMatch(page, /monthly_fee !== null \? formatMoney\(row\.monthly_fee\) : "—"/);
  assert.match(page, /\{PAY_ACTION_LABEL\}/); // one verb for a first, an overdue and a running payment
  assert.equal(page.split("<RowMenu items={menu} label={`Действия: ${row.student_name}`} />").length - 1, 1); // a single action cell for cards and the table, named by its student
  assert.equal((page.match(/<PayButton row=\{row\} onPay=\{onPay\} \/>/g) || []).length, 1);
  assert.doesNotMatch(page, /bg-emerald-600|bg-rose-600|bg-red-600/);
});
