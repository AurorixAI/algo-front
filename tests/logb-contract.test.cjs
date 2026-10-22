// LOGIC-B: the front against the frozen contract (tests/fixtures/logB = artifacts/partner_doc_check/logicB_contract.json + logicB_fixtures).
// If the backend changes a shape or a code, the copy of the contract is replaced and this file says what the front has to follow.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const dir = path.join(__dirname, "fixtures/logB");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const json = (name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
const contract = json("_contract");
const index = json("index");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(d, entry.name)) : [path.join(d, entry.name)]));
const sources = walk(path.join(root, "src")).filter((file) => /\.(ts|tsx)$/.test(file)).map((file) => fs.readFileSync(file, "utf8")).join("\n");

test("the contract has 34 operations and every fixture of the index is there and names a schema of the contract", () => {
  const operations = Object.entries(contract.paths).flatMap(([route, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${route}`));
  assert.equal(operations.length, 34);
  for (const [file, model] of Object.entries(index)) {
    assert.ok(fs.existsSync(path.join(dir, file)), file);
    if (model !== "-") assert.ok(contract.components.schemas[model], `${file}: ${model}`);
  }
});

test("every route of the pack that the front calls is in the contract and in api.ts", () => {
  const api = read("src/lib/api.ts");
  // contract route -> the piece of api.ts that calls it
  const calls = {
    "GET /org/members/{member_id}/removal-impact": /members\/\$\{encodePathId\(memberId\)\}\/removal-impact/,
    "POST /org/members/{member_id}/handover": /members\/\$\{encodePathId\(memberId\)\}\/handover/,
    "POST /org/members/{member_id}/restore": /members\/\$\{encodePathId\(memberId\)\}\/restore/,
    "GET /org/members": /\/auth\/org\/members\$\{status \? `\?status=\$\{status\}` : ""\}/,
    "DELETE /org/members/{member_id}": /\/auth\/org\/members\/\$\{memberId\}`, \{ method: "DELETE" \}/,
    "POST /org/invitations": /"\/auth\/org\/invitations", \{\s*method: "POST"/,
    "GET /org/invitations": /"\/auth\/org\/invitations"\)/,
    "GET /invite/{code}": /\/auth\/invite\/\$\{encodeURIComponent\(code\)\}/,
    "POST /invite/accept": /"\/auth\/invite\/accept"/,
    "GET /org/groups/{group_id}/archive-impact": /archive-impact/,
    "POST /org/groups/{group_id}/archive": /groups\/\$\{id\}\/archive`, \{ method: "POST"/,
    "POST /org/groups/{group_id}/restore": /groups\/\$\{id\}\/restore`/,
    "PUT /org/groups/{group_id}/lesson-teacher": /lesson-teacher`, \{ method: "PUT"/,
    "GET /org/groups/{group_id}/lesson-teacher-candidates": /lesson-teacher-candidates\?/,
    "POST /org/groups/{group_id}/attendance": /\/attendance`, \{ method: "POST", body: data \}/,
    "POST /org/groups/{group_id}/attendance/start": /\/attendance\/start`/,
    "POST /org/groups/{group_id}/attendance/reconcile": /\/attendance\/reconcile`/,
    "POST /org/groups/{group_id}/attendance/reconcile/cancel": /\/attendance\/reconcile\/cancel`/,
    "POST /org/schedule/lessons": /\/auth\/org\/schedule\/lessons`, \{ method: "POST"/,
    "POST /org/import/preview": /\/auth\/org\/import\/preview/,
    "POST /org/import/commit": /\/auth\/org\/import\/commit/,
  };
  for (const [operation, pattern] of Object.entries(calls)) {
    const [method, route] = operation.split(" ");
    assert.ok(contract.paths[route]?.[method.toLowerCase()], `${operation} is in the contract`);
    assert.match(api, pattern, operation);
  }
});

test("every error code of the contract is handled by name in the front, or is shown with the server's own Russian text on purpose", () => {
  // shown as the server wrote it: the message is already the sentence for the person
  const serverTextAsIs = {
    END_BEFORE_START: "the end of a recurrence: the server text under the form",
    LESSON_NOT_FOUND: "a lesson that is gone: the server text in the dialog",
    LESSON_OUTSIDE_WINDOW: "reconcile / cancel older than the window: the server text",
    STAFF_ROLE_REQUIRED: "no screen of a teacher creates a student; the server text if a call is forced",
    GROUP_NOT_FOUND: "a group that is gone: the server text in the dialog",
    MEMBER_NOT_FOUND: "a member that is gone: the server text in the dialog",
    VALID_FROM_RANGE: "the date of «Действует с» is checked in the form first; the server text if a call is forced",
    EMAIL_INVALID: "the invitation form: the server text under the e-mail field",
    STATUS_USE_ARCHIVE_ACTION: "the front never sends `status` to a group any more",
  };
  for (const code of Object.keys(contract["x-errors"])) {
    const named = sources.includes(code);
    if (!named) assert.ok(serverTextAsIs[code], `${code} is neither handled nor listed as shown as is`);
    if (!named) assert.match(contract["x-errors"][code].message, /[А-Яа-я]/, `${code}: the server text is Russian`);
  }
  for (const code of Object.keys(serverTextAsIs)) assert.ok(contract["x-errors"][code], `${code} is in the contract`);
});

test("every refusal of the fixtures is in the unified format {detail: {code, message}} with a known code", () => {
  const codes = new Set(Object.keys(contract["x-errors"]));
  let seen = 0;
  for (const file of Object.keys(index)) {
    const data = json(file.replace(/\.json$/, ""));
    if (!data || typeof data !== "object" || !("status" in data) || !data.body?.detail?.code) continue;
    seen += 1;
    assert.ok(codes.has(data.body.detail.code), `${file}: ${data.body.detail.code}`);
    assert.equal(typeof data.body.detail.message, "string", file);
    assert.ok(data.status >= 400 && data.status < 600, file);
  }
  assert.ok(seen >= 15, `${seen} refusals read`);
});

test("the fields the screens read are in the schemas they read", () => {
  const schemas = contract.components.schemas;
  const need = {
    SaveAttendanceRequestB: ["expectedVersion", "acknowledgeLiveExam"],
    SaveAttendanceOut: ["version", "examSync"],
    GroupAttendanceResponseB: ["versions", "lessonTeachers"],
    OpenAttendanceActionResponseB: ["requiresAdmin", "ageDays", "version", "isSubstitution"],
    ScheduleLessonResponseB: ["validFrom", "warnings", "room"],
    CreateLessonRequestB: ["validFrom", "room"],
    ScheduleOccurrenceResponseB: ["isSubstitution", "teacherName", "defaultTeacherName", "validFrom"],
    GroupResponseB: ["archivedAt", "archiveReason", "substitution"],
    ArchiveImpactOut: ["blockers", "autoActions", "warnings", "canArchive", "examService", "legacyStudentsLeft"],
    RemovalImpactOut: ["canRemove", "groups", "inProgressLessons", "futureSubstitutions", "missedLessons"],
    HandoverRequest: ["assignments", "confirmUnassigned"],
    InvitationOut: ["email", "expires_at", "status", "is_returning"],
    InviteInfoOut: ["email", "is_returning", "org_name"],
    MemberOut: ["is_active", "removed_at", "member_id"],
    ImportPreviewResponseB: ["skipped", "counts"],
    ImportCommitResponseB: ["skipped", "created_groups"],
    ImportCountsB: ["students_enrolled", "students_unchanged", "students_skipped"],
    StudentResponseB: ["status_view", "has_group"],
    LessonTeacherPut: ["lessonDate", "lessonId", "teacherId", "reason", "expectedTeacherId"],
    LessonTeacherCandidatesOut: ["candidates", "currentTeacherId", "defaultTeacherId"],
  };
  for (const [name, fields] of Object.entries(need)) {
    assert.ok(schemas[name], name);
    for (const field of fields) assert.ok(field in (schemas[name].properties ?? {}), `${name}.${field}`);
  }
  // …and the front's own types know them
  const types = read("src/lib/ops-b-types.ts") + read("src/lib/api.ts") + read("src/lib/student-status.ts");
  for (const field of ["expectedVersion", "acknowledgeLiveExam", "requiresAdmin", "validFrom", "archivedAt", "substitution", "status_view", "removed_at", "is_returning", "students_enrolled", "created_groups", "lessonTeachers", "versions"]) {
    assert.ok(types.includes(field), field);
  }
});
