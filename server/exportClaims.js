"use strict";
/* Builds the exports from a run bundle. The JSON is the seam to other tools (schema deflate-lens/claims@0.5): every
   claim carries its speaker, turn range, type, judgments and records. Vocabulary: a claim's `status` is unchecked
   (nobody has looked), searched (a search ran; candidates may be waiting), or receipt (a person attached at least one
   document they judged relevant). None of these means verified; the export says so in `statusMeaning`. A receipt's
   `relation` is what the attaching person said the document does (supports / contradicts / mentions / unstated); the
   meanings are in `relationMeaning`. The export carries the SHA-256 of the transcript it was made from and, on every
   passage, the hash of the text that reading was made from, so `scripts/verify-export.js` can check an export against a
   transcript file. */
const Q = require("./quality");
const { RELATION_MEANING } = require("./research/types");

const STATUS_MEANING = {
  unchecked: "No one has looked for sources yet. The model cannot search.",
  searched: "A search ran and its attempts are on record; any candidates are waiting for a person's judgment.",
  receipt: "A person attached one or more documents they judged relevant and wrote a note. This records a judgment of relevance, not verification of the claim. Each receipt's `relation` is that person's stated reading of the document (see relationMeaning); it is never inferred from a search.",
};
function relationCounts(receipts) { const out = { supports: 0, contradicts: 0, mentions: 0, unstated: 0 }; receipts.forEach(x => { const r = x.relation || "unstated"; out[r in out ? r : "unstated"]++; }); return out; }
function relationPhrase(rc) { const n = relationCounts(rc); const parts = []; if (n.supports) parts.push(n.supports + " marked supports"); if (n.contradicts) parts.push(n.contradicts + " marked contradicts"); if (n.mentions) parts.push(n.mentions + " marked mentions"); if (n.unstated) parts.push(n.unstated + " with no relation stated"); return parts.join(", "); }

function speakerName(key, run) {
  const s = (run.speakers || []).find(x => x.key === key);
  return (s && s.name) ? s.name : (key === "UNLABELED" ? "Speaker unknown" : key);
}
function activeReceipts(c) { return (c.receipts || []).filter(x => !x.withdrawnAt); }
/* Why a claim's research should be read as provisional: its card is stale, or attribution is needed and unconfirmed. */
function provisionalFor(b, p) { const out = (p.stale || []).slice(); const pr = b.run.provenance || {}; if (Q.attributionGate(b).status !== "ready") out.push("speaker preparation is unresolved"); if (p.readingGate && p.readingGate.status !== "ready") out.push("reading held before display"); return out; }
function claimStatus(c) { return activeReceipts(c).length ? "receipt" : (c.searches && c.searches.length ? "searched" : "unchecked"); }

