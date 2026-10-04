"use strict";
/* 0.8.0: the four things reused from Alex's other repositories, each tested as a behaviour of this app.
     1. Input record (CDIL's server-side hash at intake; Wordicon's read-time identity check): the server hashes the
        transcript, stamps every reading with the hash of the text it was read from, and judges staleness by hash.
     2. News coverage (Public Eye's GDELT route): a keyless connector for news_coverage, honest about what coverage is.
     3. Source relations (Rabbit_Hole's supports/mentions/contradicts, but stated by a person, never inferred).
     4. Model-call provenance (orchestrator's minimal raw record + leak scan): every call recorded by the server, every
        reading bound to its call by id, nothing key-shaped ever written. */
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
const { gdelt } = require("../server/research/connectors");
const T = require("../server/research/types");
const { verify } = require("../scripts/verify-export");

const sha = s => crypto.createHash("sha256").update(s, "utf8").digest("hex");
async function start(dataDir, extra) {
  const { app, ready, store, reader } = createApp(Object.assign({ dataDir, ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }) }, extra || {}));
  await ready;
  const server = await new Promise(res => { const s = app.listen(0, "127.0.0.1", () => res(s)); });
  const base = "http://127.0.0.1:" + server.address().port;
  const api = async (method, p, body) => { const r = await fetch(base + p, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = text; } return { status: r.status, data, text }; };
  return { server, base, api, store, reader, close: () => new Promise(r => server.close(r)) };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "deflate-reuse-"));
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

