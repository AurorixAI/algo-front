// Wave E / package E-A (front): «one rule - one implementation».  Each block is one decision of the lead (WAVE_E_SPEC.md):
//  5. one `newIdempotencyKey` (UUID v4 always, also without `crypto.randomUUID`);
//  6. one library of dates; 2. one registry of exam statuses; 1. the e-mail of an admin / teacher is read-only; 4. reasons by kind + the password rule; 7. the rest of DUP.
// MUTATIONS: the old behaviour is put back into a copy of the source and the same scenarios must fail.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const Module = require("node:module");

const root = path.join(__dirname, "..");
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
require.extensions[".ts"] = (mod, filename) => mod._compile(transpile(fs.readFileSync(filename, "utf8")), filename);
require.extensions[".tsx"] = (mod, filename) => mod._compile(transpile(fs.readFileSync(filename, "utf8")), filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {                              // the "@/" alias of the app
  if (request.startsWith("@/")) request = path.join(root, "src", request.slice(2));
  return resolveFilename.call(this, request, ...rest);
};
const read = require("./helpers/panel-sources.cjs").withPanel((p) => fs.readFileSync(path.join(root, p), "utf8"));
const lib = (name) => require(path.join(root, "src/lib", name));

/** A module loaded from a MUTATED copy of its source (sibling imports still resolve from the real folder). */
function loadMutated(file, from, to) {
  const source = read(file);
  assert.ok(source.includes(from), `mutation target not found in ${file}: ${from}`);
  const filename = path.join(root, file);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(transpile(source.replace(from, to)), filename);
  return mod.exports;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}
const SRC = walk("src");

/** Runs `fn` with `globalThis.crypto` replaced; the real one is put back afterwards. */
function withCrypto(replacement, fn) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: replacement, configurable: true, writable: true });
  try { return fn(); } finally {
    if (saved) Object.defineProperty(globalThis, "crypto", saved); else delete globalThis.crypto;
  }
}

// ---- decision 5: ONE idempotency key, always a UUID v4 -----------------------------------------------------------------------

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("E4/5: the key is a UUID v4 in EVERY environment (no randomUUID, throwing randomUUID, no crypto at all)", () => {
  const { newIdempotencyKey } = lib("idempotency-key.ts");
  const environments = {
    "modern": undefined,
    "no crypto.randomUUID (Safari < 15.4, insecure context)": { getRandomValues: (b) => { for (let i = 0; i < b.length; i += 1) b[i] = (i * 37 + 11) & 255; return b; } },
    "randomUUID throws": { randomUUID() { throw new Error("insecure"); } },
    "randomUUID returns not a uuid": { randomUUID: () => "not-a-uuid" },
    "no crypto at all": null,
    "crypto without any method": {},
  };
  for (const [name, replacement] of Object.entries(environments)) {
    const run = () => Array.from({ length: 30 }, () => newIdempotencyKey());
    const keys = replacement === undefined ? run() : withCrypto(replacement, run);
    for (const key of keys) assert.match(key, UUID_V4, `${name}: ${key}`);
    if (name !== "no crypto.randomUUID (Safari < 15.4, insecure context)") assert.equal(new Set(keys).size, 30, `${name}: keys differ`);
  }
});

test("E4/5: the old fallback «hex-rand-rand» is NOT a uuid - the scenario fails on it (mutation)", () => {
  const old = loadMutated("src/lib/idempotency-key.ts", "  const bytes = randomBytes();",
    "  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;\n  const bytes = randomBytes();");
  const key = withCrypto({}, () => old.newIdempotencyKey());
  assert.doesNotMatch(key, UUID_V4);
});

