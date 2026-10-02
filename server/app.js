"use strict";
const path = require("path");
const fs = require("fs");
const express = require("express");
const { Store } = require("./store");
const { buildExport, buildMarkdown, buildObligations } = require("./exportClaims");
const { REJECTION_REASONS } = require("./research/types");
const { createImporter } = require("./importer");
const { createSettings } = require("./settings");
const { createAI } = require("./ai");
const V = require("./validate");

/* createApp({ dataDir, ai, research, examplesDir, envPath }) -> { app, store, state, ready }
   state.ai is null when no key is configured; the page then shows the example and asks for a key once when real
   analysis is first requested (POST /api/settings/anthropic-key writes it to .env and swaps the model in). */
function createApp(opts) {
  const store = new Store(opts.dataDir);
  const state = { ai: opts.ai || null };
  const research = opts.research || null;
  const importer = createImporter({ fetch: opts.fetch || globalThis.fetch });
  const envPath = opts.envPath || path.join(__dirname, "..", ".env");
  const settings = createSettings({ envPath, examplePath: path.join(__dirname, "..", ".env.example") });
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "40mb" }));

  const ready = (async () => {
    await store.init();
    const exDir = opts.examplesDir || path.join(__dirname, "..", "examples");
    if (fs.existsSync(exDir)) for (const name of fs.readdirSync(exDir)) {
      const folder = path.join(exDir, name);
      if (fs.existsSync(path.join(folder, "run.json"))) { try { await store.installExample(name, folder); } catch (e) { console.error("example install failed:", name, e.message); } }
    }
  })();
  app.use(async (req, res, next) => { try { await ready; next(); } catch (e) { next(e); } });

  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  app.get("/api/health", (req, res) => { const ai = state.ai; res.json({ ok: true, app: "deflate-lens", ai: ai ? { kind: ai.kind, model: ai.model, mock: !!ai.mock } : null, keyConfigurable: true, research: research ? research.config : null, dataDir: store.dataDir, version: require("../package.json").version }); });

  /* One-time local configuration of the model key. Body: {key}. The key is written to .env and used at once; the
     response carries only the model name. Mock mode is never switched on here. */
  app.post("/api/settings/anthropic-key", wrap(async (req, res) => {
    const key = String(req.body && req.body.key || "");
    const r = settings.setAnthropicKey(key);
    process.env.ANTHROPIC_API_KEY = key.trim();
    if (!(process.env.DEFLATE_MOCK_AI === "1" || process.env.DEFLATE_MOCK_AI === "true")) state.ai = createAI(process.env);
    res.json({ ok: true, file: r.file, ai: state.ai ? { kind: state.ai.kind, model: state.ai.model, mock: !!state.ai.mock } : null });
  }));

  /* Link importer: readable text or a plain reason it could not be read. Stores nothing. */
  app.post("/api/import", wrap(async (req, res) => { const out = await importer(req.body && req.body.url); res.json(out); }));

  app.get("/api/runs", wrap(async (req, res) => res.json(await store.listRuns())));
  app.post("/api/runs", wrap(async (req, res) => { const id = await store.createRun(req.body.run || {}, req.body.transcript || ""); res.json(await store.bundle(id)); }));
  app.get("/api/runs/:id", wrap(async (req, res) => { const b = await store.bundle(req.params.id); if (!b) return res.status(404).json({ error: "run not found" }); res.json(b); }));
  app.put("/api/runs/:id", wrap(async (req, res) => { await store.saveRun(req.params.id, req.body.run || {}, typeof req.body.transcript === "string" ? req.body.transcript : undefined); res.json(await store.bundle(req.params.id)); }));
  app.delete("/api/runs/:id", wrap(async (req, res) => { const name = await store.deleteRun(req.params.id); res.json({ ok: true, trash: name }); }));
  app.get("/api/trash", wrap(async (req, res) => res.json(await store.listTrash())));
  app.post("/api/trash/:name/restore", wrap(async (req, res) => { const id = await store.restoreRun(req.params.name); res.json({ ok: true, id }); }));
  /* Records parked by a re-segment, reattached by hand to a claim of the current reading. */
  app.post("/api/runs/:id/orphans/:oid/attach", wrap(async (req, res) => { await store.attachOrphan(req.params.id, req.params.oid, req.body && req.body.pid, req.body && req.body.idx); res.json(await store.bundle(req.params.id)); }));
  app.post("/api/runs/:id/duplicate", wrap(async (req, res) => { const nid = await store.duplicateRun(req.params.id); res.json(await store.bundle(nid)); }));

  app.put("/api/runs/:id/passages/:pid", wrap(async (req, res) => { const body = req.body || {}; const expectedReadingRev = body.expectedReadingRev; delete body.expectedReadingRev; await store.savePassage(req.params.id, req.params.pid, body, { expectedReadingRev }); res.json(await store.bundle(req.params.id)); }));
  app.post("/api/runs/:id/passages", wrap(async (req, res) => { const list = Array.isArray(req.body.passages) ? req.body.passages : []; await store.replacePassages(req.params.id, list); res.json(await store.bundle(req.params.id)); }));
  app.put("/api/runs/:id/summary", wrap(async (req, res) => { await store.saveSummary(req.params.id, req.body || {}); res.json(await store.bundle(req.params.id)); }));

  app.post("/api/runs/:id/attachments", wrap(async (req, res) => {
    const { name, mediaType, data, transcribedText } = req.body || {};
    if (!/^image\/(png|jpeg|webp|gif)$/.test(String(mediaType))) return res.status(400).json({ error: "only png, jpeg, webp or gif pictures" });
    const bytes = Buffer.from(String(data || ""), "base64");
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) return res.status(400).json({ error: "picture is empty or over 20 MB" });
    const entry = await store.addAttachment(req.params.id, { name, mediaType, bytes, transcribedText });
    res.json(entry);
  }));
  app.get("/api/runs/:id/attachments/:aid", wrap(async (req, res) => {
    const a = await store.attachmentPath(req.params.id, req.params.aid);
    if (!a) return res.status(404).end();
    res.type(a.mediaType); res.sendFile(a.path);
  }));

  /* Obligations: every empirical claim as a Receipts-shaped EvidenceObligation (src/surfacing/obligations.py to_json). */
  app.get("/api/runs/:id/obligations.json", wrap(async (req, res) => { const b = await store.bundle(req.params.id); if (!b) return res.status(404).json({ error: "run not found" }); res.setHeader("Content-Disposition", "attachment; filename=\"" + safeName(b.run.title) + ".obligations.json\""); res.json(buildObligations(b)); }));

  /* ---- claim mutations: every one addressed by claim id, applied to the CURRENT reading under the run's lock ----
     A client may send expectedReadingRev (the reading it rendered); a mismatch is refused with 409 instead of being
     written over the newer reading. Nothing here writes a client snapshot back; see store.mutateClaim. */
  async function loadClaim(id, pid, cid) {
    const b = await store.bundle(id); if (!b) { const e = new Error("run not found"); e.status = 404; throw e; }
    const p = b.passages.find(x => x.id === pid); if (!p || !p.analysis) { const e = new Error("passage not found or not analysed"); e.status = 404; throw e; }
    const i = (p.analysis.claims || []).findIndex(x => x.id === cid); const c = i === -1 ? null : p.analysis.claims[i];
    if (!c) { const e = new Error("that claim is not in the current reading of this passage"); e.status = 404; e.code = "claim_not_current"; throw e; }
    return { b, p, c, i };
  }
  function provisionalReasons(b, p) {
    const out = (p.stale || []).slice();
    const pr = b.run.provenance || {};
    if (!pr.notApplicable && !pr.confirmedAt) out.push("attribution not confirmed by a person");
    return out;
  }
  const rev = req => (req.body && req.body.expectedReadingRev != null) ? Number(req.body.expectedReadingRev) : null;

  app.post("/api/runs/:id/passages/:pid/claims/:cid/search", wrap(async (req, res) => {
    if (!research) return res.status(503).json({ error: "research is not configured", code: "no_research" });
    const { b, p, c, i } = await loadClaim(req.params.id, req.params.pid, req.params.cid);
    if (b.run.example) return res.status(403).json({ error: "the supplied example is read-only; copy it to search" });
    if (rev(req) != null && rev(req) !== (p.readingRev || 0)) return res.status(409).json({ error: "the card changed since you looked; reload and search again", code: "stale_reading" });
    const readingRev = p.readingRev || 0, provisional = provisionalReasons(b, p);
    const startedWith = { claimId: c.id, claimText: c.text, speaker: c.speaker || "", readingRev };
    const out = await research.searchClaim({ run: b.run, passage: p, claim: c, idx: i, limit: 8 });   // no lock held while the services answer
    const attempts = out.attempts.map(a => Object.assign({ runStartedAt: out.startedAt, readingRev, provisional: provisional.length ? provisional : undefined }, a));
    // commit into the latest document; if the claim is gone from the current reading, park the result instead
    let fresh = [], parked = null, late = false;
    try {
      await store.mutateClaim(req.params.id, req.params.pid, c.id, (claim, cur) => {
        late = (cur.readingRev || 0) !== readingRev;
        claim.obligation = out.obligation;
        claim.searches = (claim.searches || []).concat(attempts.map(a => late ? Object.assign({ late: true, attachedReadingRev: cur.readingRev || 0 }, a) : a));
        const keep = (claim.candidates || []).filter(x => x.status !== "candidate");
        const decidedKeys = new Set(keep.map(x => x.doi ? "doi:" + x.doi : "id:" + x.id));
        fresh = out.candidates.filter(x => !decidedKeys.has(x.doi ? "doi:" + x.doi : "id:" + x.id));
        claim.candidates = keep.concat(fresh);
        claim.lastSearchedAt = out.finishedAt;
      });
    } catch (e) {
      if (e.code !== "claim_not_current") throw e;
      parked = await store.parkRecords(req.params.id, { claimId: startedWith.claimId, claimText: startedWith.claimText, speaker: startedWith.speaker, from: { reading: readingRev, passage: req.params.pid, title: p.title || "", turnStart: p.turnStart, turnEnd: p.turnEnd }, searches: attempts.map(a => Object.assign({ late: true }, a)), candidates: out.candidates, obligation: out.obligation, why: "the reading changed while the search ran; the claim is no longer in it" });
    }
    res.json({ attempts, candidates: parked ? [] : fresh, obligation: out.obligation, provisional, late, parked: parked ? { id: parked.id, why: parked.why } : null, bundle: await store.bundle(req.params.id) });
  }));

  app.post("/api/runs/:id/passages/:pid/claims/:cid/candidates/:cand/accept", wrap(async (req, res) => {
    const { b } = await loadClaim(req.params.id, req.params.pid, req.params.cid);
    if (b.run.example) return res.status(403).json({ error: "the supplied example is read-only" });
    let outcome = "accepted";
    await store.mutateClaim(req.params.id, req.params.pid, req.params.cid, (c) => {
      const cand = (c.candidates || []).find(x => x.id === req.params.cand); if (!cand) { const e = new Error("candidate not found"); e.status = 404; throw e; }
      if (cand.status === "accepted") { outcome = "already accepted"; return; } // idempotent: one candidate, one active receipt
      if (cand.status === "rejected") { const e = new Error("this candidate was rejected (" + ((c.rejections || []).find(r => r.candidateId === cand.id) || {}).reason + "); to use it, reject the rejection first by attaching it as a source by hand"); e.status = 409; e.code = "candidate_rejected"; throw e; }
      cand.status = "accepted"; cand.decidedAt = new Date().toISOString();
      c.receipts = (c.receipts || []).concat([{ rid: "rc_" + cand.id, kind: "document", url: cand.url, note: String(req.body && req.body.note || "").slice(0, 500), addedBy: "person at this computer", at: cand.decidedAt,
        title: cand.title, doi: cand.doi || "", pmid: cand.pmid || "", pmc: cand.pmc || "", journal: cand.journal || "", authors: cand.authors || [], publishedAt: cand.publishedAt || "", retrievedAt: cand.retrievedAt || "",
        foundBy: cand.foundBy || [cand.adapter], notices: cand.notices || [], statusCheck: cand.statusCheck || null, candidateId: cand.id }]);
    }, { expectedReadingRev: rev(req) });
    res.json(Object.assign({ outcome }, await store.bundle(req.params.id)));
  }));

  /* Rejecting a candidate that was accepted earlier withdraws its receipt (kept on record, marked withdrawn with the
     reason), so a claim never keeps an active source from a document a person has since rejected. */
  app.post("/api/runs/:id/passages/:pid/claims/:cid/candidates/:cand/reject", wrap(async (req, res) => {
    const { b } = await loadClaim(req.params.id, req.params.pid, req.params.cid);
    if (b.run.example) return res.status(403).json({ error: "the supplied example is read-only" });
    const reason = REJECTION_REASONS.includes(req.body && req.body.reason) ? req.body.reason : "does_not_address_claim";
    let outcome = "rejected";
    await store.mutateClaim(req.params.id, req.params.pid, req.params.cid, (c) => {
      const cand = (c.candidates || []).find(x => x.id === req.params.cand); if (!cand) { const e = new Error("candidate not found"); e.status = 404; throw e; }
      if (cand.status === "rejected") { outcome = "already rejected"; return; }
      const now = new Date().toISOString();
      if (cand.status === "accepted") { outcome = "rejected; its source withdrawn"; (c.receipts || []).forEach(r => { if (r.candidateId === cand.id && !r.withdrawnAt) { r.withdrawnAt = now; r.withdrawnBy = "person at this computer"; r.withdrawReason = "candidate rejected: " + reason + (req.body && req.body.detail ? " (" + String(req.body.detail).slice(0, 200) + ")" : ""); } }); }
      cand.status = "rejected"; cand.decidedAt = now;
      c.rejections = (c.rejections || []).concat([{ candidateId: cand.id, doi: cand.doi || "", url: cand.url || "", title: cand.title || "", reason, detail: String(req.body && req.body.detail || "").slice(0, 500), by: "person at this computer", at: now, withdrewReceipt: outcome.includes("withdrawn") }]);
    }, { expectedReadingRev: rev(req) });
    res.json(Object.assign({ outcome }, await store.bundle(req.params.id)));
  }));

  /* A source attached by hand: a link and a one-line note. Recorded as a person's judgment of relevance, nothing more. */
  app.post("/api/runs/:id/passages/:pid/claims/:cid/receipts", wrap(async (req, res) => {
    const { b } = await loadClaim(req.params.id, req.params.pid, req.params.cid);
    if (b.run.example) return res.status(403).json({ error: "the supplied example is read-only" });
    const rc = V.validateReceiptLink(req.body && req.body.url, req.body && req.body.note);
    await store.mutateClaim(req.params.id, req.params.pid, req.params.cid, (c) => { c.receipts = (c.receipts || []).concat([Object.assign({ rid: "rl_" + Math.random().toString(36).slice(2, 10) }, rc)]); }, { expectedReadingRev: rev(req) });
    res.json(await store.bundle(req.params.id));
  }));

  /* The search query and source types a person edits in Details. */
  app.put("/api/runs/:id/passages/:pid/claims/:cid/routing", wrap(async (req, res) => {
    const { b } = await loadClaim(req.params.id, req.params.pid, req.params.cid);
    if (b.run.example) return res.status(403).json({ error: "the supplied example is read-only" });
    const r = V.validateRouting(req.body);
    await store.mutateClaim(req.params.id, req.params.pid, req.params.cid, (c) => { if ("searchQuery" in r) c.searchQuery = r.searchQuery; if ("expectedSources" in r) c.expectedSources = r.expectedSources; c.routingEditedAt = new Date().toISOString(); c.routingEditedBy = "person at this computer"; }, { expectedReadingRev: rev(req) });
    res.json(await store.bundle(req.params.id));
  }));

  /* A receipt is never deleted; a person can withdraw it with a reason, and it stays on record marked withdrawn. */
  app.post("/api/runs/:id/passages/:pid/claims/:cid/receipts/:rid/withdraw", wrap(async (req, res) => {
    const { b } = await loadClaim(req.params.id, req.params.pid, req.params.cid);
    if (b.run.example) return res.status(403).json({ error: "the supplied example is read-only" });
    await store.mutateClaim(req.params.id, req.params.pid, req.params.cid, (c) => {
      const rc = (c.receipts || []).find(x => x.rid === req.params.rid); if (!rc) { const e = new Error("receipt not found"); e.status = 404; throw e; }
      if (!rc.withdrawnAt) { rc.withdrawnAt = new Date().toISOString(); rc.withdrawnBy = "person at this computer"; rc.withdrawReason = String(req.body && req.body.reason || "").slice(0, 500); }
      if (rc.candidateId) { const cand = (c.candidates || []).find(x => x.id === rc.candidateId); if (cand && cand.status === "accepted") { cand.status = "withdrawn"; cand.decidedAt = rc.withdrawnAt; } }
    }, { expectedReadingRev: rev(req) });
    res.json(await store.bundle(req.params.id));
  }));

  app.get("/api/runs/:id/export.json", wrap(async (req, res) => { const b = await store.bundle(req.params.id); if (!b) return res.status(404).json({ error: "run not found" }); res.setHeader("Content-Disposition", "attachment; filename=\"" + safeName(b.run.title) + ".deflate.json\""); res.json(buildExport(b)); }));
  app.get("/api/runs/:id/export.md", wrap(async (req, res) => { const b = await store.bundle(req.params.id); if (!b) return res.status(404).json({ error: "run not found" }); const level = req.query.level === "g5" ? "g5" : "hs"; res.setHeader("Content-Disposition", "attachment; filename=\"" + safeName(b.run.title) + (level === "g5" ? ".fifth-grade" : "") + ".deflate.md\""); res.type("text/markdown").send(buildMarkdown(b, level)); }));

  /* The model call. The page sends {prompt, json, images:[{mediaType,data}]} and gets {data|text, usage, model}. */
  app.post("/api/sample", wrap(async (req, res) => {
    const ai = state.ai;
    if (!ai) return res.status(503).json({ error: "No model configured. Add your Anthropic API key (the page asks for it once, or put ANTHROPIC_API_KEY in .env and restart).", code: "no_ai" });
    const { prompt, json, images } = req.body || {};
    if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "prompt required", code: "invalid_request" });
    if (Buffer.byteLength(prompt, "utf8") > 400000) return res.status(400).json({ error: "prompt too large", code: "prompt_too_large" });
    const ctl = new AbortController();
    req.on("close", () => { if (!res.writableEnded) ctl.abort(); });
    try {
      const out = await ai.sample({ prompt, json: !!json, images: Array.isArray(images) ? images.slice(0, 8) : [], signal: ctl.signal });
      res.json(out);
    } catch (e) {
      if (ctl.signal.aborted) return;
      res.status(e.code === "bad_key" ? 401 : e.code === "rate_limited" ? 429 : e.code === "invalid_json" ? 422 : 502).json({ error: e.message, code: e.code || "upstream_error", text: e.text });
    }
  }));

  app.use("/shared", express.static(path.join(__dirname, "..", "shared")));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json(Object.assign({ error: err.message || "server error" }, err.code ? { code: err.code } : {}));
  });

  return { app, store, state, get ai() { return state.ai; }, ready };
}

function safeName(s) { return String(s || "run").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60) || "run"; }

module.exports = { createApp };
