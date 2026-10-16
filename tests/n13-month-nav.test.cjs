/**
 * Month switchers are pure "YYYY-MM" arithmetic. `Date.setMonth(getMonth() + 1)` from the 31st skips a short
 * month (31 Jan + 1 month = 3 Mar), which the attendance journal did.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const lib = (name) => require(path.join(__dirname, `../src/lib/${name}.ts`));
const time = lib("business-time");
const journal = lib("journal-period");
const payroll = lib("payroll");
const excuses = lib("attendance-excuses");

test("shiftBusinessMonth: year rollover both ways, leap/short months do not matter, junk is unchanged", () => {
  assert.equal(time.shiftBusinessMonth("2026-12", 1), "2027-01");
  assert.equal(time.shiftBusinessMonth("2027-01", -1), "2026-12");
  assert.equal(time.shiftBusinessMonth("2026-01", -1), "2025-12");
  assert.equal(time.shiftBusinessMonth("2026-10", 0), "2026-10");
  assert.equal(time.shiftBusinessMonth("2026-10", 14), "2027-12");
  assert.equal(time.shiftBusinessMonth("2026-10", -22), "2024-12");
  assert.equal(time.shiftBusinessMonth("2026-13", 1), "2026-13");
  assert.equal(time.shiftBusinessMonth("nope", 1), "nope");
});

test("payroll, excuses and student-card switchers share the one implementation", () => {
  for (const [month, delta] of [["2026-12", 1], ["2026-01", -1], ["2026-03", 1], ["2028-02", 1], ["2026-10", -13]]) {
    assert.equal(payroll.shiftMonth(month, delta), time.shiftBusinessMonth(month, delta));
    assert.equal(excuses.shiftMonth(month, delta), time.shiftBusinessMonth(month, delta));
  }
  assert.equal(payroll.shiftMonth("2026-12", 1), "2027-01");
  assert.equal(excuses.shiftMonth("2026-12", 1), "2027-01");
  assert.equal(payroll.canGoToNextMonth("2026-09", "2026-10-16"), true);
  assert.equal(payroll.canGoToNextMonth("2026-10", "2026-10-16"), false);
});

test("journal: next month from the 31st never skips a month (Jan 31 -> Feb, Mar 31 -> Apr, Dec -> Jan)", () => {
  const next = (anchor) => journal.moveJournalAnchor(anchor, "month", 1);
  const prev = (anchor) => journal.moveJournalAnchor(anchor, "month", -1);
  assert.equal(next("2026-01-31"), "2026-02-01");
  assert.equal(next("2026-03-31"), "2026-04-01");
  assert.equal(next("2026-05-31"), "2026-06-01");
  assert.equal(next("2026-10-31"), "2026-11-01");
  assert.equal(next("2026-12-15"), "2027-01-01");
  assert.equal(prev("2027-01-31"), "2026-12-01");
  assert.equal(prev("2026-03-31"), "2026-02-01");
  assert.equal(prev("2026-12-31"), "2026-11-01");
  assert.equal(journal.journalPeriod(next("2026-01-31"), "month").label, "февраля 2026");
  assert.equal(journal.journalPeriod(next("2026-03-31"), "month").label, "апреля 2026");
  assert.equal(journal.journalPeriod(next("2026-12-15"), "month").label, "января 2027");
});

test("journal: stepping month by month from any day visits every month exactly once", () => {
  for (const start of ["2026-01-31", "2026-03-31", "2026-08-31", "2026-10-30", "2028-01-29"]) {
    let anchor = start;
    const seen = [];
    for (let i = 0; i < 25; i += 1) {
      anchor = journal.moveJournalAnchor(anchor, "month", 1);
      seen.push(anchor.slice(0, 7));
    }
    assert.equal(new Set(seen).size, 25, start);
    assert.equal(seen[0], time.shiftBusinessMonth(start.slice(0, 7), 1), start);
    assert.equal(seen[24], time.shiftBusinessMonth(start.slice(0, 7), 25), start);
    for (let i = 0; i < 25; i += 1) anchor = journal.moveJournalAnchor(anchor, "month", -1);
    assert.equal(anchor.slice(0, 7), start.slice(0, 7), `back to the start month from ${start}`);
  }
});

test("journal month period: first and last day, leap February, label", () => {
  assert.deepEqual(journal.journalPeriod("2026-10-16", "month"), { start: "2026-10-01", end: "2026-10-31", label: "октября 2026" });
  assert.deepEqual(journal.journalPeriod("2026-02-01", "month"), { start: "2026-02-01", end: "2026-02-28", label: "февраля 2026" });
  assert.deepEqual(journal.journalPeriod("2028-02-10", "month"), { start: "2028-02-01", end: "2028-02-29", label: "февраля 2028" });
  assert.deepEqual(journal.journalPeriod("2026-12-31", "month"), { start: "2026-12-01", end: "2026-12-31", label: "декабря 2026" });
  assert.deepEqual(journal.journalPeriod("2026-04-30", "month"), { start: "2026-04-01", end: "2026-04-30", label: "апреля 2026" });
});

test("journal week period: Monday to Sunday, labels as before, across a month and a year", () => {
  // 16.10.2026 is a Friday
  assert.deepEqual(journal.journalPeriod("2026-10-16", "week"), { start: "2026-10-12", end: "2026-10-18", label: "12 — 18 октября 2026" });
  // Sunday belongs to the week that ends on it
  assert.deepEqual(journal.journalPeriod("2026-10-18", "week"), { start: "2026-10-12", end: "2026-10-18", label: "12 — 18 октября 2026" });
  assert.deepEqual(journal.journalPeriod("2026-10-19", "week"), { start: "2026-10-19", end: "2026-10-25", label: "19 — 25 октября 2026" });
  assert.deepEqual(journal.journalPeriod("2026-10-31", "week"), { start: "2026-10-26", end: "2026-11-01", label: "26 октября — 1 ноября 2026" });
  assert.deepEqual(journal.journalPeriod("2026-12-31", "week"), { start: "2026-12-28", end: "2027-01-03", label: "28 декабря — 3 января 2027" });
});

test("journal week step is exactly 7 days, across month and year boundaries", () => {
  assert.equal(journal.moveJournalAnchor("2026-10-28", "week", 1), "2026-11-04");
  assert.equal(journal.moveJournalAnchor("2026-12-30", "week", 1), "2027-01-06");
  assert.equal(journal.moveJournalAnchor("2027-01-02", "week", -1), "2026-12-26");
  assert.equal(journal.moveJournalAnchor("2026-03-01", "week", -1), "2026-02-22");
  assert.equal(journal.journalMonthAnchor(2026, 2), "2026-02-01");
  assert.equal(journal.journalMonthAnchor(2027, 12), "2027-12-01");
});

test("journal column header: day, month, weekday of a lesson date", () => {
  assert.deepEqual(journal.journalColumnDate("2026-10-16"), { day: "16", monthShort: "окт", weekday: "Пт" });
  assert.deepEqual(journal.journalColumnDate("2026-10-18"), { day: "18", monthShort: "окт", weekday: "Вс" });
  assert.deepEqual(journal.journalColumnDate("2026-10-19"), { day: "19", monthShort: "окт", weekday: "Пн" });
  assert.deepEqual(journal.journalColumnDate("2026-03-05"), { day: "5", monthShort: "мар", weekday: "Чт" });
  assert.deepEqual(journal.journalColumnDate("nope"), { day: "", monthShort: "", weekday: "" });
});

test("no month switcher in the app uses Date.setMonth / setFullYear", () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
  const offenders = walk(path.join(__dirname, "../src")).filter((file) => /\.(?:setMonth|setFullYear)\s*\(/.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
  const journalSource = fs.readFileSync(path.join(__dirname, "../src/components/groups/group-attendance-journal.tsx"), "utf8");
  assert.ok(journalSource.includes("moveJournalAnchor(current, viewMode, direction)"));
  assert.equal(/new Date\(/.test(journalSource), false, "the journal does its calendar arithmetic on ISO strings");
});
