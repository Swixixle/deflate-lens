"use strict";
/* 0.14.2 (reading-6): "In plain words" is the card's gist. In a real run it averaged 144 words at the high-school level
   (131–272, up to 13 sentences) and as much at the fifth grade, longer than the fair reading and the final assessment it
   introduces. Now the reading is asked for two or three short sentences (at most 60 words, 45 at the fifth grade), the
   main claim and its main reason, with the claims carrying the rest; the app checks the length and asks once for a
   shorter one, and length alone never holds a faithful reading. The model is scripted; no paid call. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research");
const P = require("../shared/prompts");
const Q = require("../server/quality");
const shared = require("../shared/transcript");

const words = i => "This is turn " + i + " with enough plain words in it to quote safely and read as one argument.";
const transcript = Array.from({ length: 18 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": " + words(i)).join("\n");
const say = data => ({ data, text: JSON.stringify(data), usage: null, model: "mock", stopReason: "end_turn" });
const count = s => shared.wordsOf(s || "").split(" ").filter(Boolean).length;
const LONG = "The host says " + Array.from({ length: 30 }, (_, i) => "point " + (i + 1) + " matters").join(", ") + ", and he gives reasons for each of them in turn.";
const SHORT = "The host says these points matter and gives a reason for each.";

async function fixture(t, script) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-card-"));
  const mock = createMockAI(), prompts = [];
  const ai = { ...mock, async sample(args) { const p = String(args.prompt || ""); prompts.push(p); const r = script && await script(p, args, mock); return r ? say(r) : mock.sample(args); } };
  const app = createApp({ dataDir: dir, examplesDir: dir, env: {}, envPath: path.join(dir, ".env"), ai, research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), run: async () => ({ code: 1, out: "" }) });
  await app.ready;
  t.after(async () => { for (const job of app.reader.jobs.values()) job.controller.abort(); await Promise.all([...app.reader.jobs.values()].map(j => j.done)); await fs.rm(dir, { recursive: true, force: true }); });
  const read = async () => { const id = await app.store.createRun({ title: "t" }, transcript); await app.reader.start(id); const job = app.reader.jobs.get(id); if (job) await job.done; return app.store.bundle(id); };
  return { app, prompts, read };
}
const first = p => p.includes("[0] HOST: " + words(0));
/* the mock's own draft for the first passage, with long plain words at the high-school level */
const longDraft = async (args, mock) => { const d = (await mock.sample(args)).data; d.deflated = { hs: LONG, g5: d.deflated.g5 }; return d; };

