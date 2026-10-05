"use strict";
/* 0.14.1: a recording uploaded from this computer becomes a reading that says who said what, the same way a link does.
   The file is checked to be a recording by its first bytes, sent to Deepgram itself (or to the engine on this computer,
   which reads MP3 only), and its own tags and name are its listing. Nothing is kept of the file but its name, size and
   hash; nothing is sent anywhere a person did not choose. Synthetic files (test/fixtures/audio-files.js) and the invented
   show of the 0.14 tests; no real recording or transcript. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research");
const AF = require("../server/podcast/audiofile");
const A = require("./fixtures/audio-files");
const { SHOW, HOST, GUEST, EPISODE, SAID, KEY, APPLE_LINK, chainFetch, scriptedAI, server, nameOf, assertNamed } = require("./fixtures/straight-talk");
const { page, visible } = require("./page-harness");

/* A fake fetch that reads what is sent to Deepgram as it is sent (the file is gone once the job ends). */
function recordingFetch(said, extra) {
  const inner = chainFetch(said, extra), bodies = [];
  const f = async (url, opts) => { if (/api\.deepgram\.com/.test(String(url)) && opts && opts.body && typeof opts.body !== "string") bodies.push(Buffer.from(await new Response(opts.body).arrayBuffer())); return inner(url, opts); };
  f.calls = inner.calls; f.bodies = bodies; f.deepgram = () => inner.calls.filter(c => /api\.deepgram\.com/.test(c.url));
  return f;
}
async function upload(f, bytes, { name = "recording.mp3", type = "audio/mpeg", query = {} } = {}) {
  const q = new URLSearchParams(Object.assign({ name }, query)).toString();
  const res = await fetch(f.base + "/api/transcript/upload?" + q, { method: "POST", headers: type ? { "Content-Type": type } : {}, body: bytes });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch (e) { data = text; }
  return { status: res.status, data };
}
async function follow(f, started) {
  assert.equal(started.status, 200, JSON.stringify(started.data));
  let j; for (let i = 0; i < 400; i++) { j = (await f.api("GET", "/api/transcript/jobs/" + started.data.jobId)).data; if (j.state !== "running") break; await new Promise(r => setTimeout(r, 20)); }
  assert.equal(j.state, "done", JSON.stringify(j.error));
  const consumed = await f.api("POST", "/api/transcript/jobs/" + started.data.jobId + "/consume");
  assert.equal(consumed.status, 202, JSON.stringify(consumed.data));
  return { job: j, b: await f.finish(consumed.data.run.id) };
}
const leftovers = f => { const d = path.join(f.dir, "uploads"); return fs.existsSync(d) ? fs.readdirSync(d) : []; };
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
/* The engine on this computer, faked: installed, and recording what it was given. */
function fakeLocal(text) {
  const got = [];
  return { name: "local", model: "whisper-test", got, installed: () => true, modelCached: () => true, packages: {}, dir: "",
    async transcribe({ file }) { got.push(fs.readFileSync(file)); return { text: text || "So the survey covered four hundred households in three neighborhoods, which is a small sample for a city this size, and the report stretches it.", speakers: [], engine: "local", model: "whisper-test", durationSeconds: 60, note: "automatic transcription on this computer (Whisper test); no speaker labels; expect some misheard words and names" }; } };
}
const TAGGED = { title: EPISODE, artist: "The Straight Talk Network", album: SHOW, comment: "Tonight: trade, steel and what comes next." };

