// WE-E, R3 round (1): the DATE is the main guard of the journal, and the lesson of a write is the lesson of the panel.
// A weekly lesson has ONE id on every date; the in-memory server filters the journal by the period asked. Scenarios, on both screens:
//  - a write for the lesson of LAST WEEK (same id as today's lesson) goes out with ITS date and version and does not touch today's card;
//  - the panel of a past lesson reads the journal of ITS date;
//  - the success of a write of lesson A that comes after lesson B was opened does not touch B.
// MUTATIONS (the text of one file is changed, the same scenario must fail): `isToday = true` on each page, the journal read for today, `here = true`.
const assert = require("node:assert/strict");
const test = require("node:test");
const { NOW, TODAY, PAST_DAY, LESSONS, RECURRING_PAST, createWorld, mountScreen, harness } = require("./helpers/teacher-world.cjs");

const PATHS = { dashboard: "src/app/teacher/dashboard/page.tsx", schedule: "src/app/teacher/schedule/page.tsx" };
const marksButton = (s, student, title) => s.all((n) => n.tag === "button" && typeof n.props.title === "string" && n.props.title.startsWith(`Отметить «${title}»`))[student];

/** The cards named like `re`, in the order of the page, without the lists that hold them. */
const cardsOf = (s, re) => {
  const hits = s.all((n) => typeof n.props.onClick === "function" && re.test(harness.flat(harness.textOf(n))));
  return hits.filter((n) => !hits.some((other) => other !== n && harness.findAll(n, (x) => x === other).length > 0));
};

const scenarioWrite = async ({ screen, world }) => {
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
  assert.match(s.text(), /Урок начат/, "the panel shows the journal of ITS date (Monday: started)");
  await s.click(/Заполнить посещаемость/);
  await s.click(marksButton(s, 0, "Был на уроке"));
  await s.click(marksButton(s, 1, "Не был"));
  await s.click(/Сохранить отметки/);
  const saves = world.called("saveGroupAttendance");
  assert.equal(saves.length, 1);
  assert.equal(saves[0].args[1].lessonDate, PAST_DAY, "the write names the date of the lesson of the panel");
  assert.equal(saves[0].args[1].expectedVersion, 4, "and the version of THAT record");
  await s.press("Escape");
  if (screen === "schedule") await s.click(s.buttons(/^Сегодня/)[0]);
  // today's lesson (same id) was not started: its card still offers the start
  assert.doesNotMatch(s.text(), /Идёт урок|Идёт сейчас/, "the write of last week does not turn today's card into «Идёт урок»");
  assert.match(s.text(), /Начать урок/);
};

for (const screen of ["dashboard", "schedule"]) {
  test(`[DT1] ${screen}: a write for last week's lesson (same id as today's) goes with ITS date and does not touch today's card`, async () => {
    harness.setNow(NOW);
    const world = createWorld({ recurring: true });
    try { await scenarioWrite({ screen, world }); } finally { world.restore(); harness.setNow(null); }
  });
}

for (const screen of ["dashboard", "schedule"]) {
  test(`[DT2] ${screen}: the panel of a past lesson reads the journal of the date of that lesson`, async () => {
    harness.setNow(NOW);
    const world = createWorld({ recurring: true });
    try {
      await scenarioWrite({ screen, world });
      const reads = world.called("getGroupAttendance").filter((c) => c.args[1] && c.args[1].dateFrom === PAST_DAY && c.args[1].dateTo === PAST_DAY);
      assert.ok(reads.length >= 1, "a read of the journal for exactly the day of the lesson");
    } finally { world.restore(); harness.setNow(null); }
  });
}

/** Lesson A is saved while B is open: the success of A does not apply to the panel of B. */
const scenarioSuccessAfterSwitch = async ({ screen, world }) => {
  world.setLessonState(LESSONS.live, { status: "in_progress", version: 1, roster: ["s1", "s2"] });
  const s = mountScreen(PATHS[screen], world);
  await s.settle();
  await s.click(s.clickable(/Живая/));
  await s.click(/Заполнить посещаемость/);
  await s.click(marksButton(s, 0, "Был на уроке"));
  const gate = harness.deferred();
  world.hold.saveGroupAttendance = gate;
  const pending = s.click(/Сохранить отметки/);
  await s.settle(2);
  await s.press("Escape");                                         // A is closed while its save is on the way
  await s.click(s.clickable(/Скоро/));                             // B: not started, later today
  assert.match(s.text(), /Урок ещё не начался/);
  gate.resolve();
  await pending;
  await s.settle();
  assert.match(s.text(), /Урок ещё не начался/, "the success of A does not turn the panel of B into «Идёт урок»");
  assert.doesNotMatch(s.text(), /Посещаемость отмечена|Отметка посещаемости|Заполнить посещаемость/);
};
for (const screen of ["dashboard", "schedule"]) {
  test(`[DT3] ${screen}: the success of a write of lesson A after B was opened is not applied to B`, async () => {
    harness.setNow(NOW);
    const world = createWorld();
    try { await scenarioSuccessAfterSwitch({ screen, world }); } finally { world.restore(); harness.setNow(null); }
  });
}

// ── mutations ────────────────────────────────────────────────────────────────────────────────────
const mutated = async (screen, file, mutate, scenario, options) => {
  await harness.withMutation(file, mutate, async () => {
    harness.setNow(NOW);
    const world = createWorld(options);
    try { await scenario({ screen, world }); } finally { world.restore(); harness.setNow(null); }
  });
};
for (const screen of ["dashboard", "schedule"]) {
  test(`[DM1] MUTATION ${screen}: «isToday = true» (the cards of today follow a write of ANY date) fails DT1`, async () => {
    await assert.rejects(() => mutated(screen, PATHS[screen], (source) => source.replace("const isToday = event.date === businessDate;", "const isToday = true;"), scenarioWrite, { recurring: true }),
      /today's card|Идёт урок/);
  });
}
test("[DM2] MUTATION: the journal of the panel is read for TODAY, not for the date of the lesson - DT1 fails on both screens", async () => {
  for (const screen of ["dashboard", "schedule"]) {
    await assert.rejects(() => mutated(screen, "src/lib/lesson-panel-data.ts", (source) => source.replace("getJournal: () => opts.getJournal(groupId, date),", "getJournal: () => opts.getJournal(groupId, opts.businessDate),").replace("      getJournal: () => opts.getJournal(groupId, date),", "      getJournal: () => opts.getJournal(groupId, opts.businessDate),"), scenarioWrite, { recurring: true }),
      /Урок начат|journal of ITS date/, screen);
  }
});
test("[DM3] MUTATION: `here = true` after a successful save (the answer of A is applied whatever is open) fails DT3 on both screens", async () => {
  for (const screen of ["dashboard", "schedule"]) {
    await assert.rejects(() => mutated(screen, "src/lib/use-teacher-lesson-panel.ts", (source) => source.replace("const here = planAfterWrite({ target, isOpen: panel.isOpen, outcome: { ok: true } }).applyToPanel;\n      if (here) {\n        marksOps.noteSaved(saved, marks);", "const here = true;\n      if (here) {\n        marksOps.noteSaved(saved, marks);"), scenarioSuccessAfterSwitch),
      /does not turn the panel of B|Урок ещё не начался/, screen);
  }
});
