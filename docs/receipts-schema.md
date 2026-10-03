# Receipts, search attempts, rejections, quote checks: the records Deflate Lens keeps

Every empirical claim (type `fact`, `contested` or `unsupported`) carries four lists on its passage record
(`data/runs/<id>/passages/pNNN.json`, inside `analysis.claims[n]`) and they are copied into the claims export
(`deflate-lens/claims@0.5`). Nothing in these lists is written by the model. Searches are written by the connectors;
receipts, rejections, withdrawals and relations are written only when a person clicks.

Vocabulary, so no consumer mistakes a record for a verdict: a claim's `status` is `unchecked` (nobody has looked),
`searched` (a search ran; candidates may be waiting), or `receipt` (a person attached at least one document, not
withdrawn, that they judged relevant). None of these means verified. The export repeats this in `statusMeaning`.

## Preparation before display

The server computes `attributionGate` for the run and `readingGate` for each card on every read. Generated readings need current input, resolved attribution, matching quotes, both reading levels and a recorded approved review whose `analysisHash` matches the reading. A person's untouched typed claim is searchable without this model review. Editing a reviewed reading cannot keep the old approval.

`run.preparation` stores automatic speaker decisions, supporting quotations, corrections, unresolved turns and both call ids. A disputed short reply stays unresolved even when both model passes guess the same speaker. `passage.provenance.review` stores the review call id, issues, automatic quote corrections, attempt count and content hash; this is copied only from the server's own call record. No person confirmation is invented.

The reading page and Markdown withhold held card bodies. JSON preserves their records for inspection, carrying `run.attributionGate`, `passages[].readingGate`, `claims[].readingGate`, `patternsGate` and provisional reasons; consumers must honor those statuses. A passed preparation check is a text review, not proof of who spoke or of factual truth.

## Automatic processing and input

`POST /api/intake` takes `{input, context?}`, with no required context fields, saves an input and starts a background reading. `POST /api/runs/:id/read` starts or resumes it; concurrent starts share one job. `POST /api/runs/:id/stop` aborts it. `GET /api/runs/:id` carries server-owned `run.processing` (id, status, phase, plain message, input hash, card counts, timestamps and issues). Statuses are running, awaiting_key, held, partial, complete, error, stopped, or interrupted. A browser disconnect does not stop it. A server restart marks unfinished work interrupted, ready to resume. Current input, attribution and job identity are checked under the lock before publishing readings.

`run.intake` records hashes and sizes before/after cleanup, the counts of outside-dialogue lines removed, the method, source, timestamp and original-input filename. Earlier intake records stay in `intakeHistory`; originals stay under `inputs/`. `/api/runs/:id/original-input.txt` returns the latest original. The cleaned text is the transcript bound to every reading. No inside-dialogue words are automatically removed. Source searches now run automatically after prepared readings; candidates still require a person's decision to become receipts.

An overview needs both levels, at least two prepared cards per recurring pattern, and a server-recorded approval with a `summaryHash` matching its content. Changing its content or its supporting cards holds it before display. Canonical prompts are shared between the server and optional page controls in `shared/prompts.js`.

## Revisions and addressing

Every passage carries `rev` (moves on every write) and `readingRev` (moves only when the analysis changes: a re-run,
an explanation, a claim edit). Every record action is a request on `…/passages/<pid>/claims/<claim id>/…` and may
carry `expectedReadingRev`; the server applies it to the latest saved document under the run's lock
(`store.mutateClaim`) and answers 409 `stale_reading` when the reading moved since the client looked, or 404
`claim_not_current` when that claim is not in the current reading. A whole-passage save (`PUT …/passages/<pid>`)
may carry `expectedReadingRev` too. Array positions are never addresses.

A search runs without the lock (the services take seconds), then commits into the latest document: if the claim id is
still in the current reading the attempts and candidates are attached, marked `late: true` with `readingRev` (the
reading the search started from) and `attachedReadingRev`; if the claim is gone, the whole result is parked on
`run.orphans[]` (`why: "the reading changed while the search ran…"`) and the response says `parked`. The old reading
is never reactivated.

## Claim identity

