"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../server/research/connectors");
const { createResearch } = require("../server/research");
const { runSmoke } = require("../scripts/research-smoke");

const reply = body => async () => ({ status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) });

test("provider error and malformed HTTP-200 bodies remain failed attempts, not empty searches", async () => {
  const checks = [
    [C.gdelt, { error: "query error" }],
    [C.gdelt, []],
    [C.gdelt, { articles: "invalid" }],
    [C.crossref, { message: {} }],
    [C.pubmed, { esearchresult: { ERROR: "invalid query" } }],
    [C.openalex, { error: "invalid query" }],
  ];
  for (const [factory, body] of checks) {
    const r = await factory({ fetch: reply(body), minIntervalMs: 0, apiKey: "fixture-only" }).search({ query: "two words" });
    assert.ok(r.attempt.error, JSON.stringify(body) + " must not mean no documents exist");
    assert.equal(r.candidates.length, 0);
  }
});

test("documented empty provider responses still mean the search ran and found nothing", async () => {
  const checks = [
    [C.gdelt, {}], [C.gdelt, { articles: [] }],
    [C.crossref, { message: { items: [], "total-results": 0 } }],
    [C.pubmed, { esearchresult: { idlist: [], count: "0" } }],
    [C.openalex, { results: [], meta: { count: 0 } }],
  ];
  for (const [factory, body] of checks) {
    const r = await factory({ fetch: reply(body), minIntervalMs: 0, apiKey: "fixture-only" }).search({ query: "two words" });
    assert.equal(r.attempt.error, null);
    assert.equal(r.attempt.hitCount, 0);
  }
});

test("missing PubMed summaries and invalid Crossref status records cannot imply successful checks", async () => {
  const f = async url => reply(url.includes("esearch") ? { esearchresult: { idlist: ["123"], count: "1" } } : { result: { "123": { error: "not available" } } })();
  const r = await C.pubmed({ fetch: f, minIntervalMs: 0 }).search({ query: "two words" });
  assert.match(r.attempt.error, /incomplete/);
  assert.equal(r.attempt.totalReported, 1);
  const s = await C.crossref({ fetch: reply({ message: {} }), minIntervalMs: 0 }).status("10.1234/example");
  assert.equal(s.checked, false);
  assert.match(s.error, /not checked/);
});

test("partly supported routing records the source types it could not search", async () => {
  const research = createResearch({}, { fetch: reply({}), minIntervalMs: 0 });
  const r = await research.searchClaim({ run: { id: "r" }, passage: { id: "p001", turnStart: 0, turnEnd: 1 }, claim: { id: "c1", text: "Climate news references government data.", type: "claim", searchQuery: "climate news", expectedSources: ["news_coverage", "government_data"] }, idx: 0 });
  assert.equal(r.attempts.find(a => a.adapter === "gdelt").error, null);
  assert.match(r.attempts.find(a => a.adapter === "none").error, /government_data.*not searched/);
});

const quiet = { log() {}, error() {} };
function fixtureResearch(fail) {
  return {
    config: { adapters: ["crossref", "pubmed", "openalex", "gdelt"], openalexKey: false, contact: false, mock: false },
    async searchClaim({ claim }) {
      const names = claim.expectedSources.includes("news_coverage") ? ["gdelt"] : ["crossref", "pubmed", "openalex", "none"];
      return { obligation: { id: "fixture", expected_document_types: claim.expectedSources, routing_hints: { search_query: claim.searchQuery } },
        candidates: [], attempts: names.map(adapter => ({ adapter, hitCount: 0, msElapsed: 1, error: adapter === "none" ? "government_data is unsupported" : fail ? "network unavailable" : adapter === "openalex" ? "no key configured" : null })) };
    },
  };
}

test("research smoke fails for unavailable connectors instead of reporting success", async () => {
  const r = await runSmoke({ research: fixtureResearch(true), statusClient: { status: async () => ({ checked: false, notices: [], error: "network unavailable" }) }, logger: quiet });
  assert.equal(r.ok, false);
  assert.ok(r.failures.some(f => /gdelt/.test(f)));
  assert.ok(r.failures.some(f => /known retracted/.test(f)));
});

test("research smoke requires a retraction notice and tolerates an unconfigured optional OpenAlex key", async () => {
  const research = fixtureResearch(false);
  const missing = await runSmoke({ research, statusClient: { status: async () => ({ checked: true, notices: [{ type: "correction", label: "Correction" }] }) }, logger: quiet });
  assert.equal(missing.ok, false);
  const passed = await runSmoke({ research, statusClient: { status: async () => ({ checked: true, notices: [{ type: "retraction", label: "Retraction" }] }) }, logger: quiet });
  assert.equal(passed.ok, true);
});
