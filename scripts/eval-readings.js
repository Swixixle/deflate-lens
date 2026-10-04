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
   Cost: every case is a real reading on your key (speaker preparation where there are labels, one reading and one
   review per passage, an overview for several passages). The default set is about 120 model calls. */
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env") });
const { Store } = require("../server/store");
const { createAI } = require("../server/ai");
const { createReader } = require("../server/reading");
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
/* Mechanical checks: an aid for the person scoring, not the score. */
function mechanical(c, a) {
  const e = c.expect, res = [], rx = s => new RegExp(s, "i"), all = fields(a);
  if (!a) return [["reading present", false, "no reading (held or failed)"]];
  if (e.sound) { const survives = a.jump.present && ["yes", "partly"].includes(a.revision.jumpSurvives); res.push(["sound: no concern survives", !survives && a.judgments.inference !== "gap", survives ? "concern survives (" + a.revision.jumpSurvives + "): " + a.jump.hs : a.judgments.inference === "gap" ? "inference recorded as gap" : ""]); }
  if (e.concern) { const survives = a.jump.present && ["yes", "partly"].includes(a.revision.jumpSurvives); res.push(["a concern survives", survives, survives ? "" : "no surviving concern"]); }
  (e.keep || []).forEach(group => ["hs", "g5"].forEach(l => { const text = a.deflated[l] || ""; const ok = group.some(g => rx(g).test(text)); res.push(["plain words (" + l + ") keeps /" + group.join("|") + "/", ok, ok ? "" : text]); }));
  (e.forbid || []).forEach(f => { const hit = all.find(([, t]) => rx(f).test(t)); res.push(["never says /" + f + "/", !hit, hit ? hit[0] + ": " + hit[1] : ""]); });
  (e.mention || []).forEach(m => { const hit = all.find(([, t]) => rx(m).test(t)); res.push(["mentions /" + m + "/", !!hit, hit ? "" : "not found in any field"]); });
  (e.types || []).forEach(t => { const ok = (a.claims || []).some(x => x.type === t); res.push(["has a claim of type " + t, ok, ok ? "" : "types: " + (a.claims || []).map(x => x.type).join(", ")]); });
  return res;
}

(async () => {
  const ai = createAI(process.env);
  if (!ai) { console.error("No model key is configured (ANTHROPIC_API_KEY in .env). Nothing was run, and no mock was used in its place.\nAdd the key (the app asks for it once, or put it in .env), then run  npm run eval  again."); process.exit(2); }
  if (ai.mock && !opt("allow-mock")) { console.error("DEFLATE_MOCK_AI is on: the readings would be placeholders. Nothing was run. Use --allow-mock only to test this script's wiring."); process.exit(2); }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-"), outDir = path.join(ROOT, "data", "eval", stamp);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-eval-"));
  const store = new Store(work); await store.init();
  const reader = createReader({ store, getAI: () => ai, searchClaim: null, research: null });
  const results = [];
  console.log("Model: " + (ai.mock ? "MOCK" : ai.model) + " · contract " + P.CONTRACT + " · context " + shared.CONTEXT_VERSION + " · " + cases.length + " cases × " + repeat);
  for (const c of cases) for (let n = 1; n <= repeat; n++) {
    const text = sourceText(c), t0 = Date.now();
    process.stdout.write(c.id + (repeat > 1 ? " #" + n : "") + " … ");
    const record = { id: c.id, run: n, kind: c.kind || "passage", tests: c.tests, expect: c.expect, provenance: c.provenance || null, sourceSha256: sha(text), sourceChars: text.length };
    try {
      const id = await store.createRun(c.kind === "claim" ? { kind: "claim", title: c.id } : { title: c.id }, text);
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
      record.passages = b.passages.map(p => ({ id: p.id, title: p.title, turns: [p.turnStart, p.turnEnd], gate: p.readingGate.status, reasons: p.readingGate.reasons, context: p.provenance && p.provenance.context || null, review: p.provenance && p.provenance.review ? { approved: p.provenance.review.approved, attempts: p.provenance.review.attempts, issues: p.provenance.review.issues } : null, quoteCheck: p.quoteCheck || null, analysis: p.analysis || null,
        checks: p.analysis && p.readingGate.status === "ready" ? mechanical(c, p.analysis) : [["reading ready", false, (p.readingGate.reasons || []).join("; ")]] }));
      record.overview = b.summary ? { gate: b.summary.readingGate.status, patterns: b.summary.patterns, survived: b.summary.survived } : null;
      if (opt("old") && c.kind !== "claim") {
        const turns = shared.parseTranscript(b.transcript), ov = b.run.provenance.overrides;
        record.old = [];
        for (const p of b.passages) { const t1 = Date.now(); try { const out = await ai.sample({ prompt: P.deflateV1(b.run, p, shared.fmtTurns(turns, ov, p.turnStart, p.turnEnd)), json: true }); const a = shared.sanitizeAnalysis(out.data); record.old.push({ passage: p.id, model: out.model, usage: out.usage, latencyMs: Date.now() - t1, analysis: a, checks: mechanical(c, a) }); } catch (e) { record.old.push({ passage: p.id, error: e.code || e.message, stopReason: e.meta && e.meta.stopReason || "" }); } }
      }
      const failed = record.passages.flatMap(p => p.checks.filter(x => !x[1]).map(x => x[0]));
      console.log(record.processing.status + " · " + record.calls + " calls · " + (failed.length ? failed.length + " check(s) to look at" : "mechanical checks pass"));
    } catch (e) { record.error = String(e && e.message || e); console.log("error: " + record.error); }
    results.push(record);
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ model: ai.mock ? "MOCK" : ai.model, contract: P.CONTRACT, contextVersion: shared.CONTEXT_VERSION, at: new Date().toISOString(), repeat, results }, null, 2));
  fs.writeFileSync(path.join(outDir, "scoring-sheet.md"), sheet(results, ai));
  fs.rmSync(work, { recursive: true, force: true });
  const usage = results.reduce((u, r) => ({ input: u.input + (r.usage ? r.usage.input : 0), output: u.output + (r.usage ? r.usage.output : 0) }), { input: 0, output: 0 });
  console.log("\nTokens: " + usage.input + " in, " + usage.output + " out." + (ai.mock ? " MOCK run: this tested the script's wiring only." : ""));
  console.log("Written: " + path.relative(ROOT, outDir) + "/results.json and scoring-sheet.md. Score every case by hand; the mechanical checks only point at places to look.");
})().catch(e => { console.error(e); process.exit(1); });

