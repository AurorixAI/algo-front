// The time the e2e stand clock is put to: the nearest 10:00 ahead (Tashkent, UTC+5) on a day of the safe range 11..28 of a month; outside it - 10:00 of the nearest day of the range ahead.
// 28th: the billing day of a centre is 1..28.  11th: the money tests charge «from ten days ago» and need the 5-day term of the running month over (e2e/scripts/stand-time.mjs).
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const at = (iso) => Date.parse(`${iso}+05:00`);   // a moment given in the Tashkent wall time

test("the target time of the stand: the nearest 10:00 ahead inside 11..28, else the nearest day of the range", async () => {
  const { standTargetTime } = await import("../e2e/scripts/stand-time.mjs");
  const cases = [
    // the last safe day
    ["2026-11-28T09:59:00", "2026-11-28T10:00", "the 28th before 10:00: the 28th"],
    ["2026-11-28T10:00:00", "2026-12-11T10:00", "the 28th at 10:00 (not ahead any more): the 29th is not allowed - the 11th of the next month"],
    ["2026-11-28T15:30:00", "2026-12-11T10:00", "the 28th after 10:00: the 11th of the next month"],
    ["2026-11-27T10:00:00", "2026-11-28T10:00", "the 27th at 10:00: the 28th is the last safe day"],
    ["2026-10-27T23:59:00", "2026-10-28T10:00", "27th evening: the 28th"],
    // 29th-31st
    ["2026-11-29T08:00:00", "2026-12-11T10:00", "the 29th before 10:00: not allowed - the 11th of the next month"],
    ["2026-10-31T23:59:00", "2026-11-11T10:00", "the 31st late: the 11th of the next month"],
    // the first safe day
    ["2026-11-10T09:00:00", "2026-11-11T10:00", "the 10th before 10:00: the 10th is below the range - the 11th"],
    ["2026-11-10T10:00:00", "2026-11-11T10:00", "the 10th at 10:00: the 11th is the next 10:00 and the first safe day"],
    ["2026-11-11T09:59:00", "2026-11-11T10:00", "the 11th before 10:00: the 11th"],
    ["2026-11-11T10:00:00", "2026-11-12T10:00", "the 11th at 10:00: tomorrow"],
    ["2026-11-01T00:00:00", "2026-11-11T10:00", "the 1st at midnight: the 1st is below the range - the 11th of the same month"],
    ["2026-11-05T12:00:00", "2026-11-11T10:00", "the 5th: the 11th of the same month"],
    // ordinary days
    ["2026-11-14T11:00:00", "2026-11-15T10:00", "an ordinary day after 10:00: tomorrow"],
    ["2026-11-14T08:00:00", "2026-11-14T10:00", "an ordinary day before 10:00: today"],
    // the end of a year
    ["2026-12-31T12:00:00", "2027-01-11T10:00", "31.12: 11.01"],
    ["2026-12-30T03:00:00", "2027-01-11T10:00", "30.12 early: 11.01"],
    ["2026-12-28T10:30:00", "2027-01-11T10:00", "28.12 after 10:00: 11.01 (the longest way: 14 days)"],
    // February
    ["2027-02-27T11:00:00", "2027-02-28T10:00", "27.02 of a common year after 10:00: the 28th"],
    ["2027-02-28T11:00:00", "2027-03-11T10:00", "28.02 of a common year after 10:00: 11.03"],
    ["2028-02-28T11:00:00", "2028-03-11T10:00", "28.02 of a leap year after 10:00: the 29th is not allowed - 11.03"],
    ["2028-02-29T09:00:00", "2028-03-11T10:00", "29.02 of a leap year: 11.03"],
  ];
  for (const [now, expected, why] of cases) assert.equal(standTargetTime(at(now)), expected, why);
  // the day of Tashkent, not of UTC: 20:00Z on the 28th is already 01:00 of the 29th there
  assert.equal(standTargetTime(Date.parse("2026-11-28T20:00:00Z")), "2026-12-11T10:00");
});

test("the stand time, every half hour of two years: ahead, on a day 11..28, within the way the reuse check allows", async () => {
  const { standTargetTime, STAND_MAX_AHEAD_SECONDS, FIRST_STAND_DAY, LAST_STAND_DAY } = await import("../e2e/scripts/stand-time.mjs");
  assert.deepEqual([FIRST_STAND_DAY, LAST_STAND_DAY], [11, 28]);
  let longest = 0;
  for (let ms = Date.parse("2026-01-01T00:00:00Z"); ms < Date.parse("2028-01-01T00:00:00Z"); ms += 30 * 60_000) {
    const target = standTargetTime(ms);
    assert.match(target, /^\d{4}-\d{2}-(1[1-9]|2[0-8])T10:00$/, `${new Date(ms).toISOString()}: the day is outside 11..28 (${target})`);
    const ahead = (at(target) - ms) / 1000;
    assert.ok(ahead > 0, `${new Date(ms).toISOString()}: ${target} is not ahead`);
    longest = Math.max(longest, ahead);
  }
  assert.ok(longest <= STAND_MAX_AHEAD_SECONDS, `the longest way ${longest / 86400} days is above the limit of the reuse check`);
  assert.ok(longest > 13.9 * 86400, "the longest way (a 31-day month, from the 28th after 10:00) is 14 days: the limit is not loose by accident");
});

test("the guard of the money tests (support/time.ts) knows the same last day and the tests name their first day", () => {
  const time = readFileSync(`${__dirname}/../e2e/support/time.ts`, "utf8");
  assert.match(time, /if \(day > 28\) throw/, "the last day of the guard is 28");
  assert.match(time, /if \(day < fromDay\) throw/, "the guard fails below the first day of the test");
  const first = { "batch-2510-payf": 2, "owner-group-payments": 6, "owner-paths": 6, "owner-partial-payment": 11 };
  for (const [spec, day] of Object.entries(first)) {
    const text = readFileSync(`${__dirname}/../e2e/tests/${spec}.spec.ts`, "utf8");
    const m = text.match(/requireBillingDayStand\((\d+), "/);
    assert.ok(m, `${spec}: the test does not name its first day`);
    assert.equal(Number(m[1]), day, spec);
    assert.ok(day <= 11, `${spec}: the first day of a test is above the first day of the stand (11)`);
  }
});
