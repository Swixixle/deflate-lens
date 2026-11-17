"use strict";
/* The seventh set (0.14.2): a fourth independent adversarial review, written against the third redesign. Attacks (A):
   the rules of presence and subject, the notes' cue, address by kind, the host by the conversation's shape, the guest
   presented, callers, stand-ins, guests not here yet, stories told, deaths; the same shapes in captions; the model pushing
   a clue past the checks. Recall probes (R): ordinary openings a careful human names. The app's own patterns alone still
   give wrong names on many of the attacks, which are reworded to slip past the lists of words: the attacks are met by
   the model's reading of the conversation (two readers, resolveNames). identify-answers-7.json holds, for each scenario,
   a model's answer to the exact identification prompt, recorded once from a proxy (Claude Sonnet answering each prompt
   blind, with no view of these expectations); a scenario that scripts its own model (the model pushing a bad clue) keeps
   it. None repeats a scenario of the earlier sets. Invented people and shows only; no real transcripts, no lyrics.
   expect: { KEY: "Name" | null | { not: "Name" } | { oneOf: [...] } }: what a careful human concludes from the words
   and the listing. */
const { pad } = require("./identify-pad");
const { opens, unnamed, plus } = require("./identify-answers");

const HOST = "Dale Whitcomb", SHOW = "The Dale Whitcomb Show", PUB = "Dale Whitcomb Network", GUEST = "Marcus Delacroix", PRIEST = "Tomas Varga";
const H_ = { oneOf: [HOST, null] };
const lc = x => x.toLowerCase().replace(/[.,?!;:“”"—]/g, "").replace(/’/g, "'");
const S = [];
const add = s => S.push(s);
const OPEN = "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1);
// the episode is about Marcus Delacroix, billed by the title only (no notes)
const LSUBJ = { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix: The Man Who Ran the Mill" };
// the host's opening for LSUBJ with no words the subject rules know: the guest is described by her own work only
const PLAIN_OPEN = [
  OPEN + " Tonight we look back at thirty years of the Gary Works mill and the man who ran it. My guest tonight worked the east line for twenty of those years. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1)];

/* ======== A. presentedGuest needs “my/our guest”; the opening address ======== */
add({ id: "A1", title: "The host's first words end greeting the co-host, who shares the first name of the guest the feed lists (“My co-host is pulling a double shift tonight. Hey Marcus, thanks for coming in on your day off.”); the guest is presented without “my/our guest”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The mill sale", episodePersons: [{ name: GUEST, role: "guest" }] }, lines: [
  OPEN + " My co-host is pulling a double shift tonight. Hey Marcus, thanks for coming in on your day off.",
  "SPEAKER 3: Happy to be here. Somebody has to keep you honest." + pad(1),
  "SPEAKER 1: Tonight, the man who bought the mill last month is sitting across from us. Welcome.",
  "SPEAKER 2: Thank you." + pad(2),
  "SPEAKER 1: Why buy a steel mill in this economy?",
  "SPEAKER 2: Because nobody else would." + pad(2),
  "SPEAKER 3: That is not a business plan." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: GUEST }, "SPEAKER 2": { oneOf: [GUEST, null] } } });

/* ======== words to the absent subject that the kind of address lets through ======== */
add({ id: "A2", title: "Rhetorical questions to the absent subject (“Marcus, what would you have said that night?”, “Marcus, how did you do it?”), the guest answering for him; no description the subject rules know", L: LSUBJ, lines: PLAIN_OPEN.concat([
  "SPEAKER 1: When the union finally gave him its award, he was too sick to go. Marcus, what would you have said that night?",
  "SPEAKER 2: Probably nothing. Not a word. That was never the way at the mill." + pad(1),
  "SPEAKER 1: He never missed a shift in thirty years, not one. Marcus, how did you do it?",
  "SPEAKER 2: Stubbornness, mostly. Nobody on the east line ever called in sick either." + pad(1),
  "SPEAKER 1: What was a normal shift like?",
  "SPEAKER 2: Twelve hours, if you were lucky." + pad(2)]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "A3", title: "Plain statements to the absent subject in a two-voice interview (“You'd have hated every minute of it, Marcus.”, “You saw all of it coming before anybody else did, Marcus.”)", L: LSUBJ, lines: PLAIN_OPEN.concat([
  "SPEAKER 1: They tore down the east gate first, then the rolling mill, then the offices." + pad(1) + " You'd have hated every minute of it, Marcus.",
  "SPEAKER 2: Every last minute. The east gate was the first thing anybody saw from the road." + pad(1),
  "SPEAKER 1: And the sale went through for a dollar an acre." + pad(1) + " You saw all of it coming before anybody else did, Marcus.",
  "SPEAKER 2: Nobody listened. Nobody ever does." + pad(1),
  "SPEAKER 1: What was a normal shift like?",
  "SPEAKER 2: Twelve hours, if you were lucky." + pad(2)]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });

/* ======== the host by shape: stand-ins in words the lists do not know ======== */
add({ id: "A4", title: "A stand-in opens without naming the host, in words the stand-in list lacks (“The man whose name is on the door is at his daughter's wedding in Ohio this week, so I'm minding things until Monday.”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The union hall" }, lines: [
  OPEN + " The man whose name is on the door is at his daughter's wedding in Ohio this week, so I'm minding things until Monday. My guest tonight runs the union hall in Gary. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 1: How many members are left?",
  "SPEAKER 2: About four hundred." + pad(2)],
  expect: { "SPEAKER 1": { not: HOST } } });
add({ id: "A5", title: "HOST/GUEST labels: the voice labelled HOST says “Dale's in Ohio for his daughter's wedding, so I'm driving the show this week.” (role labels do not check who the words say is away)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The union hall" }, lines: [
  "HOST: Welcome to the Dale Whitcomb Show. Dale's in Ohio for his daughter's wedding, so I'm driving the show this week." + pad(1) + " My guest tonight runs the union hall in Gary. Thanks for coming in.",
  "GUEST: Thanks for having me." + pad(2),
  "HOST: How many members are left?",
  "GUEST: About four hundred." + pad(2)],
  expect: { "HOST": { not: HOST } } });
add({ id: "A6", title: "HOST/GUEST labels: the billed guest was replaced in words the absence check lacks (“Marcus Delacroix got called to Washington this morning, so we've got his deputy instead.”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix on the mill sale" }, lines: [
  "HOST: Welcome to the Dale Whitcomb Show." + pad(1) + " Marcus Delacroix got called to Washington this morning, so we've got his deputy instead. Thanks for coming in on short notice.",
  "GUEST: Thanks for having me. He sends his apologies." + pad(2),
  "HOST: What happens to the mill now?",
  "GUEST: It depends on the vote." + pad(2)],
  expect: { "HOST": HOST, "GUEST": { not: GUEST } } });
add({ id: "A7", title: "Two hosts, the feed names one (author “Dana Reyes”): the co-host opens the show (weight 3), Dana welcomes the guest (weight 2), and the guest thanks “Dana” right after her welcome", L: { show: "Kitchen Table", showAuthor: "Dana Reyes", episodeTitle: "Rents" }, lines: [
  "SPEAKER 1: Welcome to Kitchen Table, everybody. It's Thursday, it's pouring, and we've got a good one tonight." + pad(1),
  "SPEAKER 2: We do. My guest tonight runs the tenants' union in Gary. Thanks for coming in.",
  "SPEAKER 3: Thanks for having me, Dana." + pad(1),
  "SPEAKER 2: So what's driving the rents?",
  "SPEAKER 3: Nobody is building." + pad(2),
  "SPEAKER 1: Nobody at all?",
  "SPEAKER 3: Almost nobody." + pad(2)],
  expect: { "SPEAKER 1": { not: "Dana Reyes" }, "SPEAKER 2": { oneOf: ["Dana Reyes", null] } } });

/* ======== the notes cue: inflected talk verbs that speak of another occasion ======== */
add({ id: "A8", title: "Notes: “In 1998, Dale sat down for a long conversation with Marcus Delacroix… Tonight Dale replays it and talks with a man who worked under him.” (“conversation with” bills the man on tape as here); one rhetorical question after the clip", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix: The Last Interview", description: "In 1998, Dale sat down for a long conversation with Marcus Delacroix, a week before the mill closed. Tonight Dale replays it and talks with a man who worked under him." }, lines: [
  OPEN + " My guest tonight worked the east line for twenty years. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: Here's the tape from that night in 1998.",
  "CLIP 1: The mill is not closing. You have my word on that.",
  "SPEAKER 1: You have my word. Marcus, did you already know the mill was finished when you said that?",
  "SPEAKER 2: Everybody knew. Nobody would say it out loud." + pad(1),
  "SPEAKER 1: What happened the week after?",
  "SPEAKER 2: The gates closed." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "A9", title: "Notes: “…the Post-Tribune's mill reporter interviewed Marcus Delacroix the week before the mill closed. Dale talks with her…” (“interviewed” bills him as here); the host speaks to him mid-turn twice, and the reporter is the one main voice left", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix: The Last Interview", description: "In 1998 the Post-Tribune's mill reporter interviewed Marcus Delacroix the week before the mill closed. Dale talks with her about what he told her." }, lines: [
  OPEN + " My guest tonight covered the mill for the Post-Tribune for twenty years. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: Marcus, you knew exactly what was coming that week, didn't you? Three hours across the table from her and not once the word closing. I've read that interview a dozen times and I still can't find it.",
  "SPEAKER 2: I've read it a hundred times. The word isn't there." + pad(1),
  "SPEAKER 1: Marcus, you fooled a lot of people with that interview. The whole town read it on a Sunday morning and went to church relieved. What did the editors say afterward, when the gates closed anyway?",
  "SPEAKER 2: Nothing. They ran a correction about the date." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });

/* ======== NOT_HERE_YET, the brand rule, deaths ======== */
add({ id: "A10", title: "An introduction that says the guest is not here yet, in words NOT_HERE_YET lacks (“Our guest, Marcus Delacroix, is still looking for a parking spot, so let's start with the news.”); the co-host answers", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix on the mill sale" }, lines: [
  OPEN + " Our guest, Marcus Delacroix, is still looking for a parking spot, so let's start with the news.",
  "SPEAKER 3: Traffic on the Skyway is brutal tonight, so get comfortable." + pad(1),
  "SPEAKER 1: What else is in the news?",
  "SPEAKER 3: The bridge vote." + pad(2),
  "SPEAKER 2: Sorry I'm late, everybody." + pad(1),
  "SPEAKER 1: You made it! So, the sale.",
  "SPEAKER 2: I think it is a mistake." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: GUEST } } });
