// ROADMAP #89: archiving a student cancels his unfinished diagnostic invites; every place that reads an invite status knows «cancelled».
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
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const D = require(path.join(root, "src/lib/diagnostic-invite.ts"));
const A = require(path.join(root, "src/lib/student-archive.ts"));

const ALL = ["pending", "confirmed", "in_progress", "completed", "expired", "cancelled"];

test("a cancelled invite is never waiting, never running, never done; only pending and confirmed wait", () => {
  assert.deepEqual(ALL.filter(D.isInviteWaiting), ["pending", "confirmed"]);
  assert.deepEqual(ALL.filter(D.isInviteRunning), ["in_progress"]);
  assert.deepEqual(ALL.filter(D.isInviteCancelled), ["cancelled"]);
  assert.deepEqual(ALL.filter(D.isInviteDead), ["expired", "cancelled"]);
  for (const nothing of [null, undefined, ""]) {
    assert.equal(D.isInviteWaiting(nothing), false);
    assert.equal(D.isInviteCancelled(nothing), false);
  }
});

test("the hint says why and when on the business calendar: «ученик в архиве · ДД.ММ.ГГГГ»", () => {
  const hint = (over) => D.inviteCancelHint({ status: "cancelled", cancel_reason: "student_archived", cancelled_at: "2026-10-17T08:30:00", ...over });
  assert.equal(hint({}), "ученик в архиве · 17.10.2026");
  // 19:30 UTC is already the next day in Tashkent
  assert.equal(hint({ cancelled_at: "2026-10-17T19:30:00" }), "ученик в архиве · 18.10.2026");
  assert.equal(hint({ cancelled_at: null }), "ученик в архиве");
  // a reason we do not know is not guessed: the date alone; nothing at all gives nothing
  assert.equal(hint({ cancel_reason: "something_new" }), "17.10.2026");
  assert.equal(hint({ cancel_reason: null, cancelled_at: null }), "");
  // only a cancelled invite has a hint
  assert.equal(hint({ status: "pending" }), "");
  assert.equal(hint({ status: "expired" }), "");
});

test("the student card names every unfinished status: cancelled and expired are not «Ожидает прохождения»", () => {
  assert.equal(D.studentCardInviteLabel("pending"), "Ожидает прохождения");
  assert.equal(D.studentCardInviteLabel("confirmed"), "Ожидает прохождения");
  assert.equal(D.studentCardInviteLabel("in_progress"), "В процессе");
  assert.equal(D.studentCardInviteLabel("cancelled"), "Отменено");
  assert.equal(D.studentCardInviteLabel("expired"), "Истёк");
  assert.equal(D.INVITE_CANCELLED_LABEL, "Отменено");
});

test("the 410 INVITE_CANCELLED of diagnostic-service is recognised by its code", () => {
  assert.equal(D.isInviteCancelledError({ status: 410, code: "INVITE_CANCELLED", message: "Приглашение отменено" }), true);
  assert.equal(D.isInviteCancelledError({ status: 410, code: "INVITE_EXPIRED" }), false);
  assert.equal(D.isInviteCancelledError(new Error("x")), false);
  assert.equal(D.isInviteCancelledError(null), false);
});

test("the archive dialog counts pending / confirmed (to cancel) and in_progress (left running) from the card's diagnostics", () => {
  const diagnostics = [
    { status: "pending" }, { status: "confirmed" }, { status: "confirmed" },
    { status: "in_progress" }, { status: "completed" }, { status: "expired" }, { status: "cancelled" },
  ];
  assert.deepEqual(A.archiveDiagnosticCounts(diagnostics), { cancel: 3, running: 1 });
  assert.deepEqual(A.archiveDiagnosticCounts([{ status: "completed" }]), { cancel: 0, running: 0 });
  assert.deepEqual(A.archiveDiagnosticCounts(null), { cancel: 0, running: 0 });
  assert.deepEqual(A.archiveDiagnosticCounts(undefined), { cancel: 0, running: 0 });
  assert.deepEqual(A.archiveDiagnosticLines({ cancel: 3, running: 1 }), [
    "Будут отменены приглашения на диагностику: 3",
    "Идёт диагностика: 1 — её можно закончить, результат сохранится в карточке",
  ]);
  assert.deepEqual(A.archiveDiagnosticLines({ cancel: 2, running: 0 }), ["Будут отменены приглашения на диагностику: 2"]);
  assert.deepEqual(A.archiveDiagnosticLines({ cancel: 0, running: 2 }), ["Идёт диагностика: 2 — её можно закончить, результат сохранится в карточке"]);
  assert.deepEqual(A.archiveDiagnosticLines({ cancel: 0, running: 0 }), []);
});

