"use strict";
/* YouTube captions. Two readers, tried in order:
     1. yt-dlp, when it is installed on this computer (brew install yt-dlp). It is maintained separately and writes
        caption files only. YouTube can still refuse its requests.
     2. A built-in reader that asks YouTube's own player endpoint for the caption track list and fetches the English
        track as json3. It needs no install, but YouTube sometimes answers it with "sign in to confirm you're not a bot"
        and it can break when YouTube changes its site. Every failure is reported as what it is.
   Audio retrieval is a separate bounded operation used only when the caller has selected a transcription engine.
   Chrome access is opt-in. Automatic captions have no speaker labels; the attribution stage is told so. */
const { createReadStream } = require("node:fs");
const crypto = require("node:crypto");
const { run, execute, redact, checkSignal } = require("./youtube-process");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { transcriptToText } = require("./transcripts");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
// Classify an explicit challenge, not every caption failure. Missing captions, timeouts and extractor failures do
// not establish a sign-in requirement. Browser credentials are used only when explicitly enabled.
function accessBlocked(message, status) {
  return status === "LOGIN_REQUIRED" || /\bsign[ -]?in to\b|\blog[ -]?in (?:is )?required\b|\bconfirm\b[^\n]{0,80}\bnot a bot\b|\bauthentication (?:is )?required\b/i.test(String(message || ""));
}
function videoId(url) {
  let u; try {u=new URL(String(url||""));}catch(e){return "";}
  if(!/^https?:$/.test(u.protocol))return "";
  const host=u.hostname.toLowerCase(), short=host==="youtu.be"||host==="www.youtu.be";
  if(!short && !/^(www\.|m\.|music\.)?youtube\.com$/.test(host))return "";
  const id=short ? u.pathname.slice(1) : u.pathname==="/watch" ? u.searchParams.get("v") : (/^\/(?:live|shorts|embed)\/([^/]+)\/?$/.exec(u.pathname)||[])[1];
  return /^[A-Za-z0-9_-]{11}$/.test(id||"")?id:"";
}

