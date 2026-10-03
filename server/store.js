"use strict";
/* File-backed storage. Everything lives under DATA_DIR (default ./data):
     runs/<id>/run.json              the run: title, source, speakers, provenance, timestamps
     runs/<id>/transcript.txt        the transcript exactly as saved
     runs/<id>/passages/<pid>.json   one passage with its analysis
     runs/<id>/summary.json          cross-passage patterns
     runs/<id>/attachments.json      index of uploaded pictures
     runs/<id>/attachments/<aid>     the picture bytes
     runs/<id>/archive/<stamp>/      passages and summaries replaced by a re-segment (never deleted)
     trash/<id>-<stamp>/             runs deleted in the app (moved here, never removed by the app)
   Writes are atomic (temp file + rename). Back up by copying the whole data directory.

   Evidence rules enforced here, not in the page: a saved passage never loses a person's receipts, search records,
   candidate decisions or rejections (savePassage merges them back in); a new reading of a passage keeps the old one in
   `history` and carries those records to the claim with the same text; a re-segment parks records from the passages it
   archives on the run as `orphans` until a matching claim appears or a person reattaches them; a transcript edit keeps the
   attribution decisions when the turn structure is unchanged and otherwise archives them in `provenanceHistory`;
   deleting a run moves it to trash. Quote checks are recomputed on every read against the transcript as stored.

   Input record (0.8.0): the server hashes the transcript as saved (`run.input.sha256`) and stamps every reading and
   summary with the hash of the text it was made from (`basedOn.inputHash`), looked up from the version the client names,
   never taken from the client. Staleness is then a comparison of hashes, so an edit that is undone makes the cards fresh
   again, and an export can be checked against a transcript file by anyone holding both. Model calls are recorded by the
   server in calls.jsonl; a reading names its call by id and the server fills `provenance` from that record. Nothing the
   app writes may contain an API key (leak scan on every write). */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const shared = require("../shared/transcript");
