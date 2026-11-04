// A page of headless Chromium served from the origin of the API (http://localhost:8000), so a `fetch` of the project is same-origin and every request goes through `route`, where the
// test answers it and writes it down.  The script is the bundle of an entry in tests/dom/.
const path = require("node:path");
const { bundle, root } = require("./dom-bundle.cjs");
const { chromium } = require(path.join(root, "node_modules", "@playwright", "test"));

const ORIGIN = "http://localhost:8000";
const cache = new Map();
const scriptOf = (entry) => { if (!cache.has(entry)) cache.set(entry, bundle(path.join(root, "tests", "dom", entry))); return cache.get(entry); };

async function launch() { return chromium.launch(); }

/**
 * `answer(request)` -> `{ status?, json? }` for a request of the API; every request is written to `calls` as `{ method, path, query, headers, body }` (`path` without `/api/v1`).
 * Anything not answered is a 404 - the test sees it in `calls`.
 */
async function openPage(browser, entry, answer = () => null, { width = 1280, height = 900 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const calls = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/__dom") return route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__css"></head><body><div id="root"></div></body></html>` });
    if (url.pathname === "/__css") return route.fulfill({ status: 200, contentType: "text/css", body: process.env.DOM_CSS ? require("node:fs").readFileSync(process.env.DOM_CSS, "utf8") : "" });
    const record = { method: request.method(), path: url.pathname.replace(/^\/api\/v1/, ""), query: url.search.replace(/^\?/, ""), headers: request.headers(), body: request.postData() ? JSON.parse(request.postData()) : undefined };
    calls.push(record);
    const result = (await answer(record)) || { status: 404, json: { detail: { code: "NOT_FOUND", message: "no answer in the test" } } };
    return route.fulfill({ status: result.status ?? 200, contentType: "application/json", headers: { "access-control-allow-origin": ORIGIN, "access-control-allow-credentials": "true" }, body: JSON.stringify(result.json ?? {}) });
  });
  await page.goto(`${ORIGIN}/__dom`);
  await page.addScriptTag({ content: scriptOf(entry) });
  return { page, calls, errors };
}

module.exports = { launch, openPage, ORIGIN };
