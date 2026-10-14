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
const rules = require(path.join(__dirname, "../src/lib/attendance-excuses.ts"));

const TODAY = "2026-10-14";

test("lesson column actions follow the lesson state and date", () => {
  const actions = (state, date) => rules.lessonAdminActions(state, date, TODAY);
  // forgotten past lesson that was never started
  assert.deepEqual(actions("scheduled", "2026-10-10"), ["reconcile", "cancel_missed"]);
  // open (in progress), today or forgotten in the past
  assert.deepEqual(actions("in_progress", TODAY), ["finish"]);
  assert.deepEqual(actions("in_progress", "2026-10-12"), ["finish"]);
  // completed lesson can only be corrected
  assert.deepEqual(actions("completed", "2026-10-01"), ["correct"]);
  assert.deepEqual(actions("completed", TODAY), ["correct"]);
  // no button: future, today not started, cancelled, unknown
  assert.deepEqual(actions("scheduled", "2026-10-20"), []);
  assert.deepEqual(actions("in_progress", "2026-10-20"), []);
  assert.deepEqual(actions("scheduled", TODAY), []);
  assert.deepEqual(actions("cancelled", "2026-10-10"), []);
  assert.deepEqual(actions("cancelled", "2026-10-20"), []);
  assert.deepEqual(actions("whatever", "2026-10-10"), []);
});

test("finishing needs every student marked, the hint counts the rest", () => {
  assert.equal(rules.finishBlockedHint(5, 5), null);
  assert.equal(rules.finishBlockedHint(0, 0), null);
  assert.equal(rules.finishBlockedHint(3, 5), "Отметьте всех: осталось 2");
  assert.equal(rules.finishBlockedHint(0, 12), "Отметьте всех: осталось 12");
  assert.equal(rules.finishBlockedHint(7, 5), null);
});

test("reason of an excused absence is 3..300 characters after trimming", () => {
  assert.ok(rules.validateExcuseReason(""));
  assert.ok(rules.validateExcuseReason(null));
  assert.ok(rules.validateExcuseReason("  а  "));
  assert.ok(rules.validateExcuseReason("ab "));
  assert.equal(rules.validateExcuseReason("abc"), null);
  assert.equal(rules.validateExcuseReason("  заболел  "), null);
  assert.equal(rules.validateExcuseReason("x".repeat(300)), null);
  assert.ok(rules.validateExcuseReason("x".repeat(301)));
  // whitespace padding does not count towards the limit
  assert.equal(rules.validateExcuseReason(`  ${"x".repeat(300)}  `), null);
});

test("reason of a correction is 10..500 characters after trimming", () => {
  assert.ok(rules.validateCorrectionReason("коротко"));
  assert.ok(rules.validateCorrectionReason("123456789 "));
  assert.equal(rules.validateCorrectionReason("1234567890"), null);
  assert.equal(rules.validateCorrectionReason("x".repeat(500)), null);
  assert.ok(rules.validateCorrectionReason("x".repeat(501)));
});

test("a student marked 'excused' without a usable reason blocks the save", () => {
  const records = { a: "present", b: "excused", c: "excused" };
  // no reason and no saved excuse
  assert.deepEqual(rules.firstMissingExcuseReason(records, {}, undefined)?.studentId, "b");
  // b typed, c still empty
  assert.deepEqual(rules.firstMissingExcuseReason(records, { b: "болел" }, undefined)?.studentId, "c");
  // c already has a saved reason on the server
  assert.equal(rules.firstMissingExcuseReason(records, { b: "болел" }, { c: { reason: "семейные" } }), null);
  // too short typed reason falls back to the saved one only when empty
  assert.equal(rules.firstMissingExcuseReason({ b: "excused" }, { b: "ab" }, undefined)?.studentId, "b");
  // non-excused marks never need a reason
  assert.equal(rules.firstMissingExcuseReason({ a: "absent", b: "late" }, {}, undefined), null);
});

test("only new or changed reasons are sent with the save", () => {
  const records = { a: "excused", b: "excused", c: "present", d: "excused" };
  const existing = { a: { reason: "болел" }, b: { reason: "семейные" } };
  const sent = rules.collectExcuseReasons(
    records,
    { a: "болел", b: "уехал к врачу", d: "  сломал руку " },
    existing,
  );
  // a unchanged -> not sent; b edited -> sent; c not excused; d new -> trimmed
  assert.deepEqual(sent, { b: "уехал к врачу", d: "сломал руку" });
  assert.deepEqual(rules.collectExcuseReasons({ a: "excused" }, {}, existing), {});
});

test("correction diff lists exactly the changed marks", () => {
  const before = { a: "present", b: "absent", c: "late" };
  const after = { a: "present", b: "excused", c: "late", d: "present" };
  const diff = rules.diffAttendance(before, after);
  assert.deepEqual(
    diff.sort((x, y) => x.studentId.localeCompare(y.studentId)),
    [
      { studentId: "b", from: "absent", to: "excused" },
      { studentId: "d", from: "", to: "present" },
    ],
  );
  assert.deepEqual(rules.diffAttendance(before, { ...before }), []);
});

