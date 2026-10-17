"use strict";
/* Direct YouTube recovery: synthetic responses and a fake yt-dlp only. A blocked link never becomes a transcript,
   starts audio transcription, or reaches a model. The job keeps the failed attempts and the listing that did answer. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const YT = require("../server/podcast/youtube");
const { createResolver } = require("../server/podcast/resolve");
const { createMockAI } = require("../server/ai");
const { server } = require("./fixtures/straight-talk");

const ID = "AbCdEfGhIjK", LINK = "https://youtu.be/" + ID + "?si=shared-link&t=10";
const CANONICAL = "https://www.youtube.com/watch?v=" + ID;
const CHALLENGE = "ERROR: [youtube] " + ID + ": Sign in to confirm you’re not a bot.\nSee the authentication help for details.";
const PLAYER = { playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you’re not a bot" } };
const TEXT = "Words from the published conversation, kept as the caption reader returned them.";
function fixtureFetch(player = PLAYER, { metadata = true } = {}) {
  const calls = [];
  const f = async url => {
    const u = String(url); calls.push(u);
    let data, status = 200;
    if (u.startsWith("https://www.youtube.com/oembed?")) { data = { title: "A conversation about memory", author_name: "The Test Channel" }; if (!metadata) status = 404; }
    else if (u.startsWith("https://www.youtube.com/youtubei/v1/player?")) data = player;
    else if (u.startsWith("https://www.youtube.com/api/timedtext?")) data = { events: [{ segs: [{ utf8: TEXT }] }] };
    else assert.fail("Unexpected external fetch: " + u);
    return { status, text: async () => JSON.stringify(data) };
  };
  f.calls = calls;
  return f;
}
function fixtureYtdlp(mode = "blocked") {
  const calls = [];
  const f = async (command, args) => {
    calls.push(args.slice());
    assert.ok(!args.some(a => /^--cookies(?:-from-browser)?(?:=|$)/.test(a)), "the app must not extract or pass browser credentials");
    if (args[0] === "--version") return { code: 0, out: "fixture-version\n", err: "" };
    assert.ok(args.includes("--skip-download"), "the app requests captions, never a recording");
    const write = mode === "published" || mode === "automatic" && args.includes("--write-auto-subs");
    if (write) {
      const name = args[args.indexOf("-o") + 1].replace("%(id)s", ID + ".en.json3");
      fs.writeFileSync(name, JSON.stringify({ events: [{ segs: [{ utf8: TEXT }] }] }));
      return { code: 0, out: "", err: "" };
    }
    return mode === "blocked" ? { code: 1, out: "", err: CHALLENGE } : mode === "extractor-error" ? { code: 1, out: "", err: "ERROR: Unable to extract the player response" } : { code: 0, out: "", err: "" };
  };
  f.calls = calls;
  return f;
}
async function resolveVideo(fetch, run) {
  const resolver = createResolver({ fetch, run, env: {}, engines: {} });
  const located = await resolver.locate({ url: LINK }, () => {});
  return resolver.words(located, { step: () => {} });
}

test("direct video: both readers' explicit challenges become recoverable records with listing metadata", async () => {
  const fetch = fixtureFetch(), run = fixtureYtdlp();
  const result = await resolveVideo(fetch, run);
  assert.equal(result.ok, false);
  assert.equal(result.code, "youtube_access_blocked");
  assert.match(result.reason, /sign-in or bot check.*No transcript was retrieved/);
  assert.doesNotMatch(result.reason, /no captions|usually|reliable|--cookies/i);
  assert.deepEqual(result.recovery, { kind: "youtube", url: CANONICAL });
  assert.equal(result.title, "A conversation about memory");
  assert.equal(result.channel, "The Test Channel");
  assert.deepEqual(result.tried.map(x => [x.reader, x.code]), [["yt-dlp", "youtube_access_blocked"], ["built-in", "youtube_access_blocked"]]);
  assert.ok(result.tried[0].error.includes(CHALLENGE), "preserve the actual multiline refusal");
  assert.equal(run.calls.filter(a => a.includes("--skip-download")).length, 1, "do not repeat the same challenge with automatic captions");
  assert.ok(fetch.calls.some(u => u.includes("/youtubei/")), "the built-in fallback still gets its own attempt");
  assert.equal(result.text, undefined);
  assert.equal(result.source, undefined, "no caption-source claim without captions");
  assert.equal(result.needsTranscription, undefined, "the video page is not an audio URL");
});

test("direct video: no published or automatic captions is distinct from an access challenge", async () => {
  const run = fixtureYtdlp("none");
  const result = await resolveVideo(fixtureFetch({ playabilityStatus: { status: "OK" }, captions: {} }), run);
  assert.equal(result.ok, false);
  assert.equal(result.code, "youtube_captions_unavailable");
  assert.match(result.tried[1].error, /no captions/);
  assert.doesNotMatch(result.reason, /bot|sign-in/);
  assert.equal(run.calls.filter(a => a.includes("--skip-download")).length, 2, "absence still tries automatic captions");
});

test("direct video: extractor and player errors do not invent a sign-in diagnosis", async () => {
  const result = await resolveVideo(fixtureFetch({ playabilityStatus: { status: "ERROR", reason: "This video is unavailable" } }), fixtureYtdlp("extractor-error"));
  assert.equal(result.code, "youtube_captions_unavailable");
  assert.match(result.tried[0].error, /Unable to extract/);
  assert.match(result.tried[1].error, /This video is unavailable/);
  assert.doesNotMatch(result.reason, /bot|sign-in/);
});

test("direct video: missing metadata remains missing while recovery keeps the video identity", async () => {
  const result = await resolveVideo(fixtureFetch(PLAYER, { metadata: false }), fixtureYtdlp());
  assert.equal(result.title, "");
  assert.equal(result.channel, "");
  assert.deepEqual(result.recovery, { kind: "youtube", url: CANONICAL });
});

test("a yt-dlp challenge does not suppress a working built-in caption reader", async () => {
  const player = { playabilityStatus: { status: "OK" }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: "https://www.youtube.com/api/timedtext?v=" + ID + "&lang=en", languageCode: "en", name: { simpleText: "English" } }] } } };
  const result = await resolveVideo(fixtureFetch(player), fixtureYtdlp());
  assert.equal(result.ok, true);
  assert.equal(result.text, TEXT);
  assert.equal(result.source.reader, "built-in");
  assert.equal(result.source.automatic, false);
  assert.equal(result.tried[0].code, "youtube_access_blocked");
  assert.equal(result.recovery, undefined);
});

for (const mode of ["published", "automatic"]) test("successful " + mode + " yt-dlp captions keep their original attribution", async () => {
  const fetch = fixtureFetch(), run = fixtureYtdlp(mode);
  const result = await resolveVideo(fetch, run);
  assert.equal(result.ok, true);
  assert.equal(result.text, TEXT);
  assert.equal(result.source.reader, "yt-dlp");
  assert.equal(result.source.automatic, mode === "automatic");
  assert.equal(result.title, "A conversation about memory");
  assert.equal(result.channel, "The Test Channel");
  assert.equal(run.calls.filter(a => a.includes("--skip-download")).length, mode === "automatic" ? 2 : 1);
  assert.equal(fetch.calls.some(u => u.includes("/youtubei/")), false);
  assert.equal(result.recovery, undefined);
});

test("the blocked direct-video job persists its original link and attempts, without model or transcription calls", async t => {
  let modelCalls = 0, transcriptionCalls = 0;
  const ai = Object.assign(createMockAI(), { async sample() { modelCalls++; assert.fail("No model may read a failed caption fetch"); } });
  const engine = { installed: () => true, configured: () => true, modelCached: () => true, packages: {}, async transcribe() { transcriptionCalls++; assert.fail("A caption refusal must not start transcription"); } };
  const fetch = fixtureFetch(), run = fixtureYtdlp();
  const f = await server(t, { env: {}, ai, localEngine: engine, cloudEngine: engine, fetch, run });
  const started = await f.api("POST", "/api/transcript/resolve", { url: LINK, context: { title: "My chosen title" } });
  assert.equal(started.status, 200);
  let job;
  for (let i = 0; i < 200; i++) {
    job = (await f.api("GET", "/api/transcript/jobs/" + started.data.jobId)).data;
    if (job.state !== "running") break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(job.state, "done");
  assert.equal(job.result.kind, "none");
  assert.equal(job.result.code, "youtube_access_blocked");
  assert.equal(job.input.url, LINK);
  assert.equal(job.input.context.title, "My chosen title", "listing metadata does not replace the person's context");
  assert.equal(job.result.title, "A conversation about memory");
  assert.equal(job.result.channel, "The Test Channel");
  const disk = JSON.parse(fs.readFileSync(path.join(f.dir, "jobs", job.id + ".json"), "utf8"));
  assert.deepEqual(disk.result.tried, job.result.tried);
  assert.equal(disk.input.url, LINK);
  assert.equal(disk.result.recovery.url, CANONICAL);
  const consume = await f.api("POST", "/api/transcript/jobs/" + job.id + "/consume");
  assert.equal(consume.status, 409, "an unavailable transcript cannot become a reading");
  assert.equal(modelCalls, 0);
  assert.equal(transcriptionCalls, 0);
  assert.equal(f.reader.jobs.size, 0);
  assert.equal(fetch.calls.length, 2, "only oEmbed and the player endpoint were contacted through fixtures");
});
