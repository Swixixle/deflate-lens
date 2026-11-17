"use strict";
/* The ninth set (0.14.2): a sixth independent review, written black-box after that repair: 20 ordinary openings (guests greeted only by a calling, Rabbi, Pastor, Coach, Judge, Senator, Sister, Professor, and named only in the notes; a host known only from a publisher named after her; guests named only in the notes or the title, in many phrasings; captions; a panel; a caller; a nickname) and 20 traps (fill-in hosts, a remembered relative, a guest heard only in a clip, shared first names, read-aloud letters, a priest and a deacon, someone who declined, a substitute, a lecture series named after someone absent, a next-week teaser). Its first measurement, with the model's reading: no wrong name, 28 missed, nearly all guests whom no one names aloud. That led to the guest the listing names being named by both readers (resolveNames).
   identify-answers-9.json holds, for each scenario, a model's answer to the exact identification prompt, recorded once
   from a proxy (Claude Sonnet answering each prompt blind, with no view of these expectations). Invented people and shows
   only; no real transcripts, no lyrics.
   expect: { KEY: "Name" | null | { not: "Name" } | { oneOf: [...] } }: what a careful human concludes from the words
   and the listing (the reviewer's own, unchanged). */
const { pad } = require("./identify-pad");
const S = [];
const add = s => S.push(s);

add({ id: "G1", title: "rabbi addressed only as 'Rabbi'; the notes name and describe her; she speaks of her own work as a rabbi", L: { show: "Small Hours", showAuthor: "Ingrid Solvang", episodeTitle: "What Mourning Asks of Us", description: "Rabbi Talia Brenner has led Congregation Beit Tamar in Dayton, Ohio, for twenty years and has sat with hundreds of grieving families. She talks about shiva, casseroles, and what people should stop saying at funerals." }, lines: [
  "SPEAKER 1: This is Small Hours. I'm Ingrid Solvang, and tonight we're talking about grief, and especially about that strange stretch after a funeral when the casseroles stop arriving. Rabbi, thank you for coming in on a Sunday night." + pad(1),
  "SPEAKER 2: Thank you for having me, Ingrid. Sunday nights are when my phone rings anyway, so I'm used to being awake." + pad(1),
  "SPEAKER 1: Let's start with that phone. Who's calling you?",
  "SPEAKER 2: Mostly people from my congregation, sometimes their neighbors. As a rabbi, I've learned that the first week after a death is crowded and the second month is empty, and the empty part is where people really need company." + pad(2),
  "SPEAKER 1: And shiva is built for the crowded part." + pad(1),
  "SPEAKER 2: It is. When I sit with a family during shiva, I tell them the tradition gives them seven days of permission to do nothing. Then I try to come back on day thirty, when nobody else does." + pad(2),
  "SPEAKER 1: Day thirty. I like that very much." + pad(1),
], expect: { "SPEAKER 1": "Ingrid Solvang", "SPEAKER 2": "Talia Brenner" } });

add({ id: "G2", title: "pastor addressed only as 'Pastor', named in the notes; an ad read sits in the middle of the interview", L: { show: "Steeple & Street", showAuthor: "Corinne Mabry", episodeTitle: "The Church That Opened a Laundromat", description: "Pastor Delroy Haskins has led Cedar Gate Missionary Baptist Church in Gary, Indiana, since 2004. When the last laundromat on his block closed, his congregation bought the machines. He tells Corinne how a church became the neighborhood's wash day." }, lines: [
  "SPEAKER 1: Welcome to Steeple & Street, where faith meets the sidewalk. I'm Corinne Mabry. My guest has been preaching on the same corner in Gary for twenty years. Pastor, welcome." + pad(1),
  "SPEAKER 2: Thank you, Corinne. It's good to be here, and I promise not to preach too long." + pad(1),
  "SPEAKER 1: No promises needed. Tell me about the laundromat.",
  "SPEAKER 2: When the last one on our block closed, I watched mothers carrying laundry baskets onto the city bus. As a pastor, you can only preach about loving your neighbor so many Sundays before somebody asks what you're doing about it. So we bought the machines." + pad(2),
  "AD 1: Steeple & Street is supported by Ridgeway Mutual Insurance. Your home, your car, even the church van. Ridgeway Mutual has you covered. Get a quote today at ridgeway mutual dot com.",
  "SPEAKER 1: And we're back. Pastor, how did your deacons take it when you proposed buying twelve washing machines?" + pad(1),
  "SPEAKER 2: Some of them thought I'd lost my mind, and one of them still reminds me at every board meeting. But my job as pastor is to get the church out of the building, and the laundry got us out." + pad(2),
  "SPEAKER 1: That might be the best answer anyone has ever given on this show." + pad(1),
], expect: { "SPEAKER 1": "Corinne Mabry", "SPEAKER 2": "Delroy Haskins" } });

add({ id: "G3", title: "coach addressed only as 'Coach', named in the notes; a clip of her old halftime speech plays before she speaks", L: { show: "Back of the Bus", showAuthor: "Harrow Valley Public Radio", episodeTitle: "Save Each Other", description: "Coach Rosalind Pickett won four state titles with the Elmwood High girls' basketball team before retiring in 2019. She talks about the 1998 halftime speech her players still quote, and why she never once yelled at a referee." }, lines: [
  "SPEAKER 1: From Harrow Valley Public Radio, this is Back of the Bus. I'm Marcus Tilden. Before we bring in my guest, here's a piece of tape that people in Elmwood can still recite word for word." + pad(1),
  "CLIP 1: Nobody in this gym is coming to save you. You save each other. Now go out there and save each other.",
  "SPEAKER 1: Coach, that was you in nineteen ninety-eight. Do you remember saying it?",
  "SPEAKER 2: I remember being terrified when I said it. We were down eleven at the half, and I had no idea what I was doing. When I was coaching, I never planned those speeches. They came out of whatever I was scared of that night." + pad(2),
  "SPEAKER 1: Did you know somebody was recording?",
  "SPEAKER 2: Not a clue. One of the dads had a camcorder on his shoulder. I found out twenty years later, when a former player played it at my retirement party, and I cried in front of the whole booster club." + pad(2),
  "SPEAKER 1: Coach, I have to ask about the referees." + pad(1),
  "SPEAKER 2: My girls knew the rule. Thirty-one seasons on the sideline and I never yelled at a referee once, because if I lost my head, I couldn't ask them to keep theirs." + pad(1),
], expect: { "SPEAKER 1": "Marcus Tilden", "SPEAKER 2": "Rosalind Pickett" } });

add({ id: "G4", title: "cold open: the judge speaks first (so she is SPEAKER 1); she is addressed only as 'Judge' and named in the notes", L: { show: "Bench & Bar", showAuthor: "Harrow Valley Public Radio", episodeTitle: "The Sentence I Still Think About", description: "Retired circuit judge Lorraine Abernathy-Cole served twenty-six years on the bench. She talks with Hollis Pemberton about the first sentence she ever handed down, about mercy, and about what judges don't say out loud." }, lines: [
  "SPEAKER 1: The first time I sent a man to prison, I drove home and sat in my car in the driveway for an hour. I couldn't make myself go inside." + pad(1),
  "SPEAKER 2: From Harrow Valley Public Radio, this is Bench & Bar. I'm Hollis Pemberton. Judge, that's where I want to start. The driveway." + pad(1),
  "SPEAKER 1: It's a strange thing to admit. From the bench, you're supposed to look certain. I had been a judge for exactly nine days, and I was not certain of anything." + pad(2),
  "SPEAKER 2: Did it get easier?",
  "SPEAKER 1: It got quieter. I never let it get easier. In twenty-six years as a judge, I made it a rule to read every letter a family sent me before a sentencing, even when there were forty of them." + pad(2),
  "SPEAKER 2: Forty letters." + pad(1),
  "SPEAKER 1: Forty-three, once. My clerk thought I'd lost my mind." + pad(1),
], expect: { "SPEAKER 1": "Lorraine Abernathy-Cole", "SPEAKER 2": "Hollis Pemberton" } });

