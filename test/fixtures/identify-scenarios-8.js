"use strict";
/* The eighth set (0.14.2): a fifth independent review, written black-box (without reading the implementation or the earlier sets): 22 ordinary openings in wording of its own, and 22 traps (a host sitting in, the dead and the absent, a person heard only on tape, shared first names, quoted and read-aloud self-introductions, two priests, an ad naming the host, an anonymous source, a substitute guest, a caller greeting the host, a rebroadcast). Its first measurement, before any repair it led to: the app's patterns alone missed 34 names and gave 2 wrong; with the model's reading, 1 wrong (a name given in part) and 35 missed. That led to the model's reading being checked by what contradicts it rather than by the app's lists of words (checkClue's lenient mode, resolveNames' model-first step).
   identify-answers-8.json holds, for each scenario, a model's answer to the exact identification prompt, recorded once
   from a proxy (Claude Sonnet answering each prompt blind, with no view of these expectations). Invented people and shows
   only; no real transcripts, no lyrics.
   expect: { KEY: "Name" | null | { not: "Name" } | { oneOf: [...] } }: what a careful human concludes from the words
   and the listing (the reviewer's own, unchanged). */
const { pad } = require("./identify-pad");
const S = [];
const add = s => S.push(s);

add({ id: "R1", title: "host named only by the show name and a person-named network; he never says his own name", L: { show: "The Hollis Grady Show", showAuthor: "Hollis Grady Network", episodeTitle: "Why your county roads are crumbling", description: "Civil engineer Renata Szabo explains where the road money goes, and why it never seems to be enough." }, lines: [
  "SPEAKER 1: Welcome back to the show, everybody. It's a gray Monday out there and we have a lot to get through this hour." + pad(2) + " My guest is civil engineer Renata Szabo, who has inspected more bridges in this state than anybody I know. Renata, welcome.",
  "SPEAKER 2: Thanks for having me. It's nice to finally be in the studio instead of on the phone." + pad(2),
  "SPEAKER 1: So start simple for people. Why do the roads fall apart every single spring?" + pad(1),
  "SPEAKER 2: Water, mostly. It gets into the cracks, it freezes, it expands, and the pavement just gives up." + pad(3),
  "SPEAKER 1: And nobody budgets for that." + pad(1),
  "SPEAKER 2: Nobody budgets for that. They budget for ribbon cuttings." + pad(2)
], expect: { "SPEAKER 1": "Hollis Grady", "SPEAKER 2": "Renata Szabo" } });

add({ id: "R2", title: "guest addressed only as 'Father'; the notes name the priest and exorcist, and he speaks as one", L: { show: "Night Questions", showAuthor: "Mara Ellwood", showPersons: [{ name: "Mara Ellwood", role: "host" }], episodeTitle: "What an exorcist actually does", description: "Fr. Tomas Varga is a parish priest and exorcist for a Midwestern diocese. He talks about the paperwork, the psychiatrists, and the very rare cases he can't explain." }, lines: [
  "SPEAKER 1: This is Night Questions. I'm Mara Ellwood. Tonight's conversation is one I've wanted to have for a long time." + pad(2) + " Father, thank you for doing this.",
  "SPEAKER 2: Thank you for asking. I don't do many of these, so forgive me if I'm a little stiff." + pad(1),
  "SPEAKER 1: You're doing fine. Let's start with the obvious question. How does somebody end up in your office?" + pad(1),
  "SPEAKER 2: Usually through their parish priest. And I should say up front, as an exorcist, I spend far more of my time referring people to doctors than I do performing any rite." + pad(3),
  "SPEAKER 1: That will surprise a lot of people." + pad(1),
  "SPEAKER 2: It does. Most of what crosses my desk is grief, or illness, or a family that's simply exhausted." + pad(2)
], expect: { "SPEAKER 1": "Mara Ellwood", "SPEAKER 2": "Tomas Varga" } });

add({ id: "R3", title: "guest's first name appears only inside an ordinary statement, not a question or greeting; notes give her full name", L: { show: "Grain & Gristle", showAuthor: "Wes Tolliver", episodeTitle: "Heritage hogs and the cost of patience", description: "Wes visits Ann Kowalczyk, who raises heritage hogs on forty acres outside Peoria." }, lines: [
  "SPEAKER 1: We're out at the farm today, and it is loud. You can probably hear the pigs behind me." + pad(2),
  "SPEAKER 2: They know it's feeding time. They always know." + pad(1),
  "SPEAKER 1: I've been to a lot of hog operations, and I'll tell you what, this one smells better than most." + pad(1),
  "SPEAKER 2: That's the pasture. When you rotate them, the ground takes care of most of it." + pad(2),
  "SPEAKER 1: You know, Ann, as a rule I don't buy pork at the grocery store anymore, and it's places like this that ruined me." + pad(1),
  "SPEAKER 2: Good. That's the whole point." + pad(2),
  "SPEAKER 1: How many sows are you running right now?" + pad(1),
  "SPEAKER 2: Fourteen, two boars, and more piglets than I'd like to count." + pad(2)
], expect: { "SPEAKER 1": "Wes Tolliver", "SPEAKER 2": "Ann Kowalczyk" } });

add({ id: "R4", title: "lower-case, unpunctuated auto-captions; both names spoken in passing", L: { show: "Ridgeline Radio", showAuthor: "Kara Ellison", episodeTitle: "Building trails that last", description: "Kara Ellison talks with trail builder Mateo Brandt about drainage, switchbacks and why most trails fail." }, lines: [
  "SPEAKER 1: hey everybody welcome back to ridgeline radio im kara ellison and today im sitting down with somebody whose work youve probably walked on without ever knowing it mateo brandt builds trails for a living welcome mateo",
  "SPEAKER 2: thanks kara happy to be here i was out on the ridge this morning actually so im still a little muddy sorry about the boots",
  "SPEAKER 1: so what makes a trail last like whats the difference between a good one and one that washes out in two years",
  "SPEAKER 2: its almost always water you have to get the water off the trail every few feet or it just turns into a creek bed and then the creek bed turns into a ditch",
  "SPEAKER 1: and people dont think about that at all when theyre hiking",
  "SPEAKER 2: no and they shouldnt have to thats my job honestly if you notice the drainage i probably did it wrong",
  "SPEAKER 1: i love that okay so walk me through a switchback"
], expect: { "SPEAKER 1": "Kara Ellison", "SPEAKER 2": "Mateo Brandt" } });

add({ id: "R5", title: "HOST/GUEST labels instead of numbers; the host introduces himself and the guest", L: { show: "Signal & Static", showAuthor: "Signal & Static Media", episodeTitle: "Ep. 88: The radio towers nobody maintains", description: "Broadcast engineer Lorna Becket on aging AM transmitters and who pays to keep them standing." }, lines: [
  "HOST: This is Signal and Static, I'm Wendell Osei. My guest today has climbed more radio towers than she cares to admit." + pad(1) + " Lorna Becket, welcome to the show.",
  "GUEST: Thanks, Wendell. Glad to be here, and glad to be on the ground for once." + pad(1),
  "HOST: How many towers are you responsible for right now?" + pad(1),
  "GUEST: Thirty-one, across four counties. Most of them went up before I was born." + pad(2),
  "HOST: And who pays to keep them standing?",
  "GUEST: That's the question, isn't it. Mostly nobody, until one falls over." + pad(2)
], expect: { "HOST": "Wendell Osei", "GUEST": "Lorna Becket" } });

