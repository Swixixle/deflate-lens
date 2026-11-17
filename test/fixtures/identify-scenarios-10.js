"use strict";
/* The tenth set (0.14.2): a seventh independent review, written black-box after both repairs, with traps aimed at the last one: the listing names someone who is not one of the voices (a dead author and his translator, a memoirist and her narrator, the historical subject of the title, credits, a late husband, a late mentor, a celebrity employer, a stand-in interviewer, last week's guest left in the feed, a politician heard only in a clip, a caller sharing the guest's surname, a substitute, "I'm not Bob" both ways, a guest stuck in traffic, a co-host, a retired founder as the feed's author, letters read as QUOTE turns). Its first measurement, before any repair: with the model's reading, no wrong name and 5 missed (the app's patterns alone: 2 wrong, 35 missed).
   identify-answers-10.json holds, for each scenario, a model's answer to the exact identification prompt, recorded once
   from a proxy (Claude Sonnet answering each prompt blind, with no view of these expectations). Invented people and shows
   only; no real transcripts, no lyrics.
   expect: { KEY: "Name" | null | { not: "Name" } | { oneOf: [...] } }: what a careful human concludes from the words
   and the listing (the reviewer's own, unchanged). */
const { pad } = require("./identify-pad");
const S = [];
const add = s => S.push(s);

// ---------------------------------------------------------------------------
// Recall probes (K): the words plus the listing settle who these voices are.
// ---------------------------------------------------------------------------

add({ id: "K1", title: "guest named only in the episode title ('Name: ...' form), never aloud; host gives his own name", L: {
  show: "Rising Dough", showAuthor: "Hearthside Audio",
  episodeTitle: "Marisol Quintero: The Flood, the Ovens, and Reopening Day",
  description: "A baker on losing everything to the river last spring and opening her doors again eleven weeks later.",
}, lines: [
  "SPEAKER 1: Welcome to Rising Dough, I'm Dale Prentiss. My guest today watched the river take her bakery last spring and reopened eleven weeks later. Welcome to the show." + pad(1),
  "SPEAKER 2: Thank you for having me. Honestly, eleven weeks felt like eleven years. The water came up past the second shelf of the proofing racks." + pad(2),
  "SPEAKER 1: What was the first thing you did when the water went down?" + pad(1),
  "SPEAKER 2: I called my oven repairman. The deck ovens were the whole business. Everything else I could replace at a restaurant auction, but those ovens were older than me." + pad(2),
  "SPEAKER 1: And reopening day?",
  "SPEAKER 2: There was a line around the block. People I had never met brought me flour, brought me coffee, and one man brought me a mop." + pad(2),
  "SPEAKER 1: That's a lovely place to stop. Thank you so much for coming in." + pad(1),
], expect: { "SPEAKER 1": "Dale Prentiss", "SPEAKER 2": "Marisol Quintero" } });

add({ id: "K2", title: "host who never says her own name (feed host) visits a beekeeper in his barn; guest named only in the notes ('visits beekeeper X')", L: {
  show: "Field Notes from the Ridge",
  showPersons: [{ name: "Annika Thorvaldsen", role: "host" }],
  episodeTitle: "Sixty Hives and a Hayloft",
  description: "Annika visits beekeeper Tobias Ellingboe at his family's barn outside Decorah to talk queen rearing, mite counts, and why he still uses wooden frames.",
}, lines: [
  "SPEAKER 1: We're standing in a barn that smells like beeswax and old hay, and the man next to me has kept bees on this farm for thirty years. Thanks for having me out." + pad(1),
  "SPEAKER 2: Glad you made the drive. Watch your step there, that's the extractor, and it bites." + pad(1),
  "SPEAKER 1: How many hives are you running this season?",
  "SPEAKER 2: Sixty, give or take. I lost eight over the winter, which is actually a good year for this county." + pad(2),
  "SPEAKER 1: And the wooden frames? Almost everyone I talk to has switched to plastic." + pad(1),
  "SPEAKER 2: My father built most of these frames. The bees don't care, and I like the way the wood holds up when the hive gets heavy in August." + pad(2),
  "SPEAKER 1: Let's climb up to the hayloft. You said that's where you raise the queens.",
  "SPEAKER 2: Mind the third rung, it's loose." + pad(1),
], expect: { "SPEAKER 1": "Annika Thorvaldsen", "SPEAKER 2": "Tobias Ellingboe" } });

add({ id: "K3", title: "guest addressed only as 'Doctor', named and described in the notes; host known only from the feed author", L: {
  show: "Small Lungs, Big Questions", showAuthor: "Wendell Farrow",
  episodeTitle: "Spacers, Action Plans, and When to Go In",
  description: "Pediatric pulmonologist Dr. Nkechi Obiora, who has run an asthma clinic for children in Columbus for twenty years, explains spacers, written action plans, and when wheezing means the emergency room.",
}, lines: [
  "SPEAKER 1: Today we're talking about childhood asthma with a physician who has spent twenty years running a children's asthma clinic. Doctor, thanks for coming in." + pad(1),
  "SPEAKER 2: Happy to be here. It's a topic I could talk about all day, so stop me when you need to." + pad(1),
  "SPEAKER 1: Doctor, what's the most common mistake parents make with inhalers?",
  "SPEAKER 2: Skipping the spacer. Without one, most of the medicine ends up on the back of the throat instead of in the lungs." + pad(2),
  "SPEAKER 1: And when should a family stop managing at home and head to the emergency room?" + pad(1),
  "SPEAKER 2: If a child can't finish a sentence without stopping to breathe, or the skin between the ribs is pulling in, don't wait to call anyone. Go." + pad(2),
  "SPEAKER 1: Doctor, thank you. That is going to help a lot of parents listening tonight." + pad(1),
], expect: { "SPEAKER 1": "Wendell Farrow", "SPEAKER 2": "Nkechi Obiora" } });

add({ id: "K4", title: "ride-along in a patrol car; officer addressed only as 'Officer', named in the notes", L: {
  show: "After Dark Ride-Along",
  showPersons: [{ name: "Cormac Delahunt", role: "host" }],
  episodeTitle: "Twelve Hours in Car Fourteen",
  description: "Cormac rides along with Officer Imani Castellanos, a patrol officer in Dayton, on an overnight shift: traffic stops, a lost dog on the interstate, and a long talk about burnout.",
}, lines: [
  "SPEAKER 1: It's a little after ten at night, we're in the front seat of car fourteen, and the radio has not stopped since we pulled out of the lot. Officer, is it always like this?" + pad(1),
  "SPEAKER 2: Fridays, yeah. Buckle up, by the way. I'm not doing the paperwork if you go through the windshield." + pad(1),
  "SPEAKER 1: Noted. How long have you been working nights?",
  "SPEAKER 2: Six years. I asked for days twice and then I stopped asking. You get used to how quiet it gets around four in the morning." + pad(2),
  "SPEAKER 1: Officer, what's the call you think about most?" + pad(1),
  "SPEAKER 2: Honestly? A little terrier loose in the median on the interstate. Took two of us forty minutes and half a cheeseburger to get him into the car." + pad(2),
  "SPEAKER 1: Hold on, we're turning around.",
  "SPEAKER 2: Grab that handle and keep your feet off the radio." + pad(1),
], expect: { "SPEAKER 1": "Cormac Delahunt", "SPEAKER 2": "Imani Castellanos" } });

