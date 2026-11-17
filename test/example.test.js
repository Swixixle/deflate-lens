"use strict";
/* The supplied example must stay honest: every quote verbatim, every pivot found, both reading levels everywhere,
   no percentage scores, claim types in the allowed set, and its unconfirmed-attribution status preserved. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const SH = require("../shared/transcript");

const EX = path.join(__dirname, "..", "examples", "pilot-jre2308");
const TYPES = ["fact", "contested", "unsupported", "interpretation", "value", "image", "unscorable"];

test("example run is flagged as example and its attribution is not claimed as confirmed", () => {
  const run = JSON.parse(fs.readFileSync(path.join(EX, "run.json"), "utf8"));
  assert.equal(run.example, true);
  assert.equal(run.provenance.confirmedAt, undefined);
  assert.match(run.provenance.method, /not yet confirmed by a person/i);
  assert.equal(run.sourceUrl, "https://www.youtube.com/watch?v=QBEZhjnZTks");
  assert.ok(Object.keys(run.provenance.overrides).length > 100);
});

test("every quote and pivot in the example appears verbatim, in order, in its own turn, credited to the speaker the corrected transcript shows", () => {
  const transcript = fs.readFileSync(path.join(EX, "transcript.txt"), "utf8");
  const turns = SH.parseTranscript(transcript);
  const run = JSON.parse(fs.readFileSync(path.join(EX, "run.json"), "utf8"));
  let quotes = 0;
  for (const f of fs.readdirSync(path.join(EX, "passages")).sort()) {
    const p = JSON.parse(fs.readFileSync(path.join(EX, "passages", f), "utf8")), a = p.analysis;
    const check = SH.verifyPassage(turns, run.provenance.overrides, p);
    for (const q of a.asSaid) {
      quotes++;
      assert.ok(q.turn >= p.turnStart && q.turn <= p.turnEnd, f + " quote turn in range");
      assert.equal(SH.verifyQuote(q.quote, turns[q.turn].text), true, f + " quote [" + q.turn + "] verbatim in the turn it names");
      assert.equal(q.speakerMismatch, false, f + " quote [" + q.turn + "] credited to " + q.speaker + " but the corrected transcript says " + q.speakerNow);
    }
    assert.equal(check.matched, check.quotes, f + " all quotes matched"); assert.equal(check.outOfRange, 0);
    if (a.jump.pivot) { assert.equal(check.pivotOk, true, f + " pivot found inside the passage"); assert.ok(a.jump.pivotTurns.length >= 1); }
    for (const c of a.claims) { assert.ok(TYPES.includes(c.type), f + " claim type " + c.type); assert.ok(c.basis.hs && c.basis.g5, f + " claim basis both levels"); if (c.wouldSettle) assert.ok(c.settle && c.settle.hs && c.settle.g5, f + " what would settle “" + c.text + "” is written at both levels"); }
    for (const k of ["deflated", "defense"]) for (const l of ["hs", "g5"]) assert.ok(a[k][l], f + " " + k + "." + l);
    for (const l of ["hs", "g5"]) { assert.ok(a.jump[l], f + " jump." + l); assert.ok(a.revision[l], f + " revision." + l); assert.ok(a.fidelity.notes[l], f + " fidelity." + l); }
    assert.doesNotMatch(JSON.stringify(a), /\d+\s*%\s*survive/i, f + " no percentage score");
    assert.ok(p.basedOn && p.basedOn.attrSig, f + " records the attribution signature it was analysed under");
  }
  assert.equal(quotes, 63);
});

test("example summary has both levels and a basedOn signature", () => {
  const s = JSON.parse(fs.readFileSync(path.join(EX, "summary.json"), "utf8"));
  assert.ok(s.patterns.length >= 3);
  for (const p of s.patterns) { assert.ok(p.title.hs && p.title.g5 && p.body.hs && p.body.g5); }
  assert.ok(s.survived.hs && s.survived.g5);
  assert.ok(s.basedOn && s.basedOn.passagesSig.split(",").length === 16);
});
