// REL-N2 (owner decision 04.11): the card of a lesson moved away is pressable in the week grid of the schedule and opens the SAME panel as the card of the day list;
// the panel of a moved lesson says «Урок перенесён на <день, дата, время>», the reason of the move and - while the teacher still has the new lesson - «Открыть урок <дата>».
// The screens are the real pages in the renderer (tests/helpers/page-harness.cjs) against the in-memory server (tests/helpers/teacher-world.cjs).
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const { NOW, TODAY, FUTURE_DAY, lesson, createWorld, mountScreen, harness } = require("./helpers/teacher-world.cjs");

const NEXT_WEEK_DAY = "2026-11-11";                  // Wednesday of the NEXT week (today is Wednesday 2026-11-04)
const outcome = (date, start, end, lessonId = "L-mv-new") => ({ kind: "rescheduled", movedTo: { date, startTime: start, endTime: end, lessonId } });
const REASON = "Перенесён на 06.11, 14:00–15:00: Заболел преподаватель";

/** The original (today 10:00, cancelled by the move) and its new lesson; options: where the new one is, whether it exists, who leads it. */
function movedWorld({ to = FUTURE_DAY, newLesson = true, teacher = null, newStatus = null } = {}) {
  const original = lesson("L-mv", "G-mv", "Перенос", TODAY, "10:00", "11:00", { substitutionOutcome: outcome(to, "14:00", "15:00") });
  const extra = [original, ...(newLesson ? [lesson("L-mv-new", "G-mv", "Перенос", to, "14:00", "15:00", { movedFrom: { lessonId: "L-mv", date: TODAY, startTime: "10:00", endTime: "11:00" } })] : [])];
  const world = createWorld({ extra });
  world.setLessonState(original, { status: "cancelled", version: 2, cancellationReason: REASON });
  if (newStatus) world.setLessonState(extra[1], { status: newStatus, version: 2, cancellationReason: "Каникулы" });
  if (teacher) world.lessonTeachers = { [`${to}_L-mv-new`]: teacher };
  return world;
}
const SCREENS = { dashboard: "src/app/teacher/dashboard/page.tsx", schedule: "src/app/teacher/schedule/page.tsx" };
function scenario(id, name, fn, only) {
  for (const screen of Object.keys(SCREENS)) {
    if (only && !only.includes(screen)) continue;
    test(`[${id}] ${screen}: ${name}`, async () => {
      harness.setNow(NOW);
      try { await fn({ screen }); } finally { harness.setNow(null); }
    });
  }
}
const start = async (screen, world) => { const s = mountScreen(SCREENS[screen], world); await s.settle(); return s; };
const openOriginal = async (s) => { await s.click(s.clickable(/Перенос/)); await s.settle(8); };
const withWorld = async (world, fn) => { try { await fn(); } finally { world.restore(); } };

scenario("MV1", "the panel of a lesson moved away: the title with the place, the reason alone, the way to the new lesson (not «Урок отменён»)", async ({ screen }) => {
  const world = movedWorld();
  await withWorld(world, async () => {
    const s = await start(screen, world);
    await openOriginal(s);
    assert.ok(s.has(/Урок перенесён на пт, 06\.11, 14:00/), s.text().slice(0, 300));
    assert.ok(s.has(/Причина: Заболел преподаватель/));
    assert.equal(s.has(/Урок отменён/), false);
    assert.equal(s.has(/Перенесён на 06\.11/), false, "the technical line of the server is not shown");
    assert.ok(s.hasButton(/^Открыть урок 06\.11$/));
  });
});

scenario("MV2", "«Открыть урок 06.11» opens the panel of the new lesson in place of this one", async ({ screen }) => {
  const world = movedWorld();
  await withWorld(world, async () => {
    const s = await start(screen, world);
    await openOriginal(s);
    await s.click(/^Открыть урок 06\.11$/);
    await s.settle(8);
    assert.ok(s.has(/пятница, 6 ноября · 14:00 — 15:00/), s.text().slice(0, 300));
    assert.equal(s.has(/Урок перенесён на/), false, "the panel of the NEW lesson");
    assert.equal(s.hasButton(/^Открыть урок \d\d\.\d\d$/), false);
  });
});

