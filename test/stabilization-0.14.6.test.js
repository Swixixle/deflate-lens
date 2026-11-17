"use strict";
/* 0.14.6: the three findings of the independent review of 0.14.5, each reproduced there and fixed here. (1) An article
   whose paragraphs sit under section headings ("Results:", "Methods:") was read as a dialogue of those headings: the
   opening qualification — the trial took only adults, so its findings say nothing about children — was cut as material
   before the dialogue, and Results and Methods became speakers. Now prose before the first labelled line keeps the
   whole text (only short lines that end no sentence are page chrome), and a text whose only dialogue evidence is such
   headings is read as prose: every word kept, headings part of the text, nobody a speaker (parseMode "prose", carried
   on the run so no later cleanup undoes it). (2) A speaker's name changed while a passage was being read left the job
   saying "Your reading is ready." over zero ready cards: the write basis never checked the names. Now the job and
   every write under the lock are bound to the names too; the job's own naming steps refresh that basis from what they
   committed, anything else stops the job once, resumable, and what is finished is decided from the cards' gates.
   (3) A second reading's "is" with its turn missing, null or garbage was read as turn 0 (Number(null) is 0). Now a
   turn reference is a whole number from 0, or a string of digits, and anything else names no turn, in the second
   reading and in the first answer's clues alike. All of these tests fail on unchanged 0.14.5. Invented people, shows
   and studies; no real transcript. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research");
const { cleanText } = require("../server/intake");
const I = require("../server/identify");
const shared = require("../shared/transcript");

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function fixture(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-146-"));
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

/* ---------- 1. articles and prose kept whole ---------- */
const STUDY = ["The trial included only adults who volunteered. Its findings do not establish effects in children.",
  "Results: Average symptoms improved in this group.",
  "Methods: Each participant completed the same questionnaire at the start and end of the study.",
  "Results: Follow-up lasted four weeks, so long-term effects remain unknown."];
const KEPT = ["only adults who volunteered", "do not establish effects in children", "Results: Average symptoms improved in this group.", "Methods:", "Follow-up lasted four weeks, so long-term effects remain unknown"];
async function articleRun(t, input, fetchHtml) {
  const { ai, prompts } = recording();
  const f = await fixture(t, Object.assign({ ai }, fetchHtml ? { fetch: async () => new Response(fetchHtml, { status: 200, headers: { "content-type": "text/html" } }) } : {}));
  const r = await f.api("POST", "/api/intake", { input });
  assert.equal(r.status, 202, JSON.stringify(r.data));
  const b = await f.finish(r.data.run.id);
  return { f, b, prompts, id: r.data.run.id };
}
function checkArticle(b, prompts, what) {
  assert.equal(b.run.parseMode, "article", what, "(0.14.7: \"article\"; 0.14.6 recorded \"prose\")");
  assert.equal(b.run.intake.removedBefore, 0); assert.equal(b.run.intake.prose, true);
  const gen = prompts.filter(p => p.startsWith("Help a reader understand this passage")).join("\n");
  for (const words of KEPT) {
    assert.ok(b.transcript.includes(words), what + ": the stored text keeps " + JSON.stringify(words));
    assert.ok(gen.includes(words), what + ": the prompt sent to generation has " + JSON.stringify(words));
  }
  assert.ok(!b.run.speakers.some(s => /^(RESULTS|METHODS|BACKGROUND|FINDINGS|LIMITATIONS)$/.test(s.key)), what + ": headings are not speakers: " + JSON.stringify(b.run.speakers.map(s => s.key)));
  assert.ok(b.run.provenance.notApplicable, "nothing to attribute");
  // prose is nobody's conversation: no speakers are worked out, separated or identified for it
  assert.ok(prompts.every(p => !p.startsWith("This transcript has no speaker labels.") && !p.startsWith("Who is each voice in this conversation?") && !p.startsWith("Check the names given to the voices.") && !p.startsWith("Prepare transcript speaker labels.")), what + ": no speaker pass ran");
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  assert.ok(b.passages.length && b.passages.every(p => p.readingGate.status === "ready"));
}