add({ id: "G5", title: "senator addressed only as 'Senator', named and described in the notes; he speaks of his own Senate work", L: { show: "Statehouse Weekly", showAuthor: "Naomi Fairbanks-Oduya", episodeTitle: "The Broadband Map Nobody Trusts", description: "State Senator Gideon Marchetti chairs the Senate Utilities Committee and grew up on a dairy farm outside Peru, Indiana. Why does the state's broadband map show coverage where there isn't any?" }, lines: [
  "SPEAKER 1: Welcome to Statehouse Weekly. I'm Naomi Fairbanks-Oduya. If you live in rural Indiana, you may have been told you have high-speed internet when you can barely load an email. My guest says the map is wrong. Senator, welcome." + pad(1),
  "SPEAKER 2: Thanks, Naomi. Glad to be here, and yes, the map is wrong." + pad(1),
  "SPEAKER 1: How wrong?",
  "SPEAKER 2: My own mother's farm shows up as served, and she can't stream a church service. When I got to the Senate, I figured that was a fluke. Then I started hearing it in every county I visited." + pad(2),
  "SPEAKER 1: You chair the committee that oversees this. Why hasn't it been fixed?" + pad(1),
  "SPEAKER 2: Because the maps come from the providers. As chairman I can hold hearings and ask hard questions, but in the Senate we've basically been grading the homework with an answer key the students wrote." + pad(2),
  "SPEAKER 1: You've used that line before.",
  "SPEAKER 2: A few times. It keeps being true." + pad(1),
], expect: { "SPEAKER 1": "Naomi Fairbanks-Oduya", "SPEAKER 2": "Gideon Marchetti" } });

add({ id: "G6", title: "all-lower-case caption transcript with no punctuation; a sister addressed only as 'sister', named in the notes", L: { show: "Steeple & Street", showAuthor: "Corinne Mabry", episodeTitle: "The Hospice Garden", description: "Sister Bernadette Okwuosa, a Benedictine sister and hospice chaplain since 2011, started a vegetable garden behind the hospice. Patients plant seeds they know they won't see harvested." }, lines: [
  "SPEAKER 1: welcome back to steeple and street im corinne mabry and today were recording in a garden which is a first for us sister thank you for having us out here",
  "SPEAKER 2: oh you are very welcome corinne mind the tomatoes they are taking over this year i planted too many again",
  "SPEAKER 1: how did this garden start",
  "SPEAKER 2: well as a sister in my community i made a vow of stability which means i stay put and when i became chaplain here i noticed the patients missed dirt more than almost anything they missed having their hands in the ground so we dug up the strip behind the parking lot",
  "SPEAKER 1: and the patients plant things they know they wont see grow",
  "SPEAKER 2: many of them yes a man last spring planted these beans and he knew he would not be here in july and he told me sister thats fine somebody else gets to eat them",
  "SPEAKER 1: thats beautiful",
  "SPEAKER 2: in my years as a chaplain and as a sister i have learned that people want to leave something growing behind them",
], expect: { "SPEAKER 1": "Corinne Mabry", "SPEAKER 2": "Bernadette Okwuosa" } });

add({ id: "G7", title: "notes say 'Featuring Professor <Name>'; the guest is addressed only as 'Professor' and talks about his lab and students", L: { show: "Understory", showAuthor: "Understory Media", episodeTitle: "Fifteen Springs on One Mountain", description: "Featuring Professor Anselm Ruiz-Takeda, an entomologist at Northfield State University who has counted bumblebees on the same mountainside for fifteen years." }, lines: [
  "SPEAKER 1: This is Understory. I'm Bastian Leclair. Today, bumblebees, and one very patient scientist. Professor, you've counted bees on the same mountain for fifteen years. Why that mountain?" + pad(1),
  "SPEAKER 2: Mostly because it was close to campus and I didn't have a car. That's the honest answer." + pad(1),
  "SPEAKER 1: I love that.",
  "SPEAKER 2: In my lab we joke that the whole project was an accident of bus routes. I took my first graduate students up there because the bus stopped at the trailhead, and we never stopped going." + pad(2),
  "SPEAKER 1: And what have the bees told you?" + pad(1),
  "SPEAKER 2: That the flowers are blooming eleven days earlier than when I started, and the bees haven't caught up. Every spring my students and I watch the queens come out to meadows that are already half finished." + pad(2),
  "SPEAKER 1: That's a little heartbreaking." + pad(1),
], expect: { "SPEAKER 1": "Bastian Leclair", "SPEAKER 2": "Anselm Ruiz-Takeda" } });

add({ id: "G8", title: "host never says her name: known from the show, a '<Name> Media' publisher and 'I started this show'; guest named in the notes", L: { show: "Second Draft", showAuthor: "Lorna Vasquez-Pruitt Media", episodeTitle: "Four Hundred Pages in the Recycling Bin", description: "Novelist Kwame Adjei-Lindgren threw away the first version of his debut, all four hundred pages of it, and started again. What he learned from the second try." }, lines: [
  "SPEAKER 1: Hi, and welcome to Second Draft. I started this show four years ago because my own first novel was rejected forty-one times and I wanted to talk to people who'd been there. My guest today has been somewhere even worse. He threw his away." + pad(1),
  "SPEAKER 2: I did. Thanks for having me on your show, by the way. I've been listening since the very first episode." + pad(1),
  "SPEAKER 1: That's very kind. So, four hundred pages.",
  "SPEAKER 2: Four hundred and twelve. I printed it out, read it on a train, and by the time I got to Albany I knew none of it was true. The novel was about my grandfather, and I'd written him like a statue." + pad(2),
  "SPEAKER 1: So you started over." + pad(1),
  "SPEAKER 2: I started over with one rule. He had to be allowed to be wrong. The second draft took three years, and that's the book that came out." + pad(2),
  "SPEAKER 1: My forty-one rejections taught me something similar, but it took me a lot longer." + pad(1),
], expect: { "SPEAKER 1": "Lorna Vasquez-Pruitt", "SPEAKER 2": "Kwame Adjei-Lindgren" } });

add({ id: "G9", title: "notes: '<host> in conversation with the potter <Name>'; the guest is never named aloud", L: { show: "The Long Table", showAuthor: "Marisol Quintero-Hale", episodeTitle: "Clay Remembers Everything", description: "Marisol in conversation with the potter Emre Talay, whose riverside studio flooded last spring and took both of his kilns with it." }, lines: [
  "SPEAKER 1: Welcome to The Long Table. I'm Marisol Quintero-Hale, and I'm sitting in a pottery studio that, a year ago, was under four feet of water." + pad(2),
  "SPEAKER 2: Three and a half. I measured the line on the wall. You can still see it, there, by the door." + pad(1),
  "SPEAKER 1: You kept the line.",
  "SPEAKER 2: I kept the line. My grandfather made pots in Turkey, and he used to say clay remembers everything you do to it. So I decided the studio should remember too." + pad(2),
  "SPEAKER 1: What did you lose?" + pad(1),
  "SPEAKER 2: Both kilns, most of my glazes, about two hundred finished pieces. And something I didn't expect. I lost my nerve. I couldn't sit down at the wheel for three months." + pad(2),
  "SPEAKER 1: What brought you back?",
  "SPEAKER 2: A neighbor's kid asked me to teach her to make a bowl. You can't say no to a nine-year-old with mud on her face." + pad(1),
], expect: { "SPEAKER 1": "Marisol Quintero-Hale", "SPEAKER 2": "Emre Talay" } });

