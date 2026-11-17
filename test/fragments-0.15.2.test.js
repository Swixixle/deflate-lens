"use strict";
/* 0.15.2: a voice the recording heard only in fragments of other people's sentences is not a speaker. Found in the real
   check of 0.15.1: a two-person conversation came back from Deepgram with a third voice of eighteen pieces of one to
   eight words at the edges of turns, ten of them stopping mid-sentence; shown as a speaker, it put the ends of sentences
   in a phantom's mouth. The pass runs on the labelled text, for labels that came from a recording only: voices lined up
   with a text (voices.js) and Deepgram's own transcription (engines.js). Invented people throughout. */
const test = require("node:test");
const assert = require("node:assert/strict");
const shared = require("../shared/transcript");
const F = require("../server/fragments");
const V = require("../server/voices");
const nameOf = (b, key) => (b.run.speakers.find(s => s.key === key) || {}).name;

const spoken = text => shared.wordsOf(text.replace(/^(?:SPEAKER \d+|CLIP \d+|QUOTE \d+|AD \d+|UNLABELED): /gm, ""));
const lines = text => text.split("\n").filter(Boolean);

/* Two people, and a third voice that only ever has the edges of their sentences: three kinds of fragment and the
   remarks nothing settles. Paragraphs as voices.js writes them (one per earlier turn, pieces inside on their own lines). */
const PHANTOM = [
  "SPEAKER 1: Welcome back to the show. My guest studied the transit survey closely. Dana, thanks for joining me.",
  "SPEAKER 2: Thanks for having me. I run the survey lab at the university.",
  "SPEAKER 1: So what did the survey",
  "SPEAKER 3: actually cover?",                       // begins mid-sentence: finishes what the voice before started
  "SPEAKER 3: It covered",                            // stops mid-sentence: the next voice completes it
  "SPEAKER 2: four hundred households in three neighborhoods. That is a small sample for a city this size.",
  "SPEAKER 3: Right.",                                // a complete remark: nothing settles who said it
  "SPEAKER 2: So when the report says riders everywhere support more lanes, it is stretching what four hundred households can tell you.",
  "SPEAKER 1: But the mayor's office says the",
  "SPEAKER 3: results are",                           // inside one sentence, the same voice on both sides
  "SPEAKER 1: clear.",
  "SPEAKER 2: The results are clear for those three neighborhoods. They are not clear for the whole city.",
  "SPEAKER 1: I was going to ask about the",
  "SPEAKER 3: budget for",                            // inside one sentence, two voices around it: the text runs on, so the next voice
  "SPEAKER 2: next year, which doubles the lane program.",
  "SPEAKER 3: Yeah. We will",                         // a remark, then a stop mid-sentence
  "SPEAKER 1: leave it there. Dana Reyes, thank you.",
].join("\n\n");

test("a voice heard only in fragments of other people's sentences is taken apart: each piece rejoins its sentence, a remark nothing settles is unlabelled, the voices are renumbered, every word kept", () => {
  const r = F.rejoinFragments(PHANTOM);
  assert.equal(r.changed, true, r.skipped);
  assert.equal(spoken(r.text), spoken(PHANTOM), "no word lost, added or reordered");
  assert.deepEqual(r.removed, ["SPEAKER 3"]); assert.deepEqual(r.renamed, {}, "SPEAKER 1 and 2 keep their numbers");
  assert.deepEqual(r.fragments, { voices: 1, turns: 6, words: 12, forward: 3, backward: 2, unsettled: 2 });
  const L = lines(r.text);
  assert.ok(L.includes("SPEAKER 1: So what did the survey actually cover?"), "finishes the sentence the voice before began");
  assert.ok(L.includes("SPEAKER 2: It covered four hundred households in three neighborhoods. That is a small sample for a city this size."), "a stop mid-sentence goes to the voice that completes it");
  assert.ok(L.includes("UNLABELED: Right."), "a complete remark between two people is given to no one");
  assert.ok(L.includes("SPEAKER 1: But the mayor's office says the results are") && L.includes("SPEAKER 1: clear."), "inside one voice's sentence, that voice (the earlier turns stay separate paragraphs)");
  assert.ok(L.includes("SPEAKER 2: budget for next year, which doubles the lane program."), "between two voices, the text runs straight on into the next voice");
  assert.ok(L.includes("UNLABELED: Yeah.") && L.includes("SPEAKER 1: We will leave it there. Dana Reyes, thank you."), "a remark and a stop mid-sentence in one turn go their separate ways");
  assert.ok(!/SPEAKER 3/.test(r.text));
  assert.doesNotMatch(r.text, /\n{3,}/, "a removed turn leaves no empty paragraph");
  assert.match(F.describe(r), /One voice the recording heard only in fragments .* \(6 pieces, 12 words\) was not counted as a speaker/);
});

