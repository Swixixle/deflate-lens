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
    async transcribe({ file }) { got.push(fs.readFileSync(file)); return { text: text === undefined ? "So the survey covered four hundred households in three neighborhoods, which is a small sample for a city this size, and the report stretches it." : text, speakers: [], engine: "local", model: "whisper-test", durationSeconds: 60, note: "automatic transcription on this computer (Whisper test); no speaker labels; expect some misheard words and names" }; } };
}
const TAGGED = { title: EPISODE, artist: "The Straight Talk Network", album: SHOW, comment: "Tonight: trade, steel and what comes next." };

/* ---------- the file ---------- */
test("the file: its kind from its first bytes, and what its own tags say (ID3 2.2–2.4, MP4 item lists, WAV INFO); nothing else is a recording", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-af-")); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const read = async (bytes, name) => { const f = path.join(dir, name); fs.writeFileSync(f, bytes); const format = await AF.sniffFile(f); return { format, tags: format ? await AF.tags(f, format) : null }; };
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
  // a tag that claims more than the file holds is a tag with nothing after it: no recording, and no failure
  const broken = A.mp3(TAGGED); broken.writeUInt8(0x7f, 6); broken.writeUInt8(0x7f, 7);
  assert.equal((await read(broken.subarray(0, 40), "l.mp3")).format, null); assert.deepEqual(await AF.tags(path.join(dir, "l.mp3"), "mp3"), {});
  // what is not a recording, though it starts like one: UTF-16 text (its byte-order mark looks like a frame), headers with a
  // bad bitrate or a reserved sample rate, a three-byte "ID3" file, an ID3 tag with nothing recognisable after it, a still image
  // in an ISO box (HEIC, AVIF)
  const utf16 = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from("SPEAKER 1: Hello there, this is a plain transcript written out by hand.\n".repeat(20), "utf16le")]);
  assert.equal((await read(utf16, "n.txt")).format, null);
  assert.equal(AF.sniff(Buffer.concat([Buffer.from([0xFF, 0xFB, 0xF0, 0x00]), Buffer.alloc(900)])), null, "bitrate index 15");
  assert.equal(AF.sniff(Buffer.concat([Buffer.from([0xFF, 0xFB, 0x9C, 0x00]), Buffer.alloc(900)])), null, "sample-rate index 3");
  assert.equal((await read(Buffer.from("ID3"), "o.mp3")).format, null); assert.equal((await read(Buffer.from("OggS"), "o.ogg")).format, null);
  assert.equal((await read(Buffer.concat([A.mp3(TAGGED).subarray(0, 10 + 300), Buffer.from("not audio at all, just words ".repeat(40))]), "p.mp3")).format, null);
  const box = brand => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftyp" + brand, "latin1"), Buffer.alloc(200)]);
  assert.equal(AF.sniff(box("heic")), null); assert.equal(AF.sniff(box("avif")), null); assert.equal(AF.sniff(box("M4A ")), "mp4");
  // an ID3 tag in front of AAC or FLAC audio does not make it an MP3 (the engine on this computer reads MP3 only)
  const tagOnly = A.mp3(TAGGED).subarray(0, A.mp3(TAGGED).length - 24 * 417);
  assert.equal((await read(Buffer.concat([tagOnly, A.adts()]), "q.aac")).format, "aac");
  assert.equal((await read(Buffer.concat([tagOnly, A.flac()]), "q.flac")).format, "flac");
  assert.equal((await read(Buffer.concat([tagOnly, Buffer.alloc(300), A.bareMp3()]), "q.mp3")).format, "mp3", "padding after the tag, then frames");
  // tags as some writers really write them: a 2.4 tag unsynchronised only by its header's flag, 2.4 frames with plain
  // (not syncsafe) sizes as older iTunes wrote them, WAV INFO in Latin-1
  const ss = n => Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]), u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const tag24 = (flags, body) => Buffer.concat([Buffer.from("ID3", "latin1"), Buffer.from([4, 0, flags]), ss(body.length), body, A.bareMp3()]);
  const title16 = Buffer.concat([Buffer.from([1, 0xFF, 0xFE]), Buffer.from("Ÿ Dana Reyes on ÿ the survey", "utf16le")]); // UTF-16 holds 0xFF bytes that unsynchronisation escapes
  const escaped = (() => { const out = []; for (let i = 0; i < title16.length; i++) { out.push(title16[i]); if (title16[i] === 0xFF && (i + 1 === title16.length || title16[i + 1] === 0 || (title16[i + 1] & 0xE0) === 0xE0)) out.push(0); } return Buffer.from(out); })();
  assert.equal((await read(tag24(0x80, Buffer.concat([Buffer.from("TIT2"), ss(escaped.length), Buffer.from([0, 0]), escaped, Buffer.alloc(16)])), "r.mp3")).tags.title, "Ÿ Dana Reyes on ÿ the survey");
  const longComm = Buffer.concat([Buffer.from([0]), Buffer.from("eng", "latin1"), Buffer.from([0]), Buffer.from("A long description of the episode, ".repeat(6), "latin1")]); // over 127 bytes: its plain size is not syncsafe-shaped
  const plainFrame = (id, data) => Buffer.concat([Buffer.from(id, "latin1"), u32(data.length), Buffer.from([0, 0]), data]);
  const t6 = await read(tag24(0, Buffer.concat([plainFrame("COMM", longComm), plainFrame("TIT2", Buffer.concat([Buffer.from([0]), Buffer.from("Title after a long comment", "latin1")])), Buffer.alloc(16)])), "s.mp3");
  assert.equal(t6.tags.title, "Title after a long comment"); assert.match(t6.tags.comment, /^A long description of the episode,/);
  const wavLatin = Buffer.concat([Buffer.from("RIFF", "latin1"), Buffer.alloc(4), Buffer.from("WAVE", "latin1"), Buffer.from("LIST", "latin1"), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(4 + 8 + 12); return b; })(), Buffer.from("INFO", "latin1"), Buffer.from("IART", "latin1"), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(12); return b; })(), Buffer.from("José Núñez\0\0", "latin1")]);
  assert.equal((await read(wavLatin, "t.wav")).tags.artist, "José Núñez");
  // a 16 MB unsynchronised tag is read without the server stalling or growing by hundreds of megabytes
  const big = Buffer.concat([Buffer.from("ID3", "latin1"), Buffer.from([3, 0, 0x80]), ss(16 * 1024 * 1024), Buffer.alloc(16 * 1024 * 1024, 0x41)]);
  fs.writeFileSync(path.join(dir, "u.mp3"), big);
  const t0 = Date.now(); await AF.tags(path.join(dir, "u.mp3"), "mp3"); assert.ok(Date.now() - t0 < 1500, "took " + (Date.now() - t0) + " ms");
  // undoing unsynchronisation works on bytes, not on a JavaScript array of them (which grows the heap by about 600 MB here)
  const escapedBig = Buffer.alloc(16 * 1024 * 1024, 0x41); for (let i = 0; i < escapedBig.length; i += 1000) { escapedBig[i] = 0xFF; escapedBig[i + 1] = 0; }
  const heap0 = process.memoryUsage().heapUsed, undone = AF.unsync(escapedBig), heapGrew = process.memoryUsage().heapUsed - heap0;
  assert.equal(undone.length, escapedBig.length - Math.ceil(escapedBig.length / 1000)); assert.ok(heapGrew < 64 * 1048576, "the heap grew by " + Math.round(heapGrew / 1048576) + " MB");
  // a box that claims far more than the file holds allocates no more than the file
  const claims = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from("ftypM4A mp42isom", "latin1"), Buffer.from([0x03, 0xFF, 0xFF, 0xFF]), Buffer.from("moov", "latin1"), Buffer.alloc(100)]);
  fs.writeFileSync(path.join(dir, "v.m4a"), claims); const ab1 = process.memoryUsage().arrayBuffers;
  assert.deepEqual(await AF.tags(path.join(dir, "v.m4a"), "mp4"), {}); assert.ok(process.memoryUsage().arrayBuffers - ab1 < 8 * 1048576, "allocated " + Math.round((process.memoryUsage().arrayBuffers - ab1) / 1048576) + " MB for a 136-byte file");
  // and the same reading on bytes in memory (stacked or in-buffer tags take this path)
  assert.equal(AF.sniff(Buffer.concat([tagOnly, A.adts()])), "aac"); assert.equal(AF.sniff(Buffer.concat([tagOnly, A.bareMp3()])), "mp3");
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
  // the job that was transcribing it, as the stopped server left it on disk
  fs.mkdirSync(path.join(dir, "jobs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "jobs", "jobleft1.json"), JSON.stringify({ id: "jobleft1", kind: "resolve", state: "running", startedAt: new Date().toISOString(), input: { url: "", upload: { id: "upleft1", name: "left.mp3", bytes: 10 } }, steps: [], acknowledgedAt: null }));
  const app = createApp({ dataDir: dir, examplesDir: dir, envPath: path.join(dir, ".env"), ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }) });
  await app.ready;
  assert.equal(fs.existsSync(path.join(dir, "uploads")), false);
  const left = await app.jobs.get("jobleft1");
  assert.deepEqual([left.state, left.error.message], ["interrupted", "The server stopped before the recording was turned into text. Upload it again."], "not \"Start the link again\"");
});

