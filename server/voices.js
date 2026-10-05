"use strict";
/* Speakers separated by voice, from the recording, for when the words cannot settle who is speaking. On a person's
   request the episode's audio goes to Deepgram (the person's key), which returns every word it heard with a voice
   number. The app keeps the text it already has, word for word, and takes only the voices from the recording:

     1. Align. The recording's words and the text's words are two transcriptions of the same audio, so most agree. Word
        sequences that occur once in each are anchors (found again inside each stretch between anchors, as in patience
        diff); between anchors the most words in common are matched, and a word misheard is paired with what was heard.
        If under 60% of the text's words line up, the recording is not this text and nothing is changed.
     2. Give each word of the text the voice of the word it lines up with, or was misheard as. A word that lines up
        with nothing takes its neighbours' voice only when both neighbours agree, and not when it is a short sentence of
        its own (a "Right." the recording missed is as likely to be someone else's).
     3. Settle each sentence (a paragraph break or a spaced dash, the transcriber's mark of a break-in, also ends one;
        a text with no sentence marks, such as automatic captions, uses the recording's where the words line up). A voice
        the recording gives to words it heard is kept, with one narrow exception backed by the recording itself: the
        recording noticing a change of speakers a word or three late (or early). A sentence heard in exactly two voices,
        the first continuing from the sentence before and the second into the sentence after, whose change of voice is
        at most three words from one edge (and the part beyond it at most half as long as the rest), has the change
        moved to that edge when the recording paused there for at least 0.15 s and longer than where its voice changed.
        Words the recording heard nothing for take the voice of most of the sentence (60%). A short interruption
        ("no way"), and the words around it, stay with the voices the recording heard say them.
     4. Cut the text where the voice changes and label each piece SPEAKER 1, SPEAKER 2… in order of first appearance;
        what the recording could not settle stays UNLABELED. No word is rewritten, reordered or lost (checked).

   Voices are numbered, not named. Names come only from the words (a person naming themselves, or introduced by name
   just before they speak; see structure.nameVoices) or from a person's one confirmation under Controls. A quotation
   read aloud is in its reader's voice, so the same clip-and-quotation pass as for labelled transcripts runs after. */
const shared = require("../shared/transcript");
const { paragraphs, labelText, tokens, nameVoices, labelledClips, finishLabelled, CUE, CLIP_KEY } = require("./structure");
const { classify, isPrivateHost } = require("./podcast/resolve");

