// A tiny bundler for the tests that need a REAL DOM (the events of a portal, the hooks that ask the server): it compiles TypeScript on the fly, follows the `require`s of the
// entry (the project, `@/`, packages from node_modules) and returns ONE script for a page of headless Chromium.  No jsdom in the project, no webpack: ~60 lines.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.join(__dirname, "..", "..");
const EXT = [".ts", ".tsx", ".js", ".cjs", ".json"];
// the router of Next is not part of what these tests look at: a link is a link, the router does nothing
const STUBS = {
  "next/link": path.join(__dirname, "dom-stubs", "next-link.js"),
  "next/navigation": path.join(__dirname, "dom-stubs", "next-navigation.js"),
  "next/image": path.join(__dirname, "dom-stubs", "next-image.js"),
};

function tryFile(base) {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXT) if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return base + ext;
  for (const ext of EXT) { const index = path.join(base, "index" + ext); if (fs.existsSync(index)) return index; }
  return null;
}

function resolve(from, request) {
  if (STUBS[request]) return STUBS[request];
  if (request.startsWith("@/")) return tryFile(path.join(root, "src", request.slice(2)));
  if (request.startsWith(".") || path.isAbsolute(request)) return tryFile(path.resolve(path.dirname(from), request));
  return require.resolve(request, { paths: [path.dirname(from), root] });
}

function compile(file, source) {
  if (/\.(ts|tsx)$/.test(file)) {
    return ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  }
  if (file.endsWith(".json")) return `module.exports = ${source};`;
  return source;
}

/** The script of the entry file and of everything it needs. */
function bundle(entry) {
  const ids = new Map();
  const modules = [];
  const visit = (file) => {
    if (ids.has(file)) return ids.get(file);
    const id = modules.length;
    ids.set(file, id);
    const entryRecord = { file, code: "", deps: {} };
    modules.push(entryRecord);
    entryRecord.code = compile(file, fs.readFileSync(file, "utf8"));
    const requests = new Set([...entryRecord.code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]));
    for (const request of requests) {
      if (/^(node:)?(fs|path|os|crypto|stream|util|events|http|https|zlib|url|net|tls|child_process|buffer)$/.test(request)) { entryRecord.deps[request] = -1; continue; }
      const target = resolve(file, request);
      if (!target) throw new Error(`dom-bundle: cannot resolve "${request}" from ${file}`);
      entryRecord.deps[request] = visit(target);
    }
    return id;
  };
  visit(path.resolve(entry));
  return `(function(){var process=window.process={env:{NODE_ENV:"development"},browser:true,cwd:function(){return"/"}};var table=[${modules.map((record) => `[function(module,exports,require,process){${record.code}\n},${JSON.stringify(record.deps)}]`).join(",\n")}];var cache={};function load(id){if(cache[id])return cache[id].exports;var module=cache[id]={exports:{}};var entry=table[id];entry[0].call(module.exports,module,module.exports,function(request){var dep=entry[1][request];if(dep===-1)return{};if(dep===undefined)throw new Error("missing "+request);return load(dep)},process);return module.exports}load(0)})();`;
}

module.exports = { bundle, root };