async function fetchText(fetchFn, url, opts, timeoutMs, signal) {
  checkSignal(signal);
  const ctl = new AbortController(), abort = () => ctl.abort();
  const t = setTimeout(abort, timeoutMs || 30000);
  if (signal) signal.addEventListener("abort", abort, { once: true });
  try {
    const res = await fetchFn(url, Object.assign({ headers: { "User-Agent": UA } }, opts || {}, { signal: ctl.signal }));
    const text = await res.text(); checkSignal(signal); return { status: res.status, text };
  } finally { clearTimeout(t); if (signal) signal.removeEventListener("abort", abort); }
}
async function oembed(fetchFn, id, signal) {
  try { const r = await fetchText(fetchFn, "https://www.youtube.com/oembed?url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id) + "&format=json", null, 15000, signal); if (r.status !== 200) return null; const d = JSON.parse(r.text); return { title: safeMetadata(d.title, 1000), channel: safeMetadata(d.author_name, 1000) }; } catch (e) { checkSignal(signal); return null; }
}
function validId(id) { return typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id); }
function safeMetadata(value, limit = 6000) {
  return String(value || "").slice(0, limit).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/https?:\/\/[^\s<>"']+/gi, url => /googlevideo\.com|[?&](?:sig|signature|lsig|expire|token|cookie|key)=/i.test(url) ? "[private URL omitted]" : url);
}
function cookieArgs(env) { return env && env.YTDLP_COOKIES_BROWSER === "chrome" ? ["--cookies-from-browser", "chrome"] : []; }

/* Built-in: the player endpoint lists caption tracks; prefer a human-made English track over automatic captions. */
async function captionsBuiltin(fetchFn, id, language, signal) {
  if (!validId(id)) throw new Error("not a YouTube video id");
  checkSignal(signal);
  const lang = (language || "en").slice(0, 5);
  const body = JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30, hl: lang } }, videoId: id, contentCheckOk: true, racyCheckOk: true });
  const r = await fetchText(fetchFn, "https://www.youtube.com/youtubei/v1/player?prettyPrint=false", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip" }, body }, 25000, signal);
  let d; try { d = JSON.parse(r.text); } catch (e) { throw new Error("YouTube answered with something other than JSON (HTTP " + r.status + ")"); }
  const ps = d.playabilityStatus || {};
  if (ps.status && ps.status !== "OK") throw Object.assign(new Error("YouTube refused the caption list: " + (ps.reason || ps.status)), { code: accessBlocked(ps.reason, ps.status) ? "youtube_access_blocked" : "youtube_captions_unavailable" });
  const tracks = ((d.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks || [];
  if (!tracks.length) throw new Error("this video has no captions, automatic or otherwise");
  const pick = tracks.find(t => String(t.languageCode || "").startsWith(lang) && t.kind !== "asr") || tracks.find(t => String(t.languageCode || "").startsWith(lang)) || tracks[0];
  let trackHost = ""; try { trackHost = new URL(pick.baseUrl).hostname; } catch (e) {}
  if (!/(^|\.)youtube\.com$|(^|\.)googlevideo\.com$/.test(trackHost)) throw new Error("the caption track address is not on YouTube (" + trackHost + ")");
  const c = await fetchText(fetchFn, pick.baseUrl + (pick.baseUrl.includes("fmt=") ? "" : "&fmt=json3"), null, 25000, signal);
  if (c.status !== 200) throw new Error("caption track fetch failed: HTTP " + c.status);
  const out = transcriptToText(c.text, "application/json", "json3");
  // (0.15.1) the video's own description and channel, from the same answer: where a guest is credited, and the listing
  // the speakers are named from (before, a video link was listed by its title and channel only)
  const vd = d.videoDetails || {};
  return Object.assign(out, { reader: "built-in", track: { language: pick.languageCode || "", automatic: pick.kind === "asr", name: pick.name && pick.name.simpleText || "" }, description: safeMetadata(vd.shortDescription), author: safeMetadata(vd.author, 1000) });
}

/* yt-dlp: write the English subtitle (manual first, automatic otherwise) as VTT into a temp folder. */
function ytdlpPath(env) { return (env && env.YTDLP_PATH) || process.env.YTDLP_PATH || "yt-dlp"; }
async function ytdlpAvailable(env, runFn, signal) {
  const r = await execute(runFn, ytdlpPath(env), ["--version", "--ignore-config"], { signal, timeoutMs: 15000 });
  return r.code === 0 ? String(r.out || "").trim().slice(0, 200) : "";
}
async function captionsYtdlp(id, language, env, runFn, signal) {
  if (!validId(id)) throw new Error("not a YouTube video id");
  checkSignal(signal);
  const lang = (language || "en").slice(0, 5);
  // Published captions first, YouTube's automatic ones only if there are none; two runs, so the result says truthfully
  // which kind it is (yt-dlp names both kinds the same way). json3 first: YouTube's own format has each word once.
  // Its VTT rolls (every line two or three times); that is handled too, as the fallback when json3 is not offered.
  let last = null;
  for (const kind of ["--write-subs", "--write-auto-subs"]) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-yt-"));
    try {
      const r = await execute(runFn, ytdlpPath(env), ["--ignore-config", ...cookieArgs(env), "--skip-download", kind, "--write-info-json", "--sub-langs", lang + ".*," + lang, "--sub-format", "json3/vtt", "--no-playlist", "--no-warnings", "-o", path.join(dir, "%(id)s"), "https://www.youtube.com/watch?v=" + id], { cwd: dir, signal, timeoutMs: 120000, watchDir: dir, maxBytes: 20 * 1024 * 1024 });
      last = r;
      checkSignal(signal);
      const all = await fs.readdir(dir);
      const files = all.filter(f => /\.(json3|vtt)$/i.test(f)).sort((a, b) => a.length - b.length);
      if (!files.length) {
        // An explicit challenge applies before a caption track can be selected. Trying automatic captions with the
        // same request cannot settle it; retain the diagnostic and let the independent built-in reader try next.
        if (r.code !== 0 && accessBlocked(r.err)) break;
        continue;
      }
      const file = files.find(f => /\.json3$/i.test(f)) || files[0];
      const json = /\.json3$/i.test(file);
      await boundedFile(path.join(dir, file), 20 * 1024 * 1024);
      const out = transcriptToText(await fs.readFile(path.join(dir, file), "utf8"), json ? "application/json" : "text/vtt", file);
      // (0.15.1) the video's description and channel, from the information file yt-dlp writes beside the captions
      let info = {}; const inf = all.find(f => /\.info\.json$/i.test(f));
      if (inf) { await boundedFile(path.join(dir, inf), 8 * 1024 * 1024); try { info = JSON.parse(await fs.readFile(path.join(dir, inf), "utf8")) || {}; } catch (e) { info = {}; } }
      return Object.assign(out, { reader: "yt-dlp", track: { language: lang, automatic: kind === "--write-auto-subs", name: file }, description: safeMetadata(info.description), author: safeMetadata(info.channel || info.uploader, 1000) });
    } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }
  throw Object.assign(new Error("yt-dlp wrote no caption file" + (last && last.code !== 0 ? " (exit " + last.code + ": " + String(last.err).trim() + ")" : "; this video may have no captions")), { code: last && last.code !== 0 && accessBlocked(last.err) ? "youtube_access_blocked" : "youtube_captions_unavailable" });
}

/* The captions for a video, by whichever reader works, with what each one said when it did not. */
async function captions({ url, id, language, fetch: fetchFn, env, run: runFn, signal }) {
  const vid = id || videoId(url); if (!validId(vid)) throw new Error("not a YouTube video link");
  checkSignal(signal);
  const meta = await oembed(fetchFn || require("./public-fetch").publicFetch, vid, signal);
  const tried = [];
  if (await ytdlpAvailable(env, runFn, signal)) { try { const r = await captionsYtdlp(vid, language, env, runFn, signal); return Object.assign(r, { id: vid, title: meta && meta.title || "", channel: meta && meta.channel || r.author || "", tried }); } catch (e) { checkSignal(signal); tried.push({ reader: "yt-dlp", code: e.code || "youtube_captions_unavailable", error: redact(e.message) }); } }
  else tried.push({ reader: "yt-dlp", code: "reader_unavailable", error: "not installed (brew install yt-dlp adds another caption reader; YouTube may still refuse it)" });
  try { const r = await captionsBuiltin(fetchFn || require("./public-fetch").publicFetch, vid, language, signal); return Object.assign(r, { id: vid, title: meta && meta.title || "", channel: meta && meta.channel || r.author || "", tried }); } catch (e) { checkSignal(signal); tried.push({ reader: "built-in", code: e.code || "youtube_captions_unavailable", error: redact(e.message) }); }
  const code = tried.some(t => t.code === "youtube_access_blocked") ? "youtube_access_blocked" : "youtube_captions_unavailable";
  throw Object.assign(new Error("no captions could be read: " + tried.map(t => t.reader + ": " + t.error).join("; ")), { code, tried, title: meta && meta.title || "", channel: meta && meta.channel || "" });
}

/* Candidate videos for an episode, by a YouTube search through yt-dlp (the built-in search page is not attempted:
   YouTube renders its results with scripts). Returns [{id, title, channel, duration}] or null when yt-dlp is absent.
   The caller decides whether a result is the episode; a title alone is not enough (see resolve.js). */
async function searchVideo(query, env, runFn) {
  if (!(await ytdlpAvailable(env, runFn))) return null;
  const r = await (runFn || run)(ytdlpPath(env), ["--ignore-config", "--flat-playlist", "--no-warnings", "--print", "%(id)s\t%(title)s\t%(channel)s\t%(duration)s", "ytsearch5:" + query]);
  return String(r.out || "").trim().split("\n").filter(Boolean).map(l => { const [id, title, channel, duration] = l.split("\t"); return { id, title: title || "", channel: channel || "", duration: Number(duration) }; }).filter(x => /^[A-Za-z0-9_-]{11}$/.test(x.id));
}

const MAX_AUDIO_BYTES = 800 * 1024 * 1024;
const AUDIO_TIMEOUT_MS = 10 * 60 * 1000;
const AUDIO_PREFIX = "deflate-youtube-audio-", OWNER_FILE = ".deflate-audio-owner";
const OWNER_CONTENT = "Deflate Lens YouTube temporary audio v1\n";
async function ownedTempRoot(tempRoot) {
  const root = tempRoot || path.join(os.tmpdir(), "deflate-youtube-audio");
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("the audio temporary folder is not a directory");
  return root;
}
async function isOwned(dir) {
  try {
    const st = await fs.lstat(dir), mark = await fs.lstat(path.join(dir, OWNER_FILE));
    return st.isDirectory() && !st.isSymbolicLink() && mark.isFile() && !mark.isSymbolicLink() && mark.size === Buffer.byteLength(OWNER_CONTENT) && await fs.readFile(path.join(dir, OWNER_FILE), "utf8") === OWNER_CONTENT;
  } catch (_) { return false; }
}
// Call only once at application startup, before accepting jobs. Never follows links or clears an unrelated folder.
async function cleanupAudioTemps(tempRoot) {
  const root = await ownedTempRoot(tempRoot); let removed = 0;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !new RegExp("^" + AUDIO_PREFIX + "[A-Za-z0-9]{6}$").test(entry.name)) continue;
    const dir = path.join(root, entry.name);
    if (await isOwned(dir)) { await fs.rm(dir, { recursive: true, force: true }); removed++; }
  }
  return removed;
}
async function boundedFile(file, limit) {
  const st = await fs.lstat(file);
  if (!st.isFile() || st.isSymbolicLink()) throw Object.assign(new Error("YouTube retrieval produced an unsafe file"), { code: "youtube_audio_unavailable" });
  if (st.size > limit) throw Object.assign(new Error("the retrieved file exceeds the allowed size"), { code: "youtube_audio_too_large" });
  return st;
}
async function audio({ id, env = {}, run: runFn, signal, onProgress, format = "native", tempRoot } = {}) {
  if (!validId(id)) throw Object.assign(new Error("not a YouTube video id"), { code: "youtube_audio_unavailable" });
  if (!["native", "mp3"].includes(format)) throw Object.assign(new Error("unsupported YouTube audio format"), { code: "youtube_audio_unavailable" });
  checkSignal(signal);
  if (!(await ytdlpAvailable(env, runFn, signal))) throw Object.assign(new Error("yt-dlp is not installed; install it to retrieve this video's audio"), { code: "reader_unavailable" });
  const ffmpeg = env.FFMPEG_PATH || "ffmpeg";
  if (format === "mp3") {
    const probe = await execute(runFn, ffmpeg, ["-version"], { signal, timeoutMs: 15000 });
    if (probe.code !== 0) throw Object.assign(new Error("Local transcription needs an MP3. Install ffmpeg to convert this video's audio on this computer."), { code: "youtube_ffmpeg_unavailable" });
  }
  const root = await ownedTempRoot(tempRoot), dir = await fs.mkdtemp(path.join(root, AUDIO_PREFIX));
  await fs.chmod(dir, 0o700);
  await fs.writeFile(path.join(dir, OWNER_FILE), OWNER_CONTENT, { mode: 0o600 });
  const cleanup = async () => { if (await isOwned(dir)) await fs.rm(dir, { recursive: true, force: true }); };
  try {
    const args = ["--ignore-config", "--no-playlist", "--no-warnings", "--no-cache-dir", ...cookieArgs(env),
      "--socket-timeout", "20", "--retries", "2", "--fragment-retries", "2", "--max-filesize", String(MAX_AUDIO_BYTES),
      "--newline", "--progress-template", "download:__DEFLATE_PROGRESS__%(progress.downloaded_bytes)s %(progress.total_bytes)s",
      "--write-info-json", "-f", "bestaudio[ext=m4a]/bestaudio[ext=webm]", "-o", path.join(dir, "audio.%(ext)s")];
    if (format === "native") args.push("--fixup", "never");
    if (format === "mp3") args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", "5", "--ffmpeg-location", ffmpeg);
    args.push("https://www.youtube.com/watch?v=" + id);
    const report = (bytes, totalBytes) => { if (onProgress) onProgress({ stage: "downloading", bytes, totalBytes, percent: totalBytes > 0 ? Math.min(100, Math.round(bytes * 100 / totalBytes)) : null }); };
    const result = await execute(runFn, ytdlpPath(env), args, { cwd: dir, signal, onProgress: report, timeoutMs: AUDIO_TIMEOUT_MS, watchDir: dir, maxBytes: MAX_AUDIO_BYTES });
    checkSignal(signal);
    if (result.code !== 0) {
      const tooLarge = /larger than max-filesize|exceeds? (?:the )?(?:maximum|max).*size|larger than.*(?:MB|MiB)/i.test(result.err);
      const ffmpegMissing = /ffmpeg.*(?:not found|not installed|could not be found)|(?:not found|not installed).*ffmpeg/i.test(result.err);
      throw Object.assign(new Error("YouTube audio retrieval failed" + (result.err ? ": " + redact(result.err) : " (exit " + result.code + ")")), { code: tooLarge ? "youtube_audio_too_large" : ffmpegMissing ? "youtube_ffmpeg_unavailable" : accessBlocked(result.err) ? "youtube_access_blocked" : "youtube_audio_unavailable" });
    }
    const all = await fs.readdir(dir);
    const candidates = format === "mp3" ? ["audio.mp3"] : ["audio.m4a", "audio.webm"];
    const name = candidates.find(f => all.includes(f));
    if (!name) throw Object.assign(new Error("yt-dlp did not produce the requested audio file"), { code: "youtube_audio_unavailable" });
    const file = path.join(dir, name), st = await boundedFile(file, MAX_AUDIO_BYTES);
    if (!st.size) throw Object.assign(new Error("yt-dlp produced an empty audio file"), { code: "youtube_audio_unavailable" });
    // Only these listing fields survive; the info JSON also holds expiring stream URLs and stays in the private temp.
    let info = {};
    if (all.includes("audio.info.json")) {
      await boundedFile(path.join(dir, "audio.info.json"), 8 * 1024 * 1024);
      try { const parsed = JSON.parse(await fs.readFile(path.join(dir, "audio.info.json"), "utf8")); if (parsed && typeof parsed === "object") info = parsed; } catch (_) {}
    }
    const digest = crypto.createHash("sha256");
    for await (const chunk of createReadStream(file)) { checkSignal(signal); digest.update(chunk); }
    checkSignal(signal);
    const ext = path.extname(name).slice(1), duration = Number(info.duration);
    return { file, type: ext === "mp3" ? "audio/mpeg" : ext === "m4a" ? "audio/mp4" : "audio/webm", format: ext,
      bytes: st.size, sha256: digest.digest("hex"), title: safeMetadata(info.title, 1000), description: safeMetadata(info.description),
      channel: safeMetadata(info.channel || info.uploader, 1000), durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : 0, cleanup };
  } catch (e) { await cleanup(); throw e; }
}

module.exports = { captions, audio, cleanupAudioTemps, searchVideo, videoId, oembed, captionsBuiltin, captionsYtdlp, ytdlpAvailable, run, MAX_AUDIO_BYTES, AUDIO_TIMEOUT_MS };
