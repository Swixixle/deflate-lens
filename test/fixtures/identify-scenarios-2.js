"use strict";
/* Round 2 adversarial scenarios for server/identify.js. Invented people and shows only; no lyrics.
   expect: { KEY: "Name" | null | { not: "Name" } | { oneOf: [...] } } — what a careful human concludes.
   mech: the code path probed; diag: the one-line suspected cause (printed by run2.js for failures).
   None of these repeats a scenario in identify-scenarios.js. */
const { pad } = require("./identify-pad");

const SHOW = "Walt Brannigan’s Straight Talk Hour", HOST = "Walt Brannigan", GUEST = "Marcus Delacroix";
const LH = { show: SHOW, showAuthor: HOST, episodeTitle: "Episode 212: life after the mill" };          // host only, plain title
const L0 = { show: SHOW, showAuthor: HOST, episodeTitle: "We’ll Do It LIVE! — Marcus Delacroix" };      // host + guest (title)
const SUBJ = { show: SHOW, showAuthor: HOST, episodeTitle: "Marcus Delacroix: wrong again" };           // the title names a subject
const DSUBJ = { show: SHOW, showAuthor: HOST, episodeTitle: "Dana Reyes: the senator who changed her mind" };
const LG2 = { show: "The Long Game", showAuthor: "Pat Quinn", episodeTitle: "Housing — Dana Reyes and Marcus Webb" };
const H_ = { oneOf: [HOST, null] };
const lc = x => x.toLowerCase().replace(/[.,?!;:“”"—]/g, "").replace(/’/g, "'");   // captions: no capitals, no punctuation
const UP = x => x.toUpperCase();
const S = [];
const add = s => S.push(s);
// a host turn with the probe sentence, a second voice's reply, then two neutral turns
const four = (probe, reply, L) => ({ L: L || LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " " + probe,
  "SPEAKER 2: " + reply + pad(3),
  "SPEAKER 1: Let's get into it." + pad(2),
  "SPEAKER 2: Go ahead." + pad(3)] });
// a host introduction, the guest's stock reply, then two neutral turns
const intro4 = (probe, L) => ({ L: L || LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " " + probe,
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about the mills?" + pad(2),
  "SPEAKER 2: They are hiring." + pad(3)] });

/* ======== NN. introductions of another time that NOT_NOW misses ======== */
add(Object.assign({ id: "NN1", mech: "NOT_NOW", title: "“Two weeks ago my guest was Dana Reyes, and a lot of you wrote in” then the co-host",
  diag: "NOT_NOW has no “ago” and only “was my guest” (not “my guest was”); nameAfterCue's role regex skips “was”",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, four("Two weeks ago my guest was Dana Reyes, and a lot of you wrote in about it.", "The inbox was full all weekend.")));
add({ id: "NN2", mech: "NOT_NOW", title: "Teaser “Joining us after the news will be Dana Reyes.” then the newsreader (numbered), then the guest",
  diag: "NOT_NOW lacks bare “will be” and “after the news”; the role regex skips “after the news will be”", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us after the news will be Dana Reyes.",
  "SPEAKER 3: This is the Steel Country news update. The council voted six to three to close the bridge for repairs.",
  "SPEAKER 1: And we're back." + pad(2),
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about housing?" + pad(1),
  "SPEAKER 2: It is expensive." + pad(3)],
  expect: { "SPEAKER 1": H_, "SPEAKER 3": null, "SPEAKER 2": { not: "Walt Brannigan" } } });
