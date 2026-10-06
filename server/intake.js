"use strict";
const shared = require("../shared/transcript");
const { autoTitle, sha256 } = require("./store");
const { transcriptToText } = require("./podcast/transcripts");
const { separatePageText, paragraphTimes } = require("./webtranscript");

// Never delete the text's own words. Remove only what format evidence identifies: caption syntax (cue numbers and
// timings, at caption conversion), a web page's controls and timestamps (webtranscript.js), and what follows an
// explicit end marker of a dialogue ("End of interview."). The original upload is saved separately by the store.
/* `opts.captions === false` (used when an already-saved run is read again) leaves caption syntax alone, so a run saved
   before caption conversion existed is never re-parsed, renumbered or made stale by a newer parser. `opts.article`
   (new input a page importer read as an article): colon-heading lines are headings, not speakers, unless the text is
   clearly a conversation.
   History. Up to 0.14.5 everything before a text's first labelled line was cut as "outside the dialogue"; a review
   showed it cut an article's opening qualification — the trial took only adults, so its findings say nothing about
   children — because "Results:" twice and "Methods:" once read as a dialogue. 0.14.6 kept leading prose but still cut
   leading lines it took for page chrome by their shape (fewer than eight words, no sentence end), and a review of 0.14.6
   showed what that cost: "Children excluded." and "Adults only" were cut the same way. Shape is not evidence that words
   are disposable. Since 0.14.7 nothing before the first labelled line is removed: it stays as words of the text
   attributed to no one (preparation does not audit it, and it cannot hold the reading). */
