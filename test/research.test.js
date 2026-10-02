"use strict";
/* Research layer: query compilation, connector parsing on fixtures (no network), dedupe across databases,
   publication-status notices, obligation shape, and the search → accept/reject flow over HTTP with mock research. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const T = require("../server/research/types");
const C = require("../server/research/connectors");
const { createResearch, dedupe, obligationFor } = require("../server/research/index");
const { buildObligations } = require("../server/exportClaims");
const { createApp } = require("../server/app");
const { createMockAI } = require("../server/ai");

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [match, body, status] of routes) if (url.includes(match)) return { status: status || 200, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
    return { status: 404, text: async () => "{}" };
  };
  fn.calls = calls;
  return fn;
}

test("compileQuery is deterministic and drops speaker prefixes and stopwords; normalizeDoi cleans URLs", () => {
  const q = T.compileQuery("Jordan Peterson: Rising status raises serotonin and changes emotional sensitivity in humans.");
  assert.equal(q, "rising status raises serotonin changes emotional sensitivity humans");
  assert.equal(T.compileQuery("Jordan Peterson: Rising status raises serotonin and changes emotional sensitivity in humans."), q);
  assert.equal(T.normalizeDoi("https://doi.org/10.1016/S0140-6736(97)11096-0"), "10.1016/s0140-6736(97)11096-0");
  assert.equal(T.normalizeDoi("not a doi"), "");
  assert.deepEqual(T.guessSourceTypes("A study found X", "Peer-reviewed trials"), ["academic_paper"]);
  assert.deepEqual(T.guessSourceTypes("Carney's book says", ""), ["book_or_edition"]);
});

test("crossref connector parses a works list and the updated-by notices on a work", async () => {
  const list = { message: { "total-results": 2, items: [
    { DOI: "10.1000/A1", title: ["Serotonin and social rank"], author: [{ given: "A", family: "One" }], issued: { "date-parts": [[2019, 3, 2]] }, "container-title": ["J Test"], type: "journal-article", URL: "https://doi.org/10.1000/A1", "updated-by": [] },
    { DOI: "10.1000/A2", title: ["Second"], issued: { "date-parts": [[2001]] }, "container-title": ["J Two"], type: "journal-article", "updated-by": [{ DOI: "10.1000/A2R", type: "retraction", label: "Retraction", source: "retraction-watch", updated: { "date-parts": [[2010, 2, 6]] } }] },
  ] } };
  const f = fakeFetch([["api.crossref.org/works?query", list], ["api.crossref.org/works/10.1000%2Fa2", { message: { DOI: "10.1000/a2", "updated-by": [{ DOI: "10.1000/A2R", type: "retraction", label: "Retraction", source: "retraction-watch", updated: { "date-parts": [[2010, 2, 6]] } }] } }]]);
  const cr = C.crossref({ fetch: f, mailto: "t@example.org", minIntervalMs: 0 });
  const r = await cr.search({ query: "serotonin", limit: 5, types: ["academic_paper"] });
  assert.equal(r.attempt.adapter, "crossref"); assert.equal(r.attempt.hitCount, 2); assert.equal(r.attempt.totalReported, 2); assert.equal(r.attempt.error, null);
  assert.ok(f.calls[0].includes("filter=type:journal-article,type:proceedings-article,type:posted-content"), "type filter sent: " + f.calls[0]);
  assert.ok(f.calls[0].includes("query.title=serotonin") && f.calls[1].includes("query.bibliographic=serotonin"), "title then bibliographic query: " + f.calls.join(" | "));
  assert.equal(r.attempts.length, 2); assert.deepEqual(r.attempts.map(a => a.field), ["title", "bibliographic"]);
  assert.equal(r.candidates.length, 4, "both queries' items are returned; dedupe happens in the orchestrator");
  assert.ok(r.candidates.every(c => c.noticesFromSearch), "search records carry updated-by, so no second status call is needed");
  assert.equal(r.candidates[0].doi, "10.1000/a1"); assert.equal(r.candidates[0].publishedAt, "2019-03-02"); assert.deepEqual(r.candidates[0].authors, ["A One"]);
  assert.equal(r.candidates[1].notices[0].type, "retraction"); assert.equal(r.candidates[1].notices[0].source, "retraction-watch"); assert.equal(r.candidates[1].notices[0].date, "2010-02-06");
  const st = await cr.status("10.1000/A2");
  assert.equal(st.checked, true); assert.equal(st.notices.length, 1);
  assert.ok(f.calls[0].includes("mailto=t%40example.org"), "polite pool parameter sent");
  assert.ok(!f.calls[2].includes("select="), "single-work route rejects select (HTTP 400 live), so it must not be sent: " + f.calls[2]);
  assert.ok(f.calls[2].endsWith("?mailto=t%40example.org"), "status URL: " + f.calls[2]);
  const f404 = fakeFetch([["api.crossref.org/works/", "{}", 404]]);
  const st2 = await C.crossref({ fetch: f404, minIntervalMs: 0 }).status("10.9999/none");
  assert.equal(st2.checked, true); assert.equal(st2.notices.length, 0); assert.match(st2.note, /not in Crossref/);
});

test("pubmed connector chains esearch → esummary and reads DOI/PMC ids; errors become attempts, not throws", async () => {
  const es = { esearchresult: { count: "686", idlist: ["111", "222"] } };
  const su = { result: { "111": { uid: "111", title: "Paper A", pubdate: "2020 Jun 3", source: "Brain", fulljournalname: "Brain", authors: [{ name: "Smith J" }], pubtype: ["Journal Article"], articleids: [{ idtype: "pubmed", value: "111" }, { idtype: "doi", value: "10.1093/brain/x" }, { idtype: "pmc", value: "PMC123" }] }, "222": { uid: "222", title: "Paper B", pubdate: "1999", source: "J B", articleids: [] } } };
  const f = fakeFetch([["esearch.fcgi", es], ["esummary.fcgi", su]]);
  const r = await C.pubmed({ fetch: f, apiKey: "k", email: "e@x.org", minIntervalMs: 0 }).search({ query: "serotonin", limit: 2 });
  assert.equal(r.attempt.hitCount, 2); assert.equal(r.attempt.totalReported, 686); assert.equal(r.candidates.length, 2);
  assert.equal(r.candidates[0].doi, "10.1093/brain/x"); assert.equal(r.candidates[0].pmc, "PMC123"); assert.equal(r.candidates[0].publishedAt, "2020-06-03"); assert.match(r.candidates[0].fullTextUrl, /PMC123/);
  assert.equal(r.candidates[1].publishedAt, "1999");
  assert.ok(f.calls[0].includes("api_key=k") && f.calls[0].includes("tool=deflate-lens"));
  const bad = await C.pubmed({ fetch: fakeFetch([["esearch.fcgi", "{}", 500]]), minIntervalMs: 0 }).search({ query: "x" });
  assert.equal(bad.candidates.length, 0); assert.match(bad.attempt.error, /HTTP 500/);
});

test("openalex connector refuses without a key and records that as an attempt; parses results with a key", async () => {
  const nokey = await C.openalex({ fetch: fakeFetch([]), minIntervalMs: 0 }).search({ query: "x" });
  assert.equal(nokey.candidates.length, 0); assert.match(nokey.attempt.error, /OPENALEX_API_KEY/);
  const body = { meta: { count: 1 }, results: [{ id: "https://openalex.org/W1", doi: "https://doi.org/10.1000/A1", title: "Serotonin and social rank", publication_date: "2019-03-02", primary_location: { source: { display_name: "J Test" } }, authorships: [{ author: { display_name: "A One" } }], type: "article", is_retracted: true, open_access: { oa_url: "https://x/oa.pdf" } }] };
  const fo = fakeFetch([["api.openalex.org/works", body]]);
  const r = await C.openalex({ fetch: fo, apiKey: "K", minIntervalMs: 0 }).search({ query: "serotonin", types: ["academic_paper"] });
  assert.ok(fo.calls[0].includes("filter=type:article|preprint|review"), "openalex type filter: " + fo.calls[0]);
  assert.equal(r.candidates[0].doi, "10.1000/a1"); assert.equal(r.candidates[0].notices[0].type, "retraction"); assert.equal(r.candidates[0].fullTextUrl, "https://x/oa.pdf");
});

test("titleFlag marks withdrawn/retracted titles; interleave alternates databases", () => {
  assert.equal(C.titleFlag("WITHDRAWN: Antarctic Greening and Its Drivers")[0].type, "withdrawal");
  assert.equal(C.titleFlag("RETRACTED: Vaccines and autism")[0].type, "retraction");
  assert.equal(C.titleFlag("Expression of Concern: something")[0].type, "expression-of-concern");
  assert.deepEqual(C.titleFlag("Greening of the Earth and its drivers"), []);
  const { interleave } = require("../server/research/index");
  const out = interleave([{ foundBy: ["crossref"], t: 1 }, { foundBy: ["crossref"], t: 2 }, { foundBy: ["crossref"], t: 3 }, { foundBy: ["pubmed"], t: 4 }, { foundBy: ["pubmed"], t: 5 }]);
  assert.deepEqual(out.map(x => x.t), [1, 4, 2, 5, 3]);
});

test("dedupe folds the same DOI from several databases into one candidate and keeps every finder", () => {
  const out = dedupe([
    { adapter: "crossref", doi: "10.1000/a1", title: "T", journal: "", notices: [] },
    { adapter: "pubmed", doi: "10.1000/a1", title: "T", pmid: "111", journal: "Brain", notices: [] },
    { adapter: "openalex", doi: "10.1000/a1", title: "T", notices: [{ type: "retraction", noticeDoi: "" }] },
    { adapter: "pubmed", doi: "", pmid: "999", title: "No DOI paper", notices: [] },
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].foundBy, ["crossref", "pubmed", "openalex"]); assert.equal(out[0].pmid, "111"); assert.equal(out[0].journal, "Brain"); assert.equal(out[0].notices.length, 1);
});

test("obligationFor produces the Receipts EvidenceObligation shape and prefers model routing over the heuristic", () => {
  const run = { id: "r1" }, passage = { id: "p003", turnStart: 84, turnEnd: 87 };
  const o = obligationFor(run, passage, { text: "Mammalian play is suppressed by fear.", type: "fact", speaker: "JP", wouldSettle: "Panksepp's play-circuit studies.", expectedSources: ["academic_paper"], searchQuery: "play fear mammals" }, 0);
  assert.deepEqual(Object.keys(o), ["id", "subject", "question", "expected_document_types", "priority", "routing_hints"]);
  assert.equal(o.id, "obl_r1_p003_c1"); assert.deepEqual(o.expected_document_types, ["academic_paper"]); assert.equal(o.priority, "primary");
  assert.equal(o.routing_hints.search_query, "play fear mammals"); assert.equal(o.routing_hints.types_by, "model");
  const o2 = obligationFor(run, passage, { text: "A study found serotonin rises with status.", type: "contested", wouldSettle: "" }, 1);
  assert.equal(o2.routing_hints.types_by, "heuristic"); assert.deepEqual(o2.expected_document_types, ["academic_paper"]); assert.ok(o2.routing_hints.search_query.length > 0);
});

test("orchestrator runs the adapters for the expected types, dedupes, checks status only where needed, and records a no-adapter case", async () => {
  const list = { message: { "total-results": 1, items: [{ DOI: "10.1000/A1", title: ["Paper"], issued: { "date-parts": [[2020]] }, "container-title": ["J"], type: "journal-article", "updated-by": [] }] } };
  const es = { esearchresult: { count: "2", idlist: ["111", "222"] } };
  const su = { result: { "111": { uid: "111", title: "Paper", pubdate: "2020", source: "J", articleids: [{ idtype: "doi", value: "10.1000/A1" }] }, "222": { uid: "222", title: "Only in PubMed", pubdate: "2018", source: "J2", articleids: [{ idtype: "doi", value: "10.1000/B2" }] } } };
  const f = fakeFetch([["api.crossref.org/works?query", list], ["api.crossref.org/works/10.1000%2Fb2", { message: { "updated-by": [{ DOI: "10.1000/B2R", type: "correction", label: "Correction", source: "publisher", updated: { "date-parts": [[2021, 1, 1]] } }] } }], ["esearch.fcgi", es], ["esummary.fcgi", su]]);
  const R = createResearch({}, { fetch: f, minIntervalMs: 0 });
  const out = await R.searchClaim({ run: { id: "r" }, passage: { id: "p001", turnStart: 0, turnEnd: 1 }, claim: { text: "x", type: "fact", expectedSources: ["academic_paper"], searchQuery: "paper" }, idx: 0 });
  assert.deepEqual(out.attempts.map(a => a.adapter).sort(), ["crossref", "crossref", "openalex", "pubmed"]);
  assert.equal(out.candidates.length, 2);
  const a1 = out.candidates.find(c => c.doi === "10.1000/a1"), b2 = out.candidates.find(c => c.doi === "10.1000/b2");
  assert.deepEqual(a1.foundBy, ["crossref", "pubmed"]); assert.deepEqual(a1.matchedBy, ["title", "bibliographic"]); assert.equal(a1.statusCheck.checked, true); assert.match(a1.statusCheck.note, /Crossref search record/); assert.equal(a1.notices.length, 0); assert.equal(a1.noticesFromSearch, undefined);
  assert.deepEqual(b2.foundBy, ["pubmed"]); assert.equal(b2.statusCheck.checked, true); assert.equal(b2.notices[0].type, "correction");
  assert.equal(f.calls.filter(u => /api\.crossref\.org\/works\/10/.test(u)).length, 1, "exactly one status call, for the PubMed-only DOI: " + f.calls.join(" | "));
  out.candidates.forEach(c => { assert.equal(c.status, "candidate"); assert.ok(c.id); });
  const none = await R.searchClaim({ run: { id: "r" }, passage: { id: "p001", turnStart: 0, turnEnd: 1 }, claim: { text: "x", type: "fact", expectedSources: ["government_data"] }, idx: 1 });
  assert.equal(none.candidates.length, 0); assert.match(none.attempts[0].error, /no adapter in this build serves government_data/);
});

test("a 429 is retried once after Retry-After and then recorded as an error, never thrown", async () => {
  let n = 0;
  const f = async () => { n++; return { status: 429, headers: { get: () => "0" }, text: async () => "{}" }; };
  const r = await C.crossref({ fetch: f, minIntervalMs: 0 }).search({ query: "x" });
  assert.equal(n, 4, "two queries, each retried once"); assert.match(r.attempt.error, /HTTP 429/); assert.match(r.attempt.error, /rate limited twice/); assert.equal(r.candidates.length, 0);
  const lim = C.makeLimiter(30); const t0 = Date.now(); await Promise.all([lim(async () => 1), lim(async () => 2), lim(async () => 3)]);
  assert.ok(Date.now() - t0 >= 55, "three paced calls at 30 ms spacing take at least 60 ms");
});

test("HTTP: obligations export, search with mock research, accept → receipt, reject → rejection, all persisted", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deflate-research-"));
  const { app, ready, store } = createApp({ dataDir, ai: createMockAI(), research: createResearch({ DEFLATE_MOCK_RESEARCH: "1" }) });
  await ready;
  const server = await new Promise(res => { const s = app.listen(0, "127.0.0.1", () => res(s)); });
  const base = "http://127.0.0.1:" + server.address().port;
  const api = async (m, p, body) => { const r = await fetch(base + p, { method: m, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };
  try {
    const ob = await api("GET", "/api/runs/pilot-jre2308/obligations.json");
    assert.equal(ob.status, 200); assert.equal(ob.data.schema, "deflate-lens/obligations@0.2");
    assert.ok(ob.data.obligations.length >= 30, "pilot yields obligations for its empirical claims: " + ob.data.obligations.length);
    for (const o of ob.data.obligations) { assert.ok(o.id && o.subject && o.question && Array.isArray(o.expected_document_types) && o.priority && o.routing_hints, "obligation shape"); }
    assert.ok(ob.data.obligations.some(o => o.routing_hints.types_by === "model") && ob.data.obligations.some(o => o.routing_hints.types_by === "heuristic"));
    const exb = (await api("GET", "/api/runs/pilot-jre2308")).data; const exCid = exb.passages.find(p => p.id === "p005").analysis.claims[0].id;
    assert.equal((await api("POST", "/api/runs/pilot-jre2308/passages/p005/claims/" + exCid + "/search", {})).status, 403, "example is read-only");

    const dup = (await api("POST", "/api/runs/pilot-jre2308/duplicate")).data; const id = dup.run.id;
    const cid = dup.passages.find(p => p.id === "p005").analysis.claims[0].id; assert.ok(cid, "claims have ids");
    const CL = "/api/runs/" + id + "/passages/p005/claims/" + cid;
    const sr = await api("POST", CL + "/search", {});
    assert.equal(sr.status, 200); assert.equal(sr.data.attempts.length, 3); assert.equal(sr.data.candidates.length, 2);
    let c = sr.data.bundle.passages.find(p => p.id === "p005").analysis.claims[0];
    assert.equal(c.status, "searched"); assert.equal(c.searches.length, 3); assert.ok(c.obligation.id.startsWith("obl_" + id.replace(/[^A-Za-z0-9]/g, "") + "_p005_"), "obligation id names the run and passage: " + c.obligation.id);
    const retracted = c.candidates.find(x => x.notices.length), clean = c.candidates.find(x => !x.notices.length);
    let b = (await api("POST", CL + "/candidates/" + retracted.id + "/reject", { reason: "retracted_or_corrected", detail: "retraction notice on record" })).data;
    c = b.passages.find(p => p.id === "p005").analysis.claims[0];
    assert.equal(c.rejections.length, 1); assert.equal(c.rejections[0].reason, "retracted_or_corrected"); assert.equal(c.candidates.find(x => x.id === retracted.id).status, "rejected"); assert.equal(c.status, "searched");
    b = (await api("POST", CL + "/candidates/" + clean.id + "/accept", { note: "supports the human part" })).data;
    c = b.passages.find(p => p.id === "p005").analysis.claims[0];
    assert.equal(c.status, "receipt"); assert.equal(c.receipts.length, 1); assert.equal(c.receipts[0].kind, "document"); assert.equal(c.receipts[0].doi, "10.0000/mock.1"); assert.deepEqual(c.receipts[0].foundBy, ["crossref", "pubmed"]); assert.equal(c.receipts[0].note, "supports the human part");
    // searching again keeps decided candidates and adds nothing already decided
    const sr2 = await api("POST", CL + "/search", {});
    c = sr2.data.bundle.passages.find(p => p.id === "p005").analysis.claims[0];
    assert.equal(c.searches.length, 6); assert.equal(c.candidates.filter(x => x.status === "candidate").length, 0, "both decided candidates were not re-added"); assert.equal(c.status, "receipt");
    // export reflects it
    const ex = (await api("GET", "/api/runs/" + id + "/export.json")).data;
    const row = ex.claims.find(x => x.passageId === "p005" && x.id.endsWith("-c1"));
    assert.equal(row.status, "receipt"); assert.equal(row.searches.length, 6); assert.equal(row.rejections.length, 1); assert.equal(row.receipts[0].doi, "10.0000/mock.1");
    // persisted on disk
    const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, "runs", id, "passages", "p005.json"), "utf8"));
    assert.equal(onDisk.analysis.claims[0].receipts.length, 1);
    assert.equal(typeof store.bundle, "function");
  } finally { await new Promise(r => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); }
});