add(Object.assign({ id: "NN3", mech: "nameAfterCue place-word", title: "Teaser “Joining us on Friday, Dana Reyes.” then the co-host",
  diag: "nameAfterCue's “Paris, Jane Holloway” rule skips the one capitalised word “Friday” and takes the name after the comma; no day/month check, NOT_NOW has no weekday",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, four("Joining us on Friday, Dana Reyes.", "Can't wait for that one.")));
add(Object.assign({ id: "NN4", mech: "nameAfterCue place", title: "Teaser “Joining us in March, Dana Reyes.” then the co-host",
  diag: "nameAfterCue's place regex (from|in|at + capitalised word + comma) strips “in March,” as if a place",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, four("Joining us in March, Dana Reyes.", "Can't wait for that one.")));
add(Object.assign({ id: "NN5", mech: "INTRO_AFTER on the phone with", title: "“I was on the phone with Dana Reyes this morning, and she is furious.” then the co-host",
  diag: "INTRO_AFTER “on the (line|phone) … with” matches inside a past-tense report; NOT_NOW has no “I was”/“this morning”",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, four("I was on the phone with Dana Reyes this morning, and she is furious.", "I bet she is.")));
add({ id: "NN6", mech: "NOT_NOW window (40+ words)", title: "One 50-word sentence: “Later in the hour, after … [30 words] …, joining us will be Dana Reyes.” then an ad voice",
  diag: "for 40+ word sentences NOT_NOW sees only around(cueAt,12,16): “Later” is 40 words back; “will be” itself is not in NOT_NOW", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(1) + " Later in the hour, after we go through the steel numbers, the tariff vote, the strike at the plant in Gary, the price of coal, the new rules on imports and exports and all the rest of it, joining us will be Dana Reyes.",
  "SPEAKER 3: This hour is brought to you by Comfy Pillow. Go to comfypillow dot com.",
  "SPEAKER 1: First, the steel numbers." + pad(2),
  "SPEAKER 2: They are up." + pad(3)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null, "SPEAKER 3": null } });
add({ id: "NN7", mech: "captions NOT_NOW window", title: "Captions: “last week right here on the show … [20 words] … joining us from the union hall dana reyes told us …” then the co-host",
  diag: "captions are one sentence; NOT_NOW window (12 words before the cue) drops “last week”; quoteAt starts 6 words before the cue so checkClue misses it too", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Mill Watch — Dana Reyes" }, lines: [
  "SPEAKER 1: " + lc("Welcome to the Straight Talk Hour. Last week right here on the show in what turned out to be our most downloaded episode of the whole year by a mile joining us from the union hall Dana Reyes told us the mill would close by spring and tonight we look at whether she was right"),
  "SPEAKER 2: " + lc("She was half right, the second line closed but the first one is still running." + pad(3)),
  "SPEAKER 1: " + lc("What about the jobs?" + pad(2)),
  "SPEAKER 2: " + lc("Down by a third." + pad(3))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } });

/* ======== RS. nameAfterCue's role regex: up to six lower-case words, then the first capitalised phrase ======== */
const RS_DIAG = "nameAfterCue role regex /^(?:the|a|an|our|my)?(?:[a-z]\\w*,?\\s+){0,6}(?=\\p{Lu})/ crosses verbs and prepositions (“worked for”, “author of”, “mayor of”), then personLike accepts any two capitalised non-STOP words";
add(Object.assign({ id: "RS1", mech: "role regex: person", title: "“My guest tonight worked for Marcus Delacroix for ten years.” then the guest", diag: RS_DIAG,
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, intro4("My guest tonight worked for Marcus Delacroix for ten years.")));
add(Object.assign({ id: "RS2", mech: "role regex: book", title: "“My guest tonight is the author of Silent Orchard.” then the guest", diag: RS_DIAG,
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, intro4("My guest tonight is the author of Silent Orchard.")));
add(Object.assign({ id: "RS3", mech: "role regex: place", title: "“My guest tonight is the mayor of Pine Hollow.” then the guest", diag: RS_DIAG,
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, intro4("My guest tonight is the mayor of Pine Hollow.")));
add(Object.assign({ id: "RS4", mech: "role regex: organisation", title: "“Joining us from Detroit is the Corwell Motors chief economist.” then the guest", diag: RS_DIAG + " (the name stops at the lower-case role noun)",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, intro4("Joining us from Detroit is the Corwell Motors chief economist.")));
add(Object.assign({ id: "RS5", mech: "role regex: team", title: "“Joining us now is the Ironvale Hawks head coach.” then the guest", diag: RS_DIAG,
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, intro4("Joining us now is the Ironvale Hawks head coach.")));
add({ id: "RS6", mech: "role regex: sponsor", title: "“Please welcome our newest sponsor, Comfy Pillow.” then the ad read by a numbered voice", diag: RS_DIAG, L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Please welcome our newest sponsor, Comfy Pillow.",
  "SPEAKER 3: Tired of waking up tired? Comfy Pillow adjusts to the way you sleep. Use code STRAIGHT for twenty percent off.",
  "SPEAKER 1: And now, the news." + pad(2),
  "SPEAKER 2: Thanks, Walt." + pad(3)],
  expect: { "SPEAKER 1": H_, "SPEAKER 3": null } });
add(Object.assign({ id: "RS7", mech: "nameAfterCue place-word: org", title: "“Joining me now is Priya, Corwell Motors chief engineer.” (first name, then an organisation)",
  diag: "the “correspondent in Paris, Jane Holloway” rule drops the one-word “Priya” because the next capitalised pair is personLike; the organisation becomes the name",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, intro4("Joining me now is Priya, Corwell Motors chief engineer.")));

/* ======== IA. INTRO_AFTER alternatives that are not introductions ======== */
add({ id: "IA1", mech: "INTRO_AFTER welcome(?=,)", title: "Host replies “You're welcome, Dana.” to the guest's thanks, then takes a caller",
  diag: "INTRO_AFTER “welcome(?=,)” reads “You're welcome, Dana” as an introduction; vocative() also counts it as “handed” (weight 3) for whoever speaks next",
  L: { show: SHOW, showAuthor: HOST, episodeTitle: "Housing — Dana Reyes" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " My guest tonight has spent twenty years on housing.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 1: What about rents?" + pad(1),
  "SPEAKER 2: Rents are up everywhere. And thank you again for the invitation." + pad(2),
  "SPEAKER 1: You're welcome, Dana." + pad(1) + " Let's take a call. Line one, go ahead.",
  "SPEAKER 3: Hi, long time listener. I rent in Gary and my rent doubled." + pad(1),
  "SPEAKER 1: Thanks for calling." + pad(1),
  "SPEAKER 2: That matches what we see." + pad(2)],
  expect: { "SPEAKER 1": H_, "SPEAKER 3": null, "SPEAKER 2": { oneOf: ["Dana Reyes", null] } } });
add(Object.assign({ id: "IA2", mech: "INTRO_AFTER bare “bring in”", title: "“Honestly, the mayor should bring in Marcus Delacroix to fix this mess.” then the co-host",
  diag: "INTRO_AFTER has a bare “bring in” alternative (not only “let's/let me bring in”); NOT_NOW has no “should”",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, four("Honestly, the mayor should bring in Marcus Delacroix to fix this mess.", "He would never take that job.")));
add(Object.assign({ id: "IA3", mech: "INTRO_AFTER “I'm with”", title: "Agreement “I'm with Dana Reyes on this one.” then the co-host (no other clue protects him)",
  diag: "INTRO_AFTER “(i'm|we're) … with” reads an agreement as an introduction (B7 passed only because the next voice was the host)",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, four("I'm with Dana Reyes on this one.", "Me too, for once.")));
add(Object.assign({ id: "IA4", mech: "LOOSE_AFTER + listed subject", title: "Subject episode: “Say what you want, it's good to have Dana Reyes back in the Senate.” then the co-host",
  diag: "LOOSE_AFTER (“good to have”) accepts any person the listing names; the title's subject counts as listed",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, four("Say what you want, it's good to have Dana Reyes back in the Senate.", "She was missed.", DSUBJ)));

/* ======== IB. INTRO_BEFORE / nameBeforeCue ======== */
add(Object.assign({ id: "IB1", mech: "nameBeforeCue object", title: "“A longtime critic of Marcus Delacroix joins us now.” then the guest",
  diag: "nameBeforeCue takes the last name ending the stretch before “joins us”, even as the object of “of”",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, intro4("A longtime critic of Marcus Delacroix joins us now.")));
add(Object.assign({ id: "IB2", mech: "INTRO_BEFORE “, welcome.”", title: "“To our new listeners in Pine Hollow, welcome.” then the co-host",
  diag: "INTRO_BEFORE “, welcome.” + nameBeforeCue: a two-word place ending the stretch is personLike; not loose, so no guest reply is needed",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, four("To our new listeners in Pine Hollow, welcome.", "We have a lot of them this week.")));
add(Object.assign({ id: "IB3", mech: "LOOSE_BEFORE holiday", title: "Sports show: “Opening Day is here!” then the reporter “Thanks, Walt, and what a beautiful afternoon…”",
  diag: "“X is here” with an unlisted X needs only a guest-like reply (“Thanks…”); “Opening Day” is personLike (not in NOT_PEOPLE)",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, four("Opening Day is here!", "Thanks, Walt, and what a beautiful afternoon at the ballpark.")));

/* ======== AN. the voice that answers an introduction is not checked ======== */
add({ id: "AN1", mech: "introduced: no third-person check", title: "“Joining us now is Marcus Delacroix.” then the co-host: “Before he starts, I owe our listeners a correction…”",
  diag: "checkClue(introduced) has no THIRD_PERSON test (addressed has one); the first answerer gets the name at weight 2", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now is Marcus Delacroix.",
  "SPEAKER 3: Before he starts, I owe our listeners a correction from last week's show." + pad(1),
  "SPEAKER 2: Go ahead, I can wait." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3),
  "SPEAKER 3: I am not so sure." + pad(2)],
  expect: { "SPEAKER 1": H_, "SPEAKER 3": { not: GUEST }, "SPEAKER 2": { oneOf: [GUEST, null] } } });
add({ id: "AN2", mech: "two people introduced together", title: "“Joining us now are Dana Reyes and her co-author, Marcus Webb.” — the first answerer is later called “Marcus” and answers",
  diag: "nameAfterCue's two-people guard needs “and” + a capital; “and her co-author, Marcus Webb” slips through, so Dana goes to whoever answers first",
  L: { show: SHOW, showAuthor: HOST, episodeTitle: "Housing — Dana Reyes and Marcus Webb" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now are Dana Reyes and her co-author, Marcus Webb.",
  "SPEAKER 2: Thanks for having us." + pad(2),
  "SPEAKER 1: Marcus, you wrote the chapter on rents. Why rents?",
  "SPEAKER 2: Because rents are the whole story." + pad(2),
  "SPEAKER 1: Dana, do you agree?",
  "SPEAKER 3: Mostly." + pad(2)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { oneOf: ["Marcus Webb", null] }, "SPEAKER 3": { oneOf: ["Dana Reyes", null] } } });
add({ id: "AN3", mech: "INTRO_BEFORE “NAME, welcome back.” (absent)", title: "Subject episode: “The senator says she is running again. Dana Reyes, welcome back.” then the co-host: “She was gone for two years…”",
  diag: "“NAME, welcome back.” to someone absent counts as an introduction (handed, weight 3); no third-person check on the answer", L: DSUBJ, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " The senator says she is running again. Dana Reyes, welcome back.",
  "SPEAKER 2: She was gone for two years, and nobody missed her." + pad(3),
  "SPEAKER 1: Some did." + pad(2),
  "SPEAKER 2: Not many." + pad(3)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } });
add({ id: "AN4", mech: "introduced: an unlabelled clip answers", title: "“Joining us now is Marcus Delacroix. But first, here is what the governor said this morning.” — the clip is a numbered voice",
  diag: "answerers() takes the next numbered voice; a “But first, here is what X said” set-up after the introduction is not considered (B6 passed only because the clip was labelled CLIP)", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Joining us now is Marcus Delacroix. But first, here is what the governor said this morning.",
  "SPEAKER 3: We will not raise taxes on working families, period, and the mills will reopen.",
  "SPEAKER 2: Well, she is wrong, and I can prove it." + pad(3),
  "SPEAKER 1: Go ahead." + pad(2),
  "SPEAKER 2: The numbers." + pad(3)],
  expect: { "SPEAKER 1": H_, "SPEAKER 3": { not: GUEST }, "SPEAKER 2": { oneOf: [GUEST, null] } } });

/* ======== SI. self-identification cues ======== */
add(Object.assign({ id: "SI1", mech: "SELF it's + holiday", title: "Host opens “Well, it's Opening Day, folks!”",
  diag: "SELF “it's” after a greeting + personLike(“Opening Day”); NOT_PEOPLE is a short fixed list. The host also loses his name (selfNamed blocks hosts_show)",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, { L: LH, lines: [
  "SPEAKER 1: Well, it's Opening Day, folks!" + pad(2) + " We have a full show.",
  "SPEAKER 2: Can't wait." + pad(3),
  "SPEAKER 1: First, the lineup." + pad(2),
  "SPEAKER 2: Go ahead." + pad(3)] }));
add(Object.assign({ id: "SI2", mech: "SELF this is + station ID", title: "Station ID: “Good evening, this is Steel Country Radio, and you're listening to the Straight Talk Hour.”",
  diag: "SELF “this is”: “Steel Country Radio” → STOP pops “Radio”, nextWord “radio” is STOP so AFTER_NAME passes; showsName only checks the listed show",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, { L: LH, lines: [
  "SPEAKER 1: Good evening, this is Steel Country Radio, and you're listening to the Straight Talk Hour." + pad(2),
  "SPEAKER 2: Big show tonight." + pad(3),
  "SPEAKER 1: It is." + pad(2),
  "SPEAKER 2: Let's go." + pad(3)] }));
add(Object.assign({ id: "SI3", mech: "SELF this is + relative clause", title: "Host presents the guest: “Everybody, this is Marcus Delacroix, who ran trade policy for six years.”",
  diag: "the presenting guard (A8) only looks for he/she at the start of the NEXT sentence; a “, who …” clause in the same sentence is missed; host loses his name",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { oneOf: [GUEST, null] } } }, intro4("Everybody, this is Marcus Delacroix, who ran trade policy for six years.", L0)));
add(Object.assign({ id: "SI4", mech: "SELF it's NAME and …", title: "Pundit: “Same story every year. It's Marcus Delacroix and the steel lobby, again.”",
  diag: "SELF “it's” at a sentence start + AFTER_NAME accepts “ and”; nothing checks that “it's X and Y” describes a situation",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, four("Same story every year. It's Marcus Delacroix and the steel lobby, again.", "Every single year.", SUBJ)));
add(Object.assign({ id: "SI5", mech: "“NAME here,” presenting", title: "Host (listed Pat Quinn): “Folks, Dana Reyes here, she wrote the bill everyone is fighting about.”",
  diag: "the “NAME here” self-identification regex (after a greeting or a comma) has no check for a following he/she; the host takes the guest's name",
  expect: { "SPEAKER 1": { oneOf: ["Pat Quinn", null] }, "SPEAKER 2": { oneOf: ["Dana Reyes", null] } } }, { L: { show: "The Long Game", showAuthor: "Pat Quinn", episodeTitle: "Housing — Dana Reyes" }, lines: [
  "SPEAKER 1: Welcome to the Long Game." + pad(2) + " Folks, Dana Reyes here, she wrote the bill everyone is fighting about.",
  "SPEAKER 2: Guilty as charged." + pad(3),
  "SPEAKER 1: Why did you write it?" + pad(2),
  "SPEAKER 2: Rents." + pad(3)] }));
add(Object.assign({ id: "SI6", mech: "REPORTED lacks quotative “like”", title: "Caller retells: “…and she's like, I'm Dana Reyes, nice to meet you.”",
  diag: "REPORTED knows says/goes/went but not the quotative “be like”; the caller self-identifies as the person quoted",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } }, { L: { show: SHOW, showAuthor: HOST, episodeTitle: "Bridges — Dana Reyes" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Line one, go ahead.",
  "SPEAKER 2: Hi, long time listener. So I go up to the senator at the diner and she's like, I'm Dana Reyes, nice to meet you." + pad(3),
  "SPEAKER 1: What did you say?" + pad(2),
  "SPEAKER 2: I asked her about the bridge." + pad(3)] }));
add(Object.assign({ id: "SI7", mech: "REPORTED like + “I'm your host,”", title: "Caller retells: “…and he's like, I'm your host, Walt Brannigan, and I'm like, sure you are.”",
  diag: "same quotative gap, through the “I'm your host, NAME” cue (weight 3); the caller takes the host's name and the real host is left unnamed",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: HOST } } }, { L: LH, lines: [
  "SPEAKER 1: Good evening." + pad(2) + " Line one, go ahead.",
  "SPEAKER 2: Hi, long time listener. So I met a guy at the diner who swore he was on the radio, and he's like, I'm your host, Walt Brannigan, and I'm like, sure you are." + pad(3),
  "SPEAKER 1: That was probably me." + pad(2),
  "SPEAKER 2: No way." + pad(3)] }));
add(Object.assign({ id: "SI8", mech: "“I'm your host,” as a rhetorical question", title: "Producer: “So now I'm your host, Walt Brannigan? I just make the coffee here.”",
  diag: "SELF “I'm your host,” + AFTER_NAME accepts “?”; a question (and the denial after it) is not checked",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: HOST } } }, { L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Our producer is here with me tonight. Say hello.",
  "SPEAKER 2: So now I'm your host, Walt Brannigan? I just make the coffee here." + pad(3),
  "SPEAKER 1: You make very good coffee." + pad(2),
  "SPEAKER 2: Thank you." + pad(3)] }));

/* ======== FN. first-name completion ======== */
add(Object.assign({ id: "FN1", mech: "completion: asGuest (GUEST_ANY)", title: "Subject episode; caller: “Hi, I'm Marcus. Great to be on, long time listener, first time caller. I think he is right…”",
  diag: "asGuest = GUEST_ANY anywhere in the turn's first 3 sentences; callers say “great to be on” too, so “Marcus” completes to the subject",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: GUEST } } }, { L: SUBJ, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Tonight, the speech everyone is talking about. Line one, go ahead.",
  "SPEAKER 2: Hi, I'm Marcus. Great to be on, long time listener, first time caller. I think he is right about the mills." + pad(3),
  "SPEAKER 1: Why?" + pad(2),
  "SPEAKER 2: Because I work there." + pad(3)] }));
add(Object.assign({ id: "FN2", mech: "completion: caller regex needs a capital", title: "Subject episode; caller: “Hi Walt, thanks for having me on. I'm Marcus, from the east side, and I think he is right…”",
  diag: "the caller test needs “from” + a capital (cased text); “from the east side” fails it, and “thanks for having me” makes it asGuest",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: GUEST } } }, { L: SUBJ, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Tonight, the speech everyone is talking about. Line one, go ahead.",
  "SPEAKER 2: Hi Walt, thanks for having me on. I'm Marcus, from the east side, and I think he is right about the mills." + pad(3),
  "SPEAKER 1: Why?" + pad(2),
  "SPEAKER 2: Because I work there." + pad(3)] }));
