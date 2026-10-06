"use strict";
/* 0.14.5: every name is put to a second reading. A review of 0.14.4 separated two questions: were the quoted words spoken
   in that turn (quote accuracy, which 0.14.4 checks), and do those words, with everything around them, support that
   person's name (identity support)? Set seven's A4 shows the gap. The stand-in opens the show the way its host would
   ("Welcome to the Dale Whitcomb Show.", real words, in his own turn), and only the meaning of the next sentence shows he
   is not Dale Whitcomb. A model that reads the opening as the host passes every check 0.14.4 makes, and the stand-in gets
   the absent host's name. Lists of words would check identity support only for wording they hold, and would cut the
   inference paths that name people nobody introduces in full (a title, a calling and the listing; a guest the listing
   bills who answers the welcome). So every name the first answer and the app's checks settle is put to the model once
   more, all in one narrow request per reading: is this voice that person, or someone else? A name stands only when that
   reading says it is, quoting words of that voice's own turn, or a turn next to it, that are really there; any other
   answer, or none, keeps the number with why. These tests pin the A4 case on its own, through the whole reading and its
   exports; then the misread cases (the model making the app's own mistakes), the second reading's answers one by one,
   the inference paths, what is never asked, and saved records. Second readings here are scripted, or recorded from a
   stand-in model given each exact prompt blind; none is the production model's. Invented people and shows. */
const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../server/identify");
const { createMockAI } = require("../server/ai");
const { pad } = require("./fixtures/identify-pad");
const { APPLE_LINK, KEY, chainFetch, scriptedAI, server, fromLink, nameOf } = require("./fixtures/straight-talk");
const { HOST, PRIEST, LP } = require("./fixtures/identify-scenarios-3");
const { isConfirm } = require("./fixtures/confirm");
const MISREAD = require("./fixtures/identify-misread.json");
const CONFIRMED = require("./fixtures/identify-confirm.json");
const SETS = n => require("./fixtures/identify-scenarios" + (n === 1 ? "" : "-" + n));
const ANSWERS = n => require("./fixtures/identify-answers-" + n + ".json");

const END = " A name is given only where a second reading of the conversation confirms it, so this voice keeps its number.";
const DALE = "Dale Whitcomb";
const A4 = SETS(7).S.find(s => s.id === "A4");
const A4M = MISREAD.find(m => m.case === "7-A4-SPEAKER1-misread");
const ON_THE_DOOR = "The man whose name is on the door is at his daughter's wedding in Ohio this week, so I'm minding things until Monday.";
const A4_WHY = "A second reading says this voice is not Dale Whitcomb: “" + ON_THE_DOOR + "” (a stand-in minding the show while the man the show is named for is away)." + END;

/* ---------- the review's remaining case, on its own, through the whole reading and its exports ---------- */
/* Scenario A4 as the chain finds it (as in identify-words-0.14.4): an Apple link to "The Dale Whitcomb Show", its feed,
   and the recording as Deepgram hears it. The first answer is the stand-in model's misreading: SPEAKER 1 is Dale Whitcomb,
   by his real opening (hosts_show, turn 0, "Welcome to the Dale Whitcomb Show."); SPEAKER 2 unnamed. The second reading
   is that model's recorded answer to the exact second prompt. */
const FEED4 = "https://feeds.dalewhitcomb.test/rss", AUDIO4 = "https://cdn.dalewhitcomb.test/ep/union-hall.mp3";
const APPLE4 = { resultCount: 2, results: [
  { wrapperType: "track", kind: "podcast", collectionId: 4242, trackId: 4242, collectionName: A4.L.show, artistName: A4.L.showAuthor, feedUrl: FEED4 },
  { wrapperType: "podcastEpisode", kind: "podcast-episode", trackId: 5151, trackName: A4.L.episodeTitle, episodeGuid: "dws-union-1", episodeUrl: AUDIO4, releaseDate: "2026-10-01T22:00:00Z", feedUrl: FEED4, collectionName: A4.L.show, collectionId: 4242 }] };
const RSS4 = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title>${A4.L.show}</title><link>https://dalewhitcomb.test/</link><description>Talk radio from Gary.</description><itunes:author>${A4.L.showAuthor}</itunes:author>
<item><title>${A4.L.episodeTitle}</title><guid isPermaLink="false">dws-union-1</guid><pubDate>Wed, 01 Oct 2026 22:00:00 GMT</pubDate><itunes:duration>1800</itunes:duration>
  <enclosure url="${AUDIO4}" type="audio/mpeg" length="30000000"/><description></description></item>
