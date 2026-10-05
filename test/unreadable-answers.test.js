"use strict";
/* A model answer the app cannot read (not JSON, or cut off at the length limit) is a failed attempt, not a crash: the
   failed call keeps the provider's stop reason, usage and request id; one bounded correction follows with the reason;
   a second unreadable answer holds that one passage with a specific reason while the rest of the run continues. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI, parseReply } = require("../server/ai");
const { createResearch } = require("../server/research");

const transcript = Array.from({ length: 18 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": This is turn " + i + " with enough plain words in it to quote safely and read as one argument.").join("\n");
const isPassage = p => p.startsWith("Help a reader understand this passage accurately.") && !p.includes("This is ONE claim");
const isReview = p => p.startsWith("Review this reading before it is shown. A draft");
function unreadableError(stopReason) {
  const e = new Error("The model's reply was not well-formed JSON."); e.code = stopReason === "max_tokens" ? "truncated" : "invalid_json";
  e.text = '{"asSaid":[{"turn":1,"speaker":"HOST","quote":"This is turn'; e.meta = { usage: { input: 2100, output: 16000 }, model: "model-under-test", requestId: "req_unreadable", stopReason }; return e;
}
/* The mock, except that `fail(prompt, nth)` decides which answers come back unreadable (nth counts matching prompts). */
function flaky(fail) {
  const mock = createMockAI(), prompts = [], seen = new Map();
  return { prompts, ai: { ...mock, async sample(args) {
    prompts.push(args.prompt);
    const verdict = fail(args.prompt, seen);
    if (verdict) throw unreadableError(verdict);
    return mock.sample(args);
  } } };
}
const nth = (seen, key) => { seen.set(key, (seen.get(key) || 0) + 1); return seen.get(key); };
async function fixture(t, ai) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-unreadable-"));
  const app = createApp({ dataDir: dir, examplesDir: dir, env: {}, envPath: path.join(dir, ".env"), ai, research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), run: async () => ({ code: 1, out: "" }) });
  await app.ready;
  t.after(async () => { for (const job of app.reader.jobs.values()) job.controller.abort(); await Promise.all([...app.reader.jobs.values()].map(j => j.done)); await fs.rm(dir, { recursive: true, force: true }); });
  const read = async () => { const id = await app.store.createRun({}, transcript); await app.reader.start(id); const job = app.reader.jobs.get(id); if (job) await job.done; return app.store.bundle(id); };
  const calls = async id => (await fs.readFile(path.join(dir, "runs", id, "calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  return { app, read, calls };
}

test("the provider reply parser names a cut-off answer and keeps the provider's record on the error", () => {
  const meta = { usage: { input: 10, output: 16000 }, model: "m", requestId: "req_1", stopReason: "max_tokens" };
  assert.throws(() => parseReply('{"deflated":{"hs":"cut', meta, true), e => e.code === "truncated" && e.meta === meta && /length limit/.test(e.message));
  assert.throws(() => parseReply("Sorry, here is prose.", Object.assign({}, meta, { stopReason: "end_turn" }), true), e => e.code === "invalid_json" && e.meta.requestId === "req_1");
  assert.deepEqual(parseReply('{"ok":true}', Object.assign({}, meta, { stopReason: "end_turn" }), true).data, { ok: true });
});

test("a reading cut off once is corrected once; the failed call keeps its stop reason, usage and request id", async t => {
  const m = flaky((p, seen) => isPassage(p) && p.includes("PASSAGE (turns 0–7") && nth(seen, "p1") === 1 ? "max_tokens" : null);
  const f = await fixture(t, m.ai), b = await f.read();
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  assert.ok(b.passages.every(p => p.readingGate.status === "ready"));
  const retry = m.prompts.filter(p => isPassage(p) && p.includes("PASSAGE (turns 0–7"));
  assert.equal(retry.length, 2); assert.match(retry[1], /cut off at the length limit\. Give the same JSON more briefly/);
  const failed = (await f.calls(b.run.id)).find(c => c.error);
  assert.equal(failed.error, "truncated"); assert.equal(failed.stopReason, "max_tokens"); assert.deepEqual(failed.usage, { input: 2100, output: 16000 });
  assert.equal(failed.requestId, "req_unreadable"); assert.equal(failed.modelReturned, "model-under-test"); assert.equal(failed.purpose, "deflate"); assert.ok(failed.outputHash);
});

test("a passage that stays unreadable is held with its reason after two attempts; the other passages finish and the run says what to do", async t => {
  const m = flaky(p => isPassage(p) && p.includes("PASSAGE (turns 8–15") ? "max_tokens" : null);
  const f = await fixture(t, m.ai), b = await f.read();
  assert.equal(m.prompts.filter(p => isPassage(p) && p.includes("PASSAGE (turns 8–15")).length, 2, "bounded: the first answer and one correction");
  const held = b.passages.find(p => p.turnStart === 8);
  assert.equal(held.readingGate.status, "held"); assert.deepEqual(held.readingGate.reasons, ["The model's answer was cut off at its length limit before it finished."]);
  assert.ok(b.passages.filter(p => p !== held).every(p => p.readingGate.status === "ready"), "progress on the other passages is kept");
  assert.equal(b.run.processing.status, "partial");
  assert.equal(b.run.processing.message, "2 readings ready. 1 couldn't be completed.", "the main status says how many; the reason is on the passage");
  // Read this again reads only the held passage
  m.prompts.length = 0; await f.app.reader.start(b.run.id); const job = f.app.reader.jobs.get(b.run.id); if (job) await job.done;
  assert.ok(m.prompts.filter(isPassage).every(p => p.includes("PASSAGE (turns 8–15")));
});

test("an unreadable review is asked again once; a review that stays unreadable holds the draft with that reason", async t => {
  let m = flaky((p, seen) => isReview(p) && nth(seen, "r") === 1 ? "end_turn" : null);
  let f = await fixture(t, m.ai), b = await f.read();
  assert.equal(b.run.processing.status, "complete"); assert.ok(b.passages.every(p => p.readingGate.status === "ready"));
  assert.equal(m.prompts.filter(isReview).length, 4, "three reviews plus one repeat");
  m = flaky(p => isReview(p) && p.includes("PASSAGE (turns 16–17") ? "end_turn" : null);
  f = await fixture(t, m.ai); b = await f.read();
  const held = b.passages.find(p => p.turnStart === 16);
  assert.equal(held.readingGate.status, "held");
  assert.ok(held.readingGate.reasons.includes("The separate review's answer was not well-formed JSON. The draft was not approved."), JSON.stringify(held.readingGate.reasons));
  // a draft whose review stays unreadable is held at once: a new draft would not make the review readable
  assert.equal(m.prompts.filter(p => isPassage(p) && p.includes("PASSAGE (turns 16–17")).length, 1);
});

test("splitting into passages, the overview and speaker preparation each recover from one unreadable answer", async t => {
  const m = flaky((p, seen) => (p.startsWith("Split this transcript") && nth(seen, "s") === 1) ? "max_tokens" :
    (p.startsWith("Below are the final readings of") && nth(seen, "o") === 1) ? "end_turn" :
    (p.startsWith("Prepare transcript speaker labels") && nth(seen, "k") === 1) ? "end_turn" : null);
  const f = await fixture(t, m.ai), b = await f.read();
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  assert.equal(b.passages.length, 3); assert.equal(b.summary.readingGate.status, "ready");
  assert.match(m.prompts.filter(p => p.startsWith("Split this transcript"))[1], /cut off at the length limit/);
  const failed = (await f.calls(b.run.id)).filter(c => c.error).map(c => c.purpose).sort();
  assert.deepEqual(failed, ["patterns", "prepare_speakers", "segment"]);
});

test("splitting that stays unreadable stops with a specific message and keeps the saved text", async t => {
  const m = flaky(p => p.startsWith("Split this transcript") ? "end_turn" : null);
  const f = await fixture(t, m.ai), b = await f.read();
  assert.equal(b.run.processing.status, "error");
  assert.equal(b.run.processing.message, "The conversation could not be divided into passages after one correction. Your text is saved. Press Read this to try again.");
  assert.equal(b.transcript, transcript); assert.equal(m.prompts.filter(p => p.startsWith("Split this transcript")).length, 2);
});
