"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app"), { createMockAI } = require("../server/ai");
const { buildMarkdown } = require("../server/exportClaims");
const { claimAnalysis } = require("../server/preparation");
const Q = require("../server/quality");
const shared = require("../shared/transcript");

test("a one-level challenge or check explanation cannot pass preparation", () => {
  const a = shared.sanitizeAnalysis({ deflated: { hs: "Plants grew.", g5: "Plants grew." }, jump: { present: true, hs: "The inference is incomplete.", pivot: "Plants grew" }, fidelity: { grade: "faithful", notes: { hs: "Nothing added." } }, claims: [] });
  const issues = Q.contentIssues(a, { turnStart: 0, turnEnd: 0 }, shared.parseTranscript("A: Plants grew."), {}, "transcript");
  assert.ok(issues.includes("challenge needs both reading levels"));
  assert.ok(issues.includes("fidelity explanation needs both reading levels"));
});

async function fixture(t, ai = createMockAI()) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-preparation-"));
  const { app, store, ready } = createApp({ dataDir: dir, ai }); await ready;
  const server = await new Promise(r => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  const base = "http://127.0.0.1:" + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await fs.rm(dir, { recursive: true, force: true }); });
  async function api(method, url, body) { const r = await fetch(base + url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; }
  return { dir, store, api };
}
const basis = b => ({ inputHash: b.run.input.sha256, transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig });
async function run(f, text = "A: Plants are greener this year.\nB: The measurements agree.") {
  return (await f.api("POST", "/api/runs", { run: { kind: "transcript" }, transcript: text })).data;
}
async function passage(f, b) {
  return (await f.api("POST", "/api/runs/" + b.run.id + "/passages", { passages: [{ title: "Plants", turnStart: 0, turnEnd: 1, status: "pending" }] })).data;
}
function prompt(b) { return "You are a deflation reader.\n\nTurns (numbers in brackets):\n[0] A: Plants are greener this year.\n[1] B: The measurements agree."; }
async function sample(f, b, purpose = "deflate", customPrompt) {
  return f.api("POST", "/api/sample", { runId: b.run.id, passageId: "p001", purpose, basedOn: basis(b), json: true, prompt: customPrompt || prompt(b) });
}
async function save(f, b, result, purpose = "deflate") {
  const analysis = purpose === "claim" ? claimAnalysis(result.data.data, b) : result.data.data;
  return f.api("PUT", "/api/runs/" + b.run.id + "/passages/p001", Object.assign({}, b.passages[0], {
    status: "done", analysis, analyzedAt: new Date().toISOString(), callId: result.data.provenance.callId, basedOn: basis(b), expectedReadingRev: b.passages[0].readingRev || 0,
  }));
}

test("the existing pilot is held before reading and Markdown never publishes its unfinished analysis", async t => {
  const f = await fixture(t), b = (await f.api("GET", "/api/runs/pilot-jre2308")).data;
  assert.equal(b.attributionGate.status, "held");
  assert.ok(b.passages.every(p => p.readingGate.status === "held"));
  assert.equal(b.summary.readingGate.status, "held");
  assert.match(buildMarkdown(b), /\*\*Not shown\.\*\* Why: .*[Ss]peaker labels are still unresolved/);
  assert.ok(!buildMarkdown(b).includes(b.passages[0].analysis.deflated.hs));
});

test("undisputed labels pass two automatic checks without a human confirmation checkbox", async t => {
  const f = await fixture(t); let b = await run(f);
  b = (await f.api("POST", "/api/runs/" + b.run.id + "/prepare-speakers", {})).data;
  assert.equal(b.attributionGate.status, "ready");
  assert.equal(b.run.provenance.confirmedAt, undefined, "do not invent a person's sign-off");
  assert.equal(b.run.preparation.calls.length, 2);
  assert.equal(b.run.preparation.record.length, 2);
  const fake = (await f.api("PUT", "/api/runs/" + b.run.id, { run: { preparation: { status: "ready", inputHash: "forged" } } })).data;
  assert.notEqual(fake.run.preparation.inputHash, "forged");
});

test("a supported identity correction is applied and documented before reading", async t => {
  const ai = { kind: "mock", model: "identity-fixture", mock: true, sample: async () => ({ model: "identity-fixture", data: { decisions: [
    { turn: 0, status: "correct", speaker: "B", evidenceKind: "self_identification", evidenceQuote: "I am Jordan Peterson", reason: "The speaker identifies himself." },
    { turn: 1, status: "correct", speaker: "A", evidenceKind: "self_identification", evidenceQuote: "I am Joe Rogan", reason: "The speaker identifies himself." },
  ] } }) };
  const f = await fixture(t, ai); let b = await run(f, "A: I am Jordan Peterson and I teach psychology.\nB: I am Joe Rogan and I host this interview.");
  b = (await f.api("POST", "/api/runs/" + b.run.id + "/prepare-speakers", {})).data;
  assert.equal(b.attributionGate.status, "ready");
  assert.deepEqual(b.run.provenance.overrides, { 0: "B", 1: "A" });
  assert.equal(b.run.preparation.corrections.length, 2);
  assert.equal(b.run.preparation.corrections[0].evidenceQuote, "I am Jordan Peterson");
});

