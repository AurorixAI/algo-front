import { test, expect } from "../support/fixtures";
import { Org, clockReaches, runLesson, type GroupInfo, type LessonInfo, type Staff } from "../support/api";
import type { Page, Request } from "@playwright/test";

/**
 * WB-P3 (F-A10, F-A12, F-A27): the lesson panel of the teacher on the dashboard and in the schedule.
 *
 *  1. the whole day of a lesson on the SCHEDULE screen: start -> marks -> finish (the dashboard has the same in teacher-lesson.spec.ts);
 *  2. a slow answer of lesson A that arrives after lesson B was opened must not touch the panel of B - on both screens;
 *  (F-A12, the roster of a started or past lesson, has no screen of its own: the server refuses to change a group while its lesson is in progress and
 *  the panel of a completed lesson lists nobody - the function that builds the roster is covered by tests/wb-p3-lesson-panel.test.cjs.)
 *
 * The delay is artificial: page.route holds the REAL answer of the journal of group A until the test lets it go.
 */
let org: Org;
test.beforeAll(async () => {
  org = await Org.create("Панель");
});

type Pair = Awaited<ReturnType<typeof makePair>>;
const pairs: Record<string, Pair> = {};
test.beforeAll(async () => {
  test.setTimeout(180_000);
  // one teacher cannot lead two lessons at the same minutes (TEACHER_BUSY) and has one lesson in progress at a time:
  // A is a one-minute lesson held and COMPLETED first, B starts the minute after and stays in progress
  const made = await Promise.all(["Г1", "Г2"].map((label) => makePair(label)));
  await clockReaches(Math.max(...made.map((pair) => pair.lessonB.startMinutes!)));
  for (const pair of made) {
    await runLesson(pair.teacher, pair.lessonB, { records: { [pair.b1.id]: "present" } });
    // a second save of B moves its version on: the versions of A and B differ
    await pair.teacher.api.post(`/auth/org/groups/${pair.groupB.id}/attendance`, { lessonDate: pair.lessonB.date, lessonId: pair.lessonB.id, status: "in_progress", records: { [pair.b1.id]: "present", [pair.b2.id]: "late" } });
    pairs[pair.label] = pair;
  }
});

async function makePair(label: string) {
  const teacher: Staff = await org.addStaff("teacher", `Панелин${label}`);
  const groupA: GroupInfo = await org.createGroup({ name: `Группа А${label}`, teacherId: teacher.userId });
  const groupB: GroupInfo = await org.createGroup({ name: `Группа Б${label}`, teacherId: teacher.userId });
  const a1 = await org.addStudent(groupA, "Азиз", `Алиев${label}`);
  const a2 = await org.addStudent(groupA, "Алина", `Абдуллаева${label}`);
  const b1 = await org.addStudent(groupB, "Бобур", `Бакиров${label}`);
  const b2 = await org.addStudent(groupB, "Барно", `Бекова${label}`);
  const lessonA = await org.createLessonStartingNow(groupA.id, org.owner, 1);
  const lessonB = await org.createLessonStartingNow(groupB.id, org.owner, 10, 1);
  await runLesson(teacher, lessonA, { records: { [a1.id]: "present", [a2.id]: "absent" }, complete: true });
  return { label, teacher, groupA, groupB, a1, a2, b1, b2, lessonA, lessonB };
}

async function versionOf(teacher: Staff, group: GroupInfo, lesson: LessonInfo): Promise<number> {
  const journal = await teacher.api.get(`/auth/org/groups/${group.id}/attendance`, { date_from: lesson.date, date_to: lesson.date });
  const version = journal.versions?.[`${lesson.date}_${lesson.id}`];
  expect(typeof version).toBe("number");
  return version;
}

/** Holds the answers of the journal of `group` (only after `arm()`), counts them, lets them go on `release()`. */
async function holdJournalOf(page: Page, group: GroupInfo) {
  let armed = false;
  let held = 0;
  let open!: () => void;
  const gate = new Promise<void>((resolve) => { open = resolve; });
  await page.route(new RegExp(`/auth/org/groups/${group.id}/attendance\\?`), async (route) => {
    if (!armed) return route.continue();
    const response = await route.fetch();
    held += 1;
    await gate;
    await route.fulfill({ response });
  });
  return {
    arm: () => { armed = true; },
    held: () => held,
    release: () => open(),
  };
}

function saveRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/auth\/org\/groups\/[^/]+\/attendance$/.test(request.url())) seen.push(request);
  });
  return seen;
}

