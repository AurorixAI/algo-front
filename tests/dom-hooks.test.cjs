// «Деньги-1», пакет А, R3 m5: the hooks that ask the server «что будет с деньгами» - the REAL ones in a real React (headless Chromium), not a stand-in.  What a person must never see:
// a frame of «idle» between two «loading» (a block that blinks, a button disabled for no reason), and the answer of the previous key standing for the new one (a confirmation of a
// wrong thing).  Contract of the asker (LESSONS 89): the answer of an older ask is dropped; closing the window aborts the request.
const assert = require("node:assert/strict");
const test = require("node:test");
const { launch, openPage } = require("./helpers/dom-page.cjs");

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

const mount = async (name, props) => {
  const run = await openPage(browser, "hooks.entry.tsx");
  await run.page.evaluate(([n, p]) => window.mount(n, p), [name, props]);
  return run;
};
const renders = (page) => page.evaluate(() => window.__renders.slice());
const settle = (page, ms = 80) => page.waitForTimeout(ms);
const answer = (page, index, payload) => page.evaluate(([i, p]) => window.__loads[i].resolve(p), [index, payload]);

test("useMoneyPreview: a key is «loading» from its VERY FIRST render (never idle), then the answer; no key = idle", async () => {
  const { page, errors } = await mount("probe", { kind: "plain" });
  assert.deepEqual(await renders(page), ["-=idle"]);
  await page.evaluate(() => window.setKey("L1"));
  await settle(page);
  const seen = await renders(page);
  assert.ok(seen.includes("L1=loading"));
  assert.ok(!seen.includes("L1=idle"), `no frame of «idle» for a key: ${seen}`);
  await answer(page, 0, { for: "L1" });
  await settle(page);
  assert.equal((await renders(page)).at(-1), "L1=ready:L1");
  assert.deepEqual(errors, []);
  await page.close();
});

test("useMoneyPreview: a NEW key never shows the answer of the old one - not for a single frame - and the late answer of the old ask is dropped", async () => {
  const { page } = await mount("probe", { kind: "plain" });
  await page.evaluate(() => window.setKey("L1"));
  await settle(page);
  await answer(page, 0, { for: "L1" });
  await settle(page);
  await page.evaluate(() => window.setKey("L2"));
  await settle(page);
  const seen = await renders(page);
  assert.ok(!seen.includes("L2=ready:L1"), `the answer of L1 must never stand for L2: ${seen}`);
  assert.ok(!seen.includes("L2=idle"), "and no blink of idle");
  assert.equal((await page.evaluate(() => window.__loads.length)), 2, "L2 was asked");
  // the second ask is answered first, then the first one answers late: dropped
  await answer(page, 1, { for: "L2" });
  await settle(page);
  await answer(page, 0, { for: "L1-late" });
  await settle(page);
  assert.equal((await renders(page)).at(-1), "L2=ready:L2");
  assert.ok(!(await renders(page)).some((text) => text.includes("L1-late")));
  await page.close();
});

test("useMoneyPreview: a failure is «failed»; «Повторить» asks again and shows «loading» at once; closing the window (key null) ABORTS the request in flight", async () => {
  const { page } = await mount("probe", { kind: "plain" });
  await page.evaluate(() => window.setKey("L1"));
  await settle(page);
  await page.evaluate(() => window.__loads[0].reject(Object.assign(new Error("нет связи"), { status: 500 })));
  await settle(page);
  assert.equal(await page.getAttribute("#state", "data-status"), "failed");
  const before = (await renders(page)).length;
  await page.evaluate(() => window.retry());
  await settle(page);
  assert.equal(await page.evaluate(() => window.__loads.length), 2, "«Повторить» is a new ask");
  assert.equal((await renders(page)).slice(before).find((text) => text.startsWith("L1=")), "L1=loading", "the very next frame already says loading, not the old failure");
  await page.evaluate(() => window.setKey(null));
  await settle(page);
  assert.equal(await page.evaluate(() => window.__loads[1].signal.aborted), true, "the request in flight was aborted");
  assert.equal(await page.getAttribute("#state", "data-status"), "idle");
  await page.close();
});

test("useFormMoneyPreview: typing asks ONCE after the form stood still; in between the block says «loading» (never idle, never the old answer); no key = idle and no ask", async () => {
  const { page } = await mount("probe", { kind: "form", delayMs: 60 });
  await page.evaluate(() => window.setKey("A"));
  await page.evaluate(() => window.setKey("AB"));
  await page.evaluate(() => window.setKey("ABC"));
  await settle(page, 200);
  assert.equal(await page.evaluate(() => window.__loads.length), 1, "one ask for the three keystrokes");
  assert.equal(await page.evaluate(() => window.__loads[0].key), "ABC");
  await answer(page, 0, { for: "ABC" });
  await settle(page);
  await page.evaluate(() => window.setKey("ABCD"));
  await settle(page, 20);
  const seen = await renders(page);
  assert.ok(!seen.includes("ABCD=ready:ABC"), `the answer of ABC must not stand for ABCD: ${seen}`);
  assert.ok(!seen.some((text) => /^(A|AB|ABC|ABCD)=idle$/.test(text)), `no idle for a key at any time: ${seen}`);
  await settle(page, 200);
  assert.equal(await page.evaluate(() => window.__loads.length), 2);
  await page.evaluate(() => window.setKey(null));
  await settle(page, 200);
  assert.equal(await page.evaluate(() => window.__loads.length), 2, "no key - no ask");
  assert.equal((await renders(page)).at(-1), "-=idle");
  await page.close();
});

test("useDebouncedValue: the first value is at once; a change is delivered after it stood still, and only the last of a burst", async () => {
  const { page } = await mount("debounced", { delayMs: 60 });
  assert.deepEqual(await renders(page), ["a/a"]);
  await page.evaluate(() => { window.setValue("b"); window.setValue("c"); window.setValue("d"); });
  await settle(page, 20);
  assert.equal(await page.textContent("#state"), "d/a", "not yet");
  await settle(page, 200);
  assert.equal(await page.textContent("#state"), "d/d");
  const seen = await renders(page);
  assert.ok(!seen.some((text) => text === "d/b" || text === "d/c"), `the middle values of a burst are never delivered: ${seen}`);
  await page.close();
});
