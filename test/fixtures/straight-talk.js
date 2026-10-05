"use strict";
/* The invented show the 0.14 tests share: Walt Brannigan's Straight Talk Hour as the chain finds it (Apple's listing, the
   feed, a recording of an announcer, the host, a guest and an advertisement as Deepgram hears it), a scripted mock
   model, a server on a temporary folder, and the guard that fails a reading still showing "Speaker n" for a voice the
   conversation names. Invented people and an invented show; no real transcript. */
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../../server/app");
const { createMockAI } = require("../../server/ai");
const { createResearch } = require("../../server/research");
const shared = require("../../shared/transcript");

/* ---------- the invented show, as the chain finds it ---------- */
const SHOW = "Walt Brannigan’s Straight Talk Hour", HOST = "Walt Brannigan", GUEST = "Marcus Delacroix";
const EPISODE = "We’ll Do It LIVE! — Marcus Delacroix";
const AUDIO = "https://cdn.straighttalk.test/ep/live-delacroix.mp3";
const APPLE_LINK = "https://podcasts.apple.com/us/podcast/straight-talk/id4242?i=5151";
const FEED = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title>${SHOW}</title><link>https://straighttalk.test/</link><description>Opinion and interviews.</description><itunes:author>The Straight Talk Network</itunes:author>
<item><title>${EPISODE}</title><guid isPermaLink="false">stk-live-77</guid><pubDate>Wed, 01 Oct 2026 22:00:00 GMT</pubDate><itunes:duration>2940</itunes:duration>
  <enclosure url="${AUDIO}" type="audio/mpeg" length="47000000"/><description>Tonight: trade, steel and what comes next.</description></item>
