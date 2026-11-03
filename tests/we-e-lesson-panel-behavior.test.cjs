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

scenario("B2", "today, before the start: «Урок ещё не начался» and a disabled «Доступно в 15:00»", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "upcoming");
  assert.match(s.text(), /Урок ещё не начался/);
  assert.match(s.text(), /Начало в 15:00 \(через/);
  const gate = s.button(/Доступно в 15:00/);
  assert.equal(gate.props.disabled, true);
  assert.equal(s.hasButton(/^Начать урок/), false);
});

scenario("B3", "today, the end passed, never started: «Урок не был начат» and «Начать урок сейчас»", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "over");
  assert.match(s.text(), /Урок не был начат/);
  assert.match(s.text(), /сначала начните урок/);
  assert.ok(s.hasButton(/Начать урок сейчас/));
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
  assert.match(s.text(), /Для изменения нужен контролируемый административный доступ/);
  assert.equal(s.hasButton(/^Начать урок( сейчас)?$/), false);
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
  assert.match(s.text(), /уже был начат урок «Живая»/);
  assert.equal(s.hasButton(/^Начать урок( сейчас)?$/), false);
});

scenario("B9", "a lesson of a future day: «Урок ещё не наступил», no start", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "future");
  assert.match(s.text(), /Урок ещё не наступил/);
  assert.match(s.text(), /пятница, 6 ноября/);
  assert.equal(s.hasButton(/^Начать урок( сейчас)?$/), false);
  assert.equal(s.hasButton(/Доступно/), false);
}, { only: ["schedule"] });

scenario("B10", "a past lesson never started: «Урок не был начат» and «Разобрать пропущенный урок» (the server has it as a task)", async ({ screen, world }) => {
  world.openActions = [world.openAction(LESSONS.past)];
  const s = await openPanel(screen, await startScreen(screen, world), "past");
  assert.match(s.text(), /Урок не был начат/);
  assert.match(s.text(), /Начать его теперь нельзя/);
  assert.ok(s.hasButton(/Разобрать пропущенный урок/));
  assert.equal(s.hasButton(/^Начать урок( сейчас)?$/), false);
}, { only: ["schedule"] });

scenario("B11", "a past lesson never started and not in the server's list: no «Разобрать», the way out is the cancellation", async ({ screen, world }) => {
  world.openActions = [];
  const s = await openPanel(screen, await startScreen(screen, world), "past");
  assert.match(s.text(), /Урок не был начат/);
  assert.match(s.text(), /отмените его с причиной/);
  assert.equal(s.hasButton(/Разобрать пропущенный урок/), false);
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

scenario("C3", "a double press of «Начать урок» is ONE request", async ({ screen, world }) => {
  const gate = harness.deferred();
  const s = await openPanel(screen, await startScreen(screen, world), "live");
  world.hold.startGroupAttendance = gate;
  const button = s.button(/^Начать урок$/);
  const first = s.click(button);
  await s.settle(2);
  await s.click(s.button(/^Начать урок$/));
  gate.resolve();
  await first;
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

scenario("C10", "«Урока не было» of a lesson that passed: the menu offers it, a short reason is refused, a good one goes to the server", async ({ screen, world }) => {
  const s = await openPanel(screen, await startScreen(screen, world), "over");
  const item = menuItems(s).find((i) => i.key === "cancel");
  assert.ok(item, "«Урока не было» is in the menu of the lesson");
  item.onSelect();
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
  menuItems(s).find((i) => i.key === "cancel").onSelect();
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
  menuItems(s).find((i) => i.key === "cancel").onSelect();
  await s.settle();
  await s.call(() => s.opaque("LessonCancelPanel")[0].props.onConfirm());
  assert.equal(world.called("cancelMissedGroupAttendance").length, 0);
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
