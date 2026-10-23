// N13 #97: every <label> is tied to the field it names, so the accessible name of a field is its label and not
// its placeholder (student exam entry form, owner/admin/teacher settings, and every other form of the app).
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
require.extensions[".tsx"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};
const root = path.join(__dirname, "..");
const SRC = path.join(root, "src");
const src = (p) => path.join(SRC, p);

const CONTROLS = /^(input|select|textarea)$/;
const WRAPPABLE = /^(input|select|textarea|Input|Select|Textarea|DateInput|TimeInput|NumberInput|Checkbox|Radio)$/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function parse(file) {
  const text = fs.readFileSync(file, "utf8");
  return { text, sf: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) };
}

const tagOf = (node) => (ts.isJsxElement(node) ? node.openingElement : node).tagName.getText();
const attr = (opening, name) => opening.attributes.properties.find((a) => a.name && a.name.getText() === name);
const attrText = (opening, name) => {
  const a = attr(opening, name);
  if (!a) return null;
  if (!a.initializer) return "true";
  return ts.isJsxExpression(a.initializer) ? a.initializer.expression.getText() : a.initializer.getText().slice(1, -1);
};

/**
 * Facts about one file: every <label> (with what it points at), every id attribute, every plain control.
 * `where` is "file:line" for messages.
 */