test("a real third speaker is kept: short complete turns are not fragments, and one broken turn among complete ones is not enough", () => {
  const caller = PHANTOM.replace(/SPEAKER 3: Right\./, "SPEAKER 4: Hi, Dana. I ride that line every day.").replace(/SPEAKER 3: Yeah\. We will/, "SPEAKER 4: Thank you both.");
  const r = F.rejoinFragments(caller);
  assert.equal(r.changed, true, "the phantom is still taken apart");
  assert.ok(lines(r.text).includes("SPEAKER 3: Hi, Dana. I ride that line every day.") && lines(r.text).includes("SPEAKER 3: Thank you both."), "the caller stays a speaker, renumbered after the phantom's number is gone: " + r.text);
  assert.deepEqual(r.renamed, { "SPEAKER 4": "SPEAKER 3" });
  // the caller's second turn is cut off mid-sentence by the recording: one broken turn in three is not a fragment voice
  const cut = caller.replace("SPEAKER 4: Thank you both.", "SPEAKER 4: Thank you both, and").replace("SPEAKER 1: leave it there. Dana Reyes, thank you.", "SPEAKER 1: good luck with the lanes. Dana Reyes, thank you.");
  const r2 = F.rejoinFragments(cut);
  assert.ok(lines(r2.text).includes("SPEAKER 3: Thank you both, and"), "kept as the caller's own words: " + r2.text);
  // the whole conversation in pieces: nothing is changed
  const r3 = F.rejoinFragments("SPEAKER 1: So what did\n\nSPEAKER 2: the survey cover?\n\nSPEAKER 1: It covered\n\nSPEAKER 2: four hundred households.");
  assert.equal(r3.changed, false); assert.match(r3.skipped, /every voice/);
});