test("agreeing guesses and confidence scores cannot settle a disputed one-word reply", async t => {
  const ai = { kind: "mock", model: "guess-fixture", mock: true, sample: async () => ({ data: { decisions: [
    { turn: 0, status: "correct", speaker: "B", evidenceKind: "self_reference", evidenceQuote: "Yeah", confidence: 1, reason: "It is the guest's turn." },
    { turn: 1, status: "keep", speaker: "B", evidenceKind: "source_label" },
  ] } }) };
  const f = await fixture(t, ai); let b = await run(f, "A: Yeah.\nB: The measurements agree.");
  b = (await f.api("POST", "/api/runs/" + b.run.id + "/prepare-speakers", {})).data;
  assert.equal(b.attributionGate.status, "held"); assert.equal(b.run.preparation.unresolved.length, 1);
  assert.deepEqual(b.run.provenance.overrides, {});
  b = await passage(f, b);
  assert.equal((await sample(f, b)).status, 409, "the paid reading cannot start through unresolved attribution");
});

test("missing, duplicate, and disagreed turn decisions hold preparation instead of silently passing", async t => {
  let calls = 0;
  const ai = { kind: "mock", model: "incomplete", mock: true, sample: async () => ({ data: { decisions: ++calls === 1 ? [
    { turn: 0, status: "keep", speaker: "A" }, { turn: 0, status: "keep", speaker: "A" },
  ] : [{ turn: 0, status: "keep", speaker: "B" }] } }) };
  const f = await fixture(t, ai), b = await run(f);
  const prepared = (await f.api("POST", "/api/runs/" + b.run.id + "/prepare-speakers", {})).data;
  assert.equal(prepared.attributionGate.status, "held"); assert.equal(prepared.run.preparation.unresolved.length, 2);
});

test("a transcript edit during preparation cannot commit corrections to the newer input", async t => {
  const mock = createMockAI(); let started, release, first = true;
  const began = new Promise(r => { started = r; }), continueCall = new Promise(r => { release = r; });
  const ai = Object.assign({}, mock, { sample: async opts => { if (first) { first = false; started(); await continueCall; } return mock.sample(opts); } });
  const f = await fixture(t, ai), b = await run(f);
  const pending = f.api("POST", "/api/runs/" + b.run.id + "/prepare-speakers", {}); await began;
  await f.api("PUT", "/api/runs/" + b.run.id, { transcript: "A: The input changed.\nB: A different statement." }); release();
  assert.equal((await pending).status, 409);
  assert.equal((await f.store.bundle(b.run.id)).run.preparation, undefined);
});

test("a checked reading passes only after server review; a later forged or modified analysis is held", async t => {
  const f = await fixture(t); let b = await run(f);
  b = (await f.api("POST", "/api/runs/" + b.run.id + "/prepare-speakers", {})).data; b = await passage(f, b);
  const result = await sample(f, b); assert.equal(result.status, 200);
  b = (await save(f, b, result)).data;
  assert.equal(b.passages[0].readingGate.status, "ready");
  assert.equal(b.passages[0].provenance.review.approved, true);
  const p = JSON.parse(JSON.stringify(b.passages[0])); p.analysis.deflated.hs = "A stronger claim that was never checked.";
  p.provenance.review.approved = true; p.provenance.review.analysisHash = Q.analysisHash(p.analysis);
  const changed = (await f.api("PUT", "/api/runs/" + b.run.id + "/passages/p001", p)).data;
  assert.equal(changed.passages[0].readingGate.status, "held", "client review fields cannot approve altered words");
});

test("a quote's uniquely identifiable turn and speaker are corrected before the first response", async t => {
  const mock = createMockAI();
  const ai = Object.assign({}, mock, { sample: async o => {
    const r = await mock.sample(o); if (o.prompt.startsWith("Help a reader understand this passage")) r.data.asSaid = [{ turn: 99, speaker: "B", quote: "Plants are greener this year." }]; return r;
  } });
  const f = await fixture(t, ai); let b = await run(f);
  b = (await f.api("POST", "/api/runs/" + b.run.id + "/prepare-speakers", {})).data; b = await passage(f, b);
  const result = await sample(f, b); assert.equal(result.status, 200);
  assert.equal(result.data.data.asSaid[0].turn, 0); assert.equal(result.data.data.asSaid[0].speaker, "A");
  assert.equal(result.data.provenance.review.corrections.length, 1);
  b = (await save(f, b, result)).data; assert.equal(b.passages[0].readingGate.status, "ready");
  assert.equal(b.passages[0].quoteCheck.mismatched, 0);
});

