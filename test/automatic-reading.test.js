"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research");
const { cleanText } = require("../server/intake");
const { htmlToText } = require("../server/importer");
const { sha256 } = require("../server/store");

const transcript = Array.from({ length: 18 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": We are discussing an argument with enough quoted words to test the reading " + i + ".").join("\n");
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function fixture(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-auto-"));
  const system = createApp(Object.assign({ dataDir: dir, ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), examplesDir: dir }, extra));
  await system.ready;
  const server = await new Promise(r => { const s = system.app.listen(0, "127.0.0.1", () => r(s)); });
  const url = "http://127.0.0.1:" + server.address().port;
  const api = async (method, endpoint, body) => {
    const response = await fetch(url + endpoint, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: response.headers.get("content-type").includes("json") ? await response.json() : await response.text() };
  };
  t.after(async () => { for (const job of system.reader.jobs.values()) job.controller.abort(); await Promise.all([...system.reader.jobs.values()].map(j => j.done)); await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const finish = async id => { const job = system.reader.jobs.get(id); if (job) await job.done; return system.store.bundle(id); };
  return { ...system, api, dir, finish };
}

test("one upload request prepares all readings, an independently reviewed overview and source links without manual stages", async t => {
  const s = await fixture(t);
  const uploaded = "Listen LIVE\nPage controls\n" + transcript + "\nEnd of interview.\nMore Transcripts to Consider\nNewsletter signup\n";
  const response = await s.api("POST", "/api/intake", { input: uploaded });
  assert.equal(response.status, 202);
  const id = response.data.run.id, b = await s.finish(id);
  assert.equal(b.transcript, transcript);
  assert.ok(!b.run.title.includes("Listen LIVE"));
  assert.deepEqual(b.run.speakers.map(s => s.key), ["HOST", "GUEST"]);
  assert.equal(b.attributionGate.status, "ready");
  assert.equal(b.run.provenance.confirmedAt, undefined, "automatic checks must not forge a person's confirmation");
  assert.equal(b.run.processing.status, "complete");
  assert.equal(b.passages.length, 3);
  for (const p of b.passages) {
    assert.equal(p.readingGate.status, "ready"); assert.equal(p.quoteCheck.matched, p.quoteCheck.quotes);
    assert.ok(p.provenance.review.approved); assert.ok(p.analysis.deflated.hs); assert.ok(p.analysis.deflated.g5);
    const c = p.analysis.claims.find(c => c.type === "claim");
    assert.equal(c.candidates.length, 2); assert.ok(c.searches.length); assert.equal(c.receipts.length, 0, "search results are not automatically accepted as proof");
  }
  assert.equal(b.summary.readingGate.status, "ready"); assert.equal(b.summary.provenance.review.approved, true);
  assert.equal((await s.api("GET", "/api/runs/" + id + "/original-input.txt")).data, uploaded);
  assert.equal(b.run.intake.originalHash, sha256(uploaded));
});

test("a readable link uses its article, real title and current URL, even if the optional form contains another source", async t => {
  const url = "https://example.org/transcript", title = "A discussion about evidence";
  const html = "<html><head><title>" + title + "</title></head><body><div>Listen LIVE</div><nav>Old menus</nav><article><h1>" + title + "</h1>" + transcript.split("\n").map(x => "<p>" + x + "</p>").join("") + "<p>End of interview.</p><p>Newsletter signup</p></article><div>Other stories</div></body></html>";
  const s = await fixture(t, { fetch: async address => { assert.equal(address, url); return new Response(html, { status: 200, headers: { "content-type": "text/html" } }); } });
  const response = await s.api("POST", "/api/intake", { input: url, context: { sourceUrl: "https://example.org/wrong-story" } });
  const b = await s.finish(response.data.run.id);
  assert.equal(b.run.title, title); assert.equal(b.run.sourceUrl, url); assert.equal(b.run.sourceLabel, title);
  assert.equal(b.transcript, transcript); assert.equal(b.run.processing.status, "complete");
  assert.ok(!b.transcript.includes("Newsletter")); assert.ok(!b.transcript.includes("Other stories"));
});

test("cleanup keeps continuation paragraphs and every word inside the dialogue, and never truncates the last turn without an end marker", () => {
  const dialogue = "HOST: The first statement is here.\nMore information follows.\n\nGUEST: A second speaker answers.\nHOST: The last speech starts here.\nAnd continues on this final line.";
  assert.equal(cleanText("Page title\n" + dialogue).text, dialogue);
  assert.equal(cleanText(dialogue + "\nEnd of interview.\nPage controls").text, dialogue);
  const article = htmlToText("<title>Article</title><main><p>An article without labelled speakers remains readable.</p><p>This paragraph must stay.</p></main><div>Outside menu</div>");
  assert.ok(article.text.includes("This paragraph must stay.")); assert.ok(!article.text.includes("Outside menu"));
});

test("unreadable links and JSON without transcript text fail plainly before creating a run", async t => {
  const s = await fixture(t);
  for (const input of ["https://www.youtube.com/watch?v=example", '{"schema":"deflate-lens/claims@0.5","claims":[]}']) {
    const r = await s.api("POST", "/api/intake", { input });
    assert.ok(r.status >= 400); assert.match(r.data.error, /transcript/i);
    assert.equal((await s.store.listRuns()).length, 0);
  }
});

test("missing key preserves the upload, then one continue action completes it", async t => {
  const s = await fixture(t, { ai: null });
  const r = await s.api("POST", "/api/intake", { input: transcript }); const id = r.data.run.id;
  let b = await s.finish(id);
  assert.equal(b.run.processing.status, "awaiting_key"); assert.equal(b.passages.length, 0); assert.equal(b.transcript, transcript);
  s.state.ai = createMockAI();
  assert.equal((await s.api("POST", "/api/runs/" + id + "/read", {})).status, 202);
  b = await s.finish(id); assert.equal(b.run.processing.status, "complete"); assert.equal(b.passages.length, 3);
});

test("a bare claim searches without a model key, then gains a reviewed explanation while keeping its identity and evidence", async t => {
  const s = await fixture(t, { ai: null });
  const r = await s.api("POST", "/api/intake", { input: "The Earth is getting greener" }); const id = r.data.run.id;
  let b = await s.finish(id), c = b.passages[0].analysis.claims[0]; const cid = c.id;
  assert.equal(b.run.processing.status, "awaiting_key"); assert.equal(c.candidates.length, 2); assert.equal(b.passages[0].readingGate.status, "ready");
  await s.api("POST", "/api/runs/" + id + "/passages/p001/claims/" + cid + "/receipts", { url: "https://example.org/attached-source" });
  s.state.ai = createMockAI(); await s.api("POST", "/api/runs/" + id + "/read", {}); b = await s.finish(id); c = b.passages[0].analysis.claims[0];
  assert.equal(c.id, cid); assert.equal(c.text, "The Earth is getting greener"); assert.equal(c.receipts.length, 1); assert.ok(c.plain.g5);
  assert.equal(b.passages[0].readingGate.status, "ready"); assert.equal(b.run.processing.status, "complete");
});

test("repeated start requests share one job and retrying a finished reading does not generate or search it again", async t => {
  const entered = deferred(), release = deferred(), mock = createMockAI(); let generations = 0;
  const ai = { ...mock, async sample(args) { if (args.prompt.startsWith("Help a reader understand this passage")) { generations++; entered.resolve(); await release.promise; } return mock.sample(args); } };
  const s = await fixture(t, { ai });
  const r = await s.api("POST", "/api/intake", { input: transcript }); const id = r.data.run.id;
  await entered.promise;
  const again = await s.api("POST", "/api/runs/" + id + "/read", {});
  assert.equal(again.data.run.processing.id, r.data.run.processing.id); assert.equal(generations, 1);
  release.resolve(); let b = await s.finish(id); const before = b.passages.map(p => [p.readingRev, p.analysis.claims[1].searches.length, p.analysis.claims[1].id]);
  await s.api("POST", "/api/runs/" + id + "/read", {}); b = await s.finish(id);
  assert.equal(generations, 3); assert.deepEqual(b.passages.map(p => [p.readingRev, p.analysis.claims[1].searches.length, p.analysis.claims[1].id]), before);
});

test("refreshing the page does not cancel work, while Stop prevents a late provider answer from becoming a reading", async t => {
  const entered = deferred(), release = deferred(), mock = createMockAI();
  const s = await fixture(t, { ai: { ...mock, async sample(args) { if (args.prompt.startsWith("Help a reader understand this passage")) { entered.resolve(); await release.promise; } return mock.sample(args); } } });
  const r = await s.api("POST", "/api/intake", { input: transcript }), id = r.data.run.id;
  await entered.promise;
  assert.equal((await s.api("GET", "/api/runs/" + id)).data.run.processing.status, "running");
  await s.api("POST", "/api/runs/" + id + "/stop", {}); release.resolve(); const b = await s.finish(id);
  assert.equal(b.run.processing.status, "stopped"); assert.ok(b.passages.every(p => !p.analysis));
  assert.equal(b.transcript, transcript);
});

test("an input edit during reading is detected before commit, and one retry uses the edited input", async t => {
  const entered = deferred(), release = deferred(), mock = createMockAI(); let first = true;
  const s = await fixture(t, { ai: { ...mock, async sample(args) { if (first && args.prompt.startsWith("Help a reader understand this passage")) { first = false; entered.resolve(); await release.promise; } return mock.sample(args); } } });
  const r = await s.api("POST", "/api/intake", { input: transcript }), id = r.data.run.id;
  await entered.promise;
  const edited = transcript.replace(/discussing/g, "examining");
  await s.api("PUT", "/api/runs/" + id, { run: {}, transcript: edited }); release.resolve();
  let b = await s.finish(id); assert.equal(b.run.processing.status, "error"); assert.equal(b.run.processing.error.code, "input_changed");
  assert.ok(b.passages.every(p => p.readingGate.status !== "ready"));
  await s.api("POST", "/api/runs/" + id + "/read", {}); b = await s.finish(id);
  assert.equal(b.run.processing.status, "complete"); assert.equal(b.transcript, edited);
  assert.ok(b.passages.every(p => p.basedOn.inputHash === sha256(edited)));
});

test("an unresolved attribution stops the automatic flow before segmentation and grading", async t => {
  const mock = createMockAI(), prompts = [];
  const s = await fixture(t, { ai: { ...mock, async sample(args) { prompts.push(args.prompt); const out = await mock.sample(args); if (/^(Prepare transcript|Review transcript speaker)/.test(args.prompt)) { out.data.decisions[0].status = "uncertain"; out.data.decisions[0].speaker = ""; } return out; } } });
  const r = await s.api("POST", "/api/intake", { input: transcript }), b = await s.finish(r.data.run.id);
  assert.equal(b.run.processing.status, "held"); assert.equal(b.passages.length, 0);
  assert.ok(!prompts.some(p => p.startsWith("Help a reader understand this passage") || p.startsWith("Split this transcript")));
  assert.match(b.run.processing.message, /reliable speaker labels/);
});

test("server restart marks an unfinished job resumable and cannot report it as still running forever", async t => {
  const s = await fixture(t);
  const id = await s.store.createRun({}, transcript);
  await s.store.saveProcessing(id, { id: "oldjob", status: "running", message: "Working" });
  const next = createApp({ dataDir: s.dir, ai: createMockAI(), examplesDir: s.dir }); await next.ready;
  let b = await next.store.bundle(id); assert.equal(b.run.processing.status, "interrupted");
  await next.reader.start(id); const job = next.reader.jobs.get(id); if (job) await job.done;
  b = await next.store.bundle(id); assert.equal(b.run.processing.status, "complete");
});

test("existing imports with menu titles and a leftover source are repaired and their old input remains accessible", async t => {
  const s = await fixture(t);
  const original = "Listen LIVE\n" + transcript + "\nEnd of interview.\nNewsletter";
  const id = await s.store.createRun({ title: "Listen LIVE", sourceUrl: "https://example.org/old", import: { url: "https://example.org/current", title: "Current interview", method: "html-text" } }, original);
  await s.api("POST", "/api/runs/" + id + "/read", {}); const b = await s.finish(id);
  assert.equal(b.run.title, "Current interview"); assert.equal(b.run.sourceUrl, "https://example.org/current");
  assert.equal(b.transcript, transcript); assert.equal(b.run.processing.status, "complete");
  assert.equal((await s.api("GET", "/api/runs/" + id + "/original-input.txt")).data, original);
});

test("a failed overview is held before display and retry fixes only the overview, preserving the prepared cards", async t => {
  const mock = createMockAI(); let wrong = true, readings = 0;
  const s = await fixture(t, { ai: { ...mock, async sample(args) { const out = await mock.sample(args); if (args.prompt.startsWith("Help a reader understand this passage")) readings++; if (wrong && args.prompt.startsWith("Below are the final readings of")) out.data.patterns = [{ title: { hs: "x", g5: "x" }, body: { hs: "x", g5: "x" }, passages: ["p999"] }]; return out; } } });
  const r = await s.api("POST", "/api/intake", { input: transcript }), id = r.data.run.id;
  let b = await s.finish(id); assert.equal(b.run.processing.status, "partial"); assert.equal(b.summary, null);
  assert.ok(b.passages.every(p => p.readingGate.status === "ready")); const revisions = b.passages.map(p => p.readingRev);
  wrong = false; await s.api("POST", "/api/runs/" + id + "/read", {}); b = await s.finish(id);
  assert.equal(b.run.processing.status, "complete"); assert.equal(b.summary.readingGate.status, "ready"); assert.equal(readings, 3); assert.deepEqual(b.passages.map(p => p.readingRev), revisions);
});

test("a stopped provider call cannot overwrite a newer resumed job or its completed readings", async t => {
  const mock = createMockAI(), entered = deferred(), release = deferred();
  const s = await fixture(t, { ai: { ...mock, async sample(args) { if (args.prompt.startsWith("Help a reader understand this passage")) { entered.resolve(); await release.promise; } return mock.sample(args); } } });
  const r = await s.api("POST", "/api/intake", { input: transcript }), id = r.data.run.id;
  await entered.promise; const old = s.reader.jobs.get(id);
  await s.api("POST", "/api/runs/" + id + "/stop", {}); s.state.ai = mock;
  const next = await s.api("POST", "/api/runs/" + id + "/read", {}); assert.notEqual(next.data.run.processing.id, old.id);
  let b = await s.finish(id); assert.equal(b.run.processing.status, "complete"); const newId = b.run.processing.id;
  release.resolve(); await old.done; b = await s.store.bundle(id);
  assert.equal(b.run.processing.id, newId); assert.equal(b.run.processing.status, "complete"); assert.ok(b.passages.every(p => p.readingGate.status === "ready"));
});
