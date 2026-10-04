"use strict";
/* Regenerates the README and guide pictures in docs/screenshots/ from the real page in headless Chromium.
   No key and no network: the podcast feed, the video search and its captions are local fixtures, and the readings come
   from a stand-in responder whose text was written for these pictures (the page labels it Mock output). The show, host
   and guest are invented. Needs Playwright:  npm install --no-save playwright;  then  npm run screenshots
   (DEFLATE_CHROMIUM_EXECUTABLE points it at a Chromium already installed). */
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
/* Written to the reading-2 contract: the reasons actually given, the fair reading, then a final assessment that names
   what remains. (The self-selected letters are described as people who chose to write, not as proof of anything about
   the people who did not.) */
const READINGS = {
  0: {
    asSaid: [{ turn: 1, speaker: "GUEST", quote: "Everybody who tries it for a month tells me their focus goes through the roof." }, { turn: 3, speaker: "GUEST", quote: "people who took cold showers called in sick twenty-nine percent less" }, { turn: 7, speaker: "GUEST", quote: "you should try it before you dismiss it" }],
    deflated: lv("The guest says cold showers improve focus and calls them the best habit anyone can build. His reasons are messages from readers who tried them for a month, and a Dutch study in which people who took cold showers called in sick 29% less. When pressed, he narrows his claim to “try it before you dismiss it.”",
      "He says cold showers help people focus and are the best habit there is. He points to messages from readers who tried it, and to a study where people who took cold showers called in sick 29% less. Later he says only that people should try it."),
    fidelity: { grade: "faithful", notes: lv("", "") },
    jump: { present: true, pivot: "If you are not sick you get more done.", hs: "A study about sick days is used as evidence about focus. Fewer sick days does not show better focus at work.", g5: "Missing fewer work days is not the same as focusing better." },
    defense: lv("Read as advice, the claim is modest: a cheap habit that some readers say helped them, worth trying. Fewer sick days could also mean more time at work, which is a real gain.", "If he means “give it a try,” that is a small claim. Missing fewer work days could mean more time to get work done."),
    revision: { jumpSurvives: "partly", hs: "He is hearing from people who chose to write; other people may have had different results. The study, as he describes it, measured sick days, not focus. As a suggestion to try, the advice stands; as proof that cold showers improve focus for anyone, the reasons fall short.", g5: "He hears from people who chose to write to him. Other people may have had different results. The study counted sick days, not focus. So it is fine as something to try, but it does not show that cold showers help everyone focus." },
    claims: [
      claim("Everybody who tries it for a month tells me their focus goes through the roof.", "claim", lv("Everyone who tries cold showers for a month tells him their focus improves a lot. He later narrows this to the people who write to him.", "Everyone who tries it for a month tells him they focus much better. Later he says he means the people who write to him."), lv("The support is messages from readers who chose to write. The passage gives no count of people who tried it and did not write.", "His proof is letters from people who chose to write. We don't hear from people who didn't.")),
      claim("There was a study in the Netherlands where people who took cold showers called in sick twenty-nine percent less.", "claim", lv("A study in the Netherlands found that people who took cold showers called in sick 29% less.", "A study in the Netherlands found that people who took cold showers missed 29% fewer work days."), lv("A study is named but not cited; it can be looked up. As described, it measured sick days.", "The study can be looked up. It counted sick days."), { wouldSettle: "The published trial and what it measured.", settle: lv("The published Dutch trial: how many people, for how long, and whether it measured focus or only sick days.", "The study itself: who was in it and what it counted."), expectedSources: ["academic_paper"], searchQuery: "cold shower sickness absence randomized trial Netherlands" }),
    ],
    judgments: { evidence: "weak", inference: "gap" },
  },
  8: {
    asSaid: [{ turn: 9, speaker: "GUEST", quote: "Phones are destroying our attention." }, { turn: 11, speaker: "GUEST", quote: "It is from a survey a few years ago. I think it is still about right." }, { turn: 13, speaker: "GUEST", quote: "I did that and wrote this whole book in six months." }],
    deflated: lv("The guest says phones are destroying attention. He cites a survey figure of about 96 phone checks a day, from a few years ago, which he thinks is still about right. His fix is to leave the phone in another room for the first hour; he did that and wrote his book in six months.",
      "He says phones are hurting our attention. He remembers a survey that said people check their phones about 96 times a day, and he thinks that is still close. His tip is to keep the phone in another room for the first hour. He did that and wrote his book in six months."),
    fidelity: { grade: "faithful", notes: lv("", "") },
    jump: { present: true, pivot: "I did that and wrote this whole book in six months.", hs: "One person’s result is offered as evidence that the fix works. It shows the habit can work for someone, not that it works for most people.", g5: "It worked for him. That does not show it works for most people." },
    defense: lv("As personal advice, the suggestion costs little, and his own result shows it can work for at least one person.", "It is free to try, and it did work for him."),
    revision: { jumpSurvives: "partly", hs: "His own result shows the habit can work for someone, not that it works for most people. The survey figure is unsourced and, by his account, a few years old. The broad claim that phones are “destroying” attention is not supported by these reasons; the advice to try an hour without the phone stands as a suggestion.", g5: "His story shows it can work for one person. We don't know where the survey number came from, and it is a few years old. So the big claim about phones is not shown here. Trying an hour without your phone is still a fair idea to try." },
    claims: [
      claim("The average person checks their phone ninety-six times a day.", "claim", lv("The average person checks their phone about 96 times a day, according to a survey from a few years ago.", "People check their phones about 96 times a day, a survey said a few years ago."), lv("He names a survey but not which one; he says it is a few years old.", "He doesn't say which survey."), { wouldSettle: "The survey behind the number.", settle: lv("The survey itself: who was asked, when, and how a “check” was counted.", "Find the survey and see how they counted."), expectedSources: ["survey_report"], searchQuery: "smartphone checks per day survey average" }),
      claim("Phones are destroying our attention.", "claim", lv("Phones are seriously harming people's attention.", "Phones are badly hurting how well people pay attention."), lv("No support is given in this passage beyond the survey figure about checking.", "He gives no proof here except the number about checking phones."), { wouldSettle: "Research on phone use and attention.", settle: lv("Studies that measure attention before and after changes in phone use.", "Studies that test attention when people use their phones less."), expectedSources: ["academic_paper"], searchQuery: "smartphone use attention span longitudinal study" }),
      claim("Leave it in another room for the first hour.", "value", lv("He recommends keeping the phone in another room for the first hour of the day.", "He suggests keeping your phone in another room for the first hour."), lv("A recommendation, supported by his own experience.", "This is his advice, from what worked for him.")),
    ],
    judgments: { evidence: "weak", inference: "gap" },
  },
};
const OVERVIEW = { patterns: [{ title: lv("Evidence about a few people stands in for a general rule", "A few people's results are treated as a rule"), body: lv("In both passages the final assessment finds the same gap: results from people who chose to write in, or from the author himself, are offered as if they showed what will happen for anyone.", "Both times, what happened to a few people is used to say what will happen to everyone."), passages: ["p001", "p002"] }], survived: lv("Two habits that are cheap to try, and a named study worth reading for what it actually measured.", "Two free things to try, and one study to read.") };
function standIn() {
  const base = createMockAI();
  const answer = (data, id) => ({ data: JSON.parse(JSON.stringify(data)), text: JSON.stringify(data), usage: null, model: "mock", requestId: "shot_" + id, stopReason: "end_turn" });
  return Object.assign({}, base, {
    async sample(req) {
      const p = String(req.prompt || "");
      if (p.startsWith("Help a reader understand this passage accurately.") && !p.includes("This is ONE claim")) {
        const first = Number((/PASSAGE \(turns (\d+)/.exec(p) || [])[1]);
        if (READINGS[first] && /Passage title: (Cold showers and focus|Phones and attention)/.test(p)) return answer(READINGS[first], first);
      }
      if (p.startsWith("Split this transcript") && p.includes("The Long Table")) return answer({ passages: [{ title: "Cold showers and focus", turnStart: 0, turnEnd: 7, stake: "Whether cold showers make people more productive." }, { title: "Phones and attention", turnStart: 8, turnEnd: 15, stake: "Whether keeping the phone away helps people focus." }] }, "segment");
      if (p.startsWith("Below are the final readings of 2 passages") && p.includes("Cold showers and focus")) return answer(OVERVIEW, "overview");
      return base.sample(req);
    },
  });
}

const VTT = "WEBVTT\n\n" + TURNS.map(([s, t], i) => "00:00:" + String(i * 3).padStart(2, "0") + ".000 --> 00:00:" + String(i * 3 + 3).padStart(2, "0") + ".000\n<v " + s + ">" + t + "\n").join("\n");
const FEED = '<?xml version="1.0"?><rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>The Long Table</title><link>https://longtable.example/</link>' +
  '<item><title>Cold showers, phones, and the perfect morning</title><guid>ep-41</guid><pubDate>Thu, 01 Oct 2026 10:00:00 GMT</pubDate><itunes:duration>3120</itunes:duration><enclosure url="https://cdn.longtable.example/41.mp3" type="audio/mpeg"/><podcast:transcript url="https://longtable.example/41.vtt" type="text/vtt"/></item>' +
  '<item><title>Why we stopped trusting experts</title><guid>ep-40</guid><pubDate>Thu, 24 Sep 2026 10:00:00 GMT</pubDate><itunes:duration>4380</itunes:duration><enclosure url="https://cdn.longtable.example/40.mp3" type="audio/mpeg"/></item></channel></rss>';
const fakeFetch = async url => {
  const u = String(url), res = (status, body, type) => ({ status, url: u, headers: { get: k => /content-type/i.test(k) ? type || "text/plain" : null }, text: async () => typeof body === "string" ? body : JSON.stringify(body) });
  if (u === "https://longtable.example/feed.xml") return res(200, FEED, "application/rss+xml");
  if (u === "https://longtable.example/41.vtt") return res(200, VTT, "text/vtt");
  if (/youtube\.com\/oembed/.test(u)) return res(200, { title: "The Long Table — Why we stopped trusting experts (full episode)", author_name: "Long Table Clips" }, "application/json");
  return res(404, "not found");
};
// episode 40 has no transcript; a video search finds a full upload with a matching title and length, with captions
const fakeYtdlp = async (cmd, a) => {
  if (a[0] === "--version") return { code: 0, out: "2026.09.01\n", err: "" };
  const last = String(a[a.length - 1]);
  if (last.startsWith("ytsearch")) return { code: 0, out: "LongTable40\tThe Long Table — Why we stopped trusting experts (full episode)\tLong Table Clips\t4296\n", err: "" };
  if (a.includes("--skip-download")) { if (a.includes("--write-auto-subs")) fs.writeFileSync(a[a.indexOf("-o") + 1].replace("%(id)s", "LongTable40.en.json3"), JSON.stringify({ events: [{ segs: [{ utf8: "welcome back to the long table today we are talking about trust and experts and why so many people stopped listening to them ".repeat(12) }] }] })); return { code: 0, out: "", err: "" }; }
  return { code: 1, out: "", err: "?" };
};

(async () => {
  const { chromium } = require("playwright");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-shots-")), out = path.join(__dirname, "..", "docs", "screenshots");
  fs.mkdirSync(out, { recursive: true });
  const system = createApp({ dataDir: dir, ai: standIn(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }), fetch: fakeFetch, run: fakeYtdlp, env: {}, envPath: path.join(dir, ".env"), examplesDir: path.join(dir, "no-examples") });
  await system.ready;
  const server = await new Promise(r => { const s = system.app.listen(0, "127.0.0.1", () => r(s)); });
  const browser = await chromium.launch({ headless: true, ...(process.env.DEFLATE_CHROMIUM_EXECUTABLE ? { executablePath: process.env.DEFLATE_CHROMIUM_EXECUTABLE } : {}) });
  const ready = page => page.waitForFunction(() => /Your reading is ready/.test((document.querySelector("#reading-status") || {}).textContent || ""), null, { timeout: 60000 });
  const root = "http://127.0.0.1:" + server.address().port;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
    await page.goto(root); await page.waitForSelector("#f-text");
    await page.screenshot({ path: path.join(out, "1-start.png") });
    // a show's feed: pick the episode with a transcript; the reading starts by itself
    await page.fill("#f-text", "https://longtable.example/feed.xml"); await page.locator("#readThis").click();
    await page.waitForSelector("#intake .episodes .btn.ep", { timeout: 20000 });
    await page.locator("#intake .episodes .btn.ep").first().click(); await ready(page);
    await page.addStyleTag({ content: ".top{position:static !important} #say{display:none!important}" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, "2-reading.png") });
    const card = page.locator(".card").first();
    await card.locator("details.evidence > summary").click();
    // from the Evidence heading to the end of "Reasoning behind this reading", in page coordinates
    const clip = await card.evaluate(c => { const ev = c.querySelector("details.evidence").getBoundingClientRect(), rs = c.querySelector("details.evidence .reasoning").getBoundingClientRect(); return { x: ev.left - 24, y: ev.top + scrollY - 8, width: ev.width + 48, height: rs.bottom - ev.top + 24 }; });
    await page.screenshot({ path: path.join(out, "3-evidence.png"), clip, fullPage: true });
    await card.locator("details.evidence > summary").click();
    await page.locator("#controlsBtn").click(); await page.waitForSelector("#controls:not([hidden])");
    await page.screenshot({ path: path.join(out, "4-controls.png") });
    await page.keyboard.press("Escape");
    // the exception: a video found by searching for the episode's title and length, checked against the episode
    await page.locator("#readingsBtn").click(); await page.locator("#newRun").click();
    await page.fill("#f-text", "https://longtable.example/feed.xml"); await page.locator("#readThis").click();
    await page.waitForSelector("#intake .episodes .btn.ep", { timeout: 20000 });
    await page.locator("#intake .episodes .btn.ep").nth(1).click(); await ready(page);
    await page.addStyleTag({ content: ".top{position:static !important} #say{display:none!important}" });
    await page.locator(".notice.source button:has-text('Check source')").click();
    const head = await page.locator("#run-head").boundingBox(), notices = await page.locator("#notices").boundingBox();
    await page.screenshot({ path: path.join(out, "5-source-check.png"), clip: { x: head.x - 24, y: head.y - 16, width: head.width + 48, height: notices.y + notices.height - head.y + 32 } });
    await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, "9-phone-source-check.png"), fullPage: false });
    await page.setViewportSize({ width: 1280, height: 860 });
    // a phone: the same reading at the fifth-grade level, and Controls
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#readingsBtn").click(); await page.locator("#runList button").filter({ hasText: "Cold showers" }).first().click();
    await page.waitForSelector(".card");
    await page.addStyleTag({ content: ".top{position:static !important} #say{display:none!important}" });
    const c2 = page.locator(".card").first();
    await c2.locator(".levels button:has-text('Fifth grade')").click();
    await c2.scrollIntoViewIfNeeded();
    await c2.screenshot({ path: path.join(out, "6-phone-fifth-grade.png") });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator("#controlsBtn").click(); await page.waitForSelector("#controls:not([hidden])");
    await page.screenshot({ path: path.join(out, "7-phone-controls.png") });
    await page.keyboard.press("Escape");
    await page.goto(root + "/#"); await page.locator("#readingsBtn").click(); await page.locator("#newRun").click();
    await page.screenshot({ path: path.join(out, "8-phone-start.png") });
    console.log("wrote", fs.readdirSync(out).join(", "));
  } finally {
    for (const job of system.reader.jobs.values()) job.controller.abort();
    await Promise.all([...system.reader.jobs.values()].map(j => j.done));
    await browser.close(); await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
