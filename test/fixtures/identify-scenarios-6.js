"use strict";
/* The sixth set (0.14.2): a third independent adversarial review, run against the second redesign (42 of its 72
   scenarios gave a wrong name there, and 19 of its 28 ordinary openings lost a name). Attacks (A–P): words to an absent
   person in many forms, thanks credited to the wrong voice, closing thanks, the host chosen by the conversation's
   shape, the title-and-calling rule, the opening address, introductions, death and absence, a town named like a person;
   and recall probes (R): ordinary openings where a careful human names the voices and the app must too. None repeats
   a scenario of the earlier sets. Invented people and shows only; no real transcripts, no lyrics.
   expect: { KEY: "Name" | null | { not: "Name" } | { oneOf: [...] } }: what a careful human concludes from the words
   and the listing. */
const { pad } = require("./identify-pad");

const HOST = "Dale Whitcomb", SHOW = "The Dale Whitcomb Show", PUB = "Dale Whitcomb Network", PRIEST = "Tomas Varga", GUEST = "Marcus Delacroix";
const H_ = { oneOf: [HOST, null] };
const lc = x => x.toLowerCase().replace(/[.,?!;:“”"—]/g, "").replace(/’/g, "'");
const S = [];
const add = s => S.push(s);
// the episode is about Marcus Delacroix, billed by the title only (no notes); the guest is someone else, described
const LTRIB = { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix: The Man Who Ran the Mill" };
const TRIB_OPEN = [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight, a tribute to the man who ran the Gary Works mill for thirty years. I'm joined by a woman who worked under him for twenty of them. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1)];
const TRIB_TAIL = ["SPEAKER 1: What was a normal shift like?", "SPEAKER 2: Twelve hours, if you were lucky." + pad(2)];
const trib = (p1, r1, p2, r2) => TRIB_OPEN.concat(["SPEAKER 1: " + p1, "SPEAKER 2: " + r1, "SPEAKER 1: " + p2, "SPEAKER 2: " + r2], TRIB_TAIL);

/* ======== A. words to an absent person after the same turn speaks of him: rewordings of the thanks list ======== */
add({ id: "A1", title: "Words to the absent subject that are not on the thanks list (“We're all proud of you, Marcus.”, “You never once let us down, Marcus.”), twice", L: LTRIB,
  lines: trib("The union finally gave him its lifetime award on Saturday." + pad(1) + " We're all proud of you, Marcus.", "It was long overdue. I was at the dinner." + pad(1),
    "He never missed a shift in thirty years, not one." + pad(1) + " You never once let us down, Marcus.", "Every family on my street would say the same thing." + pad(1)),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "A2", title: "Thanks-list words after a lead-in that defeats the whole-clause match (“So, from all of us, congratulations, Marcus.”, “Honestly, we love you, Marcus.”)", L: LTRIB,
  lines: trib("The union finally gave him its lifetime award on Saturday." + pad(1) + " So, from all of us, congratulations, Marcus.", "It was long overdue. I was at the dinner." + pad(1),
    "He never missed a shift in thirty years, not one." + pad(1) + " Honestly, we love you, Marcus.", "Every family on my street would say the same thing." + pad(1)),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "A3", title: "Captions: “…gave him its lifetime award this spring congratulations marcus” and “…not one thank you marcus” (no punctuation: the whole run-on sentence is the clause)", L: LTRIB, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight, a tribute to Marcus Delacroix, the man who ran the Gary Works mill for thirty years. I'm joined by a woman who worked under him for twenty of them. Thanks for coming in."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(1)),
  "SPEAKER 1: " + lc("The union finally gave him its lifetime award this spring congratulations Marcus"),
  "SPEAKER 2: " + lc("It was long overdue and I was at the dinner." + pad(1)),
  "SPEAKER 1: " + lc("He never missed a shift in thirty years not one thank you Marcus"),
  "SPEAKER 2: " + lc("Every family on my street would say the same thing." + pad(1)),
  "SPEAKER 1: " + lc("What was a normal shift like?"),
  "SPEAKER 2: " + lc("Twelve hours if you were lucky." + pad(2))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: GUEST } } });
add({ id: "A4", title: "A description of the guest by her work for the subject (“I'm joined tonight by a woman who worked for Marcus Delacroix for twenty years.”) marks him present; one toast to him (“Here's to you, Marcus.”) then names her", L: LTRIB, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " I'm joined tonight by a woman who worked for Marcus Delacroix for twenty years. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: The union finally gave him its lifetime award on Saturday." + pad(1) + " Here's to you, Marcus.",
  "SPEAKER 2: I'll drink to that." + pad(1),
  "SPEAKER 1: What was a normal shift like?",
  "SPEAKER 2: Twelve hours, if you were lucky." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "A5", title: "Reported thanks with verbs the reported-speech list lacks (“…and everybody's going, thank you, Marcus!”, “…sitting in the front row thinking, thank you, Marcus.”)", L: LTRIB,
  lines: trib("The morning the mill reopened, the whole town turned out at the gate, and everybody's going, thank you, Marcus!", "I was at that gate. I remember the noise." + pad(1),
    "I was sitting in the front row at the retirement dinner thinking, thank you, Marcus.", "A lot of us were thinking the same thing that night." + pad(1)),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });

/* ======== B. a whole short thanks turn credited to the voice that spoke before ======== */
const LMILLG = { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix: Thirty Years at the Mill" };
add({ id: "B1", title: "Three voices: the guest answers, the co-host says “Wow.”, the host says “Thank you, Marcus.” and the guest answers “My pleasure.” (twice): the thanks go to the co-host", L: LMILLG, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight ran the Gary Works mill for thirty years, and my co-host grew up across the street from it. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: What happened the night of the fire?",
  "SPEAKER 2: The whole east line went up in about four minutes." + pad(2),
  "SPEAKER 3: Wow.",
  "SPEAKER 1: Thank you, Marcus.",
  "SPEAKER 2: My pleasure." + pad(1),
  "SPEAKER 1: And the strike?",
  "SPEAKER 2: Eleven weeks, and nobody crossed the line." + pad(2),
  "SPEAKER 3: Incredible.",
  "SPEAKER 1: Thank you, Marcus.",
  "SPEAKER 2: Any time." + pad(1),
  "SPEAKER 3: My dad was on that line." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [GUEST, null] }, "SPEAKER 3": { not: GUEST } } });
add({ id: "B2", title: "An announcer's ident, then the host's short greeting “Marcus, thanks for making time for us.” (a presence phrase not on the list) to the guest the feed lists", L: { show: "Night Desk", showAuthor: "Ironvale Media", episodeTitle: "The mill, ten years on", episodePersons: [{ name: GUEST, role: "guest" }] }, lines: [
  "SPEAKER 3: From the Ironvale studios in Gary, this is Night Desk.",
  "SPEAKER 1: Marcus, thanks for making time for us.",
  "SPEAKER 2: Happy to do it." + pad(1),
  "SPEAKER 1: Ten years since the mill closed. What do you see when you drive past it now?",
  "SPEAKER 2: A parking lot and a lot of ghosts." + pad(2),
  "SPEAKER 1: Do you still know people who worked there?",
  "SPEAKER 2: Half my church." + pad(2)],
  expect: { "SPEAKER 2": GUEST, "SPEAKER 3": { not: GUEST } } });
add({ id: "B3", title: "Two hosts the feed lists: the co-host compliments the guest, the host chimes in about her (“She means it, too.”), and the guest's whole turn “Thanks, Pat.” is credited to the host", L: { show: "Kitchen Table", showAuthor: "Ironvale Media", episodeTitle: "Rents", showPersons: [{ name: "Dana Reyes", role: "host" }, { name: "Pat Quinn", role: "host" }] }, lines: [
  "SPEAKER 1: Welcome to Kitchen Table." + pad(1) + " Our guest tonight runs the tenants' union in Gary. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 3: I read your report twice this week. It's the best thing anyone has written about rents in this town.",
  "SPEAKER 1: She means it, too. She made me read it on the train.",
  "SPEAKER 2: Thanks, Pat.",
  "SPEAKER 1: So what is driving rents?",
  "SPEAKER 2: Nobody is building." + pad(2),
  "SPEAKER 3: Nobody at all?",
  "SPEAKER 2: Almost nobody." + pad(2)],
  expect: { "SPEAKER 1": { not: "Pat Quinn" }, "SPEAKER 2": { not: "Pat Quinn" } } });
add({ id: "B4", title: "The guest cues two clips of the billed man, and the host thanks the clip each time (“Thanks, Marcus.”): the clips are passed over and the thanks land on the guest", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix and the promise he broke" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest covered city hall for the Post-Tribune for twenty years. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me. I brought tape. Here's what he told the council in March.",
  "CLIP 1: We will not close the mill. Not this year, not next year.",
  "SPEAKER 1: Thanks, Marcus.",
  "SPEAKER 2: And here's the same man, eleven weeks later.",
  "CLIP 2: The mill closes on Friday.",
  "SPEAKER 1: Thanks, Marcus.",
  "SPEAKER 2: Eleven weeks." + pad(2),
  "SPEAKER 1: Did anyone call him on it?",
  "SPEAKER 2: Nobody." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "B5", title: "Two guests: the second is brought in by a whole short turn “Dana, thanks for making time for us.” after the first guest's answer (Dana billed by the notes)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Water", description: "Dale talks with a retired pipefitter, and with Dana Reyes, who runs the water department." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My first guest spent forty years fixing the pipes under this city. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: How old are the mains?",
  "SPEAKER 2: Older than my grandfather, some of them." + pad(2),
  "SPEAKER 1: Dana, thanks for making time for us.",
  "SPEAKER 3: Of course. And he's right about the mains." + pad(2),
  "SPEAKER 1: Who pays to replace them?",
  "SPEAKER 3: The ratepayers, eventually." + pad(2),
  "SPEAKER 2: Always the ratepayers." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: "Dana Reyes" }, "SPEAKER 3": { oneOf: ["Dana Reyes", null] } } });

