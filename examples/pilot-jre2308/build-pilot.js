// Source of the supplied example: builds examples/pilot-jre2308/{run.json,transcript.txt,passages/,summary.json}
// from this file's content and verifies every quote against the parsed transcript. `npm run build-pilot`.
const fs = require("fs");
const path = require("path");
const OUT = __dirname;
const shared = require("../../shared/transcript");
fs.mkdirSync(path.join(OUT, "passages"), { recursive: true });
const transcript = fs.readFileSync(path.join(__dirname, "transcript.txt"), "utf8");
const turns = shared.parseTranscript(transcript);
const NOW = "2026-10-02T14:00:00.000Z";
const RUN_ID = "pilot-jre2308";
const JP = "JORDAN PETERSON", JR = "JOE ROGAN";

const verifyQuote = shared.verifyQuote;

// ---------- attribution corrections (turn -> speaker), with cues ----------
const corrections = [
  [17, JR, .85, "Jamie went golfing — Jamie is the host's producer"],
  [18, JP, .7, "replies to the host about Jamie"],
  [19, JR, .8, "Jamie bought … golf clubs"],
  [29, JR, .8, "only people like Jamie are dumb enough — third-person about Jamie"],
  [41, JR, .6, "Have you gone into the whole George Floyd story — the host's recurring topic"],
  [42, JP, .6, "a situation can be ugly in a multitude of ways — reply to the above"],
  [44, JP, .6, "pick your moral pathway forward"],
  [47, JR, .6, "people want it to be binary"],
  [48, JP, .6, "organize yourself for combat … demoralized"],
  [50, JP, .6, "continuation of the previous point"],
  [52, JR, .6, "kill bad dudes — the host's military-guest phrasing"],
  [54, JR, .6, "continuation"],
  [56, JR, .6, "physical altercations with people"],
  [59, JP, .6, "put doubts behind you … act in half measures"],
  [60, JR, .6, "failed to act or hesitate to act, and it cost you"],
  [62, JP, .98, "in my clinical practice and with the students that I mentored"],
  [63, JR, .9, "Yeah — reply to the clinician"],
  [64, JP, .8, "With experience — continues his own point"],
  [65, JR, .8, "He who hesitates is lost — reply"],
  [66, JP, .7, "Yep"],
  [74, JP, .85, "conscientiousness … hedonism … Peter Pan — his vocabulary"],
  [75, JR, .8, "Yeah — reply"],
  [78, JR, .6, "people are afraid of losing fun"],
  [79, JP, .7, "that's why Christ says … become as little children"],
  [82, JP, .8, "you look at the world through eyes of memory"],
  [84, JP, .95, "I spend a lot of time trying to take apart the causes of truly pathological degeneration … Very curious about tyranny"],
  [85, JR, .9, "Play. — reply"],
  [169, JR, .75, "I don't get involved in these hissy pissy fits online, particularly on Twitter"],
  [170, JR, .98, "I see real conflict all the time as an MMA commentator … the Carlos Mencia conflict"],
  [173, JR, .6, "Earned reputation — reply"],
  [175, JR, .6, "Earned valid reputation with Jordan. That guy."],
  [177, JR, .6, "That's what people want — reply"],
  [179, JR, .9, "I'm willing to accept that you're smarter than me … I talk to a lot of people that are smarter than me"],
  [181, JR, .8, "Without a doubt — reply"],
  [184, JR, .7, "Is this where the term 'the woke right' comes in? — asks the theorist"],
  [186, JR, .7, "What he's talking about is similar types of behavior"],
  [188, JR, .7, "'Woke' just lets you clarify in your head"],
  [190, JR, .8, "Right? — reply"],
  [192, JR, .8, "Yes — reply"],
  [194, JR, .85, "And why is that? — asks"],
  [196, JR, .7, "Yeah, for sure. Well, this is a real subject."],
  [198, JR, .6, "It's a religion and it's also a race and it's also a government"],
  [199, JP, .6, "Right, right — reply"],
  [200, JR, .7, "intelligence agencies … manipulation of world markets and money … a lot to unpack"],
  [202, JR, .5, "They're also a walled garden, right? — picks up the other's earlier phrase"],
  [203, JP, .6, "Meaning… — asks for clarification"],
  [204, JR, .6, "They call themselves the Klan"],
  [205, JP, .7, "Community. — offers the word"],
  [206, JR, .7, "Yeah, community. They're very tight knit"],
  [208, JP, .95, "I watched your whole conversation with Douglas … all three of you"],
  [209, JR, .8, "Particularly now — reply"],
  [210, JP, .9, "you've let that guide you as a podcaster … I'm trying to work through exactly the same sort of thing"],
  [211, JR, .9, "Like, what do you mean? — the host asks"],
  [213, JP, .95, "We're trying to work this out in the Daily Wire side of things"],
  [214, JR, .7, "The worst at that now"],
  [215, JP, .7, "Yeah, I know"],
  [216, JR, .7, "They're the worst"],
  [217, JP, .7, "I know"],
  [218, JR, .7, "this is editorial bullsht"],
  [219, JP, .7, "No, it didn't — reply"],
  [221, JR, .98, "I had Bill Murray on the podcast"],
  [222, JP, .9, "Oh, really? Wow. — reply"],
  [223, JR, .9, "Isn't that crazy?"],
  [224, JP, .8, "Yeah. No."],
  [225, JR, .95, "what Tucker Carlson had told me"],
  [227, JP, .6, "you saw the government website … ? — asks the host"],
  [228, JR, .6, "Wild."],
  [229, JP, .6, "What are you supposed to do with that?"],
  [230, JR, .95, "right at the height of COVID was also when I had gone over to Spotify"],
  [231, JP, .7, "Yes, they didn't lock down"],
  [232, JR, .95, "I've had dinner with him, brought him to the comedy club"],
  [233, JP, .7, "He's great"],
  [234, JR, .98, "Jamie, pull it up"],
  [235, JP, .6, "Well."],
  [236, JR, .7, "And look at this lab"],
  [237, JP, .6, "Yeah, right. By the way."],
  [239, JR, .7, "that very famous White House post … psychological warfare that was played on the American people"],
  [241, JP, .98, "I was part of a group that started this organization in the UK called the Alliance for Responsible Citizenship"],
  [242, JR, .9, "So you're doing, like, a positive counter to the World Economic—"],
  [243, JP, .95, "we have some rules, and one rule is you don't use force or fear … can I tell you a story"],
  [244, JR, .9, "Please do."],
  [323, JR, .8, "what do you always say? Clean your room, make your bed"],
  [325, JR, .5, "What's going on?"],
  [327, JR, .8, "Sure. — answers 'Can I tell you another story?'"],
  [333, JR, .6, "That resonates."],
  [335, JR, .7, "Definitely. — reply to 'That's what you followed to make this show'"],
  [338, JR, .8, "you're talking about tyrants, right? — addresses the storyteller"],
  [340, JR, .6, "Right."],
  [342, JR, .8, "isn't it kind of celebrated among certain high achievers … business world"],
  [344, JR, .7, "Greed is good. That's … Michael Douglas, right?"],
  [346, JR, .6, "Greed is good."],
  [348, JR, .7, "I'm not advocating."],
  [351, JR, .7, "if they get rejected a lot, they associate women with pain"],
  [353, JR, .7, "that's how you get a woman hater"],
  [355, JR, .6, "they're not the pursuers"],
  [357, JR, .7, "wealth allows you to bypass the genetic social hierarchy"],
  [359, JR, .9, "Completely different background than him … whenever you can be nice — answers 'why are you respectable'"],
  [361, JR, .7, "I mean, both."],
  [363, JR, .9, "I get the posturing … And I was to many fighters"],
  [366, JR, .85, "The kings are almost precisely universally disciplined, focused and generally kind"],
  [368, JR, .7, "I think you have to be."],
  [370, JR, .8, "Miyamoto Musashi wrote about this in the Book of Five Rings"],
  [372, JR, .7, "if you're a narcissist and a sociopath, you know you are"],
  [374, JR, .6, "the positive feedback that you get from true kindness to others"],
  [376, JR, .5, "Then you're really alone."],
  [380, JR, .6, "if you do achieve success, it's hollow"],
  [383, JR, .7, "Right? — reply"],
  [386, JR, .95, "your countryman, George St. Pierre — said to the Canadian"],
  [391, JR, .9, "a university in Jerusalem … the acacia bush is rich in DMT — asks the Bible lecturer"],
  [431, JP, .98, "the ideas that I was teaching at Harvard and at U of T"],
];
const overrides = {}; const flags = [];
for (const [i, who, conf, cue] of corrections){
  const t = turns[i]; if (!t) throw new Error("no turn " + i);
  if (t.heading) throw new Error("turn " + i + " is a heading");
  if (t.label !== who) overrides[String(i)] = who;
  flags.push({ turn: i, labeled: t.label, likely: who, confidence: conf, cue });
}
const speaker = i => overrides[String(i)] || turns[i].label;

// ---------- passages ----------
function L(hs, g5){ return { hs, g5 }; }
function claim(text, who, type, hs, g5, extra){ return Object.assign({ text, speaker: who, type, basis: L(hs, g5), status: "unchecked", wouldSettle: "", receipts: [] }, extra || {}); }
function rcpt(url, note){ return { status: "receipt", receipts: [{ url, note, addedBy: "claude-in-chat", at: NOW }] }; }

const SRC = {
  ifs: "https://ifstudies.org/report-brief/the-devout-difference-religion-marital-quality-and-sex-among-americans",
  nasa: "https://www.nasa.gov/centers-and-facilities/goddard/carbon-dioxide-fertilization-greening-earth-study-finds/",
  cnbc: "https://www.cnbc.com/2022/02/01/us-covid-fatalities-reach-highest-level-in-a-year-as-omicron-cases-subside.html",
  nation: "https://www.thenation.com/article/environment/canada-mark-carney-climate/",
  woodward: "https://en.wikipedia.org/wiki/Bob_Woodward",
  pa: "https://x.com/petersonacademy/status/1917305963184275810",
};

