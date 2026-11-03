import { test, expect } from "../support/fixtures";
import { Org, type GroupInfo, type Staff } from "../support/api";

/**
 * WE-E (E1): one lesson panel on the dashboard and in the schedule - the snapshots of the SAME lesson on both screens (1280 and 375), taken by the same spec before and after the merge.
 * A lesson with a topic that starts now: «ready to start», then after the start (the marking list). Output: E2E_SHOTS/<label>-<screen>-<state>-<width>.png
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Панель WE-E");
});

for (const screen of ["dashboard", "schedule"] as const) {
  test(`${screen}: the panel of the same lesson, ready and started @mobile`, async ({ signIn }) => {
    const teacher: Staff = await org.addStaff("teacher", `Сравнов-${screen}`);
    const group: GroupInfo = await org.createGroup({ name: `Группа ${screen}`, teacherId: teacher.userId });
    await org.addStudent(group, "Азиз", `Алиев-${screen}`);
    await org.addStudent(group, "Алина", `Абдуллаева-${screen}`);
    await org.createLessonStartingNow(group.id);   // it has a topic: the schedule showed it in the panel, the dashboard did not (before WE-E)
    const page = await signIn(teacher);
    const width = page.viewportSize()?.width ?? 0;
    const shot = async (state: string) => {
      await page.waitForTimeout(700);   // the panel fades in: the picture is taken when it is still
      if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/${process.env.E2E_SHOTS_LABEL ?? "shot"}-${screen}-${state}-${width}.png` });
    };
    await page.goto(`/teacher/${screen}`);
    const card = screen === "dashboard" ? page.locator("p.truncate", { hasText: group.name }).first() : page.getByText(group.name, { exact: true }).first();
    await card.click();
    await expect(page.getByText("Состав группы (2 ученика)")).toBeVisible();
    await shot("ready");
    await page.getByRole("button", { name: "Начать урок", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Отметка посещаемости \(0 из 2\)/ })).toBeVisible();
    await shot("started");
  });
}