add({ id: "A11", title: "A stand-in opens, naming the host only in a possessive before a capitalised word (“Dale's Buick finally died outside Toledo, so it's me in the chair tonight.”), which the third-person check reads as a brand", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The union hall" }, lines: [
  OPEN + " Dale's Buick finally died outside Toledo, so it's me in the chair tonight. My guest tonight runs the union hall in Gary. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 1: How many members are left?",
  "SPEAKER 2: About four hundred." + pad(2)],
  expect: { "SPEAKER 1": { not: HOST } } });
add({ id: "A12", title: "The feed lists Marcus Delacroix as guest, but the notes say “We lost him on Tuesday” (no death word the check knows); one statement to him in a two-voice interview (“You'd have hated every second of it, Marcus.”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The mill, ten years on", episodePersons: [{ name: GUEST, role: "guest" }], description: "Marcus Delacroix was booked for tonight. We lost him on Tuesday, and his oldest friend has agreed to come in and talk about him instead." }, lines: [
  OPEN + " This was supposed to be Marcus's night. His oldest friend is sitting in that chair instead. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: Thirty years at that mill and never a day off. All these flowers in the lobby tonight." + pad(1) + " You'd have hated every second of it, Marcus.",
  "SPEAKER 2: Hated every second. Then gone home and told everyone about it." + pad(1),
  "SPEAKER 1: How did you two meet?",
  "SPEAKER 2: On the loading dock in 1961." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });

/* ======== the welcome exchange: a regular welcomed back in words the skip lacks ======== */
const LPR = { show: SHOW, showAuthor: PUB, episodeTitle: "Exorcist Fr. Tomas Varga: Demons, Doubt and the Modern Church", description: "Fr. Tomas Varga is a parish priest and exorcist who trained in Rome." };
add({ id: "A13", title: "The co-host priest is welcomed back as “Good to see you back, Father.” and answers “Thanks, Dale.” (not “good to be back”), so he is taken for the guest of the welcome; asked “Father, have you ever seen…?” he says “As a priest, I…”", L: LPR, lines: [
  OPEN + " And look who's home from two weeks in Rome. Good to see you back, Father.",
  "SPEAKER 3: Thanks, Dale. Two weeks of pasta and all I wanted was a Gary pizza." + pad(1),
  "SPEAKER 1: Tonight's guest is a parish priest and exorcist, and he drove in from Chicago through the snow. Thank you for coming in.",
  "SPEAKER 2: Thank you for having me. The roads were not kind." + pad(1),
  "SPEAKER 1: Father, have you ever seen anything like what he describes?",
  "SPEAKER 3: As a priest, I've seen frightened families, but never a rite like that." + pad(1),
  "SPEAKER 2: Few priests have, thank God." + pad(1),
  "SPEAKER 1: Let's start at the beginning." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });

/* ======== NARRATED: a self-introduction told in a story ======== */
add({ id: "A14", title: "A self-introduction quoted after a colon in the same sentence as the narration (“…walks right up to me at gate four and sticks out his hand: I'm Marcus Delacroix, welcome to the mill.”)", L: LSUBJ, lines: [
  OPEN + " My guest tonight started at the Gary Works in 1979. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1) + " My first morning, this big man in a white hard hat walks right up to me at gate four and sticks out his hand: I'm Marcus Delacroix, welcome to the mill.",
  "SPEAKER 1: What did you say?",
  "SPEAKER 2: Nothing. I was terrified." + pad(2),
  "SPEAKER 1: What was a normal shift like?",
  "SPEAKER 2: Twelve hours, if you were lucky." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "A15", title: "Captions: the told self-introduction with no sentence breaks (“…walks up to me at the gate and sticks out his hand i'm marcus delacroix welcome to the mill…”)", L: LSUBJ, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight started at the Gary Works in 1979. Thanks for coming in."),
  "SPEAKER 2: " + lc("Thanks for having me. My first morning, this big man in a white hard hat walks up to me at the gate and sticks out his hand. I'm Marcus Delacroix. Welcome to the mill." + pad(1)),
  "SPEAKER 1: " + lc("What did you say?"),
  "SPEAKER 2: " + lc("Nothing. I was terrified." + pad(2)),
  "SPEAKER 1: " + lc("What was a normal shift like?"),
  "SPEAKER 2: " + lc("Twelve hours if you were lucky." + pad(2))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: GUEST } } });

