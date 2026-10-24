/**
 * ROADMAP #29: every date and time on screen is shown on the organisation's clock (Asia/Tashkent),
 * never on the device's. Servers (auth / exam / diagnostic) write NAIVE UTC ("2026-10-14T19:40:00",
 * no "Z"); business dates ("2026-10-16") and wall times ("09:41") are already Tashkent and must not move.
 */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const time = require(path.join(__dirname, "../src/lib/business-time.ts"));
const period = require(path.join(__dirname, "../src/lib/business-period.ts"));
const excuses = require(path.join(__dirname, "../src/lib/attendance-excuses.ts"));

const SRC = path.join(__dirname, "../src");
const read = (relative) => fs.readFileSync(path.join(SRC, relative), "utf8");

// ── parsing ────────────────────────────────────────────────────────────────────────────────────

test("parseUtcNaive reads a stamp without a zone as UTC, whatever the device zone is", () => {
  assert.equal(time.parseUtcNaive("2026-10-14T19:40:00").toISOString(), "2026-10-14T19:40:00.000Z");
  assert.equal(time.parseUtcNaive("2026-10-14 19:40:00").toISOString(), "2026-10-14T19:40:00.000Z");
  assert.equal(time.parseUtcNaive("2026-10-14T19:40").toISOString(), "2026-10-14T19:40:00.000Z");
  assert.equal(time.parseUtcNaive("  2026-10-14T19:40:00  ").toISOString(), "2026-10-14T19:40:00.000Z");
});

test("parseUtcNaive keeps a stamp that already has a zone", () => {
  assert.equal(time.parseUtcNaive("2026-10-14T19:40:00Z").toISOString(), "2026-10-14T19:40:00.000Z");
  assert.equal(time.parseUtcNaive("2026-10-14T19:40:00z").toISOString(), "2026-10-14T19:40:00.000Z");
  assert.equal(time.parseUtcNaive("2026-10-14T19:40:00+00:00").toISOString(), "2026-10-14T19:40:00.000Z");
  assert.equal(time.parseUtcNaive("2026-10-14T19:40:00+05:00").toISOString(), "2026-10-14T14:40:00.000Z");
  assert.equal(time.parseUtcNaive("2026-10-14T19:40:00-0300").toISOString(), "2026-10-14T22:40:00.000Z");
});

test("parseUtcNaive tolerates Python microseconds, with and without a zone", () => {
  assert.equal(time.parseUtcNaive("2026-10-14T19:40:00.123456").toISOString(), "2026-10-14T19:40:00.123Z");
  assert.equal(time.parseUtcNaive("2026-10-14T19:40:00.1").toISOString(), "2026-10-14T19:40:00.100Z");
  assert.equal(time.parseUtcNaive("2026-10-14T19:40:00.123456+00:00").toISOString(), "2026-10-14T19:40:00.123Z");
  assert.equal(time.parseUtcNaive("2026-10-14T19:40:00.987654Z").toISOString(), "2026-10-14T19:40:00.987Z");
});

test("parseUtcNaive: a date-only value and garbage are not instants", () => {
  for (const value of ["2026-10-14", "", "   ", null, undefined, "garbage", "14.10.2026", "19:40", "2026-13-45T25:61:00", 42]) {
    assert.equal(time.parseUtcNaive(value), null, String(value));
  }
});

// ── Tashkent day / time (the midnight edge is UTC 19:00) ───────────────────────────────────────

test("a naive-UTC stamp changes the Tashkent day exactly at 19:00 UTC", () => {
  assert.equal(time.formatUtcNaiveAsBusinessDate("2026-10-14T18:59:00"), "14.10.2026");
  assert.equal(time.formatUtcNaiveAsBusinessDate("2026-10-14T18:59:59.999999"), "14.10.2026");
  assert.equal(time.formatUtcNaiveAsBusinessDate("2026-10-14T19:00:00"), "15.10.2026");
  assert.equal(time.utcNaiveToBusinessIsoDate("2026-10-14T18:59:00"), "2026-10-14");
  assert.equal(time.utcNaiveToBusinessIsoDate("2026-10-14T19:00:00"), "2026-10-15");
  // New Year: 31.12 19:00 UTC is already 1 January in Tashkent
  assert.equal(time.formatUtcNaiveAsBusinessDate("2026-12-31T19:00:00"), "01.01.2027");
});

