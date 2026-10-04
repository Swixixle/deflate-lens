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

test("eval: a draft the review rejected is kept with its complete reasons and the review's answer, beside what was shown", async t => {
  const out = await fsp.mkdtemp(path.join(os.tmpdir(), "deflate-eval-")); t.after(() => fsp.rm(out, { recursive: true, force: true }));
  const LONG = "jump.hs (also revision): the draft's concern does not match what the speaker said. " + "It replaces the speaker's claim with a narrower one and builds the concern on that. ".repeat(5) + "END-OF-REASON";
  // a stand-in whose review rejects the first draft of each passage (or every draft), with a reason longer than 300 characters
  const preload = path.join(out, "reviewer.js");
  fs.writeFileSync(preload, "const ai = require(" + JSON.stringify(path.join(ROOT, "server", "ai.js")) + "); const make = ai.createAI; let n = 0;\n" +
    "ai.createAI = env => { const a = make(env); if (!a || !a.mock) return a; const sample = a.sample.bind(a); a.sample = async args => { const p = String(args.prompt || '');" +
    " if (p.startsWith('Review this reading before it is shown') && !p.includes('closing overview') && (process.env.REJECT === 'all' || n++ % 2 === 0)) { const data = { approved: false, issues: [" + JSON.stringify(LONG) + "] }; return { data, text: JSON.stringify(data), usage: null, model: 'mock', stopReason: 'end_turn' }; }" +
    " return sample(args); }; return a; };\n");
  const first = await run(["--allow-mock", "--out", path.join(out, "first"), "--cases", "sound-library"], { preload }).done;
  assert.equal(first.code, 0, first.out);
  const row = lines(path.join(out, "first", "results.jsonl"))[0], p = row.passages[0];
  assert.equal(p.gate, "ready"); assert.equal(p.attempts.length, 2);
  assert.deepEqual(p.attempts.map(x => x.shown), [false, true]);
  assert.ok(p.attempts[0].reasons.includes(LONG), "the whole reason, not cut");
  assert.equal(p.attempts[0].review.answer.approved, false); assert.ok(p.attempts[0].draft && p.attempts[0].draft.deflated, "the rejected draft itself is kept");
  assert.ok(Array.isArray(p.attempts[0].checks), "and the pointers are run on it too");
  let sheet = fs.readFileSync(path.join(out, "first", "scoring-sheet.md"), "utf8");
  assert.match(sheet, /\*\*Rejected before display\*\* \(1 of 2 attempts; full prompts and answers in exchanges\/sound-library\.jsonl\)/);
  const section = sheet.slice(sheet.indexOf("Rejected before display"));
  assert.ok(section.includes("- " + LONG), "the sheet prints the complete reason");
  assert.match(section, /The separate review answered approved: false, with the issues above\./);
  assert.match(section, /\*\*High school\*\*\n\n- In plain words: MOCK/);
  assert.match(section, /Mechanical pointers for this draft: /);
  const ex = lines(path.join(out, "first", "exchanges", "sound-library.jsonl"));
  const kinds = ex.map(x => x.kind).filter(k => k !== "other");
  assert.deepEqual(kinds, ["reading", "review", "reading (correction)", "review"]);
  assert.ok(ex.every(x => typeof x.prompt === "string" && x.prompt.length === x.promptChars && typeof x.text === "string"), "every exchange keeps its prompt and answer");
  assert.ok(ex.find(x => x.kind === "reading (correction)").prompt.includes(LONG), "the correction was told the whole reason");
  // every draft rejected: the passage is held, and the sheet shows both drafts and why
  const held = await run(["--allow-mock", "--out", path.join(out, "held"), "--cases", "typed-claim"], { preload, env: { REJECT: "all" } }).done;
  assert.equal(held.code, 0, held.out);
  const hp = lines(path.join(out, "held", "results.jsonl"))[0].passages[0];
  assert.equal(hp.gate, "held"); assert.deepEqual(hp.attempts.map(x => x.shown), [false, false]); assert.ok(hp.held.issues.includes(LONG));
  sheet = fs.readFileSync(path.join(out, "held", "scoring-sheet.md"), "utf8");
  assert.match(sheet, /\*\*Rejected before display\*\* \(2 of 2 attempts;/);
  assert.equal(sheet.split("- " + LONG).length - 1, 2, "each rejected draft with its reason");
  assert.match(sheet, /_Attempt 2_ \(claim \(correction\), call /);
});

test("eval: with no model key nothing runs and nothing is substituted", async t => {
  const out = await fsp.mkdtemp(path.join(os.tmpdir(), "deflate-eval-")); t.after(() => fsp.rm(out, { recursive: true, force: true }));
  const child = spawn(process.execPath, [SCRIPT, "--out", out, "--cases", "typed-claim"], { cwd: ROOT, env: Object.assign({}, process.env, { DEFLATE_MOCK_AI: "", ANTHROPIC_API_KEY: "not-a-key" }) });
  let text = ""; child.stdout.on("data", d => { text += d; }); child.stderr.on("data", d => { text += d; });
  const code = await new Promise(r => child.on("exit", r));
  assert.equal(code, 2, text); assert.match(text, /no mock was used in its place/);
  assert.ok(!fs.existsSync(path.join(out, "results.jsonl")));
});
