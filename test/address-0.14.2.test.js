"use strict";
/* 0.14.2: whether a sentence speaks to someone by name (vocative) and whether its speaker says a calling is their own
   (roleSelfAt), the two readings the identification uses to check "addressed" and "self_reference" clues. Four
   batteries of invented sentences, half of them in the style of automatic captions (no capitals, no punctuation), each
   written by a separate agent from the two functions' contracts alone, without the code. The first three were used to
   repair the rules; the fourth was measured once before its own repairs (docs/technical.md, Reviews, 0.14.2). Words to
   someone absent, dead or to God are false here: they cannot name a voice in the room. Sentences the writer marked
   ambiguous are left out. A wrong "yes" fails the test; a missed "yes" fails unless it is listed below with its reason.
   Invented people and words; no lyrics. */
const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../server/identify");

const sets = [1, 2, 3, 4].map(n => ({ n, b: require("./fixtures/address-battery-" + n + ".json") }));

/* Misses the rules accept, each with why the words do not settle it. */
const ACCEPTED_VOCATIVE = {
  "priya did ken ever tell you about the fire": "captions: a name first and then a question about someone else; without a full stop the name may end the sentence before",
  "and that marisol is exactly why we started": "captions: with no commas the name may be the subject (“that Marisol is…”)",
  "Thank you, Colette and Odile, for sitting down with us.": "two people addressed together: no single voice is named, and a list is refused on purpose",
  "Abe and Ines, you two really need to talk this out.": "two people addressed together",
  "Abe, Ines, dinner's ready, come on!": "two people addressed together",
  "thank you colette and odile for coming in": "two people addressed together",
  "abe and ines you two need to sit down and talk": "two people addressed together",
  "Dex and Kit, you two are trouble.": "two people addressed together",
  "Gus, Lena, Theo — dinner's ready!": "three people addressed together",
  "odile the whole street was under water by noon": "captions: a name with no comma before “the …” reads as a name described (“Dale the plumber came over”), which is refused",
  "big dex my guy whats good": "captions: a nickname around the name",
  "lena the legend welcome back to the pod": "captions: a nickname after the name, read as a description",
  "i dont think you understand how big this is fatou": "captions: a name after “is” may be what something is (“the winner is Fatou”)",
};
const ACCEPTED_ROLE = {
  "I'm the last person you'd expect to be an exorcist, but here I am.": "irony: the calling is affirmed only by “here I am”",
  "Nobody expected me to become a rabbi, least of all me, but here we are.": "others' expectation, affirmed only by “here we are”",
  "Former surgeon, current baker — that's my story.": "labels with no verb",
  "My day job? Architect. Mostly schools and libraries.": "an answer of one word to the speaker's own question",
  "Had I not been a firefighter, I'd never have met my wife.": "a counterfactual that takes the calling for granted",
  "Never thought I'd end up an architect, but here I am.": "irony: the denial is of an expectation, the calling affirmed only by “here I am”",
};

function run(items, f, accepted) {
  const wrong = [], missed = [];
  for (const it of items) {
    if (it.note && /ambiguous/i.test(it.note)) continue;
    const expect = it.note && /absent|deceased|god/i.test(it.note) ? false : it.expect;
    const got = f(it);
    if (!expect && got) wrong.push((it.name || it.role) + " | " + it.s);
    if (expect && !got && !accepted[it.s]) missed.push((it.name || it.role) + " | " + it.s);
  }
  return { wrong, missed };
}

for (const { n, b } of sets) {
  test("address battery " + n + " (" + b.vocative.length + " sentences): no sentence is taken as speaking to someone it does not, and none is missed beyond the accepted ones", () => {
    const r = run(b.vocative, it => I.vocative(it.s, it.name, false), ACCEPTED_VOCATIVE);
    assert.deepEqual(r.wrong, [], "taken as speaking to the name:\n" + r.wrong.join("\n"));
    assert.deepEqual(r.missed, [], "missed:\n" + r.missed.join("\n"));
  });
  test("calling battery " + n + " (" + b.role.length + " sentences): no calling is taken as the speaker's own that is not, and none is missed beyond the accepted ones", () => {
    const r = run(b.role, it => I.roleSelfAt(it.s, it.role) !== -1, ACCEPTED_ROLE);
    assert.deepEqual(r.wrong, [], "taken as the speaker's own:\n" + r.wrong.join("\n"));
    assert.deepEqual(r.missed, [], "missed:\n" + r.missed.join("\n"));
  });
}

test("the reworded real shapes: an address in captions with no punctuation, and the cases that must stay apart", () => {
  const yes = ["you know dale as a rule people are slow to change", "i mean dale the numbers dont lie", "trust me dale priests are human too",
    "you know dale most of us never asked for this", "So they went their own way and since none of us are saints you know Dale as a rule people are slow to change."];
  const no = ["you know Dale is right about steel.", "you know Dale he always says that.", "you know Dale the man who was mayor.", "and Dale the plumber came over",
    "you know dale the guy i worked with", "you know Dale the tired old man", "I told Dale people are slow to change", "if you know Dale people say he is tough"];
  for (const s of yes) assert.equal(I.vocative(s, "Dale", false) || I.vocative(s, "dale", false), true, s);
  for (const s of no) assert.equal(I.vocative(s, "Dale", false) || I.vocative(s, "dale", false), false, s);
});

test("many names do not each compile the shared ways of speaking to someone: 300 names in well under the time a test allows", () => {
  const t0 = Date.now();
  for (let i = 0; i < 300; i++) { const nm = "Name" + String.fromCharCode(65 + i % 26) + String.fromCharCode(97 + (i * 7) % 26) + "son"; I.vocative("you know " + nm + " as a rule people are slow to change", nm, false); }
  assert.ok(Date.now() - t0 < 15000, (Date.now() - t0) + " ms");
});