test("time of day: 18:59Z is 23:59 and 19:00Z is 00:00 in Tashkent", () => {
  assert.equal(time.formatUtcNaiveAsBusinessTime("2026-10-14T18:59:00"), "23:59");
  assert.equal(time.formatUtcNaiveAsBusinessTime("2026-10-14T19:00:00"), "00:00");
  assert.equal(time.formatUtcNaiveAsBusinessTime("2026-10-15T08:55:00"), "13:55");
  assert.equal(time.formatUtcNaiveAsBusinessDateTime("2026-10-14T18:59:00"), "14.10.2026 23:59");
  assert.equal(time.formatUtcNaiveAsBusinessDateTime("2026-10-14T19:00:00"), "15.10.2026 00:00");
  assert.match(time.formatUtcNaiveAsBusinessDayTime("2026-10-14T19:00:00"), /^15 окт\.?,? 00:00$/);
  assert.match(
    time.formatUtcNaiveAsBusinessDayTime("2026-10-14T19:00:00", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }),
    /^15 октября(?: в|,)? 00:00$/,
  );
});

test("a stamp with a zone is converted, not re-read as UTC", () => {
  for (const value of ["2026-10-14T19:00:00Z", "2026-10-14T19:00:00+00:00", "2026-10-15T00:00:00+05:00"]) {
    assert.equal(time.formatUtcNaiveAsBusinessDate(value), "15.10.2026", value);
    assert.equal(time.formatUtcNaiveAsBusinessTime(value), "00:00", value);
  }
  assert.equal(time.formatUtcNaiveAsBusinessDateTime("2026-10-14T19:00:00+05:00"), "14.10.2026 19:00");
});

test("a date-only value is a calendar day: printed as written, no time of day invented", () => {
  assert.equal(time.formatUtcNaiveAsBusinessDate("2026-10-16"), "16.10.2026");
  assert.equal(time.formatUtcNaiveAsBusinessDate("2026-10-16", { day: "numeric", month: "short" }), "16 окт.");
  assert.equal(time.utcNaiveToBusinessIsoDate("2026-10-16"), "2026-10-16");
  assert.equal(time.formatUtcNaiveAsBusinessTime("2026-10-16"), "");
  assert.equal(time.formatUtcNaiveAsBusinessDateTime("2026-10-16"), "");
  assert.equal(time.formatUtcNaiveAsBusinessDayTime("2026-10-16"), "");
});

test("invalid, empty and missing input give an empty string, never 'Invalid Date'", () => {
  for (const value of ["", null, undefined, "garbage", "2026-13-45T25:61:00"]) {
    for (const fn of [
      time.formatUtcNaiveAsBusinessDate, time.formatUtcNaiveAsBusinessTime,
      time.formatUtcNaiveAsBusinessDateTime, time.formatUtcNaiveAsBusinessDayTime, time.utcNaiveToBusinessIsoDate,
      time.formatBusinessCalendarDate,
    ]) {
      assert.equal(fn(value), "", `${fn.name}(${String(value)})`);
    }
  }
});

test("business calendar dates keep their day; a timestamp is refused there", () => {
  assert.equal(time.formatBusinessCalendarDate("2026-10-16"), "16 октября");
  assert.equal(time.formatBusinessCalendarDate("2026-10-16", { day: "numeric", month: "short" }), "16 окт.");
  assert.equal(time.formatBusinessCalendarDate("2026-10-16", { day: "numeric", month: "long", year: "numeric" }), "16 октября 2026 г.");
  assert.equal(time.formatBusinessCalendarDate("2026-10-16T19:00:00"), "");
});

test("calendar arithmetic is timezone-free", () => {
  assert.equal(time.addIsoDays("2026-10-16", 0), "2026-10-16");
  assert.equal(time.addIsoDays("2026-10-16", -16), "2026-09-30");
  assert.equal(time.addIsoDays("2026-12-31", 1), "2027-01-01");
  assert.equal(time.addIsoDays("2028-02-28", 1), "2028-02-29");
  assert.equal(time.addIsoDays("2027-03-01", -1), "2027-02-28");
  assert.equal(time.addIsoDays("nope", 1), "");
  assert.equal(time.isoDateDayOfWeek("2026-10-16"), 5); // Friday
  assert.equal(time.isoDateDayOfWeek("2026-10-18"), 7); // Sunday
  assert.equal(time.isoDateDayOfWeek("2026-10-19"), 1); // Monday
  assert.equal(time.isoDateDayOfWeek("2026-10-17"), 6);
  assert.equal(time.isoDateDayOfWeek("nope"), 0);
  assert.equal(time.isoDateDayOfWeek(null), 0);
});

