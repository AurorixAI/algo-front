// WE-E: the "server" the two teacher screens talk to in the behaviour tests of the lesson panel: groups, lessons of a few days, the journals of
// the groups, and the writes (start / save / finish / cancel / reconcile), all in memory. The screens are the REAL pages; only `orgApi` / `examsApi`
// methods are replaced, so every call a handler makes is recorded in `world.calls` (name + arguments) and can be answered, delayed or refused.
const harness = require("./page-harness.cjs");
const path = require("node:path");

const NOW = "2026-11-04T12:30:00+05:00";             // Wednesday, 12:30 in Tashkent
const TODAY = "2026-11-04";
const PAST_DAY = "2026-11-02";                        // Monday of the same week
const FUTURE_DAY = "2026-11-06";                      // Friday of the same week

const student = (id, first, last) => ({ id, first_name: first, last_name: last, full_name: `${last} ${first}`, class_level: 7, status: "active", display_id: null, student_phone: null, joined_at: null, last_theta: null, last_level: null, last_diagnosed_at: null });
const STUDENTS = [student("s1", "Азиз", "Алиев"), student("s2", "Барно", "Бобоева")];

const lesson = (id, groupId, groupName, date, start, end, extra = {}) => ({
  id, groupId, groupName, classLevel: 7, subject: "math",
  dayOfWeek: new Date(`${date}T12:00:00Z`).getUTCDay() || 7,
  startTime: start, endTime: end, room: "Каб. 3", format: "offline", color: "blue",
  occurrenceDate: date, isRescheduled: false, ...extra,
});

/** One lesson per group, so the journals do not mix. `pastRec` is the SAME weekly lesson (same id, same group) on the Monday of this week: a recurring lesson has one id on every date. */
const LESSONS = {
  live: lesson("L-live", "G-live", "Живая", TODAY, "12:00", "13:30"),
  upcoming: lesson("L-up", "G-up", "Скоро", TODAY, "15:00", "16:00"),
  over: lesson("L-over", "G-over", "Прошла", TODAY, "09:00", "10:00"),
  past: lesson("L-past", "G-past", "Вчерашняя", PAST_DAY, "10:00", "11:00"),
  future: lesson("L-future", "G-future", "Будущая", FUTURE_DAY, "10:00", "11:00"),
};
const RECURRING_PAST = lesson("L-live", "G-live", "Живая", PAST_DAY, "12:00", "13:30");