test("E4/5: there is ONE key function - payments, payouts, pauses, openings and support all import it; no other randomUUID in src/", () => {
  const withRandomUuid = SRC.filter((f) => /\brandomUUID\b/.test(read(f).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n")));
  assert.deepEqual(withRandomUuid, ["src/lib/idempotency-key.ts"]);
  for (const f of SRC) {
    const source = read(f);
    if (f === "src/lib/idempotency-key.ts") continue;
    assert.doesNotMatch(source, /function newIdempotencyKey|const newKey\b|function newClientKey|\bnewClientKey\b/, f);
  }
  for (const f of [
    "src/components/payments/payment-dialog.tsx", "src/components/payments/pause-dialog.tsx", "src/components/payroll/payout-dialog.tsx",
    "src/components/payments/openings-page.tsx", "src/components/support/support-dialog.tsx",
  ]) assert.match(read(f), /import \{ newIdempotencyKey \} from "@\/lib\/idempotency-key";/, f);
});

// ---- decision 6: ONE library of dates (lib/business-time.ts), no throw on an empty / wrong date -----------------------------

const time = lib("business-time.ts");

test("E4/6: an empty or wrong date gives EMPTY (a date) or 0 (a count) and never throws", () => {
  for (const bad of ["", "   ", "nope", "2026-13-01", "2026-02-31", "2026-00-10", null, undefined]) {
    assert.equal(time.addIsoDays(bad, 3), "", `addIsoDays(${JSON.stringify(bad)})`);
    if (bad !== "2026-02-31") assert.equal(time.shiftDateByMonth(bad, 1), "", `shiftDateByMonth(${JSON.stringify(bad)})`);   // only the month matters there
    assert.equal(time.daysBetween(bad, "2026-10-16"), 0);
    assert.equal(time.daysBetween("2026-10-16", bad), 0);
    assert.equal(time.daysBetweenInclusive(bad, "2026-10-16"), 0);
    assert.equal(time.daysBetweenInclusive("2026-10-16", bad), 0);
  }
  assert.equal(time.shiftMonthKey("nope", 1), "nope");                   // a month key that is not one is returned as it was
});

test("E4/6: good dates - the same answers as the old copies had", () => {
  assert.equal(time.addIsoDays("2026-10-31", 1), "2026-11-01");
  assert.equal(time.addIsoDays("2028-03-01", -1), "2028-02-29");
  assert.equal(time.addIsoDays("2026-12-31", 1), "2027-01-01");
  assert.equal(time.addIsoDays("2026-10-16T10:00:00", 1), "2026-10-17");   // a timestamp keeps working as before (the date part)
  assert.equal(time.shiftDateByMonth("2026-12-17", 1), "2027-01-01");
  assert.equal(time.shiftDateByMonth("2027-01-31", -1), "2026-12-01");
  assert.equal(time.shiftDateByMonth("2026-10", 0), "2026-10-01");
  assert.equal(time.shiftMonthKey("2026-12", 1), "2027-01");
});

test("E4/6: two meanings, two names - daysBetween is the difference, daysBetweenInclusive counts both ends", () => {
  assert.equal(time.daysBetween("2026-10-14", "2026-10-17"), 3);
  assert.equal(time.daysBetween("2026-10-17", "2026-10-14"), -3);
  assert.equal(time.daysBetween("2026-10-16", "2026-10-16"), 0);
  assert.equal(time.daysBetweenInclusive("2026-10-16", "2026-10-16"), 1);
  assert.equal(time.daysBetweenInclusive("2026-10-16", "2026-10-18"), 3);
  assert.equal(time.daysBetweenInclusive("2026-02-27", "2026-03-02"), 4);
});

test("E4/6: the consumers of the library keep their rules (a day off up to 14 days, a pause counts both ends, the income step)", () => {
  const payf = lib("payf.ts");
  assert.equal(payf.dayOffDatesError({ dateFrom: "2026-10-01", dateTo: "2026-10-14" }), null);
  assert.match(payf.dayOffDatesError({ dateFrom: "2026-10-01", dateTo: "2026-10-15" }), /не больше 14 дней/);
  assert.equal(payf.dayOffDatesError({ dateFrom: "", dateTo: "" }), "Укажите дату");
  const logica = lib("payments-logica.ts");
  assert.equal(logica.pauseDays("2026-10-01", "2026-10-03"), 3);
  assert.equal(logica.pauseDays("2026-10-03", "2026-10-01"), 0);
  const income = lib("payments-income-v2.ts");
  assert.deepEqual(income.stepPeriod({ kind: "month", from: "2026-12-01", to: "2026-12-31" }, 1), { kind: "month", from: "2027-01-01", to: "2027-01-31" });
  assert.deepEqual(income.stepPeriod({ kind: "custom", from: "2026-10-01", to: "2026-10-07" }, -1), { kind: "custom", from: "2026-09-24", to: "2026-09-30" });
  const excuses = lib("attendance-excuses.ts");
  assert.equal(excuses.validateExcusePeriod("2026-08-01", "2026-10-31"), null);                      // 92 days
  assert.equal(excuses.validateExcusePeriod("2026-08-01", "2026-11-01"), null);                      // 93 days
  assert.match(excuses.validateExcusePeriod("2026-08-01", "2026-11-02"), /длиннее 93 дней/);
  assert.match(excuses.validateExcusePeriod("2026-10-02", "2026-10-01"), /раньше/);
  assert.equal(excuses.validateExcusePeriod("", "2026-10-01"), "Укажите даты периода");
  const forms = lib("form-fields.ts");
  assert.equal(forms.moveCalendarFocus("2026-10-31", "ArrowRight"), "2026-11-01");
  assert.equal(forms.moveCalendarFocus("2026-03-01", "ArrowLeft"), "2026-02-28");
  assert.equal(forms.moveCalendarFocus("", "ArrowLeft"), "");
});

test("E4/6: the old schedule dialogs threw RangeError on an empty date; now the library answers empty (mutation: the check is removed)", () => {
  assert.throws(() => { const value = new Date("T12:00:00Z"); value.setUTCDate(value.getUTCDate() + 1); value.toISOString(); }, RangeError);   // the old shiftDate / addDays
  const broken = loadMutated("src/lib/business-time.ts",
    "return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;", "return date;");
  assert.notEqual(broken.addIsoDays("2026-02-31", 1), "");                // without the check a non-existent day silently rolls over: the scenario above would fail
});

test("E4/6: no private copy of the date arithmetic is left in src/ (only lib/business-time.ts owns it)", () => {
  const owner = "src/lib/business-time.ts";
  const names = /\b(?:function|const)\s+(shiftDate|addDays|addDaysIso|daysBetween|shiftMonth|shiftMonthKey|shiftBusinessMonth|shiftDateByMonth|dayNumber|isoToUtcDay)\b/;
  const mathOnDates = /setUTCDate|T12:00:00Z/;
  for (const f of SRC) {
    if (f === owner) continue;
    const source = read(f);
    assert.doesNotMatch(source, names, `${f}: a private date function`);
    assert.doesNotMatch(source, mathOnDates, `${f}: date arithmetic outside the library`);
  }
});

// ---- decision 2: `variants_ready` is «Готов к назначению» for EVERY role; «Черновик» is only `draft` (one registry) -------------

const registry = lib("status-registry.ts");
const TEACHER_EXAM_SCREENS = [
  "src/app/teacher/exams/page.tsx", "src/components/groups/group-exams-tab.tsx",
  "src/app/teacher/exams/[id]/page.tsx", "src/app/teacher/exams/[id]/draft/page.tsx",
];
/** Where a screen writes the word «Черновик» for a `variants_ready` exam (a literal in the same branch / object). */
function variantsReadyCalledDraft(source) {
  return /variants_ready[^;]{0,260}?["']Черновик["']/s.test(source.replace(/\{\s*key: "draft", label: "Черновики"/g, ""));
}

test("E4/2: the registry says «Готов к назначению» for variants_ready and «Черновик» only for draft", () => {
  assert.equal(registry.examStatusView("variants_ready").label, "Готов к назначению");
  assert.equal(registry.examStatusView("draft").label, "Черновик");
  assert.notEqual(registry.examStatusView("variants_ready").label, registry.examStatusView("draft").label);
});

test("E4/2: the teacher's screens (list, group tab, exam header, draft page) take the label from the registry - no «Черновик» for variants_ready", () => {
  for (const f of TEACHER_EXAM_SCREENS) {
    const source = read(f);
    assert.match(source, /examStatusView/, `${f}: reads the registry`);
    assert.equal(variantsReadyCalledDraft(source), false, `${f}: variants_ready is not a draft`);
  }
  const list = read("src/app/teacher/exams/page.tsx");
  assert.match(list, /variants_ready: \{[^}]*label: examStatusView\("variants_ready"\)\.label/s);
});

test("E4/2: mutation - the old text puts «Черновик» back and the guard sees it", () => {
  const list = read("src/app/teacher/exams/page.tsx");
  assert.equal(variantsReadyCalledDraft(list.replace('label: examStatusView("variants_ready").label', 'label: "Черновик"')), true);
  const group = read("src/components/groups/group-exams-tab.tsx");
  assert.equal(variantsReadyCalledDraft(group.replace('? examStatusView(ex.status).label', '? "Черновик"')), true);
});

// ---- decision 1: the e-mail of an administrator and a teacher is read-only; the profile request has no `email` ---------------

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const profileLib = lib("profile-form.ts");
const passwords = lib("set-password.ts");
const STAFF_SETTINGS = ["src/app/admin/settings/page.tsx", "src/app/teacher/settings/page.tsx"];
/** The old behaviour: the page keeps `email` in the form state and sends the whole form. */
const sendsEmail = (source) => /updateProfile\((profile|profileForm)\)|setProfile\(\{[^}]*email/.test(source) || /useState\(\{[^}]*email:/s.test(source);

test("E2/1: the request of the profile has no email - whatever the form holds", () => {
  const body = profileLib.profileUpdateBody({ first_name: "Иван", last_name: "Петров", email: "new@example.com", language: "ru", is_admin: true });
  assert.deepEqual(Object.keys(body).sort(), ["first_name", "language", "last_name"]);
  assert.deepEqual(profileLib.profileUpdateBody({ first_name: "А", last_name: "Б", email: "x@y.z" }), { first_name: "А", last_name: "Б" });
});

test("E2/1: «Почта» of the administrator and the teacher is read-only with the hint «Почту меняет владелец центра»", () => {
  assert.equal(profileLib.EMAIL_OWNER_ONLY_HINT, "Почту меняет владелец центра");
  const { ReadonlyEmailField } = require(path.join(root, "src/components/settings/readonly-email-field.tsx"));
  const html = renderToStaticMarkup(React.createElement(ReadonlyEmailField, { id: "e", email: "teacher@centre.uz", labelClassName: "l", inputClassName: "i" }));
  assert.match(html, /<input[^>]*readOnly=""|<input[^>]*readonly=""/);
  assert.match(html, /value="teacher@centre\.uz"/);
  assert.match(html, /Почту меняет владелец центра/);
  assert.match(html, /aria-describedby="e-hint"/);
  assert.doesNotMatch(html, /onChange/);
  for (const f of STAFF_SETTINGS) {
    const source = read(f);
    assert.match(source, /<ReadonlyEmailField/, f);
    assert.match(source, /updateProfile\(profileUpdateBody\(profile\)\)/, f);
    assert.equal(sendsEmail(source), false, `${f}: the form does not hold or send an e-mail`);
  }
  assert.match(read("src/app/owner/settings/page.tsx"), /updateProfile\(profileUpdateBody\(profileForm\)\)/);
});

test("E2/1: mutation - the old pages (editable e-mail, whole form sent) are caught by the guard", () => {
  const teacher = read("src/app/teacher/settings/page.tsx");
  assert.equal(sendsEmail(teacher.replace("updateProfile(profileUpdateBody(profile))", "updateProfile(profile)")), true);
  assert.equal(sendsEmail(teacher.replace('last_name: user?.last_name || "",\n  });', 'last_name: user?.last_name || "",\n    email: user?.email || "",\n  });')), true);
  const admin = read("src/app/admin/settings/page.tsx");
  assert.equal(sendsEmail(admin.replace('last_name: user?.last_name || "" });', 'last_name: user?.last_name || "", email: user?.email || "" });')), true);
});

// ---- decision 4 (password part): «минимум 8» on the client, the hint on every form -----------------------------------------------

const PASSWORD_FORMS = [
  "src/app/admin/settings/page.tsx", "src/app/teacher/settings/page.tsx", "src/app/owner/settings/page.tsx",
  "src/app/change-password/page.tsx", "src/app/invite/[code]/page.tsx",
];

test("E2/4: a new password is checked by ONE function (8..128) with the one text of the hint", () => {
  assert.equal(passwords.newPasswordProblem("1234567"), "Минимум 8 символов");
  assert.equal(passwords.newPasswordProblem(""), "Минимум 8 символов");
  assert.equal(passwords.newPasswordProblem("12345678"), null);
  assert.match(passwords.newPasswordProblem("x".repeat(129)), /Не длиннее 128/);
  assert.equal(passwords.newPasswordProblem("x".repeat(128)), null);
});

test("E2/4: all five password forms use it and show the same hint; no literal 8 / «минимум 6» is left", () => {
  for (const f of PASSWORD_FORMS) {
    const source = read(f);
    assert.match(source, /newPasswordProblem\(/, `${f}: the check`);
    assert.match(source, /PASSWORD_HINT/, `${f}: the hint`);
    assert.doesNotMatch(source, /\.length < 8|[Мм]инимум 6|Минимум 8 символов/, `${f}: no private wording`);
  }
  // mutation: the old teacher form had no check and said «6»
  assert.match(read("src/app/teacher/settings/page.tsx").replace("placeholder={PASSWORD_HINT}", 'placeholder="Минимум 6 символов"'), /[Мм]инимум 6/);
});

// ---- decision 4 (reasons): ONE validator per kind with the limits of the server -----------------------------------------------

const reasons = lib("reason-rules.ts");

test("E2/4: the limits are the server's: cancel 3..500, excuse 3..300, reject 3..300, teacher change 3..300, day off 3..200", () => {
  assert.deepEqual(reasons.REASON_LIMITS, {
    cancel: { min: 3, max: 500 }, excuse: { min: 3, max: 300 }, reject: { min: 3, max: 300 },
    teacherChange: { min: 3, max: 300 }, dayOff: { min: 3, max: 200 },
  });
  for (const [kind, { min, max }] of Object.entries(reasons.REASON_LIMITS)) {
    assert.match(reasons.reasonProblemFor(kind, "x".repeat(min - 1)), /не менее/, kind);
    assert.equal(reasons.reasonProblemFor(kind, "x".repeat(min)), null, kind);
    assert.equal(reasons.reasonProblemFor(kind, "x".repeat(max)), null, kind);
    assert.match(reasons.reasonProblemFor(kind, "x".repeat(max + 1)), new RegExp(`не более ${max}`), kind);
    assert.match(reasons.reasonProblemFor(kind, null), /не менее/, kind);
    assert.match(reasons.reasonProblemFor(kind, "   "), /не менее/, kind);
  }
  // the day off is sent with its blanks collapsed - the same text is measured
  assert.match(reasons.reasonProblemFor("dayOff", "a    b".replace(/ +/, "  ").slice(0, 1) + "   "), /не менее/);
  assert.equal(reasons.reasonProblemFor("dayOff", "а    б"), null);
});

test("E2/4: a reason of 400 characters: a cancellation takes it, an excuse / refusal / change of teacher / day off refuse it - on EVERY screen of the kind", () => {
  const text = "x".repeat(400);
  assert.equal(reasons.reasonProblemFor("cancel", text), null);
  for (const kind of ["excuse", "reject", "teacherChange", "dayOff"]) assert.ok(reasons.reasonProblemFor(kind, text), kind);
  const subs = lib("substitutions.ts");
  assert.equal(subs.decisionReasonKind("cancel"), "cancel");
  assert.equal(subs.decisionReasonKind("reschedule"), "cancel");
  assert.equal(subs.decisionReasonKind("reject"), "reject");
  assert.ok(reasons.reasonProblemFor(subs.decisionReasonKind("reject"), text));
  assert.ok(lib("payf.ts").dayOffError({ dateFrom: "2026-10-21", dateTo: "", reason: "x".repeat(201) }));
  assert.equal(lib("payf.ts").dayOffError({ dateFrom: "2026-10-21", dateTo: "", reason: "x".repeat(200) }), null);
  assert.ok(lib("attendance-excuses.ts").validateExcusePeriod);
});

test("E2/4: no private copy of the reason check is left (the four old copies are gone); every screen takes the limit from the one table", () => {
  const privateCopy = /\b(CANCEL_REASON_M(?:IN|AX)|DECIDE_REASON_MIN|EXCUSE_REASON_M(?:IN|AX)|DAY_OFF_REASON_MIN)\b|function (cancelReasonProblem|reasonError|decisionReasonError|validateExcuseReason)\b|const REASON_M(?:IN|AX) = (?:3|300|500)\b/;
  for (const f of SRC) {
    if (/payments|openings|payroll|group-price/.test(f)) continue;                                  // the money reasons are another family (not in this decision)
    assert.doesNotMatch(read(f), privateCopy, `${f}: a private copy of a reason rule`);
  }
  for (const f of [
    "src/app/teacher/dashboard/page.tsx", "src/app/teacher/schedule/page.tsx", "src/components/attendance/cancel-missed-lesson-modal.tsx",
    "src/components/substitutions/lesson-cancel-panel.tsx", "src/components/groups/lesson-action-sheet.tsx", "src/components/groups/lesson-teacher-dialog.tsx",
    "src/components/substitutions/decision-dialog.tsx", "src/components/substitutions/bulk-dialog.tsx", "src/components/schedule/weekly-lesson-dialogs.tsx",
    "src/lib/attendance-excuses.ts", "src/lib/payf.ts",
  ]) assert.match(read(f), /reasonProblemFor|reason-rules/, f);
  assert.doesNotMatch(read("src/components/schedule/weekly-lesson-dialogs.tsx"), /reason\.trim\(\)\.length < 3|text\.length < 3/);
});

test("E2/4: mutation - the 300 limit of the old lesson-teacher copy put on the cancellation is caught", () => {
  const broken = loadMutated("src/lib/reason-rules.ts", "cancel: { min: 3, max: 500 }", "cancel: { min: 3, max: 300 }");
  assert.ok(broken.reasonProblemFor("cancel", "x".repeat(400)));
  assert.equal(reasons.reasonProblemFor("cancel", "x".repeat(400)), null);
});

// ---- DUP-5: the hand-made plurals are `pluralRu`; «из N заданий» (the genitive after «из») is NOT touched -----------------------------------

/** The reference rule (the one the old copies wrote by hand). */
const ruWord = (n, one, few, many) => {
  const tail = n % 100;
  const last = n % 10;
  return tail >= 11 && tail <= 14 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many;
};

test("DUP-5: students, lessons, hours: the same words for 0..125 as the old hand-made copies", () => {
  const tabs = lib("students-tabs.ts");
  const diag = lib("diagnostic-report.ts");
  for (let n = 0; n <= 125; n += 1) {
    assert.equal(tabs.studentsPlural(n), `${n} ${ruWord(n, "ученик", "ученика", "учеников")}`, `ученик ${n}`);
    assert.equal(diag.hoursLabel(n), `~${n} ${ruWord(n, "час", "часа", "часов")}`, `час ${n}`);
  }
  const subs = lib("substitutions.ts");
  for (const n of [2, 3, 5, 11, 12, 21, 22, 25, 101, 111]) assert.equal(subs.sendLabel(n), `Отправить запрос (${n} ${ruWord(n, "урок", "урока", "уроков")})`, `урок ${n}`);
});

test("DUP-5: no hand-made plural is left in the exam pages / students-tabs / substitutions / diagnostic-report; «из N заданий» keeps its genitive", () => {
  for (const f of ["src/lib/students-tabs.ts", "src/lib/substitutions.ts", "src/lib/diagnostic-report.ts", "src/app/teacher/exams/[id]/page.tsx", "src/app/teacher/exams/[id]/draft/page.tsx"]) {
    assert.doesNotMatch(read(f), /tail >= 11 && tail <= 14|lastTwoDigits >= 11|n % 100 !== 11|\[12, 13, 14\]/, `${f}: a hand-made plural`);
    assert.match(read(f), /pluralRu/, f);
  }
  // «из 2 заданий» is the right genitive plural after «из» (the audit called it a bug: it is not) - a replacement by pluralRu would give «из 3 задания»
  const level = lib("diagnostic-level.ts");
  assert.equal(level.formatSolvedMixed(1, 2), "Решено 1 из 2 заданий разной трудности");
  assert.equal(level.formatSolvedMixed(1, 3), "Решено 1 из 3 заданий разной трудности");
  assert.equal(level.formatSolvedMixed(1, 21), "Решено 1 из 21 задания разной трудности");
  assert.equal(level.formatSolvedMixed(1, 11), "Решено 1 из 11 заданий разной трудности");
  const time = lib("schedule-time.ts");
  assert.equal(time.completedLessonsProgressLabel(1, 3), "Завершено: 1 из 3 уроков");
  assert.equal(time.completedLessonsProgressLabel(0, 21), "Завершено: 0 из 21 урока");
});

// ---- DUP-6: ONE way to group thousands (non-breaking space) ----------------------------------------------------------------------------

test("DUP-6: a form filled by the program holds the same characters as the one typed into (all NBSP); payf writes «сум» like formatMoney", () => {
  const typed = lib("payments.ts").reformatMoneyTyping("450000");
  assert.equal(typed, "450 000");
  const logica = lib("payments-logica.ts");
  assert.equal(logica.openingValuesFrom({ debt_amount: 1250000 }).debt, "1 250 000");
  assert.equal(logica.openingValuesFrom({ debt_amount: 0 }).debt, "");
  assert.equal(lib("payroll-logica.ts").emptyPayoutValues("2026-10-16", { balance: 1250000 }).amount, "1 250 000");
  assert.equal(lib("payments-ledger.ts").paymentFormFrom({ amount: 450000, paid_on: "2026-10-16", note: null }).amount, typed);
  const payf = lib("payf.ts");
  assert.equal(payf.recalcAmountText({ amount: 46000 }), "\u221246\u00a0000\u00a0сум");
  assert.equal(lib("money-format.ts").formatMoney(450000), lib("payments.ts").formatMoney(450000));
});

test("DUP-6: no private thousands regex outside lib/money-format.ts", () => {
  for (const f of SRC) {
    if (f === "src/lib/money-format.ts") continue;
    assert.doesNotMatch(read(f), /\\B\(\?=\(\\d\{3\}\)\+/, `${f}: a private grouping of digits`);
  }
});

// ---- F-A07: role -> home page is one table; the sidebar logo leads to the HOME OF THE ROLE ----------------------------------------------

test("F-A07: the logo of the sidebar leads to the home of the role (owner / administrator / teacher / unknown)", () => {
  const home = lib("role-home.ts");
  assert.deepEqual(home.ROLE_HOME, { owner: "/owner/dashboard", admin: "/admin/diagnostics", teacher: "/teacher/dashboard" });
  // the sidebar computes: rawRole = the role of the person, role = "admin" for an owner (the same menu), so the owner is told by the RAW role
  assert.equal(home.homeForSidebar("owner", "admin"), "/owner/dashboard");
  assert.equal(home.homeForSidebar("admin", "admin"), "/admin/diagnostics");
  assert.equal(home.homeForSidebar("teacher", "teacher"), "/teacher/dashboard");
  assert.equal(home.homeForSidebar(undefined, undefined), "/teacher/dashboard");
  assert.equal(home.homeForSidebar("stranger", "stranger"), "/teacher/dashboard");
  const sidebar = read("src/components/layout/sidebar.tsx");
  assert.match(sidebar, /href=\{homeForSidebar\(rawRole, role\)\}/);
  assert.doesNotMatch(sidebar, /\?\s*"\/owner\/dashboard"\s*:|\?\s*"\/admin\/diagnostics"\s*:/);
});

test("F-A07: mutation - the logo always on the teacher's page, or the owner not told by the raw role, is caught", () => {
  const always = loadMutated("src/lib/role-home.ts", 'ROLE_HOME[rawRole === "owner" ? "owner" : role === "admin" ? "admin" : "teacher"]', 'ROLE_HOME["teacher"]');
  assert.notEqual(always.homeForSidebar("owner", "admin"), "/owner/dashboard");
  const byRole = loadMutated("src/lib/role-home.ts", 'rawRole === "owner" ? "owner" :', 'role === "owner" ? "owner" :');
  assert.notEqual(byRole.homeForSidebar("owner", "admin"), "/owner/dashboard");
  // the link of the page itself: another call in the sidebar is caught by the source guard
  const sidebar = read("src/components/layout/sidebar.tsx");
  assert.doesNotMatch(sidebar.replace("homeForSidebar(rawRole, role)", 'ROLE_HOME["teacher"]'), /href=\{homeForSidebar\(rawRole, role\)\}/);
});

// ---- DUP-2: the names of the months live in lib/ru-calendar.ts only ----------------------------------------------------------------------

test("DUP-2: one list of each form of the month names; no private list of the twelve months in src/", () => {
  const cal = lib("ru-calendar.ts");
  for (const name of ["MONTHS_NOMINATIVE", "MONTHS_NOMINATIVE_CAP", "MONTHS_GENITIVE", "MONTHS_SHORT_DATE", "MONTHS_SHORT_TITLE"]) assert.equal(cal[name].length, 12, name);
  assert.equal(cal.MONTHS_GENITIVE[9], "октября");
  assert.equal(cal.MONTHS_NOMINATIVE_CAP[9], "Октябрь");
  assert.equal(cal.MONTHS_SHORT_DATE[4], "мая");           // «5 мая»
  assert.equal(cal.MONTHS_SHORT_TITLE[4], "май");          // «май 2026»
  for (const f of SRC) {
    if (f === "src/lib/ru-calendar.ts") continue;
    assert.doesNotMatch(read(f), /"февраля"|"Февраль"|"февраль"/, `${f}: a private list of the months`);
  }
  // the screens that print a date say the same thing as before
  assert.equal(lib("attendance-excuses.ts").monthLabelRu("2026-10"), "Октябрь 2026");
  assert.equal(lib("form-fields.ts").longDateLabel("2026-10-22"), "22 октября 2026");
  assert.match(lib("open-lessons.ts").formatLessonDate("2026-05-05"), /5 мая/);
  assert.equal(lib("journal-period.ts").MONTHS_GENITIVE, undefined);
});

// ---- DUP-4: one «ДД.ММ.ГГГГ» and one «ДД.ММ» (lib/business-time.ts); an empty / wrong date is empty, also in the label of Intl -----------

test("DUP-4: formatDateRu / formatDayMonthRu / formatIsoDateLabel: good dates as before, empty for an empty or wrong one (no RangeError)", () => {
  assert.equal(time.formatDateRu("2026-10-04"), "04.10.2026");
  assert.equal(time.formatDateRu("2026-10-04T23:30:00+00:00"), "04.10.2026");
  assert.equal(time.formatDayMonthRu("2026-10-04"), "04.10");
  for (const bad of ["", null, undefined, "nope", "2026-13-01", "2026-00-10", "2026-02-31", "04.10.2026"]) {
    assert.equal(time.formatDateRu(bad), "", String(bad));
    assert.equal(time.formatDayMonthRu(bad), "", String(bad));
    assert.equal(time.formatIsoDateLabel(bad, { day: "numeric", month: "long" }), "", String(bad));      // used to throw RangeError
  }
  assert.equal(time.formatIsoDateLabel("2026-10-22", { day: "numeric", month: "long" }), "22 октября");
  assert.equal(lib("diagnostic-report.ts").formatReportDate("2026-10-04"), "04.10.2026");
  assert.equal(lib("diagnostic-report.ts").formatReportDate("2026-13-01"), null);
  assert.equal(lib("payroll.ts").formatDayMonth, undefined);
});

test("DUP-4: no private «ДД.ММ» builder from slices of an ISO date is left in src/", () => {
  const slices = /slice\(8, ?10\)\}\.\$\{[\w.]*slice\(5, ?7\)|\$\{m(?:atch)?\[3\]\}\.\$\{m(?:atch)?\[2\]\}|\$\{m(?:atch)?\[2\]\}\.\$\{m(?:atch)?\[1\]\}/;
  for (const f of SRC) {
    if (f === "src/lib/business-time.ts") continue;
    assert.doesNotMatch(read(f), slices, `${f}: a private date formatter`);
  }
});

// ---- DUP-7: the gate of the polling counters (excuse / substitution badges) is one function -------------------------------------------------

test("DUP-7: createPollingGate - one request at a time, a call within the gap is skipped, a forced call queues ONE more, reset drops old answers, failure is swallowed", async () => {
  const { createPollingGate } = lib("polling-gate.ts");
  let clock = 10_000;
  const gate = createPollingGate(1000, () => clock);
  const calls = [];
  const resolvers = [];
  const load = (tag) => (isCurrent) => { calls.push(tag); return new Promise((resolve) => resolvers.push(() => resolve(isCurrent())) ); };
  const first = gate.run(false, load("a"));
  assert.deepEqual(calls, ["a"]);                                   // started synchronously
  const second = gate.run(false, load("b"));                         // in flight: shares it
  assert.equal(second, first);
  const forced1 = gate.run(true, load("c"));
  const forced2 = gate.run(true, load("d"));                         // the forced callers share ONE queued request
  assert.equal(forced1, forced2);
  resolvers[0]();
  await first;
  await Promise.resolve();
  assert.deepEqual(calls, ["a", "c"]);                               // the queued one started after the first finished
  resolvers[1]();
  await forced1;
  clock += 500;
  await gate.run(false, load("e"));                                  // within a second of the last start: skipped
  assert.deepEqual(calls, ["a", "c"]);
  clock += 1000;
  const third = gate.run(false, (isCurrent) => { calls.push("f"); return new Promise((resolve) => setTimeout(() => { seen3 = isCurrent(); resolve(); }, 5)); });
  let seen3 = null;
  assert.deepEqual(calls, ["a", "c", "f"]);
  gate.reset();                                                       // another person signed in: the answer of "f" is no longer current
  let seen = null;
  const last = gate.run(true, (isCurrent) => { calls.push("g"); return Promise.resolve().then(() => { seen = isCurrent(); }); });
  await last;
  assert.equal(seen, true);
  await third;
  assert.equal(seen3, false);
  const failing = gate.run(true, () => Promise.reject(new Error("offline")));
  await failing;                                                      // never throws
  const stale = [];
  const g2 = createPollingGate(0, () => clock);
  const p = g2.run(true, (isCurrent) => new Promise((resolve) => setTimeout(() => { stale.push(isCurrent()); resolve(); }, 5)));
  g2.reset();
  await p;
  assert.deepEqual(stale, [false]);
});

test("DUP-7: the two badges use the gate; no private inFlight / queued / epoch in them", () => {
  for (const f of ["src/lib/excuse-badge.ts", "src/lib/substitution-badge.ts"]) {
    const source = read(f);
    assert.match(source, /createPollingGate\(\)/, f);
    assert.doesNotMatch(source, /let inFlight|let queued|let epoch|MIN_GAP_MS/, f);
  }
});

test("DUP-7: mutation - without the gap the second call within a second is NOT skipped (the guard of the gate is real)", async () => {
  const broken = loadMutated("src/lib/polling-gate.ts", "if (!force && now() - lastStartedAt < minGapMs) return Promise.resolve();", "");
  let clock = 5000;
  const gate = broken.createPollingGate(1000, () => clock);
  let calls = 0;
  await gate.run(false, () => { calls += 1; return Promise.resolve(); });
  await gate.run(false, () => { calls += 1; return Promise.resolve(); });
  assert.equal(calls, 2);
  const real = lib("polling-gate.ts").createPollingGate(1000, () => clock);
  calls = 0;
  await real.run(false, () => { calls += 1; return Promise.resolve(); });
  await real.run(false, () => { calls += 1; return Promise.resolve(); });
  assert.equal(calls, 1);
});


// ---- LESSONS 85: the key lives from the OPENING of the dialog - not from a send, not from a render, not from the text -----------------

/** What is wrong with the life of the key in a dialog (empty = fine): exactly two calls (the ref + the opening effect), the effect depends on `open` only, the send reads the ref. */
function keyLifetimeProblems(source, { ref, sendPattern, effectDeps }) {
  const problems = [];
  const calls = (source.match(/newIdempotencyKey\(\)/g) || []).length;
  if (calls !== 2) problems.push(`${calls} calls of newIdempotencyKey() instead of 2`);
  if (!new RegExp(`${ref}\\.current = newIdempotencyKey\\(\\);`).test(source)) problems.push("the key is not made when the dialog opens");
  if (!sendPattern.test(source)) problems.push("the send does not read the key of the opening");
  if (effectDeps && !effectDeps.test(source)) problems.push("the effect that makes the key does not depend on the opening only");
  return problems;
}

const KEY_DIALOGS = {
  "src/components/payments/pause-dialog.tsx": { ref: "idempotencyKey", sendPattern: /idempotencyKey: idempotencyKey\.current/, effectDeps: /\[open, membershipId\]/ },
  "src/components/support/support-dialog.tsx": { ref: "keyRef", sendPattern: /client_key: keyRef\.current/, effectDeps: /keyRef\.current = newIdempotencyKey\(\);\s*\}, \[open\]\);/ },
  "src/components/payments/payment-dialog.tsx": { ref: "idempotencyKey", sendPattern: /idempotencyKey\.current/, effectDeps: null },
  "src/components/payroll/payout-dialog.tsx": { ref: "idempotencyKey", sendPattern: /idempotencyKey\.current/, effectDeps: null },
};

test("LESSONS 85: pause, support, payment and payout dialogs keep ONE key from the opening of the dialog", () => {
  for (const [file, rule] of Object.entries(KEY_DIALOGS)) assert.deepEqual(keyLifetimeProblems(read(file), rule), [], file);
});

test("LESSONS 85: mutation - a new key on every send / on every typing is caught in pause and support", () => {
  const pause = read("src/components/payments/pause-dialog.tsx");
  const everySend = pause.replace("idempotencyKey: idempotencyKey.current", "idempotencyKey: newIdempotencyKey()");
  assert.ok(keyLifetimeProblems(everySend, KEY_DIALOGS["src/components/payments/pause-dialog.tsx"]).length > 0);
  const support = read("src/components/support/support-dialog.tsx");
  const everySupportSend = support.replace("client_key: keyRef.current", "client_key: newIdempotencyKey()");
  assert.ok(keyLifetimeProblems(everySupportSend, KEY_DIALOGS["src/components/support/support-dialog.tsx"]).length > 0);
  const followsText = support.replace("}, [open]);", "}, [open, text]);");
  assert.ok(keyLifetimeProblems(followsText, KEY_DIALOGS["src/components/support/support-dialog.tsx"]).length > 0);
  const noOpening = pause.replace("idempotencyKey.current = newIdempotencyKey();", "");
  assert.ok(keyLifetimeProblems(noOpening, KEY_DIALOGS["src/components/payments/pause-dialog.tsx"]).length > 0);
});

// ---- teacher's exams: the colour of `draft` is the registry's, the tab with draft + variants_ready is «В подготовке» ------------------

test("exams of the teacher: the tab / counter holding draft AND variants_ready is «В подготовке»; draft is grey like the registry", () => {
  assert.equal(registry.DRAFT_TAB_LABEL, "В подготовке");
  assert.equal(registry.examStatusView("draft").tone, "neutral");
  const list = read("src/app/teacher/exams/page.tsx");
  const group = read("src/components/groups/group-exams-tab.tsx");
  assert.equal((list.match(/DRAFT_TAB_LABEL/g) || []).length >= 3, true);                  // import + counter + tab
  assert.match(group, /label: DRAFT_TAB_LABEL/);
  for (const [name, source] of [["list", list], ["group", group]]) assert.doesNotMatch(source, /"Черновики"/, name);
  // draft is grey in the list (no amber on `draft`), and the group tab takes the tone from the registry for BOTH statuses
  assert.match(list, /draft: \{[^}]*bg-slate-50[^}]*text-slate-600/s);
  assert.match(group, /ex\.status === "variants_ready" \|\| ex\.status === "draft"\s*\?\s*`border \$\{CHIP_TONE_CLASS\[examStatusView\(ex\.status\)\.tone\]\}`/);
  // mutation: the old amber `draft` / the old tab name are seen by the same checks
  assert.doesNotMatch(list.replace(/(draft: \{[^}]*?)bg-slate-50/s, "$1bg-amber-50"), /draft: \{[^}]*bg-slate-50[^}]*text-slate-600/s);
  assert.doesNotMatch(list.replace(/DRAFT_TAB_LABEL/g, '"Черновики"'), /DRAFT_TAB_LABEL/);
  assert.match(list.replace(/DRAFT_TAB_LABEL/g, '"Черновики"'), /"Черновики"/);
});
