"use strict";
/* Three academic connectors with one contract: search({query, limit, types}) -> {candidates, attempt}.
   A candidate is one document with identifiers; an attempt records exactly what was asked and what came back,
   keeping "ran and found nothing" apart from "errored". Each connector takes `fetch` by injection so tests run on fixtures.
   Crossref also answers status(doi) -> retraction/correction notices from the work's `updated-by` field.

   Rate limits (measured 2026-10-02 from this build): Crossref's polite pool answered with x-rate-limit-limit: 3 per 1s and
   returned 429 when a burst exceeded it; NCBI allows 3 requests/s without an API key and 10/s with one; OpenAlex 10/s.
   Every connector therefore paces its own requests and retries a 429 once after the Retry-After interval. */
const { normalizeDoi } = require("./types");

const UA = "deflate-lens/0.7 (local research tool; contact via RESEARCH_CONTACT_EMAIL)";
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Spaces calls at least `minIntervalMs` apart, in order. One limiter per service. */
function makeLimiter(minIntervalMs) {
  let last = 0, chain = Promise.resolve();
  return fn => {
    const p = chain.then(async () => { const wait = last + minIntervalMs - Date.now(); if (wait > 0) await sleep(wait); last = Date.now(); return fn(); });
    chain = p.catch(() => {});
    return p;
  };
}

function datePartsToISO(dp) {
  try { const p = dp && dp["date-parts"] && dp["date-parts"][0]; if (!p || !p[0]) return ""; return [p[0], p[1] || 1, p[2] || 1].map((n, i) => i ? String(n).padStart(2, "0") : String(n)).join("-"); } catch (e) { return ""; }
}

/* hitCount = documents actually returned (what a person can inspect); totalReported = the service's own total for the
   query, which for Crossref's relevance search is nearly the whole corpus and means little. Zero hitCount with no error
   is "ran and found nothing" — the distinction Receipts' AdapterAttempt keeps. */
function attemptBase(adapter, query) { return { adapter, query, hitCount: 0, totalReported: null, topTitles: [], msElapsed: 0, error: null, at: new Date().toISOString() }; }

async function timedFetchJSON(fetchFn, url, opts, timeoutMs) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs || 20000);
  try {
    const res = await fetchFn(url, Object.assign({ signal: ctl.signal, headers: { "User-Agent": UA, "Accept": "application/json" } }, opts || {}));
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch (e) {}
    const retryAfter = res.headers && typeof res.headers.get === "function" ? Number(res.headers.get("retry-after")) : NaN;
    return { status: res.status, data, text, retryAfter: Number.isFinite(retryAfter) ? retryAfter : null };
  } finally { clearTimeout(t); }
}

/* Paced fetch with one retry on 429. */
async function pacedFetch(fetchFn, limiter, url, timeoutMs) {
  let r = await limiter(() => timedFetchJSON(fetchFn, url, null, timeoutMs));
  if (r.status === 429) { await sleep(Math.min(6000, (r.retryAfter || 1.5) * 1000)); r = await limiter(() => timedFetchJSON(fetchFn, url, null, timeoutMs)); if (r.status === 429) r.rateLimited = true; }
  return r;
}
function errText(e) { return e && e.name === "AbortError" ? "timeout" : (e && e.message || String(e)); }

