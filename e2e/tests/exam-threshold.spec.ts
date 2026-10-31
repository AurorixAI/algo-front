import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../support/fixtures";
import { Org, startLesson } from "../support/api";
import { ExamApi, StudentAttempt, STUB_SKILL20_ID } from "../support/exam";
import { expectNoHorizontalScroll } from "../support/ui";

/**
 * Wave B / P1 (needs E2E_EXAM=1): the pass threshold belongs to the exam, «Аналитика» and «Отчёт» count with one function,
 * the library is not cut at 100.
 *
 *   exam of 20 tasks, threshold 70 % -> two students: 11/20 = 55 % and 15/20 = 75 %
 *   «Аналитика» and «Отчёт» both say «Сдали порог (≥70%)» = 50 %; changing the threshold is a 409 with the text
 *   library: 150 exams of two teachers -> each teacher gets his 75 through «Показать ещё»
 *
 * Screenshots (SHOTS_DIR, default artifacts/code_audit_2410/shots-wb-p1) are named by project: desktop = 1280, mobile = 375.
 */
test.describe.configure({ mode: "serial" });

const SHOTS = process.env.SHOTS_DIR || path.resolve(__dirname, "../../../artifacts/code_audit_2410/shots-wb-p1");
mkdirSync(SHOTS, { recursive: true });
const LOCKED = "Порог нельзя изменить: по экзамену уже есть сданные работы";

let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Порог");
});