const passages = [
{
  title: "A bad plan beats no plan", turnStart: 59, turnEnd: 66,
  stake: "Whether acting on an imperfect plan is better than waiting until you know what to do.",
  asSaid: [
    [62, "you should put together a bad plan and you should implement it. Because even if you fail in the implementation, you’ll gather information and then you can rectify the plan"],
    [62, "any plan is better than none. That’s a good rule of thumb. And a bad plan—a bad plan can be incrementally improved."],
    [65, "He who hesitates is lost."],
  ],
  deflated: L(
    "If you do not know what to do, waiting teaches you nothing. Acting on a rough plan teaches you something even when it fails, and you can fix the plan with what you learn. So a rough plan beats no plan. Rogan sums it up with a proverb: hesitating costs you.",
    "If you're stuck, don't just wait. Try something, even if it isn't perfect. When it goes wrong, you learn what to fix. Waiting teaches you nothing."),
  fidelity: ["faithful", L(
    "The rewrite keeps the structure and drops the clinical framing. It leaves out one thing: Peterson's claim that waiting makes you 'older and more miserable', which is an added cost, not part of the logic.",
    "The short version leaves out one thing he said: waiting also makes you sad and older.")],
  jump: [false, "", L(
    "The conclusion follows from the premises. The one unstated condition is that the failed attempt must be recoverable; the advice does not fit choices you cannot undo.",
    "This one holds up. It only works when a mistake can be fixed afterward.")],
  defense: L(
    "The argument needs no defense; the quoted words carry it. If anything, 'incrementally improved' already implies small, recoverable steps, so the unstated condition is half-stated.",
    "He already said to improve the plan a little at a time, so he was thinking about small steps."),
  revision: ["no", L("No challenge was raised, so nothing to revise. The missing condition (recoverability) is a limit on scope, not an error.", "Nothing to fix here.")],
  claims: [
    claim("Acting on an imperfect plan yields information that waiting does not.", JP, "value",
      "Sound as general advice, conditional on the attempt being recoverable.", "Good advice, as long as the mistake can be fixed."),
    claim("Staying in that malaise makes you older and more miserable.", JP, "interpretation",
      "A plausible observation stated as fact; no evidence offered and the argument does not depend on it.", "Probably true for a lot of people. He didn't prove it, and he didn't need to."),
  ],
  judgments: ["n/a", "valid"],
},
{
  title: "Algorithms and the time horizon", turnStart: 74, turnEnd: 76,
  stake: "Whether feeds tuned to momentary attention work against a person's longer-term goals.",
  asSaid: [
    [74, "there’s a big difference between what you might be interested in if you were diligently striving towards a long term goal that required conscientiousness. And what’s going to attract your attention right now?"],
    [74, "they maximize for short term attention and that’s a—so basically they’re actually optimizing for hedonism"],
    [74, "the problem with short term impulsive hedonism is it doesn’t play out well over any reasonable time span"],
  ],
  deflated: L(
    "Feeds are tuned to what grabs you right now, not to what you would choose while working toward a long-term goal. Those two things often differ. So a feed tuned to the moment pulls against your goals, and a life run on what grabs you in the moment goes badly over time.",
    "Apps show you whatever grabs your attention right now. That's usually not what helps you with what you really want. So the app pulls you off track, and living that way goes badly after a while."),
  fidelity: ["faithful", L(
    "The rewrite swaps 'hedonism' for 'what grabs you in the moment'. That removes a moral charge the speaker chose; the structure is unchanged.",
    "He used a stronger word, 'hedonism', which means chasing pleasure. The short version just says 'what grabs you'.")],
  jump: [false, "", L(
    "Two objective functions are named and the product is said to serve one of them, which is a fair description of engagement ranking. 'Doesn't play out well over any reasonable time span' is asserted rather than shown, but it is a modest claim.",
    "This one holds up. He says living for the moment goes badly later. He doesn't prove it, but it's a small claim most people accept.")],
  defense: L(
    "Not needed; the argument stands. The speaker also grants the design logic ('you could imagine that you would want a machine that offers you what you want'), which is fair to the other side.",
    "He even admits why someone would build an app like that. That's fair."),
  revision: ["no", L("Nothing to revise.", "Nothing to fix.")],
  claims: [
    claim("Recommendation algorithms maximize for short-term attention.", JP, "fact",
      "Engagement-optimized ranking is how the major feeds are documented to work, in the companies' own disclosures and in research. Not re-checked here.",
      "Apps are built to keep you looking. The companies have said so.", { wouldSettle: "Platform transparency documentation on ranking signals; research on engagement optimization.", settle: L("Platform transparency documentation on ranking signals; research on engagement optimization.", "What the companies themselves say about how their feeds pick posts, and studies of apps built to keep you looking.") }),
    claim("Short-term impulsive hedonism does not play out well over time.", JP, "value",
      "A judgment most traditions share; no evidence offered and the argument does not hinge on it.", "Most people agree that living only for right now goes badly. He didn't prove it, but he didn't need to."),
  ],
  judgments: ["strong", "valid"],
},
{
  title: "Play as the opposite of tyranny", turnStart: 84, turnEnd: 87,
  stake: "Whether 'play' is the right name for the opposite of tyranny, and what the cited science shows.",
  asSaid: [
    [84, "what’s the opposite of tyranny? It’s not freedom, by the way. It’s certainly not anarchic freedom. It’s not hedonistic freedom, benevolence. I think it’s play."],
    [87, "it has to be entered in voluntarily. You can’t force someone to play. And it’s also motivationally fragile. So mammals have a play circuit and it can be disrupted by pretty much any other motivational or emotional circuit"],
    [87, "because it has to be undertaken voluntarily, it’s the opposite of tyranny"],
  ],
  deflated: L(
    "Play only happens when everyone chooses to join, and it stops the moment someone is afraid or forced. Tyranny is rule by force and fear. So play and tyranny cannot coexist, which is why Peterson calls play the opposite of tyranny. Piaget is cited for play as the seed of small communities.",
    "You can't make someone play. If you force them, it stops being play. A bully rules by force. So playing and bullying can't happen at the same time. That's why he calls play the opposite of a bully."),
  fidelity: ["faithful", L(
    "Close to the words. The rewrite drops the 'walled garden' image and the marriage application; neither carries the argument.",
    "He also talked about a 'walled garden' and about his marriage. Those were left out because they don't change the argument.")],
  jump: [true, "because it has to be undertaken voluntarily, it’s the opposite of tyranny", L(
    "'Cannot coexist with tyranny' is true of many things (sleep, grief, an honest conversation). The science cited shows play is voluntary and fragile; it does not show play is the unique antithesis. The step from 'incompatible with' to 'the opposite of' is a framing choice presented alongside findings.",
    "Lots of things can't happen when someone is forcing you, not just play. So saying play is THE opposite of a bully is his choice of words, not something the science proved.")],
  defense: L(
    "Peterson is not claiming a proof. He says 'I think it's play' and frames it as a way to conceptualize the opposite of tyranny after rejecting other candidates (freedom, benevolence). As a conceptual proposal it does real work: it names something positive, voluntary and iterative that 'freedom' alone does not.",
    "He says 'I think', so he's offering an idea, not a proof. And it's a useful idea: it points at something good and chosen, not just 'no rules'."),
  revision: ["partly", L(
    "The challenge stands only against reading the passage as a finding. Read as a proposal, which the words support ('I think', 'conceptualize'), the gap narrows to this: the Piaget and mammal material illustrates the idea rather than establishing it. An earlier version called the imagery 'pure costume'; that overreached. The walled garden is a picture that explains the fragility point.",
    "If you read it as an idea, not a proof, most of the problem goes away. The science is there to explain the idea, not to prove it. Calling the garden picture useless was too harsh; it helps explain why play is easy to break.")],
  claims: [
    claim("Mammalian play is suppressed by fear and other strong motivational states.", JP, "fact",
      "Consistent with affective-neuroscience work on play (Panksepp is the usual citation). Not re-checked here.", "Scientists who study animals found that scared animals stop playing.", { wouldSettle: "Panksepp's play-circuit studies; reviews of rough-and-tumble play in rats.", settle: L("Panksepp's play-circuit studies; reviews of rough-and-tumble play in rats.", "The experiments by the scientist Panksepp on play in rats, and papers that sum them up."), expectedSources: ["academic_paper"], searchQuery: "play behavior mammals fear suppression Panksepp" }),
    claim("Play is the foundation of micro-community (Piaget).", JP, "interpretation",
      "A fair reading of Piaget on games and the origin of social rules.", "Piaget did say kids learn rules by playing games together."),
    claim("Play is the opposite of tyranny.", JP, "interpretation",
      "A framing proposal. Useful as a lens; not a result.", "This is his idea for how to think about it, not a fact."),
    claim("The walled garden is where play can take place.", JP, "image",
      "A picture of the protected conditions play needs. It explains the fragility point; it is not offered as evidence.", "It's a picture: play needs a safe space. It helps you see the point."),
  ],
  judgments: ["mixed", "gap"],
},
{
  title: "Religious couples, the pill, and pornography", turnStart: 88, turnEnd: 98,
  stake: "Who has the most sex, and whether the pill explains the rise in pornography use.",
  asSaid: [
    [89, "the people who have the most sex now are religious married couples, really."],
    [91, "the last hypothesis anyone would have possibly generated was that the cascading consequences of that over 50 years would be, well, radical increase in pornography use because sex has been made less dangerous by the pill"],
    [93, "But is that true? Because pornography essentially was very difficult to acquire before the birth control pill was invented."],
    [95, "Isn’t part of the excess use of pornography just because the access is so instantaneous now?"],
    [96, "Oh, definitely. But you could imagine too that you might have hypothesized that if the birth control pill took the threat out of sex, that pornography would be less necessary. That didn’t seem to work out."],
  ],
  deflated: L(
    "Peterson: churchgoing married couples now report more sex than other groups, and it is surprising that pornography use rose after the pill made sex safer. Rogan: pornography was hard to get before the internet; isn't instant access part of the rise? Peterson: yes, definitely; but one might still have expected the pill to make pornography less necessary, and it did not.",
    "Peterson says married people who go to church have the most sex, and that it's strange people watch more porn now that birth control made sex safer. Rogan says porn is easy to get now, and that's part of it. Peterson says yes, that's part of it, but he still finds it surprising."),
  fidelity: ["faithful", L(
    "An earlier version of this card said Peterson 'withdrew' the claim and that access 'explains the whole effect'. Neither is in the words. He accepted access as a factor ('Oh, definitely') and kept his point ('That didn't seem to work out'). The rewrite now reflects that.",
    "Before, this card said Peterson gave up his point. He didn't. He agreed with Rogan about one part and kept the rest.")],
  jump: [true, "radical increase in pornography use because sex has been made less dangerous by the pill", L(
    "The pill-to-pornography link is offered with the word 'because'. No mechanism or evidence is given, and a simpler cause (instant access) is on the table. The surprise only exists if the pill was the operative variable, and the passage does not show that it was.",
    "He says porn went up BECAUSE of birth control, but he doesn't show how. Rogan gives a simpler reason: it's easy to get now.")],
  defense: L(
    "Peterson's point is weaker than a causal thesis: he says a 1960s observer would not have predicted this pairing, which is about expectations, not mechanism, and he concedes access immediately. The religious-couples claim, separately, is supported by survey data.",
    "He's really saying 'nobody would have guessed this', not 'this is why it happened'. And he agrees with Rogan right away. His other claim, about church couples, is backed by surveys."),
  revision: ["partly", L(
    "The jump survives as stated, because 'because' is in the words. But the challenge should be sized to what was claimed: a loosely worded surprise, conceded in part, not a thesis defended and lost.",
    "He did say 'because', so the problem is real. But it was a small claim, and he partly agreed with Rogan, so it's a small problem.")],
  claims: [
    claim("Religious married couples have the most sex.", JP, "fact",
      "An Institute for Family Studies survey (Sept 2026) finds 62% of churchgoing married couples report weekly sex vs 48% of non-religious married couples; General Social Survey trends point the same way. Self-reported, with age and selection confounds, from an advocacy-leaning publisher. 'More than secular married couples' is what the data shows; 'the most' of any group is a stretch the data roughly supports.",
      "A survey found that married couples who go to church say they have sex more often than married couples who don't. People might not tell the truth on surveys, and the group that did the survey likes marriage and religion.",
      Object.assign({ expectedSources: ["survey_report","academic_paper"], searchQuery: "religious attendance marital sexual frequency survey" }, rcpt(SRC.ifs, "IFS, The Devout Difference (2026): 62% vs 48% weekly"))),
    claim("Pornography use rose because the pill made sex less dangerous.", JP, "unsupported",
      "No mechanism or data offered; the speaker accepts access as a factor. Internet access is sufficient to explain the rise in availability and use.", "He gives no proof, and he agrees that the internet is a big reason.", { wouldSettle: "Time series of pornography consumption against access (dial-up, broadband, mobile) versus contraceptive uptake.", settle: L("Time series of pornography consumption against access (dial-up, broadband, mobile) versus contraceptive uptake.", "Numbers over the years showing when pornography use rose, lined up against when fast internet arrived and when the pill became common."), expectedSources: ["academic_paper"], searchQuery: "oral contraceptive pornography consumption causal" }),
    claim("Instant access explains part of the rise in pornography use.", JR, "fact",
      "Uncontroversial; broadband and mobile adoption track consumption.", "Easy to see: it's on every phone now.", { expectedSources: ["academic_paper"], searchQuery: "internet access pornography consumption trends" }),
  ],
  judgments: ["mixed", "gap"],
},
{
  title: "Reputation, serotonin, and treasure in heaven", turnStart: 172, turnEnd: 181,
  stake: "Whether an earned reputation is indestructible, and whether status changes brain chemistry as described.",
  asSaid: [
    [178, "In the Gospels, Christ tells people to store up treasure in heaven where it doesn’t rust, where the thieves can’t steal it. That’s reputational treasure."],
    [178, "if you conduct yourself impeccably, you’ll develop a storehouse of reputation that will withstand all catastrophe. Nothing can touch it."],
    [178, "when your reputation rises, your serotonin levels rise, and that makes you less sensitive to negative emotion and more sensitive to positive emotion"],
    [180, "I think that virtualization has enabled the psychopaths."],
  ],
  deflated: L(
    "An earned reputation is the most valuable and safest thing you can own. When your standing rises, your serotonin rises, so bad things sting less and good things feel better; that is why losing face hurts. The best way to build reputation is a real quest rather than a status contest. Online, people can play status games anonymously and without consequence, which has enabled psychopaths.",
    "A good name is the best thing you can have and nobody can take it. When people respect you more, your brain makes you feel better and tougher. That's why being embarrassed hurts. The best way to earn respect is to really try to figure things out, not to show off. Online, people can show off and be cruel without getting caught."),
  fidelity: ["faithful", L(
    "'Withstand all catastrophe. Nothing can touch it' is kept at full strength because he said it twice. The 'treasure in heaven' reading is his, and the rewrite marks it as such.",
    "He really did say nothing can touch a good name, twice, so the short version keeps it.")],
  jump: [true, "will withstand all catastrophe. Nothing can touch it", L(
    "Two steps. The serotonin mechanism is carried from animal studies into humans as settled, with no hedge; the human evidence is thin and mixed. And 'nothing can touch it' is contradicted by ordinary experience and by Rogan's own divorce stories minutes earlier: reputations are destroyed, often unjustly.",
    "He says brain chemistry works the same in people as in animals, but that isn't proven. And he says nothing can hurt a good name, but people's good names get ruined all the time, sometimes unfairly.")],
  defense: L(
    "'Treasure in heaven' can be read as 'what you have become', which no one can confiscate even if they damage how you are seen; on that reading 'nothing can touch it' is about character, not public standing. The serotonin point is offered to explain why losing face hurts, not to prove reputation's value, and the behavioral claim (status loss dysregulates emotion) is widely observed whatever the chemistry.",
    "Maybe he means the good you've built inside yourself, which nobody can take even if they lie about you. And everyone knows losing face feels terrible, whatever is happening in the brain."),
  revision: ["partly", L(
    "If 'reputation' means character, the strong claim survives. But he says 'reputational' and 'storehouse of reputation', which is public standing. The serotonin challenge stands; the emotional observation it decorates does not depend on it.",
    "If he meant 'who you really are', he'd be right. But he said 'reputation', which is what others think of you, and that can be ruined. The brain-chemistry part is still not proven.")],
  claims: [
    claim("Rising status raises serotonin and changes emotional sensitivity in humans.", JP, "contested",
      "Suggestive in crustaceans and some primates; mixed and causally unclear in humans. Stated with no hedge. Not re-checked here.", "Found in lobsters and some monkeys. Not clearly shown in people.", { wouldSettle: "Human studies manipulating social status and measuring serotonergic markers; reviews of tryptophan-depletion and status research.", settle: L("Human studies manipulating social status and measuring serotonergic markers; reviews of tryptophan-depletion and status research.", "Studies where scientists change a person's rank and measure a brain chemical called serotonin."), expectedSources: ["academic_paper"], searchQuery: "social status serotonin humans dominance" }),
    claim("An impeccable reputation withstands all catastrophe.", JP, "unsupported",
      "Counterexamples are common: wrongful accusation, defamation, divorce. The co-host supplies some in this conversation.", "People with good names get ruined all the time, even when they did nothing wrong."),
    claim("'Treasure in heaven' refers to reputation.", JP, "interpretation",
      "One reading of Matthew 6. The traditional reading is close to the opposite: reward not visible to others.", "That's his reading of the Bible verse. Many readers take it the other way: good done in secret."),
    claim("Anonymity online enables psychopathic behavior.", JP, "fact",
      "Consistent with research on anonymity, disinhibition and trolling; the clinical label 'psychopaths' is looser than the evidence. Not re-checked here.", "Studies do find people act meaner when nobody knows who they are.", { expectedSources: ["academic_paper"], searchQuery: "online anonymity disinhibition trolling dark triad" }),
  ],
  judgments: ["weak", "gap"],
},
{
  title: "Cluster B and 'the ideas are irrelevant'", turnStart: 183, turnEnd: 193,
  stake: "Whether movements go wrong because of their ideas or because of the personalities that attach to them.",
  asSaid: [
    [189, "But the problem is that that argument is predicated on the claim that the ideas are the problem. Like the woke ideas, for example, on the right or the left. But that’s not the problem. The problem is that 4 to 5% of the population, something like that is Cluster B"],
    [189, "they go to where the power is and they adopt those ideas and they put themselves even on the forefront of that. But the ideas are completely irrelevant."],
    [191, "they’re the modern version of the Pharisees. They’re the people who use God’s name in vain as they proclaim moral virtue."],
  ],
  deflated: L(
    "About one person in twenty has a manipulative, self-serving personality. Those people attach themselves to whichever movement has power and use its ideas as cover. So when a movement turns ugly, the cause is the four percent, not the beliefs; the beliefs are irrelevant. He calls these people modern Pharisees.",
    "A few people out of every hundred are mean and sneaky on purpose. They join whatever group is winning and pretend to believe what it believes. So if a group does bad things, blame those few people, not the group's ideas. The ideas don't matter."),
  fidelity: ["faithful", L(
    "'Completely irrelevant' is his phrase and is kept at strength. The rewrite drops the DSM list and the dark-tetrad history, which support the prevalence figure but not the conclusion.",
    "He really did say the ideas don't matter at all. The list of personality types was left out because it doesn't change the conclusion.")],
  jump: [true, "But the ideas are completely irrelevant.", L(
    "'Bad actors exploit ideas' does not yield 'the ideas are irrelevant'. Both can be true: some ideas are easier to weaponize than others, and the same four percent produce different outcomes under different ideologies. As stated the claim also exempts every belief system from scrutiny, since any failure can be attributed to infiltrators, which leaves nothing to test.",
    "Just because sneaky people use ideas as a disguise doesn't mean the ideas don't matter. Some ideas are easier to twist than others. And if every bad thing is blamed on infiltrators, no idea can ever be blamed, so the claim can never be checked.")],
  defense: L(
    "Peterson is answering a specific argument (that 'woke' ideas, left or right, are the problem) and his counter is diagnostic: look at who is maneuvering, not at the slogans. Read as 'ideas are not the main variable in who ends up leading a movement', the claim is modest and consistent with the dark-triad research he cites. 'Completely irrelevant' is the overstatement, not the whole theory.",
    "He's arguing against someone who says the ideas are the whole problem. His point, 'watch who is grabbing power', is a fair one. He just said it too strongly."),
  revision: ["partly", L(
    "The jump survives on the words, but it is narrower than the first pass made it. The defensible core (personality predicts who exploits a movement) is real; the indefensible part is one word, 'completely'. The challenge should land on that word rather than on the theory.",
    "The problem is mostly one word: 'completely'. Take that out and his idea is reasonable.")],
  claims: [
    claim("4 to 5% of the population meets Cluster B criteria.", JP, "contested",
      "Published estimates for the four Cluster B disorders combined range from about 1.5% to 6% depending on the survey; his figure sits inside the range. Not re-checked here.", "Different studies get different numbers, from about 1 in 70 to 1 in 17. His number is in that range.", { wouldSettle: "NESARC and NCS-R prevalence tables; DSM-5-TR prevalence section.", settle: L("NESARC and NCS-R prevalence tables; DSM-5-TR prevalence section.", "The big national surveys that count how many people have these personality disorders, and the doctors' handbook (DSM-5-TR)."), expectedSources: ["academic_paper"], searchQuery: "cluster B personality disorders prevalence general population" }),
    claim("About 4% have dark-tetrad traits.", JP, "unscorable",
      "Dark-tetrad traits are measured on continua; there is no standard cutoff that yields a percentage.", "Those traits are measured on a scale, not yes/no, so there's no real 'four percent'."),
    claim("Personality-disordered people migrate to wherever power is.", JP, "interpretation",
      "A plausible model of opportunism; as stated it cannot be falsified, since any counterexample becomes a hidden case.", "Sounds right, but there's no way to prove it wrong, because he can always say the person was hiding it."),
    claim("The ideas are completely irrelevant.", JP, "unsupported",
      "The twentieth century supplies counterexamples where ideology shaped outcomes independent of personality.", "History has lots of cases where the ideas themselves made things worse."),
  ],
  judgments: ["mixed", "gap"],
},
{
  title: "The anti-Semitism exchange", turnStart: 194, turnEnd: 206,
  stake: "What is actually claimed in a passage that lists the themes of anti-Semitic conspiracy talk.",
  asSaid: [
    [198, "it’s one of those things where you can’t separate. It’s a religion and it’s also a race and it’s also a government."],
    [200, "And then there’s also the concept of intelligence agencies and compromise that also gets attached to it. The manipulation of world markets and money. And there’s a lot to unpack. And then there’s regular Jewish people who have nothing to do with that."],
    [201, "the Jews too are very successful. And so what you would expect from a purely statistical point of view is you’d expect them to be over-represented at the extreme."],
    [204, "They don’t proselytize, they don’t try to get you to join. And they’re all very tightly knit. They call themselves the Klan."],
  ],
  deflated: L(
    "Rogan: anti-Semitism is hard to discuss because 'Jewish' names a religion, an ethnicity and a state at once, and people attach claims about intelligence agencies and control of markets and money to it, which have nothing to do with ordinary Jews. Peterson: a successful group will be over-represented at any extreme just by the math. Rogan: Jews do not recruit, stick together, and call themselves a clan.",
    "Rogan says it's confusing because 'Jewish' can mean a religion, a people, or a country, and some people blame Jews for secret plots about spies and money, which isn't fair to regular Jewish people. Peterson says any group that does well will show up more at the top and the bottom. Rogan says Jewish people stick together and don't try to get others to join."),
  fidelity: ["faithful", L(
    "Attribution here rests on content cues; the transcript labels nearly all of it Peterson. 'Klan' is rendered 'clan' in the deflation because that is almost certainly the word meant; the quote keeps the transcript's spelling.",
    "The transcript's name labels are wrong here, so who said what is a best guess. The word 'Klan' is probably 'clan'.")],
  jump: [true, "And there’s a lot to unpack.", L(
    "The passage lists the standard conspiracy themes (intelligence compromise, markets, money) as things that 'get attached', neither endorsed nor rejected, then adds 'they stick together' and an in-group name no evidence supports. No claim is argued; associations are listed with a disclaimer at the end. Peterson's statistical point is the only step with a structure, and 'over-represented at the extreme' never says the extreme of what.",
    "Rogan lists the usual rumors about Jewish people without saying whether they're true, then says 'there's a lot to unpack' and doesn't unpack it. Peterson's math point is the only real argument, and it doesn't say what he's measuring.")],
  defense: L(
    "Rogan's stated aim is to explain why the topic is hard to discuss, and naming the rumors that circulate is part of describing the difficulty; he explicitly separates 'regular Jewish people' from them. Peterson's point is a correct statistical generality: a group with a higher mean or variance on a trait is over-represented in both tails, and he uses it to explain visibility, not to assign blame. 'They don't proselytize' is accurate as a description of mainstream Judaism.",
    "Rogan is trying to explain why this subject is hard to talk about, and he does say the rumors aren't about regular Jewish people. Peterson's math is correct in general. And it's true that Judaism doesn't go looking for converts."),
  revision: ["partly", L(
    "The challenge stands on structure: listing conspiracy themes without evaluating them leaves them in the air, and 'they call themselves the Klan' is false as stated. But an earlier version described the passage as 'maximum association', which reads motive into it. The defensible reading is a clumsy attempt to describe a hard subject, and the ledger should grade the claims, not the intent.",
    "The rumors were left hanging and the 'Klan' line is wrong. But the earlier version made it sound like Rogan was doing it on purpose, and that isn't fair. Grade what was said, not what he meant.")],
  claims: [
    claim("Jews call themselves 'the Klan'.", JR, "unsupported",
      "No basis known. Most likely a mangling of the ordinary word 'clan'. As stated, false.", "Not true. Probably the word 'clan'."),
    claim("A successful group is over-represented at the extremes.", JP, "fact",
      "True of any distribution with a shifted mean or larger variance. Uninformative about any group until the trait is named.", "True in math class. But he never says what he's measuring, so it doesn't tell you anything specific."),
    claim("Jewish communities do not proselytize.", JR, "fact",
      "Accurate for mainstream Judaism, which does not seek converts.", "True. Judaism doesn't go looking for new members."),
    claim("Intelligence agencies, compromise and market manipulation are 'attached' to the topic.", JR, "unscorable",
      "Named as things people say, neither asserted nor denied; nothing to grade until a specific claim is made.", "He says people say these things. He doesn't say if they're true, so there's nothing to check."),
  ],
  judgments: ["weak", "gap"],
},
{
  title: "Watergate as an intelligence operation", turnStart: 221, turnEnd: 225,
  stake: "Whether Watergate was an intelligence operation to remove Nixon, and what the evidence chain is.",
  asSaid: [
    [221, "the Woodward, Bernstein, Nixon thing at Watergate. That was all essentially an intelligence operation."],
    [221, "He read the first five pages like he goes, oh my God, they framed Nixon."],
    [225, "what Tucker Carlson had told me about Woodward being an intelligence asset. And then that was his first job ever as a journalist was Watergate"],
    [225, "it’s probably because, or likely because Nixon was very concerned with who killed Kennedy and he wanted to find out and he wanted to get that information out."],
  ],
  deflated: L(
    "Rogan: Watergate was essentially an intelligence operation. Bill Murray read five pages of Woodward's Belushi biography, found it badly wrong about his friend, and concluded Woodward had framed Nixon. Tucker Carlson told Rogan that Woodward had been an intelligence asset before Watergate, his first journalism job, and that FBI men were involved in the break-in. Rogan's suggested motive: Nixon was concerned with who killed Kennedy and wanted to get that information out.",
    "Rogan says Watergate was secretly run by spies. His friend Bill Murray read a little of a Woodward book that was unfair to his buddy, and decided the same writer must have set up Nixon. Another TV host told Rogan that Woodward used to work for the spy world. Rogan thinks the reason might be that Nixon wanted to tell people who killed President Kennedy."),
  fidelity: ["faithful", L(
    "An earlier version wrote 'Nixon was about to reveal who killed Kennedy'. The words are 'very concerned with who killed Kennedy … wanted to get that information out', hedged with 'probably because, or likely because'. The rewrite now keeps the hedge and the weaker verb.",
    "Before, this card said Nixon was about to tell everyone. Rogan actually said Nixon was worried about it and wanted to get the information out, and he said 'probably'. The card now says it his way.")],
  jump: [true, "he goes, oh my God, they framed Nixon.", L(
    "Every link is reported speech about reported speech: a friend's reaction to a different book, a television host's say-so, and 'probably because'. The conclusion is stated first and the chain assembled behind it. The documented record (Nixon's recorded conversations, the Senate hearings, the convictions of his aides) is not mentioned.",
    "Every piece of this is 'someone told me': a friend's feeling about a different book, a TV host's claim, and a 'probably'. The big conclusion comes first and the reasons come after. The tapes of Nixon's own voice aren't mentioned.")],
  defense: L(
    "There is a kernel: Woodward served as a Navy communications officer, including at the Pentagon, before journalism, and a 1991 book alleged he briefed the White House. That reporters relied on intelligence sources during Watergate is not fringe; 'Deep Throat' was the FBI's deputy director. Rogan hedges the motive twice. And Murray's reaction, as Rogan tells it, concerns Woodward's reliability as a biographer, which is a legitimate reason to doubt a writer.",
    "Some of it is real. Woodward was in the Navy and worked near the Pentagon before he was a reporter, and the famous secret source for the Watergate story really was a top FBI man. Rogan says 'probably' about the Kennedy part. And if a writer was unfair about your friend, it's fair to trust him less."),
  revision: ["partly", L(
    "The kernel does not carry the conclusion: having intelligence sources, or a Navy past, is not the same as Watergate being staged, and Nixon's own tapes are what removed him. The challenge stands on the inference. An earlier version said the argument had 'no load-bearing premise'; one premise (Woodward's background) bears some weight.",
    "Having spy-world friends is not the same as faking the whole scandal, and Nixon's own recordings are what ended him. So the big claim still doesn't follow. But one piece, Woodward's past, is real and counts for something.")],
  claims: [
    claim("Woodward was an intelligence asset before journalism.", JR, "contested",
      "Woodward served about five years as a Navy communications officer, part of it at the Pentagon. The stronger claim that he briefed the White House and was placed in journalism comes from the 1991 book Silent Coup and is denied by Woodward and the people named. An allegation, not a finding.",
      "He was in the Navy and worked near the Pentagon. A book from 1991 says more than that, and the people in it say the book is wrong.", Object.assign({ expectedSources: ["book_or_edition", "news_coverage"], searchQuery: "Woodward Navy briefer Silent Coup" }, rcpt(SRC.woodward, "Wikipedia: Navy service; Silent Coup allegation and denials"))),
    claim("Watergate was essentially an intelligence operation that framed Nixon.", JR, "unsupported",
      "Nixon's recorded conversations, the Senate hearings and his aides' convictions are not addressed. A friend's reaction to an unrelated biography is not evidence about Watergate.", "Nixon's own tapes, the hearings, and the people who went to jail are all left out. A friend's opinion of a different book isn't proof."),
    claim("Nixon was removed because he wanted to get out who killed Kennedy.", JR, "unsupported",
      "Hedged by the speaker ('probably … or likely'); no source offered.", "He says 'probably' and gives no source."),
  ],
  judgments: ["weak", "gap"],
},
{
  title: "COVID: 'we were all right'", turnStart: 227, turnEnd: 239,
  stake: "Whether a government web page vindicates 'everything' the skeptics said, and whether the Omicron premise is true.",
  asSaid: [
    [230, "All the things that would have gotten you fired if you were a professor and you said them four years ago, you would have 100% got fired for espousing any of these ideas that turned out to be true."],
    [234, "And turns out, luckily, we were all right. We were all correct, you know, and now the government shows it on their f*ing website"],
    [239, "“You’re looking forward to a winter of severe illness and death. And the hospitals that you will overwhelm.” Like, that was the White House telling you something when it was in Omicron. By that point, which was like a cold, like it was crazy, the deaths had dropped off radically"],
  ],
  deflated: L(
    "Rogan: a White House web page about COVID's origin now backs ideas that would have gotten a professor fired four years ago, so 'we were all right'. He also recalls the White House's December 2021 warning to the unvaccinated of 'a winter of severe illness and death', made, he says, when Omicron was like a cold and deaths had dropped off radically.",
    "Rogan says a new government web page agrees with things that used to get people in trouble for saying, so the doubters were right about everything. He also remembers the White House warning unvaccinated people about a deadly winter, and says that at the time the virus was mild and fewer people were dying."),
  fidelity: ["faithful", L(
    "'We were all right. We were all correct' is kept as spoken. The rewrite does not specify what 'all' covers, because the passage does not.",
    "He said 'we were right about everything' but didn't list the things, so the card can't either.")],
  jump: [true, "we were all right. We were all correct", L(
    "One real vindication (the lab-origin hypothesis moved from banned to officially endorsed) is spent on everything else that was said, without listing it. And the premise offered about Omicron is wrong on the record: US deaths were rising in December 2021 and reached a one-year high in early February 2022.",
    "Being right about one thing, where the virus came from, is used to say they were right about everything. And the part about fewer people dying is wrong: more people were dying then, not fewer.")],
  defense: L(
    "The lab-origin reversal is real and significant: people were deplatformed for a view a government page now asserts, and Rogan was a target. Omicron was milder per infection than Delta, which is what 'like a cold' points at. The Biden quote is accurate. The complaint about 'psychological warfare' is a judgment about tone, which the quote supports.",
    "He's right that people got punished for an idea the government now puts on its own website. He's right that this version of the virus was milder for each person who caught it. And the scary quote is real."),
  revision: ["partly", L(
    "The vindication claim survives for the one case named. The deaths claim does not: 'milder per infection' and 'deaths dropped off' are different statements, and the second is false for that winter. 'We were all right' remains unscorable until 'all' is listed.",
    "He's right about the one thing he names. He's wrong about deaths going down. 'Right about everything' can't be checked until he says what 'everything' is.")],
  claims: [
    claim("The White House warned the unvaccinated of 'a winter of severe illness and death'.", JR, "fact",
      "President Biden, 16 December 2021. Not re-checked here.", "Yes, the President said this in December 2021.", { wouldSettle: "White House transcript, 16 December 2021.", settle: L("White House transcript, 16 December 2021.", "The White House's own record of what the President said on 16 December 2021.") }),
    claim("By then the deaths had dropped off radically.", JR, "unsupported",
      "Wrong. US COVID deaths climbed through January 2022 to a seven-day average above 2,400 a day on 1 February 2022, the highest in about a year. Omicron was milder per infection; the death toll was not small.",
      "Not true. More people were dying each day in January and February 2022 than at almost any time in the previous year.", Object.assign({ expectedSources: ["government_data", "news_coverage"], searchQuery: "United States COVID-19 deaths January 2022 Omicron" }, rcpt(SRC.cnbc, "CNBC, 1 Feb 2022: 7-day average above 2,400 deaths/day, highest in a year"))),
    claim("A government web page endorses a lab origin for COVID.", JR, "contested",
      "The White House published such a page in April 2025. A government page asserting an origin is not the same as the question being settled; scientific opinion remained divided. Not re-checked here.",
      "The web page is real. But a government saying something doesn't make it settled; scientists still disagree.", { wouldSettle: "The page itself; intelligence-community assessments; peer-reviewed origin studies.", settle: L("The page itself; intelligence-community assessments; peer-reviewed origin studies.", "The web page itself, the spy agencies' reports, and scientists' published studies on where the virus came from.") }),
    claim("We were all right.", JR, "unscorable",
      "No list of what 'all' covers.", "He doesn't say what 'all' means, so it can't be checked."),
  ],
  judgments: ["mixed", "gap"],
},
{
  title: "Moses, the rock, and the definition of a tyrant", turnStart: 246, turnEnd: 260,
  stake: "What the Moses story is used to establish, and whether the resulting definition of tyranny distinguishes anything.",
  asSaid: [
    [246, "God tells Moses to go to some rocks in the desert and to ask them to bring water forth. And so he goes with his people to these rocks, and instead of asking, he takes this staff of his."],
    [246, "It’s your staff if you have an organization, same derivation, but it’s also the magic wand of Gandalf. It’s the flag you plant in new territory. It’s the Tree of Life."],
    [246, "you can tell the tyrants, they use fear and compulsion and they don’t use invitation."],
    [260, "if you yet then turn to fear and compulsion as your means of governance, then you’re a tyrant. I don’t care what your excuse is. It has to be invitational."],
  ],
  deflated: L(
    "In Numbers 20, Moses is told to speak to a rock for water and strikes it with his staff instead; he is barred from the promised land. Peterson reads the staff as the symbol of authority and the strike as force used where words were called for. His rule: leaders invite; anyone who governs by fear or compulsion is a tyrant, whatever the excuse. ARC adopted 'invitation only' as a rule on that basis.",
    "In the Bible, God tells Moses to talk to a rock to get water. Moses hits it with his staff instead, and he's punished. Peterson says the staff stands for power, and hitting the rock means using force when words were asked for. His rule: real leaders invite you; anyone who rules by fear or force is a bully, no matter the reason."),
  fidelity: ["faithful", L(
    "An earlier version called the staff imagery 'pure costume'. That was a category error: the chain (staff, wand, flag, tree, serpent) explains why striking with the staff means force and authority. It is an image, not evidence, and the rewrite now treats it that way.",
    "Before, this card said the part about the staff was just decoration. That was wrong. It explains why hitting the rock with the staff means using power.")],
  jump: [true, "if you yet then turn to fear and compulsion as your means of governance, then you’re a tyrant. I don’t care what your excuse is.", L(
    "The definition is widened until it stops distinguishing. Every government that has had a law, a police force, a tax or a public-health warning has used fear and compulsion as a means of governance. Defined that broadly, 'tyrant' applies to all of them, and the word no longer separates Pharaoh from a city council. The story illustrates the rule; it does not derive it.",
    "If anyone who ever uses fear or force is a bully, then every government ever is a bully, because they all have laws and police. The word stops meaning anything. The story is a good example, but it doesn't prove the rule.")],
  defense: L(
    "Peterson's target is 'fear and compulsion as your means of governance', the primary method, not any use of force. The Moses story makes exactly that distinction: Moses, who had used force before, is condemned for using it where invitation was commanded. And the rule is openly normative, stated as a commitment ('we're not going to use force or fear ever'), not as a discovery.",
    "He may mean leaders whose main tool is fear, not any leader who ever uses force. Moses is punished for using force at a moment when he was told to use words. And Peterson says this is a rule he chose, not a fact he found."),
  revision: ["partly", L(
    "Read as 'primary means', the definition is defensible and the jump narrows to how it is applied: in the next passages the rule is used against a public-health warning and a showerhead regulation, which stretches 'primary means of governance' past what the words here support. The imagery charge is withdrawn.",
    "If he means 'mostly rules by fear', that's fair. The problem is how he uses the rule later, on things like shower rules, which aren't ruling by fear. The complaint about the staff story is taken back.")],
  claims: [
    claim("Numbers 20: Moses struck the rock and was barred from the promised land for it.", JP, "interpretation",
      "A legitimate traditional reading; the text gives the punishment without a single stated reason, and 'force instead of speech' is one of several.", "That is one way people have always read the story. The Bible doesn't say exactly why Moses was punished."),
    claim("Tyrants use fear and compulsion; leaders use invitation.", JP, "value",
      "A moral commitment, clearly stated as one. Not derived from the story; illustrated by it.", "This is what he believes leaders should do. The story is an example, not a proof."),
    claim("The staff is the wand, the flag, the Tree of Life, the serpent.", JP, "image",
      "A chain of associations that explains why the staff signifies authority. Not offered as evidence; meaningful as a frame.", "A picture to show the staff means power. It's not proof of anything; it helps you see the story."),
    claim("ARC's rule is invitation only, never force or fear.", JP, "fact",
      "A statement about his own organization; not checked.", "He says his group has this rule. Not checked.", { wouldSettle: "ARC's published principles.", settle: L("ARC's published principles.", "The rules ARC has published about itself.") }),
  ],
  judgments: ["n/a", "gap"],
},
{
  title: "Carney's Values and fossil fuels", turnStart: 273, turnEnd: 277,
  stake: "What Carney's book says, and whether a policy stance can be read as a personality trait.",
  asSaid: [
    [275, "I read Carney’s book Values. I read it twice, and I understood it."],
    [275, "Every single financial decision that every individual or organization makes has to prioritize decarbonization above all else, or else."],
    [275, "And then he says 75% of the world’s fossil fuels have to stay in the ground. And this is who Canadians are seriously thinking about electing."],
  ],
  deflated: L(
    "Peterson read Mark Carney's book Values twice. He says it advocates central planning through ESG, that Carney writes that every financial decision must prioritize decarbonization above all else, implying many will pay a price, and that 75% of the world's fossil fuels must stay in the ground. He offers this as an example of the narcissism discussed earlier and as a warning about electing Carney.",
    "Peterson read Carney's book twice. He says the book wants experts to steer the economy, says everyone must put cutting carbon first, admits many people will be hurt, and says most oil and coal must stay in the ground. Peterson says this shows Carney wants too much control, and Canadians shouldn't elect him."),
  fidelity: ["faithful", L(
    "'Or else' and 'above all else' are Peterson's paraphrase of the book, not quotations, and the rewrite keeps them as his. The 75% figure is presented as the book's and treated as a claim about the book.",
    "Some of these are Peterson's words about the book, not the book's words. The card keeps them as his.")],
  jump: [true, "a good example of this kind of narcissism that we talked about earlier", L(
    "A policy position (most reserves must stay unburned) is recast as a personality trait (narcissism) without an argument connecting them. The carbon-budget figure is a widely published result of climate arithmetic, which Carney reports; describing a reported figure as narcissism attributes motive where a disagreement about policy would do.",
    "He turns a policy opinion into a personality problem without showing the link. The 'leave most fuel in the ground' number comes from climate math that many people report; saying it shows narcissism is about Carney's character, not his argument.")],
  defense: L(
    "Peterson says he read the book twice and is summarizing its stance, and Carney's record supports the broad description: he led ESG initiatives and has endorsed carbon-budget analyses that put most reserves off limits. 'Above all else' is a fair gloss of a book that argues for pricing climate risk into every financial decision. The electoral warning is an opinion he is entitled to state.",
    "He did read the book carefully, and Carney really has pushed these ideas. 'Put carbon first' is a fair summary of a book about putting climate into every money decision. And he's allowed to say who he wouldn't vote for."),
  revision: ["partly", L(
    "The factual summary survives in substance (figure in the right neighborhood; stance accurately described). The narcissism inference does not; it is the motive-reading move again. The 'or else' paraphrase could not be checked against the text.",
    "His summary of the book is mostly fair. Calling it narcissism is the part that doesn't follow. The 'or else' part couldn't be checked.")],
  claims: [
    claim("Carney's book says 75% of fossil fuels must stay in the ground.", JP, "contested",
      "Carney has endorsed carbon-budget analyses; a 2023 report he backed puts the figure at 65% of oil and gas and 90% of coal. In the neighborhood, and a citation of carbon-budget arithmetic rather than a personal preference. The exact wording in Values was not checked.",
      "Carney has supported reports saying most oil, gas and coal must stay in the ground. The numbers are close to what Peterson said. The exact page in the book wasn't checked.", Object.assign({ expectedSources: ["book_or_edition"], searchQuery: "Carney Values unburnable reserves" }, rcpt(SRC.nation, "The Nation: Carney endorsed ETC report, 65% oil/gas and 90% coal unburnable"))),
    claim("Every financial decision must prioritize decarbonization above all else, or else.", JP, "unscorable",
      "Peterson's paraphrase; the book's wording was not available to check.", "This is Peterson's summary. The book's own words weren't checked.", { wouldSettle: "The text of Values (2021), chapters on climate and value.", settle: L("The text of Values (2021), chapters on climate and value.", "The actual pages of Carney's book Values (2021) about climate.") }),
    claim("Carney advocates central planning via ESG.", JP, "interpretation",
      "Carney championed ESG and climate-risk disclosure; whether that is 'central planning' is a characterization.", "Carney did push companies to count climate risk. Calling that 'central planning' is Peterson's opinion."),
    claim("This is an example of narcissism.", JP, "unsupported",
      "No link offered between the policy and the trait.", "He doesn't show how the policy proves the personality."),
  ],
  judgments: ["mixed", "gap"],
},
{
  title: "Climate: greening and the psychological turn", turnStart: 279, turnEnd: 301,
  stake: "What the greening data shows, and what happens when the argument moves from evidence to motive.",
  asSaid: [
    [281, "The graph that shows the temperature of Earth. Have you seen it? We’re in a cooling period."],
    [282, "If you go back 500 million years ago, which is quite a lot longer, we’re in a drought, like a serious carbon dioxide drought."],
    [287, "The planet is 20% greener than it was 30 years ago. Okay, 20%. This is NASA data. I’m not inventing this."],
    [287, "Now, whether all that additional carbon dioxide is a function of human activity, that’s still debatable."],
    [294, "because I’m not a climate scientist, whatever the hell that is, by the way."],
    [294, "So today I’m talking about something that’s a lot more psychological. The climate apocalypse narrative is a social contagion that’s driven by power-mad psychopaths"],
  ],
  deflated: L(
    "Rogan: on a 500-million-year graph the Earth is in a cooling period. Peterson: on that scale we are in a CO2 drought, and the conclusion you draw depends on where you start the graph. Satellites show the planet about 20% greener than 30 years ago, with crop yields up 13%, and the greening is strongest at desert margins. Whether the extra CO2 is human-caused is still debatable. Peterson says he is not a climate scientist and may have gone outside his expertise before, so this time he is making a psychological argument: the climate-apocalypse narrative is a social contagion driven by power-seeking psychopaths who use fear and compulsion.",
    "Rogan says that if you look at millions of years, Earth is in a cool period. Peterson says on that scale there's also very little CO2, and it depends where you start the chart. Satellites show more plants than 30 years ago, and more food grown. He says we don't know if people caused the extra CO2. He says he isn't a climate scientist, so this time he's talking about the people who warn about climate: he thinks they're power-hungry and use fear."),
  fidelity: ["faithful", L(
    "An earlier version wrote that Peterson 'can't judge the climate forecasts himself'. His words are 'I'm not a climate scientist' and 'maybe I stepped a bit out of my wheelhouse'. The rewrite now uses his words. 'Rates of change have their problems' is his own concession and is kept.",
    "Before, this card said Peterson admitted he can't judge the science. He actually said he isn't a climate scientist and may have gone too far before. The card now says it his way. He also admitted that fast change is a problem, and that's kept.")],
  jump: [true, "So today I’m talking about something that’s a lot more psychological.", L(
    "After presenting data that bears on whether warming is harmful (greening) and conceding the one point that would decide it ('rates of change have their problems'), the argument moves from the evidence to the character of the people making the forecasts. The greening data is real and is attached to a conclusion it cannot reach: more leaf area says nothing about sea level, heat or the pace of change. 'Driven by power-mad psychopaths' cannot be tested, since any counter-evidence counts as more contagion.",
    "He shows real facts about more plants, admits the real problem is how fast things change, and then switches to talking about the people who warn about climate instead of the facts. More plants doesn't tell you about rising seas or heat. And 'they're all power-hungry' can't be checked, because any disagreement just counts as more proof.")],
  defense: L(
    "Peterson is explicit about the move: he is not arguing the climate science, he is arguing about how an apocalyptic narrative is used, which is a psychological question he is qualified to raise. The greening data is accurate in direction and under-reported, which is his stated point. His 'origin point of your graph' observation is methodologically correct. And his concession on rates of change shows he is not denying the mechanism.",
    "He says up front he's not arguing the science, he's arguing about how fear is used, and he does know about that. The plant facts are real and rarely mentioned. His point about where you start a chart is a good one. And he admits fast change matters."),
  revision: ["partly", L(
    "The methodological points (graph origin, greening under-reported) survive. Two things do not: 'whether the CO2 rise is human-caused is debatable' contradicts settled measurement, and the shift to motive is the same move as in the Cluster B and Carney passages; announcing it does not make it an argument.",
    "He's right about charts and about plants. He's wrong that we don't know where the extra CO2 comes from. And switching from facts to 'they're bad people' isn't an argument, even when you announce it.")],
  claims: [
    claim("The planet is 20% greener than 30 years ago (NASA).", JP, "contested",
      "NASA/Zhu et al. (2016): a quarter to half of vegetated land greened 1982–2015, leaf-area gain equal to about twice the continental US, roughly 70% attributed to CO2 fertilization. '20% greener' is not the study's figure; 'twice the United States' is. The authors warn the effect fades as plants acclimate and is offset by warming harms.",
      "NASA did find a lot more leaves, about as much new green as two United States. '20%' isn't the number NASA gave. NASA also said the effect fades and warming hurts in other ways.",
      Object.assign({ expectedSources: ["academic_paper","government_data"], searchQuery: "greening of the Earth and its drivers leaf area" }, rcpt(SRC.nasa, "NASA (2016): 25–50% of vegetated land greened; ~2× continental US; ~70% CO2 fertilization"))),
    claim("Agricultural output is up 13%.", JP, "unscorable",
      "No source, baseline year or attribution given.", "He doesn't say where this number comes from or compared to when."),
    claim("Whether the CO2 rise is human-caused is debatable.", JP, "unsupported",
      "Not debated among those who measure it: the isotopic signature and emissions accounting both point to fossil fuels. Not re-checked here.", "Scientists can tell where the extra CO2 comes from by its chemical fingerprint, and it's from burning fuel.", { wouldSettle: "IPCC AR6 WG1 Chapter 5; carbon-isotope records of atmospheric CO2.", settle: L("IPCC AR6 WG1 Chapter 5; carbon-isotope records of atmospheric CO2.", "The big climate report (IPCC, 2021) and measurements of the chemical fingerprint of the CO2 in the air."), expectedSources: ["academic_paper", "agency_report"], searchQuery: "anthropogenic CO2 attribution isotope fossil fuel" }),
    claim("On a 500-million-year scale, Earth is cool and CO2-poor.", JP, "fact",
      "True on geologic timescales, and beside the rate question he concedes.", "True if you look at millions of years. It doesn't answer the question about how fast things are changing now."),
    claim("The climate-apocalypse narrative is a social contagion driven by power-mad psychopaths.", JP, "unscorable",
      "Not falsifiable as stated.", "There's no way to test this; any disagreement counts as proof."),
  ],
  judgments: ["mixed", "gap"],
},
{
  title: "Abraham and the instinct to develop", turnStart: 329, turnEnd: 336,
  stake: "Whether the existence of a drive to develop shows that following it benefits everyone.",
  asSaid: [
    [332, "Imagine that we have an instinct in us, or divine voice, I don’t care which of those you use, an instinct within us that calls us to develop"],
    [332, "If you did that, to follow that instinct, then you’d be a blessing to yourself. Your name would become known among your people. You’d establish something of permanent significance. No one could stand before you, and it would bring abundance to everyone"],
    [332, "that speaks of a concordance which has to be there"],
    [334, "The alternative is preposterous, right? The alternative is that we don’t have an instinct to develop."],
  ],
  deflated: L(
    "Humans have a drive to grow and explore; you can see it in children. The Abraham story promises that following that drive brings five rewards: fulfillment, a good name, lasting work, no enemies left standing, and abundance for all. Peterson: since we obviously have the drive, the promise must hold, because the only alternative is that the drive does not exist, which is absurd.",
    "People are born curious and want to grow. The Bible story about Abraham says if you follow that urge, five great things happen to you and to everyone around you. Peterson says this must be true, because the only other option is that people aren't curious, and that's silly."),
  fidelity: ["faithful", L(
    "The rewrite condenses his five promises; 'no one could stand before you' is kept because it is the strongest. 'Preposterous' and 'stupid theory' are his words about the alternative.",
    "The five promises were shortened. 'Preposterous' is his word.")],
  jump: [true, "The alternative is preposterous, right? The alternative is that we don’t have an instinct to develop.", L(
    "A false dichotomy. The alternative to 'following your drive brings abundance to everyone' is not 'the drive does not exist'. It is 'the drive exists and often leads to ruin, or to your gain at others' cost', which is also visible in children and in history. The five-part promise is asserted; the only thing argued is the existence of curiosity, which nobody disputes.",
    "He says it's either 'follow your drive and everything goes well' or 'there's no drive'. But there's a third option: the drive is real and sometimes leads you off a cliff, or you win while others lose. He proves people are curious, which nobody argued about, and skips the five promises.")],
  defense: L(
    "Peterson does name a second alternative a few lines later: that what brings you into the world is 'done at the expense of other people', the power orientation, and he argues against it on the ground that it does not iterate socially. So the dichotomy is not as bare as the pivot line suggests. The concordance claim is framed as an evolutionary conjecture put to a biologist, not as a proof.",
    "A little later he does mention another option: getting ahead by hurting others. He argues that doesn't last. So he isn't only giving two choices. And he says this is an idea he tested on a scientist friend, not a proven fact."),
  revision: ["partly", L(
    "The challenge narrows: he considers two alternatives, not one, and dismisses the second with an argument ('it doesn't iterate'). What remains unargued is the leap from 'development instinct exists and power fails' to 'development brings abundance to everyone'; benign failure (the drive leads somewhere harmless but useless) is never considered. Citing Bret Weinstein's change of mind is an appeal to a convert, not evidence, and that stands.",
    "He gives two other options, not one, and argues against the second. But he never considers that following your drive might just not work out. And a friend changing his mind isn't proof.")],
  claims: [
    claim("Humans have an exploratory drive.", JP, "fact", "Not in dispute.", "True. Everyone agrees.", { expectedSources: ["academic_paper"], searchQuery: "exploration curiosity drive humans development" }),
    claim("Genesis 12 promises Abraham blessing, a name, permanence, victory over enemies, and abundance for all.", JP, "interpretation",
      "A fair paraphrase of the covenant promises.", "Yes, that's roughly what the story says."),
    claim("Following the development instinct brings those five outcomes.", JP, "unsupported",
      "Asserted, defended by ruling out alternatives, never shown.", "He says it but doesn't show it."),
    claim("There must be a concordance between what develops us and what benefits the world.", JP, "interpretation",
      "An evolutionary conjecture; the opposite (traits good for the individual, bad for the group) is common in biology.", "A guess about evolution. In nature, what's good for one animal is often bad for the group."),
  ],
  judgments: ["n/a", "gap"],
},
{
  title: "Incels, Andrew Tate, and 'monster is better than wimp'", turnStart: 349, turnEnd: 384,
  stake: "Whether admiring Tate is a developmental stage, and whether 'monster is better than wimp' is a fact or a value.",
  asSaid: [
    [349, "They’d rather be Andrew Tate than an incel. And they’re right."],
    [349, "That’s the incorporation of the shadow from the Jungian perspective."],
    [366, "The kings are almost precisely universally disciplined, focused and generally kind."],
    [382, "it is very crucial to get this progression correct, because monster is better than wimp."],
    [384, "But the question is, what’s better than monster?"],
  ],
  deflated: L(
    "Peterson: lonely, rejected young men are drawn to Andrew Tate because being feared beats being ineffectual, and they are right that it is a step up. In Jung's terms that is taking on the shadow; the next stage integrates care and kindness without losing strength. Rogan: the greatest fighters are almost all disciplined and kind; the narcissistic ones get close but not to the top. Peterson: that is the same progression; 'monster is better than wimp', but the question is what is better than monster.",
    "Peterson says boys who get rejected like Andrew Tate because being scary feels better than being invisible, and that's a real step up. The next step is to stay strong but also become kind. Rogan says the best fighters are almost always the kind ones. Peterson says that's the same idea: a monster beats a wimp, but something beats a monster."),
  fidelity: ["faithful", L(
    "'And they're right' is kept, since it is the controversial endorsement. Rogan's 'almost precisely universally' is kept as 'almost all'.",
    "He really did say the boys are right to prefer Tate, so that's kept.")],
  jump: [true, "monster is better than wimp", L(
    "A value judgment is delivered as a developmental fact, with Jung as the frame. Jung's stages are a framework, not a finding, and nothing here shows that admiring Tate is a stage people pass through rather than a place they stay. 'Better' is never defined: better for whom, by what measure. Rogan's champion observation is an anecdote with a near-universal quantifier.",
    "Saying a monster is 'better' than a wimp is an opinion dressed up as a fact about how people grow. Jung's stages are a way of thinking, not a proven path. Nothing shows the boys move on instead of staying stuck. And 'better' for who?")],
  defense: L(
    "Peterson is not endorsing Tate; he explains the pull and insists Tate is 'a stepping stone', not 'the pinnacle'. Framed as 'first agency, then integration', the claim is close to standard developmental psychology, and he grounds it in a conversation with Russell Brand about why that path proves hollow. Rogan's claim is bounded ('almost') and comes from decades of first-hand observation.",
    "He isn't saying Tate is good. He's saying boys are drawn to him for a reason, and that they should move past him. 'First get strong, then get kind' is a normal idea about growing up. Rogan has watched fighters for decades and says 'almost', not 'all'."),
  revision: ["partly", L(
    "The explanatory account (why Tate appeals) survives and is fair to the men it describes. The ranking does not become a fact by being placed in a Jungian sequence, and 'and they're right' is a value claim many would reject on the ground that cruelty is not a step toward kindness. Rogan's anecdote is honest observation with easy counterexamples; it is evidence of a tendency, not a law.",
    "His explanation of why boys like Tate is fair. But 'monster beats wimp' is still an opinion, and plenty of people think being cruel doesn't lead to being kind. Rogan's point is a real pattern he's seen, not a rule.")],
  claims: [
    claim("Rejected young men are drawn to Tate because being feared beats being ineffectual.", JP, "interpretation",
      "A reasonable account, consistent with what such men say about themselves.", "That matches what those boys say."),
    claim("Monster is better than wimp.", JP, "value", "A ranking, not an observation; 'better' undefined.", "An opinion. He doesn't say better at what."),
    claim("Preferring Tate is a stage in Jungian individuation, followed by integrating the anima.", JP, "interpretation",
      "Jung's stages are a framework; no evidence that this path is typical rather than a dead end.", "That's Jung's map of growing up. Nobody has shown boys actually follow it here."),
    claim("Champions are almost universally disciplined and kind.", JR, "contested",
      "A first-hand tendency from decades of commentary, stated with a near-universal quantifier; counterexamples exist in his own sport.", "He's seen a lot of fighters and says most champions are kind. Some famous ones aren't.", { expectedSources: ["academic_paper"], searchQuery: "elite athletes personality traits agreeableness conscientiousness" }),
    claim("Women are the gatekeepers of sex.", JP, "interpretation",
      "A generalization about mating dynamics with support in evolutionary psychology and obvious exceptions; stated as 'fundamentally'.", "A general idea about dating that is often true and not always."),
  ],
  judgments: ["weak", "gap"],
},
{
  title: "Peterson Academy update", turnStart: 413, turnEnd: 421,
  stake: "Whether the figures offered about Peterson Academy support the claim that it is the future of higher education.",
  asSaid: [
    [415, "we launched Peterson Academy in September and we talked about it and it’s been a stunning success. We have 40,000 students."],
    [417, "We’re one of the most rapidly capitalized companies ever, especially with our degree of investment, because we run a lean show."],
    [421, "we are dropping the price from $599 to $399 a year as of today."],
    [421, "we discovered that 40% of courses at university are now online. And we’ve investigated some of those courses. Many of them are PowerPoint presentations."],
    [421, "we literally have the best professors in the world and unmatched production quality."],
  ],
  deflated: L(
    "Peterson Academy launched in September, has 40,000 students and 15,000 active users on its social platform, removed ten disruptive users, raised money fast, and is cutting its price from $599 to $399 a year. Peterson says 40% of university courses are now online and many are just slide decks, so his academy, with the best professors in the world, must be the future of higher education.",
    "Peterson's online school started in September, has 40,000 students, kicked out ten troublemakers, raised money quickly, and is now cheaper. He says many college classes are just online slideshows, so his school, with the best teachers in the world, is the future."),
  fidelity: ["faithful", L(
    "This is a promotional segment and the deflation treats it as one. The superlatives are kept as his.",
    "This part is an advertisement. His big words are kept as his.")],
  jump: [true, "this has to be the future of higher education", L(
    "The step from 'some online university courses are poor' to 'this has to be the future of higher education' skips every alternative, including universities improving their own online teaching. The supporting figures are the company's own and unverifiable from outside.",
    "Just because some college classes are bad doesn't mean his school has to be the future. Colleges could get better. And all his numbers come from his own company.")],
  defense: L(
    "A founder describing his company is expected to promote it, and he gives checkable specifics (student count, price, active users) rather than only adjectives. The price cut is confirmed by the company's own announcement. The complaint that much online university teaching is slide decks is widely shared.",
    "Of course he talks up his own school. He gives real numbers that could be checked, and the price cut is real. Lots of people agree that many online college classes are boring slideshows."),
  revision: ["partly", L(
    "The specifics are the company's figures and stay unverified except the price. The inference to 'has to be the future' remains unsupported.",
    "His numbers can't be checked except the price, which is real. The 'future of college' claim still isn't shown.")],
  claims: [
    claim("Price cut from $599 to $399 a year.", JP, "fact",
      "Confirmed by Peterson Academy's own announcement, April 2025.", "The company said this too.", Object.assign({ expectedSources: ["company_statement"], searchQuery: "Peterson Academy price 399" }, rcpt(SRC.pa, "Peterson Academy on X: $599 to $399"))),
    claim("40,000 students.", JP, "unscorable", "The company's own figure; no outside check available.", "Only his company says so.", { wouldSettle: "Independent reporting or audited figures.", settle: L("Independent reporting or audited figures.", "Numbers checked by someone outside his company.") }),
    claim("40% of university courses are now online.", JP, "contested",
      "Plausible for US enrollment in at least one online course after 2020; the specific figure and definition were not checked.", "Could be right; depends what you count. Not checked.", { wouldSettle: "NCES/IPEDS distance-education enrollment tables.", settle: L("NCES/IPEDS distance-education enrollment tables.", "The US government's count of how many college students take online courses."), expectedSources: ["government_data"], searchQuery: "distance education enrollment share IPEDS" }),
    claim("The best professors in the world.", JP, "unscorable", "Superlative with no measure.", "No way to measure 'best'."),
    claim("This has to be the future of higher education.", JP, "value",
      "A prediction stated as necessity; no argument offered beyond the slide-deck complaint.", "A guess about the future stated like a fact."),
  ],
  judgments: ["weak", "gap"],
},
{
  title: "Carnivore diet and ketones", turnStart: 435, turnEnd: 446,
  stake: "What four anecdotes and a planned study can support about an all-meat diet.",
  asSaid: [
    [438, "my daughter was so sick and now she’s great. Isn’t it crazy? It’s crazy. Well, my wife is on this carnivore diet too. And it’s been unbelievably good for her."],
    [439, "It’s unbelievably good for almost everybody. That’s what’s really nuts."],
    [440, "your brain likes to run on ketones, as it turns out."],
    [444, "We’re going to run a study and IQ test people."],
  ],
  deflated: L(
    "Peterson's daughter and wife improved on an all-meat diet; Rogan says it is unbelievably good for almost everybody and that he thinks more sharply on it. Peterson: the brain likes to run on ketones. He plans two randomized studies, including personality and IQ tests.",
    "Peterson's daughter and wife got better eating only meat. Rogan says it's great for almost everyone and makes him think better. Peterson says the brain likes running on ketones, and he plans to do real studies."),
  fidelity: ["faithful", L(
    "Both men's claims are kept at the strength spoken; Peterson's planned study is included because it bears on the evidence available.",
    "Kept as they said it, including the plan to do a study.")],
  jump: [true, "It’s unbelievably good for almost everybody.", L(
    "'Almost everybody' from four related people. Peterson's own next sentences supply the problem: the study that could support a population-level claim has not been run. The ketone claim has real evidence in narrow uses (epilepsy) and mixed evidence elsewhere.",
    "Four people who know each other isn't 'almost everybody'. Peterson himself says the real test hasn't been done yet. Ketones do help some people with some problems, but not everyone.")],
  defense: L(
    "Peterson is careful: he reports his family's experience as experience, proposes randomized trials with controls, and says 'we don't know'. The strong claim is Rogan's. Ketogenic diets have a long record in epilepsy and growing evidence for some metabolic conditions.",
    "Peterson is careful: he tells his family's story as a story and wants to run a proper test. The big claim is Rogan's. Ketone diets really do help some conditions."),
  revision: ["partly", L(
    "The challenge should be addressed to Rogan's sentence, not Peterson's; Peterson's hedge is on the record. The anecdotal base is still four people.",
    "The problem is Rogan's sentence, not Peterson's. Peterson was careful. But four people is still four people.")],
  claims: [
    claim("Carnivore is unbelievably good for almost everybody.", JR, "unsupported",
      "No controlled trials of an all-meat diet support a population-wide claim; four related anecdotes. Not re-checked here.", "No real study shows this. Four people who know each other isn't proof.", { wouldSettle: "Randomized trials of carnivore diets with health outcomes; none at scale exist.", settle: L("Randomized trials of carnivore diets with health outcomes; none at scale exist.", "Real experiments where people are put on an all-meat diet and their health is measured. None big enough exist yet."), expectedSources: ["academic_paper"], searchQuery: "carnivore diet randomized trial health outcomes" }),
    claim("The brain likes to run on ketones.", JP, "contested",
      "Ketogenic diets are established for drug-resistant epilepsy; cognitive benefits in healthy adults are mixed. Not re-checked here.", "Helps some people with seizures. For healthy people, studies disagree.", { wouldSettle: "Systematic reviews of ketogenic diet and cognition.", settle: L("Systematic reviews of ketogenic diet and cognition.", "Papers that gather all the studies on keto diets and thinking."), expectedSources: ["academic_paper"], searchQuery: "ketogenic diet cognition healthy adults systematic review" }),
    claim("Two randomized studies are planned, with IQ and personality tests.", JP, "fact",
      "A statement of intent by the speaker; unverifiable until registered.", "He says he will do it. We'll see.", { wouldSettle: "A trial registration (ClinicalTrials.gov).", settle: L("A trial registration (ClinicalTrials.gov).", "A public sign-up for the study on the government's trial list (ClinicalTrials.gov).") }),
  ],
  judgments: ["weak", "gap"],
},
];

