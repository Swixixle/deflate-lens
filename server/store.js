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
   deleting a run moves it to trash. Quote checks are recomputed on every read against the transcript as stored. */
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

async function writeAtomic(file, data) {
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
  (p.analysis && p.analysis.claims || []).forEach(c => (c.receipts || []).forEach((r, i) => { if (!r.rid) r.rid = r.candidateId ? "rc_" + r.candidateId : (c.id || "c") + "-r" + (i + 1); }));
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
/* Union of records on disk and records in the incoming claim, keyed by identity; disk-only records are kept.
   Decision fields on a candidate (status, decidedAt) and withdrawal marks on a receipt take the most advanced value. */
function unionRecords(kind, onDisk, incoming) {
  const out = [], seen = new Map();
  (incoming || []).forEach(x => { const k = recordKey(kind, x); seen.set(k, x); out.push(x); });
  (onDisk || []).forEach(x => {
    const k = recordKey(kind, x), inc = seen.get(k);
    if (!inc) { out.push(x); return; }
    if (kind === "candidates" && x.status && x.status !== "candidate" && inc.status === "candidate") { inc.status = x.status; inc.decidedAt = x.decidedAt; }
    if (kind === "receipts" && x.withdrawnAt && !inc.withdrawnAt) { inc.withdrawnAt = x.withdrawnAt; inc.withdrawnBy = x.withdrawnBy; inc.withdrawReason = x.withdrawReason; }
  });
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
    passages.forEach(p => {
      p.stale = [];
      if (p.status === "done" && p.basedOn) {
        if (p.basedOn.transcriptUpdatedAt !== run.transcriptUpdatedAt) p.stale.push("transcript changed since this analysis");
        if (p.basedOn.attrSig !== sig) p.stale.push("attribution changed since this analysis");
      }
      // quote checks are computed on every read from the transcript as it is now; a client's stored flags are never trusted
      if (p.analysis) p.quoteCheck = shared.verifyPassage(turns, overrides, p);
    });
    if (summary && summary.basedOn) {
      const cur = passages.filter(p => p.status === "done").map(p => p.id + "@" + (p.analyzedAt || "")).join(",");
      summary.stale = [];
      if (summary.basedOn.passagesSig !== cur) summary.stale.push("passages changed since the patterns were found");
      if (summary.basedOn.attrSig && summary.basedOn.attrSig !== sig) summary.stale.push("attribution changed since the patterns were found");
      if (summary.basedOn.transcriptUpdatedAt && summary.basedOn.transcriptUpdatedAt !== run.transcriptUpdatedAt) summary.stale.push("transcript changed since the patterns were found");
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
      { title, kind, parseMode, provenance: Object.assign({ overrides: {}, flags: [], notes: "", method: "", labelsFound: labels }, attributionNote(labels, kind)), createdAt: now, updatedAt: now, transcriptUpdatedAt: now, example: false });
    if (!run.speakers.length) run.speakers = labels.map(k => ({ key: k, name: k === "UNLABELED" ? "Speaker unknown" : k.split(" ").map(w => w[0] + w.slice(1).toLowerCase()).join(" "), bio: "" }));
    if (kind === "claim") run.status = "analyzed";
    delete run.id;
    await writeAtomic(path.join(this.runDir(id), "run.json"), JSON.stringify(run, null, 2));
    await writeAtomic(path.join(this.runDir(id), "transcript.txt"), text);
    if (kind === "claim") { const cp = claimPassage(text, run, now); cp.analysis = shared.sanitizeAnalysis(cp.analysis, { sourceTypes: T.SOURCE_TYPES }); await writeAtomic(path.join(this.runDir(id), "passages", "p001.json"), JSON.stringify(cp, null, 2)); }
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
    ["orphans", "provenanceHistory", "transcriptUpdatedAt", "createdAt", "example", "copiedFrom", "copiedAt", "kind", "parseMode"].forEach(k => delete incoming[k]);
    const next = Object.assign({}, cur, incoming);
    delete next.id; next.example = false; next.createdAt = cur.createdAt; next.updatedAt = nowISO();
    next.transcriptUpdatedAt = cur.transcriptUpdatedAt || cur.createdAt;
    if (typeof transcript === "string") {
      const old = await this.getTranscript(id);
      if (transcript !== old) {
        await writeAtomic(path.join(this.runDir(id), "transcript.txt"), transcript);
        next.transcriptUpdatedAt = next.updatedAt;
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
    const transcript = await this.getTranscript(id);
    const turns = this.parseFor(run, transcript);
    const d = V.validatePassageDoc(doc, turns.length, { kind: run.kind || "transcript" });
    // a claim run's one claim is the input itself: a reading of some other wording is a reading of an edited input
    if (run.kind === "claim" && pid === "p001" && d.analysis) {
      const canon = canonicalClaimText(transcript);
      const first = d.analysis.claims[0];
      if (!first || shared.claimKey({ text: first.text }) !== shared.claimKey({ text: canon })) { const e = new Error("the claim was edited while this reading was being made (it now reads “" + canon + "”). Run the explanation again on the current wording."); e.status = 409; e.code = "claim_edited"; throw e; }
      first.text = canon; first.userSupplied = true;
    }
    // a reading that does not say what it was based on is taken to be based on the run as it is now, so that it can
    // still go stale later (a client that knows better, like the page, always says)
    if (d.analysis && !d.basedOn) d.basedOn = { transcriptUpdatedAt: run.transcriptUpdatedAt || run.createdAt || "", attrSig: shared.attrSig(run.provenance && run.provenance.overrides) };
    const protection = { merged: 0, history: false, carried: null, adopted: 0, parked: 0 };
    let parked = [];
    if (cur) {
      if (!d.analysis && cur.analysis) { d.analysis = cur.analysis; d.analyzedAt = d.analyzedAt || cur.analyzedAt; d.analyzedBy = d.analyzedBy || cur.analyzedBy; d.model = d.model || cur.model; d.basedOn = d.basedOn || cur.basedOn; }
      if (cur.analysis && d.analysis) {
        const newReading = (d.analyzedAt || "") !== (cur.analyzedAt || "") || canonical(stripRecords(d.analysis)) !== canonical(stripRecords(cur.analysis));
        if (newReading) {
          d.history = (Array.isArray(d.history) && d.history.length >= (cur.history || []).length ? d.history : (cur.history || [])).concat([{ readingRev: cur.readingRev || 0, analysis: cur.analysis, analyzedAt: cur.analyzedAt || "", analyzedBy: cur.analyzedBy || "", model: cur.model || "", basedOn: cur.basedOn || null, replacedAt: nowISO() }]);
          const res = carryAndMerge(cur.analysis, d.analysis, nowISO());
          d.rerun = { carried: res.carried, orphaned: res.orphaned, at: res.at };
          d.readingRev = (cur.readingRev || 0) + 1;
          protection.history = true; protection.carried = d.rerun;
          // records whose claim is not in the new reading (changed wording or speaker) are parked, never dropped or guessed
          parked = res.orphans.map(o => ({ id: newId("o"), claimId: o.id || "", claimText: o.text, claimType: o.type, speaker: o.speaker || "", from: { reading: cur.readingRev || 0, passage: pid, title: cur.title || "", turnStart: cur.turnStart, turnEnd: cur.turnEnd, replacedAt: nowISO() },
            receipts: o.receipts || [], searches: o.searches || [], candidates: o.candidates || [], rejections: o.rejections || [], obligation: o.obligation || null, parkedAt: nowISO(), why: "the claim is not in the new reading" }));
        } else {
          protection.merged = mergeRecords(cur.analysis, d.analysis);
          if ((!Array.isArray(d.history) || d.history.length < (cur.history || []).length)) d.history = cur.history;
          if (!d.rerun && cur.rerun) d.rerun = cur.rerun;
          d.readingRev = cur.readingRev || 0;
        }
      } else if (!d.history && cur.history) d.history = cur.history;
      if (d.readingRev == null) d.readingRev = cur.readingRev || (cur.analysis ? 1 : 0);
      if (!cur.analysis && d.analysis) d.readingRev = (cur.readingRev || 0) + 1;
      if ((cur.adopted || []).length > (Array.isArray(d.adopted) ? d.adopted.length : 0)) d.adopted = cur.adopted;
      d.rev = (cur.rev || 0) + 1;
    } else { d.rev = 1; d.readingRev = d.analysis ? 1 : 0; }
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
    if (runChanged) { const r = Object.assign({}, run); delete r.id; await writeAtomic(path.join(this.runDir(id), "run.json"), JSON.stringify(r, null, 2)); }
    cleanComputed(d.analysis);
    ensureClaimIds(Object.assign(d, { id: pid }), true); ensureReceiptIds(d);
    delete d.id;
    d.savedAt = nowISO();
    await writeAtomic(file, JSON.stringify(d, null, 2));
    await this.touchRun(id);
    return Object.assign({ id: pid, protection }, d);
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
    const turns = this.parseFor(run, await this.getTranscript(id));
    const cleanList = (Array.isArray(list) ? list : []).map(x => V.validatePassageDoc(x, turns.length));
    for (let i = 1; i < cleanList.length; i++) if (cleanList[i].turnStart < cleanList[i - 1].turnStart) throw V.bad("passages must be in turn order");
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
    d.basedOn = Object.assign({}, d.basedOn, { attrSig: shared.attrSig(run.provenance && run.provenance.overrides), transcriptUpdatedAt: run.transcriptUpdatedAt || "" });
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

module.exports = { Store, nowISO, newId, ID_RE, hasRecords, mergeRecords, unionRecords, autoTitle, claimPassage, canonicalClaimText };
