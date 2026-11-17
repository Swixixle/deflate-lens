"use strict";
/* 0.14.9: the review and the corrections see the same list of speakers as the reading (context-3). The first live
   evaluation (8 October 2026) found every reading of an interview whose voices the app had named rejected by the
   review as "invented identity": the reading was told to call each speaker by the listed name, while the review's
   source held only the turn labels. Invented people. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research");
const { readingMaterial, materialAsRead } = require("../server/reading");
const shared = require("../shared/transcript");

async function fixture(t, ai) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-149-"));
  const system = createApp({ dataDir: dir, ai, research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), examplesDir: dir });
  await system.ready;
  t.after(async () => { for (const job of system.reader.jobs.values()) job.controller.abort(); await Promise.all([...system.reader.jobs.values()].map(j => j.done)); fs.rmSync(dir, { recursive: true, force: true }); });
  const finish = async id => { for (let i = 0; i < 400; i++) { const job = system.reader.jobs.get(id); if (job) { await job.done; continue; } return system.store.bundle(id); } };
  return { ...system, finish };
}
const TALK = Array.from({ length: 10 }, (_, i) => (i % 2 ? "SPEAKER 2" : "SPEAKER 1") + ": We are discussing the bridge count with enough quoted words to make a passage of it, part " + i + ".").join("\n");

test("the review, the correction and its check receive the speakers and their established names at the head of the source, with the rule that a listed name is not invented; the reading's material records the list and is rebuilt exactly after a rename", async t => {
  const mock = createMockAI(), prompts = [];
  const ai = { ...mock, async sample(a) { prompts.push(a.prompt); return mock.sample(a); } };
  const f = await fixture(t, ai);
  // voices the app named (as identification does), not names any turn says
  const id = await f.store.createRun({ title: "bridges", speakers: [{ key: "SPEAKER 1", name: "Ines Marlow", bio: "Identified: the host" }, { key: "SPEAKER 2", name: "Abe Quill", bio: "" }] }, TALK);
  await f.reader.start(id); const b = await f.finish(id);
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  const reviews = prompts.filter(p => p.startsWith("Review this reading before it is shown") && !p.includes("closing overview")), readings = prompts.filter(p => p.startsWith("Help a reader understand this passage"));
  assert.ok(reviews.length >= 1 && readings.length >= 1);
  for (const r of reviews) {
    const source = r.slice(r.indexOf("\nSOURCE:\n") + 9);
    assert.match(source, /^SPEAKERS \(each turn's label, and the name established for it; a listed name is not invented[^\n]*\):\n- SPEAKER 1 \(Ines Marlow\): Identified: the host\n- SPEAKER 2 \(Abe Quill\)\n\n(CONTEXT BEFORE|PASSAGE)/);
    assert.match(r, /A name listed under SPEAKERS is the speaker's established name: using it is not an invention/);
  }
  for (const r of readings) assert.match(r, /Speakers:\n- SPEAKER 1 \(Ines Marlow\): Identified: the host\n- SPEAKER 2 \(Abe Quill\)/);
  // the record: context-3, the list as it was, the hash over the whole material
  const p = b.passages[0];
  assert.equal(p.provenance.context.version, "context-3"); assert.equal(shared.CONTEXT_VERSION, "context-3");
  assert.match(p.provenance.context.speakersText, /SPEAKER 1 \(Ines Marlow\)/);
  assert.equal((await materialAsRead(f.store, b, p)).matches, true);
  assert.match((await materialAsRead(f.store, b, p)).source, /^SPEAKERS/);
  // a rename afterwards: the material is rebuilt with the list as it was when the reading was made
  await f.store.saveRun(id, { speakers: [{ key: "SPEAKER 1", name: "Ines Marlow-Baptiste", bio: "" }, { key: "SPEAKER 2", name: "Abe Quill", bio: "" }] });
  const after = await f.store.bundle(id), again = await materialAsRead(f.store, after, after.passages[0]);
  assert.equal(again.matches, true); assert.match(again.source, /Ines Marlow\): Identified: the host/); assert.doesNotMatch(again.source, /Marlow-Baptiste/);
  // a reading saved under context-2 is rebuilt without the list and still matches its own hash
  const old = readingMaterial(b, p, "context-2");
  assert.doesNotMatch(old.source, /^SPEAKERS/); assert.equal(old.context.version, "context-2"); assert.equal(old.context.speakersText, undefined);
  const asOld = Object.assign({}, p, { provenance: Object.assign({}, p.provenance, { context: old.context }) });
  const rebuilt = await materialAsRead(f.store, b, asOld);
  assert.equal(rebuilt.matches, true); assert.equal(rebuilt.contextVersion, "context-2");
  // a correction and its check see the same list
  const corrections = prompts.filter(p => p.startsWith("Correct a reading.") || p.startsWith("Review a corrected reading"));
  for (const c of corrections) assert.match(c, /SOURCE:\nSPEAKERS \(/);
});

test("a speaker nobody named is listed with its label written as a name (\"Speaker 1\"), as the reading is told to call it", async t => {
  const mock = createMockAI(), prompts = [];
  const f = await fixture(t, { ...mock, async sample(a) { prompts.push(a.prompt); return mock.sample(a); } });
  const id = await f.store.createRun({ title: "bridges" }, TALK);
  await f.reader.start(id); const b = await f.finish(id);
  assert.equal(b.run.processing.status, "complete");
  const r = prompts.find(p => p.startsWith("Review this reading before it is shown") && !p.includes("closing overview"));
  assert.match(r.slice(r.indexOf("\nSOURCE:\n") + 9), /^SPEAKERS \([^\n]*a speaker listed without a name is called by its label\):\n- SPEAKER 1 \(Speaker 1\)\n- SPEAKER 2 \(Speaker 2\)\n\n/);
});

/* The reviewer's narrow acceptance checks (handoff of 8 October): the same mapping through generation, first review,
   correction and recheck, with the correction path actually exercised; a rename marks the old reading stale through
   the existing gate; and the mapping excuses no wrong attribution. */
