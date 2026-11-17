"use strict";
/* Deflate's bounded lifecycle for the existing Nikodemus connection. The native
   resolver, acquisition jobs, intake, reader, checks and signed exporter are reused.
   A bridge record owns one Start. Recovery only observes saved work; it never
   repeats an acquisition, model request, consume, or read. No keys/headers/cookies
   are part of this protocol. Dollar amounts below are list-price estimates, not
   provider invoices. Uploaded audio is temporary; its digest survives deletion. */
const fs = require("fs/promises"), path = require("path"), crypto = require("crypto");
const { pipeline } = require("stream/promises"), { Transform } = require("stream");
const nodefs = require("fs");
const { canonicalize } = require("./deposition");
const { createReader } = require("./reading");
const AF = require("./podcast/audiofile");
const { isPrivateHost } = require("./podcast/resolve");
const CONTRACT = "deflate.bridge.v1", MAX_UPLOAD = 128 * 1024 * 1024;
const hash = x => crypto.createHash("sha256").update(x).digest("hex");
const digest = x => hash(Buffer.from(canonicalize(x)));
const now = () => new Date().toISOString();
const idOK = x => typeof x === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(x);
const fail = (code, message, status = 409) => Object.assign(new Error(message), { code, status });
const TERMINAL = new Set(["completed", "partial", "failed", "interrupted", "unknown", "needs_selection"]);
const PRICE_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";
const RATE = Object.freeze({ id: "anthropic.direct.sonnet-5-5.global.2026-10-18", provider: "anthropic", model: "claude-sonnet-5-5", currency: "USD", verified_at: "2026-10-18", source: PRICE_SOURCE,
  per_million: { input_tokens: 2, output_tokens: 10, cache_creation_5m_input_tokens: 2.5, cache_creation_1h_input_tokens: 4, cache_read_input_tokens: 0.1 }, scope: "Direct Anthropic API, standard global routing; no tools, images, cache directives, batch or fast mode." });

/* A conservative pattern filter, not a claim to identify every secret. Captures
   carry explicit redaction paths. Known credential-shaped URL values are refused
   at input rather than altering the source URL and silently fetching another URL. */
