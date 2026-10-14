const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
const lib = (name) => require(path.join(__dirname, `../src/lib/${name}.ts`));
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const openLessons = lib("open-lessons");
const deadline = lib("excuse-deadline");
const businessTime = lib("business-time");
const phone = lib("phone");

const action = (over) => ({
  actionType: "missed", groupId: "g1", groupName: "Группа А", classLevel: 9, lessonId: "s1",
  lessonDate: "2026-10-13", subject: "Математика", startTime: "10:00", endTime: "11:00",
  markedCount: 0, rosterCount: 0, remainingCount: 0, teacherId: "t1", teacherName: "Пётр Иванов", ...over,
});

// ---- wording ---------------------------------------------------------------

test("status chips say what is wrong, with a tooltip", () => {
  assert.equal(openLessons.openLessonStatus(action({})), "Посещаемость не отмечена");
  assert.equal(openLessons.openLessonStatusHint(action({})), "Урок был по расписанию, но журнал не открывали");
  const started = action({ actionType: "in_progress", markedCount: 3, rosterCount: 8 });
  assert.equal(openLessons.openLessonStatus(started), "Урок не завершён · отмечено 3 из 8");
  assert.equal(openLessons.openLessonStatusHint(started), "Журнал открыт, урок не завершён");
  assert.doesNotMatch(read("src/lib/open-lessons.ts"), /Не начат/);
});

// ---- grouping by teacher ----------------------------------------------------

test("open lessons are grouped by teacher: most lessons first, then name, no-teacher last", () => {
  const groups = openLessons.groupOpenLessonsByTeacher([
    action({ lessonId: "a", teacherId: "t2", teacherName: "Мария Орлова", lessonDate: "2026-10-01" }),
    action({ lessonId: "b", teacherId: "t1", teacherName: "Пётр Иванов", lessonDate: "2026-10-02" }),
    action({ lessonId: "c", teacherId: "t1", teacherName: "Пётр Иванов", lessonDate: "2026-10-09" }),
    action({ lessonId: "d", teacherId: null, teacherName: null }),
    action({ lessonId: "e", teacherId: null, teacherName: null }),
    action({ lessonId: "f", teacherId: null, teacherName: null }),
    action({ lessonId: "g", teacherId: "t3", teacherName: "Анна Белова" }),
  ]);
  assert.deepEqual(groups.map((g) => [g.teacherName, g.items.length]), [
    ["Пётр Иванов", 2],
    ["Анна Белова", 1], // equal count: by name
    ["Мария Орлова", 1],
    ["Без преподавателя", 3], // always last, even though it has the most lessons
  ]);
  // rows inside a group: newest first
  assert.deepEqual(groups[0].items.map((i) => i.lessonId), ["c", "b"]);
  assert.deepEqual(openLessons.groupOpenLessonsByTeacher([]), []);
});

