import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { pickOption, toast } from "../support/ui";

/**
 * IA audit 22.10 (the card of the student): it opens on «Обучение» (one default); the header «⋯» is the person's menu - «Изменить данные…»,
 * «Копировать ID», «В архив» (the owner has no diagnostics: no «Новая диагностика…», no diagnostic button, no link into /admin/*);
 * «Изменить данные…» changes the surname, the name and the class (and the phone and the note) in one form of the «Контакты» tab.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Карточка");
});

test("the card opens on «Обучение»; the owner's menu has no diagnostics; «Изменить данные…» saves the name and the class", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Карточкин");
  const group = await org.createGroup({ name: "Группа К1", teacherId: teacher.userId });
  const student = await org.addStudent(group, "Анвар", "Менялов");
  const page = await signIn(org.owner);

  await page.goto(`/owner/students/${student.id}`);
  await expect(page.getByRole("tab", { name: "Обучение", selected: true })).toBeVisible();
  await expect(page.getByTestId("enrol-add")).toHaveText(/Зачислить в группу/);
  await expect(page.getByTestId("enrol-transfer")).toHaveText(/Перевести в другую группу/);

  // the header menu: the person's actions only
  await page.getByRole("button", { name: /^Действия: Менялов Анвар/ }).click();
  const labels = (await page.getByRole("menuitem").allTextContents()).map((text) => text.trim());
  expect(labels).toEqual(["Изменить данные…", "Копировать ID", "В архив"]);
  expect(labels).not.toContain("Новая диагностика…");
  await page.getByRole("menuitem", { name: "Изменить данные…" }).dispatchEvent("click"); // a scroll closes the menu: the event goes to the item itself

  // the form of the «Контакты» tab
  await expect(page).toHaveURL(/tab=contacts/);
  const form = page.getByTestId("student-data-form");
  await expect(form).toBeVisible();
  await form.getByLabel("Фамилия").fill("Изменённый");
  await pickOption(page, form.getByRole("combobox", { name: "Класс" }), "9 класс");
  await expect(form).toContainText("Класс влияет на диагностику и уровни");
  await form.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Данные ученика сохранены")).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toContainText("Изменённый");
  await expect(page.getByText("9 класс").first()).toBeVisible();
  const saved = await org.owner.api.get(`/auth/org/students/${student.id}`);
  expect(saved).toMatchObject({ last_name: "Изменённый", class_level: 9 });

  // the diagnostics tab of the owner has no button and no link into /admin/*
  await page.getByRole("tab", { name: /Диагностика и отчёты|Отчёты/ }).click();
  await expect(page.getByRole("button", { name: "Назначить диагностику" })).toHaveCount(0);
  await expect(page.locator('a[href^="/admin/"]')).toHaveCount(0);

  // the money chip is a link to «Оплаты»
  await org.setGroupPrice(group.id, 450000);
  await page.reload();
  await expect(page.getByTestId("student-money-chip")).toBeVisible();
  await page.getByTestId("student-money-chip").click();
  await expect(page.getByRole("tab", { name: /Оплаты/, selected: true })).toBeVisible();
});