const TALK2 = ["SPEAKER 1: The county keeps four hundred and twelve bridges on its own list, which is the number I use.", "SPEAKER 2: The state counts three hundred, because anything under twenty feet is left off the state list.", "SPEAKER 1: So the number people quote is the state's number, not the county's.", "SPEAKER 2: Yes, and the gap is the short bridges, which carry most of the traffic in the valley.", "SPEAKER 1: That is the part nobody mentions when the budget comes up.", "SPEAKER 2: It is also the part that costs the least to fix, which is why I keep bringing it up."].join("\n");
const block = text => { const m = /SPEAKERS \([^\n]*\):\n((?:- [^\n]*\n?)+)/.exec(text) || /Speakers:\n((?:- [^\n]*\n?)+)/.exec(text); return m ? m[1].trim() : null; };

test("the correction path exercised: a first review that rejects, the correction and its check all carry the identical speaker mapping the generation had, and the established names appear in no turn", async t => {
  const mock = createMockAI(), prompts = []; let rejected = 0;
  const ai = { ...mock, async sample(a) {
    prompts.push(a.prompt);
    if (a.prompt.startsWith("Review this reading before it is shown") && !a.prompt.includes("closing overview") && rejected === 0) { rejected++; return { data: { approved: false, issues: [{ field: "deflated", level: "hs", problem: "The plain words drop the county's own list." }] }, text: "", usage: null, model: "stand-in", requestId: "x", stopReason: "end_turn" }; }
    return mock.sample(a);
  } };
  const f = await fixture(t, ai);
  const id = await f.store.createRun({ title: "bridges", speakers: [{ key: "SPEAKER 1", name: "Ines Marlow", bio: "" }, { key: "SPEAKER 2", name: "Abe Quill", bio: "" }] }, TALK2);
  await f.reader.start(id); const b = await f.finish(id);
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  assert.ok(!/Marlow|Quill/.test(b.transcript), "the names are nowhere in the turns");
  const by = prefix => prompts.filter(p => p.startsWith(prefix) && !p.includes("closing overview"));
  const gen = by("Help a reader understand this passage"), rev = by("Review this reading before it is shown"), fix = by("Correct a reading."), recheck = by("Review a corrected reading");
  assert.ok(gen.length >= 1 && rev.length >= 1 && fix.length >= 1 && recheck.length >= 1, "generation, review, correction and recheck all ran: " + [gen.length, rev.length, fix.length, recheck.length]);
  const mapping = block(gen[0]);
  assert.equal(mapping, "- SPEAKER 1 (Ines Marlow)\n- SPEAKER 2 (Abe Quill)");
  for (const p of rev.concat(fix, recheck)) assert.equal(block(p), mapping, "the same mapping in every step");
  const log = await f.store.attemptsLog(id), entries = Object.values(log)[0] || [];
  assert.ok(entries.length && (entries[entries.length - 1].attempts || []).some(x => x.kind === "correction"), "a correction is on the passage's record");
});

