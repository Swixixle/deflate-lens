"use strict";
/* Fourth set of adversarial scenarios for server/identify.js (0.14.2), written by an independent review of the first
   0.14.2 draft, which gave a wrong name in 51 of them: titles shared or misused (a host who is a priest too, "Father" said
   to a parent or to God, a sarcastic "Doctor"), callings in the third person, as suppositions or as quotations without
   their marks, people billed but dead, cancelled or late, callers, show names and publishers that look like people
   ("The Frank Talk Hour", "Austin Heights Media"), hosts away, and voices that open a conversation without hosting it.
   Invented people and shows only; no real transcripts, no lyrics. expect: { KEY: "Name" | null | { not: "Name" } |
   { oneOf: [...] } } — what a careful human concludes from the words and the listing. */
const { pad } = require("./identify-pad");

const HOST = "Dale Whitcomb", SHOW = "The Dale Whitcomb Show", PUB = "Dale Whitcomb Network", PRIEST = "Tomas Varga", GUEST = "Marcus Delacroix";
const NOTES = "Fr. Tomas Varga is a parish priest and exorcist who trained in Rome.";
const LP = { show: SHOW, showAuthor: PUB, episodeTitle: "Exorcist Fr. Tomas Varga: Demons, Doubt and the Modern Church", description: NOTES };
const LNP = { show: "Night Vigil", showAuthor: "Ironvale Media", episodeTitle: "Exorcist Fr. Tomas Varga: Demons and Doubt", description: NOTES }; // no host listed
const LNIGHT = { show: "Night Desk", showAuthor: PUB, episodeTitle: "Mill towns" }; // publisher named after a person; show name is not
const LDEAD = { show: SHOW, showAuthor: PUB, episodeTitle: "Exorcist Fr. Tomas Varga, 1931–2019: A Life", description: "Fr. Tomas Varga was a parish priest and exorcist. Dale talks with a reporter who followed his work for years." };
const lc = x => x.toLowerCase().replace(/[.,?!;:“”"—]/g, "").replace(/’/g, "'");
const S = [];
const add = s => S.push(s);

/* ======== P. titles shared or misused; callings claimed by the wrong voice ======== */
add({ id: "P1", title: "The host is himself a priest (no host listed): the guest calls him “Father”, he says “As a priest, I…”; the billed exorcist is the guest", L: LNP, lines: [
  "SPEAKER 1: Good evening, and welcome." + pad(2) + " Tonight we talk about the rite of exorcism, and what it asks of the men who perform it.",
  "SPEAKER 2: Thank you for having me. As an exorcist, I can tell you it asks everything." + pad(2) + " You have heard confessions for thirty years. Isn't that right, Father?",
  "SPEAKER 1: It is. As a priest, I have sat with frightened families too, but never at a rite like yours." + pad(1),
  "SPEAKER 2: Then you know the fear." + pad(2),
  "SPEAKER 1: What happens first?",
  "SPEAKER 2: We listen." + pad(2)],
  expect: { "SPEAKER 1": { not: PRIEST }, "SPEAKER 2": { oneOf: [PRIEST, null] } } });
add({ id: "P1b", title: "P1 with the host listed (show + publisher) and opening the show: the host keeps his own name", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(2) + " Tonight we talk about the rite of exorcism, and what it asks of the men who perform it.",
  "SPEAKER 2: Thank you for having me. As an exorcist, I can tell you it asks everything." + pad(2) + " You have heard confessions for thirty years. Isn't that right, Father?",
  "SPEAKER 1: It is. As a priest, I have sat with frightened families too, but never at a rite like yours." + pad(1),
  "SPEAKER 2: Then you know the fear." + pad(2),
  "SPEAKER 1: What happens first?",
  "SPEAKER 2: We listen." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] } } });
add({ id: "P2", title: "A former senator hosts (not listed); the billed senator calls him “Senator”; he says “When I was a senator, I…”", L: { show: "Capitol Desk", showAuthor: "Ironvale Media", episodeTitle: "Senator Mara Quill on the farm bill" }, lines: [
  "SPEAKER 1: Good evening from Capitol Desk." + pad(1) + " Good to have you here tonight.",
  "SPEAKER 2: Thank you for having me." + pad(1) + " And it is good to see you again after all these years, Senator.",
  "SPEAKER 1: When I was a senator, I voted on six of these bills myself." + pad(1) + " What is different this time?",
  "SPEAKER 2: As a senator, I have never seen the money this tight." + pad(2),
  "SPEAKER 1: Why?",
  "SPEAKER 2: The deficit." + pad(2)],
  expect: { "SPEAKER 1": { not: "Mara Quill" }, "SPEAKER 2": { oneOf: ["Mara Quill", null] } } });
add({ id: "P3", title: "A physician hosts (not listed); the billed doctor calls him “Doctor”; he says “As a physician, I…”", L: { show: "Night Clinic", showAuthor: "Ironvale Media", episodeTitle: "Dr. Ruth Okonkwo: The Sleep Crisis", description: "Dr. Ruth Okonkwo is a physician and author who studies sleep." }, lines: [
  "SPEAKER 1: Good evening." + pad(1) + " I have practiced medicine for thirty years, and I have never seen a sleep crisis like this one.",
  "SPEAKER 2: Thank you for having me." + pad(1) + " You have seen it in your own clinic, haven't you, Doctor?",
  "SPEAKER 1: I have. As a physician, I see the damage every single week." + pad(1),
  "SPEAKER 2: So do I. As an author, I hear from readers every day." + pad(2),
  "SPEAKER 1: What do they say?",
  "SPEAKER 2: They are exhausted." + pad(2)],
  expect: { "SPEAKER 1": { not: "Ruth Okonkwo" }, "SPEAKER 2": { oneOf: ["Ruth Okonkwo", null] } } });
add({ id: "P4", title: "The billed priest cancelled (the words say so); a caller who is a parish priest is told “Go ahead, Father.”", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Our guest tonight, Father Tomas Varga, had to cancel because of the storm, so we are opening the phones. Line two, you're on the air.",
  "SPEAKER 3: Hi Dale, long time listener, first time caller. I'm a parish priest in Toledo, and I have a question about the rite." + pad(1),
  "SPEAKER 1: Go ahead, Father.",
  "SPEAKER 3: When does a bishop decide it is real?" + pad(1),
  "SPEAKER 1: That is a question for another night." + pad(2),
  "SPEAKER 3: Fair enough, thank you." + pad(1),
  "SPEAKER 1: Line three, you're on the air.",
  "SPEAKER 4: Hi Dale. I just wanted to say the storm took out our power too." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: PRIEST }, "SPEAKER 4": { not: PRIEST } } });
