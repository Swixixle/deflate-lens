"use strict";
/* Live smoke test for the research connectors. Hits the real Crossref and PubMed APIs (and OpenAlex if a key is set),
   runs two claims from the supplied pilot, then one news query against GDELT, and prints what came back. Nothing is
   written to your data folder.

   Run:   npm run research-smoke
   Env:   RESEARCH_CONTACT_EMAIL (recommended), OPENALEX_API_KEY (optional), NCBI_API_KEY (optional) — read from .env

   What a good result looks like: each adapter reports hitCount and msElapsed (or a specific error), the same paper
   found by two databases appears once with foundBy listing both, and a DOI known to be retracted shows a notice. */
const path = require("path");
const fs = require("fs");
const { createResearch } = require("../server/research/index");
const { crossref } = require("../server/research/connectors");

const KNOWN_RETRACTED_DOI = "10.1016/s0140-6736(97)11096-0"; // Lancet 1998, retracted 2010; used only to prove the status check works

function pick(bundleDir, wanted) {
  const run = JSON.parse(fs.readFileSync(path.join(bundleDir, "run.json"), "utf8"));
  const out = [];
  for (const f of fs.readdirSync(path.join(bundleDir, "passages")).sort()) {
    const p = JSON.parse(fs.readFileSync(path.join(bundleDir, "passages", f), "utf8")); p.id = f.replace(/\.json$/, "");
    (p.analysis && p.analysis.claims || []).forEach((c, i) => { if (wanted.includes(c.searchQuery)) out.push({ run, passage: p, claim: c, idx: i }); });
  }
  return out;
}

async function runSmoke({ research = createResearch(process.env), statusClient, logger = console, bundleDir = path.join(__dirname, "..", "examples", "pilot-jre2308") } = {}) {
  const console = logger;
  const failures = [];
  if (research.config.mock) { console.error("DEFLATE_MOCK_RESEARCH is set; unset it to hit the live services."); return { ok: false, failures: ["mock research is enabled"] }; }
  console.log("Adapters:", research.config.adapters.join(", "), "| OpenAlex key:", research.config.openalexKey ? "yes" : "no", "| contact email:", research.config.contact ? "yes" : "no (set RESEARCH_CONTACT_EMAIL)");

  const picks = pick(bundleDir, [
    "social status serotonin humans dominance",
    "greening of the Earth and its drivers leaf area",
  ]);
  if (picks.length !== 2) failures.push("the two expected example claims were not found");
  function checkAttempts(result, label) {
    for (const a of result.attempts) {
      // OpenAlex is optional; an absent key must not fail an otherwise healthy keyless install.
      if (a.adapter === "openalex" && !research.config.openalexKey) continue;
      // The pilot also requests government data, for which this release has no connector. Keep that coverage
      // gap visible in the attempts below; this smoke command checks the connectors that are actually installed.
      if (a.adapter === "none") continue;
      if (a.error) failures.push(label + ": " + a.adapter + (a.field ? "/" + a.field : "") + " — " + a.error);
    }
  }
  for (const x of picks) {
    console.log("\n=== Claim:", x.claim.text, "[" + x.claim.type + "]");
    console.log("    would settle:", x.claim.wouldSettle || "—");
    const r = await research.searchClaim(Object.assign({ limit: 6 }, x));
    checkAttempts(r, "Academic search");
    console.log("    obligation:", r.obligation.id, "| types:", r.obligation.expected_document_types.join(", "), "| query:", r.obligation.routing_hints.search_query);
    for (const a of r.attempts) console.log("    attempt ", a.adapter.padEnd(9), "hits:", String(a.hitCount).padStart(5), " ms:", String(a.msElapsed).padStart(5), a.error ? " ERROR: " + a.error : "");
    console.log("    candidates after dedupe:", r.candidates.length);
    for (const c of r.candidates) {
      const notice = (c.notices || []).map(n => n.label + (n.date ? " " + n.date : "")).join("; ");
      console.log("      -", (c.publishedAt || "????").slice(0, 4), "|", String(c.title || "").slice(0, 95));
      console.log("        ", c.doi ? "doi:" + c.doi : (c.pmid ? "pmid:" + c.pmid : c.url), "| found by:", (c.foundBy || []).join("+"), "| status:", c.statusCheck && c.statusCheck.checked ? (notice ? "NOTICE: " + notice : "no notice found") : "not checked (" + (c.statusCheck && (c.statusCheck.note || c.statusCheck.error) || "?") + ")");
    }
  }

  console.log("\n=== News coverage (GDELT, no key): the greening claim routed to news_coverage");
  const g = picks.find(x => /greening/.test(x.claim.searchQuery));
  if (g) {
    const claim = Object.assign({}, g.claim, { expectedSources: ["news_coverage"], searchQuery: "greening of the Earth satellite leaf area" });
    const r = await research.searchClaim({ run: g.run, passage: g.passage, claim, idx: g.idx, limit: 6 });
    checkAttempts(r, "News search");
    for (const a of r.attempts) console.log("    attempt ", a.adapter.padEnd(9), "hits:", String(a.hitCount).padStart(5), " ms:", String(a.msElapsed).padStart(5), a.coverage ? " (" + a.coverage + ")" : "", a.error ? " ERROR: " + a.error : "");
    for (const c of r.candidates) console.log("      -", (c.publishedAt || "????").slice(0, 10), "|", (c.outlet || "?").padEnd(28), "|", String(c.title || "").slice(0, 80), "|", c.language || "");
    if (r.attempts.some(a => /rate limit/.test(a.error || ""))) console.log("    (GDELT allows one request every 5 seconds per address; run again in a moment)");
  }

  console.log("\n=== Publication-status check on a DOI known to be retracted:", KNOWN_RETRACTED_DOI);
  const s = await (statusClient || crossref({ fetch: globalThis.fetch, mailto: process.env.RESEARCH_CONTACT_EMAIL || "" })).status(KNOWN_RETRACTED_DOI);
  console.log("   ", s.checked ? (s.notices.length ? s.notices.map(n => n.label + " (" + n.source + ", " + (n.date || "no date") + ", notice doi " + n.noticeDoi + ")").join("; ") : "no notice found — the check is NOT working if you see this") : "check failed: " + s.error);
  if (!s.checked || !s.notices.some(n => /retract/i.test(n.type || n.label || ""))) failures.push("the known retracted DOI did not return a retraction notice" + (s.error ? ": " + s.error : ""));
  if (failures.length) {
    console.error("\nResearch smoke FAILED:");
    failures.forEach(f => console.error("  - " + f));
  } else console.log("\nResearch smoke passed for installed connectors. Unkeyed OpenAlex is optional; unsupported source types remain listed above and results still need a person's review.");
  console.log("No files were written.");
  return { ok: !failures.length, failures };
}

if (require.main === module) {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  runSmoke().then(r => { process.exitCode = r.ok ? 0 : 1; }).catch(e => { console.error("smoke failed:", e); process.exitCode = 1; });
}

module.exports = { runSmoke };
