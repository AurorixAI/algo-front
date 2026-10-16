import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { businessNow } from "../support/time";
import { dmy, toast } from "../support/ui";

/**
 * Owner: student card «⋯» -> «В архив». The student leaves the group roster and the payments lists, shows up under
 * «Архив» (with the reason and the groups he was in), and «Вернуть из архива» puts him back into the group - the
 * history of his payments untouched.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Архив");
});

test("archive: gone from the roster and payments -> «Архив» tab -> restore -> back in the group", async ({ signIn }) => {
  const today = businessNow().date;
  const teacher = await org.addStaff("teacher", "Архивов");
  const group = await org.createGroup({ name: "Группа А1", teacherId: teacher.userId });
  const leaver = await org.addStudent(group, "Анвар", "Уходящий", 450000);
  const stayer = await org.addStudent(group, "Мадина", "Остающаяся", 450000);
  await org.pay(leaver.id, 450000);
  await org.pay(stayer.id, 450000);

  const page = await signIn(org.owner);
  const roster = () => page.getByRole("table").getByRole("row");
  const paymentRow = (name: string) => page.getByRole("listitem").filter({ has: page.getByRole("link", { name, exact: true }) });

  // before: both are in the roster and under «Оплачено»
  await page.goto(`/owner/groups/${group.id}`);
  await expect(page.getByText(/Состав группы\s*\(2\)/)).toBeVisible();
  await expect(roster().filter({ hasText: "Уходящий Анвар" })).toHaveCount(1);
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: "Оплачено" }).click();
  await expect(paymentRow("Уходящий Анвар")).toHaveCount(1);

  // --- archive from the student card
  await page.goto(`/owner/students/${leaver.id}`);
  await page.getByRole("button", { name: /Действия/ }).first().click();
  await page.getByRole("menuitem", { name: "В архив" }).click();
  const dialog = page.getByRole("dialog", { name: "Ученик ушёл из центра?" });
  await expect(dialog).toContainText(group.name); // tells which group he is taken out of
  await dialog.getByLabel(/Причина/).fill("Переехал в другой город");
  await dialog.getByRole("button", { name: "В архив" }).click();
  const banner = page.getByRole("status").filter({ hasText: /В архиве с/ });
  await expect(banner).toContainText(`В архиве с ${dmy(today)}`);
  await expect(banner).toContainText("Причина: Переехал в другой город");
  await expect(banner).toContainText("История уроков, оплат и квитанций сохранена");

  // --- gone from the group roster and from payments
  await page.goto(`/owner/groups/${group.id}`);
  await expect(page.getByText(/Состав группы\s*\(1\)/)).toBeVisible();
  await expect(roster().filter({ hasText: "Уходящий Анвар" })).toHaveCount(0);
  await expect(roster().filter({ hasText: "Остающаяся Мадина" })).toHaveCount(1);
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: "Оплачено" }).click();
  await expect(paymentRow("Остающаяся Мадина")).toHaveCount(1);
  await expect(paymentRow("Уходящий Анвар")).toHaveCount(0);

  // --- the «Архив» tab of the student list
  await page.goto("/owner/students");
  await expect(page.getByRole("tab", { name: "Архив (1)" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "В группах (1)" })).toBeVisible();
  await page.getByRole("tab", { name: "Архив (1)" }).click();
  const archivedRow = page.getByRole("row").filter({ hasText: "Уходящий Анвар" });
  await expect(archivedRow).toContainText("В архиве");
  await expect(archivedRow).toContainText(leaver.displayId!);

  // --- restore
  await archivedRow.getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`/owner/students/${leaver.id}`));
  await page.getByRole("button", { name: "Вернуть из архива" }).click();
  const restore = page.getByRole("dialog", { name: "Вернуть из архива?" });
  await expect(restore.getByRole("checkbox", { name: group.name })).toBeChecked();
  await restore.getByRole("button", { name: "Вернуть", exact: true }).click();
  await expect(toast(page, "Ученик возвращён из архива")).toBeVisible();

  // --- back in the group, with his payment history intact
  await page.goto(`/owner/groups/${group.id}`);
  await expect(page.getByText(/Состав группы\s*\(2\)/)).toBeVisible();
  await expect(roster().filter({ hasText: "Уходящий Анвар" })).toHaveCount(1);
  await page.goto(`/owner/students/${leaver.id}`);
  await page.getByRole("tab", { name: "Оплаты" }).click();
  await page.getByRole("button", { name: "История оплат" }).click();
  await expect(page.getByText(/№\s*\d+/)).toBeVisible();
  const membership = await org.membershipId(leaver.id);
  const payments = await org.owner.api.get(`/auth/org/memberships/${membership}/payments`);
  expect(payments).toHaveLength(1);
  expect(payments[0].voided_at).toBeFalsy();
  const students = await org.owner.api.get("/auth/org/students", { status: "archived" });
  expect(students).toHaveLength(0);
});