add({ id: "K5", title: "kitchen interview mid-service; chef addressed only as 'Chef'; host known only from a '<Name> Media' publisher", L: {
  show: "Back of House", showAuthor: "Hollis Pemberton Media",
  episodeTitle: "Brunch Rush with Chef Ottilie Marchetti",
  description: "Behind the line at Trattoria Sole in Providence during Sunday brunch: Chef Ottilie Marchetti on pasta rolled at 5 a.m., thirty tickets on the rail, and how she has kept the same cooks for a decade.",
}, lines: [
  "SPEAKER 1: It's nine-fifteen on a Sunday, there are thirty tickets on the rail, and I have been told to stand against the wall and touch nothing. Chef, where do you want me?" + pad(1),
  "SPEAKER 2: Right there is perfect. Behind! Hot pan coming through." + pad(1),
  "SPEAKER 1: Chef, how early did the pasta get made this morning?",
  "SPEAKER 2: Five a.m., same as every day. I roll the brunch ravioli myself. Nobody else touches it." + pad(2),
  "SPEAKER 1: Your sous chef told me most of this line has been here ten years. How do you manage that?" + pad(1),
  "SPEAKER 2: I pay them on time and I don't yell. Okay, I yell a little. Order up, table nine!" + pad(2),
  "SPEAKER 1: Chef, thank you for letting me into your kitchen.",
  "SPEAKER 2: Come back on a Tuesday. It's nicer on a Tuesday." + pad(1),
], expect: { "SPEAKER 1": "Hollis Pemberton", "SPEAKER 2": "Ottilie Marchetti" } });

add({ id: "K6", title: "boat captain addressed only as 'Captain', named and described in the notes; host says her own name", L: {
  show: "Saltwater Hours",
  showPersons: [{ name: "Lorna Fitzwilliam", role: "host" }],
  episodeTitle: "Crab Season, Twenty-Two Times",
  description: "Captain Halvard Nygaard has run the crab boat Kittiwake out of Kodiak for twenty-two seasons. He talks weather windows, green deckhands, and the one storm he refuses to describe.",
}, lines: [
  "SPEAKER 1: This is Saltwater Hours, I'm Lorna Fitzwilliam, and I'm sitting in the wheelhouse of a crab boat tied up in Kodiak harbor. Captain, thanks for letting me aboard." + pad(1),
  "SPEAKER 2: Mind the coffee. It's been on since four this morning and it'll take the paint off." + pad(1),
  "SPEAKER 1: Twenty-two seasons. What has changed the most?",
  "SPEAKER 2: The forecasts got better and the crab got fewer. When I started we fished on a hunch. Now I've got three weather models on that screen and I still fish on a hunch." + pad(2),
  "SPEAKER 1: Captain, what do you tell a green deckhand on day one?" + pad(1),
  "SPEAKER 2: One hand for yourself and one for the boat. And if you're going to be sick, do it over the side, downwind." + pad(2),
  "SPEAKER 1: And the storm everybody asks you about?",
  "SPEAKER 2: I don't talk about that one. Ask me something else." + pad(1),
], expect: { "SPEAKER 1": "Lorna Fitzwilliam", "SPEAKER 2": "Halvard Nygaard" } });

add({ id: "K7", title: "councilwoman addressed only as 'Councilwoman' and by district, named in the notes; an ad whose speaker names himself is not a voice", L: {
  show: "City Desk Live", showAuthor: "Eastside Community Radio",
  showPersons: [{ name: "Bertrand Okafor", role: "host" }],
  episodeTitle: "Bus Cuts and a Library Promise",
  description: "Councilwoman Rosalind Achterhof, who represents the 4th District on the Toledo City Council, takes questions on the Route 12 bus cuts and the long-promised branch library.",
}, lines: [
  "SPEAKER 1: Good evening, this is City Desk Live, I'm Bertrand Okafor, and with me in the studio is the councilwoman from the fourth district. Councilwoman, welcome back." + pad(1),
  "SPEAKER 2: Thanks for having me again. I expect the phones will be busy tonight." + pad(1),
  "SPEAKER 1: Let's start with Route 12. People are angry about those cuts.",
  "SPEAKER 2: They should be. I voted against it. Route 12 is how half my district gets to the hospital and to second shift." + pad(2),
  "AD 1: Hi, I'm Stavros Petrakis, owner of Petrakis Tire and Brake on Monroe Street, and if you find a lower price on four tires, I'll beat it. Tell them Stavros sent you.",
  "SPEAKER 1: Councilwoman, the branch library. You've been promising it for three years." + pad(1),
  "SPEAKER 2: Groundbreaking is in March. Hold me to it. I mean that, call this show in April if there's no shovel in the ground." + pad(2),
  "SPEAKER 1: We'll take your calls right after the news.",
], expect: { "SPEAKER 1": "Bertrand Okafor", "SPEAKER 2": "Rosalind Achterhof" } });

add({ id: "K8", title: "HOST/GUEST labels; bishop addressed only as 'Bishop', named and described in the notes; host known from the feed", L: {
  show: "Faith in the Valley",
  showPersons: [{ name: "Teodoro Vasquez-Lin", role: "host" }],
  episodeTitle: "A Month in the Big Chair",
  description: "Bishop Thandiwe Mokoena-Reyes was installed last month as the first woman to lead the Valley Lutheran Synod. In her first interview since, she talks about long drives, small congregations, and churches that are closing.",
}, lines: [
  "HOST: My guest was installed just last month, and this is her first interview since. Bishop, welcome to Faith in the Valley." + pad(1),
  "GUEST: Thank you. I'm still learning where all the light switches are in the new office." + pad(1),
  "HOST: Bishop, what has surprised you most in the first month?",
  "GUEST: How much of this job is driving. I've put two thousand miles on the car visiting congregations of thirty and forty people, and those are my favorite Sundays." + pad(2),
  "HOST: And what do you say to the churches that are closing their doors?" + pad(1),
  "GUEST: That a building ending is not the same as a community ending. I say it gently, and then I help them find a church down the road that will make room." + pad(2),
  "HOST: Bishop, thank you for your time.",
], expect: { "HOST": "Teodoro Vasquez-Lin", "GUEST": "Thandiwe Mokoena-Reyes" } });