/* ---------------- Crossref ---------------- */
/* Crossref `type` values per expected source type. Without a filter a keyword query returns mostly book chapters. */
const CROSSREF_TYPES = {
  academic_paper: ["journal-article", "proceedings-article", "posted-content"],
  survey_report: ["journal-article", "report", "posted-content"],
  agency_report: ["report", "report-component"],
  book_or_edition: ["book", "monograph", "edited-book", "book-chapter", "reference-book"],
};
function crossref({ fetch: fetchFn, mailto, minIntervalMs }) {
  const base = "https://api.crossref.org/works";
  const polite = mailto ? "mailto=" + encodeURIComponent(mailto) : "";
  const limiter = makeLimiter(minIntervalMs == null ? 400 : minIntervalMs);
  return {
    name: "crossref",
    /* Two paced queries: `query.title` (finds a paper the model named by title; the general query missed Zhu 2016
       "Greening of the Earth and its drivers" while the title query ranked it first) and `query.bibliographic` (keywords
       across title, authors, container, year). Each is its own attempt; results merge with per-DOI dedupe downstream. */
    async search({ query, limit, types }) {
      const crTypes = Array.from(new Set((types || []).flatMap(t => CROSSREF_TYPES[t] || [])));
      const filter = crTypes.length ? "&filter=" + crTypes.map(t => "type:" + t).join(",") : "";
      const one = async field => {
        const attempt = Object.assign(attemptBase("crossref", query), { field }); const t0 = Date.now();
        const url = base + "?query." + field + "=" + encodeURIComponent(query) + "&rows=" + (limit || 8) + filter + "&select=DOI,title,author,issued,container-title,type,URL,publisher,updated-by" + (polite ? "&" + polite : "");
        attempt.url = url.replace(/&mailto=[^&]*/, "");
        try {
          const r = await pacedFetch(fetchFn, limiter, url);
          attempt.msElapsed = Date.now() - t0;
          if (r.status !== 200 || !r.data || !r.data.message) { attempt.error = "HTTP " + r.status + (r.rateLimited ? " (rate limited twice; try again in a minute)" : ""); return { candidates: [], attempt }; }
          const items = r.data.message.items || [];
          attempt.totalReported = Number(r.data.message["total-results"]); if (!Number.isFinite(attempt.totalReported)) attempt.totalReported = null;
          const candidates = items.map(it => ({
            adapter: "crossref", doi: normalizeDoi(it.DOI), title: (it.title || [])[0] || "", journal: (it["container-title"] || [])[0] || "",
            authors: (it.author || []).slice(0, 6).map(a => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean),
            publishedAt: datePartsToISO(it.issued), docType: it.type || "", url: it.URL || (it.DOI ? "https://doi.org/" + it.DOI : ""), publisher: it.publisher || "",
            notices: noticesFrom(it["updated-by"]), noticesFromSearch: true, matchedBy: [field],
          })).filter(c => c.title);
          attempt.hitCount = candidates.length;
          attempt.topTitles = candidates.slice(0, 5).map(c => c.title);
          return { candidates: withTitleFlags(candidates), attempt };
        } catch (e) { attempt.msElapsed = Date.now() - t0; attempt.error = errText(e); return { candidates: [], attempt }; }
      };
      const title = await one("title"); const bib = await one("bibliographic");
      return { candidates: title.candidates.concat(bib.candidates), attempt: bib.attempt, attempts: [title.attempt, bib.attempt] };
    },
    /* Publication-status check: notices that update this DOI. Absent notices mean "no notice found", not endorsement.
       The single-work route does not accept `select` (HTTP 400 if sent). */
    async status(doi) {
      const d = normalizeDoi(doi); if (!d) return { notices: [], checked: false, error: "no DOI" };
      try {
        const r = await pacedFetch(fetchFn, limiter, base + "/" + encodeURIComponent(d) + (polite ? "?" + polite : ""));
        if (r.status === 404) return { notices: [], checked: true, error: null, note: "DOI not in Crossref" };
        if (r.status !== 200 || !r.data || !r.data.message) return { notices: [], checked: false, error: "HTTP " + r.status };
        return { notices: noticesFrom(r.data.message["updated-by"]), checked: true, error: null };
      } catch (e) { return { notices: [], checked: false, error: errText(e) }; }
    },
  };
}
function noticesFrom(updatedBy) {
  return (Array.isArray(updatedBy) ? updatedBy : []).map(u => ({ type: String(u.type || u.label || "update").toLowerCase(), label: u.label || "", source: u.source || "", noticeDoi: normalizeDoi(u.DOI), date: datePartsToISO(u.updated) }));
}
/* Publishers and preprint servers often mark a withdrawn or retracted item only in its title ("WITHDRAWN: …",
   "RETRACTED: …") with no Crossref `updated-by` record — seen live on Research Square preprints. This flags that. */
