// Owner 10.11 (walk DS6): the card «Ближайшее действие» on a NARROW row: the title wraps by WORDS only, the «date · lesson» line is ONE line, the arrow stays inside the card, the tone is the same on
// «Главная» and «Расписание» (a task that needs action = warning, yellow).  1024 / 1280 / 1440 / 375, with and without the 240 px sidebar of the cabinet.  Real browser, real CSS.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const root = path.join(__dirname, "..");

const GROUP = (id, name, level, extra = {}) => ({ id, org_id: "o1", name, class_level: level, teacher_id: "t1", teacher_name: "Каримова К.", description: null, schedule: [{ id: `${id}s`, dayOfWeek: 1, startTime: "16:00", endTime: "17:30", room: "Каб. 3", format: "offline", subject: "Алгебра" }], status: "active", max_students: 12, student_count: 9, students_count: 9, lesson_type: "group", ...extra });
const GROUPS = [GROUP("g1", "7-А Алгебра", 7), GROUP("g2", "7-Б Геометрия", 7, { student_count: 4, students_count: 4 }), GROUP("g3", "9-Б Подготовка к ОГЭ", 9, { student_count: 11, students_count: 11 })];
const occ = (id, g, name, day, start, end, room, extra = {}) => ({ id, groupId: g, groupName: name, classLevel: 7, subject: "Алгебра", dayOfWeek: 3, startTime: start, endTime: end, room, format: "offline", color: "blue", occurrenceDate: day, isRescheduled: false, ...extra });
const TODAY = [occ("l1", "g1", "7-А Алгебра", "2026-11-05", "09:00", "10:30", "Каб. 3"), occ("l2", "g2", "7-Б Геометрия", "2026-11-05", "11:00", "12:30", "Каб. 5"), occ("l3", "g3", "9-Б Подготовка к ОГЭ", "2026-11-05", "16:00", "17:30", null, { format: "online", color: "indigo" })];
const server = (request) => {
  const { method, path: p } = request;
  if (method === "GET" && p === "/auth/org/groups") return { json: GROUPS };
  if (method === "GET" && p === "/auth/org/teacher/dashboard/summary") return { json: { businessDate: "2026-11-05", groups: GROUPS, studentCount: 24, todayLessons: TODAY, scheduleWindow: TODAY, openAttendanceActions: [], attendanceStates: [] } };
  if (method === "GET" && p === "/auth/org/schedule") return { json: TODAY.map((x) => ({ ...x })) };
  if (method === "GET" && p === "/auth/org/schedule/occurrences") return { json: TODAY };
  if (method === "GET" && p === "/auth/org/attendance/open-actions") return { json: [] };
  if (method === "GET" && /\/groups\/[^/]+\/attendance$/.test(p)) return { json: [] };
  if (method === "GET" && p === "/exams/live-summary") return { json: [] };
  return null;
};
const MISSED = { actionType: "missed", groupId: "g9", groupName: "Индивидуально: Азизов", classLevel: 9, lessonId: "l9", lessonDate: "2026-11-09", subject: "Алгебра", startTime: "16:00", endTime: "17:00", room: null, format: "offline", topic: null, markedCount: 0, rosterCount: 0, remainingCount: 0, teacherId: "t1", teacherName: "Каримова К." };
const server2 = (request) => {
  if (request.method === "GET" && request.path === "/auth/org/attendance/open-actions") return { json: [MISSED] };
  if (request.method === "GET" && request.path === "/auth/org/teacher/dashboard/summary") { const base = server(request); return { json: { ...base.json, openAttendanceActions: [MISSED] } }; }
  return server(request);
};
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const WAIT = { timeout: 10000, polling: "raf" };
const MEASURE = `(() => {
  const q = (sel) => document.querySelector(sel);
  const wordsOk = (el) => { const node = [...el.childNodes].find((n) => n.nodeType === 3); const text = node.textContent; const bad = []; for (const m of text.matchAll(/\\S+/g)) { const r = document.createRange(); r.setStart(node, m.index); r.setEnd(node, m.index + m[0].length); if (r.getClientRects().length !== 1 || r.getBoundingClientRect().width > el.clientWidth + 0.5) bad.push(m[0]); } return bad; };
  const oneLine = (el) => getComputedStyle(el).whiteSpace === "nowrap" && el.getBoundingClientRect().height <= 26;
  const inside = (el, card) => { const a = el.getBoundingClientRect(), b = card.getBoundingClientRect(); return a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5; };
  return { q, wordsOk, oneLine, inside };
})()`;

