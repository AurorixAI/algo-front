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
  await org.setGroupPrice(group.id, 450000); // the price lives on the group (#105)
  const leaver = await org.addStudent(group, "Анвар", "Уходящий");
  const stayer = await org.addStudent(group, "Мадина", "Остающаяся");
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
  await page.getByRole("tab", { name: "Без долга" }).click();
  await expect(paymentRow("Уходящий Анвар")).toHaveCount(1);

  // --- archive from the student card
  await page.goto(`/owner/students/${leaver.id}`);
  await page.getByRole("button", { name: /Действия/ }).first().click();
  await page.getByRole("menuitem", { name: "В архив" }).dispatchEvent("click"); // a scroll closes the menu: the event goes to the item itself
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
  await page.getByRole("tab", { name: "Без долга" }).click();
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
  // IA audit F10: the card keeps one line; the history (with the receipt number) is the statement
  await expect(page.getByTestId("membership-last-payment")).toBeVisible();
  await page.getByRole("link", { name: "Выписка" }).first().click();
  await expect(page.getByTestId("statement-row-payment")).toContainText(/№\s*\d+/);
  const membership = await org.membershipId(leaver.id);
  const payments = await org.owner.api.get(`/auth/org/memberships/${membership}/payments`);
  expect(payments).toHaveLength(1);
  expect(payments[0].voided_at).toBeFalsy();
  const students = await org.owner.api.get("/auth/org/students", { status: "archived" });
  expect(students).toHaveLength(0);
});

/**
 * The return that leaves something to read. The dialog of «Вернуть из архива» was opened while the group still had a
 * free place; before the owner presses «Вернуть» the group fills up (the card he looks at cannot know), so the server
 * brings the student back WITHOUT that group and says why. The student is back from that moment: the card behind the
 * dialog must already show it, and «Готово» only closes the dialog (no second read of the card).
 *
 * Data, all through the API of the throw-away organisation (owner token):
 *   POST /auth/org/invitations + /auth/invite/accept        a teacher (Org.addStaff)
 *   POST /auth/org/groups {max_students: 2}                 the group with two places (Org.createGroup)
 *   POST /auth/org/students + POST /auth/org/groups/{g}/students/{s}   the leaver and the stayer: 2 of 2 (Org.addStudent)
 *   POST /auth/org/students/{leaver}/archive {reason}       the leaver goes: 1 of 2, the restore dialog offers the group
 * and, with the dialog already open (the only moment-dependent step, ordered by the test itself):
 *   POST /auth/org/students + POST /auth/org/groups/{g}/students/{s}   a third student takes the free place: 2 of 2
 * The server then answers the restore with skipped: [{reason: "group_full", message: "В группе достигнут лимит учеников"}].
 */
test("restore into a group that filled up meanwhile: the dialog stays with the notice, the card behind it is already restored, «Готово» only closes", async ({ signIn }) => {
  const org2 = await Org.create("Возврат");
  const teacher = await org2.addStaff("teacher", "Возвратов");
  const group = await org2.createGroup({ name: "Группа В1", teacherId: teacher.userId, maxStudents: 2 });
  const leaver = await org2.addStudent(group, "Рустам", "Возвращающийся");
  await org2.addStudent(group, "Лола", "Остающаяся");
  await org2.owner.api.post(`/auth/org/students/${leaver.id}/archive`, { reason: "Каникулы" });

  const page = await signIn(org2.owner);
  const profileReads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "GET" && request.url().includes(`/auth/org/students/${leaver.id}/profile`)) profileReads.push(request.url());
  });
  const archiveBanner = page.getByText(/В архиве с/);
  const restoreButton = page.getByRole("button", { name: "Вернуть из архива" });

  await page.goto(`/owner/students/${leaver.id}`);
  await expect(archiveBanner).toBeVisible();
  await restoreButton.click();
  const form = page.getByRole("dialog", { name: "Вернуть из архива?" });
  await expect(form.getByRole("checkbox", { name: group.name })).toBeChecked(); // a free place, as far as the card knows

  // meanwhile the group fills up
  await org2.addStudent(group, "Тимур", "Занявший");
  const readsBefore = profileReads.length;
  await form.getByRole("button", { name: "Вернуть", exact: true }).click();

  // the dialog stays and tells what the server did not do
  const notice = page.getByRole("dialog", { name: "Ученик возвращён из архива" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Не удалось вернуть ученика в эти группы");
  await expect(notice).toContainText(`«${group.name}» — В группе достигнут лимит учеников`);

  // the card behind it is already the restored one: no banner, no «Вернуть из архива», the actions menu is back
  await expect(archiveBanner).toHaveCount(0);
  await expect(restoreButton).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Действия: .*Возвращающийся/ })).toBeVisible(); // the card's own menu
  await expect(notice).toBeVisible(); // the reload did not tear the dialog down
  expect(profileReads.length - readsBefore, "one read of the card, started by the return itself").toBe(1);

  // «Готово» only closes: no second read, the card stays restored
  await notice.getByRole("button", { name: "Готово" }).click();
  await expect(notice).toHaveCount(0);
  await page.waitForTimeout(600); // a read started by «Готово» would be on its way by now
  expect(profileReads.length - readsBefore, "«Готово» must not read the card again").toBe(1);
  await expect(archiveBanner).toHaveCount(0);

  const fresh = await org2.owner.api.get(`/auth/org/students/${leaver.id}`);
  expect(fresh.status).not.toBe("archived");
});
