"use strict";
/* npm run eval — reads the cases in eval/cases.json with the configured model, through the same server code the app
   uses (store, speaker preparation, reading-2 prompts, context, review, quote and consistency gates), and writes a
   record and a scoring sheet to data/eval/<time>/. Nothing is substituted when no key is configured: it stops and says so.

   Options:
     --list              print the cases and their expected constraints; no model calls
     --cases a,b         only these case ids
     --repeat N          read each selected case N times (instability check; use on a few high-risk cases)
     --old               also ask the pre-0.12 passage prompt once per passage case (no review), for comparison
     --allow-mock        run with DEFLATE_MOCK_AI=1 to test this script's wiring; outputs are marked MOCK
     --out DIR           write here instead of data/eval/<time>/
   Each finished case is written at once (results.jsonl, results.json, scoring-sheet.md), so a stopped run keeps what it
   finished. The readings themselves, with every model-call record, stay under <out>/store/ (the app's own format).
   Cost: every case is a real reading on your key (speaker preparation where there are labels, one reading and one
   review per passage, an overview for several passages). The default set is about 130 model calls.
   A case marked "intake" goes in the way a paste does (readInput: page controls and timestamps separated, the speaker
   structure worked out from the words at the start of the reading), and its "speakers" expectations are checked on
   the labelled text and on whose claims the reading says they are. */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env") });
const { Store } = require("../server/store");
const { createAI } = require("../server/ai");
const { createReader, materialAsRead, readingMaterial } = require("../server/reading");
const { readInput } = require("../server/intake");
const shared = require("../shared/transcript");
const P = require("../shared/prompts");

const args = process.argv.slice(2), opt = n => args.includes("--" + n), val = n => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : null; };
const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex");
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, "eval", "cases.json"), "utf8"));
let cases = spec.cases;
if (val("cases")) { const want = val("cases").split(","); cases = cases.filter(c => want.includes(c.id)); if (!cases.length) { console.error("No case matches " + val("cases")); process.exit(1); } }
const repeat = Math.max(1, Number(val("repeat")) || 1);

function sourceText(c) {
  if (c.text) return c.text;
  const turns = shared.parseTranscript(fs.readFileSync(path.join(ROOT, c.from.file), "utf8"));
  return turns.slice(c.from.turns[0], c.from.turns[1] + 1).map(t => t.heading ? t.text : t.label + ": " + t.text).join("\n");
}
if (opt("list")) {
  for (const c of cases) console.log("\n" + c.id + (c.kind === "claim" ? " (typed claim)" : "") + "\n  tests: " + c.tests + "\n  meaning: " + c.expect.meaning + "\n  constraints: " + JSON.stringify(Object.fromEntries(Object.entries(c.expect).filter(([k]) => k !== "meaning"))));
  console.log("\n" + cases.length + " cases."); process.exit(0);
}

/* Every text the model wrote, at both levels, by field. */
function fields(a) {
  const out = [];
  const add = (name, x) => { if (x && typeof x === "object") { if (x.hs) out.push([name + ".hs", x.hs]); if (x.g5) out.push([name + ".g5", x.g5]); } };
  add("plain words", a.deflated); add("fair reading", a.defense); add("what follows", { hs: a.revision && a.revision.hs, g5: a.revision && a.revision.g5 }); add("concern", { hs: a.jump && a.jump.hs, g5: a.jump && a.jump.g5 }); add("fidelity notes", a.fidelity && a.fidelity.notes);
  (a.claims || []).forEach((c, i) => { add("claim " + (i + 1) + " plain", c.plain); add("claim " + (i + 1) + " basis", c.basis); add("claim " + (i + 1) + " settle", c.settle); });
  return out;
}
/* Wording that tells the reader about the machinery instead of the passage (0.12.2: kept off the card). */
const NARRATION = /\b(no (reasoning )?concerns? (was|is|were|are) raised|(the|this|that|a) (concern|worry) (stands|survives|remains|stays|is withdrawn|was withdrawn|is kept|was kept|falls away)|none survives|nothing (is )?left to flag|the fair reading\b|fair reading (supports|shows|answers)|used only (for|as) context|only (for|as) context|which we use only|for interpretation only|no problem to begin with|we do not raise|the (separate )?review(er)? (found|said|asked|flagged|noted|approved|rejected|requires)|(an |the )?earlier (draft|version of this reading)|this draft\b)/i;
/* Whether a restatement says whose claim it is, in its first sentence: the speaker's label, "the speaker", or a pronoun
   with a reporting verb. A heuristic pointer, not a judgment. */
