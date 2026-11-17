"use strict";
/* The one setup command and the launcher: a fresh copy gets a .env with no active key; a second run changes nothing
   (.env bytes, saved runs, evidence); the launcher reports ready only once the server answers and reuses a running one. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");
const root = path.join(__dirname, "..");

function copyProject(opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-setup-"));
  for (const name of ["package.json", "package-lock.json", ".env.example", "server", "shared", "public", "scripts", "examples"]) fs.cpSync(path.join(root, name), path.join(dir, name), { recursive: true, preserveTimestamps: true });
  if (opts && opts.lockedOnly) lockedModules(dir);
  else fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}
/* node_modules as package-lock.json names it (each package's package.json at its locked version, nothing else), so the
   setup test does not depend on the dependencies installed where it runs. (Found by GPT: with dependencies installed
   before the lockfile's date, setup said they were not installed and this test failed.) */
function lockedModules(dir) {
  const packages = JSON.parse(fs.readFileSync(path.join(dir, "package-lock.json"), "utf8")).packages;
  for (const [k, v] of Object.entries(packages)) {
    if (!k.startsWith("node_modules/") || v.optional) continue;
    fs.mkdirSync(path.join(dir, k), { recursive: true });
    fs.writeFileSync(path.join(dir, k, "package.json"), JSON.stringify({ name: k.replace(/^(?:.*\/)?node_modules\//, ""), version: v.version }));
  }
}
function run(dir, args) { return spawnSync(process.execPath, [path.join(dir, "scripts", "setup.js")].concat(args || []), { cwd: dir, encoding: "utf8", env: Object.assign({}, process.env, { DEFLATE_MOCK_AI: "" }) }); }

test("setup: fresh copy → .env from the example with no active key; second run preserves .env, runs, evidence and attribution", () => {
  const dir = copyProject({ lockedOnly: true });
  try {
    // the dependencies were installed before this copy's lockfile was written (an unpacked update next to them): they
    // are still the ones the lockfile names, so nothing needs installing
    const past = new Date("2020-01-01T00:00:00Z"); for (const name of fs.readdirSync(path.join(dir, "node_modules"))) fs.utimesSync(path.join(dir, "node_modules", name), past, past);
    let r = run(dir, ["--no-install"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /\.env created from \.env\.example/); assert.match(r.stdout, /Model key: not set/); assert.match(r.stdout, /npm run launch/);
    const env1 = fs.readFileSync(path.join(dir, ".env"), "utf8");
    assert.doesNotMatch(env1, /^ANTHROPIC_API_KEY=/m, "no active key line in a fresh .env");
    assert.ok(fs.existsSync(path.join(dir, "data", "runs")));
    // a person configures things and does work
    fs.writeFileSync(path.join(dir, ".env"), env1 + "ANTHROPIC_API_KEY=sk-ant-" + "b".repeat(30) + "\nRESEARCH_CONTACT_EMAIL=me@example.org\nPORT=3999\n");
    const runDir = path.join(dir, "data", "runs", "rkeep"); fs.mkdirSync(path.join(runDir, "passages"), { recursive: true });
    fs.writeFileSync(path.join(runDir, "run.json"), JSON.stringify({ title: "Keep me", provenance: { overrides: { "3": "GUEST" }, confirmedAt: "t" } }));
    fs.writeFileSync(path.join(runDir, "passages", "p001.json"), JSON.stringify({ analysis: { claims: [{ text: "x", receipts: [{ url: "https://example.org/keep" }] }] } }));
    const before = { env: fs.readFileSync(path.join(dir, ".env")), run: fs.readFileSync(path.join(runDir, "run.json")), p: fs.readFileSync(path.join(runDir, "passages", "p001.json")) };
    r = run(dir, ["--no-install"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /\.env already present; left exactly as it was/); assert.match(r.stdout, /Model key: present/); assert.match(r.stdout, /1 saved run, untouched/);
    assert.ok(before.env.equals(fs.readFileSync(path.join(dir, ".env"))), ".env byte-identical after a second setup");
    assert.ok(before.run.equals(fs.readFileSync(path.join(runDir, "run.json")))); assert.ok(before.p.equals(fs.readFileSync(path.join(runDir, "passages", "p001.json"))));
    assert.doesNotMatch(r.stdout + r.stderr, /sk-ant-b/, "the key is never printed");
    assert.match(r.stdout, /Dependencies already installed  ok/);
    // a dependency at another version than the lockfile names is found out, and named
    const express = path.join(dir, "node_modules", "express", "package.json"), pkg = JSON.parse(fs.readFileSync(express, "utf8"));
    fs.writeFileSync(express, JSON.stringify(Object.assign({}, pkg, { version: "0.0.1" })));
    r = run(dir, ["--no-install"]); assert.equal(r.status, 1); assert.match(r.stderr, /1 of \d+ dependencies are missing or differ from package-lock\.json \(express\), and --no-install was given\. Run  npm ci/);
    // missing dependencies with --no-install is an actionable stop, not a crash
    fs.rmSync(path.join(dir, "node_modules"), { recursive: true, force: true });
    r = run(dir, ["--no-install"]); assert.equal(r.status, 1); assert.match(r.stderr, /the dependencies are not installed, and --no-install was given\. Run  npm ci/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("launcher: reports ready only when the server answers, reuses a running server, and steps past an occupied port", async () => {
  const dir = copyProject();
  const net = require("net");
  const free = () => new Promise(res => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
  const blocker = net.createServer(); const blockedPort = await free(); await new Promise(r => blocker.listen(blockedPort, "127.0.0.1", r));
  let pid = null;
  try {
    fs.writeFileSync(path.join(dir, ".env"), "DEFLATE_MOCK_AI=1\nDATA_DIR=" + path.join(dir, "data").replace(/\\/g, "/") + "\n");
    const out = execFileSync(process.execPath, [path.join(dir, "scripts", "launch.js"), "--check", "--no-open", "--port", String(blockedPort)], { cwd: dir, encoding: "utf8", env: Object.assign({}, process.env, { DEFLATE_MOCK_AI: "1" }) });
    assert.match(out, new RegExp("Port " + blockedPort + " is in use by another program")); assert.match(out, /Ready and answering at http:\/\/127\.0\.0\.1:(\d+)/);
    const port = Number(/Ready and answering at http:\/\/127\.0\.0\.1:(\d+)/.exec(out)[1]); assert.notEqual(port, blockedPort);
    pid = Number(/server pid (\d+)/.exec(out)[1]);
    const h = await (await fetch("http://127.0.0.1:" + port + "/api/health")).json(); assert.equal(h.ok, true); assert.equal(h.ai.mock, true);
    const again = execFileSync(process.execPath, [path.join(dir, "scripts", "launch.js"), "--no-open", "--port", String(port)], { cwd: dir, encoding: "utf8" });
    assert.match(again, /Already running at http:\/\/127\.0\.0\.1:/); assert.match(again, /Nothing new was started/);
    process.kill(pid, "SIGINT"); await new Promise(r => setTimeout(r, 800)); pid = null;
    // a server that dies before answering is a failure, not a success
    fs.writeFileSync(path.join(dir, "server", "index.js"), "process.exit(3)\n");
    const r = spawnSync(process.execPath, [path.join(dir, "scripts", "launch.js"), "--check", "--no-open", "--port", String(await free())], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 1); assert.match(r.stderr, /did not answer/); assert.match(r.stderr, /exited with code 3/);
  } finally { if (pid) { try { process.kill(pid, "SIGINT"); } catch (e) {} } blocker.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