Every claim gets an `id` the first time it is saved (`c…`, random; files written before 0.6.0 get a deterministic
`<passage>-c<n>` until they are next saved). A re-run keeps the id on the claim with the same identity, whatever its
new position, so records and the export point at the same claim before and after. Identity (`claimKey`) is the
speaker plus the text with only case, typographic marks, whitespace and the final period ignored: "Growth was 1.5%"
and "Growth was 1–5%" are different claims, and the same words from a different speaker are a different claim.
Records of a claim that is not in the new reading are parked on `run.orphans[]` (with `from.reading`) for
reattachment; nothing is carried across a changed meaning. Receipts carry a stable `rid` as well (`rc_<candidate id>`
for an accepted candidate, `rl_…` for a link); withdrawal is addressed by it. The export's `claims[].id` is this id and `claims[].position` is where it sits now. A claim a person typed
(`userSupplied: true`, type `claim`) keeps its wording through **Explain and grade with the model**; only its type,
basis, what-would-settle and routing are written by the model. Changing the reading level changes nothing underneath.

## Validation (server/validate.js)

Every document a client can save is checked before it is written: run fields (an http(s) source link or none, a
YYYY-MM-DD date or none, a known status, attribution overrides that name existing speaking turns and known
speakers), passages (whole-number turn ranges inside the transcript, in order, an analysis when marked done, the
analysis itself through the shared sanitiser), summaries (passage ids that exist), sources (http(s) links), routing
(known source types). A refused save returns HTTP 400 with the reason and nothing on disk changes.

## What the server guarantees (server/store.js)

- Writes to one run are serialised, so two saves arriving together cannot each read the old file and overwrite the
  other's merge. The run's `updatedAt` moves with every passage, summary or attachment save.

- A passage save can never remove a record: `savePassage` merges receipts, searches, candidates and rejections back
  from disk, keyed by identity (receipt: candidateId+url+at; search: adapter+field+query+at; candidate: id; rejection:
  candidateId+url+at). A save without an `analysis` keeps the one on disk.
- A new reading (different `analyzedAt`, or different content once computed fields and records are stripped) appends
  the old reading to `passage.history[]` and carries records to the new claim with the same normalised text; records
  sent with the new reading are unioned in, not replaced. `passage.rerun` records `{carried, orphaned, at}`.
- A re-segment parks every record set whose claim is going to the archive on `run.orphans[]`; the first reading that
  produces the same claim text adopts it (`passage.adopted[]`); `POST /api/runs/:id/orphans/:oid/attach {pid, idx}`
  reattaches one by hand. Reattached records carry a `reattached` mark naming where they came from.
- A transcript edit keeps attribution decisions in place when the parsed turn structure (count, labels, headings) is
  unchanged and clears only the confirmation; otherwise it archives them. Either way the previous provenance goes to
  `run.provenanceHistory[]` with `keptInPlace`.
- Deleting a run moves its folder to `data/trash/<id>-<stamp>/`; `GET /api/trash` lists, `POST /api/trash/:name/restore`
  restores.
- Quote checks are computed on every read (see below) and stripped before writing, so a client cannot store a verdict.

## Obligation (what the claim asks for)

Written at search time from the claim's `expectedSources` and `searchQuery` (set by the model during deflation) or,
when those are missing, from a heuristic over the claim text. Same shape as `EvidenceObligation.to_json()` in
Receipts (`src/surfacing/obligations.py`), so a Receipts router can take the obligations export as input.

```json
{
  "id": "obl_<run>_<passage>_c<n>",
  "subject": "Rising status raises serotonin and changes emotional sensitivity in humans.",
  "question": "Is it true that …? <what would settle it, from the card>",
  "expected_document_types": ["academic_paper"],
  "priority": "primary",
  "routing_hints": { "speaker": "JP", "turns": "118-123", "run": "<run id>", "search_query": "social status serotonin humans dominance", "types_by": "model" }
}
```

`expected_document_types` uses Receipts' `ExpectedSourceType` values plus four this tool needed (`book_or_edition`,
`company_statement`, `survey_report`, `transcript_or_recording`). `types_by` says whether the model or the heuristic
chose them. Only `academic_paper`, `survey_report`, `agency_report` and `book_or_edition` have a connector in this
build; a claim routed elsewhere gets a `none` attempt saying so.

## Search attempt (what was asked, what came back)

