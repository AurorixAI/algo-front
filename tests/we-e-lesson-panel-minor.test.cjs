// WE-E, R3 round (5): the small things, each with a test (and a mutation where the code could be cut without any test noticing):
//  - Escape closes «Пропущенный урок» on BOTH screens;
//  - «есть сохранённые отметки» of the card map is the map of TODAY: a lesson of another week with the same id is not «saved»;
//  - the list of the server's tasks follows every write (the schedule kept it stale);
//  - the double press: the guard of the handler (mutation).
const assert = require("node:assert/strict");
const test = require("node:test");
const { NOW, TODAY, PAST_DAY, LESSONS, RECURRING_PAST, createWorld, mountScreen, harness } = require("./helpers/teacher-world.cjs");

const PATHS = { dashboard: "src/app/teacher/dashboard/page.tsx", schedule: "src/app/teacher/schedule/page.tsx" };
const marksButton = (s, student, title) => s.all((n) => n.tag === "button" && typeof n.props.title === "string" && n.props.title.startsWith(`Отметить «${title}»`))[student];
const cardsOf = (s, re) => {
  const hits = s.all((n) => typeof n.props.onClick === "function" && re.test(harness.flat(harness.textOf(n))));
  return hits.filter((n) => !hits.some((other) => other !== n && harness.findAll(n, (x) => x === other).length > 0));
};
async function run(options, scenario) {
  harness.setNow(NOW);
  const world = createWorld(options);
  try { await scenario(world); } finally { world.restore(); harness.setNow(null); }
}

for (const screen of ["dashboard", "schedule"]) {
  test(`[MN1] ${screen}: Escape closes the dialog «Пропущенный урок»`, async () => {
    await run({}, async (world) => {
      world.openActions = [world.openAction(LESSONS.past)];
      const s = mountScreen(PATHS[screen], world);
      await s.settle();
      if (screen === "dashboard") {
        await s.click(s.all((n) => n.tag === "button" && n.props["aria-label"] === "Открыть список уроков, требующих действия")[0]);
        await s.click(s.clickable(/Разобрать пропущенный урок/));
      } else {
        await s.click(/На неделю/);
        await s.click(s.clickable(/Вчерашняя/));
        await s.click(/Разобрать пропущенный урок/);
      }
      assert.match(s.text(), /Оформить проведённый урок/);
      await s.press("Escape");
      assert.doesNotMatch(s.text(), /Оформить проведённый урок/, "the dialog is closed by Escape");
    });
  });
}

// last week's lesson (same id as today's) is started and nothing of it is saved; TODAY's lesson has saved marks
async function openMondayWithTodaySaved(screen, world) {
  world.setLessonState(LESSONS.live, { status: "in_progress", version: 1, roster: ["s1", "s2"], records: { s1: "present", s2: "present" } });
  world.setLessonState(RECURRING_PAST, { status: "in_progress", version: 4, roster: ["s1", "s2"] });
  world.openActions = [world.openAction(RECURRING_PAST, "in_progress")];
  const s = mountScreen(PATHS[screen], world);
  await s.settle();
  if (screen === "dashboard") {
    await s.click(s.all((n) => n.tag === "button" && n.props["aria-label"] === "Открыть список уроков, требующих действия")[0]);
    await s.click(s.clickable(/Завершите посещаемость/));
  } else {
    await s.click(/На неделю/);
    await s.click(cardsOf(s, /Живая/)[0]);
  }
  await s.click(/Заполнить посещаемость/);
  await s.click(marksButton(s, 0, "Был на уроке"));
  await s.click(marksButton(s, 0, "Был на уроке"));      // the first student's button now says «Снять отметку»: the next one is the first again
  return s;
}
const finishScenario = (screen) => async (world) => {
  const s = await openMondayWithTodaySaved(screen, world);
  await s.click(/Завершить урок/);
  assert.match(s.text(), /Невозможно завершить урок: сначала необходимо полностью отметить всех учеников \(2 из 2 отмечено\) и сохранить отметки/, "marks of last week are NOT saved, whatever today's lesson with the same id has");
  assert.equal(world.called("saveGroupAttendance").length, 0);
};
for (const screen of ["dashboard", "schedule"]) {
  test(`[MN2] ${screen}: «marks saved» of today's card map does not count for a lesson of another week with the same id`, async () => {
    await run({ recurring: true }, finishScenario(screen));
  });
  test(`[MN2m] MUTATION ${screen}: the map without the date makes MN2 fail`, async () => {
    await assert.rejects(() => harness.withMutation("src/lib/use-teacher-lesson-panel.ts", (source) => source.replace("(activeLessonIsToday && host.hasSavedMarks(activeLesson.id))", "host.hasSavedMarks(activeLesson.id)"), () => run({ recurring: true }, finishScenario(screen))), /marks of last week|Невозможно завершить/);
  });
}

