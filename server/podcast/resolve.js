"use strict";
/* The transcript chain. Given a link a person pasted, find the episode it means and then its words, trying the places
   transcripts actually exist, in order, and reporting each step:

     1. the podcast feed's own transcript (<podcast:transcript> in the RSS; seconds; may carry speakers)
     2. the episode's video on YouTube (captions; seconds; no speakers)
     3. the episode's page on the show's site, when it publishes a transcript
     4. the audio itself, transcribed locally or by Deepgram, by the person's one-time choice

   Links understood: Apple Podcasts (episode or show), Spotify (episode or show), YouTube, a podcast RSS feed, any page
   that links to a feed. Episodes are found through Apple's public lookup and search (no key), Spotify's oEmbed (title
   only), and the feed itself. Every result says where it came from (`source`), how the episode was matched, and what
   the words do and do not carry (speakers). Nothing is written here; the page saves what the person accepts. */
const { parseFeed, looksLikeFeed, matchEpisode, bestTranscripts } = require("./feed");
const { transcriptToText } = require("./transcripts");
const YT = require("./youtube");
const { htmlToText, decodeEntities, NO_IMPORTER } = require("../importer");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 deflate-lens/0.9";
const MAX_FEED_BYTES = 25 * 1024 * 1024, MAX_PAGE_BYTES = 8 * 1024 * 1024;

function classify(url) {
  let u; try { u = new URL(String(url || "").trim()); } catch (e) { return { kind: "invalid" }; }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (/(^|\.)podcasts\.apple\.com$/.test(host)) { const show = /\/id(\d+)/.exec(u.pathname), ep = u.searchParams.get("i"); return { kind: ep ? "apple-episode" : "apple-show", showId: show ? show[1] : "", episodeId: ep || "", url: u.href }; }
  if (/(^|\.)spotify\.com$/.test(host)) { const m = /\/(episode|show)\/([A-Za-z0-9]+)/.exec(u.pathname); return { kind: m ? "spotify-" + m[1] : "spotify", id: m ? m[2] : "", url: u.href }; }
  if (YT.videoId(u.href)) return { kind: "youtube", id: YT.videoId(u.href), url: u.href };
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return { kind: "youtube-other", url: u.href };
  if (/\.(rss|xml)$/i.test(u.pathname) || /\/(rss|feed)\/?$/i.test(u.pathname) || /feeds?\./.test(host) || /rss/i.test(host)) return { kind: "feed", url: u.href };
  return { kind: "page", url: u.href };
}

/* Addresses the chain will not fetch: this computer and private networks. A pasted link, or a feed's transcript link,
   must not make the server read its own API or a neighbour's; the app is a reader of the public web. */
function privateV4(a, b) { return a === 127 || a === 10 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127); }
function isPrivateHost(h) {
  h = String(h || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h || h === "localhost" || /(^|\.)localhost$/.test(h) || /\.local$/.test(h)) return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (v4) return privateV4(Number(v4[1]), Number(v4[2]));
  if (/^[0-9a-f:.]+$/.test(h) && h.includes(":")) { // an IPv6 literal, including the IPv4-mapped forms ::ffff:a.b.c.d and ::ffff:7f00:1
    const mapped = /^(?:0*:)*:?ffff:(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h) || (/^(?:0*:)*:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h) ? (m => [null, parseInt(m[1], 16) >> 8, parseInt(m[1], 16) & 255, parseInt(m[2], 16) >> 8, parseInt(m[2], 16) & 255])(/^(?:0*:)*:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h)) : null);
    if (mapped) return privateV4(Number(mapped[1]), Number(mapped[2]));
    const compact = h.replace(/(^|:)0+(?=[0-9a-f])/g, "$1"); // leading zeros in groups
    if (compact === "::1" || compact === "::" || /^0*(:0*)*:?1$/.test(h) || /^[0:]+$/.test(h)) return true;
    if (/^fe[89ab][0-9a-f]?:/.test(compact) || /^f[cd][0-9a-f]{0,2}:/.test(compact) || /^fec0:/.test(compact)) return true;
    return false;
  }
  return !/^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/.test(h); // anything that is not a plain public host name is refused
}
const MAX_REDIRECTS = 5;
/* Fetch with every hop checked: redirects are followed by hand so a public address cannot bounce the chain onto a
   private one, and the body is read in pieces and abandoned the moment it passes the cap. */