/* ======== C. thanks for being here said at the end, read as looking forward ======== */
add({ id: "C1", title: "The host's closing “Marcus, thanks for coming in.” (looking back), then the announcer's outro: the thanks go to the announcer", L: { show: "Night Desk", showAuthor: "Ironvale Media", episodeTitle: "The mill, ten years on", episodePersons: [{ name: GUEST, role: "guest" }] }, lines: [
  "SPEAKER 1: Welcome to Night Desk." + pad(1) + " My guest tonight ran the Gary Works mill for thirty years. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: Ten years since it closed. What do you see when you drive past it now?",
  "SPEAKER 2: A parking lot and a lot of ghosts." + pad(2),
  "SPEAKER 1: That's a sad note to end on. Marcus, thanks for coming in.",
  "SPEAKER 3: Night Desk is produced by Ironvale Media in Gary, Indiana."],
  expect: { "SPEAKER 2": { oneOf: [GUEST, null] }, "SPEAKER 3": { not: GUEST } } });
add({ id: "C2", title: "Three voices: the host's closing “Marcus, thanks for being here.”, then the co-host signs off, then the guest says goodbye", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The mill, ten years on", episodePersons: [{ name: GUEST, role: "guest" }] }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight ran the Gary Works mill for thirty years, and my co-host grew up across the street from it. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 3: What do you see when you drive past it now?",
  "SPEAKER 2: A parking lot and a lot of ghosts." + pad(2),
  "SPEAKER 1: We have to leave it there. Marcus, thanks for being here.",
  "SPEAKER 3: That's our show for tonight. Good night, Gary.",
  "SPEAKER 2: Good night, everybody."],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [GUEST, null] }, "SPEAKER 3": { not: GUEST } } });

/* ======== D. the host-by-shape decision ======== */
add({ id: "D1", title: "Cold open: a shelter director says “our guests” (her word for the people she shelters) and asks one rhetorical question; the host never opens the show", L: { show: SHOW, showAuthor: PUB, episodeTitle: "A winter night at the shelter" }, lines: [
  "SPEAKER 1: So how many people come through the shelter on a winter night?",
  "SPEAKER 2: On a bad night, ninety. Our guests are mostly veterans now, and most of them work full time. Can you imagine working forty hours a week and sleeping on a cot?" + pad(1),
  "SPEAKER 1: I can't. How long do they stay?",
  "SPEAKER 2: Three weeks, on average." + pad(2),
  "SPEAKER 1: And then where do they go?",
  "SPEAKER 2: Wherever there's a bed." + pad(2)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: HOST } } });