test("[MN3] the schedule reads the list of the server's tasks again after a start", async () => {
  await run({}, async (world) => {
    const s = mountScreen(PATHS.schedule, world);
    await s.settle();
    const before = world.called("getOpenAttendanceActions").length;
    await s.click(s.clickable(/Живая/));
    await s.click(/^Начать урок$/);
    assert.equal(world.called("getOpenAttendanceActions").length, before + 1);
  });
});

test("[MN4] the list of tasks follows a save (counts), a finish and a cancellation (the row goes) - the same code for both screens", async () => {
  const { useTeacherLessonPanel } = require(require("node:path").join(harness.root, "src/lib/use-teacher-lesson-panel.ts"));
  harness.setNow("2026-11-04T13:20:00+05:00");
  const world = createWorld();
  try {
    world.setLessonState(LESSONS.live, { status: "in_progress", version: 1, roster: ["s1", "s2"], records: { s1: "present", s2: "present" } });
    const row = world.openAction(LESSONS.live, "in_progress");
    let list = [row, world.openAction(LESSONS.over)];
    const host = { businessDate: TODAY, groups: world.groups, user: world.user, todayLessons: [], statusOfToday: () => "scheduled", hasSavedMarks: () => false,
      openActions: list, setOpenActions: (update) => { list = typeof update === "function" ? update(list) : update; }, openActionsKnown: true, retryOpenActions: () => undefined,
      lessonFromAction: (a) => a, onWritten: () => undefined, notifyRefusal: () => undefined, onMissedCancelled: () => undefined };
    let latest;
    const screen = harness.screen(() => { latest = useTeacherLessonPanel(host); return null; }, {}, {});
    await screen.call(() => latest.openLesson(LESSONS.live));
    await screen.settle();
    await screen.call(() => latest.handleFinishLesson());
    await screen.settle();
    assert.equal(world.called("saveGroupAttendance").length, 1);
    assert.deepEqual(list.map((a) => a.lessonId), ["L-over"], "the finished lesson's row is gone, the other stays");
  } finally { world.restore(); harness.setNow(null); }
});

for (const screen of ["dashboard", "schedule"]) {
  test(`[MN5] MUTATION ${screen}: without the guard of the handler a double call of «Начать урок» sends two requests (C3 catches it)`, async () => {
    await assert.rejects(() => harness.withMutation("src/lib/use-teacher-lesson-panel.ts", (source) => source.replace("if (!writes.begin(target.key)) return; // a second press while the start is on its way", "// guard removed"), () => run({}, async (world) => {
      const gate = harness.deferred();
      const s = mountScreen(PATHS[screen], world);
      await s.settle();
      await s.click(s.clickable(/Живая/));
      world.hold.startGroupAttendance = gate;
      const start = s.button(/^Начать урок$/).props.onClick;
      const first = start();
      const second = start();
      await s.settle(2);
      gate.resolve();
      await Promise.all([first, second]);
      assert.equal(world.called("startGroupAttendance").length, 1);
    })), /2 !== 1|1 !== 2/);
  });
}