function buildExport(b) {
  const r = b.run, pr = r.provenance || {};
  const done = b.passages.filter(p => p.status === "done" && p.analysis);
  const claims = [];
  done.forEach(p => (p.analysis.claims || []).forEach((c, i) => claims.push({
    id: c.id || (p.id + "-c" + (i + 1)), position: i + 1, passageId: p.id, readingRev: p.readingRev || 0, speaker: c.speaker ? speakerName(c.speaker, r) : "", speakerKey: c.speaker || "", text: c.text, type: c.type, userSupplied: !!c.userSupplied,
    plain: c.plain || null, settle: c.settle || null,
    status: claimStatus(c), wouldSettle: c.wouldSettle || "", turns: [p.turnStart, p.turnEnd], provisional: provisionalFor(b, p),
    expectedSources: c.expectedSources || [], searchQuery: c.searchQuery || "", obligationId: c.obligation && c.obligation.id || "",
    stale: p.stale || [], readingGate: p.readingGate || null,
    relations: relationCounts(activeReceipts(c)),
    receipts: (c.receipts || []).map(x => ({ rid: x.rid || "", kind: x.kind || "link", url: x.url, note: x.note || "", addedBy: x.addedBy || "", at: x.at || "", title: x.title || "", doi: x.doi || "", pmid: x.pmid || "", journal: x.journal || "", outlet: x.outlet || "", sourceType: x.sourceType || "", publishedAt: x.publishedAt || "", retrievedAt: x.retrievedAt || "", foundBy: x.foundBy || [], notices: x.notices || [],
      relation: x.relation || "unstated", relationBy: x.relationBy || "", relationAt: x.relationAt || "", relationHistory: x.relationHistory || [],
      withdrawn: !!x.withdrawnAt, withdrawnAt: x.withdrawnAt || "", withdrawReason: x.withdrawReason || "", reattached: x.reattached || null })),
    searches: (c.searches || []).map(a => ({ adapter: a.adapter, field: a.field || "", query: a.query, hitCount: a.hitCount, totalReported: a.totalReported == null ? null : a.totalReported, error: a.error || null, at: a.at || "", readingRev: a.readingRev == null ? null : a.readingRev, late: !!a.late, provisional: a.provisional || [] })),
    candidatesPending: (c.candidates || []).filter(x => x.status === "candidate").length,
    rejections: (c.rejections || []).map(x => ({ doi: x.doi || "", url: x.url || "", reason: x.reason, detail: x.detail || "", at: x.at || "" }))
  })));
  return {
    schema: "deflate-lens/claims@0.5",
    exportedAt: new Date().toISOString(),
    generator: "deflate-lens local app",
    statusMeaning: STATUS_MEANING,
    relationMeaning: RELATION_MEANING,
    verify: "run `node scripts/verify-export.js <this file> <transcript.txt>` to check that run.transcript.sha256 is the SHA-256 of that file's text and which passages were read from exactly that text",
    run: {
      id: r.id, title: r.title, kind: r.kind || "transcript", parseMode: r.parseMode || "transcript", example: !!r.example, copiedFrom: r.copiedFrom || "", import: r.import || null, attributionGate: b.attributionGate || Q.attributionGate(b),
      source: { url: r.sourceUrl || "", label: r.sourceLabel || "", date: r.sourceDate || "" },
      transcript: { updatedAt: r.transcriptUpdatedAt || "", characters: (b.transcript || "").length, sha256: r.input && r.input.sha256 || "", bytes: r.input && r.input.bytes || null, parseMode: r.input && r.input.parseMode || r.parseMode || "transcript", earlierVersions: (r.inputHistory || []).map(x => ({ sha256: x.sha256, chars: x.chars, transcriptUpdatedAt: x.transcriptUpdatedAt, replacedAt: x.replacedAt })) },
      provenance: { confirmedAt: pr.confirmedAt || "", confirmedBy: pr.confirmedBy || "", notApplicable: !!pr.notApplicable, labelsOrigin: pr.labelsOrigin || "source", assignment: pr.assignment || null, method: pr.method || "", attrSig: b.attrSig, transcriptNote: pr.transcriptNote || "",
        preparation: r.preparation || null,
        corrected: Object.keys(pr.overrides || {}).map(i => ({ turn: Number(i), speaker: pr.overrides[i] })), flagged: (pr.flags || []).map(f => f.turn), earlierDecisions: (r.provenanceHistory || []).length },
      speakers: (r.speakers || []).map(s => ({ key: s.key, name: s.name || s.key })),
      orphans: (r.orphans || []).map(o => ({ id: o.id, claimText: o.claimText, from: o.from, receipts: (o.receipts || []).length, searches: (o.searches || []).length, rejections: (o.rejections || []).length, parkedAt: o.parkedAt })),
    },
    passages: done.map(p => ({ id: p.id, title: p.title, turnStart: p.turnStart, turnEnd: p.turnEnd, speakers: p.speakers || [], analyzedAt: p.analyzedAt || "", analyzedBy: p.analyzedBy || "", model: p.model || "", stale: p.stale || [], rev: p.rev || 0, readingRev: p.readingRev || 0, earlierReadings: (p.history || []).length,
      basedOn: { inputHash: p.basedOn && p.basedOn.inputHash || "", attrSig: p.basedOn && p.basedOn.attrSig || "", transcriptUpdatedAt: p.basedOn && p.basedOn.transcriptUpdatedAt || "" },
      provenance: p.provenance || null, readingGate: p.readingGate || null,
      quoteCheck: p.quoteCheck || null,
      quotes: (p.analysis.asSaid || []).map(q => ({ turn: q.turn, matchedTurn: q.matchedTurn == null ? null : q.matchedTurn, relocated: !!q.relocated, speakerClaimed: q.speaker, speakerNow: q.speakerNow || "", speakerMismatch: !!q.speakerMismatch, quote: q.quote, verbatim: !!q.verbatim, tolerated: q.tolerated || [], turnOk: q.turnOk !== false, foundIn: q.foundIn || [] })),
      judgments: p.analysis.judgments, fidelity: p.analysis.fidelity.grade, jump: { present: p.analysis.jump.present, pivot: p.analysis.jump.pivot || "", pivotVerbatim: p.analysis.jump.pivotVerbatim, survives: p.analysis.revision.jumpSurvives || "" } })),
    patterns: (b.summary && b.summary.patterns || []).map(x => ({ title: x.title.hs, passages: x.passages })),
    patternsGate: b.summary && b.summary.readingGate || null,
    claims,
  };
}

