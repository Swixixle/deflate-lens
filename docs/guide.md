# User guide

Deflate Lens helps you understand what was said, what supports it, and what remains uncertain. This guide is also inside the app: open **Controls**, then **User guide**.

## Start a reading

Paste text or a link into the box, or press **Upload** to choose a transcript (.txt, .srt, .vtt, .md) or a recording (an audio or video file). Then press **Read this**. That is the only step you need.

- **Text or a transcript.** Lines that start with a name and a colon (`ANN: …`) are read as speakers. A transcript copied from a web page is cleaned on the way in: "Copy link" buttons and timestamps are taken out of the words (every word is kept), and names the page shows above each paragraph become speakers.
- **One claim.** A single sentence is read as a claim: the app explains it and looks for sources.
- **A podcast, video or page link.** The app looks for a transcript the show published, then the video's captions, then the episode page. If none exists it can turn the audio into text. A link to an audio file goes straight to that step.
- **A recording on your computer.** MP3, M4A, MP4, WAV and other audio or video files, up to 2 GB. The line under the box names the file, and **Read this** turns it into text (with Deepgram, which also tells the voices apart, or on your computer for an MP3), then reads it. The file's own details, such as its title and artist, help name the speakers. The file is not kept; the reading records its name and size.

The app stops to ask only when it cannot decide for you:

- **Which episode**, when you paste a whole show.
- **How to turn audio into text**, the first time it is needed: on your computer (free, private, slow, no speaker names) or with Deepgram (fast, paid, the audio is sent to Deepgram).
- **Your Anthropic key**, the first time a reading needs it. Readings are billed to that key.

After you answer, the reading continues by itself. You can close the page; the work goes on and is there when you come back.

**Add context** (optional) opens Controls, where you can give a title, a source link and a date before you press Read this.

## Read the result

Each passage gets one card with three parts:

1. **In plain words**: the gist in two or three short sentences: what the speaker mainly claims and the main reason given, with their own certainty and scope. The claims under **Evidence** carry the rest.
2. **A fair reading**: the strongest reasonable interpretation the words support.
3. **What follows**: the final assessment after that fair reading. It names a remaining problem specifically, or says why the conclusion is supported.

For example, if someone said "We asked 18 evening visitors and 12 wanted later hours, so most residents want the library open until midnight", **What follows** would say that 18 evening visitors cannot show what most residents want, and that "later" is not the same as "midnight".

**High school / Fifth grade** on each card switches the wording. Fifth grade uses shorter sentences and everyday words; it is meant to say the same thing, not less. The default for new cards is in **Controls → Reading**. Switching never calls the model.

**Who is speaking.** Speaker names that came with the text are kept. When a podcast link's transcript has none, the app separates the voices from the episode's recording with Deepgram (if you set up a Deepgram key, and unless you chose to keep audio on your computer); otherwise it works out from the words where the speaker changes, only where the words show it (a question answered, a guest introduced, a clip played and the host coming back), and leaves the rest alone. A clip, a quotation read aloud or an advertisement is kept apart from the conversation, so its words are never anyone's claims here. When the text has no speaker names at all, the words are shown without a speaker in front of every line, and one quiet line above the reading says so.

