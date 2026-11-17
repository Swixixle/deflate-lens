"use strict";
/* 0.14.10: a feed's or a caption file's own speaker numbers (SPEAKER n) that the words cannot settle are replaced by the
   voices from the recording, when there is one and Deepgram is set up; otherwise the hold says what would settle them.
   The audit is a stand-in that cannot settle the publisher's numbers (the real model found the same on a real feed whose
   diarization split one voice across three numbers); the recording is the voices fixture's synthetic Deepgram answer.
   Invented people throughout. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research");
const shared = require("../shared/transcript");

const HOST = 0, GUEST = 1;
const TRUTH = [
  [HOST, "Welcome back to the show. Today we are talking about the new transit survey that the city released last month. My guest studied it closely. Dana, thanks for joining me."],
  [GUEST, "Thanks for having me. My name is Dana Reyes, and I run the survey lab at the university. We looked at the raw responses, not just the summary."],
  [HOST, "So what did the survey actually cover?"],
  [GUEST, "It covered four hundred households in three neighborhoods. That is a small sample for a city this size, and the neighborhoods were chosen because they already had bus lanes."],
  [HOST, "Right."],
  [GUEST, "So when the report says riders everywhere support more lanes, it is stretching what four hundred households can tell you."],
  [HOST, "But the mayor's office says the results are clear."],
  [GUEST, "The results are clear for those three neighborhoods. They are not clear for the whole city, and the report does not say how people were contacted. Nobody outside the office has seen the questionnaire either."],
  [HOST, "I was going to ask about the budget for next year, which doubles the lane program."],
  [GUEST, "If the budget doubles on the strength of this survey, that is a decision resting on a narrow sample."],
  [HOST, "We will leave it there. Dana Reyes, thank you."],
];
/* The publisher's diarization as a feed transcript shows it: the host's voice split across two numbers (1 and 3), the
   guest's under 2, every word present. */
const FEED_TEXT = TRUTH.map(([who, text], i) => (who === GUEST ? "SPEAKER 2" : i % 4 === 0 ? "SPEAKER 3" : "SPEAKER 1") + ": " + text).join("\n");
/* Deepgram's answer for the same conversation (the voices fixture's shape, without its mishearings). */
function recording(truth) {
  const out = []; let t = 0;
  truth.forEach(([speaker, text], turnNo) => {
    if (turnNo) t += 0.6;
    for (const w of text.split(/\s+/).filter(w => shared.wordsOf(w))) { out.push({ word: shared.wordsOf(w), punctuated_word: w, speaker, start: t, end: t + 0.3, confidence: 0.9, speaker_confidence: 0.8 }); t += 0.35 + (/[.?!]$/.test(w) ? 0.3 : 0); }
  });
  return { metadata: { request_id: "req-fallback-1", duration: Math.round(t), models: ["nova-3-test"] }, results: { channels: [{ alternatives: [{ transcript: out.map(w => w.punctuated_word).join(" "), words: out }] }] } };
}
const fakeDeepgram = (answer, configured = true, onCall) => { const calls = []; return { calls, name: "deepgram", model: "nova-3", configured: () => configured, async diarize({ audioUrl }) { calls.push(audioUrl); if (onCall) onCall(); return answer; } }; };
/* The audit as a stand-in: while the publisher's numbers stand it cannot settle SPEAKER 3 (the words give no identity);
   once the recording has been consulted it keeps every label, as the mock does. The mock's other answers are unchanged. */
