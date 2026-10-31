import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../support/fixtures";
import { Org, startLesson } from "../support/api";
import { ExamApi, StudentAttempt, STUB_SKILL20_ID } from "../support/exam";
import { expectNoHorizontalScroll } from "../support/ui";

/**
 * The header of a RUNNING exam (three action buttons + «⋯», four labels, a long title) keeps the title in whole words and the labels in
 * rows - for the teacher (/teacher/exams/{id}) and the administrator (/admin/exams/{id}), at 1280 and at 375.
 * Needs E2E_EXAM=1.  Screenshots: SHOTS_DIR/exam-header-{SHOT_PHASE}-{teacher|admin}-{desktop|mobile}.png
 */
const SHOTS = process.env.SHOTS_DIR || path.resolve(__dirname, "../../../artifacts/code_audit_2410/shots-wb-p1");
const PHASE = process.env.SHOT_PHASE || "after";
mkdirSync(SHOTS, { recursive: true });
const LONG_TITLE = "Контрольная работа №3: Квадратные уравнения и неравенства, 8 класс";

test("header of a running exam: the title stays whole, the labels sit in rows @exam @mobile", async ({ signIn }, testInfo) => {
  const org = await Org.create("Шапка");
  const teacher = await org.addStaff("teacher", "Шапкин");
  const group = await org.createGroup({ name: "Группа Ш1", teacherId: teacher.userId });
  const student = await org.addStudent(group, "Анвар", "Шапочный");
  const lesson = await org.createLessonStartingNow(group.id, teacher, 45);
  await startLesson(teacher, lesson);
  const api = new ExamApi(teacher);
  const draft = await api.createDraft({ title: LONG_TITLE, groupId: group.id, tasks: 3, skillId: STUB_SKILL20_ID, threshold: 70 });
  const published = await api.call<{ access_code: string }>("POST", `/exams/${draft.exam_id}/assign`, {
    group_id: group.id, publish: true, lesson_id: lesson.id, lesson_date: lesson.date,
  });
  await new StudentAttempt(published.access_code).join(`${student.lastName} ${student.firstName}`, student.displayId!);
  await api.call("POST", `/exams/${draft.exam_id}/start-live`);

  for (const [who, session, url] of [
    ["teacher", teacher, `/teacher/exams/${draft.exam_id}`],
    ["admin", org.owner, `/admin/exams/${draft.exam_id}`],
  ] as const) {
    const page = await signIn(session);
    await page.goto(url);
    const title = page.getByRole("heading", { level: 1, name: LONG_TITLE });
    await expect(title).toBeVisible();
    await page.waitForTimeout(700);                                            // the card fades in: the picture is taken when it stands still
    await page.screenshot({ path: path.join(SHOTS, `exam-header-${PHASE}-${who}-${testInfo.project.name}.png`) });
    await expectNoHorizontalScroll(page);
    if (testInfo.project.name === "desktop" && PHASE !== "before") {           // «before» only takes the pictures of the old layout
      // the title is not squeezed into a column of one or two words: it is wide, and short enough to take at most two lines
      const box = (await title.boundingBox())!;
      expect(box.width, `${who}: the title column`).toBeGreaterThan(420);
      const line = await title.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
      expect(box.height, `${who}: the title lines`).toBeLessThanOrEqual(line * 2 + 2);
    }
    await page.context().close();
  }
});
