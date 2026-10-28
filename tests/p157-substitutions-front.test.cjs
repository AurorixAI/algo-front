// #157 (28.10), front: «Замены» - the one chip of the result (25 codes of the server), the row, the panel «Подробнее» with the history of the chain, the rights of a teacher.
// Spec: artifacts/analysis/P157_158_SPEC.md part B + C4; contract artifacts/analysis/P157_API.md; LESSONS 17, 45, 46, 48.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

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
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const O = require(path.join(root, "src/lib/substitution-outcome.ts"));
const TL = require(path.join(root, "src/lib/substitution-timeline.ts"));
const cells = require(path.join(root, "src/components/substitutions/journal-cells.tsx"));
const panel = require(path.join(root, "src/components/substitutions/substitution-panel.tsx"));
const text = (html) => html.replace(/<[^>]+>/g, "|").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\|+/g, "|");

const NOW = Date.parse("2026-10-28T08:00:00Z");
const person = (name, role) => ({ id: name, name, role });
const item = (over = {}) => ({
  id: "r1", status: "substituted", origin: "teacher", trigger: null, outcome: "substituted", reasonCode: "sick", reasonLabel: "Болезнь", comment: "Температура",
  group: { id: "g1", name: "9-А" }, lesson: { lessonId: "l1", date: "2026-10-30", startTime: "10:00", endTime: "11:30", exists: true },
  teacher: person("Иванов А.", "teacher"), minutesToStart: 3000, urgent: false, overdue: false, createdAt: "2026-10-28T07:10:00", lastActivityAt: "2026-10-28T07:24:00",
  decision: { kind: "substitute", by: person("Тестов О.", "owner"), at: "2026-10-28T07:17:00", substitute: person("Петров Б.", "teacher"), via: "request" }, ...over,
});

// ── the 25 codes ────────────────────────────────────────────────────────────────────────────────────────────

const EXPECTED = {
  pending: ["Ждёт решения", "warn"],
  substituted: ["Замена назначена", "ok"],
  rescheduled: ["Урок перенесён", "ok"],
  cancelled: ["Урок отменён", "ok"],
  lesson_not_held: ["Урока не было", "ok"],
  rejected: ["Запрос отклонён", "ok"],
  substitution_cleared: ["Замена снята", "muted"],
  substitution_replaced: ["Заменён другим", "muted"],
  lesson_later_cancelled: ["Урок позже отменён", "muted"],
  lesson_later_moved: ["Урок позже перенесён", "muted"],
  cancelled_by_day_off: ["Отменён выходным", "muted"],
  day_off_voided: ["Выходной отменён", "muted"],      // the lesson is in the past of NOW: grey
  withdrawn: ["Преподаватель отозвал", "muted"],
  not_resolved_in_time: ["Не решено вовремя", "warn"],
  lesson_started: ["Урок начался без решения", "warn"],
  lesson_already_cancelled: ["Урок уже отменён", "muted"],
  lesson_removed: ["Урока нет в расписании", "muted"],
  group_archived: ["Группа в архиве", "muted"],
  group_teacher_changed: ["Сменился преподаватель", "muted"],
  teacher_removed: ["Преподаватель ушёл", "muted"],
  role_changed: ["Стал администратором", "muted"],
  lesson_restored: ["Урок возвращён", "muted"],
  kind_changed: ["Вид отмены изменён", "muted"],
  one_off_added: ["Разовый урок", "muted"],
  closed: ["Запрос закрыт", "muted"],
};

test("#157: every one of the 25 codes of the server has its chip and its colour (LESSONS 46: a test on each code)", () => {
  assert.equal(Object.keys(EXPECTED).length, 25);
  assert.deepEqual(O.OUTCOME_CODES.slice().sort(), Object.keys(EXPECTED).sort(), "the table of the front is the table of the contract");
  const past = item({ lesson: { ...item().lesson, date: "2026-10-20" } });
  for (const [code, [label, tone]] of Object.entries(EXPECTED)) {
    const view = O.outcomeOf({ ...past, outcome: code }, "manager", NOW);
    assert.deepEqual([view.code, view.text, view.tone], [code, label, tone], code);
    assert.doesNotMatch(view.text, /[a-z]+_[a-z]+|[A-Z]{3,}_|\(а\)/, code);
    assert.ok(view.text.split(" ").length <= 4, `${code}: a few words`);
  }
  // the types of the front know every code too
  const types = read("src/lib/substitution-types.ts");
  for (const code of Object.keys(EXPECTED)) assert.match(types, new RegExp(`\\| "${code}"`), code);
});

test("#157: an unknown or absent code is «Запрос закрыт», never an empty chip; the day off voided is yellow while the lesson is ahead", () => {
  assert.deepEqual(O.outcomeOf({ ...item(), outcome: "something_new" }, "manager", NOW), { code: "closed", text: "Запрос закрыт", tone: "muted" });
  assert.equal(O.outcomeOf({ ...item(), outcome: undefined }, "manager", NOW).text, "Запрос закрыт");
  assert.equal(O.outcomeOf({ ...item(), outcome: null }, "teacher", NOW).text, "Запрос закрыт");
  const ahead = item({ outcome: "day_off_voided", lesson: { ...item().lesson, date: "2026-11-02" } });
  assert.equal(O.outcomeOf(ahead, "manager", NOW).tone, "muted", "a list does not know `needsDecision`: calm, nothing is guessed");
  assert.equal(O.outcomeOf(ahead, "manager", NOW, true).tone, "warn");
  assert.equal(O.outcomeOf({ ...ahead, lesson: { ...ahead.lesson, date: "2026-10-27" } }, "manager", NOW, true).tone, "muted");
  assert.match(O.outcomeNote(ahead, true), /нужно ваше решение/);
  assert.equal(O.outcomeNote(ahead, false), null);
  assert.equal(O.outcomeNote(item()), null);
});

