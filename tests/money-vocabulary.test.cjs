// The guard of the dictionary of «Деньги-1» (UX pack §1, LESSONS 109): the old words of money do not come back to a screen.  It reads EVERY file of `src` without its comments and fails on a phrase of
// the list - the same idea as the guard of the server (`tests/test_money_vocabulary.py`).  A new word of the screen goes through the dictionary (`artifacts/analysis/MONEY1_A_UX_PACK.md` §1), not into this list.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "src");
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)])).filter((file) => /\.(ts|tsx)$/.test(file));
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1")).join("\n");

const BANNED = [
  [/[Нн]езакрыт/, "«Уроки без отметки»"],
  [/Вернуть в разбор|Вернуть урок в разбор|Требует разбора|неразобран|ждёт разбора/, "«Вернуть на отметку», «Урок без отметки»"],
  [/закрыт ведомостью|закрыта ведомостью/, "«Месяц закрыт»"],
  [/Пересохран/, "«Сохранить новую сумму»"],
  [/с правом (на )?(оплат|деньги)|на оплаты\b/, "«с доступом к деньгам»"],
  [/Переплачено|Переплата/, "«Выплачено вперёд» / «Выплачено больше на …»"],
  [/Закрыла долг|Закроет долг|Закрыть долг/, "«Погашен долг», «Погасить долг»"],
  [/Покрытие|Цена периода:/, "«Оплачено до»; the receipt does not tell the price of the period"],
  [/Отметить выплату|Записать как аванс|записать как аванс/, "«Записать выплату», «Записать выплату вперёд»"],
  [/Что будет с деньгами|Что будет после сохранения|Что переедет/, "«Что изменится»"],
  [/Оплатить \/ Не оплачивать/, "«Включить в зарплату» / «Не включать»"],
];

test("the old words of money are not on any screen of src (outside the comments)", () => {
  const found = [];
  for (const file of files(root)) {
    const code = withoutComments(fs.readFileSync(file, "utf8"));
    for (const [pattern, instead] of BANNED) {
      const match = pattern.exec(code);
      if (match) found.push(`${path.relative(root, file)}: «${match[0]}» - say ${instead}`);
    }
  }
  assert.deepEqual(found, []);
});
