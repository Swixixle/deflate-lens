"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Exercise the page's real key-prompt handler without depending on a browser install.
// Server-side key persistence and rejection are covered by intake.test.js.
function keyPrompt(setKey) {
  const nodes = [];
  const host = { firstChild: null, querySelector: () => null, insertBefore(node) { this.firstChild = node; } };
  const context = {
    S: { ai: null }, API: { setKey }, view: host, renders: 0,
    h(tag, props, ...children) {
      const node = Object.assign({ tag, children, value: "", remove() { this.removed = true; }, scrollIntoView() {} }, props);
      nodes.push(node); return node;
    },
    setStore() {}, renderRun() { context.renders++; }, errCopy: e => e.message,
  };
  const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  vm.runInNewContext(source.slice(source.indexOf("function ensureAI("), source.indexOf("/* ---- 2 Provenance ---- */")), context);
  return { context, nodes, host };
}

test("saving the first key resumes the requested action once and clears the input", async () => {
  const submitted = [];
  const { context, nodes, host } = keyPrompt(async key => { submitted.push(key); return { ai: { model: "test-model" } }; });
  let started = 0;
  assert.equal(context.ensureAI(host, async () => { started++; }), false);
  const input = nodes.find(n => n.tag === "input");
  const button = nodes.find(n => n.tag === "button");
  input.value = "test-key";
  await button.onclick();
  assert.deepEqual(submitted, ["test-key"]);
  assert.equal(started, 1);
  assert.equal(input.value, "");
  assert.equal(host.firstChild.removed, true);
  assert.equal(context.renders, 0, "do not replace the controls before their requested action resumes");
  assert.equal(context.ensureAI(host), true);
});

test("a rejected key keeps the prompt usable and does not start analysis", async () => {
  const { context, nodes, host } = keyPrompt(async () => { throw new Error("Key was not accepted"); });
  let started = 0;
  context.ensureAI(host, () => { started++; });
  await nodes.find(n => n.tag === "button").onclick();
  assert.equal(started, 0);
  assert.equal(context.S.ai, null);
  assert.equal(nodes.find(n => n.tag === "button").disabled, false);
  assert.equal(nodes.find(n => n.class === "hint").textContent, "Key was not accepted");
  assert.ok(!host.firstChild.removed);
});

test("the page saves a typed claim even when the model unexpectedly returns extra claims", async t => {
  const os = require("node:os");
  const { Store } = require("../server/store");
  const shared = require("../shared/transcript");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-page-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new Store(dir); await store.init();
  const id = await store.createRun({ kind: "claim" }, "The Earth is getting greener");
  const bundle = await store.bundle(id);
  const errors = [];
  let saved;
  const context = {
    P: {}, S: { ai: { model: "test" }, b: bundle, busy: false }, UI: { detailsOpen: {} },
    AbortController, run: () => bundle.run, nowISO: () => new Date().toISOString(),
    analyzedByLabel: () => "test model", errCopy: e => e.message, alert: e => errors.push(e),
    sanitizeAnalysis: a => shared.sanitizeAnalysis(a), reload: async b => { saved = b; },
    API: {
      sample: async () => ({ model: "test", data: {
        deflated: { hs: "Vegetation is increasing.", g5: "More plants are growing." },
        type: "contested", basis: { hs: "Needs a dataset.", g5: "We need measurements." },
        hidden: [{ text: "An unexpected extra claim", type: "fact" }]
      } }),
      savePassage: async (rid, pid, doc) => store.savePassage(rid, pid, doc, { expectedReadingRev: doc.expectedReadingRev }),
      getRun: rid => store.bundle(rid),
    },
  };
  const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  vm.runInNewContext(source.slice(source.indexOf("P.claim ="), source.indexOf("function sanitizeAnalysis(o, p)")), context);
  assert.ok(!context.P.claim(bundle.run, bundle.transcript).includes('"hidden"'));
  await context.runClaimExplain(bundle.passages[0]);
  assert.deepEqual(errors, []);
  assert.equal(saved.passages[0].analysis.claims.length, 1);
  assert.equal(saved.passages[0].analysis.claims[0].text, bundle.transcript);
  assert.equal(saved.passages[0].analysis.claims[0].id, bundle.passages[0].analysis.claims[0].id);
  assert.equal(saved.passages[0].analysis.deflated.g5, "More plants are growing.");
  assert.equal(context.S.busy, false);
});
