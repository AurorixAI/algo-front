// PAY-DUE, screens part 3: `TMPDIR=<dir> node tests/dom/paydue-part3-shots.cjs <out dir> [prefix]` - PNGs of frames 17 and 18 of the layout by the REAL components at 1280 and 375 (and with long names), the answers of
// tests/helpers/paydue-part3.cjs.  Prints ONLY suspicious lines: horizontal scroll, text off its block, errors of the page.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.join(__dirname, "..", "..");
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
process.env.DOM_CSS = css;
const { launch, openPage } = require("../helpers/dom-page.cjs");
const { layoutProbe } = require("../helpers/layout-probe.cjs");
const H = require("../helpers/enrol-v2.cjs");
const P = require("../helpers/paydue-part3.cjs");

const OWNER = { role: "owner", org_role: "owner" };
const GROUP = (long) => (long ? P.LONG_GROUP : "Математика 7");
const drawer = async (ctx, width, long, extra, names) => {
  const run = await H.openDrawer(ctx, H.server({ people: long ? H.LONG_PEOPLE : H.PEOPLE, group: long ? { name: P.LONG_GROUP } : {}, ...extra }), { width, props: { groupName: long ? P.LONG_GROUP : "М11 БС" } });
  await H.pick(run.page, ...names(long)); await H.settled(run.page); await run.page.waitForTimeout(300);
  return run;
};
const three = (long) => (long ? ["Новоиспечённый", "Юсупова", "Рашидов"] : ["Каримов", "Юсупова", "Рашидов"]);
const one = (long) => [long ? "Новоиспечённый" : "Каримов"];
const mounted = async (ctx, width, handler, mount, wait) => {
  const run = await openPage(ctx.browser, "money2.entry.tsx", handler, { width, height: width === 375 ? 812 : 900 });
  await run.page.evaluate(([name, user, props]) => window.mount(name, user, props), mount);
  await run.page.waitForSelector(wait); await run.page.waitForTimeout(250);
  return run;
};
const leave = (row) => (ctx, width) => mounted(ctx, width, P.F.baseServer((r) => (r.method === "GET" && r.path === "/auth/org/groups/ga/students/st1/leave-preview" ? { json: { as_of: "2026-11-20", memberships: [row] } } : null)), ["leave", OWNER, {}], '[data-testid="settle-words"]');

const SCENES = {
  "f17a-three-one-term": (ctx, width, long) => drawer(ctx, width, long, {}, three),
  "f17b-three-own-terms": async (ctx, width, long) => { const until = { st1: "24.11", st2: "26.11", st3: "26.11" }; const run = await drawer(ctx, width, long, { dueUntil: (id) => until[id] ?? "24.11" }, three); await run.page.click('[data-testid="enrol-by-student-toggle"]'); await run.page.waitForTimeout(250); return run; },
  "f17c-one-debt-and-due": (ctx, width, long) => drawer(ctx, width, long, { immediateLines: () => [`Долг ${P.money(100000)} · срок был 03.11`, `К оплате ${P.money(88000)} до 24.11`] }, one),
  "f17d-one-debt": (ctx, width, long) => drawer(ctx, width, long, { immediateLines: () => P.dueLines(188000, 5, { debt: true, was: "03.11" }) }, one),
  "f18a-leave-only-group": (ctx, width, long) => leave(P.ONLY_GROUP(GROUP(long)))(ctx, width),
  "f18a2-leave-other-group": (ctx, width, long) => leave(P.OTHER_GROUP_LEFT(GROUP(long)))(ctx, width),
  "f18c-archive-student": (ctx, width, long) => mounted(ctx, width, P.F.baseServer((r) => (r.method === "GET" && r.path === "/auth/org/students/st1/archive-preview" ? { json: { as_of: "2026-11-20", memberships: [P.ARCHIVE_ROW(GROUP(long), 231000, "m-a", "ga"), P.ARCHIVE_ROW("Физика 8", 100000, "m-b", "gb")] } } : null)), ["archive", OWNER, {}], '[data-testid="settle-words"]'),
  "f18d-archive-group": (ctx, width, long) => mounted(ctx, width, P.F.baseServer((r) => (r.path === "/auth/org/groups/gz/archive-impact" ? { json: P.archiveImpact(P.BALANCES.map((b) => ({ ...b, name: long ? P.LONG_NAME : b.name })), P.ARCHIVE_TEXTS) } : null), P.F.SHORT), ["group-archive", OWNER, { moneyAvailable: true, groupsBasePath: "/owner/groups", groupName: GROUP(long) }], '[data-testid="archive-balance-words"]'),
};

(async () => {
  const ctx = { browser: await launch() };
  const only = process.argv[3];
  for (const [name, scene] of Object.entries(SCENES)) {
    if (only && !name.startsWith(only)) continue;
    for (const long of [false, true]) {
      for (const width of [1280, 375]) {
        const label = `${name}${long ? "-long" : ""}-${width}`;
        try {
          const run = await scene(ctx, width, long);
          const probe = await run.page.evaluate(layoutProbe, '[role="dialog"]');
          if (probe.bad.length || probe.scroll > 0) console.log(`SUSPECT ${label}: ${JSON.stringify(probe).slice(0, 400)}`);
          const errors = run.errors.filter((e) => !/404|Failed to load resource/.test(e));
          if (errors.length) console.log(`ERRORS ${label}: ${errors.slice(0, 2).join(" | ").slice(0, 300)}`);
          await run.page.screenshot({ path: path.join(out, `${label}.png`) });
          await run.page.close();
        } catch (error) { console.log(`FAILED ${label}: ${String(error).slice(0, 300)}`); }
      }
    }
  }
  await ctx.browser.close();
})();