add({ id: "K9", title: "imam addressed only as 'Imam', named in the notes; guest answers 'Thanks, <host first name>' on a two-host feed where only one host is present", L: {
  show: "Common Table",
  showPersons: [{ name: "Saoirse Callanan", role: "host" }, { name: "Dmitri Halloran", role: "host" }],
  episodeTitle: "Ramadan Nights at the Food Pantry",
  description: "Imam Hamza Bilgrami-Shaw, who leads a neighborhood mosque in Dearborn, explains how its food pantry more than doubled during Ramadan and what the volunteers learned along the way.",
}, lines: [
  "SPEAKER 1: Welcome back to Common Table. Tonight we're at a mosque whose food pantry has become one of the busiest in the city. Imam, thank you for hosting us." + pad(1),
  "SPEAKER 2: Thanks, Saoirse. You picked a good night, all the volunteers are here." + pad(1),
  "SPEAKER 1: Imam, how did the pantry start?",
  "SPEAKER 2: Six families and a borrowed chest freezer in the basement. That was eight years ago." + pad(2),
  "SPEAKER 1: And this Ramadan it more than doubled?" + pad(1),
  "SPEAKER 2: We served four hundred households in a single week. Half of them were not Muslim, and nobody asked." + pad(2),
  "SPEAKER 1: Imam, what's the one thing people listening can do?",
  "SPEAKER 2: Come on a Tuesday. Tuesdays we are always short of hands." + pad(1),
], expect: { "SPEAKER 1": "Saoirse Callanan", "SPEAKER 2": "Hamza Bilgrami-Shaw" } });

add({ id: "K10", title: "guest corrects the host's pronunciation of her surname (the caption spells his mispronunciation); full name only in the notes", L: {
  show: "The Glass Hour", showAuthor: "Ezekiel Brannigan",
  episodeTitle: "Stained Glass and Second Careers",
  description: "Ezekiel talks with Magdalena Wrobel, who left accounting at fifty to restore church windows across Milwaukee.",
}, lines: [
  "SPEAKER 1: Welcome to The Glass Hour. My guest left a career in accounting at fifty to restore stained glass windows. Please welcome Magdalena Robel." + pad(1),
  "SPEAKER 2: Thank you. And it's Vroo-bel, actually. The W sounds like a V. Don't worry, everybody gets it wrong." + pad(1),
  "SPEAKER 1: Vroo-bel. I'm so sorry, I practiced that in the car.",
  "SPEAKER 2: You were close. My own nephew still says it your way." + pad(1),
  "SPEAKER 1: So, accounting to stained glass. How does that happen?" + pad(1),
  "SPEAKER 2: A church near my office had a window with a hole in it the size of a fist, and every day at lunch I looked at that hole. Eventually I asked if I could fix it." + pad(2),
  "SPEAKER 1: What's the oldest window you've worked on?",
  "SPEAKER 2: Eighteen ninety-one. The lead came was crumbling like a cookie in my hands." + pad(2),
], expect: { "SPEAKER 1": "Ezekiel Brannigan", "SPEAKER 2": "Magdalena Wrobel" } });

add({ id: "K11", title: "lower-case unpunctuated captions at a ballpark; groundskeeper named only in the notes ('In conversation with X'); host from the feed", L: {
  show: "Turf and Chalk",
  showPersons: [{ name: "Kwabena Asante-Mills", role: "host" }],
  episodeTitle: "the man who mows the diamond",
  description: "In conversation with Gideon Mbatha, head groundskeeper at a minor-league ballpark in Chattanooga, recorded on the field at dawn on opening day.",
}, lines: [
  "SPEAKER 1: okay were standing on the warning track its about six in the morning and the sprinklers just shut off thanks for letting me out here" + pad(1),
  "SPEAKER 2: no problem just stay off the infield dirt i raked it an hour ago and if you leave a footprint i will cry",
  "SPEAKER 1: how long have you been taking care of this field",
  "SPEAKER 2: nineteen seasons here before that i did golf courses which honestly is easier grass" + pad(1),
  "SPEAKER 1: whats the hardest part of opening day",
  "SPEAKER 2: the weather the forecast says clear but ive got the tarp crew on standby anyway because ive been burned before" + pad(1),
  "SPEAKER 1: and when the crowd comes in tonight where will you be",
  "SPEAKER 2: up in the tunnel watching that mound like a hawk" + pad(1),
], expect: { "SPEAKER 1": "Kwabena Asante-Mills", "SPEAKER 2": "Gideon Mbatha" } });

add({ id: "K12", title: "three-voice panel addressed by first names only; full names of the host and both panelists only in the notes", L: {
  show: "The Thursday Panel", showAuthor: "Lakeshore Public Media",
  showPersons: [{ name: "Delphine Mabry", role: "host" }],
  episodeTitle: "Is the Four-Day Week Here to Stay?",
  description: "Delphine Mabry is joined by labor economist Arjun Telford and print-shop owner Esperanza Ruelas to argue about whether the four-day work week survives a downturn.",
}, lines: [
  "SPEAKER 1: Welcome to The Thursday Panel. Two guests this week, and both have strong feelings about the four-day week. Arjun, you've studied the pilot programs. Do they work?" + pad(1),
  "SPEAKER 2: Mostly, yes. Output held steady in about four out of five firms we looked at, and turnover dropped sharply." + pad(2),
  "SPEAKER 1: Esperanza, you actually tried it at your print shop.",
  "SPEAKER 3: We did, for a year. My crew loved it. My customers who needed a rush job on a Friday did not love it." + pad(2),
  "SPEAKER 2: That's the most common complaint in the data. Coverage, not productivity." + pad(1),
  "SPEAKER 3: Well, the data didn't have to answer my phone on Fridays, Arjun." + pad(1),
  "SPEAKER 1: Let's pick that up right after the break.",
], expect: { "SPEAKER 1": "Delphine Mabry", "SPEAKER 2": "Arjun Telford", "SPEAKER 3": "Esperanza Ruelas" } });

add({ id: "K13", title: "second three-voice panel: two hosts and a guest, first names only aloud, all three full names only in the notes", L: {
  show: "Bench Notes",
  episodeTitle: "Two Hundred Meters from the Fissure",
  description: "Hosts Petra Lindgren-Osei and Hiroshi Vandermeer welcome volcanologist Leocadia Pruitt, just back from three weeks measuring gas on an erupting volcano in Iceland.",
}, lines: [
  "SPEAKER 1: Welcome to Bench Notes. Hiroshi, you have been bouncing in your chair all morning." + pad(1),
  "SPEAKER 2: Because our guest just got back from a volcano, Petra! An actual erupting volcano." + pad(1),
  "SPEAKER 1: Leocadia, welcome. How close did you actually get?",
  "SPEAKER 3: About two hundred meters from the active fissure, which sounds closer than it felt. The heat comes at you in waves." + pad(2),
  "SPEAKER 2: What were you measuring out there?" + pad(1),
  "SPEAKER 3: Gas, mostly. How much sulfur dioxide is coming out tells us how much magma is still on its way up." + pad(2),
  "SPEAKER 1: And did you sleep at all?",
  "SPEAKER 3: Four hours a night, in a tent that smelled like rotten eggs. I'd go back tomorrow." + pad(1),
], expect: { "SPEAKER 1": "Petra Lindgren-Osei", "SPEAKER 2": "Hiroshi Vandermeer", "SPEAKER 3": "Leocadia Pruitt" } });