/* The sheet a person fills in: the expected meaning (written before the run), the outputs at both levels, the
   mechanical pointers, and the six scores per level from the brief. */
function sheet(results, ai) {
  const out = ["# Reading evaluation · " + (ai.mock ? "MOCK (wiring only)" : ai.model) + " · " + P.CONTRACT, "",
    "Score each reading at both levels, 0 (wrong) / 1 (partly) / 2 (right): **meaning**, **qualifiers** (some/all, may/must, if/only if, numbers and denominators), **attribution** (who said it, quoted versus own view), **justified final judgment**, **fair to the source** (no invented premises; concern only where named), **uncertainty scoped correctly**. Write the reason for every score below 2. A sound case that gets a surviving concern, any material meaning change, and any invented quotation must be fixed before the semantic change is called ready. A small set shows performance on that set only.", ""];
  for (const r of results) {
    out.push("## " + r.id + (r.run > 1 ? " (run " + r.run + ")" : ""), "", "*Tests:* " + r.tests, "", "*Expected meaning (written before the run):* " + r.expect.meaning, "");
    if (r.provenance) out.push("*Source:* " + r.provenance.speaker + ", " + r.provenance.event + ", " + r.provenance.date + " — " + r.provenance.source + ". " + r.provenance.note, "");
    if (r.error) { out.push("**Error:** " + r.error, ""); continue; }
    out.push("*Run:* " + r.processing.status + " · model " + r.model + " · " + r.calls + " calls · " + r.usage.input + "/" + r.usage.output + " tokens · " + Math.round(r.latencyMs / 100) / 10 + " s · source sha256 " + r.sourceSha256.slice(0, 12) + "…" + (r.failedCalls.length ? " · failed calls: " + r.failedCalls.map(x => x.purpose + " " + x.error).join(", ") : ""), "");
    for (const p of r.passages) {
      const a = p.analysis;
      out.push("### " + p.title + " (turns " + p.turns.join("–") + ") — " + p.gate + (p.reasons && p.reasons.length ? ": " + p.reasons.join("; ") : ""), "");
      if (a) for (const L of ["hs", "g5"]) {
        out.push("**" + (L === "hs" ? "High school" : "Fifth grade") + "**", "", "- In plain words: " + (a.deflated[L] || "—"));
        if (r.kind !== "claim") out.push("- A fair reading: " + (a.defense[L] || "—"), "- What follows: " + (a.revision[L] || "—"));
        out.push("");
      }
      if (a && r.kind !== "claim") out.push("Concern: " + (a.jump.present ? "raised, " + ({ yes: "stands", partly: "partly stands", no: "withdrawn" }[a.revision.jumpSurvives] || "outcome not stated") + " — " + a.jump.hs + (a.jump.pivot ? " Pivot: “" + a.jump.pivot + "”" : "") : "none — " + (a.jump.hs || "")), "");
      if (a) out.push("Claims: " + a.claims.map(c => "[" + shared.claimTypeLabel(c.type) + "] " + (c.speaker ? c.speaker + ": " : "") + c.text).join(" · "), "");
      out.push("Mechanical pointers: " + (p.checks.map(x => (x[1] ? "✓ " : "✗ ") + x[0] + (x[2] && !x[1] ? " — " + x[2] : "")).join("; ") || "none"), "");
      out.push("| level | meaning | qualifiers | attribution | justified judgment | fair to source | uncertainty | notes |", "|---|---|---|---|---|---|---|---|", "| HS | | | | | | | |", "| 5th | | | | | | | |", "");
    }
    if (r.overview) out.push("Across this reading (" + r.overview.gate + "): " + (r.overview.patterns.length ? r.overview.patterns.map(x => x.title.hs + " [" + x.passages.join(", ") + "]").join("; ") : "no recurring concern") + ". " + (r.overview.survived && r.overview.survived.hs || ""), "");
    if (r.old) out.push("Pre-0.12 prompt, for comparison: " + r.old.map(o => o.error ? o.passage + ": error " + o.error : o.passage + ": " + o.analysis.deflated.hs + " | concern: " + (o.analysis.jump.present ? o.analysis.revision.jumpSurvives : "none") + " | types: " + o.analysis.claims.map(c => c.type).join(", ") + " | pointers failed: " + o.checks.filter(x => !x[1]).map(x => x[0]).join("; ")).join(" · "), "");
  }
  return out.join("\n");
}