function unsettlingAI() {
  const mock = createMockAI(); const state = { unsettled: true, audits: 0 };
  const ai = { ...mock, state, async sample(args) {
    const out = await mock.sample(args);
    if (/^(Prepare transcript speaker labels|Review transcript speaker labels independently)/.test(String(args.prompt || ""))) {
      state.audits++;
      if (state.unsettled) { for (const d of out.data.decisions) if (d.speaker === "SPEAKER 3") Object.assign(d, { status: "uncertain", speaker: "", evidenceKind: "insufficient", reason: "STAND-IN: nothing in the words says who this is." }); out.text = JSON.stringify(out.data); }
    }
    return out;
  } };
  return ai;
}
const IMPORT = { url: "https://feeds.example.org/transit.xml", title: "Episode 12", fetchedAt: "2026-10-08T00:00:00Z", chars: FEED_TEXT.length, method: "transcript: feed-transcript", source: { kind: "feed-transcript", url: "https://feeds.example.org/ep12.vtt", format: "vtt", note: "the transcript the show publishes" }, show: "The Transit Hour", episode: "Episode 12", matchedBy: "feed by guid", speakers: ["SPEAKER 1", "SPEAKER 2", "SPEAKER 3"],
  episodeInfo: { guid: "g12", title: "Episode 12", audioUrl: "https://cdn.example.org/ep12.mp3", description: "A conversation about the transit survey." }, showInfo: { name: "The Transit Hour", author: "", artist: "", persons: [] } };

/* The context the transcript chain gives a fetched transcript (app.js: title, sourceUrl, sourceLabel and the import). */
const CONTEXT = imp => ({ title: "Episode 12", sourceUrl: imp.url, sourceLabel: "The Transit Hour — Episode 12", speakers: [], import: imp });
async function fixture(t, cloud, ai) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-fallback-"));
  const app = createApp({ dataDir: dir, examplesDir: dir, env: {}, envPath: path.join(dir, ".env"), ai, research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), run: async () => ({ code: 1, out: "" }), cloudEngine: cloud });
  await app.ready;
  const server = await new Promise(r => { const s = app.app.listen(0, "127.0.0.1", () => r(s)); });
  const api = async (method, p, body) => { const res = await fetch("http://127.0.0.1:" + server.address().port + p, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, data: await res.json().catch(() => null) }; };
  const finish = async id => { const job = app.reader.jobs.get(id); if (job) await job.done; return app.store.bundle(id); };
  t.after(async () => { for (const job of app.reader.jobs.values()) job.controller.abort(); await Promise.all([...app.reader.jobs.values()].map(j => j.done)); await new Promise(r => server.close(r)); await fs.rm(dir, { recursive: true, force: true }); });
  return { ...app, api, finish, dir };
}
const labelOf = (b, phrase) => shared.effSpeaker(shared.parseTranscript(b.transcript, { mode: b.run.parseMode }).find(x => x.text.includes(phrase)), b.run.provenance.overrides);

