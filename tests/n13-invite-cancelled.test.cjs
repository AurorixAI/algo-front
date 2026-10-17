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
  assert.equal(D.studentCardInviteLabel("cancelled"), "Отменён"); // agrees with «Истёк» / «Завершён» next to it
  assert.equal(D.studentCardInviteLabel("expired"), "Истёк");
  assert.equal(D.INVITE_CANCELLED_LABEL, "Отменён");
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
    "Идёт диагностика: 1 — ученик сможет закончить, результат сохранится в карточке",
  ]);
  assert.deepEqual(A.archiveDiagnosticLines({ cancel: 2, running: 0 }), ["Будут отменены приглашения на диагностику: 2"]);
  assert.deepEqual(A.archiveDiagnosticLines({ cancel: 0, running: 2 }), ["Идёт диагностика: 2 — ученик сможет закончить, результат сохранится в карточке"]);
  assert.deepEqual(A.archiveDiagnosticLines({ cancel: 0, running: 0 }), []);
});

test("the running-test line has no object, so it is grammatical for 1, 2 and 5", () => {
  for (const n of [1, 2, 5, 21]) {
    const [line] = A.archiveDiagnosticLines({ cancel: 0, running: n });
    assert.equal(line, `Идёт диагностика: ${n} — ученик сможет закончить, результат сохранится в карточке`);
    assert.doesNotMatch(line, /\bеё\b|\bих\b/);
    assert.equal(A.archiveResultDetails({ diagnostic_invites_in_progress: n })[0], line, "the dialog and the toast say it the same way");
  }
});

