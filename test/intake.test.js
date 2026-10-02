"use strict";
/* Paste-and-go intake, validation, concurrency, claim identity, the link importer and the one-time key setting. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research/index");
const { htmlToText } = require("../server/importer");
const { upsertEnvLine } = require("../server/settings");
const SH = require("../shared/transcript");

async function start(dataDir, extra) {
  const { app, ready, state } = createApp(Object.assign({ dataDir, ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }) }, extra || {}));
  await ready;
  const server = await new Promise(res => { const s = app.listen(0, "127.0.0.1", () => res(s)); });
  const base = "http://127.0.0.1:" + server.address().port;
  const api = async (method, p, body) => { const r = await fetch(base + p, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = text; } return { status: r.status, data }; };
  return { server, base, api, state, close: () => new Promise(r => server.close(r)) };
}
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "deflate-intake-")); }

test("a bare claim with no title, date, speaker, URL or final period becomes a searchable run on its own", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const b = (await s.api("POST", "/api/runs", { run: { kind: "claim" }, transcript: "The Earth is getting greener" })).data;
    assert.equal(b.run.kind, "claim"); assert.equal(b.run.title, "The Earth is getting greener"); assert.equal(b.run.status, "analyzed"); assert.equal(b.run.parseMode, "text");
    assert.equal(b.run.provenance.notApplicable, true); assert.match(b.run.provenance.method, /nothing to attribute/);
    assert.equal(b.run.sourceDate, ""); assert.equal(b.run.sourceUrl, "");
    assert.equal(b.passages.length, 1); const c = b.passages[0].analysis.claims[0];
    assert.equal(c.type, "claim"); assert.equal(c.userSupplied, true); assert.equal(c.text, "The Earth is getting greener"); assert.ok(c.id);
    assert.ok(c.searchQuery.length > 0, "query generated: " + c.searchQuery); assert.deepEqual(c.expectedSources, ["academic_paper"]);
    assert.deepEqual(b.passages[0].stale, []); assert.equal(b.passages[0].quoteCheck.quotes, 0);
    // it searches with every optional setting blank, using the configured connectors (mock here)
    const CL = "/api/runs/" + b.run.id + "/passages/p001/claims/" + c.id;
    const sr = (await s.api("POST", CL + "/search")).data;
    assert.equal(sr.candidates.length, 2); assert.equal(sr.obligation.priority, "primary");
    assert.equal((sr.bundle.passages[0].history || []).length, 0, "a search is not a new reading");
    const ob = (await s.api("GET", "/api/runs/" + b.run.id + "/obligations.json")).data; assert.equal(ob.obligations.length, 1); assert.equal(ob.obligations[0].claim_type, "claim");
    // a quoted sentence keeps its quotation marks off the claim text
    const q = (await s.api("POST", "/api/runs", { run: { kind: "claim" }, transcript: "“Religious married couples have the most sex.”" })).data;
    assert.equal(q.passages[0].analysis.claims[0].text, "Religious married couples have the most sex."); assert.equal(q.run.title, "Religious married couples have the most sex.");
    // the person can edit the query and the source types; a stale client cannot revert it
    let r = (await s.api("PUT", CL + "/routing", { searchQuery: "leaf area index global greening", expectedSources: ["academic_paper", "government_data"] })).data;
    assert.equal(r.passages[0].analysis.claims[0].searchQuery, "leaf area index global greening");
    const staleDoc = JSON.parse(JSON.stringify(b.passages[0])); delete staleDoc.id; delete staleDoc.stale; delete staleDoc.quoteCheck;
    r = (await s.api("PUT", "/api/runs/" + b.run.id + "/passages/p001", staleDoc)).data;
    assert.equal(r.passages[0].analysis.claims[0].searchQuery, "leaf area index global greening", "edited routing survives a stale save");
    assert.equal((await s.api("PUT", CL + "/routing", { expectedSources: ["nonsense"] })).status, 400);
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("unlabeled text is usable: Speaker unknown, attribution not applicable, no heading heuristics; saved runs keep their parse rules", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const text = "Plans beat waiting\n\nA bad plan beats no plan. Waiting teaches nothing.\n\nFeeds optimise for now";
    const b = (await s.api("POST", "/api/runs", { run: {}, transcript: text })).data;
    assert.equal(b.run.kind, "transcript"); assert.equal(b.run.parseMode, "text"); assert.equal(b.run.title, "Plans beat waiting");
    assert.deepEqual(b.run.speakers, [{ key: "UNLABELED", name: "Speaker unknown", bio: "" }]);
    assert.equal(b.run.provenance.notApplicable, true); assert.match(b.run.provenance.method, /Speaker unknown/);
    const turns = SH.parseTranscript(b.transcript, { mode: "text" });
    assert.equal(turns.length, 3); assert.ok(turns.every(t => !t.heading), "no heading in text mode");
    assert.equal(SH.parseTranscript(b.transcript).filter(t => t.heading).length, 2, "the legacy rules would have made headings of two of them");
    // a labelled transcript keeps the legacy rules and the review requirement
    const l = (await s.api("POST", "/api/runs", { run: {}, transcript: "HOST: Hi there.\nGUEST: Hello." })).data;
    assert.equal(l.run.parseMode, "transcript"); assert.equal(l.run.provenance.notApplicable, undefined); assert.equal(l.run.title, "Hi there.");
    assert.equal((await s.api("PUT", "/api/runs/" + l.run.id, { run: { parseMode: "text" } })).data.run.parseMode, "transcript", "parse mode is fixed at creation");
    // the supplied example (no parseMode field) is still parsed under the legacy rules: 448 turns, every quote matched
    const ex = (await s.api("GET", "/api/runs/pilot-jre2308")).data;
    assert.equal(SH.parseTranscript(ex.transcript).length, 448); assert.equal(ex.passages.reduce((n, p) => n + p.quoteCheck.matched, 0), 63);
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("validation: malformed saves are refused with a reason, never written", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const b = (await s.api("POST", "/api/runs", { run: {}, transcript: "HOST: one.\nGUEST: two.\nHOST: three." })).data; const id = b.run.id;
    let r = await s.api("PUT", "/api/runs/" + id, { run: { sourceUrl: "not a link" } }); assert.equal(r.status, 400); assert.match(r.data.error, /http\(s\)/);
    r = await s.api("PUT", "/api/runs/" + id, { run: { sourceDate: "yesterday" } }); assert.equal(r.status, 400);
    r = await s.api("PUT", "/api/runs/" + id, { run: { status: "finished" } }); assert.equal(r.status, 400);
    r = await s.api("PUT", "/api/runs/" + id, { run: { provenance: { overrides: { "7": "HOST" } } } }); assert.equal(r.status, 400); assert.match(r.data.error, /no such speaking turn/);
    r = await s.api("PUT", "/api/runs/" + id, { run: { provenance: { overrides: { "1": "NOBODY" } } } }); assert.equal(r.status, 400); assert.match(r.data.error, /unknown speaker/);
    r = await s.api("PUT", "/api/runs/" + id, { run: { provenance: { overrides: { "1": "HOST" }, confirmedAt: "x", confirmedBy: "t" } } }); assert.equal(r.status, 200);
    r = await s.api("POST", "/api/runs/" + id + "/passages", { passages: [{ title: "x", turnStart: 2, turnEnd: 1 }] }); assert.equal(r.status, 400); assert.match(r.data.error, /turnStart <= turnEnd/);
    r = await s.api("POST", "/api/runs/" + id + "/passages", { passages: [{ title: "x", turnStart: 0, turnEnd: 9 }] }); assert.equal(r.status, 400); assert.match(r.data.error, /past the last turn/);
    r = await s.api("POST", "/api/runs/" + id + "/passages", { passages: [{ title: "b", turnStart: 2, turnEnd: 2 }, { title: "a", turnStart: 0, turnEnd: 1 }] }); assert.equal(r.status, 400); assert.match(r.data.error, /turn order/);
    r = await s.api("POST", "/api/runs/" + id + "/passages", { passages: [{ title: "ok", turnStart: 0, turnEnd: 2 }] }); assert.equal(r.status, 200);
    r = await s.api("PUT", "/api/runs/" + id + "/passages/p001", { title: "x", turnStart: 0, turnEnd: 2, status: "done" }); assert.equal(r.status, 400); assert.match(r.data.error, /needs an analysis/);
    // an empty or hollow analysis cannot become a finished card (F6): normalising is not accepting
    r = await s.api("PUT", "/api/runs/" + id + "/passages/p001", { title: "x", turnStart: 0, turnEnd: 2, status: "done", analysis: {}, analyzedAt: "t" }); assert.equal(r.status, 400); assert.match(r.data.error, /plain-words rewrite/); assert.match(r.data.error, /at least one claim/); assert.match(r.data.error, /quote/);
    r = await s.api("PUT", "/api/runs/" + id + "/passages/p001", { title: "x", turnStart: 0, turnEnd: 2, status: "done", analysis: { claims: [{ text: "c", type: "nonsense", basis: "b" }], judgments: { evidence: "huge" } }, analyzedAt: "t" }); assert.equal(r.status, 400, "claims but no rewrite and no quotes");
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, "runs", id, "passages", "p001.json"), "utf8")).status, "pending", "the refused save wrote nothing");
    r = await s.api("PUT", "/api/runs/" + id + "/passages/p001", { title: "x", turnStart: 0, turnEnd: 2, status: "done", analysis: { deflated: "plain", asSaid: [{ turn: 0, speaker: "HOST", quote: "one" }], claims: [{ text: "c", type: "nonsense", basis: "b" }], judgments: { evidence: "huge" } }, analyzedAt: "t" });
    assert.equal(r.status, 200); assert.equal(r.data.passages[0].analysis.claims[0].type, "unscorable"); assert.equal(r.data.passages[0].analysis.judgments.evidence, "n/a"); assert.equal(r.data.passages[0].analysis.claims[0].basis.hs, "b");
    r = await s.api("PUT", "/api/runs/" + id + "/summary", { patterns: [{ title: "t", body: "b", passages: ["p001", "p999", "junk"] }], survived: "s" });
    assert.equal(r.status, 200); assert.deepEqual(r.data.summary.patterns[0].passages, ["p001"], "unknown passage ids dropped");
    const cidV = r.data.passages[0].analysis.claims[0].id;
    r = await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + cidV + "/receipts", { url: "ftp://x" }); assert.equal(r.status, 400);
    r = await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/nosuchclaim/receipts", { url: "https://x.org" }); assert.equal(r.status, 404); assert.equal(r.data.code, "claim_not_current");
    assert.equal(fs.existsSync(path.join(dataDir, "runs", id, "passages", "p002.json")), false);
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("concurrency: twelve sources attached at the same moment all survive; the run's updatedAt moves with every save", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const b = (await s.api("POST", "/api/runs", { run: { kind: "claim" }, transcript: "Twelve at once" })).data; const id = b.run.id;
    const cid = b.passages[0].analysis.claims[0].id; const CL = "/api/runs/" + id + "/passages/p001/claims/" + cid;
    const before = b.run.updatedAt;
    await new Promise(r => setTimeout(r, 5));
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => s.api("POST", CL + "/receipts", { url: "https://example.org/" + i, note: "n" + i })));
    assert.ok(results.every(r => r.status === 200));
    const after = (await s.api("GET", "/api/runs/" + id)).data;
    assert.equal(after.passages[0].analysis.claims[0].receipts.length, 12, "no lost update");
    assert.ok(after.run.updatedAt > before, "run updatedAt advanced on a passage save");
    assert.equal((await s.api("GET", "/api/runs")).data.find(r => r.id === id).updatedAt, after.run.updatedAt);
    // a search and a manual attach racing each other
    const race = await Promise.all([s.api("POST", CL + "/search"), s.api("POST", CL + "/receipts", { url: "https://example.org/race", note: "r" })]);
    assert.ok(race.every(r => r.status === 200));
    const fin = (await s.api("GET", "/api/runs/" + id)).data.passages[0].analysis.claims[0];
    assert.equal(fin.receipts.length, 13); assert.equal(fin.searches.length, 3); assert.equal(fin.candidates.length, 2);
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("claim identity: ids are stable across re-runs and reorderings; the export and records point at them", async () => {
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    const b = (await s.api("POST", "/api/runs", { run: {}, transcript: "A: one two three.\nB: four five six." })).data; const id = b.run.id;
    await s.api("PUT", "/api/runs/" + id, { run: { provenance: { overrides: {}, confirmedAt: "t", confirmedBy: "t" } } });
    await s.api("POST", "/api/runs/" + id + "/passages", { passages: [{ title: "p", turnStart: 0, turnEnd: 1 }] });
    const mk = (claims, at) => ({ title: "p", turnStart: 0, turnEnd: 1, status: "done", analyzedAt: at, analysis: { deflated: { hs: "d", g5: "d" }, asSaid: [{ turn: 0, speaker: "A", quote: "one two three" }], claims: claims.map(t => ({ text: t, type: "fact", speaker: "A", basis: "b" })) } });
    let r = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", mk(["Alpha is true.", "Beta is true."], "t1"))).data;
    const [a1, b1] = r.passages[0].analysis.claims.map(c => c.id); assert.ok(a1 && b1 && a1 !== b1);
    await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + b1 + "/receipts", { url: "https://example.org/beta", note: "beta source" });
    // the re-run reorders the claims and rephrases Alpha
    r = (await s.api("PUT", "/api/runs/" + id + "/passages/p001", mk(["Beta is true.", "Alpha holds."], "t2"))).data;
    const claims = r.passages[0].analysis.claims;
    assert.equal(claims[0].id, b1, "Beta keeps its id although it moved"); assert.equal(claims[0].receipts.length, 1);
    assert.notEqual(claims[1].id, a1, "a rephrased claim is a new claim"); assert.equal(claims[1].receipts.length, 0);
    assert.equal(r.passages[0].rerun.orphaned, 0, "Alpha had no records, so nothing is orphaned");
    const ex = (await s.api("GET", "/api/runs/" + id + "/export.json")).data;
    assert.equal(ex.claims[0].id, b1); assert.equal(ex.claims[0].passageId, "p001"); assert.equal(ex.claims[0].position, 1);
    const disk = JSON.parse(fs.readFileSync(path.join(dataDir, "runs", id, "passages", "p001.json"), "utf8"));
    assert.equal(disk.history[0].analysis.claims[1].id, b1, "history keeps the id too");
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("link importer: readable pages import; sites without transcripts, logins, thin pages and timeouts say so", async () => {
  const fixture = http.createServer((req, res) => {
    if (req.url === "/article") { res.setHeader("Content-Type", "text/html"); res.end("<html><head><title>Greening &amp; its drivers</title><style>p{}</style></head><body><nav>menu menu</nav><article><h1>Greening of the Earth</h1><p>First paragraph of the article about leaf area index rising across a third of the vegetated planet since the early nineteen eighties.</p><p>Second paragraph: the drivers include carbon dioxide fertilisation, nitrogen deposition, climate change and land use change, with CO&#8322; the largest share.</p><script>var x = 1;</script></article><footer>foot</footer></body></html>"); }
    else if (req.url === "/thin") { res.setHeader("Content-Type", "text/html"); res.end("<html><head><title>App</title></head><body><div id=root></div><script>render()</script></body></html>"); }
    else if (req.url === "/login") { res.statusCode = 403; res.end("forbidden"); }
    else if (req.url === "/t.txt") { res.setHeader("Content-Type", "text/plain"); res.end("HOST: Welcome back. Today we talk about plans and the way a bad plan beats no plan at all.\nGUEST: Thanks for having me. In my clinical practice I tell people a bad plan beats no plan, and a failed attempt gives information.\n"); }
    else if (req.url === "/slow") { setTimeout(() => res.end("late"), 3000); }
    else { res.statusCode = 404; res.end(); }
  });
  await new Promise(r => fixture.listen(0, "127.0.0.1", r));
  const fx = "http://127.0.0.1:" + fixture.address().port;
  const dataDir = tmp(); const s = await start(dataDir);
  try {
    let r = await s.api("POST", "/api/import", { url: fx + "/article" });
    assert.equal(r.status, 200); assert.equal(r.data.ok, true); assert.equal(r.data.title, "Greening & its drivers"); assert.match(r.data.text, /^Greening of the Earth\nFirst paragraph/); assert.doesNotMatch(r.data.text, /menu|foot|var x/); assert.match(r.data.text, /CO₂ the largest/); assert.equal(r.data.method, "html-text");
    r = await s.api("POST", "/api/import", { url: fx + "/t.txt" }); assert.equal(r.data.ok, true); assert.equal(r.data.method, "text-file"); assert.match(r.data.text, /^HOST: Welcome back/);
    r = await s.api("POST", "/api/import", { url: "https://www.youtube.com/watch?v=QBEZhjnZTks" }); assert.equal(r.status, 200); assert.equal(r.data.ok, false); assert.equal(r.data.noImporter, true); assert.match(r.data.reason, /Show transcript/);
    r = await s.api("POST", "/api/import", { url: fx + "/thin" }); assert.equal(r.data.ok, false); assert.match(r.data.reason, /characters of readable text/); assert.equal(r.data.title, "App");
    r = await s.api("POST", "/api/import", { url: fx + "/login" }); assert.equal(r.data.ok, false); assert.match(r.data.reason, /HTTP 403/);
    r = await s.api("POST", "/api/import", { url: "notalink" }); assert.equal(r.data.ok, false); assert.match(r.data.reason, /http/);
    r = await s.api("POST", "/api/import", { url: "http://127.0.0.1:1/" }); assert.equal(r.data.ok, false); assert.match(r.data.reason, /Could not reach/);
    assert.equal(fs.readdirSync(path.join(dataDir, "runs")).length, 1, "importing stores nothing (only the example is there)");
    assert.deepEqual(htmlToText("<p>a&nbsp;b</p><p>c</p>"), { title: "", text: "a b\nc" });
  } finally { await s.close(); await new Promise(r => fixture.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test("one-time key setting: written to .env with other lines kept, never echoed; a wrong shape saves nothing", async () => {
  const dataDir = tmp(); const envPath = path.join(dataDir, ".env");
  fs.writeFileSync(envPath, "# my settings\nPORT=3999\n# ANTHROPIC_API_KEY=sk-ant-...\nRESEARCH_CONTACT_EMAIL=me@example.org\n");
  const saved = process.env.ANTHROPIC_API_KEY, savedMock = process.env.DEFLATE_MOCK_AI;
  delete process.env.DEFLATE_MOCK_AI;
  const s = await start(dataDir, { ai: null, envPath });
  try {
    let h = (await s.api("GET", "/api/health")).data; assert.equal(h.ai, null); assert.equal(h.keyConfigurable, true);
    let r = await s.api("POST", "/api/settings/anthropic-key", { key: "hunter2" }); assert.equal(r.status, 400); assert.match(r.data.error, /sk-ant-/);
    assert.equal(fs.readFileSync(envPath, "utf8").includes("hunter2"), false);
    const fake = "sk-ant-" + "a".repeat(40);
    r = await s.api("POST", "/api/settings/anthropic-key", { key: fake });
    assert.equal(r.status, 200); assert.equal(JSON.stringify(r.data).includes(fake), false, "the key is not echoed"); assert.equal(r.data.ai.kind, "anthropic");
    const env = fs.readFileSync(envPath, "utf8");
    assert.match(env, /^PORT=3999$/m); assert.match(env, /^RESEARCH_CONTACT_EMAIL=me@example.org$/m); assert.match(env, /^# my settings$/m);
    assert.equal(env.match(/ANTHROPIC_API_KEY=/g).length, 1, "the commented placeholder line was replaced, not duplicated"); assert.match(env, new RegExp("^ANTHROPIC_API_KEY=" + fake + "$", "m"));
    if (process.platform !== "win32") assert.equal(fs.statSync(envPath).mode & 0o777, 0o600);
    h = (await s.api("GET", "/api/health")).data; assert.equal(h.ai.kind, "anthropic"); assert.equal(JSON.stringify(h).includes(fake), false);
    assert.equal(upsertEnvLine("A=1\n", "B", "2"), "A=1\nB=2\n"); assert.equal(upsertEnvLine("A=1\nB=old\nC=3\n", "B", "2"), "A=1\nB=2\nC=3\n");
  } finally { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved; if (savedMock !== undefined) process.env.DEFLATE_MOCK_AI = savedMock; }
});
