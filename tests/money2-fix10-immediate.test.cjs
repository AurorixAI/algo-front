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

test("the «?» text of «К оплате сразу» is gone from src/ (the mock-up of 19.11 has no «?» in the windows): no sentence, no function", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "pay-from.ts"), "utf8");
  assert.ok(!src.includes("immediateHint") && !src.includes("Стоимость уроков с даты «Оплата с»") && !src.includes("Неполный месяц округляется"));
  assert.ok(!src.includes("Долг или аванс с прошлого раза сюда не входит"), "the debt is a row of its own, the sum is not explained by a sentence");
});
