# Deflate Lens 0.11.1 review and handoff

Reviewed 3 October 2026. Input: Claude's `deflate-lens-0.11.0(1).zip` and mail patch. GitHub `Swixixle/deflate-lens/main` was confirmed at `78a2f143f873b5ee235ee2e472ca33e4a33beb5e` during this review. The original 134 tests passed independently, but the adversarial checks below exposed defects they did not cover.

## What stays simple

Upload, paste text, or paste a link and press **Read this**. Reading preparation runs automatically. Extra controls stay closed. High school / Fifth grade remains at the top of each card. Speaker naming remains optional under Add context. No new routine confirmation or setup stage was added.

## Confirmed findings and changes

1. **Number matching changed quantities.** `matchQuote("1000000", "zero million")` returned a tolerated match; `one thousand million` became `1001000`. Zero is now preserved, supported scales must descend, and unsupported repeated/ascending scales are left unmatched. This is deliberately a limited matcher, not a general number parser.
2. **A missing speaker boundary credited the wrong span.** The first proposed speaker was forced onto the first word even if its start occurred later; a missing subsequent boundary left that speaker's words under the preceding name. Uncovered prefixes and spans containing a missing switch now stay UNKNOWN. A second model cannot restore a name to those uncertain spans through the assignment pass.
3. **A long paragraph escaped the speaker request limit.** Chunking waited until a paragraph had already exceeded 14,000 characters. Chunking now bounds requests at whitespace and preserves all source words, including headings and numeric lines. A provider response stopped for token limits or refusal cannot commit partial speaker assignments.
4. **Completed fetches disappeared from recovery.** Recovery used only running jobs and only the new-input view. A finished fetch could therefore be stranded while an older saved run reopened. The page now checks pending work at startup, including completed results. Initial jobs and finished results are durable. Unfinished work after a server restart is reported as interrupted; audio chunks are not checkpointed for crash resume.
5. **Two tabs could import one fetch twice.** The old page called ordinary intake independently. A new server consume endpoint imports the server's stored result once, with serialized requests and a deterministic run ID. New runs are staged before publication. Retries, an acknowledgment write failure, and restart converge on the existing run. Existing-run replacement is bound to the original input hash so an intervening edit is not overwritten. Dismissed jobs cannot be imported by a stale tab.
6. **Upgrade recovery could duplicate old readings.** Version 0.11.0 never stored whether a completed fetch had been imported. Those legacy result files are preserved but excluded from automatic re-import. Newly created 0.11.1 jobs have an explicit consumption record. Legacy unimported results remain in their job files; the page cannot reliably distinguish them from already-used legacy results.
7. **Job listings corrupted state values.** `map(view)` passed array indexes as the optional state argument, so the second running job had `state: 1`. The callback now passes only the job.
8. **Transcript cleanup erased genuine repetition.** Generic SRT/JSON conversion deduplicated identical adjacent speech without timing evidence, and local transcription removed repeated phrases anywhere in a chunk. Untimed speech is now kept. Caption deduplication requires overlapping timestamps and whole-word prefix/suffix boundaries.
9. **Source selection could silently read a different episode.** Ambiguous Spotify titles, partial feed-title matches, stripped query identity, and YouTube title searches could select the wrong material. Ambiguous matches stop with a request for a more specific link. Explicit episode picks take priority. YouTube captions are taken from a directly supplied video or an episode's linked video, not an inferred title-search result. More episodes may fall through to the publisher page/audio; this is an intentional fidelity tradeoff.
10. **Hostname checks did not check the destination socket.** A public-looking hostname could resolve to a private address. The Node fetcher now resolves and validates public addresses, pins the checked address to the connection, repeats this for redirects, bounds redirect count, handles compressed responses, and permits cancellation during DNS. IPv6 acceptance is deliberately conservative. Injected transports remain available for isolated tests.
11. **Quote summaries overstated exactness.** The aggregate page text and Markdown introduction described every accepted quote as word-for-word, and Markdown pivot quotes omitted the numeric tolerance label. Those surfaces now distinguish number-format matches.

## Validation

- Original Claude build: **134 tests passed** independently after allowing the test runner to open localhost listeners. Initial sandbox-only failures were environmental, not attributed to the code.
- Reviewed build: **149 tests**, including executable adversarial checks in `test/review-0.11.0.test.js`.
- Headless Chromium: **26 Boolean release checks**, plus expected card/episode counts; no page errors. Includes completion while the page is closed, two tabs discovering the same finished job, preserved source metadata, optional speaker naming, the one-time key prompt, and a 390-pixel phone viewport. Phone screenshot visually inspected.
- The browser check supports `DEFLATE_CHROMIUM_EXECUTABLE` for an already-installed compatible Chromium. It remains optional; Playwright is not added to application dependencies.
- The combined mail patch is replayed from the 0.10.0 file baseline, and the resulting files are compared with the reviewed release before packaging. Setup, regression tests, and launch health are checked from that clean copy.
- No live model calls or paid transcription calls were made. Speaker accuracy on real long conversations remains unmeasured. Real local speech recognition and Deepgram accuracy/performance were not remeasured.
- Read-only live checks of Podnews and Apple's catalogue failed with environment DNS errors (`EAI_AGAIN`). The new HTTP transport is covered with controlled DNS, redirect, compression and cancellation fixtures; live-source success is not claimed for this review. Claude's historical smoke report remains separately identified in the README.

## Applying the release

The distributed `deflate-lens-0.11.1.patch` contains **two mail commits**: Claude's original 0.11.0 patch and the reviewed 0.11.1 corrections. Apply it to a clean copy of GitHub main at the 0.10.0 baseline, not on top of an already-applied 0.11.0 patch:

```sh
git am /path/to/deflate-lens-0.11.1.patch
npm run setup
npm test
```

The release ZIP is the full reviewed source, without personal data, settings, dependencies, or Git metadata. Preserve your existing `data/` and `.env` when updating an installation. Publication to GitHub was not performed during this review. The normal download updater still uses the version currently published on main.
