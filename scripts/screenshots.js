"use strict";
/* Regenerates the README screenshots in docs/screenshots/ from the real page in headless Chromium.
   No key and no network: the podcast feed is a local fixture, and the readings come from a stand-in responder whose
   text was written for these pictures (the page still labels it MOCK OUTPUT). The show, host and guest are invented.
   Needs Playwright:  npm install --no-save playwright && npx playwright install chromium;  then  npm run screenshots */
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("../server/app"), { createMockAI } = require("../server/ai"), { createResearch } = require("../server/research");

const TURNS = [
  ["HOST", "Welcome back to The Long Table. My guest today has a new book about morning routines. Why start with cold showers?"],
  ["GUEST", "Because nothing else wakes you up like that. Everybody who tries it for a month tells me their focus goes through the roof. It is the single best habit anyone can build."],
  ["HOST", "Everybody? That is a big word."],
  ["GUEST", "Fine, the people who write to me. Hundreds of them. And there was a study in the Netherlands where people who took cold showers called in sick twenty-nine percent less."],
  ["HOST", "Less sick, or more focused?"],
  ["GUEST", "Same thing, really. If you are not sick you get more done."],
  ["HOST", "So the claim is that cold showers make you more productive."],
  ["GUEST", "The claim is that you should try it before you dismiss it."],
  ["HOST", "Let us talk about the second chapter, the one about phones."],
  ["GUEST", "Phones are destroying our attention. The average person checks their phone ninety-six times a day."],
  ["HOST", "Where does that number come from?"],
  ["GUEST", "It is from a survey a few years ago. I think it is still about right."],
  ["HOST", "And the fix?"],
  ["GUEST", "Leave it in another room for the first hour. I did that and wrote this whole book in six months."],
  ["HOST", "That is one person."],
  ["GUEST", "It is one person who finished a book. Most people never do."],
];
const T = TURNS.map(([s, t]) => s + ": " + t).join("\n");
const lv = (hs, g5) => ({ hs, g5 });
const claim = (text, type, plain, basis, extra) => Object.assign({ text, speaker: "GUEST", type, plain, basis, status: "unchecked", wouldSettle: "", settle: lv("", "") }, extra || {});
const READINGS = {
  0: {
    asSaid: [{ turn: 1, speaker: "GUEST", quote: "Everybody who tries it for a month tells me their focus goes through the roof." }, { turn: 3, speaker: "GUEST", quote: "people who took cold showers called in sick 29% less" }],
    deflated: lv("The guest says cold showers improve focus. His support is messages from readers who tried it, and a Dutch study in which people who took cold showers missed fewer days of work.", "He says cold showers help you focus. His proof is letters from readers and a study about sick days."),
    fidelity: { grade: "faithful", notes: lv("", "") },
    jump: { present: true, pivot: "If you are not sick you get more done.", hs: "A study about fewer sick days is used as proof of better focus. Being at work more often is not the same as focusing better while there.", g5: "Missing fewer days of work is not the same as focusing better." },
    defense: lv("Fewer sick days can mean more working time, which is a real gain. The reader messages describe real experiences, even if they are not a study.", "Missing less work is still good. And his readers really did feel better."),
    revision: { jumpSurvives: "partly", hs: "The study may support “more days at work”, not “better focus”. The reader messages come only from people who chose to write in.", g5: "The study helps a little, but it is about sick days, not focus." },
    claims: [
      claim("Everybody who tries cold showers for a month reports much better focus.", "unsupported", lv("Everyone who tries cold showers for a month says they focus much better.", "Everyone who tries it says they focus better."), lv("Only people who wrote to him are counted; people it did not help would not write.", "He only hears from people who liked it.")),
      claim("A study in the Netherlands found people who took cold showers called in sick 29% less.", "fact", lv("A Dutch study found that people who took cold showers missed 29% fewer days of work.", "A study found cold-shower people missed fewer work days."), lv("A study can be found and read; the claim is about sick days, not focus.", "We can look up this study."), { wouldSettle: "The published trial and what it measured.", settle: lv("The published Dutch trial: how many people, how long, and whether it measured focus or only sick days.", "The study itself: what it measured."), expectedSources: ["academic_paper"], searchQuery: "cold shower sickness absence randomized trial Netherlands" }),
    ],
    judgments: { evidence: "weak", inference: "gap" },
  },
  8: {
    asSaid: [{ turn: 9, speaker: "GUEST", quote: "Phones are destroying our attention." }, { turn: 13, speaker: "GUEST", quote: "I did that and wrote this whole book in six months." }],
    deflated: lv("Phones hurt attention. A survey said people check their phones about 96 times a day. Keeping the phone in another room for the first hour worked for the author.", "Phones make it hard to pay attention. Putting the phone away for an hour helped him write his book."),
    fidelity: { grade: "faithful", notes: lv("", "") },
    jump: { present: true, pivot: "I did that and wrote this whole book in six months.", hs: "One person’s success is offered as proof that the fix works. It shows the fix can work for someone, not that it works for most people.", g5: "It worked for him. That does not mean it works for everyone." },
    defense: lv("He offers his own story as an example, and the advice costs nothing to try.", "He is just sharing what worked for him, and it is free to try."),
    revision: { jumpSurvives: "partly", hs: "As advice, it is reasonable to try. As proof that it works, one story is not enough.", g5: "Fine to try. Not proof." },
    claims: [
      claim("The average person checks their phone ninety-six times a day.", "fact", lv("The average person checks their phone about 96 times a day.", "People check their phones about 96 times a day."), lv("He names a survey but not which one; the number can be looked up.", "We can look for the survey."), { wouldSettle: "The survey behind the number.", settle: lv("The survey itself: who was asked, when, and how “checks” was counted.", "Find the survey and see how they counted."), expectedSources: ["academic_paper"], searchQuery: "smartphone checks per day survey average" }),
      claim("Leaving the phone in another room for the first hour helped him write a book in six months.", "interpretation", lv("Keeping his phone away for an hour each morning helped him finish his book in six months.", "Putting his phone away helped him write fast."), lv("It is his own account of his own year.", "Only he knows this.")),
    ],
    judgments: { evidence: "weak", inference: "gap" },
  },
};
function standIn() {
  const base = createMockAI();
  return Object.assign({}, base, {
    async sample(req) {
      const p = String(req.prompt || "");
      if (p.startsWith("You are a deflation reader") && !p.startsWith("You are a deflation reader grading ONE claim")) {
        const first = Number((/^\[(\d+)\] /m.exec(p) || [])[1]);
        const data = READINGS[first];
        if (data) return { data: JSON.parse(JSON.stringify(data)), text: JSON.stringify(data), usage: null, model: "mock", requestId: "shot_" + first, stopReason: "end_turn" };
      }
      if (p.startsWith("Split this transcript")) {
        const data = { passages: [{ title: "Cold showers and focus", turnStart: 0, turnEnd: 7, stake: "Whether cold showers make people more productive." }, { title: "Phones and attention", turnStart: 8, turnEnd: 15, stake: "Whether keeping the phone away helps people focus." }] };
        return { data, text: JSON.stringify(data), usage: null, model: "mock", requestId: "shot_segment", stopReason: "end_turn" };
      }
      if (/^Below are the (full )?results of deflating/.test(p)) {
        const data = { patterns: [{ title: lv("One person’s result stands in for a rule", "One story used as proof"), body: lv("Both times, a result that holds for some people (readers who wrote in, the author himself) is presented as what will happen to anyone.", "Twice, he takes what worked for a few people and says it works for everyone."), passages: ["p001", "p002"] }], survived: lv("Two habits that are cheap to try, and one study worth reading for what it actually measured.", "Two free things to try, and one study to read.") };
        return { data, text: JSON.stringify(data), usage: null, model: "mock", requestId: "shot_patterns", stopReason: "end_turn" };
      }
      return base.sample(req);
    },
  });
}

