"use strict";
/* Real-browser acceptance check for the reading page (headless Chromium through Playwright). All generated text is
   the MOCK responder's; the podcast feed, the YouTube search and its captions are local fixtures. Prints a report and
   exits non-zero on the first failed check. Needs:  npm install --no-save playwright  (and a Chromium; set
   DEFLATE_CHROMIUM_EXECUTABLE to use one already installed). Pictures go to scripts/ui-shots/. */
const fs = require("fs"), os = require("os"), path = require("path"), assert = require("node:assert/strict");
const { createApp } = require("../server/app"), { createMockAI } = require("../server/ai"), { createResearch } = require("../server/research");

const T = Array.from({ length: 18 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": This is an argument with enough words for a quoted passage number " + i + "." + (i === 3 ? " That shows everyone agrees with it." : "")).join("\n");
const LONG = Array.from({ length: 40 }, (_, i) => (i % 2 ? "GUEST" : "HOST") + ": Turn " + i + " says something worth reading with enough words in it to quote from." + (i === 9 ? " That shows everyone agrees with it." : "")).join("\n");
const CAPTIONS = "so today we talk about plans and what they are good for " + "and whether a bad plan beats no plan at all, which is the question for this hour ".repeat(30);
const FEED = '<?xml version="1.0"?><rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>UI Check Show</title><link>https://show.test/</link>' +
  '<item><title>With a transcript</title><guid>g-yes</guid><pubDate>Thu, 02 Oct 2026 10:00:00 GMT</pubDate><itunes:duration>600</itunes:duration><enclosure url="https://cdn.test/yes.mp3" type="audio/mpeg"/><podcast:transcript url="https://show.test/yes.vtt" type="text/vtt"/></item>' +
  '<item><title>An episode found on video</title><guid>g-vid</guid><pubDate>Wed, 01 Oct 2026 10:00:00 GMT</pubDate><itunes:duration>5400</itunes:duration><enclosure url="https://cdn.test/vid.mp3" type="audio/mpeg"/></item>' +
  '<item><title>Without any transcript anywhere</title><guid>g-no</guid><pubDate>Tue, 30 Sep 2026 10:00:00 GMT</pubDate><itunes:duration>3600</itunes:duration><enclosure url="https://cdn.test/no.mp3" type="audio/mpeg"/></item></channel></rss>';
const VTT = "WEBVTT\n\n" + T.split("\n").map((l, i) => { const [sp, ...rest] = l.split(": "); return "00:00:" + String(i).padStart(2, "0") + ".000 --> 00:00:" + String(i + 1).padStart(2, "0") + ".000\n<v " + sp + ">" + rest.join(": ") + "\n"; }).join("\n");
const fakeFetch = async url => {
  const u = String(url), res = (status, body, type) => ({ status, url: u, headers: { get: k => /content-type/i.test(k) ? type || "text/plain" : null }, text: async () => typeof body === "string" ? body : JSON.stringify(body) });
  if (u === "https://show.test/feed.xml") return res(200, FEED, "application/rss+xml");
  if (u === "https://slow.test/feed.xml") { await new Promise(r => setTimeout(r, 4000)); return res(200, FEED.replace("UI Check Show", "Slow Show"), "application/rss+xml"); }
  if (u === "https://show.test/yes.vtt") return res(200, VTT, "text/vtt");
  if (/youtubei\/v1\/player/.test(u)) return res(200, { playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you’re not a bot" } }, "application/json");
  if (/youtube\.com\/oembed/.test(u)) return res(200, { title: "A video", author_name: "UI Check Show" }, "application/json");
  return res(404, "nope");
};
/* yt-dlp, faked: a search finds the full upload of "An episode found on video" (5300 s against the episode's 5400 s);
   that one video has automatic captions; nothing else does. */
const fakeYtdlp = async (cmd, args) => {
  if (args[0] === "--version") return { code: 0, out: "2026.09.01\n", err: "" };
  const last = String(args[args.length - 1]);
  if (last.startsWith("ytsearch")) return { code: 0, out: /An episode found on video/.test(last) ? "FullEpisod1\tUI Check Show — An episode found on video (full)\tUI Check Show\t5300\nClipClipCli\tAn episode found on video (best bit)\tClips\t300\n" : "", err: "" };
  if (args.includes("--skip-download")) { if (args.includes("--write-auto-subs") && /FullEpisod1$/.test(last)) fs.writeFileSync(args[args.indexOf("-o") + 1].replace("%(id)s", "FullEpisod1.en.json3"), JSON.stringify({ events: [{ segs: [{ utf8: CAPTIONS }] }] })); return { code: 0, out: "", err: "" }; }
  return { code: 1, out: "", err: "?" };
};
/* The mock responder, slowed or made to fail on request so progress and failure can be watched. */
const knob = { delay: 0, failTurns: null, deepgram: false, recording: null };
/* Deepgram, faked for voice separation: no key until a check turns it on; its answer is set by the check. */
const fakeCloud = { name: "deepgram", model: "nova-3", configured: () => knob.deepgram, async diarize() { return knob.recording; } };
/* Deepgram's answer for a text whose paragraphs alternate between two voices. */
const recordingOf = text => { const words = []; let t = 0; text.split(/\n\s*\n/).forEach((para, i) => para.split(/\s+/).filter(Boolean).forEach(w => { words.push({ word: w.toLowerCase().replace(/[^a-z0-9']/g, ""), punctuated_word: w, speaker: i % 2, start: t, end: t + 0.3 }); t += 0.4; })); return { metadata: { request_id: "req-ui", duration: Math.round(t), models: ["nova-3"] }, results: { channels: [{ alternatives: [{ words }] }] } }; };
function testAI() {
  const mock = createMockAI();
  return { ...mock, async sample(args) {
    const p = String(args.prompt || ""), passage = p.startsWith("Help a reader understand this passage accurately.") && !p.includes("This is ONE claim");
    if (passage && knob.delay) await new Promise(r => setTimeout(r, knob.delay));
    if (passage && knob.failTurns && p.includes("PASSAGE (turns " + knob.failTurns)) { const e = new Error("The model's answer was cut off at its length limit before the JSON was complete."); e.code = "truncated"; e.text = "{"; e.meta = { usage: { input: 1, output: 16000 }, model: "mock", requestId: "req_cut", stopReason: "max_tokens" }; throw e; }
    return mock.sample(args);
  } };
}

(async () => {
  const { chromium } = require("playwright");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-browser-")), shots = path.join(__dirname, "ui-shots"); fs.mkdirSync(shots, { recursive: true });
  const system = createApp({ dataDir: dir, ai: testAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), fetch: fakeFetch, run: fakeYtdlp, cloudEngine: fakeCloud, env: {}, envPath: path.join(dir, ".env") }); await system.ready;
  const server = await new Promise(r => { const s = system.app.listen(0, "127.0.0.1", () => r(s)); });
  const root = "http://127.0.0.1:" + server.address().port;
  const report = {}, errors = [], refused = []; let browser;
  const check = (name, ok, detail) => { report[name] = ok ? true : (detail || false); if (!ok) { console.error(JSON.stringify(report, null, 2)); throw new Error("check failed: " + name + (detail ? " — " + JSON.stringify(detail) : "")); } };
  const ready = (pg, ms) => pg.waitForFunction(() => /Your reading is ready/.test((document.querySelector("#reading-status") || {}).textContent || ""), null, { timeout: ms || 60000 });
  const runId = pg => pg.evaluate(() => location.hash.replace(/^#run-/, ""));
  const bundle = (pg, id) => pg.evaluate(i => fetch("/api/runs/" + i).then(r => r.json()), id);
  const read = async (pg, text) => { await pg.locator("#readingsBtn").click(); await pg.locator("#newRun").click(); await pg.fill("#f-text", text); await pg.locator("#readThis").click(); };
  const noHScroll = pg => pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.DEFLATE_CHROMIUM_EXECUTABLE ? { executablePath: process.env.DEFLATE_CHROMIUM_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") (/^Failed to load resource: the server responded with a status of 400/.test(m.text()) ? refused : errors).push("console: " + m.text()); });

    /* 1. The start screen, at desktop and phone width */
    for (const [w, hgt] of [[1440, 900], [390, 844]]) {
      await page.setViewportSize({ width: w, height: hgt }); await page.goto(root); await page.waitForSelector("#f-text");
      const s = await page.evaluate(() => {
        const vis = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== "hidden";
        const intake = document.querySelector("#intake");
        return { inputs: [...intake.querySelectorAll("textarea,input:not([type=file])")].filter(vis).length, uploads: [...document.querySelectorAll("button")].filter(b => vis(b) && b.textContent === "Upload transcript").length,
          primaries: [...document.querySelectorAll(".btn.primary")].filter(vis).map(b => b.textContent), helpers: [...intake.querySelectorAll("p")].filter(vis).length, controlsHidden: document.querySelector("#controls").hidden, readingsHidden: document.querySelector("#readings").hidden };
      });
      check("start@" + w, s.inputs === 1 && s.uploads === 1 && s.primaries.length === 1 && s.primaries[0] === "Read this" && s.helpers <= 1 && s.controlsHidden && s.readingsHidden, s);
      await page.screenshot({ path: path.join(shots, "start-" + w + ".png") });
    }

    /* 2. A pasted transcript; the completed reading; Evidence in one action; no level change calls anything */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.fill("#f-text", T); await page.locator("#readThis").click(); await ready(page);
    const cards = await page.evaluate(() => [...document.querySelectorAll(".card")].map(c => ({ blocks: [...c.querySelectorAll(":scope > .blk > h3")].map(x => x.textContent), levels: [...c.querySelectorAll(".levels button")].map(b => b.textContent), chips: c.querySelectorAll(".chips,.chip-ev").length, ledger: /The claims, one at a time|Where it jumps/.test(c.innerText), evidenceOpen: c.querySelector("details.evidence").open })));
    check("cards", cards.length === 3 && cards.every(c => c.blocks.join("|") === "In plain words|A fair reading|What follows" && c.levels.join("|") === "High school|Fifth grade" && !c.chips && !c.ledger && !c.evidenceOpen), cards);
    const first = page.locator(".card").first();
    await first.locator("details.evidence > summary").click();
    const ev = await first.locator("details.evidence").innerText();
    check("evidenceOneClick", /The original passage[\s\S]*HOST|Host/.test(ev) && /This is an argument with enough words for a quoted passage number 0\./.test(ev) && /matched/.test(ev) && /Where the reasoning turns/.test(ev), ev.slice(0, 300));
    let calls = 0; const count = r => { if (r.url().includes("/api/")) calls++; }; page.on("request", count);
    await first.locator(".levels button:has-text('Fifth grade')").click();
    await page.waitForTimeout(150); page.off("request", count);
    check("levelNoCall", calls === 0 && await first.getAttribute("data-level") === "5", { calls });
    await page.screenshot({ path: path.join(shots, "reading-1440.png"), fullPage: true });

    /* 3. Controls: closed by default, keyboard opens it, Escape closes it and focus returns; focus is visible */
    await page.locator("#controlsBtn").focus(); await page.keyboard.press("Enter");
    await page.waitForSelector("#controls:not([hidden])");
    const inside = await page.evaluate(() => document.querySelector("#controls").contains(document.activeElement));
    const groups = await page.locator("#controlsBody section > h2").allTextContents();
    await page.screenshot({ path: path.join(shots, "controls-1440.png") });
    await page.keyboard.press("Escape");
    const back = await page.evaluate(() => ({ hidden: document.querySelector("#controls").hidden, focus: document.activeElement && document.activeElement.id, outline: getComputedStyle(document.activeElement).outlineStyle }));
    check("controlsKeyboard", inside && groups.join("|") === "Reading|Input and speakers|App and files" && back.hidden && back.focus === "controlsBtn" && back.outline !== "none", { inside, groups, back });
    check("guideLink", await page.evaluate(() => !!document.querySelector("#guideLink")));
    await page.locator("#controlsBtn").click(); await page.locator("#guideLink").click(); await page.waitForSelector("#guideView:not([hidden]) .guide-toc");
    const guide = await page.locator("#guideView").innerText();
    check("guideRenders", /Start a reading[\s\S]*Read the result[\s\S]*Understand the limits[\s\S]*Use optional controls[\s\S]*Know where work goes[\s\S]*Get unstuck/.test(guide) && /Back to your reading/.test(guide));
    await page.locator("#guideView .back").first().click(); await page.waitForSelector(".card");

    /* 4. Phone width: plain reading near the card top, targets ~44px, no horizontal scroll at 390 and 320, larger text, dark */
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(100);
    const top = await page.evaluate(() => [...document.querySelectorAll(".card:not(.waiting)")].map(c => { const t = c.getBoundingClientRect().top, p = c.querySelector(".blk.plain .lvl"); return Math.round(p.getBoundingClientRect().top - t); }));
    check("plainWithin220", top.every(x => x <= 220), top);
    const targets = await page.evaluate(() => { const sel = ["#readingsBtn", "#controlsBtn", ".card .levels button", ".card details.evidence > summary", "#contents > summary"]; return sel.map(s => { const el = document.querySelector(s); const r = el.getBoundingClientRect(); return [s, Math.round(r.width), Math.round(r.height)]; }); });
    check("targets44", targets.every(([, w, hh]) => hh >= 43 && w >= 43), targets);
    check("noHScroll390", await noHScroll(page));
    await page.screenshot({ path: path.join(shots, "reading-390.png"), fullPage: true });
    await page.setViewportSize({ width: 320, height: 700 }); check("noHScroll320", await noHScroll(page));
    await page.addStyleTag({ content: "html{font-size:125%!important}" }); await page.setViewportSize({ width: 390, height: 844 }); check("largerTextFits", await noHScroll(page));
    await page.reload(); await page.waitForSelector(".card");
    await page.emulateMedia({ colorScheme: "dark" }); const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.screenshot({ path: path.join(shots, "reading-390-dark.png") });
    await page.emulateMedia({ colorScheme: "light" }); const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check("darkAndLight", dark !== light && dark === "rgb(18, 21, 20)", { dark, light });
    check("levelKeptAfterReload", await page.locator(".card").first().getAttribute("data-level") === "5");
    await page.setViewportSize({ width: 1440, height: 900 });

    /* 5. Progress updates keep scroll, focus, caret, unsaved text, the card's level and open Evidence */
    knob.delay = 700;
    await read(page, LONG);
    await page.waitForFunction(() => document.querySelectorAll(".card:not(.waiting)").length >= 1, null, { timeout: 30000 });
    const c1 = page.locator(".card:not(.waiting)").first();
    await c1.locator(".levels button:has-text('Fifth grade')").click();
    await c1.locator("details.evidence > summary").click();
    const srcSummary = c1.locator("details.sources > summary").last(); await srcSummary.click();
    const note = c1.locator("details.sources").last().locator("input[placeholder='What it shows (one line)']").first();
    await note.scrollIntoViewIfNeeded(); await note.click(); await note.type("half typed note"); await note.evaluate(el => el.setSelectionRange(4, 4));
    const before = await page.evaluate(() => { const a = document.activeElement; return { key: a.getAttribute("data-key"), y: Math.round(a.getBoundingClientRect().top), scrollY: Math.round(scrollY) }; });
    const stillRunning = await page.evaluate(() => /Reading passage/.test(document.querySelector("#reading-status").textContent));
    await ready(page, 90000);
    const after = await page.evaluate(() => { const a = document.activeElement; const c = document.querySelector(".card:not(.waiting)"); return { key: a && a.getAttribute("data-key"), value: a && a.value, caret: a && a.selectionStart, y: a ? Math.round(a.getBoundingClientRect().top) : null, level: c.getAttribute("data-level"), evidence: c.querySelector("details.evidence").open, cards: document.querySelectorAll(".card:not(.waiting)").length }; });
    check("progressPreserves", stillRunning && after.key === before.key && after.value === "half typed note" && after.caret === 4 && Math.abs(after.y - before.y) <= 2 && after.level === "5" && after.evidence && after.cards === 5, { stillRunning, before, after });
    await page.locator("h1.run-title").click(); await page.waitForTimeout(200); // leave the field: the deferred redraw happens, the typed text survives
    check("unsavedSurvivesRedraw", await page.evaluate(() => [...document.querySelectorAll("input")].some(i => i.value === "half typed note")));
    knob.delay = 0;

    /* 6. Stop and resume; refresh while reading */
    knob.delay = 600;
    await read(page, LONG.replace(/worth reading/g, "worth hearing"));
    await page.waitForFunction(() => /Reading passage/.test((document.querySelector("#reading-status") || {}).textContent || ""), null, { timeout: 20000 });
    await page.locator("#reading-status button:has-text('Stop')").click();
    await page.waitForFunction(() => /Stopped\. Your finished readings are kept\./.test(document.querySelector("#reading-status").textContent), null, { timeout: 20000 });
    const stopNote = await page.locator("#reading-status").innerText();
    await page.locator("#reading-status button:has-text('Resume reading')").click();
    await page.waitForFunction(() => /Reading passage/.test(document.querySelector("#reading-status").textContent), null, { timeout: 20000 });
    await page.reload(); await ready(page, 90000);
    check("stopResumeRefresh", /Resume reading/.test(stopNote) && await page.locator(".card:not(.waiting)").count() === 5, stopNote);
    knob.delay = 0;

    /* 7. A reading that couldn't be completed: a plain status with one retry, the reason under that passage's Evidence;
          an out-of-date one says so; the export does not pass it off */
    knob.failTurns = "8–15";
    await read(page, T.replace(/argument/g, "case")); await page.waitForFunction(() => /couldn't be completed/.test((document.querySelector("#reading-status") || {}).textContent || ""), null, { timeout: 60000 });
    knob.failTurns = null;
    const held = page.locator(".card.waiting").first(), heldText = await held.innerText();
    const status = await page.locator("#reading-status").innerText(), statusButtons = await page.locator("#reading-status button").allInnerTexts();
    await held.locator("details.evidence > summary").click();
    const heldEvidence = await held.innerText();
    const heldId = await runId(page), md = await page.evaluate(i => fetch("/api/runs/" + i + "/export.md").then(r => r.text()), heldId);
    check("heldPlain", /^\d+ readings? ready\. 1 couldn't be completed\.\s*Try again$/.test(status.trim()) && statusButtons.length === 1 && statusButtons[0] === "Try again", { status, statusButtons });
    check("heldReasonUnderEvidence", /This reading couldn't be completed\./.test(heldText) && !/cut off|deflated|\.g5|\.hs|Read this passage again/.test(heldText) &&
      /Why it couldn't be completed\s*The model's answer was cut off at its length limit before it finished\.[\s\S]*The original passage/.test(heldEvidence) && await held.locator("button:has-text('again')").count() === 0, { heldText, heldEvidence });
    check("heldExport", /\*\*This reading couldn't be completed\.\*\* Why: The model's answer was cut off/.test(md));
    await page.screenshot({ path: path.join(shots, "held-1440.png"), fullPage: true });
    const hb = await bundle(page, heldId);
    await page.evaluate(([i, t]) => fetch("/api/runs/" + i, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ run: {}, transcript: t }) }), [heldId, hb.transcript.replace("number 2.", "number two.")]);
    await page.reload(); await page.waitForSelector(".card");
    check("outOfDate", /Out of date: the text changed after this reading was made\./.test(await page.locator("#cards").innerText()) && /out of date/.test(await page.locator("#reading-status").innerText()));

    /* 8. A person's contradiction is shown on the card and attributed to them */
    await page.locator("#readingsBtn").click(); await page.locator("#runList button").filter({ hasText: "This is an argument" }).first().click(); await page.waitForSelector(".card");
    const c = page.locator(".card").first(); await c.locator("details.evidence > summary").click();
    const srcs = c.locator("details.sources").last(); if (!(await srcs.evaluate(d => d.open))) await srcs.locator(":scope > summary").click();
    const cand = srcs.locator(".cand").first(); await cand.locator("select").first().selectOption("contradicts"); await cand.locator("button:has-text('Accept as a source')").click();
    await page.waitForFunction(() => /You marked a source as contradicting/.test(document.querySelector(".card").innerText), null, { timeout: 10000 });
    check("contradictionAttributed", /That is your judgment; the reading was not changed by it\./.test(await page.locator(".card").first().innerText()));

    /* 9. A show link: the episodes to choose from (no guessing); a published transcript; a matched video; the audio choice */
    await read(page, "https://show.test/feed.xml");
    await page.waitForSelector("#intake .episodes .btn.ep", { timeout: 20000 });
    check("episodeChoice", await page.locator("#intake .episodes .btn.ep").count() === 3 && /transcript published/.test(await page.locator("#intake .episodes .btn.ep").first().textContent()));
    await page.locator("#intake .episodes .btn.ep").first().click(); await ready(page);
    const chain = await bundle(page, await runId(page));
    check("publishedTranscript", chain.run.import.source.kind === "feed-transcript" && chain.sourceIdentity.state === "direct" && /UI Check Show/.test(chain.run.sourceLabel) && !(await page.locator(".notice.source").count()));
    await read(page, "https://show.test/feed.xml"); await page.waitForSelector("#intake .episodes .btn.ep", { timeout: 20000 });
    await page.locator("#intake .episodes .btn.ep").nth(1).click(); await ready(page);
    const vidId = await runId(page);
    const notice = page.locator(".notice.source");
    check("matchedNotice", (await notice.innerText()).trim() === "Video matched by title and length — Check source");
    check("quietSpeakerLine", (await page.locator("#speakerNotice").innerText()).trim() === "No speaker labels in this text. Find speakers" && !/Speaker unknown|Speaker not established/.test(await page.locator("#runView").innerText()));
    await notice.locator("button:has-text('Check source')").click();
    const cmp = await notice.innerText();
    check("comparison", /Episode you asked for\s*An episode found on video · 90 min[\s\S]*Video used\s*UI Check Show — An episode found on video \(full\) · UI Check Show · 88 min 20 s[\s\S]*differ by 1 min 40 s\. Up to 4 min 30 s is allowed/.test(cmp) && !/official|verified/i.test(await page.locator("#runView").innerText()), cmp);
    await page.screenshot({ path: path.join(shots, "source-check-1440.png") });
    await notice.locator("button:has-text('Check source')").click(); // closing the comparison is not a confirmation
    await page.reload(); await page.waitForSelector(".notice.source");
    const second = await context.newPage(); await second.goto(root + "/#run-" + vidId); await second.waitForSelector(".notice.source");
    const exp = await page.evaluate(i => Promise.all([fetch("/api/runs/" + i + "/export.md").then(r => r.text()), fetch("/api/runs/" + i + "/export.json").then(r => r.json())]), vidId);
    check("matchSurvives", (await bundle(page, vidId)).sourceIdentity.state === "needs_confirmation" && /no person has confirmed that it is the intended episode/.test(exp[0]) && exp[1].run.sourceIdentity.match.video.id === "FullEpisod1");
    await second.locator(".notice.source button:has-text('Check source')").click(); await second.locator("button:has-text('They match')").click();
    await second.waitForFunction(() => !document.querySelector(".notice.source"), null, { timeout: 10000 });
    await page.reload(); await page.waitForSelector(".card");
    check("confirmedEverywhere", !(await page.locator(".notice.source").count()) && /Match confirmed by you on/.test(await page.locator("#run-head").innerText()));
    await second.close();
    // the intended episode changes under the same video (here only its feed guid): the confirmation stops counting, the
    // comparison says why, and confirming again records the new pairing
    const rj = path.join(dir, "runs", vidId, "run.json"), rec = JSON.parse(fs.readFileSync(rj, "utf8")); rec.import.episodeInfo.guid = "g-vid-other"; fs.writeFileSync(rj, JSON.stringify(rec, null, 2));
    await page.reload(); await page.waitForSelector(".notice.source");
    await page.locator(".notice.source button:has-text('Check source')").click();
    const earlier = await page.locator(".notice.source").innerText();
    check("earlierConfirmationShown", /Earlier confirmation\s*You confirmed “An episode found on video” on \d{4}-\d{2}-\d{2}\. It does not count now: the source or the episode changed\./.test(earlier), earlier);
    await page.locator("button:has-text('They match')").click(); await page.waitForFunction(() => !document.querySelector(".notice.source"), null, { timeout: 10000 });
    const reb = await bundle(page, vidId);
    check("reconfirmed", reb.sourceIdentity.state === "confirmed" && reb.run.sourceConfirmation.episodeGuid === "g-vid-other" && reb.run.sourceConfirmationHistory.length === 1);
    await read(page, "https://show.test/feed.xml"); await page.waitForSelector("#intake .episodes .btn.ep", { timeout: 20000 });
    await page.locator("#intake .episodes .btn.ep").nth(2).click(); await page.waitForSelector("#intake .enginebox", { timeout: 20000 });
    const box = await page.locator("#intake").innerText();
    check("audioChoice", /feed transcript: the feed has no transcript/.test(box) && /youtube search: no results/.test(box) && /can be transcribed\. Choose once/.test(box) && /the audio goes to Deepgram and is billed/.test(box));
    await page.fill("#intake .enginebox input[type=password]", "short"); await page.locator("#intake .enginebox button:has-text('Save key and transcribe')").click();
    await page.waitForFunction(() => /does not look like a Deepgram API key/.test(document.querySelector("#intake").textContent), null, { timeout: 10000 });
    check("badDeepgramKeyRefused", !fs.existsSync(path.join(dir, ".env")) || !fs.readFileSync(path.join(dir, ".env"), "utf8").includes("short"));

    /* 10. No speaker labels: one quiet line, no speaker in front of each line. Voices from the recording (Deepgram,
           faked) label the text without changing a word; the line says where the labels came from; one confirmation names them */
    const unlabeled = Array.from({ length: 10 }, (_, i) => "This is paragraph " + i + " of a transcript made from audio, with enough words in it to be quoted by a card, mentioning " + (i % 2 ? "my book" : "the show") + ".").join("\n\n");
    await read(page, unlabeled); await ready(page);
    const lineBox = await page.locator("#speakerNotice").boundingBox();
    check("speakerLineQuiet", (await page.locator("#speakerNotice").innerText()).trim() === "No speaker labels in this text. Find speakers" && lineBox.height < 36, lineBox);
    const firstCard = page.locator(".card").first(); await firstCard.locator("details.evidence > summary").click();
    check("noSpeakerPrefix", !/Speaker unknown|Speaker not established|UNLABELED/.test(await firstCard.innerText()) && await firstCard.locator(".target-turns .sp").count() === 0);
    await page.screenshot({ path: path.join(shots, "speakers-none-1440.png") });
    await page.locator("#speakerNotice button:has-text('Find speakers')").click(); await page.waitForSelector("#controls:not([hidden]) #ctl-speakers");
    const find = page.locator("#ctl-speakers details.ctl-find");
    check("findSpeakersClosed", await find.count() === 1 && !(await find.evaluate(d => d.open)) && /No speaker labels came with this text/.test(await page.locator("#ctl-speakers").innerText()));
    await find.locator(":scope > summary").click();
    check("voicesNeedKey", /Needs a Deepgram key first/.test(await find.innerText()) && await find.locator("button:has-text('Separate voices from the recording')").isDisabled());
    knob.deepgram = true; knob.recording = recordingOf((await bundle(page, await runId(page))).transcript);
    // the key is now set (as if saved under Controls): a fresh page asks the server again
    await page.reload(); await page.waitForSelector("#speakerNotice");
    await page.locator("#speakerNotice button:has-text('Find speakers')").click(); await page.waitForSelector("#controls:not([hidden]) #ctl-speakers details.ctl-find");
    await page.waitForFunction(() => { const b = [...document.querySelectorAll("#ctl-speakers details.ctl-find button")].find(x => x.textContent === "Separate voices from the recording"); return b && !b.disabled; }, null, { timeout: 10000 });
    const find2 = page.locator("#ctl-speakers details.ctl-find");
    if (!(await find2.evaluate(d => d.open))) await find2.locator(":scope > summary").click();
    await find2.locator("input[type=url]").fill("https://cdn.test/no.mp3");
    await find2.locator("button:has-text('Separate voices from the recording')").click();
    await page.waitForFunction(() => /separated by voice/.test((document.querySelector("#speakerNotice") || {}).textContent || ""), null, { timeout: 60000 }); await ready(page);
    check("voicesLine", (await page.locator("#speakerNotice").innerText()).trim() === "Speakers separated by voice. Name them");
    const vCard = page.locator(".card").first(); await vCard.locator("details.evidence > summary").click();
    check("voicesOnTurns", /Speaker 1:\s*This is paragraph 0[\s\S]*Speaker 2:\s*This is paragraph 1/.test(await vCard.innerText()));
    await page.screenshot({ path: path.join(shots, "speakers-voices-1440.png") });
    await page.locator("#speakerNotice button:has-text('Name them')").click(); await page.waitForSelector("#controls:not([hidden]) #ctl-speakers");
    await page.fill("#ctl-speakers input[aria-label='Name for Speaker 1']", "Ann Lee"); await page.fill("#ctl-speakers input[aria-label='Name for Speaker 2']", "Bo Diaz");
    await page.locator("#ctl-speakers button:has-text('Confirm names')").click();
    await page.waitForFunction(() => /Details/.test((document.querySelector("#speakerNotice") || {}).textContent || ""), null, { timeout: 10000 });
    await page.locator("#controls .panel-close").click();
    check("namesConfirmed", /Ann Lee/.test(await page.locator(".card").first().innerText()) && (await page.locator("#speakerNotice").innerText()).trim() === "Speakers separated by voice. Details");
    await page.setViewportSize({ width: 390, height: 844 });
    const phoneBox = await page.locator("#speakerNotice").boundingBox();
    check("speakerLineQuiet@390", phoneBox.height < 36 && await noHScroll(page), phoneBox);
    await page.screenshot({ path: path.join(shots, "speakers-voices-390.png") });
    await page.setViewportSize({ width: 1440, height: 900 }); knob.deepgram = false;

    /* 11. A missing key: the text is saved, the prompt appears once, a refused key keeps it usable, the reading continues */
    system.state.ai = null; await page.reload(); await read(page, T.replace(/argument/g, "point"));
    await page.waitForSelector("#reading-status .keybox");
    let attempts = 0;
    await page.route("**/api/settings/anthropic-key", async route => { attempts++; if (attempts === 1) return route.fulfill({ status: 400, json: { error: "That does not look like an Anthropic key." } }); system.state.ai = testAI(); return route.fulfill({ json: { ok: true, ai: { kind: "mock", model: "mock", mock: true } } }); });
    await page.fill(".keybox input", "bad"); await page.locator(".keybox button").click();
    await page.waitForFunction(() => /does not look like an Anthropic key/.test(document.querySelector(".keybox").textContent));
    await page.fill(".keybox input", "test-only-key"); await page.locator(".keybox button").click(); await ready(page);
    check("keyContinued", await page.locator(".card").count() === 3 && !(await page.locator(".keybox").count()));
    await page.unroute("**/api/settings/anthropic-key");

    /* 12. A fetch running before the page opened is picked up once; two tabs import one finished fetch once;
           an episode list left behind does not take over */
    const slow = await page.evaluate(() => fetch("/api/transcript/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://slow.test/feed.xml", guid: "g-yes" }) }).then(r => r.json()));
    await page.reload();
    await page.waitForFunction(() => /Still finding the transcript/.test((document.querySelector("#intake") || {}).textContent || ""), null, { timeout: 10000 });
    await ready(page);
    check("resumedFetch", /Slow Show/.test(await page.locator("#run-head").innerText()) && (await page.evaluate(() => fetch("/api/transcript/engines").then(r => r.json()))).running.length === 0 && !!slow.jobId);
    await page.goto("about:blank");
    const raced = await fetch(root + "/api/transcript/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://show.test/feed.xml", guid: "g-yes" }) }).then(r => r.json());
    for (let n = 0; n < 100; n++) { if ((await system.jobs.get(raced.jobId)).state !== "running") break; await new Promise(r => setTimeout(r, 20)); }
    const beforeRace = (await system.store.listRuns()).length, other = await context.newPage(), replies = [];
    await context.route("**/api/transcript/engines", async route => { const response = await route.fetch(); replies.push({ route, response }); if (replies.length === 2) await Promise.all(replies.map(x => x.route.fulfill({ response: x.response }))); });
    await Promise.all([page.goto(root), other.goto(root)]); await Promise.all([ready(page), ready(other)]);
    await context.unroute("**/api/transcript/engines");
    const racedId = (await system.jobs.get(raced.jobId)).runId;
    check("twoTabsOneImport", (await system.store.listRuns()).length === beforeRace + 1 && await runId(page) === racedId && await runId(other) === racedId);
    await other.close();
    const leftover = await fetch(root + "/api/transcript/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://show.test/feed.xml" }) }).then(r => r.json());
    for (let n = 0; n < 100; n++) { if ((await system.jobs.get(leftover.jobId)).state !== "running") break; await new Promise(r => setTimeout(r, 20)); }
    await page.goto("about:blank"); await page.goto(root + "/#run-" + racedId); await page.waitForSelector(".card");
    check("leftoverStaysPut", !/pick the episode/.test(await page.locator("#runView").innerText()));

    /* 13. The supplied example stays held and read-only */
    await page.locator("#readingsBtn").click(); await page.locator("#runList button").filter({ hasText: "example" }).first().click();
    await page.waitForFunction(() => /supplied example/.test((document.querySelector("#notices") || {}).textContent || ""), null, { timeout: 20000 });
    check("exampleHeld", await page.locator(".card:not(.waiting)").count() === 0 && /Copy and read this example/.test(await page.locator("#notices").innerText()));

    check("noPageErrors", errors.length === 0, errors);
    check("onlyTheDeliberateRefusals", refused.length === 2, refused); // the short Deepgram key and the first, bad model key
    console.log(JSON.stringify(report, null, 2));
    console.log("ui-check: " + Object.keys(report).length + " checks passed");
  } finally {
    for (const job of system.reader.jobs.values()) job.controller.abort(); await Promise.all([...system.reader.jobs.values()].map(j => j.done));
    if (browser) await browser.close(); await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