test("#157: the teacher's words are short (the reason of a refusal and the fate of a substitution are in the panel), the colours are the owner's", () => {
  const t = (outcome, over = {}) => O.outcomeOf({ ...item(over), outcome }, "teacher", NOW);
  assert.equal(t("substituted").text, "Замена: Петров Б.");
  assert.equal(t("substituted", { decision: { kind: "substitute", substitute: null } }).text, "Замена назначена");
  assert.equal(t("rejected").text, "Отклонено");
  assert.equal(t("withdrawn").text, "Отозван");
  for (const code of Object.keys(EXPECTED).filter((c) => !["substituted", "rejected", "withdrawn"].includes(c))) {
    assert.deepEqual([t(code).text, t(code).tone], O.OUTCOME_CHIP[code] ? [O.OUTCOME_CHIP[code].text, O.outcomeOf({ ...item(), outcome: code }, "manager", NOW).tone] : [], code);
  }
});

// ── the row ───────────────────────────────────────────────────────────────────────────────────────────────

test("#157 row: the lesson is ONE link (date · time, group); a lesson gone from the schedule is plain text with the words «урок удалён из расписания»", () => {
  const link = renderToStaticMarkup(React.createElement(cells.LessonCell, { item: item(), href: "/owner/groups/g1?tab=attendance" }));
  assert.equal((link.match(/<a /g) || []).length, 1);
  assert.match(link, /aria-label="Открыть урок: 9-А, пт, 30\.10, 10:00–11:30"/);
  assert.equal(text(link), "|пт, 30.10 · 10:00–11:30|9-А|");
  const gone = renderToStaticMarkup(React.createElement(cells.LessonCell, { item: item({ lesson: { ...item().lesson, exists: false } }), href: "/owner/groups/g1" }));
  assert.doesNotMatch(gone, /<a /);
  assert.equal(text(gone), "|пт, 30.10 · 10:00–11:30|9-А|урок удалён из расписания|");
  const noId = renderToStaticMarkup(React.createElement(cells.LessonCell, { item: item({ lesson: { ...item().lesson, lessonId: "" } }), href: "/x" }));
  assert.doesNotMatch(noId, /<a /);
});

test("#157 row: «›» is a button named by the lesson (fifty rows must not read alike), 40 x 40, opens a dialog", () => {
  const html = renderToStaticMarkup(React.createElement(cells.DetailsButton, { item: item(), onOpen() {} }));
  assert.match(html, /aria-label="Подробнее: 9-А, пт, 30\.10, 10:00–11:30"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /h-10 w-10/);
  assert.match(html, /type="button"/);
});

test("#157 row: «Кто → кто» left, the badge is quiet, the reason is a label (only a request has it), the comment only where it is needed to decide, one chip, «Когда» = the last event", () => {
  const owner = item();
  assert.equal(text(renderToStaticMarkup(React.createElement(cells.PeopleCell, { item: owner }))), "|Иванов А.|→ |Петров Б.|");
  const direct = item({ origin: "system", trigger: "manager_assign" });
  assert.equal(text(renderToStaticMarkup(React.createElement(cells.PeopleCell, { item: direct }))), "|Иванов А.|→ |Петров Б.|без запроса|");
  const moved = item({ status: "rescheduled", outcome: "rescheduled", decision: { kind: "reschedule", movedTo: { date: "2026-10-29", startTime: "16:00", endTime: "17:00" } } });
  assert.equal(text(renderToStaticMarkup(React.createElement(cells.PeopleCell, { item: moved }))), "|Иванов А.|→ |чт, 29.10, 16:00|");
  const cancelled = item({ status: "cancelled", outcome: "cancelled", decision: { kind: "cancel", by: person("Тестов О.", "owner") } });
  assert.equal(text(renderToStaticMarkup(React.createElement(cells.PeopleCell, { item: cancelled }))), "|Иванов А.|");
  assert.equal(text(renderToStaticMarkup(React.createElement(cells.ReasonCell, { item: owner }))), "|Болезнь|", "a decided row: the label only");
  assert.match(text(renderToStaticMarkup(React.createElement(cells.ReasonCell, { item: owner, withComment: true }))), /\|Болезнь\|Температура\|/);
  assert.equal(renderToStaticMarkup(React.createElement(cells.ReasonCell, { item: direct })), "", "a record without a request has no reason");
  const reopened = item({ origin: "system", trigger: null, comment: "Заменяющий больше не ведёт уроки" });
  assert.equal(text(renderToStaticMarkup(React.createElement(cells.PeopleCell, { item: reopened }))).endsWith("открыт заново|"), true);
  assert.match(text(renderToStaticMarkup(React.createElement(cells.ReasonCell, { item: reopened, withComment: true }))), /Заменяющий больше не ведёт уроки/, "the comment of a reopened request is its explanation (LESSONS 46)");
  assert.equal(text(renderToStaticMarkup(React.createElement(cells.OutcomeChip, { item: owner }))), "|Замена назначена|");
  assert.equal(text(renderToStaticMarkup(React.createElement(cells.WhenCell, { item: owner }))), "|28.10 12:24|", "07:24 UTC = 12:24 in Tashkent");
  const long = item({ comment: "Очень длинный комментарий. ".repeat(8) });
  assert.match(renderToStaticMarkup(React.createElement(cells.ReasonCell, { item: long, withComment: true })), /aria-expanded="false"[^>]*>Ещё</, "a phone has no tooltip: «Ещё»");
});