/* ---------- the file ---------- */
test("the file: its kind from its first bytes, and what its own tags say (ID3 2.2–2.4, MP4 item lists, WAV INFO); nothing else is a recording", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-af-")); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const read = async (bytes, name) => { const f = path.join(dir, name); fs.writeFileSync(f, bytes); const format = AF.sniff(bytes.subarray(0, 64)); return { format, tags: format ? await AF.tags(f, format) : null }; };
  assert.deepEqual(await read(A.mp3(TAGGED, { itunesComment: true }), "a.mp3"), { format: "mp3", tags: { title: EPISODE, artist: "The Straight Talk Network", album: SHOW, comment: "Tonight: trade, steel and what comes next." } }, "UTF-16 with byte-order marks; iTunes' numbers in a comment are not a comment");
  assert.deepEqual((await read(A.mp3({ title: "Ölstand für Dana", artist: "Ana Ferreira" }, { be: true }), "b.mp3")).tags, { title: "Ölstand für Dana", artist: "Ana Ferreira" }, "big-endian UTF-16");
  assert.deepEqual((await read(A.mp3({ title: "Ep. 12 — Dana Reyes", artist: "Ana Ferreira\u0000Transit Desk", album: "The Transit Desk", comment: "Ana talks with Dana Reyes." }, { ver: 4 }), "c.mp3")).tags, { title: "Ep. 12 — Dana Reyes", artist: "Ana Ferreira", album: "The Transit Desk", comment: "Ana talks with Dana Reyes." }, "2.4 in UTF-8; of several artists, the first");
  assert.deepEqual((await read(A.mp3({ title: "Café talk", artist: "José" }, { enc: 0 }), "d.mp3")).tags, { title: "Café talk", artist: "José" }, "Latin-1");
  assert.deepEqual((await read(A.mp3v22({ title: "Old style", artist: "Ann O'Malley", album: "Old Show" }), "e.mp3")).tags, { title: "Old style", artist: "Ann O'Malley", album: "Old Show" }, "2.2: three-letter frames");
  assert.deepEqual(await read(A.bareMp3(), "f.mp3"), { format: "mp3", tags: {} }, "an MP3 without a tag starts with a frame");
  assert.deepEqual(await read(A.m4a({ title: "Interview — Dana Reyes", artist: "Ana Ferreira", album: "The Transit Desk", description: "A conversation about the survey." }), "g.m4a"), { format: "mp4", tags: { title: "Interview — Dana Reyes", artist: "Ana Ferreira", album: "The Transit Desk", comment: "A conversation about the survey." } }, "moov after the audio");
  assert.deepEqual((await read(A.m4a({ title: "Moov first" }, { moovFirst: true }), "h.m4a")).tags, { title: "Moov first" });
  assert.deepEqual((await read(A.m4a({}), "i.m4a")).tags, {});
  assert.deepEqual(await read(A.wav({ title: "Field recording", artist: "Ana Ferreira", comment: "Recorded at the lab" }), "j.wav"), { format: "wav", tags: { title: "Field recording", artist: "Ana Ferreira", comment: "Recorded at the lab" } }, "the INFO list after the samples");
  for (const [make, format] of [[A.ogg, "ogg"], [A.flac, "flac"], [A.adts, "aac"], [A.webm, "webm"]]) assert.deepEqual(await read(make(), "k." + format), { format, tags: {} }, format + ": recognised, tags not read");
  assert.equal(AF.sniff(A.png()), null); assert.equal(AF.sniff(Buffer.from("WEBVTT\n\n00:00.000 --> 00:01.000\nHello")), null); assert.equal(AF.sniff(Buffer.from("%PDF-1.7 and more bytes here")), null); assert.equal(AF.sniff(Buffer.alloc(4)), null);
  // a tag that claims more than the file holds, or frames that make no sense, give no tags and no failure
  const broken = A.mp3(TAGGED); broken.writeUInt8(0x7f, 6); broken.writeUInt8(0x7f, 7);
  assert.equal((await read(broken.subarray(0, 40), "l.mp3")).format, "mp3"); assert.deepEqual((await read(broken.subarray(0, 40), "l.mp3")).tags, {});
  const junk = A.m4a({ title: "x" }); junk.writeUInt32BE(3, junk.length - 40);
  assert.equal(typeof (await read(junk, "m.m4a")).tags, "object");
  assert.equal(AF.titleFromName("Interview_with_Dana_Reyes.m4a"), "Interview with Dana Reyes"); assert.equal(AF.titleFromName("C:\\Users\\a\\ep 12.final.mp3"), "ep 12.final");
});

