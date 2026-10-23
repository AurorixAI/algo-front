// LOGIC-B O9 (import report), O10 / F8 (the page of an invitation), O12 / O15 / F7 (students «Без группы»), O17 (nothing for the student's screen).
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
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/logB", `${name}.json`), "utf8"));
const R = require(path.join(root, "src/lib/import-report.ts"));
const S = require(path.join(root, "src/lib/staff-lifecycle.ts"));
const St = require(path.join(root, "src/lib/student-status.ts"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { ReviewStep, DoneStep } = require(path.join(root, "src/components/import/import-modal.tsx"));
const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const refusal = (status, body) => Object.assign(new Error(body.detail.message), { status, code: body.detail.code, detail: body.detail });
const withLegacyShape = (counts) => ({ teachers_new: 0, teachers_existing: 0, ...counts });

// ── O9: chain 3 ────────────────────────────────────────────────────────────────────────────────

test("[O9.R6] the preview of chain 3: the three counters of the spec, the table «Пропущено и почему» with the reasons in the words of the spec", () => {
  const preview = fixture("c3_preview_ok");
  const html = renderToStaticMarkup(React.createElement(ReviewStep, { preview: { ...preview, counts: withLegacyShape(preview.counts) } }));
  const text = textOf(html);
  assert.match(text, /Будет добавлено: 2/);
  assert.match(text, /Уже в группах: 0/);
  assert.match(text, /Пропущено: 5/);
  assert.match(text, /Пропущено и почему/);
  // columns: sheet, row, student, group, reason
  assert.match(text, /Лист Строка Ученик Группа Причина/);
  assert.match(text, /Ученики 2 Бобоев Али 9-А В группе нет мест: лимит 3, занято 3/);
  assert.match(text, /Султанова Нодира 6-Д В группе нет мест: лимит 2, занято 2/);
  assert.match(text, /Иванов Иван 6-Д Ученик уже есть в системе и состоит в группе «9-А»\. Перевод выполните вручную — при переводе переносятся оплаты/);
  assert.match(text, /Юсупов Тимур 5-В Группа в архиве\. Верните её из архива или выберите другую/);
  assert.match(text, /Каримова Лола 6-Д Строка повторяется в файле|8 .* Строка повторяется в файле/);
  assert.match(text, /Скачать отчёт \(CSV\)/);
  assert.match(text, /Ошибок нет — можно импортировать\./);
});

test("[O9.R7] the blocking teacher check of chain 3 is shown as an error and the commit stays off", () => {
  const preview = fixture("c3_preview_teacher_not_teacher");
  assert.equal(preview.ok, false);
  const issue = preview.issues[0];
  assert.equal(issue.code, "TEACHER_NOT_FOUND");
  assert.equal(issue.message, "Преподаватель nobody@algo.test не найден в системе. Добавьте его через интерфейс.");
  const html = renderToStaticMarkup(React.createElement(ReviewStep, { preview: { ...preview, counts: withLegacyShape(preview.counts) } }));
  const text = textOf(html);
  assert.match(text, /Есть ошибки — исправьте файл и загрузите снова\./);
  assert.match(text, /Группы строка 4 · Почта учителя: Преподаватель nobody@algo\.test не найден в системе\. Добавьте его через интерфейс\./);
  assert.doesNotMatch(text, /Пропущено и почему/, "no skipped rows, no table");
  assert.match(R.issueText(issue), /^Группы, строка 4 · Почта учителя: /);
});

test("[O9.R2] the repeat of chain 3: «Уже в этой группе» is information and is counted apart; the skipped counter is the real one", () => {
  const repeat = fixture("c3_commit_repeat");
  const view = R.importReportView(repeat.counts, repeat.skipped);
  assert.equal(view.willAdd, 0);
  assert.equal(view.alreadyIn, 2);
  assert.equal(view.skippedCount, 5);
  assert.equal(view.skipped.length, 5);
  assert.equal(view.info.length, 2);
  assert.equal(R.skipReasonText(view.info[0]), "Уже в этой группе");
  // an older server sends no counters of the pack: they are counted from the rows
  const old = R.importReportView({ students_new: 1 }, repeat.skipped);
  assert.equal(old.skippedCount, 5);
  assert.equal(old.alreadyIn, 2);
});

test("[O9.R3] the done screen: «Готово: добавлено n, пропущено m», the created groups, no roll-back", () => {
  const ok = fixture("c3_commit_ok");
  assert.equal(R.importDoneText(2, 5), "Готово: добавлено 2, пропущено 5");
  const text = textOf(renderToStaticMarkup(React.createElement(DoneStep, { result: { ...ok, counts: withLegacyShape(ok.counts) } })));
  assert.match(text, /Готово: добавлено 2, пропущено 5/);
  assert.match(text, /Созданы группы: «6-Д»/);
  assert.match(text, /Отката импорта нет/);
  assert.match(text, /Пропущено и почему/);
});

test("[O9.R4] the CSV of the report: BOM, semicolons, quotes escaped, the reason in the words of the spec", () => {
  const csv = R.importReportCsv(fixture("c3_preview_ok").skipped);
  assert.ok(csv.startsWith("﻿Лист;Строка;Ученик;Группа;Причина\r\n"));
  assert.match(csv, /Ученики;2;Бобоев Али;9-А;В группе нет мест: лимит 3, занято 3\r\n/);
  assert.equal(R.importReportCsv([{ sheet: "Ученики", row: 9, code: "X", message: 'Строка "с кавычкой"; и точка с запятой', student: "А", group: "Б" }]).split("\r\n")[1], 'Ученики;9;А;Б;"Строка ""с кавычкой""; и точка с запятой"');
  assert.equal(R.importReportCsv([]), "﻿Лист;Строка;Ученик;Группа;Причина\r\n");
});

test("[O9.R4] a parallel import: «Импорт уже выполняется. Подождите минуту»", () => {
  const busy = fixture("x_import_in_progress");
  assert.equal(R.importErrorText(refusal(busy.status, busy.body), "x"), "Импорт уже выполняется. Подождите минуту");
  assert.equal(R.importErrorText(new Error("boom"), "x"), "boom");
  assert.equal(R.importErrorText({}, "fallback"), "fallback");
});

test("the import modal is wired: the CSV button, the retry text, no loss of the old screens", () => {
  const modal = read("src/components/import/import-modal.tsx");
  for (const needle of [/importErrorText/, /SkippedTable/, /IMPORT_REPORT_BUTTON/, /Будет добавлено:/, /Уже в группах:/, /Пропущено:/, /Пропущено и почему/, /saveBlobAs/]) assert.match(modal, needle, String(needle));
});

// ── O10 / F8: the page of an invitation ────────────────────────────────────────────────────────

test("[O10.R1][O10.R9] the page of a returning member: the words of the spec, the e-mail is shown and not edited", () => {
  const info = fixture("c6_invite_info_returning");
  assert.equal(info.is_returning, true);
  assert.equal(S.returningIntroText(info.org_name), "Вы возвращаетесь в «Алго Тест». Задайте новый пароль для входа.");
  const page = read("src/app/invite/[code]/page.tsx");
  for (const needle of [/returningIntroText\(inviteInfo\.org_name\)/, /readOnly=\{Boolean\(inviteInfo\?\.email\)\}/, /inviteAcceptErrorText\(failure\)/, /INVITE_NOT_FOUND_TEXT/, /\{!returning && \(/, /returning \? \{\} : \{ first_name/]) assert.match(page, needle, String(needle));
  assert.doesNotMatch(page, /Приглашение не найдено или истекло"/);
});

test("[O10.R1][O10.R9] the refusals of «Принять приглашение» in the words of the spec", () => {
  const mismatch = fixture("c6_invite_mismatch");
  assert.equal(mismatch.status, 400);
  assert.equal(S.inviteAcceptErrorText(refusal(mismatch.status, mismatch.body)), "Это приглашение выдано для другого email");
  assert.equal(S.inviteAcceptErrorText({ code: "EMAIL_IN_OTHER_ORG", message: "x" }), "Этот email уже зарегистрирован в другом центре. Пока один email работает только в одном центре.");
  assert.equal(S.inviteAcceptErrorText(new Error("Приглашение не найдено или уже использовано")), "Приглашение не найдено или уже использовано");
  assert.equal(S.INVITE_NOT_FOUND_TEXT, "Приглашение не найдено, использовано или истекло.");
});

// ── O12 / O15 / F7: students ───────────────────────────────────────────────────────────────────

test("[O15.R1] «Без группы» comes from the server's `status_view`; the old client logic stays for an older server", () => {
  const student = fixture("x_student_no_group");
  assert.equal(student.status, "active");
  assert.equal(student.status_view, "no_group");
  assert.equal(St.studentStatusKey(student), "no_group");
  assert.equal(St.studentStatusLabel(student), "Без группы");
  assert.equal(St.studentHasGroup(student), false);
  // the server's word wins over the stored status
  assert.equal(St.studentStatusLabel({ status: "active", status_view: "active", has_group: true }), "Активный");
  assert.equal(St.studentStatusLabel({ status: "active", status_view: "archived" }), "Архив");
  assert.equal(St.studentStatusLabel({ status: "new", status_view: "new" }), "Новый");
  assert.equal(St.studentStatusLabel({ status: "diagnosed", status_view: "diagnosed" }), "Диагностирован");
  // an older server: no status_view, no has_group
  assert.equal(St.studentStatusLabel({ status: "active", group_id: null }), "Без группы");
  assert.equal(St.studentStatusLabel({ status: "active", group_id: "g" }), "Активный");
  assert.equal(St.studentStatusLabel({ status: "active", groups_count: 0 }), "Без группы");
  // `has_group` is the server's own verdict, a stale `group_id` does not make a student «in a group»
  assert.equal(St.studentHasGroup({ has_group: false, group_id: "stale" }), false);
  assert.equal(St.studentHasGroup({ has_group: true }), true);
  assert.equal(fixture("x_org_stats").no_group_students, 1);
});

test("[O12.R8] a teacher does not add students: the refusal is in the words of the spec and nothing in the teacher's UI creates a student", () => {
  const refused = fixture("x_staff_role_required");
  assert.equal(refused.status, 403);
  assert.equal(refused.body.detail.message, "Добавлять учеников может администратор центра");
  const callers = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?)$/.test(entry.name) && /createStudent\(/.test(fs.readFileSync(full, "utf8")) && !full.endsWith("lib/api.ts")) callers.push(path.relative(root, full).replace(/\\/g, "/"));
  });
  walk(path.join(root, "src"));
  assert.deepEqual(callers, ["src/app/admin/students/new/page.tsx"]);
});

test("[O17] nothing changes on the student's screen: the exam page does not mention the roster check, the front sends no `as_of`", () => {
  const exam = read("src/app/e/[code]/page.tsx");
  assert.doesNotMatch(exam, /as_of|resume_only/);
  assert.doesNotMatch(read("src/lib/api.ts"), /as_of/);
});
