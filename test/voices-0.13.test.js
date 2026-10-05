"use strict";
/* 0.13: speakers separated by voice from the recording, lined up with the text the app already has. The recording's
   answer is synthetic (Deepgram's shape, built from a known conversation with misheard, dropped and inserted words,
   timing slop at turn boundaries and a flicker mid-sentence), so these tests prove what the app does with such an
   answer: every word of the text kept, each claim's words under the speaker who said them, a wrong recording refused.
   They do not prove how well Deepgram separates voices. Invented people throughout. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research");
const shared = require("../shared/transcript");
const V = require("../server/voices");

const HOST = 0, GUEST = 1;
/* The conversation as it was spoken: who said each stretch. The interruption is one sentence shared by two people. */
const TRUTH = [
  [HOST, "Welcome back to the show. Today we are talking about the new transit survey that the city released last month. My guest studied it closely. Dana, thanks for joining me."],
  [GUEST, "Thanks for having me. My name is Dana Reyes, and I run the survey lab at the university. We looked at the raw responses, not just the summary."],
  [HOST, "So what did the survey actually cover?"],
  [GUEST, "It covered four hundred households in three neighborhoods. That is a small sample for a city this size, and the neighborhoods were chosen because they already had bus lanes."],
  [HOST, "Right."],
  [GUEST, "So when the report says riders everywhere support more lanes, it is stretching what four hundred households can tell you."],
  [HOST, "But the mayor's office says the results are clear."],
  [GUEST, "The results are clear for those three neighborhoods. They are not clear for the whole city, and the report does not say how people were contacted. Nobody outside the office has seen the questionnaire either."],
  [HOST, "I was going to ask about the budget for —"],
  [GUEST, "Sorry, the budget for which year —"],
  [HOST, "for next year, which doubles the lane program."],
  [GUEST, "If the budget doubles on the strength of this survey, that is a decision resting on a narrow sample."],
  [HOST, "We will leave it there. Dana Reyes, thank you."],
];
/* The text as an unlabeled transcript shows it: paragraph breaks that do not follow the turns (two turns in one
   paragraph, one turn across two, the interruption in one line). */
const T = TRUTH.map(x => x[1]);
const TEXT = [T[0] + " " + T[1], T[2], T[3] + " " + T[4] + " " + T[5], T[6],
  "The results are clear for those three neighborhoods. They are not clear for the whole city,", "and the report does not say how people were contacted. Nobody outside the office has seen the questionnaire either.",
  T[8] + " " + T[9] + " " + T[10], T[11] + " " + T[12]].join("\n\n");

/* Deepgram's answer for that conversation: every 13th word misheard, every 29th dropped, a filler every 31st, "four
   hundred" written as 400 once; the first word of a turn often still carries the previous voice (twice, the first two
   words), and one word mid-sentence flickers to the other voice. Punctuation is Deepgram's own (from the audio), so a
   misheard word keeps its full stop and a missed word's full stop lands on the word before. */
