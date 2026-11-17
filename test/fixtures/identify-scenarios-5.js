"use strict";
/* The fifth set (0.14.2): a second independent adversarial review, run against the first redesign of 0.14.2 (it found
   65 wrong names there). Absent subjects billed by the title, reported and read-out speech, prayers and scripture,
   hand-overs, replies that speak of the person, callings claimed in odd syntax, titles held by others, co-hosts, the
   model pushing a mention, introductions that are not, voices taken for the host by the conversation's shape, absence
   words, captions. None repeats a scenario of the first four sets. Invented people and shows only; no real transcripts,
   no lyrics.
   expect: { KEY: "Name" | null | { not: "Name" } | { oneOf: [...] } }: what a careful human concludes from the words
   and the listing. */
const { pad } = require("./identify-pad");
const { opens, unnamed, plus } = require("./identify-answers");

const HOST = "Dale Whitcomb", SHOW = "The Dale Whitcomb Show", PUB = "Dale Whitcomb Network", PRIEST = "Tomas Varga", GUEST = "Marcus Delacroix";
const NOTES = "Fr. Tomas Varga is a parish priest and exorcist who trained in Rome.";
const LP = { show: SHOW, showAuthor: PUB, episodeTitle: "Exorcist Fr. Tomas Varga: Demons, Doubt and the Modern Church", description: NOTES };
const LNIGHT = { show: "Night Desk", showAuthor: PUB, episodeTitle: "Mill towns" };          // publisher named after a person, show is not
const LMILL = { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns" };                    // host only
// the episode is ABOUT Marcus Delacroix (billed by a sentence of the notes); he is alive and simply not on the show
const LSUBJ = { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix: The Man Who Ran the Mill", description: "Marcus Delacroix ran the Gary Works mill for thirty years. Dale talks with a man who worked under him." };
const H_ = { oneOf: [HOST, null] };
const lc = x => x.toLowerCase().replace(/[.,?!;:“”"—]/g, "").replace(/’/g, "'");
const S = [];
const add = s => S.push(s);
const SUBJ_OPEN = [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight worked under Marcus at the mill for twenty years. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1)];
const SUBJ_TAIL = ["SPEAKER 1: What was a normal shift like?", "SPEAKER 2: Twelve hours, if you were lucky." + pad(2)];
const subj = (probe, reply) => SUBJ_OPEN.concat(["SPEAKER 1: " + probe, "SPEAKER 2: " + reply], SUBJ_TAIL);
const LP_OPEN = [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thank you for coming in tonight.",
  "SPEAKER 2: Thank you for having me. I have performed the rite of exorcism eleven times in thirty years." + pad(1)];

/* ======== BA. a person the notes bill but who is not on the show (no absence words): words to or about him read as
   speaking to the next voice ======== */
add({ id: "BA1", title: "Reported speech with “I go” (a verb the app does not know): “He handed me a hard hat, and I go, thanks, Marcus.”", L: LSUBJ,
  lines: subj("I met him exactly once, at the gate in 1994." + pad(1) + " He handed me a hard hat, and I go, thanks, Marcus.", "That sounds about right. Did you keep the hat?"),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "BA2", title: "Congratulating the absent subject on air: “The union gave him its lifetime award on Saturday. Congratulations, Marcus.”", L: LSUBJ,
  lines: subj("The union finally gave him its lifetime award on Saturday." + pad(1) + " Congratulations, Marcus.", "It was long overdue. I was at the dinner." + pad(1)),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "BA3", title: "A third-person statement with a parenthetical “you”: “Marcus, as you all know, ran that mill like a navy ship.”", L: LSUBJ,
  lines: subj("A word first for anyone who never met him." + pad(1) + " Marcus, as you all know, ran that mill like a navy ship.", "Every morning at six, on the dot." + pad(1)),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "BA4", title: "An appositive the guard misses because of “I” in a relative clause: “You remind me of a man I worked with, Marcus Delacroix.”", L: LSUBJ,
  lines: subj("You remind me of a man I worked with, Marcus Delacroix.", "I will take that as a compliment." + pad(1)),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "BA5", title: "Captions: “you know marcus actually built that hall with his own two hands” (an adverb after the name defeats the subject guard)", L: LSUBJ, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight worked under Marcus at the mill for twenty years. Thanks for coming in."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(1)),
  "SPEAKER 1: " + lc("The union hall on Fifth Avenue still has his name over the door. You know Marcus actually built that hall with his own two hands."),
  "SPEAKER 2: " + lc("I helped pour the floor in the summer of 1979." + pad(1)),
  "SPEAKER 1: " + lc("What was that like?"),
  "SPEAKER 2: " + lc("Hot." + pad(2))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: GUEST } } });
add({ id: "BA6", title: "An apology to the absent subject: “…this town turned its back on him, and so did I. Sorry, Marcus.”", L: LSUBJ,
  lines: subj("When they sold the mill, this town turned its back on him, and so did I." + pad(1) + " Sorry, Marcus.", "A lot of us feel the same way about that summer." + pad(1)),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "BA7", title: "Elimination: the host speaks to the absent subject mid-turn in two turns (“Marcus, wherever you ended up, …”, “And thank you, Marcus, …”), each followed by a long statement; the guest is the one main voice left", L: LSUBJ, lines: SUBJ_OPEN.concat([
  "SPEAKER 1: Marcus, wherever you ended up, this hour is for you. So, the early years at the mill, the strike, the layoffs, all of it, I want to hear it from somebody who was on the floor.",
  "SPEAKER 2: Loud, and hot, and the best job in Indiana." + pad(1),
  "SPEAKER 1: And thank you, Marcus, for the jobs you gave half this town. Now tell me about the pay, because everybody says it was the best in the county.",
  "SPEAKER 2: Better than anywhere else in the county." + pad(1),
  "SPEAKER 1: Good to hear." + pad(1),
  "SPEAKER 2: It was." + pad(2)]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "BA8", title: "A declaration of love to the absent subject: “He gave this town everything he had for thirty years. We love you, Marcus.”", L: LSUBJ,
  lines: subj("He gave this town everything he had for thirty years." + pad(1) + " We love you, Marcus.", "Every family on my street would say the same thing." + pad(1)),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "BA9", title: "Subject named only by the title (no notes): two such turns (“Congratulations, Marcus.”, “We love you, Marcus.”) make two calls by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix: The Man Who Ran the Mill" }, lines: SUBJ_OPEN.concat([
  "SPEAKER 1: The union finally gave him its lifetime award on Saturday." + pad(1) + " Congratulations, Marcus.",
  "SPEAKER 2: It was long overdue." + pad(1),
  "SPEAKER 1: He never once missed a shift in thirty years." + pad(1) + " We love you, Marcus.",
  "SPEAKER 2: Every family on my street would say the same thing." + pad(1),
  "SPEAKER 1: What was a normal shift like?",
  "SPEAKER 2: Twelve hours, if you were lucky." + pad(2)]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });

/* ======== RQ. reported speech the app does not recognise ======== */
add({ id: "RQ1", title: "A self-introduction quoted with the attribution after it, no quotation marks: “I'm Marcus Delacroix, he says, and you're late.”", L: LMILL, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight started at the mill in 1979. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1) + " My first morning, this big man in a white hard hat walks straight up to me at the gate. I'm Marcus Delacroix, he says, and you're late.",
  "SPEAKER 1: Were you late?",
  "SPEAKER 2: Ten minutes." + pad(2),
  "SPEAKER 1: Did he let it go?",
  "SPEAKER 2: Never." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "RQ2", title: "A self-introduction quoted with “he was all,” (not “he was like”): “…and he was all, I'm Marcus Delacroix, and this is my town now.”", L: LMILL, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight started at the mill in 1979. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1) + " The new manager walks into the union hall like he owns it, and he was all, I'm Marcus Delacroix, and this is my town now.",
  "SPEAKER 1: How did that go over?",
  "SPEAKER 2: Badly." + pad(2),
  "SPEAKER 1: I bet.",
  "SPEAKER 2: Very badly." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "RQ3", title: "An introduction reported from another night (“The emcee gets up, taps the microphone and says, joining us now, the man himself, Marcus Delacroix.”)", L: LSUBJ,
  lines: subj("I was at the union dinner the night he retired." + pad(1) + " The emcee gets up, taps the microphone and says, joining us now, the man himself, Marcus Delacroix.", "I was at that dinner too. The whole room stood up." + pad(1)),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "RQ4", title: "Reported thanks with the verb far back: “The mayor … said, in front of the whole town and every camera from Chicago to Indianapolis, thank you, Marcus.”", L: LSUBJ,
  lines: subj("I'll never forget the morning the mill reopened." + pad(1) + " The mayor climbed up on that flatbed and said, in front of the whole town and every camera from Chicago to Indianapolis, thank you, Marcus.", "I was standing right by the flatbed. Nobody could hear a thing." + pad(1)),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "RQ5", title: "Reported thanks with “I'm, like,” (a comma breaks the “I'm like” pattern): “…tossed me the keys, and I'm, like, thank you, Marcus.”", L: LSUBJ,
  lines: subj("The day I got hired, he walked me to the truck himself and tossed me the keys, and I'm, like, thank you, Marcus.", "That sounds right. Every new hire got the same walk to the truck." + pad(1)),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });

/* ======== PR. prayers and scripture vs. ordinary uses of “Father” / “Lord” ======== */
add({ id: "PR1", title: "A prayer over two sentences, no “amen” or “Lord” in the one that ends the turn: “…let's bow our heads. Father, we thank you for this night…”; the co-host priest answers “Amen. As a priest, …”", L: LP, lines: LP_OPEN.concat([
  "SPEAKER 1: Before we begin, let's bow our heads for a moment. Father, we thank you for this night, and we ask you to guide every word we say.",
  "SPEAKER 3: Amen. As a priest, I love that Dale and I always start the show this way." + pad(1),
  "SPEAKER 2: So do I." + pad(1),
  "SPEAKER 1: Good." + pad(1)]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "PR2", title: "Captions: a prayer turn “father you have given us this hour so help us use it well…”; the co-host priest answers “as a priest i love that dale and i always start the show this way”", L: LP, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " Thank you for coming in tonight."),
  "SPEAKER 2: " + lc("Thank you for having me. I have performed the rite of exorcism eleven times in thirty years." + pad(1)),
  "SPEAKER 1: " + lc("Father you have given us this hour so help us use it well and speak the truth in it"),
  "SPEAKER 3: " + lc("As a priest I love that Dale and I always start the show this way." + pad(1)),
  "SPEAKER 2: " + lc("So do I." + pad(1)),
  "SPEAKER 1: " + lc("Good." + pad(1))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "PR3", title: "Scripture quoted at the end of a turn: “…the verse from Luke. Father, into your hands I commit my spirit.”; the co-host priest answers", L: LP, lines: LP_OPEN.concat([
  "SPEAKER 1: My grandmother died with a rosary in her hands, and the last thing she whispered was the verse from Luke. Father, into your hands I commit my spirit.",
  "SPEAKER 3: As a priest, I have heard those words at a hundred bedsides, and they never get easier." + pad(1),
  "SPEAKER 2: No, they don't." + pad(1),
  "SPEAKER 1: Let's take a break." + pad(1)]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "PR4", title: "An exclamation read as a prayer (“Oh Lord, Dale, thanks for having me back on.”): the voice that answers is the publisher's namesake (miss probe)", L: LNIGHT, lines: [
  "SPEAKER 1: Welcome to Night Desk." + pad(1) + " Tonight, the strike, with a reporter who covered it for ten years.",
  "SPEAKER 2: Oh Lord, Dale, thanks for having me back on.",
  "SPEAKER 1: Good to have you back. So, the strike." + pad(1),
  "SPEAKER 2: It started in March." + pad(2),
  "SPEAKER 1: And then?",
  "SPEAKER 2: Then it ended badly." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: HOST } } });