/* ---------- found by an independent review of 0.14.1 ---------- */
const http = require("node:http");
/* A request written by hand: no Content-Length (chunked), a stall, or a client that goes away. */
function rawUpload(f, { name = "recording.mp3", chunks = [], end = true, abortAfter = null, headers = {} }) {
  return new Promise(resolve => {
    const rq = http.request(f.base + "/api/transcript/upload?name=" + encodeURIComponent(name), { method: "POST", headers: Object.assign({ "Content-Type": "audio/mpeg", "Transfer-Encoding": "chunked" }, headers) }, res => { let d = ""; res.on("data", c => { d += c; }); res.on("end", () => { let data = d; try { data = JSON.parse(d); } catch (e) {} resolve({ status: res.statusCode, data }); }); });
    rq.on("error", e => resolve({ error: e.code || e.message }));
    // no answer within five seconds is an answer too (and the request is let go, so the test cannot hang)
    setTimeout(() => { rq.destroy(); resolve({ noAnswer: true }); }, 5000).unref();
    (async () => { for (const c of chunks) { rq.write(c); await new Promise(r => setTimeout(r, 5)); } if (abortAfter !== null) { await new Promise(r => setTimeout(r, abortAfter)); rq.destroy(); resolve({ aborted: true }); return; } if (end) rq.end(); })();
  });
}
const settleUploads = async f => { for (let i = 0; i < 100 && leftovers(f).length; i++) await new Promise(r => setTimeout(r, 20)); return leftovers(f); };

