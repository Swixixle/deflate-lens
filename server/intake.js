"use strict";
const shared = require("../shared/transcript");
const { autoTitle, sha256 } = require("./store");
const { transcriptToText } = require("./podcast/transcripts");

// Trim only material outside a clearly labelled dialogue. Keep every word between the first
// speaker and an explicit end marker; the original upload is saved separately by the store.
function cleanText(raw) {
  const original = String(raw || "");
  let text = original.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!text) throw Object.assign(new Error("Upload a transcript or paste something to read."), { status: 400 });
  if (text.length > 5 * 1024 * 1024) throw Object.assign(new Error("This file is over 5 MB. Upload a shorter transcript."), { status: 400 });
  let converted = "";
  if (/^[\[{]/.test(text)) {
    let data; try { data = JSON.parse(text); } catch (_) {}
    if (data && typeof data.transcript === "string") text = data.transcript.trim();
    else if (data && (Array.isArray(data) || Array.isArray(data.segments) || Array.isArray(data.events) || Array.isArray(data.utterances))) { text = transcriptToText(text, "application/json", "upload.json").text.trim(); converted = "JSON transcript"; }
    else if (data && typeof data === "object") throw Object.assign(new Error("This JSON file has no transcript text to read. Upload the transcript file instead."), { status: 400, code: "no_transcript" });
  } else if (/^WEBVTT/.test(text) || /^\d+\s*\n\s*\d{1,2}:\d{2}:\d{2},\d{3}\s+-->/.test(text)) {
    // A caption file (.vtt, .srt): timings, cue numbers and tags are dropped, voice tags become "NAME:" lines, and
    // YouTube's rolling captions keep each line once. The upload itself is kept unchanged with the run.
    const out = transcriptToText(text, /^WEBVTT/.test(text) ? "text/vtt" : "application/x-subrip", "upload");
    text = out.text.trim(); converted = (out.format === "vtt" ? "WebVTT" : "SRT") + " captions" + (out.rolling ? " (rolling captions, each line kept once)" : "");
  }
  const lines = text.split("\n"), counts = new Map();
  const label = line => (line.match(/^\s*([A-Z][A-Za-z0-9 .'\-]{0,40}?)\s*:\s+\S/) || [])[1];
  for (const line of lines) { const k = label(line); if (k) counts.set(k, (counts.get(k) || 0) + 1); }
  const repeated = new Set([...counts].filter(([, n]) => n >= 2).map(([k]) => k));
  const first = lines.findIndex(line => repeated.has(label(line)));
  let removedBefore = 0, removedAfter = 0;
  if (first >= 0 && [...counts.values()].reduce((n, v) => n + v, 0) >= 3) {
    removedBefore = first;
    const ending = lines.findIndex((line, i) => i > first && /^\s*End of (?:the )?(?:interview|transcript|conversation)[.!]?\s*$/i.test(line));
    if (ending >= 0) { removedAfter = lines.length - ending; text = lines.slice(first, ending).join("\n").trim(); }
    else text = lines.slice(first).join("\n").trim();
  }
  if (!text) throw Object.assign(new Error("There is no transcript text in this file."), { status: 400 });
  return { text, original, record: { originalHash: sha256(original), cleanedHash: sha256(text), originalChars: original.length,
    cleanedChars: text.length, removedBefore, removedAfter, changed: text !== original, converted, method: (converted ? "Converted from " + converted + " to text. " : "") + "Only outside-dialogue material and an explicit end marker are removed; spoken words are kept." } };
}

async function readInput(input, context, importer) {
  const raw = String(input || ""), detected = shared.detectKind(raw), doc = Object.assign({}, context || {});
  let imported = null;
  if (detected.kind === "link") {
    imported = await importer(detected.url);
    if (!imported.ok) throw Object.assign(new Error(imported.reason || "Could not read this link. Upload or paste the transcript instead."), { status: 422, code: "import_failed" });
  }
  const cleaned = cleanText(imported ? imported.text : raw);
  const kind = shared.detectKind(cleaned.text);
  doc.kind = kind.kind === "claim" ? "claim" : "transcript";
  delete doc.parseMode; delete doc.provenance; delete doc.status;
  if (imported) {
    // The fetched address is always the source of this input, including when an old form
    // still contains another interview's URL.
    doc.sourceUrl = imported.url || detected.url;
    doc.sourceLabel = imported.title || "";
    doc.import = { url: doc.sourceUrl, title: imported.title || "", fetchedAt: imported.fetchedAt, chars: cleaned.text.length, method: imported.method };
    if (!doc.title || /^(?:Listen LIVE|Untitled run)$/i.test(doc.title) || doc.title === autoTitle(raw, doc.kind)) doc.title = imported.title || autoTitle(cleaned.text, doc.kind);
  }
  return { doc, text: cleaned.text, original: cleaned.original, intake: Object.assign(cleaned.record, { source: imported ? "link" : (doc.import && doc.import.source ? "transcript-chain" : "upload-or-paste"), url: imported ? doc.sourceUrl : (doc.import && doc.import.url) || "", at: new Date().toISOString() }) };
}

module.exports = { cleanText, readInput };