const MIN_COVERAGE = 0.6, NGRAM = 4, GAP_DP_LIMIT = 300, UNIT_MAX_WORDS = 60, MAJORITY = 0.6, MIN_PAUSE = 0.15;
const SENT_END = /[.?!…]["”’')\]]*$/;
const AUDIO_FILE = /\.(mp3|m4a|m4b|aac|wav|ogg|oga|opus|flac|mp4)$/i;

/* The words Deepgram returns, normalised the way the text is, each with its voice and times. */
function recordingWords(d) {
  const alt = d && d.results && d.results.channels && d.results.channels[0] && d.results.channels[0].alternatives && d.results.channels[0].alternatives[0];
  const out = [];
  for (const w of (alt && Array.isArray(alt.words) ? alt.words : [])) {
    const norm = shared.wordsOf(w.punctuated_word || w.word || "");
    const speaker = w.speaker !== null && w.speaker !== undefined && w.speaker !== "" && Number.isInteger(Number(w.speaker)) ? Number(w.speaker) : null;
    const parts = norm.split(" ").filter(Boolean), ends = SENT_END.test(String(w.punctuated_word || ""));
    parts.forEach((part, k) => out.push({ w: part, speaker, start: Number(w.start) || 0, end: Number(w.end) || 0, ends: ends && k === parts.length - 1 }));
  }
  return out;
}
/* The text's words, each pointing at the whitespace token (and so the characters) it came from. */
function textWords(text) {
  const toks = tokens(text), out = [];
  toks.forEach((t, ti) => { for (const part of String(t.norm || "").split(" ").filter(Boolean)) out.push({ w: part, tok: ti }); });
  return { toks, words: out };
}
/* Anchors inside a[i0,i1) and b[j0,j1): word n-grams that occur exactly once in each range, kept in the longest chain
   increasing in both, where two anchors overlap only along one diagonal. */
function chainIn(a, b, i0, i1, j0, j1, size) {
  const key = (xs, i) => { let k = xs[i].w; for (let t = 1; t < size; t++) k += " " + xs[i + t].w; return k; };
  const ca = new Map(), cb = new Map(), posB = new Map();
  for (let i = i0; i + size <= i1; i++) { const k = key(a, i); ca.set(k, (ca.get(k) || 0) + 1); }
  for (let j = j0; j + size <= j1; j++) { const k = key(b, j); cb.set(k, (cb.get(k) || 0) + 1); posB.set(k, j); }
  const pairs = [];
  for (let i = i0; i + size <= i1; i++) { const k = key(a, i); if (ca.get(k) === 1 && cb.get(k) === 1) pairs.push([i, posB.get(k)]); }
  // longest chain increasing in both (patience sorting on the second coordinate; pairs are already in order of the first)
  const tails = [], tailIdx = [], prev = new Array(pairs.length).fill(-1);
  pairs.forEach(([, j], idx) => {
    let lo = 0, hi = tails.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < j) lo = mid + 1; else hi = mid; }
    tails[lo] = j; tailIdx[lo] = idx; prev[idx] = lo > 0 ? tailIdx[lo - 1] : -1;
  });
  const chain = []; let k = tails.length ? tailIdx[tails.length - 1] : -1; while (k >= 0) { chain.push(pairs[k]); k = prev[k]; }
  chain.reverse();
  const kept = []; let li = null, lj = null;
  for (const [i, j] of chain) if (li === null || i - li === j - lj || i >= li + size && j >= lj + size) { kept.push([i, j]); li = i; lj = j; }
  return kept;
}
function anchors(a, b) { return chainIn(a, b, 0, a.length, 0, b.length, NGRAM); }
/* Word-level alignment of a to b: map[i] is the index in b of the same word a[i] lines up with, or -1 (strictly
   increasing); heard[i] is that, or the word of b that a[i] was misheard as. Long stretches are split at anchors, then
   the stretches between anchors again, with anchors unique within them (as in patience diff), until each piece is
   small enough to align exactly. */
function align(a, b) {
  const map = new Array(a.length).fill(-1), heard = new Array(a.length).fill(-1);
  let count = 0;
  // the most words in common (longest common subsequence); then, between two common words, the words left over are
  // paired one to one when there are as many on each side (a misheard word), and never otherwise (a word missed or added)
  const exact = (i0, i1, j0, j1) => {
    const n = i1 - i0, m = j1 - j0;
    const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let x = n - 1; x >= 0; x--) for (let y = m - 1; y >= 0; y--) L[x][y] = a[i0 + x].w === b[j0 + y].w ? L[x + 1][y + 1] + 1 : Math.max(L[x + 1][y], L[x][y + 1]);
    let x = 0, y = 0, px = 0, py = 0;
    const pairUp = (xe, ye) => { if (xe - px === ye - py) for (let t = 0; t < xe - px; t++) heard[i0 + px + t] = j0 + py + t; };
    while (x < n && y < m) {
      if (a[i0 + x].w === b[j0 + y].w) { pairUp(x, y); map[i0 + x] = j0 + y; x++; y++; px = x; py = y; }
      else if (L[x + 1][y] >= L[x][y + 1]) x++; else y++;
    }
    pairUp(n, m);
  };
  const range = (i0, i1, j0, j1, depth) => {
    if (i1 <= i0 || j1 <= j0) return;
    if (i1 - i0 <= GAP_DP_LIMIT && j1 - j0 <= GAP_DP_LIMIT) return exact(i0, i1, j0, j1);
    if (depth >= 8) return;
    let chain = [], size = NGRAM;
    for (size of [NGRAM, 3]) { chain = chainIn(a, b, i0, i1, j0, j1, size); if (chain.length) break; }
    if (!chain.length) return; // nothing in common here: left unaligned
    const runs = [];
    for (const [i, j] of chain) { const r = runs[runs.length - 1]; if (r && i - r.i === j - r.j && i <= r.i + r.n) r.n = i + size - r.i; else runs.push({ i, j, n: size }); }
    let pi = i0, pj = j0;
    for (const r of runs) { range(pi, r.i, pj, r.j, depth + 1); for (let t = 0; t < r.n; t++) map[r.i + t] = r.j + t; count++; pi = r.i + r.n; pj = r.j + r.n; }
    range(pi, i1, pj, j1, depth + 1);
  };
  range(0, a.length, 0, b.length, 0);
  for (let i = 0; i < a.length; i++) if (map[i] >= 0) heard[i] = map[i];
  return { map, heard, anchors: count };
}