add({ id: "G10", title: "HOST/GUEST labels; notes: '<host> sits down with storm chaser <Name>'", L: { show: "Weather Eye", showAuthor: "Teodora Vance", episodeTitle: "Chasing the Wrong Storm", description: "Teodora sits down with storm chaser Wallace Dunleavy, who has logged thirty years on the back roads of Kansas and Oklahoma, to talk about the tornado he missed and the one that almost got him." }, lines: [
  "HOST: This is Weather Eye. I'm Teodora Vance. Thirty years, thousands of miles of dirt road, and my guest still remembers the one that got away." + pad(1),
  "GUEST: Oh, there's more than one that got away. But there's one I still think about." + pad(1),
  "HOST: Tell me.",
  "GUEST: May of ninety-nine. I was in the wrong county, chasing a storm that looked perfect on radar and did absolutely nothing. Forty miles north, the one I should have been on was tearing up a wheat field, and I listened to it on the scanner." + pad(2),
  "HOST: And the one that almost got you?" + pad(1),
  "GUEST: Twenty eleven. I got greedy, I got too close, and the road I'd planned to escape on was under water. Three decades of chasing, and that's the only time I've prayed out loud in the truck." + pad(2),
  "HOST: Did you keep chasing after that?",
  "GUEST: I kept chasing. I just started leaving earlier." + pad(1),
], expect: { "HOST": "Teodora Vance", "GUEST": "Wallace Dunleavy" } });

add({ id: "G11", title: "title 'Name: Topic'; the notes say '<host> talks to the woman who has run <store>' without naming her", L: { show: "Main Street Ledger", showAuthor: "Ruthanne Pell", episodeTitle: "Bettina Szabo: Forty Years Behind the Counter", description: "Ruthanne talks to the woman who has run Szabo's Hardware in Lorain, Ohio, since 1984, about keys, gossip, and outlasting two big-box stores." }, lines: [
  "SPEAKER 1: Hi, I'm Ruthanne Pell, and this is Main Street Ledger, the show about the businesses that hold a town together. Today I'm in a hardware store that smells exactly like my grandfather's garage." + pad(1),
  "SPEAKER 2: That's the birdseed and the machine oil. Everybody says that when they walk in." + pad(1),
  "SPEAKER 1: How long has this been your store?",
  "SPEAKER 2: I bought it from my father-in-law in nineteen eighty-four. He gave me a year. I've cut probably a hundred thousand keys at this counter since then." + pad(2),
  "SPEAKER 1: And two big-box stores opened nearby." + pad(1),
  "SPEAKER 2: One out on the highway and one by the interstate. The first one closed in two thousand nine. The second one sends people to me when they don't have the part." + pad(2),
  "SPEAKER 1: They send them to you?",
  "SPEAKER 2: The young man in their plumbing aisle calls me directly. I've got washers in these drawers that are older than he is." + pad(1),
], expect: { "SPEAKER 1": "Ruthanne Pell", "SPEAKER 2": "Bettina Szabo" } });

add({ id: "G12", title: "notes: 'Hydrologist <Name> explains...'; the guest is never named aloud and talks about her own fieldwork", L: { show: "The Quiet Dispatch", showAuthor: "Rafael Brandt", episodeTitle: "Why the River Keeps Rising", description: "Hydrologist Ezinne Barrow explains why the Kaskaskia keeps flooding towns that hadn't flooded in a century, and what the old levee maps got wrong." }, lines: [
  "SPEAKER 1: From the newsroom, this is The Quiet Dispatch. I'm Rafael Brandt. Three floods in five years, in towns that hadn't flooded in a century. My guest has spent those five years out measuring the river." + pad(1),
  "SPEAKER 2: Standing in it, mostly. More than I'd like to admit." + pad(1),
  "SPEAKER 1: What's changed?",
  "SPEAKER 2: The rain, partly. We're getting storms that drop four inches in an afternoon. But the bigger problem is the maps. The levee maps were drawn in the sixties, and a lot of the land behind those levees has sunk since then. In my fieldwork, the water goes where the ground actually is, not where the map says it is." + pad(2),
  "SPEAKER 1: So the towns think they're safe." + pad(1),
  "SPEAKER 2: They think they're two feet higher than they are. I've stood in a man's kitchen with my survey rod and shown him, and that's not a fun afternoon for either of us." + pad(2),
  "SPEAKER 1: What did he do with that information?",
  "SPEAKER 2: He moved his furnace upstairs. Which, honestly, was the right call." + pad(1),
], expect: { "SPEAKER 1": "Rafael Brandt", "SPEAKER 2": "Ezinne Barrow" } });

add({ id: "G13", title: "co-host pair who give first names only (full names in the feed); the title 'Topic, with Name' names the guest", L: { show: "Double Feature", showAuthor: "Gus Ferreira and Rhonda Ikeda", showPersons: [{ name: "Gus Ferreira", role: "host" }, { name: "Rhonda Ikeda", role: "host" }], episodeTitle: "Saving the Last Drive-In, with Harlan Moody", description: "Gus and Rhonda drive out to the Starlite Twin to meet the man who bought it at auction for one dollar more than the demolition company bid." }, lines: [
  "SPEAKER 1: Welcome to Double Feature. I'm Gus." + pad(1),
  "SPEAKER 2: And I'm Rhonda, and Gus, we are recording in a car right now." + pad(1),
  "SPEAKER 1: We are recording in a car, at a drive-in, in broad daylight, which feels illegal." + pad(1),
  "SPEAKER 3: It's not illegal. I own the place, so you're fine." + pad(1),
  "SPEAKER 2: Tell everybody how you came to own it.",
  "SPEAKER 3: The demolition company bid eighty-four thousand dollars. I bid eighty-four thousand and one. I've been coming here since I was six years old, and I wasn't going to watch them put a storage facility on it." + pad(2),
  "SPEAKER 1: One dollar." + pad(1),
  "SPEAKER 3: Best dollar I ever spent. Worst plumbing I ever bought." + pad(1),
], expect: { "SPEAKER 1": "Gus Ferreira", "SPEAKER 2": "Rhonda Ikeda", "SPEAKER 3": "Harlan Moody" } });

add({ id: "G14", title: "two-guest panel; each guest answers when addressed by first name", L: { show: "Statehouse Weekly", showAuthor: "Naomi Fairbanks-Oduya", episodeTitle: "Panel: The Gas Tax Fight", description: "Naomi is joined by Republican strategist Curtis Lemaire and Democratic consultant Ofelia Danvers to argue about the gas tax, the road fund, and who blinks first." }, lines: [
  "SPEAKER 1: This is Statehouse Weekly. I'm Naomi Fairbanks-Oduya, and our panel is back. Curtis Lemaire works on Republican campaigns, Ofelia Danvers on Democratic ones, and both have promised not to interrupt each other, which we'll see. Curtis, you first. Does the gas tax go up this session?" + pad(1),
  "SPEAKER 2: It doesn't, Naomi, and I'll tell you why. Nobody in my party wants to go home in an election year and explain a higher price at the pump." + pad(2),
  "SPEAKER 1: Ofelia?",
  "SPEAKER 3: Curtis is right about the politics and wrong about the roads. The road fund is going to come up about three hundred million dollars short, and my side is going to make his side own every pothole in the state." + pad(2),
  "SPEAKER 2: Every one of those potholes was there when your folks ran the place, too." + pad(1),
  "SPEAKER 3: And we raised the tax back then, which is exactly my point." + pad(1),
  "SPEAKER 1: Okay. The no-interrupting rule lasted about ninety seconds." + pad(1),
], expect: { "SPEAKER 1": "Naomi Fairbanks-Oduya", "SPEAKER 2": "Curtis Lemaire", "SPEAKER 3": "Ofelia Danvers" } });

