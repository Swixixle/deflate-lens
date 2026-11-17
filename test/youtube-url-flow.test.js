"use strict";
/* URL orchestration, with synthetic captions/downloads/transcription only. Downloader byte limits, cookie scope and
   subprocess cancellation have their own tests; this file checks the actual resolver and saved-reading handoff. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const YT = require("../server/podcast/youtube");
const { createResolver } = require("../server/podcast/resolve");
const { server } = require("./fixtures/straight-talk");

const ID = "AbCdEfGhIjK", URL = "https://www.youtube.com/watch?v=" + ID;
const LINK = "https://youtu.be/" + ID + "?si=shared-link";
const WORDS = "SPEAKER 0: Welcome to this conversation about memory. I am Julia. We will compare several ways of remembering a story.\n\nSPEAKER 1: Thank you, Julia. My name is Samuel. The examples matter because a repeated story and an independent observation can sound very much alike.";
const BODY = Buffer.from("synthetic audio bytes used only for orchestration tests");
const HASH = crypto.createHash("sha256").update(BODY).digest("hex");
const META = { title: "A conversation about memory", channel: "The test channel", description: "Julia interviews Samuel about the limits of memory." };
function captionFailure(code = "youtube_captions_unavailable") {
  return Object.assign(new Error("The caption readers returned no readable words."), META, { code,
    tried: [{ reader: "yt-dlp", code, error: "No published or automatic caption file was returned." }, { reader: "built-in", code, error: "No readable track was returned." }] });
}
function intercept(t, name, replacement) {
  const previous = YT[name]; YT[name] = replacement;
  t.after(() => { if (previous === undefined) delete YT[name]; else YT[name] = previous; });
}
async function harness(t, opts = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-url-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const state = { download: [], cloud: [], local: [], cleanup: 0, paths: [] };
  intercept(t, "captions", opts.captions || (async () => { throw captionFailure(); }));
  intercept(t, "audio", async args => {
    state.download.push(args);
    if (opts.downloadError) throw opts.downloadError;
    const file = path.join(root, "recording-" + state.download.length);
    await fs.writeFile(file, BODY); state.paths.push(file);
    return Object.assign({ file, type: args.format === "mp3" ? "audio/mpeg" : "audio/mp4", format: args.format === "mp3" ? "mp3" : "m4a", bytes: BODY.length, sha256: HASH, durationSeconds: 93,
      cleanup: async () => { state.cleanup++; await fs.rm(file, { force: true }); } }, META);
  });
  const answer = engine => ({ text: WORDS, speakers: ["SPEAKER 0", "SPEAKER 1"], engine, model: "fixture-model", requestId: "fixture-request", durationSeconds: 93, note: "synthetic transcription for this test" });
  const engines = {
    local: { installed: () => !!opts.local, modelCached: () => true, packages: {}, async transcribe(args) { state.local.push(args); return opts.transcribe ? opts.transcribe(args, "local") : answer("local"); } },
    cloud: { configured: () => opts.cloud !== false, model: "fixture-model", async transcribe(args) { state.cloud.push(args); return opts.transcribe ? opts.transcribe(args, "deepgram") : answer("deepgram"); } }
  };
  const env = opts.env || {}, resolver = createResolver({ env, engines, audioTempDir: root, fetch: async () => assert.fail("No real network in URL-flow tests") });
  const resolve = async (choice, signal) => resolver.words(await resolver.locate({ url: LINK }, () => {}), { step: () => {}, choice, signal, onProgress: () => {} });
  return { state, engines, resolver, resolve, env, root };
}

test("YouTube URL: working captions do not download audio or use either transcription engine", async t => {
  const f = await harness(t, { local: true, captions: async () => Object.assign({ text: WORDS, speakers: [], reader: "yt-dlp", track: { automatic: false }, tried: [] }, META) });
  const out = await f.resolve();
  assert.equal(out.ok, true); assert.equal(out.source.kind, "youtube-captions");
  assert.equal(out.episode.description, META.description);
  assert.equal(f.state.download.length + f.state.cloud.length + f.state.local.length, 0);
});

test("YouTube URL: unavailable captions automatically use the configured cloud engine, preserving source and listing", async t => {
  const f = await harness(t);
  const out = await f.resolve();
  assert.equal(out.ok, true); assert.equal(out.text, WORDS);
  assert.equal(f.state.download.length, 1); assert.equal(f.state.download[0].format, "native");
  assert.equal(f.state.download[0].tempRoot, f.root);
  assert.equal(f.state.cloud.length, 1); assert.equal(f.state.local.length, 0);
  assert.equal(f.state.cloud[0].audioUrl, undefined, "a video page must not be sent to Deepgram as an audio URL");
  assert.equal(f.state.cloud[0].type, "audio/mp4");
  assert.equal(out.source.kind, "audio-transcription"); assert.equal(out.source.acquisition, "youtube-audio");
  assert.equal(out.source.url, URL); assert.equal(out.source.bytes, BODY.length); assert.equal(out.source.sha256, HASH);
  assert.equal(out.source.format, "m4a"); assert.equal(out.source.engine, "deepgram"); assert.equal(out.source.requestId, "fixture-request");
  assert.equal(out.source.file, undefined, "a downloaded recording is not an uploaded file");
  assert.equal(out.episode.description, META.description); assert.equal(out.title, META.title); assert.equal(out.channel, META.channel);
  assert.equal(out.episode.audioUrl, "", "do not leave a fake media URL for a later voice request");
  assert.equal(out.identity, "direct"); assert.equal(out.tried[0].reader, "yt-dlp");
  assert.equal(out.tried[2].outcome, "downloaded"); assert.equal(out.tried[2].sha256, HASH);
  assert.equal(f.state.cleanup, 1); await assert.rejects(fs.stat(f.state.paths[0]), { code: "ENOENT" });
});

test("YouTube URL: no configured engine asks once before downloading, without claiming the page is media", async t => {
  const f = await harness(t, { cloud: false });
  const out = await f.resolve();
  assert.equal(out.ok, false); assert.equal(out.code, "needs_engine");
  assert.equal(out.needsTranscription.videoUrl, URL); assert.equal(out.needsTranscription.audioUrl, undefined);
  assert.equal(out.needsTranscription.sourceKind, "youtube"); assert.equal(out.needsTranscription.localRequiresFfmpeg, true);
  assert.equal(out.recovery, undefined, "caption-recovery UI must not mask the engine choice");
  assert.equal(out.episode.description, META.description);
  assert.equal(f.state.download.length + f.state.cloud.length + f.state.local.length, 0);
});

test("YouTube URL: a standing local preference cannot spend on cloud when local is absent", async t => {
  const f = await harness(t, { env: { TRANSCRIBE_PREFER: "local" } });
  const out = await f.resolve();
  assert.equal(out.ok, false); assert.equal(out.code, "needs_engine");
  assert.equal(f.state.download.length + f.state.cloud.length + f.state.local.length, 0);
});

test("YouTube URL: explicit local choice requests MP3 and never sends audio to configured Deepgram", async t => {
  const f = await harness(t, { local: true });
  const out = await f.resolve("local");
  assert.equal(out.ok, true); assert.equal(f.state.download[0].format, "mp3");
  assert.equal(f.state.local.length, 1); assert.equal(f.state.cloud.length, 0);
  assert.equal(f.state.local[0].type, "audio/mpeg"); assert.equal(out.source.engine, "local");
  assert.equal(f.state.cleanup, 1);
});

test("YouTube URL: cancelled caption work never starts audio", async t => {
  const controller = new AbortController();
  const f = await harness(t, { captions: async () => { controller.abort(); throw captionFailure(); } });
  await assert.rejects(f.resolve(undefined, controller.signal), { code: "cancelled" });
  assert.equal(f.state.download.length + f.state.cloud.length + f.state.local.length, 0);
});

test("YouTube URL: cancellation during transcription deletes audio and produces no reading", async t => {
  const controller = new AbortController();
  const f = await harness(t, { transcribe: async args => { assert.equal(args.signal, controller.signal); controller.abort(); return { text: WORDS, engine: "deepgram" }; } });
  await assert.rejects(f.resolve(undefined, controller.signal), { code: "cancelled" });
  assert.equal(f.state.cleanup, 1); await assert.rejects(fs.stat(f.state.paths[0]), { code: "ENOENT" });
});

test("YouTube URL: provider failure retains the attempt and cleans audio without retrying or changing engines", async t => {
  const f = await harness(t, { local: true, transcribe: async () => { throw Object.assign(new Error("Fixture provider failure"), { code: "cloud_failed" }); } });
  const out = await f.resolve();
  assert.equal(out.ok, false); assert.equal(out.code, "cloud_failed"); assert.equal(out.text, undefined);
  assert.equal(out.tried.at(-1).step, "audio transcription"); assert.equal(out.tried.at(-1).code, "cloud_failed");
  assert.equal(out.tried[2].sha256, HASH); assert.equal(out.recovery.url, URL);
  assert.equal(f.state.download.length, 1); assert.equal(f.state.cloud.length, 1); assert.equal(f.state.local.length, 0);
  assert.equal(f.state.cleanup, 1); await assert.rejects(fs.stat(f.state.paths[0]), { code: "ENOENT" });
});

test("YouTube URL: empty transcription is not imported and its recording is deleted", async t => {
  const f = await harness(t, { transcribe: async () => ({ text: " \n", engine: "deepgram" }) });
  const out = await f.resolve();
  assert.equal(out.ok, false); assert.equal(out.code, "no_words"); assert.equal(out.source, undefined);
  assert.equal(f.state.cleanup, 1);
});

test("YouTube URL: missing ffmpeg reports a local setup failure without a paid fallback", async t => {
  const f = await harness(t, { local: true, env: { TRANSCRIBE_PREFER: "local" }, downloadError: Object.assign(new Error("Install ffmpeg to convert the video audio to MP3."), { code: "youtube_ffmpeg_unavailable" }) });
  const out = await f.resolve();
  assert.equal(out.ok, false); assert.equal(out.code, "youtube_ffmpeg_unavailable"); assert.equal(out.recovery.url, URL);
  assert.match(out.reason, /ffmpeg/); assert.equal(f.state.cloud.length + f.state.local.length, 0);
});

test("YouTube URL: the podcast caption branch does not download a second recording from its video candidate", async t => {
  const f = await harness(t);
  const out = await f.resolver.words({ kind: "episode", item: { title: "The listed episode", transcripts: [], youtube: URL, link: "", enclosure: null, description: "", duration: null } }, { step: () => {} });
  assert.equal(out.ok, false); assert.equal(f.state.download.length + f.state.cloud.length + f.state.local.length, 0);
});

test("YouTube URL: downloaded audio uses the normal persisted job/consume/voice record, with idempotent consumption", async t => {
  const h = await harness(t);
  const f = await server(t, { env: {}, localEngine: h.engines.local, cloudEngine: h.engines.cloud, fetch: async () => assert.fail("No external network in synthetic URL import") });
  const start = await f.api("POST", "/api/transcript/resolve", { url: LINK });
  assert.equal(start.status, 200);
  let job;
  for (let i = 0; i < 200; i++) {
    job = (await f.api("GET", "/api/transcript/jobs/" + start.data.jobId)).data;
    if (job.state !== "running") break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(job.state, "done"); assert.equal(job.result.kind, "transcript"); assert.equal(job.result.source.requestId, "fixture-request");
  const first = await f.api("POST", "/api/transcript/jobs/" + job.id + "/consume");
  assert.equal(first.status, 202, JSON.stringify(first.data));
  const second = await f.api("POST", "/api/transcript/jobs/" + job.id + "/consume");
  assert.equal(second.status, 202, JSON.stringify(second.data));
  const savedJob = (await f.api("GET", "/api/transcript/jobs/" + job.id)).data;
  const run = await f.store.getRun(savedJob.runId);
  assert.equal(run.sourceUrl, LINK); assert.equal(run.import.source.url, URL); assert.equal(run.import.source.sha256, HASH);
  assert.equal(run.import.source.acquisition, "youtube-audio"); assert.equal(run.import.file, undefined);
  assert.equal(run.import.episodeInfo.description, META.description);
  assert.equal(run.import.source.speakers.length, 2); assert.equal(h.state.download.length, 1); assert.equal(h.state.cloud.length, 1);
  const exported = await f.api("GET", "/api/runs/" + savedJob.runId + "/export.json");
  assert.equal(exported.status, 200); assert.equal(exported.data.run.import.source.sha256, HASH);
  assert.equal(exported.data.run.import.source.bytes, BODY.length); assert.equal(exported.data.run.import.source.acquisition, "youtube-audio");
  assert.equal(h.state.cleanup, 1);
});

test("YouTube URL: acquisition receipts accept only the bounded saved fields", () => {
  const validate = require("../server/validate").validateRunDoc;
  const incoming = { kind: "audio-transcription", acquisition: "youtube-audio", sha256: HASH, bytes: BODY.length, file: "/tmp/private-recording", cookies: "not a saved field" };
  const source = validate({ import: { source: incoming } }).import.source;
  assert.equal(source.sha256, HASH); assert.equal(source.bytes, BODY.length); assert.equal(source.file, undefined); assert.equal(source.cookies, undefined);
  for (const bytes of [-1, 1.2, "900", Infinity, 800 * 1024 * 1024 + 1]) {
    const invalid = validate({ import: { source: Object.assign({}, incoming, { bytes, sha256: "not a hash" }) } }).import.source;
    assert.equal(invalid.bytes, 0); assert.equal(invalid.sha256, "");
  }
  assert.equal(validate({ import: { source: Object.assign({}, incoming, { acquisition: "unknown" }) } }).import.source.acquisition, undefined);
});