add({ id: "R6", title: "phone guest introduced on the line from another city", L: { show: "Kettle River Morning", showAuthor: "Kettle River Public Radio", showPersons: [{ name: "Gretchen Albers", role: "host" }], episodeTitle: "Heat dome over the desert", description: "A check-in with climatologist Hal Brenner in Tucson as the heat wave enters its second week." }, lines: [
  "SPEAKER 1: Good morning, this is Kettle River Morning. I'm Gretchen Albers. It's warm here, but nowhere near as hot as it is in Arizona this week." + pad(1) + " Climatologist Hal Brenner is on the line from Tucson. Hal, can you hear me okay?",
  "SPEAKER 2: I can hear you fine, Gretchen. It's already ninety-eight degrees here, and it isn't even eight o'clock." + pad(1),
  "SPEAKER 1: That's hard to imagine. How long is this going to last?" + pad(1),
  "SPEAKER 2: At least through the weekend. The high pressure is just parked over us and it isn't moving." + pad(2),
  "SPEAKER 1: What should people be doing to stay safe?",
  "SPEAKER 2: Stay inside in the afternoon, check on your neighbors, and never leave anybody in a car, not even for a minute." + pad(2),
  "SPEAKER 1: Hal Brenner in Tucson, thank you, and stay cool.",
  "SPEAKER 2: I'll try. Thanks for having me."
], expect: { "SPEAKER 1": "Gretchen Albers", "SPEAKER 2": "Hal Brenner" } });

add({ id: "R7", title: "panel: two guests introduced one after another, then each called on by first name", L: { show: "County Line", showAuthor: "Prairie Signal Radio", episodeTitle: "Where did the surplus go?", description: "Economist Rhea Castellano and former county treasurer Bill Ostrowski on the vanishing budget surplus." }, lines: [
  "SPEAKER 1: Welcome to County Line. I'm Danny Ruelas. Two years ago this county had a surplus, and now it has a hole, and tonight we're going to try to figure out how." + pad(1) + " Joining me are economist Rhea Castellano and former county treasurer Bill Ostrowski. Rhea, let's start with you. What happened?",
  "SPEAKER 2: Thanks, Danny. The short version is that the surplus was never as big as it looked on paper." + pad(2),
  "SPEAKER 1: Bill, you were in that office. Is that fair?",
  "SPEAKER 3: It's fair, but it isn't the whole story. We warned the commissioners in writing, more than once." + pad(2),
  "SPEAKER 2: I've read those memos, and he's right. They did." + pad(1),
  "SPEAKER 1: So why didn't anybody listen?",
  "SPEAKER 3: Because a surplus is good news, and nobody wants to be the one who ruins good news." + pad(2)
], expect: { "SPEAKER 1": "Danny Ruelas", "SPEAKER 2": "Rhea Castellano", "SPEAKER 3": "Bill Ostrowski" } });

add({ id: "R8", title: "returning guest welcomed back by first name only; the notes carry her full name", L: { show: "The Lamplit Table", showAuthor: "Ruth Adeyemi", episodeTitle: "Nadia Petrakis returns", description: "Nadia Petrakis is back for a third conversation, this time about her new book on island cooking." }, lines: [
  "SPEAKER 1: Welcome to The Lamplit Table. This is a happy day, because my guest has been here twice before, and every single time we run out of tape." + pad(1) + " Welcome back, Nadia.",
  "SPEAKER 2: Thank you, Ruth. Third time. I think that makes me a regular." + pad(1),
  "SPEAKER 1: It makes you family. The last time you sat in that chair, the book was a stack of index cards." + pad(1),
  "SPEAKER 2: It was a shoebox of index cards, and half of them had olive oil on them." + pad(2),
  "SPEAKER 1: And now it's real. How does that feel?",
  "SPEAKER 2: Terrifying, honestly. Now everyone can see exactly where I got it wrong." + pad(2)
], expect: { "SPEAKER 1": "Ruth Adeyemi", "SPEAKER 2": "Nadia Petrakis" } });

add({ id: "R9", title: "two listed co-hosts plus a guest; the co-host is greeted at the top, the guest welcomed later", L: { show: "Bread & Bone", showPersons: [{ name: "Priya Raman", role: "host" }, { name: "Jonah Feld", role: "host" }], episodePersons: [{ name: "Odette Lindqvist", role: "guest" }], episodeTitle: "Laminated dough, explained", description: "Priya and Jonah talk croissants with pastry chef Odette Lindqvist." }, lines: [
  "SPEAKER 1: Hi, and welcome to Bread and Bone. I'm Priya Raman, here as always with Jonah Feld." + pad(1),
  "SPEAKER 2: Hello, hello. I already have butter under my fingernails." + pad(1),
  "SPEAKER 1: That's appropriate, because today we're talking lamination, and we have the best person to do it. Odette Lindqvist runs the pastry program at a little bakery in Duluth that I will drive four hours for. Odette, welcome.",
  "SPEAKER 3: Thank you both. That's very kind, and the drive is a little crazy." + pad(1),
  "SPEAKER 2: It isn't crazy. I've made that drive too. So what's the mistake everybody makes with croissants?",
  "SPEAKER 3: Warm butter. People let the butter get warm and then wonder where their layers went." + pad(2),
  "SPEAKER 1: Jonah, that is literally what you did last weekend.",
  "SPEAKER 2: I will neither confirm nor deny that." + pad(1)
], expect: { "SPEAKER 1": "Priya Raman", "SPEAKER 2": "Jonah Feld", "SPEAKER 3": "Odette Lindqvist" } });

add({ id: "R10", title: "cold open: the guest's voice is heard first (SPEAKER 1), then the host names herself and the guest", L: { show: "Plumb Line", showAuthor: "Greta Mahoney", episodeTitle: "The bridge that leaned", description: "Structural engineer Desmond Achterberg on the river bridge that sat four inches out of plumb for thirty years." }, lines: [
  "SPEAKER 1: And I put the level on it, and I just stood there, because the whole pier was four inches out of plumb, and nobody had noticed for thirty years." + pad(1),
  "SPEAKER 2: Welcome to Plumb Line. I'm Greta Mahoney. That was my guest, structural engineer Desmond Achterberg, and we will get to that bridge in a minute." + pad(1) + " Desmond, welcome.",
  "SPEAKER 1: Glad to be here, Greta." + pad(1),
  "SPEAKER 2: Start at the beginning. Why were you even looking at that bridge?",
  "SPEAKER 1: Routine inspection. It was supposed to be a two-hour job." + pad(2),
  "SPEAKER 2: And it turned into what?",
  "SPEAKER 1: Six months, and a lot of very uncomfortable meetings." + pad(2)
], expect: { "SPEAKER 1": "Desmond Achterberg", "SPEAKER 2": "Greta Mahoney" } });

