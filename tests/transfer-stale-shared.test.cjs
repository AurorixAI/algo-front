// PAY-TAILS Б8.3: the refusal BALANCE_CHANGED of a transfer is answered by ONE shared hook (`useTransferStale`) at every screen that opens the transfer;
// no screen keeps its own copy of the handler, and no screen opens the transfer without it.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "src");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(root).filter((f) => /\.tsx$/.test(f));
const openers = files.filter((f) => fs.readFileSync(f, "utf8").includes("<AssignGroupModal"));

test("every screen that opens the transfer gives it `onStale`", () => {
  assert.equal(openers.length, 4, openers.join("\n"));
  for (const file of openers) {
    const source = fs.readFileSync(file, "utf8");
    const tag = source.slice(source.indexOf("<AssignGroupModal"), source.indexOf("/>", source.indexOf("<AssignGroupModal")));
    assert.match(tag, /onStale=/, `${path.relative(root, file)} opens the transfer without onStale`);
  }
});

test("the group, its archive and the diagnostic report use the shared hook; no inline copy of the handler", () => {
  const shared = openers.filter((f) => /group-detail-view|group-archive-dialog|report[\\/]page/.test(f));
  assert.equal(shared.length, 3);
  for (const file of shared) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /useTransferStale\(/, path.relative(root, file));
    assert.match(source, /onStale=\{onTransferStale\}/, path.relative(root, file));
  }
});
