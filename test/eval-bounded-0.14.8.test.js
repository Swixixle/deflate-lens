"use strict";
/* 0.14.8: npm run eval on a private set of cases (--spec), with who-each-voice-is cases and expectations written before
   the run, and a cost limit (--max-cost) kept at the model's listed price. The real script is run with the test
   responder, or against a stand-in OpenAI-compatible service on this computer that reports token usage; the readings
   prove wiring only. Invented people throughout. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), fsp = require("node:fs/promises"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const { spawn } = require("node:child_process");
const { createMockAI } = require("../server/ai");
const { identityChecks, priceOf, costOf } = require("../scripts/eval-readings");

const ROOT = path.join(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "eval-readings.js");
const ENV_OFF = { DEFLATE_MOCK_AI: "", ANTHROPIC_API_KEY: "", MODEL_PROVIDER: "", OPENAI_BASE_URL: "", OPENAI_MODEL: "", OPENAI_API_KEY: "", OPENAI_API_KEY_FOR: "" };
function run(args, env) {
  const child = spawn(process.execPath, [SCRIPT].concat(args), { cwd: ROOT, env: Object.assign({}, process.env, ENV_OFF, env || {}) });
  let out = ""; child.stdout.on("data", d => { out += d; }); child.stderr.on("data", d => { out += d; });
  return new Promise(r => child.on("exit", code => r({ code, out })));
}
const lines = f => fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];

const TALK = [
  "SPEAKER 1: Glad to have you back with us for another hour of The Marlow Hour. My guest today has spent twenty years counting bridges.",
  "SPEAKER 2: Thank you for having me, Ines. It is a strange job and I love it.",
  "SPEAKER 1: Start with the count itself. How many bridges does the county actually have?",
  "SPEAKER 2: Four hundred and twelve. The state says three hundred, because the state does not count anything under twenty feet.",
  "SPEAKER 1: So the number everyone quotes is the state's number.",
  "SPEAKER 2: Yes, and that shows the public is misled on purpose, which I think is unfair to say, but people say it.",
  "SPEAKER 1: We will come back to that. Doctor Quill, stay with us.",
  "SPEAKER 2: Happy to.",
].join("\n");
const LISTING = { url: "https://example.org/feed.xml", title: "Dr. Abe Quill on counting every bridge", fetchedAt: "2026-10-01T00:00:00.000Z", chars: 900, method: "transcript: feed",
  showInfo: { name: "The Marlow Hour", author: "Ines Marlow", artist: "Ines Marlow", persons: [], channel: false },
  episodeInfo: { guid: "ep-1", title: "Dr. Abe Quill on counting every bridge", durationSeconds: 1800, pubDate: "2026-10-01T00:00:00.000Z", link: "", audioUrl: "", description: "Dr. Abe Quill, the county's bridge counter, joins Ines Marlow.", author: "Ines Marlow", persons: [] } };

async function privateSet(t, extra) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "deflate-private-")); t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "talk.txt"), TALK);
  const cases = [
    { id: "who-is-who", identify: true, file: "talk.txt", import: LISTING, tests: "who each voice is, from the words and the listing", expect: { meaning: "names only", names: { "SPEAKER 1": "Ines Marlow", "SPEAKER 2": ["Abe Quill", "Dr. Abe Quill", null] } } },
    { id: "whole-reading", intake: true, file: "talk.txt", import: LISTING, tests: "a whole reading of a labelled talk, with the voices named", expect: { meaning: "the count and the state's count", named: [["Four hundred and twelve", ["Abe Quill", "Dr. Abe Quill", null]]], speakers: { same: [["Start with the count itself", "So the number everyone quotes"]], differ: [["Start with the count itself", "Four hundred and twelve"]] } } },
  ].concat(extra || []);
  fs.writeFileSync(path.join(dir, "cases.json"), JSON.stringify({ cases }));
  return dir;
}

test("a private set (--spec): a who-is-who case runs only identification and its second reading, records calls, cost and the verdicts against the names written before; a whole reading checks the voice that says a phrase", async t => {
  const dir = await privateSet(t), out = path.join(dir, "out");
  const r = await run(["--allow-mock", "--spec", path.join(dir, "cases.json"), "--out", out], { DEFLATE_MOCK_AI: "1" });
  assert.equal(r.code, 0, r.out);
  const rows = lines(path.join(out, "results.jsonl"));
  assert.deepEqual(rows.map(x => [x.id, x.kind]), [["who-is-who", "identify"], ["whole-reading", "passage"]]);
  const who = rows[0];
  assert.equal(who.processing.status, "identified"); assert.equal(who.passages.length, 0);
  const calls = lines(path.join(out, who.callRecords));
  assert.ok(calls.length >= 1 && calls.every(c => /^(identify|confirm)_speakers/.test(c.purpose)), JSON.stringify(calls.map(c => c.purpose)));
  assert.equal(who.calls, calls.length);
  assert.equal(who.identity.voices.length, 2); assert.deepEqual(who.identity.voices.map(v => v.key), ["SPEAKER 1", "SPEAKER 2"]);
  assert.ok(who.identity.voices.every(v => ["right", "missed", "wrong"].includes(v.verdict)));
  assert.equal(who.identity.right + who.identity.missed + who.identity.wrong, 2);
  assert.ok(Array.isArray(who.identification.decisions) && Array.isArray(who.identification.unnamed) && Array.isArray(who.identification.evidence));
  assert.equal(who.cost, null, "no listed price for the test responder");
  assert.match(who.summaryLine, /^identified · \d+ calls · \d right, \d missed, \d wrong$/);
  const whole = rows[1];
  assert.equal(whole.processing.status, "complete", JSON.stringify(whole.processing));
  assert.ok(whole.identity && whole.identity.voices.length === 1 && /Four hundred and twelve/.test(whole.identity.voices[0].what));
  assert.equal(whole.attributionErrors, 0, JSON.stringify(whole.speakers && whole.speakers.checks));
  const sheet = fs.readFileSync(path.join(out, "scoring-sheet.md"), "utf8");
  assert.match(sheet, /\*\*Who each voice is\*\* \(expected names written before the run\): \d right, \d missed, \d wrong/);
  assert.match(sheet, /\| SPEAKER 2 \| Abe Quill or Dr\. Abe Quill or \(keeps its number\) \| /);
  assert.match(sheet, /0 attribution check\(s\) failed/);
  const res = JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8"));
  assert.equal(res.spec, path.join(dir, "cases.json")); assert.equal(res.costLimit, null); assert.equal(res.stoppedBy, "");
});

test("the cost limit: once the calls made cost the limit at the given price, nothing more is sent — the case in progress ends with what it finished, the record says why, later cases are not started", async t => {
  // a service on this computer that answers through the test responder and reports usage, as a real one does
  const mock = createMockAI(), seen = [];
  const srv = http.createServer((req, res) => { let raw = ""; req.on("data", c => { raw += c; }); req.on("end", async () => {
    const body = JSON.parse(raw); seen.push(body.model);
    const o = await mock.sample({ prompt: body.messages[0].content, json: true });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "chatcmpl-x", model: body.model, choices: [{ message: { role: "assistant", content: JSON.stringify(o.data) }, finish_reason: "stop" }], usage: { prompt_tokens: 1000, completion_tokens: 500 } }));
  }); });
  await new Promise(r => srv.listen(0, "127.0.0.1", r)); t.after(() => new Promise(r => srv.close(r)));
  const dir = await privateSet(t), out = path.join(dir, "out");
  // $1 per 1,000 input tokens and $2 per 1,000 output tokens: $2 a call; a limit of $5 allows three calls, then stops
  const env = { MODEL_PROVIDER: "openai-compatible", OPENAI_BASE_URL: "http://127.0.0.1:" + srv.address().port + "/v1", OPENAI_MODEL: "m1" };
  const r = await run(["--spec", path.join(dir, "cases.json"), "--out", out, "--max-cost", "5", "--price-in", "1000", "--price-out", "2000"], env);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /cost limit \$5 at \$1000\/\$2000 per million tokens \(given\)/);
  assert.match(r.out, /Cost limit of \$5 reached/);
  assert.equal(seen.length, 3, "three calls were answered ($6), then nothing more was sent");
  const res = JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8"));
  assert.equal(res.stoppedBy, "budget"); assert.equal(res.costLimit, 5); assert.deepEqual(res.price, { perMillionTokens: true, input: 1000, output: 2000, from: "given" });
  const rows = lines(path.join(out, "results.jsonl"));
  // the first case (two calls, $4) finished; the second started under the limit, its first call took the spend to $6,
  // and its next request was refused: it ended with what it had, and says why
  assert.deepEqual(rows.map(x => x.id), ["who-is-who", "whole-reading"]);
  const who = rows[0], whole = rows[1];
  assert.equal(who.processing.status, "identified"); assert.equal(who.calls, 2); assert.equal(who.cost, 4);
  assert.equal(whole.processing.status, "error"); assert.equal(whole.processing.error.code, "budget");
  assert.match(whole.processing.message, /cost limit set for this run was reached/);
  assert.equal(whole.calls, 2, "the answered call and the refused one are on the case's record"); assert.equal(whole.cost, 2, "only the answered call cost anything");
  assert.deepEqual(whole.failedCalls.map(x => x.error), ["budget"]);
  // the refused request is in the exchanges, marked as never sent
  const ex = lines(path.join(out, whole.exchanges));
  assert.ok(ex.some(x => x.error === "budget" && x.notSent === true), "the refused request is on record");
  assert.equal(ex.filter(x => !x.notSent).length, 1);
  assert.match(r.out, /About \$6\.00 at the listed price/);
  assert.match(fs.readFileSync(path.join(out, "scoring-sheet.md"), "utf8"), /about \$4\.00/);
});

test("the cost limit needs a listed price: a model this script has no price for stops before anything is sent unless the price is given", async t => {
  const srv = http.createServer((req, res) => { res.statusCode = 500; res.end("{}"); });
  await new Promise(r => srv.listen(0, "127.0.0.1", r)); t.after(() => new Promise(r => srv.close(r)));
  const dir = await privateSet(t), out = path.join(dir, "out");
  const env = { MODEL_PROVIDER: "openai-compatible", OPENAI_BASE_URL: "http://127.0.0.1:" + srv.address().port + "/v1", OPENAI_MODEL: "some-model" };
  const r = await run(["--spec", path.join(dir, "cases.json"), "--out", out, "--max-cost", "5"], env);
  assert.equal(r.code, 2); assert.match(r.out, /No listed price is known here for some-model/); assert.ok(!fs.existsSync(path.join(out, "results.jsonl")));
  const r2 = await run(["--spec", path.join(dir, "cases.json"), "--out", out, "--max-cost", "abc"], env);
  assert.equal(r2.code, 2); assert.match(r2.out, /--max-cost needs an amount/);
});

test("prices and verdicts: the listed Claude prices by model id (dated variants included), the cost of a usage, and right / missed / wrong against expected names", () => {
  assert.deepEqual(priceOf("claude-sonnet-5-5"), { input: 2, output: 10, from: "listed on 2026-10-07" });
  assert.deepEqual(priceOf("claude-haiku-4-5-20251001"), { input: 1, output: 5, from: "listed on 2026-10-07" });
  assert.equal(priceOf("claude-opus-5-5").input, 4); assert.equal(priceOf("claude-fable-5-1").output, 50);
  assert.equal(priceOf("gpt-5"), null); assert.equal(priceOf("mock"), null);
  assert.equal(costOf({ input: 500000, output: 100000 }, priceOf("claude-sonnet-5-5")), 2);
  const bundle = names => ({ transcript: TALK, run: { parseMode: "transcript", provenance: { overrides: {} }, speakers: Object.entries(names).map(([key, name]) => ({ key, name, bio: "" })) } });
  const c = { expect: { names: { "SPEAKER 1": "Ines Marlow", "SPEAKER 2": ["Abe Quill", null] }, named: [["Four hundred and twelve", "Abe Quill"], ["Start with the count itself", ["Ines Marlow"]], ["words nobody says", "Nobody"]] } };
  let r = identityChecks(c, bundle({ "SPEAKER 1": "Ines Marlow", "SPEAKER 2": "Abe Quill" }));
  assert.deepEqual(r.voices.map(v => v.verdict), ["right", "right", "right", "right", "wrong"]);
  assert.equal(r.voices[4].key, "", "a phrase nobody says is a wrong result, not a crash");
  r = identityChecks(c, bundle({ "SPEAKER 1": "Speaker 1", "SPEAKER 2": "Speaker 2" }));
  assert.deepEqual(r.voices.map(v => v.verdict), ["missed", "right", "missed", "missed", "wrong"], "a default name is no name; a number was acceptable for SPEAKER 2");
  r = identityChecks(c, bundle({ "SPEAKER 1": "Abe Quill", "SPEAKER 2": "Ines Marlow" }));
  assert.deepEqual([r.right, r.missed, r.wrong], [0, 0, 5]);
});
