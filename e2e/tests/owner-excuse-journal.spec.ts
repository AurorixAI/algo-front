import { test, expect } from "../support/fixtures";
import { Org, runLesson } from "../support/api";

/**
 * Owner: the group journal (cell menu) asks before it decides an excused absence, exactly like «Посещаемость» → «Пропуски»
 * (N13 P4 #103): «Отклонить» opens the confirmation dialog (student, lesson with the group, reason, consequence); the
 * optional note of a refusal is sent with the decision and shows on the excuse; one press sends one request; the focus
 * returns to the cell that asked.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Журнал пропусков");
});

test("journal: «Отклонить» asks first, sends the note once, and the note is visible on the excuse", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Журналов");
  const group = await org.createGroup({ name: "Группа Ж1", teacherId: teacher.userId });
  const student = await org.addStudent(group, "Дилшод", "Отклонённый", 450000);
  const lesson = await org.createLessonStartingNow(group.id);
  await runLesson(teacher, lesson, {
    records: { [student.id]: "excused" },
    reasons: { [student.id]: "Болел, справка" },
    complete: true,
  });

  const page = await signIn(org.owner);
  const reviewPosts: Array<{ url: string; body: string | null }> = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/attendance\/excuses\/[^/]+\/review$/.test(request.url())) {
      reviewPosts.push({ url: request.url(), body: request.postData() });
    }
  });

  await page.goto(`/owner/groups/${group.id}?tab=attendance`);
  const row = page.getByRole("row").filter({ hasText: "Отклонённый Дилшод" });
  const cell = row.getByRole("button", { name: "Ув.?" });
  await cell.click();
  await page.getByRole("menuitem", { name: "Отклонить" }).click();

  // the dialog names the student, the lesson (date + group), the reason and what the refusal changes; nothing is sent yet
  const dialog = page.getByRole("dialog", { name: "Отклонить пропуск?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Отклонённый Дилшод");
  await expect(dialog).toContainText(group.name);
  await expect(dialog).toContainText("Болел, справка");
  await expect(dialog).toContainText("Пропуск останется неуважительным: урок засчитывается преподавателю как обычный урок.");
  expect(reviewPosts, "nothing is sent before the dialog is confirmed").toHaveLength(0);

  // the note, then a double click on the button: ONE request carrying the decision and the note
  const note = "Справка не принесена";
  await dialog.getByLabel("Причина отказа (необязательно)").fill(note);
  await dialog.getByRole("button", { name: "Отклонить", exact: true }).dblclick();
  const rejected = row.getByRole("button", { name: "Ув. ✗" });
  await expect(rejected).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(reviewPosts, "a double click sent exactly one request").toHaveLength(1);
  expect(JSON.parse(reviewPosts[0].body || "{}")).toEqual({ decision: "rejected", note });

  // the focus is back on the cell that asked
  await expect(rejected).toBeFocused();

  // the note is on the excuse: in the cell's menu, in the «Отклонено» list and in the API
  await rejected.click();
  await expect(page.getByRole("menu")).toContainText(`Примечание: ${note}`);
  const rejectedList = await org.owner.api.get("/auth/org/attendance/excuses", { status: "rejected" });
  const saved = rejectedList.items.find((x: any) => x.student.id === student.id);
  expect(saved?.review_note).toBe(note);
  await page.goto("/owner/attendance");
  await page.getByRole("tab", { name: "Отклонено" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Отклонённый Дилшод" })).toContainText(`«${note}»`);
});
