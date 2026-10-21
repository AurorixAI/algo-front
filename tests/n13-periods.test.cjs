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

test("a returning student belonged during every stay (day rule, no start time): September in, October out, November in", () => {
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

test("the card prints every stay on the business calendar: «01.09.2026 — 30.09.2026, с 01.11.2026»", () => {
  assert.equal(P.formatMembershipPeriods(returned.periods), "01.09.2026 — 30.09.2026, с 01.11.2026");
  assert.equal(P.formatMembershipPeriods([NOV]), "с 01.11.2026");
  assert.equal(P.formatMembershipPeriods([SEP]), "01.09.2026 — 30.09.2026");
  // 19:00 UTC is already the next day in Tashkent
  assert.equal(P.formatMembershipPeriods([{ joined_at: "2026-09-30T19:00:00", left_at: null }]), "с 01.10.2026");
  assert.equal(P.formatMembershipPeriods([]), "");
  assert.equal(P.formatMembershipPeriods(null), "");
  // A leave and a return on the same business day is no break: touching stays read as one.
  assert.equal(P.formatMembershipPeriods([
    { joined_at: "2026-10-15T05:00:00", left_at: "2026-10-16T06:00:00" },
    { joined_at: "2026-10-16T06:00:00", left_at: "2026-10-17T07:00:00" },
    { joined_at: "2026-10-17T07:30:00", left_at: null },
  ]), "с 15.10.2026");
  assert.equal(P.formatMembershipPeriods([
    { joined_at: "2026-10-15T05:00:00", left_at: "2026-10-16T06:00:00" },
    { joined_at: "2026-10-20T06:00:00", left_at: null },
  ]), "15.10.2026 — 16.10.2026, с 20.10.2026");
});

test("wiring: the journal asks the helper, the card lists the stays, the API types carry periods", () => {
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /return wasMemberOn\(student, lesson\.date, lesson\.startTime \|\| lesson\.start_time\);/);
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

// ---- the exact rule: the server decides with instants at the lesson start (membership_covers_instant) -------------

const T = require(path.join(root, "src/lib/business-time.ts"));

test("a lesson start is its Tashkent date + wall time as an instant (UTC+5), whatever the device zone is", () => {
  assert.equal(T.businessWallTimeToInstant("2026-09-30", "10:00").toISOString(), "2026-09-30T05:00:00.000Z");
  assert.equal(T.businessWallTimeToInstant("2026-09-30", "19:00").toISOString(), "2026-09-30T14:00:00.000Z");
  assert.equal(T.businessWallTimeToInstant("2026-09-30", "10:00:00").toISOString(), "2026-09-30T05:00:00.000Z");
  assert.equal(T.businessWallTimeToInstant("2026-09-30", "9:05").toISOString(), "2026-09-30T04:05:00.000Z");
  // before 05:00 local the UTC day is the day before
  assert.equal(T.businessWallTimeToInstant("2026-10-01", "00:30").toISOString(), "2026-09-30T19:30:00.000Z");
  assert.equal(T.businessWallTimeToInstant("2026-12-31", "23:59").toISOString(), "2026-12-31T18:59:00.000Z");
  for (const [date, time] of [["2026-02-30", "10:00"], ["2026-13-01", "10:00"], ["bad", "10:00"], ["2026-09-30", "24:00"], ["2026-09-30", "10:60"], ["2026-09-30", ""], ["2026-09-30", null], [null, "10:00"]]) {
    assert.equal(T.businessWallTimeToInstant(date, time), null, `${date} ${time}`);
  }
});

test("left 18:00 Tashkent: his 10:00 lesson that day is IN, a 19:00 lesson is OUT", () => {
  const left = { periods: [{ joined_at: "2026-09-01T05:00:00", left_at: "2026-09-30T13:00:00" }] };
  assert.equal(P.wasMemberOn(left, "2026-09-30", "10:00"), true);
  assert.equal(P.wasMemberOn(left, "2026-09-30", "19:00"), false);
  // exactly at the instant he left he is already out (left_at > instant), a minute before he is in
  assert.equal(P.wasMemberOn(left, "2026-09-30", "18:00"), false);
  assert.equal(P.wasMemberOn(left, "2026-09-30", "17:59"), true);
  assert.equal(P.wasMemberOn(left, "2026-10-01", "10:00"), false);
});

test("joined 11:00 Tashkent: a 10:00 lesson that day is OUT, a 14:00 lesson is IN", () => {
  const joined = { periods: [{ joined_at: "2026-11-01T06:00:00", left_at: null }] };
  assert.equal(P.wasMemberOn(joined, "2026-11-01", "10:00"), false);
  assert.equal(P.wasMemberOn(joined, "2026-11-01", "14:00"), true);
  // exactly at the instant he joined he is in (joined_at <= instant), a minute before he is out
  assert.equal(P.wasMemberOn(joined, "2026-11-01", "11:00"), true);
  assert.equal(P.wasMemberOn(joined, "2026-11-01", "10:59"), false);
  assert.equal(P.wasMemberOn(joined, "2026-10-31", "20:00"), false);
});

test("Sep stay + Nov return at the lesson start: September in, October out, November in", () => {
  const lesson = (date) => P.wasMemberOn(returned, date, "10:00");
  for (const day of ["2026-09-01", "2026-09-15", "2026-09-29"]) assert.equal(lesson(day), true, day);
  // the September stay ended 30.09 20:00 Tashkent: the 10:00 lesson of that day is still his
  assert.equal(lesson("2026-09-30"), true);
  for (const day of ["2026-10-01", "2026-10-15", "2026-10-31"]) assert.equal(lesson(day), false, day);
  // he came back 01.11 10:00 Tashkent (05:00 UTC): a 10:00 lesson is the first one he is in
  for (const day of ["2026-11-01", "2026-11-20"]) assert.equal(lesson(day), true, day);
  assert.equal(P.wasMemberOn(returned, "2026-08-31", "10:00"), false);
});

test("the instant rule is the server's: any period, a missing joined_at counts, the answer does not depend on the device zone", () => {
  const at = (iso) => new Date(iso);
  assert.equal(P.wasMemberAt({ periods: [SEP, NOV] }, at("2026-10-15T05:00:00Z")), false);
  assert.equal(P.wasMemberAt({ periods: [SEP, NOV] }, at("2026-09-15T05:00:00Z")), true);
  assert.equal(P.wasMemberAt({ periods: [SEP, NOV] }, at("2026-11-01T05:00:00Z")), true);
  assert.equal(P.wasMemberAt({ joined_at: null, left_at: "2026-09-30T13:00:00" }, at("2026-09-30T12:59:00Z")), true);
  assert.equal(P.wasMemberAt({}, at("2026-09-30T12:59:00Z")), true);
  // a stamp with microseconds, as Python writes it
  assert.equal(P.wasMemberAt({ left_at: "2026-09-30T13:00:00.500000" }, at("2026-09-30T13:00:00Z")), true);
  assert.equal(P.wasMemberAt({ left_at: "2026-09-30T13:00:00.500000" }, at("2026-09-30T13:00:01Z")), false);
  const probe = `
    const ts = require("typescript"); const fs = require("fs");
    require.extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
    const P = require(${JSON.stringify(path.join(root, "src/lib/membership-periods.ts"))});
    const s = { periods: [{ joined_at: "2026-09-01T05:00:00", left_at: "2026-09-30T13:00:00" }, { joined_at: "2026-11-01T06:00:00", left_at: null }] };
    console.log(JSON.stringify([["2026-09-30","10:00"],["2026-09-30","19:00"],["2026-11-01","10:00"],["2026-11-01","14:00"],["2026-10-10","10:00"],["2026-09-30",null]].map(([d, t]) => P.wasMemberOn(s, d, t))));
  `;
  const { execFileSync } = require("node:child_process");
  const run = (TZ) => execFileSync(process.execPath, ["-e", probe], { env: { ...process.env, TZ }, encoding: "utf8", cwd: root });
  const baseline = run("Asia/Tashkent");
  assert.equal(baseline.trim(), "[true,false,false,true,false,false]");
  for (const zone of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Kolkata"]) assert.equal(run(zone), baseline, zone);
});

test("a lesson with no start time falls back to the business day (the day he left is outside), and says so", () => {
  const left = { periods: [{ joined_at: "2026-09-01T05:00:00", left_at: "2026-09-30T13:00:00" }] };
  assert.equal(P.wasMemberOn(left, "2026-09-30"), false);
  assert.equal(P.wasMemberOn(left, "2026-09-29", null), true);
  assert.equal(P.wasMemberOn(left, "2026-09-30", ""), false);
  assert.equal(P.wasMemberOn(left, "2026-09-30", "not a time"), false);
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /return wasMemberOn\(student, lesson\.date, lesson\.startTime \|\| lesson\.start_time\);/);
  assert.match(read("src/lib/membership-periods.ts"), /only then the rule falls back to\n \* the business DAY/);
});

test("the Tashkent offset constant is what Intl says for the zone, in winter and in summer (a change of the rules is caught)", () => {
  assert.equal(T.BUSINESS_TIME_ZONE, "Asia/Tashkent");
  assert.equal(T.BUSINESS_UTC_OFFSET_MINUTES, 300);
  const intlOffsetMinutes = (zone, iso) => {
    const instant = new Date(iso);
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).formatToParts(instant).map((part) => [part.type, part.value]),
    );
    const wallAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return Math.round((wallAsUtc - instant.getTime()) / 60000);
  };
  // January, July, and the days Europe / the USA move their clocks
  for (const iso of ["2026-01-15T12:00:00Z", "2026-07-15T12:00:00Z", "2026-03-08T12:00:00Z", "2026-03-29T12:00:00Z", "2026-10-25T12:00:00Z", "2026-11-01T12:00:00Z", "2030-12-31T23:59:00Z"]) {
    assert.equal(intlOffsetMinutes(T.BUSINESS_TIME_ZONE, iso), T.BUSINESS_UTC_OFFSET_MINUTES, iso);
  }
  // the lesson start uses it: 10:00 Tashkent is 05:00 UTC in January and in July
  assert.equal(T.businessWallTimeToInstant("2026-01-15", "10:00").toISOString(), "2026-01-15T05:00:00.000Z");
  assert.equal(T.businessWallTimeToInstant("2026-07-15", "10:00").toISOString(), "2026-07-15T05:00:00.000Z");
});

test("375 px: the enrolment-history row wraps - the group name keeps its width, the stays go under it at the right edge", () => {
  const card = read("src/components/students/student-profile-view.tsx");
  assert.match(card, /<div key=\{idx\} className="py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">/);
  assert.match(card, /<div className="min-w-0 break-words">\s*<span className="font-semibold text-slate-800">\{gh\.group_name\}<\/span>/);
  assert.match(card, /<div className="ml-auto min-w-0 max-w-full break-words text-right text-xs text-slate-500">/);
  assert.match(card, /w-2 h-2 shrink-0 rounded-full/);
});
