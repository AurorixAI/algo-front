// #159 U1-U5, front: the screen «Замены» by the remarks of the owner of 29.10 - the deadline («Срок») in ONE function, the line of the requests that close on the 1st in plain
// words, the comment of a teacher is a mark (not text) in the row, the payments are a section of the table under the requests with «Просит оплатить» only when the asker did not hold the lesson.
// Spec: artifacts/analysis/P159_SPEC.md, section U; LESSONS 17, 46, 50, 52, 55, 56.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const compile = (jsx) => (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText, filename);
};
require.extensions[".ts"] = compile(false);
require.extensions[".tsx"] = compile(true);
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const S = require(path.join(root, "src/lib/substitutions.ts"));
const O = require(path.join(root, "src/lib/one-off.ts"));
const cells = require(path.join(root, "src/components/substitutions/journal-cells.tsx"));
const DEC = require(path.join(root, "src/components/substitutions/one-off-decisions.tsx"));
const text = (html) => html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|").replace(/&amp;/g, "&").replace(/&#x27;/g, "'");

const req = (over = {}) => ({
  id: "r1", status: "pending", origin: "teacher", reasonCode: "sick", reasonLabel: "Болезнь", comment: null, group: { id: "g1", name: "7-А" },
  lesson: { lessonId: "l1", date: "2026-10-31", startTime: "10:00", endTime: "11:30" }, teacher: { id: "t1", name: "Иванов А." }, minutesToStart: 3000, urgent: false, overdue: false, ...over,
});

// ── U1: one function of the deadline ────────────────────────────────────────────────────────────────

test("U1: the colour of the deadline follows the time that is left - calm over a day, amber under a day, a soft red under two hours", () => {
  assert.deepEqual(S.deadlineOf(req({ minutesToStart: 3000 })), { text: "через 2 дня", tone: "calm" }, "50 hours are two days, not «50 ч»");
  assert.deepEqual(S.deadlineOf(req({ minutesToStart: 24 * 60 })), { text: "через 1 день", tone: "calm" }, "exactly a day is still calm");
  assert.deepEqual(S.deadlineOf(req({ minutesToStart: 5 * 1440 })), { text: "через 5 дней", tone: "calm" });
  assert.deepEqual(S.deadlineOf(req({ minutesToStart: 24 * 60 - 1 })), { text: "через 23 ч", tone: "soon" });
  assert.deepEqual(S.deadlineOf(req({ minutesToStart: 300 })), { text: "через 5 ч", tone: "soon" });
  assert.deepEqual(S.deadlineOf(req({ minutesToStart: 120 })), { text: "через 2 ч", tone: "soon" });
  assert.deepEqual(S.deadlineOf(req({ minutesToStart: 119 })), { text: "через 2 ч", tone: "now" });
  assert.deepEqual(S.deadlineOf(req({ minutesToStart: 20 })), { text: "через 20 мин", tone: "now" });
  assert.equal(S.deadlineOf(req({ status: "substituted", minutesToStart: 20 })), null, "a decided request has no deadline");
});

test("U1: a lesson that is on is a soft red «Урок уже начался»; one that is over is grey «урок прошёл · закроется …»", () => {
  assert.deepEqual(S.deadlineOf(req({ overdue: true, minutesToStart: -30 })), { text: "Урок уже начался", tone: "now" });
  assert.deepEqual(S.deadlineOf(req({ overdue: true, minutesToStart: -95, lesson: { lessonId: "l", date: "2026-09-28", startTime: "10:00", endTime: "11:30" } })), { text: "урок прошёл · закроется 1 нояб.", tone: "past" });
  assert.deepEqual(S.deadlineOf(req({ overdue: true, minutesToStart: -2820, lesson: { lessonId: "l", date: "2026-10-27", startTime: "10:00", endTime: "11:30" } })), { text: "урок прошёл · закроется 1 дек.", tone: "past" });
  assert.deepEqual(S.deadlineOf(req({ overdue: true, minutesToStart: -2820, lesson: { lessonId: "l", date: "", startTime: "10:00", endTime: "11:30" } })), { text: "урок прошёл", tone: "past" }, "no date, no day: nothing is invented");
});