**Who each speaker is.** You never have to name anyone. Before the reading appears, the app finds each numbered speaker's name from the conversation and the episode's listing (for a recording you uploaded, the file's own title, artist and album, and its name): someone saying who they are ("I'm Dana Reyes"), a guest introduced just before they speak ("Joining us now, Marcus Delacroix"), the show's host opening the show, someone spoken to by name just before they answer, in an ordinary sentence or in captions with no punctuation ("you know dale as a rule people are slow to change"). A guest the listing names but nobody names aloud, greeted only as "Father" or "Doctor", can be named when the clues agree: the title the listing gives that person, the guest speaking of themselves as the listing describes them ("as an exorcist, I…"), and answering as the guest. A title alone never names anyone. The listing says who might be speaking; the conversation decides which voice is whose. Quoted or reported words, introductions of another day, and names of companies or places don't count. The names appear on the cards, the quotes, the passages, the claims and the downloads. A name is given only when the model's reading of the whole conversation names that person and the words it quotes hold up; the app's own checks never name anyone by themselves. A speaker nothing identifies keeps a number ("Speaker 3"), and **Evidence → Who is speaking** says why: what was found, and why each clue was not enough. If the model's answer can't be used (empty, unreadable, a speaker left out or given two names), the app asks once more; a speaker still undecided keeps its number, says so, and the reading goes on.

**Evidence** opens under each card. It shows, in order:

- **The original passage**, with the speaker of each turn ("Speaker not established" where the words could not settle it). Turns just before and after, which the model saw for context, are shown in grey.
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
- **Speakers can be uncertain.** Speakers worked out from the words or from the recording are marked as such in one line above the reading. A name the app found is shown with how it was found under **Evidence → Who is speaking**; it is worked out from what was said, not proven. "Speaker not established" means the app could not tell who said those words.
- **Context is limited.** The model sees each passage plus up to two turns on each side. A correction made much later in a long conversation may not be seen. When the excerpt is not enough, the reading should say what remains unclear.

## Use optional controls

Everything here is optional. Open **Controls**:

- **Reading**: the default reading level; read again what is not ready; write the closing overview again; **Passage preparation** to split the conversation into passages again. Each says what it will cost before you press it.
- **Input and speakers**: change the title or source; compare and confirm a matched source, or use a different link; edit the text; under **Speakers**, see where the speaker labels came from and how each name was found, change a name if you want to (a name you give is kept; readings that used the old name are marked out of date), and correct who said each turn. When the text came without speaker names, **Find who is speaking** offers two ways: from the words (a few model passes on your key), or **Separate voices from the recording** (the episode's audio goes to Deepgram on your Deepgram key, and only the speaker labels come from it; every word of your text stays). If the app tried the recording by itself and couldn't use it, or did not try it (no recording found, audio kept on your computer, no Deepgram key), the reason is shown here and in the downloads.
- **App and files**: your model key, audio-to-text settings, downloads, version details, and **Move this reading to the trash**.

Sources for a claim are handled beside the claim, under **Evidence → Sources and search**: search, attach a link, accept or reject a suggestion, say what a source does for the claim, or withdraw it.

Your saved readings are under **Readings**, with **New reading** at the top. **Downloads** gives a readable Markdown version (readings that couldn't be completed are left out and named) and the full record as JSON, including every attempt at each reading.

## Know where work goes

- **On your computer:** everything you paste or upload, every reading, every source decision and every earlier version, as plain files in the app's `data` folder. Copy that folder to back it up. Deleted readings go to `data/trash`.
- **Sent to Anthropic:** the text being read, when a reading, review or overview is made, and once per text to find who each speaker is (twice when the first answer can't be used), using your key. Each of those is a charge on your Anthropic account. A typical passage takes one reading and one review.
- **Sent to Deepgram:** the audio, when you choose Deepgram for audio-to-text (for a podcast's audio or a recording you upload), when you ask it to separate voices, and by itself when a podcast link's transcript has no speaker names and a Deepgram key is set (not if you chose to keep audio on your computer). Billed to your Deepgram key.
- **Sent to search services:** a short search query per checkable claim, to Crossref, PubMed, OpenAlex and GDELT. Free.
- Your keys are kept in the `.env` file in the app folder. The page never shows them.

## Get unstuck

- **It asks for a key.** Paste your Anthropic key once. Get one at console.anthropic.com. If the key is refused, use **Replace the model key**.
- **The link gives no transcript.** The app lists what it tried. Paste the transcript, upload a caption file, or choose audio-to-text.
- **"This reading couldn't be completed."** The reading did not pass its checks after the app corrected the parts the review found wrong. Open **Evidence** on that passage to see why, in plain words, next to the passage. Press **Try again** at the top to read all of them again. When only the fifth-grade wording failed, the card shows the high-school reading and says so at Fifth grade.
- **"Out of date".** The text or a speaker changed after that reading was made. Press **Read again**; the earlier reading is kept in the history.
- **Stop.** Stop cancels the request in progress. If the model had already started on it, that request may still be billed. Finished readings are kept; press **Resume reading** to continue.
- **The app was closed or restarted.** Open it again. Finished readings are kept, and **Resume reading** continues from where it stopped.