add({ id: "FN3", mech: "completion: addressed + listed", title: "Subject episode: host “…why Marcus Delacroix is wrong… Marcus, you're on the air.” then a caller who says “he is right”",
  diag: "an addressed first name completes for any main voice; one addressed + the title's “listed” = 2 and stands (THIRD_PERSON is waived because the reply starts “Hi, thanks”)", L: SUBJ, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Tonight, why Marcus Delacroix is wrong about steel. Let's go to the phones. Marcus, you're on the air.",
  "SPEAKER 2: Hi, thanks for taking my call. I think he is right about the mills, actually." + pad(3),
  "SPEAKER 1: Why?" + pad(2),
  "SPEAKER 2: Because I work there." + pad(3)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: GUEST } } });
add({ id: "FN4", mech: "completion: introduced first name", title: "Subject episode: “Tonight, why Marcus Delacroix is wrong about steel. Let me bring in my producer, Marcus.”",
  diag: "nameAfterCue maps a lone first name to the listed person via forms(); checkClue completes it for a main voice", L: SUBJ, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Tonight, why Marcus Delacroix is wrong about steel. Let me bring in my producer, Marcus.",
  "SPEAKER 2: Thanks, Walt. I pulled the numbers this afternoon." + pad(3),
  "SPEAKER 1: And?" + pad(2),
  "SPEAKER 2: He is wrong by half." + pad(3)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: GUEST } } });