test("after archiving the toast reports the SERVER's numbers, only those above zero", () => {
  assert.deepEqual(A.archiveResultDetails({ diagnostic_invites_cancelled: 2, diagnostic_invites_in_progress: 1 }), [
    "Отменено приглашений на диагностику: 2",
    "Идёт диагностика: 1 — ученик сможет закончить, результат сохранится в карточке",
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
  assert.match(page, /cancelled: \{ label: INVITE_CANCELLED_LABEL, color: "bg-slate-100 text-slate-600 border-slate-200"/); // AA at 12px: slate-600 on slate-100
  // the counters ask the helpers, never a hand-written list of statuses
  assert.match(page, /awaiting_start: periodInvites\.filter\(\(i\) => isInviteWaiting\(i\.status\)\)\.length/);
  assert.match(page, /if \(!isInviteWaiting\(inv\.status\)\) return false;/);
  assert.doesNotMatch(page, /\["pending", "confirmed"\]/);
  // «Зачислен» is the student's; a cancelled invite keeps its own status label and is not in the «Зачислены» filter
  assert.match(page, /periodInvites\.filter\(isInviteAssigned\)\.length/);
  assert.equal((page.match(/is_assigned \|\|/g) || []).length, 0, "the page has no definition of «assigned» of its own");
  assert.match(page, /const cancelHint = inviteCancelHint\(inv\);/);
  assert.match(page, /\{cancelHint && \(\s*<span data-testid="diagnostic-cancel-hint" className="text-xs text-slate-500">/);
  // the link to copy is for a pending invite only
  assert.match(page, /\{inv\.status === "pending" \? \(\s*<button/);
});

test("«Зачислен» is the student's, never a cancelled invite's (the real helper the staff list uses)", () => {
  const enrolled = { is_assigned: true, group_id: "g", student_status: "active" };
  assert.equal(D.isInviteAssigned({ status: "pending", ...enrolled }), true);
  assert.equal(D.isInviteAssigned({ status: "completed", student_status: "active" }), true);
  assert.equal(D.isInviteAssigned({ status: "in_progress", group_id: "g" }), true);
  assert.equal(D.isInviteAssigned({ status: "completed", is_assigned: true }), true);
  // a cancelled invite of an enrolled student (he was archived and came back) keeps its own status
  assert.equal(D.isInviteAssigned({ status: "cancelled", ...enrolled }), false);
  assert.equal(D.isInviteAssigned({ status: "cancelled", student_status: "archived" }), false);
  // not in a group at all
  assert.equal(D.isInviteAssigned({ status: "pending", student_status: "new" }), false);
  assert.equal(D.isInviteAssigned({ status: "completed", student_status: "archived" }), false);
  assert.equal(D.isInviteAssigned({}), false);
  // the counters of the list, with the real predicates: a cancelled invite is counted nowhere but «Всего»
  const invites = [
    { status: "pending" }, { status: "confirmed" }, { status: "in_progress" },
    { status: "cancelled", student_status: "active", group_id: "g" }, { status: "cancelled", student_status: "archived" },
    { status: "completed", student_status: "active" },
  ];
  assert.equal(invites.filter((i) => D.isInviteWaiting(i.status)).length, 2);
  assert.equal(invites.filter((i) => D.isInviteRunning(i.status)).length, 1);
  assert.equal(invites.filter(D.isInviteAssigned).length, 1);
  assert.equal(invites.length, 6);
});

test("the student card: a grey badge and the hint for a cancelled invite; no «Назначить диагностику» for an archived student", () => {
  const card = read("src/components/students/student-profile-view.tsx");
  assert.match(card, /const isDead = isInviteDead\(diag\.status\);/);
  assert.match(card, /\{studentCardInviteLabel\(diag\.status\)\}/);
  assert.doesNotMatch(card, /"Ожидает прохождения"/);
  assert.match(card, /\{cancelHint && <p className="mt-0\.5 text-xs text-slate-500">\{cancelHint\}<\/p>\}/);
  // the grey chip reaches AA at 12px (slate-600 on slate-50); the muted hint is slate-500 on white at least
  assert.match(card, /isDead \? "bg-slate-50 text-slate-600 border-slate-200"/);
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

test("a cancelled invite still asks diagnostic-service for a session that started BEFORE the cancellation; nothing to resume ends cancelled", () => {
  const e = (status, code) => ({ status, code });
  // the 410 INVITE_CANCELLED of the service: cancelled, whatever the auth-service said
  assert.equal(D.inviteEndsCancelled("cancelled", e(410, "INVITE_CANCELLED")), true);
  assert.equal(D.inviteEndsCancelled("confirmed", e(410, "INVITE_CANCELLED")), true);
  // the invite is cancelled and there is no session to resume (404 / 403 / any other 410): cancelled
  assert.equal(D.inviteEndsCancelled("cancelled", e(404, "SESSION_NOT_FOUND")), true);
  assert.equal(D.inviteEndsCancelled("cancelled", e(410, "SESSION_EXPIRED")), true);
  assert.equal(D.inviteEndsCancelled("cancelled", e(403, "INVITE_SESSION_MISMATCH")), true);
  // a failure to ask is not an answer: network error, 5xx, 429 -> the usual error screen with «Повторить»
  assert.equal(D.inviteEndsCancelled("cancelled", new Error("Failed to fetch")), false);
  assert.equal(D.inviteEndsCancelled("cancelled", e(500, "SESSION_RESTORE_FAILED")), false);
  assert.equal(D.inviteEndsCancelled("cancelled", e(429, undefined)), false);
  assert.equal(D.inviteEndsCancelled("cancelled", null), false);
  // an invite that is not cancelled keeps its own handling of 404 / 410 (expired, session gone)
  assert.equal(D.inviteEndsCancelled("expired", e(410, "INVITE_EXPIRED")), false);
  assert.equal(D.inviteEndsCancelled("confirmed", e(404, "SESSION_NOT_FOUND")), false);
  assert.equal(D.inviteEndsCancelled(undefined, e(404, "SESSION_NOT_FOUND")), false);
});

test("the student's entry page: a 200 «cancelled» goes through resolve / resume; only the service's refusal ends on «Приглашение отменено», never a new session", () => {
  const page = read("src/app/d/[code]/page.tsx");
  // no early return on the status: it is not closed before the service has been asked
  assert.doesNotMatch(page, /isInviteCancelled\(info\.status\)/);
  assert.match(page, /let inviteStatus: string \| undefined;/);
  assert.match(page, /inviteStatus = info\.status;/);
  assert.match(page, /diagnosticApi\.resolveSession\(code\)/);
  // the end of the page follows the pure decision, in the check ...
  assert.match(page, /setInviteCancelled\(inviteEndsCancelled\(inviteStatus, err\)\);/);
  // ... and in the start of a session (a 410 INVITE_CANCELLED there)
  assert.equal((page.match(/setInviteCancelled\(isInviteCancelledError\(err\)\);/g) || []).length, 1);
  assert.match(page, /\{inviteCancelled \? INVITE_CANCELLED_MESSAGE : /);
  assert.match(page, /\{inviteCancelled \? INVITE_CANCELLED_CENTER_HINT : /);
  // every new check starts clean
  assert.match(page, /setErrorMsg\(null\);\s*setInviteCancelled\(false\);/);
  // only a pending invite is confirmed, only a CONFIRMED one with no session of its own may start a new one
  assert.match(page, /if \(info\.status === "pending"\) \{\s*setPhase\("confirm"\);/);
  assert.match(page, /!recoveringAnswer && info\.status === "confirmed" && err instanceof ApiError && err\.status === 404 && err\.code === "SESSION_NOT_FOUND"/);
  assert.equal((page.match(/setPhase\("welcome"\)/g) || []).length, 2, "the two existing ways to the welcome screen: after confirm, and no session of a confirmed invite");
});

test("the report offers «В группу» only for a student who is not in the archive (the server refuses an archived one)", () => {
  const report = read("src/app/admin/diagnostics/[id]/report/page.tsx");
  assert.match(report, /\{!isTeacher && invite\.status === "completed" && invite\.student_id && !isArchivedStatus\(invite\.student_status\) && \(\s*<button/);
  assert.match(report, /import \{ isArchivedStatus \} from "@\/lib\/student-archive";/);
  // the status it reads is the profile's, loaded with the report
  assert.match(report, /found\.student_status = studentData\.student\.status;/);
});