function titleFlag(title) {
  const m = /^\s*(WITHDRAWN|RETRACTED|RETRACTION|EXPRESSION OF CONCERN|CORRIGENDUM|ERRATUM)\b/i.exec(String(title || ""));
  if (!m) return [];
  const word = m[1].toLowerCase();
  const type = /withdrawn/.test(word) ? "withdrawal" : /retract/.test(word) ? "retraction" : /concern/.test(word) ? "expression-of-concern" : "correction";
  return [{ type, label: "Title marked " + m[1].toUpperCase(), source: "title", noticeDoi: "", date: "" }];
}
function withTitleFlags(cands) { for (const c of cands) { const f = titleFlag(c.title); if (f.length && !(c.notices || []).some(n => n.source === "title")) c.notices = (c.notices || []).concat(f); } return cands; }

/* ---------------- PubMed (E-utilities) ---------------- */
function pubmed({ fetch: fetchFn, apiKey, email, minIntervalMs }) {
  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
  const common = "&tool=deflate-lens" + (email ? "&email=" + encodeURIComponent(email) : "") + (apiKey ? "&api_key=" + encodeURIComponent(apiKey) : "");
  const limiter = makeLimiter(minIntervalMs == null ? (apiKey ? 110 : 350) : minIntervalMs);
  return {
    name: "pubmed",
    async search({ query, limit }) {
      const attempt = attemptBase("pubmed", query); const t0 = Date.now();
      const esUrl = base + "esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=" + (limit || 8) + "&term=" + encodeURIComponent(query);
      attempt.url = esUrl;
      try {
        const es = await pacedFetch(fetchFn, limiter, esUrl + common);
        if (es.status !== 200 || !es.data || !es.data.esearchresult) { attempt.msElapsed = Date.now() - t0; attempt.error = "HTTP " + es.status + (es.rateLimited ? " (rate limited twice; add NCBI_API_KEY or wait a minute)" : ""); return { candidates: [], attempt }; }
        const ids = es.data.esearchresult.idlist || [];
        attempt.totalReported = Number(es.data.esearchresult.count); if (!Number.isFinite(attempt.totalReported)) attempt.totalReported = null;
        if (!ids.length) { attempt.msElapsed = Date.now() - t0; return { candidates: [], attempt }; }
        const su = await pacedFetch(fetchFn, limiter, base + "esummary.fcgi?db=pubmed&retmode=json&id=" + ids.join(",") + common);
        attempt.msElapsed = Date.now() - t0;
        if (su.status !== 200 || !su.data || !su.data.result) { attempt.error = "esummary HTTP " + su.status; return { candidates: [], attempt }; }
        const candidates = ids.map(id => su.data.result[id]).filter(Boolean).map(r => {
          const idsArr = r.articleids || [];
          const get = t => { const a = idsArr.find(x => x.idtype === t); return a ? a.value : ""; };
          return { adapter: "pubmed", pmid: String(r.uid || ""), pmc: get("pmc"), doi: normalizeDoi(get("doi")), title: r.title || "", journal: r.fulljournalname || r.source || "",
            authors: (r.authors || []).slice(0, 6).map(a => a.name).filter(Boolean), publishedAt: pubdateToISO(r.pubdate), docType: (r.pubtype || []).join("; "),
            url: "https://pubmed.ncbi.nlm.nih.gov/" + r.uid + "/", fullTextUrl: get("pmc") ? "https://pmc.ncbi.nlm.nih.gov/articles/" + get("pmc") + "/" : "", notices: [] };
        }).filter(c => c.title);
        attempt.hitCount = candidates.length;
        attempt.topTitles = candidates.slice(0, 5).map(c => c.title);
        return { candidates: withTitleFlags(candidates), attempt };
      } catch (e) { attempt.msElapsed = Date.now() - t0; attempt.error = errText(e); return { candidates: [], attempt }; }
    },
  };
}
function pubdateToISO(s) { const m = /^(\d{4})(?:\s+([A-Za-z]{3}))?(?:\s+(\d{1,2}))?/.exec(String(s || "")); if (!m) return ""; const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }; const mo = m[2] ? months[m[2].toLowerCase()] : null; return m[1] + (mo ? "-" + String(mo).padStart(2, "0") + (m[3] ? "-" + String(m[3]).padStart(2, "0") : "") : ""); }