/* ======== HO. hand-overs and deferrals in words the hand-over check does not know ======== */
add({ id: "HO1", title: "“Pat, you finish your point, and Father, I want your reaction to it.” — Pat (a priest) answers; the guest never states his calling", L: LP, lines: LP_OPEN.concat([
  "SPEAKER 3: I want to push back on one thing before we go any further." + pad(1),
  "SPEAKER 1: Pat, you finish your point, and Father, I want your reaction to it.",
  "SPEAKER 3: Sure. As a priest myself, I think the families are the whole story here." + pad(1),
  "SPEAKER 2: I agree with that." + pad(1),
  "SPEAKER 1: Good." + pad(1)]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "HO2", title: "Captions: “father what do you make of that actually hang on pat you go first” — Pat (a priest) answers", L: LP, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " Thank you for coming in tonight."),
  "SPEAKER 2: " + lc("Thank you for having me. I have performed the rite of exorcism eleven times in thirty years." + pad(1)),
  "SPEAKER 1: " + lc("Father what do you make of that actually hang on Pat you go first"),
  "SPEAKER 3: " + lc("As a priest myself I thought the bishop's letter was cowardly." + pad(1)),
  "SPEAKER 2: " + lc("I thought so too." + pad(1)),
  "SPEAKER 1: " + lc("Interesting." + pad(1))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "HO3", title: "“Father, you'll get the last word tonight, I promise, but Pat has been waiting all hour, so go ahead.” — Pat (a priest) answers", L: LP, lines: LP_OPEN.concat([
  "SPEAKER 3: I have been sitting on a question all hour." + pad(1),
  "SPEAKER 1: Father, you'll get the last word tonight, I promise, but Pat has been waiting all hour, so go ahead.",
  "SPEAKER 3: Thanks. As a priest myself, I think we keep asking the wrong question." + pad(1),
  "SPEAKER 2: Maybe so." + pad(1),
  "SPEAKER 1: Good." + pad(1)]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });

/* ======== RP. replies that speak of the person in ways the reply check misses ======== */
add({ id: "RP1", title: "Publisher's namesake: the guest thanks “Dale” for having him; the host answers “Dale's going to love hearing that.” (the contraction read as a possessive)", L: LNIGHT, lines: [
  "SPEAKER 1: Welcome to Night Desk." + pad(1) + " Tonight, the strike, with a reporter who covered it for this network for ten years.",
  "SPEAKER 2: Thanks for having me back on the network, Dale.",
  "SPEAKER 1: Dale's going to love hearing that. So, the strike." + pad(1),
  "SPEAKER 2: It started in March." + pad(2),
  "SPEAKER 1: And then?",
  "SPEAKER 2: Then it ended badly." + pad(2)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": { not: HOST } } });
add({ id: "RP2", title: "Publisher's namesake: “Thanks for having me back, Dale.”; the host answers with the surname only (“Whitcomb is in Florida until Monday, believe it or not…”)", L: LNIGHT, lines: [
  "SPEAKER 1: Welcome to Night Desk." + pad(1) + " Tonight, the strike, with a reporter who covered it for this network for ten years.",
  "SPEAKER 2: Thanks for having me back, Dale.",
  "SPEAKER 1: Whitcomb is in Florida until Monday, believe it or not, but I will pass that along. So, the strike." + pad(1),
  "SPEAKER 2: It started in March." + pad(2),
  "SPEAKER 1: And then?",
  "SPEAKER 2: Then it ended badly." + pad(2)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": { not: HOST } } });
add({ id: "RP3", title: "Publisher's namesake: the guest thanks the host by another name for having him and the owner apart (“Thanks for having me, Pat, and thank you, Dale, for keeping this network alive.”)", L: LNIGHT, lines: [
  "SPEAKER 1: Welcome to Night Desk." + pad(1) + " Tonight, the strike, with a reporter who covered it for this network for ten years.",
  "SPEAKER 2: Thanks for having me, Pat, and thank you, Dale, for keeping this network alive.",
  "SPEAKER 1: Happy to have you. So, the strike." + pad(1),
  "SPEAKER 2: It started in March." + pad(2),
  "SPEAKER 1: And then?",
  "SPEAKER 2: Then it ended badly." + pad(2)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": { not: HOST } } });
add({ id: "RP4", title: "Miss probe: the billed guest answers his name with a sentence about his son of the same name (“My son Marcus asked me the same thing last night.”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix on the mill", description: "Marcus Delacroix ran the Gary Works mill for thirty years." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Marcus, what do you make of the sale?",
  "SPEAKER 2: My son Marcus asked me the same thing last night. I think it is a mistake." + pad(2),
  "SPEAKER 1: Why?",
  "SPEAKER 2: Because nobody is buying steel." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });

/* ======== CL. callings in unusual syntax: claimed by the wrong voice, or missed for the right one ======== */
add({ id: "CL1", title: "An actor: “In the film, I'm an exorcist, and the town is Gary…”; the host jokes “…you really do look like one, Father.”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Exorcist Fr. Tomas Varga: The Movie", description: "Fr. Tomas Varga is a parish priest and exorcist whose life is now a feature film. Dale talks with the actor who plays him." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1) + " In the film, I'm an exorcist, and the town is Gary, in the winter of 1979.",
  "SPEAKER 1: With the collar and the beard, you really do look like one, Father.",
  "SPEAKER 2: Ha! The costume people earned their money." + pad(1),
  "SPEAKER 1: Did you meet him?",
  "SPEAKER 2: Twice, in Rome." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "CL2", title: "A seminarian in the future tense (“Next spring, I'll be a priest, God willing.”) teased “Congratulations, Father!”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Exorcist Fr. Tomas Varga: The Teacher", description: "Fr. Tomas Varga is a parish priest and exorcist who trained in Rome. Dale talks with one of his seminary students." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight studied under him for three years. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1) + " He was the hardest teacher I ever had.",
  "SPEAKER 1: And I hear you're being ordained in the spring. Congratulations, Father!",
  "SPEAKER 2: Not yet! Next spring, I'll be a priest, God willing." + pad(1),
  "SPEAKER 1: What did he teach you?",
  "SPEAKER 2: Patience." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "CL3", title: "A role taken from a title word in the notes (“Coach Ray Dunn led the Gary West Panthers…”): another coach, greeted “Coach”, says “As a coach, I still run his old playbook”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Coach Ray Dunn: Thirty Years of Friday Nights", description: "Coach Ray Dunn led the Gary West Panthers for thirty years. One of his former players, now a coach himself, remembers." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thanks for coming in, Coach.",
  "SPEAKER 2: Thanks for having me. As a coach, I still run his old playbook every Friday night." + pad(1),
  "SPEAKER 1: Every Friday?",
  "SPEAKER 2: Every single one." + pad(2),
  "SPEAKER 1: What would he think of that?",
  "SPEAKER 2: He would laugh." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: "Ray Dunn" } } });
add({ id: "CL4", title: "Two priests: the guest says his calling in words the app misses (“I was ordained a priest in 1985, and the bishop made me an exorcist in 1996.”); the co-host priest, asked “…Father?”, says “As a priest, I…”", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thank you for coming in tonight.",
  "SPEAKER 2: Thank you for having me." + pad(1) + " I was ordained a priest in 1985, and the bishop made me an exorcist in 1996.",
  "SPEAKER 1: Eleven years in between." + pad(1) + " Is that a normal wait, Father?",
  "SPEAKER 3: As a priest, I can tell you it is about average." + pad(1),
  "SPEAKER 2: It felt longer." + pad(1),
  "SPEAKER 1: I bet." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "CL5", title: "Two priests: the guest's “Being an exorcist, I have learned…” is missed; the co-host priest, thanked “…Father.”, says “As a priest, I…”", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thank you for coming in tonight.",
  "SPEAKER 2: Thank you for having me." + pad(1) + " Being an exorcist, I have learned to expect almost anything.",
  "SPEAKER 3: Can I add something here?",
  "SPEAKER 1: Of course. Go ahead, Father.",
  "SPEAKER 3: As a priest, I have seen families fall apart over less than this." + pad(1),
  "SPEAKER 2: So have I." + pad(1),
  "SPEAKER 1: Hard to hear." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "CL6", title: "A role from a title word (“Judge Ana Ruiz has served on the Lake County bench…”): a retired judge, greeted “Judge”, says “As a judge, I…”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Judge Ana Ruiz and the bench", description: "Judge Ana Ruiz has served on the Lake County bench since 1998. A retired colleague talks about her rulings." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Good to have you here, Judge.",
  "SPEAKER 2: Thank you for having me. As a judge, I sat two doors down from her for eleven years." + pad(1),
  "SPEAKER 1: What was she like?",
  "SPEAKER 2: Fair, and fast." + pad(2),
  "SPEAKER 1: Fast?",
  "SPEAKER 2: Very fast." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: "Ana Ruiz" } } });

/* ======== TP. titles held by people the app does not take as introduced ======== */
add({ id: "TP1", title: "A priest presented in passing (“Father Leo Brandt drove up from Muncie and is sitting in the back of the studio tonight. Father, anything to add…?”) answers “As a priest, …”", L: LP, lines: LP_OPEN.concat([
  "SPEAKER 1: Father Leo Brandt drove up from Muncie and is sitting in the back of the studio tonight. Father, anything to add before we start?",
  "SPEAKER 3: Only that I am glad to be here. As a priest, I have waited years for a night like this." + pad(1),
  "SPEAKER 2: So have I." + pad(1),
  "SPEAKER 1: Let's begin." + pad(1)]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "TP2", title: "The notes present two priests (“He is joined by his former student, Father Leo Brandt.”) but only the first is a candidate; “Father, let's start with you: when did you first meet him?”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Exorcist Fr. Tomas Varga: Demons and Doubt", description: "Fr. Tomas Varga is a parish priest and exorcist who trained in Rome. He is joined by his former student, Father Leo Brandt." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Two priests in the studio tonight, and I am outnumbered. Father, let's start with you: when did you first meet him?",
  "SPEAKER 3: In Rome, in 1998. As a priest, I was nobody then. And he was already famous." + pad(1),
  "SPEAKER 2: Not famous. Busy." + pad(1),
  "SPEAKER 1: Ha. Go on." + pad(1),
  "SPEAKER 2: We met over a bad dinner." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "TP3", title: "Miss probe: “I'm Father Leo Brandt, from Saint Anne's in Muncie.” — the title is dropped, so “Father” still points to the billed exorcist", L: LP, lines: LP_OPEN.concat([
  "SPEAKER 3: And I'm Father Leo Brandt, from Saint Anne's in Muncie. Thanks for letting me sit in." + pad(1),
  "SPEAKER 1: Glad you could. What do you make of all this, Father?",
  "SPEAKER 3: As a priest, I think we are asking the wrong question." + pad(1),
  "SPEAKER 2: Maybe." + pad(1),
  "SPEAKER 1: Good." + pad(1)]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": "Leo Brandt" } });

/* ======== MH. several hosts; co-hosts sharing a name with the guest ======== */
add({ id: "MH1", title: "The co-host shares the guest's surname (“my co-host, who is no relation to him… Your question, Ms. Reyes?”): a surname after a title goes to the listed Luis Reyes", L: { show: "Kitchen Table", showAuthor: "Ironvale Media", episodeTitle: "Luis Reyes on the housing crunch", description: "Luis Reyes runs the Gary housing authority." }, lines: [
  "SPEAKER 1: Welcome to Kitchen Table." + pad(1) + " My guest runs the housing authority, and my co-host, who is no relation to him, has the first question. Your question, Ms. Reyes?",
  "SPEAKER 3: Thanks. Why are rents going up so fast?",
  "SPEAKER 2: Because nobody is building." + pad(2),
  "SPEAKER 1: Nobody?",
  "SPEAKER 2: Almost nobody." + pad(2),
  "SPEAKER 3: That is grim." + pad(1)],
  expect: { "SPEAKER 2": { oneOf: ["Luis Reyes", null] }, "SPEAKER 3": { not: "Luis Reyes" } } });
add({ id: "MH2", title: "Two listed hosts: one names herself; the guest says “this is the show my students make me listen to” and takes the other host's name", L: { show: "Kitchen Table", showAuthor: "Ironvale Media", episodeTitle: "Rents", showPersons: [{ name: "Dana Reyes", role: "host" }, { name: "Pat Quinn", role: "host" }] }, lines: [
  "SPEAKER 1: Hi everybody, I'm Dana Reyes." + pad(1) + " Tonight my guest runs the tenants' union in Gary. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me. Honestly, this is the show my students make me listen to, so I know what I'm in for." + pad(3),
  "SPEAKER 3: They have good taste.",
  "SPEAKER 1: What is driving rents?",
  "SPEAKER 2: Nobody is building." + pad(3),
  "SPEAKER 3: Nobody at all?",
  "SPEAKER 2: Almost nobody." + pad(3)],
  expect: { "SPEAKER 1": "Dana Reyes", "SPEAKER 2": { not: "Pat Quinn" }, "SPEAKER 3": { oneOf: ["Pat Quinn", null] } } });
add({ id: "MH3", title: "The host welcomes (“Thanks so much for doing this.”); the guest says “this is the show my father had on in the truck” and talks far more: the guest takes the host's name", L: LMILL, lines: [
  "SPEAKER 1: Thanks so much for doing this.",
  "SPEAKER 2: Thanks for having me. You know, this is the show my father had on in the truck every night, so this means a lot." + pad(3),
  "SPEAKER 1: What did he think of the mill?",
  "SPEAKER 2: He loved it and he hated it." + pad(3),
  "SPEAKER 1: Both?",
  "SPEAKER 2: Both." + pad(3)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: HOST } } });
add({ id: "MH4", title: "The co-host opens: “Dale's on his way in from the airport, so it's just me for the first half.” (words the absence check does not know); Dale arrives later", L: LMILL, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show. Dale's on his way in from the airport, so it's just me for the first half." + pad(1) + " Joining me now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 1: What about the mills?" + pad(1),
  "SPEAKER 2: They are hiring." + pad(2),
  "SPEAKER 3: Sorry, sorry, the traffic was unbelievable." + pad(1),
  "SPEAKER 1: You made it. We are talking mills." + pad(1),
  "SPEAKER 3: Then carry on." + pad(1)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": GUEST, "SPEAKER 3": H_ } });
add({ id: "MH5", title: "The co-host shares the subject's first name: “Dana, where do we start?” / “Dana, why twice?”, and she speaks of “Reyes” in the third person", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes: The Senator Who Changed Her Mind", description: "Dana Reyes served two terms in the state senate before switching parties." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight, the senator who switched parties. My co-host has covered her since 2010. Dana, where do we start?",
  "SPEAKER 3: With the 2019 vote. Reyes voted against the party line twice that spring." + pad(1),
  "SPEAKER 1: Twice? Dana, why twice?",
  "SPEAKER 3: Because the first vote failed. Reyes made sure the second one failed too." + pad(1),
  "SPEAKER 1: Remarkable." + pad(1),
  "SPEAKER 3: It was." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: "Dana Reyes" } } });

/* ======== MP. the model pushing a mention, a title or a description over the line ======== */
add({ id: "MP1", title: "The model calls a description an introduction: “My guest tonight worked for Marcus Delacroix for ten years.” → the guest", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix and the mill" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight worked for Marcus Delacroix for ten years.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 1: What was the job like?",
  "SPEAKER 2: Demanding." + pad(2)],
  model: () => plus({ voices: [{ label: "SPEAKER 2", name: "Marcus Delacroix", evidence: [{ kind: "introduced", turn: 0, quote: "My guest tonight worked for Marcus Delacroix for ten years." }] }], unnamed: [] }, [opens("SPEAKER 1", HOST, "Welcome to the Dale Whitcomb Show.")]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
const MD2_L = { show: SHOW, showAuthor: PUB, episodeTitle: "Exorcist Fr. Tomas Varga: Demons and Doubt", description: "Fr. Tomas Varga is a parish priest and exorcist who trained in Rome and served the steel parishes of Gary for forty years." };
const MD2_LINES = [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Father Varga's flight out of Rome never left the ground this afternoon, so an old friend of his kindly agreed to come in. Father, thank you for coming on such short notice.",
  "SPEAKER 2: Thank you for having me. I trained in Rome alongside him, and I served in the steel parishes of Gary for a decade myself." + pad(1),
  "SPEAKER 1: What would he say about tonight's question?",
  "SPEAKER 2: Be patient." + pad(2)];
add({ id: "MP2", title: "A substitute priest called “Father”; the model offers a self-reference from shared words (“I trained in Rome alongside him, and I served in the steel parishes of Gary…”)", L: MD2_L, lines: MD2_LINES,
  model: () => plus({ voices: [{ label: "SPEAKER 2", name: "Fr. Tomas Varga", evidence: [{ kind: "self_reference", turn: 1, quote: "I trained in Rome alongside him, and I served in the steel parishes of Gary for a decade myself.", listingQuote: "Fr. Tomas Varga is a parish priest and exorcist who trained in Rome and served the steel parishes of Gary for forty years." }] }], unnamed: [] }, [opens("SPEAKER 1", HOST, "Welcome to the Dale Whitcomb Show.")]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "MP2c", title: "Control: MP2 without the model (a title alone)", L: MD2_L, lines: MD2_LINES,
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "MP3", title: "The host's own father, greeted “Father, thank you for doing this.”; the model offers “I farmed outside Gary for forty years…” as a self-reference to the notes' words", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Exorcist Fr. Tomas Varga and the Winter of 1979", description: "Fr. Tomas Varga is a parish priest and exorcist who served the farm parishes outside Gary for forty years. Dale's father remembers the winter he came to the family farm." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight is personal, because my own father came in to tell this story. Father, thank you for doing this.",
  "SPEAKER 2: Thank you for having me, son. I farmed outside Gary for forty years, and our parish was one of his." + pad(1),
  "SPEAKER 1: What happened that winter?",
  "SPEAKER 2: He came to the door in the snow." + pad(2)],
  model: () => plus({ voices: [{ label: "SPEAKER 2", name: "Fr. Tomas Varga", evidence: [{ kind: "self_reference", turn: 1, quote: "I farmed outside Gary for forty years, and our parish was one of his.", listingQuote: "Fr. Tomas Varga is a parish priest and exorcist who served the farm parishes outside Gary for forty years." }] }], unnamed: [] }, [opens("SPEAKER 1", HOST, "Welcome to the Dale Whitcomb Show.")]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });

/* ======== IN. introductions that are not ======== */
add({ id: "IN1", title: "A memorial: “Marcus is with us tonight, in spirit.” (the notes say he died) — an introduction places even the dead", L: { show: SHOW, showAuthor: PUB, episodeTitle: "A Life at the Mill: Marcus Delacroix", description: "Marcus Delacroix, who died in March, ran the Gary Works mill for thirty years. Dale talks with his oldest friend." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight we remember a friend. Marcus is with us tonight, in spirit.",
  "SPEAKER 2: Thank you for having me, Dale. It means a lot to be here." + pad(1),
  "SPEAKER 1: How did you two meet?",
  "SPEAKER 2: On the night shift in 1971." + pad(2),
  "SPEAKER 1: And the last time you saw each other?",
  "SPEAKER 2: The week before." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "IN2", title: "A farewell read as an introduction: “Say hello to Marcus for me if you see him at the union hall.”", L: LSUBJ, lines: SUBJ_OPEN.concat([
  "SPEAKER 1: What was a normal shift like?",
  "SPEAKER 2: Twelve hours, if you were lucky." + pad(2),
  "SPEAKER 1: Thanks for coming in tonight. Say hello to Marcus for me if you see him at the union hall.",
  "SPEAKER 2: I will, first thing Monday." + pad(1)]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "IN3", title: "The host presents the guest with “it's”: “And here he is. Folks, it's Marcus Delacroix!” — read as the host naming himself", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns — Marcus Delacroix" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " You know him, you've argued with him, and now you get to hear him. And here he is. Folks, it's Marcus Delacroix!",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 1: What about the mills?",
  "SPEAKER 2: They are hiring." + pad(2)],
  expect: { "SPEAKER 1": { oneOf: [HOST, null] }, "SPEAKER 2": { oneOf: [GUEST, null] } } });

/* ======== OP. voices taken for the host by the shape of the conversation ======== */
add({ id: "OP1", title: "A home visit: the guest welcomes the host into his kitchen (“Welcome, welcome. Come on in…”), and the host thanks him for having him", L: { show: SHOW, showAuthor: PUB, episodeTitle: "On the road: Gary" }, lines: [
  "SPEAKER 2: Welcome, welcome. Come on in, and mind the dog.",
  "SPEAKER 1: Thanks for having me. What a view of the mill you have from this kitchen." + pad(1),
  "SPEAKER 2: Forty years I've looked at it." + pad(2),
  "SPEAKER 1: Do you miss working there?",
  "SPEAKER 2: Every day." + pad(2),
  "SPEAKER 1: Why?",
  "SPEAKER 2: The people." + pad(2)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: HOST } } });
add({ id: "OP2", title: "A station ident longer than fifteen words by an announcer (“From the Wabash Building in downtown Chicago, this is the Dale Whitcomb Show, live every weeknight…”)", L: LMILL, lines: [
  "SPEAKER 3: From the Wabash Building in downtown Chicago, this is the Dale Whitcomb Show, live every weeknight on the Dale Whitcomb Network.",
  "SPEAKER 1: Good evening, everybody. My guest tonight runs the union hall in Gary." + pad(1),
  "SPEAKER 2: Good evening." + pad(2),
  "SPEAKER 1: What happened at the mill?",
  "SPEAKER 2: They closed it." + pad(2),
  "SPEAKER 3: The Dale Whitcomb Show will be right back after these messages from our sponsors.",
  "SPEAKER 1: Stay with us." + pad(1),
  "SPEAKER 2: Sure." + pad(1)],
  expect: { "SPEAKER 1": H_, "SPEAKER 3": { not: HOST } } });
add({ id: "OP3", title: "The host opens the show, but the co-host introduces the guest by name (“My co-host has the interview tonight… / Joining us now, Marcus Delacroix.”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns — Marcus Delacroix" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My co-host has the interview tonight, so I will mostly listen.",
  "SPEAKER 3: Thanks. Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 3: What about the mills?" + pad(1),
  "SPEAKER 2: They are hiring." + pad(2),
  "SPEAKER 1: Good to hear." + pad(1)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": GUEST, "SPEAKER 3": { not: HOST } } });
add({ id: "OP4", title: "The host opens the show; the unnamed guest brings in a colleague by name (“Let me bring in my colleague, Dana Reyes…”) and so becomes the one who introduces", L: LMILL, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight runs the union hall in Gary. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1) + " I brought some help tonight. Let me bring in my colleague, Dana Reyes, who ran the numbers for us.",
  "SPEAKER 3: Thanks for having me too." + pad(1),
  "SPEAKER 1: What do the numbers say?",
  "SPEAKER 3: That the mill is hiring again." + pad(2),
  "SPEAKER 2: Slowly." + pad(1)],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: HOST }, "SPEAKER 3": { oneOf: ["Dana Reyes", null] } } });

/* ======== LT. very short and very long turns ======== */
add({ id: "LT1", title: "A short backward-looking thanks (“Thank you, Father.”) after the guest's answer; the co-host priest speaks next", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thank you for coming in tonight. How did this work begin for you?",
  "SPEAKER 2: Thank you for having me." + pad(2) + " It began with a phone call from a frightened mother in 1996.",
  "SPEAKER 1: Thank you, Father.",
  "SPEAKER 3: As a priest myself, I have taken calls like that, and they never leave you." + pad(1),
  "SPEAKER 2: No, they don't." + pad(1),
  "SPEAKER 1: Let's take a break." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "LT2", title: "Miss probe: the co-host twice thanks the guest backward (“Thanks, Marcus.”) and the host answers each time", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns — Marcus Delacroix" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 3: Thanks, Marcus.",
  "SPEAKER 1: So, the mills. Where do we start?" + pad(1),
  "SPEAKER 2: With the strike." + pad(2),
  "SPEAKER 3: Thanks, Marcus.",
  "SPEAKER 1: And the layoffs?" + pad(1),
  "SPEAKER 2: Those came next." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST, "SPEAKER 3": { not: HOST } } });
add({ id: "LT3", title: "A very long caption turn (≈300 words) ending with a reported introduction: “…the emcee gets up and says joining us now the man himself marcus delacroix”", L: LSUBJ, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight worked under Marcus at the mill for twenty years. Thanks for coming in."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(1)),
  "SPEAKER 1: " + lc("I want to tell you about the union dinner the night he retired." + pad(14) + " The emcee gets up and says joining us now the man himself Marcus Delacroix"),
  "SPEAKER 2: " + lc("I was at that dinner too and the whole room stood up." + pad(1)),
  "SPEAKER 1: " + lc("What was a normal shift like?"),
  "SPEAKER 2: " + lc("Twelve hours if you were lucky." + pad(2))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: GUEST } } });

/* ======== AB. absence words: fooled into absence (misses), or absence not seen (wrong names) ======== */
add({ id: "AB1", title: "Miss probe: “Dale is off the charts tonight.” (enthusiasm) marks the host away", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns — Marcus Delacroix" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(1),
  "SPEAKER 3: Folks, the phones are already ringing. Dale is off the charts tonight.",
  "SPEAKER 1: Ha. What about the mills?" + pad(1),
  "SPEAKER 2: They are hiring." + pad(2),
  "SPEAKER 1: Good." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST, "SPEAKER 3": { not: HOST } } });
add({ id: "AB2", title: "Miss probe: “Dale was supposed to be the quiet one in this family.” marks the host away", L: LMILL, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My sister is in the studio tonight. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me. Dale was supposed to be the quiet one in this family, you know." + pad(1),
  "SPEAKER 1: That did not work out." + pad(1),
  "SPEAKER 2: Not at all." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: HOST } } });
add({ id: "AB3", title: "Miss probe: “I watch my mother's dog while she is away.” marks every listed person away", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns — Marcus Delacroix" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Joining us now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me. Sorry about the barking, I watch my mother's dog while she is away." + pad(1),
  "SPEAKER 1: No problem. What about the mills?" + pad(1),
  "SPEAKER 2: They are hiring." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "AB4", title: "The host is away in words the check does not know (“Dale is in Denver for the convention, so I have the chair tonight.”): the stand-in opens the show", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns — Marcus Delacroix" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show. Dale is in Denver for the convention, so I have the chair tonight." + pad(1) + " Joining me now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me. Say hi to him for me." + pad(2),
  "SPEAKER 1: I will. What about the mills?" + pad(1),
  "SPEAKER 2: They are hiring." + pad(2)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": GUEST } });
add({ id: "AB5", title: "Miss probe: “Dale died laughing when he saw it.” marks the host dead", L: LMILL, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight drew the cartoon everybody in Gary is talking about. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me. I heard Dale died laughing when he saw it." + pad(1),
  "SPEAKER 1: I did, I really did." + pad(1),
  "SPEAKER 2: Good." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: HOST } } });
add({ id: "AB6", title: "Miss probe: a career span in the title (“Ray Dunn, 1979–2009: Thirty Years at Gary West”) read as the years of his life; he is on the show and is called “Ray” twice", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Ray Dunn, 1979–2009: Thirty Years at Gary West", description: "Ray Dunn coached the Gary West Panthers for thirty years and retired in 2009." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Ray, where does the story start?",
  "SPEAKER 2: With a team that lost every game in 1979." + pad(2),
  "SPEAKER 1: Every game? Ray, how did you keep the job?",
  "SPEAKER 2: Nobody else wanted it." + pad(2),
  "SPEAKER 1: Fair enough." + pad(1),
  "SPEAKER 2: It worked out." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Ray Dunn" } });
add({ id: "AB7", title: "Miss probe: “…a whole hour in memory of Dale's mother” marks the host dead", L: LMILL, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight runs the food pantry in Gary. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me. Last year your listeners raised a whole hour in memory of Dale's mother, and we still talk about it." + pad(1),
  "SPEAKER 1: She would have loved that." + pad(1),
  "SPEAKER 2: She would." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: HOST } } });

/* ======== CA. captions (no capitals, no punctuation) for the shapes above ======== */
add({ id: "CA1", title: "Captions: “he handed me a hard hat and i go thanks marcus” at the end of the host's turn", L: LSUBJ, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight worked under Marcus at the mill for twenty years. Thanks for coming in."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(1)),
  "SPEAKER 1: " + lc("I met him exactly once at the gate. He handed me a hard hat and I go thanks Marcus"),
  "SPEAKER 2: " + lc("That sounds about right did you keep the hat"),
  "SPEAKER 1: " + lc("I still have it." + pad(1)),
  "SPEAKER 2: " + lc("Good." + pad(2))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: GUEST } } });