// ---------- verification + emit ----------
let bad = 0;
const passageDocs = passages.map((p, idx) => {
  const id = "p" + String(idx + 1).padStart(3, "0");
  const passText = turns.slice(p.turnStart, p.turnEnd + 1).filter(t => !t.heading).map(t => t.text).join("\n");
  const asSaid = p.asSaid.map(([turn, quote]) => {
    const t = turns[turn]; if (!t) throw new Error("no turn " + turn + " in " + id);
    const ok = verifyQuote(quote, t.text);
    if (!ok){ bad++; console.error(`QUOTE NOT FOUND ${id} [${turn}]: ${quote.slice(0, 80)}`); }
    return { turn, speaker: speaker(turn), quote, verbatim: ok };
  });
  const pivot = p.jump[1];
  const pivotOk = pivot ? verifyQuote(pivot, passText) : null;
  if (pivot && !pivotOk){ bad++; console.error(`PIVOT NOT FOUND ${id}: ${pivot}`); }
  const speakersIn = []; for (let i = p.turnStart; i <= p.turnEnd; i++){ const t = turns[i]; if (t.heading) continue; const k = speaker(i); if (!speakersIn.includes(k)) speakersIn.push(k); }
  return { id, doc: {
    order: idx + 1, title: p.title, turnStart: p.turnStart, turnEnd: p.turnEnd, stake: p.stake, speakers: speakersIn,
    status: "done", createdAt: NOW, analyzedAt: NOW, analyzedBy: "claude-in-chat (pilot; corrected after a second-reader review)", model: "claude (chat, 2 Oct 2026)",
    basedOn: { transcriptUpdatedAt: NOW, attrSig: shared.attrSig(overrides) },
    analysis: {
      asSaid,
      deflated: p.deflated,
      fidelity: { grade: p.fidelity[0], notes: p.fidelity[1] },
      jump: { present: p.jump[0], pivot, pivotVerbatim: pivotOk, hs: p.jump[2].hs, g5: p.jump[2].g5 },
      defense: p.defense,
      revision: { jumpSurvives: p.revision[0], hs: p.revision[1].hs, g5: p.revision[1].g5 },
      claims: p.claims,
      judgments: { evidence: p.judgments[0], inference: p.judgments[1] },
    },
  } };
});
if (bad){ console.error(bad + " quote problems"); process.exit(1); }


