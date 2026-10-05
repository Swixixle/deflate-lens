"use strict";
/* Adversarial scenarios for server/identify.js (first set). Invented people and shows only; no lyrics.
   expect: { KEY: "Name" | null | { not: "Name" } }  — what a careful human concludes.
     "Name"        the voice must be named exactly this (clear evidence)
     null          the voice must stay unnamed (evidence unclear or absent)
     { not: X }    any outcome except the name X is acceptable (X would be wrong)
     { oneOf: [] } any of these outcomes (null allowed if listed) is acceptable */
const { pad } = require("./identify-pad");

const SHOW = "Walt Brannigan’s Straight Talk Hour", HOST = "Walt Brannigan", GUEST = "Marcus Delacroix";
const EP = "We’ll Do It LIVE! — Marcus Delacroix";
const L0 = { show: SHOW, showAuthor: HOST, episodeTitle: EP };            // host (structured) + guest (title)
const LH = { show: SHOW, showAuthor: HOST, episodeTitle: "Mailbag Friday" }; // host only
const S = [];
const add = s => S.push(s);

/* ---------------- A. self-identification inside reported speech ---------------- */
add({ id: "A1", title: "Host quotes a campaign ad: “I'm Jack Pruitt and I approve this message.”", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: Did you see that ad last night? He looks right into the camera and says, “I'm Jack Pruitt and I approve this message.”" + pad(2),
  "SPEAKER 2: Everybody saw that ad." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "A2", title: "Host reads listener mail: “My name is Dave Kowalski and I have listened…”", L: LH, lines: [
  "SPEAKER 1: Welcome back to the Straight Talk Hour." + pad(2) + " Time for the mailbag. Dave from Ohio writes: “My name is Dave Kowalski and I have listened to this show for ten years.”",
  "SPEAKER 2: Ten years, that is real loyalty." + pad(3),
  "SPEAKER 1: He goes on to say the steel story was the best hour we have done." + pad(2),
  "SPEAKER 2: I agree with him." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "A3", title: "Host reads a memoir's first line in the first person: “My name is Eleanor Vance, and…”", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " I want to read you the first line of the memoir everyone is talking about. “My name is Eleanor Vance, and I have lived in this house for forty years.”",
  "SPEAKER 2: What a first line." + pad(3),
  "SPEAKER 1: It gets better from there." + pad(2),
  "SPEAKER 2: I will have to read it." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "A4", title: "Host impersonates the guest: “I'm Marcus Delacroix and I never met a tariff I didn't like!”", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: You know how the cartoonists draw you? A little guy in a hard hat yelling, “I'm Marcus Delacroix and I never met a tariff I didn't like!”" + pad(2),
  "SPEAKER 2: I have seen that one, and I have it framed." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "A5", title: "Substitute says “I'm no Walt Brannigan, but I'll keep his chair warm”", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour. I'm no Walt Brannigan, but I will do my best to keep his chair warm tonight." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": GUEST } });
add({ id: "A6", title: "Guest quotes his father: “I'm Frank Ruiz, and I don't back down.”", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me. My stepfather worked the mill, and he used to say, “I'm Frank Ruiz, and I don't back down.”" + pad(3),
  "SPEAKER 1: That sounds like a mill town." + pad(2),
  "SPEAKER 2: It was." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "A7", title: "Host sets up a clip: “This is Jane Holloway at the ribbon cutting.” (clip set apart)", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " First, the governor on Tuesday. This is Jane Holloway at the ribbon cutting.",
  "CLIP 1: We will not raise taxes on working families, period.",
  "SPEAKER 1: Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What did you make of the governor?" + pad(2),
  "SPEAKER 2: She is wrong." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "A8", title: "Host presents the guest: “Folks, this is Marcus Delacroix.”", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Folks, this is Marcus Delacroix. He ran trade policy for six years.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [GUEST, null] } } });
add({ id: "A9", title: "Guest states a religion: “I'm Roman Catholic, and my faith matters to me.”", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: Does faith come into this for you?" + pad(1),
  "SPEAKER 3: It does for me. I'm Roman Catholic, and my faith matters to me." + pad(3),
  "SPEAKER 1: Thank you for calling in." + pad(1),
  "SPEAKER 2: Good point." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST, "SPEAKER 3": null } });
add({ id: "A10", title: "Caller gives a job title: “I'm Executive Director of the Indiana Steel Council.”", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Let's go to the phones.",
  "SPEAKER 2: Hi, thanks. I'm Executive Director of the Indiana Steel Council, and I have a correction." + pad(3),
  "SPEAKER 1: Go ahead." + pad(2),
  "SPEAKER 2: The output number is wrong." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });

/* ---------------- B. introductions whose next voice is not the person ---------------- */
add({ id: "B1", title: "Teaser “After the break, my guest is Marcus Delacroix” then an ad read by a numbered voice", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " After the break, my guest is Marcus Delacroix.",
  "SPEAKER 3: This hour is brought to you by Comfy Pillow. Go to comfypillow dot com and use the code STRAIGHT.",
  "SPEAKER 1: And we're back. Marcus, thanks for waiting.",
  "SPEAKER 2: Happy to be here." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST, "SPEAKER 3": null } });
add({ id: "B2", title: "“Last week my guest was Dana Reyes” then a co-host speaks", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Last week my guest was Dana Reyes, and a lot of you wrote in about it.",
  "SPEAKER 2: The inbox was full all weekend." + pad(3),
  "SPEAKER 1: Let's read a few." + pad(2),
  "SPEAKER 2: Go ahead." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "B3", title: "“My guest tonight was supposed to be Marcus Delacroix, but his flight was cancelled” then the producer", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " My guest tonight was supposed to be Marcus Delacroix, but his flight was cancelled, so my producer is keeping me company instead.",
  "SPEAKER 2: Happy to fill the chair." + pad(3),
  "SPEAKER 1: So what did you make of the steel numbers?" + pad(2),
  "SPEAKER 2: They surprised me." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "B4", title: "“And next week, Dana Reyes joins us” then the co-host", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2),
  "SPEAKER 2: Big show tonight." + pad(3),
  "SPEAKER 1: It is." + pad(2) + " And next week, Dana Reyes joins us to talk about housing.",
  "SPEAKER 2: I cannot wait for that one." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "B5", title: "Co-host chimes in right after “Joining us now, Marcus Delacroix”", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 3: Oh, I have been looking forward to this one all week." + pad(2),
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3),
  "SPEAKER 3: I am not so sure." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [GUEST, null] }, "SPEAKER 3": null } });
add({ id: "B6", title: "“Marcus Delacroix joins us now. But first…” a CLIP of him, then he speaks", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Marcus Delacroix joins us now. But first, here is what he told the Senate last week.",
  "CLIP 1: Our steel industry was hollowed out by thirty years of bad deals.",
  "SPEAKER 2: Thanks for having me, and yes, I stand by every word of that." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "B7", title: "Panelist agrees: “I'm with Marcus on this one” (an agreement, not an introduction)", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Steel — Marcus Delacroix and Jane Holloway" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: Also joining us tonight, Jane Holloway.",
  "SPEAKER 3: Glad to be here." + pad(3),
  "SPEAKER 1: Jane, what about steel?",
  "SPEAKER 3: I'm with Marcus on this one, the numbers are clear." + pad(2),
  "SPEAKER 1: Interesting." + pad(2),
  "SPEAKER 2: Thank you." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST, "SPEAKER 3": "Jane Holloway" } });
add({ id: "B8", title: "“We'll bring in Jane Holloway later in the hour” then the co-host", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " We'll bring in Jane Holloway later in the hour.",
  "SPEAKER 2: Good, because I have questions for her." + pad(3),
  "SPEAKER 1: First, the mail." + pad(2),
  "SPEAKER 2: Go ahead." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });

/* ---------------- C. vocatives to absent people, common-word names ---------------- */
add({ id: "C1", title: "Title names a subject (“Jane Holloway: Wrong Again”); host: “Jane Holloway, if you are listening…”", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Jane Holloway: Wrong Again" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Tonight we take apart the speech the governor gave on Monday.",
  "SPEAKER 2: It was quite a speech." + pad(3),
  "SPEAKER 1: Jane Holloway, if you are listening, the mills did not reopen." + pad(2),
  "SPEAKER 2: Not a single one of them." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "C2", title: "Guest in the notes cancelled; host asks the air: “What would you say to that, Marcus?”", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Steel Week", description: "Walt sits down with Marcus Delacroix about steel." }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " We were supposed to have a guest tonight, but he cancelled an hour ago.",
  "SPEAKER 2: Typical." + pad(3),
  "SPEAKER 1: What would you say to that, Marcus? You cannot keep ducking this." + pad(2),
  "SPEAKER 2: He will be back next week, I am sure." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "C3", title: "Guest named Dana Price says “Price, in the end, is what drives this market.”", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Markets — Dana Price" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Dana Price.",
  "SPEAKER 2: Thanks for having me." + pad(3) + " Price, in the end, is what drives this market.",
  "SPEAKER 1: Say more about that." + pad(2),
  "SPEAKER 2: Gladly." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Dana Price" } });
add({ id: "C4", title: "Radio call-in: “Houston, you're on the air” with a listed guest Marcus Houston who speaks later", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Energy — Marcus Houston" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " We have a caller from Texas. Houston, you're on the air.",
  "SPEAKER 3: Hi, thanks for taking my call. I drive a truck for the refinery." + pad(3),
  "SPEAKER 1: Thanks for calling." + pad(1) + " Marcus, what do you make of that?",
  "SPEAKER 2: He is right about the refinery." + pad(3),
  "SPEAKER 1: Marcus, one more?",
  "SPEAKER 2: Sure." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: ["Marcus Houston", null] }, "SPEAKER 3": null } });

/* ---------------- D. places and organisations taken for people ---------------- */
add({ id: "D1", title: "“Joining us now from Capitol Hill, our congressional reporter.”", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now from Capitol Hill, our congressional reporter.",
  "SPEAKER 2: Thanks." + pad(3),
  "SPEAKER 1: What is the mood up there?" + pad(2),
  "SPEAKER 2: Tense." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "D2", title: "“Joining us live from Fort Wayne is our correspondent.”", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us live from Fort Wayne is our correspondent.",
  "SPEAKER 2: Good evening." + pad(3),
  "SPEAKER 1: What are you seeing?" + pad(2),
  "SPEAKER 2: Long lines." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "D3", title: "Unlisted guest: “Joining me now from New York, Dana Reyes.” (pasted text, no listing)", L: {}, lines: [
  "SPEAKER 1: Good evening." + pad(2) + " Joining me now from New York, Dana Reyes.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": "Dana Reyes" } });