const VTT = "WEBVTT\n\n" + TURNS.map(([s, t], i) => "00:00:" + String(i * 3).padStart(2, "0") + ".000 --> 00:00:" + String(i * 3 + 3).padStart(2, "0") + ".000\n<v " + s + ">" + t + "\n").join("\n");
const FEED = '<?xml version="1.0"?><rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>The Long Table</title><link>https://longtable.example/</link>' +
  '<item><title>Cold showers, phones, and the perfect morning</title><guid>ep-41</guid><pubDate>Thu, 01 Oct 2026 10:00:00 GMT</pubDate><itunes:duration>3120</itunes:duration><enclosure url="https://cdn.longtable.example/41.mp3" type="audio/mpeg"/><podcast:transcript url="https://longtable.example/41.vtt" type="text/vtt"/></item>' +
  '<item><title>Why we stopped trusting experts</title><guid>ep-40</guid><pubDate>Thu, 24 Sep 2026 10:00:00 GMT</pubDate><itunes:duration>4380</itunes:duration><enclosure url="https://cdn.longtable.example/40.mp3" type="audio/mpeg"/></item>' +
  '<item><title>The four-day week, a year later</title><guid>ep-39</guid><pubDate>Thu, 17 Sep 2026 10:00:00 GMT</pubDate><itunes:duration>2700</itunes:duration><enclosure url="https://cdn.longtable.example/39.mp3" type="audio/mpeg"/><podcast:transcript url="https://longtable.example/39.vtt" type="text/vtt"/></item></channel></rss>';
