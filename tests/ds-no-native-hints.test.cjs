// The window «Добавить урок в расписание» of the TEACHER: an empty time says OUR two sentences after the first try, the focus goes to the first empty field, and the browser's own
// «Please fill out this field.» is never shown (the form is noValidate; TimeInput / DateInput carry a Russian validity message of their own as a safety net).
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const root = path.join(__dirname, "..");

const GROUPS = [{ id: "g1", org_id: "o1", name: "7-А Алгебра", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", schedule: [], status: "active", max_students: 12, student_count: 9, students_count: 9, lesson_type: "group" }];
const server = ({ method, path: p }) => {
  if (method === "GET" && p === "/auth/org/groups") return { json: GROUPS };
  if (method === "GET" && (p === "/auth/org/schedule" || p === "/auth/org/schedule/occurrences")) return { json: [] };
  if (method === "GET" && p === "/auth/org/attendance/open-actions") return { json: [] };
  if (method === "GET" && /makeup-candidates/.test(p)) return { json: { items: [], emptyReason: "" } };
  return null;
};
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

test("teacher: empty time + «Сохранить урок» → «Укажите время начала» and «Укажите время окончания» (ours), no browser hint, focus on the first empty field", async () => {
  const { page } = await openPage(browser, "ds.entry.tsx", server, { width: 1280, height: 900 });
  await page.evaluate(() => window.mount("teacherSchedule", { role: "teacher", org_role: "teacher" }, {}));
  await page.waitForSelector('button:has-text("Добавить в расписание")');
  await page.click('button:has-text("Добавить в расписание")');
  await page.waitForSelector("#schedule-add-lesson-form");
  assert.equal(await page.getAttribute("#schedule-add-lesson-form", "novalidate"), "", "the form is noValidate");
  if (await page.locator('[data-testid="sched-add-purpose-extra"]').count()) await page.click('[data-testid="sched-add-purpose-extra"]');
  await page.click('button:has-text("Сохранить урок")');
  await page.waitForSelector('[data-testid="sched-add-end-required"]');
  const dialog = page.getByRole("dialog").first();
  const text = await dialog.innerText();
  assert.match(text, /Укажите время начала/);
  assert.match(text, /Укажите время окончания/);
  const hints = await page.evaluate(() => [...document.querySelectorAll("#schedule-add-lesson-form input")].map((el) => el.validationMessage).filter((m) => m && !/[А-Яа-я]/.test(m)));
  assert.deepEqual(hints, [], "no English validity message of the browser on any field");
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "sched-add-nachalo", null, { timeout: 10000, polling: "raf" });
  assert.equal(await page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.outerHTML.slice(0, 200))), "sched-add-nachalo", "the focus is on the first empty time field");
  await page.close();
});
