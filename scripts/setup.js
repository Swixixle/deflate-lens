"use strict";
/* `npm run setup` — the one repeatable setup command.
   Checks the prerequisites, installs the locked dependencies (only when needed), prepares .env without touching values
   that are already there, makes sure the data folder exists, and says exactly what to do next. Safe to run again:
   a second run changes nothing that was already in place (saved runs, evidence, attribution decisions, .env values).
   Options:  --no-install            skip npm ci even if dependencies are missing (for hosts that install themselves)
             --test                  run the test suite at the end
             --local-transcription   also install the optional speech-to-text packages into data/local-transcription
                                     (about 480 MB; the page offers the same install when it first needs it)
   Exit code 0 means ready to launch; 1 means something is missing and the message says what. */
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const root = path.join(__dirname, "..");
const args = new Set(process.argv.slice(2));
const log = m => console.log("  " + m);
const fail = m => { console.error("\n  Setup stopped: " + m + "\n"); process.exit(1); };

console.log("\nDeflate Lens setup\n");

// 1. Node
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 18 || (major === 18 && minor < 17)) fail("Node " + process.versions.node + " is too old. Install Node 18.17 or newer from https://nodejs.org (the LTS download), then run this again.");
log("Node " + process.versions.node + "  ok");

// 2. npm (the one that launched us, or the one on the PATH)
const npmCmd = process.env.npm_execpath ? [process.execPath, process.env.npm_execpath] : [process.platform === "win32" ? "npm.cmd" : "npm"];
const npmV = spawnSync(npmCmd[0], npmCmd.slice(1).concat(["--version"]), { encoding: "utf8" });
if (npmV.status !== 0) fail("npm was not found. It comes with Node from https://nodejs.org; reinstall Node and run this again.");
log("npm " + String(npmV.stdout).trim() + "  ok");

// 3. dependencies from the lockfile, only when missing or out of date
const lock = path.join(root, "package-lock.json"), nm = path.join(root, "node_modules"), nmLock = path.join(nm, ".package-lock.json");
if (!fs.existsSync(lock)) fail("package-lock.json is missing; this copy of the project is incomplete.");
const need = !fs.existsSync(path.join(nm, "express")) || !fs.existsSync(nmLock) || fs.statSync(lock).mtimeMs > fs.statSync(nmLock).mtimeMs;
if (need) {
  if (args.has("--no-install")) fail("dependencies are not installed and --no-install was given. Run  npm ci  in " + root + " and then this again.");
  log("Installing locked dependencies (npm ci)…");
  const r = spawnSync(npmCmd[0], npmCmd.slice(1).concat(["ci", "--no-audit", "--no-fund"]), { cwd: root, stdio: "inherit" });
  if (r.status !== 0) fail("npm ci failed (see the lines above). Usual causes: no network, or a proxy that blocks registry.npmjs.org. Fix that and run  npm run setup  again.");
  log("Dependencies installed  ok");
} else log("Dependencies already installed  ok");

// 4. .env: create from the example if absent; never rewrite an existing file
const envPath = path.join(root, ".env"), examplePath = path.join(root, ".env.example");
if (!fs.existsSync(envPath)) { fs.copyFileSync(examplePath, envPath); try { fs.chmodSync(envPath, 0o600); } catch (e) {} log(".env created from .env.example (no key yet)"); }
else log(".env already present; left exactly as it was");
const env = {}; for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line); if (m) env[m[1]] = m[2].trim(); }
const hasKey = /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(env.ANTHROPIC_API_KEY || "");
const mock = env.DEFLATE_MOCK_AI === "1" || process.env.DEFLATE_MOCK_AI === "1";
log("Model key: " + (hasKey ? "present" : "not set") + (mock ? " (DEFLATE_MOCK_AI=1: analyses will be placeholders)" : ""));
log("Research contact e-mail: " + (env.RESEARCH_CONTACT_EMAIL ? "set" : "not set (optional; Crossref is faster with one)"));
log("OpenAlex key: " + (env.OPENALEX_API_KEY ? "set" : "not set (optional)"));

// 5. data folder
const dataDir = env.DATA_DIR ? path.resolve(root, env.DATA_DIR) : path.join(root, "data");
fs.mkdirSync(path.join(dataDir, "runs"), { recursive: true });
let runs = 0; try { runs = fs.readdirSync(path.join(dataDir, "runs")).filter(n => fs.existsSync(path.join(dataDir, "runs", n, "run.json"))).length; } catch (e) {}
log("Data folder: " + dataDir + (runs ? " (" + runs + " saved run" + (runs === 1 ? "" : "s") + ", untouched)" : " (empty; the example is installed on first start)"));

// 6. optional local transcription (the same install the page offers when a podcast has no published transcript)
{
  const { localEngine } = require("../server/podcast/engines");
  const eng = localEngine({ dataDir, env });
  if (args.has("--local-transcription") && !eng.installed()) {
    log("Installing local transcription into " + eng.dir + " (about 480 MB)…");
    eng.install({ onLog: s => process.stdout.write(s) }).then(() => { log("Local transcription installed  ok (model downloads on first use, 76 MB)"); finish(); }, e => { fail("local transcription did not install: " + e.message); });
  } else { log("Local transcription: " + (eng.installed() ? "installed (" + eng.model + ")" : "not installed (optional; the page offers it, or run  npm run setup -- --local-transcription)")); finish(); }
}
function finish() {
if (args.has("--test")) {
  log("Running the test suite…");
  const t = spawnSync(process.execPath, ["--test", ...fs.readdirSync(path.join(root, "test")).filter(f => f.endsWith(".test.js")).map(f => path.join(root, "test", f))], { cwd: root, stdio: "inherit" });
  if (t.status !== 0) fail("tests failed; see above.");
  log("Tests passed  ok");
}

console.log("\n  Ready. Start it with:  npm run launch     (starts the server, waits until it answers, opens the page)");
console.log("  Or without a browser:  npm start          Stop with Ctrl+C.");
if (!hasKey && !mock) console.log("  Source search works without a key. Real analysis and preparation ask for your Anthropic API key once, in the page.");
console.log("");
}
