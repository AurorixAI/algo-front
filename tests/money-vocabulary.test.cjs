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

test("between a number and «сум» there is a NON-BREAKING space in every sentence and every card of src (a sum never breaks before its unit)", () => {
  const found = [];
  for (const file of files(root)) {
    const code = withoutComments(fs.readFileSync(file, "utf8"));
    code.split("\n").forEach((line, index) => {
      if (/[0-9}] сум|<[a-z]+[^>]*> сум</.test(line) || /> сум</.test(line)) found.push(`${path.relative(root, file)}:${index + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(found, [], "write the unit as a no-break space (U+00A0) or build the sum with formatMoney");
});

test("no word of a screen mixes Cyrillic and Latin letters (a Latin «K» in «Эргашев K.» would be a typo that looks right)", () => {
  const found = [];
  for (const file of files(root)) {
    if (/math-renderer|answer-match/.test(file)) continue;        // the Latin/Cyrillic pairs of a formula and of a typed answer are on purpose
    const code = withoutComments(fs.readFileSync(file, "utf8"));
    code.split("\n").forEach((line, index) => {
      const hit = /[А-Яа-яЁё][A-Za-z]|[A-Za-z][А-Яа-яЁё]/.exec(line);
      if (hit) found.push(`${path.relative(root, file)}:${index + 1}: «${hit[0]}»`);
    });
  }
  assert.deepEqual(found, []);
});
