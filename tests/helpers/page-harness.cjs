// WE-E: a tiny React renderer for BEHAVIOUR tests of whole screens (no DOM, no jsdom in this repo).
//  - hooks (state / ref / memo / effect with cleanup / ...) live in slots of one instance per component PATH;
//  - function components are expanded into host nodes ({tag, props, children}); a component listed in `opaque` is kept as a leaf with its props
//    (a test reads e.g. the `groups` of the «⋯» menu from them);
//  - a state change re-renders the whole tree on a microtask; effects run after a render in order, a changed dependency runs the cleanup first;
//  - `act(fn)` calls an event handler of a node and settles the promises it started.
// The code under test is the real file of the screen: only the platform (DOM, router, the animation library, the network, the clock) is replaced.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.join(__dirname, "..", "..");
const realReact = require("react");

// ── transpile .ts/.tsx on require ────────────────────────────────────────────────────────────────
const transpile = (source, jsx) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
}).outputText;
// MUTATIONS: a test may change the text of one source file for the modules loaded while it runs (`withMutation`) - the same scenario must then fail
const mutations = new Map();
const sourceOf = (filename) => {
  const text = fs.readFileSync(filename, "utf8");
  const mutate = mutations.get(filename);
  return mutate ? mutate(text) : text;
};
require.extensions[".ts"] = (mod, filename) => mod._compile(transpile(sourceOf(filename), false), filename);
require.extensions[".tsx"] = (mod, filename) => mod._compile(transpile(sourceOf(filename), true), filename);
const resetAppModules = () => { for (const key of Object.keys(require.cache)) if (key.startsWith(path.join(root, "src"))) delete require.cache[key]; };
/** withMutation("src/lib/x.ts", (source) => source.replace(...), async () => { ...create the world and mount the screen here... }) */
async function withMutation(relative, mutate, run) {
  const filename = path.join(root, relative);
  mutations.set(filename, (source) => { const out = mutate(source); if (out === source) throw new Error(`the mutation did not change ${relative}`); return out; });
  resetAppModules();
  try { return await run(); } finally { mutations.delete(filename); resetAppModules(); }
}

// ── the platform: clock, window, document ───────────────────────────────────────────────────────
const RealDate = Date;
let fixedNow = null;
class FakeDate extends RealDate {
  constructor(...args) { if (args.length === 0 && fixedNow !== null) super(fixedNow); else super(...args); }
  static now() { return fixedNow !== null ? fixedNow : RealDate.now(); }
}
/** setNow("2026-11-04T12:30:00+05:00"): the clock of every screen (Tashkent wall time) */
function setNow(iso) { fixedNow = iso === null ? null : new RealDate(iso).getTime(); global.Date = iso === null ? RealDate : FakeDate; }

const noop = () => undefined;
const realSetInterval = global.setInterval;
global.setInterval = (...args) => { const timer = realSetInterval(...args); if (timer && timer.unref) timer.unref(); return timer; };
const listeners = new Map();                       // "type" -> Set<handler>: window and document share one bus (enough for the keyboard)
const addListener = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); };
const removeListener = (type, fn) => { listeners.get(type)?.delete(fn); };
const platform = {
  addEventListener: addListener, removeEventListener: removeListener, setInterval: () => 1, clearInterval: noop,
  setTimeout: (fn) => 1, clearTimeout: noop,
  location: { search: "", pathname: "/", href: "http://localhost/" },
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  innerWidth: 1280, scrollTo: noop, scrollY: 0, getComputedStyle: () => ({ paddingRight: "0", overflow: "visible" }), requestAnimationFrame: noop, cancelAnimationFrame: noop,
};
global.window = platform;
global.document = { createElement: () => ({ style: {}, setAttribute: noop }), body: { appendChild: noop, removeChild: noop, style: {} }, documentElement: { style: {}, clientWidth: 1280 }, visibilityState: "visible", addEventListener: addListener, removeEventListener: removeListener, getElementById: () => null, querySelector: () => null };
global.fetch = async (url) => { throw new Error(`unmocked network: ${url}`); };