test("the size limit holds while a file arrives, a client that goes away or stalls leaves nothing, and a few uploads run at once at most", async t => {
  const fetchFn = recordingFetch(SAID);
  const f = await server(t, { fetch: fetchFn, env: { DEEPGRAM_API_KEY: KEY }, maxUploadBytes: 50000, uploadIdleMs: 300 });
  const body = A.mp3(TAGGED, { frames: 200 }), pieces = []; for (let o = 0; o < body.length; o += 8000) pieces.push(body.subarray(o, o + 8000));
  // no Content-Length: the stream itself is cut at the limit
  const over = await rawUpload(f, { chunks: pieces });
  assert.deepEqual([over.status, over.data && over.data.code], [413, "too_large"], JSON.stringify(over));
  assert.deepEqual(await settleUploads(f), []);
  // the browser closes the tab mid-upload
  assert.deepEqual(await rawUpload(f, { chunks: pieces.slice(0, 2), abortAfter: 30 }), { aborted: true });
  assert.deepEqual(await settleUploads(f), [], "the half-written file is removed");
  // a transfer that stops sending is given up after the idle limit
  const stalled = await rawUpload(f, { chunks: pieces.slice(0, 2), end: false });
  assert.ok(stalled.error || stalled.status >= 400, JSON.stringify(stalled));
  assert.deepEqual(await settleUploads(f), []);
  assert.equal(fetchFn.deepgram().length, 0, "nothing was sent anywhere");
});