add({ id: "CA2", title: "Captions: “i'm marcus delacroix he says and you're late” (attribution after the quotation; the quoted man is the billed subject)", L: LSUBJ, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight started at the mill in 1979. Thanks for coming in."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(1) + " My first morning this big man in a white hard hat walks straight up to me at the gate I'm Marcus Delacroix he says and you're late"),
  "SPEAKER 1: " + lc("Were you late?"),
  "SPEAKER 2: " + lc("Ten minutes." + pad(2))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: GUEST } } });
add({ id: "CA3", title: "Captions: a turn that opens “marcus you know built that hall with his own two hands” (speaking of him, not to him)", L: LSUBJ, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight worked under Marcus at the mill for twenty years. Thanks for coming in."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(1)),
  "SPEAKER 1: " + lc("Marcus you know built that hall with his own two hands"),
  "SPEAKER 2: " + lc("I helped pour the floor in the summer of 1979." + pad(1)),
  "SPEAKER 1: " + lc("What was that like?"),
  "SPEAKER 2: " + lc("Hot." + pad(2))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: GUEST } } });
add({ id: "CA4", title: "Captions: “marcus what a man he was” opens a short host turn about the absent subject", L: LSUBJ, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight worked under Marcus at the mill for twenty years. Thanks for coming in."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(1)),
  "SPEAKER 1: " + lc("Marcus what a man that was"),
  "SPEAKER 2: " + lc("The best boss I ever had." + pad(1)),
  "SPEAKER 1: " + lc("What was a normal shift like?"),
  "SPEAKER 2: " + lc("Twelve hours if you were lucky." + pad(2))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: GUEST } } });
