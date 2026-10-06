"use strict";
/* 0.14.4: a named decision of the model's is accepted only with words of its own that are real. A review of 0.14.3 found
   that the answer check asked only whether a quotation was given, not whether it exists: with the regular host away (set
   seven's A4), the model named the stand-in "Dale Whitcomb" with an invented quotation ("I'm Dale Whitcomb."); the app
   recorded that the quoted words are not in that turn, and then named the stand-in anyway, because its own reading (the
   voice opens the show the listing names after Dale Whitcomb) agreed. The reading finished with the wrong name on the card
   and in the exported claims, and no second request was made. Now a named decision needs at least one of the model's own
   clues to pass the source and turn checks every clue starts with (the quotation in the turn it names; that turn where the
   kind of clue needs it); one that has none is asked about once more, and still without one the voice keeps its number
   with why. No clue of the app's carries a decision whose own words fail: a decision stands on the model's own clues that
   hold up, and the app's reading settles a first name alone or the one voice left only where one does. The listing's
   pairing of a guest nobody names aloud (a title, a calling, the guest's answer to the welcome) keeps working. Invented
   people and shows; no real transcript. */
const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../server/identify");
const { pad } = require("./fixtures/identify-pad");
const { APPLE_LINK, KEY, chainFetch, scriptedAI, server, fromLink, nameOf } = require("./fixtures/straight-talk");
const set7 = require("./fixtures/identify-scenarios-7"), set9 = require("./fixtures/identify-scenarios-9");
const answers9 = require("./fixtures/identify-answers-9.json");
const { HOST, PRIEST, LP } = require("./fixtures/identify-scenarios-3");

const KEEPS = ". It keeps its number; the app does not name a voice on its own reading alone.";
const twice = problem => "Asked twice, the model gave no usable decision for this voice: " + problem + KEEPS;
const DALE = "Dale Whitcomb";
const A4 = set7.S.find(s => s.id === "A4");
const INVENTED = { voices: [{ label: "SPEAKER 1", name: DALE, evidence: [{ kind: "self_identification", turn: 0, quote: "I'm Dale Whitcomb." }] }],
  unnamed: [{ label: "SPEAKER 2", why: "a guest the host describes but never names" }] };

/* ---------- the review's case, through the whole reading and its exports ---------- */
/* Scenario A4 as the chain finds it: an Apple link to "The Dale Whitcomb Show" (published by the Dale Whitcomb Network),
   its feed, and the recording as Deepgram hears it, the stand-in opening the show while the man whose name is on the door
   is at his daughter's wedding. */
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