function recording(truth, opts) {
  const o = Object.assign({ substitute: 13, drop: 29, filler: 31, jitter: true, flicker: true }, opts);
  const out = []; let n = 0, t = 0, turnNo = 0, prevSpeaker = null;
  for (const [speaker, text] of truth) {
    let ws = text.split(/\s+/).filter(w => shared.wordsOf(w));
    if (/four hundred households can/.test(text)) { const i = ws.findIndex((w, k) => w === "four" && ws[k + 1] === "hundred"); ws.splice(i, 2, "400"); }
    ws.forEach((w, k) => {
      n++;
      if (o.drop && n % o.drop === 0) { const end = /[.?!]+$/.exec(w); if (end && out.length) out[out.length - 1].punctuated_word += end[0]; return; } // a missed word's full stop lands on the word before
      if (o.filler && n % o.filler === 0) out.push({ word: "uh", punctuated_word: "uh", speaker, start: t, end: t + 0.2, confidence: 0.5, speaker_confidence: 0.5 }), t += 0.25;
      let who = speaker;
      if (o.jitter && prevSpeaker !== null && prevSpeaker !== speaker && (k === 0 || k === 1 && turnNo % 4 === 1) && ws.length > 3) who = prevSpeaker;
      if (o.flicker && /Nobody outside the office/.test(text) && w === "outside") who = 1 - speaker;
      const heard = o.substitute && n % o.substitute === 0 ? "misheard" + ((/[.?!,]+$/.exec(w) || [""])[0]) : w; // punctuation comes from the audio, not the word
      out.push({ word: shared.wordsOf(heard), punctuated_word: heard, speaker: who, start: t, end: t + 0.3, confidence: 0.9, speaker_confidence: 0.8 });
      t += 0.35;
    });
    prevSpeaker = speaker; turnNo++;
  }
  return { metadata: { request_id: "req-test-1", duration: Math.round(t), models: ["nova-3-test"] }, results: { channels: [{ alternatives: [{ transcript: out.map(w => w.punctuated_word).join(" "), words: out }] }] } };
}
/* For each word of the text, the label of the piece it ended up in. */
function labelPerWord(labelled) {
  const out = [];
  for (const line of labelled.split("\n")) { const m = /^(SPEAKER \d+|CLIP \d+|QUOTE \d+|UNLABELED): (.*)$/.exec(line); if (!m) continue; for (const w of shared.wordsOf(m[2]).split(" ").filter(Boolean)) out.push(m[1]); }
  return out;
}
const truthPerWord = truth => truth.flatMap(([s, text]) => shared.wordsOf(text).split(" ").filter(Boolean).map(() => s === HOST ? "SPEAKER 1" : "SPEAKER 2"));
const spokenOnly = text => shared.wordsOf(text.replace(/^(?:SPEAKER \d+|CLIP \d+|QUOTE \d+|UNLABELED): /gm, ""));
const pieceWith = (labelled, phrase) => labelled.split("\n").find(l => shared.wordsOf(l).includes(shared.wordsOf(phrase)));

test("voices from the recording line up with the text: every word kept, every word under the speaker who said it", () => {
  const d = recording(TRUTH);
  const r = V.separate(TEXT, d);
  assert.equal(r.ok, true, r.why);
  assert.ok(r.coverage > 0.8 && r.coverage < 0.95, "most but not all words line up: " + r.coverage);
  assert.equal(spokenOnly(r.text), shared.wordsOf(TEXT), "no word lost, added or reordered");
  assert.deepEqual(r.keys.sort(), ["SPEAKER 1", "SPEAKER 2"]);
  assert.deepEqual(labelPerWord(r.text), truthPerWord(TRUTH), "each word carries its speaker, despite the timing slop and the flicker");
  // the claims, specifically
  assert.match(pieceWith(r.text, "It covered four hundred households in three neighborhoods"), /^SPEAKER 2: /);
  assert.match(pieceWith(r.text, "it is stretching what four hundred households can tell you"), /^SPEAKER 2: /);
  assert.match(pieceWith(r.text, "But the mayor's office says the results are clear"), /^SPEAKER 1: /);
  // a one-word reply between the guest's sentences is a turn of its own, not swallowed by the guest
  assert.ok(r.text.split("\n").includes("SPEAKER 1: Right."), r.text);
  // the interruption: three pieces inside one sentence
  assert.ok(r.text.includes("SPEAKER 1: I was going to ask about the budget for —\nSPEAKER 2: Sorry, the budget for which year —\nSPEAKER 1: for next year, which doubles the lane program."), r.text);
  // the turn that runs across two paragraphs keeps one speaker
  assert.match(pieceWith(r.text, "and the report does not say how people were contacted"), /^SPEAKER 2: /);
  assert.ok(r.adjusted >= 4, "timing slop and the flicker were settled by the sentences: " + r.adjusted);
});

