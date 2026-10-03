"use strict";
/* Spoken numbers in the quote check. A transcript made from audio writes "fifteen percent" where a card writes "15%";
   the strict check says "not found", which under the preparation gate holds the whole card. The fold is tried only
   when the strict check fails, applied to both sides the same way, bounded to the listed forms, and reported as
   "matched, numbers written differently", never as plain "matched". */
const test = require("node:test");
const assert = require("node:assert/strict");
const shared = require("../shared/transcript");
const { contentIssues, repairQuotes } = require("../server/quality");

test("spoken numbers fold to digits, and only the listed forms", () => {
  const f = s => shared.spokenNumbers(shared.wordsOf(s));
  const cases = [["fifteen percent", "15%"], ["fifteen per cent", "15%"], ["nineteen ninety-eight", "1998"], ["twenty twenty", "2020"], ["twenty fifteen", "2015"],
    ["one point five", "1.5"], ["two point seven five", "2.75"], ["five hundred dollars", "$500"], ["1,000", "1000"], ["1,000,000", "1000000"], ["two thousand and five", "2005"],
    ["a hundred and twenty three", "123"], ["three million", "3000000"], ["twenty five thousand", "25000"], ["nineteen hundred", "1900"], ["twelve hundred", "1200"],
    ["one two three", "1 2 3"], ["seven eleven", "7 11"], ["twenty one five", "21 5"], ["ten percent of people", "10% of people"],
    // not folded: these stay words on both sides, so they never match a digit form
    ["half a million", "half 1000000"], ["a couple of dozen", "a couple of dozen"], ["the first one", "the first 1"], ["two thirds", "2 thirds"]];
  for (const [a, b] of cases) assert.equal(f(a), b, a);
});

test("matchQuote: strict first, then the fold, with the fold named; meaning-changing differences still fail", () => {
  assert.deepEqual(shared.matchQuote("it rose 15% in 1998", "it rose 15% in 1998"), { tolerated: [] });
  assert.deepEqual(shared.matchQuote("it rose 15% in 1998", "it rose fifteen percent in nineteen ninety eight"), { tolerated: ["numbers written differently"] });
  assert.deepEqual(shared.matchQuote("it rose fifteen percent", "it rose 15 percent"), { tolerated: ["numbers written differently"] });
  assert.deepEqual(shared.matchQuote("costs $500 a month", "costs five hundred dollars a month"), { tolerated: ["numbers written differently"] });
  assert.equal(shared.matchQuote("it rose 15% in 1998", "it rose fifteen percent in nineteen ninety nine"), null);
  assert.equal(shared.matchQuote("1.5%", "1-5%"), null, "a range is not a decimal");
  assert.equal(shared.matchQuote("-5 degrees", "5 degrees"), null, "a sign is kept");
  assert.equal(shared.matchQuote("500,000", "half a million"), null, "half is not folded");
  assert.equal(shared.matchQuote("15%", "15"), null, "percent is kept");
  assert.equal(shared.verifyQuote("15%", "fifteen percent"), false, "the strict check is unchanged");
});

test("verifyPassage reports a folded match separately and the preparation gate accepts it", () => {
  const T = "HOST: How much did it rise?\nGUEST: It rose fifteen percent in nineteen ninety eight, which is one point five times the earlier figure.\nHOST: And the cost?\nGUEST: About five hundred dollars a month.";
  const turns = shared.parseTranscript(T, { mode: "transcript" });
  const a = shared.sanitizeAnalysis({ deflated: { hs: "x", g5: "y" }, fidelity: { grade: "faithful", notes: { hs: "", g5: "" } }, jump: { present: true, hs: "j", g5: "j", pivot: "1.5 times the earlier figure" },
    defense: { hs: "d", g5: "d" }, revision: { hs: "r", g5: "r", jumpSurvives: "partly" }, judgments: { evidence: "weak", inference: "gap" },
    asSaid: [{ turn: 1, speaker: "GUEST", quote: "It rose 15% in 1998" }, { turn: 3, speaker: "GUEST", quote: "About $500 a month." }, { turn: 1, speaker: "GUEST", quote: "which is 1.5 times" }],
    claims: [{ speaker: "GUEST", text: "It rose 15% in 1998", type: "empirical", plain: { hs: "p", g5: "p" }, basis: { hs: "b", g5: "b" } }] });
  const p = { turnStart: 0, turnEnd: 3, analysis: a };
  const s = shared.verifyPassage(turns, {}, p);
  assert.equal(s.quotes, 3); assert.equal(s.matched, 3); assert.equal(s.tolerated, 3); assert.equal(s.pivotOk, true);
  assert.deepEqual(a.asSaid.map(q => q.tolerated), [["numbers written differently"], ["numbers written differently"], ["numbers written differently"]]);
  assert.deepEqual(a.jump.pivotTolerated, ["numbers written differently"]);
  assert.deepEqual(contentIssues(a, p, turns, {}, "transcript"), [], "a card whose only difference is how numbers are written is not held");
  // the same card against a transcript where the number differs in meaning is held
  const turns2 = shared.parseTranscript(T.replace("fifteen percent", "fifty percent"), { mode: "transcript" });
  assert.ok(contentIssues(a, p, turns2, {}, "transcript").includes("a quotation does not match the passage"));
  // repairQuotes locates the turn through the fold too
  const a2 = shared.sanitizeAnalysis({ asSaid: [{ turn: 0, speaker: "HOST", quote: "About $500 a month." }], claims: [{ text: "c", type: "claim" }] });
  const corr = repairQuotes(a2, p, turns, {});
  assert.equal(a2.asSaid[0].turn, 3); assert.equal(a2.asSaid[0].speaker, "GUEST"); assert.equal(corr.length, 1);
});
