"use strict";
/* Regression tests written from the independent review of 0.6.0 (findings F1–F7, N1, N2). Each reproduces the
   reported failure and asserts the corrected outcome. A passing test here is evidence the defect is gone. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawnSync } = require("child_process");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research/index");
const SH = require("../shared/transcript");

/* A research double whose answers can be held back and released: the "paused search" of F1. */
function pausableResearch() {
  const real = createResearch({ DEFLATE_MOCK_RESEARCH: "1" });
  const gates = [];
  return { config: real.config, release: () => { const g = gates.shift(); if (g) g(); }, async searchClaim(args) { await new Promise(r => gates.push(r)); return real.searchClaim(args); } };
}
async function start(dataDir, research) {
  const { app, ready } = createApp({ dataDir, ai: createMockAI(), research: research || createResearch({ DEFLATE_MOCK_RESEARCH: "1" }) });
  await ready;
  const server = await new Promise(res => { const s = app.listen(0, "127.0.0.1", () => res(s)); });
  const base = "http://127.0.0.1:" + server.address().port;
  const api = async (method, p, body) => { const r = await fetch(base + p, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = text; } return { status: r.status, data }; };
  return { server, base, api, close: () => new Promise(r => server.close(r)) };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "deflate-review-"));
const T = "A: Growth was 1.5% last year.\nB: Growth was 1-5% last year.\nA: The treatment helps.";
function reading(claims, at, extra) {
  return Object.assign({ title: "p", turnStart: 0, turnEnd: 2, status: "done", analyzedAt: at, analysis: { deflated: { hs: "d " + at, g5: "d" }, asSaid: [{ turn: 0, speaker: "A", quote: "Growth was 1.5% last year" }],
    claims: claims.map(c => Object.assign({ type: "fact", basis: "b" }, typeof c === "string" ? { text: c, speaker: "A" } : c)), judgments: { evidence: "weak", inference: "gap" } } }, extra || {});
}
async function labeledRun(api, transcript) {
  const b = (await api("POST", "/api/runs", { run: { speakers: [{ key: "A", name: "A" }, { key: "B", name: "B" }] }, transcript: transcript || T })).data;
  await api("PUT", "/api/runs/" + b.run.id, { run: { provenance: { overrides: {}, flags: [], confirmedAt: "2026-10-02T00:00:00.000Z", confirmedBy: "test", method: "t" }, status: "attributed" } });
  await api("POST", "/api/runs/" + b.run.id + "/passages", { passages: [{ title: "p", turnStart: 0, turnEnd: 2 }] });
  return b.run.id;
}