add({ id: "R11", title: "host reads a sponsor ad mid-show (mentioning the sponsor's founder) and then goes back to the guest", L: { show: "Courtside Notes", showAuthor: "Lena Fairbanks", episodeTitle: "Is the zone defense back?", description: "Lena argues about zone defense with former college coach Abe Lundgren." }, lines: [
  "SPEAKER 1: Welcome to Courtside Notes. Today I've got former college coach Abe Lundgren with me, and we're going to argue about zone defense." + pad(1),
  "SPEAKER 2: We're not going to argue. You're going to be wrong and I'm going to explain why." + pad(1),
  "SPEAKER 1: We'll see about that. First, a quick word from this week's sponsor. Courtside Notes is brought to you by Halverson Shoes. Mae Halverson started the company in her garage in 1987, and I've been wearing their trainers for two seasons now, and my knees thank me. Use code COURTSIDE for fifteen percent off your first pair." + pad(1) + " Okay, Abe. Make your case.",
  "SPEAKER 2: Thanks, Lena. Here's the thing nobody wants to admit. The zone never went away. It just got renamed." + pad(2),
  "SPEAKER 1: Renamed how?",
  "SPEAKER 2: Every switching scheme you see now is a zone with better marketing." + pad(2)
], expect: { "SPEAKER 1": "Lena Fairbanks", "SPEAKER 2": "Abe Lundgren" } });

add({ id: "R12", title: "a clip of the guest is played, then she answers in the studio, addressed by title and surname", L: { show: "Statehouse Dispatch", showAuthor: "Larkspur Valley Public Radio", episodeTitle: "The road levy vote", description: "City councilwoman Dolores Kettleman explains why she broke with her own party on the road levy." }, lines: [
  "SPEAKER 1: From Larkspur Valley Public Radio, this is Statehouse Dispatch. I'm Clark Ebersole. Last month, at a packed council meeting, my guest said something that got her booed by her own side of the room. Let's listen." + pad(1),
  "CLIP 1: We cannot keep patching this road with good intentions. Either we fund it, or we tell people the truth and close it.",
  "SPEAKER 1: Councilwoman Kettleman, do you still stand by that?",
  "SPEAKER 2: Every word. I'd say it again tonight if they'd let me near a microphone." + pad(2),
  "SPEAKER 1: What did your colleagues say to you afterward?",
  "SPEAKER 2: Some of them didn't say anything at all, which told me plenty." + pad(2)
], expect: { "SPEAKER 1": "Clark Ebersole", "SPEAKER 2": "Dolores Kettleman" } });

add({ id: "R13", title: "guest's name is said exactly once, in the host's introduction; the listing never names her", L: { show: "Beacon Stories", showAuthor: "Harbor & Pine Audio", episodeTitle: "Growing up in a lighthouse", description: "A conversation about a childhood spent at the edge of Lake Superior." }, lines: [
  "SPEAKER 1: This is Beacon Stories. I'm Cal Brody. My guest today is Ingrid Solheim, who spent the first fourteen years of her life at a lighthouse on Lake Superior, where her father was the keeper." + pad(1),
  "SPEAKER 2: That's right. Fourteen years, and I didn't see a traffic light until I was nine." + pad(1),
  "SPEAKER 1: What was a normal day like?",
  "SPEAKER 2: Chores before school, and school was the kitchen table. My mother taught me and my brother." + pad(3),
  "SPEAKER 1: Were you lonely?",
  "SPEAKER 2: Not really. You don't miss what you've never had. The lake was company." + pad(2),
  "SPEAKER 1: What do you remember about the storms?",
  "SPEAKER 2: The sound. The whole tower hummed when the wind got over fifty." + pad(2)
], expect: { "SPEAKER 1": "Cal Brody", "SPEAKER 2": "Ingrid Solheim" } });

add({ id: "R14", title: "guest introduced by a long build-up, with her name arriving only at the very end", L: { show: "Wild Margins", showAuthor: "Wild Margins Media", episodeTitle: "Thirty years underground", description: "A bat biologist on caves, sleep, and the winter she spent underground on purpose." }, lines: [
  "SPEAKER 1: Welcome to Wild Margins. I'm Theo Marchbanks. My next guest has spent three decades tracking migratory bats across the Ozarks. She wrote the field guide most park rangers keep in their glove box, she has been bitten more times than she can count, and she once spent an entire winter living in a cave on purpose, just to see what it would do to her sleep. Please welcome Dr. Maren Holloway." + pad(1),
  "SPEAKER 2: Thank you. That introduction makes me sound much braver than I am." + pad(1),
  "SPEAKER 1: The cave winter. We have to start there.",
  "SPEAKER 2: Everybody wants to start there. It was eleven weeks, and I'd do it again tomorrow." + pad(2),
  "SPEAKER 1: What happened to your sleep?",
  "SPEAKER 2: It drifted. Without the sun, my days stretched out to about twenty-six hours." + pad(2)
], expect: { "SPEAKER 1": "Theo Marchbanks", "SPEAKER 2": "Maren Holloway" } });

add({ id: "R15", title: "publisher is a network not named after anyone and the host never gives a name; only the guest can be named", L: { show: "Night Desk", showAuthor: "Harborlight Network", episodeTitle: "Three a.m. at the truck stop", description: "Truck stop manager Celia Brandvold on life on the overnight shift." }, lines: [
  "SPEAKER 1: You're listening to Night Desk. It's just after midnight, and if you're up, you're in good company." + pad(2) + " My guest tonight runs the overnight shift at the biggest truck stop on Interstate 80 in Nebraska. Celia Brandvold, thank you for coming in.",
  "SPEAKER 2: Happy to. This is the middle of my day, honestly." + pad(1),
  "SPEAKER 1: What does the place look like at three in the morning?",
  "SPEAKER 2: Busier than you'd think. Drivers, sure, but also nurses getting off shift, deputies, kids driving home from somewhere they shouldn't have been." + pad(2),
  "SPEAKER 1: And you know most of them by name.",
  "SPEAKER 2: Most of them. Some I only know by their coffee order." + pad(2)
], expect: { "SPEAKER 1": null, "SPEAKER 2": "Celia Brandvold" } });

add({ id: "R16", title: "video channel named after its host, who never says her name; a helper is introduced by full name", L: { show: "Teodora Lisk", channel: true, episodeTitle: "Rebuilding a 1968 tractor carburetor (it fought me)", description: "Full teardown and rebuild. Parts list and torque specs below." }, lines: [
  "SPEAKER 1: Hey everybody, welcome back to the channel. If you're new here, this is where I fix old farm equipment and complain about it." + pad(1) + " Today the carburetor is off the red tractor, and my neighbor Ferris Kilbane came over to hold the flashlight. Say hi, Ferris.",
  "SPEAKER 2: Hi. I'm mostly here for the coffee." + pad(1),
  "SPEAKER 1: He's here for the coffee. Okay, first thing, look at all this varnish in the bowl." + pad(2),
  "SPEAKER 2: That's been sitting since the eighties.",
  "SPEAKER 1: At least. So everything goes in the soak tank overnight, and we'll come back to it tomorrow." + pad(2),
  "SPEAKER 2: Can I take the coffee with me?" + pad(1)
], expect: { "SPEAKER 1": "Teodora Lisk", "SPEAKER 2": "Ferris Kilbane" } });

