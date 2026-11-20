// PAY-DUE 9.7 / 10.8 (replaces Money-2 fix 10Д): the red notice «N учеников с долгом …» is NOT drawn anywhere - not on the control panel, not on «Оплаты».  The same fact is in the card «Долг», the tab «Должники» and the badge of the menu.
// What the notice used to carry - keeping the summary of the money fresh - is done by the shell (the sidebar), and the badge reads the server's `debtors`.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..", "src");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(root).filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f) => fs.readFileSync(f, "utf8");

test("the notice, its component, its copy and its testid are gone from the source", () => {
  assert.ok(!fs.existsSync(path.join(root, "components/payments/payments-alert-banner.tsx")));
  assert.ok(!fs.existsSync(path.join(root, "lib/payments-banner.ts")));
  for (const file of files) {
    const text = read(file);
    for (const word of ["payments-alert-banner", "PaymentsAlertBanner", "bannerCopy", "debtBannerCopy", "waitingPeopleCount", "bannerShownOn", "bannerDismissed"]) assert.ok(!text.includes(word), `${path.relative(root, file)} still has ${word}`);
  }
});

test("the layouts of the owner and the administrator draw no notice; the summary is kept fresh in the shell (sidebar), the badge reads `debtors`", () => {
  for (const layout of ["app/owner/layout.tsx", "app/admin/layout.tsx"]) assert.ok(!/Payments/.test(read(path.join(root, layout))), layout);
  const sidebar = read(path.join(root, "components/layout/sidebar.tsx"));
  assert.match(sidebar, /usePaymentsSummarySync\(/);
  assert.match(sidebar, /state\.debtors \?\? 0/);
  assert.match(sidebar, /badgeLabel: "Должники"/);
});
