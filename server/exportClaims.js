"use strict";
/* Builds the exports from a run bundle. The JSON is the seam to other tools (schema deflate-lens/claims@0.6): every
   claim carries its speaker, turn range, type, judgments and records. Vocabulary: a claim's `status` is unchecked
   (nobody has looked), searched (a search ran; candidates may be waiting), or receipt (a person attached at least one
   document they judged relevant). None of these means verified; the export says so in `statusMeaning`. A receipt's
   `relation` is what the attaching person said the document does (supports / contradicts / mentions / unstated); the
   meanings are in `relationMeaning`. The export carries the SHA-256 of the transcript it was made from and, on every
   passage, the hash of the text that reading was made from, so `scripts/verify-export.js` can check an export against a
   transcript file. */
const Q = require("./quality");
const shared = require("../shared/transcript");
const { sourceIdentity } = require("./store");
const { RELATION_MEANING } = require("./research/types");

const STATUS_MEANING = {
  unchecked: "No one has looked for sources yet. The model cannot search.",
  searched: "A search ran and its attempts are on record; any candidates are waiting for a person's judgment.",
  receipt: "A person attached one or more documents they judged relevant and wrote a note. This records a judgment of relevance, not verification of the claim. Each receipt's `relation` is that person's stated reading of the document (see relationMeaning); it is never inferred from a search.",
};
function relationCounts(receipts) { const out = { supports: 0, contradicts: 0, mentions: 0, unstated: 0 }; receipts.forEach(x => { const r = x.relation || "unstated"; out[r in out ? r : "unstated"]++; }); return out; }
function relationPhrase(rc) { const n = relationCounts(rc); const parts = []; if (n.supports) parts.push(n.supports + " marked supports"); if (n.contradicts) parts.push(n.contradicts + " marked contradicts"); if (n.mentions) parts.push(n.mentions + " marked mentions"); if (n.unstated) parts.push(n.unstated + " with no relation stated"); return parts.join(", "); }

function speakerName(key, run) {
  if (key === "UNLABELED") return "Speaker not established";
  const s = (run.speakers || []).find(x => x.key === key);
  return (s && s.name) ? s.name : key;
}
/* A text with no speaker labels at all: its words are given without a speaker in front of each; one line says why. */
function allUnlabeled(b) { const l = shared.speakerLabels(shared.parseTranscript(b.transcript || "", { mode: b.run.parseMode || "transcript" })); return b.run.kind !== "claim" && l.length > 0 && l.every(x => x === "UNLABELED"); }
function speakerNote(b) {
  const pr = b.run.provenance || {};
  if (pr.labelsOrigin === "voices") return "_Speakers were separated by voice from the recording" + (pr.voices && pr.voices.via === "transcription" ? " as Deepgram transcribed it" : "") + "._";
  if (pr.labelsOrigin === "words") return "_Speakers were worked out from the words._";
  return allUnlabeled(b) ? "_This text has no speaker labels._" : "";
}
/* The labels the text uses (and any a correction moved a turn to), in order of first appearance. */
function labelsUsed(b) {
  const turns = shared.parseTranscript(b.transcript || "", { mode: b.run.parseMode || "transcript" }), ov = b.run.provenance && b.run.provenance.overrides || {};
  const keys = []; turns.forEach(t => { if (t.heading) return; const k = shared.effSpeaker(t, ov); if (!keys.includes(k)) keys.push(k); });
  return keys;
}
/* "Who is speaking": each speaker's name and how it was found, or why there is none. Left out when every name came with
   the transcript (nothing to explain) or the text has no labels. */
function whoLines(b) {
  if (b.run.kind === "claim" || allUnlabeled(b)) return [];
  const acc = labelsUsed(b).map(k => shared.speakerAccount(b.run, k));
  if (acc.every(a => a.by === "transcript" || a.by === "none")) return [];
  return acc.map(a => "- " + a.name + (a.name !== a.label && a.by !== "set_apart" && a.by !== "transcript" ? " (" + a.label + ")" : "") + (a.text ? ": " + a.text : ""));
}
function activeReceipts(c) { return (c.receipts || []).filter(x => !x.withdrawnAt); }
/* Why a claim's research should be read as provisional: its card is stale, or attribution is needed and unconfirmed. */
function provisionalFor(b, p) { const out = (p.stale || []).slice(); const pr = b.run.provenance || {}; if (Q.attributionGate(b).status !== "ready") out.push("speaker preparation is unresolved"); if (p.readingGate && p.readingGate.status !== "ready") out.push("reading held before display"); return out; }
function claimStatus(c) { return activeReceipts(c).length ? "receipt" : (c.searches && c.searches.length ? "searched" : "unchecked"); }