scenario("MV3", "no button where the teacher no longer has the new lesson (given to another teacher / cancelled since / not in the schedule); the text stays", async ({ screen }) => {
  const cases = [
    ["led by another", () => movedWorld({ teacher: { teacherId: "t2", teacherName: "Рахимов Т.", isSubstitution: true, defaultTeacherId: "t1", defaultTeacherName: "Тестов У." } })],
    ["cancelled since", () => movedWorld({ newStatus: "cancelled" })],
    ["not in the schedule", () => movedWorld({ newLesson: false })],
  ];
  for (const [name, make] of cases) {
    const world = make();
    await withWorld(world, async () => {
      const s = await start(screen, world);
      await openOriginal(s);
      assert.ok(s.has(/Урок перенесён на пт, 06\.11, 14:00/), `${name}: the text`);
      assert.equal(s.hasButton(/^Открыть урок \d\d\.\d\d$/), false, `${name}: no button`);
    });
  }
});

scenario("MV4", "a failed read of the new lesson's day: the text stays, no button, no error", async ({ screen }) => {
  const world = movedWorld();
  await withWorld(world, async () => {
    const s = await start(screen, world);
    world.failNext.getScheduleOccurrences = new Error("503");
    await openOriginal(s);
    assert.ok(s.has(/Урок перенесён на пт, 06\.11, 14:00/));
    assert.equal(s.hasButton(/^Открыть урок \d\d\.\d\d$/), false);
  });
});

scenario("MV5", "the new lesson is on the next week: the schedule shows that week, the panel opens there", async ({ screen }) => {
  const world = movedWorld({ to: NEXT_WEEK_DAY });
  await withWorld(world, async () => {
    const s = await start(screen, world);
    await openOriginal(s);
    await s.click(/^Открыть урок 11\.11$/);
    await s.settle(10);
    assert.ok(s.has(/среда, 11 ноября · 14:00 — 15:00/), s.text().slice(0, 300));
    if (screen === "schedule") {
      const weeks = world.called("getScheduleOccurrences").map((c) => c.args[0].dateFrom);
      assert.ok(weeks.includes("2026-11-09"), `the week of the new lesson was read: ${weeks.join(",")}`);
    }
  });
});

scenario("MV6", "the week grid: the card of the original is pressable (muted, one chip) and opens the same panel as the day list", async ({ screen }) => {
  const world = movedWorld();
  await withWorld(world, async () => {
    const s = await start(screen, world);
    await s.click(/На неделю/);
    const cards = s.all((n) => n.props["data-testid"] === "week-card-muted");
    assert.equal(cards.length, 1, "the muted card found");
    assert.equal(cards[0].props.role, "button");
    assert.equal(cards[0].props.tabIndex, 0);
    assert.match(cards[0].props.className, /opacity-75/, "the style stays muted");
    assert.match(cards[0].props["aria-label"], /Перенесён на пт, 06\.11, 14:00/);
    await s.click(cards[0]);
    await s.settle(8);
    assert.ok(s.has(/Урок перенесён на пт, 06\.11, 14:00/), "the same panel as from the day list");
    assert.ok(s.hasButton(/^Открыть урок 06\.11$/));
    assert.ok(s.has(/Причина: Заболел преподаватель/));
  });
}, ["schedule"]);

scenario("MV7", "the week grid: a card of a cancelled (not moved) lesson opens its panel too (the same as in the day list)", async ({ screen }) => {
  const world = createWorld();
  world.setLessonState(world.lessons.find((l) => l.id === "L-up"), { status: "cancelled", version: 2, cancellationReason: "Каникулы центра" });
  await withWorld(world, async () => {
    const s = await start(screen, world);
    await s.click(/На неделю/);
    const card = s.all((n) => n.props["data-testid"] === "week-card-muted")[0];
    assert.ok(card, "the muted card found");
    await s.click(card);
    await s.settle(8);
    assert.ok(s.has(/Урок отменён/));
    assert.ok(s.has(/Причина: Каникулы центра/));
  });
}, ["schedule"]);

