// WE-E (E1, decision 3 of the owner's lead): the BEHAVIOUR of the lesson panel of the teacher on BOTH screens - the dashboard and the schedule.
// The screens are the real pages run by a small renderer (tests/helpers/page-harness.cjs) against an in-memory server (tests/helpers/teacher-world.cjs);
// every scenario is run for each screen and states ONE expectation: where the two copies differed, the expectation is the TARGET (decision 3):
//   - from the schedule: the topic, «Перенесён», the menu group «Постоянное расписание»;
//   - from the dashboard: «Разобрать пропущенный урок» for a past lesson that was never started, the date check at the start, «следующий начатый урок»;
//   - the same banner of a future lesson, the same date format, place and footer.
// (Commit 96096d0 had the 13 scenarios where the old copies differ marked `todo`; after the merge they are strict.)
const assert = require("node:assert/strict");
const test = require("node:test");
const { NOW, TODAY, PAST_DAY, FUTURE_DAY, LESSONS, createWorld, mountScreen, harness } = require("./helpers/teacher-world.cjs");

const SCREENS = {
  dashboard: { path: "src/app/teacher/dashboard/page.tsx" },
  schedule: { path: "src/app/teacher/schedule/page.tsx" },
};

/** t("dashboard|schedule", "A1 name", fn) */
function scenario(id, name, fn, { only = null } = {}) {
  for (const screen of Object.keys(SCREENS)) {
    if (only && !only.includes(screen)) continue;
    test(`[${id}] ${screen}: ${name}`, async () => {
      harness.setNow(NOW);
      const world = createWorld();
      try { await fn({ screen, world }); } finally { world.restore(); harness.setNow(null); }
    });
  }
}

const startScreen = async (screen, world) => {
  const s = mountScreen(SCREENS[screen].path, world);
  await s.settle();
  return s;
};
const GROUP_OF = { live: "Живая", upcoming: "Скоро", over: "Прошла", past: "Вчерашняя", future: "Будущая" };
/** Open the panel of a lesson the way the teacher does: the card of today's list; a lesson of another day - the week of the schedule. */
async function openPanel(screen, s, which) {
  if (which === "past" || which === "future") {
    assert.equal(screen, "schedule", "a lesson of another day has a card on the schedule only");
    await s.click(/На неделю/);
  }
  await s.click(s.clickable(new RegExp(GROUP_OF[which])));
  return s;
}
/** Where the teacher can start «Урока не было» now: the rows of the «⋯» menu and the buttons of the state card - ONE of them at a time. */
const cancelEntries = (s) => ({ menu: menuItems(s).filter((i) => i.key === "cancel").length, card: s.buttons(/^Урока не было$/).length });
const marksButton = (s, student, title) => s.all((n) => n.tag === "button" && typeof n.props.title === "string" && n.props.title.startsWith(`Отметить «${title}»`))[student];
const menuItems = (s) => s.opaque("LessonActionsMenu").flatMap((m) => m.props.groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))));
const inProgress = (world, l, records) => world.setLessonState(l, { status: "in_progress", version: 1, roster: ["s1", "s2"], ...(records ? { records } : {}) });
const REASON = "Заболел преподаватель";

// ── A. the header of the panel ──────────────────────────────────────────────────────────────────
scenario("A1", "the date of the header is long, without a technical format", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  assert.match(s.text(), /среда, 4 ноября · 12:00 — 13:30/);
  assert.doesNotMatch(s.text(), /04\.11\.2026 ·/);
});

scenario("A2", "the topic of the lesson is shown", async ({ screen, world }) => {
  world.lessons.find((l) => l.id === "L-live").topic = "Дроби и проценты";
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  assert.match(s.text(), /Тема урока/);
  assert.match(s.text(), /Тема урока\s*Дроби и проценты/);
});

scenario("A3", "a moved lesson says «Перенесён: было → стало»", async ({ screen, world }) => {
  Object.assign(world.lessons.find((l) => l.id === "L-live"), { isRescheduled: true, originalStartTime: "11:00", originalEndTime: "12:30" });
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  assert.match(s.text(), /Перенесён: 11:00.{1,3}12:30 → 12:00.{1,3}13:30/);
});