test("an advertisement in the recording is skipped, and captions without sentence marks borrow the recording's", () => {
  const d = recording(TRUTH), ws = d.results.channels[0].alternatives[0].words;
  const ad = Array.from({ length: 400 }, (_, i) => ({ word: "sponsor", punctuated_word: ["Sponsor", "message", "number", String(i) + "."][i % 4], speaker: 2, start: 0, end: 0 }));
  ws.splice(120, 0, ...ad);
  const r = V.separate(TEXT, d);
  assert.equal(r.ok, true, r.why);
  assert.deepEqual(labelPerWord(r.text), truthPerWord(TRUTH), "the advertisement's voice appears nowhere in the text");
  assert.equal(r.voices, 2);
  // automatic captions: no capitals, no sentence marks, paragraphs by length
  const captions = shared.wordsOf(TRUTH.map(x => x[1]).join(" ")).split(" "), paras = [];
  for (let i = 0; i < captions.length; i += 70) paras.push(captions.slice(i, i + 70).join(" "));
  const c = V.separate(paras.join("\n\n"), recording(TRUTH));
  assert.equal(c.ok, true, c.why);
  const cw = shared.wordsOf(paras.join(" ")).split(" "), want = truthPerWord(TRUTH);
  const off = labelPerWord(c.text).map((k, i) => k !== want[i] ? cw[i] + "=" + k : null).filter(Boolean);
  // Every turn change is settled by the recording's sentence ends, with two known limits of a text without marks:
  // "summary", the last word of a sentence the recording missed (its full stop landed on the word before), joins the
  // next sentence and its speaker; and inside the interruption, where captions carry no dash and the recording no full
  // stop, the late-noticed voice keeps two words and one missed word stays not established rather than guessed.
  assert.deepEqual(off, ["summary=SPEAKER 1", "sorry=SPEAKER 1", "the=SPEAKER 1", "for=UNLABELED"], c.text);
  assert.equal(spokenOnly(c.text), shared.wordsOf(paras.join(" ")));
});

test("a recording of something else is refused, and so is one without voices; nothing is changed", () => {
  const other = [[0, "In the garden this week we planted tomatoes along the south fence, and the beans are finally climbing the poles we set in April."], [1, "Mine never climb. I think the soil stays too wet near the shed, so the roots rot before the vines get going."]];
  const r = V.separate(TEXT, recording(other));
  assert.equal(r.ok, false);
  assert.ok(r.coverage < V.MIN_COVERAGE, String(r.coverage));
  assert.match(r.why, /line up with the recording; it may be a different episode, or a different text/);
  const flat = recording(TRUTH); for (const w of flat.results.channels[0].alternatives[0].words) delete w.speaker;
  assert.match(V.separate(TEXT, flat).why, /without voices/);
  assert.match(V.separate(TEXT, { results: { channels: [{ alternatives: [{ words: [] }] }] } }).why, /no words/);
});

test("alignment is monotonic and survives misheard, dropped and inserted words", () => {
  const a = "one two three four five six seven eight nine ten eleven twelve".split(" ").map(w => ({ w }));
  const b = "one two three four five sicks seven uh eight nine ten twelve".split(" ").map(w => ({ w }));
  const { map } = V.align(a, b);
  assert.deepEqual(map, [0, 1, 2, 3, 4, -1, 6, 8, 9, 10, -1, 11]);
  const seen = map.filter(j => j >= 0); assert.deepEqual(seen, [...seen].sort((x, y) => x - y));
});

test("labels the app wrote earlier are set aside before the voices decide; the source's are never touched", () => {
  const labelled = "SPEAKER 1: Welcome back.\nUNLABELED: Thanks for having me.\n\nCLIP 1: The agreement was counterproductive.\nSPEAKER 1: So that's the clip.";
  assert.equal(V.spokenText(labelled, ["SPEAKER 1", "CLIP 1"]), "Welcome back.\nThanks for having me.\n\nThe agreement was counterproductive.\nSo that's the clip.");
});

