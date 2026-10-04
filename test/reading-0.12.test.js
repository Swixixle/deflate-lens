"use strict";
/* 0.12: the reading contract (reading-2), bounded context, consistency gates, one path for automatic and manual
   reading, and the identity of a matched source. Each test drives the real server with an injected model; the mock's
   wording proves wiring only. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research");
const shared = require("../shared/transcript");
const P = require("../shared/prompts");
const Q = require("../server/quality");
const { readingMaterial, materialAsRead } = require("../server/reading");
const { sha256 } = require("../server/store");
const { claimAnalysis } = require("../server/preparation");
const { buildMarkdown, buildExport } = require("../server/exportClaims");

const words = i => "This is turn " + i + " with enough plain words in it to quote safely and read as one argument.";
const transcript = Array.from({ length: 18 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": " + words(i)).join("\n");
const isPassage = p => p.startsWith("Help a reader understand this passage accurately.") && !p.includes("This is ONE claim");

async function fixture(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-012-"));
  const systems = [];
  async function start(extra = {}) {
    const app = createApp(Object.assign({ dataDir: dir, examplesDir: dir, env: {}, envPath: path.join(dir, ".env"), ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), run: async () => ({ code: 1, out: "" }) }, options, extra));
    await app.ready;
    const server = await new Promise(r => { const s = app.app.listen(0, "127.0.0.1", () => r(s)); });
    const api = async (method, p, body) => { const res = await fetch("http://127.0.0.1:" + server.address().port + p, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const type = res.headers.get("content-type") || ""; return { status: res.status, data: type.includes("json") ? await res.json() : await res.text() }; };
    const close = async () => { for (const job of app.reader.jobs.values()) job.controller.abort(); await Promise.all([...app.reader.jobs.values()].map(j => j.done)); await new Promise(r => server.close(r)); };
    const finish = async id => { const job = app.reader.jobs.get(id); if (job) await job.done; return app.store.bundle(id); };
    const value = { ...app, api, close, finish }; systems.push(value); return value;
  }
  t.after(async () => { for (const s of systems) await s.close(); await fs.rm(dir, { recursive: true, force: true }); });
  const s = await start(); return { ...s, dir, restart: start };
}
/* A model that answers like the mock but lets a test rewrite each passage draft and see every prompt. */
function scripted(edit) {
  const mock = createMockAI(), prompts = [];
  return { prompts, ai: { ...mock, async sample(args) { prompts.push(args.prompt); const out = await mock.sample(args); if (edit && isPassage(args.prompt)) edit(out.data, prompts.filter(isPassage).length); out.text = JSON.stringify(out.data); return out; } } };
}

/* ---- consistency gates ---- */
const turns = shared.parseTranscript(transcript);
const passage = { turnStart: 2, turnEnd: 5 };
function draft(over) {
  const a = { asSaid: [{ turn: 2, speaker: "HOST", quote: words(2) }], deflated: { hs: "d", g5: "d" }, fidelity: { grade: "faithful", notes: { hs: "", g5: "" } },
    jump: { present: false, pivot: "", hs: "No concern: the reasons support the point.", g5: "It holds." }, defense: { hs: "f", g5: "f" }, revision: { jumpSurvives: "", hs: "r", g5: "r" },
    claims: [{ text: "c", speaker: "HOST", type: "claim", plain: { hs: "p", g5: "p" }, basis: { hs: "b", g5: "b" } }], judgments: { evidence: "weak", inference: "n/a" } };
  return Object.assign(a, typeof over === "function" ? over(a) || {} : over);
}
const issues = (a, contract, kind) => Q.contentIssues(a, passage, turns, {}, kind || "transcript", contract);

