"use strict";
/* Shared vocabulary for research records. The source-type list is Receipts' ExpectedSourceType enum
   (src/surfacing/types.py) so an obligation exported from Deflate is one Receipts can route. */

const SOURCE_TYPES = [
  "corporate_filing", "congressional_record", "hearing_transcript", "federal_court_filing", "state_court_filing",
  "regulatory_rule", "regulatory_comment", "campaign_finance_record", "lobbying_disclosure", "agency_report",
  "news_coverage", "long_form_journalism", "academic_paper", "patent", "government_data", "investigative_document",
  "network_record", "federal_contract",
  // Deflate additions for interview claims Receipts does not yet route; kept distinct so a Receipts consumer can ignore them
  "book_or_edition", "company_statement", "survey_report", "transcript_or_recording",
];

/* Why a candidate document was not accepted. Closed set, mirrors Receipts' RejectionReason with two human-review additions. */
const REJECTION_REASONS = [
  "no_primary_source", "wrong_document_type", "out_of_date_window", "below_score_threshold", "duplicate",
  "extraction_failed", "fetch_failed", "no_results",
  "does_not_address_claim", "retracted_or_corrected",
];

/* Claims a document can bear on: the model's empirical types, plus "claim" = text a person typed to check. */
const EMPIRICAL_TYPES = ["fact", "contested", "unsupported", "claim"];

/* Which adapters serve which source types. Academic types go to the bibliographic databases; news coverage goes to
   GDELT's document index (no key). Types with an empty list are kept so the audit can say "no adapter for this type"
   instead of silently searching the wrong place. */
const ADAPTERS_FOR_TYPE = {
  academic_paper: ["crossref", "pubmed", "openalex"],
  survey_report: ["crossref", "openalex"],
  agency_report: ["crossref"],
  government_data: [],
  news_coverage: ["gdelt"],
  long_form_journalism: ["gdelt"],
  book_or_edition: ["crossref"],
  company_statement: [],
  transcript_or_recording: [],
};

/* What a person says an attached source does for the claim. Stated by the person who attaches it, never inferred
   from the fact that a search found it; "unstated" is the default and means exactly that. A relation is that
   person's reading of the document, on record with their name and time; it is not a verification of the claim. */
const RELATIONS = ["unstated", "supports", "contradicts", "mentions"];
const RELATION_MEANING = {
  unstated: "The person attached the document as bearing on the claim and did not say how.",
  supports: "In the attaching person's reading, the document supports the claim as worded.",
  contradicts: "In the attaching person's reading, the document contradicts the claim as worded.",
  mentions: "The document discusses the claim or its subject without, in the attaching person's reading, settling it either way.",
};

function normalizeDoi(doi) {
  let s = String(doi || "").trim().toLowerCase();
  s = s.replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:\s*/, "");
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s : "";
}

const STOP = new Set(("a an the of in on at to for from by with and or but is are was were be been being this that these those it its as than then so if not no " +
  "has have had do does did can could would should may might will shall about into over under more most less least very much many some any all each every " +
  "he she they we you i his her their our your who whom which what when where why how there here also just only even still yet up down out off").split(" "));

/* A deterministic keyword query from a claim, used when the model gave none. Keeps content words, drops the speaker's
   hedges, caps at eight terms. Same claim always gives the same query, so a search is replayable. */
function compileQuery(claimText, wouldSettle) {
  const base = String(claimText || "").replace(/^[A-Za-z .'-]{2,40}:\s+/, ""); // drop "Jordan Peterson: " prefixes
  const words = base.toLowerCase().replace(/[“”"'’‘(),.;:!?%]/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
  const uniq = []; for (const w of words) if (!uniq.includes(w)) uniq.push(w);
  return uniq.slice(0, 8).join(" ");
}

/* Fallback type guess when the model did not name expected sources. Heuristic and marked as such. */
function guessSourceTypes(claimText, wouldSettle) {
  const s = (String(claimText || "") + " " + String(wouldSettle || "")).toLowerCase();
  const out = [];
  if (/\b(study|studies|research|trial|meta-analysis|review|journal|paper|evidence|prevalence|peer)\b/.test(s)) out.push("academic_paper");
  if (/\b(survey|poll|respondents|general social survey|gss|institute for family)\b/.test(s)) out.push("survey_report");
  if (/\b(nasa|noaa|cdc|census|bureau|dataset|data set|statistics|government data|ipcc)\b/.test(s)) out.push("government_data");
  if (/\b(book|edition|chapter|wrote in|his book|her book|memoir)\b/.test(s)) out.push("book_or_edition");
  if (/\b(announce|announced|price|company|academy|statement|press release|website)\b/.test(s)) out.push("company_statement");
  if (/\b(said on|transcript|interview|episode|podcast|quote)\b/.test(s)) out.push("transcript_or_recording");
  if (/\b(news|reported|newspaper|cnbc|times|post)\b/.test(s)) out.push("news_coverage");
  if (/\b(filing|court|indictment|hearing|sec |fec |lobby)\b/.test(s)) out.push("federal_court_filing");
  return out.length ? out.slice(0, 2) : ["academic_paper"];
}

module.exports = { SOURCE_TYPES, REJECTION_REASONS, EMPIRICAL_TYPES, ADAPTERS_FOR_TYPE, RELATIONS, RELATION_MEANING, normalizeDoi, compileQuery, guessSourceTypes };