/* Markdown at one reading level ("hs" or "g5"). Quotes are exact at both levels; only generated explanations change. */
function buildMarkdown(b, level) {
  const L = level === "g5" ? "g5" : "hs";
  const T = x => (x && typeof x === "object") ? (x[L] || x.hs || "") : String(x || "");
  const r = b.run, out = [];
  out.push("# " + (r.title || "Run") + " — deflated" + (L === "g5" ? " (fifth-grade reading level)" : "") + "\n");
  if (r.kind === "claim") out.push("_A claim supplied by a person, not taken from a transcript. Nothing here was graded by a model unless a card says so._\n");
  if (r.sourceUrl) out.push("Source: " + (r.sourceLabel || "") + " " + r.sourceUrl + "\n");
  if (r.example) out.push("_Supplied example. Analysis written in chat by Claude, corrected after a second-reader review; attribution not confirmed by a person._\n");
  out.push("_Quotes are exact words from the transcript, checked word for word. A source attached to a claim records a person's judgment that it is relevant, and the relation shown in brackets ([supports], [contradicts], [mentions]) is what that person said the document does; neither makes the claim verified._" + (r.input && r.input.sha256 ? " _Transcript sha256: " + r.input.sha256 + "._" : "") + "\n");
  b.passages.forEach(p => {
    if (p.status !== "done" || !p.analysis) return; if (p.readingGate && p.readingGate.status !== "ready") { out.push("## " + p.title + "\n\nReading held: preparation has not passed.\n"); return; } const a = p.analysis, qc = p.quoteCheck;
    out.push("## " + p.title + " (turns " + p.turnStart + "–" + p.turnEnd + ")" + ((p.stale || []).length ? " — STALE: " + p.stale.join("; ") : "") + "\n");
    out.push("**In plain words.** " + T(a.deflated) + "\n");
    out.push((a.jump.present ? "**Where it jumps.** " : "**No jump.** ") + T({ hs: a.jump.hs, g5: a.jump.g5 }) + (a.jump.pivot ? " Pivot: “" + a.jump.pivot + "”" + (a.jump.pivotVerbatim === false ? " (not found word for word)" : "") : "") + "\n");
    out.push("**In fairness to the speaker.** " + T(a.defense) + "\n");
    out.push("**What is left" + (a.revision.jumpSurvives ? " (the jump " + ({ yes: "stands", partly: "partly stands", no: "does not stand" })[a.revision.jumpSurvives] + ")" : "") + ".** " + T({ hs: a.revision.hs, g5: a.revision.g5 }) + "\n");
    out.push("**Claims.**");
    (a.claims || []).forEach(c => { const rc = activeReceipts(c); const settle = (c.settle && (c.settle[L] || c.settle.hs)) || c.wouldSettle || ""; out.push("- [" + c.type + "] " + c.text + (c.plain && (c.plain[L] || c.plain.hs) ? " — in plain words: " + (c.plain[L] || c.plain.hs) : "") + " — " + T(c.basis) + (settle ? " · would settle it: " + settle : "") + " · " + ({ receipt: "sources attached: " + rc.length + " (" + relationPhrase(rc) + ")", searched: "searched, no source attached", unchecked: "not checked" })[claimStatus(c)] + (rc.length ? " (" + rc.map(x => x.url + (x.relation && x.relation !== "unstated" ? " [" + x.relation + "]" : "")).join(" ") + ")" : "")); });
    out.push("\n**The words as said.**");
    (a.asSaid || []).forEach(q => out.push("> " + speakerName(q.speakerNow || q.speaker, r) + " [" + (q.matchedTurn != null ? q.matchedTurn : q.turn) + "]: “" + q.quote + "”" + (q.verbatim ? ((q.tolerated || []).length ? " (matched, numbers written differently)" : "") : " (not found word for word)") + (q.relocated ? " (the card named turn " + q.turn + "; the words are in turn " + q.matchedTurn + ")" : "") + (q.speakerMismatch ? " (the model labelled this " + speakerName(q.speaker, r) + ")" : "")));
    out.push("\n_Rewrite checked: " + (a.fidelity.grade || "unrated") + " — " + T(a.fidelity.notes) + "_");
    out.push("_Evidence: " + a.judgments.evidence + " · Inference: " + a.judgments.inference + (qc ? " · Quotes matched: " + qc.matched + "/" + qc.quotes : "") + (p.analyzedBy ? " · by " + p.analyzedBy : "") + (p.provenance && p.provenance.recorded ? " · model call " + (p.provenance.requestId || p.provenance.callId) + (p.provenance.modelReturned ? " (" + p.provenance.modelReturned + ")" : "") : "") + (p.basedOn && p.basedOn.inputHash ? " · read from text sha256:" + p.basedOn.inputHash.slice(0, 12) + "…" : "") + "_\n");
  });
  if (b.summary && (!b.summary.readingGate || b.summary.readingGate.status === "ready")) { out.push("## Patterns\n"); (b.summary.patterns || []).forEach((x, i) => out.push((i + 1) + ". **" + T(x.title) + "** " + T(x.body))); out.push("\n## What survived\n" + T(b.summary.survived) + "\n"); }
  return out.join("\n");
}

