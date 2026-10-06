"use strict";
const crypto = require("node:crypto");
const shared = require("../shared/transcript");
const V = require("./validate");

function summaryHash(summary) {
  const s = V.validateSummary(summary);
  return crypto.createHash("sha256").update(JSON.stringify({ patterns: s.patterns, survived: s.survived })).digest("hex");
}
function summaryIssues(summary, passages) {
  const s = V.validateSummary(summary), ids = new Set(passages.map(p => p.id)), issues = [];
  if (!s.survived.hs || !s.survived.g5) issues.push("The overview needs both reading levels.");
  for (const p of s.patterns) {
    if (!p.title.hs || !p.title.g5 || !p.body.hs || !p.body.g5) issues.push("Every pattern needs both reading levels.");
    if (new Set(p.passages).size < 2 || p.passages.some(x => !ids.has(x))) issues.push("A recurring pattern must cite at least two prepared cards.");
  }
  return [...new Set(issues)];
}

function analysisHash(analysis) {
  const a = shared.sanitizeAnalysis(analysis);
  delete a.by;
  for (const c of a.claims) for (const k of ["id", "status", "receipts", "searches", "candidates", "rejections", "obligation", "lastSearchedAt", "searchQuery", "expectedSources", "routingEditedAt", "routingEditedBy"]) delete c[k];
  return crypto.createHash("sha256").update(JSON.stringify(a)).digest("hex");
}

function attributionGate(b) {
  const pr = b.run.provenance || {}, prep = b.run.preparation;
  if (pr.notApplicable) return { status: "ready", method: "No speaker correction is needed for this input." };
  if (pr.confirmedAt) return { status: "ready", method: "Speaker labels confirmed by a person." + (pr.labelsOrigin === "model" ? " The names were first assigned by a model from the words, not taken from the source." : "") };
  // labels established from the words (two passes, quotations checked) or by voice from the recording, for this exact text
  if (pr.labelsOrigin === "words" && pr.structure && pr.structure.established && pr.structure.resultHash === b.run.input.sha256) return { status: "ready", method: pr.structure.method, origin: "words", unestablished: pr.structure.unestablishedSegments || 0 };
  if (pr.labelsOrigin === "voices" && pr.voices && pr.voices.resultHash === b.run.input.sha256) return { status: "ready", method: pr.voices.method, origin: "voices" };
  // voices from the recording, then clips, quotations or advertisements set apart in that very text (the labels kept)
  const st = pr.structure;
  if (pr.labelsOrigin === "voices" && pr.voices && st && st.mode === "labelled" && st.established && st.resultHash === b.run.input.sha256 && st.inputHash === pr.voices.resultHash)
    return { status: "ready", method: pr.voices.method + " " + st.method, origin: "voices" };
  if (prep && prep.inputHash === b.run.input.sha256 && prep.attrSig === b.attrSig) {
    return { status: prep.status, corrected: prep.corrections.length, unresolved: prep.unresolved.length, method: prep.method, labelsOrigin: pr.labelsOrigin || "source" };
  }
  return { status: "held", method: "Speaker labels have not finished preparation." };
}

const { isNeutral, SPEAKER_CHECKED, AD_CHECKED, PLAIN_CHECKED, PLAIN_WORDS } = require("../shared/prompts");
const OLD_EMPIRICAL = ["fact", "contested", "unsupported"];
/* `contract` is the reading contract the analysis was written under (recorded on its model call). Records written
   before 0.12 have none and keep the rules they were accepted under; the consistency rules below apply to reading-2 and
   reading-3 alike (reading-3 changed the instructions, not the structure of a reading). */
