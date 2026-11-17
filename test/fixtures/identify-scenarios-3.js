"use strict";
/* Third set of adversarial scenarios for server/identify.js (0.14.2): interview openings that name people by a title or a
   role, a host named only by the show's name and its publisher, a host away, two priests, advertisements and clips,
   captions with no punctuation, and the mentions, quotations and reported words that must not count. Shaped after a
   real run that failed (a host thanking "Father" for coming, a guest who speaks of himself as an exorcist, a publisher
   named "… Network"), with invented people, shows and words throughout; no real transcript, no lyrics.
   expect: { KEY: "Name" | null | { not: "Name" } | { oneOf: [...] } } — what a careful human concludes. */
const { pad } = require("./identify-pad");
const { opens, unnamed, plus } = require("./identify-answers");

const HOST = "Dale Whitcomb", SHOW = "The Dale Whitcomb Show", PUB = "Dale Whitcomb Network", PRIEST = "Tomas Varga", GUEST = "Marcus Delacroix";
const NOTES = "Father Tomas Varga has spent twenty years as an exorcist. Fr. Tomas Varga is a parish priest and exorcist who trained in Rome. Use code DALE for 20% off at example.test.";
const LP = { show: SHOW, showAuthor: PUB, showArtist: PUB, episodeTitle: "Exorcist Fr. Tomas Varga: Demons, Doubt and the Modern Church", description: NOTES };
const NIGHT = { show: "Night Desk", showAuthor: PUB, episodeTitle: "Mill towns" };   // a publisher named after a person; a show name that is not
const lc = x => x.toLowerCase().replace(/[.,?!;:“”"—]/g, "").replace(/’/g, "'");    // captions: no capitals, no punctuation
const S = [];
const add = s => S.push(s);

/* ======== R. the shape of the real failure ======== */
const REAL = [
  "SPEAKER 1: Father, thanks so much for coming in.",
  "SPEAKER 2: Uh, thanks for having me.",
  "SPEAKER 1: So before we get into what you have spent the last decades doing, how did the churches here come to ignore all of this?",
  "SPEAKER 2: There is a historical reason behind that." + pad(2) + " So in a place like that, as an exorcist, it honestly gives me a great deal of peace." + pad(1),
  "SPEAKER 1: How so?",
  "SPEAKER 2: They went their own way." + pad(2) + " And since none of us are saints you know Dale as a rule people are slow to change.",
  "SPEAKER 1: Yeah.",
  "SPEAKER 2: That is why mercy matters." + pad(2)];
add({ id: "R1", title: "Real shape, reworded: “Father, thanks…”, “thanks for having me”, “as an exorcist, it… me”, “you know Dale as a rule…” (no commas)", L: LP, lines: REAL,
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": PRIEST } });
add({ id: "R1b", title: "Real shape with commas: “You know, Dale, as a rule, …”", L: LP, lines: REAL.map(l => l.replace("you know Dale as a rule", "you know, Dale, as a rule,")),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": PRIEST } });
add({ id: "R2", title: "Real shape as captions: no capitals, no punctuation", L: LP, lines: REAL.map(l => l.replace(/^(SPEAKER \d+): (.*)$/, (m, k, t) => k + ": " + lc(t))),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": PRIEST } });
add({ id: "R3", title: "Role-only greeting and the guest's thanks, but the guest never says what he is: a title alone names no one", L: LP, lines: [
  "SPEAKER 1: Father, thanks so much for coming in.",
  "SPEAKER 2: Thank you for having me.",
  "SPEAKER 1: What happened in Rome?",
  "SPEAKER 2: Rome was a long time ago." + pad(3),
  "SPEAKER 1: And after that?",
  "SPEAKER 2: I came home." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
// (changed in the sixth review: with the model's reading as well, R3 is no longer a title alone. The title is the one
// the listing gives the person it bills as the episode's guest ("Exorcist Fr. Tomas Varga: …"), the voice answers the
// host's welcome as the guest, and the model's reading of the whole conversation names him: the listing and both
// readers agree, and nothing in the words is against it. R3 itself, with no model, still names no one.)
add({ id: "R3m", title: "R3 with the model's reading: the title the listing gives its billed guest, the guest's thanks and the model's reading together name him", L: LP, lines: S[S.length - 1].lines,
  model: () => plus({ voices: [{ label: "SPEAKER 2", name: "Fr. Tomas Varga", evidence: [{ kind: "addressed", turn: 0, quote: "Father, thanks so much for coming in." }] }], unnamed: [] }, [opens("SPEAKER 1", HOST, "Father, thanks so much for coming in.")]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Tomas Varga" } });

/* ======== T. two priests ======== */
add({ id: "T1", title: "Two priests listed: “Father” and “as a priest” speak to and of either one", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Fr. Tomas Varga and Fr. Leo Brandt on Exorcism", description: "Fr. Tomas Varga and Fr. Leo Brandt are Catholic priests." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(2) + " Father, you first. What do you see?",
  "SPEAKER 2: As a priest, I see it every day." + pad(3),
  "SPEAKER 1: And you, Father?",
  "SPEAKER 3: As a priest, I see it too." + pad(3),
  "SPEAKER 1: Fair enough." + pad(1),
  "SPEAKER 2: Yes." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null, "SPEAKER 3": null } });
add({ id: "T2", title: "One priest listed, but the host also calls a caller “Father”: the title points to two voices", L: LP, lines: [
  "SPEAKER 1: Father, thanks so much for coming in.",
  "SPEAKER 2: Thank you for having me.",
  "SPEAKER 1: Let's go to the phones. Line one, go ahead.",
  "SPEAKER 3: Hi Dale, I'm a parish priest from Ohio and a long time listener." + pad(1),
  "SPEAKER 1: Father, what do you make of it?",
  "SPEAKER 3: I agree with him." + pad(2),
  "SPEAKER 2: As an exorcist, I see this every week." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });

/* ======== N. hosts named by the show's name and its publisher ======== */
add({ id: "N1", title: "“Night Desk” by “Dale Whitcomb Network”: the guest thanks Dale, the voice that answers is Dale", L: NIGHT, lines: [
  "SPEAKER 1: Welcome to Night Desk." + pad(2) + " Joining me now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me, Dale.",
  "SPEAKER 1: What about the mills?" + pad(1),
  "SPEAKER 2: They are hiring." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "N2", title: "“The Dale Whitcomb Show” by “Dale Whitcomb Network”: the voice that opens the show is the host", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Steel" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Good to be here." + pad(3),
  "SPEAKER 1: What about steel?" + pad(1),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "N3", title: "A show named like a person but no other field agrees, and no one says the name: no host by the show's name alone", L: { show: "The Steel Country Hour", showAuthor: "Ironvale Media", episodeTitle: "Mill towns" }, lines: [
  "SPEAKER 1: Welcome to the Steel Country Hour." + pad(2),
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about the mills?" + pad(1),
  "SPEAKER 2: They are hiring." + pad(3)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": null } });
add({ id: "N3b", title: "“This is Steel Country, …”: the show's own name, guessed as a host's, is not a voice naming itself", L: { show: "The Steel Country Hour", showAuthor: "Ironvale Media", episodeTitle: "Mill towns" }, lines: [
  "SPEAKER 1: This is Steel Country, and welcome to the hour." + pad(2),
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about the mills?" + pad(1),
  "SPEAKER 2: They are hiring." + pad(3)],
  model: () => ({ voices: [{ label: "SPEAKER 1", name: "Steel Country", evidence: [{ kind: "self_identification", turn: 0, quote: "This is Steel Country, and welcome to the hour." }] }], unnamed: [] }),
  expect: { "SPEAKER 1": null, "SPEAKER 2": null } });
add({ id: "N3c", title: "“The Dale Whitcomb Show” with no other field agreeing, and the opener says “I'm Dale Whitcomb”: the words name him", L: { show: SHOW, showAuthor: "Ironvale Media", episodeTitle: "Mill towns" }, lines: [
  "SPEAKER 1: Hi everybody, I'm Dale Whitcomb, and welcome to the show." + pad(2),
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about the mills?" + pad(1),
  "SPEAKER 2: They are hiring." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "N4", title: "“If you know Dale, you know he is honest”: a question of knowing someone, not speaking to him", L: NIGHT, lines: [
  "SPEAKER 1: Welcome to Night Desk." + pad(2),
  "SPEAKER 2: I grew up near the mill." + pad(2) + " If you know Dale, you know he is honest.",
  "SPEAKER 1: Thanks." + pad(2),
  "SPEAKER 2: Sure." + pad(2)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": { not: HOST } } });
add({ id: "N5", title: "“and then he said Dale you are wrong”: reported words, not this voice speaking to Dale", L: NIGHT, lines: [
  "SPEAKER 1: Welcome to Night Desk." + pad(2),
  "SPEAKER 2: The foreman came over." + pad(2) + " And then he said Dale you are wrong about the mill.",
  "SPEAKER 1: Wow." + pad(2),
  "SPEAKER 2: Yes." + pad(2)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": { not: HOST } } });
add({ id: "N6", title: "“You know Dale is right about one thing”: Dale spoken of, not to", L: NIGHT, lines: [
  "SPEAKER 1: Welcome to Night Desk." + pad(2),
  "SPEAKER 2: Thanks." + pad(1) + " You know Dale is right about one thing: the mills stopped talking to us.",
  "SPEAKER 1: Go on." + pad(1),
  "SPEAKER 2: They closed." + pad(2)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": { not: HOST } } });

/* ======== A. a host away ======== */
add({ id: "A1", title: "The host the show is named for is away; a guest host names herself; the guest by title and calling", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show. I'm Pat Reilly, sitting in for Dale tonight." + pad(2) + " Father, thank you for coming.",
  "SPEAKER 2: Thank you for having me." + pad(1) + " As an exorcist, I have seen this many times." + pad(2),
  "SPEAKER 1: Tell me more." + pad(1),
  "SPEAKER 2: It starts small." + pad(2)],
  expect: { "SPEAKER 1": "Pat Reilly", "SPEAKER 2": PRIEST } });
add({ id: "A2", title: "The host is away and the guest host never names herself: the opener is not given the absent host's name", L: LP, lines: [
  "SPEAKER 1: Welcome to the show. I'm sitting in for Dale tonight." + pad(2) + " Father, thank you for coming.",
  "SPEAKER 2: Thank you for having me." + pad(1) + " When I was still a young priest, I never expected any of this." + pad(2),
  "SPEAKER 1: Tell me more." + pad(1),
  "SPEAKER 2: It starts small." + pad(2)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": PRIEST } });

/* ======== D. advertisements and clips ======== */
add({ id: "D1", title: "An advertisement with the host's code and the guest's book is no evidence; the guest still named by title and calling", L: LP, lines: [
  "SPEAKER 1: Father, thanks so much for coming in.",
  "SPEAKER 2: Thank you for having me.",
  "AD 1: This episode is brought to you by Example Store. Use code DALE for twenty percent off. Father Tomas Varga's new book is out now.",
  "SPEAKER 1: Welcome back. How did you become an exorcist?",
  "SPEAKER 2: When I was still a young priest, I never expected it." + pad(3),
  "SPEAKER 1: Right." + pad(1),
  "SPEAKER 2: Yes." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": PRIEST, "AD 1": null } });
add({ id: "D2", title: "A clip calls someone “Father”; the guest speaks of himself as an exorcist but no one in the conversation calls him by name or title", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(2) + " Let's play the clip.",
  "CLIP 1: Father, you are wrong about all of this, and you know it.",
  "SPEAKER 1: That was the bishop last week." + pad(1),
  "SPEAKER 2: He has his view. As an exorcist, I see it differently." + pad(3),
  "SPEAKER 1: Fair." + pad(1),
  "SPEAKER 2: Yes." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "CLIP 1": null } });
add({ id: "D3", title: "The host reads a letter in quotation marks: “I'm an exorcist…” is the letter's, not the host's; the guest only by title", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(2) + " A listener wrote to us: “I'm an exorcist and I think you are all wrong.” Father, thank you for coming.",
  "SPEAKER 2: Thank you for having me." + pad(3),
  "SPEAKER 1: Father, what do you make of that letter?",
  "SPEAKER 2: It is a common view." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });

/* ======== G. other titles and callings ======== */
add({ id: "G1", title: "“Doctor, welcome to the show.” and “As a neuroscientist, I…”: the doctor the listing describes", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dr. Ruth Okonkwo: The Sleep Crisis", description: "Dr. Ruth Okonkwo is a neuroscientist who studies sleep." }, lines: [
  "SPEAKER 1: Doctor, welcome to the show.",
  "SPEAKER 2: Thanks for having me.",
  "SPEAKER 1: How bad is it?",
  "SPEAKER 2: As a neuroscientist, I see the damage every day." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ruth Okonkwo" } });
const SENATE = ["SPEAKER 1: Senator, good to have you here.", "SPEAKER 2: Thank you for having me.", "SPEAKER 1: Where does the bill stand?", "SPEAKER 2: As a senator, I have voted on six of these." + pad(3)];
add({ id: "G2", title: "“Senator, good to have you here.” and “As a senator, I…”, with only the title billing her (“Senator Mara Quill on …”): a title may name a film or a subject, so no name is kept that no one says", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Senator Mara Quill on the farm bill" }, lines: SENATE,
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: ["Mara Quill", null] } } });
add({ id: "G2n", title: "G2 with notes that present her (“Mara Quill served as a senator for two terms.”): the senator the listing describes", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Senator Mara Quill on the farm bill", description: "Mara Quill served as a senator for two terms and wrote the last farm bill." }, lines: SENATE,
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Mara Quill" } });
add({ id: "G3", title: "Captions: “rabbi thank you so much for coming on” and “as a rabbi i sit with families”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Rabbi Ezra Fein: Faith After Loss", description: "Rabbi Ezra Fein is a rabbi and author in Chicago." }, lines: [
  "SPEAKER 1: " + lc("Rabbi, thank you so much for coming on."),
  "SPEAKER 2: " + lc("Uh, thanks for having me."),
  "SPEAKER 1: " + lc("Where do people start?"),
  "SPEAKER 2: " + lc("As a rabbi, I sit with families every week." + pad(3))],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ezra Fein" } });
add({ id: "G4", title: "The host speaks of himself in the guest's calling (“as a priest myself, I…”) and calls the guest “Father”: the host is not the guest", L: LP, lines: [
  "SPEAKER 1: Father, thanks so much for coming in. As a priest myself, I have waited years for this conversation.",
  "SPEAKER 2: Thank you for having me." + pad(3),
  "SPEAKER 1: Where do we start?",
  "SPEAKER 2: With the basics." + pad(3)],
  expect: { "SPEAKER 1": { not: PRIEST }, "SPEAKER 2": { oneOf: [PRIEST, null] } } });
add({ id: "G5", title: "A voice saying “my father was a priest” does not speak of itself", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(2),
  "SPEAKER 2: Thanks for having me. My father was a priest, and I grew up in the parish." + pad(3),
  "SPEAKER 1: Go on." + pad(1),
  "SPEAKER 2: It shaped me." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });

module.exports = { S, HOST, SHOW, PUB, PRIEST, LP, NIGHT };