test("after archiving the toast reports the SERVER's numbers, only those above zero", () => {
  assert.deepEqual(A.archiveResultDetails({ diagnostic_invites_cancelled: 2, diagnostic_invites_in_progress: 1 }), [
    "Отменено приглашений на диагностику: 2",
    "Идёт диагностика: 1 — её можно закончить, результат сохранится в карточке",
  ]);
  assert.deepEqual(A.archiveResultDetails({ diagnostic_invites_cancelled: 1, diagnostic_invites_in_progress: 0 }), ["Отменено приглашений на диагностику: 1"]);
  assert.deepEqual(A.archiveResultDetails({ diagnostic_invites_cancelled: 0, diagnostic_invites_in_progress: 0 }), []);
  // an older server sends neither; garbage is not a number
  for (const result of [{}, null, undefined, { diagnostic_invites_cancelled: "3" }, { diagnostic_invites_cancelled: -1 }, { diagnostic_invites_cancelled: NaN }]) {
    assert.deepEqual(A.archiveResultDetails(result), [], JSON.stringify(result));
  }
});

test("an archived student gets no «Назначить диагностику»; a teacher never did", () => {
  assert.equal(A.studentArchiveAccess({ isTeacher: false, status: "active" }).diagnosticActions, true);
  assert.equal(A.studentArchiveAccess({ isTeacher: false, status: "new" }).diagnosticActions, true);
  assert.equal(A.studentArchiveAccess({ isTeacher: false, status: "archived" }).diagnosticActions, false);
  assert.equal(A.studentArchiveAccess({ isTeacher: true, status: "active" }).diagnosticActions, false);
});

// ---- wiring ----------------------------------------------------------------------------------------------------