scenario("A4", "the place: the room, or «Кабинет не указан», or the online class", async ({ screen, world }) => {
  const live = world.lessons.find((l) => l.id === "L-live");
  let s = await openPanel(screen, await startScreen(screen, world), "live");
  assert.match(s.text(), /Каб\. 3|каб\. 3/);
  world.restore();
  const world2 = createWorld();
  world2.lessons.find((l) => l.id === "L-live").room = null;
  try {
    s = await openPanel(screen, await startScreen(screen, world2), "live");
    assert.match(s.text(), /Кабинет не указан/);
  } finally { world2.restore(); }
  const world3 = createWorld();
  world3.lessons.find((l) => l.id === "L-live").format = "online";
  try {
    s = await openPanel(screen, await startScreen(screen, world3), "live");
    assert.match(s.text(), /Zoom класс/);
  } finally { world3.restore(); }
  void live;
});

scenario("A5", "the class is shown only when the lesson has one", async ({ screen, world }) => {
  world.lessons.find((l) => l.id === "L-live").classLevel = 0;
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  const panelText = s.text().slice(s.text().indexOf("среда, 4 ноября · 12:00") >= 0 ? s.text().indexOf("среда, 4 ноября · 12:00") : s.text().indexOf("04.11.2026"));
  assert.doesNotMatch(panelText, /0 класс/);
});

// ── B. the status banner by lesson state ─────────────────────────────────────────────────────────
scenario("B1", "today, in time, not started: the roster and «Начать урок»", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  assert.match(s.text(), /Состав группы \(2 ученика\)/);
  assert.ok(s.hasButton(/^Начать урок$/));
});

scenario("B2", "today, before the start: «Урок ещё не начался», «Начало через …», no start and no disabled button (the time is in the header)", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "upcoming");
  assert.match(s.text(), /Урок ещё не начался/);
  assert.match(s.text(), /Начало через/);
  assert.equal(s.hasButton(/Доступно/), false);
  assert.equal(s.hasButton(/^Начать урок/), false);
});

scenario("B3", "today, the end passed, never started: «Урок не был начат», «Начать урок» and «Урока не было»", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "over");
  assert.match(s.text(), /Урок не был начат/);
  assert.match(s.text(), /Начните урок, чтобы отметить посещаемость\./);
  assert.match(s.text(), /Время начала запишется в момент нажатия\./);
  assert.ok(s.hasButton(/^Начать урок$/));
  assert.ok(s.hasButton(/^Урока не было$/));
});

scenario("B4", "a started lesson without marks: «Урок начат» and «Заполнить посещаемость»", async ({ screen, world }) => {
  inProgress(world, LESSONS.live);
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  assert.match(s.text(), /Урок начат/);
  assert.ok(s.hasButton(/Заполнить посещаемость/));
});

scenario("B5", "marks saved: «Идёт урок · Посещаемость отмечена» and «Изменить отметки»", async ({ screen, world }) => {
  inProgress(world, LESSONS.live, { s1: "present", s2: "absent" });
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  assert.match(s.text(), /Идёт урок · Посещаемость отмечена/);
  assert.ok(s.hasButton(/Изменить отметки/));
});

scenario("B6", "a finished lesson: «Урок завершён», the marks are not editable by the teacher", async ({ screen, world }) => {
  world.setLessonState(LESSONS.over, { status: "completed", version: 3, roster: ["s1", "s2"], records: { s1: "present", s2: "present" } });
  const s = await openPanel(screen, await startScreen(screen, world), "over");
  assert.match(s.text(), /Урок завершён/);
  assert.match(s.text(), /Исправить их может только администратор — с причиной/);
  assert.equal(s.hasButton(/^Начать урок$/), false);
});

scenario("B7", "a cancelled lesson: «Урок отменён» and the reason", async ({ screen, world }) => {
  world.setLessonState(LESSONS.over, { status: "cancelled", version: 2, cancellationReason: "Болезнь учителя" });
  const s = await openPanel(screen, await startScreen(screen, world), "over");
  assert.match(s.text(), /Урок отменён/);
  assert.match(s.text(), /Причина: Болезнь учителя/);
});

