"use strict";
// The real page and local API, with synthetic caption failures and supplied words. No external requests or models.
const test = require("node:test");
const assert = require("node:assert/strict");
const { File } = require("node:buffer");
const { page, visible } = require("./page-harness");
const audio = require("./fixtures/audio-files");

const LINK = "https://youtu.be/Blocked0001";
const OTHER = "https://youtu.be/Blocked0002";
const WORDS = "SPEAKER 1: The survey covered four hundred households in three neighborhoods.\n\nSPEAKER 2: That tells us something about those neighborhoods, but it does not tell us what every household in the city thinks.\n";
function resolver(overrides = {}) {
  return Object.assign({
    classify: () => ({ kind: "video" }),
    locate: async input => ({ kind: "video", video: { url: input.url } }),
    words: async located => ({
      ok: false, code: "youtube_access_blocked",
      reason: "YouTube asked for sign-in or browser verification before captions could be fetched.",
      recovery: { kind: "youtube", url: "https://www.youtube.com/watch?v=" + new URL(located.video.url).pathname.slice(1) },
      title: "Listing title only", channel: "Listing channel only",
      tried: [{ reader: "yt-dlp", error: "Sign in to confirm you’re not a bot" }, { reader: "built-in", error: "YouTube refused the caption list: LOGIN_REQUIRED" }]
    }),
    fileWords: async file => ({ ok: true, text: WORDS, title: "Supplied recording", speakers: [], source: { kind: "audio-transcription", engine: "local", file: { name: file.name, sha256: file.sha256, bytes: file.bytes, format: file.format }, note: "from the file you uploaded" } })
  }, overrides);
}
async function setup(t, opts = {}) {
  return page(t, Object.assign({ ai: null, resolver: resolver(), serverFetch: async () => { throw new Error("No external request is allowed in this test"); } }, opts));
}
async function blocked(f, link = LINK) {
  const ta = f.$("f-text"); ta.value = link; ta.listeners.input();
  const going = f.$("readThis").click();
  await f.pump(() => !!f.$("intake-msg").querySelector(".youtube-recovery"));
  await going;
  assert.ok(f.$("intake-msg").querySelector(".youtube-recovery"), visible(f.$("intake-msg")));
}
const button = (f, label) => f.$("intake-msg").querySelectorAll("button").find(b => b.textContent === label);
async function readSupplied(f) {
  const going = f.$("readThis").click();
  await f.pump(() => !!f.ctx.page.S.runId);
  await going; await f.settle();
  return f.ctx.page.S.b;
}

test("blocked captions show actionable recovery and closed reader diagnostics without starting a reading", async t => {
  const f = await setup(t); await blocked(f);
  const msg = f.$("intake-msg"), text = visible(msg);
  assert.match(text, /YouTube asked for sign-in or browser verification/);
  assert.match(text, /If YouTube offers Show transcript/);
  assert.match(text, /does not sign this app in/);
  assert.doesNotMatch(text, /LOGIN_REQUIRED|yt-dlp usually gets through|no captions, automatic or otherwise/);
  const details = msg.querySelector("details.caption-diagnostics");
  assert.equal(details.getAttribute("open"), null);
  assert.equal(details.querySelector("summary").textContent, "Caption fetch details");
  assert.match(details.textContent, /yt-dlp: Sign in.*built-in: YouTube refused/s);
  assert.doesNotMatch(details.textContent, /undefined:/);
  const link = msg.querySelector("a");
  assert.equal(link.textContent, "Open YouTube");
  assert.equal(link.getAttribute("href"), "https://www.youtube.com/watch?v=Blocked0001");
  assert.equal(link.getAttribute("target"), "_blank");
  assert.match(link.getAttribute("rel"), /noopener/);
  assert.equal(f.ctx.page.S.draft.sourceUrl, LINK);
  assert.equal(f.$("addContext").textContent, "Context added · edit");
  assert.equal(f.ctx.page.S.draft.title, undefined);
  assert.equal(f.ctx.page.S.draft.sourceLabel, undefined);
  assert.equal(f.ctx.page.S.runId, null);
  assert.equal(f.requests.filter(([url, method]) => method === "POST" && !/\/transcript\/(resolve|jobs\/[^/]+\/dismiss)$/.test(url)).length, 0);
  const ta = f.$("f-text"); let focused = 0, selected = 0, picker = 0;
  ta.focus = () => focused++; ta.select = () => selected++; f.$("f-file").click = () => picker++;
  const before = f.requests.length;
  button(f, "Paste transcript").click();
  button(f, "Upload transcript or recording").click();
  assert.deepEqual([focused, selected, picker], [1, 1, 1]);
  assert.equal(ta.value, LINK, "recovery selects the link without deleting it");
  ta.value = "Unrelated draft in progress";
  button(f, "Paste transcript").click();
  assert.equal(selected, 1, "unrelated text is not selected for replacement");
  assert.equal(ta.value, "Unrelated draft in progress");
  assert.equal(f.requests.length, before, "recovery controls make no service calls");
});

test("pasted words keep the failed link and manual context without masquerading as retrieved captions", async t => {
  const f = await setup(t);
  f.$("addContext").click();
  for (const [key, value] of Object.entries({ title: "My title", sourceLabel: "My source label", sourceDate: "2026-01-02" })) {
    const input = f.$("draft-" + key); input.value = value; input.listeners.input();
  }
  await blocked(f);
  const ta = f.$("f-text"); ta.value = WORDS; ta.listeners.input();
  const b = await readSupplied(f);
  assert.equal(b.run.sourceUrl, LINK);
  assert.equal(b.run.title, "My title");
  assert.equal(b.run.sourceLabel, "My source label");
  assert.equal(b.run.sourceDate, "2026-01-02");
  assert.ok(!b.run.import, "user-supplied text has no caption-reader import record");
  assert.equal(f.ctx.page.S.autoSourceUrl, "");
});

