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

/* Misses the app accepts, because the words do not settle them. */
const ACCEPTED = {
  J2: "Q and A labels with a guest the episode's title names but the conversation never does: the title alone may name the subject, not a guest",
  MS13: "“I'm your neighbor, Dana Reyes” has the same shape as “I'm your biggest fan, Walt Brannigan”, which speaks to someone; neither is taken as naming oneself",
};
const BLANK = { show: "", showAuthor: "", showArtist: "", showPersons: [], channel: false, episodeTitle: "", description: "", episodeAuthor: "", episodePersons: [], runTitle: "", sourceLabel: "" };

async function identify(sc) {
  const L = Object.assign({}, BLANK, sc.L);
  const transcript = sc.lines.join("\n");
  const run = { id: "run_adv", kind: "transcript", parseMode: "text", input: { sha256: "h" }, speakers: [], provenance: {}, title: L.runTitle, sourceLabel: L.sourceLabel,
    import: { showInfo: { name: L.show, author: L.showAuthor, artist: L.showArtist, persons: L.showPersons, channel: L.channel }, episodeInfo: { title: L.episodeTitle, description: L.description, author: L.episodeAuthor, persons: L.episodePersons } } };
  const store = { bundle: async () => ({ run, transcript, attrSig: "a0-0" }), captureCallBasis: async () => ({}), recordCall: async () => {} };
  const ai = sc.model ? { kind: "mock", model: "scripted", mock: true, sample: async () => { const data = sc.model(); return { data, text: JSON.stringify(data), model: "scripted", requestId: "r", stopReason: "end_turn", usage: null }; } } : null;
  const out = await I.identifySpeakers({ ai, store, id: run.id });
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
async function runAll(set) {
  const wrong = [], missed = [];
  for (const sc of set.S) {
    const names = await identify(sc);
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
  const r = await runAll(first);
  assert.ok(r.count >= 140, "the whole set ran: " + r.count);
  assert.deepEqual(r.wrong, [], "wrong names:\n" + r.wrong.join("\n"));
  assert.deepEqual(r.missed, [], "misses:\n" + r.missed.join("\n"));
});
test("adversarial scenarios, second set (teasers, descriptions, callers, captions, all capitals, model clues, listings): no wrong name, and no miss beyond the accepted ones", async () => {
  const r = await runAll(second);
  assert.ok(r.count >= 70, "the whole set ran: " + r.count);
  assert.deepEqual(r.wrong, [], "wrong names:\n" + r.wrong.join("\n"));
  assert.deepEqual(r.missed, [], "misses:\n" + r.missed.join("\n"));
});
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
