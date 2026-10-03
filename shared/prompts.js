/* Canonical prompts used by automatic server processing and optional page controls. */
(function(root,factory){
  if(typeof module === "object" && module.exports) module.exports = factory();
  else root.DeflatePrompts = factory();
})(typeof self !== "undefined" ? self : this, function(){
"use strict";
var P = {};
function speakerLines(run){ return (run.speakers||[]).map(function(s){ return "- " + s.key + (s.name && s.name !== s.key ? " (" + s.name + ")" : "") + (s.bio ? ": " + s.bio : ""); }).join("\n") || "(no bios given)"; }
P.audit = function(run, turnsText){
  return "You are checking speaker attribution in an interview transcript. Transcription services often shift or swap the labels, so a line can be labeled with the wrong speaker.\n\nSpeakers and short bios:\n" + speakerLines(run) +
  "\n\nBelow are numbered turns with their current labels. Flag ONLY turns whose content conflicts with the label: a self-reference to a job, biography, family, book, business or earlier statement that fits a different speaker; a question answered under the same label it was asked with; a direct address by name. Do not flag on style or opinion alone. When many consecutive turns look shifted by one, say so in 'shift'.\n\nReply with only JSON of this exact shape:\n{\"flags\":[{\"turn\":12,\"labeled\":\"LABEL\",\"likely\":\"LABEL or UNSURE\",\"confidence\":0.9,\"cue\":\"the words that gave it away, under 20 words\"}],\"shift\":{\"detected\":false,\"note\":\"\"}}\n\nTurns:\n" + turnsText;
};
P.segment = function(run, turnsText){
  return "Split this transcript section into passages. A passage is one argument or one topic exchange: a claim and the back-and-forth around it. Skip small talk, logistics and ads unless a checkable claim is made. Aim for 3 to 25 turns per passage; a long monologue may be its own passage. Titles are neutral and name the topic, never a verdict.\n\nReply with only JSON of this exact shape:\n{\"passages\":[{\"title\":\"4 to 8 words\",\"turnStart\":41,\"turnEnd\":52,\"stake\":\"one sentence: the claim or question at issue\"}]}\n\nTurn numbers are in brackets; use them exactly.\n\nTurns:\n" + turnsText;
};
P.deflate = function(run, passage, turnsText){
  return "You are a deflation reader. Take one passage of an interview and (1) rewrite what is argued in plain language, (2) check your rewrite for fidelity, (3) name the single step where the argument jumps, if it does, (4) argue the speaker's side from the quoted words alone, (5) revise your challenge if the defense shows it overreached, and (6) grade each claim on its own. Grade claims, never people. Keep a neutral register: no mockery, and avoid loaded words such as costume, demolition, tell, nonsense, debunk.\n\n" +
  "Two reading levels for EVERY text you write:\n- hs: a careful senior-high-school reader. Plain and precise. Keep every 'only if' and 'in part' the speaker used.\n- g5: a ten-year-old. Short sentences, concrete words, no jargon. If a claim cannot be simplified this far without becoming wrong, get as close as you can and say in fidelity.notes.g5 what was lost.\n\n" +
  "Fidelity rules: the deflation must not add certainty, motives, or content the speaker did not say. 'I am not an X' is not 'I cannot judge X'. 'He was concerned about Y' is not 'he was about to reveal Y'. Accepting an added explanation ('Oh, definitely') is not withdrawing the original claim. After writing, list every place your rewrite is firmer, weaker, or different from the spoken words, then grade: faithful | adds | strengthens | softens.\n\n" +
  "Claim types: fact (empirical, supported in general knowledge) | contested (empirical, evidence mixed or disputed) | unsupported (empirical, no support offered and none known to you) | interpretation (a reading of a text, event or data) | value (a moral or aesthetic judgment) | image (a metaphor or frame that carries meaning but is not offered as evidence; say what it helps explain) | unscorable (too vague or unbounded to grade as stated; say what would make it scorable). A metaphor is not 'empty': decide whether the speaker uses it as evidence (then grade the inference) or as a picture (then type it image). You cannot browse: mark every empirical claim status \"unchecked\" and say what source would settle it.\n\n" +
  "For every empirical claim (fact, contested, unsupported) also give expectedSources: one or two of [academic_paper, survey_report, government_data, agency_report, news_coverage, book_or_edition, company_statement, transcript_or_recording, federal_court_filing, corporate_filing], and searchQuery: the four-to-eight-word query a reference librarian would type to find the settling document. For other claim types leave both empty.\n\n" +
  "Quote discipline: asSaid.quote and jump.pivot must be VERBATIM from the turns below (you may trim with …). The app checks them against the transcript.\n\n" +
  "For every claim also write plain: what the claim says, restated at both levels (hs, g5) with the same hedges and the same uncertainty; and settle: what evidence would settle it, at both levels. The claim's text field is the canonical wording and must not be simplified.\n\n" +
  "Reply with ONLY JSON of this exact shape:\n" +
  "{\"asSaid\":[{\"turn\":41,\"speaker\":\"LABEL\",\"quote\":\"verbatim, under 70 words, … to trim\"}],\n" +
  " \"deflated\":{\"hs\":\"\",\"g5\":\"\"},\n" +
  " \"fidelity\":{\"grade\":\"faithful|adds|strengthens|softens\",\"notes\":{\"hs\":\"\",\"g5\":\"\"}},\n" +
  " \"jump\":{\"present\":true,\"pivot\":\"verbatim words where it turns\",\"hs\":\"\",\"g5\":\"\"},\n" +
  " \"defense\":{\"hs\":\"\",\"g5\":\"\"},\n" +
  " \"revision\":{\"jumpSurvives\":\"yes|partly|no\",\"hs\":\"\",\"g5\":\"\"},\n" +
  " \"claims\":[{\"text\":\"one claim in the speaker's terms\",\"speaker\":\"LABEL\",\"type\":\"fact|contested|unsupported|interpretation|value|image|unscorable\",\"plain\":{\"hs\":\"\",\"g5\":\"\"},\"basis\":{\"hs\":\"\",\"g5\":\"\"},\"status\":\"unchecked\",\"wouldSettle\":\"what source or test would settle it\",\"settle\":{\"hs\":\"\",\"g5\":\"\"},\"expectedSources\":[\"academic_paper\"],\"searchQuery\":\"\"}],\n" +
  " \"judgments\":{\"evidence\":\"strong|mixed|weak|none|n/a\",\"inference\":\"valid|gap|unfalsifiable|n/a\"}}\n\n" +
  "Speakers:\n" + speakerLines(run) + "\n\nPassage title: " + (passage.title||"") + "\nAt stake: " + (passage.stake||"") + "\n\nTurns (numbers in brackets):\n" + turnsText;
};
P.patterns = function(run, passages){
  var blocks = passages.map(function(p){
    var a = p.analysis || {};
    return "### " + p.id + " \"" + (p.title||"") + "\" (turns " + p.turnStart + "–" + p.turnEnd + ")\n" +
      "In plain words: " + (a.deflated && a.deflated.hs || "") + "\n" +
      (a.jump && a.jump.present ? "Where it jumps (the critique): " + (a.jump.hs||"") + (a.jump.pivot ? " [pivot: \"" + a.jump.pivot + "\"]" : "") + "\n" : "No jump.\n") +
      "In fairness to the speaker (the strongest defense, from the quoted words): " + (a.defense && a.defense.hs || "") + "\n" +
      "After the defense (the revised judgment; jump survives: " + (a.revision && a.revision.jumpSurvives || "—") + "): " + (a.revision && a.revision.hs || "") + "\n" +
      "Fidelity of the rewrite: " + (a.fidelity && a.fidelity.grade || "?") + " · evidence: " + (a.judgments && a.judgments.evidence || "?") + " · inference: " + (a.judgments && a.judgments.inference || "?") + "\n" +
      "Claims:\n" + (a.claims||[]).map(function(c){ return "  - [" + c.type + "] " + (c.speaker ? c.speaker + ": " : "") + c.text; }).join("\n");
  }).join("\n\n");
  return "Below are the full results of deflating " + passages.length + " passages from one interview (cards marked stale were left out). Each card gives the critique, the strongest defense, and the revised judgment after the defense; respect the revised judgment: where the revision says the jump partly stands or does not stand, treat the critique as partly or wholly withdrawn and do not count it as a pattern on its own. Find the argumentative moves that recur across passages (for example: evidence attached to a conclusion it cannot carry; replacing a claim with a judgment about the people who make it; a definition widened until it no longer distinguishes anything; false dichotomies; hearsay chains). Name each pattern neutrally, quote or point to the passage ids that show it (only ids listed below), and keep to patterns that appear at least twice. Then list what survived: arguments or claims that came through deflation intact. Credit them plainly. Grade moves, never people.\n\nTwo reading levels for every text: hs (careful senior-high reader) and g5 (ten-year-old; short concrete sentences).\n\nReply with ONLY JSON of this exact shape:\n{\"patterns\":[{\"title\":{\"hs\":\"\",\"g5\":\"\"},\"body\":{\"hs\":\"\",\"g5\":\"\"},\"passages\":[\"p001\",\"p004\"]}],\"survived\":{\"hs\":\"\",\"g5\":\"\"}}\n\nPassages:\n\n" + blocks;
};
P.transcribe = "Transcribe all text in the attached image(s) exactly as written, including any attribution line (who said it, where, when). Keep line breaks. If an image contains no text, write [no text]. Separate images with a line containing only ---. Reply with the transcription only.";

P.claim = function(run, text){
  return "You are a deflation reader grading ONE claim exactly as a person typed it. Do not reword the claim. Say in plain language what it asserts, type it, say what would settle it, name the source types and a search query a reference librarian would use. Keep a neutral register. You cannot browse.\n\n" +
  "Two reading levels for EVERY text you write: hs (a careful senior-high reader) and g5 (a ten-year-old; short concrete sentences).\n\n" +
  "Claim types: fact (empirical, supported in general knowledge) | contested (empirical, evidence mixed or disputed) | unsupported (empirical, no support known to you) | interpretation | value | image | unscorable (say what would make it scorable).\n" +
  "expectedSources: one or two of [academic_paper, survey_report, government_data, agency_report, news_coverage, book_or_edition, company_statement, transcript_or_recording, federal_court_filing, corporate_filing]. searchQuery: four to eight words.\n\n" +
  "Reply with ONLY JSON of this exact shape:\n{\"deflated\":{\"hs\":\"what the claim asserts, in plain words, with every hedge the claim has\",\"g5\":\"\"},\"type\":\"fact|contested|unsupported|interpretation|value|image|unscorable\",\"basis\":{\"hs\":\"why this type\",\"g5\":\"\"},\"wouldSettle\":\"\",\"settle\":{\"hs\":\"what evidence would settle it\",\"g5\":\"\"},\"expectedSources\":[\"academic_paper\"],\"searchQuery\":\"\",\"judgments\":{\"evidence\":\"n/a\",\"inference\":\"valid|gap|unfalsifiable|n/a\"}}\n\nThe claim:\n" + text;
};
return P;
});
