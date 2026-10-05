"use strict";
/* 0.12.1: npm run eval keeps what it finished. Each completed case is written at once, the readings and their call
   records stay in the output folder, and the scoring sheet shows the exact source beside each output. Runs the real
   script with the test responder (--allow-mock); the readings prove wiring only. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), fsp = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "eval-readings.js");
function run(args, opts = {}) {
  const env = Object.assign({}, process.env, { DEFLATE_MOCK_AI: "1", ANTHROPIC_API_KEY: "" }, opts.env || {});
  const child = spawn(process.execPath, (opts.preload ? ["-r", opts.preload] : []).concat([SCRIPT], args), { cwd: ROOT, env });
  let out = "";
  child.stdout.on("data", d => { out += d; }); child.stderr.on("data", d => { out += d; });
  const done = new Promise(r => child.on("exit", (code, signal) => r({ code, signal, out })));
  return { child, done };
}
const lines = f => fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];

test("eval: every finished case is on disk with its call records, and the sheet puts the source beside the output", async t => {
  const out = await fsp.mkdtemp(path.join(os.tmpdir(), "deflate-eval-")); t.after(() => fsp.rm(out, { recursive: true, force: true }));
  const r = await run(["--allow-mock", "--out", out, "--cases", "sound-library,typed-claim"]).done;
  assert.equal(r.code, 0, r.out);
  const rows = lines(path.join(out, "results.jsonl"));
  assert.deepEqual(rows.map(x => x.id), ["sound-library", "typed-claim"]);
  for (const row of rows) {
    const calls = lines(path.join(out, row.callRecords));
    assert.ok(calls.length >= 1 && calls.length === row.calls, row.id + ": its call records are kept where the result says");
  }
  const passage = rows[0].passages[0];
  assert.equal(passage.material.matches, true, "the source is rebuilt from the kept text and checked against the reading's record");
  const sheet = fs.readFileSync(path.join(out, "scoring-sheet.md"), "utf8");
  assert.match(sheet, /\*\*Source as read\*\* \(rebuilt and checked against the reading's record\):\n\n```text\nPASSAGE \(turns 0–0\):\n\[0\] LIBRARIAN: Twelve of the 18 evening visitors/);
  assert.match(sheet, /```text\nCLAIM \(typed by a person\):\n/);
  assert.ok(sheet.indexOf("Source as read") < sheet.indexOf("- In plain words:"), "the source comes before the output it is scored against");
  assert.match(sheet, /call records: store\/runs\/[^/]+\/calls\.jsonl/);
  const res = JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8"));
  assert.equal(res.finished, true); assert.equal(res.completed, 2); assert.doesNotMatch(sheet, /Incomplete/);
});

test("eval: a run stopped partway keeps every case it finished and says the sheet is incomplete", async t => {
  const out = await fsp.mkdtemp(path.join(os.tmpdir(), "deflate-eval-")); t.after(() => fsp.rm(out, { recursive: true, force: true }));
  // a slower stand-in for the model, so the stop lands between cases
  const preload = path.join(out, "slow-model.js");
  fs.writeFileSync(preload, "const ai = require(" + JSON.stringify(path.join(ROOT, "server", "ai.js")) + "); const make = ai.createAI;\n" +
    "ai.createAI = env => { const a = make(env); if (!a || !a.mock) return a; const sample = a.sample.bind(a); a.sample = async args => { await new Promise(r => setTimeout(r, 120)); return sample(args); }; return a; };\n");
  const p = run(["--allow-mock", "--out", out, "--cases", "sound-library,careless-library,sound-trial,typed-claim"], { preload });
  const file = path.join(out, "results.jsonl");
  for (let i = 0; i < 400 && lines(file).length < 1; i++) await new Promise(r => setTimeout(r, 25));
  assert.ok(lines(file).length >= 1, "the first case was written before the run ended");
  p.child.kill("SIGINT");
  const r = await p.done;
  assert.equal(r.code, 130, r.out); assert.match(r.out, /Stopped\. \d finished case\(s\) are in /);
  const rows = lines(file), res = JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8"));
  assert.ok(rows.length >= 1 && rows.length < 4, "stopped partway: " + rows.length);
  assert.equal(res.finished, false); assert.equal(res.completed, rows.length); assert.deepEqual(res.results.map(x => x.id), rows.map(x => x.id));
  assert.match(fs.readFileSync(path.join(out, "scoring-sheet.md"), "utf8"), new RegExp("_Incomplete: " + rows.length + " case\\(s\\) finished so far\\._"));
  for (const row of rows) assert.ok(fs.existsSync(path.join(out, row.callRecords)));
});

test("eval: a draft the review rejected is kept with its reasons and the review's answer, then the correction that changed only what was named", async t => {
  const out = await fsp.mkdtemp(path.join(os.tmpdir(), "deflate-eval-")); t.after(() => fsp.rm(out, { recursive: true, force: true }));
  const LONG = "jump.hs (also revision): the draft's concern does not match what the speaker said. " + "It replaces the speaker's claim with a narrower one and builds the concern on that. ".repeat(5) + "END-OF-REASON";
  // a stand-in whose review rejects the first draft of each passage (with REJECT=all also every review of a corrected reading),
  // with a reason longer than 300 characters
  const preload = path.join(out, "reviewer.js");
  fs.writeFileSync(preload, "const ai = require(" + JSON.stringify(path.join(ROOT, "server", "ai.js")) + "); const make = ai.createAI;\n" +
    "ai.createAI = env => { const a = make(env); if (!a || !a.mock) return a; const sample = a.sample.bind(a); a.sample = async args => { const p = String(args.prompt || ''); const say = data => ({ data, text: JSON.stringify(data), usage: null, model: 'mock', stopReason: 'end_turn' });" +
    " if (p.startsWith('Review this reading before it is shown') && !p.includes('closing overview')) return say({ approved: false, issues: [" + JSON.stringify(LONG) + "] });" +
    " if (process.env.REJECT === 'all' && p.startsWith('Review a corrected reading')) return say({ resolved: [false], approved: false, issues: [] });" +
    " return sample(args); }; return a; };\n");
  const first = await run(["--allow-mock", "--out", path.join(out, "first"), "--cases", "sound-library"], { preload }).done;
  assert.equal(first.code, 0, first.out);
  const row = lines(path.join(out, "first", "results.jsonl"))[0], p = row.passages[0];
  assert.equal(p.gate, "ready"); assert.equal(p.attempts.length, 2);
  assert.deepEqual(p.attempts.map(x => [x.kind, x.shown]), [["draft", false], ["correction", true]]);
  assert.ok(p.attempts[0].reasons.includes(LONG), "the whole reason, not cut");
  assert.equal(p.attempts[0].review.answer.approved, false); assert.ok(p.attempts[0].draft && p.attempts[0].draft.deflated, "the rejected draft itself is kept");
  assert.deepEqual(p.attempts[1].changed.map(c => c.path), ["jump.hs"], "the correction changed only the field the problem names");
  assert.deepEqual(p.attempts[1].review.answer, { resolved: [true], approved: true, issues: [] }, "the review of the whole corrected reading, as the app recorded it");
  assert.notEqual(p.attempts[0].review.exchange, p.attempts[1].review.exchange);
  assert.ok(Array.isArray(p.attempts[0].checks), "and the pointers are run on the rejected draft too");
  let sheet = fs.readFileSync(path.join(out, "first", "scoring-sheet.md"), "utf8");
  assert.match(sheet, /\*\*Before display\*\* \(2 attempts; full prompts and answers in exchanges\/sound-library\.jsonl\)/);
  const section = sheet.slice(sheet.indexOf("Before display"));
  assert.ok(section.includes("- " + LONG), "the sheet prints the complete reason");
  assert.match(section, /The separate review \(exchange \d+\) answered approved: false, with the issues above\./);
  assert.match(section, /\*\*High school\*\*\n\n- In plain words: MOCK/);
  assert.match(section, /Mechanical pointers for this draft: /);
  const ex = lines(path.join(out, "first", "exchanges", "sound-library.jsonl"));
  assert.deepEqual(ex.map(x => x.kind).filter(k => !["other", "speaker structure", "review of the speaker structure"].includes(k)), ["reading", "review", "correction", "review of the corrected reading"]);
  assert.ok(ex.every(x => typeof x.prompt === "string" && x.prompt.length === x.promptChars && typeof x.text === "string"), "every exchange keeps its prompt and answer");
  assert.ok(ex.find(x => x.kind === "correction").prompt.includes(LONG), "the correction was told the whole reason");
  // every check says the problem is still there: the passage is held after two corrections, and the sheet shows why
  const held = await run(["--allow-mock", "--out", path.join(out, "held"), "--cases", "typed-claim"], { preload, env: { REJECT: "all" } }).done;
  assert.equal(held.code, 0, held.out);
  const hp = lines(path.join(out, "held", "results.jsonl"))[0].passages[0];
  assert.equal(hp.gate, "held"); assert.deepEqual(hp.attempts.map(x => [x.kind, x.shown]), [["draft", false], ["correction", false], ["correction", false]]); assert.ok(hp.held.issues.includes(LONG));
  sheet = fs.readFileSync(path.join(out, "held", "scoring-sheet.md"), "utf8");
  assert.match(sheet, /\*\*Before display\*\* \(3 attempts;/);
  assert.equal(sheet.split("- " + LONG).length - 1, 3, "the reason with the draft and after each correction");
  assert.match(sheet, /_Attempt 2_ \(correction 1, call /);
});

/* ---- linking attempts to their exchanges: by prompt and answer, made at the time of the call, each used once ---- */
const crypto = require("node:crypto");
const { attemptsFor, pairer } = require("../scripts/eval-readings");
const H = s => crypto.createHash("sha256").update(String(s)).digest("hex");
function world() {
  const calls = [], exchanges = []; let clock = 0;
  const at = () => new Date(Date.UTC(2026, 9, 4, 6, 0, clock++)).toISOString();
  // a model exchange as the eval logs it, and the call record the app writes for it
  const send = (purpose, prompt, text, extra = {}) => {
    const t = at(), n = exchanges.length + 1, data = (() => { try { return JSON.parse(text); } catch (e) { return null; } })();
    exchanges.push({ n, at: t, kind: purpose, promptSha256: H(prompt), outputSha256: H(text), text, data, prompt });
    const c = Object.assign({ callId: "call" + n, at: t, purpose, promptHash: H(prompt), outputHash: H(text) }, extra.error ? { error: extra.error } : {});
    calls.push(c); return c;
  };
  return { calls, exchanges, send };
}
const answer = (approved, issues) => JSON.stringify({ approved, issues });
const draft = JSON.stringify({ deflated: { hs: "The claim says most people own a bicycle.", g5: "It says most people have a bike." }, type: "claim" });