async function fixture(t, cloud, extra) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-voices-"));
  const app = createApp(Object.assign({ dataDir: dir, examplesDir: dir, env: {}, envPath: path.join(dir, ".env"), ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), run: async () => ({ code: 1, out: "" }), cloudEngine: cloud }, extra || {}));
  await app.ready;
  const server = await new Promise(r => { const s = app.app.listen(0, "127.0.0.1", () => r(s)); });
  const api = async (method, p, body) => { const res = await fetch("http://127.0.0.1:" + server.address().port + p, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, data: await res.json().catch(() => null) }; };
  const finish = async id => { const job = app.reader.jobs.get(id); if (job) await job.done; return app.store.bundle(id); };
  t.after(async () => { for (const job of app.reader.jobs.values()) job.controller.abort(); await Promise.all([...app.reader.jobs.values()].map(j => j.done)); await new Promise(r => server.close(r)); await fs.rm(dir, { recursive: true, force: true }); });
  return { ...app, api, finish, dir };
}
const fakeDeepgram = (answer, configured = true) => { const calls = []; return { calls, name: "deepgram", model: "nova-3", configured: () => configured, async diarize({ audioUrl }) { calls.push(audioUrl); return typeof answer === "function" ? answer(audioUrl) : answer; } }; };

test("the route: an unlabeled transcript gets numbered speakers from the recording, a name from the words, and a fresh reading", async t => {
  const cloud = fakeDeepgram(recording(TRUTH));
  const f = await fixture(t, cloud);
  const made = await f.api("POST", "/api/intake", { input: TEXT });
  assert.equal(made.status, 202);
  const id = made.data.run.id;
  let b = await f.finish(id);
  assert.equal(b.run.provenance.labelsOrigin || "", "", "the words alone (scripted: one voice) established no speakers");
  const before = b.transcript;
  const r = await f.api("POST", "/api/runs/" + id + "/voices", { link: "https://cdn.example.org/shows/ep12.mp3" });
  assert.equal(r.status, 202, JSON.stringify(r.data));
  assert.equal(r.data.outcome, "voices");
  assert.deepEqual(cloud.calls, ["https://cdn.example.org/shows/ep12.mp3"]);
  b = await f.finish(id);
  const pr = b.run.provenance;
  assert.equal(pr.labelsOrigin, "voices");
  assert.equal(spokenOnly(b.transcript), shared.wordsOf(before), "every word of the text kept");
  assert.deepEqual(labelPerWord(b.transcript), truthPerWord(TRUTH));
  assert.equal(pr.voices.engine, "deepgram"); assert.equal(pr.voices.requestId, "req-test-1"); assert.equal(pr.voices.audioUrl, "https://cdn.example.org/shows/ep12.mp3");
  assert.equal(pr.voices.voices, 2); assert.ok(pr.voices.coverage > 0.8);
  assert.equal(pr.voices.resultHash, b.run.input.sha256);
  assert.match(pr.voices.method, /lined up with this text word by word \(\d+% of its words matched\)/);
  // Deepgram's words are kept beside the run, so the alignment can be checked without asking again
  const kept = JSON.parse(await fs.readFile(path.join(f.dir, "runs", id, pr.voices.file), "utf8"));
  assert.equal(kept.requestId, "req-test-1"); assert.ok(kept.words.length > 100); assert.deepEqual(kept.words[0].slice(0, 2), ["welcome", 0]);
  // the guest named herself; the host is only numbered
  const sp = Object.fromEntries(b.run.speakers.map(s => [s.key, s]));
  assert.equal(sp["SPEAKER 2"].name, "Dana Reyes"); assert.match(sp["SPEAKER 2"].bio, /Named from the words \(self identification\): “My name is Dana Reyes”/);
  assert.equal(sp["SPEAKER 1"].name, "Speaker 1");
  assert.deepEqual(pr.voices.names.map(n => [n.key, n.name, n.applied]), [["SPEAKER 2", "Dana Reyes", true]]);
  // the reading gate accepts labels from the recording, for this exact text; the reading was made again on it
  assert.equal(b.attributionGate.status, "ready"); assert.equal(b.attributionGate.origin, "voices");
  assert.ok(b.passages.length && b.passages.every(p => p.analysis && !p.stale.length), "read again on the labelled text");
  const turns = shared.parseTranscript(b.transcript, { mode: b.run.parseMode });
  assert.equal(turns.find(x => /four hundred households in three/.test(x.text)).label, "SPEAKER 2");

  // one confirmation of the names: only the names change
  const c = await f.api("POST", "/api/runs/" + id + "/confirm-names", { names: [{ key: "SPEAKER 1", name: "Sam Okafor" }, { key: "SPEAKER 2", name: "Dana Reyes" }, { key: "UNLABELED", name: "Nobody" }] });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  assert.equal(c.data.run.speakers.find(s => s.key === "SPEAKER 1").name, "Sam Okafor");
  assert.match(c.data.run.speakers.find(s => s.key === "SPEAKER 1").bio, /Named by a person/);
  assert.match(c.data.run.speakers.find(s => s.key === "SPEAKER 2").bio, /self identification/, "a confirmed name keeps its evidence");
  assert.ok(c.data.run.provenance.namesConfirmedAt); assert.equal(c.data.run.provenance.namesConfirmedBy, "person at this computer");
  assert.equal(c.data.run.input.sha256, b.run.input.sha256, "the text is unchanged");
  assert.ok(c.data.passages.every(p => !p.stale.length), "no reading goes out of date");
  // the export carries the record
  const ex = await f.api("GET", "/api/runs/" + id + "/export.json");
  assert.equal(ex.data.run.provenance.labelsOrigin, "voices"); assert.equal(ex.data.run.provenance.voices.requestId, "req-test-1"); assert.ok(ex.data.run.provenance.namesConfirmedAt);
});