add({ id: "P4b", title: "The billed priest is snowed in (no words the app knows for absence); a caller priest is told “Go ahead, Father.”", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Father Tomas Varga was supposed to join us tonight, but he is snowed in, so let's take a call.",
  "SPEAKER 3: Thanks, Dale. I'm a priest at Saint Anne's in Muncie, and I listen every week." + pad(1),
  "SPEAKER 1: Go ahead, Father.",
  "SPEAKER 3: How should a parish handle a family that asks for the rite?" + pad(1),
  "SPEAKER 1: Carefully, I would think." + pad(2),
  "SPEAKER 3: Thank you." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: PRIEST } } });
add({ id: "P5", title: "A substitute priest stands in for the billed one (“…was supposed to be with us… a friend of his stepped in. Father, thank you…”)", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Father Tomas Varga was supposed to be with us tonight, but he is snowed in, so a friend of his kindly stepped in at the last minute. Father, thank you for coming on such short notice.",
  "SPEAKER 2: Thank you for having me. As a priest, I have known him for twenty years, and he sends his apologies." + pad(1),
  "SPEAKER 1: What would he say about tonight's question?",
  "SPEAKER 2: Be patient." + pad(2),
  "SPEAKER 1: That sounds like him." + pad(1),
  "SPEAKER 2: It does." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "P6", title: "Co-host priest: the exorcist guest ends a turn quoting his bishop (“…and said, thank you, Father, that will be all.”), the co-host speaks next “As a priest, I…”", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thank you for coming in tonight.",
  "SPEAKER 2: Thank you for having me. As an exorcist, I have learned to expect the strange." + pad(1),
  "SPEAKER 3: Dale, tell them about the letter we got.",
  "SPEAKER 1: Later. First, the beginning. How did it start for you?",
  "SPEAKER 2: Badly." + pad(1) + " The first time I asked to perform the rite, the bishop looked at me for a long time and said, thank you, Father, that will be all.",
  "SPEAKER 3: As a priest, I have heard that exact line from a bishop more than once." + pad(1),
  "SPEAKER 1: So have a lot of people." + pad(1),
  "SPEAKER 2: It is how they say no." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
const P7_LINES = [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Father, thanks so much for coming in.",
  "SPEAKER 2: Thank you for having me." + pad(1) + " As an exorcist, I see this every week." + pad(1),
  "SPEAKER 1: Let's go to the phones. Line one, go ahead, Father.",
  "SPEAKER 3: Thanks, Dale. I'm a parish priest in Ohio, long time listener." + pad(2),
  "SPEAKER 1: What is your question?",
  "SPEAKER 3: How do you know it is real?" + pad(2),
  "SPEAKER 2: You wait." + pad(2)];
add({ id: "P7", title: "Two voices called “Father” (the exorcist guest and a caller priest); the model echoes the caller's “I'm a parish priest” as a self-reference", L: LP, lines: P7_LINES,
  model: () => ({ voices: [{ label: "SPEAKER 3", name: "Fr. Tomas Varga", evidence: [{ kind: "self_reference", turn: 3, quote: "I'm a parish priest in Ohio, long time listener.", listingQuote: "Fr. Tomas Varga is a parish priest and exorcist who trained in Rome." }] }], unnamed: [] }),
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "P7c", title: "P7 without the model (control)", L: LP, lines: P7_LINES,
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "P8", title: "“Father” said to the host's own father (a farmer), who says “I couldn't imagine being a priest”; the episode is about the exorcist", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Exorcist Fr. Tomas Varga and the Winter of 1979", description: "Fr. Tomas Varga was a parish priest and exorcist. Dale's father remembers the winter he came to the farm." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight is personal, because my own father came in to tell the story. Father, thank you for doing this.",
  "SPEAKER 2: Thank you for having me, son." + pad(1) + " I was a farmer, nothing more, and I couldn't imagine being a priest, but that winter I understood why a man would choose it." + pad(1),
  "SPEAKER 1: What happened that night?",
  "SPEAKER 2: He came to the door in the snow." + pad(2),
  "SPEAKER 1: And then?",
  "SPEAKER 2: Then he prayed." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "P9", title: "“Doctor” said jokingly to the co-host, who said “I'm no doctor, but as an author on deadline I…”; the billed doctor is the guest", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Dr. Ruth Okonkwo: The Sleep Crisis", description: "Dr. Ruth Okonkwo is a neuroscientist and author who studies sleep." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thanks for coming in tonight.",
  "SPEAKER 2: Thanks for having me. As a neuroscientist, I can tell you most of us are running on empty." + pad(1),
  "SPEAKER 3: I'm no doctor, but as an author on deadline I sleep about four hours a night." + pad(1),
  "SPEAKER 1: Well, thank you for that medical opinion, Doctor.",
  "SPEAKER 3: Any time." + pad(1),
  "SPEAKER 2: Four hours is not enough." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: ["Ruth Okonkwo", null] }, "SPEAKER 3": { not: "Ruth Okonkwo" } } });
add({ id: "P10", title: "Three voices: the host's last sentence speaks to Pat and then “and Father, I will come back to you”; Pat (a priest) answers", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thank you for coming in tonight.",
  "SPEAKER 2: Thanks for having me. As an exorcist, I have seen what fear does to a family." + pad(1),
  "SPEAKER 1: Pat, you have covered this for years, so you go first, and Father, I will come back to you.",
  "SPEAKER 3: Sure. As a priest myself, I think the families are the story here." + pad(1),
  "SPEAKER 2: I agree with that." + pad(1),
  "SPEAKER 1: Good." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "P10b", title: "Three voices: “Pat, you first, and then you, Father.”; Pat (a priest) answers", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thank you for coming in tonight.",
  "SPEAKER 2: Thanks for having me. As an exorcist, I have seen what fear does to a family." + pad(1),
  "SPEAKER 1: Pat, you first, and then you, Father.",
  "SPEAKER 3: Okay. When I was still a young priest, I thought all of this was superstition." + pad(1),
  "SPEAKER 2: Many do." + pad(1),
  "SPEAKER 1: Good." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "P11", title: "The show's author is “Pastor Rick Dawes” (a title kept in a structured name); the host greets the billed guest pastor “Pastor, …”", L: { show: "Grace Hour", showAuthor: "Pastor Rick Dawes", episodeTitle: "Pastor Ana Lowe on forgiveness" }, lines: [
  "SPEAKER 1: Pastor, it is an honor to finally sit down with you after all these years of reading your books and sermons.",
  "SPEAKER 2: Thank you for having me, it is good to be here." + pad(2),
  "SPEAKER 1: Where does forgiveness start?",
  "SPEAKER 2: With the small things." + pad(2),
  "SPEAKER 1: And the big things?",
  "SPEAKER 2: Those take years." + pad(2)],
  expect: { "SPEAKER 1": { oneOf: ["Pastor Rick Dawes", "Rick Dawes", null] }, "SPEAKER 2": { oneOf: ["Ana Lowe", null] } } });
