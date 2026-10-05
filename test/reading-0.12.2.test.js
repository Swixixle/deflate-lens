"use strict";
/* 0.12.2: the corrections from the first live evaluation. The reading and review prompts (contract reading-3) spell
   out the distinctions a simpler word must keep, keep claims and reported findings attributed, and keep the process off
   the card; the consistency rules apply to reading-2 and reading-3 alike; a held reading keeps its reasons up to 2,000
   characters each (the call record keeps them in full); the
   evaluation's pointers catch the failures the live run showed. The prompts are checked for wording, never for what a
   model will do with them: that is what npm run eval is for. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research");
const P = require("../shared/prompts");
const Q = require("../server/quality");
const shared = require("../shared/transcript");
const { reviewPrompt } = require("../server/preparation");
const E = require("../scripts/eval-readings");
const cases = require("../eval/cases.json").cases;

const passagePrompt = () => P.deflate({ speakers: [] }, { title: "t", stake: "s", turnStart: 0, turnEnd: 0 }, "[0] A: words", {});
const claimPrompt = () => P.claim({}, "A typed claim.");

test("the prompt (reading-3, kept in reading-4 and reading-5) names each distinction a simpler word must keep, attribution, and no machinery on the card", () => {
  assert.ok(["reading-3", "reading-4", "reading-5"].includes(P.CONTRACT) && P.isNeutral("reading-3"));
  const p = passagePrompt();
  for (const part of ["- who:", "- where and when:", "- how many and how varied:", "A bigger group is not a more varied or more representative one", "- under what conditions:", "- how sure:", "A broader word widens the claim and a narrower one shrinks it", "keep the speaker's word and explain it"]) assert.ok(p.includes(part), part);
  assert.match(p, /Attribution: what the speaker claims stays the speaker's claim, in every field and at both levels, including each claim's plain restatement/);
  assert.match(p, /never restate it in your own voice as established/);
  assert.match(p, /The card: deflated, defense and revision are shown to a reader who never sees how the reading was made\. Do not describe the machinery in them/);
  assert.match(p, /Framing a reading as a reading is fine \("The strongest reading is that…", "Read generously, …"\)/, "reading-4: framing a reading is not machinery (the live run flagged it)");
  assert.match(p, /The outcome is recorded in jumpSurvives, not narrated in the text/);
  assert.doesNotMatch(p, /withdraw it and say so plainly/, "the old instruction that invited narration is gone");
  assert.match(p, /plain \(the claim restated at both levels, attributed to the speaker/);
  assert.match(p, /Check each g5 sentence against the speaker's words, not only against your hs sentence/);
  assert.match(claimPrompt(), /never as established/);
  assert.match(P.patterns({}, []), /without describing concerns being raised, kept or withdrawn/);
});

test("the prompts do not contain the evaluation's own wording, so the evaluation still measures something", () => {
  const templates = [passagePrompt(), claimPrompt(), P.patterns({}, []), reviewPrompt("passage", "SOURCE", {}), reviewPrompt("claim", "SOURCE", {})].join("\n").toLowerCase();
  for (const phrase of ["broader sample", "remote work", "working from home", "away from the office", "councillor", "cold shower", "four campuses", "intensive care", "letters from listeners", "evening visitors"]) assert.ok(!templates.includes(phrase), phrase);
  // and no run of eight words from any case text
  for (const c of cases.filter(x => x.text)) {
    const w = c.text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
    for (let i = 0; i + 8 <= w.length; i++) assert.ok(!templates.replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").includes(w.slice(i, i + 8).join(" ")), c.id + ": " + w.slice(i, i + 8).join(" "));
  }
});

test("the review checks each distinction against the source, attribution, and process narration, and still does not demand a flaw", () => {
  const r = reviewPrompt("passage", "SOURCE", {});
  assert.match(r, /Check each level against the source, not against the other level/);
  assert.match(r, /a word about how varied or representative a group is replaced by one about how large it is, or the reverse/);
  assert.match(r, /A simpler word that is broader or narrower than the speaker's word changes the meaning/);
  assert.match(r, /stated in the draft's own voice as established/);
  assert.match(r, /The card fields \(deflated, defense, revision\) describe the machinery of the reading/);
  assert.match(r, /Framing a reading as such \("The strongest reading is that…", "Read generously, …"\) is not machinery/);
  assert.match(r, /Do not require a flaw/);
  assert.match(r, /describing the machinery in the card fields, and an unattributed claim, are not matters of style/);
  assert.match(r, /List every problem now, each once, in the field where it occurs/, "0.13: the review lists everything at once, because only corrected parts are checked again");
  const c = reviewPrompt("claim", "SOURCE", {});
  assert.match(c, /states it in its own voice as established/); assert.match(c, /how varied or representative/);
});

test("the consistency rules apply to reading-2 and reading-3 records alike, and not to records from before 0.12", () => {
  const ts = shared.parseTranscript("A: one two three four five six seven\nB: eight nine ten");
  const a = { asSaid: [], deflated: { hs: "d", g5: "d" }, fidelity: { grade: "faithful", notes: { hs: "", g5: "" } }, jump: { present: false, pivot: "one two three", hs: "x", g5: "x" }, defense: { hs: "f", g5: "f" }, revision: { jumpSurvives: "", hs: "r", g5: "r" }, claims: [], judgments: { evidence: "weak", inference: "n/a" } };
  for (const contract of ["reading-2", "reading-3"]) assert.ok(Q.contentIssues(a, { turnStart: 0, turnEnd: 1 }, ts, {}, "transcript", contract).includes("no concern was raised, so there can be no pivot"), contract);
  assert.ok(!Q.contentIssues(a, { turnStart: 0, turnEnd: 1 }, ts, {}, "transcript", undefined).includes("no concern was raised, so there can be no pivot"));
  assert.equal(P.isNeutral("reading-1"), false);
});

test("a held reading keeps the review's reasons up to 2,000 characters on the passage, the card, the run record and the export; the call record keeps them in full", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-0122-")); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const LONG = "jump.hs and jump.g5 (also revision): the draft's concern does not match the speaker's claim. " + "The speaker said something broader than the draft reports, and the draft sets up a different premise. ".repeat(6) + "END-OF-REASON";
  const mock = createMockAI();
  const HUGE = "claims[0].plain.g5: " + "the simpler wording names a different group than the speaker did. ".repeat(40) + "TAIL";
  const ai = { ...mock, async sample(args) { const pr = String(args.prompt || "");
    if (pr.startsWith("Review a corrected reading")) { const data = { resolved: [false, false], approved: false, issues: [] }; return { data, text: JSON.stringify(data), usage: null, model: "mock", stopReason: "end_turn" }; }
    if (pr.startsWith("Review this reading before it is shown") && !pr.includes("closing overview")) { const data = { approved: false, issues: [LONG, HUGE] }; return { data, text: JSON.stringify(data), usage: null, model: "mock", stopReason: "end_turn" }; } return mock.sample(args); } };
  const app = createApp({ dataDir: dir, examplesDir: dir, env: {}, envPath: path.join(dir, ".env"), ai, research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), run: async () => ({ code: 1, out: "" }) });
  await app.ready;
  const id = await app.store.createRun({ kind: "claim", title: "c" }, "Most people in the town own a bicycle.");
  // a typed claim starts ready from the person; reading it with the model goes through the review
  await app.reader.start(id, { reread: "p001" }); const job = app.reader.jobs.get(id); if (job) await job.done;
  const b = await app.store.bundle(id), p = b.passages[0];
  const all = [].concat(p.held ? p.held.issues : [], p.readingGate.reasons || []);
  assert.ok(LONG.length > 600);
  assert.ok(all.includes(LONG), "a 700-character reason is kept whole, not cut at 300 characters: " + JSON.stringify(all).slice(0, 200));
  assert.ok(HUGE.length > 2000 && all.includes(HUGE.slice(0, 2000)) && !all.includes(HUGE), "the app keeps at most 2,000 characters of a reason");
  const calls = (await fs.readFile(path.join(dir, "runs", id, "calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.ok(calls.some(c => c.review && c.review.issues.includes(HUGE)), "the call record (which the evaluation reads) keeps the reason in full");
  const raw = JSON.parse(await fs.readFile(path.join(dir, "runs", id, "passages", "p001.json"), "utf8"));
  assert.ok(raw.held.issues.includes(LONG), "and so is the saved record");
  // the typed claim was ready from the person, so the failed reread keeps it and records the hold beside it
  assert.equal(raw.held.kept, true); assert.equal(p.readingGate.status, "ready");
  const exp = require("../server/exportClaims").buildExport(b);
  assert.ok(exp.passages[0].held.issues.includes(LONG), "the export carries the whole reason");
  // a passage that was not ready before is held with the same whole reason on the run's record
  const id2 = (await app.store.createRun({ title: "t" }, "A: The town needs a bigger bridge because traffic doubled.\nB: Doubled since when?")).toString();
  await app.reader.start(id2); const job2 = app.reader.jobs.get(id2); if (job2) await job2.done;
  const b2 = await app.store.bundle(id2);
  assert.ok(b2.passages.length && b2.passages.every(x => x.readingGate.status === "held" && x.readingGate.reasons.includes(LONG)), JSON.stringify(b2.passages.map(x => x.readingGate)).slice(0, 300));
  assert.ok(b2.run.processing.issues[0].reasons.includes(LONG), "and so does the run's record of what was held");
});

/* ---- the evaluation's pointers, run on the wording the live evaluation produced (4 October 2026) ---- */
const caseOf = id => cases.find(c => c.id === id);
function reading(over) {
  const a = { asSaid: [], deflated: { hs: "", g5: "" }, fidelity: { grade: "faithful", notes: { hs: "", g5: "" } }, jump: { present: false, pivot: "", hs: "", g5: "" }, defense: { hs: "", g5: "" }, revision: { jumpSurvives: "", hs: "", g5: "" }, claims: [], judgments: { evidence: "weak", inference: "valid" } };
  return Object.assign(a, over);
}
const failed = (c, a) => E.mechanical(caseOf(c), a).filter(x => !x[1]).map(x => x[0]);

