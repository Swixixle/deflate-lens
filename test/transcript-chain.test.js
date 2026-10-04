"use strict";
/* The transcript chain for podcast and video links (0.9.0): feed parsing, transcript formats, link classification,
   the Apple/Spotify/feed/page locators, the four-step search for words, the two audio engines (local Whisper by a
   fake pipeline here; Deepgram by a recorded response), the job API, and the one-time settings. Everything runs on
   fixtures; the live checks are in scripts/transcript-smoke.js. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research/index");
const F = require("../server/podcast/feed");
const T = require("../server/podcast/transcripts");
const YT = require("../server/podcast/youtube");
const { createResolver, classify } = require("../server/podcast/resolve");
const { deepgramEngine, toMono16k, quietestCut } = require("../server/podcast/engines");
const { SETTABLE } = require("../server/settings");

const FEED = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<title>The Test Show</title><link>https://show.test/</link><description><![CDATA[A show &amp; such]]></description><itunes:author>Tess</itunes:author><itunes:image href="https://show.test/art.jpg"/>
<item><title>Ep 2: Greener &amp; browner</title><guid isPermaLink="false">g-2</guid><link>https://show.test/ep2</link><pubDate>Thu, 02 Oct 2026 10:00:00 GMT</pubDate><itunes:duration>01:02:03</itunes:duration>
  <enclosure url="https://cdn.test/ep2.mp3?x=1" type="audio/mpeg" length="123"/>
  <podcast:transcript url="https://show.test/ep2.vtt" type="text/vtt" rel="captions"/>
  <podcast:transcript url="https://show.test/ep2.json" type="application/json"/>
  <description><![CDATA[<p>Notes with a video https://www.youtube.com/watch?v=AbCdEfGhIjK and more</p>]]></description></item>
<item><title>Ep 1: No transcript</title><guid>g-1</guid><link>https://show.test/ep1</link><pubDate>Wed, 01 Oct 2026 10:00:00 GMT</pubDate><itunes:duration>3600</itunes:duration><enclosure url="https://cdn.test/ep1.mp3" type="audio/mpeg"/><description>plain notes</description></item>
<item><title>Ep 0: audio only, no page</title><guid>g-0</guid><pubDate>Tue, 30 Sep 2026 10:00:00 GMT</pubDate><enclosure url="https://cdn.test/ep0.mp3" type="audio/mpeg"/></item>
</channel></rss>`;
const VTT = "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<v Host>Welcome back.\n\n00:00:02.000 --> 00:00:04.000\n<v Host>Today we talk about plans.\n\n00:00:04.000 --> 00:00:06.000\n<v Guest>A bad plan beats no plan, " + "x ".repeat(120) + "\n";
const APPLE_LOOKUP = { resultCount: 3, results: [
  { wrapperType: "track", kind: "podcast", collectionId: 999, trackId: 999, collectionName: "The Test Show", artistName: "Tess", feedUrl: "https://show.test/feed.xml" },
  { wrapperType: "podcastEpisode", kind: "podcast-episode", trackId: 1001, trackName: "Ep 1: No transcript", episodeGuid: "g-1", episodeUrl: "https://cdn.test/ep1.mp3", releaseDate: "2026-10-01T10:00:00Z", feedUrl: "https://show.test/feed.xml", collectionName: "The Test Show", collectionId: 999 },
  { wrapperType: "podcastEpisode", kind: "podcast-episode", trackId: 1002, trackName: "Ep 2: Greener & browner", episodeGuid: "g-2", episodeUrl: "https://cdn.test/ep2.mp3", releaseDate: "2026-10-02T10:00:00Z", feedUrl: "https://show.test/feed.xml", collectionName: "The Test Show", collectionId: 999 },
] };
const PLAYER = { playabilityStatus: { status: "OK" }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: "https://www.youtube.com/api/timedtext?v=AbCdEfGhIjK&lang=en&kind=asr", languageCode: "en", kind: "asr", name: { simpleText: "English (auto-generated)" } }] } } };
const JSON3 = { events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "so today" }] }, { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "so today we talk" }] }, { segs: [{ utf8: "about plans. " }] }, { segs: [{ utf8: "A bad plan beats no plan. " + "y ".repeat(150) }] }] };

/* An injected fetch that answers every address the chain can ask. */
function fakeFetch(overrides) {
  const calls = [];
  const f = async (url, opts) => {
    const u = String(url); calls.push(u);
    const res = (status, body, type) => ({ status, url: u, headers: { get: k => k.toLowerCase() === "content-type" ? type || "text/plain" : null }, text: async () => typeof body === "string" ? body : JSON.stringify(body) });
    const o = overrides && overrides(u, opts); if (o) return res(o.status || 200, o.body, o.type);
    if (/itunes\.apple\.com\/lookup\?id=999/.test(u)) return res(200, APPLE_LOOKUP, "application/json");
    if (/itunes\.apple\.com\/lookup\?id=404/.test(u)) return res(200, { resultCount: 0, results: [] }, "application/json");
    if (/itunes\.apple\.com\/search\?term=Ep%201/.test(u)) return res(200, { resultCount: 1, results: [APPLE_LOOKUP.results[1]] }, "application/json");
    if (/itunes\.apple\.com\/search\?term=The%20Test%20Show&.*entity=podcast&/.test(u)) return res(200, { resultCount: 1, results: [APPLE_LOOKUP.results[0]] }, "application/json");
    if (/open\.spotify\.com\/oembed.*episode/.test(u)) return res(200, { title: "Ep 1: No transcript", html: "<iframe title=\"Spotify Embed: Ep 1: No transcript\"></iframe>" }, "application/json");
    if (/open\.spotify\.com\/oembed.*show/.test(u)) return res(200, { html: "<iframe title=\"Spotify Embed: The Test Show\"></iframe>" }, "application/json");
    if (u === "https://show.test/feed.xml") return res(200, FEED, "application/rss+xml");
    if (u === "https://show.test/ep2.vtt") return res(200, VTT, "text/vtt");
    if (u === "https://show.test/ep2.json") return res(500, "boom");
    if (u === "https://show.test/ep1") return res(200, "<html><head><title>Ep 1: No transcript</title><link rel=\"alternate\" type=\"application/rss+xml\" href=\"/feed.xml\"></head><body><p>" + "short notes. ".repeat(10) + "</p></body></html>", "text/html");
    if (u === "https://show.test/ep2") return res(200, "<html><head><title>Ep 2</title></head><body><p>notes</p></body></html>", "text/html");
    if (/youtube\.com\/oembed/.test(u)) return res(200, { title: "Ep 2 video", author_name: "The Test Show" }, "application/json");
    if (/youtubei\/v1\/player/.test(u)) return res(200, PLAYER, "application/json");
    if (/api\/timedtext/.test(u)) return res(200, JSON3, "application/json");
    if (/api\.deepgram\.com/.test(u)) return res(200, { metadata: { request_id: "dg-1", duration: 3600, models: ["m1"] }, results: { utterances: [{ speaker: 0, transcript: "Welcome back." }, { speaker: 0, transcript: "Today we talk about plans." }, { speaker: 1, transcript: "A bad plan beats no plan." }] } }, "application/json");
    if (u === "https://x.test/article") return res(200, "<html><head><title>An article</title></head><body><article>" + "<p>Words of an article paragraph that go on for a while. </p>".repeat(12) + "</article></body></html>", "text/html");
    return res(404, "nope");
  };
  f.calls = calls; return f;
}
const noYtdlp = async (cmd, args) => ({ code: -1, out: "", err: "ENOENT" });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "deflate-chain-"));
const fakeLocal = (installed, text) => ({ name: "local", model: "fake-whisper", packages: {}, dir: "/nowhere", installed: () => installed, modelCached: () => true, install: async () => ({ dir: "/nowhere", packages: {} }), transcribe: async ({ audioUrl, onProgress, signal }) => { onProgress && onProgress({ stage: "transcribing", secondsDone: 10, secondsTotal: 20, percent: 50 }); if (signal && signal.aborted) { const e = new Error("stopped"); e.code = "cancelled"; throw e; } return { text: text || "local words from " + audioUrl, speakers: [], engine: "local", model: "fake-whisper", durationSeconds: 20, note: "fake local" }; } });