const labelsFound = []; turns.forEach(t => { if (!t.heading && !labelsFound.includes(t.label)) labelsFound.push(t.label); });
const run = {
  title: "Rogan × Peterson, JRE #2308",
  sourceUrl: "https://www.youtube.com/watch?v=QBEZhjnZTks",
  sourceLabel: "The Joe Rogan Experience #2308 – Jordan Peterson (YouTube, released 22 April 2025)",
  sourceDate: "2025-04-22",
  speakers: [
    { key: JR, name: "Joe Rogan", bio: "Host of The Joe Rogan Experience; comedian; UFC commentator; moved the show to Spotify; wife and children; producer Jamie; worked on NewsRadio with Phil Hartman and Dave Foley; the 2007 Carlos Mencia dispute; had Bill Murray as a guest." },
    { key: JP, name: "Jordan Peterson", bio: "Clinical psychologist; former University of Toronto and Harvard professor; author of 12 Rules for Life and We Who Wrestle with God; wife Tammy, daughter Mikhaila; co-founder of Peterson Academy and ARC (Alliance for Responsible Citizenship); works with the Daily Wire; Canadian; carnivore diet; toured lecturing on biblical stories." },
    { key: "JAMIE", name: "Jamie Vernon", bio: "Producer of the show; bought the O.J. Simpson golf clubs." },
  ],
  status: "analyzed",
  provenance: {
    labelsFound, flags, overrides,
    auditedAt: NOW,
    shiftNote: "Long stretches are labeled JORDAN PETERSON for both speakers (turns 169–206, 221–239, 323–391); several of the host's lines are labeled Peterson and vice versa. Corrections were made from content cues (self-references to jobs, family, guests, books).",
    method: "Content-cue attribution by Claude in chat (pilot). Not yet confirmed by a person.",
    notes: "",
  },
  createdAt: NOW, updatedAt: NOW, transcriptUpdatedAt: NOW,
  turnCount: turns.filter(t => !t.heading).length, passageCount: passageDocs.length,
  pilot: true, example: true,
  pilotNote: "Pilot run. The first pass was done by Claude in chat on 2 October 2026; a second reader (GPT) flagged four overreaches and the percentage scores; this version corrects them, replaces the scores with fidelity, evidence and inference judgments, and adds the defense and revision steps to every card. Attribution rests on content cues and has not been confirmed by a person; confirm it in stage 2.",
};
fs.writeFileSync(path.join(OUT, "run.json"), JSON.stringify(run, null, 2));
passageDocs.forEach(({ id, doc }) => fs.writeFileSync(path.join(OUT, "passages", `${id}.json`), JSON.stringify(doc, null, 2)));