test("the review's case: the stand-in named as the absent host on an invented quotation is asked about once more, keeps its number with why, and the reading and its exports never give it his name", async t => {
  const ai = scriptedAI({ identify: () => INVENTED });
  const f = await server(t, { ai, fetch: fetch4(), env: DG });
  const b = await fromLink(f, APPLE_LINK);
  // the app's own reading of this very run names the stand-in as the host: the clue 0.14.3 let carry the model's decision
  // (if that reading ever stops doing so, choose wording it still gets wrong: the point is that it carries nothing)
  const alone = await I.appReading({ store: f.store, id: b.run.id });
  assert.equal((alone.record.decisions.find(d => d.key === "SPEAKER 1") || {}).name, DALE, "precondition: the app's reading alone names the stand-in");
  // two requests; the second tells the model exactly what did not hold up
  const asked = ai.prompts.filter(p => p.startsWith("Who is each voice in this conversation?"));
  assert.equal(asked.length, 2);
  assert.ok(asked[1].includes("\n- It named SPEAKER 1 (Dale Whitcomb), but none of the words it quoted for that is where it says: turn 0, “I'm Dale Whitcomb.”: the quoted words are not in that turn. Quote the exact words, from the turn they are in, that show who this voice is, or leave it unnamed.\n"), asked[1].slice(asked[0].length));
  const id = b.run.provenance.identification;
  assert.equal(id.version, 4);
  assert.deepEqual(id.answerChecks.map(c => c.attempt), [1, 2]);
  assert.equal(nameOf(b, "SPEAKER 1"), "Speaker 1"); assert.equal(nameOf(b, "SPEAKER 2"), "Speaker 2");
  assert.deepEqual(id.decisions, []);
  const why1 = twice("its answer named this voice Dale Whitcomb, but none of the words it quoted for that is where it says (turn 0, “I'm Dale Whitcomb.”: the quoted words are not in that turn)");
  assert.equal(id.unnamed.find(u => u.key === "SPEAKER 1").why, why1);
  // the record keeps the model's clue and why it did not hold up, beside the app's own clue that is not used
  assert.ok(id.evidence.some(e => e.key === "SPEAKER 1" && e.source === "model" && e.kind === "self_identification" && !e.ok && e.why === "the quoted words are not in that turn"), JSON.stringify(id.evidence));
  assert.ok(id.evidence.some(e => e.key === "SPEAKER 1" && e.source === "app" && e.kind === "hosts_show" && e.name === DALE && e.ok));
  // the reading went on and finished, told the numbers
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  assert.ok(b.passages.length && b.passages.every(p => p.readingGate.status === "ready"), JSON.stringify(b.passages.map(p => p.readingGate)));
  const reading = ai.prompts.find(p => p.startsWith("Help a reader understand this passage accurately."));
  assert.match(reading, /- SPEAKER 1 \(Speaker 1\)/); assert.doesNotMatch(reading, /- SPEAKER 1 \(Dale Whitcomb\)/);
  // the card's speakers and every export
  const md = (await f.api("GET", "/api/runs/" + b.run.id + "/export.md?level=hs")).data;
  const ex = (await f.api("GET", "/api/runs/" + b.run.id + "/export.json")).data;
  const ob = (await f.api("GET", "/api/runs/" + b.run.id + "/obligations.json")).data;
  assert.ok(md.includes("- Speaker 1: Not identified. " + why1), md.split("\n").filter(l => /Speaker 1/.test(l)).join("\n"));
  assert.doesNotMatch(md, /Dale Whitcomb \(Speaker 1\)|^> Dale Whitcomb:|^_[^_\n]*Dale Whitcomb[^_\n]*_$/m);
  assert.ok(ex.claims.every(c => c.speaker !== DALE), JSON.stringify(ex.claims.map(c => [c.speakerKey, c.speaker])));
  assert.ok(ex.passages.every(p => p.speakerNames.every(n => n !== DALE) && p.quotes.every(q => q.speaker !== DALE)));
  assert.ok(ex.passages.some(p => p.speakerNames.includes("Speaker 1")));
  assert.deepEqual(ex.run.speakers.filter(s => s.inText).map(s => [s.key, s.name, s.namedBy]), [["SPEAKER 1", "Speaker 1", "unnamed"], ["SPEAKER 2", "Speaker 2", "unnamed"]]);
  assert.ok(ob.obligations.every(o => o.speaker_name !== DALE));
});

/* ---------- the step, with a fake store and a scripted provider ---------- */
async function step(lines, L, answers) {
  const run = { id: "run_144", kind: "transcript", parseMode: "text", input: { sha256: "h" }, speakers: [], provenance: {}, title: "", sourceLabel: "",
    import: { showInfo: { name: L.show || "", author: L.showAuthor || "", artist: L.showArtist || "", persons: L.showPersons || [] }, episodeInfo: { title: L.episodeTitle || "", description: L.description || "", persons: L.episodePersons || [] } } };
  const store = { bundle: async () => ({ run, transcript: lines.join("\n"), attrSig: "a0-0" }), captureCallBasis: async () => ({}), recordCall: async () => {} };
  const prompts = [];
  const ai = { kind: "anthropic", model: "scripted", mock: false, async sample({ prompt }) { prompts.push(prompt); const a = answers[Math.min(prompts.length - 1, answers.length - 1)]; const data = typeof a === "function" ? a(prompt) : a; return { data: JSON.parse(JSON.stringify(data)), text: JSON.stringify(data), model: "scripted", requestId: "r", stopReason: "end_turn", usage: null }; } };
  const out = await I.identifySpeakers({ ai, store, id: run.id });
  return { record: out.record, prompts, name: k => (out.record.decisions.find(d => d.key === k) || {}).name || null, why: k => (out.record.unnamed.find(u => u.key === k) || {}).why };
}