add({ id: "CA5", title: "Captions: the Coach shape (“welcome to the dale whitcomb show thanks coach” … “as a coach i still run his old playbook”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Coach Ray Dunn: Thirty Years of Friday Nights", description: "Coach Ray Dunn led the Gary West Panthers for thirty years. One of his former players, now a coach himself, remembers." }, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " Thanks Coach"),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(1)),
  "SPEAKER 1: " + lc("You still coach on Friday nights?"),
  "SPEAKER 2: " + lc("As a coach I still run his old playbook every Friday night." + pad(1)),
  "SPEAKER 1: " + lc("What would he think of that?"),
  "SPEAKER 2: " + lc("He would laugh." + pad(2))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: "Ray Dunn" } } });
add({ id: "CA6", title: "Captions: the co-host who shares the subject's first name (“dana where do we start” / “dana why twice”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dana Reyes: The Senator Who Changed Her Mind", description: "Dana Reyes served two terms in the state senate before switching parties." }, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight the senator who switched parties. My co-host has covered the statehouse since 2010."),
  "SPEAKER 3: " + lc("Good to be here." + pad(1)),
  "SPEAKER 1: " + lc("Dana where do we start"),
  "SPEAKER 3: " + lc("With the 2019 vote Reyes voted against the party line twice that spring." + pad(1)),
  "SPEAKER 1: " + lc("Twice Dana why twice"),
  "SPEAKER 3: " + lc("Because the first vote failed and Reyes made sure the second one failed too." + pad(1)),
  "SPEAKER 1: " + lc("Remarkable." + pad(1))],
  expect: { "SPEAKER 1": H_, "SPEAKER 3": { not: "Dana Reyes" } } });