test("an article pasted as prose keeps its opening qualification and its headings, through intake, the stored text and the prompt sent to generation; the headings are not speakers", async t => {
  const { f, b, prompts, id } = await articleRun(t, STUDY.join("\n\n"));
  checkArticle(b, prompts, "pasted");
  const md = (await f.api("GET", "/api/runs/" + id + "/export.md?level=hs")).data;
  assert.ok(md.includes("only adults who volunteered") || b.transcript.includes("only adults who volunteered"));
  // reading again does not undo it: the saved text and mode survive the reader's own start-up cleanup
  await f.api("POST", "/api/runs/" + id + "/read", {});
  const again = await f.finish(id);
  assert.equal(again.transcript, b.transcript); assert.equal(again.run.parseMode, "article");
});

test("the same article through the link route (a page read as an article), and with headings used once each (Background, Findings, Limitations)", async t => {
  const html = "<html><head><title>Trial notes</title></head><body><article>" + STUDY.map(p => "<p>" + p + "</p>").join("") + "</article></body></html>";
  const one = await articleRun(t, "https://example.org/trial", html);
  checkArticle(one.b, one.prompts, "link");
  const once = [STUDY[0], "Background: The clinic asked for volunteers for six weeks.", "Findings: Average symptoms improved in this group.", "Limitations: Follow-up lasted four weeks, so long-term effects remain unknown."];
  const two = await articleRun(t, once.join("\n\n"));
  assert.equal(two.b.run.parseMode, "article");
  for (const words of ["do not establish effects in children", "Background:", "Findings:", "Limitations: Follow-up lasted four weeks"]) assert.ok(two.b.transcript.includes(words), words);
  assert.ok(!two.b.run.speakers.some(s => /BACKGROUND|FINDINGS|LIMITATIONS/.test(s.key)));
  assert.equal(two.b.run.processing.status, "complete");
});

