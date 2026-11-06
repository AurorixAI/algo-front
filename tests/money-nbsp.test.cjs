// Re-audit В5 / §5.1-четв: a sum from a sentence of the SERVER never breaks inside «360 000 сум».  ONE function (`tidyMoneyText`), used where server text enters: errors, effects, transfer sentences, archive, toasts.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
};
const root = path.join(__dirname, "..");
const F = require(path.join(root, "src/lib/money-format.ts"));
const NB = " ";

test("digit groups, «сум» and a surname with its initial get non-breaking spaces; nothing else changes", () => {
  assert.equal(F.tidyMoneyText("аванс останется 360 000 сум."), `аванс останется 360${NB}000${NB}сум.`);
  assert.equal(F.tidyMoneyText("Долг 1 200 000 сум"), `Долг 1${NB}200${NB}000${NB}сум`);
  assert.equal(F.tidyMoneyText("(было 475 000, станет 425 000)"), `(было 475${NB}000, станет 425${NB}000)`);
  assert.equal(F.tidyMoneyText("Мирзаева Л. и Каримова К."), `Мирзаева${NB}Л. и Каримова${NB}К.`);
  assert.equal(F.tidyMoneyText("3 урока, 12 учеников, 2026 год"), "3 урока, 12 учеников, 2026 год", "small numbers keep their spaces");
  assert.equal(F.tidyMoneyText(`1 200 000 сум`), `1${NB}200${NB}000${NB}сум`, "a narrow no-break space of a server joins too");
  assert.equal(F.tidyMoneyText(""), "");
  assert.equal(F.tidyMoneyText(null), null);
  assert.equal(F.tidyMoneyText(F.tidyMoneyText("640 000 сум")), `640${NB}000${NB}сум`, "idempotent");
});

test("the places where the server's text enters use it: errors, the block of effects, the sentences of a transfer, the consequence of an archive, the toast", () => {
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  assert.match(read("src/lib/error-body.ts"), /tidyMoneyText\(parsed\.message\)/);
  assert.match(read("src/lib/money-effects.ts"), /text: tidyMoneyText\(str\(source\.text\)\)/);
  assert.match(read("src/lib/dry-run.ts"), /tidyMoneyText\(message\)/);
  assert.match(read("src/lib/group-archive.ts"), /cancelConsequence: missed \? tidyMoneyText\(/);
  assert.match(read("src/components/ui/toast.tsx"), /text: tidyMoneyText\(text\)/);
  assert.match(read("src/components/ui/confirm-host.tsx"), /tidyMoneyText\(shown\.message\)/);
});