add({ id: "FN5", mech: "completion overrides a stated surname", title: "Panel guest: “Thanks for having me. I'm Marcus, Marcus Webb, from the union hall in Gary.” (only Delacroix listed)",
  diag: "SELF stops at “Marcus,”; asGuest completes it to the one listed Marcus although the same sentence says “Marcus Webb”", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Two guests tonight, both from the mill towns.",
  "SPEAKER 2: Thanks for having me. I'm Marcus, Marcus Webb, from the union hall in Gary." + pad(3),
  "SPEAKER 1: And our other guest?" + pad(1),
  "SPEAKER 3: Glad to be here." + pad(3),
  "SPEAKER 2: The mill is coming back." + pad(2),
  "SPEAKER 3: I am not so sure." + pad(2)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: GUEST } } });
add({ id: "FN6", mech: "completion: asHost via “your host”", title: "Host Dana Reyes (feed author); caller: “Hi, I'm Dana, same name as your host, and I have a question about rents.”",
  diag: "asHost accepts “your host” anywhere in the quote; the caller completes to the listed host, and namedByWords then blocks hosts_show for the real host",
  L: { show: "The Long Game", showAuthor: "Dana Reyes", episodeTitle: "Episode 40: rents" }, lines: [
  "SPEAKER 1: Welcome to the Long Game." + pad(2) + " Line one, go ahead.",
  "SPEAKER 2: Hi, I'm Dana, same name as your host, and I have a question about rents." + pad(3),
  "SPEAKER 1: Go ahead." + pad(2),
  "SPEAKER 2: Why are they so high?" + pad(3)],
  expect: { "SPEAKER 1": { oneOf: ["Dana Reyes", null] }, "SPEAKER 2": { not: "Dana Reyes" } } });
