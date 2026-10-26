import { test, expect } from "../support/fixtures";
import { ApiError, Org, clockReaches, runLesson } from "../support/api";
import { businessNow, payrollLine } from "../support/time";
import { groupedDigits, lessonMenuItem } from "../support/ui";

/**
 * LOGIC-B2, the chain of a substitution: the teacher says «Не смогу провести» on a lesson that has not begun -> the
 * administrator (here the owner) sees the request in «Замены» and assigns a colleague -> the colleague holds THAT lesson
 * only: he marks the attendance of it, every other lesson of the teacher is closed to him (403), and the teacher who
 * asked can no longer save its marks -> the payroll of the month counts the lesson for the substitute, not for the teacher.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Замена");
});

const statusOf = async (call: Promise<unknown>): Promise<number> => {
  try {
    await call;
    return 200;
  } catch (e) {
    if (e instanceof ApiError) return e.status;
    throw e;
  }
};

test("«Не смогу провести» -> admin assigns a colleague -> the substitute marks only that lesson -> payroll counts it for him", async ({ signIn }) => {
  test.setTimeout(300_000);
  const month = businessNow().date.slice(0, 7);
  const asker = await org.addStaff("teacher", "Просящий");
  const substitute = await org.addStaff("teacher", "Заменяющий");
  const group = await org.createGroup({ name: "Группа З1", teacherId: asker.userId });
  const other = await org.createGroup({ name: "Группа З2", teacherId: asker.userId });
  await org.setGroupPrice(group.id, 600000);
  await org.setGroupPrice(other.id, 600000);
  await org.setPayrollRate(asker.userId, { group: "50" });
  await org.setPayrollRate(substitute.userId, { group: "50" });
  const pupil = await org.addStudent(group, "Анвар", "Ученик");
  const otherPupil = await org.addStudent(other, "Мадина", "Другая");
  await org.pay(pupil.id, 600000);
  await org.pay(otherPupil.id, 600000);

  // the lesson to be replaced starts in a few minutes (a request is possible until it starts); another lesson of the same teacher starts now
  const lesson = await org.createLessonStartingNow(group.id, org.owner, 5, 3);
  const elsewhere = await org.createLessonStartingNow(other.id, org.owner, 1);

  // --- 1. the teacher: «Не смогу провести» on the lesson panel
  const teacherPage = await signIn(asker);
  await teacherPage.goto("/teacher/schedule");
  await teacherPage.getByText(group.name, { exact: true }).first().click();
  await lessonMenuItem(teacherPage, /Не смогу провести/);
  const request = teacherPage.getByRole("dialog", { name: "Не смогу провести урок" });
  await request.getByText("Болезнь", { exact: true }).click();
  await request.getByRole("textbox", { name: /Комментарий/ }).fill("Температура");
  await request.getByRole("button", { name: "Отправить запрос" }).click();
  await expect(teacherPage.getByText("Вы запросили замену").first()).toBeVisible();

  // --- 2. the owner: «Замены» -> «Решить» -> «Назначить замену» -> the colleague
  const ownerPage = await signIn(org.owner);
  await ownerPage.goto("/owner/substitutions");
  const row = ownerPage.getByRole("listitem").filter({ hasText: group.name });
  await expect(row).toContainText("Болезнь");
  await expect(row).toContainText("Температура");
  await row.getByRole("button", { name: /^Решить/ }).click();
  const decision = ownerPage.getByRole("dialog");
  await expect(decision).toContainText("не сможет провести урок");
  await decision.getByRole("radio", { name: /Ким У\.|Заменяющий/ }).first().click();
  await decision.getByRole("button", { name: "Назначить замену" }).click();
  await expect(ownerPage.getByRole("dialog")).toHaveCount(0);
  await ownerPage.getByRole("tab", { name: /Решённые/ }).click();
  await expect(ownerPage.getByRole("listitem").filter({ hasText: group.name })).toContainText(/Просящий У\. → Заменяющий У\./); // P1.2: the journal says «кто → кто» (it said «Замена: …»)

  // --- 3. the substitute holds this lesson only (his schedule shows it as a substitution)
  const substitutePage = await signIn(substitute);
  await substitutePage.goto("/teacher/schedule");
  await expect(substitutePage.getByText(group.name).first()).toBeVisible();
  await expect(await statusOf(substitute.api.post(`/auth/org/groups/${other.id}/attendance/start`, { lessonDate: elsewhere.date, lessonId: elsewhere.id }))).toBe(403);
  await expect(await statusOf(substitute.api.get(`/auth/org/groups/${other.id}/attendance`, { month }))).toBe(403);

  await clockReaches(lesson.startMinutes!, 240);
  await runLesson(substitute, lesson, { records: { [pupil.id]: "present" }, complete: true });
  const journal = await substitute.api.get(`/auth/org/groups/${group.id}/attendance`, { month });
  const key = Object.keys(journal.records).find((k) => k.includes(lesson.id))!;
  expect(journal.records[key]).toEqual({ [pupil.id]: "present" });

  // the teacher who asked can read, not write: his marks of this lesson are refused
  expect(
    await statusOf(asker.api.post(`/auth/org/groups/${group.id}/attendance`, { lessonDate: lesson.date, lessonId: lesson.id, status: "completed", records: { [pupil.id]: "absent" } })),
  ).toBe(403);
  // and his own lesson elsewhere is still his
  await runLesson(asker, elsewhere, { records: { [otherPupil.id]: "present" }, complete: true });

  // --- 4. the payroll of the month: the lesson is counted for the substitute (50 % of 600 000 / 12), the asker has only his own
  await ownerPage.goto(`/owner/payroll?month=${month}`);
  await ownerPage.getByRole("button", { name: "Рассчитать всех" }).click();
  const preview = ownerPage.getByRole("region", { name: "Предпросмотр расчёта" });
  await expect(preview).toBeVisible();
  const own = payrollLine(600000, "50", 1);
  await preview.getByRole("tab", { name: /Заменяющий/ }).click();
  await expect(preview.getByTestId("payroll-total")).toContainText(groupedDigits(own));
  await expect(preview.getByRole("row", { name: /Ученик Анвар/ })).toContainText(`${groupedDigits(own)} сум`);
  await preview.getByRole("tab", { name: /Просящий/ }).click();
  await expect(preview.getByTestId("payroll-total")).toContainText(groupedDigits(own));
  await expect(preview.getByRole("row", { name: /Другая Мадина/ })).toBeVisible();
  await expect(preview.getByRole("row", { name: /Ученик Анвар/ })).toHaveCount(0); // the replaced lesson is not his
});
