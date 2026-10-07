"use strict";
const path = require("path");
const fs = require("fs");
const express = require("express");
const crypto = require("crypto");
const { Store, newId, sha256 } = require("./store");
const { buildExport, buildMarkdown, buildObligations } = require("./exportClaims");
const { REJECTION_REASONS } = require("./research/types");
const { createImporter, htmlToText } = require("./importer");
const { createSettings } = require("./settings");
const { createAI, DEFAULT_MODEL, MODEL_CHOICES, CLAUDE_ID, OTHER_ID, serviceAddress, listServiceModels, keyFor, keyOwner } = require("./ai");
const { createJobs } = require("./jobs");
const { createResolver, pickEngine } = require("./podcast/resolve");
const AF = require("./podcast/audiofile");
const { pipeline } = require("stream/promises");
const { Transform } = require("stream");
const { localEngine, deepgramEngine } = require("./podcast/engines");
const YT = require("./podcast/youtube");
const V = require("./validate");
const Q = require("./quality");
const { assignSpeakers } = require("./assign");
const { structureSpeakers } = require("./structure");
const { separateVoices } = require("./voices");
const { prepareSpeakers, reviewedReading, reviewedOverview } = require("./preparation");
const { createClaimSearch } = require("./claim-search");
const { createReader, readingMaterial, materialAsRead } = require("./reading");
const P = require("../shared/prompts");
const { readInput } = require("./intake");
const { separatePageText, paragraphTimes } = require("./webtranscript");

/* createApp({ dataDir, ai, research, examplesDir, envPath }) -> { app, store, state, ready }
   state.ai is null when no key is configured; the page then shows the example and asks for a key once when real
   analysis is first requested (POST /api/settings/anthropic-key writes it to .env and swaps the model in). */