add({ id: "P12", title: "The feed lists guest “Bishop Allen Grant”, who couldn't make it; a caller, a retired bishop, is told “Bishop, go ahead.”", L: { show: "Night Vigil", showAuthor: "Ironvale Media", episodeTitle: "Faith and doubt", episodePersons: [{ name: "Bishop Allen Grant", role: "guest" }] }, lines: [
  "SPEAKER 1: Good evening, and welcome to Night Vigil." + pad(1) + " Bishop Grant couldn't make it tonight, so we are going to the phones. Line one, you're on the air.",
  "SPEAKER 3: Hi, long time listener. I'm a retired bishop from Ohio, and I have been where your guest has been." + pad(1),
  "SPEAKER 1: Bishop, go ahead.",
  "SPEAKER 3: The hardest part is the doubt." + pad(2),
  "SPEAKER 1: Thank you for calling." + pad(1),
  "SPEAKER 3: Thank you." + pad(1)],
  expect: { "SPEAKER 3": { not: "Bishop Allen Grant" } } });
add({ id: "P12b", title: "Feed guest “Bishop Allen Grant”: the host calls the guest “Bishop” twice and nothing else (a title alone, said twice)", L: { show: "Night Vigil", showAuthor: "Ironvale Media", episodeTitle: "Faith and doubt", episodePersons: [{ name: "Bishop Allen Grant", role: "guest" }] }, lines: [
  "SPEAKER 1: Good evening." + pad(1) + " Bishop, thanks so much for coming in.",
  "SPEAKER 2: Thank you for having me." + pad(2),
  "SPEAKER 1: Where do we begin, Bishop?",
  "SPEAKER 2: At the beginning." + pad(2),
  "SPEAKER 1: Fair enough." + pad(1),
  "SPEAKER 2: Yes." + pad(2)],
  expect: { "SPEAKER 2": null } });
add({ id: "P13", title: "Two exorcists billed, only one with “Fr.”: the voice called “Father” says “as a priest” (any exorcist may be a priest)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Exorcist Fr. Tomas Varga and Exorcist Leo Brandt on the rite" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thank you both for coming in.",
  "SPEAKER 2: Thanks for having us." + pad(2),
  "SPEAKER 1: Let me start with you, Father.",
  "SPEAKER 3: As a priest, I came to this late." + pad(2),
  "SPEAKER 2: So did I." + pad(2),
  "SPEAKER 1: Interesting." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, "Leo Brandt", null] }, "SPEAKER 3": { oneOf: [PRIEST, null] } } });
add({ id: "P14", title: "The host ends a turn with a prayer to God the Father (“Thank you, Father, for this day. Amen.”); the co-host priest speaks next", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thank you for coming in tonight.",
  "SPEAKER 2: Thank you for having me. As an exorcist, I always begin with prayer." + pad(1),
  "SPEAKER 1: Then let's begin that way. Lord, we ask for wisdom tonight. Thank you, Father, for this day. Amen.",
  "SPEAKER 3: Amen. As a priest, I love that we started there." + pad(1),
  "SPEAKER 2: So do I." + pad(1),
  "SPEAKER 1: Good." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "P15", title: "Captions: the host says “amen sister” to the co-host, who says “as a teacher myself i know…”; the billed nun and teacher is the guest", L: { show: "Kitchen Table", showAuthor: "Ironvale Media", episodeTitle: "Sister Mary Okafor: Fifty Years in the Classroom", description: "Sister Mary Okafor is a nun and teacher who has taught in Gary since 1974." }, lines: [
  "SPEAKER 1: " + lc("Welcome to Kitchen Table. Tonight a woman who taught half of Gary to read. Thank you for coming." + pad(1)),
  "SPEAKER 2: " + lc("Thank you for having me. As a nun I never expected to stay fifty years." + pad(2)),
  "SPEAKER 3: " + lc("My mother had you in third grade and she still talks about it. As a teacher myself I know how rare that is." + pad(1)),
  "SPEAKER 1: " + lc("Amen, sister."),
  "SPEAKER 3: " + lc("I mean it." + pad(1)),
  "SPEAKER 2: " + lc("That is kind." + pad(2))],
  expect: { "SPEAKER 2": { oneOf: ["Mary Okafor", null] }, "SPEAKER 3": { not: "Mary Okafor" } } });

/* ======== R. callings in the third person, hypotheticals, quotations (reaching a name through elimination or a title) ======== */
add({ id: "R1", title: "Episode about a dead exorcist; the guest (a reporter) says “As an exorcist once told me, …”", L: LDEAD, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight we remember a man many of you wrote in about. Thank you for coming in.",
  "SPEAKER 2: Thank you for having me." + pad(1) + " As an exorcist once told me, the devil is patient, and so the church has to be patient too." + pad(1),
  "SPEAKER 1: Did you ever see a rite?",
  "SPEAKER 2: Once, from the back of a chapel." + pad(2),
  "SPEAKER 1: And what did you write?",
  "SPEAKER 2: Not enough." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "R2", title: "Episode about a dead exorcist; the guest (a novelist) says “I can't imagine being an exorcist.”", L: LDEAD, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight we remember a man many of you wrote in about. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1) + " I can't imagine being an exorcist. I wrote about one for six years and I still don't understand the job." + pad(1),
  "SPEAKER 1: Why did you choose him?",
  "SPEAKER 2: His letters." + pad(2),
  "SPEAKER 1: And the book?",
  "SPEAKER 2: It took too long." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "R3", title: "Role-play: the host (not listed) says “Pretend I'm a priest…”, the exorcist guest plays along “Okay, Father, I have a confession to make.”", L: LNP, lines: [
  "SPEAKER 1: Good evening, and welcome." + pad(1) + " Thank you for coming in.",
  "SPEAKER 2: Thanks for having me. As an exorcist, I get strange requests." + pad(1),
  "SPEAKER 1: Let's try one. Pretend I'm a priest, and you have come to me at three in the morning.",
  "SPEAKER 2: Okay, Father, I have a confession to make.",
  "SPEAKER 1: Go on, my son." + pad(1),
  "SPEAKER 2: I hear voices." + pad(2),
  "SPEAKER 1: Okay, stop, I'm terrible at this." + pad(1)],
  expect: { "SPEAKER 1": { not: PRIEST }, "SPEAKER 2": { oneOf: [PRIEST, null] } } });