async function fetchText(fetchFn, url, { timeoutMs, maxBytes, accept } = {}) {
  const cap = maxBytes || MAX_PAGE_BYTES;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs || 30000);
  try {
    let cur = String(url || "");
    for (let hop = 0; ; hop++) {
      let host = ""; try { host = new URL(cur).hostname; if (!/^https?:$/.test(new URL(cur).protocol)) throw new Error("x"); } catch (e) { throw Object.assign(new Error("not a valid http(s) address: " + cur.slice(0, 80)), { status: 400 }); }
      if (isPrivateHost(host)) throw Object.assign(new Error("the chain does not fetch addresses on this computer or a private network (" + host + ")"), { status: 400, code: "private_address" });
      // large feeds arrive uncompressed: a compressed stream cut short by a proxy fails to decode as a whole (seen on a
      // 5 MB feed, 2026-10-03), whereas a plain one is simply read to its end
      const res = await fetchFn(cur, { signal: ctl.signal, redirect: "manual", headers: { "User-Agent": UA, "Accept": accept || "application/rss+xml, application/xml, text/xml, text/html, application/json, text/plain, */*", "Accept-Encoding": "identity" } });
      const loc = res.headers && typeof res.headers.get === "function" ? res.headers.get("location") : null;
      if ([301, 302, 303, 307, 308].includes(res.status) && loc) { if (hop >= MAX_REDIRECTS) throw new Error("too many redirects"); cur = new URL(loc, cur).href; continue; }
      const text = await readCapped(res, cap);
      return { status: res.status, text, type: String(res.headers && res.headers.get && res.headers.get("content-type") || "").toLowerCase(), url: res.url || cur };
    }
  } finally { clearTimeout(t); }
}
async function readCapped(res, cap) {
  if (!res.body || typeof res.body.getReader !== "function") { const text = await res.text(); if (text.length > cap) throw new Error("the response is larger than " + Math.round(cap / 1048576) + " MB"); return text; }
  const reader = res.body.getReader(); const parts = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; got += value.length; if (got > cap) { try { await reader.cancel(); } catch (e) {} throw new Error("the response is larger than " + Math.round(cap / 1048576) + " MB"); } parts.push(Buffer.from(value)); }
  return Buffer.concat(parts).toString("utf8");
}
async function fetchJson(fetchFn, url) { const r = await fetchText(fetchFn, url, { timeoutMs: 20000 }); if (r.status !== 200) throw new Error("HTTP " + r.status + " from " + new URL(url).hostname); return JSON.parse(r.text); }