test("a feed transcript's numbers the words cannot settle are replaced by the recording's voices, accepted as the recording's labels are, and read", async t => {
  const ai = unsettlingAI(); const cloud = fakeDeepgram(recording(TRUTH), true, () => { ai.state.unsettled = false; });
  const f = await fixture(t, cloud, ai);
  const made = await f.api("POST", "/api/intake", { input: FEED_TEXT, context: CONTEXT(IMPORT) });
  assert.equal(made.status, 202, JSON.stringify(made.data));
  const id = made.data.run.id, b0 = made.data;
  assert.deepEqual(shared.speakerLabels(shared.parseTranscript(b0.transcript, { mode: b0.run.parseMode })).sort(), ["SPEAKER 1", "SPEAKER 2", "SPEAKER 3"], "the publisher's numbers came with the text");
  const b = await f.finish(id);
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  assert.deepEqual(cloud.calls, ["https://cdn.example.org/ep12.mp3"], "the episode's recording was sent once, found from the listing");
  const pr = b.run.provenance;
  assert.equal(pr.labelsOrigin, "voices");
  assert.equal(pr.voices.earlierLabelsSetAside, "source", "the record says whose labels were set aside");
  assert.equal(pr.voices.auto, true); assert.match(pr.voices.method, /^The transcript's own speaker labels could not be settled from the words, so the episode's recording was sent to Deepgram \(your key\) to separate the voices, and its labels replaced them\. /);
  assert.equal(pr.voices.requestId, "req-fallback-1"); assert.equal(pr.voices.voices, 2);
  assert.equal(pr.voicesAttempt, undefined, "no failed or skipped attempt stands on the record");
  // the recording's two voices replaced the publisher's three numbers; every word kept
  assert.deepEqual(shared.speakerLabels(shared.parseTranscript(b.transcript, { mode: b.run.parseMode })), ["SPEAKER 1", "SPEAKER 2"]);
  assert.equal(shared.wordsOf(b.transcript.replace(/^SPEAKER \d+: /gm, "")), shared.wordsOf(FEED_TEXT.replace(/^SPEAKER \d+: /gm, "")), "no word lost, added or reordered");
  assert.equal(labelOf(b, "Right."), "SPEAKER 1"); assert.equal(labelOf(b, "We will leave it there"), "SPEAKER 1", "the host's turns the publisher split off are the host's voice again");
  assert.equal(labelOf(b, "four hundred households in three"), "SPEAKER 2");
  // the audit ran on the publisher's numbers (two passes, held); the recording's labels are accepted for this exact text
  // as they are for text that came without labels, so the audit is not run again, and the reading went on
  assert.equal(ai.state.audits, 2, "two passes on the publisher's numbers, none on the recording's: " + ai.state.audits);
  assert.equal(b.attributionGate.status, "ready"); assert.equal(b.attributionGate.origin, "voices");
  assert.equal(b.run.preparation.status, "held"); assert.ok(b.run.preparation.unresolved.length > 0); assert.notEqual(b.run.preparation.inputHash, b.run.input.sha256, "the held audit is the earlier text's");
  assert.ok(b.passages.length && b.passages.every(p => p.analysis && p.readingGate.status === "ready"), JSON.stringify(b.passages.map(p => p.readingGate)));
  assert.equal(b.run.speakers.find(s => s.key === "SPEAKER 2").name, "Dana Reyes", "identification ran on the recording's labels");
  // the publisher's text is kept beside the run, by its hash
  const earlier = await f.store.textForHash(id, pr.voices.inputHash);
  assert.equal(shared.wordsOf(String(earlier || "").replace(/^SPEAKER \d+: /gm, "")), shared.wordsOf(FEED_TEXT.replace(/^SPEAKER \d+: /gm, "")), "the publisher's version is on record");
  assert.ok(/^SPEAKER 3: /m.test(String(earlier)), "with its own numbers");
  // the export carries the record
  const ex = await f.api("GET", "/api/runs/" + id + "/export.json");
  assert.equal(ex.data.run.provenance.labelsOrigin, "voices"); assert.equal(ex.data.run.provenance.voices.earlierLabelsSetAside, "source");
});

test("without a Deepgram key the reading is held, the hold says the recording could settle it, and adding the key and reading again does", async t => {
  const ai = unsettlingAI(); const cloud = fakeDeepgram(recording(TRUTH), false, () => { ai.state.unsettled = false; });
  const f = await fixture(t, cloud, ai);
  const id = (await f.api("POST", "/api/intake", { input: FEED_TEXT, context: CONTEXT(IMPORT) })).data.run.id;
  let b = await f.finish(id);
  assert.equal(b.run.processing.status, "held", JSON.stringify(b.run.processing));
  assert.match(b.run.processing.message, /The recording could settle them: add a Deepgram key under Controls → App and files and press Read again\./);
  assert.deepEqual(cloud.calls, [], "nothing was sent anywhere");
  const at = b.run.provenance.voicesAttempt;
  assert.equal(at.status, "skipped"); assert.equal(at.code, "no_deepgram_key"); assert.equal(at.auto, true); assert.match(at.why, /no Deepgram key is set/);
  assert.equal(b.run.provenance.labelsOrigin || "source", "source"); assert.equal(b.run.preparation.status, "held");
  assert.ok(b.run.preparation.unresolved.length > 0); assert.ok(!b.passages.some(p => p.analysis), "nothing was read on unsettled labels");
  // the key arrives (the engine is now configured) and the person reads again: the skip does not stand in the way
  cloud.configured = () => true;
  const again = await f.api("POST", "/api/runs/" + id + "/read", {}); assert.equal(again.status, 202, JSON.stringify(again.data));
  b = await f.finish(id);
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  assert.deepEqual(cloud.calls, ["https://cdn.example.org/ep12.mp3"]);
  assert.equal(b.run.provenance.labelsOrigin, "voices"); assert.equal(b.run.provenance.voices.earlierLabelsSetAside, "source");
  assert.equal(b.run.provenance.voicesAttempt, undefined, "the skip is gone with the voices on record");
  assert.ok(b.passages.length && b.passages.every(p => p.analysis && p.readingGate.status === "ready"));
});

