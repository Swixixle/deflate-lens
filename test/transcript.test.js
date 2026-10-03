"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const SH = require("../shared/transcript");

test("parses SPEAKER: lines into turns with stable numbering", () => {
  const t = SH.parseTranscript("JOE ROGAN: Hello there.\nJORDAN PETERSON: Hi Joe.\nMore of the same turn.\n\nJOE ROGAN: Ok.");
  assert.equal(t.length, 3);
  assert.deepEqual(t.map(x => x.label), ["JOE ROGAN", "JORDAN PETERSON", "JOE ROGAN"]);
  assert.equal(t[1].text, "Hi Joe. More of the same turn.");
  assert.deepEqual(t.map(x => x.i), [0, 1, 2]);
});

test("section headings become § turns and the text after a heading continues the last speaker", () => {
  const t = SH.parseTranscript("JOE ROGAN: One.\n\nA Section Heading\n\nThis continues Joe.\nJORDAN PETERSON: Two.");
  assert.equal(t[1].heading, true);
  assert.equal(t[1].text, "A Section Heading");
  assert.equal(t[2].label, "JOE ROGAN");
  assert.equal(t[2].cont, true);
  assert.equal(t[2].text, "This continues Joe.");
});

test("a label used once on a short unpunctuated line is a heading with a colon, not a speaker", () => {
  const t = SH.parseTranscript("JOE ROGAN: One.\nJORDAN PETERSON: Two.\nGeorge St. Pierre: The Balanced Warrior\nJOE ROGAN: Three.");
  assert.equal(t[2].heading, true);
  assert.equal(t[2].label, "§");
  assert.deepEqual(SH.speakerLabels(t), ["JOE ROGAN", "JORDAN PETERSON"]);
});

test("SRT cue numbers and timestamps are stripped", () => {
  const t = SH.parseTranscript("1\n00:00:01,000 --> 00:00:04,000\nHOST: Welcome back.\n\n2\n00:00:05,000 --> 00:00:09,000\nGUEST: Thanks.");
  assert.deepEqual(t.map(x => x.label + ":" + x.text), ["HOST:Welcome back.", "GUEST:Thanks."]);
});

test("verifyQuote accepts verbatim fragments with … trimming and rejects paraphrase", () => {
  const hay = "It’s like, no, you should put together a bad plan and you should implement it. Because even if you fail, you’ll gather information.";
  assert.equal(SH.verifyQuote("you should put together a bad plan … gather information", hay), true);
  assert.equal(SH.verifyQuote("\"you should put together a bad plan\"", hay), true);
  assert.equal(SH.verifyQuote("you should make a rough plan", hay), false);
  assert.equal(SH.verifyQuote("", hay), false);
});

test("attrSig changes with overrides and not with anything else", () => {
  const a = SH.attrSig({});
  const b = SH.attrSig({ "12": "JOE ROGAN" });
  const c = SH.attrSig({ "12": "JOE ROGAN" });
  const d = SH.attrSig({ "12": "JORDAN PETERSON" });
  assert.notEqual(a, b); assert.equal(b, c); assert.notEqual(b, d);
});

test("fmtTurns applies overrides and skips headings; chunkRanges covers every turn", () => {
  const t = SH.parseTranscript("A: one.\n\nHeading Here\n\nB: two.\nA: three.");
  assert.equal(SH.fmtTurns(t, { "2": "A" }, 0, 3), "[0] A: one.\n[2] A: two.\n[3] A: three.");
  const r = SH.chunkRanges(t, 10);
  assert.equal(r[0][0], 0); assert.equal(r[r.length - 1][1], t.length - 1);
});

test("carryOver moves receipts, searches and rejections to the same claim in a new reading and counts orphans", () => {
  const prev = { claims: [
    { text: "Religious married couples have the most sex.", receipts: [{ kind: "link", url: "https://x" }], searches: [{ adapter: "crossref" }], rejections: [{ reason: "duplicate" }], obligation: { id: "o1" }, lastSearchedAt: "t1", status: "receipt" },
    { text: "Gone from the new reading", receipts: [{ kind: "link", url: "https://y" }] },
    { text: "No records here", receipts: [] },
  ] };
  const next = { claims: [
    { text: "Religious married couples have the MOST sex", receipts: [], searches: [], candidates: [], rejections: [], status: "unchecked" },
    { text: "A brand new claim", receipts: [], status: "unchecked" },
  ] };
  const out = SH.carryOver(prev, next, "now");
  assert.equal(out.carried, 1); assert.equal(out.orphaned, 1); assert.equal(out.at, "now"); assert.equal(out.orphans[0].text, "Gone from the new reading");
  assert.equal(next.claims[0].receipts.length, 1); assert.equal(next.claims[0].searches.length, 1); assert.equal(next.claims[0].rejections.length, 1);
  assert.equal(next.claims[0].status, "receipt"); assert.equal(next.claims[0].obligation.id, "o1"); assert.equal(next.claims[0].lastSearchedAt, "t1");
  assert.equal(next.claims[1].receipts.length, 0); assert.equal(next.claims[1].status, "unchecked");
  const searchedOnly = { claims: [{ text: "x", searches: [{ adapter: "pubmed" }] }] }; const n2 = { claims: [{ text: "x" }] };
  SH.carryOver(searchedOnly, n2, "now"); assert.equal(n2.claims[0].status, "searched");
});