test("at most three uploads are transcribed at once; the fourth is asked to wait, before its bytes are read", async t => {
  let release; const gate = new Promise(r => { release = r; });
  const fetchFn = async (url, opts) => { if (/api\.deepgram\.com/.test(String(url))) await gate; return chainFetch(SAID)(url, opts); };
  const f = await server(t, { fetch: fetchFn, env: { DEEPGRAM_API_KEY: KEY } });
  const started = []; for (let i = 0; i < 3; i++) started.push(await upload(f, A.mp3(TAGGED), { name: "take-" + i + ".mp3" }));
  assert.deepEqual(started.map(r => r.status), [200, 200, 200]);
  const fourth = await upload(f, A.mp3(TAGGED), { name: "take-3.mp3" });
  assert.deepEqual([fourth.status, fourth.data.code], [429, "busy"]);
  assert.equal(leftovers(f).length, 3, "only the three being transcribed are on disk");
  release();
  for (const r of started) { let j; for (let i = 0; i < 300; i++) { j = (await f.api("GET", "/api/transcript/jobs/" + r.data.jobId)).data; if (j.state !== "running") break; await new Promise(res => setTimeout(res, 20)); } assert.equal(j.state, "done"); }
  assert.deepEqual(await settleUploads(f), []);
  // uploads still arriving count too: with room for one, a second is asked to wait while the first is on its way
  const g = await server(t, { fetch: chainFetch(SAID), env: { DEEPGRAM_API_KEY: KEY }, maxUploadsAtOnce: 1 });
  const body = A.mp3(TAGGED);
  let finishFirst; const first = new Promise(resolve => {
    const rq = http.request(g.base + "/api/transcript/upload?name=first.mp3", { method: "POST", headers: { "Content-Type": "audio/mpeg", "Content-Length": body.length } }, res => { let d = ""; res.on("data", c => { d += c; }); res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(d) })); });
    rq.write(body.subarray(0, 1000)); finishFirst = () => rq.end(body.subarray(1000));
  });
  for (let i = 0; i < 100 && !leftovers(g).length; i++) await new Promise(r => setTimeout(r, 10));
  const second = await upload(g, A.mp3(TAGGED), { name: "second.mp3" });
  assert.deepEqual([second.status, second.data.code], [429, "busy"]);
  finishFirst(); const one = await first; assert.equal(one.status, 200);
  let j; for (let i = 0; i < 300; i++) { j = (await g.api("GET", "/api/transcript/jobs/" + one.data.jobId)).data; if (j.state !== "running") break; await new Promise(res => setTimeout(res, 20)); }
  assert.equal(j.state, "done"); assert.deepEqual(await settleUploads(g), []);
});

test("an explicit choice of an engine that is not there is refused; a date the run could not keep is refused before anything is read", async t => {
  const fetchFn = recordingFetch(SAID);
  let f = await server(t, { fetch: fetchFn, env: { DEEPGRAM_API_KEY: KEY } });
  let r = await upload(f, A.mp3(TAGGED), { query: { choice: "local" } });
  assert.deepEqual([r.status, r.data.code, r.data.error], [409, "needs_engine", "Transcription on this computer is not installed."]);
  r = await upload(f, A.mp3(TAGGED), { query: { sourceDate: "last Tuesday" } });
  assert.deepEqual([r.status, r.data.error], [400, "The date must be written YYYY-MM-DD."]);
  assert.equal(fetchFn.deepgram().length, 0); assert.deepEqual(leftovers(f), []);
  f = await server(t, { localEngine: fakeLocal() });
  r = await upload(f, A.mp3(TAGGED), { query: { choice: "cloud" } });
  assert.deepEqual([r.status, r.data.code, r.data.error], [409, "needs_engine", "No Deepgram key is set."]);
});

test("what was said under Add context is kept: the title, label, date and the link the recording came from", async t => {
  const f = await server(t, { ai: scriptedAI(), fetch: recordingFetch(SAID), env: { DEEPGRAM_API_KEY: KEY } });
  const { b } = await follow(f, await upload(f, A.mp3({ title: "Ep 9" }), { name: "ep9.mp3", query: { sourceUrl: "https://transit.test/ep9", sourceLabel: "The Transit Desk", sourceDate: "2026-09-30", title: "Ep 9: the survey" } }));
  assert.deepEqual([b.run.title, b.run.sourceUrl, b.run.sourceLabel, b.run.sourceDate, b.run.import.url, b.run.import.file.name], ["Ep 9: the survey", "https://transit.test/ep9", "The Transit Desk", "2026-09-30", "", "ep9.mp3"]);
  const md = (await f.api("GET", "/api/runs/" + b.run.id + "/export.md?level=hs")).data;
  assert.match(md, /^Source: The Transit Desk https:\/\/transit\.test\/ep9\n\nRecording: ep9\.mp3 \(\d+ KB, SHA-256 [0-9a-f]{64}\), uploaded and transcribed by Deepgram\.$/m);
});