add({ id: "R4", title: "Episode about a dead exorcist; the guest says “If I was an exorcist, I would have run.” (a hypothetical)", L: LDEAD, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight we remember a man many of you wrote in about. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1) + " Honestly, if I was an exorcist, I would have run the first night." + pad(1),
  "SPEAKER 1: He didn't.",
  "SPEAKER 2: No, never." + pad(2),
  "SPEAKER 1: Why not?",
  "SPEAKER 2: Faith, I suppose." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "R5", title: "The priest's son: “My father, as a priest, taught me to listen…” (the calling is the father's)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Exorcist Fr. Tomas Varga: A Son Remembers", description: "Fr. Tomas Varga was a Byzantine parish priest and exorcist who raised four children in Gary." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight, a family story. Thank you for coming in.",
  "SPEAKER 2: Thank you for having me." + pad(1) + " My father, as a priest, taught me to listen before I speak, and I am still learning." + pad(1),
  "SPEAKER 1: What was he like at home?",
  "SPEAKER 2: Quiet." + pad(2),
  "SPEAKER 1: And at the end?",
  "SPEAKER 2: At peace." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "R6", title: "The priest's nephew: “As a priest, my uncle heard every confession in town.” (dangling modifier about the uncle)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Fr. Tomas Varga: The Exorcist of Gary", description: "Fr. Tomas Varga was a parish priest and exorcist. His nephew talks about growing up around the rite." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1) + " As a priest, my uncle heard every confession in town, so we never had secrets at our house." + pad(1),
  "SPEAKER 1: Did that scare you?",
  "SPEAKER 2: Sometimes." + pad(2),
  "SPEAKER 1: And now?",
  "SPEAKER 2: Now I miss it." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "R7", title: "Quotation without quotation marks: “His answer was simple: as an exorcist, I go where I am sent.”", L: LDEAD, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight we remember a man many of you wrote in about. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1) + " I asked him once why he never retired. His answer was simple: as an exorcist, I go where I am sent." + pad(1),
  "SPEAKER 1: Did he ever say no?",
  "SPEAKER 2: Not that I know of." + pad(2),
  "SPEAKER 1: Remarkable.",
  "SPEAKER 2: He was." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "R8", title: "A film critic: “I'm a fan of exorcist movies, and the one about him is the best.”", L: LDEAD, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight we remember a man many of you wrote in about. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1) + " I'm a fan of exorcist movies, and the one they made about him is the best of them." + pad(1),
  "SPEAKER 1: Was it accurate?",
  "SPEAKER 2: Mostly." + pad(2),
  "SPEAKER 1: What did they miss?",
  "SPEAKER 2: His humor." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "R9", title: "Control: the calling only inside quotation marks (“As a priest, I expect…”), the voice called “Father”", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Father, thank you for coming in.",
  "SPEAKER 2: Thank you for having me." + pad(1) + " My bishop told me, “As a priest, I expect you to be ready for anything.”" + pad(1),
  "SPEAKER 1: Were you?",
  "SPEAKER 2: No." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": null } });

/* ======== E. billed people who never speak; elimination; publishers and listed people spoken of ======== */
add({ id: "E1", title: "Episode about a dead exorcist; his former student (a priest) says “When I was still a young priest, he took me under his wing”", L: LDEAD, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Tonight we remember a man many of you wrote in about. Thank you for coming in.",
  "SPEAKER 2: Thank you for having me." + pad(1) + " When I was still a young priest, he took me under his wing, and I served beside him for nine years." + pad(1),
  "SPEAKER 1: What was he like?",
  "SPEAKER 2: Stubborn, and kind." + pad(2),
  "SPEAKER 1: And at the end?",
  "SPEAKER 2: He was at peace." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST } } });
add({ id: "E2", title: "Episode about a ruined billionaire investor; a fund manager says “As an investor, I watched her collapse…”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Billionaire Investor Dana Reyes: How She Lost It All", description: "Dana Reyes was a billionaire investor who lost everything in a single year. Dale looks back with a fund manager who watched it happen." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " My guest tonight manages money in Chicago and watched the whole thing unfold. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1) + " As an investor, I watched her collapse from the other side of the trade." + pad(1),
  "SPEAKER 1: Did anyone see it coming?",
  "SPEAKER 2: A few of us did." + pad(2),
  "SPEAKER 1: And now?",
  "SPEAKER 2: Now the fund is gone." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: "Dana Reyes" } } });
add({ id: "E3", title: "Dead exorcist (notes say so); one host says “Tomas, we miss you.” and the other host answers", L: { show: "Night Vigil", showAuthor: "Ironvale Media", episodeTitle: "Fr. Tomas Varga: The Exorcist Nobody Believed", description: "Fr. Tomas Varga was a parish priest and exorcist who died in 2019. Two old friends remember him." }, lines: [
  "SPEAKER 1: Good evening." + pad(1) + " Tonight, the story of a man nobody believed until it was too late." + pad(1),
  "SPEAKER 2: And a man I still think about every day." + pad(2),
  "SPEAKER 1: We played his last sermon at the funeral." + pad(1) + " Tomas, we miss you.",
  "SPEAKER 2: We all do. It still does not feel real." + pad(1),
  "SPEAKER 1: What do you remember most?",
  "SPEAKER 2: The laugh." + pad(2)],
  expect: { "SPEAKER 1": { not: PRIEST }, "SPEAKER 2": { not: PRIEST } } });
add({ id: "E3c", title: "Control: E3 with the subject billed only by the title (no notes about him): “Tomas, we miss you.”", L: { show: "Night Vigil", showAuthor: "Ironvale Media", episodeTitle: "Fr. Tomas Varga: The Exorcist Nobody Believed" }, lines: [
  "SPEAKER 1: Good evening." + pad(1) + " Tonight, the story of a man nobody believed until it was too late." + pad(1),
  "SPEAKER 2: And a man I still think about every day." + pad(2),
  "SPEAKER 1: We played his last sermon at the funeral." + pad(1) + " Tomas, we miss you.",
  "SPEAKER 2: We all do. It still does not feel real." + pad(1),
  "SPEAKER 1: What do you remember most?",
  "SPEAKER 2: The laugh." + pad(2)],
  expect: { "SPEAKER 1": { not: PRIEST }, "SPEAKER 2": { not: PRIEST } } });
add({ id: "E4", title: "Three voices: the host speaks to the billed guest on a bad phone line mid-turn (“Tomas, can you hear us?”) twice; the co-host is left over", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Father Varga is on the line from Rome. Tomas, can you hear us? We seem to have lost him for a moment.",
  "SPEAKER 3: Hello? Hello?",
  "SPEAKER 2: Sounds like the line from Rome is not great tonight." + pad(2),
  "SPEAKER 1: Tomas, if you can hear us, call back. Meanwhile, Pat, what did you make of the bishop's letter?",
  "SPEAKER 2: It was blunt." + pad(2),
  "SPEAKER 1: Agreed." + pad(1),
  "SPEAKER 2: Very blunt, and late." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST }, "SPEAKER 3": { oneOf: [PRIEST, null] } } });
