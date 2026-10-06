/* Deflate Lens shared helpers: transcript parsing, quote verification, attribution signature.
   Plain script: works in the browser (window.DeflateShared) and in Node (module.exports). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DeflateShared = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var LABEL_RE = /^\s*([A-Z][A-Za-z0-9 .'\-]{0,40}?)\s*:\s+(.*)$/;

  /* Deterministic: the same text always yields the same turn numbering. Turn numbers are what
     passages and quotes refer to, so this function must not change behaviour without a data migration.
     opts.mode: "transcript" (default; the heading heuristics below, as every run saved before 0.6.0 was parsed)
                "text"       (no heading heuristics: every paragraph or labelled line is a turn; a short line with
                              no final punctuation is content, not a heading)
                "prose"      (an article or other prose, 0.14.6: every line is its own turn and NOTHING is a speaker
                              label, so "Results:" or "Methods:" at a line's start stays part of the text as a section
                              heading). New runs record their mode; a saved run is never re-read under another one. */
  function parseTranscript(text, opts) {
    var mode = (opts && opts.mode) || "transcript";
    if (mode === "prose") return parseProse(text);
    if (mode === "text") return parseText(text);
    var raw = String(text || "").replace(/\r/g, "");
    var lines = raw.split("\n").filter(function (l) {
      if (/^\s*\d+\s*$/.test(l)) return false;                       // SRT cue numbers
      if (/^\s*\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(l)) return false; // SRT/VTT timestamps
      if (/^WEBVTT/.test(l)) return false;
      return true;
    });
    var turns = [], cur = null, lastSpeaker = null;
    lines.forEach(function (line) {
      var t = line.trim();
      if (!t) { if (cur) cur.text += "\n"; return; }
      var m = LABEL_RE.exec(t);
      if (m && m[1].length <= 40 && m[1].split(" ").length <= 4) {
        cur = { label: m[1].trim().toUpperCase(), text: m[2].trim(), heading: false };
        lastSpeaker = cur.label;
        turns.push(cur);
        return;
      }
      var isHeading = t.length < 90 && !/[.?!…"”)]$/.test(t) && /^[A-Z0-9“"'(]/.test(t) && !/^[a-z]/.test(t) && (!cur || cur.text.trim().length > 0);
      if (isHeading && (!cur || !/[,:;\-–—]$/.test(cur.text.trim()))) {
        cur = { label: "§", text: t, heading: true };
        turns.push(cur);
        return;
      }
      if (!cur || cur.heading) {
        // text after a section heading continues the last speaker
        cur = { label: lastSpeaker || "UNLABELED", text: t, heading: false, cont: true };
        turns.push(cur);
        return;
      }
      cur.text = (cur.text.trim() + " " + t).trim();
    });
    turns.forEach(function (t) { t.text = t.text.replace(/\s+/g, " ").trim(); });
    // a label used exactly once on a short, unpunctuated line is a heading with a colon, not a speaker
    var counts = {};
    turns.forEach(function (t) { if (!t.heading) counts[t.label] = (counts[t.label] || 0) + 1; });
    turns.forEach(function (t) {
      if (!t.heading && !t.cont && counts[t.label] === 1 && t.text.length < 70 && !/[.?!…"”]$/.test(t.text)) {
        t.heading = true;
        t.text = t.label.split(" ").map(function (w) { return w[0] + w.slice(1).toLowerCase(); }).join(" ") + ": " + t.text;
        t.label = "§";
      }
    });
    turns.forEach(function (t, i) { t.i = i; });
    return turns;
  }

  function parseText(text) {
    var raw = String(text || "").replace(/\r/g, "");
    var lines = raw.split("\n").filter(function (l) { return !/^\s*\d+\s*$/.test(l) && !/^\s*\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(l) && !/^WEBVTT/.test(l); });
    var turns = [], cur = null;
    lines.forEach(function (line) {
      var t = line.trim();
      if (!t) { cur = null; return; }
      var m = LABEL_RE.exec(t);
      if (m && m[1].length <= 40 && m[1].split(" ").length <= 4 && m[2].trim()) { cur = { label: m[1].trim().toUpperCase(), text: m[2].trim(), heading: false }; turns.push(cur); return; }
      if (!cur) { cur = { label: "UNLABELED", text: t, heading: false }; turns.push(cur); return; }
      cur.text = (cur.text + " " + t).trim();
    });
    turns.forEach(function (t, i) { t.text = t.text.replace(/\s+/g, " ").trim(); t.i = i; });
    return turns;
  }

  function parseProse(text) {
    var raw = String(text || "").replace(/\r/g, "");
    var lines = raw.split("\n").filter(function (l) { return !/^\s*\d+\s*$/.test(l) && !/^\s*\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(l) && !/^WEBVTT/.test(l); });
    var turns = [];
    lines.forEach(function (line) { var t = line.trim(); if (t) turns.push({ label: "UNLABELED", text: t, heading: false }); });
    turns.forEach(function (t, i) { t.text = t.text.replace(/\s+/g, " ").trim(); t.i = i; });
    return turns;
  }

  /* What a pasted text looks like: a link, a claim (one short paragraph, no speaker labels), or a transcript. */
  function detectKind(text) {
    var t = String(text || "").trim();
    if (!t) return { kind: "empty" };
    if (/^https?:\/\/\S+$/i.test(t)) return { kind: "link", url: t };
    var labels = speakerLabels(parseText(t)).filter(function (l) { return l !== "UNLABELED"; });
    var paragraphs = t.split(/\n\s*\n|\n/).filter(function (x) { return x.trim(); }).length;
    if (labels.length === 0 && t.length <= 600 && paragraphs <= 2) return { kind: "claim", labels: [] };
    return { kind: "transcript", labels: labels, paragraphs: paragraphs, unlabeled: labels.length === 0 };
  }

  /* A turn or paragraph number as a model gives it (0.14.6): a whole number from 0, or a string of digits only. Anything
     else (missing, null, true, "", "abc", 0.5, -1) names no turn and is never coerced into one: Number(null) and
     Number("") are 0 and Number(true) is 1, which would bind words to a turn the answer never named. Returns { n, why }:
     n is NaN when the value names no turn, and why then says what was given. */
  function refNumber(v) {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return { n: v, why: "" };
    if (typeof v === "string" && /^\d{1,9}$/.test(v)) return { n: Number(v), why: "" };
    var shown = v === undefined || v === null || v === "" ? "" : typeof v === "string" ? "“" + v.slice(0, 20) + "”" : typeof v === "number" ? String(v) : String(JSON.stringify(v)).slice(0, 20);
    return { n: NaN, why: shown ? shown + " is not a turn number" : "no turn number given" };
  }

  function speakerLabels(turns) {
    var seen = {}, out = [];
    turns.forEach(function (t) { if (!t.heading && !seen[t.label]) { seen[t.label] = true; out.push(t.label); } });
    return out;
  }

  /* Word-level normalisation for quote checks: lower-case, typographic quotes/dashes/ellipses unified, punctuation
     dropped except apostrophes inside words, whitespace collapsed. Transcript punctuation is the transcriber's, not the
     speaker's, so a quote that differs only in commas still counts as the speaker's words. */
  function normQ(s) {
    return String(s || "").toLowerCase()
      .replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2026/g, "...")
      .replace(/[\u2013\u2014]/g, "-").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }
  /* Words for matching. Tolerated differences, exactly: letter case; typographic quotes, apostrophes, dashes and
     ellipses (unified); whitespace runs; punctuation that is not attached to a number; bracketed insertions (gaps).
     Kept, because they carry meaning: digits; a decimal point, comma or dash BETWEEN digits ("1.5", "1,000", "1-5");
     a sign before a digit ("-5", "+3"); a percent or degree sign after a digit ("5%", "5°"); a currency sign before a
     digit ("$599"); apostrophes inside words. So "1.5%" ≠ "1-5%", "-5" ≠ "5", "no treatment" ≠ "treatment". */
  function wordsOf(s) {
    var t = normQ(s).replace(/\.\.\./g, " ");
    var out = [];
    t.split(/\s+/).forEach(function (tok) {
      if (!tok) return;
      // strip leading punctuation except a sign or currency mark directly before a digit
      tok = tok.replace(/^[^a-z0-9\u00c0-\u024f$+\-]+/, "").replace(/^([$+\-])(?![0-9$+\-])/, "");
      // strip trailing punctuation except % or ° directly after a digit
      tok = tok.replace(/[^a-z0-9\u00c0-\u024f%\u00b0]+$/, "").replace(/([^0-9])[%\u00b0]+$/, "$1");
      // inside: keep . , - between digits and apostrophes between letters; everything else becomes a split
      var parts = tok.split(/(?<![0-9])[.,\-](?![0-9])|(?<![a-z\u00c0-\u024f])'|'(?![a-z\u00c0-\u024f])|[^a-z0-9\u00c0-\u024f'.,\-%\u00b0$+]+/).filter(Boolean);
      parts.forEach(function (x) { if (x) out.push(x); });
    });
    return out.join(" ");
  }
  /* Split on … and on any [bracketed insertion]: words in brackets are the writer's, not the speaker's, so they
     are a gap to skip, never words to find. Every non-empty fragment is kept: "no … treatment helps" must find "no". */
  function fragmentsOf(quote) {
    return normQ(quote).split(/\.\.\.|\[[^\]]*\]/).map(wordsOf).filter(function (f) { return f.length > 0; });
  }
  /* Finds `needle` (normalised words) in `hay` (normalised words) at a word boundary, searching from `from`.
     Returns the index of the match or -1. */
  function findWords(hay, needle, from) {
    var i = hay.indexOf(needle, from || 0);
    while (i !== -1) {
      var before = i === 0 || hay[i - 1] === " ", after = i + needle.length === hay.length || hay[i + needle.length] === " ";
      if (before && after) return i;
      i = hay.indexOf(needle, i + 1);
    }
    return -1;
  }

  /* Spoken numbers. A transcript made from audio writes what the transcriber heard: "fifteen percent", "nineteen
     ninety-eight", "one point five", "five hundred dollars", "1,000". A card quoting it may write "15%", "1998", "1.5",
     "$500", "1000". The strict check (above) treats those as different words, and it should: the strict result is the
     one reported. This pass is tried only when the strict check fails, applied to BOTH sides the same way, and a match
     found through it is reported as "matched, with numbers written differently", never as plain "matched".
     Exactly these forms are folded: number words (zero to trillion, with "and", "a hundred", hyphenated tens) to
     digits; "X point Y Z" to a decimal; two tens-or-teens in a row with no scale word ("nineteen ninety eight",
     "twenty twenty") to a four-digit year; "percent"/"per cent" after a number to "%"; "dollars" after a number to a
     "$" before it; a comma between digits dropped. Nothing else: "half", "a couple", "dozen", ordinals and fractions
     stay words, so "half a million" never matches "500,000". */
  var NUM_SMALL = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  var NUM_TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  var NUM_SCALE = { hundred: 100, thousand: 1000, million: 1000000, billion: 1000000000, trillion: 1000000000000 };
  function readNumber(toks, i) {
    var j = i, total = 0, cur = 0, high = null, any = false, scaled = false, lastKind = "", lastScale = Infinity, hundred = false;
    if ((toks[j] === "a" || toks[j] === "an") && NUM_SCALE[toks[j + 1]]) { cur = 1; j++; any = true; lastKind = "small"; }
    for (; j < toks.length; j++) {
      var w = toks[j];
      if (w === "and" && any && lastKind === "scale" && (NUM_SMALL[toks[j + 1]] != null || NUM_TENS[toks[j + 1]])) continue;
      if (NUM_SMALL[w] != null) {
        // "nineteen eighteen", "twenty fifteen": a teen after a tens-or-teen with no scale word is the low half of a year
        if (lastKind === "small" && NUM_SMALL[w] >= 10) { if (cur >= 10 && cur <= 99 && !scaled && high === null) { high = cur; cur = 0; } else break; }
        else if (lastKind === "small" && !(cur % 10 === 0 && cur >= 20)) break; // "one two" stays two numbers; "twenty one" is one
        cur += NUM_SMALL[w]; any = true; lastKind = "small";
      } else if (NUM_TENS[w]) {
        if (lastKind === "small") { if (cur >= 10 && cur <= 99 && !scaled && high === null) { high = cur; cur = 0; } else break; }
        cur += NUM_TENS[w]; any = true; lastKind = "small";
      } else if (NUM_SCALE[w]) {
        if (!any) break;
        // Only descending cardinal scales are supported. Never guess at a repeated/ascending scale,
        // mix a year with a scale, or substitute one for an explicitly spoken zero.
        if (high !== null) return null;
        if (w === "hundred") { if (hundred || lastKind === "scale") return null; cur *= 100; hundred = true; }
        else { if (NUM_SCALE[w] >= lastScale || lastKind === "scale" && !hundred) return null; total += cur * NUM_SCALE[w]; cur = 0; scaled = true; lastScale = NUM_SCALE[w]; hundred = false; }
        any = true; lastKind = "scale";
      } else break;
    }
    if (!any) return null;
    var value = high !== null ? high * 100 + cur : total + cur;
    if (!Number.isSafeInteger(value)) return null;
    var text = String(value);
    if (toks[j] === "point" && NUM_SMALL[toks[j + 1]] != null && NUM_SMALL[toks[j + 1]] < 10) { j++; var dec = ""; while (NUM_SMALL[toks[j]] != null && NUM_SMALL[toks[j]] < 10) { dec += NUM_SMALL[toks[j]]; j++; } text += "." + dec; }
    return { text: text, end: j };
  }
  function spokenNumbers(ws) {
    var toks = String(ws || "").split(" "), out = [], i = 0;
    while (i < toks.length) {
      var r = readNumber(toks, i);
      if (r) { out.push(r.text); i = r.end; } else { out.push(toks[i].replace(/^(\d+),(?=\d{3}(\D|$))/g, "$1").replace(/(\d),(?=\d{3}(\D|$))/g, "$1")); i++; }
    }
    return out.join(" ")
      .replace(/(\d) per ?cent\b/g, "$1%")
      .replace(/(\d[\d.]*) dollars?\b/g, "$$$1")
      .replace(/\s+/g, " ").trim();
  }
  /* The strict check first; the spoken-number fold only when it fails. Returns null, or {tolerated: []} with the
     names of the folds that were needed. */
  function matchQuote(quote, hay) {
    if (verifyQuote(quote, hay)) return { tolerated: [] };
    var parts = fragmentsOf(quote).map(spokenNumbers), hs = spokenNumbers(wordsOf(hay));
    if (!parts.length || !hs) return null;
    var pos = 0;
    for (var k = 0; k < parts.length; k++) { var i = findWords(hs, parts[k], pos); if (i === -1) return null; pos = i + parts[k].length; }
    return { tolerated: ["numbers written differently"] };
  }

  /* True when the quote's fragments (split on … or ...) appear in `hay` IN ORDER, each starting after the previous
     one ends, each at a word boundary. Proves the words are there in that order; it does not prove they mean in
     context what a card says. An unordered or overlapping splice ("B … A" taken from "A B") fails. Strict: numbers
     must be written the same way; see matchQuote for the one tolerated fold. */
  function verifyQuote(quote, hay) {
    var parts = fragmentsOf(quote), hs = wordsOf(hay);
    if (!parts.length || !hs) return false;
    var pos = 0;
    for (var k = 0; k < parts.length; k++) {
      var i = findWords(hs, parts[k], pos);
      if (i === -1) return false;
      pos = i + parts[k].length;
    }
    return true;
  }

  /* Which turns in [from, to] contain the quote. */
  function findQuoteTurns(quote, turns, from, to) {
    var out = [];
    for (var i = from; i <= to && i < turns.length; i++) { var t = turns[i]; if (!t || t.heading) continue; if (matchQuote(quote, t.text)) out.push(i); }
    return out;
  }

  /* Checks every quote and the pivot of one analysed passage against the transcript as it is NOW. Computed, never
     trusted from a client: the server runs it on every read, so a transcript edit changes the badges at once.
     For each asSaid entry it sets:
       verbatim        the words appear, in order, in the turn the card names (or, if that turn is outside the passage
                       or does not contain them, in exactly one turn of the passage, which is then recorded in foundIn)
       turnOk          the named turn lies inside the passage
       speakerNow      who the transcript (with the current attribution corrections) says spoke that turn
       speakerMismatch true when the model's speaker label disagrees with speakerNow
       foundIn         turns inside the passage that contain the quote, when the named turn does not
     and on the jump: pivotVerbatim and pivotTurns. Returns a summary {quotes, matched, mismatched, outOfRange, pivotOk}. */
  function verifyPassage(turns, overrides, passage) {
    var a = passage && passage.analysis; if (!a) return null;
    var from = Number(passage.turnStart), to = Number(passage.turnEnd);
    var summary = { quotes: 0, matched: 0, tolerated: 0, mismatched: 0, outOfRange: 0, relocated: 0, pivotOk: null };
    (a.asSaid || []).forEach(function (q) {
      var ti = Number(q.turn), t = (isFinite(ti) && turns[ti] && !turns[ti].heading) ? turns[ti] : null;
      summary.quotes++;
      q.turnOk = !!t && ti >= from && ti <= to;
      var inNamed = t ? matchQuote(q.quote, t.text) : null;
      q.foundIn = [];
      if (q.turnOk && inNamed) { q.verbatim = true; q.matchedTurn = ti; q.tolerated = inNamed.tolerated; }
      else {
        q.foundIn = findQuoteTurns(q.quote, turns, from, to);
        q.verbatim = q.foundIn.length === 1;
        q.matchedTurn = q.verbatim ? q.foundIn[0] : null;
        q.tolerated = q.verbatim ? (matchQuote(q.quote, turns[q.foundIn[0]].text) || { tolerated: [] }).tolerated : [];
        if (!q.turnOk) summary.outOfRange++;
      }
      if (q.verbatim && q.tolerated.length) summary.tolerated = (summary.tolerated || 0) + 1;
      // relocated: the words were found, but not in the turn the card names; the card must show the real turn
      q.relocated = q.verbatim && q.matchedTurn !== ti;
      if (q.relocated) summary.relocated = (summary.relocated || 0) + 1;
      var at = (q.turnOk && inNamed) ? t : (q.foundIn.length === 1 ? turns[q.foundIn[0]] : (t || null));
      q.speakerNow = at ? effSpeaker(at, overrides) : "";
      q.speakerMismatch = !!(at && q.speaker && String(q.speaker).toUpperCase() !== String(q.speakerNow).toUpperCase());
      if (q.verbatim) summary.matched++;
      if (q.speakerMismatch) summary.mismatched++;
    });
    if (a.jump && a.jump.pivot) {
      a.jump.pivotTurns = findQuoteTurns(a.jump.pivot, turns, from, to);
      a.jump.pivotVerbatim = a.jump.pivotTurns.length > 0;
      a.jump.pivotTolerated = a.jump.pivotVerbatim ? (matchQuote(a.jump.pivot, turns[a.jump.pivotTurns[0]].text) || { tolerated: [] }).tolerated : [];
      summary.pivotOk = a.jump.pivotVerbatim;
    } else if (a.jump) { a.jump.pivotVerbatim = null; a.jump.pivotTurns = []; a.jump.pivotTolerated = []; }
    return summary;
  }

  /* Signature of the attribution decisions. Changing any override changes it; confirming without
     changing overrides does not. Passages record the signature they were analysed under. */
  function attrSig(overrides) {
    var o = overrides || {};
    var keys = Object.keys(o).sort();
    var s = keys.map(function (k) { return k + "=" + o[k]; }).join("|");
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return "a" + h.toString(16) + "-" + keys.length;
  }

  function effSpeaker(turn, overrides) {
    var o = overrides || {};
    return o[String(turn.i)] || turn.label;
  }

  function fmtTurns(turns, overrides, from, to) {
    var out = [];
    for (var i = from; i <= to && i < turns.length; i++) {
      var t = turns[i]; if (!t || t.heading) continue;
      out.push("[" + t.i + "] " + effSpeaker(t, overrides) + ": " + t.text);
    }
    return out.join("\n");
  }

  /* Neighbouring turns for interpreting a passage: up to `turns` speaking turns on each side (nearest first, before and
     after in turn), whole turns only, within `chars` extra characters in total. A turn that does not fit is listed as
     omitted rather than cut mid-sentence. Context is for interpretation only: quotes and claims come from the target.
     Returns the text blocks and a record (turn ids, speakers, omissions, size, version) for the passage's provenance;
     the text itself is bound to the transcript hash the reading records, so it is not stored twice. */
  var CONTEXT_VERSION = "context-1";
  function readingContext(turns, overrides, from, to, opts) {
    var limit = (opts && opts.chars) || 4000, per = (opts && opts.turns) || 2;
    var line = function (t) { return "[" + t.i + "] " + effSpeaker(t, overrides) + ": " + t.text; };
    var before = [], after = [], omitted = [], used = 0;
    var b = from - 1, a = to + 1, nb = 0, na = 0;
    var nextB = function () { while (b >= 0 && turns[b] && turns[b].heading) b--; return b >= 0 && turns[b] ? turns[b] : null; };
    var nextA = function () { while (a < turns.length && turns[a] && turns[a].heading) a++; return a < turns.length && turns[a] ? turns[a] : null; };
    while (nb < per || na < per) {
      var progressed = false;
      if (nb < per) { var tb = nextB(); if (tb) { var lb = line(tb); if (used + lb.length + 1 <= limit) { before.unshift(tb); used += lb.length + 1; } else omitted.push({ turn: tb.i, side: "before", chars: lb.length }); b--; nb++; progressed = true; } else nb = per; }
      if (na < per) { var ta = nextA(); if (ta) { var la = line(ta); if (used + la.length + 1 <= limit) { after.push(ta); used += la.length + 1; } else omitted.push({ turn: ta.i, side: "after", chars: la.length }); a++; na++; progressed = true; } else na = per; }
      if (!progressed) break;
    }
    var beforeText = before.map(line).join("\n"), afterText = after.map(line).join("\n");
    return {
      beforeText: beforeText, afterText: afterText,
      record: { version: CONTEXT_VERSION, before: before.map(function (t) { return { turn: t.i, speaker: effSpeaker(t, overrides) }; }), after: after.map(function (t) { return { turn: t.i, speaker: effSpeaker(t, overrides) }; }), omitted: omitted, chars: used, limit: limit }
    };
  }

  function chunkRanges(turns, maxChars) {
    var ranges = [], start = 0, size = 0;
    for (var i = 0; i < turns.length; i++) {
      size += turns[i].text.length + 20;
      if (size > maxChars && i > start) { ranges.push([start, i - 1]); start = i; size = turns[i].text.length + 20; }
    }
    if (turns.length) ranges.push([start, turns.length - 1]);
    return ranges;
  }

  /* Re-run carry-over. Moves person-made records (receipts, searches, candidates, rejections) from the previous
     analysis to the new one, claim by claim, matched on normalised claim text. Returns counts: `carried` claims that
     received records, `orphaned` earlier claims with records that have no match in the new reading (they stay in the
     passage's history). Mutates nextAnalysis only. */
  /* Identity of a claim for carry-over: who said it plus what it says, with meaning-bearing characters kept. Only
     case, typographic marks, whitespace and the final period are ignored: "1.5%" and "1-5%" are different claims,
     and the same words from a different speaker are a different claim. */
  function claimKey(c) {
    var text = normQ(c && c.text).replace(/[.!?;:,\s"]+$/g, "").replace(/^["“]+/, "").replace(/\s+/g, " ").trim();
    return String(c && c.speaker || "").toUpperCase() + "|" + text;
  }
  function carryOver(prevAnalysis, nextAnalysis, now) {
    var byKey = {}; ((prevAnalysis && prevAnalysis.claims) || []).forEach(function (c) { byKey[claimKey(c)] = c; });
    var carried = 0, orphaned = [];
    ((nextAnalysis && nextAnalysis.claims) || []).forEach(function (c) {
      var k = claimKey(c), o = byKey[k]; if (!o) return; delete byKey[k];
      if (o.id) c.id = o.id; // the claim keeps its identity across readings; records point at it
      var had = false;
      ["receipts", "searches", "candidates", "rejections"].forEach(function (f) { if ((o[f] || []).length) { c[f] = o[f]; had = true; } });
      if (o.obligation) c.obligation = o.obligation; if (o.lastSearchedAt) c.lastSearchedAt = o.lastSearchedAt;
      if (o.routingEditedAt) { c.searchQuery = o.searchQuery; c.expectedSources = o.expectedSources; c.routingEditedAt = o.routingEditedAt; c.routingEditedBy = o.routingEditedBy; }
      if ((c.receipts || []).some(function (r) { return !r.withdrawnAt; })) c.status = "receipt"; else if ((c.searches || []).length) c.status = "searched";
      if (had) carried++;
    });
    Object.keys(byKey).forEach(function (k) { var o = byKey[k]; if ((o.receipts || []).length || (o.rejections || []).length || (o.searches || []).length || (o.candidates || []).length) orphaned.push(o); });
    return { carried: carried, orphaned: orphaned.length, orphans: orphaned, at: now || new Date().toISOString() };
  }

  /* One sanitiser for a model's analysis, used by the page before saving and by the server on every save, so a
     client cannot store a shape the page would not have produced. Records (receipts, searches, candidates,
     rejections) are not part of an analysis; the server merges them from disk. Claim ids are kept if present. */
  var CLAIM_TYPES = ["fact", "contested", "unsupported", "interpretation", "value", "image", "unscorable", "claim"];
  var ANALYSIS_LIMITS = { asSaid: 16, claims: 40 };
  function sanitizeAnalysis(o, opts) {
    o = o && typeof o === "object" ? o : {};
    var sourceTypes = (opts && opts.sourceTypes) || null;
    function str(x, n) { return String(x == null ? "" : x).slice(0, n); }
    function lv(x) { x = x && typeof x === "object" ? x : { hs: String(x || ""), g5: "" }; return { hs: str(x.hs, 4000), g5: str(x.g5, 4000) }; }
    var asSaidAll = Array.isArray(o.asSaid) ? o.asSaid : [], claimsAll = Array.isArray(o.claims) ? o.claims : [];
    var out = {
      truncated: { asSaid: Math.max(0, asSaidAll.length - ANALYSIS_LIMITS.asSaid), claims: Math.max(0, claimsAll.length - ANALYSIS_LIMITS.claims) },
      asSaid: asSaidAll.slice(0, ANALYSIS_LIMITS.asSaid).map(function (q) { q = q && typeof q === "object" ? q : {}; return { turn: Number(q.turn), speaker: str(q.speaker, 40), quote: str(q.quote, 700) }; }).filter(function (q) { return q.quote; }),
      deflated: lv(o.deflated),
      fidelity: { grade: ["faithful", "adds", "strengthens", "softens"].indexOf(o.fidelity && o.fidelity.grade) !== -1 ? o.fidelity.grade : "unrated", notes: lv(o.fidelity && o.fidelity.notes) },
      jump: { present: !!(o.jump && o.jump.present), pivot: str(o.jump && o.jump.pivot, 300), hs: str(o.jump && o.jump.hs, 4000), g5: str(o.jump && o.jump.g5, 4000) },
      defense: lv(o.defense),
      revision: { jumpSurvives: ["yes", "partly", "no"].indexOf(o.revision && o.revision.jumpSurvives) !== -1 ? o.revision.jumpSurvives : "", hs: str(o.revision && o.revision.hs, 4000), g5: str(o.revision && o.revision.g5, 4000) },
      claims: claimsAll.slice(0, ANALYSIS_LIMITS.claims).map(function (c) {
        c = c && typeof c === "object" ? c : {};
        var cl = { text: str(c.text, 600), speaker: str(c.speaker, 40), type: CLAIM_TYPES.indexOf(c.type) !== -1 ? c.type : "unscorable", basis: lv(c.basis), status: ["unchecked", "searched", "receipt"].indexOf(c.status) !== -1 ? c.status : "unchecked", wouldSettle: str(c.wouldSettle, 400),
          plain: lv(c.plain), settle: lv(c.settle),
          expectedSources: (Array.isArray(c.expectedSources) ? c.expectedSources : []).map(String).filter(function (t) { return !sourceTypes || sourceTypes.indexOf(t) !== -1; }).slice(0, 2), searchQuery: str(c.searchQuery, 160) };
        if (c.id && /^[A-Za-z0-9_-]{1,64}$/.test(String(c.id))) cl.id = String(c.id);
        if (c.userSupplied) cl.userSupplied = true;
        ["receipts", "searches", "candidates", "rejections"].forEach(function (k) { cl[k] = Array.isArray(c[k]) ? c[k] : []; });
        if (c.obligation && typeof c.obligation === "object") cl.obligation = c.obligation;
        if (c.lastSearchedAt) cl.lastSearchedAt = str(c.lastSearchedAt, 40);
        if (c.routingEditedAt) { cl.routingEditedAt = str(c.routingEditedAt, 40); cl.routingEditedBy = str(c.routingEditedBy, 80); }
        return cl;
      }).filter(function (c) { return c.text; }),
      judgments: { evidence: ["strong", "mixed", "weak", "none", "n/a"].indexOf(o.judgments && o.judgments.evidence) !== -1 ? o.judgments.evidence : "n/a", inference: ["valid", "gap", "unfalsifiable", "n/a"].indexOf(o.judgments && o.judgments.inference) !== -1 ? o.judgments.inference : "n/a" }
    };
    if (o.by) out.by = str(o.by, 80);
    // 0.13: the fifth-grade wording failed its check after correction; the reading is shown at the high-school level
    if (o.levels && o.levels.g5 === "withheld") out.levels = { g5: "withheld", reasons: (Array.isArray(o.levels.reasons) ? o.levels.reasons : []).slice(0, 10).map(function (x) { return str(x, 2000); }) };
    return out;
  }

  /* What a reader sees for a claim type. Every empirical type is shown as "Checkable claim": a model's memory does not
     decide whether an assertion is true. Records from before 0.12 keep their saved type ("fact", "contested",
     "unsupported"); `historicalType` names it so a details view can attribute it to the earlier model. */
  var EMPIRICAL = ["claim", "fact", "contested", "unsupported"];
  var TYPE_LABELS = { claim: "Checkable claim", interpretation: "Interpretation", value: "Value judgment", image: "Image or comparison", unscorable: "Too vague to check as stated" };
  function claimTypeLabel(type) { return EMPIRICAL.indexOf(type) !== -1 ? TYPE_LABELS.claim : (TYPE_LABELS[type] || "Claim"); }
  function historicalType(type) { return ["fact", "contested", "unsupported"].indexOf(type) !== -1 ? type : ""; }

  /* A problem found in a reading, in plain words: "deflated.g5: …" becomes "Fifth grade, In plain words: …". The record
     keeps the field names (the correction needs them); the page and the exports show this. */
  var FIELD_NAMES = { deflated: "In plain words", defense: "A fair reading", revision: "What follows", jump: "The concern", fidelity: "The rewrite check", asSaid: "The quotes", judgments: "The judgments" };
  var PART_NAMES = { text: "its wording", plain: "plain wording", basis: "support", settle: "what would check it" };
  function fieldName(f) {
    var m = /^claims\[(\d+)\](?:\.(text|plain|basis|settle))?$/.exec(f);
    if (m) return "Claim " + (Number(m[1]) + 1) + (m[2] ? ", " + PART_NAMES[m[2]] : "");
    return FIELD_NAMES[f.replace(/\.notes$/, "")] || "";
  }
  function issueText(issue) {
    var s = String(issue || "");
    var m = /^((?:claims\[\d+\](?:\.(?:text|plain|basis|settle))?)|deflated|defense|revision|jump|fidelity(?:\.notes)?|asSaid|judgments)(?:\.(hs|g5|both))?:\s*([\s\S]*)$/.exec(s);
    if (m) {
      var name = fieldName(m[1]);
      return (m[2] === "hs" ? "High school, " : m[2] === "g5" ? "Fifth grade, " : "") + name + (m[2] === "both" ? " (both levels)" : "") + ": " + m[3];
    }
    var cut = s.indexOf(": ");
    if (cut < 0 || cut > 140) return s;
    var head = s.slice(0, cut), rest = s.slice(cut + 2);
    if (!/\b(deflated|defense|revision|jump|fidelity|asSaid|judgments|claims|plain|basis|settle)\b/.test(head)) return s;
    var also = "", am = /\(also ([a-zA-Z]+)\)/.exec(head);
    if (am) { also = " (also " + (FIELD_NAMES[am[1]] || am[1]) + ")"; head = head.replace(am[0], ""); }
    var hs = /\bhs\b/.test(head), g5 = /\bg5\b/.test(head), names = [];
    var tokens = head.match(/claims\[\d+\](?:\.(?:text|plain|basis|settle))?|\b(?:deflated|defense|revision|jump|fidelity|asSaid|judgments|plain|basis|settle)\b/g) || [];
    tokens.forEach(function (t) { var n = /^(plain|basis|settle)$/.test(t) || /^claims/.test(t) ? "the claims" : fieldName(t); if (n && names.indexOf(n) === -1) names.push(n); });
    if (!names.length) return s;
    var level = hs && !g5 ? "High school, " : g5 && !hs ? "Fifth grade, " : "";
    return level + names.join(" and ") + also + ": " + rest;
  }

  /* ---- who each speaker is (0.14) ----
     A label that is not a name (a number, a letter, an unknown, a role) can be given one: by the app from the
     conversation and the episode's listing (identify.js), or by a person. A clip, a quotation read aloud and an
     advertisement are set apart and never named. speakerAccount gives one plain line for a label: how its name was
     found, or why it has none; the page and the exports both use it, so they say the same thing. */
  var SET_APART = /^(?:CLIP|QUOTE|AD) \d+$/;
  var GENERIC = /^(?:(?:SPEAKER|SPK|VOICE|PERSON|PARTICIPANT|UNKNOWN(?: SPEAKER)?|UNIDENTIFIED(?: SPEAKER| VOICE)?)(?: ?(?:\d{1,3}|[A-Z]))?|S ?\d{1,2}|[A-Z])$/;
  var ROLE = /^(?:HOST|CO-?HOST|GUEST|INTERVIEWER|INTERVIEWEE|MODERATOR|ANCHOR|CALLER|PANELL?IST|REPORTER|CORRESPONDENT|NARRATOR|Q|A|QUESTION|ANSWER)(?: ?\d{1,2})?$/;
  function nameable(key) { key = String(key || ""); return key !== "UNLABELED" && !SET_APART.test(key) && (GENERIC.test(key) || ROLE.test(key)); }
  function labelName(key) { return String(key || "").split(" ").map(function (w) { return w ? w[0] + w.slice(1).toLowerCase() : w; }).join(" "); }
  function upFirst(t) { t = String(t || ""); return t.charAt(0).toUpperCase() + t.slice(1); }
  function speakerAccount(run, key) {
    var pr = run && run.provenance || {}, s = (run && run.speakers || []).filter(function (x) { return x.key === key; })[0] || null;
    var label = key === "UNLABELED" ? "Speaker not established" : labelName(key), name = key === "UNLABELED" ? label : (s && s.name) || label;
    var out = function (by, text) { return { key: key, name: name, label: label, by: by, text: text }; };
    if (key === "UNLABELED") return out("none", "The text does not establish who is speaking here.");
    if (SET_APART.test(key)) return out("set_apart", s && s.bio || "");
    var byPerson = (pr.namesByPerson || {})[key];
    if (byPerson !== undefined && byPerson === name) return out("person", name === label ? "You left this voice unnamed." : "Named by you.");
    if (/^Named by a person/.test(s && s.bio || "")) return out("person", "Named by you.");
    var id = pr.identification || {};
    var d = (id.decisions || []).filter(function (x) { return x.key === key && x.name === name; })[0];
    if (d) return out("identification", upFirst(d.how) + (/[.!?…]["”’)]*$/.test(d.how) ? "" : "."));
    var u = (id.unnamed || []).filter(function (x) { return x.key === key; })[0];
    if (u && name === label) return out("unnamed", "Not identified. " + u.why);
    var words = ((pr.structure || {}).names || []).concat((pr.voices || {}).names || []).filter(function (n) { return n.applied && n.key === key && n.name === name; })[0];
    if (words) return out("words", "Named from the words (" + String(words.kind || "").replace(/_/g, " ") + "): “" + String(words.quote || "").slice(0, 160) + "”.");
    if (!nameable(key)) return out("transcript", "The name came with the transcript.");
    if (name === label) return out("unnamed", "Not identified yet: the speakers' names are found when the reading is prepared.");
    return out("earlier", "Named before names were recorded with their evidence.");
  }
  return { issueText: issueText, claimTypeLabel: claimTypeLabel, nameable: nameable, labelName: labelName, speakerAccount: speakerAccount, SET_APART_KEY: SET_APART, historicalType: historicalType, EMPIRICAL_TYPES: EMPIRICAL, parseTranscript: parseTranscript, parseText: parseText, sanitizeAnalysis: sanitizeAnalysis, CLAIM_TYPES: CLAIM_TYPES, claimKey: claimKey, detectKind: detectKind, refNumber: refNumber, parseProse: parseProse, speakerLabels: speakerLabels, normQ: normQ, wordsOf: wordsOf, verifyQuote: verifyQuote, matchQuote: matchQuote, spokenNumbers: spokenNumbers, findQuoteTurns: findQuoteTurns, verifyPassage: verifyPassage, attrSig: attrSig, effSpeaker: effSpeaker, fmtTurns: fmtTurns, readingContext: readingContext, CONTEXT_VERSION: CONTEXT_VERSION, chunkRanges: chunkRanges, carryOver: carryOver };
});