/* The labelled text, or why not. `d` is Deepgram's response (diarize=true). */
function separate(text, d) {
  const rec = recordingWords(d), { toks, words } = textWords(text);
  if (!rec.length) return { ok: false, why: "the recording came back with no words", coverage: 0 };
  if (!words.length) return { ok: false, why: "the text has no words", coverage: 0 };
  if (!rec.some(w => w.speaker !== null)) return { ok: false, why: "the recording came back without voices", coverage: 0 };
  const { map, heard, anchors: anchorCount } = align(words, rec);
  const matched = map.filter(j => j >= 0).length, coverage = matched / words.length;
  if (coverage < MIN_COVERAGE) return { ok: false, why: "only " + Math.round(coverage * 100) + "% of the text's words line up with the recording; it may be a different episode, or a different text", coverage };

  // sentences: ended by a sentence mark, a paragraph break, or a spaced dash (the transcriber's mark of a break-in)
  const paras = paragraphs(text), paraOf = new Array(toks.length);
  let pi = 0; toks.forEach((t, ti) => { while (pi + 1 < paras.length && t.at >= paras[pi].end) pi++; paraOf[ti] = pi; });
  const tokText = ti => text.slice(toks[ti].at, toks[ti].end);
  const lastOfTok = i => i + 1 >= words.length || words[i + 1].tok !== words[i].tok;
  const dashAfter = i => { for (let t = words[i].tok + 1; t < words[i + 1].tok; t++) if (/^(?:[—–]+|-{1,2})$/.test(tokText(t))) return true; return /(?:[—–]|--)$/.test(tokText(words[i].tok)) || /^(?:[—–]|--)/.test(tokText(words[i + 1].tok)); };
  // a text without sentence marks (automatic captions) borrows the recording's: a sentence the recording ends falls
  // after the word of the text heard as its last word or, when there is none, before the first word heard after it
  const marks = toks.filter(t => SENT_END.test(text.slice(t.at, t.end))).length, borrowed = new Set();
  if (marks < words.length / 40) {
    const byRec = new Map(); heard.forEach((j, i) => { if (j >= 0) byRec.set(j, i); });
    let i = 0;
    rec.forEach((r, j) => {
      if (!r.ends) return;
      if (byRec.has(j)) { if (byRec.get(j) + 1 < words.length) borrowed.add(byRec.get(j) + 1); return; }
      while (i < words.length && !(heard[i] > j)) i++;
      if (i > 0 && i < words.length) borrowed.add(i);
    });
  }
  const endsUnit = i => i + 1 >= words.length || lastOfTok(i) && (SENT_END.test(tokText(words[i].tok)) || paraOf[words[i + 1].tok] !== paraOf[words[i].tok] || dashAfter(i) || borrowed.has(i + 1));
  const units = []; let s0 = 0;
  for (let i = 0; i < words.length; i++) if (endsUnit(i)) { units.push([s0, i + 1]); s0 = i + 1; }
  const unitOf = new Array(words.length); units.forEach(([s, e], u) => { for (let i = s; i < e; i++) unitOf[i] = u; });
  const unitLen = i => units[unitOf[i]][1] - units[unitOf[i]][0];

  // 2. each word's voice: that of the word it lines up with (or was misheard as), or its neighbours' when both agree.
  //    A short sentence the recording has nothing for (a "Right." it missed) is not given its neighbours' voice: it is
  //    as likely to be someone else's.
  const voice = heard.map(j => j >= 0 ? rec[j].speaker : null);
  for (let i = 0; i < voice.length; i++) {
    if (voice[i] !== null) continue;
    let l = i - 1; while (l >= 0 && voice[l] === null) l--;
    let r = i + 1; while (r < voice.length && heard[r] < 0) r++;
    const lv = l >= 0 ? voice[l] : null, rv = r < voice.length ? rec[heard[r]].speaker : null;
    if (lv !== null && lv === rv && (unitLen(i) >= 4 || unitOf[l] === unitOf[i] && unitOf[r] === unitOf[i])) voice[i] = lv;
  }

  // 3. each sentence settled where the recording has nothing to say, and at a change of speakers where the recording itself
  //    shows that it noticed the change a word or three late (or early). A voice the recording gives to words it heard is
  //    otherwise never overwritten: a short interruption ("no way") stays with the voice the recording heard say it, and
  //    so do the words around it, and so does a word the recording got wrong; telling those apart is not the app's to
  //    guess. (0.13.0 gave stray words in the middle of a sentence to its majority voice and erased a genuine
  //    interruption; found by GPT.)
  let adjusted = 0; const edges = { moved: 0, kept: 0 };
  const set = (from, to, v) => { for (let k = from; k < to; k++) { if (voice[k] !== v) adjusted++; voice[k] = v; } };
  const knownBefore = i => { for (let k = i - 1; k >= 0; k--) if (voice[k] !== null) return voice[k]; return null; };
  const knownFrom = i => { for (let k = i; k < voice.length; k++) if (voice[k] !== null) return voice[k]; return null; };
  // the longest pause the recording heard between the text word before i that it heard and text word i itself (seconds),
  // so a word it missed or a word it added in between does not hide the pause; null when there is nothing to measure
  const gapBefore = i => {
    if (i <= 0 || i >= words.length || heard[i] <= 0 || !(rec[heard[i]].start > 0)) return null;
    let p = i - 1; while (p >= 0 && i - p <= 8 && heard[p] < 0) p--;
    if (p < 0 || heard[p] < 0 || i - p > 8) return null;
    let most = -Infinity; for (let j = heard[p] + 1; j <= heard[i]; j++) most = Math.max(most, rec[j].start - rec[j - 1].end);
    return most === -Infinity ? null : most;
  };
  // the first text word from i (and before limit) that the recording heard, or -1
  const heardFrom = (i, limit) => { for (let k = i; k < Math.min(limit, words.length); k++) if (heard[k] >= 0) return k; return -1; };
  // the recording puts a change of voice at the sentence boundary rather than where its voice changed: it paused before
  // the boundary's first heard word (hb) for at least MIN_PAUSE, and longer than before the first heard word in the new
  // voice (hk). Words given a voice in step 2 were not heard, so they carry no timing.
  const pauseSays = (hb, hk) => { if (hb < 0 || hk < 0) return false; const atBoundary = gapBefore(hb), atChange = gapBefore(hk); return atBoundary !== null && atChange !== null && atBoundary >= MIN_PAUSE && atBoundary > atChange; };
  for (const [s, e] of units) {
    if (e - s > UNIT_MAX_WORDS) continue;
    // the runs of voices the recording heard in this sentence (words it heard nothing for go with what surrounds them)
    const runs = []; for (let i = s; i < e; i++) { const v = voice[i]; if (v === null) continue; if (runs.length && runs[runs.length - 1].v === v) runs[runs.length - 1].end = i + 1; else runs.push({ v, start: i, end: i + 1, n: 0 }); runs[runs.length - 1].n++; }
    if (!runs.length) continue;
    // A change of speakers the recording placed one to three words from the sentence's edge is moved to the edge only
    // when all of this holds: the sentence has exactly two voices; the first continues from the sentence before and the
    // second into the sentence after, so moving the change only moves where one long turn ends and the next begins (it
    // never takes words from a short interruption, nor gives an interruption the words around it), unless the edge is
    // a spaced dash, the transcriber's own mark that someone broke in there; the part that moves is at most three words
    // and at most half as long as the rest; and the recording paused at the edge for at least 0.15 s, longer than where
    // its voice changed.
    if (runs.length === 2) {
      const [a, b] = runs, change = heardFrom(b.start, b.end);
      const brokeInAtStart = s > 0 && dashAfter(s - 1), brokeInAtEnd = e < words.length && dashAfter(e - 1);
      if (a.v === knownBefore(s) && (b.v === knownFrom(e) || brokeInAtStart) && a.end - s <= 3 && b.n >= 2 * a.n && pauseSays(heardFrom(s, b.start), change)) { set(s, b.start, b.v); edges.moved++; }          // noticed late
      else if (b.v === knownFrom(e) && (a.v === knownBefore(s) || brokeInAtEnd) && e - b.start <= 3 && a.n >= 2 * b.n && pauseSays(heardFrom(e, e + 3), change)) { set(b.start, e, a.v); edges.moved++; } // noticed early
      else if (a.end - s <= 3 || e - b.start <= 3) edges.kept++; // a change near an edge left where the recording put it
    }
    // words the recording heard nothing for take the sentence's voice when most of its heard words (60%) have one
    const count = new Map(); let known = 0;
    for (let i = s; i < e; i++) if (voice[i] !== null) { count.set(voice[i], (count.get(voice[i]) || 0) + 1); known++; }
    const [top, n] = [...count.entries()].sort((x, y) => y[1] - x[1])[0];
    if (n / known >= MAJORITY) for (let i = s; i < e; i++) if (voice[i] === null) set(i, i + 1, top);
  }
  const runsOf = () => { const runs = []; for (let i = 0; i < voice.length; i++) { if (runs.length && runs[runs.length - 1].v === voice[i]) runs[runs.length - 1].n++; else runs.push({ v: voice[i], i, n: 1 }); } return runs; };

  // 4. cuts where the voice changes, always between two whitespace tokens
  const runs = runsOf();
  const order = [], keyOf = v => { if (v === null) return "UNLABELED"; if (!order.includes(v)) order.push(v); return "SPEAKER " + (order.indexOf(v) + 1); };
  const cuts = [];
  for (const r of runs) {
    let w = r.i; while (w > 0 && w < words.length && words[w].tok === words[w - 1].tok) w++;
    if (w >= words.length || w >= r.i + r.n && r.i > 0) continue; // a run that lies inside one token stays with the run before
    const at = toks[words[w].tok].at, key = keyOf(r.v);
    if (cuts.length && cuts[cuts.length - 1].at === at) { cuts[cuts.length - 1].key = key; continue; }
    if (cuts.length && cuts[cuts.length - 1].key === key) continue;
    cuts.push({ at, key });
  }
  if (!cuts.length || cuts[0].at > toks[0].at) cuts.unshift({ at: toks[0].at, key: cuts.length ? cuts[0].key : "UNLABELED" });
  const out = labelText(text, paras, cuts);
  const keys = [...new Set(cuts.map(c => c.key))];
  return { ok: true, text: out, coverage, voices: order.length, keys, turns: cuts.length, unaligned: words.length - matched, unlabelled: voice.filter(v => v === null).length, adjusted, edges, anchors: anchorCount, words: words.length, recordingWords: rec.length };
}