add({ id: "D2", title: "A stand-in opens the show and says so without the host's name (“The boss is off this week, so you get me instead.”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns — Marcus Delacroix" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show. The boss is off this week, so you get me instead." + pad(1) + " Joining me now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 1: What about the mills?" + pad(1),
  "SPEAKER 2: They are hiring." + pad(2)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": GUEST } });
add({ id: "D3", title: "HOST/GUEST labels: the stand-in labelled HOST says “Our fearless leader is fishing in Canada this week, so I'm driving the bus.”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns" }, lines: [
  "HOST: Welcome to the Dale Whitcomb Show. Our fearless leader is fishing in Canada this week, so I'm driving the bus." + pad(1) + " My guest tonight runs the union hall in Gary. Thanks for coming in.",
  "GUEST: Thanks for having me." + pad(2),
  "HOST: What about the mills?" + pad(1),
  "GUEST: They are hiring." + pad(2)],
  expect: { "HOST": { not: HOST } } });
add({ id: "D4", title: "Cold open: the guest brings in a colleague by name and asks him a question; the host never opens, welcomes or says “my guest”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The strike of 1979" }, lines: [
  "SPEAKER 1: Where were you the morning the strike started?",
  "SPEAKER 2: On the loading dock at six. Let me bring in my old shop steward, Ray Dunn, who was standing right next to me. You remember that morning, Ray?",
  "SPEAKER 3: Like it was yesterday." + pad(2),
  "SPEAKER 1: What happened next?",
  "SPEAKER 2: We walked out." + pad(2),
  "SPEAKER 1: All of you?",
  "SPEAKER 3: Every last one." + pad(2)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: HOST }, "SPEAKER 3": { oneOf: ["Ray Dunn", null] } } });

/* ======== E. the title-and-calling rule for the guest of the welcome exchange ======== */
const LPR = { show: SHOW, showAuthor: PUB, episodeTitle: "Exorcist Fr. Tomas Varga: Demons, Doubt and the Modern Church", description: "Fr. Tomas Varga is a parish priest and exorcist who trained in Rome." };
add({ id: "E1", title: "The co-host, a priest back from Rome, is welcomed back first (“Welcome back, Father.” / “Good to be back, Dale.”) and so is taken for the guest of the welcome; the host then asks him “Father, …?” and he says “As a priest, I…”", L: LPR, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " And look who's home from two weeks in Rome. Welcome back, Father.",
  "SPEAKER 3: Good to be back, Dale. Two weeks of pasta and all I wanted was a Gary pizza." + pad(1),
  "SPEAKER 1: Tonight's guest is a parish priest and exorcist, and he drove in from Chicago through the snow. Thank you for coming in.",
  "SPEAKER 2: Thank you for having me. The roads were not kind." + pad(1),
  "SPEAKER 1: Father, you've heard confessions in this town for thirty years. Have you ever seen anything like what he describes?",
  "SPEAKER 3: As a priest, I've seen frightened families, but never a rite like that." + pad(1),
  "SPEAKER 2: Few priests have, thank God." + pad(1),
  "SPEAKER 1: Let's start at the beginning." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "E2", title: "The billed priest is ill in words the absence check does not know (“Father Varga came down with the flu this morning, so an old friend of his kindly came in”); the friend, a priest, is thanked as “Father” and says “As a priest, I…”", L: LPR, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Father Varga came down with the flu this morning, so an old friend of his kindly agreed to come in. Father, thank you for coming on such short notice.",
  "SPEAKER 2: Thank you for having me. As a priest, I've known him for forty years, and he would hate missing this." + pad(1),
  "SPEAKER 1: What would he want people to know?",
  "SPEAKER 2: That most of it is listening." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });

/* ======== F. the opening address: one first name in the host's first turn, answered by that voice's first turn ======== */
add({ id: "F1", title: "The host opens straight onto the phones: “The phones are already lit up. Marcus, what's on your mind?” — a caller (“longtime listener”) shares the billed guest's first name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix on the mill sale" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " The phones are already lit up. Marcus, what's on your mind?",
  "SPEAKER 2: Hey Dale, longtime listener. I worked at the mill for twenty years, and I think the sale is a disaster." + pad(1),
  "SPEAKER 1: Why a disaster?",
  "SPEAKER 2: Because nobody is buying steel." + pad(2),
  "SPEAKER 1: Fair enough. Thanks for the call." + pad(1),
  "SPEAKER 2: Thanks, Dale." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "F2", title: "The co-host shares the billed guest's first name: the host opens “Marcus, what did you make of the news this morning?”, says the guest is stuck on the Skyway, and the guest arrives later unnamed", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix on the mill sale" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Marcus, what did you make of the news this morning?",
  "SPEAKER 3: I hated it, Dale. Forty years of steel, gone with one signature." + pad(1),
  "SPEAKER 1: Our guest tonight is stuck in traffic on the Skyway, so it's just the two of us for a few minutes." + pad(1),
  "SPEAKER 3: Fine by me." + pad(1),
  "SPEAKER 2: Sorry, sorry, the Skyway was a parking lot." + pad(1),
  "SPEAKER 1: You made it! Thanks for coming in. So, the sale.",
  "SPEAKER 2: I think it is a mistake." + pad(2),
  "SPEAKER 3: So do I." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: GUEST } } });

/* ======== G. death and absence from the listing ======== */
add({ id: "F4", title: "An introduction that says the guest is still on the way (“Our guest, Marcus Delacroix, is on his way in from the airport, so we'll start with the news.”); the co-host answers", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix on the mill sale" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Our guest, Marcus Delacroix, is on his way in from the airport, so we'll start with the news.",
  "SPEAKER 3: Traffic on the Skyway is brutal tonight, so get comfortable." + pad(1),
  "SPEAKER 1: What else is in the news?",
  "SPEAKER 3: The bridge vote." + pad(2),
  "SPEAKER 2: Sorry I'm late, everybody." + pad(1),
  "SPEAKER 1: You made it! So, the sale.",
  "SPEAKER 2: I think it is a mistake." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: GUEST } } });
add({ id: "G1", title: "Life dates spanning 48 years (“(1931–1979)”) do not mark the man dead; the host speaks to him twice in the second person and his daughter answers", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix (1931–1979): The Man Who Built Gary West" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Forty-five years ago this week, the accident at the Gary Works took a good man from this town. His daughter is in the studio with me tonight. Thank you for coming in.",
  "SPEAKER 2: Thank you for having me." + pad(1),
  "SPEAKER 1: Thirty years at that mill, and he built half the houses on our street on the weekends." + pad(1) + " You built every inch of it, Marcus.",
  "SPEAKER 2: Every brick, yes. I carried some of them." + pad(1),
  "SPEAKER 1: And your little girl turned out just fine, Marcus.",
  "SPEAKER 2: I'm not so little anymore." + pad(1),
  "SPEAKER 1: What do you remember most?",
  "SPEAKER 2: His hands." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });

/* ======== K. the notes: a description that goes on to a name ======== */
const LHIST = { show: SHOW, showAuthor: PUB, episodeTitle: "Ruth Okonkwo on the 1919 strike", description: "Dale talks with a historian about the 1919 strike and its leader, Ann Kowalski." };
add({ id: "K1", title: "HOST/GUEST labels; the notes' “talks with a historian about the 1919 strike and its leader, Ann Kowalski” bill the 1919 leader as the guest; the historian is never named in the words", L: LHIST, lines: [
  "HOST: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight teaches history at Purdue Northwest. Thanks for coming in.",
  "GUEST: Thanks for having me." + pad(1),
  "HOST: Who was Ann Kowalski?",
  "GUEST: A seamstress who organized half the mills in Gary in 1919." + pad(2),
  "HOST: What happened to her?",
  "GUEST: She was blacklisted and left for Detroit." + pad(2)],
  expect: { "HOST": HOST, "GUEST": { not: "Ann Kowalski" } } });
add({ id: "K2", title: "SPEAKER labels, same notes: the host speaks to the 1919 leader once (“You were braver than all of them, Ann.”) and the historian answers", L: LHIST, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight teaches history at Purdue Northwest. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: A seamstress, organizing steelworkers in 1919." + pad(1) + " You were braver than all of them, Ann.",
  "SPEAKER 2: Most of the men would have agreed with you." + pad(1),
  "SPEAKER 1: What happened to her?",
  "SPEAKER 2: She was blacklisted and left for Detroit." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: "Ann Kowalski" } } });

/* ======== L. two people in one introduction ======== */
add({ id: "L1", title: "“My guests tonight are Dana Reyes, who runs the water department, and Marcus Webb, who ran it before her.” — Marcus answers first; later each is asked by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Water: Dana Reyes and Marcus Webb" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guests tonight are Dana Reyes, who runs the water department, and Marcus Webb, who ran it before her.",
  "SPEAKER 2: Thanks for having us." + pad(1),
  "SPEAKER 3: Glad to be here." + pad(1),
  "SPEAKER 1: Dana, how old are the mains?",
  "SPEAKER 3: Some of them are a hundred years old." + pad(2),
  "SPEAKER 1: Marcus, why weren't they replaced on your watch?",
  "SPEAKER 2: Nobody would pay for it." + pad(2)],
  expect: { "SPEAKER 2": { oneOf: ["Marcus Webb", null] }, "SPEAKER 3": { oneOf: ["Dana Reyes", null] } } });

/* ======== M. a place taken for a person ======== */
add({ id: "M1", title: "The host names the town the show is broadcasting from (“This is Terre Haute, and tonight…”)", L: { show: "Night Desk", showAuthor: PUB, episodeTitle: "Live from the courthouse" }, lines: [
  "SPEAKER 1: Good evening, and welcome to Night Desk. This is Terre Haute, and tonight we're broadcasting from the old courthouse on Wabash Avenue." + pad(1) + " My guest tonight runs the county museum. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 1: How old is this building?",
  "SPEAKER 2: It went up in 1888." + pad(2)],
  expect: { "SPEAKER 1": { oneOf: [HOST, null] }, "SPEAKER 2": null } });

/* ======== second batch of attacks ======== */
add({ id: "A6", title: "Words to the absent subject with his name first and no thanks at all (“Marcus, you were the best of us.”, “Marcus, this town still owes you.”), twice", L: LTRIB,
  lines: trib("The union finally gave him its lifetime award on Saturday, and he wasn't well enough to go." + pad(1) + " Marcus, you were the best of us.", "A lot of people at the dinner said exactly that." + pad(1),
    "He never missed a shift in thirty years, not one." + pad(1) + " Marcus, this town still owes you.", "Every family on my street would say the same thing." + pad(1)),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "A7", title: "Reported words with verbs the list lacks, after the same turn speaks of him (“…I texted him back, thanks, Marcus.”, “…the whole crowd was screaming, we love you, Marcus!”)", L: LTRIB,
  lines: trib("When I got the job, he sent me a note the same afternoon, and I texted him back, thanks, Marcus.", "That sounds right. A note for everybody." + pad(1),
    "At his retirement party he stood up on a chair, and the whole crowd was screaming, we love you, Marcus!", "I was in that crowd. I lost my voice." + pad(1)),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "B2b", title: "B2 with a main co-host before the short greeting: the co-host sets up the segment, the host says “Marcus, thanks for making time for us.”, the phone guest answers", L: { show: "Night Desk", showAuthor: "Ironvale Media", episodeTitle: "The mill, ten years on", episodePersons: [{ name: GUEST, role: "guest" }] }, lines: [
  "SPEAKER 1: Good evening, and welcome to Night Desk." + pad(1) + " Ten years ago this week, the mill closed. My co-host covered it for the paper.",
  "SPEAKER 3: I did, and I still remember the line at the gate that last morning, two thousand people in the rain, and not one of them knew what came next." + pad(2),
  "SPEAKER 1: Marcus, thanks for making time for us.",
  "SPEAKER 2: Happy to do it." + pad(1),
  "SPEAKER 1: You were in that line. What do you see when you drive past it now?",
  "SPEAKER 2: A parking lot and a lot of ghosts." + pad(2),
  "SPEAKER 3: Same here." + pad(2)],
  expect: { "SPEAKER 2": { oneOf: [GUEST, null] }, "SPEAKER 3": { not: GUEST } } });
add({ id: "B6", title: "Captions, three voices, the guest listed by the feed: the co-host says “wow”, the host says “thank you marcus”, the guest says “my pleasure” (twice)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Thirty years at the mill", episodePersons: [{ name: GUEST, role: "guest" }] }, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight ran the Gary Works mill for thirty years, and my co-host grew up across the street from it. Thanks for coming in."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(1)),
  "SPEAKER 1: " + lc("What happened the night of the fire?"),
  "SPEAKER 2: " + lc("The whole east line went up in about four minutes." + pad(2)),
  "SPEAKER 3: " + lc("Wow."),
  "SPEAKER 1: " + lc("Thank you Marcus."),
  "SPEAKER 2: " + lc("My pleasure." + pad(1)),
  "SPEAKER 1: " + lc("And the strike?"),
  "SPEAKER 2: " + lc("Eleven weeks and nobody crossed the line." + pad(2)),
  "SPEAKER 3: " + lc("Incredible."),
  "SPEAKER 1: " + lc("Thank you Marcus."),
  "SPEAKER 2: " + lc("Any time." + pad(1)),
  "SPEAKER 3: " + lc("My dad was on that line." + pad(1))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { oneOf: [GUEST, null] }, "SPEAKER 3": { not: GUEST } } });