test("eval pairing: two readings of a passage with identical prompts and different decisions each link to their own exchanges", () => {
  const w = world();
  // Read this twice: the same draft both times, so the same review prompt; the first review rejects, the second approves
  const g1 = w.send("claim", "READ the claim", draft); const r1 = w.send("claim_review", "REVIEW " + draft, answer(false, ["too broad"]));
  const g2 = w.send("claim", "READ the claim", draft); const r2 = w.send("claim_review", "REVIEW " + draft, answer(true, []));
  g1.review = { approved: false, callId: r1.callId, issues: ["too broad"] }; g2.review = { approved: true, callId: r2.callId, issues: [] };
  const log = [{ outcome: "held", attempts: [{ kind: "draft", callId: g1.callId, issues: ["too broad"], review: { approved: false, issues: ["too broad"] } }] },
    { outcome: "shown", attempts: [{ kind: "draft", callId: g2.callId, issues: [], review: { approved: true, issues: [] } }] }];
  // call records are written when a draft is decided, so the file's order is not the order of the calls
  const a = attemptsFor(log, [r2, g2, r1, g1], w.exchanges);
  assert.equal(a.length, 1); assert.equal(a[0].shown, true);
  assert.equal(a[0].exchange, 3, "the second reading's draft, not the first one with the same prompt and answer");
  assert.equal(a[0].review.exchange, 4); assert.deepEqual(a[0].review.answer, { approved: true, issues: [] });
});