add({ id: "FN7", mech: "completion: captions caller", title: "Captions, subject episode; caller: “hi walt it's marcus great to be on long time listener … i think he is right…”",
  diag: "captions caller check only covers “from”; GUEST_ANY “great to be on” makes it asGuest, so “marcus” completes to the subject", L: SUBJ, lines: [
  "SPEAKER 1: " + lc("Welcome to the Straight Talk Hour." + pad(2) + " Tonight, the speech everyone is talking about. Line one, go ahead."),
  "SPEAKER 2: " + lc("Hi Walt, it's Marcus, great to be on, long time listener, first time caller, and I think he is right about the mills." + pad(3)),
  "SPEAKER 1: " + lc("Why?" + pad(2)),
  "SPEAKER 2: " + lc("Because I work there." + pad(3))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: GUEST } } });

/* ======== CP. lower-case captions ======== */
add({ id: "CP1", mech: "recaser: common-word first name", title: "Captions; listed guest “Sunny Okafor”; the weather reporter: “good morning everybody it's sunny today across the whole valley…”",
  diag: "recaser capitalises every “sunny”; SELF “it's” + formOf(“Sunny”) → a self-identification (weight 2). Two voices end up “Sunny” and “Sunny Okafor”",
  L: { show: SHOW, showAuthor: HOST, episodeTitle: "Drought — Sunny Okafor" }, lines: [
  "SPEAKER 1: " + lc("Good evening and welcome to the Straight Talk Hour." + pad(2) + " Let's check the weather first."),
  "SPEAKER 3: " + lc("Good morning everybody, it's sunny today across the whole valley and the heat will build all week." + pad(1)),
  "SPEAKER 1: " + lc("Thanks for that." + pad(2) + " Joining us now, Sunny Okafor."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(3)),
  "SPEAKER 1: " + lc("What about the farms?" + pad(1)),
  "SPEAKER 2: " + lc("They are dry." + pad(3))],
  expect: { "SPEAKER 1": H_, "SPEAKER 3": null, "SPEAKER 2": { oneOf: ["Sunny Okafor", null] } } });
add({ id: "CP2", mech: "recaser: common-word first name (weight 3)", title: "Captions; listed guest “Frank Mendoza”; the host: “look i'm frank with everybody who calls this show…”",
  diag: "recaser capitalises “frank”; SELF “I'm” + AFTER_NAME “ with” → self-identification weight 3; the host is named “Frank” and loses his own name",
  L: { show: SHOW, showAuthor: HOST, episodeTitle: "The mill — Frank Mendoza" }, lines: [
  "SPEAKER 1: " + lc("Welcome to the Straight Talk Hour. Look, I'm frank with everybody who calls this show, so here it is: the mill numbers are bad." + pad(2)),
  "SPEAKER 2: " + lc("Thanks for having me, and yes, they are bad." + pad(3)),
  "SPEAKER 1: " + lc("How bad?" + pad(2)),
  "SPEAKER 2: " + lc("Very." + pad(3))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { oneOf: ["Frank Mendoza", null] } } });
add({ id: "CP3", mech: "captions: whole turn = last sentence", title: "Captions: “thank you marcus for coming on now let's go to the phones line one go ahead you're on the air” then a caller",
  diag: "with no full stops the turn is one sentence, so a vocative anywhere in it is “at the turn's end”; addressed + listed stands for the caller", L: L0, lines: [
  "SPEAKER 1: " + lc("Welcome to the Straight Talk Hour." + pad(2) + " My guest tonight ran trade policy for six years."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(3)),
  "SPEAKER 1: " + lc("What about steel?" + pad(1)),
  "SPEAKER 2: " + lc("It worked and the mills are hiring again." + pad(3)),
  "SPEAKER 1: " + lc("Thank you, Marcus, for coming on. Now let's go to the phones. Line one, go ahead, you're on the air."),
  "SPEAKER 3: " + lc("Hi, long time listener. I worked at the mill for thirty years and I can tell you the hiring is real, my nephew just got on the second shift." + pad(1)),
  "SPEAKER 1: " + lc("Thanks for calling." + pad(1)),
  "SPEAKER 3: " + lc("Thank you." + pad(2))],
  expect: { "SPEAKER 1": H_, "SPEAKER 3": { not: GUEST }, "SPEAKER 2": { oneOf: [GUEST, null] } } });

/* ======== AC. all-capitals turns (readable() title-cases every word) ======== */
add({ id: "AC1", mech: "readable(): every word capitalised", title: "All-caps transcript: “WELCOME TO THE STRAIGHT TALK HOUR. IT'S PURE MADNESS, FOLKS.”",
  diag: "readable() capitalises every word of an all-caps turn, so SELF “It's” + NAME_SRC + personLike take “Pure Madness”; the host loses his name", L: LH, lines: [
  "SPEAKER 1: WELCOME TO THE STRAIGHT TALK HOUR. IT'S PURE MADNESS, FOLKS." + UP(pad(2)),
  "SPEAKER 2: IT REALLY IS." + UP(pad(3)),
  "SPEAKER 1: LET'S GET INTO IT." + UP(pad(2)),
  "SPEAKER 2: GO AHEAD." + UP(pad(3))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } });
add({ id: "AC2", mech: "readable(): every word capitalised", title: "All-caps transcript: “MY GUEST TONIGHT KNOWS STEEL.” then “THANKS FOR HAVING ME.”",
  diag: "readable() title-case + INTRO_AFTER “my guest tonight” + personLike(“Knows Steel”)", L: LH, lines: [
  "SPEAKER 1: WELCOME TO THE STRAIGHT TALK HOUR." + UP(pad(2)) + " MY GUEST TONIGHT KNOWS STEEL.",
  "SPEAKER 2: THANKS FOR HAVING ME." + UP(pad(3)),
  "SPEAKER 1: WHAT ABOUT THE MILLS?" + UP(pad(2)),
  "SPEAKER 2: THEY ARE HIRING." + UP(pad(3))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } });

/* ======== TF. a trailing fragment taken for the next voice's words ======== */
add({ id: "TF1", mech: "endOf(): “Marcus, what about —”", title: "“Dana, thanks for that summary earlier. Marcus, what about —” then Marcus answers",
  diag: "endOf() drops a ≤3-word unpunctuated last sentence, so the vocative before it is “last”; addressed(Dana) + listed stands for Marcus's voice", L: LG2, lines: [
  "SPEAKER 1: Welcome to the Long Game." + pad(2) + " Two guests tonight, both from the housing world.",
  "SPEAKER 2: Glad to be here." + pad(2),
  "SPEAKER 3: Thanks for having me." + pad(2),
  "SPEAKER 1: So let's start." + pad(1) + " Dana, thanks for that summary earlier. Marcus, what about —",
  "SPEAKER 3: Rents. It is all about rents." + pad(2),
  "SPEAKER 1: Fair." + pad(1),
  "SPEAKER 2: I agree with him." + pad(2)],
  expect: { "SPEAKER 1": { oneOf: ["Pat Quinn", null] }, "SPEAKER 3": { not: "Dana Reyes" } } });
add({ id: "TF2", mech: "endOf(): “Over to Marcus”", title: "“Thanks, Dana. Over to Marcus” (no full stop) then Marcus answers",
  diag: "same: the hand-over “Over to Marcus” (3 words, no stop) is discarded as the next voice's words; “Thanks, Dana.” becomes the turn's end", L: LG2, lines: [
  "SPEAKER 1: Welcome to the Long Game." + pad(2) + " Two guests tonight, both from the housing world.",
  "SPEAKER 2: Glad to be here." + pad(2),
  "SPEAKER 3: Thanks for having me." + pad(2),
  "SPEAKER 1: So let's start." + pad(1) + " Thanks, Dana. Over to Marcus",
  "SPEAKER 3: Rents. It is all about rents." + pad(2),
  "SPEAKER 1: Fair." + pad(1),
  "SPEAKER 2: I agree with him." + pad(2)],
  expect: { "SPEAKER 1": { oneOf: ["Pat Quinn", null] }, "SPEAKER 3": { not: "Dana Reyes" } } });

/* ======== MD. the model's clues: checkClue is weaker than the app's own finder ======== */
add({ id: "MD1", mech: "checkClue(introduced): no cue required", title: "Model calls a mere mention an introduction: “I think Dana Reyes is wrong about the mills” → the co-host",
  diag: "checkClue(introduced) only needs the name in the quote and the voice answering next: no INTRO_AFTER/INTRO_BEFORE words are required", L: LH, lines: four("Honestly, I think Dana Reyes is wrong about the mills.", "She usually is.").lines,
  model: () => ({ voices: [{ label: "SPEAKER 2", name: "Dana Reyes", evidence: [{ kind: "introduced", turn: 0, quote: "I think Dana Reyes is wrong about the mills" }] }], unnamed: [] }),
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } });
add({ id: "MD2", mech: "checkClue(introduced): NOT_NOW on the quote only", title: "B2 sentence “Last week my guest was Dana Reyes…”; the model quotes only “my guest was Dana Reyes”",
  diag: "checkClue tests NOT_NOW on the quoted words, not the sentence; a trimmed quote passes what findEvidence rejected", L: LH, lines: four("Last week my guest was Dana Reyes, and a lot of you wrote in about it.", "The inbox was full all weekend.").lines,
  model: () => ({ voices: [{ label: "SPEAKER 2", name: "Dana Reyes", evidence: [{ kind: "introduced", turn: 0, quote: "my guest was Dana Reyes" }] }], unnamed: [] }),
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } });
add({ id: "MD3", mech: "checkClue(self_identification): REPORTED on the quote only", title: "No quote marks: “He looks right into the camera and says, I'm Jack Pruitt and I approve this message.”; the model quotes from “I'm”",
  diag: "checkClue tests REPORTED on the quote's own prefix; starting the quote at “I'm” drops “says”; the host is named Jack Pruitt", L: LH, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Did you see that ad? He looks right into the camera and says, I'm Jack Pruitt and I approve this message.",
  "SPEAKER 2: Everybody saw that ad." + pad(3),
  "SPEAKER 1: It ran a hundred times." + pad(2),
  "SPEAKER 2: At least." + pad(3)],
  model: () => ({ voices: [{ label: "SPEAKER 1", name: "Jack Pruitt", evidence: [{ kind: "self_identification", turn: 0, quote: "I'm Jack Pruitt and I approve this message" }] }], unnamed: [] }),
  expect: { "SPEAKER 1": { not: "Jack Pruitt" }, "SPEAKER 2": null } });
