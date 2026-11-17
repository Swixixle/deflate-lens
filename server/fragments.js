"use strict";
/* A voice the recording heard only in fragments of other people's sentences is not a speaker (0.15.2).

   Deepgram sometimes opens a spare voice for the words at the edges of turns. In the real check that led here, a
   conversation between two people came back with a third voice of eighteen pieces of one to eight words, ten of them
   stopping mid-sentence ("It covered" just before "four hundred households…" in the next voice; "actually cover?" right after
   "So what did the survey" in the voice before), the rest complete remarks ("Yeah.", "Right.") whose speaker nothing settles. Shown as a
   speaker, that voice put the ends of sentences in a phantom's mouth and left two people's words split among three.

   The rule, on a labelled text whose labels came from a recording (never on labels a person or a publisher wrote):
     - a voice is such a fragment voice when every one of its turns is at most ten words and at least two of them, a
       third or more, are broken (they stop mid-sentence, or they begin mid-sentence, finishing what the turn before
       started); a voice with one longer turn is a speaker, however many fragments it also has;
     - each of its turns is taken apart by sentence: a piece that stops mid-sentence goes to the next voice, whose words
       complete it; a piece that begins mid-sentence goes to the voice before, which began it; a piece that does both
       (one piece inside someone's sentence) goes to the voice on both sides when they agree, otherwise to the next voice
       when the text runs straight on (its next word is not capitalised) and to the voice before when it does not; a
       complete remark left over is given to no one (UNLABELED: the recording did not settle who said it), where a
       person can name it;
     - the remaining voices are renumbered in order of first appearance; the record keeps the old numbers.
   A sentence ends at a sentence mark, a colon ("listen to this:") or a spaced dash (the transcriber's mark of a
   break-in). A text with few sentence marks (automatic captions) is left alone: nothing in it tells a fragment from a
   remark. No word is rewritten, reordered or lost (checked); when every voice would be a fragment voice, nothing is
   changed. Pieces never join a clip, a quotation or an advertisement, and never a turn without a label. The pass runs
   after clips are set apart where it can (voices.js; the reading's structure step for Deepgram's own transcription),
   since a clip played in the show often comes back in the same spare voice, as one long turn. */
const shared = require("../shared/transcript");

