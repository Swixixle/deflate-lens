"use strict";
const crypto = require("node:crypto");
const shared = require("../shared/transcript");

function analysisHash(analysis) {
  const a = shared.sanitizeAnalysis(analysis);
  delete a.by;
  for (const c of a.claims) for (const k of ["id", "status", "receipts", "searches", "candidates", "rejections", "obligation", "lastSearchedAt", "searchQuery", "expectedSources", "routingEditedAt", "routingEditedBy"]) delete c[k];
  return crypto.createHash("sha256").update(JSON.stringify(a)).digest("hex");
}

function attributionGate(b) {
  const pr = b.run.provenance || {}, prep = b.run.preparation;
  if (pr.notApplicable) return { status: "ready", method: "No speaker correction is needed for this input." };
  if (pr.confirmedAt) return { status: "ready", method: "Speaker labels confirmed by a person." };
  if (prep && prep.inputHash === b.run.input.sha256 && prep.attrSig === b.attrSig) {
    return { status: prep.status, corrected: prep.corrections.length, unresolved: prep.unresolved.length, method: prep.method };
  }
  return { status: "held", method: "Speaker labels have not finished preparation." };
}

function contentIssues(a, p, turns, overrides, kind) {
  const oversized = a.truncated && (a.truncated.asSaid || a.truncated.claims);
  a = shared.sanitizeAnalysis(a);
  const issues = [];
  const levels = (x, name) => { if (!x || !x.hs || !x.g5) issues.push(name + " needs both reading levels"); };
  levels(a.deflated, "plain reading");
  if (a.jump.present || a.jump.hs || a.jump.g5) levels(a.jump, "challenge");
  if (a.fidelity.notes.hs || a.fidelity.notes.g5) levels(a.fidelity.notes, "fidelity explanation");
  if (kind !== "claim") {
    if (!a.asSaid.length) issues.push("no transcript quotation");
    const check = shared.verifyPassage(turns, overrides, { turnStart: p.turnStart, turnEnd: p.turnEnd, analysis: a });
    if (check.matched !== check.quotes) issues.push("a quotation does not match the passage");
    if (check.mismatched) issues.push("a quotation names the wrong speaker");
    if (a.jump.present && (!a.jump.pivot || check.pivotOk !== true)) issues.push("the claimed jump has no matching pivot");
    if (a.fidelity.grade !== "faithful") issues.push("the rewrite has not passed its fidelity check");
    levels(a.defense, "defense"); levels(a.revision, "revised judgment");
    if (a.jump.present && !a.revision.jumpSurvives) issues.push("the challenge was not revised after the defense");
  }
  if (!a.claims.length) issues.push("no claims");
  for (const [i, c] of a.claims.entries()) {
    if (kind !== "claim" && c.speaker && !turns.slice(p.turnStart, p.turnEnd + 1).some(t => !t.heading && shared.effSpeaker(t, overrides) === c.speaker)) issues.push("claim " + (i + 1) + " names a speaker outside this passage");
    levels(c.plain, "claim " + (i + 1)); levels(c.basis, "claim " + (i + 1) + " explanation");
    if (c.wouldSettle) levels(c.settle, "claim " + (i + 1) + " evidence needed");
  }
  if (oversized || a.truncated.asSaid || a.truncated.claims) issues.push("the model output exceeded the card limits");
  return [...new Set(issues)];
}

// Only corrections determined from the transcript itself are applied here. The provider's original answer stays
// in its hashed call record; these adjustments are documented on the checked call, before any card is saved.
function repairQuotes(a, p, turns, overrides) {
  const corrections = [];
  for (const q of a.asSaid) {
    const named = turns[q.turn];
    const inRange = named && !named.heading && q.turn >= p.turnStart && q.turn <= p.turnEnd;
    let at = inRange && shared.verifyQuote(q.quote, named.text) ? q.turn : null;
    if (at === null) {
      const found = shared.findQuoteTurns(q.quote, turns, p.turnStart, p.turnEnd);
      if (found.length === 1) at = found[0];
    }
    if (at === null) continue;
    const speaker = shared.effSpeaker(turns[at], overrides);
    if (q.turn !== at || q.speaker !== speaker) corrections.push({ kind: "quote_attribution", fromTurn: q.turn, toTurn: at, fromSpeaker: q.speaker, toSpeaker: speaker });
    q.turn = at; q.speaker = speaker;
  }
  return corrections;
}

function readingGate(b, p) {
  if (!p.analysis || p.status !== "done") return { status: "pending", reasons: ["The reading is still being prepared."] };
  const reasons = (p.stale || []).slice();
  if (attributionGate(b).status !== "ready") reasons.push("Speaker labels are still unresolved.");
  const c = p.analysis.claims && p.analysis.claims[0];
  const personOnly = b.run.kind === "claim" && p.analysis.by === "person" && p.analysis.claims.length === 1 && c.type === "claim" &&
    p.analysis.deflated.hs === c.text && p.analysis.deflated.g5 === c.text && (!c.plain.hs || c.plain.hs === c.text) && (!c.plain.g5 || c.plain.g5 === c.text) &&
    !c.basis.hs && !c.basis.g5 && !c.wouldSettle && !c.settle.hs && !c.settle.g5 && !p.analysis.asSaid.length && !p.analysis.defense.hs && !p.analysis.defense.g5 && !p.analysis.revision.hs && !p.analysis.revision.g5 &&
    !p.analysis.jump.present && !p.analysis.jump.hs && !p.analysis.jump.g5 && !p.analysis.jump.pivot &&
    p.analysis.judgments.evidence === "n/a" && p.analysis.judgments.inference === "n/a";
  if (personOnly) return { status: reasons.length ? "held" : "ready", reasons, method: "Your typed claim, ready to search; not an AI explanation." };
  const turns = shared.parseTranscript(b.transcript, { mode: b.run.parseMode || "transcript" });
  reasons.push(...contentIssues(p.analysis, p, turns, b.run.provenance && b.run.provenance.overrides || {}, b.run.kind));
  const review = p.provenance && p.provenance.review;
  if (!review || !review.approved || review.analysisHash !== analysisHash(p.analysis)) reasons.push("This reading has not passed the preparation review.");
  return { status: reasons.length ? "held" : "ready", reasons: [...new Set(reasons)], method: "Quotes, reading levels and a separate model review checked before display; empirical sources remain separate." };
}
module.exports = { analysisHash, attributionGate, contentIssues, repairQuotes, readingGate };
