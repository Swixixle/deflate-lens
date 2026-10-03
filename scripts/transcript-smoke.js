"use strict";
/* Live check of the transcript chain against the real services. Writes nothing to your data folder.

   Run:   npm run transcript-smoke              (Apple lookup, two feeds, one YouTube video; needs network)
          npm run transcript-smoke -- --local   also transcribes a five-minute episode with the local engine, if installed

   What it shows: Apple's catalogue resolving a show to its feed; a feed that publishes transcripts (Podnews Daily)
   yielding one through the chain in seconds; a show that publishes none (The Joe Rogan Experience) stopping honestly
   at the audio with every step on record; YouTube's caption readers (yt-dlp if installed, the built-in one otherwise,
   which some network addresses are refused). Exit code 1 when a service that should answer did not. */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { createResolver } = require("../server/podcast/resolve");
const { localEngine, deepgramEngine } = require("../server/podcast/engines");
const YT = require("../server/podcast/youtube");

const args = new Set(process.argv.slice(2));
const dataDir = process.env.DATA_DIR ? path.resolve(path.join(__dirname, ".."), process.env.DATA_DIR) : path.join(__dirname, "..", "data");
const engines = { local: localEngine({ dataDir, env: process.env }), cloud: deepgramEngine({ apiKey: process.env.DEEPGRAM_API_KEY || "", env: process.env }) };
const R = createResolver({ env: process.env, engines });
const step = (n, s) => console.log("    " + n + ": " + s);
let failures = 0;
const fail = m => { failures++; console.log("    FAIL: " + m); };

(async () => {
  console.log("Engines: local " + (engines.local.installed() ? "installed (" + engines.local.model + (engines.local.modelCached() ? ", model cached" : ", model not yet downloaded") + ")" : "not installed") + "; Deepgram " + (engines.cloud.configured() ? "key set" : "no key") + "; yt-dlp " + ((await YT.ytdlpAvailable(process.env)) || "not installed"));

  console.log("\n=== A feed that publishes transcripts: Podnews Daily (https://podnews.net/rss)");
  try {
    const t0 = Date.now();
    const chooser = await R.locate({ url: "https://podnews.net/rss" }, step);
    if (chooser.kind !== "choose" || !chooser.episodes.length) fail("expected an episode list");
    const ep = chooser.episodes[0]; console.log("    latest: " + ep.title + " (" + ep.pubDate.slice(0, 10) + ", " + ep.duration + " s, transcript published: " + ep.hasTranscript + ")");
    const loc = await R.locate({ url: "https://podnews.net/rss", guid: ep.guid }, step);
    const w = await R.words(loc, { step });
    if (!w.ok || w.source.kind !== "feed-transcript") fail("expected the feed's transcript; got " + JSON.stringify(w.reason || w.source));
    else console.log("    transcript: " + w.text.length + " chars from " + w.source.url + " in " + (Date.now() - t0) + " ms; speakers: " + (w.speakers.join(", ") || "none") + "\n    first words: " + w.text.slice(0, 160).replace(/\n/g, " | "));
  } catch (e) { fail(e.message); }

  console.log("\n=== An Apple Podcasts episode link: The Joe Rogan Experience, latest episode");
  try {
    const t0 = Date.now();
    const chooser = await R.locate({ url: "https://podcasts.apple.com/us/podcast/the-joe-rogan-experience/id360084272" }, step);
    if (chooser.kind !== "choose") fail("expected an episode list");
    const ep = chooser.episodes[0]; console.log("    latest: " + ep.title + " (" + ep.pubDate.slice(0, 10) + ", " + Math.round(ep.duration / 60) + " min, transcript published: " + ep.hasTranscript + ")");
    const loc = await R.locate({ url: "https://podcasts.apple.com/us/podcast/the-joe-rogan-experience/id360084272", guid: ep.guid }, step);
    console.log("    matched by: " + loc.matchedBy + " in " + (Date.now() - t0) + " ms");
    const w = await R.words(loc, { step, choice: "cloud" }); // a choice the engines cannot honour here, so the chain stops before any audio work
    if (w.ok) console.log("    transcript found via " + w.source.kind + " (" + w.source.note + ")");
    else { console.log("    stopped honestly: " + w.reason); (w.tried || []).forEach(t => console.log("      - " + t.step + ": " + t.error)); if (!w.needsTranscription || !w.needsTranscription.audioUrl) fail("expected the audio file to be offered"); else console.log("    audio on offer: " + w.needsTranscription.audioUrl + " (" + Math.round((w.needsTranscription.duration || 0) / 60) + " min)"); }
  } catch (e) { fail(e.message); }

  console.log("\n=== YouTube captions: the first video ever uploaded (jNQXAC9IVRw)");
  try { const r = await YT.captions({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", env: process.env }); console.log("    read by " + r.reader + ": " + r.text.length + " chars; automatic: " + r.track.automatic + "; title: " + r.title); }
  catch (e) { console.log("    not read: " + e.message + "\n    (expected from datacenter addresses without yt-dlp; a home address usually passes, and yt-dlp always helps)"); }

  if (args.has("--local")) {
    console.log("\n=== Local transcription of a five-minute episode (Podnews Daily)");
    if (!engines.local.installed()) console.log("    local transcription is not installed (npm run setup -- --local-transcription)");
    else try {
      const chooser = await R.locate({ url: "https://podnews.net/rss" }, () => {}); const loc = await R.locate({ url: "https://podnews.net/rss", guid: chooser.episodes[0].guid }, () => {});
      const t0 = Date.now(); let last = "";
      const r = await engines.local.transcribe({ audioUrl: loc.item.enclosure.url, durationSeconds: loc.item.duration, onProgress: p => { const s = p.stage + (p.percent != null ? " " + p.percent + "%" : ""); if (s !== last) { last = s; console.log("    " + s); } } });
      console.log("    " + r.durationSeconds + " s of audio in " + Math.round((Date.now() - t0) / 1000) + " s; " + r.text.length + " chars\n    first words: " + r.text.slice(0, 160));
    } catch (e) { fail(e.message); }
  }

  console.log("\n" + (failures ? failures + " check(s) failed." : "Done. Nothing was written."));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("smoke failed:", e); process.exit(1); });
