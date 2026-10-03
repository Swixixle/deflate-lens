"use strict";
/* Podcast RSS, read without an XML library. A podcast feed is RSS 2.0 with the iTunes namespace and, on feeds that follow
   the Podcasting 2.0 namespace, a <podcast:transcript> element per episode pointing at a transcript file. This reads
   the channel, every <item>, each item's audio <enclosure>, its transcript links, and the identifiers an app store
   lookup can be matched on (guid, title, enclosure URL, publication date). Tolerant of CDATA, entities and odd
   whitespace; it does not try to be a general XML parser. */
const { decodeEntities } = require("../importer");

function stripCdata(s) { return String(s == null ? "" : s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"); }
function clean(s) { return decodeEntities(stripCdata(s)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
/* First element named `name` (with or without a namespace prefix) inside `xml`; its inner text and attributes. */
function tag(xml, name) {
  const re = new RegExp("<(?:[A-Za-z0-9_-]+:)?" + name + "((?:\\s[^>]*?)?)\\s*(?:/>|>([\\s\\S]*?)</(?:[A-Za-z0-9_-]+:)?" + name + "\\s*>)", "i");
  const m = re.exec(xml); if (!m) return null;
  return { attrs: attrsOf(m[1] || ""), inner: m[2] || "" };
}
function tags(xml, name) {
  const re = new RegExp("<(?:[A-Za-z0-9_-]+:)?" + name + "((?:\\s[^>]*?)?)\\s*(?:/>|>([\\s\\S]*?)</(?:[A-Za-z0-9_-]+:)?" + name + "\\s*>)", "gi");
  const out = []; let m; while ((m = re.exec(xml))) out.push({ attrs: attrsOf(m[1] || ""), inner: m[2] || "" });
  return out;
}
function attrsOf(s) { const out = {}; const re = /([A-Za-z0-9_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; let m; while ((m = re.exec(s))) out[m[1].toLowerCase()] = decodeEntities(m[2] != null ? m[2] : m[3]); return out; }
function text(xml, name) { const t = tag(xml, name); return t ? clean(t.inner) : ""; }
function durationSeconds(s) { s = String(s || "").trim(); if (!s) return null; if (/^\d+$/.test(s)) return Number(s); const p = s.split(":").map(Number); if (p.some(isNaN)) return null; return p.reduce((a, b) => a * 60 + b, 0); }
function isoDate(s) { const d = new Date(String(s || "")); return isNaN(d.getTime()) ? "" : d.toISOString(); }

function looksLikeFeed(body) { const head = String(body || "").slice(0, 4000); return /<rss[\s>]/i.test(head) || /<feed[\s>]/i.test(head) || /<channel[\s>]/i.test(head); }

function parseFeed(xml) {
  xml = String(xml || "");
  if (!looksLikeFeed(xml)) throw new Error("not an RSS feed");
  const channelXml = (tag(xml, "channel") || { inner: xml }).inner;
  const head = channelXml.replace(/<item[\s>][\s\S]*$/i, "");
  const feed = { title: text(head, "title"), link: text(head, "link"), description: text(head, "description").slice(0, 600), author: text(head, "author"), language: text(head, "language"), image: (tag(head, "image") && tag(head, "image").attrs.href) || "", items: [] };
  for (const it of tags(channelXml, "item")) {
    const x = it.inner;
    const enc = tag(x, "enclosure");
    const transcripts = tags(x, "transcript").map(t => ({ url: t.attrs.url || "", type: String(t.attrs.type || "").toLowerCase(), language: t.attrs.language || "", rel: t.attrs.rel || "" })).filter(t => /^https?:\/\//.test(t.url));
    const guidTag = tag(x, "guid");
    const item = {
      title: text(x, "title"), guid: guidTag ? clean(guidTag.inner) : "", link: text(x, "link"), pubDate: isoDate(text(x, "pubDate")),
      duration: durationSeconds(text(x, "duration")), episode: text(x, "episode"), season: text(x, "season"), episodeType: text(x, "episodeType"),
      description: clean((tag(x, "encoded") || tag(x, "description") || { inner: "" }).inner).slice(0, 2000),
      enclosure: enc ? { url: enc.attrs.url || "", type: String(enc.attrs.type || "").toLowerCase(), length: Number(enc.attrs.length) || null } : null,
      transcripts,
      youtube: firstYoutubeLink(stripCdata((tag(x, "encoded") || tag(x, "description") || { inner: "" }).inner) + " " + text(x, "link")),
    };
    if (!item.title && !item.enclosure) continue;
    feed.items.push(item);
  }
  return feed;
}
function firstYoutubeLink(s) { const m = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|live\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i.exec(String(s || "")); return m ? "https://www.youtube.com/watch?v=" + m[1] : ""; }

/* Order of preference among a feed's transcript links: structured first (JSON carries speakers and times), then captions
   (VTT may carry voices), then SRT, then HTML/text. */
const TRANSCRIPT_RANK = ["application/json", "text/vtt", "application/x-subrip", "application/srt", "text/srt", "text/html", "text/plain"];
function bestTranscripts(list) {
  return (list || []).slice().sort((a, b) => rank(a) - rank(b));
  function rank(t) { const i = TRANSCRIPT_RANK.indexOf(t.type); return i === -1 ? TRANSCRIPT_RANK.length + (/\.json$/i.test(t.url) ? -9 : /\.vtt$/i.test(t.url) ? -8 : /\.srt$/i.test(t.url) ? -7 : 0) : i; }
}

function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
/* The item an app store entry or a person means. Identity first (guid, enclosure URL), then title, then date. */
function matchEpisode(feed, want) {
  want = want || {};
  const items = feed.items || [];
  if (want.guid) { const hit = items.find(i => i.guid && i.guid === want.guid); if (hit) return { item: hit, matchedBy: "guid" }; }
  if (want.enclosureUrl) { const u = String(want.enclosureUrl).replace(/\?.*$/, ""); const hit = items.find(i => i.enclosure && i.enclosure.url.replace(/\?.*$/, "") === u); if (hit) return { item: hit, matchedBy: "audio file" }; }
  if (want.title) {
    const t = norm(want.title);
    let hit = items.find(i => norm(i.title) === t); if (hit) return { item: hit, matchedBy: "title" };
    hit = items.find(i => norm(i.title).includes(t) || t.includes(norm(i.title))); if (hit && norm(hit.title).length > 12) return { item: hit, matchedBy: "title (partial)" };
  }
  if (want.pubDate) { const d = String(want.pubDate).slice(0, 10); const hit = items.find(i => i.pubDate.slice(0, 10) === d); if (hit) return { item: hit, matchedBy: "publication date" }; }
  return null;
}

module.exports = { parseFeed, looksLikeFeed, matchEpisode, bestTranscripts, firstYoutubeLink, tag, tags, clean, durationSeconds };