// ── hooks ───────────────────────────────────────────────────────────────────────────────────────
let instance = null;
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
function slot(initFn) {
  const inst = instance;
  const i = inst.cursor++;
  if (!(i in inst.slots)) inst.slots[i] = initFn();
  return [inst, i];
}
const effectHook = (fn, deps) => {
  const inst = instance;
  const i = inst.cursor++;
  const prev = inst.slots[i];
  if (prev && deps && sameDeps(prev.deps, deps)) return;
  inst.effects.push(() => {
    if (prev && prev.cleanup) prev.cleanup();
    const cleanup = fn();
    inst.slots[i] = { deps, cleanup: typeof cleanup === "function" ? cleanup : null };
  });
  if (!prev) inst.slots[i] = { deps: null, cleanup: null };
};
const harnessReact = {
  ...realReact,
  useState(initial) {
    const [inst, i] = slot(() => (typeof initial === "function" ? initial() : initial));
    return [inst.slots[i], (value) => {
      const next = typeof value === "function" ? value(inst.slots[i]) : value;
      if (Object.is(next, inst.slots[i])) return;
      inst.slots[i] = next;
      inst.world.lastWriters.push(`${inst.id}#${i}`);
      inst.world.schedule();
    }];
  },
  useReducer(reducer, initial, init) {
    const [inst, i] = slot(() => (init ? init(initial) : initial));
    return [inst.slots[i], (action) => { inst.slots[i] = reducer(inst.slots[i], action); inst.world.schedule(); }];
  },
  useRef(initial) { const [inst, i] = slot(() => ({ current: initial })); return inst.slots[i]; },
  useCallback(fn, deps) {
    const [inst, i] = slot(() => ({ fn, deps }));
    const prev = inst.slots[i];
    if (!sameDeps(prev.deps, deps)) inst.slots[i] = { fn, deps };
    return inst.slots[i].fn;
  },
  useMemo(fn, deps) {
    const [inst, i] = slot(() => ({ value: fn(), deps }));
    const prev = inst.slots[i];
    if (!sameDeps(prev.deps, deps)) inst.slots[i] = { value: fn(), deps };
    return inst.slots[i].value;
  },
  useEffect: effectHook,
  useLayoutEffect: effectHook,
  useInsertionEffect: effectHook,
  useImperativeHandle: noop,
  useDebugValue: noop,
  useId() { const [inst, i] = slot(() => `:r${Math.random().toString(36).slice(2, 7)}:`); return inst.slots[i]; },
  useContext(context) { return context._currentValue; },
  useDeferredValue: (value) => value,
  useTransition: () => [false, (fn) => fn()],
  useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
};

// ── module resolution of the platform pieces ────────────────────────────────────────────────────
const mocks = new Map();
const stubComponent = (tag) => (props) => realReact.createElement(tag, props);
const motionProxy = new Proxy({}, { get: (_, tag) => {
  const component = (props) => {
    const { initial, animate, exit, transition, whileHover, whileTap, layout, variants, ...rest } = props;
    return realReact.createElement(String(tag), rest);
  };
  Object.defineProperty(component, "name", { value: `motion.${String(tag)}` });
  return component;
} });
const iconProxy = new Proxy({}, { get: (_, name) => (name === "__esModule" ? false : () => null) });
const realLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === "react") return harnessReact;
  if (request === "react-dom") return { createPortal: (children) => children, flushSync: (fn) => fn() };
  if (request === "framer-motion") return { motion: motionProxy, AnimatePresence: ({ children }) => children ?? null };
  if (request === "lucide-react") return iconProxy;
  if (request === "next/link") return { __esModule: true, default: (props) => realReact.createElement("a", props) };
  if (request === "next/navigation") return { useRouter: () => ({ push: noop, replace: noop, back: noop, refresh: noop }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() };
  if (request.startsWith("@/")) request = path.join(root, "src", request.slice(2));
  if (request === path.join(root, "src", "lib/scroll-lock")) return { lockScroll: () => noop, scrollLockCount: () => 0, browserEnv: () => null, isIosEnv: () => false, scrollbarWidth: () => 0 };
  if (mocks.has(request)) return mocks.get(request);
  return realLoad.call(this, request, parent, ...rest);
};
/** mock("@/lib/store", exports): replaces a module of the app for every screen loaded afterwards */
function mock(spec, exports) { mocks.set(spec.startsWith("@/") ? path.join(root, "src", spec.slice(2)) : spec, exports); }

// ── the renderer ────────────────────────────────────────────────────────────────────────────────
const FRAGMENT = Symbol.for("react.fragment");
const nameOf = (type) => (typeof type === "function" ? type.displayName || type.name : typeof type === "string" ? type : String(type?.displayName || type?.type?.name || type?.render?.name || "Anonymous"));