/* ---- Apple's public catalogue (no key) ---- */
async function appleLookup(fetchFn, showId) {
  const d = await fetchJson(fetchFn, "https://itunes.apple.com/lookup?id=" + encodeURIComponent(showId) + "&entity=podcastEpisode&limit=300");
  const show = (d.results || []).find(r => r.kind === "podcast") || null;
  const episodes = (d.results || []).filter(r => r.wrapperType === "podcastEpisode").map(appleEpisode);
  return { show: show ? { id: String(show.collectionId || show.trackId), name: show.collectionName || show.trackName || "", feedUrl: show.feedUrl || "", artist: show.artistName || "" } : null, episodes };
}
function appleEpisode(r) { return { id: String(r.trackId || ""), title: r.trackName || "", guid: r.episodeGuid || "", audioUrl: r.episodeUrl || "", releaseDate: r.releaseDate || "", feedUrl: r.feedUrl || "", show: r.collectionName || "", showId: String(r.collectionId || "") }; }
async function appleSearchEpisodes(fetchFn, term) {
  const d = await fetchJson(fetchFn, "https://itunes.apple.com/search?term=" + encodeURIComponent(term) + "&media=podcast&entity=podcastEpisode&limit=20");
  return (d.results || []).filter(r => r.wrapperType === "podcastEpisode").map(appleEpisode);
}
async function appleSearchShows(fetchFn, term) {
  const d = await fetchJson(fetchFn, "https://itunes.apple.com/search?term=" + encodeURIComponent(term) + "&media=podcast&entity=podcast&limit=10");
  return (d.results || []).map(r => ({ id: String(r.collectionId || ""), name: r.collectionName || "", feedUrl: r.feedUrl || "", artist: r.artistName || "" }));
}
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* ---- Spotify: the oEmbed endpoint gives the title and nothing else (no key); the show is found from the title ---- */
async function spotifyTitle(fetchFn, url) {
  const r = await fetchText(fetchFn, "https://open.spotify.com/oembed?url=" + encodeURIComponent(url), { timeoutMs: 15000, accept: "application/json" });
  if (r.status !== 200) throw new Error("Spotify's oEmbed answered HTTP " + r.status + " (the link may be wrong or the item private)");
  let d; try { d = JSON.parse(r.text); } catch (e) { throw new Error("Spotify's oEmbed answered with something other than JSON"); }
  const title = String(d.title || "") || decodeEntities((/title="Spotify Embed: ([^"]*)"/.exec(d.html || "") || [, ""])[1]);
  if (!title) throw new Error("Spotify gave no title for this link");
  return title;
}

