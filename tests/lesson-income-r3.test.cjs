// R3 fixes of #124 (the lesson sheet) and INCOME-2 («Поступления» v2): the confirm of the move follows the live check, the exam precheck
// reads `canCancel:false` first, the stale codes, a lesson of today that has begun, the till of the centre, «внесена …» of the journal,
// the empty text of a month bar, the period tabs on a 320 px phone.
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
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/income2", `${name}.json`), "utf8"));
const C = require(path.join(root, "src/lib/schedule-card-actions.ts"));
const V = require(path.join(root, "src/lib/payments-income-v2.ts"));
const plain = (text) => text.replace(/[\u00a0\u202f]/g, " ");
const err = (code) => ({ status: 409, code, message: "server", detail: { code, message: "server" } });

function renderer() {
  require.extensions[".tsx"] = (mod, filename) => {
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
  };
  const Module = require("node:module");
  if (!Module.__r3Alias) {
    const resolveFilename = Module._resolveFilename;
    Module._resolveFilename = function (request, ...rest) {
      return resolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...rest);
    };
    Module.__r3Alias = true;
  }
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  return {
    React,
    text: (element) => plain(renderToStaticMarkup(element).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")),
    html: (element) => renderToStaticMarkup(element),
    P: require(path.join(root, "src/components/payments/income-parts.tsx")),
    J: require(path.join(root, "src/components/payments/income-journal.tsx")),
  };
}

// ── #124 ─────────────────────────────────────────────────────────────────────────────────────────

test("the confirm of the move is on only for a live answer «ok»: off while loading, after a failure, before the first check, on !ok", () => {
  const ok = { ok: true };
  assert.equal(C.moveConfirmDisabled({ checking: false, failed: false, check: ok }), false, "a live ok answer");
  assert.equal(C.moveConfirmDisabled({ checking: true, failed: false, check: null }), true, "loading");
  assert.equal(C.moveConfirmDisabled({ checking: true, failed: false, check: ok }), true, "loading wins over an old answer");
  assert.equal(C.moveConfirmDisabled({ checking: false, failed: true, check: null }), true, "failed");
  assert.equal(C.moveConfirmDisabled({ checking: false, failed: false, check: null }), true, "has not run yet");
  assert.equal(C.moveConfirmDisabled({ checking: false, failed: false, check: { ok: false } }), true, "!ok");
  assert.equal(C.moveConfirmDisabled({ busy: true, checking: false, failed: false, check: ok }), true, "saving");
  // the sheet uses it, says «Не удалось проверить время» with «Повторить», and answers only for the values it asked for
  const sheet = read("src/components/groups/lesson-action-sheet.tsx");
  assert.match(sheet, /moveConfirmDisabled\(\{ checking: pending, failed: checkError !== null, check \}\)/);
  assert.match(sheet, /mode === "reschedule" && confirmDisabled/);
  assert.match(sheet, /Не удалось проверить время/);
  assert.match(sheet, /setCheckNonce\(\(value\) => value \+ 1\)\}[^>]*><RefreshCw className="h-3 w-3" \/>Повторить/);
  assert.match(sheet, /result\.key === checkKey/);
});

test("the exam precheck: canCancel:false blocks even with state «none»; none + true is free", () => {
  const blocked = C.examCancelState({ state: "none", title: null, canCancel: false, message: null });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.tone, "error");
  assert.match(blocked.message, /активным экзаменом/);
  const withMessage = C.examCancelState({ state: "none", title: null, canCancel: false, message: "Экзамен идёт" });
  assert.deepEqual([withMessage.blocked, withMessage.message], [true, "Экзамен идёт"]);
  const free = C.examCancelState({ state: "none", title: null, canCancel: true, message: null });
  assert.deepEqual([free.blocked, free.message], [false, null]);
  assert.equal(C.examCancelState({ state: "none" }).blocked, false, "no canCancel at all: free");
  assert.equal(C.examCancelState({ state: "unavailable", canCancel: false }).retry, true, "unavailable still retries");
});

