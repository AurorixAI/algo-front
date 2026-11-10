// Shared by the display tests of «Деньги-1 / В»: the page with the project's CSS, the helpers of the server answers.
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./dom-page.cjs");

const root = path.join(__dirname, "..", "..");

async function start() {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  return launch();
}

const plain = (text) => String(text ?? "").replace(/[\s ]+/g, " ").trim();
const conflict = (code, message, extra = {}) => ({ status: 409, json: { detail: { code, message, ...extra } } });
const invalid = (code, message, extra = {}) => ({ status: 422, json: { detail: { code, message, ...extra } } });
const ROW = { membership_id: "m1", student_id: "st1", student_name: "Иванов Иван", group_id: "g1", group_name: "7-А Алгебра", is_primary: true, is_active: true, status: "ok", debt: 350000, refundable: 344000 };

async function open(browser, entry, name, { width = 1280, user, props, server } = {}) {
  const run = await openPage(browser, entry, server, { width, height: 900 });
  await run.page.evaluate(([n, u, p]) => window.mount(n, u, p), [name, user, props]);
  return run;
}

module.exports = { start, plain, conflict, invalid, ROW, open, root };
