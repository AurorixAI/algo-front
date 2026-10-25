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

test("wiring: the tab offers «Добавить в расписание» to the owner and the administrator, not on an archived group", () => {
  const overview = read("src/components/groups/group-schedule-overview.tsx");
  assert.match(overview, /\(viewerRole === "owner" \|\| viewerRole === "admin"\) && !archived && \(\s*<GroupWeeklySlots/);
  assert.match(overview, /teacherAssigned = true/);
  assert.match(read("src/components/groups/group-detail-view.tsx"), /teacherAssigned=\{Boolean\(group\.teacher_id \|\| group\.teacher_name\)\}/);
  const slots = read("src/components/groups/group-weekly-slots.tsx");
  assert.match(slots, /Добавить в расписание/);
  assert.match(slots, /NO_TEACHER_SCHEDULE_HINT/);
  for (const dialog of ["AddWeeklyLessonDialog", "EditWeeklyLessonDialog", "EndWeeklyLessonDialog"]) assert.match(slots, new RegExp(`<${dialog}`));
});

test("wiring: the group form creates a weekly lesson of THIS group through the same endpoint, with the same refusals", () => {
  const dialogs = read("src/components/schedule/weekly-lesson-dialogs.tsx");
  assert.match(dialogs, /orgApi\.createLesson\(\{\s*groupId: group\.id/);
  assert.match(dialogs, /validFrom: validFrom \|\| today/);
  assert.match(dialogs, /scheduleErrorText\(failure/);
  assert.match(dialogs, /warningTexts\(created\)/);
  assert.match(dialogs, /orgApi\.reviseRecurringLesson\(lesson\.id/);
  assert.match(dialogs, /orgApi\.endRecurringLesson\(lesson\.id/);
  assert.match(dialogs, /getRecurringLessonEndImpact\(lesson\.id/);
  // the old direct PUT / DELETE answer 410: the dialogs never use them
  assert.doesNotMatch(dialogs, /orgApi\.updateLesson|orgApi\.deleteLesson/);
});

test("wiring: the teacher's schedule uses the shared dialogs and fields instead of its own copies", () => {
  const page = read("src/app/teacher/schedule/page.tsx");
  assert.match(page, /<EditWeeklyLessonDialog/);
  assert.match(page, /<EndWeeklyLessonDialog/);
  assert.match(page, /<LessonSlotFields/);
  assert.doesNotMatch(page, /orgApi\.reviseRecurringLesson|orgApi\.endRecurringLesson|getRecurringLessonEndImpact/);
  assert.ok(page.split("\n").length < 3400, "the teacher page must not grow back (was 4046 lines)");
});
