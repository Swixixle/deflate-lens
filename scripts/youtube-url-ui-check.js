"use strict";
/* Focused Chromium acceptance: shipped UI -> real resolver/downloader -> exact file bytes -> real Deepgram request
   construction -> saved transcript -> automatic mock reading. YouTube, yt-dlp and Deepgram are synthetic boundaries;
   no browser cookies, external services or paid models are used. Run: node scripts/youtube-url-ui-check.js */
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const { createApp } = require("../server/app");
const { createResearch } = require("../server/research");
const { SAID, DEEPGRAM, SHOW, EPISODE, scriptedAI } = require("../test/fixtures/straight-talk");
const A = require("../test/fixtures/audio-files");
const ID = "AbCdEfGhIjK", LINK = "https://www.youtube.com/watch?v=" + ID;
const BYTES = A.m4a({ title: EPISODE, artist: SHOW });

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-youtube-browser-"));
  let system, server, browser;
  const report = {}, calls = [], requests = [], pageErrors = [];
  const check = (key, condition, note) => { assert.ok(condition, key + (note ? ": " + JSON.stringify(note) : "")); report[key] = true; };
  let transcriptions = 0, downloaded = 0;
  try {
    const run = async (cmd, args, opts = {}) => {
      calls.push(args);
      if (args.includes("--version")) return { code: 0, out: "synthetic-yt-dlp", err: "" };
      if (args.includes("--skip-download")) return { code: 0, out: "", err: "No captions available in this fixture" };
      assert.ok(args.includes("--write-info-json"));
      check("downloadUsesOptedInChrome", args.includes("--cookies-from-browser") && args[args.indexOf("--cookies-from-browser") + 1] === "chrome");
      check("downloadIgnoresExternalConfig", args.includes("--ignore-config"));
      check("nativeAudioNeedsNoFfmpeg", args.includes("--fixup") && args[args.indexOf("--fixup") + 1] === "never");
      downloaded++;
      await fs.writeFile(path.join(opts.cwd, "audio.m4a"), BYTES);
      await fs.writeFile(path.join(opts.cwd, "audio.info.json"), JSON.stringify({ title: EPISODE, channel: SHOW, description: "Walt Brannigan interviews Marcus Delacroix.", duration: 2940, url: "https://private.googlevideo.com/?sig=DO-NOT-STORE" }));
      return { code: 0, out: "", err: "" };
    };
    const fakeFetch = async (url, options) => {
      const u = String(url);
      const response = body => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      if (/youtube\.com\/oembed/.test(u)) return response({ title: EPISODE, author_name: SHOW });
      if (/youtubei\/v1\/player/.test(u)) return response({ playabilityStatus: { status: "OK" } });
      if (/^https:\/\/api\.deepgram\.com\/v1\/listen\?/.test(u)) {
        transcriptions++;
        assert.deepEqual(Buffer.from(await new Response(options.body).arrayBuffer()), BYTES);
        check("actualAudioBytesReachTranscription", true);
        check("noCookiesReachTranscription", !Object.keys(options.headers).some(k => /cookie/i.test(k)));
        return response(DEEPGRAM(SAID));
      }
      throw new Error("Unexpected external request: " + u);
    };
    const ai = scriptedAI();
    system = createApp({ dataDir: root, examplesDir: root, envPath: path.join(root, ".env"), env: { DEEPGRAM_API_KEY: "d".repeat(40) }, ai, research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), fetch: fakeFetch, run });
    await system.ready;
    server = await new Promise(resolve => { const s = system.app.listen(0, "127.0.0.1", () => resolve(s)); });
    const base = "http://127.0.0.1:" + server.address().port;
    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true, ...(process.env.DEFLATE_CHROMIUM_EXECUTABLE ? { executablePath: process.env.DEFLATE_CHROMIUM_EXECUTABLE } : {}) });
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.on("pageerror", e => pageErrors.push(e.message));
    page.on("request", r => { requests.push({ url: r.url(), method: r.method() }); });
    await page.route("**/*", route => { if (route.request().url().startsWith(base + "/")) return route.continue(); return route.abort(); });
    await page.goto(base);
    await page.waitForSelector("#readThis");
    check("controlsClosedInitially", !(await page.locator("#controls").isVisible()));
    await page.locator("#controlsBtn").click();
    const chrome = page.getByLabel("Use Chrome sign-in for YouTube", { exact: true });
    check("chromeDefaultOff", !(await chrome.isChecked()));
    await chrome.check();
    await page.waitForFunction(async () => (await (await fetch("/api/transcript/engines")).json()).cookiesBrowser === "chrome");
    check("toggleStartsNoReadingOrDownload", transcriptions === 0 && downloaded === 0 && ai.prompts.length === 0);
    check("consentSaysLocalCookieUse", /read Chrome's saved sign-in cookies/.test(await page.locator("#controlsBody").innerText()));
    await page.locator("#controls .panel-close").click();
    await page.fill("#f-text", LINK);
    check("paidFallbackShownBeforeRead", /billed to your saved key/.test(await page.locator("#f-kind").innerText()));
    await page.locator("#readThis").click();
    await page.waitForFunction(() => /^#run-/.test(location.hash), { timeout: 30000 });
    const id = (await page.evaluate(() => location.hash)).slice(5);
    await page.waitForFunction(() => /Your reading is ready/.test((document.querySelector("#reading-status") || {}).textContent || ""), null, { timeout: 30000 });
    const b = await system.store.bundle(id);
    check("oneReadPressDownloadsAndTranscribesOnce", downloaded === 1 && transcriptions === 1);
    check("automaticallyStartsAndCompletesReading", b.run.processing.status === "complete", b.run.processing);
    check("sourceLinkPreserved", b.run.sourceUrl === LINK && b.run.import.url === LINK);
    check("downloadNotDescribedAsUpload", !b.run.import.file && b.run.import.source.acquisition === "youtube-audio" && /YouTube video/.test(b.run.provenance.voices.audioFoundBy));
    check("savedHashMatchesTranscribedBytes", b.run.import.source.sha256 === crypto.createHash("sha256").update(BYTES).digest("hex"));
    check("temporaryAudioRemoved", (await fs.readdir(path.join(root, "youtube-audio"))).length === 0);
    check("noPrivateStreamUrlInRecord", !/DO-NOT-STORE|googlevideo/.test(JSON.stringify(b)));
    check("actualPageNamesYouTubeAudio", /YouTube audio transcribed by Deepgram/.test(await page.locator("#runView").innerText()));
    await page.setViewportSize({ width: 390, height: 844 });
    check("phoneHasNoHorizontalScroll", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    check("noBrowserErrors", pageErrors.length === 0, pageErrors);
    check("oneResolveAndConsumeFromBrowser", requests.filter(r => r.method === "POST" && r.url === base + "/api/transcript/resolve").length === 1 && requests.filter(r => r.method === "POST" && /\/consume$/.test(r.url)).length === 1);
    console.log(JSON.stringify({ boundary: "offline synthetic services; real Chromium, UI, resolver, downloader, API and saved records", checks: report, total: Object.keys(report).length, modelCalls: ai.prompts.length }, null, 2));
  } finally {
    if (browser) await browser.close();
    if (system) { for (const job of system.reader.jobs.values()) job.controller.abort(); await Promise.all([...system.reader.jobs.values()].map(j => j.done)); }
    if (server) await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