/* ---------------- OpenAlex ---------------- */
const OPENALEX_TYPES = { academic_paper: ["article", "preprint", "review"], survey_report: ["article", "report", "review"], agency_report: ["report"], book_or_edition: ["book", "book-chapter"] };
function openalex({ fetch: fetchFn, apiKey, mailto, minIntervalMs }) {
  const limiter = makeLimiter(minIntervalMs == null ? 110 : minIntervalMs);
  return {
    name: "openalex",
    async search({ query, limit, types }) {
      const attempt = attemptBase("openalex", query); const t0 = Date.now();
      if (!apiKey) { attempt.error = "no OPENALEX_API_KEY configured (OpenAlex refuses unkeyed requests once the shared daily budget is spent)"; return { candidates: [], attempt }; }
      const oaTypes = Array.from(new Set((types || []).flatMap(t => OPENALEX_TYPES[t] || [])));
      const filter = oaTypes.length ? "&filter=type:" + oaTypes.join("|") : "";
      const url = "https://api.openalex.org/works?search=" + encodeURIComponent(query) + "&per_page=" + (limit || 8) + filter + "&select=id,doi,title,publication_date,primary_location,authorships,type,is_retracted,open_access";
      attempt.url = url;
      try {
        const r = await pacedFetch(fetchFn, limiter, url + "&api_key=" + encodeURIComponent(apiKey) + (mailto ? "&mailto=" + encodeURIComponent(mailto) : ""));
        attempt.msElapsed = Date.now() - t0;
        if (r.status !== 200 || !r.data) { attempt.error = "HTTP " + r.status + (r.data && r.data.message ? ": " + String(r.data.message).slice(0, 160) : ""); return { candidates: [], attempt }; }
        const items = r.data.results || [];
        attempt.totalReported = Number(r.data.meta && r.data.meta.count); if (!Number.isFinite(attempt.totalReported)) attempt.totalReported = null;
        const candidates = items.map(w => ({
          adapter: "openalex", openalexId: w.id || "", doi: normalizeDoi(w.doi), title: w.title || "", journal: (w.primary_location && w.primary_location.source && w.primary_location.source.display_name) || "",
          authors: (w.authorships || []).slice(0, 6).map(a => a.author && a.author.display_name).filter(Boolean), publishedAt: w.publication_date || "", docType: w.type || "",
          url: w.doi || w.id || "", fullTextUrl: (w.open_access && w.open_access.oa_url) || "", notices: w.is_retracted ? [{ type: "retraction", label: "Retracted (OpenAlex flag)", source: "openalex", noticeDoi: "", date: "" }] : [],
        })).filter(c => c.title);
        attempt.hitCount = candidates.length;
        attempt.topTitles = candidates.slice(0, 5).map(c => c.title);
        return { candidates: withTitleFlags(candidates), attempt };
      } catch (e) { attempt.msElapsed = Date.now() - t0; attempt.error = errText(e); return { candidates: [], attempt }; }
    },
  };
}

module.exports = { crossref, pubmed, openalex, noticesFrom, titleFlag, datePartsToISO, pubdateToISO, makeLimiter, CROSSREF_TYPES, OPENALEX_TYPES };