function createWorld(options = {}) {
  const world = {
    calls: [],
    user: { id: "t1", role: "teacher", org_role: "teacher", first_name: "Учитель", last_name: "Тестов" },
    groups: [],
    lessons: [...Object.values(LESSONS), ...(options.recurring ? [RECURRING_PAST] : [])].map((l) => ({ ...l })),
    journals: {},            // groupId -> { statuses, versions, records, rosterStudentIds, cancellationReasons, excuses }
    rosters: {},             // groupId -> students
    openActions: [],         // OpenAttendanceAction[] (the server's list of «пропущенный урок» / «в процессе»)
    failNext: {},            // method -> Error: the next call of the method rejects once
    hold: {},                // method -> deferred: the call waits for it
    bindingCanCancel: true,
    ...options,
  };
  delete world.recurring;
  for (const l of world.lessons) {
    if (!world.groups.some((g) => g.id === l.groupId)) world.groups.push({ id: l.groupId, name: l.groupName, status: "active", teacher_id: world.user.id, class_level: 7, student_count: STUDENTS.length, subject: "math" });
    world.rosters[l.groupId] ??= STUDENTS;
    world.journals[l.groupId] ??= { statuses: {}, versions: {}, records: {}, rosterStudentIds: {}, cancellationReasons: {}, excuses: {} };
  }
  const key = (l) => `${l.occurrenceDate}_${l.id}`;
  world.keyOf = key;
  world.journal = (groupId) => world.journals[groupId];
  world.called = (name) => world.calls.filter((c) => c.name === name);
  world.setLessonState = (l, state) => {
    const j = world.journals[l.groupId];
    const k = key(l);
    j.statuses[k] = state.status;
    if (state.version !== undefined) j.versions[k] = state.version;
    if (state.records) j.records[k] = state.records;
    if (state.roster) j.rosterStudentIds[k] = state.roster;
    if (state.cancellationReason) j.cancellationReasons[k] = state.cancellationReason;
  };
  world.openAction = (l, type = "missed") => ({ actionType: type, groupId: l.groupId, groupName: l.groupName, classLevel: 7, lessonId: l.id, lessonDate: l.occurrenceDate, subject: "math", startTime: l.startTime, endTime: l.endTime, room: l.room, format: l.format, topic: null, markedCount: 0, rosterCount: STUDENTS.length, remainingCount: STUDENTS.length, requiresAdmin: false, ageDays: 2 });

  const respond = async (name, args, produce) => {
    world.calls.push({ name, args });
    if (world.hold[name]) { const gate = world.hold[name]; delete world.hold[name]; await gate.promise; }
    if (world.failNext[name]) { const error = world.failNext[name]; delete world.failNext[name]; throw error; }
    return produce();
  };
  const orgApi = require(path.join(harness.root, "src/lib/api.ts")).orgApi;
  const examsApi = require(path.join(harness.root, "src/lib/api.ts")).examsApi;
  const patched = [];
  const patch = (target, name, fn) => { patched.push([target, name, target[name]]); target[name] = fn; };
  const rangeOf = (period) => period;

  patch(orgApi, "getTeacherDashboardSummary", (date) => respond("getTeacherDashboardSummary", [date], () => {
    const todayLessons = world.lessons.filter((l) => l.occurrenceDate === date);
    const states = [];
    for (const l of todayLessons) {
      const j = world.journals[l.groupId];
      states.push({ lessonId: l.id, groupId: l.groupId, status: j.statuses[key(l)] || null, hasSavedRecords: Object.keys(j.records[key(l)] || {}).length > 0 });
    }
    return { businessDate: date, groups: world.groups, studentCount: STUDENTS.length, todayLessons, scheduleWindow: world.lessons, openAttendanceActions: world.openActions, attendanceStates: states };
  }));
  patch(orgApi, "getOpenAttendanceActions", () => respond("getOpenAttendanceActions", [], () => world.openActions));
  patch(orgApi, "listGroups", () => respond("listGroups", [], () => world.groups));
  patch(orgApi, "getSchedule", () => respond("getSchedule", [], () => world.lessons));
  patch(orgApi, "getScheduleOccurrences", (period) => respond("getScheduleOccurrences", [period], () => world.lessons.filter((l) => l.occurrenceDate >= period.dateFrom && l.occurrenceDate <= period.dateTo)));
  patch(orgApi, "getGroup", (id) => respond("getGroup", [id], () => ({ id, name: world.groups.find((g) => g.id === id)?.name, status: "active", students: world.rosters[id] || [] })));
  // the journal of the group for the PERIOD asked (the keys of every map are `<date>_<lessonId>`): a read for the wrong date shows the wrong lesson
  const inPeriod = (key, period) => !period || typeof period === "string" || !period.dateFrom || (key.slice(0, 10) >= period.dateFrom && key.slice(0, 10) <= period.dateTo);
  const journalFor = (groupId, period) => Object.fromEntries(Object.entries(world.journals[groupId]).map(([name, map]) => [name, Object.fromEntries(Object.entries(map).filter(([k]) => inPeriod(k, period)))]));
  patch(orgApi, "getGroupAttendance", (groupId, period) => respond("getGroupAttendance", [groupId, period], () => structuredClone({ ...journalFor(groupId, period), lessonTeachers: {}, substitutionRequests: {} })));
  patch(orgApi, "startGroupAttendance", (groupId, body) => respond("startGroupAttendance", [groupId, body], () => {
    const j = world.journals[groupId];
    const k = `${body.lessonDate}_${body.lessonId}`;
    j.statuses[k] = "in_progress"; j.versions[k] = 1; j.rosterStudentIds[k] = world.rosters[groupId].map((s) => s.id);
    return { ok: true, started: true, version: 1 };
  }));
  patch(orgApi, "saveGroupAttendance", (groupId, body) => respond("saveGroupAttendance", [groupId, body], () => {
    const j = world.journals[groupId];
    const k = `${body.lessonDate}_${body.lessonId}`;
    j.records[k] = body.records; j.statuses[k] = body.status || j.statuses[k]; j.versions[k] = (j.versions[k] || 0) + 1;
    return { ok: true, saved: true, version: j.versions[k] };
  }));
  patch(orgApi, "reconcileMissedGroupAttendance", (groupId, body) => respond("reconcileMissedGroupAttendance", [groupId, body], () => {
    const j = world.journals[groupId];
    const k = `${body.lessonDate}_${body.lessonId}`;
    j.statuses[k] = "in_progress"; j.versions[k] = 1; j.rosterStudentIds[k] = world.rosters[groupId].map((s) => s.id);
    world.openActions = world.openActions.map((a) => (a.groupId === groupId && a.lessonId === body.lessonId && a.lessonDate === body.lessonDate ? { ...a, actionType: "in_progress" } : a));
    return { ok: true, reconciled: true, version: 1 };
  }));
  patch(orgApi, "cancelMissedGroupAttendance", (groupId, body) => respond("cancelMissedGroupAttendance", [groupId, body], () => {
    const j = world.journals[groupId];
    const k = `${body.lessonDate}_${body.lessonId}`;
    j.statuses[k] = "cancelled"; j.cancellationReasons[k] = body.cancellationReason; j.versions[k] = (j.versions[k] || 0) + 1;
    world.openActions = world.openActions.filter((a) => !(a.groupId === groupId && a.lessonId === body.lessonId && a.lessonDate === body.lessonDate));
    return { ok: true, cancelled: true, version: j.versions[k] };
  }));
  patch(examsApi, "getLiveDashboardSummary", () => respond("getLiveDashboardSummary", [], () => []));
  patch(examsApi, "getLessonBinding", (ref) => respond("getLessonBinding", [ref], () => ({ attached: false, can_cancel: world.bindingCanCancel, exam: null, message: null })));
  world.restore = () => { for (const [target, name, original] of patched.reverse()) target[name] = original; };
  return world;
}

function mountScreen(pagePath, world, options = {}) {
  harness.mock("@/lib/store", { useAuthStore: Object.assign(() => ({ user: world.user }), { getState: () => ({ user: world.user }), subscribe: () => () => undefined }) });
  const Page = require(path.join(harness.root, pagePath)).default;
  return harness.screen(Page, {}, { opaque: ["TeacherLessonControls", "LessonActionsMenu", "AttendanceConflictDialog", "LiveExamConfirmDialog", "LessonCancelPanel", "RequestDialog", "LessonChips", "EditWeeklyLessonDialog", "EndWeeklyLessonDialog", "LessonSlotFields", "LessonScopeFields", "OneOffPurposeFields", "Select", "FloatingPanel", ...(options.opaque || [])] });
}

module.exports = { RECURRING_PAST, NOW, TODAY, PAST_DAY, FUTURE_DAY, STUDENTS, LESSONS, createWorld, mountScreen, harness };
