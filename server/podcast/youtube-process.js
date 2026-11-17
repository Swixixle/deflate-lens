"use strict";
/* The subprocess boundary owns termination, output bounds and the on-disk download guard. */
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const OUTPUT_LIMIT = 64 * 1024;

function cancelled() { return Object.assign(new Error("YouTube retrieval stopped"), { name: "AbortError", code: "youtube_audio_cancelled" }); }
function checkSignal(signal) { if (signal && signal.aborted) throw cancelled(); }
function redact(message) {
  return String(message || "").slice(-OUTPUT_LIMIT)
    .replace(/https?:\/\/[^\s<>"']+/gi, "[URL omitted]")
    .replace(/^(?:.*\b(?:cookie|authorization|password|secret|token)\s*[:=].*)$/gim, "[private diagnostic omitted]")
    .replace(/(?:\/Users\/|\/home\/)[^\s:"']+/g, "[local path omitted]");
}
function run(cmd, args, opts = {}) {
  return new Promise(resolve => {
    let out = "", err = "", child, finished = false, stopping = false, errorCode = "", forcedError = "", killTimer, guardBusy = false;
    const signal = opts.signal, timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : 120000;
    let timer, guard;
    const done = code => {
      if (finished) return; finished = true;
      clearTimeout(timer); clearTimeout(killTimer); clearInterval(guard);
      if (signal) signal.removeEventListener("abort", abort);
      resolve({ code: errorCode ? -1 : code, out, err: forcedError || redact(err), errorCode });
    };
    const kill = name => {
      try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, name); else child.kill(name); } catch (_) {}
    };
    const stop = (code, message) => {
      if (finished || stopping) return; stopping = true; errorCode = code; forcedError = message;
      if (!child) return done(-1);
      kill("SIGTERM"); killTimer = setTimeout(() => kill("SIGKILL"), 1000);
    };
    const abort = () => stop("youtube_audio_cancelled", "YouTube retrieval stopped");
    if (signal && signal.aborted) return abort();
    try {
      child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"], shell: false, detached: process.platform !== "win32" });
    } catch (e) { err = e.message; return done(-1); }
    if (signal) signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => stop("youtube_audio_timeout", "YouTube retrieval timed out"), timeoutMs);
    const append = (old, chunk) => (old + chunk.toString()).slice(-OUTPUT_LIMIT);
    const progressTail = { out: "", err: "" };
    const progress = (chunk, stream, final = false) => {
      const text = progressTail[stream] + String(chunk || ""), lines = text.split(/[\r\n]/);
      progressTail[stream] = final ? "" : lines.pop().slice(-256);
      // yt-dlp normally writes progress to stderr; only the numeric template crosses this boundary.
      for (const line of lines) for (const match of line.matchAll(/__DEFLATE_PROGRESS__(\d+)(?:\s+(\d+|NA))?/g)) {
        const bytes = Number(match[1]), total = Number(match[2]) || 0;
        if (!Number.isSafeInteger(bytes) || !Number.isSafeInteger(total)) continue;
        if (opts.maxBytes && bytes > opts.maxBytes) stop("youtube_audio_too_large", "the retrieved file exceeds the allowed size");
        if (opts.onProgress) { try { opts.onProgress(bytes, total); } catch (_) {} }
      }
    };
    child.stdout.on("data", chunk => { out = append(out, chunk); progress(chunk, "out"); });
    child.stderr.on("data", chunk => { err = append(err, chunk); progress(chunk, "err"); });
    child.on("error", e => { err = e.message; done(-1); });
    child.on("close", code => { progress("", "out", true); progress("", "err", true); if (stopping) kill("SIGKILL"); done(code); });
    if (opts.watchDir && opts.maxBytes) {
      const inspect = async () => {
        if (guardBusy || finished || stopping) return; guardBusy = true;
        try {
          let total = 0;
          for (const entry of await fs.readdir(opts.watchDir, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) { stop("youtube_audio_unavailable", "YouTube retrieval produced an unsafe file"); break; }
            if (!entry.isFile()) continue;
            let stat; try { stat = await fs.stat(path.join(opts.watchDir, entry.name)); } catch (e) { if (e.code === "ENOENT") continue; throw e; }
            total += stat.size;
            if (stat.size > opts.maxBytes || total > opts.maxBytes * 2 + 8 * 1024 * 1024) { stop("youtube_audio_too_large", "the retrieved file exceeds the allowed size"); break; }
          }
        } catch (e) { if (e.code !== "ENOENT") stop("youtube_audio_unavailable", "the downloaded audio could not be inspected"); }
        finally { guardBusy = false; }
      };
      guard = setInterval(inspect, 100); inspect();
    }
  });
}
async function execute(runFn, cmd, args, opts = {}) {
  checkSignal(opts.signal);
  const r = await (runFn || run)(cmd, args, opts);
  checkSignal(opts.signal);
  if (r.errorCode === "youtube_audio_cancelled") throw cancelled();
  if (r.errorCode) throw Object.assign(new Error(redact(r.err)), { code: r.errorCode });
  return Object.assign({}, r, { err: redact(r.err) });
}
module.exports = { run, execute, redact, checkSignal, cancelled, OUTPUT_LIMIT };