test("U1: the closing day is the 1st of the month AFTER NEXT (the window of the unclosed lessons starts on the 1st of the previous month: server test_s20, a lesson of 26.10 falls out on 01.12)", () => {
  assert.equal(S.closeDateOf("2026-09-30"), "2026-11-01");
  assert.equal(S.closeDateOf("2026-10-26"), "2026-12-01");
  assert.equal(S.closeDateOf("2026-11-15"), "2027-01-01", "over the year");
  assert.equal(S.closeDateOf("2026-12-31"), "2027-02-01");
  assert.equal(S.closeDateOf(""), null);
  assert.equal(S.closeDateOf(undefined), null);
  assert.equal(S.shortDateLabel("2026-11-01"), "1 нояб.");
  assert.equal(S.shortDateLabel("2027-01-01"), "1 янв.");
  assert.equal(S.longDateLabel("2026-10-31"), "31 октября");
  assert.equal(S.longDateLabel("2026-05-01"), "1 мая");
});

test("U1: the cell is one line, no solid fill; the grey text has no frame; the header «Срок» is centred", () => {
  const soon = renderToStaticMarkup(React.createElement(cells.DeadlineBadge, { item: req({ minutesToStart: 300 }) }));
  assert.match(text(soon), /через 5 ч/);
  assert.match(soon, /bg-amber-50/);
  const now = renderToStaticMarkup(React.createElement(cells.DeadlineBadge, { item: req({ minutesToStart: 30 }) }));
  assert.match(now, /bg-rose-50/);
  assert.match(now, /text-rose-700/);
  for (const html of [soon, now, renderToStaticMarkup(React.createElement(cells.DeadlineBadge, { item: req({ overdue: true, minutesToStart: -2820 }) }))]) {
    assert.doesNotMatch(html, /bg-rose-[6-9]00|bg-red-|text-white/, "no solid fill");
  }
  const past = renderToStaticMarkup(React.createElement(cells.DeadlineBadge, { item: req({ overdue: true, minutesToStart: -2820 }) }));
  assert.match(past, /text-slate-500/);
  assert.doesNotMatch(past, /border/);
  assert.equal(renderToStaticMarkup(React.createElement(cells.DeadlineBadge, { item: req({ status: "cancelled" }) })), "");
  assert.match(read("src/components/substitutions/substitutions-page.tsx"), /PENDING_ALIGNS: CellAlign\[\] = \["left", "left", "left", "center", "right", "right"\]/);
  // the table, the card of a phone and the window of a decision use the ONE component
  for (const file of ["src/components/substitutions/substitutions-page.tsx", "src/components/substitutions/decision-dialog.tsx", "src/components/substitutions/substitution-panel.tsx"]) {
    assert.match(read(file), /<DeadlineBadge item=\{item\} \/>/, file);
  }
  assert.doesNotMatch(read("src/lib/substitutions.ts"), /URGENT_LABEL|deadlineChips/);
  assert.doesNotMatch(read("src/components/substitutions/decision-dialog.tsx"), /bg-rose-800|Срочно/);
});

// ── U2: the reason ──────────────────────────────────────────────────────────────────────────────────

