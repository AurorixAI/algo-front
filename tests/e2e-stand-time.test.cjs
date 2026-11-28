// The time the e2e stand clock is put to: the nearest 10:00 ahead (Tashkent, UTC+5), never on the 29th-31st (the billing day of a centre is 1..28) - then 10:00 of the 1st of the next month.
const assert = require("node:assert/strict");
const test = require("node:test");

const at = (iso) => Date.parse(`${iso}+05:00`);   // a moment given in the Tashkent wall time

test("the target time of the stand: the nearest 10:00 ahead, the 1st of the next month instead of the 29th-31st", async () => {
  const { standTargetTime } = await import("../e2e/scripts/stand-time.mjs");
  const cases = [
    ["2026-11-28T09:59:00", "2026-11-28T10:00", "the 28th before 10:00: the 28th"],
    ["2026-11-28T10:00:00", "2026-12-01T10:00", "the 28th at 10:00 (not ahead any more): the 29th would be next - the 1st"],
    ["2026-11-28T15:30:00", "2026-12-01T10:00", "the 28th after 10:00: the 1st of the next month"],
    ["2026-11-29T08:00:00", "2026-12-01T10:00", "the 29th before 10:00: the 29th is not allowed - the 1st"],
    ["2026-12-31T12:00:00", "2027-01-01T10:00", "31.12: 01.01"],
    ["2026-12-30T03:00:00", "2027-01-01T10:00", "30.12 early: the 30th is not allowed - 01.01"],
    ["2027-02-28T11:00:00", "2027-03-01T10:00", "28.02 of a common year after 10:00: 01.03"],
    ["2028-02-28T11:00:00", "2028-03-01T10:00", "28.02 of a leap year after 10:00: the 29th is not allowed - 01.03"],
    ["2026-11-14T11:00:00", "2026-11-15T10:00", "an ordinary day after 10:00: tomorrow, as before"],
    ["2026-11-14T08:00:00", "2026-11-14T10:00", "an ordinary day before 10:00: today, as before"],
    ["2026-11-01T00:00:00", "2026-11-01T10:00", "the 1st at midnight: the 1st"],
    ["2026-10-27T23:59:00", "2026-10-28T10:00", "27th evening: the 28th"],
  ];
  for (const [now, expected, why] of cases) assert.equal(standTargetTime(at(now)), expected, why);
  // the day of Tashkent, not of UTC: 20:00Z on the 28th is already 01:00 of the 29th there
  assert.equal(standTargetTime(Date.parse("2026-11-28T20:00:00Z")), "2026-12-01T10:00");
});