test("a voice with one longer turn is a speaker, until the longer turn is a clip set apart: then the fragments are taken apart, and the clip's reader and the speakers' notes follow", () => {
  // the clip played in the show came back in the spare voice, as one long turn (as in the real check)
  const withClip = PHANTOM.replace("SPEAKER 3: Right.", "SPEAKER 1: Listen to this clip from the mayor's press conference:\n\nSPEAKER 3: We have heard from riders all over the city and the message is clear, they want more bus lanes and they want them now.\n\nSPEAKER 1: That was the mayor on Tuesday.");
  const r = F.rejoinFragments(withClip);
  assert.equal(r.changed, false, "a voice with a turn longer than ten words is not a fragment voice");
  const clipped = withClip.replace("SPEAKER 3: We have heard from riders", "CLIP 1: We have heard from riders");
  const speakers = [{ key: "SPEAKER 1", name: "Dale Whitcomb", bio: "Named from the words" }, { key: "SPEAKER 2", name: "Speaker 2", bio: "" }, { key: "SPEAKER 3", name: "Speaker 3", bio: "" }, { key: "SPEAKER 4", name: "Speaker 4", bio: "Introduced by SPEAKER 3 and SPEAKER 1." },
    { key: "CLIP 1", name: "Clip 1 (introduced as the mayor)", bio: "A recording played by SPEAKER 3, introduced with: “Listen to this clip”. Its words are the mayor's, not SPEAKER 3's." }];
  const text4 = clipped + "\n\nSPEAKER 4: Thanks for having me on, both of you. I ride that line every single day and the survey never reached my street.";
  const out = F.rejoinLabelled({ text: text4, speakers, clips: [{ key: "CLIP 1", kind: "recording", speaker: "SPEAKER 3" }], ads: [{ key: "AD 1", speakers: ["SPEAKER 4", "SPEAKER 3"] }] });
  assert.equal(out.changed, true, out.result.skipped);
  assert.deepEqual(out.result.removed, ["SPEAKER 3"]); assert.deepEqual(out.result.renamed, { "SPEAKER 4": "SPEAKER 3" });
  assert.deepEqual(out.speakers.map(s => s.key), ["SPEAKER 1", "SPEAKER 2", "SPEAKER 3", "CLIP 1", "UNLABELED"]);
  assert.equal(out.speakers[0].name, "Dale Whitcomb", "a name is kept"); assert.equal(out.speakers[2].name, "Speaker 3", "a number as a name follows the renumbering");
  assert.equal(out.speakers[2].bio, "Introduced by a speaker the recording did not establish and SPEAKER 1.", "a note's mention of the voice taken apart, before its number is given to another voice");
  assert.equal(out.speakers[3].bio, "A recording played by a speaker the recording did not establish, introduced with: “Listen to this clip”. Its words are the mayor's, not a speaker the recording did not establish's.");
  assert.equal(out.speakers[4].bio, "The recording did not settle who is speaking here: these words were heard in a voice that otherwise spoke only in fragments of other people's sentences.");
  assert.deepEqual(out.clips, [{ key: "CLIP 1", kind: "recording", speaker: "UNLABELED" }]); assert.deepEqual(out.ads, [{ key: "AD 1", speakers: ["SPEAKER 3", "UNLABELED"] }]);
  assert.ok(lines(out.text).includes("CLIP 1: We have heard from riders all over the city and the message is clear, they want more bus lanes and they want them now."), "the clip is untouched");
  assert.ok(lines(out.text).some(l => /^SPEAKER 3: Thanks for having me on, both of you\./.test(l)), out.text);
  // the speakers' list already had a not-established voice: its note is extended, not replaced
  const out2 = F.rejoinLabelled({ text: PHANTOM.replace("SPEAKER 3: Right.", "UNLABELED: Right."), speakers: [{ key: "SPEAKER 1", name: "Speaker 1", bio: "" }, { key: "SPEAKER 2", name: "Speaker 2", bio: "" }, { key: "SPEAKER 3", name: "Speaker 3", bio: "" }, { key: "UNLABELED", name: "Speaker not established", bio: "The recording did not settle who is speaking here: these words did not line up with it." }], clips: [], ads: [] });
  assert.equal(out2.changed, true);
  assert.equal(out2.speakers.find(s => s.key === "UNLABELED").bio, "The recording did not settle who is speaking here: these words did not line up with it, or were heard in a voice that otherwise spoke only in fragments of other people's sentences.");
});

test("a piece never joins a clip, an advertisement or an unlabelled line", () => {
  const beside = "SPEAKER 1: Here is the clip, and here is what he said about the lanes.\n\nCLIP 1: We want more lanes and we want them now.\n\nSPEAKER 3: And then\n\nSPEAKER 1: he left the stage.\n\nAD 1: This hour is brought to you by Northwind Coffee.\n\nSPEAKER 3: Welcome\n\nSPEAKER 2: back to the show, everyone. We were talking about the survey before the break.\n\nSPEAKER 1: So,\n\nSPEAKER 3: what\n\nUNLABELED: did he say next?\n\nSPEAKER 2: Nothing much.";
  const r2 = F.rejoinFragments(beside);
  assert.equal(r2.changed, true, r2.skipped);
  assert.equal(spoken(r2.text), spoken(beside));
  const L = lines(r2.text);
  assert.ok(L.includes("CLIP 1: We want more lanes and we want them now.") && L.includes("AD 1: This hour is brought to you by Northwind Coffee."), "clip and advertisement untouched");
  assert.ok(L.includes("SPEAKER 1: And then he left the stage."), "after a clip, the piece goes forward to the voice that completes it: " + r2.text);
  assert.ok(L.includes("SPEAKER 2: Welcome back to the show, everyone. We were talking about the survey before the break."), "after an advertisement, likewise");
  assert.ok(L.includes("SPEAKER 1: So, what") && L.includes("UNLABELED: did he say next?"), "a piece that begins mid-sentence goes to the voice before; it never joins the unlabelled line after it: " + r2.text);
  // a piece that stops mid-sentence before an unlabelled line has no voice to go to: it stays unlabelled with those words
  const r3 = F.rejoinFragments("SPEAKER 1: We looked at the raw responses, not just the summary, for a week.\n\nSPEAKER 3: And\n\nUNLABELED: so\n\nSPEAKER 1: did the city, I hope.\n\nSPEAKER 3: We will\n\nUNLABELED: leave\n\nSPEAKER 2: it there, then. Thank you for coming in today.\n\nSPEAKER 3: Yes.");
  assert.equal(r3.changed, true, r3.skipped);
  const L3 = lines(r3.text);
  assert.ok(L3.includes("UNLABELED: And") && L3.includes("UNLABELED: so") && L3.includes("UNLABELED: We will") && L3.includes("UNLABELED: leave") && L3.includes("UNLABELED: Yes."), r3.text);
  assert.ok(!L3.some(l => /^SPEAKER 3: /.test(l)) && L3.includes("SPEAKER 2: it there, then. Thank you for coming in today."), "the voices around them are not given words they were not heard to say: " + r3.text);
});

