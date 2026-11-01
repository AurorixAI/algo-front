import { test, expect } from "../support/fixtures";
import { Org, startLesson } from "../support/api";
import { ExamApi, STUB_ANSWERS, StudentAttempt } from "../support/exam";
import { expectNoHorizontalScroll } from "../support/ui";

/**
 * Online exam in a live lesson (needs E2E_EXAM=1: exam-service + the content stub).
 *   teacher: draft exam -> «Назначить занятие» (the started lesson) -> «Назначить и открыть лобби» -> code
 *   student: /e/{code} in ANOTHER browser context -> name + ID -> lobby
 *   teacher: sees him in the lobby -> «Начать экзамен»
 *   student: answers with the two-step selection (first tap marks, second tap confirms) -> «Завершить»
 *   teacher: «Работа сдана», 2/3, 67 %
 * The student answers question 2 wrongly on purpose: the score must follow the answers, not just "submitted".
 */
test.describe.configure({ mode: "serial" });

let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Экзамен");
});

test("assign to a started lesson -> student joins by code -> teacher starts -> two-step answers -> «Работа сдана» @exam @mobile", async ({ signIn, anonymous, hasTouch }) => {
  const teacher = await org.addStaff("teacher", "Экзаменов");
  const group = await org.createGroup({ name: "Группа Э1", teacherId: teacher.userId });
  const student = await org.addStudent(group, "Анвар", "Сдающий");
  const lesson = await org.createLessonStartingNow(group.id, teacher, 45);
  await startLesson(teacher, lesson);
  const draft = await new ExamApi(teacher).createDraft({ title: "E2E Контрольная", groupId: group.id, tasks: 3 });

  // --- teacher: assign the draft to the started lesson, the lobby opens
  const tp = await signIn(teacher);
  await tp.goto(`/teacher/exams/${draft.exam_id}/draft`);
  await tp.getByRole("button", { name: "Назначить занятие" }).click();
  const dialog = tp.getByRole("dialog", { name: "Назначить экзамен на занятие" });
  await expect(dialog.getByRole("button", { name: group.name })).toBeVisible(); // the draft's group is preselected
  const submit = dialog.getByRole("button", { name: "Назначить и открыть лобби" });
  await expect(submit).toBeDisabled(); // no lesson chosen yet
  await dialog.getByRole("button", { name: new RegExp(`${lesson.startTime}–${lesson.endTime}`) }).first().click();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(tp.getByRole("heading", { name: "Экзамен опубликован!" })).toBeVisible();
  const link = await tp.getByRole("button", { name: /\/e\// }).first().textContent();
  const code = link!.split("/e/")[1].trim();
  expect(code).toMatch(/^[A-Z0-9]{6,}$/);
  await expectNoHorizontalScroll(tp);

  // --- student, another browser: a wrong ID does not get in, the right one waits in the lobby
  const sp = await anonymous();
  await sp.goto(`/e/${code}`);
  await expect(sp.getByRole("heading", { name: "E2E Контрольная", level: 1 })).toBeVisible();
  await expect(sp.getByText(`«${group.name}»`)).toBeVisible();
  const nameField = sp.getByLabel("Имя и фамилия");
  const idField = sp.getByLabel("ID ученика");
  const join = sp.getByRole("button", { name: "Присоединиться к лобби" });
  await expect(join).toBeDisabled();
  await nameField.fill("Посторонний Человек");
  await idField.fill("ZZ-999");
  await join.click();
  await expect(sp.getByRole("heading", { name: "Вы в комнате ожидания" })).toHaveCount(0);
  await expect(join).toBeVisible(); // still on the entry form

  await nameField.fill("Сдающий Анвар");
  await idField.fill(student.displayId!);
  await join.click();
  await expect(sp.getByRole("heading", { name: "Вы в комнате ожидания" })).toBeVisible();
  await expect(sp.getByText(`ID: ${student.displayId}`)).toBeVisible();
  await expect(sp.getByText("Ожидание синхронного старта...")).toBeVisible();

  // --- teacher: he is in the lobby; start for everybody
  await tp.goto(`/teacher/exams/${draft.exam_id}`);
  await expect(tp.getByRole("heading", { name: "Ученики в комнате ожидания" })).toBeVisible();
  await expect(tp.getByText("Сдающий Анвар")).toBeVisible();
  await expect(tp.getByText(/В ожидании старта/)).toBeVisible();
  await tp.getByRole("button", { name: "Начать экзамен" }).click();
  await expect(tp.getByText(/Идёт экзамен/)).toBeVisible();

  // --- student: the questions open by themselves; two taps per answer, question 2 is answered wrongly
  const progress = sp.getByText(/Вопрос \d\/3/);
  await expect(progress).toBeVisible({ timeout: 20_000 });
  const tap = async (locator: ReturnType<typeof sp.getByRole>) => (hasTouch ? locator.tap() : locator.click());
  for (let n = 1; n <= 3; n++) {
    await expect(progress).toContainText(`Вопрос ${n}/3`);
    const question = (await sp.getByText(/Найдите сумму чисел/).first().textContent())!.trim();
    const right = STUB_ANSWERS[question];
    expect(right, `known question: ${question}`).toBeTruthy();
    // the options are shuffled per student: find them by their text, never by position
    const option =
      n === 2
        ? sp.getByRole("button", { name: new RegExp(`^Вариант [A-D]: (?!${right}(?: \\(|$))`) }).first()
        : sp.getByRole("button", { name: new RegExp(`^Вариант [A-D]: ${right}(?: \\(|$)`) });
    await tap(option);
    await expect(option).toHaveAttribute("aria-pressed", "mixed"); // first tap: only marked
    await expect(option).toHaveAccessibleName(/отмечен, нажмите ещё раз, чтобы подтвердить/);
    if (n > 1) await expect(progress).toContainText(`Вопрос ${n}/3`); // a mark alone never advances
    await tap(option);
    if (n < 3) await expect(progress).toContainText(`Вопрос ${n + 1}/3`); // second tap: confirmed, next question
    else await expect(sp.getByRole("button", { name: /Вариант [A-D]: \d+/, pressed: true })).toHaveCount(1);
  }
  await expectNoHorizontalScroll(sp);
  await sp.getByRole("button", { name: "Завершить" }).click();
  await expect(sp.getByRole("heading", { name: "Спасибо за прохождение!" })).toBeVisible();

  // --- teacher: «Работа сдана», 2 of 3, 67 %
  await tp.goto(`/teacher/exams/${draft.exam_id}/sessions`);
  const row = tp.getByRole("row", { name: /Сдающий Анвар/ });
  await expect(row).toContainText("2/3");
  await expect(row).toContainText("67%");
  await expect(row.getByRole("cell", { name: "Работа сдана" })).toBeVisible();
  await expect(tp.getByText("Сдали").locator("xpath=following-sibling::p[1]")).toHaveText("1");
});

// (appended) «Завершить досрочно» is on the live block of the exam page, behind a dialog of the page
test("finish early: the dialog asks, «Отмена» changes nothing, «Завершить» ends the exam for everybody @exam", async ({ signIn }) => {
  const org2 = await Org.create("Досрочно");
  const teacher = await org2.addStaff("teacher", "Досрочев");
  const group = await org2.createGroup({ name: "Группа Д1", teacherId: teacher.userId });
  const student = await org2.addStudent(group, "Ученик", "Пишущий");
  const lesson = await org2.createLessonStartingNow(group.id, teacher, 45);
  await startLesson(teacher, lesson);
  const api = new ExamApi(teacher);
  const draft = await api.createDraft({ title: "E2E Досрочно", groupId: group.id, tasks: 2 });
  const published = await api.call<{ access_code: string }>("POST", `/exams/${draft.exam_id}/assign`, {
    group_id: group.id, publish: true, lesson_id: lesson.id, lesson_date: lesson.date,
  });
  await new StudentAttempt(published.access_code).join(`${student.lastName} ${student.firstName}`, student.displayId!);
  const tp = await signIn(teacher);
  await tp.goto(`/teacher/exams/${draft.exam_id}`);
  const block = tp.getByTestId("exam-live-block");
  await block.getByRole("button", { name: "Начать экзамен" }).click();                  // the start is in the live block
  await expect(block.getByText("Осталось")).toBeVisible();
  tp.once("dialog", () => { throw new Error("a native dialog was opened"); });
  await expect(block.getByRole("button", { name: "Завершить досрочно" })).toHaveCount(0);   // it is in «⋯» now
  await block.getByRole("button", { name: "Опции экзамена" }).click();
  await tp.locator("#exam-actions-menu").getByRole("button", { name: "Завершить досрочно" }).click();
  const dialog = tp.getByRole("dialog", { name: "Завершить досрочно" });
  await expect(dialog.getByText("Ученики ещё пишут. Завершить экзамен для всех?")).toBeVisible();
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog).toHaveCount(0);
  expect((await api.call<any>("GET", `/exams/${draft.exam_id}`)).status).toBe("active");
  await block.getByRole("button", { name: "Опции экзамена" }).click();
  await tp.locator("#exam-actions-menu").getByRole("button", { name: "Завершить досрочно" }).click();
  await tp.getByRole("dialog", { name: "Завершить досрочно" }).getByRole("button", { name: "Завершить", exact: true }).click();
  await expect(block.getByText("Экзамен завершён")).toBeVisible();
  expect((await api.call<any>("GET", `/exams/${draft.exam_id}`)).status).toBe("closed");
});
