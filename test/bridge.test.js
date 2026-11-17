"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs/promises"), os = require("os"), path = require("path"), crypto = require("crypto"), { Readable } = require("stream");
const { createApp } = require("../server/app"), { createMockAI, createAnthropicAI } = require("../server/ai");
const { createBridge, sanitize, usageCost, RATE, MAX_UPLOAD } = require("../server/bridge");
const { canonicalize } = require("../server/deposition");
const { buildExport } = require("../server/exportClaims");
const { mp3 } = require("./fixtures/audio-files");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const ARTICLE = "A source record describes an ordinary public meeting. The record gives a date, the attendees, and the words each person spoke. It does not establish anyone's private intentions. Readers can inspect the source and distinguish a direct observation from an interpretation. The next meeting is a separate event; no inference about its outcome follows from this record.";
function fakeAI(mode = "ok", state = {}) {
  const mock = createMockAI();
  return { kind: "anthropic", model: RATE.model, endpoint: "https://api.anthropic.com", mock: false, maxTokens: 8192,
    withLimits({ maxOutputTokens }) { state.limit = maxOutputTokens; return this; },
    requestFor({ prompt }) { return { model: this.model, max_tokens: state.limit || 8192, messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] }; },
    async sample(args) {
      state.calls = (state.calls || 0) + 1;
      if (state.before) await state.before(args);
      if (mode === "unknown") throw Object.assign(new Error("Connection ended after request transmission."), { code: "upstream_error" });
      const out = await mock.sample(args), usage = { input_tokens: 100, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, id = "fake_provider_" + state.calls;
      Object.assign(out, { model: mode === "drift" ? "unpriced-model" : this.model, requestId: id, providerUsage: usage, usage: { input: 100, output: 100 }, providerResponse: { id, model: this.model, usage, content: [{ type: "text", text: out.text }], stop_reason: "end_turn" } });
      if (mode === "thinking" || mode === "thinking-secret") {
        Object.assign(out.providerResponse, { type: "message", role: "assistant" });
        out.providerResponse.content.unshift({ type: "thinking", thinking: "", signature: mode === "thinking-secret" ? "sk-" + "ant-fixture-credential-shaped-value" : Buffer.from("provider output signature fixture").toString("base64") });
      }
      if (mode === "truncated") throw Object.assign(new Error("truncated"), { code: "truncated", text: "{partial", meta: { ...out, text: undefined, stopReason: "max_tokens" } });
      return out;
    }
  };
}
async function fixture(t, overrides = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-bridge-")), state = { calls: 0, acquisitions: 0 }, ai = overrides.ai || fakeAI(overrides.mode, state);
  const resolver = overrides.resolver || { async locate(input, step) { state.acquisitions++; step("Source", "Fetched fixture article"); if (state.acquire) await state.acquire(); return { kind: "article", url: input.url, html: "<article>" + ARTICLE + "</article>" }; }, async words() { throw new Error("fixture not expected"); }, async fileWords(up, options) { state.acquisitions++; assert.equal(options.engine, "local"); return { ok: true, text: "SPEAKER 1: " + ARTICLE, speakers: ["SPEAKER 1"], source: { kind: "audio-transcription", engine: "local", file: { name: up.name, bytes: up.bytes, sha256: up.sha256, format: up.format } } }; } };
  const app = createApp({ dataDir: dir, ai, resolver, localEngine: { installed: () => true, model: "fixture-local", modelCached: () => true }, cloudEngine: { configured: () => true, transcribe() { throw new Error("cloud egress forbidden"); } }, examplesDir: path.join(dir, "none"), envPath: path.join(dir, ".env") });
  await app.ready; await app.bridge.ready;
  t.after(async () => { await Promise.all([...app.bridge.workers.values()]); await fs.rm(dir, { recursive: true, force: true }); });
  return { ...app, dir, state, ai };
}
const proposal = (extra = {}) => ({ input: { kind: "url", url: "https://source.example/record" }, engine: "local", reading_enabled: false, origin: { doc_id: "fixture_doc", snapshot_id: "snap_fixture", revision: "4", origin_sha256: "a".repeat(64), storage: "full origin retained in Nikodemus" }, ...extra });
async function launch(f, extra = {}, request = "op_fixture") { const p = await f.bridge.prepare(proposal(extra)); const row = await f.bridge.start({ plan_id: p.plan_id, plan_sha256: p.plan_sha256, request_id: request }); return { p, row }; }
async function done(f, id) { const work = f.bridge.workers.get(id); if (work) await work; return f.bridge.get(id); }
function uploadRequest(bytes, name = "sample.mp3", sha256 = sha(bytes)) { const r = Readable.from([bytes]); r.query = { name, sha256 }; r.headers = { "content-type": "audio/mpeg", "content-length": String(bytes.length) }; return r; }