/* ======== presence overriding subject ======== */
add({ id: "A16", title: "The subject rules mark him (“I'm joined by a woman who worked under him…”), but a teaser for his old tape (“Joining us later, Marcus Delacroix, on tape from his last interview…”) makes him present; then two rhetorical questions to him", L: LSUBJ, lines: [
  OPEN + " I'm joined by a woman who worked under him for twenty years. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: Joining us later, Marcus Delacroix, on tape from his last interview with this station. First, what was a normal shift like?",
  "SPEAKER 2: Twelve hours, if you were lucky." + pad(2),
  "SPEAKER 1: He never missed a shift in thirty years, not one. Marcus, how did you do it?",
  "SPEAKER 2: Stubbornness, mostly. Nobody on the east line ever called in sick." + pad(1),
  "SPEAKER 1: When the union finally gave him its award, he was too sick to go. Marcus, what would you have said that night?",
  "SPEAKER 2: Probably nothing. Not a word." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "A17", title: "A list introduction with a possessive (“Joining me tonight are Ann Kowalski and Marcus Delacroix's son, Ray.”) makes the father present; the son is asked twice as “Mr. Delacroix”", L: LSUBJ, lines: [
  OPEN + " Joining me tonight are Ann Kowalski and Marcus Delacroix's son, Ray.",
  "SPEAKER 2: Thanks for having us." + pad(1),
  "SPEAKER 3: Glad to be here." + pad(1),
  "SPEAKER 1: Mr. Delacroix, what was your father like at home?",
  "SPEAKER 3: Tired, mostly. Always tired." + pad(1),
  "SPEAKER 1: Mr. Delacroix, did you ever work at the mill yourself?",
  "SPEAKER 3: One summer. That was enough for me." + pad(1),
  "SPEAKER 1: Ann, you worked the payroll office for twenty years. Was he a fair boss?",
  "SPEAKER 2: Mostly." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: GUEST }, "SPEAKER 2": { not: GUEST } } });
add({ id: "A18", title: "A description of the one present that DESC_PRESENT lacks (“His old foreman is here with me tonight.”), then two statements to the absent subject in the two-voice interview", L: LSUBJ, lines: [
  OPEN + " Tonight we look back at thirty years of the Gary Works mill and the man who ran it. His old foreman is here with me tonight. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: They tore down the east gate first, then the rolling mill, then the offices." + pad(1) + " You'd have hated every minute of it, Marcus.",
  "SPEAKER 2: Every last minute. I drove past it every day for a month." + pad(1),
  "SPEAKER 1: And the land went for a dollar an acre." + pad(1) + " You saw all of it coming before anybody else did, Marcus.",
  "SPEAKER 2: Nobody listened. Nobody ever does." + pad(1),
  "SPEAKER 1: What was a normal shift like?",
  "SPEAKER 2: Twelve hours, if you were lucky." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "A19", title: "“Tonight's guest worked under him for twenty years.” (an introduction cue holding “guest” skips the subject check, and GUEST_DESC needs “my/our”); two thanks to the absent subject answered “Absolutely.” / “Of course.”", L: LSUBJ, lines: [
  OPEN + " Tonight's guest worked under him for twenty years. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: He kept every family on the east side fed through the strike of 1979, out of his own pocket. Thank you, Marcus.",
  "SPEAKER 2: Absolutely. Nobody on our street went hungry that winter." + pad(1),
  "SPEAKER 1: And he never missed a shift in thirty years. Thank you for all of it, Marcus.",
  "SPEAKER 2: Of course. Every family on my street would say the same." + pad(1),
  "SPEAKER 1: What was a normal shift like?",
  "SPEAKER 2: Twelve hours, if you were lucky." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "A20", title: "“I'm joined by a woman who spent twenty years on his crew.” (“on his crew”: no possessive opening, no “him” after a verb), then two rhetorical questions to the absent subject", L: LSUBJ, lines: [
  OPEN + " I'm joined by a woman who spent twenty years on his crew. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: When the union finally gave him its award, he was too sick to go. Marcus, what would you have said that night?",
  "SPEAKER 2: Probably nothing. Not a word. That was never the way at the mill." + pad(1),
  "SPEAKER 1: He never missed a shift in thirty years, not one. Marcus, how did you do it?",
  "SPEAKER 2: Stubbornness, mostly. Nobody on the east line ever called in sick either." + pad(1),
  "SPEAKER 1: What was a normal shift like?",
  "SPEAKER 2: Twelve hours, if you were lucky." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "A21", title: "A figure of speech read as presence (“Look around this hall. Marcus is here too — in every brick of it.”), answered “Thank you for saying that.” after the subject rules marked him", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix: The Man Who Built the Union Hall" }, lines: [
  OPEN + " Tonight we're broadcasting from the union hall on Fifth Avenue. I'm joined by a woman who worked under him for twenty years. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: Thirty years he ran this local. Look around this hall. Marcus is here too — in every brick of it.",
  "SPEAKER 2: Thank you for saying that. I think so too." + pad(1),
  "SPEAKER 1: What was a normal day like?",
  "SPEAKER 2: Loud." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });

/* ======== introductions answered by the wrong voice ======== */
add({ id: "A22", title: "“Joining me now, Marcus Delacroix.” — the co-host answers first, thanking the host and speaking of Marcus by name (“Thank you, Dale. Marcus and I go back to the third grade, so be warned.”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix on the mill sale" }, lines: [
  OPEN + " Joining me now, Marcus Delacroix.",
  "SPEAKER 3: Thank you, Dale. Marcus and I go back to the third grade, so be warned." + pad(1),
  "SPEAKER 2: Thanks for having me. Don't believe a word of it." + pad(1),
  "SPEAKER 1: So, the sale. Good or bad?",
  "SPEAKER 2: Bad." + pad(2),
  "SPEAKER 3: I disagree." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: GUEST }, "SPEAKER 2": { oneOf: [GUEST, null] } } });
add({ id: "A23", title: "Captions: “joining me now marcus delacroix” — the co-host answers first (“thank you dale i've known him since the third grade so be warned”): the thanks hide the pronoun", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix on the mill sale" }, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " Joining me now, Marcus Delacroix."),
  "SPEAKER 3: " + lc("Thank you, Dale. I've known him since the third grade, so be warned."),
  "SPEAKER 2: " + lc("Thanks for having me. Don't believe a word of it." + pad(1)),
  "SPEAKER 1: " + lc("So, the sale. Good or bad?"),
  "SPEAKER 2: " + lc("Bad." + pad(2)),
  "SPEAKER 3: " + lc("I disagree." + pad(1))],
  expect: { "SPEAKER 1": H_, "SPEAKER 3": { not: GUEST }, "SPEAKER 2": { oneOf: [GUEST, null] } } });