/* ---- the chain ---- */
function createResolver({ fetch: fetchFn, env, engines, run: runFn }) {
  fetchFn = fetchFn || require("./public-fetch").publicFetch; env = env || {}; engines = engines || {};

  /* A feed is read whole or not at all: a transfer cut short (seen through a proxy, HTTP 200 with a third of the
     bytes) is retried, and a feed that still arrives without its closing tag is used but marked incomplete. */
  async function readFeed(url) {
    let r = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      r = await fetchText(fetchFn, url, { timeoutMs: 60000, maxBytes: MAX_FEED_BYTES });
      if (r.status !== 200) throw new Error("the feed answered HTTP " + r.status);
      if (!looksLikeFeed(r.text)) throw new Error("that address is not an RSS feed");
      if (/<\/(rss|feed)\s*>\s*$/i.test(r.text)) break;
    }
    const feed = Object.assign(parseFeed(r.text), { url: r.url || url });
    if (!/<\/(rss|feed)\s*>\s*$/i.test(r.text)) feed.truncated = true;
    return feed;
  }

  /* Step 0: the link to an episode (or a list to choose from). */
  async function locate(input, step) {
    const c = classify(input.url);
    if (c.kind === "invalid") throw Object.assign(new Error("that is not a link"), { status: 400 });
    if (c.kind === "youtube") return { kind: "video", video: { id: c.id, url: c.url } };
    if (c.kind === "youtube-other") throw Object.assign(new Error("a YouTube channel or playlist link; paste the link to one video"), { status: 400 });
    if (c.kind === "apple-episode" || c.kind === "apple-show") {
      step("Apple Podcasts", "looking up the show");
      const a = await appleLookup(fetchFn, c.showId);
      if (!a.show || !a.show.feedUrl) throw new Error("Apple lists no feed for this show (id " + c.showId + ")");
      step("Apple Podcasts", "show: " + a.show.name + "; feed found");
      const feed = await readFeed(a.show.feedUrl);
      if (c.kind === "apple-show" && !input.guid) return { kind: "choose", show: a.show, feed, episodes: episodesToChoose(feed), note: feed.truncated ? "the feed arrived incomplete; older episodes may be missing" : "" };
      const ae = c.kind === "apple-episode" ? a.episodes.find(e => e.id === c.episodeId) : null;
      const want = input.guid ? { guid: input.guid } : ae ? { guid: ae.guid, enclosureUrl: ae.audioUrl, title: ae.title, pubDate: ae.releaseDate } : null;
      if (!want) throw new Error("Apple's listing does not include this episode (it may be older than the 300 most recent, or the link is wrong); open the show's link and pick the episode");
      const m = matchEpisode(feed, want);
      if (!m) throw new Error("the episode Apple names (" + (ae ? ae.title : input.guid) + ") is not in the show's feed" + (feed.truncated ? " (the feed arrived incomplete; try again)" : ""));
      return { kind: "episode", show: { name: feed.title || a.show.name, feedUrl: feed.url, link: feed.link }, item: m.item, matchedBy: "Apple's listing, then the feed by " + m.matchedBy, apple: ae };
    }
    if (c.kind === "spotify-episode" || c.kind === "spotify-show") {
      step("Spotify", "reading the title");
      const title = await spotifyTitle(fetchFn, c.url);
      if (c.kind === "spotify-show") {
        step("Spotify", "show: " + title + "; looking it up at Apple");
        const shows = await appleSearchShows(fetchFn, title);
        const matches = shows.filter(s => norm(s.name) === norm(title));
        if (matches.length !== 1) throw new Error("Spotify’s show title does not identify one feed. Paste the show’s RSS or Apple Podcasts link.");
        const show = matches[0];
        if (!show || !show.feedUrl) throw new Error("no feed found for a show called “" + title + "”");
        const feed = await readFeed(show.feedUrl);
        if (!input.guid) return { kind: "choose", show, feed, episodes: episodesToChoose(feed), note: "matched from Spotify by show title" };
        const m = matchEpisode(feed, { guid: input.guid }); if (!m) throw new Error("that episode is not in the feed");
        return { kind: "episode", show: { name: feed.title || show.name, feedUrl: feed.url, link: feed.link }, item: m.item, matchedBy: "Spotify show title → Apple → feed by guid" };
      }
      step("Spotify", "episode: " + title + "; looking it up at Apple by title");
      const hits = await appleSearchEpisodes(fetchFn, title);
      const exact = hits.filter(h => norm(h.title) === norm(title));
      if (exact.length > 1) throw new Error("More than one episode has this title. Paste the show’s RSS or Apple Podcasts link so the right episode is read.");
      const pick = exact.length === 1 ? exact[0] : null;
      if (!pick || !pick.feedUrl) throw new Error("no podcast episode called “" + title + "” is listed at Apple; paste the show's Apple Podcasts link or its RSS feed instead");
      const feed = await readFeed(pick.feedUrl);
      const m = matchEpisode(feed, { guid: pick.guid, enclosureUrl: pick.audioUrl, title: pick.title, pubDate: pick.releaseDate });
      if (!m) throw new Error("the episode is listed at Apple but not in the show's feed");
      return { kind: "episode", show: { name: feed.title || pick.show, feedUrl: feed.url, link: feed.link }, item: m.item, matchedBy: "Spotify episode title → Apple search → feed by " + m.matchedBy, ambiguous: exact.length > 1 ? exact.map(h => h.show) : null };
    }
    if (c.kind === "feed") {
      step("Feed", "reading the feed");
      const feed = await readFeed(c.url);
      if (input.guid) { const m = matchEpisode(feed, { guid: input.guid }); if (!m) throw new Error("that episode is not in the feed"); return { kind: "episode", show: { name: feed.title, feedUrl: feed.url, link: feed.link }, item: m.item, matchedBy: "feed by guid" }; }
      return { kind: "choose", show: { name: feed.title, feedUrl: feed.url }, feed, episodes: episodesToChoose(feed) };
    }
    // a page: a feed link in its head, or a YouTube embed, or an article (handed to the importer by the caller)
    for (const [re, reason] of NO_IMPORTER) if (re.test(new URL(c.url).hostname) && !/youtube|youtu\.be|spotify|apple/.test(re.source)) throw Object.assign(new Error(reason), { status: 400, code: "no_importer" });
    step("Page", "reading the page");
    const r = await fetchText(fetchFn, c.url, { timeoutMs: 30000 });
    if (r.status !== 200) throw Object.assign(new Error("the page answered HTTP " + r.status), { status: 502 });
    if (looksLikeFeed(r.text)) { const feed = Object.assign(parseFeed(r.text), { url: r.url }); if (input.guid) { const m = matchEpisode(feed, { guid: input.guid }); if (m) return { kind: "episode", show: { name: feed.title, feedUrl: feed.url, link: feed.link }, item: m.item, matchedBy: "feed by guid" }; } return { kind: "choose", show: { name: feed.title, feedUrl: feed.url }, feed, episodes: episodesToChoose(feed) }; }
    const feedLink = /<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)["']/i.exec(r.text) || /<link[^>]+href=["']([^"']+)["'][^>]*type=["']application\/(?:rss|atom)\+xml["']/i.exec(r.text);
    const yt = YT.videoId(r.text.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/embed\/|youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{11}/) ? r.text.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/embed\/|youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{11}/)[0] : "");
    if (feedLink) {
      const feedUrl = new URL(decodeEntities(feedLink[1]), r.url).href;
      step("Page", "it links to a feed: " + feedUrl);
      const feed = await readFeed(feedUrl);
      if (input.guid) { const picked = matchEpisode(feed, {guid:input.guid}); if (!picked) throw new Error("That episode is not in the feed."); return {kind:"episode", show:{name:feed.title,feedUrl:feed.url,link:feed.link}, item:picked.item, matchedBy:"feed by guid"}; }
      const m = matchEpisode(feed, { title: decodeEntities((r.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ""])[1]).replace(/\s+/g, " ").trim() }) || (feed.items || []).map(i => i.link && i.link.replace(/\/$/, "") === c.url.replace(/\/$/, "") ? { item: i, matchedBy: "page link" } : null).find(Boolean);
      if (m) return { kind: "episode", show: { name: feed.title, feedUrl: feed.url, link: feed.link }, item: m.item, matchedBy: "the page's feed by " + m.matchedBy, pageHtml: r.text };
      if (input.guid) { const mm = matchEpisode(feed, { guid: input.guid }); if (mm) return { kind: "episode", show: { name: feed.title, feedUrl: feed.url, link: feed.link }, item: mm.item, matchedBy: "feed by guid" }; }
      return { kind: "choose", show: { name: feed.title, feedUrl: feed.url }, feed, episodes: episodesToChoose(feed), note: "the page links to this feed; pick the episode" };
    }
    if (yt) return { kind: "video", video: { id: yt, url: "https://www.youtube.com/watch?v=" + yt }, note: "the page embeds this video" };
    return { kind: "article", html: r.text, url: r.url };
  }
  function episodesToChoose(feed) { return (feed.items || []).slice(0, 60).map(i => ({ guid: i.guid, title: i.title, pubDate: i.pubDate, duration: i.duration, hasTranscript: i.transcripts.length > 0, hasAudio: !!(i.enclosure && i.enclosure.url) })); }

  /* Steps 1–4 for a located episode. `choice` is the person's engine choice for step 4 ("local" | "cloud" | undefined). */
  async function words(located, { step, signal, choice, onProgress }) {
    const tried = [];
    const base = { show: located.show, episode: located.item ? { title: located.item.title, guid: located.item.guid, pubDate: located.item.pubDate, duration: located.item.duration, link: located.item.link, audioUrl: located.item.enclosure && located.item.enclosure.url || "" } : null, matchedBy: located.matchedBy || "", ambiguous: located.ambiguous || null };
    if (located.kind === "video") {
      step("YouTube", "reading captions");
      const r = await YT.captions({ id: located.video.id, fetch: fetchFn, env, run: runFn });
      return Object.assign(base, { ok: true, text: r.text, title: r.title, speakers: r.speakers, tried: r.tried, source: { kind: "youtube-captions", url: located.video.url, reader: r.reader, automatic: !!(r.track && r.track.automatic), language: r.track && r.track.language || "", note: (r.track && r.track.automatic ? "YouTube's automatic captions" : "captions published with the video") + "; no speaker labels" + (r.reader === "built-in" ? "; read by the built-in reader" : "; read with yt-dlp") } });
    }
    const item = located.item;
    // 1. the feed's transcript
    for (const t of bestTranscripts(item.transcripts)) {
      step("Feed transcript", "fetching " + t.url);
      try {
        const r = await fetchText(fetchFn, t.url, { timeoutMs: 40000, accept: "*/*" });
        if (r.status !== 200) { tried.push({ step: "feed transcript", url: t.url, error: "HTTP " + r.status }); continue; }
        const conv = transcriptToText(r.text, t.type || r.type, t.url);
        if (conv.text.replace(/\s+/g, " ").length < 200) { tried.push({ step: "feed transcript", url: t.url, error: "only " + conv.text.length + " characters of text" }); continue; }
        return Object.assign(base, { ok: true, text: conv.text, title: item.title, speakers: conv.speakers, tried, source: { kind: "feed-transcript", url: t.url, format: conv.format, type: t.type, note: "the transcript the show publishes in its feed" + (conv.speakers.length ? " (speakers: " + conv.speakers.join(", ") + ")" : " (no speaker labels)") } });
      } catch (e) { tried.push({ step: "feed transcript", url: t.url, error: e.message }); }
    }
    if (!item.transcripts.length) tried.push({ step: "feed transcript", error: "the feed has no transcript for this episode" });
    if (signal && signal.aborted) throw cancelled();
    // 2. YouTube: a video link in the episode's notes, or a search by title when yt-dlp is installed
    let video = item.youtube ? { id: YT.videoId(item.youtube), via: "a link in the episode notes" } : null;
    if (!video) {
      tried.push({step:"youtube search",error:"No video is linked from this episode. A title-only search cannot establish which video belongs to it; trying the episode’s own page and audio."});
    }
    if (video && video.id) {
      step("YouTube", "reading captions (" + video.via + ")");
      try { const r = await YT.captions({ id: video.id, fetch: fetchFn, env, run: runFn }); return Object.assign(base, { ok: true, text: r.text, title: item.title, speakers: r.speakers, tried: tried.concat(r.tried || []), source: { kind: "youtube-captions", url: "https://www.youtube.com/watch?v=" + video.id, reader: r.reader, automatic: !!(r.track && r.track.automatic), videoTitle: r.title, note: (r.track && r.track.automatic ? "YouTube's automatic captions" : "captions published with the video") + " for the video found via " + video.via + "; no speaker labels" } }); }
      catch (e) { tried.push({ step: "youtube captions", url: "https://www.youtube.com/watch?v=" + video.id, error: e.message }); }
    }
    if (signal && signal.aborted) throw cancelled();
    // 3. the episode's page, when it carries a transcript
    if (item.link && /^https?:\/\//.test(item.link)) {
      step("Episode page", "reading " + item.link);
      try {
        const r = located.pageHtml ? { status: 200, text: located.pageHtml } : await fetchText(fetchFn, item.link, { timeoutMs: 30000 });
        if (r.status === 200) {
          const page = htmlToText(r.text);
          const tl = /<a[^>]+href=["']([^"']+\.(?:vtt|srt|json|txt)(?:\?[^"']*)?)["'][^>]*>[^<]*transcript/i.exec(r.text) || /<a[^>]+href=["']([^"']*transcript[^"']*)["']/i.exec(r.text);
          if (tl) { const tu = new URL(decodeEntities(tl[1]), item.link).href; const tr = await fetchText(fetchFn, tu, { timeoutMs: 40000, accept: "*/*" }); if (tr.status === 200) { const conv = transcriptToText(tr.text, tr.type, tu); if (conv.text.length > Math.max(2000, 3 * (item.description || "").length)) return Object.assign(base, { ok: true, text: conv.text, title: item.title, speakers: conv.speakers, tried, source: { kind: "episode-page", url: tu, format: conv.format, note: "a transcript linked from the episode's page" + (conv.speakers.length ? "" : " (no speaker labels)") } }); } }
          if (/transcript/i.test(page.text) && page.text.length > Math.max(6000, 4 * (item.description || "").length) && (item.duration ? page.text.length > item.duration * 8 : true)) return Object.assign(base, { ok: true, text: page.text, title: item.title, speakers: [], tried, source: { kind: "episode-page", url: item.link, format: "html", note: "the episode's page, which appears to carry the transcript (check that it is not show notes)" } });
          tried.push({ step: "episode page", url: item.link, error: "no transcript on the page (" + page.text.length + " characters of text)" });
        } else tried.push({ step: "episode page", url: item.link, error: "HTTP " + r.status });
      } catch (e) { tried.push({ step: "episode page", url: item.link, error: e.message }); }
    } else tried.push({ step: "episode page", error: "the feed gives no page for this episode" });
    if (signal && signal.aborted) throw cancelled();
    // 4. the audio
    const audioUrl = item.enclosure && item.enclosure.url;
    if (!audioUrl) return Object.assign(base, { ok: false, tried, reason: "no transcript was found and the feed has no audio file for this episode" });
    let audioHost = ""; try { audioHost = new URL(audioUrl).hostname; } catch (e) {}
    if (!/^https?:\/\//i.test(audioUrl) || isPrivateHost(audioHost)) return Object.assign(base, { ok: false, tried: tried.concat([{ step: "audio", error: "the feed's audio address is not a public http(s) address (" + audioUrl.slice(0, 80) + ")" }]), reason: "no transcript was found, and the audio file's address cannot be fetched" });
    const local = engines.local, cloud = engines.cloud;
    const have = { local: !!(local && local.installed()), cloud: !!(cloud && cloud.configured()) };
    const pick = choice === "local" || choice === "cloud" ? choice : (env.TRANSCRIBE_PREFER === "local" && have.local ? "local" : env.TRANSCRIBE_PREFER === "cloud" && have.cloud ? "cloud" : have.cloud ? "cloud" : have.local ? "local" : "");
    if (!pick || !have[pick]) return Object.assign(base, { ok: false, tried, needsTranscription: { audioUrl, duration: item.duration, available: have, wanted: pick || null }, reason: "no transcript was published anywhere the app can look; the audio can be transcribed" + (pick && !have[pick] ? ", but " + (pick === "local" ? "local transcription is not installed" : "no Deepgram key is set") : "") });
    const engine = pick === "local" ? local : cloud;
    step("Audio", pick === "local" ? "transcribing on this computer (this takes a while)" : "transcribing with Deepgram");
    const r = await engine.transcribe({ audioUrl, durationSeconds: item.duration, fetch: fetchFn, signal, onProgress });
    return Object.assign(base, { ok: true, text: r.text, title: item.title, speakers: r.speakers || [], tried, source: { kind: "audio-transcription", url: audioUrl, engine: r.engine, model: r.model, requestId: r.requestId || "", durationSeconds: r.durationSeconds, note: r.note } });
  }
  function cancelled() { const e = new Error("stopped"); e.code = "cancelled"; return e; }

  return { classify, locate, words, readFeed, appleLookup, appleSearchEpisodes, spotifyTitle };
}

module.exports = { createResolver, classify, appleEpisode, isPrivateHost };
