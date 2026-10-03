"use strict";
/* End-to-end over HTTP with a temporary data folder and the mock model:
   the example loads, a run goes through every stage, work survives a restart, exports work,
   staleness is marked when the transcript or attribution changes, and the example is read-only. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { parseJSONLoose } = require("../server/ai");

async function start(dataDir) {
  const { app, ready } = createApp({ dataDir, ai: createMockAI() });
  await ready;
  const server = await new Promise(res => { const s = app.listen(0, "127.0.0.1", () => res(s)); });
  const base = "http://127.0.0.1:" + server.address().port;
  const api = async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = text; }
    return { status: r.status, data, headers: r.headers };
  };
  return { server, base, api, close: () => new Promise(r => server.close(r)) };
}

const TRANSCRIPT = [
  "HOST: Welcome back. Today we talk about plans.",
  "GUEST: Thanks for having me. In my clinical practice I tell people a bad plan beats no plan.",
  "HOST: Why is that?",
  "GUEST: Because even a failed attempt gives you information. Waiting gives you nothing.",
  "HOST: Some people would say waiting avoids mistakes.",
  "GUEST: Only the recoverable kind. For things you cannot undo, wait.",
  "HOST: That is fair.",
  "GUEST: It is the only rule of thumb I trust on this.",
  "HOST: Let us talk about something else: feeds.",
  "GUEST: Feeds optimise for what grabs you now, not what you would choose for your long-term goal.",
].join("\n");

test("full workflow with mock model, persistence across restart, staleness, exports, read-only example", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-test-"));
  let s = await start(dataDir);
  try {
    // health + example installed on first start
    const h = await s.api("GET", "/api/health");
    assert.equal(h.status, 200); assert.equal(h.data.ai.mock, true);
    let list = (await s.api("GET", "/api/runs")).data;
    const ex = list.find(r => r.id === "pilot-jre2308");
    assert.ok(ex, "example installed"); assert.equal(ex.example, true); assert.equal(ex.doneCount, 16);
    const exb = (await s.api("GET", "/api/runs/pilot-jre2308")).data;
    assert.equal(exb.passages.length, 16); assert.equal(exb.transcript.length > 100000, true);
    assert.deepEqual(exb.passages[0].stale, [], "example cards are fresh under their own attribution");

    // example is read-only
    assert.equal((await s.api("PUT", "/api/runs/pilot-jre2308", { run: { title: "x" } })).status, 403);
    assert.equal((await s.api("DELETE", "/api/runs/pilot-jre2308")).status, 403);

    // create a run
    const created = (await s.api("POST", "/api/runs", { run: { title: "Test run", sourceUrl: "https://example.org/ep1", speakers: [{ key: "HOST", name: "Host", bio: "runs the show" }, { key: "GUEST", name: "Guest", bio: "clinician" }] }, transcript: TRANSCRIPT })).data;
    const id = created.run.id;
    assert.ok(id); assert.equal(created.transcript, TRANSCRIPT); assert.equal(created.run.example, false);

    // audit via mock, then confirm attribution
    const audit = (await s.api("POST", "/api/sample", { prompt: "You are checking speaker attribution in an interview transcript.\n\nTurns:\n[1] GUEST: In my clinical practice I tell people", json: true })).data;
    assert.equal(audit.data.flags.length, 1);
    let b = (await s.api("PUT", "/api/runs/" + id, { run: { provenance: { overrides: { "2": "GUEST" }, flags: audit.data.flags, auditedAt: new Date().toISOString(), confirmedAt: new Date().toISOString(), confirmedBy: "test", method: "test confirm" }, status: "attributed" } })).data;
    assert.equal(b.run.provenance.confirmedAt.length > 0, true);
    const sig1 = b.attrSig;

    // segment via mock, then deflate one passage via mock
    const seg = (await s.api("POST", "/api/sample", { prompt: "Split this transcript section into passages.\n\nTurns:\n[0] HOST: Welcome back.\n[1] GUEST: Thanks.\n[2] HOST: Why?", json: true })).data;
    b = (await s.api("POST", "/api/runs/" + id + "/passages", { passages: seg.data.passages.map(p => Object.assign(p, { speakers: ["HOST", "GUEST"], status: "pending" })) })).data;
    assert.equal(b.passages.length, 1); assert.equal(b.passages[0].id, "p001");
    const defl = (await s.api("POST", "/api/sample", { prompt: "You are a deflation reader.\n\nTurns (numbers in brackets):\n[1] GUEST: Thanks for having me. In my clinical practice I tell people a bad plan beats no plan.", json: true })).data;
    const pdoc = Object.assign({}, b.passages[0], { status: "done", analysis: defl.data, analyzedAt: new Date().toISOString(), analyzedBy: "deflate-lens local · MOCK", basedOn: { transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: sig1 } });
    delete pdoc.id; delete pdoc.stale;
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", pdoc)).data;
    assert.equal(b.passages[0].status, "done"); assert.deepEqual(b.passages[0].stale, []);

    // summary
    b = (await s.api("PUT", "/api/runs/" + id + "/summary", { patterns: [], survived: { hs: "x", g5: "y" }, basedOn: { passagesSig: "p001@" + b.passages[0].analyzedAt, transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig } })).data;
    assert.deepEqual(b.summary.stale, []);

    // exports
    const ej = await s.api("GET", "/api/runs/" + id + "/export.json");
    assert.equal(ej.status, 200); assert.equal(ej.data.schema, "deflate-lens/claims@0.5"); assert.ok(ej.data.statusMeaning.receipt.includes("not verification")); assert.equal(ej.data.claims.length, 2, "mock emits one unscorable and one empirical claim per passage"); assert.equal(ej.data.run.source.url, "https://example.org/ep1");
    assert.match(ej.headers.get("content-disposition"), /attachment/);
    const em = await s.api("GET", "/api/runs/" + id + "/export.md");
    assert.equal(em.status, 200); assert.match(String(em.data), /# Test run — deflated/);
    const exj = (await s.api("GET", "/api/runs/pilot-jre2308/export.json")).data;
    assert.equal(exj.claims.length, 60); assert.equal(exj.run.example, true); assert.equal(exj.claims.filter(c => c.status === "receipt").length, 6);

    // attachment round trip
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const att = (await s.api("POST", "/api/runs/" + id + "/attachments", { name: "a.png", mediaType: "image/png", data: png.toString("base64"), transcribedText: "hello" })).data;
    assert.ok(att.id);
    const got = await fetch(s.base + "/api/runs/" + id + "/attachments/" + att.id);
    assert.equal(got.status, 200); assert.equal(got.headers.get("content-type").startsWith("image/png"), true);

    // restart: everything survives
    await s.close();
    s = await start(dataDir);
    b = (await s.api("GET", "/api/runs/" + id)).data;
    assert.equal(b.run.title, "Test run"); assert.equal(b.transcript, TRANSCRIPT); assert.equal(b.passages[0].status, "done"); assert.ok(b.summary); assert.equal(b.attachments.length, 1);
    list = (await s.api("GET", "/api/runs")).data;
    assert.equal(list.filter(r => r.id === "pilot-jre2308").length, 1, "example not duplicated on restart");

    // attribution change -> stale
    b = (await s.api("PUT", "/api/runs/" + id, { run: { provenance: Object.assign({}, b.run.provenance, { overrides: { "2": "GUEST", "4": "GUEST" } }) } })).data;
    assert.deepEqual(b.passages[0].stale, ["attribution changed since this analysis"]);
    assert.notEqual(b.attrSig, sig1);

    // transcript change -> provenance reset, cards stale for transcript too
    b = (await s.api("PUT", "/api/runs/" + id, { run: {}, transcript: TRANSCRIPT + "\nHOST: One more line." })).data;
    assert.equal(b.run.provenance.confirmedAt, undefined);
    assert.ok(b.passages[0].stale.includes("transcript changed since this analysis"));
    assert.equal(b.run.status, "draft");
    assert.deepEqual(b.run.provenance.overrides, {}, "a new turn changes the structure, so decisions are archived, not kept in place");
    assert.equal(b.run.provenanceHistory.length, 1); assert.deepEqual(b.run.provenanceHistory[0].provenance.overrides, { "2": "GUEST", "4": "GUEST" }); assert.equal(b.run.provenanceHistory[0].keptInPlace, false);

    // re-segment archives the old passages instead of deleting them
    b = (await s.api("POST", "/api/runs/" + id + "/passages", { passages: [{ title: "new", turnStart: 0, turnEnd: 3, stake: "", speakers: ["HOST"], status: "pending" }] })).data;
    assert.equal(b.passages.length, 1); assert.equal(b.passages[0].status, "pending");
    const archive = path.join(dataDir, "runs", id, "archive");
    assert.ok(fs.existsSync(archive) && fs.readdirSync(archive).length === 1, "archive created");

    // duplicate the example into an editable copy; its analyses and status carry over
    const dup = (await s.api("POST", "/api/runs/pilot-jre2308/duplicate")).data;
    assert.equal(dup.run.example, false); assert.equal(dup.run.copiedFrom, "pilot-jre2308"); assert.equal(dup.passages.length, 16);
    assert.equal(dup.run.provenance.confirmedAt, undefined, "copy keeps the unconfirmed status");
    assert.equal((await s.api("PUT", "/api/runs/" + dup.run.id, { run: { title: "renamed" } })).status, 200);

    // delete moves to trash; restore brings it back with everything
    const del = (await s.api("DELETE", "/api/runs/" + id)).data;
    assert.equal(del.ok, true); assert.ok(del.trash.startsWith(id + "-"));
    assert.equal((await s.api("GET", "/api/runs/" + id)).status, 404);
    assert.ok(fs.existsSync(path.join(dataDir, "trash", del.trash, "transcript.txt")), "run folder moved to trash, not removed");
    const trash = (await s.api("GET", "/api/trash")).data; assert.equal(trash.length, 1); assert.equal(trash[0].title, "Test run");
    const back = (await s.api("POST", "/api/trash/" + del.trash + "/restore")).data; assert.equal(back.id, id);
    b = (await s.api("GET", "/api/runs/" + id)).data; assert.equal(b.run.title, "Test run"); assert.equal(b.attachments.length, 1); assert.equal((await s.api("GET", "/api/trash")).data.length, 0);
    assert.equal((await s.api("GET", "/api/runs/../etc")).status, 404);
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("sample endpoint reports a missing model clearly", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-test-"));
  const { app, ready } = createApp({ dataDir, ai: null });
  await ready;
  const server = await new Promise(res => { const s = app.listen(0, "127.0.0.1", () => res(s)); });
  try {
    const r = await fetch("http://127.0.0.1:" + server.address().port + "/api/sample", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "hi" }) });
    assert.equal(r.status, 503); assert.equal((await r.json()).code, "no_ai");
  } finally { await new Promise(r => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("parseJSONLoose accepts fenced and padded JSON and rejects none", () => {
  assert.deepEqual(parseJSONLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJSONLoose('Here you go: {"a":[1,2]} thanks'), { a: [1, 2] });
  assert.throws(() => parseJSONLoose("no json here"), e => e.code === "invalid_json");
});

/* ---- evidence preservation: the server, not the page, guarantees a person's records survive ---- */
const T2 = [
  "HOST: Welcome back. Today we talk about plans.",
  "GUEST: In my clinical practice I tell people a bad plan beats no plan.",
  "HOST: Why is that?",
  "GUEST: Because even a failed attempt gives you information.",
].join("\n");
function reading(text, claims, extra) {
  return Object.assign({ asSaid: [{ turn: 1, speaker: "GUEST", quote: "a bad plan beats no plan" }], deflated: { hs: text, g5: text }, fidelity: { grade: "faithful", notes: { hs: "", g5: "" } },
    jump: { present: true, pivot: "even a failed attempt gives you information", hs: "j", g5: "j" }, defense: { hs: "d", g5: "d" }, revision: { jumpSurvives: "partly", hs: "r", g5: "r" },
    claims: claims.map(t => ({ text: t, speaker: "GUEST", type: "fact", basis: { hs: "b", g5: "b" }, status: "unchecked", wouldSettle: "", expectedSources: ["academic_paper"], searchQuery: "q", receipts: [], searches: [], candidates: [], rejections: [] })),
    judgments: { evidence: "weak", inference: "gap" } }, extra || {});
}
async function setup(dataDir, api) {
  const created = (await api("POST", "/api/runs", { run: { title: "Evidence", speakers: [{ key: "HOST", name: "Host" }, { key: "GUEST", name: "Guest" }] }, transcript: T2 })).data;
  const id = created.run.id;
  let b = (await api("PUT", "/api/runs/" + id, { run: { provenance: { overrides: {}, flags: [], confirmedAt: new Date().toISOString(), confirmedBy: "test", method: "t" }, status: "attributed" } })).data;
  b = (await api("POST", "/api/runs/" + id + "/passages", { passages: [{ title: "Plans", turnStart: 0, turnEnd: 3, stake: "", speakers: ["HOST", "GUEST"], status: "pending" }] })).data;
  const first = { title: "Plans", turnStart: 0, turnEnd: 3, stake: "", speakers: ["HOST", "GUEST"], status: "done", analysis: reading("one", ["A bad plan beats no plan.", "Failed attempts give information."]), analyzedAt: "2026-10-02T10:00:00.000Z", analyzedBy: "test", basedOn: { transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig } };
  b = (await api("PUT", "/api/runs/" + id + "/passages/p001", first)).data;
  return { id, b, first };
}

