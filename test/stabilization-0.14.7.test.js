"use strict";
/* 0.14.7: the four findings of the independent review of 0.14.6, each reproduced on 0.14.6 (de58d54) and fixed here.
   (1) Short leading qualifications were deleted before the model read the text: "Children excluded." and "Adults only"
   before section headings were cut as page chrome by their shape (fewer than eight words), and a short line the
   transcript parser takes for a heading was left out of everything the model read. Now nothing before a text's first
   labelled line is deleted, and heading lines reach the model in source order, marked "(heading)", spoken by no one
   (context-2; readings made under context-1 are rebuilt as they were). (2) A prose line that is only a number vanished
   before generation: the prose parser kept the caption filters. New runs are read as "article", which drops no line;
   0.14.6's "prose" runs keep their parser, so their turns are never renumbered. (3) Speaker preparation absorbed a name
   changed meanwhile: it now rests on the names too, its commit refuses a change under the lock, and the job follows
   preparation's own committed snapshot, never a later read. (4) A closing overview replaced during the source searches
   was left held while the job said "Your reading is ready.": completion now counts the overview's current gate where
   the reading has one. All of these tests fail on unchanged 0.14.6. Invented people and studies. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research");
const { readingMaterial, materialAsRead } = require("../server/reading");
const shared = require("../shared/transcript");

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function fixture(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-147-"));
  const system = createApp(Object.assign({ dataDir: dir, ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), examplesDir: dir }, extra));
  await system.ready;
  const server = await new Promise(r => { const s = system.app.listen(0, "127.0.0.1", () => r(s)); });
  const url = "http://127.0.0.1:" + server.address().port;
  const api = async (method, endpoint, body) => { const res = await fetch(url + endpoint, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, data: res.headers.get("content-type").includes("json") ? await res.json() : await res.text() }; };
  t.after(async () => { for (const job of system.reader.jobs.values()) job.controller.abort(); await Promise.all([...system.reader.jobs.values()].map(j => j.done)); await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const finish = async id => { for (let i = 0; i < 400; i++) { const job = system.reader.jobs.get(id); if (job) { await job.done; continue; } return system.store.bundle(id); } };
  return { ...system, api, dir, finish };
}
const recording = () => { const mock = createMockAI(), prompts = []; return { prompts, ai: { ...mock, async sample(a) { prompts.push(a.prompt); return mock.sample(a); } } }; };
const generation = prompts => prompts.filter(p => p.startsWith("Help a reader understand this passage")).join("\n");
const H3 = ["Results: Average symptoms improved in this group.", "Methods: Each participant completed the same questionnaire at the start and end of the study.", "Results: Follow-up lasted four weeks, so long-term effects remain unknown."];
const H4 = ["Methods: Adults received the intervention for eight weeks.", "Results: The adults reported improved symptoms.", "Methods: Investigators reviewed the adults' records.", "Results: No serious adverse events were reported."];
const html = lines => "<html><head><title>Trial notes</title></head><body><article>" + lines.map(p => "<p>" + p + "</p>").join("") + "</article></body></html>";
async function intake(t, input, page) {
  const { ai, prompts } = recording();
  const f = await fixture(t, Object.assign({ ai }, page ? { fetch: async () => new Response(page, { status: 200, headers: { "content-type": "text/html" } }) } : {}));
  const r = await f.api("POST", "/api/intake", { input });
  assert.equal(r.status, 202, JSON.stringify(r.data));
  return { f, b: await f.finish(r.data.run.id), prompts, id: r.data.run.id };
}

/* ---------- 1. short qualifications survive, into the stored text and the prompt ---------- */
test("a short qualification before section headings — with or without a full stop, pasted or by link, three or four headings — reaches the stored text and the prompt sent to generation", async t => {
  for (const lead of ["Children excluded.", "Adults only"]) {
    // pasted, three headings: read as an article, nothing removed, the headings nobody's
    let r = await intake(t, [lead].concat(H3).join("\n"));
    assert.equal(r.b.run.parseMode, "article", lead); assert.equal(r.b.run.intake.removedBefore, 0);
    assert.ok(r.b.transcript.startsWith(lead)); assert.ok(generation(r.prompts).includes(lead), lead + ": prompt (pasted)");
    assert.ok(!r.b.run.speakers.some(s => /RESULTS|METHODS/.test(s.key)));
    assert.equal(r.b.run.processing.status, "complete");
    // by link, four alternating headings (the conversation shape: the headings may still read as voices, a disclosed
    // limit), the qualification kept and given to the model, as words of no one
    r = await intake(t, "https://example.org/trial", html([lead].concat(H4)));
    assert.equal(r.b.run.intake.removedBefore, 0);
    assert.ok(r.b.transcript.includes(lead), lead + ": stored (link)");
    const gen = generation(r.prompts);
    assert.ok(gen.includes(lead), lead + ": prompt (link)");
    assert.match(gen, new RegExp("\\[0\\] (?:\\(heading\\)|UNLABELED): " + lead.replace(".", "\\.")), "attributed to no one");
    assert.equal(r.b.run.processing.status, "complete", JSON.stringify(r.b.run.processing));
  }
});
test("a genuine labelled interview with a short line before it: kept as the text's own, attributed to no one, not audited by speaker preparation, and the reading completes", async t => {
  const interview = Array.from({ length: 18 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": We are discussing an argument with enough quoted words to test the reading " + i + ".").join("\n");
  for (const lead of ["Edited for length.", "Adults only"]) {
    const { b, prompts } = await intake(t, lead + "\n" + interview);
    assert.equal(b.run.parseMode, "transcript"); assert.ok(b.transcript.startsWith(lead));
    assert.deepEqual(b.run.speakers.map(s => s.key).filter(k => k !== "UNLABELED"), ["HOST", "GUEST"]);
    assert.ok(generation(prompts).includes(lead), "the first passage's context carries it");
    assert.equal(b.run.processing.status, "complete");
    const audited = prompts.filter(p => p.startsWith("Prepare transcript speaker labels.")).join("\n");
    assert.ok(!audited.includes(lead), "not a label to audit");
  }
});
test("a heading line anywhere in a labelled transcript now reaches the model (context-2); a reading made under context-1 is rebuilt exactly as it was", async t => {
  const lines = ["HOST: Welcome back. Today we look at a survey of riders with someone who ran it, and what it shows.", "GUEST: Thanks. We asked four hundred riders about the new routes, and most of them liked them.", "No control group", "HOST: So the routes are working for everyone?", "GUEST: For the riders we asked, yes. We cannot say more than that from one survey."];
  const { f, b, prompts, id } = await intake(t, lines.join("\n"));
  const turns = shared.parseTranscript(b.transcript, { mode: b.run.parseMode });
  assert.ok(turns.some(x => x.heading && x.text === "No control group"), "precondition: the parser takes it for a heading");
  assert.match(generation(prompts), /\[2\] \(heading\): No control group/);
  const p = b.passages[0];
  assert.equal(p.provenance.context.version, "context-2");
  assert.equal((await materialAsRead(f.store, b, p)).matches, true);
  // the same passage as a context-1 record: its material is rebuilt without the heading, and still matches its hash
  const old = readingMaterial(b, p, "context-1");
  assert.doesNotMatch(old.source, /No control group/);
  const asOld = Object.assign({}, p, { provenance: Object.assign({}, p.provenance, { context: old.context }) });
  const rebuilt = await materialAsRead(f.store, b, asOld);
  assert.equal(rebuilt.matches, true); assert.equal(rebuilt.contextVersion, "context-1");
  assert.ok(id);
});

/* ---------- 2. prose numbers reach the model ---------- */
test("a line that is only a number stays in an article: in the saved text, the parsed turns and the prompt; a run saved by 0.14.6 keeps its own parser", async t => {
  for (const n of ["983714265", "1987"]) {
    const lines = ["The trial included only adults who volunteered. Its findings do not establish effects in children.", n].concat(H3);
    const { b, prompts } = await intake(t, lines.join("\n\n"));
    assert.equal(b.run.parseMode, "article");
    assert.ok(b.transcript.includes(n));
    assert.ok(shared.parseTranscript(b.transcript, { mode: b.run.parseMode }).some(x => x.text === n), n + ": a turn of its own");
    assert.ok(generation(prompts).includes(n), n + ": in the prompt");
  }
  // 0.14.6's "prose" runs: their turns as they were (the caption-shaped line still dropped), so nothing is renumbered
  const text = "Opening paragraph of the article.\n42\nResults: improved.";
  assert.deepEqual(shared.parseTranscript(text, { mode: "prose" }).map(x => x.text), ["Opening paragraph of the article.", "Results: improved."]);
  assert.deepEqual(shared.parseTranscript(text, { mode: "article" }).map(x => x.text), ["Opening paragraph of the article.", "42", "Results: improved."]);
});

/* ---------- 3. preparation does not absorb a rename ---------- */
test("a name changed over HTTP while speaker preparation runs: the stale preparation cannot commit, the job stops once (input changed) with its calls on record, and Read this then completes under the new name", async t => {
  const entered = deferred(), release = deferred(), mock = createMockAI(); let first = true;
  const ai = { ...mock, async sample(a) { if (first && a.prompt.startsWith("Prepare transcript speaker labels.")) { first = false; entered.resolve(); await release.promise; } return mock.sample(a); } };
  const f = await fixture(t, { ai });
  const text = Array.from({ length: 6 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": We are discussing an argument with enough quoted words to test the reading " + i + ".").join("\n");
  const r = await f.api("POST", "/api/intake", { input: text }), id = r.data.run.id;
  await entered.promise;
  const cur = await f.store.bundle(id);
  const put = await f.api("PUT", "/api/runs/" + id, { run: { speakers: cur.run.speakers.map(s => s.key === "HOST" ? Object.assign({}, s, { name: "Ana Ferreira" }) : s) } });
  assert.equal(put.status, 200);
  release.resolve();
  const b = await f.finish(id);
  assert.equal(b.run.processing.status, "error"); assert.equal(b.run.processing.error.code, "input_changed");
  assert.equal(b.run.preparation, undefined, "the preparation made under the old names was not committed");
  assert.ok(b.passages.every(p => !p.analysis));
  assert.match(fs.readFileSync(path.join(f.dir, "runs", id, "calls.jsonl"), "utf8"), /"purpose":"prepare_speakers"/);
  await f.api("POST", "/api/runs/" + id + "/read", {});
  const done = await f.finish(id);
  assert.equal(done.run.processing.status, "complete");
  assert.equal(done.run.speakers.find(s => s.key === "HOST").name, "Ana Ferreira");
});
test("the lock itself: a preparation commit under names changed meanwhile is refused", async t => {
  const f = await fixture(t);
  const text = "HOST: Welcome back to the show tonight.\nGUEST: Thanks for having me on.\nHOST: Let us begin with the survey.";
  const id = await f.store.createRun({}, text);
  const b = await f.store.bundle(id);
  const sig = require("../server/store").namesSigFor(b.run, shared.parseTranscript(b.transcript, { mode: b.run.parseMode }));
  const basis = await f.store.captureCallBasis(id, { transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig, namesSig: sig }, "prepare_speakers");
  await f.store.saveRun(id, { speakers: b.run.speakers.map(s => s.key === "HOST" ? Object.assign({}, s, { name: "Ana Ferreira" }) : s) });
  await assert.rejects(f.store.commitPreparation(id, basis, { overrides: {}, corrections: [], unresolved: [], record: [], calls: [], status: "ready", at: "x", method: "m" }), e => e.code === "input_changed" && /names changed/.test(e.message));
});

/* ---------- 4. the overview's gate governs completion ---------- */
test("a closing overview replaced through the summary route during the source searches is held, and the job does not call the reading ready; a single-card reading with no overview still completes", async t => {
  const entered = deferred(), release = deferred(), base = createResearch({ DEFLATE_MOCK_RESEARCH: "1" }); let first = true;
  const research = Object.assign({}, base, { async searchClaim(a) { if (first) { first = false; entered.resolve(); await release.promise; } return base.searchClaim(a); } });
  const f = await fixture(t, { research });
  const text = Array.from({ length: 18 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": We are discussing an argument with enough quoted words to test the reading " + i + ".").join("\n");
  const r = await f.api("POST", "/api/intake", { input: text }), id = r.data.run.id;
  await entered.promise;
  assert.equal((await f.api("PUT", "/api/runs/" + id + "/summary", { patterns: [], survived: { hs: "", g5: "" } })).status, 200);
  release.resolve();
  const b = await f.finish(id);
  assert.ok(b.passages.length >= 2 && b.passages.every(p => p.readingGate.status === "ready"));
  assert.equal(b.summary.readingGate.status, "held");
  assert.equal(b.run.processing.status, "partial"); assert.equal(b.run.status, "analyzed");
  assert.equal(b.run.processing.message, b.passages.length + " readings ready. The closing overview couldn't be completed.");
  assert.ok(b.run.processing.issues.some(x => x.code === "overview_not_current"));
  // writing the overview again from Controls completes it
  await f.api("POST", "/api/runs/" + id + "/overview", {});
  const again = await f.finish(id);
  assert.equal(again.run.processing.status, "complete"); assert.equal(again.summary.readingGate.status, "ready");
  // one card, no overview: complete
  const one = await f.api("POST", "/api/intake", { input: "HOST: Welcome back. Today we look at the bus survey with someone who ran it, and the argument it carries.\nGUEST: Thanks. We asked four hundred riders about the new routes and most liked them, so the change is working." });
  const single = await f.finish(one.data.run.id);
  assert.equal(single.passages.length, 1); assert.equal(single.run.processing.status, "complete");
});
