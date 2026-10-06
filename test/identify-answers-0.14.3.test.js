"use strict";
/* 0.14.3: the model's answer is checked before it is used. A review of 0.14.2 found two ways into one failure: after two
   answers that could not be read, and after an answer that gave no decision at all ("{}"), with no retry and no notice,
   the voices were left to the app's own rules alone. Those rules gave 25 wrong names on 70 adversarial scenarios, and in
   a full reading a stand-in host was named as the absent regular host while the run finished as if nothing had happened.
   These tests pin the repair: every voice being identified must be accounted for, exactly once, named with quoted words
   that show it or left unnamed; an empty, malformed, incomplete or contradictory answer is asked for once more, told what
   was wrong; a voice still without a usable decision keeps its number, with the reason, and the reading goes on; names a
   transcript or a person gave are never asked about and never change. Invented people and shows; no real transcript. */
const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../server/identify");
const { pad } = require("./fixtures/identify-pad");
const { HOST, GUEST, APPLE_LINK, SAID, KEY, chainFetch, scriptedAI, server, fromLink, nameOf, assertNamed } = require("./fixtures/straight-talk");

const KEEPS = ". It keeps its number; the app does not name a voice on its own reading alone.";
const twice = problem => "Asked twice, the model gave no usable decision for this voice: " + problem + KEEPS;

/* ---------- the check itself ---------- */
const KEYS = new Set(["SPEAKER 1", "SPEAKER 2"]);
const named = (label, name, evidence) => ({ label, name, evidence: evidence || [{ kind: "self_identification", turn: 0, quote: "I'm " + name + "." }] });
const codes = r => Object.fromEntries([...r.unusable].map(([k, u]) => [k, u.code]));

test("an answer counts only when it accounts for every voice: empty, malformed, incomplete and contradictory answers are named for what they are", () => {
  const c = (data, fixed) => I.checkAnswer(data, KEYS, fixed);
  // "{}", and the same with empty lists or a list that is not one: no decision for any voice
  for (const d of [{}, { voices: [], unnamed: [] }, { voices: null, unnamed: "none" }]) {
    const r = c(d);
    assert.deepEqual(r.issues, ["The answer gave no decision for any voice."], JSON.stringify(d));
    assert.equal(r.usable.size, 0); assert.deepEqual(codes(r), { "SPEAKER 1": "empty", "SPEAKER 2": "empty" });
  }
  // not an object at all
  for (const d of [null, [], "SPEAKER 1 is Ana Ferreira", 7]) {
    const r = c(d);
    assert.deepEqual(r.issues, ["The answer was not a JSON object with voices and unnamed."], JSON.stringify(d));
    assert.deepEqual(codes(r), { "SPEAKER 1": "malformed", "SPEAKER 2": "malformed" });
  }
  // a voice left out
  let r = c({ voices: [named("SPEAKER 1", "Ana Ferreira")], unnamed: [] });
  assert.deepEqual(r.issues, ["It did not account for SPEAKER 2."]);
  assert.equal(r.usable.get("SPEAKER 1").name, "Ana Ferreira"); assert.deepEqual(codes(r), { "SPEAKER 2": "omitted" });
  // contradictions: named and unnamed; two names; one person for two voices; a name another voice already has
  r = c({ voices: [named("SPEAKER 1", "Ana Ferreira")], unnamed: [{ label: "SPEAKER 1", why: "not sure" }, { label: "SPEAKER 2", why: "nothing names it" }] });
  assert.deepEqual(r.issues, ["It both named SPEAKER 1 (Ana Ferreira) and listed it as unnamed."]); assert.deepEqual(codes(r), { "SPEAKER 1": "named_and_unnamed" });
  assert.equal(r.usable.get("SPEAKER 2").name, "", "left unnamed is a decision");
  r = c({ voices: [named("SPEAKER 1", "Ana Ferreira"), named("SPEAKER 1", "Rosa Pike")], unnamed: [{ label: "SPEAKER 2", why: "" }] });
  assert.deepEqual(r.issues, ["It gave SPEAKER 1 more than one name (Ana Ferreira, Rosa Pike)."]); assert.deepEqual(codes(r), { "SPEAKER 1": "two_names" });
  r = c({ voices: [named("SPEAKER 1", "Ana Ferreira"), named("SPEAKER 2", "ana ferreira")], unnamed: [] });
  assert.deepEqual(r.issues, ["It gave the same person (Ana Ferreira) to SPEAKER 1 and SPEAKER 2."], "said once, not once per voice");
  assert.deepEqual(codes(r), { "SPEAKER 1": "same_person", "SPEAKER 2": "same_person" }); assert.equal(r.usable.size, 0);
  r = c({ voices: [named("SPEAKER 1", "Ann O'Malley")], unnamed: [{ label: "SPEAKER 2", why: "" }] }, new Map([["ANN O'MALLEY", "Ann O'Malley"]]));
  assert.deepEqual(r.issues, ["It gave SPEAKER 1 the name Ann O'Malley, which ANN O'MALLEY already has."]); assert.deepEqual(codes(r), { "SPEAKER 1": "taken" });
  // a voice under voices with no name, or with a name that is not text
  for (const bad of ["", 42, { first: "Ana" }, null]) {
    r = c({ voices: [named("SPEAKER 1", bad)], unnamed: [{ label: "SPEAKER 2", why: "" }] });
    assert.deepEqual(codes(r), { "SPEAKER 1": "no_name" }, JSON.stringify(bad)); assert.deepEqual(r.issues, ["It listed SPEAKER 1 under voices with no name."]);
  }
  // entries that are not voices at all are skipped, not taken for decisions
  r = c({ voices: [null, "SPEAKER 1", 5, { label: 7 }, named("SPEAKER 1", "Ana Ferreira")], unnamed: [null, { label: null }, { label: "SPEAKER 2" }] });
  assert.deepEqual(r.issues, []); assert.equal(r.usable.size, 2);
  // a name with no words that show it: none, blank, only words to someone else, or a kind the model does not give
  for (const ev of [[], [{ kind: "self_identification", turn: 0, quote: "  " }], [{ kind: "addresses_other", turn: 2, quote: "Thanks, Dana.", addressee: "Dana" }], [{ kind: "listed", turn: null, quote: "Ana Ferreira hosts" }]]) {
    r = c({ voices: [named("SPEAKER 1", "Ana Ferreira", ev)], unnamed: [{ label: "SPEAKER 2", why: "" }] });
    assert.deepEqual(codes(r), { "SPEAKER 1": "no_words" }, JSON.stringify(ev)); assert.match(r.issues[0], /^It named SPEAKER 1 \(Ana Ferreira\) without quoting words that show it/);
  }
  // a complete answer: labels in any case; a title before the name dropped; voices not being identified, and labels not in
  // the conversation, are no concern of the check
  r = c({ voices: [named("speaker 1", "Dr. Ana Ferreira"), named("SPEAKER 9", "Rosa Pike"), named("ANN O'MALLEY", "Rosa Pike")], unnamed: [{ label: "Speaker 2", why: "nothing names it" }] });
  assert.deepEqual(r.issues, []); assert.equal(r.usable.get("SPEAKER 1").name, "Ana Ferreira"); assert.equal(r.usable.get("SPEAKER 2").name, ""); assert.equal(r.unusable.size, 0);
});

