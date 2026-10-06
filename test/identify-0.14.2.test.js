"use strict";
/* 0.14.2: a real run's identification failed. The model named both voices; the app rejected every clue (the host
   speaking to the guest by his title, the guest speaking of himself by his calling, the guest speaking to the host by
   first name in captions without punctuation), kept "Exorcist Fr. <name>" as a name, found no host behind a publisher
   named "… Network", and then said nothing in the conversation or the listing named either voice. These tests pin the
   repair with invented people and words in the same shapes: names kept apart from titles and roles; a host from the
   show's name and its publisher; addresses in plain statements and captions; clues assessed together, where a title
   alone never names anyone; and the reasons for clues that did not hold up. The run itself is replayed only privately
   (test/private-replay.test.js); its words are never committed. */
const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../server/identify");
const { pad } = require("./fixtures/identify-pad");
const { HOST, PRIEST, LP } = require("./fixtures/identify-scenarios-3");
const { isConfirm, confirmAll } = require("./fixtures/confirm");

const listing = (show, author, title, notes, artist) => I.listingCandidates(I.listingOf({ title: "", import: { showInfo: { name: show, author, artist: artist || "", persons: [] }, episodeInfo: { title, description: notes || "", persons: [] } } }));
/* The whole step, as preparation runs it (a fake store; the model's answer scripted when given). With no model, the app's
   own reading alone (appReading), which these tests of the app's rules measure; preparation never names anyone on it alone
   (0.14.3): { production: true } runs the step as preparation does with no model. */
async function identify(lines, L, model, opts) {
  const run = { id: "run_142", kind: "transcript", parseMode: "text", input: { sha256: "h" }, speakers: [], provenance: {}, title: "", sourceLabel: "",
    import: { showInfo: { name: L.show || "", author: L.showAuthor || "", artist: L.showArtist || "", persons: [] }, episodeInfo: { title: L.episodeTitle || "", description: L.description || "", persons: [] } } };
  const store = { bundle: async () => ({ run, transcript: lines.join("\n"), attrSig: "a0-0" }), captureCallBasis: async () => ({}), recordCall: async () => {} };
  const prompts = [];
  // (the second reading, 0.14.5, by a test stand-in that confirms every name: these tests are about the first reading)
  const ai = model ? { kind: "mock", model: "scripted", mock: true, sample: async ({ prompt }) => { if (isConfirm(prompt)) { const c = confirmAll(prompt); return { data: c, text: JSON.stringify(c), model: "scripted", requestId: "r", stopReason: "end_turn", usage: null }; } prompts.push(prompt); const data = model(prompt); return { data, text: JSON.stringify(data), model: "scripted", requestId: "r", stopReason: "end_turn", usage: null }; } } : null;
  const out = ai || (opts && opts.production) ? await I.identifySpeakers({ ai, store, id: run.id }) : await I.appReading({ store, id: run.id });
  const name = k => (out.record.decisions.find(d => d.key === k) || {}).name || null;
  return { out, record: out.record, name, prompts };
}

