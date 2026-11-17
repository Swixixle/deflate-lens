"use strict";
/* 0.14.7: which model writes the readings, chosen under Controls → App and files. Claude by default (Sonnet 5.5), any
   listed or typed Claude model, or any service that speaks the OpenAI-compatible chat API (OpenRouter, OpenAI, Groq,
   Together, Ollama on this computer). Saved to .env; keys never come back to the page; a reading already running keeps
   the model it started with; every call record names the provider and model. No real provider is called here: the
   OpenAI-compatible service is a fake that answers through the mock responder. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI, createOpenAICompatibleAI, serviceAddress, DEFAULT_MODEL } = require("../server/ai");
const { createResearch } = require("../server/research");
const { createSettings } = require("../server/settings");
const { page, visible } = require("./page-harness");

const ENV_KEYS = ["ANTHROPIC_MODEL", "MODEL_PROVIDER", "OPENAI_BASE_URL", "OPENAI_API_KEY", "OPENAI_API_KEY_FOR", "OPENAI_MODEL", "ANTHROPIC_API_KEY"];
function keepEnv(t) { const was = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]])); t.after(() => { for (const k of ENV_KEYS) { if (was[k] === undefined) delete process.env[k]; else process.env[k] = was[k]; } }); for (const k of ENV_KEYS) delete process.env[k]; }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
/* A stand-in for Claude that records which model each call went to; withModel gives a new object, as the real one does. */
function claudeLike(model, log, gate) {
  const mock = createMockAI();
  return { kind: "anthropic", model, mock: false, withModel(m) { return claudeLike(m, log, gate); },
    async sample(a) { log.push([model, a.prompt.split("\n")[0].slice(0, 40)]); if (gate && a.prompt.startsWith("Help a reader understand this passage") && !gate.passed) { gate.passed = true; gate.entered.resolve(); await gate.release.promise; } const out = await mock.sample(a); return Object.assign({}, out, { model }); } };
}
/* An OpenAI-compatible service that answers every chat request through the mock responder. */
function fakeService(seen) {
  const mock = createMockAI();
  return async (url, init) => {
    seen.push({ url, method: (init && init.method) || "GET", auth: init && init.headers && init.headers.Authorization || "" });
    if (/\/models$/.test(url)) return new Response(JSON.stringify({ data: [{ id: "openai/gpt-5" }, { id: "anthropic/claude-sonnet-5-5" }, { id: "llama3.1:8b" }, { id: "bad id with spaces" }] }), { status: 200, headers: { "content-type": "application/json" } });
    const body = JSON.parse(init.body), prompt = body.messages[0].content;
    const out = await mock.sample({ prompt, json: true });
    return new Response(JSON.stringify({ id: "chatcmpl-1", model: body.model, choices: [{ message: { role: "assistant", content: JSON.stringify(out.data) }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 20 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
}
async function fixture(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-model-"));
  const system = createApp(Object.assign({ dataDir: dir, ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), examplesDir: dir, envPath: path.join(dir, ".env") }, extra));
  await system.ready;
  const server = await new Promise(r => { const s = system.app.listen(0, "127.0.0.1", () => r(s)); });
  const url = "http://127.0.0.1:" + server.address().port;
  const api = async (method, endpoint, body) => { const res = await fetch(url + endpoint, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, data: res.headers.get("content-type").includes("json") ? await res.json() : await res.text() }; };
  t.after(async () => { for (const job of system.reader.jobs.values()) job.controller.abort(); await Promise.all([...system.reader.jobs.values()].map(j => j.done)); await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const finish = async id => { for (let i = 0; i < 400; i++) { const job = system.reader.jobs.get(id); if (job) { await job.done; continue; } return system.store.bundle(id); } };
  return { ...system, api, dir, finish, env: () => fs.existsSync(path.join(dir, ".env")) ? fs.readFileSync(path.join(dir, ".env"), "utf8") : "" };
}
const TEXT = Array.from({ length: 18 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": We are discussing an argument with enough quoted words to test the reading " + i + ".").join("\n");
const calls = (dir, id) => fs.readFileSync(path.join(dir, "runs", id, "calls.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));

test("Claude: the listed models, Sonnet the default, and any other Claude model by its id; saved to .env and used from the next reading; anything else refused with nothing written", async t => {
  keepEnv(t);
  const log = [], f = await fixture(t, { ai: claudeLike(DEFAULT_MODEL, log) });
  const h = (await f.api("GET", "/api/health")).data;
  assert.equal(h.models.provider, "anthropic"); assert.equal(h.models.claude, "claude-sonnet-5-5"); assert.equal(h.models.default, "claude-sonnet-5-5");
  assert.deepEqual(h.models.choices.map(c => c.id), ["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1"]);
  for (const model of ["claude-opus-5-5", "claude-haiku-4-5-20251001"]) {
    const r = await f.api("PUT", "/api/settings/model", { provider: "anthropic", model });
    assert.equal(r.status, 200); assert.equal(r.data.ai.model, model); assert.equal(r.data.models.claude, model);
    assert.match(f.env(), new RegExp("^ANTHROPIC_MODEL=" + model + "$", "m")); assert.match(f.env(), /^MODEL_PROVIDER=anthropic$/m);
  }
  const before = f.env();
  for (const model of ["gpt-5", "", "claude-", "claude-opus 5"]) assert.equal((await f.api("PUT", "/api/settings/model", { provider: "anthropic", model })).status, 400, model);
  assert.equal(f.env(), before, "nothing written for a refused choice");
  // the generic settings route cannot set them piecemeal
  assert.equal((await f.api("POST", "/api/settings/key", { name: "ANTHROPIC_MODEL", key: "claude-opus-5-5" })).status, 400);
  // the next reading is written by the chosen model, and its call records say so
  const r = await f.api("POST", "/api/intake", { input: TEXT }), b = await f.finish(r.data.run.id);
  assert.equal(b.run.processing.status, "complete");
  assert.ok(calls(f.dir, b.run.id).every(c => c.modelRequested === "claude-haiku-4-5-20251001" && c.provider === "anthropic"));
  assert.ok(b.passages.every(p => p.analyzedBy === "claude-haiku-4-5-20251001"));
});

test("a reading already running finishes with the model it started with; the next one uses the new choice", async t => {
  keepEnv(t);
  const log = [], gate = { entered: deferred(), release: deferred() };
  const f = await fixture(t, { ai: claudeLike(DEFAULT_MODEL, log, gate) });
  const r = await f.api("POST", "/api/intake", { input: TEXT }), id = r.data.run.id;
  await gate.entered.promise;
  assert.equal((await f.api("PUT", "/api/settings/model", { provider: "anthropic", model: "claude-opus-5-5" })).status, 200);
  gate.release.resolve();
  const b = await f.finish(id);
  assert.equal(b.run.processing.status, "complete");
  assert.ok(calls(f.dir, id).every(c => c.modelRequested === "claude-sonnet-5-5"), "every call of the running reading on Sonnet");
  const r2 = await f.api("POST", "/api/intake", { input: TEXT.replace(/argument/g, "case") }), b2 = await f.finish(r2.data.run.id);
  assert.ok(calls(f.dir, b2.run.id).every(c => c.modelRequested === "claude-opus-5-5"), "the next reading on Opus");
});

test("another service (OpenAI-compatible): address, key and model saved, the key never returned; its models listed; a whole reading made through it, the call records naming the service", async t => {
  keepEnv(t);
  const seen = [], f = await fixture(t, { ai: null, modelFetch: fakeService(seen) });
  // its models, for the list (the key sent to the service, never back)
  let r = await f.api("POST", "/api/settings/model/list", { baseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-or-v1-abcdefghijklmnop" });
  assert.equal(r.status, 200); assert.deepEqual(r.data.models, ["anthropic/claude-sonnet-5-5", "llama3.1:8b", "openai/gpt-5"]);
  assert.equal(seen[0].auth, "Bearer sk-or-v1-abcdefghijklmnop"); assert.ok(!JSON.stringify(r.data).includes("abcdefgh"));
  // saved
  r = await f.api("PUT", "/api/settings/model", { provider: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1/", apiKey: "sk-or-v1-abcdefghijklmnop", model: "openai/gpt-5" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.ai, { kind: "openai-compatible", model: "openai/gpt-5", mock: false, host: "openrouter.ai" });
  assert.deepEqual(r.data.models.other, { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-5", keySet: true });
  assert.ok(!JSON.stringify(r.data).includes("abcdefgh"), "the key never comes back");
  assert.match(f.env(), /^MODEL_PROVIDER=openai-compatible$/m); assert.match(f.env(), /^OPENAI_API_KEY=sk-or-v1-abcdefghijklmnop$/m);
  assert.equal(fs.statSync(path.join(f.dir, ".env")).mode & 0o777, 0o600);
  // the saved key is used to list the saved service's models again without retyping it
  seen.length = 0; r = await f.api("POST", "/api/settings/model/list", { baseUrl: "https://openrouter.ai/api/v1" });
  assert.equal(seen[0].auth, "Bearer sk-or-v1-abcdefghijklmnop");
  // a whole reading through it
  seen.length = 0;
  r = await f.api("POST", "/api/intake", { input: TEXT });
  const b = await f.finish(r.data.run.id);
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  assert.ok(seen.length && seen.every(s => s.url === "https://openrouter.ai/api/v1/chat/completions" && s.auth === "Bearer sk-or-v1-abcdefghijklmnop"));
  const c = calls(f.dir, b.run.id);
  assert.ok(c.length && c.every(x => x.provider === "openai-compatible" && x.providerHost === "openrouter.ai" && x.modelRequested === "openai/gpt-5"));
  assert.ok(!fs.readFileSync(path.join(f.dir, "runs", b.run.id, "calls.jsonl"), "utf8").includes("abcdefgh"), "no key in the call records");
  // Ollama on this computer: plain http allowed only there; no key needed (the saved one removed)
  r = await f.api("PUT", "/api/settings/model", { provider: "openai-compatible", baseUrl: "http://localhost:11434/v1", model: "llama3.1:8b", clearKey: true });
  assert.equal(r.status, 200); assert.equal(r.data.ai.host, "localhost:11434"); assert.equal(r.data.models.other.keySet, false);
  for (const baseUrl of ["http://example.com/v1", "https://user:pass@example.com/v1", "file:///etc/passwd", ""]) assert.equal((await f.api("PUT", "/api/settings/model", { provider: "openai-compatible", baseUrl, model: "x" })).status, 400, baseUrl);
  // back to Claude: a key for Anthropic is still needed, so with none set there is no model until one is added
  r = await f.api("PUT", "/api/settings/model", { provider: "anthropic", model: "claude-sonnet-5-5" });
  assert.equal(r.status, 200); assert.equal(r.data.ai, null); assert.equal(r.data.models.provider, "anthropic");
});

test("the adapter reads an OpenAI-compatible answer as the app needs: JSON loosely, a cut-off answer as truncated, a refused key as bad_key, a picture as an image part", async () => {
  const reply = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  let ai = createOpenAICompatibleAI({ baseUrl: "https://example.org/v1", apiKey: "", model: "m", fetch: reply(200, { id: "x", choices: [{ message: { content: "```json\n{\"a\":1}\n```" }, finish_reason: "stop" }] }) });
  assert.deepEqual((await ai.sample({ prompt: "p", json: true })).data, { a: 1 });
  ai = createOpenAICompatibleAI({ baseUrl: "https://example.org/v1", model: "m", fetch: reply(200, { choices: [{ message: { content: "{\"a\":" }, finish_reason: "length" }] }) });
  await assert.rejects(ai.sample({ prompt: "p", json: true }), e => e.code === "truncated");
  ai = createOpenAICompatibleAI({ baseUrl: "https://example.org/v1", model: "m", fetch: reply(401, { error: { message: "Invalid key" } }) });
  await assert.rejects(ai.sample({ prompt: "p", json: true }), e => e.code === "bad_key");
  let sent = null;
  ai = createOpenAICompatibleAI({ baseUrl: "https://example.org/v1", model: "m", fetch: async (u, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }), { status: 200 }); } });
  await ai.sample({ prompt: "read this", images: [{ mediaType: "image/png", data: "AAAA" }] });
  assert.deepEqual(sent.messages[0].content, [{ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }, { type: "text", text: "read this" }]);
  assert.equal(ai.withModel("n").model, "n"); assert.equal(ai.model, "m", "withModel gives a new object");
  assert.equal(serviceAddress("http://127.0.0.1:11434/v1/"), "http://127.0.0.1:11434/v1");
});

test("settings: the model settings are a closed list, checked before anything is written; a key is a secret", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-set-")), envPath = path.join(dir, ".env");
  const s = createSettings({ envPath });
  assert.equal(s.set("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001").value, "claude-haiku-4-5-20251001");
  assert.throws(() => s.set("ANTHROPIC_MODEL", "gpt-5"), /Claude model id/);
  assert.throws(() => s.set("OPENAI_BASE_URL", "http://example.com/v1"), /usable address/);
  const k = s.set("OPENAI_API_KEY", "sk-or-v1-abcdefghijklmnop"); assert.equal(k.secret, true); assert.equal(k.value, undefined);
  s.clear("OPENAI_API_KEY"); assert.match(fs.readFileSync(envPath, "utf8"), /^OPENAI_API_KEY=$/m);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the page: Controls → App and files offers Claude or another service; choosing Opus sends the choice and says what new readings use", async t => {
  keepEnv(t);
  const f = await page(t, { ai: claudeLike(DEFAULT_MODEL, []) });
  f.$("controlsBtn").click();
  const app = f.$("ctl-app");
  const selects = app.querySelectorAll("select");
  const from = selects.find(s => s.attrs["aria-label"] === "Who provides the model"), claude = selects.find(s => s.attrs["aria-label"] === "Claude model");
  assert.deepEqual(from.children.map(o => o.attrs.value), ["anthropic", "openai-compatible"]);
  assert.deepEqual(claude.children.map(o => o.attrs.value), ["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1", ""]);
  assert.equal(claude.children[0].attrs.selected, "selected", "Sonnet is the default");
  assert.match(visible(app), /Readings use Sonnet 5\.5/);
  claude.value = "claude-opus-5-5";
  await app.querySelectorAll("button").find(b => b.textContent === "Use this model").click();
  assert.ok(f.requests.some(r => r[0] === "/api/settings/model" && r[1] === "PUT"));
  assert.equal(f.ctx.page.S.ai.model, "claude-opus-5-5");
  assert.ok(app.querySelectorAll("input").some(i => i.attrs["aria-label"] === "Service address"), "the other service's fields are there, hidden until chosen");
});