add({ id: "C3", title: "Captions: the host's closing turn “marcus delacroix thank you so much for coming in”, then a numbered voice reads the sponsor message", L: { show: "Night Desk", showAuthor: "Ironvale Media", episodeTitle: "The mill, ten years on", episodePersons: [{ name: GUEST, role: "guest" }] }, lines: [
  "SPEAKER 1: " + lc("Welcome to Night Desk." + pad(1) + " My guest tonight ran the Gary Works mill for thirty years. Thanks for coming in."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(1)),
  "SPEAKER 1: " + lc("Ten years since it closed. What do you see when you drive past it now?"),
  "SPEAKER 2: " + lc("A parking lot and a lot of ghosts." + pad(2)),
  "SPEAKER 1: " + lc("Marcus Delacroix thank you so much for coming in"),
  "SPEAKER 3: " + lc("Night Desk is brought to you by Calumet Hardware, on Fifth Avenue since 1952.")],
  expect: { "SPEAKER 2": { oneOf: [GUEST, null] }, "SPEAKER 3": { not: GUEST } } });
add({ id: "D5", title: "The host opens the show properly, but the hotel manager he visits says “our guests”, welcomes the old doorman (“Glad you could make it, Ray.” / “Thanks for having me.”) and asks one question: two signals beat one", L: { show: SHOW, showAuthor: PUB, episodeTitle: "A night at the Hotel Gary" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show. Tonight we're in the lobby of the Hotel Gary, with the woman who has run it for twenty years." + pad(1),
  "SPEAKER 2: Our guests have been coming through that door since 1927. Oh, and here's Ray, who stood at that door for forty years. Glad you could make it, Ray.",
  "SPEAKER 3: Thanks for having me." + pad(2),
  "SPEAKER 2: Isn't this lobby something?" + pad(1),
  "SPEAKER 1: It is. What changed when the mill closed?",
  "SPEAKER 2: The guests got fewer and the rooms got quieter." + pad(2),
  "SPEAKER 1: And for you, Ray?",
  "SPEAKER 3: Fewer tips." + pad(2)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: HOST }, "SPEAKER 3": { oneOf: [null, "Ray"] } } });
add({ id: "D6", title: "A stand-in names herself without saying she is filling in (“Welcome to the Dale Whitcomb Show. I'm Pat Quinn.”); the shelter director she talks to says “our guests” and asks one question", L: { show: SHOW, showAuthor: PUB, episodeTitle: "A winter night at the shelter" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show. I'm Pat Quinn." + pad(1) + " Tonight, the shelter on Fifth Avenue. How many people come through on a winter night?",
  "SPEAKER 2: On a bad night, ninety. Our guests are mostly veterans now, and most of them work full time. Can you imagine working forty hours a week and sleeping on a cot?" + pad(1),
  "SPEAKER 1: I can't. How long do they stay?",
  "SPEAKER 2: Three weeks, on average." + pad(2),
  "SPEAKER 1: And then where do they go?",
  "SPEAKER 2: Wherever there's a bed." + pad(2)],
  expect: { "SPEAKER 1": "Pat Quinn", "SPEAKER 2": { not: HOST } } });
add({ id: "E3", title: "Captions: the co-host priest is welcomed back first (“good to see you back father” / “good to be back dale”), then answers “father …” with “as a priest i…”", L: LPR, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " And look who's home from two weeks in Rome. Good to see you back, Father."),
  "SPEAKER 3: " + lc("Good to be back, Dale. Two weeks of pasta and all I wanted was a Gary pizza." + pad(1)),
  "SPEAKER 1: " + lc("Tonight's guest is a parish priest and exorcist, and he drove in from Chicago through the snow. Thank you for coming in."),
  "SPEAKER 2: " + lc("Thank you for having me. The roads were not kind." + pad(1)),
  "SPEAKER 1: " + lc("Father, you've heard confessions in this town for thirty years. Have you ever seen anything like what he describes?"),
  "SPEAKER 3: " + lc("As a priest, I've seen frightened families, but never a rite like that." + pad(1)),
  "SPEAKER 2: " + lc("Few priests have, thank God." + pad(1)),
  "SPEAKER 1: " + lc("Let's start at the beginning." + pad(1))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "F3", title: "Captions: the host's first words greet the co-host, who shares the first name of the guest the feed lists (“hey marcus thanks for coming in on your day off” / “happy to be here”); the guest is introduced later by description only", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The mill sale", episodePersons: [{ name: GUEST, role: "guest" }] }, lines: [
  "SPEAKER 1: " + lc("Hey Marcus thanks for coming in on your day off. Welcome to the Dale Whitcomb Show, everybody."),
  "SPEAKER 3: " + lc("Happy to be here. Somebody has to keep you honest." + pad(1)),
  "SPEAKER 1: " + lc("Our guest tonight bought the mill last month and he is already sitting across from us. Welcome."),
  "SPEAKER 2: " + lc("Thank you." + pad(2)),
  "SPEAKER 1: " + lc("Why buy a steel mill in this economy?"),
  "SPEAKER 2: " + lc("Because nobody else would." + pad(2)),
  "SPEAKER 3: " + lc("That is not a business plan." + pad(1))],
  expect: { "SPEAKER 1": H_, "SPEAKER 3": { not: GUEST } } });
add({ id: "H1", title: "Elimination: the guest the feed lists had a heart scare (words the absence check does not know); the host sends him get-well wishes by name mid-turn twice, and the co-host is the one main voice left", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The bridge vote", episodePersons: [{ name: GUEST, role: "guest" }] }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Our scheduled guest had a heart scare yesterday, so it's just my co-host and me tonight. Marcus, the whole town is pulling for you. So, Pat, where do we start?",
  "SPEAKER 3: With the bridge vote, because it was a mess." + pad(2),
  "SPEAKER 1: A mess how?",
  "SPEAKER 3: Six to three, and nobody read the bill." + pad(2),
  "SPEAKER 1: Before we go, one more thing. Marcus, we hope you're back on your feet soon. Pat, what's coming up tomorrow?",
  "SPEAKER 3: The school board, and it will be another mess." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: GUEST } } });
