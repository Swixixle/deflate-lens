"use strict";
/* 0.13: automatic correction that converges. In the first live run (35 passages, reading-3) a correction rewrote the
   whole reading; each one fixed what was named and brought new drift into text that had already passed, and the next
   full review found it: 11 passages were held. Now the review lists its problems by field, the correction may change
   only those fields, and only the changed parts are checked again; a reading whose only remaining problems are in the
   fifth-grade wording is shown at the high-school level. The model is scripted; these tests prove what the app does
   with its answers. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research");
const { buildExport } = require("../server/exportClaims");
const shared = require("../shared/transcript");

const words = i => "This is turn " + i + " with enough plain words in it to quote safely and read as one argument.";
const transcript = Array.from({ length: 18 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": " + words(i)).join("\n");
const say = data => ({ data, text: JSON.stringify(data), usage: null, model: "mock", stopReason: "end_turn" });

async function fixture(t, script) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-fix-"));
  const mock = createMockAI(), prompts = [];
  const ai = { ...mock, async sample(args) { const p = String(args.prompt || ""); prompts.push(p); const r = script && await script(p, prompts); return r ? say(r) : mock.sample(args); } };
  const app = createApp({ dataDir: dir, examplesDir: dir, env: {}, envPath: path.join(dir, ".env"), ai, research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), run: async () => ({ code: 1, out: "" }) });
  await app.ready;
  t.after(async () => { for (const job of app.reader.jobs.values()) job.controller.abort(); await Promise.all([...app.reader.jobs.values()].map(j => j.done)); await fs.rm(dir, { recursive: true, force: true }); });
  const read = async text => { const id = await app.store.createRun({ title: "t" }, text || transcript); await app.reader.start(id); const job = app.reader.jobs.get(id); if (job) await job.done; return app.store.bundle(id); };
  return { app, prompts, read, dir };
}
const first = p => p.includes("PASSAGE (turns 0–7") || p.includes("[0] HOST: " + words(0));
const isReview = p => p.startsWith("Review this reading before it is shown") && !p.includes("closing overview");

test("a correction changes only the fields the review names; everything else stays exactly as drafted; only the change is checked again", async t => {
  let drafted = null;
  const f = await fixture(t, async (p) => {
    if (p.startsWith("Help a reader understand this passage") && first(p)) return null; // the mock's draft
    if (isReview(p) && first(p)) { drafted = JSON.parse(p.split("\n\nDRAFT:\n")[1]); return { approved: false, issues: [{ field: "deflated", level: "g5", problem: "“money markets” narrows “financial markets”." }, { field: "claims[1].plain", level: "g5", problem: "“punished” is not “prosecuted”." }] }; }
    if (p.startsWith("Correct a reading.")) return { changes: [{ path: "deflated.g5", value: "The speaker says the markets for money and stocks need rules." }, { path: "claims[1].plain.g5", value: "The speaker says some soldiers were taken to court." }, { path: "defense.hs", value: "an unrequested rewrite" }] };
    if (p.startsWith("Check a correction to a reading")) { assert.match(p, /CHANGES:\n- deflated\.g5: “[^”]*” → “The speaker says the markets for money and stocks need rules\.”/); assert.doesNotMatch(p, /defense\.hs/); return { resolved: [true, true], newIssues: [] }; }
    return null;
  });
  const b = await f.read();
  const p = b.passages[0];
  assert.equal(p.readingGate.status, "ready");
  assert.equal(p.analysis.deflated.g5, "The speaker says the markets for money and stocks need rules.");
  assert.equal(p.analysis.claims[1].plain.g5, "The speaker says some soldiers were taken to court.");
  // byte-identical elsewhere: the correction was not a rewrite
  const core = x => JSON.stringify([x.deflated, x.defense, x.revision, { present: x.jump.present, pivot: x.jump.pivot, hs: x.jump.hs, g5: x.jump.g5 }, x.claims.map(c => [c.text, c.speaker, c.type, c.plain, c.basis])]);
  const shown = JSON.parse(JSON.stringify(p.analysis)); shown.deflated.g5 = ""; shown.claims[1].plain.g5 = "";
  drafted.deflated.g5 = ""; drafted.claims[1].plain.g5 = "";
  assert.equal(core(shown), core(drafted));
  assert.notEqual(p.analysis.defense.hs, "an unrequested rewrite", "a change no problem names is not applied");
  const rv = p.provenance.review;
  assert.equal(p.provenance.purpose, "deflate_fix"); assert.deepEqual(rv.changed, ["deflated.g5", "claims[1].plain.g5"]); assert.deepEqual(rv.ignored, ["defense.hs"]);
  assert.equal(f.prompts.filter(x => x.startsWith("Help a reader understand this passage") && first(x)).length, 1, "one full draft");
  // every attempt is on record with its draft
  const log = (await f.app.store.attemptsLog(b.run.id)).p001;
  assert.equal(log.length, 1); assert.equal(log[0].outcome, "shown");
  assert.deepEqual(log[0].attempts.map(x => x.kind), ["draft", "correction"]);
  assert.notEqual(log[0].attempts[0].draft.deflated.g5, p.analysis.deflated.g5, "the first draft is kept as it was written");
  assert.equal(log[0].attempts[0].issues.length, 2);
});

test("a problem the correction brings is caught in the changed part and fixed in a second round; two rounds at most", async t => {
  let fixes = 0;
  const f = await fixture(t, async (p) => {
    if (isReview(p) && first(p)) return { approved: false, issues: [{ field: "deflated", level: "g5", problem: "the g5 version drops “several”." }] };
    if (p.startsWith("Correct a reading.")) { fixes++; return { changes: [{ path: "deflated.g5", value: fixes === 1 ? "The speaker says a few soldiers were punished." : "The speaker says several soldiers were taken to court." }] }; }
    if (p.startsWith("Check a correction to a reading")) return fixes === 1 ? { resolved: [true], newIssues: [{ field: "deflated", level: "g5", problem: "“punished” is not “prosecuted”; “a few” is not “several”." }] } : { resolved: [true], newIssues: [] };
    return null;
  });
  const b = await f.read();
  assert.equal(b.passages[0].readingGate.status, "ready"); assert.equal(fixes, 2);
  assert.equal(b.passages[0].analysis.deflated.g5, "The speaker says several soldiers were taken to court.");
  assert.equal(b.passages[0].provenance.review.round, 2);
});

test("when only the fifth-grade wording still fails, the reading is shown at the high-school level and says why; any other failure is held with every draft kept", async t => {
  let round = 0;
  const f = await fixture(t, async (p) => {
    if (isReview(p) && first(p)) return { approved: false, issues: [{ field: "deflated", level: "g5", problem: "“money markets” is narrower than “financial markets”." }] };
    if (isReview(p) && p.includes("PASSAGE (turns 8–15")) return { approved: false, issues: [{ field: "defense", level: "hs", problem: "adds a premise the speaker never gave." }] };
    if (p.startsWith("Correct a reading.")) return { changes: [{ path: p.split("\n\nPROBLEMS:\n")[1].includes("defense.hs") ? "defense.hs" : "deflated.g5", value: "still not right " + (++round) }] };
    if (p.startsWith("Check a correction to a reading")) return { resolved: [false], newIssues: [] };
    return null;
  });
  const b = await f.read();
  const g5 = b.passages[0], held = b.passages.find(x => x.turnStart === 8);
  assert.equal(g5.readingGate.status, "ready", JSON.stringify(g5.readingGate));
  assert.equal(g5.analysis.levels.g5, "withheld"); assert.match(g5.analysis.levels.reasons[0], /^deflated\.g5: “money markets”/);
  assert.equal(g5.provenance.purpose, "deflate_decision"); assert.equal(g5.provenance.review.g5Withheld, true);
  assert.equal(held.readingGate.status, "held"); assert.deepEqual(held.readingGate.reasons, ["defense.hs: adds a premise the speaker never gave."]);
  // the main status is a count; the reasons are on the passage
  assert.equal(b.run.processing.message, "2 readings ready. 1 couldn't be completed.");
  // the full record: every draft of the held reading, with its source
  const exp = buildExport(Object.assign({}, b, { attempts: await f.app.store.attemptsLog(b.run.id) }));
  assert.equal(exp.schema, "deflate-lens/claims@0.7");
  const h = exp.passagesHeld.find(x => x.id === held.id);
  assert.match(h.source, /^\[8\] HOST: This is turn 8/);
  assert.deepEqual(h.attempts[0].attempts.map(x => x.kind), ["draft", "correction", "correction"]);
  assert.ok(h.attempts[0].attempts.every(x => x.draft && x.draft.defense), "each draft is kept");
  assert.equal(exp.passages.find(x => x.id === g5.id).levels.g5, "withheld");
});

test("a held reading's reasons read in plain words, never as field names", () => {
  assert.equal(shared.issueText("deflated.g5: “money markets” is narrower."), "Fifth grade, In plain words: “money markets” is narrower.");
  assert.equal(shared.issueText("claims[2].plain.both: drops “many”."), "Claim 3, plain wording (both levels): drops “many”.");
  assert.equal(shared.issueText("defense.hs: adds a premise."), "High school, A fair reading: adds a premise.");
  assert.equal(shared.issueText("jump.hs and jump.g5 (also revision): the concern rests on context."), "The concern (also What follows): the concern rests on context.");
  assert.equal(shared.issueText("g5 deflated, g5 basis and g5 plain restatements: Selig is called the head."), "Fifth grade, In plain words and the claims: Selig is called the head.");
  assert.equal(shared.issueText("claims[0]: credited to SPEAKER 1, but these words are CLIP 1's (turn 4)"), "Claim 1: credited to SPEAKER 1, but these words are CLIP 1's (turn 4)");
  assert.equal(shared.issueText("a quotation does not match the passage"), "a quotation does not match the passage");
});

test("a claim from a played clip credited to the host is refused, corrected to the clip, and shown", async t => {
  const text = "HOST: Here is what the senator said on Sunday, and you should listen closely. Roll the clip.\nCLIP 1: We will never raise the gas tax, not this year and not next year, whatever happens.\nHOST: So that's the promise. Here is the bill he signed last month, with my own notes.\nGUEST: The bill raises the tax by four cents a gallon, starting in the spring.\nHOST: So he broke the promise he made on Sunday, and nobody asked him about it.\nGUEST: Nobody asked him about it on the record, as far as I know.";
  let corrected = false;
  const f = await fixture(t, async (p) => {
    if (p.startsWith("Help a reader understand this passage") && !p.includes("This is ONE claim")) {
      const body = p.split(/\nPASSAGE \(turns [^\n]*\n/)[1] || "";
      if (!body.includes("[1] CLIP 1:")) return null;
      return { asSaid: [{ turn: 1, speaker: "CLIP 1", quote: "We will never raise the gas tax" }], deflated: { hs: "The senator, in a clip the host plays, says the gas tax will not rise; the host says a bill raised it.", g5: "In a clip, the senator says the gas tax will not go up. The host says a law raised it." },
        fidelity: { grade: "faithful", notes: { hs: "", g5: "" } }, jump: { present: false, pivot: "", hs: "No concern.", g5: "No problem." }, defense: { hs: "The host reads the bill as breaking the promise.", g5: "The host thinks the promise was broken." },
        revision: { jumpSurvives: "", hs: "The clip and the bill, as described, conflict.", g5: "The promise and the law do not match." },
        claims: [{ text: "We will never raise the gas tax, not this year and not next year", speaker: "HOST", type: "claim", plain: { hs: "The host says the gas tax will never rise.", g5: "The host says the gas tax will not go up." }, basis: { hs: "Stated in the clip.", g5: "Said in the clip." }, status: "unchecked", wouldSettle: "", settle: { hs: "", g5: "" } }],
        judgments: { evidence: "weak", inference: "valid" } };
    }
    if (p.startsWith("Correct a reading.")) { corrected = true; assert.match(p, /claims\[0\]: credited to HOST, but these words are CLIP 1's \(turn 1\)/); const reading = JSON.parse(p.split("\n\nREADING:\n")[1].split("\n\nPROBLEMS:\n")[0]); const c = Object.assign({}, reading.claims[0], { speaker: "CLIP 1", plain: { hs: "The senator, in the clip, says the gas tax will never rise.", g5: "In the clip, the senator says the gas tax will not go up." } }); return { changes: [{ path: "claims[0]", value: c }] }; }
    return null;
  });
  const id = await f.app.store.createRun({ title: "clip" }, text);
  await f.app.store.replacePassages(id, [{ title: "The promise", turnStart: 0, turnEnd: 5, status: "pending", stake: "" }]);
  const b0 = await f.app.store.bundle(id); await f.app.store.saveProcessing(id, { segmentationHash: b0.run.input.sha256, segmentationAttr: b0.attrSig });
  await f.app.reader.start(id); const job = f.app.reader.jobs.get(id); if (job) await job.done;
  const b = await f.app.store.bundle(id);
  assert.equal(corrected, true, "the app's own check refused the host as the speaker of the clip's words");
  assert.equal(b.passages[0].readingGate.status, "ready", JSON.stringify(b.passages[0].readingGate));
  assert.equal(b.passages[0].analysis.claims[0].speaker, "CLIP 1");
});