add({ id: "K14", title: "host says only her first name (full name in the feed); guest named only in terse notes ('GUEST: X - role, city'), recorded in his workshop", L: {
  show: "Made by Hand",
  showPersons: [{ name: "Clementine Oyelaran", role: "host" }],
  episodeTitle: "Ep. 88 - Tick, Tock, Repeat",
  description: "GUEST: Florian Weisskopf - clock restorer, Cincinnati. TOPICS: fusee chains, the courthouse clock that took four years, apprenticeships. Recorded in his workshop.",
}, lines: [
  "SPEAKER 1: I'm Clementine, this is Made by Hand, and I'm surrounded by about two hundred clocks that are all ticking slightly out of sync." + pad(1),
  "SPEAKER 2: Slightly is generous. Give me a week with them." + pad(1),
  "SPEAKER 1: What's the oldest clock in this room?",
  "SPEAKER 2: The bracket clock by the window. London, around seventeen eighty. The owner's family carried it over on a ship, and it has been dropped at least twice since." + pad(2),
  "SPEAKER 1: And the one that took four years?" + pad(1),
  "SPEAKER 2: A tower movement from a courthouse in Kentucky. Half the gears had to be redrawn by hand and cut one tooth at a time." + pad(2),
  "SPEAKER 1: Do you take apprentices?",
  "SPEAKER 2: One at a time. It's about five years before I'd let someone open a fusee on their own." + pad(1),
], expect: { "SPEAKER 1": "Clementine Oyelaran", "SPEAKER 2": "Florian Weisskopf" } });

add({ id: "K15", title: "YouTube channel named for the host; guest named only in the video title ('ft. X'); interview in a truck cab", L: {
  show: "Nadia Khoury-Baines", channel: true,
  episodeTitle: "A day on the fire line (ft. Ravindra Kulkarni-Shaw)",
  description: "Riding along with a wildland firefighter during mop-up week on the east flank. Gear list and part two linked below.",
}, lines: [
  "SPEAKER 1: Okay, we're in the truck, it's five in the morning, and I've already been told I'm holding my coffee wrong. What's the plan today?" + pad(1),
  "SPEAKER 2: Mop-up on the east flank. We walk the line, feel for heat with the back of the hand, and dig out anything that's still smoking." + pad(2),
  "SPEAKER 1: With the back of your hand? Not a thermal camera?",
  "SPEAKER 2: We've got one. But the hand doesn't run out of batteries." + pad(1),
  "SPEAKER 1: How long have you been doing this?" + pad(1),
  "SPEAKER 2: This is my eleventh season. I started on a hand crew when I was nineteen and never figured out how to leave." + pad(2),
  "SPEAKER 1: Subscribe if you want to see part two, where I definitely do not fall into a ditch.",
], expect: { "SPEAKER 1": "Nadia Khoury-Baines", "SPEAKER 2": "Ravindra Kulkarni-Shaw" } });

add({ id: "K16", title: "HOST/GUEST labels; host known only from a '<Name> Studios' publisher; guest named only in the feed's episode people", L: {
  show: "Low Tide Stories", showAuthor: "Seraphina Vukovic Studios",
  episodeTitle: "The Keeper's Logbooks",
  description: "A retired lighthouse keeper reads from forty years of logbooks and remembers the night the fog signal failed.",
  episodePersons: [{ name: "Oskar Brandvold", role: "guest" }],
}, lines: [
  "HOST: This is Low Tide Stories. Today, a man who kept a lighthouse on Lake Superior for almost forty years, and he brought his logbooks." + pad(1),
  "GUEST: Eleven of them. My wife was glad to get them out of the closet." + pad(1),
  "HOST: Read me the first entry.",
  "GUEST: September third. Wind northwest, twenty knots. Lamp lit at seven-oh-two. Gull in the oil room again." + pad(1),
  "HOST: And the night the fog signal failed?" + pad(1),
  "GUEST: Nineteen eighty-four. I stood out on the gallery with a hand horn for six hours, one blast every thirty seconds, until the ore boat was past the shoal." + pad(2),
  "HOST: Thank you for bringing these, and for reading them to us.",
], expect: { "HOST": "Seraphina Vukovic", "GUEST": "Oskar Brandvold" } });

add({ id: "K17", title: "two co-hosts listed in the feed who address each other by first name only; no guest", L: {
  show: "Two Cups In",
  showPersons: [{ name: "Lucian Abernathy", role: "host" }, { name: "Wilhelmina Strand", role: "host" }],
  episodeTitle: "Is Decaf a Personality?",
  description: "The weekly coffee argument returns. This week: decaf, cold brew at home, and a listener's very strong opinion about oat milk.",
}, lines: [
  "SPEAKER 1: Welcome back to Two Cups In. Wilhelmina, I have something to confess. I switched to decaf." + pad(1),
  "SPEAKER 2: Lucian, no. We have been doing this show for four years." + pad(1),
  "SPEAKER 1: I was sleeping four hours a night!",
  "SPEAKER 2: That's not the coffee, that's your phone. Put the phone in the kitchen." + pad(1),
  "SPEAKER 1: Okay, listener email. This one is about oat milk." + pad(1),
  "SPEAKER 2: Oh, I saw this one. She used a lot of capital letters." + pad(1),
], expect: { "SPEAKER 1": "Lucian Abernathy", "SPEAKER 2": "Wilhelmina Strand" } });

add({ id: "K18", title: "host known only from a '<Name> Network' publisher; guest named only in the title ('- with X'); recorded inside a grain elevator", L: {
  show: "Prairie Hour", showAuthor: "Mateus Carvalho-Dunn Network",
  episodeTitle: "The One-Dollar Grain Elevator - with Kofi Ansah-Whitcombe",
  description: "He bought a 1950s grain elevator from the county for one dollar. Now he has to figure out what to do with it.",
}, lines: [
  "SPEAKER 1: We're about ninety feet up inside a grain elevator that hasn't held any grain since nineteen ninety-eight. My guest bought it from the county for one dollar. Is that true?" + pad(1),
  "SPEAKER 2: One dollar and about four hundred thousand dollars of repairs. But yes, the check said one dollar." + pad(1),
  "SPEAKER 1: What's it going to be?",
  "SPEAKER 2: A climbing gym on the bottom, apartments in the head house, and a little radio station up top, if the town lets me." + pad(2),
  "SPEAKER 1: Why this one?" + pad(1),
  "SPEAKER 2: Because I grew up staring at it out of the school bus window every morning for twelve years." + pad(2),
  "SPEAKER 1: Thanks for the tour. And thank you for not making me climb the ladder.",
], expect: { "SPEAKER 1": "Mateus Carvalho-Dunn", "SPEAKER 2": "Kofi Ansah-Whitcombe" } });

// ---------------------------------------------------------------------------
// Traps (L): the listing names someone who is not one of the voices.
// ---------------------------------------------------------------------------

