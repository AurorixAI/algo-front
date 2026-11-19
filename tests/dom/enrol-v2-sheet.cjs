// `node tests/dom/enrol-v2-sheet.cjs <dir with the 15 frames> <out png>` - the frames of the product in the order of the mock-up on one sheet 1440 px wide (headless Chromium, no window).
const fs = require("node:fs");
const path = require("node:path");
const { launch } = require("../helpers/dom-page.cjs");
const [dir, out] = process.argv.slice(2);
const TITLES = ["1. Открыли окно", "2. Выбрали троих", "3. «Изменить»", "4. Записали", "5. Другая группа", "6. Долг, заново, как был", "7. Суммы разные", "8. Выбрано много", "9. Идёт расчёт", "10. Нет цены", "11. Без права на деньги", "12. Записаны не все", "13. Телефон: один", "14. Телефон: условия", "15. С карточки ученика"];
const files = fs.readdirSync(dir).filter((name) => /^\d\d-.*\.png$/.test(name) && !/-long\./.test(name)).sort();
(async () => {
  // a desktop frame is 1280 px wide with the window on one side: the sheet shows the strip of the window (x, width) at its own scale; a phone frame is shown whole at 375 px
  const CROP = { 4: [400, 480], 15: [380, 520] };
  const cells = files.map((name, i) => {
    const n = i + 1;
    const data = `data:image/png;base64,${fs.readFileSync(path.join(dir, name)).toString("base64")}`;
    if (n === 13 || n === 14) return `<figure><figcaption>${TITLES[i]}</figcaption><img class="ph" src="${data}"></figure>`;
    const [x, w] = CROP[n] ?? [820, 460];
    return `<figure><figcaption>${TITLES[i] ?? name}</figcaption><div class="crop" style="aspect-ratio:${w}/900"><img style="width:${(1280 / w) * 100}%;left:${-(x / w) * 100}%" src="${data}"></div></figure>`;
  }).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#f1f0ec;font:13px Inter,system-ui,sans-serif;padding:20px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;align-items:start}figure{margin:0}figcaption{font-weight:600;margin-bottom:6px}img{display:block}.crop{position:relative;overflow:hidden;border:1px solid #dcd9d2;border-radius:8px;background:#fff}.crop img{position:absolute;top:0}img.ph{width:375px;border:1px solid #dcd9d2;border-radius:8px}</style><main>${cells}</main>`;
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent(html);
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
