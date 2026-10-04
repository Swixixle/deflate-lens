"use strict";
const shared = require("../shared/transcript");
const P = require("../shared/prompts");
const Q = require("./quality");
const V = require("./validate");
const { newId, nowISO, autoTitle, sha256 } = require("./store");
const { cleanText } = require("./intake");
const { obligationFor } = require("./research");
const { prepareSpeakers, callModel, unreadable, reviewedReading, reviewedOverview, claimAnalysis } = require("./preparation");

function requestedBasis(b, patterns) {
  const basis = { inputHash: b.run.input.sha256, transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig };
  if (patterns) {
    basis.preparedOnly = true;
    basis.passagesSig = b.passages.filter(p => p.readingGate.status === "ready" && !p.stale.length).map(p => p.id + "@" + (p.analyzedAt || "")).join(",");
  }
  return basis;
}
/* What one reading is made from: the passage turns, plus up to two neighbouring turns on each side for interpretation
   (shared.readingContext), the same text for the generation and its review. The context record (turn ids, speakers,
   omissions, size, version, and a hash of the exact text sent) goes on the model call and from there onto the passage.
   The automatic reading and a reread from a card both use this one function. */
function readingMaterial(b, p) {
  if (b.run.kind === "claim") {
    const text = b.transcript;
    return { purpose: "claim", prompt: P.claim(b.run, text), source: "CLAIM (typed by a person):\n" + text, context: null };
  }
  const turns = shared.parseTranscript(b.transcript, { mode: b.run.parseMode }), ov = b.run.provenance.overrides;
  const target = shared.fmtTurns(turns, ov, p.turnStart, p.turnEnd);
  const ctx = shared.readingContext(turns, ov, p.turnStart, p.turnEnd, { turns: 2, chars: 4000 });
  const source = (ctx.beforeText ? "CONTEXT BEFORE (for interpretation only):\n" + ctx.beforeText + "\n\n" : "") + "PASSAGE (turns " + p.turnStart + "–" + p.turnEnd + "):\n" + target +
    (ctx.afterText ? "\n\nCONTEXT AFTER (for interpretation only):\n" + ctx.afterText : "") +
    (ctx.record.omitted.length ? "\n\nNot shown (too long): " + ctx.record.omitted.map(o => "turn " + o.turn).join(", ") : "");
  return { purpose: "deflate", prompt: P.deflate(b.run, p, target, { beforeText: ctx.beforeText, afterText: ctx.afterText, omitted: ctx.record.omitted }), source,
    context: Object.assign({}, ctx.record, { hash: sha256(source) }) };
}
/* What is ready, what is held, and the first held reason in plain words: enough to decide whether to retry. */
function partialMessage(done, total, issues) {
  const held = issues.filter(x => x.passage), first = (issues.find(x => (x.reasons || []).length) || {}).reasons;
  return done + " of " + total + " readings are ready. " + (held.length ? (held.length === 1 ? "One passage" : held.length + " passages") + " could not pass " + (held.length === 1 ? "its" : "their") + " checks and " + (held.length === 1 ? "is" : "are") + " held" : "The closing overview is held") +
    (first && first.length ? " (" + String(first[0]).replace(/\.$/, "") + ")" : "") + ". Press Read this to try " + (held.length === 1 ? "it" : "them") + " again; finished readings are kept.";
}
function stopped() { return Object.assign(new Error("Reading stopped. Prepared readings have been kept."), { code: "cancelled" }); }
function plainError(e) {
  const code = e && e.code;
  if (code === "bad_key") return "The model key was not accepted. Replace it and press Read this again.";
  if (code === "rate_limited") return "The model service is busy. Your work is saved; try Read this again in a moment.";
  if (code === "no_ai") return "Add your model key once to continue.";
  if (code === "input_changed" || code === "stale_reading" || code === "claim_edited") return "The input changed while it was being read. Press Read this to use the current text.";
  if (code === "reading_held") return "A reading could not pass its checks. It has been held back; prepared readings are saved.";
  if (code === "invalid_json" || code === "truncated") return "The model's answer could not be read" + (code === "truncated" ? " (it was cut off at its length limit)" : "") + ", even after one correction. Your text and finished readings are saved. Press Read this to try again.";
  if (code === "segmentation_held") return "The conversation could not be divided into passages after one correction. Your text is saved. Press Read this to try again.";
  return "The reading could not finish. Your input and prepared readings are saved. Press Read this to continue.";
}

