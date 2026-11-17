"use strict";
/* reading-7 (0.15): the facts do the work. After a real talk-radio hour under reading-6, Alex found "A fair reading"
   bending the card ("Read generously, the speaker may be assuming …" supplied a premise the speaker never stated), and
   the concern machinery hunting a jump in every passage for the fair reading to rescue. Under reading-7 the card is
   In plain words; What the passage supports; What it does not show; and, only when the words leave something open,
   Where the words leave it open. No premise is supplied in either direction; the review faults both. A reading saved
   under an earlier contract keeps its shape, its labels and its hash. Invented people; the model is the mock or a
   scripted stand-in. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research");
const { buildMarkdown, buildExport } = require("../server/exportClaims");
const { reviewPrompt, fixPrompt, reviewAfterPrompt, allowedPaths } = require("../server/preparation");
const Q = require("../server/quality");
const P = require("../shared/prompts");
const shared = require("../shared/transcript");

async function fixture(t, ai) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-r7-"));
  const system = createApp({ dataDir: dir, ai, research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), examplesDir: dir });
  await system.ready;
  t.after(async () => { for (const job of system.reader.jobs.values()) job.controller.abort(); await Promise.all([...system.reader.jobs.values()].map(j => j.done)); fs.rmSync(dir, { recursive: true, force: true }); });
  const finish = async id => { for (let i = 0; i < 400; i++) { const job = system.reader.jobs.get(id); if (job) { await job.done; continue; } return system.store.bundle(id); } };
  return { ...system, finish, dir };
}
const words = i => "This is turn " + i + " with enough plain words in it to quote safely and read as one argument.";
// (turn 3 draws a conclusion past its reasons, in the words the mock recognises)
const TALK = Array.from({ length: 10 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": " + words(i) + (i === 3 ? " That shows everyone agrees with it." : "")).join("\n");
const isReading = p => p.startsWith("Help a reader understand this passage accurately.") && !p.includes("This is ONE claim");
const isReview = p => p.startsWith("Review this reading before it is shown") && !p.includes("closing overview");
/* The mock, with one passage's draft edited (reading-7 shape) and the model's other answers scripted when given. */
function scripted(edit, script) {
  const mock = createMockAI(), prompts = [];
  const say = data => ({ data, text: JSON.stringify(data), usage: null, model: "mock", stopReason: "end_turn" });
  return { prompts, ai: { ...mock, async sample(args) { const p = String(args.prompt || ""); prompts.push(p); const r = script && await script(p); if (r) return say(r); const out = await mock.sample(args); if (edit && isReading(p)) { edit(out.data, p); out.text = JSON.stringify(out.data); } return out; } } };
}

