"use strict";
/* A transcript copied from a web page carries the page with it: a "Copy link" button and a timestamp before every
   paragraph (Happy Scribe and similar pages), a speaker name and time on a line of their own (Otter, Rev, many podcast
   sites), a time at the start of every line (Descript and caption tools), or a time between every few words (YouTube's
   transcript panel). Read as text, those controls and times end up inside the passages and inside the quotes.

   separatePageText() takes them out of the spoken text and keeps what they say as structure:
     - a timestamp becomes the start time of its paragraph (kept beside the text, never in it);
     - a speaker name given by the source becomes a "NAME: words" label, exactly like any labelled transcript;
     - page controls are dropped and counted;
     - ">>" (the caption convention for "a different person speaks") starts a new paragraph and is counted.
   Every other character of every spoken line is kept in order; a check compares the words before and after and the
   function changes nothing if they differ. It acts only on a consistent pattern (a control or a time that repeats),
   so a sentence that happens to contain "10:30" or a paragraph that says "Share" is left alone. The original upload is
   kept unchanged by the store. Paragraph breaks are never treated as changes of speaker. */
const shared = require("../shared/transcript");

const TIME_PART = "((?:\\d{1,2}:)?\\d{1,2}:\\d{2})(?:[.,]\\d{1,3})?";
const TIME = new RegExp("^[\\[(]?" + TIME_PART + "[\\])]?$");
const LEAD = new RegExp("^[\\[(]?" + TIME_PART + "[\\])]?\\s*(?:[-–—|:]\\s*)?(\\S.*)$");
const HEADER_GAP = new RegExp("^(.{1,40}?)(?:\\s{2,}|\\t+|\\s+[-–—|·]\\s+)[\\[(]?" + TIME_PART + "[\\])]?$");
// "Speaker 1 (00:00):" or "Speaker 1 (00:00)" alone on its line; a time in parentheses inside a sentence is not a header
const HEADER_PAREN = new RegExp("^(.{1,40}?)\\s*[\\[(]" + TIME_PART + "[\\])]\\s*(?::\\s*(.*))?$");
const CONTROLS = ["copy link", "copy", "copied", "link copied", "share", "share link", "copy timestamp", "copy text", "copy transcript", "play", "pause", "show more", "show less", "read more", "see more", "translate", "edit", "expand", "collapse", "jump to", "like", "reply", "more"];
const NAME = /^[A-Z][A-Za-z0-9 .'\-]{0,39}$/;
const MARKER = /^(?:>>|&gt;&gt;)\s*/;

function seconds(t) { const p = String(t).split(":").map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; }
function clock(s) { if (s == null) return ""; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? String(h).padStart(2, "0") + ":" : "") + String(m).padStart(2, "0") + ":" + String(x).padStart(2, "0"); }
const isControl = t => CONTROLS.includes(t.toLowerCase()) && !/[.?!,;]$/.test(t);
const nameLike = t => NAME.test(t) && t.split(/\s+/).length <= 4 && !/[.?!,;:]$/.test(t) && !isControl(t) && !TIME.test(t);

