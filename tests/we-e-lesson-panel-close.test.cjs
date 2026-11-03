// WE-E, R3 round (4): closing the panel (Escape, the cross, the dark background) with marks that are NOT saved asks first, in the platform's own window
// («Есть несохранённые отметки — закрыть без сохранения?» [Закрыть без сохранения] [Вернуться]); with nothing unsaved it closes at once. Both screens.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { NOW, LESSONS, createWorld, mountScreen, harness } = require("./helpers/teacher-world.cjs");

const PATHS = { dashboard: "src/app/teacher/dashboard/page.tsx", schedule: "src/app/teacher/schedule/page.tsx" };
const QUESTION = "Есть несохранённые отметки — закрыть без сохранения?";
const marksButton = (s, student, title) => s.all((n) => n.tag === "button" && typeof n.props.title === "string" && n.props.title.startsWith(`Отметить «${title}»`))[student];
const confirm = () => require(path.join(harness.root, "src/lib/confirm-dialog.ts"));
const answer = async (s, value) => { confirm().answerConfirm(value); await new Promise((resolve) => setTimeout(resolve, 8)); await s.settle(); };   // a person needs more than a millisecond to press the key again
const drain = () => { while (confirm().currentConfirm()) confirm().answerConfirm(false); };
const crossOf = (s) => s.all((n) => n.tag === "button" && typeof n.props.className === "string" && n.props.className.includes("p-2 text-slate-400") && typeof n.props.onClick === "function")[0];
const backdropOf = (s) => s.all((n) => typeof n.props.onClick === "function" && typeof n.props.className === "string" && n.props.className.includes("z-[99999]"))[0];

async function started(screen, world, { dirty }) {
  const s = mountScreen(PATHS[screen], world);
  await s.settle();
  await s.click(s.clickable(/Живая/));
  await s.click(/^Начать урок$/);
  if (dirty) await s.click(marksButton(s, 0, "Был на уроке"));
  return s;
}
async function scenario(screen, run, options) {
  harness.setNow(NOW);
  const world = createWorld(options);
  drain();
  try { await run(world); } finally { drain(); world.restore(); harness.setNow(null); }
}

for (const screen of ["dashboard", "schedule"]) {
  test(`[CL1] ${screen}: Escape with unsaved marks asks; «Вернуться» keeps the panel and the marks, «Закрыть без сохранения» closes`, async () => {
    await scenario(screen, async (world) => {
      const s = await started(screen, world, { dirty: true });
      await s.press("Escape");
      const asked = confirm().currentConfirm();
      assert.ok(asked, "the question is asked");
      assert.equal(asked.title, QUESTION);
      assert.equal(asked.confirmLabel, "Закрыть без сохранения");
      assert.equal(asked.cancelLabel, "Вернуться");
      assert.match(s.text(), /Отметка посещаемости \(1 из 2\)/, "the panel is still open");
      await answer(s, false);
      assert.match(s.text(), /Отметка посещаемости \(1 из 2\)/, "«Вернуться»: the marks are on the screen");
      await s.press("Escape");
      assert.ok(confirm().currentConfirm());
      await answer(s, true);
      assert.doesNotMatch(s.text(), /Отметка посещаемости/, "«Закрыть без сохранения»: closed");
      assert.equal(world.called("saveGroupAttendance").length, 0, "nothing was written");
    });
  });

  test(`[CL2] ${screen}: the cross and the dark background ask the same question`, async () => {
    await scenario(screen, async (world) => {
      const s = await started(screen, world, { dirty: true });
      await s.click(crossOf(s));
      assert.equal(confirm().currentConfirm()?.title, QUESTION);
      await answer(s, false);
      const back = backdropOf(s);
      back.props.onClick({ target: back, currentTarget: back });
      await s.settle(2);
      assert.equal(confirm().currentConfirm()?.title, QUESTION);
      await answer(s, true);
      assert.doesNotMatch(s.text(), /Отметка посещаемости/);
    });
  });

  test(`[CL3] ${screen}: nothing unsaved - Escape, the cross and the background close at once, no question`, async () => {
    await scenario(screen, async (world) => {
      let s = await started(screen, world, { dirty: false });       // started, nothing marked
      await s.press("Escape");
      assert.equal(confirm().currentConfirm(), null);
      assert.doesNotMatch(s.text(), /Отметка посещаемости/);
      await s.click(s.clickable(/Живая/));
      await s.click(crossOf(s));
      assert.equal(confirm().currentConfirm(), null);
      assert.doesNotMatch(s.text(), /Отметка посещаемости|Заполнить посещаемость/);
    });
  });

  test(`[CL4] ${screen}: after the marks are saved the panel closes at once`, async () => {
    await scenario(screen, async (world) => {
      const s = await started(screen, world, { dirty: true });
      await s.click(marksButton(s, 1, "Не был"));
      await s.click(/Сохранить отметки/);
      assert.match(s.text(), /Посещаемость отмечена/);
      await s.press("Escape");
      assert.equal(confirm().currentConfirm(), null);
      assert.doesNotMatch(s.text(), /Посещаемость отмечена/);
    });
  });

  test(`[CL5] ${screen}: the same Escape that answers the question does not ask it again`, async () => {
    await scenario(screen, async (world) => {
      const s = await started(screen, world, { dirty: true });
      await s.press("Escape");
      const first = confirm().currentConfirm();
      await s.press("Escape");                                       // a second key while the question is open
      assert.equal(confirm().currentConfirm()?.id, first.id, "still ONE question");
    });
  });

  test(`[CL7] ${screen}: while the save of the marks is on its way the panel closes at once (the marks are being written; the answer is a notice of the page)`, async () => {
    await scenario(screen, async (world) => {
      const s = await started(screen, world, { dirty: true });
      const gate = harness.deferred();
      world.hold.saveGroupAttendance = gate;
      const pending = s.click(/Сохранить отметки/);
      await s.settle(2);
      await s.press("Escape");
      assert.equal(confirm().currentConfirm(), null, "no question: nothing is lost");
      assert.doesNotMatch(s.text(), /Отметка посещаемости/);
      gate.resolve();
      await pending;
      assert.equal(world.called("saveGroupAttendance").length, 1);
    });
  });

  test(`[CL6] MUTATION ${screen}: closing without the question loses the marks silently - CL1 fails`, async () => {
    await assert.rejects(() => harness.withMutation("src/lib/use-teacher-lesson-panel.ts", (source) => source.replace("if (!isAttendanceDirty || savingAttendance) { setActiveLesson(null); return true; }", "if (true) { setActiveLesson(null); return true; }"), () => scenario(screen, async (world) => {
      const s = await started(screen, world, { dirty: true });
      await s.press("Escape");
      assert.ok(confirm().currentConfirm(), "the question is asked");
    })), /the question is asked/);
  });
}