test("verifyQuote requires fragments in order at word boundaries and ignores transcript punctuation", () => {
  const t = "Well, I think, you know, that the pill made sex less dangerous. And so pornography use rose.";
  assert.equal(SH.verifyQuote("the pill made sex less dangerous", t), true);
  assert.equal(SH.verifyQuote("Well I think you know that", t), true, "commas are the transcriber's");
  assert.equal(SH.verifyQuote("the pill … pornography use rose", t), true, "ordered splice");
  assert.equal(SH.verifyQuote("pornography use rose … the pill", t), false, "reversed splice");
  assert.equal(SH.verifyQuote("the pill made … pill made sex", t), false, "overlapping splice");
  assert.equal(SH.verifyQuote("ill made sex", t), false, "word boundary");
  assert.equal(SH.verifyQuote("porn", t), false, "part of a word is not a word");
  assert.equal(SH.verifyQuote("the pill made sex safer", t), false, "paraphrase");
  assert.equal(SH.verifyQuote("\u2026made sex less dangerous\u2026", t), true, "ellipsis trim at the ends");
  assert.equal(SH.verifyQuote("I\u2019m not", "I'm not a climate scientist"), true, "typographic apostrophe");
  assert.equal(SH.verifyQuote("", t), false); assert.equal(SH.verifyQuote("…", t), false);
});

test("verifyPassage derives the speaker from the turn, relocates a quote named with the wrong turn, and checks the pivot inside the passage", () => {
  const turns = SH.parseTranscript("HOST: Welcome back.\nGUEST: In my clinical practice I tell people a bad plan beats no plan.\nHOST: Why is that?\nGUEST: Because even a failed attempt gives you information.\nHOST: Closing words: a bad plan beats no plan, you said.");
  const p = { turnStart: 0, turnEnd: 3, analysis: { asSaid: [
    { turn: 1, speaker: "GUEST", quote: "a bad plan beats no plan" },
    { turn: 2, speaker: "HOST", quote: "a bad plan beats no plan" },          // wrong turn, wrong speaker; found in turn 1 only (turn 4 is outside the passage)
    { turn: 9, speaker: "GUEST", quote: "even a failed attempt" },             // turn outside the passage; found in turn 3
    { turn: 1, speaker: "GUEST", quote: "a failed attempt gives you information" }, // named turn 1 but the words are in turn 3
    { turn: 1, speaker: "GUEST", quote: "nothing like this was said" },
  ], jump: { pivot: "Why is that" } } };
  const sum = SH.verifyPassage(turns, { "3": "HOST" }, p);
  const q = p.analysis.asSaid;
  assert.equal(q[0].verbatim, true); assert.equal(q[0].speakerNow, "GUEST"); assert.equal(q[0].speakerMismatch, false); assert.deepEqual(q[0].foundIn, []);
  assert.equal(q[1].verbatim, true); assert.deepEqual(q[1].foundIn, [1]); assert.equal(q[1].speakerNow, "GUEST"); assert.equal(q[1].speakerMismatch, true);
  assert.equal(q[2].verbatim, true); assert.equal(q[2].turnOk, false); assert.deepEqual(q[2].foundIn, [3]); assert.equal(q[2].speakerNow, "HOST", "override on turn 3 applies"); assert.equal(q[2].speakerMismatch, true);
  assert.equal(q[3].verbatim, true); assert.deepEqual(q[3].foundIn, [3]); assert.equal(q[3].speakerNow, "HOST");
  assert.equal(q[4].verbatim, false); assert.deepEqual(q[4].foundIn, []);
  assert.deepEqual(sum, { quotes: 5, matched: 4, tolerated: 0, mismatched: 3, outOfRange: 1, relocated: 3, pivotOk: true });
  assert.equal(q[0].relocated, false); assert.equal(q[0].matchedTurn, 1); assert.equal(q[1].matchedTurn, 1); assert.equal(q[1].relocated, true); assert.equal(q[3].matchedTurn, 3); assert.equal(q[4].matchedTurn, null);
  assert.deepEqual(p.analysis.jump.pivotTurns, [2]);
  const none = SH.verifyPassage(turns, {}, { turnStart: 0, turnEnd: 3, analysis: { asSaid: [], jump: { pivot: "" } } });
  assert.deepEqual(none, { quotes: 0, matched: 0, tolerated: 0, mismatched: 0, outOfRange: 0, relocated: 0, pivotOk: null });
});
