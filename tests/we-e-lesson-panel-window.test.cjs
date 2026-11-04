// WE-E, R3 round (2, 3): on the SCHEDULE of the previous week
//  - the window of 7 days is by the DATE of the lesson: 7 days back the teacher is offered «Разобрать пропущенный урок» and «Урока не было», 8 days back nothing - ONE line;
//  - the list of the server's tasks that could not be read is not «there is no task»: the panel says «Не удалось проверить, нужно ли оформить урок» and offers «Повторить».
const assert = require("node:assert/strict");
const test = require("node:test");
const { NOW, LESSONS, lesson, createWorld, mountScreen, harness } = require("./helpers/teacher-world.cjs");

const SEVEN = lesson("L7", "G-L7", "Семь дней", "2026-10-28", "10:00", "11:00");
const EIGHT = lesson("L8", "G-L8", "Восемь дней", "2026-10-27", "10:00", "11:00");
const menuKeys = (s) => s.opaque("LessonActionsMenu").flatMap((m) => m.props.groups.flatMap((g) => g.items.map((i) => i.key)));

async function run(options, scenario) {
  harness.setNow(NOW);
  const world = createWorld(options);
  try { await scenario(world); } finally { world.restore(); harness.setNow(null); }
}
async function openPrevWeek(world, name) {
  const s = mountScreen("src/app/teacher/schedule/page.tsx", world);
  await s.settle();
  await s.click(/На неделю/);
  await s.click(s.all((n) => n.tag === "button" && n.props.title === "Предыдущая неделя")[0]);
  await s.settle();
  await s.click(s.clickable(new RegExp(name)));
  return s;
}

test("[WN1] 7 days back: «Разобрать пропущенный урок» is offered (the dialog holds «Урока не было»)", async () => {
  await run({ extra: [SEVEN] }, async (world) => {
    world.openActions = [world.openAction(SEVEN)];
    const s = await openPrevWeek(world, "Семь дней");
    assert.ok(s.hasButton(/Разобрать пропущенный урок/));
    assert.equal(menuKeys(s).includes("cancel"), false, "with a task the dialog offers both outcomes: one road (REL-N2)");
    assert.doesNotMatch(s.text(), /старше 7 дней/);
  });
});

test("[WN2] 8 days back: no action of the teacher, ONE line «Урок старше 7 дней — его закрывает администратор или владелец» (once), even when the server lists the task", async () => {
  await run({ extra: [EIGHT] }, async (world) => {
    world.openActions = [{ ...world.openAction(EIGHT), requiresAdmin: true }];
    const s = await openPrevWeek(world, "Восемь дней");
    assert.equal(s.hasButton(/Разобрать пропущенный урок/), false);
    assert.equal(menuKeys(s).includes("cancel"), false);
    assert.equal(s.text().split("Урок старше 7 дней — его закрывает администратор или владелец").length - 1, 1, "the fact is said once (LESSONS 87)");
    assert.doesNotMatch(s.text(), /Начать его нельзя|отмените его с причиной/);
  });
});

test("[WN3] 8 days back, NO task in the list: the same - the date decides, not the list", async () => {
  await run({ extra: [EIGHT] }, async (world) => {
    world.openActions = [];
    const s = await openPrevWeek(world, "Восемь дней");
    assert.match(s.text(), /Урок старше 7 дней/);
    assert.equal(menuKeys(s).includes("cancel"), false);
  });
});

test("[WN4] a started lesson of 8 days back: nothing to mark", async () => {
  await run({ extra: [EIGHT] }, async (world) => {
    world.setLessonState(EIGHT, { status: "in_progress", version: 2, roster: ["s1", "s2"] });
    const s = await openPrevWeek(world, "Восемь дней");
    assert.match(s.text(), /Урок старше 7 дней/);
    assert.equal(s.hasButton(/Заполнить посещаемость|Изменить отметки/), false);
  });
});

test("[WN5] MUTATION: the window only for a listed task - WN3 fails", async () => {
  await assert.rejects(() => harness.withMutation("src/lib/use-teacher-lesson-panel.ts", (source) => source.replace("isLessonTooOld(activeLessonDate, businessDate)", "false"), () => run({ extra: [EIGHT] }, async (world) => {
    const s = await openPrevWeek(world, "Восемь дней");
    assert.match(s.text(), /Урок старше 7 дней/);
  })), /Урок старше 7 дней/);
});

// ── the list of tasks could not be read ──────────────────────────────────────────────────────────
async function openPast(world) {
  const s = mountScreen("src/app/teacher/schedule/page.tsx", world);
  await s.settle();
  await s.click(/На неделю/);
  await s.click(s.clickable(/Вчерашняя/));
  return s;
}
test("[WU1] the list of tasks is empty (read fine): «Начать его нельзя…» and «Урока не было», no «Повторить»", async () => {
  await run({}, async (world) => {
    world.openActions = [];
    const s = await openPast(world);
    assert.match(s.text(), /Начать его нельзя: урок запускается только в день проведения/);
    assert.ok(s.hasButton(/^Урока не было$/), "the way out is the cancellation");
    assert.equal(s.hasButton(/Повторить/), false);
    assert.doesNotMatch(s.text(), /Не удалось проверить/);
  });
});

test("[WU2] the list could NOT be read: «Не удалось проверить, нужно ли оформить урок» and «Повторить»; no silent «только отмените»; after the retry the task is offered", async () => {
  await run({}, async (world) => {
    world.failNext.getOpenAttendanceActions = new Error("503");
    const s = await openPast(world);
    assert.match(s.text(), /Не удалось проверить, нужно ли оформить урок/);
    assert.equal(s.hasButton(/^Урока не было$/), false, "no silent «только отмените»");
    assert.equal(s.hasButton(/Разобрать пропущенный урок/), false);
    world.openActions = [world.openAction(LESSONS.past)];
    await s.click(/Повторить/);
    assert.ok(s.hasButton(/Разобрать пропущенный урок/));
    assert.doesNotMatch(s.text(), /Не удалось проверить/);
    assert.equal(s.hasButton(/Повторить/), false);
  });
});

test("[WU3] the retry fails again: the line stays", async () => {
  await run({}, async (world) => {
    world.failNext.getOpenAttendanceActions = new Error("503");
    const s = await openPast(world);
    world.failNext.getOpenAttendanceActions = new Error("503");
    await s.click(/Повторить/);
    assert.match(s.text(), /Не удалось проверить, нужно ли оформить урок/);
    assert.ok(s.hasButton(/Повторить/));
  });
});
