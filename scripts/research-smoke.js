"use strict";
/* Live smoke test for the research connectors. Hits the real Crossref and PubMed APIs (and OpenAlex if a key is set),
   runs two claims from the supplied pilot, and prints what came back. Nothing is written to your data folder.

   Run:   npm run research-smoke
   Env:   RESEARCH_CONTACT_EMAIL (recommended), OPENALEX_API_KEY (optional), NCBI_API_KEY (optional) — read from .env

   What a good result looks like: each adapter reports hitCount and msElapsed (or a specific error), the same paper
   found by two databases appears once with foundBy listing both, and a DOI known to be retracted shows a notice. */
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
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

(async () => {
  const research = createResearch(process.env);
  if (research.config.mock) { console.error("DEFLATE_MOCK_RESEARCH is set; unset it to hit the live services."); process.exit(1); }
  console.log("Adapters:", research.config.adapters.join(", "), "| OpenAlex key:", research.config.openalexKey ? "yes" : "no", "| contact email:", research.config.contact ? "yes" : "no (set RESEARCH_CONTACT_EMAIL)");

  const picks = pick(path.join(__dirname, "..", "examples", "pilot-jre2308"), [
    "social status serotonin humans dominance",
    "greening of the Earth and its drivers leaf area",
  ]);
  for (const x of picks) {
    console.log("\n=== Claim:", x.claim.text, "[" + x.claim.type + "]");
    console.log("    would settle:", x.claim.wouldSettle || "—");
    const r = await research.searchClaim(Object.assign({ limit: 6 }, x));
    console.log("    obligation:", r.obligation.id, "| types:", r.obligation.expected_document_types.join(", "), "| query:", r.obligation.routing_hints.search_query);
    for (const a of r.attempts) console.log("    attempt ", a.adapter.padEnd(9), "hits:", String(a.hitCount).padStart(5), " ms:", String(a.msElapsed).padStart(5), a.error ? " ERROR: " + a.error : "");
    console.log("    candidates after dedupe:", r.candidates.length);
    for (const c of r.candidates) {
      const notice = (c.notices || []).map(n => n.label + (n.date ? " " + n.date : "")).join("; ");
      console.log("      -", (c.publishedAt || "????").slice(0, 4), "|", String(c.title || "").slice(0, 95));
      console.log("        ", c.doi ? "doi:" + c.doi : (c.pmid ? "pmid:" + c.pmid : c.url), "| found by:", (c.foundBy || []).join("+"), "| status:", c.statusCheck && c.statusCheck.checked ? (notice ? "NOTICE: " + notice : "no notice found") : "not checked (" + (c.statusCheck && (c.statusCheck.note || c.statusCheck.error) || "?") + ")");
    }
  }

  console.log("\n=== Publication-status check on a DOI known to be retracted:", KNOWN_RETRACTED_DOI);
  const s = await crossref({ fetch: globalThis.fetch, mailto: process.env.RESEARCH_CONTACT_EMAIL || "" }).status(KNOWN_RETRACTED_DOI);
  console.log("   ", s.checked ? (s.notices.length ? s.notices.map(n => n.label + " (" + n.source + ", " + (n.date || "no date") + ", notice doi " + n.noticeDoi + ")").join("; ") : "no notice found — the check is NOT working if you see this") : "check failed: " + s.error);
  console.log("\nDone. No files were written.");
})().catch(e => { console.error("smoke failed:", e); process.exit(1); });
