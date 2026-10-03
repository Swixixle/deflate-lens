"use strict";
/* Server-side validation. Every document a client can save passes through here, so a malformed save is refused
   with a plain message instead of being written. The page produces valid documents; this is for everything else. */
const shared = require("../shared/transcript");
const { SOURCE_TYPES, RELATIONS } = require("./research/types");

function bad(msg) { const e = new Error(msg); e.status = 400; e.code = "invalid"; return e; }
const STATUSES = ["draft", "attributed", "segmented", "analyzed", "complete"];
const KINDS = ["transcript", "claim"];
const PARSE_MODES = ["transcript", "text"];
const isUrl = u => /^https?:\/\/\S+$/i.test(String(u));
const str = (x, n) => String(x == null ? "" : x).slice(0, n);

/* Fields a client may set on a run. Anything else on the incoming document is ignored. */
function validateRunDoc(doc, ctx) {
  doc = doc && typeof doc === "object" ? doc : {};
  const out = {};
  if ("title" in doc) out.title = str(doc.title, 200).trim() || "Untitled run";
  if ("sourceUrl" in doc) { const u = str(doc.sourceUrl, 2000).trim(); if (u && !isUrl(u)) throw bad("sourceUrl must be an http(s) link or empty"); out.sourceUrl = u; }
  if ("sourceLabel" in doc) out.sourceLabel = str(doc.sourceLabel, 300).trim();
  if ("sourceDate" in doc) { const d = str(doc.sourceDate, 10).trim(); if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw bad("sourceDate must be YYYY-MM-DD or empty"); out.sourceDate = d; }
  if ("speakers" in doc) {
    if (!Array.isArray(doc.speakers)) throw bad("speakers must be a list");
    out.speakers = doc.speakers.slice(0, 40).map(s => { s = s && typeof s === "object" ? s : {}; const key = str(s.key, 40).trim().toUpperCase(); if (!key) throw bad("every speaker needs a key"); return { key, name: str(s.name, 80).trim() || key, bio: str(s.bio, 600).trim() }; });
  }
  if ("status" in doc) { if (!STATUSES.includes(doc.status)) throw bad("status must be one of " + STATUSES.join(", ")); out.status = doc.status; }
  if ("kind" in doc) { if (!KINDS.includes(doc.kind)) throw bad("kind must be transcript or claim"); out.kind = doc.kind; }
  if ("parseMode" in doc) { if (!PARSE_MODES.includes(doc.parseMode)) throw bad("parseMode must be transcript or text"); out.parseMode = doc.parseMode; }
  if ("pilotNote" in doc) out.pilotNote = str(doc.pilotNote, 2000);
  if ("import" in doc) { const i = doc.import && typeof doc.import === "object" ? doc.import : null; out.import = i ? { url: str(i.url, 2000), title: str(i.title, 300), fetchedAt: str(i.fetchedAt, 40), chars: Number(i.chars) || 0, method: str(i.method, 40) } : null; }
  if ("provenance" in doc) out.provenance = validateProvenance(doc.provenance, ctx);
  return out;
}

function validateProvenance(pr, ctx) {
  pr = pr && typeof pr === "object" ? pr : {};
  const turns = ctx && ctx.turns || null;
  const labels = turns ? shared.speakerLabels(turns) : null;
  const known = new Set((labels || []).concat((ctx && ctx.speakerKeys) || []));
  const out = { overrides: {}, flags: [], notes: str(pr.notes, 2000), method: str(pr.method, 500), labelsFound: labels || (Array.isArray(pr.labelsFound) ? pr.labelsFound.map(String).slice(0, 40) : []) };
  const ov = pr.overrides && typeof pr.overrides === "object" ? pr.overrides : {};
  for (const k of Object.keys(ov)) {
    if (!/^\d+$/.test(k)) throw bad("override keys are turn numbers");
    const i = Number(k); if (turns && (!turns[i] || turns[i].heading)) throw bad("override for turn " + k + ": no such speaking turn");
    const v = str(ov[k], 40).trim().toUpperCase(); if (!v) throw bad("override for turn " + k + " names no speaker");
    if (known.size && !known.has(v)) throw bad("override for turn " + k + " names an unknown speaker " + v);
    out.overrides[k] = v;
  }
  if (Array.isArray(pr.flags)) out.flags = pr.flags.slice(0, 500).map(f => { f = f && typeof f === "object" ? f : {}; const t = Number(f.turn); if (!Number.isInteger(t) || t < 0) throw bad("flag without a turn number"); return { turn: t, labeled: str(f.labeled, 40), likely: str(f.likely, 40), confidence: typeof f.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : null, cue: str(f.cue, 200) }; });
  for (const k of ["auditedAt", "auditedBy", "confirmedAt", "confirmedBy", "shiftNote", "transcriptNote"]) if (pr[k]) out[k] = str(pr[k], 500);
  if (pr.notApplicable) { out.notApplicable = true; }
  return out;
}

/* A passage as a client may save it. turnsCount bounds the range. ctx.kind ("transcript" | "claim") decides what a
   finished reading must contain: normalising a document (the sanitiser) is not the same as accepting it as done. */