add({ id: "R17", title: "two-host show: the feed lists both hosts and each addresses the other by first name", L: { show: "Second Half", showPersons: [{ name: "Imani Brooks", role: "host" }, { name: "Calvin Rusk", role: "host" }], episodeTitle: "The trade deadline was a mess", description: "Imani and Calvin pick through the deadline deals." }, lines: [
  "SPEAKER 1: Welcome to Second Half. It's deadline week, and I have opinions." + pad(1),
  "SPEAKER 2: You always have opinions." + pad(1),
  "SPEAKER 1: Calvin, you were at the game Tuesday when the news broke. What was the clubhouse like?",
  "SPEAKER 2: Honestly, Imani, it was a funeral. Guys were staring at their phones in the tunnel." + pad(2),
  "SPEAKER 1: That tells you how blindsided they were." + pad(1),
  "SPEAKER 2: And the front office didn't even tell the manager first." + pad(2)
], expect: { "SPEAKER 1": "Imani Brooks", "SPEAKER 2": "Calvin Rusk" } });

add({ id: "R18", title: "host's own name comes only in the sign-off at the end", L: { show: "Ledger & Ink", showAuthor: "Ledger & Ink Productions", episodeTitle: "The bookkeeper who saved a town", description: "Historian Pauline Ostergaard on a 1932 bank failure and the bookkeeper who rebuilt every account by hand." }, lines: [
  "SPEAKER 1: In the spring of 1932, the only bank in a little Iowa town closed its doors, and every family in the county lost their savings overnight." + pad(1) + " Pauline Ostergaard is a historian who has spent the last six years with that bank's ledgers. Pauline, welcome.",
  "SPEAKER 2: Thank you. Six years, and I still find surprises in those books." + pad(2),
  "SPEAKER 1: Tell me about the bookkeeper.",
  "SPEAKER 2: Her name was Hazel. She was twenty-three, and she sat in that locked building for four months rebuilding every account from carbon copies." + pad(3),
  "SPEAKER 1: What happened to her afterward?",
  "SPEAKER 2: She ran the new bank for forty years." + pad(1),
  "SPEAKER 1: Pauline Ostergaard, thank you. For Ledger and Ink, I'm Silas Penhallow. Thanks for listening."
], expect: { "SPEAKER 1": "Silas Penhallow", "SPEAKER 2": "Pauline Ostergaard" } });

add({ id: "R19", title: "round-table: the host hands off and three guests introduce themselves in turn", L: { show: "The East Side Exchange", showAuthor: "Ninth Street Community Radio", episodeTitle: "Feeding the east side", description: "Three people who run food programs on the city's east side talk about what's working and what isn't." }, lines: [
  "SPEAKER 1: Good evening and welcome to The East Side Exchange. I'm Marcy Delahunt, and tonight I have three guests around the table, so I'm going to let them introduce themselves. Go ahead." + pad(1),
  "SPEAKER 2: Hi, I'm Beatrix Olumide, and I run the food pantry at the old firehouse on Ninth Street." + pad(1),
  "SPEAKER 3: And I'm Sol Pinsker. I'm the pastor at Grace Fellowship, and we serve a hot meal every Wednesday." + pad(1),
  "SPEAKER 4: I'm Hannah Voss. I coordinate the school backpack program for the district." + pad(1),
  "SPEAKER 1: Beatrix, let's start with you. What changed this year?",
  "SPEAKER 2: The lines. They doubled in the spring and they haven't come back down." + pad(2),
  "SPEAKER 3: We're seeing the same thing on Wednesdays." + pad(1),
  "SPEAKER 4: And the backpacks are going home heavier, because the kids are taking food for their brothers and sisters." + pad(2)
], expect: { "SPEAKER 1": "Marcy Delahunt", "SPEAKER 2": "Beatrix Olumide", "SPEAKER 3": "Sol Pinsker", "SPEAKER 4": "Hannah Voss" } });

add({ id: "R20", title: "guest named in the episode title and feed persons, addressed in the show only by first name", L: { show: "Dirt Talk", showAuthor: "Corrie Vanderpool", episodeTitle: "Ep. 212: Soil, salt and patience with Hector Villanueva", episodePersons: [{ name: "Hector Villanueva", role: "guest" }] }, lines: [
  "SPEAKER 1: Welcome to Dirt Talk, the show about the stuff under your feet. I'm Corrie Vanderpool." + pad(1) + " Hector, thanks for driving up from the valley.",
  "SPEAKER 2: Of course. Three hours, but who's counting." + pad(1),
  "SPEAKER 1: You've been bringing salty farmland back for, what, twenty years now?",
  "SPEAKER 2: Twenty-two. My father started it, and I just never stopped." + pad(2),
  "SPEAKER 1: What's the first thing you do with a field that's gone white?",
  "SPEAKER 2: Nothing. You watch it for a season. People hate that answer." + pad(2)
], expect: { "SPEAKER 1": "Corrie Vanderpool", "SPEAKER 2": "Hector Villanueva" } });

add({ id: "R21", title: "guest addressed only as 'Doctor'; the notes describe the one emergency physician on the episode", L: { show: "The Night Rounds", showAuthor: "Gulf Coast Health Radio", showPersons: [{ name: "Ray Thibodeaux", role: "host" }], episodeTitle: "What a night in the ER really looks like", description: "Dr. Rosalind Okafor, an emergency physician at a Houston trauma center, talks about the overnight shift." }, lines: [
  "SPEAKER 1: This is The Night Rounds. I'm Ray Thibodeaux. My guest just came off a twelve-hour overnight in one of the busiest emergency departments in Texas." + pad(1) + " Doctor, thank you for not going straight to bed.",
  "SPEAKER 2: Bed is overrated. I'll sleep at some point this afternoon." + pad(1),
  "SPEAKER 1: What was last night like?",
  "SPEAKER 2: Steady. A car wreck around two, a lot of chest pain, and a little boy who swallowed a battery." + pad(1) + " In emergency medicine you learn to expect a little of everything.",
  "SPEAKER 1: Is the boy okay?",
  "SPEAKER 2: He's fine. We got it out in time." + pad(2)
], expect: { "SPEAKER 1": "Ray Thibodeaux", "SPEAKER 2": "Rosalind Okafor" } });

add({ id: "R22", title: "news anchor hands off to a reporter by full name; she thanks the anchor by first name and the feed lists him as host", L: { show: "Evening Report", showAuthor: "Cedar Hollow Public Media", showPersons: [{ name: "Neil Haverford", role: "host" }], episodeTitle: "No verdict yet in mill fire trial", description: "Jury deliberations continue in the Castlebrook mill fire trial." }, lines: [
  "SPEAKER 1: Good evening. Jurors in the Castlebrook mill fire trial deliberated for a sixth straight day today without reaching a verdict." + pad(1) + " Our reporter Simone Abara has been at the courthouse all week. Simone, what are you hearing?",
  "SPEAKER 2: Thanks, Neil. The jury sent the judge two notes this afternoon, both asking to rehear testimony from the fire marshal." + pad(2),
  "SPEAKER 1: What does that tell us?",
  "SPEAKER 2: It tells us they're focused on the timeline, and on exactly when the sprinklers were shut off." + pad(2),
  "SPEAKER 1: Simone Abara at the courthouse. Thank you.",
  "SPEAKER 2: Thank you, Neil."
], expect: { "SPEAKER 1": "Neil Haverford", "SPEAKER 2": "Simone Abara" } });