test("eval pairing: a draft and its correction keep their own reasons, and each check links to its own exchange", () => {
  const w = world();
  const g = w.send("claim", "READ", draft); const r = w.send("claim_review", "REVIEW " + draft, answer(false, ["reason A", "reason B"]));
  const f = w.send("claim_fix", "FIX A and B", JSON.stringify({ changes: [{ path: "deflated.g5", value: "It says more than half of people have a bike." }] }));
  const k = w.send("claim_recheck", "CHECK the fix", JSON.stringify({ resolved: [true, false], newIssues: [] }));
  g.review = { approved: false, callId: r.callId, issues: ["reason A", "reason B"] }; f.review = { approved: false, callId: k.callId, issues: ["reason B"] };
  const log = [{ outcome: "held", attempts: [{ kind: "draft", callId: g.callId, issues: ["reason A", "reason B"], review: { approved: false, issues: ["reason A", "reason B"] } },
    { kind: "correction", round: 1, callId: f.callId, changed: [{ path: "deflated.g5", before: "It says most people have a bike.", after: "It says more than half of people have a bike." }], issues: ["reason B"], review: { resolved: [true, false], newIssues: [] } }] }];
  const a = attemptsFor(log, w.calls, w.exchanges);
  assert.deepEqual(a.map(x => x.reasons), [["reason A", "reason B"], ["reason B"]]);
  assert.deepEqual(a.map(x => [x.exchange, x.review.exchange]), [[1, 2], [3, 4]]);
  assert.deepEqual(a.map(x => x.shown), [false, false]);
});

