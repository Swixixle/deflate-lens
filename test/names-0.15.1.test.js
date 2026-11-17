"use strict";
/* 0.15.1: the information the speakers are named from reaches the naming, and a run whose listing changes is named
   again. Found by tracing Alex's real runs to the point where each lost what naming needed: a video link was listed by
   its title and channel only (its description, where guests are credited, was fetched and dropped); an episode's notes
   were cut at 2,000 characters when read and at 1,500 when shown to the model; an identification was keyed on the text
   and its labels only, so a run whose listing improved was never named again; and a recording turned into text on this
   computer while a Deepgram key was set said nothing about why its voices were not separated. Invented people. */
const test = require("node:test");
const assert = require("node:assert/strict");
const YT = require("../server/podcast/youtube");
const { createResolver } = require("../server/podcast/resolve");
const I = require("../server/identify");
const F = require("../server/podcast/feed");

const res = (status, body, type) => ({ status, url: "", headers: { get: k => k.toLowerCase() === "content-type" ? type || "application/json" : null }, text: async () => typeof body === "string" ? body : JSON.stringify(body) });
const DESC = "This week's episode is about the city's transit survey. " + "More about the show and its sponsors follows in these notes. ".repeat(60) + "This week Dale is joined by Ruth Okonkwo.";
const PLAYER = { playabilityStatus: { status: "OK" }, videoDetails: { videoId: "AbCdEfGhIjK", title: "The survey, examined", author: "The Dale Whitcomb Show", shortDescription: DESC },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: "https://www.youtube.com/api/timedtext?v=AbCdEfGhIjK&lang=en", languageCode: "en", kind: "asr", name: { simpleText: "English" } }] } } };
const JSON3 = { events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "welcome back to the show today we are talking about the survey " + "and what it shows ".repeat(30) }] }] };
const ytFetch = async (u) => { u = String(u); if (/oembed/.test(u)) return res(200, { title: "The survey, examined", author_name: "The Dale Whitcomb Show" }); if (/youtubei\/v1\/player/.test(u)) return res(200, PLAYER); if (/api\/timedtext/.test(u)) return res(200, JSON3); return res(404, "no"); };
const noYtdlp = async () => ({ code: -1, out: "", err: "ENOENT" });

test("a video link's listing carries its description and channel: the built-in reader keeps them, and the resolver lists the video as an episode with its notes", async () => {
  const r = await YT.captionsBuiltin(ytFetch, "AbCdEfGhIjK", "en");
  assert.equal(r.description, DESC.slice(0, 6000)); assert.equal(r.author, "The Dale Whitcomb Show");
  const R = createResolver({ fetch: ytFetch, env: {}, engines: {}, run: noYtdlp });
  const loc = await R.locate({ url: "https://www.youtube.com/watch?v=AbCdEfGhIjK" }, () => {});
  const w = await R.words(loc, { step: () => {} });
  assert.equal(w.ok, true); assert.equal(w.source.kind, "youtube-captions");
  assert.ok(w.episode, "the video is listed as an episode"); assert.equal(w.episode.title, "The survey, examined"); assert.equal(w.episode.author, "The Dale Whitcomb Show");
  assert.ok(w.episode.description.endsWith("This week Dale is joined by Ruth Okonkwo."), "the whole description, including a credit at its end");
  // the guest credited at the end of the description is a candidate for who speaks
  const L = I.listingOf({ import: { episodeInfo: w.episode, showInfo: { name: w.channel, channel: true } }, title: w.title });
  assert.ok(I.listingText(L).includes("This week Dale is joined by Ruth Okonkwo."), "the credit reaches the listing the model reads");
  assert.ok(I.listingCandidates(L).some(c => c.name === "Ruth Okonkwo"), JSON.stringify(I.listingCandidates(L).map(c => c.name)));
});

