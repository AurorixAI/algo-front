// Design system wave 3: `node tests/dom/wave3-shots.cjs <out dir> <tailwind css>` - the tables of the platform at 1280 / 1024 / 375, by the REAL components, with the 240 px sidebar emulated (the cabinet has it from 768).
const fs = require("node:fs");
const path = require("node:path");
const out = process.argv[2];
process.env.DOM_CSS = process.argv[3];
const root = path.join(__dirname, "..", "..");
const { launch, openPage } = require("../helpers/dom-page.cjs");
const { SHOTS } = require("../helpers/wave3-fixtures.cjs");
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await launch();
  for (const shot of SHOTS) {
    for (const [width, height] of [[1280, 800], [1024, 800], [375, 812]]) {
      const { page } = await openPage(browser, shot.entry, shot.server, { width, height });
      if (shot.time) await page.clock.setFixedTime(new Date(shot.time));
      try {
        await page.evaluate(([pad, name, props, search]) => { document.getElementById("root").style.boxSizing = "border-box"; document.getElementById("root").style.padding = pad ? `0 32px 0 ${pad + 32}px` : "0 16px"; if (search) window.__search = search; window.mount(name, { role: "owner", org_role: "owner" }, props); }, [width >= 768 ? 240 : 0, shot.mount, shot.props, shot.search]);
        await page.waitForSelector(shot.wait, { timeout: 10000 });
        await page.waitForTimeout(600);
      } catch (error) { console.log("!", shot.name, width, String(error).slice(0, 100)); }
      await page.screenshot({ path: path.join(out, `${shot.name}-${width}.png`) });
      await page.close();
    }
  }
  await browser.close();
})();