test("eval pairing: an unreadable review followed by a retry is listed with its attempt, and the retry is the one that decided", () => {
  const w = world();
  const g = w.send("claim", "READ", draft);
  const bad = w.send("claim_review", "REVIEW " + draft, "{\"approved\": tr", { error: "truncated" });
  const retry = w.send("claim_review", "REVIEW " + draft + " Your previous answer could not be used", answer(true, []));
  g.review = { approved: true, callId: retry.callId, issues: [] };
  const log = [{ outcome: "shown", attempts: [{ kind: "draft", callId: g.callId, issues: [], review: { approved: true, issues: [] } }] }];
  const a = attemptsFor(log, w.calls, w.exchanges);
  assert.equal(a[0].review.callId, retry.callId); assert.equal(a[0].review.exchange, 3);
  assert.deepEqual(a[0].reviewCalls.map(z => [z.callId, z.error, z.decided, z.text]), [[bad.callId, "truncated", false, "{\"approved\": tr"], [retry.callId, "", true, undefined]]);
  // a pairer shared across a case never hands the same exchange to two calls
  const pair = pairer(w.exchanges); assert.deepEqual(w.calls.map(pair).map(x => x && x.n), [1, 2, 3]);
});

test("eval: with no model key nothing runs and nothing is substituted", async t => {
  const out = await fsp.mkdtemp(path.join(os.tmpdir(), "deflate-eval-")); t.after(() => fsp.rm(out, { recursive: true, force: true }));
  const child = spawn(process.execPath, [SCRIPT, "--out", out, "--cases", "typed-claim"], { cwd: ROOT, env: Object.assign({}, process.env, { DEFLATE_MOCK_AI: "", ANTHROPIC_API_KEY: "not-a-key" }) });
  let text = ""; child.stdout.on("data", d => { text += d; }); child.stderr.on("data", d => { text += d; });
  const code = await new Promise(r => child.on("exit", r));
  assert.equal(code, 2, text); assert.match(text, /no mock was used in its place/);
  assert.ok(!fs.existsSync(path.join(out, "results.jsonl")));
});