test("#157 page: the wide table is «Урок · Кто → кто · Причина · Итог · Когда · ›», left aligned; «Выбрать все · N» is the first row; the old cells and their texts are gone", () => {
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /\["Урок", "Кто → кто", "Причина", "Итог", "Когда", ""\]/);
  assert.match(page, /Выбрать все · \{items\.length\}/);
  assert.match(page, /text-base[^"]*sm:text-sm/, "the search is 16 px on a phone (no zoom of iOS Safari)");
  assert.match(page, /data-testid="filter-chip"/);
  assert.doesNotMatch(page, /OriginLine|DecisionCell|substitution-group-link|substitution-teacher-link|>Открыть урок</, "the group, the teacher and «Открыть урок» moved into the panel");
  assert.doesNotMatch(read("src/components/substitutions/journal-cells.tsx"), /\(а\)|Решил|Заменял|снял/);
  const src = ["src/lib/substitutions.ts", "src/lib/substitution-outcome.ts", "src/lib/substitution-timeline.ts", "src/components/substitutions/substitution-panel.tsx", "src/components/substitutions/substitutions-page.tsx", "src/components/substitutions/teacher-requests-block.tsx"];
  for (const file of src) assert.doesNotMatch(read(file), /[а-я]\((а|ла|ся)\)/, `${file}: no «(а)»`);
  const S = read("src/lib/substitutions.ts");
  for (const dead of ["teacherStatusLine", "decisionResultText", "closedResultText", "decidedByLine", "clearedLine", "originLine", "reasonChipText", "managerWho", "isDirectSubstitution", "isManagerMove", "window_expired", "role_changed\":"]) assert.ok(!S.includes(dead), `${dead} is gone from substitutions.ts`);
});

// ── the history ───────────────────────────────────────────────────────────────────────────────────────────

const MGR = { id: "m", name: "Тестов О.", role: "owner" };
const chain3 = () => {
  const r1 = item({ id: "r1", outcome: "substitution_replaced", clearedTo: person("Сидоров В.", "teacher"), clearedAt: "2026-10-28T07:24:00", clearedTrigger: "put" });
  const r2 = item({ id: "r2", origin: "system", trigger: "manager_assign", outcome: "substituted", previous: { id: "r1", status: "substituted" }, decision: { kind: "substitute", by: MGR, substitute: person("Сидоров В."), via: "lesson_teacher_put", at: "2026-10-28T07:24:00" } });
  const r3 = item({ id: "r3", origin: "system", trigger: null, status: "pending", outcome: "pending", comment: "Заменяющий больше не ведёт уроки", decision: null });
  const events = [
    { requestId: "r1", action: "requested", actor: { id: "t", name: "Иванов А.", role: "teacher" }, at: "2026-10-28T07:10:00", snapshot: { reasonCode: "sick" } },
    { requestId: "r1", action: "substituted", actor: MGR, at: "2026-10-28T07:17:00", snapshot: { teacherId: ["t", "p"], via: "request" } },
    { requestId: "r1", action: "assignment_cleared", mergedRequestId: "r2", actor: MGR, at: "2026-10-28T07:24:00", snapshot: { teacherId: ["p", "s"], trigger: "put" } },
    { requestId: "r2", action: "requested", actor: MGR, at: "2026-10-28T07:24:00", snapshot: { trigger: "manager_assign" } },
    { requestId: "r3", action: "reopened", actor: null, at: "2026-10-28T07:30:00", snapshot: { cause: "role_changed" } },
  ];
  return { item: r1, chain: [], next: [r2, r3], events, truncated: false };
};

test("#157 history: a chain of 3 records is one list in the order of the server; the request without a request is not drawn; the merged pair is one line with a link; the successor opens", () => {
  const { rows, truncated } = TL.timelineOf(chain3(), "manager");
  assert.equal(truncated, false);
  assert.deepEqual(rows.map((r) => [r.when, r.title, r.author, r.openRequestId]), [
    ["28.10, 12:10", "Запрос на замену", "Иванов А., преподаватель", null],
    ["28.10, 12:17", "Замена назначена", "Тестов О., владелец", null],
    ["28.10, 12:24", "Новая замена: Сидоров В.", "Тестов О., владелец", "r2"],
    ["28.10, 12:30", "Открыт новый запрос", null, "r3"],
  ]);
  assert.deepEqual(rows[0].details, [], "the reason of the open row is in the head of the panel, not said twice");
  assert.deepEqual(rows[1].details, ["Иванов А. → Петров Б."], "no technical «через …»");
  assert.deepEqual(rows[3].details, ["Заменяющий больше не ведёт уроки"]);
  const html = renderToStaticMarkup(React.createElement(panel.PanelTimeline, { rows, truncated: false, onOpenRequest() {} }));
  assert.equal((html.match(/<li /g) || []).length, 4);
  assert.match(html, /<time dateTime="2026-10-28T07:10:00">28\.10, 12:10<\/time>/);
  assert.equal((html.match(/Открыть ›/g) || []).length, 2);
  assert.match(html, /<ol /);
});

test("#157 history: «Показаны последние записи» when the server says `truncated`", () => {
  const out = chain3();
  assert.match(renderToStaticMarkup(React.createElement(panel.PanelTimeline, { ...TL.timelineOf({ ...out, truncated: true }, "manager"), onOpenRequest() {} })), /Показаны последние записи/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(panel.PanelTimeline, { ...TL.timelineOf(out, "manager"), onOpenRequest() {} })), /Показаны последние записи/);
  assert.match(renderToStaticMarkup(React.createElement(panel.PanelTimeline, { rows: [], truncated: false, onOpenRequest() {} })), /Записей о событиях нет/);
});