test("feed: items, enclosures, transcripts, durations, YouTube links in notes, best-transcript order, episode matching", () => {
  const feed = F.parseFeed(FEED);
  assert.equal(feed.title, "The Test Show"); assert.equal(feed.description, "A show & such"); assert.equal(feed.image, "https://show.test/art.jpg"); assert.equal(feed.items.length, 3);
  const [e2, e1, e0] = feed.items;
  assert.equal(e2.title, "Ep 2: Greener & browner"); assert.equal(e2.guid, "g-2"); assert.equal(e2.duration, 3723); assert.equal(e2.pubDate, "2026-10-02T10:00:00.000Z"); assert.deepEqual(e2.enclosure, { url: "https://cdn.test/ep2.mp3?x=1", type: "audio/mpeg", length: 123 }); assert.equal(e2.transcripts.length, 2); assert.equal(e2.youtube, "https://www.youtube.com/watch?v=AbCdEfGhIjK"); assert.match(e2.description, /^Notes with a video/);
  assert.equal(e1.duration, 3600); assert.equal(e1.transcripts.length, 0); assert.equal(e0.link, "");
  assert.deepEqual(F.bestTranscripts(e2.transcripts).map(t => t.type), ["application/json", "text/vtt"]);
  assert.equal(F.matchEpisode(feed, { guid: "g-1" }).item.title, "Ep 1: No transcript"); assert.equal(F.matchEpisode(feed, { enclosureUrl: "https://cdn.test/ep2.mp3" }).matchedBy, "audio file"); assert.equal(F.matchEpisode(feed, { title: "ep 2: greener & browner" }).matchedBy, "title"); assert.equal(F.matchEpisode(feed, { pubDate: "2026-09-30T00:00:00Z" }).item.guid, "g-0"); assert.equal(F.matchEpisode(feed, { guid: "zzz", title: "nothing like it" }), null);
  assert.throws(() => F.parseFeed("<html>not a feed</html>"), /not an RSS feed/);
});

