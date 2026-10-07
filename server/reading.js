"use strict";
const shared = require("../shared/transcript");
const P = require("../shared/prompts");
const Q = require("./quality");
const V = require("./validate");
const { newId, nowISO, autoTitle, sha256, namesSigFor } = require("./store");
const { cleanText } = require("./intake");
const { obligationFor } = require("./research");
const { prepareSpeakers, callModel, unreadable, reviewedReading, reviewedOverview, claimAnalysis } = require("./preparation");
const { structureSpeakers, CUE, AD_CUE } = require("./structure");
const { identifySpeakers, needsIdentification } = require("./identify");
const { separateVoices } = require("./voices");

/* What a model call is made from: the text (its hash and version), the speaker labels (attrSig) and, since 0.14, the
   speakers' names (namesSig), since a reading's own words name them. */
function requestedBasis(b, patterns) {
  const basis = { inputHash: b.run.input.sha256, transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig, namesSig: namesSigFor(b.run, shared.parseTranscript(b.transcript, { mode: b.run.parseMode })) };
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
function readingMaterial(b, p, version) {
  if (b.run.kind === "claim") {
    const text = b.transcript;
    return { purpose: "claim", prompt: P.claim(b.run, text), source: "CLAIM (typed by a person):\n" + text, context: null };
  }
  // (heading lines — a section title, a qualification on a line of its own — reach the model since context-2, 0.14.7;
  // a reading made under context-1 is rebuilt as it was, without them: materialAsRead passes its version)
  const headings = (version || shared.CONTEXT_VERSION) !== "context-1";
  const turns = shared.parseTranscript(b.transcript, { mode: b.run.parseMode }), ov = b.run.provenance.overrides;
  const target = shared.fmtTurns(turns, ov, p.turnStart, p.turnEnd, { headings });
  const ctx = shared.readingContext(turns, ov, p.turnStart, p.turnEnd, { turns: 2, chars: 4000, headings });
  const source = (ctx.beforeText ? "CONTEXT BEFORE (for interpretation only):\n" + ctx.beforeText + "\n\n" : "") + "PASSAGE (turns " + p.turnStart + "–" + p.turnEnd + "):\n" + target +
    (ctx.afterText ? "\n\nCONTEXT AFTER (for interpretation only):\n" + ctx.afterText : "") +
    (ctx.record.omitted.length ? "\n\nNot shown (too long): " + ctx.record.omitted.map(o => "turn " + o.turn).join(", ") : "");
  // the speaker of every passage turn is recorded with the context's, so the material can be rebuilt exactly even after
  // a label is corrected (materialAsRead)
  const speakers = turns.slice(p.turnStart, p.turnEnd + 1).filter(t => !t.heading).map(t => ({ turn: t.i, speaker: shared.effSpeaker(t, ov) }));
  return { purpose: "deflate", prompt: P.deflate(b.run, p, target, { beforeText: ctx.beforeText, afterText: ctx.afterText, omitted: ctx.record.omitted }), source,
    context: Object.assign({}, ctx.record, { target: speakers, hash: sha256(source) }) };
}
/* The exact material a saved reading was made from, rebuilt from the text version it names (store.textForHash) and the
   speakers its context record names, with a check that it hashes to what was sent. Works after the text or a label
   was changed; says so plainly when the record or the old text does not exist. */
async function materialAsRead(store, b, p) {
  const basis = p.basedOn && p.basedOn.inputHash;
  if (b.run.kind === "claim") {
    const text = await store.textForHash(b.run.id, basis);
    return text == null ? { available: false, why: "The text this reading was made from was not kept." } : { available: true, source: "CLAIM (typed by a person):\n" + text, matches: null };
  }
  const ctx = p.provenance && p.provenance.context;
  if (!ctx) return { available: false, why: "This reading was made before the material it was read from was recorded (before 0.12)." };
  const text = await store.textForHash(b.run.id, basis);
  if (text == null) return { available: false, why: "The text this reading was made from was replaced before earlier versions were kept (0.12.1); only its fingerprint remains." };
  const ov = Object.assign({}, b.run.provenance && b.run.provenance.overrides);
  [].concat(ctx.before || [], ctx.target || [], ctx.after || []).forEach(x => { ov[String(x.turn)] = x.speaker; });
  const m = readingMaterial({ run: Object.assign({}, b.run, { provenance: Object.assign({}, b.run.provenance, { overrides: ov }) }), transcript: text }, p, ctx.version || "context-1");
  return { available: true, source: m.source, matches: m.context.hash === ctx.hash, contextVersion: ctx.version, readFrom: basis, current: basis === b.run.input.sha256 };
}
/* What is ready, what is held, and the first held reason in plain words: enough to decide whether to retry. */
function partialMessage(done, total, issues) {
  // the main status says how many, nothing more; each held passage says why under its own Evidence (0.13)
  const held = issues.filter(x => x.passage).length, overview = issues.some(x => !x.passage);
  return done + " " + (done === 1 ? "reading" : "readings") + " ready. " + (held ? held + " couldn't be completed." : "") + (overview ? (held ? " " : "") + "The closing overview couldn't be completed." : "");
}
function stopped() { return Object.assign(new Error("Reading stopped. Prepared readings have been kept."), { code: "cancelled" }); }
/* `provider` (0.14.8): "openai-compatible" when another service was chosen, so the words name that service's key and
   setup instead of an Anthropic key */
function plainError(e, provider) {
  const code = e && e.code, other = provider === "openai-compatible";
  if (code === "bad_key") return other ? "The model service did not accept its key. Replace that service's key and press Read this again." : "The model key was not accepted. Replace it and press Read this again.";
  if (code === "rate_limited") return "The model service is busy. Your work is saved; try Read this again in a moment.";
  if (code === "budget") return "The cost limit set for this run was reached, so the reading stopped here. What was finished is saved.";
  if (code === "no_ai") return other ? "Finish setting up the model service chosen under Controls (its address and model) to continue." : "Add your model key once to continue.";
  if (code === "input_changed" || code === "stale_reading" || code === "claim_edited") return "The input changed while it was being read. Press Read this to use the current text.";
  if (code === "reading_held") return "A reading could not pass its checks. It has been held back; prepared readings are saved.";
  if (code === "invalid_json" || code === "truncated") return "The model's answer could not be read" + (code === "truncated" ? " (it was cut off at its length limit)" : "") + ", even after one correction. Your text and finished readings are saved. Press Read this to try again.";
  if (code === "segmentation_held") return "The conversation could not be divided into passages after one correction. Your text is saved. Press Read this to try again.";
  return "The reading could not finish. Your input and prepared readings are saved. Press Read this to continue.";
}

// One background job per run. Closing or refreshing the browser does not cancel it. Every
// write checks the input and job under the store lock, so a stopped job cannot publish late.
/* `voices` (optional): { engine(), resolver(), prefer() } — the Deepgram engine as currently configured, the transcript
   chain's resolver, and the person's audio-to-text choice ("local" keeps audio on this computer). */
function createReader({ store, getAI, searchClaim, research, voices, provider }) {
  const chosen = () => (provider ? provider() : "anthropic");
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
      // a run read as prose keeps its text exactly: the cleanup that trims page chrome around a dialogue must not
      // re-read an article's section headings as one (the run's parseMode carries that decision, 0.14.6)
      const prose = shared.isProse(b.run.parseMode);
      const c = cleanText(b.transcript, { captions: false, web: false, article: prose }), doc = {};
      const imp = b.run.import;
      if (imp && imp.url) {
        doc.sourceUrl = imp.url;
        // the page importer knows only the page title; the transcript chain already composed "show — episode" and keeps it
        if (imp.title && (!b.run.sourceLabel || !imp.source)) doc.sourceLabel = imp.title;
        if (imp.title && (/^(?:Listen LIVE|Untitled run)$/i.test(b.run.title) || b.run.title === autoTitle(b.transcript, b.run.kind))) doc.title = imp.title;
      }
      if ((!prose && c.text !== b.transcript) || Object.keys(doc).some(k => doc[k] !== b.run[k])) {
        await store.repairIntake(id, prose ? b.transcript : c.text, doc, c.original, Object.assign(c.record, { source: (b.run.intake && b.run.intake.source) || "saved-input", at: nowISO() }), b.run.input.sha256);
        b = await store.bundle(id);
      }
      if (opts.reread && !b.passages.some(p => p.id === opts.reread)) throw Object.assign(new Error("That passage is no longer part of this reading."), { status: 404, code: "stale_reading" });
      job.inputHash = b.run.input.sha256; job.attrSig = b.attrSig;
      job.namesSig = namesSigFor(b.run, shared.parseTranscript(b.transcript, { mode: b.run.parseMode }));
      await store.saveProcessing(id, { id: job.id, status: "running", phase: "starting", message: opts.reread ? "Reading this passage again…" : opts.overview ? "Writing the overview again…" : opts.resegment ? "Organizing the passages again…" : "Preparing your reading…", startedAt: nowISO(), finishedAt: null, inputHash: job.inputHash,
        done: 0, total: b.passages.length, issues: [], error: null, request: asked ? { reread: opts.reread || "", overview: !!opts.overview, resegment: !!opts.resegment } : null });
      return b;
    })();
    job.done = job.init.then(() => execute(id, job)).catch(async e => {
      try {
        await store.saveProcessing(id, { status: e.code === "cancelled" || job.controller.signal.aborted ? "stopped" : e.code === "no_ai" ? "awaiting_key" : "error",
          phase: "finished", message: e.code === "cancelled" || job.controller.signal.aborted ? "Stopped. Your prepared readings are saved." : plainError(e, chosen()), error: { code: String(e.code || "reading_error"), message: String(e.message || "").slice(0, 500) }, finishedAt: nowISO() }, job.id);
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
    // the names too (0.14.6): a reading's own words name the speakers, so work started under other names is stale.
    // The job's own naming steps refresh job.namesSig from what they committed; any other change stops the job here,
    // once, with the same plain message as a changed text, and Read this resumes on the current names.
    if (job.namesSig && job.namesSig !== namesSigFor(b.run, shared.parseTranscript(b.transcript, { mode: b.run.parseMode }))) throw Object.assign(new Error("Speaker names changed during reading."), { code: "input_changed" });
    return b;
  }
  const options = job => ({ expectedInputHash: job.inputHash, expectedAttrSig: job.attrSig, expectedNamesSig: job.namesSig, jobId: job.id });
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
      const prompt = P.segment(b.run, shared.fmtTurns(turns, b.run.provenance.overrides, a, z, { headings: true }));
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

  /* Only new input (marked at intake), only once per text, and never under readings already made. A labelled transcript is
     looked at only when its words introduce something played or read, or carry a sponsor's message; that includes text
     Deepgram transcribed with its voices (their clips and advertisements have not been looked for yet). */
  function needsStructure(b) {
    const r = b.run, pr = r.provenance || {};
    // prose (an article, 0.14.6) is nobody's conversation: no speakers are worked out for it
    if (r.kind !== "transcript" || r.example || shared.isProse(r.parseMode) || !(r.intake && r.intake.speakers === "auto")) return false;
    if (pr.structure || pr.voices && pr.voices.clipsChecked !== false || b.passages.some(p => p.analysis)) return false;
    const labels = shared.speakerLabels(shared.parseTranscript(b.transcript, { mode: r.parseMode })).filter(l => l !== "UNLABELED");
    return labels.length ? CUE.test(b.transcript) || AD_CUE.test(b.transcript) : !pr.voices && shared.wordsOf(b.transcript).split(" ").length >= 12;
  }
  /* New input from a podcast link that came without speaker labels (a feed transcript, captions, an episode page): its
     voices are separated from the episode's recording by Deepgram before anything else (voices.js), when a Deepgram key
     is set and the person has not chosen to keep audio on this computer. Once per text: a failure is recorded with its
     reason (shown under Controls), and the words are tried instead. */
  const cloud = () => { const e = voices && voices.engine && voices.engine(); return e && e.configured() ? e : null; };
  const keepsAudioLocal = () => !!(voices && voices.prefer && voices.prefer() === "local");
  const recordingOf = r => { const imp = r.import || {}, info = imp.episodeInfo || {}; return !!(info.audioUrl || imp.url && info.guid); };
  function needsVoices(b) {
    const r = b.run, pr = r.provenance || {}, src = (r.import || {}).source || {};
    if (r.kind !== "transcript" || r.example || shared.isProse(r.parseMode) || !(r.intake && r.intake.speakers === "auto") || b.passages.some(p => p.analysis)) return false;
    if (pr.voices || pr.voicesAttempt && pr.voicesAttempt.inputHash === r.input.sha256) return false;
    if (src.kind === "audio-transcription" || !recordingOf(r) || !cloud() || keepsAudioLocal()) return false;
    const labels = shared.speakerLabels(shared.parseTranscript(b.transcript, { mode: r.parseMode })).filter(l => l !== "UNLABELED");
    return !labels.length && shared.wordsOf(b.transcript).split(" ").length >= 12;
  }
  /* Why the recording was not tried, for new input from a link or a file that came without speaker labels, where trying
     it would have been the first step (0.14.2): no recording known, audio kept on this computer, or no Deepgram key.
     Recorded once per text with status "skipped", so Controls, the exports and the record tell a skipped attempt from a
     failed one. Null when the recording was not relevant (labels came with the text, or the text came from it). */
  function voicesSkipped(b) {
    const r = b.run, pr = r.provenance || {}, imp = r.import || {}, src = imp.source || {};
    if (r.kind !== "transcript" || r.example || shared.isProse(r.parseMode) || !(r.intake && r.intake.speakers === "auto") || b.passages.some(p => p.analysis)) return null;
    if (!src.kind || src.kind === "audio-transcription" || pr.voices || pr.voicesAttempt && pr.voicesAttempt.inputHash === r.input.sha256) return null;
    const labels = shared.speakerLabels(shared.parseTranscript(b.transcript, { mode: r.parseMode })).filter(l => l !== "UNLABELED");
    if (labels.length || shared.wordsOf(b.transcript).split(" ").length < 12) return null;
    if (!recordingOf(r)) return { code: "no_recording", why: "No recording was found for this text, so the voices were not separated from one; the words are used to find the speakers instead." };
    if (keepsAudioLocal()) return { code: "audio_kept_local", why: "Audio is set to stay on this computer, so the recording was not sent to Deepgram to separate the voices; the words are used to find the speakers instead." };
    if (!cloud()) return { code: "no_deepgram_key", why: "No Deepgram key is set, so the recording was not sent to Deepgram to separate the voices; the words are used to find the speakers instead." };
    return null;
  }
  async function execute(id, job) {
    let b = await check(id, job), ai = getAI();
    if (!ai) {
      if (b.run.kind === "claim") await searchSources(id, job);
      const other = chosen() === "openai-compatible";
      await update(id, job, { status: "awaiting_key", phase: "key", message: b.run.kind === "claim"
        ? (other ? "Your claim and source search are ready. Finish setting up the model service chosen under Controls for a plain-language reading." : "Your claim and source search are ready. Add the model key once for a plain-language reading.")
        : (other ? "Your transcript is saved. Finish setting up the model service chosen under Controls (its address and model) and the reading will continue." : "Your transcript is saved. Add the model key once and the reading will continue automatically."), finishedAt: nowISO() });
      return;
    }
    // new input from a podcast link with no speaker labels: the voices, from the recording (see needsVoices)
    if (needsVoices(b)) {
      await update(id, job, { phase: "speakers", message: "Separating the voices in the recording…" });
      let out = null, failed = null;
      try { out = await separateVoices({ ai, store, id, link: "", engine: cloud(), resolver: voices.resolver(), signal: job.controller.signal }); }
      catch (e) { if (job.controller.signal.aborted) throw stopped(); if (!e.code && !e.status) throw e; failed = e; }
      await check(id, job);
      if (out) {
        out.record = Object.assign({}, out.record, { auto: true, method: "The text came without speaker labels, so the episode's recording was sent to Deepgram (your key) to separate the voices. " + out.record.method });
        // the job follows what its own commit wrote (never a later edit): text, labels and names from the commit's return
        const committed = await store.commitVoices(id, out.basis, out);
        job.inputHash = committed.input.sha256; job.attrSig = shared.attrSig(committed.provenance && committed.provenance.overrides);
        job.namesSig = namesSigFor(committed, shared.parseTranscript(out.text, { mode: committed.parseMode }));
        await store.saveProcessing(id, { inputHash: job.inputHash }, job.id);
      } else {
        await store.recordVoicesAttempt(id, { at: nowISO(), auto: true, status: "failed", code: String(failed.code || ""), why: String(failed.message || failed).replace(/\s+/g, " ").slice(0, 300) });
      }
      b = await check(id, job);
    } else {
      const skip = voicesSkipped(b);
      if (skip) { await store.recordVoicesAttempt(id, Object.assign({ at: nowISO(), auto: true, status: "skipped" }, skip)); b = await check(id, job); }
    }
    // new input: work out from the words who is speaking and where a clip or quotation is played, before anything is
    // read (structure.js). The labelled text replaces the unlabelled one (kept in versions/); the job follows it.
    if (needsStructure(b)) {
      await update(id, job, { phase: "speakers", message: "Working out who is speaking…" });
      const out = await structureSpeakers({ ai, store, id, signal: job.controller.signal, onProgress: (n, total) => total > 1 ? store.saveProcessing(id, { message: "Working out who is speaking (" + n + " of " + total + ")…" }, job.id).catch(() => {}) : null });
      if (job.controller.signal.aborted) throw stopped();
      await check(id, job);
      if (out.changed) {
        const committed = await store.commitStructure(id, out.basis, out);
        job.inputHash = committed.input.sha256; job.attrSig = shared.attrSig(committed.provenance && committed.provenance.overrides);
        job.namesSig = namesSigFor(committed, shared.parseTranscript(out.text, { mode: committed.parseMode }));
        await store.saveProcessing(id, { inputHash: job.inputHash }, job.id);
      } else await store.recordStructure(id, out.basis, out.record);
      b = await check(id, job);
    }
    if (b.attributionGate.status !== "ready") {
      await update(id, job, { phase: "speakers", message: "Checking who said what…" });
      b = await prepareSpeakers({ ai, store, id, signal: job.controller.signal });
      if (job.controller.signal.aborted) throw stopped();
      // the job follows preparation's own commit — the attribution it wrote, from the snapshot it returned — and
      // never a later read: a person's rename in that moment is not absorbed, it stops the job at the check below.
      // Preparation changes labels, not names; the name basis moves only as far as its own corrections move it (0.14.7)
      const committed = b.committedRun;
      if (committed) {
        job.attrSig = shared.attrSig(committed.provenance && committed.provenance.overrides);
        job.namesSig = namesSigFor(committed, shared.parseTranscript(b.transcript, { mode: committed.parseMode }));
      }
      await check(id, job);
      if (b.attributionGate.status !== "ready") {
        await update(id, job, { status: "held", phase: "speakers", message: "The text leaves some speakers uncertain, so the reading is held back. A transcript with reliable speaker labels or the recording is needed.", finishedAt: nowISO() });
        return;
      }
    }
    // who each numbered or unnamed voice is, from the conversation and the episode's listing, before anything is read
    // (identify.js); once per text and set of labels. A voice nothing names keeps its number, with the reason.
    if (needsIdentification(b)) {
      await update(id, job, { phase: "speakers", message: "Finding who each speaker is…" });
      const out = await identifySpeakers({ ai, store, id, signal: job.controller.signal });
      if (job.controller.signal.aborted) throw stopped();
      await check(id, job);
      // the job's own naming: its name basis follows exactly what this guarded commit wrote (the text is unchanged
      // there), so a person's unrelated rename is never absorbed and still stops the job at the next check
      const committed = await store.commitIdentification(id, out.basis, out);
      job.namesSig = namesSigFor(committed, shared.parseTranscript(b.transcript, { mode: committed.parseMode }));
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
        await store.appendAttempts(id, p.id, { outcome: res.data && res.data.levels && res.data.levels.g5 === "withheld" ? "shown at the high-school level; fifth grade withheld" : "shown", contract: P.CONTRACT, attempts: res.attempts || [] });
        await store.savePassage(id, p.id, Object.assign({}, p, { analysis: purpose === "claim" ? claimAnalysis(res.data, current, P.CONTRACT) : res.data, status: "done", analyzedAt: nowISO(), analyzedBy: ai.mock ? "MOCK" : ai.model,
          model: res.model || ai.model, usage: res.usage, callId: res.provenance.callId, error: "", held: null }), Object.assign(options(job), { expectedReadingRev: p.readingRev || 0 }));
      } catch (e) {
        if (e.code !== "reading_held") throw e;
        const held = { issues: e.issues && e.issues.length ? e.issues : ["The separate review did not approve the draft."], at: nowISO(), callId: e.callId || "" };
        await store.appendAttempts(id, p.id, { outcome: p.id === job.opts.reread && p.readingGate.status === "ready" ? "held; the earlier reading was kept" : "held", contract: P.CONTRACT, attempts: e.attempts || [], issues: held.issues });
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
    // what is finished is decided from the cards as they stand NOW (their gates), never from the issues list alone:
    // a held or stale card means the reading is not ready, whatever was caught along the way (0.14.6)
    const final = await check(id, job);
    const ready = final.passages.filter(p => p.readingGate.status === "ready").length;
    // the closing overview, where the reading has one (several passages of a conversation): its gate as it stands
    // now counts too, so an overview replaced or gone stale during the source searches is never called ready (0.14.7)
    const overviewNeeded = final.run.kind !== "claim" && final.passages.length >= 2;
    if (overviewNeeded && !issues.length && ready === final.passages.length && !(final.summary && final.summary.readingGate.status === "ready"))
      issues.push({ code: "overview_not_current", message: "The closing overview is missing or out of date.", reasons: final.summary ? (final.summary.stale || []).slice(0, 5) : ["no closing overview was written"] });
    const finished = !issues.length && ready === final.passages.length;
    await store.saveRun(id, { status: finished ? "complete" : "analyzed" });
    await update(id, job, { status: finished ? "complete" : "partial", phase: "finished", done: ready, total: final.passages.length, issues,
      message: finished ? "Your reading is ready." : partialMessage(ready, final.passages.length, issues), finishedAt: nowISO() });
  }
  async function recover() {
    for (const run of await store.listRuns()) if (!run.example) {
      const b = await store.bundle(run.id);
      if (b.run.processing && b.run.processing.status === "running") await store.saveProcessing(run.id, { status: "interrupted", message: "The server was restarted. Your prepared readings are saved; press Read this to continue." }, b.run.processing.id);
    }
  }
  return { start, stop, recover, jobs };
}
module.exports = { createReader, requestedBasis, readingMaterial, materialAsRead };