/* A bundle for the wire: each card's `history` (every earlier reading, whole) becomes `historySummary` + `historyCount`. */
function trimHistory(body) {
  if (!body || typeof body !== "object" || !Array.isArray(body.passages) || !body.run || !("transcript" in body)) return body;
  const passages = body.passages.map(p => {
    if (!p || !Array.isArray(p.history)) return p;
    const q = Object.assign({}, p); delete q.history;
    q.historyCount = p.history.length;
    q.historySummary = p.history.map(x => ({ readingRev: x.readingRev || 0, analyzedAt: x.analyzedAt || "", analyzedBy: x.analyzedBy || "", model: x.model || "", replacedAt: x.replacedAt || "" }));
    return q;
  });
  return Object.assign({}, body, { passages });
}
function createApp(opts) {
  const store = new Store(opts.dataDir);
  const state = { ai: opts.ai || null };
  const research = opts.research || null;
  const searchClaim = createClaimSearch(store, research);
  const importer = createImporter({ fetch: opts.fetch || require("./podcast/public-fetch").publicFetch });
  // the reader separates voices from an episode's recording on its own when a link's text came without speaker labels
  // (Deepgram as configured now, the transcript chain's resolver, the person's audio-to-text choice); defined below
  const reader = createReader({ store, getAI: () => state.ai, searchClaim, research, voices: { engine: () => engines.cloud, resolver: () => resolver, prefer: () => env.TRANSCRIBE_PREFER || "" },
    provider: () => (process.env.MODEL_PROVIDER === "openai-compatible" ? "openai-compatible" : "anthropic") });
  const envPath = opts.envPath || path.join(__dirname, "..", ".env");
  const settings = createSettings({ envPath, examplePath: path.join(__dirname, "..", ".env.example") });
  /* The transcript chain (podcast and video links): engines read their keys from the environment the server was
     started with, and from a key the page sets later; the resolver and jobs are the same for every run. */
  const env = opts.env || process.env;
  const engines = { local: opts.localEngine || localEngine({ dataDir: opts.dataDir, env }), cloud: opts.cloudEngine || deepgramEngine({ apiKey: env.DEEPGRAM_API_KEY || "", fetch: opts.fetch || globalThis.fetch, env }) };
  const resolver = opts.resolver || createResolver({ fetch: opts.fetch || require("./podcast/public-fetch").publicFetch, env, engines, run: opts.run });
  const jobs = createJobs({ dataDir: opts.dataDir });
  const app = express();
  app.disable("x-powered-by");
  /* A server bound to this computer answers only requests addressed to it by one of this computer's names. A page on
     another site whose name was pointed at 127.0.0.1 (DNS rebinding) would otherwise count as the app's own page and
     could use it, the paid routes included. `allowedHosts` is set by server/index.js unless HOST opens it to a network. */
  if (Array.isArray(opts.allowedHosts)) app.use((req, res, next) => {
    const host = String(req.headers.host || "").toLowerCase().replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
    if (opts.allowedHosts.includes(host)) return next();
    res.status(403).json({ error: "This server answers only requests addressed to this computer (127.0.0.1 or localhost).", code: "wrong_host" });
  });
  app.use(express.json({ limit: "40mb" }));

  /* Uploaded recordings live under data/uploads only while the job that transcribes them runs; the job removes its file
     when it ends, and anything left there from a server that stopped mid-job is removed at the next start. */
  const uploadsDir = path.join(opts.dataDir, "uploads");
  const MAX_UPLOAD_BYTES = opts.maxUploadBytes || 2 * 1024 * 1024 * 1024; // Deepgram takes files up to 2 GB
  const MAX_UPLOADS_AT_ONCE = opts.maxUploadsAtOnce || 3, UPLOAD_IDLE_MS = opts.uploadIdleMs || 120000;
  const ready = (async () => {
    await store.init();
    await jobs.ready;
    await fs.promises.rm(uploadsDir, { recursive: true, force: true });
    const exDir = opts.examplesDir || path.join(__dirname, "..", "examples");
    if (fs.existsSync(exDir)) for (const name of fs.readdirSync(exDir)) {
      const folder = path.join(exDir, name);
      if (fs.existsSync(path.join(folder, "run.json"))) { try { await store.installExample(name, folder); } catch (e) { console.error("example install failed:", name, e.message); } }
    }
    await reader.recover();
  })();
  app.use(async (req, res, next) => { try { await ready; next(); } catch (e) { next(e); } });

  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  /* Every earlier reading of a card stays in its file, but the page does not need them on every load: a run re-read a
     few times would otherwise send every old reading with each poll. A bundle leaves with each card's history replaced
     by a summary (when, by what, replaced when) and a count; ?history=full, or the passage's history route, has it all. */
  app.use("/api", (req, res, next) => {
    const json = res.json.bind(res);
    res.json = body => json(req.query.history === "full" ? body : trimHistory(body));
    next();
  });

  // the model for new readings (0.14.7): the provider and model in use, the listed Claude choices and the default, and
  // the OpenAI-compatible connection as saved (its address and model; whether a key is set, never the key)
  const aiInfo = ai => ai ? Object.assign({ kind: ai.kind, model: ai.model, mock: !!ai.mock }, ai.host ? { host: ai.host } : {}) : null;
  const modelInfo = () => ({ provider: process.env.MODEL_PROVIDER === "openai-compatible" ? "openai-compatible" : "anthropic",
    claude: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, default: DEFAULT_MODEL, choices: MODEL_CHOICES,
    // keySet: a key is saved for this address (0.14.8: a key saved for another address is not this service's key)
    other: { baseUrl: serviceAddress(process.env.OPENAI_BASE_URL) || "", model: process.env.OPENAI_MODEL || "", keySet: !!keyFor(process.env, process.env.OPENAI_BASE_URL) } });
  // what to do when no model is set up, for the provider chosen (0.14.8): Claude needs its key; another service needs
  // its address and model (its key is optional: Ollama on this computer has none)
  const noModelMessage = () => process.env.MODEL_PROVIDER === "openai-compatible"
    ? "The model service chosen under Controls → App and files is not fully set up: give its address and a model it offers (and its key, if it needs one)."
    : "No model configured. Add your Anthropic API key (the page asks for it once, or put ANTHROPIC_API_KEY in .env and restart), or choose another service under Controls → App and files.";
  app.get("/api/health", (req, res) => { const ai = state.ai; res.json({ ok: true, app: "deflate-lens", ai: aiInfo(ai), models: modelInfo(), keyConfigurable: true, research: research ? research.config : null, transcript: { local: engines.local.installed(), cloud: engines.cloud.configured(), prefer: env.TRANSCRIBE_PREFER || "" }, dataDir: store.dataDir, version: require("../package.json").version }); });

  /* One-time local configuration of the model key. Body: {key}. The key is written to .env and used at once; the
     response carries only the model name. Mock mode is never switched on here. */
  app.post("/api/settings/anthropic-key", wrap(async (req, res) => {
    const key = String(req.body && req.body.key || "");
    const r = settings.setAnthropicKey(key);
    process.env.ANTHROPIC_API_KEY = key.trim();
    if (!(process.env.DEFLATE_MOCK_AI === "1" || process.env.DEFLATE_MOCK_AI === "true")) state.ai = createAI(process.env, { fetch: opts.modelFetch });
    res.json({ ok: true, file: r.file, ai: aiInfo(state.ai) });
  }));

  /* Which model writes new readings (0.14.7). Body: {provider: "anthropic", model} with any Claude model id, or
     {provider: "openai-compatible", baseUrl, apiKey?, clearKey?, model} for any service that speaks the OpenAI-compatible
     chat API. The saved service key belongs to the address it was saved for (0.14.8): an empty apiKey keeps it only when
     the address is the same one; with a different address it is removed (so it is never sent to that address, an Ollama
     on this computer included), and the answer says so (key: "dropped"). A new apiKey replaces it and is bound to this
     address; clearKey removes it on purpose. Every value is checked before anything is written, and the choice is written
     to .env in one write; then the server's model is replaced by a new one built from what was written, so a reading
     already running finishes with the model it started with. The mock responder stays the mock. The key never comes back. */
  app.put("/api/settings/model", wrap(async (req, res) => {
    const q = req.body || {}, provider = q.provider === "openai-compatible" ? "openai-compatible" : "anthropic";
    const bad = msg => Object.assign(new Error(msg), { status: 400, code: "bad_setting" });
    const model = String(q.model || "").trim();
    let keyAction = "none", droppedFrom = "";
    if (provider === "anthropic") {
      if (!CLAUDE_ID.test(model)) throw bad("That does not look like a Claude model id (they start with claude-). Nothing was saved.");
      settings.setMany({ ANTHROPIC_MODEL: model, MODEL_PROVIDER: "anthropic" });
      Object.assign(process.env, { ANTHROPIC_MODEL: model, MODEL_PROVIDER: "anthropic" });
    } else {
      const baseUrl = serviceAddress(q.baseUrl), key = String(q.apiKey || "").trim(), clearKey = q.clearKey === true;
      if (!baseUrl) throw bad("That is not a usable address for a model service (https, or http on this computer, with no ?query or #part). Nothing was saved.");
      if (!OTHER_ID.test(model)) throw bad("That does not look like a model id. Nothing was saved.");
      if (key && !/^[\x21-\x7e]{8,400}$/.test(key)) throw bad("That does not look like an API key. Nothing was saved.");
      if (key && clearKey) throw bad("Give a new key or remove the saved one, not both. Nothing was saved.");
      const owner = keyOwner(process.env);
      const values = { OPENAI_BASE_URL: baseUrl, OPENAI_MODEL: model, MODEL_PROVIDER: "openai-compatible" }, clears = [];
      if (key) { Object.assign(values, { OPENAI_API_KEY: key, OPENAI_API_KEY_FOR: baseUrl }); keyAction = "new"; }
      else if (owner && owner === baseUrl && !clearKey) { values.OPENAI_API_KEY_FOR = baseUrl; keyAction = "kept"; }
      else {
        clears.push("OPENAI_API_KEY", "OPENAI_API_KEY_FOR");
        if (String(process.env.OPENAI_API_KEY || "").trim()) { keyAction = clearKey ? "removed" : "dropped"; droppedFrom = owner ? new URL(owner).host : ""; }
      }
      settings.setMany(values, clears);
      Object.assign(process.env, values); for (const name of clears) process.env[name] = "";
    }
    // (Claude to another Claude model: the same key with the new model, as a new object; anything else is built afresh
    // from .env as just written, so the server's model and the settings agree)
    if (state.ai && state.ai.mock) { /* the mock stays the mock */ }
    else if (provider === "anthropic" && state.ai && state.ai.kind === "anthropic" && typeof state.ai.withModel === "function") state.ai = state.ai.withModel(model);
    else state.ai = createAI(process.env, { fetch: opts.modelFetch });
    res.json(Object.assign({ ok: true, ai: aiInfo(state.ai), models: modelInfo() }, provider === "openai-compatible" ? { key: keyAction } : {}, droppedFrom ? { keyWasFor: droppedFrom } : {}));
  }));
  /* The models an OpenAI-compatible service lists, for the list under Controls. Body: {baseUrl, apiKey?}; with no key
     given, the saved key is used only for the address it belongs to (the same rule as readings). Returns ids; nothing is
     saved and no key comes back. */
  app.post("/api/settings/model/list", wrap(async (req, res) => {
    const q = req.body || {};
    const key = String(q.apiKey || "").trim() || keyFor(process.env, q.baseUrl);
    res.json({ ok: true, models: await listServiceModels({ baseUrl: q.baseUrl, apiKey: key, fetch: opts.modelFetch }) });
  }));
  /* Remove the saved service key on purpose (0.14.8), from Controls. The provider and the rest of the connection stay as
     they are; when that service is the one in use, the server's model is rebuilt without a key. */
  app.delete("/api/settings/model/key", wrap(async (req, res) => {
    const had = !!String(process.env.OPENAI_API_KEY || "").trim();
    settings.setMany({}, ["OPENAI_API_KEY", "OPENAI_API_KEY_FOR"]);
    process.env.OPENAI_API_KEY = ""; process.env.OPENAI_API_KEY_FOR = "";
    if (process.env.MODEL_PROVIDER === "openai-compatible" && !(state.ai && state.ai.mock)) state.ai = createAI(process.env, { fetch: opts.modelFetch });
    res.json({ ok: true, ai: aiInfo(state.ai), models: modelInfo(), key: had ? "removed" : "none" });
  }));

  /* Link importer: readable text or a plain reason it could not be read. Stores nothing. */
  app.post("/api/import", wrap(async (req, res) => { const out = await importer(req.body && req.body.url); res.json(out); }));

  /* ---- the transcript chain (podcasts and videos) ----
     POST /api/transcript/resolve {url, guid?, choice?} starts a job that finds the episode and then its words, trying
     the feed's transcript, YouTube captions, the episode's page, and finally the audio (local or cloud, by the person's
     choice). The page polls GET /api/transcript/jobs/:id, may stop it, and then hands the words to /api/intake so the
     reading is prepared in the same action. A job's result is also written under data/jobs so a refresh does not lose it. */
  app.get("/api/transcript/engines", wrap(async (req, res) => {
    const ytdlp = await YT.ytdlpAvailable(env, opts.run).catch(() => "");
    const describe = j => ({ id:j.id, state:j.state, resultKind:j.resultKind || "", url:j.input && j.input.url || "", guid:j.input && j.input.guid || "", choice:j.input && j.input.choice || "", context:j.input && j.input.context || {}, targetRunId:j.input && j.input.targetRunId || "", upload:j.input && j.input.upload ? { name:j.input.upload.name, bytes:j.input.upload.bytes } : null, startedAt:j.startedAt, progress:j.progress });
    res.json({ local: { installed: engines.local.installed(), modelCached: engines.local.modelCached(), model: engines.local.model, packages: engines.local.packages }, cloud: { configured: engines.cloud.configured(), model: engines.cloud.model, provider: "deepgram" }, prefer: env.TRANSCRIBE_PREFER || "", upload: { maxBytes: MAX_UPLOAD_BYTES }, ytdlp: ytdlp || "", installing: jobs.running("install-local").length > 0, running: jobs.running("resolve").map(describe), pending:(await jobs.pending("resolve")).map(describe) });
  }));
  app.post("/api/transcript/resolve", wrap(async (req, res) => {
    const { url, guid, choice } = req.body || {};
    if (!url || typeof url !== "string") return res.status(400).json({ error: "a link is required", code: "invalid_request" });
    const input = { url: url.trim().slice(0, 2000), guid: typeof guid === "string" ? guid.slice(0, 500) : "", choice: choice === "local" || choice === "cloud" ? choice : "" };
    const context = req.body.context || {};
    input.context = Object.fromEntries(["title", "sourceLabel", "sourceDate"].filter(k => typeof context[k] === "string" && context[k].trim()).map(k => [k, context[k].slice(0, 600)]));
    if (req.body.targetRunId) {
      const target = await store.getRun(req.body.targetRunId);
      if (!target || target.example) throw Object.assign(new Error("This run cannot be replaced."), {status:target ? 403 : 404});
      input.targetRunId = target.id;
      input.expectedInputHash = sha256(await store.getTranscript(target.id));
    }
    const job = jobs.start("resolve", input, async ctx => {
      const located = await resolver.locate(input, ctx.step);
      if (located.kind === "choose") return { kind: "choose", show: located.show, episodes: located.episodes, note: located.note || "" };
      if (located.kind === "article") { const r = htmlToText(located.html); if (r.text.replace(/\s+/g, " ").length < 200) return { kind: "none", reason: "the page has little readable text and no feed, video or transcript" }; return { kind: "article", text: r.text, title: r.title, url: located.url, chars: r.text.length, note: "an article page, read as text; not a podcast" }; }
      if (ctx.signal.aborted) { const e = new Error("stopped"); e.code = "cancelled"; throw e; }
      const w = await resolver.words(located, { step: ctx.step, signal: ctx.signal, choice: input.choice, onProgress: ctx.progress });
      return Object.assign({ kind: w.ok ? "transcript" : "none" }, w, w.ok ? { chars: w.text.length, fetchedAt: new Date().toISOString() } : {});
    });
    res.json({ jobId: job.id });
  }));
  /* POST /api/transcript/upload?name=&choice=&title=&sourceLabel=&sourceDate= with a recording as the body (0.14.1): the
     file is written to data/uploads as it arrives (counted, hashed, capped), checked to be a recording by its first
     bytes, and turned into text by a job like a link's, so the page follows it and imports it the same way. Only an
     audio or video type (or application/octet-stream) is accepted, which a page on another site cannot send without the
     browser asking this server first. The engine is decided before the job starts (pickEngine; the local engine reads
     MP3 only); when none fits, nothing is kept and the page offers the choice. */
  app.post("/api/transcript/upload", wrap(async (req, res) => {
    const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    // a refusal before the body is read closes the connection after the answer, so the unread bytes are not taken for the
    // next request on it (a kept-alive connection would otherwise carry them into the next one)
    const unread = () => res.set("Connection", "close");
    if (!/^(?:audio|video)\/[a-z0-9.+-]+$/.test(type) && type !== "application/octet-stream") { unread(); return res.status(415).json({ error: "Upload a recording (an audio or video file).", code: "not_audio" }); }
    const q = req.query || {}, one = v => typeof v === "string" ? v : "";
    const name = one(q.name).replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "recording";
    const choice = one(q.choice) === "local" || one(q.choice) === "cloud" ? one(q.choice) : "";
    const context = Object.fromEntries(["title", "sourceLabel", "sourceDate"].filter(k => one(q[k]).trim()).map(k => [k, one(q[k]).slice(0, 600)]));
    // where the recording came from, when the person said so under Add context (a recording has no link of its own)
    if (/^https?:\/\/\S+$/i.test(one(q.sourceUrl).trim())) context.sourceUrl = one(q.sourceUrl).trim().slice(0, 2000);
    // a date the run could not keep is refused now, not after a paid transcription
    if (context.sourceDate && !/^\d{4}-\d{2}-\d{2}$/.test(context.sourceDate.trim())) { unread(); return res.status(400).json({ error: "The date must be written YYYY-MM-DD.", code: "invalid" }); }
    // a few at a time, counting those still arriving: each holds its file on disk until its transcription ends
    if (jobs.running("resolve").filter(j => j.input && j.input.upload).length + uploadsArriving >= MAX_UPLOADS_AT_ONCE) { unread(); return res.status(429).json({ error: "Recordings are already being turned into text; wait for one to finish, then upload this one.", code: "busy" }); }
    // a file the browser says is too large is refused before a byte of it is read
    const limit = MAX_UPLOAD_BYTES >= 1048576 ? Math.round(MAX_UPLOAD_BYTES / 1048576) + " MB" : Math.round(MAX_UPLOAD_BYTES / 1024) + " KB";
    if (Number(req.headers["content-length"]) > MAX_UPLOAD_BYTES) { unread(); return res.status(413).json({ error: "This file is larger than " + limit + ".", code: "too_large" }); }
    uploadsArriving++;
    try { await receiveUpload(req, res, { type, name, choice, context, limit, unread }); } finally { uploadsArriving--; }
  }));
  let uploadsArriving = 0;
  async function receiveUpload(req, res, { type, name, choice, context, limit, unread }) {
    const id = "up" + Date.now().toString(36) + crypto.randomBytes(4).toString("hex"), dir = path.join(uploadsDir, id), file = path.join(dir, "recording");
    await fs.promises.mkdir(dir, { recursive: true });
    // a transfer that stalls for two minutes is given up (the server's own limit on a whole request is lifted for a long upload)
    req.setTimeout(UPLOAD_IDLE_MS, () => req.destroy(Object.assign(new Error("the upload stalled"), { code: "upload_stalled" })));
    const hash = crypto.createHash("sha256"); let bytes = 0;
    const drop = () => fs.promises.rm(dir, { recursive: true, force: true });
    try {
      await pipeline(req, new Transform({ transform(chunk, enc, cb) { bytes += chunk.length; if (bytes > MAX_UPLOAD_BYTES) return cb(Object.assign(new Error("This file is larger than " + limit + "."), { status: 413, code: "too_large" })); hash.update(chunk); cb(null, chunk); } }), fs.createWriteStream(file));
    } catch (e) { await drop(); unread(); if (e.status) throw e; throw Object.assign(new Error("The upload did not arrive whole; try again."), { status: 400, code: "upload_incomplete" }); }
    let format; try { format = bytes ? await AF.sniffFile(file) : null; } catch (e) { await drop(); throw e; }
    if (!format) { await drop(); return res.status(415).json({ error: bytes ? "This file is not a recording the app can read (MP3, M4A or MP4, WAV, Ogg, FLAC, AAC or WebM)." : "The file is empty.", code: "not_audio" }); }
    const have = { local: engines.local.installed(), cloud: engines.cloud.configured() }, localReads = format === "mp3", formatName = AF.FORMATS[format].name;
    const refuse = async (code, error) => { await drop(); return res.status(409).json({ error, code, format, formatName, bytes, available: have, localReads }); };
    const mp3Only = "Transcription on this computer reads MP3 files only, and this file is " + formatName + ". Use Deepgram for it, or convert it to MP3.";
    const pick = pickEngine(choice, { local: have.local && localReads, cloud: have.cloud }, env);
    if (!pick) return have.local && !localReads && (env.TRANSCRIBE_PREFER === "local" || !have.cloud) ? refuse("local_format", mp3Only) : refuse("needs_engine", "Choose how to turn the recording into text.");
    if (pick === "local" && !have.local) return refuse("needs_engine", "Transcription on this computer is not installed.");
    if (pick === "local" && !localReads) return refuse("local_format", mp3Only);
    if (pick === "cloud" && !have.cloud) return refuse("needs_engine", "No Deepgram key is set.");
    const upload = { id, name, bytes, sha256: hash.digest("hex"), format, type: type === "application/octet-stream" ? AF.FORMATS[format].mime : type };
    const tags = await AF.tags(file, format);
    // the file goes when the job ends, however it ends (done, failed, stopped before it began)
    const job = jobs.start("resolve", { url: "", guid: "", choice: pick, context, upload }, async ctx => {
      ctx.step("Audio file", name + " (" + formatName + ", " + (bytes >= 1048576 ? Math.round(bytes / 1048576) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB") + ")" + (tags.title || tags.album || tags.artist ? "; its tags: " + [tags.album, tags.artist, tags.title].filter(Boolean).join(" · ") : "; no tags"));
      const w = await resolver.fileWords(Object.assign({ path: file, tags, titleFromName: AF.titleFromName(name) }, upload), { step: ctx.step, signal: ctx.signal, engine: pick, onProgress: ctx.progress });
      return Object.assign({ kind: "transcript" }, w, { chars: w.text.length, fetchedAt: new Date().toISOString() });
    }, { onEnd: drop });
    res.json({ jobId: job.id, engine: pick, format });
  }
  app.get("/api/transcript/jobs/:id", wrap(async (req, res) => { const j = await jobs.get(req.params.id); if (!j) return res.status(404).json({ error: "no such job" }); res.json(j); }));
  app.post("/api/transcript/jobs/:id/cancel", wrap(async (req, res) => { res.json({ ok: jobs.cancel(req.params.id) }); }));
  app.post("/api/transcript/jobs/:id/dismiss", wrap(async (req, res) => {
    const job = await jobs.get(req.params.id);
    if (!job) return res.status(404).json({error:"no such job"});
    if (job.state === "running") return res.status(409).json({error:"Stop this fetch before dismissing it."});
    res.json({ok:await store.withLock("consume_" + job.id, () => jobs.acknowledge(job.id))});
  }));
  // One server-owned import per fetch. Client retries, two tabs, and a restart after the
  // run was written all converge on the same run; the browser never supplies the transcript.
  app.post("/api/transcript/jobs/:id/consume", wrap(async (req, res) => {
    const id = req.params.id;
    if (!/^job[A-Za-z0-9]+$/.test(id)) return res.status(400).json({error:"invalid job id"});
    const runId = await store.withLock("consume_" + id, async () => {
      const job = await jobs.get(id);
      if (!job) throw Object.assign(new Error("No such fetch."), {status:404});
      if (job.runId) {
        if (!await store.getRun(job.runId)) throw Object.assign(new Error("This reading was moved to trash. Restore it there."), {status:410});
        return job.runId;
      }
      if (job.acknowledgedAt) throw Object.assign(new Error("This fetch was dismissed. Start the link again to make a new reading."), {status:409});
      const result = job.result || {};
      if (job.state !== "done" || !["transcript", "article"].includes(result.kind)) throw Object.assign(new Error("This fetch has no transcript ready to read."), {status:409});
      const input = job.input || {}, src = result.source || {};
      const show = result.show && result.show.name || "", title = result.episode && result.episode.title || result.title || "";
      // an uploaded recording with no album tag is labelled by its file's name (its title already says what the name says)
      const doc = Object.assign({title, sourceLabel:src.file && !show ? src.file.name : (show ? show + (title ? " — " : "") : "") + title}, input.context || {}, {sourceUrl:input.url || (input.upload && input.context && input.context.sourceUrl) || "", speakers:[], import:{url:input.url || "", file:src.file || null, title, fetchedAt:result.fetchedAt || job.finishedAt, chars:result.text.length, method:result.kind === "article" ? "page text" : "transcript: " + src.kind, source:src, show, episode:title, matchedBy:result.matchedBy || "", speakers:result.speakers || [],
        identity:result.kind === "article" ? "direct" : (result.identity || "direct"), match:result.match || null, ambiguous:result.ambiguous || null,
        // the episode and the show as the listing describes them: the names in them are candidates for who speaks
        episodeInfo:result.episode ? {guid:result.episode.guid || "", title:result.episode.title || "", durationSeconds:result.episode.duration || 0, pubDate:result.episode.pubDate || "", link:result.episode.link || "", audioUrl:result.episode.audioUrl || "", description:result.episode.description || "", author:result.episode.author || "", persons:result.episode.persons || [], origin:result.episode.origin || "", titleFrom:result.episode.titleFrom || ""} : null,
        showInfo:result.show ? {name:result.show.name || "", author:result.show.author || "", artist:result.show.artist || "", persons:result.show.persons || [], origin:result.show.origin || ""} : result.channel ? {name:result.channel, author:"", artist:"", persons:[], channel:true} : null}});
      if (!doc.title) delete doc.title;
      const prepared = await readInput(result.text, doc, importer);
      const rid = input.targetRunId || "r_" + id;
      if (input.targetRunId) {
        await store.withLock(rid, async () => {
          const current = await store.getRun(rid);
          if (!current) throw Object.assign(new Error("The destination run no longer exists."), {status:410});
          if (current.transcriptJobId === id) return;
          if (sha256(await store.getTranscript(rid)) !== input.expectedInputHash) throw Object.assign(new Error("The text changed while this link was fetched. Your edit was kept. Start the link again."), {status:409, code:"input_changed"});
          await store._saveRun(rid, prepared.doc, prepared.text, {transcriptJobId:id});
        });
      } else if (!await store.getRun(rid)) await store.createRun(prepared.doc, prepared.text, rid);
      const existing = await store.getRun(rid), fresh = !existing.intake || existing.intake.transcriptJobId !== id;
      // Deepgram separated the voices as it transcribed the recording: the labels are voices from the recording, as with
      // voices lined up with a text (voices.js), not labels of unknown origin to audit turn by turn. Recorded once, for
      // the text this fetch wrote (a retried consume finds the intake already saved and leaves the record alone).
      const voices = (result.speakers || []).filter(s => /^SPEAKER \d+$/.test(s));
      if (fresh && src.kind === "audio-transcription" && src.engine === "deepgram" && voices.length)
        await store.recordTranscribedVoices(rid, { by: "recording", via: "transcription", engine: "deepgram", model: src.model || "", requestId: src.requestId || "", audioUrl: src.url || "", audioFoundBy: src.file ? "the file you uploaded (" + src.file.name + "), transcribed by Deepgram" : "the episode's audio, transcribed by Deepgram", durationSeconds: src.durationSeconds || 0, voices: voices.length,
          method: "Deepgram separated the voices as it transcribed the recording, one label per voice: the labels came from the recording, not from the words. Voices are numbered by the recording; names come from what the conversation and " + (src.file ? "the file's name and tags" : "the episode's listing") + " show." });
      if (fresh) await store.saveIntake(rid, prepared.original, Object.assign(prepared.intake, {transcriptJobId:id}));
      await jobs.acknowledge(id, rid);
      return rid;
    });
    res.status(202).json(await reader.start(runId));
  }));
  /* The one-time choices for the audio step. Installing the local engine is itself a job (npm install, a few minutes). */
  app.post("/api/transcript/local/install", wrap(async (req, res) => {
    if (engines.local.installed()) return res.json({ installed: true });
    const running = jobs.running("install-local")[0]; if (running) return res.json({ jobId: running.id });
    const job = jobs.start("install-local", {}, async ctx => { ctx.step("npm", "installing " + Object.keys(engines.local.packages).join(", ") + " into data/local-transcription (about 480 MB; a few minutes)"); let log = ""; const r = await engines.local.install({ onLog: s => { log = (log + s).slice(-4000); ctx.progress({ log }); }, signal: ctx.signal }); ctx.step("npm", "installed"); return { installed: true, dir: r.dir, packages: r.packages }; });
    res.json({ jobId: job.id });
  }));
  app.put("/api/transcript/prefer", wrap(async (req, res) => { const r = settings.set("TRANSCRIBE_PREFER", req.body && req.body.engine); env.TRANSCRIBE_PREFER = r.value; res.json({ ok: true, prefer: r.value }); }));
  /* A named key, set once from the page. Only the names in settings.SETTABLE are accepted; nothing is echoed back. */
  app.post("/api/settings/key", wrap(async (req, res) => {
    const name = String(req.body && req.body.name || ""); const key = String(req.body && req.body.key || "");
    // (the model and its connection are set together through /api/settings/model, which checks them as one, 0.14.7)
    if (["ANTHROPIC_MODEL", "MODEL_PROVIDER", "OPENAI_BASE_URL", "OPENAI_API_KEY", "OPENAI_API_KEY_FOR", "OPENAI_MODEL"].includes(name)) throw Object.assign(new Error("Choose the model under Controls → App and files."), { status: 400, code: "not_settable" });
    const r = settings.set(name, key);
    if (name === "ANTHROPIC_API_KEY") { process.env.ANTHROPIC_API_KEY = key.trim(); if (!(process.env.DEFLATE_MOCK_AI === "1" || process.env.DEFLATE_MOCK_AI === "true")) state.ai = createAI(process.env, { fetch: opts.modelFetch }); }
    if (name === "DEEPGRAM_API_KEY") { env.DEEPGRAM_API_KEY = key.trim(); engines.cloud = opts.cloudEngine || deepgramEngine({ apiKey: key.trim(), fetch: opts.fetch || globalThis.fetch, env }); }
    res.json({ ok: true, name: r.name, ai: state.ai ? { kind: state.ai.kind, model: state.ai.model, mock: !!state.ai.mock } : null, cloud: { configured: engines.cloud.configured() } });
  }));

  /* The normal page uses one action: save what was uploaded/pasted, then prepare the entire
     reading in the background. No optional context or manual stage is required. */
  app.post("/api/intake", wrap(async (req, res) => {
    const input = await readInput(req.body && req.body.input, req.body && req.body.context, importer);
    const id = await store.createRun(input.doc, input.text);
    await store.saveIntake(id, input.original, input.intake);
    res.status(202).json(await reader.start(id));
  }));
  app.post("/api/runs/:id/read", wrap(async (req, res) => { res.status(202).json(await reader.start(req.params.id)); }));
  app.post("/api/runs/:id/stop", wrap(async (req, res) => { res.json(await reader.stop(req.params.id)); }));
  /* Optional requests from Controls or a card's Evidence. Each runs the same server job as Read this, with the same prompt,
     context, review and checks; the page never builds a reading prompt of its own. */
  app.post("/api/runs/:id/passages/:pid/reread", wrap(async (req, res) => { if (!/^p\d{3}$/.test(req.params.pid)) return res.status(400).json({ error: "invalid passage id" }); res.status(202).json(await reader.start(req.params.id, { reread: req.params.pid })); }));
  app.post("/api/runs/:id/overview", wrap(async (req, res) => { res.status(202).json(await reader.start(req.params.id, { overview: true })); }));
  app.post("/api/runs/:id/reorganize", wrap(async (req, res) => { res.status(202).json(await reader.start(req.params.id, { resegment: true })); }));
  /* The exact text a reading was made from (the passage and the context the model saw), rebuilt and checked against the
     hash on its record; also for a reading that is now out of date. */
  app.get("/api/runs/:id/passages/:pid/material", wrap(async (req, res) => { const b = await store.bundle(req.params.id); const p = b && b.passages.find(x => x.id === req.params.pid); if (!p || !p.analysis) return res.status(404).json({ error: "no reading for that passage" }); res.json(await materialAsRead(store, b, p)); }));
  app.post("/api/runs/:id/source/confirm", wrap(async (req, res) => { await store.confirmSource(req.params.id, req.body && req.body.sourceUrl, req.body && req.body.key); res.json(await store.bundle(req.params.id)); }));
  /* The User Guide: one Markdown file, shown in the app and readable on GitHub. */
  app.get("/guide.md", (req, res) => { res.type("text/markdown; charset=utf-8"); res.sendFile(path.join(__dirname, "..", "docs", "guide.md")); });
  app.get("/api/runs/:id/original-input.txt", wrap(async (req, res) => {
    const run = await store.getRun(req.params.id);
    if (!run || !run.intake || !/^input[A-Za-z0-9_-]+\.txt$/.test(run.intake.file || "")) return res.status(404).json({error:"No original upload is stored for this reading."});
    res.type("text/plain"); res.sendFile(path.join(store.runDir(req.params.id), "inputs", run.intake.file));
  }));

  app.get("/api/runs", wrap(async (req, res) => res.json(await store.listRuns())));
  app.post("/api/runs", wrap(async (req, res) => { const id = await store.createRun(req.body.run || {}, req.body.transcript || ""); res.json(await store.bundle(id)); }));
  app.get("/api/runs/:id/passages/:pid/history", wrap(async (req, res) => { const b = await store.bundle(req.params.id); const p = b && b.passages.find(x => x.id === req.params.pid); if (!p) return res.status(404).json({ error: "passage not found" }); req.query.history = "full"; res.json({ id: p.id, history: p.history || [] }); }));
  app.get("/api/runs/:id", wrap(async (req, res) => { const b = await store.bundle(req.params.id); if (!b) return res.status(404).json({ error: "run not found" }); res.json(b); }));
  app.put("/api/runs/:id", wrap(async (req, res) => { await store.saveRun(req.params.id, req.body.run || {}, typeof req.body.transcript === "string" ? req.body.transcript : undefined); res.json(await store.bundle(req.params.id)); }));
  app.delete("/api/runs/:id", wrap(async (req, res) => { const name = await store.deleteRun(req.params.id); res.json({ ok: true, trash: name }); }));
  app.get("/api/trash", wrap(async (req, res) => res.json(await store.listTrash())));
  app.post("/api/trash/:name/restore", wrap(async (req, res) => { const id = await store.restoreRun(req.params.name); res.json({ ok: true, id }); }));
  /* Records parked by a re-segment, reattached by hand to a claim of the current reading. */
  app.post("/api/runs/:id/orphans/:oid/attach", wrap(async (req, res) => { await store.attachOrphan(req.params.id, req.params.oid, req.body && req.body.pid, req.body && req.body.idx); res.json(await store.bundle(req.params.id)); }));
  app.post("/api/runs/:id/duplicate", wrap(async (req, res) => { const nid = await store.duplicateRun(req.params.id); res.json(await store.bundle(nid)); }));
  /* Optional: names for a transcript that has none. The model assigns them from the words (two passes), the text is
     cut, never rewritten, and the reading starts again on the labelled text in the same action. */
  app.post("/api/runs/:id/assign-speakers", wrap(async (req, res) => {
    const ctl = new AbortController(); res.on("close", () => { if (!res.writableEnded) ctl.abort(); });
    const out = await assignSpeakers({ ai: state.ai, store, id: req.params.id, names: req.body && req.body.names, context: req.body && req.body.context, signal: ctl.signal });
    // a reading still running on the unlabeled text is stopped first, so the labelled text gets a fresh reading
    if (reader.jobs.has(req.params.id)) await reader.stop(req.params.id);
    await store.commitAssignment(req.params.id, out.basis, out);
    res.status(202).json(await reader.start(req.params.id));
  }));
  /* For a text saved before 0.13 that still holds a web page's controls and timestamps: the same separation new input
     gets at intake, on the person's request. The text before it is kept (inputs/ and versions/); readings made from it
     are marked out of date and are not redone until the person reads again. */
  app.post("/api/runs/:id/page-text", wrap(async (req, res) => {
    const b = await store.bundle(req.params.id);
    if (!b) return res.status(404).json({ error: "run not found" });
    if (b.run.example) return res.status(403).json({ error: "Copy the supplied example before changing it." });
    const w = separatePageText(b.transcript);
    if (!w.changed) return res.status(409).json({ error: "This text holds no page controls or timestamps to separate.", code: "nothing_to_separate" });
    if (reader.jobs.has(req.params.id)) await reader.stop(req.params.id);
    const text = w.text.trim(), starts = paragraphTimes(text, w.paragraphs);
    await store.repairIntake(req.params.id, text, {}, b.transcript, { source: "saved-input", requestedBy: "person at this computer", at: new Date().toISOString(), originalHash: sha256(b.transcript), cleanedHash: sha256(text),
      originalChars: b.transcript.length, cleanedChars: text.length, removedBefore: 0, removedAfter: 0, changed: true, converted: "", method: w.record.method, web: w.record,
      timing: starts ? { cleanedHash: sha256(text), unit: "paragraph", starts } : null }, b.run.input.sha256);
    res.json(await store.bundle(req.params.id));
  }));
  /* On request, for a run saved before 0.13 (new input gets this at the start of its first reading): work out from the
     words who is speaking and where a clip or quotation is played (structure.js). The labelled text replaces the old one
     (kept in versions/); the reading starts again on it, so earlier readings are made again. */
  app.post("/api/runs/:id/speakers-from-words", wrap(async (req, res) => {
    const ctl = new AbortController(); res.on("close", () => { if (!res.writableEnded) ctl.abort(); });
    const b = await store.bundle(req.params.id);
    if (!b) return res.status(404).json({ error: "run not found" });
    if (b.run.example) return res.status(403).json({ error: "Copy the supplied example before changing it." });
    // a reading in progress is stopped first, and resumed if nothing changes
    const wasReading = reader.jobs.has(req.params.id);
    if (wasReading) await reader.stop(req.params.id);
    let out;
    try { out = await structureSpeakers({ ai: state.ai, store, id: req.params.id, signal: ctl.signal }); }
    catch (e) { if (wasReading) await reader.start(req.params.id).catch(() => {}); throw e; }
    if (out.changed) await store.commitStructure(req.params.id, out.basis, out); else await store.recordStructure(req.params.id, out.basis, out.record);
    if (!out.changed) return res.json(Object.assign({ outcome: "nothing_established" }, wasReading ? await reader.start(req.params.id) : await store.bundle(req.params.id)));
    res.status(202).json(Object.assign({ outcome: "structured" }, await reader.start(req.params.id)));
  }));
  /* On request, where the words cannot settle who is speaking: voices separated from the episode's recording by Deepgram
     (the person's key) and lined up with this text word by word (voices.js). Every word of the text stays; only the
     labels come from the recording. A reading in progress is stopped just before the recording is sent, and the reading
     starts again on the labelled text. */
  app.post("/api/runs/:id/voices", wrap(async (req, res) => {
    const ctl = new AbortController(); res.on("close", () => { if (!res.writableEnded) ctl.abort(); });
    const id = req.params.id;
    // a reading in progress is stopped just before the recording is sent, and resumed if the voices cannot be used
    let wasReading = false, out;
    try {
      out = await separateVoices({ ai: state.ai, store, id, link: req.body && req.body.link, engine: engines.cloud, resolver, signal: ctl.signal,
        beforeRecording: async () => { if (reader.jobs.has(id)) { wasReading = true; await reader.stop(id); } } });
    } catch (e) { if (wasReading) await reader.start(id).catch(() => {}); throw e; }
    await store.commitVoices(id, out.basis, out);
    res.status(202).json(Object.assign({ outcome: "voices" }, await reader.start(id)));
  }));
  /* A person's names for speakers (optional, under Controls): any label the text uses but a clip's, a quotation's or an
     advertisement's. Only the names change; readings made under the old names say they are out of date. */
  app.post("/api/runs/:id/confirm-names", wrap(async (req, res) => {
    await store.confirmNames(req.params.id, req.body && req.body.names, "person at this computer");
    res.json(await store.bundle(req.params.id));
  }));
  app.post("/api/runs/:id/prepare-speakers", wrap(async (req, res) => {
    const ctl = new AbortController(); res.on("close", () => { if (!res.writableEnded) ctl.abort(); });
    res.json(await prepareSpeakers({ ai: state.ai, store, id: req.params.id, signal: ctl.signal }));
  }));

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
    const b = await store.bundle(id);
    if (!b) throw Object.assign(new Error("run not found"), {status:404});
    const p = b.passages.find(x => x.id === pid);
    const c = p && p.analysis && p.analysis.claims.find(x => x.id === cid);
    if (!c) throw Object.assign(new Error("that claim is not in the current reading of this passage"), {status:404,code:"claim_not_current"});
    return {b,p,c};
  }
  const rev = req => (req.body && req.body.expectedReadingRev != null) ? Number(req.body.expectedReadingRev) : null;
  app.post("/api/runs/:id/passages/:pid/claims/:cid/search", wrap(async (req,res) => {
    res.json(await searchClaim(req.params.id, req.params.pid, req.params.cid, rev(req)));
  }));

  app.post("/api/runs/:id/passages/:pid/claims/:cid/candidates/:cand/accept", wrap(async (req, res) => {
    const { b } = await loadClaim(req.params.id, req.params.pid, req.params.cid);
    if (b.run.example) return res.status(403).json({ error: "the supplied example is read-only" });
    let outcome = "accepted";
    await store.mutateClaim(req.params.id, req.params.pid, req.params.cid, (c) => {
      const cand = (c.candidates || []).find(x => x.id === req.params.cand); if (!cand) { const e = new Error("candidate not found"); e.status = 404; throw e; }
      if (cand.status === "accepted") { outcome = "already accepted"; return; } // idempotent: one candidate, one active receipt
      if (cand.status === "rejected") { const e = new Error("this candidate was rejected (" + ((c.rejections || []).find(r => r.candidateId === cand.id) || {}).reason + "); to use it, reject the rejection first by attaching it as a source by hand"); e.status = 409; e.code = "candidate_rejected"; throw e; }
      // accepting again after a withdrawal is a new decision on record: a new receipt with its own id, the withdrawn one kept
      const earlier = (c.receipts || []).filter(r => r.candidateId === cand.id).length;
      if (cand.status === "withdrawn") outcome = "accepted again after a withdrawal";
      cand.status = "accepted"; cand.decidedAt = new Date().toISOString();
      c.receipts = (c.receipts || []).concat([Object.assign({ rid: "rc_" + cand.id + (earlier ? "_" + (earlier + 1) : ""), reaccepted: earlier > 0 || undefined, kind: "document", url: cand.url, note: String(req.body && req.body.note || "").slice(0, 500), addedBy: "person at this computer", at: cand.decidedAt,
        title: cand.title, doi: cand.doi || "", pmid: cand.pmid || "", pmc: cand.pmc || "", journal: cand.journal || "", outlet: cand.outlet || "", sourceType: cand.sourceType || "", language: cand.language || "", authors: cand.authors || [], publishedAt: cand.publishedAt || "", retrievedAt: cand.retrievedAt || "",
        foundBy: cand.foundBy || [cand.adapter], notices: cand.notices || [], statusCheck: cand.statusCheck || null, candidateId: cand.id }, V.relationFields(req.body && req.body.relation, cand.decidedAt))]);
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

  /* A source attached by hand: a link, a one-line note, and (optionally) what the person says it does for the claim.
     Recorded as a person's judgment, nothing more. */
  app.post("/api/runs/:id/passages/:pid/claims/:cid/receipts", wrap(async (req, res) => {
    const { b } = await loadClaim(req.params.id, req.params.pid, req.params.cid);
    if (b.run.example) return res.status(403).json({ error: "the supplied example is read-only" });
    const rc = V.validateReceiptLink(req.body && req.body.url, req.body && req.body.note, req.body && req.body.relation);
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

  /* The relation a person states for a source (supports / contradicts / mentions / unstated). Changing it is recorded with
     the previous value, so the history of the judgment stays on the receipt. */
  app.put("/api/runs/:id/passages/:pid/claims/:cid/receipts/:rid/relation", wrap(async (req, res) => {
    const { b } = await loadClaim(req.params.id, req.params.pid, req.params.cid);
    if (b.run.example) return res.status(403).json({ error: "the supplied example is read-only" });
    const relation = V.validateRelation(req.body && req.body.relation);
    await store.mutateClaim(req.params.id, req.params.pid, req.params.cid, (c) => {
      const rc = (c.receipts || []).find(x => x.rid === req.params.rid); if (!rc) { const e = new Error("receipt not found"); e.status = 404; throw e; }
      if (rc.withdrawnAt) { const e = new Error("this source was withdrawn; its relation is on record and cannot change"); e.status = 409; e.code = "receipt_withdrawn"; throw e; }
      const was = rc.relation || "unstated";
      if (was === relation) return;
      const now = new Date().toISOString();
      rc.relationHistory = (rc.relationHistory || []).concat([{ relation: was, by: rc.relationBy || "", at: rc.relationAt || "", replacedAt: now }]);
      Object.assign(rc, { relation, relationBy: "person at this computer", relationAt: now });
    }, { expectedReadingRev: rev(req) });
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

  app.get("/api/runs/:id/export.json", wrap(async (req, res) => { const b = await store.bundle(req.params.id); if (!b) return res.status(404).json({ error: "run not found" }); res.setHeader("Content-Disposition", "attachment; filename=\"" + safeName(b.run.title) + ".deflate.json\""); b.attempts = await store.attemptsLog(req.params.id); res.json(buildExport(b)); }));
  app.get("/api/runs/:id/export.md", wrap(async (req, res) => { const b = await store.bundle(req.params.id); if (!b) return res.status(404).json({ error: "run not found" }); const level = req.query.level === "g5" ? "g5" : "hs"; res.setHeader("Content-Disposition", "attachment; filename=\"" + safeName(b.run.title) + (level === "g5" ? ".fifth-grade" : "") + ".deflate.md\""); res.type("text/markdown").send(buildMarkdown(b, level)); }));

  /* The model call. The page sends {prompt, json, images:[{mediaType,data}], runId?, purpose?} and gets
     {data|text, usage, model, provenance}. Every call is recorded by the server (store.recordCall) with the provider's
     request id, the model that answered, token usage, latency, and hashes of the prompt and the answer; the page names the
     record by callId when it saves the reading, and the server copies its own record onto the passage. Failures are
     recorded too, so "the model was asked and did not answer" is on file. */
  app.post("/api/sample", wrap(async (req, res) => {
    const ai = state.ai;
    if (!ai) return res.status(503).json({ error: noModelMessage(), code: "no_ai" });
    const { prompt, json, images, runId, purpose, basedOn, passageId } = req.body || {};
    if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "prompt required", code: "invalid_request" });
    if (Buffer.byteLength(prompt, "utf8") > 400000) return res.status(400).json({ error: "prompt too large", code: "prompt_too_large" });
    const ctl = new AbortController();
    res.on("close", () => { if (!res.writableEnded) ctl.abort(); });
    const imgs = Array.isArray(images) ? images.slice(0, 8) : [];
    if (imgs.some(im => !im || !/^image\/(png|jpeg|webp|gif)$/.test(String(im.mediaType || "")) || typeof im.data !== "string")) return res.status(400).json({ error: "pictures must be png, jpeg, webp or gif with base64 data", code: "invalid_request" });
    // New readings are sifted on the server before the browser ever receives them. Legacy calls remain on file,
    // but cannot acquire the server-owned review record by sending fields in a later passage save.
    if (["deflate", "claim"].includes(purpose) && typeof runId === "string" && passageId) {
      const b = await store.bundle(runId), p = b && b.passages.find(x => x.id === passageId);
      if (!p) throw Object.assign(new Error("passage not found"), { status: 404 });
      if ((purpose === "claim") !== (b.run.kind === "claim")) throw Object.assign(new Error("The reading request does not match this input type."), { status: 400 });
      if (b.run.example) throw Object.assign(new Error("Copy the example before preparing it."), { status: 403 });
      if (Q.attributionGate(b).status !== "ready") throw Object.assign(new Error("Speaker preparation must finish before a reading is made."), { status: 409, code: "attribution_held" });
      const basis = await store.captureCallBasis(runId, basedOn, purpose);
      if (!basis || basis.origin === "unknown" || basis.inputHash !== b.run.input.sha256 || basis.attrSig !== b.attrSig) throw Object.assign(new Error("Reload the current input before preparing the reading."), { status: 409, code: "input_changed" });
      // the reading is built here from the saved input, exactly as the automatic reading builds it; a prompt sent by the
      // page is not used, so no client can read a passage under older or different instructions
      const m = readingMaterial(b, p);
      return res.json(await reviewedReading({ ai, store, b, p, purpose, prompt: m.prompt, signal: ctl.signal, basis, source: m.source, contract: P.CONTRACT, context: m.context }));
    }
    if (runId && purpose === "patterns") {
      const b = await store.bundle(runId);
      if (!b) throw Object.assign(new Error("Reading not found."),{status:404});
      if (b.run.example) throw Object.assign(new Error("Copy the example before reading it."),{status:403});
      const basis = await store.captureCallBasis(runId,basedOn,purpose);
      const ready = b.passages.filter(p=>p.readingGate.status==="ready");
      if (!basis || basis.origin==="unknown" || Q.attributionGate(b).status!=="ready") throw Object.assign(new Error("Prepare the current reading first."),{status:409,code:"input_changed"});
      return res.json(await reviewedOverview({ai,store,b,prompt:P.patterns(b.run,ready),basis,signal:ctl.signal,contract:P.CONTRACT}));
    }
    const call = { callId: newId("call"), at: new Date().toISOString(), purpose: String(purpose || "").replace(/[^a-z0-9_]/gi, "").slice(0, 40), runId: typeof runId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(runId) ? runId : "", provider: ai.kind, modelRequested: ai.model, mock: !!ai.mock,
      ...(ai.host ? { providerHost: ai.host } : {}), promptHash: sha256(prompt), promptChars: prompt.length, images: imgs.map(im => ({ mediaType: String(im && im.mediaType || ""), sha256: crypto.createHash("sha256").update(String(im && im.data || ""), "base64").digest("hex") })), json: !!json };
    // Resolve the page's input version before the provider starts. The stored record, not a later browser save,
    // determines what a completed reading was based on. Unknown origins remain unknown.
    call.basedOn = await store.captureCallBasis(call.runId, basedOn, call.purpose);
    const t0 = Date.now();
    try {
      const out = await ai.sample({ prompt, json: !!json, images: imgs, signal: ctl.signal });
      Object.assign(call, { latencyMs: Date.now() - t0, modelReturned: out.model || "", requestId: out.requestId || "", stopReason: out.stopReason || "", usage: out.usage || null, outputHash: sha256(out.text || ""), outputChars: String(out.text || "").length });
      const rec = await store.recordCall(call.runId, call).catch(e => { console.error("call record failed:", e.message); return call; });
      res.json(Object.assign({}, out, { provenance: rec }));
    } catch (e) {
      Object.assign(call, { latencyMs: Date.now() - t0, error: e.code || "upstream_error", errorMessage: String(e.message || "").slice(0, 300) });
      if (e.meta) Object.assign(call, { modelReturned: e.meta.model || "", requestId: e.meta.requestId || "", stopReason: e.meta.stopReason || "", usage: e.meta.usage || null, outputHash: sha256(e.text || ""), outputChars: String(e.text || "").length }); // answered, but not as JSON
      if (ctl.signal.aborted) return;
      const rec = await store.recordCall(call.runId, call).catch(() => call);
      res.status(e.code === "bad_key" ? 401 : e.code === "rate_limited" ? 429 : e.code === "invalid_json" ? 422 : 502).json({ error: e.message, code: e.code || "upstream_error", text: e.text, provenance: rec });
    }
  }));

  app.use("/shared", express.static(path.join(__dirname, "..", "shared")));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json(Object.assign({ error: err.message || "server error" }, err.code ? { code: err.code } : {}, err.code === "reading_held" && Array.isArray(err.issues) ? { issues: err.issues } : {}));
  });

  return { app, store, state, reader, get ai() { return state.ai; }, ready, jobs, engines, resolver };
}

function safeName(s) { return String(s || "run").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60) || "run"; }

module.exports = { createApp };
