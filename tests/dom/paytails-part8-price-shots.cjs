// PAY-TAILS Б11.8 п. 9: `node tests/dom/paytails-part8-price-shots.cjs <out dir>` - the window of the price of a group (and of an individual price) with the refusal of the «typo» that would turn a forgiven debt into an advance
// (409 PRICE_CORRECTION_FORGIVENESS): 1 and 3 students, 1280 / 375.  Prints what the window shows (the text of the notice) and ONLY suspicious lines: text off its block, a scroll, a button out of reach.
// Run with TMPDIR in `artifacts/money1-stage/.cache` (the css of the run goes there).
const fs = require("node:fs");
const path = require("node:path");
const { start, plain, conflict, open } = require("../helpers/money1-v.cjs");
const { layoutProbe } = require("../helpers/layout-probe.cjs");

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const NAMES = ["Тошматов Бобур Абдуллаевич", "Каримова Дилноза Шухратовна", "Юсупов Бекзод Равшанович"];
const impact = { students_following: 3, students_with_override: 0, stale_payroll_sheets: 0, stale_sheets: [], money: null, warnings: [], correction: null };
const backdated = (people) => conflict("PRICE_BACKDATE_WITH_PAYMENTS", "Нельзя изменить цену задним числом: у учеников есть оплаты за этот период", { students: people, can_correct: true });
const forgiveness = (n) => conflict("PRICE_CORRECTION_FORGIVENESS", `У ${n} ${n === 1 ? "ученика" : "учеников"} исправление превратит прощённый долг в переплату. Сначала отмените прощение долга, затем исправьте цену.`,
  { count: n, students: NAMES.slice(0, n).map((student_name, i) => ({ membership_id: `m${i}`, student_name })) });

(async () => {
  const browser = await start();
  const suspicious = [];
  for (const n of [1, 3]) {
    for (const width of [1280, 375]) {
      const people = NAMES.slice(0, n).map((student_name, i) => ({ membership_id: `m${i}`, student_name }));
      const server = (request) => {
        if (request.method === "PUT" && request.path === "/auth/org/groups/g1/price") return request.body.correction ? forgiveness(n) : backdated(people);
        return null;
      };
      const { page } = await open(browser, "money-v.entry.tsx", "groupPrice", { width, server });
      await page.waitForSelector("#group-price-amount");
      await page.fill("#group-price-amount", "30 000");
      await page.waitForSelector('[data-testid="price-blocked"]');
      await page.check('[data-testid="price-correction-on"]');
      await page.waitForTimeout(900);
      const label = `price-refusal-${n}-${width}`;
      const shown = plain(await page.evaluate(() => document.querySelector('[role="dialog"]').innerText));
      console.log(`${label}: ${shown.slice(shown.indexOf("Что изменит"))}`);
      const probe = await page.evaluate(layoutProbe, '[role="dialog"]');
      const pageScroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const save = await page.locator('button[form="group-price-form"]').boundingBox();
      const cancel = await page.getByRole("button", { name: "Отмена" }).boundingBox().catch(() => null);
      const viewport = page.viewportSize();
      const reachable = (box) => box && box.x >= 0 && box.x + box.width <= viewport.width;
      if (probe.bad.length || probe.scroll > 0 || pageScroll > 0 || !reachable(save)) suspicious.push(`${label}: ${JSON.stringify(probe.bad).slice(0, 200)} scroll ${probe.scroll} page ${pageScroll} save ${JSON.stringify(save)} cancel ${JSON.stringify(cancel)}`);
      await page.screenshot({ path: path.join(out, `${label}.png`) });
      await page.close();
    }
  }
  await browser.close();
  console.log(suspicious.length ? suspicious.join("\n") : "no suspicious lines");
})();