test("a rename after the reading marks it stale through the existing gate while its material still rebuilds as it was", async t => {
  const f = await fixture(t, createMockAI());
  const id = await f.store.createRun({ title: "bridges", speakers: [{ key: "SPEAKER 1", name: "Ines Marlow", bio: "" }, { key: "SPEAKER 2", name: "Abe Quill", bio: "" }] }, TALK2);
  await f.reader.start(id); let b = await f.finish(id);
  assert.deepEqual(b.passages.map(p => p.stale), b.passages.map(() => []));
  await f.store.saveRun(id, { speakers: [{ key: "SPEAKER 1", name: "Ines Marlow-Baptiste", bio: "" }, { key: "SPEAKER 2", name: "Abe Quill", bio: "" }] });
  b = await f.store.bundle(id);
  for (const p of b.passages) assert.ok(p.stale.includes("speaker names changed since this analysis"), JSON.stringify(p.stale));
  const m = await materialAsRead(f.store, b, b.passages[0]);
  assert.equal(m.matches, true); assert.match(m.source, /- SPEAKER 1 \(Ines Marlow\)\n/); assert.doesNotMatch(m.source, /Baptiste/);
});

test("the mapping excuses nothing: a quotation credited to the other voice is put back on the voice whose turn holds the words, on record as a correction; a claim credited to a speaker outside the passage is held, whatever the review says", async t => {
  const mock = createMockAI();
  const make = tamper => ({ ...mock, async sample(a) {
    const p = a.prompt;
    if (p.startsWith("Help a reader understand this passage accurately.")) { const out = await mock.sample(a); const d = JSON.parse(JSON.stringify(out.data)); tamper(d); return Object.assign({}, out, { data: d, text: JSON.stringify(d) }); }
    if (p.startsWith("Correct a reading.")) return { data: { changes: [] }, text: "{\"changes\":[]}", usage: null, model: "stand-in", requestId: "x", stopReason: "end_turn" };
    return mock.sample(a); // every review approves
  } });
  const doc = { title: "bridges", speakers: [{ key: "SPEAKER 1", name: "Ines Marlow", bio: "" }, { key: "SPEAKER 2", name: "Abe Quill", bio: "" }] };
  // the first turn's words, credited to the other voice
  let f = await fixture(t, make(d => { d.asSaid = [{ turn: 0, speaker: "SPEAKER 2", quote: d.asSaid[0].quote }]; }));
  let id = await f.store.createRun(doc, TALK2); await f.reader.start(id); let b = await f.finish(id);
  let p = b.passages[0];
  assert.equal(p.analysis.asSaid[0].speaker, "SPEAKER 1", "the words' own voice");
  assert.deepEqual(p.provenance.review.corrections, [{ kind: "quote_attribution", fromTurn: 0, toTurn: 0, fromSpeaker: "SPEAKER 2", toSpeaker: "SPEAKER 1" }]);
  // a claim credited to someone who is not in the passage at all
  f = await fixture(t, make(d => { d.claims[0].speaker = "SPEAKER 3"; }));
  id = await f.store.createRun(doc, TALK2); await f.reader.start(id); b = await f.finish(id);
  assert.notEqual(b.run.processing.status, "complete");
  for (p of b.passages) { assert.notEqual(p.readingGate.status, "ready"); assert.ok(p.held && p.held.issues.some(x => /names a speaker outside this passage/.test(x)), JSON.stringify(p.held)); }
});
