"use strict";
/* Research orchestrator. Turns one claim into an obligation, runs the adapters that serve its source types in
   parallel, dedupes the same paper found in several databases into one candidate, checks each DOI's publication
   status at Crossref, and returns {obligation, attempts, candidates}. It never raises: a failed adapter is an attempt
   with an error. It never accepts anything: candidates wait for a person.
   DEFLATE_MOCK_RESEARCH=1 returns canned results so the workflow and tests run with no network. */
const { crossref, pubmed, openalex } = require("./connectors");
const T = require("./types");

function obligationFor(run, passage, claim, idx) {
  const expected = (Array.isArray(claim.expectedSources) && claim.expectedSources.length ? claim.expectedSources : null) || T.guessSourceTypes(claim.text, claim.wouldSettle);
  const query = (claim.searchQuery && String(claim.searchQuery).trim()) || T.compileQuery(claim.text, claim.wouldSettle);
  return {
    id: "obl_" + String(run.id || "run").replace(/[^A-Za-z0-9]/g, "") + "_" + passage.id + "_" + (claim.id ? String(claim.id).replace(/[^A-Za-z0-9]/g, "") : "c" + (idx + 1)),
    subject: claim.text,
    question: claim.wouldSettle && /\?$/.test(claim.wouldSettle.trim()) ? claim.wouldSettle.trim() : "Is it true that " + claim.text.replace(/\.$/, "") + "? " + (claim.wouldSettle || ""),
    expected_document_types: expected.filter(t => T.SOURCE_TYPES.includes(t)),
    priority: ["fact", "contested", "unsupported", "claim"].includes(claim.type) ? "primary" : "context",
    routing_hints: { speaker: claim.speaker || "", turns: passage.turnStart + "-" + passage.turnEnd, run: run.id || "", search_query: query, types_by: Array.isArray(claim.expectedSources) && claim.expectedSources.length ? "model" : "heuristic" },
  };
}

function dedupe(candidates) {
  const byKey = new Map();
  for (const c of candidates) {
    const key = c.doi ? "doi:" + c.doi : (c.pmid ? "pmid:" + c.pmid : "title:" + String(c.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80));
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, Object.assign({}, c, { foundBy: [c.adapter] })); continue; }
    if (!prev.foundBy.includes(c.adapter)) prev.foundBy.push(c.adapter);
    if (c.noticesFromSearch) prev.noticesFromSearch = true;
    if (c.matchedBy) prev.matchedBy = Array.from(new Set((prev.matchedBy || []).concat(c.matchedBy)));
    for (const k of ["pmid", "pmc", "openalexId", "fullTextUrl", "journal", "publishedAt", "docType", "publisher"]) if (!prev[k] && c[k]) prev[k] = c[k];
    if ((!prev.authors || !prev.authors.length) && c.authors && c.authors.length) prev.authors = c.authors;
    prev.notices = (prev.notices || []).concat((c.notices || []).filter(n => !(prev.notices || []).some(p => p.type === n.type && p.noticeDoi === n.noticeDoi)));
  }
  return Array.from(byKey.values());
}