One per connector call, appended to `searches[]` on every search, never removed. Keeps "ran and found nothing" apart
from "errored" (Receipts' `AdapterAttempt` distinction).

```json
{
  "adapter": "crossref", "field": "title",
  "query": "greening of the Earth and its drivers leaf area",
  "hitCount": 6, "totalReported": 1843201,
  "topTitles": ["Greening of the Earth and its drivers", "…"],
  "msElapsed": 288, "error": null, "at": "2026-10-02T06:21:40.112Z", "runStartedAt": "2026-10-02T06:21:39.900Z",
  "url": "https://api.crossref.org/works?query.title=…&filter=type:journal-article,…"
}
```

`hitCount` is the number of documents returned (what a person can inspect). `totalReported` is the service's own count
for the query; Crossref's is close to its whole corpus for any keyword query and means little, PubMed's is a real
Boolean match count. Crossref runs twice per search (`field: "title"`, then `field: "bibliographic"`) because the
title query finds a paper the model named by title and the general query often does not. `error` values seen live:
`HTTP 429 (rate limited twice; try again in a minute)`, `timeout`, `no OPENALEX_API_KEY configured …`,
`no adapter in this build serves government_data; nothing was searched`.

## Candidate (found, waiting for a person)

Stored in `candidates[]` with `status: "candidate"`, then `"accepted"` or `"rejected"`. The same paper found by
several databases is one candidate (`foundBy`), keyed by DOI, else PMID, else normalised title. Fields: `id`, `doi`,
`pmid`, `pmc`, `openalexId`, `title`, `journal`, `authors[]` (first six), `publishedAt`, `docType`
(`journal-article`, `book-chapter`, `posted-content` …), `url`, `fullTextUrl` (PMC or open-access copy when known),
`publisher`, `foundBy[]`, `matchedBy[]` (which Crossref query matched), `notices[]`, `statusCheck`, `retrievedAt`.

`statusCheck` is the publication-status check: `{checked, error, note, at}`. For a work Crossref itself returned, the
notices come from the search record (`note: "from the Crossref search record"`); for a work found only by PubMed or
OpenAlex, one extra Crossref call fetches its record. "No notice found" means Crossref lists no retraction, correction
or update for that DOI. It is not an endorsement: a withdrawn preprint seen live carried its withdrawal only in its
title, with no Crossref record, which is why `notices[]` also gets a `source: "title"` entry when the title begins with
WITHDRAWN, RETRACTED, RETRACTION, EXPRESSION OF CONCERN, CORRIGENDUM or ERRATUM.

```json
{ "type": "retraction", "label": "Retraction", "source": "retraction-watch", "noticeDoi": "10.1016/s0140-6736(10)60175-4", "date": "2010-02-06" }
```

`type` values seen: `retraction`, `correction`, `withdrawal`, `expression-of-concern`, `update`. OpenAlex's
`is_retracted` flag becomes `{type: "retraction", source: "openalex"}`.

A news candidate (connector `gdelt`, source type `news_coverage` or `long_form_journalism`; 0.8.0) has no DOI, PMID
or authors; it carries `url`, `title`, `outlet` (the domain), `publishedAt` and `seenAt` (the moment GDELT saw it,
UTC), `language`, `sourceCountry`, `docType: "news-article"`, `sourceType: "news_coverage"`, and
`statusCheck: {checked: false, note: "news articles carry no DOI; the retraction registries do not cover them"}`.
Its identity for dedupe is its address (two outlets printing the same wire headline are two candidates). The attempt
for it records `field: "fulltext"` and `coverage: "news since 2017-01-01, english-language outlets"` (or without the
language clause when `NEWS_LANGUAGE` is blank). GDELT reports no total, so `totalReported` is null.

## Receipt (a person's decision that this document bears on the claim)

Appended to `receipts[]` when a person clicks **Accept as receipt**, or types a URL into **Attach receipt**.

```json
{
  "kind": "document",
  "url": "https://doi.org/10.1038/nclimate3004", "title": "Greening of the Earth and its drivers",
  "doi": "10.1038/nclimate3004", "pmid": "", "pmc": "", "journal": "Nature Climate Change", "authors": ["Zaichun Zhu", "…"],
  "publishedAt": "2016-04-25", "retrievedAt": "2026-10-02T06:21:41.004Z",
  "foundBy": ["crossref"], "notices": [], "statusCheck": { "checked": true, "error": null, "note": "from the Crossref search record", "at": "…" },
  "note": "LAI rose over 25–50% of vegetated area 1982–2009; the 'greener' figure is leaf area, not planet surface",
  "addedBy": "person at this computer", "at": "2026-10-02T06:21:41.004Z", "candidateId": "cand_k3j9x2mq"
}
```

`kind` is `document` (from a candidate) or `link` (typed by hand via `POST …/claims/:idx/receipts {url, note}`; only
`url`, `note`, `addedBy`, `at`). A receipt records that a person judged the document relevant. It does not record what
the document shows beyond the note and the relation, and it does not change the claim's type or the card's judgments;
those stay the model's reading, corrected by hand.

**Relation (0.8.0).** `relation` is what the attaching person said the document does for the claim: `supports`,
`contradicts`, `mentions`, or `unstated` (the default, meaning exactly that nothing was said). It is set from the
`relation` field of the accept or attach request, or changed later with `PUT …/receipts/<rid>/relation {relation}`,
which keeps the previous value in `relationHistory[] {relation, by, at, replacedAt}`. A stated relation carries
`relationBy` and `relationAt`. It is never inferred: a search finding a document says nothing about its relation, and
the server writes `unstated` for anything outside the closed set. A withdrawn receipt's relation is frozen (409
`receipt_withdrawn`). The export carries `relation` per receipt, `relations` counts per claim (active receipts only), and
`relationMeaning`. A relation does not change the claim's `status` vocabulary; `contradicts` is shown on the chip
(`Sources · 2 · 1 contradicts`) and nothing else moves. The shape is Rabbit_Hole's `ClaimSupportEdge.supportKind` with
the person recorded, which that repository's schema lacked.