function attributed(text, labels) {
  const t = String(text || "").split(/(?<=[.!?])\s+/)[0]; if (!t) return true;
  const words = [].concat(labels || []).join(" ").toLowerCase().split(/[^a-z']+/).filter(w => w.length > 2 && !["the", "and", "unlabeled"].includes(w));
  if (words.some(w => new RegExp("\\b" + w + "\\b", "i").test(t))) return true;
  return /\b(the )?speaker\b|\b(he|she|they|it|guest|host) (says|said|claims|claimed|argues|argued|reports|reported|thinks|believes|states|stated|asserts|recommends|suggests|predicts|expects|concludes|adds|notes|admits|insists|warns|hopes|calls|tells|told)\b|\bthe claim (says|is that|asserts|states)\b|\baccording to (him|her|them|the speaker)\b/i.test(t);
}
function labelsOf(text) { return [...new Set(String(text || "").split("\n").map(l => (l.match(/^([A-Z][A-Z .'-]{1,40}):/) || [])[1]).filter(Boolean))]; }
/* Mechanical checks: an aid for the person scoring, not the score. `known` is the speakers' labels and names when the
   app worked them out (an intake case); otherwise the labels in the case's text. */
function mechanical(c, a, known) {
  const e = c.expect, res = [], rx = s => new RegExp(s, "i"), all = fields(a || {});
  if (!a) return [["reading present", false, "no reading (held or failed)"]];
  const labels = known || labelsOf(c.text || "");
  // every case: no narration of the process in the card text, and every restatement says whose claim it is
  const card = [["plain words", a.deflated], ["fair reading", a.defense], ["what follows", a.revision]];
  for (const L of ["hs", "g5"]) {
    const hit = c.kind === "claim" ? null : card.map(([n, x]) => [n + "." + L, x && x[L] || ""]).find(([, t]) => NARRATION.test(t));
    if (c.kind !== "claim") res.push(["card text (" + L + ") states the substance, not the process", !hit, hit ? hit[0] + ": “" + (hit[1].match(NARRATION) || [""])[0] + "” in " + hit[1] : ""]);
    res.push(["plain words (" + L + ") say whose claim it is", attributed(a.deflated[L], labels), a.deflated[L] || ""]);
    if (c.kind !== "claim") (a.claims || []).forEach((cl, i) => { const t = cl.plain && cl.plain[L] || ""; if (t && !attributed(t, [cl.speaker].concat(labels))) res.push(["claim " + (i + 1) + " plain (" + L + ") says whose claim it is", false, t]); });
  }
  if (e.sound) { const survives = a.jump.present && ["yes", "partly"].includes(a.revision.jumpSurvives); res.push(["sound: no concern survives", !survives && a.judgments.inference !== "gap", survives ? "concern survives (" + a.revision.jumpSurvives + "): " + a.jump.hs : a.judgments.inference === "gap" ? "inference recorded as gap" : ""]); }
  if (e.concern) { const survives = a.jump.present && ["yes", "partly"].includes(a.revision.jumpSurvives); res.push(["a concern survives", survives, survives ? "" : "no surviving concern"]); }
  (e.keep || []).forEach(group => ["hs", "g5"].forEach(l => { const text = a.deflated[l] || ""; const ok = group.some(g => rx(g).test(text)); res.push(["plain words (" + l + ") keeps /" + group.join("|") + "/", ok, ok ? "" : text]); }));
  (e.forbid || []).forEach(f => { const hit = all.find(([, t]) => rx(f).test(t)); res.push(["never says /" + f + "/", !hit, hit ? hit[0] + ": " + hit[1] : ""]); });
  (e.plainForbid || []).forEach(f => ["hs", "g5"].forEach(l => { const t = a.deflated[l] || ""; res.push(["plain words (" + l + ") never says /" + f + "/", !rx(f).test(t), rx(f).test(t) ? t : ""]); }));
  (e.mention || []).forEach(m => { const hit = all.find(([, t]) => rx(m).test(t)); res.push(["mentions /" + m + "/", !!hit, hit ? "" : "not found in any field"]); });
  (e.types || []).forEach(t => { const ok = (a.claims || []).some(x => x.type === t); res.push(["has a claim of type " + t, ok, ok ? "" : "types: " + (a.claims || []).map(x => x.type).join(", ")]); });
  return res;
}

/* Whose words are these, after intake (an "intake" case's "speakers" expectations): every spoken word kept, page
   controls gone, a phrase in a turn with the expected label, two phrases in different (or the same) speakers' turns,
   and every claim holding a phrase credited to the speaker of a given turn. Pointers for the person scoring. */
function speakerChecks(c, b, before) {
  const e = c.expect.speakers; if (!e) return [];
  const res = [], W = s => shared.wordsOf(s), ov = b.run.provenance && b.run.provenance.overrides || {};
  const turns = shared.parseTranscript(b.transcript, { mode: b.run.parseMode || "transcript" }).filter(t => !t.heading);
  const turnOf = phrase => turns.find(t => (" " + W(t.text) + " ").includes(" " + W(phrase) + " "));
  const label = phrase => { const t = turnOf(phrase); return t ? shared.effSpeaker(t, ov) : null; };
  const strip = s => String(s).replace(/^[ \t]*[A-Z][A-Za-z0-9 .'\-]{0,40}:[ \t]+/gm, "");
  res.push(["every spoken word kept, in order", W(strip(b.transcript)) === W(strip(before)), ""]);
  if (e.chromeGone) { const hit = /Copy link|\b\d{1,2}:\d{2}:\d{2}\b/.exec(b.transcript); res.push(["no page controls or timestamps in the text", !hit, hit ? hit[0] : ""]); }
  for (const [phrase, want] of e.label || []) { const l = label(phrase); res.push(["“" + phrase + "” is in a turn labelled /" + want + "/", !!l && new RegExp(want).test(l), l || "phrase not found"]); }
  for (const [x, y] of e.differ || []) { const lx = label(x), ly = label(y); res.push(["“" + x + "” and “" + y + "” are different speakers' words", !!lx && !!ly && lx !== ly && lx !== "UNLABELED" && ly !== "UNLABELED", lx + " / " + ly]); }
  for (const [x, y] of e.same || []) { const lx = label(x), ly = label(y); res.push(["“" + x + "” and “" + y + "” are the same speaker's words", !!lx && lx === ly && lx !== "UNLABELED", lx + " / " + ly]); }
  for (const [claim, turn] of e.claim || []) {
    const want = label(turn), held = b.passages.filter(p => p.analysis && p.readingGate.status === "ready").flatMap(p => p.analysis.claims || []).filter(x => (" " + W(x.text) + " ").includes(" " + W(claim) + " "));
    res.push(["claims holding “" + claim + "” are credited to the speaker of “" + turn + "” (" + want + ")", held.length > 0 && held.every(x => x.speaker === want), held.length ? held.map(x => x.speaker).join(", ") : "no ready claim holds it"]);
  }
  const present = shared.speakerLabels(turns);
  for (const l of e.absent || []) res.push(["no turn is labelled " + l, !present.includes(l), present.join(", ")]);
  return res;
}

/* Every model exchange of a case, with its full text, appended to <out>/exchanges/<case>.jsonl as it happens. The app's
   call records keep hashes, not text; this keeps the drafts a review rejected, the review's own answers and the
   corrections, so a person can judge whether a hold or a rejection was warranted. */
function kindOf(prompt) {
  if (prompt.startsWith("Help a reader understand this passage accurately.")) return (prompt.includes("This is ONE claim") ? "claim" : "reading") + (/The draft was held before display|Your previous answer could not be used/.test(prompt) ? " (correction)" : "");
  if (prompt.startsWith("Review this reading before it is shown")) return prompt.includes("closing overview") ? "overview review" : "review";
  if (prompt.startsWith("Correct a reading.")) return "correction";
  if (prompt.startsWith("Review a corrected reading")) return "review of the corrected reading";
  if (prompt.startsWith("Check a correction to a reading")) return "check of a correction (0.13.0)";
  if (prompt.startsWith("This transcript has no speaker labels") || prompt.startsWith("Find recordings played")) return "speaker structure";
  if (prompt.startsWith("Review a speaker structure")) return "review of the speaker structure";
  if (prompt.startsWith("These transcript turns are labelled SPEAKER 1")) return "names for voices (0.13)";
  if (prompt.startsWith("Who is each voice in this conversation?")) return "who each voice is";
  if (prompt.startsWith("Below are the final readings")) return "overview";
  if (prompt.startsWith("You are a deflation reader")) return "pre-0.12 prompt (comparison)";
  return "other";
}
function logged(ai, sink) {
  return Object.assign({}, ai, { async sample(args) {
    const prompt = String(args && args.prompt || ""), x = { n: sink.list.length + 1, at: new Date().toISOString(), kind: kindOf(prompt), promptSha256: sha(prompt), promptChars: prompt.length };
    // outputSha256 is computed exactly as the app computes a call's outputHash, so a call and its exchange can be paired
    // by what was sent and what came back (pairer)
    try { const out = await ai.sample(args); Object.assign(x, { text: out.text != null ? String(out.text) : JSON.stringify(out.data), outputSha256: sha(out.text || JSON.stringify(out.data)), data: out.data === undefined ? null : out.data, stopReason: out.stopReason || "", usage: out.usage || null, model: out.model || "" }); return out; }
    catch (e) { Object.assign(x, { error: e.code || String(e && e.message || e), text: e && e.text != null ? String(e.text) : "", data: null, stopReason: e && e.meta && e.meta.stopReason || "" }); if (e && e.meta) x.outputSha256 = sha(e.text || ""); throw e; }
    finally { x.prompt = prompt; sink.add(x); }
  } });
}
/* Pairs a call record with the exchange that produced it by what was sent AND what came back: the call keeps the
   prompt's SHA-256 (promptHash) and the answer's (outputHash), and the exchange keeps both too. The prompt alone is not
   enough: two attempts that write the same draft send an identical review prompt and can get different answers. Each
   exchange is used once, in order, so identical pairs (same prompt, same answer) also pair in sequence. */
function pairer(exchanges) {
  const used = new Set(), t = v => Date.parse(v || "") || 0;
  return call => {
    if (!call) return null;
    // among exchanges with the same prompt and the same answer, the one made when the call was made
    const fits = exchanges.filter(e => !used.has(e.n) && e.promptSha256 === call.promptHash && (e.outputSha256 || "") === (call.outputHash || ""));
    const x = fits.sort((a, b) => Math.abs(t(a.at) - t(call.at)) - Math.abs(t(b.at) - t(call.at)) || a.n - b.n)[0];
    if (x) used.add(x.n);
    return x || null;
  };
}
const byTime = (x, y) => x.at < y.at ? -1 : x.at > y.at ? 1 : 0;
/* Every attempt at one passage, in order, from the app's own record (attempts/<pid>.jsonl, latest reading run): the
   full draft, each correction (what it changed and what was still open after it), a fifth-grade withholding, whether
   the result was shown, every reason it was not, and the review's own answer, which the app recorded from the same call.
   Each attempt is linked to its exchange (the full prompt and answer) by the prompt's and the answer's fingerprints;
   review calls that could not be read, and their retries, are listed with the attempt they belong to. One pairer per case. */
function attemptsFor(entries, calls, exchanges, pair) {
  pair = pair || pairer(exchanges);
  const last = entries && entries[entries.length - 1];
  if (!last) return [];
  const byId = new Map(calls.map(c => [c.callId, c])), list = last.attempts || [], shown = /^shown/.test(last.outcome || "");
  const timed = list.map(t => byId.get(t.callId)).filter(Boolean).sort(byTime);
  return list.map((t, i) => {
    const c = byId.get(t.callId), x = c ? pair(c) : null;
    const decidedBy = c && c.review && c.review.callId ? byId.get(c.review.callId) : null;
    const next = c ? timed.find(z => z.at > c.at && z !== c) : null;
    // the review (or the check of a correction) asked for this attempt, an unreadable answer and its retry included
    const reviews = c ? calls.filter(z => /_(review|recheck)$/.test(z.purpose) && z.at >= c.at && (!next || z.at < next.at)).sort(byTime).map(z => { const e = pair(z); return { callId: z.callId, decided: !!(decidedBy && decidedBy.callId === z.callId), error: z.error || "", unusable: z.unusable || "", stopReason: z.stopReason || "", exchange: e ? e.n : null, text: e && e.data == null ? e.text : undefined }; }) : [];
    const finalShown = shown && (i === list.length - 1 || list[list.length - 1].kind === "decision" && i === list.length - 2);
    return { attempt: i + 1, kind: t.kind || "draft", round: t.round || 0, callId: t.callId || "", exchange: x ? x.n : null, shown: finalShown, error: t.error || "", stopReason: c && c.stopReason || "",
      reasons: t.issues || [], changed: t.changed || [], ignored: t.ignored || [], g5Withheld: !!t.g5Withheld,
      review: t.review || decidedBy ? { callId: decidedBy ? decidedBy.callId : "", exchange: (reviews.find(z => z.decided) || {}).exchange || null, answer: t.review || null } : null, reviewCalls: reviews,
      draft: t.draft || null, draftText: !t.draft && x && x.data == null ? x.text : undefined };
  });
}

async function main() {
  const ai = createAI(process.env);
  if (!ai) { console.error("No model key is configured (ANTHROPIC_API_KEY in .env). Nothing was run, and no mock was used in its place.\nAdd the key (the app asks for it once, or put it in .env), then run  npm run eval  again."); process.exit(2); }
  if (ai.mock && !opt("allow-mock")) { console.error("DEFLATE_MOCK_AI is on: the readings would be placeholders. Nothing was run. Use --allow-mock only to test this script's wiring."); process.exit(2); }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-"), outDir = val("out") ? path.resolve(val("out")) : path.join(ROOT, "data", "eval", stamp);
  const work = path.join(outDir, "store"), shown = path.relative(ROOT, outDir).startsWith("..") ? outDir : path.relative(ROOT, outDir);
  fs.mkdirSync(work, { recursive: true });
  const store = new Store(work); await store.init();
  const results = [];
  const meta = { model: ai.mock ? "MOCK" : ai.model, contract: P.CONTRACT, contextVersion: shared.CONTEXT_VERSION, startedAt: new Date().toISOString(), repeat, cases: cases.map(c => c.id) };
  // written after every case: a stopped or failed run keeps everything it finished
  const save = done => {
    fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(Object.assign({}, meta, { finished: done, completed: results.length, results }), null, 2));
    fs.writeFileSync(path.join(outDir, "scoring-sheet.md"), sheet(results, ai, done));
  };
  process.on("SIGINT", () => { save(false); console.log("\nStopped. " + results.length + " finished case(s) are in " + shown + "."); process.exit(130); });
  fs.mkdirSync(path.join(outDir, "exchanges"), { recursive: true });
  const sink = { list: [], file: "", add(x) { this.list.push(x); if (this.file) fs.appendFileSync(this.file, JSON.stringify(x) + "\n"); } };
  const model = logged(ai, sink);
  const reader = createReader({ store, getAI: () => model, searchClaim: null, research: null });
  console.log("Model: " + (ai.mock ? "MOCK" : ai.model) + " · contract " + P.CONTRACT + " · context " + shared.CONTEXT_VERSION + " · " + cases.length + " cases × " + repeat);
  for (const c of cases) for (let n = 1; n <= repeat; n++) {
    const text = sourceText(c), t0 = Date.now();
    process.stdout.write(c.id + (repeat > 1 ? " #" + n : "") + " … ");
    const record = { id: c.id, run: n, kind: c.kind || "passage", tests: c.tests, expect: c.expect, provenance: c.provenance || null, sourceSha256: sha(text), sourceChars: text.length };
    let id = null;
    sink.list = []; sink.file = path.join(outDir, "exchanges", c.id + (repeat > 1 ? "-" + n : "") + ".jsonl");
    record.exchanges = path.relative(outDir, sink.file);
    let before = text;
    try {
      if (c.intake) {
        // the way a paste comes in: the page's controls and times separated, the speaker structure left to the reading
        const prepared = await readInput(text, { title: c.id }, async () => ({ ok: false, reason: "eval cases are text" }));
        before = prepared.text; record.intake = { changed: prepared.intake.changed, web: prepared.intake.web || null };
        id = await store.createRun(prepared.doc, prepared.text);
        await store.saveIntake(id, prepared.original, prepared.intake);
      } else id = await store.createRun(c.kind === "claim" ? { kind: "claim", title: c.id } : { title: c.id }, text);
      let b = await store.bundle(id);
      if (c.passages && c.kind !== "claim") {
        if (c.from) { const orig = shared.parseTranscript(fs.readFileSync(path.join(ROOT, c.from.file), "utf8")), now = shared.parseTranscript(b.transcript); for (const p of c.passages) for (let i = p.turnStart; i <= p.turnEnd; i++) if (!orig[i] || !now[i] || orig[i].text !== now[i].text) throw new Error("turn " + i + " moved when the excerpt was cut"); }
        await store.replacePassages(id, c.passages.map(p => Object.assign({ status: "pending", stake: "" }, p)));
        await store.saveProcessing(id, { segmentationHash: b.run.input.sha256, segmentationAttr: b.attrSig });
      }
      await reader.start(id); const job = reader.jobs.get(id); if (job) await job.done;
      b = await store.bundle(id);
      const calls = fs.readFileSync(path.join(work, "runs", id, "calls.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
      record.model = [...new Set(calls.map(x => x.modelReturned).filter(Boolean))].join(", ") || ai.model;
      record.contract = P.CONTRACT; record.contextVersion = shared.CONTEXT_VERSION;
      record.processing = { status: b.run.processing.status, message: b.run.processing.message, error: b.run.processing.error || null };
      record.latencyMs = Date.now() - t0; record.calls = calls.length;
      record.usage = calls.reduce((u, x) => ({ input: u.input + (x.usage && x.usage.input || 0), output: u.output + (x.usage && x.usage.output || 0) }), { input: 0, output: 0 });
      record.failedCalls = calls.filter(x => x.error).map(x => ({ purpose: x.purpose, error: x.error, stopReason: x.stopReason || "" }));
      record.attribution = { gate: b.attributionGate.status, corrections: (b.run.preparation && b.run.preparation.corrections || []).length, unresolved: (b.run.preparation && b.run.preparation.unresolved || []).length };
      const known = c.intake ? [...new Set((b.run.speakers || []).flatMap(x => [x.key, x.name]).filter(Boolean))] : undefined;
      if (c.intake) {
        const st = b.run.provenance.structure || null;
        record.speakers = { labelsOrigin: b.run.provenance.labelsOrigin || "", labelled: b.transcript, speakers: b.run.speakers || [],
          structure: st ? { established: st.established, mode: st.mode, voices: st.voices, clips: st.clips || [], clipsRejected: st.clipsRejected || [], changesProposed: st.changesProposed, changesEstablished: st.changesEstablished, notEstablished: st.notEstablished || [], reviewDisagreed: st.reviewDisagreed, unestablishedSegments: st.unestablishedSegments, names: st.names || [], calls: st.calls || [] } : null,
          checks: speakerChecks(c, b, before) };
      }
      record.passages = b.passages.map(p => ({ id: p.id, title: p.title, turns: [p.turnStart, p.turnEnd], gate: p.readingGate.status, reasons: p.readingGate.reasons, context: p.provenance && p.provenance.context || null, review: p.provenance && p.provenance.review ? { approved: p.provenance.review.approved, attempts: p.provenance.review.attempts, issues: p.provenance.review.issues } : null, quoteCheck: p.quoteCheck || null, analysis: p.analysis || null,
        checks: p.analysis && p.readingGate.status === "ready" ? mechanical(c, p.analysis, known) : [["reading ready", false, (p.readingGate.reasons || []).join("; ")]] }));
      record.overview = b.summary ? { gate: b.summary.readingGate.status, patterns: b.summary.patterns, survived: b.summary.survived } : null;
      // the exact passage and context each reading was made from, checked against the hash on its record; for a passage
      // with no reading, the material that was sent for it
      for (const p of record.passages) { const full = b.passages.find(x => x.id === p.id); p.material = !full ? null : full.analysis ? await materialAsRead(store, b, full) : c.kind === "claim" ? null : Object.assign({ available: true, matches: null, sentFor: "no reading kept" }, { source: readingMaterial(b, full).source }); }
      // every attempt at each passage, with the rejected drafts and the complete reasons
      const pair = pairer(sink.list), log = await store.attemptsLog(id);
      for (const p of record.passages) { const full = b.passages.find(x => x.id === p.id); p.attempts = full ? attemptsFor(log[p.id] || [], calls, sink.list, pair) : []; p.held = full && full.held || null; p.levels = full && full.analysis && full.analysis.levels || null;
        for (const t of p.attempts) if (!t.shown && t.draft) t.checks = mechanical(c, shared.sanitizeAnalysis(t.draft), known); }
      if (opt("old") && c.kind !== "claim") {
        const turns = shared.parseTranscript(b.transcript), ov = b.run.provenance.overrides;
        record.old = [];
        for (const p of b.passages) { const t1 = Date.now(); try { const out = await model.sample({ prompt: P.deflateV1(b.run, p, shared.fmtTurns(turns, ov, p.turnStart, p.turnEnd)), json: true }); const a = shared.sanitizeAnalysis(out.data); record.old.push({ passage: p.id, model: out.model, usage: out.usage, latencyMs: Date.now() - t1, analysis: a, checks: mechanical(c, a) }); } catch (e) { record.old.push({ passage: p.id, error: e.code || e.message, stopReason: e.meta && e.meta.stopReason || "" }); } }
      }
      const failed = record.passages.flatMap(p => p.checks.filter(x => !x[1]).map(x => x[0])).concat(record.speakers ? record.speakers.checks.filter(x => !x[1]).map(x => x[0]) : []);
      record.summaryLine = record.processing.status + " · " + record.calls + " calls · " + (failed.length ? failed.length + " check(s) to look at" : "mechanical checks pass");
    } catch (e) { record.error = String(e && e.message || e); }
    // where this case's readings and every model-call record (failed calls included) are kept
    if (id) { record.runId = id; record.callRecords = path.relative(outDir, path.join(work, "runs", id, "calls.jsonl")); }
    results.push(record);
    fs.appendFileSync(path.join(outDir, "results.jsonl"), JSON.stringify(record) + "\n");
    save(false);
    console.log(record.error ? "error: " + record.error : record.summaryLine);
  }
  save(true);
  const usage = results.reduce((u, r) => ({ input: u.input + (r.usage ? r.usage.input : 0), output: u.output + (r.usage ? r.usage.output : 0) }), { input: 0, output: 0 });
  console.log("\nTokens: " + usage.input + " in, " + usage.output + " out." + (ai.mock ? " MOCK run: this tested the script's wiring only." : ""));
  console.log("Written: " + path.join(shown, "results.json") + ", results.jsonl, scoring-sheet.md and exchanges/. Score every case by hand; the mechanical checks only point at places to look.");
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { mechanical, attributed, speakerChecks, NARRATION, kindOf, attemptsFor, pairer, sheet };

/* The sheet a person fills in: the expected meaning (written before the run), the outputs at both levels, the
   mechanical pointers, and the six scores per level from the brief. */
function plural2(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
function pointers(checks) { return (checks || []).map(x => (x[1] ? "✓ " : "✗ ") + x[0] + (x[2] && !x[1] ? " — " + x[2] : "")).join("; ") || "none"; }
/* The reader-facing text of one reading, at both levels: the card, then the concern and the claims with their plain
   restatements (shown under Evidence in the app). */
function reading(out, a, kind) {
  for (const L of ["hs", "g5"]) {
    out.push("**" + (L === "hs" ? "High school" : "Fifth grade") + "**", "", "- In plain words: " + (a.deflated[L] || "—"));
    if (kind !== "claim") out.push("- A fair reading: " + (a.defense[L] || "—"), "- What follows: " + (a.revision[L] || "—"));
    out.push("");
  }
  if (kind !== "claim") out.push("Concern: " + (a.jump.present ? "raised, " + ({ yes: "stands", partly: "partly stands", no: "withdrawn" }[a.revision.jumpSurvives] || "outcome not stated") + " — " + a.jump.hs + (a.jump.pivot ? " Pivot: “" + a.jump.pivot + "”" : "") : "none — " + (a.jump.hs || "")), "");
  if (kind !== "claim" && (a.claims || []).length) {
    out.push("Claims:", "");
    for (const c of a.claims) out.push("- [" + shared.claimTypeLabel(c.type) + "] " + (c.speaker ? c.speaker + ": " : "") + c.text, "  - High school: " + (c.plain && c.plain.hs || "—"), "  - Fifth grade: " + (c.plain && c.plain.g5 || "—"));
    out.push("");
  } else if ((a.claims || []).length) out.push("Type: " + shared.claimTypeLabel(a.claims[0].type), "");
}
function sheet(results, ai, done) {
  const out = ["# Reading evaluation · " + (ai.mock ? "MOCK (wiring only)" : ai.model) + " · " + P.CONTRACT, "", done ? "" : "_Incomplete: " + results.length + " case(s) finished so far._", "",
    "Score each reading at both levels, 0 (wrong) / 1 (partly) / 2 (right): **meaning**, **qualifiers** (some/all, may/must, if/only if, numbers and denominators), **attribution** (who said it, quoted versus own view), **justified final judgment**, **fair to the source** (no invented premises; concern only where named), **uncertainty scoped correctly**. Write the reason for every score below 2. A sound case that gets a surviving concern, any material meaning change, and any invented quotation must be fixed before the semantic change is called ready. A small set shows performance on that set only.", ""];
  for (const r of results) {
    out.push("## " + r.id + (r.run > 1 ? " (run " + r.run + ")" : ""), "", "*Tests:* " + r.tests, "", "*Expected meaning (written before the run):* " + r.expect.meaning, "");
    if (r.provenance) out.push("*Source:* " + r.provenance.speaker + ", " + r.provenance.event + ", " + r.provenance.date + " — " + r.provenance.source + ". " + r.provenance.note, "");
    if (r.error) { out.push("**Error:** " + r.error + (r.callRecords ? " · call records: " + r.callRecords : ""), ""); continue; }
    if (r.speakers) {
      const st = r.speakers.structure, fence = /```/.test(r.speakers.labelled) ? "````" : "```";
      out.push("**Speakers** (" + (r.speakers.labelsOrigin === "words" ? "worked out from the words" : r.speakers.labelsOrigin || "no labels") + (st ? "; " + (st.established ? plural2(st.voices, "voice") + ", " + plural2((st.clips || []).length, "clip or quotation", "clips or quotations") + ", " + st.changesEstablished + " of " + st.changesProposed + " proposed changes of speaker established" + (st.reviewDisagreed ? ", " + st.reviewDisagreed + " not agreed by the review" : "") : "nothing established") : "; the structure pass did not run") + "). The text as the reading saw it:", "", fence + "text", r.speakers.labelled, fence, "");
      if (st && st.notEstablished && st.notEstablished.length) out.push("Proposed but not established: " + st.notEstablished.map(x => x.voice + " (" + x.kind + ": “" + x.quote + "”) — " + x.why).join(" · "), "");
      if (st && st.clipsRejected && st.clipsRejected.length) out.push("Clips proposed but not established: " + st.clipsRejected.map(x => (x.id || "paragraph " + x.para) + " — " + x.why).join(" · "), "");
      out.push("Speaker pointers: " + pointers(r.speakers.checks), "", "| whose words | right / partly / wrong | notes |", "|---|---|---|", "| speakers, clips and quotations | | |", "");
    }
    out.push("*Run:* " + r.processing.status + " · model " + r.model + " · " + r.calls + " calls · " + r.usage.input + "/" + r.usage.output + " tokens · " + Math.round(r.latencyMs / 100) / 10 + " s · source sha256 " + r.sourceSha256.slice(0, 12) + "…" + (r.failedCalls.length ? " · failed calls: " + r.failedCalls.map(x => x.purpose + " " + x.error + (x.stopReason ? " (" + x.stopReason + ")" : "")).join(", ") : "") + " · call records: " + r.callRecords, "");
    for (const p of r.passages) {
      const a = p.analysis;
      out.push("### " + p.title + " (turns " + p.turns.join("–") + ") — " + p.gate + (p.reasons && p.reasons.length ? ": " + p.reasons.join("; ") : ""), "");
      const fence = p.material && /```/.test(p.material.source || "") ? "````" : "```";
      if (p.material && p.material.available) out.push("**" + (p.material.sentFor ? "Source sent (no reading was kept)" : "Source as read") + "**" + (p.material.matches === false ? " (WARNING: rebuilt text does not match the hash on the reading's record)" : p.material.matches ? " (rebuilt and checked against the reading's record)" : "") + ":", "", fence + "text", p.material.source, fence, "");
      else if (p.material) out.push("**Source as read:** not available — " + p.material.why, "");
      if (a) reading(out, a, r.kind);
      out.push("Mechanical pointers: " + pointers(p.checks), "");
      if (p.levels && p.levels.g5 === "withheld") out.push("**Fifth grade withheld:** only the fifth-grade wording still failed its check after correction, so the card shows the high-school reading at both levels. Still open: " + (p.levels.reasons || []).join(" · "), "");
      const rejected = (p.attempts || []).filter(t => !t.shown && t.kind !== "decision");
      if (rejected.length) {
        out.push("**Before display** (" + p.attempts.length + " attempt" + (p.attempts.length === 1 ? "" : "s") + "; full prompts and answers in " + r.exchanges + ")", "");
        for (const t of rejected) {
          if (t.kind === "correction") {
            out.push("_Attempt " + t.attempt + "_ (correction " + t.round + ", call " + t.callId + "): " + (t.changed.length ? "changed only " + t.changed.map(c => c.path).join(", ") : "changed nothing" + (t.ignored.length ? " allowed (it tried " + t.ignored.join(", ") + ")" : "")) + ".", "");
            for (const ch of t.changed) out.push("- " + ch.path + ": " + JSON.stringify(ch.before) + " → " + JSON.stringify(ch.after));
            out.push("", t.reasons.length ? "Still open after it:" : "Nothing was still open after it.", "");
          } else out.push("_Attempt " + t.attempt + "_ (full draft, call " + t.callId + (t.stopReason && t.stopReason !== "end_turn" ? ", stopped: " + t.stopReason : "") + "). Not shown because:", "");
          (t.kind === "correction" ? t.reasons : t.reasons.length ? t.reasons : ["no reason recorded"]).forEach(x => out.push("- " + x));
          if (t.review && t.review.answer) out.push("", t.kind === "correction" ? "The review of the whole corrected reading (exchange " + t.review.exchange + ") answered: " + JSON.stringify(t.review.answer) : "The separate review (exchange " + t.review.exchange + ") answered approved: " + String(t.review.answer.approved) + (Array.isArray(t.review.answer.issues) && t.review.answer.issues.length ? ", with the issues above." : "; the reasons above came from the app's own checks."));
          for (const z of (t.reviewCalls || []).filter(z => z.error || z.unusable)) out.push("", "A review answer could not be used (" + (z.error || z.unusable) + (z.stopReason && z.error ? ", " + z.stopReason : "") + ", exchange " + z.exchange + ")" + (z.decided ? "." : "; the review was asked again."));
          out.push("");
          if (t.kind !== "correction" && t.draft) reading(out, shared.sanitizeAnalysis(t.draft), r.kind);
          else if (t.draftText) out.push("The answer could not be read as JSON:", "", "````text", t.draftText, "````", "");
          if (t.kind !== "correction" && t.checks) out.push("Mechanical pointers for this draft: " + pointers(t.checks), "");
        }
      }
      out.push("| level | meaning | qualifiers | attribution | justified judgment | fair to source | uncertainty | notes |", "|---|---|---|---|---|---|---|---|", "| HS | | | | | | | |", "| 5th | | | | | | | |", "");
    }
    if (r.overview) out.push("Across this reading (" + r.overview.gate + "): " + (r.overview.patterns.length ? r.overview.patterns.map(x => x.title.hs + " [" + x.passages.join(", ") + "]").join("; ") : "no recurring concern") + ". " + (r.overview.survived && r.overview.survived.hs || ""), "");
    if (r.old) out.push("Pre-0.12 prompt, for comparison: " + r.old.map(o => o.error ? o.passage + ": error " + o.error : o.passage + ": " + o.analysis.deflated.hs + " | concern: " + (o.analysis.jump.present ? o.analysis.revision.jumpSurvives : "none") + " | types: " + o.analysis.claims.map(c => c.type).join(", ") + " | pointers failed: " + o.checks.filter(x => !x[1]).map(x => x[0]).join("; ")).join(" · "), "");
  }
  return out.join("\n");
}
