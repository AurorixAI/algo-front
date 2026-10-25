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
// the real api module is replaced by a recorder: the weekly-lesson helpers are run against it (no network)
const apiPath = path.join(root, "src/lib/api.ts");
const calls = [];
const behaviour = { create: () => ({ id: "new" }), revise: () => ({ id: "rev" }), oneOff: () => ({ id: "one" }) };
require.cache[apiPath] = {
  id: apiPath, filename: apiPath, loaded: true,
  exports: {
    orgApi: {
      createLesson: async (body) => { calls.push(["create", body]); return behaviour.create(body); },
      createOneOffLesson: async (body) => { calls.push(["oneOff", body]); return behaviour.oneOff(body); },
      reviseRecurringLesson: async (id, body) => { calls.push(["revise", id, body]); return behaviour.revise(id, body); },
    },
  },
};
const W = require(path.join(root, "src/lib/weekly-lessons.ts"));
const busy = (date) => Object.assign(new Error("У преподавателя уже есть урок"), {
  status: 409, code: "TEACHER_BUSY", detail: { code: "TEACHER_BUSY", message: "x", conflicts: [{ date, startTime: "15:00", endTime: "16:30", groupName: "A", withGroupName: "B" }], total: 1 },
});
const DRAFT = { startTime: "15:00", endTime: "16:30", format: "offline", room: " ", topic: " ", color: "blue", validFrom: "2026-10-26" };

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

test("createWeeklyLessons: the days go in the order of the week; a refused day is named, the others are saved", async () => {
  calls.length = 0;
  behaviour.create = (body) => {
    if (body.dayOfWeek === 3) throw busy("2026-10-28");
    return { id: `l${body.dayOfWeek}`, warnings: [{ code: "ROOM_BUSY", message: "Кабинет «7» занят" }] };
  };
  const result = await W.createWeeklyLessons("g1", [5, 3, 1], DRAFT);
  assert.deepEqual(calls.map((call) => call[1].dayOfWeek), [1, 3, 5], "one request per weekday, Monday first");
  assert.deepEqual(result.added, [1, 5]);
  assert.deepEqual(result.failed.map((item) => [item.day, item.reason]), [[3, "преподаватель занят"]]);
  assert.match(result.failed[0].detail, /У преподавателя в это время уже есть урок/);
  assert.deepEqual(result.notices, ["Кабинет «7» занят"], "the same note of two days is shown once");
  assert.equal(F.weeklyResultText(result.added, result.failed), "Пн и Пт добавлены, Ср — преподаватель занят");
  // the payload: the fixed subject, a blank room is null, a blank topic is none, the date of the start
  const sent = calls[0][1];
  assert.equal(sent.subject, "Математика");
  assert.equal(sent.room, null);
  assert.equal(sent.topic, undefined);
  assert.equal(sent.validFrom, "2026-10-26");
  assert.equal(sent.groupId, "g1");
});

test("createWeeklyLessons: any failure of one day (even a network one) does not stop the others; a refused day alone leaves only itself to retry", async () => {
  calls.length = 0;
  behaviour.create = (body) => {
    if (body.dayOfWeek === 1) throw new Error("network down");
    if (body.dayOfWeek === 2) return {};
    return { id: "ok" };
  };
  const result = await W.createWeeklyLessons("g1", [1, 2, 3], DRAFT);
  assert.equal(calls.length, 3, "every day was tried");
  assert.deepEqual(result.added, [3]);
  assert.deepEqual(result.failed.map((item) => item.day), [1, 2], "the days left to fix are exactly the refused ones");
  assert.equal(result.failed[0].reason, "network down");
  assert.equal(result.failed[1].reason, "Сервер не вернул идентификатор урока");
  // the dialog keeps only those days chosen after a partial save
  assert.match(read("src/components/schedule/weekly-lesson-dialogs.tsx"), /setDays\(failed\.map\(\(item\) => item\.day\)\)/);
  behaviour.create = () => ({ id: "new" });
});

