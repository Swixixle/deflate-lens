"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
function part(from, to) { return source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from))); }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function bundle(id) { return { run: { id, transcriptUpdatedAt: "time-" + id, provenance: { overrides: {} } }, transcript: "Words for " + id, attrSig: "attr-" + id, passages: [] }; }
function setup() {
  const listeners = {}, alerts = [];
  const ctx = { S: { runId: "A", b: bundle("A"), turns: [], ai: { model: "mock" }, busy: false }, UI: {}, alerts, AbortController,
    location: { hash: "run-A" }, localStorage: { setItem() {} }, alert(s) { alerts.push(s); },
    $(id) { return { addEventListener(event, fn) { listeners[id + ":" + event] = fn; } }; },
    parseTranscript(text) { return [{ text }]; }, renderRun() {}, renderRunList() {}, refreshList: async () => {},
    run() { return ctx.S.b.run; }, nowISO: () => "now", attrSig: () => "attr", API: {} };
  vm.createContext(ctx);
  vm.runInContext(part("function blockWhileBusy()", "/* ---------- run view ---------- */"), ctx);
  return { ctx, listeners };
}

test("switching runs or opening a new run cannot retarget a deflation waiting on its initial save", async () => {
  const { ctx, listeners } = setup(), firstSave = deferred(), calls = [];
  vm.runInContext(part("var API =", "function fileToBase64"), ctx);
  vm.runInContext(part("async function runDeflate(", "/* A claim a person typed"), ctx);
  Object.assign(ctx, { P: { deflate: (r, p, turns) => r.id + ":" + turns },
    fmtTurns: () => ctx.S.b.transcript, sanitizeAnalysis: x => x, speakersIn: () => [], analyzedByLabel: () => "mock",
    view: { querySelector: () => null }, errCopy: String });
  let saves = 0;
  ctx.API.savePassage = async () => { if (++saves === 1) await firstSave.promise; };
  ctx.API.saveRun = async () => bundle("A");
  ctx.API.req = async (method, url, payload) => { calls.push(payload); return { data: {}, provenance: { callId: "call-A" } }; };
  const work = ctx.runDeflate(null, null, null, null, { id: "p001", turnStart: 0, turnEnd: 0, readingRev: 1 });
  await ctx.selectRun("B"); listeners["newRun:click"]();
  assert.equal(ctx.S.runId, "A"); assert.equal(ctx.S.b.run.id, "A");
  firstSave.resolve(); await work;
  assert.equal(calls.length, 1); assert.equal(calls[0].runId, "A");
  assert.equal(calls[0].prompt, "A:Words for A");
  assert.equal(calls[0].basedOn.transcriptUpdatedAt, "time-A");
  assert.equal(ctx.S.busy, false);
});

test("late bundles and out-of-order run loads cannot replace the selected run", async () => {
  const { ctx } = setup(), a = deferred(), b = deferred();
  ctx.API.getRun = id => id === "A" ? a.promise : b.promise;
  const oldLoad = ctx.reload();
  const newSelection = ctx.selectRun("B");
  b.resolve(bundle("B")); await newSelection;
  a.resolve(bundle("A")); await oldLoad;
  assert.equal(ctx.S.runId, "B"); assert.equal(ctx.S.b.run.id, "B");
  assert.equal(await ctx.reload(bundle("A")), false);
  assert.equal(ctx.S.b.run.id, "B");
});

test("input and attribution edits wait for analysis, and attribution writes block analysis navigation", async () => {
  const { ctx } = setup();
  vm.runInContext(part("async function setOverride(", "async function runAudit("), ctx);
  vm.runInContext(part("  async function onGo(){", "  return p;\n}"), ctx);
  ctx.readOnly = () => false; ctx.go = {}; ctx.S.turns = [{ label: "A" }];
  let writes = 0; const saved = deferred();
  ctx.API.saveRun = async () => { writes++; await saved.promise; return bundle("A"); };
  ctx.S.busy = true;
  await ctx.onGo(); await ctx.setOverride(0, "B");
  assert.equal(writes, 0); assert.equal(ctx.go.disabled, undefined);
  ctx.S.busy = false;
  const edit = ctx.setOverride(0, "B");
  assert.equal(ctx.S.busy, true);
  await ctx.selectRun("B"); assert.equal(ctx.S.runId, "A");
  saved.resolve(); await edit;
  assert.equal(ctx.S.busy, false); assert.equal(writes, 1);
});

test("patterns hold the same busy guard and release it after a failed model request", async () => {
  const { ctx } = setup(), response = deferred(), buttons = [];
  function element(tag, props) {
    const e = Object.assign({ append() {}, replaceChildren() {} }, props);
    if (tag === "button") buttons.push(e); return e;
  }
  Object.assign(ctx, { h: element, patternsBody: element("div", {}), clear() {}, readOnly: () => false,
    ensureAI: () => true, plural: (n, text) => n + " " + text, P: { patterns: () => "patterns" }, errCopy: String });
  ctx.S.b.passages = [1, 2].map(i => ({ id: "p00" + i, status: "done", analysis: {}, stale: [] }));
  ctx.API.sample = () => response.promise;
  vm.runInContext(part("function renderPatterns(){", "/* ---- 5"), ctx);
  ctx.renderPatterns();
  const work = buttons.find(b => b.text === "Find patterns").onclick();
  assert.equal(ctx.S.busy, true);
  await ctx.selectRun("B"); assert.equal(ctx.S.runId, "A");
  response.reject(new Error("Provider unavailable")); await work;
  assert.equal(ctx.S.busy, false); assert.equal(ctx.S.abort, null);
});