/* ---------------- traps ---------------- */

add({ id: "T1", title: "the listed host is away; a named fill-in hosts and the guest is named", L: { show: "The Morty Kessler Show", showAuthor: "Morty Kessler", showPersons: [{ name: "Morty Kessler", role: "host" }], episodeTitle: "The blood supply is running low", description: "The regional blood bank director on this summer's shortage." }, lines: [
  "SPEAKER 1: Good afternoon, and if you were expecting Morty, I'm sorry to disappoint you. I'm Priscilla Hahn, sitting in while he's fishing somewhere in northern Minnesota and very deliberately not answering his phone." + pad(1) + " My guest this hour is Arjun Talwar, who runs the regional blood bank. Arjun, welcome.",
  "SPEAKER 2: Thanks, Priscilla. Tell Morty we missed him." + pad(1),
  "SPEAKER 1: I'll tell him. He won't care. So, the blood supply. How bad is it?",
  "SPEAKER 2: We're down to about a day and a half of O negative, which is the lowest I've seen in my career." + pad(2),
  "SPEAKER 1: What happens if it runs out?",
  "SPEAKER 2: Hospitals start postponing surgeries. That's already happening in two counties." + pad(2)
], expect: { "SPEAKER 1": "Priscilla Hahn", "SPEAKER 2": "Arjun Talwar" } });

add({ id: "T2", title: "episode about a man who has died; his daughter is the guest, known only by first name, and the host addresses the dead man", L: { show: "Keepsake", showAuthor: "Mill Street Audio", episodeTitle: "Remembering Harlan Pryce (1941-2026)", description: "Harlan Pryce built fiddles in a converted chicken coop for fifty years. He died in March. His daughter joins us to talk about his life and his workshop." }, lines: [
  "SPEAKER 1: This is Keepsake. I'm Bonnie Laczko. Harlan Pryce made somewhere around four hundred fiddles in his lifetime, and he never advertised a single one. He died this spring at eighty-four." + pad(1) + " His daughter Celeste is here with me. Celeste, thank you.",
  "SPEAKER 2: Thank you for wanting to do this. Dad would have hated the attention and loved the conversation." + pad(1),
  "SPEAKER 1: What was the workshop like?",
  "SPEAKER 2: Cold. He refused to heat it, because he said the wood liked it cold." + pad(2),
  "SPEAKER 1: I have to say it. Harlan, wherever you are, we're turning the heat on in that coop.",
  "SPEAKER 2: He'd be furious. He'd also be secretly pleased." + pad(2)
], expect: { "SPEAKER 1": "Bonnie Laczko", "SPEAKER 2": { not: "Harlan Pryce" } } });

add({ id: "T3", title: "the featured photographer is heard only on an archival clip, where she says her name; the live guest is her biographer", L: { show: "Long Exposure", showAuthor: "Pinecrest Radio Collective", episodeTitle: "The lost interviews of Odile Fournier", description: "Rare archival recordings of the photographer Odile Fournier (1919-1994), with her biographer Peter Lindgren." }, lines: [
  "SPEAKER 1: From Pinecrest Radio Collective, this is Long Exposure. I'm Tamsin Rourke. In 1979, a college student with a cassette recorder sat down with the photographer Odile Fournier for six hours, and those tapes sat in a closet until last year." + pad(1) + " Here she is, describing her first darkroom.",
  "CLIP 1: I'm Odile Fournier, and I was nineteen, and the darkroom was a closet under the stairs with a red bulb my father took from the railway yard.",
  "SPEAKER 1: My guest is Peter Lindgren, who wrote her biography and found those tapes. Peter, what did you think the first time you heard her voice?",
  "SPEAKER 2: I cried, honestly. I'd spent ten years with her letters, and I'd never once heard her laugh." + pad(2),
  "SPEAKER 1: And she laughs a lot on these tapes.",
  "SPEAKER 2: Constantly. At herself, mostly." + pad(2)
], expect: { "SPEAKER 1": "Tamsin Rourke", "SPEAKER 2": "Peter Lindgren" } });

add({ id: "T4", title: "listing has two guests but one is stuck in traffic and never speaks; the host calls out to him just before the other guest answers", L: { show: "The Zoning Desk", showPersons: [{ name: "Mirela Costa", role: "host" }], episodePersons: [{ name: "Tessa Moreau", role: "guest" }, { name: "Ramon Estrada", role: "guest" }], episodeTitle: "Duplexes everywhere?", description: "City planner Tessa Moreau and developer Ramon Estrada debate the new zoning code." }, lines: [
  "SPEAKER 1: This is The Zoning Desk. I'm Mirela Costa. We have two guests today, but one of them is stuck on the bridge, so we'll start with city planner Tessa Moreau, and developer Ramon Estrada will join us when he can." + pad(1) + " Ramon, we're starting without you, so drive faster.",
  "SPEAKER 2: He's never on time. I say that with love." + pad(1),
  "SPEAKER 1: Tessa, explain the new code for people who haven't read all four hundred pages.",
  "SPEAKER 2: Nobody has read all four hundred pages, including some of the people who voted on it." + pad(2),
  "SPEAKER 1: Ouch.",
  "SPEAKER 2: The short version is that you can build a duplex almost anywhere a house can go." + pad(2)
], expect: { "SPEAKER 1": "Mirela Costa", "SPEAKER 2": "Tessa Moreau" } });

add({ id: "T5", title: "guest shares a first name with the co-host; the host switches to surnames to tell them apart", L: { show: "Overtime Hours", showPersons: [{ name: "Leah Dorsey", role: "host" }, { name: "Sam Whitley", role: "host" }], episodePersons: [{ name: "Sam Okonjo", role: "guest" }], episodeTitle: "Burnout at the bedside", description: "Leah and Sam talk with ICU nurse Sam Okonjo about staffing and burnout." }, lines: [
  "SPEAKER 1: Welcome to Overtime Hours. I'm Leah Dorsey, my co-host Sam Whitley is here, and so is our guest, who is also named Sam, so this is going to get confusing." + pad(1),
  "SPEAKER 2: We really should have planned this better." + pad(1),
  "SPEAKER 1: We'll use last names. Okonjo, welcome. How long have you been an ICU nurse?",
  "SPEAKER 3: Eleven years, all of them on nights." + pad(2),
  "SPEAKER 1: Whitley, you worked nights with her, didn't you?",
  "SPEAKER 2: For two years, back when I still had a pulse." + pad(1),
  "SPEAKER 3: He was the one who always brought donuts. Everybody loved him for it." + pad(1),
  "SPEAKER 1: Okonjo, what's the ratio on a bad night now?",
  "SPEAKER 3: Three patients each, sometimes four. It should be two." + pad(2)
], expect: { "SPEAKER 1": "Leah Dorsey", "SPEAKER 2": "Sam Whitley", "SPEAKER 3": "Sam Okonjo" } });