const MAX_WORDS = 10, MIN_BROKEN = 2;
const FINISHED = /(?:[.?!…:]["”’')\]]*|[—–]|--)$/;
// a full stop that ends an abbreviation or an initial ("Dr.", "U.S.", "J.") ends no sentence
const ABBREVIATION = /(?:^|\s)(?:[A-Z]|[A-Za-z]+\.[A-Za-z]+|Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Sen|Rep|Gov|Gen|Lt|Col|Sgt|Capt|vs|etc|Inc|Co|Ltd|No|a\.m|p\.m)\.["”’')\]]*$/;
const LINE = /^([ \t]*)((?:SPEAKER|CLIP|QUOTE|AD) \d+|UNLABELED)([ \t]*:[ \t]+)(.*)$/;
const SPEAKER = /^SPEAKER \d+$/;

const countWords = t => shared.wordsOf(t).split(" ").filter(Boolean).length;
const endsSentence = w => FINISHED.test(w) && !ABBREVIATION.test(w);
const finished = t => endsSentence(String(t).trim().split(/\s+/).pop() || "");
/* The sentence pieces of a turn: each ends at a sentence mark, a colon or a spaced dash, the last where the turn ends. */
function pieces(t) {
  const out = []; let cur = [];
  for (const w of String(t).trim().split(/\s+/).filter(Boolean)) { cur.push(w); if (endsSentence(w)) { out.push(cur.join(" ")); cur = []; } }
  if (cur.length) out.push(cur.join(" "));
  return out;
}
const stripLabels = text => shared.wordsOf(String(text).split("\n").map(l => { const m = LINE.exec(l); return m ? m[4] : l; }).join("\n"));

function rejoinFragments(text) {
  const src = String(text || "");
  const none = why => ({ text: src, changed: false, fragments: { voices: 0, turns: 0, words: 0, forward: 0, backward: 0, unsettled: 0 }, removed: [], renamed: {}, skipped: why });
  const lines = src.split("\n").map(l => { const m = LINE.exec(l); return m ? { turn: true, lead: m[1], key: m[2], sep: m[3], text: m[4].trim(), removed: false } : { turn: false, raw: l }; });
  const turns = lines.filter(l => l.turn);
  if (!turns.length) return none("no labelled turns");
  const allWords = turns.reduce((n, t) => n + countWords(t.text), 0);
  const marks = turns.reduce((n, t) => n + String(t.text).split(/\s+/).filter(endsSentence).length, 0);
  if (marks < allWords / 40) return none("the text has too few sentence marks to tell a fragment from a remark");

  // the voices, and which of them are fragment voices
  const byKey = new Map();
  turns.forEach((t, i) => {
    if (!SPEAKER.test(t.key)) return;
    const prev = i > 0 ? turns[i - 1] : null;
    const prevFinished = !prev || !SPEAKER.test(prev.key) || finished(prev.text);
    const n = countWords(t.text), broken = !finished(t.text) || !prevFinished;
    if (!byKey.has(t.key)) byKey.set(t.key, { turns: 0, broken: 0, longest: 0 });
    const s = byKey.get(t.key); s.turns++; if (broken) s.broken++; s.longest = Math.max(s.longest, n);
  });
  const fragmentKeys = [...byKey.entries()].filter(([, s]) => s.longest <= MAX_WORDS && s.broken >= MIN_BROKEN && s.broken * 3 >= s.turns).map(([k]) => k);
  if (!fragmentKeys.length) return none("");
  if (fragmentKeys.length === byKey.size) return none("every voice speaks only in fragments; nothing is changed");

  const fragments = { voices: fragmentKeys.length, turns: 0, words: 0, forward: 0, backward: 0, unsettled: 0 };
  const alive = i => { let j = i; while (j >= 0 && turns[j].removed) j--; return j >= 0 ? turns[j] : null; };
  const aliveAfter = i => { let j = i; while (j < turns.length && turns[j].removed) j++; return j < turns.length ? turns[j] : null; };
  turns.forEach((t, i) => {
    if (!fragmentKeys.includes(t.key)) return;
    fragments.turns++; fragments.words += countWords(t.text);
    const prev = alive(i - 1), next = aliveAfter(i + 1);
    const pv = prev && SPEAKER.test(prev.key) && !fragmentKeys.includes(prev.key) ? prev.key : null, nv = next && SPEAKER.test(next.key) && !fragmentKeys.includes(next.key) ? next.key : null;
    const ps = pieces(t.text), startsMid = pv !== null && !finished(prev.text), endsMid = !finished(t.text);
    const left = [];
    ps.forEach((piece, p) => {
      const first = p === 0, last = p === ps.length - 1;
      let to = null;
      if (first && startsMid && last && endsMid) {
        if (pv !== null && nv !== null) to = pv === nv || !/^[^A-Z]/.test(next.text) ? pv : nv;
        else to = pv !== null ? pv : nv;
      } else if (first && startsMid) to = pv;
      else if (last && endsMid) to = nv;
      if (to !== null && to === pv && (first && startsMid)) { prev.text = prev.text + " " + piece; fragments.backward++; }
      else if (to !== null && to === nv) { next.text = piece + " " + next.text; fragments.forward++; }
      else { left.push(piece); fragments.unsettled++; }
    });
    if (left.length) { t.key = "UNLABELED"; t.text = left.join(" "); } else t.removed = true;
  });

  // the remaining voices renumbered in order of first appearance; the fragment voices' numbers are not reused silently
  const order = []; turns.forEach(t => { if (!t.removed && SPEAKER.test(t.key) && !order.includes(t.key)) order.push(t.key); });
  const renamed = {}; order.forEach((k, i) => { const to = "SPEAKER " + (i + 1); if (to !== k) renamed[k] = to; });
  turns.forEach(t => { if (!t.removed && renamed[t.key]) t.key = renamed[t.key]; });

  // the text back together: a removed turn's line goes, adjacent turns of one voice inside a paragraph become one line,
  // and a paragraph break never doubles
  const outLines = [];
  for (const l of lines) {
    if (!l.turn) { outLines.push(l.raw); continue; }
    if (l.removed) continue;
    const last = outLines.length ? outLines[outLines.length - 1] : null;
    const m = last !== null ? LINE.exec(last) : null;
    if (m && m[2] === l.key) { outLines[outLines.length - 1] = last + " " + l.text; continue; }
    outLines.push(l.lead + l.key + l.sep + l.text);
  }
  const out = outLines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
  if (stripLabels(out) !== stripLabels(src)) throw Object.assign(new Error("Rejoining the fragments would have changed the words; nothing was changed."), { status: 500, code: "words_changed" });
  return { text: out, changed: true, fragments, removed: fragmentKeys, renamed, skipped: "" };
}

/* One sentence for the record, from the result. */
function describe(r) {
  const f = r.fragments;
  if (!r.changed || !f.voices) return "";
  const one = f.voices === 1;
  return (one ? "One voice" : f.voices + " voices") + " the recording heard only in fragments of other people's sentences (" + f.turns + " pieces, " + f.words + " words) " + (one ? "was" : "were") + " not counted as a speaker: a piece that stopped mid-sentence was rejoined to the words that complete it (" + f.forward + "), a piece that finished a sentence begun by the voice before went to that voice (" + f.backward + ")"
    + (f.unsettled ? ", and " + (f.unsettled === 1 ? "one complete remark" : f.unsettled + " complete remarks") + " among them, whose speaker the recording did not settle, " + (f.unsettled === 1 ? "is" : "are") + " marked as not established" : "")
    + "." + (Object.keys(r.renamed).length ? " The remaining voices were renumbered (" + Object.entries(r.renamed).map(([a, b]) => a + " is now " + b).join(", ") + ")." : "");
}

/* The pass on a run's labelled text together with its speakers and the clips and advertisements already set apart:
   the speakers of the voices taken apart go, the rest are renumbered with their names and their mentions in the other
   speakers' notes, a speaker for what is left unlabelled is added (or its note extended), and a clip's or an
   advertisement's reader follows the renumbering. */
const NOT_ESTABLISHED = "Speaker not established", FRAGMENT_NOTE = "heard in a voice that otherwise spoke only in fragments of other people's sentences";
function rejoinLabelled({ text, speakers, clips, ads }) {
  const r = rejoinFragments(text);
  const given = Array.isArray(speakers) ? speakers : [];
  if (!r.changed) return { changed: false, text, speakers: given, clips: clips || [], ads: ads || [], result: r };
  const esc = k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keyRe = Object.keys(r.renamed).length ? new RegExp("\\b(" + Object.keys(r.renamed).map(esc).join("|") + ")(?!\\d)", "g") : null;
  const goneRe = r.removed.length ? new RegExp("\\b(" + r.removed.map(esc).join("|") + ")(?!\\d)", "g") : null;
  // a note's mentions: a voice taken apart first (before its number can be given to another voice), then the renumbering
  const fixNote = s => { let t = String(s || ""); if (goneRe) t = t.replace(goneRe, "a speaker the recording did not establish"); if (keyRe) t = t.replace(keyRe, m => r.renamed[m]); return t; };
  let out = given.filter(s => !r.removed.includes(s.key)).map(s => {
    const key = r.renamed[s.key] || s.key, name = /^Speaker \d+$/.test(s.name || "") && r.renamed[s.key] ? "Speaker " + key.split(" ")[1] : s.name;
    return Object.assign({}, s, { key, name, bio: fixNote(s.bio) });
  });
  if (/^UNLABELED: /m.test(r.text)) {
    const u = out.find(s => s.key === "UNLABELED");
    if (u) { if (!u.bio.includes(FRAGMENT_NOTE)) u.bio = String(u.bio || "").replace(/\.?\s*$/, "") + (u.bio ? ", or were " : "The recording did not settle who is speaking here: these words were ") + FRAGMENT_NOTE + "."; }
    else out.push({ key: "UNLABELED", name: NOT_ESTABLISHED, bio: "The recording did not settle who is speaking here: these words were " + FRAGMENT_NOTE + "." });
  }
  const outClips = (clips || []).map(c => Object.assign({}, c, { speaker: r.removed.includes(c.speaker) ? "UNLABELED" : r.renamed[c.speaker] || c.speaker }));
  const outAds = (ads || []).map(a => Object.assign({}, a, { speakers: (a.speakers || []).map(k => r.removed.includes(k) ? "UNLABELED" : r.renamed[k] || k) }));
  return { changed: true, text: r.text, speakers: out, clips: outClips, ads: outAds, result: r };
}

module.exports = { rejoinFragments, rejoinLabelled, describe, MAX_WORDS, MIN_BROKEN };