test("prepare freezes the proposed metadata without acquisition or paid dispatch", async t => {
  const f = await fixture(t), p = await f.bridge.prepare(proposal({ reading_enabled: true }));
  assert.equal(p.ready, true); assert.equal(p.plan.allowance_usd, .5); assert.equal(p.plan.model.model, RATE.model);
  assert.equal(p.plan_sha256, sha(canonicalize(p.plan))); assert.equal(f.state.calls, 0); assert.equal(f.state.acquisitions, 0);
  assert.equal(p.plan.origin.doc_id, "fixture_doc"); assert.equal(p.plan.max_output_tokens, 8192);
});
test("lost Start reply, duplicate and concurrent Start converge on one persisted job", async t => {
  const f = await fixture(t); let release; f.state.acquire = () => new Promise(r => { release = r; });
  const { p, row } = await launch(f);
  const args = { plan_id: p.plan_id, plan_sha256: p.plan_sha256, request_id: "op_fixture" };
  const again = await Promise.all([f.bridge.start(args), f.bridge.start(args), f.bridge.byRequest("op_fixture")]);
  assert(again.every(r => r.bridge_id === row.bridge_id));
  await assert.rejects(f.bridge.start({ ...args, request_id: "op_other" }), e => e.code === "plan_already_started");
  while (!release) await new Promise(r => setTimeout(r, 5)); release();
  const final = await done(f, row.bridge_id); assert.equal(f.state.acquisitions, 1); assert.equal(final.state, "completed"); assert(final.finished_at);
});
test("transcript-only completes with exact immutable signed export and zero model calls", async t => {
  const f = await fixture(t), { row } = await launch(f), out = await done(f, row.bridge_id);
  assert.equal(out.reading.status, "not_requested"); assert.equal(out.result.reading_count, 0); assert.equal(f.state.calls, 0);
  const bytes = await f.bridge.artifact(row.bridge_id, "deposition.json"), d = JSON.parse(bytes);
  assert.equal(sha(bytes), out.result.deposition.sha256); assert.equal(d.object.id, out.runId); assert(d.payload.transcript.text.includes("public meeting"));
  const pub = JSON.parse(await fs.readFile(path.join(f.dir, "deposition-key.json")));
  const key = crypto.createPublicKey(crypto.createPrivateKey(pub.privateKeyPem));
  assert(crypto.verify(null, Buffer.from(canonicalize(d.payload)), key, Buffer.from(d.signature.value, "base64")));
  assert.deepEqual(await f.bridge.artifact(row.bridge_id, "deposition.json"), bytes);
});
test("request artifact and durable intent precede every paid dispatch; receipts use existing call ids", async t => {
  const f = await fixture(t);
  f.state.before = async () => {
    const [file] = await fs.readdir(path.join(f.bridge.root, "jobs")), r = JSON.parse(await fs.readFile(path.join(f.bridge.root, "jobs", file)));
    const a = r.attempts.at(-1); assert.equal(a.status, "intent"); assert(a.producer_call_id.startsWith("call"));
    const bytes = await fs.readFile(path.join(f.bridge.root, "artifacts", r.bridge_id, a.request.name)); assert.equal(sha(bytes), a.request.sha256);
  };
  const { row } = await launch(f, { reading_enabled: true, allowance_usd: .5 }); const out = await done(f, row.bridge_id);
  assert(f.state.calls > 0); assert.equal(out.attempts.length, f.state.calls); assert(out.attempts.every(a => a.response && a.estimated_cost_usd === .0012));
  assert(out.costs.committed_usd <= .5); assert.equal(f.state.limit, 8192); assert(out.result);
});
test("insufficient allowance preserves source/export and sends no model request", async t => {
  const f = await fixture(t), { row } = await launch(f, { reading_enabled: true, allowance_usd: .001 }); const out = await done(f, row.bridge_id);
  assert.equal(out.state, "partial"); assert.equal(f.state.calls, 0); assert(out.result); assert(out.result.transcript_sha256); assert.equal(out.reading.error.code, "budget");
});
test("unknown paid outcome blocks all subsequent calls and is never replayed by Start", async t => {
  const f = await fixture(t, { mode: "unknown" }), { p, row } = await launch(f, { reading_enabled: true }); const out = await done(f, row.bridge_id);
  assert.equal(out.state, "unknown"); assert.equal(f.state.calls, 1); assert(out.costs.unknown_reserved_usd > 0); assert.equal(out.attempts[0].usage, null);
  assert(out.result); await f.bridge.start({ plan_id: p.plan_id, plan_sha256: p.plan_sha256, request_id: "op_fixture" }); assert.equal(f.state.calls, 1);
});
test("provider model drift is unpriced and holds the workflow", async t => {
  const f = await fixture(t, { mode: "drift" }), { row } = await launch(f, { reading_enabled: true }); const out = await done(f, row.bridge_id);
  assert.equal(out.state, "unknown"); assert.equal(f.state.calls, 1); assert.equal(out.attempts[0].estimated_cost_usd, null);
});
test("truncated responses and billed usage survive bounded corrections", async t => {
  const f = await fixture(t, { mode: "truncated" }), { row } = await launch(f, { reading_enabled: true, max_model_calls: 2 }); const out = await done(f, row.bridge_id);
  assert.equal(f.state.calls, 2); assert.equal(out.state, "partial"); assert(out.attempts.every(a => a.status === "failed" && a.stop_reason === "max_tokens"));
  const receipt = JSON.parse(await f.bridge.artifact(row.bridge_id, out.attempts[0].response.name)); assert.equal(receipt.text, "{partial"); assert.equal(receipt.usage.output_tokens, 100);
});
test("restart marks interrupted without replay and keeps prior signed bytes", async t => {
  const f = await fixture(t), { row } = await launch(f, { reading_enabled: true }), out = await done(f, row.bridge_id), bytes = await f.bridge.artifact(row.bridge_id, "deposition.json");
  const file = path.join(f.bridge.root, "jobs", row.bridge_id + ".json"), saved = JSON.parse(await fs.readFile(file)); saved.state = "reading"; delete saved.finished_at; await fs.writeFile(file, JSON.stringify(saved));
  const recovered = createBridge({ store: f.store, jobs: f.jobs, resolver: f.resolver, engines: f.engines, getAI: () => { throw new Error("recovery called model config"); }, consumeTranscriptJob: () => { throw new Error("recovery consumed"); }, depo: { buildDeposition() { throw new Error("original export must be reused"); } }, ready: Promise.resolve(), htmlToText: () => {} });
  await recovered.ready; const after = await recovered.byRequest("op_fixture"); assert.equal(after.state, "interrupted"); assert.deepEqual(await recovered.artifact(row.bridge_id, "deposition.json"), bytes); assert.deepEqual(after.attempts, out.attempts);
});
test("MP3 bytes are staged free, hash checked against proposal, consumed once, then removed", async t => {
  const f = await fixture(t), bytes = mp3(), input = { kind: "upload", name: "sample.mp3", sha256: sha(bytes), bytes: bytes.length, format: "mp3" };
  const p = await f.bridge.prepare(proposal({ input })); assert.equal(f.state.acquisitions, 0);
  const staged = await f.bridge.upload(uploadRequest(bytes)); assert.equal(staged.upload.id, "u_" + sha(bytes)); assert.equal(f.state.calls, 0); assert.equal(f.state.acquisitions, 0);
  const row = await f.bridge.start({ plan_id: p.plan_id, plan_sha256: p.plan_sha256, request_id: "op_upload", upload_id: staged.upload.id }); const out = await done(f, row.bridge_id);
  assert.equal(out.state, "completed"); assert.equal(f.state.acquisitions, 1); assert(out.result);
  await assert.rejects(fs.access(path.join(f.bridge.root, "uploads", staged.upload.id + ".audio")));
  assert.equal(JSON.parse(await f.bridge.artifact(row.bridge_id, "deposition.json")).payload.claims.run.import.file.sha256, sha(bytes));
});
test("wrong bytes, unsupported format, large descriptor and secret/private source fail before dispatch", async t => {
  const f = await fixture(t);
  await assert.rejects(f.bridge.upload(uploadRequest(mp3(), "sample.mp3", "a".repeat(64))), e => e.code === "upload_changed");
  for (const url of ["https://source.example/?token=secretvalue", "https://user:password@source.example/x", "http://127.0.0.1/x"]) await assert.rejects(f.bridge.prepare(proposal({ input: { kind: "url", url } })));
  await assert.rejects(f.bridge.prepare(proposal({ input: { kind: "upload", name: "x.mp3", sha256: "a".repeat(64), bytes: MAX_UPLOAD + 1, format: "mp3" } })));
  await assert.rejects(f.bridge.prepare(proposal({ engine: "cloud" })), e => e.code === "engine_not_bounded");
  assert.equal(f.state.calls, 0); assert.equal(f.state.acquisitions, 0);
});
test("unsupported model readiness and changed configuration never dispatch", async t => {
  const f = await fixture(t), p = await f.bridge.prepare(proposal({ reading_enabled: true })); f.ai.model = "claude-unpriced";
  await assert.rejects(f.bridge.start({ plan_id: p.plan_id, plan_sha256: p.plan_sha256, request_id: "op_change" }), e => e.code === "model_changed");
  const next = await f.bridge.prepare(proposal({ reading_enabled: true })); assert.equal(next.ready, false); assert(next.blockers.length); assert.equal(f.state.calls, 0);
});
test("known cache categories priced; missing/unknown billed categories remain unknown", () => {
  assert.equal(usageCost({ input_tokens: 100, output_tokens: 100, cache_creation_input_tokens: 100, cache_creation: { ephemeral_5m_input_tokens: 60, ephemeral_1h_input_tokens: 40 }, cache_read_input_tokens: 100 }, RATE), .00152);
  assert.equal(usageCost(null, RATE), null); assert.equal(usageCost({ input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 1 }, RATE), null);
  assert.equal(usageCost({ input_tokens: 1, output_tokens: 1, server_tool_use: { web_search_requests: 1 } }, RATE), null);
});
test("redaction metadata names fields without recording credential values or changing signed signature object", () => {
  const s = sanitize({ Authorization: "Bearer SECRET", list: ["https://example.org/?api_key=private"], signature: { algorithm: "Ed25519", value: "signedbytes" } });
  assert.equal(s.exact, false); assert(!JSON.stringify(s).includes("private")); assert(!JSON.stringify(s).includes("Bearer SECRET")); assert.equal(s.value.signature.value, "signedbytes");
});
test("only the typed Anthropic response thinking signature is exempt from credential field names", () => {
  const signature = Buffer.from("provider output signature fixture").toString("base64");
  const receipt = { provider_response: { type: "message", role: "assistant", content: [{ type: "thinking", thinking: "", signature }] } };
  assert.equal(sanitize(receipt).exact, false, "ordinary input never opts into provider metadata");
  const clean = sanitize(receipt, { anthropicResponse: true });
  assert.equal(clean.exact, true); assert.deepEqual(clean.value, receipt);
  for (const mutate of [x => { x.provider_response.role = "user"; }, x => { x.provider_response.type = "other"; }, x => { x.provider_response.content[0].type = "text"; }, x => { delete x.provider_response.content[0].thinking; }]) {
    const invalid = structuredClone(receipt); mutate(invalid);
    assert.equal(sanitize(invalid, { anthropicResponse: true }).exact, false);
  }
  const adjacent = structuredClone(receipt);
  adjacent.signature = "ordinary secret";
  adjacent.provider_response.content[0].authorization = "Bearer " + "credentialfixture12345678";
  adjacent.provider_response.content[0].nested = { type: "thinking", thinking: "", signature: "nested secret" };
  const redacted = sanitize(adjacent, { anthropicResponse: true });
  assert.equal(redacted.exact, false); assert.equal(redacted.value.provider_response.content[0].signature, signature);
  assert.equal(redacted.redactions.length, 3); assert(!JSON.stringify(redacted).includes("secret")); assert(!JSON.stringify(redacted).includes("credentialfixture"));
});
test("typed thinking responses pass capture and the normal review pipeline with exact retained signatures", async t => {
  const f = await fixture(t, { mode: "thinking" }), { row } = await launch(f, { reading_enabled: true });
  const out = await done(f, row.bridge_id);
  assert.equal(out.state, "completed"); assert.equal(out.reading.status, "complete"); assert(out.result.reading_count > 0);
  assert(out.attempts.some(a => a.purpose === "deflate_review"));
  for (const attempt of out.attempts) {
    assert.equal(attempt.response.exact, true); assert.deepEqual(attempt.response.redactions, []);
    const receipt = JSON.parse(await f.bridge.artifact(row.bridge_id, attempt.response.name));
    assert.equal(receipt.provider_response.content[0].signature, Buffer.from("provider output signature fixture").toString("base64"));
  }
});
test("credential-shaped thinking signature values still redact and hold without another paid request", async t => {
  const f = await fixture(t, { mode: "thinking-secret" }), { row } = await launch(f, { reading_enabled: true });
  const out = await done(f, row.bridge_id);
  assert.equal(out.state, "partial"); assert.equal(out.reading.error.code, "sensitive_response"); assert.equal(f.state.calls, 1);
  const attempt = out.attempts[0]; assert.equal(attempt.response.exact, false);
  assert.deepEqual(attempt.response.redactions, [{ path: "$.provider_response.content[0].signature", kind: "credential_pattern" }]);
  const receipt = JSON.parse(await f.bridge.artifact(row.bridge_id, attempt.response.name));
  assert.equal(receipt.provider_response.content[0].signature, "[redacted]"); assert.equal(receipt.usage.output_tokens, 100);
});
test("bounded real SDK disables hidden network retries and uses frozen output limit", async () => {
  let sends = 0, body;
  const ai = createAnthropicAI({ apiKey: "fixture-key-" + "never-sent", model: RATE.model, baseURL: "https://api.anthropic.com", fetch: async (_url, options) => {
    sends++; body = JSON.parse(options.body);
    return new Response(JSON.stringify({ error: { type: "overloaded_error", message: "fixture unavailable" } }), { status: 503, headers: { "content-type": "application/json" } });
  } }).withLimits({ maxOutputTokens: 2048 });
  await assert.rejects(ai.sample({ prompt: "fixture prompt", json: true }), e => e.code === "upstream_error");
  assert.equal(sends, 1); assert.equal(body.max_tokens, 2048); assert.deepEqual(body, ai.requestFor({ prompt: "fixture prompt" }));
});
test("a failed request artifact prevents dispatch; a failed response capture blocks subsequent calls", async t => {
  const f = await fixture(t), realOpen = fs.open; let phase = "request";
  fs.open = async function(file, ...args) { if (typeof file === "string" && file.includes(".request.json.") && phase === "request" || typeof file === "string" && file.includes(".response.json.") && phase === "response") throw Object.assign(new Error("fixture disk failure"), { code: "EIO" }); return realOpen.call(this, file, ...args); };
  try {
    let { row } = await launch(f, { reading_enabled: true }, "op_no_request"); let out = await done(f, row.bridge_id); assert.equal(f.state.calls, 0); assert.equal(out.state, "partial");
    phase = "response";
    ({ row } = await launch(f, { reading_enabled: true }, "op_lost_response")); out = await done(f, row.bridge_id);
    assert.equal(f.state.calls, 1); assert.equal(out.state, "unknown"); assert.equal(out.attempts[0].status, "intent"); assert(out.costs.unknown_reserved_usd > 0);
  } finally { fs.open = realOpen; }
});
test("hidden source form controls are explicitly omitted in capture, without exporting their values", () => {
  const s = sanitize({ html: '<form><input type="hidden" name="__VIEWSTATE" value="secret>CONTROL"><p>Visible record</p></form>' });
  assert.equal(s.exact, false); assert(!s.value.html.includes("CONTROL")); assert(s.value.html.includes("Visible record")); assert.equal(s.redactions[0].kind, "hidden_form_control");
});
test("terminal status is published only after the signed artifact and result reference are durable", async t => {
  const f = await fixture(t); let release, exporting;
  const reached = new Promise(r => { exporting = r; });
  const bridge = createBridge({ store: f.store, jobs: f.jobs, resolver: f.resolver, engines: f.engines, getAI: () => f.ai, ready: f.ready,
    consumeTranscriptJob: async id => { const job = await f.jobs.get(id), rid = "r_" + id; await f.store.createRun({ parseMode: "article" }, job.result.text, rid); await f.jobs.acknowledge(id, rid); return rid; },
    depo: { async buildDeposition(b) { exporting(); await new Promise(r => { release = r; }); return { object: { id: b.run.id }, payload: { text: b.transcript }, signature: { algorithm: "fixture", value: "fixture-only" } }; } },
    htmlToText: () => ({ text: ARTICLE, title: "Fixture" }) });
  await bridge.ready; const p = await bridge.prepare(proposal()); const row = await bridge.start({ plan_id: p.plan_id, plan_sha256: p.plan_sha256, request_id: "op_export_fence" });
  await reached; const pending = await bridge.get(row.bridge_id); assert.equal(pending.state, "exporting"); assert.equal(pending.result, null); assert.equal(pending.finished_at, undefined);
  release(); await bridge.workers.get(row.bridge_id); const out = await bridge.get(row.bridge_id); assert.equal(out.state, "completed"); assert(out.result.deposition.sha256); assert(out.finished_at);
  await fs.appendFile(path.join(bridge.root, "artifacts", row.bridge_id, "deposition.json"), "changed");
  await assert.rejects(bridge.artifact(row.bridge_id, "deposition.json"), e => e.code === "artifact_changed");
});
test("access-restricted acquisition retains typed failure, tries, and original URL without reading", async t => {
  const f = await fixture(t, { resolver: { async locate() { return { kind: "video" }; }, async words() { return { ok: false, code: "youtube_access_blocked", reason: "Source requires an access check", tried: [{ step: "captions", code: "youtube_access_blocked" }] }; } } });
  const { row } = await launch(f, { reading_enabled: true }); const out = await done(f, row.bridge_id);
  assert.equal(out.state, "failed"); assert.equal(f.state.calls, 0); assert.equal(out.plan.input.url, "https://source.example/record");
  const capture = JSON.parse(await f.bridge.artifact(row.bridge_id, "acquisition.json")); assert.equal(capture.result.code, "youtube_access_blocked"); assert.equal(capture.result.tried[0].code, "youtube_access_blocked");
});
test("bridge HTTP routes reject cross-origin paid and upload requests; GET artifacts retain exact bytes", async t => {
  const f = await fixture(t), server = f.app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  t.after(() => new Promise(r => server.close(r)));
  const base = "http://127.0.0.1:" + server.address().port;
  for (const endpoint of ["prepare", "start", "uploads"]) {
    const res = await fetch(base + "/api/bridge/" + endpoint, { method: "POST", headers: { Origin: "https://unrelated.example", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(res.status, 403);
  }
  const { row } = await launch(f); const out = await done(f, row.bridge_id);
  const res = await fetch(base + out.result.deposition.path); assert.equal(res.status, 200); const bytes = Buffer.from(await res.arrayBuffer()); assert.equal(sha(bytes), out.result.deposition.sha256);
  const stat = await (await fetch(base + "/api/bridge/requests/op_fixture")).json(); assert.equal(stat.bridge_id, row.bridge_id); assert.equal(f.state.calls, 0);
});
test("signed exports include ready reading prose with attribution; held and withheld wording stays excluded", async t => {
  const f = await fixture(t), { row } = await launch(f, { reading_enabled: true }), out = await done(f, row.bridge_id);
  const bytes = await f.bridge.artifact(row.bridge_id, "deposition.json"), exported = JSON.parse(bytes).payload.claims, ready = exported.passages.find(p => p.readingGate.status === "ready");
  assert(ready && ready.reading.deflated.hs); assert(ready.reading.contract); assert(ready.reading.model); assert(ready.reading.analyzedBy);
  const b = await f.store.bundle(out.runId), p = b.passages.find(x => x.id === ready.id);
  assert.equal(ready.reading.deflated.hs, p.analysis.deflated.hs);
  p.analysis.levels = { hs: "ready", g5: "withheld" }; p.analysis.deflated.g5 = "WITHHELD_WORDING";
  let draft = buildExport(b).passages.find(x => x.id === p.id); assert.equal(draft.reading.levels.g5, "withheld"); assert.equal(draft.reading.deflated.g5, undefined);
  p.readingGate = { status: "held", reasons: ["fixture hold"] }; draft = buildExport(b).passages.find(x => x.id === p.id); assert.equal(draft.reading, undefined);
  assert.deepEqual(await f.bridge.artifact(row.bridge_id, "deposition.json"), bytes, "new projections never rewrite an earlier signed envelope");
});
