"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Store, sha256 } = require("../server/store");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");

const original = "A: Plants are greener.\nB: The measurements agree.";
const changed = "A: Plants are browner.\nB: The measurements disagree.";
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-release-"));
  const store = new Store(dir); await store.init();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const id = await store.createRun({ kind: "transcript" }, original);
  return { store, id };
}
function reading(text, extra) {
  return Object.assign({ title: "Plants", turnStart: 0, turnEnd: 1, status: "done", analyzedAt: "reading-1", analysis: {
    deflated: { hs: text, g5: text }, asSaid: [{ turn: 0, speaker: "A", quote: "Plants are greener." }],
    claims: [{ speaker: "A", text, type: "fact" }]
  } }, extra);
}
const basis = b => ({ transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig });

test("a missing input basis stays unknown across single-card and replacement saves", async t => {
  const { store, id } = await fixture(t);
  await store.saveRun(id, {}, changed);
  await store.savePassage(id, "p001", reading("Plants are greener."));
  let b = await store.bundle(id);
  assert.equal(b.passages[0].basedOn.origin, "unknown");
  assert.ok(b.passages[0].stale.some(s => s.includes("unknown")));
  await store.replacePassages(id, [reading("Plants are greener.")]);
  b = await store.bundle(id);
  assert.ok(b.passages[0].stale.some(s => s.includes("unknown")));
  await store.saveSummary(id, { patterns: [], survived: "Older reading" });
  assert.ok((await store.bundle(id)).summary.stale.some(s => s.includes("unknown")));
});

test("a model call retains its server input snapshot after an edit even if a save names the new input", async t => {
  const { store, id } = await fixture(t);
  let b = await store.bundle(id);
  const snapshot = await store.captureCallBasis(id, basis(b), "deflate");
  await store.saveRun(id, {}, changed);
  await store.recordCall(id, { callId: "call_old_input", purpose: "deflate", basedOn: snapshot });
  b = await store.bundle(id);
  await store.savePassage(id, "p001", reading("Plants are greener.", { callId: "call_old_input", basedOn: basis(b) }));
  b = await store.bundle(id);
  assert.equal(b.passages[0].basedOn.inputHash, sha256(original));
  assert.ok(b.passages[0].stale.includes("transcript changed since this analysis"));
  await store.savePassage(id, "p001", Object.assign({}, b.passages[0], { status: "running" }));
  assert.ok((await store.bundle(id)).passages[0].stale.includes("transcript changed since this analysis"), "the old reading stays stale while another explanation runs");
});

test("stale requests are refused before a model call; absent basis is never upgraded to current", async t => {
  const { store, id } = await fixture(t);
  const old = basis(await store.bundle(id));
  await store.saveRun(id, {}, changed);
  await assert.rejects(store.captureCallBasis(id, old, "deflate"), e => e.status === 409 && e.code === "input_changed");
  assert.equal((await store.captureCallBasis(id, undefined, "deflate")).origin, "unknown");
  await store.saveRun(id, {}, original);
  assert.equal((await store.captureCallBasis(id, old, "deflate")).inputHash, sha256(original), "an undone edit uses the identical text hash");
});

test("claim ids cannot be recycled for changed wording and remain stable for the unchanged claim", async t => {
  const { store, id } = await fixture(t);
  const b0 = await store.bundle(id);
  let doc = reading("Plants are greener.", { basedOn: basis(b0) });
  await store.savePassage(id, "p001", doc);
  let p = (await store.bundle(id)).passages[0];
  const oldId = p.analysis.claims[0].id;
  await store.mutateClaim(id, "p001", oldId, c => { c.receipts = [{ rid: "receipt_first", url: "https://example.org/plants", note: "kept" }]; });
  doc = reading("Plants are browner.", { basedOn: basis(b0), analyzedAt: "reading-2" });
  doc.analysis.claims[0].id = oldId;
  await store.savePassage(id, "p001", doc);
  let b = await store.bundle(id); p = b.passages[0];
  assert.notEqual(p.analysis.claims[0].id, oldId);
  assert.equal(p.analysis.claims[0].receipts.length, 0);
  assert.equal(b.run.orphans[0].receipts[0].rid, "receipt_first");
  await assert.rejects(store.mutateClaim(id, "p001", oldId, c => { c.searches = [{ query: "old search" }]; }), e => e.code === "claim_not_current");
  const currentId = p.analysis.claims[0].id;
  doc.analyzedAt = "reading-3"; doc.analysis.claims[0].id = "client_supplied_new_id";
  await store.savePassage(id, "p001", doc);
  assert.equal((await store.bundle(id)).passages[0].analysis.claims[0].id, currentId);
});

