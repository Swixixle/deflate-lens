# Deflate Lens

Paste what you have, a claim, a quote, a whole interview transcript, or a link, and get a plain reading of it at a high-school or a fifth-grade level: what is argued, the single step where the argument jumps, the fairest defense of the speaker, what is left after it, and every claim graded on its own, with sources found in the academic databases and attached only by a person. The speaker is never graded. Everything stays on your computer.

## Quick start

Needs Node.js 18 or newer (<https://nodejs.org>, the LTS download). Then, in a terminal, inside the project folder:

```
npm run setup
npm run launch
```

`setup` checks Node and npm, installs the locked dependencies, creates `.env` from the example if you have none, and makes the data folder. It is safe to run again; it never overwrites your settings or your saved work. `launch` starts the server, waits until it answers, prints the address (normally <http://127.0.0.1:3123>) and opens it in your browser. Stop with `Ctrl+C`; start again later with `npm run launch`.

The supplied example (a Rogan–Peterson episode, 16 cards) opens with no key. The first time you ask for real analysis, the page asks for your Anthropic API key once and saves it to `.env` on this computer. Searching sources needs no key at all.

**If you have an assistant with a terminal on your computer** (a coding assistant or a desktop assistant that can run commands), you can hand it this instead: *"Install and open Deflate Lens on this computer. Follow the repository setup instructions, preserve any existing data and settings, and ask me only for anything you cannot obtain or configure yourself."* `AGENTS.md` tells it exactly what to run. An assistant that only reads this page in a browser cannot install anything; it needs a terminal on your machine.

### Prerequisites, exactly

- Node.js 18, 20 or 22 with the npm that comes with it. Checked by `npm run setup`.
- A browser: Safari, Chrome, Firefox or Edge.
- For real analysis: an Anthropic API key (<https://console.anthropic.com>, **API keys**; usage is billed to that account).
- Network access to registry.npmjs.org for the one-time `npm ci`, and to api.crossref.org and eutils.ncbi.nlm.nih.gov for searching sources. The model calls go to api.anthropic.com.

### Start, stop, restart, by hand

```
npm start                      start the server without the launcher; prints the address; Ctrl+C stops it
npm run launch -- --no-open    start and print the address without opening a browser
npm run launch -- --port 4000  use another port (also PORT=4000 in .env)
npm run doctor                 say what is configured, without printing secrets
```

If `npm run launch` finds a Deflate Lens server already answering, it reuses it and opens the page. If the port is held by another program, it picks the next free one and tells you the address actually in use. It reports success only when the server answers a health check.

### Setup on macOS, step by step

1. Open Terminal (`⌘ Space`, type `Terminal`, Return). Type `node -v`. A version of 18 or higher means Node is there; otherwise install it from <https://nodejs.org> (LTS) or with Homebrew (`brew install node`), then close and reopen Terminal.
2. Get the code: unzip the ZIP, or `git clone https://github.com/YOUR-USERNAME/deflate-lens.git` (replace the address with the published repository's; this placeholder is replaced at publication).
3. `cd` into the folder (type `cd ` and drag the folder from Finder into the Terminal window, then Return).
4. `npm run setup`, then `npm run launch`.

The clean-copy checks for this version ran on Linux with Node 22 (see *What was verified*). The macOS steps are the standard Node ones and the launcher uses macOS's `open`, but they have not been exercised on a Mac in this build; if something differs, `npm run doctor` says what it sees.

## Billing

Analysis calls go to Anthropic's API on your key and are billed to that account, separately from any Claude.ai subscription. The page asks for the key once, when you first request real analysis, and writes it to `.env` on this computer with the file readable by you alone; it is not sent back to the browser, logged, or stored anywhere else, and `.env` is ignored by git. You can also put `ANTHROPIC_API_KEY=sk-ant-…` in `.env` by hand and restart. Add credit in the console under **Billing**. With the default model (`claude-sonnet-5-5`, $2 per million input tokens and $10 per million output at the time of writing), one passage costs a few cents and a full three-hour interview with 15 to 20 passages costs well under a dollar; the attribution check and segmentation on a long transcript are the larger requests. Set `ANTHROPIC_MODEL=claude-opus-5-5` in `.env` for a stronger, pricier model. Check current prices at <https://platform.claude.com/docs/en/models/overview>.

To try the workflow with no key and no bill, set `DEFLATE_MOCK_AI=1` in `.env` yourself. Every analysis is then a labelled placeholder, not a real reading; the app never switches this on for you.

**Source search costs nothing.** Crossref and PubMed are free and need no key. Put your e-mail in `RESEARCH_CONTACT_EMAIL` in `.env`: Crossref then serves you from its "polite" pool, which is faster and steadier than the anonymous one (this build measured the pool at 3 requests per second and paces itself under that). OpenAlex needs a free API key (`OPENALEX_API_KEY`, from openalex.org, with a daily budget on the free tier); without one it is skipped and the search says so. An NCBI key (`NCBI_API_KEY`) is optional and only raises PubMed's rate limit. The model is not involved in searching, so a search never costs tokens.

## Using it

1. **Start.** Click **New run** and paste into the one box: a claim or a quote (one or two sentences, no speaker labels, with or without a final period), a transcript (lines that begin with `NAME:` become turns; `.txt`, `.srt`, `.vtt`, `.md` files can be uploaded instead), or a link. The line under the box says what it looks like, and the button says what will happen: **Check this claim**, **Save and continue**, or **Fetch the link**. Nothing else is required: the title is made from the text, the date stays unknown, speakers are read from the labels, and text without labels is read as *Speaker unknown*. **Add context · optional** holds the title, date, source link and label, display names and one-line bios; every one is labelled optional and none blocks anything.
2. **A claim** becomes a run of its own with one card, and is searched at once with no key: the claim as typed, a search query generated for it, the source types it calls for (both editable in Details), and the candidate documents the databases returned, waiting for your judgment. **Explain and grade with the model** (needs a key) types it, writes the plain explanation and what would settle it at both reading levels, and refines the query; the claim's wording and identity never change, and the earlier state is kept in history.
3. **A link** is fetched by the importer, which reads the page's text (article pages, transcript pages, plain `.txt`/`.srt`/`.vtt` files) and puts it in the box for you to check and trim before saving; the source link and page title are filled in under Add context. Sites that do not expose transcripts to a plain fetch (YouTube, Spotify, Apple Podcasts, X, Facebook, Instagram, TikTok, Rumble), pages behind a login, pages rendered by JavaScript, and unreachable sites each get a short explanation and the same two alternatives: paste the text or upload a file. The app never shows a link as read when only its address or title was obtained; a run made from an import says so in stage 5.
4. **Who said what** (transcripts with two or more speakers). Transcription services shift and swap labels, and every later grade inherits the error. **Check attribution with the model** reads each turn against the bios, or against the words alone when there are no bios, and flags conflicts; you decide each one (or set any turn by hand), then **Confirm attribution**. Deflation stays locked until then. With one speaker or none, there is nothing to attribute and the stage says so; nothing is locked. Conclusions that depend on who said something stay provisional when the speaker is unknown.
5. **Deflate.** **Split into passages**, tick the ones you want, **Deflate selected**. Each passage becomes a card.
6. **Read a card.** The card is written to be read top to bottom at the reading level you chose: **In plain words** (the rewrite), **Where it jumps** (or *No jump*), **In fairness to the speaker** (the best defense from the quoted words alone), **What is left** (the challenge revised after the defense), and **The claims, one at a time**, each typed and graded. Under the title sit a few small chips: **Quotes · 3/3 matched**, **Rewrite · faithful**, **Evidence · weak**, **Reasoning · gap**, and **Sources · 1 of 4 checkable claims**; every checkable claim carries its own chip: **Not checked**, **Searched · 2 waiting**, **Searched · nothing attached**, or **Sources · 2**. Click any chip and it opens, in place, the links and a plain explanation of what was checked and what that does and does not mean, at the same reading level as everything else. Nothing on a card ever says *verified*: a source is a person's judgment that a document bears on the claim, and the chip says so.
7. **Details.** At the bottom of every card, **Details: the exact words, the checks, sources and history** opens the rest: the quotes exactly as said, each marked *matched* or *not found word for word* (and flagged when the model credited a different speaker than the corrected transcript shows); the rewrite check; and, claim by claim, what would settle it, where to look, **Search sources**, **Attach as a source** (a link and a one-line note), the search attempts on record, the candidates waiting with **Accept as a source** / **Reject** (reason from a fixed list), the rejections, **Withdraw** on any source (it stays on record, marked withdrawn, with your reason), the passage's history, and **Re-run this passage**. The reading level for just this card can be overridden there too.
8. **Search sources.** The server sends the claim's query to Crossref (two queries: by title, then by any bibliographic field), PubMed, and OpenAlex if you added a key, restricted to the document types the claim calls for, and lists what came back as candidates. The same paper found by several databases appears once, with every finder named. Each candidate's DOI is checked against Crossref's record of retractions and corrections and any notice is badged; a title that begins WITHDRAWN or RETRACTED is badged too. Every search is kept as an attempt record (service, query, how many came back, how long it took, or the error), so "I searched and found nothing" is on file, and so is "the service was down". Nothing is attached automatically. Claims routed to source types with no connector in this build (government data, news, court filings…) get an attempt saying exactly that.
9. **Patterns.** Reads every fresh card in full (stale cards are left out and named), finds moves that recur across cards, and lists what came through intact.
10. **Source, provenance record, export.** The interview link, the attribution record, any pictures, the quote tally for the whole run, and three downloads: **claims JSON** (schema `deflate-lens/claims@0.3`: every claim with a stable id, its speaker, turns, type, judgments, staleness, quote checks, search attempts, sources, withdrawals and rejections, and a `statusMeaning` block saying what each status does and does not mean), **obligations JSON** (the checkable claims in the shape Receipts' router takes, `EvidenceObligation.to_json`), or **Markdown at the reading level currently selected**. `docs/receipts-schema.md` documents every record.

**Reading levels.** One switch at the top, **High school / Fifth grade**, changes every generated explanation on the page: the card text, each claim's plain restatement and its basis, what would settle it, the chip explanations, the patterns, and the Markdown download. Two things are never rewritten: quotations, and the canonical wording of a claim (the model's or yours), which is what evidence is attached to, so changing the level never moves evidence. The fifth-grade version is a stress test: if an argument still holds up at that level, it was real.

**Quotes are checked on every load, by the server.** Each quote is compared word for word with the transcript as it is saved: the words must appear in that turn, in that order, at word boundaries; a quote spliced with … must keep every fragment (a lone "no" counts) in order, without overlap; words in [brackets] are the writer's and are skipped as a gap. Exactly these differences are tolerated: letter case, typographic quotes and dashes, whitespace, and punctuation that is not attached to a number. Everything that carries meaning is kept: digits, a decimal point or comma between digits, a dash between digits (a range), a sign before a digit, a percent or degree sign after one, a currency sign before one, and apostrophes inside words, so "1.5%" does not match "1–5%" and "-5 degrees" does not match "5 degrees". The speaker shown next to a quote is whoever the transcript, with your corrections from stage 2, says spoke that turn; if the model named someone else, the card says so. If the words are in a different turn than the model named, the card shows the turn they are actually in and says the model named another. Edit the transcript or a label and the badges change at once, with no re-run. "Matched" proves the words are there; it does not prove the card reads them fairly, which is why the quotes are one click away.

**Nothing you did is lost, and nothing moves to the wrong claim.** Every claim has a stable id, and every record action (search, attach, accept, reject, withdraw, edit the query) names the claim by that id and is applied to the latest saved reading under a lock, never to a copy the page loaded earlier. Each card carries a reading number; an action prepared against an older reading is refused with "this card changed since you looked" rather than written over the newer one. A search that finishes after the card was re-read is attached to the same claim if it still exists (marked as late) and otherwise parked, never allowed to bring the old reading back. Re-running a passage keeps the earlier reading in that passage's `history`; sources and searches follow a claim only when it is the same claim, meaning the same speaker and the same words with their numbers intact ("1.5%" and "1–5%" are different claims; the same sentence from a different speaker is a different claim). Anything that does not follow is parked on the run and listed in stage 3 so you can reattach it to the claim you choose. Re-segmenting does the same with the archived passages. Accepting a candidate twice yields one source; rejecting a candidate you had accepted withdraws its source with the reason on record. Editing the transcript keeps your label corrections in place when the turn structure is unchanged (you re-confirm), and otherwise archives them in the run file (`provenanceHistory`) and says so. For a typed claim, editing the text makes the new wording the claim; the old reading and its evidence are kept apart, and an explanation of the old wording cannot be saved as current. **Move to trash** moves a run to `data/trash/`; the Trash list on the left restores it.

**Stale cards.** If you change the transcript or any speaker label after cards exist, the cards affected are marked **stale** with the reason, and so is the patterns section when any card it was based on is stale or the attribution or transcript changed since. They are kept, not deleted; re-run them from Details to refresh. Searching a stale card still works and is labelled provisional, on the chip, in the attempt record and in the obligations export, until the card is re-run.

## Where your work lives, and backups

Everything is in the `data/` folder inside the project (change it with `DATA_DIR` in `.env`):

```
data/runs/<run id>/run.json            title, source, speakers, attribution decisions, timestamps
data/runs/<run id>/transcript.txt      the transcript exactly as saved
data/runs/<run id>/passages/p001.json  one passage: its analysis, receipts, search records, and earlier readings (history)
data/runs/<run id>/summary.json        patterns
data/runs/<run id>/attachments/        pictures you added
data/runs/<run id>/archive/            passages replaced by a re-segment
data/trash/<run id>-<stamp>/           runs moved to the trash in the app
```

Plain JSON and text, readable by hand. **To back up, copy the `data` folder** (Finder, Time Machine, or `cp -R data ~/Desktop/deflate-backup`). To restore, put it back. The app never removes files: to really delete a run, remove its folder from `data/trash/` yourself.

The server listens on `127.0.0.1` only, so nothing on your network can reach it. If you set `HOST=0.0.0.0` to use it from another device, anyone on that network can read and change your runs: there is no login.

## The supplied example

`examples/pilot-jre2308` is The Joe Rogan Experience #2308 with Jordan Peterson (22 April 2025). It is installed into the data folder on first start, marked **example**, and is read-only; it is never overwritten or duplicated on later starts. Click **Copy as a new run** to get an editable copy that keeps its analyses, receipts and status and records where it came from.

What it is and isn't: the analysis was written by Claude in chat on 2 October 2026 and corrected after a second reader flagged four overreaches and the percentage scores. Its 108 speaker-label corrections came from content cues read by Claude; **no person has confirmed them**, and the app shows the run as unconfirmed. Six claims carry sources checked in chat; the other 54 are graded from general knowledge and stay unchecked. All 63 quotes match the transcript word for word, in order, in the turn each names, credited to the speaker the corrected attribution gives, and all 14 pivots are found inside their passages (`npm test` checks this). `examples/README.md` has the details, and `examples/pilot-jre2308/build-pilot.js` is the actual source of the example. Analyses you generate are labelled with your model (`deflate-lens local · claude-sonnet-5-5`, say), so supplied and generated work are always distinguishable.

## Checks

```
npm test
```

Runs 47 tests in about fifteen seconds with no key and no network: the transcript parser (headings, continuations, SRT stripping, the single-use-label rule); quote verification (in-order fragments, word boundaries, punctuation-insensitive words, reversed and overlapping splices rejected) and the passage check (speaker derived from the turn, wrong-turn relocation, pivot inside the passage); the attribution signature; the supplied example (every quote matched in its own turn with no speaker mismatch, every pivot found, both reading levels everywhere, no percentage scores, unconfirmed status preserved); the whole server workflow over HTTP with a temporary data folder and the mock model (example loads, create → audit → confirm → segment → deflate → patterns, exports, picture round trip, **restart with everything intact**, staleness after an attribution change and after a transcript change, archive on re-segment, read-only example, duplicate, trash and restore, path safety); **evidence preservation** (a client save without the records cannot drop them; a save without the analysis keeps it; a new reading keeps history and carries records, including one sent in the same save; withdrawal is recorded, not deleted; a re-segment parks records, the first matching reading adopts them, a person reattaches the rest; a transcript edit keeps or archives attribution decisions by turn structure); **server-side quote checks** (recomputed on every read, speaker from the turn, a splice across turns rejected whatever the client stored, badges change when the transcript changes); the research layer on recorded fixtures (query compilation, each connector's parsing and errors, the two-query Crossref search with type filters, the status check without `select`, dedupe, obligations, 429 retry and pacing, title flags, search → reject → accept over HTTP); **intake** (a bare claim with no title, date, speaker, URL or final period becomes a searchable run; unlabeled text is read as Speaker unknown with no heading heuristics while saved runs keep their rules; auto-titles; routing edits survive stale saves); **validation** (bad links, dates, statuses, overrides naming unknown speakers or non-existent turns, reversed or out-of-range passages, a done passage without an analysis, unknown passage ids in patterns, non-http sources, all refused with a reason and nothing written); **concurrency** (twelve sources attached at the same moment all survive; a search racing a manual attach loses nothing; the run's updatedAt moves with every save); **claim identity** (ids stable across re-runs and reorderings, in history and in the export); the **link importer** against a local fixture server (article pages, text files, sites without an importer, thin pages, logins, unreachable hosts); the **one-time key setting** (written to .env with other lines kept, never echoed, wrong shapes refused); **setup and launch** (a fresh copy gets a .env with no active key; a second setup leaves .env, runs, sources and attribution byte-identical; the launcher reports ready only when the server answers, reuses a running server of this installation, steps past an occupied port, and reports a server that dies); and **the regressions written from the independent review of 0.6.0** (`test/review-0.6.0.test.js`: a search finishing after a newer reading never reactivates the old one and is parked or attached late; evidence never follows a changed meaning or speaker and positions are not addresses; accept is idempotent and a later rejection withdraws the source; patterns and obligations reflect stale attribution and provisional research is labelled; negation and numeric punctuation survive quote matching and relocated quotes show their real turn; an empty analysis cannot become a card; the patterns prompt carries the defense; editing a typed claim replaces the claim and refuses an explanation of the old wording; the launcher does not mistake another program for itself).

An optional browser check drives the real page in headless Chromium: the example's 16 cards show quote chips all green and no editing control in the default view; a bare claim pasted with nothing else becomes a card, is searched, and is explained by the (mock) model with its wording and id unchanged; a YouTube link gets the honest fallback and saves nothing; a two-speaker transcript goes through every stage; on a card, chips open explanations, Details holds the controls, search → reject → accept turns the chip into **Sources · 1** with no "verified" anywhere, a re-run keeps the source and notes the history, a withdrawal drops the chip back and stays on record, the level switch changes the card text and the chip explanations while the quote stays exact and the Markdown link follows the level, patterns run, the export says what a status means, stale badges appear, a run moved to trash is restored; and against a server with no key, the example opens, real analysis asks for the key once, and a wrong key saves nothing. It needs Playwright, which is not installed by default because it is large:

```
npm install --no-save playwright && npx playwright install chromium
node scripts/ui-check.js
```

```
npm run research-smoke
```

Hits the live Crossref and PubMed services (and OpenAlex with a key) for two claims from the supplied example and prints the attempts and candidates, then checks a DOI known to be retracted and prints its notices. Writes nothing. Use it to see what the search actually returns before trusting it on your own runs. `docs/research-smoke-2026-10-02.txt` is the output from the day this was built, so you can compare.

## What was verified, and what wasn't

Verified on 2 October 2026 from a clean copy on Linux with Node 22 (0.7.0): `npm run setup` from nothing (dependencies installed from the lockfile, `.env` created with no active key), `npm run setup` again with a key and a saved run in place (both byte-identical afterwards), `npm test` (47 passing), `npm run launch -- --check` reporting ready only after the health check answers and reusing the running server on a second call, and the browser check above end to end. Saved work survives stopping and restarting the server.

Found by the independent review of 0.6.0 and fixed in 0.7.0, each with a regression test: a search that finished after a newer reading was saved wrote its stale snapshot back and reactivated the old reading (mutations are now applied to the latest document under the lock, by claim id, with a reading number the client can assert; late results attach to the same claim or are parked); evidence followed a claim across changed meaning, "1.5%" to "1–5%", and across speakers, and a stale tab's write by array position attached a source to the wrong claim (identity now keeps speaker and numeric punctuation; positions are not addresses); accepting a candidate twice produced two sources and a later rejection left them active (idempotent now; rejection withdraws the source with the reason); the patterns summary and the obligations export ignored stale attribution (both now derive freshness from the attribution, transcript and the cards they rest on; provisional research is labelled); the quote matcher dropped short fragments such as "no", collapsed "1.5%" into "1–5%" and "-5" into "5", and showed a quote as matched in a turn it was not in (every fragment kept, numeric characters kept, the real turn shown); an empty analysis could be saved as a finished card (refused with a reason); the patterns prompt omitted the defense (included, with an instruction to respect the revised judgment); editing a typed claim could get the old claim explained and marked current (the input is the claim; an explanation of other wording or of an older reading is refused); the launcher mistook any `{"ok":true}` service for itself (it now checks the application name, version and data folder).

Found and fixed in 0.6.0 by executable checks: the `.env.example` placeholder key was an active line, so a fresh `.env` made the server believe a model was configured and the first real request would have failed instead of asking for a key (the placeholder is now commented and the factory ignores anything not key-shaped); the "is this a new reading" comparison depended on JSON key order, so the first search on a typed claim was recorded as a re-run (now a canonical comparison); two requests saving the same passage at the same moment could each read the old file and overwrite the other's merge (now serialised per run); malformed saves (reversed turn ranges, overrides naming turns or speakers that do not exist, non-http links, unknown passage ids) were written as given (now refused with a reason); claims had no identity beyond their position, so a re-run that reordered them moved the evidence (now stable ids); the run's `updatedAt` did not move when a passage was saved (now it does); the patterns prompt sent only one-line summaries of each card (now the full card text, with stale cards left out and named); a short claim with no final punctuation was parsed as a heading and left nothing to analyse (claims and unlabeled text now use a parse mode without heading heuristics, while saved runs keep theirs).

Found and fixed in 0.5.0 by adversarial checks against 0.4.0: a page save could silently drop every source, search and rejection on a passage (the server now merges records back and keeps history); a re-segment discarded them with the archived passages (now parked and reattachable); a transcript edit wiped a person's label corrections (now kept or archived); deleting a run removed its folder (now trash); the quote check accepted fragments in any order and inside other words (now ordered, word-boundary) and trusted the model's speaker label and turn number (now derived from the transcript); the pivot was checked against text that included speaker labels (now against the passage's turns); quote badges were computed once by the page and stored (now recomputed by the server on every read).

Verified live against the real services the same day (`npm run research-smoke`): Crossref and PubMed answer; the title query ranks Zhu et al. 2016 *Greening of the Earth and its drivers* first for the example's greening claim where the general query misses it; a correction notice surfaced on a live candidate (Nature Communications Earth & Environment 2023, corrected 2024-08-14); the status check on the retracted 1998 Lancet paper returns both its 2004 partial retraction and its 2010 retraction; a Research Square preprint marked WITHDRAWN only in its title had no Crossref notice and was caught by the title rule. The first live run also found two defects the fixture tests could not (Crossref's single-work route rejects `select`, and its polite pool here allows 3 requests/second), both fixed and now covered by tests.

Not verified:

- **Real model output.** Every analysis in the tests and the browser check used the mock responder. The prompts in `public/app.js` (`P.audit`, `P.segment`, `P.deflate`, `P.claim`, `P.patterns`) have been syntax-checked, but no transcript or claim has yet been run through them on a live key. Expect to tune them. The supplied example was not produced by them.
- **macOS specifically.** `npm run setup`, `npm run launch` and the tests ran on Linux. The launcher's macOS branch (`open`) and the Terminal steps are standard but were not exercised on a Mac in this build. Windows is untested beyond the launcher's `start` branch existing.
- **The link importer on real sites.** It is tested against a local fixture server (article page, text file, thin page, login, unreachable host) and against the site list by hostname. It has not been pointed at live news or transcript sites in this build; a page that renders its text with JavaScript will come back as "little readable text" and the fallback applies.
- **The one-time key flow with a real key.** The write to `.env` and the swap-in of the model are tested with a key-shaped string; no request was made to Anthropic.
- **Picture transcription** needs a live model (the mock returns a placeholder).
- **Long transcripts.** Requests are chunked at 60,000 characters; a three-hour show takes three or four attribution and segmentation requests. Not tested on a live key.
- **Search quality on your claims.** Two claims were run live. Crossref's relevance ranking is weak for keyword queries (the general query for "social status serotonin humans dominance" returned book chapters until a type filter was added, and conference abstracts after); PubMed's is better but covers biomedicine only. Expect to read candidates critically and to edit the model's query when it is poor. The query is shown on the card.
- **OpenAlex** has not been exercised live in this build (no key was available). Its connector is tested on recorded fixtures only.

## Limits worth knowing

- The model cannot browse. "Unchecked" means exactly that; a receipt is a person's work. A search finds candidates; it does not find truth, and a candidate's presence says nothing about what it concludes.
- "No retraction or correction notice found" means Crossref lists none for that DOI. It is not an endorsement, and preprints and books are thinly covered.
- A source is never a verification. The word does not appear on a card; the claims export carries `statusMeaning` so other tools do not read "receipt" as "verified" either.
- Only academic sources have connectors (Crossref, PubMed, OpenAlex). Government data, surveys, news archives, court filings, company statements and books have none yet; claims routed there are marked so rather than searched in the wrong place. The dataset receipt shape in `docs/receipts-schema.md` is defined but no connector produces it.
- Records follow claims by their wording. A re-run or re-segment that rephrases a claim leaves its sources parked (in the passage's history after a re-run; on the run, listed in stage 3, after a re-segment) until a person reattaches them. The page shows the counts and the list; it does not show an earlier reading's full text inline (open the passage file for that).
- The quote check proves words and order, not meaning. A quote can match and still be read unfairly by the card; the chips say this, and the quotes are one click away so a reader can judge. The exact tolerance is stated under *Using it*.
- A reading saved without saying what transcript and attribution it was based on is taken to be based on the run as it is at that moment; the page always says, so this only affects other clients.
- The supplied example's fourteen "partly" verdicts after the defense pass are uniform in a way that may reflect the prompt's format rather than the arguments. No controlled comparison has been run.
- `verifyQuote` proves the words appear in the transcript. It does not prove they mean in context what a card says they mean.
- The parser's heading rules (transcript mode) are tuned to the format of the supplied transcript. Other formats may mis-split turns; the who-said-what stage shows every turn so a person can catch it. Text without speaker labels and typed claims use the text mode, which has no heading rules. A run's mode is fixed when it is created and shown in the export.
- A link is only ever "read" when the importer returned its text and you saved that text. The run then records the fetch (address, time, characters). A link added under Add context is a citation, nothing more.
- No login. Localhost only by default.
- No license file is included. Pick one before making the repository public.

## Project layout

```
server/index.js        start script: reads .env, binds localhost, prints the address
server/app.js          the HTTP API and static file serving
server/store.js        file storage; evidence rules (record merge, history, orphans, trash, provenance history); staleness; quote checks on read
server/ai.js           the only place that talks to the model; mock responder
server/exportClaims.js claims JSON, obligations JSON and Markdown exports
server/validate.js     every document a client can save, checked before it is written
server/importer.js     link importer: readable text or a plain reason
server/settings.js     the one-time key write to .env
server/research/      types.js (source types, rejection reasons, query compiler), connectors.js (Crossref, PubMed, OpenAlex, pacing),
                      index.js (obligation, orchestration, dedupe, status checks, mock)
docs/receipts-schema.md  every research record, what it proves and what it does not
shared/transcript.js   parser, quote and passage checks, attribution signature, carry-over (used by server, tests and browser)
public/                the page: index.html, app.js, styles.css
examples/              supplied runs, installed on first start
test/                  node --test suites
scripts/setup.js       the one setup command;  scripts/launch.js  start, verify, open
scripts/doctor.js      configuration check;  scripts/ui-check.js  optional browser check;  scripts/research-smoke.js  live connector check
AGENTS.md              what an assistant with a terminal should run to install and open this
```
