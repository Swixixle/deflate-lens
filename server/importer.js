"use strict";
/* Link importer. Fetches a URL and returns readable text, or says plainly why it cannot. It never pretends: a page
   that yields no usable text, a site that does not expose transcripts to a plain fetch, a login wall, or a timeout
   each come back as {ok:false, reason} so the page can offer paste/upload. Nothing is stored here. */

const NO_IMPORTER = [
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YouTube does not expose transcripts to a plain page fetch. Open the video, use “Show transcript”, copy it, and paste it here (or upload a .srt/.vtt file)."],
  [/(^|\.)spotify\.com$/, "Spotify pages do not carry transcripts a plain fetch can read. Paste the transcript or upload a file."],
  [/(^|\.)podcasts\.apple\.com$/, "Apple Podcasts pages do not expose transcripts to a plain fetch. Paste the transcript or upload a file."],
  [/(^|\.)x\.com$|(^|\.)twitter\.com$/, "X requires a login and JavaScript to show posts. Paste the text of the post."],
  [/(^|\.)facebook\.com$|(^|\.)instagram\.com$|(^|\.)tiktok\.com$/, "This site requires a login or JavaScript to show content. Paste the text."],
  [/(^|\.)rumble\.com$/, "Rumble does not expose transcripts to a plain fetch. Paste the transcript or upload a file."],
];
const MAX_BYTES = 5 * 1024 * 1024;

function decodeEntities(s) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", mdash: "—", ndash: "–" };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(code) ? String.fromCodePoint(code) : m; }
    return named[e.toLowerCase()] != null ? named[e.toLowerCase()] : m;
  });
}

/* Readable text from HTML without a DOM: drop script/style/nav/header/footer/aside/form, turn block ends into
   line breaks, strip tags, decode entities, collapse whitespace. Good enough for article pages and transcript
   pages; a JavaScript-rendered page yields little, which the caller reports. */
function htmlToText(html) {
  let s = String(html || "");
  const title = decodeEntities((s.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ""])[1]).replace(/\s+/g, " ").trim();
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, " ");
  s = s.replace(/<(script|style|noscript|svg|canvas|iframe|nav|header|footer|aside|form|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<\s*(br|hr)\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|h[1-6]|tr|blockquote|section|article|dd|dt|pre|figcaption)\s*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  const lines = s.split("\n").map(l => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean);
  return { title, text: lines.join("\n") };
}

function createImporter(deps) {
  const fetchFn = (deps && deps.fetch) || globalThis.fetch;
  return async function importUrl(url) {
    const u = String(url || "").trim();
    let parsed; try { parsed = new URL(u); } catch (e) { return { ok: false, reason: "That is not a link the importer can fetch (it needs http:// or https://)." }; }
    if (!/^https?:$/.test(parsed.protocol)) return { ok: false, reason: "Only http(s) links can be fetched." };
    for (const [re, reason] of NO_IMPORTER) if (re.test(parsed.hostname)) return { ok: false, reason, host: parsed.hostname, noImporter: true };
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const res = await fetchFn(u, { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": "deflate-lens/0.7 (local transcript importer)", "Accept": "text/html,text/plain,text/vtt,application/x-subrip;q=0.9,*/*;q=0.5" } });
      const ctype = String(res.headers && typeof res.headers.get === "function" ? res.headers.get("content-type") || "" : "").toLowerCase();
      if (res.status >= 400) return { ok: false, reason: "The site answered HTTP " + res.status + (res.status === 401 || res.status === 403 ? ": it wants a login or blocks automated fetches" : "") + ". Paste the text or upload a file.", status: res.status };
      const body = await res.text();
      if (body.length > MAX_BYTES) return { ok: false, reason: "The page is larger than 5 MB; paste the part you want." };
      let title = "", text = "";
      if (/^text\/(plain|vtt|x-subrip)|application\/x-subrip/.test(ctype) || /\.(txt|srt|vtt|md)(\?|$)/i.test(parsed.pathname)) { text = body; title = parsed.pathname.split("/").pop() || parsed.hostname; }
      else if (/json/.test(ctype)) return { ok: false, reason: "The link returns data (JSON), not readable text. Paste the text instead." };
      else { const r = htmlToText(body); title = r.title; text = r.text; }
      const chars = text.replace(/\s+/g, " ").trim().length;
      if (chars < 200) return { ok: false, reason: "The page gave only " + chars + " characters of readable text" + (title ? " (title: “" + title + "”)" : "") + ". It probably needs JavaScript or a login to show its content. Paste the text or upload a file.", title, chars };
      return { ok: true, url: res.url || u, title, text, chars, contentType: ctype, fetchedAt: new Date().toISOString(), method: /^text\//.test(ctype) && !/html/.test(ctype) ? "text-file" : "html-text" };
    } catch (e) {
      const msg = e && e.name === "AbortError" ? "The site did not answer within 20 seconds." : "Could not reach the site" + (e && e.message ? " (" + String(e.message).slice(0, 120) + ")" : "") + ".";
      return { ok: false, reason: msg + " Paste the text or upload a file." };
    } finally { clearTimeout(t); }
  };
}

module.exports = { createImporter, htmlToText, decodeEntities, NO_IMPORTER };