test("one teacher is one group even when the name is missing on some rows", () => {
  const groups = openLessons.groupOpenLessonsByTeacher([
    action({ lessonId: "a", teacherId: "t1", teacherName: "Пётр Иванов" }),
    action({ lessonId: "b", teacherId: "t1", teacherName: null }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].teacherName, "Пётр Иванов");
});

// ---- refetch rule -----------------------------------------------------------

test("the list is re-read once per badge change, only when they disagree", () => {
  const need = openLessons.shouldRefetchForBadge;
  assert.equal(need(true, 4, 5, null), true); // the owner closed one lesson in the journal
  assert.equal(need(true, 4, 5, 4), false); // already re-read for 4: no loop
  assert.equal(need(true, 3, 5, 4), true); // the badge moved again
  assert.equal(need(true, 5, 5, null), false);
  assert.equal(need(false, 0, 5, null), false); // not loaded yet: the first load is in flight
});

test("the open lessons view refreshes on focus, after actions and on badge changes", () => {
  const view = read("src/components/attendance/open-lessons-view.tsx");
  assert.match(view, /addEventListener\("focus"/);
  assert.match(view, /addEventListener\("visibilitychange"/);
  assert.match(view, /shouldRefetchForBadge/);
  assert.match(view, /load\(\{ silent: true \}\)/);
  // a late response of an older request never overwrites a newer one
  assert.match(view, /sequence\.isCurrent\(token\)/);
});

// ---- row menu ---------------------------------------------------------------

test("a row has ONE «⋯» menu: no «Открыть журнал» link, «Урока не было» only for a missed lesson", () => {
  const view = read("src/components/attendance/open-lessons-view.tsx");
  assert.match(view, /RowMenu/);
  assert.doesNotMatch(view, /Открыть журнал/);
  assert.match(view, /label: "Отметить в журнале"/);
  assert.match(view, /label: "Открыть в журнале"/);
  assert.match(view, /label: "Урока не было"/);
  const inProgress = view.slice(view.indexOf('if (item.actionType === "in_progress")'), view.indexOf("return [", view.indexOf('if (item.actionType === "in_progress")')));
  assert.doesNotMatch(inProgress, /Урока не было/);
  // the journal and the list share one dialog (and so one API call)
  assert.match(view, /CancelMissedLessonModal/);
  assert.match(read("src/components/groups/group-attendance-journal.tsx"), /CancelMissedLessonModal/);
  assert.match(read("src/components/attendance/cancel-missed-lesson-modal.tsx"), /orgApi\.cancelMissedGroupAttendance/);
  assert.doesNotMatch(read("src/components/groups/group-attendance-journal.tsx"), /cancelMissedGroupAttendance/);
});

// ---- deep link --------------------------------------------------------------

test("journal link carries the lesson and its date; invalid parts are left out", () => {
  const a = action({ groupId: "G-7", lessonId: "s2", lessonDate: "2026-09-30" });
  assert.equal(openLessons.journalHref("/admin/groups", a), "/admin/groups/G-7?tab=attendance&month=2026-09&lesson=s2&date=2026-09-30");
  assert.equal(
    openLessons.journalHref("/owner/groups", action({ groupId: "G", lessonId: "lesson 1/x", lessonDate: "2026-09-30" })),
    "/owner/groups/G?tab=attendance&month=2026-09",
  );
  assert.equal(
    openLessons.journalHref("/owner/groups", action({ groupId: "G", lessonId: "s1", lessonDate: "2026-02-30" })),
    "/owner/groups/G?tab=attendance&month=2026-02",
  );
  assert.equal(openLessons.journalHref("/admin/groups", action({ groupId: "G", lessonDate: "bad" })), "/admin/groups/G?tab=attendance");
});

test("?lesson= and ?date= are read only when both are valid", () => {
  const parse = openLessons.parseJournalHighlight;
  assert.deepEqual(parse("s2", "2026-09-30"), { lessonId: "s2", date: "2026-09-30" });
  assert.deepEqual(parse("live-today", "2026-10-15"), { lessonId: "live-today", date: "2026-10-15" });
  assert.deepEqual(parse("lesson_1.a:b", "2024-02-29"), { lessonId: "lesson_1.a:b", date: "2024-02-29" });
  for (const [id, date] of [
    [null, "2026-09-30"], ["s2", null], ["", "2026-09-30"], ["s2", ""], ["s2", "2026-02-30"], ["s2", "2026-13-01"],
    ["s2", "30.09.2026"], ["s2", "1999-12-31"], ["s2", "2026-09-30T10:00"], ["<script>", "2026-09-30"], ["a b", "2026-09-30"],
    ["x".repeat(81), "2026-09-30"], [undefined, undefined],
  ]) {
    assert.equal(parse(id, date), null, `${id} ${date}`);
  }
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /parseJournalHighlight/);
  assert.match(journal, /data-lesson-key/);
  for (const role of ["admin", "owner"]) {
    const page = read(`src/app/${role}/groups/[id]/page.tsx`);
    assert.match(page, /highlightLessonId=\{searchParams\?\.get\("lesson"\)\}/, role);
    assert.match(page, /highlightDate=\{searchParams\?\.get\("date"\)\}/, role);
  }
});

// ---- excuse deadline and phone ---------------------------------------------

test("an excuse must be decided by the end of the lesson's month", () => {
  assert.equal(deadline.excuseDeadline("2026-10-03"), "2026-10-31");
  assert.equal(deadline.excuseDeadline("2026-09-30"), "2026-09-30");
  assert.equal(deadline.excuseDeadline("2026-02-10"), "2026-02-28");
  assert.equal(deadline.excuseDeadline("2028-02-10"), "2028-02-29");
  assert.equal(deadline.excuseDeadline("2026-12-31"), "2026-12-31");
  for (const bad of ["", null, undefined, "bad", "2026-13-01"]) assert.equal(deadline.excuseDeadline(bad), null, String(bad));
});

test("deadline hint: days left, the last day, overdue in amber, nothing for decided excuses", () => {
  const hint = (lesson, status, today) => deadline.excuseDeadlineHint(lesson, status, today);
  assert.deepEqual(hint("2026-10-03", "pending", "2026-10-15"), { text: "подтвердить до 31.10 · осталось 16 дн.", overdue: false, daysLeft: 16 });
  assert.equal(hint("2026-10-03", "pending", "2026-10-30").text, "подтвердить до 31.10 · осталось 1 дн.");
  assert.equal(hint("2026-10-03", "pending", "2026-10-31").text, "подтвердить до 31.10 · последний день");
  assert.deepEqual(hint("2026-09-20", "pending", "2026-10-01"), { text: "подтвердить до 30.09 · срок прошёл", overdue: true, daysLeft: -1 });
  assert.equal(hint("2026-09-20", "pending", "2027-01-05").overdue, true);
  // across a year edge and a leap day
  assert.equal(hint("2026-12-10", "pending", "2026-12-30").text, "подтвердить до 31.12 · осталось 1 дн.");
  assert.equal(hint("2028-02-01", "pending", "2028-02-27").text, "подтвердить до 29.02 · осталось 2 дн.");
  assert.equal(hint("2026-10-03", "confirmed", "2026-10-15"), null);
  assert.equal(hint("2026-10-03", "rejected", "2026-10-15"), null);
  assert.equal(hint("nope", "pending", "2026-10-15"), null);
  assert.equal(hint("2026-10-03", "pending", "nope"), null);
  const page = read("src/components/attendance/excuses-page.tsx");
  assert.match(page, /excuseDeadlineHint\(item\.lesson_date, item\.status, businessToday\)/);
  assert.match(page, /text-amber-700/);
});

test("student phone becomes a tel: link only when it is dialable", () => {
  assert.equal(phone.telHref("+998 90 123 45 67"), "tel:+998901234567");
  assert.equal(phone.telHref("90 123-45-67"), "tel:901234567");
  assert.equal(phone.telHref("  +998901234567 "), "tel:+998901234567");
  for (const bad of ["", "   ", null, undefined, "12345", "—", "+"]) assert.equal(phone.telHref(bad), null, String(bad));
  const page = read("src/components/attendance/excuses-page.tsx");
  assert.match(page, /href=\{phoneHref\}/);
  assert.doesNotMatch(read("src/lib/api.ts").match(/interface AttendanceExcuseItem[\s\S]*?\n\}/)[0], /fee|balance|amount|price/i);
});

// ---- naive UTC timestamps ---------------------------------------------------

test("naive UTC timestamps are shown on the Tashkent calendar", () => {
  const f = businessTime.formatUtcNaiveAsBusinessDate;
  // enrolment made 15.10 00:40 in Tashkent is stored as 14.10 19:40 UTC
  assert.equal(f("2026-10-14T19:40:00"), "15.10.2026");
  assert.equal(f("2026-10-14T18:59:59"), "14.10.2026");
  assert.equal(f("2026-10-14T19:00:00"), "15.10.2026");
  assert.equal(f("2026-10-14 19:40:00"), "15.10.2026");
  assert.equal(f("2026-12-31T20:00:00"), "01.01.2027");
  assert.equal(f("2026-10-14T19:40:00.123456"), "15.10.2026");
  // an explicit zone is respected, not re-read as UTC
  assert.equal(f("2026-10-14T19:40:00Z"), "15.10.2026");
  assert.equal(f("2026-10-15T00:40:00+05:00"), "15.10.2026");
  assert.equal(f("2026-10-15T00:40:00+00:00"), "15.10.2026");
  // a plain calendar day is not an instant: no shift
  assert.equal(f("2026-10-14"), "14.10.2026");
  for (const bad of ["", null, undefined, "bad", "2026-13-45T10:00:00"]) assert.equal(f(bad), "", String(bad));
  assert.equal(businessTime.utcNaiveToBusinessIsoDate("2026-10-14T19:40:00"), "2026-10-15");
  assert.equal(businessTime.utcNaiveToBusinessIsoDate("2026-10-14"), "2026-10-14");
  assert.equal(businessTime.utcNaiveToBusinessIsoDate("x"), "");
  assert.match(f("2026-10-14T19:40:00", { day: "numeric", month: "short", year: "numeric" }), /^15 окт\.? 2026/);
  assert.match(f("2026-10-14T19:40:00", { day: "numeric", month: "long", year: "numeric" }), /^15 октября 2026/);
});

test("the result does not depend on the browser's timezone", () => {
  const { execFileSync } = require("node:child_process");
  const script = `
    require.extensions[".ts"] = (m, f) => m._compile(require("typescript").transpileModule(require("fs").readFileSync(f, "utf8"), { compilerOptions: { module: 1, target: 7 } }).outputText, f);
    const b = require(${JSON.stringify(path.join(__dirname, "../src/lib/business-time.ts"))});
    process.stdout.write(b.formatUtcNaiveAsBusinessDate("2026-10-14T19:40:00") + "|" + b.formatUtcNaiveAsBusinessDate("2026-10-14T18:00:00"));
  `;
  for (const tz of ["UTC", "America/Los_Angeles", "Asia/Tashkent", "Pacific/Auckland"]) {
    const out = execFileSync(process.execPath, ["-e", script], { env: { ...process.env, TZ: tz }, cwd: path.join(__dirname, "..") }).toString();
    assert.equal(out, "15.10.2026|14.10.2026", tz);
  }
});

test("enrolment dates use the business-calendar formatter, not the browser's", () => {
  for (const file of [
    "src/components/groups/group-student-table.tsx",
    "src/components/students/student-groups-block.tsx",
    "src/components/students/student-profile-view.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /formatUtcNaiveAsBusinessDate/, file);
    assert.doesNotMatch(source, /new Date\([^)]*(joined_at|left_at)[^)]*\)\.toLocaleDateString/, file);
  }
  assert.doesNotMatch(read("src/components/groups/group-attendance-journal.tsx"), /new Date\([^)]*(joined_at|transferredAt)[^)]*\)\.toLocale/);
});