test("reading-6: the reading is asked for a short gist, and the review knows a gist leaves points to the claims", async t => {
  assert.equal(P.CONTRACT, "reading-6");
  const f = await fixture(t);
  await f.read();
  const draft = f.prompts.find(p => p.startsWith("Help a reader understand this passage"));
  assert.match(draft, /1\. deflated \(shown as "In plain words", the first thing a reader sees\): the gist in two or three short sentences: what the speaker mainly claims and the main reason they give, attributed to them, with their own certainty and scope\. At most 60 words at hs and 45 at g5\. The claims below carry the rest/);
  assert.match(draft, /A short field may leave a point out when the claims carry it; what it does say keeps its who, scope and certainty\./);
  const review = f.prompts.find(p => p.startsWith("Review this reading before it is shown") && !p.includes("closing overview"));
  assert.match(review, /"In plain words" \(deflated\) is the card's short gist: a point it leaves out that the claims carry is not a problem; a change to what it does say is\./);
});

test("plain words that run long are corrected once, by changing only that field; the card shows the short gist", async t => {
  const f = await fixture(t, async (p, args, mock) => {
    if (p.startsWith("Help a reader understand this passage") && first(p)) return longDraft(args, mock);
    if (p.startsWith("Correct a reading.") && first(p)) {
      assert.match(p, /PROBLEMS:\n1\. deflated\.hs: In plain words runs to \d+ words; the card asks for at most 60: two or three short sentences/);
      return { changes: [{ path: "deflated.hs", value: SHORT }, { path: "defense.hs", value: "an unrequested rewrite" }] };
    }
    if (p.startsWith("Review a corrected reading") && first(p)) return { resolved: [true], approved: true, issues: [] };
    return null;
  });
  const b = await f.read(), p = b.passages[0];
  assert.equal(p.readingGate.status, "ready", JSON.stringify(p.readingGate));
  assert.equal(p.analysis.deflated.hs, SHORT); assert.notEqual(p.analysis.defense.hs, "an unrequested rewrite", "only the named field may change");
  assert.deepEqual(p.provenance.review.changed, ["deflated.hs"]);
  assert.ok(count(LONG) > P.PLAIN_WORDS.hs.limit && count(p.analysis.deflated.hs) <= P.PLAIN_WORDS.hs.ask);
});

test("length alone never holds a reading: when the correction leaves it long, it is shown as it is, after one correction, and the record says why", async t => {
  const f = await fixture(t, async (p, args, mock) => {
    if (p.startsWith("Help a reader understand this passage") && first(p)) return longDraft(args, mock);
    if (p.startsWith("Correct a reading.") && first(p)) return { changes: [{ path: "deflated.hs", value: LONG + " It also says one more thing." }] };
    if (p.startsWith("Review a corrected reading") && first(p)) return { resolved: [false], approved: false, issues: [] };
    return null;
  });
  const b = await f.read(), p = b.passages[0];
  assert.equal(p.readingGate.status, "ready", JSON.stringify(p.readingGate));
  assert.equal(p.provenance.purpose, "deflate_decision"); assert.equal(p.provenance.review.lengthOnly, true); assert.equal(p.provenance.review.approved, true);
  assert.match(p.provenance.review.note, /length alone never holds a faithful reading/);
  assert.equal(f.prompts.filter(x => x.startsWith("Correct a reading.") && first(x)).length, 1, "one correction for length, no second round");
  const log = (await f.app.store.attemptsLog(b.run.id)).p001;
  assert.deepEqual(log[0].attempts.map(x => x.kind), ["draft", "correction", "decision"]); assert.equal(log[0].outcome, "shown");
});

test("the length rule is reading-6's: earlier readings keep their rules, a typed claim is not held to it, and the gate never holds a reading for it", () => {
  const turns = shared.parseTranscript("SPEAKER 1: The steel numbers are up eleven percent this year and the mills are hiring again.", { mode: "text" });
  const a = { asSaid: [{ turn: 0, speaker: "SPEAKER 1", quote: "The steel numbers are up eleven percent this year" }], deflated: { hs: LONG, g5: LONG }, fidelity: { grade: "faithful", notes: { hs: "", g5: "" } }, jump: { present: false, pivot: "", hs: "", g5: "" }, defense: { hs: "x", g5: "x" }, revision: { jumpSurvives: "", hs: "x", g5: "x" },
    claims: [{ text: "The steel numbers are up eleven percent", speaker: "SPEAKER 1", type: "claim", plain: { hs: "x", g5: "x" }, basis: { hs: "x", g5: "x" }, status: "unchecked" }], judgments: { evidence: "n/a", inference: "n/a" } };
  const now = Q.contentIssues(a, { turnStart: 0, turnEnd: 0 }, turns, {}, "transcript", "reading-6");
  assert.equal(now.length, 2); assert.ok(now.every(Q.isLengthIssue)); assert.match(now[1], /^deflated\.g5: In plain words runs to \d+ words; the card asks for at most 45/);
  assert.deepEqual(Q.contentIssues(a, { turnStart: 0, turnEnd: 0 }, turns, {}, "transcript", "reading-5"), []);
  assert.deepEqual(Q.contentIssues(a, { turnStart: 0, turnEnd: 0 }, turns, {}, "claim", "reading-6").filter(Q.isLengthIssue), []);
  // a reading shown although it ran long stays shown
  const b = { run: { kind: "transcript", parseMode: "text", provenance: { confirmedAt: "x" }, speakers: [] }, transcript: "SPEAKER 1: The steel numbers are up eleven percent this year and the mills are hiring again.", passages: [] };
  const p = { status: "done", analysis: a, turnStart: 0, turnEnd: 0, stale: [], provenance: { contract: "reading-6", review: { approved: true, analysisHash: Q.analysisHash(a) } } };
  const gate = Q.readingGate(b, p);
  assert.ok(!gate.reasons.some(Q.isLengthIssue), JSON.stringify(gate.reasons));
});