/* Round-robin by first finder so one database's results cannot crowd the others out of the cap. */
function interleave(cands) {
  const groups = new Map();
  for (const c of cands) { const k = (c.foundBy && c.foundBy[0]) || c.adapter || "?"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
  const lists = Array.from(groups.values()), out = [];
  for (let i = 0; lists.some(l => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

function createResearch(env, deps) {
  const fetchFn = (deps && deps.fetch) || globalThis.fetch;
  const mock = env.DEFLATE_MOCK_RESEARCH === "1" || env.DEFLATE_MOCK_RESEARCH === "true";
  const mailto = env.RESEARCH_CONTACT_EMAIL || "";
  const pace = deps && deps.minIntervalMs != null ? deps.minIntervalMs : undefined; // tests pass 0
  const adapters = mock ? {} : {
    crossref: crossref({ fetch: fetchFn, mailto, minIntervalMs: pace }),
    pubmed: pubmed({ fetch: fetchFn, apiKey: env.NCBI_API_KEY || "", email: mailto, minIntervalMs: pace }),
    openalex: openalex({ fetch: fetchFn, apiKey: env.OPENALEX_API_KEY || "", mailto, minIntervalMs: pace }),
  };
  const config = { enabled: true, mock, adapters: mock ? ["mock"] : Object.keys(adapters), openalexKey: !!env.OPENALEX_API_KEY, ncbiKey: !!env.NCBI_API_KEY, contact: !!mailto };

  async function searchClaim({ run, passage, claim, idx, limit }) {
    const obligation = obligationFor(run, passage, claim, idx);
    const query = obligation.routing_hints.search_query;
    const startedAt = new Date().toISOString();
    if (mock) return mockResult(obligation, query, startedAt);
    const wanted = new Set();
    obligation.expected_document_types.forEach(t => (T.ADAPTERS_FOR_TYPE[t] || []).forEach(a => wanted.add(a)));
    const attempts = [], found = [];
    if (!wanted.size) {
      attempts.push({ adapter: "none", query, hitCount: 0, topTitles: [], msElapsed: 0, at: startedAt, error: "no adapter in this build serves " + obligation.expected_document_types.join(", ") + "; nothing was searched" });
      return { obligation, attempts, candidates: [], startedAt, finishedAt: new Date().toISOString() };
    }
    const types = obligation.expected_document_types;
    const runs = Array.from(wanted).map(name => adapters[name].search({ query, limit: limit || 8, types }).then(r => r, e => ({ candidates: [], attempt: { adapter: name, query, hitCount: 0, totalReported: null, topTitles: [], msElapsed: 0, at: startedAt, error: e && e.message || String(e) } })));
    for (const r of await Promise.all(runs)) { attempts.push(...(r.attempts || [r.attempt])); found.push(...r.candidates); }
    const candidates = interleave(dedupe(found)).slice(0, 15);
    // publication-status check per DOI (Crossref is the record of retractions; absence is "no notice found").
    // A work Crossref itself returned already carries its `updated-by` notices, so only the others need the extra call.
    for (const c of candidates) {
      if (!c.doi) { c.statusCheck = { checked: false, note: "no DOI to check" }; continue; }
      if (c.noticesFromSearch) { c.statusCheck = { checked: true, error: null, note: "from the Crossref search record", at: new Date().toISOString() }; delete c.noticesFromSearch; continue; }
      const s = await adapters.crossref.status(c.doi);
      c.statusCheck = { checked: s.checked, error: s.error || null, note: s.note || "", at: new Date().toISOString() };
      if (s.notices && s.notices.length) c.notices = (c.notices || []).concat(s.notices.filter(n => !(c.notices || []).some(p => p.noticeDoi && p.noticeDoi === n.noticeDoi)));
    }
    candidates.forEach(c => { c.retrievedAt = new Date().toISOString(); c.status = "candidate"; c.id = "cand_" + Math.random().toString(36).slice(2, 10); });
    return { obligation, attempts, candidates, startedAt, finishedAt: new Date().toISOString() };
  }

  function mockResult(obligation, query, startedAt) {
    const now = new Date().toISOString();
    return { obligation, startedAt, finishedAt: now,
      attempts: [
        { adapter: "crossref", query, hitCount: 2, totalReported: 2, topTitles: ["MOCK paper one", "MOCK retracted paper"], msElapsed: 12, at: startedAt, error: null },
        { adapter: "pubmed", query, hitCount: 1, totalReported: 1, topTitles: ["MOCK paper one"], msElapsed: 9, at: startedAt, error: null },
        { adapter: "openalex", query, hitCount: 0, totalReported: null, topTitles: [], msElapsed: 1, at: startedAt, error: "MOCK: no OPENALEX_API_KEY configured" },
      ],
      candidates: [
        { id: "cand_mock1", adapter: "crossref", foundBy: ["crossref", "pubmed"], doi: "10.0000/mock.1", pmid: "00000001", title: "MOCK paper one: " + query, journal: "Journal of Mock Studies", authors: ["A. Mock"], publishedAt: "2021-05-01", docType: "journal-article", url: "https://doi.org/10.0000/mock.1", notices: [], statusCheck: { checked: true, error: null, note: "", at: now }, retrievedAt: now, status: "candidate" },
        { id: "cand_mock2", adapter: "crossref", foundBy: ["crossref"], doi: "10.0000/mock.2", title: "MOCK retracted paper", journal: "Journal of Mock Studies", authors: ["B. Mock"], publishedAt: "2015-01-01", docType: "journal-article", url: "https://doi.org/10.0000/mock.2", notices: [{ type: "retraction", label: "Retraction", source: "retraction-watch", noticeDoi: "10.0000/mock.2r", date: "2016-02-01" }], statusCheck: { checked: true, error: null, note: "", at: now }, retrievedAt: now, status: "candidate" },
      ] };
  }

  return { config, searchClaim, obligationFor, dedupe };
}

module.exports = { createResearch, obligationFor, dedupe, interleave };