test("threshold 70: students at 55 % and 75 % -> «Аналитика» and «Отчёт» agree on 50 %, the threshold is locked @exam @mobile", async ({ signIn, anonymous }, testInfo) => {
  const shot = (page: import("@playwright/test").Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}-${testInfo.project.name}.png`), fullPage: false });
  const teacher = await org.addStaff("teacher", "Порогов");
  const group = await org.createGroup({ name: "Группа П1", teacherId: teacher.userId });
  const low = await org.addStudent(group, "Слабый", "Пятьдесятпяти");
  const high = await org.addStudent(group, "Сильный", "Семьдесятпять");
  const lesson = await org.createLessonStartingNow(group.id, teacher, 45);
  await startLesson(teacher, lesson);

  // --- an exam of 20 tasks with the threshold 70
  const api = new ExamApi(teacher);
  const draft = await api.createDraft({ title: "E2E Порог 70", groupId: group.id, tasks: 20, skillId: STUB_SKILL20_ID, threshold: 70 });
  const stored = await api.call("GET", `/exams/${draft.exam_id}`);
  expect(stored.pass_threshold_pct).toBe(70);

  const tp = await signIn(teacher);
  await tp.goto(`/teacher/exams/${draft.exam_id}/draft`);
  await expect(tp.getByText(/порог 70%/)).toBeVisible();
  await expectNoHorizontalScroll(tp);
  await shot(tp, "1-draft-threshold-in-header");

  // the threshold can still be changed before any work is submitted: through the «⋯» menu
  await tp.getByRole("button", { name: /Действия|Опции/ }).first().click();
  await tp.getByRole("button", { name: "Изменить порог" }).click();
  const dialog = tp.getByRole("dialog", { name: "Проходной порог" });
  await expect(dialog.getByLabel("Проходной порог, %")).toHaveValue("70");
  await dialog.getByLabel("Проходной порог, %").fill("0");
  await expect(dialog.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  await shot(tp, "2-threshold-dialog-invalid");
  await dialog.getByLabel("Проходной порог, %").fill("80");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(tp.getByText(/порог 80%/)).toBeVisible();
  await tp.getByRole("button", { name: /Действия|Опции/ }).first().click();
  await tp.getByRole("button", { name: "Изменить порог" }).click();
  await tp.getByRole("dialog", { name: "Проходной порог" }).getByLabel("Проходной порог, %").fill("70");
  await tp.getByRole("dialog", { name: "Проходной порог" }).getByRole("button", { name: "Сохранить" }).click();
  await expect(tp.getByText(/порог 70%/)).toBeVisible();

  // --- assign to the started lesson, both students join, the teacher starts
  const published = await api.call<{ access_code: string }>("POST", `/exams/${draft.exam_id}/assign`, {
    group_id: group.id, publish: true, lesson_id: lesson.id, lesson_date: lesson.date,
  });
  const code = published.access_code;
  const lowAttempt = new StudentAttempt(code);
  const highAttempt = new StudentAttempt(code);
  await lowAttempt.join(`${low.lastName} ${low.firstName}`, low.displayId!);
  await highAttempt.join(`${high.lastName} ${high.firstName}`, high.displayId!);
  await api.call("POST", `/exams/${draft.exam_id}/start-live`);
  await lowAttempt.waitStarted();
  await highAttempt.waitStarted();

  const key = Object.fromEntries(
    (await api.call("GET", `/exams/${draft.exam_id}/draft`)).variants[0].tasks.map((t: any) => [t.task_id, t.correct_answer]),
  ) as Record<string, string>;
  const ids = Object.keys(key);
  expect(ids).toHaveLength(20);
  const first = (n: number) => Object.fromEntries(ids.slice(0, n).map((id) => [id, key[id]]));
  expect((await lowAttempt.submit(first(11))).percentage).toBe(55);   // the rest of the tasks is skipped
  expect((await highAttempt.submit(first(15))).percentage).toBe(75);

  // --- «Аналитика»
  await tp.goto(`/teacher/exams/${draft.exam_id}`);
  await tp.getByRole("button", { name: /Результаты|Аналитика/ }).first().click();
  await expect(tp.getByText("Сдали порог (≥70%)", { exact: true })).toBeVisible();
  await expect(tp.getByTestId("analytics-pass-rate")).toHaveText("50%");
  await expectNoHorizontalScroll(tp);
  await shot(tp, "3-analytics-pass-threshold");

  // --- the threshold is locked now: the API says why, the menu does not offer it
  const refused = await api.call("PATCH", `/exams/${draft.exam_id}/pass-threshold`, { pass_threshold_pct: 50 }).then(() => null, (e) => e);
  expect(refused?.status).toBe(409);
  expect(JSON.stringify(refused?.detail)).toContain(LOCKED);
  expect((await api.call("GET", `/exams/${draft.exam_id}`)).pass_threshold_pct).toBe(70);
  await tp.getByRole("button", { name: "Опции экзамена" }).click();
  await expect(tp.getByRole("button", { name: "Изменить название" }).or(tp.getByRole("button", { name: /Создать копию/ })).first()).toBeVisible();
  await expect(tp.getByRole("button", { name: "Изменить порог" })).toHaveCount(0);
  await tp.keyboard.press("Escape");

  // --- close, build the report: the same tile, the same number
  await api.call("POST", `/exams/${draft.exam_id}/close`);
  await api.call("POST", `/exams/${draft.exam_id}/report`);
  await tp.goto(`/teacher/exams/${draft.exam_id}/report`);
  const tile = tp.getByText("Сдали порог (≥70%)", { exact: true });
  await expect(tile).toBeVisible();
  await expect(tile.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]")).toContainText("50%");
  await shot(tp, "4-report-pass-threshold");
  const analytics = await api.call("GET", `/exams/${draft.exam_id}/analytics`);
  const report = await api.call("GET", `/exams/${draft.exam_id}/report`);
  expect(analytics.pass_rate_pct).toBe(50);
  expect(report.pass_rate_pct).toBe(analytics.pass_rate_pct);
  expect(report.pass_threshold_pct).toBe(70);
  const skipped = analytics.task_analytics.find((t: any) => t.task_id === ids[19]);   // skipped by both students: still listed, 0 of 2
  expect(skipped.attempts).toBe(2);
  expect(skipped.correct_rate).toBe(0);
  void anonymous;
});

test("the create form: the threshold field, its hint, its validation, and the exam is created with it @exam @mobile", async ({ signIn }, testInfo) => {
  const shot = (page: import("@playwright/test").Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}-${testInfo.project.name}.png`), fullPage: false });
  const teacher = await org.addStaff("teacher", "Формов");
  await org.createGroup({ name: "Группа Ф1", teacherId: teacher.userId });
  const page = await signIn(teacher);
  await page.goto("/teacher/exams/new");
  await page.getByLabel("Название экзамена").fill("E2E Форма порога");
  await expect(page.getByText(/Экзамен назначен группе «Группа Ф1»/)).toBeVisible();   // the only group is preselected, and its class with it
  await page.getByRole("button", { name: "Далее" }).click();
  // the stub's tree: level 1 is open by itself...
  await page.getByText("Сложение чисел", { exact: true }).click();                      // ...level 2 opens...
  await page.getByRole("checkbox").first().check();                                     // ...its one skill is ticked
  await expect(page.getByText("Выбрано навыков:")).toContainText("1");
  await page.getByRole("button", { name: "Далее" }).click();

  // step 3: the field, 60 by default, with the hint
  const field = page.getByLabel("Проходной порог, %");
  await expect(field).toHaveValue("60");
  await expect(page.getByText("Ученик с результатом не ниже порога считается справившимся")).toBeVisible();
  await shot(page, "7-create-form-threshold");
  const next = page.getByRole("button", { name: "Далее" });
  for (const bad of ["0", "101", "", "abc", "6.5"]) {
    await field.fill(bad);
    await expect(page.getByText("Введите целое число от 1 до 100.")).toBeVisible();
    await expect(next).toBeDisabled();                                                  // never a button that silently does nothing
  }
  await shot(page, "8-create-form-threshold-invalid");
  await field.fill("90");
  await expect(next).toBeEnabled();
  await expectNoHorizontalScroll(page);
  await next.click();
  await page.getByRole("button", { name: "Сгенерировать экзамен" }).click();
  await page.waitForURL(/\/teacher\/exams\/[^/]+\/draft/);
  await expect(page.getByText(/порог 90%/)).toBeVisible();
  const examId = page.url().split("/exams/")[1].split("/")[0];
  expect((await new ExamApi(teacher).call("GET", `/exams/${examId}`)).pass_threshold_pct).toBe(90);
  await shot(page, "9-draft-created-with-threshold");
});

