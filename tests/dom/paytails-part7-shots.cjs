// PAY-TAILS Б9.8 / Б10: `node tests/dom/paytails-part7-shots.cjs <out dir>` - the console «Сверка денег» with a divergence I-6: the list and the open card at 1280 / 375 (short and long centre name).
// Prints ONLY suspicious lines: horizontal scroll, text off its block, a console error.  Run with TMPDIR in `artifacts/money1-stage/.cache` (the css of the run goes there).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.join(__dirname, "..", "..");
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-c", path.join(root, "console", "tailwind.config.ts"), "-o", css], { cwd: root, stdio: "pipe" });
process.env.DOM_CSS = css;
const { launch, openPage } = require("../helpers/dom-page.cjs");
const { layoutProbe } = require("../helpers/layout-probe.cjs");
const KINDS = require("../fixtures/money-reconcile/findings.json").findings;

const RUN = { id: "r1", startedAt: "2026-11-05T21:10:00", finishedAt: "2026-11-05T21:12:00", status: "findings", centresChecked: 12, findings: 3, newFindings: 2, mail: "sent", error: null };
const TEXT = "Проба оплаты 1 000 сум сегодня увеличила долг: было 500 000 сум, стало 599 000 сум";
const i6 = (orgName) => ({ id: "f6", orgId: "00000000-0000-0000-0000-0000000000a3", orgName, invariant: "I-6", what: "пробная запись меняет счёт не так, как должна", subjectKey: "membership:00000000-0000-0000-0000-0000000000b6:pay_today:debt_grows", subjectId: "00000000-0000-0000-0000-0000000000b6", month: null, expected: 500000, actual: 599000, text: TEXT, details: { probe: "pay_today", rule: "debt_grows", text: TEXT }, isNew: true });
const pick = (what) => KINDS.find((item) => item.details.what === what);

(async () => {
  const browser = await launch();
  const suspicious = [];
  for (const long of [false, true]) {
    for (const width of [1280, 375]) {
      const name = long ? "Учебный центр «Абдурахмонов и партнёры: математика, физика и подготовка к экзаменам»" : "Центр «Гамма»";
      const { page, errors } = await openPage(browser, "console.entry.tsx", () => null, { width, height: width === 375 ? 812 : 900 });
      await page.evaluate((d) => window.show(d), { runs: [RUN], latest: RUN, findings: [pick("identity"), pick("drift"), i6(name)] });
      await page.waitForSelector("table");
      await page.waitForTimeout(400);
      for (const step of ["list", "card"]) {
        if (step === "card") {
          await page.click('[aria-label^="Открыть расхождение"][aria-label*="Пробная запись"]');
          await page.waitForSelector('[role="dialog"]');
          await page.waitForTimeout(500);
        }
        const probe = await page.evaluate(layoutProbe, step === "card" ? '[role="dialog"]' : "body");
        const label = `i6-${step}${long ? "-long" : ""}-${width}`;
        const pageScroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (probe.bad.length || probe.scroll > 0 || pageScroll > 0) suspicious.push(`${label}: ${pageScroll > 0 ? `page scroll ${pageScroll} ` : ""}${probe.scroll > 0 ? `scroll ${probe.scroll} ` : ""}${probe.bad.join(" | ")}`);
        if (errors.length) suspicious.push(`${label}: console ${errors.join(" | ").slice(0, 160)}`);
        await page.screenshot({ path: path.join(out, `${label}.png`), fullPage: true });
      }
      await page.close();
    }
  }
  await browser.close();
  console.log(suspicious.length ? suspicious.join("\n") : "no suspicious lines");
})();