test("eval pointers flag the live run's narrowings, unattributed claims and process narration, and pass a faithful version", () => {
  const live = reading({
    deflated: { hs: "The librarian reports that 12 of the 18 evening visitors they asked wanted later hours. They recommend asking a broader sample and comparing possible closing times.", g5: "The librarian says 12 of the 18 evening visitors they asked wanted later hours. They say the library should ask more people and compare different closing times before changing the hours." },
    defense: { hs: "The count is an early signal used to choose the next step.", g5: "This is a small first clue." },
    revision: { hs: "No concern was raised, so none survives. What follows is limited: some interest among the evening visitors asked.", g5: "There was no problem to begin with. We can say that 12 of the 18 evening visitors asked wanted later hours." },
    claims: [{ text: "This suggests interest among that group.", speaker: "LIBRARIAN", type: "interpretation", plain: { hs: "The result is read as a sign, not proof, of interest among the evening visitors asked.", g5: "The librarian reads the result as a hint." } }],
  });
  const f = failed("sound-library", live);
  assert.ok(f.includes("card text (hs) states the substance, not the process"));
  assert.ok(f.includes("card text (g5) states the substance, not the process"));
  assert.ok(f.some(x => x.startsWith("plain words (g5) keeps /broad")), "“ask more people” loses the breadth of “a broader sample”");
  assert.ok(f.some(x => x.startsWith("never says /\\b(ask|asking|survey|surveying|asks) more people")));
  assert.ok(f.includes("claim 1 plain (hs) says whose claim it is"));
  assert.ok(!f.includes("claim 1 plain (g5) says whose claim it is"), "“The librarian reads …” is attributed");
  const fixed = reading(Object.assign({}, live, {
    deflated: { hs: live.deflated.hs, g5: "The librarian says 12 of the 18 evening visitors they asked wanted later hours. They say the library should ask a wider mix of people and compare closing times before changing the hours." },
    revision: { hs: "The count supports some interest among the evening visitors asked; it does not show what other library users want.", g5: "We can say 12 of the 18 evening visitors wanted later hours. We cannot say the same about everyone." },
    claims: [{ text: live.claims[0].text, speaker: "LIBRARIAN", type: "interpretation", plain: { hs: "The librarian reads the result as a sign, not proof, of interest among the evening visitors asked.", g5: live.claims[0].plain.g5 } }],
  }));
  assert.deepEqual(failed("sound-library", fixed), []);

  const remote = reading({ deflated: { hs: "The guest states that remote work makes people more productive. The follow-up turn, used only for context, shows the guest bases this on a survey of software developers.", g5: "The guest says that working from home makes people get more done. The next turn, which we use only to understand it, shows the guest means their survey of software developers." },
    claims: [{ text: "Remote work makes people more productive.", speaker: "GUEST", type: "claim", plain: { hs: "Working remotely causes people to be more productive. The guest later limits it.", g5: "Working from home makes people get more done." } }] });
  const r = failed("qualification-after", remote);
  for (const want of ["card text (hs) states the substance, not the process", "card text (g5) states the substance, not the process", "claim 1 plain (hs) says whose claim it is", "claim 1 plain (g5) says whose claim it is"]) assert.ok(r.includes(want), want);
  assert.ok(r.some(x => x.startsWith("plain words (g5) keeps /remote")) && r.some(x => x.includes("(from|at) home")));

  const careless = reading({ deflated: { hs: "The councillor says 12 of 18 evening visitors wanted later hours and concludes that most city residents want the library open until midnight.", g5: "The councillor says this shows most people in the city want the library open until midnight; they asked 18 people." },
    revision: { hs: "The concern stands. The fair reading supports only a narrower claim.", g5: "The worry stays." }, jump: { present: true, pivot: "That shows", hs: "c", g5: "c" },
    claims: [{ text: "That shows most city residents want the library open until midnight.", speaker: "COUNCILLOR", type: "claim", plain: { hs: "The survey shows that most residents of the city want the library open until midnight.", g5: "The councillor says the survey shows that most people in the city want the library open until midnight." } }] });
  const c = failed("careless-library", careless);
  assert.ok(c.includes("claim 1 plain (hs) says whose claim it is") && !c.includes("claim 1 plain (g5) says whose claim it is"));
  assert.ok(c.includes("card text (hs) states the substance, not the process") && c.includes("card text (g5) states the substance, not the process"));
});

