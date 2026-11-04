// «Деньги-1», пакет А (front): the environment of the tests of the new screens - TypeScript on the fly, the `@/` alias, `next/*` stand-ins and a Modal that draws its content inline
// (the real one is a portal), so a dialog can be rendered on the server and READ like a person reads it.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");

const root = path.join(__dirname, "..", "..");
const compile = (jsx) => (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText, filename);
};
require.extensions[".ts"] = compile(false);
require.extensions[".tsx"] = compile(true);

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) {
    const inRoot = path.join(root, "src", request.slice(2));
    const candidates = [inRoot, `${inRoot}.ts`, `${inRoot}.tsx`, path.join(inRoot, "index.ts"), path.join(inRoot, "index.tsx")];
    request = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? inRoot;
  }
  return resolveFilename.call(this, request, ...rest);
};

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const router = { push() {}, replace() {}, back() {} };
const navigation = { useRouter: () => router, usePathname: () => "/owner/payroll", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) };

/** The dialog of the project is a portal; here it is a box with the same title, description, body and footer, drawn only while `open`. */
function Modal({ open, title, description, children, footer }) {
  if (!open) return null;
  return React.createElement("div", { role: "dialog", "aria-label": title },
    React.createElement("h2", null, title),
    description ? React.createElement("p", { "data-description": "" }, description) : null,
    React.createElement("div", { "data-body": "" }, children),
    React.createElement("div", { "data-footer": "" }, footer));
}

// The store of the signed-in user: a server render reads zustand's INITIAL state (no user), so the components of the project that ask «who is this» are given a store whose state the test sets.
let authState = { user: null, isAuthenticated: false };
const fakeAuthStore = Object.assign((selector) => (selector ? selector(authState) : authState), {
  getState: () => authState,
  setState: (patch) => { authState = { ...authState, ...(typeof patch === "function" ? patch(authState) : patch) }; },
  subscribe: () => () => {},
});

const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === "next/navigation") return navigation;
  if (request === "@/components/ui/modal") return { Modal };
  if (request === "@/lib/store") return { ...load.call(this, request, ...rest), useAuthStore: fakeAuthStore };
  return load.call(this, request, ...rest);
};

const html = (element) => renderToStaticMarkup(element);
const plain = (value) => String(value).replace(/[  ]/g, " ");
const textOf = (markup) => plain(markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
const lib = (name) => require(path.join(root, "src/lib", name));
const component = (name) => require(path.join(root, "src/components", name));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const fixture = (dir, name) => JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures", dir, `${name}.json`), "utf8"));
const named = (dir, prefix) => fixture(dir, fs.readdirSync(path.join(root, "tests/fixtures", dir)).find((file) => file.startsWith(prefix)).replace(/\.json$/, ""));

/** The signed-in user of the store: `payments_access` is the money right of an administrator. */
function signIn(extra = {}) {
  fakeAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", role: "admin", org_role: "admin", ...extra }, isAuthenticated: true });
}

module.exports = { root, React, html, plain, textOf, lib, component, read, fixture, named, signIn, Modal };
