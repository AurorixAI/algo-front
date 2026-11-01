import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../support/fixtures";
import { Org, startLesson } from "../support/api";
import { ExamApi } from "../support/exam";
import { expectNoHorizontalScroll } from "../support/ui";

/**
 * Wave B / P5 on the real stack (auth-service + exam-service + the built front):
 *  1. an import with a file the server refuses shows a calm Russian sentence (never «[object Object]»)         (BUG-4)
 *  2. the teacher removes a participant and finishes the exam early through the PLATFORM's dialogs (no native)   (F-A20)
 *  3. the student's countdown after the tab slept for 5 minutes (Date.now moved, no timer fired)                 (F-A15)
 *  4. the old /sessions address lands on the results tab                                                         (F-A17)
 * Screenshots: SHOTS_DIR/{SHOT_PHASE=after|before}-{name}-{desktop|mobile}.png  (the "before" run is the same file on the commit before the pack)
 * Needs E2E_EXAM=1 for 2-4.
 */
const SHOTS = process.env.SHOTS_DIR || path.resolve(__dirname, "../../../artifacts/code_audit_2410/shots-wb-p5");
const PHASE = process.env.SHOT_PHASE || "after";
mkdirSync(SHOTS, { recursive: true });
const checks = PHASE === "after";

test("import: a refused file shows a readable Russian sentence @mobile", async ({ signIn }, testInfo) => {
  const org = await Org.create("Импорт");
  const page = await signIn(org.owner);
  const shot = async (name: string) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, `${PHASE}-${name}-${testInfo.project.name}.png`) });
  };
  await page.goto("/owner/students");
  await page.getByRole("button", { name: "Импорт" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Импорт данных" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Файл .xlsx для импорта").setInputFiles({ name: "ученики.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("это не таблица Excel") });
  await expect(dialog.getByText("ученики.xlsx")).toBeVisible();
  await dialog.getByRole("button", { name: /Далее/ }).click();
  const error = dialog.locator("[role=alert], .text-rose-700, .text-rose-600, .text-red-600").filter({ hasText: /\S/ }).first();
  await expect(error).toBeVisible();
  const text = (await error.innerText()).trim();
  console.log(`import error text: «${text}»`);
  expect(text).not.toMatch(/object Object|\[object|{"|\[{/);
  if (checks) expect(text).toMatch(/[А-Яа-яЁё]{4,}/);
  await shot("import-error");
  await expectNoHorizontalScroll(page);
});

test("import: the REAL 422 body of the server (a validation list) reaches the person as a sentence, not «[object Object]» @mobile", async ({ signIn }, testInfo) => {
  const org = await Org.create("Импорт422");
  // the body the real server sends when the upload has no file part
  const refused = await org.owner.api.raw("POST", "/auth/org/import/preview", { body: {} }).then(() => null, (e) => e);
  expect(refused?.status).toBe(422);
  console.log(`real 422 detail: ${JSON.stringify(refused.detail).slice(0, 200)}`);
  const page = await signIn(org.owner);
  await page.route("**/auth/org/import/preview", (route) => route.fulfill({
    status: 422,
    contentType: "application/json",
    headers: { "access-control-allow-origin": `http://localhost:${process.env.E2E_FRONT_PORT || 13000}`, "access-control-allow-credentials": "true" },
    body: JSON.stringify({ detail: refused.detail }),
  }));
  await page.goto("/owner/students");
  await page.getByRole("button", { name: "Импорт" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Импорт данных" });
  await dialog.getByLabel("Файл .xlsx для импорта").setInputFiles({ name: "ученики.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("x") });
  await dialog.getByRole("button", { name: /Далее/ }).click();
  const error = dialog.locator("[role=alert], .text-rose-700, .text-rose-600, .text-red-600").filter({ hasText: /\S/ }).first();
  await expect(error).toBeVisible();
  const text = (await error.innerText()).trim();
  console.log(`import error text (422 list): «${text}»`);
  if (checks) {
    expect(text).not.toMatch(/object Object|\[object|{"|\[{/);
    expect(text).toMatch(/[А-Яа-яЁё]{4,}/);
  } else {
    expect(text, "(before: the list was turned into text by the old line)").toMatch(/object Object/);
  }
  await page.waitForTimeout(700);
  if (checks) {
    // R3 #8: the error is not hidden under the footer (a phone: the step fills the screen)
    const errorBox = (await error.boundingBox())!;
    const footerBox = (await dialog.getByRole("button", { name: /Далее/ }).boundingBox())!;
    expect(errorBox.y + errorBox.height, "the error ends above the footer buttons").toBeLessThanOrEqual(footerBox.y + 1);
    await expect(dialog.getByRole("alert")).toBeVisible();
  }
  await page.screenshot({ path: path.join(SHOTS, `${PHASE}-import-error-422-${testInfo.project.name}.png`) });
  await expectNoHorizontalScroll(page);
});

test("a student typed with ONE word is not created as «Иван Иван»: the field says what is missing @mobile", async ({ signIn }, testInfo) => {
  const org = await Org.create("ОдноСлово");
  const admin = await org.addStaff("admin", "Админов");
  const page = await signIn(admin);
  await page.goto("/admin/students/new");
  const name = page.getByLabel("Имя и фамилия");
  await name.fill("Иван");
  await name.blur();
  await expect(page.getByText("Укажите имя и фамилию - два слова через пробел")).toBeVisible();
  await page.getByLabel("Телефон ученика").fill("+998 90 123 45 67");
  const create = page.getByRole("button", { name: "Создать и получить ссылку" });
  await expect(create).toBeDisabled();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, `${PHASE}-student-one-word-${testInfo.project.name}.png`) });
  await expectNoHorizontalScroll(page);
  await name.fill("Иван Петров");
  await expect(page.getByText("Укажите имя и фамилию - два слова через пробел")).toHaveCount(0);
  const before = (await org.owner.api.get<any>("/auth/org/students", { limit: 50 })) as any;
  const countBefore = (before.items ?? before).length;
  // (the class is chosen in the form; the creation itself is covered by the unit test of splitFullName and the API scenarios)
  expect(countBefore).toBe(0);
});

test("exam: remove a participant and finish early through the platform's dialogs; the student's timer survives a sleeping tab; /sessions redirects @exam @mobile", async ({ signIn, anonymous, hasTouch }, testInfo) => {
  test.setTimeout(180_000);
  const org = await Org.create("Таймер");
  const teacher = await org.addStaff("teacher", "Таймеров");
  const group = await org.createGroup({ name: "Группа Т1", teacherId: teacher.userId });
  const kept = await org.addStudent(group, "Анвар", "Остающийся");
  const removed = await org.addStudent(group, "Бека", "Убираемый");
  const lesson = await org.createLessonStartingNow(group.id, teacher, 45);
  await startLesson(teacher, lesson);
  const api = new ExamApi(teacher);
  const draft = await api.createDraft({ title: "Контрольная таймера", groupId: group.id, tasks: 3 });
  const published = await api.call<{ access_code: string }>("POST", `/exams/${draft.exam_id}/assign`, {
    group_id: group.id, publish: true, lesson_id: lesson.id, lesson_date: lesson.date,
  });
  const code = published.access_code;

  const tp = await signIn(teacher);
  const shot = async (page: import("@playwright/test").Page, name: string) => {
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SHOTS, `${PHASE}-${name}-${testInfo.project.name}.png`) });
  };

  // --- two students in the lobby (the real student form), the teacher sees both
  const sp1 = await anonymous();
  const sp2 = await anonymous();
  for (const [page, who] of [[sp1, kept], [sp2, removed]] as const) {
    await page.goto(`/e/${code}`);
    await page.getByLabel("Имя и фамилия").fill(`${who.lastName} ${who.firstName}`);
    await page.getByLabel("ID ученика").fill(who.displayId!);
    await page.getByRole("button", { name: "Присоединиться к лобби" }).click();
    await expect(page.getByRole("heading", { name: "Вы в комнате ожидания" })).toBeVisible();
  }
  await tp.goto(`/teacher/exams/${draft.exam_id}`);
  await expect(tp.getByText(`${removed.lastName} ${removed.firstName}`)).toBeVisible();

  // --- «remove a participant»: the platform's question; «Отмена» keeps him, «Убрать» removes him
  let nativeOpened = false;
  tp.on("dialog", async (d) => { nativeOpened = true; console.log(`NATIVE DIALOG: ${d.type()} «${d.message()}»`); await d.accept(); });
  const kick = tp.getByRole("button", { name: `Удалить из экзамена: ${removed.lastName} ${removed.firstName}` });
  await kick.click();
  if (checks) {
    const ask = tp.getByRole("dialog", { name: "Убрать ученика из сессии?" });
    await expect(ask.getByText(new RegExp(removed.lastName))).toBeVisible();
    await expect(ask.getByRole("button", { name: "Отмена" })).toBeFocused();                    // R3 #10: the safe answer has the focus
    await shot(tp, "kick-dialog");
    await tp.keyboard.press("Escape");                                                          // Escape = «no»
    await expect(ask).toHaveCount(0);
    await expect(tp.getByText(`${removed.lastName} ${removed.firstName}`)).toBeVisible();   // kept
    await kick.click();
    await ask.getByRole("button", { name: "Отмена" }).click();
    await expect(ask).toHaveCount(0);
    // a fast double click on the cross opens ONE question; a double click on «Убрать» sends ONE request
    await kick.dblclick();
    await expect(tp.getByRole("dialog", { name: "Убрать ученика из сессии?" })).toHaveCount(1);
    const deletes: string[] = [];
    tp.on("request", (r) => { if (r.method() === "DELETE" && /\/sessions\//.test(r.url())) deletes.push(r.url()); });
    await tp.getByRole("dialog", { name: "Убрать ученика из сессии?" }).getByRole("button", { name: "Убрать" }).dblclick();
    await expect(tp.getByText(`${removed.lastName} ${removed.firstName}`)).toHaveCount(0);
    expect(deletes.length, "one request for a double click").toBe(1);
  } else {
    await page_wait(tp);
  }
  await expect(tp.getByText(`${removed.lastName} ${removed.firstName}`)).toHaveCount(0);
  expect(nativeOpened, checks ? "no native dialog" : "(before: the native confirm is expected)").toBe(!checks);

  if (checks) {
    // R3 #4: a refused action is an error toast that stays long enough to be read and has a cross
    await tp.route("**/exams/*/start-live", (route) => route.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": `http://localhost:${process.env.E2E_FRONT_PORT || 13000}`, "access-control-allow-credentials": "true" }, body: JSON.stringify({ detail: "Internal Server Error" }) }));
    await tp.getByRole("button", { name: "Начать экзамен" }).click();
    const toast = tp.getByRole("alert").filter({ hasText: /Сервис временно недоступен|Ошибка при запуске/ });
    await expect(toast).toBeVisible();
    console.log(`error toast text: «${(await toast.innerText()).trim()}»`);
    await tp.waitForTimeout(5500);
    await expect(toast, "still there after 5.5 s (alert waited for OK)").toBeVisible();
    await shot(tp, "error-toast");
    await toast.getByRole("button", { name: "Закрыть" }).click();
    await expect(toast).toHaveCount(0);
    await tp.unroute("**/exams/*/start-live");
  }

  // --- the exam starts; the kept student sees the countdown
  await tp.getByRole("button", { name: "Начать экзамен" }).click();
  await expect(tp.getByText(/Идёт экзамен/)).toBeVisible();
  const progress = sp1.getByText(/Вопрос \d\/3/);
  await expect(progress).toBeVisible({ timeout: 20_000 });
  const clock = sp1.getByText(/^\d{2}:\d{2}$/).first();
  const readSeconds = async () => {
    const [m, s] = (await clock.innerText()).split(":").map(Number);
    return m * 60 + s;
  };
  const before = await readSeconds();
  console.log(`student timer at the start: ${before}s`);
  expect(before).toBeGreaterThan(19 * 60 - 20);
  await shot(sp1, "student-timer-start");

  // --- the tab sleeps for 5 minutes: the wall clock moves, no timer fires; then the tab comes back (visibilitychange)
  await sp1.evaluate(() => {
    const real = Date.now.bind(Date);
    (window as any).__shift = 300_000;
    Date.now = () => real() + (window as any).__shift;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await sp1.waitForTimeout(300);
  const after = await readSeconds();
  console.log(`student timer after 5 minutes asleep: ${after}s (was ${before}s)`);
  if (checks) {
    expect(before - after, "the 5 minutes that passed are subtracted at once").toBeGreaterThanOrEqual(295);
    expect(before - after).toBeLessThanOrEqual(310);
  } else {
    expect(before - after, "(before: a decrementing counter ignores the sleep)").toBeLessThan(10);
  }
  await shot(sp1, "student-timer-after-sleep");
  await expectNoHorizontalScroll(sp1);

  // --- finish early: the platform's dialog (already was), the toast of a refusal is not needed here
  const live = tp.getByTestId("exam-live-block");
  await live.getByRole("button", { name: "Опции экзамена" }).click();
  await tp.locator("#exam-actions-menu").getByRole("button", { name: "Завершить досрочно" }).click();
  const finish = tp.getByRole("dialog", { name: "Завершить досрочно" });
  await expect(finish).toBeVisible();
  await shot(tp, "finish-dialog");
  await finish.getByRole("button", { name: "Завершить", exact: true }).click();
  await expect(live.getByText("Экзамен завершён")).toBeVisible();

  // --- the old address of the results lands on the results tab, the table can be downloaded
  await tp.goto(`/teacher/exams/${draft.exam_id}/sessions`);
  if (checks) {
    await expect(tp).toHaveURL(new RegExp(`/teacher/exams/${draft.exam_id}\\?tab=analytics`));
    await expect(tp.getByRole("heading", { name: "Результаты учеников" })).toBeVisible();
    const download = tp.waitForEvent("download");
    await tp.getByRole("button", { name: "Скачать таблицу" }).click();
    expect((await download).suggestedFilename()).toBe(`exam-${draft.exam_id}-results.csv`);
    await shot(tp, "results-tab");
    await expectNoHorizontalScroll(tp);
  }
});

async function page_wait(page: import("@playwright/test").Page) {
  await page.waitForTimeout(500);
}
