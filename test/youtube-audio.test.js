"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const YT = require("../server/podcast/youtube");
const ID = "AbCdEfGhIjK", BYTES = Buffer.from("fixture audio bytes — the exact bytes transcribed");
async function temp(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-audio-test-")); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; }
function runner({ ext = "m4a", fail, ffmpeg = true, info, afterWrite } = {}) {
  const calls = [];
  const fn = async (cmd, args, opts = {}) => {
    calls.push({ cmd, args, opts });
    if (args[0] === "--version") return { code: 0, out: "fixture", err: "" };
    if (args[0] === "-version") return { code: ffmpeg ? 0 : -1, out: "fixture ffmpeg", err: ffmpeg ? "" : "ENOENT" };
    if (fail) return { code: 1, out: "", err: fail };
    await fs.writeFile(path.join(opts.cwd, "audio." + ext), BYTES);
    await fs.writeFile(path.join(opts.cwd, "audio.info.json"), JSON.stringify(info || { title: "A conversation", description: "Guest: Ada, at the end of the listing.", channel: "Example", duration: 123.5, url: "https://private.googlevideo.com/videoplayback?sig=DO-NOT-STORE" }));
    if (opts.onProgress) opts.onProgress(BYTES.length, BYTES.length);
    if (afterWrite) await afterWrite(opts.cwd);
    return { code: 0, out: "https://private.googlevideo.com/?token=DO-NOT-STORE", err: "" };
  };
  fn.calls = calls; return fn;
}

test("YouTube audio: native download ignores configuration and cookies, keeps exact bytes and listing, cleans private temporary files", async t => {
  const root = await temp(t), run = runner(), progress = [];
  const result = await YT.audio({ id: ID, env: {}, run, tempRoot: root, onProgress: p => progress.push(p) });
  assert.deepEqual(progress, [{ stage: "downloading", bytes: BYTES.length, totalBytes: BYTES.length, percent: 100 }]);
  const download = run.calls.find(c => c.args.includes("-o"));
  assert.ok(download.args.includes("--ignore-config")); assert.ok(download.args.includes("--no-playlist"));
  assert.ok(download.args.includes("--max-filesize"));
  assert.equal(download.args[download.args.indexOf("--fixup") + 1], "never");
  assert.equal(download.args.at(-1), "https://www.youtube.com/watch?v=" + ID);
  assert.ok(!download.args.includes("--cookies")); assert.ok(!download.args.includes("--cookies-from-browser"));
  assert.equal(run.calls.some(c => c.args[0] === "-version"), false, "native needs no ffmpeg");
  assert.equal(result.bytes, BYTES.length); assert.equal(result.sha256, crypto.createHash("sha256").update(BYTES).digest("hex"));
  assert.equal(result.format, "m4a"); assert.equal(result.type, "audio/mp4"); assert.equal(result.durationSeconds, 123.5);
  assert.match(result.description, /Guest: Ada/); assert.equal(result.channel, "Example");
  assert.doesNotMatch(JSON.stringify(result), /DO-NOT-STORE|googlevideo/);
  assert.equal((await fs.stat(path.dirname(result.file))).mode & 0o777, 0o700);
  await result.cleanup(); await result.cleanup(); assert.deepEqual(await fs.readdir(root), []);
});

test("YouTube audio: Chrome session is opt-in, never an exported cookie file", async t => {
  const root = await temp(t);
  for (const selected of ["chrome", "firefox", "chrome:Profile 1", "", undefined]) {
    const run = runner({ ext: "webm" }), result = await YT.audio({ id: ID, env: { YTDLP_COOKIES_BROWSER: selected }, run, tempRoot: root });
    const args = run.calls.find(c => c.args.includes("-o")).args;
    assert.equal(args.includes("--cookies-from-browser"), selected === "chrome");
    if (selected === "chrome") assert.equal(args[args.indexOf("--cookies-from-browser") + 1], "chrome");
    assert.ok(!args.includes("--cookies")); assert.equal(result.type, "audio/webm"); await result.cleanup();
  }
});

test("YouTube audio: mp3 requires ffmpeg and hashes final converted bytes", async t => {
  const root = await temp(t), missing = runner({ ffmpeg: false });
  await assert.rejects(YT.audio({ id: ID, env: {}, run: missing, format: "mp3", tempRoot: root }), { code: "youtube_ffmpeg_unavailable" });
  assert.equal(missing.calls.some(c => c.args.includes("-o")), false);
  const run = runner({ ext: "mp3" }), result = await YT.audio({ id: ID, env: {}, run, format: "mp3", tempRoot: root });
  const args = run.calls.find(c => c.args.includes("-o")).args;
  assert.ok(args.includes("--extract-audio")); assert.equal(args[args.indexOf("--audio-format") + 1], "mp3");
  assert.equal(result.type, "audio/mpeg"); assert.equal(result.sha256, crypto.createHash("sha256").update(BYTES).digest("hex")); await result.cleanup();
});

test("YouTube audio: arbitrary URL/options cannot reach the downloader", async t => {
  const root = await temp(t); let calls = 0;
  for (const id of ["https://youtube.com/watch?v=" + ID, "--exec evil", "../../etc/passwd", ID + "?x=y", "", null]) {
    await assert.rejects(YT.audio({ id, run: () => { calls++; }, tempRoot: root }), /not a YouTube video id/);
  }
  assert.equal(calls, 0);
});

test("YouTube audio: errors redact URLs and remove all owned files", async t => {
  const root = await temp(t);
  await assert.rejects(YT.audio({ id: ID, env: {}, run: runner({ fail: "ERROR Sign in to confirm you're not a bot https://x.googlevideo.com/?sig=SECRET\nCookie: secret" }), tempRoot: root }), e => {
    assert.equal(e.code, "youtube_access_blocked"); assert.match(e.message, /Sign in/); assert.doesNotMatch(e.message, /SECRET|Cookie: secret/); return true;
  });
  assert.deepEqual(await fs.readdir(root), []);
});

test("YouTube audio: post-download cap catches unknown-length oversize and cleanup follows", async t => {
  const root = await temp(t), run = runner({ afterWrite: async dir => { await fs.truncate(path.join(dir, "audio.m4a"), YT.MAX_AUDIO_BYTES + 1); } });
  await assert.rejects(YT.audio({ id: ID, env: {}, run, tempRoot: root }), { code: "youtube_audio_too_large" });
  assert.deepEqual(await fs.readdir(root), []);
});

test("YouTube audio: aborted download is not a failed-caption fallback and temporary files are removed", async t => {
  const root = await temp(t), ctl = new AbortController();
  await assert.rejects(YT.audio({ id: ID, env: {}, run: runner({ afterWrite: () => ctl.abort() }), signal: ctl.signal, tempRoot: root }), { name: "AbortError" });
  assert.deepEqual(await fs.readdir(root), []);
});

test("YouTube audio: startup cleanup removes owned crash leftovers only", async t => {
  const root = await temp(t), result = await YT.audio({ id: ID, env: {}, run: runner(), tempRoot: root });
  await fs.mkdir(path.join(root, "deflate-youtube-audio-Abc123"));
  await fs.writeFile(path.join(root, "deflate-youtube-audio-Abc123", "keep.txt"), "not ours");
  await fs.mkdir(path.join(root, "unrelated"));
  await fs.symlink(path.dirname(result.file), path.join(root, "deflate-youtube-audio-Lnk123"));
  assert.equal(await YT.cleanupAudioTemps(root), 1);
  assert.deepEqual((await fs.readdir(root)).sort(), ["deflate-youtube-audio-Abc123", "deflate-youtube-audio-Lnk123", "unrelated"]);
});

test("YouTube subprocess: timeout, cancellation, output limits and live file guard", async t => {
  const root = await temp(t);
  const timed = await YT.run(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeoutMs: 60 });
  assert.equal(timed.errorCode, "youtube_audio_timeout");
  const ctl = new AbortController(), pending = YT.run(process.execPath, ["-e", "setInterval(()=>{},1000)"], { signal: ctl.signal });
  setTimeout(() => ctl.abort(), 60); assert.equal((await pending).errorCode, "youtube_audio_cancelled");
  const oversized = await YT.run(process.execPath, ["-e", "require('fs').writeFileSync('audio.part',Buffer.alloc(2000));setInterval(()=>{},1000)"], { cwd: root, watchDir: root, maxBytes: 1000, timeoutMs: 5000 });
  assert.equal(oversized.errorCode, "youtube_audio_too_large");
  const noisy = await YT.run(process.execPath, ["-e", "process.stdout.write('x'.repeat(200000));process.stderr.write('https://x.googlevideo.com/?sig=SECRET')"]);
  assert.ok(noisy.out.length <= 65536); assert.doesNotMatch(noisy.err, /SECRET/);
  const progress = [];
  await YT.run(process.execPath, ["-e", "process.stderr.write('__DEFLATE_PROGRESS__120 200\\n');process.stdout.write('__DEFLATE_PROGRESS__200 200')"], { onProgress: (bytes, total) => progress.push({ bytes, total }) });
  assert.deepEqual(progress, [{ bytes: 120, total: 200 }, { bytes: 200, total: 200 }]);
});

test("YouTube captions: same explicit Chrome setting and signal reach the caption runner while preserving descriptions", async () => {
  const ctl = new AbortController(); let seen;
  const run = async (cmd, args, opts) => {
    seen = { args, opts };
    const file = args[args.indexOf("-o") + 1].replace("%(id)s", ID);
    await fs.writeFile(file + ".en.json3", JSON.stringify({ events: [{ segs: [{ utf8: "Words from the video" }] }] }));
    await fs.writeFile(file + ".info.json", JSON.stringify({ description: "Guest credited here", channel: "Channel" }));
    return { code: 0, out: "", err: "" };
  };
  const result = await YT.captionsYtdlp(ID, "en", { YTDLP_COOKIES_BROWSER: "chrome" }, run, ctl.signal);
  assert.ok(seen.args.includes("--ignore-config")); assert.ok(seen.args.includes("--cookies-from-browser"));
  assert.equal(seen.opts.signal, ctl.signal); assert.equal(result.description, "Guest credited here");
  ctl.abort(); await assert.rejects(YT.captionsYtdlp(ID, "en", {}, run, ctl.signal), { name: "AbortError" });
});
