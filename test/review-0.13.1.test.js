"use strict";
/* 0.13.1: the three defects GPT reproduced in 0.13.0, each shown to fail on 0.13.0 before the fix.
   1. A malformed review verdict became an approval: a rejection whose problem was written under another key was
      dropped and the card shown, and a correction's check with no list of new problems passed.
   2. Voice cleanup erased a genuine interruption: with every word aligned and every voice right, the second speaker's
      "no way" inside the first speaker's sentence was given to the first speaker.
   3. A name check accepted an invented surname: "My name is Dana" let "Dana Inventedsurname" be applied.
   The model and the recording are scripted: these tests prove what the app does with such answers. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research");
const shared = require("../shared/transcript");
const V = require("../server/voices");
const { verifyNames } = require("../server/structure");

const words = i => "This is turn " + i + " with enough plain words in it to quote safely and read as one argument.";
const transcript = Array.from({ length: 18 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": " + words(i)).join("\n");
const say = data => ({ data, text: JSON.stringify(data), usage: null, model: "mock", stopReason: "end_turn" });
async function fixture(t, script) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-0131-"));
  const mock = createMockAI(), prompts = [];
  const ai = { ...mock, async sample(args) { const p = String(args.prompt || ""); prompts.push(p); const r = script && await script(p, prompts); return r ? say(r) : mock.sample(args); } };
  const app = createApp({ dataDir: dir, examplesDir: dir, env: {}, envPath: path.join(dir, ".env"), ai, research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), run: async () => ({ code: 1, out: "" }) });
  await app.ready;
  t.after(async () => { for (const job of app.reader.jobs.values()) job.controller.abort(); await Promise.all([...app.reader.jobs.values()].map(j => j.done)); await fs.rm(dir, { recursive: true, force: true }); });
  const read = async text => { const id = await app.store.createRun({ title: "t" }, text || transcript); await app.reader.start(id); const job = app.reader.jobs.get(id); if (job) await job.done; return app.store.bundle(id); };
  return { app, prompts, read, dir };
}
const first = p => p.includes("PASSAGE (turns 0–7");
const isReview = p => p.startsWith("Review this reading before it is shown") && !p.includes("closing overview");
const isCheck = p => p.startsWith("Check a correction to a reading") || p.startsWith("Review a corrected reading");

/* ---- 1. a verdict is read strictly ---- */
test("a rejection whose problem is written under another key is still a rejection: the problem is corrected, never dropped", async t => {
  const f = await fixture(t, async p => {
    if (isReview(p) && first(p)) return { approved: false, issues: [{ field: "deflated", level: "g5", reason: "“money markets” narrows “financial markets”." }] };
    return null;
  });
  const b = await f.read();
  const p = b.passages[0];
  const fix = f.prompts.find(x => x.startsWith("Correct a reading.") && first(x));
  assert.ok(fix, "the rejection led to a correction instead of being shown as it was");
  assert.match(fix, /deflated\.g5: “money markets” narrows “financial markets”\./);
  assert.notEqual(p.provenance.purpose, "deflate", "the shown reading is not the rejected draft");
});

test("a verdict that cannot be read as one is never an approval: asked once more, then held with the reason", async t => {
  const malformed = [
    { approved: false, issues: [{ field: "deflated", level: "g5" }] },                       // a problem with no description
    { approved: true, issues: [{ field: "defense", level: "hs", problem: "adds a premise." }] }, // approves and lists a problem
    { issues: [] },                                                                           // no verdict at all
    { approved: false, issues: [] },                                                          // rejects and names nothing
    { approved: "yes", issues: [] },                                                          // not true or false
    { approved: true, issues: [], problems: ["the plain words drop “several”."] },            // approves, problems under another key
  ];
  for (const answer of malformed) {
    let asked = 0;
    const f = await fixture(t, async p => { if (isReview(p) && first(p)) { asked++; return answer; } return null; });
    const b = await f.read();
    const p = b.passages[0];
    assert.equal(p.readingGate.status, "held", JSON.stringify(answer) + " → " + JSON.stringify(p.readingGate));
    assert.equal(asked, 2, "asked once more, told what was wrong with its answer");
    assert.ok(p.readingGate.reasons.some(r => /review/i.test(r)), JSON.stringify(p.readingGate.reasons));
    assert.ok(b.passages.slice(1).every(x => x.readingGate.status === "ready"), "the other passages are read as usual");
  }
});

