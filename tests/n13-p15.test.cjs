// N13 P1.5 - Tashkent times, owner-only workspace, excuse deadline, session sync, exam-entry polish.
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
const src = (p) => path.join(__dirname, "..", "src", p);
const read = (p) => fs.readFileSync(src(p), "utf8");
const lib = (name) => require(src(`lib/${name}.ts`));
const bt = lib("business-time");
const roleHome = lib("role-home");
const deadline = lib("excuse-deadline");
const payments = lib("payments");
const session = lib("session-sync");
const entry = lib("exam-entry");
const openLessons = lib("open-lessons");
const overview = lib("owner-overview");

// ---- 1. naive-UTC timestamps with a time of day --------------------------------

test("a naive-UTC timestamp is shown on the Tashkent clock with its time", () => {
  const f = bt.formatUtcNaiveAsBusinessDateTime;
  assert.equal(f("2026-10-15T08:55:00"), "15.10.2026 13:55");
  assert.equal(f("2026-10-15 08:55:00"), "15.10.2026 13:55");
  assert.equal(f("2026-10-15T04:03:03.984270"), "15.10.2026 09:03"); // microseconds from the server
  assert.equal(f("2026-10-14T19:40:00"), "15.10.2026 00:40");       // the day changes in Tashkent
  assert.equal(f("2026-10-14T18:59:59"), "14.10.2026 23:59");
  assert.equal(f("2026-10-15T08:55:00Z"), "15.10.2026 13:55");       // an explicit zone is the same instant
  assert.equal(f("2026-10-15T13:55:00+05:00"), "15.10.2026 13:55");
  assert.equal(f("2026-12-31T20:00:00"), "01.01.2027 01:00");       // across the year
  for (const bad of ["", null, undefined, "bad", "2026-10-15", "15.10.2026"]) assert.equal(f(bad), "", String(bad));
});