/* Receipts-compatible obligations for every empirical claim. Shape: src/surfacing/obligations.py EvidenceObligation.to_json. */
function buildObligations(b) {
  const { obligationFor } = require("./research/index");
  const { EMPIRICAL_TYPES } = require("./research/types");
  const obligations = [];
  b.passages.forEach(p => { if (p.status !== "done" || !p.analysis) return; const prov = provisionalFor(b, p); (p.analysis.claims || []).forEach((c, i) => { if (!EMPIRICAL_TYPES.includes(c.type)) return; obligations.push(Object.assign(obligationFor(b.run, p, c, i), { claim_type: c.type, claim_id: c.id || "", speaker: c.speaker || "", passage: p.id, reading_rev: p.readingRev || 0, status: claimStatus(c), stale: p.stale || [], provisional: prov.length > 0, provisional_reasons: prov })); }); });
  return { schema: "deflate-lens/obligations@0.2", compatible_with: "Receipts src/surfacing/obligations.py EvidenceObligation.to_json", exportedAt: new Date().toISOString(), statusMeaning: STATUS_MEANING, run: { id: b.run.id, title: b.run.title, source: { url: b.run.sourceUrl || "", label: b.run.sourceLabel || "", date: b.run.sourceDate || "" }, attributionConfirmed: !!(b.run.provenance && b.run.provenance.confirmedAt) }, obligations };
}

module.exports = { buildExport, buildMarkdown, buildObligations, claimStatus, activeReceipts, relationCounts, STATUS_MEANING };