add({ id: "L1", title: "notes describe the dead author at length; the guest voice is his translator, never named", L: {
  show: "Pages Across",
  showPersons: [{ name: "Rashida Okonjo", role: "host" }],
  episodeTitle: "Winter Harbor, Finally in English",
  description: "In 1962 Rasmus Kvaale published Winter Harbor, a slim novel about a lighthouse family that went on to sell two million copies in Norway. Kvaale, a former ferry mechanic, wrote it in longhand over three winters and refused every offer to have it translated. He died in 1990. This month it appears in English for the first time.",
}, lines: [
  "SPEAKER 1: Welcome to Pages Across, I'm Rashida Okonjo. My guest spent six years carrying one Norwegian novel into English, a book its author never wanted translated. Welcome." + pad(1),
  "SPEAKER 2: Thank you. And yes, I think about that every single day. He said no to everyone while he was alive." + pad(1),
  "SPEAKER 1: So why take it on?",
  "SPEAKER 2: Because I read it at nineteen in a library in Bergen and it rearranged me. In the end his grandchildren agreed. They wanted it read." + pad(2),
  "SPEAKER 1: What was hardest to carry over?" + pad(1),
  "SPEAKER 2: The weather words. Kvaale has nine words for sleet, and English has about one and a half." + pad(2),
  "SPEAKER 1: Did you ever meet him?",
  "SPEAKER 2: No. He died the year I started school. I only know him through his sentences." + pad(1),
], expect: { "SPEAKER 1": "Rashida Okonjo", "SPEAKER 2": null } });

add({ id: "L2", title: "notes describe a memoirist at length and credit the audiobook narrator in passing ('read by X'); the guest voice is the narrator", L: {
  show: "Listen Closely", showAuthor: "Quillfeather Audio",
  showPersons: [{ name: "Bao Tran Whitfield", role: "host" }],
  episodeTitle: "Fourteen Hours in the Booth",
  description: "Hollow Pines, Clara Vossberg's memoir of growing up in a Montana logging camp in the 1950s, is out in audio this week, read by Tavish McAllister. Vossberg, now 81, still lives in the camp's old cookhouse, has never owned a television, and wrote the book longhand on the backs of feed-store receipts. Her earlier books include Sawdust Psalms and The Cookhouse Year.",
}, lines: [
  "SPEAKER 1: On Listen Closely this week, the voice behind fourteen hours of a memoir about a Montana logging camp. Thanks for coming in." + pad(1),
  "SPEAKER 2: Thanks for having me. It's strange to talk in my own voice instead of the book's." + pad(1),
  "SPEAKER 1: How do you get ready to narrate somebody else's childhood?",
  "SPEAKER 2: I read it three times before I recorded a word. The second time through I marked every name, every saw, every mule, so I wouldn't stumble in the booth." + pad(2),
  "SPEAKER 1: Did you ever talk to her?" + pad(1),
  "SPEAKER 2: Once, on the phone. She told me to slow down, and to say creek the way her father did. Crick." + pad(2),
  "SPEAKER 1: And the hardest chapter to read aloud?",
  "SPEAKER 2: The fire. I had to stop the session twice." + pad(1),
], expect: { "SPEAKER 1": "Bao Tran Whitfield", "SPEAKER 2": "Tavish McAllister" } });

add({ id: "L3", title: "episode title names the historical figure the episode is about; the guest is an unnamed local historian", L: {
  show: "The Frozen Past",
  showPersons: [{ name: "Ingrid Sandvold", role: "host" }],
  episodeTitle: "Bartholomew Crane and the Great Ice Harvest of 1888",
  description: "Every January, Bartholomew Crane put four hundred men on the frozen lake with saws and horses and shipped Wisconsin ice as far as New Orleans. A local historian walks us through the ledgers he left behind.",
}, lines: [
  "SPEAKER 1: This is The Frozen Past, I'm Ingrid Sandvold, and I'm on the shore of a lake that used to be a factory floor every January. Thanks for meeting me out here in the cold." + pad(1),
  "SPEAKER 2: This is nothing. Crane's men were out here at twenty below with hand saws." + pad(1),
  "SPEAKER 1: Who was he, really?",
  "SPEAKER 2: A grocer's son from Ohio who figured out that cold was a crop. His ledgers are in the county museum, and I have spent eight years reading them." + pad(2),
  "SPEAKER 1: What surprised you in the ledgers?" + pad(1),
  "SPEAKER 2: How much more he spent feeding the horses than paying the men. And the notes in the margins. He complained about the weather like it owed him money." + pad(2),
  "SPEAKER 1: Did the family stay in the ice business?",
  "SPEAKER 2: Until refrigeration finished it in the twenties. His great-granddaughter still lives in town, actually. She lent me his pocket watch for the exhibit." + pad(1),
], expect: { "SPEAKER 1": "Ingrid Sandvold", "SPEAKER 2": null } });

add({ id: "L4", title: "notes credit a producer, an editor and 'music by'; the guest, a retired mail carrier, is never named, and the host thanks the producer and editor in the third person", L: {
  show: "Rural Route 9", showAuthor: "Prairie Wire Audio",
  showPersons: [{ name: "Augustin Pellerin", role: "host" }],
  episodeTitle: "Thirty-One Years on the Gravel",
  description: "A retired rural mail carrier remembers thirty-one years of gravel roads, snow drifts, and the dog that waited for her every afternoon. Produced by Gwendolyn Marsh-Abiodun. Edited by Pascal Rydberg. Music by Ruby Tamsin-Ash.",
}, lines: [
  "SPEAKER 1: On Rural Route 9 today, a woman who drove the same hundred and twelve miles of gravel six days a week for thirty-one years. Welcome." + pad(1),
  "SPEAKER 2: Thank you. It's nice to be asked about it. Most people just ask if I miss it." + pad(1),
  "SPEAKER 1: Do you?",
  "SPEAKER 2: The road, no. The people, every day. There was a farmer who left a thermos of coffee in his mailbox for me every January morning." + pad(2),
  "SPEAKER 1: Tell me about the dog." + pad(1),
  "SPEAKER 2: A big shepherd mix named Biscuit. He met my car at the same culvert every afternoon for nine years." + pad(2),
  "SPEAKER 1: Thank you for this. And thanks, as always, to Gwendolyn for producing and to Pascal for the edit.",
], expect: { "SPEAKER 1": "Augustin Pellerin", "SPEAKER 2": null } });