test("a one-off lesson goes to its date through the occurrences endpoint with the blank room as null", async () => {
  calls.length = 0;
  behaviour.oneOff = () => ({ id: "one", warnings: [{ code: "ROOM_BUSY", message: "Кабинет «7» занят" }] });
  const notices = await W.createOneOff("g1", "2026-10-30", { ...DRAFT, room: "7", topic: "Разовое" });
  assert.deepEqual(notices, ["Кабинет «7» занят"]);
  assert.deepEqual(calls[0], ["oneOff", { groupId: "g1", lessonDate: "2026-10-30", startTime: "15:00", endTime: "16:30", room: "7", format: "offline", color: "blue", topic: "Разовое" }]);
});

test("a revision already scheduled is not undone: the owner opens 8 Nov (a revision 10:00 -> 12:00 acts from 1 Nov) and changes only the room", () => {
  // the weekly lesson as the schedule has it TODAY is 10:00-11:30; on 8 Nov the occurrence says 12:00-13:30
  const todays = { id: "l1", groupId: "g1", groupName: "Г", classLevel: 7, dayOfWeek: 6, startTime: "10:00", endTime: "11:30", room: null, format: "offline", color: "blue" };
  const onNov8 = { ...todays, startTime: "12:00", endTime: "13:30", occurrenceDate: "2026-11-08" };
  const snapshot = F.snapshotFromOccurrence(onNov8);
  const form = { day: 6, startTime: snapshot.startTime, endTime: snapshot.endTime, room: "12", format: "offline", topic: "", color: "blue" };
  const patch = F.revisionPatch(snapshot, form);
  assert.deepEqual(patch, { room: "12" });
  assert.ok(!("startTime" in patch) && !("endTime" in patch), "no 10:00 in the payload");
  // the old way (compare with today's template) would have sent the time back
  assert.deepEqual(F.revisionPatch(todays, form), { startTime: "12:00", endTime: "13:30", room: "12" });
  // nothing touched = nothing to send
  assert.deepEqual(F.revisionPatch(snapshot, { ...form, room: "" }), {});
  // a moved occurrence carries the time of the move: the weekly lesson keeps the planned one
  const moved = F.snapshotFromOccurrence({ ...onNov8, startTime: "16:00", endTime: "17:30", isRescheduled: true, originalStartTime: "12:00", originalEndTime: "13:30", originalRoom: null });
  assert.equal(moved.startTime, "12:00");
  assert.equal(F.firstOccurrenceOf([{ ...onNov8, occurrenceDate: "2026-11-15" }, onNov8], "g1", "l1").occurrenceDate, "2026-11-08");
  assert.equal(F.firstOccurrenceOf([onNov8], "g2", "l1"), null);
});

test("«Применить также к другим дням»: the ticked lessons get the same fields without the day, one by one; a refusal names its day", async () => {
  const changed = F.revisionPatch(
    { id: "a", dayOfWeek: 1, startTime: "14:00", endTime: "15:30", room: null, format: "offline", color: "blue", topic: "" },
    { day: 3, startTime: "15:00", endTime: "16:30", room: "12", format: "online", topic: "Тема", color: "rose" },
  );
  assert.equal(changed.dayOfWeek, 3);
  const shared = F.sharedRevisionPatch(changed);
  assert.deepEqual(shared, { startTime: "15:00", endTime: "16:30", room: "12", format: "online", topic: "Тема" });
  assert.ok(!("dayOfWeek" in shared) && !("color" in shared), "never the day, never the colour");
  calls.length = 0;
  behaviour.revise = (id) => {
    if (id === "fri") throw busy("2026-11-06");
    return { id, warnings: [{ code: "ROOM_BUSY", message: "Кабинет «12» занят" }] };
  };
  const result = await W.reviseWeeklyLessons([{ id: "fri", dayOfWeek: 5 }, { id: "wed", dayOfWeek: 3 }], "2026-11-02", "Изменены: время", shared);
  assert.deepEqual(calls.map((call) => call[1]), ["wed", "fri"], "in the order of the week");
  for (const call of calls) {
    assert.equal(call[2].effectiveFrom, "2026-11-02");
    assert.equal(call[2].startTime, "15:00");
    assert.ok(!("dayOfWeek" in call[2]), "the day is never sent to the other lessons");
  }
  assert.deepEqual(result.done, [3]);
  assert.deepEqual(result.failed.map((item) => [item.id, item.day, item.reason]), [["fri", 5, "преподаватель занят"]]);
  assert.deepEqual(result.notices, ["Кабинет «12» занят"]);
  assert.equal(F.weeklyResultText([1, ...result.done], result.failed, F.CHANGED_WORDS), "Пн и Ср изменены, Пт — преподаватель занят");
  behaviour.revise = () => ({ id: "rev" });
});