add({ id: "G15", title: "call-in segment: 'Let's go to Priya in Tulsa', and the caller gives her full name", L: { show: "Dirt Under the Nails", showAuthor: "Patrick Ellery", episodeTitle: "Fig Trees, Frost, and Your Questions", description: "Patrick takes your calls about overwintering figs, fall bulbs, and the eternal squirrel problem." }, lines: [
  "SPEAKER 1: Welcome back to Dirt Under the Nails. I'm Patrick Ellery, the phone lines are full, so let's get right to it. Let's go to Priya in Tulsa. Priya, you're on the air.",
  "SPEAKER 2: Hi, Patrick! This is Priya Kothari. I've been listening since you were on the AM station, so this is a big deal for me." + pad(1),
  "SPEAKER 1: Well, welcome to the show, Priya. What's going on in Tulsa?",
  "SPEAKER 2: I have a fig tree in a pot on my patio, and last winter I left it out and it died back to the ground. It came back, but no figs at all. Should I bring it in this year?" + pad(1),
  "SPEAKER 1: Bring it in, but not into the house. An unheated garage is perfect. You want it dormant, not comfortable." + pad(2),
  "SPEAKER 2: So it doesn't need any light?",
  "SPEAKER 1: None once the leaves drop. Water it about once a month so the roots don't dry out completely, and wheel it back out after your last frost." + pad(1),
  "SPEAKER 2: Okay. Thank you so much, Patrick.",
], expect: { "SPEAKER 1": "Patrick Ellery", "SPEAKER 2": "Priya Kothari" } });

add({ id: "G16", title: "guest addressed only by a nickname ('Dot') that the notes explain", L: { show: "Harbor Lights", showAuthor: "Bayou Sound Radio", episodeTitle: "Fifty-One Seasons", description: "Shrimp boat captain Dorothea Gaspard, known as 'Dot' to everyone on the docks in Bayou La Batre, has worked the Gulf for fifty-one years. She talks about storms, prices, and teaching her granddaughter to run the nets." }, lines: [
  "SPEAKER 1: This is Harbor Lights, from Bayou Sound Radio. I'm Mireille Dufresne, and I'm standing on the deck of a shrimp boat at six in the morning. Dot, thank you for letting me aboard." + pad(1),
  "SPEAKER 2: Well, you showed up on time, which is more than I can say for my deckhands." + pad(1),
  "SPEAKER 1: How many years now?",
  "SPEAKER 2: Fifty-one this spring. My daddy put me on this boat when I was twelve, and I took the wheel when he passed. I've been through every storm you can name and a few nobody bothered to name." + pad(2),
  "SPEAKER 1: And now your granddaughter's learning." + pad(1),
  "SPEAKER 2: She's better on the nets than I was at her age. Don't you tell her I said that." + pad(1),
  "SPEAKER 1: Dot, what are prices doing to you this year?",
  "SPEAKER 2: Imported shrimp is killing us. I get less a pound than I did in nineteen ninety-five, and diesel costs four times as much." + pad(2),
], expect: { "SPEAKER 1": "Mireille Dufresne", "SPEAKER 2": "Dorothea Gaspard" } });

add({ id: "G17", title: "the guest is not named in the listing or the intro and introduces herself mid-conversation", L: { show: "Small Hours", showAuthor: "Ingrid Solvang", episodeTitle: "Who Answers at 3 A.M.", description: "A conversation about the overnight shift at a county 911 center: the dispatchers who work it, and the calls that stay with them." }, lines: [
  "SPEAKER 1: This is Small Hours. I'm Ingrid Solvang. My guest tonight has answered more three a.m. phone calls than anyone I know, and she's here, wide awake, at the hour she knows best." + pad(1),
  "SPEAKER 2: I'm always awake at this hour. My body doesn't know any other schedule anymore." + pad(1),
  "SPEAKER 1: What does a typical overnight shift look like?",
  "SPEAKER 2: There isn't really a typical one. Some nights it's fender benders and barking dogs. Some nights are much harder. Oh, and I realize I never said who I am. I'm Hannah Liebowitz, and I've supervised the overnight shift at the county 911 center since twenty fifteen." + pad(2),
  "SPEAKER 1: My fault, Hannah. I skipped right past it." + pad(1),
  "SPEAKER 2: It's fine. I'm usually the anonymous voice on the other end, so it feels strange to say my name out loud." + pad(1),
  "SPEAKER 1: How do your dispatchers handle the hard calls?",
  "SPEAKER 2: They talk it through with a supervisor before they go home. Nobody leaves carrying a call alone. That's the one rule I will never bend." + pad(2),
], expect: { "SPEAKER 1": "Ingrid Solvang", "SPEAKER 2": "Hannah Liebowitz" } });

add({ id: "G18", title: "the title 'Name on Topic' is the only place the guest is named; the publisher is not a person", L: { show: "Slow Craft", showAuthor: "Slow Craft Collective", episodeTitle: "Ines Carvalho on Building Boats by Hand", description: "Wooden boats, cedar strips, and why a single canoe takes three hundred hours." }, lines: [
  "SPEAKER 1: Welcome to Slow Craft. I'm Anders Marchand. Today I'm in a boat shop on the edge of Lake Champlain, and I already have cedar shavings in my hair." + pad(1),
  "SPEAKER 2: They'll be in your car for a month. Sorry in advance." + pad(1),
  "SPEAKER 1: How long have you been building boats?",
  "SPEAKER 2: Twenty-two years. I built my first canoe in my parents' garage in Fall River, out of a library book, and it leaked so badly my father called it the colander." + pad(2),
  "SPEAKER 1: And now people wait two years for one of yours." + pad(1),
  "SPEAKER 2: About that. Every canoe is three hundred hours, give or take, and I won't hire anyone to rush it. My shop is me and one apprentice." + pad(2),
  "SPEAKER 1: Can you show me the strips?",
  "SPEAKER 2: Come over here. Smell that. That's western red cedar." + pad(1),
], expect: { "SPEAKER 1": "Anders Marchand", "SPEAKER 2": "Ines Carvalho" } });

add({ id: "G19", title: "host never says his name: the show is named for him and published by '<Name> Network'; the guest is never named anywhere", L: { show: "The Desmond Achterberg Show", showAuthor: "Desmond Achterberg Network", episodeTitle: "The Mechanic Who Fixes for Free", description: "A Saturday at a free car clinic in Flint, Michigan, and the retired mechanic who started it in his own garage." }, lines: [
  "SPEAKER 1: Welcome to the show, everybody. Every week I tell you I'm going to find the most useful person in Michigan, and this week I think I actually did." + pad(1),
  "SPEAKER 2: Well, that's a lot of pressure for a man with grease under his fingernails. Thanks for having me on your program." + pad(1),
  "SPEAKER 1: You retired after thirty-four years at a dealership. And then what?",
  "SPEAKER 2: And then I got bored in about a week. My wife told me to get out of the house, so I opened my garage on Saturdays and put a sign out front. Free brakes, free oil changes, bring your own parts if you can." + pad(2),
  "SPEAKER 1: How many cars on a Saturday?",
  "SPEAKER 2: Started with two. Now it's thirty, and I've got eight volunteers, half of them guys I worked next to for thirty years." + pad(2),
  "SPEAKER 1: I've been doing this show a long time, and that might be my favorite answer anybody's ever given me." + pad(1),
], expect: { "SPEAKER 1": "Desmond Achterberg", "SPEAKER 2": null } });

add({ id: "G20", title: "no names are spoken at all; the feed lists exactly one host and one guest, and the roles are plain from the conversation", L: { show: "The Margins", showPersons: [{ name: "Wen-Li Tsao", role: "host" }], episodePersons: [{ name: "Augustin Ellwood", role: "guest" }], episodeTitle: "The Translator's Notebook", description: "On translating a nine-hundred-page Portuguese novel into English, one dictionary at a time." }, lines: [
  "SPEAKER 1: Welcome to The Margins, the show about the people behind the books. Today we're talking about a nine-hundred-page novel that took one person seven years to bring into English." + pad(1),
  "SPEAKER 2: Seven and a half, if my editor is listening. She'll want the record straight." + pad(1),
  "SPEAKER 1: Where do you even start with nine hundred pages?",
  "SPEAKER 2: With the first sentence, over and over. I translated the opening paragraph maybe forty times before I trusted myself to go on. Portuguese has a patience in its sentences that English keeps trying to rush." + pad(2),
  "SPEAKER 1: Did you ever meet the author?" + pad(1),
  "SPEAKER 2: Twice, in Lisbon. The second time I asked her about one word in chapter twelve, and she laughed and told me she'd made it up. I'd spent a month looking for it in dictionaries." + pad(2),
  "SPEAKER 1: That's the best thing I've heard all week." + pad(1),
], expect: { "SPEAKER 1": "Wen-Li Tsao", "SPEAKER 2": "Augustin Ellwood" } });

