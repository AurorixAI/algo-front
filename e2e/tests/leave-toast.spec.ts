import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Org } from "../support/api";
import { addDays, businessNow } from "../support/time";

/**
 * PAY-DUE 20.5: the message after leaving a group is never empty - it says what was done («Ученик убран из группы») and, when the server gave a sentence
 * about the money, it stands under it in the words of the server.  Every outcome of the window: no money, «Оставить долг» / «Оставить как есть» (a debt; a sum «к оплате» in the only group),
 * «Простить N сум», «Вернуть» an advance - from the roster of the group and from the card of the student.
 */
const LEFT = "Ученик убран из группы";
let org: Org;
let groupId = "";
test.beforeAll(async () => {
  org = await Org.create("Уход тост");
  await org.setPersonalPeriod();
  await org.setPaymentSettings({ accounting_start_date: addDays(businessNow().date, -60) });
  const teacher = await org.addStaff("teacher", "Тостов");
  groupId = (await org.createGroup({ name: "Группа Т1", teacherId: teacher.userId })).id;
});

/** The text of the status line (the toast) after the click of «Убрать из группы», whole. */
async function leaveFromRoster(page: Page, who: string, choose?: (dialog: import("@playwright/test").Locator) => Promise<void>) {
  await page.goto(`/owner/groups/${groupId}`);
  await page.getByRole("button", { name: `Действия: ${who}` }).click();
  const previewed = page.waitForResponse((r: { url(): string }) => /leave-preview/.test(r.url()));
  await page.getByRole("menuitem", { name: "Убрать из группы…" }).click();
  await previewed;
  const dialog = page.getByRole("dialog", { name: "Убрать ученика из группы?" });
  await expect(dialog.getByRole("button", { name: "Убрать из группы" })).toBeEnabled();
  if (choose) await choose(dialog);
  await dialog.getByRole("button", { name: "Убрать из группы" }).click();
  await expect(dialog).toHaveCount(0);
  const status = page.getByRole("status").filter({ hasText: LEFT });
  await expect(status).toBeVisible();
  return ((await status.innerText()) || "").replace(/\s+/g, " ").trim();
}

test("no money on the account: the toast says the fact", async ({ signIn }) => {
  const student = await org.addStudent({ id: groupId, name: "", teacherId: null }, "Ольга", "Безденежная", undefined, businessNow().date);
  const page = await signIn(org.owner);
  const text = await leaveFromRoster(page, student.fullName);
  expect(text).toBe(LEFT);
});

test("a debt, «Оставить как есть»: the fact and the sentence of the server about the debt", async ({ signIn }) => {
  await org.setGroupPrice(groupId, 450000);
  const student = await org.addStudent({ id: groupId, name: "", teacherId: null }, "Анвар", "Должников", undefined, addDays(businessNow().date, -10));
  const page = await signIn(org.owner);
  const text = await leaveFromRoster(page, student.fullName);
  expect(text).toMatch(/^Ученик убран из группы.*Долг [\d\s\u00a0\u202f]+ сум (останется|остался) за учеником/);
});

test("a debt, «Простить N сум»: the fact and what was forgiven", async ({ signIn }) => {
  const student = await org.addStudent({ id: groupId, name: "", teacherId: null }, "Дильноза", "Прощаемая", undefined, addDays(businessNow().date, -10));
  const page = await signIn(org.owner);
  const text = await leaveFromRoster(page, student.fullName, async (dialog) => {
    await dialog.getByLabel(/^Простить [\d\s\u00a0\u202f]+ сум/).check();
    await dialog.getByLabel(/Причина/).fill("Болезнь");
  });
  expect(text).toMatch(/^Ученик убран из группы.*Прощено [\d\s\u00a0\u202f]+ сум/);
});

test("an advance, «Вернуть»: the fact and what was returned", async ({ signIn }) => {
  const student = await org.addStudent({ id: groupId, name: "", teacherId: null }, "Мадина", "Возвратова", undefined, addDays(businessNow().date, -10));
  await org.pay(student.id, 1000000, { method: "cash" });
  const page = await signIn(org.owner);
  const text = await leaveFromRoster(page, student.fullName, async (dialog) => {
    await dialog.getByRole("radio", { name: /Вернуть/ }).check();
    await dialog.getByRole("radio", { name: "Наличные" }).click();
  });
  expect(text).toMatch(/^Ученик убран из группы.*Возвращено [\d\s\u00a0\u202f]+ сум/);
});

test("from the card of the student (the only group, «Оставить как есть»): the same message", async ({ signIn }) => {
  const student = await org.addStudent({ id: groupId, name: "", teacherId: null }, "Тимур", "Карточкин", undefined, addDays(businessNow().date, -10));
  const page = await signIn(org.owner);
  await page.goto(`/owner/students/${student.id}`);
  await page.getByRole("button", { name: /^Действия по группе:/ }).first().click();
  await page.getByRole("menuitem", { name: "Убрать из группы…" }).click();
  const dialog = page.getByRole("dialog", { name: "Убрать ученика из группы?" });
  await expect(dialog.getByRole("button", { name: "Убрать из группы" })).toBeEnabled();
  await page.waitForTimeout(500);
  await dialog.getByRole("button", { name: "Убрать из группы" }).click();
  const status = page.getByRole("status").filter({ hasText: LEFT });
  await expect(status).toBeVisible();
  expect(((await status.innerText()) || "").replace(/\s+/g, " ").trim()).toMatch(/^Ученик убран из группы.*Долг [\d\s\u00a0\u202f]+ сум (останется|остался)/);
});
