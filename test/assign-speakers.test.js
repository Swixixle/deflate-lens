"use strict";
/* Speaker names for a transcript that has none (audio transcribed on this computer, a pasted page). Optional; the
   reading works without it. The model cuts the original text into turns and names them; nothing is rewritten; the
   run records that the labels came from a model; the reading starts again by itself. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research");
const { cutTurns, cleanNames } = require("../server/assign");
const shared = require("../shared/transcript");

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-assign-"));
  const system = createApp({ dataDir: dir, ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), examplesDir: dir });
  await system.ready;
  const server = await new Promise(r => { const s = system.app.listen(0, "127.0.0.1", () => r(s)); });
  const url = "http://127.0.0.1:" + server.address().port;
  const api = async (method, endpoint, body) => { const r = await fetch(url + endpoint, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };
  t.after(async () => { for (const job of system.reader.jobs.values()) job.controller.abort(); await Promise.all([...system.reader.jobs.values()].map(j => j.done)); await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const finish = async id => { const job = system.reader.jobs.get(id); if (job) await job.done; return system.store.bundle(id); };
  return Object.assign({}, system, { api, finish });
}
const PARAS = Array.from({ length: 10 }, (_, i) => "This is paragraph number " + i + " of a transcript made from audio, with enough words in it to be quoted by a card. It mentions " + (i % 2 ? "my book" : "the show") + " and ends here.");

test("cutTurns cuts the original text at the model's starts and never rewrites a word; a start that is not found is dropped", () => {
  const text = "Welcome back to the show. Thanks for having me, it is good to be here. So tell me about the book. Well, the book took five years.";
  const keys = new Set(["HOST", "GUEST"]);
  const r = cutTurns(text, [{ speaker: "Host", start: "Welcome back to the show" }, { speaker: "guest", start: "Thanks for having me, it is" }, { speaker: "HOST", start: "So tell me about the" }, { speaker: "GUEST", start: "Well, the book took five years" }], keys);
  assert.deepEqual(r.turns.map(t => t.speaker), ["HOST", "GUEST", "HOST", "GUEST"]); assert.equal(r.dropped, 0);
  assert.equal(r.turns.map(t => t.text).join(" "), text);
  // a start the model misspelled or invented makes its containing span unknown; an unknown name is UNKNOWN
  const r2 = cutTurns(text, [{ speaker: "HOST", start: "Welcome back" }, { speaker: "GUEST", start: "Thanks for having you" }, { speaker: "Producer", start: "So tell me about the" }], keys);
  assert.deepEqual(r2.turns.map(t => t.speaker), ["UNKNOWN"]); assert.equal(r2.dropped, 1);
  assert.equal(r2.turns[0].text, text);
  assert.equal(r2.turns.map(t => t.text).join(" "), text);
  // a start the model placed out of order is dropped, not applied backwards
  const r3 = cutTurns(text, [{ speaker: "HOST", start: "Welcome back" }, { speaker: "GUEST", start: "So tell me about the" }, { speaker: "HOST", start: "Thanks for having me" }], keys);
  assert.deepEqual(r3.turns.map(t => t.speaker), ["HOST", "UNKNOWN"]); assert.equal(r3.dropped, 1);
  assert.equal(r3.turns.map(t => t.text).join(" "), text);
  assert.deepEqual(cleanNames("Joe Rogan, jordan peterson,, Joe Rogan").map(n => n.key), ["JOE ROGAN", "JORDAN PETERSON"]);
  assert.throws(() => cleanNames("A Very Long Name With Six Words"), /four words/);
  assert.throws(() => cleanNames("unknown"), /reserved/);
});

test("naming the speakers labels an unlabeled transcript, records that a model did it, keeps every word and reads again", async t => {
  const s = await fixture(t);
  const text = PARAS.join("\n\n");
  const made = await s.api("POST", "/api/intake", { input: text });
  const id = made.data.run.id; let b = await s.finish(id);
  assert.equal(b.run.parseMode, "text"); assert.equal(b.run.provenance.notApplicable, true); assert.equal(b.passages.length, 2);
  assert.equal(b.passages[0].analysis.asSaid[0].speaker, "UNLABELED");
  const r = await s.api("POST", "/api/runs/" + id + "/assign-speakers", { names: ["Joe Rogan", "Jordan Peterson"], context: "The Joe Rogan Experience" });
  assert.equal(r.status, 202, JSON.stringify(r.data));
  b = await s.finish(id);
  assert.equal(b.run.provenance.labelsOrigin, "model");
  assert.equal(b.run.provenance.assignment.by, "model"); assert.equal(b.run.provenance.assignment.turns, 10); assert.equal(b.run.provenance.assignment.named, 10); assert.equal(b.run.provenance.assignment.calls.length, 2);
  assert.deepEqual(b.run.speakers.map(x => x.key), ["JOE ROGAN", "JORDAN PETERSON"]);
  assert.deepEqual(shared.speakerLabels(shared.parseTranscript(b.transcript, { mode: b.run.parseMode })), ["JOE ROGAN", "JORDAN PETERSON"]);
  // every word of the original text is still there, in order, with only the labels added
  assert.equal(shared.wordsOf(b.transcript.replace(/^[A-Z ]+: /gm, "")), shared.wordsOf(text));
  assert.equal(b.run.inputHistory.length, 1, "the unlabeled text's hash is kept as the earlier version");
  assert.equal(b.run.provenanceHistory.length, 0, "there were no decisions on the unlabeled text to archive");
  // preparation ran on the model's labels and said where they came from; the reading was made again on the labelled text
  assert.equal(b.attributionGate.status, "ready"); assert.match(b.attributionGate.method, /assigned by a model/);
  assert.equal(b.run.processing.status, "complete");
  assert.deepEqual(new Set(b.passages.map(p => p.analysis.asSaid[0].speaker)), new Set(["JOE ROGAN"]));
  for (const p of b.passages) assert.equal(p.readingGate.status, "ready");
  const exp = await s.api("GET", "/api/runs/" + id + "/export.json");
  assert.equal(exp.data.run.provenance.labelsOrigin, "model"); assert.equal(exp.data.run.provenance.assignment.named, 10);
  // a second request is refused: the text now has labels
  const again = await s.api("POST", "/api/runs/" + id + "/assign-speakers", { names: ["Someone"] });
  assert.equal(again.status, 409); assert.equal(again.data.code, "has_labels");
  // a client save of the run (title, names) does not drop the record
  await s.api("PUT", "/api/runs/" + id, { run: { title: "Renamed", provenance: { overrides: {}, flags: [] } } });
  b = await s.store.bundle(id); assert.equal(b.run.provenance.labelsOrigin, "model"); assert.ok(b.run.provenance.assignment);
});

test("a turn the review pass disagrees with becomes Speaker unknown, and bad input is refused before any call", async t => {
  const s = await fixture(t);
  const paras = PARAS.slice(0, 4).map((p, i) => i === 1 ? p + " MOCK-DISAGREE" : p);
  const made = await s.api("POST", "/api/intake", { input: paras.join("\n\n") });
  const id = made.data.run.id; await s.finish(id);
  for (const [body, re] of [[{ names: [] }, /at least one/], [{ names: ["A Very Long Name With Six Words"] }, /four words/], [{ names: ["Unknown"] }, /reserved/]]) {
    const r = await s.api("POST", "/api/runs/" + id + "/assign-speakers", body); assert.equal(r.status, 400); assert.match(r.data.error, re);
  }
  const r = await s.api("POST", "/api/runs/" + id + "/assign-speakers", { names: "Host; Guest" });
  assert.equal(r.status, 202);
  const b = await s.finish(id);
  const labels = shared.parseTranscript(b.transcript, { mode: b.run.parseMode }).map(x => x.label);
  assert.deepEqual(labels, ["HOST", "UNKNOWN", "HOST", "GUEST"]);
  assert.equal(b.run.provenance.assignment.demoted, 1); assert.equal(b.run.provenance.assignment.unknown, 1);
  assert.ok(b.run.speakers.some(x => x.key === "UNKNOWN" && x.name === "Speaker unknown"));
  // a typed claim has nothing to assign
  const claim = await s.api("POST", "/api/intake", { input: "Greening of the Earth is driven mostly by carbon dioxide." }); await s.finish(claim.data.run.id);
  const c = await s.api("POST", "/api/runs/" + claim.data.run.id + "/assign-speakers", { names: ["Host"] }); assert.equal(c.status, 400);
});

test("a bundle on the wire carries a summary of each card's earlier readings, not the readings; ?history=full and the history route carry them whole", async t => {
  const s = await fixture(t);
  const made = await s.api("POST", "/api/intake", { input: Array.from({ length: 6 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": An argument with enough words to quote, number " + i + ".").join("\n") });
  const id = made.data.run.id; let b = await s.finish(id);
  // a second reading of the same passage keeps the first in its history
  const p = b.passages[0];
  const again = await s.api("PUT", "/api/runs/" + id + "/passages/" + p.id, { title: p.title, turnStart: p.turnStart, turnEnd: p.turnEnd, status: "done", analyzedAt: "2026-10-03T12:00:00.000Z", analysis: Object.assign(JSON.parse(JSON.stringify(p.analysis)), { deflated: { hs: "second", g5: "second" } }) });
  assert.equal(again.status, 200);
  const trimmed = again.data.passages.find(x => x.id === p.id);
  assert.equal(trimmed.history, undefined); assert.equal(trimmed.historyCount, 1); assert.equal(trimmed.historySummary.length, 1); assert.equal(trimmed.historySummary[0].analyzedAt, p.analyzedAt); assert.equal(trimmed.historySummary[0].analysis, undefined);
  const full = (await s.api("GET", "/api/runs/" + id + "?history=full")).data.passages.find(x => x.id === p.id);
  assert.equal(full.history.length, 1); assert.equal(full.history[0].analysis.deflated.hs, p.analysis.deflated.hs); assert.equal(full.historyCount, undefined);
  const route = await s.api("GET", "/api/runs/" + id + "/passages/" + p.id + "/history");
  assert.equal(route.status, 200); assert.equal(route.data.history.length, 1); assert.equal(route.data.history[0].analysis.deflated.hs, p.analysis.deflated.hs);
  // the export still counts them, and the file on disk keeps them whole
  const exp = (await s.api("GET", "/api/runs/" + id + "/export.json")).data;
  assert.equal(exp.passages.find(x => x.id === p.id).earlierReadings, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.store.runDir(id), "passages", p.id + ".json"), "utf8")).history.length, 1);
});