/* ---------- 1. input record ---------- */
test("input record: the server hashes the text, binds every reading to the hash of the text it was read from, and staleness follows the hash (an undone edit is no change)", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const id = await labeledRun(s.api);
    let b = (await s.api("GET", "/api/runs/" + id)).data;
    assert.equal(b.run.input.sha256, sha(T1)); assert.equal(b.run.input.chars, T1.length); assert.equal(b.run.input.parseMode, "transcript"); assert.deepEqual(b.run.inputHistory, []);
    // a client cannot set the input record
    b = (await s.api("PUT", "/api/runs/" + id, { run: { input: { sha256: "forged" }, inputHistory: [{ sha256: "x" }] } })).data;
    assert.equal(b.run.input.sha256, sha(T1)); assert.deepEqual(b.run.inputHistory, []);
    // a reading saved now is bound to the current text's hash, whatever the client claims
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t1", { basedOn: { transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig, inputHash: "forged" } }))).data;
    const p1 = b.passages[0]; assert.equal(p1.basedOn.inputHash, sha(T1)); assert.deepEqual(p1.stale, []);
    // edit the text: the old hash goes to history, the card is stale by hash
    const T2 = T1.replace("The treatment helps.", "The treatment does not help.");
    b = (await s.api("PUT", "/api/runs/" + id, { run: {}, transcript: T2 })).data;
    assert.equal(b.run.input.sha256, sha(T2)); assert.equal(b.run.inputHistory.length, 1); assert.equal(b.run.inputHistory[0].sha256, sha(T1));
    assert.ok(b.passages[0].stale.includes("transcript changed since this analysis"));
    // undo the edit: same hash as before, the card is fresh again (the timestamp rule would have kept it stale)
    b = (await s.api("PUT", "/api/runs/" + id, { run: {}, transcript: T1 })).data;
    assert.equal(b.run.input.sha256, sha(T1)); assert.equal(b.run.inputHistory.length, 2);
    assert.ok(!b.passages[0].stale.includes("transcript changed since this analysis"), "the text the card was read from is the text now; stale: " + JSON.stringify(b.passages[0].stale));
    assert.notEqual(b.run.transcriptUpdatedAt, p1.basedOn.transcriptUpdatedAt, "the timestamps differ; only the hash says it is the same text");
    // a reading that names an earlier version (an edit landed while the model worked) is bound to THAT version's hash and is stale at once
    const atT2 = b.run.inputHistory[1].transcriptUpdatedAt;
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t2", { basedOn: { transcriptUpdatedAt: atT2, attrSig: b.attrSig } }))).data;
    assert.equal(b.passages[0].basedOn.inputHash, sha(T2)); assert.ok(b.passages[0].stale.includes("transcript changed since this analysis"));
    // a reading that names a version the run never had gets no hash and falls back to the timestamp rule (stale)
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t3", { basedOn: { transcriptUpdatedAt: "1999-01-01T00:00:00.000Z", attrSig: b.attrSig } }))).data;
    assert.equal(b.passages[0].basedOn.inputHash, ""); assert.ok(b.passages[0].stale.includes("transcript changed since this analysis"));
    // the summary is bound too
    await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t4", { basedOn: { transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig } }));
    b = (await s.api("PUT", "/api/runs/" + id + "/summary", { patterns: [{ title: { hs: "x", g5: "x" }, body: { hs: "y", g5: "y" }, passages: ["p001"] }], survived: { hs: "s", g5: "s" }, basedOn: { passagesSig: "p001@t4", transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig } })).data;
    assert.equal(b.summary.basedOn.inputHash, sha(T1)); assert.deepEqual(b.summary.stale, []);
    b = (await s.api("PUT", "/api/runs/" + id, { run: {}, transcript: T2 })).data; assert.ok(b.summary.stale.includes("transcript changed since the patterns were found"));
    b = (await s.api("PUT", "/api/runs/" + id, { run: {}, transcript: T1 })).data; assert.ok(!b.summary.stale.includes("transcript changed since the patterns were found"));
    // the export carries the hashes and the verifier checks them against a file
    const exp = (await s.api("GET", "/api/runs/" + id + "/export.json")).data;
    assert.equal(exp.schema, "deflate-lens/claims@0.6"); assert.equal(exp.run.transcript.sha256, sha(T1)); assert.equal(exp.run.transcript.earlierVersions.length, 4); assert.equal(exp.passages[0].basedOn.inputHash, sha(T1));
    const ok = verify(exp, T1); assert.equal(ok.transcriptMatches, true); assert.equal(ok.passages[0].where, "read from exactly this text");
    const no = verify(exp, T2); assert.equal(no.transcriptMatches, false); assert.match(no.passages[0].where, /not name|earlier version/);
    const crlf = verify(exp, T1.replace(/\n/g, "\r\n")); assert.equal(crlf.transcriptMatches, false, "a changed line ending is a changed text");
    // the script itself: exit 0 on a match, 1 on a mismatch
    const ef = path.join(dataDir, "e.json"), tf = path.join(dataDir, "t.txt"); fs.writeFileSync(ef, JSON.stringify(exp)); fs.writeFileSync(tf, T1);
    const r0 = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "verify-export.js"), ef, tf], { encoding: "utf8" }); assert.equal(r0.status, 0, r0.stdout + r0.stderr); assert.match(r0.stdout, /transcript matches: yes/);
    fs.writeFileSync(tf, T2); const r1 = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "verify-export.js"), ef, tf], { encoding: "utf8" }); assert.equal(r1.status, 1); assert.match(r1.stdout, /transcript matches: NO/);
  } finally { await s.close(); }
});

test("input record: a run saved before 0.8.0 (no input field) gets one derived from its text, and its old readings keep the timestamp rule", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const id = await labeledRun(s.api);
    const source = (await s.api("GET", "/api/runs/" + id)).data;
    await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t1", { basedOn: { transcriptUpdatedAt: source.run.transcriptUpdatedAt, attrSig: source.attrSig } }));
    // simulate an older file: strip the input record and the reading's hash on disk
    const rf = path.join(dataDir, "runs", id, "run.json"); const run = JSON.parse(fs.readFileSync(rf, "utf8")); delete run.input; delete run.inputHistory; fs.writeFileSync(rf, JSON.stringify(run));
    const pf = path.join(dataDir, "runs", id, "passages", "p001.json"); const pj = JSON.parse(fs.readFileSync(pf, "utf8")); delete pj.basedOn.inputHash; fs.writeFileSync(pf, JSON.stringify(pj));
    let b = (await s.api("GET", "/api/runs/" + id)).data;
    assert.equal(b.run.input.sha256, sha(T1), "derived on read"); assert.deepEqual(b.passages[0].stale, [], "same timestamp: fresh");
    b = (await s.api("PUT", "/api/runs/" + id, { run: { title: "renamed" } })).data;
    assert.equal(JSON.parse(fs.readFileSync(rf, "utf8")).input.sha256, sha(T1), "persisted on the next save");
    b = (await s.api("PUT", "/api/runs/" + id, { run: {}, transcript: T1 + "\nA: More." })).data;
    assert.ok(b.passages[0].stale.includes("transcript changed since this analysis"), "no hash on the old reading: the timestamp rule still marks it stale");
  } finally { await s.close(); }
});

