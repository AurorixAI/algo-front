import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";

/**
 * Who sees money. Owner: always. Admin: only after the owner switched «Администратор может вносить оплаты» on
 * (then «Оплаты» appears in the menu and as a tab of the student card, and still no «Зарплата»). Teacher: never -
 * a direct link to an owner page sends him back to his own dashboard, and his student card has no «Оплаты» tab.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Права");
});

test("admin without the payments right sees no «Оплаты» (menu, tab, page); with the right - yes, still no payroll", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Правилов");
  const admin = await org.addStaff("admin", "Админов");
  const group = await org.createGroup({ name: "Группа Р1", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 100000); // the price lives on the group (#105)
  const student = await org.addStudent(group, "Анвар", "Закрытый");
  await org.setPaymentSettings({ admin_can_manage: false });

  const adminPage = await signIn(admin);
  await adminPage.goto("/admin/students");
  const menu = adminPage.getByRole("navigation").first();
  await expect(menu.getByRole("link", { name: "Ученики" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Оплаты" })).toHaveCount(0);

  await adminPage.goto(`/admin/students/${student.id}`);
  await expect(adminPage.getByRole("tab", { name: "Обучение" })).toBeVisible();
  await expect(adminPage.getByRole("tab", { name: "Оплаты" })).toHaveCount(0);

  await adminPage.goto("/admin/payments");
  await expect(adminPage.getByText("Раздел «Оплаты» недоступен")).toBeVisible();
  await expect(adminPage.getByText("Доступ даёт владелец центра в настройках.")).toBeVisible();

  // the server says the same (not only the menu hides it)
  await expect(admin.api.get("/auth/org/payments/summary")).rejects.toMatchObject({ status: 403 });
  // #105: no price of the group either - the block is not on the page and the server sends no `price_current`
  await adminPage.goto(`/admin/groups/${group.id}`);
  await expect(adminPage.getByRole("heading", { name: group.name }).first()).toBeVisible();
  await expect(adminPage.getByRole("region", { name: "Цена группы" })).toHaveCount(0);
  await expect(admin.api.get(`/auth/org/groups/${group.id}/prices`)).rejects.toMatchObject({ status: 403 });
  expect(await admin.api.get(`/auth/org/groups/${group.id}`)).not.toHaveProperty("price_current");

  // --- the owner switches the right on in the settings
  const owner = await signIn(org.owner);
  await owner.goto("/owner/settings?section=payments");
  const section = owner.getByRole("region", { name: "Оплаты" });
  const toggle = section.getByRole("switch", { name: "Администратор может вносить оплаты" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await section.getByRole("button", { name: "Сохранить" }).click();
  await expect(section.getByRole("button", { name: "Сохранено" })).toBeVisible();
  expect((await org.owner.api.get("/auth/org/settings/payments")).admin_can_manage).toBe(true);

  // --- now the admin has it
  await adminPage.goto("/admin/students");
  await expect(adminPage.getByRole("navigation").first().getByRole("link", { name: "Оплаты" })).toBeVisible();
  await adminPage.goto(`/admin/students/${student.id}`);
  await expect(adminPage.getByRole("tab", { name: "Оплаты" })).toBeVisible();
  await adminPage.goto("/admin/payments");
  await expect(adminPage.getByRole("heading", { name: "Оплаты", level: 1 })).toBeVisible();
  await adminPage.goto(`/admin/groups/${group.id}`);
  await expect(adminPage.getByRole("region", { name: "Цена группы" })).toContainText("100 000"); // the price of the group (set by the owner above)
  await adminPage.goto("/admin/payments");
  await expect(adminPage.getByRole("navigation").first().getByRole("link", { name: "Зарплата" })).toHaveCount(0);
  await expect(admin.api.get("/auth/org/payroll/settings")).rejects.toMatchObject({ status: 403 }); // payroll: owner only
});

test("teacher: owner pages redirect to his dashboard; the student card has no «Оплаты» tab", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Учителев");
  const group = await org.createGroup({ name: "Группа Р2", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 100000);
  const student = await org.addStudent(group, "Мадина", "Учебная");
  const page = await signIn(teacher);

  for (const path of ["/owner/payroll", "/owner/payments", "/owner/settings"]) {
    await page.goto(path);
    await expect(page, `${path} must not open for a teacher`).toHaveURL(/\/teacher\/dashboard/);
  }

  await page.goto(`/teacher/students/${student.id}`);
  await expect(page.getByRole("tab", { name: "Обучение" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Оплаты" })).toHaveCount(0);
  await expect(page.getByRole("navigation").first().getByRole("link", { name: /Оплаты|Зарплата/ })).toHaveCount(0);

  await expect(teacher.api.get("/auth/org/payments/summary")).rejects.toMatchObject({ status: 403 });
  await expect(teacher.api.get("/auth/org/payroll/settings")).rejects.toMatchObject({ status: 403 });
});