/** Opens the panel of the lesson of `group`: the card of the day (dashboard: not the link of the action centre; schedule: the card of the day). */
async function openLesson(page: Page, screen: "dashboard" | "schedule", group: GroupInfo) {
  const card = screen === "dashboard" ? page.locator("p.truncate", { hasText: group.name }).first() : page.getByText(group.name, { exact: true }).first();
  await card.click();
}

/** The teacher marks a student «Не был» in the open panel and saves; returns after the save was sent. */
async function markAbsentAndSave(page: Page, fullName: string) {
  const row = page.getByText(fullName, { exact: true }).locator('xpath=ancestor::div[.//button[normalize-space()="Уважительная"]][1]');
  await row.getByRole("button", { name: "Не был", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить отметки" }).click();
}

for (const screen of ["dashboard", "schedule"] as const) {
  test(`${screen}: a slow answer of lesson A after B was opened does not reach the panel of B @mobile`, async ({ signIn }) => {
    const { teacher, groupA, groupB, a1, a2, b1, b2, lessonA, lessonB } = pairs[screen === "dashboard" ? "Г1" : "Г2"];
    const page = await signIn(teacher);
    const saves = saveRequests(page);
    const slowA = await holdJournalOf(page, groupA);
    await page.goto(`/teacher/${screen}`);
    await expect(page.getByText(groupB.name, { exact: true }).first()).toBeVisible();

    // A: opened, its journal is held
    slowA.arm();
    await openLesson(page, screen, groupA);
    await expect.poll(() => slowA.held()).toBe(1);
    // A closed before it answered, B opened: B answers at once
    await page.keyboard.press("Escape");
    await openLesson(page, screen, groupB);
    const statusOfB = page.getByText("Идёт урок · Посещаемость отмечена");
    const marksOfB = page.getByText("Был: 1 · Опоздал: 1");
    await expect(statusOfB).toBeVisible();
    await expect(marksOfB).toBeVisible();

    // now the old answer of A (a completed lesson, «Был: 1 · Не был: 1») arrives
    slowA.release();
    await page.waitForTimeout(700);
    // B shows B only: its status, its marks, its students - nothing of A
    await expect(statusOfB).toBeVisible();
    await expect(marksOfB).toBeVisible();
    await expect(page.getByText("Был: 1 · Не был: 1")).toHaveCount(0);
    await page.getByRole("button", { name: "Изменить отметки" }).click();
    await expect(page.getByText(b2.fullName, { exact: true })).toBeVisible();
    await expect(page.getByText(b1.fullName, { exact: true })).toBeVisible();
    await expect(page.getByText(a1.fullName, { exact: true })).toHaveCount(0);
    await expect(page.getByText(a2.fullName, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Отметка посещаемости \(2 из 2\)/ })).toBeVisible();

    // the save goes to B with the version of B (and not the version of A)
    const versionB = await versionOf(teacher, groupB, lessonB);
    const versionA = await versionOf(teacher, groupA, lessonA);
    expect(versionB).not.toBe(versionA);
    await markAbsentAndSave(page, b2.fullName);
    await expect(page.getByText("Идёт урок · Посещаемость отмечена")).toBeVisible();
    expect(saves).toHaveLength(1);
    expect(saves[0].url()).toContain(`/groups/${groupB.id}/attendance`);
    const body = saves[0].postDataJSON();
    expect(body.lessonId).toBe(lessonB.id);
    expect(body.expectedVersion).toBe(versionB);
    expect(body.records).toEqual({ [b1.id]: "present", [b2.id]: "absent" });
    if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/after-race-${screen}-${page.viewportSize()?.width}.png` });
    // and the journal of B holds exactly this, the journal of A is untouched
    const journalB = await teacher.api.get(`/auth/org/groups/${groupB.id}/attendance`, { date_from: lessonB.date, date_to: lessonB.date });
    expect(journalB.records[`${lessonB.date}_${lessonB.id}`]).toEqual({ [b1.id]: "present", [b2.id]: "absent" });
    const journalA = await teacher.api.get(`/auth/org/groups/${groupA.id}/attendance`, { date_from: lessonA.date, date_to: lessonA.date });
    expect(journalA.records[`${lessonA.date}_${lessonA.id}`]).toEqual({ [a1.id]: "present", [a2.id]: "absent" });
  });
}

test("schedule: start -> marks -> finish of a lesson", async ({ signIn }) => {
  const teacher: Staff = await org.addStaff("teacher", "Расписанов");
  const group: GroupInfo = await org.createGroup({ name: "Группа Р1", teacherId: teacher.userId });
  const anvar = await org.addStudent(group, "Анвар", "Каримов-Р1");
  const madina = await org.addStudent(group, "Мадина", "Рахимова-Р1");
  const lesson = await org.createLessonStartingNow(group.id);
  const page = await signIn(teacher);
  const saves = saveRequests(page);
  await page.goto("/teacher/schedule");
  await page.getByText(group.name, { exact: true }).first().click();
  await expect(page.getByText("Состав группы (2 ученика)")).toBeVisible();
  await page.getByRole("button", { name: "Начать урок", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Отметка посещаемости \(0 из 2\)/ })).toBeVisible();

  const row = (fullName: string) => page.getByText(fullName, { exact: true }).locator('xpath=ancestor::div[.//button[normalize-space()="Уважительная"]][1]');
  await row(anvar.fullName).getByRole("button", { name: "Был", exact: true }).click();
  await row(madina.fullName).getByRole("button", { name: "Уважительная", exact: true }).click();
  await page.getByRole("textbox", { name: /Причина уважительного пропуска/ }).fill("Болела, температура");
  await page.getByRole("button", { name: "Сохранить отметки" }).click();
  await expect(page.getByText("Идёт урок · Посещаемость отмечена")).toBeVisible();
  expect(saves.map((request) => request.postDataJSON().lessonId)).toEqual([lesson.id]);

  const journal = await teacher.api.get(`/auth/org/groups/${group.id}/attendance`, { date_from: lesson.date, date_to: lesson.date });
  expect(journal.records[`${lesson.date}_${lesson.id}`]).toEqual({ [anvar.id]: "present", [madina.id]: "excused" });

  await page.getByRole("button", { name: "Завершить урок" }).click();
  await expect(page.getByText("Завершён", { exact: true }).first()).toBeVisible();
  const after = await teacher.api.get(`/auth/org/groups/${group.id}/attendance`, { date_from: lesson.date, date_to: lesson.date });
  expect(after.statuses[`${lesson.date}_${lesson.id}`]).toBe("completed");
});

/**
 * R3 (1, 2): the answer of a WRITE. «Сохранить отметки» of lesson A is on its way (page.route holds the REAL request), the teacher closes the panel
 * and opens lesson B, then A answers: the panel of B is not touched, a refusal of A is a notice of the page (the dashboard's toast, the schedule's
 * list) and the journal of B stays as it was.
 */
async function writeRaceWorld(label: string) {
  const teacher: Staff = await org.addStaff("teacher", `Писарев${label}`);
  const groupA: GroupInfo = await org.createGroup({ name: `Группа В${label}`, teacherId: teacher.userId });
  const groupB: GroupInfo = await org.createGroup({ name: `Группа Г${label}`, teacherId: teacher.userId });
  const a1 = await org.addStudent(groupA, "Азиз", `Алиев${label}`);
  const a2 = await org.addStudent(groupA, "Алина", `Абдуллаева${label}`);
  const b1 = await org.addStudent(groupB, "Бобур", `Бакиров${label}`);
  const b2 = await org.addStudent(groupB, "Барно", `Бекова${label}`);
  const lessonA = await org.createLessonStartingNow(groupA.id);
  const lessonB = await org.createLessonStartingNow(groupB.id, org.owner, 10, 12); // later today: not started, no record, no version
  await runLesson(teacher, lessonA, { records: { [a1.id]: "present", [a2.id]: "present" } });
  return { teacher, groupA, groupB, a1, a2, b1, b2, lessonA, lessonB };
}

const dayLabel = (date: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00Z`));

for (const screen of ["dashboard", "schedule"] as const) {
  for (const variant of ["accepted", "refused", "conflict"] as const) {
    test(`${screen}: the answer of the save of lesson A (${variant}) after B was opened leaves the panel of B alone @mobile`, async ({ signIn }) => {
      const world = await writeRaceWorld(`${screen[0]}${variant[0]}`);
      const { teacher, groupA, groupB, a1, a2, lessonA, lessonB } = world;
      const page = await signIn(teacher);
      let armed = false;
      let held = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      await page.route(new RegExp(`/auth/org/groups/${groupA.id}/attendance$`), async (route) => {
        if (!armed || route.request().method() !== "POST") return route.continue();
        held += 1;
        await gate;
        if (variant === "refused") return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ detail: "Нельзя сохранить" }) });
        return route.continue(); // `conflict`: by now somebody else saved A, the request carries the old version and the server says so
      });
      await page.goto(`/teacher/${screen}`);
      await expect(page.getByText(groupB.name, { exact: true }).first()).toBeVisible();

      // A: change a mark and press «Сохранить отметки»; the request is held
      await openLesson(page, screen, groupA);
      await page.getByRole("button", { name: "Изменить отметки" }).click();
      armed = true;
      await markAbsentAndSave(page, a2.fullName);
      await expect.poll(() => held).toBe(1);
      // closes A while the save is on its way, opens B (later today: «Урок ещё не начался», no marks)
      await page.keyboard.press("Escape");
      await openLesson(page, screen, groupB);
      await expect(page.getByText("Урок ещё не начался", { exact: true })).toBeVisible();
      if (variant === "conflict") {
        // somebody saves A in the other window: the version of A moves on
        await teacher.api.post(`/auth/org/groups/${groupA.id}/attendance`, { lessonDate: lessonA.date, lessonId: lessonA.id, status: "in_progress", records: { [a1.id]: "absent", [a2.id]: "present" } });
      }
      release();
      await page.waitForTimeout(900);

      // the panel of B is B's: its roster, no marks, no status of A, no dialog of a conflict
      await expect(page.getByText("Урок ещё не начался", { exact: true })).toBeVisible();
      await expect(page.getByText("Идёт урок · Посещаемость отмечена")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: /Отметка посещаемости/ })).toHaveCount(0);
      await expect(page.getByText("Принять чужие")).toHaveCount(0);
      const journalB = await teacher.api.get(`/auth/org/groups/${groupB.id}/attendance`, { date_from: lessonB.date, date_to: lessonB.date });
      expect(journalB.records?.[`${lessonB.date}_${lessonB.id}`] ?? {}).toEqual({});
      expect(journalB.statuses?.[`${lessonB.date}_${lessonB.id}`] ?? "scheduled").toBe("scheduled");

      const journalA = await teacher.api.get(`/auth/org/groups/${groupA.id}/attendance`, { date_from: lessonA.date, date_to: lessonA.date });
      const recordsA = journalA.records[`${lessonA.date}_${lessonA.id}`];
      // the dashboard shows a toast; the schedule keeps the notice in the list of its page AND shows a toast (the list lies under the open panel)
      const expectNotice = async (text: string) => {
        await expect(page.locator("#toast-host").getByText(text)).toBeVisible();
        if (screen === "schedule") await expect(page.getByRole("listitem").filter({ hasText: text })).toHaveCount(1);
      };
      const refusedText = `Не сохранено: ${groupA.name}, ${dayLabel(lessonA.date)} — откройте урок и повторите`;
      const conflictText = "Урок изменили в другом окне — откройте его снова";
      if (variant === "accepted") {
        expect(recordsA).toEqual({ [a1.id]: "present", [a2.id]: "absent" });
        await expect(page.getByText(/Не сохранено|Урок изменили/)).toHaveCount(0);
      } else if (variant === "refused") {
        expect(recordsA).toEqual({ [a1.id]: "present", [a2.id]: "present" });
        await expectNotice(refusedText);
      } else {
        expect(recordsA).toEqual({ [a1.id]: "absent", [a2.id]: "present" }); // the other window's save stands
        await expectNotice(conflictText);
      }
      if (process.env.E2E_SHOTS && variant === "refused") await page.screenshot({ path: `${process.env.E2E_SHOTS}/after-write-refused-${screen}-${page.viewportSize()?.width}.png` });
    });
  }
}

test("a double press of «Начать урок» is one request @mobile", async ({ signIn }) => {
  const teacher: Staff = await org.addStaff("teacher", "Двойнов");
  const group: GroupInfo = await org.createGroup({ name: "Группа Д1", teacherId: teacher.userId });
  await org.addStudent(group, "Анвар", "Каримов-Д1");
  await org.createLessonStartingNow(group.id);
  const page = await signIn(teacher);
  let starts = 0;
  await page.route(new RegExp(`/auth/org/groups/${group.id}/attendance/start$`), async (route) => {
    starts += 1;
    await new Promise((resolve) => setTimeout(resolve, 600)); // a slow network: the second press comes while the first is on its way
    await route.continue();
  });
  await page.goto("/teacher/dashboard");
  await page.getByText(group.name, { exact: false }).first().waitFor();
  await page.locator("p.truncate", { hasText: group.name }).first().click();
  const start = page.getByRole("button", { name: "Начать урок", exact: true });
  await start.dblclick();
  await expect(page.getByRole("heading", { name: /Отметка посещаемости \(0 из 1\)/ })).toBeVisible();
  expect(starts).toBe(1);
  await expect(page.getByText(/Не удалось начать урок|уже начат/)).toHaveCount(0);
});