add({ id: "H1", title: "the listed host is on book leave; a named fill-in hosts and says so", L: { show: "Small Hours", showAuthor: "Ingrid Solvang", showPersons: [{ name: "Ingrid Solvang", role: "host" }], episodeTitle: "The Lighthouse Keeper's Daughter", description: "Ingrid is on book leave this month. Author Philippa Grange talks about growing up on a lighthouse island in Lake Superior." }, lines: [
  "SPEAKER 1: This is Small Hours. I'm Dev Malhotra, sitting in for Ingrid Solvang, who is off finishing her book and has promised to come back with stories. My guest tonight grew up on an island with exactly one building on it, and that building was a lighthouse." + pad(1),
  "SPEAKER 2: And an outhouse. I think the outhouse deserves a mention." + pad(1),
  "SPEAKER 1: Duly noted. What was it like?",
  "SPEAKER 2: Loud, mostly. People imagine it was peaceful, but the foghorn went off every thirty seconds whenever the fog came in, and on Lake Superior that's half the summer. My father kept the light, and I was the only child for nine miles in any direction." + pad(2),
  "SPEAKER 1: How did you go to school?",
  "SPEAKER 2: Correspondence lessons that came out on the supply boat. My mother graded them at the kitchen table, and she was a harder grader than any teacher I had later." + pad(2),
  "SPEAKER 1: I'm told Ingrid has read your book twice, so I'll be in real trouble if I don't ask you about the shipwreck." + pad(1),
  "SPEAKER 2: Ah. The shipwreck. Yes." + pad(1),
], expect: { "SPEAKER 1": "Dev Malhotra", "SPEAKER 2": "Philippa Grange" } });

add({ id: "H2", title: "the listed host is away and an unnamed producer hosts; the guest is named in the notes", L: { show: "Weather Eye", showAuthor: "Teodora Vance", showPersons: [{ name: "Teodora Vance", role: "host" }], episodeTitle: "Listener Questions: Hail", description: "Teodora is away this week. Your questions about hail, answered by meteorologist Kofi Asante-Darby." }, lines: [
  "SPEAKER 1: Hi, this is Weather Eye. Teodora is away this week, she's on a research flight somewhere over the Gulf, so you're stuck with me. Normally I produce the show from the other side of the glass. Today we have a pile of your questions about hail, and someone who can actually answer them." + pad(1),
  "SPEAKER 2: Happy to be here. I've waited years for someone to ask me about hail on purpose." + pad(1),
  "SPEAKER 1: First question, from a listener in Amarillo. Why is hail sometimes the size of a pea and sometimes the size of a softball?",
  "SPEAKER 2: It comes down to the updraft. A hailstone keeps growing as long as the storm can hold it up. In a really violent updraft, I've measured stones that rode up and down for twenty minutes before they finally fell." + pad(2),
  "SPEAKER 1: Twenty minutes in the air." + pad(1),
  "SPEAKER 2: You can cut one in half and count the rings, like a tree. I keep a freezer at the office full of them, and my colleagues hate me for it." + pad(2),
  "SPEAKER 1: Teodora is going to be so jealous she missed this." + pad(1),
], expect: { "SPEAKER 1": null, "SPEAKER 2": "Kofi Asante-Darby" } });

add({ id: "H3", title: "the feed's listed guest died this spring; the voice remembering her is her son, named in the notes", L: { show: "The Long Table", showAuthor: "Marisol Quintero-Hale", episodePersons: [{ name: "Odile Ferrante", role: "guest" }], episodeTitle: "Remembering Odile Ferrante", description: "The jazz pianist Odile Ferrante died in March at eighty-three. Her son, Marco Ferrante, joins Marisol at the piano where she taught for forty years." }, lines: [
  "SPEAKER 1: Welcome to The Long Table. I'm Marisol Quintero-Hale. This is a different kind of episode. Odile Ferrante played piano in this city for sixty years, and she died this spring. Her son has agreed to sit with me at her piano." + pad(1),
  "SPEAKER 2: She would have hated this, by the way. She hated being talked about. She wanted you to listen to the music and leave her out of it." + pad(1),
  "SPEAKER 1: Then we'll talk about the music.",
  "SPEAKER 2: Good. My mother practiced at five in the morning every single day of my childhood. I didn't know other houses were quiet in the morning until I slept over at a friend's and couldn't fall asleep without scales." + pad(2),
  "SPEAKER 1: Did she teach you?" + pad(1),
  "SPEAKER 2: She tried. I was a terrible student. I play a little, but the one who got her talent is my daughter, who's twelve and already better than I'll ever be." + pad(2),
  "SPEAKER 1: Marco, is there a song she'd want us to end on?",
  "SPEAKER 2: There's one she wrote for my father. I'll play it badly, and she'll forgive me." + pad(1),
], expect: { "SPEAKER 1": "Marisol Quintero-Hale", "SPEAKER 2": "Marco Ferrante" } });

add({ id: "H4", title: "the feed lists the senator as guest, but he is heard only in a clip; the other voice is the reporter named in the notes", L: { show: "Statehouse Weekly", showAuthor: "Naomi Fairbanks-Oduya", episodePersons: [{ name: "Amos Whitlock", role: "guest" }], episodeTitle: "Senator Whitlock's Big Reversal", description: "Senator Amos Whitlock spent ten years fighting the casino bill. On Tuesday he voted for it. Statehouse reporter Lena Haugland explains what changed the night before the vote." }, lines: [
  "SPEAKER 1: This is Statehouse Weekly. I'm Naomi Fairbanks-Oduya. For a decade, one senator was the loudest voice against casino gambling in this state. Here he is in twenty nineteen." + pad(1),
  "CLIP 1: I will stand on this floor every year until I am too old to stand, and I will vote no on this bill every single time.",
  "SPEAKER 1: And on Tuesday he voted yes. Lena, you were in the chamber. What happened?",
  "SPEAKER 2: I was, Naomi, and the gallery actually gasped. I've covered the statehouse for eleven years and I'd never heard a gasp in there. He didn't explain himself on the floor, and he left by the back stairs." + pad(2),
  "SPEAKER 1: Did you catch him afterward?" + pad(1),
  "SPEAKER 2: I chased him into the parking garage. He said his district needed the jobs, and that's all he'd say. But a casino site in his district was added to the bill in committee the night before." + pad(2),
  "SPEAKER 1: So the bill changed to include his district.",
  "SPEAKER 2: The night before the vote. That's the part nobody is talking about yet." + pad(1),
], expect: { "SPEAKER 1": "Naomi Fairbanks-Oduya", "SPEAKER 2": "Lena Haugland" } });

add({ id: "H5", title: "a caller shares the host's first name ('another Patrick, this one in Boise')", L: { show: "Dirt Under the Nails", showAuthor: "Patrick Ellery", episodeTitle: "Your Questions: Squirrels and Bulbs", description: "Patrick takes calls about squirrels digging up tulips, and whether it's too late to plant garlic." }, lines: [
  "SPEAKER 1: Back to the phones on Dirt Under the Nails. I'm Patrick Ellery. Next up, another Patrick, this one calling from Boise. Patrick, go ahead.",
  "SPEAKER 2: Hey, Patrick, from one Patrick to another. Love the show. I've got a squirrel situation." + pad(1),
  "SPEAKER 1: Everybody's got a squirrel situation. What's yours?",
  "SPEAKER 2: I planted two hundred tulip bulbs last fall and got maybe nine flowers. The rest got dug up. My wife thinks I'm running a buffet for the whole neighborhood." + pad(2),
  "SPEAKER 1: Next time, lay chicken wire flat over the bed after you plant and hide it under mulch. The shoots grow right through, but the squirrels can't dig. And mix in daffodils. Squirrels leave those alone." + pad(2),
  "SPEAKER 2: Chicken wire. Okay. My wife is going to love that. Thanks, Patrick.",
  "SPEAKER 1: Good luck out there, Patrick." + pad(1),
], expect: { "SPEAKER 1": "Patrick Ellery", "SPEAKER 2": { not: "Patrick Ellery" } } });

