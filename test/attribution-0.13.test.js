"use strict";
/* 0.13: whose words are these. A web page's controls and timestamps leave the spoken text at intake; clips and
   quotations are set apart from the speaker who plays or reads them; in a transcript without labels, speakers are
   numbered only where the words establish a change; every spoken word is kept. The model is scripted: these tests
   prove what the app does with an answer (cutting, checking quotations, the review, the labels), not what a model
   would answer. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research");
const shared = require("../shared/transcript");
const { separatePageText } = require("../server/webtranscript");
const { cleanText } = require("../server/intake");

async function fixture(t, ai) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-013-"));
  const app = createApp({ dataDir: dir, examplesDir: dir, env: {}, envPath: path.join(dir, ".env"), ai: ai || createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), run: async () => ({ code: 1, out: "" }) });
  await app.ready;
  const server = await new Promise(r => { const s = app.app.listen(0, "127.0.0.1", () => r(s)); });
  const api = async (method, p, body) => { const res = await fetch("http://127.0.0.1:" + server.address().port + p, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, data: await res.json().catch(() => null) }; };
  const finish = async id => { const job = app.reader.jobs.get(id); if (job) await job.done; return app.store.bundle(id); };
  t.after(async () => { for (const job of app.reader.jobs.values()) job.controller.abort(); await Promise.all([...app.reader.jobs.values()].map(j => j.done)); await new Promise(r => server.close(r)); await fs.rm(dir, { recursive: true, force: true }); });
  return { ...app, api, finish, dir };
}
/* The mock for everything, except the structure pass and its review, which answer from the test's script. */
function scripted(structure, review) {
  const mock = createMockAI(), prompts = [];
  return { prompts, ai: { ...mock, async sample(args) {
    const p = String(args.prompt || ""); prompts.push(p);
    const answer = data => ({ data, text: JSON.stringify(data), usage: null, model: "mock", stopReason: "end_turn" });
    if (structure && (p.startsWith("This transcript has no speaker labels") || p.startsWith("Find recordings played"))) return answer(structure(p));
    if (review && p.startsWith("Review a speaker structure independently")) return answer(review(p));
    return mock.sample(args);
  } } };
}
const words = s => shared.wordsOf(s);
const spokenOnly = text => words(text.replace(/^(?:SPEAKER \d+|CLIP \d+|QUOTE \d+|UNLABELED|[A-Z][A-Za-z .'-]{0,40}): /gm, ""));

/* A transcript as a podcast page shows it: "Copy link" and a timestamp before every paragraph, no speaker names. The
   host talks, introduces a clip, plays it, comes back; then introduces a guest and they talk. Invented people. */
const PAGE = [
  "Two years ago, leaked documents showed that the largest donor to the committee ran a gambling site. Huh. He later denied it, but the documents remain.",
  "And you have to ask why someone in that business would give this much to a campaign about foreign policy.",
  "Here, for example, is a pretty amazing and telling clip from Lee Grant's recent podcast. Watch this.",
  "In my opinion, as I said at the time, the agreement was counterproductive. It signaled weakness, and the odds of reopening the strait are now above forty percent.",
  "So that's a pretty amazing clip. Here's Lee Grant, pushing for more money and more soldiers, and quoting betting odds from his sponsor.",
  "Now, I hired Sam out of college years ago. Sam Ortiz, thanks for coming.",
  "Thank you for having me.",
  "Is it the most popular entertainment in America?",
  "It is. The total amount wagered last year eclipsed every other kind of entertainment spending combined.",
  "Actually?",
  "Yes, yes it does.",
].map((p, i) => (i ? "\n\n\nCopy link\n00:" + String(i).padStart(2, "0") + ":" + (10 + i) + "\n" : "") + p).join("");

test("intake separates a page's controls and timestamps from the words, keeps each paragraph's time, and keeps every spoken word", () => {
  const c = cleanText(PAGE);
  assert.doesNotMatch(c.text, /Copy link|\d\d:\d\d:\d\d/);
  assert.deepEqual(c.record.web.removed, { controls: { "Copy link": 10 }, timestamps: 10, speakerNameLines: 0, markers: 0 });
  assert.equal(c.record.timing.starts.length, 11); assert.equal(c.record.timing.starts[0], null); assert.equal(c.record.timing.starts[3], 3 * 60 + 13);
  const spoken = PAGE.split("\n").filter(l => l.trim() && l !== "Copy link" && !/^\d\d:\d\d:\d\d$/.test(l)).join(" ");
  assert.equal(words(c.text), words(spoken), "every spoken word, in order");
  assert.equal(shared.parseTranscript(c.text, { mode: "text" }).length, 11, "one turn per paragraph; paragraph breaks are not speakers");
  // a saved run is not re-cleaned behind the person's back
  assert.equal(cleanText(PAGE, { captions: false, web: false }).text.includes("Copy link"), true);
});

test("speaker names and times given by the page become labels; consistent formats only; a stray time or control word stays", () => {
  const otter = separatePageText("Ann Lee  0:00\nWelcome back.\n\nBo Diaz  0:05\nThanks for having me.\n\nAnn Lee  1:02:03\nSo, the budget.");
  assert.equal(otter.text, "Ann Lee: Welcome back.\n\nBo Diaz: Thanks for having me.\n\nAnn Lee: So, the budget.");
  assert.deepEqual(otter.paragraphs.map(p => p.start), [0, 5, 3723]);
  const rev = separatePageText("Speaker 1 (00:00):\nHello there.\n\nSpeaker 2 (00:04): Hi, good to be here.\n\nSpeaker 1 (00:09):\nLet us start.");
  assert.equal(rev.text, "Speaker 1: Hello there.\n\nSpeaker 2: Hi, good to be here.\n\nSpeaker 1: Let us start.");
  const named = separatePageText("Intro words here.\n\nDana Holt\n00:00:05\nWelcome to the show.\n\nSam Ortiz\n00:00:09\nGlad to be here.\n\nDana Holt\n00:00:12\nLet us begin.");
  assert.match(named.text, /^Intro words here\.\n\nDana Holt: Welcome to the show\.\n\nSam Ortiz: Glad to be here\.\n\nDana Holt: Let us begin\.$/);
  const panel = separatePageText(Array.from({ length: 30 }, (_, i) => "0:" + String(i * 2).padStart(2, "0") + "\nwords spoken in fragment number " + i + (i % 10 === 9 ? "." : "")).join("\n"));
  assert.equal(panel.record.joinedFragments, true); assert.ok(panel.paragraphs.length < 6, "fragments of a video transcript panel are joined into paragraphs");
  const markers = separatePageText(">> So what happened next?\n>> We waited for the vote.\n>> And then?");
  assert.equal(markers.paragraphs.length, 3); assert.equal(markers.record.removed.markers, 3);
  for (const plain of ["We met at 10:30 that day.\n\nShare your thoughts with us.", "Share\n\nThe chart is at 1:30.", "Copy link\nOnly once, and next to nothing."]) assert.equal(separatePageText(plain).changed, false, plain);
});

/* The structure the scripted model proposes for PAGE, by paragraph. */
function proposal(over) {
  return Object.assign({ segments: [
    { para: 0, start: "Two years ago, leaked documents showed", voice: "A", change: { kind: "none", quote: "" } },
    { para: 3, start: "In my opinion, as I said", voice: "CLIP 1", change: { kind: "none", quote: "" } },
    { para: 4, start: "So that's a pretty amazing clip", voice: "A", change: { kind: "clip_ends", quote: "So that's a pretty amazing clip" } },
    { para: 6, start: "Thank you for having me", voice: "B", change: { kind: "thanks_host", quote: "Thank you for having me" } },
    { para: 7, start: "Is it the most popular", voice: "A", change: { kind: "asks_question", quote: "Is it the most popular entertainment in America" } },
    { para: 8, start: "It is. The total amount", voice: "B", change: { kind: "answers_question", quote: "Is it the most popular entertainment in America" } },
    { para: 9, start: "Actually?", voice: "A", change: { kind: "short_reply", quote: "Actually" } },
    { para: 10, start: "Yes, yes it does", voice: "B", change: { kind: "short_reply", quote: "Yes, yes it does" } },
  ], clips: [{ id: "CLIP 1", kind: "recording", introducedAs: "Lee Grant", introQuote: "a pretty amazing and telling clip from Lee Grant's recent podcast. Watch this", returnQuote: "So that's a pretty amazing clip" }],
  names: [{ voice: "B", name: "Sam Ortiz", kind: "introduced_by_name", quote: "Sam Ortiz, thanks for coming" }, { voice: "A", name: "Dana Holt", kind: "source_title", quote: "Dana Holt" }],
  voices: [{ voice: "A", role: "host" }, { voice: "B", role: "guest" }] }, over || {});
}
const agreeAll = p => ({ verdicts: ((p.split("\nSegments:\n")[1] || "").match(/^\[\d+\]/gm) || []).map((_, i) => ({ segment: i, agree: true })), names: [{ voice: "B", name: "Sam Ortiz", agree: true }] });

test("a host, a clip they introduce and play, the host again, then a guest: each set apart, named only from the words, every word kept", async t => {
  const m = scripted(() => proposal(), agreeAll);
  const s = await fixture(t, m.ai);
  const id = (await s.api("POST", "/api/intake", { input: PAGE, context: { title: "The Dana Holt Show — Sam Ortiz on gambling" } })).data.run.id;
  const b = await s.finish(id);
  assert.equal(b.run.processing.status, "complete", JSON.stringify(b.run.processing));
  const turns = shared.parseTranscript(b.transcript, { mode: b.run.parseMode });
  const labelOf = start => turns.find(x => x.text.startsWith(start)).label;
  assert.equal(labelOf("Two years ago"), "SPEAKER 1"); assert.equal(labelOf("Here, for example"), "SPEAKER 1");
  assert.equal(labelOf("In my opinion"), "CLIP 1", "the played clip is its own turn, not the host's");
  assert.equal(labelOf("So that's a pretty amazing clip"), "SPEAKER 1", "the host again after the clip");
  assert.equal(labelOf("Thank you for having me"), "SPEAKER 2"); assert.equal(labelOf("It is. The total"), "SPEAKER 2"); assert.equal(labelOf("Actually?"), "SPEAKER 1");
  const sp = Object.fromEntries(b.run.speakers.map(x => [x.key, x]));
  assert.equal(sp["SPEAKER 2"].name, "Sam Ortiz", "named from an introduction by name, quoted");
  assert.equal(sp["SPEAKER 1"].name, "Speaker 1", "a name from the show's title is only a suggestion");
  assert.equal(sp["CLIP 1"].name, "Clip 1 (introduced as Lee Grant)"); assert.match(sp["CLIP 1"].bio, /not the words of the speaker who played it/);
  const st = b.run.provenance.structure;
  assert.equal(b.run.provenance.labelsOrigin, "words"); assert.equal(st.established, true); assert.equal(st.changesEstablished, 6);
  assert.deepEqual(st.names.map(n => [n.key, n.name, n.applied]), [["SPEAKER 2", "Sam Ortiz", true], ["SPEAKER 1", "Dana Holt", false]]);
  assert.equal(b.attributionGate.status, "ready"); assert.equal(b.attributionGate.origin, "words");
  // every spoken word, in order: the page's text minus its controls and times
  const spoken = PAGE.split("\n").filter(l => l.trim() && l !== "Copy link" && !/^\d\d:\d\d:\d\d$/.test(l)).join(" ");
  assert.equal(spokenOnly(b.transcript), words(spoken));
  // the unlabelled text is kept, and the model was shown paragraphs, never asked to rewrite them
  assert.ok(b.run.inputHistory.length >= 1);
  assert.match(m.prompts.find(p => p.startsWith("This transcript has no speaker labels")), /Paragraph breaks are not changes of speaker/);
});

test("a change the words do not show, a clip without its introduction, or a segment the review rejects is left as not established", async t => {
  const m = scripted(() => proposal({ segments: proposal().segments.map(x => x.para === 6 ? Object.assign({}, x, { change: { kind: "thanks_host", quote: "Thanks so much for the invitation" } }) : x),
    clips: [{ id: "CLIP 1", kind: "recording", introducedAs: "Lee Grant", introQuote: "here is the tape from yesterday", returnQuote: "So that's a pretty amazing clip" }] }),
    p => { const v = agreeAll(p); const lines = (p.split("\nSegments:\n")[1] || "").split("\n"); const i = lines.findIndex(l => l.includes("Is it the most popular")); if (i >= 0) v.verdicts[i].agree = false; return v; });
  const s = await fixture(t, m.ai);
  const id = (await s.api("POST", "/api/intake", { input: PAGE })).data.run.id;
  const b = await s.finish(id);
  const turns = shared.parseTranscript(b.transcript, { mode: b.run.parseMode });
  const labelOf = start => turns.find(x => x.text.startsWith(start)).label;
  assert.equal(labelOf("In my opinion"), "UNLABELED", "not a clip without its introduction found beside it, and never the host's");
  assert.equal(labelOf("Thank you for having me"), "UNLABELED", "the quoted words are not in the text, so the change is not established");
  assert.equal(labelOf("Is it the most popular"), "UNLABELED", "the review did not agree");
  assert.equal(labelOf("It is. The total"), "SPEAKER 2", "a later change shown by the words is established again");
  const st = b.run.provenance.structure;
  assert.equal(st.clips.length, 0); assert.match(st.clipsRejected[0].why, /introduction was not found/);
  assert.ok(st.notEstablished.some(x => /not found/.test(x.why))); assert.equal(st.reviewDisagreed, 1);
  assert.equal(b.run.speakers.find(x => x.key === "UNLABELED").name, "Speaker not established");
  assert.equal(spokenOnly(b.transcript), spokenOnly(cleanText(PAGE).text));
});

test("an unlabelled monologue: paragraph breaks do not make speakers, so the text keeps no labels and says so once", async t => {
  const mono = Array.from({ length: 6 }, (_, i) => "Paragraph " + (i + 1) + " of one long talk about the town budget, with enough words to be a real paragraph of speech.").join("\n\n");
  const m = scripted(p => { const first = /\nNumbered paragraphs:\n\[(\d+)\] (.*)/.exec(p); return { segments: [{ para: +first[1], start: first[2].split(" ").slice(0, 6).join(" "), voice: "A", change: { kind: "none", quote: "" } }], clips: [], names: [], voices: [] }; }, agreeAll);
  const s = await fixture(t, m.ai);
  const id = (await s.api("POST", "/api/intake", { input: mono })).data.run.id;
  const b = await s.finish(id);
  assert.equal(b.transcript, mono, "nothing is relabelled");
  assert.deepEqual(shared.speakerLabels(shared.parseTranscript(b.transcript, { mode: b.run.parseMode })), ["UNLABELED"]);
  assert.equal(b.run.provenance.structure.established, false); assert.match(b.run.provenance.structure.method, /Paragraph breaks are not changes of speaker/);
  // asked once: a second reading does not ask again
  const before = m.prompts.filter(p => p.startsWith("This transcript has no speaker labels")).length;
  await s.api("POST", "/api/runs/" + id + "/read"); await s.finish(id);
  assert.equal(m.prompts.filter(p => p.startsWith("This transcript has no speaker labels")).length, before);
});

test("a conversation with interruptions: a turn can start mid-paragraph, the first speaker resumes, and the words stay exactly as they were", async t => {
  const talk = "We looked at the numbers and I think the real issue— Sorry, can I jump in? Which numbers? —is the cost of the second bridge, which nobody budgeted.\n\nThe county's own estimate. It came out in March.\n\nAnd the state will not cover any of it.";
  const m = scripted(() => ({ segments: [
    { para: 0, start: "We looked at the numbers", voice: "A", change: { kind: "none", quote: "" } },
    { para: 0, start: "Sorry, can I jump in?", voice: "B", change: { kind: "interrupts", quote: "Sorry, can I jump in" } },
    { para: 0, start: "—is the cost of the", voice: "A", change: { kind: "resumes", quote: "I think the real issue" } },
    { para: 1, start: "The county's own estimate", voice: "A", change: { kind: "none", quote: "" } },
  ], clips: [], names: [], voices: [] }), agreeAll);
  const s = await fixture(t, m.ai);
  const id = (await s.api("POST", "/api/intake", { input: talk })).data.run.id;
  const b = await s.finish(id);
  assert.equal(b.transcript, "SPEAKER 1: We looked at the numbers and I think the real issue—\nSPEAKER 2: Sorry, can I jump in? Which numbers?\nSPEAKER 1: —is the cost of the second bridge, which nobody budgeted.\n\nSPEAKER 1: The county's own estimate. It came out in March.\n\nSPEAKER 1: And the state will not cover any of it.");
  assert.equal(spokenOnly(b.transcript), words(talk));
  // a labelled conversation with interruptions is left as the source gave it
  const labelled = "HOST: So the real issue is— GUEST: The cost. HOST: —the cost, yes.\nGUEST: Exactly— HOST: And who pays?\nGUEST: The county does.";
  const c = cleanText(labelled);
  assert.equal(c.text, "HOST: So the real issue is—\nGUEST: The cost.\nHOST: —the cost, yes.\nGUEST: Exactly—\nHOST: And who pays?\nGUEST: The county does.", "the source's labels written mid-line start turns of their own");
  assert.equal(c.record.inlineLabelsSplit, 3); assert.equal(c.record.web, null); assert.equal(c.record.removedBefore, 0);
  assert.equal(words(c.text), words(labelled));
  // a speaker who talks once, first, is part of the dialogue, not material before it
  const moderated = cleanText("MODERATOR: Welcome to the debate. Our first question goes to the mayor.\nMAYOR: Thank you.\nCHALLENGER: Thanks.\nMAYOR: The budget is balanced.\nCHALLENGER: It is not.");
  assert.equal(moderated.record.removedBefore, 0); assert.match(moderated.text, /^MODERATOR: Welcome/);
});

test("a labelled transcript: a clip inside the host's turn becomes its own turn; the source's labels stay; the speaker check leaves the clip alone", async t => {
  const text = "HOST: Here is what the senator said on Sunday. Roll the clip. We will never raise the gas tax, not this year and not next year. So that's the promise, and here is the bill he signed.\nGUEST: The bill raises it by four cents.\nHOST: So he broke it?";
  const m = scripted(p => p.startsWith("Find recordings played") ? { clips: [{ para: 0, kind: "recording", start: "We will never raise the", end: "this year and not next year", introQuote: "Here is what the senator said on Sunday. Roll the clip", returnQuote: "So that's the promise", introducedAs: "the senator" }] } : {}, agreeAll);
  const s = await fixture(t, m.ai);
  const id = (await s.api("POST", "/api/intake", { input: text })).data.run.id;
  const b = await s.finish(id);
  const turns = shared.parseTranscript(b.transcript, { mode: b.run.parseMode });
  assert.deepEqual(turns.map(x => x.label), ["HOST", "CLIP 1", "HOST", "GUEST", "HOST"]);
  assert.equal(turns[1].text, "We will never raise the gas tax, not this year and not next year.");
  assert.equal(b.run.provenance.labelsOrigin, "source"); assert.equal(b.run.provenance.structure.clips[0].speaker, "HOST");
  assert.equal(b.run.speakers.find(x => x.key === "CLIP 1").name, "Clip 1 (introduced as the senator)");
  const prep = m.prompts.filter(p => p.startsWith("Prepare transcript speaker labels"));
  assert.ok(prep.length && prep.every(p => !/\] CLIP 1: /.test(p)), "the clip is not a label to audit");
  assert.equal(spokenOnly(b.transcript), spokenOnly(text));
  // without any introduction in the words, a labelled transcript is not even looked at
  const m2 = scripted(() => { throw new Error("should not be asked"); }, agreeAll);
  const s2 = await fixture(t, m2.ai);
  const id2 = (await s2.api("POST", "/api/intake", { input: "HOST: Welcome back.\nGUEST: Thanks for having me.\nHOST: Let us start with the budget." })).data.run.id;
  const b2 = await s2.finish(id2);
  assert.equal(b2.run.processing.status, "complete"); assert.equal(b2.run.provenance.structure, undefined);
});

test("saved runs are never restructured behind the person's back, and a run with readings never is", async t => {
  const m = scripted(() => proposal(), agreeAll);
  const s = await fixture(t, m.ai);
  const id = await s.store.createRun({ title: "saved" }, cleanText(PAGE).text);
  await s.api("POST", "/api/runs/" + id + "/read"); const b = await s.finish(id);
  assert.equal(m.prompts.filter(p => p.startsWith("This transcript has no speaker labels")).length, 0);
  assert.deepEqual(shared.speakerLabels(shared.parseTranscript(b.transcript, { mode: b.run.parseMode })), ["UNLABELED"]);
});

test("the evaluation's speaker checks: words kept, page controls gone, the clip's claim credited to the clip, guest and host told apart", () => {
  const { speakerChecks } = require("../scripts/eval-readings");
  const spec = JSON.parse(require("node:fs").readFileSync(path.join(__dirname, "..", "eval", "cases.json"), "utf8"));
  const clip = spec.cases.find(c => c.id === "clip-and-return");
  // the labelled text a good structure pass would give, and a reading that credits the clip's claim to the clip
  const before = cleanText(clip.text).text, paras = before.split(/\n\s*\n/);
  const good = ["SPEAKER 1: " + paras[0], "SPEAKER 1: " + paras[1], "SPEAKER 1: " + paras[2], "CLIP 1: " + paras[3], "SPEAKER 1: " + paras[4]].join("\n\n");
  const bundle = (text, speaker) => ({ transcript: text, run: { parseMode: "transcript", provenance: { overrides: {} } }, passages: [{ readingGate: { status: "ready" }, analysis: { claims: [{ text: "In my opinion, the agreement was counterproductive.", speaker }] } }] });
  const ok = speakerChecks(clip, bundle(good, "CLIP 1"), before);
  assert.deepEqual(ok.filter(x => !x[1]), [], JSON.stringify(ok));
  assert.equal(ok.length, 5);
  // the same words all credited to the host: the pointers say so
  const hostOnly = paras.map(p => "SPEAKER 1: " + p).join("\n\n");
  const bad = speakerChecks(clip, bundle(hostOnly, "SPEAKER 1"), before).filter(x => !x[1]).map(x => x[0]);
  assert.ok(bad.some(x => /is in a turn labelled/.test(x)) && bad.some(x => /different speakers' words/.test(x)) && !bad.some(x => /claims holding/.test(x)), bad.join(" | "));
  // a lost word and leftover page controls are caught
  const lost = speakerChecks(clip, bundle(good.replace("He denied it, ", "") + "\n\nCopy link\n00:01:05", "CLIP 1"), before).filter(x => !x[1]).map(x => x[0]);
  assert.ok(lost.includes("every spoken word kept, in order") && lost.includes("no page controls or timestamps in the text"), lost.join(" | "));
});