// ---- R3 follow-ups ----------------------------------------------------------

test("a forced badge refresh after an action is not answered by a request that started before it", async () => {
  const Module = require("node:module");
  let calls = 0;
  const releases = [];
  const values = [3, 2]; // before the cancel, after the cancel
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "./api") {
      return {
        DEMO_MODE: false,
        orgApi: {
          getAttendanceExcuseSummary: () => {
            const value = values[calls++];
            return new Promise((resolve) => releases.push(() => resolve({ pending_total: 0, open_lessons_total: value })));
          },
        },
      };
    }
    return originalLoad.call(this, request, ...rest);
  };
  let badge;
  try {
    badge = require(path.join(__dirname, "../src/lib/excuse-badge.ts"));
  } finally {
    Module._load = originalLoad;
  }
  const store = badge.useExcuseBadge;
  const poll = store.getState().refresh(true); // a poll already in flight (answered "before the cancel")
  const afterAction = store.getState().refresh(true);
  const again = store.getState().refresh(true); // forced callers meanwhile share the one queued request
  releases[0]();
  await poll;
  assert.equal(store.getState().openLessons, 3);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(releases.length, 2);
  releases[1]();
  await Promise.all([afterAction, again]);
  assert.equal(store.getState().openLessons, 2);
  assert.equal(calls, 2);
});

test("R3: no empty state before a successful load, one request per focus, deep link by date, scroll by bounding box", () => {
  const view = read("src/components/attendance/open-lessons-view.tsx");
  assert.match(view, /const quiet = silent && loadedRef\.current/);
  assert.match(view, /if \(!loaded\) \{/);
  assert.match(view, /if \(refreshing\) return;/);
  assert.match(view, /refreshingRef\.current \|\|/);
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.doesNotMatch(journal, /column\.offsetLeft/);
  assert.match(journal, /getBoundingClientRect\(\)\.left - container\.getBoundingClientRect\(\)\.left \+ container\.scrollLeft/);
  assert.match(journal, /requestedMonth = highlightTarget\s*\? parseJournalMonth\(highlightTarget\.date\.slice\(0, 7\)\)/);
  assert.match(read("src/lib/business-time.ts"), /const BUSINESS_PARTS_FORMAT = new Intl\.DateTimeFormat/);
});
