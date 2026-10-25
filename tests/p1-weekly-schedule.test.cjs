// P1: the owner / administrator add, change and stop the weekly lessons of a group on the tab «Расписание».
// The form is the teacher's one, extracted (lib/lesson-slot-form + components/schedule/*); these tests pin the rules and the wiring.
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
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const F = require(path.join(root, "src/lib/lesson-slot-form.ts"));

test("the end of a lesson follows its start by 90 minutes; a half-typed start changes nothing", () => {
  assert.equal(F.endTimeAfter("10:00"), "11:30");
  assert.equal(F.endTimeAfter("22:30"), "00:00");
  assert.equal(F.endTimeAfter(""), "");
  assert.equal(F.endTimeAfter("1"), "");
});

test("the suggested time is after the latest lesson of the day, else 10:00-11:30", () => {
  assert.deepEqual(F.suggestedTimes([]), { startTime: "10:00", endTime: "11:30" });
  assert.deepEqual(F.suggestedTimes([{ endTime: "11:30" }, { endTime: "13:00" }]), { startTime: "13:00", endTime: "14:30" });
});

test("a clash is a real overlap on the same day, never the lesson itself", () => {
  const lessons = [{ id: "a", dayOfWeek: 2, startTime: "10:00", endTime: "11:30" }];
  assert.equal(F.overlappingLesson(lessons, 2, "11:00", "12:00")?.id, "a");
  assert.equal(F.overlappingLesson(lessons, 2, "11:30", "13:00"), undefined, "touching is not an overlap");
  assert.equal(F.overlappingLesson(lessons, 3, "10:00", "11:30"), undefined, "another day");
  assert.equal(F.overlappingLesson(lessons, 2, "10:00", "11:30", "a"), undefined, "the lesson being edited");
});

test("validation: empty time, the end before the start, a start that has gone today", () => {
  assert.equal(F.timeRangeProblem("", "11:00"), F.TIME_REQUIRED_TEXT);
  assert.equal(F.timeRangeProblem("12:00", "11:00"), F.END_BEFORE_START_TEXT);
  assert.equal(F.timeRangeProblem("12:00", "12:00"), F.END_BEFORE_START_TEXT);
  assert.equal(F.timeRangeProblem("10:00", "11:30"), null);
  assert.equal(F.pastTimeProblem("09:00", 10 * 60 + 5), "Нельзя назначить урок на прошедшее время сегодняшнего дня (текущее время: 10:05)");
  assert.equal(F.pastTimeProblem("10:05", 10 * 60 + 5), null);
});