add({ id: "T6", title: "a caller has the same first name as the studio guest", L: { show: "The Garden Line", showAuthor: "Sandhill Farm Radio", showPersons: [{ name: "Merle Hanstad", role: "host" }], episodeTitle: "Tomato troubles", description: "Master gardener Nina Castellanos takes your calls about blight, blossom end rot and cracking." }, lines: [
  "SPEAKER 1: You're on The Garden Line. I'm Merle Hanstad, and with me in the studio is master gardener Nina Castellanos. Nina, good to have you back." + pad(1),
  "SPEAKER 2: Good to be back, Merle. It's tomato season, so I expect the phones are full." + pad(1),
  "SPEAKER 1: They are. Let's go to the phones. Nina in Fresno, you're on The Garden Line.",
  "SPEAKER 3: Hi! Oh, that's funny, two Ninas. Hi, Merle. My tomatoes are all cracking around the top." + pad(1),
  "SPEAKER 2: That's usually water. Are you watering a lot all at once after it's been dry for a while?" + pad(1),
  "SPEAKER 3: Probably, yeah. I'm gone most weekends.",
  "SPEAKER 2: Then a soaker hose on a timer will fix most of it." + pad(2),
  "SPEAKER 1: Thanks for the call, Nina."
], expect: { "SPEAKER 1": "Merle Hanstad", "SPEAKER 2": "Nina Castellanos", "SPEAKER 3": { not: "Nina Castellanos" } } });

add({ id: "T7", title: "guest tells a story in which another man introduces himself by full name", L: { show: "Blue Collar Saints", showAuthor: "Kilnworks Audio", episodeTitle: "Forty years on high steel", description: "Retired ironworker Gus Pavlides tells stories from four decades of walking beams." }, lines: [
  "SPEAKER 1: Welcome to Blue Collar Saints. I'm Nell Hargrove. My guest walked steel beams sixty stories up for forty years. Gus Pavlides, welcome." + pad(1),
  "SPEAKER 2: Thank you, Nell. Glad to be somewhere with a floor." + pad(1),
  "SPEAKER 1: Tell me about your first day.",
  "SPEAKER 2: First day, I'm eighteen, I'm terrified, and this big guy walks over, sticks out a hand the size of a shovel, and says, 'Name's Royce Abernathy. I'm your connector, and if you drop anything on me, I'll throw you off this building.'" + pad(2),
  "SPEAKER 1: That's quite a welcome.",
  "SPEAKER 2: He became my best friend. Thirty years we worked together." + pad(2),
  "SPEAKER 1: Is he still around?",
  "SPEAKER 2: He passed in 2019. I still have his gloves." + pad(1)
], expect: { "SPEAKER 1": "Nell Hargrove", "SPEAKER 2": "Gus Pavlides" } });

add({ id: "T8", title: "guest reads aloud a letter whose writer gives her own name", L: { show: "Unsent", showAuthor: "Unsent Podcast", episodeTitle: "The nurse who wrote back", description: "Martin Greaves spent twenty years trying to find the night nurse who sat with his father. Then a letter arrived." }, lines: [
  "SPEAKER 1: This is Unsent, the show about letters. I'm Corey Blaylock. My guest today is Martin Greaves, and he brought a letter with him. Martin, would you read it for us?" + pad(1),
  "SPEAKER 2: I will. Bear with me. 'Dear Mr. Greaves, my name is Irene Castro, and I was the night nurse on your father's ward in the winter of 2004. I have thought about your family every winter since.'" + pad(1),
  "SPEAKER 1: When did that arrive?",
  "SPEAKER 2: Last October. More than twenty years after he died." + pad(2),
  "SPEAKER 1: Did you write back?",
  "SPEAKER 2: That same night. Four pages." + pad(2)
], expect: { "SPEAKER 1": "Corey Blaylock", "SPEAKER 2": "Martin Greaves" } });

add({ id: "T9", title: "two priests, both called 'Father'; the host never says his own name and is known from the listing", L: { show: "The Vesper Hour", showAuthor: "Hearthlight Catholic Radio", showPersons: [{ name: "Anselm Duarte", role: "host" }], episodeTitle: "Forty years in one parish", description: "Fr. Anselm Duarte talks with Fr. Kevin Mulroney, who retires this month after forty years at St. Odran's." }, lines: [
  "SPEAKER 1: Welcome to The Vesper Hour. My guest is retiring at the end of the month after forty years at the same parish, which is something you almost never see anymore." + pad(1) + " Father, welcome.",
  "SPEAKER 2: Thank you, Father. I've listened to this program for years, so it's strange to be on this side of the microphone." + pad(1),
  "SPEAKER 1: Forty years. What changed the most?",
  "SPEAKER 2: The confession line. It used to go out the door and down the steps." + pad(2),
  "SPEAKER 1: And what didn't change?",
  "SPEAKER 2: Funerals. People still want someone to stand with them at the grave." + pad(2),
  "SPEAKER 1: Father Kevin, thank you for everything you've given that parish.",
  "SPEAKER 2: The parish gave me more, Father. It always does." + pad(1)
], expect: { "SPEAKER 1": "Anselm Duarte", "SPEAKER 2": "Kevin Mulroney" } });

add({ id: "T10", title: "host calls out by full name to an absent former mayor right before the guest speaks", L: { show: "Main Street Mic", showPersons: [{ name: "Ruby Sandoval", role: "host" }], episodeTitle: "Who closed the Westside pool?", description: "Swim coach Abby Marchetti on the summer the Westside pool didn't open, and the former mayor who made the call." }, lines: [
  "SPEAKER 1: This is Main Street Mic. I'm Ruby Sandoval. With me is swim coach Abby Marchetti, who taught half this town to swim at the Westside pool." + pad(1),
  "SPEAKER 2: More than half, I think. Thanks for having me, Ruby." + pad(1),
  "SPEAKER 1: That pool didn't open this summer, and the man who made that decision has not returned a single call from this program." + pad(1) + " So, Gordon Pike, if you're listening, the line is open and the coffee is hot.",
  "SPEAKER 2: He's not going to call." + pad(1),
  "SPEAKER 1: I know he isn't.",
  "SPEAKER 2: Three hundred kids signed up for lessons in the spring, and I had to call every one of those families myself." + pad(2)
], expect: { "SPEAKER 1": "Ruby Sandoval", "SPEAKER 2": "Abby Marchetti" } });

add({ id: "T11", title: "an ad announcer, diarized as a numbered voice, names the host in the third person", L: { show: "The Gil Okerlund Hour", showAuthor: "Gil Okerlund", episodeTitle: "Small-town lawyers", description: "Gil sits down with country lawyer Patrice Wynn." }, lines: [
  "SPEAKER 1: Welcome to the hour. My guest has practiced law in a town of nine hundred people for thirty years. Patrice Wynn, welcome." + pad(1),
  "SPEAKER 2: Thanks, Gil. Nine hundred and twelve, but who's counting." + pad(1),
  "SPEAKER 1: We'll get into it right after this.",
  "SPEAKER 3: Gil Okerlund trusts Brightwater Insurance with his home and his truck, and you can too. Call today for a free quote, and tell them Gil sent you." + pad(1),
  "SPEAKER 1: And we're back. Patrice, what does a small-town lawyer actually do all day?",
  "SPEAKER 2: A little of everything. Wills, fences, the occasional divorce, and a whole lot of listening." + pad(2)
], expect: { "SPEAKER 1": "Gil Okerlund", "SPEAKER 2": "Patrice Wynn", "SPEAKER 3": null } });

