"use strict";
/* YouTube captions. Two readers, tried in order:
     1. yt-dlp, when it is installed on this computer (brew install yt-dlp). It is the maintained tool for this and
        survives YouTube's changes; it writes the caption file (VTT) and nothing else.
     2. A built-in reader that asks YouTube's own player endpoint for the caption track list and fetches the English
        track as json3. It needs no install, but YouTube sometimes answers it with "sign in to confirm you're not a bot"
        (seen from a datacenter address on 2026-10-03; home addresses usually pass), and it can break when YouTube
        changes its site. Every failure is reported as what it is.
   The title and channel come from YouTube's oEmbed endpoint, which is public and stable. Nothing is downloaded but
   captions. Automatic captions have no speaker labels; the attribution stage is told so. */
const { spawn } = require("child_process");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { transcriptToText } = require("./transcripts");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
function videoId(url) {
  let u; try {u=new URL(String(url||""));}catch(e){return "";}
  if(!/^https?:$/.test(u.protocol))return "";
  const host=u.hostname.toLowerCase(), short=host==="youtu.be"||host==="www.youtu.be";
  if(!short && !/^(www\.|m\.|music\.)?youtube\.com$/.test(host))return "";
  const id=short ? u.pathname.slice(1) : u.pathname==="/watch" ? u.searchParams.get("v") : (/^\/(?:live|shorts|embed)\/([^/]+)\/?$/.exec(u.pathname)||[])[1];
  return /^[A-Za-z0-9_-]{11}$/.test(id||"")?id:"";
}

