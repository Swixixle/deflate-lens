"use strict";
/* 0.15.2: callers are named by the first name the conversation gives them. In the real check of 0.15.1 two callers kept
   their numbers: the host took each by first name ("…, you're on the show. What's going on?") and the episode's notes named
   one of them as a caller, but one call by name weighed too little to stand alone, the notes' "caller …" was not read as
   naming a person, and the model, told to add nothing the listing does not give, left both unnamed. Now the host handing
   a caller the floor by name is an introduction by first name; a caller the notes name is a candidate as a caller; and a
   caller may take its own first name, never a listed host's or guest's. Invented show and people (test/fixtures). */
const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../server/identify");
const ST = require("./fixtures/straight-talk");

const turnOf = (p, re) => Number(re.exec(p)[1]);
const hostLine = p => ({ label: "SPEAKER 2", name: ST.HOST, evidence: [{ kind: "hosts_show", turn: turnOf(p, /\[(\d+)\] SPEAKER 2: Good evening and welcome/), quote: "Good evening and welcome to the Straight Talk Hour." }] });
const guestLine = p => ({ label: "SPEAKER 3", name: ST.GUEST, evidence: [{ kind: "introduced", turn: turnOf(p, /\[(\d+)\] SPEAKER 2: [^\n]*Joining us now/), quote: "Joining us now from Washington, Marcus Delacroix, former trade adviser" }] });
/* The feed with notes of the test's choosing (the chain reads the listing from it). */
const feedWith = notes => (u) => u === "https://feeds.straighttalk.test/rss" ? { status: 200, body: ST.FEED.replace("<description>Tonight: trade, steel and what comes next.</description>", "<description>" + notes + "</description>"), type: "application/rss+xml" } : null;

test("the listing's callers: the notes naming a caller by first name make a candidate as a caller, never one who shares a listed name; a title or a place is not a caller", () => {
  const L = { show: ST.SHOW, showAuthor: "", showArtist: "", showPersons: [], episodeTitle: ST.EPISODE, description: "Tonight: trade and steel, with a word from longtime caller Rosa in Fresno. Later, a call from Theo, and listener Marcus asks about the mills. Callers in Ohio were on hold all hour.", episodeAuthor: "", episodePersons: [], runTitle: "", sourceLabel: "" };
  const c = I.listingCandidates(L);
  const rosa = c.find(x => x.name === "Rosa"), theo = c.find(x => x.name === "Theo");
  assert.ok(rosa && rosa.role === "caller" && rosa.caller && rosa.notes && rosa.billed && rosa.from.includes("the episode's notes"), JSON.stringify(c));
  assert.ok(theo && theo.role === "caller", JSON.stringify(c));
  assert.ok(!c.some(x => x.name === "Marcus" && x.role === "caller"), "a first name the listed guest has is not a caller candidate: " + JSON.stringify(c.map(x => [x.name, x.role])));
  assert.ok(!c.some(x => x.name === "Ohio"), "“callers in Ohio” names no one");
  assert.ok(c.some(x => x.name === ST.GUEST && x.role === "guest"));
});