test("the route refuses plainly: a different recording, source labels, no key, a video, a show instead of an episode", async t => {
  const wrong = fakeDeepgram(recording([[0, "In the garden this week we planted tomatoes along the south fence."], [1, "Mine never climb, the soil stays too wet."]]));
  const f = await fixture(t, wrong, { resolver: { locate: async input => /show/.test(input.url) ? { kind: "choose", episodes: [] } : { kind: "article", html: "", url: input.url } } });
  const id = (await f.api("POST", "/api/intake", { input: TEXT })).data.run.id;
  let b = await f.finish(id); const before = b.transcript;
  let r = await f.api("POST", "/api/runs/" + id + "/voices", { link: "https://cdn.example.org/other.mp3" });
  assert.equal(r.status, 422); assert.equal(r.data.code, "voices_not_aligned");
  assert.match(r.data.error, /could not be lined up with this text: only \d+% of the text's words line up with the recording; it may be a different episode, or a different text\. Nothing was changed\./);
  b = await f.store.bundle(id); assert.equal(b.transcript, before); assert.equal(b.run.provenance.voices, undefined);
  r = await f.api("POST", "/api/runs/" + id + "/voices", { link: "https://www.youtube.com/watch?v=abcdefghijk" });
  assert.equal(r.status, 422); assert.equal(r.data.code, "video_link");
  r = await f.api("POST", "/api/runs/" + id + "/voices", { link: "https://podcasts.example.org/show/the-transit-hour" });
  assert.equal(r.status, 409); assert.equal(r.data.code, "episode_needed"); assert.match(r.data.error, /a show, not one episode/);
  r = await f.api("POST", "/api/runs/" + id + "/voices", { link: "https://podcasts.example.org/episode/12" });
  assert.equal(r.status, 422); assert.equal(r.data.code, "no_audio");
  r = await f.api("POST", "/api/runs/" + id + "/voices", { link: "http://127.0.0.1/ep.mp3" });
  assert.equal(r.status, 400); assert.equal(r.data.code, "private_address");
  r = await f.api("POST", "/api/runs/" + id + "/voices", {});
  assert.equal(r.status, 400); assert.equal(r.data.code, "audio_link_needed");
  assert.equal(wrong.calls.length, 1, "Deepgram was asked only once, for the one real audio link");
  // a transcript whose labels came with it keeps them
  const labelled = (await f.api("POST", "/api/intake", { input: "HOST: Welcome back to the show, everyone.\n\nGUEST: Thanks for having me, it is good to be here." })).data.run.id;
  await f.finish(labelled);
  r = await f.api("POST", "/api/runs/" + labelled + "/voices", { link: "https://cdn.example.org/ep.mp3" });
  assert.equal(r.status, 409); assert.equal(r.data.code, "source_labels");
  r = await f.api("POST", "/api/runs/" + labelled + "/confirm-names", { names: [{ key: "HOST", name: "Sam" }] });
  assert.equal(r.status, 409);
  // no key: the page offers the key form
  const g = await fixture(t, fakeDeepgram(recording(TRUTH), false));
  const id2 = (await g.api("POST", "/api/intake", { input: TEXT })).data.run.id; await g.finish(id2);
  r = await g.api("POST", "/api/runs/" + id2 + "/voices", { link: "https://cdn.example.org/ep.mp3" });
  assert.equal(r.status, 409); assert.equal(r.data.code, "cloud_not_configured");
});

test("the recording is found from the episode the text was fetched from, when no link is given", async () => {
  const direct = await V.audioFor({ link: "", run: { import: { url: "https://podcasts.example.org/ep/12", episodeInfo: { guid: "g12", audioUrl: "https://cdn.example.org/ep12.mp3" } } }, resolver: null });
  assert.equal(direct.url, "https://cdn.example.org/ep12.mp3"); assert.match(direct.how, /fetched from/);
  const asked = [];
  const viaFeed = await V.audioFor({ link: "", run: { import: { url: "https://feeds.example.org/transit.xml", episodeInfo: { guid: "g12" } } }, resolver: { locate: async input => { asked.push(input); return { kind: "episode", show: { name: "The Transit Hour" }, item: { title: "Episode 12", guid: "g12", enclosure: { url: "https://cdn.example.org/ep12.mp3" } }, matchedBy: "feed by guid" }; } } });
  assert.deepEqual(asked, [{ url: "https://feeds.example.org/transit.xml", guid: "g12" }]);
  assert.equal(viaFeed.url, "https://cdn.example.org/ep12.mp3"); assert.match(viaFeed.how, /“Episode 12” in The Transit Hour \(found by feed by guid\)/);
  // a link the person gives is followed on its own: the earlier episode's guid is not forced onto it
  await V.audioFor({ link: "https://podcasts.example.org/other-episode", run: { import: { url: "https://feeds.example.org/transit.xml", episodeInfo: { guid: "g12" } } }, resolver: { locate: async input => { asked.push(input); return { kind: "episode", item: { title: "x", enclosure: { url: "https://cdn.example.org/x.mp3" } } }; } } });
  assert.deepEqual(asked[1], { url: "https://podcasts.example.org/other-episode", guid: "" });
});

test("a reading in progress is stopped just before the recording is sent, and resumed when its voices can't be used", async t => {
  const mock = createMockAI(); let release; const gate = new Promise(r => { release = r; });
  const slow = { ...mock, async sample(args) { if (String(args.prompt || "").startsWith("Help a reader understand")) await gate; return mock.sample(args); } };
  const wrong = fakeDeepgram(recording([[0, "In the garden this week we planted tomatoes along the south fence."], [1, "Mine never climb, the soil stays too wet."]]));
  const f = await fixture(t, wrong, { ai: slow });
  t.after(() => release());
  const id = (await f.api("POST", "/api/intake", { input: TEXT })).data.run.id;
  for (let i = 0; i < 200; i++) { const b = await f.store.bundle(id); if (b.run.processing && b.run.processing.phase === "reading") break; await new Promise(r => setTimeout(r, 20)); }
  const first = f.reader.jobs.get(id); assert.ok(first, "the reading is underway");
  const r = await f.api("POST", "/api/runs/" + id + "/voices", { link: "https://cdn.example.org/other.mp3" });
  assert.equal(r.status, 422); assert.equal(wrong.calls.length, 1);
  assert.ok(first.controller.signal.aborted, "the reading was stopped before the recording was sent");
  const again = f.reader.jobs.get(id); assert.ok(again && again !== first, "and started again when the voices could not be used");
  release();
  const b = await f.finish(id);
  assert.equal(b.run.processing.status, "complete"); assert.equal(b.run.provenance.voices, undefined);
  assert.ok(b.passages.every(p => p.analysis && p.readingGate.status === "ready"));
});
