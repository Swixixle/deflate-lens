"use strict";
/* Background jobs for work that outlasts an HTTP request (a transcript chain that may transcribe an hour of audio;
   an npm install). Each job keeps its steps and progress in memory for polling, can be stopped, and writes its result
   to data/jobs/<id>.json when it finishes, so a page refresh or a server restart does not lose forty minutes of
   transcription. Jobs are never run twice: the page starts one, polls it, and takes the result. */
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

function createJobs({ dataDir }) {
  const dir = path.join(dataDir, "jobs");
  const jobs = new Map();
  const view = (j, state) => ({ id: j.id, kind: j.kind, state: state || j.state, startedAt: j.startedAt, finishedAt: j.finishedAt || "", input: j.input, steps: j.steps, progress: j.progress || null, result: (state || j.state) === "done" ? j.result : null, error: j.error || null });
  async function persist(v) { try { await fs.mkdir(dir, { recursive: true }); const tmp = path.join(dir, v.id + ".tmp"); await fs.writeFile(tmp, JSON.stringify(v, null, 2)); await fs.rename(tmp, path.join(dir, v.id + ".json")); } catch (e) { /* a job's result is also returned to the page; failing to persist it is not fatal */ } }
  function start(kind, input, runner) {
    const ctl = new AbortController();
    const j = { id: "job" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"), kind, input: input || null, state: "running", startedAt: new Date().toISOString(), steps: [], progress: null, result: null, error: null, ctl };
    jobs.set(j.id, j);
    const ctx = {
      signal: ctl.signal,
      step: (name, note) => { j.steps.push({ at: new Date().toISOString(), name, note: String(note || "") }); if (j.steps.length > 200) j.steps.splice(0, j.steps.length - 200); },
      progress: p => { j.progress = Object.assign({ at: new Date().toISOString() }, p || {}); },
    };
    // the result is on disk before the job reports itself finished, so a poll that sees "done" can rely on the file
    const finish = async (state, result, error) => { if (ctl.signal.aborted) { state = "cancelled"; result = null; } j.result = result; if (error) j.error = error; j.finishedAt = new Date().toISOString(); await persist(view(j, state)); j.state = state; evict(); };
    Promise.resolve().then(() => runner(ctx)).then(result => finish("done", result, null), e => finish(ctl.signal.aborted || (e && e.code === "cancelled") ? "cancelled" : "error", null, { message: String(e && e.message || e), code: e && e.code || "" }));
    return view(j);
  }
  /* Finished jobs stay in memory only briefly; their files remain on disk and `get` reads them from there. */
  function evict() { const done = Array.from(jobs.values()).filter(x => x.state !== "running"); if (done.length > 50) done.sort((a, b) => (a.finishedAt || "").localeCompare(b.finishedAt || "")).slice(0, done.length - 50).forEach(x => jobs.delete(x.id)); }
  async function get(id) {
    if (!/^[A-Za-z0-9]+$/.test(String(id || ""))) return null;
    const j = jobs.get(id); if (j) return view(j);
    try { return JSON.parse(await fs.readFile(path.join(dir, id + ".json"), "utf8")); } catch (e) { return null; }
  }
  function cancel(id) { const j = jobs.get(id); if (!j) return false; if (j.state === "running") { j.error = { message: "stopped by the person", code: "cancelled" }; j.ctl.abort(); } return true; }
  function running(kind) { return Array.from(jobs.values()).filter(j => j.state === "running" && (!kind || j.kind === kind)).map(view); }
  return { start, get, cancel, running, dir };
}

module.exports = { createJobs };