/* ======== second batch: listing parse, the model echoing a false address, role labels, teasers, readings, absence
   fooled into a wrong name, more captions ======== */
add({ id: "LP1", title: "A title that opens with a verb (“Remembering Marcus Delacroix”) gives a candidate named “Remembering Marcus Delacroix”; his son is spoken to as “Mr. Delacroix” twice", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Remembering Marcus Delacroix", description: "Dale talks with his son about the mill." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight grew up in the shadow of the mill, and of his father. Mr. Delacroix, thank you for coming in.",
  "SPEAKER 2: Thank you for having me." + pad(1),
  "SPEAKER 1: What was your father like at home, Mr. Delacroix?",
  "SPEAKER 2: Tired, mostly." + pad(2),
  "SPEAKER 1: And at the mill?",
  "SPEAKER 2: Never tired." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [null, "Delacroix", "Mr. Delacroix"] } } });
const MD4_L = { show: SHOW, showAuthor: PUB, episodeTitle: "Marcus Delacroix: The Man Who Ran the Mill" };
const MD4_LINES = subj("The union finally gave him its lifetime award on Saturday." + pad(1) + " Congratulations, Marcus.", "It was long overdue. I was at the dinner." + pad(1));
add({ id: "MP4", title: "Subject named only by the title: one false call by name (“Congratulations, Marcus.”) that the model echoes as “addressed”", L: MD4_L, lines: MD4_LINES,
  model: () => plus({ voices: [{ label: "SPEAKER 2", name: "Marcus Delacroix", evidence: [{ kind: "addressed", turn: 2, quote: "Congratulations, Marcus." }] }], unnamed: [] }, [opens("SPEAKER 1", HOST, "Welcome to the Dale Whitcomb Show.")]),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "MP4c", title: "Control: MP4 without the model", L: MD4_L, lines: MD4_LINES,
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });
add({ id: "IN4", title: "A teaser the app takes for now (“Joining us once we're back, Marcus Delacroix.”), then a numbered voice reads an advertisement", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns — Marcus Delacroix" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Joining us once we're back, Marcus Delacroix.",
  "SPEAKER 3: This hour of the Dale Whitcomb Show is brought to you by Comfy Pillow. Go to comfypillow dot com and use the code MILL.",
  "SPEAKER 1: And we're back." + pad(1) + " Thanks for waiting.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 1: What about the mills?" + pad(1),
  "SPEAKER 2: They are hiring." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [GUEST, null] }, "SPEAKER 3": null } });
