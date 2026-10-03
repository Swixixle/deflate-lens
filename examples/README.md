# Supplied examples

Each folder here is a run that the server installs into the data folder on first start, marked `example: true`. Examples are read-only in the app and are never overwritten or duplicated on later starts. Use "Copy as a new run" to get an editable copy; the copy keeps the example's analyses, receipts and attribution status, and records `copiedFrom`.

## pilot-jre2308

The Joe Rogan Experience #2308 with Jordan Peterson, released 22 April 2025. Source: https://www.youtube.com/watch?v=QBEZhjnZTks

- `transcript.txt`: the transcript as supplied by the user. It has no source attached and was not checked against the audio. Its speaker labels are wrong in long stretches, which is what the attribution stage exists to catch.
- `build-pilot.js`: the actual source of this example. The analysis was written by Claude in chat on 2 October 2026, then corrected after a second reader (GPT) flagged four overreaches and the percentage scores. Running `npm run build-pilot` regenerates `run.json`, `passages/` and `summary.json` and fails if any quote stops being verbatim.
- Attribution: 110 turns flagged and 108 labels corrected from content cues by Claude. **No person has confirmed it**; `provenance.confirmedAt` is deliberately absent and the app holds its old readings until attribution and reading preparation pass. The matching quotes remain inspectable in the stored records.
- Receipts: 6 claims carry receipts that Claude checked against sources in chat (`addedBy: "claude-in-chat"`). The other 54 are graded from the model's general knowledge and stay "unchecked".
- Every one of the 63 quotes and all pivots verify verbatim against the transcript (`npm test`).