test("#157 history: every action of the contract has its line; an action the front does not know has none (no technical word on the screen)", () => {
  const line = (action, snapshot = {}, record = {}) => TL.timelineOf({ item: item(record), events: [{ requestId: "r1", action, actor: MGR, at: "2026-10-28T07:10:00", snapshot }] }, "manager").rows[0];
  assert.equal(line("requested", { reasonCode: "other" }, { comment: "Семейные обстоятельства", reasonCode: "other", suggestedTeacher: person("Рахимов Т.") }).details.join(" | "), "Предложил: Рахимов Т.");
  // the request of ANOTHER record of the chain says its reason (the head of the panel is about the open one)
  const other = TL.timelineOf({ item: item({ id: "r9" }), next: [], chain: [item({ id: "r1", comment: "Семейные обстоятельства", reasonCode: "other" })], events: [{ requestId: "r1", action: "requested", actor: MGR, at: "2026-10-28T07:10:00", snapshot: { reasonCode: "other" } }] }, "manager").rows[0];
  assert.deepEqual(other.details, ["Другое · «Семейные обстоятельства»"]);
  assert.equal(line("requested", { trigger: "manager_assign" }), undefined, "the action itself is the first line of a record made without a request");
  assert.equal(line("reopened").title, "Открыт заново");
  assert.equal(line("substituted", { via: "lesson_teacher_put" }, { origin: "system", trigger: "manager_assign" }).title, "Замена назначена без запроса");
  assert.deepEqual(line("substituted", { via: "lesson_teacher_put" }).details, ["Иванов А. → Петров Б."]);
  assert.equal(line("rescheduled", { reason: "Болен", movedTo: { date: "2026-10-29", startTime: "16:00" } }).title, "Урок перенесён на чт, 29.10, 16:00");
  assert.deepEqual(line("cancelled", { reason: "Праздник", cancellationKind: "holiday" }).details, ["Праздник", "праздник"]);
  assert.deepEqual(line("cancelled", { reason: "Болен", cancellationKind: "centre" }).details, ["Болен", "по вине центра"]);
  assert.equal(line("cancelled", {}, { trigger: "teacher_cancel" }).title, "Урока не было");
  assert.deepEqual([line("rejected", { reason: "Замену не нашли" }).title, line("rejected", { reason: "Замену не нашли" }).details], ["Запрос отклонён", ["Замену не нашли"]]);
  assert.equal(line("withdrawn").title, "Запрос отозван");
  assert.equal(line("assignment_cleared", { trigger: "cancel", teacherId: ["p", null] }).title, "Замена снята: урок отменён");
  assert.equal(line("assignment_cleared", { trigger: "cancel", byDayOff: true, teacherId: ["p", null] }).title, "Замена снята: урок отменён выходным днём");
  assert.equal(line("assignment_cleared", { trigger: "put", teacherId: ["p", null] }).title, "Замена снята: урок снова ведёт основной преподаватель");
  assert.equal(line("closed", { closedReason: "KIND_CHANGED", cancellationKind: { from: "centre", to: "holiday" }, reason: "Праздник" }).details.join("|"), "было: по вине центра, стало: праздник|Праздник");
  assert.equal(line("closed", { closedReason: "LESSON_RESTORED", reason: "Ошиблись" }).details[0], "Ошиблись");
  assert.equal(line("closed", { closedReason: "ONE_OFF_ADDED" }).title, "Разовый урок добавлен");
  assert.equal(line("closed", { closedReason: "LESSON_CANCELLED", trigger: "day_off" }).title, "Запрос закрыт: урок отменён выходным днём");
  assert.deepEqual([line("closed", { closedReason: "GROUP_ARCHIVED" }).title, line("closed", { closedReason: "GROUP_ARCHIVED" }).details], ["Запрос закрыт", ["Группа закрыта"]]);
  assert.equal(line("suggestion_unavailable").title, "Предложенный коллега больше не ведёт уроки");
  assert.equal(line("lesson_restored", { reason: "Ошиблись" }).title, "Урок возвращён");
  // `day_off_voided` by what the server says (subject, reopened, needsDecision): four variants, the status of the record does not matter
  const voided = (snapshot, record) => line("day_off_voided", snapshot, record).title;
  for (const status of ["substituted", "closed"]) {
    assert.equal(voided({ subject: "request", reopened: true, needsDecision: true }, { status }), "Выходной отменён: запрос открыт заново — нужно решение", status);
    assert.equal(voided({ subject: "request", reopened: false, needsDecision: false }, { status }), "Выходной отменён: урок вернулся", status);
    assert.equal(voided({ subject: "substitution", reopened: false, needsDecision: true }, { status }), "Выходной отменён: замена не вернулась — назначьте заново", status);
    assert.equal(voided({ subject: "substitution", reopened: false, needsDecision: false }, { status }), "Выходной отменён: замена не вернулась", status);
  }
  assert.equal(voided({}), "Выходной отменён", "an event without the fields says no more than it knows")
  assert.equal(line("something_new", { x: 1 }), undefined);
});