// One background job per run. Closing or refreshing the browser does not cancel it. Every
// write checks the input and job under the store lock, so a stopped job cannot publish late.
function createReader({ store, getAI, searchClaim, research }) {
  const jobs = new Map();
  /* opts (all optional, from a person's request in Controls or a card's Evidence): reread = a passage id to read again
     even though it is prepared; overview = write the closing overview again; resegment = organize the passages again.
     A plain start (Read this) reads whatever is not prepared yet. */
  async function start(id, opts) {
    opts = opts || {};
    const asked = !!(opts.reread || opts.overview || opts.resegment);
    const previous = jobs.get(id);
    if (previous && !previous.controller.signal.aborted) {
      if (asked) throw Object.assign(new Error("A reading is already running. Wait for it to finish, or press Stop first."), { status: 409, code: "reading_running" });
      await previous.init; return store.bundle(id);
    }
    const job = { id: newId("read"), controller: new AbortController(), inputHash: "", attrSig: "", opts };
    jobs.set(id, job);
    job.init = (async () => {
      let b = await store.bundle(id);
      if (!b || b.run.example) throw Object.assign(new Error(b ? "Copy this example to prepare it." : "Reading not found."), { status: b ? 403 : 404 });
      const c = cleanText(b.transcript, { captions: false }), doc = {};
      const imp = b.run.import;
      if (imp && imp.url) {
        doc.sourceUrl = imp.url;
        // the page importer knows only the page title; the transcript chain already composed "show — episode" and keeps it
        if (imp.title && (!b.run.sourceLabel || !imp.source)) doc.sourceLabel = imp.title;
        if (imp.title && (/^(?:Listen LIVE|Untitled run)$/i.test(b.run.title) || b.run.title === autoTitle(b.transcript, b.run.kind))) doc.title = imp.title;
      }
      if (c.text !== b.transcript || Object.keys(doc).some(k => doc[k] !== b.run[k])) {
        await store.repairIntake(id, c.text, doc, c.original, Object.assign(c.record, { source: (b.run.intake && b.run.intake.source) || "saved-input", at: nowISO() }), b.run.input.sha256);
        b = await store.bundle(id);
      }
      if (opts.reread && !b.passages.some(p => p.id === opts.reread)) throw Object.assign(new Error("That passage is no longer part of this reading."), { status: 404, code: "stale_reading" });
      job.inputHash = b.run.input.sha256; job.attrSig = b.attrSig;
      await store.saveProcessing(id, { id: job.id, status: "running", phase: "starting", message: opts.reread ? "Reading this passage again…" : opts.overview ? "Writing the overview again…" : opts.resegment ? "Organizing the passages again…" : "Preparing your reading…", startedAt: nowISO(), finishedAt: null, inputHash: job.inputHash,
        done: 0, total: b.passages.length, issues: [], error: null, request: asked ? { reread: opts.reread || "", overview: !!opts.overview, resegment: !!opts.resegment } : null });
      return b;
    })();
    job.done = job.init.then(() => execute(id, job)).catch(async e => {
      try {
        await store.saveProcessing(id, { status: e.code === "cancelled" || job.controller.signal.aborted ? "stopped" : e.code === "no_ai" ? "awaiting_key" : "error",
          phase: "finished", message: e.code === "cancelled" || job.controller.signal.aborted ? "Stopped. Your prepared readings are saved." : plainError(e), error: { code: String(e.code || "reading_error"), message: String(e.message || "").slice(0, 500) }, finishedAt: nowISO() }, job.id);
      } catch (_) { /* A removed run or newer job must not be recreated. */ }
    }).finally(() => { if (jobs.get(id) === job) jobs.delete(id); });
    try { await job.init; return store.bundle(id); } catch (e) { await job.done; throw e; }
  }
  async function stop(id) {
    const job = jobs.get(id);
    if (job) { job.controller.abort(); try { await job.init; } catch (_) {} }
    const b = await store.bundle(id);
    if (!b) throw Object.assign(new Error("Reading not found."), { status: 404 });
    if (b.run.processing && b.run.processing.status === "running") await store.saveProcessing(id, { status: "stopped", message: "Stopped. Your prepared readings are saved.", finishedAt: nowISO() }, b.run.processing.id);
    return store.bundle(id);
  }
  async function check(id, job) {
    if (job.controller.signal.aborted) throw stopped();
    const b = await store.bundle(id);
    if (!b || !b.run.processing || b.run.processing.id !== job.id || b.run.processing.status !== "running") throw stopped();
    if (b.run.input.sha256 !== job.inputHash || b.attrSig !== job.attrSig) throw Object.assign(new Error("Input changed during reading."), { code: "input_changed" });
    return b;
  }
  const options = job => ({ expectedInputHash: job.inputHash, expectedAttrSig: job.attrSig, jobId: job.id });
  async function update(id, job, value) { await check(id, job); return store.saveProcessing(id, value, job.id); }
  async function searchSources(id, job) {
    if (!research) return;
    let b = await check(id, job);
    const claims = b.passages.filter(p => p.readingGate.status === "ready").flatMap(p => p.analysis.claims
      .filter((c, i) => ["claim", "fact", "contested", "unsupported"].includes(c.type) &&
        (!(c.searches || []).length || !c.obligation || !c.obligation.routing_hints || c.obligation.routing_hints.search_query !== obligationFor(b.run, p, c, i).routing_hints.search_query)).map(c => ({ p, c })));
    for (let i = 0; i < claims.length; i++) {
      await update(id, job, { phase: "sources", message: (b.run.kind === "claim" && !getAI() ? "Finding sources" : "Reading prepared · finding sources") + " (" + (i + 1) + " of " + claims.length + ")…" });
      // Search commits by claim identity, preserving decisions and recording late results.
      // It proposes links only; finding a paper never establishes the claim as true.
      try { await searchClaim(id, claims[i].p.id, claims[i].c.id, claims[i].p.readingRev || 0); }
      catch (e) { if (["cancelled", "input_changed"].includes(e.code)) throw e; await store.saveProcessing(id, { sourceError: "Some source searches could not finish. Their readings are still available." }, job.id); }
      await check(id, job);
    }
  }

  async function segment(id, job, ai, b) {
    const turns = shared.parseTranscript(b.transcript, { mode: b.run.parseMode });
    const ranges = shared.chunkRanges(turns, 22000), found = [], calls = [];
    for (const [index, [a, z]] of ranges.entries()) {
      await update(id, job, { phase: "organizing", message: "Organizing the interview (" + (index + 1) + " of " + ranges.length + ")…" });
      const prompt = P.segment(b.run, shared.fmtTurns(turns, b.run.provenance.overrides, a, z));
      const basis = await store.captureCallBasis(id, requestedBasis(b), "segment");
      let items = [], problem = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        let call;
        try { call = await callModel(ai, store, id, "segment", basis, prompt + (problem ? "\nYour previous response could not be used: " + problem + ". Use only the numbered turns in this section." : ""), job.controller.signal); }
        catch (e) {
          if (!unreadable(e)) throw e;
          problem = e.code === "truncated" ? "it was cut off at the length limit; reply with ONLY the complete JSON, with short titles and stakes" : "it was not well-formed JSON; reply with ONLY the JSON object";
          calls.push(e.callId || ""); continue;
        }
        await call.save(); calls.push(call.call.callId); await check(id, job);
        const out = call.out.data;
        if (!out || !Array.isArray(out.passages) || !out.passages.length) { problem = "No passages were returned"; continue; }
        try {
          items = out.passages.map(x => {
            if (!Number.isInteger(x.turnStart) || !Number.isInteger(x.turnEnd) || x.turnStart < a || x.turnEnd > z) throw new Error("A passage used a turn outside this section");
            return V.validatePassageDoc(Object.assign({}, x, { status: "pending", speakers: [...new Set(turns.slice(x.turnStart, x.turnEnd + 1).filter(t => !t.heading).map(t => shared.effSpeaker(t, b.run.provenance.overrides)))], segmentedBy: ai.mock ? "MOCK" : ai.model }), turns.length, { kind: b.run.kind });
          }).sort((x, y) => x.turnStart - y.turnStart);
          if (items.some((x, i) => i && x.turnStart <= items[i - 1].turnEnd)) throw new Error("Passages overlapped");
          problem = ""; break;
        } catch (e) { items = []; problem = e.message; }
      }
      if (!items.length) throw Object.assign(new Error("The interview could not be organized after an automatic retry (" + problem + ")."), { code: "segmentation_held" });
      found.push(...items);
    }
    if (!found.length) throw Object.assign(new Error("No transcript passages were found."), { code: "segmentation_held" });
    await store.replacePassages(id, found, options(job));
    await update(id, job, { segmentationHash: job.inputHash, segmentationAttr: job.attrSig, segmentCalls: calls, total: found.length });
  }

  async function patterns(id, job, ai, b) {
    if (b.passages.length < 2) return;
    if (b.summary && b.summary.readingGate.status === "ready" && !job.opts.overview) return;
    const ready = b.passages.filter(p => p.readingGate.status === "ready");
    if (ready.length !== b.passages.length) return; // Never call a partial interview a whole-run pattern.
    await update(id, job, { phase: "overview", message: "Writing the overview…" });
    const basis = await store.captureCallBasis(id, requestedBasis(b, true), "patterns"), prompt = P.patterns(b.run, ready);
    const res = await reviewedOverview({ai,store,b,prompt,basis,signal:job.controller.signal,contract:P.CONTRACT});
    await check(id,job);
    await store.saveSummary(id,Object.assign(res.data,{callId:res.provenance.callId,createdAt:nowISO(),passagesCounted:ready.length,leftOut:[],model:res.model||ai.model,by:ai.mock?"MOCK":ai.model,contract:P.CONTRACT}),options(job));
  }

  async function execute(id, job) {
    let b = await check(id, job), ai = getAI();
    if (!ai) {
      if (b.run.kind === "claim") await searchSources(id, job);
      await update(id, job, { status: "awaiting_key", phase: "key", message: b.run.kind === "claim" ? "Your claim and source search are ready. Add the model key once for a plain-language reading." : "Your transcript is saved. Add the model key once and the reading will continue automatically.", finishedAt: nowISO() });
      return;
    }
    if (b.attributionGate.status !== "ready") {
      await update(id, job, { phase: "speakers", message: "Checking who said what…" });
      b = await prepareSpeakers({ ai, store, id, signal: job.controller.signal });
      if (job.controller.signal.aborted) throw stopped();
      job.attrSig = b.attrSig;
      await check(id, job);
      if (b.attributionGate.status !== "ready") {
        await update(id, job, { status: "held", phase: "speakers", message: "The text leaves some speakers uncertain, so the reading is held back. A transcript with reliable speaker labels or the recording is needed.", finishedAt: nowISO() });
        return;
      }
    }
    b = await check(id, job);
    const process = b.run.processing;
    if (b.run.kind !== "claim" && (job.opts.resegment || !(process.segmentationHash === job.inputHash && process.segmentationAttr === job.attrSig && b.passages.length) &&
        !(b.passages.length && b.passages.every(p => p.readingGate.status === "ready")))) {
      await segment(id, job, ai, b); b = await check(id, job);
    }
    const issues = [];
    const needs = p => p.readingGate.status !== "ready" || b.run.kind === "claim" && p.analysis.by === "person" || p.id === job.opts.reread;
    for (const item of b.passages.filter(needs)) {
      const current = await check(id, job), p = current.passages.find(x => x.id === item.id);
      if (!p) throw Object.assign(new Error("The cards changed."), { code: "stale_reading" });
      const done = current.passages.filter(x => x.readingGate.status === "ready" && !(current.run.kind === "claim" && x.analysis.by === "person")).length;
      const position = current.passages.findIndex(x => x.id === p.id) + 1;
      await update(id, job, { phase: "reading", done, total: current.passages.length, current: p.id, message: current.run.kind === "claim" ? "Reading the claim…" : p.id === job.opts.reread ? "Reading passage " + position + " of " + current.passages.length + " again…" : "Reading passage " + position + " of " + current.passages.length + "…" });
      const m = readingMaterial(current, p), purpose = m.purpose;
      const basis = await store.captureCallBasis(id, requestedBasis(current), purpose);
      try {
        const res = await reviewedReading({ ai, store, b: current, p, purpose, prompt: m.prompt, basis, signal: job.controller.signal, source: m.source, contract: P.CONTRACT, context: m.context });
        await check(id, job);
        await store.savePassage(id, p.id, Object.assign({}, p, { analysis: purpose === "claim" ? claimAnalysis(res.data, current, P.CONTRACT) : res.data, status: "done", analyzedAt: nowISO(), analyzedBy: ai.mock ? "MOCK" : ai.model,
          model: res.model || ai.model, usage: res.usage, callId: res.provenance.callId, error: "", held: null }), Object.assign(options(job), { expectedReadingRev: p.readingRev || 0 }));
      } catch (e) {
        if (e.code !== "reading_held") throw e;
        const held = { issues: e.issues && e.issues.length ? e.issues : ["The separate review did not approve the draft."], at: nowISO(), callId: e.callId || "" };
        // A reread a person asked for that fails keeps the ready reading it was meant to replace, with the failed attempt
        // noted; it is not counted as held material. Anything else that fails is held and says why.
        const keep = p.id === job.opts.reread && p.readingGate.status === "ready";
        if (!keep) issues.push({ passage: p.id, code: e.code, message: e.message, reasons: held.issues });
        await store.savePassage(id, p.id, Object.assign({}, p, keep ? { held: Object.assign(held, { kept: true }) } : { status: "error", error: e.code, held }), Object.assign(options(job), { expectedReadingRev: p.readingRev || 0 }));
      }
    }
    b = await check(id, job);
    const done = b.passages.filter(p => p.readingGate.status === "ready").length;
    await update(id, job, { done, total: b.passages.length, issues });
    if (!issues.length) {
      try { await patterns(id, job, ai, b); }
      catch (e) { if (e.code !== "overview_held") throw e; issues.push({ code: e.code, message: e.message, reasons: e.issues || [] }); }
    }
    await searchSources(id, job);
    await check(id, job);
    await store.saveRun(id, { status: issues.length ? "analyzed" : "complete" });
    await update(id, job, { status: issues.length ? "partial" : "complete", phase: "finished", done, total: b.passages.length, issues,
      message: issues.length ? partialMessage(done, b.passages.length, issues) : "Your reading is ready.", finishedAt: nowISO() });
  }
  async function recover() {
    for (const run of await store.listRuns()) if (!run.example) {
      const b = await store.bundle(run.id);
      if (b.run.processing && b.run.processing.status === "running") await store.saveProcessing(run.id, { status: "interrupted", message: "The server was restarted. Your prepared readings are saved; press Read this to continue." }, b.run.processing.id);
    }
  }
  return { start, stop, recover, jobs };
}
module.exports = { createReader, requestedBasis, readingMaterial };
