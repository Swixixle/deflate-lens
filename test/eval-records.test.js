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
const env = Object.assign({}, process.env, { DEFLATE_MOCK_AI: "1", ANTHROPIC_API_KEY: "" });

function run(args, opts = {}) {
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

test("eval: with no model key nothing runs and nothing is substituted", async t => {
  const out = await fsp.mkdtemp(path.join(os.tmpdir(), "deflate-eval-")); t.after(() => fsp.rm(out, { recursive: true, force: true }));
  const child = spawn(process.execPath, [SCRIPT, "--out", out, "--cases", "typed-claim"], { cwd: ROOT, env: Object.assign({}, process.env, { DEFLATE_MOCK_AI: "", ANTHROPIC_API_KEY: "not-a-key" }) });
  let text = ""; child.stdout.on("data", d => { text += d; }); child.stderr.on("data", d => { text += d; });
  const code = await new Promise(r => child.on("exit", r));
  assert.equal(code, 2, text); assert.match(text, /no mock was used in its place/);
  assert.ok(!fs.existsSync(path.join(out, "results.jsonl")));
});