add({ id: "RQ6", title: "The host reads a novel's first line without quotation marks (“Here is how it opens. My name is Hollis Crane, and I have lied…”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The novel everyone in Gary is reading" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight wrote the novel everyone in Gary is reading. Here is how it opens. My name is Hollis Crane, and I have lied to everyone I ever loved.",
  "SPEAKER 2: Thanks for having me. That line took me three years." + pad(1),
  "SPEAKER 1: Three years for one sentence?",
  "SPEAKER 2: Three years." + pad(2)],
  expect: { "SPEAKER 1": { oneOf: [HOST, null] }, "SPEAKER 2": { not: "Hollis Crane" } } });
add({ id: "RL1", title: "HOST/GUEST labels; the billed subject is not the guest, who says “Marcus hired me in 1979”", L: LSUBJ, lines: [
  "HOST: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight worked under Marcus at the mill for twenty years. Thanks for coming in.",
  "GUEST: Thanks for having me. Marcus hired me in 1979, the week the strike ended." + pad(1),
  "HOST: What was he like as a boss?",
  "GUEST: Fair, and loud." + pad(2),
  "HOST: Loud?",
  "GUEST: Very loud." + pad(2)],
  expect: { "HOST": HOST, "GUEST": { not: GUEST } } });
const AB8_HEAD = [
  "SPEAKER 1: Thanks so much for doing this.",
  "SPEAKER 2: Thanks for having me. You know, this is the show my father had on in the truck every night, so this means a lot." + pad(3),
  "SPEAKER 1: Marcus, what did your father think of the mill?",
  "SPEAKER 2: Loved it and hated it." + pad(3)];