test("a caller the host takes by first name and hands the floor is named by it; a caller addressed without a hand-over needs the notes too; a caller who shares the guest's first name keeps a number", async t => {
  // the host takes three callers: Rosa (handed the floor: "you're on the show"), Theo (only greeted by name, but the notes
  // name him as a caller) and Marcus (handed the floor, but the guest is Marcus Delacroix)
  const said = ST.SAID.slice(0, 10).concat([
    [1, "Let's go to the phones. Rosa, you're on the Straight Talk Hour. What's going on?"],
    [4, "Hi Walt. I work at one of those mills, and we did hire again this year, but the overtime is gone."],
    [1, "Thank you, Rosa. Theo, how are you tonight?"],
    [5, "Doing well. Long time listener. My brother-in-law was one of the eight hundred, and he says the line is slower than the old one."],
    [1, "Appreciate it. Marcus, go ahead."],
    [6, "Yeah, I just want to say the tariffs saved my town, and nobody in Washington gets that."],
    [1, "Thanks for the call."],
  ]).concat(ST.SAID.slice(10));
  const identify = p => ({ voices: [hostLine(p), guestLine(p),
    { label: "SPEAKER 5", name: "Rosa", evidence: [{ kind: "addressed", turn: turnOf(p, /\[(\d+)\] SPEAKER 2: Let's go to the phones/), quote: "Rosa, you're on the Straight Talk Hour. What's going on?" }] },
    { label: "SPEAKER 6", name: "Theo", evidence: [{ kind: "addressed", turn: turnOf(p, /\[(\d+)\] SPEAKER 2: Thank you, Rosa/), quote: "Theo, how are you tonight?" }] },
    { label: "SPEAKER 7", name: "Marcus", evidence: [{ kind: "addressed", turn: turnOf(p, /\[(\d+)\] SPEAKER 2: Appreciate it/), quote: "Marcus, go ahead." }] },
  ], unnamed: [{ label: "SPEAKER 1", why: "an announcer" }, { label: "SPEAKER 4", why: "reads an advertisement" }] });
  const confirm = p => ({ voices: [...p.matchAll(/^- (SPEAKER \d+), given the name ([^:]+?)(?: \(the listing's \w+\))?: /gm)].map(m => {
    const key = m[1], name = m[2];
    const quote = name === "Rosa" ? "Rosa, you're on the Straight Talk Hour. What's going on?" : name === "Theo" ? "Theo, how are you tonight?" : name === ST.HOST ? "Good evening and welcome to the Straight Talk Hour." : "Joining us now from Washington, Marcus Delacroix, former trade adviser.";
    return { label: key, verdict: "is", turn: turnOf(p, new RegExp("\\[(\\d+)\\] SPEAKER 2: [^\\n]*" + quote.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))), quote, why: "the words show it" };
  }) });
  // (a) with the notes naming Theo as a caller
  const ai = ST.scriptedAI({ identify, confirm });
  const f = await ST.server(t, { ai, fetch: ST.chainFetch(said, feedWith("Tonight: trade, steel and what comes next, with a call from longtime caller Theo in Tacoma.")), env: { DEEPGRAM_API_KEY: ST.KEY, TRANSCRIBE_PREFER: "cloud" } });
  const b = await ST.fromLink(f, ST.APPLE_LINK), id = b.run.provenance.identification;
  const nameOf = key => (b.run.speakers.find(s => s.key === key) || {}).name;
  assert.equal(nameOf("SPEAKER 2"), ST.HOST); assert.equal(nameOf("SPEAKER 3"), ST.GUEST);
  assert.equal(nameOf("SPEAKER 5"), "Rosa", JSON.stringify(id.unnamed));
  assert.match(id.decisions.find(d => d.key === "SPEAKER 5").how, /^taken as a caller by first name, and answers: “Rosa, you're on the Straight Talk Hour\. What's going on\?”/);
  assert.equal(nameOf("SPEAKER 6"), "Theo", JSON.stringify(id.unnamed));
  assert.match(id.decisions.find(d => d.key === "SPEAKER 6").how, /called by name just before answering: “Theo, how are you tonight\?”; the listing names Theo as caller \(the episode's notes\)/);
  assert.ok(id.candidates.some(c => c.name === "Theo" && c.role === "caller"), "the notes' caller is a candidate the model is shown");
  assert.match(ai.prompts.find(p => p.startsWith("Who is each voice in this conversation?")), /- Theo \(caller\): the episode's notes/);
  assert.match(ai.prompts.find(p => p.startsWith("Who is each voice in this conversation?")), /A caller the host takes by first name .* is named by that first name alone/);
  assert.equal(nameOf("SPEAKER 7"), "Speaker 7", "a caller sharing the guest's first name takes no name: it is not Marcus Delacroix, and “Marcus” alone would read as him");
  assert.match(id.unnamed.find(u => u.key === "SPEAKER 7").why, /caller/);
  // the names reach the review and the report: every quote and claim of a caller is credited by name
  const md = (await f.api("GET", "/api/runs/" + b.run.id + "/export.md?level=hs")).data, ex = (await f.api("GET", "/api/runs/" + b.run.id + "/export.json")).data;
  ST.assertNamed(b, md, ex, ["SPEAKER 2", "SPEAKER 3", "SPEAKER 5", "SPEAKER 6"], [ST.HOST, ST.GUEST, "Rosa", "Theo"]);
  assert.match(md, /- Rosa \(Speaker 5\): (?:Identified: )?[Tt]aken as a caller by first name/);
  assert.ok(ex.run.speakers.some(s => s.key === "SPEAKER 5" && s.name === "Rosa"));
  // (b) the same conversation with notes that do not name Theo: one greeting by name is still not enough on its own
  const ai2 = ST.scriptedAI({ identify, confirm });
  const g = await ST.server(t, { ai: ai2, fetch: ST.chainFetch(said), env: { DEEPGRAM_API_KEY: ST.KEY, TRANSCRIBE_PREFER: "cloud" } });
  const gb = await ST.fromLink(g, ST.APPLE_LINK), gid = gb.run.provenance.identification;
  const gname = key => (gb.run.speakers.find(s => s.key === key) || {}).name;
  assert.equal(gname("SPEAKER 5"), "Rosa"); assert.equal(gname("SPEAKER 6"), "Speaker 6");
  assert.match(gid.unnamed.find(u => u.key === "SPEAKER 6").why, /^Only one weak clue points to a name \(Theo: called by name once just before answering\), which is not enough on its own\.$/);
});

test("the hand-over is read from the host's words, and a guest brought in by first name is still the listed guest, not a caller", () => {
  const sp = [
    { i: 0, key: "SPEAKER 1", text: "Good evening and welcome to the Straight Talk Hour. Joining us now from Washington, Marcus Delacroix, former trade adviser. Marcus, you're on the air." },
    { i: 1, key: "SPEAKER 2", text: "Thanks for having me, Walt. It's good to be back." },
    { i: 2, key: "SPEAKER 1", text: "Let's go to the phones. Rosa in Fresno, you're on. What's on your mind?" },
    { i: 3, key: "SPEAKER 3", text: "Hi Walt. The overtime is gone at our mill." },
    { i: 4, key: "SPEAKER 1", text: "Rosa, thank you. Theo, what do you make of that?" },
    { i: 5, key: "SPEAKER 4", text: "I think she's right about the overtime." },
  ];
  const L = { show: ST.SHOW, showAuthor: ST.HOST, showArtist: "", showPersons: [], episodeTitle: ST.EPISODE, description: "", episodeAuthor: "", episodePersons: [], runTitle: "", sourceLabel: "" };
  const cands = I.listingCandidates(L), stats = I.voiceStats(sp);
  const ctx = { sp, keys: new Set(sp.map(t => t.key)), indexOfTurn: new Map(sp.map((t, k) => [t.i, k])), cands, pool: cands, stats, nameableKeys: new Set(sp.map(t => t.key)), listing: L, listingText: I.listingText(L), fixed: new Map(), fixedKeys: new Set(), strict: true };
  const check = (key, name, turn, quote) => I.checkClue({ key, name, kind: "addressed", turn, quote, source: "model" }, ctx, { lenient: true });
  const rosa = check("SPEAKER 3", "Rosa", 2, "Rosa in Fresno, you're on. What's on your mind?");
  assert.equal(rosa.ok, true, rosa.why); assert.equal(rosa.weight, 2); assert.equal(rosa.atype, "caller"); assert.equal(rosa.name, "Rosa", "a caller's first name is not completed from anything");
  const theo = check("SPEAKER 4", "Theo", 4, "Theo, what do you make of that?");
  assert.equal(theo.ok, true, theo.why); assert.equal(theo.weight, 1); assert.notEqual(theo.atype, "caller", "a question by name is being called by name, not a hand-over");
  // the guest, handed the floor in radio words right after being introduced by full name, is the guest (0.14 fourth review)
  const guest = check("SPEAKER 2", "Marcus", 0, "Marcus, you're on the air.");
  assert.equal(guest.ok, true, guest.why); assert.equal(guest.name, ST.GUEST, "completed from the listing: the same turn introduced Marcus Delacroix");
  assert.notEqual(guest.atype, "caller", "answering as a guest does (“Thanks for having me”) is no caller's answer");
});