add({ id: "T12", title: "notes name the CEO who declined; the actual guest is an anonymous former employee who talks about her", L: { show: "Undertow", showAuthor: "Undertow Audio", episodeTitle: "Inside Corvane's safety reports", description: "Corvane CEO Rachel Imbert declined our request for an interview. A former Corvane engineer, who asked that we not use her name, describes what she saw." }, lines: [
  "SPEAKER 1: This is Undertow. I'm Hugh Talbot. My guest worked at Corvane for six years. She asked us not to use her name, and we've altered her voice." + pad(1) + " Thank you for doing this.",
  "SPEAKER 2: I almost didn't. I changed my mind about four times this week." + pad(1),
  "SPEAKER 1: What did you see?",
  "SPEAKER 2: Test reports that came back with the numbers changed. Not once. Every quarter." + pad(2),
  "SPEAKER 1: Did you ever raise it with Rachel Imbert directly?",
  "SPEAKER 2: Once, in an elevator. She told me she'd look into it." + pad(2),
  "SPEAKER 1: And did she?",
  "SPEAKER 2: I was moved to another team two weeks later." + pad(1)
], expect: { "SPEAKER 1": "Hugh Talbot", "SPEAKER 2": null } });

add({ id: "T13", title: "the listed guest cancelled; a colleague substitutes and is introduced by name", L: { show: "Deep Field Notes", showAuthor: "Orbital Audio Works", showPersons: [{ name: "Marisol Ibarra", role: "host" }], episodePersons: [{ name: "Felix Amari", role: "guest" }], episodeTitle: "This winter's comet, with Dr. Felix Amari", description: "Astronomer Dr. Felix Amari explains why this winter's comet could be the brightest in a decade." }, lines: [
  "SPEAKER 1: Welcome to Deep Field Notes. I'm Marisol Ibarra. If you read the episode description, you were expecting Dr. Felix Amari today. Felix had a family emergency this morning, and he sends his apologies." + pad(1) + " Luckily his colleague down the hall at the observatory agreed to step in on two hours' notice. Dr. Hana Whitlock, thank you for saving us.",
  "SPEAKER 2: Happy to. Felix and I share an office, so I've heard him talk about this comet every day for a month." + pad(1),
  "SPEAKER 1: So you're well prepared.",
  "SPEAKER 2: Over-prepared, if anything." + pad(1),
  "SPEAKER 1: Why is everyone so excited about this one?",
  "SPEAKER 2: Because it's passing close to the sun and it's very fresh, so it may throw off a lot of dust." + pad(2)
], expect: { "SPEAKER 1": "Marisol Ibarra", "SPEAKER 2": "Hana Whitlock" } });

add({ id: "T14", title: "an unnamed caller greets the host by name ('Hi Dale, long time listener')", L: { show: "Dale After Dark", showAuthor: "Dale Whitcomb", showPersons: [{ name: "Dale Whitcomb", role: "host" }], episodeTitle: "Your worst landlord stories", description: "Dale takes your calls about landlords from the bad place." }, lines: [
  "SPEAKER 1: It's Dale After Dark, the phones are lit up, and tonight we want your worst landlord stories." + pad(1) + " Let's go to the line. You're on the air.",
  "SPEAKER 2: Hi Dale, long time listener, first time caller. I've been waiting years for this topic." + pad(1),
  "SPEAKER 1: Well, here it is. Go ahead.",
  "SPEAKER 2: So our landlord used to let himself in while we were at work and rearrange the furniture. Every single week." + pad(2),
  "SPEAKER 1: Rearrange it how?",
  "SPEAKER 2: Back to the way he liked it. He had strong opinions about where the couch went." + pad(2),
  "SPEAKER 1: That is deeply strange. Thanks for the call."
], expect: { "SPEAKER 1": "Dale Whitcomb", "SPEAKER 2": null } });

add({ id: "T15", title: "show is named after a missing woman who is never on it; the host and the motel clerk are named", L: { show: "Finding Josephine Calder", showAuthor: "Stillwater Lane Audio", episodeTitle: "Episode 4: The motel ledger", description: "In 1996, nineteen-year-old Josephine Calder checked into a motel outside Amarillo and was never seen again. This week, the motel's former night clerk talks for the first time." }, lines: [
  "SPEAKER 1: From Stillwater Lane Audio, this is Finding Josephine Calder. I'm Owen Strickland." + pad(1) + " For three years I tried to reach the man who was working the front desk that night. His name is Lyle Dempsey, he's eighty-one now, and in March he finally called me back.",
  "SPEAKER 2: I've wanted to tell somebody this for a long time." + pad(1),
  "SPEAKER 1: Tell me what you remember about that night.",
  "SPEAKER 2: She paid cash. She asked for a room in the back, away from the highway." + pad(2),
  "SPEAKER 1: Did she seem afraid?",
  "SPEAKER 2: She seemed tired. That's what I told everybody back then, too." + pad(2)
], expect: { "SPEAKER 1": "Owen Strickland", "SPEAKER 2": "Lyle Dempsey" } });

add({ id: "T16", title: "the listed host is out sick and an unnamed producer fills in", L: { show: "Marguerite in the Morning", showAuthor: "Bluestem Community Radio", showPersons: [{ name: "Marguerite Olsen", role: "host" }], episodeTitle: "The library levy, explained", description: "What the library levy on November's ballot would and wouldn't pay for." }, lines: [
  "SPEAKER 1: Good morning, and welcome to Marguerite in the Morning. Marguerite is home with a cold, so you're stuck with her producer today. I'll try not to break anything." + pad(1) + " My guest is the county library director, Felipe Arambula. Felipe, thanks for coming in so early.",
  "SPEAKER 2: Thanks for having me. Tell Marguerite to drink some tea." + pad(1),
  "SPEAKER 1: I'll pass it on. So what would the levy actually pay for?",
  "SPEAKER 2: Mostly hours. Right now three of our branches are closed on Saturdays, and Saturday is when working families can come in." + pad(2),
  "SPEAKER 1: And what wouldn't it pay for?",
  "SPEAKER 2: New buildings. That's a separate fight for another day." + pad(2)
], expect: { "SPEAKER 1": null, "SPEAKER 2": "Felipe Arambula" } });

add({ id: "T17", title: "a late arrival turns out to be the listed guest's chief of staff, not the senator", L: { show: "Capitol Corner", showAuthor: "Northfork Valley Radio", showPersons: [{ name: "Joanna Pell", role: "host" }], episodePersons: [{ name: "Arturo Belmonte", role: "guest" }], episodeTitle: "The transit bill, with Senator Arturo Belmonte", description: "State Senator Arturo Belmonte on the transit bill and the vote count." }, lines: [
  "SPEAKER 1: This is Capitol Corner. I'm Joanna Pell. Senator Arturo Belmonte is supposed to join us, and his office says he's on his way, so we'll get started." + pad(1) + " With me as always is our political analyst, Curtis Lemaire. Curtis, does the bill have the votes?",
  "SPEAKER 2: Not yet. It's two short in the Senate, and everybody in the building knows which two." + pad(2),
  "SPEAKER 3: Sorry, sorry. Hi. I'm with the Senator's office. He got pulled into a caucus meeting and sent me in his place, if that's all right." + pad(1),
  "SPEAKER 1: Of course. Grab a headset. What's your name?",
  "SPEAKER 3: Tricia. I'm his chief of staff.",
  "SPEAKER 1: Tricia, welcome. Is the Senator going to find his two votes?",
  "SPEAKER 3: He thinks so. By Thursday." + pad(2)
], expect: { "SPEAKER 1": "Joanna Pell", "SPEAKER 2": "Curtis Lemaire", "SPEAKER 3": { not: "Arturo Belmonte" } } });