test("the review's case at the step: asked once more; an answer that then leaves the stand-in unnamed is used, and the app's reading of him is held back with why", async () => {
  let r = await step(A4.lines, A4.L, [INVENTED]);
  assert.equal(r.prompts.length, 2); assert.equal(r.name("SPEAKER 1"), null);
  assert.equal(r.why("SPEAKER 1"), twice("its answer named this voice Dale Whitcomb, but none of the words it quoted for that is where it says (turn 0, “I'm Dale Whitcomb.”: the quoted words are not in that turn)"));
  r = await step(A4.lines, A4.L, [INVENTED, { voices: [], unnamed: [{ label: "SPEAKER 1", why: "sitting in while the host is at a wedding" }, { label: "SPEAKER 2", why: "a guest the host never names" }] }]);
  assert.equal(r.prompts.length, 2); assert.equal(r.name("SPEAKER 1"), null);
  assert.match(r.why("SPEAKER 1"), /^The app's reading points to Dale Whitcomb, but the model's reading of the conversation does not name Dale Whitcomb for this voice \(sitting in while the host is at a wedding\)/);
  assert.deepEqual(r.record.answerChecks.map(c => c.issues.length), [1, 0]);
});

test("words that are real but show no such thing: the decision is taken, does not stand, and the app's reading of the same person does not carry it, by its own clue or as the one voice left", async () => {
  // the stand-in's own words, which name no one; no other voice settled: the app's opening clue is not used
  const empty = (kind, extra) => ({ label: "SPEAKER 1", name: DALE, evidence: [Object.assign({ kind, turn: 0, quote: "so I'm minding things until Monday" }, extra || {})] });
  let r = await step(A4.lines, A4.L, [{ voices: [empty("self_identification")], unnamed: [{ label: "SPEAKER 2", why: "never named" }] }]);
  assert.equal(r.prompts.length, 1, "the words are where the answer says: nothing to ask again");
  assert.equal(r.name("SPEAKER 1"), null);
  assert.match(r.why("SPEAKER 1"), /^The model's answer names Dale Whitcomb for this voice, but its clue did not hold up: “so I'm minding things until Monday” \(the quoted words do not name this person[^)]*\); the app's reading points to Dale Whitcomb too, but the app does not name a voice on its own reading alone\.$/);
  // the guest introduced by name and named; the stand-in is then the one main voice left, and the listing's host the one
  // participant not placed: elimination needs a clue of the model's own that holds up, and there is none
  const lines = ["SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " The man whose name is on the door is at his daughter's wedding in Ohio this week, so I'm minding things until Monday. My guest tonight is Rosa Kim, who runs the union hall in Gary. Thanks for coming in.",
    "SPEAKER 2: Thanks for having me." + pad(2), "SPEAKER 1: How many members are left?", "SPEAKER 2: About four hundred." + pad(2)];
  const rosa = { label: "SPEAKER 2", name: "Rosa Kim", evidence: [{ kind: "introduced", turn: 0, quote: "My guest tonight is Rosa Kim" }] };
  for (const ev of [empty("self_identification"), empty("self_reference", { listingQuote: "" })]) {
    r = await step(lines, A4.L, [{ voices: [ev, rosa], unnamed: [] }]);
    assert.equal(r.prompts.length, 1); assert.equal(r.name("SPEAKER 2"), "Rosa Kim");
    assert.equal(r.name("SPEAKER 1"), null, ev.evidence[0].kind);
    assert.match(r.why("SPEAKER 1"), /^The model's answer names Dale Whitcomb for this voice, but its clue did not hold up: “so I'm minding things until Monday” \(/);
  }
  // the app's reading alone would name the stand-in in both
  const app = await I.appReading({ store: { bundle: async () => ({ run: { id: "x", kind: "transcript", parseMode: "text", input: { sha256: "h" }, speakers: [], provenance: {}, import: { showInfo: { name: A4.L.show, author: A4.L.showAuthor, persons: [] }, episodeInfo: { title: A4.L.episodeTitle, description: "", persons: [] } } }, transcript: lines.join("\n"), attrSig: "a" }), captureCallBasis: async () => ({}), recordCall: async () => {} }, id: "x" });
  assert.equal((app.record.decisions.find(d => d.key === "SPEAKER 1") || {}).name, DALE);
});

test("one invented clue beside a real one: the decision has words of its own and stands on the real one; an invented host's opening is refused like any other", async () => {
  const lines = ["SPEAKER 1: Welcome to Night Desk. I'm Ana Ferreira." + pad(2) + " Joining me now, Dana Reyes. Dana, thanks for coming in.",
    "SPEAKER 2: Thanks for having me, Ana." + pad(2), "SPEAKER 1: What did the survey find?", "SPEAKER 2: Four hundred households answered it." + pad(2)];
  const L = { show: "Night Desk", showAuthor: "Ana Ferreira", episodeTitle: "Survey season — Dana Reyes" };
  const ana = { label: "SPEAKER 1", name: "Ana Ferreira", evidence: [{ kind: "self_identification", turn: 0, quote: "I'm Ana Ferreira." }] };
  let r = await step(lines, L, [{ voices: [ana, { label: "SPEAKER 2", name: "Dana Reyes", evidence: [{ kind: "introduced", turn: 0, quote: "Please give a warm welcome to Dana Reyes" }, { kind: "introduced", turn: 0, quote: "Joining me now, Dana Reyes." }] }], unnamed: [] }]);
  assert.equal(r.prompts.length, 1); assert.equal(r.name("SPEAKER 1"), "Ana Ferreira"); assert.equal(r.name("SPEAKER 2"), "Dana Reyes");
  // the host's opening invented: the listing names the host and this voice opens the show, but the words quoted are not
  // its words; asked once more, then numbered with why (the app's own clue for the host is not used)
  r = await step(lines, L, [{ voices: [{ label: "SPEAKER 1", name: "Ana Ferreira", evidence: [{ kind: "hosts_show", turn: 0, quote: "Good evening, and welcome to the program." }] }, { label: "SPEAKER 2", name: "Dana Reyes", evidence: [{ kind: "introduced", turn: 0, quote: "Joining me now, Dana Reyes." }] }], unnamed: [] }]);
  assert.equal(r.prompts.length, 2); assert.equal(r.name("SPEAKER 1"), null); assert.equal(r.name("SPEAKER 2"), "Dana Reyes");
  assert.equal(r.why("SPEAKER 1"), twice("its answer named this voice Ana Ferreira, but none of the words it quoted for that is where it says (turn 0, “Good evening, and welcome to the program.”: the quoted words are not in that turn)"));
  assert.ok(r.record.evidence.some(e => e.key === "SPEAKER 1" && e.source === "model" && e.kind === "hosts_show" && !e.ok && e.why === "the quoted words are not in that turn"));
  // real words in the wrong place: another voice's turn for a voice naming itself, a voice's own turn for its introduction
  // (the guest is billed by the episode's title, so an accepted decision would be paired: these are not accepted)
  r = await step(lines, L, [{ voices: [ana, { label: "SPEAKER 2", name: "Dana Reyes", evidence: [{ kind: "self_identification", turn: 0, quote: "I'm Ana Ferreira." }] }], unnamed: [] }]);
  assert.equal(r.prompts.length, 2); assert.equal(r.name("SPEAKER 2"), null); assert.match(r.why("SPEAKER 2"), /\(turn 0, “I'm Ana Ferreira\.”: that turn is another voice's\)/);
  r = await step(lines, L, [{ voices: [ana, { label: "SPEAKER 2", name: "Dana Reyes", evidence: [{ kind: "introduced", turn: 1, quote: "Thanks for having me, Ana." }] }], unnamed: [] }]);
  assert.equal(r.prompts.length, 2); assert.equal(r.name("SPEAKER 2"), null); assert.match(r.why("SPEAKER 2"), /\(turn 1, “Thanks for having me, Ana\.”: a voice cannot introduce itself\)/);
  // real words where they belong that do not show the name (the host's question just before the guest answers): taken,
  // and the guest the episode's title bills is paired, as a guest nobody names is
  r = await step(lines, L, [{ voices: [ana, { label: "SPEAKER 2", name: "Dana Reyes", evidence: [{ kind: "introduced", turn: 2, quote: "What did the survey find?" }] }], unnamed: [] }]);
  assert.equal(r.prompts.length, 1); assert.equal(r.name("SPEAKER 2"), "Dana Reyes");
});

test("names nobody says in full keep working: the guest greeted by a title who speaks of their calling, and a guest the listing bills whom nobody names, with words of their own that are real", async () => {
  // the priest's shape (a title the listing gives him, his calling, his answer to the welcome), invented words
  const lines = ["SPEAKER 1: Father, thanks so much for coming in.", "SPEAKER 2: Uh, thanks for having me.", "SPEAKER 1: How did the churches here come to ignore all of this?",
    "SPEAKER 2: There is a historical reason." + pad(2) + " So in a place like that, as an exorcist, it honestly gives me a great deal of peace." + pad(1), "SPEAKER 1: How so?", "SPEAKER 2: They went their own way." + pad(2)];
  let r = await step(lines, LP, [{ voices: [
    { label: "SPEAKER 1", name: HOST, evidence: [{ kind: "hosts_show", turn: 0, quote: "Father, thanks so much for coming in." }] },
    { label: "SPEAKER 2", name: "Fr. Tomas Varga", evidence: [{ kind: "addressed", turn: 0, quote: "Father, thanks so much for coming in." }, { kind: "self_reference", turn: 3, quote: "as an exorcist, it honestly gives me a great deal of peace", listingQuote: "Fr. Tomas Varga is a parish priest and exorcist" }] }], unnamed: [] }]);
  assert.equal(r.prompts.length, 1); assert.equal(r.name("SPEAKER 1"), HOST); assert.equal(r.name("SPEAKER 2"), PRIEST);
  // a guest nobody names aloud, billed by the notes, answering as the guest: the stand-in model's answer quotes the guest's
  // own words, which are real but do not hold up as a clue (a story the notes tell is a topic, not who the speaker is);
  // the listing and both readers agree, as in 0.14.2
  const g8 = set9.S.find(s => s.id === "G8");
  r = await step(g8.lines, g8.L, [answers9.G8]);
  assert.equal(r.prompts.length, 1);
  assert.equal(r.name("SPEAKER 2"), "Kwame Adjei-Lindgren"); assert.deepEqual(r.record.decisions.find(d => d.key === "SPEAKER 2").kinds, ["listing"]);
  assert.ok(r.record.evidence.filter(e => e.key === "SPEAKER 2" && e.source === "model").every(e => !e.ok), "its clues do not hold up; its words are real");
});

test("a saved identification from 0.14.3 whose name was carried by the app's reading past the model's failed words is identified again; one the model's own clue held up, or one left numbered, is not", () => {
  const run = (id, speakers) => ({ kind: "transcript", parseMode: "text", input: { sha256: "h1" }, speakers: speakers || [{ key: "SPEAKER 1", name: DALE }, { key: "SPEAKER 2", name: "Speaker 2" }], provenance: { overrides: {}, identification: id } });
  const b = r => ({ run: r, transcript: "SPEAKER 1: Hello there, friends.\nSPEAKER 2: Hello to you.", attrSig: "a1" });
  const base = { inputHash: "h1", attrSig: "a1", version: 3, decisions: [{ key: "SPEAKER 1", name: DALE, kinds: ["hosts_show"] }], unnamed: [{ key: "SPEAKER 2", why: "x" }] };
  assert.equal(I.needsIdentification(b(run(Object.assign({}, base, { evidence: [{ key: "SPEAKER 1", source: "model", kind: "self_identification", ok: false }, { key: "SPEAKER 1", source: "app", kind: "hosts_show", ok: true }] })))), true, "the model's words failed; the app's clue carried the name");
  assert.equal(I.needsIdentification(b(run(Object.assign({}, base, { evidence: [{ key: "SPEAKER 1", source: "app+model", kind: "hosts_show", ok: true }] })))), false, "the model's own clue held up");
  assert.equal(I.needsIdentification(b(run(Object.assign({}, base, { decisions: [], unnamed: [{ key: "SPEAKER 1", why: "x" }, { key: "SPEAKER 2", why: "x" }], evidence: [] }), [{ key: "SPEAKER 1", name: "Speaker 1" }, { key: "SPEAKER 2", name: "Speaker 2" }]))), false, "a voice 0.14.3 left numbered stays so");
  assert.equal(I.needsIdentification(b(run(Object.assign({}, base, { version: I.IDENTIFY_VERSION, evidence: [{ key: "SPEAKER 1", source: "app", ok: true }] })))), false, "this version's record: once per text and labels");
  assert.equal(I.IDENTIFY_VERSION, 4);
});