scenario("B8", "a later lesson of the teacher was already started: «Урок больше нельзя начать», no start", async ({ screen, world }) => {
  inProgress(world, LESSONS.live);
  const s = await openPanel(screen, await startScreen(screen, world), "over");
  assert.match(s.text(), /Урок больше нельзя начать/);
  assert.match(s.text(), /Уже начат следующий урок «Живая»/);
  assert.equal(s.hasButton(/^Начать урок$/), false);
});

scenario("B9", "a lesson of a future day: «Урок ещё не наступил», no start", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "future");
  assert.match(s.text(), /Урок ещё не наступил/);
  assert.match(s.text(), /Начать урок можно только в день проведения/);
  assert.equal(s.hasButton(/^Начать урок$/), false);
  assert.equal(s.hasButton(/Доступно/), false);
}, { only: ["schedule"] });

scenario("B10", "a past lesson never started: «Урок не был начат» and «Разобрать пропущенный урок» (the server has it as a task)", async ({ screen, world }) => {
  world.openActions = [world.openAction(LESSONS.past)];
  const s = await openPanel(screen, await startScreen(screen, world), "past");
  assert.match(s.text(), /Урок не был начат/);
  assert.match(s.text(), /Начать его нельзя: урок запускается только в день проведения/);
  assert.ok(s.hasButton(/Разобрать пропущенный урок/));
  assert.equal(s.hasButton(/^Начать урок$/), false);
}, { only: ["schedule"] });

scenario("B11", "a past lesson never started and not in the server's list: no «Разобрать», the way out is the cancellation", async ({ screen, world }) => {
  world.openActions = [];
  const s = await openPanel(screen, await startScreen(screen, world), "past");
  assert.match(s.text(), /Урок не был начат/);
  assert.match(s.text(), /Начать его нельзя: урок запускается только в день проведения/);
  assert.equal(s.hasButton(/Разобрать пропущенный урок/), false);
  assert.ok(s.hasButton(/^Урока не было$/), "the way out is a button, not only the hidden menu");
}, { only: ["schedule"] });

// ── C. the handlers: start / save / finish / cancel ──────────────────────────────────────────────
scenario("C1", "start: one request for this lesson and this date, then the marking list opens", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  await s.click(/^Начать урок$/);
  const calls = world.called("startGroupAttendance");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args[0], "G-live");
  assert.equal(calls[0].args[1].lessonId, "L-live");
  assert.equal(calls[0].args[1].lessonDate, TODAY);
  assert.match(s.text(), /Отметка посещаемости \(0 из 2\)/);
});

scenario("C2", "start refused by the server: the text stays in the panel, the lesson is not marked as started", async ({ screen, world }) => {
  world.failNext.startGroupAttendance = new Error("Нельзя начать: учитель занят");
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  await s.click(/^Начать урок$/);
  assert.match(s.text(), /Нельзя начать: учитель занят|Не удалось начать урок/);
  assert.doesNotMatch(s.text(), /Отметка посещаемости/);
  assert.ok(s.hasButton(/^Начать урок$/));
});

scenario("C3", "a double press of «Начать урок» is ONE request (the handler itself refuses the second call, not only the disabled button)", async ({ screen, world }) => {
  const gate = harness.deferred();
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  world.hold.startGroupAttendance = gate;
  const start = s.button(/^Начать урок$/).props.onClick;
  // two calls in ONE frame: the button cannot be disabled yet - only the guard of the handler is between them and the server
  const first = start();
  const second = start();
  await s.settle(2);
  gate.resolve();
  await Promise.all([first, second]);
  await s.settle();
  assert.equal(world.called("startGroupAttendance").length, 1);
});

scenario("C4", "the marks: marked, saved with the version of the record, the list closes and the lesson shows them saved", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  await s.click(/^Начать урок$/);
  await s.click(marksButton(s, 0, "Был на уроке"));
  await s.click(marksButton(s, 1, "Не был"));
  assert.match(s.text(), /Отметка посещаемости \(2 из 2\)/);
  await s.click(/Сохранить отметки/);
  const saves = world.called("saveGroupAttendance");
  assert.equal(saves.length, 1);
  assert.equal(saves[0].args[1].status, "in_progress");
  assert.deepEqual(saves[0].args[1].records, { s1: "present", s2: "absent" });
  assert.equal(saves[0].args[1].expectedVersion, 1);
  assert.equal(saves[0].args[1].lessonId, "L-live");
  assert.match(s.text(), /Идёт урок · Посещаемость отмечена/);
});