function createWorld(Component, props, options = {}) {
  const opaque = new Set(options.opaque || []);
  const world = { instances: new Map(), dirty: false, tree: null, renders: 0, errors: [], lastWriters: [] };
  world.schedule = () => {
    if (world.dirty) return;
    world.dirty = true;
    queueMicrotask(() => { if (world.dirty) world.render(); });
  };

  function expand(node, key, effects) {
    if (node === null || node === undefined || typeof node === "boolean") return [];
    if (typeof node === "string" || typeof node === "number") return [String(node)];
    if (Array.isArray(node)) return node.flatMap((child, i) => expand(child, `${key}/${child && child.key != null ? child.key : i}`, effects));
    const { type } = node;
    const props = node.props || {};
    if (type === FRAGMENT) return expand(props.children, key, effects);
    if (typeof type === "string") return [{ tag: type, props, children: expand(props.children, `${key}>${type}`, effects) }];
    if (typeof type === "object" && type !== null) {
      if (type.$$typeof === Symbol.for("react.memo")) return expand({ ...node, type: type.type }, key, effects);
      if (type.$$typeof === Symbol.for("react.forward_ref")) return expand({ ...node, type: (p) => type.render(p, null) }, key, effects);
      return expand(props.children, key, effects);
    }
    if (typeof type !== "function") return [];
    const name = nameOf(type);
    if (opaque.has(name)) return [{ tag: name, props, children: [], opaque: true }];
    const id = `${key}/${name}`;
    let inst = world.instances.get(id);
    if (!inst) { inst = { slots: [], cursor: 0, effects: [], world, id }; world.instances.set(id, inst); }
    inst.cursor = 0;
    inst.effects = effects;
    instance = inst;
    let out;
    try { out = type(props); } catch (error) { instance = null; world.errors.push({ name, error }); return [{ tag: name, props, children: [], failed: true }]; }
    instance = null;
    return [{ tag: name, props, component: true, children: expand(out, id, effects) }];
  }

  world.render = () => {
    for (let guard = 0; guard < 50; guard += 1) {
      world.dirty = false;
      world.renders += 1;
      if (world.renders > 400) throw new Error(`too many renders; last state writers: ${world.lastWriters.slice(-6).join(", ")}`);
      const effects = [];
      world.tree = { tag: "#root", props: {}, children: expand(realReact.createElement(Component, props), "", effects) };
      for (const run of effects) run();
      if (!world.dirty) return;
    }
    throw new Error("render loop: the screen does not settle");
  };
  world.render();
  return world;
}

// ── queries and events ──────────────────────────────────────────────────────────────────────────
const textOf = (node) => (typeof node === "string" ? node : node.children.map(textOf).join(""));
function findAll(node, predicate, out = []) {
  if (typeof node === "string") return out;
  if (predicate(node)) out.push(node);
  for (const child of node.children) findAll(child, predicate, out);
  return out;
}
const flat = (text) => text.replace(/\s+/g, " ").trim();

function screen(Component, props, options) {
  const world = createWorld(Component, props, options);
  const api = {
    world,
    get tree() { return world.tree; },
    /** a component that threw while rendering is a failed test (it used to leave an empty node and let «no button» assertions pass for nothing) */
    check() { if (world.errors.length) throw new Error(`render error in ${world.errors[0].name}: ${world.errors[0].error && world.errors[0].error.stack}`); },
    /** all the text of the screen, one line, collapsed spaces */
    text: () => flat(textOf(world.tree)),
    has: (re) => (re instanceof RegExp ? re.test(api.text()) : api.text().includes(re)),
    all: (predicate) => findAll(world.tree, predicate),
    /** the elements whose OWN visible text matches (buttons by default) */
    buttons: (re) => findAll(world.tree, (n) => n.tag === "button" && (re instanceof RegExp ? re.test(flat(textOf(n))) : flat(textOf(n)).includes(re))),
    button(re) { const found = api.buttons(re); if (found.length !== 1) throw new Error(`expected one button ${re}, found ${found.length}; the screen says: ${api.text().slice(0, 600)}`); return found[0]; },
    /** the first element with an onClick whose text matches (a card is a div with onClick) */
    clickable(re) {
      const found = findAll(world.tree, (n) => typeof n.props.onClick === "function" && (re instanceof RegExp ? re.test(flat(textOf(n))) : flat(textOf(n)).includes(re)));
      if (found.length === 0) throw new Error(`nothing clickable ${re}`);
      return found.sort((a, b) => textOf(a).length - textOf(b).length)[0];       // the innermost: a card, not the list that holds it
    },
    hasButton: (re) => api.buttons(re).length > 0,
    opaque: (name) => findAll(world.tree, (n) => n.opaque && n.tag === name),
    async settle(ticks = 6) {
      for (let i = 0; i < ticks; i += 1) { await new Promise((resolve) => setImmediate(resolve)); if (world.dirty) world.render(); }
      api.check();
    },
    async click(nodeOrRe) {
      const node = nodeOrRe && typeof nodeOrRe === "object" && "props" in nodeOrRe ? nodeOrRe : api.button(nodeOrRe);
      if (node.props.disabled) return false;
      const handler = node.props.onClick;
      if (typeof handler !== "function") throw new Error(`no onClick on ${node.tag}`);
      const result = handler({ preventDefault: noop, stopPropagation: noop, target: node, currentTarget: node });
      if (world.dirty) world.render();
      await result;
      await api.settle();
      return true;
    },
    /** a key on the window (Escape closes the panel) */
    async press(key) { for (const fn of [...(listeners.get("keydown") || [])]) fn({ key, preventDefault: noop, stopPropagation: noop, target: {} }); if (world.dirty) world.render(); await api.settle(); },
    async call(fn) { const result = fn(); if (world.dirty) world.render(); await result; await api.settle(); },
  };
  return api;
}

const deferred = () => { let resolve; let reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

module.exports = { root, screen, setNow, mock, deferred, textOf, findAll, flat, RealDate, withMutation };