test("reading-2 gates: injected inconsistent drafts are refused, a sound draft passes, and records saved before 0.12 keep their old rules", () => {
  assert.deepEqual(issues(draft({}), P.CONTRACT), [], "a sound reading with no concern passes: no flaw is required");
  assert.ok(issues(draft(a => { a.jump.pivot = "with enough plain words"; }), P.CONTRACT).includes("no concern was raised, so there can be no pivot"));
  assert.ok(issues(draft(a => { a.judgments.inference = "gap"; }), P.CONTRACT).includes("a reasoning gap is recorded although no concern was raised"));
  assert.ok(issues(draft(a => { a.revision.jumpSurvives = "partly"; }), P.CONTRACT).includes("a concern that was never raised cannot stand in the final assessment"));
  const withdrawn = a => { a.jump = { present: true, pivot: "with enough plain words", hs: "c", g5: "c" }; a.revision.jumpSurvives = "no"; a.judgments.inference = "gap"; };
  assert.ok(issues(draft(withdrawn), P.CONTRACT).includes("a concern withdrawn after the fair reading cannot remain the final judgment"));
  assert.ok(issues(draft(a => { a.jump = { present: true, pivot: "", hs: "c", g5: "c" }; a.revision.jumpSurvives = "yes"; }), P.CONTRACT).includes("the claimed jump has no matching pivot"));
  assert.ok(issues(draft(a => { a.jump = { present: true, pivot: "with enough plain words", hs: "c", g5: "" }; a.revision.jumpSurvives = "yes"; }), P.CONTRACT).includes("the concern needs both reading levels"));
  assert.ok(issues(draft(a => { a.jump = { present: true, pivot: "with enough plain words", hs: "c", g5: "c" }; a.revision.jumpSurvives = ""; }), P.CONTRACT).includes("the final assessment does not say whether the concern stands"));
  assert.ok(issues(draft(a => { a.claims[0].type = "fact"; }), P.CONTRACT).some(x => /checkable claim/.test(x)), "a truth-like label is refused for a new reading");
  // the same shapes under no recorded contract (saved by 0.11 or earlier) are not re-judged by rules they never had
  const legacy = draft(a => { a.claims[0].type = "fact"; a.revision.jumpSurvives = "no"; a.judgments.inference = "gap"; });
  assert.deepEqual(issues(legacy, undefined), []);
});

test("a typed claim: reading-2 stores a checkable claim with no inference to judge; an older claim record keeps its saved judgment", () => {
  const b = { transcript: "Most city residents want the library open until midnight." };
  const a = claimAnalysis({ deflated: { hs: "x", g5: "y" }, type: "unsupported", basis: { hs: "b", g5: "b" }, judgments: { evidence: "weak", inference: "gap" } }, b, P.CONTRACT);
  assert.equal(a.claims[0].type, "claim"); assert.deepEqual(a.judgments, { evidence: "n/a", inference: "n/a" }); assert.equal(a.jump.present, false);
  assert.deepEqual(issues(a, P.CONTRACT, "claim").filter(x => /reasoning|checkable/.test(x)), []);
  assert.ok(issues(Object.assign({}, a, { judgments: { evidence: "n/a", inference: "gap" } }), P.CONTRACT, "claim").includes("a single typed claim has no reasoning to judge"));
  const old = claimAnalysis({ deflated: { hs: "x", g5: "y" }, type: "unsupported", judgments: { evidence: "weak", inference: "gap" } }, b);
  assert.equal(old.claims[0].type, "unsupported"); assert.equal(old.judgments.inference, "gap");
  assert.equal(shared.claimTypeLabel("unsupported"), "Checkable claim"); assert.equal(shared.historicalType("unsupported"), "unsupported"); assert.equal(shared.historicalType("claim"), "");
});