const fakeFetch = async url => {
  const u = String(url), res = (status, body, type) => ({ status, url: u, headers: { get: k => /content-type/i.test(k) ? type || "text/plain" : null }, text: async () => body });
  if (u === "https://longtable.example/feed.xml") { await new Promise(r => setTimeout(r, 300)); return res(200, FEED, "application/rss+xml"); }
  if (u === "https://longtable.example/41.vtt") return res(200, VTT, "text/vtt");
  return res(404, "not found");
};

(async () => {
  const { chromium } = require("playwright");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-shots-")), out = path.join(__dirname, "..", "docs", "screenshots");
  fs.mkdirSync(out, { recursive: true });
  const system = createApp({ dataDir: dir, ai: standIn(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), fetch: fakeFetch, run: async () => ({ code: -1, out: "", err: "ENOENT" }), env: {}, envPath: path.join(dir, ".env"), examplesDir: path.join(dir, "no-examples") });
  await system.ready;
  const server = await new Promise(r => { const s = system.app.listen(0, "127.0.0.1", () => r(s)); });
  const browser = await chromium.launch({ headless: true });
  const ready = page => page.waitForFunction(() => { const s = document.querySelector("#reading-status"); return s && /Your reading is ready/.test(s.textContent); }, null, { timeout: 60000 });
  try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 2 });
    await page.goto("http://127.0.0.1:" + server.address().port); await page.waitForSelector("#f-text");
    await page.locator("#newRun").click().catch(() => {});
    await page.screenshot({ path: path.join(out, "1-start.png") });
    // a podcast link: the show's episodes, then the transcript fetched and the reading started in one action
    await page.fill("#f-text", "https://longtable.example/feed.xml");
    await page.locator("#stage-intake .btn.primary").click();
    await page.waitForSelector("#stage-intake .episodes .btn.ep", { timeout: 20000 });
    await page.locator("#stage-intake").screenshot({ path: path.join(out, "2-podcast.png") });
    await page.locator("#stage-intake .episodes .btn.ep").first().click();
    await ready(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    // the top bar sticks to the window; for pictures of a single card it stays in its place instead
    await page.addStyleTag({ content: ".top{position:static !important}" });
    const card = page.locator(".card").first();
    await card.locator("header button:has-text('Quotes')").click();
    await card.screenshot({ path: path.join(out, "3-card.png") });
    await card.locator("header button:has-text('Quotes')").click();
    // the same card at the fifth-grade level, on a phone
    await page.setViewportSize({ width: 390, height: 844 });
    await card.locator("header button:has-text('Fifth grade')").click();
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: path.join(out, "4-phone-fifth-grade.png") });
    console.log("wrote", fs.readdirSync(out).join(", "));
  } finally {
    for (const job of system.reader.jobs.values()) job.controller.abort();
    await Promise.all([...system.reader.jobs.values()].map(j => j.done));
    await browser.close(); await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
