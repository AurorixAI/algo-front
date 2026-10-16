import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { expectNoHorizontalScroll, expectWithinViewport } from "../support/ui";

/**
 * The teacher / group filter of «Оплаты»: an in-panel drill-down. A teacher row selects the teacher (all his groups),
 * a separate expand button opens his groups inline, a group row selects the group. Nothing depends on hover, so the
 * same steps work with a mouse and with a finger; on a 375 px phone the panel must stay inside the viewport.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Фильтр");
});

test("@mobile open -> expand a teacher -> pick a group -> list filtered; teacher row = all his groups; reset", async ({ signIn }) => {
  const ivanov = await org.addStaff("teacher", "Иванов");
  const petrov = await org.addStaff("teacher", "Петров");
  const g1 = await org.createGroup({ name: "Алгебра-7", teacherId: ivanov.userId });
  const g2 = await org.createGroup({ name: "Геометрия-8", teacherId: petrov.userId });
  const g3 = await org.createGroup({ name: "Физика-9", teacherId: petrov.userId });
  await org.addStudent(g1, "Анвар", "Ивановский");
  await org.addStudent(g2, "Мадина", "Геометрова");
  await org.addStudent(g3, "Булат", "Физиков");

  const page = await signIn(org.owner);
  await page.goto("/owner/payments");
  await page.getByRole("tab", { name: /Нет данных/ }).click();
  const names = ["Ивановский Анвар", "Геометрова Мадина", "Физиков Булат"];
  const visible = async () =>
    (await Promise.all(names.map(async (n) => ((await page.getByRole("link", { name: n, exact: true }).count()) > 0 ? n : null)))).filter(Boolean);
  await expect.poll(visible).toEqual(names);

  // --- open the panel
  const trigger = page.getByRole("button", { name: "Все ученики" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  const panel = page.getByRole("group", { name: "Фильтр по преподавателю и группе" });
  await expect(panel).toBeVisible();
  await expectWithinViewport(page, panel);

  // --- expand a teacher: his groups appear INSIDE the panel (no hover needed)
  const petrovName = (await panel.getByRole("button", { name: /^Группы преподавателя .*Петров/ }).getAttribute("aria-label"))!.replace("Группы преподавателя ", "");
  await panel.getByRole("button", { name: `Группы преподавателя ${petrovName}` }).click();
  const groups = panel.getByRole("group", { name: `Группы: ${petrovName}` });
  await expect(groups.getByRole("button")).toHaveText(["Геометрия-8", "Физика-9"]);
  await expectWithinViewport(page, panel);

  // --- pick a group: the list narrows to it, the panel closes
  await groups.getByRole("button", { name: "Физика-9" }).click();
  await expect(panel).toBeHidden();
  await expect.poll(visible).toEqual(["Физиков Булат"]);
  await expect(page.getByRole("button", { name: "Физика-9" })).toBeVisible(); // the pill carries the choice
  await expectNoHorizontalScroll(page);

  // --- reset, then pick the TEACHER (= all his groups)
  await page.getByRole("button", { name: "Сбросить фильтр" }).click();
  await expect.poll(visible).toEqual(names);
  await page.getByRole("button", { name: "Все ученики" }).click();
  await panel.getByRole("button", { name: petrovName, exact: true }).click();
  await expect.poll(visible).toEqual(["Геометрова Мадина", "Физиков Булат"]);
  await expectNoHorizontalScroll(page);
});
