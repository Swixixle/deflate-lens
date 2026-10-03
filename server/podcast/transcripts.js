"use strict";
/* Transcript files in the shapes podcasts and video sites publish them, turned into the text the app reads:
   one line per speaking turn as "NAME: words" when the format carries speakers, otherwise plain paragraphs that the
   parser reads as Speaker unknown. Formats: WebVTT (with or without <v Name> voice tags; YouTube-style rolling
   captions deduplicated), SRT, the Podcasting 2.0 JSON transcript ({segments:[{speaker,startTime,endTime,body}]}),
   YouTube's json3 caption events, HTML pages, and plain text. Nothing here invents a speaker: a format without
   speakers yields none. */
const { htmlToText } = require("../importer");

const TIME = /^(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s+-->\s+(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;
const clip = s => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

/* Cues as {speaker, text}. */
function cuesFromVtt(body) {
  const lines = String(body || "").replace(/\r/g, "").split("\n");
  const cues = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i].trim();
    if (!l || /^WEBVTT/.test(l) || /^NOTE\b/.test(l) || /^STYLE\b/.test(l) || /^REGION\b/.test(l) || /^Kind:/.test(l) || /^Language:/.test(l)) { i++; continue; }
    if (TIME.test(l) || (lines[i + 1] && TIME.test(lines[i + 1].trim()))) {
      if (!TIME.test(l)) i++; // a cue identifier line precedes the timing line
      i++;
      const textLines = []; while (i < lines.length && lines[i].trim()) textLines.push(lines[i]), i++;
      const raw = textLines.join(" ");
      const v = /^\s*<v(?:\.[^\s>]*)?\s+([^>]+)>/.exec(raw);
      const speaker = v ? clip(v[1]) : "";
      const text = clip(raw.replace(/<v[^>]*>/g, "").replace(/<\/v>/g, "").replace(/<\d{2}:\d{2}:\d{2}[.,]\d{3}>/g, "").replace(/<\/?c[^>]*>/g, "").replace(/&nbsp;/g, " "));
      if (text) cues.push({ speaker, text });
      continue;
    }
    i++;
  }
  return cues;
}
function cuesFromSrt(body) {
  const blocks = String(body || "").replace(/\r/g, "").split(/\n\s*\n/);
  const cues = [];
  for (const b of blocks) {
    const lines = b.split("\n").map(x => x.trim()).filter(Boolean);
    const ti = lines.findIndex(x => TIME.test(x)); if (ti === -1) continue;
    const raw = lines.slice(ti + 1).join(" ").replace(/<[^>]+>/g, " ").replace(/\{[^}]*\}/g, " ");
    const m = /^([A-Z][A-Za-z .'\-]{1,40}):\s+(.*)$/.exec(clip(raw));
    const text = clip(m ? m[2] : raw); if (text) cues.push({ speaker: m ? m[1] : "", text });
  }
  return cues;
}
/* Podcasting 2.0 JSON: {version, segments:[{speaker, startTime, endTime, body}]}. Also tolerates {transcript:[...]} and
   an array of segments. */
function cuesFromJson(body) {
  let d = body; if (typeof d === "string") d = JSON.parse(d);
  const segs = Array.isArray(d) ? d : (d && (d.segments || d.transcript || d.utterances)) || [];
  if (!Array.isArray(segs)) throw new Error("no segments in the JSON transcript");
  return segs.map(s => ({ speaker: clip(s && (s.speaker || s.speaker_name || s.name) || ""), text: clip(s && (s.body || s.text || s.transcript) || "") })).filter(c => c.text);
}
/* YouTube json3: {events:[{segs:[{utf8}], tStartMs, dDurationMs}]}. */
function cuesFromJson3(body) {
  let d = body; if (typeof d === "string") d = JSON.parse(d);
  return ((d && Array.isArray(d.events) ? d.events : [])).map(e => ({ speaker: "", text: clip((e && Array.isArray(e.segs) ? e.segs : []).map(s => s && s.utf8 || "").join("")) })).filter(c => c.text);
}

/* YouTube's automatic captions repeat each line as the next one scrolls in; a cue that merely repeats the previous
   cue's text, or is its prefix/suffix, is dropped. */
function dedupeRolling(cues) {
  const out = [];
  for (const c of cues) {
    const prev = out[out.length - 1];
    if (prev && prev.speaker === c.speaker) {
      if (prev.text === c.text) continue;
      if (c.text.startsWith(prev.text)) { prev.text = c.text; continue; }
      if (prev.text.endsWith(c.text)) continue;
    }
    out.push({ speaker: c.speaker, text: c.text });
  }
  return out;
}

/* Cues to the app's text: consecutive cues by the same speaker become one "NAME: ..." line; without speakers, cues are
   joined into paragraphs that end at a sentence end once they are long enough. */
function cuesToText(cues) {
  cues = dedupeRolling(cues);
  const speakers = cues.some(c => c.speaker);
  if (speakers) {
    const lines = []; let cur = null;
    for (const c of cues) {
      const sp = (c.speaker || "SPEAKER").toUpperCase().replace(/\s+/g, " ").slice(0, 40);
      if (cur && cur.speaker === sp) cur.text += " " + c.text; else { cur = { speaker: sp, text: c.text }; lines.push(cur); }
    }
    return { text: lines.map(l => l.speaker + ": " + l.text).join("\n"), speakers: Array.from(new Set(lines.map(l => l.speaker))), cues: cues.length };
  }
  const paras = []; let buf = "";
  for (const c of cues) {
    buf = buf ? buf + " " + c.text : c.text;
    if (buf.length > 500 && /[.!?]["”’)]?$/.test(buf)) { paras.push(buf); buf = ""; }
  }
  if (buf) paras.push(buf);
  return { text: paras.join("\n\n"), speakers: [], cues: cues.length };
}

/* Any transcript body to text, by declared type, then by sniffing. Returns {text, speakers, format, cues}. */
function transcriptToText(body, type, url) {
  const t = String(type || "").toLowerCase().split(";")[0].trim(), u = String(url || "");
  const isJson = /json/.test(t) || /\.json(\?|$)/i.test(u);
  const str = Buffer.isBuffer(body) ? body.toString("utf8") : (typeof body === "string" ? body : JSON.stringify(body));
  const head = str.replace(/^﻿/, "").trimStart().slice(0, 200);
  let format;
  if (isJson || (/^[\[{]/.test(head) && !/html/.test(t))) format = "json";
  else if (/vtt/.test(t) || /^WEBVTT/.test(head) || /\.vtt(\?|$)/i.test(u)) format = "vtt";
  else if (/srt|subrip/.test(t) || /\.srt(\?|$)/i.test(u) || /^\d+\s*\n\s*\d{1,2}:\d{2}:\d{2},\d{3}\s+-->/.test(head)) format = "srt";
  else if (/html/.test(t) || /^\s*<(!doctype|html|head|body|div|p)\b/i.test(head)) format = "html";
  else format = "text";
  let cues;
  if (format === "json") { const d = JSON.parse(str.replace(/^﻿/, "")); cues = d && Array.isArray(d.events) ? cuesFromJson3(d) : cuesFromJson(d); }
  else if (format === "vtt") cues = cuesFromVtt(str);
  else if (format === "srt") cues = cuesFromSrt(str);
  else if (format === "html") { const r = htmlToText(str); return Object.assign({ format, title: r.title }, plainToText(r.text)); }
  else return Object.assign({ format }, plainToText(str));
  return Object.assign({ format }, cuesToText(cues));
}
/* Plain text may already carry "NAME: words" lines; it is passed through as is after whitespace cleanup. */
function plainToText(s) {
  const text = String(s || "").replace(/\r/g, "").split("\n").map(l => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const speakers = Array.from(new Set((text.match(/^[A-Z][A-Z0-9 .'\-]{1,40}(?=:\s)/gm) || []).map(x => x.trim())));
  return { text, speakers, cues: 0 };
}

module.exports = { transcriptToText, cuesFromVtt, cuesFromSrt, cuesFromJson, cuesFromJson3, cuesToText, dedupeRolling };