test("the staff list: «Отменено» in grey with its hint; not «Ожидают старта», not «Зачислены»", () => {
  const page = read("src/app/admin/diagnostics/page.tsx");
  assert.match(page, /cancelled: \{ label: INVITE_CANCELLED_LABEL, color: "bg-slate-100 text-slate-500 border-slate-200"/);
  // the counters ask the helpers, never a hand-written list of statuses
  assert.match(page, /awaiting_start: periodInvites\.filter\(\(i\) => isInviteWaiting\(i\.status\)\)\.length/);
  assert.match(page, /if \(!isInviteWaiting\(inv\.status\)\) return false;/);
  assert.doesNotMatch(page, /\["pending", "confirmed"\]/);
  // «Зачислен» is the student's; a cancelled invite keeps its own status label and is not in the «Зачислены» filter
  assert.match(page, /const isAssignedInvite = \(inv: DiagnosticInvite\) =>\s*!isInviteCancelled\(inv\.status\) && Boolean\(/);
  assert.equal((page.match(/is_assigned \|\|/g) || []).length, 1, "one definition of «assigned»");
  assert.match(page, /const cancelHint = inviteCancelHint\(inv\);/);
  assert.match(page, /\{cancelHint && \(\s*<span data-testid="diagnostic-cancel-hint"/);
  // the link to copy is for a pending invite only
  assert.match(page, /\{inv\.status === "pending" && \(\s*<button/);
});

test("the staff list, simulated: a cancelled invite of an enrolled student is counted nowhere but «Всего»", () => {
  // the rule of the page in miniature
  const isAssigned = (inv) => !D.isInviteCancelled(inv.status) && Boolean(inv.is_assigned || inv.group_id || inv.student_status === "active");
  const invites = [
    { status: "pending" }, { status: "confirmed" }, { status: "in_progress" },
    { status: "cancelled", student_status: "active", group_id: "g" }, { status: "cancelled", student_status: "archived" },
    { status: "completed", student_status: "active" },
  ];
  assert.equal(invites.filter((i) => D.isInviteWaiting(i.status)).length, 2);
  assert.equal(invites.filter((i) => D.isInviteRunning(i.status)).length, 1);
  assert.equal(invites.filter(isAssigned).length, 1);
  assert.equal(invites.length, 6);
});

test("the student card: a grey badge and the hint for a cancelled invite; no «Назначить диагностику» for an archived student", () => {
  const card = read("src/components/students/student-profile-view.tsx");
  assert.match(card, /const isDead = isInviteDead\(diag\.status\);/);
  assert.match(card, /\{studentCardInviteLabel\(diag\.status\)\}/);
  assert.doesNotMatch(card, /"Ожидает прохождения"/);
  assert.match(card, /\{cancelHint && <p className="mt-0\.5 text-xs text-slate-400">\{cancelHint\}<\/p>\}/);
  assert.match(card, /\{access\.diagnosticActions && \(\s*<Link\s+href="\/admin\/students\/new"/);
  assert.doesNotMatch(card, /\{!isTeacher && \(\s*<Link\s+href="\/admin\/students\/new"/);
});

test("the archive dialog warns about the invites and the running test; the card passes the counts of its diagnostics", () => {
  const modal = read("src/components/students/student-archive-modal.tsx");
  assert.match(modal, /const diagnosticLines = archiveDiagnosticLines\(diagnostics \?\? \{ cancel: 0, running: 0 \}\);/);
  assert.match(modal, /diagnosticLines\.map\(\(line\) =>/);
  const card = read("src/components/students/student-profile-view.tsx");
  assert.match(card, /diagnostics=\{archiveDiagnosticCounts\(diagnostics\)\}/);
  const api = read("src/lib/api.ts");
  assert.match(api, /diagnostic_invites_cancelled\?: number;/);
  assert.match(api, /diagnostic_invites_in_progress\?: number;/);
  assert.match(api, /cancelled_at\?: string \| null;\s*cancel_reason\?: string \| null;/);
});

test("the diagnostic detail says «Приглашение отменено» with the hint, not «ещё не пройдена»", () => {
  const report = read("src/app/admin/diagnostics/[id]/report/page.tsx");
  assert.match(report, /isInviteCancelled\(invite\.status\) \? \(/);
  assert.match(report, /\{INVITE_CANCELLED_MESSAGE\}/);
  assert.match(report, /inviteCancelHint\(invite\)/);
  assert.match(read("src/app/teacher/diagnostics/[id]/report/page.tsx"), /export \{ default \} from "@\/app\/admin\/diagnostics\/\[id\]\/report\/page"/);
});

test("the student's entry page: status «cancelled» and the 410 INVITE_CANCELLED end in «Приглашение отменено» + the centre, no retry", () => {
  const page = read("src/app/d/[code]/page.tsx");
  // 200 with status cancelled: nothing is confirmed, resumed or started
  assert.match(page, /if \(isInviteCancelled\(info\.status\)\) \{[\s\S]*?setInviteCancelled\(true\);\s*setCanRetry\(false\);[\s\S]*?setPhase\("error"\);\s*return;\s*\}/);
  // the 410 of diagnostic-service (resolve / start) gets the same screen
  assert.equal((page.match(/setInviteCancelled\(isInviteCancelledError\(err\)\);/g) || []).length, 2);
  assert.match(page, /\{inviteCancelled \? INVITE_CANCELLED_MESSAGE : /);
  assert.match(page, /\{inviteCancelled \? INVITE_CANCELLED_CENTER_HINT : /);
  // every new check starts clean
  assert.match(page, /setErrorMsg\(null\);\s*setInviteCancelled\(false\);/);
  // the confirm step is only for a pending invite: a cancelled one never gets there
  assert.match(page, /if \(info\.status === "pending"\) \{\s*setPhase\("confirm"\);/);
});

test("creating a diagnostic for an archived student (409) shows the server's text", () => {
  const page = read("src/app/admin/students/new/page.tsx");
  assert.match(page, /setApiError\(err\.message \|\| "Ошибка при создании ученика"\);/);
  assert.match(read("src/lib/api.ts"), /createDiagnostic: \(data: \{ student_id: string; class_level: number; diagnostic_type\?: string \}\) =>/);
});
