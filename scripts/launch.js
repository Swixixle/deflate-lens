"use strict";
/* `npm run launch` — start the app, wait until it actually answers, open the page.
   - If a Deflate Lens server already answers on the configured port, it is reused and the page opened; nothing new starts.
   - If the port is taken by something else, the next free port is used and the address actually in use is printed.
   - Success is reported only after GET /api/health answers; a spawned process that dies is reported as a failure.
   - The browser is opened with the platform's opener (open / xdg-open / start) when one exists; the address is printed
     either way. Ctrl+C stops the server.
   Options: --no-open (print the address only), --port N, --check (exit 0 once ready, leaving the server running detached: for scripts). */
const path = require("path"), net = require("net"), { spawn } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const VERSION = require("../package.json").version;
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i === -1 ? null : (args[i + 1] || true); };
const HOST = process.env.HOST || "127.0.0.1";
const wantPort = Number(opt("--port") || process.env.PORT || 3123);
const noOpen = args.includes("--no-open");
const detach = args.includes("--check");
const urlFor = p => "http://" + (HOST === "0.0.0.0" ? "localhost" : HOST) + ":" + p;

/* What answers on a port: null (nothing), {foreign:true} (some other program), or Deflate Lens's health document. */
async function health(port) {
  try { const r = await fetch(urlFor(port) + "/api/health", { signal: AbortSignal.timeout(1500) }); if (!r.ok) return { foreign: true }; const j = await r.json(); return j && j.ok && j.app === "deflate-lens" && j.version ? j : { foreign: true }; } catch (e) { return null; }
}
const myDataDir = path.resolve(path.join(__dirname, ".."), process.env.DATA_DIR || "data");
function sameInstallation(h) { return h.version === VERSION && path.resolve(String(h.dataDir || "")) === myDataDir; }
function portFree(port) {
  return new Promise(res => { const s = net.createServer(); s.once("error", () => res(false)); s.listen(port, HOST, () => s.close(() => res(true))); });
}
function openBrowser(url) {
  if (noOpen) return false;
  const cmd = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try { const c = spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }); c.on("error", () => {}); c.unref(); return true; } catch (e) { return false; }
}

(async () => {
  console.log("\nDeflate Lens launcher " + VERSION);
  const running = await health(wantPort);
  if (running && !running.foreign && sameInstallation(running)) {
    console.log("  Already running at " + urlFor(wantPort) + " (this installation, version " + running.version + ", model " + (running.ai ? running.ai.model : "none") + "). Nothing new was started.");
    if (openBrowser(urlFor(wantPort))) console.log("  Opened it in your browser."); else console.log("  Open that address in your browser.");
    process.exit(0);
  }
  if (running && !running.foreign) console.log("  A different Deflate Lens is answering on port " + wantPort + " (version " + running.version + ", data folder " + running.dataDir + "); this installation (version " + VERSION + ", data folder " + myDataDir + ") will use the next free port.");
  else if (running && running.foreign) console.log("  Port " + wantPort + " is answering, but it is not Deflate Lens.");
  let port = wantPort;
  if (!(await portFree(port))) {
    let found = null;
    for (let p = wantPort + 1; p <= wantPort + 20; p++) if (await portFree(p)) { found = p; break; }
    if (!found) { console.error("  Port " + wantPort + " is in use by another program and no free port was found between " + (wantPort + 1) + " and " + (wantPort + 20) + ". Stop the other program or run:  npm run launch -- --port 4000"); process.exit(1); }
    console.log("  Port " + wantPort + " is in use by another program (not Deflate Lens). Using port " + found + " instead.");
    port = found;
  }
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server", "index.js")], { cwd: path.join(__dirname, ".."), env: Object.assign({}, process.env, { PORT: String(port) }), stdio: detach ? "ignore" : "inherit", detached: detach });
  let exited = null; child.on("exit", (code, sig) => { exited = { code, sig }; });
  const t0 = Date.now(); let h = null;
  while (Date.now() - t0 < 20000) { if (exited) break; h = await health(port); if (h && !h.foreign) break; h = null; await new Promise(r => setTimeout(r, 300)); }
  if (!h) { console.error("\n  The server did not answer within 20 seconds" + (exited ? " (it exited with code " + exited.code + ")" : "") + ". See the lines above for the reason; the usual ones are a missing dependency (run  npm run setup ) or a bad .env line."); if (!exited) child.kill("SIGINT"); process.exit(1); }
  const url = urlFor(port);
  console.log("\n  Ready and answering at " + url + "  (version " + h.version + ", model " + (h.ai ? h.ai.model + (h.ai.mock ? " MOCK" : "") : "none: source search ready; analysis asks for a key") + ")");
  if (openBrowser(url)) console.log("  Opened it in your browser. If no window appeared, open that address yourself."); else console.log("  Open that address in your browser.");
  if (detach) { console.log("  Left running (--check), server pid " + child.pid + "."); child.unref(); process.exit(0); }
  console.log("  Stop with Ctrl+C.\n");
  const stop = () => { if (!exited) child.kill("SIGINT"); setTimeout(() => process.exit(0), 1500); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  child.on("exit", code => process.exit(code || 0));
})();
