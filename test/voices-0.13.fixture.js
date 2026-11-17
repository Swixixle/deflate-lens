"use strict";
/* The 0.13 voices test conversation and the recording's synthetic answer for it, shared by the voices tests (see
   test/voices-0.13.test.js for what each part stands for). Invented people. */
const shared = require("../shared/transcript");

const HOST = 0, GUEST = 1;
/* The conversation as it was spoken: who said each stretch. The interruption is one sentence shared by two people. */
const TRUTH = [
  [HOST, "Welcome back to the show. Today we are talking about the new transit survey that the city released last month. My guest studied it closely. Dana, thanks for joining me."],
  [GUEST, "Thanks for having me. My name is Dana Reyes, and I run the survey lab at the university. We looked at the raw responses, not just the summary."],
  [HOST, "So what did the survey actually cover?"],
  [GUEST, "It covered four hundred households in three neighborhoods. That is a small sample for a city this size, and the neighborhoods were chosen because they already had bus lanes."],
  [HOST, "Right."],
  [GUEST, "So when the report says riders everywhere support more lanes, it is stretching what four hundred households can tell you."],
  [HOST, "But the mayor's office says the results are clear."],
  [GUEST, "The results are clear for those three neighborhoods. They are not clear for the whole city, and the report does not say how people were contacted. Nobody outside the office has seen the questionnaire either."],
  [HOST, "I was going to ask about the budget for —"],
  [GUEST, "Sorry, the budget for which year —"],
  [HOST, "for next year, which doubles the lane program."],
  [GUEST, "If the budget doubles on the strength of this survey, that is a decision resting on a narrow sample."],
  [HOST, "We will leave it there. Dana Reyes, thank you."],
];
/* The text as an unlabeled transcript shows it: paragraph breaks that do not follow the turns (two turns in one
   paragraph, one turn across two, the interruption in one line). */
const T = TRUTH.map(x => x[1]);
const TEXT = [T[0] + " " + T[1], T[2], T[3] + " " + T[4] + " " + T[5], T[6],
  "The results are clear for those three neighborhoods. They are not clear for the whole city,", "and the report does not say how people were contacted. Nobody outside the office has seen the questionnaire either.",
  T[8] + " " + T[9] + " " + T[10], T[11] + " " + T[12]].join("\n\n");

/* Deepgram's answer for that conversation: every 13th word misheard, every 29th dropped, a filler every 31st, "four
   hundred" written as 400 once; the first word of a turn often still carries the previous voice (twice, the first two
   words), and one word mid-sentence flickers to the other voice. Punctuation is Deepgram's own (from the audio), so a
   misheard word keeps its full stop and a missed word's full stop lands on the word before. Timing: 0.05 s between
   words, 0.3 s between sentences, 0.6 s between turns (a pause the recording hears before a new speaker). */
function recording(truth, opts) {
  const o = Object.assign({ substitute: 13, drop: 29, filler: 31, jitter: true, flicker: true, turnPause: 0.6, sentencePause: 0.3 }, opts);
  const out = []; let n = 0, t = 0, turnNo = 0, prevSpeaker = null;
  for (const [speaker, text] of truth) {
    if (turnNo) t += o.turnPause;
    let ws = text.split(/\s+/).filter(w => shared.wordsOf(w));
    if (/four hundred households can/.test(text)) { const i = ws.findIndex((w, k) => w === "four" && ws[k + 1] === "hundred"); ws.splice(i, 2, "400"); }
    ws.forEach((w, k) => {
      n++;
      if (o.drop && n % o.drop === 0) { const end = /[.?!]+$/.exec(w); if (end && out.length) out[out.length - 1].punctuated_word += end[0]; return; } // a missed word's full stop lands on the word before
      if (o.filler && n % o.filler === 0) out.push({ word: "uh", punctuated_word: "uh", speaker, start: t, end: t + 0.2, confidence: 0.5, speaker_confidence: 0.5 }), t += 0.25;
      let who = speaker;
      if (o.jitter && prevSpeaker !== null && prevSpeaker !== speaker && (k === 0 || k === 1 && turnNo % 4 === 1) && ws.length > 3) who = prevSpeaker;
      if (o.flicker && /Nobody outside the office/.test(text) && w === "outside") who = 1 - speaker;
      const heard = o.substitute && n % o.substitute === 0 ? "misheard" + ((/[.?!,]+$/.exec(w) || [""])[0]) : w; // punctuation comes from the audio, not the word
      out.push({ word: shared.wordsOf(heard), punctuated_word: heard, speaker: who, start: t, end: t + 0.3, confidence: 0.9, speaker_confidence: 0.8 });
      t += 0.35 + (/[.?!]["”')]*$/.test(w) ? o.sentencePause : 0);
    });
    prevSpeaker = speaker; turnNo++;
  }
  return { metadata: { request_id: "req-test-1", duration: Math.round(t), models: ["nova-3-test"] }, results: { channels: [{ alternatives: [{ transcript: out.map(w => w.punctuated_word).join(" "), words: out }] }] } };
}

module.exports = { HOST, GUEST, TRUTH, T, TEXT, recording };
