"use strict";
// Local API and the shipped page. No provider, browser-cookie store, or real video is contacted.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { createApp } = require("../server/app");
const { createSettings } = require("../server/settings");
const { page, visible } = require("./page-harness");
const LINK = "https://www.youtube.com/watch?v=Blocked0001";
const WORDS = "SPEAKER 1: The survey covered four hundred households in three neighborhoods.\n\nSPEAKER 2: That tells us something about those neighborhoods, but it does not tell us what every household in the city thinks.\n";
const local = { installed: () => false, modelCached: () => false, model: "test-local", packages: {} };
const ytVersion = async (cmd, args) => { assert.deepEqual(args, ["--version", "--ignore-config"], "settings may check installation, never read cookies or download"); return { code: 0, out: "2026.10.01\n", err: "" }; };
const noNetwork = async () => { throw new Error("Unexpected network request"); };
function resolver(result) { return { locate: async () => ({ kind: "video" }), words: async () => typeof result === "function" ? result() : result }; }
const blocked = { ok: false, code: "youtube_access_blocked", reason: "YouTube asked for sign-in before the video could be read.", recovery: { kind: "youtube", url: LINK }, tried: [] };
async function start(f, expected) {
  const ta = f.$("f-text"); ta.value = LINK; ta.listeners.input();
  const going = f.$("readThis").click();
  await f.pump(() => expected(f)); await going;
  assert.ok(expected(f), visible(f.$("intake-msg")));
}
const button = (f, label) => f.$("intake-msg").querySelectorAll("button").find(b => b.textContent === label);

test("Chrome sign-in is closed, off by default, persists across restart, and never exposes saved secrets", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-youtube-setting-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const envPath = path.join(dir, ".env"), secret = "secret-value-never-returned";
  fs.writeFileSync(envPath, "# keep this\nDEEPGRAM_API_KEY=" + secret + "\n");
  const settings = createSettings({ envPath });
  for (const bad of ["firefox", "chrome:Profile 2", "/tmp/cookies.txt", "chrome --cookies out.txt", "true", ""]) assert.throws(() => settings.set("YTDLP_COOKIES_BROWSER", bad), /none or chrome/);
  assert.equal(fs.readFileSync(envPath, "utf8"), "# keep this\nDEEPGRAM_API_KEY=" + secret + "\n");
  const env = { DEEPGRAM_API_KEY: secret };
  async function launch(current) {
    const app = createApp({ dataDir: dir, examplesDir: dir, envPath, env: current, ai: null, run: ytVersion, fetch: noNetwork, localEngine: local });
    await app.ready;
    const server = await new Promise(resolve => { const s = app.app.listen(0, "127.0.0.1", () => resolve(s)); });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const api = async (method, route, body) => {
      const response = await fetch("http://127.0.0.1:" + server.address().port + route, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, data: await response.json() };
    };
    return { app, api };
  }
  const a = await launch(env);
  assert.equal((await a.api("GET", "/api/transcript/engines")).data.cookiesBrowser, "none");
  for (const choice of ["chrome", "none", "chrome"]) {
    const saved = await a.api("POST", "/api/settings/key", { name: "YTDLP_COOKIES_BROWSER", key: choice });
    assert.equal(saved.status, 200);
    assert.doesNotMatch(JSON.stringify(saved.data), new RegExp(secret));
    const engines = (await a.api("GET", "/api/transcript/engines")).data;
    assert.equal(engines.cookiesBrowser, choice);
    assert.doesNotMatch(JSON.stringify(engines), new RegExp(secret));
    assert.equal(a.app.jobs.running("resolve").length, 0, "saving a preference starts no transcription or reading");
  }
  assert.match(fs.readFileSync(envPath, "utf8"), /^# keep this/m);
  assert.match(fs.readFileSync(envPath, "utf8"), /^YTDLP_COOKIES_BROWSER=chrome$/m);
  const restored = require("dotenv").parse(fs.readFileSync(envPath));
  const b = await launch(restored);
  assert.equal((await b.api("GET", "/api/transcript/engines")).data.cookiesBrowser, "chrome");
});

