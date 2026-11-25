// Money-2 wave 2: the common start of the DOM tests (the CSS once, one browser) and the small helpers.
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./dom-page.cjs");
const F = require("./money2-fixture.cjs");

const root = path.join(__dirname, "..", "..");
function setup(test) {
  const ctx = { browser: null };
  test.before(async () => {
    const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
    execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
    process.env.DOM_CSS = css;
    ctx.browser = await launch();
  });
  test.after(async () => { await ctx.browser.close(); });
  return ctx;
}
const plain = (text) => String(text ?? "").replace(/[\s ]+/g, " ").trim();
const isDry = (request) => /dry_run=true/.test(request.query);
/** Opens the page of `money2.entry.tsx`, mounts `name` and returns the run (`page`, `calls`, `errors`). */
async function mount(ctx, answer, name, user, props, width = 1280, { today = null } = {}) {
  const run = await openPage(ctx.browser, "money2.entry.tsx", answer, { width, height: width === 375 ? 800 : 900, today });
  await run.page.evaluate(([n, u, p]) => window.mount(n, u, p), [name, user ?? { role: "owner", org_role: "owner" }, props ?? {}]);
  return run;
}
const OWNER = { role: "owner", org_role: "owner" };
const ADMIN = { role: "admin", org_role: "admin" };
module.exports = { setup, plain, isDry, mount, F, OWNER, ADMIN };