/* ---------- the whole step, with a fake store and a scripted provider ---------- */
const NIGHT = ["SPEAKER 1: Welcome to Night Desk. I'm Ana Ferreira." + pad(2) + " Joining me now, Dana Reyes. Dana, thanks for coming in.",
  "SPEAKER 2: Thanks for having me, Ana." + pad(2), "SPEAKER 1: What did the survey find?", "SPEAKER 2: Four hundred households answered it." + pad(2)];
const NIGHT_L = { show: "Night Desk", author: "Ironvale Media", title: "Survey season — Dana Reyes" };
const ANA = named("SPEAKER 1", "Ana Ferreira", [{ kind: "self_identification", turn: 0, quote: "I'm Ana Ferreira." }]);
const DANA = named("SPEAKER 2", "Dana Reyes", [{ kind: "introduced", turn: 0, quote: "Joining me now, Dana Reyes." }]);
const GOOD = () => ({ voices: [ANA, DANA], unnamed: [] });
const fail = code => ({ fail: code });
/* answers: one per call, in order (the last repeats); { fail: code } throws an error with that code, as the provider's
   client does for an answer it cannot read ("invalid_json", "truncated") or a request that fails ("upstream_error"). */
async function step(answers, opts) {
  opts = opts || {};
  const L = opts.L || NIGHT_L, lines = opts.lines || NIGHT;
  const run = Object.assign({ id: "run_143", kind: "transcript", parseMode: "text", input: { sha256: "h" }, speakers: [], provenance: {}, title: "", sourceLabel: "",
    import: { showInfo: { name: L.show, author: L.author || "", artist: L.artist || "", persons: [] }, episodeInfo: { title: L.title || "", description: L.notes || "", persons: [] } } }, opts.run || {});
  const calls = [];
  const store = { bundle: async () => ({ run, transcript: lines.join("\n"), attrSig: "a0-0" }), captureCallBasis: async () => ({}), recordCall: async (id, c) => { calls.push(c); } };
  const prompts = [];
  const ai = { kind: opts.kind || "anthropic", model: "scripted", mock: !!opts.mock, async sample({ prompt }) {
    prompts.push(prompt);
    const a = answers[Math.min(prompts.length - 1, answers.length - 1)], data = typeof a === "function" ? a(prompt) : a;
    if (data && data.fail) throw Object.assign(new Error("scripted " + data.fail), { code: data.fail });
    return { data: JSON.parse(JSON.stringify(data === undefined ? null : data)), text: JSON.stringify(data), model: "scripted", requestId: "r" + prompts.length, stopReason: "end_turn", usage: null };
  } };
  const out = await I.identifySpeakers({ ai, store, id: run.id, signal: opts.signal });
  const name = k => (out.record.decisions.find(d => d.key === k) || {}).name || null;
  const why = k => (out.record.unnamed.find(u => u.key === k) || {}).why;
  return { out, record: out.record, name, why, prompts, calls };
}