scenario("C5", "the save refused: «Не удалось сохранить посещаемость», the marks stay on screen", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  await s.click(/^Начать урок$/);
  await s.click(marksButton(s, 0, "Был на уроке"));
  world.failNext.saveGroupAttendance = new Error("");
  await s.click(/Сохранить отметки/);
  assert.match(s.text(), /Не удалось сохранить посещаемость/);
  assert.match(s.text(), /Отметка посещаемости \(1 из 2\)/);
});

scenario("C6", "the save with an excused mark and no reason is not sent", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  await s.click(/^Начать урок$/);
  await s.click(marksButton(s, 0, "Уважительная причина"));
  await s.click(/Сохранить отметки/);
  assert.equal(world.called("saveGroupAttendance").length, 0);
  assert.match(s.text(), /причин/i);
});

scenario("C7", "finish: the button comes near the end; not all marked → the count is said and nothing is sent", async ({ screen, world }) => {
  harness.setNow("2026-11-04T13:20:00+05:00");
  inProgress(world, LESSONS.live, { s1: "present" });
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  await s.click(/Завершить урок/);
  assert.match(s.text(), /Невозможно завершить урок: сначала необходимо полностью отметить всех учеников \(1 из 2 отмечено\)/);
  assert.equal(world.called("saveGroupAttendance").length, 0);
});

scenario("C8", "finish: all marked and saved → one request with status completed, the panel closes", async ({ screen, world }) => {
  harness.setNow("2026-11-04T13:20:00+05:00");
  inProgress(world, LESSONS.live, { s1: "present", s2: "late" });
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  await s.click(/Завершить урок/);
  const saves = world.called("saveGroupAttendance");
  assert.equal(saves.length, 1);
  assert.equal(saves[0].args[1].status, "completed");
  assert.deepEqual(saves[0].args[1].records, { s1: "present", s2: "late" });
  assert.equal(saves[0].args[1].expectedVersion, 1);
  assert.doesNotMatch(s.text(), /Урок завершён · |Отметка посещаемости/);
  assert.equal(s.hasButton(/Завершить урок/), false, "the panel is closed");
});

scenario("C9", "finish refused: the panel stays, with the text of the refusal", async ({ screen, world }) => {
  harness.setNow("2026-11-04T13:20:00+05:00");
  inProgress(world, LESSONS.live, { s1: "present", s2: "late" });
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  world.failNext.saveGroupAttendance = new Error("");
  await s.click(/Завершить урок/);
  assert.match(s.text(), /Не удалось завершить урок/);
  assert.ok(s.hasButton(/Завершить урок/));
});

scenario("C10", "«Урока не было» of a lesson that passed: the card offers it, a short reason is refused, a good one goes to the server", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "over");
  assert.deepEqual(cancelEntries(s), { menu: 0, card: 1 }, "«Урока не было» is on the card of the lesson");
  await s.click(/^Урока не было$/);
  await s.settle();
  const panel = () => s.opaque("LessonCancelPanel")[0].props;
  assert.equal(panel().binding.canCancel, true);
  panel().onReason("ab");
  await s.settle();
  await s.call(() => panel().onConfirm());
  assert.equal(world.called("cancelMissedGroupAttendance").length, 0);
  assert.match(s.text(), /не менее 3 символов/);
  panel().onReason(REASON);
  await s.settle();
  await s.call(() => panel().onConfirm());
  const sent = world.called("cancelMissedGroupAttendance");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].args[1].cancellationReason, REASON);
  assert.equal(sent[0].args[1].lessonId, "L-over");
  assert.match(s.text(), /Урок отменён/);
  assert.match(s.text(), new RegExp(REASON));
});

scenario("C11", "«Урока не было» refused by the server: the text is in the panel, the lesson is still not cancelled", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "over");
  await s.click(/^Урока не было$/);
  await s.settle();
  s.opaque("LessonCancelPanel")[0].props.onReason(REASON);
  await s.settle();
  world.failNext.cancelMissedGroupAttendance = new Error("");
  await s.call(() => s.opaque("LessonCancelPanel")[0].props.onConfirm());
  assert.match(s.text(), /Не удалось отметить, что урока не было/);
  assert.doesNotMatch(s.text(), /Урок отменён/);
});