test("the stale set: changed, decided, cancelled, gone, group archived, started → «Обновить»; a busy teacher is not stale", () => {
  assert.deepEqual([...C.STALE_LESSON_CODES].sort(), ["GROUP_ARCHIVED", "LESSON_ALREADY_STARTED", "LESSON_CANCELLED", "LESSON_CHANGED", "LESSON_NOT_FOUND", "SUBSTITUTION_ALREADY_DECIDED"]);
  for (const code of C.STALE_LESSON_CODES) {
    assert.equal(C.isLessonChanged(err(code)), true, code);
    assert.equal(C.isStaleLessonCode(code), true, code);
    assert.ok(C.lessonMoveErrorText(err(code)).length > 5, code);
  }
  for (const code of ["TEACHER_BUSY", "GROUP_BUSY", "MOVE_IN_PAST", "LESSON_HAS_NO_TEACHER"]) assert.equal(C.isLessonChanged(err(code)), false, code);
  assert.equal(C.isLessonChanged(new Error("network")), false);
  assert.match(C.lessonMoveErrorText(err("LESSON_CANCELLED")), /отменён/);
  assert.match(C.lessonMoveErrorText(err("LESSON_NOT_FOUND")), /больше нет/);
  assert.match(C.lessonMoveErrorText(err("GROUP_ARCHIVED")), /в архиве/);
  // the sheet shows «Обновить» for the stale refusals of both modes
  const sheet = read("src/components/groups/lesson-action-sheet.tsx");
  assert.match(sheet, /setStale\(isLessonChanged\(cause\)\);\n\s+if \(mode === "reschedule"\)/);
});

test("the move-check says an origin refusal (ok:false + code/message) inline, stale ones with «Обновить»", () => {
  const base = { teacherConflicts: [], groupConflicts: [], warnings: [] };
  const started = C.lessonMoveCheckLines({ ok: false, code: "LESSON_ALREADY_STARTED", message: "server text", ...base });
  assert.deepEqual([started.ok, started.stale, started.code], [false, true, "LESSON_ALREADY_STARTED"]);
  assert.match(started.lines[0], /уже начался/);
  const cancelled = C.lessonMoveCheckLines({ ok: false, code: "LESSON_CANCELLED", ...base });
  assert.match(cancelled.lines[0], /отменён/);
  assert.equal(cancelled.stale, true);
  const unknown = C.lessonMoveCheckLines({ ok: false, code: "SOMETHING_NEW", message: "Свой текст сервера", ...base });
  assert.deepEqual([unknown.lines, unknown.stale], [["Свой текст сервера"], false]);
  assert.equal(C.lessonMoveCheckLines({ ok: false, ...base }).lines[0], "Это время недоступно");
  assert.equal(C.lessonMoveCheckLines({ ok: true, ...base }).code, null, "an older server: no code at all");
  const sheet = read("src/components/groups/lesson-action-sheet.tsx");
  assert.match(sheet, /checkLines\.stale && onRefresh && refreshButton/);
});

test("a lesson of TODAY whose start has passed (business time) is marked, not moved or cancelled", () => {
  const base = { role: "owner", archived: false, today: "2026-10-22", hasTeacherInfo: true, state: "scheduled", date: "2026-10-22", startTime: "10:00" };
  const before = new Date("2026-10-22T04:30:00Z"); // 09:30 in Tashkent
  const after = new Date("2026-10-22T06:00:00Z");  // 11:00 in Tashkent
  assert.deepEqual(C.scheduleCardActions({ ...base, now: before }), ["assign", "reschedule", "cancel"]);
  assert.deepEqual(C.scheduleCardActions({ ...base, now: after }), ["mark", "assign"]);
  assert.deepEqual(C.scheduleCardActions({ ...base, now: new Date("2026-10-22T05:00:00Z") }), ["mark", "assign"], "10:00 exactly = started");
  assert.deepEqual(C.scheduleCardActions({ ...base, now: after, hasTeacherInfo: false }), ["mark"]);
  // the business day, not the device's: 01:00 on the 22nd in Tashkent is still the 21st in UTC
  assert.deepEqual(C.scheduleCardActions({ ...base, now: new Date("2026-10-21T20:00:00Z") }), ["assign", "reschedule", "cancel"]);
  // no start time: the server decides, the lesson of today stays a future one
  assert.deepEqual(C.scheduleCardActions({ ...base, startTime: null, now: after }), ["assign", "reschedule", "cancel"]);
  // another day: tomorrow is never started, yesterday always is
  assert.equal(C.lessonHasStarted({ date: "2026-10-23", today: "2026-10-22", startTime: "00:00", now: after }), false);
  assert.equal(C.lessonHasStarted({ date: "2026-10-21", today: "2026-10-22", startTime: "23:00", now: before }), true);
  // the label of «assign» follows the same rule
  assert.equal(C.assignActionLabel({ past: C.lessonHasStarted({ date: "2026-10-22", today: "2026-10-22", startTime: "10:00", now: after }), lacksTeacher: false, isSubstitution: false }), "Назначить того, кто провёл");
  assert.equal(C.SCHEDULE_ACTION_LABEL.mark, "Отметить посещаемость");
  const overview = read("src/components/groups/group-schedule-overview.tsx");
  assert.equal((overview.match(/startTime: lesson\.startTime \|\| lesson\.start_time \}\)/g) || []).length, 3, "the card, the sheet and the label of «assign» pass the start time");
  assert.match(overview, /past: Boolean\(lesson && lessonHasStarted\(/);
});