add({ id: "E5", title: "A clip of the dead exorcist plays; the host talks back to it (“Tomas, you were wrong about that…”); the co-host answers", L: LDEAD, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Here is how he sounded in 1998.",
  "CLIP 1: As an exorcist, I fear nothing, because I am not the one doing the work.",
  "SPEAKER 1: Tomas, you were wrong about that, and you knew it.",
  "SPEAKER 2: I don't know. I believed it when I heard it." + pad(1),
  "SPEAKER 1: Fair." + pad(1),
  "SPEAKER 2: I still believe it." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: PRIEST }, "CLIP 1": null } });
add({ id: "E6", title: "Publisher “Dale Whitcomb Network” for “Night Desk”: the host thanks the absent owner (“Dale, thank you for twenty years of this network.”); the guest answers", L: LNIGHT, lines: [
  "SPEAKER 1: Welcome to Night Desk." + pad(1) + " Before we start, a word for the man who signs the checks. Dale, thank you for twenty years of this network.",
  "SPEAKER 2: Thanks for having me on, it is good to be back in the studio." + pad(1),
  "SPEAKER 1: You were here when it opened." + pad(1),
  "SPEAKER 2: I was, and the mills were still running then." + pad(2),
  "SPEAKER 1: What changed?",
  "SPEAKER 2: Everything." + pad(2)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": { not: HOST } } });
add({ id: "E7", title: "Publisher “Dale Whitcomb Network”: the guest ends a turn with an appositive (“…to one man, my first boss, Dale.”)", L: LNIGHT, lines: [
  "SPEAKER 1: Welcome to Night Desk." + pad(1) + " You started in radio right here, didn't you?",
  "SPEAKER 2: I did." + pad(1) + " I owe this whole career to one man, my first boss, Dale.",
  "SPEAKER 1: A lot of us do." + pad(1),
  "SPEAKER 2: He took a chance on a kid from the mill." + pad(2),
  "SPEAKER 1: And it paid off." + pad(1),
  "SPEAKER 2: I hope so." + pad(2)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": { not: HOST } } });
add({ id: "E8", title: "Publisher “Dale Whitcomb Network”: the guest ends a turn with reported thanks (“…and I said, thank you, Dale, for nothing.”)", L: LNIGHT, lines: [
  "SPEAKER 1: Welcome to Night Desk." + pad(1) + " How did your time at the station end?",
  "SPEAKER 2: When they sold the station, the old man handed me a watch, and I said, thank you, Dale, for nothing.",
  "SPEAKER 1: That is a hard way to end ten years." + pad(1),
  "SPEAKER 2: It was." + pad(2),
  "SPEAKER 1: Do you still have the watch?",
  "SPEAKER 2: In a drawer." + pad(2)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": { not: HOST } } });
add({ id: "E9", title: "Captions: publisher named after Dale; the guest says “i mean dale i think was right to sell it when he did”", L: LNIGHT, lines: [
  "SPEAKER 1: " + lc("Welcome to Night Desk, from the Dale Whitcomb Network." + pad(1) + " Tonight we talk about the station and the people who built it."),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(1) + " I worked at the station for ten years. I mean Dale I think was right to sell it when he did."),
  "SPEAKER 1: " + lc("A lot of people disagree with that." + pad(1)),
  "SPEAKER 2: " + lc("They do." + pad(2)),
  "SPEAKER 1: " + lc("Why did he sell?"),
  "SPEAKER 2: " + lc("Money." + pad(2))],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": { not: HOST } } });
add({ id: "E10", title: "Captions: “thank you dale for nothing” reported at the end of the guest's turn", L: LNIGHT, lines: [
  "SPEAKER 1: " + lc("Welcome to Night Desk, from the Dale Whitcomb Network." + pad(1) + " How did your time at the station end?"),
  "SPEAKER 2: " + lc("When they sold the station the old man handed me a watch and I said thank you Dale for nothing."),
  "SPEAKER 1: " + lc("That is a hard way to end ten years." + pad(1)),
  "SPEAKER 2: " + lc("It was." + pad(2)),
  "SPEAKER 1: " + lc("Do you still have the watch?"),
  "SPEAKER 2: " + lc("In a drawer." + pad(2))],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": { not: HOST } } });
add({ id: "E11", title: "Captions: the guest answers “who ran the station” with “dale i think was the only honest man in that town”", L: LNIGHT, lines: [
  "SPEAKER 1: " + lc("Welcome to Night Desk, from the Dale Whitcomb Network." + pad(1) + " Who ran the station back then?"),
  "SPEAKER 2: " + lc("Dale I think was the only honest man in that town."),
  "SPEAKER 1: " + lc("A lot of people say that." + pad(1)),
  "SPEAKER 2: " + lc("They do." + pad(2)),
  "SPEAKER 1: " + lc("And the mill?"),
  "SPEAKER 2: " + lc("Closed." + pad(2))],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": { not: HOST } } });
add({ id: "E12", title: "Captions control: “you know dale whitcomb wrote a book about the mill” (the name is the subject)", L: LNIGHT, lines: [
  "SPEAKER 1: " + lc("Welcome to Night Desk." + pad(1)),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(1) + " You know Dale Whitcomb wrote a book about the mill."),
  "SPEAKER 1: " + lc("I have read it." + pad(1)),
  "SPEAKER 2: " + lc("It is good." + pad(2))],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": { not: HOST } } });
add({ id: "E13", title: "Captions control: “i mean dale said it best” (the name is the subject of “said”)", L: LNIGHT, lines: [
  "SPEAKER 1: " + lc("Welcome to Night Desk, from the Dale Whitcomb Network." + pad(1)),
  "SPEAKER 2: " + lc("Thanks for having me." + pad(1) + " I mean Dale said it best."),
  "SPEAKER 1: " + lc("He usually does." + pad(1)),
  "SPEAKER 2: " + lc("Yes." + pad(2))],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": { not: HOST } } });
add({ id: "E14", title: "A dead reporter billed by his dates and described in the notes; the host ends a turn “…we owe to one reporter, our old colleague, Marcus.”", L: { show: "Night Desk", showAuthor: "Ironvale Media", episodeTitle: "Marcus Delacroix, 1950–2024", description: "Marcus Delacroix was a reporter who covered steel for forty years. His old colleagues remember him." }, lines: [
  "SPEAKER 1: Good evening, and welcome to Night Desk." + pad(1) + " Everything we know about the mill closings, we owe to one reporter, our old colleague, Marcus.",
  "SPEAKER 2: Every word of it. I keep the clippings in my desk drawer." + pad(1),
  "SPEAKER 1: So do I." + pad(1),
  "SPEAKER 2: The last one is from March." + pad(2),
  "SPEAKER 1: Read it to us later.",
  "SPEAKER 2: I will." + pad(2)],
  expect: { "SPEAKER 1": { not: GUEST }, "SPEAKER 2": { not: GUEST } } });
add({ id: "E15", title: "Notes give the subject the rescuer's calling (“Dana Reyes was rescued by an exorcist in 1979”); the exorcist guest says “As an exorcist, I met her…”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "The Girl From Gary: Dana Reyes, 1979", description: "Dana Reyes was rescued by an exorcist in 1979, when she was nine. The priest who was there tells the story." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thank you for coming in tonight.",
  "SPEAKER 2: Thank you for having me." + pad(1) + " As an exorcist, I met her when she was nine years old, and I have never forgotten that night." + pad(1),
  "SPEAKER 1: Where is she now?",
  "SPEAKER 2: Teaching school in Ohio." + pad(2),
  "SPEAKER 1: Does she remember?",
  "SPEAKER 2: Some of it." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: "Dana Reyes" } } });

/* ======== S. show names and publishers that look like people ======== */
add({ id: "S1", title: "“The Frank Talk Hour” (an idiom, not a person): the host names himself; the co-host is spoken to as “Frank” twice", L: { show: "The Frank Talk Hour", showAuthor: "Ironvale Media", episodeTitle: "Mill towns" }, lines: [
  "SPEAKER 1: Welcome to the Frank Talk Hour. I'm Dale Whitcomb." + pad(1) + " Frank, you grew up in Gary. What did the mill mean to your family?",
  "SPEAKER 2: Everything. My father worked there for thirty years." + pad(2),
  "SPEAKER 1: And when it closed?" + pad(1) + " Frank, how did your father take it?",
  "SPEAKER 2: Badly." + pad(2),
  "SPEAKER 1: I'm sorry." + pad(1),
  "SPEAKER 2: Thanks." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: "Frank Talk" } } });
add({ id: "S2", title: "Publisher “Austin Heights Media” (named after the neighborhood the studio is in); the co-host is spoken to as “Austin”", L: { show: "Motor City Mornings", showAuthor: "Austin Heights Media", episodeTitle: "Snow day" }, lines: [
  "SPEAKER 1: Good morning, and welcome to Motor City Mornings, coming to you from our little studio in Austin Heights." + pad(1),
  "SPEAKER 2: Morning, everybody." + pad(1),
  "SPEAKER 1: Austin, how bad are the roads out there?",
  "SPEAKER 2: Terrible. I saw three cars in the ditch on the way in." + pad(2),
  "SPEAKER 1: Stay home if you can, folks." + pad(1),
  "SPEAKER 2: Seriously." + pad(2)],
  expect: { "SPEAKER 1": { not: "Austin Heights" }, "SPEAKER 2": { not: "Austin Heights" } } });
add({ id: "S3", title: "Control: “The Iron Horse Show” (a locomotive), “The Iron Horse came through Gary in 1906”", L: { show: "The Iron Horse Show", showAuthor: "Ironvale Media", episodeTitle: "Rail towns" }, lines: [
  "SPEAKER 1: Welcome to the Iron Horse Show." + pad(1) + " Tonight, the railroad. The Iron Horse came through Gary in 1906 and nothing was the same.",
  "SPEAKER 2: Thanks for having me. I'm Marcus Delacroix, and my grandfather laid that track." + pad(2),
  "SPEAKER 1: What did the railroad bring?",
  "SPEAKER 2: Jobs." + pad(2)],
  expect: { "SPEAKER 1": { not: "Iron Horse" }, "SPEAKER 2": GUEST } });
add({ id: "S4", title: "“Sister Moonlight Returns” is a film: two co-hosts; one was “a nun in the eighth grade play”, the other says “Sing it for us, Sister.”", L: { show: "Movie Night", showAuthor: "Ironvale Media", episodeTitle: "Sister Moonlight Returns: Why the Movie Still Works" }, lines: [
  "SPEAKER 1: Welcome to Movie Night." + pad(1) + " Tonight, the nun movie. You were in the school version, right?",
  "SPEAKER 2: I was. When I was a nun in the eighth grade play, I had one line and I forgot it." + pad(1),
  "SPEAKER 1: Of course you did. Sing it for us, Sister.",
  "SPEAKER 2: Absolutely not." + pad(1),
  "SPEAKER 1: Coward." + pad(1),
  "SPEAKER 2: Proudly." + pad(2)],
  expect: { "SPEAKER 1": null, "SPEAKER 2": null } });
add({ id: "S5", title: "“The Dale Whitcomb Show” with no other field agreeing; the founder died; the opener keeps his chair warm (control)", L: { show: SHOW, showAuthor: "Ironvale Media", episodeTitle: "Mill towns" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Dale Whitcomb founded this show in 1987, and since he passed I have been keeping his chair warm. Joining me now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 1: What about the mills?" + pad(1),
  "SPEAKER 2: They are hiring." + pad(2)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": GUEST } });

/* ======== H. hosts away ======== */
add({ id: "H1", title: "The listed host is “at a conference in Denver this week” (words the app does not know): the guest host opens and introduces", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show. Dale is at a conference in Denver this week, so you have me for the hour." + pad(1) + " Joining me now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 1: What about the mills?" + pad(1),
  "SPEAKER 2: They are hiring." + pad(2)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": GUEST } });
add({ id: "H2", title: "“I'm hosting in Dale's place tonight while he recovers from surgery”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show. I'm hosting in Dale's place tonight while he recovers from surgery." + pad(1) + " Joining me now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me. Tell him we are all thinking of him." + pad(2),
  "SPEAKER 1: I will. What about the mills?" + pad(1),
  "SPEAKER 2: They are hiring." + pad(2)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": GUEST } });
add({ id: "H3", title: "The host is away (the app knows: “sitting in for Dale”); the guest twice ends a turn speaking of him (“I mean Dale, I think, would have loved this.”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show. I'm sitting in for Dale tonight." + pad(1) + " Joining me now, Marcus Delacroix.",
  "SPEAKER 2: Thanks for having me." + pad(1) + " I mean Dale, I think, would have loved this story.",
  "SPEAKER 1: I think so too." + pad(1),
  "SPEAKER 2: The mills hired again." + pad(1) + " You know Dale, I think, was the first to call it.",
  "SPEAKER 1: It was a good call." + pad(1),
  "SPEAKER 2: It usually is." + pad(1)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": GUEST } });

/* ======== W. welcomed() fooled ======== */
add({ id: "W1", title: "A producer opens (“Okay, we are rolling.”) and the guest replies “Great, thanks for having me.”; the host never uses a stock opening", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns" }, lines: [
  "SPEAKER 3: Okay, we are rolling. Go whenever you are ready.",
  "SPEAKER 2: Great, thanks for having me." + pad(1),
  "SPEAKER 1: So the mills. Where do we even start?" + pad(1),
  "SPEAKER 2: With the strike." + pad(2),
  "SPEAKER 1: And then?" + pad(1),
  "SPEAKER 2: Then the layoffs." + pad(2),
  "SPEAKER 3: We have about two minutes left.",
  "SPEAKER 1: Then let's wrap it up." + pad(1)],
  expect: { "SPEAKER 3": { not: HOST }, "SPEAKER 1": { oneOf: [HOST, null] } } });
add({ id: "W2", title: "The host thanks the guest “for having me on my own show, I guess” (irony) after the guest opens", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns" }, lines: [
  "SPEAKER 1: You're late. I have been sitting in your chair for twenty minutes.",
  "SPEAKER 2: Thanks for having me on my own show, I guess." + pad(1) + " Folks, my guest tonight runs the union hall in Gary, and he is already annoyed with me.",
  "SPEAKER 1: I am." + pad(1),
  "SPEAKER 2: So tell them why." + pad(1),
  "SPEAKER 1: Because the mills lied." + pad(2),
  "SPEAKER 2: Fair enough." + pad(1)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": { oneOf: [HOST, null] } } });
add({ id: "W3", title: "An announcer opens (“From Chicago, this is the Dale Whitcomb Show.”) and closes a segment; the host never introduces by name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns" }, lines: [
  "SPEAKER 3: From Chicago, this is the Dale Whitcomb Show.",
  "SPEAKER 1: Good evening, everybody. My guest tonight runs the union hall in Gary. Thanks for coming in." + pad(1),
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 1: What happened at the mill?",
  "SPEAKER 2: They closed it." + pad(2),
  "SPEAKER 3: The Dale Whitcomb Show will be right back.",
  "SPEAKER 1: Stay with us." + pad(1),
  "SPEAKER 2: Sure." + pad(1)],
  expect: { "SPEAKER 3": { not: HOST }, "SPEAKER 1": { oneOf: [HOST, null] } } });
add({ id: "W4", title: "The late guest speaks first; the host slips (“Thanks for having me. I mean, thanks for coming in!”)", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns" }, lines: [
  "SPEAKER 1: Is this thing on? Okay. Hi, sorry I'm late, the traffic out of Gary was awful.",
  "SPEAKER 2: Thanks for having me. I mean, thanks for coming in! Sorry, it has been a long day." + pad(1),
  "SPEAKER 1: Ha, no problem." + pad(1),
  "SPEAKER 2: So, the mills. Tell me what happened." + pad(1),
  "SPEAKER 1: They closed." + pad(2),
  "SPEAKER 2: And the union?" + pad(1)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 2": { oneOf: [HOST, null] } } });
add({ id: "W5", title: "The co-host opens and talks most (“Dale is grabbing a coffee, so it's just me”); the guest thanks; Dale arrives “Sorry, sorry. Welcome to the show.”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns" }, lines: [
  "SPEAKER 1: Okay, we're live. Dale is grabbing a coffee, so it's just me for a minute." + pad(3),
  "SPEAKER 2: Thanks for having me, guys." + pad(1),
  "SPEAKER 3: Sorry, sorry. Welcome to the show.",
  "SPEAKER 1: So tell us about the strike." + pad(3),
  "SPEAKER 2: It started in March." + pad(2),
  "SPEAKER 3: Wow.",
  "SPEAKER 1: And then the layoffs came." + pad(3),
  "SPEAKER 2: Yes." + pad(2)],
  expect: { "SPEAKER 1": { not: HOST }, "SPEAKER 3": { oneOf: [HOST, null] } } });
add({ id: "W6", title: "Control: the guest's words come first (a cold open), then the host opens the show", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns" }, lines: [
  "SPEAKER 2: I knew the mill was finished the day they took the clock off the wall.",
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " You just heard my guest tonight, and we will hear a lot more from him.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 1: The clock?" + pad(1),
  "SPEAKER 2: The clock." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: HOST } } });

/* ======== X. advertisements, mid-turn addresses (controls) ======== */
add({ id: "X1", title: "Control: an advertisement says “Father, …” and “As a priest, I trust…”; the co-host priest speaks after it", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thank you for coming in.",
  "SPEAKER 2: Thank you for having me." + pad(2),
  "AD 1: Father, you deserve a better night's sleep. As a priest, I trust Example Mattress. Use code DALE.",
  "SPEAKER 3: Welcome back. As a priest myself, I want to start with the letters we got." + pad(1),
  "SPEAKER 1: Go ahead." + pad(1),
  "SPEAKER 2: Sure." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: PRIEST }, "AD 1": null } });
add({ id: "X2", title: "Control: “Father” is spoken to mid-turn, then the host turns to Pat (“Pat, you first.”); Pat, a priest, answers", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Father, what do you think? Actually, wait. Pat, you first.",
  "SPEAKER 3: As a priest myself, I think we are asking the wrong question." + pad(1),
  "SPEAKER 2: Thank you for having me, by the way. As an exorcist, I agree with Pat." + pad(1),
  "SPEAKER 1: Good." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });

/* ======== second batch: variants that settle a judgement, and the remaining paths ======== */
add({ id: "W1b", title: "W1 where the guest also thanks the real host by name at the end of a turn (“Thanks, Dale.”): the producer still takes the name", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Mill towns" }, lines: [
  "SPEAKER 3: Okay, we are rolling. Go whenever you are ready.",
  "SPEAKER 2: Great, thanks for having me." + pad(1),
  "SPEAKER 1: So the mills. Where do we even start?" + pad(1),
  "SPEAKER 2: With the strike." + pad(2) + " Thanks, Dale.",
  "SPEAKER 1: And then?" + pad(1),
  "SPEAKER 2: Then the layoffs." + pad(2),
  "SPEAKER 3: We have about two minutes left.",
  "SPEAKER 1: Then let's wrap it up." + pad(1)],
  expect: { "SPEAKER 3": { not: HOST }, "SPEAKER 1": { oneOf: [HOST, null] } } });
add({ id: "P14b", title: "P14 with the prayer's thanks in the turn's last sentence (“…thank you, Father, for this day, amen.”); the co-host priest speaks next", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thank you for coming in tonight.",
  "SPEAKER 2: Thank you for having me. As an exorcist, I always begin with prayer." + pad(1),
  "SPEAKER 1: Then let's begin that way. Lord, we ask for wisdom tonight, and thank you, Father, for this day, amen.",
  "SPEAKER 3: Amen. As a priest, I love that we started there." + pad(1),
  "SPEAKER 2: So do I." + pad(1),
  "SPEAKER 1: Good." + pad(1)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { oneOf: [PRIEST, null] }, "SPEAKER 3": { not: PRIEST } } });
add({ id: "P16", title: "A journalist host (not listed) cuts in by name (“Before Marcus answers, as a journalist I have to ask…”) after the co-host asks Marcus", L: { show: "Night Desk", showAuthor: "Ironvale Media", episodeTitle: "Journalist Marcus Webb on the mill closings" }, lines: [
  "SPEAKER 1: Good evening, and welcome to Night Desk." + pad(1) + " Thank you both for being here.",
  "SPEAKER 2: Thanks for having me." + pad(2),
  "SPEAKER 3: The mill files are a mess." + pad(1) + " What do you make of them, Marcus?",
  "SPEAKER 1: Before Marcus answers, as a journalist I have to ask where the files came from." + pad(1),
  "SPEAKER 2: From a union steward." + pad(2),
  "SPEAKER 3: Interesting." + pad(1)],
  expect: { "SPEAKER 1": { not: "Marcus Webb" }, "SPEAKER 2": { oneOf: ["Marcus Webb", null] } } });
add({ id: "P5c", title: "Control: P5 with the substitute introduced by his own name (“Joining me now, Father Leo Brandt.”)", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Father Tomas Varga is snowed in tonight. Joining me now, Father Leo Brandt.",
  "SPEAKER 2: Thank you for having me. As a priest, I have known him for twenty years, and he sends his apologies." + pad(1),
  "SPEAKER 1: Father, what would he say about tonight's question?",
  "SPEAKER 2: Be patient." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": "Leo Brandt" } });
add({ id: "E3r", title: "Control: E3 with a rhetorical address the app knows (“Tomas, if you're listening up there, we miss you.”)", L: { show: "Night Vigil", showAuthor: "Ironvale Media", episodeTitle: "Fr. Tomas Varga: The Exorcist Nobody Believed", description: "Fr. Tomas Varga was a parish priest and exorcist who died in 2019. Two old friends remember him." }, lines: [
  "SPEAKER 1: Good evening." + pad(1) + " Tonight, the story of a man nobody believed until it was too late." + pad(1),
  "SPEAKER 2: And a man I still think about every day." + pad(2),
  "SPEAKER 1: We played his last sermon at the funeral." + pad(1) + " Tomas, if you're listening up there, we miss you.",
  "SPEAKER 2: We all do. It still does not feel real." + pad(1),
  "SPEAKER 1: What do you remember most?",
  "SPEAKER 2: The laugh." + pad(2)],
  expect: { "SPEAKER 1": { not: PRIEST }, "SPEAKER 2": { not: PRIEST } } });
add({ id: "E16", title: "A caller who shares the billed guest's first name: “Let's go to Tomas in Gary. Go ahead, Tomas.” while Father Varga is running late", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Father Varga is running a little late, so let's take a call. Let's go to Tomas in Gary. Go ahead, Tomas.",
  "SPEAKER 3: Hi Dale, long time listener. I grew up two streets from the church where all of this happened, and I still remember the night the police came." + pad(3),
  "SPEAKER 1: What did you see?",
  "SPEAKER 3: Lights in every window." + pad(3),
  "SPEAKER 1: Thank you for calling." + pad(1),
  "SPEAKER 3: Thank you." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: PRIEST } } });
add({ id: "E17", title: "A caller the app does not take for a caller (“Let's hear from Muncie. Go ahead.”) thanks Dale for having him and says “As a priest myself…”; the billed priest is running late", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Father Varga is running a little late, so let's hear from Muncie. Go ahead.",
  "SPEAKER 3: Thanks for having me on, Dale. As a priest myself, I wanted to say how much this topic matters to my parish." + pad(3),
  "SPEAKER 1: Why does it matter so much?",
  "SPEAKER 3: Because people are frightened." + pad(3),
  "SPEAKER 1: Thank you for calling." + pad(1),
  "SPEAKER 3: Thank you." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 3": { not: PRIEST } } });

add({ id: "P18", title: "“Thank you so much, Father Tomas.” (title and the billed guest's first name) and “Thank you for having me.”", L: LP, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " Thank you so much for coming in, Father Tomas.",
  "SPEAKER 2: Thank you for having me." + pad(2),
  "SPEAKER 1: Where do we begin?",
  "SPEAKER 2: With Rome." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": PRIEST } });
add({ id: "R10", title: "The idiom “As a general rule, I…” read as the calling of the billed general (who was called away); the guest is a defense reporter", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Gen. Mara Quill on the drawdown", description: "Gen. Mara Quill is a retired general who led the Fifth Corps." }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show." + pad(1) + " General Quill was called away at the last minute, so a reporter who covers the Pentagon joins me instead. Thanks for coming in.",
  "SPEAKER 2: Thanks for having me." + pad(1) + " As a general rule, I don't trust drawdown numbers until I see them in writing." + pad(1),
  "SPEAKER 1: And have you seen them?",
  "SPEAKER 2: Not yet." + pad(2),
  "SPEAKER 1: When?",
  "SPEAKER 2: Maybe next week." + pad(2)],
  expect: { "SPEAKER 1": HOST, "SPEAKER 2": { not: "Mara Quill" } } });
add({ id: "H4", title: "The host is off (the app knows); two callers end their calls “…what do you think, Dale?” and the guest host answers “Well, Dale is off tonight, but…”", L: { show: SHOW, showAuthor: PUB, episodeTitle: "Open phones" }, lines: [
  "SPEAKER 1: Welcome to the Dale Whitcomb Show. Dale is off tonight, so it is just me and the phones." + pad(1) + " Line one, you're on the air.",
  "SPEAKER 2: Hi, long time listener. The mill is hiring again, and I want to know, what do you think, Dale?",
  "SPEAKER 1: Well, Dale is off tonight, but I think it is good news." + pad(2) + " Line two, you're on the air.",
  "SPEAKER 3: Yeah, hi. They cut my hours again. Is that legal, Dale?",
  "SPEAKER 1: Well, Dale is off tonight, but I would call the union hall." + pad(2),
  "SPEAKER 3: Okay, thanks." + pad(1)],
  expect: { "SPEAKER 1": { not: HOST } } });

module.exports = { S };