scenario("C12", "cancellation is not offered while the exam service forbids it", async ({ screen, world }) => {
  world.bindingCanCancel = false;
  const s = await openPanel(screen, await startScreen(screen, world), "over");
  await s.click(/^Урока не было$/);
  await s.settle();
  await s.call(() => s.opaque("LessonCancelPanel")[0].props.onConfirm());
  assert.equal(world.called("cancelMissedGroupAttendance").length, 0);
});

scenario("C12a", "E-UX1: an unstarted lesson that passed offers «Начать урок» and «Урока не было» under the text; the menu does not repeat the second (one action - one place)", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "over");
  assert.deepEqual(cancelEntries(s), { menu: 0, card: 1 }, "ONE entry: the card");
  assert.ok(s.hasButton(/^Начать урок$/), "the start");
  assert.equal(s.opaque("LessonCancelPanel").length, 0);
  await s.click(/^Урока не было$/);
  await s.settle();
  assert.equal(s.opaque("LessonCancelPanel").length, 1, "the panel with the reason");
  assert.equal(world.called("cancelMissedGroupAttendance").length, 0, "the click only opens the panel: nothing is sent before the reason");
  s.opaque("LessonCancelPanel")[0].props.onReason(REASON);
  await s.settle();
  await s.call(() => s.opaque("LessonCancelPanel")[0].props.onConfirm());
  const sent = world.called("cancelMissedGroupAttendance");
  assert.equal(sent.length, 1, "the same request as C10");
  assert.equal(sent[0].args[1].lessonId, "L-over");
});

scenario("C12b", "E-UX1: a lesson in time offers no cancellation anywhere (neither the card nor the menu)", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  assert.deepEqual(cancelEntries(s), { menu: 0, card: 0 });
  assert.ok(s.hasButton(/^Начать урок$/));
});

scenario("C12d", "E-UX1 (R3): «Урока не было» is disabled while a start is on its way", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "over");
  assert.equal(s.button(/^Урока не было$/).props.disabled, false);
  const gate = harness.deferred();
  world.hold.startGroupAttendance = gate;
  const start = s.button(/^Начать урок$/).props.onClick();
  await s.settle(2);
  assert.equal(s.button(/^Урока не было$/).props.disabled, true, "no cancellation while the start is on its way");
  gate.resolve();
  await start;
  await s.settle();
});

scenario("C12e", "E-UX1 (R3): the lesson of another teacher has neither the card nor «Урока не было»; the substitute himself has both", async ({ screen, world }) => {
  const key = `${TODAY}_L-over`;
  // the viewer (t1) is replaced by t2: the lesson is not his to start, mark or cancel
  world.lessonTeachers = { [key]: { teacherId: "t2", teacherName: "Рахимов Т.", isSubstitution: true, defaultTeacherId: "t1", defaultTeacherName: "Тестов У." } };
  let s = await openPanel(screen, await startScreen(screen, world), "over");
  assert.ok(s.has(/Этот урок ведёт Рахимов Т\./), "the panel found: the lesson is led by another teacher");
  assert.equal(s.hasButton(/^Урока не было$/), false);
  assert.equal(s.hasButton(/^Начать урок$/), false);
  assert.equal(s.has(/Урок не был начат/), false, "no card of the state");
  world.restore();
  // the viewer IS the substitute: the lesson is his
  const world2 = createWorld();
  world2.lessonTeachers = { [key]: { teacherId: "t1", teacherName: "Тестов У.", isSubstitution: true, defaultTeacherId: "t2", defaultTeacherName: "Рахимов Т." } };
  try {
    s = await openPanel(screen, await startScreen(screen, world2), "over");
    assert.ok(s.has(/Урок не был начат/), "the panel found");
    assert.ok(s.hasButton(/^Начать урок$/));
    assert.ok(s.hasButton(/^Урока не было$/));
  } finally { world2.restore(); }
});