test("eval cases: the universal testimonial keeps 'everybody', and the new cases test what they say they test", () => {
  assert.ok(!caseOf("self-selected-letters"), "the case with the wrong expectation is replaced, not kept beside its repair");
  const u = caseOf("universal-testimonial");
  assert.match(u.text, /Everybody who tries it for a month writes to tell me/);
  const narrowed = reading({ deflated: { hs: "The guest says some people who chose to write report better focus.", g5: "He says some people wrote to him." }, jump: { present: true, pivot: "x", hs: "c", g5: "c" }, revision: { jumpSurvives: "yes", hs: "r", g5: "r" } });
  const f = failed("universal-testimonial", narrowed);
  assert.ok(f.some(x => x.startsWith("plain words (hs) keeps /everybody")) && f.some(x => x.startsWith("plain words (hs) never says /\\bsome (people")));
  const faithful = reading({ deflated: { hs: "The guest says everybody who tries cold showers for a month writes to tell him their focus improves enormously, and calls it the single best habit anyone can build.", g5: "He says everyone who tries it for a month writes to tell him they focus much better. He says it is the best habit anyone can have." },
    jump: { present: true, pivot: "It is the single best habit anyone can build.", hs: "Reports of better focus do not compare cold showers with other habits.", g5: "c" }, revision: { jumpSurvives: "yes", hs: "Messages about focus do not show it beats other habits, or how he could know that everyone who tried it wrote.", g5: "Letters do not show it is the best habit." } });
  assert.deepEqual(failed("universal-testimonial", faithful), []);
  const s = caseOf("self-selected-correspondence"); assert.equal(s.expect.concern, true); assert.match(s.text, /letters from listeners who finished it/);
  for (const id of ["breadth-not-number", "place-and-group"]) assert.match(caseOf(id).tests, /Held out from the prompt/);
  assert.equal(cases.length, 31, "28 reading cases and, from 0.13, three attribution cases read through intake");
  assert.deepEqual(cases.filter(c => c.intake).map(c => c.id), ["clip-and-return", "unlabeled-monologue", "interview-interruptions"]);
});
