import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../support/fixtures";
import { Org, startLesson } from "../support/api";
import { ExamApi, StudentAttempt, STUB_SKILL20_ID } from "../support/exam";
import { expectNoHorizontalScroll } from "../support/ui";

/**
 * The header of the exam page (teacher /teacher/exams/{id}, administrator /admin/exams/{id}), in every state, at 1280 and at 375:
 * a long title in whole words, ONE coloured element (the status), one quiet line of facts, ONE main action + one quiet link + «⋯»,
 * the rest of the actions in «⋯» (tidy, owner 31.10).  Needs E2E_EXAM=1.
 * Screenshots: SHOTS_DIR/tidy-{SHOT_PHASE}-{state}-{teacher|admin}-{desktop|mobile}.png  (SHOT_PHASE = before | after; the checks run on «after»)
 */
const SHOTS = process.env.SHOTS_DIR || path.resolve(__dirname, "../../../artifacts/code_audit_2410/shots-wb-p1");
const PHASE = process.env.SHOT_PHASE || "after";
mkdirSync(SHOTS, { recursive: true });
const LONG_TITLE = "Контрольная работа №3: Квадратные уравнения и неравенства, 8 класс";

test("header of the exam page in every state @exam @mobile", async ({ signIn }, testInfo) => {
  test.setTimeout(120_000);
  const desktop = testInfo.project.name === "desktop";
  const checks = PHASE === "after";
  const org = await Org.create("Шапка");
  const teacher = await org.addStaff("teacher", "Шапкин");
  const group = await org.createGroup({ name: "Группа Ш1", teacherId: teacher.userId });
  const student = await org.addStudent(group, "Анвар", "Шапочный");
  const lesson = await org.createLessonStartingNow(group.id, teacher, 45);
  await startLesson(teacher, lesson);
  const api = new ExamApi(teacher);

  const tp = await signIn(teacher);
  const ap = await signIn(org.owner);
  const shot = async (page: import("@playwright/test").Page, state: string, who: string) => {
    await page.waitForTimeout(700);   // the card fades in: the picture is taken when it stands still
    await page.screenshot({ path: path.join(SHOTS, `tidy-${PHASE}-${state}-${who}-${testInfo.project.name}.png`) });
    await expectNoHorizontalScroll(page);
  };
  const header = (page: import("@playwright/test").Page) => page.getByRole("heading", { level: 1, name: LONG_TITLE }).locator("xpath=ancestor::div[contains(@class,'rounded-3xl')][1]");
  const open = async (who: "teacher" | "admin", examId: string) => {
    const page = who === "teacher" ? tp : ap;
    await page.goto(who === "teacher" ? `/teacher/exams/${examId}` : `/admin/exams/${examId}`);
    const title = page.getByRole("heading", { level: 1, name: LONG_TITLE });
    await expect(title).toBeVisible();
    if (checks && desktop) {
      // the title is not squeezed into a column of one or two words: it is wide, and takes at most two lines
      const box = (await title.boundingBox())!;
      expect(box.width, `${who}: the title column`).toBeGreaterThan(420);
      const line = await title.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
      expect(box.height, `${who}: the title lines`).toBeLessThanOrEqual(line * 2 + 2);
    }
    return page;
  };

  // --- a template without a group
  const template = await api.createDraft({ title: LONG_TITLE, tasks: 3, skillId: STUB_SKILL20_ID, threshold: 70 });
  let page = await open("teacher", template.exam_id);
  if (checks) {
    await expect(page.getByRole("button", { name: "Привязать группу" })).toBeVisible();
    await expect(header(page).getByRole("button")).toHaveCount(2);                 // the main action and «⋯»
  }
  await shot(page, "draft-nogroup", "teacher");

  // --- lobby
  const draft = await api.createDraft({ title: LONG_TITLE, groupId: group.id, tasks: 3, skillId: STUB_SKILL20_ID, threshold: 70 });
  const published = await api.call<{ access_code: string }>("POST", `/exams/${draft.exam_id}/assign`, {
    group_id: group.id, publish: true, lesson_id: lesson.id, lesson_date: lesson.date,
  });
  page = await open("teacher", draft.exam_id);
  if (checks) {
    await expect(page.getByRole("button", { name: "Начать экзамен" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ссылка для учеников" })).toBeVisible();
    await expect(page.getByText("Ожидает старта", { exact: true })).toBeVisible();
    await expect(page.getByText(/Группа Ш1 · урок .*· порог 70%/)).toBeVisible();   // one quiet line
    await expect(header(page).getByRole("button")).toHaveCount(3);                  // main action, link, «⋯»
    await expect(page.getByRole("button", { name: /Сбросить ограничения/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Опции экзамена" }).click();
    const items = await page.getByRole("menuitem").or(page.locator("#exam-actions-menu button")).allInnerTexts();
    expect(items.map((t) => t.split("\n")[0].trim())).toEqual([
      "Разблокировать вход учеников", "Изменить порог", "Создать копию", "Закрепить", "Перенести в архив",
    ]);
    await expect(page.getByText("Если ученик несколько раз ввёл код неверно")).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await shot(page, "lobby", "teacher");
  // the threshold may still change in the lobby; the lobby is not yet «begun»
  expect((await api.call("PATCH", `/exams/${draft.exam_id}/pass-threshold`, { pass_threshold_pct: 75 })).pass_threshold_pct).toBe(75);
  await api.call("PATCH", `/exams/${draft.exam_id}/pass-threshold`, { pass_threshold_pct: 70 });

  // --- running
  await new StudentAttempt(published.access_code).join(`${student.lastName} ${student.firstName}`, student.displayId!);
  await api.call("POST", `/exams/${draft.exam_id}/start-live`);
  page = await open("teacher", draft.exam_id);
  if (checks) {
    await expect(page.getByRole("button", { name: "Завершить экзамен" })).toBeVisible();
    await expect(page.getByText("Идёт экзамен", { exact: true })).toBeVisible();
    await expect(header(page).getByRole("button")).toHaveCount(3);
    await page.getByRole("button", { name: "Опции экзамена" }).click();
    await expect(page.getByRole("button", { name: "Изменить порог" })).toHaveCount(0);   // shut from the start
    await expect(page.getByRole("button", { name: /Разблокировать вход/ })).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await shot(page, "active", "teacher");
  const refused = await api.call("PATCH", `/exams/${draft.exam_id}/pass-threshold`, { pass_threshold_pct: 50 }).then(() => null, (e) => e);
  expect(refused?.status).toBe(409);
  expect(JSON.stringify(refused?.detail)).toContain("Порог нельзя изменить: экзамен уже начался");
  const adminPage = await open("admin", draft.exam_id);
  if (checks) await expect(adminPage.getByText(/Группа Ш1 · 7 класс · .*порог 70%/)).toBeVisible();
  await shot(adminPage, "active", "admin");

  // --- closed
  await api.call("POST", `/exams/${draft.exam_id}/close`);
  page = await open("teacher", draft.exam_id);
  if (checks) {
    await expect(page.getByRole("button", { name: "Отчёт" })).toBeVisible();
    await expect(page.getByText("Завершён", { exact: true })).toBeVisible();
    await expect(header(page).getByRole("button")).toHaveCount(2);
  }
  await shot(page, "closed", "teacher");
  const closedAdmin = await open("admin", draft.exam_id);
  await shot(closedAdmin, "closed", "admin");
});