test("an invalid draft is repaired through the bounded review, or held with its own reasons on the card", async t => {
  // first draft inconsistent, the repair is consistent: the card is ready after one retry
  let m = scripted((d, n) => { if (n === 1) d.judgments.inference = "gap"; });
  let s = await fixture(t, { ai: m.ai });
  let id = (await s.api("POST", "/api/intake", { input: transcript })).data.run.id, b = await s.finish(id);
  assert.equal(b.run.processing.status, "complete");
  assert.ok(b.passages.every(p => p.readingGate.status === "ready"));
  assert.ok(m.prompts.some(p => isPassage(p) && p.includes("a reasoning gap is recorded although no concern was raised")), "the repair prompt names the problem");
  // every draft inconsistent: held, and the card says why (not a generic "has not passed")
  m = scripted(d => { d.jump.pivot = words(3).slice(0, 30); });
  s = await s.restart({ ai: m.ai });
  id = (await s.api("POST", "/api/intake", { input: transcript })).data.run.id; b = await s.finish(id);
  assert.equal(b.run.processing.status, "partial");
  for (const p of b.passages) {
    assert.equal(p.readingGate.status, "held"); assert.ok(p.readingGate.reasons.includes("no concern was raised, so there can be no pivot"), JSON.stringify(p.readingGate));
  }
  assert.ok(b.run.processing.issues[0].reasons.length);
  assert.match(buildMarkdown(b), /Reading held, not shown\.\*\* Why: no concern was raised, so there can be no pivot/);
  assert.equal(buildExport(b).passagesHeld.length, b.passages.length);
});

/* ---- context ---- */
test("context: up to two whole turns each side, marked apart from the passage, recorded, and the same text reaches the review", async t => {
  const m = scripted();
  const s = await fixture(t, { ai: m.ai });
  const id = (await s.api("POST", "/api/intake", { input: transcript })).data.run.id, b = await s.finish(id);
  const p = b.passages[1]; // turns 8–15 in the mock's segmentation
  assert.deepEqual([p.turnStart, p.turnEnd], [8, 15]);
  const ctx = p.provenance.context;
  assert.equal(ctx.version, shared.CONTEXT_VERSION); assert.deepEqual(ctx.before.map(x => x.turn), [6, 7]); assert.deepEqual(ctx.after.map(x => x.turn), [16, 17]);
  assert.deepEqual(ctx.before.map(x => x.speaker), ["HOST", "GUEST"]); assert.deepEqual(ctx.omitted, []);
  const prompt = m.prompts.find(x => isPassage(x) && x.includes("PASSAGE (turns 8–15"));
  assert.match(prompt, /CONTEXT BEFORE \(not part of the passage\):\n\[6\] HOST: .*\n\[7\] GUEST: /); assert.match(prompt, /CONTEXT AFTER \(not part of the passage\):\n\[16\] HOST: /);
  assert.match(prompt, /Take no claims and no quotes from them/);
  const review = m.prompts.find(x => x.startsWith("Review this reading before it is shown") && x.includes("PASSAGE (turns 8–15"));
  assert.ok(review.includes("CONTEXT BEFORE (for interpretation only):\n[6] HOST: " + words(6)), "the review sees the same neighbouring turns");
  assert.match(review, /Do not require a flaw/);
  // the record identifies the exact material: rebuilding it from the saved text reproduces the hash
  assert.equal(readingMaterial(b, p).context.hash, ctx.hash);
  assert.equal(p.provenance.contract, P.CONTRACT);
});

test("context: a turn too long to fit is named as omitted, never cut into an unlabelled fragment", () => {
  const long = Array.from({ length: 8 }, (_, i) => (i % 2 ? "B" : "A") + ": " + (i === 1 ? "x ".repeat(3000) : words(i))).join("\n");
  const ts = shared.parseTranscript(long);
  const c = shared.readingContext(ts, {}, 3, 4, { turns: 2, chars: 4000 });
  assert.deepEqual(c.record.before.map(x => x.turn), [2]); assert.deepEqual(c.record.omitted.map(x => [x.turn, x.side]), [[1, "before"]]);
  assert.ok(!c.beforeText.includes("x x x"));
  const prompt = P.deflate({}, { title: "t", stake: "s", turnStart: 3, turnEnd: 4 }, shared.fmtTurns(ts, {}, 3, 4), { beforeText: c.beforeText, afterText: c.afterText, omitted: c.record.omitted });
  assert.match(prompt, /Not shown: turn 1 \(before, \d+ characters, too long to include\)/);
});