const INTERVIEW = Array.from({ length: 18 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": We are discussing an argument with enough quoted words to test the reading " + i + ".").join("\n");
test("a genuine labelled interview still reads as one: lines before it and an opening prose paragraph are kept as part of the text, never deleted", async t => {
  // (0.14.7) short lines before the dialogue are kept too: their shape does not show they are disposable; only what
  // follows the explicit end marker is left out
  let { b } = await articleRun(t, "Listen LIVE\nPage controls\n" + INTERVIEW + "\nEnd of interview.\nNewsletter signup\n");
  assert.equal(b.run.parseMode, "transcript"); assert.equal(b.transcript, "Listen LIVE\nPage controls\n" + INTERVIEW);
  assert.equal(b.run.intake.removedBefore, 0); assert.deepEqual(b.run.speakers.map(s => s.key), ["HOST", "GUEST"]);
  assert.equal(b.run.processing.status, "complete");
  // a substantive opening sentence is the text's own prose: kept, with the conversation read as a conversation
  const intro = "In this episode the host and a county planner talk through the bridge budget for about an hour.";
  ({ b } = await articleRun(t, intro + "\n" + INTERVIEW));
  assert.equal(b.run.parseMode, "transcript");
  assert.ok(b.transcript.startsWith(intro), "the opening paragraph stays");
  assert.equal(b.run.intake.removedBefore, 0);
  assert.deepEqual(b.run.speakers.map(s => s.key).filter(k => k !== "UNLABELED").sort(), ["GUEST", "HOST"]);
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
});

test("cleanText alone: nothing before the first label is removed, and repeated colon headings alone are read as prose; captions and saved-run cleanup are unchanged", () => {
  const c1 = cleanText("Page title\n" + INTERVIEW);
  assert.equal(c1.record.removedBefore, 0); assert.equal(c1.record.prose, undefined); assert.equal(c1.text, "Page title\n" + INTERVIEW);
  const c2 = cleanText(STUDY.join("\n"));
  assert.equal(c2.record.prose, true); assert.equal(c2.record.removedBefore, 0); assert.equal(c2.text, STUDY.join("\n"));
  assert.match(c2.record.method, /Read as prose: every word is kept/);
  // the same stored text at a reading's start (captions and web separation off, the run's prose mode carried)
  const c3 = cleanText(c2.text, { captions: false, web: false, article: true });
  assert.equal(c3.text, c2.text);
  // an article page's title line does not turn its headings back into a dialogue at reader start
  const titled = "Trial notes\n" + STUDY.join("\n");
  assert.equal(cleanText(titled, { captions: false, web: false, article: true }).text, titled);
});

/* ---------- 2. names bound to the work; completion told from the cards ---------- */
const SHORT = ["HOST: Welcome back. Today we look at the bus survey with someone who ran it, and the argument it carries.",
  "GUEST: Thanks. We asked four hundred riders about the new routes and most liked them, so the change is working."].join("\n");
async function renameDuring(t, pauseStart, transcript) {
  const entered = deferred(), release = deferred(), mock = createMockAI(); let first = true;
  const ai = { ...mock, async sample(a) { if (first && a.prompt.startsWith(pauseStart)) { first = false; entered.resolve(); await release.promise; } return mock.sample(a); } };
  const f = await fixture(t, { ai });
  const r = await f.api("POST", "/api/intake", { input: transcript || SHORT });
  const id = r.data.run.id;
  await entered.promise;
  const cur = await f.store.bundle(id);
  const speakers = cur.run.speakers.map(s => s.key === "HOST" ? Object.assign({}, s, { name: "Ana Ferreira" }) : s);
  const put = await f.api("PUT", "/api/runs/" + id, { run: { speakers } });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  release.resolve();
  const b = await f.finish(id);
  return { f, id, b };
}
test("a speaker's name changed over HTTP while the only passage is being read: the old answer is not published, the job says the input changed (not “ready”), and Read this then succeeds under the new name", async t => {
  const { f, id, b } = await renameDuring(t, "Help a reader understand this passage");
  assert.equal(b.run.processing.status, "error", JSON.stringify(b.run.processing));
  assert.equal(b.run.processing.error.code, "input_changed");
  assert.match(b.run.processing.message, /input changed while it was being read/i);
  assert.notEqual(b.run.processing.message, "Your reading is ready.");
  assert.ok(b.passages.every(p => !p.analysis), "the stale answer was not promoted as a current reading");
  // the stale attempt stays inspectable: its model call is on the run's call record
  assert.match(fs.readFileSync(path.join(f.dir, "runs", id, "calls.jsonl"), "utf8"), /"purpose":"deflate"/);
  // resumable, once, on the current names; no automatic retry happened by itself
  const again = await f.api("POST", "/api/runs/" + id + "/read", {});
  assert.equal(again.status, 202);
  const done = await f.finish(id);
  assert.equal(done.run.processing.status, "complete");
  assert.equal(done.passages.filter(p => p.readingGate.status === "ready").length, done.passages.length);
  assert.ok(done.passages.length >= 1);
  assert.equal(done.run.speakers.find(s => s.key === "HOST").name, "Ana Ferreira", "the person's name was kept");
  const reading = done.run.processing;
  assert.equal(reading.message, "Your reading is ready.");
});
test("the same edit during the closing overview: the job does not claim success; reading again completes", async t => {
  const { f, id, b } = await renameDuring(t, "Below are the final readings of", INTERVIEW);
  assert.equal(b.run.processing.status, "error");
  assert.equal(b.run.processing.error.code, "input_changed");
  await f.api("POST", "/api/runs/" + id + "/read", {});
  const done = await f.finish(id);
  assert.equal(done.run.processing.status, "complete");
  assert.equal(done.summary && done.summary.readingGate.status, "ready");
});
test("the write lock itself refuses work prepared under other names (checkWriteBasis), so no path around the job can publish it", async t => {
  const f = await fixture(t);
  const r = await f.api("POST", "/api/intake", { input: SHORT });
  const id = r.data.run.id, b0 = await f.finish(id);
  assert.equal(b0.run.processing.status, "complete");
  const sig = (run, text) => require("../server/store").namesSigFor(run, shared.parseTranscript(text, { mode: run.parseMode }));
  const before = sig(b0.run, b0.transcript);
  await f.api("PUT", "/api/runs/" + id, { run: { speakers: b0.run.speakers.map(s => s.key === "HOST" ? Object.assign({}, s, { name: "Ana Ferreira" }) : s) } });
  const p = b0.passages[0];
  await assert.rejects(f.store.savePassage(id, p.id, Object.assign({}, p, { analyzedAt: "x" }), { expectedNamesSig: before }), e => e.code === "input_changed" && /speaker names changed/i.test(e.message));
  const after = await f.store.bundle(id);
  await f.store.savePassage(id, p.id, Object.assign({}, p), { expectedNamesSig: sig(after.run, after.transcript) });
});

/* ---------- 3. strict turn references ---------- */
const A4 = require("./fixtures/identify-scenarios-7").S.find(s => s.id === "A4");
const ANSWER = { voices: [{ label: "SPEAKER 1", name: "Dale Whitcomb", evidence: [{ kind: "hosts_show", turn: 0, quote: "Welcome to the Dale Whitcomb Show." }] }], unnamed: [{ label: "SPEAKER 2", why: "never named" }] };
async function identifyWith(firstEvidenceTurn, confirmEntry) {
  const answer = JSON.parse(JSON.stringify(ANSWER));
  if (firstEvidenceTurn !== "keep") { if (firstEvidenceTurn === undefined) delete answer.voices[0].evidence[0].turn; else answer.voices[0].evidence[0].turn = firstEvidenceTurn; }
  const run = { id: "r", kind: "transcript", parseMode: "text", input: { sha256: "h" }, speakers: [], provenance: {}, title: "", sourceLabel: "",
    import: { showInfo: { name: A4.L.show, author: A4.L.showAuthor, artist: "", persons: [] }, episodeInfo: { title: A4.L.episodeTitle, description: "", persons: [] } } };
  const ai = { kind: "anthropic", model: "s", mock: false, async sample({ prompt }) { const d = prompt.startsWith("Check the names") ? { voices: confirmEntry === undefined ? [] : [confirmEntry] } : answer; return { data: JSON.parse(JSON.stringify(d)), text: "", model: "s", requestId: "r", stopReason: "end_turn", usage: null }; } };
  const out = await I.identifySpeakers({ ai, store: { bundle: async () => ({ run, transcript: A4.lines.join("\n"), attrSig: "a" }), captureCallBasis: async () => ({}), recordCall: async () => {} }, id: "r" });
  return { name: (out.record.decisions.find(d => d.key === "SPEAKER 1") || {}).name || null, record: out.record, why: (out.record.unnamed.find(u => u.key === "SPEAKER 1") || {}).why || "" };
}
const isDale = turn => { const v = { label: "SPEAKER 1", verdict: "is", quote: "Welcome to the Dale Whitcomb Show.", why: "opens it" }; if (turn !== undefined) v.turn = turn; return v; };

test("a second reading's “is” binds to a turn that was really given: missing, null, true, “abc”, an empty or fractional or negative value and a turn that does not exist all keep the number, with the reason; 0 and “0” still work", async () => {
  for (const [turn, why] of [[undefined, "no turn number given"], [null, "no turn number given"], ["", "no turn number given"], [true, "true is not a turn number"], ["abc", "“abc” is not a turn number"], [0.5, "0.5 is not a turn number"], [-1, "-1 is not a turn number"], [999, "no such turn"]]) {
    const r = await identifyWith("keep", isDale(turn));
    assert.equal(r.name, null, JSON.stringify(turn));
    assert.equal(r.why, "A second reading says this voice is Dale Whitcomb, but the words it quoted are not where it says (" + (turn === 999 ? "turn 999, " : "") + "“Welcome to the Dale Whitcomb Show.”: " + why + "). A name is given only where a second reading of the conversation confirms it, so this voice keeps its number.");
    const a = r.record.confirmation.answers.find(x => x.key === "SPEAKER 1");
    assert.equal(a.wordsReal, false); assert.equal(a.kept, false); assert.ok(a.turn === null || a.turn === 999, JSON.stringify(a.turn));
  }
  for (const turn of [0, "0"]) {
    const r = await identifyWith("keep", isDale(turn));
    assert.equal(r.name, "Dale Whitcomb", JSON.stringify(turn));
    assert.deepEqual(r.record.decisions.find(d => d.key === "SPEAKER 1").confirmed, { turn: 0, quote: "Welcome to the Dale Whitcomb Show." }, "confirmed.turn is the explicit turn, never null");
  }
});
test("the first answer's clues under the same rule: a clue whose turn is missing or garbage holds nothing up, the record says why, and the voice keeps its number", async () => {
  for (const turn of [undefined, null, "abc"]) {
    const r = await identifyWith(turn, isDale(0));
    assert.equal(r.name, null, JSON.stringify(turn));
    const e = r.record.evidence.find(x => x.key === "SPEAKER 1" && x.source === "model" && x.kind === "hosts_show");
    assert.ok(e && !e.ok, JSON.stringify(e));
    assert.match(e.why, /is not a turn number|no turn number given/);
    assert.match(r.why, /^Asked twice, the model gave no usable decision for this voice/);
  }
  const ok = await identifyWith("0", isDale(0));
  assert.equal(ok.name, "Dale Whitcomb", "a turn written as digits still works");
});
test("a saved confirmation whose turn is null (the coercion this fixes) is identified again once; a real or mock confirmation is not", () => {
  const run = id => ({ kind: "transcript", parseMode: "text", input: { sha256: "h1" }, speakers: [{ key: "SPEAKER 1", name: "Ana Ferreira" }, { key: "SPEAKER 2", name: "Speaker 2" }], provenance: { overrides: {}, identification: id } });
  const b = r => ({ run: r, transcript: "SPEAKER 1: Hello there, friends.\nSPEAKER 2: Hello to you.", attrSig: "a1" });
  const base = c => ({ inputHash: "h1", attrSig: "a1", version: I.IDENTIFY_VERSION, decisions: [{ key: "SPEAKER 1", name: "Ana Ferreira", kinds: ["self_identification"], confirmed: c }], unnamed: [{ key: "SPEAKER 2", why: "x" }], evidence: [{ key: "SPEAKER 1", source: "app+model", kind: "self_identification", ok: true }] });
  assert.equal(I.needsIdentification(b(run(base({ turn: null, quote: "Hello there, friends." })))), true);
  assert.equal(I.needsIdentification(b(run(base({ turn: 0, quote: "Hello there, friends." })))), false);
  assert.equal(I.needsIdentification(b(run(base({ mock: true })))), false);
});

test("shared.refNumber is the one rule: digits from 0 name a turn; nothing else is coerced into one", () => {
  assert.deepEqual(shared.refNumber(0), { n: 0, why: "" });
  assert.deepEqual(shared.refNumber("12"), { n: 12, why: "" });
  for (const v of [undefined, null, "", true, false, "abc", " 3", 0.5, -1, NaN, Infinity, [1], {}]) {
    const r = shared.refNumber(v);
    assert.ok(Number.isNaN(r.n) && r.why, JSON.stringify(v) + " → " + JSON.stringify(r));
  }
});