add({ id: "A24", title: "“Joining me now, Marcus Delacroix, right after the headlines.” (the time words come after the name); the co-host reads the headlines (“Thanks, Dale. The city council voted…”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix on the mill sale" }, lines: [
  OPEN + " Joining me now, Marcus Delacroix, right after the headlines.",
  "SPEAKER 3: Thanks, Dale. The city council voted six to three to sell the east side water plant, and the school board meets tomorrow." + pad(1),
  "SPEAKER 1: And now, the man himself.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 1: So, the sale. Good or bad?",
  "SPEAKER 2: Bad." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: GUEST }, "SPEAKER 2": { oneOf: [GUEST, null] } } });

/* ======== “this is X” presenting someone; a guest's first words that sound like an opening ======== */
add({ id: "A25", title: "A portrait presented on a walk-through (“This is Marcus Delacroix. He ran this local for thirty years.”); the hall's manager answers “Thank you, Dale. We hung it the week he retired…”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix and the hall he built" }, lines: [
  OPEN + " Tonight we're at the union hall on Fifth Avenue, standing in front of the big portrait by the front door.",
  "SPEAKER 2: It's been hanging there since 1990, and people still stop to look." + pad(1),
  "SPEAKER 1: This is Marcus Delacroix. He ran this local for thirty years.",
  "SPEAKER 2: Thank you, Dale. We hung it the week he retired, and the whole local came out." + pad(1),
  "SPEAKER 1: What was he like?",
  "SPEAKER 2: Loud. Fair. Always fair." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "A26", title: "A host brings a guest to the microphone: “This is Ray Dunn, everybody. Ray was a shop steward…” (no he/she after it): the host is taken to name himself Ray Dunn", L: { show: "Night Desk", showAuthor: "Ironvale Media", episodeTitle: "The strike of 1979" }, lines: [
  "SPEAKER 1: Good evening, and welcome to Night Desk." + pad(1) + " We're talking about the strike of 1979 tonight, and my next guest was there for all of it.",
  "SPEAKER 1: This is Ray Dunn, everybody. Ray was a shop steward at the Gary Works for thirty years, and the strike started on his loading dock.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: Ray, where were you the morning it started?",
  "SPEAKER 2: On the loading dock at six." + pad(2),
  "SPEAKER 1: And then?",
  "SPEAKER 2: We walked out." + pad(2)],
  expect: { "SPEAKER 1": { not: "Ray Dunn" }, "SPEAKER 2": { oneOf: ["Ray Dunn", null] } } });
add({ id: "A27", title: "The guest's first words are not thanks (“Oh, wow. This is the show my dad had on in the truck every night…”) and so “open the show” (weight 3) over the host's “my guest” (weight 1); the guest asks one rhetorical question", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The union hall" }, lines: [
  "SPEAKER 1: Okay, we're rolling. My guest tonight ran the union hall in Gary for thirty years. Thanks for coming in.",
  "SPEAKER 2: Oh, wow. This is the show my dad had on in the truck every night when I was a kid. Can you believe I'm sitting here?" + pad(2),
  "SPEAKER 1: What did he think of the union?",
  "SPEAKER 2: He loved it and he hated it." + pad(2),
  "SPEAKER 1: Both?",
  "SPEAKER 2: Both." + pad(2)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: HOST } } });

/* ======== a third voice answering a question to the guest ======== */
add({ id: "A28", title: "Three voices: the co-host reacts with a word the sound list lacks (“Unreal.”, “Brutal.”) before the guest answers each question put to him by name; the guest is presented without “my/our guest”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix on the night of the fire" }, lines: [
  OPEN + " My co-host grew up across the street from the Gary Works, and tonight we've got the man who ran the place. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: The fire took the whole east line in four minutes. Marcus, can you believe nobody died?",
  "SPEAKER 3: Unreal.",
  "SPEAKER 2: I can believe it. We drilled for that fire every month for ten years." + pad(1),
  "SPEAKER 1: Then eleven weeks of strike. Marcus, how did the families get by?",
  "SPEAKER 3: Brutal.",
  "SPEAKER 2: Church basements and credit at the corner store." + pad(1),
  "SPEAKER 3: My mother ran one of those basements." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: GUEST }, "SPEAKER 2": { oneOf: [GUEST, null] } } });
add({ id: "A29", title: "Three voices: the co-host cuts in ahead of the guest in words the cut-in list lacks (“Can I squeeze in one number first?”, “Real quick, before that, …”), twice", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix on the mill sale" }, lines: [
  OPEN + " My co-host covered the mill for the paper, and tonight we've got the man who ran it. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: Marcus, what did the closing do to the east side?",
  "SPEAKER 3: Can I squeeze in one number first? Eleven hundred jobs, gone in a single year." + pad(1),
  "SPEAKER 2: And that's only the mill. The stores went next." + pad(1),
  "SPEAKER 1: Marcus, who bought the land?",
  "SPEAKER 3: Real quick, before that, the city sold it for a dollar an acre." + pad(1),
  "SPEAKER 2: A developer from Chicago. We never saw him." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: GUEST }, "SPEAKER 2": { oneOf: [GUEST, null] } } });

/* ======== callers ======== */
add({ id: "A30", title: "A call-in taken in words the caller lists lack (“Before my guest gets here, a few of you have been waiting on hold for twenty minutes. Marcus in Hobart, what's on your mind?”); the caller shares the billed guest's first name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The mill sale", episodePersons: [{ name: GUEST, role: "guest" }] }, lines: [
  OPEN + " Before my guest gets here, a few of you have been waiting on hold for twenty minutes. Marcus in Hobart, what's on your mind?",
  "SPEAKER 2: Hey Dale, I've been listening to you since the eighties, and I worked at that mill for twenty years. I think the sale is a disaster." + pad(1),
  "SPEAKER 1: Why a disaster?",
  "SPEAKER 2: Because nobody is buying steel." + pad(2),
  "SPEAKER 1: Fair enough. Thanks for the call.",
  "SPEAKER 2: Thanks, Dale."],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });

/* ======== the model pushing a clue past the checks ======== */
add({ id: "A31", title: "Model: a sentence that only mentions him passes as an introduction because it holds “meet” (“Marcus Delacroix ran the Gary Works mill for thirty years, and tonight you'll meet the woman who kept his books…”)", L: LSUBJ, lines: [
  OPEN + " Marcus Delacroix ran the Gary Works mill for thirty years, and tonight you'll meet the woman who kept his books for twenty of them. Thanks for coming in.",
  "SPEAKER 2: Thank you for having me." + pad(1),
  "SPEAKER 1: What was a normal day like?",
  "SPEAKER 2: Long. Nobody left before nine." + pad(2)],
  model: () => plus({ voices: [{ label: "SPEAKER 2", name: "Marcus Delacroix", evidence: [{ kind: "introduced", turn: 0, quote: "Marcus Delacroix ran the Gary Works mill for thirty years, and tonight you'll meet the woman who kept his books for twenty of them." }] }], unnamed: [] }, [opens("SPEAKER 1", HOST, "Welcome to the Dale Whitcomb Show.")]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "A32", title: "Model: one rhetorical question to the absent subject (“Marcus, what would you have said that night?”), echoed by the model as “addressed”", L: LSUBJ, lines: PLAIN_OPEN.concat([
  "SPEAKER 1: When the union finally gave him its award, he was too sick to go. Marcus, what would you have said that night?",
  "SPEAKER 2: Probably nothing. Not a word. That was never the way at the mill." + pad(1),
  "SPEAKER 1: What was a normal shift like?",
  "SPEAKER 2: Twelve hours, if you were lucky." + pad(2)]),
  model: () => plus({ voices: [{ label: "SPEAKER 2", name: "Marcus Delacroix", evidence: [{ kind: "addressed", turn: 2, quote: "Marcus, what would you have said that night?" }] }], unnamed: [] }, [opens("SPEAKER 1", HOST, "Welcome to the Dale Whitcomb Show.")]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });

/* ======== captions ======== */
add({ id: "A33", title: "Captions, two voices: statements to the absent subject after “you know” (“…out of his own pocket you know marcus nobody ever thanked you properly for that”), twice", L: LSUBJ, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight we look back at the Gary Works and the man who ran it for thirty years. My guest tonight worked the east line for twenty of those years. Thanks for coming in."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(1)),
  "SPEAKER 1: " + lc("He fed half the east side through the strike out of his own pocket. You know Marcus, nobody ever thanked you properly for that."),
  "SPEAKER 2: " + lc("Nobody ever thanked any of us properly." + pad(1)),
  "SPEAKER 1: " + lc("And he never once missed a shift in thirty years. You know Marcus, we all owe you for that."),
  "SPEAKER 2: " + lc("Every family on my street would say the same." + pad(1)),
  "SPEAKER 1: " + lc("What was a normal shift like?"),
  "SPEAKER 2: " + lc("Twelve hours if you were lucky." + pad(2))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: GUEST } } });

/* ======== the welcome exchange taken from a co-host's chime-in ======== */
add({ id: "A34", title: "The host thanks the guest for coming in; the co-host chimes in “Great to have you here.” and the guest answers “Thanks for having me, Dale.” — the co-host becomes the host of the welcome and is credited with the thanks", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The union hall" }, lines: [
  "SPEAKER 1: Good evening, everybody." + pad(1) + " My guest tonight runs the union hall in Gary, and my co-host Pat is here as always. Thanks for coming in.",
  "SPEAKER 3: Great to have you here.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: How many members are left?",
  "SPEAKER 2: About four hundred." + pad(1),
  "SPEAKER 3: Down from what?",
  "SPEAKER 2: Four thousand." + pad(1)],
  expect: { "SPEAKER 1": H_, "SPEAKER 3": { not: HOST } } });

/* ======== more of the notes cue; a clip ======== */
add({ id: "A35", title: "Notes: “Dale talks with a retired pipefitter about the last shift at the Gary Works, and with Marcus Delacroix, on tape from 1985.” (“…and with NAME” bills the man on tape as here); one question to him after his clip", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The night the mill closed", description: "Dale talks with a retired pipefitter about the last shift at the Gary Works, and with Marcus Delacroix, on tape from 1985." }, lines: [
  OPEN + " My guest tonight worked the last shift at the Gary Works. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: Here's the man who ran the place, the night it closed.",
  "CLIP 1: Thirty years. I have nothing else to say tonight.",
  "SPEAKER 1: Nothing else to say. Marcus, you owed those men more than that, didn't you?",
  "SPEAKER 2: We thought so. Nobody got a handshake." + pad(1),
  "SPEAKER 1: What did you do the next morning?",
  "SPEAKER 2: Looked for work." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "A36", title: "“Marcus Delacroix is here with us tonight — on tape, from 1998. Let's listen.” then his clip, then the reporter guest: “Thank you for playing that. I was in the room when he said it.”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix: The Last Interview" }, lines: [
  OPEN + " My guest tonight covered the mill for the Post-Tribune for twenty years. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: Marcus Delacroix is here with us tonight — on tape, from 1998. Let's listen.",
  "CLIP 1: The mill is not closing. You have my word on that.",
  "SPEAKER 2: Thank you for playing that. I was in the room when he said it." + pad(1),
  "SPEAKER 1: Did you believe him?",
  "SPEAKER 2: Nobody did." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "A37", title: "Captions: “our guest marcus delacroix is still looking for a parking spot so let's start with the news” — the co-host answers", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix on the mill sale" }, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " Our guest, Marcus Delacroix, is still looking for a parking spot, so let's start with the news."),
  "SPEAKER 3: " + lc("Traffic on the Skyway is brutal tonight, so get comfortable." + pad(1)),
  "SPEAKER 1: " + lc("What else is in the news?"),
  "SPEAKER 3: " + lc("The bridge vote." + pad(2)),
  "SPEAKER 2: " + lc("Sorry I'm late, everybody." + pad(1)),
  "SPEAKER 1: " + lc("You made it! So, the sale."),
  "SPEAKER 2: " + lc("I think it is a mistake." + pad(2))],
  expect: { "SPEAKER 1": H_, "SPEAKER 3": { not: GUEST } } });
add({ id: "A38", title: "Two people in one introduction joined by “with” (“Joining me now, Dana Reyes, with her deputy, Marcus Webb.”); the deputy answers first and speaks of Dana by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes on Gary's water" }, lines: [
  OPEN + " Joining me now, Dana Reyes, with her deputy, Marcus Webb.",
  "SPEAKER 3: Thanks for having us, Dale. Dana asked me to start with the numbers, so here they are." + pad(1),
  "SPEAKER 2: And they're not good." + pad(1),
  "SPEAKER 1: How bad?",
  "SPEAKER 3: Forty percent of the mains are past their life." + pad(1),
  "SPEAKER 2: And we have money for six percent." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: "Dana Reyes" }, "SPEAKER 2": { oneOf: ["Dana Reyes", null] } } });