test("F1: a search that finishes after a newer reading was saved never reactivates the old reading", async () => {
  const dataDir = tmp(); const research = pausableResearch(); const s = await start(dataDir, research);
  try {
    const id = await labeledRun(s.api);
    let b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t1"))).data;
    const oldClaim = b.passages[0].analysis.claims[0]; assert.equal(b.passages[0].readingRev, 1);
    // start the search; it blocks inside the research double
    const pending = s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + oldClaim.id + "/search", {});
    await new Promise(r => setTimeout(r, 50));
    // meanwhile a newer reading with a different claim is saved
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 2.5%."], "t2"))).data;
    assert.equal(b.passages[0].analysis.deflated.hs, "d t2"); assert.equal(b.passages[0].readingRev, 2);
    research.release();
    const r = await pending;
    assert.equal(r.status, 200); assert.ok(r.data.parked, "the late result is parked, not written over the new reading"); assert.equal(r.data.late, false); assert.equal(r.data.candidates.length, 0);
    b = (await s.api("GET", "/api/runs/" + id + "?history=full")).data;
    const p = b.passages[0];
    assert.equal(p.analysis.deflated.hs, "d t2", "the active reading is still the newer one"); assert.equal(p.analysis.claims[0].text, "Growth is 2.5%."); assert.equal((p.analysis.claims[0].searches || []).length, 0);
    assert.equal(p.history.length, 1); assert.equal(p.history[0].analysis.deflated.hs, "d t1");
    assert.equal(b.run.orphans.length, 1); assert.equal(b.run.orphans[0].claimText, "Growth is 1.5%."); assert.equal(b.run.orphans[0].claimId, oldClaim.id); assert.equal(b.run.orphans[0].searches.length, 3); assert.ok(b.run.orphans[0].searches.every(x => x.late)); assert.equal(b.run.orphans[0].candidates.length, 2); assert.match(b.run.orphans[0].why, /reading changed while the search ran/);
    // the same race where the claim SURVIVES the re-read: the result attaches to that claim, marked late
    const c2 = b.passages[0].analysis.claims[0];
    const pending2 = s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + c2.id + "/search", {});
    await new Promise(r => setTimeout(r, 50));
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 2.5%."], "t3"))).data; assert.equal(b.passages[0].readingRev, 3); assert.equal(b.passages[0].analysis.claims[0].id, c2.id, "same claim keeps its id");
    research.release();
    const r2 = await pending2; assert.equal(r2.status, 200); assert.equal(r2.data.late, true); assert.equal(r2.data.parked, null);
    b = (await s.api("GET", "/api/runs/" + id)).data;
    assert.equal(b.passages[0].analysis.deflated.hs, "d t3"); assert.equal(b.passages[0].analysis.claims[0].searches.length, 3); assert.ok(b.passages[0].analysis.claims[0].searches.every(x => x.late && x.readingRev === 2 && x.attachedReadingRev === 3));
    // a search started against a reading the client no longer has is refused outright when the client says which it saw
    const stale = await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + c2.id + "/search", { expectedReadingRev: 1 });
    assert.equal(stale.status, 409); assert.equal(stale.data.code, "stale_reading");
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("F2: evidence never follows a changed meaning or a different speaker, and mutations address claims by id, not position", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const id = await labeledRun(s.api);
    // A: speaker A's "Growth was 1.5%." gets a source; the next reading has speaker B's "Growth was 1–5%."
    let b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading([{ text: "Growth was 1.5%.", speaker: "A" }], "t1"))).data;
    const a1 = b.passages[0].analysis.claims[0];
    await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + a1.id + "/receipts", { url: "https://example.org/a", note: "for A's 1.5%" });
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading([{ text: "Growth was 1–5%.", speaker: "B" }], "t2"))).data;
    const b1 = b.passages[0].analysis.claims[0];
    assert.notEqual(b1.id, a1.id, "a different claim gets a different id"); assert.equal((b1.receipts || []).length, 0, "the source did not transfer");
    assert.equal(b.passages[0].rerun.orphaned, 1); assert.equal(b.run.orphans.length, 1); assert.equal(b.run.orphans[0].claimText, "Growth was 1.5%."); assert.equal(b.run.orphans[0].speaker, "A"); assert.equal(b.run.orphans[0].receipts.length, 1);
    // same words, different speaker: also not the same claim
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading([{ text: "Growth was 1–5%.", speaker: "A" }], "t3"))).data;
    assert.notEqual(b.passages[0].analysis.claims[0].id, b1.id);
    // same words, same speaker, different punctuation only: the same claim
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001?history=full", reading([{ text: "growth was 1–5%", speaker: "A" }], "t4"))).data;
    assert.equal(b.passages[0].analysis.claims[0].id, b.passages[0].history[2].analysis.claims[0].id);
    // B: tab one holds claim X at position 0; tab two reorders so Y is at position 0; tab one attaches to X by id
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading([{ text: "X is so.", speaker: "A" }, { text: "Y is so.", speaker: "A" }], "t5"))).data;
    const X = b.passages[0].analysis.claims[0], Y = b.passages[0].analysis.claims[1]; const revSeen = b.passages[0].readingRev;
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading([{ text: "Y is so.", speaker: "A" }, { text: "X is so.", speaker: "A" }], "t6"))).data;
    assert.equal(b.passages[0].analysis.claims[0].id, Y.id); assert.equal(b.passages[0].analysis.claims[1].id, X.id);
    let r = await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + X.id + "/receipts", { url: "https://example.org/x", note: "for X" });
    assert.equal(r.status, 200);
    const after = r.data.passages[0].analysis.claims;
    assert.equal(after.find(c => c.id === X.id).receipts.length, 1, "the source went to X"); assert.equal((after.find(c => c.id === Y.id).receipts || []).length, 0, "not to whatever sits at position 0");
    // tab one also said which reading it saw; the reading moved, so a guarded write is refused instead of guessed
    r = await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + X.id + "/receipts", { url: "https://example.org/x2", note: "guarded", expectedReadingRev: revSeen });
    assert.equal(r.status, 409); assert.equal(r.data.code, "stale_reading");
    r = await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/0/receipts", { url: "https://example.org/x3" });
    assert.equal(r.status, 404, "positions are not addresses");
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("F3: accepting a candidate twice yields one source; rejecting an accepted candidate withdraws its source with the reason on record", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const b0 = (await s.api("POST", "/api/runs", { run: { kind: "claim" }, transcript: "Accept me twice" })).data; const id = b0.run.id; const cid = b0.passages[0].analysis.claims[0].id;
    const CL = "/api/runs/" + id + "/passages/p001/claims/" + cid;
    const sr = (await s.api("POST", CL + "/search", {})).data; const clean = sr.candidates.find(x => !x.notices.length);
    let r = await s.api("POST", CL + "/candidates/" + clean.id + "/accept", { note: "once" }); assert.equal(r.status, 200); assert.equal(r.data.outcome, "accepted");
    r = await s.api("POST", CL + "/candidates/" + clean.id + "/accept", { note: "twice" }); assert.equal(r.status, 200); assert.equal(r.data.outcome, "already accepted");
    let c = r.data.passages[0].analysis.claims[0];
    assert.equal(c.receipts.length, 1, "one source, not two"); assert.equal(c.receipts[0].note, "once"); assert.equal(c.receipts[0].rid, "rc_" + clean.id);
    r = await s.api("POST", CL + "/candidates/" + clean.id + "/reject", { reason: "wrong_document_type", detail: "a letter, not a study" }); assert.equal(r.status, 200); assert.match(r.data.outcome, /withdrawn/);
    c = r.data.passages[0].analysis.claims[0];
    assert.equal(c.receipts.length, 1); assert.ok(c.receipts[0].withdrawnAt); assert.match(c.receipts[0].withdrawReason, /candidate rejected: wrong_document_type \(a letter, not a study\)/);
    assert.equal(c.candidates.find(x => x.id === clean.id).status, "rejected"); assert.equal(c.rejections.length, 1); assert.equal(c.rejections[0].withdrewReceipt, true);
    assert.equal(c.status, "searched", "no active source remains");
    r = await s.api("POST", CL + "/candidates/" + clean.id + "/accept", { note: "again?" }); assert.equal(r.status, 409); assert.equal(r.data.code, "candidate_rejected");
    r = await s.api("POST", CL + "/candidates/" + clean.id + "/reject", { reason: "duplicate" }); assert.equal(r.status, 200); assert.equal(r.data.outcome, "already rejected"); assert.equal(r.data.passages[0].analysis.claims[0].rejections.length, 1);
    // withdrawing a source by hand marks its candidate withdrawn too, so it cannot be re-accepted silently
    const sr2 = (await s.api("POST", CL + "/search", {})).data; // decided candidates stay decided; only the never-decided one comes back
    assert.equal(sr2.candidates.length, 1); assert.ok(sr2.candidates[0].notices.length, "the undecided retracted candidate"); assert.equal(sr2.bundle.passages[0].analysis.claims[0].candidates.find(x => x.id === clean.id).status, "rejected");
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("F4: patterns and obligations reflect stale attribution; research on a stale card is labelled provisional", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const id = await labeledRun(s.api);
    const source = (await s.api("GET", "/api/runs/" + id)).data;
    let b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth was 1.5%."], "t1", { basedOn: { transcriptUpdatedAt: source.run.transcriptUpdatedAt, attrSig: source.attrSig } }))).data;
    b = (await s.api("PUT", "/api/runs/" + id + "/summary", { patterns: [{ title: "t", body: "b", passages: ["p001"] }], survived: "s", basedOn: { passagesSig: "p001@t1", transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig } })).data;
    assert.deepEqual(b.summary.stale, []); assert.ok(b.summary.basedOn.attrSig, "the summary records the attribution it was based on");
    let ob = (await s.api("GET", "/api/runs/" + id + "/obligations.json")).data;
    assert.equal(ob.obligations[0].provisional, true); assert.ok(ob.obligations[0].provisional_reasons.includes("reading held before display"), "the manually supplied legacy reading has not passed preparation"); assert.deepEqual(ob.obligations[0].stale, []); assert.ok(ob.obligations[0].claim_id); assert.equal(ob.obligations[0].reading_rev, 1);
    // attribution changes: confirmation clears, the card is stale, and so is the summary
    b = (await s.api("PUT", "/api/runs/" + id, { run: { provenance: { overrides: { "1": "A" }, flags: [] } } })).data;
    assert.ok(b.passages[0].stale.includes("attribution changed since this analysis"));
    assert.ok(b.summary.stale.includes("attribution changed since the patterns were found")); assert.ok(b.summary.stale.includes("a card it was based on is stale"));
    ob = (await s.api("GET", "/api/runs/" + id + "/obligations.json")).data;
    assert.equal(ob.obligations[0].provisional, true); assert.ok(ob.obligations[0].provisional_reasons.includes("attribution changed since this analysis")); assert.ok(ob.obligations[0].provisional_reasons.includes("speaker preparation is unresolved")); assert.equal(ob.run.attributionConfirmed, false);
    const cid = b.passages[0].analysis.claims[0].id;
    const sr = (await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + cid + "/search", {}));
    assert.equal(sr.status, 200, "provisional research remains available"); assert.ok(sr.data.provisional.length >= 2); assert.ok(sr.data.attempts.every(a => a.provisional && a.provisional.length));
    const ex = (await s.api("GET", "/api/runs/" + id + "/export.json")).data;
    assert.ok(ex.claims[0].provisional.length >= 2); assert.ok(ex.claims[0].searches.every(a => a.provisional.length));
    // transcript change marks the summary too
    b = (await s.api("PUT", "/api/runs/" + id, { run: {}, transcript: T + "\nB: One more." })).data;
    assert.ok(b.summary.stale.includes("transcript changed since the patterns were found"));
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("F5: quote matching keeps negation and numeric punctuation; a relocated quote reports the turn the words are in", () => {
  assert.equal(SH.verifyQuote("no … treatment helps", "treatment helps"), false);
  assert.equal(SH.verifyQuote("no … treatment helps", "no, the treatment helps"), true);
  assert.equal(SH.verifyQuote("Growth was 1.5%.", "Growth was 1–5%."), false);
  assert.equal(SH.verifyQuote("Growth was 1–5%.", "Growth was 1-5%."), true, "a typographic dash is tolerated; a decimal point is not a dash");
  assert.equal(SH.verifyQuote("Temperature was -5 degrees.", "Temperature was 5 degrees."), false);
  assert.equal(SH.verifyQuote("Temperature was -5 degrees.", "Temperature was -5 degrees"), true);
  assert.equal(SH.verifyQuote("$599 to $399", "cut from $599 to $399 a year"), true); assert.equal(SH.verifyQuote("599 to 399", "cut from $599 to $399"), false);
  assert.equal(SH.verifyQuote("1,000 people", "about 1,000 people"), true); assert.equal(SH.verifyQuote("1000 people", "about 1,000 people"), false);
  assert.equal(SH.verifyQuote("a … b", "a b"), true, "one-letter fragments are kept");
  assert.equal(SH.verifyQuote("pornography use rose … the pill", "the pill made sex less dangerous and pornography use rose"), false, "order still enforced");
  assert.equal(SH.verifyQuote("porn", "pornography"), false, "word boundaries still enforced");
  const turns = SH.parseTranscript("A: Something else entirely.\nB: The treatment helps.");
  const p = { turnStart: 0, turnEnd: 1, analysis: { asSaid: [{ turn: 0, speaker: "B", quote: "The treatment helps." }], jump: {} } };
  const sum = SH.verifyPassage(turns, {}, p); const q = p.analysis.asSaid[0];
  assert.equal(q.verbatim, true); assert.equal(q.turnOk, true, "turn 0 is inside the passage"); assert.equal(q.matchedTurn, 1); assert.equal(q.relocated, true); assert.deepEqual(q.foundIn, [1]); assert.equal(sum.relocated, 1);
  // the renderer and the export show the matched turn, never the wrong supplied one
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(app, /var shownTurn = q\.verbatim && q\.matchedTurn != null \? q\.matchedTurn : q\.turn;/);
  assert.match(app, /the card named turn " \+ q\.turn \+ "; the words are in turn " \+ q\.matchedTurn/);
});

test("F6: an empty analysis cannot become a finished card, in either mode", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const id = await labeledRun(s.api);
    const hollow = SH.sanitizeAnalysis({});
    let r = await s.api("PUT", "/api/runs/" + id + "/passages/p001", { title: "p", turnStart: 0, turnEnd: 2, status: "done", analysis: hollow, analyzedAt: "t" });
    assert.equal(r.status, 400); assert.match(r.data.error, /a finished reading needs/); assert.match(r.data.error, /was not saved as done/);
    assert.equal((await s.api("GET", "/api/runs/" + id)).data.passages[0].status, "pending");
    const c = (await s.api("POST", "/api/runs", { run: { kind: "claim" }, transcript: "A claim" })).data;
    r = await s.api("PUT", "/api/runs/" + c.run.id + "/passages/p001", { title: "p", turnStart: 0, turnEnd: 0, status: "done", analysis: hollow, analyzedAt: "t" });
    assert.equal(r.status, 400); assert.match(r.data.error, /exactly one claim with text/);
    assert.equal((await s.api("GET", "/api/runs/" + c.run.id)).data.passages[0].analysis.claims[0].text, "A claim", "the person's claim is untouched");
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("F7: the overview prompt is built from each card's fair reading and final assessment, marks a withdrawn concern, and allows no recurring concern", () => {
  const P = require("../shared/prompts");
  const card = (id, survives) => ({ id, title: "T" + id, turnStart: 0, turnEnd: 1, analysis: { deflated: { hs: "plain " + id }, defense: { hs: "fair reading " + id }, jump: { present: !!survives, hs: "concern " + id }, revision: { jumpSurvives: survives, hs: "final " + id }, claims: [] } });
  const prompt = P.patterns({}, [card("p001", "no"), card("p002", "")]);
  assert.match(prompt, /A fair reading: fair reading p001/); assert.match(prompt, /final p001/);
  assert.match(prompt, /the initial concern was withdrawn/); assert.match(prompt, /no concern was raised/);
  assert.doesNotMatch(prompt, /concern p001/, "an initial concern is not handed to the overview as a finding");
  assert.match(prompt, /Reporting no recurring concern is a correct and common answer/);
});

test("N1: editing a typed claim makes the new wording the claim; the old reading and its evidence are kept apart; an explanation of the old wording is refused", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    let b = (await s.api("POST", "/api/runs", { run: { kind: "claim" }, transcript: "The Earth is getting greener" })).data; const id = b.run.id;
    const oldClaim = b.passages[0].analysis.claims[0]; const t0 = b.run.transcriptUpdatedAt;
    await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + oldClaim.id + "/receipts", { url: "https://example.org/green", note: "about greener" });
    // the person edits the input
    b = (await s.api("PUT", "/api/runs/" + id + "?history=full", { run: {}, transcript: "The Earth is getting browner" })).data;
    const p = b.passages[0], nc = p.analysis.claims[0];
    assert.equal(nc.text, "The Earth is getting browner", "the card shows the current claim"); assert.notEqual(nc.id, oldClaim.id); assert.equal(nc.userSupplied, true); assert.equal(p.analysis.by, "person");
    assert.deepEqual(p.stale, [], "a reading of the current input is current"); assert.equal(p.readingRev, 2); assert.equal(b.run.title, "The Earth is getting browner");
    assert.equal(p.history.length, 1); assert.equal(p.history[0].analysis.claims[0].text, "The Earth is getting greener");
    assert.equal((nc.receipts || []).length, 0); assert.equal(b.run.orphans.length, 1); assert.equal(b.run.orphans[0].claimText, "The Earth is getting greener"); assert.equal(b.run.orphans[0].receipts.length, 1);
    // an explanation prepared for the OLD wording cannot be saved as the current reading
    const stale = { title: "x", turnStart: 0, turnEnd: 0, status: "done", analyzedAt: "later", analysis: { by: "model", deflated: { hs: "greener explained", g5: "" }, claims: [{ text: "The Earth is getting greener", type: "contested", basis: "b", userSupplied: true }] }, basedOn: { transcriptUpdatedAt: t0, attrSig: b.attrSig } };
    let r = await s.api("PUT", "/api/runs/" + id + "/passages/p001", stale);
    assert.equal(r.status, 409); assert.equal(r.data.code, "claim_edited"); assert.match(r.data.error, /browner/);
    b = (await s.api("GET", "/api/runs/" + id)).data; assert.equal(b.passages[0].analysis.claims[0].text, "The Earth is getting browner"); assert.deepEqual(b.passages[0].stale, []);
    // an explanation of the current wording, prepared from an older reading revision, is refused when it says so
    const explained = { title: "x", turnStart: 0, turnEnd: 0, status: "done", analyzedAt: "later2", analysis: { by: "model", deflated: { hs: "browner explained", g5: "" }, claims: [{ text: "The Earth is getting browner", type: "contested", basis: "b", userSupplied: true }] }, basedOn: { transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig }, expectedReadingRev: 1 };
    r = await s.api("PUT", "/api/runs/" + id + "/passages/p001", explained); assert.equal(r.status, 409); assert.equal(r.data.code, "stale_reading");
    explained.expectedReadingRev = 2;
    r = await s.api("PUT", "/api/runs/" + id + "/passages/p001", explained); assert.equal(r.status, 200);
    const done = r.data.passages[0]; assert.equal(done.analysis.by, "model"); assert.equal(done.analysis.claims[0].id, nc.id, "the explained claim keeps the current claim's id"); assert.deepEqual(done.stale, []); assert.equal(done.readingRev, 3);
    // one stamped with the OLD input revision is saved but stale, never shown as current
    const oldBased = Object.assign({}, explained, { analyzedAt: "later3", basedOn: { transcriptUpdatedAt: t0, attrSig: b.attrSig }, expectedReadingRev: 3 });
    r = await s.api("PUT", "/api/runs/" + id + "/passages/p001", oldBased); assert.equal(r.status, 200); assert.ok(r.data.passages[0].stale.includes("transcript changed since this analysis"));
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("N2: the launcher does not mistake another program's health route for Deflate Lens", async () => {
  const foreign = http.createServer((req, res) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ ok: true, version: "unrelated-application-9", service: "not-deflate" })); });
  await new Promise(r => foreign.listen(0, "127.0.0.1", r)); const port = foreign.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-n2-"));
  let pid = null;
  try {
    for (const name of ["package.json", "package-lock.json", ".env.example", "server", "shared", "public", "scripts", "examples"]) fs.cpSync(path.join(__dirname, "..", name), path.join(dir, name), { recursive: true, preserveTimestamps: true });
    fs.symlinkSync(path.join(__dirname, "..", "node_modules"), path.join(dir, "node_modules"), "dir");
    fs.writeFileSync(path.join(dir, ".env"), "DEFLATE_MOCK_AI=1\n");
    const r = spawnSync(process.execPath, [path.join(dir, "scripts", "launch.js"), "--check", "--no-open", "--port", String(port)], { cwd: dir, encoding: "utf8", env: Object.assign({}, process.env, { DEFLATE_MOCK_AI: "1" }) });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /Already running/); assert.match(r.stdout, /not Deflate Lens/); assert.match(r.stdout, /Ready and answering at http:\/\/127\.0\.0\.1:(\d+)/);
    const used = Number(/Ready and answering at http:\/\/127\.0\.0\.1:(\d+)/.exec(r.stdout)[1]); assert.notEqual(used, port);
    pid = Number(/server pid (\d+)/.exec(r.stdout)[1]);
    const h = await (await fetch("http://127.0.0.1:" + used + "/api/health")).json(); assert.equal(h.app, "deflate-lens");
    // a different Deflate Lens installation (other data folder) is not reused either
    const other = spawnSync(process.execPath, [path.join(dir, "scripts", "launch.js"), "--check", "--no-open", "--port", String(used)], { cwd: dir, encoding: "utf8", env: Object.assign({}, process.env, { DEFLATE_MOCK_AI: "1", DATA_DIR: path.join(dir, "other-data") }) });
    assert.match(other.stdout, /A different Deflate Lens is answering/);
    const pid2 = /server pid (\d+)/.exec(other.stdout); if (pid2) { try { process.kill(Number(pid2[1]), "SIGINT"); } catch (e) {} }
  } finally {
    if (pid) { try { process.kill(pid, "SIGINT"); } catch (e) {} }
    foreign.close();
    // wait until the launched servers have really gone before removing their folder
    for (let i = 0; i < 20; i++) { let alive = false; if (pid) { try { process.kill(pid, 0); alive = true; } catch (e) {} } if (!alive) break; await new Promise(r => setTimeout(r, 150)); }
    await new Promise(r => setTimeout(r, 300)); fs.rmSync(dir, { recursive: true, force: true });
  }
});
