// Money-2 fix 10 (дополнение В): «К оплате сразу» - the old words are gone from src/, the «?» text is the corrected one (the sum is not called a debt).
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const SRC = walk(path.join(__dirname, "..", "src")).filter((f) => /\.(tsx?|css)$/.test(f));

test("no old phrases in src/", () => {
  const bad = /Сразу начислится|начислится ещё|уход отменён|уход отменяется|(?<!Вернули )в день ухода|Возврат обычный|Остатки с прошлого раза|Сразу ничего не начислится/;
  const hits = SRC.filter((f) => bad.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(hits, []);
});

test("the «?» text of «К оплате сразу»: base sentence, rounding only for an incomplete month, the same-group line only with a stay in this group", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "pay-from.ts"), "utf8");
  assert.ok(src.includes("Стоимость уроков с даты «Оплата с» до конца оплачиваемого периода — её ученик платит сейчас."));
  assert.ok(src.includes("opts.rounded ?") && src.includes("Неполный месяц округляется до 1\\u00a0000\\u00a0сум."));
  assert.ok(src.includes("opts.sameGroup ?") && src.includes("Долг или аванс с прошлого раза сюда не входит — он показан ниже."));
  const sentence = /immediateHint[\s\S]*?\n}/.exec(src)[0];
  assert.ok(!/Столько ученик должен|в его долге/.test(sentence), "the sum is not a debt");
});