scenario("C12f", "E-UX1 (R3): the way out of a past lesson / of a lesson after a later one is the same button «Урока не было» (not for a lesson with a task: «Разобрать»)", async ({ screen, world }) => {
  world.openActions = [];
  let s = await openPanel(screen, await startScreen(screen, world), "past");
  assert.ok(s.has(/Начать его нельзя: урок запускается только в день проведения\./));
  assert.deepEqual(cancelEntries(s), { menu: 0, card: 1 }, "no task: the card, not the menu");
  await s.click(/^Урока не было$/);
  await s.settle();
  assert.equal(s.opaque("LessonCancelPanel").length, 1);
  world.restore();
  const world2 = createWorld();
  world2.openActions = [world2.openAction(LESSONS.past)];
  try {
    s = await openPanel(screen, await startScreen(screen, world2), "past");
    assert.ok(s.hasButton(/Разобрать пропущенный урок/));
    assert.deepEqual(cancelEntries(s), { menu: 1, card: 0 }, "with a task the card has «Разобрать» (the dialog offers both outcomes); «Урока не было» stays in the menu");
    menuItems(s).find((i) => i.key === "cancel").onSelect();
    await s.settle();
    assert.equal(s.opaque("LessonCancelPanel").length, 1, "the menu row opens the panel with the reason");
  } finally { world2.restore(); }
}, { only: ["schedule"] });

scenario("C12g", "E-UX1 (R3): a lesson after which another one was started has «Урока не было» under the text", async ({ screen, world }) => {
  inProgress(world, LESSONS.live);
  const s = await openPanel(screen, await startScreen(screen, world), "over");
  assert.ok(s.has(/Урок больше нельзя начать/), "the card found");
  assert.ok(s.has(/Отметки за этот урок недоступны — отмените его с причиной/));
  assert.deepEqual(cancelEntries(s), { menu: 0, card: 1 });
});

scenario("C12h", "E-UX1 (R3): the list of the server's tasks unread: «Повторить» and no «Урока не было» (it is not known whether the lesson is to be reconciled)", async ({ screen, world }) => {
  world.failNext.getOpenAttendanceActions = new Error("503");
  const s = await openPanel(screen, await startScreen(screen, world), "past");
  assert.ok(s.has(/Не удалось проверить, нужно ли оформить урок\./));
  assert.ok(s.hasButton(/^Повторить$/));
  assert.equal(s.hasButton(/^Урока не было$/), false);
  assert.equal(cancelEntries(s).menu, 1, "the card has no cancellation, so the row stays in the menu (as before)");
  assert.equal(s.has(/Начать его нельзя/), false, "one line");
}, { only: ["schedule"] });

scenario("C12j", "one action - one place: in every state the cancellation has exactly one entry (the card or the menu, never both); the «⋯» goes when nothing is left", async ({ screen, world }) => {
  // overdue and no task: the card
  let s = await openPanel(screen, await startScreen(screen, world), "over");
  assert.deepEqual(cancelEntries(s), { menu: 0, card: 1 }, "overdue");
  world.restore();
  // an empty roster: the card shows no actions at all (nobody to mark) - the row stays in the menu
  const empty = createWorld();
  empty.rosters["G-over"] = [];
  try {
    s = await openPanel(screen, await startScreen(screen, empty), "over");
    assert.deepEqual(cancelEntries(s), { menu: 1, card: 0 }, "an empty roster: the menu");
  } finally { empty.restore(); }
});

scenario("C12k", "one action - one place, a past day: no task - the card; with a task - the menu (the card says «Разобрать»); the list unread - the menu (the card says «Повторить»)", async ({ screen, world }) => {
  world.openActions = [];
  let s = await openPanel(screen, await startScreen(screen, world), "past");
  assert.deepEqual(cancelEntries(s), { menu: 0, card: 1 }, "no task");
  world.restore();
  const withTask = createWorld();
  withTask.openActions = [withTask.openAction(LESSONS.past)];
  try {
    s = await openPanel(screen, await startScreen(screen, withTask), "past");
    assert.deepEqual(cancelEntries(s), { menu: 1, card: 0 }, "a task");
  } finally { withTask.restore(); }
  const unread = createWorld();
  unread.failNext.getOpenAttendanceActions = new Error("503");
  try {
    s = await openPanel(screen, await startScreen(screen, unread), "past");
    assert.deepEqual(cancelEntries(s), { menu: 1, card: 0 }, "the list unread");
  } finally { unread.restore(); }
}, { only: ["schedule"] });

