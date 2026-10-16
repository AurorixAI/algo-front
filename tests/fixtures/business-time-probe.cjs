// Prints every business-time helper result as JSON. The test runs this file under several TZ values
// and requires the output to be identical: the device's timezone must never reach the display.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const time = require(path.join(__dirname, "../../src/lib/business-time.ts"));
const period = require(path.join(__dirname, "../../src/lib/business-period.ts"));

const STAMPS = [
  "2026-10-14T18:59:00", "2026-10-14T19:00:00", "2026-10-14T18:59:59.999999", "2026-10-14 19:00:00",
  "2026-10-14T19:00:00Z", "2026-10-14T19:00:00+00:00", "2026-10-14T19:00:00+05:00", "2026-12-31T19:00:00",
  "2026-10-16", "", null, "garbage", "2026-13-45T25:61:00",
];
const NOW = new Date("2026-10-16T20:30:00Z"); // 17.10 01:30 in Tashkent

const out = {
  stamps: STAMPS.map((value) => ({
    value,
    date: time.formatUtcNaiveAsBusinessDate(value),
    dateLong: time.formatUtcNaiveAsBusinessDate(value, { day: "numeric", month: "short" }),
    time: time.formatUtcNaiveAsBusinessTime(value),
    dayTime: time.formatUtcNaiveAsBusinessDayTime(value),
    dateTime: time.formatUtcNaiveAsBusinessDateTime(value),
    iso: time.utcNaiveToBusinessIsoDate(value),
    today: period.matchesBusinessPeriod(value, "today", NOW),
    yesterday: period.matchesBusinessPeriod(value, "yesterday", NOW),
    week: period.matchesBusinessPeriod(value, "week", NOW),
    month: period.matchesBusinessPeriod(value, "month", NOW),
  })),
  calendar: ["2026-10-16", "2026-10-16T05:00:00", "2026-12-31", "2027-01-01", "nope", null].map((value) => ({
    value,
    label: time.formatBusinessCalendarDate(value),
    longLabel: time.formatBusinessCalendarDate(value, { day: "numeric", month: "long", year: "numeric" }),
    weekday: time.isoDateDayOfWeek(value),
    plus3: time.addIsoDays(value, 3),
  })),
  clock: {
    businessDate: time.formatBusinessDate(NOW),
    minusOne: time.businessDateWithOffset(-1, NOW),
    plusSix: time.businessDateWithOffset(6, NOW),
    minutes: time.businessTimeMinutes(NOW),
    dayOfWeek: time.businessDayOfWeek(NOW),
    greeting: time.businessGreeting(NOW),
    dateTime: time.formatBusinessDateTime(NOW),
  },
};
process.stdout.write(JSON.stringify(out));