test("context invalidation: editing a neighbouring turn outside the passage, or its speaker, makes the reading need updating", async t => {
  const s = await fixture(t);
  const id = (await s.api("POST", "/api/intake", { input: transcript })).data.run.id; let b = await s.finish(id);
  assert.ok(b.passages.every(p => p.readingGate.status === "ready"));
  // turn 16 lies outside p002 (8–15) but inside its context
  const edited = transcript.replace(words(16), words(16).replace("plain", "different"));
  b = (await s.api("PUT", "/api/runs/" + id, { run: {}, transcript: edited })).data;
  const p = b.passages.find(x => x.turnStart === 8);
  assert.ok(p.stale.includes("transcript changed since this analysis")); assert.equal(p.readingGate.status, "held");
  // a speaker correction on a context turn
  const id2 = (await s.api("POST", "/api/intake", { input: transcript })).data.run.id; b = await s.finish(id2);
  b = (await s.api("PUT", "/api/runs/" + id2, { run: { provenance: Object.assign({}, b.run.provenance, { overrides: { 16: "GUEST" } }) } })).data;
  assert.ok(b.passages.find(x => x.turnStart === 8).stale.includes("attribution changed since this analysis"));
});

/* ---- one path ---- */
test("a reread from a card and the page's model route use the server's reading-2 prompt; a failed reread keeps the ready reading", async t => {
  let fail = false;
  const m = scripted(d => { if (fail) d.judgments.inference = "gap"; });
  const s = await fixture(t, { ai: m.ai });
  const id = (await s.api("POST", "/api/intake", { input: transcript })).data.run.id; let b = await s.finish(id);
  const p = b.passages[0], expected = readingMaterial(b, p).prompt;
  m.prompts.length = 0;
  const r = await s.api("POST", "/api/runs/" + id + "/passages/" + p.id + "/reread");
  assert.equal(r.status, 202); b = await s.finish(id);
  const sent = m.prompts.filter(isPassage);
  assert.equal(sent.length, 1, "only the requested card is read again"); assert.equal(sent[0], expected);
  assert.equal(b.passages[0].readingRev, p.readingRev + 1); assert.equal(b.passages[0].historyCount === undefined ? 1 : b.passages[0].historyCount, 1);
  // the older page route: whatever prompt the page sends, the server reads under its own instructions
  m.prompts.length = 0;
  const legacy = await s.api("POST", "/api/sample", { prompt: "You are a deflation reader. Old instructions.", json: true, runId: id, purpose: "deflate", passageId: p.id, basedOn: { transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig } });
  assert.equal(legacy.status, 200, JSON.stringify(legacy.data));
  assert.ok(!m.prompts.some(x => x.includes("Old instructions"))); assert.equal(m.prompts.filter(isPassage)[0], readingMaterial(b, b.passages[0]).prompt);
  assert.equal(legacy.data.provenance.contract, P.CONTRACT);
  // a reread that cannot pass keeps the reading it was meant to replace, and says so
  fail = true;
  await s.api("POST", "/api/runs/" + id + "/passages/" + p.id + "/reread"); b = await s.finish(id);
  assert.equal(b.passages[0].readingGate.status, "ready"); assert.equal(b.passages[0].held.kept, true);
  assert.ok(b.passages[0].held.issues.includes("a reasoning gap is recorded although no concern was raised"));
  assert.equal(b.run.processing.status, "complete");
  assert.match(buildMarkdown(b), /did not pass its checks; this is the earlier reading/);
  // a second request while one runs is refused plainly; an unknown passage is refused
  assert.equal((await s.api("POST", "/api/runs/" + id + "/passages/p999/reread")).status, 404);
});

