"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");

// Run the real renderers and click handlers. This is a DOM behavior check, not a screenshot check.
class Element {
  constructor(tag, text = "") { this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.ownText = text; }
  append(...children) {
    for (let child of children) {
      if (!(child instanceof Element)) child = new Element("#text", String(child));
      child.parent = this; this.children.push(child);
    }
  }
  replaceChildren(...children) { this.children = []; this.ownText = ""; this.append(...children); }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parent = null; }
  get firstChild() { return this.children[0]; }
  set textContent(text) { this.ownText = String(text); this.children = []; }
  get textContent() { return this.ownText + this.children.map(c => c.textContent).join(""); }
  setAttribute(key, value) { this.attrs[key] = String(value); if (key === "id") this.id = String(value); }
  removeAttribute(key) { delete this.attrs[key]; }
  getAttribute(key) { return this.attrs[key] ?? null; }
  addEventListener(event, handler) { this.listeners[event] = handler; }
  click() { return this.listeners.click && this.listeners.click({ preventDefault() {} }); }
  querySelectorAll(tag) { return descendants(this).filter(e => e.tag === tag); }
}
function descendants(node) { return node.children.flatMap(c => [c, ...descendants(c)]); }
function visibleText(node) {
  if (node.hidden) return "";
  if (node.tag === "details" && node.getAttribute("open") === null) return node.children.filter(c => c.tag === "summary").map(visibleText).join("");
  return node.ownText + node.children.map(visibleText).join("");
}
function load(context, from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, "renderer boundaries must exist");
  vm.runInContext(source.slice(start, end), context);
}
function context() {
  const ctx = vm.createContext({
    document: { createElement: tag => new Element(tag), createTextNode: text => new Element("#text", text) },
    S: { b: { run: { id: "run" }, passages: [] }, turns: [] }, UI: { detailsOpen: {} },
    run: () => ctx.S.b.run, readOnly: () => true, isClaimRun: () => false,
    speakerName: key => key, plural: (n, text) => n + " " + text, personOnlyA: () => false,
    EMPIRICAL: [], chipRow: () => ({ addChip() {} }),
  });
  load(ctx, "function h(", "function errCopy(");
  return ctx;
}

test("every card has working reading-level buttons in its header while Details stays closed", () => {
  const ctx = context();
  load(ctx, "function passageCard(p){", "function claimDetail(");
  const p = { id: "p001", title: "Plants", turnStart: 0, turnEnd: 1, speakers: ["A"], status: "done", analysis: {
    asSaid: [], deflated: { hs: "Plant measurements increased.", g5: "More plants grew." },
    fidelity: { grade: "faithful", notes: {} }, jump: { present: false }, defense: {}, revision: {}, judgments: { evidence: "mixed", inference: "valid" }, claims: []
  } };
  const card = ctx.passageCard(p), header = card.children[0];
  assert.equal(header.tag, "header");
  const buttons = descendants(header).filter(e => e.tag === "button");
  assert.deepEqual(buttons.map(b => b.textContent), ["Follow page", "High school", "Fifth grade"]);
  assert.equal(descendants(card).filter(e => e.tag === "details").length, 1);
  assert.equal(descendants(card).find(e => e.tag === "details").getAttribute("open"), null);
  buttons[2].click();
  assert.equal(card.getAttribute("data-level"), "5");
  assert.equal(buttons[2].getAttribute("aria-pressed"), "true");
  assert.equal(buttons[1].getAttribute("aria-pressed"), "false");
  buttons[1].click(); assert.equal(card.getAttribute("data-level"), "hs");
  buttons[0].click(); assert.equal(card.getAttribute("data-level"), null);
  assert.ok(visibleText(card).includes("Fifth grade"));
});

test("normal rendering excludes held drafts and leaves one optional preparation record", () => {
  const ctx = context(), rendered = [];
  ctx.cardsEl = new Element("div");
  ctx.passageCard = p => { rendered.push(p.id); return ctx.h("article", { text: p.analysis.deflated.hs }); };
  ctx.S.b.passages = [
    { id: "p001", title: "Unsettled", status: "done", analysis: { deflated: { hs: "UNFINISHED DRAFT" } }, readingGate: { status: "held", reasons: ["Speaker unclear"] } },
    { id: "p002", title: "Another hold", status: "done", analysis: { deflated: { hs: "ANOTHER UNFINISHED DRAFT" } }, readingGate: { status: "held", reasons: ["Rewrite failed"] } },
    { id: "p003", status: "done", analysis: { deflated: { hs: "The prepared reading" } }, readingGate: { status: "ready" } }
  ];
  load(ctx, "function renderPassages(){", "/* Two-level text");
  ctx.renderPassages();
  assert.deepEqual(rendered, ["p003"]);
  assert.ok(!ctx.cardsEl.textContent.includes("UNFINISHED DRAFT"));
  assert.ok(visibleText(ctx.cardsEl).includes("Reading held"));
  assert.ok(!visibleText(ctx.cardsEl).includes("Speaker unclear"));
  assert.equal(descendants(ctx.cardsEl).filter(e => e.tag === "details").length, 1);
});

test("the 110-flag worksheet is closed by default and its cues stay readable in the record", () => {
  const ctx = context();
  Object.assign(ctx, {
    attributionOk: () => false, speakerLabels: () => ["A", "B"], overrides: () => ({}), effSpeaker: t => t.label,
    panel: () => ctx.h("section", {}, ctx.h("div", { class: "body" })), body: p => p.children[0],
  });
  ctx.S.turns = [{ i: 0, label: "A", text: "Yeah." }, { i: 1, label: "B", text: "We need the actual recording." }];
  ctx.S.b.run.provenance = { overrides: {}, flags: Array.from({ length: 110 }, () => ({ turn: 0, labeled: "A", likely: "B", cue: "A style guess" })) };
  load(ctx, "function renderProvenance(){", "async function setOverride(");
  const panel = ctx.renderProvenance();
  assert.ok(visibleText(panel).includes("reading is held"));
  assert.ok(!visibleText(panel).includes("A style guess"));
  assert.equal(descendants(panel).filter(e => e.className === "flag").length, 110);
  assert.ok(panel.textContent.includes("likely B · cue: “A style guess”"));
  assert.ok(!panel.textContent.includes("NaN"));
  const record = descendants(panel).find(e => e.tag === "details" && e.className === "more");
  assert.equal(record.getAttribute("open"), null);
});
