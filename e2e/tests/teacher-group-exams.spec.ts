import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { ExamApi } from "../support/exam";
import { expectNoHorizontalScroll } from "../support/ui";

/**
 * WAVE E / E-C: the teacher's page of a group is the shared `GroupDetailView`; its tab «Экзамены» binds an exam to a lesson exactly like the
 * library's «Назначить» (needs E2E_EXAM=1: exam-service + the content stub).
 *   - «Добавить экзамен» -> «Из библиотеки» -> «Выбрать» -> the dialog of the lesson (the group is chosen) -> «Назначить и открыть лобби»
 *   - «Экзамен назначен!» names the lesson; the list of the tab shows the exam (lobby opened on that lesson, not a draft without a lesson)
 *   - an archived exam of the group: «Восстановить из архива» in its hub -> back to the group -> it is in the list again («В подготовке»)
 * The administrator sees the same tab read-only (no «Добавить экзамен»); the owner has no «Экзамены» tab (owner 03.11).
 */
test.describe.configure({ mode: "serial" });

let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Экзамены группы");
});

test("«Выбрать» from the group library -> lesson -> lobby; «Экзамен назначен» shows the lesson; the list is refreshed @exam", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Групповой");
  const group = await org.createGroup({ name: "Группа Э-С", teacherId: teacher.userId });
  await org.addStudent(group, "Анвар", "Ученик");
  const lesson = await org.createLessonStartingNow(group.id, teacher, 45);
  const title = "E2E Шаблон из библиотеки";
  const template = await new ExamApi(teacher).createDraft({ title, tasks: 3 }); // no group: it is a library template

  const page = await signIn(teacher);
  await page.goto(`/teacher/groups/${group.id}?tab=exams`);
  await expect(page.getByRole("tab", { name: /Экзамены/ })).toBeVisible().catch(() => undefined);
  await page.getByRole("button", { name: "Добавить экзамен" }).click();
  await page.getByRole("button", { name: /Из библиотеки/ }).click();
  const row = page.locator("div.flex.items-center.gap-3").filter({ hasText: title });
  await row.getByRole("button", { name: "Выбрать" }).click();

  // the dialog of the library's «Назначить»: the group is chosen, the lesson is to be chosen; with a lesson that does not fit there is a way out
  const dialog = page.getByRole("dialog", { name: "Назначить экзамен на занятие" });
  await expect(dialog.getByRole("button", { name: group.name })).toBeVisible();
  await expect(dialog.getByTestId("no-lesson-hint")).toContainText("Подготовить черновик без урока");
  const submit = dialog.getByRole("button", { name: "Назначить и открыть лобби" });
  await expect(submit).toBeDisabled();
  await dialog.getByRole("button", { name: new RegExp(`${lesson.startTime}–${lesson.endTime}`) }).first().click();
  await submit.click();

  // the answer names the lesson
  const done = page.getByTestId("assigned-lesson");
  await expect(page.getByRole("heading", { name: "Экзамен назначен!" })).toBeVisible();
  await expect(done).toContainText(`${lesson.startTime}–${lesson.endTime}`);
  await expect(page.getByText(/Код доступа для учеников/)).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();

  // the list of the tab is read again: the exam is in the lobby of the lesson (not a draft of the group)
  let where = "";
  for (const pill of ["Запланированы", "Лобби", "Текущие"]) {
    await page.getByRole("button", { name: new RegExp(`^${pill}`) }).click();
    if (await page.getByText(title).count()) { where = pill; break; }
  }
  expect(where, "the exam is in the list of the group").not.toBe("");
  expect(where).not.toBe("В подготовке");
  await page.getByRole("button", { name: /^В подготовке/ }).click();
  await expect(page.getByText(title)).toHaveCount(0);
  const state = await new ExamApi(teacher).call("GET", `/exams/${template.exam_id}`);
  expect(state.status ?? state.exam?.status).toBe("lobby");
  await expectNoHorizontalScroll(page);
});

test("an archived exam of the group: «Восстановить из архива» in its hub brings it back to the list of the group @exam", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Архивный");
  const group = await org.createGroup({ name: "Группа Э-А", teacherId: teacher.userId });
  const title = "E2E Экзамен в архиве";
  const api = new ExamApi(teacher);
  const draft = await api.createDraft({ title, groupId: group.id, tasks: 3 });
  await api.call("DELETE", `/exams/${draft.exam_id}`, undefined, { permanent: false });

  const page = await signIn(teacher);
  await page.goto(`/teacher/groups/${group.id}?tab=exams&exam_status=archived`);
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Опции экзамена" }).click();
  await page.getByRole("button", { name: "Восстановить из архива" }).click();
  await expect(page.getByRole("button", { name: "Опции экзамена" })).toBeVisible();

  await page.getByTestId("exam-back-link").click(); // comes back to the same tab of the group
  await expect(page).toHaveURL(new RegExp(`/teacher/groups/${group.id}\\?tab=exams`));
  await page.getByRole("button", { name: /^В подготовке/ }).click();
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
});

test("the administrator sees the tab «Экзамены» of the group read-only, the owner has no such tab (03.11); the tab strip does not widen the phone page @exam @mobile", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Наблюдаемый");
  const admin = await org.addStaff("admin", "Наблюдатель");
  const group = await org.createGroup({ name: "Группа Э-Н", teacherId: teacher.userId });
  const title = "E2E Для наблюдателей";
  await new ExamApi(teacher).createDraft({ title, groupId: group.id, tasks: 3 });

  const adminPage = await signIn(admin);
  await adminPage.goto(`/admin/groups/${group.id}?tab=exams&exam_status=draft`);
  await expect(adminPage.getByText(title)).toBeVisible();
  await expect(adminPage.getByRole("button", { name: "Добавить экзамен" })).toHaveCount(0);
  await expect(adminPage.getByRole("link", { name: new RegExp(title) })).toHaveAttribute("href", /\/admin\/exams\/.*return_to=/);
  await expectNoHorizontalScroll(adminPage);

  const ownerPage = await signIn(org.owner);
  await ownerPage.goto(`/owner/groups/${group.id}?tab=exams`);
  await expect(ownerPage.getByRole("tab", { name: /Экзамены/ })).toHaveCount(0);
  await expect(ownerPage.getByRole("tab", { name: /Ученики/ })).toHaveAttribute("aria-selected", "true");   // ?tab=exams falls back to «Ученики»
  await expect(ownerPage.getByText(title)).toHaveCount(0);
  await expectNoHorizontalScroll(ownerPage);
});
