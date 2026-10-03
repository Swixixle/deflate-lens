"use strict";
/* Speech-to-text for an episode's audio, the last step of the transcript chain. Two engines, chosen once:

   LOCAL  Whisper in pure JavaScript (Transformers.js on ONNX Runtime) with an MP3 decoder in WebAssembly. No install
          beyond npm, no key, nothing leaves the computer. It is slow: measured 2026-10-03 on this build's Linux box,
          whisper-base.en transcribed 275 s of clear speech in 52 s (about five times faster than real time, so a
          three-hour episode is around forty minutes) with a 3.6% word error rate against the publisher's own
          transcript. No speaker labels. The packages (about 480 MB, mostly the runtime) live in
          data/local-transcription/, installed on request; the model (76 MB for base.en) is downloaded from Hugging
          Face on first use into data/local-transcription/models/. Audio is decoded and transcribed in five-minute
          segments cut at quiet points, so a long episode never sits in memory whole.

   CLOUD  Deepgram's prerecorded API, given the audio file's address (nothing is downloaded here): minutes per episode,
          speaker labels, billed to a Deepgram key the person adds once. The audio goes to Deepgram.

   Either engine's output is a document with a stated origin: engine, model, duration, and what was and was not
   available (speakers). Neither is ever called without a person having chosen it. */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");
const { cuesToText } = require("./transcripts");

const LOCAL_PACKAGES = { "@huggingface/transformers": "4.3.0", "mpg123-decoder": "1.0.3" };
const DEFAULT_MODEL = "onnx-community/whisper-base.en";
const SEGMENT_SECONDS = 300, CUT_WINDOW_SECONDS = 20, RATE = 16000;
const MAX_AUDIO_BYTES = 800 * 1024 * 1024;