function cleanText(raw, opts) {
  const original = String(raw || "");
  let text = original.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!text) throw Object.assign(new Error("Upload a transcript or paste something to read."), { status: 400 });
  if (text.length > 5 * 1024 * 1024) throw Object.assign(new Error("This file is over 5 MB. Upload a shorter transcript."), { status: 400 });
  let converted = "";
  if (/^[\[{]/.test(text)) {
    let data; try { data = JSON.parse(text); } catch (_) {}
    if (data && typeof data.transcript === "string") text = data.transcript.trim();
    else if (!(opts && opts.captions === false) && data && (Array.isArray(data) || Array.isArray(data.segments) || Array.isArray(data.events) || Array.isArray(data.utterances))) { text = transcriptToText(text, "application/json", "upload.json").text.trim(); converted = "JSON transcript"; }
    else if (data && typeof data === "object") throw Object.assign(new Error("This JSON file has no transcript text to read. Upload the transcript file instead."), { status: 400, code: "no_transcript" });
  } else if (!(opts && opts.captions === false) && (/^WEBVTT/.test(text) || /^\d+\s*\n\s*\d{1,2}:\d{2}:\d{2},\d{3}\s+-->/.test(text))) {
    // A caption file (.vtt, .srt): timings, cue numbers and tags are dropped, voice tags become "NAME:" lines, and
    // YouTube's rolling captions keep each line once. The upload itself is kept unchanged with the run.
    const out = transcriptToText(text, /^WEBVTT/.test(text) ? "text/vtt" : "application/x-subrip", "upload");
    text = out.text.trim(); converted = (out.format === "vtt" ? "WebVTT" : "SRT") + " captions" + (out.rolling ? " (rolling captions, each line kept once)" : "");
  }
  // a transcript copied from a web page: its controls and timestamps leave the spoken text, its speaker names become
  // labels, and each paragraph keeps its start time beside the text (webtranscript.js). New input only: a saved run is
  // never re-cleaned behind the person's back (`opts.web === false`); Controls offers it instead.
  let web = null;
  if (!converted && !(opts && opts.web === false)) { const w = separatePageText(text); if (w.changed) { text = w.text.trim(); web = w; } }
  const label = line => (line.match(/^\s*([A-Z][A-Za-z0-9 .'\-]{0,40}?)\s*:\s+\S/) || [])[1];
  // a source's speaker label written mid-line ("HOST: So the issue is— GUEST: The cost.") starts a turn of its own;
  // only labels the source also uses at the start of a line, and only after a sentence end or a dash; no word changes
  let inlineSplits = 0;
  {
    const seen = new Map(); for (const line of text.split("\n")) { const k = label(line); if (k) seen.set(k, (seen.get(k) || 0) + 1); }
    const known = [...seen.keys()].filter(k => k.length >= 2).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (known.length >= 2 && [...seen.values()].reduce((a, b) => a + b, 0) >= 2) {
      const re = new RegExp("([.?!…—–-][\"”')]?)[ \\t]+(?=(?:" + known.join("|") + "):\\s)", "g");
      text = text.split("\n").map(line => label(line) ? line.replace(re, (m, c) => { inlineSplits++; return c + "\n"; }) : line).join("\n");
    }
  }
  const lines = text.split("\n"), counts = new Map();
  for (const line of lines) { const k = label(line); if (k) counts.set(k, (counts.get(k) || 0) + 1); }
  const repeated = new Set([...counts].filter(([, n]) => n >= 2).map(([k]) => k));
  const labelledTotal = [...counts.values()].reduce((n, v) => n + v, 0);
  const firstLab = counts.size ? lines.findIndex(line => counts.has(label(line))) : -1;
  // anything before the first labelled line: the text's own words, whatever their length or punctuation (0.14.7)
  const leadingWords = firstLab > 0 && lines.slice(0, firstLab).some(l => l.trim());
  // dialogue evidence, as distinct from prose under section headings: a conversation (at least two labels that each
  // speak more than once, over at least four labelled lines), or labels written the way transcripts write speakers —
  // in capitals ("HOST:", "DANA REYES:"), a numbered or lettered voice ("Speaker 2:", "Q:"), or a role ("Interviewer:",
  // "Host:"). Repeated colon headings alone ("Results:" twice, "Methods:" once) are neither.
  const conversation = [...counts.values()].filter(n => n >= 2).length >= 2 && labelledTotal >= 4;
  const speakerForm = k => { const letters = k.replace(/[^A-Za-z]/g, ""); return (letters && letters === letters.toUpperCase()) || shared.nameable(k.toUpperCase()); };
  const prose = firstLab >= 0 && !conversation && ![...counts.keys()].every(speakerForm) && (leadingWords || !!(opts && opts.article));
  let removedAfter = 0;
  if (!prose && firstLab >= 0 && repeated.size && labelledTotal >= 3) {
    // an explicit end marker is the source saying where the dialogue stops: what follows it is not the text's
    const ending = lines.findIndex((line, i) => i > firstLab && /^\s*End of (?:the )?(?:interview|transcript|conversation)[.!]?\s*$/i.test(line));
    if (ending >= 0) { removedAfter = lines.length - ending; text = lines.slice(0, ending).join("\n").trim(); }
  }
  const removedBefore = 0;
  if (!text) throw Object.assign(new Error("There is no transcript text in this file."), { status: 400 });
  const starts = web ? paragraphTimes(text, web.paragraphs) : null;
  return { text, original, record: Object.assign({ originalHash: sha256(original), cleanedHash: sha256(text), originalChars: original.length,
    cleanedChars: text.length, removedBefore, removedAfter, changed: text !== original, converted, method: (converted ? "Converted from " + converted + " to text. " : "") + (web ? web.record.method + " " : "") +
      (prose ? "Read as prose: every word is kept, and a line like “Results:” is a section heading, not a speaker." : "Every word is kept; only what follows an explicit end marker is removed. Words before the first speaker label are kept as the text's own, attributed to no one."),
    web: web ? web.record : null, inlineLabelsSplit: inlineSplits, timing: starts ? { cleanedHash: sha256(text), unit: "paragraph", starts } : null }, prose ? { prose: true } : {}) };
}

async function readInput(input, context, importer) {
  const raw = String(input || ""), detected = shared.detectKind(raw), doc = Object.assign({}, context || {});
  let imported = null;
  if (detected.kind === "link") {
    imported = await importer(detected.url);
    if (!imported.ok) throw Object.assign(new Error(imported.reason || "Could not read this link. Upload or paste the transcript instead."), { status: 422, code: "import_failed" });
  }
  // a page read as an article (this importer's html-text, or the transcript chain's "page text"): its colon headings
  // are headings unless the text is clearly a conversation (cleanText)
  const article = imported ? imported.method === "html-text" : (doc.import && doc.import.method) === "page text";
  const cleaned = cleanText(imported ? imported.text : raw, article ? { article: true } : undefined);
  const kind = shared.detectKind(cleaned.text);
  // words the transcript chain brought (a feed's transcript, captions, a recording turned into text) are a transcript
  // however short they are; only typed or pasted input can be a single claim
  doc.kind = kind.kind === "claim" && !(doc.import && doc.import.source) ? "claim" : "transcript";
  delete doc.parseMode; delete doc.provenance; delete doc.status;
  // read as an article: every line its own turn, no line dropped, nothing a speaker (0.14.7; 0.14.6 called it "prose")
  if (cleaned.record.prose && doc.kind === "transcript") doc.parseMode = "article";
  if (imported) {
    // The fetched address is always the source of this input, including when an old form
    // still contains another interview's URL.
    doc.sourceUrl = imported.url || detected.url;
    doc.sourceLabel = imported.title || "";
    doc.import = { url: doc.sourceUrl, title: imported.title || "", fetchedAt: imported.fetchedAt, chars: cleaned.text.length, method: imported.method };
    if (!doc.title || /^(?:Listen LIVE|Untitled run)$/i.test(doc.title) || doc.title === autoTitle(raw, doc.kind)) doc.title = imported.title || autoTitle(cleaned.text, doc.kind);
  }
  // new input gets the speaker structure worked out at the start of its first reading (structure.js); saved runs only on request
  return { doc, text: cleaned.text, original: cleaned.original, intake: Object.assign(cleaned.record, { speakers: "auto", source: imported ? "link" : (doc.import && doc.import.source ? "transcript-chain" : "upload-or-paste"), url: imported ? doc.sourceUrl : (doc.import && doc.import.url) || "", at: new Date().toISOString() }) };
}

module.exports = { cleanText, readInput };