/* The spoken text of a transcript whose labels were worked out by the app (from the words, by an earlier voice
   separation, or by the old name assignment): every "LABEL: " the app wrote is set aside; nothing else changes. */
function spokenText(text, keys) {
  const esc = k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const all = [...new Set(keys.filter(Boolean).concat(["UNLABELED"]))];
  const re = new RegExp("^[ \\t]*(?:" + all.map(esc).join("|") + "|SPEAKER \\d+|CLIP \\d+|QUOTE \\d+)[ \\t]*:[ \\t]+", "gm");
  return text.replace(re, "");
}

/* Where the recording is: the link the person gave (an audio file, or an episode page the transcript chain can find in
   a feed), or the episode this text was fetched from. */
async function audioFor({ link, run, resolver }) {
  const given = String(link || "").trim().slice(0, 2000);
  const imp = run.import || {}, info = imp.episodeInfo || {};
  const fail = (status, code, msg) => Object.assign(new Error(msg), { status, code });
  const fromEpisode = async (url, guid, how) => {
    let located;
    try { located = await resolver.locate({ url, guid: guid || "" }, () => {}); }
    catch (e) { throw fail(422, "no_audio", "The episode could not be found from that link (" + String(e.message || e).slice(0, 160) + ")."); }
    if (located.kind === "episode") {
      const a = located.item && located.item.enclosure && located.item.enclosure.url;
      if (!a) throw fail(422, "no_audio", "That episode has no audio file in its feed.");
      let host = ""; try { host = new URL(a).hostname; } catch (e) {}
      if (!/^https?:\/\//i.test(a) || isPrivateHost(host)) throw fail(422, "no_audio", "The feed's audio address is not a public web address.");
      return { url: a, how: how + ": the audio file of “" + String(located.item.title || "the episode").slice(0, 120) + "”" + (located.show && located.show.name ? " in " + String(located.show.name).slice(0, 80) : "") + (located.matchedBy ? " (found by " + located.matchedBy + ")" : ""), episode: { title: located.item.title || "", guid: located.item.guid || "" } };
    }
    if (located.kind === "choose") throw fail(409, "episode_needed", "That link is a show, not one episode. Give the episode's own link, or its audio file.");
    if (located.kind === "video") throw fail(422, "video_link", "Voices are separated from a podcast's audio file, not from a video page. Give the episode's podcast link, or its audio file.");
    throw fail(422, "no_audio", "No audio file was found at that link. Give the episode's podcast link, or its audio file.");
  };
  if (!given) {
    if (info.audioUrl) return { url: info.audioUrl, how: "the episode this text was fetched from: its audio file" };
    if (imp.url && info.guid) return fromEpisode(imp.url, info.guid, "the episode this text was fetched from");
    throw fail(400, "audio_link_needed", "Give the link to the episode, or to its audio file.");
  }
  let u; try { u = new URL(given); } catch (e) { throw fail(400, "invalid_request", "That is not a link."); }
  if (!/^https?:$/.test(u.protocol)) throw fail(400, "invalid_request", "Give a web link (http or https).");
  if (isPrivateHost(u.hostname)) throw fail(400, "private_address", "Deepgram cannot reach an address on this computer or a private network. Give a public link.");
  if (AUDIO_FILE.test(u.pathname)) return { url: u.href, how: "the audio file at the link given" };
  const c = classify(u.href);
  if (c.kind === "youtube" || c.kind === "youtube-other") throw fail(422, "video_link", "Voices are separated from a podcast's audio file, not from a video page. Give the episode's podcast link, or its audio file.");
  return fromEpisode(u.href, "", "the link given");
}

/* The whole request: find the recording, get its voices, line them up with this text, name what the words name, set
   quotations read aloud apart, and hand back the labelled text for the store to commit. Throws with a plain reason. */
async function separateVoices({ ai, store, id, link, engine, resolver, signal, beforeRecording }) {
  const b = await store.bundle(id);
  if (!b) throw Object.assign(new Error("run not found"), { status: 404 });
  if (b.run.example) throw Object.assign(new Error("Copy the supplied example before changing it."), { status: 403 });
  if (b.run.kind === "claim") throw Object.assign(new Error("A typed claim has no speakers."), { status: 400 });
  const pr = b.run.provenance || {};
  const labels = shared.speakerLabels(shared.parseTranscript(b.transcript, { mode: b.run.parseMode })).filter(l => l !== "UNLABELED");
  const origin = pr.labelsOrigin || "source";
  if (labels.length && origin === "source") throw Object.assign(new Error("This transcript's speaker labels came with it, and they are kept."), { status: 409, code: "source_labels" });
  if (!engine || !engine.configured()) throw Object.assign(new Error("Add a Deepgram key to separate voices from the recording."), { status: 409, code: "cloud_not_configured" });
  const audio = await audioFor({ link, run: b.run, resolver });
  // labels the app wrote earlier are set aside; the voices decide afresh
  const base = labels.length ? spokenText(b.transcript, (b.run.speakers || []).map(s => s.key).concat(labels)).trim() : b.transcript;
  if (shared.wordsOf(base) !== shared.wordsOf(b.transcript.replace(new RegExp("^[ \\t]*(?:" + labels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).concat(["UNLABELED"]).join("|") + ")[ \\t]*:[ \\t]+", "gm"), "")))
    throw Object.assign(new Error("Setting the earlier labels aside would have changed the words; nothing was changed."), { status: 500, code: "words_changed" });
  // the text this was asked for; the commit is refused if it changes while the recording is processed
  const basis = await store.captureCallBasis(id, { transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig }, "separate_voices");
  if (beforeRecording) await beforeRecording();
  const d = await engine.diarize({ audioUrl: audio.url, signal });
  const sep = separate(base, d);
  if (!sep.ok) throw Object.assign(new Error("The recording's voices could not be lined up with this text: " + sep.why + ". Nothing was changed."), { status: 422, code: "voices_not_aligned", coverage: sep.coverage });
  const named = await nameVoices({ ai, store, id, basis, run: b.run, text: sep.text, signal });
  const numbered = sep.keys.filter(k => /^SPEAKER \d+$/.test(k)).sort((x, y) => Number(x.split(" ")[1]) - Number(y.split(" ")[1]));
  let speakers = numbered.map(key => { const a = named.applied.get(key); return { key, name: a ? a.name : "Speaker " + key.split(" ")[1], bio: a ? "Named from the words (" + a.kind.replace(/_/g, " ") + "): “" + a.quote.slice(0, 200) + "”" : "" }; })
    .concat(sep.keys.includes("UNLABELED") ? [{ key: "UNLABELED", name: "Speaker not established", bio: "The recording did not settle who is speaking here: these words did not line up with it." }] : []);
  // a quotation read aloud is in its reader's voice: the same clip-and-quotation pass as for any labelled transcript
  let text = sep.text, clips = [], clipsRejected = [], clipCalls = [];
  if (ai && CUE.test(text)) {
    const lc = await labelledClips({ ai, store, id, run: b.run, text, basis, signal });
    clipCalls = lc.calls; clipsRejected = lc.rejected.slice(0, 20);
    if (lc.found.length) { const fin = finishLabelled({ b, text, found: lc.found, rejected: lc.rejected, calls: lc.calls, basis, mode: "labelled", speakers }); text = fin.text; speakers = fin.speakers; clips = fin.record.clips; }
  }
  const meta = d && d.metadata || {}, pct = Math.round(sep.coverage * 100);
  const names = [...named.applied.values()].map(x => Object.assign({ applied: true }, x)).concat(named.suggestions.map(x => Object.assign({ applied: false }, x)));
  const record = {
    by: "recording", engine: engine.name || "deepgram", model: (meta.models && meta.models[0]) || engine.model || "", requestId: meta.request_id || "", audioUrl: audio.url, audioFoundBy: audio.how,
    durationSeconds: Math.round(Number(meta.duration) || 0), at: new Date().toISOString(), inputHash: b.run.input.sha256, earlierLabelsSetAside: labels.length ? origin : "",
    coverage: Math.round(sep.coverage * 1000) / 1000, voices: sep.voices, turns: sep.turns, unaligned: sep.unaligned, unlabelled: sep.unlabelled, adjusted: sep.adjusted, edges: sep.edges, anchors: sep.anchors, words: sep.words, recordingWords: sep.recordingWords,
    names, nameCalls: named.calls, clips, clipsRejected, clipCalls,
    method: "Voices were separated from the recording by " + (engine.name === "deepgram" || !engine.name ? "Deepgram" : engine.name) + " and lined up with this text word by word (" + pct + "% of its words matched). Each word keeps the voice the recording heard say it, so a short interruption stays with the person who made it; a change of speaker the recording noticed a word or three late is moved to the sentence's edge only where its own pause shows that. Words the recording missed take the voice of most of their sentence. Every word of the text was kept (checked). Voices are numbered; a name comes only from the words, or from your confirmation." + (clips.length ? " Quotations read aloud and clips introduced in the words were set apart from their reader." : ""),
  };
  const diarization = { engine: record.engine, model: record.model, requestId: record.requestId, audioUrl: audio.url, durationSeconds: record.durationSeconds, words: recordingWords(d).map(w => [w.w, w.speaker, Math.round(w.start * 100) / 100, Math.round(w.end * 100) / 100]) };
  return { changed: true, text, speakers, record, basis, diarization };
}

module.exports = { separate, separateVoices, audioFor, spokenText, align, anchors, recordingWords, textWords, MIN_COVERAGE };