/* ---------------- local ---------------- */
function localEngine({ dataDir, env }) {
  const dir = path.join(dataDir, "local-transcription");
  const nm = path.join(dir, "node_modules");
  const model = (env && env.TRANSCRIBE_MODEL) || DEFAULT_MODEL;
  function installed() { return fs.existsSync(path.join(nm, "@huggingface", "transformers", "package.json")) && fs.existsSync(path.join(nm, "mpg123-decoder", "package.json")) && fs.existsSync(path.join(nm, "onnxruntime-node", "package.json")); }
  function modelCached() { try { return fs.readdirSync(path.join(dir, "models", ...model.split("/"), "onnx")).some(f => /\.onnx$/.test(f)); } catch (e) { return false; } }
  /* npm install into data/local-transcription (its own package.json; the app's dependencies are untouched). Scripts are
     skipped: the runtime's binaries for this platform are inside the package, and its install script only fetches
     optional GPU builds. */
  async function install({ onLog, signal } = {}) {
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "deflate-lens-local-transcription", private: true, description: "Optional speech-to-text packages for Deflate Lens; installed by the app on request", dependencies: LOCAL_PACKAGES }, null, 2) + "\n");
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const args = ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"];
    const code = await new Promise((resolve, reject) => {
      let child; try { child = spawn(npm, args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" }); } catch (e) { return reject(e); }
      child.stdout.on("data", d => onLog && onLog(String(d))); child.stderr.on("data", d => onLog && onLog(String(d)));
      child.on("error", reject); child.on("close", resolve);
      if (signal) signal.addEventListener("abort", () => { try { child.kill(); } catch (e) {} });
    });
    if (code !== 0) throw new Error("npm install exited with " + code + "; see the lines above (usual causes: no network, or a proxy blocking registry.npmjs.org)");
    if (!installed()) throw new Error("the packages did not install completely");
    return { dir, packages: LOCAL_PACKAGES };
  }
  async function load() {
    if (!installed()) { const e = new Error("local transcription is not installed"); e.code = "local_not_installed"; throw e; }
    const tf = await import(pathToFileURL(require.resolve("@huggingface/transformers", { paths: [dir] })).href);
    const { MPEGDecoder } = await import(pathToFileURL(require.resolve("mpg123-decoder", { paths: [dir] })).href);
    tf.env.cacheDir = path.join(dir, "models"); tf.env.allowLocalModels = true;
    return { tf, MPEGDecoder };
  }
  /* Download to a temp file (streamed, capped), decode in chunks, transcribe in segments, report progress. */
  async function transcribe({ audioUrl, file, durationSeconds, fetch: fetchFn, onProgress, signal }) {
    const { tf, MPEGDecoder } = await load();
    const report = (stage, p) => { if (onProgress) onProgress(Object.assign({ stage }, p || {})); };
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "deflate-audio-"));
    const audioFile = file || path.join(tmpDir, "audio.mp3");
    try {
      if (!file) await download(audioUrl, audioFile, fetchFn || require("./public-fetch").publicFetch, (got, total) => report("downloading", { bytes: got, totalBytes: total, percent: total ? Math.round(100 * got / total) : null }), signal);
      const bytes = (await fsp.stat(audioFile)).size;
      if (!durationSeconds) durationSeconds = Math.round(bytes * 8 / 128000); // a guess at 128 kbps, replaced by the decoded length as it goes
      report("loading model", { model, cached: modelCached() });
      let lastPct = -10;
      const asr = await tf.pipeline("automatic-speech-recognition", model, { dtype: "q8", progress_callback: p => { if (p && p.status === "progress" && /\.onnx$/.test(p.file || "") && !modelCached() && Math.round(p.progress || 0) >= lastPct + 10) { lastPct = Math.round(p.progress || 0); report("downloading model", { file: p.file, percent: lastPct }); } } });
      const dec = new MPEGDecoder(); await dec.ready;
      const fh = await fsp.open(audioFile, "r");
      const chunk = Buffer.alloc(512 * 1024);
      let seg = [], segLen = 0, done = 0, pieces = [], decodedRate = 0, lastReport = 0;
      const flushSegment = async (final) => {
        if (!segLen) return;
        let pcm = concat(seg, segLen); seg = []; segLen = 0;
        let carry = null;
        if (!final) { const cut = quietestCut(pcm); if (cut > 0 && cut < pcm.length) { carry = pcm.subarray(cut); pcm = pcm.subarray(0, cut); } }
        if (signal && signal.aborted) throw abortError();
        const out = await asr(pcm, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true }); // timestamps are what lets the library stitch the 30-second windows; without them text is dropped (measured)
        const text = String(out && out.text || "").trim(); if (text) pieces.push(text);
        done += pcm.length / RATE;
        report("transcribing", { secondsDone: Math.round(done), secondsTotal: Math.max(durationSeconds || 0, Math.round(done)), percent: durationSeconds ? Math.min(99, Math.round(100 * done / durationSeconds)) : null });
        if (carry) { seg.push(carry); segLen = carry.length; }
      };
      for (;;) {
        if (signal && signal.aborted) throw abortError();
        const { bytesRead } = await fh.read(chunk, 0, chunk.length, null);
        if (!bytesRead) break;
        const r = dec.decode(new Uint8Array(chunk.subarray(0, bytesRead)));
        if (r.samplesDecoded) {
          decodedRate = r.sampleRate || decodedRate;
          const mono = toMono16k(r.channelData, r.sampleRate);
          seg.push(mono); segLen += mono.length;
          const t = Date.now(); if (t - lastReport > 2000) { lastReport = t; report("decoding", { secondsDone: Math.round(done), secondsDecoded: Math.round(done + segLen / RATE) }); }
        }
        if (segLen >= SEGMENT_SECONDS * RATE) await flushSegment(false);
      }
      await fh.close(); dec.free && dec.free();
      await flushSegment(true);
      const cues = pieces.map(t => ({ speaker: "", text: t }));
      const conv = cuesToText(cues);
      return { text: conv.text, speakers: [], engine: "local", model, durationSeconds: Math.round(done), sampleRate: decodedRate, note: "automatic transcription on this computer (Whisper " + model.split("/").pop() + "); no speaker labels; expect some misheard words and names" };
    } finally { await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {}); }
  }
  return { name: "local", dir, model, installed, modelCached, install, transcribe, packages: LOCAL_PACKAGES };
}
/* Whisper's 30-second windows are stitched by the library and the seam sometimes repeats a run of words (measured:
   a 26-word phrase twice in a row). A run of six or more words that immediately repeats itself is kept once. */