<item><title>An older episode</title><guid>stk-76</guid><pubDate>Tue, 30 Sep 2026 22:00:00 GMT</pubDate><enclosure url="https://cdn.straighttalk.test/ep/76.mp3" type="audio/mpeg"/></item>
</channel></rss>`;
const APPLE = { resultCount: 2, results: [
  { wrapperType: "track", kind: "podcast", collectionId: 4242, trackId: 4242, collectionName: SHOW, artistName: HOST, feedUrl: "https://feeds.straighttalk.test/rss" },
  { wrapperType: "podcastEpisode", kind: "podcast-episode", trackId: 5151, trackName: EPISODE, episodeGuid: "stk-live-77", episodeUrl: AUDIO, releaseDate: "2026-10-01T22:00:00Z", feedUrl: "https://feeds.straighttalk.test/rss", collectionName: SHOW, collectionId: 4242 },
] };
/* The recording as Deepgram hears it: an announcer (voice 0), the host (1), the guest (2) and an advertisement read by
   another voice (3). The host never says his own name; the guest is introduced by name. The host's one-word "Right."
   breaks into the guest's answer. */
const SAID = [
  [0, "From the studios in New York, this is the Straight Talk Hour with Walt Brannigan."],
  [1, "Good evening and welcome to the Straight Talk Hour. Lots to get to tonight. The steel numbers came out this morning, and they surprised a lot of people in Washington."],
  [1, "Joining us now from Washington, Marcus Delacroix, former trade adviser. Marcus, thanks for coming on."],
  [2, "Thanks for having me, Walt. It's good to be back."],
  [1, "So, Marcus, what do the steel numbers actually show?"],
  [2, "They show output up eleven percent since the tariffs took effect. The mills in Ohio reopened two lines this spring."],
  [1, "Right."],
  [2, "And the critics who said prices would double were wrong. Prices rose four percent over the year."],
  [1, "But the critics say the new jobs went to machines, not to people."],
  [2, "Some did. But the plants hired eight hundred workers last year, and that is in the company filings."],
  [1, "We'll be right back after this."],
  [3, "The Straight Talk Hour is brought to you by Comfy Pillow. Tired of tossing and turning? Go to comfypillow.com and use promo code WALT for forty percent off your first order."],
  [1, "And we're back. Marcus, one last question. Will the tariffs stay?"],
  [2, "I think they will, because both parties now support them, and the mills are hiring again."],
  [1, "Marcus Delacroix, thank you for joining us tonight."],
];
const DEEPGRAM = said => ({ metadata: { request_id: "dg-req-0140", duration: 2940, models: ["nova-3-general"] }, results: { utterances: said.map(([speaker, transcript]) => ({ speaker, transcript })) } });
const KEY = "dg-test-key-0123456789abcdef0123456789abcdef";
function chainFetch(said, extra) {
  const calls = [];
  const f = async (url, opts) => {
    const u = String(url); calls.push({ url: u, method: opts && opts.method || "GET", headers: opts && opts.headers || {}, body: opts && opts.body || "" });
    const res = (status, body, type) => ({ status, url: u, headers: { get: k => k.toLowerCase() === "content-type" ? type || "text/plain" : null }, text: async () => typeof body === "string" ? body : JSON.stringify(body) });
    const o = extra && extra(u, opts); if (o) return res(o.status || 200, o.body, o.type);
    if (/itunes\.apple\.com\/lookup\?id=4242/.test(u)) return res(200, APPLE, "application/json");
    if (u === "https://feeds.straighttalk.test/rss") return res(200, FEED, "application/rss+xml");
    if (/^https:\/\/api\.deepgram\.com\/v1\/listen/.test(u)) return res(200, DEEPGRAM(said), "application/json");
    return res(404, "not here");
  };
  f.calls = calls; return f;
}
const noYtdlp = async () => ({ code: -1, out: "", err: "ENOENT" });
/* The mock model, with the parts these tests script: the advertisement the structure pass finds (its first and last
   words, and the sponsor's words in it, as a model would quote them), optionally the identification's answer, and a
   record of every prompt sent. */
function scriptedAI(opts) {
  const mock = createMockAI(), prompts = [];
  const answer = data => ({ data, text: JSON.stringify(data), model: "mock", requestId: "mock_s" + prompts.length, stopReason: "end_turn", usage: null });
  return Object.assign({}, mock, { prompts, async sample(args) {
    const p = String(args.prompt || ""); prompts.push(p);
    if (p.startsWith("Find recordings played") && !(opts && opts.noAds)) {
      const paras = [...p.matchAll(/^\[(\d+)\] (.*)$/gm)].map(m => ({ i: +m[1], text: m[2].replace(/^[A-Z][A-Z0-9 ]*:\s*/, "") }));
      const ads = paras.filter(x => /brought to you by/.test(x.text)).map(x => { const w = x.text.split(/\s+/); return { para: x.i, endPara: x.i, start: w.slice(0, 6).join(" "), end: w.slice(-6).join(" "), cue: (/brought to you by [A-Z]\w+ [A-Z]\w+/.exec(x.text) || [""])[0] }; });
      return answer({ clips: [], ads });
    }
    if (opts && opts.identify && p.startsWith("Who is each voice in this conversation?")) { const out = opts.identify(p); if (out && out.throw) { const e = new Error("bad json"); e.code = "invalid_json"; throw e; } return answer(out); }
    return mock.sample(args);
  } });
}
async function server(t, opts) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "deflate-id-"));
  const app = createApp(Object.assign({ dataDir: dir, examplesDir: dir, envPath: path.join(dir, ".env"), ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), run: noYtdlp }, opts));
  await app.ready;
  const srv = await new Promise(r => { const s = app.app.listen(0, "127.0.0.1", () => r(s)); });
  const base = "http://127.0.0.1:" + srv.address().port;
  const api = async (method, p, body) => { const res = await fetch(base + p, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = text; } return { status: res.status, data }; };
  const finish = async id => { for (let i = 0; i < 400; i++) { const job = app.reader.jobs.get(id); if (job) { await job.done; continue; } const b = await app.store.bundle(id); if (!(b.run.processing && b.run.processing.status === "running")) return b; await new Promise(r => setTimeout(r, 20)); } return app.store.bundle(id); };
  t.after(async () => { for (const job of app.reader.jobs.values()) job.controller.abort(); await Promise.all([...app.reader.jobs.values()].map(j => j.done)); await new Promise(r => srv.close(r)); await fs.promises.rm(dir, { recursive: true, force: true }); });
  return Object.assign({}, app, { api, finish, dir, base });
}
async function fromLink(f, link, choice) {
  const started = await f.api("POST", "/api/transcript/resolve", { url: link, choice: choice || "" });
  assert.equal(started.status, 200, JSON.stringify(started.data));
  let j; for (let i = 0; i < 300; i++) { j = (await f.api("GET", "/api/transcript/jobs/" + started.data.jobId)).data; if (j.state !== "running") break; await new Promise(r => setTimeout(r, 20)); }
  assert.equal(j.state, "done", JSON.stringify(j.error || j.result && j.result.reason));
  const consumed = await f.api("POST", "/api/transcript/jobs/" + started.data.jobId + "/consume");
  assert.equal(consumed.status, 202, JSON.stringify(consumed.data));
  return f.finish(consumed.data.run.id);
}
const nameOf = (b, key) => (b.run.speakers.find(s => s.key === key) || {}).name;
/* The guard the brief asks for: a reading that still shows "Speaker n" for a voice the conversation clearly names fails.
   Every place a name is shown is checked: the speakers, every quote, every claim, every passage's speaker line. */
function assertNamed(b, md, ex, keys, names) {
  keys.forEach((k, i) => assert.equal(nameOf(b, k), names[i], k + " should be " + names[i]));
  const numbered = /^Speaker \d+$/, labels = keys.map(k => shared.labelName(k)).join("|");
  for (const p of ex.passages) for (const q of p.quotes) if (keys.includes(q.speakerNow)) assert.ok(!numbered.test(q.speaker), "a quote shows " + q.speaker + " for " + q.speakerNow);
  for (const c of ex.claims) if (keys.includes(c.speakerKey)) assert.ok(!numbered.test(c.speaker), "a claim shows " + c.speaker);
  for (const line of md.split("\n")) {
    if (/^> /.test(line)) assert.doesNotMatch(line, new RegExp("^> (?:" + labels + "):"), "a quoted line in the export is credited to a number: " + line);
    if (/^- (Checkable claim|Interpretation|Value judgment|Image|Too vague|Claim)/.test(line)) assert.doesNotMatch(line, new RegExp(" — (?:" + labels + "):"), "a claim in the export is credited to a number: " + line);
    if (/^_[^_]+_$/.test(line) && !/[.!]_$/.test(line)) assert.doesNotMatch(line, new RegExp("\\b(?:" + labels + ")\\b"), "a passage's speaker line shows a number: " + line);
  }
}

module.exports = { SHOW, HOST, GUEST, EPISODE, AUDIO, APPLE_LINK, FEED, APPLE, SAID, DEEPGRAM, KEY, chainFetch, noYtdlp, scriptedAI, server, fromLink, nameOf, assertNamed };