test("U2: the row has the chip of the reason only; a comment is a mark «Есть комментарий»; the text is in the panel", () => {
  const withComment = renderToStaticMarkup(React.createElement(cells.ReasonCell, { item: req({ comment: "Температура 38, прошу найти замену" }), withComment: true }));
  assert.doesNotMatch(text(withComment), /Температура/);
  assert.match(withComment, /aria-label="Есть комментарий"/);
  assert.match(text(withComment), /Болезнь/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(cells.ReasonCell, { item: req(), withComment: true })), /Есть комментарий/);
  assert.match(read("src/components/substitutions/substitution-panel.tsx"), /\(item\.comment \?\? ""\)\.trim\(\) \? `«\$\{/, "the comment is in the facts of the panel");
});

// ── U3: the line of the requests that close on the 1st ───────────────────────────────────────────────

test("U3: «N запроса закроются 1 ноября без решения. Решите до 31 октября.» - the number and the verb agree; no «≤»", () => {
  const words = (n) => S.expiringText(n, "2026-10-29");
  assert.equal(words(1), "1 запрос закроется 1 ноября без решения. Решите до 31 октября.");
  assert.equal(words(2), "2 запроса закроются 1 ноября без решения. Решите до 31 октября.");
  assert.equal(words(4), "4 запроса закроются 1 ноября без решения. Решите до 31 октября.");
  assert.equal(words(5), "5 запросов закроются 1 ноября без решения. Решите до 31 октября.");
  assert.equal(words(11), "11 запросов закроются 1 ноября без решения. Решите до 31 октября.");
  assert.equal(words(21), "21 запрос закроется 1 ноября без решения. Решите до 31 октября.");
  assert.equal(words(22), "22 запроса закроются 1 ноября без решения. Решите до 31 октября.");
  assert.equal(S.expiringText(3, "2026-12-30"), "3 запроса закроются 1 января без решения. Решите до 31 декабря.", "over the year");
  assert.equal(S.expiringText(3, "2026-02-26"), "3 запроса закроются 1 марта без решения. Решите до 28 февраля.", "a short month");
  assert.equal(S.expiringText(0, "2026-10-29"), null);
  assert.equal(S.expiringText(-1, "2026-10-29"), null);
  assert.equal(S.expiringText(2, ""), null, "no day, no line");
  for (const n of [1, 2, 5]) assert.doesNotMatch(words(n), /≤|Истекают|1-го/);
  assert.doesNotMatch(S.badgeTitle({ pendingTotal: 4, urgentTotal: 0, expiringTotal: 2 }), /≤/, "the tooltip of the menu counter has no «≤» either (LESSONS 56)");
});

test("U3: «Показать» asks the server for the lessons of the previous month, «Показать все» takes it back; the line is a calm amber information", () => {
  assert.equal(S.expiringDateTo("2026-10-29"), "2026-09-30", "the server counts the waiting requests of the lessons BEFORE this month");
  assert.equal(S.expiringDateTo("2026-01-30"), "2025-12-31");
  assert.equal(S.expiringDateTo("2026-03-30"), "2026-02-28");
  assert.equal(S.EXPIRING_SHOW, "Показать");
  assert.equal(S.EXPIRING_SHOW_ALL, "Показать все");
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /dateTo: tab === "pending" && expiringOnly \?/);
  assert.match(page, /data-testid="expiring-show"/);
  assert.match(page, /border-amber-200 bg-amber-50/);
  const banner = page.slice(page.indexOf('data-testid="expiring-note"'), page.indexOf('data-testid="expiring-show"'));
  assert.doesNotMatch(banner, /rose|red-/, "not an alarm");
  assert.match(page, /setExpiringOnly\(false\)/, "the narrowing goes when the last one is decided");
  assert.match(page, /!urgentOnly && !expiringOnly \?/, "the lessons of money are not expiring: hidden while narrowed");
});

// ── U4: the payments ────────────────────────────────────────────────────────────────────────────────

const decision = (over = {}) => ({
  lessonId: "one-off-1", groupId: "g1", groupName: "7-А", lessonDate: "2026-11-05", startTime: "16:00", endTime: "17:00", purpose: "extra", title: "Дополнительный урок — оплатить преподавателю?",
  teacher: { id: "t1", name: "Рахимов Т." }, createdBy: { id: "t1", name: "Рахимов Т.", role: "teacher" }, studentsPresent: 2, studentsTotal: 3, payrollSheet: null, ...over,
});

test("U4: «Просит оплатить» only when the one who asked is not the one who held the lesson", () => {
  assert.equal(O.decisionAskedLine(decision()), null, "the teacher asked for his own lesson");
  assert.equal(O.decisionAskedLine(decision({ createdBy: { id: "a1", name: "Каримова Д.", role: "admin" } })), "Просит оплатить: Каримова Д.", "an administrator asked for the lesson of a teacher");
  assert.equal(O.decisionAskedLine(decision({ createdBy: { id: "t2", name: "Петров Б.", role: "teacher" } })), "Просит оплатить: Петров Б.", "another teacher");
  assert.equal(O.decisionAskedLine(decision({ createdBy: { id: "u", name: "Тестов О.", role: "owner" } })), null, "the owner decides: he does not ask");
  assert.equal(O.decisionAskedLine(decision({ createdBy: null })), null);
  assert.equal(O.decisionAskedLine(decision({ purpose: "makeup" })), null);
  // no ids on a side: the names say who is who; nothing is guessed from a missing id
  assert.equal(O.decisionAskedLine(decision({ createdBy: { name: "Рахимов Т.", role: "teacher" }, teacher: { name: "Рахимов Т." } })), null);
  assert.equal(O.decisionAskedLine(decision({ createdBy: { name: "Иванов А.", role: "teacher" }, teacher: { name: "Рахимов Т." } })), "Просит оплатить: Иванов А.");
  assert.equal(O.decisionAskedLine(decision({ teacher: null })), "Просит оплатить: Рахимов Т.", "nobody is named as the one who held it: the asker is shown");
});

test("U4: «провёл Фамилия И. · были 2 из 3» - the verb agrees with the number", () => {
  assert.equal(O.decisionWhoLine(decision()), "провёл Рахимов Т. · были 2 из 3");
  assert.equal(O.presentLine(1, 10), "был 1 из 10");
  assert.equal(O.presentLine(0, 10), "были 0 из 10");
  assert.equal(O.presentLine(2, 3), "были 2 из 3");
  assert.equal(O.presentLine(11, 15), "были 11 из 15");
  assert.equal(O.presentLine(21, 25), "был 21 из 25");
  assert.equal(O.presentLine(5, 5), "были 5 из 5");
});

test("U4: the section «Оплата дополнительных уроков · N» - one table section, the question is not repeated in a row; the admin without the right gets ONE collapsed row", () => {
  assert.equal(O.DECISIONS_GROUP_TITLE, "Оплата дополнительных уроков");
  assert.equal(O.decisionsViewLine(1), "1 урок ждёт решения владельца");
  assert.equal(O.decisionsViewLine(2), "2 урока ждут решения владельца");
  assert.equal(O.decisionsViewLine(5), "5 уроков ждут решения владельца");
  assert.equal(O.decisionsViewLine(21), "21 урок ждёт решения владельца");
  const props = { loading: false, error: null, onRetry() {}, onDecided() {}, showToast() {} };
  const owner = renderToStaticMarkup(React.createElement(DEC.OneOffDecisionsBlock, { items: [decision(), decision({ lessonId: "b" })], canDecide: true, ...props }));
  assert.match(text(owner), /Оплата дополнительных уроков · 2/);
  assert.equal((owner.match(/data-testid="one-off-decision-row"/g) || []).length, 2);
  assert.doesNotMatch(text(owner), /Дополнительный урок — оплатить преподавателю\?/);
  assert.doesNotMatch(owner, /bg-amber|border-amber/, "no yellow warning block");
  const admin = renderToStaticMarkup(React.createElement(DEC.OneOffDecisionsBlock, { items: [decision(), decision({ lessonId: "b" })], canDecide: false, ...props }));
  assert.match(text(admin), /2 урока ждут решения владельца/);
  assert.equal((admin.match(/data-testid="one-off-decision-row"/g) || []).length, 0, "collapsed");
  assert.match(admin, /aria-expanded="false"/);
  // the order on the tab: the requests (they have a deadline), the section under them
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.ok(page.indexOf("<OneOffDecisionsBlock") > page.indexOf('data-testid="substitution-row"'), "the payments are under the requests");
  assert.ok(page.indexOf("<OneOffDecisionsBlock") < page.indexOf("<SubstitutionPanel"));
});

// ── U5: a phone ─────────────────────────────────────────────────────────────────────────────────────

test("U5: on a phone the reason and the deadline share one row, the deadline never breaks; the buttons of the payment are under the text", () => {
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1\.5 xl:contents/);
  assert.match(read("src/components/substitutions/journal-cells.tsx"), /whitespace-nowrap/);
  const row = renderToStaticMarkup(React.createElement(DEC.PaymentRow, { item: decision(), canDecide: true, onPick() {} }));
  assert.match(row, /flex-col[^"]*md:flex-row/, "under the text on a phone, beside it from md");
});

// ── U2 (stage, real data): what the system writes into a record is a plate and a mark, never a line in the row ────────────────────────────

const OUT = require(path.join(root, "src/lib/substitution-outcome.ts"));
const T = require(path.join(root, "src/lib/substitution-timeline.ts"));
const LEFT_TEXT = "Заменяющий Жуков-КВДЛ Ж. больше не ведёт уроки. Нужно новое решение.";
const GONE_TEXT = "Заменяющий Жуков Ж. больше не работает в центре. Нужно новое решение.";
const DAY_OFF_TEXT = "Выходной «Праздник» отменён: урок вернулся. Нужно новое решение.";
const seen = (html) => text(html.replace(/<span id="[^"]*" class="sr-only">[^<]*<\/span>/g, ""));     // what the eye sees: the hidden copy for a screen reader is not part of it

test("U2: every sentence the server writes into a reopened record has its plate; an unknown one gets «Нужно решение»", () => {
  const sys = (comment, over = {}) => req({ origin: "system", trigger: null, reasonCode: "other", comment, ...over });
  assert.deepEqual(OUT.systemReasonOf(sys(LEFT_TEXT)), { label: "Замена выбыла", text: LEFT_TEXT });
  assert.equal(OUT.systemReasonOf(sys(GONE_TEXT)).label, "Замена выбыла", "removed from the centre: the same plate");
  assert.equal(OUT.systemReasonOf(sys(DAY_OFF_TEXT)).label, "Выходной отменён");
  assert.equal(OUT.systemReasonOf(sys("Что-то новое от сервера")).label, "Нужно решение", "an unknown sentence: the plain words, the sentence is the tooltip");
  assert.deepEqual(OUT.systemReasonOf(sys(null)), { label: "Нужно решение", text: "" });
  assert.equal(OUT.systemReasonOf(sys(LEFT_TEXT, { trigger: "manager_assign" })), null, "a record decided at once (a move, an assignment) has no reason");
  assert.equal(OUT.systemReasonOf(req({ comment: "Температура" })), null, "a request of a teacher has the reason of a teacher");
});

test("U2: in the column «Причина» of ANY row - a plate and, if needed, a mark; no sentence of the system, no comment, no «Предложил» line", () => {
  const cell = (item) => renderToStaticMarkup(React.createElement(cells.ReasonCell, { item, withComment: true }));
  const sys = (comment) => req({ origin: "system", trigger: null, reasonCode: "other", comment });
  for (const [comment, plate] of [[LEFT_TEXT, "Замена выбыла"], [GONE_TEXT, "Замена выбыла"], [DAY_OFF_TEXT, "Выходной отменён"]]) {
    const html = cell(sys(comment));
    assert.equal(seen(html), `|${plate}|`, comment);
    assert.match(html, new RegExp(`aria-label="${comment.replace(/[.«»]/g, "\\$&")}"`), "the whole sentence is the tooltip of the mark");
    assert.match(html, /data-testid="comment-mark"/);
  }
  // a teacher: the plate and the mark «Есть комментарий»
  assert.equal(seen(cell(req({ comment: "Температура 38" }))), "|Болезнь|");
  // the colleague that was suggested: a grey mark; the one that does not lead any more: an amber warning with the words of the server
  const active = cell(req({ suggestedTeacher: { id: "x", name: "Рахимов Т.", active: true } }));
  assert.equal(seen(active), "|Болезнь|");
  assert.match(active, /aria-label="Предложил: Рахимов Т\."/);
  const inactive = cell(req({ reasonCode: "other", reasonLabel: "Другое", suggestedTeacher: { id: "x", name: "Сидоров С.", active: false } }));
  assert.equal(seen(inactive), "|Другое|");
  assert.match(inactive, /aria-label="Предложенный сотрудник больше не ведёт уроки"/);
  assert.match(inactive, /text-amber-600/, "the warning is amber");
  // nothing of it but a mark: one height for every row
  for (const html of [cell(sys(LEFT_TEXT)), cell(req({ comment: "x", suggestedTeacher: { id: "x", name: "Сидоров С.", active: false } }))]) assert.doesNotMatch(html, /line-clamp|<p /);
  // the page itself prints no line of the suggestion any more
  assert.doesNotMatch(read("src/components/substitutions/substitutions-page.tsx"), /suggestedLine/);
});

test("U2: the full sentence of the system is in «Подробнее» (the history of the record), the suggestion too", () => {
  const item = req({ id: "new", origin: "system", trigger: null, reasonCode: "other", comment: LEFT_TEXT });
  const detail = { item, chain: [], next: [], events: [{ requestId: "new", action: "reopened", at: "2026-10-28T07:10:00", actor: { id: "u", name: "Тестов О.", role: "owner" } }] };
  const rows = T.timelineOf(detail, "manager").rows;
  assert.ok(rows.some((row) => row.title === "Открыт заново" && row.details.includes(LEFT_TEXT)), "«Открыт заново» carries the sentence");
  const asked = req({ id: "r2", reasonCode: "other", suggestedTeacher: { id: "x", name: "Сидоров С.", active: false } });
  const rows2 = T.timelineOf({ item: asked, chain: [], next: [], events: [{ requestId: "r2", action: "requested", at: "2026-10-28T07:10:00", actor: { role: "teacher" }, snapshot: { reasonCode: "other" } }] }, "manager").rows;
  assert.ok(rows2.some((row) => row.details.includes("Предложенный сотрудник больше не ведёт уроки")));
});

test("U2: the quiet badge «открыт заново» / «без запроса» sits on the line of the name - a reopened row is as high as any other", () => {
  const html = renderToStaticMarkup(React.createElement(cells.PeopleCell, { item: req({ origin: "system", trigger: null, comment: LEFT_TEXT }) }));
  assert.match(html, /<div class="flex min-w-0 flex-wrap items-center[^"]*"><p[^>]*>Иванов А\.<\/p><span data-testid="origin-badge"/);
  // on the tab «Ждут» the plate of the reason («Замена выбыла») already says it: no badge, one height
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(cells.PeopleCell, { item: req({ origin: "system", trigger: null }), withOrigin: false })), /origin-badge/);
  assert.match(read("src/components/substitutions/substitutions-page.tsx"), /<PeopleCell item=\{item\} withOrigin=\{!pendingTab\} \/>/);
});