test("patterns keep the attribution and cards captured before a concurrent edit", async t => {
  const { store, id } = await fixture(t);
  let b = await store.bundle(id);
  await store.savePassage(id, "p001", reading("Plants are greener.", { basedOn: basis(b) }));
  b = await store.bundle(id);
  const snapshot = await store.captureCallBasis(id, Object.assign(basis(b), { passagesSig: "p001@reading-1" }), "patterns");
  await store.saveRun(id, { provenance: { overrides: { 0: "B" } } });
  await store.recordCall(id, { callId: "call_patterns", purpose: "patterns", basedOn: snapshot });
  await store.saveSummary(id, { patterns: [], survived: "Old patterns", callId: "call_patterns", basedOn: basis(await store.bundle(id)) });
  b = await store.bundle(id);
  assert.equal(b.summary.basedOn.attrSig, snapshot.attrSig);
  assert.ok(b.summary.stale.includes("attribution changed since the patterns were found"));
  assert.ok(b.summary.stale.includes("a card it was based on is stale"));
});

test("patterns built from fresh cards remain fresh when an unknown-origin card was deliberately excluded", async t => {
  const { store, id } = await fixture(t);
  await store.savePassage(id, "p001", reading("Plants are greener."));
  let b = await store.bundle(id);
  await store.savePassage(id, "p002", reading("The measurements agree.", { basedOn: basis(b), analyzedAt: "reading-2" }));
  b = await store.bundle(id);
  const snapshot = await store.captureCallBasis(id, Object.assign(basis(b), { passagesSig: "p002@reading-2" }), "patterns");
  await store.recordCall(id, { callId: "call_fresh_patterns", purpose: "patterns", basedOn: snapshot });
  await store.saveSummary(id, { patterns: [{ title: "Measurements", body: "The fresh card", passages: ["p002"] }], survived: "s", callId: "call_fresh_patterns" });
  assert.deepEqual((await store.bundle(id)).summary.stale, []);
});

test("the HTTP model route captures input before waiting and refuses stale prompts before calling the provider", async t => {
  const { store, id } = await fixture(t);
  const mock = createMockAI();
  let announce, finish;
  const started = new Promise(resolve => { announce = resolve; });
  const release = new Promise(resolve => { finish = resolve; });
  let calls = 0;
  const ai = Object.assign({}, mock, { async sample(args) { calls++; announce(); await release; return mock.sample(args); } });
  const { app, ready } = createApp({ dataDir: store.dataDir, ai }); await ready;
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = "http://127.0.0.1:" + server.address().port;
  const post = (url, data) => fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const before = await store.bundle(id);
  const pending = post("/api/sample", { prompt: "You are a deflation reader\n[0] A: Plants are greener.", json: true, runId: id, purpose: "deflate", basedOn: basis(before) });
  await started;
  await store.saveRun(id, {}, changed);
  finish();
  const response = await pending; assert.equal(response.status, 200);
  const out = await response.json();
  assert.equal(out.provenance.basedOn.inputHash, sha256(original));
  const current = await store.bundle(id);
  const saved = await fetch(base + "/api/runs/" + id + "/passages/p001", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reading("Plants are greener.", { callId: out.provenance.callId, basedOn: basis(current), analysis: out.data })) });
  assert.equal(saved.status, 200);
  assert.ok((await saved.json()).passages[0].stale.includes("transcript changed since this analysis"));
  const refused = await post("/api/sample", { prompt: "You are a deflation reader\n[0] A: Plants are greener.", json: true, runId: id, purpose: "deflate", basedOn: basis(before) });
  assert.equal(refused.status, 409); assert.equal(calls, 1);
});