test("evidence: a client save can never drop a person's records; a new reading keeps history and carries them; withdrawal is recorded, not deleted", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-ev-"));
  const s = await start(dataDir);
  try {
    const { id, first } = await setup(dataDir, s.api);
    // a person attaches a receipt by hand (the page sends the whole passage)
    const withReceipt = JSON.parse(JSON.stringify(first));
    withReceipt.analysis.claims[0].receipts = [{ kind: "link", url: "https://example.org/paper", note: "supports it", addedBy: "person at this computer", at: "2026-10-02T10:05:00.000Z" }];
    withReceipt.analysis.claims[0].status = "receipt";
    let b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", withReceipt)).data;
    assert.equal(b.passages[0].analysis.claims[0].receipts.length, 1);
    assert.equal((b.passages[0].history || []).length, 0, "attaching a receipt is not a new reading");

    // a stale client (or any client) saves the passage WITHOUT the receipt: the server restores it
    const stale = JSON.parse(JSON.stringify(first)); // no receipts at all
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", stale)).data;
    assert.equal(b.passages[0].analysis.claims[0].receipts.length, 1, "receipt restored from disk");
    assert.equal(b.passages[0].analysis.claims[0].status, "receipt");

    // a client save that omits the analysis entirely (status flip) keeps it
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", { title: "Plans", turnStart: 0, turnEnd: 3, status: "running" })).data;
    assert.ok(b.passages[0].analysis, "analysis kept"); assert.equal(b.passages[0].analysis.claims[0].receipts.length, 1); assert.equal(b.passages[0].status, "running");

    // a new reading (different analyzedAt, rephrased second claim, same first claim) carries the receipt and keeps the old reading
    const second = Object.assign({}, first, { analysis: reading("two", ["A bad plan beats no plan.", "Trying tells you things."]), analyzedAt: "2026-10-02T11:00:00.000Z" });
    second.analysis.claims[1].receipts = [{ kind: "link", url: "https://example.org/new", note: "added in the same save", addedBy: "person", at: "2026-10-02T11:00:01.000Z" }];
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", second)).data;
    const p = b.passages[0];
    assert.equal(p.history.length, 1); assert.equal(p.history[0].analysis.deflated.hs, "one"); assert.equal(p.history[0].analyzedAt, "2026-10-02T10:00:00.000Z");
    assert.equal(p.analysis.claims[0].receipts.length, 1, "receipt carried to the claim with the same text");
    assert.equal(p.analysis.claims[1].receipts.length, 1, "a receipt sent with the new reading is kept too");
    assert.equal(p.rerun.carried, 1); assert.equal(p.rerun.orphaned, 0);

    // withdraw a receipt: it stays on record, marked; the claim's status drops back
    const c0id = p.analysis.claims[0].id, r0 = p.analysis.claims[0].receipts[0].rid; assert.ok(c0id && r0, "claim and receipt ids");
    b = (await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + c0id + "/receipts/" + r0 + "/withdraw", { reason: "wrong paper" })).data;
    const c0 = b.passages[0].analysis.claims[0];
    assert.equal(c0.receipts.length, 1); assert.ok(c0.receipts[0].withdrawnAt); assert.equal(c0.receipts[0].withdrawReason, "wrong paper"); assert.equal(c0.status, "unchecked");
    const ex = (await s.api("GET", "/api/runs/" + id + "/export.json")).data;
    assert.equal(ex.claims[0].status, "unchecked"); assert.equal(ex.claims[0].receipts[0].withdrawn, true); assert.equal(ex.claims[1].status, "receipt");

    // on disk: no computed quote fields are stored, and the history is there
    const disk = JSON.parse(fs.readFileSync(path.join(dataDir, "runs", id, "passages", "p001.json"), "utf8"));
    assert.equal(disk.analysis.asSaid[0].verbatim, undefined); assert.equal(disk.history.length, 1);
    // a client cannot shrink the history or the adoption notes, and cannot overwrite server-owned run fields
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", Object.assign({}, second, { history: [], adopted: [] }))).data;
    assert.equal(b.passages[0].history.length, 1);
    b = (await s.api("PUT", "/api/runs/" + id, { run: { orphans: [{ id: "fake" }], provenanceHistory: [], transcriptUpdatedAt: "1999", example: true, title: "renamed" } })).data;
    assert.equal(b.run.title, "renamed"); assert.equal(b.run.example, false); assert.equal((b.run.orphans || []).length, 0); assert.notEqual(b.run.transcriptUpdatedAt, "1999");
    // a copy stores no computed quote fields either
    const dup = (await s.api("POST", "/api/runs/" + id + "/duplicate")).data;
    const dupDisk = JSON.parse(fs.readFileSync(path.join(dataDir, "runs", dup.run.id, "passages", "p001.json"), "utf8"));
    assert.equal(dupDisk.quoteCheck, undefined); assert.equal(dupDisk.analysis.asSaid[0].speakerNow, undefined); assert.equal(dup.passages[0].analysis.asSaid[0].speakerNow, "GUEST", "but the served copy is checked");
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("evidence: a re-segment parks records on the run; the first matching reading adopts them; a person can reattach the rest", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-ev-"));
  const s = await start(dataDir);
  try {
    const { id, first } = await setup(dataDir, s.api);
    const withRecords = JSON.parse(JSON.stringify(first));
    withRecords.analysis.claims[0].receipts = [{ kind: "link", url: "https://example.org/a", note: "A", addedBy: "person", at: "t1" }];
    withRecords.analysis.claims[1].rejections = [{ candidateId: "x", url: "https://example.org/bad", reason: "does_not_address_claim", at: "t2" }];
    withRecords.analysis.claims[1].searches = [{ adapter: "crossref", query: "q", hitCount: 0, at: "t2" }];
    let b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", withRecords)).data;
    // re-segment into two passages
    b = (await s.api("POST", "/api/runs/" + id + "/passages", { passages: [{ title: "One", turnStart: 0, turnEnd: 1, stake: "", speakers: ["HOST", "GUEST"], status: "pending" }, { title: "Two", turnStart: 2, turnEnd: 3, stake: "", speakers: ["HOST", "GUEST"], status: "pending" }] })).data;
    assert.equal(b.run.orphans.length, 2, "both claims with records are parked");
    assert.equal(b.run.orphans[0].claimText, "A bad plan beats no plan."); assert.equal(b.run.orphans[0].from.passage, "p001"); assert.equal(b.run.orphans[0].receipts.length, 1);
    // first reading of the new passage p001 produces the same first claim text -> adopted
    const r1 = { title: "One", turnStart: 0, turnEnd: 1, stake: "", speakers: ["HOST", "GUEST"], status: "done", analysis: reading("x", ["A bad plan beats no plan.", "Something new."]), analyzedAt: "2026-10-02T12:00:00.000Z", analyzedBy: "test", basedOn: { transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig } };
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", r1)).data;
    assert.equal(b.passages[0].analysis.claims[0].receipts.length, 1, "parked receipt adopted by the matching claim");
    assert.equal(b.passages[0].analysis.claims[0].receipts[0].reattached.from.passage, "p001");
    assert.equal(b.passages[0].adopted.length, 1); assert.equal(b.run.orphans.length, 1, "the unmatched one stays parked");
    // the other passage's reading rephrases the claim -> stays parked; a person reattaches it by hand
    const r2 = { title: "Two", turnStart: 2, turnEnd: 3, stake: "", speakers: ["HOST", "GUEST"], status: "done", analysis: reading("y", ["Failure is informative."]), analyzedAt: "2026-10-02T12:01:00.000Z", analyzedBy: "test", basedOn: { transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig } };
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p002", r2)).data;
    assert.equal(b.run.orphans.length, 1);
    const oid = b.run.orphans[0].id;
    b = (await s.api("POST", "/api/runs/" + id + "/orphans/" + oid + "/attach", { pid: "p002", idx: 0 })).data;
    assert.equal(b.run.orphans.length, 0);
    const c = b.passages[1].analysis.claims[0];
    assert.equal(c.rejections.length, 1); assert.equal(c.searches.length, 1); assert.equal(c.rejections[0].reattached.originalClaimText, "Failed attempts give information."); assert.equal(c.status, "searched");
    assert.equal((await s.api("POST", "/api/runs/" + id + "/orphans/" + oid + "/attach", { pid: "p002", idx: 0 })).status, 404, "an orphan can be attached once");
    // the export lists nothing parked now and the archive still has the original passage
    const ex = (await s.api("GET", "/api/runs/" + id + "/export.json")).data; assert.equal(ex.run.orphans.length, 0);
    const archive = path.join(dataDir, "runs", id, "archive"); assert.equal(fs.readdirSync(archive).length, 1);
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("quotes: the server checks every quote on every read against the transcript as stored, and derives the speaker from the turn", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-ev-"));
  const s = await start(dataDir);
  try {
    const { id, first } = await setup(dataDir, s.api);
    let b = (await s.api("GET", "/api/runs/" + id)).data;
    let q = b.passages[0].analysis.asSaid[0];
    assert.equal(q.verbatim, true); assert.equal(q.speakerNow, "GUEST"); assert.equal(q.speakerMismatch, false); assert.equal(q.turnOk, true);
    assert.equal(b.passages[0].analysis.jump.pivotVerbatim, true); assert.deepEqual(b.passages[0].analysis.jump.pivotTurns, [3]);
    assert.deepEqual(b.passages[0].quoteCheck, { quotes: 1, matched: 1, mismatched: 0, outOfRange: 0, relocated: 0, pivotOk: true });
    // the model labels the quote HOST and points at the wrong turn: the words are found in exactly one turn of the passage
    const wrong = JSON.parse(JSON.stringify(first)); wrong.analysis.asSaid = [{ turn: 2, speaker: "HOST", quote: "a bad plan beats no plan", verbatim: true }, { turn: 1, speaker: "GUEST", quote: "a bad plan beats no plan … information", verbatim: true }];
    b = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", wrong)).data;
    q = b.passages[0].analysis.asSaid[0];
    assert.equal(q.verbatim, true, "found in exactly one turn of the passage"); assert.deepEqual(q.foundIn, [1]); assert.equal(q.matchedTurn, 1); assert.equal(q.relocated, true); assert.equal(q.speakerNow, "GUEST"); assert.equal(q.speakerMismatch, true, "the model said HOST; the transcript says GUEST");
    assert.equal(b.passages[0].analysis.asSaid[1].verbatim, false, "a splice across two turns is not one quote, whatever the client stored");
    assert.equal(b.passages[0].quoteCheck.mismatched, 1); assert.equal(b.passages[0].quoteCheck.matched, 1);
    // an attribution correction changes speakerNow at once (turn 1 relabelled HOST)
    b = (await s.api("PUT", "/api/runs/" + id, { run: { provenance: Object.assign({}, b.run.provenance, { overrides: { "1": "HOST" } }) } })).data;
    q = b.passages[0].analysis.asSaid[0]; assert.equal(q.speakerNow, "HOST"); assert.equal(q.speakerMismatch, false);
    // editing the transcript so the words change makes the badge false immediately, with no re-run
    b = (await s.api("PUT", "/api/runs/" + id, { run: {}, transcript: T2.replace("a bad plan beats no plan", "a good plan beats no plan") })).data;
    assert.equal(b.passages[0].analysis.asSaid[0].verbatim, false);
    assert.ok(b.passages[0].stale.includes("transcript changed since this analysis"));
    assert.deepEqual(b.run.provenance.overrides, { "1": "HOST" }, "same turn structure: the label corrections are kept in place");
    assert.equal(b.run.provenance.confirmedAt, undefined, "but the confirmation is cleared");
    assert.match(b.run.provenance.transcriptNote, /kept, confirmation cleared/);
    assert.equal(b.run.provenanceHistory.length, 1); assert.equal(b.run.provenanceHistory[0].keptInPlace, true);
    // markdown at the fifth-grade level
    const md = await s.api("GET", "/api/runs/" + id + "/export.md?level=g5");
    assert.match(String(md.data), /fifth-grade reading level/); assert.match(String(md.data), /Reading held/); assert.doesNotMatch(String(md.data), /— not found word for word/);
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});