test("the Chrome checkbox stays under Controls, saves once without starting work, and states the local cookie use", async t => {
  let resolves = 0;
  const f = await page(t, { ai: null, env: {}, run: ytVersion, serverFetch: noNetwork, localEngine: local, resolver: resolver(() => { resolves++; return blocked; }) });
  assert.equal(f.$("controls").hidden, true);
  f.$("controlsBtn").click();
  const check = f.$("ctl-youtube-chrome");
  assert.ok(check); assert.equal(check.getAttribute("checked"), null);
  assert.match(visible(f.$("controlsBody")), /Use Chrome sign-in for YouTube/);
  assert.match(visible(f.$("controlsBody")), /read Chrome's saved sign-in cookies.*YouTube requests.*does not export a cookie file/s);
  check.checked = true; await check.listeners.change();
  assert.equal(f.ctx.page.S.engines.cookiesBrowser, "chrome");
  assert.equal(resolves, 0);
  assert.equal(f.requests.filter(([url]) => /\/transcript\/(resolve|upload)/.test(url)).length, 0);
  assert.match(fs.readFileSync(path.join(f.system.store.dataDir, ".env"), "utf8"), /^YTDLP_COOKIES_BROWSER=chrome$/m);
  check.checked = false; await check.listeners.change();
  assert.equal(f.ctx.page.S.engines.cookiesBrowser, "none");
});

test("enable-and-retry saves Chrome once and the same URL proceeds to a reading with its YouTube source", async t => {
  const env = {}; let tries = 0;
  const f = await page(t, { ai: null, env, run: ytVersion, serverFetch: noNetwork, localEngine: local, resolver: resolver(() => {
    tries++;
    if (env.YTDLP_COOKIES_BROWSER !== "chrome") return blocked;
    return { ok: true, text: WORDS, title: "Survey discussion", speakers: ["SPEAKER 1", "SPEAKER 2"], source: { kind: "audio-transcription", acquisition: "youtube-audio", url: LINK, engine: "deepgram", requestId: "test-id", bytes: 23, sha256: "a".repeat(64), format: "mp4", note: "YouTube audio transcribed by Deepgram" } };
  }) });
  await start(f, f => !!f.$("intake-msg").querySelector(".youtube-recovery"));
  const retry = button(f, "Use Chrome sign-in and try again"); assert.ok(retry);
  let releaseSave; const waiting = new Promise(resolve => { releaseSave = resolve; });
  const setSetting = f.ctx.page.API.setSetting;
  f.ctx.page.API.setSetting = async (...args) => { await waiting; return setSetting(...args); };
  const going = retry.click();
  await f.$("readThis").click(); await retry.click();
  assert.equal(tries, 1, "while the preference saves, Read this cannot race another fetch");
  releaseSave(); await f.pump(() => !!f.ctx.page.S.runId); await going; await f.settle();
  const b = f.ctx.page.S.b;
  assert.equal(tries, 2); assert.equal(b.run.sourceUrl, LINK);
  assert.equal(b.run.import.source.acquisition, "youtube-audio");
  assert.equal(b.run.import.file, undefined);
  assert.match(b.run.provenance.voices.audioFoundBy, /downloaded from the YouTube video/);
  assert.doesNotMatch(b.run.provenance.voices.audioFoundBy, /file you uploaded/);
  assert.match(visible(f.$("runView")), /YouTube audio transcribed by Deepgram/);
  assert.equal(f.requests.filter(([url, method]) => url === "/api/settings/key" && method === "POST").length, 1);
});

test("a YouTube transcription choice is shown even if an older recovery hint is also present", async t => {
  const f = await page(t, { ai: null, env: {}, run: ytVersion, serverFetch: noNetwork, localEngine: local, resolver: resolver({ ...blocked, needsTranscription: { videoUrl: LINK, sourceKind: "youtube", localRequiresFfmpeg: true, duration: null, available: { local: false, cloud: false }, wanted: null } }) });
  await start(f, f => !!f.$("intake-msg").querySelector(".enginebox"));
  const text = visible(f.$("intake-msg"));
  assert.match(text, /Install local transcription/);
  assert.match(text, /Save key and transcribe with Deepgram/);
  assert.match(text, /YouTube audio also needs ffmpeg/);
  assert.equal(f.$("intake-msg").querySelector(".youtube-recovery"), null);
  assert.equal(f.ctx.page.S.runId, null);
});

test("missing ffmpeg preserves the local choice and offers an actionable retry without changing to cloud", async t => {
  const env = { TRANSCRIBE_PREFER: "local", YTDLP_COOKIES_BROWSER: "chrome" };
  const f = await page(t, { ai: null, env, run: ytVersion, serverFetch: noNetwork, localEngine: local, cloudEngine: { configured: () => true, model: "test-dg" }, resolver: resolver({ ...blocked, code: "youtube_ffmpeg_unavailable", reason: "ffmpeg is required to make MP3 for local transcription." }) });
  await start(f, f => !!f.$("intake-msg").querySelector(".youtube-recovery"));
  assert.match(visible(f.$("intake-msg")), /brew install ffmpeg.*local transcription choice is unchanged/s);
  assert.ok(button(f, "Try again"));
  assert.equal(button(f, "Use Chrome sign-in and try again"), undefined);
  assert.equal(env.TRANSCRIBE_PREFER, "local");
  assert.equal(f.requests.filter(([url, method]) => /settings|prefer/.test(url) && method !== "GET").length, 0);
});

test("a configured paid audio fallback is disclosed beside the URL before Read this", async t => {
  const f = await page(t, { ai: null, env: {}, run: ytVersion, serverFetch: noNetwork, localEngine: local, cloudEngine: { configured: () => true, model: "test-dg" }, resolver: resolver(blocked) });
  const ta = f.$("f-text"); ta.value = LINK; ta.listeners.input();
  assert.match(f.$("f-kind").textContent, /If audio is needed, it goes to Deepgram and is billed to your saved key/);
  assert.equal(f.requests.filter(([url]) => url === "/api/transcript/resolve").length, 0);
});

test("a transcription provider failure does not ask for unrelated Chrome access", async t => {
  const f = await page(t, { ai: null, env: {}, run: ytVersion, serverFetch: noNetwork, localEngine: local, cloudEngine: { configured: () => true, model: "test-dg" }, resolver: resolver({ ...blocked, code: "cloud_failed", reason: "The audio was downloaded, but Deepgram could not transcribe it." }) });
  await start(f, f => !!f.$("intake-msg").querySelector(".youtube-recovery"));
  const text = visible(f.$("intake-msg"));
  assert.match(text, /Deepgram could not transcribe/);
  assert.match(text, /incur a new Deepgram charge/);
  assert.doesNotMatch(text, /Chrome sign-in|saved sign-in cookies|YouTube still did not provide/);
  assert.equal(button(f, "Use Chrome sign-in and try again"), undefined);
  assert.ok(button(f, "Try again"));
});

test("double-clicking Try again or Read this while the retry runs creates one new job", async t => {
  let release, tries = 0;
  const waiting = new Promise(resolve => { release = resolve; });
  const f = await page(t, { ai: null, env: { YTDLP_COOKIES_BROWSER: "chrome" }, run: ytVersion, serverFetch: noNetwork, localEngine: local, resolver: resolver(async () => {
    tries++;
    if (tries === 1) return blocked;
    await waiting;
    return { ok: true, text: WORDS, title: "A supplied result", speakers: [], source: { kind: "audio-transcription", acquisition: "youtube-audio", engine: "local", url: LINK } };
  }) });
  await start(f, f => !!f.$("intake-msg").querySelector(".youtube-recovery"));
  const retry = button(f, "Try again");
  assert.ok(retry);
  const first = retry.click();
  await retry.click();
  await f.$("readThis").click();
  await f.pump(() => tries === 2);
  assert.equal(tries, 2, "one initial attempt plus one retry");
  assert.equal(f.requests.filter(([url]) => url === "/api/transcript/resolve").length, 2);
  release(); await f.pump(() => !!f.ctx.page.S.runId); await first;
});