test("yt-dlp's information file gives the description and channel too", async () => {
  const fs = require("fs"), path = require("path");
  const runner = async (cmd, args) => {
    if (args[0] === "--version") return { code: 0, out: "2026.08.19\n", err: "" };
    const out = args[args.indexOf("-o") + 1], dir = path.dirname(out);
    assert.ok(args.includes("--write-info-json"));
    fs.writeFileSync(path.join(dir, "AbCdEfGhIjK.en.json3"), JSON.stringify(JSON3));
    fs.writeFileSync(path.join(dir, "AbCdEfGhIjK.info.json"), JSON.stringify({ description: DESC, channel: "The Dale Whitcomb Show" }));
    return { code: 0, out: "", err: "" };
  };
  const r = await YT.captions({ id: "AbCdEfGhIjK", fetch: ytFetch, env: {}, run: runner });
  assert.equal(r.reader, "yt-dlp"); assert.equal(r.description, DESC.slice(0, 6000)); assert.equal(r.channel, "The Dale Whitcomb Show");
});

test("an episode's notes are kept to 6,000 characters when the feed is read, and the naming prompt shows all of them", () => {
  const feed = F.parseFeed('<?xml version="1.0"?><rss version="2.0"><channel><title>The Dale Whitcomb Show</title><item><title>Ep 1</title><guid>g1</guid><description><![CDATA[' + DESC + ']]></description></item></channel></rss>');
  assert.ok(DESC.length > 2000 && DESC.length <= 6000);
  assert.equal(feed.items[0].description, DESC, "not cut at 2,000 characters");
  const src = require("fs").readFileSync(require.resolve("../server/identify"), "utf8");
  assert.ok(!/description\.slice\(0, 1500\)/.test(src) && /description\.slice\(0, 6000\)/.test(src), "the prompt shows up to 6,000 characters of notes");
  assert.ok(/description: str\(i\.episodeInfo\.description, 6000\)/.test(require("fs").readFileSync(require.resolve("../server/validate"), "utf8")), "and the record keeps them");
});

test("an identification is keyed on the listing too: a run whose listing changed is named again, once; an unchanged one is not; a voice an earlier version left numbered is tried once more", () => {
  const listing = notes => ({ episodeInfo: { title: "Ep 1", description: notes }, showInfo: { name: "The Dale Whitcomb Show", author: "Dale Whitcomb" } });
  const run = (imp, id, speakers) => ({ kind: "transcript", parseMode: "text", input: { sha256: "h1" }, import: imp, speakers: speakers || [{ key: "SPEAKER 1", name: "Dale Whitcomb" }, { key: "SPEAKER 2", name: "Speaker 2" }], provenance: { overrides: {}, identification: id } });
  const b = r => ({ run: r, transcript: "SPEAKER 1: Hello there, friends.\nSPEAKER 2: Hello to you.", attrSig: "a1" });
  const before = run(listing("A conversation."), null);
  const record = { version: I.IDENTIFY_VERSION, inputHash: "h1", attrSig: "a1", listingHash: I.listingHashOf(before), decisions: [{ key: "SPEAKER 1", name: "Dale Whitcomb", kinds: ["listing"], confirmed: { turn: 0, quote: "Hello there" } }], unnamed: [{ key: "SPEAKER 2", why: "x" }], evidence: [] };
  assert.equal(I.IDENTIFY_VERSION, 7);
  assert.equal(I.needsIdentification(b(run(listing("A conversation."), record))), false, "same text, labels and listing: once is enough");
  assert.equal(I.needsIdentification(b(run(listing("Dale talks with Ruth Okonkwo about the survey."), record))), true, "the listing changed: named again");
  // a record from before 0.15.1 (no listing fingerprint) that left a voice numbered is tried once more; one that named everyone is not
  const old = Object.assign({}, record, { version: 5, listingHash: undefined });
  assert.equal(I.needsIdentification(b(run(listing("A conversation."), old))), true);
  assert.equal(I.needsIdentification(b(run(listing("A conversation."), Object.assign({}, old, { unnamed: [] }), [{ key: "SPEAKER 1", name: "Dale Whitcomb" }, { key: "SPEAKER 2", name: "Ruth Okonkwo" }]))), false);
  // (0.15.2: a 0.15.1 record that left a voice numbered is tried once more too, since a caller may now be named by first name)
  assert.equal(I.needsIdentification(b(run(listing("A conversation."), Object.assign({}, record, { version: 6 })))), true);
  assert.equal(I.needsIdentification(b(run(listing("A conversation."), Object.assign({}, record, { version: 6, unnamed: [] }), [{ key: "SPEAKER 1", name: "Dale Whitcomb" }, { key: "SPEAKER 2", name: "Ruth Okonkwo" }]))), false);
});
