"use strict";
/* 0.14: automatic speaker identification is part of preparing a reading. A link or an upload becomes a reading that
   says who said what, without the reader naming anyone first: names a transcript supplies are kept; numbered voices
   (from Deepgram, from voices lined up with a text, from the words) are connected to names from introductions,
   self-identification, the episode's listing and the conversation, all checked against the words; clips, quotations
   and advertisements are kept apart; a voice nothing names keeps its number with the reason under Evidence. The end-to-
   end tests run the real transcript chain (Apple link → feed → Deepgram, by recorded-shape answers) and the real page.
   Invented people and an invented show throughout; no song lyrics, no real transcript. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const shared = require("../shared/transcript");
const P = require("../shared/prompts");
const Q = require("../server/quality");
const I = require("../server/identify");
const S = require("../server/structure");
const { page, visible } = require("./page-harness");

/* the invented show, as the chain finds it, and the helpers the 0.14 tests share (test/fixtures/straight-talk.js) */
const { SHOW, HOST, GUEST, EPISODE, AUDIO, APPLE_LINK, FEED, SAID, DEEPGRAM, KEY, chainFetch, noYtdlp, scriptedAI, server, fromLink, nameOf, assertNamed } = require("./fixtures/straight-talk");

/* ---------- the listing ---------- */
test("the listing: the show's name, its author or Apple's artist, podcast:person, the episode's title and notes name the people who may speak", () => {
  const L = I.listingOf({ title: "", import: { showInfo: { name: SHOW, author: "The Straight Talk Network", artist: HOST, persons: [] }, episodeInfo: { title: EPISODE, description: "Tonight we talk with Jane Holloway about the budget.", persons: [{ name: "Ruth Okonkwo", role: "guest", group: "cast" }] } } });
  const c = I.listingCandidates(L), by = n => c.find(x => x.name === n);
  assert.deepEqual(by(HOST), { name: HOST, role: "host", from: ["the show's name", "Apple's listing of the show"], structured: true }, "a possessive show name and Apple's artist; curly apostrophes and all");
  assert.equal(by(GUEST).role, "guest"); assert.equal(by(GUEST).structured, false, "a title is a guess, not a field that names people");
  assert.equal(by("Jane Holloway").from[0], "the episode's notes");
  assert.equal(by("Ruth Okonkwo").structured, true);
  assert.ok(!c.some(x => /Network/.test(x.name)), "an author that is a company is not a person");
  // titles: a colon, a dash, two guests, a numbered episode, a bracket
  const t = title => I.listingCandidates(I.listingOf({ title, import: {} })).map(x => x.name);
  assert.deepEqual(t("Marcus Delacroix: The Trade War Is Just Beginning"), [GUEST]);
  assert.deepEqual(t("#2201 - Marcus Delacroix"), [GUEST]);
  assert.deepEqual(t("Tariffs — Marcus Delacroix and Jane Holloway"), [GUEST, "Jane Holloway"]);
  assert.deepEqual(t("Why steel matters (with Marcus Delacroix)"), [GUEST]);
  assert.deepEqual(t("Marcus Delacroix on tariffs, trade and the Senate"), [GUEST]);
  // a video's channel may be a person, a show or an outlet: a candidate, never a host the app decides on
  const v = I.listingCandidates(I.listingOf({ title: "", import: { showInfo: { name: "Walt Brannigan", channel: true } } }));
  assert.deepEqual(v.map(x => [x.name, x.role, x.structured]), [[HOST, "", false]]);
});