scenario("C12l", "one action - one place: the «⋯» button is not shown when the card took the only row of the menu", async ({ screen, world }) => {
  // a lesson of today that passed: no move (the hour rule), no «Не смогу провести» (after the start) - the card took the last row
  const s = await openPanel(screen, await startScreen(screen, world), "over");
  assert.ok(s.hasButton(/^Урока не было$/), "the card found");
  assert.deepEqual(menuItems(s).map((i) => i.key), []);
  assert.equal(s.opaque("LessonActionsMenu").length, 0, "an empty menu has no «⋯»");
});

scenario("C12i", "E-A11Y (R3): the window of the lesson takes the focus (tabIndex -1) and the cancellation form takes it at once (autoFocus)", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "over");
  const dialog = s.all((n) => n.tag === "div" && n.props["aria-labelledby"] === "lesson-panel-title")[0];
  assert.ok(dialog, "the window found");
  assert.equal(dialog.props.tabIndex, -1, "a window the focus can be given to");
  await s.click(/^Урока не было$/);
  await s.settle();
  assert.equal(s.opaque("LessonCancelPanel")[0].props.autoFocus, true);
});

scenario("C12c", "E-A11Y: the lesson panel is a dialog named by the group; the id is unique and the nested dialogs are not confused with it", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  // the renderer lists a motion component and the DOM node it renders: the DOM node counts once
  const dialogs = s.all((n) => n.tag === "div" && n.props.role === "dialog" && n.props["aria-labelledby"] === "lesson-panel-title");
  assert.equal(dialogs.length, 1, "exactly one window is named by the title of the lesson panel (a check that found nothing is a failure, LESSONS 94)");
  assert.equal(dialogs[0].props["aria-modal"], "true");
  const titles = s.all((n) => n.tag === "h3" && n.props.id === "lesson-panel-title");
  assert.equal(titles.length, 1, "the id is unique");
  assert.equal(harness.flat(harness.textOf(titles[0])).trim(), "Живая", "the name of the window is the name of the group");
  assert.equal(s.all((n) => n.tag === "button" && n.props["aria-label"] === "Закрыть").length, 1, "the cross of the panel has a name");
  assert.equal(s.all((n) => n.props.id === "missed-lesson-title").length, 0, "the dialog «Пропущенный урок» is closed and has its own id");
});

scenario("C13", "a refusal that arrives after the panel was closed is not silent: «Не сохранено: группа, дата» and the reason", async ({ screen, world }) => {
  const gate = harness.deferred();
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  world.hold.startGroupAttendance = gate;
  world.failNext.startGroupAttendance = new Error("");
  const pending = s.click(s.button(/^Начать урок$/));
  await s.settle(2);
  await s.press("Escape");
  gate.resolve();
  await pending;
  await s.settle();
  assert.match(s.text(), /Не сохранено: Живая, 4 ноября — откройте урок и повторите/);
  // the reason of the refusal comes with it (a toast with details): the same on both screens
  assert.match(s.text(), /Не удалось начать урок/);
});

scenario("C14", "the answer of lesson A that comes after lesson B was opened changes nothing in the panel of B", async ({ screen, world }) => {
  inProgress(world, LESSONS.live, { s1: "present", s2: "present" });
  const s = await startScreen(screen, world);
  const gate = harness.deferred();
  world.hold.getGroupAttendance = gate;
  await s.click(s.clickable(new RegExp(GROUP_OF.live)));            // A: the journal of A is held
  assert.match(s.text(), /Загрузка данных урока/);
  await s.press("Escape");
  await s.click(s.clickable(new RegExp(GROUP_OF.upcoming)));            // B: not started, its own journal
  await s.settle();
  assert.match(s.text(), /Урок ещё не начался/);
  gate.resolve();                                                   // A answers late
  await s.settle();
  assert.match(s.text(), /Урок ещё не начался/, "the late answer of A does not turn B into «Идёт урок»");
  assert.doesNotMatch(s.text(), /Изменить отметки|Идёт урок · Посещаемость/);
});

