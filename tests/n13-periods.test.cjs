// ROADMAP #59: a student who returns to a group keeps every stay (periods[]); the journal and the card read all of them.
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
const P = require(path.join(root, "src/lib/membership-periods.ts"));

// Sep stay (1 Sep - 30 Sep 20:00 Tashkent = 15:00 UTC) and the return on 1 Nov (naive UTC, as the server sends them)
const SEP = { joined_at: "2026-09-01T05:00:00", left_at: "2026-09-30T15:00:00" };
const NOV = { joined_at: "2026-11-01T05:00:00", left_at: null };
const returned = { joined_at: NOV.joined_at, periods: [SEP, NOV] };

test("a returning student belonged during every stay: September in, October out, November in", () => {
  for (const day of ["2026-09-01", "2026-09-15", "2026-09-29"]) assert.equal(P.wasMemberOn(returned, day), true, day);
  for (const day of ["2026-10-01", "2026-10-15", "2026-10-31"]) assert.equal(P.wasMemberOn(returned, day), false, day);
  for (const day of ["2026-11-01", "2026-11-20", "2027-01-05"]) assert.equal(P.wasMemberOn(returned, day), true, day);
  // before the first stay he was not there yet
  assert.equal(P.wasMemberOn(returned, "2026-08-31"), false);
});

test("the old code looked at the last joined_at only: it shaded September for a student who came back", () => {
  // joined_at alone is the November return: September and October are both "not in the group yet"
  assert.equal(P.wasMemberOn({ joined_at: NOV.joined_at }, "2026-09-15"), false);
  assert.equal(P.wasMemberOn({ joined_at: NOV.joined_at }, "2026-11-01"), true);
});

test("the boundaries are business days (Tashkent), not UTC days; the day he left is already outside", () => {
  // 2026-09-30T19:30:00 UTC is 01.10 00:30 in Tashkent: the stay still covers 30 Sep and ends on 1 Oct
  const late = { periods: [{ joined_at: "2026-09-01T05:00:00", left_at: "2026-09-30T19:30:00" }] };
  assert.equal(P.wasMemberOn(late, "2026-09-30"), true);
  assert.equal(P.wasMemberOn(late, "2026-10-01"), false);
  // joined at 2026-08-31T20:00:00 UTC = 01.09 01:00 Tashkent: the 31st of August is before the stay
  const early = { periods: [{ joined_at: "2026-08-31T20:00:00", left_at: null }] };
  assert.equal(P.wasMemberOn(early, "2026-08-31"), false);
  assert.equal(P.wasMemberOn(early, "2026-09-01"), true);
  // the day of leaving: left 30.09 10:00 Tashkent (05:00 UTC) - the lesson of that date is outside, the day before is inside
  const left = { periods: [{ joined_at: "2026-09-01T05:00:00", left_at: "2026-09-30T05:00:00" }] };
  assert.equal(P.wasMemberOn(left, "2026-09-29"), true);
  assert.equal(P.wasMemberOn(left, "2026-09-30"), false);
});

test("without periods the old joined_at / left_at decide; with nothing known no lesson is shaded", () => {
  assert.equal(P.wasMemberOn({ joined_at: "2026-09-10T05:00:00" }, "2026-09-09"), false);
  assert.equal(P.wasMemberOn({ joined_at: "2026-09-10T05:00:00" }, "2026-09-10"), true);
  assert.equal(P.wasMemberOn({ joined_at: "2026-09-10T05:00:00", periods: [] }, "2026-09-09"), false);
  assert.equal(P.wasMemberOn({ joined_at: "2026-09-10T05:00:00", periods: null }, "2026-09-11"), true);
  assert.equal(P.wasMemberOn({ joined_at: "2026-09-01T05:00:00", left_at: "2026-09-20T05:00:00" }, "2026-09-25"), false);
  for (const nothing of [{}, { joined_at: null }, null, undefined]) assert.equal(P.wasMemberOn(nothing, "2026-09-15"), true);
  // an unreadable stamp is not a reason to shade a lesson
  assert.equal(P.wasMemberOn({ joined_at: "garbage" }, "2026-09-15"), true);
});

test("periods are listed oldest first as the server sent them; an older server gives its single stay", () => {
  assert.deepEqual(P.membershipPeriods(returned), [SEP, NOV]);
  assert.deepEqual(P.membershipPeriods({ joined_at: "2026-09-01T05:00:00" }), [{ joined_at: "2026-09-01T05:00:00", left_at: null }]);
  assert.deepEqual(P.membershipPeriods({}), []);
  assert.deepEqual(P.membershipPeriods(null), []);
});

test("the card prints every stay on the business calendar: «01.09.2026 – 30.09.2026, с 01.11.2026»", () => {
  assert.equal(P.formatMembershipPeriods(returned.periods), "01.09.2026 – 30.09.2026, с 01.11.2026");
  assert.equal(P.formatMembershipPeriods([NOV]), "с 01.11.2026");
  assert.equal(P.formatMembershipPeriods([SEP]), "01.09.2026 – 30.09.2026");
  // 19:00 UTC is already the next day in Tashkent
  assert.equal(P.formatMembershipPeriods([{ joined_at: "2026-09-30T19:00:00", left_at: null }]), "с 01.10.2026");
  assert.equal(P.formatMembershipPeriods([]), "");
  assert.equal(P.formatMembershipPeriods(null), "");
});

test("wiring: the journal asks the helper, the card lists the stays, the API types carry periods", () => {
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /return wasMemberOn\(student, lesson\.date\);/);
  assert.doesNotMatch(journal, /student\.joined_at\.slice\(0, 10\)/);
  // a frozen roster still wins over the dates, a historical student is judged by his marks
  assert.match(journal, /if \(frozenRoster\) return frozenRoster\.includes\(student\.id\);/);
  const card = read("src/components/students/student-profile-view.tsx");
  assert.match(card, /formatMembershipPeriods\(gh\.periods\)/);
  const groups = read("src/components/students/student-groups-block.tsx");
  assert.match(groups, /formatMembershipPeriods\(item\.periods\)/);
  const api = read("src/lib/api.ts");
  assert.equal((api.match(/periods\?: MembershipPeriodDto\[\] \| null;/g) || []).length, 4, "students[], historicalStudents[], groups[], group_history[]");
});
