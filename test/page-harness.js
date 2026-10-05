"use strict";
/* The shipped page (public/app.js) executed against the real server in a small DOM: the harness the page tests share.
   page(t, opts) starts the server (mock model, mock source search; opts.ai, opts.resolver, opts.cloudEngine,
   opts.localEngine, opts.serverFetch, opts.run and opts.env replace the server's parts), boots the page in a VM and returns helpers. */
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), vm = require("node:vm");
const { createApp } = require("../server/app"), { createMockAI } = require("../server/ai"), { createResearch } = require("../server/research");

class Element {
  constructor(tag, text = "") { this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.ownText = text; this.style = {}; this.value = ""; this.hidden = false;
    this.classList = { contains: cls => this.className.split(/\s+/).includes(cls), toggle: (cls, force) => { const has = this.classList.contains(cls), on = force === undefined ? !has : force; this.className = this.className.split(/\s+/).filter(x => x && x !== cls).concat(on ? [cls] : []).join(" "); return on; } };
  }
  get className() { return this.attrs.class || ""; } set className(value) { this.attrs.class = value; }
  append(...children) { for (let child of children) { if (!(child instanceof Element)) child = new Element("#text", String(child)); child.parent = this; this.children.push(child); } }
  replaceChildren(...children) { this.children.forEach(c => { c.parent = null; }); this.children = []; this.ownText = ""; this.append(...children); }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parent = null; }
  remove() { if (this.parent) this.parent.removeChild(this); }
  insertBefore(child, before) { child.parent = this; const at = this.children.indexOf(before); if (at === -1) this.children.push(child); else this.children.splice(at, 0, child); }
  get firstChild() { return this.children[0]; }
  set textContent(text) { this.ownText = String(text); this.children = []; }
  get textContent() { return this.ownText + this.children.map(c => c.textContent).join(""); }
  setAttribute(key, value) { this.attrs[key] = String(value); if (key === "id") this.id = String(value); if (key === "value") this.value = String(value); if (key === "disabled") this.disabled = true; }
  removeAttribute(key) { delete this.attrs[key]; } getAttribute(key) { return this.attrs[key] ?? null; }
  addEventListener(event, handler) { this.listeners[event] = handler; }
  click() { if (!this.disabled) return this.listeners.click && this.listeners.click({ preventDefault() {} }); }
  scrollIntoView() {}
  matches(selector) { const id = selector.match(/#([\w-]+)/), cls = [...selector.matchAll(/\.([\w-]+)/g)].map(m => m[1]), tag = selector.match(/^[a-z][a-z0-9]*/); return (!id || this.id === id[1]) && cls.every(c => this.classList.contains(c)) && (!tag || this.tag === tag[0]); }
  querySelectorAll(selector) { const parts = selector.split(/\s+/); return descendants(this).filter(e => { if (!e.matches(parts.at(-1))) return false; let parent = e.parent; for (let i = parts.length - 2; i >= 0; i--) { while (parent && !parent.matches(parts[i])) parent = parent.parent; if (!parent) return false; parent = parent.parent; } return true; }); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function descendants(node) { return node.children.flatMap(c => [c, ...descendants(c)]); }
function visible(node) { if (node.hidden) return ""; if (node.tag === "details" && node.getAttribute("open") === null) return node.children.filter(c => c.tag === "summary").map(visible).join(""); return node.ownText + node.children.map(visible).join(""); }
function el(tag, id, cls) { const n = new Element(tag); if (id) n.id = id; if (cls) n.className = cls; return n; }

async function page(t, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-ui-")), system = createApp({ dataDir: dir, examplesDir: dir, ai: opts.ai === undefined ? createMockAI() : opts.ai, research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), resolver: opts.resolver, cloudEngine: opts.cloudEngine, localEngine: opts.localEngine, fetch: opts.serverFetch, run: opts.run, env: opts.env || {}, envPath: path.join(dir, ".env") });
  await system.ready;
  const server = await new Promise(r => { const s = system.app.listen(0, "127.0.0.1", () => r(s)); });
  const base = "http://127.0.0.1:" + server.address().port, body = new Element("body");
  const readings = el("aside", "readings", "panel left"), controls = el("aside", "controls", "panel right");
  readings.append(el("button", "", "panel-close"), el("button", "newRun"), el("ul", "runList"), el("div", "trash")); readings.hidden = true;
  controls.append(el("button", "", "panel-close"), el("div", "controlsBody")); controls.hidden = true;
  body.append(el("span", "storeChip"), el("span", "storeText"), el("button", "readingsBtn"), el("button", "controlsBtn"), el("div", "welcome"), el("div", "runView"), el("article", "guideView"), el("div", "backdrop"), readings, controls);
  const store = new Map(Object.entries(opts.storage || {}));
  const document = { body, createElement: tag => new Element(tag), createTextNode: text => new Element("#text", text), getElementById: id => descendants(body).find(n => n.id === id), querySelector: s => body.querySelector(s), querySelectorAll: s => body.querySelectorAll(s) };
  const timers = new Map(), requests = [], errors = []; let counter = 0;
  const ctx = vm.createContext({ document, window: { DeflateShared: require("../shared/transcript"), DeflatePrompts: require("../shared/prompts"), addEventListener() {} },
    location: { hash: opts.hash || "" }, localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }, AbortController, URL, Blob,
    alert: text => errors.push(text), setTimeout: fn => { timers.set(++counter, fn); return counter; }, clearTimeout: id => timers.delete(id),
    fetch: (url, o) => { requests.push([url, o && o.method || "GET"]); return (opts.fetch || fetch)(base + url, o); } });
  const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8").replace("\nboot();\n", "\nglobalThis.page = {boot, reload, selectRun, startReading, API, get S(){return S;}, get UI(){return UI;}};\n");
  vm.runInContext(source, ctx); await ctx.page.boot();
  const settle = async () => { const id = ctx.page.S.runId, job = system.reader.jobs.get(id); if (job) await job.done; const pending = [...timers.values()]; timers.clear(); for (const fn of pending) await fn(); if (!pending.length) await ctx.page.reload(); };
  t.after(async () => { for (const job of system.reader.jobs.values()) job.controller.abort(); await Promise.all([...system.reader.jobs.values()].map(j => j.done)); await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const $ = id => document.getElementById(id);
  const pump = async (done, rounds = 80) => { for (let i = 0; i < rounds && !done(); i++) { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) await fn(); await new Promise(r => setTimeout(r, 25)); } };
  return { ctx, body, document, system, requests, errors, settle, pump, store, $, type: async text => { const ta = $("f-text"); ta.value = text; ta.listeners.input(); await $("readThis").click(); await settle(); } };
}

module.exports = { page, visible, descendants, Element, el };