for (const width of [1024, 1280, 1440, 375]) {
  for (const sidebar of width >= 1024 ? [0, 240] : [0]) {
    test(`${width}${sidebar ? " with the 240 px sidebar" : ""}: «Расписание» - words whole, the date in one line, the arrow inside the card; «Главная» - the same tone`, async () => {
      const { page } = await openPage(browser, "ds.entry.tsx", server2, { width, height: 900 });
      await page.clock.setFixedTime(new Date("2026-11-10T09:00:00+05:00"));
      await page.evaluate((pad) => { document.getElementById("root").style.paddingLeft = pad + "px"; window.mount("teacherSchedule", { role: "teacher", org_role: "teacher" }, {}); }, sidebar);
      await page.waitForSelector('[data-testid="schedule-next-step"][data-step="action"]', { timeout: 10000 });
      await page.waitForFunction(() => document.querySelector('[data-testid="schedule-next-step-description"]')?.textContent?.includes("Азизов"), null, WAIT);
      const schedule = await page.evaluate(`(() => {
        const m = ${MEASURE}; const card = m.q('[data-testid="schedule-next-step"]'); const title = m.q('[data-testid="schedule-next-step-title"]'); const date = m.q('[data-testid="schedule-next-step-description"]'); const arrow = m.q('[data-testid="schedule-next-step-arrow"]');
        const rect = card.getBoundingClientRect();
        return { badWords: m.wordsOk(title), dateOneLine: m.oneLine(date), dateTitle: date.getAttribute("title"), arrowInside: m.inside(arrow, card), tone: card.dataset.tone, border: getComputedStyle(card).borderTopColor, bg: getComputedStyle(card).backgroundColor, cardWidth: Math.round(rect.width), titleText: title.textContent };
      })()`);
      assert.deepEqual(schedule.badWords, [], `a word broken in the middle: ${schedule.badWords}`);
      assert.ok(schedule.dateOneLine, "the «date · lesson» line is ONE line");
      assert.match(schedule.dateTitle, /Азизов/, "the full text is in title");
      assert.ok(schedule.arrowInside, "the arrow is inside the card");
      assert.equal(schedule.tone, "rose");
      if (width >= 1024) assert.ok(schedule.cardWidth >= 260 || schedule.cardWidth >= 420, `a card of the row is ${schedule.cardWidth}px: four in a row only from 260 px`);
      await page.close();

      const home = await openPage(browser, "ds.entry.tsx", server2, { width, height: 900 });
      await home.page.clock.setFixedTime(new Date("2026-11-10T09:00:00+05:00"));
      await home.page.evaluate((pad) => { document.getElementById("root").style.paddingLeft = pad + "px"; window.mount("teacherDashboard", { role: "teacher", org_role: "teacher" }, {}); }, sidebar);
      await home.page.waitForFunction(() => document.querySelector('[data-testid="next-action-card"][data-step="action"]') && document.querySelector('[data-testid="next-action-description"]')?.textContent?.includes("Азизов"), null, WAIT);
      const dashboard = await home.page.evaluate(`(() => {
        const m = ${MEASURE}; const card = m.q('[data-testid="next-action-card"]'); const title = m.q('[data-testid="next-action-title"]'); const date = m.q('[data-testid="next-action-description"]');
        return { badWords: m.wordsOk(title), dateOneLine: m.oneLine(date), tone: card.dataset.tone, border: getComputedStyle(card).borderTopColor, bg: getComputedStyle(card).backgroundColor, button: m.inside(card.querySelector("button"), card) };
      })()`);
      assert.deepEqual(dashboard.badWords, []);
      assert.ok(dashboard.dateOneLine, "«Главная»: the line is ONE line");
      assert.ok(dashboard.button, "the button is inside the card");
      assert.equal(dashboard.tone, schedule.tone, "the same tone on both screens");
      assert.equal(dashboard.border, schedule.border, "the same border colour (yellow, not grey)");
      assert.equal(dashboard.bg, schedule.bg, "the same fill");
      await home.page.close();
    });
  }
}