test("“{}” twice: asked once more, told what was wrong; then every voice keeps its number with the reason, and the app's own reading does not stand in", async () => {
  const r = await step([{}, {}]);
  assert.equal(r.prompts.length, 2, "one repair, no more");
  assert.ok(r.prompts[1].startsWith(r.prompts[0]), "the repair is the same request");
  assert.match(r.prompts[1].slice(r.prompts[0].length), /^\n\nYOUR PREVIOUS ANSWER COULD NOT BE USED:\n- The answer gave no decision for any voice\.\nAnswer again with the complete JSON object\. Account for every voice listed under VOICES that is not already named, each exactly once/);
  assert.equal(r.name("SPEAKER 1"), null); assert.equal(r.name("SPEAKER 2"), null);
  for (const k of ["SPEAKER 1", "SPEAKER 2"]) assert.equal(r.why(k), twice("its answer gave no decision for any voice"));
  assert.deepEqual(r.record.answerChecks, [{ attempt: 1, issues: ["The answer gave no decision for any voice."] }, { attempt: 2, issues: ["The answer gave no decision for any voice."] }]);
  assert.equal(r.record.modelWhy, "Asked twice, the model gave no usable decision for any voice, so every voice keeps its number; the app does not name a voice on its own reading alone.");
  assert.match(r.record.method, /The model's answer was checked before it was used/); assert.ok(r.record.method.endsWith(r.record.modelWhy));
  assert.deepEqual(r.out.speakers.map(s => [s.key, s.name]), [["SPEAKER 1", "Speaker 1"], ["SPEAKER 2", "Speaker 2"]]);
  // both calls are on the record, the second marked as the repair
  assert.deepEqual(r.calls.map(c => [c.purpose, !!c.repair]), [["identify_speakers", false], ["identify_speakers", true]]);
  assert.equal(r.record.calls.length, 2);
  // the app's own reading would name both voices here, rightly; it still does not decide on its own
  const alone = await I.appReading({ store: { bundle: async () => ({ run: { id: "run_143", kind: "transcript", parseMode: "text", input: { sha256: "h" }, speakers: [], provenance: {}, import: { showInfo: { name: "Night Desk", author: "Ironvale Media", persons: [] }, episodeInfo: { title: NIGHT_L.title, description: "", persons: [] } } }, transcript: NIGHT.join("\n"), attrSig: "a0-0" }), captureCallBasis: async () => ({}), recordCall: async () => {} }, id: "run_143" });
  assert.deepEqual(alone.record.decisions.map(d => [d.key, d.name]).sort(), [["SPEAKER 1", "Ana Ferreira"], ["SPEAKER 2", "Dana Reyes"]]);
});

test("“{}” and then a complete answer: the repaired answer is used", async () => {
  const r = await step([{}, GOOD()]);
  assert.equal(r.prompts.length, 2);
  assert.equal(r.name("SPEAKER 1"), "Ana Ferreira"); assert.equal(r.name("SPEAKER 2"), "Dana Reyes");
  assert.deepEqual(r.record.answerChecks, [{ attempt: 1, issues: ["The answer gave no decision for any voice."] }, { attempt: 2, issues: [] }]);
  assert.equal(r.record.modelWhy, undefined);
  // a complete first answer is not asked for again
  const once = await step([GOOD()]);
  assert.equal(once.prompts.length, 1); assert.deepEqual(once.record.answerChecks, [{ attempt: 1, issues: [] }]);
  assert.equal(once.name("SPEAKER 1"), "Ana Ferreira"); assert.equal(once.name("SPEAKER 2"), "Dana Reyes");
});

test("a voice left out: asked about again; still left out, it keeps its number with why, and the voices the answer did decide are named", async () => {
  const r = await step([{ voices: [ANA], unnamed: [] }]);
  assert.equal(r.prompts.length, 2);
  assert.match(r.prompts[1], /YOUR PREVIOUS ANSWER COULD NOT BE USED:\n- It did not account for SPEAKER 2\.\n/);
  assert.equal(r.name("SPEAKER 1"), "Ana Ferreira");
  assert.equal(r.name("SPEAKER 2"), null); assert.equal(r.why("SPEAKER 2"), twice("its answer did not account for this voice"));
  assert.deepEqual(r.record.answerChecks.map(c => c.issues), [["It did not account for SPEAKER 2."], ["It did not account for SPEAKER 2."]]);
  assert.equal(r.record.modelWhy, undefined, "some voices were decided");
  // left out once, then given: both named
  const fixed = await step([{ voices: [ANA], unnamed: [] }, GOOD()]);
  assert.equal(fixed.name("SPEAKER 1"), "Ana Ferreira"); assert.equal(fixed.name("SPEAKER 2"), "Dana Reyes");
  // left out, and the answer when asked again could not be read: the first answer's decisions stand, and the reason says both
  const lost = await step([{ voices: [ANA], unnamed: [] }, fail("invalid_json")]);
  assert.equal(lost.name("SPEAKER 1"), "Ana Ferreira"); assert.equal(lost.name("SPEAKER 2"), null);
  assert.equal(lost.why("SPEAKER 2"), "The model gave no usable decision for this voice: its answer did not account for this voice, and asking again got an answer that could not be read" + KEEPS);
  assert.deepEqual(lost.record.answerChecks.map(c => c.issues), [["It did not account for SPEAKER 2."], ["The answer was not well-formed JSON."]]);
});

test("contradictory answers, twice: each voice they leave without a usable decision keeps its number, with what was wrong", async () => {
  // named and unnamed
  let r = await step([{ voices: [ANA, DANA], unnamed: [{ label: "SPEAKER 2", why: "not sure" }] }]);
  assert.equal(r.prompts.length, 2); assert.equal(r.name("SPEAKER 1"), "Ana Ferreira"); assert.equal(r.name("SPEAKER 2"), null);
  assert.equal(r.why("SPEAKER 2"), twice("its answer both named this voice (Dana Reyes) and left it unnamed"));
  // two names for one voice
  r = await step([{ voices: [ANA, DANA, named("SPEAKER 2", "Rosa Pike")], unnamed: [] }]);
  assert.equal(r.name("SPEAKER 2"), null); assert.equal(r.why("SPEAKER 2"), twice("its answer gave this voice more than one name (Dana Reyes, Rosa Pike)"));
  // one person for two voices: neither
  r = await step([{ voices: [ANA, named("SPEAKER 2", "Ana Ferreira", [{ kind: "addressed", turn: 1, quote: "Thanks for having me, Ana." }])], unnamed: [] }]);
  assert.equal(r.name("SPEAKER 1"), null); assert.equal(r.name("SPEAKER 2"), null);
  assert.equal(r.why("SPEAKER 1"), twice("its answer gave the same person (Ana Ferreira) to this voice and to Speaker 2"));
  assert.equal(r.why("SPEAKER 2"), twice("its answer gave the same person (Ana Ferreira) to this voice and to Speaker 1"));
  // named with no words that show it
  r = await step([{ voices: [ANA, named("SPEAKER 2", "Dana Reyes", [])], unnamed: [] }]);
  assert.equal(r.name("SPEAKER 2"), null); assert.equal(r.why("SPEAKER 2"), twice("its answer named this voice Dana Reyes without quoting words that show it"));
  // a voice under voices with no name
  r = await step([{ voices: [ANA, named("SPEAKER 2", "")], unnamed: [] }]);
  assert.equal(r.name("SPEAKER 2"), null); assert.equal(r.why("SPEAKER 2"), twice("its answer listed this voice with no name"));
  // the two answers decide a voice differently: neither decision is used
  r = await step([{ voices: [ANA], unnamed: [] }, { voices: [DANA], unnamed: [{ label: "SPEAKER 1", why: "could be the producer" }] }]);
  assert.equal(r.name("SPEAKER 1"), null); assert.equal(r.why("SPEAKER 1"), twice("its two answers decide this voice differently (Ana Ferreira, then unnamed)"));
  assert.equal(r.name("SPEAKER 2"), "Dana Reyes");
  // and a second answer that swaps the voices names no one wrongly: the swapped decision for one voice is dropped, and
  // the other's quoted words do not hold up for it
  r = await step([{ voices: [ANA], unnamed: [] }, { voices: [named("SPEAKER 1", "Dana Reyes", [{ kind: "introduced", turn: 0, quote: "Joining me now, Dana Reyes." }]), named("SPEAKER 2", "Ana Ferreira", [{ kind: "addressed", turn: 1, quote: "Thanks for having me, Ana." }])], unnamed: [] }]);
  assert.equal(r.name("SPEAKER 1"), null); assert.equal(r.name("SPEAKER 2"), null);
  assert.equal(r.why("SPEAKER 1"), twice("its two answers decide this voice differently (Ana Ferreira, then Dana Reyes)"));
  assert.match(r.why("SPEAKER 2"), /^The model's answer names Ana Ferreira for this voice, but its clue did not hold up: “Thanks for having me, Ana\.” \([^)]+\); the app's reading points to Dana Reyes instead, and a name is given only where both readings agree\.$/);
  // the same person in a fuller form when asked again is one decision, not two
  r = await step([{ voices: [named("SPEAKER 1", "Ana", [{ kind: "self_identification", turn: 0, quote: "I'm Ana Ferreira." }])], unnamed: [] }, GOOD()]);
  assert.equal(r.name("SPEAKER 1"), "Ana Ferreira"); assert.equal(r.name("SPEAKER 2"), "Dana Reyes");
  // a contradiction repaired: used
  r = await step([{ voices: [ANA, named("SPEAKER 2", "Ana Ferreira", [{ kind: "addressed", turn: 1, quote: "Thanks for having me, Ana." }])], unnamed: [] }, GOOD()]);
  assert.equal(r.name("SPEAKER 1"), "Ana Ferreira"); assert.equal(r.name("SPEAKER 2"), "Dana Reyes");
});

test("answers that cannot be read: asked once more; twice unreadable, every voice keeps its number with the reason, and the step goes on", async () => {
  const r = await step([fail("invalid_json"), fail("truncated")]);
  assert.equal(r.prompts.length, 2);
  assert.equal(r.name("SPEAKER 1"), null); assert.equal(r.name("SPEAKER 2"), null);
  for (const k of ["SPEAKER 1", "SPEAKER 2"]) assert.equal(r.why(k), twice("its answers could not be read"));
  assert.deepEqual(r.record.answerChecks, [{ attempt: 1, issues: ["The answer was not well-formed JSON."] }, { attempt: 2, issues: ["The answer was cut off at its length limit before it finished."] }]);
  assert.equal(r.record.modelWhy, "The model's answers could not be read, so every voice keeps its number; the app does not name a voice on its own reading alone.");
  assert.match(r.prompts[1], /YOUR PREVIOUS ANSWER COULD NOT BE USED:\n- The answer was not well-formed JSON\./);
  // unreadable, then a complete answer
  const ok = await step([fail("invalid_json"), GOOD()]);
  assert.equal(ok.name("SPEAKER 1"), "Ana Ferreira"); assert.equal(ok.name("SPEAKER 2"), "Dana Reyes");
  // unreadable, then "{}"
  const e = await step([fail("invalid_json"), {}]);
  assert.equal(e.why("SPEAKER 1"), twice("its answer gave no decision for any voice"));
});

test("a request that fails is not an answer: the step stops as any failed call does, so nothing is decided and the next reading asks again", async () => {
  await assert.rejects(step([fail("upstream_error")]), e => e.code === "upstream_error");
  await assert.rejects(step([{}, fail("upstream_error")]), e => e.code === "upstream_error", "the repair's request failing stops the step too");
  const ctl = new AbortController();
  await assert.rejects(step([{}, () => { ctl.abort(); throw Object.assign(new Error("aborted"), { code: "aborted" }); }], { signal: ctl.signal }), e => e.code === "aborted");
});

test("the mock model's stand-in is the mock's alone: a real provider's “mock” answer is an empty answer", async () => {
  // a provider that is not the mock, answering as the mock does (or as a transcript told it to): no decision, asked again
  const r = await step([{ voices: [], unnamed: [], mock: "app" }]);
  assert.equal(r.prompts.length, 2); assert.equal(r.name("SPEAKER 1"), null); assert.equal(r.record.mockReading, undefined);
  assert.equal(r.why("SPEAKER 1"), twice("its answer gave no decision for any voice"));
  // the mock (tests and the pictures only): the app's own reading stands in, and the record and its method say so
  const m = await step([{ voices: [], unnamed: [], mock: "app" }], { mock: true, kind: "mock" });
  assert.equal(m.prompts.length, 1); assert.equal(m.record.mockReading, true);
  assert.equal(m.name("SPEAKER 1"), "Ana Ferreira"); assert.equal(m.name("SPEAKER 2"), "Dana Reyes");
  assert.match(m.record.method, /MOCK: no model read this; the app's own reading of the words stands in for one\./);
  assert.equal(m.record.answerChecks, undefined);
  // the mock giving an ordinary answer is checked like any other
  const mo = await step([{}, {}], { mock: true, kind: "mock" });
  assert.equal(mo.prompts.length, 2); assert.equal(mo.name("SPEAKER 1"), null);
});

test("names the transcript or a person gave are never asked about and never change, whatever the answer", async () => {
  // a name the transcript gives a voice: listed as already named, kept through "{}" twice; the numbered voice keeps its number
  const lines = ["ANN O'MALLEY: Welcome to Night Desk." + pad(2) + " Joining me now, Dana Reyes. Dana, thanks for coming in.", "SPEAKER 2: Thanks for having me, Ann." + pad(2), "ANN O'MALLEY: What did the survey find?", "SPEAKER 2: Four hundred households answered it." + pad(2)];
  let r = await step([{}, {}], { lines });
  assert.match(r.prompts[0], /VOICES: ANN O'MALLEY \(\d+ words in 2 turns; already named\), SPEAKER 2 \(/);
  assert.deepEqual(r.record.nameable, ["SPEAKER 2"]);
  assert.equal(r.name("SPEAKER 2"), null); assert.equal(r.why("SPEAKER 2"), twice("its answer gave no decision for any voice"));
  assert.ok(!r.out.speakers.some(s => s.key === "ANN O'MALLEY" && s.name === "Speaker 1"));
  // an answer renaming the named voice is not about a voice being identified: ignored; giving the numbered voice the named
  // voice's name contradicts the transcript, and is asked about once more
  r = await step([{ voices: [named("ANN O'MALLEY", "Rosa Pike"), named("SPEAKER 2", "Ann O'Malley", [{ kind: "addressed", turn: 1, quote: "Thanks for having me, Ann." }])], unnamed: [] }], { lines });
  assert.equal(r.prompts.length, 2); assert.match(r.prompts[1], /- It gave SPEAKER 2 the name Ann O'Malley, which ANN O'MALLEY already has\./);
  assert.equal(r.name("SPEAKER 2"), null); assert.equal(r.why("SPEAKER 2"), twice("its answer gave this voice the name Ann O'Malley, which the transcript or a person already gives another voice"));
  assert.ok(!r.record.decisions.some(d => d.key === "ANN O'MALLEY"));
  // and with a complete answer the numbered voice is named; the transcript's name stays
  r = await step([{ voices: [named("SPEAKER 2", "Dana Reyes", [{ kind: "introduced", turn: 0, quote: "Joining me now, Dana Reyes." }])], unnamed: [] }], { lines });
  assert.equal(r.prompts.length, 1); assert.equal(r.name("SPEAKER 2"), "Dana Reyes");
  // a name a person gave: not asked about, kept through "{}" twice
  const run = { speakers: [{ key: "SPEAKER 1", name: "Ana F.", bio: "" }, { key: "SPEAKER 2", name: "Speaker 2", bio: "" }], provenance: { namesByPerson: { "SPEAKER 1": "Ana F." } } };
  r = await step([{}, {}], { run });
  assert.deepEqual(r.record.nameable, ["SPEAKER 2"]); assert.match(r.prompts[0], /SPEAKER 1 \(\d+ words in 2 turns; already named\)/);
  assert.deepEqual(r.out.speakers.map(s => [s.key, s.name]), [["SPEAKER 1", "Ana F."], ["SPEAKER 2", "Speaker 2"]]);
  // nothing to identify: no call at all
  const all = { speakers: [{ key: "SPEAKER 1", name: "Ana F.", bio: "" }, { key: "SPEAKER 2", name: "Dee R.", bio: "" }], provenance: { namesByPerson: { "SPEAKER 1": "Ana F.", "SPEAKER 2": "Dee R." } } };
  r = await step([{}], { run: all });
  assert.equal(r.prompts.length, 0); assert.deepEqual(r.out.speakers.map(s => s.name), ["Ana F.", "Dee R."]);
});

test("a name found when the speakers were worked out from the words (a model's pass of its own, reviewed and checked) stands where the answer gives no decision, and gives way where it decides otherwise", async () => {
  const run = { speakers: [{ key: "SPEAKER 1", name: "Speaker 1", bio: "" }, { key: "SPEAKER 2", name: "Dana Reyes", bio: "" }],
    provenance: { structure: { names: [{ key: "SPEAKER 2", name: "Dana Reyes", kind: "introduced_by_name", quote: "Joining me now, Dana Reyes.", applied: true }] } } };
  let r = await step([{}, {}], { run });
  assert.deepEqual(r.record.nameable, ["SPEAKER 1", "SPEAKER 2"], "a name the app's passes gave is asked about again");
  assert.equal(r.name("SPEAKER 2"), "Dana Reyes"); assert.deepEqual(r.record.decisions.find(d => d.key === "SPEAKER 2").kinds, ["words"]);
  assert.match(r.record.decisions.find(d => d.key === "SPEAKER 2").how, /^named when the speakers were worked out from the words \(introduced by name\): “Joining me now, Dana Reyes\.”/);
  assert.equal(r.name("SPEAKER 1"), null); assert.equal(r.why("SPEAKER 1"), twice("its answer gave no decision for any voice"));
  // the answer leaves that voice unnamed: the earlier name gives way, with why
  r = await step([{ voices: [ANA], unnamed: [{ label: "SPEAKER 2", why: "not sure this is the guest" }] }], { run });
  assert.equal(r.name("SPEAKER 1"), "Ana Ferreira"); assert.equal(r.name("SPEAKER 2"), null);
  assert.match(r.why("SPEAKER 2"), /^The app's reading points to Dana Reyes, but the model's reading of the conversation does not name Dana Reyes for this voice \(not sure this is the guest\)/);
  assert.deepEqual(r.out.speakers.map(s => [s.key, s.name]), [["SPEAKER 1", "Ana Ferreira"], ["SPEAKER 2", "Speaker 2"]]);
  // and the answer naming the same person: named
  r = await step([GOOD()], { run });
  assert.equal(r.name("SPEAKER 2"), "Dana Reyes");
});

test("a saved identification whose names came from the app's reading alone is identified again at the next reading; once", () => {
  const run = (id, speakers, extra) => Object.assign({ kind: "transcript", parseMode: "text", input: { sha256: "h1" }, speakers: speakers || [{ key: "SPEAKER 1", name: "Ana Ferreira" }, { key: "SPEAKER 2", name: "Dana Reyes" }], provenance: Object.assign({ overrides: {}, identification: id }, extra) });
  const b = r => ({ run: r, transcript: "SPEAKER 1: Hello there, friends.\nSPEAKER 2: Hello to you.", attrSig: "a1" });
  const base = { inputHash: "h1", attrSig: "a1", unnamed: [], decisions: [{ key: "SPEAKER 1", name: "Ana Ferreira", kinds: ["self_identification"] }, { key: "SPEAKER 2", name: "Dana Reyes", kinds: ["introduced"] }] };
  const modelEv = [{ key: "SPEAKER 1", source: "app+model" }, { key: "SPEAKER 2", source: "model" }];
  // 0.14.2: names with no clue of the model's behind them, or an answer that could not be read twice
  assert.equal(I.needsIdentification(b(run(Object.assign({}, base, { version: 2, evidence: [{ key: "SPEAKER 1", source: "app" }, { key: "SPEAKER 2", source: "model" }] })))), true, "one name from the app alone");
  assert.equal(I.needsIdentification(b(run(Object.assign({}, base, { version: 2, evidence: modelEv, modelWhy: "The model's answer could not be read…" })))), true);
  assert.equal(I.needsIdentification(b(run(Object.assign({}, base, { version: 2, evidence: modelEv })))), false, "every name with the model's clue behind it");
  // a guest the listing names, paired by both readers, and a name from the words when the speakers were worked out
  assert.equal(I.needsIdentification(b(run(Object.assign({}, base, { version: 2, evidence: [], decisions: [{ key: "SPEAKER 1", name: "Ana Ferreira", kinds: ["listing"] }, { key: "SPEAKER 2", name: "Dana Reyes", kinds: ["words"] }] })))), false);
  // 0.14.0 and 0.14.1 (no version): names the app gave on its own are identified again too
  assert.equal(I.needsIdentification(b(run(Object.assign({}, base, { evidence: [{ key: "SPEAKER 1", source: "app" }, { key: "SPEAKER 2", source: "app" }] })))), true);
  // this version's record: once per text and labels, even with voices left numbered
  assert.equal(I.needsIdentification(b(run(Object.assign({}, base, { version: I.IDENTIFY_VERSION, evidence: [], decisions: [], unnamed: [{ key: "SPEAKER 1", why: "x" }, { key: "SPEAKER 2", why: "x" }] }), [{ key: "SPEAKER 1", name: "Speaker 1" }, { key: "SPEAKER 2", name: "Speaker 2" }]))), false);
  assert.equal(I.IDENTIFY_VERSION, 3);
  // a person's names stay, whatever the record
  assert.equal(I.needsIdentification(b(run(Object.assign({}, base, { version: 2, evidence: [] }), [{ key: "SPEAKER 1", name: "Ann" }, { key: "SPEAKER 2", name: "Bo" }], { namesByPerson: { "SPEAKER 1": "Ann", "SPEAKER 2": "Bo" } }))), false);
});

/* ---------- the stand-in host, through the whole reading ---------- */
/* The review's example: the regular host is away and a stand-in opens the show, in words the app's rules for absence do
   not hold ("The fellow whose name is on the show is at his granddaughter's christening"). The listing names the regular
   host. The app's rules alone name the stand-in as him; the model, asked about every voice, either answers usably or the
   voice keeps its number. */
const STAND_IN = [[0, "From the studios in New York, this is the Straight Talk Hour."],
  [1, "Good evening and welcome to the Straight Talk Hour. The fellow whose name is on the show is at his granddaughter's christening in Ohio this week, so I'm minding the store until Monday."],
  SAID[2], [2, "Thanks for having me. It's good to be back."]].concat(SAID.slice(4));
const DG = { DEEPGRAM_API_KEY: KEY, TRANSCRIBE_PREFER: "cloud" };
// (the turn a voice says something in, as the prompt numbers it: a voice's consecutive turns are one)
const turnOf = (p, label, words) => Number(new RegExp("\\[(\\d+)\\] " + label + ": [^\\n]*" + words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).exec(p)[1]);

for (const [what, answer] of [["“{}” twice", () => ({})], ["two answers that cannot be read", () => ({ throw: true })]]) {
  test("the stand-in host, " + what + ": the reading completes, the stand-in is never given the absent host's name, and every card and export shows the number with the reason", async t => {
    const ai = scriptedAI({ identify: answer });
    const f = await server(t, { ai, fetch: chainFetch(STAND_IN), env: DG });
    const b = await fromLink(f, APPLE_LINK);
    // the app's rules alone, on this very run, name the stand-in as the absent host: what 0.14.2 fell back to (if they ever
    // stop doing so, choose wording they still get wrong: the point is that preparation never falls back to them)
    const alone = await I.appReading({ store: f.store, id: b.run.id });
    assert.equal((alone.record.decisions.find(d => d.key === "SPEAKER 2") || {}).name, HOST, "precondition: the app's rules alone misname the stand-in");
    // preparation: asked twice, then numbered, with why; the reading went on and finished
    assert.equal(ai.prompts.filter(p => p.startsWith("Who is each voice in this conversation?")).length, 2);
    const id = b.run.provenance.identification;
    assert.equal(nameOf(b, "SPEAKER 2"), "Speaker 2"); assert.equal(nameOf(b, "SPEAKER 3"), "Speaker 3");
    assert.deepEqual(id.decisions, []);
    const problem = what === "“{}” twice" ? "its answer gave no decision for any voice" : "its answers could not be read";
    assert.equal(id.unnamed.find(u => u.key === "SPEAKER 2").why, twice(problem));
    assert.deepEqual(id.answerChecks.map(c => c.attempt), [1, 2]); assert.ok(id.modelWhy);
    assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
    assert.ok(b.passages.length && b.passages.every(p => p.readingGate.status === "ready"), JSON.stringify(b.passages.map(p => p.readingGate)));
    // the readings were told the numbers, not the absent host's name
    const reading = ai.prompts.find(p => p.startsWith("Help a reader understand this passage accurately."));
    assert.match(reading, /- SPEAKER 2 \(Speaker 2\)/); assert.doesNotMatch(reading, new RegExp(HOST));
    // every place a name is shown: the speakers, the quotes, the claims, the passages' speaker lines, the obligations
    const md = (await f.api("GET", "/api/runs/" + b.run.id + "/export.md?level=hs")).data;
    const ex = (await f.api("GET", "/api/runs/" + b.run.id + "/export.json")).data;
    const ob = (await f.api("GET", "/api/runs/" + b.run.id + "/obligations.json")).data;
    assert.doesNotMatch(md, new RegExp(HOST + " \\(Speaker 2\\)|^> " + HOST + ":", "m"));
    assert.ok(md.includes("- Speaker 2: Not identified. " + twice(problem)), md.split("\n").filter(l => /Speaker 2/.test(l)).join("\n"));
    assert.ok(ex.claims.every(c => c.speaker !== HOST), JSON.stringify(ex.claims.map(c => [c.speakerKey, c.speaker])));
    assert.ok(ex.passages.every(p => p.speakerNames.every(n => n !== HOST)));
    assert.ok(ex.passages.every(p => p.quotes.every(q => q.speaker !== HOST)));
    assert.ok(ex.passages.some(p => p.speakerNames.includes("Speaker 2")), "a passage's speakers show the stand-in's number");
    assert.match(md, /^_Speaker 1, Speaker 2, Speaker 3_$/m);
    assert.deepEqual(ex.run.speakers.filter(s => s.inText).map(s => [s.key, s.name, s.namedBy]), [["SPEAKER 1", "Speaker 1", "unnamed"], ["SPEAKER 2", "Speaker 2", "unnamed"], ["SPEAKER 3", "Speaker 3", "unnamed"], ["AD 1", "Advertisement 1", "set_apart"]]);
    assert.ok(ob.obligations.every(o => o.speaker_name !== HOST));
  });
}

test("the stand-in host, with a usable answer: the stand-in left unnamed keeps its number, the guest is named everywhere; the app's reading of the stand-in is held back with why", async t => {
  const ai = scriptedAI({ identify: p => ({ voices: [
    { label: "SPEAKER 3", name: GUEST, evidence: [{ kind: "introduced", turn: turnOf(p, "SPEAKER 2", "Joining us now"), quote: "Joining us now from Washington, Marcus Delacroix, former trade adviser." }] }],
  unnamed: [{ label: "SPEAKER 1", why: "an announcer who names no one" }, { label: "SPEAKER 2", why: "a stand-in: the regular host is away this week and the stand-in never says a name" }] }) });
  const f = await server(t, { ai, fetch: chainFetch(STAND_IN), env: DG });
  const b = await fromLink(f, APPLE_LINK);
  assert.equal(ai.prompts.filter(p => p.startsWith("Who is each voice in this conversation?")).length, 1);
  const id = b.run.provenance.identification;
  assert.deepEqual(id.answerChecks, [{ attempt: 1, issues: [] }]);
  assert.equal(nameOf(b, "SPEAKER 2"), "Speaker 2");
  assert.match(id.unnamed.find(u => u.key === "SPEAKER 2").why, /^The app's reading points to Walt Brannigan, but the model's reading of the conversation does not name Walt Brannigan for this voice \(a stand-in: the regular host is away this week/);
  const md = (await f.api("GET", "/api/runs/" + b.run.id + "/export.md?level=hs")).data, ex = (await f.api("GET", "/api/runs/" + b.run.id + "/export.json")).data;
  assertNamed(b, md, ex, ["SPEAKER 3"], [GUEST]);
  assert.doesNotMatch(md, new RegExp(HOST + " \\(Speaker 2\\)"));
  assert.ok(b.passages.length && b.passages.every(p => p.readingGate.status === "ready"));
});

test("a complete answer, through the whole reading as preparation runs it (no mock stand-in): host and guest named everywhere", async t => {
  const ai = scriptedAI({ identify: p => ({ voices: [
    { label: "SPEAKER 2", name: HOST, evidence: [{ kind: "hosts_show", turn: turnOf(p, "SPEAKER 2", "Good evening and welcome"), quote: "Good evening and welcome to the Straight Talk Hour." }] },
    { label: "SPEAKER 3", name: GUEST, evidence: [{ kind: "introduced", turn: turnOf(p, "SPEAKER 2", "Joining us now"), quote: "Joining us now from Washington, Marcus Delacroix, former trade adviser." }] }],
  unnamed: [{ label: "SPEAKER 1", why: "an announcer" }] }) });
  const f = await server(t, { ai, fetch: chainFetch(SAID), env: DG });
  const b = await fromLink(f, APPLE_LINK);
  const id = b.run.provenance.identification;
  assert.equal(id.mockReading, undefined); assert.deepEqual(id.answerChecks, [{ attempt: 1, issues: [] }]);
  assert.equal(ai.prompts.filter(p => p.startsWith("Who is each voice in this conversation?")).length, 1);
  const md = (await f.api("GET", "/api/runs/" + b.run.id + "/export.md?level=hs")).data, ex = (await f.api("GET", "/api/runs/" + b.run.id + "/export.json")).data;
  assertNamed(b, md, ex, ["SPEAKER 2", "SPEAKER 3"], [HOST, GUEST]);
  assert.match(md, /- Walt Brannigan \(Speaker 2\): The show's host as the listing names the show's name and Apple's listing of the show, read by the model as hosting this conversation: “Good evening and welcome to the Straight Talk Hour\.”/);
  assert.ok(ex.claims.some(c => c.speakerKey === "SPEAKER 3" && c.speaker === GUEST && c.speakerNamedBy === "identification"));
  assert.ok(b.passages.length && b.passages.every(p => p.readingGate.status === "ready"));
});