test("the listing: a name apart from the title and roles before it; the host from the show's name and a publisher named after the host", () => {
  const c = listing(LP.show, LP.showAuthor, LP.episodeTitle, LP.description, LP.showArtist), by = n => c.find(x => x.name === n);
  assert.deepEqual(by(HOST), { name: HOST, role: "host", from: ["the show's name", "the show's publisher (Dale Whitcomb Network)"], structured: true, showName: true }, "two fields agree on the host");
  const g = by(PRIEST);
  assert.equal(g.role, "guest"); assert.equal(g.title, "Father"); assert.deepEqual(g.roles.sort(), ["exorcist", "priest"]);
  // (the notes say what he is, not that he takes part: billed, never presumed to be here, second review)
  assert.deepEqual(g.from, ["the episode's title", "the episode's notes"]); assert.equal(g.notes, undefined); assert.equal(g.billed, true); assert.equal(g.structured, false); assert.equal(g.subject, undefined);
  assert.ok(!c.some(x => /Exorcist|Fr\.|Network/.test(x.name)), JSON.stringify(c.map(x => x.name)));
  // a publisher named after a person, with a show name that is not: a candidate the conversation must say
  const n = listing("Night Desk", "Dale Whitcomb Network", "Mill towns").find(x => x.name === HOST);
  assert.deepEqual([n.role, n.structured, n.company], ["host", false, true]);
  // the show's own brand is no person ("The Straight Talk Network" for "Walt Brannigan's Straight Talk Hour"), nor a company
  assert.ok(!listing("Walt Brannigan’s Straight Talk Hour", "The Straight Talk Network", "Steel").some(x => /Straight Talk/.test(x.name)));
  assert.deepEqual(listing("Night Desk", "Ironvale Media", "Mill towns"), []);
  // a show named like a person, with no other field agreeing: a guess, not a field that names people
  const sc = listing("The Steel Country Hour", "Ironvale Media", "Mill towns");
  assert.deepEqual(sc.map(x => [x.name, x.role, x.structured]), [["Steel Country", "host", false]]);
  // titles and roles before a name, in a title
  const t = title => listing("", "", title).map(x => [x.name, x.title || "", (x.roles || []).join(",")]);
  assert.deepEqual(t("Former Navy SEAL Dana Reyes: Courage Under Fire"), [["Dana Reyes", "", ""]]);
  assert.deepEqual(t("Dr. Ruth Okonkwo: The Sleep Crisis"), [["Ruth Okonkwo", "Doctor", ""]]);
  assert.deepEqual(t("Senator Mara Quill on the farm bill"), [["Mara Quill", "Senator", ""]], "a title gives no calling of its own (the words of the listing must say it)");
  assert.deepEqual(t("Hunter Lowe: A Life Outdoors"), [["Hunter Lowe", "", ""]], "a first name that is also a calling stays a name");
  assert.equal(I.bareName("Fr. Tomas Varga"), PRIEST); assert.equal(I.bareName("Joey Bishop"), "Joey Bishop"); assert.equal(I.bareName("Exorcist Fr. Tomas Varga"), PRIEST);
  assert.deepEqual(I.rolesIn(" is a parish priest and exorcist who trained in Rome."), ["priest", "exorcist"]);
  assert.equal(I.company("Dale Whitcomb Podcast Network"), HOST); assert.equal(I.company("The Straight Talk Network"), "Straight Talk"); assert.equal(I.company("Dale Whitcomb"), "");
});

test("addresses in plain statements and in captions with no punctuation; and what is not one", () => {
  const yes = [
    ["So they went their own way and since none of us are saints you know Dale as a rule people are slow to change.", "Dale"],
    ["you know dale as a rule people are slow to change", "dale"],
    ["You know, Dale, as a rule, people are slow to change.", "Dale"],
    ["so dale what do you make of it", "dale"],
    ["That's right, Dale.", "Dale"], ["I think you're wrong about that, Dale.", "Dale"], ["Dale you're right about that.", "Dale"],
    ["and Dale I gotta tell you it was great", "Dale"], ["Look Dale I do not agree.", "Dale"],
    ["Father, thanks so much for coming in.", "Father"], ["father thanks so much for coming in", "father"], ["Thank you, Father.", "Father"],
  ];
  const no = [
    ["If you know Dale, you know he is honest.", "Dale"], ["you know Dale is right about steel.", "Dale"], ["I told Dale about it yesterday.", "Dale"],
    ["We talked about Dale for an hour.", "Dale"], ["you know Dale he always says that.", "Dale"], ["And then he said Dale you are wrong.", "Dale"],
    ["Coming up after the break, Dale Whitcomb.", "Dale Whitcomb"], ["I'm your biggest fan, Dale Whitcomb.", "Dale Whitcomb"], ["Me and Dale we went fishing.", "Dale"],
    ["Use the code Dale for twenty percent off.", "Dale"], ["I see Dale every day.", "Dale"], ["My father thank you so much.", "father"],
    ["Joining us now Marcus Delacroix as always.", "Marcus Delacroix"], ["The man who ran trade policy for a decade, Marcus Delacroix.", "Marcus Delacroix"],
    ["Welcome to the Dale Whitcomb Show.", "Dale Whitcomb"],
  ];
  for (const [s, f] of yes) assert.equal(I.vocative(s, f, false), true, "should speak to " + f + ": " + s);
  for (const [s, f] of no) assert.equal(I.vocative(s, f, false), false, "should not speak to " + f + ": " + s);
});

