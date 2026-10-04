# User guide

Deflate Lens helps you understand what was said, what supports it, and what remains uncertain. This guide is also inside the app: open **Controls**, then **User guide**.

## Start a reading

Paste text or a link into the box, or press **Upload transcript** (.txt, .srt, .vtt, .md). Then press **Read this**. That is the only step you need.

- **Text or a transcript.** Lines that start with a name and a colon (`ANN: …`) are read as speakers.
- **One claim.** A single sentence is read as a claim: the app explains it and looks for sources.
- **A podcast, video or page link.** The app looks for a transcript the show published, then the video's captions, then the episode page. If none exists it can turn the audio into text.

The app stops to ask only when it cannot decide for you:

- **Which episode**, when you paste a whole show.
- **How to turn audio into text**, the first time it is needed: on your computer (free, private, slow, no speaker names) or with Deepgram (fast, paid, the audio is sent to Deepgram).
- **Your Anthropic key**, the first time a reading needs it. Readings are billed to that key.

After you answer, the reading continues by itself. You can close the page; the work goes on and is there when you come back.

**Add context** (optional) opens Controls, where you can give a title, a source link and a date before you press Read this.

## Read the result

Each passage gets one card with three parts:

1. **In plain words**: what is claimed and the reasons actually given, with the speaker's own certainty and scope.
2. **A fair reading**: the strongest reasonable interpretation the words support.
3. **What follows**: the final assessment after that fair reading. It names a remaining problem specifically, or says why the conclusion is supported.

For example, if someone said "We asked 18 evening visitors and 12 wanted later hours, so most residents want the library open until midnight", **What follows** would say that 18 evening visitors cannot show what most residents want, and that "later" is not the same as "midnight".

**High school / Fifth grade** on each card switches the wording. Fifth grade uses shorter sentences and everyday words; it is meant to say the same thing, not less. The default for new cards is in **Controls → Reading**. Switching never calls the model.

**Evidence** opens under each card. It shows, in order:

- **The original passage**, with the speaker of each turn. Turns just before and after, which the model saw for context, are shown in grey.
- **Quoted in this reading**: each quote, marked *matched*, *matched, numbers written differently* (for example "fifteen percent" and "15%"), or *not found word for word*.
- **Reasoning behind this reading**: the first concern the model raised, the exact words where it thought the reasoning turned, and whether that concern was kept, partly kept, or **withdrawn** after the fair reading.
- **Claims in this passage**, each with what would help check it and any sources.
- **Checks and history**: the review record, the model and date, earlier readings, and **Read this passage again**.

A long reading has a **Contents** list at the top ("3 of 12") and ends with **Across this reading**, which looks for problems that recur in the final assessments. Finding none is a normal result.

## Understand the limits

- **Matching words is not the same as keeping the meaning.** Quotes are checked word for word against the saved text. Whether the plain version keeps the meaning is checked by a second pass of the same model. That is a useful check, not an independent one, and it can be wrong. The original is always one click away under **Evidence**.
- **A model's assessment is not verification.** A "Checkable claim" is something evidence could settle; the app does not decide from the model's memory whether it is true. A search finds possible sources. Only you attach a source, and only you say whether it supports or contradicts the claim. Nothing in the app is ever marked "verified".
- **Not checked does not mean false.** It means no one has looked yet.
- **Source identity can be uncertain.** When a video was found by searching for the episode's title and length, the reading says **Video matched by title and length — Check source** until you compare the two and confirm. Confirming records what you said; it does not check the transcript.
- **Speakers can be uncertain.** Names suggested by AI are marked as such. Turns with no name show as "Speaker unknown".
- **Context is limited.** The model sees each passage plus up to two turns on each side. A correction made much later in a long conversation may not be seen. When the excerpt is not enough, the reading should say what remains unclear.

## Use optional controls

Everything here is optional. Open **Controls**:

- **Reading**: the default reading level; read again what is not ready; write the closing overview again; **Passage preparation** to split the conversation into passages again. Each says what it will cost before you press it.
- **Input and speakers**: change the title or source; compare and confirm a matched source, or use a different link; edit the text; give speakers names and short bios; let AI suggest names for a transcript that has none; correct who said each turn.
- **App and files**: your model key, audio-to-text settings, downloads, version details, and **Move this reading to the trash**.

Sources for a claim are handled beside the claim, under **Evidence → Sources and search**: search, attach a link, accept or reject a suggestion, say what a source does for the claim, or withdraw it.

Your saved readings are under **Readings**, with **New reading** at the top. **Downloads** gives a readable Markdown version (held readings are left out and named) and the full record as JSON.

## Know where work goes

- **On your computer:** everything you paste or upload, every reading, every source decision and every earlier version, as plain files in the app's `data` folder. Copy that folder to back it up. Deleted readings go to `data/trash`.
- **Sent to Anthropic:** the text being read, when a reading, review or overview is made, using your key. Each of those is a charge on your Anthropic account. A typical passage takes one reading and one review.
- **Sent to Deepgram:** the audio, only if you choose Deepgram for audio-to-text. Billed to your Deepgram key.
- **Sent to search services:** a short search query per checkable claim, to Crossref, PubMed, OpenAlex and GDELT. Free.
- Your keys are kept in the `.env` file in the app folder. The page never shows them.

## Get unstuck

- **It asks for a key.** Paste your Anthropic key once. Get one at console.anthropic.com. If the key is refused, use **Replace the model key**.
- **The link gives no transcript.** The app lists what it tried. Paste the transcript, upload a caption file, or choose audio-to-text.
- **A passage says "Held, not shown".** The card says why, for example that the model's answer was cut off or that a quote did not match. Press **Read this passage again**, or **Try the held readings again** at the top.
- **"Out of date".** The text or a speaker changed after that reading was made. Press **Read again**; the earlier reading is kept in the history.
- **Stop.** Stop cancels the request in progress. If the model had already started on it, that request may still be billed. Finished readings are kept; press **Resume reading** to continue.
- **The app was closed or restarted.** Open it again. Finished readings are kept, and **Resume reading** continues from where it stopped.
