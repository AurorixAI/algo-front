import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../support/fixtures";
import { Org, startLesson } from "../support/api";
import { ExamApi, StudentAttempt, STUB_SKILL20_ID } from "../support/exam";
import { expectNoHorizontalScroll } from "../support/ui";

/**
 * The exam page (teacher /teacher/exams/{id}, administrator /admin/exams/{id}), in every state, at 1280 and at 375:
 * the HEADER is information only (a long title in whole words, ONE coloured element - the status, one quiet line of facts, NO button, NO «⋯»);
 * every action lives in the LIVE BLOCK of the «Лобби / Live» tab: one main action by status + one quiet link + «⋯» (owner 31.10).  Needs E2E_EXAM=1.
 * Screenshots: SHOTS_DIR/{SHOT_PREFIX=tidy}-{SHOT_PHASE}-{state}-{teacher|admin}-{desktop|mobile}.png  (SHOT_PHASE = before | after; the checks run on «after»)
 */
const SHOTS = process.env.SHOTS_DIR || path.resolve(__dirname, "../../../artifacts/code_audit_2410/shots-wb-p1");
const PHASE = process.env.SHOT_PHASE || "after";
const PREFIX = process.env.SHOT_PREFIX || "tidy3";
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
    await page.screenshot({ path: path.join(SHOTS, `${PREFIX}-${PHASE}-${state}-${who}-${testInfo.project.name}.png`) });
    await expectNoHorizontalScroll(page);
  };
  const header = (page: import("@playwright/test").Page) => page.getByRole("heading", { level: 1, name: LONG_TITLE }).locator("xpath=ancestor::div[contains(@class,'rounded-3xl')][1]");
  const open = async (who: "teacher" | "admin", examId: string) => {
    const page = who === "teacher" ? tp : ap;
    await page.goto(who === "teacher" ? `/teacher/exams/${examId}` : `/admin/exams/${examId}`);
    const title = page.getByRole("heading", { level: 1, name: LONG_TITLE });
    await expect(title).toBeVisible();
    if (checks && !desktop && who === "teacher") {
      // on a phone the breadcrumb is one short line: «← Экзамены», without the title
      const crumb = page.getByTestId("exam-back-link");
      await expect(crumb).toBeVisible();
      expect((await crumb.innerText()).trim()).toBe("Экзамены");               // the visible text only
      expect((await crumb.boundingBox())!.height, "the breadcrumb is one line").toBeLessThan(32);
    }
    if (checks && desktop) {
      // the title is not squeezed into a column of one or two words: it is wide, and takes at most two lines
      const box = (await title.boundingBox())!;
      expect(box.width, `${who}: the title column`).toBeGreaterThan(420);
      const line = await title.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
      expect(box.height, `${who}: the title lines`).toBeLessThanOrEqual(line * 2 + 2);
    }
    return page;
  };

  const block = (page: import("@playwright/test").Page) => page.getByTestId("exam-live-block");
  const menuItems = async (page: import("@playwright/test").Page) => {
    await block(page).getByRole("button", { name: "Опции экзамена" }).click();
    const items = await page.locator("#exam-actions-menu button").allInnerTexts();
    return items.map((t) => t.split("\n")[0].trim());
  };
  const noButtonInHeader = async (page: import("@playwright/test").Page) => {
    await expect(header(page).getByRole("button")).toHaveCount(0);
    await expect(header(page).getByRole("link")).toHaveCount(0);
  };

  // --- a template without a group
  const template = await api.createDraft({ title: LONG_TITLE, tasks: 3, skillId: STUB_SKILL20_ID, threshold: 70 });
  let page = await open("teacher", template.exam_id);
  if (checks) {
    await noButtonInHeader(page);
    await expect(page.getByText("Шаблон без группы · порог 70%")).toBeVisible();
    await expect(page.getByRole("button", { name: "Привязать к группе" })).toBeVisible();   // the yellow notice
    await expect(page.getByRole("button", { name: "Привязать группу" })).toHaveCount(0);      // no longer in the header
    await expect(block(page).getByRole("button")).toHaveCount(1);                              // counters + «⋯»
    expect(await menuItems(page)).toEqual(["Изменить название", "Изменить порог", "Создать копию", "Закрепить", "Перенести в архив"]);
    await page.keyboard.press("Escape");
  }
  await shot(page, "draft-nogroup", "teacher");

  // --- lobby
  const draft = await api.createDraft({ title: LONG_TITLE, groupId: group.id, tasks: 3, skillId: STUB_SKILL20_ID, threshold: 70 });
  const published = await api.call<{ access_code: string }>("POST", `/exams/${draft.exam_id}/assign`, {
    group_id: group.id, publish: true, lesson_id: lesson.id, lesson_date: lesson.date,
  });
  page = await open("teacher", draft.exam_id);
  if (checks) {
    await noButtonInHeader(page);
    await expect(page.getByText("Ожидает старта", { exact: true })).toBeVisible();
    await expect(page.getByText(/Группа Ш1 · урок .*· порог 70%/)).toBeVisible();   // one quiet line
    await expect(block(page).getByRole("button", { name: "Начать экзамен" })).toBeVisible();
    await expect(block(page).getByRole("button", { name: "Ссылка для учеников" })).toBeVisible();
    await expect(block(page).getByText("Длительность: 20 мин")).toBeVisible();
    await expect(block(page).getByRole("button")).toHaveCount(3);                   // main action, link, «⋯»
    expect(await menuItems(page)).toEqual([                                          // (the title can be changed in a draft only)
      "Разблокировать вход учеников", "Изменить порог", "Создать копию", "Закрепить", "Перенести в архив",
    ]);
    await expect(page.getByText("Если ученик несколько раз ввёл код неверно")).toBeVisible();
    await page.keyboard.press("Escape");
    await shot(page, "lobby", "teacher");
    // unblocking the entry: through «⋯» of the block
    await block(page).getByRole("button", { name: "Опции экзамена" }).click();
    await page.locator("#exam-actions-menu").getByRole("button", { name: /Разблокировать вход учеников/ }).click();
    await expect(page.getByText("Ограничения входа сброшены")).toBeVisible();
  } else {
    await shot(page, "lobby", "teacher");
  }
  // the threshold may still change in the lobby; the lobby is not yet «begun»
  expect((await api.call("PATCH", `/exams/${draft.exam_id}/pass-threshold`, { pass_threshold_pct: 75 })).pass_threshold_pct).toBe(75);
  await api.call("PATCH", `/exams/${draft.exam_id}/pass-threshold`, { pass_threshold_pct: 70 });

  // --- running
  await new StudentAttempt(published.access_code).join(`${student.lastName} ${student.firstName}`, student.displayId!);
  await api.call("POST", `/exams/${draft.exam_id}/start-live`);
  page = await open("teacher", draft.exam_id);
  if (checks) {
    await noButtonInHeader(page);
    await expect(page.getByText("Идёт экзамен", { exact: true })).toBeVisible();
    await expect(block(page).getByText("Осталось времени")).toBeVisible();
    await expect(block(page).getByRole("button", { name: "Завершить досрочно" })).toBeVisible();
    await expect(block(page).getByRole("button", { name: "Ссылка для учеников" })).toBeVisible();
    await expect(block(page).getByRole("button")).toHaveCount(3);                   // finish early, link, «⋯»
    const items = await menuItems(page);
    expect(items).not.toContain("Изменить порог");                                   // shut from the start
    expect(items[0]).toBe("Разблокировать вход учеников");
    await page.keyboard.press("Escape");
  }
  await shot(page, "active", "teacher");
  const refused = await api.call("PATCH", `/exams/${draft.exam_id}/pass-threshold`, { pass_threshold_pct: 50 }).then(() => null, (e) => e);
  expect(refused?.status).toBe(409);
  expect(JSON.stringify(refused?.detail)).toContain("Порог нельзя изменить: экзамен уже начался");
  const adminPage = await open("admin", draft.exam_id);
  if (checks) {
    await expect(adminPage.getByText(/Группа Ш1 · 7 класс · .*порог 70%/)).toBeVisible();
    await expect(header(adminPage).getByRole("button")).toHaveCount(0);
    await expect(adminPage.getByRole("button", { name: /Завершить|Начать|Опции/ })).toHaveCount(0);   // the administrator has no actions: nothing was lost
  }
  await shot(adminPage, "active", "admin");

  // --- finish early: a dialog of the page, not the browser's confirm
  if (checks) {
    page.once("dialog", () => { throw new Error("a native dialog was opened"); });
    await block(page).getByRole("button", { name: "Завершить досрочно" }).click();
    const dialog = page.getByRole("dialog", { name: "Завершить досрочно" });
    await expect(dialog.getByText("Ученики ещё пишут. Завершить экзамен для всех?")).toBeVisible();
    await shot(page, "active-confirm", "teacher");
    await dialog.getByRole("button", { name: "Отмена" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(block(page).getByText("Осталось времени")).toBeVisible();           // nothing happened
    await block(page).getByRole("button", { name: "Завершить досрочно" }).click();
    await page.getByRole("dialog", { name: "Завершить досрочно" }).getByRole("button", { name: "Завершить", exact: true }).click();
    await expect(block(page).getByText("Экзамен завершён")).toBeVisible();
  } else {
    await api.call("POST", `/exams/${draft.exam_id}/close`);
  }

  // --- closed
  page = await open("teacher", draft.exam_id);
  if (checks) {
    await noButtonInHeader(page);
    await expect(page.getByText("Завершён", { exact: true })).toBeVisible();
    // the finished exam is not painted as an error: no red status, no coloured ribbon over the card
    expect(await page.getByText("Завершён", { exact: true }).getAttribute("class")).not.toMatch(/rose|red/);
    await expect(header(page).locator("div[class*='gradient-to-r']")).toHaveCount(0);
    await expect(block(page).getByRole("button")).toHaveCount(2);                   // «Открыть отчёт» and «⋯»
    await block(page).getByRole("button", { name: "Открыть отчёт" }).click();
    await expect(page.getByText(/Сдали порог \(≥70%\)/)).toBeVisible();            // the tab «Результаты и аналитика»
    await page.getByRole("button", { name: /Лобби \/ Live/ }).click();
  }
  await shot(page, "closed", "teacher");
  const closedAdmin = await open("admin", draft.exam_id);
  await shot(closedAdmin, "closed", "admin");

  // --- archived: «⋯» only, with restore / delete for good
  await api.call("DELETE", `/exams/${draft.exam_id}`);
  page = await open("teacher", draft.exam_id);
  if (checks) {
    await noButtonInHeader(page);
    await expect(page.getByText("Архив", { exact: true })).toBeVisible();
    await expect(block(page).getByRole("button")).toHaveCount(1);
    expect(await menuItems(page)).toEqual(["Восстановить из архива", "Удалить навсегда"]);
    await page.keyboard.press("Escape");
  }
  await shot(page, "archived", "teacher");
  const archivedAdmin = await open("admin", draft.exam_id);
  await shot(archivedAdmin, "archived", "admin");
});