test("a voice speaking of itself in a calling: “as an exorcist, … me”, “when I was still a young priest”; not of someone else", () => {
  const yes = [
    ["So in a place like that, as an exorcist, it honestly gives me a great deal of peace.", "exorcist"], ["When I was still a young priest, I never expected it.", "priest"],
    ["So I ended up being their exorcist.", "exorcist"], ["The year I was a began to be an exorcist, I kept a journal.", "exorcist"],
    ["As an exorcist, we'll sit with families like that.", "exorcist"], ["and as an exorcist it still surprises me", "exorcist"],
    ["I'm an experienced exorcist, and I have seen it.", "exorcist"], ["In my years as a priest I heard every confession.", "priest"],
    ["as a rabbi i sit with families every week", "rabbi"],
  ];
  const no = [
    ["The exorcist who mentored me put it plainly.", "exorcist"], ["Another exorcist taught me that prayer.", "exorcist"], ["My father was a priest.", "priest"],
    ["So as a seasoned exorcist, they mostly keep their distance from you.", "exorcist"], ["I'm not a priest, I just read a lot.", "priest"],
    ["I've never met an exorcist.", "exorcist"], ["I'm married to an exorcist.", "exorcist"], ["He said, as an exorcist, he was tired.", "exorcist"],
    ["As an exorcist, he told me everything.", "exorcist"], ["I was a priest's assistant.", "priest"],
    // a supposition, a quotation without its marks, an idiom, someone placed first, a film genre
    ["People assume I would have a gift for being an exorcist.", "exorcist"], ["As an exorcist once told me, the devil is patient.", "exorcist"], ["His answer was simple: as an exorcist, I go where I am sent.", "exorcist"],
    ["As a general rule, I don't trust the numbers.", "general"], ["My father, as a priest, taught me to listen.", "priest"], ["As a priest, my uncle heard every confession.", "priest"],
    ["I'm a fan of exorcist movies.", "exorcist"], ["Pretend I'm a priest, and you have come to me.", "priest"], ["If I was an exorcist, I would have run.", "exorcist"], ["I can't imagine being an exorcist.", "exorcist"],
  ];
  for (const [s, r] of yes) assert.notEqual(I.roleSelfAt(s, r), -1, "should be the speaker's own calling: " + s);
  for (const [s, r] of no) assert.equal(I.roleSelfAt(s, r), -1, "should not be the speaker's own calling: " + s);
});

const REAL_SHAPE = [
  "SPEAKER 1: Father, thanks so much for coming in.",
  "SPEAKER 2: Uh, thanks for having me.",
  "SPEAKER 1: How did the churches here come to ignore all of this?",
  "SPEAKER 2: There is a historical reason." + pad(2) + " So in a place like that, as an exorcist, it honestly gives me a great deal of peace." + pad(1),
  "SPEAKER 1: How so?",
  "SPEAKER 2: They went their own way." + pad(2) + " And since none of us are saints you know Dale as a rule people are slow to change.",
  "SPEAKER 1: Yeah.",
  "SPEAKER 2: That is why mercy matters." + pad(2)];
/* The model's answer as the real run's record kept it, with invented names: right about both voices, with clues the app
   used to reject. */
const ANSWER = () => ({ voices: [
  { label: "SPEAKER 1", name: HOST, evidence: [{ kind: "addressed", turn: 5, quote: "you know Dale as a rule people are slow to change" }, { kind: "addresses_other", turn: 0, quote: "Father, thanks so much for coming in." }] },
  { label: "SPEAKER 2", name: "Fr. Tomas Varga", evidence: [{ kind: "addressed", turn: 0, quote: "Father, thanks so much for coming in." }, { kind: "self_reference", turn: 3, quote: "as an exorcist, it honestly gives me a great deal of peace", listingQuote: "Fr. Tomas Varga is a parish priest and exorcist" }, { kind: "addresses_other", turn: 5, quote: "you know Dale as a rule people are slow to change" }] }],
  unnamed: [] });