test("library: 150 exams of two teachers, each teacher gets his 75 through «Показать ещё» @exam @mobile", async ({ signIn }, testInfo) => {
  test.setTimeout(240_000);
  const shot = (page: import("@playwright/test").Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}-${testInfo.project.name}.png`), fullPage: false });
  const [one, two] = [await org.addStaff("teacher", "Первов"), await org.addStaff("teacher", "Второв")];
  for (const [teacher, tag] of [[one, "А"], [two, "Б"]] as const) {
    const api = new ExamApi(teacher);
    for (let from = 1; from <= 75; from += 15) {
      await Promise.all(
        Array.from({ length: Math.min(15, 76 - from) }, (_, k) => from + k).map((n) =>
          api.createDraft({ title: `Шаблон ${tag}-${String(n).padStart(3, "0")}`, tasks: 1, skillId: STUB_SKILL20_ID }),
        ),
      );
    }
  }
  for (const [teacher, tag, other] of [[one, "А", "Б"], [two, "Б", "А"]] as const) {
    const page = await signIn(teacher);
    await page.goto("/teacher/exams?status=draft");
    const cards = page.getByRole("link", { name: new RegExp(`Шаблон ${tag}-\\d{3}`) });
    await expect(cards.first()).toBeVisible();
    await expect(cards).toHaveCount(50);                                   // the first page
    await expect(page.getByText("Показано 50 из 75")).toBeVisible();
    await shot(page, `5-library-first-page-${tag === "А" ? "teacher1" : "teacher2"}`);
    await page.getByRole("button", { name: "Показать ещё" }).scrollIntoViewIfNeeded();
    await shot(page, `5b-library-show-more-${tag === "А" ? "teacher1" : "teacher2"}`);
    await page.getByRole("button", { name: "Показать ещё" }).click();
    await expect(cards).toHaveCount(75);                                   // every own exam, nothing silently lost
    await expect(page.getByRole("button", { name: "Показать ещё" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: new RegExp(`Шаблон ${other}-\\d{3}`) })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await shot(page, `6-library-all-75-${tag === "А" ? "teacher1" : "teacher2"}`);
  }
});
