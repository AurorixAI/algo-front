#!/usr/bin/env node
/**
 * `npm run test:display` for CI: the same run, plus a GitHub annotation `::error title=display test::<name>` for every `not ok` line of the TAP
 * output (annotations are visible without signing in), with the first lines of the failure (location, error) in the annotation.  The exit code is the run's own.
 */
const { spawn } = require("node:child_process");

const child = spawn("npm", ["run", "test:display"], { stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32" });
let buffer = "";
const lines = [];
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  buffer += chunk.toString("utf8");
  const parts = buffer.split("\n");
  buffer = parts.pop() ?? "";
  lines.push(...parts);
});
child.on("close", (code) => {
  if (buffer) lines.push(buffer);
  const esc = (text) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  let shown = 0;
  lines.forEach((line, index) => {
    const failed = /^(\s*)not ok \d+ - (.*)$/.exec(line);
    if (!failed) return;
    const indent = failed[1].length;
    // the details of the failure: the YAML block under the line (location, error), at most 3 lines
    const details = [];
    for (let i = index + 1; i < lines.length && details.length < 3; i += 1) {
      const next = lines[i];
      if (/^\s*(not ok|ok) \d+ - /.test(next) || /^\s*# Subtest/.test(next)) break;
      const text = next.trim();
      if (text && !/^(---|\.\.\.)$/.test(text) && !/^(duration_ms|type|failureType|code|name|stack):/.test(text)) details.push(text.slice(0, 220));
    }
    if (indent === 0 || shown < 50) {
      console.log(`::error title=display test::${esc([failed[2].trim(), ...details].join(" | "))}`);
      shown += 1;
    }
  });
  // the "spec" reporter (Node 23+ and a terminal): the summary «✖ failing tests:» lists each failure as «test at file:line» / «✖ name (ms)» / the message
  if (shown === 0) {
    const start = lines.findIndex((line) => /^✖ failing tests:/.test(line));
    for (let i = start < 0 ? lines.length : start + 1; i < lines.length; i += 1) {
      const named = /^✖ (.*?)( \([\d.]+ms\))?$/.exec(lines[i]);
      if (!named) continue;
      const where = /^test at (.*)$/.exec(lines[i - 1] ?? "");
      const details = [];
      for (let j = i + 1; j < lines.length && details.length < 3; j += 1) {
        const text = lines[j].trim();
        if (!text || /^(test at |✖ )/.test(text)) break;
        if (!/^at /.test(text)) details.push(text.slice(0, 220));
      }
      console.log(`::error title=display test::${esc([named[1], where ? `location: ${where[1]}` : "", ...details].filter(Boolean).join(" | "))}`);
      shown += 1;
    }
  }
  if (code && shown === 0) console.log(`::error title=display test::npm run test:display exited with code ${code} (no 'not ok' line: a test file crashed)`);
  process.exit(code ?? 1);
});
