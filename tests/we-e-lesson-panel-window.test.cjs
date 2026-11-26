// WE-E, R3 round (2, 3): on the SCHEDULE of the previous week
//  - the window is the rule of the CENTRE and the SERVER says it (LESSON-RULES: `requiresAdmin` / `windowDays` of the task): a lesson inside it offers «Разобрать пропущенный урок» and «Урока не было», a lesson the server closes to the teacher nothing - ONE line with the number of the server;
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
    world.openActions = [{ ...world.openAction(SEVEN), windowDays: 7 }];
    const s = await openPrevWeek(world, "Семь дней");
    assert.ok(s.hasButton(/Разобрать пропущенный урок/));
    assert.equal(menuKeys(s).includes("cancel"), false, "with a task the dialog offers both outcomes: one road (REL-N2)");
    assert.doesNotMatch(s.text(), /Урок старше/);
  });
});

test("[WN2] a lesson the server closes to the teacher: no action of his, ONE line «Урок старше 7 дн. — его закрывает администратор или владелец» (once; the number is the windowDays of the task)", async () => {
  await run({ extra: [EIGHT] }, async (world) => {
    world.openActions = [{ ...world.openAction(EIGHT), requiresAdmin: true, windowDays: 7 }];
    const s = await openPrevWeek(world, "Восемь дней");
    assert.equal(s.hasButton(/Разобрать пропущенный урок/), false);
    assert.equal(menuKeys(s).includes("cancel"), false);
    assert.equal(s.text().split("Урок старше 7 дн. — его закрывает администратор или владелец").length - 1, 1, "the fact is said once (LESSONS 87)");
    assert.doesNotMatch(s.text(), /Начать его нельзя|отмените его с причиной/);
  });
});

test("[WN3] the same lesson with a different window of the centre: the line says THAT number (3 days), nothing else changes - no copy of 7 on the screen", async () => {
  await run({ extra: [EIGHT] }, async (world) => {
    world.openActions = [{ ...world.openAction(EIGHT), requiresAdmin: true, windowDays: 3 }];
    const s = await openPrevWeek(world, "Восемь дней");
    assert.match(s.text(), /Урок старше 3 дн\. — его закрывает администратор или владелец/);
    assert.doesNotMatch(s.text(), /старше 7/);
    assert.equal(menuKeys(s).includes("cancel"), false);
  });
});

test("[WN3b] 8 days back and NO task in the list: the date does not decide - the screen offers the road of a lesson without a task and the SERVER judges (LESSON_TOO_OLD in its own words)", async () => {
  await run({ extra: [EIGHT] }, async (world) => {
    world.openActions = [];
    const s = await openPrevWeek(world, "Восемь дней");
    assert.doesNotMatch(s.text(), /Урок старше/);
    assert.ok(s.hasButton(/^Урока не было$/));
  });
});

test("[WN4] a started lesson of 8 days back: nothing to mark", async () => {
  await run({ extra: [EIGHT] }, async (world) => {
    world.setLessonState(EIGHT, { status: "in_progress", version: 2, roster: ["s1", "s2"] });
    world.openActions = [{ ...world.openAction(EIGHT, "in_progress"), requiresAdmin: true, windowDays: 7 }];
    const s = await openPrevWeek(world, "Восемь дней");
    assert.match(s.text(), /Урок старше 7 дн\./);
    assert.equal(s.hasButton(/Заполнить посещаемость|Изменить отметки/), false);
  });
});

test("[WN5] MUTATION: without the flag of the server the line is gone - WN2 fails", async () => {
  await assert.rejects(() => harness.withMutation("src/lib/use-teacher-lesson-panel.ts", (source) => source.replace("isLockedByServer(windowAction)", "false"), () => run({ extra: [EIGHT] }, async (world) => {
    world.openActions = [{ ...world.openAction(EIGHT), requiresAdmin: true, windowDays: 7 }];
    const s = await openPrevWeek(world, "Восемь дней");
    assert.match(s.text(), /Урок старше 7 дн\./);
  })), /Урок старше 7 дн/);
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
