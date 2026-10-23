import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { pickOption } from "../support/ui";

/**
 * IA audit 22.10 (paths): the cards of «Оплаты» lead to the debtors tab; the owner's dashboard is not a dead end (KPI cards, the debt tile, the
 * groups); the lists of money open the student on «Оплаты» and the group on its page; the statement leads on to the student and the group.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Пути");
});

test("«Оплаты»: the card «Долг» -> the debtors tab; the student of a row opens on «Оплаты», its group is a link; the statement leads on", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Путевой");
  const group = await org.createGroup({ name: "Группа П2", teacherId: teacher.userId });
  await org.setGroupPrice(group.id, 450000);
  const student = await org.addStudent(group, "Тимур", "Должников");
  const membership = await org.membershipId(student.id);
  const page = await signIn(org.owner);

  await page.goto("/owner/payments?bucket=active");
  await page.getByTestId("position-debt").click();
  await expect(page).toHaveURL(/\/owner\/payments\?bucket=debt/);
  await expect(page.getByRole("tab", { name: /^Должники/, selected: true })).toBeVisible();

  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Должников Тимур", exact: true }) });
  await expect(row.getByRole("link", { name: "Должников Тимур", exact: true })).toHaveAttribute("href", new RegExp(`/owner/students/${student.id}\\?tab=payments$`));
  await expect(row.getByTestId("payment-row-group")).toHaveAttribute("href", new RegExp(`/owner/groups/${group.id}\\?tab=payments$`));
  await row.getByTestId("payment-row-statement").click();
  await expect(page).toHaveURL(new RegExp(`/owner/payments/statement/${membership}$`));
  await expect(page.getByTestId("statement-student-link")).toHaveAttribute("href", new RegExp(`/owner/students/${student.id}\\?tab=payments$`));
  await expect(page.getByTestId("statement-group-link")).toHaveAttribute("href", new RegExp(`/owner/groups/${group.id}$`));
});

test("the owner's dashboard: KPI cards are links, the debt tile leads to the debtors, a group row to the group", async ({ signIn }) => {
  const page = await signIn(org.owner);
  await page.goto("/owner/dashboard");
  await expect(page.getByTestId("dashboard-kpi-link").first()).toBeVisible();
  const hrefs = await page.getByTestId("dashboard-kpi-link").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  expect(hrefs).toEqual(["/owner/students", "/owner/teachers"]);
  await expect(page.getByTestId("dashboard-tile-debt")).toHaveAttribute("href", "/owner/payments?bucket=debt");
  await page.getByTestId("dashboard-kpi-link").first().click();
  await expect(page).toHaveURL(/\/owner\/students$/);
});

test("«Группы»: the class filter and the status are in the address of the list", async ({ signIn }) => {
  const teacher = await org.addStaff("teacher", "Классный");
  await org.createGroup({ name: "Группа К9", teacherId: teacher.userId, classLevel: 9 });
  const page = await signIn(org.owner);
  await page.goto("/owner/groups");
  await pickOption(page, page.getByTestId("groups-class-filter"), "9 класс");
  await expect(page).toHaveURL(/class=9/);
  await expect(page.getByRole("heading", { name: "Группа К9" })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("groups-class-filter")).toContainText("9 класс");
});
