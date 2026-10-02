/* Deflate Lens, browser side. Talks to the local server (server/app.js) over /api. No keys live here. */
(function(){
"use strict";
var SH = window.DeflateShared;
var parseTranscript = SH.parseTranscript, speakerLabels = SH.speakerLabels, verifyQuote = SH.verifyQuote, attrSig = SH.attrSig, chunkRanges = SH.chunkRanges;

/* ---------- utilities ---------- */
function h(tag, props){
  var el = document.createElement(tag);
  if (props) for (var k in props){
    if (k === "class") el.className = props[k];
    else if (k === "text") el.textContent = props[k];
    else if (k.slice(0,2) === "on") el.addEventListener(k.slice(2), props[k]);
    else if (k === "hidden") el.hidden = !!props[k];
    else if (props[k] !== null && props[k] !== undefined) el.setAttribute(k, props[k]);
  }
  for (var i = 2; i < arguments.length; i++){
    var c = arguments[i];
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) c.forEach(function(x){ if (x) el.append(x); });
    else el.append(c);
  }
  return el;
}
function clear(el){ while (el.firstChild) el.removeChild(el.firstChild); }
function nowISO(){ return new Date().toISOString(); }
function fmtDate(iso){ try { return new Date(iso).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}); } catch(e){ return iso || ""; } }
function pad(n){ return String(n).padStart(3,"0"); }
function lvl(obj){
  var hs = (obj && typeof obj === "object") ? (obj.hs || "") : (obj || "");
  var g5 = (obj && typeof obj === "object") ? (obj.g5 || "") : (obj || "");
  var wrap = h("div", {class:"lvl"});
  var a = h("div", {class:"lvl-hs"}); paras(a, hs);
  var b = h("div", {class:"lvl-5"}); paras(b, g5 || hs);
  wrap.append(a, b);
  return wrap;
}
function paras(el, text){ String(text||"").split(/\n{2,}|\n/).forEach(function(t){ if (t.trim()) el.append(h("p",{text:t.trim()})); }); }
function levelToggle(target){
  var seg = h("div", {class:"seg small", role:"group", "aria-label":"Reading level for this section"});
  [["inherit","Follow page"],["hs","High school"],["5","Fifth grade"]].forEach(function(o){
    var b = h("button", {type:"button", text:o[1], "aria-pressed": o[0]==="inherit" ? "true":"false", onclick:function(){
      if (o[0] === "inherit") target.removeAttribute("data-level"); else target.setAttribute("data-level", o[0]);
      seg.querySelectorAll("button").forEach(function(x){ x.setAttribute("aria-pressed","false"); });
      b.setAttribute("aria-pressed","true");
    }});
    seg.append(b);
  });
  return seg;
}
function errCopy(e){
  var c = e && e.code;
  var map = {
    no_ai:"No model is configured on the server. Add ANTHROPIC_API_KEY to .env and restart.",
    bad_key:"The server's API key was rejected. Check ANTHROPIC_API_KEY in .env.",
    rate_limited:"Too many requests right now. Wait a minute and try again.",
    prompt_too_large:"That section is too large for one request. Shorten the transcript or split it.",
    invalid_json:"The model's reply was not well-formed. Try again once; if it repeats, the passage may need splitting.",
    cancelled:"Stopped.",
    stale_reading:"This card changed since you looked (another tab, a re-run, or an edit). It has been reloaded; try again.",
    claim_not_current:"That claim is no longer in the current reading of this card. The page has been reloaded.",
    claim_edited:"The claim was edited while the explanation ran. Run it again on the current wording.",
    upstream_error:"The model request failed. Check the server terminal for details and try again."
  };
  return map[c] || ((e && e.message) ? String(e.message) : "Something failed.");
}
function copyText(txt, btn){
  var done = function(ok){ var old = btn.textContent; btn.textContent = ok ? "Copied" : "Select and copy"; setTimeout(function(){ btn.textContent = old; }, 1600); };
  try { navigator.clipboard.writeText(txt).then(function(){ done(true); }, function(){ done(false); }); } catch(e){ done(false); }
}
function download(filename, text, type){
  var blob = new Blob([text], {type: type || "application/json"});
  var a = h("a", {href: URL.createObjectURL(blob), download: filename}); document.body.append(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

var SOURCE_TYPES = ["corporate_filing","congressional_record","hearing_transcript","federal_court_filing","state_court_filing","regulatory_rule","regulatory_comment","campaign_finance_record","lobbying_disclosure","agency_report","news_coverage","long_form_journalism","academic_paper","patent","government_data","investigative_document","network_record","federal_contract","book_or_edition","company_statement","survey_report","transcript_or_recording"];
var REJECTION_REASONS = [["does_not_address_claim","Does not address the claim"],["wrong_document_type","Wrong kind of document"],["no_primary_source","Not a primary source"],["out_of_date_window","Outside the relevant period"],["retracted_or_corrected","Retracted or corrected"],["duplicate","Duplicate of an accepted source"],["below_score_threshold","Too weak to count"]];
var EMPIRICAL = ["fact","contested","unsupported","claim"];

/* ---------- API ---------- */
var API = {
  async req(method, url, body, signal){
    var res = await fetch(url, {method:method, headers: body ? {"Content-Type":"application/json"} : {}, body: body ? JSON.stringify(body) : undefined, signal:signal});
    var data = null; try { data = await res.json(); } catch(e){}
    if (!res.ok){ var err = new Error(data && (data.error || data.reason) || ("HTTP " + res.status)); err.code = data && data.code; err.text = data && data.text; err.status = res.status; err.data = data; throw err; }
    return data;
  },
  health(){ return API.req("GET","/api/health"); },
  listRuns(){ return API.req("GET","/api/runs"); },
  getRun(id){ return API.req("GET","/api/runs/" + id); },
  createRun(run, transcript){ return API.req("POST","/api/runs", {run:run, transcript:transcript}); },
  saveRun(id, run, transcript){ return API.req("PUT","/api/runs/" + id, {run:run, transcript:transcript}); },
  deleteRun(id){ return API.req("DELETE","/api/runs/" + id); },
  duplicateRun(id){ return API.req("POST","/api/runs/" + id + "/duplicate"); },
  savePassage(id, pid, doc){ return API.req("PUT","/api/runs/" + id + "/passages/" + pid, doc); },
  replacePassages(id, list){ return API.req("POST","/api/runs/" + id + "/passages", {passages:list}); },
  saveSummary(id, doc){ return API.req("PUT","/api/runs/" + id + "/summary", doc); },
  addAttachment(id, payload){ return API.req("POST","/api/runs/" + id + "/attachments", payload); },
  sample(prompt, opts){ opts = opts || {}; return API.req("POST","/api/sample", {prompt:prompt, json:!!opts.json, images:opts.images||[]}, opts.signal); },
  /* Every claim mutation names the claim by its id and the reading the page rendered; the server refuses (409) when
     the card moved on, instead of writing over a newer reading. */
  searchClaim(id, pid, cid, rev){ return API.req("POST","/api/runs/" + id + "/passages/" + pid + "/claims/" + cid + "/search", {expectedReadingRev:rev}); },
  acceptCandidate(id, pid, cid, cand, note, rev){ return API.req("POST","/api/runs/" + id + "/passages/" + pid + "/claims/" + cid + "/candidates/" + cand + "/accept", {note:note||"", expectedReadingRev:rev}); },
  rejectCandidate(id, pid, cid, cand, reason, detail, rev){ return API.req("POST","/api/runs/" + id + "/passages/" + pid + "/claims/" + cid + "/candidates/" + cand + "/reject", {reason:reason, detail:detail||"", expectedReadingRev:rev}); },
  addReceipt(id, pid, cid, url, note, rev){ return API.req("POST","/api/runs/" + id + "/passages/" + pid + "/claims/" + cid + "/receipts", {url:url, note:note||"", expectedReadingRev:rev}); },
  withdrawReceipt(id, pid, cid, rid, reason, rev){ return API.req("POST","/api/runs/" + id + "/passages/" + pid + "/claims/" + cid + "/receipts/" + rid + "/withdraw", {reason:reason||"", expectedReadingRev:rev}); },
  attachOrphan(id, oid, pid, cid){ return API.req("POST","/api/runs/" + id + "/orphans/" + oid + "/attach", {pid:pid, idx:cid}); },
  importUrl(url){ return API.req("POST","/api/import", {url:url}); },
  setKey(key){ return API.req("POST","/api/settings/anthropic-key", {key:key}); },
  saveRouting(id, pid, cid, routing, rev){ return API.req("PUT","/api/runs/" + id + "/passages/" + pid + "/claims/" + cid + "/routing", Object.assign({expectedReadingRev:rev}, routing)); },
  listTrash(){ return API.req("GET","/api/trash"); },
  restoreRun(name){ return API.req("POST","/api/trash/" + name + "/restore"); }
};
function fileToBase64(file){ return new Promise(function(resolve, reject){ var r = new FileReader(); r.onload = function(){ resolve(String(r.result).split(",")[1]); }; r.onerror = reject; r.readAsDataURL(file); }); }

/* ---------- prompts ---------- */
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

/* ---------- state ---------- */
var S = {health:null, ai:null, runs:[], runId:null, b:null, turns:[], busy:false, abort:null};
var UI = {collapsed:{}, turnsOpen:false, turnsPage:0, detailsOpen:{}};
var $ = function(id){ return document.getElementById(id); };
function setStore(cls, text){ $("storeChip").className = "chip " + cls; $("storeText").textContent = text; }
function run(){ return S.b && S.b.run; }
function overrides(){ var r = run(); return r && r.provenance && r.provenance.overrides || {}; }
function effSpeaker(t){ return SH.effSpeaker(t, overrides()); }
function speakerName(key){ var r = run(); var s = r && (r.speakers||[]).filter(function(x){ return x.key === key; })[0]; return (s && s.name) ? s.name : (key === "UNLABELED" ? "Speaker unknown" : key); }
function attributionOk(){ var r = run(), pr = r && r.provenance || {}; return !!(pr.confirmedAt || pr.notApplicable); }
function isClaimRun(){ var r = run(); return !!(r && r.kind === "claim"); }
function fmtTurns(from, to, ov){ return SH.fmtTurns(S.turns, ov === undefined ? overrides() : ov, from, to); }
function readOnly(){ var r = run(); return !!(r && r.example); }
function analyzedByLabel(){ return "deflate-lens local" + (S.ai ? " · " + (S.ai.mock ? "MOCK" : S.ai.model) : ""); }

/* reading level (global) */
function setLevel(l){
  document.body.classList.toggle("level-5", l === "5");
  if (S.b && typeof renderExportBlock === "function") renderExportBlock();
  $("lvlHS").setAttribute("aria-pressed", l === "hs" ? "true":"false");
  $("lvl5").setAttribute("aria-pressed", l === "5" ? "true":"false");
  try { localStorage.setItem("deflate-level", l); } catch(e){}
}
$("lvlHS").addEventListener("click", function(){ setLevel("hs"); });
$("lvl5").addEventListener("click", function(){ setLevel("5"); });
(function(){ var s = null; try { s = localStorage.getItem("deflate-level"); } catch(e){} if (s === "5") setLevel("5"); })();

/* ---------- boot ---------- */
async function boot(){
  try { S.health = await API.health(); } catch(e){ setStore("off","Cannot reach the local server. Is it running? (npm start)"); return; }
  S.ai = S.health.ai; S.research = S.health.research || null;
  setStore(S.ai ? "ready" : "busy", (S.ai ? (S.ai.mock ? "Server connected · MOCK model (placeholders only)" : "Server connected · " + S.ai.model) : "Server connected · example only until you add a key (asked for once)") + (S.research ? (S.research.mock ? " · MOCK research" : " · research: " + S.research.adapters.join(", ")) : ""));
  await refreshList();
  var want = hashRun() || rememberedRun();
  if (want && S.runs.some(function(r){ return r.id === want; })) selectRun(want);
}
function hashRun(){ var m = /^#run-([A-Za-z0-9_-]+)$/.exec(location.hash||""); return m ? m[1] : null; }
function rememberedRun(){ try { return localStorage.getItem("deflate-run"); } catch(e){ return null; } }
async function refreshList(){ try { S.runs = await API.listRuns(); } catch(e){ S.runs = []; } try { S.trash = await API.listTrash(); } catch(e){ S.trash = []; } renderRunList(); renderTrash(); }
function renderTrash(){
  var el = $("trash"); if (!el) return; clear(el);
  if (!(S.trash||[]).length){ el.hidden = true; return; }
  el.hidden = false;
  var det = h("details",{}, h("summary",{class:"hint",text:"Trash · " + plural(S.trash.length, "run")}));
  S.trash.forEach(function(t){ det.append(h("div",{class:"row",style:"padding:4px 6px"}, h("span",{class:"hint",text:(t.title || t.id) + " · " + fmtDate(t.deletedAt)}), h("button",{class:"btn quiet",type:"button",text:"Restore",onclick:async function(){ try { var out = await API.restoreRun(t.name); await refreshList(); selectRun(out.id); } catch(e){ alert(errCopy(e)); } }}))); });
  el.append(det);
}

/* ---------- runs rail ---------- */
function renderRunList(){
  var ul = $("runList"); clear(ul);
  if (!S.runs.length){ ul.append(h("li",{class:"hint",style:"padding:6px 10px",text:"No runs yet. Start one with New run."})); return; }
  S.runs.forEach(function(r){
    var li = h("li");
    var b = h("button",{type:"button","aria-current": r.id === S.runId ? "true":"false", onclick:function(){ selectRun(r.id); }},
      h("span",{class:"t"}, document.createTextNode(r.title || "Untitled run"), r.example ? h("span",{class:"badge example",text:"example"}) : null, r.kind === "claim" ? h("span",{class:"badge",text:"claim"}) : null),
      h("span",{class:"m",text:stageName(r.status) + " · " + fmtDate(r.createdAt) + (r.passageCount ? " · " + r.doneCount + "/" + r.passageCount + " passages" : "")}));
    li.append(b); ul.append(li);
  });
}
function stageName(s){ return ({draft:"Intake", attributed:"Attributed", segmented:"Segmented", analyzed:"Deflated", complete:"Complete"})[s] || s || "draft"; }
$("newRun").addEventListener("click", function(){
  S.runId = null; UI.detailsOpen = {};
  S.b = {run:{id:null, title:"", sourceUrl:"", sourceLabel:"", sourceDate:"", speakers:[], status:"draft", kind:"transcript", provenance:{overrides:{}, flags:[], notes:""}, createdAt:nowISO(), updatedAt:nowISO()}, transcript:"", passages:[], summary:null, attachments:[], attrSig:attrSig({})};
  S.pendingImport = null;
  S.turns = [];
  renderRunList(); renderRun();
});

/* ---------- selecting / reloading a run ---------- */
async function selectRun(id){
  if (id !== S.runId) UI.detailsOpen = {};
  S.runId = id;
  try { location.hash = "run-" + id; } catch(e){}
  try { localStorage.setItem("deflate-run", id); } catch(e){}
  await reload();
  renderRunList();
}
async function reload(bundle){
  if (!S.runId) return;
  try { S.b = bundle || await API.getRun(S.runId); } catch(e){ S.b = null; S.runId = null; renderRun(); return; }
  S.turns = parseTranscript(S.b.transcript || "", {mode: S.b.run && S.b.run.parseMode === "text" ? "text" : "transcript"});
  renderRun();
}

/* ---------- run view ---------- */
var view = $("runView"), welcome = $("welcome");
function renderRun(){
  var r = run();
  if (!r){ view.hidden = true; welcome.hidden = false; return; }
  welcome.hidden = true; view.hidden = false; clear(view);
  var head = h("div",{class:"row"},
    h("div",{}, h("p",{class:"eyebrow",text:"Run"}), h("h2",{style:"font-size:24px;font-weight:700"}, document.createTextNode(r.title || "Untitled run"), r.example ? h("span",{class:"badge example",style:"margin-left:10px",text:"supplied example · read-only"}) : null)),
    h("span",{class:"spacer"}),
    r.id && r.example ? h("button",{class:"btn primary",type:"button",text:"Copy as a new run",onclick:async function(){ try { var nb = await API.duplicateRun(r.id); await refreshList(); selectRun(nb.run.id); } catch(e){ alert(errCopy(e)); } }}) : null,
    r.id && !r.example ? h("button",{class:"btn quiet danger",type:"button",text:"Move to trash",onclick:confirmDelete}) : null);
  view.append(head);
  if (r.example) view.append(h("div",{class:"note info"}, h("p",{text:"This run ships with the app as an example. Its analysis was written in chat by Claude on 2 October 2026 and corrected after a second-reader review; its attribution came from content cues and has not been confirmed by a person. It cannot be edited here. Copy it to confirm attribution, add receipts, or re-run passages with your own model."})));
  if (r.copiedFrom) view.append(h("p",{class:"hint",text:"Copied from " + r.copiedFrom + " on " + fmtDate(r.copiedAt) + ". Passages carried over keep their original analyzedBy; anything you re-run is labeled with your model."}));
  view.append(renderIntake());
  if (!isClaimRun()) view.append(renderProvenance());
  view.append(renderDeflate());
  if (!isClaimRun()) view.append(renderPatternsPanel());
  view.append(renderExport());
  renderPassages(); renderDeflateList(); renderPatterns(); renderExportBlock();
}
function panel(id, num, title, state, open){
  if (UI.collapsed[id] !== undefined) open = !UI.collapsed[id];
  var p = h("section",{class:"panel" + (open ? "" : " collapsed"), id:id});
  var caret = h("span",{class:"caret",text: open ? "Hide" : "Show"});
  var hd = h("header",{onclick:function(){ p.classList.toggle("collapsed"); UI.collapsed[id] = p.classList.contains("collapsed"); caret.textContent = UI.collapsed[id] ? "Show" : "Hide"; }},
    h("span",{class:"num",text:num}), h("h2",{text:title}), h("span",{class:"state" + (state && /done|confirmed|complete/i.test(state) ? " done":""),text:state||""}), caret);
  p.append(hd); p.append(h("div",{class:"body"}));
  return p;
}
function body(p){ return p.querySelector(".body"); }

/* ---- 1 Intake: paste what you have and go ----
   One box first. The kind of input is read from the text (a claim, a transcript, a link); everything else is optional
   context under a fold. A link is fetched through the importer, which either returns readable text or says why not. */
function describeKind(text, labels){
  var d = SH.detectKind(text);
  if (d.kind === "empty") return {d:d, text:"Paste a claim, a quote, a transcript, or a link.", go:"Go"};
  if (d.kind === "link") { var host = ""; try { host = new URL(d.url).hostname; } catch(e){} return {d:d, text:"Looks like a link to " + host + ". It will be fetched and its readable text put here for you to check.", go:"Fetch the link"}; }
  if (d.kind === "claim") return {d:d, text:"Looks like a claim or a quote. It becomes one checkable claim with a search query made for it and is searched at once; no title, date or speaker needed.", go:"Check this claim"};
  var turns = SH.parseTranscript(text, {mode: d.labels.length ? "transcript" : "text"}).filter(function(t){ return !t.heading; }).length;
  if (!d.labels.length) return {d:d, text:"Looks like text with no speaker labels: " + plural(d.paragraphs, "paragraph") + ". It will be read as Speaker unknown; nothing to attribute.", go:"Save and continue"};
  return {d:d, text:"Looks like a transcript: " + plural(d.labels.length, "speaker") + " (" + d.labels.join(", ") + "), " + plural(turns, "turn") + "." + (d.labels.length > 1 ? " Who said what gets checked before anything is graded." : ""), go:"Save and continue"};
}
function renderIntake(){
  var r = run(), ro = readOnly(), isNew = !r.id;
  var open = isNew || !S.turns.length;
  var p = panel("stage-intake","1", isNew ? "Start" : "Input", r.id ? (S.turns.length ? "Saved · " + plural(S.turns.filter(function(t){return !t.heading;}).length, "turn") : "Saved") : "", open);
  var b = body(p);
  var ta = h("textarea",{id:"f-text",placeholder:"Paste a claim, quote, transcript, or link.",disabled:ro?"":null, style:"min-height:" + (isNew ? "160px" : "120px")});
  ta.value = S.b.transcript || "";
  var file = h("input",{id:"f-file",type:"file",accept:".txt,.md,.srt,.vtt,.json,text/plain"}); file.style.display = "none";
  file.addEventListener("change", function(){ var f = file.files && file.files[0]; if (!f) return; f.text().then(function(t){ ta.value = (ta.value.trim() ? ta.value.trim() + "\n\n" : "") + t; updateStats(); }); });
  var stats = h("p",{class:"hint", id:"f-kind"});
  b.append(h("div",{class:"field"}, ta));
  var speakers = (r.speakers||[]).map(function(s){ return Object.assign({}, s); });
  var kindNow = null;
  function updateStats(){
    var k = describeKind(ta.value); kindNow = k.d;
    stats.textContent = k.text; if (go) go.textContent = isNew ? k.go : "Save changes";
    syncSpeakers(k.d.kind === "transcript" ? k.d.labels : []);
  }
  var msg = h("div");
  var go = null;
  if (!ro){
    go = h("button",{class:"btn primary",type:"button",text:"Go",onclick:async function(){ await onGo(); }});
    b.append(h("div",{class:"row"}, go, h("label",{class:"btn",for:"f-file",text:"Upload a file"}), file, stats), msg);
  } else b.append(stats);

  // optional context
  var ctx = h("details",{class:"ctx", open: (!isNew && (r.sourceUrl || r.sourceDate || (r.speakers||[]).some(function(s){ return s.bio; }))) ? "" : null}, h("summary",{text:"Add context · optional"}));
  var title = h("input",{id:"f-title",type:"text",value:r.title||"",placeholder:"Optional. Made from the text if left empty.",disabled:ro?"":null});
  var url = h("input",{id:"f-url",type:"url",value:r.sourceUrl||"",placeholder:"Optional. Where the words come from; shown at the end.",disabled:ro?"":null});
  var label = h("input",{id:"f-label",type:"text",value:r.sourceLabel||"",placeholder:"Optional. e.g. The Joe Rogan Experience #2308",disabled:ro?"":null});
  var date = h("input",{id:"f-date",type:"date",value:r.sourceDate||"",disabled:ro?"":null});
  ctx.append(h("div",{class:"grid2"}, h("div",{class:"field"},h("label",{for:"f-title",text:"Title (optional)"}),title), h("div",{class:"field"},h("label",{for:"f-date",text:"Date (optional)"}),date)));
  ctx.append(h("div",{class:"grid2"}, h("div",{class:"field"},h("label",{for:"f-url",text:"Source link (optional)"}),url), h("div",{class:"field"},h("label",{for:"f-label",text:"Source label (optional)"}),label)));
  var spWrap = h("div",{class:"speakers"});
  var spBlock = h("div",{}, h("p",{class:"eyebrow",style:"margin-bottom:6px",text:"Speakers (optional)"}), h("p",{class:"hint",style:"margin-bottom:8px",text:"Labels are read from the text. A display name is cosmetic. A one-line bio (job, books, family, role on the show) makes the who-said-what check sharper; without one the check still runs on the words alone."}), spWrap);
  ctx.append(spBlock);
  if (!ro && S.ai && !S.ai.mock){
    var img = h("input",{id:"f-img",type:"file",accept:"image/png,image/jpeg,image/webp,image/gif",multiple:true}); img.style.display = "none";
    var imgBtn = h("label",{class:"btn",for:"f-img",text:"Add pictures (screenshots, quotes)"});
    var imgNote = h("span",{class:"hint",text:"Pictures are transcribed by the model and appended to the text as a turn labeled IMAGE, and kept with the run (save first)."});
    img.addEventListener("change", async function(){
      var files = Array.prototype.slice.call(img.files||[]).slice(0, 8); if (!files.length) return;
      imgBtn.textContent = "Transcribing…";
      try {
        var images = []; for (var i = 0; i < files.length; i++) images.push({mediaType: files[i].type, data: await fileToBase64(files[i])});
        var res = await API.sample(P.transcribe, {images: images});
        var pieces = String(res.text||"").split(/\n---\n/);
        ta.value = (ta.value.trim() ? ta.value.trim() + "\n\n" : "") + pieces.map(function(t,i){ return "IMAGE " + (i+1) + ": " + t.trim(); }).join("\n\n"); updateStats();
        if (r.id) for (var j = 0; j < files.length; j++){ try { await API.addAttachment(r.id, {name:files[j].name||"", mediaType:files[j].type, data:images[j].data, transcribedText:(pieces[j]||"").trim()}); } catch(e){} }
        else imgNote.textContent = "Transcription added. Save, then add pictures again if you want them kept with the run.";
      } catch(e){ imgNote.textContent = errCopy(e); }
      imgBtn.textContent = "Add pictures (screenshots, quotes)"; img.value = "";
    });
    ctx.append(h("div",{class:"row"}, imgBtn, img, imgNote));
  }
  b.append(ctx);
  function syncSpeakers(labels){
    labels.forEach(function(k){ if (!speakers.some(function(s){ return s.key === k; })) speakers.push({key:k, name:k === "UNLABELED" ? "Speaker unknown" : k.split(" ").map(function(w){ return w[0] + w.slice(1).toLowerCase(); }).join(" "), bio:""}); });
    if (labels.length) speakers = speakers.filter(function(s){ return labels.indexOf(s.key) !== -1; });
    clear(spWrap);
    if (!speakers.length){ spWrap.append(h("p",{class:"hint",text:"No speaker labels in the text yet. Lines that start with NAME: become turns for that speaker."})); spBlock.hidden = isNew && !speakers.length ? false : false; return; }
    speakers.forEach(function(s){
      var name = h("input",{type:"text",value:s.name||"",placeholder:"Display name (optional)",disabled:ro?"":null}); name.addEventListener("input",function(){ s.name = name.value; });
      var bio = h("input",{type:"text",value:s.bio||"",placeholder:"Bio (optional): job, books, family, role",disabled:ro?"":null}); bio.addEventListener("input",function(){ s.bio = bio.value; });
      spWrap.append(h("div",{class:"speaker"}, h("span",{class:"key",text:s.key === "UNLABELED" ? "no label" : s.key}), name, bio, h("span")));
    });
  }
  updateStats();
  ta.addEventListener("input", updateStats);
  if (!isNew && r.import) b.append(h("p",{class:"hint",text:"Fetched from " + r.import.url + " on " + fmtDate(r.import.fetchedAt) + " (" + r.import.chars.toLocaleString() + " characters, " + r.import.method + "). The text above is what was read; the link itself was not graded."}));

  async function onGo(){
    if (!go) return; go.disabled = true; clear(msg);
    var text = ta.value, k = kindNow || describeKind(text).d;
    try {
      if (k.kind === "empty"){ msg.append(h("div",{class:"note",text:"Nothing to work with yet. Paste a claim, a quote, a transcript, or a link."})); go.disabled = false; return; }
      if (isNew && k.kind === "link"){
        msg.append(h("div",{class:"note info",text:"Fetching " + k.url + "…"}));
        var imp = null;
        try { imp = await API.importUrl(k.url); } catch(e){ imp = {ok:false, reason: errCopy(e)}; }
        clear(msg);
        if (imp && imp.ok){
          ta.value = imp.text; if (!url.value) url.value = imp.url || k.url; if (!label.value && imp.title) label.value = imp.title; S.pendingImport = {url: imp.url || k.url, title: imp.title || "", fetchedAt: imp.fetchedAt, chars: imp.chars, method: imp.method};
          updateStats();
          msg.append(h("div",{class:"note ok",text:"Read " + imp.chars.toLocaleString() + " characters" + (imp.title ? " from “" + imp.title + "”" : "") + ". Check the text, trim what is not the interview, then click " + (go.textContent || "Go") + ". Nothing was graded yet; only the page text was fetched."}));
        } else {
          msg.append(h("div",{class:"note",text:(imp && imp.reason) || "Could not read that link."}), h("p",{class:"hint",text:"The link is kept as the source if you add it under Add context. Paste the transcript, or upload a .txt, .srt or .vtt file."}));
          if (!url.value) url.value = k.url;
        }
        go.disabled = false; return;
      }
      var doc = {title: title.value.trim(), sourceUrl: url.value.trim(), sourceLabel: label.value.trim(), sourceDate: date.value || "", speakers: speakers.filter(function(s){ return s.key; })};
      if (!doc.title) delete doc.title;
      if (S.pendingImport) doc.import = S.pendingImport;
      if (isNew){
        if (k.kind === "claim") doc.kind = "claim";
        var nb = await API.createRun(doc, text);
        S.pendingImport = null; await refreshList();
        S.runId = nb.run.id; UI.detailsOpen = {}; try { location.hash = "run-" + S.runId; localStorage.setItem("deflate-run", S.runId); } catch(e){}
        await reload(nb);
        var m = view.querySelector("#stage-intake .body");
        if (k.kind === "claim" && S.research && nb.passages[0] && nb.passages[0].analysis && nb.passages[0].analysis.claims[0]){
          // one click: the claim is saved and searched at once; nothing is attached until a person decides
          var c0 = nb.passages[0].analysis.claims[0], searched = null;
          try { searched = await API.searchClaim(nb.run.id, "p001", c0.id, nb.passages[0].readingRev || 0); await reload(searched.bundle); } catch(e){ searched = null; }
          var m0 = view.querySelector("#stage-intake .body");
          if (m0) m0.append(h("div",{class:"note ok",text: searched ? "Saved as one claim and searched at once: " + plural((searched.candidates||[]).length, "candidate document") + " waiting for you to judge (open Details on the card). Nothing is attached until you decide. You can also explain and grade the claim with the model." : "Saved as one claim. The search could not run just now; search from Details on the card."}));
        } else {
          var m = view.querySelector("#stage-intake .body");
          if (m) m.append(h("div",{class:"note ok",text: k.kind === "claim" ? "Saved as one claim. Its card is below: search for sources from Details, or explain and grade it with the model." : (nb.run.provenance && nb.run.provenance.notApplicable ? "Saved. " + nb.run.provenance.method + " Next: split into passages and deflate." : "Saved. Next: check who said what.")}));
        }
        var card = document.querySelector("#stage-deflate .card"); if (k.kind === "claim" && card && card.scrollIntoView) card.scrollIntoView({block:"start"});
      } else {
        var changed = text !== S.b.transcript;
        var nb2 = await API.saveRun(r.id, doc, text);
        S.pendingImport = null; await refreshList(); await reload(nb2);
        var m2 = view.querySelector("#stage-intake .body");
        if (m2) m2.append(h("div",{class:"note ok",text: changed ? "Saved. " + (nb2.run.provenance && nb2.run.provenance.transcriptNote ? nb2.run.provenance.transcriptNote.replace(/^Transcript edited \S+ ?/, "Transcript edited ") + " " : "") + "Existing cards are marked stale and their quotes were re-checked against the new text." : "Saved."}));
      }
    } catch(e){ msg.replaceChildren(h("div",{class:"note err",text:"Could not save: " + errCopy(e)})); go.disabled = false; }
  }
  return p;
}

/* The one-time key prompt: shown when real analysis is asked for and no model is configured. The key goes to the
   server, which writes it to .env on this computer; it is never kept or shown in the page. */
function ensureAI(where){
  if (S.ai) return true;
  var host = where || view; var old = host.querySelector(".keybox"); if (old) old.remove();
  var inp = h("input",{type:"password",placeholder:"sk-ant-…",autocomplete:"off",style:"min-width:260px"});
  var save = h("button",{class:"btn primary",type:"button",text:"Save key and continue",onclick:async function(){
    save.disabled = true;
    try { var out = await API.setKey(inp.value); S.ai = out.ai; inp.value = ""; box.remove(); setStore("ready", "Server connected · " + (S.ai ? S.ai.model : "")); renderRun(); }
    catch(e){ save.disabled = false; note.textContent = errCopy(e); }
  }});
  var note = h("p",{class:"hint",text:"Get a key at console.anthropic.com (API keys). Usage is billed to that account. The key is written to the .env file in the app folder on this computer and is not sent back to the browser, logged, or stored anywhere else."});
  var box = h("div",{class:"note info keybox"}, h("p",{text:"Real analysis needs your Anthropic API key, once. The supplied example works without it."}), h("div",{class:"row"}, inp, save), note);
  host.insertBefore(box, host.firstChild);
  box.scrollIntoView({block:"nearest"});
  return false;
}

/* ---- 2 Provenance ---- */
function renderProvenance(){
  var r = run(), pr = r.provenance || {overrides:{},flags:[]}, ro = readOnly();
  var confirmed = !!pr.confirmedAt;
  var state = !r.id ? "Save first" : pr.notApplicable ? "Not needed" : confirmed ? "Confirmed" : (pr.auditedAt ? "Audited · needs confirmation" : "Not checked");
  var p = panel("stage-prov","2","Who said what", state, !!r.id && !confirmed && !pr.notApplicable && S.turns.length > 0 && !ro);
  var b = body(p);
  if (!r.id || !S.turns.length){ b.append(h("p",{class:"hint",text:"Save some text first."})); return p; }
  if (pr.notApplicable){ b.append(h("div",{class:"note ok",text:pr.method || "Nothing to attribute."})); b.append(h("p",{class:"hint",text:"Turns with no label are shown as Speaker unknown. Conclusions that depend on who said something stay provisional."})); return p; }
  var speakers = speakerLabels(S.turns), ov = overrides();
  b.append(h("div",{class:"stat"},
    h("span",{},"Turns ",h("b",{text:String(S.turns.filter(function(t){return !t.heading;}).length)})),
    h("span",{},"Labels ",h("b",{text:speakers.join(", ")})),
    h("span",{},"Flagged ",h("b",{text:String((pr.flags||[]).length)})),
    h("span",{},"Corrected ",h("b",{text:String(Object.keys(ov).length)}))));
  b.append(h("p",{class:"hint",text:"Transcription services shift and swap labels. Every later grade inherits an attribution error, so this stage asks the model to read each turn against the speakers' bios and flag conflicts, then you decide. Deflation stays locked until a person confirms."}));
  if (pr.transcriptNote) b.append(h("div",{class:"note",text:pr.transcriptNote}));
  if ((r.provenanceHistory||[]).length) b.append(h("p",{class:"hint",text:plural(r.provenanceHistory.length, "earlier set") + " of attribution decisions " + (r.provenanceHistory.length===1?"is":"are") + " kept in the run file (provenanceHistory): " + r.provenanceHistory.map(function(x){ return fmtDate(x.replacedAt) + " (" + Object.keys(x.provenance && x.provenance.overrides || {}).length + " corrections, " + (x.keptInPlace ? "kept in place" : "archived") + ")"; }).join("; ") + "."}));
  if (pr.shiftNote) b.append(h("div",{class:"note",text:"Shift detected: " + pr.shiftNote}));
  if (pr.method) b.append(h("p",{class:"hint",text:"Method on record: " + pr.method}));
  var prog = h("div",{class:"progress",hidden:true}, h("div",{class:"track"},h("div",{class:"fill"})), h("span",{class:"hint"}));
  var msg = h("div");
  var stopBtn = h("button",{class:"btn",type:"button",text:"Stop",hidden:true,onclick:function(){ if (S.abort) S.abort.abort(); }});
  if (!ro){
    var auditBtn = h("button",{class:"btn primary",type:"button",text: pr.auditedAt ? "Re-run attribution check" : "Check attribution with the model", onclick:function(){ if (!ensureAI(b)) return; runAudit(prog, msg, auditBtn, stopBtn); }});
    b.append(h("div",{class:"row"}, auditBtn, stopBtn, h("span",{class:"hint",text:(r.speakers||[]).some(function(x){ return x.bio; }) ? "" : "No bios given; the check works from the words alone. Bios under Add context make it sharper."})), prog, msg);
  }
  var flagsWrap = h("div",{});
  if ((pr.flags||[]).length){
    flagsWrap.append(h("p",{class:"eyebrow",style:"margin:6px 0",text:"Flagged turns"}));
    pr.flags.forEach(function(f){
      var t = S.turns[f.turn]; if (!t) return;
      var sel = h("select",{disabled:ro?"":null});
      speakers.forEach(function(k){ sel.append(h("option",{value:k,text:speakerName(k), selected: effSpeaker(t) === k ? "selected":null})); });
      sel.addEventListener("change", function(){ setOverride(t.i, sel.value); });
      var apply = (!ro && f.likely && f.likely !== "UNSURE" && speakers.indexOf(f.likely) !== -1 && effSpeaker(t) !== f.likely) ? h("button",{class:"btn quiet",type:"button",text:"Use suggestion",onclick:function(){ setOverride(t.i, f.likely); }}) : null;
      flagsWrap.append(h("div",{class:"flag"}, h("span",{class:"n",text:"[" + t.i + "]"}),
        h("div",{}, h("p",{class:"q",text:t.text.length > 320 ? t.text.slice(0,320) + "…" : t.text}),
          h("p",{class:"cue",text:"Labeled " + f.labeled + " · likely " + (f.likely||"?") + (typeof f.confidence === "number" ? " (" + Math.round(f.confidence*100) + "%)" : "") + (f.cue ? " · cue: “" + f.cue + "”" : "")}),
          h("div",{class:"pick"}, h("span",{text:"Speaker:"}), sel, apply, ov[String(t.i)] ? h("span",{class:"hint",text:"corrected"}) : null))));
    });
  } else if (pr.auditedAt) b.append(h("div",{class:"note ok",text:"The check found no turns whose content conflicts with its label."}));
  b.append(flagsWrap);
  var det = h("details",{open: UI.turnsOpen ? "" : null}, h("summary",{class:"hint",style:"cursor:pointer",text:"Browse every turn" + (ro ? "" : " and set speakers by hand")}));
  det.addEventListener("toggle", function(){ UI.turnsOpen = det.open; });
  var list = h("div",{class:"turns"}), PAGE = 80, page = UI.turnsPage || 0, pager = h("div",{class:"row"});
  function drawTurns(){
    clear(list);
    S.turns.slice(page*PAGE, page*PAGE+PAGE).forEach(function(t){
      var row = h("div",{class:"turn" + (t.heading ? " heading":"") + (ov[String(t.i)] ? " changed":"")});
      row.append(h("span",{class:"n",text:"[" + t.i + "]"}));
      if (t.heading){ row.append(h("span",{class:"hint",text:"§ heading"}), h("span",{class:"txt",text:t.text})); }
      else { var sel = h("select",{disabled:ro?"":null}); speakers.forEach(function(k){ sel.append(h("option",{value:k,text:speakerName(k), selected: effSpeaker(t) === k ? "selected":null})); }); sel.addEventListener("change", function(){ setOverride(t.i, sel.value); }); row.append(sel, h("span",{class:"txt",text:t.text})); }
      list.append(row);
    });
    clear(pager);
    var pages = Math.ceil(S.turns.length / PAGE);
    pager.append(h("button",{class:"btn quiet",type:"button",text:"Previous",disabled:page===0?"":null,onclick:function(){ page--; UI.turnsPage = page; drawTurns(); }}),
      h("span",{class:"hint",text:"Turns " + (page*PAGE) + "–" + Math.min(S.turns.length-1,(page+1)*PAGE-1) + " of " + (S.turns.length-1)}),
      h("button",{class:"btn quiet",type:"button",text:"Next",disabled:page>=pages-1?"":null,onclick:function(){ page++; UI.turnsPage = page; drawTurns(); }}));
  }
  drawTurns(); det.append(pager, list); b.append(det);
  if (!ro){
    var confirmMsg = h("div");
    var confirmBtn = h("button",{class:"btn primary",type:"button",text: confirmed ? "Re-confirm attribution" : "Confirm attribution",onclick:async function(){
      try {
        var prov = JSON.parse(JSON.stringify(r.provenance || {}));
        prov.confirmedAt = nowISO(); prov.confirmedBy = "person at this computer";
        prov.method = (prov.auditedAt ? "Content-cue audit by the model, then " : "") + "per-turn confirmation by a person. " + Object.keys(prov.overrides||{}).length + " labels corrected.";
        var nb = await API.saveRun(r.id, {provenance: prov, status: r.status === "draft" ? "attributed" : r.status});
        await refreshList(); await reload(nb);
      } catch(e){ confirmMsg.replaceChildren(h("div",{class:"note err",text:"Could not save: " + errCopy(e)})); }
    }});
    b.append(h("div",{class:"row"}, confirmBtn, confirmMsg));
  }
  if (confirmed) b.append(h("p",{class:"hint",text:"Confirmed " + fmtDate(pr.confirmedAt) + (pr.confirmedBy ? " by " + pr.confirmedBy : "") + ". " + (pr.method||"")}));
  return p;
}
async function setOverride(i, key){
  var r = run(); if (!r || readOnly()) return;
  var prov = JSON.parse(JSON.stringify(r.provenance || {})); prov.overrides = prov.overrides || {};
  if (S.turns[i].label === key) delete prov.overrides[String(i)]; else prov.overrides[String(i)] = key;
  delete prov.confirmedAt; delete prov.confirmedBy;
  try { var nb = await API.saveRun(r.id, {provenance: prov}); await reload(nb); } catch(e){ alert(errCopy(e)); }
}
async function runAudit(prog, msg, btn, stopBtn){
  if (!S.ai || S.busy) return;
  var r = run(); S.busy = true; btn.disabled = true; stopBtn.hidden = false; prog.hidden = false; clear(msg);
  var ranges = chunkRanges(S.turns, 60000), flags = [], shiftNotes = [];
  try {
    for (var c = 0; c < ranges.length; c++){
      prog.querySelector(".fill").style.width = Math.round((c/ranges.length)*100) + "%";
      prog.querySelector(".hint").textContent = "Reading chunk " + (c+1) + " of " + ranges.length + "… this can take a minute per chunk.";
      S.abort = new AbortController();
      var out = (await API.sample(P.audit(r, fmtTurns(ranges[c][0], ranges[c][1], {})), {json:true, signal:S.abort.signal})).data;
      (out && out.flags || []).forEach(function(f){ if (typeof f.turn === "number" && S.turns[f.turn]) flags.push({turn:f.turn, labeled:String(f.labeled||S.turns[f.turn].label), likely:String(f.likely||"UNSURE").toUpperCase(), confidence: typeof f.confidence==="number"?f.confidence:null, cue:String(f.cue||"").slice(0,200)}); });
      if (out && out.shift && out.shift.detected && out.shift.note) shiftNotes.push(String(out.shift.note));
    }
    prog.querySelector(".fill").style.width = "100%";
    var prov = JSON.parse(JSON.stringify(r.provenance || {overrides:{}}));
    prov.flags = flags.sort(function(a,b){ return a.turn-b.turn; }); prov.auditedAt = nowISO(); prov.auditedBy = analyzedByLabel(); prov.shiftNote = shiftNotes.join(" "); prov.labelsFound = speakerLabels(S.turns);
    delete prov.confirmedAt; delete prov.confirmedBy;
    var nb = await API.saveRun(r.id, {provenance: prov});
    await reload(nb);
    var m = view.querySelector("#stage-prov .body"); if (m) m.prepend(h("div",{class:"note ok",text: flags.length + " turn" + (flags.length===1?"":"s") + " flagged. Review each one, then confirm."}));
  } catch(e){ msg.replaceChildren(h("div",{class:"note err",text:errCopy(e)})); btn.disabled = false; stopBtn.hidden = true; prog.hidden = true; }
  S.busy = false; S.abort = null;
}

/* ---- 3 Deflate ---- */
var deflateListEl = null, cardsEl = null;
function renderDeflate(){
  var r = run(), pr = r.provenance || {}, ro = readOnly(), claimRun = isClaimRun();
  var ok = attributionOk() && !ro;
  var done = S.b.passages.filter(function(p){ return p.status === "done"; }).length;
  var stale = S.b.passages.filter(function(p){ return (p.stale||[]).length; }).length;
  var p = panel("stage-deflate", claimRun ? "2" : "3", claimRun ? "The claim" : "Deflate", !r.id ? "" : (claimRun ? (done ? "Ready" : "") : (S.b.passages.length ? done + " of " + S.b.passages.length + " passages done" + (stale ? " · " + stale + " stale" : "") + (attributionOk() ? "" : " · attribution unconfirmed") : (ok ? "Not segmented" : "Waiting on attribution"))), ok || done > 0);
  var b = body(p);
  if (!r.id || !S.turns.length){ b.append(h("p",{class:"hint",text:"Save some text first."})); return p; }
  if (claimRun){ deflateListEl = null; if ((r.orphans||[]).length) b.append(renderOrphans(r)); cardsEl = h("div",{style:"display:grid;gap:18px"}); b.append(cardsEl); return p; }
  if (ro) b.append(h("div",{class:"note info",text:"Read-only example. Copy the run to re-run passages."}));
  else if (!attributionOk() && S.b.passages.length) b.append(h("div",{class:"note",text:"These cards were produced before a person confirmed the attribution. Confirm it in stage 2, then re-run any passage whose speakers changed."}));
  else if (!attributionOk()) b.append(h("div",{class:"note info",text:"Confirm who said what before deflating. A wrong label here becomes a wrong grade later."}));
  var prog = h("div",{class:"progress",hidden:true}, h("div",{class:"track"},h("div",{class:"fill"})), h("span",{class:"hint"}));
  var msg = h("div");
  var stopBtn = h("button",{class:"btn",type:"button",text:"Stop",hidden:true,onclick:function(){ if (S.abort) S.abort.abort(); }});
  if (!ro){
    var segBtn = h("button",{class:"btn" + (S.b.passages.length ? "" : " primary"),type:"button",text: S.b.passages.length ? "Re-segment (archives current passages)" : "Split into passages",disabled:!ok?"":null,onclick:function(){ if (!ensureAI(b)) return; runSegment(prog,msg,segBtn,stopBtn); }});
    var runBtn = h("button",{class:"btn primary",type:"button",text:"Deflate selected",disabled:(!ok||!S.b.passages.length)?"":null,onclick:function(){ if (!ensureAI(b)) return; runDeflate(prog,msg,runBtn,stopBtn,null); }});
    b.append(h("div",{class:"row"}, segBtn, runBtn, stopBtn), prog, msg);
  }
  deflateListEl = h("div",{class:"plist"}); b.append(deflateListEl);
  if ((r.orphans||[]).length) b.append(renderOrphans(r));
  cardsEl = h("div",{style:"display:grid;gap:18px"}); b.append(cardsEl);
  return p;
}
/* Records a re-segment parked on the run: sources, searches and rejections whose claims no longer exist. They are adopted
   automatically when a new reading produces the same claim text; otherwise a person reattaches them here. */
function renderOrphans(r){
  var box = h("div",{class:"note"}, h("p",{text:plural(r.orphans.length, "set") + " of records " + (r.orphans.length===1?"is":"are") + " waiting to be reattached: sources, searches or decisions whose claim is no longer in a current reading (its wording or speaker changed, or the passages were re-cut). Nothing was lost; each set is listed with the claim it belonged to."}));
  var claims = []; S.b.passages.forEach(function(p){ if (p.status === "done" && p.analysis) (p.analysis.claims||[]).forEach(function(c, i){ claims.push({pid:p.id, idx:c.id, label:(p.title||p.id) + " · " + c.text.slice(0,80)}); }); });
  r.orphans.forEach(function(o){
    var line = h("div",{class:"orphan"});
    line.append(h("p",{class:"ct",text:"“" + o.claimText + "”" + (o.speaker ? " — " + speakerName(o.speaker) : "")}), h("p",{class:"hint",text:"From “" + (o.from && o.from.title || o.from && o.from.passage || "?") + "”" + (o.from && o.from.reading != null ? " (reading " + o.from.reading + ")" : "") + (o.from && o.from.turnStart != null ? " (turns " + o.from.turnStart + "–" + o.from.turnEnd + ")" : "") + ", parked " + fmtDate(o.parkedAt) + (o.why ? " because " + o.why : "") + ": " + [(o.receipts||[]).length ? plural(o.receipts.length, "source") : "", (o.searches||[]).length ? plural(o.searches.length, "search") : "", (o.candidates||[]).filter(function(x){ return x.status === "candidate"; }).length ? plural(o.candidates.filter(function(x){ return x.status === "candidate"; }).length, "candidate") : "", (o.rejections||[]).length ? plural(o.rejections.length, "rejection") : ""].filter(Boolean).join(", ")}));
    if (!readOnly() && claims.length){
      var sel = h("select"); claims.forEach(function(c){ sel.append(h("option",{value:c.pid + ":" + c.idx,text:c.label})); });
      var btn = h("button",{class:"btn quiet",type:"button",text:"Reattach to this claim",onclick:async function(){ btn.disabled = true; var v = sel.value.split(":"); try { await reload(await API.attachOrphan(r.id, o.id, v[0], v[1])); } catch(e){ btn.textContent = errCopy(e); } }});
      line.append(h("div",{class:"row"}, sel, btn));
    } else if (!claims.length) line.append(h("p",{class:"hint",text:"Deflate a passage first; a claim with the same wording adopts these records on its own, and any claim can take them from here."}));
    box.append(line);
  });
  return box;
}
function renderDeflateList(){
  if (!deflateListEl) return; clear(deflateListEl);
  if (isClaimRun()) return;
  if (!S.b.passages.length){ deflateListEl.append(h("p",{class:"hint",text:"No passages yet."})); return; }
  if (!readOnly()) deflateListEl.append(h("p",{class:"hint",text:"Tick the passages to deflate. Each one is a separate model request on your key; a passage already done is skipped unless you re-run it from its card."}));
  S.b.passages.forEach(function(p){
    var cb = h("input",{type:"checkbox",id:"sel-"+p.id, checked: (p.status !== "done" || (p.stale||[]).length) ? "checked":null, disabled: readOnly()?"":null});
    deflateListEl.append(h("div",{class:"pitem"}, cb,
      h("label",{for:"sel-"+p.id}, h("div",{class:"t"}, document.createTextNode(p.title||p.id), (p.stale||[]).length ? h("span",{class:"badge stale",style:"margin-left:8px",text:"stale"}) : null), h("div",{class:"m",text:"turns " + p.turnStart + "–" + p.turnEnd + (p.stake ? " · " + p.stake : "")})),
      h("span",{class:"st " + (p.status||""),text: p.status === "done" ? "done" : p.status === "error" ? "failed" : p.status === "running" ? "running…" : "pending"})));
  });
}
function speakersIn(a,z){ var seen={}, out=[]; for (var i=a;i<=z&&i<S.turns.length;i++){ var t=S.turns[i]; if(t.heading) continue; var k=effSpeaker(t); if(!seen[k]){seen[k]=true; out.push(k);} } return out; }
async function runSegment(prog,msg,btn,stopBtn){
  if (!S.ai || S.busy) return;
  var r = run(); S.busy = true; btn.disabled = true; stopBtn.hidden = false; prog.hidden = false; clear(msg);
  try {
    var ranges = chunkRanges(S.turns, 60000), found = [];
    for (var c = 0; c < ranges.length; c++){
      prog.querySelector(".fill").style.width = Math.round((c/ranges.length)*100) + "%";
      prog.querySelector(".hint").textContent = "Segmenting chunk " + (c+1) + " of " + ranges.length + "…";
      S.abort = new AbortController();
      var out = (await API.sample(P.segment(r, fmtTurns(ranges[c][0], ranges[c][1])), {json:true, signal:S.abort.signal})).data;
      (out && out.passages || []).forEach(function(x){ var a = Number(x.turnStart), z = Number(x.turnEnd); if (isFinite(a) && isFinite(z) && a <= z && S.turns[a] && S.turns[z]) found.push({title:String(x.title||"").slice(0,120), turnStart:a, turnEnd:z, stake:String(x.stake||"").slice(0,300), speakers:speakersIn(a,z), status:"pending", segmentedBy:analyzedByLabel()}); });
    }
    found.sort(function(a,b){ return a.turnStart-b.turnStart; });
    var nb = await API.replacePassages(r.id, found);
    nb = await API.saveRun(r.id, {status:"segmented"});
    await refreshList(); await reload(nb);
    var m = view.querySelector("#stage-deflate .body"); if (m) m.prepend(h("div",{class:"note ok",text: found.length + " passages. Tick the ones to deflate and run."}));
  } catch(e){ msg.replaceChildren(h("div",{class:"note err",text:errCopy(e)})); btn.disabled = false; stopBtn.hidden = true; prog.hidden = true; }
  S.busy = false; S.abort = null;
}
async function runDeflate(prog,msg,btn,stopBtn,single){
  if (!S.ai || S.busy) return;
  var r = run();
  var targets = single ? [single] : S.b.passages.filter(function(p){ var cb = document.getElementById("sel-"+p.id); return cb && cb.checked; });
  if (!targets.length){ if (msg) msg.replaceChildren(h("div",{class:"note",text:"Nothing selected."})); return; }
  S.busy = true; if (btn) btn.disabled = true; if (stopBtn) stopBtn.hidden = false; if (prog) prog.hidden = false; if (msg) clear(msg);
  var failures = 0, stopped = false;
  try {
    for (var i = 0; i < targets.length; i++){
      var p = targets[i];
      if (prog){ prog.querySelector(".fill").style.width = Math.round((i/targets.length)*100) + "%"; prog.querySelector(".hint").textContent = "Deflating " + (i+1) + " of " + targets.length + ": " + (p.title||p.id) + "…"; }
      var base = JSON.parse(JSON.stringify(p)); delete base.id; delete base.stale;
      base.status = "running"; await API.savePassage(r.id, p.id, base);
      S.abort = new AbortController();
      try {
        var res = await API.sample(P.deflate(r, p, fmtTurns(p.turnStart, p.turnEnd)), {json:true, signal:S.abort.signal});
        // The server keeps the previous reading in history and carries a person's records to matching claims (store.savePassage).
        base.analysis = sanitizeAnalysis(res.data, p); base.status = "done"; base.analyzedAt = nowISO(); base.analyzedBy = analyzedByLabel(); base.model = res.model || ""; base.usage = res.usage || null;
        base.speakers = speakersIn(p.turnStart, p.turnEnd); base.basedOn = {transcriptUpdatedAt: r.transcriptUpdatedAt, attrSig: S.b.attrSig};
        base.expectedReadingRev = p.readingRev || 0; // an edit or another tab's re-run while the model worked is refused, not overwritten
        delete base.error;
        await API.savePassage(r.id, p.id, base);
      } catch(e){
        base.status = "error"; base.error = String(e && e.code || e && e.message || "error"); await API.savePassage(r.id, p.id, base); failures++;
        if (e && (e.code === "cancelled" || e.name === "AbortError" || e.code === "no_ai" || e.code === "bad_key" || e.code === "rate_limited")){ stopped = true; if (msg) msg.replaceChildren(h("div",{class:"note err",text:errCopy(e)})); break; }
      }
    }
    var nb = await API.saveRun(r.id, {status: "analyzed"});
    await refreshList(); await reload(nb);
    var m = view.querySelector("#stage-deflate .body");
    if (m && !failures) m.prepend(h("div",{class:"note ok",text:"Done. Scroll down for the cards, then find patterns in stage 4."}));
    else if (m && !stopped) m.prepend(h("div",{class:"note",text: failures + " passage" + (failures===1?"":"s") + " failed; re-run them from their cards."}));
  } catch(e){ if (msg) msg.replaceChildren(h("div",{class:"note err",text:errCopy(e)})); }
  S.busy = false; if (btn) btn.disabled = false; if (stopBtn) stopBtn.hidden = true; if (prog) prog.hidden = true; S.abort = null;
}
/* A claim a person typed, explained and graded by the model. The wording and identity of the claim never change:
   the model's typing, basis, what-would-settle and query are written onto the person's claim; extra claims it finds
   are appended. The server keeps the previous (person-only) reading in history. */
P.claim = function(run, text){
  return "You are a deflation reader grading ONE claim exactly as a person typed it. Do not reword the claim. Say in plain language what it asserts, type it, say what would settle it, name the source types and a search query a reference librarian would use. Keep a neutral register. You cannot browse.\n\n" +
  "Two reading levels for EVERY text you write: hs (a careful senior-high reader) and g5 (a ten-year-old; short concrete sentences).\n\n" +
  "Claim types: fact (empirical, supported in general knowledge) | contested (empirical, evidence mixed or disputed) | unsupported (empirical, no support known to you) | interpretation | value | image | unscorable (say what would make it scorable).\n" +
  "expectedSources: one or two of [academic_paper, survey_report, government_data, agency_report, news_coverage, book_or_edition, company_statement, transcript_or_recording, federal_court_filing, corporate_filing]. searchQuery: four to eight words.\n\n" +
  "Reply with ONLY JSON of this exact shape:\n{\"deflated\":{\"hs\":\"what the claim asserts, in plain words, with every hedge the claim has\",\"g5\":\"\"},\"type\":\"fact|contested|unsupported|interpretation|value|image|unscorable\",\"basis\":{\"hs\":\"why this type\",\"g5\":\"\"},\"wouldSettle\":\"\",\"settle\":{\"hs\":\"what evidence would settle it\",\"g5\":\"\"},\"expectedSources\":[\"academic_paper\"],\"searchQuery\":\"\",\"hidden\":[{\"text\":\"a further claim the sentence quietly makes, if any\",\"type\":\"\",\"plain\":{\"hs\":\"\",\"g5\":\"\"},\"basis\":{\"hs\":\"\",\"g5\":\"\"},\"wouldSettle\":\"\",\"settle\":{\"hs\":\"\",\"g5\":\"\"},\"expectedSources\":[],\"searchQuery\":\"\"}],\"judgments\":{\"evidence\":\"n/a\",\"inference\":\"valid|gap|unfalsifiable|n/a\"}}\n\nThe claim:\n" + text;
};
async function runClaimExplain(p){
  if (!S.ai || S.busy) return;
  var r = run(), readingRev = p.readingRev || 0, transcriptAt = r.transcriptUpdatedAt, attrSigAt = S.b.attrSig;
  // the claim is the CURRENT input, never the card's older copy of it
  var text = String(S.b.transcript || "").replace(/\s+/g, " ").trim().replace(/^["“'‘]+|["”'’]+$/g, "");
  var c0 = p.analysis.claims[0];
  S.busy = true;
  try {
    S.abort = new AbortController();
    var res = await API.sample(P.claim(r, text), {json:true, signal:S.abort.signal}); var o = res.data || {};
    var base = JSON.parse(JSON.stringify(p)); delete base.id; delete base.stale; delete base.quoteCheck;
    var lvx = function(x){ x = x && typeof x === "object" ? x : {hs:String(x||""), g5:""}; return {hs:String(x.hs||""), g5:String(x.g5||"")}; };
    var first = {text:text, id:c0 && c0.text === text ? c0.id : undefined, userSupplied:true, speaker:"", type:String(o.type||"unscorable"), basis:lvx(o.basis), plain:lvx(o.deflated), wouldSettle:String(o.wouldSettle||""), settle:lvx(o.settle), expectedSources:Array.isArray(o.expectedSources)?o.expectedSources:(c0 ? c0.expectedSources : []), searchQuery:String(o.searchQuery||(c0 && c0.searchQuery)||"")};
    if (c0 && c0.routingEditedAt && c0.text === text){ first.searchQuery = c0.searchQuery; first.expectedSources = c0.expectedSources; first.routingEditedAt = c0.routingEditedAt; first.routingEditedBy = c0.routingEditedBy; }
    var extra = (Array.isArray(o.hidden) ? o.hidden : []).filter(function(x){ return x && x.text; }).map(function(x){ return {text:String(x.text), speaker:"", type:String(x.type||"unscorable"), plain:lvx(x.plain), basis:lvx(x.basis), wouldSettle:String(x.wouldSettle||""), settle:lvx(x.settle), expectedSources:Array.isArray(x.expectedSources)?x.expectedSources:[], searchQuery:String(x.searchQuery||"")}; });
    base.analysis = sanitizeAnalysis({by:"model", asSaid:[], deflated:lvx(o.deflated), fidelity:{grade:"unrated", notes:{hs:"", g5:""}}, jump:{present:false, pivot:"", hs:"", g5:""}, defense:{hs:"", g5:""}, revision:{jumpSurvives:"", hs:"", g5:""}, claims:[first].concat(extra), judgments:o.judgments||{}}, p);
    base.analysis.by = "model";
    base.status = "done"; base.analyzedAt = nowISO(); base.analyzedBy = analyzedByLabel(); base.model = res.model || ""; base.usage = res.usage || null;
    // stamped with the input and attribution the explanation was MADE FROM, so an edit during the run leaves it stale
    base.basedOn = {transcriptUpdatedAt: transcriptAt, attrSig: attrSigAt};
    base.expectedReadingRev = readingRev;
    await reload(await API.savePassage(r.id, p.id, base).then(function(){ return API.getRun(r.id); }));
    UI.detailsOpen["card-" + p.id] = false;
  } catch(e){ alert(errCopy(e)); if (e && (e.code === "stale_reading" || e.code === "claim_edited")) await reload(); }
  S.busy = false; S.abort = null;
}
function sanitizeAnalysis(o, p){ var a = SH.sanitizeAnalysis(o, {sourceTypes: SOURCE_TYPES}); if (o && o.by) a.by = String(o.by); return a; }

/* ---- passage cards ----
   Default view: the plain explanation, where it jumps, the fair defense, what is left, and the claims, in that order,
   at the chosen reading level. Checks and sources appear as small chips; clicking a chip opens links and a plain
   explanation of what was checked. Every editing control (attach, search, accept, reject, withdraw, re-run) lives
   inside the collapsed Details block. Finding or attaching a source never produces a "verified" mark. */
function renderPassages(){
  if (!cardsEl) return; clear(cardsEl);
  var done = S.b.passages.filter(function(p){ return p.status === "done" && p.analysis; });
  if (!done.length) return;
  cardsEl.append(h("p",{class:"eyebrow",style:"margin-top:6px",text:"Cards"}));
  done.forEach(function(p){ cardsEl.append(passageCard(p)); });
}
/* Two-level text for explanations the app itself writes (not the model). */
function L(hs, g5){ return lvl({hs:hs, g5:g5 || hs}); }
function personOnlyA(a){ return a && a.by === "person"; }
/* What would settle a claim, at both levels; older data has only the one string, shown at both levels as is. */
function settleOf(c){ if (c.settle && (c.settle.hs || c.settle.g5)) return lvl(c.settle); if (c.wouldSettle) return L("Would settle it: " + c.wouldSettle, "What would settle it: " + c.wouldSettle); return null; }
function provisionalOf(p){ var pr = run().provenance || {}; var out = (p.stale||[]).slice(); if (!pr.notApplicable && !pr.confirmedAt) out.push("attribution not confirmed by a person"); return out; }
function activeReceipts(c){ return (c.receipts||[]).filter(function(x){ return !x.withdrawnAt; }); }
function claimStatus(c){ return activeReceipts(c).length ? "receipt" : ((c.searches||[]).length ? "searched" : "unchecked"); }
function plural(n, one, many){ return n + " " + (n === 1 ? one : (many || one + "s")); }

/* A chip is a button that opens one explanation panel at a time inside its host. */
function chipRow(host){
  var row = h("div",{class:"chips"});
  var panel = h("div",{class:"chip-panel",hidden:true});
  var open = null;
  row.addChip = function(label, cls, build){
    var b = h("button",{type:"button",class:"chip-ev " + (cls||""),text:label,"aria-expanded":"false",onclick:function(){
      if (open === b){ panel.hidden = true; open = null; b.setAttribute("aria-expanded","false"); return; }
      row.querySelectorAll(".chip-ev").forEach(function(x){ x.setAttribute("aria-expanded","false"); });
      clear(panel); panel.append(h("button",{type:"button",class:"close","aria-label":"Close",text:"×",onclick:function(){ panel.hidden = true; open = null; b.setAttribute("aria-expanded","false"); }}));
      panel.append(build()); panel.hidden = false; open = b; b.setAttribute("aria-expanded","true");
    }});
    row.append(b); return b;
  };
  host.append(row, panel);
  return row;
}
/* Details state survives re-renders (every save re-draws the cards). `card` may be a stale element; look it up by id. */
function openDetails(card, claimIdx){
  var id = typeof card === "string" ? card : card.id; UI.detailsOpen[id] = true;
  var live = document.getElementById(id); if (!live) return;
  var det = live.querySelector("details.more"); if (!det) return;
  det.open = true;
  var target = claimIdx != null ? live.querySelector("#" + id + "-claim-" + claimIdx) : det;
  if (target && target.scrollIntoView) target.scrollIntoView({block:"nearest"});
}

function quoteLine(q){
  var who = speakerName(q.speakerNow || q.speaker);
  var shownTurn = q.verbatim && q.matchedTurn != null ? q.matchedTurn : q.turn;
  var line = h("p",{class:"q"}, h("span",{class:"sp",text: who + " [" + shownTurn + "]"}), document.createTextNode("“" + q.quote + "”"),
    h("span",{class:"vq" + (q.verbatim ? "" : " no"),text: q.verbatim ? "matched" : "not found word for word"}));
  if (q.relocated) line.append(h("span",{class:"vq no",text:"the card named turn " + q.turn + "; the words are in turn " + q.matchedTurn}));
  if (q.speakerMismatch) line.append(h("span",{class:"vq no",text:"model said " + speakerName(q.speaker)}));
  return line;
}

function passageCard(p){
  var a = p.analysis, r = run(), ro = readOnly(), qc = p.quoteCheck || {quotes:(a.asSaid||[]).length, matched:(a.asSaid||[]).filter(function(q){return q.verbatim;}).length, mismatched:0, outOfRange:0, pivotOk:null};
  var card = h("article",{class:"card", id:"card-" + p.id});
  var hdr = h("header",{});
  hdr.append(h("div",{class:"toprow"}, h("h3",{text:p.title||p.id}), (p.stale||[]).length ? h("span",{class:"badge stale",text:"stale"}) : null, /MOCK/.test(p.analyzedBy||"") ? h("span",{class:"badge mock",text:"mock output"}) : null));
  hdr.append(h("p",{class:"who",text: isClaimRun() ? ("Typed claim" + (p.analyzedAt ? " · " + (a.by === "person" ? "saved " : "graded ") + fmtDate(p.analyzedAt) : "") + (p.analyzedBy && a.by !== "person" ? " · " + p.analyzedBy : "")) : ((p.speakers||[]).map(speakerName).join(" · ") + " · turns " + p.turnStart + "–" + p.turnEnd + (p.analyzedAt ? " · deflated " + fmtDate(p.analyzedAt) : "") + (p.analyzedBy ? " · " + p.analyzedBy : ""))}));
  var chips = chipRow(hdr);

  // chip: quotes
  var allOk = qc.matched === qc.quotes && !qc.mismatched;
  if (qc.quotes || !personOnlyA(a)) chips.addChip("Quotes · " + qc.matched + "/" + qc.quotes + " matched", allOk ? "good" : "warn", function(){
    var w = h("div",{});
    w.append(L("Every quote on this card was checked word for word against the saved transcript, in order, at word boundaries. “Matched” means those words are there in that turn. The check does not judge whether the card reads them fairly; the quotes are below so you can.",
      "We checked every quote against the transcript, word by word. “Matched” means the words are really there. It does not say whether the card understood them right. Read them and see."));
    if (qc.quotes - qc.matched) w.append(L(plural(qc.quotes - qc.matched, "quote was", "quotes were") + " not found word for word. Treat the rewrite of those parts with caution.", plural(qc.quotes - qc.matched, "quote was", "quotes were") + " not found. Be careful with those parts."));
    if (qc.mismatched) w.append(L("For " + plural(qc.mismatched, "quote") + " the model named a different speaker than the transcript shows. The card goes with the transcript, as corrected in stage 2.", "For " + plural(qc.mismatched, "quote") + " the computer and the transcript disagree about who said it. We go with the transcript."));
    if (qc.relocated) w.append(L(plural(qc.relocated, "quote was", "quotes were") + " found in a different turn than the model named; the turn shown is where the words actually are.", plural(qc.relocated, "quote was", "quotes were") + " in a different place than the computer said. We show the real place."));
    if (qc.pivotOk === false) w.append(L("The pivot quote was not found word for word inside this passage.", "The turning-point quote was not found in this part."));
    var list = h("div",{class:"said"}); (a.asSaid||[]).forEach(function(q){ list.append(quoteLine(q)); }); w.append(list);
    return w;
  });
  // chip: rewrite fidelity (not for a claim a person typed and nobody graded)
  var fg = a.fidelity.grade || "unrated";
  if (!personOnlyA(a)) {
  var fidelityText = { faithful: ["The model compared its plain rewrite with the quoted words and found nothing added, firmer, or softer.", "The plain version says the same thing as the real words. Nothing added, nothing stronger, nothing softer."],
    adds: ["The rewrite adds something the speaker did not say. The notes say where.", "The plain version adds something the speaker did not say. The notes say where."],
    strengthens: ["The rewrite is firmer than the speaker's words. Read the quotes before trusting it.", "The plain version sounds more sure than the speaker was. Check the real words."],
    softens: ["The rewrite is weaker than the speaker's words.", "The plain version sounds less sure than the speaker was."],
    unrated: ["The rewrite was not graded.", "The plain version was not checked."] }[fg];
  chips.addChip("Rewrite · " + fg, fg === "faithful" ? "good" : fg === "unrated" ? "" : "warn", function(){
    var w = h("div",{}); w.append(L(fidelityText[0], fidelityText[1])); w.append(lvl(a.fidelity.notes)); w.append(L("This is the model grading its own rewrite; it is one reader's check, not an outside one.", "The computer checked its own work here. It is not an outside check.")); return w;
  });
  // chip: evidence and reasoning (the model's judgments)
  var ev = a.judgments.evidence, inf = a.judgments.inference;
  var evText = { strong: ["The passage offers support that would satisfy a careful reader.", "The speaker gave good reasons."], mixed: ["Some support is offered, but it is partial or disputed.", "The speaker gave some reasons, but not enough, or people argue about them."], weak: ["Little support is offered for the claims made.", "The speaker gave weak reasons."], none: ["No support is offered; the claims rest on assertion.", "The speaker gave no reasons, just said it."], "n/a": ["There is no empirical claim here to weigh.", "There is nothing here to prove or disprove."] }[ev] || ["", ""];
  var infText = { valid: ["The conclusion follows from what was offered.", "The ending makes sense from the reasons given."], gap: ["The conclusion does not follow from what was offered; “Where it jumps” says where.", "The ending does not follow from the reasons. See “Where it jumps”."], unfalsifiable: ["The claim is framed so that nothing could count against it.", "The claim is set up so nothing could ever prove it wrong."], "n/a": ["No inference to check.", "No reasoning to check."] }[inf] || ["", ""];
  chips.addChip("Evidence · " + ev, ev === "strong" ? "good" : (ev === "weak" || ev === "none") ? "warn" : "", function(){ var w = h("div",{}); w.append(L(evText[0], evText[1])); w.append(L("This is the model's judgment of the support offered inside the passage. It is not a check against outside sources; sources live on the claims below.", "This is the computer's opinion about the reasons in this part. It did not look anything up. Sources are on the claims below.")); return w; });
  chips.addChip("Reasoning · " + inf, inf === "valid" ? "good" : (inf === "gap" || inf === "unfalsifiable") ? "warn" : "", function(){ var w = h("div",{}); w.append(L(infText[0], infText[1])); w.append(L("The model's judgment; the defense and the revision below show it being argued both ways.", "The computer's opinion. Below, it also argues the other side.")); return w; });
  }
  // chip: sources across the card's claims
  var emp = (a.claims||[]).filter(function(c){ return EMPIRICAL.indexOf(c.type) !== -1; });
  var withS = emp.filter(function(c){ return claimStatus(c) === "receipt"; }).length, searched = emp.filter(function(c){ return claimStatus(c) === "searched"; }).length;
  if (emp.length) chips.addChip("Sources · " + withS + " of " + plural(emp.length, "checkable claim") + (searched ? " · " + searched + " searched" : ""), withS ? "" : "", function(){
    var w = h("div",{}); w.append(L(withS + " of " + plural(emp.length, "checkable claim") + " on this card " + (withS === 1 ? "has" : "have") + " a source a person attached; " + searched + " " + (searched === 1 ? "has" : "have") + " a search on record with nothing attached; " + (emp.length - withS - searched) + " " + (emp.length - withS - searched === 1 ? "is" : "are") + " unchecked. A source records a person's judgment that a document is relevant. It does not mark the claim verified.", withS + " of " + plural(emp.length, "claim") + " here " + (withS === 1 ? "has" : "have") + " a source a person picked. " + (emp.length - withS - searched) + " " + (emp.length - withS - searched === 1 ? "has" : "have") + " not been looked at. A source means someone found it useful, not that the claim is true.")); return w;
  });
  card.append(hdr);
  if ((p.stale||[]).length) card.append(h("div",{class:"stale-note",text:"Stale: " + p.stale.join("; ") + ". The card is kept; re-run it from Details to refresh."}));

  // the readable flow
  var read = h("div",{class:"read"});
  var personOnly = a.by === "person";
  read.append(h("section",{}, h("p",{class:"eyebrow",text: personOnly ? "The claim, as typed" : "In plain words"}), lvl(a.deflated)));
  if (personOnly) read.append(h("section",{}, h("p",{class:"hint",text:"Nothing has been graded. Search for sources from Details, or ask the model to explain and grade the claim (needs a key, once)."})));
  if (a.jump.hs || a.jump.present){
    var jumpSec = h("section",{class:"jump" + (a.jump.present ? "" : " none")}, h("p",{class:"eyebrow",text: a.jump.present ? "Where it jumps" : "No jump"}), lvl({hs:a.jump.hs, g5:a.jump.g5}));
    if (a.jump.pivot) jumpSec.append(h("p",{class:"pivot"}, h("span",{class:"sp",text:"The turn"}), document.createTextNode("“" + a.jump.pivot + "”"), h("span",{class:"vq" + (a.jump.pivotVerbatim === false ? " no" : ""),text: a.jump.pivotVerbatim === false ? "not found word for word" : "matched"})));
    read.append(jumpSec);
  }
  if (a.defense.hs) read.append(h("section",{class:"defense"}, h("p",{class:"eyebrow",text:"In fairness to the speaker"}), lvl(a.defense)));
  var survives = (a.jump.present && a.revision.jumpSurvives) ? ({yes:"the jump stands", partly:"the jump partly stands", no:"the jump does not stand"})[a.revision.jumpSurvives] : "";
  if (a.revision.hs) read.append(h("section",{class:"revision"}, h("p",{class:"eyebrow",text:"What is left" + (survives ? " · " + survives : "")}), lvl({hs:a.revision.hs, g5:a.revision.g5})));
  var claimsSec = h("section",{class:"claims"}, h("p",{class:"eyebrow",text:"The claims, one at a time"}));
  (a.claims||[]).forEach(function(c, idx){
    var row = h("div",{class:"claim"});
    row.append(h("span",{class:"pill " + c.type,text:c.type}));
    var body = h("div",{});
    body.append(h("p",{class:"ct",text:(c.speaker ? speakerName(c.speaker) + ": " : "") + c.text}));
    if (c.plain && (c.plain.hs || c.plain.g5)) body.append(h("div",{class:"basis plain"}, lvl(c.plain)));
    if (c.basis && (c.basis.hs || c.basis.g5)) body.append(h("div",{class:"basis"}, lvl(c.basis)));
    else if (c.userSupplied) body.append(h("div",{class:"basis"}, L("Typed by a person; not yet typed or explained by the model.", "You typed this. The computer has not looked at it yet.")));
    var cchips = chipRow(body);
    var st = claimStatus(c), rc = activeReceipts(c), pending = (c.candidates||[]).filter(function(x){ return x.status === "candidate"; }), withdrawn = (c.receipts||[]).filter(function(x){ return x.withdrawnAt; });
    if (EMPIRICAL.indexOf(c.type) === -1){
      var kind = {interpretation:["an interpretation: a reading of a text, event or data","a way of reading something"], value:["a value judgment: a moral or aesthetic position","an opinion about what is good or bad"], image:["an image: a metaphor or frame that carries meaning but is not offered as evidence","a picture in words, not proof"], unscorable:["too vague or unbounded to grade as stated","too vague to check"]}[c.type] || ["not a checkable claim","not a checkable claim"];
      cchips.addChip("Not a checkable claim", "", function(){ return L("This is " + kind[0] + ". It is not the kind of claim a document settles, so no source is expected.", "This is " + kind[1] + ". No paper could prove it, so we do not look for one."); });
    } else if (st === "receipt"){
      cchips.addChip("Sources · " + rc.length, "good", function(){
        var w = h("div",{});
        w.append(L("A person attached " + plural(rc.length, "document") + " as relevant and wrote a note on each. Attaching a source records a judgment of relevance; it does not make the claim verified.", "A person picked " + plural(rc.length, "paper") + " and said why. That means someone found them useful. It does not prove the claim is true."));
        var st1 = settleOf(c); if (st1) w.append(st1);
        var prov1 = provisionalOf(p); if (prov1.length) w.append(L("Provisional: " + prov1.join("; ") + ". Re-run the card to settle it.", "Careful: this card is out of date (" + prov1.join("; ") + ")."));
        rc.forEach(function(x){ w.append(h("p",{class:"src"}, h("a",{href:x.url,target:"_blank",rel:"noopener",text:(x.title || x.url) + (x.journal ? " · " + x.journal : "") + (x.publishedAt ? " · " + String(x.publishedAt).slice(0,4) : "")}), x.note ? h("span",{class:"hint",text:" — " + x.note}) : null, h("span",{class:"hint",text:" (" + (x.addedBy||"") + (x.at ? ", " + fmtDate(x.at) : "") + ")"}), (x.notices||[]).length ? h("span",{class:"badge stale",style:"margin-left:6px",text:x.notices.map(function(n){ return n.label || n.type; }).join("; ")}) : null)); });
        if (withdrawn.length) w.append(L(plural(withdrawn.length, "earlier source was", "earlier sources were") + " withdrawn: " + withdrawn.map(function(x){ return (x.title || x.url) + (x.withdrawReason ? " (" + x.withdrawReason + ")" : ""); }).join("; ") + ".", plural(withdrawn.length, "earlier source was", "earlier sources were") + " taken back."));
        w.append(h("p",{class:"hint"}, h("a",{href:"#",onclick:function(e){ e.preventDefault(); openDetails(card, idx); },text:"Open Details to add, search or withdraw sources"}))); return w;
      });
    } else if (st === "searched"){
      var last = c.lastSearchedAt || (c.searches[c.searches.length-1] || {}).at, adapters = []; (c.searches||[]).forEach(function(s){ if (adapters.indexOf(s.adapter) === -1) adapters.push(s.adapter); });
      cchips.addChip(pending.length ? "Searched · " + pending.length + " waiting" : "Searched · nothing attached", "warn", function(){
        var w = h("div",{});
        if (pending.length) w.append(L("A search ran on " + fmtDate(last) + " (" + adapters.join(", ") + "). " + plural(pending.length, "candidate document is", "candidate documents are") + " waiting for a person to read them. Nothing is attached until someone judges it relevant.", "We searched on " + fmtDate(last) + ". " + plural(pending.length, "paper") + " came up. A person has to read them and decide. Nothing counts yet."));
        else w.append(L("A search ran on " + fmtDate(last) + " (" + adapters.join(", ") + "). It found nothing usable, or every candidate was set aside with a reason. The attempt is on record either way.", "We searched on " + fmtDate(last) + " and found nothing we could use. That is written down too."));
        var st2 = settleOf(c); if (st2) w.append(st2);
        var prov2 = provisionalOf(p); if (prov2.length) w.append(L("Provisional: " + prov2.join("; ") + ". The search stands, but the card it belongs to is out of date; re-run the card to settle it.", "Careful: this card is out of date (" + prov2.join("; ") + ")."));
        var lateN = (c.searches||[]).filter(function(x){ return x.late; }).length; if (lateN) w.append(L(plural(lateN, "search attempt") + " finished after the card was re-read and " + (lateN===1?"was":"were") + " attached to this same claim in the new reading.", "Some search results came in after the card changed; they belong to this same claim."));
        pending.slice(0,6).forEach(function(x){ w.append(h("p",{class:"src"}, h("a",{href:x.url,target:"_blank",rel:"noopener",text:x.title}), h("span",{class:"hint",text:" " + [x.journal, x.publishedAt ? String(x.publishedAt).slice(0,4) : ""].filter(Boolean).join(" · ")}), (x.notices||[]).length ? h("span",{class:"badge stale",style:"margin-left:6px",text:x.notices.map(function(n){ return n.label || n.type; }).join("; ")}) : null)); });
        if (withdrawn.length) w.append(L(plural(withdrawn.length, "earlier source was", "earlier sources were") + " withdrawn.", plural(withdrawn.length, "earlier source was", "earlier sources were") + " taken back."));
        w.append(h("p",{class:"hint"}, h("a",{href:"#",onclick:function(e){ e.preventDefault(); openDetails(card, idx); },text:"Open Details to read, accept or reject candidates"}))); return w;
      });
    } else {
      cchips.addChip("Not checked", "", function(){ var w = h("div",{}); w.append(L("No one has looked for sources for this claim. The model cannot search or browse; a search or an attached source only happens when a person asks for it." + (withdrawn.length ? " " + plural(withdrawn.length, "earlier source was", "earlier sources were") + " withdrawn." : ""), "Nobody has looked for proof yet. The computer cannot search the web. A person has to start it.")); var st0 = settleOf(c); if (st0) w.append(st0); w.append(h("p",{class:"hint"}, h("a",{href:"#",onclick:function(e){ e.preventDefault(); openDetails(card, idx); },text:"Open Details to search or attach a source"}))); return w; });
    }
    row.append(body); claimsSec.append(row);
  });
  read.append(claimsSec);
  card.append(read);

  // details: exact words, checks, sources, history, controls
  var det = h("details",{class:"more", open: UI.detailsOpen[card.id] ? "" : null}, h("summary",{text:"Details: the exact words, the checks, sources and history"}));
  det.addEventListener("toggle", function(){ UI.detailsOpen[card.id] = det.open; });
  var more = h("div",{class:"more-body"});
  more.append(h("div",{class:"row"}, h("span",{class:"eyebrow",text:"Reading level for this card"}), levelToggle(card)));
  var said = h("div",{class:"said"}, h("p",{class:"eyebrow",text:"The words as said"}));
  (a.asSaid||[]).forEach(function(q){ said.append(quoteLine(q)); });
  if (!(a.asSaid||[]).length) said.append(h("p",{class:"hint",text:"No quotes were recorded for this passage."}));
  more.append(said);
  more.append(h("div",{class:"block"}, h("p",{class:"eyebrow",text:"Rewrite check · " + fg}), lvl(a.fidelity.notes)));
  if (a.truncated && (a.truncated.claims || a.truncated.asSaid)) more.append(h("p",{class:"hint",text:"The model returned more than the page keeps: " + (a.truncated.claims ? a.truncated.claims + " extra claims" : "") + (a.truncated.claims && a.truncated.asSaid ? " and " : "") + (a.truncated.asSaid ? a.truncated.asSaid + " extra quotes" : "") + " were dropped at save time. Re-run with a shorter passage to keep them all."}));
  var cl = h("div",{class:"block"}, h("p",{class:"eyebrow",text:"Sources, claim by claim"}));
  (a.claims||[]).forEach(function(c, idx){ cl.append(claimDetail(card, p, c, idx, ro)); });
  more.append(cl);
  if ((p.history||[]).length || p.rerun || (p.adopted||[]).length){
    var hist = h("div",{class:"block"}, h("p",{class:"eyebrow",text:"History"}));
    if ((p.history||[]).length) hist.append(h("p",{class:"hint",text:"Re-run " + plural(p.history.length, "time") + "; every earlier reading is kept in this passage's file (data folder, passages/" + p.id + ".json): " + p.history.map(function(x){ return fmtDate(x.replacedAt) + " replaced the reading of " + fmtDate(x.analyzedAt) + (x.analyzedBy ? " by " + x.analyzedBy : ""); }).join("; ") + "."}));
    if (p.rerun) hist.append(h("p",{class:"hint",text:"Last re-run: " + plural(p.rerun.carried, "claim") + " kept " + (p.rerun.carried===1?"its":"their") + " sources and searches" + (p.rerun.orphaned ? "; " + plural(p.rerun.orphaned, "earlier claim") + " with records no longer appear in the new reading (still in history)" : "") + "."}));
    if ((p.adopted||[]).length) hist.append(h("p",{class:"hint",text:plural(p.adopted.length, "set") + " of records from an earlier segmentation " + (p.adopted.length===1?"was":"were") + " reattached here: " + p.adopted.map(function(x){ return "“" + x.claimText + "” from " + (x.from && x.from.title || x.from && x.from.passage || "?"); }).join("; ") + "."}));
    more.append(hist);
  }
  if (!ro && isClaimRun()) more.append(h("div",{class:"row"}, h("button",{class:"btn quiet",type:"button",text: a.by === "person" ? "Explain and grade with the model" : "Explain and grade again",onclick:function(){ if (!ensureAI(more)) return; runClaimExplain(p); }}), h("span",{class:"hint",text:"Types the claim, writes the plain explanation at both levels, says what would settle it and refines the search query. The claim's wording and identity stay as you typed them."})));
  else if (!ro && attributionOk()) more.append(h("div",{class:"row"}, h("button",{class:"btn quiet",type:"button",text:"Re-run this passage",onclick:function(){ if (!ensureAI(more)) return; runDeflate(null,null,null,null,p); }}), h("span",{class:"hint",text:"A re-run keeps this reading in history and carries sources to claims with the same text."})));
  det.append(more); card.append(det);
  return card;
}

/* Everything a person can do about one claim's sources. Inside Details only. */
function claimDetail(card, p, c, idx, ro){
  var r = run();
  var box = h("div",{class:"cdetail", id:card.id + "-claim-" + idx});
  box.append(h("p",{class:"ct"}, h("span",{class:"pill " + c.type,text:c.type}), document.createTextNode(" " + c.text)));
  var stx = settleOf(c); if (stx) box.append(h("div",{class:"settle"}, stx));
  var rv = p.readingRev || 0;
  if (!ro && EMPIRICAL.indexOf(c.type) !== -1){
    var qIn = h("input",{type:"text",value:c.searchQuery||"",placeholder:"Search query (made for you; edit if poor)",style:"min-width:260px"});
    var tSel = h("select",{multiple:"",size:"3",title:"Source types (hold Ctrl/Cmd for several)"}); SOURCE_TYPES.forEach(function(t){ tSel.append(h("option",{value:t,text:t.replace(/_/g," "),selected:(c.expectedSources||[]).indexOf(t) !== -1 ? "selected" : null})); });
    var qBtn = h("button",{class:"btn quiet",type:"button",text:"Save query",onclick:async function(){ qBtn.disabled = true; try { await reload(await API.saveRouting(r.id, p.id, c.id, {searchQuery:qIn.value, expectedSources:Array.prototype.slice.call(tSel.selectedOptions).map(function(o){ return o.value; })}, rv)); openDetails(card, idx); } catch(e){ qBtn.textContent = errCopy(e); qBtn.disabled = false; if (e && e.status === 409) await reload(); } }});
    box.append(h("div",{class:"rc"}, h("span",{class:"hint",text:"Where to look:"}), qIn, tSel, qBtn));
    if (c.routingEditedAt) box.append(h("p",{class:"settle",text:"Query edited by a person " + fmtDate(c.routingEditedAt) + "."}));
  } else if (c.searchQuery || (c.expectedSources||[]).length) box.append(h("p",{class:"settle",text:"Where to look: " + ((c.expectedSources||[]).join(", ") || "type guessed by heuristic") + (c.searchQuery ? " · query “" + c.searchQuery + "”" : "")}));
  var rc = activeReceipts(c), withdrawn = (c.receipts||[]).filter(function(x){ return x.withdrawnAt; }), pending = (c.candidates||[]).filter(function(x){ return x.status === "candidate"; }), nSearches = (c.searches||[]).length;
  if (EMPIRICAL.indexOf(c.type) === -1) { box.append(h("p",{class:"hint",text:"Not a checkable claim; no source is expected. You can still attach one if a document bears on it."})); }
  // receipts on record
  (c.receipts||[]).forEach(function(x, ri){
    var line = h("div",{class:"rc"});
    line.append(h("span",{class:"pill status" + (x.withdrawnAt ? "" : " receipt"),text: x.withdrawnAt ? "withdrawn" : "source"}));
    line.append(h("a",{href:x.url,target:"_blank",rel:"noopener",text:(x.title || x.note || x.url) + (x.journal ? " · " + x.journal : "") + (x.publishedAt ? " · " + String(x.publishedAt).slice(0,4) : "")}));
    line.append(h("span",{class:"hint",text:" " + (x.note && x.title ? "— " + x.note + " " : "") + "(" + (x.addedBy||"") + (x.at ? ", " + fmtDate(x.at) : "") + (x.foundBy && x.foundBy.length ? ", via " + x.foundBy.join("+") : "") + (x.reattached ? ", reattached from an earlier segmentation" : "") + ")"}));
    (x.notices||[]).forEach(function(n){ line.append(h("span",{class:"badge stale",text:(n.label || n.type) + (n.date ? " " + n.date : "")})); });
    if (x.withdrawnAt) line.append(h("span",{class:"hint",text:"Withdrawn " + fmtDate(x.withdrawnAt) + (x.withdrawReason ? ": " + x.withdrawReason : "")}));
    else if (!ro){
      var why = h("input",{type:"text",placeholder:"Why withdraw it?",style:"min-width:160px"});
      var wd = h("button",{class:"btn quiet",type:"button",text:"Withdraw",onclick:async function(){ wd.disabled = true; try { await reload(await API.withdrawReceipt(r.id, p.id, c.id, x.rid, why.value, rv)); } catch(e){ wd.textContent = errCopy(e); if (e && e.status === 409) await reload(); } }});
      line.append(why, wd);
    }
    box.append(line);
  });
  if (!ro){
    var u = h("input",{type:"url",placeholder:"Link to a document"}), n = h("input",{type:"text",placeholder:"What it shows (one line)"});
    var add = h("button",{class:"btn quiet",type:"button",text:"Attach as a source",onclick:async function(){
      if (!u.value.trim()) return; add.disabled = true;
      try { await reload(await API.addReceipt(r.id, p.id, c.id, u.value.trim(), n.value.trim(), rv)); } catch(e){ add.textContent = errCopy(e); add.disabled = false; if (e && e.status === 409) await reload(); }
    }});
    var ctl = h("div",{class:"rc"}, u, n, add);
    if (S.research && EMPIRICAL.indexOf(c.type) !== -1){
      var sb = h("button",{class:"btn quiet",type:"button",text: nSearches ? "Search sources again" : "Search sources",onclick:async function(){
        sb.disabled = true; sb.textContent = "Searching…";
        try { var out = await API.searchClaim(r.id, p.id, c.id, rv); await reload(out.bundle); openDetails(card, idx); if (out.parked) alert("The card was re-read while the search ran, and this claim is not in the new reading. The results were parked (stage 3 lists them) and can be reattached."); } catch(e){ sb.textContent = errCopy(e); sb.disabled = false; if (e && e.status === 409) await reload(); }
      }});
      ctl.append(sb);
    }
    box.append(ctl);
  }
  if (nSearches){
    var att = h("details",{}, h("summary",{class:"hint",text:plural(nSearches, "search attempt") + " on record"}));
    (c.searches||[]).forEach(function(s){ att.append(h("p",{class:"settle",text:s.adapter + (s.field ? " (" + s.field + ")" : "") + ": “" + s.query + "” → " + (s.error ? "error: " + s.error : (s.hitCount + " returned" + (s.totalReported != null && s.totalReported !== s.hitCount ? " of " + Number(s.totalReported).toLocaleString() + " the service counts" : ""))) + (s.msElapsed ? " · " + s.msElapsed + " ms" : "") + " · " + fmtDate(s.at) + (s.readingRev != null ? " · reading " + s.readingRev : "") + (s.late ? " · finished after a re-read" : "") + (s.provisional && s.provisional.length ? " · provisional: " + s.provisional.join("; ") : "")})); });
    box.append(att);
  }
  pending.forEach(function(x){
    var row = h("div",{class:"cand"});
    var head = h("div",{}, h("a",{href:x.url,target:"_blank",rel:"noopener",text:x.title}), h("span",{class:"hint",text:" " + [x.docType, x.journal, x.publishedAt ? String(x.publishedAt).slice(0,10) : "", (x.authors||[]).slice(0,3).join(", "), x.doi ? "doi:" + x.doi : (x.pmid ? "pmid:" + x.pmid : ""), "found by " + (x.foundBy||[x.adapter]).join("+") + (x.matchedBy && x.matchedBy.length ? " [" + x.matchedBy.join(", ") + " match]" : "")].filter(Boolean).join(" · ")}));
    (x.notices||[]).forEach(function(nn){ head.append(h("span",{class:"badge stale",style:"margin-left:6px",text:(nn.label||nn.type) + (nn.source ? " (" + nn.source + ")" : "") + (nn.date ? " " + nn.date : "")})); });
    if (x.statusCheck && !x.statusCheck.checked) head.append(h("span",{class:"hint",text:" · status not checked" + (x.statusCheck.note ? ": " + x.statusCheck.note : "")}));
    else if (x.statusCheck && x.statusCheck.checked && !(x.notices||[]).length) head.append(h("span",{class:"hint",text:" · no retraction or correction notice found (not an endorsement)"}));
    if (x.fullTextUrl) head.append(h("a",{href:x.fullTextUrl,target:"_blank",rel:"noopener",class:"hint",style:"margin-left:6px",text:"full text"}));
    row.append(head);
    if (!ro){
      var note = h("input",{type:"text",placeholder:"What it shows (one line)",style:"min-width:220px"});
      var sel = h("select"); REJECTION_REASONS.forEach(function(rr){ sel.append(h("option",{value:rr[0],text:rr[1]})); });
      var acc = h("button",{class:"btn quiet",type:"button",text:"Accept as a source",onclick:async function(){ acc.disabled = true; try { await reload(await API.acceptCandidate(r.id, p.id, c.id, x.id, note.value, rv)); openDetails(card, idx); } catch(e){ acc.textContent = errCopy(e); if (e && e.status === 409) await reload(); } }});
      var rej = h("button",{class:"btn quiet",type:"button",text:"Reject",onclick:async function(){ rej.disabled = true; try { await reload(await API.rejectCandidate(r.id, p.id, c.id, x.id, sel.value, note.value, rv)); openDetails(card, idx); } catch(e){ rej.textContent = errCopy(e); if (e && e.status === 409) await reload(); } }});
      row.append(h("div",{class:"row"}, note, acc, sel, rej));
    }
    box.append(row);
  });
  if ((c.rejections||[]).length) box.append(h("p",{class:"settle",text:plural(c.rejections.length, "candidate") + " rejected: " + c.rejections.map(function(x){ return (x.title || x.doi || x.url) + " (" + x.reason + (x.detail ? ": " + x.detail : "") + (x.withdrewReceipt ? "; its source was withdrawn" : "") + ")"; }).join("; ")}));
  return box;
}

/* ---- 4 Patterns ---- */
var patternsBody = null;
function renderPatternsPanel(){
  var done = S.b.passages.filter(function(p){ return p.status === "done"; }).length;
  var p = panel("stage-patterns","4","Patterns across the run", S.b.summary ? ((S.b.summary.stale||[]).length ? "Done · stale" : "Done") : (done ? "Ready" : "Waiting on cards"), !!S.b.summary || done > 1);
  patternsBody = body(p);
  return p;
}
function renderPatterns(){
  if (!patternsBody) return; clear(patternsBody);
  var r = run(); if (!r) return;
  var doneAll = S.b.passages.filter(function(p){ return p.status === "done" && p.analysis; });
  var done = doneAll.filter(function(p){ return !(p.stale||[]).length; }), leftOut = doneAll.filter(function(p){ return (p.stale||[]).length; }).map(function(p){ return p.id; });
  var msg = h("div");
  if (!readOnly()){
    var btn = h("button",{class:"btn primary",type:"button",text: S.b.summary ? "Re-run patterns" : "Find patterns",disabled:(done.length<2)?"":null,onclick:async function(){
      if (S.busy) return; if (!ensureAI(patternsBody)) return;
      btn.disabled = true; msg.replaceChildren(h("div",{class:"note info",text:"Thinking…"}));
      try {
        S.abort = new AbortController();
        var res = await API.sample(P.patterns(r, done), {json:true, signal:S.abort.signal}); var out = res.data;
        var known = done.map(function(p){ return p.id; });
        var pats = (Array.isArray(out && out.patterns) ? out.patterns : []).slice(0,12).map(function(x){ return {title:{hs:String(x.title&&x.title.hs||"").slice(0,200), g5:String(x.title&&x.title.g5||"").slice(0,200)}, body:{hs:String(x.body&&x.body.hs||"").slice(0,3000), g5:String(x.body&&x.body.g5||"").slice(0,3000)}, passages:(Array.isArray(x.passages)?x.passages:[]).map(String).filter(function(id){ return known.indexOf(id) !== -1; }).slice(0,30)}; });
        var surv = {hs:String(out && out.survived && out.survived.hs || "").slice(0,4000), g5:String(out && out.survived && out.survived.g5 || "").slice(0,4000)};
        await API.saveSummary(r.id, {patterns:pats, survived:surv, createdAt:nowISO(), passagesCounted:done.length, leftOut:leftOut, by:analyzedByLabel(), model:res.model||"", basedOn:{passagesSig: done.map(function(p){ return p.id + "@" + (p.analyzedAt||""); }).join(",")}});
        var nb = await API.saveRun(r.id, {status:"complete"}); await refreshList(); await reload(nb);
      } catch(e){ msg.replaceChildren(h("div",{class:"note err",text:errCopy(e)})); btn.disabled = false; }
    }});
    patternsBody.append(h("div",{class:"row"}, btn, h("span",{class:"hint",text: done.length < 2 ? "Needs at least two fresh deflated passages." + (leftOut.length ? " " + plural(leftOut.length, "stale card") + " left out; re-run them first." : "") : "Reads every fresh card in full and looks for moves that recur, then lists what came through intact." + (leftOut.length ? " " + plural(leftOut.length, "stale card") + " will be left out." : "")}), msg));
  }
  if (!S.b.summary) return;
  var sm = S.b.summary, wrap = h("div",{});
  if ((sm.stale||[]).length) wrap.append(h("div",{class:"stale-note",text:"Stale: " + sm.stale.join("; ") + ". Re-run patterns to refresh."}));
  if ((sm.leftOut||[]).length) wrap.append(h("p",{class:"hint",text:"Left out as stale when these patterns were found: " + sm.leftOut.join(", ") + "."}));
  wrap.append(h("div",{class:"row"}, h("p",{class:"eyebrow",text:"Recurring moves"}), sm.by ? h("span",{class:"hint",text:"by " + sm.by}) : null, h("span",{class:"spacer"}), levelToggle(wrap)));
  var list = h("div");
  (sm.patterns||[]).forEach(function(pt, i){
    var refs = (pt.passages||[]).map(function(id){ var p = S.b.passages.filter(function(x){ return x.id === id; })[0]; return p ? p.title : id; }).join(" · ");
    list.append(h("div",{class:"pattern"}, h("span",{class:"n",text:String(i+1)}), h("div",{}, h("h4",{}, lvl(pt.title)), lvl(pt.body), refs ? h("p",{class:"refs",text:"Seen in: " + refs}) : null)));
  });
  wrap.append(list);
  wrap.append(h("p",{class:"eyebrow",style:"margin-top:16px;margin-bottom:6px",text:"What survived"}));
  wrap.append(lvl(sm.survived));
  if (sm.note) wrap.append(h("p",{class:"hint",style:"margin-top:10px",text:sm.note}));
  patternsBody.append(wrap);
}

/* ---- 5 Source, provenance record, export ---- */
var exportBody = null;
function renderExport(){
  var p = panel("stage-export","5","Source, provenance record, export", run().sourceUrl ? "Source attached" : "No source link yet", true);
  exportBody = body(p);
  return p;
}
function renderExportBlock(){
  if (!exportBody) return; clear(exportBody);
  var r = run(); if (!r) return;
  var pr = r.provenance || {};
  var kv = h("div",{class:"kv"});
  kv.append(h("span",{class:"k",text:"Interview"}), r.sourceUrl ? h("a",{href:r.sourceUrl,target:"_blank",rel:"noopener",text:r.sourceLabel || r.sourceUrl}) : h("span",{class:"hint",text:"Add the interview link in Intake so every reader can check the original."}));
  if (r.sourceDate) kv.append(h("span",{class:"k",text:"Recorded / released"}), h("span",{text:fmtDate(r.sourceDate)}));
  kv.append(h("span",{class:"k",text:"Transcript"}), h("span",{text: S.turns.length ? S.turns.filter(function(t){return !t.heading;}).length + " turns, " + (S.b.transcript.length||0).toLocaleString() + " characters, saved " + fmtDate(r.transcriptUpdatedAt) : "none"}));
  kv.append(h("span",{class:"k",text:"Attribution"}), h("span",{text: pr.notApplicable ? "Not needed. " + (pr.method||"") : pr.confirmedAt ? ("Confirmed " + fmtDate(pr.confirmedAt) + (pr.confirmedBy ? " by " + pr.confirmedBy : "") + ". " + (pr.method||"")) : (pr.auditedAt ? "Audited" + (pr.auditedBy ? " by " + pr.auditedBy : "") + ", not yet confirmed by a person." : "Not checked. Labels are as the transcript gave them.")}));
  if (r.import) kv.append(h("span",{class:"k",text:"Imported"}), h("span",{text:"Text fetched from " + r.import.url + " on " + fmtDate(r.import.fetchedAt) + " (" + r.import.chars.toLocaleString() + " characters). The page text was read; the link was not graded."}));
  if (pr.flags && pr.flags.length) kv.append(h("span",{class:"k",text:"Flagged turns"}), h("span",{text: pr.flags.map(function(f){ return "[" + f.turn + "]"; }).join(" ")}));
  var over = Object.keys(pr.overrides||{});
  if (over.length) kv.append(h("span",{class:"k",text:"Labels corrected"}), h("span",{text: over.map(function(i){ return "[" + i + "] → " + speakerName(pr.overrides[i]); }).join(", ")}));
  var doneN = S.b.passages.filter(function(p){return p.status==="done";}).length, staleN = S.b.passages.filter(function(p){ return (p.stale||[]).length; }).length;
  var claimsAll = []; S.b.passages.forEach(function(p){ if (p.status==="done"&&p.analysis) (p.analysis.claims||[]).forEach(function(c){ claimsAll.push(c); }); });
  var emp = claimsAll.filter(function(c){ return EMPIRICAL.indexOf(c.type) !== -1; }), withR = emp.filter(function(c){ return claimStatus(c) === "receipt"; }).length, searched = emp.filter(function(c){ return claimStatus(c) === "searched"; }).length;
  kv.append(h("span",{class:"k",text:"Analysis"}), h("span",{text: doneN + " of " + S.b.passages.length + " passages deflated" + (staleN ? ", " + staleN + " stale" : "") + (S.b.summary ? "; patterns found" : "") + ". " + plural(emp.length, "checkable claim") + ": " + withR + " with a source a person attached, " + searched + " searched with nothing attached, " + (emp.length - withR - searched) + " not checked. A source records a person's judgment of relevance; nothing here marks a claim verified."}));
  var qcs = S.b.passages.filter(function(p){ return p.quoteCheck; }); if (qcs.length){ var tq = 0, mq = 0, mm = 0; qcs.forEach(function(p){ tq += p.quoteCheck.quotes; mq += p.quoteCheck.matched; mm += p.quoteCheck.mismatched; }); kv.append(h("span",{class:"k",text:"Quotes"}), h("span",{text: mq + " of " + tq + " quotes match the transcript word for word" + (mm ? "; " + mm + " credited by the model to a different speaker than the transcript shows" : "") + ". Checked on every load against the transcript as saved."})); }
  if ((r.orphans||[]).length) kv.append(h("span",{class:"k",text:"Parked records"}), h("span",{text:plural(r.orphans.length, "set") + " from an earlier segmentation, waiting in stage 3."}));
  if (r.pilotNote) kv.append(h("span",{class:"k",text:"Note"}), h("span",{text:r.pilotNote}));
  exportBody.append(kv);
  if ((S.b.attachments||[]).length){
    var att = h("div",{class:"att"});
    S.b.attachments.forEach(function(x){ if (x.kind === "image") att.append(h("a",{href:"/api/runs/" + r.id + "/attachments/" + x.id,target:"_blank",rel:"noopener"}, h("img",{src:"/api/runs/" + r.id + "/attachments/" + x.id, alt:x.name||"attached picture"}))); });
    exportBody.append(h("div",{}, h("p",{class:"eyebrow",style:"margin-bottom:6px",text:"Pictures kept with the run"}), att));
  }
  if (r.id){
    var row = h("div",{class:"row"});
    row.append(h("a",{class:"btn",href:"/api/runs/" + r.id + "/export.json",download:"",text:"Download claims JSON"}));
    var mdLink = h("a",{class:"btn",href:"/api/runs/" + r.id + "/export.md?level=" + (document.body.classList.contains("level-5") ? "g5" : "hs"),download:"",text:"Download Markdown (" + (document.body.classList.contains("level-5") ? "fifth grade" : "high school") + ")"});
    row.append(mdLink);
    row.append(h("a",{class:"btn",href:"/api/runs/" + r.id + "/obligations.json",download:"",text:"Download obligations (Receipts)"}));
    var cp = h("button",{class:"btn",type:"button",text:"Copy claims JSON",onclick:async function(){ try { var t = await (await fetch("/api/runs/" + r.id + "/export.json")).text(); copyText(t, cp); } catch(e){ cp.textContent = "Failed"; } }}); row.append(cp);
    exportBody.append(row);
  }
  exportBody.append(h("p",{class:"hint",text:"Claims JSON (deflate-lens/claims@0.2) carries every claim with its speaker, turn range, type, judgments, staleness, quote checks, search attempts, sources and withdrawals, and says what each status means. The Markdown follows the reading level selected at the top. Obligations JSON is the checkable claims in the shape Receipts routes (EvidenceObligation.to_json)."}));
}

/* ---- delete ---- */
function confirmDelete(){
  var r = run(); if (!r || !r.id) return;
  var box = h("div",{class:"note err"}, h("p",{text:"Move this run to the trash? It is moved to the trash folder inside the data folder, not removed, and can be restored from the Trash list on the left."}), h("div",{class:"row"},
    h("button",{class:"btn danger",type:"button",text:"Move to trash",onclick:async function(){ try { await API.deleteRun(r.id); S.runId = null; S.b = null; try { location.hash = ""; localStorage.removeItem("deflate-run"); } catch(e){} await refreshList(); renderRun(); } catch(e){ box.append(h("p",{text:"Could not move it: " + errCopy(e)})); } }}),
    h("button",{class:"btn quiet",type:"button",text:"Keep it",onclick:function(){ box.remove(); }})));
  view.insertBefore(box, view.children[1] || null);
}

window.addEventListener("hashchange", function(){ var id = hashRun(); if (id && id !== S.runId && S.runs.some(function(r){ return r.id === id; })) selectRun(id); });
boot();
})();