test("input record: a typed claim run binds its one card to the hash of the claim text, and an edited claim gets a new hash", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    let b = (await s.api("POST", "/api/runs", { run: { kind: "claim" }, transcript: "The sky is greener now." })).data;
    assert.equal(b.run.input.sha256, sha("The sky is greener now.")); assert.equal(b.run.input.parseMode, "text"); assert.equal(b.passages[0].basedOn.inputHash, sha("The sky is greener now.")); assert.deepEqual(b.passages[0].stale, []);
    b = (await s.api("PUT", "/api/runs/" + b.run.id, { run: {}, transcript: "The sky is browner now." })).data;
    assert.equal(b.run.input.sha256, sha("The sky is browner now.")); assert.equal(b.passages[0].basedOn.inputHash, sha("The sky is browner now.")); assert.deepEqual(b.passages[0].stale, []); assert.equal(b.run.inputHistory[0].sha256, sha("The sky is greener now."));
  } finally { await s.close(); }
});

/* ---------- 2. news coverage (GDELT) ---------- */
const GDELT_OK = { articles: [
  { url: "https://example-news.test/a", url_mobile: "", title: "Satellites show a greener  Earth", seendate: "20240302T101500Z", socialimage: "", domain: "example-news.test", language: "English", sourcecountry: "United States" },
  { url: "https://other.test/b", title: "CO2 and plant growth", seendate: "20230101T000000Z", domain: "other.test", language: "English", sourcecountry: "Canada" },
  { url: "https://example-news.test/a", title: "Satellites show a greener Earth", seendate: "20240302T101500Z", domain: "example-news.test", language: "English", sourcecountry: "United States" },
  { url: "ftp://bad", title: "no", seendate: "", domain: "x", language: "", sourcecountry: "" },
] };
function fakeFetch(script) { let i = 0; const calls = []; const f = async url => { calls.push(String(url)); const step = script[Math.min(i++, script.length - 1)]; return { status: step.status || 200, headers: { get: () => null }, text: async () => typeof step.body === "string" ? step.body : JSON.stringify(step.body) }; }; f.calls = calls; return f; }