const summary = {
  patterns: [
    { title: L("Evidence attached to a conclusion it cannot carry", "A real fact, then a leap"),
      body: L("Real or roughly real material (serotonin studies, NASA greening, Piaget, Cluster B prevalence) appears next to a conclusion the material does not reach: reputation is indestructible; climate warnings are psychopathy; play is the opposite of tyranny; ideas are irrelevant. The evidence supports the modest claim; the conclusion is the immodest one.",
        "He often gives a real fact and then a big conclusion that the fact doesn't prove. The fact is true; the conclusion is a leap."),
      passages: ["p003", "p005", "p006", "p012"] },
    { title: L("Judging the people instead of the claim", "Talking about the people, not the facts"),
      body: L("Three times the argument moves from a claim to the character of those who make it: the Cluster B passage ('the ideas are irrelevant'), the Carney passage ('this kind of narcissism'), and the climate passage, where the move is announced ('So today I'm talking about something that's a lot more psychological'). Announcing it does not make it an argument, and it is never applied to the speaker's own side.",
        "Three times he stops arguing about the facts and starts saying the people who disagree are sick or selfish. That isn't an answer to their facts."),
      passages: ["p006", "p011", "p012"] },
    { title: L("A definition stretched until it stops distinguishing", "A word made so wide it means nothing"),
      body: L("Tyranny is defined as 'fear and compulsion as your means of governance', then applied to a public-health warning, a book about climate finance, and a showerhead rule. Read as 'primary means', the definition is defensible; applied this way it covers every state that has existed.",
        "He defines 'bully' so widely that every government counts. Then the word doesn't tell you anything."),
      passages: ["p010", "p011", "p012"] },
    { title: L("Two doors and a hidden room", "Only two choices offered"),
      body: L("The alternatives on offer are fewer than the alternatives that exist: 'the alternative is preposterous'; 'monster is better than wimp'; 'power, hedonism, nihilism; those are your options'.",
        "He often says 'it's either this or that' when there are more choices."),
      passages: ["p013", "p014"] },
    { title: L("Hearsay chains, mostly Rogan's", "'Someone told me' stories"),
      body: L("Watergate via Bill Murray via a Belushi biography via Tucker Carlson; COVID deaths 'dropped off radically' when they were peaking; 'they call themselves the Klan'. Where Peterson's weak points are structural, Rogan's are factual.",
        "Rogan's weak spots are 'someone told me' stories and facts that turn out wrong. Peterson's weak spots are in how the argument is built."),
      passages: ["p007", "p008", "p009"] },
  ],
  survived: L(
    "Several arguments came through deflation intact and should be credited plainly. The bad-plan advice. The time-horizon account of recommendation algorithms. Play as voluntary and fragile, read as a proposal. Don't fight in public; don't insult your spouse. Rogan's one-question challenge to the pill-pornography link, and Peterson's immediate partial concession. The greening data, as a fact about leaves. The observation that online anonymity removes face-to-face constraints on bad behavior. Peterson's care in the carnivore passage: anecdote reported as anecdote, trials proposed. None of these needed the Bible stories or the neuroscience to stand, and most are the parts a listener would act on.",
    "Some things held up fine: try a rough plan instead of waiting; apps pull you off track; play has to be chosen; don't fight or insult your partner in public; Rogan's good question about porn and the internet; the fact that the Earth has more plants; and Peterson being careful about the meat diet. These didn't need the big stories to stand up."),
  createdAt: NOW, passagesCounted: passageDocs.length, by: "claude-in-chat (pilot; corrected)",
  basedOn: { passagesSig: passageDocs.map(({ id, doc }) => id + "@" + doc.analyzedAt).join(",") },
  note: "Patterns were written by Claude in chat, not by the in-page run. They count only moves that appear in at least two passages.",
};
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log("ok:", passageDocs.length, "passages;", Object.keys(overrides).length, "overrides;", flags.length, "flags");