add({ id: "AB8", title: "Absence fooled into a wrong name: the guest (spoken to as “Marcus”) also “opens the show” by a phrase; “Marcus is stuck on the strike, I can tell.” marks him away, so the host's name is no longer contested", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns — Marcus Delacroix" }, lines: AB8_HEAD.concat([
  "SPEAKER 1: Ha. Marcus is stuck on the strike, I can tell.",
  "SPEAKER 2: Guilty." + pad(3)]),
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { oneOf: [GUEST, null] } } });
add({ id: "AB8c", title: "Control: AB8 without the line that marks him away", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns — Marcus Delacroix" }, lines: AB8_HEAD.concat([
  "SPEAKER 1: Ha. You are still angry about the strike, I can tell.",
  "SPEAKER 2: Guilty." + pad(3)]),
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { oneOf: [GUEST, null] } } });
add({ id: "CA7", title: "Captions: the host opens the show, the co-host introduces the guest (“joining us now marcus delacroix”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns — Marcus Delacroix" }, lines: [
  "SPEAKER 1: " + lc("Welcome to the Dale Whitcomb Show." + pad(1) + " My co-host has the interview tonight, so I will mostly listen."),
  "SPEAKER 3: " + lc("Thanks. Joining us now, Marcus Delacroix."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(2)),
  "SPEAKER 3: " + lc("What about the mills?" + pad(1)),
  "SPEAKER 2: " + lc("They are hiring." + pad(2)),
  "SPEAKER 1: " + lc("Good to hear." + pad(1))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { oneOf: [GUEST, null] }, "SPEAKER 3": { not: HOST } } });
add({ id: "CA8", title: "Captions: the home visit (“welcome welcome come on in and mind the dog” / “thanks for having me”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "On the road: Gary" }, lines: [
  "SPEAKER 2: " + lc("Welcome, welcome. Come on in, and mind the dog."),
  "SPEAKER 1: " + lc("Thanks for having me. What a view of the mill you have from this kitchen." + pad(1)),
  "SPEAKER 2: " + lc("Forty years I've looked at it." + pad(2)),
  "SPEAKER 1: " + lc("Do you miss working there?"),
  "SPEAKER 2: " + lc("Every day." + pad(2))],
  expect: { "SPEAKER 1": H_, "SPEAKER 2": { not: HOST } } });

/* ======== third batch ======== */
add({ id: "CAL1", title: "A caller the app does not take for one (“…we will start with your calls. Pat in Hammond, go ahead, Father.”) says “As a priest myself…”; the billed priest's train is “running behind”", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Father Varga's train from Chicago is running behind, so we will start with your calls. Pat in Hammond, go ahead, Father.",
  "SPEAKER 3: Thanks, Dale. As a priest myself, I wanted to ask about the rite." + pad(1),
  "SPEAKER 1: What about it?",
  "SPEAKER 3: Who decides it is needed?" + pad(1),
  "SPEAKER 1: The bishop, I believe." + pad(1),
  "SPEAKER 3: Thank you." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: PRIEST } } });
add({ id: "LP2", title: "A title that opens with a verb (“Meet Dana Reyes, Gary's New Mayor”): the mayor, spoken to as “Mayor Reyes” twice, is named “Meet Dana Reyes”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Meet Dana Reyes, Gary's New Mayor" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Gary has a new mayor, and she is in the studio. Mayor Reyes, thank you for coming in.",
  "SPEAKER 2: Thank you for having me." + pad(1),
  "SPEAKER 1: What comes first, Mayor Reyes?",
  "SPEAKER 2: The water mains." + pad(2),
  "SPEAKER 1: Not the mill?",
  "SPEAKER 2: The water mains." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: ["Dana Reyes", null] } } });
add({ id: "AB9", title: "Miss probe: the guest jokes “Fair warning, you're stuck with me for the whole hour.” and the host is taken to be away", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns — Marcus Delacroix" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Joining me now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me. Fair warning, you're stuck with me for the whole hour." + pad(1),
  "SPEAKER 1: I'll survive. What about the mills?" + pad(1),
  "SPEAKER 2: They are hiring." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": GUEST } });
add({ id: "RQ7", title: "The billed man died (the notes say so); his old friend quotes him with the attribution after it (“I'm Marcus Delacroix, he says, and you're late.”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "A Life at the Mill: Marcus Delacroix", description: "Marcus Delacroix, who died in March, ran the Gary Works mill for thirty years. Dale talks with his oldest friend." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight we remember a friend. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1) + " The first time we met, this big man in a white hard hat walks straight up to me at the gate. I'm Marcus Delacroix, he says, and you're late.",
  "SPEAKER 1: Were you late?",
  "SPEAKER 2: Ten minutes." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: GUEST } } });

module.exports = { S };