function inspect(file) {
  const { sf } = parse(file);
  const rel = path.relative(SRC, file);
  const labels = [];
  const ids = new Set();
  const controls = [];
  const lineOf = (node) => `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  (function visit(node, insideLabel) {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    let inLabel = insideLabel;
    if (opening) {
      const tag = opening.tagName.getText();
      const id = attrText(opening, "id");
      if (id) ids.add(id);
      if (tag === "label") {
        inLabel = true;
        let wraps = false;
        (function inner(m) {
          const o = ts.isJsxElement(m) ? m.openingElement : ts.isJsxSelfClosingElement(m) ? m : null;
          if (o && WRAPPABLE.test(o.tagName.getText())) wraps = true;
          ts.forEachChild(m, inner);
        })(node);
        labels.push({ where: lineOf(node), htmlFor: attrText(opening, "htmlFor"), wraps });
      }
      if (CONTROLS.test(tag)) {
        controls.push({
          where: lineOf(node),
          tag,
          type: attrText(opening, "type"),
          id: attrText(opening, "id"),
          named: Boolean(attr(opening, "aria-label") || attr(opening, "aria-labelledby")),
          insideLabel: inLabel,
        });
      }
    }
    ts.forEachChild(node, (child) => visit(child, inLabel));
  })(sf, false);
  return { rel, labels, ids, controls };
}

// -------------------------------------------------------------------------------------------------------------

test("no <label> in the app is left hanging: each has htmlFor or wraps its control", () => {
  const hanging = [];
  for (const file of walk(SRC)) {
    for (const label of inspect(file).labels) {
      if (!label.htmlFor && !label.wraps) hanging.push(label.where);
    }
  }
  assert.deepEqual(hanging, [], `a <label> that names nothing (use htmlFor + id, wrap the control, or make it a <span>/<p>):\n${hanging.join("\n")}`);
});

test("every htmlFor points at an id that exists in the same file", () => {
  const dangling = [];
  for (const file of walk(SRC)) {
    const { labels, ids } = inspect(file);
    for (const label of labels) {
      // A label may take its id from a variable passed down by a parent (payments rows, payroll sheet): those files
      // keep the id and the htmlFor on the same expression, which this check compares textually.
      if (label.htmlFor && !ids.has(label.htmlFor)) dangling.push(`${label.where} htmlFor=${label.htmlFor}`);
    }
  }
  assert.deepEqual(dangling, [], dangling.join("\n"));
});

const GUARDED_PAGES = [
  "app/e/[code]/page.tsx",
  "app/owner/settings/page.tsx",
  "app/admin/settings/page.tsx",
  "app/teacher/settings/page.tsx",
  "app/admin/students/new/page.tsx",
  "app/owner/teachers/page.tsx",
  "components/ui/input.tsx",
];

test("on the guarded pages no text field is named by its placeholder alone", () => {
  const unnamed = [];
  for (const rel of GUARDED_PAGES) {
    const { controls, labels } = inspect(src(rel));
    // A control outside a wrapping <label> needs an aria-label/aria-labelledby or an id that some <label htmlFor> targets.
    const targets = new Set(labels.map((l) => l.htmlFor).filter(Boolean));
    for (const control of controls) {
      if (control.type && /hidden|radio|checkbox/.test(control.type)) continue;
      if (control.insideLabel || control.named) continue;
      if (!control.id) unnamed.push(`${control.where} (no id)`);
      else if (!targets.has(control.id)) unnamed.push(`${control.where} (id ${control.id} has no <label htmlFor>)`);
    }
  }
  assert.deepEqual([...new Set(unnamed)], []);
});

test("the settings pages: each form field has its own label with a matching id", () => {
  // Names the fields that used to carry only a placeholder; losing one of them fails here by name.
  const expected = {
    "app/owner/settings/page.tsx": [
      "owner-settings-nazvanie-organizatsii", "owner-settings-gorod", "owner-settings-telefon", // organisation
      "owner-settings-imya", "owner-settings-familiya", "owner-settings-yazyk-interfeysa", // profile
      "owner-settings-tekuschiy-parol", "owner-settings-novyy-parol", "owner-settings-povtorite-parol", // security
    ],
  };
  for (const [rel, ids] of Object.entries(expected)) {
    const text = fs.readFileSync(src(rel), "utf8");
    for (const id of ids) {
      assert.match(text, new RegExp(`htmlFor="${id}"`), `${rel}: no <label htmlFor="${id}">`);
      assert.match(text, new RegExp(`\\bid="${id}"`), `${rel}: no field id="${id}"`);
    }
  }
  const admin = inspect(src("app/admin/settings/page.tsx"));
  assert.equal(admin.controls.length, 6, "admin settings: three profile fields and three password fields");
  assert.equal(admin.labels.length, 6, "admin settings: a label for each field");
  for (const label of admin.labels) assert.ok(label.htmlFor && label.htmlFor.includes("uid"), `${label.where}: useId-based htmlFor`);
});

test("the student exam entry form takes its field names from the shared Input label, not from the placeholder", () => {
  const { text, sf } = parse(src("app/e/[code]/page.tsx"));
  const fields = [];
  (function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === "Input") {
      fields.push({ label: attrText(node, "label"), placeholder: attrText(node, "placeholder") });
    }
    ts.forEachChild(node, visit);
  })(sf);
  assert.deepEqual(fields.map((f) => f.label), ["Имя и фамилия", "ID ученика"]);
  assert.ok(fields.every((f) => f.placeholder), "placeholders stay as examples");
  assert.ok(/from "@\/components\/ui\/input"/.test(text));
  const input = inspect(src("components/ui/input.tsx"));
  assert.equal(input.labels.length, 1);
  assert.match(input.labels[0].htmlFor, /inputId/);
  assert.match(fs.readFileSync(src("components/ui/input.tsx"), "utf8"), /useId\(\)/);
});

test("Input renders a label whose for is the field's id; two fields never share an id", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { Input } = require(src("components/ui/input.tsx"));
  const html = renderToStaticMarkup(
    React.createElement(
      "form",
      null,
      React.createElement(Input, { label: "Имя и фамилия", placeholder: "Иван Иванов" }),
      React.createElement(Input, { label: "ID ученика", placeholder: "AL15-001" }),
      React.createElement(Input, { label: "Свой id", id: "custom-id" }),
    ),
  );
  const pairs = [...html.matchAll(/<label[^>]*\sfor="([^"]+)"[^>]*>([^<]+)<\/label>/g)].map((m) => [m[1], m[2]]);
  assert.equal(pairs.length, 3, html);
  assert.deepEqual(pairs.map((p) => p[1]), ["Имя и фамилия", "ID ученика", "Свой id"]);
  const inputIds = [...html.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(pairs.map((p) => p[0]), inputIds, "each label's for is the id of the input rendered after it");
  assert.equal(new Set(inputIds).size, 3);
  assert.equal(inputIds[2], "custom-id", "an explicit id is respected");
});

test("the excuse reason field is rendered once per student: ids from useId are unique", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { ExcuseReasonField } = require(src("components/attendance/excuse-reason-field.tsx"));
  const html = renderToStaticMarkup(
    React.createElement(
      "div",
      null,
      React.createElement(ExcuseReasonField, { value: "", onChange: () => {} }),
      React.createElement(ExcuseReasonField, { value: "", onChange: () => {} }),
    ),
  );
  const labelFor = [...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]);
  const inputIds = [...html.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(labelFor.length, 2);
  assert.deepEqual(labelFor, inputIds);
  assert.notEqual(inputIds[0], inputIds[1]);
});

test("a group of buttons is labelled as a group, not by a <label> that names no field", () => {
  const schedule = fs.readFileSync(src("app/teacher/schedule/page.tsx"), "utf8");
  for (const kind of ["add", "edit"]) {
    assert.match(schedule, new RegExp(`id="sched-${kind}-color-label"`));
    assert.match(schedule, new RegExp(`role="group" aria-labelledby="sched-${kind}-color-label"`));
  }
  const exams = fs.readFileSync(src("app/teacher/exams/new/page.tsx"), "utf8");
  assert.match(exams, /role="group" aria-labelledby="exam-new-duration-label"/);
  const invite = fs.readFileSync(src("app/owner/teachers/page.tsx"), "utf8");
  assert.match(invite, /role="radiogroup" aria-labelledby="owner-invite-role-label"/);
});