test("a correction's check that does not say what is still wrong is not a pass", async t => {
  const answers = [
    { resolved: [true] },                                                                                  // no verdict, no list of problems
    { resolved: [true], approved: true, issues: [], newIssues: [{ field: "defense", level: "hs", problem: "adds a premise." }] }, // 0.13.0's key, approving
    { resolved: [], approved: true, issues: [] },                                                          // nothing said about the named problem
  ];
  for (const answer of answers) {
    let checks = 0;
    const f = await fixture(t, async p => {
      if (isReview(p) && first(p)) return { approved: false, issues: [{ field: "deflated", level: "g5", problem: "“money markets” narrows “financial markets”." }] };
      if (p.startsWith("Correct a reading.") && first(p)) return { changes: [{ path: "deflated.g5", value: "The speaker says money and stock markets need rules." }] };
      if (isCheck(p) && first(p)) { checks++; return answer; }
      return null;
    });
    const b = await f.read();
    const g = b.passages[0].readingGate;
    assert.equal(g.status, "held", JSON.stringify(answer) + " → " + JSON.stringify(g));
    assert.ok(g.reasons.some(r => /review of the corrected reading could not be used/.test(r)), JSON.stringify(g.reasons));
    assert.equal(checks, 2, "asked once more, told what was wrong");
  }
});

/* ---- the whole corrected reading is reviewed again ---- */
test("after a correction the whole reading is reviewed again: a part that no longer agrees with the corrected one is caught and corrected", async t => {
  let fixes = 0; const reviewsAfter = [];
  const f = await fixture(t, async p => {
    if (isReview(p) && first(p)) return { approved: false, issues: [{ field: "deflated", level: "hs", problem: "drops “several”: the speaker says several soldiers were prosecuted." }] };
    if (p.startsWith("Correct a reading.") && first(p)) { fixes++; return { changes: fixes === 1 ? [{ path: "deflated.hs", value: "The speaker says several soldiers were prosecuted, not all of them." }] : [{ path: "revision.hs", value: "Several soldiers were prosecuted; the passage does not show that all were." }] }; }
    if (p.startsWith("Review a corrected reading") && first(p)) {
      reviewsAfter.push(p);
      return fixes === 1 ? { resolved: [true], approved: false, issues: [{ field: "revision", level: "hs", problem: "still says all soldiers were prosecuted, which no longer agrees with the corrected plain words or the source." }] } : { resolved: [true], approved: true, issues: [] };
    }
    return null;
  });
  const b = await f.read();
  const p = b.passages[0];
  assert.equal(p.readingGate.status, "ready", JSON.stringify(p.readingGate));
  assert.equal(fixes, 2); assert.equal(reviewsAfter.length, 2);
  assert.equal(p.analysis.revision.hs, "Several soldiers were prosecuted; the passage does not show that all were.");
  assert.equal(p.provenance.review.round, 2); assert.equal(p.provenance.review.wholeReading, true);
  const secondFix = f.prompts.filter(x => x.startsWith("Correct a reading.") && first(x))[1];
  assert.match(secondFix.split("\n\nPROBLEMS:\n")[1], /^1\. revision\.hs: still says all soldiers were prosecuted/);
});