test("gdelt connector: parses article lists, dedupes by address, treats {} as nothing found, and reports GDELT's rate-limit text as an error whatever the status", async () => {
  const f = fakeFetch([{ body: GDELT_OK }]);
  const g = gdelt({ fetch: f, minIntervalMs: 0, now: () => new Date("2026-10-02T12:00:00Z") });
  const r = await g.search({ query: "greening earth satellite", limit: 8 });
  assert.equal(r.attempt.adapter, "gdelt"); assert.equal(r.attempt.error, null); assert.equal(r.attempt.hitCount, 2); assert.equal(r.attempt.totalReported, null);
  assert.match(f.calls[0], /api\.gdeltproject\.org\/api\/v2\/doc\/doc\?query=greening%20earth%20satellite%20sourcelang%3Aenglish&mode=artlist&maxrecords=8&format=json&sort=hybridrel&startdatetime=20170101000000&enddatetime=20261002120000$/);
  assert.equal(r.candidates[0].title, "Satellites show a greener Earth"); assert.equal(r.candidates[0].outlet, "example-news.test"); assert.equal(r.candidates[0].publishedAt, "2024-03-02T10:15:00Z"); assert.equal(r.candidates[0].sourceType, "news_coverage"); assert.equal(r.candidates[0].docType, "news-article"); assert.equal(r.candidates[0].doi, undefined);
  assert.match(r.attempt.coverage, /news since 2017-01-01, english-language/);
  // language off
  const g2 = gdelt({ fetch: fakeFetch([{ body: {} }]), minIntervalMs: 0, language: "" }); const r2 = await g2.search({ query: "greening earth", limit: 5 });
  assert.equal(r2.attempt.error, null); assert.equal(r2.attempt.hitCount, 0); assert.equal(r2.candidates.length, 0); assert.equal(r2.attempt.coverage, "news since 2017-01-01");
  assert.ok(!/sourcelang/.test(r2.attempt.url));
  // rate-limit text with HTTP 200 (seen live), and with 429 twice
  const r3 = await gdelt({ fetch: fakeFetch([{ body: "Please limit requests to one every 5 seconds or contact ..." }]), minIntervalMs: 0 }).search({ query: "greening earth", limit: 5 });
  assert.match(r3.attempt.error, /rate limit \(one request every 5 seconds/); assert.equal(r3.candidates.length, 0);
  const f4 = fakeFetch([{ status: 429, body: "Please limit requests" }]); const r4 = await gdelt({ fetch: f4, minIntervalMs: 0 }).search({ query: "greening earth", limit: 5 });
  assert.equal(f4.calls.length, 2, "one retry"); assert.match(r4.attempt.error, /hit twice/);
  // one-word queries are refused before any request (GDELT would answer with unrelated articles)
  const f5 = fakeFetch([{ body: GDELT_OK }]); const r5 = await gdelt({ fetch: f5, minIntervalMs: 0 }).search({ query: "serotonin", limit: 5 });
  assert.equal(f5.calls.length, 0); assert.match(r5.attempt.error, /fewer than two words/);
  // non-JSON that is not the rate-limit text
  const r6 = await gdelt({ fetch: fakeFetch([{ body: "<html>maintenance</html>" }]), minIntervalMs: 0 }).search({ query: "greening earth", limit: 5 });
  assert.match(r6.attempt.error, /something other than JSON/);
});

test("orchestrator: news_coverage routes to gdelt only, news candidates keep their address identity and are not status-checked, and the no-adapter message names what is still unserved", async () => {
  const f = async url => { const u = String(url); if (/gdeltproject/.test(u)) return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify(GDELT_OK) }; throw new Error("unexpected call to " + u); };
  const R = createResearch({}, { fetch: f, minIntervalMs: 0 });
  assert.deepEqual(R.config.adapters, ["crossref", "pubmed", "openalex", "gdelt"]); assert.equal(R.config.newsLanguage, "english");
  const out = await R.searchClaim({ run: { id: "r1" }, passage: { id: "p001", turnStart: 0, turnEnd: 1 }, claim: { id: "c1", text: "The Times reported the earth is greener.", type: "fact", expectedSources: ["news_coverage"], searchQuery: "greener earth reported" }, idx: 0, limit: 8 });
  assert.deepEqual(out.attempts.map(a => a.adapter), ["gdelt"]);
  assert.equal(out.candidates.length, 2); assert.deepEqual(out.candidates.map(c => c.foundBy), [["gdelt"], ["gdelt"]]);
  assert.equal(out.candidates[0].statusCheck.checked, false); assert.match(out.candidates[0].statusCheck.note, /news articles carry no DOI/); assert.equal(out.candidates[0].noDoiReason, undefined);
  assert.ok(out.candidates.every(c => c.status === "candidate" && /^cand_/.test(c.id) && c.retrievedAt));
  const none = await R.searchClaim({ run: { id: "r1" }, passage: { id: "p001", turnStart: 0, turnEnd: 1 }, claim: { id: "c2", text: "x", type: "fact", expectedSources: ["government_data"], searchQuery: "census data" }, idx: 1, limit: 8 });
  assert.match(none.attempts[0].error, /no adapter in this build serves government_data/);
  assert.deepEqual(T.ADAPTERS_FOR_TYPE.news_coverage, ["gdelt"]); assert.deepEqual(T.ADAPTERS_FOR_TYPE.government_data, []);
  const R2 = createResearch({ NEWS_LANGUAGE: "" }, { fetch: f, minIntervalMs: 0 }); assert.equal(R2.config.newsLanguage, "any");
});