test("an uploaded transcript keeps the failed source link and its supplied text", async t => {
  const f = await setup(t); await blocked(f);
  const input = f.$("f-file"); input.files = [new File([WORDS], "supplied.txt", { type: "text/plain" })];
  await input.listeners.change();
  assert.equal(f.$("f-text").value, WORDS);
  const b = await readSupplied(f);
  assert.equal(b.run.sourceUrl, LINK);
  assert.ok(!b.run.import);
  assert.ok(b.transcript.includes("four hundred households"));
});

test("a supplied recording retains the source but waits for the existing engine choice", async t => {
  const f = await setup(t); await blocked(f);
  const input = f.$("f-file"); input.files = [new File([audio.bareMp3()], "supplied.mp3", { type: "audio/mpeg" })];
  await input.listeners.change();
  assert.equal(f.requests.filter(([url]) => url.startsWith("/api/transcript/upload")).length, 0);
  await f.$("readThis").click();
  assert.match(visible(f.$("intake-msg")), /Install local transcription.*Save key and transcribe with Deepgram/s);
  assert.equal(f.requests.filter(([url]) => url.startsWith("/api/transcript/upload")).length, 0, "no configured engine means no upload before choice");
  assert.equal(f.ctx.page.S.draft.sourceUrl, LINK);
  assert.equal(f.ctx.page.S.runId, null);
});

test("with an existing local engine a supplied recording carries its origin into the run only after Read this", async t => {
  const localEngine = { installed: () => true, modelCached: () => true, model: "test-local", packages: {} };
  const f = await setup(t, { localEngine }); await blocked(f);
  const input = f.$("f-file"); input.files = [new File([audio.bareMp3()], "supplied.mp3", { type: "audio/mpeg" })];
  await input.listeners.change();
  assert.equal(f.requests.filter(([url]) => url.startsWith("/api/transcript/upload")).length, 0);
  const b = await readSupplied(f);
  const uploads = f.requests.filter(([url]) => url.startsWith("/api/transcript/upload"));
  assert.equal(uploads.length, 1);
  assert.equal(new URL(uploads[0][0], "http://local.test").searchParams.get("sourceUrl"), LINK);
  assert.equal(b.run.sourceUrl, LINK);
  assert.equal(b.run.import.source.kind, "audio-transcription");
  assert.equal(b.run.import.url, "", "the video was not the recording's acquisition method");
  assert.equal(b.run.import.file.name, "supplied.mp3");
});

test("a different link clears only an automatically adopted source, never explicit context", async t => {
  const f = await setup(t); await blocked(f);
  const ta = f.$("f-text"); ta.value = OTHER; ta.listeners.input();
  assert.equal(f.ctx.page.S.draft.sourceUrl, undefined);
  assert.equal(f.$("addContext").textContent, "Add context");
  await blocked(f, OTHER);
  assert.equal(f.ctx.page.S.draft.sourceUrl, OTHER);
  f.$("addContext").click();
  const source = f.$("draft-sourceUrl"); source.value = LINK; source.listeners.input();
  ta.value = OTHER; ta.listeners.input();
  assert.equal(f.ctx.page.S.draft.sourceUrl, LINK, "explicit source survives a new input link");
  await blocked(f, OTHER);
  assert.equal(f.ctx.page.S.draft.sourceUrl, LINK);
  assert.doesNotMatch(visible(f.$("intake-msg")), /The link is kept as the source/, "the UI does not claim it replaced manual context");
});

test("a blocked replacement link leaves the saved reading intact and describes actions available in that view", async t => {
  const f = await setup(t);
  f.ctx.page.S.draft.sourceUrl = "https://source.test/original";
  const ta = f.$("f-text"); ta.value = WORDS; ta.listeners.input();
  const before = await readSupplied(f);
  f.$("controlsBtn").click();
  f.$("ctl-relink").value = LINK;
  const fetchButton = f.$("ctl-source").querySelectorAll("button").find(b => b.textContent === "Fetch and read");
  fetchButton.click();
  await f.pump(() => !!f.$("ctl-source").querySelector(".youtube-recovery"));
  const box = f.$("ctl-source").querySelector(".youtube-recovery");
  assert.ok(box, visible(f.$("ctl-source")));
  assert.match(visible(box), /Your saved reading is unchanged/);
  assert.match(visible(box), /Start a New reading with a transcript or recording, or try another link here/);
  assert.doesNotMatch(visible(box), /paste them here|The link is kept as the source/);
  assert.equal(box.querySelectorAll("button").length, 0);
  const after = await f.ctx.page.API.getRun(before.run.id);
  assert.equal(after.transcript, before.transcript);
  assert.equal(after.run.sourceUrl, "https://source.test/original");
  assert.equal(f.ctx.page.S.runId, before.run.id);
});

test("a saved recovery record cannot inject an external action to another protocol or site", async t => {
  for (const url of ["javascript:alert(1)", "https://www.youtube.com.evil.test/watch?v=Blocked0001", "https://www.youtube.com/redirect?q=https://evil.test"]) {
    const r = resolver(); const words = r.words;
    r.words = async located => Object.assign(await words(located), { recovery: { kind: "youtube", url } });
    const f = await setup(t, { resolver: r }); await blocked(f);
    assert.equal(f.$("intake-msg").querySelector("a"), null, url);
    assert.ok(button(f, "Paste transcript"));
  }
});