test("#157 history: the time of an event is the clock of the centre (23:30 UTC is 04:30 of the NEXT day in Tashkent)", () => {
  const row = TL.timelineOf({ item: item(), events: [{ requestId: "r1", action: "withdrawn", actor: null, at: "2026-10-28T23:30:00", snapshot: {} }] }, "manager").rows[0];
  assert.equal(row.when, "29.10, 04:30");
  assert.equal(row.at, "2026-10-28T23:30:00");
});

test("#157 author: «Фамилия И., роль»; the role from the KIND of the action, never by default; a person who is no longer a manager - the name alone", () => {
  assert.equal(O.authorLine({ id: "u", name: "Каримова Н.", role: "admin" }, "manager", "manager"), "Каримова Н., администратор");
  assert.equal(O.authorLine({ id: "u", name: "Юсупова Н.", role: "owner" }, "manager", "manager"), "Юсупова Н., владелец");
  assert.equal(O.authorLine({ id: "u", name: "Старова С.", role: null }, "manager", "manager"), "Старова С.");
  assert.equal(O.authorLine({ id: "u", name: "Бывший Б.", role: "teacher" }, "manager", "manager"), "Бывший Б.");
  assert.equal(O.authorLine({ id: "u", name: "Иванов А.", role: "teacher" }, "teacher", "manager"), "Иванов А., преподаватель");
  assert.equal(O.authorLine(null, "manager", "manager"), null);
  assert.equal(O.authorLine({ id: null, name: null, role: null }, "manager", "manager"), null);
});

test("#157 rights: a teacher's panel never holds another person's name - the server masks it, the front says the role (checked on a masked answer)", () => {
  const masked = chain3();
  masked.events = masked.events.map((e) => ({ ...e, actor: e.actor ? { role: e.actor.role === "owner" ? "owner" : "teacher" } : null }));
  masked.next = [];
  masked.item = { ...masked.item, decision: { ...masked.item.decision, by: { id: null, name: null, role: "owner" } }, clearedBy: { id: null, name: null, role: "owner" } };
  const { rows } = TL.timelineOf(masked, "teacher");
  const html = renderToStaticMarkup(React.createElement(panel.PanelTimeline, { rows, truncated: false, onOpenRequest() {} }));
  const shown = text(html) + text(renderToStaticMarkup(React.createElement(panel.PanelFacts, { item: masked.item })));
  assert.doesNotMatch(shown, /Тестов|Каримов|Юсупов/, "no name of a manager");
  assert.match(shown, /Владелец/);
  assert.match(shown, /Вы/, "his own action is «Вы»");
  assert.equal(rows.find((r) => r.title === "Запрос на замену").author, "Вы");
  assert.equal(rows.find((r) => r.title === "Замена назначена").author, "Владелец");
  // a masked author without a role: no line at all (never «Администратор» by default)
  const bare = TL.timelineOf({ item: item(), events: [{ requestId: "r1", action: "rejected", actor: { role: null }, at: "2026-10-28T07:10:00", snapshot: {} }] }, "teacher").rows[0];
  assert.equal(bare.author, null);
});

test("#157 panel facts: who cannot, the substitute, the reason of a request; a record without a request is «Преподаватель» and has no reason; no technical word", () => {
  const facts = (over) => text(renderToStaticMarkup(React.createElement(panel.PanelFacts, { item: item(over) })));
  assert.equal(facts({}), "|Кто не может|Иванов А.|Замена|Петров Б.|Причина|Болезнь — «Температура»|");
  assert.equal(facts({ origin: "system", trigger: "manager_assign", comment: "Болезнь у основного" }), "|Преподаватель|Иванов А.|Замена|Петров Б.|");
  assert.equal(facts({ status: "rescheduled", decision: { kind: "reschedule", movedTo: { date: "2026-10-29", startTime: "16:00", endTime: "17:00" } } }), "|Кто не может|Иванов А.|Новое время|чт, 29.10, 16:00|Причина|Болезнь — «Температура»|");
});

// ── the panel and the page: the wiring ────────────────────────────────────────────────────────────────

test("#157 panel: Modal sheet (right from 768, bottom on a phone); the history is read when it opens; an old answer never paints a new panel (the answer keeps its id)", () => {
  const src = read("src/components/substitutions/substitution-panel.tsx");
  assert.match(src, /<Modal open=\{requestId !== null\} title=\{PANEL_TITLE\} onClose=\{onClose\} placement="sheet"/);
  assert.match(src, /substitutionsApi\.detail\(id\)/);
  assert.match(src, /const mine = \+\+token\.current;/);
  assert.match(src, /if \(mine !== token\.current\) return;/);
  assert.match(src, /panelView\(\{ loaded, failed \}, requestId, seed \?\? null\)/, "what is shown comes from the one pure function (tested below)");
  assert.match(src, /Не удалось загрузить историю/);
  assert.match(src, /Повторить/);
  assert.match(src, /data-testid="panel-skeleton"/);
  assert.match(src, /dialog\.contains\(document\.activeElement\)\) body\.focus/, "after a decision the focus stays in the panel");
  assert.match(src, /refreshKey/, "the panel reads again after a decision and stays");
  assert.match(src, /Группа ›/);
  assert.match(src, /Преподаватель ›/);
  assert.match(src, /workspace === "owner" && item\.teacher\.id/, "the link to the teacher is the owner's");
  assert.match(read("src/lib/substitution-panel-state.ts"), /audience === "manager"/, "«Решить» is for a manager");
  assert.match(src, /item\.lesson\.exists !== false/, "no «Открыть урок» for a lesson that is gone");
});