test("over HTTP: a news candidate is searched, accepted as a source with its outlet, and the mock research adds news only when news is asked for", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const id = await labeledRun(s.api);
    let b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading([{ text: "The paper reported greening.", speaker: "A", type: "fact", expectedSources: ["news_coverage"], searchQuery: "greening reported newspaper" }, { text: "The study found greening.", speaker: "A", type: "fact", expectedSources: ["academic_paper"], searchQuery: "greening study" }], "t1"))).data;
    const [cNews, cPaper] = b.passages[0].analysis.claims;
    const sn = (await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + cNews.id + "/search", {})).data;
    assert.equal(sn.attempts.length, 4); assert.equal(sn.attempts[3].adapter, "gdelt"); assert.equal(sn.candidates.length, 3); const news = sn.candidates.find(c => c.adapter === "gdelt"); assert.ok(news);
    const sp = (await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + cPaper.id + "/search", {})).data;
    assert.equal(sp.attempts.length, 3); assert.equal(sp.candidates.length, 2, "no news candidate for an academic claim");
    b = (await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + cNews.id + "/candidates/" + news.id + "/accept", { note: "says it", relation: "mentions" })).data;
    const rc = b.passages[0].analysis.claims[0].receipts[0];
    assert.equal(rc.outlet, "news.example.invalid"); assert.equal(rc.sourceType, "news_coverage"); assert.equal(rc.relation, "mentions"); assert.equal(rc.kind, "document"); assert.equal(rc.statusCheck.checked, false);
  } finally { await s.close(); }
});

/* ---------- 3. relations ---------- */
test("relations: stated by the person on accept or attach, default unstated, changeable with history, refused on a withdrawn source, counted in the exports", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const id = await labeledRun(s.api);
    let b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t1"))).data;
    const c = b.passages[0].analysis.claims[0]; const P = "/api/runs/" + id + "/passages/p001/claims/" + c.id;
    const sr = (await s.api("POST", P + "/search", {})).data; const [k1, k2] = sr.candidates;
    b = (await s.api("POST", P + "/candidates/" + k1.id + "/accept", { note: "n1" })).data;
    let r1 = b.passages[0].analysis.claims[0].receipts[0]; assert.equal(r1.relation, "unstated"); assert.equal(r1.relationBy, undefined, "nothing stated, nobody credited");
    b = (await s.api("POST", P + "/candidates/" + k2.id + "/accept", { note: "n2", relation: "contradicts" })).data;
    const r2 = b.passages[0].analysis.claims[0].receipts[1]; assert.equal(r2.relation, "contradicts"); assert.equal(r2.relationBy, "person at this computer"); assert.ok(r2.relationAt);
    b = (await s.api("POST", P + "/receipts", { url: "https://example.org/doc", note: "hand", relation: "SUPPORTS " })).data;
    const r3 = b.passages[0].analysis.claims[0].receipts[2]; assert.equal(r3.relation, "supports", "case and whitespace are tolerated");
    b = (await s.api("POST", P + "/receipts", { url: "https://example.org/doc2", relation: "proves" })).data;
    assert.equal(b.passages[0].analysis.claims[0].receipts[3].relation, "unstated", "anything outside the closed set is unstated, never upgraded");
    // change a relation: the previous value stays on record
    b = (await s.api("PUT", P + "/receipts/" + r1.rid + "/relation", { relation: "mentions" })).data;
    r1 = b.passages[0].analysis.claims[0].receipts[0]; assert.equal(r1.relation, "mentions"); assert.equal(r1.relationHistory.length, 1); assert.equal(r1.relationHistory[0].relation, "unstated");
    const same = await s.api("PUT", P + "/receipts/" + r1.rid + "/relation", { relation: "mentions" }); assert.equal(same.status, 200); assert.equal(same.data.passages[0].analysis.claims[0].receipts[0].relationHistory.length, 1, "no change, no history entry");
    // a stale reading number is refused like every other mutation
    const stale = await s.api("PUT", P + "/receipts/" + r1.rid + "/relation", { relation: "supports", expectedReadingRev: 7 }); assert.equal(stale.status, 409); assert.equal(stale.data.code, "stale_reading");
    // withdrawn: relation frozen
    await s.api("POST", P + "/receipts/" + r2.rid + "/withdraw", { reason: "wrong paper" });
    const frozen = await s.api("PUT", P + "/receipts/" + r2.rid + "/relation", { relation: "supports" }); assert.equal(frozen.status, 409); assert.equal(frozen.data.code, "receipt_withdrawn");
    // exports
    const exp = (await s.api("GET", "/api/runs/" + id + "/export.json")).data;
    const ec = exp.claims[0]; assert.deepEqual(ec.relations, { supports: 1, contradicts: 0, mentions: 1, unstated: 1 }, "active receipts only"); assert.equal(ec.receipts[1].relation, "contradicts"); assert.equal(ec.receipts[1].withdrawn, true); assert.equal(ec.receipts[0].relationHistory.length, 1);
    assert.equal(typeof exp.relationMeaning.supports, "string"); assert.match(exp.statusMeaning.receipt, /never inferred from a search/);
    const md = (await s.api("GET", "/api/runs/" + id + "/export.md")).text;
    assert.match(md, /Reading held/); assert.doesNotMatch(md, /sources attached:/, "an unprepared reading is excluded from the normal Markdown export; the raw export above preserves every relation"); assert.match(md, /Transcript sha256: [0-9a-f]{64}/);
    // a relation never changes a claim's status vocabulary: still "receipt", never "verified" anywhere
    assert.equal(ec.status, "receipt"); assert.ok(!/verified/i.test(JSON.stringify(exp.claims)));
  } finally { await s.close(); }
});