/* The passage a held reading was made from, as it is labelled now. */
function heldSource(b, p) {
  const turns = shared.parseTranscript(b.transcript || "", { mode: b.run.parseMode || "transcript" });
  return shared.fmtTurns(turns, b.run.provenance && b.run.provenance.overrides || {}, p.turnStart, p.turnEnd);
}
function buildExport(b) {
  const r = b.run, pr = r.provenance || {}, used = r.kind === "claim" ? [] : labelsUsed(b);
  const done = b.passages.filter(p => p.status === "done" && p.analysis);
  const claims = [];
  done.forEach(p => (p.analysis.claims || []).forEach((c, i) => claims.push({
    id: c.id || (p.id + "-c" + (i + 1)), position: i + 1, passageId: p.id, readingRev: p.readingRev || 0, speaker: c.speaker ? speakerName(c.speaker, r) : "", speakerKey: c.speaker || "", speakerNamedBy: c.speaker ? shared.speakerAccount(r, c.speaker).by : "", text: c.text, type: c.type, displayType: shared.claimTypeLabel(c.type), historicalType: shared.historicalType(c.type), userSupplied: !!c.userSupplied,
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
    schema: "deflate-lens/claims@0.7",
    attemptsMeaning: "attempts: every draft of a reading in order (the model's full draft, then each correction that changed only the parts named), the problems found in it, and the review's own answer, from attempts/<passage>.jsonl. A held reading's drafts were never shown; they are here so a person can judge whether the hold was right.",
    typeMeaning: "displayType is what the app shows. type is the saved value: \"claim\" for an empirical assertion read under the neutral contract (reading-2 or later; never judged true or false from the model's memory); \"fact\", \"contested\" and \"unsupported\" are kept as an earlier model labelled them (historicalType) and are shown as \"Checkable claim\".",
    exportedAt: new Date().toISOString(),
    generator: "deflate-lens local app",
    statusMeaning: STATUS_MEANING,
    relationMeaning: RELATION_MEANING,
    verify: "run `node scripts/verify-export.js <this file> <transcript.txt>` to check that run.transcript.sha256 is the SHA-256 of that file's text and which passages were read from exactly that text",
    run: {
      id: r.id, title: r.title, kind: r.kind || "transcript", parseMode: r.parseMode || "transcript", example: !!r.example, copiedFrom: r.copiedFrom || "", import: r.import || null, importHistory: r.importHistory || [],
      sourceIdentity: b.sourceIdentity || sourceIdentity(r), sourceConfirmationHistory: r.sourceConfirmationHistory || [], attributionGate: b.attributionGate || Q.attributionGate(b),
      source: { url: r.sourceUrl || "", label: r.sourceLabel || "", date: r.sourceDate || "" },
      transcript: { updatedAt: r.transcriptUpdatedAt || "", characters: (b.transcript || "").length, sha256: r.input && r.input.sha256 || "", bytes: r.input && r.input.bytes || null, parseMode: r.input && r.input.parseMode || r.parseMode || "transcript", earlierVersions: (r.inputHistory || []).map(x => ({ sha256: x.sha256, chars: x.chars, transcriptUpdatedAt: x.transcriptUpdatedAt, replacedAt: x.replacedAt })) },
      provenance: { confirmedAt: pr.confirmedAt || "", confirmedBy: pr.confirmedBy || "", notApplicable: !!pr.notApplicable, labelsOrigin: pr.labelsOrigin || "source", assignment: pr.assignment || null, structure: pr.structure || null, voices: pr.voices || null, identification: pr.identification || null, namesByPerson: pr.namesByPerson || {}, namesConfirmedAt: pr.namesConfirmedAt || "", namesChangedAt: pr.namesChangedAt || "", method: pr.method || "", attrSig: b.attrSig, transcriptNote: pr.transcriptNote || "",
        preparation: r.preparation || null,
        corrected: Object.keys(pr.overrides || {}).map(i => ({ turn: Number(i), speaker: pr.overrides[i] })), flagged: (pr.flags || []).map(f => f.turn), earlierDecisions: (r.provenanceHistory || []).length },
      speakersMeaning: "name is what the app shows for the label (key). namedBy: identification (the app connected the name to the voice from the conversation and the episode's listing; how says with which words), person (a person gave it), transcript (the label is the name), words (named when the speakers were worked out from the words), unnamed (no name was found; how says why), set_apart (a clip, a quotation read aloud or an advertisement), earlier (named before names were recorded with their evidence).",
      speakers: [...new Set((r.speakers || []).map(s => s.key).concat(used))].map(k => { const a = shared.speakerAccount(r, k), s = (r.speakers || []).find(x => x.key === k) || {}; return { key: k, name: a.name, bio: s.bio || "", namedBy: a.by, how: a.text, inText: used.includes(k) }; }),
      orphans: (r.orphans || []).map(o => ({ id: o.id, claimText: o.claimText, from: o.from, receipts: (o.receipts || []).length, searches: (o.searches || []).length, rejections: (o.rejections || []).length, parkedAt: o.parkedAt })),
    },
    passagesHeld: b.passages.filter(p => p.readingGate && p.readingGate.status === "held").map(p => ({ id: p.id, title: p.title, turnStart: p.turnStart, turnEnd: p.turnEnd, reasons: p.readingGate.reasons || [], attempt: p.held || null,
      source: heldSource(b, p), attempts: b.attempts && b.attempts[p.id] || [] })),
    passages: done.map(p => ({ id: p.id, title: p.title, held: p.held || null, turnStart: p.turnStart, turnEnd: p.turnEnd, speakers: p.speakers || [], analyzedAt: p.analyzedAt || "", analyzedBy: p.analyzedBy || "", model: p.model || "", stale: p.stale || [], rev: p.rev || 0, readingRev: p.readingRev || 0, earlierReadings: (p.history || []).length,
      basedOn: { inputHash: p.basedOn && p.basedOn.inputHash || "", attrSig: p.basedOn && p.basedOn.attrSig || "", transcriptUpdatedAt: p.basedOn && p.basedOn.transcriptUpdatedAt || "" },
      provenance: p.provenance || null, readingGate: p.readingGate || null, levels: p.analysis.levels || null, attempts: b.attempts && b.attempts[p.id] || [],
      quoteCheck: p.quoteCheck || null,
      speakerNames: (p.speakers || []).map(k => speakerName(k, r)),
      quotes: (p.analysis.asSaid || []).map(q => ({ turn: q.turn, matchedTurn: q.matchedTurn == null ? null : q.matchedTurn, relocated: !!q.relocated, speakerClaimed: q.speaker, speakerNow: q.speakerNow || "", speaker: speakerName(q.speakerNow || q.speaker, r), speakerMismatch: !!q.speakerMismatch, quote: q.quote, verbatim: !!q.verbatim, tolerated: q.tolerated || [], turnOk: q.turnOk !== false, foundIn: q.foundIn || [] })),
      judgments: p.analysis.judgments, fidelity: p.analysis.fidelity.grade, jump: { present: p.analysis.jump.present, pivot: p.analysis.jump.pivot || "", pivotVerbatim: p.analysis.jump.pivotVerbatim, survives: p.analysis.revision.jumpSurvives || "" } })),
    patterns: (b.summary && b.summary.patterns || []).map(x => ({ title: x.title.hs, passages: x.passages })),
    patternsGate: b.summary && b.summary.readingGate || null,
    claims,
  };
}

/* Markdown at one reading level ("hs" or "g5"), in the order the page shows a card: In plain words, A fair reading, What
   follows; then the claims, the words as said and the reasoning record. Quotes are exact at both levels; only generated
   explanations change. Held, stale and unfinished material is named as such, never presented as a finished reading. */
function sourceLines(b) {
  const idn = b.sourceIdentity || sourceIdentity(b.run), m = idn.match || {}, out = [];
  const dur = x => x ? Math.floor(x / 60) + " min " + String(Math.round(x % 60)).padStart(2, "0") + " s" : "length not recorded";
  if (idn.state === "needs_confirmation" || idn.state === "confirmed") {
    out.push("**Source identity.** " + (m.method === "title-lookup" ? "The episode was matched by its title" : "The video was matched by title and length") + (idn.state === "confirmed" ? "; a person at this computer said on " + String(idn.confirmation.at).slice(0, 10) + " that it is the intended episode (their statement about the match, not a check of the transcript)." : "; no person has confirmed that it is the intended episode.") + (idn.legacy ? " (Saved before the comparison was recorded.)" : ""));
    if (m.episode) out.push("- Intended episode: " + (m.episode.title || "?") + (m.episode.durationSeconds ? " (" + dur(m.episode.durationSeconds) + ")" : ""));
    if (m.video) out.push("- Selected video: " + (m.video.title || "?") + " — " + (m.video.channel || "channel not recorded") + " (" + dur(m.video.durationSeconds) + ") " + (m.video.url || ""));
    if (m.toleranceSeconds) out.push("- Matching rule: the episode's whole title, and a length within " + m.toleranceSeconds + " s (the larger of 120 s and 5% of the episode).");
  } else if (idn.state === "not_recorded") out.push("_How this source was identified was not recorded (saved before 0.12)._");
  return out;
}
const why = reasons => [...new Set((reasons || []).map(x => shared.issueText(String(x)).replace(/[.\s]+$/, "")).filter(Boolean))].join("; ");
function buildMarkdown(b, level) {
  const L = level === "g5" ? "g5" : "hs";
  const T = x => (x && typeof x === "object") ? (x[L] || x.hs || "") : String(x || "");
  const r = b.run, out = [], bare = allUnlabeled(b);
  out.push("# " + (r.title || "Reading") + (L === "g5" ? " (fifth-grade reading level)" : "") + "\n");
  if (r.kind === "claim") out.push("_A claim supplied by a person, not taken from a transcript._\n");
  if (r.sourceUrl) out.push("Source: " + (r.sourceLabel || "") + " " + r.sourceUrl + "\n");
  const src = sourceLines(b); if (src.length) out.push(src.join("\n") + "\n");
  const sn = speakerNote(b); if (sn) out.push(sn + "\n");
  const who = whoLines(b); if (who.length) out.push("**Who is speaking.**\n" + who.join("\n") + "\n");
  if (r.example) out.push("_Supplied example. Analysis written in chat by Claude, corrected after a second-reader review; attribution not confirmed by a person._\n");
  if (b.passages.some(p => /MOCK/i.test(p.analyzedBy || ""))) out.push("_MOCK OUTPUT: these readings are placeholders from the test responder, not a model's reading._\n");
  const ready = b.passages.filter(p => p.readingGate && p.readingGate.status === "ready");
  if (ready.length !== b.passages.length) out.push("_This export has " + ready.length + " of " + b.passages.length + " readings. The others couldn't be completed, are out of date or are not read yet, and are listed as such below._\n");
  out.push("_A separate pass of the same model reviewed each reading before display; that is not independent validation. Quotes are checked against the saved transcript; a match that needs numbers written differently is marked. A source attached to a claim records a person's judgment of relevance, and [supports] / [contradicts] / [mentions] is what that person said the document does; none of this makes a claim verified._" + (r.input && r.input.sha256 ? " _Transcript sha256: " + r.input.sha256 + "._" : "") + "\n");
  b.passages.forEach((p, n) => {
    const where = b.passages.length > 1 ? " (" + (n + 1) + " of " + b.passages.length + ")" : "";
    if (!p.analysis || p.status !== "done") {
      out.push("## " + p.title + where + "\n\n" + (p.readingGate && p.readingGate.status === "held" ? "**This reading couldn't be completed.** Why: " + (why(p.readingGate.reasons) || "it did not pass its checks") + "." : "Not read yet.") + "\n");
      return;
    }
    if (p.readingGate && p.readingGate.status !== "ready") { out.push("## " + p.title + where + "\n\n" + ((p.stale || []).length ? "**Out of date, not shown.**" : "**Not shown.**") + " Why: " + (why(p.readingGate.reasons) || "it did not pass its checks") + ".\n"); return; }
    // the passage's speakers, as the page's card lists them (older passages without the list: the speakers quoted)
    const a = p.analysis, qc = p.quoteCheck, speakers = bare ? [] : [...new Set(((p.speakers || []).length ? p.speakers : (a.asSaid || []).map(q => q.speakerNow || q.speaker)).map(k => speakerName(k, r)).filter(x => x !== "Speaker not established"))];
    // only the fifth-grade wording failed: the high-school reading stands in at both levels
    const g5Withheld = a.levels && a.levels.g5 === "withheld";
    const T = x => (x && typeof x === "object") ? ((g5Withheld ? x.hs : x[L]) || x.hs || "") : String(x || "");
    out.push("## " + p.title + where + "\n");
    if (speakers.length) out.push("_" + speakers.join(", ") + (r.provenance && r.provenance.labelsOrigin === "model" ? " (names suggested by AI from the words)" : "") + "_\n");
    if (p.held && p.held.kept) out.push("_A new reading of this passage was requested and couldn't be completed; this is the earlier reading._\n");
    if (g5Withheld && L === "g5") out.push("_The fifth-grade wording couldn't be completed, so this passage is shown at the high-school level._\n");
    out.push("**In plain words.** " + T(a.deflated) + "\n");
    if (r.kind !== "claim") {
      if (a.defense.hs) out.push("**A fair reading.** " + T(a.defense) + "\n");
      if (a.revision.hs) out.push("**What follows.** " + T({ hs: a.revision.hs, g5: a.revision.g5 }) + "\n");
    }
    out.push("**Claims.**");
    (a.claims || []).forEach(c => {
      const rc = activeReceipts(c), settle = (c.settle && T(c.settle)) || c.wouldSettle || "", empirical = shared.EMPIRICAL_TYPES.includes(c.type), was = shared.historicalType(c.type);
      const contra = rc.filter(x => x.relation === "contradicts").length;
      out.push("- " + shared.claimTypeLabel(c.type) + (was ? " (an earlier model labelled it “" + was + "”)" : "") + (c.speaker && !bare && r.kind !== "claim" ? " — " + speakerName(c.speaker, r) : "") + ": " + c.text + (c.plain && T(c.plain) ? " — in plain words: " + T(c.plain) : "") + (T(c.basis) ? " — " + T(c.basis) : "") + (settle ? " · what would check it: " + settle : "") +
        (empirical ? " · " + ({ receipt: "sources attached by a person: " + rc.length + " (" + relationPhrase(rc) + ")", searched: "searched; no source attached", unchecked: "not checked" })[claimStatus(c)] : "") +
        (contra ? " · a person recorded " + contra + " source" + (contra > 1 ? "s" : "") + " as contradicting this claim" : "") +
        (rc.length ? " (" + rc.map(x => x.url + (x.relation && x.relation !== "unstated" ? " [" + x.relation + "]" : "")).join(" ") + ")" : ""));
    });
    if ((a.asSaid || []).length) {
      out.push("\n**The words as said.**");
      a.asSaid.forEach(q => out.push("> " + (bare ? "" : speakerName(q.speakerNow || q.speaker, r) + ": ") + "“" + q.quote + "”" + (q.verbatim ? ((q.tolerated || []).length ? " (matched, numbers written differently)" : "") : " (not found word for word)") + (q.speakerMismatch ? " (the model labelled this " + speakerName(q.speaker, r) + ")" : "")));
    }
    if (r.kind !== "claim") {
      const outcome = a.jump.present ? ({ yes: "After the fair reading, the concern stands.", partly: "After the fair reading, the concern partly stands; “What follows” says what remains.", no: "After the fair reading, the concern was withdrawn." })[a.revision.jumpSurvives] || "" : "";
      out.push("\n**Reasoning behind this reading.** " + (a.jump.present ? "Initial concern: " + T({ hs: a.jump.hs, g5: a.jump.g5 }) + (a.jump.pivot ? " Where it turns: “" + a.jump.pivot + "”" + (a.jump.pivotVerbatim === false ? " (not found word for word)" : (a.jump.pivotTolerated || []).length ? " (matched, numbers written differently)" : "") + "." : "") + " " + outcome : "No concern was raised. " + T({ hs: a.jump.hs, g5: a.jump.g5 })));
    }
    const ctx = p.provenance && p.provenance.context;
    out.push("\n_Record: rewrite check " + (a.fidelity.grade || "unrated") + (qc ? " · quotes matched " + qc.matched + "/" + qc.quotes : "") + " · turns " + p.turnStart + "–" + p.turnEnd + (ctx ? " · context turns " + (ctx.before.concat(ctx.after).map(x => x.turn).join(", ") || "none") + (ctx.omitted && ctx.omitted.length ? " (omitted: " + ctx.omitted.map(x => x.turn).join(", ") + ")" : "") : "") + (p.analyzedBy ? " · by " + p.analyzedBy : "") + (p.provenance && p.provenance.recorded ? " · model call " + (p.provenance.requestId || p.provenance.callId) + (p.provenance.modelReturned ? " (" + p.provenance.modelReturned + ")" : "") : "") + (p.provenance && p.provenance.contract ? " · " + p.provenance.contract : "") + (p.basedOn && p.basedOn.inputHash ? " · read from text sha256:" + p.basedOn.inputHash.slice(0, 12) + "…" : "") + ((p.stale || []).length ? " · OUT OF DATE: " + p.stale.join("; ") : "") + "_\n");
  });
  if (b.summary && (!b.summary.readingGate || b.summary.readingGate.status === "ready")) {
    out.push("## Across this reading\n");
    (b.summary.patterns || []).forEach((x, i) => out.push((i + 1) + ". **" + T(x.title) + "** " + T(x.body) + (x.passages.length ? " (" + x.passages.map(id => { const i2 = b.passages.findIndex(q => q.id === id); return i2 < 0 ? id : "passage " + (i2 + 1); }).join(", ") + ")" : "")));
    if (!(b.summary.patterns || []).length) out.push("No recurring concern across the final assessments.");
    out.push("\n" + T(b.summary.survived) + "\n");
  } else if (b.summary) out.push("## Across this reading\n\nThe closing overview is held or out of date and is not shown.\n");
  return out.join("\n");
}

/* Receipts-compatible obligations for every empirical claim. Shape: src/surfacing/obligations.py EvidenceObligation.to_json. */
function buildObligations(b) {
  const { obligationFor } = require("./research/index");
  const { EMPIRICAL_TYPES } = require("./research/types");
  const obligations = [];
  b.passages.forEach(p => { if (p.status !== "done" || !p.analysis) return; const prov = provisionalFor(b, p); (p.analysis.claims || []).forEach((c, i) => { if (!EMPIRICAL_TYPES.includes(c.type)) return; obligations.push(Object.assign(obligationFor(b.run, p, c, i), { claim_type: c.type, claim_id: c.id || "", speaker: c.speaker || "", speaker_name: c.speaker ? speakerName(c.speaker, b.run) : "", passage: p.id, reading_rev: p.readingRev || 0, status: claimStatus(c), stale: p.stale || [], provisional: prov.length > 0, provisional_reasons: prov })); }); });
  return { schema: "deflate-lens/obligations@0.2", compatible_with: "Receipts src/surfacing/obligations.py EvidenceObligation.to_json", exportedAt: new Date().toISOString(), statusMeaning: STATUS_MEANING, run: { id: b.run.id, title: b.run.title, source: { url: b.run.sourceUrl || "", label: b.run.sourceLabel || "", date: b.run.sourceDate || "" }, attributionConfirmed: !!(b.run.provenance && b.run.provenance.confirmedAt) }, obligations };
}

module.exports = { buildExport, buildMarkdown, buildObligations, claimStatus, activeReceipts, relationCounts, STATUS_MEANING };