/* ---------- the clues and how they are resolved ---------- */
function identify(lines, listing) {
  const sp = I.speakingTurns(shared.parseTranscript(lines.join("\n"), { mode: "text" }), {});
  const L = Object.assign(I.listingOf({ title: "", import: {} }), listing || {});
  const cands = I.listingCandidates(L), ev = I.findEvidence(sp, cands);
  for (const f of ev.found) if (!cands.some(c => c.name === f.name)) cands.push(f);
  const stats = I.voiceStats(sp), keys = new Set(stats.keys());
  const ctx = { sp, stats, keys, nameableKeys: new Set([...keys].filter(I.nameable)), fixed: new Map(), fixedKeys: new Set(), cands, listing: L, listingText: I.listingText(L), indexOfTurn: new Map(sp.map((x, k) => [x.i, k])), present: ev.present };
  const checked = ev.evidence.map(x => I.checkClue(x, ctx)), res = I.resolveNames(checked, ctx);
  return { names: Object.fromEntries([...keys].map(k => [k, res.assigned.has(k) ? res.assigned.get(k).name : null])), res, ctx, checked };
}
const pad = n => " The committee met again on Tuesday and the vote was delayed until the spring session because the numbers were not there yet.".repeat(n);
const LISTED = { show: SHOW, showAuthor: HOST, episodeTitle: EPISODE };
test("clues resolved together: a host the listing names who opens the show; a guest introduced by first name only; a guest-first cold open", () => {
  let r = identify(["SPEAKER 1: Welcome to the Straight Talk Hour." + pad(3) + " Joining us now, Marcus Delacroix.", "SPEAKER 2: Good to be here." + pad(3), "SPEAKER 1: What about steel?" + pad(1), "SPEAKER 2: It worked." + pad(3)], LISTED);
  assert.deepEqual(r.names, { "SPEAKER 1": HOST, "SPEAKER 2": GUEST });
  assert.deepEqual(r.res.assigned.get("SPEAKER 1").kinds, ["hosts_show"]);
  r = identify(["SPEAKER 1: Welcome to the Straight Talk Hour. My guest tonight is Marcus." + pad(2), "SPEAKER 2: Thanks, it is good to be here." + pad(3), "SPEAKER 1: Right." + pad(2), "SPEAKER 2: Yes." + pad(3)], LISTED);
  assert.deepEqual(r.names, { "SPEAKER 1": HOST, "SPEAKER 2": GUEST }, "“Marcus” completed from the episode's title, the one listed Marcus");
  const intro = r.res.assigned.get("SPEAKER 2").items.find(i => i.kind === "introduced");
  assert.equal(intro.name, GUEST); assert.match(intro.quote, /My guest tonight is Marcus\./);
  r = identify(["SPEAKER 1: The tariffs worked and the critics will never admit it." + pad(1), "SPEAKER 2: Welcome to the Straight Talk Hour. My guest tonight is Marcus Delacroix." + pad(2), "SPEAKER 1: Thanks for having me, Walt." + pad(3), "SPEAKER 2: Marcus, what about steel?" + pad(1), "SPEAKER 1: It worked." + pad(3)], LISTED);
  assert.deepEqual(r.names, { "SPEAKER 1": GUEST, "SPEAKER 2": HOST }, "the voice that speaks first is not taken for the host when it neither opens the show nor introduces anyone");
});
test("clues resolved together: an announcer naming the host, a teaser before an advertisement, a slip at a turn's edge, two guests, HOST and GUEST labels", () => {
  let r = identify(["SPEAKER 1: From the studios in New York, this is the Straight Talk Hour with Walt Brannigan.", "SPEAKER 2: Good evening and welcome to the Straight Talk Hour." + pad(3) + " Joining us now, Marcus Delacroix.", "SPEAKER 3: Thanks for having me, Walt." + pad(3), "SPEAKER 2: Marcus, what about steel?" + pad(1), "SPEAKER 3: It worked." + pad(4)], LISTED);
  assert.deepEqual(r.names, { "SPEAKER 1": null, "SPEAKER 2": HOST, "SPEAKER 3": GUEST }, "an opening that speaks of the host is not the host's");
  r = identify(["SPEAKER 1: Hi, I'm Walt Brannigan." + pad(3) + " Later in the hour, joining us will be Marcus Delacroix.", "SPEAKER 3: This hour is brought to you by Comfy Pillow. Go to comfypillow.com.", "SPEAKER 1: And we're back." + pad(3) + " Joining us now, Marcus Delacroix.", "SPEAKER 2: Thank you." + pad(4), "SPEAKER 1: Marcus, what about steel?" + pad(1), "SPEAKER 2: It worked." + pad(4)], LISTED);
  assert.equal(r.names["SPEAKER 2"], GUEST); assert.equal(r.names["SPEAKER 3"], null, "a teaser introduces no one, so the voice after it is not named by it");
  assert.ok(!r.checked.some(x => x.key === "SPEAKER 3" && x.ok), JSON.stringify(r.checked.filter(x => x.key === "SPEAKER 3")));
  r = identify(["SPEAKER 1: Hi, I'm Walt Brannigan." + pad(2) + " Joining us now, Marcus Delacroix. Marcus, thanks for coming on. Thanks for having me, Walt.", "SPEAKER 2: It's good to be here." + pad(4), "SPEAKER 1: What about steel?" + pad(1), "SPEAKER 2: It worked." + pad(4)], LISTED);
  assert.deepEqual(r.names, { "SPEAKER 1": HOST, "SPEAKER 2": GUEST }, "the guest's first words heard under the host's voice do not undo the host's own introduction");
  assert.ok(r.checked.find(x => x.kind === "addresses_other" && x.key === "SPEAKER 1" && x.name === HOST).edge);
  r = identify(["SPEAKER 1: Hi, I'm Walt Brannigan." + pad(2) + " With me now, Marcus Delacroix and Jane Holloway. Marcus, you first.", "SPEAKER 2: Thanks, Walt." + pad(3), "SPEAKER 1: Jane, your view?", "SPEAKER 3: I disagree, Walt." + pad(3)], { show: SHOW, showAuthor: HOST, episodeTitle: "Tariffs — Marcus Delacroix and Jane Holloway" });
  assert.deepEqual(r.names, { "SPEAKER 1": HOST, "SPEAKER 2": GUEST, "SPEAKER 3": "Jane Holloway" }, "each guest called by name just before answering, and listed");
  r = identify(["HOST: Hello and good evening." + pad(2), "GUEST: Thank you." + pad(3), "HOST: What about steel?" + pad(1), "GUEST: It worked." + pad(3)], LISTED);
  assert.deepEqual(r.names, { HOST: HOST, GUEST: GUEST });
});
test("what is not identity: a possessive, “it's”, a title that names the subject rather than a guest, a pasted text with no listing", () => {
  let r = identify(["SPEAKER 1: Hi, I'm Walt Brannigan." + pad(2) + " This is Delacroix's plan, and it's Marcus who wrote it.", "SPEAKER 2: I am Catholic, and I'm Marcus Delacroix's biggest critic." + pad(3), "SPEAKER 1: Right." + pad(1), "SPEAKER 2: Yes." + pad(3)], LISTED);
  assert.deepEqual(r.names, { "SPEAKER 1": HOST, "SPEAKER 2": null });
  r = identify(["SPEAKER 1: Welcome to the Straight Talk Hour." + pad(3) + " Tonight we talk about what Marcus Delacroix said last week.", "SPEAKER 2: He was wrong about steel." + pad(3), "SPEAKER 1: Delacroix claims output rose." + pad(2), "SPEAKER 2: It did not." + pad(3)], LISTED);
  assert.deepEqual(r.names, { "SPEAKER 1": HOST, "SPEAKER 2": null }, "the one voice left is not given the title's name when nothing shows that person is in the conversation");
  r = identify(["SPEAKER 1: Welcome back." + pad(2) + " Dana, thanks for joining me.", "SPEAKER 2: Thanks for having me. My name is Dana Reyes, and I run the survey lab." + pad(3), "SPEAKER 1: So what did it cover?" + pad(1), "SPEAKER 2: Four hundred households." + pad(3), "SPEAKER 1: We will leave it there. Dana Reyes, thank you."], {});
  assert.deepEqual(r.names, { "SPEAKER 1": null, "SPEAKER 2": "Dana Reyes" });
  // "this is" counts less than "I'm": a host can present someone that way
  r = identify(["SPEAKER 1: Hi, this is Walt Brannigan." + pad(2)], LISTED);
  assert.equal(r.checked.find(x => x.kind === "self_identification").weight, 2);
});
test("every clue, the app's or the model's, is checked against the words before it counts", () => {
  const sp = I.speakingTurns(shared.parseTranscript(["SPEAKER 1: Welcome to the Straight Talk Hour. Joining us now, Marcus.", "SPEAKER 2: Thanks for having me. My name is Dana and I study steel.", "SPEAKER 1: Right.", "AD 1: This hour is brought to you by Comfy Pillow, use promo code WALT today."].join("\n"), { mode: "text" }), {});
  const L = I.listingOf({ title: "", import: { showInfo: { name: SHOW, author: HOST }, episodeInfo: { title: EPISODE } } });
  const cands = I.listingCandidates(L), stats = I.voiceStats(sp);
  const ctx = { sp, stats, keys: new Set(stats.keys()), nameableKeys: new Set(["SPEAKER 1", "SPEAKER 2"]), fixed: new Map(), fixedKeys: new Set(), cands, listing: L, listingText: I.listingText(L), indexOfTurn: new Map(sp.map((x, k) => [x.i, k])) };
  const check = x => I.checkClue(Object.assign({ source: "model" }, x), ctx);
  assert.equal(check({ key: "SPEAKER 2", name: "Dana Inventedsurname", kind: "self_identification", turn: 1, quote: "My name is Dana and I study steel" }).name, "Dana", "only what the words give; the rest is never added");
  assert.equal(check({ key: "SPEAKER 2", name: GUEST, kind: "introduced", turn: 0, quote: "Joining us now, Marcus" }).name, GUEST, "a first name completed from the one listed person who has it");
  assert.match(check({ key: "SPEAKER 2", name: GUEST, kind: "introduced", turn: 0, quote: "Joining us tonight, Marcus" }).why, /not in that turn/);
  assert.match(check({ key: "SPEAKER 1", name: "Dana", kind: "self_identification", turn: 1, quote: "My name is Dana and I study steel" }).why, /another voice's/);
  assert.match(check({ key: "SPEAKER 1", name: GUEST, kind: "introduced", turn: 0, quote: "Joining us now, Marcus" }).why, /cannot introduce itself/);
  assert.match(check({ key: "SPEAKER 2", name: HOST, kind: "hosts_show", turn: 0, quote: "Welcome to the Straight Talk Hour" }).why, /decides this itself/);
  assert.match(check({ key: "SPEAKER 2", name: "Comfy Pillow", kind: "self_identification", turn: 3, quote: "brought to you by Comfy Pillow" }).why, /no such voice|advertisement/);
  assert.match(check({ key: "SPEAKER 2", name: "Dana", kind: "addressed", turn: 0, quote: "Welcome to the Straight Talk Hour" }).why, /not in the quoted words/);
  assert.match(check({ key: "SPEAKER 2", name: "Dana", kind: "made_up_kind", turn: 1, quote: "My name is Dana" }).why, /not a kind of clue/);
});

/* ---------- link → Deepgram → named reading (the API) ---------- */
test("an Apple link with no published transcript: Deepgram transcribes it, the advertisement is set apart, and the reading names host and guest everywhere", async t => {
  const ai = scriptedAI(), fetchFn = chainFetch(SAID);
  const f = await server(t, { ai, fetch: fetchFn, env: { DEEPGRAM_API_KEY: KEY, TRANSCRIBE_PREFER: "cloud" } });
  const b = await fromLink(f, APPLE_LINK);
  // the chain: Apple → feed → no transcript, no video, no page → the audio, to Deepgram, with the key, nothing else
  const dg = fetchFn.calls.filter(c => /api\.deepgram\.com/.test(c.url));
  assert.equal(dg.length, 1); assert.equal(dg[0].method, "POST"); assert.equal(dg[0].headers.Authorization, "Token " + KEY); assert.deepEqual(JSON.parse(dg[0].body), { url: AUDIO });
  assert.equal(b.run.import.source.kind, "audio-transcription"); assert.equal(b.run.import.source.engine, "deepgram");
  // the labels came from the recording; the advertisement was then set apart in that very text
  const pr = b.run.provenance;
  assert.equal(pr.labelsOrigin, "voices"); assert.equal(pr.voices.via, "transcription"); assert.equal(pr.voices.requestId, "dg-req-0140"); assert.equal(pr.voices.clipsChecked, false);
  assert.equal(pr.structure.mode, "labelled"); assert.deepEqual(pr.structure.ads.map(a => [a.key, a.cue]), [["AD 1", "brought to you by Comfy Pillow"]]);
  assert.match(b.transcript, /^AD 1: The Straight Talk Hour is brought to you by Comfy Pillow\./m);
  assert.doesNotMatch(b.transcript, /^SPEAKER 4:/m, "the advertisement's voice is no speaker of the conversation");
  assert.equal(b.attributionGate.status, "ready"); assert.equal(b.attributionGate.origin, "voices");
  // who is who, from the words and the listing, before anything was read
  assert.equal(nameOf(b, "SPEAKER 2"), HOST); assert.equal(nameOf(b, "SPEAKER 3"), GUEST);
  assert.equal(nameOf(b, "SPEAKER 1"), "Speaker 1", "the announcer is not named");
  assert.equal(nameOf(b, "AD 1"), "Advertisement 1");
  const id = pr.identification;
  assert.deepEqual(id.decisions.map(d => [d.key, d.name]).sort(), [["SPEAKER 2", HOST], ["SPEAKER 3", GUEST]]);
  assert.equal(id.decisions.find(d => d.key === "SPEAKER 2").how, "the show's host as listed by the show's name and Apple's listing of the show; this voice opens the show: “Good evening and welcome to the Straight Talk Hour.”", "thanked by name at the start of a longer answer is not being called by name just before answering");
  assert.match(id.decisions.find(d => d.key === "SPEAKER 3").how, /^introduced by name just before speaking: “Joining us now from Washington, Marcus Delacroix, former trade adviser\.”/);
  assert.match(id.unnamed.find(u => u.key === "SPEAKER 1").why, /speaks only briefly, and nothing in the conversation or the listing names it/);
  assert.ok(!id.nameable.includes("AD 1"));
  assert.equal(id.inputHash, b.run.input.sha256);
  // identification ran before any reading, and the readings were told the names
  const calls = (await fs.promises.readFile(path.join(f.dir, "runs", b.run.id, "calls.jsonl"), "utf8")).split("\n").filter(Boolean).map(JSON.parse);
  const order = calls.map(c => c.purpose);
  assert.ok(order.indexOf("identify_speakers") !== -1 && order.indexOf("identify_speakers") < order.indexOf("segment") && order.indexOf("segment") < order.indexOf("deflate"), order.join(","));
  const reading = ai.prompts.find(p => p.startsWith("Help a reader understand this passage accurately."));
  assert.match(reading, /- SPEAKER 2 \(Walt Brannigan\)/); assert.match(reading, /- SPEAKER 3 \(Marcus Delacroix\)/);
  assert.match(reading, /call each speaker by the name listed for them/);
  assert.ok(b.passages.length && b.passages.every(p => p.readingGate.status === "ready"), JSON.stringify(b.passages.map(p => p.readingGate)));
  assert.ok(b.passages.every(p => p.basedOn.namesSig), "every reading records the names it was made under");
  // the interruption: the host's one-word "Right." is its own turn, under the host's name
  const turns = shared.parseTranscript(b.transcript, { mode: b.run.parseMode });
  const right = turns.find(x => x.text === "Right.");
  assert.equal(right.label, "SPEAKER 2"); assert.equal(nameOf(b, right.label), HOST);
  assert.equal(turns[right.i - 1].label, "SPEAKER 3"); assert.equal(turns[right.i + 1].label, "SPEAKER 3");
  // the exports name them too
  const md = (await f.api("GET", "/api/runs/" + b.run.id + "/export.md?level=hs")).data;
  const ex = (await f.api("GET", "/api/runs/" + b.run.id + "/export.json")).data;
  const ob = (await f.api("GET", "/api/runs/" + b.run.id + "/obligations.json")).data;
  assertNamed(b, md, ex, ["SPEAKER 2", "SPEAKER 3"], [HOST, GUEST]);
  assert.match(md, /\*\*Who is speaking\.\*\*\n- Speaker 1: Not identified\. This voice speaks only briefly[^\n]*\n- Walt Brannigan \(Speaker 2\): The show's host as listed[^\n]*\n- Marcus Delacroix \(Speaker 3\): Introduced by name just before speaking[^\n]*\n- Advertisement 1: An advertisement in the recording/);
  assert.match(md, /^> Marcus Delacroix: “/m);
  assert.match(md, /^_Speaker 1, Walt Brannigan, Marcus Delacroix_$/m, "a passage's speaker line names them");
  assert.ok(ex.claims.some(c => c.speakerKey === "SPEAKER 3" && c.speaker === GUEST && c.speakerNamedBy === "identification"), JSON.stringify(ex.claims.map(c => [c.speakerKey, c.speaker, c.speakerNamedBy])));
  assert.deepEqual(ex.run.speakers.filter(s => s.inText).map(s => [s.key, s.name, s.namedBy]), [["SPEAKER 1", "Speaker 1", "unnamed"], ["SPEAKER 2", HOST, "identification"], ["SPEAKER 3", GUEST, "identification"], ["AD 1", "Advertisement 1", "set_apart"]]);
  assert.equal(ex.run.provenance.identification.decisions.length, 2);
  assert.ok(ex.passages.every(p => p.speakerNames.every(n => !/^Speaker [23]$/.test(n))));
  assert.ok(ob.obligations.length && ob.obligations.every(o => o.speaker_name && !/^Speaker [23]$/.test(o.speaker_name)), JSON.stringify(ob.obligations.map(o => o.speaker_name)));
});

test("the guard itself: a reading that ends with “Speaker 2” despite a clear introduction fails it", () => {
  const b = { run: { speakers: [{ key: "SPEAKER 2", name: "Speaker 2" }] } };
  assert.throws(() => assertNamed(b, "", { passages: [], claims: [] }, ["SPEAKER 2"], [HOST]), /SPEAKER 2 should be Walt Brannigan/);
  const named = { run: { speakers: [{ key: "SPEAKER 2", name: HOST }] } };
  assert.throws(() => assertNamed(named, "> Speaker 2: “Steel.”", { passages: [], claims: [] }, ["SPEAKER 2"], [HOST]), /credited to a number/);
});

/* ---------- link → named reading (the page) ---------- */
test("the page: paste the link, press Read this, and the cards, quotes, passages and claims say who said what; no one is asked for a name", async t => {
  const ai = scriptedAI(), fetchFn = chainFetch(SAID);
  const f = await page(t, { ai, serverFetch: fetchFn, run: noYtdlp, env: { DEEPGRAM_API_KEY: KEY, TRANSCRIBE_PREFER: "cloud" } });
  const ta = f.$("f-text"); ta.value = APPLE_LINK; ta.listeners.input();
  const going = f.$("readThis").click();
  const done = () => { const s = f.ctx.page.S; return s.b && s.b.run && s.b.run.processing && ["complete", "partial"].includes(s.b.run.processing.status) && s.b.passages.length && s.b.passages.every(p => p.readingGate && p.readingGate.status === "ready"); };
  await f.pump(done, 600);
  await going; await f.settle();
  assert.ok(done(), "the reading finished: " + JSON.stringify(f.ctx.page.S.b && f.ctx.page.S.b.run.processing));
  const view = visible(f.$("runView"));
  assert.equal(visible(f.$("speakerNotice")), "Speakers separated by voice. Details", "one quiet line; it never asks for names");
  assert.doesNotMatch(view, /Name them|Speaker 2|Speaker 3/, "neither host nor guest is shown by number anywhere on the page");
  const cards = f.body.querySelectorAll(".card");
  assert.ok(cards.length >= 1);
  assert.ok(cards.some(c => /Walt Brannigan/.test(visible(c.querySelector(".attrib")))) && cards.some(c => /Marcus Delacroix/.test(visible(c.querySelector(".attrib")))), "each card says who speaks in it");
  let quoted = "", claimed = "";
  for (const c of cards) {
    const ev = c.querySelector("details.evidence"); ev.setAttribute("open", "");
    const secs = ev.querySelectorAll("section").map(visible), who = secs.find(x => /^Who is speaking/.test(x)) || "";
    // outside the one line that gives each speaker's label, no host or guest is shown by number
    assert.doesNotMatch(secs.filter(x => x !== who).join("\n"), /Speaker [23]\b/);
    assert.match(secs[0], /^The original passage[\s\S]*Walt Brannigan: [\s\S]*Marcus Delacroix: /, "the source passage names its speakers");
    assert.match(who, /Walt Brannigan \(Speaker 2\): The show's host as listed by the show's name and Apple's listing of the show; this voice opens the show: “Good evening and welcome to the Straight Talk Hour\.”/);
    assert.match(who, /Marcus Delacroix \(Speaker 3\): Introduced by name just before speaking: “Joining us now from Washington, Marcus Delacroix, former trade adviser\.”/);
    quoted += secs.find(x => /^Quoted in this reading/.test(x)) || ""; claimed += secs.find(x => /^Claims in this passage/.test(x)) || "";
  }
  assert.match(quoted, /Marcus Delacroix: “Some did\. But the plants hired/, "quotes carry names");
  assert.match(claimed, /Marcus Delacroix: MOCK claim from turn/, "claims carry names");
  // the advertisement is shown as one, apart from the conversation, where a card includes it
  const withAd = cards.find(c => /Advertisement 1: /.test(visible(c.querySelector("details.evidence"))));
  if (withAd) assert.match(visible(withAd.querySelector("details.evidence")), /Advertisement 1: An advertisement in the recording/);
  // Controls: names with their evidence, every one optional
  f.$("controlsBtn").click();
  const sp = f.$("ctl-speakers");
  assert.match(visible(sp), /Separated by voice by Deepgram as it transcribed the recording: 3 voices\. 1 advertisement was set apart\./);
  const inputs = sp.querySelectorAll("input").filter(i => /^Name for /.test(i.getAttribute("aria-label") || ""));
  assert.deepEqual(inputs.map(i => [i.getAttribute("aria-label"), i.value]), [["Name for Speaker 1", ""], ["Name for Speaker 2", HOST], ["Name for Speaker 3", GUEST]]);
  assert.match(visible(sp), /Optional\. The app finds names from the conversation and the episode's listing/);
});

/* ---------- upload → named reading ---------- */
const UPLOAD = [
  "Speaker 1: Hello and welcome. I'm Ana Ferreira, and this is the Transit Desk. My guest today studied the city's survey closely.",
  "Speaker 1: Dana, thanks for joining me.",
  "Speaker 2: Thanks for having me. My name is Dana Reyes, and I run the survey lab at the university.",
  "Speaker 1: So what did the survey actually cover?",
  "Speaker 2: Four hundred households in three neighborhoods. That is a small sample for a city this size.",
  "Speaker 1: Right.",
  "Speaker 2: So when the report says riders everywhere support more lanes, it is stretching what those households can tell you.",
  "Speaker 1: The mayor's office says the results are clear.",
  "Speaker 2: They are clear for those three neighborhoods, not for the whole city, and nobody outside the office has seen the questionnaire.",
  "Speaker 1: Dana Reyes, thank you.",
].join("\n");
test("an uploaded transcript with numbered labels: names from the words, kept through the reading, the exports and an interruption", async t => {
  const f = await server(t, {});
  const made = await f.api("POST", "/api/intake", { input: UPLOAD });
  assert.equal(made.status, 202);
  const b = await f.finish(made.data.run.id);
  assert.equal(nameOf(b, "SPEAKER 1"), "Ana Ferreira"); assert.equal(nameOf(b, "SPEAKER 2"), "Dana Reyes");
  assert.equal(b.run.provenance.labelsOrigin || "source", "source", "the labels came with the upload; only names were added");
  assert.ok(b.passages.length && b.passages.every(p => p.readingGate.status === "ready"));
  const md = (await f.api("GET", "/api/runs/" + b.run.id + "/export.md?level=hs")).data, ex = (await f.api("GET", "/api/runs/" + b.run.id + "/export.json")).data;
  assertNamed(b, md, ex, ["SPEAKER 1", "SPEAKER 2"], ["Ana Ferreira", "Dana Reyes"]);
  assert.match(md, /- Ana Ferreira \(Speaker 1\): Names itself: “Hello and welcome\.”|- Ana Ferreira \(Speaker 1\): Names itself: “I'm Ana Ferreira, and this is the Transit Desk\.”/);
});

/* ---------- a recording that never names anyone ---------- */
test("a recording that never identifies anyone keeps consistent numbered labels, says why under Evidence, and is still read", async t => {
  const said = [[0, "Good evening. The steel numbers came out this morning, and they surprised a lot of people."], [1, "They show output up eleven percent since the tariffs took effect."], [0, "Right."], [1, "And prices rose four percent over the year, not double."], [0, "But the new jobs went to machines."], [1, "Some did, but the plants hired eight hundred workers last year."]];
  const f = await server(t, { ai: scriptedAI(), fetch: chainFetch(said), env: { DEEPGRAM_API_KEY: KEY, TRANSCRIBE_PREFER: "cloud" } });
  const nb = await fromLink(f, APPLE_LINK);
  assert.equal(nameOf(nb, "SPEAKER 1"), "Speaker 1"); assert.equal(nameOf(nb, "SPEAKER 2"), "Speaker 2");
  assert.deepEqual(nb.run.provenance.identification.decisions, [], "the host listed for the show is not given to a voice that neither opens the show nor introduces anyone");
  for (const u of nb.run.provenance.identification.unnamed) assert.match(u.why, /^Nothing in the conversation or the episode's listing names this voice\.$/);
  assert.ok(nb.passages.length && nb.passages.every(p => p.readingGate.status === "ready"), "the reading is not held for want of names");
  const md = (await f.api("GET", "/api/runs/" + nb.run.id + "/export.md?level=hs")).data;
  assert.match(md, /\*\*Who is speaking\.\*\*\n- Speaker 1: Not identified\. Nothing in the conversation or the episode's listing names this voice\.\n- Speaker 2: Not identified\./);
  // the same label means the same voice throughout, including the interruption
  const turns = shared.parseTranscript(nb.transcript, { mode: nb.run.parseMode });
  assert.deepEqual(turns.filter(x => !x.heading).map(x => x.label), ["SPEAKER 1", "SPEAKER 2", "SPEAKER 1", "SPEAKER 2", "SPEAKER 1", "SPEAKER 2"]);
});

/* ---------- the model's clues ---------- */
test("the model's clues count only after the same checks; an invented name, a misplaced quote and an unreadable answer change nothing they should not", async t => {
  const caller = SAID.slice(0, 10).concat([[1, "Let's go to the phones. Ruth is calling from Dayton. Ruth, go ahead."], [4, "Hi Walt. I work at one of those mills, and we did hire again this year, but the overtime is gone."], [1, "Thank you, Ruth."]]).concat(SAID.slice(12));
  const ai = scriptedAI({ identify: p => ({ voices: [
    { label: "SPEAKER 5", name: "Ruth", evidence: [{ kind: "addressed", turn: Number(/\[(\d+)\] SPEAKER 2: Let's go to the phones/.exec(p)[1]), quote: "Ruth, go ahead." }] },
    { label: "SPEAKER 1", name: "Roberta Sandoval", evidence: [{ kind: "self_identification", turn: 0, quote: "this is the Straight Talk Hour" }] },
    { label: "SPEAKER 3", name: "Marcus Delacroix Jr", evidence: [{ kind: "introduced", turn: 2, quote: "Joining us now from Washington, Marcus Delacroix, former trade adviser" }] },
  ], unnamed: [{ label: "SPEAKER 1", why: "an announcer reads the show's opening" }] }) });
  const f = await server(t, { ai, fetch: chainFetch(caller), env: { DEEPGRAM_API_KEY: KEY, TRANSCRIBE_PREFER: "cloud" } });
  const b = await fromLink(f, APPLE_LINK);
  const id = b.run.provenance.identification, ev = id.evidence.filter(e => e.source === "model");
  assert.equal(nameOf(b, "SPEAKER 3"), GUEST, "“Jr” is not in the words or the listing: only the part the words give is used");
  assert.equal(nameOf(b, "SPEAKER 1"), "Speaker 1", "an invented name with a quote that names no one is refused");
  assert.match(ev.find(e => e.key === "SPEAKER 1").why, /do not name this person/);
  assert.match(id.unnamed.find(u => u.key === "SPEAKER 1").why, /speaks only briefly/);
  // one call by first name, supporting only: not enough for a name on its own
  assert.equal(nameOf(b, "SPEAKER 5"), "Speaker 5");
  assert.match(id.unnamed.find(u => u.key === "SPEAKER 5").why, /^Only one weak clue points to a name \(Ruth: called by name once just before answering\), which is not enough on its own\.$/);
  // an unreadable answer: the app's own reading of the words decides, and the reading goes on
  const g = await server(t, { ai: scriptedAI({ identify: () => ({ throw: true }) }), fetch: chainFetch(SAID), env: { DEEPGRAM_API_KEY: KEY, TRANSCRIBE_PREFER: "cloud" } });
  const gb = await fromLink(g, APPLE_LINK);
  assert.equal(nameOf(gb, "SPEAKER 2"), HOST); assert.equal(nameOf(gb, "SPEAKER 3"), GUEST);
  assert.match(gb.run.provenance.identification.method, /could not be read/);
  assert.ok(gb.passages.every(p => p.readingGate.status === "ready"));
});

/* ---------- a person's names ---------- */
test("a person's name is theirs: identification after a label correction never replaces it, and the readings say when a name changed", async t => {
  const f = await server(t, {});
  const id = (await f.api("POST", "/api/intake", { input: UPLOAD })).data.run.id;
  let b = await f.finish(id);
  const sigBefore = b.passages[0].basedOn.namesSig;
  let r = await f.api("POST", "/api/runs/" + id + "/confirm-names", { names: [{ key: "SPEAKER 2", name: "Dr. Dana Reyes" }] });
  assert.equal(r.status, 200);
  assert.ok(r.data.passages.every(p => p.stale.includes("speaker names changed since this analysis")));
  // putting the old name back makes the readings current again (names, like text, are compared, not timed)
  r = await f.api("POST", "/api/runs/" + id + "/confirm-names", { names: [{ key: "SPEAKER 2", name: "Dana Reyes" }] });
  assert.ok(r.data.passages.every(p => !p.stale.length), JSON.stringify(r.data.passages.map(p => p.stale)));
  assert.equal(r.data.passages[0].basedOn.namesSig, sigBefore);
  // a label correction: identification runs again for the new labels, and the person's name stays
  await f.api("POST", "/api/runs/" + id + "/confirm-names", { names: [{ key: "SPEAKER 2", name: "Dr. Dana Reyes" }] });
  b = await f.store.bundle(id);
  const prov = JSON.parse(JSON.stringify(b.run.provenance)); prov.overrides = { "5": "SPEAKER 2" };
  await f.api("PUT", "/api/runs/" + id, { run: { provenance: prov } });
  await f.api("POST", "/api/runs/" + id + "/read", {});
  b = await f.finish(id);
  assert.equal(b.run.provenance.identification.attrSig, b.attrSig, "identified again for the corrected labels");
  assert.equal(nameOf(b, "SPEAKER 2"), "Dr. Dana Reyes"); assert.ok(!b.run.provenance.identification.nameable.includes("SPEAKER 2"));
  assert.equal(nameOf(b, "SPEAKER 1"), "Ana Ferreira");
  assert.equal(shared.speakerAccount(b.run, "SPEAKER 2").text, "Named by you.");
});

/* ---------- clips and advertisements ---------- */
test("an advertisement is set apart whether it fills a turn, runs over two, or sits inside a host's turn; no label is left behind and no word changes", () => {
  const text = ["SPEAKER 1: Welcome back to the show, everyone, it is good to be here tonight.", "SPEAKER 2: This program is brought to you by Comfy Pillow, the pillow that remembers your shape.", "SPEAKER 3: Go to comfypillow.com and use promo code WALT for forty percent off.", "SPEAKER 1: And we are back. Before the break we were talking about steel. Quick word from our sponsor: use promo code WALT at comfypillow.com for forty percent off your first order of pillows today. Now, the numbers."].join("\n");
  const paras = S.labelledTurns(text);
  const d = S.decideLabelled(text, paras, { ads: [{ para: 1, endPara: 2, start: "This program is brought to you", end: "WALT for forty percent off", cue: "brought to you by Comfy Pillow" }, { para: 3, start: "Quick word from our sponsor use", end: "first order of pillows today", cue: "use promo code WALT" }, { para: 0, start: "Welcome back to the show everyone", end: "good to be here tonight", cue: "Welcome back to the show" }] });
  assert.equal(d.found.length, 2); assert.match(d.rejected[0].why, /no sponsor's words/, "a welcome is no advertisement");
  const fin = S.finishLabelled({ b: { run: { input: { sha256: "x" }, speakers: [] } }, text, found: d.found, rejected: d.rejected, calls: ["c1"], basis: {}, mode: "labelled" });
  assert.equal(fin.changed, true);
  assert.equal(fin.text, ["SPEAKER 1: Welcome back to the show, everyone, it is good to be here tonight.", "AD 1: This program is brought to you by Comfy Pillow, the pillow that remembers your shape. Go to comfypillow.com and use promo code WALT for forty percent off.", "SPEAKER 1: And we are back. Before the break we were talking about steel.", "AD 2: Quick word from our sponsor: use promo code WALT at comfypillow.com for forty percent off your first order of pillows today.", "SPEAKER 1: Now, the numbers."].join("\n"));
  assert.deepEqual(fin.record.ads.map(a => [a.key, a.speakers]), [["AD 1", ["SPEAKER 2", "SPEAKER 3"]], ["AD 2", ["SPEAKER 1"]]]);
  assert.deepEqual(fin.speakers.map(s => s.key), ["AD 1", "AD 2"]); assert.match(fin.speakers[0].bio, /set apart from the conversation \(it says: “brought to you by Comfy Pillow”\)/);
  // a clip that fills a whole turn leaves no empty label (0.13 refused this: "would have changed the words")
  const clipText = "SPEAKER 1: Roll the tape, here is what he said last week.\nSPEAKER 4: The agreement was a mistake and we will end it on the first day.\nSPEAKER 1: So that is the clip.";
  const cp = S.labelledTurns(clipText), cd = S.decideLabelled(clipText, cp, { clips: [{ para: 1, kind: "recording", start: "The agreement was a mistake and", end: "end it on the first day", introQuote: "Roll the tape", returnQuote: "So that is the clip", introducedAs: "" }] });
  const cf = S.finishLabelled({ b: { run: { input: { sha256: "x" }, speakers: [] } }, text: clipText, found: cd.found, rejected: [], calls: [], basis: {}, mode: "labelled" });
  assert.equal(cf.text, "SPEAKER 1: Roll the tape, here is what he said last week.\nCLIP 1: The agreement was a mistake and we will end it on the first day.\nSPEAKER 1: So that is the clip.");
});
test("an advertisement in a text with no labels gets its own segment; the voice before it resumes after it", () => {
  const text = "Welcome back to the show. Today we are talking about the steel numbers that came out this morning.\n\nThis hour is brought to you by Comfy Pillow. Go to comfypillow.com and use promo code WALT for forty percent off your first order.\n\nAnd we are back. The steel numbers show output up eleven percent.\n\nThanks for having me. They really do show that.";
  const paras = S.paragraphs(text);
  const proposal = { segments: [{ para: 0, start: "Welcome back to the show Today", voice: "A", change: { kind: "none", quote: "" } }, { para: 1, start: "This hour is brought to you", voice: "AD 1", change: { kind: "none", quote: "" } }, { para: 2, start: "And we are back The steel", voice: "A", change: { kind: "none", quote: "" } }, { para: 3, start: "Thanks for having me They really", voice: "B", change: { kind: "thanks_host", quote: "Thanks for having me" } }], ads: [{ id: "AD 1", cue: "use promo code WALT" }], clips: [], names: [] };
  const d = S.decideUnlabelled(text, paras, [0, 1, 2, 3], proposal, null);
  assert.deepEqual(d.segments.map(s => s.final), ["A", "AD 1", "A", "B"]);
  assert.deepEqual(d.notes.adsFound.map(a => a.id), ["AD 1"]);
  const fin = S.finishUnlabelled({ b: { run: { input: { sha256: "x" }, speakers: [] } }, text, paras, segments: d.segments.map(s => Object.assign(s, { final: s.final })), names: [], notes: Object.assign({ reviewDisagreed: 0, dropped: 0 }, d.notes, { adsFound: [{ id: "AD 1", cue: "use promo code WALT", key: "AD 1" }] }), calls: [], basis: {}, mode: "unlabelled" });
  assert.match(fin.text, /^AD 1: This hour is brought to you by Comfy Pillow\./m);
  assert.deepEqual(fin.speakers.map(s => s.key), ["SPEAKER 1", "SPEAKER 2", "AD 1"]);
  // without the sponsor's words, it is not an advertisement
  const bad = S.decideUnlabelled(text, paras, [0, 1, 2, 3], Object.assign({}, proposal, { ads: [{ id: "AD 1", cue: "This hour" }] }), null);
  assert.equal(bad.segments[1].final, "?"); assert.match(bad.notes.adsRejected[0].why, /no sponsor's words/);
});
test("reading-5: nothing in a reading is taken from an advertisement (checked), and the reading is told what AD n is", () => {
  const turns = shared.parseTranscript("SPEAKER 1: The steel numbers are up eleven percent this year.\nAD 1: This hour is brought to you by Comfy Pillow, use promo code WALT.\nSPEAKER 1: And the mills are hiring again this spring.", { mode: "text" });
  const a = { asSaid: [{ turn: 1, speaker: "AD 1", quote: "This hour is brought to you by Comfy Pillow" }], deflated: { hs: "x", g5: "x" }, fidelity: { grade: "faithful", notes: { hs: "", g5: "" } }, jump: { present: false, pivot: "", hs: "", g5: "" }, defense: { hs: "x", g5: "x" }, revision: { jumpSurvives: "", hs: "x", g5: "x" },
    claims: [{ text: "Comfy Pillow gives forty percent off", speaker: "AD 1", type: "claim", plain: { hs: "x", g5: "x" }, basis: { hs: "x", g5: "x" }, status: "unchecked" }], judgments: { evidence: "n/a", inference: "n/a" } };
  const issues = Q.contentIssues(a, { turnStart: 0, turnEnd: 2 }, turns, {}, "transcript", "reading-5");
  assert.ok(issues.includes("claims[0]: taken from an advertisement (AD 1), which is not part of the conversation"), issues.join(" | "));
  assert.ok(issues.includes("asSaid: a quotation is taken from an advertisement, which is not part of the conversation"));
  assert.ok(!Q.contentIssues(a, { turnStart: 0, turnEnd: 2 }, turns, {}, "transcript", "reading-4").some(x => /advertisement/.test(x)), "records under reading-4 keep their rules");
  assert.ok(P.AD_CHECKED.includes(P.CONTRACT), "the current contract keeps the advertisement rule (" + P.CONTRACT + ")");
  assert.match(P.deflate({ speakers: [] }, { title: "", stake: "", turnStart: 0, turnEnd: 0 }, "", {}), /A turn labelled AD n is an advertisement in the recording, not part of the conversation: take no claim or quotation from it/);
  assert.match(P.segment({}, ""), /turns labelled AD n are advertisements, never a passage of their own/);
});
test("needsIdentification: once per text and set of labels; never for names a person gave, a model's assignment, or an example", () => {
  const run = (extra, speakers) => Object.assign({ kind: "transcript", parseMode: "text", input: { sha256: "h1" }, speakers: speakers || [{ key: "SPEAKER 1", name: "Speaker 1" }, { key: "SPEAKER 2", name: "Speaker 2" }], provenance: { overrides: {} } }, extra);
  const b = (r, attrSig) => ({ run: r, transcript: "SPEAKER 1: Hello there, friends.\nSPEAKER 2: Hello to you.", attrSig: attrSig || "a1" });
  assert.equal(I.needsIdentification(b(run())), true);
  assert.equal(I.needsIdentification(b(run({ provenance: { overrides: {}, identification: { inputHash: "h1", attrSig: "a1" } } }))), false);
  assert.equal(I.needsIdentification(b(run({ provenance: { overrides: {}, identification: { inputHash: "h1", attrSig: "a1" } } }), "a2")), true, "a label changed");
  assert.equal(I.needsIdentification(b(run({ provenance: { overrides: {}, labelsOrigin: "model" } }))), false);
  assert.equal(I.needsIdentification(b(run({ example: true }))), false);
  assert.equal(I.needsIdentification(b(run({ provenance: { overrides: {}, namesByPerson: { "SPEAKER 1": "Ann", "SPEAKER 2": "Bo" } } }, [{ key: "SPEAKER 1", name: "Ann" }, { key: "SPEAKER 2", name: "Bo" }]))), false);
  assert.equal(I.needsIdentification({ run: run(), transcript: "BILL: Hello there, friends.\nJANE: Hello to you.", attrSig: "a1" }), false, "names the transcript supplies are kept as they are");
});

/* ---------- a link whose transcript has no speaker labels: the voices come from the recording by themselves ---------- */
const TRANSCRIPT_URL = "https://straighttalk.test/transcripts/live-77.txt";
const FEED_TX = FEED.replace('<rss version="2.0" ', '<rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0" ')
  .replace('<enclosure url="' + AUDIO + '"', '<podcast:transcript url="' + TRANSCRIPT_URL + '" type="text/plain"/><enclosure url="' + AUDIO + '"');
// the show's own transcript: every word, paragraph by paragraph, no one named in front of any line
const PLAIN = SAID.map(x => x[1]).join("\n\n");
/* Deepgram's answer when asked for the voices alone (diarize=true, no utterances): every word it heard, with its voice. */
function diarized(said) {
  let t = 0; const words = [];
  for (const [speaker, text] of said) { t += 0.6; for (const w of text.split(/\s+/)) { words.push({ word: w.toLowerCase().replace(/[^\p{L}\p{N}'’]/gu, ""), punctuated_word: w, speaker, start: t, end: t + 0.3 }); t += 0.35; } }
  return { metadata: { request_id: "dg-req-voices-77", duration: Math.round(t), models: ["nova-3-general"] }, results: { channels: [{ alternatives: [{ transcript: said.map(x => x[1]).join(" "), words }] }] } };
}
const txFetch = (dg) => chainFetch(SAID, u => {
  if (u === "https://feeds.straighttalk.test/rss") return { body: FEED_TX, type: "application/rss+xml" };
  if (u === TRANSCRIPT_URL) return { body: PLAIN, type: "text/plain" };
  if (/^https:\/\/api\.deepgram\.com\/v1\/listen/.test(u)) return dg ? dg(u) : { body: diarized(SAID), type: "application/json" };
  return null;
});
/* The page, from the pasted link to the finished reading (or to where it stops), with the run as the server keeps it. */
async function viaPage(t, fetchFn, env) {
  const f = await page(t, { ai: scriptedAI(), serverFetch: fetchFn, run: noYtdlp, env });
  const ta = f.$("f-text"); ta.value = APPLE_LINK; ta.listeners.input();
  const going = f.$("readThis").click();
  const settled = () => { const s = f.ctx.page.S; return s.b && s.b.run && s.b.run.processing && ["complete", "partial", "held", "error"].includes(s.b.run.processing.status); };
  await f.pump(settled, 600); await going; await f.settle();
  assert.ok(settled(), "the reading came to a stop: " + JSON.stringify(f.ctx.page.S.b && f.ctx.page.S.b.run.processing));
  const b = await f.system.store.bundle(f.ctx.page.S.runId);
  f.$("controlsBtn").click();
  return { f, b, speakers: visible(f.$("ctl-speakers")) };
}
test("a link whose published transcript names no one: the voices are separated from the recording by themselves, then named, before anything is read", async t => {
  const fetchFn = txFetch();
  const { f, b, speakers } = await viaPage(t, fetchFn, { DEEPGRAM_API_KEY: KEY });
  assert.equal(b.run.import.source.kind, "feed-transcript", "the show's own words are kept");
  // one request to Deepgram, for the voices alone, with the person's key and the episode's audio, nothing else
  const dg = fetchFn.calls.filter(c => /api\.deepgram\.com/.test(c.url));
  assert.equal(dg.length, 1); assert.match(dg[0].url, /diarize=true/); assert.doesNotMatch(dg[0].url, /utterances/);
  assert.equal(dg[0].headers.Authorization, "Token " + KEY); assert.deepEqual(JSON.parse(dg[0].body), { url: AUDIO });
  const pr = b.run.provenance;
  assert.equal(pr.labelsOrigin, "voices"); assert.equal(pr.voices.auto, true); assert.equal(pr.voices.coverage, 1);
  assert.match(pr.voices.method, /^The text came without speaker labels, so the episode's recording was sent to Deepgram \(your key\) to separate the voices\. Voices were separated from the recording by Deepgram/);
  assert.equal(pr.voices.audioFoundBy, "the episode this text was fetched from: its audio file");
  assert.equal(pr.voicesAttempt, undefined); assert.equal(pr.structure, undefined, "the words were not asked: the recording settled who speaks");
  assert.equal(shared.wordsOf(b.transcript.replace(/^[A-Z][A-Z0-9 ]*:\s+/gm, "")), shared.wordsOf(PLAIN), "every word of the show's transcript kept");
  // the advertisement's voice is set apart; the announcer, the host and the guest are voices 1–3
  assert.match(b.transcript, /^AD 1: The Straight Talk Hour is brought to you by Comfy Pillow\./m);
  assert.equal(b.attributionGate.status, "ready"); assert.equal(b.attributionGate.origin, "voices");
  assert.equal(nameOf(b, "SPEAKER 2"), HOST); assert.equal(nameOf(b, "SPEAKER 3"), GUEST); assert.equal(nameOf(b, "SPEAKER 1"), "Speaker 1");
  const recs = (await fs.promises.readFile(path.join(f.system.store.runDir(b.run.id), "calls.jsonl"), "utf8")).split("\n").filter(Boolean).map(JSON.parse), calls = recs.map(c => c.purpose);
  assert.ok(calls.indexOf("identify_speakers") !== -1 && calls.indexOf("identify_speakers") < calls.indexOf("deflate"), calls.join(","));
  // the only structure calls are the advertisement and clip pass on the voices' labelled text, not a words-only speaker pass
  const structural = recs.filter(c => /structure/.test(c.purpose)).map(c => c.callId);
  assert.ok(structural.length && structural.every(x => pr.voices.clipCalls.includes(x)), JSON.stringify({ structural, clipCalls: pr.voices.clipCalls }));
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  assert.ok(b.passages.length && b.passages.every(p => p.readingGate.status === "ready"), JSON.stringify(b.passages.map(p => p.readingGate)));
  // the page names them, and Controls say how the speakers were found
  assert.equal(visible(f.$("speakerNotice")), "Speakers separated by voice. Details");
  assert.doesNotMatch(visible(f.$("runView")), /Speaker [23]\b/);
  assert.match(speakers, /Separated by voice from the recording, automatically, because the text came without speaker labels: 3 voices, with 100% of this text's words lined up/);
});
test("the recording is not sent anywhere when audio is set to stay on this computer, and a failed separation is said once and not repeated", async t => {
  // audio kept on this computer: no request to Deepgram, even with a key
  { const fetchFn = txFetch(), f = await server(t, { ai: scriptedAI(), fetch: fetchFn, env: { DEEPGRAM_API_KEY: KEY, TRANSCRIBE_PREFER: "local" } });
    const b = await fromLink(f, APPLE_LINK);
    assert.equal(fetchFn.calls.filter(c => /api\.deepgram\.com/.test(c.url)).length, 0);
    assert.equal(b.run.provenance.voices, undefined);
    // nothing was tried, so nothing failed: the skip and its reason are recorded as a skip (0.14.2), for Controls and the exports
    const sk = b.run.provenance.voicesAttempt;
    assert.deepEqual([sk.status, sk.code, sk.auto], ["skipped", "audio_kept_local", true]); assert.match(sk.why, /^Audio is set to stay on this computer, so the recording was not sent to Deepgram/);
    assert.ok(b.run.provenance.structure, "the words were tried"); assert.equal(b.run.processing.status, "complete"); }
  // no key: nothing is sent, and a reading held for its speakers says what would settle it
  { const fetchFn = txFetch(), f = await server(t, { ai: scriptedAI(), fetch: fetchFn, env: {} });
    const b = await fromLink(f, APPLE_LINK);
    assert.equal(fetchFn.calls.filter(c => /api\.deepgram\.com/.test(c.url)).length, 0);
    const sk = b.run.provenance.voicesAttempt;
    assert.deepEqual([sk.status, sk.code], ["skipped", "no_deepgram_key"], "nothing was tried, so nothing failed: a skip, with why"); assert.equal(b.run.processing.status, "complete");
    // the exports carry the skip and its reason, so a skipped attempt is told from a failed one (0.14.2)
    const ex = (await f.api("GET", "/api/runs/" + b.run.id + "/export.json")).data, md = (await f.api("GET", "/api/runs/" + b.run.id + "/export.md?level=hs")).data;
    assert.deepEqual([ex.run.provenance.voicesAttempt.status, ex.run.provenance.voicesAttempt.code], ["skipped", "no_deepgram_key"]);
    assert.match(md, /_(?:Speakers were worked out from the words|This text has no speaker labels)\. No Deepgram key is set, so the recording was not sent to Deepgram to separate the voices; the words are used to find the speakers instead\._/); }
  // the page says the same under Controls, without calling it a failure
  { const { speakers } = await viaPage(t, txFetch(), {});
    assert.match(speakers, /No Deepgram key is set, so the recording was not sent to Deepgram to separate the voices/); assert.doesNotMatch(speakers, /could not be separated/); }
  // a recording of something else: the voices do not line up, the reason is kept, the words are tried, and a second
  // Read this does not ask Deepgram again for the same text
  { const other = diarized([[0, "Completely different words about gardening and the weather in the spring, nothing like the show at all, said slowly."], [1, "Tomatoes, peppers and beans grow well when the soil is warm and the nights are short."]]);
    const fetchFn = txFetch(() => ({ body: other, type: "application/json" }));
    const { f, b, speakers } = await viaPage(t, fetchFn, { DEEPGRAM_API_KEY: KEY });
    assert.equal(fetchFn.calls.filter(c => /api\.deepgram\.com/.test(c.url)).length, 1);
    const at = b.run.provenance.voicesAttempt;
    assert.ok(at && at.auto, JSON.stringify(b.run.provenance)); assert.equal(at.code, "voices_not_aligned"); assert.equal(at.status, "failed");
    assert.match(at.why, /^The recording's voices could not be lined up with this text: /);
    assert.equal(b.run.provenance.voices, undefined);
    assert.ok(b.run.provenance.structure, "the words were tried instead");
    assert.match(speakers, /The voices could not be separated from the recording automatically: The recording's voices could not be lined up with this text/);
    await f.system.reader.start(b.run.id); const job = f.system.reader.jobs.get(b.run.id); if (job) await job.done;
    assert.equal(fetchFn.calls.filter(c => /api\.deepgram\.com/.test(c.url)).length, 1, "not asked again for the same text"); }
});

/* ---------- adversarial cases kept as tests (invented people and shows) ---------- */
/* The whole step, as preparation runs it (a fake store; the model scripted when given), for what the app's own clue
   finding does not cover alone: captions in lower case, quotations kept as the transcript has them. */
async function identifyFully(lines, listing, model) {
  const transcript = lines.join("\n");
  const run = { id: "run_adv", kind: "transcript", parseMode: "text", input: { sha256: "h" }, speakers: [], provenance: {}, title: "", sourceLabel: "",
    import: { showInfo: { name: listing.show || "", author: listing.showAuthor || "", persons: [] }, episodeInfo: { title: listing.episodeTitle || "", description: "", persons: [] } } };
  const store = { bundle: async () => ({ run, transcript, attrSig: "a0-0" }), captureCallBasis: async () => ({}), recordCall: async () => {} };
  const ai = model ? { kind: "mock", model: "scripted", mock: true, sample: async () => { const data = model(); return { data, text: JSON.stringify(data), model: "scripted", requestId: "r", stopReason: "end_turn", usage: null }; } } : null;
  const out = await I.identifySpeakers({ ai, store, id: run.id });
  return { names: Object.fromEntries(out.speakers.map(s => [s.key, (out.record.decisions.find(d => d.key === s.key) || {}).name || null])), record: out.record };
}
test("adversarial: what is said about someone is not who is speaking (a quoted ad, a teaser, last week's guest, a host away, a rhetorical call, a dropped line)", () => {
  const four = (a, b, c, d) => [a, b, "SPEAKER 1: " + c, "SPEAKER 2: " + d];
  let r = identify(four("SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix.", "SPEAKER 2: Thanks for having me." + pad(2),
    "Did you see that ad? He looks into the camera and says, “I'm Jack Pruitt and I approve this message.”" + pad(1), "Everybody saw it." + pad(2)), LISTED);
  assert.deepEqual(r.names, { "SPEAKER 1": HOST, "SPEAKER 2": GUEST }, "a quoted “I'm …” names no one here");
  r = identify(four("SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Last week my guest was Dana Reyes, and you all wrote in.", "SPEAKER 2: Thanks for having me." + pad(2), "What about steel?", "It worked." + pad(2)), LISTED);
  assert.equal(r.names["SPEAKER 2"], null, "last week's guest is not tonight's voice");
  r = identify(four("SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Coming up after the break, Marcus Delacroix.", "SPEAKER 2: Good evening, everyone." + pad(2), "What about steel?", "It worked." + pad(2)), LISTED);
  assert.equal(r.names["SPEAKER 2"], null, "a teaser introduces no one now");
  r = identify(four("SPEAKER 1: Welcome to the Straight Talk Hour. I'm Dana Reyes, sitting in for Walt Brannigan tonight." + pad(2) + " My guest asked us not to use his name.", "SPEAKER 2: Thanks for having me." + pad(2), "What happened at the mill?", "It closed." + pad(2)), LISTED);
  assert.deepEqual(r.names, { "SPEAKER 1": "Dana Reyes", "SPEAKER 2": null }, "the host the listing names is away; no one else gets his name");
  r = identify(four("SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Marcus Delacroix, if you are listening, call us.", "SPEAKER 2: I have something to add about the mills." + pad(2), "Go on.", "They are hiring." + pad(2)), LISTED);
  assert.equal(r.names["SPEAKER 2"], null, "a call to someone who may be listening is not to the voice that speaks next");
  r = identify(four("SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Marcus, are you there?", "SPEAKER 2: I think he dropped off. He was there a second ago.", "Let's try him again later.", "Sure." + pad(2)), LISTED);
  assert.notEqual(r.names["SPEAKER 2"], GUEST, "the voice that answers speaks of him, so it is not him");
});
test("adversarial: the ways people introduce themselves and each other, in plain words, name the right voice", async () => {
  const rows = [
    ["SPEAKER 1: Good evening." + pad(2) + " With me is Marcus Delacroix.", "SPEAKER 2", GUEST],
    ["SPEAKER 1: Good evening." + pad(2) + " We're joined now by Marcus Delacroix.", "SPEAKER 2", GUEST],
    ["SPEAKER 1: Good evening." + pad(2) + " Joining us from Washington is Marcus Delacroix.", "SPEAKER 2", GUEST],
    ["SPEAKER 1: Good evening." + pad(2) + " Tonight's guest is Marcus Delacroix.", "SPEAKER 2", GUEST],
    ["SPEAKER 1: Good evening." + pad(2) + " Marcus Delacroix, welcome to the show.", "SPEAKER 2", GUEST],
    ["SPEAKER 1: Good evening." + pad(2) + " We're joined now by our correspondent in Paris, Jane Holloway.", "SPEAKER 2", "Jane Holloway"],
    ["SPEAKER 1: Good evening, I'm your host, Walt Brannigan." + pad(2), "SPEAKER 1", HOST],
    ["SPEAKER 1: Good morning, everyone. Walt Brannigan here with you." + pad(2), "SPEAKER 1", HOST],
    ["SPEAKER 1: This is the Straight Talk Hour, and I'm Walt Brannigan." + pad(2), "SPEAKER 1", HOST],
  ];
  for (const [first, key, want] of rows) {
    const r = identify([first, "SPEAKER 2: Thanks for having me." + pad(2), "SPEAKER 1: What about steel?" + pad(1), "SPEAKER 2: It worked." + pad(3)], {});
    assert.equal(r.names[key], want, first.slice(0, 90) + " → " + JSON.stringify(r.names));
  }
  // looser words count only for a listed person or a voice that answers as a guest: a sponsor or a holiday is no one
  for (const first of ["SPEAKER 1: Good evening." + pad(2) + " Election Day is here.", "SPEAKER 1: Good evening." + pad(2) + " It's great to have Goldman Sachs on board as a sponsor."]) {
    const r = identify([first, "SPEAKER 2: Indeed it is." + pad(2), "SPEAKER 1: What about steel?" + pad(1), "SPEAKER 2: It worked." + pad(3)], {});
    assert.equal(r.names["SPEAKER 2"], null, first);
  }
  // the listed host's first name, said by the voice that opens the show
  let r = identify(["SPEAKER 1: Hey everybody, Dana here." + pad(2), "SPEAKER 2: Thanks for having me." + pad(3), "SPEAKER 1: What is driving the prices?" + pad(1), "SPEAKER 2: Supply." + pad(3)], { show: "The Long Game", showAuthor: "Dana Reyes", episodeTitle: "Housing" });
  assert.equal(r.names["SPEAKER 1"], "Dana Reyes");
  // a caller's first name is never completed from a listed person who shares it
  r = identify(["SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Line one, go ahead.", "SPEAKER 2: Hi, my name is Marcus, and I think he is right about the mills." + pad(3), "SPEAKER 1: Why?" + pad(1), "SPEAKER 2: Because I work there." + pad(3)], { show: SHOW, showAuthor: HOST, episodeTitle: "Marcus Delacroix: wrong again" });
  assert.notEqual(r.names["SPEAKER 2"], GUEST);
  // letters beyond English, and transcripts labelled A and B
  r = identify(["A: Good evening." + pad(2) + " Who is with us?", "B: Hello, I'm Łukasz Nowak, and I build bridges." + pad(3), "A: What about steel?" + pad(1), "B: It worked." + pad(3)], {});
  assert.deepEqual(r.names, { A: null, B: "Łukasz Nowak" });
});
test("adversarial: recordings as they come: a voice change heard late, a co-host breaking in, a run-on sentence, captions in lower case", async () => {
  // the recording heard the guest's first words under the host's voice: being spoken to at the end still counts
  let r = identify(["SPEAKER 1: Welcome back to the show. My guest studied the survey closely. Dana, thanks for joining me. Thanks for", "SPEAKER 2: having me. We looked at the raw responses." + pad(3), "SPEAKER 1: So what did it cover?" + pad(1), "SPEAKER 2: Four hundred households." + pad(3)], { show: "The Transit Desk", episodeTitle: "The survey — Dana Reyes" });
  assert.ok(r.checked.some(x => x.ok && x.kind === "addressed" && x.key === "SPEAKER 2"), JSON.stringify(r.checked.filter(x => x.kind === "addressed")));
  // a co-host breaks in after the introduction; the guest's own reply takes it
  r = identify(["SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix.", "SPEAKER 3: Finally.", "SPEAKER 2: Thanks for having me, it's good to be here." + pad(3), "SPEAKER 1: What about steel?" + pad(1), "SPEAKER 2: It worked." + pad(3)], LISTED);
  assert.equal(r.names["SPEAKER 2"], GUEST); assert.equal(r.names["SPEAKER 3"], null);
  // a sentence of forty words and more keeps the name in its quotation
  r = identify(["SPEAKER 1: Welcome to the Straight Talk Hour. Tonight we have the steel numbers, the tariff vote, the strike at the plant in Gary, the price of coal, the new rules on imports and exports, and to make sense of all of it, joining us now, Marcus Delacroix.", "SPEAKER 2: Thanks for having me." + pad(3), "SPEAKER 1: What about steel?" + pad(1), "SPEAKER 2: It worked." + pad(3)], LISTED);
  assert.equal(r.names["SPEAKER 2"], GUEST); assert.match(r.res.assigned.get("SPEAKER 2").items.find(i => i.kind === "introduced").quote, /joining us now, Marcus Delacroix\.$/);
  // automatic captions: no capitals, no full stops; the record quotes them as they are
  const lc = x => x.toLowerCase().replace(/[.,?!“”]/g, "").replace(/’/g, "'");
  const out = await identifyFully(["SPEAKER 1: " + lc("Welcome to the Straight Talk Hour. Last week we talked about coal." + pad(3) + " Joining us now, Marcus Delacroix."), "SPEAKER 2: " + lc("Thanks for having me." + pad(3)), "SPEAKER 1: " + lc("What about steel?" + pad(2)), "SPEAKER 2: " + lc("It worked." + pad(3))], LISTED);
  assert.deepEqual(out.names, { "SPEAKER 1": HOST, "SPEAKER 2": GUEST });
  const intro = out.record.evidence.find(x => x.kind === "introduced" && x.ok);
  assert.match(intro.quote, /joining us now marcus delacroix$/, "the transcript's own letters: " + intro.quote);
  assert.match(out.record.decisions.find(d => d.key === "SPEAKER 2").how, /“[^”]*joining us now marcus delacroix”/);
  // a name only the model proposes in captions counts when the words, given capitals, say it plainly; and not otherwise
  const self = (quote) => () => ({ voices: [{ label: "SPEAKER 2", name: "Dana Reyes", evidence: [{ kind: "self_identification", turn: 1, quote }] }], unnamed: [] });
  let m = await identifyFully(["SPEAKER 1: good evening" + lc(pad(2)) + " so who are you", "SPEAKER 2: hi i'm dana reyes glad to be here" + lc(pad(3)), "SPEAKER 1: what about steel" + lc(pad(2)), "SPEAKER 2: it worked" + lc(pad(3))], {}, self("hi i'm dana reyes glad to be here"));
  assert.equal(m.names["SPEAKER 2"], "Dana Reyes");
  m = await identifyFully(["SPEAKER 1: good evening" + lc(pad(2)) + " what do you make of it", "SPEAKER 2: i'm not sure dana reyes is right about that" + lc(pad(3)), "SPEAKER 1: why" + lc(pad(2)), "SPEAKER 2: the sample" + lc(pad(3))], {}, self("i'm not sure dana reyes is right"));
  assert.equal(m.names["SPEAKER 2"], null);
});
