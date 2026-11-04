// What the server answers in the DOM tests of money: the shapes are the server's own fixtures (tests/fixtures/pay2), never made up here.
const fs = require("node:fs");
const path = require("node:path");

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "pay2", `${name}.json`), "utf8"));
const OWNER_EFFECTS = {
  students: [{ studentId: "st1", name: "Иванов Иван", delta: -1 }],
  payroll: [{ month: "2026-10", state: "open", sheetId: "sh1", teacherId: "t1", teacherName: "Каримова К.", savedTotal: 475000, paid: 475000, freshBefore: 475000, freshAfter: 425000, freshTotal: 425000, changedBy: -50000, driftAfter: -50000 }],
  text: "…", dryRun: true,
};
const EMPTY_EFFECTS = { students: [], payroll: [], text: "", dryRun: true };

/** A promise the test opens when it wants the server to answer: `const hold = deferred(); … await hold.promise; … hold.open()`. */
function deferred() {
  let open;
  const promise = new Promise((resolve) => { open = resolve; });
  return { promise, open };
}

module.exports = { fixture, OWNER_EFFECTS, EMPTY_EFFECTS, deferred };
