import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { expectNoHorizontalScroll } from "../support/ui";

/**
 * Guard: the page of a group never scrolls sideways on a phone (it did: the row of the three tabs was wider than the screen).
 * Checked for the owner and the administrator, on every tab.  Runs in the phone project (390 wide).
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Группа на телефоне");
});

for (const role of ["owner", "admin"] as const) {
  test(`@mobile the group page fits a phone: ${role}, students / schedule / attendance (+ payments for the owner)`, async ({ signIn }) => {
    const teacher = await org.addStaff("teacher", `Тел${role}`);
    const group = await org.createGroup({ name: `Группа с довольно длинным названием ${role}`, teacherId: teacher.userId });
    await org.addStudent(group, "Анвар", "Длиннофамильный-Двойной");
    const viewer = role === "owner" ? org.owner : await org.addStaff("admin", "Телефонов");
    const page = await signIn(viewer);
    // the owner has the 4th tab «Оплаты» (#126); an administrator only with the money right
    for (const tab of role === "owner" ? ["students", "schedule", "attendance", "payments"] : ["students", "schedule", "attendance"]) {
      await page.goto(`/${role}/groups/${group.id}?tab=${tab}`);
      await expect(page.getByRole("tab", { name: /Ученики/ })).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await expectNoHorizontalScroll(page);
      const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(sizes.scroll, `${role} ${tab}: scrollWidth ${sizes.scroll} > ${sizes.inner}`).toBeLessThanOrEqual(sizes.inner);
    }
  });
}