add({ id: "L5", title: "notes dwell on the guest's late husband; the voice is his widow, whom the notes also name", L: {
  show: "Delta Voices",
  showPersons: [{ name: "Silas Amankwah", role: "host" }],
  episodeTitle: "Remembering Harold Pennington, Crop Duster",
  description: "Harold Pennington (1936-2025) flew crop dusters over the Mississippi Delta for forty years, survived two crash landings, and built the grass airstrip that still carries his name. He taught half the pilots in Bolivar County to fly. His wife of fifty-one years, Ruth Pennington, joins us from the farm to remember him.",
}, lines: [
  "SPEAKER 1: This is Delta Voices, I'm Silas Amankwah, and today we remember a man who spent forty years about ten feet above the cotton. His wife is with me from their farm. Thank you for doing this." + pad(1),
  "SPEAKER 2: Thank you for asking. Harold would have hated the attention and loved every minute of it." + pad(1),
  "SPEAKER 1: How did the two of you meet?",
  "SPEAKER 2: He set down in my daddy's bean field in nineteen seventy-three because his engine quit. I carried him out a glass of tea and he stayed for supper." + pad(2),
  "SPEAKER 1: And the airstrip, how did that come about?" + pad(1),
  "SPEAKER 2: We cleared it ourselves, the two of us and a borrowed tractor. I drove and he pulled stumps." + pad(2),
  "SPEAKER 1: What do you miss most?",
  "SPEAKER 2: Hearing the plane come in at dusk. I still listen for it." + pad(1),
], expect: { "SPEAKER 1": "Silas Amankwah", "SPEAKER 2": "Ruth Pennington" } });

add({ id: "L6", title: "notes describe the guest's late mentor at length; the guest introduces herself by full name mid-conversation", L: {
  show: "Score and Story",
  showPersons: [{ name: "Noor Halabi-Grant", role: "host" }],
  episodeTitle: "Ambrose Kettering, 1931-2026",
  description: "Ambrose Kettering taught composition at the conservatory for forty-one years and wrote the scores for more than sixty films, including the cult western Dust Choir. Known for red ink, long walks and longer letters, he shaped a generation of film composers. One of his last students remembers him.",
}, lines: [
  "SPEAKER 1: Welcome to Score and Story. Today, a remembrance. My guest studied with him for six years and still has a drawer full of his letters." + pad(1),
  "SPEAKER 2: Two drawers, actually. And I should say who I am, since people only ever introduce me as his student. I'm Beatriz Aldana, and I write music for video games now." + pad(2),
  "SPEAKER 1: Beatriz, what was a lesson with him like?",
  "SPEAKER 2: You'd bring in eight bars, he'd cover them in red ink, and then he'd take you for a walk around the reservoir and never mention them once." + pad(2),
  "SPEAKER 1: Was he kind?" + pad(1),
  "SPEAKER 2: Not gentle. Kind. There's a difference, and he taught me that too." + pad(1),
  "SPEAKER 1: Thank you, Beatriz.",
], expect: { "SPEAKER 1": "Noor Halabi-Grant", "SPEAKER 2": "Beatriz Aldana" } });

add({ id: "L7", title: "notes name the film star the guest once cooked for; the guest herself is never named", L: {
  show: "Counter Culture",
  showPersons: [{ name: "Hamish Teague", role: "host" }],
  episodeTitle: "From Hollywood Kitchens to a Tulsa Lunch Counter",
  description: "For twelve years she was personal chef to film star Valentina Moreau-Grey, cooking on yachts, on sets and on a private island. Moreau-Grey, star of the Midnight Courier films, famously ate the same breakfast every day for a decade. Now her former chef runs an eight-stool lunch counter in Tulsa and won't make that breakfast for anyone.",
}, lines: [
  "SPEAKER 1: Welcome to Counter Culture, I'm Hamish Teague. I'm sitting at an eight-stool lunch counter in Tulsa, and the woman behind it used to cook on yachts. Thanks for squeezing me in between orders." + pad(1),
  "SPEAKER 2: You've got until the lunch crowd. After that you're washing dishes." + pad(1),
  "SPEAKER 1: Twelve years cooking for a movie star. What was that like?",
  "SPEAKER 2: Valentina was lovely to me. Demanding, but lovely. I made her the same egg-white thing every morning for ten years and she never once got tired of it. I did." + pad(2),
  "SPEAKER 1: Why did you leave?" + pad(1),
  "SPEAKER 2: My mother got sick and I came home. Then this place came up for sale, and I thought, nobody here cares who I used to cook for." + pad(2),
  "SPEAKER 1: Will you make me the famous breakfast?",
  "SPEAKER 2: Absolutely not. You can have the meatloaf." + pad(1),
], expect: { "SPEAKER 1": "Hamish Teague", "SPEAKER 2": null } });

add({ id: "L8", title: "regular host away; a guest interviewer from another outlet (first name only) conducts the interview while the stale notes still credit the regular host", L: {
  show: "The Long Table",
  showPersons: [{ name: "Fenna Brouwer", role: "host" }],
  episodeTitle: "Clay, Fire and Patience",
  description: "Fenna Brouwer talks with ceramicist Odalys Ferreira about wood-firing, failure, and the kiln she built from salvaged bricks.",
}, lines: [
  "SPEAKER 1: Hello and welcome to The Long Table. Fenna is away this month, so you're stuck with me. I'm Jonas, I usually write about food for the Harbor Ledger, and I begged to do this one." + pad(1),
  "SPEAKER 2: Well, I'm glad you begged. Fenna warned me you'd ask about the bricks first." + pad(1),
  "SPEAKER 1: She was right. Where did they come from?",
  "SPEAKER 2: An old brewery they knocked down by the river. I hauled about four thousand of them in my uncle's pickup." + pad(2),
  "SPEAKER 1: And a wood firing takes how long?" + pad(1),
  "SPEAKER 2: Four days of stoking, around the clock. My friends take shifts. We eat a lot of soup." + pad(2),
  "SPEAKER 1: Last question. What does failure look like in a kiln?",
  "SPEAKER 2: A whole shelf of pots slumped together like they fell asleep. You learn to love some of them." + pad(1),
], expect: { "SPEAKER 1": { not: "Fenna Brouwer" }, "SPEAKER 2": "Odalys Ferreira" } });

add({ id: "L9", title: "feed lists last week's guest by mistake; the host mentions him as last week's guest and introduces a different person by full name", L: {
  show: "Open Throttle",
  showPersons: [{ name: "Rhys Kaltenbach", role: "host" }],
  episodePersons: [{ name: "Cyrus Haldane", role: "guest" }],
  episodeTitle: "Episode 57",
  description: "Cyrus Haldane, former equipment manager for three minor-league hockey teams, on the strange economics of the sport.",
}, lines: [
  "SPEAKER 1: Welcome to Open Throttle, I'm Rhys Kaltenbach. Quick note: last week's episode with Cyrus Haldane got more mail than anything we've ever done, so thank you, and yes, he'll be back. This week, something completely different. My guest restores vintage motorcycles in a converted dairy barn. Please welcome Priyanka Sethuraman." + pad(1),
  "SPEAKER 2: Thanks, Rhys. Happy to be here, although I should warn you I know nothing about hockey." + pad(1),
  "SPEAKER 1: Nobody's going to ask you to. What's up on the lift right now?",
  "SPEAKER 2: A nineteen sixty-six twin that arrived in three cardboard boxes and a laundry basket." + pad(2),
  "SPEAKER 1: How long will that one take?" + pad(1),
  "SPEAKER 2: If the parts gods are kind, about a year. They are usually not kind." + pad(2),
  "SPEAKER 1: Priyanka, how did you get into this?",
  "SPEAKER 2: My dad had one in the garage that never ran. I got it running when I was sixteen, and that was it for me." + pad(1),
], expect: { "SPEAKER 1": "Rhys Kaltenbach", "SPEAKER 2": "Priyanka Sethuraman" } });