test("the result does not depend on the browser time zone", () => {
  const before = process.env.TZ;
  try {
    for (const tz of ["UTC", "America/Los_Angeles", "Asia/Tashkent", "Pacific/Auckland"]) {
      process.env.TZ = tz;
      assert.equal(bt.formatUtcNaiveAsBusinessDateTime("2026-10-15T08:55:00"), "15.10.2026 13:55", tz);
    }
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

test("only the really-UTC timestamps are converted: correction time yes, excuse times no", () => {
  const journal = read("components/groups/group-attendance-journal.tsx");
  assert.match(journal, /formatUtcNaiveAsBusinessDateTime\(correction\.at\)/);
  assert.doesNotMatch(journal, /formatDateTimeRu\(correction\.at\)/);
  // reason_at / reviewed_at are written as Tashkent wall time by the server (_business_now): shown as written
  assert.match(journal, /formatDateTimeRu\(excuse\.reason_at\)/);
  // the author / time line under a reason comes from one helper (#103), which reads reason_at as written
  assert.match(read("lib/excuse-row.ts"), /formatDateTimeRu\(item\.reason_at\)/);
  assert.match(read("components/attendance/excuses-page.tsx"), /reasonMeta\(item\)/);
  assert.match(read("components/attendance/excuses-page.tsx"), /formatDateTimeRu\(item\.reviewed_at\)/);
  assert.doesNotMatch(read("components/attendance/excuses-page.tsx"), /formatUtcNaiveAsBusinessDateTime/);
  const attendance = lib("attendance-excuses");
  assert.equal(attendance.formatDateTimeRu("2026-10-15T13:55:00"), "15.10.2026 13:55");
});

// ---- 2. greeting by the Tashkent hour ---------------------------------------------

test("the greeting follows the Tashkent hour, whatever the browser zone is", () => {
  const g = (iso) => bt.businessGreeting(new Date(iso));
  // Tashkent is UTC+5: every boundary of the four parts of the day, on both sides
  assert.equal(g("2026-10-14T19:00:00Z"), "Доброй ночи");   // 00:00
  assert.equal(g("2026-10-14T19:30:00Z"), "Доброй ночи");   // 00:30 - used to say «утро»
  assert.equal(g("2026-10-14T23:59:00Z"), "Доброй ночи");   // 04:59
  assert.equal(g("2026-10-15T00:00:00Z"), "Доброе утро");   // 05:00
  assert.equal(g("2026-10-15T04:00:00Z"), "Доброе утро");   // 09:00
  assert.equal(g("2026-10-15T06:59:00Z"), "Доброе утро");   // 11:59
  assert.equal(g("2026-10-15T07:00:00Z"), "Добрый день");   // 12:00
  assert.equal(g("2026-10-15T08:55:00Z"), "Добрый день");   // 13:55 - UTC hour 8 would say «утро»
  assert.equal(g("2026-10-15T12:59:00Z"), "Добрый день");   // 17:59
  assert.equal(g("2026-10-15T13:00:00Z"), "Добрый вечер");  // 18:00
  assert.equal(g("2026-10-15T18:59:00Z"), "Добрый вечер");  // 23:59
  assert.equal(g("2026-10-15T19:00:00Z"), "Доброй ночи");   // 00:00 next day
  const before = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    assert.equal(g("2026-10-15T08:55:00Z"), "Добрый день");
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

test("dashboards use the business clock, not Date#getHours", () => {
  const owner = read("app/owner/dashboard/page.tsx");
  const teacher = read("app/teacher/dashboard/page.tsx");
  assert.match(owner, /businessGreeting\(\)/);
  assert.match(teacher, /businessGreeting\(\)/);
  for (const page of [owner, teacher]) {
    assert.doesNotMatch(page, /getHours\(\)|getMinutes\(\)|toLocaleTimeString/);
  }
  assert.match(owner, /formatBusinessDateLabel\(/);
  assert.doesNotMatch(owner, /toLocaleDateString/);
});

// ---- 3. teacher action-center wording ----------------------------------------------

test("the teacher's action centre uses the same two words as the admin list", () => {
  assert.equal(openLessons.openLessonBadge("missed"), "Посещаемость не отмечена");
  assert.equal(openLessons.openLessonBadge("in_progress"), "Урок не завершён");
  assert.equal(openLessons.openLessonStatus({ actionType: "missed", markedCount: 0, rosterCount: 0 }), "Посещаемость не отмечена");
  assert.equal(
    openLessons.openLessonStatus({ actionType: "in_progress", markedCount: 3, rosterCount: 8 }),
    "Урок не завершён · отмечено 3 из 8",
  );
  const teacher = read("app/teacher/dashboard/page.tsx");
  assert.match(teacher, /openLessonBadge\(action\.actionType\)/);
  assert.doesNotMatch(teacher, /"Не начат"|"Открыт урок"|"Просрочено"/);
});

// ---- 4. /owner/* is for the owner only ---------------------------------------------

test("role guard: the live membership role decides, the account role is the fallback", () => {
  assert.equal(roleHome.effectiveRole({ role: "admin", org_role: "owner" }), "owner");
  assert.equal(roleHome.effectiveRole({ role: "owner", org_role: null }), "owner");
  assert.equal(roleHome.effectiveRole({ role: "superadmin" }), "superadmin");
  assert.equal(roleHome.effectiveRole(null), null);
  assert.equal(roleHome.isRoleAllowed(["owner"], { role: "owner", org_role: "owner" }), true);
  assert.equal(roleHome.isRoleAllowed(["owner"], { role: "admin", org_role: "admin" }), false);
  assert.equal(roleHome.isRoleAllowed(["owner"], { role: "teacher", org_role: "teacher" }), false);
  assert.equal(roleHome.isRoleAllowed(["owner"], { role: "admin", org_role: null }), false);
  assert.equal(roleHome.isRoleAllowed(["admin", "owner"], { role: "admin", org_role: "admin" }), true);
  assert.equal(roleHome.isRoleAllowed(["admin", "owner"], { role: "owner", org_role: "owner" }), true);
  assert.equal(roleHome.isRoleAllowed(["admin", "owner"], { role: "teacher", org_role: "teacher" }), false);
  assert.equal(roleHome.isRoleAllowed(["teacher"], { role: "teacher", org_role: "teacher" }), true);
  assert.equal(roleHome.isRoleAllowed(["owner"], null), false);
  assert.equal(roleHome.isRoleAllowed([], null), true);
  assert.deepEqual(roleHome.WORKSPACE_ROLES.owner, ["owner"]);
});

test("an administrator opening /owner/* goes to his own home, a teacher to his", () => {
  const options = { forbiddenPath: "/", currentPath: "/owner/payments" };
  assert.equal(roleHome.forbiddenTarget({ orgRole: "admin", accountRole: "admin" }, options), "/admin/diagnostics");
  assert.equal(roleHome.forbiddenTarget({ orgRole: "teacher", accountRole: "teacher" }, options), "/teacher/dashboard");
  // never "redirect" a user onto the page that just refused him
  assert.equal(roleHome.forbiddenTarget({ orgRole: "owner", accountRole: "owner" }, { forbiddenPath: "/", currentPath: "/owner/dashboard" }), "/");
  assert.equal(roleHome.forbiddenTarget({ orgRole: "admin", accountRole: "admin" }, { forbiddenPath: "/", currentPath: "/admin/diagnostics" }), "/");
  // a role without a home (superadmin) falls back to the last-resort path
  assert.equal(roleHome.forbiddenTarget({ orgRole: null, accountRole: "superadmin" }, options), "/");
});

test("the owner layout admits only the owner and the guard uses the shared rule", () => {
  assert.match(read("app/owner/layout.tsx"), /allowedRoles=\{\["owner"\]\}/);
  assert.doesNotMatch(read("app/owner/layout.tsx"), /"admin"/);
  assert.match(read("app/admin/layout.tsx"), /allowedRoles=\{\["admin", "owner"\]\}/);
  const guard = read("components/auth/AuthGuard.tsx");
  assert.match(guard, /isRoleAllowed\(allowedRoles, currentUser\)/);
  assert.match(guard, /forbiddenTarget\(/);
  assert.match(read("components/layout/sidebar.tsx"), /effectiveRole\(user\)/);
});

test("no admin-facing screen links to /owner/*", () => {
  const adminFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|ts)$/.test(entry.name)) adminFiles.push(full);
    }
  };
  walk(src("app/admin"));
  for (const file of adminFiles) assert.doesNotMatch(fs.readFileSync(file, "utf8"), /["'`]\/owner\//, file);
  // the only /owner links in shared code are the owner's own menu and the owner-only invite landing
  const sidebar = read("components/layout/sidebar.tsx");
  const adminNav = sidebar.slice(sidebar.indexOf("const adminNav"), sidebar.indexOf("const ownerNav"));
  assert.doesNotMatch(adminNav, /\/owner\//);
  assert.match(sidebar, /const navItems = rawRole === "owner" \? ownerNav : role === "admin" \? adminNav : teacherNav;/);
});

// ---- 5. excuse deadline -------------------------------------------------------------

test("settings carry the excuse deadline: defaults, limits, PATCH diff", () => {
  assert.equal(payments.DEFAULT_PAYMENT_SETTINGS.excuse_deadline_days, 5);
  assert.equal(payments.DEFAULT_PAYMENT_SETTINGS.excuse_deadline_lessons, 2);
  assert.deepEqual(payments.EXCUSE_DEADLINE_DAYS_RANGE, { min: 0, max: 30 });
  assert.deepEqual(payments.EXCUSE_DEADLINE_LESSONS_RANGE, { min: 0, max: 12 });
  const ok = { ...payments.DEFAULT_PAYMENT_SETTINGS };
  assert.equal(payments.validatePaymentSettings(ok), null);
  assert.equal(payments.validatePaymentSettings({ ...ok, excuse_deadline_days: 30, excuse_deadline_lessons: 12 }), null);
  assert.equal(payments.validatePaymentSettings({ ...ok, excuse_deadline_days: 0, excuse_deadline_lessons: 0 }), null);
  for (const bad of [{ excuse_deadline_days: 31 }, { excuse_deadline_days: -1 }, { excuse_deadline_days: 1.5 }, { excuse_deadline_days: NaN },
    { excuse_deadline_lessons: 13 }, { excuse_deadline_lessons: -1 }, { excuse_deadline_lessons: NaN }]) {
    assert.match(payments.validatePaymentSettings({ ...ok, ...bad }), /пропуска/, JSON.stringify(bad));
  }
  assert.deepEqual(payments.diffPaymentSettings(ok, { ...ok, excuse_deadline_days: 7 }), { excuse_deadline_days: 7 });
  assert.deepEqual(payments.diffPaymentSettings(ok, { ...ok, excuse_deadline_lessons: 4, excuse_deadline_days: 1 }), {
    excuse_deadline_days: 1, excuse_deadline_lessons: 4,
  });
  const settings = read("app/owner/settings/page.tsx");
  // N13 P2.2: the fields moved to the «Посещаемость» section, both rules visible with their own captions
  assert.match(settings, /Оплата по месяцам: за/);
  assert.match(settings, /Пакет уроков: когда осталось/);
  assert.match(settings, /до конца оплаты/);
});

test("plural forms", () => {
  assert.deepEqual([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(deadline.lessonsWord),
    ["урок", "урока", "урока", "уроков", "уроков", "уроков", "уроков", "урок", "урока", "уроков", "урок", "уроков"]);
  assert.deepEqual([1, 2, 5, 11, 21, 30].map(deadline.daysWord), ["день", "дня", "дней", "дней", "день", "дней"]);
});

test("deadline line: the server value wins", () => {
  const view = (deadlineValue, over = {}) =>
    deadline.excuseDeadlineView({ lesson_date: "2026-10-03", status: "pending", deadline: deadlineValue, ...over }, "2026-10-15");
  assert.deepEqual(view({ kind: "date", date: "2026-10-25", overdue: false, days_left: 10 }),
    { text: "подтвердить до 25.10 · осталось 10 дн.", warn: false });
  assert.deepEqual(view({ kind: "date", date: "2026-10-15", overdue: false, days_left: 0 }),
    { text: "подтвердить до 15.10 · последний день", warn: false });
  assert.deepEqual(view({ kind: "date", date: "2026-10-12", overdue: true, days_left: -3 }),
    { text: "подтвердить до 12.10 · срок прошёл", warn: true });
  // the server's `overdue` is trusted over the client's guess
  assert.equal(view({ kind: "date", date: "2026-10-25", overdue: true, days_left: 10 }).text, "подтвердить до 25.10 · срок прошёл");
  // lessons package, N = 2: more than N left is calm, exactly N is the last lesson to confirm in, fewer is over
  assert.deepEqual(view({ kind: "lessons", lessons_left: 5, urgent: false, due_now: false, overdue: false }),
    { text: "подтвердить до конца пакета · осталось 5 уроков", warn: false });
  assert.deepEqual(view({ kind: "lessons", lessons_left: 3, urgent: false, due_now: false, overdue: false }),
    { text: "подтвердить до конца пакета · осталось 3 урока", warn: false });
  assert.deepEqual(view({ kind: "lessons", lessons_left: 2, urgent: true, due_now: true, overdue: false }),
    { text: "последний урок для подтверждения", warn: true });
  assert.deepEqual(view({ kind: "lessons", lessons_left: 1, urgent: true, due_now: false, overdue: true }),
    { text: "подтвердить до конца пакета · срок прошёл", warn: true });
  assert.deepEqual(view({ kind: "lessons", lessons_left: 0, urgent: true, due_now: false, overdue: true }),
    { text: "подтвердить до конца пакета · срок прошёл", warn: true });
  // N = 0: an empty package is the last moment, not yet overdue
  assert.deepEqual(view({ kind: "lessons", lessons_left: 0, urgent: true, due_now: true, overdue: false }),
    { text: "последний урок для подтверждения", warn: true });
  // a server that has no `due_now` yet: urgent is read as the last lesson, an empty package as over
  assert.equal(view({ kind: "lessons", lessons_left: 2, urgent: true, overdue: false }).text, "последний урок для подтверждения");
  assert.equal(view({ kind: "lessons", lessons_left: 0, urgent: true, overdue: true }).text, "подтвердить до конца пакета · срок прошёл");
});

test("deadline line: nothing for decided excuses, month end when the server sent nothing usable", () => {
  const item = (over) => ({ lesson_date: "2026-10-03", status: "pending", ...over });
  const today = "2026-10-15";
  for (const status of ["confirmed", "rejected"]) {
    assert.equal(deadline.excuseDeadlineView(item({ status, deadline: { kind: "date", date: "2026-10-25", overdue: false, days_left: 10 } }), today), null);
  }
  // older server: no field -> the old month-end rule
  assert.deepEqual(deadline.excuseDeadlineView(item({}), today), { text: "подтвердить до 31.10 · осталось 16 дн.", warn: false });
  assert.deepEqual(deadline.excuseDeadlineView(item({ deadline: null }), today), { text: "подтвердить до 31.10 · осталось 16 дн.", warn: false });
  assert.deepEqual(deadline.excuseDeadlineView(item({ lesson_date: "2026-09-20" }), today), { text: "подтвердить до 30.09 · срок прошёл", warn: true });
  // unreadable server values fall back too
  for (const broken of [{ kind: "date" }, { kind: "date", date: "soon" }, { kind: "lessons" }, { kind: "lessons", lessons_left: "2" }, { kind: "money", amount: 5 }, {}]) {
    assert.equal(deadline.excuseDeadlineView(item({ deadline: broken }), today).text, "подтвердить до 31.10 · осталось 16 дн.", JSON.stringify(broken));
  }
  assert.equal(deadline.excuseDeadlineView(item({ lesson_date: "nope" }), today), null);
  // the page shows the short chip (N13 P1.6); the long sentence of excuseDeadlineView is its tooltip
  const page = read("components/attendance/excuses-page.tsx");
  assert.match(page, /excuseDeadlineChip\(item, businessToday\)/);
  assert.match(page, /CHIP_TONE_CLASS\[chip\.tone\]/);
  // old callers of the month-end helpers keep working
  assert.equal(deadline.excuseDeadline("2026-10-03"), "2026-10-31");
});

test("the API type has an optional deadline and no money", () => {
  const api = read("lib/api.ts");
  const type = api.match(/interface AttendanceExcuseItem[\s\S]*?\n\}/)[0];
  assert.match(type, /deadline\?: ExcuseServerDeadline \| null/);
  assert.doesNotMatch(type, /fee|balance|amount|price/i);
});

// ---- 6. other tab signs in as somebody else ----------------------------------------

const U = {
  owner: { id: "u1", role: "owner", org_role: "owner" },
  teacher: { id: "u2", role: "teacher", org_role: "teacher" },
  admin: { id: "u3", role: "admin", org_role: "admin" },
};

test("identity change: nobody, another person, another role, signed out", () => {
  const change = session.identityChange;
  assert.equal(change(U.owner, U.teacher), "other_user");
  assert.equal(change(U.owner, { id: "u1", role: "owner", org_role: "admin" }), "other_role"); // the same person, demoted
  assert.equal(change(U.owner, null), "signed_out");
  assert.equal(change(U.owner, undefined), "signed_out");
  assert.equal(change(U.owner, { ...U.owner, first_name: "New" }), "none");              // a profile edit
  assert.equal(change(U.owner, { id: "u1", role: "owner", org_role: null }), "none");   // org_role absent: the account role is the same
  assert.equal(change(null, U.teacher), "none");                                        // this tab was not signed in
  assert.equal(change({ id: null }, U.teacher), "none");
  assert.equal(session.eventNeedsVerification(U.owner, U.teacher), true);
  assert.equal(session.eventNeedsVerification(U.owner, null), true);
  assert.equal(session.eventNeedsVerification(U.owner, { ...U.owner }), false);
});

test("verdict: another user goes to the new role's home with a notice", () => {
  const verdict = session.sessionVerdict;
  assert.deepEqual(verdict(U.owner, { ok: true, user: U.teacher }),
    { action: "redirect", target: "/teacher/dashboard", notice: "Вы вошли как другой пользователь в другой вкладке" });
  assert.equal(verdict(U.teacher, { ok: true, user: U.owner }).target, "/owner/dashboard");
  assert.equal(verdict(U.owner, { ok: true, user: U.admin }).target, "/admin/diagnostics");
  assert.equal(verdict(U.owner, { ok: true, user: U.teacher }).notice, session.SESSION_CHANGED_NOTICE);
  // a role without a workspace of its own signs in again
  assert.equal(verdict(U.owner, { ok: true, user: { id: "u9", role: "superadmin", org_role: null } }).target, "/login");
});

test("verdict: the same user with another role gets the role notice", () => {
  const demoted = { id: "u1", role: "owner", org_role: "admin" };
  assert.deepEqual(session.sessionVerdict(U.owner, { ok: true, user: demoted }),
    { action: "redirect", target: "/admin/diagnostics", notice: "Ваша роль изменилась" });
  assert.equal(session.ROLE_CHANGED_NOTICE, "Ваша роль изменилась");
  const promoted = { id: "u3", role: "admin", org_role: "owner" };
  assert.deepEqual(session.sessionVerdict(U.admin, { ok: true, user: promoted }),
    { action: "redirect", target: "/owner/dashboard", notice: "Ваша роль изменилась" });
});

test("verdict: only the server's 401/403 sends the tab to the login; a network error or 5xx keeps the page", () => {
  const verdict = session.sessionVerdict;
  assert.deepEqual(verdict(U.owner, { ok: false, status: 401 }), { action: "redirect", target: "/login", notice: null });
  assert.deepEqual(verdict(U.owner, { ok: false, status: 403 }), { action: "redirect", target: "/login", notice: null });
  for (const status of [null, 0, 500, 502, 503, 504, 404, 408, 429]) {
    assert.deepEqual(verdict(U.owner, { ok: false, status }), { action: "none" }, String(status)); // offline, server down: stay
  }
  // the server confirms the same user and role: an event that wiped the record changes nothing
  assert.deepEqual(verdict(U.owner, { ok: true, user: { ...U.owner, first_name: "x" } }), { action: "none" });
  // an unreadable answer (no id) is no reason to move anybody
  assert.deepEqual(verdict(U.owner, { ok: true, user: {} }), { action: "none" });
  assert.deepEqual(verdict(U.owner, { ok: true, user: null }), { action: "none" });
  // a tab that was not signed in has nothing to correct, whatever the server says
  assert.deepEqual(verdict(null, { ok: true, user: U.teacher }), { action: "none" });
  assert.deepEqual(verdict(null, { ok: false, status: 401 }), { action: "none" });
});

test("the /me failure is reduced to its HTTP status", () => {
  assert.deepEqual(session.meOutcomeFromError({ status: 401, message: "x" }), { ok: false, status: 401 });
  assert.deepEqual(session.meOutcomeFromError({ status: 0 }), { ok: false, status: 0 });
  assert.deepEqual(session.meOutcomeFromError(new Error("Failed to fetch")), { ok: false, status: null });
  assert.deepEqual(session.meOutcomeFromError(null), { ok: false, status: null });
  assert.deepEqual(session.meOutcomeFromError({ status: "401" }), { ok: false, status: null });
  // a network error never reads as "signed out"
  assert.deepEqual(session.sessionVerdict(U.owner, session.meOutcomeFromError(new TypeError("Failed to fetch"))), { action: "none" });
});

test("session sync never loops: the verdict for the page it led to is a no-op", () => {
  assert.equal(session.sessionVerdict(U.teacher, { ok: true, user: U.teacher }).action, "none"); // the tab after the redirect
  assert.equal(session.sessionVerdict(U.owner, { ok: true, user: U.owner }).action, "none");
});

test("only staff workspaces follow a sign-in change, never a student's page", () => {
  for (const ok of ["/owner/dashboard", "/admin/exams/1", "/teacher", "/teacher/groups/5"]) assert.equal(session.isWorkspacePath(ok), true, ok);
  for (const no of ["/e/ABC123", "/d/abc", "/diagnostic/x", "/invite/x", "/login", "/", "/register", "/change-password", "/owners", "/administrator", "", null, undefined]) {
    assert.equal(session.isWorkspacePath(no), false, String(no));
  }
  assert.match(read("components/auth/SessionSync.tsx"), /!isWorkspacePath\(window\.location\.pathname\)/);
});

test("the persisted auth record is read defensively", () => {
  const raw = JSON.stringify({ state: { user: { id: "u1", role: "owner", org_role: "owner", email: "x@y.z" }, isAuthenticated: true }, version: 0 });
  assert.deepEqual(session.parsePersistedUser(raw), { id: "u1", role: "owner", org_role: "owner" });
  for (const bad of [null, undefined, "", "{", "[]", "{}", JSON.stringify({ state: { user: null } }), JSON.stringify({ state: { user: {} } }), JSON.stringify({ state: { user: "u1" } })]) {
    assert.equal(session.parsePersistedUser(bad), null, String(bad));
  }
  assert.equal(session.AUTH_STORAGE_KEY, "algo-auth");
  assert.match(read("lib/store.ts"), /name: "algo-auth"/);
});

test("the tab asks the server before it moves, and listens to focus as well as visibilitychange", () => {
  const component = read("components/auth/SessionSync.tsx");
  assert.match(component, /addEventListener\("storage", onStorage\)/);
  assert.match(component, /event\.key !== AUTH_STORAGE_KEY/);
  assert.match(component, /event\.storageArea !== window\.localStorage/);
  assert.match(component, /addEventListener\("focus", onReturn\)/);
  assert.match(component, /addEventListener\("visibilitychange", onReturn\)/);
  assert.match(component, /RECHECK_MIN_GAP_MS/);
  assert.match(component, /authApi\.me\(\)/);
  assert.match(component, /sessionVerdict\(tabUser, outcome\)/);
  // the event alone never redirects: it only asks for a check
  const onStorage = component.slice(component.indexOf("const onStorage"), component.indexOf("// Coming back to the tab"));
  assert.doesNotMatch(onStorage, /redirect\(|location/);
  assert.match(onStorage, /eventNeedsVerification\(/);
  assert.match(component, /usePaymentsSummary\.getState\(\)\.reset\(\)/);
  assert.match(component, /useExcuseBadge\.getState\(\)\.reset\(\)/);
  assert.match(component, /window\.location\.replace\(verdict\.target\)/);
  assert.match(component, /handled\.current/); // one redirect per page life
  assert.match(component, /inFlight/);          // one check at a time
  assert.match(read("app/providers.tsx"), /<SessionSync \/>/);
  assert.match(read("lib/excuse-badge.ts"), /reset: \(\) =>/);
});

// ---- 7. owner dashboard --------------------------------------------------------------

test("no «Скоро» stub on the owner dashboard", () => {
  const page = read("app/owner/dashboard/page.tsx");
  assert.doesNotMatch(page, /Уроки сейчас|Откроется после|FeatureLock|Скоро/);
});

test("the centre's average θ is weighted by diagnosed students and is «—» without data", () => {
  assert.equal(overview.weightedAverageTheta([]), null);
  assert.equal(overview.weightedAverageTheta([{ avg_theta: null, diagnosed_count: 0 }]), null);
  assert.equal(overview.weightedAverageTheta([{ avg_theta: 0.5, diagnosed_count: 1 }]), 0.5);
  assert.equal(overview.weightedAverageTheta([{ avg_theta: 1, diagnosed_count: 1 }, { avg_theta: -1, diagnosed_count: 3 }]), -0.5);
  assert.equal(overview.weightedAverageTheta([{ avg_theta: 1 }, { avg_theta: 0 }, { avg_theta: null, diagnosed_count: 4 }]), 0.5); // older server: one each
  assert.equal(overview.weightedAverageTheta([{ avg_theta: 0, diagnosed_count: 5 }]), 0); // a real zero is a number, not "no data"
  // the server's centre-wide figure (each student once) wins; the weighted groups are the older-server fallback
  assert.equal(overview.centreTheta({ groups: [{ avg_theta: 0, diagnosed_count: 2 }, { avg_theta: 1, diagnosed_count: 1 }], avg_theta: 0 }), 0);
  assert.equal(overview.centreTheta({ groups: [{ avg_theta: 0, diagnosed_count: 2 }, { avg_theta: 1, diagnosed_count: 1 }] }), 1 / 3);
  assert.equal(overview.centreTheta({ groups: [{ avg_theta: 1, diagnosed_count: 1 }], avg_theta: null }), null);
  assert.equal(overview.centreTheta(null), null);
  const page = read("app/owner/dashboard/page.tsx");
  assert.match(page, /centreTheta\(\{ groups, avg_theta: serverTheta \}\)/);
  assert.match(page, /orgApi\.groupsOverview\(\)/);
  assert.doesNotMatch(page, /analyticsApi/);
  assert.match(page, /globalTheta === null \? "—"/);
  assert.match(read("lib/api.ts"), /"\/auth\/org\/groups-overview"/);
  assert.doesNotMatch(read("lib/api.ts").match(/orgApi = \{[\s\S]*?groupsOverview/)[0], /org\/overview/);
});

// ---- 8. sidebar: «Оплаты» for the owner from the first paint --------------------------

test("the owner's «Оплаты» does not wait for the summary; the badge slot fades in", () => {
  const sidebar = read("components/layout/sidebar.tsx");
  assert.match(sidebar, /showPayments = !DEMO_MODE && \(rawRole === "owner" \|\| \(role === "admin" && paymentsAvailable\)\)/);
  assert.match(sidebar, /transition-opacity duration-300/);
  assert.match(sidebar, /item\.badge \? "opacity-100" : "opacity-0"/);
  assert.match(sidebar, /pointer-events-none absolute left-\[27px\]/); // over the icon: it moves nothing
  assert.match(sidebar, /item\.badge !== undefined/);
});

// ---- 9. exam entry -----------------------------------------------------------------------

test("a failed pre-check keeps the student on the form", () => {
  assert.equal(entry.CHECK_FAILED_MESSAGE, "Не удалось проверить данные. Повторите попытку.");
  assert.equal(entry.checkFailureMessage(new Error("Failed to fetch")), entry.CHECK_FAILED_MESSAGE);
  assert.equal(entry.checkFailureMessage({ status: 0, message: "Не удалось подключиться" }), entry.CHECK_FAILED_MESSAGE);
  assert.equal(entry.checkFailureMessage({ status: 503, message: "upstream" }), entry.CHECK_FAILED_MESSAGE);
  assert.equal(entry.checkFailureMessage({ status: 500, message: "boom" }), entry.CHECK_FAILED_MESSAGE);
  assert.equal(entry.checkFailureMessage({ status: 404, message: "Экзамен не найден" }), "Экзамен не найден");
  assert.equal(entry.checkFailureMessage({ status: 418, message: "  " }), entry.CHECK_FAILED_MESSAGE);
  // a 429 (too many attempts) is its own case since n13-sec: see tests/n13-sec-entry-limits.test.cjs
  assert.equal(entry.checkFailureMessage({ status: 429, message: "  " }), entry.RATE_LIMIT_MESSAGE);
  assert.equal(entry.checkFailureMessage(null), entry.CHECK_FAILED_MESSAGE);
  const page = read("app/e/[code]/page.tsx");
  const click = page.slice(page.indexOf("const handleStartClick"), page.indexOf("const executeStartExam"));
  assert.match(click, /catch \(err: any\) \{[\s\S]*?setGroupWarning\(checkFailureMessage\(err\)\);\s*return;/);
  assert.doesNotMatch(click, /catch \(err: any\) \{\s*console\.error\("Check student error:", err\);\s*\}/);
  const execute = page.slice(page.indexOf("const executeStartExam"), page.indexOf("examsApi.startSession"));
  assert.match(execute, /if \(!identity\) \{[\s\S]*?setGroupWarning\(CHECK_FAILED_MESSAGE\);\s*return;/);
  assert.ok(execute.indexOf("if (!identity)") < execute.indexOf('setPhase("starting")'), "nothing starts before the identity is known");
});

test("a confirmation from an earlier attempt never carries over", () => {
  const page = read("app/e/[code]/page.tsx");
  const click = page.slice(page.indexOf("const handleStartClick"), page.indexOf("const executeStartExam"));
  const firstLines = click.split("\n").slice(0, 3).join("\n");
  assert.match(firstLines, /setConfirmedStudent\(null\)/);
  assert.match(click, /setConfirmedStudent\(confirmed\);/); // also for a student whose only ID is a number
});