test("the overview's review is read strictly too", async t => {
  let reviews = 0;
  const f = await fixture(t, async p => {
    if (p.startsWith("Review this reading before it is shown. This is the closing overview")) { reviews++; return { approved: true, issues: [{ problem: "cites one passage." }] }; }
    return null;
  });
  const b = await f.read();
  assert.ok(b.passages.every(x => x.readingGate.status === "ready"));
  assert.notEqual(b.summary && b.summary.readingGate && b.summary.readingGate.status, "ready", "a contradictory verdict did not pass the overview");
  assert.ok(!(b.run.processing.issues || []).some(x => (x.reasons || []).some(r => /\[object Object\]/.test(r))), "no reason is lost as [object Object]");
  // asked once more, told why; then held with the reason, without writing the overview again for a review's fault
  assert.equal(reviews, 2);
  const held = (b.run.processing.issues || []).find(x => x.code === "overview_held");
  assert.ok(held && held.reasons.some(r => /overview review's answer could not be used \(it approved and also listed problems\)/.test(r)), JSON.stringify(b.run.processing.issues));
});

/* ---- 2. voices: a supported interruption stays with the person who said it ---- */
function recordingOf(spoken) {
  const out = []; let t = 0;
  for (const [speaker, text] of spoken) for (const w of text.split(/\s+/).filter(x => shared.wordsOf(x))) { out.push({ word: shared.wordsOf(w), punctuated_word: w, speaker, start: t, end: t + 0.3 }); t += 0.35; }
  return { metadata: { request_id: "req-1" }, results: { channels: [{ alternatives: [{ words: out }] }] } };
}
test("a short interruption that the recording gives to another voice, every word aligned, is kept as that speaker's", () => {
  const spoken = [[0, "We put the plan to the council on Monday. I told them the budget would pass easily,"], [1, "no way,"], [0, "and it passed by a single vote on Thursday. That is the whole story."]];
  const text = "We put the plan to the council on Monday. I told them the budget would pass easily, no way, and it passed by a single vote on Thursday. That is the whole story.";
  const r = V.separate(text, recordingOf(spoken));
  assert.equal(r.ok, true); assert.equal(r.coverage, 1);
  assert.ok(r.text.split("\n").includes("SPEAKER 2: no way,"), r.text);
  assert.equal(shared.wordsOf(r.text.replace(/^(?:SPEAKER \d+|UNLABELED): /gm, "")), shared.wordsOf(text));
});

/* Deepgram's answer with explicit timing: [voice, words, pause before them in seconds]. */
function timed(parts) {
  const out = []; let t = 0;
  for (const [speaker, text, pause] of parts) { t += pause || 0; for (const w of text.split(/\s+/).filter(x => shared.wordsOf(x))) { out.push({ word: shared.wordsOf(w), punctuated_word: w, speaker, start: t, end: t + 0.3 }); t += 0.35; } }
  return { metadata: {}, results: { channels: [{ alternatives: [{ words: out }] }] } };
}
test("a voice is moved only where the recording itself shows it noticed the change late, never where it paused at its own change, and never around an interruption", () => {
  const text = "The council met on Monday and voted on the budget for the year. No way, the budget passed by one vote on Thursday after a long debate. It was close.";
  const S1 = "The council met on Monday and voted on the budget for the year.", S2a = "No way,", S2b = "the budget passed by one vote on Thursday after a long debate.", S3 = "It was close.";
  // B said "No way," at the start of A's sentence and the recording paused where A took over: kept as B
  const kept = V.separate(text, timed([[0, S1, 0], [1, S2a, 0.3], [0, S2b, 0.5], [0, S3, 0.3]]));
  assert.ok(kept.text.includes("SPEAKER 2: No way,\nSPEAKER 1: the budget passed"), kept.text);
  // the same words where the recording paused before the sentence and not inside it, and the next speaker goes on
  // past the sentence: the recording noticed the new voice two words late, so the change moves to the sentence boundary
  const late = V.separate(text, timed([[0, S1, 0], [0, S2a, 0.7], [1, S2b, 0.05], [1, S3, 0.3]]));
  assert.ok(late.text.includes("SPEAKER 1: The council met on Monday and voted on the budget for the year.\nSPEAKER 2: No way, the budget passed"), late.text);
  assert.deepEqual(late.edges, { moved: 1, kept: 0 }, "the record counts the change it moved");
  // the same voices and pauses, but A goes on after B's words: B's words are an interruption, so A's words before it
  // stay A's, whatever the pauses (0.13.1's first rule moved them; found by an adversarial stress run)
  const around = V.separate(text, timed([[0, S1, 0], [0, S2a, 0.7], [1, S2b, 0.05], [0, S3, 0.3]]));
  assert.ok(around.text.includes("for the year. No way,\nSPEAKER 2: the budget passed by one vote on Thursday after a long debate.\nSPEAKER 1: It was close."), around.text);
  assert.deepEqual(around.edges, { moved: 0, kept: 1 }, "and the one it left where the recording put it");
  // without times there is nothing to go on: the recording's voices stand
  const untimed = timed([[0, S1, 0], [0, S2a, 0.7], [1, S2b, 0.05], [1, S3, 0.3]]);
  for (const w of untimed.results.channels[0].alternatives[0].words) { w.start = 0; w.end = 0; }
  assert.ok(V.separate(text, untimed).text.includes("No way,\nSPEAKER 2: the budget passed"));
});

test("a short interruption at a sentence's edge keeps its words, and the interrupted speaker keeps theirs, even when the pauses would fit a late voice", () => {
  // A: "We put the plan to the council on Monday. Then they said," B (cutting in at once): "that will never pass in this
  // city." A: "It passed on Thursday by one vote." The recording paused before "Then" (A's own pause) and not before B.
  const text = "We put the plan to the council on Monday. Then they said, that will never pass in this city. It passed on Thursday by one vote.";
  const r = V.separate(text, timed([[0, "We put the plan to the council on Monday.", 0], [0, "Then they said,", 0.7], [1, "that will never pass in this city.", 0.02], [0, "It passed on Thursday by one vote.", 0.3]]));
  assert.ok(r.text.includes("SPEAKER 1: We put the plan to the council on Monday. Then they said,\nSPEAKER 2: that will never pass in this city.\nSPEAKER 1: It passed"), r.text);
  // and an interjection that ends a sentence, followed by the speaker going on: kept
  const t2 = "I told them the budget would pass easily, no way. It passed by a single vote on Thursday.";
  const r2 = V.separate(t2, timed([[0, "I told them the budget would pass easily,", 0], [1, "no way.", 0.02], [0, "It passed by a single vote on Thursday.", 0.6]]));
  assert.ok(r2.text.includes("SPEAKER 2: no way.\nSPEAKER 1: It passed"), r2.text);
});

/* ---- 3. names: only what the words give ---- */
test("a name is applied only as far as the quoted words give it; the rest waits for a person", () => {
  const turns = [{ key: "SPEAKER 1", text: "Welcome back to the show, everyone. Dana Reyes, thanks for coming on." }, { key: "SPEAKER 2", text: "Thanks. My name is Dana, and I run the survey lab at the university. I'm Dana Reyes, for the record." }, { key: "SPEAKER 1", text: "Will you say more?" }];
  const check = (name, kind, quote, key) => verifyNames([{ key: key || "SPEAKER 2", name, kind, quote }], turns, { title: "" }, true);
  let r = check("Dana Inventedsurname", "self_identification", "My name is Dana");
  assert.equal(r.applied.get("SPEAKER 2") && r.applied.get("SPEAKER 2").name, "Dana", "only the name the words give");
  assert.ok(r.suggestions.some(s => s.key === "SPEAKER 2" && s.name === "Dana Inventedsurname" && s.beyondTheWords), "the full proposal is offered for a person to confirm");
  // the whole name, when the words give it, in the words' order
  r = check("Reyes Dana", "self_identification", "I'm Dana Reyes"); assert.equal(r.applied.get("SPEAKER 2").name, "Dana Reyes", "written as the words say it"); assert.equal(r.suggestions.length, 0);
  r = check("Dana Reyes", "self_identification", "I'm Dana Reyes"); assert.equal(r.applied.get("SPEAKER 2").name, "Dana Reyes"); assert.equal(r.suggestions.length, 0);
  // a self-identification needs the words that introduce oneself right before the name
  r = check("Dana", "self_identification", "Dana, and I run the survey lab"); assert.equal(r.applied.size, 0); assert.equal(r.suggestions.length, 0);
  // an introduction by name just before the person speaks: only the words of the introduction
  r = check("Dana Reyes Smith", "introduced_by_name", "Dana Reyes, thanks for coming on"); assert.equal(r.applied.get("SPEAKER 2").name, "Dana Reyes");
  // being addressed by name is never applied, whatever the words; at most it is offered
  r = check("Will Smith", "addressed_by_name", "Will you say more?", "SPEAKER 2"); assert.equal(r.applied.size, 0);
});

test("a review's problem that happens to say \"cut off\" is corrected like any other; only the app's own unusable answers hold at once", async t => {
  const f = await fixture(t, async p => {
    if (isReview(p) && first(p)) return { approved: false, issues: [{ field: "deflated", level: "hs", problem: "the plain words cut off the speaker's qualification “for now”." }] };
    return null;
  });
  const b = await f.read();
  assert.ok(f.prompts.some(x => x.startsWith("Correct a reading.") && first(x)), "corrected, not held at once");
  assert.equal(b.passages[0].readingGate.status, "ready");
});