add({ id: "L10", title: "notes name the politician heard only in a played clip; the voice answering questions is an unnamed reporter", L: {
  show: "Pothole Report",
  showPersons: [{ name: "Constance Ebright", role: "host" }],
  episodeTitle: "The Pothole Promise, Five Years Later",
  description: "In 2021 Mayor Dunstan Okwu stood before the city council and promised to fill every pothole in the city within two years. We play his speech and ask a reporter who covered city hall that year what actually happened.",
}, lines: [
  "SPEAKER 1: This is Pothole Report, I'm Constance Ebright. Five years ago this month, our mayor made a promise. Let's hear it." + pad(1),
  "CLIP 1: I am telling you tonight, every pothole in this city will be filled within two years. Every single one. Hold me to it.",
  "SPEAKER 1: My guest was in the room that night, covering city hall for the paper. What did you think when you heard it?",
  "SPEAKER 2: I thought, that is a great line and a terrible plan. There were about forty thousand open pothole reports on the books that winter." + pad(2),
  "SPEAKER 1: So what actually happened?" + pad(1),
  "SPEAKER 2: They filled about half. Then the budget fight hit, the crews were cut, and nobody said the word pothole at a press conference again." + pad(2),
  "SPEAKER 1: Did you ever ask him about it?",
  "SPEAKER 2: Twice. The second time he laughed and told me I should run for mayor." + pad(1),
], expect: { "SPEAKER 1": "Constance Ebright", "SPEAKER 2": null } });

add({ id: "L11", title: "call-in show: a caller shares the guest's surname ('not related'); each voice keeps its own name", L: {
  show: "The Potting Bench",
  showPersons: [{ name: "Morley Atwater", role: "host" }],
  episodeTitle: "Fall Bulbs, Your Questions",
  description: "Master gardener Philippa Gorringe of the county extension office takes your calls on tulips, garlic, and what to do with all those leaves.",
}, lines: [
  "SPEAKER 1: Good morning, this is The Potting Bench and I'm Morley Atwater. In the studio with me from the county extension office, master gardener Philippa Gorringe. Philippa, the phones are already full." + pad(1),
  "SPEAKER 2: Wonderful. Fall bulbs bring everybody out of the woodwork." + pad(1),
  "SPEAKER 1: First caller, you're on The Potting Bench.",
  "SPEAKER 3: Hi Philippa, hi Morley. This is Tom Gorringe calling from Elkhart, and before anybody asks, no, we are not related." + pad(1),
  "SPEAKER 2: Not as far as I know, Tom! What's your question?",
  "SPEAKER 3: Squirrels dig up my tulip bulbs the day after I plant them. Every single year." + pad(1),
  "SPEAKER 2: Plant them a little deeper, about eight inches, and lay chicken wire over the bed for the first few weeks. Or switch to daffodils. Squirrels can't stand them." + pad(2),
  "SPEAKER 3: Daffodils it is. Thank you both.",
], expect: { "SPEAKER 1": "Morley Atwater", "SPEAKER 2": "Philippa Gorringe", "SPEAKER 3": "Tom Gorringe" } });

add({ id: "L12", title: "title and notes name the booked guest; a colleague substitutes and is introduced by full name", L: {
  show: "Groundwater",
  showPersons: [{ name: "Vesna Odegaard", role: "host" }],
  episodeTitle: "Ep. 140: Hydrologist Anselm Achterberg on the Ogallala",
  description: "Hydrologist Anselm Achterberg has spent twenty years measuring how fast the Ogallala Aquifer is dropping under western Kansas. He explains what happens to a town when the wells go dry.",
}, lines: [
  "SPEAKER 1: Welcome to Groundwater, I'm Vesna Odegaard. Change of plans today. Anselm had a family emergency this morning, everyone's okay, but his colleague from the state survey office kindly agreed to step in on two hours' notice. Welcome, Zofia Krawczyk." + pad(1),
  "SPEAKER 2: Thanks, Vesna. Anselm sends his apologies, and he made me promise to talk about the well in Scott County." + pad(1),
  "SPEAKER 1: Then let's start there.",
  "SPEAKER 2: It's a monitoring well we've measured every January since nineteen sixty-five. The water has dropped about sixty feet." + pad(2),
  "SPEAKER 1: What happens to a town when the wells go dry?" + pad(1),
  "SPEAKER 2: First the irrigated corn goes, then the seed dealer, then the school consolidates. It's slow, and then it's very fast." + pad(2),
  "SPEAKER 1: Zofia, thank you for jumping in.",
], expect: { "SPEAKER 1": "Vesna Odegaard", "SPEAKER 2": "Zofia Krawczyk" } });

add({ id: "L13", title: "fill-in host opens with a joking 'I'm not Bob' and gives only his first name, while the show name and feed name Bob as host; callers unnamed", L: {
  show: "The Saturday Trading Post with Bob Pfannenstiel",
  showPersons: [{ name: "Bob Pfannenstiel", role: "host" }],
  episodeTitle: "Trading Post, October 3",
  description: "Bob takes your calls: buy, sell, trade. Riding mowers, firewood, and one very large aquarium.",
}, lines: [
  "SPEAKER 1: Good morning and welcome to the Saturday Trading Post. And no, folks, I'm not Bob, sorry to disappoint. Bob is at his granddaughter's wedding in Duluth, so you've got me, Gus, his neighbor from two doors down, for one morning only. Lines are open." + pad(1),
  "SPEAKER 2: Oh, Bob's not there? Well, okay. I've got a riding mower for sale, runs good, needs a new seat." + pad(1),
  "SPEAKER 1: What are you asking for it?",
  "SPEAKER 2: Three hundred, or I'd trade it for a cord of seasoned oak." + pad(1),
  "SPEAKER 1: Folks, a riding mower for three hundred or a cord of oak. Next caller, go ahead.",
  "SPEAKER 3: Morning. Tell Bob congratulations from the whole bowling league. And I've got a hundred-gallon aquarium, free to anybody with a truck." + pad(1),
  "SPEAKER 1: I'll pass that along. A free aquarium, bring a truck and two friends.",
], expect: { "SPEAKER 1": { not: "Bob Pfannenstiel" }, "SPEAKER 2": null, "SPEAKER 3": null } });