test("transcript formats: VTT voices, SRT, Podcasting 2.0 JSON, YouTube json3 with rolling captions, HTML, plain; speakers only where the format has them", () => {
  const v = T.transcriptToText(VTT, "text/vtt", "x.vtt"); assert.equal(v.format, "vtt"); assert.deepEqual(v.speakers, ["HOST", "GUEST"]); assert.match(v.text, /^HOST: Welcome back\. Today we talk about plans\.\nGUEST: A bad plan beats no plan,/);
  const s = T.transcriptToText("1\n00:00:01,000 --> 00:00:02,000\nJOE: Hi.\n\n2\n00:00:02,000 --> 00:00:03,000\nJOE: There.\n\n3\n00:00:03,000 --> 00:00:04,000\n<i>JORDAN: Yes.</i>", "application/x-subrip"); assert.equal(s.text, "JOE: Hi. There.\nJORDAN: Yes.");
  const j = T.transcriptToText({ version: "1.0.0", segments: [{ speaker: "Host", body: "One." }, { speaker: "Host", body: "Two." }, { speaker: "Guest", body: "Three." }] }, "application/json"); assert.equal(j.text, "HOST: One. Two.\nGUEST: Three."); assert.equal(j.cues, 3);
  const y = T.transcriptToText(JSON.stringify(JSON3), "application/json", "https://www.youtube.com/api/timedtext?fmt=json3"); assert.equal(y.speakers.length, 0); assert.match(y.text, /^so today we talk about plans\. A bad plan beats no plan\./); assert.ok(!/so today so today/.test(y.text), "rolling repeats collapsed");
  const html = T.transcriptToText("<html><head><title>Tr</title></head><body><p>HOST: Hello.</p><p>GUEST: Hi.</p></body></html>", "text/html"); assert.equal(html.format, "html"); assert.deepEqual(html.speakers, ["HOST", "GUEST"]);
  const plain = T.transcriptToText("Just   words\n\n\n\nmore", "text/plain"); assert.equal(plain.text, "Just words\n\nmore"); assert.deepEqual(plain.speakers, []);
  const sniffed = T.transcriptToText("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nno type given\n", "", ""); assert.equal(sniffed.format, "vtt");
  // hostile shapes do not throw: out-of-range entities, json3 with non-array parts
  assert.doesNotThrow(() => F.parseFeed(FEED.replace("The Test Show", "T &#x110000; &#99999999999; &#xD800; S")));
  assert.equal(T.transcriptToText(JSON.stringify({ events: [{ segs: "x" }, null, { segs: [null, { utf8: "ok words here" }] }] }), "application/json", "json3").text, "ok words here");
  const paras = T.cuesToText(Array.from({ length: 40 }, (_, i) => ({ speaker: "", text: "Sentence number " + i + " is here and it is long enough to matter." }))); assert.ok(paras.text.split("\n\n").length >= 3, "unlabelled cues become paragraphs at sentence ends");
});

