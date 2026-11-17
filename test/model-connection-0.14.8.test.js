"use strict";
/* 0.14.8: the connection to another model service, repaired after the review of 0.14.7.
   - A saved service key belongs to the address it was saved for: it is never sent to a different address (for a reading
     or for the list of models), a same-address change keeps it, a new key replaces it, and it can be removed on purpose.
   - A key failure, or a service not fully set up, is recovered for the provider chosen: another service's own key or its
     settings, never the Anthropic key; the reading resumes after the save. Claude keeps its own key prompt.
   - The reply-length limit is sent as each service names it: max_completion_tokens to OpenAI's own API, max_tokens to
     the other compatible services; no retry on errors.
   - Small edges: an address with a ?query or #part is refused; a key with "#" survives a restart; a key the service
     repeats in its error never reaches the page or the record; every call record names the service host.
   Real HTTP between the app and stand-in services on this computer; fake keys only; no real provider is called. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const dotenv = require("dotenv");
const { createApp } = require("../server/app");
const { createAI, createMockAI, createOpenAICompatibleAI, createAnthropicAI, serviceAddress, keyFor } = require("../server/ai");
const { createResearch } = require("../server/research");
const { createSettings } = require("../server/settings");
const { page, visible, el } = require("./page-harness");

const ENV_KEYS = ["ANTHROPIC_MODEL", "MODEL_PROVIDER", "OPENAI_BASE_URL", "OPENAI_API_KEY", "OPENAI_API_KEY_FOR", "OPENAI_MODEL", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"];
function keepEnv(t) { const was = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]])); t.after(() => { for (const k of ENV_KEYS) { if (was[k] === undefined) delete process.env[k]; else process.env[k] = was[k]; } }); for (const k of ENV_KEYS) delete process.env[k]; }

/* A model service on this computer that speaks the OpenAI-compatible chat API and answers through the mock responder.
   `opts.accept(auth)` decides whether a key is accepted (401 otherwise); `opts.contract(body)` returns a refusal text for a
   request it does not take; `opts.host` "localhost" gives an Ollama-like address. Every request is kept in `seen`. */