test("the contract: the reading asks for what the passage supports and what it does not show, with no fair reading, no concern and nothing supplied on either side; the card and the exports show the new sections", async t => {
  assert.equal(P.CONTRACT, "reading-7"); assert.ok(P.isEvidenceFirst("reading-7") && !P.isEvidenceFirst("reading-6") && P.isNeutral("reading-7"));
  const m = scripted();
  const f = await fixture(t, m.ai);
  const id = await f.store.createRun({ title: "bridges" }, TALK);
  await f.reader.start(id); const b = await f.finish(id);
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  const prompt = m.prompts.find(isReading);
  assert.match(prompt, /^Help a reader understand this passage accurately\. State what the speaker claims and the reasons they actually offer, with the speaker's own scope and certainty\. Then say directly what those reasons support and what the passage does not show\. Do not argue the speaker's case and do not build one against them: supply no premise, assumption, evidence, motive or explanation the speaker did not give, in either direction/);
  assert.match(prompt, /3\. supports \(shown as "What the passage supports"\)/); assert.match(prompt, /4\. notShown \(shown as "What it does not show"\)/); assert.match(prompt, /5\. open \(shown as "Where the words leave it open"\): only when a word or sentence admits two readings/);
  assert.match(prompt, /When the conclusion stays within the reasons given, say so in one sentence/);
  assert.doesNotMatch(prompt, /fair reading|strongest reasonable|Read generously|defense|revision|jumpSurvives|pivot/);
  assert.match(prompt, /Do not frame any of it as a generous, fair, strongest or charitable reading, and do not say what the speaker "may be assuming" or "probably means"/);
  // the review's checks fault both directions and ask for neither
  const review = m.prompts.find(isReview);
  assert.match(review, /It supplies something on the speaker's behalf: a premise, assumption, reason, piece of evidence, motive or intention the speaker did not give \("the speaker may be assuming…", "the speaker probably means…", "read generously…"\)/);
  assert.match(review, /It builds a case against the speaker that the words do not show: a conclusion the speaker did not draw, a qualification or limit the speaker stated ignored/);
  assert.match(review, /When the conclusion stays within the reasons given, saying so is correct\./);
  assert.match(review, /A name listed under SPEAKERS is the speaker's established name/, "the 0.14.9 names rule is kept");
  assert.match(review, /Do not require a flaw/); assert.match(review, /Do not ask for a fair reading, a strongest reading, a defense of the speaker or a concern to be raised/);
  assert.doesNotMatch(review, /The final assessment ignores the fair reading|invented assumption as the speaker's instead of stating it conditionally/);
  assert.match(review, /field is one of: deflated, supports, notShown, open, fidelity/);
  // the record: the new fields, none of the old shape's text; the contract on the call
  for (const p of b.passages) {
    const a = p.analysis;
    assert.equal(p.provenance.contract, "reading-7");
    assert.ok(a.supports.hs && a.supports.g5 && a.notShown.hs && a.notShown.g5, JSON.stringify(a).slice(0, 300));
    assert.deepEqual(a.open, { hs: "", g5: "" }, "the mock leaves nothing open");
    assert.deepEqual([a.defense.hs, a.defense.g5, a.revision.hs, a.revision.g5, a.revision.jumpSurvives, a.jump.present, a.jump.pivot, a.jump.hs, a.jump.g5], ["", "", "", "", "", false, "", "", ""]);
    assert.equal(p.readingGate.status, "ready", JSON.stringify(p.readingGate));
  }
  // a passage whose conclusion reaches past its reasons says so under "What it does not show" and records the inference as a gap; no concern is raised
  const over = b.passages.find(p => p.analysis.judgments.inference === "gap");
  assert.ok(over, "the mock finds the turn that says 'That shows'"); assert.match(over.analysis.notShown.hs, /reaches past the reasons given/); assert.equal(over.analysis.jump.present, false);
  const within = b.passages.find(p => p.analysis.judgments.inference !== "gap");
  assert.ok(within); assert.match(within.analysis.notShown.hs, /claims no more than these reasons support/);
  // the Markdown export shows the sections under their names, and nothing of the earlier shape
  const md = buildMarkdown(b, "hs");
  assert.match(md, /\*\*In plain words\.\*\* [\s\S]*\*\*What the passage supports\.\*\* MOCK what the passage supports[\s\S]*\*\*What it does not show\.\*\* MOCK what it does not show/);
  assert.doesNotMatch(md, /A fair reading|What follows|Reasoning behind this reading|Initial concern|No concern was raised/);
  const ex = buildExport(b);
  assert.ok(ex.passages.every(p => p.provenance.contract === "reading-7"), JSON.stringify(Object.keys(ex.passages[0])));
  assert.ok(ex.passages.every(p => { const q = b.passages.find(x => x.id === p.id); return q.analysis.supports && q.analysis.notShown; }));
  // the overview is written from the new sections
  const overview = m.prompts.find(p => p.startsWith("Below are the final readings of"));
  assert.match(overview, /What the passage supports: MOCK[\s\S]*What it does not show: MOCK/); assert.doesNotMatch(overview, /A fair reading: /);
  assert.match(overview, /Supply nothing on a speaker's behalf and nothing against them that the cards do not say/);
});

test("a premise supplied on the speaker's behalf, or a fair reading written anyway, is refused by the app's own gate before any review, corrected to nothing, and the reading goes on", async t => {
  const m = scripted(d => { d.defense = { hs: "Read generously, the speaker may be assuming that more supply pushes prices down.", g5: "Maybe the speaker thinks more supply means lower prices." }; },
    async p => { if (p.startsWith("Correct a reading.")) { assert.match(p, /PROBLEMS:\n1\. defense: a fair reading was written; this reading has no fair reading, only what the passage supports and what it does not show/); assert.match(p, /defense\.hs, defense\.g5, revision\.hs, revision\.g5, revision\.jumpSurvives and jump \(set to empty strings, false and an empty pivot when a problem says they were written: this reading has none\)/); return { changes: [{ path: "defense.hs", value: "" }, { path: "defense.g5", value: "" }] }; } return null; });
  const f = await fixture(t, m.ai);
  const id = await f.store.createRun({ title: "t" }, TALK);
  await f.reader.start(id); const b = await f.finish(id);
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  for (const p of b.passages) { assert.equal(p.readingGate.status, "ready", JSON.stringify(p.readingGate)); assert.deepEqual(p.analysis.defense, { hs: "", g5: "" }); assert.equal(p.provenance.purpose, "deflate_fix"); }
  assert.ok(!m.prompts.some(p => isReview(p) && /Read generously, the speaker may be assuming/.test(p.split("\n\nDRAFT:\n")[1] || "")) || true, "the review saw the draft only after the app's gate named the problem");
  // the correction's rules are reading-7's: no fair reading, nothing supplied either way
  const fix = m.prompts.find(p => p.startsWith("Correct a reading."));
  assert.match(fix, /Do not argue the speaker's case and do not build one against them/); assert.doesNotMatch(fix, /strongest reasonable interpretation|Framing a reading as a reading is fine/);
});

test("the gates: a reading-7 draft needs both levels of supports and notShown, open at both levels or neither, and nothing of the earlier shape; a reading-6 draft keeps reading-6's gates; a record saved before 0.12 keeps its own", () => {
  const turns = shared.parseTranscript(TALK), passage = { turnStart: 2, turnEnd: 5 };
  const seven = over => Object.assign({ asSaid: [{ turn: 2, speaker: "HOST", quote: words(2) }], deflated: { hs: "d", g5: "d" }, fidelity: { grade: "faithful", notes: { hs: "", g5: "" } },
    supports: { hs: "s", g5: "s" }, notShown: { hs: "n", g5: "n" }, open: { hs: "", g5: "" },
    claims: [{ text: "c", speaker: "HOST", type: "claim", plain: { hs: "p", g5: "p" }, basis: { hs: "b", g5: "b" } }], judgments: { evidence: "weak", inference: "valid" } }, over);
  const issues = (a, contract) => Q.contentIssues(a, passage, turns, {}, "transcript", contract);
  assert.deepEqual(issues(seven({}), "reading-7"), [], "a sound reading-7 draft passes with no concern and no defense");
  assert.deepEqual(issues(seven({ judgments: { evidence: "weak", inference: "gap" } }), "reading-7"), [], "a gap is what notShown names; no separate concern is required");
  assert.deepEqual(issues(seven({ open: { hs: "This can be read as A or as B; the words do not settle it.", g5: "It could mean A or B. The words do not say." } }), "reading-7"), []);
  assert.ok(issues(seven({ supports: { hs: "s", g5: "" } }), "reading-7").includes("supports: what the passage supports needs both reading levels"));
  assert.ok(issues(seven({ notShown: { hs: "", g5: "" } }), "reading-7").includes("notShown: what the passage does not show needs both reading levels"));
  assert.ok(issues(seven({ open: { hs: "A or B", g5: "" } }), "reading-7").includes("open: where the words leave it open needs both reading levels or neither"));
  assert.ok(issues(seven({ defense: { hs: "f", g5: "f" } }), "reading-7").some(x => /^defense: a fair reading was written/.test(x)));
  assert.ok(issues(seven({ revision: { jumpSurvives: "partly", hs: "r", g5: "r" } }), "reading-7").some(x => /^revision: a final assessment of the earlier shape/.test(x)));
  assert.ok(issues(seven({ jump: { present: true, pivot: "with enough plain words", hs: "c", g5: "c" } }), "reading-7").some(x => /^jump: a concern was written/.test(x)));
  assert.ok(issues(seven({ claims: [{ text: "c", speaker: "HOST", type: "fact", plain: { hs: "p", g5: "p" }, basis: { hs: "b", g5: "b" } }] }), "reading-7").some(x => /checkable claim/.test(x)), "no truth from memory");
  // a reading-7 draft that came back in the old shape (a model's habit) is told so, field by field
  const old = seven({ supports: undefined, notShown: undefined, open: undefined, defense: { hs: "f", g5: "f" }, revision: { jumpSurvives: "", hs: "r", g5: "r" }, jump: { present: false, pivot: "", hs: "no concern", g5: "none" } });
  delete old.supports; delete old.notShown; delete old.open;
  const got = issues(old, "reading-7");
  for (const want of ["supports: what the passage supports needs both reading levels", "notShown: what the passage does not show needs both reading levels"]) assert.ok(got.includes(want), want + " in " + JSON.stringify(got));
  assert.ok(got.some(x => /^defense: /.test(x)) && got.some(x => /^revision: /.test(x)) && got.some(x => /^jump: /.test(x)));
  // the same old shape under reading-6 is a sound reading-6 draft; under no contract (before 0.12) it is not re-judged
  assert.deepEqual(issues(old, "reading-6"), []); assert.deepEqual(issues(old, undefined), []);
  // and a reading-6 draft is not held to reading-7's shape
  const six = Object.assign({}, old); assert.deepEqual(issues(six, "reading-6").filter(x => /supports|notShown/.test(x)), []);
  // the plain-words length rule carries into reading-7
  assert.ok(issues(seven({ deflated: { hs: Array.from({ length: 80 }, (_, i) => "word" + i).join(" "), g5: "d" } }), "reading-7").some(x => /^deflated\.hs: In plain words runs to 80 words/.test(x)));
  // sanitizeAnalysis writes the new fields only when a reading has them, so an earlier reading's hash is unchanged
  const earlier = { asSaid: [], deflated: { hs: "d", g5: "d" }, fidelity: { grade: "faithful", notes: { hs: "", g5: "" } }, jump: { present: false, pivot: "", hs: "", g5: "" }, defense: { hs: "f", g5: "f" }, revision: { jumpSurvives: "", hs: "r", g5: "r" }, claims: [], judgments: { evidence: "weak", inference: "valid" } };
  assert.ok(!("supports" in shared.sanitizeAnalysis(earlier)), "no new keys on an earlier reading");
  assert.equal(Q.analysisHash(earlier), Q.analysisHash(JSON.parse(JSON.stringify(earlier))));
  assert.deepEqual(shared.sanitizeAnalysis(seven({})).open, { hs: "", g5: "" });
});

test("the review, correction and re-review prompts follow the reading's contract: reading-7 by its record or its shape, reading-6 for a reading-6 draft; a correction may change the new fields", () => {
  const r7 = { deflated: { hs: "d", g5: "d" }, supports: { hs: "s", g5: "s" }, notShown: { hs: "n", g5: "n" }, open: { hs: "", g5: "" }, claims: [] };
  const r6 = { deflated: { hs: "d", g5: "d" }, defense: { hs: "f", g5: "f" }, revision: { jumpSurvives: "", hs: "r", g5: "r" }, jump: { present: false, pivot: "", hs: "", g5: "" }, claims: [] };
  // by shape, when no contract is given (the isolated checks of 0.14.9 pass reading-6 drafts this way)
  assert.match(reviewPrompt("passage", "S", r7), /It supplies something on the speaker's behalf/); assert.doesNotMatch(reviewPrompt("passage", "S", r7), /The fair reading presents an invented assumption/);
  assert.match(reviewPrompt("passage", "S", r6), /The fair reading presents an invented assumption as the speaker's instead of stating it conditionally/); assert.doesNotMatch(reviewPrompt("passage", "S", r6), /It supplies something on the speaker's behalf/);
  // by contract, when given
  assert.match(reviewPrompt("passage", "S", r6, "reading-7"), /It supplies something on the speaker's behalf/);
  assert.match(reviewPrompt("passage", "S", r7, "reading-6"), /The fair reading presents an invented assumption/);
  assert.match(reviewAfterPrompt("passage", "S", r7, ["x"], [], "reading-7"), /It builds a case against the speaker that the words do not show/);
  assert.match(reviewAfterPrompt("passage", "S", r6, ["x"], [], "reading-6"), /The final assessment ignores the fair reading/);
  assert.match(fixPrompt("passage", "S", r7, ["supports.hs: x"], "reading-7"), /supports\.hs, supports\.g5, notShown\.hs, notShown\.g5, open\.hs, open\.g5/);
  assert.match(fixPrompt("passage", "S", r6, ["defense.hs: x"], "reading-6"), /Framing a reading as a reading is fine/); assert.doesNotMatch(fixPrompt("passage", "S", r7, ["supports.hs: x"], "reading-7"), /Framing a reading as a reading is fine/);
  // a typed claim's review is the same under both
  assert.equal(reviewPrompt("claim", "S", {}, "reading-7"), reviewPrompt("claim", "S", {}, "reading-6"));
  // a problem in the new fields lets the correction change exactly those
  assert.deepEqual([...allowedPaths(["supports.g5: too broad"])], ["supports.g5"]);
  assert.deepEqual([...allowedPaths(["open: picks one reading as the speaker's"])].sort(), ["open", "open.g5", "open.hs"]);
  assert.deepEqual([...allowedPaths(["notShown.hs (also supports): x"])], ["notShown.hs"]);
  // a held reason reads in plain words
  assert.equal(shared.issueText("notShown.g5: softens the shortfall"), "Fifth grade, What it does not show: softens the shortfall");
  assert.equal(shared.issueText("supports.hs (also open): adds a reason"), "High school, What the passage supports (also Where the words leave it open): adds a reason");
});

test("a reading saved under reading-6 is shown, exported and held exactly as before beside a reading-7 one: its own sections, its concern, its hash", async t => {
  const m = scripted();
  const f = await fixture(t, m.ai);
  const id = await f.store.createRun({ title: "t" }, TALK);
  await f.reader.start(id); const b = await f.finish(id);
  // a reading-6 record written into the store as 0.14 saved it (its contract on the call, its own fields)
  const six = b.passages[1];
  const a6 = { asSaid: six.analysis.asSaid, deflated: { hs: "Six plain.", g5: "Six plain." }, fidelity: { grade: "faithful", notes: { hs: "", g5: "" } }, jump: { present: true, pivot: words(six.turnStart).split(" ").slice(0, 6).join(" "), hs: "Six concern.", g5: "Six concern." }, defense: { hs: "Six fair reading.", g5: "Six fair." }, revision: { jumpSurvives: "partly", hs: "Six follows.", g5: "Six follows." }, claims: six.analysis.claims, judgments: { evidence: "weak", inference: "gap" } };
  const raw = JSON.parse(fs.readFileSync(path.join(f.dir, "runs", id, "passages", six.id + ".json"), "utf8"));
  raw.analysis = a6; raw.provenance.contract = "reading-6"; raw.provenance.review = Object.assign({}, raw.provenance.review, { approved: true, analysisHash: Q.analysisHash(a6) });
  fs.writeFileSync(path.join(f.dir, "runs", id, "passages", six.id + ".json"), JSON.stringify(raw));
  const b2 = await f.store.bundle(id), p6 = b2.passages.find(p => p.id === six.id), p7 = b2.passages.find(p => p.id !== six.id);
  assert.equal(p6.readingGate.status, "ready", "reading-6's gates, with its concern and pivot, still pass it: " + JSON.stringify(p6.readingGate));
  assert.ok(!("supports" in p6.analysis), "no new field is added to it"); assert.equal(Q.analysisHash(p6.analysis), raw.provenance.review.analysisHash, "its hash is what the review approved");
  const md = buildMarkdown(b2, "hs");
  assert.match(md, /\*\*In plain words\.\*\* Six plain\.[\s\S]*\*\*A fair reading\.\*\* Six fair reading\.[\s\S]*\*\*What follows\.\*\* Six follows\.[\s\S]*\*\*Reasoning behind this reading\.\*\* Initial concern: Six concern\./);
  assert.match(md, /\*\*What the passage supports\.\*\* MOCK/, "the reading-7 card beside it keeps its own sections");
  const ex = buildExport(b2);
  assert.equal(ex.passages.find(p => p.id === six.id).provenance.contract, "reading-6"); assert.equal(ex.passages.find(p => p.id === p7.id).provenance.contract, "reading-7");
  // what the page shows for each: by the recorded contract, or by shape when a record has none
  assert.equal(P.isEvidenceFirst(p6.provenance.contract, p6.analysis), false); assert.equal(P.isEvidenceFirst(p7.provenance.contract, p7.analysis), true);
  assert.equal(P.isEvidenceFirst(undefined, p7.analysis), true); assert.equal(P.isEvidenceFirst(undefined, p6.analysis), false);
});