test("links are classified; the locators find the episode through Apple, Spotify, a feed, or a page; a show link offers a choice", async () => {
  assert.deepEqual(["https://podcasts.apple.com/us/podcast/x/id999?i=1001", "https://podcasts.apple.com/us/podcast/x/id999", "https://open.spotify.com/episode/abc", "https://open.spotify.com/show/abc", "https://www.youtube.com/watch?v=AbCdEfGhIjK", "https://youtu.be/AbCdEfGhIjK", "https://www.youtube.com/@channel", "https://feeds.example.com/x", "https://show.test/feed.xml", "https://x.test/article", "not a link"].map(u => classify(u).kind), ["apple-episode", "apple-show", "spotify-episode", "spotify-show", "youtube", "youtube", "youtube-other", "feed", "feed", "page", "invalid"]);
  const f = fakeFetch(); const R = createResolver({ fetch: f, env: {}, engines: {}, run: noYtdlp }); const steps = []; const step = (n, s) => steps.push(n + ": " + s);
  let loc = await R.locate({ url: "https://podcasts.apple.com/us/podcast/x/id999?i=1001" }, step); assert.equal(loc.kind, "episode"); assert.equal(loc.item.guid, "g-1"); assert.match(loc.matchedBy, /Apple's listing, then the feed by guid/); assert.equal(loc.show.name, "The Test Show");
  loc = await R.locate({ url: "https://podcasts.apple.com/us/podcast/x/id999" }, step); assert.equal(loc.kind, "choose"); assert.equal(loc.episodes.length, 3); assert.equal(loc.episodes[0].hasTranscript, true); assert.equal(loc.episodes[1].hasTranscript, false);
  loc = await R.locate({ url: "https://podcasts.apple.com/us/podcast/x/id999", guid: "g-0" }, step); assert.equal(loc.kind, "episode"); assert.equal(loc.item.guid, "g-0");
  await assert.rejects(R.locate({ url: "https://podcasts.apple.com/us/podcast/x/id404?i=1" }, step), /Apple lists no feed/);
  loc = await R.locate({ url: "https://open.spotify.com/episode/abc" }, step); assert.equal(loc.kind, "episode"); assert.equal(loc.item.guid, "g-1"); assert.match(loc.matchedBy, /Spotify episode title → Apple search → feed by guid/);
  loc = await R.locate({ url: "https://open.spotify.com/show/abc" }, step); assert.equal(loc.kind, "choose"); assert.match(loc.note, /Spotify by show title/);
  loc = await R.locate({ url: "https://show.test/feed.xml" }, step); assert.equal(loc.kind, "choose");
  loc = await R.locate({ url: "https://show.test/feed.xml", guid: "g-2" }, step); assert.equal(loc.kind, "episode");
  loc = await R.locate({ url: "https://show.test/ep1" }, step); assert.equal(loc.kind, "episode", "a page that links to its feed"); assert.equal(loc.item.guid, "g-1"); assert.match(loc.matchedBy, /page's feed by title/);
  loc = await R.locate({ url: "https://x.test/article" }, step); assert.equal(loc.kind, "article");
  loc = await R.locate({ url: "https://www.youtube.com/watch?v=AbCdEfGhIjK" }, step); assert.equal(loc.kind, "video");
  await assert.rejects(R.locate({ url: "https://x.com/someone/status/1" }, step), /X requires a login/);
  await assert.rejects(R.locate({ url: "https://www.youtube.com/@channel" }, step), /one video/);
  // this computer and private networks are never fetched, whether pasted or linked from a feed
  await assert.rejects(R.locate({ url: "http://127.0.0.1:3123/api/runs" }, step), /private network/);
  await assert.rejects(R.locate({ url: "http://192.168.1.10/feed.xml" }, step), /private network/);
  for (const u of ["http://[::ffff:127.0.0.1]/x", "http://[::]/x", "http://localhost./x", "http://[fec0::1]/x", "http://100.64.0.1/x", "http://127.1/x", "http://2130706433/x", "http://0x7f000001/x", "http://a.localhost/x"]) await assert.rejects(R.locate({ url: u }, step), /private network|not a valid/, u);
  const { isPrivateHost } = require("../server/podcast/resolve"); assert.equal(isPrivateHost("feeds.megaphone.fm"), false); assert.equal(isPrivateHost("2606:4700::1"), false);
  // a public address that redirects to a private one is refused at the hop
  const fr = fakeFetch(u => u === "https://bounce.test/feed" ? { status: 302, body: "", headers: { location: "http://127.0.0.1:3123/api/runs" } } : null);
  const fr2 = async (u, o) => { const r = await fr(u, o); if (u === "https://bounce.test/feed") r.headers = { get: k => k.toLowerCase() === "location" ? "http://127.0.0.1:3123/api/runs" : null }; return r; };
  await assert.rejects(createResolver({ fetch: fr2, env: {}, engines: {}, run: noYtdlp }).locate({ url: "https://bounce.test/feed" }, step), /private network/);
  // a public redirect is followed, with a bound
  const loopy = async (u) => ({ status: 302, url: u, headers: { get: k => k.toLowerCase() === "location" ? "https://loop.test/" + Math.random() : null }, text: async () => "" });
  await assert.rejects(createResolver({ fetch: loopy, env: {}, engines: {}, run: noYtdlp }).locate({ url: "https://loop.test/a" }, step), /too many redirects/);
  const fp = fakeFetch(u => u === "https://show.test/feed.xml" ? { body: FEED.replace("https://show.test/ep2.vtt", "http://localhost:3123/api/health").replace("https://cdn.test/ep2.mp3?x=1", "http://10.0.0.5/ep.mp3") } : null);
  const Rp = createResolver({ fetch: fp, env: {}, engines: { local: fakeLocal(true) }, run: noYtdlp });
  const lp = await Rp.locate({ url: "https://show.test/feed.xml", guid: "g-2" }, step); const wp = await Rp.words(lp, { step, choice: "local" });
  assert.ok(wp.tried.some(t => /private network/.test(t.error)), "the feed's local transcript link was refused: " + JSON.stringify(wp.tried));
  assert.equal(wp.ok, true, "the YouTube link in the notes still served"); assert.equal(wp.source.kind, "youtube-captions");
  assert.ok(steps.some(s => /Apple Podcasts: show: The Test Show/.test(s)));
});

test("the four steps: the feed's transcript first (a failed file is skipped), then YouTube captions, then the episode page, then the audio only by a chosen engine", async () => {
  const f = fakeFetch(); const local = fakeLocal(false);
  const R = createResolver({ fetch: f, env: {}, engines: { local, cloud: deepgramEngine({ apiKey: "", fetch: f, env: {} }) }, run: noYtdlp }); const step = () => {};
  // ep2: json transcript answers 500, vtt works
  let loc = await R.locate({ url: "https://show.test/feed.xml", guid: "g-2" }, step);
  let w = await R.words(loc, { step }); assert.equal(w.ok, true); assert.equal(w.source.kind, "feed-transcript"); assert.equal(w.source.format, "vtt"); assert.deepEqual(w.speakers, ["HOST", "GUEST"]); assert.equal(w.tried.length, 1); assert.match(w.tried[0].error, /HTTP 500/); assert.equal(w.episode.title, "Ep 2: Greener & browner");
  // ep2 with the vtt gone: the YouTube link in the notes gives captions (built-in reader; yt-dlp absent)
  const f2 = fakeFetch(u => u === "https://show.test/ep2.vtt" ? { status: 404, body: "" } : null);
  const R2 = createResolver({ fetch: f2, env: {}, engines: { local }, run: noYtdlp });
  loc = await R2.locate({ url: "https://show.test/feed.xml", guid: "g-2" }, step); w = await R2.words(loc, { step });
  assert.equal(w.ok, true); assert.equal(w.source.kind, "youtube-captions"); assert.equal(w.source.reader, "built-in"); assert.equal(w.source.automatic, true); assert.match(w.source.note, /automatic captions/); assert.equal(w.speakers.length, 0); assert.ok(w.tried.some(t => t.step === "feed transcript"));
  // ep1: no transcript, no video, a page without one, audio but no engine chosen or installed → an honest stop with the audio
  loc = await R.locate({ url: "https://show.test/feed.xml", guid: "g-1" }, step); w = await R.words(loc, { step });
  assert.equal(w.ok, false); assert.match(w.reason, /no transcript was published anywhere/); assert.deepEqual(w.needsTranscription, { audioUrl: "https://cdn.test/ep1.mp3", duration: 3600, available: { local: false, cloud: false }, wanted: null });
  assert.deepEqual(w.tried.map(t => t.step), ["feed transcript", "youtube search", "episode page"]); assert.match(w.tried[1].error, /needs yt-dlp/); assert.match(w.tried[2].error, /no transcript on the page/);
  // a chosen engine that is not available says so rather than guessing
  w = await R.words(loc, { step, choice: "cloud" }); assert.equal(w.ok, false); assert.match(w.reason, /no Deepgram key is set/); assert.equal(w.needsTranscription.wanted, "cloud");
  // with the local engine installed and chosen, the audio is transcribed and the origin says which engine
  const R3 = createResolver({ fetch: f, env: {}, engines: { local: fakeLocal(true), cloud: deepgramEngine({ apiKey: "", fetch: f, env: {} }) }, run: noYtdlp });
  const progress = []; w = await R3.words(loc, { step, choice: "local", onProgress: p => progress.push(p) });
  assert.equal(w.ok, true); assert.equal(w.source.kind, "audio-transcription"); assert.equal(w.source.engine, "local"); assert.equal(w.source.model, "fake-whisper"); assert.equal(w.text, "local words from https://cdn.test/ep1.mp3"); assert.equal(progress[0].stage, "transcribing");
  // with a Deepgram key and no local engine, the cloud is used by default; speakers are numbered by voice
  const R4 = createResolver({ fetch: f, env: {}, engines: { local: fakeLocal(false), cloud: deepgramEngine({ apiKey: "k".repeat(40), fetch: f, env: {} }) }, run: noYtdlp });
  w = await R4.words(loc, { step }); assert.equal(w.ok, true); assert.equal(w.source.engine, "deepgram"); assert.equal(w.source.requestId, "dg-1"); assert.equal(w.text, "SPEAKER 1: Welcome back. Today we talk about plans.\nSPEAKER 2: A bad plan beats no plan."); assert.deepEqual(w.speakers, ["SPEAKER 1", "SPEAKER 2"]);
  const dg = f.calls.find(u => /deepgram/.test(u)); assert.match(dg, /diarize=true/);
  // an utterance without a speaker number gets no invented speaker
  const f6 = fakeFetch(u => /deepgram/.test(u) ? { body: { metadata: {}, results: { utterances: [{ transcript: "no speaker here" }, { speaker: 0, transcript: "one" }] } } } : null);
  const d6 = await deepgramEngine({ apiKey: "k".repeat(40), fetch: f6, env: {} }).transcribe({ audioUrl: "https://cdn.test/a.mp3" }); assert.equal(d6.text, "SPEAKER: no speaker here\nSPEAKER 1: one"); assert.ok(!/NAN/.test(d6.text));
  // both available: TRANSCRIBE_PREFER decides; an explicit choice overrides it
  const R5 = createResolver({ fetch: f, env: { TRANSCRIBE_PREFER: "local" }, engines: { local: fakeLocal(true), cloud: deepgramEngine({ apiKey: "k".repeat(40), fetch: f, env: {} }) }, run: noYtdlp });
  w = await R5.words(loc, { step }); assert.equal(w.source.engine, "local"); w = await R5.words(loc, { step, choice: "cloud" }); assert.equal(w.source.engine, "deepgram");
  // ep0: audio but no page and no notes
  loc = await R.locate({ url: "https://show.test/feed.xml", guid: "g-0" }, step); w = await R.words(loc, { step }); assert.equal(w.ok, false); assert.equal(w.tried[2].error, "the feed gives no page for this episode");
});

test("youtube: yt-dlp is preferred when present (a fake writes the VTT), the built-in reader otherwise; refusals are reported as what they are", async () => {
  const f = fakeFetch();
  const fakeYtdlp = async (cmd, args, opts) => { if (args[0] === "--version") return { code: 0, out: "2026.09.01\n", err: "" }; if (args.includes("--skip-download")) { const out = args[args.indexOf("-o") + 1].replace("%(id)s", "AbCdEfGhIjK.en.vtt"); fs.writeFileSync(out, "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nfrom yt-dlp with enough words to count " + "z ".repeat(100) + "\n"); return { code: 0, out: "", err: "" }; } if (String(args[args.length - 1]).startsWith("ytsearch")) return { code: 0, out: "AbCdEfGhIjK\tEp 1: No transcript — The Test Show\tThe Test Show\n", err: "" }; return { code: 1, out: "", err: "?" }; };
  let r = await YT.captions({ url: "https://youtu.be/AbCdEfGhIjK", fetch: f, env: {}, run: fakeYtdlp }); assert.equal(r.reader, "yt-dlp"); assert.match(r.text, /^from yt-dlp/); assert.equal(r.title, "Ep 2 video");
  r = await YT.captions({ url: "https://youtu.be/AbCdEfGhIjK", fetch: f, env: {}, run: noYtdlp }); assert.equal(r.reader, "built-in"); assert.equal(r.tried[0].reader, "yt-dlp"); assert.match(r.tried[0].error, /not installed/);
  const refused = fakeFetch(u => /youtubei/.test(u) ? { body: { playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you’re not a bot" } } } : null);
  await assert.rejects(YT.captions({ url: "https://youtu.be/AbCdEfGhIjK", fetch: refused, env: {}, run: noYtdlp }), /not a bot.*yt-dlp usually gets through/);
  const none = fakeFetch(u => /youtubei/.test(u) ? { body: { playabilityStatus: { status: "OK" }, captions: {} } } : null);
  await assert.rejects(YT.captions({ url: "https://youtu.be/AbCdEfGhIjK", fetch: none, env: {}, run: noYtdlp }), /no captions/);
  // A title-only search result must not silently become this episode’s transcript.
  const R = createResolver({ fetch: f, env: {}, engines: {}, run: fakeYtdlp });
  const loc = await R.locate({ url: "https://show.test/feed.xml", guid: "g-1" }, () => {}); const w = await R.words(loc, { step: () => {} });
  assert.equal(w.ok, false); assert.ok(w.needsTranscription); assert.ok(w.tried.some(t=>/no result had both the episode's full title and its length/.test(t.error)));
});

test("engines: audio downmixes and resamples, cuts land in quiet; the local engine says plainly when it is not installed", async () => {
  const stereo = [new Float32Array([1, 1, 1, 1]), new Float32Array([0, 0, 0, 0])]; const m = toMono16k(stereo, 32000); assert.equal(m.length, 2); assert.ok(Math.abs(m[0] - 0.5) < 1e-6);
  const pcm = new Float32Array(16000 * 30).fill(0.5); for (let i = 16000 * 22; i < 16000 * 23; i++) pcm[i] = 0; const cut = quietestCut(pcm); assert.ok(cut > 16000 * 21.5 && cut < 16000 * 23.5, "cut at " + cut / 16000 + " s");
  const { localEngine } = require("../server/podcast/engines"); const eng = localEngine({ dataDir: tmp(), env: {} });
  assert.equal(eng.installed(), false); await assert.rejects(eng.transcribe({ audioUrl: "https://cdn.test/x.mp3" }), e => e.code === "local_not_installed");
});

test("over HTTP: a resolve job runs, is polled, persists its result, can be stopped; engines and settings are reported and set", async () => {
  const dataDir = tmp(); const f = fakeFetch();
  let slowSignal = null;
  const local = Object.assign(fakeLocal(true), { transcribe: async ({ signal }) => { slowSignal = signal; await new Promise((res, rej) => { const t = setTimeout(res, 3000); signal.addEventListener("abort", () => { clearTimeout(t); const e = new Error("stopped"); e.code = "cancelled"; rej(e); }); }); return { text: "late", speakers: [], engine: "local", model: "fake", durationSeconds: 1, note: "" }; } });
  const { app, ready } = createApp({ dataDir, ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), fetch: f, run: noYtdlp, localEngine: local, env: { TRANSCRIBE_PREFER: "" }, envPath: path.join(dataDir, ".env") });
  await ready; const server = await new Promise(r => { const s = app.listen(0, "127.0.0.1", () => r(s)); }); const base = "http://127.0.0.1:" + server.address().port;
  const api = async (m, p, body) => { const r = await fetch(base + p, { method: m, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };
  const poll = async id => { for (;;) { const j = (await api("GET", "/api/transcript/jobs/" + id)).data; if (j.state !== "running") return j; await new Promise(r => setTimeout(r, 60)); } };
  try {
    const e0 = (await api("GET", "/api/transcript/engines")).data; assert.equal(e0.local.installed, true); assert.equal(e0.cloud.configured, false); assert.equal(e0.ytdlp, "");
    let j = await poll((await api("POST", "/api/transcript/resolve", { url: "https://show.test/feed.xml", guid: "g-2" })).data.jobId);
    assert.equal(j.state, "done"); assert.equal(j.result.kind, "transcript"); assert.equal(j.result.source.kind, "feed-transcript"); assert.ok(j.result.chars > 200); assert.ok(j.steps.some(s => /Feed transcript/.test(s.name)));
    assert.ok(fs.existsSync(path.join(dataDir, "jobs", j.id + ".json")), "the result is on disk");
    j = await poll((await api("POST", "/api/transcript/resolve", { url: "https://show.test/feed.xml" })).data.jobId); assert.equal(j.result.kind, "choose"); assert.equal(j.result.episodes.length, 3);
    j = await poll((await api("POST", "/api/transcript/resolve", { url: "https://x.test/article" })).data.jobId); assert.equal(j.result.kind, "article"); assert.equal(j.result.title, "An article");
    const bad = await api("POST", "/api/transcript/resolve", { url: "" }); assert.equal(bad.status, 400);
    j = await poll((await api("POST", "/api/transcript/resolve", { url: "https://x.com/u/status/1" })).data.jobId); assert.equal(j.state, "error"); assert.match(j.error.message, /X requires a login/);
    // a long audio transcription is stopped by the person
    const started = (await api("POST", "/api/transcript/resolve", { url: "https://show.test/feed.xml", guid: "g-1", choice: "local" })).data;
    await new Promise(r => setTimeout(r, 150)); assert.ok(slowSignal, "the engine was started");
    assert.equal((await api("POST", "/api/transcript/jobs/" + started.jobId + "/cancel")).data.ok, true);
    j = await poll(started.jobId); assert.equal(j.state, "cancelled"); assert.equal(slowSignal.aborted, true);
    assert.equal((await api("GET", "/api/transcript/jobs/nope")).status, 404);
    // settings: a Deepgram key is accepted once, never echoed; the preference is a closed set; unknown names refused
    const k = await api("POST", "/api/settings/key", { name: "DEEPGRAM_API_KEY", key: "D".repeat(40) }); assert.equal(k.status, 200); assert.equal(k.data.cloud.configured, true); assert.ok(!JSON.stringify(k.data).includes("DDDD"));
    assert.match(fs.readFileSync(path.join(dataDir, ".env"), "utf8"), /^DEEPGRAM_API_KEY=D{40}$/m);
    assert.equal((await api("POST", "/api/settings/key", { name: "DEEPGRAM_API_KEY", key: "short" })).status, 400);
    assert.equal((await api("POST", "/api/settings/key", { name: "PORT", key: "1" })).status, 400);
    for (const n of ["constructor", "__proto__", "toString", "hasOwnProperty"]) assert.equal((await api("POST", "/api/settings/key", { name: n, key: "x" })).status, 400, n);
    assert.equal((await api("PUT", "/api/transcript/prefer", { engine: "cloud" })).data.prefer, "cloud"); assert.equal((await api("PUT", "/api/transcript/prefer", { engine: "x" })).status, 400);
    assert.equal((await api("GET", "/api/transcript/engines")).data.prefer, "cloud");
    assert.deepEqual(Object.keys(SETTABLE), ["ANTHROPIC_API_KEY", "DEEPGRAM_API_KEY", "TRANSCRIBE_PREFER"]);
    // the run created from a fetched transcript keeps where it came from
    const b = (await api("POST", "/api/runs", { run: { import: { url: "https://show.test/feed.xml", title: "Ep 2", fetchedAt: "2026-10-03T00:00:00Z", chars: 10, method: "transcript: feed-transcript", source: { kind: "feed-transcript", url: "https://show.test/ep2.vtt", note: "the transcript the show publishes", format: "vtt" }, show: "The Test Show", episode: "Ep 2", matchedBy: "feed by guid", speakers: ["HOST", "GUEST"] } }, transcript: "HOST: Hello there.\nGUEST: Hi." })).data;
    assert.equal(b.run.import.source.kind, "feed-transcript"); assert.equal(b.run.import.source.show, "The Test Show"); assert.deepEqual(b.run.import.source.speakers, ["HOST", "GUEST"]);
    assert.equal((await api("GET", "/api/runs/" + b.run.id + "/export.json")).data.run.import.source.url, "https://show.test/ep2.vtt");
  } finally { await new Promise(r => server.close(r)); }
});


/* YouTube's automatic captions as yt-dlp writes them (structure copied from a real file fetched on 3 Oct 2026; the
   words here are invented): each cue shows the previous line (or a single space) and the line being typed with
   per-word timing tags, then a 10 ms cue repeats the finished line. */
const ROLLING = ["WEBVTT", "Kind: captions", "Language: en", "",
  "00:00:00.320 --> 00:00:03.790 align:start position:0%", " ", "[Music]", "",
  "00:00:03.790 --> 00:00:03.800 align:start position:0%", " ", " ", "",
  "00:00:03.800 --> 00:00:06.790 align:start position:0%", " ", "so<00:00:04.039><c> the</c><00:00:04.359><c> study</c><00:00:04.840><c> said</c>", "",
  "00:00:06.790 --> 00:00:06.800 align:start position:0%", "so the study said", " ", "",
  "00:00:06.800 --> 00:00:10.950 align:start position:0%", "so the study said", "fifteen<00:00:07.800><c> percent</c><00:00:08.039><c> fewer</c><00:00:08.279><c> sick</c><00:00:08.600><c> days</c>", "",
  "00:00:10.950 --> 00:00:10.960 align:start position:0%", "fifteen percent fewer sick days", " ", "",
  "00:00:10.960 --> 00:00:14.109 align:start position:0%", "fifteen percent fewer sick days", "no<00:00:11.300><c> no</c><00:00:11.600><c> no</c>", "",
  "00:00:14.109 --> 00:00:14.119 align:start position:0%", "no no no", " ", "",
  "00:00:14.119 --> 00:00:15.269 align:start position:0%", "no no no", "really", ""].join("\n");
const ROLLING_JSON3 = { events: [{ tStartMs: 0, dDurationMs: 15269, id: 1, wpWinPosId: 1 }, { tStartMs: 320, dDurationMs: 3470, wWinId: 1, segs: [{ utf8: "[Music]" }] }, { tStartMs: 3790, wWinId: 1, aAppend: 1, segs: [{ utf8: "\n" }] },
  { tStartMs: 3800, dDurationMs: 3000, wWinId: 1, segs: [{ utf8: "so" }, { utf8: " the" }, { utf8: " study" }, { utf8: " said" }] }, { tStartMs: 6790, wWinId: 1, aAppend: 1, segs: [{ utf8: "\n" }] },
  { tStartMs: 6800, dDurationMs: 4150, wWinId: 1, segs: [{ utf8: "fifteen" }, { utf8: " percent" }, { utf8: " fewer" }, { utf8: " sick" }, { utf8: " days" }] }, { tStartMs: 10950, wWinId: 1, aAppend: 1, segs: [{ utf8: "\n" }] },
  { tStartMs: 10960, dDurationMs: 3150, wWinId: 1, segs: [{ utf8: "no" }, { utf8: " no" }, { utf8: " no" }] }, { tStartMs: 14109, wWinId: 1, aAppend: 1, segs: [{ utf8: "\n" }] },
  { tStartMs: 14119, dDurationMs: 1150, wWinId: 1, segs: [{ utf8: "really" }] }] };

test("captions: YouTube's rolling VTT keeps every line once and reads the same as its json3; genuine repeats in ordinary captions stay", () => {
  const v = T.transcriptToText(ROLLING, "text/vtt", "x.en.vtt"), j = T.transcriptToText(JSON.stringify(ROLLING_JSON3), "application/json", "x.en.json3");
  assert.equal(v.text, "[Music] so the study said fifteen percent fewer sick days no no no really");
  assert.equal(v.rolling, true);
  assert.equal(j.text.replace(/\s+/g, " "), v.text, "the two formats YouTube offers give the same words");
  // ordinary captions: a speaker who repeats himself across cues keeps every word; a space-only line does not end a cue
  const manual = "WEBVTT\n\n00:00:05.318 --> 00:00:07.974\nthe thing about these is that they have really...\n\n00:00:07.974 --> 00:00:12.616\nreally really long trunks\n\n00:00:12.616 --> 00:00:14.000\n \nand that's it\n";
  assert.equal(T.transcriptToText(manual, "text/vtt", "m.vtt").text, "the thing about these is that they have really... really really long trunks and that's it");
});

test("yt-dlp: published captions are asked for first and automatic ones second, so the result says which it is; json3 is preferred", async () => {
  const asked = [];
  const runner = written => async (cmd, args) => {
    if (args[0] === "--version") return { code: 0, out: "2026.09.01\n", err: "" };
    asked.push(args.find(a => /^--write-(auto-)?subs$/.test(a)) + " " + args[args.indexOf("--sub-format") + 1]);
    const kind = args.includes("--write-subs") ? "manual" : "auto", file = written[kind];
    if (file) fs.writeFileSync(args[args.indexOf("-o") + 1].replace("%(id)s", "AbCdEfGhIjK.en." + file.ext), file.body);
    return { code: 0, out: "", err: "" };
  };
  let r = await YT.captionsYtdlp("AbCdEfGhIjK", "en", {}, runner({ auto: { ext: "json3", body: JSON.stringify(ROLLING_JSON3) } }));
  assert.equal(r.track.automatic, true); assert.equal(r.format, "json"); assert.match(r.text, /^\[Music\] so the study said/);
  assert.deepEqual(asked, ["--write-subs json3/vtt", "--write-auto-subs json3/vtt"]);
  asked.length = 0;
  r = await YT.captionsYtdlp("AbCdEfGhIjK", "en", {}, runner({ manual: { ext: "vtt", body: "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nwords a person typed\n" } }));
  assert.equal(r.track.automatic, false); assert.equal(r.text, "words a person typed"); assert.equal(asked.length, 1);
  await assert.rejects(YT.captionsYtdlp("AbCdEfGhIjK", "en", {}, runner({})), /wrote no caption file/);
});

test("youtube search: a result is used only with the episode's full title and a matching length; clips and other episodes are refused", async () => {
  const f = fakeFetch();
  const searcher = rows => async (cmd, args) => {
    if (args[0] === "--version") return { code: 0, out: "2026.09.01\n", err: "" };
    if (String(args[args.length - 1]).startsWith("ytsearch")) return { code: 0, out: rows.map(r => r.join("\t")).join("\n") + "\n", err: "" };
    if (args.includes("--skip-download")) { if (args.includes("--write-auto-subs")) fs.writeFileSync(args[args.indexOf("-o") + 1].replace("%(id)s", args[args.length - 1].slice(-11) + ".en.json3"), JSON.stringify({ events: [{ segs: [{ utf8: "captions of the found video " + "w ".repeat(150) }] }] })); return { code: 0, out: "", err: "" }; }
    return { code: 1, out: "", err: "?" };
  };
  const words = async rows => { const R = createResolver({ fetch: f, env: {}, engines: {}, run: searcher(rows) }); return R.words(await R.locate({ url: "https://show.test/feed.xml", guid: "g-1" }, () => {}), { step: () => {} }); };
  // Ep 1 is 3600 s long. A clip with the title, another episode, and the full upload 2 minutes shorter (ads).
  let w = await words([["ClipClipClp", "Ep 1: No transcript (best moment) | The Test Show", "Test Clips", "640"], ["OtherEpisod", "Ep 11: No transcript — The Test Show", "The Test Show", "3590"], ["FullEpisode", "The Test Show — Ep 1: No transcript", "The Test Show", "3480"]]);
  assert.equal(w.ok, true, JSON.stringify(w.tried)); assert.equal(w.source.kind, "youtube-captions"); assert.equal(w.source.url, "https://www.youtube.com/watch?v=FullEpisode");
  assert.match(w.source.note, /full title and a length within 2 min of it; confirm it is the same episode/);
  // the comparison a person needs is kept with the result, and the match is marked as needing their confirmation
  assert.equal(w.identity, "needs_confirmation"); assert.equal(w.match.method, "youtube-search"); assert.equal(w.match.toleranceSeconds, 180);
  assert.deepEqual(w.match.episode, { title: "Ep 1: No transcript", durationSeconds: 3600 }); assert.equal(w.match.video.id, "FullEpisode"); assert.equal(w.match.video.durationSeconds, 3480); assert.equal(w.match.differenceSeconds, 120);
  // only the clip and the other episode: nothing is used, and the chain moves on
  w = await words([["ClipClipClp", "Ep 1: No transcript (best moment)", "Test Clips", "640"], ["OtherEpisod", "Ep 11: No transcript", "The Test Show", "3600"]]);
  assert.equal(w.ok, false); assert.ok(w.tried.some(t => t.step === "youtube search" && /full title and its length/.test(t.error)));
  // no length in the feed: no search at all
  const R = createResolver({ fetch: f, env: {}, engines: {}, run: searcher([["FullEpisode", "Ep 0: audio only, no page", "x", "100"]]) });
  w = await R.words(await R.locate({ url: "https://show.test/feed.xml", guid: "g-0" }, () => {}), { step: () => {} });
  assert.ok(w.tried.some(t => t.step === "youtube search" && /length is not given/.test(t.error)));
});

test("intake: an uploaded caption file (VTT, SRT, Podcasting 2.0 JSON) is read as text; the upload is kept as it was", async () => {
  const { cleanText } = require("../server/intake");
  let r = cleanText(ROLLING);
  assert.equal(r.text, "[Music] so the study said fifteen percent fewer sick days no no no really"); assert.match(r.record.method, /^Converted from WebVTT captions \(rolling captions, each line kept once\)/); assert.equal(r.original, ROLLING);
  r = cleanText("1\n00:00:01,000 --> 00:00:02,000\nHOST: Hello there.\n\n2\n00:00:02,000 --> 00:00:04,000\nGUEST: Hi, thanks.\n\n3\n00:00:04,000 --> 00:00:06,000\nHOST: Shall we?\n");
  assert.equal(r.text, "HOST: Hello there.\nGUEST: Hi, thanks.\nHOST: Shall we?"); assert.equal(r.record.converted, "SRT captions");
  r = cleanText(JSON.stringify({ version: "1.0", segments: [{ speaker: "Ann", body: "Welcome." }, { speaker: "Bo", body: "Thanks." }, { speaker: "Ann", body: "Go on." }] }));
  assert.equal(r.text, "ANN: Welcome.\nBO: Thanks.\nANN: Go on.");
  assert.throws(() => cleanText(JSON.stringify({ schema: "something else" })), /no transcript text/);
});