function collapseStitchRepeats(text) {
  const toks = String(text || "").split(/\s+/).filter(Boolean);
  const norm = toks.map(t => t.toLowerCase().replace(/[^a-z0-9']+/g, ""));
  const out = []; let i = 0;
  while (i < toks.length) {
    let cut = 0;
    for (let n = 40; n >= 6; n--) {
      if (i + 2 * n > toks.length) continue;
      let same = true; for (let k = 0; k < n; k++) if (norm[i + k] !== norm[i + n + k] || !norm[i + k]) { same = false; break; }
      if (same) { cut = n; break; }
    }
    if (cut) { for (let k = 0; k < cut; k++) out.push(toks[i + k]); i += 2 * cut; } else { out.push(toks[i]); i++; }
  }
  return out.join(" ");
}
function abortError() { const e = new Error("stopped"); e.code = "cancelled"; return e; }
function concat(parts, len) { const out = new Float32Array(len); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }
/* Stereo to mono, any rate to 16 kHz (linear interpolation; speech recognition does not need better). */
function toMono16k(channelData, rate) {
  const n0 = channelData[0].length, ch = channelData.length;
  const mono = ch === 1 ? channelData[0] : new Float32Array(n0);
  if (ch > 1) for (let i = 0; i < n0; i++) { let s = 0; for (let c = 0; c < ch; c++) s += channelData[c][i]; mono[i] = s / ch; }
  if (rate === RATE) return Float32Array.from(mono);
  const ratio = rate / RATE, n = Math.floor(n0 / ratio), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i * ratio, j = Math.floor(x), f = x - j; out[i] = mono[j] * (1 - f) + (mono[j + 1] !== undefined ? mono[j + 1] : mono[j]) * f; }
  return out;
}
/* The start of the quietest half second in the last CUT_WINDOW_SECONDS of a segment, so a cut lands in a pause. */
function quietestCut(pcm) {
  const win = Math.floor(RATE / 2), from = Math.max(0, pcm.length - CUT_WINDOW_SECONDS * RATE);
  let best = pcm.length, bestE = Infinity;
  for (let s = from; s + win <= pcm.length; s += win / 2) { let e = 0; for (let i = s; i < s + win; i++) e += pcm[i] * pcm[i]; if (e < bestE) { bestE = e; best = s + win / 2; } }
  return best;
}
async function download(url, file, fetchFn, onProgress, signal) {
  const { isPrivateHost } = require("./resolve");
  let cur = String(url), res = null;
  for (let hop = 0; ; hop++) { // every hop checked: the audio address, and any address it redirects to, must be public
    const host = new URL(cur).hostname; if (isPrivateHost(host) || !/^https?:$/.test(new URL(cur).protocol)) throw new Error("the audio address is not a public http(s) address (" + host + ")");
    res = await fetchFn(cur, { redirect: "manual", signal, headers: { "User-Agent": "deflate-lens/0.9 (local transcript fetcher)" } });
    const loc = res.headers.get("location"); if ([301, 302, 303, 307, 308].includes(res.status) && loc) { if (hop >= 5) throw new Error("too many redirects"); cur = new URL(loc, cur).href; continue; } break;
  }
  if (res.status !== 200) throw new Error("audio download failed: HTTP " + res.status);
  const total = Number(res.headers.get("content-length")) || 0;
  if (total > MAX_AUDIO_BYTES) throw new Error("the audio file is larger than 800 MB");
  const out = fs.createWriteStream(file); let got = 0, last = 0;
  const reader = res.body.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; got += value.length; if (got > MAX_AUDIO_BYTES) throw new Error("the audio file is larger than 800 MB"); if (!out.write(value)) await new Promise(r => out.once("drain", r)); const t = Date.now(); if (t - last > 1000) { last = t; onProgress && onProgress(got, total); } }
  await new Promise((r, j) => { out.end(); out.on("finish", r); out.on("error", j); });
  onProgress && onProgress(got, total || got);
  return got;
}

/* ---------------- cloud (Deepgram) ---------------- */
function deepgramEngine({ apiKey, fetch: fetchFn, env }) {
  const model = (env && env.DEEPGRAM_MODEL) || "nova-3";
  return {
    name: "deepgram", model,
    configured() { return !!apiKey; },
    async transcribe({ audioUrl, signal, onProgress }) {
      if (!apiKey) { const e = new Error("no DEEPGRAM_API_KEY"); e.code = "cloud_not_configured"; throw e; }
      onProgress && onProgress({ stage: "transcribing (Deepgram)", percent: null });
      const url = "https://api.deepgram.com/v1/listen?model=" + encodeURIComponent(model) + "&smart_format=true&punctuate=true&diarize=true&utterances=true";
      const res = await (fetchFn || globalThis.fetch)(url, { method: "POST", signal, headers: { "Authorization": "Token " + apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ url: audioUrl }) });
      const text = await res.text();
      if (res.status !== 200) throw new Error("Deepgram answered HTTP " + res.status + ": " + text.replace(/\s+/g, " ").slice(0, 200));
      const d = JSON.parse(text);
      const utt = d.results && d.results.utterances || [];
      const cues = utt.map(u => ({ speaker: Number.isInteger(Number(u.speaker)) && u.speaker !== null && u.speaker !== undefined ? "SPEAKER " + (Number(u.speaker) + 1) : "", text: String(u.transcript || "").trim() })).filter(c => c.text);
      if (!cues.length) { const alt = d.results && d.results.channels && d.results.channels[0] && d.results.channels[0].alternatives && d.results.channels[0].alternatives[0]; if (alt && alt.transcript) cues.push({ speaker: "", text: alt.transcript }); }
      if (!cues.length) throw new Error("Deepgram returned no transcript");
      const conv = cuesToText(cues);
      const meta = d.metadata || {};
      return { text: conv.text, speakers: conv.speakers, engine: "deepgram", model: (meta.models && meta.models[0]) || model, requestId: meta.request_id || "", durationSeconds: Math.round(meta.duration || 0), note: "automatic transcription by Deepgram (" + model + "); speakers are numbered by voice, not named; expect some misheard words and names" };
    },
  };
}

module.exports = { localEngine, deepgramEngine, toMono16k, quietestCut, collapseStitchRepeats, LOCAL_PACKAGES, DEFAULT_MODEL };
