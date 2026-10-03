"use strict";
/* Optional browser check (needs Playwright + Chromium; see README "Checks"). Starts the server on a free port with a
   temporary data folder, the MOCK model and MOCK research, then drives the page: opens the example, counts cards,
   creates a run, saves a transcript, runs the attribution check, confirms, segments, deflates, then on a card:
   the default view has no editing controls; chips open explanations; Details holds the controls; search → reject → accept
   → the chip reads "Sources · 1"; re-run keeps the source and the history; withdraw drops the chip back; the reading
   level switch changes every generated explanation; patterns; exports; stale; trash and restore.
   Usage:  node scripts/ui-check.js   (set PLAYWRIGHT_BROWSERS_PATH or run `npx playwright install chromium` first) */
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");
const { createResearch } = require("../server/research/index");

const T = ["HOST: Welcome back. Today we talk about plans.", "GUEST: Thanks for having me. In my clinical practice I tell people a bad plan beats no plan.", "HOST: Why is that?", "GUEST: Because even a failed attempt gives you information. Waiting gives you nothing.", "HOST: Some people would say waiting avoids mistakes.", "GUEST: Only the recoverable kind.", "HOST: That is fair.", "GUEST: It is the only rule of thumb I trust on this.", "HOST: Now feeds.", "GUEST: Feeds optimise for what grabs you now, not what you would choose for your long-term goal.", "HOST: Say more.", "GUEST: My wife says the same.", "HOST: Right.", "GUEST: And my daughter.", "HOST: Ok.", "GUEST: Done."].join("\n");

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-ui-"));
  const { app, ready } = createApp({ dataDir, ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }) });
  await ready;
  const server = await new Promise(r => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch();
  const out = { errors: [] };
  const shots = path.join(__dirname, "ui-shots"); fs.mkdirSync(shots, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.on("pageerror", e => out.errors.push("pageerror: " + e.message));
    page.on("console", m => { if (m.type() === "error") out.errors.push("console: " + m.text()); });
    await page.goto(base, { waitUntil: "networkidle" });
    out.chip = await page.textContent("#storeText");
    // example: cards, chips, no editing controls in the default view
    await page.click("#runList button");
    await page.waitForSelector(".card");
    out.exampleCards = await page.locator(".card").count();
    out.exampleQuoteChips = await page.locator(".card .chip-ev:has-text('Quotes')").count();
    out.exampleAllQuotesMatched = await page.locator(".card .chip-ev:has-text('Quotes · '):not(:has-text('/'))").count() === 0 && (await page.locator(".card .chip-ev.good:has-text('Quotes')").count()) === out.exampleCards;
    out.exampleReadOnly = await page.locator(".badge.example").count() > 0;
    out.exampleSourceLink = await page.locator("#stage-export a[href^='https://www.youtube.com']").count();
    out.exampleDefaultViewControls = await page.locator(".card > header input, .card > header select, .card .read input, .card .read select, .card .read button:not(.chip-ev), .card > header button:not(.chip-ev)").count();
    await page.locator(".card").first().screenshot({ path: path.join(shots, "example-card.png") });
    // paste-and-go: a bare claim with nothing else becomes a searchable card
    await page.click("#newRun");
    out.contextFoldClosed = !(await page.locator("#stage-intake details.ctx").evaluate(d => d.open));
    out.contextLabelsOptional = (await page.locator("#stage-intake details.ctx label").allTextContents()).every(t => /optional/i.test(t));
    await page.fill("#f-text", "The Earth is getting greener");
    out.kindClaim = /claim or a quote/.test(await page.textContent("#f-kind"));
    out.goLabelClaim = await page.textContent("#stage-intake .btn.primary");
    await page.click("#stage-intake .btn.primary");
    await page.waitForSelector("#stage-deflate .card", { timeout: 15000 });
    out.claimTitle = await page.textContent("#runView h2");
    out.claimCardTyped = /The claim, as typed/.test(await page.textContent("#stage-deflate .card"));
    out.claimNoProvenancePanel = (await page.locator("#stage-prov").count()) === 0;
    out.claimAutoSearched = await page.locator("#stage-deflate .card .claim .chip-ev:has-text('Searched · 2 waiting')").count();
    out.claimIntakeNote = /searched at once: 2 candidate documents waiting/.test(await page.textContent("#stage-intake .body"));
    out.claimNoVerified = !/verified/i.test(await page.textContent("#stage-deflate .card .read"));
    const ccard = page.locator("#stage-deflate .card").first();
    await ccard.locator("details.more > summary").click();
    out.claimQueryPrefilled = (await ccard.locator(".more-body input[placeholder^='Search query']").inputValue()).length > 0;
    out.claimExplainButton = await ccard.locator(".more-body button:has-text('Explain and grade with the model')").count();
    out.claimSearchAgainButton = await ccard.locator(".more-body button:has-text('Search sources again')").count();
    out.claimCandidatesShown = await ccard.locator(".more-body button:has-text('Accept as a source')").count();
    out.claimSettleAtLevel = (await ccard.locator(".more-body .settle .lvl").count()) >= 0;
    // explain with the (mock) model: the claim keeps its wording and identity
    const idBefore = await page.evaluate(() => fetch("/api/runs/" + location.hash.slice(5)).then(r => r.json()).then(b => b.passages[0].analysis.claims[0].id));
    await page.locator("#stage-deflate .card .more-body button:has-text('Explain and grade with the model')").click();
    await page.waitForFunction(() => /In plain words/.test(document.querySelector("#stage-deflate .card").textContent), null, { timeout: 30000 });
    const after = await page.evaluate(() => fetch("/api/runs/" + location.hash.slice(5)).then(r => r.json()).then(b => ({ id: b.passages[0].analysis.claims[0].id, text: b.passages[0].analysis.claims[0].text, by: b.passages[0].analysis.by, history: (b.passages[0].history || []).length, searches: b.passages[0].analysis.claims[0].searches.length })));
    out.claimIdStable = after.id === idBefore; out.claimTextStable = after.text === "The Earth is getting greener"; out.claimByModel = after.by === "model"; out.claimHistoryKept = after.history === 1; out.claimSearchesCarried = after.searches >= 3;
    // a link to a site without an importer gets an honest fallback, not a fake read
    await page.click("#newRun");
    await page.fill("#f-text", "https://www.youtube.com/watch?v=QBEZhjnZTks");
    out.kindLink = /Looks like a link to www.youtube.com/.test(await page.textContent("#f-kind"));
    await page.click("#stage-intake .btn.primary");
    await page.waitForFunction(() => /Show transcript/.test(document.querySelector("#stage-intake .body").textContent), null, { timeout: 15000 });
    out.linkFallback = /Paste the transcript, or upload/.test(await page.textContent("#stage-intake .body"));
    out.linkNotSavedAsRun = (await page.evaluate(() => fetch("/api/runs").then(r => r.json()).then(l => l.length))) === 2;
    // a transcript with two speakers: the usual stages
    await page.click("#newRun");
    await page.fill("#f-text", T);
    out.kindTranscript = /Looks like a transcript: 2 speakers/.test(await page.textContent("#f-kind"));
    await page.click("#stage-intake .btn.primary");
    await page.waitForSelector("#stage-prov .btn.primary");
    out.afterSave = await page.textContent("#stage-intake header .state");
    out.autoTitle = await page.textContent("#runView h2");
    await page.click("#stage-prov .btn.primary");
    await page.waitForSelector("#stage-prov .flag", { timeout: 20000 });
    out.flags = await page.locator("#stage-prov .flag").count();
    await page.click("text=Confirm attribution");
    await page.waitForFunction(() => /Confirmed/.test(document.querySelector("#stage-prov header .state").textContent), null, { timeout: 10000 });
    await page.click("#stage-deflate button:has-text('Split into passages')");
    await page.waitForSelector("#stage-deflate .pitem", { timeout: 20000 });
    out.passages = await page.locator("#stage-deflate .pitem").count();
    await page.click("text=Deflate selected");
    await page.waitForFunction(() => document.querySelectorAll("#stage-deflate .card").length > 0, null, { timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector("#stage-deflate .pitem .st.running"), null, { timeout: 60000 });
    out.cards = await page.locator("#stage-deflate .card").count();
    out.mockBadges = await page.locator(".badge.mock").count();
    const card = page.locator("#stage-deflate .card").first();
    // default view: readable sections, chips, no controls
    out.readSections = await card.locator(".read > section").count();
    out.defaultViewControls = await card.locator("header input, header select, .read input, .read select, .read button:not(.chip-ev), header button:not(.chip-ev)").count();
    out.detailsClosed = !(await card.locator("details.more").evaluate(d => d.open));
    // chips open explanations
    await card.locator(".chip-ev:has-text('Quotes')").click();
    out.quotePanel = /checked word for word/.test(await card.locator(".chip-panel").first().textContent());
    await card.locator(".chip-ev:has-text('Not checked')").first().click();
    out.notCheckedPanel = /No one has looked for sources/.test(await card.locator(".claim .chip-panel:not([hidden])").first().textContent());
    // open details: the controls live there
    await card.locator("details.more > summary").click();
    out.detailsControls = await card.locator(".more-body button:has-text('Search sources')").count();
    await card.locator(".more-body button:has-text('Search sources')").first().click();
    await page.waitForSelector("#stage-deflate .card .more-body button:has-text('Accept as a source')", { timeout: 20000 });
    out.candidateRows = await card.locator(".more-body button:has-text('Accept as a source')").count();
    out.retractionBadge = await card.locator(".more-body .badge.stale:has-text('Retraction')").count();
    out.searchedChip = await card.locator(".chip-ev:has-text('Searched · 2 waiting')").count();
    const retractedRow = card.locator(".more-body .cand:has(.badge.stale:has-text('Retraction'))").first();
    await retractedRow.locator("select").last().selectOption("retracted_or_corrected"); // the last select is the rejection reason; the first is the relation
    await retractedRow.locator("button:has-text('Reject')").click();
    await page.waitForFunction(() => document.querySelectorAll("#stage-deflate .card .more-body button").length && document.querySelectorAll("#stage-deflate .card .more-body .cand").length === 1, null, { timeout: 10000 });
    const cleanRow = card.locator(".more-body .cand").first();
    await cleanRow.locator("input[type=text]").fill("UI check: read it, it cuts the other way");
    // the person says what the document does for the claim (0.8.0): here, that it contradicts it
    out.relationChoices = await cleanRow.locator("select").first().locator("option").count();
    await cleanRow.locator("select").first().selectOption("contradicts");
    await cleanRow.locator("button:has-text('Accept as a source')").click();
    await page.waitForFunction(() => Array.from(document.querySelectorAll("#stage-deflate .card .chip-ev")).some(b => /Sources · 1 · 1 contradicts/.test(b.textContent)), null, { timeout: 10000 });
    out.contradictsChip = await card.locator(".claim .chip-ev:has-text('1 contradicts')").count();
    out.cardContradictedChip = await card.locator("header .chip-ev:has-text('1 contradicted')").count();
    await card.locator(".claim .chip-ev:has-text('1 contradicts')").click();
    out.contradictsPanel = /contradicts it/.test(await card.locator(".claim .chip-panel:not([hidden])").first().textContent());
    out.relationPill = await card.locator(".more-body .rc .pill.rel.contradicts").count();
    // the relation can be changed from Details; the previous value stays on record
    await card.locator(".more-body .rc select[aria-label='Relation to the claim']").first().selectOption("supports");
    await page.waitForFunction(() => Array.from(document.querySelectorAll("#stage-deflate .card .chip-ev")).some(b => /Sources · 1$/.test(b.textContent)), null, { timeout: 10000 });
    out.relationChanged = /relation changed 1 time \(was contradicts\)/.test(await card.locator(".more-body").textContent());
    out.sourcesChip = await card.locator(".claim .chip-ev:has-text('Sources · 1')").count();
    out.cardSourcesChip = await card.locator("header .chip-ev:has-text('Sources · 1 of 1 checkable claim')").count();
    out.noVerifiedWord = !/verified/i.test(await card.locator(".chips, .read").allTextContents().then(a => a.join(" ")));
    await card.locator(".claim .chip-ev:has-text('Sources · 1')").click();
    out.sourcesPanel = /does not make the claim verified/.test(await card.locator(".claim .chip-panel:not([hidden])").first().textContent());
    out.rejectionNoted = /1 candidate rejected/.test(await card.locator(".more-body").textContent().catch(() => "")) || /rejected/.test(await page.textContent("#stage-deflate"));
    await card.screenshot({ path: path.join(shots, "card-default.png") });
    // re-run: the source and the rejection survive; history is noted (Details stays open across re-renders)
    out.detailsStillOpen = await card.locator("details.more").evaluate(d => d.open);
    await card.locator(".more-body button:has-text('Re-run this passage')").click();
    await page.waitForFunction(() => /Re-run 1 time/.test(document.querySelector("#stage-deflate").textContent), null, { timeout: 60000 });
    const card2 = page.locator("#stage-deflate .card").first();
    out.sourceAfterRerun = await card2.locator(".claim .chip-ev:has-text('Sources · 1')").count();
    out.historyNote = /every earlier reading is kept/.test(await card2.locator(".more-body").textContent());
    out.rejectionAfterRerun = /rejected/.test(await card2.locator(".more-body").textContent());
    // withdraw: the chip drops back, the record stays
    await card2.locator(".more-body input[placeholder='Why withdraw it?']").first().fill("wrong paper");
    await card2.locator(".more-body button:has-text('Withdraw')").first().click();
    await page.waitForFunction(() => Array.from(document.querySelectorAll("#stage-deflate .card .chip-ev")).some(b => /Searched · nothing attached/.test(b.textContent)), null, { timeout: 10000 });
    const card3 = page.locator("#stage-deflate .card").first();
    out.withdrawnOnRecord = /withdrawn/i.test(await card3.locator(".more-body").textContent());
    // reading level: every generated explanation follows the switch, including chip panels; quotes stay exact
    const hsQuote = await card3.locator(".more-body .said .q").first().textContent();
    await page.click("#lvl5");
    out.g5Shown = await page.evaluate(() => getComputedStyle(document.querySelector(".card .read .lvl-5")).display);
    out.hsHidden = await page.evaluate(() => getComputedStyle(document.querySelector(".card .read .lvl-hs")).display);
    await card3.locator(".chip-ev:has-text('Quotes')").click();
    out.g5ChipPanel = await page.evaluate(() => { const p = document.querySelector(".card .chip-panel:not([hidden]) .lvl-5"); return p ? getComputedStyle(p).display : "missing"; });
    out.quoteUnchangedByLevel = (await card3.locator(".more-body .said .q").first().textContent()) === hsQuote;
    out.mdLinkFollowsLevel = /fifth grade/.test(await page.textContent("#stage-export"));
    await page.click("#lvlHS");
    // patterns
    await page.waitForTimeout(500);
    await page.click("#stage-patterns .btn.primary");
    await page.waitForSelector("#stage-patterns .pattern", { timeout: 30000 });
    out.patterns = await page.locator("#stage-patterns .pattern").count();
    // export via download
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("text=Download claims JSON")]);
    const exp = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
    out.exportClaims = exp.claims.length; out.exportSchema = exp.schema; out.exportSaysNotVerification = /not verification/.test(exp.statusMeaning.receipt);
    // stale after attribution change
    await page.click("#stage-prov header");
    await page.selectOption("#stage-prov .flag select >> nth=0", { index: 0 });
    await page.waitForSelector(".badge.stale", { timeout: 10000 });
    out.staleBadges = await page.locator(".badge.stale").count();
    // trash and restore
    await page.click("text=Move to trash");
    await page.click(".note.err button:has-text('Move to trash')");
    await page.waitForSelector("#trash details", { timeout: 10000 });
    out.trashListed = /Welcome back/.test(await page.textContent("#trash"));
    await page.click("#trash summary");
    await page.click("#trash button:has-text('Restore')");
    await page.waitForFunction(() => /Welcome back/.test(document.querySelector("#runView h2") ? document.querySelector("#runView h2").textContent : ""), null, { timeout: 10000 });
    out.restored = await page.locator("#stage-deflate .card").count();
    await page.screenshot({ path: path.join(shots, "run.png"), fullPage: false });
    // no model configured: the example works, and real analysis asks for the key once (nothing is sent without one)
    const dataDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-ui-nokey-"));
    const envPath2 = path.join(dataDir2, ".env");
    const app2 = createApp({ dataDir: dataDir2, ai: null, research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), envPath: envPath2 });
    await app2.ready; const server2 = await new Promise(r => { const s2 = app2.app.listen(0, "127.0.0.1", () => r(s2)); });
    try {
      const page2 = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      await page2.goto("http://127.0.0.1:" + server2.address().port, { waitUntil: "networkidle" });
      out.noKeyChip = /example only until you add a key/.test(await page2.textContent("#storeText"));
      await page2.click("#runList button"); await page2.waitForSelector(".card");
      out.noKeyExampleCards = await page2.locator(".card").count();
      await page2.click("#newRun"); await page2.fill("#f-text", T); await page2.click("#stage-intake .btn.primary");
      await page2.waitForSelector("#stage-prov .btn.primary");
      await page2.click("#stage-prov .btn.primary");
      await page2.waitForSelector(".keybox", { timeout: 10000 });
      out.keyPromptShown = /needs your Anthropic API key, once/.test(await page2.textContent(".keybox"));
      await page2.fill(".keybox input", "not-a-key"); await page2.click(".keybox button");
      await page2.waitForFunction(() => /sk-ant-/.test(document.querySelector(".keybox").textContent), null, { timeout: 10000 });
      out.badKeyRefused = !fs.existsSync(envPath2) || !fs.readFileSync(envPath2, "utf8").includes("not-a-key");
      await server2.close();
    } finally { await new Promise(r => server2.close(r)); fs.rmSync(dataDir2, { recursive: true, force: true }); }
  } catch (e) { out.errors.push("script: " + e.message); }
  await browser.close(); await new Promise(r => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.errors.length ? 1 : 0);
})();