function validatePassageDoc(doc, turnsCount, ctx) {
  ctx = ctx || {};
  doc = doc && typeof doc === "object" ? doc : {};
  const a = Number(doc.turnStart), z = Number(doc.turnEnd);
  if (!Number.isInteger(a) || !Number.isInteger(z) || a < 0 || z < a) throw bad("turnStart and turnEnd must be whole numbers with turnStart <= turnEnd");
  if (Number.isInteger(turnsCount) && z >= turnsCount) throw bad("turnEnd " + z + " is past the last turn (" + (turnsCount - 1) + ")");
  const out = { title: str(doc.title, 200).trim() || ("Turns " + a + "–" + z), turnStart: a, turnEnd: z, stake: str(doc.stake, 300), speakers: Array.isArray(doc.speakers) ? doc.speakers.map(s => str(s, 40)).slice(0, 40) : [],
    status: ["pending", "running", "done", "error"].includes(doc.status) ? doc.status : "pending" };
  for (const k of ["order", "createdAt", "analyzedAt", "analyzedBy", "model", "segmentedBy", "error", "copiedFrom", "savedAt", "callId"]) if (doc[k] != null) out[k] = k === "order" ? Number(doc[k]) || 0 : str(doc[k], 300);
  // `provenance` is never taken from a client: the server fills it from its own record of the call named by callId
  if (doc.usage && typeof doc.usage === "object") out.usage = doc.usage;
  if (doc.basedOn && typeof doc.basedOn === "object") out.basedOn = { transcriptUpdatedAt: str(doc.basedOn.transcriptUpdatedAt, 40), attrSig: str(doc.basedOn.attrSig, 40) };
  if (doc.analysis && typeof doc.analysis === "object") out.analysis = shared.sanitizeAnalysis(doc.analysis, { sourceTypes: SOURCE_TYPES });
  if (Array.isArray(doc.history)) out.history = doc.history;
  if (Array.isArray(doc.adopted)) out.adopted = doc.adopted;
  if (doc.rerun && typeof doc.rerun === "object") out.rerun = doc.rerun;
  if (out.status === "done") {
    if (!out.analysis) throw bad("a passage marked done needs an analysis");
    const a = out.analysis, missing = [];
    if (ctx.kind === "claim") {
      if (a.claims.length !== 1 || !a.claims[0].text) missing.push("exactly one claim with text");
    } else {
      if (!a.deflated.hs) missing.push("a plain-words rewrite (deflated.hs)");
      if (!a.claims.length) missing.push("at least one claim (any type)");
      if (!a.asSaid.length && a.by !== "person") missing.push("at least one quote from the passage (asSaid)");
    }
    if (missing.length) throw bad("a finished reading needs " + missing.join(", ") + "; this one has " + (a.claims.length) + " claim(s), " + a.asSaid.length + " quote(s)" + (a.deflated.hs ? "" : " and no rewrite") + ". It was not saved as done.");
  }
  return out;
}

function validateSummary(doc) {
  doc = doc && typeof doc === "object" ? doc : {};
  const lv = x => { x = x && typeof x === "object" ? x : { hs: String(x || ""), g5: "" }; return { hs: str(x.hs, 4000), g5: str(x.g5, 4000) }; };
  const out = {
    patterns: (Array.isArray(doc.patterns) ? doc.patterns : []).slice(0, 12).map(p => { p = p && typeof p === "object" ? p : {}; return { title: lv(p.title), body: lv(p.body), passages: (Array.isArray(p.passages) ? p.passages : []).map(String).filter(x => /^p\d{3}$/.test(x)).slice(0, 60) }; }),
    survived: lv(doc.survived),
    basedOn: doc.basedOn && typeof doc.basedOn === "object" ? { passagesSig: str(doc.basedOn.passagesSig, 4000), transcriptUpdatedAt: str(doc.basedOn.transcriptUpdatedAt, 40), attrSig: str(doc.basedOn.attrSig, 40) } : { passagesSig: "", transcriptUpdatedAt: "", attrSig: "" },
  };
  for (const k of ["createdAt", "by", "model", "note", "copiedFrom", "callId"]) if (doc[k] != null) out[k] = str(doc[k], 500);
  if (doc.passagesCounted != null) out.passagesCounted = Number(doc.passagesCounted) || 0;
  if (Array.isArray(doc.leftOut)) out.leftOut = doc.leftOut.map(String).slice(0, 60);
  return out;
}

/* Records a person makes on a claim; shapes checked where the client can supply them. */
function validateReceiptLink(url, note, relation) {
  const u = str(url, 2000).trim(); if (!isUrl(u)) throw bad("a source needs an http(s) link");
  const at = new Date().toISOString();
  return Object.assign({ kind: "link", url: u, note: str(note, 500).trim(), addedBy: "person at this computer", at }, relationFields(relation, at));
}
/* What the attaching person says the document does for the claim. Anything outside the closed set is "unstated". */
function validateRelation(relation) { const r = str(relation, 20).trim().toLowerCase(); return RELATIONS.includes(r) ? r : "unstated"; }
function relationFields(relation, at) { const r = validateRelation(relation); return r === "unstated" ? { relation: "unstated" } : { relation: r, relationBy: "person at this computer", relationAt: at || new Date().toISOString() }; }
function validateRouting(body) {
  body = body && typeof body === "object" ? body : {};
  const out = {};
  if ("searchQuery" in body) out.searchQuery = str(body.searchQuery, 160).trim();
  if ("expectedSources" in body) { if (!Array.isArray(body.expectedSources)) throw bad("expectedSources must be a list"); out.expectedSources = body.expectedSources.map(String).filter(t => SOURCE_TYPES.includes(t)).slice(0, 3); if (body.expectedSources.length && !out.expectedSources.length) throw bad("expectedSources must use the known source types"); }
  return out;
}

module.exports = { validateRunDoc, validateProvenance, validatePassageDoc, validateSummary, validateReceiptLink, validateRelation, relationFields, validateRouting, bad, STATUSES, KINDS, PARSE_MODES };