test("a missing quote triggers one automatic repair and still cannot be approved by a model vote", async t => {
  const mock = createMockAI(); let generations = 0, fixes = 0;
  const ai = Object.assign({}, mock, { sample: async o => {
    const r = await mock.sample(o); if (o.prompt.startsWith("Help a reader understand this passage")) { generations++; if (generations === 1) r.data.asSaid[0].quote = "Words that nobody said."; }
    if (o.prompt.startsWith("Correct a reading.")) { fixes++; assert.match(o.prompt, /a quotation does not match the passage/); } return r;
  } });
  const f = await fixture(t, ai); let b = await run(f);
  b = (await f.api("POST", "/api/runs/" + b.run.id + "/prepare-speakers", {})).data; b = await passage(f, b);
  const result = await sample(f, b); assert.equal(result.status, 200);
  assert.equal(generations, 1, "one full draft"); assert.equal(fixes, 1, "one correction that changes only the quotation");
  assert.equal(result.data.provenance.review.attempts, 2); assert.deepEqual(result.data.provenance.review.changed, ["asSaid"]);
  b = (await save(f, b, result)).data; assert.equal(b.passages[0].readingGate.status, "ready");
  const calls = (await fs.readFile(path.join(f.dir, "runs", b.run.id, "calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.ok(calls.some(c => c.review && !c.review.approved), "the failed draft stays documented");
});

test("a failed review holds the reading after a bounded retry without replacing the current saved card", async t => {
  const mock = createMockAI(); let reviews = 0, checks = 0;
  const ai = Object.assign({}, mock, { sample: async o => o.prompt.startsWith("Review this reading") ? (++reviews, { data: { approved: false, issues: [{ field: "deflated", level: "hs", problem: "The rewrite removes a hedge." }] } })
    : o.prompt.startsWith("Check a correction") ? (++checks, { data: { resolved: [false], newIssues: [] } }) : mock.sample(o) });
  const f = await fixture(t, ai); let b = await run(f);
  b = (await f.api("POST", "/api/runs/" + b.run.id + "/prepare-speakers", {})).data; b = await passage(f, b);
  const result = await sample(f, b); assert.equal(result.status, 422); assert.equal(result.data.code, "reading_held");
  assert.equal(reviews, 1, "one full review"); assert.equal(checks, 2, "two bounded corrections, each checked");
  assert.deepEqual(result.data.issues, ["deflated.hs: The rewrite removes a hedge."]);
  assert.equal((await f.store.bundle(b.run.id)).passages[0].analysis, undefined);
});

test("a typed claim remains searchable without a model and its explanation needs the same review gate", async t => {
  const f = await fixture(t);
  let b = (await f.api("POST", "/api/runs", { run: { kind: "claim" }, transcript: "The Earth is getting greener" })).data;
  assert.equal(b.passages[0].readingGate.status, "ready");
  const result = await sample(f, b, "claim", "You are a deflation reader grading ONE claim\nThe claim:\n" + b.transcript);
  assert.equal(result.status, 200); b = (await save(f, b, result, "claim")).data;
  assert.equal(b.passages[0].readingGate.status, "ready");
  const p = b.passages[0]; delete p.callId; p.analysis.by = "person"; p.analysis.deflated.hs = "An invented factual explanation";
  b = (await f.api("PUT", "/api/runs/" + b.run.id + "/passages/p001", p)).data;
  assert.equal(b.passages[0].readingGate.status, "held");
});

test("model output cannot attach invented evidence as a person's source decision", async t => {
  const mock = createMockAI();
  const ai = Object.assign({}, mock, { sample: async o => {
    const r = await mock.sample(o);
    if (o.prompt.startsWith("Help a reader understand this passage")) { r.data.claims[0].receipts = [{ url: "https://example.org/invented", note: "Model attached this", relation: "supports" }]; r.data.claims[0].status = "receipt"; }
    return r;
  } });
  const f = await fixture(t, ai); let b = await run(f);
  b = (await f.api("POST", "/api/runs/" + b.run.id + "/prepare-speakers", {})).data; b = await passage(f, b);
  const result = await sample(f, b); assert.equal(result.status, 200);
  assert.deepEqual(result.data.data.claims[0].receipts, []); assert.equal(result.data.data.claims[0].status, "unchecked");
  b = (await save(f, b, result)).data; assert.deepEqual(b.passages[0].analysis.claims[0].receipts, []);
});