</channel></rss>`;
const SAID4 = A4.lines.map(l => { const m = /^SPEAKER (\d+): ([\s\S]*)$/.exec(l); return [Number(m[1]) - 1, m[2]]; });
const fetch4 = () => chainFetch(SAID4, u => /itunes\.apple\.com\/lookup\?id=4242/.test(u) ? { body: APPLE4, type: "application/json" } : u === FEED4 ? { body: RSS4, type: "application/rss+xml" } : null);
const DG = { DEEPGRAM_API_KEY: KEY, TRANSCRIBE_PREFER: "cloud" };

test("the review's remaining case, on its own: the stand-in named as the absent host on his real opening passes every check of the first reading; the second reading says he is not Dale Whitcomb, and the reading and every export keep his number", async t => {
  assert.equal(A4M.answer.voices[0].evidence[0].quote, "Welcome to the Dale Whitcomb Show.", "the fixture is the real-quote misreading");
  const ai = scriptedAI({ identify: () => A4M.answer, confirm: () => A4M.confirm });
  const f = await server(t, { ai, fetch: fetch4(), env: DG });
  const b = await fromLink(f, APPLE_LINK);
  const id = b.run.provenance.identification;
  assert.equal(id.version, I.IDENTIFY_VERSION);
  // the first reading: one request, nothing to repair; the quoted words are real and in his own turn, and the name the
  // first reading settles is the absent host's (0.14.4 stopped here and gave it)
  assert.equal(ai.prompts.filter(p => p.startsWith("Who is each voice in this conversation?")).length, 1);
  assert.deepEqual(id.answerChecks, [{ attempt: 1, issues: [] }]);
  assert.ok(id.evidence.some(e => e.key === "SPEAKER 1" && /model/.test(e.source) && e.kind === "hosts_show" && e.name === DALE && e.ok), JSON.stringify(id.evidence));
  assert.deepEqual(id.confirmation.asked, [{ key: "SPEAKER 1", name: DALE }]);
  // the second reading: one request, about that name, with the listing and the conversation
  const second = ai.prompts.filter(isConfirm);
  assert.equal(second.length, 1);
  assert.match(second[0], /\nVOICES TO CHECK:\n- SPEAKER 1, given the name Dale Whitcomb[ :(]/);
  assert.ok(second[0].includes("\nLISTING\nShow: " + A4.L.show) && second[0].includes(ON_THE_DOOR));
  assert.deepEqual(id.confirmation.answers.map(a => [a.key, a.verdict, a.wordsReal, a.kept]), [["SPEAKER 1", "is_not", true, false]]);
  assert.equal(id.confirmation.calls.length, 1);
  // numbered, with why
  assert.deepEqual(id.decisions, []);
  assert.equal(nameOf(b, "SPEAKER 1"), "Speaker 1"); assert.equal(nameOf(b, "SPEAKER 2"), "Speaker 2");
  assert.equal(id.unnamed.find(u => u.key === "SPEAKER 1").why, A4_WHY);
  // the reading went on and finished, told the numbers
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  assert.ok(b.passages.length && b.passages.every(p => p.readingGate.status === "ready"), JSON.stringify(b.passages.map(p => p.readingGate)));
  const reading = ai.prompts.find(p => p.startsWith("Help a reader understand this passage accurately."));
  assert.match(reading, /- SPEAKER 1 \(Speaker 1\)/); assert.doesNotMatch(reading, /Dale Whitcomb \(|\(Dale Whitcomb\)/);
  // the card's speakers and every export
  const md = (await f.api("GET", "/api/runs/" + b.run.id + "/export.md?level=hs")).data;
  const ex = (await f.api("GET", "/api/runs/" + b.run.id + "/export.json")).data;
  const ob = (await f.api("GET", "/api/runs/" + b.run.id + "/obligations.json")).data;
  assert.ok(md.includes("- Speaker 1: Not identified. " + A4_WHY), md.split("\n").filter(l => /Speaker 1/.test(l)).join("\n"));
  assert.doesNotMatch(md, /Dale Whitcomb \(Speaker 1\)|^> Dale Whitcomb:|^_[^_\n]*Dale Whitcomb[^_\n]*_$/m);
  assert.ok(ex.claims.length && ex.claims.every(c => c.speaker !== DALE), JSON.stringify(ex.claims.map(c => [c.speakerKey, c.speaker])));
  assert.ok(ex.passages.every(p => p.speakerNames.every(n => n !== DALE) && p.quotes.every(q => q.speaker !== DALE)));
  assert.deepEqual(ex.run.speakers.filter(s => s.inText).map(s => [s.key, s.name, s.namedBy]), [["SPEAKER 1", "Speaker 1", "unnamed"], ["SPEAKER 2", "Speaker 2", "unnamed"]]);
  assert.ok(ob.obligations.every(o => o.speaker_name !== DALE));
});

/* ---------- the step, with a fake store and a scripted provider ---------- */
const BLANK = { show: "", showAuthor: "", showArtist: "", showPersons: [], channel: false, episodeTitle: "", description: "", episodeAuthor: "", episodePersons: [], runTitle: "", sourceLabel: "" };
const reply = (data, id) => ({ data: JSON.parse(JSON.stringify(data === undefined ? null : data)), text: JSON.stringify(data), model: "scripted", requestId: id, stopReason: "end_turn", usage: null });
/* first: the identification's answers, one per request (the last repeats); second: the second reading's, the same way.
   { fail: code } throws an error with that code, as the provider's client does for an answer it cannot read
   ("invalid_json", "truncated") or a request that fails ("upstream_error"). */
async function step(lines, L0, first, second, opts) {
  opts = opts || {};
  const L = Object.assign({}, BLANK, L0);
  const run = Object.assign({ id: "run_145", kind: "transcript", parseMode: "text", input: { sha256: "h" }, speakers: [], provenance: {}, title: L.runTitle, sourceLabel: L.sourceLabel,
    import: { showInfo: { name: L.show, author: L.showAuthor, artist: L.showArtist, persons: L.showPersons, channel: L.channel }, episodeInfo: { title: L.episodeTitle, description: L.description, author: L.episodeAuthor, persons: L.episodePersons } } }, opts.run || {});
  const store = { bundle: async () => ({ run, transcript: lines.join("\n"), attrSig: "a0-0" }), captureCallBasis: async () => ({}), recordCall: async () => {} };
  const prompts = [], checks = [];
  const pick = (list, n, p) => { const a = list[Math.min(n - 1, list.length - 1)], d = typeof a === "function" ? a(p) : a; if (d && d.fail) throw Object.assign(new Error("scripted " + d.fail), { code: d.fail }); return d; };
  const ai = { kind: opts.mock ? "mock" : "anthropic", model: "scripted", mock: !!opts.mock, async sample({ prompt }) {
    if (isConfirm(prompt)) { checks.push(prompt); return reply(pick(second, checks.length, prompt), "c" + checks.length); }
    prompts.push(prompt); return reply(pick(first, prompts.length, prompt), "r" + prompts.length);
  } };
  const out = await I.identifySpeakers({ ai, store, id: run.id });
  const name = k => (out.record.decisions.find(d => d.key === k) || {}).name || null;
  const why = k => (out.record.unnamed.find(u => u.key === k) || {}).why;
  return { out, record: out.record, prompts, checks, name, why };
}
const verdict = (label, v, turn, quote, why) => ({ label, verdict: v, turn, quote, why: why || "" });

test("the A4 case at the step: the name stands only where the second reading says it is, with words that are there; and the limit, where both readings are wrong", async () => {
  const run = second => step(A4.lines, A4.L, [A4M.answer], [second]);
  let r = await run(A4M.confirm);
  assert.equal(r.prompts.length, 1); assert.equal(r.checks.length, 1);
  assert.equal(r.name("SPEAKER 1"), null); assert.equal(r.why("SPEAKER 1"), A4_WHY);
  r = await run({ voices: [verdict("SPEAKER 1", "cannot_tell", 0, "", "he may be the host or someone sitting in")] });
  assert.equal(r.name("SPEAKER 1"), null);
  assert.equal(r.why("SPEAKER 1"), "A second reading could not tell whether this voice is Dale Whitcomb (he may be the host or someone sitting in)." + END);
  // "is", but the words it quotes are not his: invented, or another voice's turn that is not next to his
  r = await run({ voices: [verdict("SPEAKER 1", "is", 0, "I'm Dale Whitcomb, and this is my show.", "names himself")] });
  assert.equal(r.name("SPEAKER 1"), null);
  assert.equal(r.why("SPEAKER 1"), "A second reading says this voice is Dale Whitcomb, but the words it quoted are not where it says (turn 0, “I'm Dale Whitcomb, and this is my show.”: the quoted words are not in that turn)." + END);
  // the limit: when the second reading misreads him too, with his real opening, the name stands. Two readings of the same
  // model can share a mistake; nothing in the app tells this case from a host who opens his own show
  r = await run({ voices: [verdict("SPEAKER 1", "is", 0, "Welcome to the Dale Whitcomb Show.", "opens the show named for him")] });
  assert.equal(r.name("SPEAKER 1"), DALE);
  assert.deepEqual(r.record.decisions.find(d => d.key === "SPEAKER 1").confirmed, { turn: 0, quote: "Welcome to the Dale Whitcomb Show." });
});

/* ---------- the misread cases: the model making the app's own mistakes ---------- */
/* The 28 names the app's rules alone get wrong on the answered scenarios, each written into a model's answer that makes
   the same mistake with words that are there; the second reading is the stand-in model's recorded answer to the exact
   second prompt. 22 of them pass every check of 0.14.4 and would be given. */
test("the misread cases: of the 22 wrong names the first reading settles, 20 keep their number after the second reading; the 2 left are the right person under a wrong form of the name", async () => {
  assert.equal(MISREAD.length, 28);
  const settled = [], still = [], other = [];
  for (const m of MISREAD) {
    const sc = SETS(m.set).S.find(s => s.id === m.scenario);
    const r = await step(sc.lines, sc.L, [m.answer], [m.confirm || {}]);
    const asked = (r.record.confirmation || { asked: [] }).asked.some(a => a.key === m.voice && a.name === m.wrongName);
    // (the fixture's own note of what 0.14.4 did is checked against this version's first reading)
    assert.equal(asked, m.namedBy0144, m.case + ": the first reading " + (m.namedBy0144 ? "settles" : "does not settle") + " the wrong name");
    if (asked) settled.push(m.case);
    if (r.name(m.voice) === m.wrongName) still.push([m.case, m.wrongName, sc.expect[m.voice]]);
    // no other voice in these conversations named wrongly either
    for (const [k, e] of Object.entries(sc.expect)) { const got = r.name(k); if (k !== m.voice && got !== null && (typeof e === "string" ? got !== e : e === null ? true : e.not !== undefined ? got === e.not : !e.oneOf.includes(got))) other.push(m.case + " " + k + " → " + got); }
  }
  assert.equal(settled.length, 22);
  assert.deepEqual(still, [["8-R9-SPEAKER3-misread", "Odette", "Odette Lindqvist"], ["10-K10-SPEAKER2-misread", "Magdalena Robel", "Magdalena Wrobel"]],
    "the residue: a first name where the listing has the full one, and a caption's spelling of the right guest; the second reading checks who a voice is, not the form of the name");
  assert.deepEqual(other, []);
});

/* ---------- the second reading's answers, one by one ---------- */
const NIGHT = ["SPEAKER 1: Welcome to Night Desk. I'm Ana Ferreira." + pad(2) + " Joining me now, Dana Reyes. Dana, thanks for coming in.",
  "SPEAKER 2: Thanks for having me, Ana." + pad(2), "SPEAKER 1: What did the survey find?", "SPEAKER 2: Four hundred households answered it." + pad(2)];
const NIGHT_L = { show: "Night Desk", showAuthor: "Ironvale Media", episodeTitle: "Survey season — Dana Reyes" };
const ANA = { label: "SPEAKER 1", name: "Ana Ferreira", evidence: [{ kind: "self_identification", turn: 0, quote: "I'm Ana Ferreira." }] };
const DANA = { label: "SPEAKER 2", name: "Dana Reyes", evidence: [{ kind: "introduced", turn: 0, quote: "Joining me now, Dana Reyes." }] };
const GOOD = { voices: [ANA, DANA], unnamed: [] };
const ANA_IS = verdict("SPEAKER 1", "is", 0, "I'm Ana Ferreira.", "names herself");
const night = (second, opts) => step(NIGHT, NIGHT_L, [GOOD], Array.isArray(second) ? second : [second], opts);

test("the second reading's answers: “is” with words of the voice's own turn or the turn before it stands; any other answer, or none, keeps the number with why", async () => {
  // confirmed: own turn; the introduction in the turn just before it answers
  let r = await night({ voices: [ANA_IS, verdict("SPEAKER 2", "is", 0, "Joining me now, Dana Reyes.", "introduced just before she answers")] });
  assert.equal(r.prompts.length, 1); assert.equal(r.checks.length, 1);
  assert.equal(r.name("SPEAKER 1"), "Ana Ferreira"); assert.equal(r.name("SPEAKER 2"), "Dana Reyes");
  assert.match(r.checks[0], /\nVOICES TO CHECK:\n- SPEAKER 1, given the name Ana Ferreira: [^\n]+\n- SPEAKER 2, given the name Dana Reyes \(the listing's guest\): introduced by name just before speaking: “Joining me now, Dana Reyes\.”[^\n]*\n\nTURNS \(/);
  const d2 = r.record.decisions.find(d => d.key === "SPEAKER 2");
  assert.deepEqual(d2.confirmed, { turn: 0, quote: "Joining me now, Dana Reyes." }); assert.match(d2.how, /; a second reading confirms it: “Joining me now, Dana Reyes\.”$/);
  assert.equal(r.record.confirmation.mock, undefined);
  // each answer that does not confirm, for the guest (the host confirmed each time)
  const guest = async (entry, expected) => {
    const g = await night({ voices: [ANA_IS].concat(entry) });
    assert.equal(g.name("SPEAKER 1"), "Ana Ferreira"); assert.equal(g.name("SPEAKER 2"), null, JSON.stringify(entry));
    assert.equal(g.why("SPEAKER 2"), expected + END); assert.equal(g.checks.length, 1, "asked once: an answer that can be read is not asked for again");
    assert.deepEqual(g.out.speakers.map(s => [s.key, s.name]), [["SPEAKER 1", "Ana Ferreira"], ["SPEAKER 2", "Speaker 2"]]);
    return g;
  };
  await guest(verdict("SPEAKER 2", "is_not", 3, "Four hundred households answered it.", "a producer reading the results"),
    "A second reading says this voice is not Dana Reyes: “Four hundred households answered it.” (a producer reading the results).");
  await guest(verdict("SPEAKER 2", "is_not", 3, "I only produce the show.", "presented as the producer"),
    "A second reading says this voice is not Dana Reyes (presented as the producer). (The words it quoted are not in the conversation as quoted.)");
  await guest(verdict("SPEAKER 2", "cannot_tell", 1, "", "nobody says whether she is the guest"),
    "A second reading could not tell whether this voice is Dana Reyes (nobody says whether she is the guest).");
  await guest(verdict("SPEAKER 2", "is", 3, "I'm Dana Reyes, from the survey office.", "names herself"),
    "A second reading says this voice is Dana Reyes, but the words it quoted are not where it says (turn 3, “I'm Dana Reyes, from the survey office.”: the quoted words are not in that turn).");
  await guest(verdict("SPEAKER 2", "is", 9, "Four hundred households answered it.", ""),
    "A second reading says this voice is Dana Reyes, but the words it quoted are not where it says (turn 9, “Four hundred households answered it.”: no such turn).");
  await guest(verdict("SPEAKER 2", "is", 1, "", "answers the welcome"),
    "A second reading says this voice is Dana Reyes, but the words it quoted are not where it says (no words quoted).");
  await guest(verdict("SPEAKER 2", "probably", 1, "Thanks for having me, Ana.", ""),
    "A second reading, asked whether this voice is Dana Reyes, gave no usable answer (no verdict).");
  await guest([verdict("SPEAKER 2", "is", 1, "Thanks for having me, Ana."), verdict("SPEAKER 2", "is_not", 3, "Four hundred households answered it.")],
    "A second reading, asked whether this voice is Dana Reyes, gave no usable answer (it answered twice for this voice).");
  await guest([], "A second reading, asked whether this voice is Dana Reyes, gave no usable answer.");
  // "{}" and an answer that is not an object: every name keeps its number, asked once
  for (const bad of [{}, { voices: "both are who they seem" }, null, ["SPEAKER 1"]]) {
    r = await night(bad);
    assert.deepEqual(r.record.decisions, [], JSON.stringify(bad)); assert.equal(r.checks.length, 1);
    assert.equal(r.why("SPEAKER 1"), "A second reading, asked whether this voice is Ana Ferreira, gave no usable answer." + END);
  }
});

test("words that are real but belong to no turn of the voice or next to it, and words of a clip, do not confirm", async () => {
  // three voices: the second guest's turns sit between the host's, away from the first guest
  const lines = ["SPEAKER 1: Welcome to Night Desk. I'm Ana Ferreira." + pad(2) + " Joining me now, Dana Reyes. Dana, thanks for coming in.",
    "SPEAKER 2: Thanks for having me, Ana." + pad(2),
    "SPEAKER 1: And also with us, Ruth Oyelaran from the county office. Ruth, welcome.",
    "SPEAKER 3: Glad to be here." + pad(2),
    "SPEAKER 1: Ruth, what did the county see?",
    "SPEAKER 3: Fewer households than we hoped." + pad(2),
    "CLIP 1: I'm Dana Reyes, and I approve this survey.",
    "SPEAKER 1: Dana, does that match?",
    "SPEAKER 2: It does, mostly." + pad(2)];
  const RUTH = { label: "SPEAKER 3", name: "Ruth Oyelaran", evidence: [{ kind: "introduced", turn: 2, quote: "And also with us, Ruth Oyelaran from the county office." }] };
  const first = [{ voices: [ANA, DANA, RUTH], unnamed: [] }];
  const ok = [ANA_IS, verdict("SPEAKER 3", "is", 2, "Ruth, welcome.", "welcomed just before she answers")];
  let r = await step(lines, NIGHT_L, first, [{ voices: ok.concat(verdict("SPEAKER 2", "is", 5, "Fewer households than we hoped.", "")) }]);
  assert.equal(r.name("SPEAKER 3"), "Ruth Oyelaran"); assert.equal(r.name("SPEAKER 2"), null);
  assert.match(r.why("SPEAKER 2"), /^A second reading says this voice is Dana Reyes, but the words it quoted are not where it says \(turn 5, “Fewer households than we hoped\.”: that turn is neither this voice's nor next to it\)\./);
  r = await step(lines, NIGHT_L, first, [{ voices: ok.concat(verdict("SPEAKER 2", "is", 6, "I'm Dana Reyes, and I approve this survey.", "")) }]);
  assert.equal(r.name("SPEAKER 2"), null);
  assert.match(r.why("SPEAKER 2"), /: that turn is a clip, a quotation, an advertisement or a stretch whose speaker is not established\)\./);
  // the turn next to hers, past the clip, does
  r = await step(lines, NIGHT_L, first, [{ voices: ok.concat(verdict("SPEAKER 2", "is", 7, "Dana, does that match?", "spoken to just before she answers")) }]);
  assert.equal(r.name("SPEAKER 2"), "Dana Reyes");
});

test("an answer that cannot be read is asked for once more; twice unreadable keeps every number; a request that fails stops the step", async () => {
  const both = { voices: [ANA_IS, verdict("SPEAKER 2", "is", 1, "Thanks for having me, Ana.", "answers the welcome")] };
  let r = await night([{ fail: "invalid_json" }, both]);
  assert.equal(r.checks.length, 2); assert.match(r.checks[1], /\n\nYour previous answer could not be used: it was not well-formed JSON\. Reply with ONLY the JSON\.$/);
  assert.equal(r.name("SPEAKER 1"), "Ana Ferreira"); assert.equal(r.name("SPEAKER 2"), "Dana Reyes"); assert.equal(r.record.confirmation.calls.length, 2);
  r = await night([{ fail: "truncated" }, { fail: "invalid_json" }]);
  assert.equal(r.checks.length, 2); assert.match(r.checks[1], /it was cut off at its length limit; answer more briefly\./);
  assert.deepEqual(r.record.decisions, []);
  assert.equal(r.why("SPEAKER 2"), "A second reading, asked whether this voice is Dana Reyes, gave no usable answer." + END);
  await assert.rejects(night([{ fail: "upstream_error" }]), e => e.code === "upstream_error");
});

test("the mock provider: its stand-in confirmation is used only for a mock provider and is labelled; a real provider's answer of the same shape confirms nothing; the mock's own reading asks nothing", async () => {
  const mockSecond = { voices: [], mock: "confirm" };
  let r = await night(mockSecond, { mock: true });
  assert.equal(r.name("SPEAKER 1"), "Ana Ferreira"); assert.equal(r.name("SPEAKER 2"), "Dana Reyes");
  assert.equal(r.record.confirmation.mock, true); assert.deepEqual(r.record.decisions.map(d => d.confirmed), [{ mock: true }, { mock: true }]);
  assert.ok(r.record.decisions.every(d => /; MOCK: no second reading$/.test(d.how)));
  r = await night(mockSecond);
  assert.deepEqual(r.record.decisions, []); assert.equal(r.record.confirmation.mock, undefined);
  // the mock model's own reading (the app's rules stand in for a model, in tests and pictures): nothing to read again
  const L = Object.assign({}, BLANK, NIGHT_L), mock = createMockAI(), seen = [];
  const run = { id: "run_m", kind: "transcript", parseMode: "text", input: { sha256: "h" }, speakers: [], provenance: {}, title: "", sourceLabel: "", import: { showInfo: { name: L.show, author: L.showAuthor, persons: [] }, episodeInfo: { title: L.episodeTitle, description: "", persons: [] } } };
  const out = await I.identifySpeakers({ ai: Object.assign({}, mock, { async sample(a) { seen.push(a.prompt); return mock.sample(a); } }), store: { bundle: async () => ({ run, transcript: NIGHT.join("\n"), attrSig: "a" }), captureCallBasis: async () => ({}), recordCall: async () => {} }, id: run.id });
  assert.equal(out.record.mockReading, true); assert.equal(out.record.confirmation, undefined); assert.ok(!seen.some(isConfirm));
});

/* ---------- the inference paths ---------- */
test("names nobody says in full keep working through the second reading: the guest greeted by a title who speaks of his calling, and a guest the listing bills whom nobody names", async () => {
  // the priest's shape (a title the listing gives him, his calling, his answer to the welcome), invented words; the second
  // reading is told how the first settled each name and reads the listing itself
  const lines = ["SPEAKER 1: Father, thanks so much for coming in.", "SPEAKER 2: Uh, thanks for having me.", "SPEAKER 1: How did the churches here come to ignore all of this?",
    "SPEAKER 2: There is a historical reason." + pad(2) + " So in a place like that, as an exorcist, it honestly gives me a great deal of peace." + pad(1), "SPEAKER 1: How so?", "SPEAKER 2: They went their own way." + pad(2)];
  const first = { voices: [
    { label: "SPEAKER 1", name: HOST, evidence: [{ kind: "hosts_show", turn: 0, quote: "Father, thanks so much for coming in." }] },
    { label: "SPEAKER 2", name: "Fr. Tomas Varga", evidence: [{ kind: "addressed", turn: 0, quote: "Father, thanks so much for coming in." }, { kind: "self_reference", turn: 3, quote: "as an exorcist, it honestly gives me a great deal of peace", listingQuote: "Fr. Tomas Varga is a parish priest and exorcist" }] }], unnamed: [] };
  const second = { voices: [verdict("SPEAKER 1", "is", 0, "Father, thanks so much for coming in.", "the host welcomes the guest"), verdict("SPEAKER 2", "is", 0, "Father, thanks so much for coming in.", "the priest the listing names, welcomed as Father, answers and speaks as an exorcist")] };
  let r = await step(lines, LP, [first], [second]);
  assert.equal(r.name("SPEAKER 1"), HOST); assert.equal(r.name("SPEAKER 2"), PRIEST);
  assert.ok(r.checks[0].includes("\n- SPEAKER 2, given the name " + PRIEST + " (the listing's guest): "), r.checks[0].split("VOICES TO CHECK:")[1].slice(0, 600));
  assert.ok(r.checks[0].includes("\nLISTING\n") && r.checks[0].includes("exorcist"));
  // a guest nobody names aloud, billed by the notes, answering as the guest; the second reading is the stand-in model's
  // recorded answer to the exact prompt (it cannot tell who the host is: the listing gives only a company)
  const g8 = SETS(9).S.find(s => s.id === "G8");
  r = await step(g8.lines, g8.L, [ANSWERS(9).G8], [CONFIRMED["9-G8"]]);
  assert.equal(r.name("SPEAKER 2"), "Kwame Adjei-Lindgren"); assert.deepEqual(r.record.decisions.find(d => d.key === "SPEAKER 2").kinds, ["listing"]);
  assert.equal(r.name("SPEAKER 1"), null); assert.match(r.why("SPEAKER 1"), /^A second reading could not tell whether this voice is /);
});

/* ---------- what is never asked ---------- */
test("never asked: names a transcript or a person gave, and a name from the speakers pass; a name the second reading refuses does not come back from that pass", async () => {
  // a person's name: not asked; the other voice is
  const byPerson = { speakers: [{ key: "SPEAKER 1", name: "Ana F.", bio: "" }, { key: "SPEAKER 2", name: "Speaker 2", bio: "" }], provenance: { namesByPerson: { "SPEAKER 1": "Ana F." } } };
  let r = await step(NIGHT, NIGHT_L, [{ voices: [DANA], unnamed: [] }], [{ voices: [verdict("SPEAKER 2", "is", 0, "Joining me now, Dana Reyes.")] }], { run: byPerson });
  assert.deepEqual(r.record.confirmation.asked, [{ key: "SPEAKER 2", name: "Dana Reyes" }]);
  assert.deepEqual(r.out.speakers.map(s => [s.key, s.name]), [["SPEAKER 1", "Ana F."], ["SPEAKER 2", "Dana Reyes"]]);
  // a transcript that names its speakers: nothing to identify, no request at all
  r = await step(["Ana Ferreira: Welcome to Night Desk." + pad(2), "Dana Reyes: Thanks for having me." + pad(2)], NIGHT_L, [{}], [{}]);
  assert.equal(r.prompts.length, 0); assert.equal(r.checks.length, 0);
  // a name from the speakers pass (a model's reading of its own, reviewed by a second pass): not asked where it stands
  const structure = { speakers: [{ key: "SPEAKER 1", name: "Speaker 1", bio: "" }, { key: "SPEAKER 2", name: "Dana Reyes", bio: "" }],
    provenance: { structure: { names: [{ key: "SPEAKER 2", name: "Dana Reyes", kind: "introduced_by_name", quote: "Joining me now, Dana Reyes.", applied: true }] } } };
  r = await step(NIGHT, NIGHT_L, [{}, {}], [{}], { run: structure });
  assert.equal(r.checks.length, 0, "nothing settled by the answer and the checks: no second reading");
  assert.equal(r.name("SPEAKER 2"), "Dana Reyes"); assert.deepEqual(r.record.decisions.find(d => d.key === "SPEAKER 2").kinds, ["words"]);
  // the answer names the same person: that name is the answer's and is asked; refused, the pass's name does not return
  r = await step(NIGHT, NIGHT_L, [GOOD], [{ voices: [ANA_IS, verdict("SPEAKER 2", "is_not", 3, "Four hundred households answered it.", "a producer")] }], { run: structure });
  assert.deepEqual(r.record.confirmation.asked.map(a => a.key), ["SPEAKER 1", "SPEAKER 2"]);
  assert.equal(r.name("SPEAKER 2"), null); assert.match(r.why("SPEAKER 2"), /^A second reading says this voice is not Dana Reyes: /);
  assert.deepEqual(r.out.speakers.map(s => [s.key, s.name]), [["SPEAKER 1", "Ana Ferreira"], ["SPEAKER 2", "Speaker 2"]]);
});

/* ---------- saved records ---------- */
test("a saved identification from 0.14.4 or before whose names no second reading confirmed is identified again, once; this version's record is not", () => {
  const run = (id, speakers) => ({ kind: "transcript", parseMode: "text", input: { sha256: "h1" }, speakers: speakers || [{ key: "SPEAKER 1", name: "Ana Ferreira" }, { key: "SPEAKER 2", name: "Speaker 2" }], provenance: { overrides: {}, identification: id } });
  const b = r => ({ run: r, transcript: "SPEAKER 1: Hello there, friends.\nSPEAKER 2: Hello to you.", attrSig: "a1" });
  const held = [{ key: "SPEAKER 1", source: "app+model", kind: "self_identification", ok: true }];
  const base = { inputHash: "h1", attrSig: "a1", version: 4, decisions: [{ key: "SPEAKER 1", name: "Ana Ferreira", kinds: ["self_identification"] }], unnamed: [{ key: "SPEAKER 2", why: "x" }], evidence: held };
  assert.equal(I.needsIdentification(b(run(base))), true, "0.14.4: the model's own words held up, but no second reading confirmed the name");
  assert.equal(I.needsIdentification(b(run(Object.assign({}, base, { decisions: [{ key: "SPEAKER 1", name: "Ana Ferreira", kinds: ["listing"] }] })))), true, "a listing's pairing is asked about too");
  assert.equal(I.needsIdentification(b(run(Object.assign({}, base, { decisions: [{ key: "SPEAKER 1", name: "Ana Ferreira", kinds: ["words"] }] })))), false, "a name from the speakers pass is not asked about");
  assert.equal(I.needsIdentification(b(run(Object.assign({}, base, { decisions: [], unnamed: [{ key: "SPEAKER 1", why: "x" }, { key: "SPEAKER 2", why: "x" }], evidence: [] }), [{ key: "SPEAKER 1", name: "Speaker 1" }, { key: "SPEAKER 2", name: "Speaker 2" }]))), false, "numbers stay numbers");
  const now = Object.assign({}, base, { version: I.IDENTIFY_VERSION, decisions: [{ key: "SPEAKER 1", name: "Ana Ferreira", kinds: ["self_identification"], confirmed: { turn: 0, quote: "I'm Ana Ferreira." } }] });
  assert.equal(I.needsIdentification(b(run(now))), false);
  assert.equal(I.needsIdentification(b(run(Object.assign({}, now, { decisions: [{ key: "SPEAKER 1", name: "Ana Ferreira", kinds: ["self_identification"], confirmed: { mock: true } }] })))), false, "once per text and labels, whatever it decided");
  assert.equal(I.IDENTIFY_VERSION, 5);
});
