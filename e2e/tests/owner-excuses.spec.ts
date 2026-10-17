import { test, expect } from "../support/fixtures";
import { Org, runLesson } from "../support/api";
import { addMonthMinusDay, addDays, businessNow, daysBetween, monthEnd } from "../support/time";
import { dm, toast } from "../support/ui";

/**
 * Owner: «Посещаемость» -> «Пропуски» -> «Ожидают»: an excuse the teacher marked is waiting, with the
 * deadline by which it must be confirmed; «Подтвердить» asks for confirmation in a dialog (N13 P4 #103),
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
  await page.goto("/owner/attendance");
  await expect(page.getByRole("tab", { name: "Ожидают (2)" })).toBeVisible();

  const item = (fullName: string) =>
    page.getByRole("listitem").filter({ has: page.getByRole("link", { name: fullName, exact: true }) });

  // deadlines
  const paidUntil = addMonthMinusDay(today);
  const paidDeadline = addDays(paidUntil, -5);
  await expect(item("Оплативший Анвар")).toContainText(`до ${dm(paidDeadline)} · ${daysBetween(today, paidDeadline)} дн.`);
  const monthLast = monthEnd(today);
  await expect(item("Безоплатная Мадина")).toContainText(`до ${dm(monthLast)} · ${daysBetween(today, monthLast)} дн.`);
  await expect(item("Оплативший Анвар")).toContainText("Болел, справка");
  await expect(item("Оплативший Анвар")).toContainText(`${group.name}`);

  // confirm one: the button only opens the confirmation dialog (student, lesson, reason, consequence); nothing is sent yet
  await item("Оплативший Анвар").getByRole("button", { name: "Подтвердить" }).click();
  const dialog = page.getByRole("dialog", { name: "Подтвердить пропуск?" });
  await expect(dialog).toContainText("Оплативший Анвар");
  await expect(dialog).toContainText(group.name);
  await expect(dialog).toContainText("Болел, справка");
  await expect(dialog).toContainText("Урок не будет засчитан преподавателю в зарплату (уважительная причина).");
  await expect(page.getByRole("tab", { name: "Ожидают (2)" })).toBeVisible();
  const stillPending = await org.owner.api.get("/auth/org/attendance/excuses", { status: "pending" });
  expect(stillPending.items).toHaveLength(2);
  await dialog.getByRole("button", { name: "Подтвердить", exact: true }).click();
  await expect(toast(page, "Пропуск подтверждён")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Ожидают (1)" })).toBeVisible();
  await expect(item("Оплативший Анвар")).toHaveCount(0);
  await expect(item("Безоплатная Мадина")).toHaveCount(1);

  // it moved to «Подтверждено», signed by the owner
  await page.getByRole("tab", { name: /Подтверждено/ }).click();
  await expect(item("Оплативший Анвар")).toContainText(`Подтвердил: ${org.ownerName}`);
  await expect(item("Безоплатная Мадина")).toHaveCount(0);

  // and the API agrees
  const confirmed = await org.owner.api.get("/auth/org/attendance/excuses", { status: "confirmed" });
  expect(confirmed.items.map((x: any) => x.student.id)).toContain(paid.id);
  const pending = await org.owner.api.get("/auth/org/attendance/excuses", { status: "pending" });
  expect(pending.items.map((x: any) => x.student.id)).toEqual([unpaid.id]);
});
