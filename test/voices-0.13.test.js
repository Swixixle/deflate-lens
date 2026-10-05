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
   misheard word keeps its full stop and a missed word's full stop lands on the word before. Timing: 0.05 s between
   words, 0.3 s between sentences, 0.6 s between turns (a pause the recording hears before a new speaker). */
function recording(truth, opts) {
  const o = Object.assign({ substitute: 13, drop: 29, filler: 31, jitter: true, flicker: true, turnPause: 0.6, sentencePause: 0.3 }, opts);
  const out = []; let n = 0, t = 0, turnNo = 0, prevSpeaker = null;
  for (const [speaker, text] of truth) {
    if (turnNo) t += o.turnPause;
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
      t += 0.35 + (/[.?!]["”')]*$/.test(w) ? o.sentencePause : 0);
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
/* What the app should give: the truth, except where the recording gave words it heard to the other voice and nothing
   the recording itself shows says otherwise. Since 0.13.1 a voice the recording gives to a word it heard is kept there,
   with one narrow exception (a change of speakers noticed a word or three late or early at a sentence's edge, between
   two turns that each go on past the sentence, with the recording's own pause at the edge). So two places keep the
   recording's voices:
   - the one word it flickered to the other voice in the middle of a sentence: the app cannot tell that flicker from a
     real one-word interruption, and overwriting a real one would put the other person's words in this one's mouth;
   - "Thanks for", the first two words of the guest's four-word "Thanks for having me.", which the recording still gave
     to the host: the part that would move is as long as the rest, not clearly the smaller part, so the app does not
     overrule the recording there. (Every other late change of voice in this conversation is moved to its sentence's
     start.) */
const FLICKER = TRUTH.slice(0, 7).reduce((n, [, text]) => n + shared.wordsOf(text).split(" ").length, 0) + shared.wordsOf("The results are clear for those three neighborhoods. They are not clear for the whole city, and the report does not say how people were contacted. Nobody").split(" ").length;
const THANKS = shared.wordsOf(TRUTH[0][1]).split(" ").length;
const expectedPerWord = () => truthPerWord(TRUTH).map((k, i) => i === FLICKER ? (k === "SPEAKER 1" ? "SPEAKER 2" : "SPEAKER 1") : i === THANKS || i === THANKS + 1 ? "SPEAKER 1" : k);
const spokenOnly = text => shared.wordsOf(text.replace(/^(?:SPEAKER \d+|CLIP \d+|QUOTE \d+|UNLABELED): /gm, ""));
const pieceWith = (labelled, phrase) => labelled.split("\n").find(l => shared.wordsOf(l).includes(shared.wordsOf(phrase)));

test("voices from the recording line up with the text: every word kept, every word under the speaker who said it", () => {
  const d = recording(TRUTH);
  const r = V.separate(TEXT, d);
  assert.equal(r.ok, true, r.why);
  assert.ok(r.coverage > 0.8 && r.coverage < 0.95, "most but not all words line up: " + r.coverage);
  assert.equal(spokenOnly(r.text), shared.wordsOf(TEXT), "no word lost, added or reordered");
  assert.deepEqual(r.keys.sort(), ["SPEAKER 1", "SPEAKER 2"]);
  assert.deepEqual(labelPerWord(r.text), expectedPerWord(), "each word carries its speaker despite the timing slop, except where the recording's voice is kept (see expectedPerWord)");
  assert.ok(r.text.includes("Dana, thanks for joining me. Thanks for\nSPEAKER 2: having me."), r.text);
  assert.ok(r.text.includes("Nobody\nSPEAKER 1: outside\nSPEAKER 2: the office"), r.text);
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
  assert.equal(r.voices, 2); assert.deepEqual(r.keys.sort(), ["SPEAKER 1", "SPEAKER 2"], "the advertisement's voice appears nowhere in the text");
  // Every word as without the advertisement but one. The advertisement sits inside the host's one-sentence turn ("But
  // the mayor's office says the results are clear.", between "results" and "are") and leaves its last two words and the
  // next turn's first word unmatched, so nothing heard shows the host going on past the sentence; "But", which the
  // recording still gave to the guest, keeps that voice rather than being moved on a guess.
  const BUT = TRUTH.slice(0, 6).reduce((n, [, text]) => n + shared.wordsOf(text).split(" ").length, 0), expected = expectedPerWord();
  assert.deepEqual(labelPerWord(r.text).map((k, i) => k !== expected[i] ? i + ":" + k : null).filter(Boolean), [BUT + ":SPEAKER 2"]);
  // automatic captions: no capitals, no sentence marks, paragraphs by length
  const captions = shared.wordsOf(TRUTH.map(x => x[1]).join(" ")).split(" "), paras = [];
  for (let i = 0; i < captions.length; i += 70) paras.push(captions.slice(i, i + 70).join(" "));
  const c = V.separate(paras.join("\n\n"), recording(TRUTH));
  assert.equal(c.ok, true, c.why);
  const cw = shared.wordsOf(paras.join(" ")).split(" "), want = truthPerWord(TRUTH);
  const off = labelPerWord(c.text).map((k, i) => k !== want[i] ? cw[i] + "=" + k : null).filter(Boolean);
  // Turn changes are settled by the recording's sentence ends and its pauses, with known limits of a text without marks:
  // "thanks for" keeps the recording's voice as in punctuated text; "summary", the last word of a sentence the recording
  // missed (its full stop landed on the word before), joins the next sentence and its speaker; the flickered "outside"
  // keeps the recording's voice, as in punctuated text; and the interruption, where captions carry no dash and the
  // recording no full stop, sits inside one long stretch heard in more than two voices, so the voices the recording
  // gave its first words stand: "i" (the host's first word, still in the guest's voice) and "sorry the" (the guest's
  // first two words, still in the host's).
  assert.deepEqual(off, ["thanks=SPEAKER 1", "for=SPEAKER 1", "summary=SPEAKER 1", "outside=SPEAKER 1", "i=SPEAKER 2", "sorry=SPEAKER 1", "the=SPEAKER 1"], c.text);
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

test("the route: an unlabeled transcript gets numbered speakers from the recording, a name from the words (0.14: by the identification step), and a fresh reading", async t => {
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
  assert.deepEqual(labelPerWord(b.transcript), expectedPerWord());
  assert.equal(pr.voices.engine, "deepgram"); assert.equal(pr.voices.requestId, "req-test-1"); assert.equal(pr.voices.audioUrl, "https://cdn.example.org/shows/ep12.mp3");
  assert.equal(pr.voices.voices, 2); assert.ok(pr.voices.coverage > 0.8);
  assert.ok(pr.voices.edges.moved >= 3 && pr.voices.edges.kept >= 1, "the record counts the late changes moved and the one left: " + JSON.stringify(pr.voices.edges));
  assert.equal(pr.voices.resultHash, b.run.input.sha256);
  assert.match(pr.voices.method, /lined up with this text word by word \(\d+% of its words matched\)/);
  // Deepgram's words are kept beside the run, so the alignment can be checked without asking again
  const kept = JSON.parse(await fs.readFile(path.join(f.dir, "runs", id, pr.voices.file), "utf8"));
  assert.equal(kept.requestId, "req-test-1"); assert.ok(kept.words.length > 100); assert.deepEqual(kept.words[0].slice(0, 2), ["welcome", 0]);
  // the guest named herself; the host, whom nothing names (a pasted text has no listing), keeps his number with the reason
  const sp = Object.fromEntries(b.run.speakers.map(s => [s.key, s]));
  assert.equal(sp["SPEAKER 2"].name, "Dana Reyes"); assert.equal(sp["SPEAKER 2"].bio, "", "how a name was found is in the identification record, not in the bio the reading is told");
  assert.equal(sp["SPEAKER 1"].name, "Speaker 1");
  const dec = pr.identification.decisions.find(d => d.key === "SPEAKER 2");
  assert.equal(dec.name, "Dana Reyes"); assert.ok(dec.kinds.includes("self_identification")); assert.match(dec.how, /^names itself: “My name is Dana Reyes, and I run the survey lab at the university\.”; called by name just before answering: “Dana, thanks for joining me\.”$/);
  assert.match(pr.identification.unnamed.find(u => u.key === "SPEAKER 1").why, /Nothing in the conversation or the episode's listing names this voice/);
  assert.equal(pr.voices.names, undefined, "the old naming pass is gone");
  assert.equal(pr.voices.clipsChecked, true);
  // the reading gate accepts labels from the recording, for this exact text; the reading was made again on it
  assert.equal(b.attributionGate.status, "ready"); assert.equal(b.attributionGate.origin, "voices");
  assert.ok(b.passages.length && b.passages.every(p => p.analysis && !p.stale.length), "read again on the labelled text");
  const turns = shared.parseTranscript(b.transcript, { mode: b.run.parseMode });
  assert.equal(turns.find(x => /four hundred households in three/.test(x.text)).label, "SPEAKER 2");

  // a person's names (optional): only the names change; "Speaker not established" is not a name to give
  const c = await f.api("POST", "/api/runs/" + id + "/confirm-names", { names: [{ key: "SPEAKER 1", name: "Sam Okafor" }, { key: "SPEAKER 2", name: "Dana Reyes" }, { key: "UNLABELED", name: "Nobody" }] });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  assert.equal(c.data.run.speakers.find(s => s.key === "SPEAKER 1").name, "Sam Okafor");
  assert.deepEqual(c.data.run.provenance.namesByPerson, { "SPEAKER 1": "Sam Okafor" }, "a name given by a person is theirs; an unchanged name is not taken over");
  assert.equal(c.data.run.provenance.identification.decisions.find(d => d.key === "SPEAKER 2").name, "Dana Reyes", "the name the words gave keeps its evidence");
  assert.ok(!c.data.run.speakers.some(s => s.key === "UNLABELED" && s.name === "Nobody"));
  assert.ok(c.data.run.provenance.namesConfirmedAt); assert.equal(c.data.run.provenance.namesConfirmedBy, "person at this computer");
  assert.equal(c.data.run.input.sha256, b.run.input.sha256, "the text is unchanged");
  // the readings were written under the old name, so they say so; reading again brings them up to date
  assert.ok(c.data.passages.every(p => p.stale.includes("speaker names changed since this analysis")), JSON.stringify(c.data.passages.map(p => p.stale)));
  await f.api("POST", "/api/runs/" + id + "/read", {}); const again = await f.finish(id);
  assert.ok(again.passages.every(p => p.readingGate.status === "ready" && !p.stale.length), JSON.stringify(again.passages.map(p => p.readingGate)));
  assert.equal(again.run.speakers.find(s => s.key === "SPEAKER 1").name, "Sam Okafor", "the identification step never replaces a person's name");
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
  // ...and its role labels can still be given names (0.14: any label but a clip's, a quotation's or an advertisement's)
  r = await f.api("POST", "/api/runs/" + labelled + "/confirm-names", { names: [{ key: "HOST", name: "Sam" }, { key: "CLIP 1", name: "x" }] });
  assert.equal(r.status, 200); assert.equal(r.data.run.speakers.find(s => s.key === "HOST").name, "Sam");
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