test("captions without sentence marks are left alone, and so is a text with no labels", () => {
  const caps = "SPEAKER 1: welcome back to the show today we talk about the survey\n\nSPEAKER 3: and what\n\nSPEAKER 2: it shows is not much\n\nSPEAKER 3: right\n\nSPEAKER 1: so the sample";
  const r = F.rejoinFragments(caps);
  assert.equal(r.changed, false); assert.match(r.skipped, /sentence marks/);
  assert.equal(F.rejoinFragments("Just prose. No labels at all.").changed, false);
  assert.equal(F.describe(r), "");
});

test("Deepgram's own transcription (one line per turn, numbered by its voice ids) is renumbered after the phantom is taken apart", () => {
  const dg = ["SPEAKER 2: Welcome back. Today we talk about plans with Dana Reyes.", "SPEAKER 1: Thanks for", "SPEAKER 6: having me. A bad plan beats no plan.", "SPEAKER 1: Right.", "SPEAKER 2: Does it", "SPEAKER 1: really?", "SPEAKER 6: It does when the alternative is drift.", "SPEAKER 1: Hm."].join("\n");
  const r = F.rejoinFragments(dg);
  assert.equal(r.changed, true, r.skipped);
  assert.equal(r.text, ["SPEAKER 1: Welcome back. Today we talk about plans with Dana Reyes.", "SPEAKER 2: Thanks for having me. A bad plan beats no plan.", "UNLABELED: Right.", "SPEAKER 1: Does it really?", "SPEAKER 2: It does when the alternative is drift.", "UNLABELED: Hm."].join("\n"));
  assert.deepEqual(r.renamed, { "SPEAKER 2": "SPEAKER 1", "SPEAKER 6": "SPEAKER 2" }); assert.deepEqual(r.removed, ["SPEAKER 1"]);
  assert.match(F.describe(r), /SPEAKER 2 is now SPEAKER 1, SPEAKER 6 is now SPEAKER 2/);
});

/* The route: the recording's answer for the 0.13 test conversation, with a spare voice given the edges of three turns
   and one "Right." (see test/voices-0.13.test.js for the conversation and the answer's shape). */