add({ id: "MD4", mech: "checkClue: capitals ignored in cased text", title: "Cased transcript: reporter “Good morning, it's sunny today…”; the model proposes listed “Sunny Okafor” for her",
  diag: "supportedName() lower-cases everything, so in a properly cased transcript a lower-case “sunny” still supports “Sunny”", L: { show: SHOW, showAuthor: HOST, episodeTitle: "Drought — Sunny Okafor" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Let's check the weather first.",
  "SPEAKER 3: Good morning, it's sunny today across the whole valley, and the heat will build all week." + pad(1),
  "SPEAKER 1: Thanks for that." + pad(2) + " Joining us now, Sunny Okafor.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about the farms?" + pad(1),
  "SPEAKER 2: They are dry." + pad(3)],
  model: () => ({ voices: [{ label: "SPEAKER 3", name: "Sunny Okafor", evidence: [{ kind: "self_identification", turn: 1, quote: "it's sunny today across the whole valley" }] }], unnamed: [] }),
  expect: { "SPEAKER 1": H_, "SPEAKER 3": null, "SPEAKER 2": { oneOf: ["Sunny Okafor", null] } } });
add({ id: "MD5", mech: "checkClue(self_identification): no NOT_A_NAME", title: "Role play: “Okay, pretend I'm Dana Reyes for a second. What do you tell me about the bridge?”; the model proposes it",
  diag: "findEvidence skips it (NOT_A_NAME “ for”), but checkClue has no NOT_A_NAME/AFTER_NAME test, so the model's clue passes (weight 3)", L: DSUBJ, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Okay, pretend I'm Dana Reyes for a second. What do you tell me about the bridge?",
  "SPEAKER 2: I tell you to fix it." + pad(3),
  "SPEAKER 1: With what money?" + pad(2),
  "SPEAKER 2: Yours." + pad(3)],
  model: () => ({ voices: [{ label: "SPEAKER 1", name: "Dana Reyes", evidence: [{ kind: "self_identification", turn: 0, quote: "pretend I'm Dana Reyes for a second" }] }], unnamed: [] }),
  expect: { "SPEAKER 1": { not: "Dana Reyes" }, "SPEAKER 2": null } });

/* ======== LS. listing-driven rules ======== */
add(Object.assign({ id: "LS1", mech: "awayFrom gap", title: "Substitute: “Walt has the night off, so you are stuck with me.”",
  diag: "awayFrom knows “Walt is/’s off” but not “has the night off”; the substitute opens the show and gets hosts_show",
  expect: { "SPEAKER 1": null, "SPEAKER 2": GUEST } }, { L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour. Walt has the night off, so you are stuck with me." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)] }));
add(Object.assign({ id: "LS2", mech: "awayFrom gap", title: "Substitute: “Walt is recovering from knee surgery, so I am holding down the fort.”",
  diag: "awayFrom has “recovering” only inside “while Walt … is recovering”; “Walt is recovering” alone is not away",
  expect: { "SPEAKER 1": null, "SPEAKER 2": GUEST } }, { L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour. Walt is recovering from knee surgery, so I am holding down the fort." + pad(2) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(3),
  "SPEAKER 1: What about steel?" + pad(2),
  "SPEAKER 2: It worked." + pad(3)] }));
add({ id: "LS3", mech: "role_label from a title guess", title: "HOST/GUEST labels, subject title; GUEST: “Marcus Delacroix has been wrong about steel for a decade.”",
  diag: "role_label matches GUEST to the one title-derived “guest” (unstructured) once the conversation says the name, even in the third person", L: SUBJ, lines: [
  "HOST: Welcome to the Straight Talk Hour." + pad(2) + " My guest tonight has followed the steel story for years.",
  "GUEST: Thanks for having me. Marcus Delacroix has been wrong about steel for a decade." + pad(3),
  "HOST: Why?" + pad(2),
  "GUEST: He ignores the numbers." + pad(3)],
  expect: { "HOST": H_, "GUEST": { not: GUEST } } });
add({ id: "LS4", mech: "elimination from rhetorical vocatives", title: "Subject episode: host twice “Marcus, … you know it.” / “Marcus, just admit you were wrong.”; co-host: “He will never admit that.”",
  diag: "elimination's spokenTo (addressed by others in 2 turns) counts rhetorical vocatives to an absent subject; the remaining main voice's own third-person replies are not checked", L: SUBJ, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Marcus, the mills did not reopen, and you know it. Anyway.",
  "SPEAKER 2: He will never admit that.",
  "SPEAKER 1: Marcus, just admit you were wrong." + pad(1) + " The numbers are right there.",
  "SPEAKER 2: He won't. He never does.",
  "SPEAKER 1: Let's take a break." + pad(2),
  "SPEAKER 2: Good idea." + pad(3)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } });
add({ id: "LS5", mech: "addressed once + listed", title: "“Two guests tonight. Marcus, what do you make of the numbers?” — the co-host cuts in: “Can I jump in first?”",
  diag: "one addressed clue + the title's listed = 2 stands when no other voice points to Marcus; THIRD_PERSON finds no he/she in the cut-in", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2) + " Two guests tonight. Marcus, what do you make of the numbers?",
  "SPEAKER 3: Can I jump in first? These numbers are a mirage." + pad(2),
  "SPEAKER 2: Go ahead, I'll wait my turn." + pad(3),
  "SPEAKER 1: Fair enough." + pad(2),
  "SPEAKER 2: Steel is back." + pad(3)],
  expect: { "SPEAKER 1": H_, "SPEAKER 3": { not: GUEST } } });