function contentIssues(a, p, turns, overrides, kind, contract) {
  const oversized = a.truncated && (a.truncated.asSaid || a.truncated.claims);
  a = shared.sanitizeAnalysis(a);
  const issues = [];
  if (isNeutral(contract)) {
    if (a.claims.some(c => OLD_EMPIRICAL.includes(c.type))) issues.push("an empirical claim was labelled true or false from memory; it must be a checkable claim");
    if (kind === "claim") {
      if (a.judgments.inference !== "n/a") issues.push("a single typed claim has no reasoning to judge");
    } else {
      if (!a.jump.present && a.jump.pivot) issues.push("no concern was raised, so there can be no pivot");
      if (!a.jump.present && a.judgments.inference === "gap") issues.push("a reasoning gap is recorded although no concern was raised");
      if (!a.jump.present && ["yes", "partly"].includes(a.revision.jumpSurvives)) issues.push("a concern that was never raised cannot stand in the final assessment");
      if (a.jump.present && (!a.jump.hs || !a.jump.g5)) issues.push("the concern needs both reading levels");
      if (a.jump.present && !["yes", "partly", "no"].includes(a.revision.jumpSurvives)) issues.push("the final assessment does not say whether the concern stands");
      if (a.jump.present && a.revision.jumpSurvives === "no" && a.judgments.inference === "gap") issues.push("a concern withdrawn after the fair reading cannot remain the final judgment");
      if (!a.revision.hs || !a.revision.g5) issues.push("the final assessment needs both reading levels");
    }
  }
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
  // reading-4: a claim whose words stand in the turns of exactly one speaker is credited to that speaker (a clip's claim to
  // the clip, never to the speaker who played it; a claim from an unestablished stretch to no one in particular)
  if (kind !== "claim" && SPEAKER_CHECKED.includes(contract)) {
    const inPassage = turns.slice(p.turnStart, p.turnEnd + 1).filter(t => !t.heading);
    for (const [i, c] of a.claims.entries()) {
      if (!c.speaker || shared.wordsOf(c.text).split(" ").length < 4) continue;
      const holders = inPassage.filter(t => shared.verifyQuote(c.text, t.text)), who = [...new Set(holders.map(t => shared.effSpeaker(t, overrides)))];
      if (who.length === 1 && who[0] !== String(c.speaker).toUpperCase()) issues.push("claims[" + i + "]: credited to " + c.speaker + ", but these words are " + who[0] + "'s (turn " + holders[0].i + "); a claim's speaker is the label of the turn that states it");
    }
  }
  // reading-5: an advertisement (AD n) is not part of the conversation; nothing in a reading comes from one
  if (kind !== "claim" && AD_CHECKED.includes(contract)) {
    a.claims.forEach((c, i) => { if (/^AD \d+$/.test(String(c.speaker || "").toUpperCase())) issues.push("claims[" + i + "]: taken from an advertisement (" + c.speaker + "), which is not part of the conversation"); });
    if (a.asSaid.some(q => /^AD \d+$/.test(String(q.speaker || "").toUpperCase()) || (turns[q.turn] && /^AD \d+$/.test(shared.effSpeaker(turns[q.turn], overrides))))) issues.push("asSaid: a quotation is taken from an advertisement, which is not part of the conversation");
  }
  // reading-6: "In plain words" is the card's gist, held to its length (a correction is asked for; length alone never
  // holds a reading: isLengthIssue, preparation.reviewedReading)
  if (kind !== "claim" && PLAIN_CHECKED.includes(contract)) {
    for (const lv of ["hs", "g5"]) { const n = shared.wordsOf(a.deflated[lv] || "").split(" ").filter(Boolean).length; if (n > PLAIN_WORDS[lv].limit) issues.push("deflated." + lv + ": In plain words runs to " + n + " words; the card asks for at most " + PLAIN_WORDS[lv].ask + ": two or three short sentences with the main claim and its main reason, attributed, keeping the speaker's certainty and scope. The claims carry the rest."); }
  }
  if (oversized || a.truncated.asSaid || a.truncated.claims) issues.push("the model output exceeded the card limits");
  return [...new Set(issues)];
}
/* A problem of length alone ("In plain words runs to …"): corrected when it can be, never a reason to hold a reading. */
const isLengthIssue = s => /^deflated\.(?:hs|g5): In plain words runs to \d+ words; the card asks for at most \d+/.test(String(s));

// Only corrections determined from the transcript itself are applied here. The provider's original answer stays
// in its hashed call record; these adjustments are documented on the checked call, before any card is saved.
function repairQuotes(a, p, turns, overrides) {
  const corrections = [];
  for (const q of a.asSaid) {
    const named = turns[q.turn];
    const inRange = named && !named.heading && q.turn >= p.turnStart && q.turn <= p.turnEnd;
    let at = inRange && shared.matchQuote(q.quote, named.text) ? q.turn : null;
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
  if (p.status === "error" && p.held) return { status: "held", reasons: p.held.issues.length ? p.held.issues.slice() : ["The reading did not pass its checks."] };
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
  // (a reading shown although its plain words run long keeps being shown: length alone never holds one, reading-6)
  reasons.push(...contentIssues(p.analysis, p, turns, b.run.provenance && b.run.provenance.overrides || {}, b.run.kind, p.provenance && p.provenance.contract).filter(x => !isLengthIssue(x)));
  const review = p.provenance && p.provenance.review;
  if (!review || !review.approved || review.analysisHash !== analysisHash(p.analysis)) reasons.push("This reading has not passed the preparation review.");
  return { status: reasons.length ? "held" : "ready", reasons: [...new Set(reasons)], method: "Quotes, reading levels and a separate model review checked before display; empirical sources remain separate." };
}
module.exports = { analysisHash, summaryHash, summaryIssues, attributionGate, contentIssues, repairQuotes, readingGate, isLengthIssue };