add({ id: "H6", title: "the guest reads aloud an 1863 letter that opens 'my name is <Name>'; the reader is the historian, not the letter writer", L: { show: "Old Letters", showAuthor: "Grayson Teale", episodeTitle: "A Soldier Writes Home, 1863", description: "Historian Renata Vollmer brings a letter she found in a Kentucky courthouse basement, written by a Union private to his sister." }, lines: [
  "SPEAKER 1: Welcome to Old Letters. I'm Grayson Teale. Every week someone brings me a letter, and this week's came out of a courthouse basement. Renata, would you read it for us?" + pad(1),
  "SPEAKER 2: I'd love to. The spelling is his, and I've only fixed it where you'd otherwise get lost. Here goes. \"Dear Sister, my name is Josiah Pratt, in case the Army has made me so thin you do not know me. I write to you from the camp near Murfreesboro, where it has rained nine days.\"",
  "SPEAKER 1: That's a wonderful opening. He's teasing her." + pad(1),
  "SPEAKER 2: He teases her all the way through, and that's what got me. I've read hundreds of these letters in my work, and most soldiers wrote like they were filling out a form. Josiah writes like he's sitting at the kitchen table with her." + pad(2),
  "SPEAKER 1: Do we know what happened to him?",
  "SPEAKER 2: He survived the war. I found him in the eighteen-eighty census, a carpenter in Ohio, with a daughter named after his sister." + pad(2),
  "SPEAKER 1: Renata, that gave me chills." + pad(1),
], expect: { "SPEAKER 1": "Grayson Teale", "SPEAKER 2": "Renata Vollmer" } });

add({ id: "H7", title: "a priest and a deacon, both addressed only by title; each must get the right name from the notes", L: { show: "Steeple & Street", showAuthor: "Corinne Mabry", episodeTitle: "Two Collars, One Parish", description: "Father Tomasz Kowal and Deacon Luis Arriaga serve St. Brigid's parish in South Bend. Corinne asks them what a deacon does that a priest can't, and the other way around." }, lines: [
  "SPEAKER 1: This is Steeple & Street. I'm Corinne Mabry, and today I have two clergymen from the same parish, a priest and a deacon. Father, let's start with you. What's the difference, for those of us who didn't grow up Catholic?" + pad(1),
  "SPEAKER 2: The short version is that I can say Mass and hear confessions, and he can't. As a priest, I'm also not married, and he is, with four kids, so he knows a great deal more than I do about some things." + pad(2),
  "SPEAKER 3: Five kids, Father. The fifth arrived in June." + pad(1),
  "SPEAKER 2: Five. I baptized her myself, I should know that." + pad(1),
  "SPEAKER 1: Deacon, what does your week look like?",
  "SPEAKER 3: Monday through Friday I'm an accountant. As a deacon, I do baptisms, weddings, graveside services, and a lot of hospital visits. When a family in the hospital wants to talk to a dad who's also been up all night, they get me." + pad(2),
  "SPEAKER 1: Father, what can he do that you can't?",
  "SPEAKER 2: He can tell a couple about to get married what marriage is actually like. I can only tell them what I've read." + pad(1),
], expect: { "SPEAKER 1": "Corinne Mabry", "SPEAKER 2": "Tomasz Kowal", "SPEAKER 3": "Luis Arriaga" } });

add({ id: "H8", title: "the host addresses an absent mayor by name right before the guest (a city engineer named in the notes) speaks", L: { show: "The Quiet Dispatch", showAuthor: "Rafael Brandt", episodeTitle: "The Bridge That Was Supposed to Open in May", description: "City engineer Priscilla Nakagawa-Lund walks through why the Fifth Street bridge is eight months behind schedule." }, lines: [
  "SPEAKER 1: This is The Quiet Dispatch. I'm Rafael Brandt. The Fifth Street bridge was supposed to open in May. It's January. Mayor Delgado, I know you listen to this show, because your office emails me every time I get something wrong, so here's an open invitation: come on and tell us what happened. Until then, we have the engineer." + pad(1),
  "SPEAKER 2: Thanks for having me. I should say up front that I can talk about the engineering, not the politics." + pad(1),
  "SPEAKER 1: Fair enough. What went wrong with the engineering?",
  "SPEAKER 2: When we drove the test piles, we hit an old coal seam nobody had mapped. In eighteen years as an engineer for this city, I'd never seen that under a river crossing. We had to redesign the footings." + pad(2),
  "SPEAKER 1: And that's eight months?" + pad(1),
  "SPEAKER 2: Four months of redesign, two months waiting on steel, and two months of winter. Concrete doesn't care about press conferences." + pad(2),
  "SPEAKER 1: Mayor, if you're listening, that's the line you should have used." + pad(1),
], expect: { "SPEAKER 1": "Rafael Brandt", "SPEAKER 2": "Priscilla Nakagawa-Lund" } });

add({ id: "H9", title: "the episode title names an author who never appears (her book is read as a quote); the guest is the critic named in the notes", L: { show: "The Margins", showAuthor: "Wen-Li Tsao", episodeTitle: "What Harriet Lindqvist Got Wrong About Water", description: "Harriet Lindqvist's bestseller says the Great Lakes will be piped west within a generation. Wen-Li asks water-law scholar Simone Kirkland whether any of it holds up." }, lines: [
  "SPEAKER 1: Welcome to The Margins. I'm Wen-Li Tsao. There's a book on every airport shelf this year that says the Great Lakes will be piped to Arizona within twenty-five years. Here's how it opens." + pad(1),
  "QUOTE 1: By the time my daughter is my age, the Great Lakes will belong to whoever can afford the pipe.",
  "SPEAKER 1: My guest teaches water law, and she has notes.",
  "SPEAKER 2: I have a lot of notes. I brought them. They're color-coded." + pad(1),
  "SPEAKER 1: Let's start with the big claim. Could it happen?",
  "SPEAKER 2: Not legally, not without tearing up agreements that eight states and two Canadian provinces signed. The book treats those agreements like suggestions. I've spent my career teaching them, and they're about as close to unbreakable as water law gets." + pad(2),
  "SPEAKER 1: Did you reach out to the author?" + pad(1),
  "SPEAKER 2: I wrote to her publisher and offered to talk. I never heard back, which is fine. I'd still love for her to read the compact." + pad(2),
  "SPEAKER 1: She's welcome on the show anytime." + pad(1),
], expect: { "SPEAKER 1": "Wen-Li Tsao", "SPEAKER 2": "Simone Kirkland" } });

add({ id: "H10", title: "the notes name an owner who declined to appear; the voice is the tenant organizer who came instead", L: { show: "The Quiet Dispatch", showAuthor: "Rafael Brandt", episodeTitle: "The Rent Went Up Forty Percent", description: "Tenants at the Maple Court apartments got a forty percent rent increase in September. We invited the owner, Rhett Saldana of Saldana Holdings, to join us; he declined. Tenant organizer Mavis Oyelaran joins Rafael instead." }, lines: [
  "SPEAKER 1: This is The Quiet Dispatch. I'm Rafael Brandt. In September, every family at the Maple Court apartments opened a letter saying their rent was going up forty percent. We asked the man who owns the building to come on. He said no. So I'm talking with someone who has knocked on every door in that complex." + pad(1),
  "SPEAKER 2: All one hundred and twelve of them. Some of them twice." + pad(1),
  "SPEAKER 1: What are people telling you?",
  "SPEAKER 2: That they're scared. I've been organizing tenants for nine years, and I've never seen a building go quiet like that. People stopped letting their kids play in the courtyard because they didn't want to be noticed." + pad(2),
  "SPEAKER 1: What are you asking the owner for?" + pad(1),
  "SPEAKER 2: A meeting. That's it. Sit down with the tenants for one hour. He's had our letter since September tenth." + pad(2),
  "SPEAKER 1: Our invitation stays open too." + pad(1),
], expect: { "SPEAKER 1": "Rafael Brandt", "SPEAKER 2": "Mavis Oyelaran" } });