/* ---------- upload → Deepgram → named reading ---------- */
test("an uploaded episode with its tags: Deepgram transcribes the file itself, and the reading names host and guest everywhere from the conversation and the file's own tags", async t => {
  const ai = scriptedAI(), fetchFn = recordingFetch(SAID);
  const f = await server(t, { ai, fetch: fetchFn, env: { DEEPGRAM_API_KEY: KEY, TRANSCRIBE_PREFER: "cloud" } });
  const bytes = A.mp3(TAGGED);
  const started = await upload(f, bytes, { name: "straight-talk-live.mp3" });
  assert.deepEqual([started.data.engine, started.data.format], ["cloud", "mp3"]);
  const { job, b } = await follow(f, started);
  // the file itself went to Deepgram, with the key and its type, once; nothing else was fetched
  const dg = fetchFn.deepgram();
  assert.equal(dg.length, 1); assert.equal(dg[0].method, "POST"); assert.equal(dg[0].headers.Authorization, "Token " + KEY); assert.equal(dg[0].headers["Content-Type"], "audio/mpeg");
  assert.match(dg[0].url, /[?&]diarize=true/); assert.match(dg[0].url, /[?&]utterances=true/);
  assert.ok(fetchFn.bodies[0].equals(bytes), "the bytes Deepgram received are the file's");
  assert.equal(fetchFn.calls.length, 1, "no feed, no Apple, no page: a file has nothing to look up");
  assert.deepEqual(job.steps.map(s => s.name), ["Audio file", "Audio"]);
  assert.equal(job.steps[0].note, "straight-talk-live.mp3 (MP3, " + Math.round(bytes.length / 1024) + " KB); its tags: " + SHOW + " · The Straight Talk Network · " + EPISODE);
  // what the run keeps of the file: its name, size and hash; no link is invented for it
  assert.deepEqual(b.run.import.file, { name: "straight-talk-live.mp3", bytes: bytes.length, sha256: sha(bytes), format: "mp3" });
  assert.equal(b.run.sourceUrl, ""); assert.equal(b.run.import.url, "");
  assert.equal(b.run.title, EPISODE); assert.equal(b.run.sourceLabel, SHOW + " — " + EPISODE);
  assert.equal(b.run.import.source.kind, "audio-transcription"); assert.equal(b.run.import.source.engine, "deepgram"); assert.match(b.run.import.source.note, /; from the file you uploaded$/);
  assert.deepEqual([b.run.import.showInfo.origin, b.run.import.episodeInfo.origin, b.run.import.episodeInfo.titleFrom], ["file", "file", "tag"]);
  assert.equal(b.sourceIdentity.state, "direct");
  assert.deepEqual(leftovers(f), [], "the uploaded file is gone once it was turned into text");
  // the voices came from the recording; the advertisement was set apart
  const pr = b.run.provenance;
  assert.equal(pr.labelsOrigin, "voices"); assert.equal(pr.voices.via, "transcription"); assert.equal(pr.voices.audioFoundBy, "the file you uploaded (straight-talk-live.mp3), transcribed by Deepgram");
  assert.deepEqual(pr.structure.ads.map(a => a.key), ["AD 1"]);
  // who is who: the host from the file's album tag and his opening, the guest by introduction
  assert.equal(nameOf(b, "SPEAKER 2"), HOST); assert.equal(nameOf(b, "SPEAKER 3"), GUEST); assert.equal(nameOf(b, "SPEAKER 1"), "Speaker 1");
  const id = pr.identification;
  assert.equal(id.decisions.find(d => d.key === "SPEAKER 2").how, "the host as listed by the file's album tag; this voice opens the show: “Good evening and welcome to the Straight Talk Hour.”");
  assert.match(id.decisions.find(d => d.key === "SPEAKER 3").how, /^introduced by name just before speaking: “Joining us now from Washington, Marcus Delacroix, former trade adviser\.”.*the listing names Marcus Delacroix as guest \(the file's title tag\)$/);
  assert.deepEqual(id.candidates.map(c => [c.name, c.from]), [[HOST, ["the file's album tag"]], [GUEST, ["the file's title tag"]]], "an artist tag that is a company is no person");
  const prompt = ai.prompts.find(p => p.startsWith("Who is each voice in this conversation?"));
  assert.match(prompt, /LISTING \(an uploaded file: only its own tags and its name\)\nShow \(album tag\): Walt Brannigan’s Straight Talk Hour\nArtist tag: The Straight Talk Network\nEpisode title \(title tag\): We’ll Do It LIVE! — Marcus Delacroix\nComment tag: Tonight/);
  assert.ok(b.passages.length && b.passages.every(p => p.readingGate.status === "ready"));
  const md = (await f.api("GET", "/api/runs/" + b.run.id + "/export.md?level=hs")).data, ex = (await f.api("GET", "/api/runs/" + b.run.id + "/export.json")).data;
  assertNamed(b, md, ex, ["SPEAKER 2", "SPEAKER 3"], [HOST, GUEST]);
  assert.deepEqual(ex.run.import.file, b.run.import.file, "the export says which file it was");
  assert.ok(md.includes("Source: the recording straight-talk-live.mp3 (10 KB, SHA-256 " + sha(bytes) + "), uploaded and transcribed by Deepgram.\n"), md.slice(0, 400));
});

test("an untagged recording named after its guest: names from the words, the guest's whole name from the file's name", async t => {
  const said = [[0, "Hello and welcome. I'm Ana Ferreira, and this is the Transit Desk. My guest today studied the city's survey closely."], [0, "Dana, thanks for joining me."], [1, "Thanks for having me. My name is Dana, and I run the survey lab at the university."], [0, "So what did the survey actually cover?"], [1, "Four hundred households in three neighborhoods. That is a small sample for a city this size."], [0, "Right."], [1, "So when the report says riders everywhere support more lanes, it is stretching what those households can tell you."], [0, "The mayor's office says the results are clear."], [1, "They are clear for those three neighborhoods, not for the whole city, and nobody outside the office has seen the questionnaire."], [0, "Thank you, Dana."]];
  const fetchFn = recordingFetch(said), f = await server(t, { ai: scriptedAI(), fetch: fetchFn, env: { DEEPGRAM_API_KEY: KEY } });
  const { job, b } = await follow(f, await upload(f, A.m4a({}), { name: "Interview with Dana Reyes.m4a", type: "audio/x-m4a" }));
  assert.equal(fetchFn.deepgram()[0].headers["Content-Type"], "audio/x-m4a", "sent as the type it came with");
  assert.match(job.steps[0].note, /^Interview with Dana Reyes\.m4a \(M4A or MP4, 4 KB\); no tags$/);
  assert.equal(b.run.title, "Interview with Dana Reyes"); assert.equal(b.run.sourceLabel, "Interview with Dana Reyes.m4a"); assert.equal(b.run.import.episodeInfo.titleFrom, "name");
  assert.equal(nameOf(b, "SPEAKER 1"), "Ana Ferreira"); assert.equal(nameOf(b, "SPEAKER 2"), "Dana Reyes");
  const how = b.run.provenance.identification.decisions.find(d => d.key === "SPEAKER 2").how;
  assert.match(how, /^names itself: “My name is Dana, and I run the survey lab at the university\.”/); assert.match(how, /the listing names Dana Reyes as guest \(the file's name\)$/);
  const md = (await f.api("GET", "/api/runs/" + b.run.id + "/export.md?level=hs")).data, ex = (await f.api("GET", "/api/runs/" + b.run.id + "/export.json")).data;
  assertNamed(b, md, ex, ["SPEAKER 1", "SPEAKER 2"], ["Ana Ferreira", "Dana Reyes"]);
});

test("a recording that never names anyone keeps consistent numbers, says why in the file's terms, and is still read", async t => {
  const said = [[0, "Good evening. The steel numbers came out this morning, and they surprised a lot of people."], [1, "They show output up eleven percent since the tariffs took effect."], [0, "Right."], [1, "And prices rose four percent over the year, not double."], [0, "But the new jobs went to machines."], [1, "Some did, but the plants hired eight hundred workers last year."]];
  const f = await server(t, { ai: scriptedAI(), fetch: recordingFetch(said), env: { DEEPGRAM_API_KEY: KEY } });
  const { b } = await follow(f, await upload(f, A.bareMp3(), { name: "voice memo 14.mp3" }));
  assert.equal(nameOf(b, "SPEAKER 1"), "Speaker 1"); assert.equal(nameOf(b, "SPEAKER 2"), "Speaker 2");
  for (const u of b.run.provenance.identification.unnamed) assert.equal(u.why, "Nothing in the conversation or the file's name and tags names this voice.");
  assert.ok(b.passages.length && b.passages.every(p => p.readingGate.status === "ready"), "the reading is not held for want of names");
});

/* ---------- what is refused ---------- */
test("refused, with nothing kept and nothing sent: not a recording, an empty file, a text type, a file over the limit", async t => {
  const fetchFn = recordingFetch(SAID), f = await server(t, { fetch: fetchFn, env: { DEEPGRAM_API_KEY: KEY }, maxUploadBytes: 50000 });
  let r = await upload(f, A.mp3(TAGGED), { name: "song.mp3", type: "text/plain" });
  assert.deepEqual([r.status, r.data.code, r.data.error], [415, "not_audio", "Upload a recording (an audio or video file)."], "a type a page on another site could send without asking is refused before its bytes are looked at, even when they are a recording's");
  r = await upload(f, A.png(), { name: "cover.mp3", type: "audio/mpeg" });
  assert.deepEqual([r.status, r.data.code], [415, "not_audio"]); assert.match(r.data.error, /not a recording the app can read/);
  r = await upload(f, Buffer.alloc(0), { name: "empty.mp3" });
  assert.deepEqual([r.status, r.data.error], [415, "The file is empty."]);
  r = await upload(f, A.mp3(TAGGED, { frames: 200 }), { name: "long.mp3" });
  assert.deepEqual([r.status, r.data.code], [413, "too_large"]);
  // a file the browser declares too large is refused before its bytes are read: the answer comes while they are still awaited
  const early = await new Promise((resolve, reject) => {
    const rq = require("node:http").request(f.base + "/api/transcript/upload?name=big.mp3", { method: "POST", headers: { "Content-Type": "audio/mpeg", "Content-Length": 60000 } }, res => { let d = ""; res.on("data", c => { d += c; }); res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(d) })); });
    rq.on("error", reject); rq.write(A.mp3(TAGGED).subarray(0, 100)); setTimeout(() => { rq.destroy(); reject(new Error("no early answer: the server waited for the body")); }, 3000).unref();
  });
  assert.deepEqual([early.status, early.data.code], [413, "too_large"]);
  r = await upload(f, A.mp3(TAGGED), { name: "../../etc/passwd", type: "application/octet-stream" });
  assert.equal(r.status, 200, "application/octet-stream is a recording when its bytes say so; the name is only a name");
  let j; for (let i = 0; i < 200; i++) { j = (await f.api("GET", "/api/transcript/jobs/" + r.data.jobId)).data; if (j.state !== "running") break; await new Promise(res => setTimeout(res, 20)); }
  assert.equal(j.input.upload.name, "passwd"); assert.equal(j.input.upload.type, "audio/mpeg");
  assert.equal(fetchFn.deepgram().length, 1, "only the one real recording went to Deepgram");
  assert.deepEqual(leftovers(f), []);
});

test("the engine: never one the person did not choose; the engine on this computer reads MP3 only; audio set to stay here never goes to Deepgram", async t => {
  // no engine at all
  let f = await server(t, {});
  let r = await upload(f, A.mp3(TAGGED));
  assert.deepEqual([r.status, r.data.code, r.data.available], [409, "needs_engine", { local: false, cloud: false }]);
  assert.deepEqual(leftovers(f), []);
  // only this computer's engine, and a file it cannot read
  f = await server(t, { localEngine: fakeLocal() });
  r = await upload(f, A.m4a({}), { name: "talk.m4a", type: "audio/mp4" });
  assert.deepEqual([r.status, r.data.code, r.data.formatName], [409, "local_format", "M4A or MP4"]); assert.match(r.data.error, /reads MP3 files only, and this file is M4A or MP4/);
  // both engines, audio set to stay on this computer: an M4A is refused rather than sent away
  let fetchFn = recordingFetch(SAID);
  f = await server(t, { fetch: fetchFn, localEngine: fakeLocal(), env: { DEEPGRAM_API_KEY: KEY, TRANSCRIBE_PREFER: "local" } });
  r = await upload(f, A.m4a({}), { name: "talk.m4a", type: "audio/mp4" });
  assert.deepEqual([r.status, r.data.code], [409, "local_format"]);
  r = await upload(f, A.m4a({}), { name: "talk.m4a", type: "audio/mp4", query: { choice: "local" } });
  assert.deepEqual([r.status, r.data.code], [409, "local_format"], "asking for this computer's engine for an M4A does not send it elsewhere either");
  assert.equal(fetchFn.deepgram().length, 0);
  // audio set to stay on this computer and no local engine installed: an MP3 is not sent to Deepgram either
  fetchFn = recordingFetch(SAID);
  f = await server(t, { fetch: fetchFn, env: { DEEPGRAM_API_KEY: KEY, TRANSCRIBE_PREFER: "local" } });
  r = await upload(f, A.mp3(TAGGED));
  assert.deepEqual([r.status, r.data.code], [409, "needs_engine"]);
  // … nor is a podcast's audio found from a link (before 0.14.1 a missing local engine fell through to Deepgram)
  const started = await f.api("POST", "/api/transcript/resolve", { url: APPLE_LINK });
  let j; for (let i = 0; i < 300; i++) { j = (await f.api("GET", "/api/transcript/jobs/" + started.data.jobId)).data; if (j.state !== "running") break; await new Promise(res => setTimeout(res, 20)); }
  assert.equal(j.state, "done"); assert.equal(j.result.kind, "none"); assert.ok(j.result.needsTranscription, "the person is asked");
  assert.equal(fetchFn.deepgram().length, 0, "nothing went to Deepgram");
  // the person chooses Deepgram for this file: then it goes
  r = await upload(f, A.mp3(TAGGED), { query: { choice: "cloud" } });
  assert.deepEqual([r.status, r.data.engine], [200, "cloud"]);
});

test("transcription on this computer: an uploaded MP3 goes to the local engine and nowhere else; the speakers are then worked out from the words", async t => {
  const local = fakeLocal(), fetchFn = recordingFetch(SAID);
  const f = await server(t, { fetch: fetchFn, localEngine: local, env: { DEEPGRAM_API_KEY: KEY } });
  const bytes = A.mp3({ title: "Survey talk" });
  const { b } = await follow(f, await upload(f, bytes, { name: "survey.mp3", query: { choice: "local" } }));
  assert.equal(local.got.length, 1); assert.ok(local.got[0].equals(bytes), "the local engine read the uploaded file");
  assert.equal(fetchFn.deepgram().length, 0, "nothing went to Deepgram");
  assert.equal(b.run.import.source.engine, "local"); assert.equal(b.run.provenance.voices, undefined, "no voices: the engine on this computer does not separate them");
  assert.equal(b.run.title, "Survey talk"); assert.deepEqual(leftovers(f), []);
  const md = (await f.api("GET", "/api/runs/" + b.run.id + "/export.md?level=hs")).data;
  assert.match(md, /^Source: the recording survey\.mp3 \(\d+ KB, SHA-256 [0-9a-f]{64}\), uploaded and transcribed on the person's computer\.$/m);
});

test("stopping a transcription lets the file go; a file left by a server that stopped mid-job is gone at the next start", async t => {
  let release; const gate = new Promise(r => { release = r; });
  const fetchFn = async (url, opts) => { if (/api\.deepgram\.com/.test(String(url))) { await new Promise((res, rej) => { opts.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))); gate.then(res); }); } return { status: 404, url: String(url), headers: { get: () => null }, text: async () => "" }; };
  const f = await server(t, { fetch: fetchFn, env: { DEEPGRAM_API_KEY: KEY } });
  const r = await upload(f, A.mp3(TAGGED));
  for (let i = 0; i < 100 && !leftovers(f).length; i++) await new Promise(res => setTimeout(res, 10));
  assert.equal(leftovers(f).length, 1, "the file is kept while it is being transcribed");
  const eng = (await f.api("GET", "/api/transcript/engines")).data;
  assert.deepEqual(eng.running.map(x => x.upload), [{ name: "recording.mp3", bytes: A.mp3(TAGGED).length }], "a page opened meanwhile can pick the transcription up");
  assert.equal((await f.api("POST", "/api/transcript/jobs/" + r.data.jobId + "/cancel")).data.ok, true);
  let j; for (let i = 0; i < 200; i++) { j = (await f.api("GET", "/api/transcript/jobs/" + r.data.jobId)).data; if (j.state !== "running") break; await new Promise(res => setTimeout(res, 10)); }
  assert.equal(j.state, "cancelled"); assert.deepEqual(leftovers(f), []); release();
  // a server stopped mid-job leaves its file; the next start removes it
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-up-")); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "uploads", "upleft1"), { recursive: true }); fs.writeFileSync(path.join(dir, "uploads", "upleft1", "recording"), A.mp3(TAGGED));
  const app = createApp({ dataDir: dir, examplesDir: dir, envPath: path.join(dir, ".env"), ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }) });
  await app.ready;
  assert.equal(fs.existsSync(path.join(dir, "uploads")), false);
});

