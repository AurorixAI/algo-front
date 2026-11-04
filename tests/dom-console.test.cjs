// «Деньги-1», пакет А, R3 (unconfirmed 3): the console «Сверка денег» in a real DOM.  The panel of an open divergence follows the data: after «Обновить» it shows the fresh numbers of the SAME
// divergence (the key is the centre, the invariant and the subject - not the id of a run), and it closes when the divergence is gone.
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { launch, openPage } = require("./helpers/dom-page.cjs");

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

const KINDS = require(path.join(__dirname, "fixtures/money-reconcile/findings.json")).findings;
const RUN = { id: "r1", startedAt: "2026-11-05T21:10:00", finishedAt: "2026-11-05T21:12:00", status: "findings", centresChecked: 12, findings: 1, newFindings: 1, mail: "sent", error: null };
const drift = (over = {}) => ({ ...KINDS.find((item) => item.details.what === "drift"), ...over });
const data = (findings) => ({ runs: [RUN], latest: RUN, findings });

test("«Обновить»: the open divergence is read again (fresh numbers under the same key), and closes when it is gone", async () => {
  const { page, errors } = await openPage(browser, "console.entry.tsx");
  await page.evaluate((payload) => window.show(payload), data([drift()]));
  await page.click('tr[role="button"], [aria-label^="Открыть расхождение"]');
  await page.waitForSelector('[role="dialog"]');
  assert.match(await page.textContent('[role="dialog"]'), /Сохранено 475\s000\sсум · сейчас считается 600\s000\sсум \(изменилось на \+125\s000\sсум\)/);
  // the next night: another id of the finding, the same divergence, the sheet moved again
  await page.evaluate((payload) => window.show(payload), data([drift({ id: "other-run-id", expected: 650000, details: { what: "drift", changedBy: 175000 } })]));
  await page.waitForTimeout(100);
  assert.match(await page.textContent('[role="dialog"]'), /сейчас считается 650\s000\sсум \(изменилось на \+175\s000\sсум\)/, "the panel shows the fresh divergence, not the old object");
  // the divergence is gone
  await page.evaluate((payload) => window.show(payload), data([]));
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 3000 });
  assert.equal(await page.locator('[role="dialog"]').count(), 0, "a divergence that is gone closes its panel");
  assert.deepEqual(errors, []);
  await page.close();
});