function sanitize(value, { anthropicResponse = false } = {}) {
  const redactions = [];
  const sensitive = /^(?:authorization|cookie|set-cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|signature|x-amz-signature|x-goog-signature)$/i;
  // Anthropic's typed thinking-block signature authenticates model output; it
  // is not a credential. Only the provider-response capture opts into this
  // exact structural exception. The string still passes the pattern/URL scan.
  const message = anthropicResponse && value && value.provider_response;
  const thinkingSignatures = !!(message && message.type === "message" && message.role === "assistant" && Array.isArray(message.content));
  function walk(v, p) {
    if (Array.isArray(v)) return v.map((x, i) => walk(x, p + "[" + i + "]"));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => {
      const providerSignature = thinkingSignatures && k === "signature" && v.type === "thinking" && typeof v.thinking === "string" && /^\$\.provider_response\.content\[\d+\]$/.test(p);
      if (sensitive.test(k) && typeof x === "string" && !providerSignature) { redactions.push({ path: p + "." + k, kind: "credential_field" }); return [k, "[redacted]"]; }
      return [k, walk(x, p + "." + k)];
    }));
    if (typeof v !== "string") return v;
    let s = v.replace(/<input\b(?:[^>"\']|"[^"]*"|\'[^\']*\')*>/gi, tag => {
      if (/\btype\s*=\s*(?:"hidden"|\'hidden\'|hidden)(?:\s|\/?$|>)/i.test(tag) && /\bvalue\s*=/i.test(tag)) {
        redactions.push({ path: p, kind: "hidden_form_control" }); return "[hidden form control omitted]";
      }
      return tag;
    }).replace(/\b(?:sk-ant-|sk-|ghp_|github_pat_)[A-Za-z0-9_-]{16,}|\bBearer\s+[A-Za-z0-9._~-]{12,}/gi, () => { redactions.push({ path: p, kind: "credential_pattern" }); return "[redacted]"; });
    s = s.replace(/https?:\/\/[^\s<>"']+/gi, raw => {
      try {
        const u = new URL(raw); let changed = false;
        if (u.username || u.password) { u.username = ""; u.password = ""; changed = true; }
        for (const k of [...u.searchParams.keys()]) if (sensitive.test(k)) { u.searchParams.set(k, "[redacted]"); changed = true; }
        if (changed) { redactions.push({ path: p, kind: "url_credentials" }); return u.href; }
      } catch (_) {}
      return raw;
    });
    return s;
  }
  return { value: walk(value, "$"), redactions, exact: !redactions.length, policy: "credential-patterns-v1" };
}
function safe(value) { const s = sanitize(value); if (!s.exact) throw fail("secret_input", "Credential-shaped content is excluded from the bridge. Remove it before preparing this source.", 400); return value; }
function text(v, max) { if (v == null) return ""; if (typeof v !== "string" || v.length > max) throw fail("invalid_request", "A text field exceeds its limit.", 400); return safe(v.trim()); }
function sourceURL(v) {
  const s = text(v, 2000); let u; try { u = new URL(s); } catch (_) { throw fail("invalid_url", "Use a public HTTP or HTTPS source URL.", 400); }
  if (!/^https?:$/.test(u.protocol) || isPrivateHost(u.hostname) || u.username || u.password || u.hash) throw fail("invalid_url", "Use a public HTTP or HTTPS source URL without credentials or a fragment.", 400);
  return s;
}
async function atomic(file, bytes, exclusive = false) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
  const h = await fs.open(tmp, "wx", 0o600);
  try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
  try {
    if (exclusive) { await fs.link(tmp, file); await fs.unlink(tmp); } else await fs.rename(tmp, file);
    const d = await fs.open(path.dirname(file), "r"); try { await d.sync(); } finally { await d.close(); }
  } catch (e) { await fs.rm(tmp, { force: true }); throw e; }
}
const readJSON = file => fs.readFile(file, "utf8").then(JSON.parse);
const writeJSON = (file, obj, exclusive) => atomic(file, Buffer.from(JSON.stringify(obj, null, 2) + "\n"), exclusive);
function rateFor(ai) { return ai && ai.kind === "anthropic" && ai.model === RATE.model && /^https:\/\/api\.anthropic\.com\/?$/.test(ai.endpoint || "") && typeof ai.withLimits === "function" ? RATE : null; }
function usageCost(usage, rate) {
  if (!usage || !rate || !Number.isInteger(usage.input_tokens) || !Number.isInteger(usage.output_tokens) || usage.input_tokens < 0 || usage.output_tokens < 0) return null;
  const cc = usage.cache_creation || {}, c5 = cc.ephemeral_5m_input_tokens || 0, c1 = cc.ephemeral_1h_input_tokens || 0, cr = usage.cache_read_input_tokens || 0;
  if (![c5, c1, cr].every(x => Number.isInteger(x) && x >= 0) || (usage.cache_creation_input_tokens || 0) !== c5 + c1 || usage.server_tool_use && Object.values(usage.server_tool_use).some(x => x)) return null;
  return Math.ceil((usage.input_tokens * rate.per_million.input_tokens + usage.output_tokens * rate.per_million.output_tokens + c5 * 2.5 + c1 * 4 + cr * .1) * 1000) / 1e9;
}
function costs(row) {
  const attempts = row.attempts || [];
  const estimated = attempts.reduce((s, a) => s + (a.estimated_cost_usd || 0), 0);
  const reserved = attempts.filter(a => a.estimated_cost_usd == null).reduce((s, a) => s + a.reserved_usd, 0);
  return { currency: "USD", allowance_usd: row.plan.allowance_usd, estimated_cost_usd: estimated, unknown_reserved_usd: reserved, committed_usd: estimated + reserved, actual_cost_usd: null,
    status: attempts.some(a => a.status === "unknown" || a.status === "intent") ? "unknown_charge" : attempts.length ? "estimated_from_provider_usage" : "not_dispatched", basis: "Verified list rates and retained provider usage; actual invoice not available.", acquisition: { engine: "local", paid_cost_usd: 0 }, attempts };
}
function createBridge({ store, jobs, resolver, engines, getAI, consumeTranscriptJob, depo, ready: appReady, htmlToText }) {
  const root = path.join(store.dataDir, "bridge-v1"), rows = new Map(), workers = new Map();
  let mutationTail = Promise.resolve(), uploading = 0;
  const lock = fn => { const p = mutationTail.then(fn); mutationTail = p.catch(() => {}); return p; };
  const rowFile = id => path.join(root, "jobs", id + ".json");
  const save = row => writeJSON(rowFile(row.bridge_id), row);
  const view = row => ({ ...row, costs: costs(row) });
  const mutate = (row, fn) => lock(async () => {
    const before = JSON.parse(JSON.stringify(row));
    try { fn(row); row.updated_at = now(); await save(row); return row; }
    catch (e) { for (const k of Object.keys(row)) delete row[k]; Object.assign(row, before); throw e; }
  });
  const artifactPath = (id, name) => path.join(root, "artifacts", id, name);
  async function keep(row, name, value, options) {
    const capture = sanitize(value, options), bytes = Buffer.from(JSON.stringify(capture.value, null, 2) + "\n");
    await atomic(artifactPath(row.bridge_id, name), bytes, true);
    return { name, sha256: hash(bytes), bytes: bytes.length, media_type: "application/json", exact: capture.exact, redactions: capture.redactions,
      path: "/api/bridge/jobs/" + row.bridge_id + "/artifacts/" + name };
  }
  async function finishExport(row) {
    if (!row.runId || row.result) return;
    const b = await store.bundle(row.runId); if (!b) return;
    const envelope = await depo.buildDeposition(b);
    // A signature cannot be silently redacted. Hold export if unsafe instead.
    safe(envelope);
    let kept;
    try { kept = await keep(row, "deposition.json", envelope); }
    catch (e) {
      if (e.code !== "EEXIST") throw e;
      const bytes = await fs.readFile(artifactPath(row.bridge_id, "deposition.json"));
      const old = JSON.parse(bytes); if (!old.object || old.object.id !== row.runId) throw fail("artifact_mismatch", "Saved export does not match this run.");
      kept = { name: "deposition.json", sha256: hash(bytes), bytes: bytes.length, media_type: "application/json", exact: true, redactions: [], path: "/api/bridge/jobs/" + row.bridge_id + "/artifacts/deposition.json" };
    }
    await mutate(row, r => { r.result = { runId: r.runId, deposition: kept, transcript_sha256: b.run.input.sha256, reading_count: b.passages.filter(p => p.readingGate.status === "ready").length, held_count: b.passages.filter(p => p.readingGate.status !== "ready").length, source_identity: b.run.sourceIdentity || null }; });
  }
  const ready = Promise.resolve(appReady).then(async () => {
    await fs.mkdir(path.join(root, "jobs"), { recursive: true, mode: 0o700 });
    for (const name of await fs.readdir(path.join(root, "jobs"))) {
      if (!/^b_[a-f0-9]{32}\.json$/.test(name)) continue;
      const r = await readJSON(path.join(root, "jobs", name));
      if (r.bridge_id + ".json" !== name || r.contract !== CONTRACT) throw fail("bridge_corrupt", "A saved bridge record does not match its file.");
      rows.set(r.bridge_id, r);
      if (!TERMINAL.has(r.state)) {
        if (!r.jobId) { const matches = (await jobs.pending("resolve")).filter(j => j.input && j.input.bridge_id === r.bridge_id); if (matches.length === 1) r.jobId = matches[0].id; }
        const j = r.jobId && await jobs.get(r.jobId); if (j && j.runId) r.runId = j.runId;
        r.state = "interrupted"; r.error = { code: "interrupted", message: "The producer restarted. Saved sources and responses remain; no request was replayed." };
        r.finished_at = now();
        if (r.upload_id) { try { await fs.rm(path.join(root, "uploads", r.upload_id + ".audio"), { force: true }); } catch (_) { r.cleanup_gap = "Temporary source audio could not be removed after restart."; } }
        await save(r);
        try { await finishExport(r); } catch (_) { r.export_gap = "Saved partial output could not be exported; inspect the retained run."; await save(r); }
      }
    }
  });
  function capabilities() {
    const ai = getAI(), rate = rateFor(ai);
    return { contract: CONTRACT, model: ai ? { provider: ai.kind, model: ai.model, priced: !!rate, rate_card: rate, mock: !!ai.mock } : null,
      engines: { local: { available: !!engines.local.installed(), model: engines.local.model, paid_cost_usd: 0 }, cloud: { available: false, why: "Cloud transcription needs a verified duration and price bound before it can be offered by this bridge. Native configuration is preserved." } },
      limits: { max_upload_bytes: MAX_UPLOAD, upload_formats: ["mp3"], default_allowance_usd: .5, max_allowance_usd: 10, max_model_calls: 24, max_output_tokens: 8192, max_prompt_bytes: 80000 },
      recovery: "Read saved status by request_id after uncertainty; never issue a new Start to repair a missing reply.", question: "Optional purpose only; a Deflate reading does not establish an answer to it." };
  }
  async function prepare(body) {
    await ready; safe(body);
    const cap = capabilities(), input = body.input || {}; let src;
    if (input.kind === "url") src = { kind: "url", url: sourceURL(input.url) };
    else if (input.kind === "upload") {
      if (!/^[a-f0-9]{64}$/.test(input.sha256 || "") || !Number.isInteger(input.bytes) || input.bytes < 12 || input.bytes > MAX_UPLOAD || input.format !== "mp3") throw fail("invalid_upload", "Choose an MP3 within the upload limit.", 400);
      src = { kind: "upload", name: text(input.name, 200).replace(/[\/\\\x00-\x1f]/g, "_"), sha256: input.sha256, bytes: input.bytes, format: "mp3" };
    } else throw fail("invalid_input", "Choose a source URL or an MP3 upload.", 400);
    if (body.engine !== "local") throw fail("engine_not_bounded", "This bridge currently supports explicitly chosen local audio transcription only.");
    const enabled = body.reading_enabled === true, allowance = enabled ? body.allowance_usd == null ? .5 : body.allowance_usd : 0;
    if (typeof allowance !== "number" || !Number.isFinite(allowance) || allowance < 0 || allowance > 10 || enabled && allowance <= 0) throw fail("invalid_allowance", "Choose a reading allowance greater than zero and at most $10.", 400);
    const maxCalls = body.max_model_calls == null ? 24 : body.max_model_calls, maxOutput = body.max_output_tokens == null ? 8192 : body.max_output_tokens;
    if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 24 || !Number.isInteger(maxOutput) || maxOutput < 1024 || maxOutput > 8192) throw fail("invalid_limits", "The requested call or output limit is outside the bridge bounds.", 400);
    const origin = {}; for (const k of ["doc_id", "snapshot_id", "revision", "origin_sha256", "storage"]) if (body.origin && body.origin[k] != null) origin[k] = text(String(body.origin[k]), k === "storage" ? 120 : 100);
    const context = {}; for (const k of ["title", "sourceLabel", "sourceDate"]) if (body.context && body.context[k]) context[k] = text(body.context[k], 600);
    const blockers = []; if (!cap.engines.local.available) blockers.push("Local transcription is not installed.");
    if (enabled && !(cap.model && cap.model.priced)) blockers.push("The configured model/endpoint does not have a supported verified rate card.");
    const plan = { contract: CONTRACT, input: src, context, origin, question: text(body.question, 4000), engine: "local", reading_enabled: enabled, allowance_usd: allowance,
      model: enabled ? cap.model : null, max_model_calls: maxCalls, max_output_tokens: maxOutput, max_prompt_bytes: 80000, created_at: now(),
      outbound: ["Public source fetches after Start; existing explicit local browser access setting stays on this computer.", "Chosen audio stays on this computer; optional local model files may need downloading.", ...(enabled ? ["Acquired text and its source listing go to the configured Anthropic model for readings and checks, within the allowance."] : [])],
      exclusions: ["No cloud transcription or diarization", "No external paid source-search tools", "No automatic restart or network retry after an unknown outcome"],
      estimate_basis: "Reserve each call from UTF-8 prompt bytes plus 1024 protocol tokens and maximum output; settle only from retained provider usage. Estimates exclude taxes/discounts; no invoice claim.", ready: !blockers.length, blockers };
    const plan_sha256 = digest(plan), plan_id = "p_" + plan_sha256;
    await writeJSON(path.join(root, "plans", plan_id + ".json"), { plan_id, plan_sha256, plan }, true).catch(e => { if (e.code !== "EEXIST") throw e; });
    return { plan_id, plan_sha256, plan, ready: plan.ready, blockers };
  }
  async function upload(req) {
    await ready;
    const name = text(req.query.name, 200).replace(/[\/\\\x00-\x1f]/g, "_"), expected = req.query.sha256;
    if (!/^[a-f0-9]{64}$/.test(expected || "")) throw fail("invalid_upload", "The upload needs its frozen SHA-256.", 400);
    if (!/^audio\/mpeg(?:;|$)|^application\/octet-stream(?:;|$)/i.test(req.headers["content-type"] || "")) throw fail("invalid_upload", "Send an MP3 as audio/mpeg or application/octet-stream.", 400);
    const id = "u_" + expected, dir = path.join(root, "uploads"), file = path.join(dir, id + ".audio"), tmp = file + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
    if (uploading >= 3) throw fail("uploads_busy", "Three uploads are already arriving. Wait for one to finish.");
    await fs.mkdir(dir, { recursive: true, mode: 0o700 }); let bytes = 0; const h = crypto.createHash("sha256");
    req.setTimeout && req.setTimeout(120000, () => req.destroy());
    uploading++;
    try {
      const declared = Number(req.headers["content-length"] || 0); if (declared > MAX_UPLOAD) throw fail("too_large", "The upload exceeds 128 MiB.", 413);
      await pipeline(req, new Transform({ transform(chunk, enc, cb) { bytes += chunk.length; if (bytes > MAX_UPLOAD) return cb(fail("too_large", "The upload exceeds 128 MiB.", 413)); h.update(chunk); cb(null, chunk); } }), nodefs.createWriteStream(tmp, { flags: "wx", mode: 0o600 }));
      if (h.digest("hex") !== expected) throw fail("upload_changed", "The bytes differ from the frozen upload.");
      if (await AF.sniffFile(tmp) !== "mp3") throw fail("unsupported_format", "Local bridge uploads must contain MP3 audio.", 400);
      const fh = await fs.open(tmp, "r+"); try { await fh.sync(); } finally { await fh.close(); }
      await fs.rename(tmp, file);
      const value = { id, name, sha256: expected, bytes, format: "mp3", created_at: now() }; await writeJSON(path.join(dir, id + ".json"), value);
      return { upload: value };
    } finally { uploading--; await fs.rm(tmp, { force: true }); }
  }
  async function getUpload(id) { if (!/^u_[a-f0-9]{64}$/.test(id || "")) throw fail("invalid_upload", "Invalid upload id.", 400); const m = await readJSON(path.join(root, "uploads", id + ".json")); await fs.access(path.join(root, "uploads", id + ".audio")); return { upload: m }; }
  async function start(body) {
    await ready;
    if (!idOK(body.request_id) || !/^p_[a-f0-9]{64}$/.test(body.plan_id || "")) throw fail("invalid_request", "Start requires a saved plan and stable request id.", 400);
    return lock(async () => {
      const id = "b_" + hash(body.request_id).slice(0, 32), old = rows.get(id);
      if (old) { if (old.request_id !== body.request_id || old.plan_id !== body.plan_id || old.plan_sha256 !== body.plan_sha256 || old.upload_id !== (body.upload_id || "")) throw fail("idempotency_conflict", "This request id already names a different Start."); return view(old); }
      if ([...rows.values()].some(r => r.plan_id === body.plan_id)) throw fail("plan_already_started", "This proposal already has a Start. Read its original request status; prepare a new proposal for new work.");
      const saved = await readJSON(path.join(root, "plans", body.plan_id + ".json"));
      if (saved.plan_sha256 !== body.plan_sha256 || digest(saved.plan) !== body.plan_sha256) throw fail("plan_changed", "The frozen plan does not match Start.");
      const p = saved.plan;
      if (!p.ready) throw fail("not_ready", "This proposal has unresolved setup requirements.");
      if (!engines.local.installed()) throw fail("engine_changed", "Local transcription is no longer installed.");
      let ai = null;
      if (p.reading_enabled) {
        const current = getAI(), rate = rateFor(current);
        if (!rate || current.model !== p.model.model || digest(rate) !== digest(p.model.rate_card)) throw fail("model_changed", "Model or price configuration changed. Prepare a new proposal.");
        ai = current.withLimits({ maxOutputTokens: p.max_output_tokens });
      }
      if (p.input.kind === "upload") {
        if ([...rows.values()].some(r => r.upload_id === body.upload_id && !TERMINAL.has(r.state))) throw fail("upload_in_use", "This upload is already being processed.");
        const u = (await getUpload(body.upload_id)).upload;
        if (["name", "sha256", "bytes", "format"].some(k => u[k] !== p.input[k])) throw fail("upload_changed", "The staged upload differs from the frozen proposal.");
      } else if (body.upload_id) throw fail("invalid_upload", "A URL proposal cannot use an upload.", 400);
      const row = { contract: CONTRACT, bridge_id: id, request_id: body.request_id, plan_id: body.plan_id, plan_sha256: body.plan_sha256, plan: p, upload_id: body.upload_id || "", state: "starting", started_at: now(), updated_at: now(), jobId: "", runId: "", acquisition: { status: "pending" }, reading: { status: p.reading_enabled ? "pending" : "not_requested" }, attempts: [], progress: [], result: null };
      // Persist intent before scheduling ANY source fetch or paid request. One
      // request id remains spent even if the process dies on the next line.
      await writeJSON(rowFile(id), row, true); rows.set(id, row);
      const worker = Promise.resolve().then(() => execute(row, ai)); workers.set(id, worker); worker.finally(() => workers.delete(id)).catch(() => {});
      return view(row);
    });
  }
  async function boundedAI(row, ai) {
    return { kind: ai.kind, model: ai.model, mock: !!ai.mock, async sample(args) {
      if (row.attempts.some(a => a.status === "intent" || a.status === "unknown")) throw fail("budget", "A previous charge is unresolved; no further request can be sent.");
      if (row.attempts.length >= row.plan.max_model_calls || (args.images || []).length) throw fail("budget", "The proposal's call/input limit was reached.");
      const bytes = Buffer.byteLength(String(args.prompt || ""));
      if (bytes > row.plan.max_prompt_bytes) throw fail("budget", "The prompt exceeds the proposal's input limit.");
      const request = ai.requestFor(args), clean = sanitize(request);
      if (!clean.exact) throw fail("secret_input", "Credential-shaped content in source material was excluded before model dispatch.");
      const reserve = Math.ceil(((bytes + 1024) * 2 + row.plan.max_output_tokens * 10) * 1000) / 1e9;
      if (costs(row).committed_usd + reserve > row.plan.allowance_usd + 1e-10) throw fail("budget", "The next request would exceed the disclosed allowance.");
      const attempt_id = "model_" + String(row.attempts.length + 1).padStart(3, "0");
      const req = await keep(row, attempt_id + ".request.json", request);
      const attempt = { attempt_id, producer_call_id: args.capture && args.capture.callId || "", purpose: args.capture && args.capture.purpose || "", run_id: row.runId, provider: ai.kind, model: ai.model, status: "intent", started_at: now(), reserved_usd: reserve, estimated_cost_usd: null, rate_card: row.plan.model.rate_card, request: req };
      await mutate(row, r => r.attempts.push(attempt));
      let out, error;
      try { out = await ai.sample(args); } catch (e) { error = e; }
      const meta = out || error && error.meta || {}, raw = meta.providerResponse || error && error.providerResponse || null;
      const receipt = { attempt_id, response_observed: !!raw, provider_response: raw, text: out && out.text || error && error.text || null, usage: meta.providerUsage || null,
        model: meta.model || ai.model, request_id: meta.requestId || raw && raw.id || "", stop_reason: meta.stopReason || raw && raw.stop_reason || "", error: error ? { code: error.code || "upstream_error", status: error.status || null, message: String(error.message || "Request failed").slice(0, 500) } : null };
      let kept; try { kept = await keep(row, attempt_id + ".response.json", receipt, { anthropicResponse: ai.kind === "anthropic" }); } catch (_) { throw fail("capture_failed", "A dispatched response could not be saved. Further calls are blocked; no retry is safe."); }
      const estimated = receipt.model === ai.model ? usageCost(receipt.usage, row.plan.model.rate_card) : null;
      const held = estimated == null || estimated > reserve + 1e-10;
      await mutate(row, () => Object.assign(attempt, { finished_at: now(), status: held ? "unknown" : error ? "failed" : "completed", response: kept, usage: sanitize(receipt.usage).value, provider_response_id: receipt.request_id, stop_reason: receipt.stop_reason, estimated_cost_usd: estimated, error: sanitize(receipt.error).value }));
      if (held) throw fail("budget", "The provider usage or charge is outside the verified bound. Further calls are blocked.");
      if (error) throw error;
      if (!kept.exact) throw fail("sensitive_response", "The provider response contained credential-shaped content; only its explicitly redacted capture was retained.");
      return out;
    } };
  }
  async function execute(row, ai) {
    let progressTail = Promise.resolve(), acquisitionJob, terminal = "failed";
    const step = (name, note) => { progressTail = progressTail.then(() => mutate(row, r => { r.progress.push({ at: now(), name: text(String(name || "step"), 100), note: sanitize(String(note || "")).value.slice(0, 600) }); if (r.progress.length > 200) r.progress.shift(); })); progressTail.catch(() => {}); };
    try {
      const p = row.plan;
      const input = { ...(p.input.kind === "url" ? { url: p.input.url, guid: "" } : { upload: { ...p.input, id: row.upload_id } }), choice: "local", context: p.context, bridge_id: row.bridge_id };
      acquisitionJob = jobs.start("resolve", input, async ctx => {
        await mutate(row, r => { r.jobId = acquisitionJob.id; r.state = "acquiring"; r.acquisition.status = "running"; });
        const onProgress = value => step("transcription", JSON.stringify(sanitize(value).value));
        const recordStep = (name, note) => { ctx.step(sanitize(String(name || "step")).value, sanitize(String(note || "")).value); step(name, note); };
        let result;
        try {
          if (p.input.kind === "upload") {
            const file = path.join(root, "uploads", row.upload_id + ".audio");
            const bytes = await fs.readFile(file); if (hash(bytes) !== p.input.sha256 || bytes.length !== p.input.bytes) throw fail("upload_changed", "The staged file changed before acquisition.");
            const tags = safe(await AF.tags(file, "mp3"));
            const w = await resolver.fileWords({ ...p.input, path: file, type: "audio/mpeg", tags, titleFromName: AF.titleFromName(p.input.name) }, { step: recordStep, signal: ctx.signal, engine: "local", onProgress });
            result = { kind: w.ok ? "transcript" : "none", ...w, fetchedAt: now() };
          } else {
            const located = await resolver.locate(input, recordStep);
            if (located.kind === "choose") result = { kind: "choose", show: located.show, episodes: located.episodes, note: located.note || "" };
            else if (located.kind === "article") {
              const raw = await keep(row, "source-page.json", { url: p.input.url, resolved_url: located.url, html: located.html, retrieved_at: now(), media_type: "text/html" });
              await mutate(row, r => { r.source_artifact = raw; });
              const r = htmlToText(located.html); result = r.text.replace(/\s+/g, " ").length < 200 ? { kind: "none", reason: "The page has too little readable text." } : { kind: "article", text: r.text, title: r.title, url: located.url, chars: r.text.length, note: "An article page, read as text." }; }
            else { const w = await resolver.words(located, { step: recordStep, signal: ctx.signal, choice: "local", onProgress }); result = { kind: w.ok ? "transcript" : "none", ...w, fetchedAt: now() }; }
          }
          safe(result); await progressTail;
          return result;
        } catch (e) { throw fail(e.code || "acquisition_failed", sanitize(String(e.message || "Acquisition failed")).value.slice(0, 500)); }
      });
      let job;
      for (;;) { job = await jobs.get(acquisitionJob.id); if (job.state !== "running") break; await new Promise(r => setTimeout(r, 100)); }
      await progressTail;
      // Match native upload lifecycle: source audio is gone before an export
      // declares that only its hash and resulting text survive.
      if (row.upload_id) await fs.rm(path.join(root, "uploads", row.upload_id + ".audio"), { force: true });
      const acquired = await keep(row, "acquisition.json", job);
      await mutate(row, r => { r.acquisition = { status: job.state, result_kind: job.result && job.result.kind || "", artifact: acquired, error: job.error || null }; });
      if (job.state !== "done" || !["article", "transcript"].includes(job.result && job.result.kind)) {
        await mutate(row, r => { terminal = job.result && job.result.kind === "choose" ? "needs_selection" : "failed"; r.state = "finishing"; r.error = job.error || { code: "no_transcript", message: job.result && job.result.reason || "No transcript was acquired." }; });
        return;
      }
      await mutate(row, r => { r.state = "importing"; r.runId = "r_" + job.id; });
      const runId = await consumeTranscriptJob(job.id);
      if (runId !== row.runId) throw fail("run_mismatch", "The imported run did not match this acquisition.");
      if (p.reading_enabled) {
        const wrapped = await boundedAI(row, ai);
        // Own reader instance: no paid source search, no cloud voice separation.
        const reader = createReader({ store, getAI: () => wrapped, research: null, voices: { engine: () => null, prefer: () => "local" }, provider: () => ai.kind });
        await mutate(row, r => { r.state = "reading"; r.reading = { status: "starting", started_at: now() }; });
        await reader.start(runId);
        const work = reader.jobs.get(runId);
        if (work) {
          let done = false; work.done.finally(() => { done = true; });
          while (!done) {
            await Promise.race([work.done, new Promise(r => setTimeout(r, 500))]);
            const snapshot = await store.bundle(runId);
            if (snapshot && snapshot.run.processing) await mutate(row, r => { r.reading = snapshot.run.processing; });
          }
          await work.done;
        }
        const b = await store.bundle(runId);
        await mutate(row, r => { r.reading = b.run.processing || { status: "unknown" }; terminal = r.attempts.some(a => a.status === "unknown" || a.status === "intent") ? "unknown" : r.reading.status === "complete" ? "completed" : "partial"; r.state = "exporting"; });
      } else { terminal = "completed"; await mutate(row, r => { r.state = "exporting"; }); }
      await finishExport(row);
    } catch (e) {
      await mutate(row, r => { terminal = r.attempts.some(a => a.status === "intent" || a.status === "unknown") ? "unknown" : r.runId ? "partial" : "failed"; r.state = "exporting"; r.error = { code: e.code || "bridge_failed", message: sanitize(String(e.message || "Bridge failed")).value.slice(0, 500) }; });
      try { await finishExport(row); } catch (_) { await mutate(row, r => { r.export_gap = "Saved output could not be exported; the source run is retained."; }); }
    } finally {
      if (row.upload_id) { try { await fs.rm(path.join(root, "uploads", row.upload_id + ".audio"), { force: true }); } catch (_) { await mutate(row, r => { r.cleanup_gap = "Temporary source audio could not be removed."; }); } }
      await mutate(row, r => { r.state = terminal; r.finished_at = now(); });
    }
  }
  async function get(id) { await ready; await mutationTail; const r = rows.get(id); if (!r) throw fail("not_found", "No such bridge operation.", 404); return view(r); }
  async function byRequest(request) { if (!idOK(request)) throw fail("invalid_request", "Invalid request id.", 400); return get("b_" + hash(request).slice(0, 32)); }
  async function artifact(id, name) {
    const r = await get(id), refs = [r.source_artifact, r.result && r.result.deposition, r.acquisition && r.acquisition.artifact, ...r.attempts.flatMap(a => [a.request, a.response])].filter(Boolean);
    const ref = refs.find(x => x.name === name); if (!ref) throw fail("not_found", "No indexed artifact with that name.", 404);
    const bytes = await fs.readFile(artifactPath(id, name)); if (hash(bytes) !== ref.sha256) throw fail("artifact_changed", "The saved artifact failed its hash check."); return bytes;
  }
  function mount(app, wrap) {
    // Server-to-server callers have no Origin. A web page must use this exact
    // local origin; reject cross-site raw upload/Start form submissions too.
    app.use("/api/bridge", (req, res, next) => { const origin = req.headers.origin; if (origin && origin !== req.protocol + "://" + req.headers.host) return res.status(403).json({ code: "wrong_origin", error: "Use the local app to access this workflow." }); next(); });
    app.get("/api/bridge/capabilities", wrap(async (_req, res) => { await ready; res.json(capabilities()); }));
    app.post("/api/bridge/prepare", wrap(async (req, res) => res.json(await prepare(req.body || {}))));
    app.post("/api/bridge/uploads", wrap(async (req, res) => res.status(201).json(await upload(req))));
    app.get("/api/bridge/uploads/:id", wrap(async (req, res) => res.json(await getUpload(req.params.id))));
    app.post("/api/bridge/start", wrap(async (req, res) => res.status(202).json(await start(req.body || {}))));
    app.get("/api/bridge/requests/:id", wrap(async (req, res) => res.json(await byRequest(req.params.id))));
    app.get("/api/bridge/jobs/:id", wrap(async (req, res) => res.json(await get(req.params.id))));
    app.get("/api/bridge/jobs/:id/artifacts/:name", wrap(async (req, res) => res.type("application/json").send(await artifact(req.params.id, req.params.name))));
  }
  return { ready, capabilities, prepare, start, upload, getUpload, get, byRequest, artifact, mount, workers, root };
}
module.exports = { createBridge, sanitize, rateFor, usageCost, costs, atomic, CONTRACT, RATE, MAX_UPLOAD };