add({ id: "L14", title: "the listed host jokes 'I'm not Bob' to a caller, then says it really is him: he is still Bob", L: {
  show: "The Fix-It Hour",
  showPersons: [{ name: "Bob Kettleson", role: "host" }],
  episodeTitle: "Hums But Won't Spin",
  description: "Bob Kettleson answers your household repair questions live: a humming garbage disposal, a sticky sliding door, and the eternal mystery of the running toilet.",
}, lines: [
  "SPEAKER 1: You're on the Fix-It Hour, go ahead.",
  "SPEAKER 2: Oh my goodness, is this actually Bob? You sound so much younger than I pictured." + pad(1),
  "SPEAKER 1: Nope, I'm not Bob, Bob's much better looking. I'm kidding, ma'am, it's me, it's Bob, twenty-two years on this microphone. What's broken?" + pad(1),
  "SPEAKER 2: My garbage disposal hums, but it won't spin." + pad(1),
  "SPEAKER 1: Okay. Unplug it first. Then look underneath for a little hex socket dead center on the bottom and work it back and forth with an Allen wrench. Something's jammed in there." + pad(2),
  "SPEAKER 2: There's a hole there? I never noticed that in fifteen years.",
  "SPEAKER 1: Nobody does. Call me back if it still hums." + pad(1),
], expect: { "SPEAKER 1": "Bob Kettleson", "SPEAKER 2": null } });

add({ id: "L15", title: "listing names two guests; the second is stuck in traffic, so the lone guest voice is the other listed guest (never named aloud)", L: {
  show: "Gridlock",
  showPersons: [{ name: "Anouk Verhaegen", role: "host" }],
  episodePersons: [{ name: "Hiroko Bastable", role: "guest" }, { name: "Emeka Ludlow-Price", role: "guest" }],
  episodeTitle: "Should We Pay to Drive Downtown?",
  description: "Urban planners Hiroko Bastable and Emeka Ludlow-Price debate congestion pricing: who pays, who benefits, and whether it could ever pass here.",
}, lines: [
  "SPEAKER 1: Welcome to Gridlock, I'm Anouk Verhaegen. We were supposed to have two planners with us today, and one of them is currently stuck in traffic on the interstate, which is honestly the most on-topic thing that has ever happened on this show." + pad(1),
  "SPEAKER 2: He just texted me a photo of brake lights. Emeka says to start without him, and that he disagrees with whatever I'm about to say." + pad(1),
  "SPEAKER 1: Perfect. Then make the case for pricing while he can't interrupt.",
  "SPEAKER 2: Road space downtown is the most valuable land in the city, and we hand it out for free at the worst possible hour. Charge a little at the peak and the traffic thins out." + pad(2),
  "SPEAKER 1: Who gets hurt?" + pad(1),
  "SPEAKER 2: Night-shift workers and tradespeople, if you design it badly. So you exempt them, and you put the money into buses." + pad(2),
  "SPEAKER 1: We'll see if Emeka makes it in before the end of the hour.",
], expect: { "SPEAKER 1": "Anouk Verhaegen", "SPEAKER 2": "Hiroko Bastable" } });

add({ id: "L16", title: "title and notes name a guest who is still off-mic; the second voice is the host's unnamed co-host", L: {
  show: "Long Run Home",
  showPersons: [{ name: "Ignatius Corrigan", role: "host" }],
  episodeTitle: "Saskia Brennan-Oduya and the 200-Mile Week",
  description: "Saskia Brennan-Oduya ran 200 miles across the Mojave in five days on a broken toe. She tells us how, and why she's going back next year.",
}, lines: [
  "SPEAKER 1: Welcome to Long Run Home, I'm Ignatius Corrigan, and as usual my co-host is across the table eating my trail mix." + pad(1),
  "SPEAKER 2: It's communal trail mix. It says so right on the bag. Hi, everybody." + pad(1),
  "SPEAKER 1: Big show today. Our guest ran two hundred miles across the desert on a broken toe.",
  "SPEAKER 2: Which I still don't believe, by the way. I broke a toe on a coffee table once and cancelled Christmas." + pad(1),
  "SPEAKER 1: She's in the other room getting her mic on, so before we bring her in, listener mail. Want to read it?" + pad(1),
  "SPEAKER 2: This one's from a runner in Spokane who wants to know if either of us has ever actually finished a hundred-miler. Ignatius, do you want to take that one, or should I?" + pad(1),
  "SPEAKER 1: We'll answer that after the interview. Stay with us.",
], expect: { "SPEAKER 1": "Ignatius Corrigan", "SPEAKER 2": { not: "Saskia Brennan-Oduya" } } });

add({ id: "L17", title: "feed author is the show's retired founder; the hosting voice is his daughter, called only by her first name", L: {
  show: "The Ellsworth Almanac", showAuthor: "Harlan Ellsworth",
  episodeTitle: "First Frost",
  description: "Frost dates, woodstove season, and the persimmon-seed winter forecast, settled once and for all by a local grower.",
}, lines: [
  "SPEAKER 1: Good morning, this is The Ellsworth Almanac. Dad started this show in nineteen seventy-four and handed me the microphone six years ago when he retired, and he still calls after every episode to tell me what I got wrong. Today, first frost and the persimmon question. With me is a woman who has grown persimmons in this county for thirty years." + pad(1),
  "SPEAKER 2: And I'm about to disappoint your listeners. A persimmon seed doesn't know a thing about winter." + pad(1),
  "SPEAKER 1: Oh no. Dad swears by it.",
  "SPEAKER 2: I know he does. Harlan has been arguing with me about it at the feed store since before you were born, June." + pad(2),
  "SPEAKER 1: So what does predict the winter?" + pad(1),
  "SPEAKER 2: Nothing on the tree. Read the long-range outlook and buy your firewood in August." + pad(1),
  "SPEAKER 1: Dad, if you're listening, I'm sorry.",
], expect: { "SPEAKER 1": { not: "Harlan Ellsworth" }, "SPEAKER 2": null } });

add({ id: "L18", title: "title and notes name a 1918 soldier whose letter is read aloud as a QUOTE turn; the archivist guest is never named", L: {
  show: "Dear Home",
  showPersons: [{ name: "Augusta Ferrante", role: "host" }],
  episodeTitle: "Letters from Private Elias Thornbury, 1918",
  description: "Private Elias Thornbury wrote 212 letters home to his little sister in Muncie from training camp and the trenches of France. We read from them with the archivist who catalogued the collection.",
}, lines: [
  "SPEAKER 1: This is Dear Home, I'm Augusta Ferrante. Today, a farm boy from Indiana writing to his little sister from the war. Here's the first letter, from April of nineteen eighteen." + pad(1),
  "QUOTE 1: Dear Nell, the food here is worse than Aunt Ida's and the sergeant snores like the hog barn. Tell Mother I am well and do not send socks, I have nine pair.",
  "SPEAKER 1: My guest catalogued all two hundred and twelve of these letters. What struck you first?",
  "SPEAKER 2: How funny he was. People expect war letters to be grim, and his are, later, but in the spring of nineteen eighteen he mostly complains about the food." + pad(2),
  "SPEAKER 1: And later?" + pad(1),
  "SPEAKER 2: By September the jokes stop. The handwriting gets smaller. He starts asking about the farm in a lot of detail, like he's trying to stand in it." + pad(2),
  "SPEAKER 1: Did he come home?",
  "SPEAKER 2: He did. He farmed outside Muncie until nineteen sixty. His sister kept every letter in a hatbox under her bed." + pad(1),
], expect: { "SPEAKER 1": "Augusta Ferrante", "SPEAKER 2": null } });

module.exports = { S };
