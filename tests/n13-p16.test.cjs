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

test("decided tabs: «Подтвердил: test admin · 15.10», the note goes to the tooltip", () => {
  const item = (over) => ({ status: "confirmed", reviewed_by: { name: "test admin" }, reviewed_at: "2026-10-15T16:35:12", ...over });
  assert.equal(row.excuseDecisionLabel(item({})), "Подтвердил: test admin · 15.10");
  assert.equal(row.excuseDecisionLabel(item({ status: "rejected" })), "Отклонил: test admin · 15.10");
  assert.equal(row.excuseDecisionLabel(item({ reviewed_by: null })), "Подтвердил: 15.10");
  assert.equal(row.excuseDecisionLabel(item({ reviewed_at: null })), "Подтвердил: test admin");
  assert.equal(row.excuseDecisionLabel(item({ reviewed_by: null, reviewed_at: null })), "Подтвердил");
  assert.equal(row.excuseDecisionLabel(item({ status: "pending" })), "");
  // an explicit zone is shown on the Tashkent clock: 19:30Z on the 14th is 00:30 on the 15th there
  assert.equal(row.excuseDecisionLabel(item({ reviewed_at: "2026-10-14T19:30:00Z" })), "Подтвердил: test admin · 15.10");
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

// ---- deadline chip -----------------------------------------------------------------

const today = "2026-10-15";
const pending = (deadlineValue, over = {}) => ({ lesson_date: "2026-10-03", status: "pending", deadline: deadlineValue, ...over });
const chip = (value, over) => deadline.excuseDeadlineChip(pending(value, over), today);

test("calendar deadline: grey far away, amber in 3 days or less, red when over", () => {
  assert.deepEqual(chip({ kind: "date", date: "2026-10-31", overdue: false, days_left: 16 }),
    { text: "до 31.10 · 16 дн.", tone: "neutral", title: "Подтвердить до 31.10 · осталось 16 дн." });
  assert.equal(chip({ kind: "date", date: "2026-10-19", overdue: false, days_left: 4 }).tone, "neutral");
  assert.deepEqual(
    (({ text, tone }) => ({ text, tone }))(chip({ kind: "date", date: "2026-10-18", overdue: false, days_left: 3 })),
    { text: "до 18.10 · 3 дн.", tone: "warn" });
  assert.equal(chip({ kind: "date", date: "2026-10-17", overdue: false, days_left: 2 }).text, "до 17.10 · 2 дн.");
  assert.equal(chip({ kind: "date", date: "2026-10-17", overdue: false, days_left: 2 }).tone, "warn");
  assert.deepEqual(
    (({ text, tone }) => ({ text, tone }))(chip({ kind: "date", date: "2026-10-15", overdue: false, days_left: 0 })),
    { text: "до 15.10 · сегодня", tone: "warn" });
  assert.deepEqual(
    (({ text, tone }) => ({ text, tone }))(chip({ kind: "date", date: "2026-10-12", overdue: true, days_left: -3 })),
    { text: "срок прошёл", tone: "danger" });
  // days_left is optional: it is counted from the date
  assert.equal(chip({ kind: "date", date: "2026-10-31", overdue: false }).text, "до 31.10 · 16 дн.");
  assert.equal(chip({ kind: "date", date: "2026-10-10", overdue: false }).tone, "danger");
});

test("lessons package: urgent is amber, used up is red", () => {
  const pick = (value) => { const c = chip(value); return { text: c.text, tone: c.tone }; };
  assert.deepEqual(pick({ kind: "lessons", lessons_left: 8, urgent: false, overdue: false }), { text: "пакет: осталось 8 уроков", tone: "neutral" });
  assert.deepEqual(pick({ kind: "lessons", lessons_left: 2, urgent: true, overdue: false }), { text: "пакет: осталось 2 урока", tone: "warn" });
  assert.deepEqual(pick({ kind: "lessons", lessons_left: 1, urgent: true, overdue: false }), { text: "пакет: осталось 1 урок", tone: "warn" });
  assert.deepEqual(pick({ kind: "lessons", lessons_left: 0, urgent: true, overdue: true }), { text: "пакет закончился", tone: "danger" });
  assert.deepEqual(pick({ kind: "lessons", lessons_left: 0, urgent: false, overdue: false }), { text: "пакет закончился", tone: "danger" });
  assert.equal(chip({ kind: "lessons", lessons_left: 2, urgent: true, overdue: false }).title, "Подтвердить до конца пакета · осталось 2 урока");
});

test("no server value or a broken one: the month end of the lesson is used", () => {
  const pick = (c) => c && { text: c.text, tone: c.tone };
  assert.deepEqual(pick(chip(undefined)), { text: "до 31.10 · 16 дн.", tone: "neutral" });
  assert.deepEqual(pick(chip(null)), { text: "до 31.10 · 16 дн.", tone: "neutral" });
  assert.deepEqual(pick(chip(undefined, { lesson_date: "2026-09-20" })), { text: "срок прошёл", tone: "danger" });
  const last = deadline.excuseDeadlineChip({ lesson_date: "2026-10-03", status: "pending" }, "2026-10-29");
  assert.deepEqual(pick(last), { text: "до 31.10 · 2 дн.", tone: "warn" });
  assert.deepEqual(pick(deadline.excuseDeadlineChip({ lesson_date: "2026-10-03", status: "pending" }, "2026-10-31")), { text: "до 31.10 · сегодня", tone: "warn" });
  for (const broken of [{}, { kind: "date" }, { kind: "date", date: "31.10" }, { kind: "lessons" }, { kind: "x" }, "soon", 7]) {
    assert.deepEqual(pick(chip(broken)), { text: "до 31.10 · 16 дн.", tone: "neutral" }, JSON.stringify(broken));
  }
  assert.equal(chip(undefined, { lesson_date: "nope" }), null);
});

test("decided excuses have no deadline chip", () => {
  for (const status of ["confirmed", "rejected"]) {
    assert.equal(chip({ kind: "date", date: "2026-10-31", overdue: false, days_left: 16 }, { status }), null, status);
  }
});

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

test("«Пропуски»: one outline «Подтвердить» + «⋯», no note field in the row, no separate camera button", () => {
  const page = read("src/components/attendance/excuses-page.tsx");
  assert.match(page, /RowMenu/);
  for (const label of ["Отклонить…", "Приложить справку", "Подтвердить с примечанием…", "Открыть журнал", "Карточка ученика", "Сбросить решение"]) {
    assert.ok(page.includes(label), label);
  }
  assert.match(page, /excuseJournalHref\(groupsBasePath, item\)/);
  assert.match(page, /border-emerald-300 bg-white[^"]*text-emerald-700/); // outline, not filled
  assert.doesNotMatch(page, /bg-emerald-600 px-3|Примечание \(необязательно\)|aria-label="Примечание к решению"/);
  assert.doesNotMatch(page, /Снять фото|capture=|Camera/);
  assert.match(page, /справки нет|excuseFilesLabel/);
  assert.match(page, /xl:line-clamp-2/); // reason clamps to two lines on the wide layout
  // the reason's author and time live in the tooltip of the reason
  assert.match(page, /title=\{reasonTitle\}/);
  assert.match(page, /formatDateTimeRu\(item\.reason_at\)/);
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

test("«Оплаты»: one «Продлить» / «Внести» + «⋯», unset fee reads «не задана»", () => {
  const page = read("src/components/payments/payments-page.tsx");
  assert.match(page, /не задана/);
  assert.doesNotMatch(page, /monthly_fee !== null \? formatMoney\(row\.monthly_fee\) : "—"/);
  assert.match(page, /row\.last_payment \? "Продлить" : "Внести"/);
  assert.equal((page.match(/<RowMenu items=\{menu\} \/>/g) || []).length, 1); // a single action cell for cards and the table
  assert.equal((page.match(/<PayButton row=\{row\} onPay=\{onPay\} \/>/g) || []).length, 1);
  assert.doesNotMatch(page, /bg-emerald-600|bg-rose-600|bg-red-600/);
});