test("audio turned into no words is a failure to say, never a transcript left waiting; a short transcription is a transcript, not a claim", async t => {
  let f = await server(t, { localEngine: fakeLocal("   ") });
  let r = await upload(f, A.mp3({ title: "Silent" }), { name: "silent.mp3" });
  let j; for (let i = 0; i < 200; i++) { j = (await f.api("GET", "/api/transcript/jobs/" + r.data.jobId)).data; if (j.state !== "running") break; await new Promise(res => setTimeout(res, 20)); }
  assert.equal(j.state, "error"); assert.equal(j.error.code, "no_words"); assert.match(j.error.message, /^The recording was turned into no words \(the engine on this computer heard no speech in it\)/);
  assert.deepEqual((await f.system ? [] : []), []);
  assert.deepEqual((await f.jobs.pending("resolve")).filter(x => x.state === "done"), [], "nothing is left for a page to import");
  assert.deepEqual(leftovers(f), []);
  // a voice memo of one sentence, transcribed on this computer
  f = await server(t, { localEngine: fakeLocal("So the survey covered four hundred households in three neighborhoods.") });
  const { b } = await follow(f, await upload(f, A.mp3({ title: "Memo" }), { name: "memo.mp3" }));
  assert.equal(b.run.kind, "transcript");
  const md = (await f.api("GET", "/api/runs/" + b.run.id + "/export.md?level=hs")).data;
  assert.doesNotMatch(md, /A claim supplied by a person/);
});

test("Stop while Deepgram is working: the request is aborted, and the file is let go", async t => {
  let called = false, sawAbort = false; let release; const gate = new Promise(r => { release = r; });
  const fetchFn = async (url, opts) => { if (/api\.deepgram\.com/.test(String(url))) { called = true; await new Promise((res, rej) => { opts.signal.addEventListener("abort", () => { sawAbort = true; rej(Object.assign(new Error("aborted"), { name: "AbortError" })); }); gate.then(res); }); } return chainFetch(SAID)(url, opts); };
  const f = await server(t, { fetch: fetchFn, env: { DEEPGRAM_API_KEY: KEY } });
  const r = await upload(f, A.mp3(TAGGED));
  for (let i = 0; i < 300 && !called; i++) await new Promise(res => setTimeout(res, 5));
  assert.ok(called, "the request is in flight"); assert.equal(leftovers(f).length, 1);
  await f.api("POST", "/api/transcript/jobs/" + r.data.jobId + "/cancel");
  let j; for (let i = 0; i < 200; i++) { j = (await f.api("GET", "/api/transcript/jobs/" + r.data.jobId)).data; if (j.state !== "running") break; await new Promise(res => setTimeout(res, 10)); }
  assert.equal(j.state, "cancelled"); assert.ok(sawAbort, "Deepgram's request saw the abort"); assert.deepEqual(leftovers(f), []);
  release();
});

test("transcription on this computer runs one at a time; a waiting one says so and can be stopped", async () => {
  const { oneAtATime } = require("../server/podcast/engines");
  const order = [], gates = [], stages = [];
  const run = oneAtATime(async ({ n }) => { order.push("start " + n); await new Promise(r => gates.push(r)); order.push("end " + n); return n; });
  const one = run({ n: 1 }), two = run({ n: 2, onProgress: p => stages.push(p.stage) });
  const ctl = new AbortController(), three = run({ n: 3, signal: ctl.signal });
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(order, ["start 1"], "the second waits for the first"); assert.deepEqual(stages, ["waiting"]);
  ctl.abort(); await assert.rejects(three, e => e.code === "cancelled", "a waiting one stops at once");
  gates.shift()(); assert.equal(await one, 1);
  await new Promise(r => setTimeout(r, 10)); assert.deepEqual(order, ["start 1", "end 1", "start 2"]);
  gates.shift()(); assert.equal(await two, 2);
  // a failure does not block the next one
  const failing = oneAtATime(async ({ fail }) => { if (fail) throw new Error("no"); return "ok"; });
  await assert.rejects(failing({ fail: true })); assert.equal(await failing({}), "ok");
});

test("a server bound to this computer answers only requests addressed to it by this computer's names", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-host-")); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const app = createApp({ dataDir: dir, examplesDir: dir, envPath: path.join(dir, ".env"), ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), allowedHosts: ["127.0.0.1", "localhost", "::1"] });
  await app.ready;
  const srv = await new Promise(r => { const s = app.app.listen(0, "127.0.0.1", () => r(s)); }); t.after(() => new Promise(r => srv.close(r)));
  const ask = host => new Promise(resolve => { http.get({ host: "127.0.0.1", port: srv.address().port, path: "/api/health", headers: { Host: host } }, res => { res.resume(); res.on("end", () => resolve(res.statusCode)); }); });
  assert.equal(await ask("127.0.0.1:" + srv.address().port), 200); assert.equal(await ask("localhost:" + srv.address().port), 200); assert.equal(await ask("[::1]:" + srv.address().port), 200);
  assert.equal(await ask("attacker.example:" + srv.address().port), 403, "a name rebound to this computer by another site");
  assert.equal(await ask("attacker.example"), 403);
});