// ── INCOME-2 ─────────────────────────────────────────────────────────────────────────────────────

test("«Должники» of the debt card carries the group / teacher the screen is narrowed to", () => {
  const { React, html, P } = renderer();
  const overview = V.normalizeOverview(fixture("I01_income_month_october"));
  const view = (scope) => html(React.createElement(P.IncomeOverviewView, { overview, today: "2026-10-21", paymentsBase: "/owner/payments", activeBucket: null, onPick: () => {}, scope }));
  assert.match(view(undefined), /href="\/owner\/payments\?bucket=debt"/);
  assert.match(view({ groupId: "g1", teacherId: "" }), /href="\/owner\/payments\?bucket=debt&amp;group_id=g1"/);
  assert.match(view({ groupId: "", teacherId: "t 1" }), /href="\/owner\/payments\?bucket=debt&amp;teacher_id=t\+1"/);
  assert.match(view({ groupId: "g1", teacherId: "t1" }), /bucket=debt&amp;group_id=g1"/);
  const page = read("src/components/payments/income-page.tsx");
  assert.match(page, /scope=\{\{ groupId: filters\.groupId, teacherId: filters\.teacherId \}\}/);
});

test("the till block keeps the server's centre-wide scope through the normalizer (the cash line of the donut card reads it)", () => {
  const { React, text, P } = renderer();
  const day = V.normalizeOverview(fixture("I02_income_day_today_cash"));
  assert.deepEqual([V.normalizeOverview({ ...fixture("I02_income_day_today_cash"), cash: { ...fixture("I02_income_day_today_cash").cash, scope: "centre", filtered_view: true } }).cash.scope, V.normalizeOverview(fixture("I02_income_day_today_cash")).cash.filtered_view], ["centre", false]);
  assert.equal(day.cash.expected, 150000);
  const o = { ...day, by_method: [{ method: "cash", label: "Наличные", amount: 250000, count: 2 }] };
  const body = text(React.createElement(P.IncomeOverviewView, { overview: o, today: "2026-10-21", paymentsBase: "/owner/payments", activeBucket: null, onPick: () => {}, cashToday: day.cash }));
  assert.ok(body.includes("Сегодня наличными: 150 000 сум — столько должно быть в кассе"));
  assert.ok(!text(React.createElement(P.IncomeOverviewView, { overview: o, today: "2026-10-21", paymentsBase: "/owner/payments", activeBucket: null, onPick: () => {} })).includes("Сегодня наличными"));
});

test("the journal: time only when paid_time is there; «внесена …» quietly in the drawer and as a grey line of the phone card, not a column", () => {
  const { React, text, html, J } = renderer();
  const rows = V.normalizeJournal(fixture("J01_journal_page1")).rows;
  const timed = rows[0];
  assert.ok(timed.paid_time, "the fixture has a time");
  const back = { ...timed, id: "back", paid_time: null, entered_at_text: "внесена 21.10 в 11:40" };
  const list = (row) => React.createElement(J.JournalList, { rows: [row], withYear: false, activeId: null, onOpen: () => {} });
  // with a time: «dd.mm · hh:mm»
  assert.ok(text(list(timed)).includes(`${V.journalRowView(timed).date} · ${timed.paid_time}`));
  // back-dated: the date alone, the entered line is the grey second line of the phone card (hidden from md), no new column
  const backText = text(list(back));
  assert.ok(!backText.includes(" · 11:40") && backText.includes("внесена 21.10 в 11:40"));
  const markup = html(list(back));
  assert.match(markup, /data-testid="journal-entered" class="[^"]*text-slate-400[^"]*md:hidden"/);
  assert.match(markup, /md:grid-cols-\[6\.5rem_minmax\(0,1\.4fr\)_minmax\(0,1\.2fr\)_9rem_8\.5rem\]/, "still five columns");
  assert.ok(!/data-testid="journal-entered"/.test(html(list(timed))), "an older server: no line");
  // the view and the drawer
  assert.equal(V.journalRowView(back).time, "");
  assert.equal(V.journalRowView(back).enteredAt, "внесена 21.10 в 11:40");
  assert.equal(V.drawerView(back).when, require(path.join(root, "src/lib/payments.ts")).formatDateRu(back.paid_on), "the date alone");
  assert.equal(V.drawerView(back).entered, "внесена 21.10 в 11:40");
  assert.equal(V.drawerView({ ...timed, entered_at_text: undefined }).entered, null);
  const drawer = React.createElement(J.JournalDrawerBody, { row: back, paymentsBase: "/owner/payments", studentProfileBasePath: "/owner/students" });
  assert.ok(text(drawer).includes("внесена 21.10 в 11:40"));
  assert.match(html(drawer), /class="[^"]*text-slate-400[^"]*" data-testid="drawer-entered"/);
  assert.ok(!html(React.createElement(J.JournalDrawerBody, { row: timed, paymentsBase: "/owner/payments", studentProfileBasePath: "/owner/students" })).includes("drawer-entered"));
  // the normalizer keeps the server's text and drops an empty one
  assert.equal(V.normalizeJournal({ ...fixture("J01_journal_page1"), rows: [{ ...timed, entered_at_text: "внесена 21.10 в 11:40" }, { ...timed, entered_at_text: "" }] }).rows.map((r) => r.entered_at_text).join("|"), "внесена 21.10 в 11:40|");
});

test("a month bar's empty journal says the month: «В октябре оплат не было»; a day: «В этот день»; anything else: the period's words", () => {
  const e = (kind, focusLabel, year = "2026") => V.journalEmptyText({ kind, focusLabel, narrowed: false, year });
  assert.equal(e("month", "Октябрь 2026 г."), "В октябре оплат не было");
  assert.equal(e("custom", "Сентябрь 2026 г."), "В сентябре оплат не было");
  assert.equal(e("custom", "Декабрь 2025 г."), "В декабре 2025 оплат не было", "another year is named");
  assert.equal(e("month", "Октябрь 2026 г.", ""), "В октябре 2026 оплат не было", "no year known: it stays");
  assert.equal(e("month", "7 октября"), "В этот день оплат не было");
  assert.equal(e("month", "21 октября 2025"), "В этот день оплат не было");
  assert.equal(e("month", "что-то своё"), "За этот месяц оплат не было");
  assert.equal(e("custom", "что-то своё"), "За этот период оплат не было");
  assert.equal(V.journalEmptyText({ kind: "month", focusLabel: "Октябрь 2026 г.", narrowed: true }), "По этому запросу оплат не нашлось");
  // the label a month bar really carries
  const overview = V.normalizeOverview({ ...fixture("I01_income_month_october"), series_by: "month", series: [{ bucket: "2026-10", received: 5, count: 1 }] });
  const bar = V.chartBars(overview, "2026-10-21")[0];
  assert.equal(V.journalEmptyText({ kind: "custom", focusLabel: bar.range.label, narrowed: false, year: "2026" }), "В октябре оплат не было");
  assert.match(read("src/components/payments/income-page.tsx"), /year: today\.slice\(0, 4\)/);
});