test("voices lined up with a text: a spare voice at the edges of turns ends as the two speakers and one remark nothing settles; the record says what was done", async () => {
  const fixture = require("./voices-0.13.fixture");
  const d = fixture.recording(fixture.TRUTH), ws = d.results.channels[0].alternatives[0].words;
  const give = (phrase, voice) => { const want = shared.wordsOf(phrase).split(" "); for (let i = 0; i + want.length <= ws.length; i++) if (want.every((w, k) => ws[i + k].word === w)) { for (let k = 0; k < want.length; k++) ws[i + k].speaker = voice; return; } throw new Error("not in the recording: " + phrase); };
  give("So when", 2); give("It covered", 2); give("are clear", 2); give("Right", 2);
  const r = V.separate(fixture.TEXT, d);
  assert.equal(r.ok, true, r.why);
  assert.equal(r.voices, 3, "before the pass, the recording's third voice is a speaker"); assert.deepEqual(r.voiceIds, { "SPEAKER 1": 0, "SPEAKER 2": 1, "SPEAKER 3": 2 });
  const rj = F.rejoinFragments(r.text);
  assert.equal(rj.changed, true, rj.skipped);
  assert.equal(spoken(rj.text), shared.wordsOf(fixture.TEXT));
  // "So when" the alignment itself settled (the spare voice continued from the sentence before, and the pause was at the
  // edge: voices.js step 3); the other three are the pass's
  assert.deepEqual(rj.removed, ["SPEAKER 3"]); assert.deepEqual(rj.fragments, { voices: 1, turns: 3, words: 5, forward: 1, backward: 1, unsettled: 1 });
  const L = lines(rj.text);
  assert.ok(L.some(l => /^SPEAKER 2: So when the report says riders everywhere support more lanes/.test(l)), rj.text);
  assert.ok(L.some(l => /^SPEAKER 2: It covered four hundred households in three neighborhoods\./.test(l)), "a stop mid-sentence rejoined to the words that complete it: " + rj.text);
  assert.ok(L.some(l => /^SPEAKER 1: .*office says the results are clear\.$/.test(l)), "a sentence's end given back to the voice that began it: " + rj.text);
  assert.ok(L.includes("UNLABELED: Right."), "a remark the recording gave the spare voice is not established: " + rj.text);
  assert.ok(!L.some(l => /^SPEAKER 3: /.test(l)));
});

/* ---------- the routes: Deepgram's own transcription of an episode (the way an uploaded recording or a link with no
   published transcript goes), with a spare voice at the edges of turns; the invented show of the 0.14 tests ---------- */
const ST = require("./fixtures/straight-talk");
/* The show's conversation as Deepgram might hear it with a spare voice (4): the end of the host's question, the start of
   two of the guest's answers, and a "Right." the host said. */
const SPARE = ST.SAID.flatMap(([v, t]) => {
  if (t === "So, Marcus, what do the steel numbers actually show?") return [[1, "So, Marcus, what do the steel"], [4, "numbers actually show?"]];
  if (t.startsWith("They show output up eleven percent")) return [[4, "They show"], [2, t.slice("They show ".length)]];
  if (t === "Right.") return [[4, "Right."]];
  if (t.startsWith("Some did. But the plants hired")) return [[4, "Some did. But the"], [2, t.slice("Some did. But the ".length)]];
  return [[v, t]];
});