const V = require("./validate");
const T = require("./research/types");

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function assertId(id, what) { if (!ID_RE.test(String(id || ""))) { const e = new Error("invalid " + (what || "id")); e.status = 400; throw e; } }
function nowISO() { return new Date().toISOString(); }
function newId(prefix) { return (prefix || "r") + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"); }
function sha256(s) { return crypto.createHash("sha256").update(String(s == null ? "" : s), "utf8").digest("hex"); }
/* The server-owned record of the exact input a run holds: a SHA-256 of the transcript text as stored (UTF-8, no
   normalisation, so a changed line ending is a changed input), its size, the parse mode it is read under, and when the
   record was made. Readings are bound to this hash; the export carries it; scripts/verify-export.js recomputes it. */
function inputRecord(text, parseMode, at) { const t = String(text == null ? "" : text); return { sha256: sha256(t), chars: t.length, bytes: Buffer.byteLength(t, "utf8"), parseMode: parseMode === "text" ? "text" : "transcript", recordedAt: at || nowISO() }; }
/* The fields of a call record a reading keeps. */
function provenanceOf(call) { const keep = {}; ["callId", "at", "purpose", "runId", "provider", "modelRequested", "modelReturned", "requestId", "stopReason", "usage", "latencyMs", "promptHash", "promptChars", "outputHash", "images", "mock", "error", "basedOn"].forEach(k => { if (call[k] !== undefined) keep[k] = call[k]; }); keep.recorded = true; return keep; }

function unknownBasis() { return { transcriptUpdatedAt: "", inputHash: "", attrSig: "", origin: "unknown" }; }
function passagesSignature(passages) { return passages.filter(p => p.status === "done").map(p => p.id + "@" + (p.analyzedAt || "")).join(","); }
/* Claim ids name an unchanged speaker and sentence. A client cannot recycle an old id for new wording. */
function assignClaimIds(analysis, previous) {
  const available = new Map(), used = new Set();
  (previous && previous.claims || []).forEach(c => { const key = shared.claimKey(c); if (!available.has(key)) available.set(key, []); available.get(key).push(c); });
  (analysis && analysis.claims || []).forEach(c => {
    const choices = available.get(shared.claimKey(c)) || [];
    const old = choices.find(o => o.id === c.id && !used.has(o.id)) || choices.find(o => !used.has(o.id));
    c.id = old && old.id ? old.id : newId("c"); used.add(c.id);
  });
}

/* Nothing written to the data folder may carry a key. Orchestrator's leak scan, reduced to the one key shape this app
   handles; a transcript or note that happens to contain one is refused rather than stored. */
const KEY_SHAPE = /sk-ant-[A-Za-z0-9_-]{20,}/;
function leakScan(data) {
  const hit = typeof data === "string" ? KEY_SHAPE.test(data) : (Buffer.isBuffer(data) && data.includes("sk-ant-") && KEY_SHAPE.test(data.toString("latin1")));
  if (hit) { const e = new Error("refused: the document contains something shaped like an API key; remove it and save again"); e.status = 400; e.code = "key_in_document"; throw e; }
}
function redactKeys(s) { return String(s == null ? "" : s).replace(/sk-ant-[A-Za-z0-9_-]{20,}/g, "sk-ant-[redacted]"); }
async function writeAtomic(file, data) {
  leakScan(data);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp-" + process.pid + "-" + Date.now();
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}
async function readJSON(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}
async function exists(p) { try { await fsp.access(p); return true; } catch (e) { return false; } }

/* ---- run and claim helpers ---- */
function autoTitle(text, kind) {
  const firstLine = (String(text || "").split(/\r?\n/).map(l => l.trim()).find(l => l) || "");
  const t = firstLine.replace(/\s+/g, " ").trim().replace(/^["“'‘]+|["”'’]+$/g, "");
  if (!t) return kind === "claim" ? "Untitled claim" : "Untitled run";
  const first = t.split(/(?<=[.?!])\s/)[0] || t;
  const words = first.split(" ").slice(0, 12).join(" ");
  return (words.length < first.length ? words + "…" : words).replace(/^[A-Z][A-Za-z0-9 .'\-]{0,40}?:\s+/, "").slice(0, 120) || "Untitled run";
}
function attributionNote(labels, kind) {
  const speaking = labels.filter(l => l !== "UNLABELED");
  if (kind === "claim") return { notApplicable: true, method: "A claim supplied by a person; there is nothing to attribute." };
  if (speaking.length === 0) return { notApplicable: true, method: "No speaker labels in the text; every turn is shown as Speaker unknown. Nothing to confirm." };
  if (speaking.length === 1) return { notApplicable: true, method: "One speaker label (" + speaking[0] + ") in the text; nothing can be mis-assigned, so there is nothing to confirm." };
  return {};
}
/* Every claim gets a stable id the first time it is saved; records and exports point at it, so a re-run that
   reorders claims or a reading-level change never moves evidence. Older files get a deterministic id from
   their position until they are next saved. */
function ensureClaimIds(p, persistent) {
  (p.analysis && p.analysis.claims || []).forEach((c, i) => { if (!c.id) c.id = persistent ? newId("c") : (p.id + "-c" + (i + 1)); });
  return p;
}
/* Receipts get a stable id too (withdrawal is addressed by it). Older files get one derived from position. */
function ensureReceiptIds(p) {
  (p.analysis && p.analysis.claims || []).forEach(c => { const seen = new Set(); (c.receipts || []).forEach((r, i) => { if (!r.rid) r.rid = r.candidateId ? "rc_" + r.candidateId : (c.id || "c") + "-r" + (i + 1); let rid = r.rid, n = 1; while (seen.has(rid)) rid = r.rid + "_" + (++n); r.rid = rid; seen.add(rid); }); });
  return p;
}
/* The canonical text of a claim run's one claim: the input, trimmed of surrounding quotation marks. */
function canonicalClaimText(text) { return String(text || "").replace(/\s+/g, " ").trim().replace(/^["“'‘]+|["”'’]+$/g, ""); }
/* The single passage of a claim run: the person's text is the claim; routing by heuristics; nothing graded. */
function claimPassage(text, run, now) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const bare = t.replace(/^["“'‘]+|["”'’]+$/g, "");
  return { title: run.title, turnStart: 0, turnEnd: 0, stake: "", speakers: ["UNLABELED"], status: "done", order: 1, createdAt: now, analyzedAt: now, analyzedBy: "person at this computer (typed claim)", model: "", rev: 1, readingRev: 1,
    basedOn: { transcriptUpdatedAt: now, attrSig: shared.attrSig({}) },
    analysis: { by: "person", asSaid: [], deflated: { hs: bare, g5: bare }, fidelity: { grade: "unrated", notes: { hs: "", g5: "" } }, jump: { present: false, pivot: "", hs: "", g5: "" }, defense: { hs: "", g5: "" }, revision: { jumpSurvives: "", hs: "", g5: "" },
      claims: [{ id: newId("c"), text: bare, speaker: "", type: "claim", userSupplied: true, basis: { hs: "", g5: "" }, status: "unchecked", wouldSettle: "", expectedSources: T.guessSourceTypes(bare, ""), searchQuery: T.compileQuery(bare, ""), receipts: [], searches: [], candidates: [], rejections: [] }],
      judgments: { evidence: "n/a", inference: "n/a" } } };
}

/* ---- record helpers (person-made records on claims) ---- */
const RECORD_KEYS = ["receipts", "searches", "candidates", "rejections"];
function hasRecords(c) { return RECORD_KEYS.some(k => Array.isArray(c[k]) && c[k].length); }
function recordKey(kind, x) {
  if (kind === "receipts") return x.candidateId ? "cand:" + x.candidateId : (x.rid ? "rid:" + x.rid : [x.url || "", x.at || ""].join("|"));
  if (kind === "searches") return [x.adapter || "", x.field || "", x.query || "", x.at || ""].join("|");
  if (kind === "candidates") return x.id || [x.doi || "", x.title || ""].join("|");
  return [x.candidateId || "", x.url || "", x.at || ""].join("|");
}
/* Union of records on disk and records in the incoming claim, keyed by identity. A record that is on disk wins whole:
   decisions, withdrawals and relations are made through their own routes, so a whole-passage save (the page sends the
   passage it loaded, which may be older than the disk) can neither change nor strip them. A record the disk does not
   have is added, after a shape check: a receipt needs an http(s) link, its relation is kept only from the closed set and
   its relation provenance is the server's to write; a candidate arrives undecided. */
const RID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function sanitizeRecord(kind, x) {
  if (!x || typeof x !== "object") return null;
  if (kind === "receipts") {
    const u = String(x.url || "").trim(); if (!/^https?:\/\/\S+$/i.test(u)) return null;
    const r = Object.assign({}, x, { url: u, note: String(x.note || "").slice(0, 500), addedBy: String(x.addedBy || "person at this computer").slice(0, 120), kind: x.kind === "document" ? "document" : "link", at: String(x.at || nowISO()).slice(0, 40) });
    delete r.relation; delete r.relationBy; delete r.relationAt; delete r.relationHistory; delete r.reattached;
    Object.assign(r, V.relationFields(x.relation, r.at));
    if (r.rid != null && !RID_RE.test(String(r.rid))) delete r.rid;
    return r;
  }
  if (kind === "candidates") { const c = Object.assign({}, x, { status: "candidate" }); delete c.decidedAt; return c; }
  return x;
}
function unionRecords(kind, onDisk, incoming) {
  const out = [], seen = new Set();
  (onDisk || []).forEach(x => { seen.add(recordKey(kind, x)); out.push(x); });
  (incoming || []).forEach(x => { if (!x || typeof x !== "object") return; const k = recordKey(kind, x); if (seen.has(k)) return; const clean = sanitizeRecord(kind, x); if (!clean) return; seen.add(k); out.push(clean); });
  return out;
}
function claimNorm(t) { return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
/* Same reading saved again (a receipt attached, a status flipped): merge records claim by claim. Returns how many
   records on disk were missing from the incoming document and were restored. */
function mergeRecords(curA, nextA) {
  let restored = 0;
  const curClaims = curA.claims || [], nextClaims = nextA.claims || [];
  const byId = new Map(), byKey = new Map(); curClaims.forEach(c => { if (c.id) byId.set(c.id, c); byKey.set(shared.claimKey(c), c); });
  nextClaims.forEach((c, i) => {
    const o = (c.id && byId.get(c.id)) || ((curClaims[i] && shared.claimKey(curClaims[i]) === shared.claimKey(c)) ? curClaims[i] : byKey.get(shared.claimKey(c)));
    if (!o) return;
    if (!c.id && o.id) c.id = o.id; // identity is stable across saves of the same reading
    if (o.routingEditedAt && (!c.routingEditedAt || c.routingEditedAt < o.routingEditedAt)) { c.searchQuery = o.searchQuery; c.expectedSources = o.expectedSources; c.routingEditedAt = o.routingEditedAt; c.routingEditedBy = o.routingEditedBy; }
    RECORD_KEYS.forEach(k => { const before = (c[k] || []).length; c[k] = unionRecords(k, o[k], c[k]); restored += c[k].length - before; });
    if (!c.obligation && o.obligation) c.obligation = o.obligation;
    if (!c.lastSearchedAt && o.lastSearchedAt) c.lastSearchedAt = o.lastSearchedAt;
    c.status = (c.receipts || []).some(r => !r.withdrawnAt) ? "receipt" : ((c.searches || []).length ? "searched" : (c.status || "unchecked"));
  });
  return restored;
}
/* Fields the server computes on every read (verifyPassage); never stored, never part of "did the reading change". */
const COMPUTED_QUOTE = ["verbatim", "turnOk", "speakerNow", "speakerMismatch", "foundIn"], COMPUTED_JUMP = ["pivotVerbatim", "pivotTurns"];
function cleanComputed(a) { if (!a) return a; (a.asSaid || []).forEach(q => COMPUTED_QUOTE.forEach(k => delete q[k])); if (a.jump) COMPUTED_JUMP.forEach(k => delete a.jump[k]); return a; }
/* Key-order-independent JSON, so two documents with the same content compare equal whatever produced them. */
function canonical(x) { if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]"; if (x && typeof x === "object") return "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}"; return JSON.stringify(x === undefined ? null : x); }
function stripRecords(a) { const copy = cleanComputed(JSON.parse(JSON.stringify(a))); delete copy.truncated; (copy.claims || []).forEach(c => { RECORD_KEYS.forEach(k => delete c[k]); delete c.status; delete c.obligation; delete c.lastSearchedAt; delete c.id; delete c.routingEditedAt; delete c.routingEditedBy; delete c.searchQuery; delete c.expectedSources; }); return copy; }
/* New reading: carry records from the old reading to claims with the same text, then union whatever the incoming
   document already carried, so a record added by the client in the same save is never dropped. */
function carryAndMerge(curA, nextA, now) {
  const incoming = (nextA.claims || []).map(c => { const o = {}; RECORD_KEYS.forEach(k => { o[k] = c[k] || []; }); return o; });
  const rerun = shared.carryOver(curA, nextA, now);
  (nextA.claims || []).forEach((c, i) => { RECORD_KEYS.forEach(k => { c[k] = unionRecords(k, c[k], incoming[i][k]); }); c.status = (c.receipts || []).some(r => !r.withdrawnAt) ? "receipt" : ((c.searches || []).length ? "searched" : (c.status || "unchecked")); });
  return rerun; // {carried, orphaned, orphans[], at}
}
function moveRecords(o, c, mark) {
  RECORD_KEYS.forEach(k => { c[k] = unionRecords(k, (o[k] || []).map(x => Object.assign({}, x, { reattached: mark })), c[k]); });
  if (!c.obligation && o.obligation) c.obligation = o.obligation;
  c.status = (c.receipts || []).some(r => !r.withdrawnAt) ? "receipt" : ((c.searches || []).length ? "searched" : (c.status || "unchecked"));
}
function adoptOrphans(orphans, analysis, pid) {
  const adopted = [];
  (analysis.claims || []).forEach(c => {
    const o = orphans.find(x => !adopted.includes(x) && shared.claimKey({ speaker: x.speaker || "", text: x.claimText }) === shared.claimKey(c));
    if (!o) return;
    moveRecords(o, c, { orphanId: o.id, from: o.from, by: "matching claim text on first reading of " + pid, at: nowISO() });
    adopted.push(o);
  });
  return adopted;
}

class Store {
  constructor(dataDir) { this.dataDir = path.resolve(dataDir); this.locks = new Map(); }
  runDir(id) { assertId(id, "run id"); return path.join(this.dataDir, "runs", id); }
  /* Writes to one run are serialised, so two saves that arrive together cannot each read the old file and overwrite
     the other's merge. Reads do not take the lock. */
  withLock(id, fn) {
    const prev = this.locks.get(id) || Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(id, next.catch(() => {}));
    return next;
  }
  /* Turns for a run, parsed under the rules the run was saved with (never changed silently for an existing run). */
  parseFor(run, transcript) { return shared.parseTranscript(transcript, { mode: run && run.parseMode === "text" ? "text" : "transcript" }); }
  async touchRun(id, patch) {
    const cur = await this.getRun(id); if (!cur) return;
    const next = Object.assign({}, cur, patch || {}, { updatedAt: nowISO() }); delete next.id;
    await writeAtomic(path.join(this.runDir(id), "run.json"), JSON.stringify(next, null, 2));
  }
  async init() { await fsp.mkdir(path.join(this.dataDir, "runs"), { recursive: true }); }

  async listRuns() {
    const base = path.join(this.dataDir, "runs");
    let names = [];
    try { names = await fsp.readdir(base); } catch (e) { return []; }
    const out = [];
    for (const name of names) {
      if (!ID_RE.test(name)) continue;
      const run = await readJSON(path.join(base, name, "run.json"), null);
      if (!run) continue;
      const passages = await this.listPassages(name);
      out.push({ id: name, title: run.title, status: run.status, kind: run.kind || "transcript", createdAt: run.createdAt, updatedAt: run.updatedAt, example: !!run.example, passageCount: passages.length, doneCount: passages.filter(p => p.status === "done").length });
    }
    out.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return out;
  }

  async getRun(id) { const r = await readJSON(path.join(this.runDir(id), "run.json"), null); if (r) r.id = id; return r; }
  async getTranscript(id) { try { return await fsp.readFile(path.join(this.runDir(id), "transcript.txt"), "utf8"); } catch (e) { if (e.code === "ENOENT") return ""; throw e; } }
  async getSummary(id) { return readJSON(path.join(this.runDir(id), "summary.json"), null); }
  async listPassages(id) {
    const dir = path.join(this.runDir(id), "passages");
    let names = [];
    try { names = await fsp.readdir(dir); } catch (e) { return []; }
    const out = [];
    for (const n of names) { if (!n.endsWith(".json")) continue; const p = await readJSON(path.join(dir, n), null); if (p) { p.id = n.slice(0, -5); ensureClaimIds(p); ensureReceiptIds(p); if (p.readingRev == null) p.readingRev = p.analysis ? 1 : 0; if (p.rev == null) p.rev = 1; out.push(p); } }
    out.sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
    return out;
  }
  async listAttachments(id) { return readJSON(path.join(this.runDir(id), "attachments.json"), []); }

  /* Everything the page needs for one run, with staleness computed server-side so every client agrees. */
  async bundle(id) {
    const run = await this.getRun(id);
    if (!run) return null;
    const [transcript, passages, summary, attachments] = await Promise.all([this.getTranscript(id), this.listPassages(id), this.getSummary(id), this.listAttachments(id)]);
    const sig = shared.attrSig(run.provenance && run.provenance.overrides);
    const overrides = run.provenance && run.provenance.overrides || {};
    const turns = this.parseFor(run, transcript);
    // runs saved before 0.8.0 have no input record; it is derived from the stored text (and persisted on the next save)
    if (!run.input) run.input = inputRecord(transcript, run.parseMode, run.transcriptUpdatedAt || run.createdAt);
    // text changed = the hash of the text it was made from differs from the hash of the text now (an undone edit is no
    // change); readings from before 0.8.0 carry no hash and fall back to the timestamp rule
    const textChanged = b => b.inputHash ? b.inputHash !== run.input.sha256 : (b.transcriptUpdatedAt !== run.transcriptUpdatedAt);
    passages.forEach(p => {
      p.stale = [];
      if (p.analysis && (!p.basedOn || p.basedOn.origin === "unknown")) p.stale.push("the input used for this analysis is unknown");
      if (p.analysis && p.basedOn) {
        if (textChanged(p.basedOn)) p.stale.push("transcript changed since this analysis");
        if (p.basedOn.attrSig !== sig) p.stale.push("attribution changed since this analysis");
      }
      // quote checks are computed on every read from the transcript as it is now; a client's stored flags are never trusted
      if (p.analysis) p.quoteCheck = shared.verifyPassage(turns, overrides, p);
    });
    if (summary) {
      const cur = passagesSignature(passages.filter(p => !p.stale.length));
      summary.stale = [];
      if (!summary.basedOn || summary.basedOn.origin === "unknown") summary.stale.push("the input used for these patterns is unknown");
      summary.basedOn = summary.basedOn || unknownBasis();
      if (summary.basedOn.passagesSig !== cur) summary.stale.push("passages changed since the patterns were found");
      if (summary.basedOn.attrSig && summary.basedOn.attrSig !== sig) summary.stale.push("attribution changed since the patterns were found");
      if ((summary.basedOn.inputHash || summary.basedOn.transcriptUpdatedAt) && textChanged(summary.basedOn)) summary.stale.push("transcript changed since the patterns were found");
      const used = new Set(String(summary.basedOn.passagesSig || "").split(",").map(x => x.split("@")[0]));
      if (passages.some(p => used.has(p.id) && p.stale.length)) summary.stale.push("a card it was based on is stale");
    }
    return { run, transcript, passages, summary, attachments, attrSig: sig };
  }

  /* A run from whatever the person has. kind "transcript" (default) or "claim" (one claim or quote; it becomes a
     single finished passage with one person-supplied claim, routed by heuristics, ready to search with no model).
     The title is made from the text when none is given; dates and identities stay unknown. */
  async createRun(doc, transcript) {
    const text = String(transcript || "");
    const kind = doc && doc.kind === "claim" ? "claim" : "transcript";
    const detect = shared.detectKind(text);
    const parseMode = (doc && doc.parseMode) || (kind === "claim" || detect.unlabeled ? "text" : "transcript");
    const clean = V.validateRunDoc(Object.assign({}, doc, { kind, parseMode }), { turns: shared.parseTranscript(text, { mode: parseMode }) });
    const id = newId("r");
    const now = nowISO();
    const turns = shared.parseTranscript(text, { mode: parseMode });
    const labels = shared.speakerLabels(turns);
    const title = clean.title && clean.title !== "Untitled run" ? clean.title : autoTitle(text, kind);
    const run = Object.assign({ title, sourceUrl: "", sourceLabel: "", sourceDate: "", speakers: [], status: "draft" }, clean,
      { title, kind, parseMode, provenance: Object.assign({ overrides: {}, flags: [], notes: "", method: "", labelsFound: labels }, attributionNote(labels, kind)), createdAt: now, updatedAt: now, transcriptUpdatedAt: now, example: false, input: inputRecord(text, parseMode, now), inputHistory: [] });
    if (!run.speakers.length) run.speakers = labels.map(k => ({ key: k, name: k === "UNLABELED" ? "Speaker unknown" : k.split(" ").map(w => w[0] + w.slice(1).toLowerCase()).join(" "), bio: "" }));
    if (kind === "claim") run.status = "analyzed";
    delete run.id;
    await writeAtomic(path.join(this.runDir(id), "run.json"), JSON.stringify(run, null, 2));
    await writeAtomic(path.join(this.runDir(id), "transcript.txt"), text);
    if (kind === "claim") { const cp = claimPassage(text, run, now); cp.analysis = shared.sanitizeAnalysis(cp.analysis, { sourceTypes: T.SOURCE_TYPES }); cp.basedOn.inputHash = run.input.sha256; await writeAtomic(path.join(this.runDir(id), "passages", "p001.json"), JSON.stringify(cp, null, 2)); }
    return id;
  }

  /* Replace the run document. If `transcript` is given and differs from what is stored, the transcript
     timestamp moves, provenance resets, and every finished passage is marked stale (kept, not deleted). */
  async saveRun(id, doc, transcript) { return this.withLock(id, () => this._saveRun(id, doc, transcript)); }
  async _saveRun(id, doc, transcript) {
    const cur = await this.getRun(id);
    if (!cur) { const e = new Error("run not found"); e.status = 404; throw e; }
    if (cur.example) { const e = new Error("the supplied example is read-only; copy it to edit"); e.status = 403; throw e; }
    const curText = await this.getTranscript(id);
    const futureText = typeof transcript === "string" ? transcript : curText;
    const incoming = V.validateRunDoc(doc, { turns: this.parseFor(cur, futureText), speakerKeys: ((doc && doc.speakers) || cur.speakers || []).map(s => String(s.key || "").toUpperCase()) });
    // server-owned fields: a client cannot overwrite the records the server keeps on the run
    ["orphans", "provenanceHistory", "transcriptUpdatedAt", "createdAt", "example", "copiedFrom", "copiedAt", "kind", "parseMode", "input", "inputHistory"].forEach(k => delete incoming[k]);
    const next = Object.assign({}, cur, incoming);
    delete next.id; next.example = false; next.createdAt = cur.createdAt; next.updatedAt = nowISO();
    next.transcriptUpdatedAt = cur.transcriptUpdatedAt || cur.createdAt;
    if (!next.input) next.input = inputRecord(curText, cur.parseMode, next.transcriptUpdatedAt);
    if (!Array.isArray(next.inputHistory)) next.inputHistory = [];
    if (typeof transcript === "string") {
      const old = await this.getTranscript(id);
      if (transcript !== old) {
        // a typed claim with no words is not a claim: refused before anything is written (the old claim stays current)
        if (cur.kind === "claim" && !canonicalClaimText(transcript)) throw V.bad("a claim needs some words; nothing was changed");
        // a version is named by its timestamp; two edits in one millisecond must not share one
        if (next.updatedAt <= next.transcriptUpdatedAt) next.updatedAt = new Date(Date.parse(next.transcriptUpdatedAt) + 1).toISOString();
        await writeAtomic(path.join(this.runDir(id), "transcript.txt"), transcript);
        // the hash of every earlier text is kept (not the text), so a reading made from an earlier version can still be bound to it
        next.inputHistory = next.inputHistory.concat([{ sha256: next.input.sha256, chars: next.input.chars, transcriptUpdatedAt: next.transcriptUpdatedAt, replacedAt: next.updatedAt }]).slice(-200);
        next.transcriptUpdatedAt = next.updatedAt;
        next.input = inputRecord(transcript, cur.parseMode, next.updatedAt);
        const was = cur.provenance || {};
        const oldTurns = this.parseFor(cur, old), newTurns = this.parseFor(cur, transcript);
        const sameStructure = oldTurns.length === newTurns.length && oldTurns.every((t, i) => t.label === newTurns[i].label && t.heading === newTurns[i].heading);
        const hadDecisions = Object.keys(was.overrides || {}).length || (was.flags || []).length || was.confirmedAt;
        // A person's attribution decisions are never silently discarded. If the edit left every turn in place with the same
        // label, the decisions still apply and only the confirmation is cleared. Otherwise they go to provenanceHistory.
        next.provenanceHistory = (cur.provenanceHistory || []).concat(hadDecisions ? [{ provenance: was, transcriptUpdatedAt: cur.transcriptUpdatedAt || cur.createdAt, replacedAt: next.updatedAt, turns: oldTurns.length, keptInPlace: sameStructure }] : []);
        if (sameStructure) {
          next.provenance = Object.assign({}, was, { labelsFound: shared.speakerLabels(newTurns), transcriptNote: "Transcript edited " + next.updatedAt + " without changing the turn structure; " + Object.keys(was.overrides || {}).length + " label corrections kept, confirmation cleared." });
          delete next.provenance.confirmedAt; delete next.provenance.confirmedBy;
        } else {
          next.provenance = Object.assign({ overrides: {}, flags: [], notes: "", method: "", labelsFound: shared.speakerLabels(newTurns), transcriptNote: "Transcript edited " + next.updatedAt + "; the turn structure changed (" + oldTurns.length + " → " + newTurns.length + " turns), so earlier attribution decisions were archived in provenanceHistory and must be redone." }, attributionNote(shared.speakerLabels(newTurns), cur.kind));
        }
        next.status = cur.kind === "claim" ? "analyzed" : "draft";
        if (cur.title === autoTitle(old, cur.kind) && !(doc && doc.title)) next.title = autoTitle(transcript, cur.kind);
        if (cur.kind === "claim") {
          // the input IS the claim: a new input is a new canonical claim; the old reading and its evidence are kept
          // in history and parked for reattachment, never explained as if current
          await writeAtomic(path.join(this.runDir(id), "run.json"), JSON.stringify(next, null, 2));
          const cp = claimPassage(transcript, Object.assign({ id }, next), next.updatedAt); cp.analysis = shared.sanitizeAnalysis(cp.analysis, { sourceTypes: T.SOURCE_TYPES });
          cp.basedOn = { transcriptUpdatedAt: next.transcriptUpdatedAt, attrSig: shared.attrSig({}) };
          await this._savePassage(id, "p001", cp);
          return Object.assign({ id }, await this.getRun(id));
        }
      }
    }
    await writeAtomic(path.join(this.runDir(id), "run.json"), JSON.stringify(next, null, 2));
    return Object.assign({ id }, next);
  }

  /* Save a passage WITHOUT ever losing a person's work. The incoming document wins for the model's reading; records a
     person made (receipts, searches, candidates, rejections) are merged back from what is on disk; a new reading keeps the
     old one in history and carries records to claims with the same text; records parked on the run by a re-segment are
     adopted by the first reading that produces a matching claim. Returns the saved passage. */
  async savePassage(id, pid, doc, opts) { return this.withLock(id, () => this._savePassage(id, pid, doc, opts)); }
  async _savePassage(id, pid, doc, opts) {
    assertId(pid, "passage id");
    opts = opts || {};
    const run = await this.getRun(id);
    if (!run) { const e = new Error("run not found"); e.status = 404; throw e; }
    if (run.example) { const e = new Error("the supplied example is read-only; copy it to edit"); e.status = 403; throw e; }
    const file = path.join(this.runDir(id), "passages", pid + ".json");
    const cur = await readJSON(file, null);
    if (cur) { ensureClaimIds(Object.assign(cur, { id: pid })); ensureReceiptIds(cur); }
    // revision check: a client that saw an older reading cannot replace the current one
    if (cur && opts.expectedReadingRev != null && Number(opts.expectedReadingRev) !== (cur.readingRev || 0)) { const e = new Error("the card changed since this was prepared (reading " + (cur.readingRev || 0) + " is current, this was based on " + opts.expectedReadingRev + "). Reload and try again."); e.status = 409; e.code = "stale_reading"; throw e; }
    if (run.kind === "claim" && pid !== "p001") throw V.bad("a typed claim is one card (p001); it has no other passages");
    const transcript = await this.getTranscript(id);
    const turns = this.parseFor(run, transcript);
    const d = V.validatePassageDoc(doc, turns.length, { kind: run.kind || "transcript" });
    // server-owned: the page sends back the passage it loaded, but these are written here only
    delete d.history; delete d.adopted; delete d.rerun;
    // a save that marks the card running or pending is not a reading: whatever analysis it carries is the copy the
    // page loaded, so the reading on disk stays (a stale tab cannot demote a newer reading this way)
    if (cur && cur.analysis && (d.status === "running" || d.status === "pending")) ["analysis", "callId", "basedOn", "analyzedAt", "analyzedBy", "model", "usage"].forEach(k => delete d[k]);
    // a claim run's one claim is the input itself: a reading of some other wording is a reading of an edited input
    if (run.kind === "claim" && pid === "p001" && d.analysis) {
      const canon = canonicalClaimText(transcript);
      const first = d.analysis.claims[0];
      if (!first || shared.claimKey({ text: first.text }) !== shared.claimKey({ text: canon })) { const e = new Error("the claim was edited while this reading was being made (it now reads “" + canon + "”). Run the explanation again on the current wording."); e.status = 409; e.code = "claim_edited"; throw e; }
      first.text = canon; first.userSupplied = true;
    }
    // model-call provenance comes from the server's own record of the call (this run's file), never from the client;
    // it is applied below, once it is known whether this save is a new reading
    delete d.provenance;
    const resolved = d.callId ? await this.findCall(id, d.callId) : null;
    // A recorded call is bound before the request leaves the server. Saves cannot retarget it after an edit.
    // Without a call or explicit input version the reading is retained, but its origin stays unknown.
    if (d.analysis) d.basedOn = resolved && resolved.basedOn ? Object.assign({}, resolved.basedOn) : this._readingBasis(run, transcript, d.basedOn);
    const unrecorded = () => ({ callId: d.callId, recorded: false, note: "no call with this id is on record for this run" });
    const protection = { merged: 0, history: false, carried: null, adopted: 0, parked: 0 };
    let parked = [];
    if (cur) {
      d.history = cur.history || []; d.adopted = cur.adopted || []; if (cur.rerun) d.rerun = cur.rerun;
      if (!d.analysis && cur.analysis) { d.analysis = cur.analysis; d.analyzedAt = d.analyzedAt || cur.analyzedAt; d.analyzedBy = d.analyzedBy || cur.analyzedBy; d.model = d.model || cur.model; d.basedOn = cur.basedOn || d.basedOn; if (cur.provenance) { d.provenance = cur.provenance; d.callId = cur.callId || d.callId; } }
      if (cur.analysis && d.analysis) {
        const newReading = (d.analyzedAt || "") !== (cur.analyzedAt || "") || canonical(stripRecords(d.analysis)) !== canonical(stripRecords(cur.analysis));
        if (newReading) {
          if (d.callId) d.provenance = resolved ? provenanceOf(resolved) : unrecorded();
          d.history = (cur.history || []).concat([{ readingRev: cur.readingRev || 0, analysis: cur.analysis, analyzedAt: cur.analyzedAt || "", analyzedBy: cur.analyzedBy || "", model: cur.model || "", basedOn: cur.basedOn || null, provenance: cur.provenance || null, replacedAt: nowISO() }]);
          const res = carryAndMerge(cur.analysis, d.analysis, nowISO());
          assignClaimIds(d.analysis, cur.analysis);
          d.rerun = { carried: res.carried, orphaned: res.orphaned, at: res.at };
          d.readingRev = (cur.readingRev || 0) + 1;
          protection.history = true; protection.carried = d.rerun;
          // records whose claim is not in the new reading (changed wording or speaker) are parked, never dropped or guessed
          parked = res.orphans.map(o => ({ id: newId("o"), claimId: o.id || "", claimText: o.text, claimType: o.type, speaker: o.speaker || "", from: { reading: cur.readingRev || 0, passage: pid, title: cur.title || "", turnStart: cur.turnStart, turnEnd: cur.turnEnd, replacedAt: nowISO() },
            receipts: o.receipts || [], searches: o.searches || [], candidates: o.candidates || [], rejections: o.rejections || [], obligation: o.obligation || null, parkedAt: nowISO(), why: "the claim is not in the new reading" }));
        } else {
          // the same reading saved again: what it was read from and which call made it do not change
          protection.merged = mergeRecords(cur.analysis, d.analysis);
          if (cur.basedOn) d.basedOn = cur.basedOn;
          if (cur.provenance && cur.provenance.recorded) { d.provenance = cur.provenance; d.callId = cur.callId || d.callId; }
          else if (d.callId) d.provenance = resolved ? provenanceOf(resolved) : (cur.provenance || unrecorded());
          else if (cur.provenance) { d.provenance = cur.provenance; d.callId = cur.callId; }
          d.readingRev = cur.readingRev || 0;
        }
      } else if (d.analysis && d.callId) d.provenance = resolved ? provenanceOf(resolved) : unrecorded();
      if (d.readingRev == null) d.readingRev = cur.readingRev || (cur.analysis ? 1 : 0);
      if (!cur.analysis && d.analysis) d.readingRev = (cur.readingRev || 0) + 1;
      d.rev = (cur.rev || 0) + 1;
    } else { d.rev = 1; d.readingRev = d.analysis ? 1 : 0; if (d.analysis && d.callId) d.provenance = resolved ? provenanceOf(resolved) : unrecorded(); }
    if (d.analysis && !(cur && cur.analysis)) assignClaimIds(d.analysis);
    // records parked earlier: adopt the ones whose claim identity matches a claim in this reading
    let runChanged = false;
    if (d.analysis && Array.isArray(run.orphans) && run.orphans.length) {
      const adopted = adoptOrphans(run.orphans, d.analysis, pid);
      if (adopted.length) {
        protection.adopted = adopted.length;
        d.adopted = (d.adopted || []).concat(adopted.map(o => ({ orphanId: o.id, claimText: o.claimText, from: o.from, at: nowISO() })));
        run.orphans = run.orphans.filter(o => !adopted.includes(o)); runChanged = true;
      }
    }
    if (parked.length) { run.orphans = (run.orphans || []).concat(parked); protection.parked = parked.length; runChanged = true; }
    cleanComputed(d.analysis);
    ensureClaimIds(Object.assign(d, { id: pid }), true); ensureReceiptIds(d);
    delete d.id;
    d.savedAt = nowISO();
    // the passage is written first: if that write is refused (a key-shaped string, a full disk), the run file still
    // lists every parked record, so an adopted record is never lost between the two writes
    await writeAtomic(file, JSON.stringify(d, null, 2));
    if (runChanged) { const r = Object.assign({}, run); delete r.id; await writeAtomic(path.join(this.runDir(id), "run.json"), JSON.stringify(r, null, 2)); }
    await this.touchRun(id);
    return Object.assign({ id: pid, protection }, d);
  }

  /* The hash of the run's text as it was at `transcriptUpdatedAt`: the current text when that names the current version
     (or nothing), an earlier version's recorded hash when the run remembers it, otherwise "" (unknown; the timestamp rule
     then applies and the reading is stale, as it should be). */
  _inputHashFor(run, transcript, transcriptUpdatedAt) {
    const curAt = run.transcriptUpdatedAt || run.createdAt || "";
    if (!transcriptUpdatedAt || transcriptUpdatedAt === curAt) return (run.input && run.input.sha256) || sha256(transcript);
    const h = (run.inputHistory || []).find(x => x.transcriptUpdatedAt === transcriptUpdatedAt);
    return h ? h.sha256 : "";
  }

  _readingBasis(run, transcript, requested) {
    if (!requested || !requested.transcriptUpdatedAt) return unknownBasis();
    const basis = { transcriptUpdatedAt: requested.transcriptUpdatedAt, attrSig: requested.attrSig || "", inputHash: this._inputHashFor(run, transcript, requested.transcriptUpdatedAt) };
    if (!basis.attrSig) basis.origin = "unknown";
    if (requested.passagesSig !== undefined) basis.passagesSig = requested.passagesSig;
    return basis;
  }

  /* Capture only a version actually requested by the caller, before awaiting a model. The lock makes the snapshot
     consistent with an edit. An older prompt is refused before using a key; omitted input remains unknown. */
  async captureCallBasis(id, requested, purpose) {
    if (!id || !ID_RE.test(String(id))) return null;
    return this.withLock(id, async () => {
      const run = await this.getRun(id); if (!run) return null;
      const transcript = await this.getTranscript(id);
      const basis = this._readingBasis(run, transcript, requested);
      if (basis.origin === "unknown") return basis;
      const currentHash = (run.input && run.input.sha256) || sha256(transcript);
      const currentAttr = shared.attrSig(run.provenance && run.provenance.overrides);
      if (basis.inputHash !== currentHash || basis.attrSig !== currentAttr) {
        const e = new Error("the input changed before this analysis started; reload and try again"); e.status = 409; e.code = "input_changed"; throw e;
      }
      if (purpose === "patterns") {
        const current = passagesSignature((await this.bundle(id)).passages.filter(p => !p.stale.length));
        if (typeof requested.passagesSig !== "string" || requested.passagesSig !== current) {
          const e = new Error("the cards changed before these patterns started; reload and try again"); e.status = 409; e.code = "stale_reading"; throw e;
        }
        basis.passagesSig = current;
      }
      return basis;
    });
  }

  /* Model calls, recorded by the server as they happen: one JSON line per call in runs/<id>/calls.jsonl (or calls.jsonl at
     the data root when the call names no run). Append-only; failures are recorded too. The page gets the record back and
     names it by callId when it saves the reading; _savePassage then copies the server's record, not the client's. */
  async recordCall(id, call) {
    const own = !!(id && ID_RE.test(String(id)) && (await this.getRun(id)));
    const file = own ? path.join(this.runDir(id), "calls.jsonl") : path.join(this.dataDir, "calls.jsonl");
    call = Object.assign({}, call, { runId: own ? String(id) : "", purpose: String(call.purpose || "").replace(/[^a-z0-9_]/gi, "").slice(0, 40) });
    if (call.errorMessage) call.errorMessage = redactKeys(call.errorMessage);
    const line = JSON.stringify(call) + "\n";
    leakScan(line); // nothing else in a record is free text (hashes, ids, numbers), so this can only fail on a bug
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.appendFile(file, line);
    return call;
  }
  /* A reading can name only a call recorded for ITS run; calls made for no run (a transcription before a run exists) or
     for another run are not claimable, so a record always says which run's text the model was given. */
  async findCall(id, callId) {
    if (!callId || !ID_RE.test(String(id || ""))) return null;
    let text = ""; try { text = await fsp.readFile(path.join(this.runDir(id), "calls.jsonl"), "utf8"); } catch (e) { if (e.code !== "ENOENT") throw e; return null; }
    for (const l of text.split("\n")) { if (!l) continue; try { const c = JSON.parse(l); if (c.callId === callId) return c; } catch (e) {} }
    return null;
  }

  /* Apply one small change to ONE claim of the CURRENT reading, under the run's lock, addressed by claim id.
     This is how every record mutation (search results, sources, decisions, withdrawals, routing) is written: the
     latest document is re-read here, so a client's older snapshot can never come back to life through it.
     opts.expectedReadingRev: refuse (409) when the reading moved since the client looked. */
  async mutateClaim(id, pid, cid, fn, opts) { return this.withLock(id, () => this._mutateClaim(id, pid, cid, fn, opts)); }
  async _mutateClaim(id, pid, cid, fn, opts) {
    assertId(pid, "passage id"); opts = opts || {};
    const run = await this.getRun(id);
    if (!run) { const e = new Error("run not found"); e.status = 404; throw e; }
    if (run.example) { const e = new Error("the supplied example is read-only; copy it to edit"); e.status = 403; throw e; }
    const file = path.join(this.runDir(id), "passages", pid + ".json");
    const cur = await readJSON(file, null);
    if (!cur || !cur.analysis) { const e = new Error("passage not found or not analysed"); e.status = 404; throw e; }
    ensureClaimIds(Object.assign(cur, { id: pid })); ensureReceiptIds(cur);
    if (opts.expectedReadingRev != null && Number(opts.expectedReadingRev) !== (cur.readingRev || 0)) { const e = new Error("the card changed since you looked (reading " + (cur.readingRev || 0) + " is current). Reload and try again."); e.status = 409; e.code = "stale_reading"; throw e; }
    const claim = (cur.analysis.claims || []).find(c => c.id === cid);
    if (!claim) { const e = new Error("that claim is not in the current reading of this passage"); e.status = 404; e.code = "claim_not_current"; throw e; }
    const result = await fn(claim, cur, run);
    claim.status = (claim.receipts || []).some(r => !r.withdrawnAt) ? "receipt" : ((claim.searches || []).length ? "searched" : "unchecked");
    cur.rev = (cur.rev || 0) + 1; cur.savedAt = nowISO();
    delete cur.id;
    await writeAtomic(file, JSON.stringify(cur, null, 2));
    await this.touchRun(id);
    return result;
  }

  /* Park a record set on the run (a late search whose claim is gone, say) so it stays reattachable. */
  async parkRecords(id, entry) { return this.withLock(id, async () => { const run = await this.getRun(id); if (!run) { const e = new Error("run not found"); e.status = 404; throw e; } const o = Object.assign({ id: newId("o"), parkedAt: nowISO(), receipts: [], searches: [], candidates: [], rejections: [], obligation: null }, entry); run.orphans = (run.orphans || []).concat([o]); const r = Object.assign({}, run); delete r.id; await writeAtomic(path.join(this.runDir(id), "run.json"), JSON.stringify(r, null, 2)); return o; }); }

  /* Reattach one parked record set to a claim by hand. */
  async attachOrphan(id, oid, pid, idx) { return this.withLock(id, () => this._attachOrphan(id, oid, pid, idx)); }
  async _attachOrphan(id, oid, pid, idx) {
    assertId(pid, "passage id");
    const run = await this.getRun(id);
    if (!run) { const e = new Error("run not found"); e.status = 404; throw e; }
    if (run.example) { const e = new Error("the supplied example is read-only; copy it to edit"); e.status = 403; throw e; }
    const o = (run.orphans || []).find(x => x.id === oid); if (!o) { const e = new Error("record not found"); e.status = 404; throw e; }
    const file = path.join(this.runDir(id), "passages", pid + ".json");
    const p = await readJSON(file, null); if (p) { ensureClaimIds(Object.assign(p, { id: pid })); ensureReceiptIds(p); delete p.id; }
    const claims = p && p.analysis && p.analysis.claims || [];
    const c = claims.find(x => x.id === String(idx)) || (/^\d+$/.test(String(idx)) ? claims[Number(idx)] : null);
    if (!c) { const e = new Error("claim not found"); e.status = 404; throw e; }
    moveRecords(o, c, { orphanId: o.id, from: o.from, by: "person at this computer", at: nowISO(), originalClaimText: o.claimText });
    p.adopted = (p.adopted || []).concat([{ orphanId: o.id, claimText: o.claimText, from: o.from, at: nowISO(), by: "person at this computer", toClaim: c.id }]);
    p.rev = (p.rev || 0) + 1; p.savedAt = nowISO();
    await writeAtomic(file, JSON.stringify(p, null, 2));
    run.orphans = run.orphans.filter(x => x.id !== oid);
    const r = Object.assign({}, run); delete r.id;
    await writeAtomic(path.join(this.runDir(id), "run.json"), JSON.stringify(r, null, 2));
    return true;
  }

  /* Re-segmenting replaces the passage set. The old set and summary move to archive/<stamp>/. */
  async replacePassages(id, list) { return this.withLock(id, () => this._replacePassages(id, list)); }
  async _replacePassages(id, list) {
    const run = await this.getRun(id);
    if (!run) { const e = new Error("run not found"); e.status = 404; throw e; }
    if (run.example) { const e = new Error("the supplied example is read-only; copy it to edit"); e.status = 403; throw e; }
    if (run.kind === "claim") throw V.bad("a typed claim is one card; it cannot be re-segmented");
    const transcript = await this.getTranscript(id);
    const turns = this.parseFor(run, transcript);
    const cleanList = (Array.isArray(list) ? list : []).map(x => V.validatePassageDoc(x, turns.length, { kind: run.kind || "transcript" }));
    for (let i = 1; i < cleanList.length; i++) if (cleanList[i].turnStart < cleanList[i - 1].turnStart) throw V.bad("passages must be in turn order");
    // A reading supplied with a new segmentation keeps its original basis, just like a single-card save.
    for (const d of cleanList) {
      delete d.history; delete d.adopted; delete d.rerun; delete d.provenance;
      if (d.analysis) {
        const call = d.callId ? await this.findCall(id, d.callId) : null;
        d.basedOn = call && call.basedOn ? Object.assign({}, call.basedOn) : this._readingBasis(run, transcript, d.basedOn);
        if (d.callId) d.provenance = call ? provenanceOf(call) : { callId: d.callId, recorded: false, note: "no call with this id is on record for this run" };
        assignClaimIds(d.analysis);
        (d.analysis.claims || []).forEach(c => { RECORD_KEYS.forEach(k => { c[k] = unionRecords(k, [], c[k]); }); });
      } else { delete d.callId; delete d.basedOn; }
    }
    list = cleanList;
    const dir = this.runDir(id);
    const stamp = nowISO().replace(/[:.]/g, "-");
    const pdir = path.join(dir, "passages");
    // park every person-made record from the passages about to be archived; nothing a person did is lost to a re-segment
    const old = await this.listPassages(id);
    const orphans = [];
    old.forEach(p => (p.analysis && p.analysis.claims || []).forEach((c, i) => {
      if (hasRecords(c)) orphans.push({ id: newId("o"), claimText: c.text, claimType: c.type, speaker: c.speaker || "", from: { archive: stamp, passage: p.id, title: p.title || "", turnStart: p.turnStart, turnEnd: p.turnEnd, claim: i },
        receipts: c.receipts || [], searches: c.searches || [], candidates: c.candidates || [], rejections: c.rejections || [], obligation: c.obligation || null, parkedAt: nowISO() });
    }));
    if (orphans.length) { const r = Object.assign({}, run, { orphans: (run.orphans || []).concat(orphans) }); delete r.id; await writeAtomic(path.join(dir, "run.json"), JSON.stringify(r, null, 2)); }
    if (await exists(pdir)) { await fsp.mkdir(path.join(dir, "archive", stamp), { recursive: true }); await fsp.rename(pdir, path.join(dir, "archive", stamp, "passages")); }
    const sfile = path.join(dir, "summary.json");
    if (await exists(sfile)) { await fsp.mkdir(path.join(dir, "archive", stamp), { recursive: true }); await fsp.rename(sfile, path.join(dir, "archive", stamp, "summary.json")); }
    for (let i = 0; i < list.length; i++) {
      const pid = "p" + String(i + 1).padStart(3, "0");
      const d = Object.assign({}, list[i], { order: i + 1, status: list[i].status || "pending", createdAt: nowISO() });
      delete d.id; if (d.analysis) { ensureClaimIds(Object.assign(d, { id: pid }), true); delete d.id; }
      await writeAtomic(path.join(pdir, pid + ".json"), JSON.stringify(d, null, 2));
    }
    await this.touchRun(id);
    return list.length;
  }

  async saveSummary(id, doc) { return this.withLock(id, () => this._saveSummary(id, doc)); }
  async _saveSummary(id, doc) {
    const run = await this.getRun(id);
    if (!run) { const e = new Error("run not found"); e.status = 404; throw e; }
    if (run.example) { const e = new Error("the supplied example is read-only; copy it to edit"); e.status = 403; throw e; }
    const d = V.validateSummary(doc);
    const known = new Set((await this.listPassages(id)).map(p => p.id));
    d.patterns.forEach(p => { p.passages = p.passages.filter(x => known.has(x)); });
    const transcript = await this.getTranscript(id);
    if (!run.input) run.input = inputRecord(transcript, run.parseMode, run.transcriptUpdatedAt);
    const call = d.callId ? await this.findCall(id, d.callId) : null;
    if (call && call.purpose !== "patterns") throw V.bad("patterns must name a patterns model call");
    d.basedOn = call && call.basedOn ? Object.assign({}, call.basedOn) : Object.assign(this._readingBasis(run, transcript, d.basedOn), { passagesSig: d.basedOn && d.basedOn.passagesSig || "" });
    delete d.provenance;
    if (d.callId) { const call = await this.findCall(id, d.callId); d.provenance = call ? provenanceOf(call) : { callId: d.callId, recorded: false, note: "no call with this id is on record for this run" }; }
    await writeAtomic(path.join(this.runDir(id), "summary.json"), JSON.stringify(d, null, 2));
    await this.touchRun(id);
    return d;
  }

  async addAttachment(id, { name, mediaType, bytes, transcribedText }) {
    const run = await this.getRun(id);
    if (!run) { const e = new Error("run not found"); e.status = 404; throw e; }
    if (run.example) { const e = new Error("the supplied example is read-only; copy it to edit"); e.status = 403; throw e; }
    const aid = newId("a");
    const ext = ({ "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif" })[mediaType] || "";
    await writeAtomic(path.join(this.runDir(id), "attachments", aid + ext), bytes);
    const list = await this.listAttachments(id);
    const entry = { id: aid, file: aid + ext, name: name || "", mediaType, kind: "image", transcribedText: transcribedText || "", createdAt: nowISO() };
    list.push(entry);
    await writeAtomic(path.join(this.runDir(id), "attachments.json"), JSON.stringify(list, null, 2));
    await this.touchRun(id);
    return entry;
  }
  async attachmentPath(id, aid) {
    const list = await this.listAttachments(id);
    const a = list.find(x => x.id === aid);
    return a ? { path: path.join(this.runDir(id), "attachments", a.file), mediaType: a.mediaType } : null;
  }

  /* "Delete" moves the run to trash/<id>-<stamp>/. The app never removes a run's files. */
  async deleteRun(id) {
    const run = await this.getRun(id);
    if (!run) { const e = new Error("run not found"); e.status = 404; throw e; }
    if (run.example) { const e = new Error("the supplied example cannot be deleted from the app; remove it from the data folder by hand if you must"); e.status = 403; throw e; }
    const name = id + "-" + nowISO().replace(/[:.]/g, "-");
    await fsp.mkdir(path.join(this.dataDir, "trash"), { recursive: true });
    await fsp.rename(this.runDir(id), path.join(this.dataDir, "trash", name));
    return name;
  }
  async listTrash() {
    let names = []; try { names = await fsp.readdir(path.join(this.dataDir, "trash")); } catch (e) { return []; }
    const out = [];
    for (const name of names) { if (!/^[A-Za-z0-9_-]+$/.test(name)) continue; const run = await readJSON(path.join(this.dataDir, "trash", name, "run.json"), null); if (run) out.push({ name, id: name.replace(/-\d{4}-\d{2}-\d{2}T.*$/, ""), title: run.title, deletedAt: (/-(\d{4}-\d{2}-\d{2}T[^/]*)$/.exec(name) || [])[1] || "" }); }
    out.sort((a, b) => (b.deletedAt || "").localeCompare(a.deletedAt || ""));
    return out;
  }
  async restoreRun(name) {
    if (!/^[A-Za-z0-9_-]+$/.test(String(name || ""))) { const e = new Error("invalid name"); e.status = 400; throw e; }
    const src = path.join(this.dataDir, "trash", name);
    if (!(await exists(src))) { const e = new Error("not in trash"); e.status = 404; throw e; }
    let id = name.replace(/-\d{4}-\d{2}-\d{2}T.*$/, "");
    if (await this.getRun(id)) id = newId("r"); // the id was reused meanwhile; restore under a fresh one
    await fsp.rename(src, this.runDir(id));
    return id;
  }

  /* Copy a run (typically the example) into a new editable run. Provenance, analyses and receipts are
     carried over unchanged; each passage records where it came from. */
  async duplicateRun(id) {
    const b = await this.bundle(id);
    if (!b) { const e = new Error("run not found"); e.status = 404; throw e; }
    const nid = newId("r");
    const now = nowISO();
    const run = Object.assign({}, b.run, { title: b.run.title + " (copy)", example: false, copiedFrom: id, copiedAt: now, createdAt: now, updatedAt: now });
    delete run.id;
    await writeAtomic(path.join(this.runDir(nid), "run.json"), JSON.stringify(run, null, 2));
    await writeAtomic(path.join(this.runDir(nid), "transcript.txt"), b.transcript);
    for (const p of b.passages) { const d = Object.assign({}, p, { copiedFrom: id + "/" + p.id }); delete d.id; delete d.stale; delete d.quoteCheck; cleanComputed(d.analysis); await writeAtomic(path.join(this.runDir(nid), "passages", p.id + ".json"), JSON.stringify(d, null, 2)); }
    if (b.summary) { const s = Object.assign({}, b.summary, { copiedFrom: id }); delete s.stale; await writeAtomic(path.join(this.runDir(nid), "summary.json"), JSON.stringify(s, null, 2)); }
    try { await fsp.copyFile(path.join(this.runDir(id), "calls.jsonl"), path.join(this.runDir(nid), "calls.jsonl")); } catch (e) { if (e.code !== "ENOENT") throw e; } // the copy's readings keep their call records
    for (const a of b.attachments) { try { await fsp.mkdir(path.join(this.runDir(nid), "attachments"), { recursive: true }); await fsp.copyFile(path.join(this.runDir(id), "attachments", a.file), path.join(this.runDir(nid), "attachments", a.file)); } catch (e) {} }
    if (b.attachments.length) await writeAtomic(path.join(this.runDir(nid), "attachments.json"), JSON.stringify(b.attachments, null, 2));
    return nid;
  }

  /* Install a supplied example from a folder (run.json, transcript.txt, passages/, summary.json) unless it exists already. */
  async installExample(id, folder) {
    assertId(id, "example id");
    if (await this.getRun(id)) return false;
    const run = JSON.parse(fs.readFileSync(path.join(folder, "run.json"), "utf8"));
    run.example = true;
    delete run.id;
    await writeAtomic(path.join(this.runDir(id), "run.json"), JSON.stringify(run, null, 2));
    await writeAtomic(path.join(this.runDir(id), "transcript.txt"), fs.readFileSync(path.join(folder, "transcript.txt"), "utf8"));
    const pdir = path.join(folder, "passages");
    if (fs.existsSync(pdir)) for (const n of fs.readdirSync(pdir)) if (n.endsWith(".json")) await writeAtomic(path.join(this.runDir(id), "passages", n), fs.readFileSync(path.join(pdir, n)));
    const sfile = path.join(folder, "summary.json");
    if (fs.existsSync(sfile)) await writeAtomic(path.join(this.runDir(id), "summary.json"), fs.readFileSync(sfile));
    return true;
  }
}

module.exports = { Store, nowISO, newId, ID_RE, hasRecords, mergeRecords, unionRecords, autoTitle, claimPassage, canonicalClaimText, inputRecord, sha256, leakScan, provenanceOf };
