"use strict";
/* The shipped page (public/app.js) executed against the real server in a small DOM. It checks behavior: what a reader
   sees and in what order, what a click sends, and that progress updates leave untouched cards alone. Layout, focus,
   panels and phone widths are checked in a real browser by scripts/ui-check.js. */
const test = require("node:test"), assert = require("node:assert/strict");
const { createMockAI } = require("../server/ai");
const { page, visible, descendants } = require("./page-harness");
const transcript = Array.from({ length: 18 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": Here is an argument with enough words for the quoted passage " + i + "." + (i === 3 ? " That shows everyone agrees with it." : "")).join("\n");

test("the start screen: one box, one helper line, Upload transcript and one Read this; Controls and Readings start closed", async t => {
  const f = await page(t), view = f.$("runView");
  assert.equal(view.querySelectorAll("textarea").length, 1);
  assert.equal(view.querySelectorAll(".btn.primary").length, 1); assert.equal(f.$("readThis").textContent, "Read this");
  assert.equal(view.querySelectorAll("button").filter(b => b.textContent === "Upload transcript").length, 1);
  assert.equal(view.querySelectorAll(".hint").length, 1); assert.equal(f.$("f-kind").textContent, "Paste text or a link, or upload a transcript.");
  assert.equal(f.$("controls").hidden, true); assert.equal(f.$("readings").hidden, true);
  assert.match(visible(view), /What would you like to read\?/);
  assert.doesNotMatch(visible(view), /How it works|Processing options|plain words · where it jumps/);
});

test("one upload and one Read this give cards with three blocks, a two-choice level switch and closed Evidence; no chip ribbon or claim ledger", async t => {
  const f = await page(t), file = f.$("f-file");
  file.files = [{ name: "interview.txt", text: async () => transcript }]; await file.listeners.change();
  await f.$("readThis").click(); await f.settle();
  assert.deepEqual(f.errors, []);
  const cards = f.body.querySelectorAll(".card"); assert.equal(cards.length, 3);
  assert.match(visible(f.$("reading-status")), /Your reading is ready\./);
  for (const card of cards) {
    const blocks = card.querySelectorAll("section").filter(s => /\bblk\b/.test(s.className)).map(s => s.children[0].textContent);
    assert.deepEqual(blocks, ["In plain words", "A fair reading", "What follows"]);
    assert.deepEqual(card.querySelector(".levels").querySelectorAll("button").map(b => b.textContent), ["High school", "Fifth grade"]);
    assert.equal(card.querySelector("details.evidence").getAttribute("open"), null);
    assert.equal(card.querySelectorAll(".chips").length, 0);
    assert.doesNotMatch(visible(card), /Where it jumps|jump partly stands|turns \d|Preparation · passed|The claims, one at a time/);
  }
  assert.equal(f.requests.filter(x => x[0] === "/api/intake").length, 1);
  assert.ok(!f.requests.some(x => x[0] === "/api/sample"), "the page never builds or sends a reading prompt");
  // the first passage carries a concern; it appears in Evidence, marked with how it ended, not on the card face
  const ev = cards[0].querySelector("details.evidence");
  assert.match(ev.textContent, /The original passage[\s\S]*Quoted in this reading[\s\S]*Reasoning behind this reading[\s\S]*Initial concern[\s\S]*Where the reasoning turns: “That shows everyone agrees with it”matched[\s\S]*part of this concern stands[\s\S]*Claims in this passage[\s\S]*Checkable claim/);
  assert.match(ev.textContent, /Just after \(context the model was given\)/);
  assert.match(visible(f.$("across")), /Across this reading[\s\S]*No concern recurs/);
  assert.match(visible(f.$("contents-host")), /Contents · 3 passages/);
});

test("a card's reading level switches without any request, survives a redraw, and the page default is separate", async t => {
  const f = await page(t); await f.type(transcript);
  const card = f.body.querySelector(".card"), id = f.ctx.page.S.runId, before = f.requests.length;
  card.querySelector(".levels").querySelectorAll("button")[1].click();
  assert.equal(card.getAttribute("data-level"), "5"); assert.equal(f.requests.length, before, "no model call, no request at all");
  assert.equal(f.store.get("deflate-card-level:" + id + ":p001"), "5"); assert.equal(f.store.get("deflate-level"), undefined);
  // a fresh drawing of the run (as on reopening) keeps the card's choice, and other cards follow the page default
  f.ctx.page.S.rendered = null; await f.ctx.page.reload();
  const again = f.body.querySelectorAll(".card");
  assert.equal(again[0].getAttribute("data-level"), "5"); assert.equal(again[1].getAttribute("data-level"), "hs");
});

test("progress updates redraw only the card that changed and keep open Evidence", async t => {
  const f = await page(t); await f.type(transcript);
  const S = f.ctx.page.S, b = JSON.parse(JSON.stringify(S.b));
  const cards = f.body.querySelectorAll(".card");
  const ev = cards[1].querySelector("details.evidence"); ev.attrs.open = ""; ev.open = true; ev.listeners.toggle();
  await f.ctx.page.reload(JSON.parse(JSON.stringify(b)));
  const same = f.body.querySelectorAll(".card");
  assert.ok(same.every((c, i) => c === cards[i]), "an identical poll leaves every card element in place");
  const changed = JSON.parse(JSON.stringify(b)); changed.passages[1].analysis.claims[1].receipts = [{ rid: "rl_x", url: "https://example.org/a", note: "n", relation: "contradicts", addedBy: "person at this computer", at: "2026-10-03T00:00:00Z", relationAt: "2026-10-03T00:00:00Z" }];
  await f.ctx.page.reload(changed);
  const after = f.body.querySelectorAll(".card");
  assert.equal(after[0], cards[0]); assert.equal(after[2], cards[2]); assert.notEqual(after[1], cards[1]);
  assert.notEqual(after[1].querySelector("details.evidence").getAttribute("open"), null, "Evidence stays open on the redrawn card");
  assert.match(visible(after[1]), /You marked a source as contradicting a claim here\. That is your judgment; the reading was not changed by it\./);
});

test("a held passage keeps its place and names its own reason; an out-of-date one says so", async t => {
  const f = await page(t); await f.type(transcript);
  const b = JSON.parse(JSON.stringify(f.ctx.page.S.b));
  b.passages[1].status = "error"; b.passages[1].readingGate = { status: "held", reasons: ["The model's answer was cut off at its length limit before it finished."] };
  b.run.processing.status = "partial"; b.run.processing.message = "2 of 3 readings are ready.";
  await f.ctx.page.reload(JSON.parse(JSON.stringify(b)));
  assert.match(visible(f.$("reading-status")), /2 of 3 readings are ready\.Try again$/, "one retry, on the status line");
  b.passages[2].readingGate = { status: "held", reasons: ["transcript changed since this analysis"] }; b.passages[2].stale = ["transcript changed since this analysis"];
  b.run.processing.status = "partial"; b.run.processing.message = "1 of 3 readings are ready.";
  await f.ctx.page.reload(b);
  const cards = f.body.querySelectorAll(".card");
  assert.equal(cards.length, 3, "order and slots are kept");
  assert.match(visible(cards[1]), /2 of 3[\s\S]*This reading couldn't be completed\.Evidence$/, "the reason is under Evidence, not on the card");
  assert.equal(cards[1].querySelectorAll("button").filter(x => /again/i.test(x.textContent)).length, 0, "no second retry button on the card");
  const ev = cards[1].querySelector("details.evidence"); ev.setAttribute("open", "");
  assert.match(visible(cards[1]), /Why it couldn't be completed[\s\S]*The model's answer was cut off at its length limit before it finished\.[\s\S]*The original passage/);
  assert.match(visible(cards[2]), /Out of date: the text changed after this reading was made\./);
  assert.doesNotMatch(visible(cards[2]), /In plain words/);
  assert.match(visible(f.$("reading-status")), /Some readings are out of date because the text or speakers changed\. Read again to update them\.Read again/);
  assert.match(f.$("contents-host").textContent, /2 of 3[^·]*· not completed[\s\S]*3 of 3[^·]*· out of date/);
});

test("a typed claim shows its explanation and what would help check it, without an invented debate", async t => {
  const f = await page(t); await f.type("Most city residents want the library open until midnight.");
  const card = f.body.querySelector(".card");
  assert.match(visible(card), /In plain words[\s\S]*What would help check it[\s\S]*Checkable claim/);
  assert.doesNotMatch(visible(card), /A fair reading|What follows/);
  assert.equal(f.body.querySelectorAll(".card").length, 1); assert.equal(f.$("across").hidden, true);
});

test("without a key, a typed claim is saved and shown as not yet read; the key prompt sits in the status line and continues", async t => {
  const f = await page(t, { ai: null }); await f.type("Most city residents want the library open until midnight.");
  assert.match(visible(f.body.querySelector(".card")), /The claim, as typed[\s\S]*Not yet read by the model\./);
  const box = f.body.querySelector(".keybox"); assert.ok(box && box.parent.id === "reading-status");
  f.ctx.page.API.setKey = async () => { f.system.state.ai = createMockAI(); return { ai: { kind: "mock", model: "mock", mock: true } }; };
  box.querySelector("input").value = "test-only-key"; await box.querySelector("button").click(); await f.settle();
  assert.match(visible(f.body.querySelector(".card")), /In plain words/); assert.equal(f.body.querySelectorAll(".keybox").length, 0);
});

test("a matched video shows one notice with a concrete comparison; confirming sends the source shown and is recorded", async t => {
  const T2 = transcript, match = { method: "youtube-search", basis: "title and length", episode: { title: "Ep 1", durationSeconds: 3600 }, video: { id: "FullEpisode", url: "https://www.youtube.com/watch?v=FullEpisode", title: "Show — Ep 1", channel: "Show", durationSeconds: 3480 }, toleranceSeconds: 180, differenceSeconds: 120, passing: 1, alternatives: [] };
  const resolver = { locate: async () => ({ kind: "episode" }), words: async () => ({ ok: true, text: T2, title: "Ep 1", episode: { title: "Ep 1", duration: 3600 }, source: { kind: "youtube-captions", url: match.video.url, note: "via a YouTube search" }, match, identity: "needs_confirmation" }) };
  const f = await page(t, { resolver }); const ta = f.$("f-text"); ta.value = "https://show.test/feed.xml"; ta.listeners.input();
  const going = f.$("readThis").click();
  await f.pump(() => f.body.querySelectorAll(".card").length === 3 && /ready/.test(f.$("reading-status") ? f.$("reading-status").textContent : "")); await going;
  const notice = f.body.querySelector(".notice.source");
  assert.match(visible(notice), /^Video matched by title and length — Check source$/);
  notice.querySelector("button").click();
  assert.match(visible(notice), /Episode you asked forEp 1 · 60 min[\s\S]*Video usedShow — Ep 1 · Show · 58 min[\s\S]*differ by 2 min\. Up to 3 min is allowed \(the larger of 2 minutes and 5% of the episode\)\. This does not establish the channel or the recording\./);
  assert.doesNotMatch(visible(f.$("runView")), /official|confirmed/i);
  await notice.querySelectorAll("button").find(b => /They match/.test(b.textContent)).click();
  const sent = f.requests.find(r => /\/source\/confirm$/.test(r[0])); assert.ok(sent);
  assert.equal(f.ctx.page.S.b.sourceIdentity.state, "confirmed");
  assert.equal(f.body.querySelector(".notice.source"), null); assert.match(visible(f.$("run-head")), /Match confirmed by you on/);
});

test("Evidence labels a relocated quote and quotes matched with numbers written differently", async t => {
  const f = await page(t); await f.type(transcript);
  const b = JSON.parse(JSON.stringify(f.ctx.page.S.b));
  Object.assign(b.passages[0].analysis.asSaid[0], { verbatim: true, relocated: true, turn: 0, matchedTurn: 1 });
  b.passages[0].analysis.asSaid.push({ turn: 2, speaker: "HOST", quote: "fifteen percent", verbatim: true, tolerated: ["15%"] });
  await f.ctx.page.reload(b);
  const ev = f.body.querySelector(".card details.evidence");
  assert.match(ev.textContent, /found in turn 1, not turn 0/); assert.match(ev.textContent, /“fifteen percent”matched, numbers written differently/);
});

test("Controls: three groups and the guide link; a reread from Evidence goes to the server route; a held claim type is attributed to the earlier model", async t => {
  const f = await page(t); await f.type(transcript);
  f.$("controlsBtn").click();
  assert.equal(f.$("controls").hidden, false);
  assert.deepEqual(f.$("controlsBody").querySelectorAll("section").map(s => s.children[0].textContent), ["Reading", "Input and speakers", "App and files"]);
  assert.ok(f.$("guideLink")); f.$("controls").querySelector(".panel-close").click(); assert.equal(f.$("controls").hidden, true);
  const card = f.body.querySelector(".card"), reread = card.querySelectorAll("button").find(b => b.textContent === "Read this passage again");
  await reread.click(); await f.settle();
  assert.ok(f.requests.some(r => r[0] === "/api/runs/" + f.ctx.page.S.runId + "/passages/p001/reread" && r[1] === "POST"));
  const b = JSON.parse(JSON.stringify(f.ctx.page.S.b)); b.passages[0].analysis.claims[1].type = "contested";
  await f.ctx.page.reload(b);
  const ev = f.body.querySelector(".card details.evidence");
  assert.match(ev.textContent, /Checkable claim[\s\S]*An earlier version of the app had the model label this “contested” from its own knowledge/);
  assert.doesNotMatch(visible(f.body.querySelector(".card")), /contested/);
});

test("late bundles and out-of-order loads cannot replace the selected reading; a busy page refuses to switch", async t => {
  const f = await page(t); await f.type(transcript); const first = f.ctx.page.S.runId, P = f.ctx.page;
  const other = await f.system.store.createRun({}, transcript.replace(/argument/g, "case"));
  const stale = JSON.parse(JSON.stringify(P.S.b));
  // the first reading's load is slow; the person moves on to the other one before it answers
  const real = P.API.getRun; let release; const slow = new Promise(r => { release = r; });
  P.API.getRun = id => id === first ? slow.then(() => real(id)) : real(id);
  const late = P.selectRun(first);
  await P.selectRun(other);
  release(); await late;
  assert.equal(P.S.runId, other); assert.equal(P.S.b.run.id, other);
  assert.equal(await P.reload(stale), false, "a late bundle for the previous reading is ignored");
  P.S.busy = true; await P.selectRun(first); assert.equal(P.S.runId, other); P.S.busy = false;
});

/* Deepgram's answer for a text whose paragraphs are spoken by the given voices (one voice per paragraph). */
function recordingOf(text, voiceOfParagraph) {
  const words = []; let t = 0;
  text.split(/\n\s*\n/).forEach((para, i) => para.split(/\s+/).filter(Boolean).forEach(w => { words.push({ word: w.toLowerCase().replace(/[^a-z0-9']/g, ""), punctuated_word: w, speaker: voiceOfParagraph[i], start: t, end: t + 0.3 }); t += 0.4; }));
  return { metadata: { request_id: "req-ui-1", duration: Math.round(t), models: ["nova-3"] }, results: { channels: [{ alternatives: [{ words }] }] } };
}
const PLAIN = "Welcome back to the show. Today we are talking about the transit survey the city released last month.\n\nThanks for having me. The survey covered four hundred households in three neighborhoods, which is a small sample for a city this size.\n\nSo when the report says riders everywhere support more lanes, it is stretching what those households can tell you.";

test("speakers: a text with no labels shows one quiet line and no speaker before every line; voices from the recording say where they came from; names are never asked for, and correcting one is optional", async t => {
  let configured = false; const sent = [];
  const cloudEngine = { name: "deepgram", model: "nova-3", configured: () => configured, async diarize({ audioUrl }) { sent.push(audioUrl); return recordingOf(PLAIN, [0, 1, 1]); } };
  const f = await page(t, { cloudEngine }); await f.type(PLAIN);
  assert.equal(visible(f.$("speakerNotice")), "No speaker labels in this text. Find speakers", "one quiet line");
  assert.equal(f.$("notices").querySelectorAll(".notice").filter(n => /speaker/i.test(n.textContent)).length, 1);
  assert.ok(f.$("speakerNotice").classList.contains("quiet"));
  assert.doesNotMatch(visible(f.$("runView")), /Speaker unknown|Speaker not established/);
  const ev = f.body.querySelector(".card details.evidence"); ev.setAttribute("open", "");
  assert.match(visible(ev), /The original passage[\s\S]*Welcome back to the show/);
  assert.doesNotMatch(visible(ev), /Speaker unknown|Speaker not established|UNLABELED/, "no label in front of every line");
  // Controls: where the labels came from, and the ways to find speakers behind one disclosure
  f.$("controlsBtn").click();
  let sp = f.$("ctl-speakers");
  assert.match(visible(sp), /No speaker labels came with this text\. The words alone don't show where the speaker changes, so the text is read as it is\./);
  let find = sp.querySelector("details.ctl-find"); assert.ok(find, "Find who is speaking"); assert.equal(find.getAttribute("open"), null, "closed until asked");
  find.setAttribute("open", "");
  assert.doesNotMatch(visible(find), /Work out who is speaking from the words/, "the words were already read at intake");
  assert.match(visible(find), /Separate voices from the recording[\s\S]*Needs a Deepgram key first/);
  // with a key, the voices route runs and the page says where the labels came from
  configured = true; f.ctx.page.S.engines = null; f.$("controls").querySelector(".panel-close").click(); f.$("controlsBtn").click();
  await f.pump(() => f.ctx.page.S.engines);
  f.$("controls").querySelector(".panel-close").click(); f.$("controlsBtn").click();
  sp = f.$("ctl-speakers"); find = sp.querySelector("details.ctl-find"); find.setAttribute("open", "");
  const link = find.querySelector("input"); link.value = "https://cdn.example.org/ep7.mp3"; link.listeners.input();
  await find.querySelectorAll("button").find(b => b.textContent === "Separate voices from the recording").click();
  await f.settle();
  assert.deepEqual(sent, ["https://cdn.example.org/ep7.mp3"]);
  assert.ok(f.requests.some(r => r[0] === "/api/runs/" + f.ctx.page.S.runId + "/voices" && r[1] === "POST"));
  assert.equal(visible(f.$("speakerNotice")), "Speakers separated by voice. Details", "the line never asks the reader to name anyone");
  const ev2 = f.body.querySelector(".card details.evidence"); ev2.setAttribute("open", "");
  assert.match(visible(ev2), /Speaker 1: Welcome back to the show[\s\S]*Speaker 2: Thanks for having me/);
  // nothing in these words names anyone (and a pasted text has no listing): each voice keeps its number, with the reason
  assert.match(visible(ev2), /Who is speaking[\s\S]*Speaker 1: Not identified\. Nothing in the conversation or the episode's listing names this voice\./);
  // optional names under Controls
  f.$("controlsBtn").click(); sp = f.$("ctl-speakers");
  assert.match(visible(sp), /Separated by voice from the recording: 2 voices, with 100% of this text's words lined up/);
  assert.match(visible(sp), /Not identified\. Nothing in the conversation or the episode's listing names this voice\./);
  const names = sp.querySelectorAll("input").filter(i => /^Name for Speaker/.test(i.getAttribute("aria-label") || ""));
  assert.deepEqual(names.map(i => i.getAttribute("aria-label")), ["Name for Speaker 1", "Name for Speaker 2"]);
  assert.deepEqual(names.map(i => i.value), ["", ""]);
  names[0].value = "Sam Okafor"; names[0].listeners.input(); names[1].value = "Dana Reyes"; names[1].listeners.input();
  await sp.querySelectorAll("button").find(b => b.textContent === "Save names").click();
  await f.settle();
  assert.equal(visible(f.$("speakerNotice")), "Speakers separated by voice. Details");
  // the readings were written under the old names: they say so, and the names show everywhere at once
  const card = f.body.querySelector(".card");
  assert.match(visible(card), /Out of date: a speaker's name changed after this reading was made\./);
  assert.match(visible(card), /Sam Okafor/);
  const ev3 = card.querySelector("details.evidence"); ev3.setAttribute("open", "");
  assert.match(visible(ev3), /Sam Okafor: Welcome back to the show[\s\S]*Dana Reyes: Thanks for having me/);
  assert.match(visible(ev3), /Who is speaking[\s\S]*Sam Okafor \(Speaker 1\): Named by you\./);
});

test("a reading whose fifth-grade wording failed shows the high-school reading at both levels and says so only at fifth grade", async t => {
  const f = await page(t); await f.type(transcript);
  const b = JSON.parse(JSON.stringify(f.ctx.page.S.b)), a = b.passages[0].analysis;
  a.deflated = { hs: "HS plain words.", g5: "FAILED fifth grade words." }; a.levels = { g5: "withheld", reasons: ["deflated.g5: “a wider mix of people” changes who was surveyed."] };
  await f.ctx.page.reload(b);
  const card = f.body.querySelector(".card");
  card.setAttribute("data-level", "5");
  const shown5 = descendants(card).filter(n => /\blvl-5\b/.test(n.className)).map(n => n.textContent).join(" | ");
  assert.match(shown5, /HS plain words\./); assert.doesNotMatch(shown5, /FAILED/);
  const note = card.querySelector(".only-5"); assert.ok(note); assert.equal(note.textContent, "The fifth-grade wording couldn't be completed, so this card shows the high-school reading.");
  const ev = card.querySelector("details.evidence"); ev.setAttribute("open", ""); const chk = card.querySelector("details.checks"); chk.setAttribute("open", "");
  assert.match(visible(chk), /What was still wrong:Fifth grade, In plain words: “a wider mix of people” changes who was surveyed\./);
});
