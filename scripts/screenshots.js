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
/* Written to the reading-7 contract (0.15): what the speaker says, with his own hedges; what in the passage supports it
   and how far; what it does not show, stated flatly; nothing supplied on the speaker's behalf or against him. (The
   guest himself narrows "everybody" to the people who write to him, so the letters are described that way.) */
const READINGS = {
  0: {
    asSaid: [{ turn: 1, speaker: "GUEST", quote: "Everybody who tries it for a month tells me their focus goes through the roof." }, { turn: 3, speaker: "GUEST", quote: "people who took cold showers called in sick twenty-nine percent less" }, { turn: 7, speaker: "GUEST", quote: "you should try it before you dismiss it" }],
    deflated: lv("The guest says cold showers improve focus and calls them the best habit anyone can build. His reasons are messages from readers who tried them for a month, and a Dutch study in which people who took cold showers called in sick 29% less. When pressed, he narrows his claim to “try it before you dismiss it.”",
      "He says cold showers help people focus and are the best habit there is. He points to messages from readers who tried it, and to a study where people who took cold showers called in sick 29% less. Later he says only that people should try it."),
    fidelity: { grade: "faithful", notes: lv("", "") },
    supports: lv("Two reasons are given. Messages from readers who tried cold showers for a month and wrote to him, which he says number in the hundreds; that supports that some people who tried it report better focus. A Dutch study, as he describes it, in which people who took cold showers called in sick 29% less; that supports a difference in sick days, in that study. When the host asks, he says the claim he will stand on is that people should try it before dismissing it.",
      "He gives two reasons. Hundreds of readers who tried it wrote to say their focus got better. That shows some people who tried it say it helped. A study, as he tells it, found people who took cold showers called in sick 29% less. That shows a difference in sick days in that study. When asked, he says his real point is that people should try it."),
    notShown: lv("The passage does not show that cold showers improve focus for people in general: the messages come from readers who chose to write, and nothing is said about people who tried it and did not. The study, as he describes it, measured sick days, not focus; his reply that the two are “the same thing, really” is asserted, not shown. The study itself is named by country only, so its size, length and measure are not in the passage.",
      "It does not show that cold showers help most people focus. The letters come from people who chose to write. We hear nothing about people who tried it and did not write. The study counted sick days, not focus. He says those are the same thing, but he does not show it. We are not told how big or long the study was."),
    open: lv("", ""),
    claims: [
      claim("Everybody who tries it for a month tells me their focus goes through the roof.", "claim", lv("He says everyone who tries cold showers for a month tells him their focus improves a lot; he later narrows this to the people who write to him.", "He says everyone who tries it for a month tells him they focus much better. Later he says he means the people who write to him."), lv("The support is messages from readers who chose to write. The passage gives no count of people who tried it and did not write.", "His proof is letters from people who chose to write. We don't hear from people who didn't.")),
      claim("There was a study in the Netherlands where people who took cold showers called in sick twenty-nine percent less.", "claim", lv("He says a study in the Netherlands found that people who took cold showers called in sick 29% less.", "He says a study in the Netherlands found that people who took cold showers called in sick 29% less often."), lv("A study is named but not cited; it can be looked up. As described, it measured sick days.", "The study can be looked up. It counted sick days."), { wouldSettle: "The published trial and what it measured.", settle: lv("The published Dutch trial: how many people, for how long, and whether it measured focus or only sick days.", "The study itself: who was in it and what it counted."), expectedSources: ["academic_paper"], searchQuery: "cold shower sickness absence randomized trial Netherlands" }),
    ],
    judgments: { evidence: "weak", inference: "gap" },
  },
  8: {
    asSaid: [{ turn: 9, speaker: "GUEST", quote: "Phones are destroying our attention." }, { turn: 11, speaker: "GUEST", quote: "It is from a survey a few years ago. I think it is still about right." }, { turn: 13, speaker: "GUEST", quote: "I did that and wrote this whole book in six months." }],
    deflated: lv("The guest says phones are destroying attention. He cites a survey figure of about 96 phone checks a day, from a few years ago, which he thinks is still about right. His fix is to leave the phone in another room for the first hour; he did that and wrote his book in six months.",
      "He says phones are hurting our attention. He remembers a survey that said people check their phones about 96 times a day, and he thinks that is still close. His tip is to keep the phone in another room for the first hour. He did that and wrote his book in six months."),
    fidelity: { grade: "faithful", notes: lv("", "") },
    supports: lv("For the claim about attention, the passage offers one figure: about 96 phone checks a day, from a survey he dates to a few years ago and thinks is still about right. That supports, at most, that people check their phones often. For the fix, it offers his own case: he kept his phone in another room for the first hour and wrote his book in six months. That supports that the habit was workable for him.",
      "For the big claim, he gives one number: people check their phones about 96 times a day, from a survey a few years ago that he thinks is still close. That shows people check their phones a lot. For his tip, he gives his own story: he kept his phone away for an hour each morning and wrote his book in six months. That shows it worked for him."),
    notShown: lv("How often people check their phones does not show that phones are destroying attention; no measure of attention is in the passage. The survey is not identified, and by his own account it is a few years old. One person’s book does not show that the first-hour rule works for others, or that the rule, rather than anything else, produced the book.",
      "Checking a phone a lot is not the same as losing attention, and nothing here measures attention. We are not told which survey, and he says it is a few years old. One person finishing a book does not show the rule works for other people, or that the rule is why he finished."),
    open: lv("", ""),
    claims: [
      claim("The average person checks their phone ninety-six times a day.", "claim", lv("He says the average person checks their phone about 96 times a day, citing a survey from a few years ago.", "He says people check their phones about 96 times a day. He got that from a survey a few years ago."), lv("He names a survey but not which one; he says it is a few years old.", "He doesn't say which survey."), { wouldSettle: "The survey behind the number.", settle: lv("The survey itself: who was asked, when, and how a “check” was counted.", "Find the survey and see how they counted."), expectedSources: ["survey_report"], searchQuery: "smartphone checks per day survey average" }),
      claim("Phones are destroying our attention.", "claim", lv("He says phones are seriously harming people's attention.", "He says phones are badly hurting how well people pay attention."), lv("No support is given in this passage beyond the survey figure about checking.", "He gives no proof here except the number about checking phones."), { wouldSettle: "Research on phone use and attention.", settle: lv("Studies that measure attention before and after changes in phone use.", "Studies that test attention when people use their phones less."), expectedSources: ["academic_paper"], searchQuery: "smartphone use attention span longitudinal study" }),
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
    // the disclosure triangle turns in 0.15 s; a picture taken sooner catches it half way round
    await page.waitForTimeout(400);
    // from the Evidence heading to the end of "Quoted in this reading", in page coordinates (reading-7 raises no separate
    // concern, so there is no reasoning section; the claims follow below)
    const clip = await card.evaluate(c => { const ev = c.querySelector("details.evidence").getBoundingClientRect(), secs = [...c.querySelectorAll("details.evidence .ev-sec")], rs = (secs.find(s => /Quoted in this reading/.test(s.textContent)) || secs[0]).getBoundingClientRect(); return { x: ev.left - 24, y: ev.top + scrollY - 8, width: ev.width + 48, height: rs.bottom - ev.top + 24 }; });
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