/* ---------- the page ---------- */
test("the page: choose a recording, press Read this, and the reading says who said what; nothing else is asked", async t => {
  const fetchFn = recordingFetch(SAID);
  const f = await page(t, { ai: scriptedAI(), serverFetch: fetchFn, env: { DEEPGRAM_API_KEY: KEY, TRANSCRIBE_PREFER: "cloud" } });
  assert.equal(f.$("uploadBtn").textContent, "Upload"); assert.match(f.$("f-file").getAttribute("accept"), /audio\/\*.*\.m4a/);
  const bytes = A.mp3(TAGGED), file = f.$("f-file");
  file.files = [new File([bytes], "straight-talk-live.mp3", { type: "audio/mpeg" })]; await file.listeners.change();
  assert.equal(f.$("f-kind").textContent, "A recording: straight-talk-live.mp3 (10 KB). Read this turns it into text, finds who is speaking, then reads it.");
  const going = f.$("readThis").click();
  const done = () => { const s = f.ctx.page.S; return s.b && s.b.run && s.b.run.processing && ["complete", "partial"].includes(s.b.run.processing.status) && s.b.passages.length && s.b.passages.every(p => p.readingGate && p.readingGate.status === "ready"); };
  await f.pump(done, 600); await going; await f.settle();
  assert.ok(done(), "the reading finished: " + JSON.stringify(f.ctx.page.S.b && f.ctx.page.S.b.run.processing));
  assert.deepEqual(f.errors, []);
  assert.equal(f.requests.filter(x => x[0].startsWith("/api/transcript/upload?") && x[1] === "POST").length, 1);
  assert.ok(fetchFn.bodies[0].equals(bytes), "the page sent the file as it is");
  const view = visible(f.$("runView"));
  assert.equal(visible(f.$("speakerNotice")), "Speakers separated by voice. Details");
  assert.doesNotMatch(view, /Name them|Speaker 2|Speaker 3/);
  const cards = f.body.querySelectorAll(".card");
  assert.ok(cards.some(c => /Walt Brannigan/.test(visible(c.querySelector(".attrib")))) && cards.some(c => /Marcus Delacroix/.test(visible(c.querySelector(".attrib")))));
  assert.match(visible(f.$("runView")), /Your recording transcribed by Deepgram/);
  f.$("controlsBtn").click();
  assert.match(visible(f.$("ctl-source")), /Your recording transcribed by Deepgram, from the file straight-talk-live\.mp3 \(SHA-256 [0-9a-f]{12}…\)\.\s*The file you uploaded; nothing to confirm\./);
  assert.match(visible(f.$("ctl-speakers")), /Separated by voice by Deepgram as it transcribed the recording: 3 voices\. 1 advertisement was set apart\./);
  assert.match(visible(f.$("ctl-speakers")), /Optional\. The app finds names from the conversation and the file's name and tags/);
});

test("the page: a recording this computer's engine cannot read, with no Deepgram key, is offered Deepgram first; nothing is sent until the person chooses", async t => {
  const f = await page(t, { localEngine: fakeLocal() });
  const file = f.$("f-file");
  file.files = [new File([A.m4a({})], "talk.m4a", { type: "audio/mp4" })]; await file.listeners.change();
  await f.$("readThis").click(); await f.settle();
  const msg = visible(f.$("intake-msg"));
  assert.match(msg, /The recording \(4 KB\) can be transcribed\. Choose once/);
  assert.match(msg, /This is not an MP3 file, and transcription on this computer reads MP3 only\./);
  assert.doesNotMatch(msg, /Transcribe on this computer|Install local transcription/, "this computer's engine is not offered for a file it cannot read");
  assert.match(msg, /Save key and transcribe with Deepgram/);
  assert.equal(f.requests.filter(x => x[0].startsWith("/api/transcript/upload")).length, 0, "the file was not sent to be refused");
  // typing in the box lets the recording go: the box is what will be read
  const ta = f.$("f-text"); ta.value = "SPEAKER 1: Hello."; ta.listeners.input();
  assert.equal(f.$("f-kind").textContent, "Paste text or a link, or upload a transcript or a recording.");
  // a file named .mp3 that is not one: the server reads its first bytes and says so; this computer's engine is then not offered
  ta.value = ""; ta.listeners.input();
  file.files = [new File([A.m4a({})], "renamed.mp3", { type: "audio/mpeg" })]; await file.listeners.change();
  await f.$("readThis").click(); await f.settle();
  const again = visible(f.$("intake-msg"));
  assert.equal(f.requests.filter(x => x[0].startsWith("/api/transcript/upload")).length, 1, "sent once, refused by its bytes");
  assert.match(again, /reads MP3 files only, and this file is M4A or MP4/);
  assert.doesNotMatch(again, /Transcribe on this computer/);
  assert.deepEqual(leftovers({ dir: f.system.store.dataDir }), []);
});