/* ---------- 4. model-call provenance and leak scan ---------- */
test("provenance: every model call is recorded by the server; a reading names its call and gets the server's record, not the client's; failures are recorded too", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const id = await labeledRun(s.api);
    const r = (await s.api("POST", "/api/sample", { prompt: "You are a deflation reader\n[0] A: Growth was 1.5% last year.", json: true, runId: id, purpose: "deflate" })).data;
    assert.ok(r.provenance && /^call/.test(r.provenance.callId)); assert.equal(r.provenance.provider, "mock"); assert.equal(r.provenance.modelReturned, "mock"); assert.ok(r.provenance.requestId); assert.equal(r.provenance.purpose, "deflate"); assert.equal(r.provenance.runId, id);
    assert.equal(r.provenance.promptHash, sha("You are a deflation reader\n[0] A: Growth was 1.5% last year.")); assert.equal(r.provenance.outputHash, sha(r.text)); assert.equal(typeof r.provenance.latencyMs, "number");
    const lines = fs.readFileSync(path.join(dataDir, "runs", id, "calls.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(lines.length, 1); assert.equal(lines[0].callId, r.provenance.callId); assert.ok(!("prompt" in lines[0]), "the record holds hashes, not the prompt");
    // a reading saved with that callId gets the server's record; whatever the client sent as provenance is dropped
    let b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t1", { callId: r.provenance.callId, provenance: { modelReturned: "forged-model", recorded: true } }))).data;
    let p = b.passages[0]; assert.equal(p.provenance.recorded, true); assert.equal(p.provenance.modelReturned, "mock"); assert.equal(p.provenance.requestId, r.provenance.requestId); assert.equal(p.provenance.callId, r.provenance.callId); assert.equal(p.callId, r.provenance.callId);
    // a save of the same reading without the callId (a receipt attached, say) keeps the record
    const again = JSON.parse(JSON.stringify(p)); delete again.id; delete again.stale; delete again.quoteCheck; delete again.callId; delete again.provenance;
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", again)).data; assert.equal(b.passages[0].provenance.requestId, r.provenance.requestId); assert.equal(b.passages[0].readingRev, 1);
    // a bogus callId is recorded as unrecorded, not invented
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001?history=full", reading(["Growth is 1.5%."], "t2", { callId: "call_nope" }))).data;
    assert.equal(b.passages[0].provenance.recorded, false); assert.match(b.passages[0].provenance.note, /no call with this id/); assert.equal(b.passages[0].history[0].provenance.requestId, r.provenance.requestId, "the earlier reading's record went to history with it");
    // The summary too: the new gate first requires actual prepared cards and a bound input.
    const blocked = await s.api("POST", "/api/sample", {prompt:"Below are the results of deflating",json:true,runId:id,purpose:"patterns"});
    assert.equal(blocked.status,409,"an unprepared summary must not bypass the display gate");
    const auto = (await s.api("POST","/api/intake",{input:Array.from({length:18},(_,i)=>(i%2?"B":"A")+": This passage has enough words for the speaker to make an argument "+i+".").join("\n")})).data;
    const job=s.reader.jobs.get(auto.run.id); if(job)await job.done;
    const prepared=await s.store.bundle(auto.run.id);
    const r2=(await s.api("POST","/api/sample",{prompt:"Below are the results of deflating",json:true,runId:auto.run.id,purpose:"patterns",basedOn:{transcriptUpdatedAt:prepared.run.transcriptUpdatedAt,attrSig:prepared.attrSig,preparedOnly:true,passagesSig:prepared.passages.map(p=>p.id+"@"+(p.analyzedAt||"")).join(",")}})).data;
    assert.ok(r2.provenance.review.approved);
    b=(await s.api("PUT","/api/runs/"+auto.run.id+"/summary",{patterns:[],survived:{hs:"s",g5:"s"},callId:r2.provenance.callId,provenance:{forged:true},basedOn:{passagesSig:""}})).data;
    assert.equal(b.summary.provenance.callId,r2.provenance.callId);assert.equal(b.summary.provenance.forged,undefined);
    assert.equal(b.summary.readingGate.status,"held","changing an approved overview cannot keep its approval");
    // a call for no run goes to the data root; the export carries the passage record
    const r3 = (await s.api("POST", "/api/sample", { prompt: "Transcribe all text", purpose: "transcribe" })).data; assert.ok(r3.provenance.callId);
    assert.ok(fs.existsSync(path.join(dataDir, "calls.jsonl")));
    const exp = (await s.api("GET", "/api/runs/" + id + "/export.json")).data; assert.equal(exp.passages[0].provenance.recorded, false);
    // a failing model is recorded as a failure
    const { createApp: mk } = require("../server/app");
    const failing = { kind: "anthropic", model: "claude-test", mock: false, async sample() { const e = new Error("overloaded"); e.code = "rate_limited"; throw e; } };
    const dd = tmp(); const app2 = mk({ dataDir: dd, ai: failing, research: null }); await app2.ready;
    const srv = await new Promise(res => { const x = app2.app.listen(0, "127.0.0.1", () => res(x)); });
    try {
      const rr = await fetch("http://127.0.0.1:" + srv.address().port + "/api/sample", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "hi", purpose: "deflate" }) });
      assert.equal(rr.status, 429); const j = await rr.json(); assert.equal(j.provenance.error, "rate_limited");
      const rec = fs.readFileSync(path.join(dd, "calls.jsonl"), "utf8").trim().split("\n").map(JSON.parse); assert.equal(rec[0].error, "rate_limited"); assert.equal(rec[0].modelRequested, "claude-test");
    } finally { await new Promise(r => srv.close(r)); }
  } finally { await s.close(); }
});