A receipt accepted from a news candidate (see *Candidate*) also carries `outlet`, `sourceType: "news_coverage"` and
`language`; its `statusCheck` is `{checked: false, note: "news articles carry no DOI; …"}`.

A receipt is never deleted. `POST …/claims/<claim id>/receipts/<rid>/withdraw {reason}` sets `withdrawnAt`,
`withdrawnBy` and `withdrawReason`; a withdrawn receipt no longer counts toward `status` but stays in the list and in
the export (`withdrawn: true`); its candidate, if any, becomes `withdrawn`. A receipt that came back from a re-segment
or a re-run carries `reattached: {orphanId, from, by, at, originalClaimText}`.

Decisions are explicit and reversible on record: accepting a candidate that is already accepted changes nothing
(`outcome: "already accepted"`); rejecting a candidate that was accepted withdraws its receipt with
`withdrawReason: "candidate rejected: <reason>"` and the rejection carries `withdrewReceipt: true`; accepting a
rejected candidate is refused (409 `candidate_rejected`; attach it by hand if you mean it); accepting a candidate again
after withdrawing its receipt is a new decision, so it makes a new receipt with its own id (`rc_<candidate>_2`, marked
`reaccepted: true`) and the withdrawn one stays on record (`outcome: "accepted again after a withdrawal"`).

**Whole-passage saves and records (0.8.0).** The page saves the whole passage it loaded (on a re-run, say), and that
copy may be older than the disk. A record the disk already has therefore wins whole: a save cannot change or strip a
receipt's relation, its withdrawal, a candidate's decision, or any other field of a record the server holds. A record
the disk does not have is added after a shape check (a receipt needs an http(s) link; its relation is kept only from the
closed set and its relation provenance is the server's; a candidate arrives undecided). `history`, `adopted`, `rerun`
and `provenance` on a passage are server-owned and ignored on a save; a save that marks the card `running` or `pending`
carries no reading at all, so the reading on disk stays whatever the copy held.

## Rejection (a person's decision that a candidate does not count)

Appended to `rejections[]` on **Reject**. Reasons are Receipts' closed `RejectionReason` list (`no_primary_source`,
`wrong_document_type`, `out_of_date_window`, `below_score_threshold`, `duplicate`, `extraction_failed`,
`fetch_failed`, `no_results`) plus two for human review: `does_not_address_claim` (the default) and
`retracted_or_corrected`. The list is `REJECTION_REASONS` in `server/research/types.js`; anything else sent to the
API is recorded as `does_not_address_claim`.

