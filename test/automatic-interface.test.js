"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), vm = require("node:vm");
const { createApp } = require("../server/app"), { createMockAI } = require("../server/ai"), { createResearch } = require("../server/research");

// A small DOM lets these tests execute the whole shipped page and its real upload/key/click
// handlers against an actual HTTP server. It tests behavior, not browser layout or screenshots.
class Element {
  constructor(tag, text = "") { this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.ownText = text; this.style = {}; this.value = ""; this.hidden = false;
    this.classList = { contains: cls => this.className.split(/\s+/).includes(cls), toggle: (cls, force) => { const has = this.classList.contains(cls), on = force === undefined ? !has : force; this.className = this.className.split(/\s+/).filter(x => x && x !== cls).concat(on ? [cls] : []).join(" "); return on; } };
  }
  get className() { return this.attrs.class || ""; } set className(value) { this.attrs.class = value; }
  append(...children) { for (let child of children) { if (!(child instanceof Element)) child = new Element("#text", String(child)); child.parent = this; this.children.push(child); } }
  prepend(...children) { const old = this.children; this.children = []; this.append(...children); this.children.push(...old); }
  replaceChildren(...children) { this.children = []; this.ownText = ""; this.append(...children); }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parent = null; }
  remove() { if (this.parent) this.parent.removeChild(this); }
  insertBefore(child, before) { child.parent = this; const at = this.children.indexOf(before); if (at === -1) this.children.push(child); else this.children.splice(at, 0, child); }
  get firstChild() { return this.children[0]; }
  set textContent(text) { this.ownText = String(text); this.children = []; }
  get textContent() { return this.ownText + this.children.map(c => c.textContent).join(""); }
  setAttribute(key, value) { this.attrs[key] = String(value); if (["id", "value"].includes(key)) this[key] = String(value); if (key === "disabled") this.disabled = true; }
  removeAttribute(key) { delete this.attrs[key]; } getAttribute(key) { return this.attrs[key] ?? null; }
  addEventListener(event, handler) { this.listeners[event] = handler; }
  click() { if (!this.disabled) return this.listeners.click && this.listeners.click({ preventDefault() {} }); }
  scrollIntoView() {}
  matches(selector) { const id = selector.match(/#([\w-]+)/), cls = [...selector.matchAll(/\.([\w-]+)/g)].map(m => m[1]), tag = selector.match(/^[a-z]+/); return (!id || this.id === id[1]) && cls.every(c => this.classList.contains(c)) && (!tag || this.tag === tag[0]); }
  querySelectorAll(selector) { const parts = selector.split(/\s+/); return descendants(this).filter(e => { if (!e.matches(parts.at(-1))) return false; let parent = e.parent; for (let i = parts.length - 2; i >= 0; i--) { while (parent && !parent.matches(parts[i])) parent = parent.parent; if (!parent) return false; parent = parent.parent; } return true; }); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function descendants(node) { return node.children.flatMap(c => [c, ...descendants(c)]); }
function visible(node) { if (node.hidden) return ""; if (node.tag === "details" && node.getAttribute("open") === null) return node.children.filter(c => c.tag === "summary").map(visible).join(""); if (node.classList.contains("collapsed")) return node.children.filter(c => c.tag === "header").map(visible).join(""); return node.ownText + node.children.map(visible).join(""); }
async function pageFixture(t, ai = createMockAI()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-ui-auto-")), system = createApp({ dataDir: dir, examplesDir: dir, ai, research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }) }); await system.ready;
  const server = await new Promise(r => { const s = system.app.listen(0, "127.0.0.1", () => r(s)); });
  const base = "http://127.0.0.1:" + server.address().port, body = new Element("body");
  for (const id of ["lvlHS", "lvl5", "storeChip", "storeText", "newRun", "runList", "trash", "welcome", "runView"]) { const n = new Element(id === "newRun" ? "button" : "div"); n.id = id; body.append(n); }
  const document = { body, createElement: tag => new Element(tag), createTextNode: text => new Element("#text", text), getElementById: id => descendants(body).find(n => n.id === id), querySelector: s => body.querySelector(s), querySelectorAll: s => body.querySelectorAll(s) };
  const timers = new Map(), requests = [], errors = []; let counter = 0;
  const ctx = vm.createContext({ document, window: { DeflateShared: require("../shared/transcript"), DeflatePrompts: require("../shared/prompts"), addEventListener() {} },
    location: { hash: "" }, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, AbortController, URL, Blob,
    alert: text => errors.push(text), setTimeout: fn => { timers.set(++counter, fn); return counter; }, clearTimeout: id => timers.delete(id),
    fetch: (url, opts) => { requests.push([url, opts && opts.method]); return fetch(base + url, opts); } });
  const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8").replace("\nboot();\n", "\nglobalThis.page = {boot, reload, startReading, API, get S(){return S;}};\n");
  vm.runInContext(source, ctx); await ctx.page.boot();
  const settle = async () => { const id = ctx.page.S.runId, job = system.reader.jobs.get(id); if (job) await job.done; const poll = [...timers.values()][0]; timers.clear(); if (poll) await poll(); else await ctx.page.reload(); };
  t.after(async () => { for (const job of system.reader.jobs.values()) job.controller.abort(); await Promise.all([...system.reader.jobs.values()].map(j => j.done)); await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  return { ctx, body, document, system, requests, errors, settle };
}
const transcript = Array.from({ length: 18 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": Here is an argument with enough words for the quoted passage " + i + ".").join("\n");

test("the page opens directly to upload; one upload and one Read this click produce visible cards with all processing controls closed", async t => {
  const f = await pageFixture(t), file = f.document.getElementById("f-file");
  assert.ok(f.document.getElementById("f-text")); assert.ok(visible(f.body).includes("Upload transcript"));
  file.files = [{ name: "interview.txt", text: async () => transcript }]; await file.listeners.change();
  const button = f.body.querySelector("#stage-intake .btn.primary"); assert.equal(button.textContent, "Read this");
  await button.click(); await f.settle();
  assert.deepEqual(f.errors, []); assert.equal(f.body.querySelectorAll(".card").length, 3);
  assert.ok(visible(f.body).includes("Your reading is ready.")); assert.ok(visible(f.body).includes("In plain words"));
  assert.ok(!visible(f.body).includes("Split into passages")); assert.ok(!visible(f.body).includes("Deflate selected")); assert.ok(!visible(f.body).includes("Find patterns"));
  assert.ok(!visible(f.body).includes("Confirm attribution")); assert.ok(!visible(f.body).includes("Read selected passages again"));
  assert.equal(f.requests.filter(x => x[0] === "/api/intake").length, 1);
  assert.ok(!f.requests.some(x => /prepare-speakers|\/api\/sample/.test(x[0])), "the page delegates the workflow, not individual stages");
  for (const card of f.body.querySelectorAll(".card")) {
    const header = card.children[0]; assert.ok(header.textContent.includes("Fifth grade")); assert.equal(card.querySelector("details.more").getAttribute("open"), null);
  }
  assert.equal(f.body.querySelector(".processing-record").getAttribute("open"), null);
});

test("the one-time key prompt is visible beside the saved upload and continues the complete reading automatically", async t => {
  const f = await pageFixture(t, null);
  f.document.getElementById("f-text").value = transcript; f.document.getElementById("f-text").listeners.input();
  await f.body.querySelector("#stage-intake .btn.primary").click(); await f.settle();
  assert.ok(visible(f.body).includes("Real analysis needs your Anthropic API key, once."));
  const box = f.body.querySelector(".keybox"); assert.ok(box && box.parent.id === "reading-status");
  f.ctx.page.API.setKey = async () => { f.system.state.ai = createMockAI(); return { ai: { kind: "mock", model: "mock", mock: true } }; };
  const input = box.querySelector("input"), button = box.querySelector("button"); input.value = "test-only-key";
  await button.click(); await f.settle();
  assert.equal(input.value, ""); assert.equal(f.body.querySelectorAll(".keybox").length, 0); assert.equal(f.body.querySelectorAll(".card").length, 3);
  assert.equal(f.requests.filter(x => /\/read$/.test(x[0])).length, 1); assert.deepEqual(f.errors, []);
});

test("missing optional context never opens the form or prevents a pasted claim from being read", async t => {
  const f = await pageFixture(t), input = f.document.getElementById("f-text"); input.value = "The Earth is getting greener"; input.listeners.input();
  assert.equal(f.body.querySelector("details.ctx").getAttribute("open"), null);
  await f.body.querySelector("#stage-intake .btn.primary").click(); await f.settle();
  assert.equal(f.ctx.page.S.b.run.sourceUrl, ""); assert.equal(f.ctx.page.S.b.run.sourceDate, "");
  assert.equal(f.body.querySelectorAll(".card").length, 1); assert.equal(f.ctx.page.S.b.passages[0].readingGate.status, "ready");
  assert.equal(f.body.querySelector("details.ctx").getAttribute("open"), null); assert.deepEqual(f.errors, []);
});
