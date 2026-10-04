"use strict";
/* The shipped page (public/app.js) executed against the real server in a small DOM. It checks behavior: what a reader
   sees and in what order, what a click sends, and that progress updates leave untouched cards alone. Layout, focus,
   panels and phone widths are checked in a real browser by scripts/ui-check.js. */
const test = require("node:test"), assert = require("node:assert/strict");
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-ui-")), system = createApp({ dataDir: dir, examplesDir: dir, ai: opts.ai === undefined ? createMockAI() : opts.ai, research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), resolver: opts.resolver, env: {}, envPath: path.join(dir, ".env") });
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
const transcript = Array.from({ length: 18 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": Here is an argument with enough words for the quoted passage " + i + "." + (i === 3 ? " That shows everyone agrees with it." : "")).join("\n");

test("the start screen: one box, one helper line, Upload transcript and one Read this; Controls and Readings start closed", async t => {
  const f = await page(t), view = f.$("runView");
  assert.equal(view.querySelectorAll("textarea").length, 1);
  assert.equal(view.querySelectorAll(".btn.primary").length, 1); assert.equal(f.$("readThis").textContent, "Read this");
  assert.equal(view.querySelectorAll("button").filter(b => b.textContent === "Upload transcript").length, 1);
  assert.equal(view.querySelectorAll(".hint").length, 1); assert.equal(f.$("f-kind").textContent, "Paste text or a link, or upload a transcript.");
  assert.equal(f.$("controls").hidden, true); assert.equal(f.$("readings").hidden, true);
  assert.match(visible(view), /What would you like to read\?/);
  assert.doesNotMatch(visible(view), /How it works|Processing options|plain words · where it jumps/);
});

test("one upload and one Read this give cards with three blocks, a two-choice level switch and closed Evidence; no chip ribbon or claim ledger", async t => {
  const f = await page(t), file = f.$("f-file");
  file.files = [{ name: "interview.txt", text: async () => transcript }]; await file.listeners.change();
  await f.$("readThis").click(); await f.settle();
  assert.deepEqual(f.errors, []);
  const cards = f.body.querySelectorAll(".card"); assert.equal(cards.length, 3);
  assert.match(visible(f.$("reading-status")), /Your reading is ready\./);
  for (const card of cards) {
    const blocks = card.querySelectorAll("section").filter(s => /\bblk\b/.test(s.className)).map(s => s.children[0].textContent);
    assert.deepEqual(blocks, ["In plain words", "A fair reading", "What follows"]);
    assert.deepEqual(card.querySelector(".levels").querySelectorAll("button").map(b => b.textContent), ["High school", "Fifth grade"]);
    assert.equal(card.querySelector("details.evidence").getAttribute("open"), null);
    assert.equal(card.querySelectorAll(".chips").length, 0);
    assert.doesNotMatch(visible(card), /Where it jumps|jump partly stands|turns \d|Preparation · passed|The claims, one at a time/);
  }
  assert.equal(f.requests.filter(x => x[0] === "/api/intake").length, 1);
  assert.ok(!f.requests.some(x => x[0] === "/api/sample"), "the page never builds or sends a reading prompt");
  // the first passage carries a concern; it appears in Evidence, marked with how it ended, not on the card face
  const ev = cards[0].querySelector("details.evidence");
  assert.match(ev.textContent, /The original passage[\s\S]*Quoted in this reading[\s\S]*Reasoning behind this reading[\s\S]*Initial concern[\s\S]*Where the reasoning turns: “That shows everyone agrees with it”matched[\s\S]*part of this concern stands[\s\S]*Claims in this passage[\s\S]*Checkable claim/);
  assert.match(ev.textContent, /Just after \(context the model was given\)/);
  assert.match(visible(f.$("across")), /Across this reading[\s\S]*No concern recurs/);
  assert.match(visible(f.$("contents-host")), /Contents · 3 passages/);
});

test("a card's reading level switches without any request, survives a redraw, and the page default is separate", async t => {
  const f = await page(t); await f.type(transcript);
  const card = f.body.querySelector(".card"), id = f.ctx.page.S.runId, before = f.requests.length;
  card.querySelector(".levels").querySelectorAll("button")[1].click();
  assert.equal(card.getAttribute("data-level"), "5"); assert.equal(f.requests.length, before, "no model call, no request at all");
  assert.equal(f.store.get("deflate-card-level:" + id + ":p001"), "5"); assert.equal(f.store.get("deflate-level"), undefined);
  // a fresh drawing of the run (as on reopening) keeps the card's choice, and other cards follow the page default
  f.ctx.page.S.rendered = null; await f.ctx.page.reload();
  const again = f.body.querySelectorAll(".card");
  assert.equal(again[0].getAttribute("data-level"), "5"); assert.equal(again[1].getAttribute("data-level"), "hs");
});

test("progress updates redraw only the card that changed and keep open Evidence", async t => {
  const f = await page(t); await f.type(transcript);
  const S = f.ctx.page.S, b = JSON.parse(JSON.stringify(S.b));
  const cards = f.body.querySelectorAll(".card");
  const ev = cards[1].querySelector("details.evidence"); ev.attrs.open = ""; ev.open = true; ev.listeners.toggle();
  await f.ctx.page.reload(JSON.parse(JSON.stringify(b)));
  const same = f.body.querySelectorAll(".card");
  assert.ok(same.every((c, i) => c === cards[i]), "an identical poll leaves every card element in place");
  const changed = JSON.parse(JSON.stringify(b)); changed.passages[1].analysis.claims[1].receipts = [{ rid: "rl_x", url: "https://example.org/a", note: "n", relation: "contradicts", addedBy: "person at this computer", at: "2026-10-03T00:00:00Z", relationAt: "2026-10-03T00:00:00Z" }];
  await f.ctx.page.reload(changed);
  const after = f.body.querySelectorAll(".card");
  assert.equal(after[0], cards[0]); assert.equal(after[2], cards[2]); assert.notEqual(after[1], cards[1]);
  assert.notEqual(after[1].querySelector("details.evidence").getAttribute("open"), null, "Evidence stays open on the redrawn card");
  assert.match(visible(after[1]), /You marked a source as contradicting a claim here\. That is your judgment; the reading was not changed by it\./);
});

test("a held passage keeps its place and names its own reason; an out-of-date one says so", async t => {
  const f = await page(t); await f.type(transcript);
  const b = JSON.parse(JSON.stringify(f.ctx.page.S.b));
  b.passages[1].status = "error"; b.passages[1].readingGate = { status: "held", reasons: ["The model's answer was cut off at its length limit before it finished."] };
  b.passages[2].readingGate = { status: "held", reasons: ["transcript changed since this analysis"] }; b.passages[2].stale = ["transcript changed since this analysis"];
  b.run.processing.status = "partial"; b.run.processing.message = "1 of 3 readings are ready.";
  await f.ctx.page.reload(b);
  const cards = f.body.querySelectorAll(".card");
  assert.equal(cards.length, 3, "order and slots are kept");
  assert.match(visible(cards[1]), /2 of 3[\s\S]*Held, not shown: The model's answer was cut off at its length limit before it finished\./);
  assert.match(visible(cards[2]), /Out of date: the text changed after this reading was made\./);
  assert.doesNotMatch(visible(cards[2]), /In plain words/);
  assert.match(visible(f.$("reading-status")), /1 of 3 readings are ready\.Try the held readings again/);
  assert.match(f.$("contents-host").textContent, /2 of 3[^·]*· held[\s\S]*3 of 3[^·]*· out of date/);
});

test("a typed claim shows its explanation and what would help check it, without an invented debate", async t => {
  const f = await page(t); await f.type("Most city residents want the library open until midnight.");
  const card = f.body.querySelector(".card");
  assert.match(visible(card), /In plain words[\s\S]*What would help check it[\s\S]*Checkable claim/);
  assert.doesNotMatch(visible(card), /A fair reading|What follows/);
  assert.equal(f.body.querySelectorAll(".card").length, 1); assert.equal(f.$("across").hidden, true);
});

test("without a key, a typed claim is saved and shown as not yet read; the key prompt sits in the status line and continues", async t => {
  const f = await page(t, { ai: null }); await f.type("Most city residents want the library open until midnight.");
  assert.match(visible(f.body.querySelector(".card")), /The claim, as typed[\s\S]*Not yet read by the model\./);
  const box = f.body.querySelector(".keybox"); assert.ok(box && box.parent.id === "reading-status");
  f.ctx.page.API.setKey = async () => { f.system.state.ai = createMockAI(); return { ai: { kind: "mock", model: "mock", mock: true } }; };
  box.querySelector("input").value = "test-only-key"; await box.querySelector("button").click(); await f.settle();
  assert.match(visible(f.body.querySelector(".card")), /In plain words/); assert.equal(f.body.querySelectorAll(".keybox").length, 0);
});

test("a matched video shows one notice with a concrete comparison; confirming sends the source shown and is recorded", async t => {
  const T2 = transcript, match = { method: "youtube-search", basis: "title and length", episode: { title: "Ep 1", durationSeconds: 3600 }, video: { id: "FullEpisode", url: "https://www.youtube.com/watch?v=FullEpisode", title: "Show — Ep 1", channel: "Show", durationSeconds: 3480 }, toleranceSeconds: 180, differenceSeconds: 120, passing: 1, alternatives: [] };
  const resolver = { locate: async () => ({ kind: "episode" }), words: async () => ({ ok: true, text: T2, title: "Ep 1", episode: { title: "Ep 1", duration: 3600 }, source: { kind: "youtube-captions", url: match.video.url, note: "via a YouTube search" }, match, identity: "needs_confirmation" }) };
  const f = await page(t, { resolver }); const ta = f.$("f-text"); ta.value = "https://show.test/feed.xml"; ta.listeners.input();
  const going = f.$("readThis").click();
  await f.pump(() => f.body.querySelectorAll(".card").length === 3 && /ready/.test(f.$("reading-status") ? f.$("reading-status").textContent : "")); await going;
  const notice = f.body.querySelector(".notice.source");
  assert.match(visible(notice), /^Video matched by title and length — Check source$/);
  notice.querySelector("button").click();
  assert.match(visible(notice), /Episode you asked forEp 1 · 60 min[\s\S]*Video usedShow — Ep 1 · Show · 58 min[\s\S]*differ by 2 min\. Up to 3 min is allowed \(the larger of 2 minutes and 5% of the episode\)\. This does not establish the channel or the recording\./);
  assert.doesNotMatch(visible(f.$("runView")), /official|confirmed/i);
  await notice.querySelectorAll("button").find(b => /They match/.test(b.textContent)).click();
  const sent = f.requests.find(r => /\/source\/confirm$/.test(r[0])); assert.ok(sent);
  assert.equal(f.ctx.page.S.b.sourceIdentity.state, "confirmed");
  assert.equal(f.body.querySelector(".notice.source"), null); assert.match(visible(f.$("run-head")), /Match confirmed by you on/);
});

test("Evidence labels a relocated quote and quotes matched with numbers written differently", async t => {
  const f = await page(t); await f.type(transcript);
  const b = JSON.parse(JSON.stringify(f.ctx.page.S.b));
  Object.assign(b.passages[0].analysis.asSaid[0], { verbatim: true, relocated: true, turn: 0, matchedTurn: 1 });
  b.passages[0].analysis.asSaid.push({ turn: 2, speaker: "HOST", quote: "fifteen percent", verbatim: true, tolerated: ["15%"] });
  await f.ctx.page.reload(b);
  const ev = f.body.querySelector(".card details.evidence");
  assert.match(ev.textContent, /found in turn 1, not turn 0/); assert.match(ev.textContent, /“fifteen percent”matched, numbers written differently/);
});

test("Controls: three groups and the guide link; a reread from Evidence goes to the server route; a held claim type is attributed to the earlier model", async t => {
  const f = await page(t); await f.type(transcript);
  f.$("controlsBtn").click();
  assert.equal(f.$("controls").hidden, false);
  assert.deepEqual(f.$("controlsBody").querySelectorAll("section").map(s => s.children[0].textContent), ["Reading", "Input and speakers", "App and files"]);
  assert.ok(f.$("guideLink")); f.$("controls").querySelector(".panel-close").click(); assert.equal(f.$("controls").hidden, true);
  const card = f.body.querySelector(".card"), reread = card.querySelectorAll("button").find(b => b.textContent === "Read this passage again");
  await reread.click(); await f.settle();
  assert.ok(f.requests.some(r => r[0] === "/api/runs/" + f.ctx.page.S.runId + "/passages/p001/reread" && r[1] === "POST"));
  const b = JSON.parse(JSON.stringify(f.ctx.page.S.b)); b.passages[0].analysis.claims[1].type = "contested";
  await f.ctx.page.reload(b);
  const ev = f.body.querySelector(".card details.evidence");
  assert.match(ev.textContent, /Checkable claim[\s\S]*An earlier version of the app had the model label this “contested” from its own knowledge/);
  assert.doesNotMatch(visible(f.body.querySelector(".card")), /contested/);
});

test("late bundles and out-of-order loads cannot replace the selected reading; a busy page refuses to switch", async t => {
  const f = await page(t); await f.type(transcript); const first = f.ctx.page.S.runId, P = f.ctx.page;
  const other = await f.system.store.createRun({}, transcript.replace(/argument/g, "case"));
  const stale = JSON.parse(JSON.stringify(P.S.b));
  // the first reading's load is slow; the person moves on to the other one before it answers
  const real = P.API.getRun; let release; const slow = new Promise(r => { release = r; });
  P.API.getRun = id => id === first ? slow.then(() => real(id)) : real(id);
  const late = P.selectRun(first);
  await P.selectRun(other);
  release(); await late;
  assert.equal(P.S.runId, other); assert.equal(P.S.b.run.id, other);
  assert.equal(await P.reload(stale), false, "a late bundle for the previous reading is ignored");
  P.S.busy = true; await P.selectRun(first); assert.equal(P.S.runId, other); P.S.busy = false;
});