test("businessDateWithOffset counts from the Tashkent today, also just after the UTC date has changed", () => {
  const now = new Date("2026-10-16T20:30:00Z"); // 17.10 01:30 in Tashkent, still 16.10 in UTC
  assert.equal(time.formatBusinessDate(now), "2026-10-17");
  assert.equal(time.businessDateWithOffset(0, now), "2026-10-17");
  assert.equal(time.businessDateWithOffset(-1, now), "2026-10-16");
  assert.equal(time.businessDateWithOffset(-29, now), "2026-09-18");
  assert.equal(time.businessDateWithOffset(6, now), "2026-10-23");
});

test("«Сформирован» / excuse times keep working: wall-time strings are shown as written", () => {
  // reason_at / reviewed_at are already Tashkent wall time (no zone): never shifted
  assert.equal(excuses.formatDateTimeRu("2026-10-15T08:55:00"), "15.10.2026 08:55");
  assert.equal(excuses.formatDateTimeRu("2026-10-14T19:00:00"), "14.10.2026 19:00");
  // a value with a zone is converted to Tashkent
  assert.equal(excuses.formatDateTimeRu("2026-10-14T19:00:00Z"), "15.10.2026 00:00");
  assert.equal(excuses.formatDateTimeRu("garbage"), "");
  assert.equal(excuses.formatDateTimeRu(null), "");
});

// ── day buckets ("today / yesterday / 7 / 30 days") ────────────────────────────────────────────

test("period filter buckets by the Tashkent calendar", () => {
  const now = new Date("2026-10-16T20:30:00Z"); // Tashkent: 17.10 01:30
  const at = (stamp, name) => period.matchesBusinessPeriod(stamp, name, now);
  // 19:30Z on the 16th is 00:30 on the 17th in Tashkent: that is TODAY (a UTC/local reading says yesterday)
  assert.equal(at("2026-10-16T19:30:00", "today"), true);
  assert.equal(at("2026-10-16T19:30:00", "yesterday"), false);
  // 18:59Z on the 16th is 23:59 on the 16th in Tashkent: yesterday
  assert.equal(at("2026-10-16T18:59:00", "today"), false);
  assert.equal(at("2026-10-16T18:59:00", "yesterday"), true);
  assert.equal(at("2026-10-15T19:00:00", "yesterday"), true); // 16.10 00:00 Tashkent
  assert.equal(at("2026-10-15T18:59:00", "yesterday"), false); // 15.10 23:59 Tashkent
  // week = today - 7 days (10.10) .. now ; month = today - 30 days (17.09) .. now
  assert.equal(at("2026-10-09T19:00:00", "week"), true); // 10.10 00:00 Tashkent
  assert.equal(at("2026-10-09T18:59:00", "week"), false); // 09.10 23:59 Tashkent
  assert.equal(at("2026-09-16T19:00:00", "month"), true); // 17.09 00:00 Tashkent
  assert.equal(at("2026-09-16T18:59:00", "month"), false);
  // "all" and unreadable stamps never hide a record
  assert.equal(at("2020-01-01T00:00:00", "all"), true);
  assert.equal(at("garbage", "today"), true);
  assert.equal(at(null, "week"), true);
  assert.equal(at("", "yesterday"), true);
  assert.equal(at("2026-10-17T00:00:00", "something-else"), true);
  // a stamp with a zone and a plain date work too
  assert.equal(at("2026-10-16T19:30:00Z", "today"), true);
  assert.equal(at("2026-10-17", "today"), true);
});

// ── the device timezone never reaches the screen ───────────────────────────────────────────────