test("on a Node without file streaming, a file is read whole only up to 1 GB, and a larger one is refused with what to do", async t => {
  const { deepgramEngine } = require("../server/podcast/engines");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-node18-")); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const had = fs.openAsBlob; fs.openAsBlob = undefined; t.after(() => { fs.openAsBlob = had; });
  const sent = []; const fetchFn = async (url, opts) => { sent.push(opts.body); return { status: 200, text: async () => JSON.stringify({ metadata: { request_id: "r", duration: 1, models: ["nova-3"] }, results: { utterances: [{ speaker: 0, transcript: "Hello there." }] } }) }; };
  const engine = deepgramEngine({ apiKey: KEY, fetch: fetchFn, env: {} });
  const small = path.join(dir, "small.mp3"); fs.writeFileSync(small, A.mp3(TAGGED));
  await engine.transcribe({ file: small, type: "audio/mpeg" });
  assert.ok(Buffer.isBuffer(sent[0]) && sent[0].equals(A.mp3(TAGGED)), "read whole and sent");
  const large = path.join(dir, "large.mp3"); fs.writeFileSync(large, ""); fs.truncateSync(large, 1100 * 1024 * 1024); // sparse: nothing is written
  await assert.rejects(engine.transcribe({ file: large, type: "audio/mpeg" }), /This version of Node\.js cannot send a file this large to Deepgram\. Install Node 20 or newer/);
  assert.equal(sent.length, 1, "nothing was sent for the large file");
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

const uploadsSent = f => f.requests.filter(x => x[0].startsWith("/api/transcript/upload"));
test("the page: the file's own bytes decide what this computer's engine can read; an M4A is refused for it once and offered Deepgram, a file named .m4a that is an MP3 is transcribed here", async t => {
  const local = fakeLocal(), f = await page(t, { localEngine: local });
  const file = f.$("f-file");
  file.files = [new File([A.m4a({})], "talk.m4a", { type: "audio/mp4" })]; await file.listeners.change();
  await f.$("readThis").click(); await f.settle();
  const msg = visible(f.$("intake-msg"));
  assert.equal(uploadsSent(f).length, 1, "sent once, to be read");
  assert.match(msg, /Transcription on this computer reads MP3 files only, and this file is M4A or MP4\. Use Deepgram for it, or convert it to MP3\./);
  assert.match(msg, /The recording \(4 KB\) can be transcribed\. Choose once/); assert.match(msg, /This is not an MP3 file, and transcription on this computer reads MP3 only\./);
  assert.doesNotMatch(msg, /Transcribe on this computer|Install local transcription/, "this computer's engine is not offered for a file it cannot read");
  assert.match(msg, /Save key and transcribe with Deepgram/);
  assert.deepEqual(leftovers({ dir: f.system.store.dataDir }), []);
  // typing in the box lets the recording go, and with it the choice offered for it
  const ta = f.$("f-text"); ta.value = "SPEAKER 1: Hello."; ta.listeners.input();
  assert.equal(f.$("f-kind").textContent, "Paste text or a link, or upload a transcript or a recording."); assert.equal(visible(f.$("intake-msg")), "");
  // an M4A whose name says MP3: the server reads its bytes and says so, and this computer's engine is then not offered
  file.files = [new File([A.m4a({})], "renamed.mp3", { type: "audio/mpeg" })]; await file.listeners.change();
  await f.$("readThis").click(); await f.settle();
  assert.equal(uploadsSent(f).length, 2); assert.match(visible(f.$("intake-msg")), /reads MP3 files only, and this file is M4A or MP4/);
  assert.doesNotMatch(visible(f.$("intake-msg")), /Transcribe on this computer|Install local transcription/);
  // an MP3 whose name says M4A: the server reads its bytes, and this computer's engine transcribes it
  ta.value = ""; ta.listeners.input();
  file.files = [new File([A.mp3({ title: "Misnamed" })], "misnamed.m4a", { type: "audio/mp4" })]; await file.listeners.change();
  const going = f.$("readThis").click();
  await f.pump(() => f.ctx.page.S.b && f.ctx.page.S.b.run, 300); await going; await f.settle();
  assert.equal(local.got.length, 1, "transcribed on this computer"); assert.equal(f.ctx.page.S.b.run.import.file.name, "misnamed.m4a");
});

test("the page: with no engine at all, or audio set to stay here and no engine here, the choice comes before anything is sent", async t => {
  let f = await page(t, {});
  let file = f.$("f-file");
  file.files = [new File([A.mp3(TAGGED)], "talk.mp3", { type: "audio/mpeg" })]; await file.listeners.change();
  await f.$("readThis").click(); await f.settle();
  assert.equal(uploadsSent(f).length, 0); assert.match(visible(f.$("intake-msg")), /Install local transcription[\s\S]*Save key and transcribe with Deepgram/);
  f = await page(t, { serverFetch: recordingFetch(SAID), env: { DEEPGRAM_API_KEY: KEY, TRANSCRIBE_PREFER: "local" } });
  file = f.$("f-file");
  file.files = [new File([A.mp3(TAGGED)], "talk.mp3", { type: "audio/mpeg" })]; await file.listeners.change();
  await f.$("readThis").click(); await f.settle();
  assert.equal(uploadsSent(f).length, 0, "audio set to stay here is not sent to Deepgram without a choice");
  assert.match(visible(f.$("intake-msg")), /Install local transcription[\s\S]*Transcribe with Deepgram \(fast, paid\)/);
});

test("the page: choosing Deepgram once, for one file, does not switch off keeping audio on this computer", async t => {
  const fetchFn = recordingFetch(SAID), local = fakeLocal();
  const f = await page(t, { ai: scriptedAI(), serverFetch: fetchFn, localEngine: local, env: { TRANSCRIBE_PREFER: "local" } });
  const file = f.$("f-file");
  file.files = [new File([A.m4a({ title: "Council session" })], "council.m4a", { type: "audio/mp4" })]; await file.listeners.change();
  await f.$("readThis").click(); await f.settle();
  const box = f.$("intake-msg"), key = box.querySelectorAll("input")[0], btn = box.querySelectorAll("button").find(b => /Save key and transcribe/.test(b.textContent));
  key.value = "a".repeat(40); const going = btn.onclick ? btn.onclick() : btn.listeners.click({});
  await f.pump(() => f.ctx.page.S.b && f.ctx.page.S.b.run, 300); await going; await f.settle();
  assert.equal(fetchFn.deepgram().length, 1, "this file went to Deepgram, as chosen");
  assert.equal((await f.ctx.page.API.engines()).prefer, "local", "the standing preference is unchanged");
  const next = await f.ctx.page.API.uploadRecording(new File([A.mp3({ title: "Next memo" })], "next-memo.mp3", { type: "audio/mpeg" }), { name: "next-memo.mp3" });
  assert.equal(next.engine, "local", "the next recording stays on this computer"); assert.equal(fetchFn.deepgram().length, 1);
});

test("the page: a new choice of file replaces the old one and anything offered for it; a recording turned into no words does not reopen on every visit", async t => {
  const fetchFn = recordingFetch(SAID);
  let f = await page(t, { ai: scriptedAI(), serverFetch: fetchFn, localEngine: fakeLocal() });
  const file = f.$("f-file");
  // a recording, then a file the box cannot take: nothing is sent
  file.files = [new File([A.mp3({ title: "Private memo" })], "private-memo.mp3", { type: "audio/mpeg" })]; await file.listeners.change();
  file.files = [new File([Buffer.from("%PDF-1.7 a report")], "report.pdf", { type: "application/pdf" })]; await file.listeners.change();
  f.$("readThis").click(); await f.pump(() => uploadsSent(f).length > 0 || /paste something to read/.test(visible(f.$("intake-msg"))), 100);
  assert.equal(uploadsSent(f).length, 0, "the earlier recording was not sent"); assert.match(visible(f.$("intake-msg")), /Upload a transcript or a recording, or paste something to read\./);
  // the choice offered for recording A is gone once recording B is chosen
  file.files = [new File([A.m4a({ title: "First" })], "first-interview.m4a", { type: "audio/mp4" })]; await file.listeners.change();
  await f.$("readThis").click(); await f.settle();
  assert.match(visible(f.$("intake-msg")), /Save key and transcribe with Deepgram/);
  file.files = [new File([A.mp3({ title: "Second" })], "second-interview.mp3", { type: "audio/mpeg" })]; await file.listeners.change();
  assert.equal(visible(f.$("intake-msg")), "", "no button left that would send the first recording");
  // a recording turned into no words: the reason is said, and the next visit opens normally
  f = await page(t, { ai: scriptedAI(), localEngine: fakeLocal("") });
  const file2 = f.$("f-file");
  file2.files = [new File([A.mp3({ title: "Silent" })], "silent.mp3", { type: "audio/mpeg" })]; await file2.listeners.change();
  const going = f.$("readThis").click(); await f.pump(() => /no words/.test(visible(f.$("intake-msg"))), 300); await going; await f.settle();
  assert.match(visible(f.$("intake-msg")), /The recording was turned into no words[\s\S]*You can upload the recording again, or paste or upload its transcript/);
  assert.deepEqual((await f.system.jobs.pending("resolve")).filter(j => j.state === "done"), []);
  const S = f.ctx.page.S; S.resumedJobs = false; S.resumeFetch = null; await f.ctx.page.boot(); await f.settle();
  assert.equal(S.resumeFetch, null, "nothing is offered again on the next visit");
});

test("the page: words the server refuses to import are let go, so the next visit does not offer them again", async t => {
  // a resolver that finds a transcript the import cannot take (nothing in it after cleaning)
  const resolver = { classify: () => ({ kind: "page" }), locate: async () => ({ kind: "episode", show: { name: "Test Show" }, item: { title: "Blank", transcripts: [], enclosure: null } }), words: async () => ({ ok: true, text: "   \n  ", title: "Blank", speakers: [], tried: [], source: { kind: "feed-transcript", url: "https://show.test/blank.vtt", note: "the transcript the show publishes" }, show: { name: "Test Show" }, episode: { title: "Blank" }, matchedBy: "test", identity: "direct" }) };
  const f = await page(t, { resolver });
  const ta = f.$("f-text"); ta.value = "https://show.test/episode/blank"; ta.listeners.input();
  const going = f.$("readThis").click(); await f.pump(() => /paste something to read/.test(visible(f.$("intake-msg"))), 300); await going; await f.settle();
  assert.match(visible(f.$("intake-msg")), /Upload a transcript or paste something to read\./);
  assert.deepEqual((await f.system.jobs.pending("resolve")).filter(j => j.state === "done"), [], "let go");
  const S = f.ctx.page.S; S.resumedJobs = false; S.resumeFetch = null; await f.ctx.page.boot(); await f.settle();
  assert.equal(S.resumeFetch, null);
});

test("the page: when importing the words fails for a moment, Read this imports them, rather than reading the box as new text; a file over the limit is not sent", async t => {
  const fetchFn = recordingFetch(SAID);
  let f = await page(t, { ai: scriptedAI(), serverFetch: fetchFn, env: { DEEPGRAM_API_KEY: KEY } });
  const reader = f.system.reader, start = reader.start.bind(reader); let failed = false;
  reader.start = async (...a) => { if (!failed) { failed = true; throw Object.assign(new Error("A momentary failure."), { status: 503 }); } return start(...a); };
  const file = f.$("f-file");
  file.files = [new File([A.mp3(TAGGED)], "talk.mp3", { type: "audio/mpeg" })]; await file.listeners.change();
  let going = f.$("readThis").click(); await f.pump(() => /momentary/.test(visible(f.$("intake-msg"))), 300); await going;
  going = f.$("readThis").click(); await f.pump(() => f.ctx.page.S.b && f.ctx.page.S.b.run, 300); await going; await f.settle();
  const runs = (await f.system.store.listRuns()).filter(r => !r.example);
  assert.equal(runs.length, 1, "one reading, not a second one made from the box's text"); assert.equal(f.ctx.page.S.b.run.import.file.name, "talk.mp3");
  assert.equal(fetchFn.deepgram().length, 1, "transcribed once");
  // a file over the limit is refused on the page
  f = await page(t, { serverFetch: recordingFetch(SAID), env: { DEEPGRAM_API_KEY: KEY }, maxUploadBytes: 5000 });
  const file3 = f.$("f-file");
  file3.files = [new File([A.mp3(TAGGED)], "long.mp3", { type: "audio/mpeg" })]; await file3.listeners.change();
  await f.$("readThis").click(); await f.settle();
  assert.match(visible(f.$("intake-msg")), /This file is larger than 5 KB, the most the app sends on\./); assert.equal(uploadsSent(f).length, 0);
});