test("leak scan: nothing shaped like an API key is ever written to the data folder", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const key = "sk-ant-" + "a".repeat(40);
    const r1 = await s.api("POST", "/api/runs", { run: {}, transcript: "A: my key is " + key + " keep it secret." });
    assert.equal(r1.status, 400); assert.equal(r1.data.code, "key_in_document"); assert.equal(fs.readdirSync(path.join(dataDir, "runs")).filter(n => !/^pilot/.test(n)).length, 0, "nothing written");
    const id = await labeledRun(s.api);
    const r2 = await s.api("PUT", "/api/runs/" + id + "/passages/p001", reading(["Growth is 1.5%."], "t1", { stake: "see " + key }));
    assert.equal(r2.status, 400); assert.equal(r2.data.code, "key_in_document");
    const b = (await s.api("GET", "/api/runs/" + id)).data; assert.equal(b.passages[0].status, "pending", "the passage is as it was");
    const r3 = await s.api("POST", "/api/sample", { prompt: "keep " + key, runId: id }); assert.equal(r3.status, 200, "the prompt itself is not stored, only its hash, so the call goes through");
    assert.ok(!fs.readFileSync(path.join(dataDir, "runs", id, "calls.jsonl"), "utf8").includes(key));
  } finally { await s.close(); }
});