test("every helper gives the same answer under very different device timezones", () => {
  const probe = path.join(__dirname, "fixtures/business-time-probe.cjs");
  const zones = ["UTC", "Asia/Tashkent", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Kolkata", "Europe/Moscow"];
  const run = (TZ) => execFileSync(process.execPath, [probe], { env: { ...process.env, TZ }, encoding: "utf8" });
  const baseline = run("Asia/Tashkent");
  for (const zone of zones) {
    assert.equal(run(zone), baseline, `output differs under TZ=${zone}`);
  }
  const out = JSON.parse(baseline);
  const byValue = Object.fromEntries(out.stamps.map((row) => [String(row.value), row]));
  assert.equal(byValue["2026-10-14T18:59:00"].dateTime, "14.10.2026 23:59");
  assert.equal(byValue["2026-10-14T19:00:00"].dateTime, "15.10.2026 00:00");
  assert.equal(byValue["2026-10-14T19:00:00Z"].dateTime, "15.10.2026 00:00");
  assert.equal(byValue["2026-10-14T19:00:00+05:00"].dateTime, "14.10.2026 19:00");
  assert.equal(byValue["2026-10-16"].date, "16.10.2026");
  assert.equal(byValue["garbage"].date, "");
  assert.equal(out.clock.businessDate, "2026-10-17");
  assert.equal(out.clock.dateTime, "17.10.2026 01:30");
  assert.equal(out.clock.greeting, "Доброй ночи"); // 01:30 in Tashkent
});

// ── source guard: nobody formats a date in the device's zone again ─────────────────────────────

function sourceFiles(dir = SRC) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** Source without comments (a doc comment may talk about toLocaleString; code must not use it). */
function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const SERVER_STAMP_FIELDS = "(?:created|started|submitted|completed|generated|released|finished|updated|expires|reason|reviewed|joined|voided|diagnosed|confirmed)_at|\\bat\\b";

/**
 * Each rule: a pattern that must not appear in display code, and the files where it is legitimate
 * (with the reason). The helper module itself is the one place that talks to Intl.
 */
const RULES = [
  {
    name: "toLocaleDateString / toLocaleTimeString / toLocaleString format in the device zone",
    pattern: /\.toLocale(?:Date|Time)?String\s*\(/,
    allow: {},
  },
  {
    name: "Intl.DateTimeFormat outside the business-time module (must carry timeZone: Asia/Tashkent there)",
    pattern: /\bIntl\.DateTimeFormat\b/,
    allow: {
      "lib/business-time.ts": "the single place that formats dates; every call pins timeZone (checked below)",
    },
  },
  {
    name: "getHours / getMinutes / getSeconds / getTimezoneOffset read the device clock",
    pattern: /\.get(?:Hours|Minutes|Seconds|Milliseconds|TimezoneOffset)\s*\(/,
    allow: {},
  },
  {
    name: "local-calendar getters (getDate / getDay / getMonth / getFullYear) and setters",
    pattern: /\.(?:get(?:Date|Day|Month|FullYear)|set(?:Date|Month|FullYear|Hours|Minutes))\s*\(/,
    allow: {},
  },
  {
    name: "new Date(<server timestamp field>) reads a naive-UTC stamp as device-local time",
    pattern: new RegExp(`new Date\\(\\s*[^)]*(?:${SERVER_STAMP_FIELDS})`),
    allow: {},
  },
  {
    name: "Date.parse / date libraries",
    pattern: /\bDate\.parse\s*\(|from\s+["'](?:date-fns|dayjs|moment|luxon)|require\(["'](?:date-fns|dayjs|moment|luxon)/,
    allow: { "lib/api.ts": "Retry-After may be an HTTP-date: it always ends in GMT, so Date.parse gives the same instant on every device and only the seconds left are kept" },
  },
];

function scan(files) {
  const found = [];
  for (const file of files) {
    const relative = path.relative(SRC, file).split(path.sep).join("/");
    const lines = codeOnly(fs.readFileSync(file, "utf8")).split("\n");
    for (const rule of RULES) {
      if (rule.allow[relative]) continue;
      lines.forEach((line, index) => {
        if (rule.pattern.test(line)) found.push(`${relative}:${index + 1}  [${rule.name}]  ${line.trim().slice(0, 110)}`);
      });
    }
  }
  return found;
}

test("source guard: no display or bucketing code reads dates in the device's timezone", () => {
  const files = sourceFiles();
  assert.ok(files.length > 100, "the guard must really scan the app");
  const found = scan(files);
  assert.deepEqual(found, [], `device-timezone date code found:\n${found.join("\n")}`);
});

test("source guard: the allowlist only names files that still exist and still need the exception", () => {
  for (const rule of RULES) {
    for (const [relative, reason] of Object.entries(rule.allow)) {
      assert.ok(reason.length > 40, `${relative}: an allowlist entry needs a real reason`);
      const file = path.join(SRC, relative);
      assert.ok(fs.existsSync(file), `${relative} is allowlisted but missing`);
      assert.ok(rule.pattern.test(codeOnly(fs.readFileSync(file, "utf8"))), `${relative} no longer needs the exception for: ${rule.name}`);
    }
  }
});

test("source guard: the guard really catches the patterns it is about", () => {
  const samples = [
    'new Date(x.created_at).toLocaleDateString("ru-RU")',
    'date.toLocaleTimeString()',
    'new Intl.DateTimeFormat("ru-RU").format(d)',
    "new Date(s.submitted_at).getHours()",
    "const d = new Date(); d.getDate();",
    "yesterday.setDate(yesterday.getDate() - 1)",
    "new Date(inv.completed_at || inv.created_at)",
    'import dayjs from "dayjs"',
  ];
  for (const sample of samples) {
    assert.ok(RULES.some((rule) => rule.pattern.test(sample)), `not caught: ${sample}`);
  }
  // comments are not code
  assert.equal(codeOnly("// d.toLocaleString()\n/* x.getHours() */\nok();").includes("toLocale"), false);
  assert.equal(codeOnly("const url = 'http://x'; // note").includes("http://x"), true);
  // the month switchers must not use Date.setMonth (31 Jan + 1 month = 3 Mar)
  assert.ok(RULES.some((rule) => rule.pattern.test("next.setMonth(next.getMonth() + direction)")));
});

test("source guard: every Intl.DateTimeFormat in the helper module pins the business timezone", () => {
  const text = codeOnly(read("lib/business-time.ts"));
  const calls = [...text.matchAll(/new Intl\.DateTimeFormat\(/g)];
  assert.ok(calls.length >= 5);
  for (const call of calls) {
    const body = text.slice(call.index, call.index + 160);
    assert.match(body, /timeZone:\s*(?:BUSINESS_TIME_ZONE|"UTC")/, `an Intl call without a pinned zone: ${body.slice(0, 80)}`);
  }
  // only the calendar-date label (a date at UTC noon) may use plain UTC
  assert.equal([...text.matchAll(/timeZone:\s*"UTC"/g)].length, 1);
  assert.match(read("lib/business-time.ts"), /export const BUSINESS_TIME_ZONE = "Asia\/Tashkent"/);
});

test("exam and diagnostic screens go through the business-time helpers", () => {
  const sites = {
    "app/admin/diagnostics/page.tsx": ["matchesBusinessPeriod", "formatUtcNaiveAsBusinessDayTime(inv.created_at)"],
    "lib/live-queue.ts": ["formatUtcNaiveAsBusinessTime"],
    "app/admin/exams/page.tsx": ["businessDateWithOffset", "formatUtcNaiveAsBusinessDayTime", "formatBusinessCalendarDate"],
    "app/admin/exams/[id]/page.tsx": ["formatUtcNaiveAsBusinessDayTime", "formatBusinessCalendarDate"],
    "app/teacher/exams/page.tsx": ["formatUtcNaiveAsBusinessDate(exam.created_at", "formatBusinessCalendarDate(exam.scheduled_lesson_date"],
    "app/teacher/exams/[id]/sessions/page.tsx": ["formatUtcNaiveAsBusinessDateTime(s.submitted_at)", "formatUtcNaiveAsBusinessTime(s.submitted_at)"],
    "app/teacher/exams/[id]/report/page.tsx": ["formatUtcNaiveAsBusinessDayTime(report.generated_at"],
    "app/teacher/groups/[id]/page.tsx": ["formatUtcNaiveAsBusinessDate(ex.created_at)"],
    "components/students/student-profile-view.tsx": ["formatUtcNaiveAsBusinessDayTime(ex.submitted_at)", "formatUtcNaiveAsBusinessDate(ex.started_at"],
    "app/teacher/schedule/page.tsx": ["isoDateDayOfWeek(newLessonDate)"],
    "app/teacher/dashboard/page.tsx": ["isoDateDayOfWeek(action.lessonDate)"],
  };
  for (const [file, needles] of Object.entries(sites)) {
    const text = read(file);
    for (const needle of needles) assert.ok(text.includes(needle), `${file} should use ${needle}`);
  }
});
