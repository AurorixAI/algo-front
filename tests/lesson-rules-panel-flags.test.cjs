// LESSON-RULES: the panel of a lesson of the SCHEDULE of a teacher on the real answers of the server (schedule_teacher, schedule_teacher_month_closed): the three flags of every lesson
// (`canActSelf`, `monthClosed`, `windowDays`) decide what the panel offers - a closed month and a lesson older than the window offer nothing of the teacher's, one line says why in the server's words.
const assert = require("node:assert/strict");
const test = require("node:test");
const { createWorld, harness } = require("./helpers/teacher-world.cjs");
const { answer } = require("./helpers/lesson-rules-answers.cjs");

const root = harness.root;
const path = require("node:path");
const NOW = "2026-11-26T12:00:00+05:00";
const TODAY = "2026-11-26";

async function inPanel(occurrence, scenario, user = null) {
  harness.setNow(NOW);
  const world = createWorld({ extra: [occurrence] });
  if (user) world.user = { ...world.user, ...user };
  try {
    const { useTeacherLessonPanel, lessonFromAttendanceAction } = require(path.join(root, "src/lib/use-teacher-lesson-panel.ts"));
    let latest = null;
    const host = () => ({
      businessDate: TODAY, groups: world.groups, user: world.user, todayLessons: [], statusOfToday: () => "scheduled", hasSavedMarks: () => false,
      openActions: [], setOpenActions: () => undefined, lessonFromAction: lessonFromAttendanceAction,
      onWritten: () => undefined, notifyRefusal: () => undefined, onMissedCancelled: () => undefined,
    });
    const Probe = () => { latest = useTeacherLessonPanel(host()); return null; };
    const screen = harness.screen(Probe, {}, {});
    await scenario({ get panel() { return latest; }, async open(lesson) { await screen.call(() => latest.openLesson(lesson)); await screen.settle(); } }, world);
  } finally { world.restore(); harness.setNow(null); }
}
const MONTH_CLOSED = "Месяц закрыт — обратитесь к владельцу";
const WINDOW_OVER = "Урок старше 7 дн. — его закрывает администратор или владелец.";

test("a lesson of a CLOSED month (the real schedule of October, monthClosed true on every lesson): the teacher's panel offers nothing - the banner of the lock and the one line «Месяц закрыт — обратитесь к владельцу»", async () => {
  const october = answer("schedule_teacher_month_closed");
  assert.ok(october.length > 0 && october.every((o) => o.monthClosed === true && o.canActSelf === false), "the real answer: every lesson of the closed month");
  const occurrence = october.find((o) => o.occurrenceDate === "2026-10-05");
  await inPanel(occurrence, async (api) => {
    await api.open(occurrence);
    assert.equal(api.panel.lessonTooOld, true);
    assert.equal(api.panel.banner, "tooOld");
    assert.equal(api.panel.lessonTooOldLine, MONTH_CLOSED);
    assert.equal(api.panel.activeMissedAction, null, "no «Разобрать»");
    assert.deepEqual(api.panel.lessonMenuItems.map((item) => item.key).filter((key) => key === "cancel" || key === "finish"), [], "no «Урока не было», no «Завершить»");
  });
});

test("the schedule of November (the real answer): a lesson of the last 7 days is the teacher's, an older one is closed with the window's own sentence; the owner is bound by none of it", async () => {
  const november = answer("schedule_teacher");
  const old = november.find((o) => o.canActSelf === false && o.monthClosed === false);
  const fresh = november.find((o) => o.canActSelf === true && o.occurrenceDate < TODAY);
  assert.ok(old && fresh, "the real answer has both");
  await inPanel(old, async (api) => {
    await api.open(old);
    assert.equal(api.panel.lessonTooOld, true);
    assert.equal(api.panel.lessonTooOldLine, WINDOW_OVER);
  });
  await inPanel(fresh, async (api) => {
    await api.open(fresh);
    assert.equal(api.panel.lessonTooOld, false, "inside the window the teacher acts");
  });
  const closed = answer("schedule_teacher_month_closed")[0];
  await inPanel(closed, async (api) => {
    await api.open(closed);
    assert.equal(api.panel.lessonTooOld, false, "the owner is not bound by the flags of the teacher's window");
  }, { role: "owner", org_role: "owner" });
});
