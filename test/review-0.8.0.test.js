"use strict";
/* Regressions from the adversarial review of 0.8.0 (findings H1–H3, M1–M8, L1–L6). Each reproduces the attack the
   reviewer demonstrated and asserts the corrected outcome. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research/index");
const { gdelt, gdeltWords, normalizeUrl } = require("../server/research/connectors");

const sha = s => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const KEY = "sk-ant-" + "b".repeat(40);
async function start(dataDir, extra) {
  const { app, ready, store } = createApp(Object.assign({ dataDir, ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }) }, extra || {}));
  await ready;
  const server = await new Promise(res => { const s = app.listen(0, "127.0.0.1", () => res(s)); });
  const base = "http://127.0.0.1:" + server.address().port;
  const api = async (method, p, body) => { const r = await fetch(base + p, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = text; } return { status: r.status, data, text }; };
  return { server, base, api, store, close: () => new Promise(r => server.close(r)) };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "deflate-rev8-"));
const T1 = "A: Growth was 1.5% last year.\nB: Growth was 1-5% last year.\nA: The treatment helps.";
function reading(claims, at, extra) {
  return Object.assign({ title: "p", turnStart: 0, turnEnd: 2, status: "done", analyzedAt: at, analysis: { deflated: { hs: "d " + at, g5: "d" }, asSaid: [{ turn: 0, speaker: "A", quote: "Growth was 1.5% last year" }],
    claims: claims.map(c => Object.assign({ type: "fact", basis: "b" }, typeof c === "string" ? { text: c, speaker: "A" } : c)), judgments: { evidence: "weak", inference: "gap" } } }, extra || {});
}
async function labeledRun(api, transcript) {
  const b = (await api("POST", "/api/runs", { run: { speakers: [{ key: "A", name: "A" }, { key: "B", name: "B" }] }, transcript: transcript || T1 })).data;
  await api("PUT", "/api/runs/" + b.run.id, { run: { provenance: { overrides: {}, flags: [], confirmedAt: "2026-10-02T00:00:00.000Z", confirmedBy: "test", method: "t" }, status: "attributed" } });
  await api("POST", "/api/runs/" + b.run.id + "/passages", { passages: [{ title: "p", turnStart: 0, turnEnd: 2 }] });
  return b.run.id;
}
const clone = x => JSON.parse(JSON.stringify(x));
function fakeFetch(script) { let i = 0; const calls = []; const f = async url => { calls.push(String(url)); const step = script[Math.min(i++, script.length - 1)]; return { status: step.status || 200, headers: { get: () => null }, text: async () => typeof step.body === "string" ? step.body : JSON.stringify(step.body) }; }; f.calls = calls; return f; }

test("H1: a parked record is never lost when the passage write that adopts it is refused", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const id = await labeledRun(s.api);
    let b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t1"))).data;
    const c = b.passages[0].analysis.claims[0];
    await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + c.id + "/receipts", { url: "https://example.org/evidence", note: "e" });
    b = (await s.api("POST", "/api/runs/" + id + "/passages", { passages: [{ title: "p", turnStart: 0, turnEnd: 2 }] })).data;
    assert.equal(b.run.orphans.length, 1);
    const r = await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t2", { stake: "see " + KEY }));
    assert.equal(r.status, 400); assert.equal(r.data.code, "key_in_document");
    b = (await s.api("GET", "/api/runs/" + id)).data;
    assert.equal(b.run.orphans.length, 1, "still parked"); assert.equal(b.run.orphans[0].receipts[0].url, "https://example.org/evidence"); assert.equal(b.passages[0].status, "pending");
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t2"))).data;
    assert.equal(b.run.orphans.length, 0); assert.equal(b.passages[0].analysis.claims[0].receipts[0].url, "https://example.org/evidence", "adopted by the next good save");
  } finally { await s.close(); }
});

test("H2: a whole-passage save can neither strip nor forge a receipt's relation, add a receipt with a bad link or fake provenance, nor flip a candidate's decision", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const id = await labeledRun(s.api);
    let b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t1"))).data;
    const c = b.passages[0].analysis.claims[0]; const P = "/api/runs/" + id + "/passages/p001/claims/" + c.id;
    const sr = (await s.api("POST", P + "/search", {})).data; const cand = sr.candidates[0];
    b = (await s.api("POST", P + "/candidates/" + cand.id + "/accept", { note: "n", relation: "contradicts" })).data;
    b = (await s.api("PUT", P + "/receipts/" + b.passages[0].analysis.claims[0].receipts[0].rid + "/relation", { relation: "supports" })).data;
    const good = clone(b.passages[0]); delete good.id; delete good.stale; delete good.quoteCheck;
    // 1. same reading, relation fields omitted (a stale tab)
    const stripped = clone(good); const rc = stripped.analysis.claims[0].receipts[0]; delete rc.relation; delete rc.relationBy; delete rc.relationAt; delete rc.relationHistory;
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", stripped)).data;
    let r0 = b.passages[0].analysis.claims[0].receipts[0]; assert.equal(r0.relation, "supports"); assert.equal(r0.relationHistory.length, 1); assert.equal(b.passages[0].readingRev, 1);
    // 2. forged relation and provenance on the existing receipt
    const forged = clone(good); Object.assign(forged.analysis.claims[0].receipts[0], { relation: "verified", relationBy: "Claude (model)", relationHistory: [{ relation: "verified" }] });
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", forged)).data;
    r0 = b.passages[0].analysis.claims[0].receipts[0]; assert.equal(r0.relation, "supports"); assert.equal(r0.relationBy, "person at this computer"); assert.equal(r0.relationHistory.length, 1);
    // 3. a new receipt with a javascript: link, a model byline and a forged relation; the candidate flipped to rejected
    const inject = clone(good); inject.analysis.claims[0].receipts.push({ rid: "rl_forged", url: "javascript:alert(1)", addedBy: "the model", relation: "supports" }, { rid: "rl_ok", url: "https://example.org/ok", note: "fine", addedBy: "the model", relation: "verified", relationBy: "the model", relationHistory: [{ relation: "x" }] });
    inject.analysis.claims[0].candidates.find(x => x.id === cand.id).status = "rejected";
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", inject)).data;
    const cl = b.passages[0].analysis.claims[0];
    assert.equal(cl.receipts.length, 2, "the javascript: link was dropped; the http one was added");
    const added = cl.receipts.find(x => x.rid === "rl_ok"); assert.equal(added.relation, "unstated", "outside the closed set: unstated"); assert.equal(added.relationBy, undefined); assert.equal(added.relationHistory, undefined); assert.equal(added.addedBy, "the model", "the byline is whatever was sent; it is not a server field");
    assert.equal(cl.candidates.find(x => x.id === cand.id).status, "accepted", "a decision is made through its route, not by a save");
    const exp = (await s.api("GET", "/api/runs/" + id + "/export.json")).data; assert.ok(!/verified/i.test(JSON.stringify(exp.claims[0].receipts)));
    const md = (await s.api("GET", "/api/runs/" + id + "/export.md")).text; assert.ok(!/\[verified\]/.test(md));
    // withdrawal marks cannot be cleared by a save either
    await s.api("POST", P + "/receipts/" + r0.rid + "/withdraw", { reason: "w" });
    const unwithdraw = clone((await s.api("GET", "/api/runs/" + id)).data.passages[0]); delete unwithdraw.id; delete unwithdraw.stale; delete unwithdraw.quoteCheck; delete unwithdraw.analysis.claims[0].receipts[0].withdrawnAt;
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", unwithdraw)).data; assert.ok(b.passages[0].analysis.claims[0].receipts[0].withdrawnAt);
  } finally { await s.close(); }
});

test("H3: accepting a candidate again after withdrawing it makes a new receipt with its own id; the old stays withdrawn; relation and withdrawal address the active one", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const id = await labeledRun(s.api);
    let b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t1"))).data;
    const c = b.passages[0].analysis.claims[0]; const P = "/api/runs/" + id + "/passages/p001/claims/" + c.id;
    const cand = (await s.api("POST", P + "/search", {})).data.candidates[0];
    await s.api("POST", P + "/candidates/" + cand.id + "/accept", { note: "first" });
    await s.api("POST", P + "/receipts/rc_" + cand.id + "/withdraw", { reason: "second thoughts" });
    const again = await s.api("POST", P + "/candidates/" + cand.id + "/accept", { note: "third thoughts", relation: "mentions" });
    assert.equal(again.status, 200); assert.equal(again.data.outcome, "accepted again after a withdrawal");
    let rcs = again.data.passages[0].analysis.claims[0].receipts;
    assert.equal(rcs.length, 2); assert.equal(rcs[0].rid, "rc_" + cand.id); assert.ok(rcs[0].withdrawnAt); assert.equal(rcs[1].rid, "rc_" + cand.id + "_2"); assert.equal(rcs[1].withdrawnAt, undefined); assert.equal(rcs[1].reaccepted, true);
    const rel = await s.api("PUT", P + "/receipts/" + rcs[1].rid + "/relation", { relation: "supports" }); assert.equal(rel.status, 200); assert.equal(rel.data.passages[0].analysis.claims[0].receipts[1].relation, "supports");
    const idem = await s.api("POST", P + "/candidates/" + cand.id + "/accept", { note: "x" }); assert.equal(idem.data.outcome, "already accepted"); assert.equal(idem.data.passages[0].analysis.claims[0].receipts.length, 2);
    const wd = await s.api("POST", P + "/receipts/" + rcs[1].rid + "/withdraw", { reason: "done" }); rcs = wd.data.passages[0].analysis.claims[0].receipts;
    assert.ok(rcs[1].withdrawnAt); assert.equal(wd.data.passages[0].analysis.claims[0].status, "searched", "no active source; the search stays on record"); assert.equal(wd.data.passages[0].analysis.claims[0].candidates[0].status, "withdrawn");
  } finally { await s.close(); }
});

test("M1/L3: a re-segment binds finished readings to the text and their call records, drops client history, and a typed claim cannot be re-segmented or given a second card", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const id = await labeledRun(s.api);
    const source = (await s.api("GET", "/api/runs/" + id)).data;
    const call = (await s.api("POST", "/api/sample", { prompt: "You are a deflation reader\n[0] A: x", json: true, runId: id, purpose: "deflate", basedOn: { transcriptUpdatedAt: source.run.transcriptUpdatedAt, attrSig: source.attrSig } })).data.provenance;
    let b = (await s.api("POST", "/api/runs/" + id + "/passages", { passages: [Object.assign(reading(["Growth is 1.5%."], "t1"), { callId: call.callId, provenance: { forged: true }, history: [{ forged: true }], analysis: Object.assign(reading([]).analysis, { claims: [{ text: "Growth is 1.5%.", speaker: "A", type: "fact", basis: "b", receipts: [{ url: "javascript:x", relation: "verified" }, { url: "https://example.org/p", relation: "supports", relationBy: "model" }] }] }) })] })).data;
    const p = b.passages[0];
    assert.equal(p.basedOn.inputHash, sha(T1)); assert.deepEqual(p.stale, []); assert.equal(p.provenance.recorded, true); assert.equal(p.provenance.callId, call.callId); assert.equal(p.history, undefined);
    assert.equal(p.analysis.claims[0].receipts.length, 1); assert.equal(p.analysis.claims[0].receipts[0].relation, "supports"); assert.equal(p.analysis.claims[0].receipts[0].relationBy, "person at this computer");
    b = (await s.api("PUT", "/api/runs/" + id, { run: {}, transcript: T1 + "\nA: More." })).data; assert.ok(b.passages[0].stale.includes("transcript changed since this analysis"));
    const cl = (await s.api("POST", "/api/runs", { run: { kind: "claim" }, transcript: "The sky is greener now." })).data;
    const rs = await s.api("POST", "/api/runs/" + cl.run.id + "/passages", { passages: [{ title: "p", turnStart: 0, turnEnd: 0 }] }); assert.equal(rs.status, 400); assert.match(rs.data.error, /cannot be re-segmented/);
    const p2 = await s.api("PUT", "/api/runs/" + cl.run.id + "/passages/p002", { title: "x", turnStart: 0, turnEnd: 0, status: "done", analysis: Object.assign(reading([]).analysis, { claims: [{ text: "Vaccines cause autism.", type: "fact", userSupplied: true }] }) });
    assert.equal(p2.status, 400); assert.match(p2.data.error, /one card/);
  } finally { await s.close(); }
});

test("M2/M3/M7: a reading can claim only a call recorded for its own run; a same-reading save never downgrades a recorded call; a key-shaped purpose or run id does not leave a call unrecorded", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const idA = await labeledRun(s.api), idB = await labeledRun(s.api);
    const none = (await s.api("POST", "/api/sample", { prompt: "Transcribe all text", purpose: "transcribe" })).data.provenance;
    const gone = (await s.api("POST", "/api/sample", { prompt: "x y", purpose: "deflate", runId: "rnosuchrun" })).data.provenance;
    const ofA = (await s.api("POST", "/api/sample", { prompt: "You are a deflation reader\n[0] A: x", json: true, runId: idA, purpose: "deflate" })).data.provenance;
    for (const cid of [none.callId, gone.callId, ofA.callId]) {
      const b = (await s.api("PUT", "/api/runs/" + idB + "/passages/p001", reading(["Growth is 1.5%."], "t-" + cid, { callId: cid }))).data;
      assert.equal(b.passages[0].provenance.recorded, false, cid + " is not run B's call");
    }
    assert.equal(gone.runId, "", "a call for a run that does not exist is recorded as for no run");
    let b = (await s.api("PUT", "/api/runs/" + idA + "/passages/p001", reading(["Growth is 1.5%."], "t1", { callId: ofA.callId }))).data;
    assert.equal(b.passages[0].provenance.recorded, true); assert.equal(b.passages[0].provenance.runId, idA);
    // same reading re-saved naming a bogus call: the real record stays
    const same = clone(b.passages[0]); delete same.id; delete same.stale; delete same.quoteCheck; same.callId = "call_nope"; delete same.provenance;
    b = (await s.api("PUT", "/api/runs/" + idA + "/passages/p001", same)).data; assert.equal(b.passages[0].provenance.recorded, true); assert.equal(b.passages[0].provenance.callId, ofA.callId); assert.equal(b.passages[0].readingRev, 1);
    // a copy keeps the record (the page's own "running" save on a copy must not downgrade it)
    const copy = (await s.api("POST", "/api/runs/" + idA + "/duplicate")).data;
    assert.equal(copy.passages[0].provenance.recorded, true);
    const running = clone(copy.passages[0]); delete running.id; delete running.stale; delete running.quoteCheck; running.status = "running";
    b = (await s.api("PUT", "/api/runs/" + copy.run.id + "/passages/p001", running)).data; assert.equal(b.passages[0].provenance.recorded, true); assert.equal(b.passages[0].status, "running");
    const re = clone(copy.passages[0]); delete re.id; delete re.stale; delete re.quoteCheck; re.analyzedAt = "t9"; re.callId = ofA.callId;
    b = (await s.api("PUT", "/api/runs/" + copy.run.id + "/passages/p001", re)).data; assert.equal(b.passages[0].provenance.recorded, true, "the copied calls file answers for the copy");
    // key-shaped purpose / run id: the call is still recorded, without the string
    const weird = (await s.api("POST", "/api/sample", { prompt: "x y", purpose: KEY, runId: KEY.slice(0, 60) })).data.provenance;
    const root = fs.readFileSync(path.join(dataDir, "calls.jsonl"), "utf8");
    assert.ok(root.includes(weird.callId)); assert.ok(!root.includes(KEY.slice(0, 30))); assert.equal(weird.purpose, "skant" + "b".repeat(35)); assert.equal(weird.runId, "");
  } finally { await s.close(); }
});

test("M4/M5/M6: an empty claim is refused before anything is written; a stale tab's running save is refused; the same reading cannot be re-stamped as fresh", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    let cl = (await s.api("POST", "/api/runs", { run: { kind: "claim" }, transcript: "The sky is greener now." })).data;
    const r = await s.api("PUT", "/api/runs/" + cl.run.id, { run: {}, transcript: "   " }); assert.equal(r.status, 400); assert.match(r.data.error, /needs some words/);
    cl = (await s.api("GET", "/api/runs/" + cl.run.id)).data; assert.equal(cl.transcript, "The sky is greener now."); assert.equal(cl.run.input.sha256, sha("The sky is greener now.")); assert.deepEqual(cl.run.inputHistory, []);
    const id = await labeledRun(s.api);
    const source = (await s.api("GET", "/api/runs/" + id)).data;
    const sourceBasis = { basedOn: { transcriptUpdatedAt: source.run.transcriptUpdatedAt, attrSig: source.attrSig } };
    let b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Old claim."], "t1", sourceBasis))).data; const tab1 = clone(b.passages[0]);
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["New claim."], "t2", sourceBasis))).data; assert.equal(b.passages[0].readingRev, 2);
    const stale = clone(tab1); delete stale.id; delete stale.stale; delete stale.quoteCheck; stale.status = "running"; stale.expectedReadingRev = 1;
    const rr = await s.api("PUT", "/api/runs/" + id + "/passages/p001", stale); assert.equal(rr.status, 409); assert.equal(rr.data.code, "stale_reading");
    delete stale.expectedReadingRev; // a client that sends no reading number: a running save still carries no reading
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001?history=full", stale)).data; assert.equal(b.passages[0].analysis.claims[0].text, "New claim."); assert.equal(b.passages[0].readingRev, 2); assert.equal(b.passages[0].status, "running"); assert.equal(b.passages[0].history.length, 1);
    // M6: edit the text (stale), then re-save the same reading naming the current version
    await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["New claim."], "t2"));
    b = (await s.api("PUT", "/api/runs/" + id, { run: {}, transcript: T1 + "\nA: More." })).data; assert.ok(b.passages[0].stale.includes("transcript changed since this analysis"));
    const restamp = clone(b.passages[0]); delete restamp.id; delete restamp.stale; delete restamp.quoteCheck; restamp.basedOn = { transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig };
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", restamp)).data;
    assert.ok(b.passages[0].stale.includes("transcript changed since this analysis"), "still stale"); assert.equal(b.passages[0].basedOn.inputHash, sha(T1)); assert.equal(b.passages[0].readingRev, 2);
  } finally { await s.close(); }
});

test("M8/L5/L2/L6: attachment bytes are scanned; picture types are checked; history is server-owned; a summary can name the version it read", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const id = await labeledRun(s.api);
    const att = await s.api("POST", "/api/runs/" + id + "/attachments", { name: "x.png", mediaType: "image/png", data: Buffer.from("not a png: " + KEY).toString("base64") });
    assert.equal(att.status, 400); assert.equal(att.data.code, "key_in_document"); assert.ok(!fs.existsSync(path.join(dataDir, "runs", id, "attachments")));
    const bad = await s.api("POST", "/api/sample", { prompt: "x y", images: [{ mediaType: "x".repeat(1000), data: "aGk=" }] }); assert.equal(bad.status, 400);
    let b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t1"))).data;
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001?history=full", reading(["Growth is 2.5%."], "t2"))).data; assert.equal(b.passages[0].history.length, 1);
    const forged = clone(b.passages[0]); delete forged.id; delete forged.stale; delete forged.quoteCheck; forged.history = [{ analyzedAt: "forged", analysis: { claims: [{ text: "FORGED" }] }, provenance: { recorded: true, requestId: "forged" } }];
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001?history=full", forged)).data; assert.equal(b.passages[0].history.length, 1); assert.equal(b.passages[0].history[0].analyzedAt, "t1");
    // L6: the patterns name the version they were read from
    const before = b.run.transcriptUpdatedAt;
    b = (await s.api("PUT", "/api/runs/" + id, { run: {}, transcript: T1 + "\nA: More." })).data;
    b = (await s.api("PUT", "/api/runs/" + id + "/summary", { patterns: [], survived: { hs: "s", g5: "s" }, basedOn: { passagesSig: "p001@t2", transcriptUpdatedAt: before } })).data;
    assert.equal(b.summary.basedOn.inputHash, sha(T1)); assert.ok(b.summary.stale.includes("transcript changed since the patterns were found"));
  } finally { await s.close(); }
});

test("L1: the gdelt connector survives bad entries, strips search operators, clips fields, retries the limit text at HTTP 200, and reads odd limits and clocks", async () => {
  const mixed = { articles: [null, 7, { title: { a: 1 }, url: "https://x.test/1" }, { title: "T".repeat(5000), url: "https://X.TEST/Story?utm=1", domain: "X.TEST", seendate: "20240101T000000Z", language: "English", sourcecountry: { b: 2 } }, { title: "dup", url: "https://x.test/Story?utm=1" }, { title: "case", url: "https://x.test/story?utm=1" }] };
  const f = fakeFetch([{ body: mixed }]);
  const r = await gdelt({ fetch: f, minIntervalMs: 0 }).search({ query: 'domain:cnn.com -nasa sourcelang:french (greening OR earth) "leaf area" theme:ENV', limit: "abc" });
  assert.equal(r.attempt.error, null); assert.equal(r.attempt.query, 'nasa greening earth "leaf area"'); assert.equal(r.attempt.note, "search operators were removed from the query");
  assert.match(f.calls[0], /query=nasa%20greening%20earth%20%22leaf%20area%22%20sourcelang%3Aenglish&mode=artlist&maxrecords=8&/);
  assert.equal(r.candidates.length, 2, "object title dropped, the two same-address entries merged, the different-case path kept");
  assert.equal(r.candidates[0].title.length, 300); assert.equal(r.candidates[0].outlet, "x.test"); assert.equal(r.candidates[0].sourceCountry, "");
  assert.deepEqual(gdeltWords("near5:x proximity:y repeat3:z -only words"), ["only", "words"]); assert.equal(normalizeUrl("HTTPS://A.Test/Path?q=1"), "https://a.test/Path?q=1");
  const f2 = fakeFetch([{ body: "Please limit requests to one every 5 seconds" }, { body: { articles: [{ title: "ok", url: "https://a.test/b" }] } }]);
  const r2 = await gdelt({ fetch: f2, minIntervalMs: 0 }).search({ query: "two words", limit: 5 }); assert.equal(f2.calls.length, 2); assert.equal(r2.candidates.length, 1);
  const r3 = await gdelt({ fetch: fakeFetch([{ body: {} }]), minIntervalMs: 0, now: () => "not a date" }).search({ query: "two words", limit: -4 }); assert.match(r3.attempt.error, /clock unavailable/);
  const f4 = fakeFetch([{ body: {} }]); await gdelt({ fetch: f4, minIntervalMs: 0 }).search({ query: "two words", limit: 1e9 }); assert.match(f4.calls[0], /maxrecords=25&/);
});

test("L4: verify-export refuses a non-export file with exit 2 and names a line-ending or BOM difference", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const id = await labeledRun(s.api);
    await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t1"));
    const exp = (await s.api("GET", "/api/runs/" + id + "/export.json")).data;
    const ef = path.join(dataDir, "e.json"), tf = path.join(dataDir, "t.txt"), script = path.join(__dirname, "..", "scripts", "verify-export.js");
    fs.writeFileSync(ef, "null"); fs.writeFileSync(tf, T1);
    const r2 = spawnSync(process.execPath, [script, ef, tf], { encoding: "utf8" }); assert.equal(r2.status, 2); assert.match(r2.stderr, /not a Deflate Lens claims export/);
    fs.writeFileSync(ef, JSON.stringify(exp)); fs.writeFileSync(tf, T1.replace(/\n/g, "\r\n"));
    const r1 = spawnSync(process.execPath, [script, ef, tf], { encoding: "utf8" }); assert.equal(r1.status, 1); assert.match(r1.stdout, /only by CRLF line endings/);
    fs.writeFileSync(tf, "﻿" + T1 + "\n");
    const r0 = spawnSync(process.execPath, [script, ef, tf], { encoding: "utf8" }); assert.equal(r0.status, 1); assert.match(r0.stdout, /transcript matches: NO/);
  } finally { await s.close(); }
});