test("#157 page: one panel; `?request=` opens it (a decided one too) and closing keeps `?status=`; the decision refreshes the panel and does not close it", () => {
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /<SubstitutionPanel/);
  assert.equal((page.match(/<SubstitutionPanel/g) || []).length, 1);
  assert.match(page, /router\.replace\(queryWith\(searchParams\?\.toString\(\), \{ request: id \}\), \{ scroll: false \}\)/, "only `request` changes: `status` stays");
  assert.match(page, /setPanel\(\{ id: out\.item\.id, seed: out\.item, detail: out \}\)/, "the answer goes to the panel: one read");
  assert.match(page, /initial=\{panel\?\.detail \?\? null\}/);
  assert.match(page, /wantedId\.current = requestedId;[\s\S]*if \(wantedId\.current !== requestedId\) return;/, "an answer after the address changed again is dropped (and strict mode does not drop the first one)");
  assert.doesNotMatch(page, /Запрос уже решён", "warning"/, "no toast and no jump to a tab instead of the panel");
  assert.doesNotMatch(page, /router\.replace\(`\/\$\{role\}\/substitutions`/, "closing does not drop `?status=`");
  assert.match(page, /setPanelRefresh\(\(value\) => value \+ 1\)/);
  assert.match(page, /onDecide=\{\(row\) => setDialogItem\(row\)\}/);
  assert.match(page, /onClose=\{\(\) => \{ setDialogItem\(null\); if \(requestedId && !panel\)/, "closing the window of the decision does not close the panel under it");
  assert.match(page, /workspace=\{role\}/);
  assert.match(page, /audience="manager"/);
});

test("#157 teacher: «Запросы на замену» - the lesson, one short chip, «Отозвать» while it waits, «›» - the same panel (his own requests, other people by role only)", () => {
  const src = read("src/components/substitutions/teacher-requests-block.tsx");
  assert.match(src, /<OutcomeChip item=\{item\} audience="teacher" \/>/);
  assert.match(src, /<DetailsButton item=\{item\} onOpen=\{\(row\) => setPanel\(\{ id: row\.id, seed: row \}\)\} \/>/);
  assert.match(src, /audience="teacher"\s+workspace="teacher"/);
  assert.doesNotMatch(src, /teacherStatusLine|STATUS_TONE_CLASS/);
  // the panel of a teacher: no links of the managers, no «Решить»
  const panelSrc = read("src/components/substitutions/substitution-panel.tsx");
  assert.match(panelSrc, /workspace === "teacher" \? null : workspaceBases\(workspace\)/);
});

test("#157: LESSONS 48 - one function says «Урок» for a row in the link, the arrow and the dialog name; the texts of the page tell the facts", () => {
  assert.equal(cells.lessonLabel(item()), "9-А, пт, 30.10, 10:00–11:30");
  const S = require(path.join(root, "src/lib/substitutions.ts"));
  assert.match(S.PAGE_HINT, /замены, переносы, отмены/);
  assert.equal(S.DECIDED_EMPTY_HINT, "Здесь появятся события за последние 30 дней.");
  assert.doesNotMatch(S.PAGE_HINT + S.DECIDED_EMPTY_HINT, /\(а\)/);
});

// ── round 2 (28.10) ─────────────────────────────────────────────────────────────────────────────────────

test("#157 r2 (4): the history says «Новая замена: Имя», no technical «via», the author of «Замена снята» when there is one", () => {
  const row = (action, snapshot, actor = MGR, rec = {}) => TL.timelineOf({ item: item(rec), events: [{ requestId: "r1", action, actor, at: "2026-10-28T07:10:00", snapshot }] }, "manager").rows[0];
  const replaced = row("assignment_cleared", { trigger: "put", teacherId: ["p", "s"] }, MGR, { clearedTo: person("Сидоров В."), clearedAt: "2026-10-28T07:10:00" });
  assert.equal(replaced.title, "Заменена другим", "no pair, no name");
  const ev = (extra) => TL.timelineOf({ item: item(), next: [item({ id: "r2" })], events: [{ requestId: "r1", action: "assignment_cleared", actor: MGR, at: "2026-10-28T07:10:00", snapshot: { trigger: "put", teacherId: ["p", "s"] }, ...extra }] }, "manager").rows[0];
  assert.equal(ev({ substituteName: "Сидоров В.", mergedRequestId: "r2" }).title, "Новая замена: Сидоров В.", "the pair the server merged");
  assert.equal(ev({ substituteName: "Сидоров В." }).title, "Заменена на Сидоров В.", "no pair");
  assert.equal(ev({ substituteName: "Сидоров В.", mergedRequestId: "r2" }).openRequestId, "r2");
  assert.equal(ev({ substituteName: "Сидоров В.", mergedRequestId: "r2" }).author, "Тестов О., владелец");
  assert.equal(TL.timelineOf({ item: item(), events: [{ requestId: "r1", action: "assignment_cleared", actor: { role: "admin" }, at: "2026-10-28T07:10:00", substituteName: "Сидоров В.", snapshot: { teacherId: ["p", "s"], trigger: "put" } }] }, "teacher").rows[0].author, "Администратор", "a teacher: the role alone, the name of the substitute is his to know")
  const sub = TL.timelineOf({ item: item(), events: [{ requestId: "r1", action: "substituted", actor: MGR, at: "2026-10-28T07:10:00", substituteName: "Рахимов Т.", snapshot: { teacherId: ["t", "r"] } }] }, "manager").rows[0];
  assert.deepEqual(sub.details, ["Иванов А. → Рахимов Т."], "the name comes from the event");
  assert.equal(row("assignment_cleared", { trigger: "put", teacherId: ["p", null] }).author, "Тестов О., владелец", "who took the substitution off");
  assert.equal(row("assignment_cleared", { trigger: "member_removed", teacherId: ["p", null] }, null).author, null, "the system has no author");
  for (const via of ["request", "lesson_teacher_put", "teacher_move", "manager_assign"]) assert.doesNotMatch(JSON.stringify(row("substituted", { via, teacherId: ["t", "p"] }).details), new RegExp(`через|${via}`), via);
});

test("#157 r2 (5): «Урока не было» of a teacher: the chip, the line and the author agree whether the trigger or only `decision.via` says it", () => {
  for (const record of [{ trigger: "teacher_cancel" }, { trigger: null, decision: { kind: "cancel", via: "teacher_cancel" } }]) {
    const rec = item({ status: "cancelled", outcome: "lesson_not_held", ...record });
    const row = TL.timelineOf({ item: rec, events: [{ requestId: "r1", action: "cancelled", actor: { id: "t1", name: "Иванов А.", role: "teacher" }, at: "2026-10-28T07:10:00", snapshot: { reason: "Не пришли" } }] }, "manager").rows[0];
    assert.deepEqual([row.title, row.author], ["Урока не было", "Иванов А., преподаватель"]);
    assert.equal(O.outcomeOf(rec, "manager").text, "Урока не было");
    const own = TL.timelineOf({ item: rec, events: [{ requestId: "r1", action: "cancelled", actor: { role: "teacher" }, at: "2026-10-28T07:10:00", snapshot: {} }] }, "teacher").rows[0];
    assert.equal(own.author, "Вы");
  }
  assert.equal(TL.isTeacherCancel(item({ decision: { kind: "cancel", via: "request" } })), false);
});

test("#157 r2 (6): «Вернуть урок»: the server merges the pair (`mergedRequestId`); the front draws ONE line and only guards against a second one - no guess by time", () => {
  const first = { requestId: "r1", action: "lesson_restored", actor: MGR, at: "2026-10-28T07:10:00", snapshot: {}, mergedRequestId: "r2" };
  const second = { requestId: "r2", action: "closed", actor: MGR, at: "2026-10-28T07:10:01", snapshot: { closedReason: "LESSON_RESTORED", trigger: "manager_restore", reason: "Ошиблись" } };
  const cancel = { requestId: "r1", action: "cancelled", actor: MGR, at: "2026-10-28T06:00:00", snapshot: { reason: "Праздник" } };
  const out = (events) => TL.timelineOf({ item: item({ id: "r1" }), next: [item({ id: "r2", status: "closed" })], events }, "manager").rows;
  // as the server sends it: one event, the reason moved into it
  const merged = out([cancel, { ...first, snapshot: { reason: "Ошиблись" } }]);
  assert.deepEqual(merged.map((r) => r.title), ["Урок отменён", "Урок возвращён"]);
  assert.deepEqual(merged[1].details, ["Ошиблись"]);
  // a duplicate that comes anyway and is named by `mergedRequestId` is not drawn (whatever the time); its reason is kept
  const guarded = out([cancel, first, { ...second, at: "2026-10-28T09:00:00" }]);
  assert.deepEqual(guarded.map((r) => r.title), ["Урок отменён", "Урок возвращён"]);
  assert.deepEqual(guarded[1].details, ["Ошиблись"]);
  // no `mergedRequestId`: nothing is guessed (the same minute, the same author) - both lines are drawn
  assert.equal(out([cancel, { ...first, mergedRequestId: undefined }, second]).filter((r) => r.title === "Урок возвращён").length, 2);
  // two returns of two cancellations stay two lines
  const again = [first, second, { ...first, requestId: "r5", mergedRequestId: "r6", at: "2026-10-28T10:00:00" }, { ...second, requestId: "r6", at: "2026-10-28T10:00:01" }];
  assert.equal(out(again).filter((r) => r.title === "Урок возвращён").length, 2);
  assert.doesNotMatch(read("src/lib/substitution-timeline.ts"), /Date\.parse|PAIR_MS/, "no heuristic by time");
});

test("#157 (server sync): the closing of GROUP_TEACHER_CHANGED is the server's text as it is; nothing is added, «Запрос закрыт» is not doubled", () => {
  const rec = (closedReasonText) => item({ status: "closed", outcome: "group_teacher_changed", decision: { kind: "closed", closedReason: "GROUP_TEACHER_CHANGED", closedReasonText } });
  const row = (record) => TL.timelineOf({ item: record, events: [{ requestId: "r1", action: "closed", actor: null, at: "2026-10-28T07:10:00", snapshot: { closedReason: "GROUP_TEACHER_CHANGED", trigger: "group_teacher_changed" } }] }, "manager").rows[0];
  const teacher = row(rec("Запрос закрыт: группу передали другому преподавателю"));
  assert.deepEqual([teacher.title, teacher.details], ["Запрос закрыт: группу передали другому преподавателю", []]);
  const manager = row(rec("Группу передали: Рахимов Т."));
  assert.deepEqual([manager.title, manager.details], ["Группу передали: Рахимов Т.", []]);
  assert.equal(row(rec(null)).title, "Запрос закрыт", "no text from the server: the table says why");
  assert.deepEqual(row(rec(null)).details, ["Преподаватель группы изменён"]);
  assert.equal(O.outcomeOf(rec("x"), "manager").text, "Сменился преподаватель");
});

test("#157 (server sync): a stranger's request is 404 for a teacher: the toast of `?request=` says «Запрос не найден»", () => {
  assert.match(read("src/components/substitutions/substitutions-page.tsx"), /toastRef\.current\("Запрос не найден", "error"\)/);
  const S = require(path.join(root, "src/lib/substitutions.ts"));
  const notFound = Object.assign(new Error("x"), { status: 404, code: "SUBSTITUTION_NOT_FOUND", detail: { code: "SUBSTITUTION_NOT_FOUND" } });
  assert.equal(S.substitutionErrorText(notFound), "Запрос на замену не найден", "the panel's error is the contract's sentence for the code");
});

test("#157 r2 (7): «Выходной отменён» is yellow ⇔ the server says `needsDecision` (and the lesson is ahead); the panel reads it from the last event", () => {
  const ahead = { lesson: { ...item().lesson, date: "2026-11-02" } };
  const t = (needs, over = {}) => O.outcomeOf(item({ outcome: "day_off_voided", ...ahead, ...over }), "manager", NOW, needs).tone;
  assert.equal(t(true), "warn");
  assert.equal(t(false), "muted");
  assert.equal(t(null), "muted");
  assert.equal(t(true, { lesson: { ...ahead.lesson, date: "2026-10-20" } }), "muted", "the lesson is past");
  const detail = (needsDecision) => ({ item: item({ id: "r1" }), events: [{ requestId: "r1", action: "day_off_voided", at: "2026-10-28T07:10:00", snapshot: { subject: "request", reopened: true, needsDecision } }] });
  assert.equal(TL.dayOffNeedsDecision(detail(true)), true);
  assert.equal(TL.dayOffNeedsDecision(detail(false)), false);
  assert.equal(TL.dayOffNeedsDecision({ item: item(), events: [] }), null);
  assert.match(O.outcomeNote({ outcome: "day_off_voided" }, true), /нужно ваше решение/);
  assert.equal(O.outcomeNote({ outcome: "day_off_voided" }, false), null);
});

test("#157 r2 (8): «Вы» only for the teacher's own action with the role `teacher`; no role - no word (LESSONS 17)", () => {
  assert.equal(O.authorLine({ role: "teacher" }, "teacher", "teacher"), "Вы");
  assert.equal(O.authorLine({ role: null }, "teacher", "teacher"), null);
  assert.equal(O.authorLine({}, "teacher", "teacher"), null);
  assert.equal(O.authorLine({ role: "admin" }, "teacher", "teacher"), null, "a manager's action is never «Вы»");
  assert.equal(O.authorLine({ role: "admin" }, "manager", "teacher"), "Администратор");
});

// the panel as the user lives it: what it shows from what it has read (a pure function, the cases run for real; the DOM is checked in the headless script)
const PS = require(path.join(root, "src/lib/substitution-panel-state.ts"));
test("#157 r2 (10/11/12): the panel shows an answer only for the open row; a failed re-read hides the old state and the «Решить»", () => {
  const pend = item({ id: "a", status: "pending", outcome: "pending", decision: null });
  const other = item({ id: "b", status: "pending", outcome: "pending", decision: null });
  const detail = (it) => ({ item: it, events: [] });
  // a late answer of row `a` while row `b` is open: nothing of `a` is shown
  let view = PS.panelView({ loaded: { id: "a", out: detail(pend) }, failed: null }, "b", other);
  assert.deepEqual([view.out, view.item.id], [null, "b"], "the head is the open row (the seed), not the answer of another row");
  assert.equal(PS.canDecideInPanel(view, "manager"), true, "a waiting row from the list may be decided");
  // the answer of the open row
  view = PS.panelView({ loaded: { id: "a", out: detail(pend) }, failed: null }, "a", null);
  assert.equal(view.out.item.id, "a");
  assert.equal(PS.canDecideInPanel(view, "manager"), true);
  assert.equal(PS.canDecideInPanel(view, "teacher"), false, "«Решить» is for a manager");
  // after a decision the re-read FAILED: the old answer is not trusted
  view = PS.panelView({ loaded: { id: "a", out: detail(pend) }, failed: { id: "a", message: "Не удалось загрузить историю" } }, "a", pend);
  assert.deepEqual([view.stale, view.out, view.error], [true, null, "Не удалось загрузить историю"]);
  assert.equal(PS.canDecideInPanel(view, "manager"), false, "no «Решить» on a state that may be old");
  // a failure of ANOTHER row does not touch this one
  view = PS.panelView({ loaded: { id: "a", out: detail(pend) }, failed: { id: "b", message: "x" } }, "a", null);
  assert.deepEqual([view.stale, view.error], [false, null]);
  // a decided row: no «Решить»
  view = PS.panelView({ loaded: { id: "a", out: detail(item({ id: "a" })) }, failed: null }, "a", null);
  assert.equal(PS.canDecideInPanel(view, "manager"), false);
  // the first read failed: the error, and the head of the seed without «Решить»
  view = PS.panelView({ loaded: null, failed: { id: "a", message: "x" } }, "a", pend);
  assert.deepEqual([view.stale, view.error, view.item.id], [false, "x", "a"]);
  assert.equal(PS.canDecideInPanel(view, "manager"), false);
  const src = read("src/components/substitutions/substitution-panel.tsx");
  assert.match(src, /canDecideInPanel\(view, audience\)/);
  assert.match(src, /initial && initial\.item\.id === requestId/, "the detail of `?request=` is used, not read twice");
});
