"use strict";
/* 0.14: every adversarial scenario written against the identification step, run through the whole step as preparation
   runs it (identifySpeakers with a fake store; the model's answer scripted where a scenario gives one). Each scenario
   says what a careful human concludes from the words: a name, no name, "anything but this name", or one of a few.
   A wrong name fails the test. A name a careful human would give but the app does not is allowed only for the cases
   listed in ACCEPTED, each with its reason; any other miss fails too. Invented people and shows; no lyrics. */
const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../server/identify");
const first = require("./fixtures/identify-scenarios");
const second = require("./fixtures/identify-scenarios-2");
const third = require("./fixtures/identify-scenarios-3");
const fourth = require("./fixtures/identify-scenarios-4");
const fifth = require("./fixtures/identify-scenarios-5");
const sixth = require("./fixtures/identify-scenarios-6");
const seventh = require("./fixtures/identify-scenarios-7");
const seventhAnswers = require("./fixtures/identify-answers-7.json");
// (three black-box reviews written without reading the implementation, each with a model's recorded answers)
const blind = [8, 9, 10].map(n => ({ n, set: require("./fixtures/identify-scenarios-" + n), answers: require("./fixtures/identify-answers-" + n + ".json") }));
// (0.14.5: every name a reading settles is put to a second reading; its answer for each scenario, recorded once from the
// same kind of stand-in model, given each exact prompt blind: identify-confirm.json, keyed "<set>-<scenario>")
const confirmations = require("./fixtures/identify-confirm.json");
const { isConfirm } = require("./fixtures/confirm");

/* Misses the app accepts, because the words do not settle them. */
const ACCEPTED = {
  J2: "Q and A labels with a guest the episode's title names but the conversation never does: the title alone may name the subject, not a guest",
  MS13: "“I'm your neighbor, Dana Reyes” has the same shape as “I'm your biggest fan, Walt Brannigan”, which speaks to someone; neither is taken as naming oneself",
};
const BLANK = { show: "", showAuthor: "", showArtist: "", showPersons: [], channel: false, episodeTitle: "", description: "", episodeAuthor: "", episodePersons: [], runTitle: "", sourceLabel: "" };

