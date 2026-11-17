"use strict";
/* Speaker names for a transcript that has none: local Whisper writes paragraphs with no speakers; a pasted page
   transcript often has none either. The reading works without them (every turn is Speaker unknown), so this is
   optional. A person names the speakers; the model then splits the text into speaking turns and assigns one of those
   names, or UNKNOWN, to each. The text is never rewritten: the model names where each turn starts (its first words)
   and the app cuts the original text there, so every word stays as it was. A second, independent pass reviews each
   assignment; a turn keeps its name only when both passes agree, otherwise it is UNKNOWN. The result is written as
   "NAME: words" lines, which makes the labels look like any other transcript's, so the run records that they were
   assigned by a model from the words alone (`provenance.labelsOrigin = "model"`, `provenance.assignment`), the usual
   speaker preparation then runs on them, and the page and exports say so. A person can still correct any label. */
const shared = require("../shared/transcript");
const { callModel } = require("./preparation");

const UNKNOWN = "UNKNOWN";
function cleanNames(names) {
  const out = [];
  for (const n of (Array.isArray(names) ? names : String(names || "").split(/[,;\n]/))) {
    const s = String(n || "").replace(/\s+/g, " ").trim().replace(/:$/, "");
    if (!s) continue;
    if (s.length > 40 || s.split(" ").length > 4) throw Object.assign(new Error("A speaker name must be at most four words and 40 characters: " + s), { status: 400 });
    if (!/^[A-Za-z][A-Za-z0-9 .'\-]*$/.test(s)) throw Object.assign(new Error("A speaker name can use letters, digits, spaces, periods, apostrophes and hyphens: " + s), { status: 400 });
    const key = s.toUpperCase();
    if (key === UNKNOWN || key === "UNLABELED") throw Object.assign(new Error("That name is reserved: " + s), { status: 400 });
    if (!out.some(x => x.key === key)) out.push({ key, name: s });
  }
  if (out.length < 1) throw Object.assign(new Error("Name at least one speaker."), { status: 400 });
  if (out.length > 12) throw Object.assign(new Error("At most twelve speakers."), { status: 400 });
  return out;
}

/* Whitespace tokens of the original text with their offsets and normalised forms, so the model's "first words" can be
   found without ever using the model's spelling of the text. */
function tokens(text) {
  const out = []; const re = /\S+/g; let m;
  while ((m = re.exec(text))) out.push({ at: m.index, end: m.index + m[0].length, norm: shared.wordsOf(m[0]) });
  return out;
}
/* Index of the first token at or after `from` where the normalised text starting there begins with `norm`. */
function findStart(toks, norm, from) {
  if (!norm) return -1;
  for (let k = Math.max(0, from); k < toks.length; k++) {
    if (!toks[k].norm) continue;
    let s = ""; let j = k;
    while (j < toks.length && s.length < norm.length) { if (toks[j].norm) s = s ? s + " " + toks[j].norm : toks[j].norm; j++; }
    if (s === norm || s.startsWith(norm + " ")) return k;
  }
  return -1;
}
/* Cut the original text only at located boundaries. A missing boundary makes the containing span UNKNOWN;
   neither the second model nor the previous label may restore a name to that uncertain span. */
function cutTurns(text, proposed, keys) {
  const toks = tokens(text); if (!toks.length) return { turns: [], dropped: 0 };
  const cuts = []; let dropped = 0, from = 0;
  proposed.forEach((p, i) => {
    const sp = String(p && p.speaker || "").toUpperCase().trim();
    const speaker = keys.has(sp) ? sp : UNKNOWN;
    const k = findStart(toks, shared.wordsOf(String(p && p.start || "")).split(" ").slice(0, 8).join(" "), from);
    if (k === -1) { dropped++; if (cuts.length) cuts[cuts.length - 1].speaker = UNKNOWN; else cuts.push({ speaker: UNKNOWN, k: 0 }); from = Math.max(1, from); return; }
    if (!cuts.length && k > 0) cuts.push({ speaker: UNKNOWN, k: 0 });
    cuts.push({ speaker, k }); from = k + 1;
  });
  if (!cuts.length) cuts.push({ speaker: UNKNOWN, k: 0 });
  const turns = cuts.map((c, i) => { const a = toks[c.k].at, z = i + 1 < cuts.length ? toks[cuts[i + 1].k].at : text.length; return { speaker: c.speaker, text: text.slice(a, z).replace(/\s+/g, " ").trim() }; }).filter(t => t.text);
  // consecutive turns by the same speaker are one turn
  const merged = []; for (const t of turns) { const prev = merged[merged.length - 1]; if (prev && prev.speaker === t.speaker) prev.text += " " + t.text; else merged.push(t); }
  return { turns: merged, dropped };
}

function assignPrompt(names, context, text) {
  return "Assign speakers to an unlabeled transcript. The speakers are: " + JSON.stringify(names.map(n => n.name)) + "." +
    (context ? " Context: " + context + "." : "") +
    " Split the text into speaking turns wherever the speaker changes, in order, and name the speaker of each turn from that list, or UNKNOWN when the words do not tell you. Use what the words say: who is asked and who answers, self-references (my book, my show, my research), direct address by name, and the conversational role each name is given in the context. Do not guess from style or opinions. Every word of the text belongs to exactly one turn; do not reorder, omit or add words. For each turn give `start`: its first six words exactly as written in the text, and a short reason. " +
    "Reply only JSON: {\"turns\":[{\"speaker\":\"a listed name or UNKNOWN\",\"start\":\"first six words\",\"evidenceKind\":\"self_reference|explicit_address|conversational_role|insufficient\",\"reason\":\"\"}]}\nText:\n" + text;
}
function reviewPrompt(names, context, turns) {
  return "Review these speaker assignments independently. The speakers are: " + JSON.stringify(names.map(n => n.name)) + "." + (context ? " Context: " + context + "." : "") +
    " For each numbered turn, say whether the named speaker is supported by the words of the conversation (who asks, who answers, self-references, direct address, the roles in the context). Do not assume alternation. Reply only JSON: {\"verdicts\":[{\"index\":0,\"agree\":true,\"speaker\":\"the listed name you would give, or UNKNOWN\",\"reason\":\"\"}]}\nTurns:\n" +
    turns.map((t, i) => "[" + i + "] " + t.speaker + ": " + t.text).join("\n");
}

// A caption file can be a single paragraph hundreds of thousands of characters long.
// Bound each request at whitespace without discarding headings, numbers, or other source text.
function assignmentChunks(text, limit = 14000) {
  const chunks = []; let current = "";
  for (const paragraph of String(text).split(/\n\s*\n/).filter(p => p.trim())) {
    let remaining = paragraph.trim();
    while (remaining.length > limit) {
      if (current) { chunks.push(current); current = ""; }
      let cut = limit; while (cut > 0 && !/\s/.test(remaining[cut])) cut--;
      if (!cut) throw Object.assign(new Error("The transcript contains a word too long to read safely."), {status:400});
      chunks.push(remaining.slice(0, cut)); remaining = remaining.slice(cut).trimStart();
    }
    if (current && current.length + remaining.length + 2 > limit) { chunks.push(current); current = ""; }
    current += (current ? "\n\n" : "") + remaining;
  }
  if (current) chunks.push(current);
  return chunks;
}

/* Returns the new transcript text and the record of how it was made. Never writes; the caller saves. */
async function assignSpeakers({ ai, store, id, names, context, signal }) {
  const b = await store.bundle(id);
  if (!b) throw Object.assign(new Error("run not found"), { status: 404 });
  if (b.run.example) throw Object.assign(new Error("Copy the supplied example before changing it."), { status: 403 });
  if (b.run.kind === "claim") throw Object.assign(new Error("A typed claim has no speakers to assign."), { status: 400 });
  const labels = shared.speakerLabels(shared.parseTranscript(b.transcript, { mode: b.run.parseMode })).filter(l => l !== "UNLABELED");
  if (labels.length) throw Object.assign(new Error("This transcript already has speaker labels (" + labels.join(", ") + "). Edit them in the text, or correct a turn under Who said what."), { status: 409, code: "has_labels" });
  if (!ai) throw Object.assign(new Error("Add the model key to assign speakers."), { status: 503, code: "no_ai" });
  const people = cleanNames(names), keys = new Set(people.map(p => p.key));
  const ctx = String(context || "").replace(/\s+/g, " ").trim().slice(0, 600);
  const basis = await store.captureCallBasis(id, { transcriptUpdatedAt: b.run.transcriptUpdatedAt, attrSig: b.attrSig }, "assign_speakers");
  const chunks = assignmentChunks(b.transcript);
  const outTurns = [], calls = []; let dropped = 0, demoted = 0;
  for (const chunk of chunks) {
    if (signal && signal.aborted) throw Object.assign(new Error("Stopped"), { code: "cancelled" });
    const one = await callModel(ai, store, id, "assign_speakers", basis, assignPrompt(people, ctx, chunk), signal);
    await one.save(); calls.push(one.call.callId);
    if (["max_tokens", "refusal"].includes(one.out.stopReason)) throw Object.assign(new Error("Speaker naming was incomplete; the original text was kept."), {status:422});
    const proposed = one.out.data && Array.isArray(one.out.data.turns) ? one.out.data.turns.slice(0, 2000) : [];
    const cut = cutTurns(chunk, proposed.length ? proposed : [{ speaker: UNKNOWN, start: "" }], keys);
    dropped += cut.dropped;
    const two = await callModel(ai, store, id, "review_speakers", basis, reviewPrompt(people, ctx, cut.turns), signal);
    await two.save(); calls.push(two.call.callId);
    const verdicts = new Map(); for (const v of (two.out.data && Array.isArray(two.out.data.verdicts) ? two.out.data.verdicts : [])) if (v && Number.isInteger(v.index)) verdicts.set(v.index, v);
    cut.turns.forEach((t, i) => {
      const v = verdicts.get(i);
      const agrees = v && v.agree === true && String(v.speaker || "").toUpperCase().trim() === t.speaker;
      if (t.speaker !== UNKNOWN && !agrees) { demoted++; t.speaker = UNKNOWN; }
      const prev = outTurns[outTurns.length - 1];
      if (prev && prev.speaker === t.speaker) prev.text += " " + t.text; else outTurns.push({ speaker: t.speaker, text: t.text });
    });
  }
  const text = outTurns.map(t => t.speaker + ": " + t.text).join("\n");
  // nothing is lost: the same words, in the same order
  if (shared.wordsOf(text.replace(/^(?:[A-Z][A-Z0-9 .'\-]{0,40}): /gm, "")) !== shared.wordsOf(b.transcript)) throw Object.assign(new Error("The assignment would have changed the words; nothing was saved."), { status: 500, code: "words_changed" });
  const named = outTurns.filter(t => t.speaker !== UNKNOWN).length;
  const assignment = { by: "model", at: new Date().toISOString(), names: people, context: ctx, calls, turns: outTurns.length, named, unknown: outTurns.length - named, dropped, demoted,
    method: "Names supplied by a person. The model split the text into turns and named each from the words; a second pass reviewed every name and disagreements became UNKNOWN. The words were cut from the original text, never rewritten. These labels are not from the source and prove nothing about who spoke." };
  return { text, assignment, speakers: people.map(p => ({ key: p.key, name: p.name, bio: "" })).concat(outTurns.some(t => t.speaker === UNKNOWN) ? [{ key: UNKNOWN, name: "Speaker unknown", bio: "" }] : []), basis };
}

module.exports = { assignSpeakers, cutTurns, cleanNames, findStart, assignmentChunks, UNKNOWN };