```json
{ "candidateId": "cand_mock2", "doi": "10.0000/mock.2", "url": "…", "title": "…", "reason": "retracted_or_corrected", "detail": "", "by": "person at this computer", "at": "…" }
```

## Quote check (computed on every read, never stored)

For every analysed passage the server runs `verifyPassage` (shared/transcript.js) against the transcript as saved and
the attribution corrections as they stand, and adds to each `analysis.asSaid[i]`:

| field | meaning |
|---|---|
| `verbatim` | the quote's words appear in order, at word boundaries, in the turn the card names, or (when that turn is outside the passage or lacks them) in exactly one turn of the passage |
| `turnOk` | the named turn lies inside the passage |
| `foundIn` | turns inside the passage containing the quote, when the named turn does not |
| `speakerNow` | who the corrected transcript says spoke the turn the quote was found in |
| `speakerMismatch` | the model's `speaker` label disagrees with `speakerNow` |

and on `analysis.jump`: `pivotVerbatim`, `pivotTurns`. `passage.quoteCheck` summarises `{quotes, matched, mismatched,
outOfRange, pivotOk}`. The export carries all of this per passage (`passages[].quotes`, `passages[].quoteCheck`).

The match rule, exactly. Tolerated: letter case; typographic quotes, apostrophes, dashes and ellipses (unified);
whitespace runs; punctuation not attached to a number; words in [brackets] (a gap). Kept: digits; `.` `,` `-` between
digits; a sign or currency mark before a digit; `%` or `°` after a digit; apostrophes inside words. Fragments split on
… are all kept, however short, and must appear in order, each starting after the previous one ends, each at a word
boundary. "B … A" taken from "A B" fails; "ill made sex" does not match "pill made sex"; "porn" does not match
"pornography"; "no … treatment helps" does not match "treatment helps"; "1.5%" does not match "1–5%"; "-5" does not
match "5"; a comma missing from the quote does not fail it. Each quote also carries `matchedTurn` and `relocated`:
when the words are in a different turn than the model named, the card and the export show the real turn. A match
proves the words and their order. It does not prove the card reads them fairly.

## Parked records (`run.orphans[]`)

```json
{ "id": "o…", "claimText": "…", "claimType": "fact", "speaker": "JP", "from": { "archive": "<stamp>", "passage": "p004", "title": "…", "turnStart": 118, "turnEnd": 123, "claim": 1 },
  "receipts": [], "searches": [], "candidates": [], "rejections": [], "obligation": null, "parkedAt": "…" }
```

The export lists them under `run.orphans` with counts, so a downstream tool knows records exist that no current claim
carries.

## Dataset receipt (defined, not yet produced by any connector)

For claims a figure settles (`government_data`, `survey_report` routed to a data service) the receipt a future
connector should produce, so that a number can be re-derived rather than trusted:

```json
{
  "kind": "dataset",
  "dataset": "IPEDS Fall Enrollment", "version": "2023 provisional", "publisher": "NCES", "url": "…", "retrievedAt": "…",
  "observationPeriod": "fall 2022", "population": "degree-granting Title IV institutions, undergraduate",
  "variables": ["distance_education_status"], "units": "students", "filters": { "level": "undergraduate" },
  "weights": "none", "calculation": "share enrolled exclusively or partly in distance education = (a + b) / total",
  "result": { "value": 0.54, "unit": "share" }, "note": "…", "addedBy": "…", "at": "…"
}
```

No connector in this build writes this shape (Dataverse, GSS, Census, BLS, World Bank, NASA/NOAA and DataCite were
proposed but not built). It is here so the next build has a target and the exports are stable.

## Input record and reading binding (`run.input`, `basedOn.inputHash`; 0.8.0)

The server hashes the transcript as stored (`run.input = {sha256, chars, bytes, parseMode, recordedAt}`; SHA-256 of
the UTF-8 text with no normalisation, so a changed line ending is a changed text) when a run is created and whenever
the transcript changes; the previous hash goes to `run.inputHistory[] {sha256, chars, transcriptUpdatedAt, replacedAt}`
(hashes only, never the text; capped at 200). A client cannot set either field.

