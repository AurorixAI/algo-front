import { test, expect } from "../support/fixtures";
import { Org, runLesson } from "../support/api";
import { addMonthMinusDay, addDays, businessNow, daysBetween, monthEnd } from "../support/time";
import { deadlineWords, dm, toast } from "../support/ui";

/**
 * Owner: «Посещаемость» -> «Пропуски» -> «Ожидают»: an excuse the teacher marked is waiting, with the
 * deadline by which it must be confirmed, in words («Осталось 24 дня», the date small under it; UX-1 B);
 * «Подтвердить» and «Отклонить» sit side by side in the row and both ask for confirmation in a dialog (N13 P4 #103),
 * and the confirmed excuse leaves the pending list.
 *
 * Deadline rule (owner decision 15.10; the oracle below is written from that rule, not from the API):
 *  - paid student: the calendar payment that covers the lesson ends on V; deadline = V - 5 days (default setting);
 *  - nobody paid: the last day of the lesson's month.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Пропуски");
});

test("pending excuse shows its deadline and disappears after «Подтвердить»", async ({ signIn }) => {
  const today = businessNow().date;
  const teacher = await org.addStaff("teacher", "Пропускин");
  const group = await org.createGroup({ name: "Группа П1", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 450000); // the price lives on the group (#105)
  const paid = await org.addStudent(group, "Анвар", "Оплативший");
  const unpaid = await org.addStudent(group, "Мадина", "Безоплатная");
  await org.pay(paid.id, 450000);
  const lesson = await org.createLessonStartingNow(group.id);
  await runLesson(teacher, lesson, {
    records: { [paid.id]: "excused", [unpaid.id]: "excused" },
    reasons: { [paid.id]: "Болел, справка", [unpaid.id]: "Семейные обстоятельства" },
    complete: true,
  });

  const page = await signIn(org.owner);
  // every request that decides an excuse (counted below: asking comes first, and one press sends once)
  const reviewPosts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/attendance\/excuses\/[^/]+\/review$/.test(request.url())) reviewPosts.push(request.url());
  });
  await page.goto("/owner/attendance");
  await expect(page.getByRole("tab", { name: "Ожидают (2)" })).toBeVisible();

  const item = (fullName: string) =>
    page.getByRole("listitem").filter({ has: page.getByRole("link", { name: fullName, exact: true }) });

  // deadlines
  const paidUntil = addMonthMinusDay(today);
  const paidDeadline = addDays(paidUntil, -5);
  await expect(item("Оплативший Анвар")).toContainText(deadlineWords(daysBetween(today, paidDeadline)));
  await expect(item("Оплативший Анвар")).toContainText(`до ${dm(paidDeadline)}`);
  const monthLast = monthEnd(today);
  await expect(item("Безоплатная Мадина")).toContainText(deadlineWords(daysBetween(today, monthLast)));
  await expect(item("Безоплатная Мадина")).toContainText(`до ${dm(monthLast)}`);
  // no abbreviations in the column
  await expect(item("Оплативший Анвар")).not.toContainText("дн.");

  // both decisions are visible in the row, side by side (owner decision 20.10): «Подтвердить» left of «Отклонить»
  const confirmBox = await item("Оплативший Анвар").getByRole("button", { name: "Подтвердить" }).boundingBox();
  const rejectBox = await item("Оплативший Анвар").getByRole("button", { name: "Отклонить" }).boundingBox();
  expect(confirmBox && rejectBox, "both buttons are on the screen").toBeTruthy();
  expect(rejectBox!.x, "«Отклонить» is to the right of «Подтвердить»").toBeGreaterThan(confirmBox!.x);
  expect(Math.abs(rejectBox!.y - confirmBox!.y), "...on the same line").toBeLessThan(2);
  await expect(item("Оплативший Анвар")).toContainText("Болел, справка");
  await expect(item("Оплативший Анвар")).toContainText(`${group.name}`);

  // confirm one: the button only opens the confirmation dialog (student, lesson, reason, consequence); nothing is sent yet.
  // A double click on the row button must not flash the dialog away: its second click lands on the backdrop.
  await item("Оплативший Анвар").getByRole("button", { name: "Подтвердить" }).dblclick();
  const dialog = page.getByRole("dialog", { name: "Подтвердить пропуск?" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(600);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Оплативший Анвар");
  await expect(dialog).toContainText(group.name);
  await expect(dialog).toContainText("Болел, справка");
  await expect(dialog).toContainText("Урок не будет засчитан преподавателю в зарплату.");
  await expect(page.getByRole("tab", { name: "Ожидают (2)" })).toBeVisible();
  const stillPending = await org.owner.api.get("/auth/org/attendance/excuses", { status: "pending" });
  expect(stillPending.items).toHaveLength(2);
  expect(reviewPosts, "nothing is sent before the dialog is confirmed").toHaveLength(0);

  // «Отмена» sends nothing either
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog).toHaveCount(0);
  expect(reviewPosts).toHaveLength(0);

  // confirm for real, with a double click on the dialog's button: ONE request
  await item("Оплативший Анвар").getByRole("button", { name: "Подтвердить" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Подтвердить", exact: true }).dblclick();
  await expect(toast(page, "Пропуск подтверждён")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Ожидают (1)" })).toBeVisible();
  await expect(item("Оплативший Анвар")).toHaveCount(0);
  await expect(item("Безоплатная Мадина")).toHaveCount(1);

  // «Отклонить» of the other row asks first too (the same dialog, an optional reason); «Отмена» sends nothing
  await item("Безоплатная Мадина").getByRole("button", { name: "Отклонить" }).click();
  const rejectDialog = page.getByRole("dialog", { name: "Отклонить пропуск?" });
  await expect(rejectDialog).toBeVisible();
  await expect(rejectDialog).toContainText("Безоплатная Мадина");
  await expect(rejectDialog).toContainText("Пропуск останется неуважительным: урок засчитывается преподавателю как обычный урок.");
  await rejectDialog.getByRole("button", { name: "Отмена" }).click();
  await expect(rejectDialog).toHaveCount(0);
  await expect(item("Безоплатная Мадина")).toHaveCount(1);

  // it moved to «Подтверждено», signed by the owner
  await page.getByRole("tab", { name: /Подтверждено/ }).click();
  await expect(item("Оплативший Анвар")).toContainText(`Подтвердил: ${org.ownerName}`);
  await expect(item("Безоплатная Мадина")).toHaveCount(0);

  expect(reviewPosts, "a double click on the confirm button sent exactly one request").toHaveLength(1);

  // and the API agrees
  const confirmed = await org.owner.api.get("/auth/org/attendance/excuses", { status: "confirmed" });
  expect(confirmed.items.map((x: any) => x.student.id)).toContain(paid.id);
  const pending = await org.owner.api.get("/auth/org/attendance/excuses", { status: "pending" });
  expect(pending.items.map((x: any) => x.student.id)).toEqual([unpaid.id]);
});