test("photo size is reduced to 1600 px on the longer side, never enlarged", () => {
  assert.deepEqual(rules.fitWithin(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(rules.fitWithin(3000, 4000), { width: 1200, height: 1600 });
  assert.deepEqual(rules.fitWithin(1600, 900), { width: 1600, height: 900 });
  assert.deepEqual(rules.fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(rules.fitWithin(12000, 100), { width: 1600, height: 13 });
  assert.deepEqual(rules.fitWithin(10000, 1), { width: 1600, height: 1 });
  assert.deepEqual(rules.fitWithin(0, 100), { width: 0, height: 0 });
  const big = rules.fitWithin(4032, 3024);
  assert.ok(Math.max(big.width, big.height) <= 1600);
  // the aspect ratio survives the rounding within one pixel
  assert.ok(Math.abs(big.width / big.height - 4032 / 3024) < 0.01);
});

test("certificate files: type, size and the three-file limit", () => {
  const png = { name: "a.png", type: "image/png", size: 5_000_000 };
  const pdf = (size) => ({ name: "s.pdf", type: "application/pdf", size });
  // photos are shrunk before upload, so their raw size is not a reason to refuse
  assert.deepEqual(rules.checkExcuseFile(png, 0), { ok: true, kind: "image" });
  assert.deepEqual(rules.checkExcuseFile(pdf(2 * 1024 * 1024), 0), { ok: true, kind: "pdf" });
  assert.equal(rules.checkExcuseFile(pdf(2 * 1024 * 1024 + 1), 0).ok, false);
  assert.equal(rules.checkExcuseFile({ name: "x.docx", type: "application/msword", size: 100 }, 0).ok, false);
  assert.equal(rules.checkExcuseFile({ name: "x.exe", type: "", size: 100 }, 0).ok, false);
  // a camera file with an empty MIME type is judged by its extension
  assert.equal(rules.checkExcuseFile({ name: "IMG_1.JPG", type: "", size: 100 }, 0).kind, "image");
  assert.equal(rules.checkExcuseFile(png, 2).ok, true);
  assert.equal(rules.checkExcuseFile(png, 3).ok, false);
});

test("dates are shown as ДД.ММ.ГГГГ and times on the Tashkent clock", () => {
  assert.equal(rules.formatDateRu("2026-10-14"), "14.10.2026");
  assert.equal(rules.formatDateRu("2026-01-05T10:00:00"), "05.01.2026");
  assert.equal(rules.formatDateRu(null), "");
  // a value with an explicit zone is converted: 19:30 UTC is 00:30 next day in Tashkent (UTC+5)
  assert.equal(rules.formatDateTimeRu("2026-10-13T19:30:00Z"), "14.10.2026 00:30");
  // the server sends naive timestamps that are already Tashkent time: no shift
  assert.equal(rules.formatDateTimeRu("2026-10-13T19:30:00"), "13.10.2026 19:30");
  assert.equal(rules.formatDateTimeRu("2026-10-14T00:05:12.123456"), "14.10.2026 00:05");
  assert.equal(rules.formatDateTimeRu(""), "");
});

test("journal cell reflects the review state of an excuse", () => {
  assert.deepEqual(rules.excuseCellView("pending"), { label: "Ув.?", tone: "pending" });
  assert.deepEqual(rules.excuseCellView("confirmed"), { label: "Ув. ✓", tone: "confirmed" });
  assert.deepEqual(rules.excuseCellView("rejected"), { label: "Ув. ✗", tone: "rejected" });
  // legacy mark with no excuse record
  assert.deepEqual(rules.excuseCellView(undefined), { label: "Ув.", tone: "plain" });
});

test("excuse list period: current month by default, at most 93 days", () => {
  assert.deepEqual(rules.monthRangeOf("2026-10-14"), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(rules.monthRangeOf("2026-02-03"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(rules.monthRangeOf("2028-02-29"), { from: "2028-02-01", to: "2028-02-29" });
  assert.equal(rules.validateExcusePeriod("2026-10-01", "2026-10-31"), null);
  assert.equal(rules.validateExcusePeriod("2026-07-01", "2026-10-01"), null); // 93 days
  assert.ok(rules.validateExcusePeriod("2026-07-01", "2026-10-02")); // 94 days
  assert.ok(rules.validateExcusePeriod("2026-10-10", "2026-10-01"));
  assert.ok(rules.validateExcusePeriod("", "2026-10-01"));
});

test("new screens exist and follow the contract (routes, menu, demo guard)", () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  for (const role of ["admin", "owner"]) {
    assert.ok(fs.existsSync(path.join(__dirname, `../src/app/${role}/attendance-excuses/page.tsx`)), role);
  }
  const sidebar = read("src/components/layout/sidebar.tsx");
  assert.match(sidebar, /\/admin\/attendance-excuses/);
  assert.match(sidebar, /\/owner\/attendance-excuses/);
  assert.match(sidebar, /showExcuses = !DEMO_MODE/);
  assert.match(sidebar, /badge\?: number/);
  // the teacher menu never gets the item
  const teacherNav = sidebar.slice(sidebar.indexOf("const teacherNav"), sidebar.indexOf("const navItems"));
  assert.doesNotMatch(teacherNav, /attendance-excuses/);
  // the badge store does not request anything in demo mode
  assert.match(read("src/lib/excuse-badge.ts"), /if \(DEMO_MODE\) return Promise\.resolve\(\)/);
  // the admin journal is editable and in admin mode on both group cards
  for (const role of ["admin", "owner"]) {
    const page = read(`src/app/${role}/groups/[id]/page.tsx`);
    assert.match(page, /canEdit\s+adminMode/, role);
    assert.match(page, /AddStudentDrawer/, role);
  }
});