function separatePageText(input) {
  const original = String(input || "").replace(/\r\n?/g, "\n");
  const lines = original.split("\n").map(l => l.replace(/ /g, " ").trim());
  const nonBlank = lines.filter(Boolean).length;
  const unchanged = { text: original, changed: false, record: null, paragraphs: null };
  if (!nonBlank) return unchanged;
  const kind = lines.map(t => {
    if (!t) return { k: "blank" };
    if (TIME.test(t)) return { k: "time", s: seconds(TIME.exec(t)[1]) };
    let m = HEADER_PAREN.exec(t); if (m && nameLike(m[1].trim())) return { k: "header", name: m[1].trim(), s: seconds(m[2]), rest: m[3] || "" };
    m = HEADER_GAP.exec(t); if (m && nameLike(m[1].trim())) return { k: "header", name: m[1].trim(), s: seconds(m[2]), rest: "" };
    if (isControl(t)) return { k: "control", label: t };
    m = LEAD.exec(t); if (m) return { k: "lead", s: seconds(m[1]), rest: m[2] };
    if (MARKER.test(t)) return { k: "marker", rest: t.replace(MARKER, "") };
    return { k: "text" };
  });
  const count = k => kind.filter(x => x.k === k).length;
  const times = count("time"), headers = count("header"), leads = count("lead"), markers = count("marker");
  const leadMode = leads >= 3 && leads >= 0.3 * nonBlank;
  const timed = times >= 2 || headers >= 2 || leadMode;
  // a control is page furniture only if it repeats and sits next to a time, a header or another control
  const neighbour = (i, dir) => { for (let j = i + dir; j >= 0 && j < lines.length; j += dir) if (kind[j].k !== "blank") return kind[j]; return null; };
  const labelCount = {}; kind.forEach(x => { if (x.k === "control") labelCount[x.label.toLowerCase()] = (labelCount[x.label.toLowerCase()] || 0) + 1; });
  const furniture = kind.map((x, i) => x.k === "control" && labelCount[x.label.toLowerCase()] >= 2 && [neighbour(i, -1), neighbour(i, 1)].some(n => n && ["time", "header", "control"].includes(n.k) || n && n.k === "lead" && leadMode));
  const useMarkers = markers >= 2;
  if (!timed && !furniture.some(Boolean) && !useMarkers) return unchanged;
  // a short name line directly before a time line, repeated, is the source's speaker name for that paragraph
  const before = {};
  kind.forEach((x, i) => { if (x.k !== "time") return; for (let j = i - 1; j >= 0; j--) { if (kind[j].k === "blank" || furniture[j]) continue; if (kind[j].k === "text" && nameLike(lines[j])) before[j] = lines[j]; break; } });
  // a pattern, not a coincidence: at least two such lines, standing before at least half of the times
  const named = Object.keys(before).length;
  const speakerLine = j => before[j] !== undefined && named >= 2 && named >= 0.5 * times;

  const blocks = []; let cur = null, pendingName = null;
  const removed = { controls: {}, timestamps: 0, speakerNames: 0, markers: 0 };
  const open = (s, speaker, why) => { cur = { start: s, speaker: speaker || null, parts: [], why }; blocks.push(cur); };
  const spoken = [];
  kind.forEach((x, i) => {
    const t = lines[i];
    if (x.k === "blank") return;
    if (furniture[i]) { const l = x.label; removed.controls[l] = (removed.controls[l] || 0) + 1; return; }
    if (speakerLine(i)) { pendingName = t; removed.speakerNames++; return; }
    if (x.k === "time" && timed) { open(x.s, pendingName, "time"); pendingName = null; removed.timestamps++; return; }
    if (x.k === "header" && timed) { open(x.s, x.name, "header"); removed.timestamps++; removed.speakerNames++; if (x.rest) { cur.parts.push(x.rest); spoken.push(x.rest); } return; }
    if (x.k === "lead" && leadMode) { open(x.s, null, "lead"); removed.timestamps++; let rest = x.rest; if (MARKER.test(rest)) { rest = rest.replace(MARKER, ""); removed.markers++; } if (rest) { cur.parts.push(rest); spoken.push(rest); } return; }
    if (x.k === "marker" && useMarkers) { open(cur ? cur.start : null, null, "marker"); removed.markers++; if (x.rest) { cur.parts.push(x.rest); spoken.push(x.rest); } return; }
    if (!cur) open(null, null, "start");
    cur.parts.push(t); spoken.push(t);
  });
  if (pendingName) { spoken.push(pendingName); removed.speakerNames--; if (cur) cur.parts.push(pendingName); else { open(null, null, "start"); cur.parts.push(pendingName); } }
  let paras = blocks.map(b => ({ start: b.start, speaker: b.speaker, text: b.parts.join(" ").replace(/\s+/g, " ").trim() })).filter(p => p.text);
  // the YouTube transcript panel: a time every few words and no speakers; the fragments are joined into paragraphs
  // (cut at a sentence end) so a few seconds of speech is not a turn of its own
  const lens = paras.map(p => p.text.length).sort((a, b) => a - b), median = lens.length ? lens[Math.floor(lens.length / 2)] : 0;
  let joined = false;
  if (paras.length >= 12 && median < 80 && !paras.some(p => p.speaker)) {
    const out = []; let acc = null;
    for (const p of paras) {
      if (!acc) acc = { start: p.start, speaker: null, text: p.text };
      else acc.text += " " + p.text;
      if (acc.text.length >= 1500 || acc.text.length >= 600 && /[.?!…]["”')]?$/.test(acc.text)) { out.push(acc); acc = null; }
    }
    if (acc) out.push(acc);
    paras = out; joined = true;
  }
  const labelled = p => p.speaker && NAME.test(p.speaker) ? p.speaker + ": " + p.text : p.text;
  const text = paras.map(labelled).join("\n\n");
  // nothing spoken may be lost or added: the same words, in the same order, once labels are set aside
  const words = paras.map(p => p.text).join(" ");
  if (shared.wordsOf(words) !== shared.wordsOf(spoken.join(" "))) return unchanged;
  const total = Object.values(removed.controls).reduce((a, b) => a + b, 0);
  if (!total && !removed.timestamps && !removed.markers && !removed.speakerNames) return unchanged;
  const format = leadMode ? "a time at the start of each line" : headers >= 2 ? "a speaker name and time above each paragraph" : removed.speakerNames ? "a speaker name and time above each paragraph" : times >= 2 ? (joined ? "a time every few words (a video transcript panel)" : "a timestamp above each paragraph") : useMarkers ? "caption speaker-change marks (>>)" : "page controls between paragraphs";
  const record = {
    format, paragraphs: paras.length, labelled: paras.filter(p => p.speaker && NAME.test(p.speaker)).length, joinedFragments: joined,
    removed: { controls: removed.controls, timestamps: removed.timestamps, speakerNameLines: removed.speakerNames, markers: removed.markers },
    method: "Page controls and timestamps were taken out of the spoken text" + (removed.speakerNames ? "; speaker names given by the page became labels" : "") + (removed.markers ? "; each \">>\" (a change of speaker in caption convention) starts a new paragraph" : "") + ". Every spoken word was kept, in order (checked). The timestamps are kept beside the text as each paragraph's start time. The original is saved unchanged.",
  };
  return { text, changed: text !== original.trim(), record, paragraphs: paras.map(p => ({ start: p.start, speaker: p.speaker || null, text: p.text })) };
}

/* The start time of each paragraph of `finalText` (blank-line separated), found by matching the paragraphs the
   separation produced, in order. Paragraphs the separation did not produce (removed by later trimming) are skipped. */
function paragraphTimes(finalText, paragraphs) {
  if (!paragraphs || !paragraphs.length) return null;
  const finals = String(finalText).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const strip = p => p.replace(/^[A-Z][A-Za-z0-9 .'\-]{0,40}?:\s+/, "");
  let j = 0; const starts = [];
  for (const f of finals) {
    while (j < paragraphs.length && paragraphs[j].text !== strip(f) && paragraphs[j].text !== f) j++;
    if (j >= paragraphs.length) return null;
    starts.push(paragraphs[j].start); j++;
  }
  return starts.some(s => s != null) ? starts : null;
}

module.exports = { separatePageText, paragraphTimes, clock, seconds, CONTROLS };
