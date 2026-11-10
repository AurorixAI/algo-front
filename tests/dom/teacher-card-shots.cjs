// Owner 10.11 (cards «Ближайшее действие»): `node tests/dom/teacher-card-shots.cjs <out dir> <tailwind css>` - «Расписание» and «Главная» of a teacher with a missed lesson, 1280 / 1024 / 375.
// (copy of the data of ds-shots.cjs)
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
const MISSED = { actionType: "missed", groupId: "g9", groupName: "Индивидуально: Азизов", classLevel: 9, lessonId: "l9", lessonDate: "2026-11-09", subject: "Алгебра", startTime: "16:00", endTime: "17:00", room: null, format: "offline", topic: null, markedCount: 0, rosterCount: 0, remainingCount: 0, teacherId: "t1", teacherName: "Каримова К." };
const server2 = (request) => {
  if (request.method === "GET" && request.path === "/auth/org/attendance/open-actions") return { json: [MISSED] };
  if (request.method === "GET" && request.path === "/auth/org/teacher/dashboard/summary") { const base = server(request); return { json: { ...base.json, openAttendanceActions: [MISSED] } }; }
  return server(request);
};
const SIZES = [[1280, 900], [1024, 800], [375, 812]];
const SHOTS = [
  { name: "T-teacher-schedule", mount: "teacherSchedule" },
  { name: "T-teacher-dashboard", mount: "teacherDashboard" },
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await launch();
  for (const shot of SHOTS) {
    for (const [width, height] of SIZES) {
      const { page } = await openPage(browser, "ds.entry.tsx", server2, { width, height });
      await page.clock.setFixedTime(new Date("2026-11-10T09:00:00+05:00"));
      await page.evaluate(([name]) => window.mount(name, { role: "teacher", org_role: "teacher" }, {}), [shot.mount]);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, `${shot.name}-${width}.png`) });
      if (shot.mount === "teacherSchedule") {
        const m = await page.evaluate(() => { const cards = [...document.querySelectorAll('[data-testid="schedule-next-step"]')]; const c = cards[0]; const d = document.querySelector('[data-testid="schedule-next-step-description"]'); return c ? { cardH: Math.round(c.getBoundingClientRect().height), descH: d ? Math.round(d.getBoundingClientRect().height) : null, descOverflow: d ? d.scrollWidth > d.clientWidth : null, text: d && d.textContent } : null; });
        console.log(shot.name, width, JSON.stringify(m));
      }
      await page.close();
    }
  }
  await browser.close();
})();