add({ id: "D4", title: "Show named “Wall Street’s Money Hour” (no person named anywhere)", L: { show: "Wall Street’s Money Hour", episodeTitle: "Rates and Risk" }, lines: [
  "SPEAKER 1: Welcome to the Money Hour." + pad(2),
  "SPEAKER 2: Glad to be back." + pad(3),
  "SPEAKER 1: Rates first." + pad(2),
  "SPEAKER 2: Sure." + pad(3)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": null } });
add({ id: "D5", title: "Feed author is a company: “Brannigan Productions” (show “The Straight Talk Hour”)", L: { show: "The Straight Talk Hour", showAuthor: "Brannigan Productions", episodeTitle: "Steel Week" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2),
  "SPEAKER 2: Glad to be back." + pad(3),
  "SPEAKER 1: Steel first." + pad(2),
  "SPEAKER 2: Sure." + pad(3)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": null } });
add({ id: "D6", title: "Show “Walt Brannigan’s Straight Talk Hour” + company author “Brannigan Productions”: host opens", L: { show: SHOW, showAuthor: "Brannigan Productions", episodeTitle: "Steel Week" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2),
  "SPEAKER 2: Glad to be back." + pad(3),
  "SPEAKER 1: Steel first." + pad(2),
  "SPEAKER 2: Sure." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "D7", title: "Caller: “Senator Holloway is with us on tariffs” (agreement, read as an introduction)", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Let's go to the phones.",
  "SPEAKER 3: Hi, long time listener." + pad(2) + " Senator Holloway is with us on tariffs, and so is the governor.",
  "SPEAKER 1: Fair enough." + pad(2),
  "SPEAKER 3: Thanks for taking my call." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": null } });

/* ---------------- E. listing traps: subjects, guest lists, substitutes ---------------- */
add({ id: "E1", title: "Title names a subject (“Marcus Delacroix: Wrong Again”); vocative before a CLIP; co-host left", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Marcus Delacroix: Wrong Again" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Tonight we take apart the speech Marcus Delacroix gave on Monday. Marcus, if you are listening, here is your own voice.",
  "CLIP 1: The mills will reopen by the summer, every one of them.",
  "SPEAKER 2: Well, that aged badly." + pad(3),
  "SPEAKER 1: Not one mill reopened." + pad(2),
  "SPEAKER 2: Not a single one of them." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "E2", title: "Three listed guests, two voices: “Ruth, we miss you. Marcus, welcome.”", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Steel — Marcus Delacroix, Jane Holloway and Ruth Okonkwo" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Jane and Ruth could not make it tonight. Ruth, we miss you. Marcus, welcome.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "E3", title: "Two listed guests share a first name; the model picks one for “Hi, I'm Marcus”", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Steel — Marcus Delacroix and Marcus Webb" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Two guests tonight, both from the mill towns.",
  "SPEAKER 2: Hi, I'm Marcus, and I worked the mill for twenty years." + pad(3),
  "SPEAKER 1: And our other guest?" + pad(1),
  "SPEAKER 3: Glad to be here." + pad(3),
  "SPEAKER 2: The mill is coming back." + pad(2),
  "SPEAKER 3: I am not so sure." + pad(2)],
  model: () => ({ voices: [{ label: "SPEAKER 2", name: "Marcus Webb", evidence: [{ kind: "self_identification", turn: 1, quote: "Hi, I'm Marcus, and I worked the mill for twenty years" }] }], unnamed: [] }),
  // the words give "Marcus" and two listed people share it: the first name alone is what the words establish
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: ["Marcus", null] }, "SPEAKER 3": null } });
add({ id: "E4", title: "Substitute: “I'm Dana Reyes, in for Walt tonight”; the unnamed guest gets the absent host's name", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Steel Town Stories" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour. I'm Dana Reyes, in for Walt tonight." + pad(2) + " My guest is a steelworker from Gary who asked us not to use his name.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What happened at the mill?" + pad(2),
  "SPEAKER 2: They shut the second line." + pad(3)],
  expect: { "SPEAKER 1": "Dana Reyes", "SPEAKER 2": null } });
for (const [i, phr] of ["Walt is off this week, so you are stuck with me.", "I'm in for Walt tonight.", "While Walt is away, I'm minding the store.", "Walt's on vacation, so I'm guest hosting."].entries())
  add({ id: "E5" + "abcd"[i], title: "Unnamed substitute host: “" + phr + "”", L: L0, lines: [
    "SPEAKER 1: Welcome to the Straight Talk Hour. " + phr + pad(2) + " Joining us now, Marcus Delacroix.",
    "SPEAKER 2: Thanks for having me." + pad(3),
    "SPEAKER 1: What about steel?" + pad(2),
    "SPEAKER 2: It worked." + pad(3)],
    expect: { "SPEAKER 1": null, "SPEAKER 2": GUEST } });
add({ id: "E6", title: "“Walt Brannigan is on vacation this week, so you are stuck with me” (full name in the first turn)", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour. Walt Brannigan is on vacation this week, so you are stuck with me." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": GUEST } });
add({ id: "E7", title: "HOST label, “I'm sitting in tonight for Walt Brannigan” (a word between “in” and “for”)", L: L0, lines: [
  "HOST: Good evening, I'm sitting in tonight for Walt Brannigan." + pad(2) + " Joining us now, Marcus Delacroix.",
  "GUEST: Thanks for having me." + pad(3),
  "HOST: What about steel?" + pad(2),
  "GUEST: It worked." + pad(3)],
  expect: { "HOST": null, "GUEST": GUEST } });
add({ id: "E8", title: "HOST label, substitute names herself: “I'm Dana Reyes, in for Walt Brannigan tonight.”", L: L0, lines: [
  "HOST: Good evening, I'm Dana Reyes, in for Walt Brannigan tonight." + pad(2) + " Joining us now, Marcus Delacroix.",
  "GUEST: Thanks for having me." + pad(3),
  "HOST: What about steel?" + pad(2),
  "GUEST: It worked." + pad(3)],
  expect: { "HOST": "Dana Reyes", "GUEST": GUEST } });
add({ id: "E9", title: "Control: “I'm sitting in for Walt Brannigan” (the phrase the code knows)", L: L0, lines: [
  "HOST: Good evening, I'm sitting in for Walt Brannigan." + pad(2) + " Joining us now, Marcus Delacroix.",
  "GUEST: Thanks for having me." + pad(3),
  "HOST: What about steel?" + pad(2),
  "GUEST: It worked." + pad(3)],
  expect: { "HOST": null, "GUEST": GUEST } });
add({ id: "E10", title: "Guest reminisces “I remember filling in for Walt back when he had surgery” (host present)", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me. I remember filling in for Walt back when he had surgery, so this chair feels familiar." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });

/* ---------------- F. diarization errors ---------------- */
add({ id: "F1", title: "Guest's first sentence lands under the host: “…Marcus Delacroix. Hi, I'm Marcus Delacroix, thanks…”", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix. Hi, I'm Marcus Delacroix, thanks for having me.",
  "SPEAKER 2: It is good to be back on the show." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "F2", title: "Guest's turns merged into the host's label; the co-host is the next different label after the intro", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 1: Thanks for having me, it is good to be back." + pad(2),
  "SPEAKER 3: I have a question for him right away." + pad(2),
  "SPEAKER 1: Go ahead." + pad(2),
  "SPEAKER 3: Will the tariffs stay?" + pad(1),
  "SPEAKER 1: I think they will." + pad(3)],
  expect: { "SPEAKER 1": { not: GUEST }, "SPEAKER 3": null } });
add({ id: "F3", title: "Host split across two labels (S1 opens, S3 introduces the guest)", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2),
  "SPEAKER 3: " + pad(1).trim() + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 3: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": { oneOf: [HOST, null] }, "SPEAKER 2": GUEST, "SPEAKER 3": { oneOf: [HOST, null] } } });
add({ id: "F4", title: "Guest's first answer (“Thanks for having me, Walt.”) mislabelled as the host", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Marcus, welcome to the program.",
  "SPEAKER 1: Thanks for having me, Walt. It is good to be back." + pad(2),
  "SPEAKER 1: So what do the steel numbers show?",
  "SPEAKER 2: They show output up eleven percent." + pad(3),
  "SPEAKER 1: And the critics?" + pad(1),
  "SPEAKER 2: They were wrong." + pad(3)],
  expect: { "SPEAKER 1": { oneOf: [HOST, null] }, "SPEAKER 2": { oneOf: [GUEST, null] } } });

/* ---------------- G. formatting ---------------- */
add({ id: "G1", title: "Curly “I’m Pat O’Reilly” vs a listing that writes Pat O'Reilly (straight)", L: { show: "The Night Desk", showPersons: [{ name: "Pat O'Reilly", role: "host" }], episodeTitle: "Late Edition" }, lines: [
  "SPEAKER 1: Good evening, I’m Pat O’Reilly." + pad(2),
  "SPEAKER 2: Evening." + pad(3),
  "SPEAKER 1: Let's start." + pad(2),
  "SPEAKER 2: Sure." + pad(3)],
  expect: { "SPEAKER 1": "Pat O'Reilly", "SPEAKER 2": null } });
add({ id: "G2", title: "Hyphenated self-identification: “Hi, I'm Anne-Marie Duval, and I run the lab.” (no listing)", L: {}, lines: [
  "SPEAKER 1: Good evening." + pad(2) + " So who are you?",
  "SPEAKER 2: Hi, I'm Anne-Marie Duval, and I run the lab." + pad(3),
  "SPEAKER 1: What does the lab do?" + pad(2),
  "SPEAKER 2: Soil tests." + pad(3)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": "Anne-Marie Duval" } });
add({ id: "G3", title: "Accented capital: “I'm Émile Durand” (listed by podcast:person as guest)", L: { show: "The Night Desk", showPersons: [{ name: "Pat Quinn", role: "host" }], episodePersons: [{ name: "Émile Durand", role: "guest" }], episodeTitle: "Wine and Tariffs" }, lines: [
  "SPEAKER 1: Good evening." + pad(2) + " Introduce yourself.",
  "SPEAKER 2: Hello, I'm Émile Durand, and I make wine in Burgundy." + pad(3),
  "SPEAKER 1: How are the tariffs hitting you?" + pad(2),
  "SPEAKER 2: Hard." + pad(3)],
  expect: { "SPEAKER 1": { oneOf: ["Pat Quinn", null] }, "SPEAKER 2": "Émile Durand" } });
add({ id: "G3b", title: "Accented capital, unlisted: “Joining us now, Ángel Ortiz.”", L: {}, lines: [
  "SPEAKER 1: Good evening." + pad(2) + " Joining us now, Ángel Ortiz.",
  "SPEAKER 2: Thank you for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": "Ángel Ortiz" } });
add({ id: "G3c", title: "Name outside Latin-1: “I'm Łukasz Nowak” (no listing)", L: {}, lines: [
  "SPEAKER 1: Good evening." + pad(2) + " Introduce yourself.",
  "SPEAKER 2: Hi, I'm Łukasz Nowak, and I build bridges." + pad(3),
  "SPEAKER 1: Which bridges?" + pad(2),
  "SPEAKER 2: Rail bridges." + pad(3)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": "Łukasz Nowak" } });
add({ id: "G4", title: "Initials: “My name is R. J. Okafor, and I teach economics.” (no listing)", L: {}, lines: [
  "SPEAKER 1: Good evening." + pad(2) + " Introduce yourself.",
  "SPEAKER 2: My name is R. J. Okafor, and I teach economics." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": "R. J. Okafor" } });
add({ id: "G4b", title: "Initials, listed by podcast:person: “I'm R. J. Okafor”", L: { show: "The Night Desk", episodePersons: [{ name: "R. J. Okafor", role: "guest" }], episodeTitle: "Economics" }, lines: [
  "SPEAKER 1: Good evening." + pad(2) + " Introduce yourself.",
  "SPEAKER 2: Hi, I'm R. J. Okafor, and I teach economics." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": "R. J. Okafor" } });
add({ id: "G5", title: "Titles: “Joining us now, Dr. Ruth Okonkwo.” and “I'm Senator Jane Holloway.”", L: {}, lines: [
  "SPEAKER 1: Good evening." + pad(2) + " Joining us now, Dr. Ruth Okonkwo.",
  "SPEAKER 2: Thank you for having me." + pad(3),
  "SPEAKER 1: And on the line, a second guest.",
  "SPEAKER 3: Hello, I'm Senator Jane Holloway, and I chair the committee." + pad(3),
  "SPEAKER 1: Senator, what about steel?" + pad(1),
  "SPEAKER 3: It worked." + pad(2)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": { oneOf: ["Ruth Okonkwo", "Dr. Ruth Okonkwo"] }, "SPEAKER 3": { oneOf: ["Jane Holloway", "Senator Jane Holloway"] } } });
add({ id: "G6", title: "ALL-CAPS transcript", L: L0, lines: [
  "SPEAKER 1: WELCOME TO THE STRAIGHT TALK HOUR." + pad(2).toUpperCase() + " JOINING US NOW, MARCUS DELACROIX.",
  "SPEAKER 2: THANKS FOR HAVING ME, WALT." + pad(3).toUpperCase(),
  "SPEAKER 1: MARCUS, WHAT ABOUT STEEL?" + pad(2).toUpperCase(),
  "SPEAKER 2: IT WORKED." + pad(3).toUpperCase()],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "G7", title: "ASR text: lower case, no punctuation", L: L0, lines: [
  "SPEAKER 1: welcome to the straight talk hour" + pad(2).replace(/[.,]/g, "") + " joining us now marcus delacroix",
  "SPEAKER 2: thanks for having me walt" + pad(3).replace(/[.,]/g, ""),
  "SPEAKER 1: marcus what about steel" + pad(2).replace(/[.,]/g, ""),
  "SPEAKER 2: it worked" + pad(3).replace(/[.,]/g, "")],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "G8", title: "ASR text: cased, no punctuation (“I'm Dana Reyes glad to be here”)", L: {}, lines: [
  "SPEAKER 1: good evening" + pad(2).replace(/[.,]/g, "") + " so who are you",
  "SPEAKER 2: hi I'm Dana Reyes glad to be here" + pad(3).replace(/[.,]/g, ""),
  "SPEAKER 1: what about steel" + pad(2).replace(/[.,]/g, ""),
  "SPEAKER 2: it worked" + pad(3).replace(/[.,]/g, "")],
  expect: { "SPEAKER 1": null, "SPEAKER 2": "Dana Reyes" } });

/* ---------------- H. clips, quotations and advertisements ---------------- */
add({ id: "H1", title: "AD turn: “Hi, I'm Ruth Okonkwo… Marcus, you should try it too.” then the guest", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2),
  "AD 1: Hi, I'm Ruth Okonkwo, and I sleep on Comfy Pillow. Marcus, you should try it too.",
  "SPEAKER 2: Good to be here." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "H2", title: "CLIP turn says “Joining us now, Marcus Delacroix.” then a voice", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Here is how another network did it.",
  "CLIP 1: Good evening. Joining us now, Marcus Delacroix.",
  "SPEAKER 2: That network never lets anyone finish." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "H3", title: "QUOTE turn: “My name is Eleanor Vance” read aloud", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Here is the letter.",
  "QUOTE 1: My name is Eleanor Vance, and I have lived in this house for forty years.",
  "SPEAKER 2: What a letter." + pad(3),
  "SPEAKER 1: Indeed." + pad(2),
  "SPEAKER 2: Yes." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });

/* ---------------- J. role labels ---------------- */
add({ id: "J1", title: "Transcript labelled A: and B: (A is the interviewer)", L: L0, lines: [
  "A: So tell me about the mills." + pad(1),
  "B: They reopened two lines this spring." + pad(3),
  "A: And the critics?" + pad(1),
  "B: They were wrong." + pad(3)],
  expect: { "A": { not: GUEST } } });
add({ id: "J2", title: "Q: / A: labels (control)", L: L0, lines: [
  "Q: So tell me about the mills." + pad(1),
  "A: They reopened two lines this spring." + pad(3),
  "Q: And the critics?" + pad(1),
  "A: They were wrong." + pad(3)],
  expect: { "Q": HOST, "A": GUEST } });
add({ id: "J3", title: "HOST/GUEST labels, no guest listed; host mentions “Last week my guest was Dana Reyes”", L: { show: "The Straight Talk Hour", showAuthor: HOST, episodeTitle: "Steel Week" }, lines: [
  "HOST: Welcome to the Straight Talk Hour." + pad(2) + " Last week my guest was Dana Reyes, and you all wrote in.",
  "GUEST: Thanks for having me." + pad(3),
  "HOST: What about steel?" + pad(2),
  "GUEST: It worked." + pad(3)],
  expect: { "HOST": HOST, "GUEST": null } });

/* ---------------- K. the host's own opening ---------------- */
add({ id: "K1", title: "“I'm your host, Walt Brannigan.” then a co-host who never says his name", L: LH, lines: [
  "SPEAKER 1: Good evening and welcome to the Straight Talk Hour. I'm your host, Walt Brannigan." + pad(2),
  "SPEAKER 2: Big show tonight." + pad(3),
  "SPEAKER 1: It is." + pad(2),
  "SPEAKER 2: Let's get to it." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "K2", title: "“Good evening, Walt Brannigan here, and this is the Straight Talk Hour.” then a co-host", L: LH, lines: [
  "SPEAKER 1: Good evening, Walt Brannigan here, and this is the Straight Talk Hour." + pad(2),
  "SPEAKER 2: Big show tonight." + pad(3),
  "SPEAKER 1: It is." + pad(2),
  "SPEAKER 2: Let's get to it." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "K2b", title: "“Welcome back to the show, Walt Brannigan here.” then a co-host", L: LH, lines: [
  "SPEAKER 1: Welcome back to the show, Walt Brannigan here." + pad(2),
  "SPEAKER 2: Big show tonight." + pad(3),
  "SPEAKER 1: It is." + pad(2),
  "SPEAKER 2: Let's get to it." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "K3", title: "Host says the show's possessive name: “welcome to Walt Brannigan’s Straight Talk Hour” then a co-host", L: LH, lines: [
  "SPEAKER 1: Good evening and welcome to Walt Brannigan’s Straight Talk Hour." + pad(2),
  "SPEAKER 2: Big show tonight." + pad(3),
  "SPEAKER 1: It is." + pad(2),
  "SPEAKER 2: Let's get to it." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "K4", title: "Listed host opens with “Hey everybody, it's Dana Reyes.”", L: { show: "The Long Game", showAuthor: "Dana Reyes", episodeTitle: "Housing" }, lines: [
  "SPEAKER 1: Hey everybody, it's Dana Reyes." + pad(2) + " Today, a conversation about housing.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What is driving the prices?" + pad(2),
  "SPEAKER 2: Supply." + pad(3)],
  expect: { "SPEAKER 1": "Dana Reyes", "SPEAKER 2": null } });
add({ id: "K5", title: "Listed host opens with “Hey everybody, Dana here.” (no stock opening phrase)", L: { show: "The Long Game", showAuthor: "Dana Reyes", episodeTitle: "Housing" }, lines: [
  "SPEAKER 1: Hey everybody, Dana here." + pad(2),
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What is driving the prices?" + pad(2),
  "SPEAKER 2: Supply." + pad(3)],
  expect: { "SPEAKER 1": "Dana Reyes", "SPEAKER 2": null } });
add({ id: "K6", title: "Phone guest: “Hi Walt, this is Marcus Delacroix.” (app alone, no model)", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " We have a guest on the phone.",
  "SPEAKER 2: Hi Walt, this is Marcus Delacroix. Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });

/* ---------------- L. the model's clues ---------------- */
add({ id: "L1", title: "Model self_reference: a caller who also worked the Gary mill (+ automatic “listed”)", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Steel — Marcus Delacroix", description: "Marcus Delacroix worked at the Gary steel mill for thirty years before he ran trade policy." }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Let's go to the phones.",
  "SPEAKER 3: Hi, long time listener. I worked at the Gary steel mill for thirty years myself, and I can tell you the numbers are real." + pad(2),
  "SPEAKER 1: Thanks for the call." + pad(2),
  "SPEAKER 3: Thank you." + pad(2)],
  model: () => ({ voices: [{ label: "SPEAKER 3", name: "Marcus Delacroix", evidence: [{ kind: "self_reference", turn: 1, quote: "I worked at the Gary steel mill for thirty years myself", listingQuote: "Marcus Delacroix worked at the Gary steel mill for thirty years" }] }], unnamed: [] }),
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": null } });
add({ id: "L2", title: "Model self_identification from a possessive: “I'm Marcus Delacroix's biggest critic”", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Let's go to the phones.",
  "SPEAKER 2: Hi, long time listener. I'm Marcus Delacroix's biggest critic, and I want to say why." + pad(3),
  "SPEAKER 1: Go ahead." + pad(2),
  "SPEAKER 2: The mills did not reopen." + pad(3)],
  model: () => ({ voices: [{ label: "SPEAKER 2", name: "Marcus Delacroix", evidence: [{ kind: "self_identification", turn: 1, quote: "I'm Marcus Delacroix's biggest critic" }] }], unnamed: [] }),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "L3", title: "Model self_identification from “This is Marcus Delacroix's plan” (host's words)", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " This is Marcus Delacroix's plan, and it is a bad one.",
  "SPEAKER 2: I agree it is bad." + pad(3),
  "SPEAKER 1: Why?" + pad(2),
  "SPEAKER 2: The numbers." + pad(3)],
  model: () => ({ voices: [{ label: "SPEAKER 1", name: "Marcus Delacroix", evidence: [{ kind: "self_identification", turn: 0, quote: "This is Marcus Delacroix's plan" }] }], unnamed: [] }),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "L4", title: "Model self_identification for a word that is not a name: “I am Catholic” → name “Catholic”", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Let's go to the phones.",
  "SPEAKER 2: Hi. I am Catholic, and I think the bishops got this one wrong." + pad(3),
  "SPEAKER 1: Go ahead." + pad(2),
  "SPEAKER 2: Thanks." + pad(3)],
  model: () => ({ voices: [{ label: "SPEAKER 2", name: "Catholic", evidence: [{ kind: "self_identification", turn: 1, quote: "I am Catholic, and I think" }] }], unnamed: [] }),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });

/* ---------------- N. who opens the show ---------------- */
add({ id: "N1", title: "Announcer with two bumpers (main by turns) opens: “You're listening to the Straight Talk Hour.”", L: L0, lines: [
  "SPEAKER 3: You're listening to the Straight Talk Hour.",
  "SPEAKER 1: Good evening." + pad(3) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(1),
  "SPEAKER 2: It worked." + pad(3),
  "SPEAKER 3: The Straight Talk Hour continues after this.",
  "SPEAKER 1: And we're back." + pad(1),
  "SPEAKER 2: Thanks." + pad(3),
  "SPEAKER 1: Last question." + pad(1),
  "SPEAKER 2: Sure." + pad(2)],
  expect: { "SPEAKER 1": { oneOf: [HOST, null] }, "SPEAKER 2": GUEST, "SPEAKER 3": null } });
add({ id: "N2", title: "Cold open: the guest speaks first and mentions “Straight Talk”; host introduces him without his name", L: { show: "The Straight Talk Hour", showAuthor: HOST, episodeTitle: "Steel" }, lines: [
  "SPEAKER 2: Honestly, Straight Talk is the only show I still do, because nobody else lets me finish a sentence." + pad(2),
  "SPEAKER 1: Welcome to the Straight Talk Hour. My guest tonight ran trade policy for six years." + pad(2),
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(1),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "N3", title: "Host speaks first without a stock phrase; co-host's first turn contains “this is the”", L: LH, lines: [
  "SPEAKER 1: Good evening, everybody." + pad(2),
  "SPEAKER 2: Honestly, this is the week everything changed for steel." + pad(3),
  "SPEAKER 1: It is." + pad(2),
  "SPEAKER 2: Let's get to it." + pad(3)],
  expect: { "SPEAKER 1": { oneOf: [HOST, null] }, "SPEAKER 2": null } });

/* ---------------- O/P/T. vocatives credited to whoever speaks next; tie-break ---------------- */
add({ id: "O1", title: "Control: “Marcus, hold that thought… Go ahead, you're on the air.” then a caller (guest introduced)", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: Marcus, hold that thought, because the phones are lit up." + pad(1) + " Let's go to Muncie. Go ahead, you're on the air.",
  "SPEAKER 3: Hi, thanks for taking my call." + pad(3),
  "SPEAKER 1: Marcus, your response?",
  "SPEAKER 2: She is right." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST, "SPEAKER 3": null } });
add({ id: "O2", title: "Panel: “Marcus, you first.” but the other guest jumps in; two names in one introduction", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Steel — Marcus Delacroix and Jane Holloway" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix and Jane Holloway. Marcus, you first.",
  "SPEAKER 3: Sorry, can I jump in before he starts? The steel numbers are a mirage." + pad(3),
  "SPEAKER 2: That is just not true." + pad(3),
  "SPEAKER 1: Let's take a short break." + pad(1),
  "SPEAKER 3: Fine by me." + pad(2),
  "SPEAKER 2: Fine." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: "Jane Holloway" }, "SPEAKER 3": { not: GUEST } } });
add({ id: "P1", title: "Guest ends “And thanks, Walt.”, then the co-host speaks: does the host keep his name?", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3) + " And thanks, Walt.",
  "SPEAKER 3: Marcus, I have to push back on that." + pad(2),
  "SPEAKER 2: Go ahead." + pad(2),
  "SPEAKER 1: Let's take a break." + pad(1),
  "SPEAKER 3: Sure." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST, "SPEAKER 3": null } });
add({ id: "T1", title: "Phone guest drops after one line; host calls “Marcus, are you there?” and the co-host answers (twice)", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now on the phone, Marcus Delacroix.",
  "SPEAKER 3: Thanks, good to be on.",
  "SPEAKER 1: Marcus, are you there?",
  "SPEAKER 2: I think we lost him." + pad(2),
  "SPEAKER 1: Marcus, can you hear us?",
  "SPEAKER 2: Still nothing. The producer is calling him back." + pad(3),
  "SPEAKER 1: We will try again later." + pad(2),
  "SPEAKER 2: Good idea." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null, "SPEAKER 3": { oneOf: [GUEST, null] } } });

/* ---------------- controls (should already work) ---------------- */
add({ id: "Z1", title: "Control: the clean case (host opens, guest introduced in full)", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "Z2", title: "Control: “I'm no Walt Brannigan” style negation never self-identifies (no guest)", L: LH, lines: [
  "SPEAKER 1: Hi. I'm not Walt Brannigan, I just produce the show." + pad(2),
  "SPEAKER 2: And I'm the engineer." + pad(3),
  "SPEAKER 1: Walt will be back tomorrow." + pad(2),
  "SPEAKER 2: Yes." + pad(3)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": { not: HOST } } });
add({ id: "Z3", title: "Control: caller “Yeah, hi, this is Dana Reyes from Bloomington.”", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Line one, go ahead.",
  "SPEAKER 2: Yeah, hi, this is Dana Reyes from Bloomington." + pad(3),
  "SPEAKER 1: What's on your mind?" + pad(2),
  "SPEAKER 2: Steel." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Dana Reyes" } });
add({ id: "Z4", title: "Control: co-host listed by podcast:person, introduced “I'm here with my co-host, Dana Reyes.”", L: { show: SHOW, showPersons: [{ name: HOST, role: "host" }, { name: "Dana Reyes", role: "co-host" }], episodeTitle: "Steel Week" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour. I'm here with my co-host, Dana Reyes.",
  "SPEAKER 2: Good evening." + pad(3),
  "SPEAKER 1: Big week." + pad(3),
  "SPEAKER 2: It was." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Dana Reyes" } });
add({ id: "Z5", title: "Control: two guests sharing a first name, app only (“Marcus, you first.”)", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Steel — Marcus Delacroix and Marcus Webb" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Two guests named Marcus tonight. Marcus, you first.",
  "SPEAKER 2: Thanks." + pad(3),
  "SPEAKER 1: And the other Marcus?" + pad(1),
  "SPEAKER 3: Glad to be here." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null, "SPEAKER 3": null } });
add({ id: "Z6", title: "Control: “Thanks for having me, Walt” heard under the host at a turn's edge (the code's own case)", L: L0, lines: [
  "SPEAKER 1: Hi, I'm Walt Brannigan." + pad(2) + " Joining us now, Marcus Delacroix. Marcus, thanks for coming on. Thanks for having me, Walt.",
  "SPEAKER 2: It's good to be here." + pad(4),
  "SPEAKER 1: What about steel?" + pad(1),
  "SPEAKER 2: It worked." + pad(4)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });

/* ---------------- round 2: variants that remove the accidents, and new probes ---------------- */
const PLAIN = "Episode 212: life after the mill"; // a title with no person-like words
add({ id: "E4b", title: "E4 with a plain episode title: substitute “I'm Dana Reyes, in for Walt tonight”, unnamed guest", L: { show: SHOW, showAuthor: HOST, episodeTitle: PLAIN }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour. I'm Dana Reyes, in for Walt tonight." + pad(2) + " My guest is a steelworker from Gary who asked us not to use his name.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What happened at the mill?" + pad(2),
  "SPEAKER 2: They shut the second line." + pad(3)],
  expect: { "SPEAKER 1": "Dana Reyes", "SPEAKER 2": null } });
add({ id: "E1b", title: "E1 with title “Marcus Delacroix: wrong again” (subject only); vocative before a CLIP; co-host left", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Marcus Delacroix: wrong again" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Tonight we take apart the speech Marcus Delacroix gave on Monday. Marcus, if you are listening, here is your own voice.",
  "CLIP 1: The mills will reopen by the summer, every one of them.",
  "SPEAKER 2: Well, that aged badly." + pad(3),
  "SPEAKER 1: Not one mill reopened." + pad(2),
  "SPEAKER 2: Not a single one of them." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "J4", title: "HOST/GUEST labels; the episode title “Steel Town Stories” is taken for the guest's name", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Steel Town Stories" }, lines: [
  "HOST: Welcome to the Straight Talk Hour." + pad(2) + " My guest tonight grew up in Gary.",
  "GUEST: Thanks for having me." + pad(3),
  "HOST: What was it like?" + pad(2),
  "GUEST: Loud." + pad(3)],
  expect: { "HOST": HOST, "GUEST": null } });
add({ id: "Z4b", title: "Z4 with a plain title: co-host listed by podcast:person, “I'm here with my co-host, Dana Reyes.”", L: { show: SHOW, showPersons: [{ name: HOST, role: "host" }, { name: "Dana Reyes", role: "co-host" }], episodeTitle: PLAIN }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour. I'm here with my co-host, Dana Reyes.",
  "SPEAKER 2: Good evening." + pad(3),
  "SPEAKER 1: Big week." + pad(3),
  "SPEAKER 2: It was." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Dana Reyes" } });
add({ id: "T1b", title: "T1 with “Marcus Delacroix joins us now on the phone.”: line drops, co-host answers “Marcus, are you there?” twice", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Marcus Delacroix joins us now on the phone.",
  "SPEAKER 3: Thanks, good to be on.",
  "SPEAKER 1: Marcus, are you there?",
  "SPEAKER 2: I think we lost him." + pad(2),
  "SPEAKER 1: Marcus, can you hear us?",
  "SPEAKER 2: Still nothing. The producer is calling him back." + pad(3),
  "SPEAKER 1: We will try again later." + pad(2),
  "SPEAKER 2: Good idea." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null, "SPEAKER 3": { oneOf: [GUEST, null] } } });
add({ id: "C3b", title: "C3 with a co-host present: guest Dana Price's “Price, in the end…” rejects her own introduction", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Markets — Dana Price" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Dana Price.",
  "SPEAKER 2: Thanks for having me." + pad(3) + " Price, in the end, is what drives this market.",
  "SPEAKER 3: I am not sure I agree with that." + pad(2),
  "SPEAKER 1: Say more about that." + pad(2),
  "SPEAKER 2: Gladly." + pad(3),
  "SPEAKER 3: Fair." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Dana Price", "SPEAKER 3": null } });
add({ id: "A6b", title: "A6 with “Marcus Delacroix joins us now.”: guest quoting his stepfather “I'm Frank Ruiz…”", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Marcus Delacroix joins us now.",
  "SPEAKER 2: Thanks for having me. My stepfather worked the mill, and he used to say, “I'm Frank Ruiz, and I don't back down.”" + pad(3),
  "SPEAKER 1: That sounds like a mill town." + pad(2),
  "SPEAKER 2: It was." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "D8", title: "Business show: “Joining us now from Harbor Ridge Capital, their chief economist.”", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now from Harbor Ridge Capital, their chief economist.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: Rates?" + pad(2),
  "SPEAKER 2: Higher." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "D9", title: "“My guest tonight is a retired Army Ranger.”", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " My guest tonight is a retired Army Ranger.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: Where did you serve?" + pad(2),
  "SPEAKER 2: Overseas." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "D9b", title: "“My guest tonight is a former Navy SEAL.”", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " My guest tonight is a former Navy SEAL.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: Where did you serve?" + pad(2),
  "SPEAKER 2: Overseas." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "M1", title: "Transcript labels the host “WALT:”; the unnamed guest gets “Walt Brannigan” by elimination", L: { show: SHOW, showAuthor: HOST, episodeTitle: PLAIN }, lines: [
  "WALT: Welcome to the Straight Talk Hour." + pad(2) + " Tonight, a steelworker from Gary who asked us not to use his name.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "WALT: What happened at the mill?" + pad(2),
  "SPEAKER 2: They shut the second line." + pad(3)],
  expect: { "SPEAKER 2": null } });
add({ id: "M1b", title: "Transcript labels the host “BRANNIGAN:”; the unnamed guest", L: { show: SHOW, showAuthor: HOST, episodeTitle: PLAIN }, lines: [
  "BRANNIGAN: Welcome to the Straight Talk Hour." + pad(2) + " Tonight, a steelworker from Gary who asked us not to use his name.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "BRANNIGAN: What happened at the mill?" + pad(2),
  "SPEAKER 2: They shut the second line." + pad(3)],
  expect: { "SPEAKER 2": null } });
add({ id: "B9", title: "A stage direction “[APPLAUSE]” between “Marcus Delacroix is with us now.” and the guest (co-host present)", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Marcus Delacroix is with us now.",
  "",
  "[APPLAUSE]",
  "",
  "SPEAKER 2: Thanks for having me, it is good to be back." + pad(3),
  "SPEAKER 3: Glad you could make it." + pad(2),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST, "SPEAKER 3": null } });
add({ id: "C5", title: "Control: “Mr. President, if you're listening…” (no listed person) before a co-host", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Mr. President, if you're listening, the mills did not reopen.",
  "SPEAKER 2: He is not listening." + pad(3),
  "SPEAKER 1: Probably not." + pad(2),
  "SPEAKER 2: No." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });

/* the show's own two-word name read as a person */
const CG = { show: "Common Ground", showAuthor: "Dana Reyes", episodeTitle: PLAIN };
add({ id: "D10", title: "Show “Common Ground”: “Welcome to Common Ground.” then a guest described, not named", L: CG, lines: [
  "SPEAKER 1: Welcome to Common Ground." + pad(2) + " My guest tonight grew up in Gary.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What was it like?" + pad(2),
  "SPEAKER 2: Loud." + pad(3)],
  expect: { "SPEAKER 1": "Dana Reyes", "SPEAKER 2": null } });
add({ id: "D10b", title: "Show “Common Ground”: “Welcome to Common Ground. Joining me now, Lee Park.” (guest unlisted)", L: CG, lines: [
  "SPEAKER 1: Welcome to Common Ground." + pad(2) + " Joining me now, Lee Park.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What was it like?" + pad(2),
  "SPEAKER 2: Loud." + pad(3)],
  expect: { "SPEAKER 1": "Dana Reyes", "SPEAKER 2": "Lee Park" } });
const OR = { show: "Open Range", showAuthor: "Dana Reyes", episodeTitle: PLAIN };
add({ id: "D11", title: "Show “Open Range”: host opens “This is Open Range. I'm Dana Reyes.”", L: OR, lines: [
  "SPEAKER 1: This is Open Range. I'm Dana Reyes." + pad(2),
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What was it like?" + pad(2),
  "SPEAKER 2: Loud." + pad(3)],
  expect: { "SPEAKER 1": "Dana Reyes", "SPEAKER 2": null } });
add({ id: "D11b", title: "Show “Open Range”: host opens “This is Open Range.” (no self-naming)", L: OR, lines: [
  "SPEAKER 1: This is Open Range." + pad(2),
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What was it like?" + pad(2),
  "SPEAKER 2: Loud." + pad(3)],
  expect: { "SPEAKER 1": { oneOf: ["Dana Reyes", null] }, "SPEAKER 2": null } });

/* round 3 */
add({ id: "E9b", title: "HOST label, the known phrase but the next sentence starts with a capital: “…sitting in for Walt Brannigan. Joining us now, …”", L: L0, lines: [
  "HOST: Good evening, I'm sitting in for Walt Brannigan. Joining us now, Marcus Delacroix.",
  "GUEST: Thanks for having me." + pad(3),
  "HOST: What about steel?" + pad(2),
  "GUEST: It worked." + pad(3)],
  expect: { "HOST": null, "GUEST": GUEST } });
add({ id: "E9c", title: "SPEAKER labels, same: “Good evening, I'm sitting in for Walt Brannigan. Tonight, …”", L: L0, lines: [
  "SPEAKER 1: Good evening, I'm sitting in for Walt Brannigan. Tonight, the steel numbers." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": GUEST } });
const SUBJ = { show: SHOW, showAuthor: HOST, episodeTitle: "Marcus Delacroix: wrong again" };
add({ id: "E11", title: "Subject episode; a caller says “Hi, my name is Marcus, and I think he is right.” (first-name completion)", L: SUBJ, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Tonight, the speech everyone is talking about. Line one, go ahead.",
  "SPEAKER 2: Hi, my name is Marcus, and I think he is right about the mills." + pad(3),
  "SPEAKER 1: Why?" + pad(2),
  "SPEAKER 2: Because I work there." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "E11c", title: "Subject episode; “On the line now is Marcus from Gary.” then the caller", L: SUBJ, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " On the line now is Marcus from Gary.",
  "SPEAKER 2: Hi, thanks for taking my call." + pad(3),
  "SPEAKER 1: Go ahead." + pad(2),
  "SPEAKER 2: The mill is hiring." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "E12", title: "Listed host Dana Reyes; a caller: “Yeah, hi, my name is Dana Hall, calling from Muncie.” (surname is a stop word)", L: { show: "The Long Game", showAuthor: "Dana Reyes", episodeTitle: PLAIN }, lines: [
  "SPEAKER 1: Welcome to the Long Game." + pad(2) + " Line one, go ahead.",
  "SPEAKER 2: Yeah, hi, my name is Dana Hall, calling from Muncie." + pad(3),
  "SPEAKER 1: What's on your mind?" + pad(2),
  "SPEAKER 2: Housing." + pad(3)],
  expect: { "SPEAKER 1": "Dana Reyes", "SPEAKER 2": { oneOf: ["Dana Hall", null] } } });
add({ id: "E12b", title: "E12 without the show-name opening: caller “my name is Dana Hall” vs listed host Dana Reyes", L: { show: "The Long Game", showAuthor: "Dana Reyes", episodeTitle: PLAIN }, lines: [
  "SPEAKER 1: Good evening, you're listening to the Long Game." + pad(2) + " Line one, go ahead.",
  "SPEAKER 2: Yeah, hi, my name is Dana Hall, calling from Muncie." + pad(3),
  "SPEAKER 1: What's on your mind?" + pad(2),
  "SPEAKER 2: Housing." + pad(3)],
  expect: { "SPEAKER 1": "Dana Reyes", "SPEAKER 2": { oneOf: ["Dana Hall", null] } } });
add({ id: "G9", title: "Guest with a stop-word surname: title “— Jane Wood”, “Joining us now, Jane Wood.”", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Housing — Jane Wood" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Jane Wood.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about housing?" + pad(2),
  "SPEAKER 2: It is expensive." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Jane Wood" } });
add({ id: "B1b", title: "Teaser with no ad: “After the break, my guest is Marcus Delacroix.” — co-host answers; guest later “Marcus, thanks for waiting.”", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " After the break, my guest is Marcus Delacroix.",
  "SPEAKER 3: Can't wait for that one." + pad(2),
  "SPEAKER 1: And we're back. Marcus, thanks for waiting.",
  "SPEAKER 2: Happy to be here." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3),
  "SPEAKER 3: I am not so sure." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST, "SPEAKER 3": null } });

/* round 4: common-word names, teasers, subject titles, controls */
add({ id: "CW1", title: "Guest “Hope Lawson” (title) joins later; host: “Hope, that is all these towns have left.” then the co-host", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Mill Towns — Hope Lawson" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " The mills are gone and the young people are leaving. Hope, that is all these towns have left.",
  "SPEAKER 2: And not much of it." + pad(3),
  "SPEAKER 1: Our guest joins us in the second half." + pad(2),
  "SPEAKER 2: Good." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "CW2", title: "Guest “Dana Rich” (title) joins later; host: “Rich, poor, everyone pays the tariff.” then the co-host", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Tariffs — Dana Rich" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Rich, poor, everyone pays the tariff.",
  "SPEAKER 2: Especially the poor." + pad(3),
  "SPEAKER 1: Our guest joins us in the second half." + pad(2),
  "SPEAKER 2: Good." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "B10", title: "Announcer bumper right after “Joining us now, Marcus Delacroix.”, then the guest", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 3: You're listening to the Straight Talk Hour on WXYZ, your voice in the valley.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [GUEST, null] }, "SPEAKER 3": null } });
add({ id: "B11", title: "“Coming up after the break, Marcus Delacroix.” then the co-host", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Coming up after the break, Marcus Delacroix.",
  "SPEAKER 2: Can't wait for that one." + pad(3),
  "SPEAKER 1: First, the mail." + pad(2),
  "SPEAKER 2: Go ahead." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "E1c", title: "Headline title “The Trouble With Marcus Delacroix”; host: “Marcus, if you are listening…” then the co-host", L: { show: SHOW, showAuthor: HOST, episodeTitle: "The Trouble With Marcus Delacroix" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Marcus, if you are listening, the mills did not reopen.",
  "SPEAKER 2: Not one." + pad(3),
  "SPEAKER 1: Not one." + pad(2),
  "SPEAKER 2: No." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "C6", title: "Control: the brief's title “Why Marcus Delacroix Is Wrong”, host criticises him, co-host replies", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Why Marcus Delacroix Is Wrong" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Tonight, why Marcus Delacroix is wrong about steel.",
  "SPEAKER 2: Where do we start?" + pad(3),
  "SPEAKER 1: With the numbers." + pad(2),
  "SPEAKER 2: Fine." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "C7", title: "Control: “Last week we had Dana Reyes on” and “Marcus Delacroix couldn't make it tonight.” then the co-host", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Last week we had Dana Reyes on. Marcus Delacroix couldn't make it tonight.",
  "SPEAKER 2: Too bad." + pad(3),
  "SPEAKER 1: Next week, then." + pad(2),
  "SPEAKER 2: Sure." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "G2b", title: "Control: hyphenated name in an introduction: “Joining us now, Anne-Marie Duval.” (no listing)", L: {}, lines: [
  "SPEAKER 1: Good evening." + pad(2) + " Joining us now, Anne-Marie Duval.",
  "SPEAKER 2: Thank you." + pad(3),
  "SPEAKER 1: What does the lab do?" + pad(2),
  "SPEAKER 2: Soil tests." + pad(3)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": "Anne-Marie Duval" } });
add({ id: "G1b", title: "Control: “Joining us now, Pat O’Reilly.” / “Thanks, Pat.” with a listing that writes Pat O'Reilly", L: { show: SHOW, showAuthor: HOST, episodePersons: [{ name: "Pat O'Reilly", role: "guest" }], episodeTitle: PLAIN }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now, Pat O’Reilly.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: Pat, what about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Pat O'Reilly" } });

for (const [id, open] of [["K1g", "Good evening and welcome to the Straight Talk Hour. I'm your host, Walt Brannigan."], ["K2g", "Good evening, Walt Brannigan here, and this is the Straight Talk Hour."], ["K3g", "Good evening and welcome to Walt Brannigan’s Straight Talk Hour."]])
  add({ id, title: "Host opening “" + open + "” then “Joining us now, Marcus Delacroix.”", L: L0, lines: [
    "SPEAKER 1: " + open + pad(2) + " Joining us now, Marcus Delacroix.",
    "SPEAKER 2: Thanks for having me." + pad(3),
    "SPEAKER 1: What about steel?" + pad(2),
    "SPEAKER 2: It worked." + pad(3)],
    expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });

/* ---------------- N. long sentences and lower-case captions ---------------- */
const lc = x => x.toLowerCase().replace(/[.,?!;:“”"]/g, "").replace(/’/g, "'");
add({ id: "N1", title: "A run-on sentence of 40+ words ends “…, joining us now, Marcus Delacroix.”", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(1) + " Tonight we have the steel numbers, the tariff vote, the strike at the plant in Gary, the price of coal, the new rules on imports and exports, and to make sense of all of it, joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "N2", title: "Captions: “last week” early in a long turn, “joining us now marcus delacroix” at its end", L: L0, lines: [
  "SPEAKER 1: " + lc("Welcome to the Straight Talk Hour. Last week we talked about coal." + pad(3) + " Joining us now, Marcus Delacroix."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(3)),
  "SPEAKER 1: " + lc("What about steel?" + pad(2)),
  "SPEAKER 2: " + lc("It worked." + pad(3))],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "N3", title: "Captions: a teaser “coming up later in the hour joining us will be marcus delacroix”, then an ad voice", L: L0, lines: [
  "SPEAKER 1: " + lc("Welcome to the Straight Talk Hour." + pad(3) + " Coming up later in the hour, joining us will be Marcus Delacroix."),
  "SPEAKER 3: " + lc("This hour is brought to you by Comfy Pillow. Go to comfypillow dot com."),
  "SPEAKER 1: " + lc("And we are back." + pad(2) + " What about steel?"),
  "SPEAKER 2: " + lc("It worked, and the mills are hiring." + pad(3)),
  "SPEAKER 1: " + lc("Right." + pad(1)),
  "SPEAKER 2: " + lc("Yes." + pad(3))],
  expect: { "SPEAKER 3": null, "SPEAKER 2": { oneOf: [GUEST, null] }, "SPEAKER 1": HOST } });
add({ id: "N4", title: "Captions, no listing: “hi i'm dana reyes glad to be here” with the model's correct clue", L: {}, lines: [
  "SPEAKER 1: " + lc("Good evening." + pad(2) + " So who are you?"),
  "SPEAKER 2: " + lc("Hi, I'm Dana Reyes, glad to be here." + pad(3)),
  "SPEAKER 1: " + lc("What about steel?" + pad(2)),
  "SPEAKER 2: " + lc("It worked." + pad(3))],
  model: () => ({ voices: [{ label: "SPEAKER 2", name: "Dana Reyes", evidence: [{ kind: "self_identification", turn: 1, quote: "hi i'm dana reyes glad to be here" }] }], unnamed: [] }),
  expect: { "SPEAKER 1": null, "SPEAKER 2": "Dana Reyes" } });
add({ id: "N5", title: "Captions: “i'm not sure dana reyes is right” offered by the model as self-identification", L: {}, lines: [
  "SPEAKER 1: " + lc("Good evening." + pad(2) + " What do you make of the survey?"),
  "SPEAKER 2: " + lc("I'm not sure Dana Reyes is right about that." + pad(3)),
  "SPEAKER 1: " + lc("Why?" + pad(2)),
  "SPEAKER 2: " + lc("The sample." + pad(3))],
  model: () => ({ voices: [{ label: "SPEAKER 2", name: "Dana Reyes", evidence: [{ kind: "self_identification", turn: 1, quote: "i'm not sure dana reyes is right" }] }], unnamed: [] }),
  expect: { "SPEAKER 1": null, "SPEAKER 2": null } });
add({ id: "N6", title: "Captions, subject episode: a caller “hi this is marcus from gary” (no capitals to show a place)", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Marcus Delacroix: wrong again" }, lines: [
  "SPEAKER 1: " + lc("Welcome to the Straight Talk Hour." + pad(2) + " Line one, go ahead."),
  "SPEAKER 2: " + lc("Hi, this is Marcus from Gary, and I think he is right about the mills." + pad(3)),
  "SPEAKER 1: " + lc("Why?" + pad(2)),
  "SPEAKER 2: " + lc("Because I work there." + pad(3))],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "N7", title: "Captions: “hi i'm your host walt brannigan”", L: L0, lines: [
  "SPEAKER 1: " + lc("Hi, I'm your host, Walt Brannigan." + pad(3)),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(3)),
  "SPEAKER 1: " + lc("What about steel?" + pad(2)),
  "SPEAKER 2: " + lc("It worked." + pad(3))],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [GUEST, null] } } });

add({ id: "N8", title: "Pasted text, no listing: “Good evening, I'm your host, Walt Brannigan.” and “Hi, I'm Dana Reyes.”", L: {}, lines: [
  "SPEAKER 1: Good evening, I'm your host, Walt Brannigan." + pad(2) + " Who do we have tonight?",
  "SPEAKER 2: Hi, I'm Dana Reyes, and I run the survey lab." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Dana Reyes" } });
add({ id: "N9", title: "Pasted text, no listing: “This is your host for the hour, Walt Brannigan, and tonight…”", L: {}, lines: [
  "SPEAKER 1: This is your host for the hour, Walt Brannigan, and tonight we look at steel." + pad(2),
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "N10", title: "Pasted text: a guest says “I'm your biggest fan, Walt Brannigan.” (not a host form)", L: {}, lines: [
  "SPEAKER 1: Good evening." + pad(2) + " Who is on the line?",
  "SPEAKER 2: I'm your biggest fan, Walt Brannigan. I listen every night." + pad(3),
  "SPEAKER 1: Thank you." + pad(2),
  "SPEAKER 2: Sure." + pad(3)],
  expect: { "SPEAKER 1": { oneOf: [HOST, null] }, "SPEAKER 2": { not: HOST } } });

/* model-supplied clues for cases the app misses: does the shared check accept a correct clue? */
const intro = (key, name, turn, quote) => ({ voices: [{ label: key, name, evidence: [{ kind: "introduced", turn, quote }] }], unnamed: [] });
const selfId = (key, name, turn, quote) => ({ voices: [{ label: key, name, evidence: [{ kind: "self_identification", turn, quote }] }], unnamed: [] });
const byId = id => S.find(s => s.id === id);
for (const [id, model] of [
  ["K6", selfId("SPEAKER 2", GUEST, 1, "Hi Walt, this is Marcus Delacroix")],
  ["G2", selfId("SPEAKER 2", "Anne-Marie Duval", 1, "Hi, I'm Anne-Marie Duval, and I run the lab")],
  ["G3", selfId("SPEAKER 2", "Émile Durand", 1, "Hello, I'm Émile Durand, and I make wine in Burgundy")],
  ["G3c", selfId("SPEAKER 2", "Łukasz Nowak", 1, "Hi, I'm Łukasz Nowak, and I build bridges")],
  ["G4", selfId("SPEAKER 2", "R. J. Okafor", 1, "My name is R. J. Okafor, and I teach economics")],
  ["G5", selfId("SPEAKER 3", "Jane Holloway", 3, "Hello, I'm Senator Jane Holloway, and I chair the committee")],
  ["G6", intro("SPEAKER 2", GUEST, 0, "JOINING US NOW, MARCUS DELACROIX")],
  ["D3", intro("SPEAKER 2", "Dana Reyes", 0, "Joining me now from New York, Dana Reyes")],
  ["B6", intro("SPEAKER 2", GUEST, 0, "Marcus Delacroix joins us now")],
  ["K4", selfId("SPEAKER 1", "Dana Reyes", 0, "Hey everybody, it's Dana Reyes")],
]) { const b = byId(id); add(Object.assign({}, b, { id: id + "m", title: b.title + " — WITH a correct model clue", model: () => model })); }

module.exports = { S, SHOW, HOST, GUEST, EP, L0, LH };