test("the end follows the start (+90) only while the end was not typed: a typed or pasted end is never overwritten", () => {
  const start = (current, next, typed) => F.startTimePatch({ startTime: current }, next, typed);
  assert.deepEqual(start("10:00", "15:00", false), { startTime: "15:00", endTime: "16:30" });
  assert.deepEqual(start("10:00", "15:00", true), { startTime: "15:00" }, "a typed end stays");
  assert.equal(start("15:00", "15:00", false), null, "a repeated start (a blur) changes nothing");
  assert.deepEqual(start("15:00", "", false), { startTime: "" }, "a half-typed start has no end to follow");
  assert.equal(F.isEndTyped("14:00"), true);
  assert.equal(F.isEndTyped(""), false, "an emptied end gives the start its say again");
  const fields = read("src/components/schedule/lesson-slot-fields.tsx");
  assert.match(fields, /startTimePatch\(value, startTime, endTyped\.current\)/);
  assert.match(fields, /endTyped\.current = isEndTyped\(endTime\)/);
});

test("the day chips: label-in-name, a hint tied to the group, the invalid state marked; one day for a change, with the other days of the group offered", () => {
  const fields = read("src/components/schedule/lesson-slot-fields.tsx");
  assert.doesNotMatch(fields, /aria-label=\{day\.name\}/);
  assert.match(fields, /\{day\.short\}<span className="sr-only"> \{day\.name\}<\/span>/);
  assert.match(fields, /aria-describedby=\{hintId\}/);
  assert.match(fields, /aria-invalid=\{invalid \|\| undefined\}/);
  assert.match(fields, /role=\{invalid \? "alert" : undefined\}/);
  assert.match(fields, /role=\{single \? "radiogroup" : "group"\}/);
  assert.match(fields, /role: "radio" as const, "aria-checked": on/);
  const dialogs = read("src/components/schedule/weekly-lesson-dialogs.tsx");
  assert.match(dialogs, /<WeekdayChips idPrefix="sched-edit" single/);
  assert.match(dialogs, /Применить также к другим дням группы/);
  assert.match(dialogs, /reviseWeeklyLessons\(targets, effectiveFrom, text, shared\)/);
  assert.match(dialogs, /Object\.keys\(shared\)\.length > 0/, "hidden when only the day was changed");
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
  // the sheet stays open while the weekly lesson is read; a failure is said in it; a stopped series offers nothing
  assert.match(overview, /setSeriesError\("Не удалось загрузить постоянное расписание/);
  assert.match(overview, /seriesPending=\{opening === "edit" \|\| opening === "end" \? opening : null\}/);
  assert.match(overview, /templates === null \|\| templates\.some\(\(item\) => item\.id === lesson\.id\)/);
  assert.match(overview, /Не удалось загрузить расписание группы\. Повторите попытку\./, "the add dialog does not open on an empty list of lessons");
  assert.match(overview, /void loadTemplates\(\); \/\/ also after a partial save/);
  assert.match(overview, /roomLine\(lesson\)/);
  const sheet = read("src/components/groups/lesson-action-sheet.tsx");
  assert.match(sheet, /case "editSeries"/);
  assert.match(sheet, /case "endSeries"/);
  assert.match(sheet, /case "reschedule"/);
  assert.match(sheet, /case "cancel"/);
  assert.match(sheet, /data-testid="series-error"/);
});

test("the room reads «каб. 12»; a room that begins with a word stays as it is; online and no room are not touched", () => {
  const C = require(path.join(root, "src/lib/schedule-card-actions.ts"));
  assert.equal(F.roomWithPrefix("12"), "каб. 12");
  assert.equal(F.roomWithPrefix(" 3-А "), "каб. 3-А");
  assert.equal(F.roomWithPrefix("Зал"), "Зал");
  assert.equal(F.roomWithPrefix("Малый зал"), "Малый зал");
  assert.equal(C.roomLine({ room: "12" }), "каб. 12");
  assert.equal(C.roomLine({ room: "Зал" }), "Зал");
  assert.equal(C.roomLine({ room: "12", format: "online" }), "Онлайн");
  assert.equal(C.roomLine({ room: null }), null);
});

test("wiring: the group form is the teacher's one (scope, weekdays, fields) and saves through the same endpoints, with the same refusals", () => {
  const dialogs = read("src/components/schedule/weekly-lesson-dialogs.tsx");
  const helper = read("src/lib/weekly-lessons.ts");
  assert.match(dialogs, /<LessonScopeFields/);
  assert.match(dialogs, /createWeeklyLessons\(group\.id, sendDays/);
  assert.match(dialogs, /createOneOff\(group\.id, date/);
  assert.match(dialogs, /DATE_REQUIRED_TEXT/);
  assert.match(dialogs, /isoDateDayOfWeek\(date\)/, "a one-off lesson is checked against the lessons of its weekday");
  assert.match(dialogs, /время уже прошло/, "only the past weekday of today is refused and named");
  assert.match(helper, /orgApi\.createLesson\(\{\s*groupId/);
  assert.match(helper, /orgApi\.createOneOffLesson\(\{\s*groupId/);
  assert.match(helper, /validFrom: draft\.validFrom/);
  assert.match(helper, /scheduleErrorText\(failure/);
  assert.match(helper, /warningTexts\(created\)/);
  assert.match(dialogs, /orgApi\.reviseRecurringLesson\(lesson\.id, \{ effectiveFrom, reason: text, \.\.\.changed \}/);
  assert.match(dialogs, /orgApi\.endRecurringLesson\(lesson\.id/);
  assert.match(dialogs, /getRecurringLessonEndImpact\(lesson\.id/);
  assert.match(read("src/lib/lesson-slot-form.ts"), /const room = roomForSave\(form\.room\)/);
  // the old direct PUT / DELETE answer 410, and a one-off lesson cannot be deleted on the server: never used
  assert.doesNotMatch(dialogs + helper, /orgApi\.updateLesson|orgApi\.deleteLesson/);
  assert.doesNotMatch(read("src/components/groups/lesson-action-sheet.tsx"), /Удалить разовое/);
});

test("wiring: the teacher's schedule uses the shared scope switch, fields and dialogs; the stop dialog is above the lesson panel", () => {
  const page = read("src/app/teacher/schedule/page.tsx");
  assert.match(page, /<EditWeeklyLessonDialog/);
  assert.match(page, /<EndWeeklyLessonDialog/);
  assert.match(page, /<EndWeeklyLessonDialog\s+lesson=\{endingRecurringLesson\}\s+aboveLessonPanel/);
  assert.match(page, /<EditWeeklyLessonDialog\s+lesson=\{editingLesson\}\s+aboveLessonPanel/);
  assert.match(page, /if \(endingRecurringLesson \|\| editingLesson\) return;/, "Escape closes the topmost layer only");
  assert.match(read("src/components/schedule/weekly-lesson-dialogs.tsx"), /aboveLessonPanel=\{aboveLessonPanel\}/);
  assert.match(page, /<LessonSlotFields/);
  assert.match(page, /<LessonScopeFields/);
  assert.match(page, /createWeeklyLessons\(groupId, newDays/);
  // a repeated click or Enter while the save is on its way does nothing; the button says it
  assert.match(page, /if \(savingLesson\) return;/);
  assert.match(page, /savingLesson \? "Сохраняем…" : "Сохранить урок"/);
  // the suggested times follow the first chosen day until the times are typed
  assert.match(page, /if \(!isAddModalOpen \|\| timesEdited\) return;/);
  assert.doesNotMatch(page, /orgApi\.reviseRecurringLesson|orgApi\.endRecurringLesson|getRecurringLessonEndImpact|orgApi\.createLesson/);
  assert.ok(page.split("\n").length < 3400, "the teacher page must not grow back (was 4046 lines)");
});