add({ id: "H11", title: "substitute guest: the feed still lists the original guest, but the host explains her colleague stepped in", L: { show: "Understory", showAuthor: "Understory Media", showPersons: [{ name: "Bastian Leclair", role: "host" }], episodePersons: [{ name: "Marguerite Salcedo", role: "guest" }], episodeTitle: "Owls in the Parking Garage", description: "Ornithologist Marguerite Salcedo on the great horned owls nesting in downtown parking garages." }, lines: [
  "SPEAKER 1: This is Understory. I'm Bastian Leclair. If you read the episode listing, you were expecting Marguerite Salcedo today. She had a family emergency this morning. Everyone's okay, but she couldn't make it. Her colleague from the same lab, Tobias Hargrove, very kindly agreed to step in on about three hours' notice." + pad(1),
  "SPEAKER 2: Two and a half, but who's counting. Marguerite sends her apologies, and she made me promise to get the owl facts right." + pad(1),
  "SPEAKER 1: No pressure. Owls in parking garages. Why?",
  "SPEAKER 2: Because a parking garage is basically a cliff with free rats. The owls don't care that it's concrete. Our lab has tracked eleven nests on downtown garages, and the chicks do just as well as the ones out in the woods." + pad(2),
  "SPEAKER 1: Do the drivers notice?" + pad(1),
  "SPEAKER 2: Mostly when an owl screeches at them after dark. I've had night security guards call me convinced someone was in trouble up on level four." + pad(2),
  "SPEAKER 1: Tobias, thank you for jumping in." + pad(1),
], expect: { "SPEAKER 1": "Bastian Leclair", "SPEAKER 2": "Tobias Hargrove" } });

add({ id: "H12", title: "two sisters are introduced together but only one voice speaks, and nothing says which sister it is", L: { show: "Main Street Ledger", showAuthor: "Ruthanne Pell", episodeTitle: "Okafor and Daughters", description: "Ruthanne visits Okafor and Daughters Bakery in Columbus, run by sisters Nkechi and Adaeze Okafor since their father retired." }, lines: [
  "SPEAKER 1: I'm Ruthanne Pell, and this is Main Street Ledger. I'm at Okafor and Daughters in Columbus with the two sisters who run it, Nkechi and Adaeze Okafor. It's four in the morning and the ovens are already roaring." + pad(1),
  "SPEAKER 2: Four is late for us. We usually start at three." + pad(1),
  "SPEAKER 1: How did the two of you end up running your father's bakery?",
  "SPEAKER 2: He retired, and neither of us could stand to see it sold. We both had other jobs, and we quit them on the same day without telling each other." + pad(2),
  "SPEAKER 1: That's a very sister thing to do." + pad(1),
  "SPEAKER 2: We do everything that way. We even split the menu. The breads are mine, and everything sweet belongs to my sister." + pad(2),
  "SPEAKER 1: What's the best seller?",
  "SPEAKER 2: The coconut bread. Our father's recipe, and we haven't changed one thing." + pad(1),
], expect: { "SPEAKER 1": "Ruthanne Pell", "SPEAKER 2": null } });

add({ id: "H13", title: "a lecture series named after a teacher who is not on the episode; a director introduces the lecturer; unnamed audience questions", L: { show: "The Abigail Strand Lectures", showAuthor: "Strand Foundation for the Humanities", episodeTitle: "Every Map Is an Argument", description: "The 2026 Strand Lecture, delivered in Toledo by the cartographer Felix Nakamura-Byrne, on how every map takes a side. Introduced by foundation director Carol Hennessy." }, lines: [
  "SPEAKER 1: Good evening, and welcome to the twentieth annual Abigail Strand Lecture. Abigail Strand taught geography in this city for forty-one years, and she believed every child should be able to read a map and then argue with it. I'm Carol Hennessy, director of the foundation that carries her name, and it's my pleasure to introduce tonight's lecturer, who has made maps on four continents." + pad(1),
  "SPEAKER 2: Thank you, Carol, and thank you all for coming out on a rainy night. I'll start with a confession. Every map I have ever made leaves something out on purpose, and tonight I'm going to show you what." + pad(2),
  "SPEAKER 1: We have time for a couple of questions. Yes, in the front.",
  "SPEAKER 3: Hi. You said every map leaves something out. What's the worst thing you were ever asked to leave off?",
  "SPEAKER 2: A neighborhood. A city wanted a tourist map without it. I refused, they hired someone else, and that map is still in the hotel lobbies." + pad(2),
  "SPEAKER 1: One more, over here on the aisle.",
  "SPEAKER 4: How do you decide what stays and what goes?",
  "SPEAKER 2: I ask who gets lost if I leave it off, and whether I'd be willing to say that to their face." + pad(1),
], expect: { "SPEAKER 1": "Carol Hennessy", "SPEAKER 2": "Felix Nakamura-Byrne", "SPEAKER 3": null, "SPEAKER 4": null } });

add({ id: "H14", title: "the guest says he's 'no expert like Dr. <Name>'; that doctor never speaks", L: { show: "Dirt Under the Nails", showAuthor: "Patrick Ellery", episodeTitle: "The Winter I Lost Every Hive", description: "Backyard beekeeper Otis Lambright lost all six of his hives last winter. He tells Patrick what he thinks went wrong." }, lines: [
  "SPEAKER 1: Welcome to Dirt Under the Nails. I'm Patrick Ellery. My guest kept bees in his backyard for twelve years without losing a single hive, and then last winter he lost all six. Otis, I'm so sorry." + pad(1),
  "SPEAKER 2: Thanks, Patrick. It was a gut punch. I opened the first one in February and knew before I had the lid off." + pad(2),
  "SPEAKER 1: What do you think happened?",
  "SPEAKER 2: Now, I'm no expert like Dr. Farah Siddiqui over at the extension office, she's the one you should really have on, but I think it was mites. I treated late. I got lazy in August, and I paid for it in February." + pad(2),
  "SPEAKER 1: We've had Dr. Siddiqui on, actually, and I suspect she'd agree with you." + pad(1),
  "SPEAKER 2: Well, don't tell her I admitted I got lazy. She warned me about exactly this at a workshop." + pad(1),
  "SPEAKER 1: Are you starting over this spring?",
  "SPEAKER 2: Two packages of bees on order. I'm not quitting over one bad winter." + pad(1),
], expect: { "SPEAKER 1": "Patrick Ellery", "SPEAKER 2": "Otis Lambright" } });

add({ id: "H15", title: "'This is <host>'s show, but I'm her producer': the producer stays unnamed; the host chimes in and is named", L: { show: "The Long Table", showAuthor: "Marisol Quintero-Hale", showPersons: [{ name: "Marisol Quintero-Hale", role: "host" }], episodeTitle: "Corrections and a Recipe", description: "A short bonus episode: last month's corrections, and the tamale recipe you keep asking for." }, lines: [
  "SPEAKER 1: Hi, everybody. This is Marisol's show, but I'm her producer, and she has asked me, very sweetly, to read this month's corrections because she can't bear to read them herself." + pad(1),
  "SPEAKER 2: I can bear it. I just don't want to." + pad(1),
  "SPEAKER 1: First correction. In the episode about the chocolate market, we said it opens at six. It opens at seven. Several of you went at six. We are sorry." + pad(1),
  "SPEAKER 2: Especially to the man who emailed us a photo of the locked gate." + pad(1),
  "SPEAKER 1: Second correction. The potter's studio flooded under three and a half feet of water, not four. He measured." + pad(1),
  "SPEAKER 2: He did measure. He showed me the line on the wall." + pad(1),
  "SPEAKER 1: And now, as promised, Marisol will read her tamale recipe, which she does not consider a correction.",
  "SPEAKER 2: It's the opposite of a correction. It's perfect. You'll need two pounds of masa." + pad(1),
], expect: { "SPEAKER 1": null, "SPEAKER 2": "Marisol Quintero-Hale" } });