add({ id: "T18", title: "role reversal: the listed host becomes the guest and her friend asks the questions", L: { show: "Hollow Pine", showAuthor: "Agnes Moberly", showPersons: [{ name: "Agnes Moberly", role: "host" }], episodeTitle: "Episode 300: The tables turn", description: "For episode 300, Agnes hands the microphone to her old friend Russ Kemper, who asks the questions for once." }, lines: [
  "SPEAKER 1: Hi, welcome to Hollow Pine. This is episode three hundred, which I can't believe, and to celebrate I've done something terrifying. I've handed the questions to my oldest friend, and today I'm the guest." + pad(1) + " Russ, take it away.",
  "SPEAKER 2: Thank you, Agnes. I've waited twenty years to be in charge of you." + pad(1) + " So. Three hundred episodes. Why did you start this show?",
  "SPEAKER 1: Honestly? I was lonely. I'd just moved up here and I didn't know a soul." + pad(2),
  "SPEAKER 2: And now you know everybody.",
  "SPEAKER 1: Now I know everybody, and half of them won't stop telling me who to put on the show." + pad(2),
  "SPEAKER 2: Who was the hardest guest?",
  "SPEAKER 1: You, probably, and you haven't even been one yet." + pad(1)
], expect: { "SPEAKER 1": "Agnes Moberly", "SPEAKER 2": "Russ Kemper" } });

add({ id: "T19", title: "host reads a listener email that opens with the writer's self-introduction, then answers him by first name before the producer speaks", L: { show: "Mile Marker", showAuthor: "June Halloran", episodeTitle: "Mailbag: life on the road", description: "June answers your emails about long-haul trucking." }, lines: [
  "SPEAKER 1: Welcome to Mile Marker. It's mailbag day, and my producer Ty is here to keep me honest." + pad(1),
  "SPEAKER 2: Somebody has to." + pad(1),
  "SPEAKER 1: First email. It says, 'Hi, I'm Darnell Hughes. I've driven a flatbed for thirty-one years, and I want to know if you ever get used to the loneliness.'" + pad(1),
  "SPEAKER 2: That's a big one to start with.",
  "SPEAKER 1: It is. Darnell, the honest answer is no, but you get better at living with it." + pad(2),
  "SPEAKER 2: I'd add that the CB radio helps more than people think." + pad(1),
  "SPEAKER 1: Ty, you have never driven a truck in your life.",
  "SPEAKER 2: I've listened to you talk about it for six years. That counts." + pad(1)
], expect: { "SPEAKER 1": "June Halloran", "SPEAKER 2": { not: "Darnell Hughes" } } });

add({ id: "T20", title: "rebroadcast after the founder's death: a new host introduces it, then the founder is heard interviewing a poet", L: { show: "The Eckert Interviews", showAuthor: "Vernon Eckert", episodeTitle: "From the archive: Delphine Achter (2019)", description: "We lost our founder, Vernon Eckert, in July. This week we revisit one of his favorite conversations, with the poet Delphine Achter." }, lines: [
  "SPEAKER 1: Hi, I'm Lucinda Paz, and I've been looking after this show since Vernon died this summer." + pad(1) + " He asked me once which of his interviews I'd save if the building caught fire, and I said this one. Here's Vernon with the poet Delphine Achter, from the spring of 2019.",
  "SPEAKER 2: My guest today has written nine books of poems, and she still drives a mail route three days a week. Delphine, welcome." + pad(1),
  "SPEAKER 3: Thank you, Vernon. The mail route keeps me honest." + pad(1),
  "SPEAKER 2: How so?",
  "SPEAKER 3: Nobody on my route cares that I write poems. They care whether the package came." + pad(2),
  "SPEAKER 2: Do they know?",
  "SPEAKER 3: A few. One lady asks me for a new poem every Christmas." + pad(2),
  "SPEAKER 1: That was Vernon Eckert with Delphine Achter. I'm Lucinda Paz. Thanks for listening."
], expect: { "SPEAKER 1": "Lucinda Paz", "SPEAKER 2": "Vernon Eckert", "SPEAKER 3": "Delphine Achter" } });

add({ id: "T21", title: "host speaks to the off-mic engineer by name just before the guest's first words", L: { show: "Plainsong Sessions", showAuthor: "Amos Teague", episodeTitle: "Lucia Ferrante, live in the studio", description: "Fiddler Lucia Ferrante plays three new tunes and talks about learning by ear." }, lines: [
  "SPEAKER 1: Welcome to Plainsong Sessions. I'm Amos Teague, and sitting across from me with a fiddle in her lap is Lucia Ferrante." + pad(1) + " Kofi, can you bring her mic up a little? She's quieter than the fiddle.",
  "SPEAKER 2: Is that better? I can lean in closer." + pad(1),
  "SPEAKER 1: That's perfect. Thanks, Kofi. Lucia, welcome.",
  "SPEAKER 2: Thank you, Amos. I've been nervous about this all week." + pad(1),
  "SPEAKER 1: You learned entirely by ear, is that right?",
  "SPEAKER 2: Entirely. My grandmother would play a phrase, and I'd play it back until I got it right." + pad(2)
], expect: { "SPEAKER 1": "Amos Teague", "SPEAKER 2": "Lucia Ferrante" } });

add({ id: "T22", title: "episode title names a quarterback the two hosts defend and address in absentia; he never appears", L: { show: "Box Score Brains", showPersons: [{ name: "Dana Whitfield", role: "host" }, { name: "Marcus Feeney", role: "host" }], episodeTitle: "Why everyone is wrong about Leopold Strand", description: "Dana and Marcus defend the most criticized quarterback in the league." }, lines: [
  "SPEAKER 1: Welcome to Box Score Brains. Today we are defending the indefensible, according to every sports talk show in America." + pad(1),
  "SPEAKER 2: We're defending Leopold Strand, and I came ready." + pad(1),
  "SPEAKER 1: Marcus, give me the one number that matters.",
  "SPEAKER 2: Third-down completion percentage. He's fourth in the league, Dana. Fourth." + pad(2),
  "SPEAKER 1: And nobody talks about it, because he threw three picks on national television.",
  "SPEAKER 2: Three picks in one half. People remember the picks." + pad(2),
  "SPEAKER 1: Leopold, buddy, we see you. Hang in there.",
  "SPEAKER 2: He's not hearing this. Nobody on that team listens to podcasts." + pad(1)
], expect: { "SPEAKER 1": "Dana Whitfield", "SPEAKER 2": "Marcus Feeney" } });

module.exports = { S };
