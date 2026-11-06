// Design-system waves 0-1: `node tests/dom/ds-shots.cjs <out dir> <tailwind css>` - PNGs of the gallery and of whole screens (1280 / 1024 / 375) by the REAL components; `layoutProbe` and
// `touchTargets` of every picture.  Only the gallery entry (tests/dom/ds.entry.tsx) is new; the other pictures of the round come from tests/dom/shots.cjs.
const fs = require("node:fs");
const path = require("node:path");
const out = process.argv[2];
process.env.DOM_CSS = process.argv[3];
const { launch, openPage } = require("../helpers/dom-page.cjs");
const { layoutProbe, touchTargets } = require("../helpers/layout-probe.cjs");

const GROUP = (id, name, level, extra = {}) => ({ id, org_id: "o1", name, class_level: level, teacher_id: "t1", teacher_name: "Каримова К.", description: null, schedule: [{ id: `${id}s`, dayOfWeek: 1, startTime: "16:00", endTime: "17:30", room: "Каб. 3", format: "offline", subject: "Алгебра" }], status: "active", max_students: 12, student_count: 9, students_count: 9, lesson_type: "group", ...extra });
const GROUPS = [GROUP("g1", "7-А Алгебра", 7), GROUP("g2", "7-Б Геометрия", 7, { student_count: 4, students_count: 4 }), GROUP("g3", "9-Б Подготовка к ОГЭ", 9, { student_count: 11, students_count: 11 })];
const occ = (id, g, name, day, start, end, room, extra = {}) => ({ id, groupId: g, groupName: name, classLevel: 7, subject: "Алгебра", dayOfWeek: 3, startTime: start, endTime: end, room, format: "offline", color: "blue", occurrenceDate: day, isRescheduled: false, ...extra });
const TODAY = [occ("l1", "g1", "7-А Алгебра", "2026-11-05", "09:00", "10:30", "Каб. 3"), occ("l2", "g2", "7-Б Геометрия", "2026-11-05", "11:00", "12:30", "Каб. 5"), occ("l3", "g3", "9-Б Подготовка к ОГЭ", "2026-11-05", "16:00", "17:30", null, { format: "online", color: "indigo" })];
const EXAM = (id, title, status, extra = {}) => ({ exam_id: id, title, status, delivery_mode: "online", access_code: "A7K2", tasks_per_variant: 12, tasks_count: 12, variants_count: 2, total_time_minutes: 45, sessions_count: 0, group_id: "g1", group_name: "7-А Алгебра", class_level: 7, teacher_name: "Каримова К.", skills_covered: [], pass_threshold_pct: 60, ...extra });
const server = (request) => {
  const { method, path: p } = request;
  if (method === "GET" && p === "/auth/org/groups") return { json: GROUPS };
  if (method === "GET" && p === "/auth/org/teacher/dashboard/summary") return { json: { businessDate: "2026-11-05", groups: GROUPS, studentCount: 24, todayLessons: TODAY, scheduleWindow: TODAY, openAttendanceActions: [], attendanceStates: [] } };
  if (method === "GET" && p === "/auth/org/schedule") return { json: TODAY.map((x) => ({ ...x })) };
  if (method === "GET" && p === "/auth/org/schedule/occurrences") return { json: TODAY };
  if (method === "GET" && p === "/auth/org/attendance/open-actions") return { json: [] };
  if (method === "GET" && /\/groups\/[^/]+\/attendance$/.test(p)) return { json: [] };
  if (method === "GET" && p === "/exams/live-summary") return { json: [] };
  if (method === "GET" && p === "/exams") return { json: { items: [EXAM("e1", "Контрольная: квадратные уравнения", "draft"), EXAM("e2", "Диагностика 7 класс", "lobby", { access_code: "K9M3" }), EXAM("e3", "Итоговая за четверть", "closed", { sessions_count: 9 })], total: 3, page: 1, size: 50, has_more: false } };
  return null;
};
const SIZES = [[1280, 900], [1024, 800], [375, 812]];
const SHOTS = [
  { name: "gallery", mount: "gallery" },
  { name: "gallery-question", mount: "gallery", act: async (page) => { await page.click("#open-question"); await page.waitForSelector('[role="dialog"]'); await page.waitForTimeout(500); }, probe: '[role="dialog"]' },
  { name: "gallery-form", mount: "gallery", act: async (page) => { await page.click("#open-form"); await page.waitForSelector('[role="dialog"]'); await page.waitForTimeout(500); }, probe: '[role="dialog"]' },
  { name: "toast-success", mount: "gallery", act: async (page) => { await page.click("#toast-ok"); await page.waitForSelector("#toast-host [role=status]"); await page.waitForTimeout(700); } },
  { name: "toast-warning", mount: "gallery", act: async (page) => { await page.click("#toast-warn"); await page.waitForSelector("#toast-host [role=status]"); await page.waitForTimeout(700); } },
  { name: "toast-error", mount: "gallery", act: async (page) => { await page.click("#toast-err"); await page.waitForSelector("#toast-host [role=alert]"); await page.waitForTimeout(700); } },
  { name: "groups", mount: "groups", act: async (page) => { await page.waitForTimeout(900); } },
  { name: "payments", mount: "payments", act: async (page) => { await page.waitForTimeout(900); } },
  { name: "teacher-dashboard", mount: "teacherDashboard", user: { role: "teacher", org_role: "teacher" }, act: async (page) => { await page.waitForTimeout(1200); } },
  { name: "teacher-schedule", mount: "teacherSchedule", user: { role: "teacher", org_role: "teacher" }, act: async (page) => { await page.waitForTimeout(1200); } },
  { name: "teacher-exams", mount: "teacherExams", user: { role: "teacher", org_role: "teacher" }, act: async (page) => { await page.waitForTimeout(1200); } },
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await launch();
  const report = [];
  const only = process.env.SHOTS ? process.env.SHOTS.split(",") : null;
  for (const shot of SHOTS.filter((item) => !only || only.some((prefix) => item.name.startsWith(prefix)))) {
    for (const [width, height] of shot.sizes ?? SIZES) {
      const { page, errors, calls } = await openPage(browser, "ds.entry.tsx", server, { width, height });
      await page.evaluate(() => { const opener = document.createElement("button"); opener.id = "__opener"; opener.textContent = "."; opener.style.cssText = "position:fixed;left:0;top:0;width:4px;height:4px;padding:0;border:0;opacity:0"; document.body.appendChild(opener); });
      await page.click("#__opener", { force: true });
      await page.clock.setFixedTime(new Date("2026-11-05T10:00:00+05:00"));
      await page.evaluate(([name, user]) => window.mount(name, user), [shot.mount, shot.user ?? { role: "owner", org_role: "owner" }]);
      try { if (shot.act) await shot.act(page); else await page.waitForTimeout(500); } catch (error) { report.push(`${shot.name} ${width}: ACT FAILED ${String(error).split("\n")[0]}`); }
      const layout = await page.evaluate(layoutProbe, shot.probe ?? "body");
      const small = await page.evaluate(touchTargets, shot.probe ?? "body");
      await page.screenshot({ path: path.join(out, `${shot.name}-${width}.png`), fullPage: !shot.probe });
      if (process.env.ERR) console.log([...new Set(calls.map((c) => `${c.method} ${c.path}`))].join(", "));
      report.push(`${shot.name} ${width}: layout=${layout.bad.length === 0 ? "ok" : JSON.stringify(layout.bad.slice(0, 3))} pageScroll=${layout.scroll} small(<40)=${small.length}${small.length ? " " + JSON.stringify(small.slice(0, 4)) : ""} errors=${errors.length}`);
      await page.close();
    }
  }
  await browser.close();
  console.log(report.join("\n"));
})();