async function fetchText(fetchFn, url, opts, timeoutMs) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs || 30000);
  try { const res = await fetchFn(url, Object.assign({ signal: ctl.signal, headers: { "User-Agent": UA } }, opts || {})); return { status: res.status, text: await res.text() }; } finally { clearTimeout(t); }
}
async function oembed(fetchFn, id) {
  try { const r = await fetchText(fetchFn, "https://www.youtube.com/oembed?url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id) + "&format=json", null, 15000); if (r.status !== 200) return null; const d = JSON.parse(r.text); return { title: String(d.title || ""), channel: String(d.author_name || "") }; } catch (e) { return null; }
}

/* Built-in: the player endpoint lists caption tracks; prefer a human-made English track over automatic captions. */
async function captionsBuiltin(fetchFn, id, language) {
  const lang = (language || "en").slice(0, 5);
  const body = JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30, hl: lang } }, videoId: id, contentCheckOk: true, racyCheckOk: true });
  const r = await fetchText(fetchFn, "https://www.youtube.com/youtubei/v1/player?prettyPrint=false", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip" }, body }, 25000);
  let d; try { d = JSON.parse(r.text); } catch (e) { throw new Error("YouTube answered with something other than JSON (HTTP " + r.status + ")"); }
  const ps = d.playabilityStatus || {};
  if (ps.status && ps.status !== "OK") throw new Error("YouTube refused the caption list: " + (ps.reason || ps.status) + (/bot|sign in/i.test(ps.reason || "") ? " (this happens from some network addresses; yt-dlp usually gets through)" : ""));
  const tracks = ((d.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks || [];
  if (!tracks.length) throw new Error("this video has no captions, automatic or otherwise");
  const pick = tracks.find(t => String(t.languageCode || "").startsWith(lang) && t.kind !== "asr") || tracks.find(t => String(t.languageCode || "").startsWith(lang)) || tracks[0];
  let trackHost = ""; try { trackHost = new URL(pick.baseUrl).hostname; } catch (e) {}
  if (!/(^|\.)youtube\.com$|(^|\.)googlevideo\.com$/.test(trackHost)) throw new Error("the caption track address is not on YouTube (" + trackHost + ")");
  const c = await fetchText(fetchFn, pick.baseUrl + (pick.baseUrl.includes("fmt=") ? "" : "&fmt=json3"), null, 25000);
  if (c.status !== 200) throw new Error("caption track fetch failed: HTTP " + c.status);
  const out = transcriptToText(c.text, "application/json", "json3");
  return Object.assign(out, { reader: "built-in", track: { language: pick.languageCode || "", automatic: pick.kind === "asr", name: pick.name && pick.name.simpleText || "" } });
}

/* yt-dlp: write the English subtitle (manual first, automatic otherwise) as VTT into a temp folder. */
function ytdlpPath(env) { return (env && env.YTDLP_PATH) || process.env.YTDLP_PATH || "yt-dlp"; }
function run(cmd, args, opts) {
  return new Promise((resolve) => {
    let out = "", err = "";
    let child; try { child = spawn(cmd, args, Object.assign({ stdio: ["ignore", "pipe", "pipe"] }, opts || {})); } catch (e) { return resolve({ code: -1, out: "", err: e.message }); }
    const timer = setTimeout(() => { child.kill("SIGTERM"); resolve({code:-1,out,err:"yt-dlp timed out"}); },120000); timer.unref();
    child.on("error", e => {clearTimeout(timer);resolve({ code: -1, out, err: e.message });});
    child.stdout.on("data", d => { out += d; }); child.stderr.on("data", d => { err += d; });
    child.on("close", code => {clearTimeout(timer);resolve({ code, out, err });});
  });
}
async function ytdlpAvailable(env, runFn) { const r = await (runFn || run)(ytdlpPath(env), ["--version"]); return r.code === 0 ? r.out.trim() : ""; }
async function captionsYtdlp(id, language, env, runFn) {
  const lang = (language || "en").slice(0, 5);
  // Published captions first, YouTube's automatic ones only if there are none; two runs, so the result says truthfully
  // which kind it is (yt-dlp names both kinds the same way). json3 first: YouTube's own format has each word once.
  // Its VTT rolls (every line two or three times); that is handled too, as the fallback when json3 is not offered.
  let last = null;
  for (const kind of ["--write-subs", "--write-auto-subs"]) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-yt-"));
    try {
      const r = await (runFn || run)(ytdlpPath(env), ["--skip-download", kind, "--sub-langs", lang + ".*," + lang, "--sub-format", "json3/vtt", "--no-playlist", "--no-warnings", "-o", path.join(dir, "%(id)s"), "https://www.youtube.com/watch?v=" + id], { cwd: dir });
      last = r;
      const files = (await fs.readdir(dir)).filter(f => /\.(json3|vtt)$/i.test(f)).sort((a, b) => a.length - b.length);
      if (!files.length) continue;
      const file = files.find(f => /\.json3$/i.test(f)) || files[0];
      const json = /\.json3$/i.test(file);
      const out = transcriptToText(await fs.readFile(path.join(dir, file), "utf8"), json ? "application/json" : "text/vtt", file);
      return Object.assign(out, { reader: "yt-dlp", track: { language: lang, automatic: kind === "--write-auto-subs", name: file } });
    } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }
  throw new Error("yt-dlp wrote no caption file" + (last && last.code !== 0 ? " (exit " + last.code + ": " + String(last.err).trim().split("\n").pop() + ")" : "; this video may have no captions"));
}

/* The captions for a video, by whichever reader works, with what each one said when it did not. */
async function captions({ url, id, language, fetch: fetchFn, env, run: runFn }) {
  const vid = id || videoId(url); if (!vid) throw new Error("not a YouTube video link");
  const meta = await oembed(fetchFn || require("./public-fetch").publicFetch, vid);
  const tried = [];
  if (await ytdlpAvailable(env, runFn)) { try { const r = await captionsYtdlp(vid, language, env, runFn); return Object.assign(r, { id: vid, title: meta && meta.title || "", channel: meta && meta.channel || "", tried }); } catch (e) { tried.push({ reader: "yt-dlp", error: e.message }); } }
  else tried.push({ reader: "yt-dlp", error: "not installed (brew install yt-dlp makes YouTube reliable)" });
  try { const r = await captionsBuiltin(fetchFn || require("./public-fetch").publicFetch, vid, language); return Object.assign(r, { id: vid, title: meta && meta.title || "", channel: meta && meta.channel || "", tried }); } catch (e) { tried.push({ reader: "built-in", error: e.message }); }
  const err = new Error("no captions could be read: " + tried.map(t => t.reader + ": " + t.error).join("; ")); err.tried = tried; err.title = meta && meta.title || ""; throw err;
}

/* Candidate videos for an episode, by a YouTube search through yt-dlp (the built-in search page is not attempted:
   YouTube renders its results with scripts). Returns [{id, title, channel, duration}] or null when yt-dlp is absent.
   The caller decides whether a result is the episode; a title alone is not enough (see resolve.js). */
async function searchVideo(query, env, runFn) {
  if (!(await ytdlpAvailable(env, runFn))) return null;
  const r = await (runFn || run)(ytdlpPath(env), ["--flat-playlist", "--no-warnings", "--print", "%(id)s\t%(title)s\t%(channel)s\t%(duration)s", "ytsearch5:" + query]);
  return String(r.out || "").trim().split("\n").filter(Boolean).map(l => { const [id, title, channel, duration] = l.split("\t"); return { id, title: title || "", channel: channel || "", duration: Number(duration) }; }).filter(x => /^[A-Za-z0-9_-]{11}$/.test(x.id));
}

module.exports = { captions, searchVideo, videoId, oembed, captionsBuiltin, captionsYtdlp, ytdlpAvailable, run };