add({ id: "LS6", mech: "addressed: a city greeted", title: "Live remote: “…live from the steel festival. Good morning, Gary!” (listed guest Gary Holt) then the co-host",
  diag: "vocative()'s greeting form (“Good morning, Gary”) cannot tell a city from a person; addressed + listed stands for the next voice",
  L: { show: SHOW, showAuthor: HOST, episodeTitle: "Live from the festival — Gary Holt" }, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour, live from the steel festival." + pad(2) + " Good morning, Gary!",
  "SPEAKER 2: What a crowd out there." + pad(3),
  "SPEAKER 1: Biggest one yet." + pad(2),
  "SPEAKER 2: By far." + pad(3)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": null } });

/* ======== MS. clear evidence the module ignores (secondary) ======== */
const MS_ = (id, mech, probe, diag, L, guest) => add(Object.assign({ id, mech, title: "MISS: “" + probe + "” then “Thanks for having me.”", diag,
  expect: { "SPEAKER 1": H_, "SPEAKER 2": guest || "Dana Reyes" } }, intro4(probe, L)));
MS_("MS1", "INTRO_AFTER", "With me, as always, is Dana Reyes.", "INTRO_AFTER “with (me|us) (now|…|is|are)” has no room for “, as always,”");
MS_("MS2", "nameAfterCue place", "Joining us from Gary, Indiana, is Dana Reyes.", "the place regex stops after “Gary,”; “Indiana” is then taken as the (rejected) name");
MS_("MS3", "NOT_NOW on the whole sentence", "Joining me now is Marcus Delacroix, who used to run trade policy.", "NOT_NOW “used to” in a clause about the guest's past kills a present introduction", L0, GUEST);
MS_("MS4", "NOT_NOW on the whole sentence", "Joining us now is Dana Reyes, who won the seat last year.", "NOT_NOW “last year” in a relative clause");
MS_("MS5", "NOT_NOW on the whole sentence", "Joining us now is Dana Reyes, who later served as mayor of Gary.", "NOT_NOW bare “later” in a relative clause");
MS_("MS6", "INTRO_AFTER", "I'd like to welcome Dana Reyes to the show.", "INTRO_AFTER has “please/let's/help me welcome” only");
MS_("MS7", "no intro cue; vocative needs a known form", "Dana Reyes, thanks for joining us.", "not an INTRO pattern; vocative() runs only on forms of listed/found people, and an unlisted name is never found");
MS_("MS8", "INTRO_BEFORE", "Dana Reyes, welcome aboard.", "INTRO_BEFORE needs [.!,] right after “welcome”");
MS_("MS9", "INTRO_AFTER", "Please give a warm welcome to Dana Reyes.", "no INTRO_AFTER alternative for “give a (warm) welcome to”");
MS_("MS10", "nameAfterCue possessive guard", "My guest tonight is Dana Reyes's former deputy, Marcus Webb.", "nameAfterCue returns null at the first possessive instead of moving on to the appositive name", LH, "Marcus Webb");
add({ id: "MS11", mech: "captions NOT_NOW window", title: "MISS captions: “we covered the strike last week and tonight it is steel joining us now is marcus delacroix”",
  diag: "captions are one sentence, so “last week” from the previous clause falls inside the 12-word NOT_NOW window", L: L0, lines: [
  "SPEAKER 1: " + lc("Welcome to the Straight Talk Hour." + pad(2) + " We covered the strike last week, and tonight it is steel. Joining us now is Marcus Delacroix."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(3)),
  "SPEAKER 1: " + lc("What about steel?" + pad(2)),
  "SPEAKER 2: " + lc("It worked." + pad(3))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": GUEST } });
add({ id: "MS12", mech: "checkClue vocative on a 28-word window", title: "MISS: two long thank-you sentences ending “…, Marcus.” (handover word 30+ words before the name), Marcus answers both",
  diag: "findEvidence finds the vocative on the whole sentence, but checkClue re-runs vocative() on quoteAt()'s window, which starts 6 words before “Marcus” and loses “Thank you”", L: L0, lines: [
  "SPEAKER 1: Welcome to the Straight Talk Hour." + pad(2),
  "SPEAKER 2: The mills are hiring." + pad(2),
  "SPEAKER 1: Thank you so much for coming in tonight on such short notice and for staying late after the vote and for bringing all of the numbers from the plant and the union and the county, Marcus.",
  "SPEAKER 2: Happy to do it." + pad(2),
  "SPEAKER 1: One more question about the second shift and what it means for Gary?",
  "SPEAKER 2: It means jobs." + pad(2),
  "SPEAKER 1: Thanks again for all of it, and for the coffee, and for putting up with the traffic out there on the bridge tonight, and for your patience with all of our questions, Marcus.",
  "SPEAKER 2: Any time." + pad(2)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": GUEST } });
add({ id: "MS13", mech: "SELF needs the name right after the cue", title: "MISS: caller “Hi Walt, I'm your neighbor, Dana Reyes, from two doors down…” (no listing of her)",
  diag: "only YOUR_HOST appositives are allowed between “I'm” and the name; “I'm your neighbor, NAME” is neither a self-identification nor a vocative", L: LH, lines: [
  "SPEAKER 1: Good evening." + pad(2) + " Line one, go ahead.",
  "SPEAKER 2: Hi Walt, I'm your neighbor, Dana Reyes, from two doors down, and I have a question about the bridge." + pad(3),
  "SPEAKER 1: Go ahead." + pad(2),
  "SPEAKER 2: When does it reopen?" + pad(3)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": "Dana Reyes" } });

/* ======== CT. controls: the nearest passing neighbour of a failing case ======== */
add(Object.assign({ id: "CT1", mech: "control for RS1-RS5", title: "Control: “My guest tonight is the economist Dana Reyes.”", diag: "",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": "Dana Reyes" } }, intro4("My guest tonight is the economist Dana Reyes.")));
add(Object.assign({ id: "CT2", mech: "control for NN3/NN4", title: "Control: “Joining us from Paris, Jane Holloway.”", diag: "",
  expect: { "SPEAKER 1": H_, "SPEAKER 2": "Jane Holloway" } }, intro4("Joining us from Paris, Jane Holloway.")));
add({ id: "CT3", mech: "control for TF1/TF2", title: "Control: “Thanks, Dana. Marcus, what about rents?” then Marcus answers", diag: "", L: LG2, lines: [
  "SPEAKER 1: Welcome to the Long Game." + pad(2) + " Two guests tonight, both from the housing world.",
  "SPEAKER 2: Glad to be here." + pad(2),
  "SPEAKER 3: Thanks for having me." + pad(2),
  "SPEAKER 1: So let's start." + pad(1) + " Thanks, Dana. Marcus, what about rents?",
  "SPEAKER 3: Rents. It is all about rents." + pad(2),
  "SPEAKER 1: Fair." + pad(1),
  "SPEAKER 2: I agree with him." + pad(2)],
  expect: { "SPEAKER 1": { oneOf: ["Pat Quinn", null] }, "SPEAKER 3": { oneOf: ["Marcus Webb", null] } } });

module.exports = { S, SHOW, HOST, GUEST, LH, L0, SUBJ, DSUBJ, LG2 };