async function service(t, opts = {}) {
  const seen = [], mock = createMockAI();
  const srv = http.createServer((req, res) => { let raw = ""; req.on("data", c => { raw += c; }); req.on("end", async () => {
    const auth = req.headers.authorization || "", body = raw ? JSON.parse(raw) : null;
    seen.push({ path: req.url, auth, body });
    res.setHeader("content-type", "application/json");
    const send = (status, obj) => { res.statusCode = status; res.end(JSON.stringify(obj)); };
    if (opts.accept && !opts.accept(auth)) return send(401, { error: { message: opts.echo ? "Incorrect API key provided: " + auth.replace(/^Bearer /, "") : "Incorrect API key provided." } });
    if (req.url.endsWith("/models")) return send(200, { data: [{ id: "m1" }, { id: "m2" }] });
    const refusal = opts.contract && opts.contract(body); if (refusal) return send(400, { error: { message: refusal } });
    const out = await mock.sample({ prompt: body.messages[0].content, json: true });
    send(200, { id: "chatcmpl-local", model: body.model, choices: [{ message: { role: "assistant", content: JSON.stringify(out.data) }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 20 } });
  }); });
  await new Promise(r => srv.listen(0, "127.0.0.1", r)); t.after(() => new Promise(r => srv.close(r)));
  return { url: "http://" + (opts.host || "127.0.0.1") + ":" + srv.address().port + "/v1", seen, host: (opts.host || "127.0.0.1") + ":" + srv.address().port };
}
async function fixture(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-148-"));
  const system = createApp(Object.assign({ dataDir: dir, ai: null, research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), examplesDir: dir, envPath: path.join(dir, ".env") }, extra));
  await system.ready;
  const server = await new Promise(r => { const s = system.app.listen(0, "127.0.0.1", () => r(s)); });
  const url = "http://127.0.0.1:" + server.address().port;
  const api = async (method, endpoint, body) => { const res = await fetch(url + endpoint, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, data: res.headers.get("content-type").includes("json") ? await res.json() : await res.text() }; };
  t.after(async () => { for (const job of system.reader.jobs.values()) job.controller.abort(); await Promise.all([...system.reader.jobs.values()].map(j => j.done)); await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const finish = async id => { for (let i = 0; i < 400; i++) { const job = system.reader.jobs.get(id); if (job) { await job.done; continue; } return system.store.bundle(id); } };
  const envText = () => fs.existsSync(path.join(dir, ".env")) ? fs.readFileSync(path.join(dir, ".env"), "utf8") : "";
  return { ...system, api, dir, finish, envText, envParsed: () => dotenv.parse(envText()) };
}
const TEXT = Array.from({ length: 18 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": We are discussing an argument with enough quoted words to test the reading " + i + ".").join("\n");
const calls = (dir, id) => fs.readFileSync(path.join(dir, "runs", id, "calls.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
const chat = s => s.seen.filter(x => x.path.endsWith("/chat/completions"));
const choose = (f, baseUrl, extra) => f.api("PUT", "/api/settings/model", Object.assign({ provider: "openai-compatible", baseUrl, model: "m1" }, extra));

test("a saved key belongs to its address: a new address with an empty key sends none (Ollama-like included), the same address keeps it, a new key replaces it; listing follows the same rule; no key comes back", async t => {
  keepEnv(t);
  const A = await service(t), B = await service(t), O = await service(t, { host: "localhost" }), f = await fixture(t);
  // the reviewer's sequence: A with its key; B listed with no key; B chosen with an empty key; then a request
  const first = await choose(f, A.url, { apiKey: "FAKE_KEY_FOR_SERVICE_A" });
  assert.equal(first.status, 200);
  await f.api("POST", "/api/sample", { prompt: "hello", json: true });
  assert.equal(chat(A).at(-1).auth, "Bearer FAKE_KEY_FOR_SERVICE_A");
  let r = await f.api("POST", "/api/settings/model/list", { baseUrl: B.url });
  assert.equal(r.status, 200); assert.equal(B.seen.at(-1).auth, "");
  r = await choose(f, B.url, { apiKey: "" });
  assert.equal(r.status, 200);
  await f.api("POST", "/api/sample", { prompt: "hello", json: true });
  assert.ok(B.seen.length >= 2 && B.seen.every(s => s.auth === ""), "B never receives the key saved for A: " + JSON.stringify(B.seen.map(s => s.auth)));
  // what the answers say: the key was saved with its address, and removed when the address changed
  assert.equal(first.data.key, "new"); assert.equal(first.data.models.other.keySet, true);
  assert.equal(r.data.key, "dropped"); assert.equal(r.data.keyWasFor, A.host); assert.equal(r.data.models.other.keySet, false);
  assert.equal(f.envParsed().OPENAI_API_KEY, ""); assert.equal(f.envParsed().OPENAI_API_KEY_FOR, "");
  // ... and after a restart, from .env as written: still none for B
  const restarted = createAI(f.envParsed()); assert.equal(restarted.host, B.host);
  await restarted.sample({ prompt: "hello", json: true }); assert.equal(chat(B).at(-1).auth, "");
  // back to A with its key, then a model-only change on the same address keeps it
  await choose(f, A.url, { apiKey: "FAKE_KEY_FOR_SERVICE_A" });
  r = await choose(f, A.url + "/", { apiKey: "", model: "m2" });
  assert.equal(r.data.key, "kept"); assert.equal(r.data.models.other.keySet, true);
  await f.api("POST", "/api/sample", { prompt: "hello", json: true });
  assert.equal(chat(A).at(-1).auth, "Bearer FAKE_KEY_FOR_SERVICE_A"); assert.equal(chat(A).at(-1).body.model, "m2");
  // the list for A without typing the key uses A's key; for B it does not
  await f.api("POST", "/api/settings/model/list", { baseUrl: A.url }); assert.equal(A.seen.at(-1).auth, "Bearer FAKE_KEY_FOR_SERVICE_A");
  await f.api("POST", "/api/settings/model/list", { baseUrl: B.url }); assert.equal(B.seen.at(-1).auth, "");
  // an Ollama-like service on this computer with an empty key: none sent
  r = await choose(f, O.url, { apiKey: "" });
  assert.equal(r.data.key, "dropped"); assert.equal(r.data.ai.host, O.host);
  await f.api("POST", "/api/sample", { prompt: "hello", json: true });
  assert.ok(O.seen.length && O.seen.every(s => s.auth === ""));
  // B with its own key: B's key, and a whole reading through B uses it on every call
  r = await choose(f, B.url, { apiKey: "FAKE_KEY_FOR_SERVICE_B" });
  assert.equal(r.data.key, "new");
  B.seen.length = 0; A.seen.length = 0;
  const run = await f.api("POST", "/api/intake", { input: TEXT }), b = await f.finish(run.data.run.id);
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  assert.ok(chat(B).length > 2 && chat(B).every(s => s.auth === "Bearer FAKE_KEY_FOR_SERVICE_B")); assert.equal(A.seen.length, 0);
  const c = calls(f.dir, b.run.id); assert.ok(c.every(x => x.provider === "openai-compatible" && x.providerHost === B.host));
  // no key in any answer, record or status
  const health = (await f.api("GET", "/api/health")).data;
  for (const text of [JSON.stringify(health), JSON.stringify(r.data), fs.readFileSync(path.join(f.dir, "runs", b.run.id, "calls.jsonl"), "utf8"), JSON.stringify(b)]) assert.ok(!/FAKE_KEY_FOR_SERVICE/.test(text));
  assert.equal(fs.statSync(path.join(f.dir, ".env")).mode & 0o777, 0o600);
});

test("removing the saved key on purpose: from the service fields (clearKey) or Controls' own button; the provider stays as chosen; a new key and a removal together are refused with nothing written", async t => {
  keepEnv(t);
  const A = await service(t), f = await fixture(t);
  await choose(f, A.url, { apiKey: "FAKE_KEY_FOR_SERVICE_A" });
  const before = f.envText();
  assert.equal((await choose(f, A.url, { apiKey: "FAKE_KEY_FOR_SERVICE_A2", clearKey: true })).status, 400);
  assert.equal(f.envText(), before, "nothing written");
  let r = await choose(f, A.url, { clearKey: true });
  assert.equal(r.data.key, "removed"); assert.equal(r.data.models.other.keySet, false);
  await f.api("POST", "/api/sample", { prompt: "hello", json: true }); assert.equal(chat(A).at(-1).auth, "");
  // Controls' button: with Claude chosen, removing the other service's key leaves Claude chosen
  await choose(f, A.url, { apiKey: "FAKE_KEY_FOR_SERVICE_A" });
  await f.api("PUT", "/api/settings/model", { provider: "anthropic", model: "claude-sonnet-5-5" });
  r = await f.api("DELETE", "/api/settings/model/key");
  assert.equal(r.status, 200); assert.equal(r.data.key, "removed"); assert.equal(r.data.models.provider, "anthropic"); assert.equal(f.envParsed().MODEL_PROVIDER, "anthropic");
  assert.equal(f.envParsed().OPENAI_API_KEY, ""); assert.equal(f.envParsed().OPENAI_BASE_URL, A.url, "the rest of the connection is kept");
  // the address record cannot be set by itself through the generic settings route
  assert.equal((await f.api("POST", "/api/settings/key", { name: "OPENAI_API_KEY_FOR", key: A.url })).status, 400);
});

test("a key saved before 0.14.8 (no address recorded) stays with the address it was saved beside; a hand-edited address does not inherit a key recorded for another", () => {
  const A = "https://a.example/v1", B = "https://b.example/v1";
  assert.equal(keyFor({ OPENAI_API_KEY: "FAKE_OLD_KEY_A", OPENAI_BASE_URL: A }, A), "FAKE_OLD_KEY_A");
  assert.equal(keyFor({ OPENAI_API_KEY: "FAKE_OLD_KEY_A", OPENAI_BASE_URL: A }, B), "");
  assert.equal(keyFor({ OPENAI_API_KEY: "FAKE_OLD_KEY_A", OPENAI_API_KEY_FOR: A, OPENAI_BASE_URL: B }, B), "");
  assert.equal(keyFor({ OPENAI_API_KEY: "FAKE_OLD_KEY_A", OPENAI_API_KEY_FOR: "not an address", OPENAI_BASE_URL: A }, A), "", "an unusable record sends the key nowhere");
  const ai = createAI({ MODEL_PROVIDER: "openai-compatible", OPENAI_BASE_URL: B, OPENAI_MODEL: "m1", OPENAI_API_KEY: "FAKE_OLD_KEY_A", OPENAI_API_KEY_FOR: A });
  assert.equal(ai.host, "b.example");
});

test("the page: changing the service address and leaving the key empty does not carry the saved key over; the field says so; the next reading sends none", async t => {
  keepEnv(t);
  const A = await service(t), B = await service(t), f = await page(t, { ai: null });
  f.body.append(el("p", "say")); // the page's passing message line
  f.$("controlsBtn").click();
  const fill = (values) => {
    const app = f.$("ctl-app"), inputs = app.querySelectorAll("input"), by = label => inputs.find(i => i.attrs["aria-label"] === label);
    const prov = app.querySelectorAll("select").find(s => s.attrs["aria-label"] === "Who provides the model"); prov.value = "openai-compatible"; prov.listeners.change();
    by("Service address").value = values.address; if (by("Service address").listeners.input) by("Service address").listeners.input();
    by("Service key").value = values.key; by("Model id").value = "m1";
    return { app, key: by("Service key"), use: app.querySelectorAll("button").find(b => b.textContent === "Use this service") };
  };
  let form = fill({ address: A.url, key: "FAKE_KEY_FOR_SERVICE_A" }); await form.use.click();
  assert.equal(f.ctx.page.S.health.models.other.keySet, true);
  form = fill({ address: A.url, key: "" });
  const sameHint = form.key.attrs.placeholder;
  form = fill({ address: B.url, key: "" });
  const otherHint = visible(f.$("ctl-app").querySelector("#svc-key-note"));
  await form.use.click();
  const said = f.$("say").textContent;
  assert.equal(f.ctx.page.S.ai.host, B.host);
  f.$("controlsBtn").click();
  await f.type(TEXT);
  assert.ok(chat(B).length > 2, "the reading went to B"); assert.ok(B.seen.every(s => s.auth === ""), "B never got A's key");
  assert.equal(f.ctx.page.S.b.run.processing.status, "complete");
  assert.ok(!f.requests.some(r => r[0] === "/api/settings/anthropic-key"));
  // what the page said along the way
  assert.match(sameHint, /Key saved — leave empty to keep it/);
  assert.match(otherHint, new RegExp("The saved key belongs to " + A.host.replace(/\./g, "\\.") + " and is not sent to this address"), "the page says the saved key will not go to the new address");
  assert.match(said, /The key saved for 127\.0\.0\.1:\d+ was removed: a key is only sent to the address it was saved for/);
});

test("the page: a key refused by another service is replaced as that service's key (not Anthropic's), its address and model kept, and the reading resumes", async t => {
  keepEnv(t);
  const S = await service(t, { accept: auth => auth === "Bearer FAKE_GOOD_SERVICE_KEY" });
  Object.assign(process.env, { MODEL_PROVIDER: "openai-compatible", OPENAI_BASE_URL: S.url, OPENAI_MODEL: "m1", OPENAI_API_KEY: "FAKE_REFUSED_SERVICE_KEY", OPENAI_API_KEY_FOR: S.url });
  const f = await page(t, { ai: createAI(process.env) });
  await f.type(TEXT);
  const status = f.$("reading-status");
  assert.equal(f.ctx.page.S.b.run.processing.error.code, "bad_key");
  const said = visible(status);
  const replace = status.querySelectorAll("button").find(b => /^Replace the (service|model) key$/.test(b.textContent));
  assert.ok(replace, said); await replace.click();
  const box = status.querySelector(".keybox"), input = box.querySelector("input");
  assert.equal(input.attrs["aria-label"], "Key for " + S.host, "the key asked for is the service's, not Anthropic's");
  assert.match(said, /did not accept its key/); assert.equal(replace.textContent, "Replace the service key");
  assert.doesNotMatch(visible(box), /Anthropic/); assert.match(visible(box), new RegExp("Readings use m1 through " + S.host.replace(/\./g, "\\.")));
  input.value = "FAKE_GOOD_SERVICE_KEY";
  await box.querySelectorAll("button").find(b => b.textContent === "Save key and continue").click();
  await f.pump(() => f.ctx.page.S.b.run.processing.status === "complete");
  assert.equal(f.ctx.page.S.b.run.processing.status, "complete", JSON.stringify(f.ctx.page.S.b.run.processing));
  assert.ok(!f.requests.some(r => r[0] === "/api/settings/anthropic-key"), "no Anthropic key was asked for or saved");
  const h = f.ctx.page.S.health.models; assert.equal(h.provider, "openai-compatible"); assert.equal(h.other.baseUrl, S.url); assert.equal(h.other.model, "m1");
  assert.equal(chat(S).at(-1).auth, "Bearer FAKE_GOOD_SERVICE_KEY");
});

test("the page: a refused Claude key still asks for the Anthropic key", async t => {
  keepEnv(t);
  const refused = { kind: "anthropic", model: "claude-sonnet-5-5", mock: false, async sample() { throw Object.assign(new Error("invalid x-api-key"), { code: "bad_key", status: 401 }); } };
  const f = await page(t, { ai: refused });
  await f.type(TEXT);
  const status = f.$("reading-status");
  await status.querySelectorAll("button").find(b => b.textContent === "Replace the model key").click();
  const box = status.querySelector(".keybox");
  assert.equal(box.querySelector("input").attrs["aria-label"], "Anthropic API key"); assert.match(visible(box), /Anthropic API key/);
});

test("the page and server: another service chosen but not set up points to that service's settings, not to an Anthropic key; saving them resumes the reading", async t => {
  keepEnv(t);
  const S = await service(t);
  process.env.MODEL_PROVIDER = "openai-compatible";
  const f = await page(t, { ai: null });
  await f.type(TEXT);
  const status = f.$("reading-status");
  assert.equal(f.ctx.page.S.b.run.processing.status, "awaiting_key");
  assert.match(visible(status), /Finish setting up the model service chosen under Controls/);
  assert.doesNotMatch(visible(status), /Anthropic/);
  const box = status.querySelector(".keybox"); assert.ok(box); assert.equal(box.querySelectorAll("input").length, 0);
  await box.querySelectorAll("button").find(b => b.textContent === "Open the model settings").click();
  assert.equal(f.$("controls").hidden, false);
  const app = f.$("ctl-app"), inputs = app.querySelectorAll("input"), by = label => inputs.find(i => i.attrs["aria-label"] === label);
  by("Service address").value = S.url; by("Model id").value = "m1";
  await app.querySelectorAll("button").find(b => b.textContent === "Use this service").click();
  await f.pump(() => f.ctx.page.S.b.run.processing.status === "complete");
  assert.equal(f.ctx.page.S.b.run.processing.status, "complete", JSON.stringify(f.ctx.page.S.b.run.processing));
  assert.ok(chat(S).length > 2); assert.ok(!f.requests.some(r => r[0] === "/api/settings/anthropic-key"));
});

test("the server's no-model answer names what the chosen provider needs", async t => {
  keepEnv(t);
  const f = await fixture(t);
  process.env.MODEL_PROVIDER = "openai-compatible";
  let r = await f.api("POST", "/api/sample", { prompt: "hello" });
  assert.equal(r.status, 503); assert.equal(r.data.code, "no_ai"); assert.match(r.data.error, /model service chosen under Controls/); assert.doesNotMatch(r.data.error, /Anthropic/);
  process.env.MODEL_PROVIDER = "anthropic";
  r = await f.api("POST", "/api/sample", { prompt: "hello" });
  assert.match(r.data.error, /Anthropic API key/);
});

test("the reply-length limit as each service names it: max_completion_tokens to OpenAI's own API, max_tokens elsewhere; a whole reading under each contract; a refusal is one request, recorded, not retried", async t => {
  keepEnv(t);
  // OpenAI's documented rule for its reasoning models, as a contract: max_tokens refused, max_completion_tokens taken
  const openaiRule = body => ("max_tokens" in body) ? "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." : !("max_completion_tokens" in body) ? "max_completion_tokens required by this contract" : "";
  const mock = createMockAI(), seen = [];
  const openaiFetch = async (url, init) => {
    const body = JSON.parse(init.body); seen.push({ url, body });
    const refusal = openaiRule(body); if (refusal) return new Response(JSON.stringify({ error: { message: refusal } }), { status: 400 });
    const out = await mock.sample({ prompt: body.messages[0].content, json: true });
    return new Response(JSON.stringify({ id: "chatcmpl-o", model: body.model, choices: [{ message: { content: JSON.stringify(out.data) }, finish_reason: "stop" }] }), { status: 200 });
  };
  const o3 = createOpenAICompatibleAI({ baseUrl: "https://api.openai.com/v1", apiKey: "FAKE_OPENAI_KEY", model: "o3", fetch: openaiFetch });
  let f = await fixture(t, { ai: o3 });
  let run = await f.api("POST", "/api/intake", { input: TEXT }), b = await f.finish(run.data.run.id);
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  assert.equal(o3.tokenParam, "max_completion_tokens");
  assert.ok(seen.length > 2 && seen.every(s => s.url === "https://api.openai.com/v1/chat/completions" && s.body.max_completion_tokens === 16000 && !("max_tokens" in s.body)));
  assert.ok(calls(f.dir, b.run.id).every(c => c.providerHost === "api.openai.com"));
  // other compatible services keep max_tokens: a local one that takes only max_tokens, through the app's own setup
  const C = await service(t, { contract: body => ("max_completion_tokens" in body) ? "unknown field max_completion_tokens" : !("max_tokens" in body) ? "max_tokens required" : "" });
  Object.assign(process.env, { MODEL_PROVIDER: "openai-compatible", OPENAI_BASE_URL: C.url, OPENAI_MODEL: "m1" });
  f = await fixture(t, { ai: createAI(process.env) });
  run = await f.api("POST", "/api/intake", { input: TEXT }); b = await f.finish(run.data.run.id);
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  assert.ok(chat(C).length > 2 && chat(C).every(s => s.body.max_tokens === 16000));
  for (const [address, param] of [["https://openrouter.ai/api/v1", "max_tokens"], ["http://localhost:11434/v1", "max_tokens"], ["https://api.groq.com/openai/v1", "max_tokens"], ["https://api.openai.com.example.net/v1", "max_tokens"], ["https://api.openai.com/v1", "max_completion_tokens"]])
    assert.equal(createOpenAICompatibleAI({ baseUrl: address, model: "m" }).tokenParam, param, address);
  // a refusal is not retried with the other name: one request, the error recorded with the call
  let count = 0;
  const strict = createOpenAICompatibleAI({ baseUrl: "https://example.org/v1", model: "m", fetch: async () => { count++; return new Response(JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens'" } }), { status: 400 }); } });
  f = await fixture(t, { ai: strict });
  const r = await f.api("POST", "/api/sample", { prompt: "hello", json: true });
  assert.equal(r.status, 502); assert.equal(count, 1); assert.equal(r.data.provenance.error, "upstream_error"); assert.match(r.data.provenance.errorMessage, /Unsupported parameter/);
});

test("small edges: an address with a ?query or #part is refused before anything is saved or asked (versioned paths kept); a key with # survives a restart; a quote-and-# key is refused unwritten", async t => {
  keepEnv(t);
  for (const u of ["http://localhost:11434/v1?version=1", "https://example.org/v1#x", "https://example.org/v1?", "https://example.org/v1#"]) assert.equal(serviceAddress(u), "", u);
  assert.equal(serviceAddress("https://openrouter.ai/api/v1/"), "https://openrouter.ai/api/v1");
  const A = await service(t), f = await fixture(t);
  assert.equal((await choose(f, A.url + "?version=1", { apiKey: "FAKE_KEY_FOR_SERVICE_A" })).status, 400);
  assert.equal(f.envText(), "", "nothing written");
  assert.equal((await f.api("POST", "/api/settings/model/list", { baseUrl: A.url + "?version=1" })).status, 400);
  assert.equal(A.seen.length, 0, "nothing asked");
  // a key with "#": saved quoted, read back whole after a restart, and sent whole
  assert.equal((await choose(f, A.url, { apiKey: "FAKE_TOKEN#SUFFIX" })).status, 200);
  assert.equal(f.envParsed().OPENAI_API_KEY, "FAKE_TOKEN#SUFFIX");
  const restarted = createAI(f.envParsed()); await restarted.sample({ prompt: "hello", json: true });
  assert.equal(chat(A).at(-1).auth, "Bearer FAKE_TOKEN#SUFFIX");
  // a value .env cannot hold as it is: refused before anything changes
  const before = f.envText();
  const r = await choose(f, A.url, { apiKey: "FAKE'TOKEN#\"SUFFIX" });
  assert.equal(r.status, 400); assert.equal(f.envText(), before);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-148s-")), envPath = path.join(dir, ".env"), s = createSettings({ envPath });
  for (const v of ["FAKE_TOKEN#SUFFIX", "FAKE TOKEN WITH SPACES", "FAKE\"TOKEN", "plainFAKEtoken123"]) { s.set("OPENAI_API_KEY", v.replace(/ /g, "_")); assert.equal(dotenv.parse(fs.readFileSync(envPath, "utf8")).OPENAI_API_KEY, v.replace(/ /g, "_"), v); }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a key the service repeats in its error is taken out before the page or the record sees it (both adapters); /api/sample records the service host", async t => {
  keepEnv(t);
  const A = await service(t, { accept: () => false, echo: true }), f = await fixture(t);
  await choose(f, A.url, { apiKey: "FAKE_ECHOED_SERVICE_KEY" });
  const r = await f.api("POST", "/api/sample", { prompt: "hello", json: true, purpose: "probe" });
  assert.equal(r.status, 401); assert.equal(r.data.code, "bad_key");
  assert.match(r.data.error, /\[the key\]/); assert.doesNotMatch(JSON.stringify(r.data), /FAKE_ECHOED_SERVICE_KEY/);
  assert.equal(r.data.provenance.providerHost, A.host, "the generic call record names the service");
  // Claude's adapter, against a stand-in Anthropic endpoint on this computer that repeats the key
  const echo = http.createServer((req, res) => { res.statusCode = 401; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key: " + req.headers["x-api-key"] } })); });
  await new Promise(r2 => echo.listen(0, "127.0.0.1", r2)); t.after(() => new Promise(r2 => echo.close(r2)));
  process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:" + echo.address().port;
  const claude = createAnthropicAI({ apiKey: "sk-ant-FAKE_ECHOED_ANTHROPIC_KEY_000000", model: "claude-sonnet-5-5" });
  await assert.rejects(claude.sample({ prompt: "hello" }), e => e.code === "bad_key" && !/FAKE_ECHOED_ANTHROPIC_KEY/.test(e.message) && /\[the key\]/.test(e.message));
});