test("a recording that cannot be used leaves the hold with the failure on record, once; role labels and names are never set aside", async t => {
  // the recording is another conversation: the voices do not line up, the hold stands, the failure is recorded
  const ai = unsettlingAI(); const wrong = fakeDeepgram(recording([[0, "In the garden this week we planted tomatoes along the south fence."], [1, "Mine never climb, the soil stays too wet."]]));
  const f = await fixture(t, wrong, ai);
  const id = (await f.api("POST", "/api/intake", { input: FEED_TEXT, context: CONTEXT(IMPORT) })).data.run.id;
  let b = await f.finish(id);
  assert.equal(b.run.processing.status, "held"); assert.match(b.run.processing.message, /A transcript with reliable speaker labels or the recording is needed\./);
  assert.equal(wrong.calls.length, 1);
  const at = b.run.provenance.voicesAttempt; assert.equal(at.status, "failed"); assert.equal(at.auto, true); assert.ok(at.why, "the reason is on record");
  assert.equal(b.run.provenance.labelsOrigin || "source", "source", "the publisher's numbers stand");
  assert.equal(shared.wordsOf(b.transcript.replace(/^SPEAKER \d+: /gm, "")), shared.wordsOf(FEED_TEXT.replace(/^SPEAKER \d+: /gm, "")));
  // reading again does not send the recording a second time for the same text
  await f.api("POST", "/api/runs/" + id + "/read", {}); b = await f.finish(id);
  assert.equal(b.run.processing.status, "held"); assert.equal(wrong.calls.length, 1, "once per text");
  // role labels the publisher wrote are not a service's numbers: the recording is not consulted, the hold is the plain one
  const roles = TRUTH.map(([who, text], i) => (who === GUEST ? "GUEST" : i % 4 === 0 ? "COHOST" : "HOST") + ": " + text).join("\n");
  const ai2 = { ...createMockAI(), async sample(args) { const out = await createMockAI().sample(args); if (/^(Prepare|Review) transcript speaker labels/.test(String(args.prompt || ""))) { for (const d of out.data.decisions) if (d.speaker === "COHOST") Object.assign(d, { status: "uncertain", speaker: "", evidenceKind: "insufficient" }); } return out; } };
  const good = fakeDeepgram(recording(TRUTH));
  const g = await fixture(t, good, ai2);
  const id2 = (await g.api("POST", "/api/intake", { input: roles, context: CONTEXT(Object.assign({}, IMPORT, { speakers: ["HOST", "GUEST", "COHOST"] })) })).data.run.id;
  b = await g.finish(id2);
  assert.equal(b.run.processing.status, "held"); assert.match(b.run.processing.message, /A transcript with reliable speaker labels or the recording is needed\./);
  assert.deepEqual(good.calls, [], "a publisher's role labels are kept, not set aside for the recording");
  assert.equal(b.run.provenance.voicesAttempt, undefined, "and no attempt is recorded for them");
  // the manual request on such a transcript is still refused
  const r = await g.api("POST", "/api/runs/" + id2 + "/voices", { link: "https://cdn.example.org/ep12.mp3" });
  assert.equal(r.status, 409); assert.equal(r.data.code, "source_labels");
});