add({ id: "H16", title: "the host retells a meeting where a man said 'I'm <Name>'; he is not on the episode", L: { show: "Second Draft", showAuthor: "Lorna Vasquez-Pruitt Media", showPersons: [{ name: "Lorna Vasquez-Pruitt", role: "host" }], episodeTitle: "The Cheese Book", description: "Food writer Annika Thorsby on her new book about the small cheesemakers of the upper Midwest, and the review that started it." }, lines: [
  "SPEAKER 1: Welcome to Second Draft. I'm Lorna Vasquez-Pruitt. I have to tell you how this episode happened. I'm at the farmers market in Madison, minding my own business, and a man taps me on the shoulder and goes, \"I'm Wendell Ashby, I think your friend wrote about my cheese.\" And that friend is sitting right here." + pad(1),
  "SPEAKER 2: I did write about his cheese. It was a mixed review." + pad(1),
  "SPEAKER 1: And he wasn't angry?",
  "SPEAKER 2: He was thrilled. He said nobody had ever taken his cheese seriously enough to criticize it. That conversation became the first chapter of my book, and I ended up visiting thirty-one cheesemakers in three states." + pad(2),
  "SPEAKER 1: Is his cheese in the book?" + pad(1),
  "SPEAKER 2: Chapter one. And I was kinder the second time around. He'd fixed the rind." + pad(1),
  "SPEAKER 1: That's this whole show, isn't it? Second drafts." + pad(1),
], expect: { "SPEAKER 1": "Lorna Vasquez-Pruitt", "SPEAKER 2": "Annika Thorsby" } });

add({ id: "H17", title: "a caller has the same first name as the guest ('Miriam in Erie')", L: { show: "Weather Eye", showAuthor: "Teodora Vance", episodeTitle: "Ask a Forecaster: Lake-Effect Snow", description: "Forecaster Miriam Castellano, who has predicted lake-effect snow in western New York for twenty years, takes your calls." }, lines: [
  "SPEAKER 1: This is Weather Eye. I'm Teodora Vance, and today's guest has forecast lake-effect snow for twenty years. Welcome." + pad(1),
  "SPEAKER 2: Thanks, Teodora. I'm happy to talk snow anytime, even in October." + pad(1),
  "SPEAKER 1: Let's open the phones. First up, Miriam in Erie. Miriam, go ahead.",
  "SPEAKER 3: Hi! I have the same first name as your guest, which is funny. My question is why one side of my street gets two feet and the other side gets a dusting." + pad(1),
  "SPEAKER 2: Great question, and a great name. Lake-effect bands can be incredibly narrow, sometimes just a few miles wide. In my years forecasting, I've watched a band sit over one neighborhood for eighteen hours while the next town over had sunshine." + pad(2),
  "SPEAKER 3: So it's not my imagination.",
  "SPEAKER 2: Not your imagination. You probably live right on the edge of the band." + pad(1),
  "SPEAKER 1: Thanks for the call, Miriam.",
], expect: { "SPEAKER 1": "Teodora Vance", "SPEAKER 2": "Miriam Castellano", "SPEAKER 3": { not: "Miriam Castellano" } } });

add({ id: "H18", title: "the host reads a listener letter that begins 'My name is <Name>'; the other voice is the returning captain, known by her nickname", L: { show: "Harbor Lights", showAuthor: "Bayou Sound Radio", showPersons: [{ name: "Mireille Dufresne", role: "host" }], episodeTitle: "Mailbag: The Shrimp Boat Episode", description: "Mireille reads your letters about the shrimp boat episode, and Captain Dorothea 'Dot' Gaspard answers a few of them." }, lines: [
  "SPEAKER 1: This is Harbor Lights, from Bayou Sound Radio. I'm Mireille Dufresne. We got more mail about the shrimp boat episode than about anything we've ever aired, so Dot is back with me to answer some of it." + pad(1),
  "SPEAKER 2: I brought my reading glasses this time." + pad(1),
  "SPEAKER 1: First letter. Quote. \"My name is Celestine Boudreaux, and I grew up three houses down from the docks. My grandfather fished with your daddy in the sixties, and I cried through the whole episode.\" End quote.",
  "SPEAKER 2: Boudreaux! Lord, I knew her grandfather. He used to bring my daddy figs off his tree every summer and then complain the whole time that we never shared any shrimp." + pad(2),
  "SPEAKER 1: The next one is less sentimental. A man in Houston wants to know why your shrimp costs more than the frozen bag at his grocery store." + pad(1),
  "SPEAKER 2: Because mine came out of the Gulf yesterday, and his came out of a pond on the other side of the world six months ago." + pad(2),
  "SPEAKER 1: Dot, I think that's our episode." + pad(1),
], expect: { "SPEAKER 1": "Mireille Dufresne", "SPEAKER 2": "Dorothea Gaspard" } });

add({ id: "H19", title: "a next-week teaser names a future guest just before this week's guest speaks again", L: { show: "Understory", showAuthor: "Understory Media", showPersons: [{ name: "Bastian Leclair", role: "host" }], episodeTitle: "The Fungus Under Your Feet", description: "Mycologist Hiroshi Ballantyne on the underground fungal networks that tie a forest together. Next week: Dr. Paulina Varga on the coyotes living in your city." }, lines: [
  "SPEAKER 1: This is Understory. I'm Bastian Leclair, and today we're going underground. About six inches underground." + pad(1),
  "SPEAKER 2: Six inches is where everything interesting happens." + pad(1),
  "SPEAKER 1: You've spent your whole career down there.",
  "SPEAKER 2: Thirty years, on my hands and knees. Mycology is not glamorous, and I've ruined more pants than I can count. But under every forest there's a web of fungus connecting the trees, and I've spent my career mapping it." + pad(2),
  "SPEAKER 1: That's all the time we have. Next week on Understory, Dr. Paulina Varga joins me to talk about the coyotes living in your city, whether you've seen them or not." + pad(1),
  "SPEAKER 2: I'll be listening to that one. A coyote walked through my yard just last month." + pad(1),
], expect: { "SPEAKER 1": "Bastian Leclair", "SPEAKER 2": "Hiroshi Ballantyne" } });

add({ id: "H20", title: "the feed lists two co-hosts, but one is out sick; the second voice is the guest named in the notes", L: { show: "Double Feature", showAuthor: "Gus Ferreira and Rhonda Ikeda", showPersons: [{ name: "Gus Ferreira", role: "host" }, { name: "Rhonda Ikeda", role: "host" }], episodeTitle: "The Projectionist", description: "Rhonda is out sick, so Gus talks to Lionel Prewitt, who ran the projector at the Rialto for thirty-eight years." }, lines: [
  "SPEAKER 1: Welcome to Double Feature. I'm Gus. Rhonda is home sick this week, she sends her love and her cough, so it's just me and a very special guest." + pad(1),
  "SPEAKER 2: I'll try to be half as funny as Rhonda. No promises." + pad(1),
  "SPEAKER 1: You ran the projector at the Rialto for how long?",
  "SPEAKER 2: Thirty-eight years. I started when I was seventeen, splicing film with a razor blade and tape, and I retired when they put in the digital machines. A digital machine doesn't need a man in the booth." + pad(2),
  "SPEAKER 1: Do you miss it?" + pad(1),
  "SPEAKER 2: I miss the sound. Film makes a sound going through the gate, like rain on a tin roof. I could tell you a reel was about to break just by listening." + pad(2),
  "SPEAKER 1: I wish Rhonda could hear that. She'd cry." + pad(1),
], expect: { "SPEAKER 1": "Gus Ferreira", "SPEAKER 2": "Lionel Prewitt" } });

module.exports = { S };