test("the overview can be requested again and allows no recurring concern", async t => {
  const m = scripted();
  const s = await fixture(t, { ai: m.ai });
  const id = (await s.api("POST", "/api/intake", { input: transcript })).data.run.id; let b = await s.finish(id);
  assert.equal(b.summary.readingGate.status, "ready"); assert.deepEqual(b.summary.patterns, []);
  m.prompts.length = 0;
  assert.equal((await s.api("POST", "/api/runs/" + id + "/overview")).status, 202); b = await s.finish(id);
  assert.equal(m.prompts.filter(x => x.startsWith("Below are the final readings of 3 passages")).length, 1);
  assert.equal(m.prompts.filter(isPassage).length, 0, "an overview request does not reread the cards");
  assert.match(buildMarkdown(b), /## Across this reading\n\nNo recurring concern across the final assessments\./);
});

/* ---- source identity ---- */
const matched = { method: "youtube-search", basis: "title and length", episode: { title: "Ep 1: No transcript", durationSeconds: 3600 }, video: { id: "FullEpisode", url: "https://www.youtube.com/watch?v=FullEpisode", title: "The Test Show — Ep 1: No transcript", channel: "The Test Show", durationSeconds: 3480 }, toleranceSeconds: 180, differenceSeconds: 120, passing: 1, alternatives: [] };
function chain(result) { return { locate: async () => ({ kind: "episode" }), words: async () => Object.assign({ ok: true, text: transcript, title: "Ep 1: No transcript", show: { name: "The Test Show" }, episode: { title: "Ep 1: No transcript", duration: 3600 } }, result) }; }
async function fetched(s, extra) { const r = await s.api("POST", "/api/transcript/resolve", Object.assign({ url: "https://show.test/feed.xml" }, extra)); for (let i = 0; i < 200; i++) { const j = await s.jobs.get(r.data.jobId); if (j.state !== "running") break; await new Promise(z => setTimeout(z, 5)); } const c = await s.api("POST", "/api/transcript/jobs/" + r.data.jobId + "/consume"); return s.finish(c.data.run.id); }

test("a searched video stays 'matched by title and length' through reading, reload and export until a person confirms that exact source", async t => {
  const s = await fixture(t, { resolver: chain({ source: { kind: "youtube-captions", url: matched.video.url, note: "captions for the video found via a YouTube search" }, match: matched, identity: "needs_confirmation" }) });
  let b = await fetched(s);
  assert.equal(b.run.processing.status, "complete", "reading started and finished: the warning did not disappear with it");
  assert.equal(b.sourceIdentity.state, "needs_confirmation"); assert.equal(b.sourceIdentity.label, "Video matched by title and length — check source");
  assert.deepEqual(b.run.import.match.video, matched.video); assert.equal(b.run.import.match.toleranceSeconds, 180); assert.equal(b.run.import.episodeInfo.durationSeconds, 3600);
  // a page save cannot rewrite how the source was acquired
  await s.api("PUT", "/api/runs/" + b.run.id, { run: { title: "Renamed", import: { url: "https://elsewhere.test", identity: "direct" } } });
  const again = await s.restart();
  b = (await again.api("GET", "/api/runs/" + b.run.id)).data;
  assert.equal(b.run.title, "Renamed"); assert.equal(b.sourceIdentity.state, "needs_confirmation"); assert.equal(b.run.import.url, "https://show.test/feed.xml");
  const exp = (await again.api("GET", "/api/runs/" + b.run.id + "/export.json")).data;
  assert.equal(exp.run.sourceIdentity.state, "needs_confirmation"); assert.equal(exp.schema, "deflate-lens/claims@0.6");
  const md = (await again.api("GET", "/api/runs/" + b.run.id + "/export.md")).data;
  assert.match(md, /The video was matched by title and length; no person has confirmed that it is the intended episode\./);
  assert.match(md, /Selected video: The Test Show — Ep 1: No transcript — The Test Show \(58 min 00 s\)/);
  assert.match(md, /a length within 180 s \(the larger of 120 s and 5% of the episode\)/);
  // confirming a source other than the one now on the run (a stale tab) is refused; confirming this one is recorded
  assert.equal((await again.api("POST", "/api/runs/" + b.run.id + "/source/confirm", { sourceUrl: "https://www.youtube.com/watch?v=OtherVideoX" })).status, 409);
  assert.equal((await again.api("POST", "/api/runs/" + b.run.id + "/source/confirm", { sourceUrl: matched.video.url })).status, 409, "a confirmation names the comparison that was shown (its key)");
  b = (await again.api("POST", "/api/runs/" + b.run.id + "/source/confirm", { sourceUrl: matched.video.url, key: b.sourceIdentity.key })).data;
  assert.equal(b.sourceIdentity.state, "confirmed"); assert.equal(b.sourceIdentity.confirmation.videoId, "FullEpisode"); assert.match(b.sourceIdentity.confirmation.statement, /not a check of the transcript/);
  assert.match(buildMarkdown(b), /a person at this computer said on \d{4}-\d{2}-\d{2} that it is the intended episode/);
});

test("replacing the source invalidates a confirmation and keeps the earlier acquisition; direct and older sources are never called confirmed", async t => {
  let current = { source: { kind: "youtube-captions", url: matched.video.url, note: "via a YouTube search" }, match: matched, identity: "needs_confirmation" };
  const s = await fixture(t, { resolver: { locate: async () => ({ kind: "episode" }), words: async () => Object.assign({ ok: true, text: transcript, title: "Ep 1", episode: { title: "Ep 1", duration: 3600 } }, current) } });
  let b = await fetched(s);
  b = (await s.api("POST", "/api/runs/" + b.run.id + "/source/confirm", { sourceUrl: matched.video.url, key: b.sourceIdentity.key })).data;
  assert.equal(b.sourceIdentity.state, "confirmed");
  const other = Object.assign({}, matched, { video: Object.assign({}, matched.video, { id: "SecondVideo", url: "https://www.youtube.com/watch?v=SecondVideo" }) });
  current = { source: { kind: "youtube-captions", url: other.video.url, note: "via a YouTube search" }, match: other, identity: "needs_confirmation" };
  b = await fetched(s, { targetRunId: b.run.id });
  assert.equal(b.sourceIdentity.state, "needs_confirmation", "a confirmation of one video does not carry to another");
  assert.equal(b.run.sourceConfirmationHistory[0].why, "the source was replaced"); assert.equal(b.run.importHistory[0].import.match.video.id, "FullEpisode");
  // a feed transcript named by the show: nothing to confirm, and confirming is refused
  current = { source: { kind: "feed-transcript", url: "https://show.test/ep1.vtt", note: "the transcript the show publishes" }, match: null, identity: "direct" };
  b = await fetched(s);
  assert.equal(b.sourceIdentity.state, "direct"); assert.equal(b.sourceIdentity.label, "");
  assert.equal((await s.api("POST", "/api/runs/" + b.run.id + "/source/confirm", { sourceUrl: "https://show.test/ep1.vtt" })).status, 409);
  // records saved before 0.12: a searched match is still flagged (never retroactively confirmed); others are "not recorded"
  const legacy = await s.store.createRun({ import: { url: "https://show.test/feed.xml", title: "Old", method: "transcript: youtube-captions", source: { kind: "youtube-captions", url: "https://www.youtube.com/watch?v=OldOldOldOl", note: "YouTube's automatic captions for the video found via a YouTube search: …" } } }, transcript);
  b = await s.store.bundle(legacy);
  assert.equal(b.sourceIdentity.state, "needs_confirmation"); assert.equal(b.sourceIdentity.legacy, true); assert.equal(b.sourceIdentity.match, null);
  const legacyFeed = await s.store.createRun({ import: { url: "https://show.test/feed.xml", title: "Old", method: "transcript: feed-transcript", source: { kind: "feed-transcript", url: "https://show.test/ep.vtt", note: "the transcript the show publishes in its feed" } } }, transcript);
  assert.equal((await s.store.bundle(legacyFeed)).sourceIdentity.state, "not_recorded");
});

/* ---- 0.12.1: what a reading was made from, and what a confirmation confirms ---- */
test("the exact passage and context of a reading can be rebuilt after the text is edited twice and speakers are corrected", async t => {
  const s = await fixture(t);
  const id = (await s.api("POST", "/api/intake", { input: transcript })).data.run.id; let b = await s.finish(id);
  const p = b.passages.find(x => x.turnStart === 8), orig = b.run.input.sha256, url = "/api/runs/" + id + "/passages/" + p.id + "/material";
  assert.deepEqual(p.provenance.context.target.map(x => x.turn), [8, 9, 10, 11, 12, 13, 14, 15], "the passage's speakers are recorded with the context's");
  let m = (await s.api("GET", url)).data;
  assert.deepEqual([m.available, m.matches, m.current, m.readFrom], [true, true, true, orig]);
  // two edits: a context turn (16), then a passage turn (9)
  const e1 = transcript.replace(words(16), words(16).replace("plain", "different")), e2 = e1.replace(words(9), words(9).replace("plain", "other"));
  await s.api("PUT", "/api/runs/" + id, { run: {}, transcript: e1 });
  await s.api("PUT", "/api/runs/" + id, { run: {}, transcript: e2 });
  assert.deepEqual((await fs.readdir(path.join(s.dir, "runs", id, "versions"))).sort(), [sha256(transcript), sha256(e1)].map(h => h + ".txt").sort(), "each replaced text is kept, named by its SHA-256");
  m = (await s.api("GET", url)).data;
  assert.deepEqual([m.available, m.matches, m.current, m.readFrom], [true, true, false, orig]);
  assert.ok(m.source.includes("[16] HOST: " + words(16)) && m.source.includes("[9] GUEST: " + words(9)) && !/different|other words/.test(m.source), "the material is the text that was read, not today's");
  // speaker corrections on a context turn and a passage turn
  b = await s.store.bundle(id);
  await s.api("PUT", "/api/runs/" + id, { run: { provenance: Object.assign({}, b.run.provenance, { overrides: { 7: "HOST", 9: "HOST" } }) } });
  m = (await s.api("GET", url)).data;
  assert.equal(m.matches, true); assert.ok(m.source.includes("[7] GUEST: ") && m.source.includes("[9] GUEST: "), "the speakers named when it was read");
  // a duplicate keeps the earlier texts with the readings made from them
  const copy = (await s.api("POST", "/api/runs/" + id + "/duplicate")).data;
  const cm = (await s.api("GET", "/api/runs/" + copy.run.id + "/passages/" + p.id + "/material")).data;
  assert.equal(cm.matches, true);
  // what is not available is said plainly: the old text was not kept (edited before 0.12.1), or no context was recorded (before 0.12)
  await fs.rm(path.join(s.dir, "runs", id, "versions"), { recursive: true });
  m = (await s.api("GET", url)).data;
  assert.equal(m.available, false); assert.match(m.why, /only its fingerprint remains/);
  b = await s.store.bundle(id);
  assert.match((await materialAsRead(s.store, b, Object.assign({}, b.passages[1], { provenance: { recorded: true } }))).why, /before 0\.12/);
  // a typed claim
  const cid = (await s.api("POST", "/api/runs", { run: { kind: "claim" }, transcript: "Most office workers in the city now commute by bicycle." })).data.run.id;
  const c = (await s.api("GET", "/api/runs/" + cid + "/passages/p001/material")).data;
  assert.equal(c.available, true); assert.match(c.source, /^CLAIM \(typed by a person\):\nMost office workers/);
  assert.equal((await s.api("GET", "/api/runs/" + id + "/passages/p099/material")).status, 404);
});

test("a confirmation names the video and the episode: another episode on the same video needs its own confirmation", async t => {
  const video = matched.video;
  let ep = { title: "Episode A", duration: 3600, guid: "guid-a" };
  const s = await fixture(t, { resolver: { locate: async () => ({ kind: "episode" }), words: async () => ({ ok: true, text: transcript, title: ep.title, episode: ep, source: { kind: "youtube-captions", url: video.url, note: "via a YouTube search" }, match: Object.assign({}, matched, { episode: { title: ep.title, durationSeconds: ep.duration } }), identity: "needs_confirmation" }) } });
  let b = await fetched(s); const id = b.run.id, keyA = b.sourceIdentity.key, confirm = key => s.api("POST", "/api/runs/" + id + "/source/confirm", { sourceUrl: video.url, key });
  b = (await confirm(keyA)).data;
  assert.equal(b.sourceIdentity.state, "confirmed"); assert.equal(b.run.sourceConfirmation.episodeGuid, "guid-a"); assert.equal(b.run.sourceConfirmation.key, keyA);
  // the same episode and video fetched again: the confirmation still applies
  b = await fetched(s, { targetRunId: id });
  assert.equal(b.sourceIdentity.state, "confirmed");
  // episode B, same video address
  ep = { title: "Episode B", duration: 3550, guid: "guid-b" };
  b = await fetched(s, { targetRunId: id });
  assert.equal(b.sourceIdentity.state, "needs_confirmation", "a confirmation of episode A does not carry to episode B on the same video");
  assert.notEqual(b.sourceIdentity.key, keyA);
  const last = b.run.sourceConfirmationHistory.at(-1);
  assert.equal(last.episodeTitle, "Episode A"); assert.equal(last.why, "the source was replaced");
  assert.deepEqual([b.sourceIdentity.earlier.episodeTitle, b.sourceIdentity.earlier.why], ["Episode A", "the source was replaced"]);
  assert.equal(buildExport(b).run.sourceIdentity.state, "needs_confirmation");
  assert.equal((await confirm(keyA)).status, 409, "a page still showing episode A cannot confirm episode B");
  b = (await confirm(b.sourceIdentity.key)).data;
  assert.equal(b.sourceIdentity.state, "confirmed"); assert.equal(b.sourceIdentity.confirmation.episodeTitle, "Episode B"); assert.equal(b.sourceIdentity.earlier, null);
  // a different episode with the same title and length (another guid) is still another episode
  ep = { title: "Episode B", duration: 3550, guid: "guid-b-rerun" };
  b = await fetched(s, { targetRunId: id });
  assert.equal(b.sourceIdentity.state, "needs_confirmation");
  // a confirmation saved by 0.12 named only the video: it does not count now, is shown as earlier, and is kept when replaced
  const file = path.join(s.dir, "runs", id, "run.json"), run = JSON.parse(await fs.readFile(file, "utf8"));
  run.sourceConfirmation = { by: "person at this computer", at: "2026-09-30T12:00:00.000Z", sourceUrl: video.url, videoId: video.id, episodeTitle: "Episode B", statement: "The person said this source is the intended episode." };
  await fs.writeFile(file, JSON.stringify(run, null, 2));
  b = (await s.api("GET", "/api/runs/" + id)).data;
  assert.equal(b.sourceIdentity.state, "needs_confirmation"); assert.match(b.sourceIdentity.earlier.why, /before a confirmation also named the episode/);
  b = (await confirm(b.sourceIdentity.key)).data;
  assert.equal(b.sourceIdentity.state, "confirmed"); assert.equal(b.run.sourceConfirmationHistory.at(-1).at, "2026-09-30T12:00:00.000Z");
});