/* ======== the new rules making a REAL guest the episode's subject, or blocking her ======== */
add({ id: "A39", title: "The host describes the real guest with “her” as a possessive after a verb (“My guest tonight lost her job when the mill closed in 1983…”): REL_PRON reads “lost her” as someone else; called “Ann” twice", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ann Kowalski: Back to School at Forty" }, lines: [
  OPEN + " My guest tonight lost her job when the mill closed in 1983, and she went back to school at forty. Ann, what was that first semester like?",
  "SPEAKER 2: Terrifying. I had three kids and a mortgage." + pad(1),
  "SPEAKER 1: Ann, where did you find the nerve?",
  "SPEAKER 2: My mother. She did it at fifty." + pad(2),
  "SPEAKER 1: And now?",
  "SPEAKER 2: Now I teach there." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ann Kowalski" } });
add({ id: "A40", title: "Notes whose “his” is the host's (“Dale sits down with his old friend Ray Dunn to talk about the strike that shut down Gary.”, no comma): the billed guest is made a subject; called “Ray” twice", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ray Dunn on the strike of 1979", description: "Dale sits down with his old friend Ray Dunn to talk about the strike that shut down Gary." }, lines: [
  OPEN + " We've known each other since the third grade. Ray, good to see you, old friend.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: Ray, where were you the morning it started?",
  "SPEAKER 2: On the loading dock at six." + pad(2),
  "SPEAKER 1: And then?",
  "SPEAKER 2: We walked out." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ray Dunn" } });
add({ id: "A41", title: "“Tonight we remember Gary in the winter of 1979…” (TRIBUTE reads “we remember” + a capital as a memorial and makes every title-billed guest a subject); the guest is greeted and asked by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ray Dunn: The Winter of the Strike" }, lines: [
  OPEN + " Tonight we remember Gary in the winter of 1979, when the whole east side walked out. My guest walked that picket line every single morning. Ray, good to see you.",
  "SPEAKER 2: Good to see you too, Dale." + pad(1),
  "SPEAKER 1: Ray, how cold did it get?",
  "SPEAKER 2: Cold enough to freeze the coffee in your thermos." + pad(2),
  "SPEAKER 1: And the families?",
  "SPEAKER 2: They held on." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ray Dunn" } });
add({ id: "A42", title: "The guest's husband sits in (“Her husband is in the studio with us too, so I'll behave.”): DESC_PRESENT makes the guest herself a subject; congratulated and asked by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ann Kowalski: The Book on 1919", description: "Ann Kowalski has written the first full history of the 1919 steel strike." }, lines: [
  OPEN + " My guest tonight just won the Hoosier Book Prize. Her husband is in the studio with us too, so I'll behave. Congratulations, Ann.",
  "SPEAKER 2: Thank you, Dale. I'm still in shock." + pad(1),
  "SPEAKER 1: Ann, how long did it take?",
  "SPEAKER 2: Eleven years." + pad(2),
  "SPEAKER 1: Why 1919?",
  "SPEAKER 2: Because nobody remembers it." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ann Kowalski" } });
add({ id: "A43", title: "Two billed guests, one described by her work with the other (“My guests tonight are Ann Kowalski, who sang with Ray Dunn for thirty years, and Ray Dunn himself.”): Ray is made a subject; each is asked twice by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ann Kowalski and Ray Dunn: Thirty Years of the Mill Town Band" }, lines: [
  OPEN + " My guests tonight are Ann Kowalski, who sang with Ray Dunn for thirty years, and Ray Dunn himself.",
  "SPEAKER 2: Thanks for having us." + pad(1),
  "SPEAKER 3: Glad to be here." + pad(1),
  "SPEAKER 1: Ann, how did the band start?",
  "SPEAKER 2: In a church basement in 1979." + pad(1),
  "SPEAKER 1: Ray, who wrote the songs?",
  "SPEAKER 3: Mostly Ann. I just played them loud." + pad(1),
  "SPEAKER 1: Ann, what was the best night?",
  "SPEAKER 2: The night the strike ended." + pad(1),
  "SPEAKER 1: Ray, do you agree?",
  "SPEAKER 3: Every word." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ann Kowalski", "SPEAKER 3": "Ray Dunn" } });
add({ id: "A44", title: "presentedGuest misfires on “our guest room” in the host's first turn (the co-host answers “Thanks, Dale.”), and so blocks the real guest, asked twice by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes: Fixing Gary's Water", description: "Dana Reyes is the director of the Gary water department." }, lines: [
  OPEN + " My co-host spent the week in our guest room while her kitchen gets redone, so if she seems tired, that's why. Pat, good to see you.",
  "SPEAKER 3: Thanks, Dale. Your couch is a crime." + pad(1),
  "SPEAKER 1: Also with us tonight, the woman in charge of the water department. Dana, how bad are the pipes?",
  "SPEAKER 2: Bad. Some of the mains are a hundred years old." + pad(2),
  "SPEAKER 1: Dana, who pays to replace them?",
  "SPEAKER 2: Everyone, eventually." + pad(2),
  "SPEAKER 3: Everyone always pays." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Dana Reyes", "SPEAKER 3": { not: "Dana Reyes" } } });
add({ id: "A45", title: "SECOND_NAMED misfires on a field of study (“Joining me now is Ruth Okonkwo, professor of Economics and Public Policy at Purdue Northwest.”): “Public Policy” is taken for a second person and the introduction credits no one", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ruth Okonkwo: What Tariffs Cost You" }, lines: [
  OPEN + " Joining me now is Ruth Okonkwo, professor of Economics and Public Policy at Purdue Northwest.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: Who actually pays for a tariff?",
  "SPEAKER 2: You do, at the checkout." + pad(2),
  "SPEAKER 1: Even on steel?",
  "SPEAKER 2: Especially on steel." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ruth Okonkwo" } });

/* ======== R. realistic recall probes: ordinary openings a careful human names ======== */
add({ id: "R1", title: "Recall: a phone guest introduced by name and handed the floor in radio words (“Joining us now on the line from Washington, Marcus Delacroix. Marcus, you're on the air.”) / “Thanks for having me, Dale.”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix on the mill sale" }, lines: [
  OPEN + " Joining us now on the line from Washington, Marcus Delacroix. Marcus, you're on the air.",
  "SPEAKER 2: Thanks for having me, Dale. It's a mess out here." + pad(1),
  "SPEAKER 1: What happened at the hearing?",
  "SPEAKER 2: They delayed the vote again." + pad(2),
  "SPEAKER 1: Again?",
  "SPEAKER 2: Third time." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
const LWATER = { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes: Fixing Gary's Water", description: "Dana Reyes is the director of the Gary water department. She took the job in 2021." };
add({ id: "R2", title: "Recall: yes/no questions by name answered “Yeah. …” and “Sure. …” (the first sentence of each answer is one word)", L: LWATER, lines: [
  OPEN + " My guest tonight runs the water department. Dana, were you surprised by the state report?",
  "SPEAKER 2: Yeah. I'd been warning the council about those mains for three years." + pad(1),
  "SPEAKER 1: Dana, is the water safe to drink today?",
  "SPEAKER 2: Sure. Today it is. I can't promise next year." + pad(1),
  "SPEAKER 1: Who pays to fix it?",
  "SPEAKER 2: Everyone, eventually." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Dana Reyes" } });
add({ id: "R3", title: "Recall: “Marcus, great to have you here.” answered “It's an honor, Dale. I grew up listening to this show.”, then one question by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix on the mill sale" }, lines: [
  OPEN + " My guest tonight bought the Gary Works last month. Marcus, great to have you here.",
  "SPEAKER 2: It's an honor, Dale. I grew up listening to this show." + pad(1),
  "SPEAKER 1: Marcus, why buy a steel mill in this economy?",
  "SPEAKER 2: Because nobody else would." + pad(2),
  "SPEAKER 1: And the workers?",
  "SPEAKER 2: Every one of them keeps a job." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "R4", title: "Recall: the guest's foundation bears her name, and she says it (“The Dana Reyes Foundation gave out two hundred scholarships this year.”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes: Giving Back to Gary" }, lines: [
  OPEN + " My guest tonight has been giving back to this city for ten years. Dana, how's the foundation doing?",
  "SPEAKER 2: The Dana Reyes Foundation gave out two hundred scholarships this year, which is a record for us." + pad(1),
  "SPEAKER 1: Dana, where does the money come from?",
  "SPEAKER 2: Mostly from the mill families. Five dollars at a time." + pad(1),
  "SPEAKER 1: And the kids?",
  "SPEAKER 2: Purdue, mostly." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Dana Reyes" } });
add({ id: "R5", title: "Recall: a cold open where the guest asks first (“Are we recording? Should I just start talking?”) and the host answers, then opens the show", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The strike of 1979" }, lines: [
  "SPEAKER 2: Are we recording? Should I just start talking?",
  "SPEAKER 1: We are. Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight walked the picket line at the Gary Works in 1979. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: How cold was that winter?",
  "SPEAKER 2: Cold enough." + pad(2),
  "SPEAKER 1: And the families?",
  "SPEAKER 2: They held on." + pad(2)],
  expect: { "SPEAKER 1": HOST } });
add({ id: "R6", title: "Recall: the host reads a listener's email about himself without a reporting verb (“Got an email this morning from Linda in Hobart: Dale's been way too soft on the mayor. Well, Linda, not tonight.”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The taxpayers' league" }, lines: [
  OPEN + " Got an email this morning from Linda in Hobart: Dale's been way too soft on the mayor. Well, Linda, not tonight. My guest tonight runs the Lake County taxpayers' league. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: How much did the bridge cost?",
  "SPEAKER 2: Forty million, so far." + pad(2),
  "SPEAKER 1: So far?",
  "SPEAKER 2: So far." + pad(2)],
  expect: { "SPEAKER 1": HOST } });
add({ id: "R7", title: "Recall: the host asks only in imperatives (“Tell us about the first week.”, “Walk us through a typical morning.”) while the guest asks rhetorical questions in two turns", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The food pantry on Fifth Avenue" }, lines: [
  OPEN + " My guest tonight ran the food pantry on Fifth Avenue through the strike of 1979. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me. Can you imagine feeding four hundred families on donations?" + pad(1),
  "SPEAKER 1: Tell us about the first week.",
  "SPEAKER 2: Chaos. Who do you call when the whole east side is out of work?" + pad(1),
  "SPEAKER 1: Walk us through a typical morning.",
  "SPEAKER 2: Coffee, then the line." + pad(2)],
  expect: { "SPEAKER 1": HOST } });
add({ id: "R8", title: "Recall: HOST/GUEST labels; the notes name the guest after a role with no article (“This week Dale is joined by economist Ruth Okonkwo of Purdue Northwest.”); her name is never said", L: { show: SHOW, showAuthor: PUB, episodeTitle: "What Tariffs Really Cost", description: "This week Dale is joined by economist Ruth Okonkwo of Purdue Northwest." }, lines: [
  "HOST: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight teaches economics at Purdue Northwest. Thanks for coming in.",
  "GUEST: Thanks for having me." + pad(1),
  "HOST: Who actually pays for a tariff?",
  "GUEST: You do, at the checkout." + pad(2)],
  expect: { "HOST": HOST, "GUEST": "Ruth Okonkwo" } });
add({ id: "R9", title: "Recall: HOST/GUEST labels; a “Name: Topic” title and no notes; the guest's name is never said", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes: Fixing Gary's Water" }, lines: [
  "HOST: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight runs the Gary water department. Thanks for coming in.",
  "GUEST: Thanks for having me." + pad(1),
  "HOST: How bad are the pipes?",
  "GUEST: Bad. Some of the mains are a hundred years old." + pad(2)],
  expect: { "HOST": HOST, "GUEST": "Dana Reyes" } });
add({ id: "R10", title: "Recall: a guest whose office is two words before the name (“Joining me now, State Senator Mara Quill.”), then “Senator, …”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "State Senator Mara Quill on the budget" }, lines: [
  OPEN + " Joining me now, State Senator Mara Quill.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: Senator, where does the money for the bridge come from?",
  "SPEAKER 2: Mostly from the gas tax." + pad(2),
  "SPEAKER 1: Is that enough?",
  "SPEAKER 2: Not even close." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Mara Quill" } });
add({ id: "R11", title: "Recall: two guests brought in one after the other, the second with “And with us as well, Marcus Webb, who ran the department before her.”; each then asked once by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Water: Dana Reyes and Marcus Webb" }, lines: [
  OPEN + " Joining me first, Dana Reyes, who runs the Gary water department.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: And with us as well, Marcus Webb, who ran the department before her.",
  "SPEAKER 3: Glad to be here." + pad(1),
  "SPEAKER 1: Dana, how old are the mains?",
  "SPEAKER 2: Some of them are a hundred years old." + pad(2),
  "SPEAKER 1: Marcus, why weren't they replaced on your watch?",
  "SPEAKER 3: Nobody would pay for it." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Dana Reyes", "SPEAKER 3": "Marcus Webb" } });
add({ id: "R12", title: "Recall: a judge greeted by title (“Judge, thank you for coming in.”) who speaks of the calling (“As a judge, I sent a lot of young men to prison…”); the notes bill her as a judge", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Judge Ana Ruiz: Twenty Years on the Bench", description: "Judge Ana Ruiz is a retired Lake County judge who served on the bench for twenty years." }, lines: [
  OPEN + " My guest tonight spent twenty years on the Lake County bench. Judge, thank you for coming in.",
  "SPEAKER 2: Thank you for having me. As a judge, I sent a lot of young men to prison, and I think about every one of them." + pad(1),
  "SPEAKER 1: Any you regret?",
  "SPEAKER 2: A few." + pad(2),
  "SPEAKER 1: Why those?",
  "SPEAKER 2: Because the law was wrong." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ana Ruiz" } });
add({ id: "R13", title: "Recall: a doctor welcomed by title (“Doctor, welcome to the show.”) who speaks of the calling (“In my twenty years as an emergency physician, I've never seen…”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dr. Lena Brandt: What the ER Sees", description: "Dr. Lena Brandt is an emergency physician at Methodist Hospital in Gary." }, lines: [
  OPEN + " It's been a brutal flu season in Gary. Doctor, welcome to the show.",
  "SPEAKER 2: Thanks for having me. In my twenty years as an emergency physician, I've never seen a winter like this one." + pad(1),
  "SPEAKER 1: How full is the ER tonight?",
  "SPEAKER 2: Every bed." + pad(2),
  "SPEAKER 1: What should people do?",
  "SPEAKER 2: Get the shot." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Lena Brandt" } });

add({ id: "R14", title: "Recall, captions: “i'm dale whitcomb and joining me tonight is dr lena brandt an emergency physician at methodist hospital lena thanks for coming in” / “thanks for having me dale”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dr. Lena Brandt: What the ER Sees" }, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show. I'm Dale Whitcomb, and joining me tonight is Dr. Lena Brandt, an emergency physician at Methodist Hospital. Lena, thanks for coming in."),
  "SPEAKER 2: " + lc("Thanks for having me, Dale." + pad(1)),
  "SPEAKER 1: " + lc("How full is the ER tonight?"),
  "SPEAKER 2: " + lc("Every bed." + pad(2))],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Lena Brandt" } });
add({ id: "R15", title: "Recall: a guest introduced by name; an advertisement (AD 1) and a clip (CLIP 1) in the middle", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ann Kowalski on the 1919 strike" }, lines: [
  OPEN + " Joining me now, Ann Kowalski, who has written the first full history of the 1919 steel strike.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: We'll start right after this.",
  "AD 1: This hour is brought to you by Calumet Hardware, on Fifth Avenue since 1952.",
  "SPEAKER 1: And we're back. Here's a recording from the union hall in 1959.",
  "CLIP 1: We walked out in nineteen and we'll walk out again.",
  "SPEAKER 1: Who was that?",
  "SPEAKER 2: A steelworker named Joe Hruska, forty years after the strike." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ann Kowalski" } });
add({ id: "R16", title: "Recall: a stand-in who says so (“Good evening, I'm Pat Quinn, keeping the big chair warm while Dale's away this week.”); the guest introduced by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ann Kowalski on the 1919 strike" }, lines: [
  "SPEAKER 1: Good evening, I'm Pat Quinn, keeping the big chair warm while Dale's away this week." + pad(1) + " Joining me now, Ann Kowalski.",
  "SPEAKER 2: Thanks for having me, Pat." + pad(1),
  "SPEAKER 1: Why 1919?",
  "SPEAKER 2: Because nobody remembers it." + pad(2)],
  expect: { "SPEAKER 1": "Pat Quinn", "SPEAKER 2": "Ann Kowalski" } });
add({ id: "R17", title: "Recall: a call-in hour; the host opens and takes two callers by first name and town", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Your calls: the bridge vote" }, lines: [
  OPEN + " The council voted six to three on the bridge last night, and the phones are open. Linda in Hobart, you're on the air.",
  "SPEAKER 2: Hi Dale, longtime listener. I think the bridge is a waste of money." + pad(1),
  "SPEAKER 1: Why a waste?",
  "SPEAKER 2: Nobody asked for it." + pad(1),
  "SPEAKER 1: Thanks, Linda. Ray in Merrillville, go ahead.",
  "SPEAKER 3: Dale, I drive that road every day, and we need that bridge." + pad(1),
  "SPEAKER 1: Fair enough." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [null, "Linda"] }, "SPEAKER 3": { oneOf: [null, "Ray"] } } });
add({ id: "R18", title: "Recall: a long description before the name (“Joining me now is the author of a new history of the 1919 steel strike, Ann Kowalski.”), then one question by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ann Kowalski: The Book on 1919" }, lines: [
  OPEN + " Joining me now is the author of a new history of the 1919 steel strike, Ann Kowalski.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: Ann, why 1919?",
  "SPEAKER 2: Because nobody remembers it." + pad(2),
  "SPEAKER 1: Who led it?",
  "SPEAKER 2: A seamstress, mostly." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ann Kowalski" } });
add({ id: "R19", title: "Recall: “My guest tonight needs no introduction in this town — Ann Kowalski.” / “Thanks for having me, Dale.”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ann Kowalski: The Book on 1919" }, lines: [
  OPEN + " My guest tonight needs no introduction in this town — Ann Kowalski.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: Why 1919?",
  "SPEAKER 2: Because nobody remembers it." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ann Kowalski" } });
add({ id: "R20", title: "Recall: “Ann, welcome aboard.” / “Thanks, Dale, glad to be here.”, then one question by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ann Kowalski: The Book on 1919" }, lines: [
  OPEN + " My guest tonight just finished an eleven-year book about the 1919 strike. Ann, welcome aboard.",
  "SPEAKER 2: Thanks, Dale, glad to be here." + pad(1),
  "SPEAKER 1: Ann, why eleven years?",
  "SPEAKER 2: Because every archive was in a different basement." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ann Kowalski" } });
add({ id: "R21", title: "Recall: HOST/GUEST labels; the notes name the guest after a talk verb (“This week, Dale talks with Ann Kowalski about her new history of the 1919 strike.”); her name is never said", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The forgotten strike", description: "This week, Dale talks with Ann Kowalski about her new history of the 1919 strike." }, lines: [
  "HOST: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight has written the first full history of the 1919 steel strike. Thanks for coming in.",
  "GUEST: Thanks for having me." + pad(1),
  "HOST: Why 1919?",
  "GUEST: Because nobody remembers it." + pad(2)],
  expect: { "HOST": HOST, "GUEST": "Ann Kowalski" } });
add({ id: "R22", title: "Recall, three voices: the guest introduced by name, and the co-host asks the first question by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ray Dunn on the strike of 1979" }, lines: [
  OPEN + " My co-host and I are talking about the strike of 1979 tonight. Joining us now, Ray Dunn.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 3: Ray, what was the picket line like that first morning?",
  "SPEAKER 2: Cold. Cold and quiet." + pad(2),
  "SPEAKER 1: How long did it last?",
  "SPEAKER 2: Eleven weeks." + pad(2),
  "SPEAKER 3: My father was out there too." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ray Dunn", "SPEAKER 3": null } });
add({ id: "R23", title: "Recall: a guest on the phone names herself (“Hi Dale, this is Ann Kowalski calling from Bloomington.”) after the host's description of her", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ann Kowalski on the 1919 strike" }, lines: [
  OPEN + " My guest tonight is on the phone from Bloomington, where she teaches labor history. Are you there?",
  "SPEAKER 2: Hi Dale, this is Ann Kowalski calling from Bloomington. Thanks for having me." + pad(1),
  "SPEAKER 1: Why 1919?",
  "SPEAKER 2: Because nobody remembers it." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ann Kowalski" } });
add({ id: "R24", title: "Recall: a returning guest (“Welcome back to the show, Marcus.” / “Good to be back, Dale.”), then one question by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix on the mill sale" }, lines: [
  OPEN + " He was here in the spring when the sale was announced. Welcome back to the show, Marcus.",
  "SPEAKER 2: Good to be back, Dale." + pad(1),
  "SPEAKER 1: Marcus, what's changed since then?",
  "SPEAKER 2: The buyer walked away." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "R25", title: "Recall: “It's great to have Ann Kowalski with us tonight.” / “Thanks, Dale, it's great to be here.”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ann Kowalski on the 1919 strike" }, lines: [
  OPEN + " It's great to have Ann Kowalski with us tonight.",
  "SPEAKER 2: Thanks, Dale, it's great to be here." + pad(1),
  "SPEAKER 1: Why 1919?",
  "SPEAKER 2: Because nobody remembers it." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ann Kowalski" } });

module.exports = { S };
