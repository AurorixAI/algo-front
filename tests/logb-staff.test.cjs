// LOGIC-B O2 / O10: removing a member, the handover of his groups, «Бывшие сотрудники» / «Вернуть в команду», the role guard, the invitations.
// Read against the frozen contract (tests/fixtures/logB = artifacts/partner_doc_check/logicB_fixtures).
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
require.extensions[".tsx"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/logB", `${name}.json`), "utf8"));
const S = require(path.join(root, "src/lib/staff-lifecycle.ts"));
const E = require(path.join(root, "src/lib/ops-errors.ts"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { RemovalDialogBody } = require(path.join(root, "src/components/staff/remove-member-dialog.tsx"));
const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const refusal = (status, body) => Object.assign(new Error(body.detail.message), { status, code: body.detail.code, detail: body.detail });

const impact = fixture("c1_removal_impact_A");
const teachers = [
  { id: "B", name: "Петров П." },
  { id: "C", name: "Сидоров С." },
];

// ── the removal dialog (chain 1) ───────────────────────────────────────────────────────────────

test("[O2.R1] the dialog of a teacher with two groups: the title, the lead with the count of groups, a select per group, «Передать всем» on top", () => {
  const choices = S.emptyChoices(impact.groups.map((group) => group.id));
  const html = renderToStaticMarkup(React.createElement(RemovalDialogBody, {
    name: "Иванов И.", impact, loadError: null, isRole: false, targets: teachers, choices, everyone: "", conflicts: {}, busy: false, error: null,
    onRetry() {}, onChoice() {}, onEveryone() {},
  }));
  const text = textOf(html);
  assert.match(text, /Чтобы удалить «Иванов И\.», сначала передайте его группы другому преподавателю \(2 гр\.\)\./);
  assert.match(text, /Передать всем/);
  assert.equal((html.match(/role="combobox"/g) || []).length, 3); // everyone + one per group (the project's Select, INC-14)
  assert.doesNotMatch(html, /<select/);
  assert.match(text, /9-А · 3 уч\./);
  assert.match(text, /7-Б · 2 уч\./);
  assert.match(text, /Ближайший урок: Ср, 21\.10 16:00|Ближайший урок: ср, 21\.10 16:00/);
  assert.match(fs.readFileSync(path.join(root, "src/components/staff/remove-member-dialog.tsx"), "utf8"), /\{ value: UNASSIGNED, label: KEEP_UNASSIGNED_LABEL \}/); // the list opens on demand: «Оставить без преподавателя» is its last option
  assert.match(text, /Пропущенных уроков: 1\. Их разберёт администратор\./);
  assert.doesNotMatch(text, /Будущие замены/); // none in the fixture: count 0 is not mentioned
  assert.equal(S.groupsBlockTitle(), "У сотрудника есть группы");
});

test("[O2.R1] the choice «Оставить без преподавателя» asks for the checkbox; the button waits for every group", () => {
  const ids = impact.groups.map((group) => group.id);
  let choices = S.emptyChoices(ids);
  assert.equal(S.canSubmitHandover(impact, choices), false);
  choices = { ...choices, [ids[0]]: { value: "C", confirmed: false }, [ids[1]]: { value: S.UNASSIGNED, confirmed: false } };
  assert.equal(S.canSubmitHandover(impact, choices), false, "unassigned without the tick");
  const html = renderToStaticMarkup(React.createElement(RemovalDialogBody, {
    name: "Иванов И.", impact, loadError: null, isRole: false, targets: teachers, choices, everyone: "", conflicts: {}, busy: false, error: null,
    onRetry() {}, onChoice() {}, onEveryone() {},
  }));
  assert.match(textOf(html), /Я понимаю: у уроков этой группы не будет преподавателя/);
  choices = { ...choices, [ids[1]]: { value: S.UNASSIGNED, confirmed: true } };
  assert.equal(S.canSubmitHandover(impact, choices), true);
  assert.deepEqual(S.buildHandoverBody(impact, choices), {
    assignments: [{ groupId: ids[0], teacherId: "C" }, { groupId: ids[1], teacherId: null }],
    confirmUnassigned: true,
  });
  // nobody is left without a teacher: the flag stays false
  const all = S.applyToAll(S.emptyChoices(ids), "B");
  assert.equal(S.buildHandoverBody(impact, all).confirmUnassigned, false);
  assert.deepEqual(S.buildHandoverBody(impact, all).assignments.map((a) => a.teacherId), ["B", "B"]);
});

test("[O2.R1] «Передать всем» fills every group; a lesson in progress stops the button and says why", () => {
  const ids = impact.groups.map((group) => group.id);
  const all = S.applyToAll(S.emptyChoices(ids), "B");
  assert.ok(ids.every((id) => all[id].value === "B"));
  const live = { ...impact, inProgressLessons: [{ groupId: ids[1], groupName: "7-Б", lessonDate: "2026-10-21", lessonId: "lesson-l3" }] };
  assert.equal(S.canSubmitHandover(live, all), false);
  const html = renderToStaticMarkup(React.createElement(RemovalDialogBody, {
    name: "Иванов И.", impact: live, loadError: null, isRole: false, targets: teachers, choices: all, everyone: "B", conflicts: {}, busy: false, error: null,
    onRetry() {}, onChoice() {}, onEveryone() {},
  }));
  assert.match(textOf(html), /Сейчас идёт урок «7-Б»\. Завершите или отмените его, затем повторите\./);
});

test("[O2.R7] a member without groups gets the plain confirmation; the future substitutions are announced when there are some", () => {
  const free = { ...impact, canRemove: true, groups: [], futureSubstitutions: { count: 2 }, missedLessons: { count: 0 } };
  const html = renderToStaticMarkup(React.createElement(RemovalDialogBody, {
    name: "Каримова Д.", impact: free, loadError: null, isRole: false, targets: teachers, choices: {}, everyone: "", conflicts: {}, busy: false, error: null,
    onRetry() {}, onChoice() {}, onEveryone() {},
  }));
  const text = textOf(html);
  assert.match(text, /Удалить сотрудника «Каримова Д\.»\? Он потеряет доступ в систему\. Вернуть можно в разделе «Бывшие сотрудники»\./);
  assert.match(text, /Будущие замены этого сотрудника \(2\) будут сняты: уроки вернутся преподавателям групп\./);
  assert.equal((html.match(/<select/g) || []).length, 0);
});

test("[O2.R9] the role guard: the same dialog, worded for the change of a role", () => {
  const html = renderToStaticMarkup(React.createElement(RemovalDialogBody, {
    name: "Иванов И.", impact, loadError: null, isRole: true, targets: teachers, choices: S.emptyChoices(impact.groups.map((g) => g.id)), everyone: "",
    conflicts: {}, busy: false, error: null, onRetry() {}, onChoice() {}, onEveryone() {},
  }));
  assert.match(textOf(html), /Чтобы изменить роль «Иванов И\.», сначала передайте его группы другому преподавателю \(2 гр\.\)\./);
});

test("[O2.R1] MEMBER_HAS_ASSIGNMENTS (the DELETE refusal) is read as the removal impact; any other refusal is not", () => {
  const body = fixture("x_member_has_assignments");
  const read = S.impactFromRefusal(refusal(body.status, body.body), "member-1");
  assert.equal(read.canRemove, false);
  assert.deepEqual(read.groups.map((g) => g.name), ["7-Б", "9-А"]);
  assert.equal(read.missedLessons.count, 1);
  assert.equal(S.impactFromRefusal(refusal(409, { detail: { code: "NOT_REMOVED", message: "x" } }), "m"), null);
  assert.equal(S.impactFromRefusal(new Error("boom"), "m"), null);
});

test("[O2.R1] the busy new teacher: one line per group in the words of the spec, with the name of the chosen teacher", () => {
  const body = fixture("c1_handover_busy");
  const detail = body.body.detail;
  assert.equal(body.status, 409);
  const groupId = detail.conflicts[0].groupId;
  const lines = S.handoverConflictLines(detail, (id) => (id === groupId ? "Петров П." : null));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].groupId, groupId);
  // «У {имя} уже есть урок «{группа}» {день} {начало}–{конец}. Выберите другого преподавателя.»
  assert.match(lines[0].text, /^У Петров П\. уже есть урок «8-В» Пн, 26\.10 10:00–11:30\. Выберите другого преподавателя\.$|^У Петров П\. уже есть урок «8-В» пн, 26\.10 10:00–11:30\. Выберите другого преподавателя\.$/);
  const shown = renderToStaticMarkup(React.createElement(RemovalDialogBody, {
    name: "Иванов И.", impact, loadError: null, isRole: false, targets: teachers,
    choices: S.applyToAll(S.emptyChoices(impact.groups.map((g) => g.id)), "B"), everyone: "B", conflicts: { [groupId]: lines[0].text }, busy: false, error: null,
    onRetry() {}, onChoice() {}, onEveryone() {},
  }));
  assert.match(textOf(shown), /Выберите другого преподавателя\./);
});

test("[O2.R2] the handover answers of the contract are read: handed over groups, nothing left, no substitutions", () => {
  const ok = fixture("c1_handover_ok");
  assert.equal(ok.handedOver.length, 2);
  assert.deepEqual(ok.remainingGroups, []);
  const removed = fixture("c1_delete_member_A");
  assert.equal(removed.releasedSubstitutions, 0);
  assert.equal(typeof removed.message, "string");
});

test("the targets of a handover: every active staff member who can teach (teachers, administrators, the owner), the role named, never the one who leaves", () => {
  const rows = [
    { id: "u1", member_id: "m1", user_id: "u1", email: "a@x", first_name: "Иван", last_name: "Иванов", org_role: "teacher", is_active: true },
    { id: "u2", member_id: "m2", user_id: "u2", email: "b@x", first_name: "Пётр", last_name: "Петров", org_role: "teacher", is_active: true },
    { id: "u3", member_id: "m3", user_id: "u3", email: "c@x", first_name: "Дилноза", last_name: "Каримова", org_role: "admin", is_active: true },
    { id: "u4", member_id: "m4", user_id: "u4", email: "d@x", first_name: "Сидор", last_name: "Сидоров", org_role: "teacher", is_active: false },
    { id: "u5", member_id: "m5", user_id: "u5", email: "e@x", first_name: "Усман", last_name: "Усманов", org_role: "owner", is_active: true },
  ];
  assert.deepEqual(S.handoverTargets(rows, "u1").map((t) => t.label), ["Пётр Петров", "Дилноза Каримова — Администратор", "Усман Усманов — Владелец"]);
  assert.deepEqual(S.handoverTargets(rows).map((t) => t.id), ["u1", "u2", "u3", "u5"]);
});

// ── former staff (chain 6) ─────────────────────────────────────────────────────────────────────

test("[O2.R3] «Бывшие сотрудники»: the removed member of the contract reads with his role and the day of the removal; «Вернуть в команду» confirms in the words of the spec", () => {
  const removed = fixture("c6_members_removed");
  assert.equal(removed.is_active, false);
  assert.equal(removed.org_role, "teacher");
  // 2026-10-21T09:00:00 UTC is 14:00 in Tashkent: the same day
  assert.equal(S.removedOnText(removed.removed_at), "Удалён 21.10.2026");
  assert.equal(S.removedOnText(null), "Удалён");
  assert.equal(S.RESTORE_TITLE, "Вернуть в команду");
  assert.equal(S.restoreConfirmText("Иван Иванов"), "Вернуть «Иван Иванов» в команду? Группы ему не вернутся — передайте их вручную.");
});

// ── invitations (chain 6, O10) ─────────────────────────────────────────────────────────────────

test("[O10.R1] the e-mail is required, normalised, and checked before the request goes out", () => {
  assert.equal(S.inviteEmailError(""), "Укажите email: приглашение выдаётся на него.");
  assert.equal(S.inviteEmailError("   "), "Укажите email: приглашение выдаётся на него.");
  assert.match(S.inviteEmailError("ivan"), /неверно/);
  assert.equal(S.inviteEmailError(" T@X.uz "), null);
  assert.equal(S.normalizeEmail(" T@X.uz "), "t@x.uz");
  assert.equal(S.inviteErrorText(refusal(422, fixture("x_email_required").body)), "Укажите email: приглашение выдаётся на него.");
  assert.equal(S.inviteErrorText(refusal(403, { detail: { code: "ONLY_OWNER_INVITES_ADMIN", message: "x" } })), "Приглашать администраторов может только владелец.");
  assert.equal(S.INVITE_ADMIN_HINT, "Приглашать администраторов может только владелец.");
});

test("[O10.R5][O10.R6] a lapsed invitation is «Истекло» and offers «Пригласить заново»; a live one says «Действует до 28.10, 14:00» on the Tashkent clock", () => {
  const created = fixture("c6_invitation_create"); // expires 2026-11-17T09:00:00+00:00
  assert.equal(S.inviteValidUntilText("2026-10-28T09:00:00"), "Действует до 28.10, 14:00"); // naive UTC of a list
  assert.equal(S.inviteValidUntilText("2026-10-28T09:00:00+00:00"), "Действует до 28.10, 14:00"); // with the offset of a creation
  assert.equal(S.inviteValidUntilText(created.expires_at), "Действует до 17.11, 14:00");
  assert.equal(S.INVITE_EXPIRED_BADGE, "Истекло");
  assert.equal(S.INVITE_AGAIN_LABEL, "Пригласить заново");
  const now = new Date("2026-10-29T00:00:00Z");
  assert.equal(S.inviteState({ status: "pending", expires_at: "2026-10-28T09:00:00" }, now), "expired"); // the list was read before the lapse
  assert.equal(S.inviteState({ status: "pending", expires_at: "2026-11-02T09:00:00" }, now), "pending");
  assert.equal(S.inviteState({ status: "expired", expires_at: "2026-11-02T09:00:00" }, now), "expired");
  assert.equal(S.inviteState({ status: "pending", expires_at: "2026-10-29T00:00:00" }, now), "expired", "expires_at <= now is lapsed");
  const rows = [
    { id: "1", code: "AAAA", org_role: "teacher", status: "expired", expires_at: "2026-10-20T09:00:00" },
    { id: "2", code: "BBBB", org_role: "teacher", status: "accepted", expires_at: "2026-11-20T09:00:00" },
    { id: "3", code: "CCCC", org_role: "admin", status: "pending", expires_at: "2026-11-02T09:00:00" },
    { id: "4", code: "DDDD", org_role: "teacher", status: "cancelled", expires_at: "2026-11-20T09:00:00" },
  ];
  assert.deepEqual(S.sortInvitations(rows, now).map((r) => r.code), ["CCCC", "AAAA"], "live first, then the lapsed; accepted and cancelled are not listed");
});

test("the screens of the pack are wired: the staff page opens the dialogs, the tabs, the invitation form", () => {
  const page = read("src/app/owner/teachers/page.tsx");
  for (const needle of [/RemoveMemberDialog/, /Бывшие сотрудники/, /RESTORE_TITLE/, /INVITE_AGAIN_LABEL/, /INVITE_EXPIRED_BADGE/, /inviteValidUntilText/, /INVITE_ADMIN_HINT/, /opsApi\.restoreMember/, /listMembers\("removed"\)/, /required/]) {
    assert.match(page, needle, String(needle));
  }
  assert.doesNotMatch(page, /confirm\(\s*"Удалить сотрудника из организации/);
  assert.doesNotMatch(page, /опционально/);
  const api = read("src/lib/api.ts");
  for (const route of [/members\/\$\{encodePathId\(memberId\)\}\/removal-impact/, /members\/\$\{encodePathId\(memberId\)\}\/handover/, /members\/\$\{encodePathId\(memberId\)\}\/restore/]) {
    assert.match(api, route, String(route));
  }
});