test("a link transcribed by Deepgram: the spare voice is taken apart as the text arrives, the record says so, and host and guest are named", async t => {
  const ai = ST.scriptedAI(), fetchFn = ST.chainFetch(SPARE);
  const f = await ST.server(t, { ai, fetch: fetchFn, env: { DEEPGRAM_API_KEY: ST.KEY, TRANSCRIBE_PREFER: "cloud" } });
  const b = await ST.fromLink(f, ST.APPLE_LINK);
  assert.ok(!/^SPEAKER 5: /m.test(b.transcript), "Deepgram's fifth voice is not a speaker: " + b.transcript);
  const L = lines(b.transcript);
  assert.ok(L.some(l => /^SPEAKER 2: So, Marcus, what do the steel numbers actually show\?$/.test(l)), "the end of the question is the host's again: " + b.transcript);
  assert.ok(L.some(l => /^SPEAKER 3: They show output up eleven percent/.test(l)) && L.some(l => /^SPEAKER 3: But the plants hired eight hundred workers/.test(l)), "the starts of the answers are the guest's again: " + b.transcript);
  assert.ok(L.includes("UNLABELED: Right.") && L.includes("UNLABELED: Some did."), "two complete remarks the recording gave the spare voice are not established: " + b.transcript);
  assert.deepEqual(b.run.speakers.map(s => s.key).sort(), ["AD 1", "SPEAKER 1", "SPEAKER 2", "SPEAKER 3", "SPEAKER 4", "UNLABELED"], JSON.stringify(b.run.speakers.map(s => s.key)));
  assert.equal(nameOf(b, "SPEAKER 2"), ST.HOST); assert.equal(nameOf(b, "SPEAKER 3"), ST.GUEST);
  assert.equal(nameOf(b, "UNLABELED"), "Speaker not established");
  const pr = b.run.provenance;
  assert.equal(pr.labelsOrigin, "voices"); assert.equal(pr.voices.via, "transcription"); assert.equal(pr.voices.voices, 4);
  // (two of the spare voice's utterances follow each other, so Deepgram's text has them as one turn: three turns, five pieces)
  assert.deepEqual(pr.voices.fragments.removed, ["SPEAKER 5"]); assert.deepEqual([pr.voices.fragments.turns, pr.voices.fragments.forward, pr.voices.fragments.backward, pr.voices.fragments.unsettled], [3, 2, 1, 2]);
  assert.match(pr.voices.method, /One voice the recording heard only in fragments of other people's sentences \(3 pieces, 10 words\) was not counted as a speaker/);
  assert.match(pr.method, /not counted as a speaker/);
  assert.ok(b.passages.length && b.passages.every(p => p.readingGate.status === "ready"), JSON.stringify(b.passages.map(p => p.readingGate)));
  const ex = (await f.api("GET", "/api/runs/" + b.run.id + "/export.json")).data;
  assert.match(ex.run.provenance.voices.method, /not counted as a speaker/, "the export carries the record");
});

test("when the spare voice also holds a clip played in the show, it is taken apart once the clip is set apart; the clip's reader is then not established", async t => {
  const withClip = SPARE.flatMap(([v, t]) => t === "We'll be right back after this." ? [[1, "Listen to this clip from the governor's press conference."], [4, "We have heard from mills all over the state, and the message is clear: they are hiring again and they want the tariffs to stay."], [1, "That was the governor on Tuesday. We'll be right back after this."]] : [[v, t]]);
  const base = ST.scriptedAI();
  const ai = Object.assign({}, base, { async sample(args) {
    const p = String(args.prompt || "");
    if (p.startsWith("Find recordings played")) {
      const out = await base.sample(args), paras = [...p.matchAll(/^\[(\d+)\] (.*)$/gm)].map(m => ({ i: +m[1], text: m[2].replace(/^[A-Z][A-Z0-9 ]*:\s*/, "") }));
      const clip = paras.find(x => /^We have heard from mills/.test(x.text));
      if (clip) out.data.clips = [{ para: clip.i, start: "We have heard from mills", end: "they want the tariffs to stay.", introQuote: "Listen to this clip from the governor's press conference.", returnQuote: "That was the governor on Tuesday.", kind: "recording", introducedAs: "the governor" }];
      return Object.assign(out, { text: JSON.stringify(out.data) });
    }
    return base.sample(args);
  } });
  const f = await ST.server(t, { ai, fetch: ST.chainFetch(withClip), env: { DEEPGRAM_API_KEY: ST.KEY, TRANSCRIBE_PREFER: "cloud" } });
  const b = await ST.fromLink(f, ST.APPLE_LINK);
  const L = lines(b.transcript);
  assert.ok(L.some(l => /^CLIP 1: We have heard from mills all over the state/.test(l)), "the clip was set apart: " + b.transcript);
  assert.ok(!/^SPEAKER 5: /m.test(b.transcript), "with the clip set apart, the spare voice is only fragments, and goes: " + b.transcript);
  assert.ok(L.some(l => /^SPEAKER 2: So, Marcus, what do the steel numbers actually show\?$/.test(l)) && L.includes("UNLABELED: Right."), b.transcript);
  const pr = b.run.provenance;
  assert.equal(pr.structure.mode, "labelled"); assert.deepEqual(pr.structure.clips.map(c => [c.key, c.speaker]), [["CLIP 1", "UNLABELED"]], "the clip's reader was the voice taken apart");
  assert.deepEqual(pr.voices.fragments.removed, ["SPEAKER 5"]); assert.equal(pr.voices.fragments.turns, 3);
  assert.equal(pr.voices.clipsChecked, false, "the record of the transcription stays as it was, with the fragments added to it");
  assert.match(pr.voices.method, /not counted as a speaker/);
  const clip = b.run.speakers.find(s => s.key === "CLIP 1");
  assert.match(clip.bio, /^A recording played by a speaker the recording did not establish, introduced with: /);
  assert.equal(nameOf(b, "SPEAKER 2"), ST.HOST); assert.equal(nameOf(b, "SPEAKER 3"), ST.GUEST);
  assert.ok(b.passages.length && b.passages.every(p => p.readingGate.status === "ready"), JSON.stringify(b.passages.map(p => p.readingGate)));
});