add({ id: "J1", title: "The host describes his first guest by her work for his second guest (“My first guest worked under Marcus Delacroix for twenty years, and Marcus is here too.”): the co-guest is made the episode's subject", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes and Marcus Delacroix on the mill" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My first guest worked under Marcus Delacroix at the mill for twenty years, and Marcus is here too. Thanks to you both for coming in.",
  "SPEAKER 2: Thanks for having us." + pad(1),
  "SPEAKER 1: Marcus, why did you hire her?",
  "SPEAKER 3: Because nobody in Gary could weld like that." + pad(2),
  "SPEAKER 1: Dana, was he a fair boss?",
  "SPEAKER 2: Mostly." + pad(2),
  "SPEAKER 1: Marcus, what changed in 1979?",
  "SPEAKER 3: The price of coal." + pad(2),
  "SPEAKER 1: Dana, do you agree?",
  "SPEAKER 2: I do." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Dana Reyes", "SPEAKER 3": GUEST } });

add({ id: "A8", title: "A self-introduction quoted with no reporting verb at all (“…walks up to me at the gate and sticks out his hand. I'm Marcus Delacroix. Welcome to the mill.”)", L: LTRIB, lines: TRIB_OPEN.slice(0, 1).concat([
  "SPEAKER 2: Thanks for having me." + pad(1) + " My first morning, this big man in a white hard hat walks up to me at the gate and sticks out his hand. I'm Marcus Delacroix. Welcome to the mill.",
  "SPEAKER 1: What did you say?",
  "SPEAKER 2: Nothing. I was terrified." + pad(2)], TRIB_TAIL),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "B7", title: "B1 where the co-host has already spoken of the guest by first name in the third person (“…everybody on our street said Marcus ran that mill like a navy ship.”)", L: LMILLG, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight ran the Gary Works mill for thirty years, and my co-host grew up across the street from it. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 3: Growing up, everybody on our street said Marcus ran that mill like a navy ship." + pad(1),
  "SPEAKER 1: What happened the night of the fire?",
  "SPEAKER 2: The whole east line went up in about four minutes." + pad(2),
  "SPEAKER 3: Wow.",
  "SPEAKER 1: Thank you, Marcus.",
  "SPEAKER 2: My pleasure." + pad(1),
  "SPEAKER 1: And the strike?",
  "SPEAKER 2: Eleven weeks, and nobody crossed the line." + pad(2),
  "SPEAKER 3: Incredible.",
  "SPEAKER 1: Thank you, Marcus.",
  "SPEAKER 2: Any time." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [GUEST, null] }, "SPEAKER 3": { not: GUEST } } });
const LFILM = { show: SHOW, showAuthor: PUB, episodeTitle: "Exorcist Fr. Tomas Varga: The Movie", description: "Fr. Tomas Varga is a parish priest and exorcist whose life is now a feature film." };
add({ id: "N1", title: "A film role read as an introduction: “Joining me now is the actor playing Tomas Varga in the new film.”", L: LFILM, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Joining me now is the actor playing Tomas Varga in the new film.",
  "SPEAKER 2: Thanks for having me. I spent a month in Rome with him getting ready." + pad(1),
  "SPEAKER 1: What surprised you most about him?",
  "SPEAKER 2: How funny he is." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "N2", title: "Captions: “my guest tonight portrays father tomas varga on the big screen”", L: LFILM, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight portrays Father Tomas Varga on the big screen."),
  "SPEAKER 2: " + lc("Thanks for having me. I spent a month in Rome with him getting ready." + pad(1)),
  "SPEAKER 1: " + lc("What surprised you most about him?"),
  "SPEAKER 2: " + lc("How funny he is." + pad(2))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: PRIEST } } });
add({ id: "N3", title: "A stage role without the film words (“For three years on Broadway, I was a priest, eight shows a week…”); the host jokes “And you still look like one, Father.”", L: LFILM, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight stars in the new film about him. Thank you for coming in.",
  "SPEAKER 2: Thanks for having me. For three years on Broadway, I was a priest, eight shows a week, so the collar fits." + pad(1),
  "SPEAKER 1: And you still look like one, Father.",
  "SPEAKER 2: Ha! Old habits." + pad(1),
  "SPEAKER 1: Did you meet him before filming?",
  "SPEAKER 2: Twice, in Rome." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "N4", title: "A future calling in the present tense (“Come May, I'm a priest, God willing.”) from a seminarian who studied under the billed priest, congratulated as “Father”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Exorcist Fr. Tomas Varga: The Teacher", description: "Fr. Tomas Varga is a parish priest and exorcist who trained in Rome." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight studied under him at the seminary for three years. Thank you for coming in.",
  "SPEAKER 2: Thank you for having me. He was the hardest teacher I ever had, and the best." + pad(1),
  "SPEAKER 1: And I hear the big day is coming. Congratulations, Father!",
  "SPEAKER 2: Not quite yet! Come May, I'm a priest, God willing." + pad(1),
  "SPEAKER 1: What did he teach you?",
  "SPEAKER 2: Patience." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "P1", title: "The notes make the subject a subject (“Dale talks with a man who worked under him.”), but another sentence (“…his own lunch with Marcus Delacroix in 1985.”) bills him by a cue word, so one toast to him names the guest", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix: The Man Who Ran the Mill", description: "Marcus Delacroix ran the Gary Works mill for thirty years. Dale talks with a man who worked under him. Dale also remembers his own lunch with Marcus Delacroix in 1985." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight I'm talking with a man who worked under Marcus for twenty years. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: The union finally gave him its lifetime award on Saturday." + pad(1) + " We're all proud of you, Marcus.",
  "SPEAKER 2: It was long overdue. I was at the dinner." + pad(1),
  "SPEAKER 1: What was a normal shift like?",
  "SPEAKER 2: Twelve hours, if you were lucky." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });

/* ======== R. realistic recall probes: ordinary openings where a careful human names the voices ======== */
const DANA = "Dana Reyes";
const LWATER = { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes: Fixing Gary's Water", description: "Dana Reyes is the director of the Gary water department. She took the job in 2021." };
add({ id: "R1", title: "Recall: “Name: Topic” title with a bio in the notes; “Dana, good to have you here.” / “Thanks for having me, Dale.”; a second question by name", L: LWATER, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight runs the water department. Dana, good to have you here.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: Dana, how bad are the pipes?",
  "SPEAKER 2: Bad. Some of the mains are a hundred years old." + pad(2),
  "SPEAKER 1: Who pays to fix them?",
  "SPEAKER 2: Everyone, eventually." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": DANA } });
add({ id: "R2", title: "Recall: R1 with the guest greeted by name once (“Dana, good to have you here.”) and no other name", L: LWATER, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight runs the water department. Dana, good to have you here.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: How bad are the pipes?",
  "SPEAKER 2: Bad. Some of the mains are a hundred years old." + pad(2),
  "SPEAKER 1: Who pays to fix them?",
  "SPEAKER 2: Everyone, eventually." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": DANA } });
add({ id: "R3", title: "Recall: R2 with “Dana, thanks for making time for us.” as the one greeting by name", L: LWATER, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight runs the water department. Dana, thanks for making time for us.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: How bad are the pipes?",
  "SPEAKER 2: Bad. Some of the mains are a hundred years old." + pad(2),
  "SPEAKER 1: Who pays to fix them?",
  "SPEAKER 2: Everyone, eventually." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": DANA } });
add({ id: "R4", title: "Recall: notes that describe the guest without her name (“This week, Dale talks with an economist about what tariffs really cost.”); title “Ruth Okonkwo: …”; called “Ruth” twice", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ruth Okonkwo: What Tariffs Cost You", description: "This week, Dale talks with an economist about what tariffs really cost." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest is an economist at Purdue Northwest. Ruth, great to have you.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: Ruth, who actually pays for a tariff?",
  "SPEAKER 2: You do, at the checkout." + pad(2),
  "SPEAKER 1: Even on steel?",
  "SPEAKER 2: Especially on steel." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ruth Okonkwo" } });
add({ id: "R5", title: "Recall: notes whose sentence opens with a description of the guest (“A former mayor of Gary talks about the water crisis…”); title “Dana Reyes: …”; called “Dana” twice", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes: Eight Years as Mayor", description: "A former mayor of Gary talks about the water crisis and the mill." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " She ran this city for eight years. Dana, it's good to see you again.",
  "SPEAKER 2: Good to see you too, Dale." + pad(1),
  "SPEAKER 1: Dana, what would you do differently?",
  "SPEAKER 2: I would have fixed the pipes first." + pad(2),
  "SPEAKER 1: Before the roads?",
  "SPEAKER 2: Before everything." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": DANA } });
add({ id: "R6", title: "Recall: notes that call the guest the host's friend (“Dale's old friend remembers the strike that shut down Gary.”); title “Ray Dunn on the strike of 1979”; called “Ray” twice", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ray Dunn on the strike of 1979", description: "Dale's old friend remembers the strike that shut down Gary." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " We've known each other since the third grade. Ray, good to see you, old friend.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: Ray, where were you the morning it started?",
  "SPEAKER 2: On the loading dock at six." + pad(2),
  "SPEAKER 1: And then?",
  "SPEAKER 2: We walked out." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ray Dunn" } });
add({ id: "R7", title: "Recall: “My guest tonight is the director of the Gary water department, Dana Reyes.” (a lower-case description with a preposition before the comma)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Fixing Gary's water" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight is the director of the Gary water department, Dana Reyes.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: How bad are the pipes?",
  "SPEAKER 2: Bad. Some of the mains are a hundred years old." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": DANA } });
add({ id: "R8", title: "Recall, captions: “i'm dale whitcomb and my guest tonight is dana reyes who runs the gary water department dana thanks for coming in” / “thanks for having me dale”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes on Gary's water" }, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show. I'm Dale Whitcomb, and my guest tonight is Dana Reyes, who runs the Gary water department. Dana, thanks for coming in."),
  "SPEAKER 2: " + lc("Thanks for having me, Dale." + pad(1)),
  "SPEAKER 1: " + lc("How bad are the pipes?"),
  "SPEAKER 2: " + lc("Bad. Some of the mains are a hundred years old." + pad(2))],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": DANA } });
add({ id: "R9", title: "Recall: a guest introduced by name, then an advertisement read by a numbered voice in the middle", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes on Gary's water" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Joining me now, Dana Reyes, who runs the Gary water department.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: We'll get to the pipes right after this.",
  "SPEAKER 3: This hour of the Dale Whitcomb Show is brought to you by Calumet Hardware. Go to calumethardware dot com.",
  "SPEAKER 1: And we're back. How bad are the pipes?",
  "SPEAKER 2: Bad. Some of the mains are a hundred years old." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": DANA, "SPEAKER 3": null } });
add({ id: "R10", title: "Recall: a clip of the mayor played between the host's question and the guest's answer", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes on Gary's water" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Joining me now, Dana Reyes, who runs the Gary water department.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: Here's what the mayor said on Monday.",
  "CLIP 1: The water is safe, and anybody who says otherwise is scaring people.",
  "SPEAKER 1: Is the water safe?",
  "SPEAKER 2: It is safe today. I can't promise next year." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": DANA } });
add({ id: "R11", title: "Recall: the host is away and the stand-in says so (“I'm Pat Quinn, sitting in for Dale Whitcomb tonight.”); the guest introduced by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes on Gary's water" }, lines: [
  "SPEAKER 1: Good evening, I'm Pat Quinn, sitting in for Dale Whitcomb tonight." + pad(1) + " Joining me now, Dana Reyes.",
  "SPEAKER 2: Thanks for having me, Pat." + pad(1),
  "SPEAKER 1: How bad are the pipes?",
  "SPEAKER 2: Bad. Some of the mains are a hundred years old." + pad(2)],
  expect: { "SPEAKER 1": "Pat Quinn", "SPEAKER 2": DANA } });
add({ id: "R12", title: "Recall: two guests introduced together (“Joining me tonight are Dana Reyes and Marcus Webb.”), then each asked once by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Water: Dana Reyes and Marcus Webb" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Joining me tonight are Dana Reyes and Marcus Webb.",
  "SPEAKER 2: Thanks for having us." + pad(1),
  "SPEAKER 3: Glad to be here." + pad(1),
  "SPEAKER 1: Dana, how old are the mains?",
  "SPEAKER 2: Some of them are a hundred years old." + pad(2),
  "SPEAKER 1: Marcus, why weren't they replaced on your watch?",
  "SPEAKER 3: Nobody would pay for it." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": DANA, "SPEAKER 3": "Marcus Webb" } });
const LBRANDT = { show: SHOW, showAuthor: PUB, episodeTitle: "Fr. Leo Brandt: Forty Years in the Steel Parishes", description: "Fr. Leo Brandt is a Catholic priest who served the steel parishes of Gary for forty years." };
const brandt = greet => [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My co-host grew up in one of his parishes. " + greet,
  "SPEAKER 2: Thank you for having me. As a priest, I've buried a lot of steelworkers in forty years." + pad(1),
  "SPEAKER 3: You buried my grandfather, in 1988." + pad(1),
  "SPEAKER 1: What did the mill do to those parishes?",
  "SPEAKER 2: It filled them, and then it emptied them." + pad(2),
  "SPEAKER 3: That's the truth." + pad(1)];
add({ id: "R13", title: "Recall, three voices: a priest greeted by title in words the welcome list lacks (“Father, it's an honor to have you here.”) who says “As a priest, I…”", L: LBRANDT, lines: brandt("Father, it's an honor to have you here."),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Leo Brandt", "SPEAKER 3": null } });
add({ id: "R14", title: "Recall control: R13 with “Father, thank you for coming in.”", L: LBRANDT, lines: brandt("Father, thank you for coming in."),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Leo Brandt", "SPEAKER 3": null } });
add({ id: "R15", title: "Recall: three voices; the guest is welcomed and later asked as “Dr. Okonkwo” (title and surname, twice)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dr. Ruth Okonkwo on long COVID" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My co-host and I have a lot of questions tonight. Dr. Okonkwo, welcome to the show.",
  "SPEAKER 2: Thank you for having me." + pad(1),
  "SPEAKER 3: Dr. Okonkwo, how many people in Indiana have it?",
  "SPEAKER 2: Tens of thousands, at least." + pad(2),
  "SPEAKER 1: That many?",
  "SPEAKER 2: At least that many." + pad(2),
  "SPEAKER 3: Frightening." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ruth Okonkwo" } });
add({ id: "R16", title: "Recall: the host reads a listener's email that speaks of him (“Linda in Hobart writes, Dale is wrong about the bridge, as usual.”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes on the bridge vote" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Joining me now, Dana Reyes.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: Before we start, the mailbag. Linda in Hobart writes, Dale is wrong about the bridge, as usual. Is she right?",
  "SPEAKER 2: Linda is half right." + pad(2),
  "SPEAKER 1: Only half?",
  "SPEAKER 2: Only half." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": DANA } });
add({ id: "R17", title: "Recall: the host speaks of his own father by full name (“This one is personal: Jim Whitcomb ran the hardware store on Fifth Avenue for forty years, and he was my father.”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Main Street, then and now" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " This one is personal: Jim Whitcomb ran the hardware store on Fifth Avenue for forty years, and he was my father. My guest tonight runs the Main Street merchants' group. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: How many stores are left?",
  "SPEAKER 2: Eleven, out of sixty." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "R18", title: "Recall: the guest teases “I know Dale is sick of hearing about the mill, but…” (an idiom read as the host being ill)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The mill, again" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight runs the union hall in Gary. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me. I know Dale is sick of hearing about the mill, but here I am again." + pad(1),
  "SPEAKER 1: Never sick of it. What's new?",
  "SPEAKER 2: They're hiring." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });
add({ id: "R19", title: "Recall: a live show; the announcer says “And now, here's your host, Dale Whitcomb!” and the host answers “Thank you, Gary, it's great to be here!”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Live from the Lake County Fair" }, lines: [
  "SPEAKER 3: From the Lake County Fairgrounds, it's the Dale Whitcomb Show! And now, here's your host, Dale Whitcomb!",
  "SPEAKER 1: Thank you, Gary, it's great to be here at the fair!" + pad(1) + " My first guest tonight grew the biggest pumpkin in Indiana. Thanks for coming up.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 1: How big?",
  "SPEAKER 2: Nine hundred pounds." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": null } });
add({ id: "R20", title: "Recall: the notes have a death word about other people (“Marcus Delacroix remembers the night three men died in the blast furnace.”); the guest introduced by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix: The Night of the Fire", description: "Marcus Delacroix remembers the night three men died in the blast furnace at the Gary Works." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Joining me now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: Where were you that night?",
  "SPEAKER 2: Forty feet from the furnace." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "R21", title: "Recall: “the late” in the notes (“Marcus Delacroix worked the late shift at the Gary Works for thirty years.”); the guest introduced by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix: Thirty Years of Nights", description: "Marcus Delacroix worked the late shift at the Gary Works for thirty years." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Joining me now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: Thirty years of nights. How did you sleep?",
  "SPEAKER 2: Badly." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "R22", title: "Recall: questions phrased “help us understand” / “help us out” read as prayers (“Dana, help us understand how bad the pipes are.”), twice", L: LWATER, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight runs the water department. Dana, help us understand how bad the pipes are.",
  "SPEAKER 2: Bad. Some of the mains are a hundred years old." + pad(2),
  "SPEAKER 1: Dana, help us out here: who pays for new mains?",
  "SPEAKER 2: Everyone, eventually." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": DANA } });
add({ id: "R23", title: "Recall: imperatives after the name (“Marcus, walk us through the night of the fire.”, “Marcus, give us the short version of the strike.”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix: Thirty Years at the Mill", description: "Marcus Delacroix ran the Gary Works mill for thirty years." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Marcus, walk us through the night of the fire.",
  "SPEAKER 2: The whole east line went up in about four minutes." + pad(2),
  "SPEAKER 1: Marcus, give us the short version of the strike.",
  "SPEAKER 2: Eleven weeks, and nobody crossed the line." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "R24", title: "Recall: the guest's restaurant bears her name, and her answers begin with it (“Rosa's Kitchen started with…”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Rosa Delgado: Forty Years on Fifth Avenue", description: "Rosa Delgado has run Rosa's Kitchen on Fifth Avenue since 1987." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Rosa, how did it all start?",
  "SPEAKER 2: Rosa's Kitchen started with my grandmother's recipes and one stove." + pad(2),
  "SPEAKER 1: Rosa, what's the secret?",
  "SPEAKER 2: Rosa's never gives away a recipe, Dale." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Rosa Delgado" } });
add({ id: "R25", title: "Recall: the host tells the audience about the present guest in the third person, then congratulates her (“The judges called her book the best history of Gary ever written. Congratulations, Ann.”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ann Kowalski: The Book on 1919", description: "Ann Kowalski has written the first full history of the 1919 steel strike." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight just won the Hoosier Book Prize. The judges called her book the best history of Gary ever written. Congratulations, Ann.",
  "SPEAKER 2: Thank you, Dale. I'm still in shock." + pad(1),
  "SPEAKER 1: Ann, how long did it take?",
  "SPEAKER 2: Eleven years." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ann Kowalski" } });
add({ id: "R26", title: "Recall: HOST/GUEST labels; “Name: Topic” title with a bio; the guest never named in the words", L: LWATER, lines: [
  "HOST: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight runs the water department. Thanks for coming in.",
  "GUEST: Thanks for having me." + pad(1),
  "HOST: How bad are the pipes?",
  "GUEST: Bad. Some of the mains are a hundred years old." + pad(2)],
  expect: { "HOST": HOST, "GUEST": DANA } });
add({ id: "R27", title: "Recall: show named “Night Desk with Dale Whitcomb”; the host opens; the guest introduced by name", L: { show: "Night Desk with Dale Whitcomb", showAuthor: "Ironvale Media", episodeTitle: "Dana Reyes on Gary's water" }, lines: [
  "SPEAKER 1: Good evening, and welcome to Night Desk." + pad(1) + " Joining me now, Dana Reyes, who runs the Gary water department.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 1: How bad are the pipes?",
  "SPEAKER 2: Bad." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": DANA } });
add({ id: "R28", title: "Recall: “I've got Dana Reyes here with me tonight, and we're going to talk about the water.” / “Thanks for having me, Dale.”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes on Gary's water" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " I've got Dana Reyes here with me tonight, and we're going to talk about the water.",
  "SPEAKER 2: Thanks for having me, Dale." + pad(1),
  "SPEAKER 1: How bad are the pipes?",
  "SPEAKER 2: Bad." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": DANA } });

module.exports = { S };