scenario("C15", "Escape closes the panel; the next open starts clean", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  await s.click(/^Начать урок$/);
  assert.match(s.text(), /Отметка посещаемости/);
  await s.press("Escape");
  assert.doesNotMatch(s.text(), /Отметка посещаемости/);
  await s.click(s.clickable(new RegExp(GROUP_OF.upcoming)));
  assert.match(s.text(), /Урок ещё не начался/);
  assert.doesNotMatch(s.text(), /Отметка посещаемости/);
});

// ── D. a past lesson never started: the reconciliation ───────────────────────────────────────────
async function openMissed(screen, s, world) {
  if (screen === "dashboard") { await s.click(s.all((n) => n.tag === "button" && n.props["aria-label"] === "Открыть список уроков, требующих действия")[0]); await s.click(s.clickable(/Разобрать пропущенный урок/)); }
  else { await openPanel(screen, s, "past"); await s.click(/Разобрать пропущенный урок/); }
}
scenario("D1", "«Разобрать пропущенный урок» → «Оформить проведённый урок»: one reconcile request, the journal of that date opens", async ({ screen, world }) => {
  world.openActions = [world.openAction(LESSONS.past)];
  const s = await startScreen(screen, world);
  await openMissed(screen, s, world);
  assert.match(s.text(), /Пропущенный урок/);
  await s.click(/Оформить проведённый урок/);
  const calls = world.called("reconcileMissedGroupAttendance");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[0], "G-past");
  assert.equal(calls[0].args[1].lessonDate, PAST_DAY);
  assert.equal(calls[0].args[1].lessonId, "L-past");
  assert.match(s.text(), /Урок начат/);
  assert.ok(s.hasButton(/Заполнить посещаемость/));
});

scenario("D2", "«Урока не было» of the reconciliation: a reason of 3+ characters, one cancel request", async ({ screen, world }) => {
  world.openActions = [world.openAction(LESSONS.past)];
  const s = await startScreen(screen, world);
  await openMissed(screen, s, world);
  await s.click(/Урока не было/);
  s.opaque("LessonCancelPanel")[0].props.onReason("");
  await s.settle();
  await s.call(() => s.opaque("LessonCancelPanel")[0].props.onConfirm());
  assert.equal(world.called("cancelMissedGroupAttendance").length, 0);
  s.opaque("LessonCancelPanel")[0].props.onReason(REASON);
  await s.settle();
  await s.call(() => s.opaque("LessonCancelPanel")[0].props.onConfirm());
  const sent = world.called("cancelMissedGroupAttendance");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].args[1].cancellationReason, REASON);
  assert.equal(sent[0].args[1].lessonId, "L-past");
});

scenario("D3", "the reconciliation refused: the text is in the dialog, the lesson stays on the list", async ({ screen, world }) => {
  world.openActions = [world.openAction(LESSONS.past)];
  const s = await startScreen(screen, world);
  await openMissed(screen, s, world);
  world.failNext.reconcileMissedGroupAttendance = new Error("");
  await s.click(/Оформить проведённый урок/);
  assert.match(s.text(), /Не удалось открыть журнал пропущенного урока/);
  assert.ok(s.hasButton(/Оформить проведённый урок/));
});

// ── E. the menu of the lesson and the footer ─────────────────────────────────────────────────────
scenario("E1", "the footer: the link to the group on both screens; the group «Постоянное расписание» only where the series is editable (schedule, week view)", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  assert.match(s.text(), /Перейти в группу/);
  const groups = s.opaque("LessonActionsMenu").flatMap((m) => m.props.groups.map((g) => g.label));
  assert.ok(!groups.includes("Постоянное расписание"), "today's card never edits the series");
});

scenario("E2", "week view of the schedule: «Изменить постоянное расписание» and the menu group «Постоянное расписание» with «Прекратить регулярные занятия»", async ({ screen, world }) => {
  const s = await startScreen(screen, world);
  await s.click(/На неделю/);
  await s.click(s.clickable(/Скоро/));
  assert.ok(s.hasButton(/Изменить.*расписание/));
  const groups = s.opaque("LessonActionsMenu").flatMap((m) => m.props.groups);
  const series = groups.find((g) => g.label === "Постоянное расписание");
  assert.ok(series, "the group exists");
  assert.deepEqual(series.items.map((i) => i.label), ["Прекратить регулярные занятия"]);
}, { only: ["schedule"] });