test("the real failure's shape, with invented names: every clue the model gave holds up now, and both voices are named with how", async () => {
  const { record, name, prompts } = await identify(REAL_SHAPE, LP, ANSWER);
  assert.equal(name("SPEAKER 1"), HOST); assert.equal(name("SPEAKER 2"), PRIEST);
  const model = record.evidence.filter(e => /model/.test(e.source));
  assert.ok(model.length >= 5 && model.every(e => e.ok), JSON.stringify(model.filter(e => !e.ok)));
  // the clue about someone spoken to is about that person, not the name the model proposed for the speaker
  const ao = record.evidence.filter(e => e.kind === "addresses_other");
  assert.deepEqual(ao.map(e => [e.key, e.name, e.title || ""]).sort(), [["SPEAKER 1", PRIEST, "Father"], ["SPEAKER 2", HOST, ""]]);
  // the record keeps what each clue rests on, so a saved identification can be replayed exactly
  const sr = record.evidence.find(e => e.kind === "self_reference");
  assert.equal(sr.role, "exorcist"); assert.equal(sr.source, "app+model");
  assert.ok(record.evidence.some(e => e.listingQuote === "Fr. Tomas Varga is a parish priest and exorcist") || sr.source === "app+model");
  assert.deepEqual(record.candidates.find(c => c.name === PRIEST).roles.sort(), ["exorcist", "priest"]);
  const how = Object.fromEntries(record.decisions.map(d => [d.key, d.how]));
  assert.match(how["SPEAKER 1"], /^the show's host as listed by the show's name and the show's publisher \(Dale Whitcomb Network\); this voice welcomes a guest, who thanks it for having them: “Father, thanks so much for coming in\.”/);
  assert.match(how["SPEAKER 2"], /spoken to as “Father”, the title the listing gives Tomas Varga, just before answering: “Father, thanks so much for coming in\.”/);
  assert.match(how["SPEAKER 2"], /speaks of itself as what the listing says Tomas Varga is \(exorcist\): “[^”]*as an exorcist, it honestly gives me/);
  assert.match(how["SPEAKER 2"], /answers as the guest: “Uh, thanks for having me\.”/);
  // the model is told the title and the calling apart from the name, and asked whom a voice speaks to
  assert.match(prompts[0], /- Tomas Varga \(guest; title: Father; described as: exorcist, priest\): the episode's title, the episode's notes/);
  assert.match(prompts[0], /give addressee, the name or title it uses/);
  assert.match(prompts[0], /A title alone never says who someone is\./);
  // and the app's rules alone, with no model, reach the same names
  const alone = await identify(REAL_SHAPE, LP, null);
  assert.equal(alone.name("SPEAKER 1"), HOST); assert.equal(alone.name("SPEAKER 2"), PRIEST);
  // but preparation never names anyone on them alone (0.14.3): with no model, both voices keep their numbers, with why
  const none = await identify(REAL_SHAPE, LP, null, { production: true });
  assert.equal(none.name("SPEAKER 1"), null); assert.equal(none.name("SPEAKER 2"), null);
  assert.ok(none.record.unnamed.every(u => u.why === "No model was available to read who each voice is, so this voice keeps its number; the app does not name a voice on its own reading alone."), JSON.stringify(none.record.unnamed));
});

test("a title alone never names anyone: not twice, not as the one voice left, not for no one billed; with the guest the listing bills, the guest's thanks and the model's reading it does", async () => {
  const lines = ["SPEAKER 1: Father, thanks so much for coming in.", "SPEAKER 2: Thank you for having me.", "SPEAKER 1: Father, where were you before Rome?", "SPEAKER 2: At home." + pad(3), "SPEAKER 1: Right." + pad(1), "SPEAKER 2: Yes." + pad(2)];
  // (the host, as the model is asked to account for every voice since 0.14.3: by the show it hosts, welcoming the guest)
  const host = { label: "SPEAKER 1", name: HOST, evidence: [{ kind: "hosts_show", turn: 0, quote: "Father, thanks so much for coming in." }] };
  const reading = () => ({ voices: [host, { label: "SPEAKER 2", name: "Fr. Tomas Varga", evidence: [{ kind: "addressed", turn: 0, quote: "Father, thanks so much for coming in." }, { kind: "addressed", turn: 2, quote: "Father, where were you before Rome?" }] }], unnamed: [] });
  // the app alone: "Father", twice, is still a title alone (sixth review: unchanged)
  const alone = await identify(lines, LP, null);
  assert.equal(alone.name("SPEAKER 1"), HOST, "the host by the show's name and the guest's thanks");
  assert.equal(alone.name("SPEAKER 2"), null);
  assert.match(alone.record.unnamed.find(u => u.key === "SPEAKER 2").why, /^Only a title points to Tomas Varga \(spoken to as “Father”: “Father, thanks so much for coming in\.”\), and a title is never enough on its own\.$/);
  // with the model's reading (sixth review): the title is the one the listing gives the guest it bills ("Exorcist Fr. Tomas
  // Varga: …"), the voice answers the welcome as the guest, and the model's reading of the whole conversation names him;
  // the listing and both readers agree, and nothing in the words is against it
  const r = await identify(lines, LP, reading);
  assert.equal(r.name("SPEAKER 1"), HOST); assert.equal(r.name("SPEAKER 2"), PRIEST);
  assert.equal(r.prompts.length, 1, "a complete answer is not asked for again");
  assert.match(r.record.decisions.find(d => d.key === "SPEAKER 2").how, /this voice answers as a guest, and the model's reading of the conversation names Tomas Varga for it/);
  // the same title a model gives as a name: it stands for the one listed person who has it, and stays a title
  assert.ok(r.record.evidence.filter(e => e.key === "SPEAKER 2" && e.kind === "addressed").every(e => e.title === "Father" && e.name === PRIEST));
  // the model leaving the voice unnamed: no name
  const held = await identify(lines, LP, () => ({ voices: [host], unnamed: [{ label: "SPEAKER 2", why: "only called Father" }] }));
  assert.equal(held.name("SPEAKER 1"), HOST); assert.equal(held.name("SPEAKER 2"), null);
  assert.match(held.record.unnamed.find(u => u.key === "SPEAKER 2").why, /^Only a title points to Tomas Varga/);
  // with no one listed who has the title, it stands for no one
  const none = await identify(lines, { show: LP.show, showAuthor: LP.showAuthor, episodeTitle: "Faith and doubt" }, () => ({ voices: [host, { label: "SPEAKER 2", name: "Father", evidence: [{ kind: "addressed", turn: 0, quote: "Father, thanks so much for coming in." }] }], unnamed: [] }));
  assert.equal(none.name("SPEAKER 2"), null);
  assert.match(none.record.evidence.find(e => e.source === "model" && e.key === "SPEAKER 2").why, /a title is not a name, and no one the listing names has it/);
});

test("every clue that did not hold up is explained, and “nothing names this voice” is said only when nothing was found", async () => {
  const lines = ["SPEAKER 1: Welcome to Night Desk." + pad(2), "SPEAKER 2: Thanks." + pad(3), "SPEAKER 1: Right." + pad(1), "SPEAKER 2: Sure." + pad(2)];
  const r = await identify(lines, { show: "Night Desk", showAuthor: "Ironvale Media", episodeTitle: "Mill towns" }, () => ({ voices: [
    { label: "SPEAKER 1", name: "Pat Reilly", evidence: [{ kind: "self_identification", turn: 0, quote: "Welcome to Night Desk" }] },
    { label: "SPEAKER 2", name: "Ana Ferreira", evidence: [{ kind: "addressed", turn: 0, quote: "Welcome to Night Desk" }, { kind: "self_reference", turn: 1, quote: "Thanks and the numbers moved again", listingQuote: "Ana Ferreira is an economist" }] }], unnamed: [] }));
  const why = Object.fromEntries(r.record.unnamed.map(u => [u.key, u.why]));
  assert.match(why["SPEAKER 1"], /^The model proposed Pat Reilly, but the clue did not hold up: “Welcome to Night Desk” \(the quoted words do not name this person/);
  assert.match(why["SPEAKER 2"], /^The model proposed Ana Ferreira, but the clues did not hold up: “Welcome to Night Desk” \(that turn is another voice's|^The model proposed Ana Ferreira, but the clues did not hold up: “Welcome to Night Desk” \(/);
  assert.doesNotMatch(why["SPEAKER 2"], /Nothing in the conversation/);
  // with nothing found at all, it says so: the model leaving both voices unnamed, and the app's rules alone
  const L0 = { show: "Night Desk", showAuthor: "Ironvale Media", episodeTitle: "Mill towns" };
  const quiet = await identify(lines, L0, () => ({ voices: [], unnamed: [{ label: "SPEAKER 1", why: "" }, { label: "SPEAKER 2", why: "" }] }));
  assert.ok(quiet.record.unnamed.length === 2 && quiet.record.unnamed.every(u => /^Nothing in the conversation or the episode's listing names this voice\.$/.test(u.why)), JSON.stringify(quiet.record.unnamed));
  const alone = await identify(lines, L0, null);
  assert.ok(alone.record.unnamed.every(u => /^Nothing in the conversation or the episode's listing names this voice\.$/.test(u.why)));
});

test("a host the show's name and its publisher name: no host from the show's name alone, none from a publisher's brand, none against the words", async () => {
  // the show's name alone, no other field agreeing, never said: no host
  const sc = await identify(["SPEAKER 1: Welcome to the Steel Country Hour." + pad(2), "SPEAKER 2: Thanks for having me." + pad(3), "SPEAKER 1: What about the mills?" + pad(1), "SPEAKER 2: They are hiring." + pad(3)], { show: "The Steel Country Hour", showAuthor: "Ironvale Media", episodeTitle: "Mill towns" });
  assert.equal(sc.name("SPEAKER 1"), null); assert.ok(!sc.record.candidates.some(c => c.name === "Steel Country"), "a guess the conversation never makes a person is not even a candidate");
  // a publisher named after a person and a guest who thanks that person by first name: the voice that answers is them
  const nd = await identify(["SPEAKER 1: Welcome to Night Desk." + pad(2) + " Joining me now, Marcus Delacroix.", "SPEAKER 2: Thanks for having me, Dale.", "SPEAKER 1: What about the mills?" + pad(1), "SPEAKER 2: They are hiring." + pad(3)], { show: "Night Desk", showAuthor: "Dale Whitcomb Network", episodeTitle: "Mill towns" });
  assert.equal(nd.name("SPEAKER 1"), HOST);
  assert.match(nd.record.decisions.find(d => d.key === "SPEAKER 1").how, /called by name just before answering: “Thanks for having me, Dale\.”; the listing names Dale Whitcomb as host \(the show's publisher \(Dale Whitcomb Network\)\)/);
  // the host the show is named for, away: never given to the voice sitting in
  const away = await identify(["SPEAKER 1: Welcome to the show. I'm sitting in for Dale tonight." + pad(2), "SPEAKER 2: Thanks for having me." + pad(3), "SPEAKER 1: Go on." + pad(1), "SPEAKER 2: Yes." + pad(2)], { show: LP.show, showAuthor: LP.showAuthor, episodeTitle: "Mill towns" });
  assert.equal(away.name("SPEAKER 1"), null); assert.ok(away.record.away.includes("dale whitcomb"));
});

test("a text an earlier version identified, with a voice it left numbered, is identified again on its next reading; never over a person's names", async () => {
  const run = (id, speakers, extra) => Object.assign({ kind: "transcript", parseMode: "text", input: { sha256: "h1" }, speakers: speakers || [{ key: "SPEAKER 1", name: "Speaker 1" }, { key: "SPEAKER 2", name: "Speaker 2" }], provenance: Object.assign({ overrides: {}, identification: id }, extra) });
  const b = r => ({ run: r, transcript: "SPEAKER 1: Hello there, friends.\nSPEAKER 2: Hello to you.", attrSig: "a1" });
  const before = { inputHash: "h1", attrSig: "a1", unnamed: [{ key: "SPEAKER 1", why: "x" }, { key: "SPEAKER 2", why: "x" }] };
  assert.equal(I.needsIdentification(b(run(before))), true, "0.14.0/0.14.1 left both numbered");
  assert.equal(I.needsIdentification(b(run(Object.assign({}, before, { version: I.IDENTIFY_VERSION })))), false, "once per text and labels for this version");
  assert.equal(I.needsIdentification(b(run({ inputHash: "h1", attrSig: "a1", unnamed: [] }, [{ key: "SPEAKER 1", name: "Ann Lee" }, { key: "SPEAKER 2", name: "Bo Diaz" }]))), false, "nothing left to name");
  assert.equal(I.needsIdentification(b(run(before, [{ key: "SPEAKER 1", name: "Ann" }, { key: "SPEAKER 2", name: "Bo" }], { namesByPerson: { "SPEAKER 1": "Ann", "SPEAKER 2": "Bo" } }))), false, "a person's names stay");
  const { record } = await identify(REAL_SHAPE, LP, null);
  assert.equal(record.version, I.IDENTIFY_VERSION);
});
