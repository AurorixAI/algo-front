// N13 P1.8 - «Ученики» on a phone: one card per student instead of a table that cuts names, IDs and search.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, "src", p), "utf8");
const tabs = require(path.join(root, "src/lib/students-tabs.ts"));
const { telHref } = require(path.join(root, "src/lib/phone.ts"));

test("the card's muted line reads «TE-010 · 7 класс», and tolerates a missing ID or class", () => {
  assert.equal(tabs.studentCardMeta("TE-010", 7).line, "TE-010 · 7 класс");
  assert.deepEqual(tabs.studentCardMeta("TE-010", 7), { id: "TE-010", classLabel: "7 класс", line: "TE-010 · 7 класс" });
  assert.equal(tabs.studentCardMeta(null, 9).line, "9 класс");
  assert.equal(tabs.studentCardMeta("  ", 9).id, "");
  assert.equal(tabs.studentCardMeta("AL15-001", undefined).line, "AL15-001");
  assert.equal(tabs.studentCardMeta(undefined, 0).line, "");
});

test("«ещё N» counts the groups besides the shown one", () => {
  assert.equal(tabs.extraGroupsLabel(2), "ещё 1");
  assert.equal(tabs.extraGroupsLabel(4), "ещё 3");
  for (const n of [1, 0, null, undefined]) assert.equal(tabs.extraGroupsLabel(n), "", String(n));
});

test("the phone on a card is a tel: link, a non-number is not", () => {
  assert.equal(telHref("+998 90 123 45 67"), "tel:+998901234567");
  assert.equal(telHref("90 123-45-67"), "tel:901234567");
  assert.equal(telHref("—"), null);
  assert.equal(telHref(""), null);
});

test("the list shows cards below xl and the table from xl, with one pager and the P1.7 states kept", () => {
  const page = read("components/students/students-list-view.tsx");
  assert.match(page, /<ul className="grid gap-2\.5 lg:grid-cols-2 xl:hidden">/);        // cards
  assert.match(page, /className="hidden overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm xl:block"/); // table
  assert.match(page, /href=\{phoneLink\}/);                                              // tel: link
  assert.match(page, /Скопировать ID \$\{meta\.id\}/);                                   // tap on the ID copies
  assert.equal((page.match(/\{pager\}/g) || []).length, 2);                              // under the cards and inside the table frame
  assert.match(page, /group\/id inline-flex items-center gap-1\.5 whitespace-nowrap/);                // the table ID chip never breaks at «TE-»
  assert.match(page, /const PAGE_SIZE = 50;/);
  assert.match(page, /Не удалось загрузить список учеников/);                            // error state (P1.7)
  assert.match(page, /role="status" aria-label="Загрузка списка"/);                      // refreshing state (P1.7)
  assert.match(page, /Все ученики распределены по группам/);
});

test("on a phone the toolbar rows never cut text: search on its own row, tabs full width, import never shrinks", () => {
  const page = read("components/students/students-list-view.tsx");
  assert.match(page, /className="relative w-full sm:max-w-sm sm:flex-1"/);              // search: own row on a phone
  assert.match(page, /<div className="flex flex-wrap items-center gap-2 md:gap-3">/);    // filter wraps under it
  assert.match(page, /role="tablist"[^>]*className="flex w-full overflow-x-auto/);        // tabs: full width on a phone
  assert.match(page, /<ImportButton variant="solid" onImported=\{loadAll\} className="shrink-0 whitespace-nowrap" \/>/);
  assert.match(page, /<div className="min-w-0">\s*<h1/);                                  // the title may shrink
  const filter = read("components/ui/cascading-filter.tsx");
  assert.match(filter, /relative inline-block max-w-full/);                               // a long group name truncates
  assert.match(filter, /<span className="min-w-0 truncate">\{getActiveFilterLabel\(\)\}<\/span>/);
});