scenario("MV8", "a plain cancelled lesson keeps «Урок отменён · Причина: …»", async ({ screen }) => {
  const world = createWorld();
  world.setLessonState(world.lessons.find((l) => l.id === "L-up"), { status: "cancelled", version: 2, cancellationReason: "Каникулы центра" });
  await withWorld(world, async () => {
    const s = await start(screen, world);
    await s.click(s.clickable(/Скоро/));
    await s.settle(8);
    assert.ok(s.has(/Урок отменён/));
    assert.ok(s.has(/Причина: Каникулы центра/));
    assert.equal(s.hasButton(/^Открыть урок \d\d\.\d\d$/), false);
  });
});

test("[MV9] one text of a lesson moved away for the panel of the teacher and the sheet of the administrator", () => {
  const C = require(path.join(harness.root, "src/lib/schedule-card-actions.ts"));
  assert.deepEqual(C.movedAwayLines({ movedToText: "пт, 06.11, 14:00", reason: REASON }), { title: "Урок перенесён на пт, 06.11, 14:00", reason: "Заболел преподаватель" });
  assert.deepEqual(C.movedAwayLines({ movedToText: null, reason: null }), { title: "Урок перенесён", reason: null });
  assert.deepEqual(C.movedAwayLines({ movedToText: "пт, 06.11, 14:00", reason: "Перенесён на 06.11, 14:00–15:00" }), { title: "Урок перенесён на пт, 06.11, 14:00", reason: null });
  assert.deepEqual(C.sheetNotes({ moved: true, movedToText: "пт, 06.11, 14:00", reason: REASON, cancelled: true }), ["Урок перенесён на пт, 06.11, 14:00", "Причина: Заболел преподаватель"]);
  const sheet = fs.readFileSync(path.join(harness.root, "src/lib/schedule-card-actions.ts"), "utf8");
  assert.equal((sheet.match(/Урок перенесён/g) || []).length >= 1, true);
  const panel = fs.readFileSync(path.join(harness.root, "src/components/teacher/lesson-panel.tsx"), "utf8");
  assert.match(panel, /movedAwayLines\(/, "the panel reads the same function as the sheet");
});

test("[MV10] movedTargetOf: the lesson of the same group named by the server, else by the start time; not the one given away or cancelled", () => {
  const { movedTargetOf } = require(path.join(harness.root, "src/lib/moved-lesson.ts"));
  const movedTo = { date: "2026-11-06", startTime: "14:00", endTime: "15:00", lessonId: "N" };
  const occ = [{ id: "X", groupId: "G", startTime: "14:00" }, { id: "N", groupId: "G", startTime: "14:00" }, { id: "N", groupId: "OTHER", startTime: "14:00" }];
  const find = (extra = {}) => movedTargetOf({ occurrences: occ, journal: null, groupId: "G", movedTo, viewerId: "t1", ...extra });
  assert.equal(find().id, "N");
  assert.equal(find().groupId, "G");
  assert.equal(movedTargetOf({ occurrences: occ, journal: null, groupId: "G", movedTo: { ...movedTo, lessonId: null }, viewerId: "t1" }).id, "X", "no id: by the start time");
  assert.equal(find({ journal: { statuses: { "2026-11-06_N": "cancelled" } } }), null);
  assert.equal(find({ journal: { lessonTeachers: { "2026-11-06_N": { teacherId: "t2" } } } }), null);
  assert.equal(find({ occurrences: [{ id: "N", groupId: "G", startTime: "14:00", replacedBy: { id: "t2", name: "R" } }] }), null);
  assert.equal(find({ occurrences: [] }), null);
});