For a reading or summary with a known origin, the server resolves `basedOn.inputHash`: the client names the version it read
(`basedOn.transcriptUpdatedAt`), the server looks the hash up, from the current text or from `inputHistory`, and writes
it; a client-supplied `inputHash` is overwritten; a version the run does not remember gets `""`. Staleness
("transcript changed since this analysis") is then `basedOn.inputHash !== run.input.sha256`, so an edit that is undone
makes the cards fresh again, which the timestamp rule could not say. Readings saved before 0.8.0 carry no hash and keep
the timestamp rule; runs saved before 0.8.0 get an input record derived from their text on read and persisted on the
next save. Since 0.8.1, a missing input version stays explicitly unknown/stale instead of being stamped current. A model request captures its input hash and attribution signature before contacting the provider; a stale request is refused before the call. Saving with its recorded `callId` uses that original snapshot, not a later client-supplied version. Pattern calls also capture the signature of the fresh cards they received. The claims export carries `run.transcript.sha256`, `earlierVersions`, and `basedOn` per passage;
`node scripts/verify-export.js <export.json> <transcript.txt>` recomputes the file's hash and says, card by card,
whether the reading was made from exactly that text, from an earlier version the run remembers, or from a text the
export cannot name. This is CDIL's server-side hash at intake and Wordicon's read-time identity check, reduced to
`node:crypto`; it proves that an export and a file describe the same text, not that any reading is fair.

## Model-call record (`calls.jsonl`, `passage.provenance`; 0.8.0)

Every request to the model is recorded by the server as one JSON line in `data/runs/<id>/calls.jsonl` (or
`data/calls.jsonl` when the request names no run): `{callId, at, purpose, runId, provider, modelRequested,
modelReturned, requestId, stopReason, usage: {input, output}, latencyMs, promptHash, promptChars, outputHash,
outputChars, images: [{mediaType, sha256}], json, mock, basedOn: {inputHash, transcriptUpdatedAt, attrSig, passagesSig?}}`; a failed call is recorded with `error` and `errorMessage`
instead of the output fields. The record holds hashes of the prompt and the answer, never their text. The page saves
the reading with `callId`; the server copies its own record onto the passage as `provenance` (plus `recorded: true`)
and drops whatever the client sent under that name; an unknown id, or an id recorded for another run or for no run, is
recorded as `{callId, recorded: false, note}`, never invented. A same-reading save never replaces a recorded call with
an unrecorded one; a copy of a run takes its `calls.jsonl` with it. A re-run moves the previous record into `history[]` with the reading it belongs to; a save of the same
reading keeps it. The export carries `provenance` per passage. This is the orchestrator's minimal raw record
(`{id, model, stop_reason, usage}`) with a prompt hash, latency and failure recording added, and it is per call, not
per run.

**Leak scan.** Nothing written under the data folder may contain a string shaped like an Anthropic key
(`sk-ant-` followed by 20 or more key characters): the write is refused with 400 `key_in_document` and nothing is
stored. A prompt containing one is not stored anyway (only its hash), so the call itself goes through.

## What each record proves

| record | proves | does not prove |
|---|---|---|
| input record | the run's text had this SHA-256 at this time; a reading with the same `inputHash` was read from exactly that text | that the text is a faithful transcript of anything |
| model-call record | the server sent a prompt with this hash to this provider at this time, and this model answered with this request id, these tokens, this output hash | that the answer is right |
| relation | a person stated, at this time, that the document supports / contradicts / mentions the claim | what the document establishes; that the person read it correctly |
| news candidate (GDELT) | an outlet at this address published an article whose text matched the query, seen by GDELT at this time | relevance, stance, or that the outlet is reliable |
| search attempt | this query was sent to this service at this time and this came back | that the query was the right one |
| candidate | the service returned a document with these identifiers | relevance |
| status check | Crossref listed these notices (or none) for the DOI at that time | that an unlisted work is sound |
| receipt | a person judged the document bears on the claim, with a note | what the document establishes; that the claim is true |
| withdrawal | a person took that judgment back, with a reason | that the document was wrong |
| rejection | a person set the document aside for a named reason | that the judgment was right |
| quote check | these words appear in this turn in this order, under the current attribution | that the card reads them fairly |
| provisional flag | the card was stale, or attribution unconfirmed, when this was recorded or exported | that the record is wrong |