async function identify(sc, recorded, confirm) {
  const L = Object.assign({}, BLANK, sc.L);
  const transcript = sc.lines.join("\n");
  const run = { id: "run_adv", kind: "transcript", parseMode: "text", input: { sha256: "h" }, speakers: [], provenance: {}, title: L.runTitle, sourceLabel: L.sourceLabel,
    import: { showInfo: { name: L.show, author: L.showAuthor, artist: L.showArtist, persons: L.showPersons, channel: L.channel }, episodeInfo: { title: L.episodeTitle, description: L.description, author: L.episodeAuthor, persons: L.episodePersons } } };
  const store = { bundle: async () => ({ run, transcript, attrSig: "a0-0" }), captureCallBasis: async () => ({}), recordCall: async () => {} };
  // (the scenario's own scripted model first; else a model's recorded answer to the exact prompt, when the set has one)
  const answer = sc.model ? sc.model : recorded ? () => JSON.parse(JSON.stringify(recorded)) : null;
  const ai = answer ? { kind: "mock", model: "scripted", mock: true, sample: async ({ prompt }) => { const data = isConfirm(prompt) ? JSON.parse(JSON.stringify(confirm || {})) : answer(); return { data, text: JSON.stringify(data), model: "scripted", requestId: "r", stopReason: "end_turn", usage: null }; } } : null;
  // (with a model's answer, the step as a reading runs it; with none, the app's own reading alone, which in a reading only
  // checks and supports the model's and never names anyone by itself, 0.14.3)
  const out = ai ? await I.identifySpeakers({ ai, store, id: run.id }) : await I.appReading({ store, id: run.id });
  const names = {};
  for (const s of out.speakers) names[s.key] = (out.record.decisions.find(d => d.key === s.key) || {}).name || null;
  return names;
}
function judge(exp, got) {
  if (typeof exp === "string") return got === exp ? "ok" : got === null ? "MISSED" : "WRONG";
  if (exp === null) return got === null ? "ok" : "WRONG";
  if (exp.not !== undefined) return got === exp.not ? "WRONG" : "ok";
  if (exp.oneOf) return exp.oneOf.includes(got) ? "ok" : got === null ? "MISSED" : "WRONG";
  throw new Error("unknown expectation " + JSON.stringify(exp));
}
async function runAll(set, answers, only, n) {
  const wrong = [], missed = [];
  for (const sc of set.S) {
    if (only && !only(sc)) continue;
    const names = await identify(sc, answers ? answers[sc.id] : null, n ? confirmations[n + "-" + sc.id] : null);
    for (const [key, exp] of Object.entries(sc.expect)) {
      const v = judge(exp, names[key] === undefined ? null : names[key]);
      const line = sc.id + " " + key + ": got " + JSON.stringify(names[key]) + ", expected " + JSON.stringify(exp) + " — " + sc.title;
      if (v === "WRONG") wrong.push(line);
      if (v === "MISSED" && !ACCEPTED[sc.id]) missed.push(line);
    }
  }
  return { wrong, missed, count: set.S.length };
}
test("adversarial scenarios, first set: no wrong name, and no miss beyond the accepted ones", async () => {
  const r = await runAll(first, null, null, 1);
  assert.ok(r.count >= 140, "the whole set ran: " + r.count);
  assert.deepEqual(r.wrong, [], "wrong names:\n" + r.wrong.join("\n"));
  assert.deepEqual(r.missed, [], "misses:\n" + r.missed.join("\n"));
});
test("adversarial scenarios, second set (teasers, descriptions, callers, captions, all capitals, model clues, listings): no wrong name, and no miss beyond the accepted ones", async () => {
  const r = await runAll(second, null, null, 2);
  assert.ok(r.count >= 70, "the whole set ran: " + r.count);
  assert.deepEqual(r.wrong, [], "wrong names:\n" + r.wrong.join("\n"));
  assert.deepEqual(r.missed, [], "misses:\n" + r.missed.join("\n"));
});
test("adversarial scenarios, third set (0.14.2: titles and callings, hosts named by the show and its publisher, a host away, two priests, advertisements and clips, captions): no wrong name, and no miss beyond the accepted ones", async () => {
  const r = await runAll(third, null, null, 3);
  assert.ok(r.count >= 20, "the whole set ran: " + r.count);
  assert.deepEqual(r.wrong, [], "wrong names:\n" + r.wrong.join("\n"));
  assert.deepEqual(r.missed, [], "misses:\n" + r.missed.join("\n"));
});
test("adversarial scenarios, fourth set (0.14.2, from an independent review: shared titles, callings not the speaker's own, the dead, the absent and the late, callers, names that are not people, openers who do not host): no wrong name, and no miss beyond the accepted ones", async () => {
  const r = await runAll(fourth, null, null, 4);
  assert.ok(r.count >= 70, "the whole set ran: " + r.count);
  assert.deepEqual(r.wrong, [], "wrong names:\n" + r.wrong.join("\n"));
  assert.deepEqual(r.missed, [], "misses:\n" + r.missed.join("\n"));
});
test("adversarial scenarios, fifth set (0.14.2, a second independent review: absent subjects, reported speech, prayers, hand-overs, odd callings, co-hosts, the model pushing a mention, voices taken for the host, absence words, captions): no wrong name, and no miss beyond the accepted ones", async () => {
  const r = await runAll(fifth, null, null, 5);
  assert.ok(r.count >= 80, "the whole set ran: " + r.count);
  assert.deepEqual(r.wrong, [], "wrong names:\n" + r.wrong.join("\n"));
  assert.deepEqual(r.missed, [], "misses:\n" + r.missed.join("\n"));
});
test("adversarial scenarios, sixth set (0.14.2, a third independent review: rewordings of the fifth set's traps, and 28 ordinary openings that must keep their names): no wrong name, and no miss beyond the accepted ones", async () => {
  const r = await runAll(sixth, null, null, 6);
  assert.ok(r.count >= 72, "the whole set ran: " + r.count);
  assert.deepEqual(r.wrong, [], "wrong names:\n" + r.wrong.join("\n"));
  assert.deepEqual(r.missed, [], "misses:\n" + r.missed.join("\n"));
});
test("adversarial scenarios, seventh set (0.14.2, a fourth independent review), read by both readers: with a model's recorded answer to each prompt, no wrong name and no miss", async () => {
  // the two readers together: the app's checks of every clue, and the model's reading of the conversation, which meets
  // the attacks reworded to slip past the app's lists of words (the people a listing names who are not in the
  // conversation, stand-ins, stories told, callers and co-hosts who share a guest's first name)
  assert.equal(Object.keys(seventhAnswers).length, seventh.S.length, "an answer for every scenario");
  const r = await runAll(seventh, seventhAnswers, null, 7);
  assert.ok(r.count >= 70, "the whole set ran: " + r.count);
  assert.deepEqual(r.wrong, [], "wrong names:\n" + r.wrong.join("\n"));
  assert.deepEqual(r.missed, [], "misses:\n" + r.missed.join("\n"));
});
test("adversarial scenarios, seventh set, the app's reading alone: the ordinary openings keep their names (a guest only the episode's title names, under a GUEST label, waits for the model)", async () => {
  // (alone, the app still gives wrong names on many of the set's reworded attacks; that is why the model's reading is
  // asked for, and why its answer can hold a name back)
  const r = await runAll(seventh, null, sc => /^R\d/.test(sc.id));
  assert.deepEqual(r.wrong, [], "wrong names:\n" + r.wrong.join("\n"));
  assert.deepEqual(r.missed, ["R9 GUEST: got null, expected \"Dana Reyes\" — " + seventh.S.find(sc => sc.id === "R9").title], "misses");
});
/* Misses the two readers accept on the black-box sets, each with its reason: the safe failures left. */
const BLIND_ACCEPTED = {
  "8 T20": "a rebroadcast of a founder who has died: the listing says so, and the dead are placed only by a voice naming itself",
  "10 L14": "a host who jokes that he is not himself (“I'm not Bob, … it's me, it's Bob”): the denial and the joke speak against the name",
  "10 L15": "the model's reading leaves the voice unnamed (the other listed guest is said to be stuck in traffic; only elimination would name her)",
  // (0.14.5: hosts the listing gives only as a publisher named after them, whom nobody names: the second reading cannot tell)
  "9 G8 SPEAKER 1": "the host is known only from the publisher's name (\u201c… Media\u201d), and the second reading cannot tell whether the voice that opens the show is that person",
  "10 K5 SPEAKER 1": "the host is known only from the publisher's name, and the second reading cannot tell",
  "10 K16 HOST": "the host is known only from the publisher's name (\u201c… Studios\u201d), and the second reading cannot tell",
  "10 K18 SPEAKER 1": "the host is known only from the publisher's name (\u201c… Network\u201d), and the second reading cannot tell",
};
for (const { n, set, answers } of blind) {
  test("black-box review " + n + " (" + set.S.length + " scenarios), read by both readers with a model's recorded answers: no wrong name, and no miss beyond the accepted ones", async () => {
    assert.equal(Object.keys(answers).length, set.S.length, "an answer for every scenario");
    const r = await runAll(set, answers, null, n);
    assert.deepEqual(r.wrong, [], "wrong names:\n" + r.wrong.join("\n"));
    // (an acceptance names a scenario, or one voice of it)
    const missed = r.missed.filter(l => { const head = l.split(":")[0]; return !BLIND_ACCEPTED[n + " " + head] && !BLIND_ACCEPTED[n + " " + head.split(" ")[0]]; });
    assert.deepEqual(missed, [], "misses:\n" + missed.join("\n"));
  });
}
test("long input stays fast: a caption turn of 30,000 words and 5,000 short turns are each identified in seconds", async () => {
  const fill = "the numbers moved again ".repeat(3);
  const t0 = Date.now();
  await identify({ L: first.L0, lines: ["SPEAKER 1: " + ("i'm walt brannigan and joining us now marcus delacroix last week " + fill).repeat(1500), "SPEAKER 2: thanks for having me " + "and so on ".repeat(200)] });
  const t1 = Date.now();
  await identify({ L: first.L0, lines: Array.from({ length: 5000 }, (_, i) => "SPEAKER " + (i % 2 + 1) + ": " + (i % 2 ? "Marcus, what about steel? Thanks, Walt." : "Thanks for having me, Walt. It worked.")) });
  const t2 = Date.now();
  assert.ok(t1 - t0 < 15000, "caption turn: " + (t1 - t0) + " ms"); assert.ok(t2 - t1 < 15000, "short turns: " + (t2 - t1) + " ms");
  // the patterns that once backtracked without end: a comma before a long unbroken lower-case run, and greetings repeated
  const t3 = Date.now();
  await identify({ L: {}, lines: ["SPEAKER 1: Tonight, " + "a".repeat(80) + " Dana Reyes joins us.", "SPEAKER 2: Thanks for having me. " + "Hello ".repeat(80) + "this is fine."] });
  assert.ok(Date.now() - t3 < 3000, "pathological runs: " + (Date.now() - t3) + " ms");
});