test("the day of the week is one of seven; the subject is fixed; the hint for a group without a teacher is the owner's sentence", () => {
  assert.deepEqual(F.DAYS.map((d) => d.id), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(F.LESSON_SUBJECT, "Математика");
  assert.equal(F.NO_TEACHER_SCHEDULE_HINT, "Назначьте преподавателя группе, чтобы уроки появились у него в расписании");
  assert.equal(F.DAY_REQUIRED_TEXT, "Выберите день недели");
});

test("several weekdays: the days are listed in the order of the week, switched on and off", () => {
  assert.equal(F.dayList([3, 1]), "Пн и Ср");
  assert.equal(F.dayList([5, 1, 3]), "Пн, Ср и Пт");
  assert.equal(F.dayList([2]), "Вт");
  assert.deepEqual(F.toggleDay([3], 1), [1, 3]);
  assert.deepEqual(F.toggleDay([1, 3], 1), [3]);
  assert.equal(F.DAYS_REQUIRED_HINT, "Выберите день");
});

test("no silent partial success: the answer names the added days and the refused ones", () => {
  assert.equal(F.weeklyResultText([1, 3], [{ day: 5, reason: "преподаватель занят" }]), "Пн и Ср добавлены, Пт — преподаватель занят");
  assert.equal(F.weeklyResultText([1], [{ day: 5, reason: "преподаватель занят" }]), "Пн добавлен, Пт — преподаватель занят");
  assert.equal(F.weeklyResultText([], [{ day: 5, reason: "преподаватель занят" }, { day: 1, reason: "такой урок уже есть" }]), "Не добавлено: Пн — такой урок уже есть; Пт — преподаватель занят");
  assert.equal(F.weeklyResultText([1, 3], []), "");
});

test("the sheet of a weekly lesson also changes / stops the weekly lesson; a one-off lesson only moves / cancels", () => {
  const C = require(path.join(root, "src/lib/schedule-card-actions.ts"));
  const base = { role: "owner", archived: false, today: "2026-10-22", hasTeacherInfo: true, state: "scheduled", date: "2026-10-24", startTime: "10:00" };
  assert.deepEqual(C.scheduleCardActions({ ...base, recurring: true }), ["assign", "reschedule", "cancel", "editSeries", "endSeries"]);
  assert.deepEqual(C.scheduleCardActions({ ...base, recurring: false }), ["assign", "reschedule", "cancel"]);
  assert.deepEqual(C.scheduleCardActions(base), ["assign", "reschedule", "cancel"]);
  assert.deepEqual(C.scheduleCardActions({ ...base, state: "completed", recurring: true }), ["journal", "editSeries", "endSeries"]);
  assert.deepEqual(C.scheduleCardActions({ ...base, state: "cancelled", recurring: true }), [], "a cancelled lesson has no sheet");
  assert.deepEqual(C.scheduleCardActions({ ...base, role: "teacher", recurring: true }), []);
  assert.deepEqual(C.scheduleCardActions({ ...base, archived: true, recurring: true }), []);
  assert.equal(C.SCHEDULE_ACTION_LABEL.editSeries, "Изменить постоянный урок");
  assert.equal(C.SCHEDULE_ACTION_LABEL.endSeries, "Прекратить урок");
});

test("wiring: «Добавить в расписание» is in the header of «Расписание группы» for the owner and the administrator, not on an archived group", () => {
  const overview = read("src/components/groups/group-schedule-overview.tsx");
  assert.match(overview, /const canManage = \(viewerRole === "owner" \|\| viewerRole === "admin"\) && !archived/);
  assert.match(overview, /\{canManage && \(\s*<button[^>]*onClick=\{\(\) => void openAdd\(\)\}/);
  assert.match(overview, /Добавить в расписание/);
  assert.match(overview, /teacherAssigned = true/);
  assert.match(overview, /NO_TEACHER_SCHEDULE_HINT/);
  assert.match(overview, /onEditSeries=\{\(\) => void openSeries\("edit"\)\}/);
  assert.match(overview, /onEndSeries=\{\(\) => void openSeries\("end"\)\}/);
  assert.match(overview, /showToast\(text, "success", notices\)/, "a busy room is a note of the toast, not a permanent block");
  assert.ok(!fs.existsSync(path.join(root, "src/components/groups/group-weekly-slots.tsx")), "no separate «Еженедельные уроки» block");
  assert.doesNotMatch(overview, /Еженедельные уроки/);
  assert.match(read("src/components/groups/group-detail-view.tsx"), /teacherAssigned=\{Boolean\(group\.teacher_id \|\| group\.teacher_name\)\}/);
  const sheet = read("src/components/groups/lesson-action-sheet.tsx");
  assert.match(sheet, /case "editSeries"/);
  assert.match(sheet, /case "endSeries"/);
  assert.match(sheet, /case "reschedule"/);
  assert.match(sheet, /case "cancel"/);
});

test("wiring: the group form is the teacher's one (scope, weekdays, fields) and saves through the same endpoints, with the same refusals", () => {
  const dialogs = read("src/components/schedule/weekly-lesson-dialogs.tsx");
  const helper = read("src/lib/weekly-lessons.ts");
  assert.match(dialogs, /<LessonScopeFields/);
  assert.match(dialogs, /createWeeklyLessons\(group\.id, days/);
  assert.match(dialogs, /createOneOff\(group\.id, date/);
  assert.match(helper, /orgApi\.createLesson\(\{\s*groupId/);
  assert.match(helper, /orgApi\.createOneOffLesson\(\{\s*groupId/);
  assert.match(helper, /validFrom: draft\.validFrom/);
  assert.match(helper, /scheduleErrorText\(failure/);
  assert.match(helper, /warningTexts\(created\)/);
  assert.match(dialogs, /orgApi\.reviseRecurringLesson\(lesson\.id/);
  assert.match(dialogs, /orgApi\.endRecurringLesson\(lesson\.id/);
  assert.match(dialogs, /getRecurringLessonEndImpact\(lesson\.id/);
  // the old direct PUT / DELETE answer 410, and a one-off lesson cannot be deleted on the server: never used
  assert.doesNotMatch(dialogs + helper, /orgApi\.updateLesson|orgApi\.deleteLesson/);
  assert.doesNotMatch(read("src/components/groups/lesson-action-sheet.tsx"), /Удалить разовое/);
});

test("the end follows the start (+90) only while the end was not typed; the day field says «Выберите день»", () => {
  const fields = read("src/components/schedule/lesson-slot-fields.tsx");
  assert.match(fields, /endTyped\.current = endTime !== ""/);
  assert.match(fields, /onChange\(endTime && !endTyped\.current \? \{ startTime, endTime \} : \{ startTime \}\)/);
  assert.match(fields, /if \(startTime === value\.startTime\) return/);
  assert.match(fields, /placeholder="Выберите день"/);
  assert.match(fields, /DAYS_REQUIRED_HINT/);
});

test("wiring: the teacher's schedule uses the shared scope switch, fields and dialogs instead of its own copies", () => {
  const page = read("src/app/teacher/schedule/page.tsx");
  assert.match(page, /<EditWeeklyLessonDialog/);
  assert.match(page, /<EndWeeklyLessonDialog/);
  assert.match(page, /<LessonSlotFields/);
  assert.match(page, /<LessonScopeFields/);
  assert.match(page, /createWeeklyLessons\(groupId, newDays/);
  assert.doesNotMatch(page, /orgApi\.reviseRecurringLesson|orgApi\.endRecurringLesson|getRecurringLessonEndImpact|orgApi\.createLesson/);
  assert.ok(page.split("\n").length < 3400, "the teacher page must not grow back (was 4046 lines)");
});
