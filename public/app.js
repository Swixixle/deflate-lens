/* Deflate Lens, browser side. Talks to the local server (server/app.js) over /api. No keys live here.
   The page shows one thing at a time: the start box, a reading, or the User Guide. Readings and Controls open as
   panels on demand. While a reading is being prepared the page polls the server and updates only what changed, so
   scroll position, focus, open Evidence, unsaved fields and each card's reading level survive. The page never builds
   a reading prompt: every reading, reread and overview is made by the server under one contract. */
(function(){
"use strict";
var SH = window.DeflateShared;
var P = window.DeflatePrompts;
var parseTranscript = SH.parseTranscript, speakerLabels = SH.speakerLabels, chunkRanges = SH.chunkRanges;

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
function plural(n, one, many){ return n + " " + (n === 1 ? one : (many || one + "s")); }
function fmtDur(s){ s = Number(s)||0; var m = Math.round(s/60); return m >= 90 ? (Math.floor(m/60) + " h " + (m%60) + " min") : m + " min"; }
function fmtSecs(s){ s = Math.round(Number(s)||0); var m = Math.floor(s/60), r = s % 60; return m ? m + " min" + (r ? " " + r + " s" : "") : r + " s"; }
function cap(s){ s = String(s||""); return s.charAt(0).toUpperCase() + s.slice(1); }
function hasFn(o, name){ return !!o && typeof o[name] === "function"; }
function paras(el, text){ String(text||"").split(/\n{2,}|\n/).forEach(function(t){ if (t.trim()) el.append(h("p",{text:t.trim()})); }); }
/* Model text at both reading levels; CSS shows the one chosen for the card (or the page). */
function lvl(obj){
  var hs = (obj && typeof obj === "object") ? (obj.hs || "") : (obj || "");
  var g5 = (obj && typeof obj === "object") ? (obj.g5 || "") : (obj || "");
  var wrap = h("div", {class:"lvl"});
  var a = h("div", {class:"lvl-hs"}); paras(a, hs);
  var b = h("div", {class:"lvl-5"}); paras(b, g5 || hs);
  wrap.append(a, b);
  return wrap;
}
function errCopy(e){
  var c = e && e.code;
  var map = {
    no_ai:"Add the model key once to continue.",
    bad_key:"The model key was not accepted. Replace it and try again.",
    rate_limited:"Too many requests right now. Wait a minute and try again.",
    cancelled:"Stopped.",
    stale_reading:"This card changed since you looked (another tab, a reread, or an edit). It has been reloaded; try again.",
    claim_not_current:"That claim is no longer in the current reading of this card. The page has been reloaded.",
    reading_running:"A reading is already running. Wait for it to finish, or press Stop first.",
    source_changed:"The source changed since this page was loaded. Look at the current source before confirming.",
    nothing_to_confirm:"This source was named directly; there is nothing to confirm.",
    attribution_held:"Speaker preparation must finish before reading.",
    upstream_error:"The model request failed. Check the server terminal for details and try again."
  };
  return map[c] || ((e && e.message) ? String(e.message) : "Something failed.");
}
function copyText(txt, btn){
  var done = function(ok){ var old = btn.textContent; btn.textContent = ok ? "Copied" : "Select and copy"; setTimeout(function(){ btn.textContent = old; }, 1600); };
  try { navigator.clipboard.writeText(txt).then(function(){ done(true); }, function(){ done(false); }); } catch(e){ done(false); }
}
function hostOf(u){ try { return new URL(u).hostname.replace(/^www\./, ""); } catch(e){ return u; } }

var SOURCE_TYPES = ["corporate_filing","congressional_record","hearing_transcript","federal_court_filing","state_court_filing","regulatory_rule","regulatory_comment","campaign_finance_record","lobbying_disclosure","agency_report","news_coverage","long_form_journalism","academic_paper","patent","government_data","investigative_document","network_record","federal_contract","book_or_edition","company_statement","survey_report","transcript_or_recording"];
var REJECTION_REASONS = [["does_not_address_claim","Does not address the claim"],["wrong_document_type","Wrong kind of document"],["no_primary_source","Not a primary source"],["out_of_date_window","Outside the relevant period"],["retracted_or_corrected","Retracted or corrected"],["duplicate","Duplicate of an accepted source"],["below_score_threshold","Too weak to count"]];
var EMPIRICAL = SH.EMPIRICAL_TYPES || ["claim","fact","contested","unsupported"];
/* What a person says a source does for the claim. Default "unstated": attaching a document never implies support. */
var RELATIONS = [["unstated","Relation not stated"],["supports","Supports the claim"],["contradicts","Contradicts the claim"],["mentions","Mentions it, settles nothing"]];
function relationCounts(rc){ var n = {supports:0, contradicts:0, mentions:0, unstated:0}; rc.forEach(function(x){ var r = x.relation || "unstated"; n[r in n ? r : "unstated"]++; }); return n; }

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
  intake(input, context){ return API.req("POST", "/api/intake", {input:input, context:context||{}}); },
  readRun(id){ return API.req("POST", "/api/runs/" + id + "/read", {}); },
  stopReading(id){ return API.req("POST", "/api/runs/" + id + "/stop", {}); },
  reread(id, pid){ return API.req("POST", "/api/runs/" + id + "/passages/" + pid + "/reread", {}); },
  overview(id){ return API.req("POST", "/api/runs/" + id + "/overview", {}); },
  reorganize(id){ return API.req("POST", "/api/runs/" + id + "/reorganize", {}); },
  confirmSource(id, sourceUrl, key){ return API.req("POST", "/api/runs/" + id + "/source/confirm", {sourceUrl:sourceUrl, key:key}); },
  saveRun(id, run, transcript){ return API.req("PUT","/api/runs/" + id, {run:run, transcript:transcript}); },
  deleteRun(id){ return API.req("DELETE","/api/runs/" + id); },
  /* Speakers, on request: worked out from the words, separated by voice from the recording, or named by the person. */
  speakersFromWords(id, signal){ return API.req("POST","/api/runs/" + id + "/speakers-from-words", {}, signal); },
  voices(id, link, signal){ return API.req("POST","/api/runs/" + id + "/voices", {link:link||""}, signal); },
  confirmNames(id, names){ return API.req("POST","/api/runs/" + id + "/confirm-names", {names:names}); },
  pageText(id){ return API.req("POST","/api/runs/" + id + "/page-text", {}); },
  duplicateRun(id){ return API.req("POST","/api/runs/" + id + "/duplicate"); },
  addAttachment(id, payload){ return API.req("POST","/api/runs/" + id + "/attachments", payload); },
  /* Used only for picture transcription and the optional attribution check; readings are made by the server. */
  sample(prompt, opts){
    opts = opts || {};
    var r = run();
    return API.req("POST","/api/sample", {prompt:prompt, json:!!opts.json, images:opts.images||[], runId: r ? r.id : "", purpose: opts.purpose || "", basedOn: r ? {inputHash: r.input && r.input.sha256 || "", transcriptUpdatedAt: r.transcriptUpdatedAt, attrSig: S.b.attrSig} : null}, opts.signal);
  },
  /* Every claim mutation names the claim by its id and the reading the page rendered; the server refuses (409) when
     the card moved on, instead of writing over a newer reading. */
  searchClaim(id, pid, cid, rev){ return API.req("POST","/api/runs/" + id + "/passages/" + pid + "/claims/" + cid + "/search", {expectedReadingRev:rev}); },
  acceptCandidate(id, pid, cid, cand, note, rev, relation){ return API.req("POST","/api/runs/" + id + "/passages/" + pid + "/claims/" + cid + "/candidates/" + cand + "/accept", {note:note||"", relation:relation||"unstated", expectedReadingRev:rev}); },
  rejectCandidate(id, pid, cid, cand, reason, detail, rev){ return API.req("POST","/api/runs/" + id + "/passages/" + pid + "/claims/" + cid + "/candidates/" + cand + "/reject", {reason:reason, detail:detail||"", expectedReadingRev:rev}); },
  addReceipt(id, pid, cid, url, note, rev, relation){ return API.req("POST","/api/runs/" + id + "/passages/" + pid + "/claims/" + cid + "/receipts", {url:url, note:note||"", relation:relation||"unstated", expectedReadingRev:rev}); },
  setRelation(id, pid, cid, rid, relation, rev){ return API.req("PUT","/api/runs/" + id + "/passages/" + pid + "/claims/" + cid + "/receipts/" + rid + "/relation", {relation:relation, expectedReadingRev:rev}); },
  withdrawReceipt(id, pid, cid, rid, reason, rev){ return API.req("POST","/api/runs/" + id + "/passages/" + pid + "/claims/" + cid + "/receipts/" + rid + "/withdraw", {reason:reason||"", expectedReadingRev:rev}); },
  saveRouting(id, pid, cid, routing, rev){ return API.req("PUT","/api/runs/" + id + "/passages/" + pid + "/claims/" + cid + "/routing", Object.assign({expectedReadingRev:rev}, routing)); },
  attachOrphan(id, oid, pid, cid){ return API.req("POST","/api/runs/" + id + "/orphans/" + oid + "/attach", {pid:pid, idx:cid}); },
  /* The transcript chain for a podcast or video link runs as a job: start it, poll it, stop it. */
  resolveTranscript(url, guid, choice, context, targetRunId){ return API.req("POST","/api/transcript/resolve", {url:url, guid:guid||"", choice:choice||"", context:context||{}, targetRunId:targetRunId||""}); },
  consumeJob(id){ return API.req("POST","/api/transcript/jobs/" + id + "/consume"); },
  dismissJob(id){ return API.req("POST","/api/transcript/jobs/" + id + "/dismiss"); },
  job(id){ return API.req("GET","/api/transcript/jobs/" + id); },
  cancelJob(id){ return API.req("POST","/api/transcript/jobs/" + id + "/cancel"); },
  engines(){ return API.req("GET","/api/transcript/engines"); },
  installLocal(){ return API.req("POST","/api/transcript/local/install"); },
  setSetting(name, key){ return API.req("POST","/api/settings/key", {name:name, key:key}); },
  preferEngine(engine){ return API.req("PUT","/api/transcript/prefer", {engine:engine}); },
  setKey(key){ return API.req("POST","/api/settings/anthropic-key", {key:key}); },
  listTrash(){ return API.req("GET","/api/trash"); },
  restoreRun(name){ return API.req("POST","/api/trash/" + name + "/restore"); }
};
function fileToBase64(file){ return new Promise(function(resolve, reject){ var r = new FileReader(); r.onload = function(){ resolve(String(r.result).split(",")[1]); }; r.onerror = reject; r.readAsDataURL(file); }); }

/* ---------- state ---------- */
var S = {health:null, ai:null, research:null, engines:null, runs:[], trash:[], runId:null, b:null, turns:[], busy:false, abort:null, view:"new", rendered:null, draft:{}};
/* UI state that survives every redraw: which disclosures are open, what a person has typed but not saved, and the
   signature of what each region last showed. */
var UI = {open:{}, drafts:{}, sig:{}, cardSig:{}, drawer:null, deferred:false};
var $ = function(id){ return document.getElementById(id); };
var view = $("runView"), welcome = $("welcome");
function setStore(cls, text){ var c = $("storeChip"), t = $("storeText"); if (c) { c.className = "chip " + cls; c.hidden = !text; } if (t) t.textContent = text || ""; }
var sayTimer = null;
function say(text){ var el = $("say"); if (!el) return; el.textContent = text; if (sayTimer) clearTimeout(sayTimer); sayTimer = setTimeout(function(){ el.textContent = ""; }, 7000); }
function run(){ return S.b && S.b.run; }
function overrides(){ var r = run(); return r && r.provenance && r.provenance.overrides || {}; }
function effSpeaker(t){ return SH.effSpeaker(t, overrides()); }
function speakerName(key){ var r = run(); var s = r && (r.speakers||[]).filter(function(x){ return x.key === key; })[0]; return key === "UNLABELED" ? "Speaker not established" : (s && s.name) ? s.name : key; }
/* A text with no speaker labels at all shows its words without a speaker in front of every line; one quiet notice says
   so. "Speaker not established" stays where some speakers are known and these words could not be placed. */
function allUnlabeled(){ var l = speakerLabels(S.turns); return !isClaimRun() && l.length > 0 && l.every(function(x){ return x === "UNLABELED"; }); }
function whoPrefix(key){ return allUnlabeled() && key === "UNLABELED" ? "" : speakerName(key) + ": "; }
/* Why a reading couldn't be completed, in plain words: which part of the card, which level, what is wrong; speaker
   labels by their names. */
function plainReason(x){
  var s = SH.issueText(FRIENDLY[x] || String(x)).replace(/\b(SPEAKER \d+|CLIP \d+|QUOTE \d+|UNLABELED)\b/g, function(k){ return speakerName(k); });
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return /[.?!”"]$/.test(s) ? s : s + ".";
}
function attributionOk(){ var r = run(), pr = r && r.provenance || {}; return !!(S.b && S.b.attributionGate && S.b.attributionGate.status === "ready" || pr.confirmedAt || pr.notApplicable); }
function isClaimRun(){ var r = run(); return !!(r && r.kind === "claim"); }
function fmtTurns(from, to, ov){ return SH.fmtTurns(S.turns, ov === undefined ? overrides() : ov, from, to); }
function readOnly(){ var r = run(); return !!(r && r.example); }
function running(){ var r = run(); return !!(r && r.processing && r.processing.status === "running"); }
function isReady(p){ return !!(p && p.status === "done" && p.analysis && p.readingGate && p.readingGate.status === "ready"); }
function analyzedByLabel(){ return "deflate-lens local" + (S.ai ? " · " + (S.ai.mock ? "MOCK" : S.ai.model) : ""); }
function blockWhileBusy(){ if (!S.busy) return false; say("Wait for the current step to finish first."); return true; }

/* Typed-but-unsaved values: a field built with keep() gets back what the person typed after any redraw. Never used for
   secrets. */
function keep(el, key){
  el.setAttribute("data-key", key);
  if (Object.prototype.hasOwnProperty.call(UI.drafts, key)) el.value = UI.drafts[key];
  el.addEventListener(el.tagName === "SELECT" ? "change" : "input", function(){ UI.drafts[key] = el.value; });
  return el;
}
function forget(){ for (var i = 0; i < arguments.length; i++) delete UI.drafts[arguments[i]]; }
function disclosure(key, summary, cls){
  var d = h("details",{class:cls||"", "data-key":key, open: UI.open[key] ? "" : null}, h("summary",{text:summary}));
  d.addEventListener("toggle", function(){ UI.open[key] = !!d.open; });
  return d;
}
/* Focus and typing guards for the targeted updates. In a browser without these APIs they do nothing. */
function activeEl(){ return (typeof document !== "undefined" && document.activeElement) || null; }
function within(el, node){ return !!(el && node && hasFn(el, "contains") && el.contains(node)); }
function typingIn(el){ var a = activeEl(); return !!(a && within(el, a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || "")); }
function focusKeyIn(el){
  var a = activeEl(); if (!a || !within(el, a)) return null;
  var claim = hasFn(a, "closest") ? a.closest("[data-claim]") : null, card = hasFn(a, "closest") ? a.closest(".card") : null;
  return { key: a.getAttribute && a.getAttribute("data-key"), id: a.id, text: a.textContent, claim: claim && claim.getAttribute("data-claim"), card: card && card.id };
}
function restoreFocus(el, f){
  if (!f || !hasFn(el, "querySelector")) return;
  var t = (f.key && el.querySelector('[data-key="' + f.key + '"]')) || (f.id && $(f.id)) ||
    (f.claim && el.querySelector('[data-claim="' + f.claim + '"]')) || (f.card && $(f.card) && $(f.card).querySelector(".card-title"));
  if (t && within(el, t) && hasFn(t, "focus")) t.focus({preventScroll:true});
}
/* Keep the reader's place: the first card in view stays where it is on screen while content above it changes. */
function withAnchor(fn){
  var anchor = null, top = 0;
  if (typeof window !== "undefined" && hasFn(window, "scrollBy") && hasFn(document, "querySelectorAll")) {
    var slots = document.querySelectorAll("#cards .slot");
    for (var i = 0; i < slots.length; i++) { if (!hasFn(slots[i], "getBoundingClientRect")) break; var r = slots[i].getBoundingClientRect(); if (r.bottom > 80) { anchor = slots[i]; top = r.top; break; } }
  }
  fn();
  if (anchor && within(document.body, anchor)) { var d = anchor.getBoundingClientRect().top - top; if (Math.abs(d) > 1 && top < (window.innerHeight || 800)) window.scrollBy(0, d); }
}

/* ---------- reading levels ----------
   One page default (stored per browser; High school unless the person chose otherwise) and an optional override per
   card, stored by run and passage id. Switching never calls the model: both levels are already in the reading. */
var LEVEL_KEY = "deflate-level";
function storeSet(k, v){ try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch(e){} }
function storeGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function pageLevel(){ return storeGet(LEVEL_KEY) === "5" ? "5" : "hs"; }
function cardKey(rid, pid){ return "deflate-card-level:" + rid + ":" + pid; }
function cardOverride(rid, pid){ var v = storeGet(cardKey(rid, pid)); return v === "5" || v === "hs" ? v : null; }
function levelFor(rid, pid){ return cardOverride(rid, pid) || pageLevel(); }
function levelSwitch(label, current, onPick, cls){
  var g = h("div",{class:"levels" + (cls ? " " + cls : ""), role:"group", "aria-label":label});
  [["hs","High school"],["5","Fifth grade"]].forEach(function(o){
    g.append(h("button",{type:"button", "data-level":o[0], "aria-pressed": current === o[0] ? "true" : "false", text:o[1], onclick:function(){ onPick(o[0]); }}));
  });
  return g;
}
function markPressed(group, value){ group.querySelectorAll("button").forEach(function(b){ b.setAttribute("aria-pressed", b.getAttribute("data-level") === value ? "true" : "false"); }); }
function applyCardLevel(card){
  var rid = card.getAttribute("data-run"), pid = card.getAttribute("data-pid"), l = levelFor(rid, pid);
  card.setAttribute("data-level", l);
  var g = card.querySelector(".levels"); if (g) markPressed(g, l);
  var reset = card.querySelector(".level-reset"); if (reset) reset.hidden = !cardOverride(rid, pid);
}
function setPageLevel(l){
  storeSet(LEVEL_KEY, l === "5" ? "5" : "hs");
  document.querySelectorAll(".card").forEach(applyCardLevel);
  var across = $("across"); if (across) across.setAttribute("data-level", pageLevel());
  document.querySelectorAll(".page-level").forEach(function(g){ markPressed(g, pageLevel()); });
}

/* ---------- panels: Readings and Controls ---------- */
var DRAWERS = { readings: "readingsBtn", controls: "controlsBtn" };
function openDrawer(name, focusSel){
  if (UI.drawer && UI.drawer !== name) closeDrawer(UI.drawer, true);
  var panel = $(name); if (!panel) return;
  if (name === "controls") renderControls(true);
  if (name === "readings") renderRunList();
  panel.hidden = false; UI.drawer = name;
  var btn = $(DRAWERS[name]); if (btn) btn.setAttribute("aria-expanded", "true");
  var back = $("backdrop"); if (back) back.hidden = false;
  if (document.body && document.body.classList) document.body.classList.toggle("panel-open", true);
  var target = (focusSel && panel.querySelector(focusSel)) || panel.querySelector(".panel-close");
  if (target && hasFn(target, "focus")) { target.focus(); if (focusSel && hasFn(target, "scrollIntoView")) target.scrollIntoView({block:"start"}); }
}
function closeDrawer(name, keepFocus){
  var panel = $(name); if (!panel) return;
  panel.hidden = true; if (UI.drawer === name) UI.drawer = null;
  var btn = $(DRAWERS[name]); if (btn) btn.setAttribute("aria-expanded", "false");
  var back = $("backdrop"); if (back) back.hidden = true;
  if (document.body && document.body.classList) document.body.classList.toggle("panel-open", false);
  if (!keepFocus && btn && hasFn(btn, "focus")) btn.focus();
}
function toggleDrawer(name){ if (UI.drawer === name) closeDrawer(name); else openDrawer(name); }
function focusables(el){ return Array.prototype.filter.call(el.querySelectorAll("a[href],button,input,textarea,select,summary"), function(x){ return !x.disabled && x.offsetParent !== null; }); }
(function wirePanels(){
  var rb = $("readingsBtn"), cb = $("controlsBtn"), back = $("backdrop");
  if (rb) rb.addEventListener("click", function(){ toggleDrawer("readings"); });
  if (cb) cb.addEventListener("click", function(){ toggleDrawer("controls"); });
  if (back) back.addEventListener("click", function(){ if (UI.drawer) closeDrawer(UI.drawer); });
  ["readings","controls"].forEach(function(n){ var p = $(n); var x = p && p.querySelector(".panel-close"); if (x) x.addEventListener("click", function(){ closeDrawer(n); }); });
  if (hasFn(document, "addEventListener")) {
    document.addEventListener("keydown", function(e){
      if (!UI.drawer) return;
      if (e.key === "Escape") { e.preventDefault(); closeDrawer(UI.drawer); return; }
      if (e.key === "Tab") { var f = focusables($(UI.drawer)); if (!f.length) return; var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && activeEl() === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && activeEl() === last) { e.preventDefault(); first.focus(); } }
    });
    // a region skipped while someone typed in it is brought up to date when they leave the field
    document.addEventListener("focusout", function(){ if (UI.deferred) setTimeout(function(){ if (UI.deferred) { UI.deferred = false; if (S.view === "run") updateRunView(); if (UI.drawer === "controls") renderControls(); } }, 0); });
  }
})();

/* ---------- boot ---------- */
async function boot(){
  try { S.health = await API.health(); } catch(e){ setStore("off","Cannot reach the local server. Is it running? (npm start)"); renderRun(); return; }
  S.ai = S.health.ai; S.research = S.health.research || null;
  setStore(S.ai && S.ai.mock ? "busy" : "ready", S.ai && S.ai.mock ? "Mock output" : (S.research && S.research.mock ? "Mock sources" : ""));
  await refreshList();
  // reopen the start box only for a fetch still running or a finished transcript waiting to be read; an episode list or
  // an engine choice left behind does not take over the page (it stays available until a new fetch replaces it)
  try { var eng = await API.engines(); S.engines = eng; S.resumeFetch = (eng.pending||eng.running||[]).filter(function(j){ return j.state === "running" || j.state === "interrupted" || (j.state === "done" && (j.resultKind === "transcript" || j.resultKind === "article")); })[0] || null; } catch(e){}
  if (S.resumeFetch) { newReading(); return; }
  if (/^#guide/.test(location.hash || "")) { S.runId = rememberedRun(); showGuide(location.hash.slice(7)); return; }
  var want = hashRun() || rememberedRun();
  if (want && S.runs.some(function(r){ return r.id === want; })) selectRun(want);
  else newReading();
}
function hashRun(){ var m = /^#run-([A-Za-z0-9_-]+)$/.exec(location.hash||""); return m ? m[1] : null; }
function rememberedRun(){ return storeGet("deflate-run"); }
async function refreshList(){ try { S.runs = await API.listRuns(); } catch(e){ S.runs = []; } try { S.trash = await API.listTrash(); } catch(e){ S.trash = []; } renderRunList(); }

/* ---------- Readings ---------- */
function stageName(s){ return ({draft:"Saved", attributed:"Preparing", segmented:"Preparing", analyzed:"Reading", complete:"Ready"})[s] || s || "Saved"; }
function renderRunList(){
  var ul = $("runList"); if (!ul) return; clear(ul);
  if (!S.runs.length) ul.append(h("li",{class:"hint",text:"No readings yet."}));
  S.runs.forEach(function(r){
    ul.append(h("li",{}, h("button",{type:"button", class:"run-item", "aria-current": r.id === S.runId ? "true" : "false", onclick:function(){ closeDrawer("readings", true); selectRun(r.id); }},
      h("span",{class:"t"}, document.createTextNode(r.title || "Untitled reading"), r.example ? h("span",{class:"tag",text:"example"}) : null),
      h("span",{class:"m",text:(r.kind === "claim" ? "Claim · " : "") + stageName(r.status) + " · " + fmtDate(r.createdAt) + (r.passageCount > 1 ? " · " + r.passageCount + " passages" : "")}))));
  });
  var tr = $("trash"); if (!tr) return; clear(tr);
  if (!(S.trash||[]).length){ tr.hidden = true; return; }
  tr.hidden = false;
  var det = disclosure("trash", "Trash · " + plural(S.trash.length, "reading"), "trash-list");
  S.trash.forEach(function(t){ det.append(h("div",{class:"row"}, h("span",{class:"hint",text:(t.title || t.id) + " · " + fmtDate(t.deletedAt)}), h("button",{class:"btn quiet",type:"button",text:"Restore",onclick:async function(){ try { var out = await API.restoreRun(t.name); await refreshList(); closeDrawer("readings", true); selectRun(out.id); } catch(e){ say(errCopy(e)); } }}))); });
  tr.append(det);
}
function newReading(){
  if (blockWhileBusy()) return;
  if (S.activeTranscriptJobId && !S.resumeFetch) { API.dismissJob(S.activeTranscriptJobId).catch(function(){}); S.activeTranscriptJobId = null; S.resumedJobs = false; }
  S.runId = null; S.b = null; S.turns = []; S.view = "new"; S.rendered = null;
  try { if (location.hash) location.hash = ""; } catch(e){}
  closeDrawer("readings", true);
  renderRunList(); renderRun();
  var ta = $("f-text"); if (ta && hasFn(ta, "focus") && !S.resumeFetch) ta.focus();
}
var nr = $("newRun"); if (nr) nr.addEventListener("click", newReading);

/* ---------- selecting / reloading a run ---------- */
async function selectRun(id){
  if (blockWhileBusy()) { try { location.hash = S.runId ? "run-" + S.runId : ""; } catch(e){} return false; }
  if (id !== S.runId) { S.rendered = null; }
  S.runId = id; S.view = "run";
  try { location.hash = "run-" + id; } catch(e){}
  storeSet("deflate-run", id);
  await reload();
  renderRunList();
}
async function reload(bundle){
  var selectedId = S.runId;
  if (!selectedId || (bundle && (!bundle.run || bundle.run.id !== selectedId))) return false;
  var loaded;
  try { loaded = bundle || await API.getRun(selectedId); } catch(e){ if (S.runId !== selectedId) return false; S.b = null; S.runId = null; renderRun(); return false; }
  if (S.runId !== selectedId || !loaded || !loaded.run || loaded.run.id !== selectedId) return false;
  var textChanged = !S.b || S.b.transcript !== loaded.transcript || S.b.run.parseMode !== loaded.run.parseMode;
  S.b = loaded;
  if (textChanged) S.turns = parseTranscript(S.b.transcript || "", {mode: S.b.run && S.b.run.parseMode === "text" ? "text" : "transcript"});
  if (S.view === "guide") return true;
  S.view = "run";
  if (S.rendered === selectedId) updateRunView(); else renderRun();
  return true;
}

/* ---------- the view ---------- */
function renderRun(){
  var g = $("guideView");
  if (S.view === "guide") { if (view) view.hidden = true; if (welcome) welcome.hidden = true; if (g) g.hidden = false; return; }
  if (g) g.hidden = true;
  if (welcome) welcome.hidden = true;
  if (!S.runId || !S.b) { renderNew(); return; }
  renderRunSkeleton();
}

/* ---- the start box ----
   One box, one helper line, Upload transcript, and one Read this. Context is optional and lives in Controls. A link
   is fetched by the transcript chain, which asks only for a choice it cannot make itself (which episode; how to turn
   audio into text), and then continues by itself. */
function describeKind(text){
  var d = SH.detectKind(text);
  var podcast = false; if (d.kind === "link") { var host = hostOf(d.url); podcast = /(^|\.)(podcasts\.apple\.com|spotify\.com|youtube\.com|youtu\.be)$/.test(host) || /feeds?\.|rss|\.xml$|\/rss\b|\/feed\b/i.test(d.url); }
  return {d:d, text: d.kind === "link" ? (podcast ? "A podcast or video link: the app finds its transcript, then reads it." : "A link: the app reads the page or finds its transcript.") : "Paste text or a link, or upload a transcript."};
}
function renderNew(){
  S.view = "new"; S.rendered = null; UI.sig = {}; UI.cardSig = {};
  if (!view) return;
  view.hidden = false; clear(view);
  var sec = h("section",{class:"intake", id:"intake", "aria-labelledby":"intake-title"});
  sec.append(h("h1",{id:"intake-title", text:"What would you like to read?"}));
  var ta = keep(h("textarea",{id:"f-text", rows:"7", "aria-labelledby":"intake-title", "aria-describedby":"f-kind"}), "intake-text");
  var kind = h("p",{class:"hint", id:"f-kind"});
  var file = h("input",{id:"f-file", type:"file", accept:".txt,.md,.srt,.vtt,.json,text/plain", class:"file-input", tabindex:"-1", "aria-hidden":"true"});
  var go = h("button",{class:"btn primary", id:"readThis", type:"button", text:"Read this", onclick:function(){ return onGo(); }});
  var upload = h("button",{class:"btn", id:"uploadBtn", type:"button", text:"Upload transcript", onclick:function(){ if (hasFn(file, "click")) file.click(); }});
  var ctx = h("button",{class:"linkish", id:"addContext", type:"button", text: S.draft.title || S.draft.sourceUrl || S.draft.sourceLabel ? "Context added · edit" : "Add context", onclick:function(){ openDrawer("controls", "#ctl-input"); }});
  var msg = h("div",{class:"intake-msg", id:"intake-msg"});
  sec.append(ta, kind, h("div",{class:"row intake-actions"}, go, upload, file, ctx), msg);
  view.append(sec);
  var kindNow = null;
  function updateStats(){ var k = describeKind(ta.value); kindNow = k.d; kind.textContent = k.text; }
  async function loadFile(f){
    if (!f) return;
    if (!/\.(txt|md|srt|vtt|json)$/i.test(f.name || "")) { kind.textContent = "Use a transcript file (.txt, .srt, .vtt, or .md), or paste the text or a link."; return; }
    go.disabled = true; kind.textContent = "Opening " + f.name + "…";
    try { ta.value = await f.text(); UI.drafts["intake-text"] = ta.value; updateStats(); }
    catch(e) { kind.textContent = "Could not open the file. Paste the transcript instead."; }
    finally { go.disabled = false; }
  }
  file.addEventListener("change", function(){ return loadFile(file.files && file.files[0]); });
  ta.addEventListener("input", updateStats);
  ta.addEventListener("keydown", function(e){ if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onGo(); } });
  ta.addEventListener("dragover", function(e){ e.preventDefault(); });
  ta.addEventListener("drop", function(e){ e.preventDefault(); loadFile(e.dataTransfer && e.dataTransfer.files[0]); });
  updateStats();
  var onWords = async function(t, imp, jobId){
    var nb2 = await API.consumeJob(jobId); S.runId = nb2.run.id; S.view = "run"; S.resumeFetch = null; forget("intake-text"); S.draft = {};
    try { location.hash = "run-" + S.runId; } catch(e){} storeSet("deflate-run", S.runId);
    await refreshList(); await reload(nb2);
  };
  // a fetch started before this page was opened (a reload during a long transcription) is picked up here, once
  if (S.resumeFetch && !S.resumedJobs) { (async function(){
    await Promise.resolve();
    if (S.resumedJobs || (document.body && hasFn(document.body, "contains") && !document.body.contains(ta))) return;
    var job = S.resumeFetch; if (!job || !job.url) return;
    S.resumedJobs = true; ta.value = job.url; updateStats();
    if (S.busy) return; S.busy = true; go.disabled = true;
    try { await fetchTranscriptInner(job.url, job.guid || "", job.choice || "", {msg:msg, ta:ta, updateStats:updateStats, fromGo:true, onWords:onWords, context:job.context||{}, targetRunId:job.targetRunId||""}, job.id); }
    catch(e) { msg.replaceChildren(h("div",{class:"note err",text:errCopy(e)})); }
    finally { S.busy = false; go.disabled = false; }
  })(); }
  async function onGo(){
    if (blockWhileBusy()) return; S.busy = true; go.disabled = true; clear(msg);
    var text = ta.value, k = kindNow || describeKind(text).d;
    try {
      if (k.kind === "empty") { msg.append(h("p",{class:"note",text:"Upload a transcript or paste something to read."})); return; }
      var doc = {title:(S.draft.title||"").trim(), sourceUrl:(S.draft.sourceUrl||"").trim(), sourceLabel:(S.draft.sourceLabel||"").trim(), sourceDate:S.draft.sourceDate||""};
      Object.keys(doc).forEach(function(x){ if (!doc[x]) delete doc[x]; });
      if (k.kind === "link") { await fetchTranscript(k.url, "", "", {msg:msg, ta:ta, updateStats:updateStats, fromGo:true, onWords:onWords, context:doc, targetRunId:""}); return; }
      msg.append(h("p",{class:"note info",text:"Saving and preparing your reading…"}));
      var nb = await API.intake(text, doc);
      S.runId = nb.run.id; S.view = "run"; forget("intake-text"); S.draft = {};
      try { location.hash = "run-" + S.runId; } catch(e){} storeSet("deflate-run", S.runId);
      await refreshList(); await reload(nb);
    } catch(e) { msg.replaceChildren(h("div",{class:"note err",text:errCopy(e)})); }
    finally { S.busy = false; go.disabled = false; }
  }
}

/* ---- the transcript chain on the page ----
   Starts the server job for a link, shows each step as it happens, and continues by itself once the words arrive.
   When the chain reaches the audio and no engine has been chosen yet, it asks once and then carries on. */
async function fetchTranscript(link, guid, choice, ui){
  if (S.busy && !ui.fromGo){ blockWhileBusy(); return; }
  var own = !ui.fromGo; if (own) S.busy = true;
  try { await fetchTranscriptInner(link, guid, choice, ui); } catch(e) { ui.msg.replaceChildren(h("div",{class:"note err",text:errCopy(e)})); } finally { if (own) S.busy = false; }
}
async function fetchTranscriptInner(link, guid, choice, ui, existingJobId){
  clear(ui.msg);
  var box = h("div",{class:"note info"}), steps = h("ul",{class:"steps"}), prog = h("p",{class:"hint"}), stop = h("button",{class:"btn quiet",type:"button",text:"Stop"});
  box.append(h("p",{text:(existingJobId ? "Still finding the transcript for " : "Finding the transcript for ") + link + "…"}), steps, prog, stop); ui.msg.append(box);
  var jobId = existingJobId;
  if (!jobId) { var started; try { if (ui.jobId) await API.dismissJob(ui.jobId); started = await API.resolveTranscript(link, guid, choice, ui.context, ui.targetRunId); } catch(e){ ui.msg.replaceChildren(h("div",{class:"note",text:errCopy(e)}), fallbackHint(link)); return; } jobId = started.jobId; }
  ui.jobId = jobId; S.activeTranscriptJobId = jobId;
  var cancelled = false, shown = 0, misses = 0;
  stop.onclick = async function(){ cancelled = true; stop.disabled = true; try { await API.cancelJob(jobId); } catch(e){} };
  var j = null;
  for (;;){
    try { j = await API.job(jobId); misses = 0; } catch(e){ if (++misses > 20 || (e && e.status === 404)){ ui.msg.replaceChildren(h("div",{class:"note err",text:"Lost track of the fetch (the server may have restarted). Nothing was saved; try again."}), fallbackHint(link)); return; } await new Promise(function(r){ setTimeout(r, 1500); }); continue; }
    for (; shown < (j.steps||[]).length; shown++) steps.append(h("li",{text: j.steps[shown].name + ": " + j.steps[shown].note}));
    if (j.progress){ var p = j.progress; prog.textContent = p.stage === "transcribing" ? "Transcribing: " + fmtDur(p.secondsDone) + " of " + fmtDur(p.secondsTotal) + ". This runs on this computer; you can close this page and come back. Stop takes effect at the end of the current five-minute piece." : p.stage === "downloading" ? "Downloading the audio" + (p.percent != null ? ": " + p.percent + "%" : "") + "…" : p.stage === "downloading model" ? "Downloading the speech model (once): " + (p.file||"") + " " + (p.percent||0) + "%" : p.stage === "loading model" ? "Loading the speech model…" : p.stage === "decoding" ? "Reading the audio: " + fmtDur(p.secondsDecoded) + " decoded…" : p.log ? String(p.log).split("\n").filter(Boolean).slice(-1)[0] || "" : ""; }
    if (j.state !== "running") break;
    await new Promise(function(r){ setTimeout(r, 1200); });
  }
  clear(ui.msg);
  if (j.state === "cancelled" || cancelled){ await API.dismissJob(jobId); ui.msg.append(h("div",{class:"note",text:"Stopped. Nothing was saved."}), fallbackHint(link)); return; }
  if (j.state === "error" || j.state === "interrupted"){ await API.dismissJob(jobId); ui.msg.append(h("div",{class:"note",text:(j.error && j.error.message) || "The transcript could not be fetched."}), fallbackHint(link)); return; }
  var res = j.result || {};
  if (res.kind === "choose"){
    var list = h("div",{class:"episodes"});
    ui.msg.append(h("div",{class:"note"}, h("p",{text:"“" + (res.show && res.show.name || "This show") + "”: pick the episode." + (res.note ? " " + cap(res.note) + "." : "")}), list));
    (res.episodes||[]).forEach(function(e){
      var b = h("button",{class:"btn quiet ep",type:"button",text:(e.pubDate ? e.pubDate.slice(0,10) + " · " : "") + e.title + (e.duration ? " · " + fmtDur(e.duration) : "") + (e.hasTranscript ? " · transcript published" : "")});
      b.onclick = function(){ fetchTranscript(link, e.guid, choice, ui); }; list.append(b);
    });
    return;
  }
  if (res.kind === "transcript" || res.kind === "article"){
    // the words are in hand: the reading starts now, in the same action, with the origin recorded on the run
    if (ui.ta) { ui.ta.value = res.text; if (ui.updateStats) ui.updateStats(); }
    var src = res.source || {}, showName = res.show && res.show.name || "", epTitle = res.episode && res.episode.title || res.title || "";
    var ok = h("div",{class:"note ok"});
    ok.append(h("p",{text:(res.kind === "article" ? "Read " + res.text.length.toLocaleString() + " characters from the page." : "Transcript found: " + res.text.length.toLocaleString() + " characters" + (showName ? " · " + showName : "") + (epTitle ? " · " + epTitle : "") + ".") + " Preparing your reading…"}));
    if (src.note) ok.append(h("p",{class:"hint",text:"Where it came from: " + src.note + "."}));
    ui.msg.append(ok);
    if (ui.onWords) await ui.onWords(res.text, null, jobId);
    S.activeTranscriptJobId = null;
    return;
  }
  // nothing published; maybe the audio can be transcribed
  var nt = res.needsTranscription;
  var none = h("div",{class:"note"}); none.append(h("p",{text:cap(res.reason || "No transcript was found.")}));
  if ((res.tried||[]).length) none.append(h("ul",{class:"steps"}, res.tried.map(function(t){ return h("li",{text:t.step + ": " + t.error}); })));
  ui.msg.append(none);
  if (nt && nt.audioUrl){
    var eng = null; try { eng = await API.engines(); } catch(e){}
    ui.msg.append(engineChoice(link, guid, nt, eng, ui));
  } else { await API.dismissJob(jobId); ui.msg.append(fallbackHint(link)); }
}
function fallbackHint(link){ if (link && !S.draft.sourceUrl && !S.runId) S.draft.sourceUrl = link; return h("p",{class:"hint",text:"You can paste the transcript, or upload a .txt, .srt or .vtt file." + (link && !S.runId ? " The link is kept as the source." : "")}); }
/* The one-time choice for the audio step. Once an engine is installed or a key is set, the chain runs through it on
   its own from then on. The consequence of each choice (cost, where the audio goes) is stated at the choice. */
function engineChoice(link, guid, nt, eng, ui){
  var box = h("div",{class:"note info enginebox"});
  var dur = nt.duration ? fmtDur(nt.duration) : "unknown length";
  var localReady = eng && eng.local && eng.local.installed, cloudReady = eng && eng.cloud && eng.cloud.configured;
  box.append(h("p",{text:"The audio (" + dur + ") can be transcribed. Choose once; after that it happens by itself."}));
  var row = h("div",{class:"row"});
  if (localReady) row.append(h("button",{class:"btn primary",type:"button",text:"Transcribe on this computer (" + (nt.duration ? "about " + fmtDur(Math.max(60, nt.duration / 5)) : "slow") + ", free)",onclick:function(){ fetchTranscript(link, guid, "local", ui); }}));
  else {
    var inst = h("button",{class:"btn primary",type:"button",text:"Install local transcription (free, private; about 480 MB, once)"});
    inst.onclick = async function(){
      if (S.busy){ blockWhileBusy(); return; }
      inst.disabled = true; var note = h("p",{class:"hint",text:"Installing… a few minutes."}), stopInst = h("button",{class:"btn quiet",type:"button",text:"Stop"}); box.append(note, stopInst);
      S.busy = true;
      try {
        var st = await API.installLocal(); if (st.installed){ S.busy = false; fetchTranscript(link, guid, "local", ui); return; }
        stopInst.onclick = async function(){ stopInst.disabled = true; try { await API.cancelJob(st.jobId); } catch(e){} };
        var misses = 0;
        for (;;){ var j; try { j = await API.job(st.jobId); misses = 0; } catch(e){ if (++misses > 20){ note.textContent = "Lost track of the install; run  npm run setup -- --local-transcription  in the app folder."; inst.disabled = false; break; } await new Promise(function(r){ setTimeout(r, 1500); }); continue; }
          if (j.progress && j.progress.log) note.textContent = "Installing… " + (String(j.progress.log).split("\n").filter(Boolean).slice(-1)[0] || "");
          if (j.state !== "running") { stopInst.remove(); if (j.state === "done"){ note.textContent = "Installed."; try { await API.preferEngine("local"); } catch(e){} S.busy = false; fetchTranscript(link, guid, "local", ui); } else { note.textContent = (j.state === "cancelled" ? "Install stopped." : "Install failed: " + (j.error && j.error.message || "unknown") + ". Fix the cause and try again, or run  npm run setup -- --local-transcription  in the app folder."); inst.disabled = false; } break; }
          await new Promise(function(r){ setTimeout(r, 1500); }); }
      } catch(e){ note.textContent = errCopy(e); inst.disabled = false; }
      finally { S.busy = false; }
    };
    row.append(inst);
  }
  if (cloudReady) row.append(h("button",{class:"btn",type:"button",text:"Transcribe with Deepgram (fast, paid)",onclick:function(){ fetchTranscript(link, guid, "cloud", ui); }}));
  else {
    var key = h("input",{type:"password",placeholder:"Deepgram API key",autocomplete:"off","aria-label":"Deepgram API key"});
    var useCloud = h("button",{class:"btn",type:"button",text:"Save key and transcribe with Deepgram (fast, paid)",onclick:async function(){ useCloud.disabled = true; try { await API.setSetting("DEEPGRAM_API_KEY", key.value); key.value = ""; try { await API.preferEngine("cloud"); } catch(e){} fetchTranscript(link, guid, "cloud", ui); } catch(e){ useCloud.disabled = false; box.append(h("p",{class:"hint",text:errCopy(e)})); } }});
    row.append(key, useCloud);
  }
  box.append(row);
  box.append(h("p",{class:"hint",text:"On this computer: nothing leaves it, no speaker labels, about five times faster than real time. Deepgram: minutes per episode with speakers numbered by voice; the audio goes to Deepgram and is billed to your Deepgram key."}));
  if (!localReady && !cloudReady) box.append(fallbackHint(link));
  return box;
}

/* The one-time key prompt: shown when real analysis is asked for and no model is configured. The key goes to the
   server, which writes it to .env on this computer; it is never kept or shown in the page. */
function ensureAI(where, continueWith){
  if (S.ai) return true;
  var host = where || view; var old = host.querySelector(".keybox"); if (old) old.remove();
  var inp = h("input",{type:"password",placeholder:"sk-ant-…",autocomplete:"off","aria-label":"Anthropic API key"});
  var save = h("button",{class:"btn primary",type:"button",text:"Save key and continue",onclick:async function(){
    if (S.busy) return; S.busy = true; save.disabled = true;
    try { var out = await API.setKey(inp.value); S.ai = out.ai; inp.value = ""; box.remove(); S.busy = false; setStore("ready", ""); if (continueWith) await continueWith(); else renderRun(); }
    catch(e){ S.busy = false; save.disabled = false; note.textContent = errCopy(e); }
  }});
  var note = h("p",{class:"hint",text:"Get a key at console.anthropic.com (API keys). Each reading is billed to that account. The key is written to the .env file in the app folder on this computer and is not sent back to the browser, logged, or stored anywhere else."});
  var box = h("div",{class:"note info keybox"}, h("p",{text:"Real analysis needs your Anthropic API key, once. Searching sources works without it."}), h("div",{class:"row"}, inp, save), note);
  host.insertBefore(box, host.firstChild);
  box.scrollIntoView({block:"nearest"});
  return false;
}
/* ---- 2 Provenance ---- */

/* ---------- a reading ---------- */
function renderRunSkeleton(){
  var r = run(); if (!view) return;
  S.view = "run"; S.rendered = r.id; UI.sig = {}; UI.cardSig = {};
  view.hidden = false; clear(view);
  view.append(h("header",{class:"run-head", id:"run-head"}), h("div",{class:"notices", id:"notices"}), h("div",{class:"read-status", id:"reading-status"}),
    h("div",{id:"contents-host"}), h("div",{class:"cards", id:"cards"}), h("section",{class:"across", id:"across", hidden:true, "aria-labelledby":"across-title"}));
  updateRunView(true);
}
function updateRunView(force){
  if (S.view !== "run" || !run() || S.rendered !== run().id) { renderRun(); return; }
  withAnchor(function(){
    region("run-head", headSig(), buildHead, force);
    region("notices", noticesSig(), buildNotices, force);
    region("reading-status", statusSig(), buildStatus, force);
    region("contents-host", contentsSig(), buildContents, force);
    updateCards(force);
    region("across", acrossSig(), buildAcross, force);
  });
  if (UI.drawer === "controls") renderControls();
  watchReading();
}
/* Redraw one region only when what it shows has changed, and never under someone's cursor. */
function region(id, sig, build, force){
  var el = $(id); if (!el) return;
  if (!force && UI.sig[id] === sig) return;
  if (typingIn(el)) { UI.deferred = true; return; }
  UI.sig[id] = sig;
  var f = focusKeyIn(el); build(el); restoreFocus(el, f);
}
var readingPoll = null;
function watchReading(){
  if (readingPoll) { clearTimeout(readingPoll); readingPoll = null; }
  if (!running()) return;
  var id = S.runId;
  readingPoll = setTimeout(async function(){
    readingPoll = null;
    if (S.runId !== id) return;
    try { var b = await API.getRun(id); if (S.runId !== id) return; await reload(b); if (b.run.processing.status !== "running") await refreshList(); }
    catch(e) { if (S.runId === id) say("The server could not be reached. Your saved reading will be here when it restarts."); }
  }, 1000);
}
async function startReading(){
  if (blockWhileBusy() || !S.runId) return;
  var id = S.runId; S.busy = true;
  try { await reload(await API.readRun(id)); }
  catch(e) { say(errCopy(e)); var host = $("reading-status"); if (host) host.append(h("p",{class:"note err",text:errCopy(e)})); }
  finally { S.busy = false; }
}
async function request(fn, okText){
  if (blockWhileBusy() || !S.runId) return;
  var id = S.runId; S.busy = true;
  try { var b = await fn(id); if (okText) say(okText); if (UI.drawer) closeDrawer(UI.drawer, true); await reload(b); }
  catch(e){ say(errCopy(e)); }
  finally { S.busy = false; }
}

/* ---- title and source ---- */
function acquisition(r){
  var imp = r.import, src = imp && imp.source || {};
  if (imp) return ({"youtube-captions": src.automatic ? "YouTube's automatic captions" : "YouTube captions", "feed-transcript":"the show's published transcript", "episode-page":"the episode page", "audio-transcription": (src.engine === "local" ? "audio transcribed on this computer" : "audio transcribed by " + (src.engine || "a service"))})[src.kind] || (imp.method === "page text" ? "text of the page" : "fetched from the link");
  var it = r.intake || {};
  if (r.kind === "claim") return "typed claim";
  if (it.converted) return "uploaded " + it.converted;
  return r.example ? "supplied example" : "pasted or uploaded text";
}
function headSig(){ var r = run(), idn = S.b.sourceIdentity || {}; return JSON.stringify([r.id, r.title, r.sourceUrl, r.sourceLabel, r.sourceDate, r.input && r.input.sha256, r.import && r.import.url, idn.state, idn.confirmation && idn.confirmation.at, r.intake && r.intake.file]); }
function buildHead(el){
  var r = run(); clear(el);
  el.append(h("h1",{class:"run-title", id:"run-title", text: r.title || "Your reading"}));
  var row = h("p",{class:"source-row"});
  if (r.sourceUrl) row.append(h("a",{href:r.sourceUrl, target:"_blank", rel:"noopener", text: r.sourceLabel || hostOf(r.sourceUrl)}));
  else if (r.sourceLabel) row.append(h("span",{text:r.sourceLabel}));
  if (r.sourceDate) row.append(h("span",{text:fmtDate(r.sourceDate)}));
  row.append(h("span",{text:cap(acquisition(r))}));
  var idn = S.b.sourceIdentity || {};
  if (idn.state === "confirmed") row.append(h("span",{text:"Match confirmed by you on " + fmtDate(idn.confirmation.at)}));
  el.append(row);
  var d = disclosure("orig-" + r.id, "View original", "original");
  var body = h("div",{class:"orig-body"});
  if (r.import) body.append(h("p",{class:"hint",text:"Fetched from " + r.import.url + " on " + fmtDate(r.import.fetchedAt) + "." + (r.import.source && r.import.source.note ? " " + cap(r.import.source.note) + "." : "")}));
  if (r.intake && r.intake.changed) body.append(h("p",{class:"hint"}, document.createTextNode("Material outside the dialogue was removed before reading. "), h("a",{href:"/api/runs/" + r.id + "/original-input.txt", target:"_blank", text:"Open the upload as it was"})));
  body.append(h("pre",{class:"orig-text", tabindex:"0", "aria-label":"The text that was read", text: S.b.transcript || ""}));
  d.append(body);
  el.append(d);
}

/* ---- run-level notices: only what changes how the reading should be taken ---- */
function anyMock(){ return (S.ai && S.ai.mock) || S.b.passages.some(function(p){ return /MOCK/.test(p.analyzedBy || ""); }); }
function noticesSig(){ var r = run(), pr = r.provenance || {}, idn = S.b.sourceIdentity || {}; return JSON.stringify([r.id, r.example, anyMock(), idn.state, idn.sourceUrl, idn.key, UI.open["srccheck-" + r.id], pr.labelsOrigin, speakerLine(), S.b.attributionGate && S.b.attributionGate.status, r.processing && r.processing.sourceError, S.busy]); }
/* The one quiet line about speakers: where the labels came from when the source gave none. Nothing when it did. */
function unnamedSpeakers(){ var r = run(); return (r.speakers || []).filter(function(x){ return /^SPEAKER \d+$/.test(x.key) && /^Speaker \d+$/.test(x.name || "") && speakerLabels(S.turns).indexOf(x.key) !== -1; }); }
function speakerLine(){
  var r = run(), pr = r && r.provenance || {}; if (!r || isClaimRun()) return null;
  var link = !pr.namesConfirmedAt && unnamedSpeakers().length ? "Name them" : "Details";
  if (pr.labelsOrigin === "voices") return {text:"Speakers separated by voice.", link:link};
  if (pr.labelsOrigin === "words") return {text:"Speakers worked out from the words.", link:link};
  if (allUnlabeled()) return {text:"No speaker labels in this text.", link:"Find speakers"};
  return null;
}
function buildNotices(el){
  var r = run(), pr = r.provenance || {}; clear(el);
  var add = function(text, action, cls){ var n = h("div",{class:"notice" + (cls ? " " + cls : "")}, h("p",{text:text})); if (action) n.append(h("button",{type:"button", class:"btn quiet", text:action[0], onclick:action[1]})); el.append(n); };
  if (r.example) add("This is the supplied example. It is read-only, and its old readings stay held until a copy is read with your key.", ["Copy and read this example", copyExample], "example");
  if (anyMock()) add("Mock output: these readings come from the test responder, not from a model.", null, "mock");
  var idn = S.b.sourceIdentity || {};
  if (idn.state === "needs_confirmation") el.append(sourceNotice(idn));
  if (pr.labelsOrigin === "model") add("Speaker names were suggested by AI from the words. They did not come with the source.", ["Check speakers", function(){ openDrawer("controls", "#ctl-speakers"); }]);
  var line = speakerLine();
  if (line) el.append(h("p",{class:"notice quiet", id:"speakerNotice"}, document.createTextNode(line.text + " "), r.example ? null : h("button",{type:"button", class:"linkish inline", text:line.link, onclick:function(){ openDrawer("controls", "#ctl-speakers"); }})));
  if (!r.example && S.b.attributionGate && S.b.attributionGate.status !== "ready" && !isClaimRun() && r.processing && r.processing.status === "held" && r.processing.phase === "speakers") add("Some speakers could not be settled from the text, so the reading is held. A transcript with reliable speaker labels would settle them.", ["Who said what", function(){ openDrawer("controls", "#ctl-speakers"); }]);
  if (r.processing && r.processing.sourceError) add(r.processing.sourceError + " Claims whose search failed are not checked.");
}
async function copyExample(){
  var r = run(); if (blockWhileBusy()) return; S.busy = true;
  try { var nb = await API.duplicateRun(r.id); S.busy = false; await refreshList(); await selectRun(nb.run.id); await startReading(); }
  catch(e){ S.busy = false; say(errCopy(e)); }
}
/* A matched (not named) source: one line, and a comparison a person can act on. Confirming is their statement that
   the items match; it is recorded with the date and the source it names, and it is not a check of the transcript. */
function sourceNotice(idn){
  var r = run(), key = "srccheck-" + r.id;
  var box = h("div",{class:"notice source"});
  var cmp = h("div",{class:"compare", id:"compare-" + r.id, hidden: !UI.open[key]});
  var btn = h("button",{type:"button", class:"linkish", "aria-expanded": UI.open[key] ? "true" : "false", "aria-controls":"compare-" + r.id, text:"Check source", onclick:function(){ UI.open[key] = !UI.open[key]; cmp.hidden = !UI.open[key]; btn.setAttribute("aria-expanded", UI.open[key] ? "true" : "false"); }});
  box.append(h("p",{}, document.createTextNode(idn.label.replace(/\s+—\s+check source$/i, "") + " — "), btn));
  cmp.append(compareBody(idn, true));
  box.append(cmp);
  return box;
}
function compareBody(idn, withActions){
  var m = idn.match || {}, r = run(), w = h("div",{class:"compare-body"}), dl = h("dl",{class:"cmp"});
  var row = function(k, v){ dl.append(h("dt",{text:k}), h("dd",{}, v)); };
  if (m.episode) row("Episode you asked for", document.createTextNode((m.episode.title || "?") + (m.episode.durationSeconds ? " · " + fmtSecs(m.episode.durationSeconds) : "")));
  if (m.video) row("Video used", h("span",{}, h("a",{href:m.video.url, target:"_blank", rel:"noopener", text:m.video.title || m.video.url}), document.createTextNode(" · " + (m.video.channel || "channel not recorded") + (m.video.durationSeconds ? " · " + fmtSecs(m.video.durationSeconds) : ""))));
  if (m.found) row("Found at Apple", document.createTextNode((m.found.show ? m.found.show + " — " : "") + (m.found.title || "")));
  if (m.toleranceSeconds) row("How it was matched", document.createTextNode("The video's title contains the episode's whole title, and the lengths differ by " + fmtSecs(m.differenceSeconds) + ". Up to " + fmtSecs(m.toleranceSeconds) + " is allowed (the larger of 2 minutes and 5% of the episode). This does not establish the channel or the recording."));
  else if (m.method === "title-lookup") row("How it was matched", document.createTextNode("By the episode title Spotify shows, found once in Apple's catalogue."));
  if (idn.earlier) row("Earlier confirmation", document.createTextNode("You confirmed " + (idn.earlier.episodeTitle ? "“" + idn.earlier.episodeTitle + "”" : "a source") + " on " + String(idn.earlier.at || "").slice(0, 10) + ". It does not count now: " + idn.earlier.why + "."));
  if (idn.legacy) { var src = r.import && r.import.source || {}; row("Recorded", h("span",{}, document.createTextNode("This reading was saved before the comparison was recorded. The note saved with it: “" + (src.note || "") + "” "), src.url ? h("a",{href:src.url, target:"_blank", rel:"noopener", text:src.url}) : null)); }
  w.append(dl, h("p",{class:"hint",text:"Confirming records your statement that these are the same episode. It does not check the transcript or anything said in it."}));
  if (withActions && !readOnly()) {
    var ok = h("button",{type:"button", class:"btn", text:"They match — record my confirmation", onclick:async function(){
      ok.disabled = true; try { await reload(await API.confirmSource(r.id, idn.sourceUrl, idn.key)); say("Your confirmation is recorded."); } catch(e){ ok.disabled = false; say(errCopy(e)); if (e && e.status === 409) await reload(); }
    }});
    w.append(h("div",{class:"row"}, ok, h("button",{type:"button", class:"btn quiet", text:"Use a different source", onclick:function(){ openDrawer("controls", "#ctl-source"); }})));
  }
  return w;
}

/* ---- one live status line ---- */
function allReadyAndCurrent(){
  var r = run(), proc = r.processing || {};
  return proc.status === "complete" && proc.inputHash === (r.input && r.input.sha256) && S.b.passages.length > 0 && S.b.passages.every(isReady) && attributionOk() &&
    (isClaimRun() || S.b.passages.length < 2 || !!(S.b.summary && S.b.summary.readingGate && S.b.summary.readingGate.status === "ready"));
}
function statusInfo(){
  var r = run(), proc = r.processing || {};
  if (r.example) return null;
  if (proc.status === "running") return {text: proc.message || "Reading…"};
  if (proc.status === "awaiting_key") return {text: proc.message || "Your text is saved. Add the model key once and the reading continues by itself."};
  if (allReadyAndCurrent()) return {text: "Your reading is ready.", quiet: true};
  var outdated = (proc.inputHash && r.input && proc.inputHash !== r.input.sha256) || S.b.passages.some(function(p){ return (p.stale || []).length; });
  if (outdated && proc.status !== "held") return {text: "Some readings are out of date because the text or speakers changed. Read again to update them.", action: "Read again"};
  if (proc.status === "stopped") return {text: "Stopped. Your finished readings are kept.", action: "Resume reading"};
  if (proc.status === "interrupted") return {text: "The app was restarted while reading. Your finished readings are kept.", action: "Resume reading"};
  if (proc.status === "partial") return {text: proc.message || "Some readings couldn't be completed.", action: "Try again"};
  if (proc.status === "held") return {text: proc.message, action: "Read again"};
  if (proc.status === "error") return {text: proc.message || "The reading could not finish. Your work is saved.", action: "Try again"};
  if (proc.status === "complete") return {text: "Some readings are out of date because the text or speakers changed. Read again to update them.", action: "Read again"};
  if (S.b.passages.length && S.b.passages.every(isReady)) return null;
  return {text: "This reading has not been prepared yet.", action: "Read this"};
}
function statusSig(){ var i = statusInfo(), r = run(), proc = r.processing || {}; return JSON.stringify([r.id, i, proc.status, proc.error && proc.error.code, !!S.ai, S.busy]); }
function buildStatus(el){
  var r = run(), proc = r.processing || {}, info = statusInfo();
  var keyboxNow = el.querySelector(".keybox");
  clear(el);
  el.hidden = !info;
  if (!info) return;
  el.className = "read-status" + (info.quiet ? " quiet" : "") + (proc.status === "running" ? " running" : "");
  el.append(h("p",{class:"reading-message", role:"status", "aria-live":"polite", text:info.text}));
  var actions = h("div",{class:"status-actions"});
  if (proc.status === "running") {
    var stopNote = h("p",{class:"hint", hidden:true, text:"Stopping. The request in progress is cancelled; if the model had already started on it, it may still be billed. Finished readings are kept."});
    var stop = h("button",{class:"btn quiet", type:"button", text:"Stop", onclick:async function(){ stop.disabled = true; stopNote.hidden = false; try { await reload(await API.stopReading(r.id)); } catch(e){ say(errCopy(e)); stop.disabled = false; } }});
    actions.append(stop); el.append(actions, stopNote);
  } else if (info.action) { actions.append(h("button",{class:"btn primary", type:"button", text:info.action, onclick:startReading})); el.append(actions); }
  if (proc.error && proc.error.code === "bad_key") el.append(h("button",{class:"btn", type:"button", text:"Replace the model key", onclick:function(){ S.ai = null; ensureAI(el, startReading); }}));
  if ((proc.status === "awaiting_key" && !S.ai) || keyboxNow) ensureAI(el, startReading);
}

/* ---- contents ---- */
function stateWord(p){
  var proc = run().processing || {};
  if (isReady(p)) return "";
  if (proc.status === "running" && proc.current === p.id) return "reading now";
  if (p.readingGate && p.readingGate.status === "held") return (p.stale || []).length ? "out of date" : "not completed";
  return "not read yet";
}
function contentsSig(){ return JSON.stringify(S.b.passages.map(function(p){ return [p.id, p.title, stateWord(p)]; })); }
function buildContents(el){
  clear(el); var ps = S.b.passages; if (ps.length < 2) return;
  var d = disclosure("contents-" + run().id, "Contents · " + ps.length + " passages", "contents"); d.id = "contents";
  var ol = h("ol",{class:"toc"});
  ps.forEach(function(p, i){ var st = stateWord(p);
    ol.append(h("li",{}, h("a",{href:"#card-" + p.id, onclick:function(e){ e.preventDefault(); goToCard(p.id); }}, h("span",{class:"pos",text:(i + 1) + " of " + ps.length}), document.createTextNode(" " + (p.title || "Passage " + (i + 1))), st ? h("span",{class:"toc-state",text:" · " + st}) : null)));
  });
  d.append(ol); el.append(d);
}
function goToCard(pid){ var c = $("card-" + pid); if (!c) return; if (hasFn(c, "scrollIntoView")) c.scrollIntoView({block:"start"}); var t = c.querySelector(".card-title"); if (t && hasFn(t, "focus")) t.focus({preventScroll:true}); }

/* ---- cards: stable slots in passage order; a slot is redrawn only when its passage changes ---- */
function cardSig(p, i, n){
  var proc = run().processing || {}, pr = run().provenance || {};
  return JSON.stringify([p.id, i, n, p.readingRev, p.analyzedAt, p.status, p.readingGate, p.stale, p.held, p.quoteCheck, p.analysis && p.analysis.asSaid, p.analysis && p.analysis.jump, p.analysis && p.analysis.claims, p.analysis && p.analysis.levels, p.speakers, p.title, p.historyCount, pr.labelsOrigin, allUnlabeled(),
    (run().speakers || []).map(function(s){ return s.key + "=" + s.name; }), proc.status === "running" && proc.current === p.id, running(), readOnly(), !!S.research, S.turns.length, p.provenance && p.provenance.context && p.provenance.context.hash]);
}
function updateCards(force){
  var host = $("cards"); if (!host) return;
  var ps = S.b.passages, ids = ps.map(function(p){ return p.id; }).join(",");
  if (force || UI.sig.cardIds !== ids) { clear(host); UI.cardSig = {}; ps.forEach(function(p){ host.append(h("div",{class:"slot", id:"slot-" + p.id})); }); UI.sig.cardIds = ids; }
  ps.forEach(function(p, i){
    var slot = $("slot-" + p.id); if (!slot) return;
    var sig = cardSig(p, i, ps.length);
    if (UI.cardSig[p.id] === sig) return;
    if (typingIn(slot)) { UI.deferred = true; return; }
    var f = focusKeyIn(slot);
    slot.replaceChildren(isReady(p) ? buildCard(p, i, ps.length) : buildPlaceholder(p, i, ps.length));
    UI.cardSig[p.id] = sig;
    restoreFocus(slot, f);
  });
}
var FRIENDLY = {
  "transcript changed since this analysis": "the text changed after this reading was made",
  "attribution changed since this analysis": "a speaker label changed after this reading was made",
  "the input used for this analysis is unknown": "the text it was made from was not recorded",
  "Speaker labels are still unresolved.": "some speakers are not settled",
  "This reading has not passed the preparation review.": "the separate review did not approve it",
  "The reading is still being prepared.": "it is still being prepared"
};
function friendly(reasons){ return (reasons || []).map(function(x){ return FRIENDLY[x] || String(x).replace(/\.$/, ""); }).filter(function(x, i, a){ return a.indexOf(x) === i; }); }
function attributionLine(p){
  var r = run(), pr = r.provenance || {}, a = p.analysis || {}, parts = [];
  if (isClaimRun()) parts.push("Typed claim" + (a.by === "person" ? " · not yet read by the model" : ""));
  else { var names = (p.speakers || []).filter(function(k){ return k !== "UNLABELED"; }).map(speakerName).filter(function(x, i, l){ return l.indexOf(x) === i; }); if (names.length) parts.push(names.join(", ") + (pr.labelsOrigin === "model" ? " (names suggested by AI)" : "")); }
  if (/MOCK/.test(p.analyzedBy || "")) parts.push("mock output");
  return parts.join(" · ");
}
function block(title, obj, cls){ if (!obj || !(obj.hs || obj.g5)) return null; return h("section",{class:"blk " + cls}, h("h3",{text:title}), lvl(obj)); }
function cardHead(p, i, n, withLevels, card){
  var head = h("header",{class:"card-head"});
  if (n > 1) head.append(h("p",{class:"pos",text:(i + 1) + " of " + n}));
  head.append(h("h2",{class:"card-title", id:"t-" + p.id, tabindex:"-1", text: isClaimRun() ? "The claim" : (p.title || "Passage " + (i + 1))}));
  var who = attributionLine(p), meta = h("div",{class:"meta"});
  if (who) meta.append(h("p",{class:"attrib",text:who}));
  if (withLevels) meta.append(levelSwitch("Reading level for this card", levelFor(run().id, p.id), function(l){ storeSet(cardKey(run().id, p.id), l); applyCardLevel(card); }));
  if (meta.firstChild) head.append(meta);
  return head;
}
/* The reading as shown: when only its fifth-grade wording failed, the high-school wording at both levels. */
function shownAnalysis(a){
  if (!(a && a.levels && a.levels.g5 === "withheld")) return a;
  var copy = function(x){ if (Array.isArray(x)) return x.map(copy); if (!x || typeof x !== "object") return x; var o = {}; Object.keys(x).forEach(function(k){ o[k] = copy(x[k]); }); if (typeof o.hs === "string" && "g5" in o) o.g5 = o.hs; return o; };
  return copy(a);
}
function buildCard(p, i, n){
  var a = shownAnalysis(p.analysis), r = run();
  var card = h("article",{class:"card", id:"card-" + p.id, "data-run":r.id, "data-pid":p.id, "aria-labelledby":"t-" + p.id});
  card.append(cardHead(p, i, n, true, card));
  var notes = [];
  if (p.held && p.held.kept) notes.push("A new reading of this passage was requested and couldn't be completed; this is the earlier reading.");
  var contra = (a.claims || []).filter(function(c){ return activeReceipts(c).some(function(x){ return x.relation === "contradicts"; }); }).length;
  if (contra) notes.push("You marked a source as contradicting " + (contra === 1 ? "a claim" : contra + " claims") + " here. That is your judgment; the reading was not changed by it.");
  if (notes.length) card.append(h("div",{class:"card-notes"}, notes.map(function(t){ return h("p",{class:"card-note",text:t}); })));
  if (a !== p.analysis) card.append(h("p",{class:"card-note only-5",text:"The fifth-grade wording couldn't be completed, so this card shows the high-school reading."}));
  if (isClaimRun()) claimBlocks(card, p, a);
  else {
    card.append(block("In plain words", a.deflated, "plain"));
    card.append(block("A fair reading", a.defense, "fair"));
    card.append(block("What follows", {hs:a.revision.hs, g5:a.revision.g5}, "follows"));
  }
  card.append(evidence(p, i, n, a));
  applyCardLevel(card);
  return card;
}
/* A bare typed claim has no argument to assess: its faithful explanation and what would help check it, nothing more. */
function claimBlocks(card, p, shown){
  var a = shown || p.analysis, c = a.claims[0] || {};
  if (a.by === "person") card.append(h("section",{class:"blk plain"}, h("h3",{text:"The claim, as typed"}), h("p",{class:"typed",text:c.text}), h("p",{class:"hint",text:"Not yet read by the model."})));
  else card.append(block("In plain words", a.deflated, "plain"));
  var settle = c.settle && (c.settle.hs || c.settle.g5) ? c.settle : (c.wouldSettle ? {hs:c.wouldSettle, g5:c.wouldSettle} : null);
  if (settle && a.by !== "person") card.append(block("What would help check it", settle, "settle"));
  card.append(h("p",{class:"claim-kind",text: SH.claimTypeLabel(c.type) + (EMPIRICAL.indexOf(c.type) !== -1 ? " · " + claimStatusShort(c) : "")}));
}
function buildPlaceholder(p, i, n){
  var r = run(), proc = r.processing || {};
  var card = h("article",{class:"card waiting", id:"card-" + p.id, "data-run":r.id, "data-pid":p.id, "aria-labelledby":"t-" + p.id});
  card.append(cardHead(p, i, n, false, card));
  var gate = p.readingGate || {}, stale = friendly(p.stale), why = (gate.reasons || []).filter(function(x){ return (p.stale || []).indexOf(x) === -1; });
  var now = proc.status === "running" && proc.current === p.id, failed = p.status === "error";
  // a reading that failed its checks couldn't be completed; one made but not shown (out of date, or waiting on the
  // speakers) says that instead
  var text = now ? "Reading this passage now…" : gate.status === "held" ? (stale.length && !failed ? "Out of date: " + stale.join("; ") + "." : failed ? "This reading couldn't be completed." : "This reading isn't shown yet.") : "Not read yet.";
  card.append(h("p",{class:"waiting-text",text:text}));
  // the reasons, in plain words, and the passage they are about: under Evidence, closed by default. One retry for all
  // of them is on the status line above.
  if (!now && gate.status === "held" && !isClaimRun()) {
    var d = disclosure("ev-" + r.id + "-" + p.id, "Evidence", "evidence"), body = h("div",{class:"ev-body"});
    if (!stale.length || why.length || failed) { var ws = h("section",{class:"ev-sec why"}, h("h3",{text: failed ? "Why it couldn't be completed" : "Why it isn't shown"})), ul = h("ul",{class:"reasons"}); (why.length ? why : ["It did not pass its checks."]).map(plainReason).filter(function(x, k, l){ return l.indexOf(x) === k; }).forEach(function(x){ ul.append(h("li",{text:x})); }); ws.append(ul); body.append(ws); }
    var sec = h("section",{class:"ev-sec"}, h("h3",{text:"The original passage"})), target = h("div",{class:"target-turns"});
    for (var t = p.turnStart; t <= p.turnEnd; t++) target.append(turnLine(S.turns[t]));
    sec.append(target); body.append(sec); d.append(body); card.append(d);
  }
  return card;
}

/* ---- Evidence: the original passage first, then the reasoning, the claims and their sources, then the record ---- */
function activeReceipts(c){ return (c.receipts||[]).filter(function(x){ return !x.withdrawnAt; }); }
function claimStatus(c){ return activeReceipts(c).length ? "receipt" : ((c.searches||[]).length ? "searched" : "unchecked"); }
function claimStatusShort(c){
  var st = claimStatus(c), pending = (c.candidates||[]).filter(function(x){ return x.status === "candidate"; }).length;
  var failed = (c.searches||[]).length && (c.searches||[]).every(function(s){ return s.error; });
  if (st === "receipt") return plural(activeReceipts(c).length, "source") + " attached by you";
  if (failed) return "the source search could not finish; not checked";
  if (st === "searched") return pending ? "searched · " + plural(pending, "possible source") + " to look at" : "searched · nothing attached";
  return "not checked";
}
function claimStatusLong(c){
  var st = claimStatus(c), rc = activeReceipts(c), n = relationCounts(rc), pending = (c.candidates||[]).filter(function(x){ return x.status === "candidate"; }).length;
  var failed = (c.searches||[]).length && (c.searches||[]).every(function(s){ return s.error; });
  if (st === "receipt") return "Sources you attached: " + rc.length + [n.supports ? n.supports + " marked supports" : "", n.contradicts ? n.contradicts + " marked contradicts" : "", n.mentions ? n.mentions + " marked mentions" : "", n.unstated ? n.unstated + " with no relation stated" : ""].filter(Boolean).map(function(x, i){ return (i ? ", " : " (") + x; }).join("") + (rc.length ? ")" : "") + ". Attaching a source records your judgment of relevance; it does not verify the claim.";
  if (failed) return "The source search could not finish, so this claim is not checked.";
  if (st === "searched") return pending ? "Searched: " + plural(pending, "possible source is", "possible sources are") + " waiting for you to look at. A search result is not verification." : "Searched: nothing attached.";
  return "Not checked. No source search is on record.";
}
function quoteLine(q){
  var who = whoPrefix(q.speakerNow || q.speaker);
  var line = h("p",{class:"q"}, who ? h("span",{class:"sp",text: who}) : null, document.createTextNode("“" + q.quote + "”"),
    h("span",{class:"vq" + (q.verbatim ? "" : " no"),text: q.verbatim ? ((q.tolerated||[]).length ? "matched, numbers written differently" : "matched") : "not found word for word"}));
  if (q.relocated) line.append(h("span",{class:"vq no",text:"found in turn " + q.matchedTurn + ", not turn " + q.turn}));
  if (q.speakerMismatch) line.append(h("span",{class:"vq no",text:"the model said " + speakerName(q.speaker)}));
  return line;
}
function turnLine(t){
  if (!t) return null;
  if (t.heading) return h("p",{class:"turn heading",text:t.text});
  var who = whoPrefix(effSpeaker(t));
  return h("p",{class:"turn"}, who ? h("span",{class:"sp",text:who}) : null, document.createTextNode(t.text));
}
function evidence(p, i, n, shown){
  var a = shown || p.analysis, rid = run().id;
  var d = disclosure("ev-" + rid + "-" + p.id, "Evidence", "evidence");
  var body = h("div",{class:"ev-body"});
  if (!isClaimRun()) body.append(originalPassage(p));
  if ((a.asSaid || []).length) { var qs = h("section",{class:"ev-sec"}, h("h3",{text:"Quoted in this reading"})); a.asSaid.forEach(function(q){ qs.append(quoteLine(q)); }); body.append(qs); }
  if (!isClaimRun()) body.append(reasoning(a));
  var cs = h("section",{class:"ev-sec"}, h("h3",{text: isClaimRun() ? "Sources" : "Claims in this passage"}));
  (a.claims || []).forEach(function(c){ cs.append(claimEvidence(p, c)); });
  body.append(cs, checks(p, a));
  d.append(body);
  return d;
}
function originalPassage(p){
  var ctx = p.provenance && p.provenance.context, sec = h("section",{class:"ev-sec"}, h("h3",{text:"The original passage"}));
  if (ctx && ctx.before.length) sec.append(h("div",{class:"ctx-turns"}, h("p",{class:"ctx-label",text:"Just before (context the model was given)"}), ctx.before.map(function(x){ return turnLine(S.turns[x.turn]); })));
  var target = h("div",{class:"target-turns"}); for (var t = p.turnStart; t <= p.turnEnd; t++) target.append(turnLine(S.turns[t])); sec.append(target);
  if (ctx && ctx.after.length) sec.append(h("div",{class:"ctx-turns"}, h("p",{class:"ctx-label",text:"Just after (context the model was given)"}), ctx.after.map(function(x){ return turnLine(S.turns[x.turn]); })));
  if (ctx && ctx.omitted && ctx.omitted.length) sec.append(h("p",{class:"hint",text:"Not given to the model because too long: " + ctx.omitted.map(function(o){ return "the turn " + o.side; }).join(", ") + "."}));
  if (!ctx) sec.append(h("p",{class:"hint",text:"This reading was made from the passage alone, before neighbouring turns were supplied."}));
  return sec;
}
function reasoning(a){
  var sec = h("section",{class:"ev-sec reasoning"}, h("h3",{text:"Reasoning behind this reading"}));
  if (a.jump.present) {
    var out = a.revision.jumpSurvives;
    sec.append(h("p",{class:"ev-label" + (out === "no" ? " withdrawn" : ""), text: out === "no" ? "Initial concern (withdrawn)" : "Initial concern"}), lvl({hs:a.jump.hs, g5:a.jump.g5}));
    if (a.jump.pivot) sec.append(h("p",{class:"pivot"}, h("span",{class:"k",text:"Where the reasoning turns: "}), document.createTextNode("“" + a.jump.pivot + "”"), h("span",{class:"vq" + (a.jump.pivotVerbatim === false ? " no" : ""), text: a.jump.pivotVerbatim === false ? "not found word for word" : ((a.jump.pivotTolerated||[]).length ? "matched, numbers written differently" : "matched")})));
    sec.append(h("p",{class:"outcome", text: ({yes:"After the fair reading, this concern stands; What follows explains it.", partly:"After the fair reading, part of this concern stands; What follows says which part.", no:"Withdrawn: the fair reading answers this concern, so it is not part of the final assessment."})[out] || "The final assessment does not say whether this concern stands."}));
  } else {
    sec.append(h("p",{class:"ev-label",text:"No concern was raised"}));
    if (a.jump.hs || a.jump.g5) sec.append(lvl({hs:a.jump.hs, g5:a.jump.g5}));
  }
  return sec;
}
function settleOf(c){ if (c.settle && (c.settle.hs || c.settle.g5)) return lvl(c.settle); if (c.wouldSettle) return lvl({hs:c.wouldSettle, g5:c.wouldSettle}); return null; }
function claimEvidence(p, c){
  var box = h("div",{class:"claim-ev", "data-claim":c.id, tabindex:"-1"}), empirical = EMPIRICAL.indexOf(c.type) !== -1;
  box.append(h("p",{class:"claim-kind",text:SH.claimTypeLabel(c.type)}));
  box.append(h("p",{class:"ct",text:(c.speaker ? whoPrefix(c.speaker) : "") + c.text}));
  if (!isClaimRun()) {
    if (c.plain && (c.plain.hs || c.plain.g5)) box.append(h("div",{class:"plain"}, lvl(c.plain)));
    if (c.basis && (c.basis.hs || c.basis.g5)) box.append(h("div",{class:"basis"}, lvl(c.basis)));
    var st = settleOf(c); if (st) box.append(h("div",{class:"settle"}, h("p",{class:"k",text:"What would help check it"}), st));
  } else if (c.basis && (c.basis.hs || c.basis.g5)) box.append(h("div",{class:"basis"}, lvl(c.basis)));
  if (SH.historicalType(c.type)) box.append(h("p",{class:"hint",text:"An earlier version of the app had the model label this “" + c.type + "” from its own knowledge. It is shown here as a checkable claim; nothing checked that label."}));
  if (empirical) box.append(h("p",{class:"claim-status",text:claimStatusLong(c)}));
  activeReceipts(c).filter(function(x){ return x.relation === "contradicts"; }).forEach(function(x){ box.append(h("p",{class:"claim-note",text:"You marked “" + (x.title || x.url) + "” as contradicting this claim" + (x.relationAt ? " on " + fmtDate(x.relationAt) : "") + ". That is your judgment, recorded with the source; the reading was written before it."})); });
  var d = disclosure("src-" + run().id + "-" + p.id + "-" + c.id, empirical ? "Sources and search" : "Attach a source", "sources");
  d.append(claimDetail(p, c));
  box.append(d);
  return box;
}
var JUDGE = { evidence: {strong:"strong", mixed:"partial or disputed", weak:"weak", none:"none", "n/a":"not applicable"}, inference: {valid:"the conclusion follows", gap:"a gap remains", unfalsifiable:"framed so nothing could count against it", "n/a":"not applicable"} };
function checks(p, shown){
  var a = shown || p.analysis, r = run(), rid = r.id, d = disclosure("chk-" + rid + "-" + p.id, "Checks and history", "checks"), b = h("div",{class:"chk-body"});
  var review = p.provenance && p.provenance.review, qc = p.quoteCheck, ctx = p.provenance && p.provenance.context;
  if (review) b.append(h("p",{text:"Separate review: a second pass of the same model checked this reading against the source before it was shown" + (review.attempts > 1 ? ", after automatic correction of the parts it found wrong" : "") + ". This is not an independent check." + ((review.corrections || []).length ? " " + plural(review.corrections.length, "quote attribution was", "quote attributions were") + " corrected from the transcript." : "")}));
  if (p.analysis.levels && p.analysis.levels.g5 === "withheld") { var g5 = h("div",{class:"why"}, h("p",{text:"The fifth-grade wording couldn't be completed, so the card shows the high-school reading at both levels. What was still wrong:"})), gl = h("ul",{class:"reasons"}); (p.analysis.levels.reasons || []).map(plainReason).forEach(function(x){ gl.append(h("li",{text:x})); }); g5.append(gl); b.append(g5); }
  if (qc && qc.quotes) b.append(h("p",{text:"Quotes: " + qc.matched + " of " + qc.quotes + " found word for word in the saved transcript" + (qc.tolerated ? " (" + qc.tolerated + " with numbers written differently)" : "") + "." + (qc.mismatched ? " The model credited " + plural(qc.mismatched, "quote") + " to a different speaker than the transcript shows; the transcript wins." : "")}));
  if (!isClaimRun() || a.by !== "person") {
    if (a.fidelity && a.fidelity.grade && a.fidelity.grade !== "unrated") { b.append(h("p",{text:"Rewrite check by the model: " + a.fidelity.grade + "."})); if (a.fidelity.notes && (a.fidelity.notes.hs || a.fidelity.notes.g5)) b.append(lvl(a.fidelity.notes)); }
    if (!isClaimRun()) b.append(h("p",{text:"Support the passage itself offers: " + (JUDGE.evidence[a.judgments.evidence] || a.judgments.evidence) + ". Reasoning: " + (JUDGE.inference[a.judgments.inference] || a.judgments.inference) + ". These are the model's judgments of the passage, not checks against outside sources."}));
  }
  if (ctx) b.append(h("p",{text:"Neighbouring turns given to the model: " + (ctx.before.length ? "before, " + ctx.before.map(function(x){ return x.turn; }).join(", ") : "none before") + "; " + (ctx.after.length ? "after, " + ctx.after.map(function(x){ return x.turn; }).join(", ") : "none after") + (ctx.omitted.length ? "; left out as too long: " + ctx.omitted.map(function(x){ return x.turn; }).join(", ") : "") + "."}));
  b.append(h("p",{class:"hint",text:(isClaimRun() ? "" : "Turns " + p.turnStart + "–" + p.turnEnd + " · ") + (p.analyzedAt ? "read " + fmtDate(p.analyzedAt) : "") + (p.analyzedBy ? " by " + p.analyzedBy : "") + (p.provenance && p.provenance.recorded ? " · model call " + (p.provenance.requestId || p.provenance.callId) : "") + (p.provenance && p.provenance.contract ? " · " + p.provenance.contract : " · written before the reading-2 contract")}));
  if (p.historyCount) b.append(h("p",{class:"hint",text:"Read " + plural(p.historyCount, "time") + " before; every earlier reading is kept in this passage's file (data/runs/" + rid + "/passages/" + p.id + ".json)." + (p.rerun ? " Last time, " + plural(p.rerun.carried, "claim") + " kept " + (p.rerun.carried === 1 ? "its" : "their") + " sources" + (p.rerun.orphaned ? " and " + plural(p.rerun.orphaned, "earlier claim") + " did not reappear (still in the history)" : "") + "." : "")}));
  if ((p.adopted||[]).length) b.append(h("p",{class:"hint",text:plural(p.adopted.length, "set") + " of records from an earlier passage split " + (p.adopted.length === 1 ? "was" : "were") + " reattached here."}));
  if (p.held && p.held.kept) b.append(h("p",{class:"hint",text:"The last attempt to read this passage again (" + fmtDate(p.held.at) + ") couldn't be completed: " + (p.held.issues || []).map(plainReason).join(" ")}));
  var reset = h("button",{class:"btn quiet level-reset", type:"button", text:"Use the default reading level for this card", hidden: !cardOverride(rid, p.id), onclick:function(){ storeSet(cardKey(rid, p.id), null); var card = $("card-" + p.id); if (card) applyCardLevel(card); }});
  b.append(reset);
  if (!readOnly()) b.append(h("div",{class:"ctl-item"}, h("button",{class:"btn quiet", type:"button", text: isClaimRun() && a.by === "person" ? "Read it with the model" : "Read this passage again", disabled: running() ? "" : null, onclick:function(){ var go = function(){ return request(function(id){ return API.reread(id, p.id); }); }; if (!ensureAI(b, go)) return; go(); }}),
    h("p",{class:"hint",text:"One new reading and one review, billed to your model key. This reading moves to the history; sources stay with matching claims."})));
  d.append(b);
  return d;
}
/* Everything a person can do about one claim's sources, beside that claim. */
function claimDetail(p, c){
  var r = run(), ro = readOnly(), rv = p.readingRev || 0, box = h("div",{class:"cdetail"}), base = "c-" + r.id + "-" + p.id + "-" + c.id + "-";
  var empirical = EMPIRICAL.indexOf(c.type) !== -1;
  if (!ro && empirical){
    var qIn = keep(h("input",{type:"text",value:c.searchQuery||"","aria-label":"Search query",placeholder:"Search query"}), base + "q");
    var tSel = h("select",{multiple:"",size:"3","aria-label":"Source types"}); SOURCE_TYPES.forEach(function(t){ tSel.append(h("option",{value:t,text:t.replace(/_/g," "),selected:(c.expectedSources||[]).indexOf(t) !== -1 ? "selected" : null})); });
    var qBtn = h("button",{class:"btn quiet",type:"button","data-key":base + "qsave",text:"Save query",onclick:async function(){ qBtn.disabled = true; try { var b = await API.saveRouting(r.id, p.id, c.id, {searchQuery:qIn.value, expectedSources:Array.prototype.slice.call(tSel.selectedOptions).map(function(o){ return o.value; })}, rv); forget(base + "q"); await reload(b); } catch(e){ say(errCopy(e)); qBtn.disabled = false; if (e && e.status === 409) await reload(); } }});
    box.append(h("div",{class:"rc"}, h("span",{class:"hint",text:"Where to look:"}), qIn, tSel, qBtn));
    if (c.routingEditedAt) box.append(h("p",{class:"hint",text:"Query edited by a person " + fmtDate(c.routingEditedAt) + "."}));
  } else if (c.searchQuery || (c.expectedSources||[]).length) box.append(h("p",{class:"hint",text:"Where to look: " + ((c.expectedSources||[]).join(", ") || "type guessed by heuristic") + (c.searchQuery ? " · query “" + c.searchQuery + "”" : "")}));
  var pending = (c.candidates||[]).filter(function(x){ return x.status === "candidate"; }), nSearches = (c.searches||[]).length;
  if (!empirical) box.append(h("p",{class:"hint",text:"Not a checkable claim, so no source is expected. You can still attach one if a document bears on it."}));
  (c.receipts||[]).forEach(function(x){
    var line = h("div",{class:"rc"});
    line.append(h("span",{class:"tag" + (x.withdrawnAt ? "" : " receipt"),text: x.withdrawnAt ? "withdrawn" : "source"}));
    if (x.relation && x.relation !== "unstated") line.append(h("span",{class:"tag rel " + x.relation,text:x.relation}));
    line.append(h("a",{href:x.url,target:"_blank",rel:"noopener",text:(x.title || x.note || x.url) + (x.outlet || x.journal ? " · " + (x.outlet || x.journal) : "") + (x.publishedAt ? " · " + String(x.publishedAt).slice(0,4) : "")}));
    line.append(h("span",{class:"hint",text:" " + (x.note && x.title ? "— " + x.note + " " : "") + "(" + (x.addedBy||"") + (x.at ? ", " + fmtDate(x.at) : "") + (x.reattached ? ", reattached from an earlier split" : "") + ")"}));
    (x.notices||[]).forEach(function(n){ line.append(h("span",{class:"tag warn",text:(n.label || n.type) + (n.date ? " " + n.date : "")})); });
    if (x.withdrawnAt) line.append(h("span",{class:"hint",text:"Withdrawn " + fmtDate(x.withdrawnAt) + (x.withdrawReason ? ": " + x.withdrawReason : "")}));
    else if (!ro){
      var relSel = h("select",{"aria-label":"What this document does for the claim (your reading, on record)","data-key":base + "rel-" + x.rid}); RELATIONS.forEach(function(rr){ relSel.append(h("option",{value:rr[0],text:rr[1],selected:(x.relation||"unstated") === rr[0] ? "selected" : null})); });
      relSel.addEventListener("change", async function(){ relSel.disabled = true; try { await reload(await API.setRelation(r.id, p.id, c.id, x.rid, relSel.value, rv)); } catch(e){ say(errCopy(e)); if (e && e.status === 409) await reload(); } });
      var why = keep(h("input",{type:"text",placeholder:"Why withdraw it?","aria-label":"Reason for withdrawing this source"}), base + "why-" + x.rid);
      var wd = h("button",{class:"btn quiet",type:"button",text:"Withdraw",onclick:async function(){ wd.disabled = true; try { var b = await API.withdrawReceipt(r.id, p.id, c.id, x.rid, why.value, rv); forget(base + "why-" + x.rid); await reload(b); } catch(e){ say(errCopy(e)); if (e && e.status === 409) await reload(); } }});
      line.append(relSel, why, wd);
    }
    if ((x.relationHistory||[]).length) line.append(h("span",{class:"hint",text:" relation changed " + plural(x.relationHistory.length, "time") + " (was " + x.relationHistory.map(function(hh){ return hh.relation; }).join(", then ") + ")"}));
    box.append(line);
  });
  if (!ro){
    var u = keep(h("input",{type:"url",placeholder:"Link to a document","aria-label":"Link to a document"}), base + "url"), n = keep(h("input",{type:"text",placeholder:"What it shows (one line)","aria-label":"What the document shows"}), base + "note");
    var relAdd = h("select",{"aria-label":"What it does for the claim"}); RELATIONS.forEach(function(rr){ relAdd.append(h("option",{value:rr[0],text:rr[1]})); });
    var add = h("button",{class:"btn quiet",type:"button","data-key":base + "add",text:"Attach as a source",onclick:async function(){
      if (!u.value.trim()) return; add.disabled = true;
      try { var b = await API.addReceipt(r.id, p.id, c.id, u.value.trim(), n.value.trim(), rv, relAdd.value); forget(base + "url", base + "note"); await reload(b); } catch(e){ say(errCopy(e)); add.disabled = false; if (e && e.status === 409) await reload(); }
    }});
    var ctl = h("div",{class:"rc"}, u, n, relAdd, add);
    if (S.research && empirical){
      var sb = h("button",{class:"btn quiet",type:"button","data-key":base + "search",text: nSearches ? "Search sources again" : "Search sources",onclick:async function(){
        sb.disabled = true; sb.textContent = "Searching…";
        try { var out = await API.searchClaim(r.id, p.id, c.id, rv); await reload(out.bundle); if (out.parked) say("The card was read again while the search ran, and this claim is not in the new reading. The results were parked and can be reattached from Controls."); } catch(e){ say(errCopy(e)); sb.disabled = false; sb.textContent = "Search sources"; if (e && e.status === 409) await reload(); }
      }});
      ctl.append(sb);
    }
    box.append(ctl);
  }
  if (nSearches){
    var att = disclosure(base + "att", plural(nSearches, "search attempt") + " on record", "attempts");
    (c.searches||[]).forEach(function(s){ att.append(h("p",{class:"hint",text:s.adapter + (s.field ? " (" + s.field + ")" : "") + ": “" + s.query + "” → " + (s.error ? "error: " + s.error : (s.hitCount + " returned" + (s.totalReported != null && s.totalReported !== s.hitCount ? " of " + Number(s.totalReported).toLocaleString() + " the service counts" : ""))) + " · " + fmtDate(s.at) + (s.late ? " · finished after a reread" : "")})); });
    box.append(att);
  }
  pending.forEach(function(x){
    var row = h("div",{class:"cand"});
    var head = h("div",{}, h("a",{href:x.url,target:"_blank",rel:"noopener",text:x.title}), h("span",{class:"hint",text:" " + [x.docType, x.outlet || x.journal, x.language && x.language !== "English" ? x.language : "", x.publishedAt ? String(x.publishedAt).slice(0,10) : "", (x.authors||[]).slice(0,3).join(", "), x.doi ? "doi:" + x.doi : (x.pmid ? "pmid:" + x.pmid : ""), "found by " + (x.foundBy||[x.adapter]).join("+")].filter(Boolean).join(" · ")}));
    if (x.sourceType === "news_coverage") head.append(h("span",{class:"hint",text:" · news coverage: an outlet published an article matching the query. It says nothing about what the article concludes; read it."}));
    (x.notices||[]).forEach(function(nn){ head.append(h("span",{class:"tag warn",text:(nn.label||nn.type) + (nn.date ? " " + nn.date : "")})); });
    if (x.fullTextUrl) head.append(h("a",{href:x.fullTextUrl,target:"_blank",rel:"noopener",class:"hint",text:" full text"}));
    row.append(head);
    if (!ro){
      var note = keep(h("input",{type:"text",placeholder:"What it shows (one line)","aria-label":"What it shows"}), base + "cand-" + x.id);
      var relC = h("select",{"aria-label":"What it does for the claim"}); RELATIONS.forEach(function(rr){ relC.append(h("option",{value:rr[0],text:rr[1]})); });
      var sel = h("select",{"aria-label":"Reason to reject"}); REJECTION_REASONS.forEach(function(rr){ sel.append(h("option",{value:rr[0],text:rr[1]})); });
      var acc = h("button",{class:"btn quiet",type:"button",text:"Accept as a source",onclick:async function(){ acc.disabled = true; try { var b = await API.acceptCandidate(r.id, p.id, c.id, x.id, note.value, rv, relC.value); forget(base + "cand-" + x.id); await reload(b); } catch(e){ say(errCopy(e)); if (e && e.status === 409) await reload(); } }});
      var rej = h("button",{class:"btn quiet",type:"button",text:"Reject",onclick:async function(){ rej.disabled = true; try { var b = await API.rejectCandidate(r.id, p.id, c.id, x.id, sel.value, note.value, rv); forget(base + "cand-" + x.id); await reload(b); } catch(e){ say(errCopy(e)); if (e && e.status === 409) await reload(); } }});
      row.append(h("div",{class:"row"}, note, relC, acc, sel, rej));
    }
    box.append(row);
  });
  if ((c.rejections||[]).length) box.append(h("p",{class:"hint",text:plural(c.rejections.length, "candidate") + " rejected: " + c.rejections.map(function(x){ return (x.title || x.doi || x.url) + " (" + x.reason + (x.detail ? ": " + x.detail : "") + (x.withdrewReceipt ? "; its source was withdrawn" : "") + ")"; }).join("; ")}));
  return box;
}

/* ---- Across this reading: the existing overview, from final assessments, at the page level ---- */
function acrossSig(){ var sm = S.b.summary, proc = run().processing || {}; return JSON.stringify([run().id, S.b.passages.length, sm && [sm.createdAt, sm.readingGate, sm.stale, sm.patterns, sm.survived], proc.status, proc.phase, S.b.passages.every(isReady), S.b.passages.map(function(p){ return p.title; })]); }
function buildAcross(el){
  var sm = S.b.summary, ps = S.b.passages, proc = run().processing || {};
  clear(el);
  if (isClaimRun() || ps.length < 2) { el.hidden = true; return; }
  el.hidden = false; el.setAttribute("data-level", pageLevel());
  el.append(h("h2",{id:"across-title", text:"Across this reading"}));
  if (!sm) { el.append(h("p",{class:"hint",text: proc.status === "running" && proc.phase === "overview" ? "Writing the closing overview…" : ps.every(isReady) ? "The closing overview has not been written yet." : "The closing overview is written once every passage is ready. The readings above can be read now."})); return; }
  if (!sm.readingGate || sm.readingGate.status !== "ready") { el.append(h("p",{class:"hint",text:((sm.stale||[]).length ? "The closing overview is out of date: " + friendly(sm.stale).join("; ") + "." : "The closing overview did not pass its checks and is held.") + " The readings above are not affected."})); return; }
  if (!(sm.patterns||[]).length) el.append(h("p",{text:"No concern recurs across the final assessments."}));
  (sm.patterns||[]).forEach(function(pt){
    var refs = (pt.passages||[]).map(function(id){ var i = ps.findIndex(function(x){ return x.id === id; }); return i < 0 ? null : h("a",{href:"#card-" + id, onclick:function(e){ e.preventDefault(); goToCard(id); }, text:"passage " + (i + 1)}); }).filter(Boolean);
    var refLine = h("p",{class:"refs"}, document.createTextNode("Seen in "));
    refs.forEach(function(a, i){ if (i) refLine.append(document.createTextNode(i === refs.length - 1 ? " and " : ", ")); refLine.append(a); });
    el.append(h("div",{class:"pattern"}, h("h3",{}, lvl(pt.title)), lvl(pt.body), refs.length ? refLine : null));
  });
  if (sm.survived && (sm.survived.hs || sm.survived.g5)) el.append(h("h3",{text:"What holds up"}), lvl(sm.survived));
}

/* ---------- Controls ---------- */
function controlsSig(){
  var r = run(); if (!r) return JSON.stringify(["new", S.draft, !!S.ai, S.engines && [S.engines.local.installed, S.engines.cloud.configured, S.engines.prefer]]);
  var pr = r.provenance || {}, proc = r.processing || {}, idn = S.b.sourceIdentity || {};
  return JSON.stringify([r.id, r.title, r.sourceUrl, r.sourceLabel, r.sourceDate, r.speakers, pr.overrides, pr.flags && pr.flags.length, pr.labelsOrigin, pr.confirmedAt, pr.namesConfirmedAt, pr.structure && pr.structure.at, pr.voices && pr.voices.at, !!S.b.pageText, r.import && r.import.episodeInfo && (r.import.episodeInfo.audioUrl || r.import.episodeInfo.guid), r.preparation && r.preparation.status, proc.status, S.b.summary && S.b.summary.readingGate, S.b.passages.length, S.b.passages.every(isReady), (r.orphans||[]).length, idn.state, idn.sourceUrl, idn.key, r.input && r.input.sha256, !!S.ai, S.ai && S.ai.model, S.engines && [S.engines.local.installed, S.engines.cloud.configured, S.engines.prefer], S.busy, attributionOk()]);
}
function renderControls(force){
  var body = $("controlsBody"); if (!body) return;
  var sig = controlsSig();
  if (!force && UI.sig.controls === sig) return;
  if (typingIn(body)) { UI.deferred = true; return; }
  UI.sig.controls = sig;
  var f = focusKeyIn(body); clear(body);
  body.append(h("p",{class:"guide-link"}, h("a",{href:"#guide", id:"guideLink", text:"User guide", onclick:function(e){ e.preventDefault(); closeDrawer("controls", true); showGuide(""); }})));
  body.append(ctlReading(), ctlInput(), ctlApp());
  restoreFocus(body, f);
  if (!S.engines) API.engines().then(function(e){ S.engines = e; if (UI.drawer === "controls") renderControls(); }).catch(function(){});
}
function ctlItem(){ var d = h("div",{class:"ctl-item"}); for (var i = 0; i < arguments.length; i++) if (arguments[i]) d.append(arguments[i]); return d; }
function action(label, consequence, fn, disabled){ return ctlItem(h("button",{class:"btn", type:"button", text:label, disabled: disabled ? "" : null, onclick:fn}), h("p",{class:"hint",text:consequence})); }
function ctlReading(){
  var s = h("section",{class:"ctl-group", id:"ctl-reading", tabindex:"-1", "aria-labelledby":"ctl-reading-h"}, h("h2",{id:"ctl-reading-h", text:"Reading"}));
  var g = levelSwitch("Default reading level", pageLevel(), function(l){ setPageLevel(l); }, "page-level");
  s.append(ctlItem(h("p",{class:"ctl-label",text:"Default reading level"}), g, h("p",{class:"hint",text:"Cards where you picked a level keep their own."})));
  var r = run();
  if (!r) { s.append(h("p",{class:"hint",text:"Start a reading to see its options."})); return s; }
  if (readOnly()) { s.append(h("p",{class:"hint",text:"The supplied example is read-only. Copy it to read it with your key."})); return s; }
  var busy = running();
  if (!allReadyAndCurrent()) s.append(action("Read this", "Reads what is not ready yet, billed to your model key. Ready readings stay as they are.", function(){ closeDrawer("controls", true); startReading(); }, busy));
  if (!isClaimRun() && S.b.passages.length >= 2) s.append(action("Write the closing overview again", "One overview and one review, billed to your model key. The current overview is replaced; the old one is kept in the run's archive folder.", function(){ request(API.overview, "Writing the overview again…"); }, busy || !S.b.passages.every(isReady)));
  if (!isClaimRun()) {
    var adv = disclosure("ctl-adv-" + r.id, "Passage preparation", "ctl-adv");
    adv.append(action("Organize the passages again", "Splits the conversation into passages again and reads every passage again: about two model calls per passage, billed to your key. The current readings move to the run's archive folder; sources and decisions on claims are parked and reattached to matching claims.", function(){ request(API.reorganize, "Organizing the passages again…"); }, busy));
    if ((r.orphans||[]).length) adv.append(renderOrphans(r));
    s.append(adv);
  }
  return s;
}
function field(label, input){ var id = input.getAttribute("id") || ("f-" + Math.random().toString(36).slice(2, 8)); input.setAttribute("id", id); return h("div",{class:"field"}, h("label",{for:id, text:label}), input); }
function ctlInput(){
  var s = h("section",{class:"ctl-group", id:"ctl-input", tabindex:"-1", "aria-labelledby":"ctl-input-h"}, h("h2",{id:"ctl-input-h", text:"Input and speakers"}));
  var r = run();
  if (!r) {
    s.append(h("p",{class:"hint",text:"Optional. Used when you press Read this."}));
    [["title","Title","text"],["sourceUrl","Source link","url"],["sourceLabel","Source label","text"],["sourceDate","Date","date"]].forEach(function(x){
      var inp = h("input",{type:x[2], id:"draft-" + x[0], value:S.draft[x[0]] || ""}); inp.addEventListener("input", function(){ S.draft[x[0]] = inp.value; var b = $("addContext"); if (b) b.textContent = S.draft.title || S.draft.sourceUrl || S.draft.sourceLabel ? "Context added · edit" : "Add context"; });
      s.append(field(x[1], inp));
    });
    return s;
  }
  var ro = readOnly(), k = "ctl-" + r.id + "-";
  // title and source
  var title = keep(h("input",{type:"text", id:"ctl-title", value:r.title || "", disabled: ro ? "" : null}), k + "title");
  var url = keep(h("input",{type:"url", id:"ctl-url", value:r.sourceUrl || "", disabled: ro ? "" : null}), k + "url");
  var label = keep(h("input",{type:"text", id:"ctl-label", value:r.sourceLabel || "", disabled: ro ? "" : null}), k + "label");
  var date = keep(h("input",{type:"date", id:"ctl-date", value:r.sourceDate || "", disabled: ro ? "" : null}), k + "date");
  var meta = ctlItem(h("h3",{text:"Title and source"}), field("Title", title), field("Source link", url), field("Source label", label), field("Date", date));
  if (!ro) meta.append(h("button",{class:"btn", type:"button", text:"Save", onclick:async function(){ if (blockWhileBusy()) return; S.busy = true; try { var b = await API.saveRun(r.id, {title:title.value.trim(), sourceUrl:url.value.trim(), sourceLabel:label.value.trim(), sourceDate:date.value || ""}); forget(k + "title", k + "url", k + "label", k + "date"); S.busy = false; await reload(b); say("Saved."); } catch(e){ S.busy = false; say(errCopy(e)); } }}),
    h("p",{class:"hint",text:"Changes the labels only; the readings stay as they are."}));
  s.append(meta);
  // where the words came from, and whether that is the intended source
  var idn = S.b.sourceIdentity || {}, src = h("div",{class:"ctl-item", id:"ctl-source", tabindex:"-1"}, h("h3",{text:"Source"}));
  src.append(h("p",{text:cap(acquisition(r)) + (r.import ? ", from " + r.import.url : "") + "."}));
  if (idn.state === "needs_confirmation") src.append(compareBody(idn, true));
  else if (idn.state === "confirmed") src.append(h("p",{text:"You said on " + fmtDate(idn.confirmation.at) + " that this source is the intended episode. That is your statement about the match, not a check of the transcript."}));
  else if (idn.state === "direct") src.append(h("p",{class:"hint",text:"Named directly by the link, the feed or the show; nothing to confirm."}));
  else if (idn.state === "not_recorded") src.append(h("p",{class:"hint",text:"How this source was identified was not recorded (saved before version 0.12)."}));
  if (!ro && !isClaimRun()) {
    var link = keep(h("input",{type:"url", id:"ctl-relink", placeholder:"A podcast, video or page link"}), k + "relink"), msg = h("div");
    src.append(field("Use a different link", link), h("button",{class:"btn quiet", type:"button", text:"Fetch and read", onclick:function(){ var u = link.value.trim(); if (!/^https?:\/\//.test(u)) { say("Enter a link that starts with http."); return; } forget(k + "relink"); fetchTranscript(u, "", "", {msg:msg, onWords:async function(t, imp, jobId){ var b = await API.consumeJob(jobId); await reload(b); closeDrawer("controls", true); }, context:{}, targetRunId:r.id}); }}),
      h("p",{class:"hint",text:"The text from the new link replaces this one. Readings made from the old text are kept and marked out of date, and a confirmation of the old source does not carry over."}), msg);
  }
  if (!ro && S.b.pageText) src.append(h("div",{class:"ctl-sub"}, h("p",{text:"This text still holds a web page's controls and timestamps (saved before they were taken out at intake)."}),
    h("button",{class:"btn quiet", type:"button", text:"Separate them from the words", onclick:function(){ request(API.pageText, "Separated. Readings made from the old text are kept and marked out of date."); }}),
    h("p",{class:"hint",text:"Every spoken word is kept and the original stays saved. Readings made from the old text are marked out of date."})));
  s.append(src);
  // the text itself
  if (!ro) {
    var ed = disclosure(k + "edit", "Edit the text", "ctl-edit");
    var ta = keep(h("textarea",{id:"ctl-text", rows:"10", "aria-label":"The text to read"}), k + "text"); if (!Object.prototype.hasOwnProperty.call(UI.drafts, k + "text")) ta.value = S.b.transcript || "";
    ed.append(ta, h("button",{class:"btn", type:"button", text:"Save and read again", onclick:async function(){ if (blockWhileBusy()) return; S.busy = true; try { await API.saveRun(r.id, {}, ta.value); forget(k + "text"); var b = await API.readRun(r.id); S.busy = false; closeDrawer("controls", true); await reload(b); } catch(e){ S.busy = false; say(errCopy(e)); } }}),
      h("p",{class:"hint",text:"Readings made from the old text are kept and marked out of date; what changed is read again on your key."}));
    if (S.ai && !S.ai.mock) ed.append(pictures(r, ta, k));
    s.append(ed);
  }
  // speakers
  s.append(ctlSpeakers(r, ro, k));
  return s;
}
/* Speakers: where the labels came from, names (one confirmation for speakers the app numbered), and, when the source
   gave no labels, the two ways to find them: from the words, or by voice from the recording. */
function ctlSpeakers(r, ro, k){
  var sp = h("div",{class:"ctl-item", id:"ctl-speakers", tabindex:"-1"}, h("h3",{text:"Speakers"}));
  if (isClaimRun()) { sp.append(h("p",{class:"hint",text:"A typed claim has no speakers."})); return sp; }
  var pr = r.provenance || {}, labels = speakerLabels(S.turns), origin = pr.labelsOrigin || "", st = pr.structure, vc = pr.voices;
  var fromSource = labels.some(function(x){ return x !== "UNLABELED"; }) && (!origin || origin === "source");
  // where the labels came from, in one line
  if (origin === "voices" && vc) sp.append(h("p",{text:"Separated by voice from the recording: " + plural(vc.voices, "voice") + ", with " + Math.round((vc.coverage || 0) * 100) + "% of this text's words lined up with what the recording heard." + (vc.unlabelled ? " " + plural(vc.unlabelled, "word") + " could not be placed and show as “Speaker not established”." : "")}),
    h("p",{class:"hint",text:vc.method + (vc.audioFoundBy ? " Recording: " + vc.audioFoundBy + "." : "")}));
  else if (origin === "words" && st) sp.append(h("p",{text:"Worked out from the words: " + plural(st.voices, "speaker") + (st.clips && st.clips.length ? ", " + plural(st.clips.length, "clip or quotation", "clips or quotations") + " set apart" : "") + "." + (st.unestablishedSegments ? " " + plural(st.unestablishedSegments, "stretch", "stretches") + " where the words don't show who is speaking." : "")}),
    h("p",{class:"hint",text:st.method}));
  else if (origin === "model" && pr.assignment) sp.append(h("p",{text:"Names suggested by AI from the words: " + pr.assignment.named + " of " + pr.assignment.turns + " turns named, " + pr.assignment.unknown + " left without a name. They are not labels from the source. A person's correction under Who said what wins."}));
  else if (fromSource) sp.append(h("p",{text:"The speaker labels came with the text." + (st && st.clips && st.clips.length ? " " + plural(st.clips.length, "clip or quotation was", "clips or quotations were") + " set apart from the speaker who played or read it." : "")}));
  else if (allUnlabeled()) sp.append(h("p",{text:"No speaker labels came with this text." + (st && st.established === false ? " The words alone don't show where the speaker changes, so the text is read as it is." : "")}));
  // names
  var shownKeys = (r.speakers || []).filter(function(x){ return labels.indexOf(x.key) !== -1 && x.key !== "UNLABELED"; });
  if ((origin === "words" || origin === "voices") && shownKeys.length) sp.append(nameConfirm(r, ro, k, shownKeys, (origin === "voices" ? vc : st) || {}));
  else if (shownKeys.length) {
    shownKeys.forEach(function(x){ sp.append(h("div",{class:"speaker"}, h("span",{class:"key",text:x.key}), keep(h("input",{type:"text", value:x.name || "", "aria-label":"Display name for " + x.key, placeholder:"Display name", disabled: ro ? "" : null}), k + "name-" + x.key), keep(h("input",{type:"text", value:x.bio || "", "aria-label":"Short bio for " + x.key, placeholder:"Bio: job, books, role (optional)", disabled: ro ? "" : null}), k + "bio-" + x.key))); });
    if (!ro) sp.append(h("button",{class:"btn quiet", type:"button", text:"Save names", onclick:async function(){
      var list = (r.speakers || []).map(function(x){ var nEl = sp.querySelector('[data-key="' + k + "name-" + x.key + '"]'), bEl = sp.querySelector('[data-key="' + k + "bio-" + x.key + '"]'); return {key:x.key, name: nEl ? nEl.value : x.name, bio: bEl ? bEl.value : x.bio}; });
      try { var b = await API.saveRun(r.id, {speakers:list}); (r.speakers||[]).forEach(function(x){ forget(k + "name-" + x.key, k + "bio-" + x.key); }); await reload(b); say("Saved."); } catch(e){ say(errCopy(e)); }
    }}), h("p",{class:"hint",text:"A display name only changes what is shown. A bio helps the speaker check; readings are not redone."}));
  }
  // finding the speakers when the source gave none
  if (!ro && !fromSource && S.turns.some(function(t){ return !t.heading; })) sp.append(findSpeakers(r, k, origin));
  if (S.turns.length) { var who = disclosure(k + "who", "Who said what: record and corrections", "ctl-who"); who.append(renderWhoSaid()); sp.append(who); }
  return sp;
}
/* One confirmation of the names of speakers the app numbered: a name the words gave is filled in with its evidence; a
   suggestion (someone addressed by name, the show's title) is offered, never applied. */
function nameConfirm(r, ro, k, keys, record){
  var box = h("div",{class:"names"}), inputs = {};
  var suggestions = (record.names || []).filter(function(x){ return !x.applied; });
  keys.forEach(function(x){
    var numbered = /^SPEAKER \d+$/.test(x.key), label = numbered ? "Speaker " + x.key.split(" ")[1] : x.name;
    if (!numbered) { box.append(h("p",{class:"hint",text:label + ": " + (x.bio || "")})); return; }
    var inp = keep(h("input",{type:"text", value:/^Speaker \d+$/.test(x.name || "") ? "" : x.name, placeholder:"Name", "aria-label":"Name for " + label, disabled: ro ? "" : null}), k + "cname-" + x.key);
    inputs[x.key] = inp;
    var row = h("div",{class:"speaker"}, h("span",{class:"key",text:label}), inp);
    box.append(row);
    if (x.bio) box.append(h("p",{class:"hint",text:x.bio}));
    suggestions.filter(function(sg){ return sg.key === x.key; }).forEach(function(sg){
      box.append(h("p",{class:"hint"}, document.createTextNode("Suggested: " + sg.name + " (" + String(sg.kind || "").replace(/_/g, " ") + ": “" + String(sg.quote || "").slice(0, 160) + "”) "), ro ? null : h("button",{type:"button", class:"linkish inline", text:"Use", onclick:function(){ inp.value = sg.name; UI.drafts[k + "cname-" + x.key] = sg.name; }})));
    });
  });
  if (!ro && Object.keys(inputs).length) {
    box.append(h("button",{class:"btn quiet", type:"button", text:"Confirm names", onclick:async function(){
      var list = Object.keys(inputs).map(function(key){ var v = inputs[key].value.trim(); return {key:key, name: v || "Speaker " + key.split(" ")[1]}; });
      try { var b = await API.confirmNames(r.id, list); Object.keys(inputs).forEach(function(key){ forget(k + "cname-" + key); }); await reload(b); say("Names confirmed."); } catch(e){ say(errCopy(e)); }
    }}), h("p",{class:"hint",text: (r.provenance && r.provenance.namesConfirmedAt ? "You confirmed these names on " + fmtDate(r.provenance.namesConfirmedAt) + ". " : "") + "Names change only what is shown; readings are not redone."}));
  }
  return box;
}
/* The two ways to find speakers the source didn't give, behind one disclosure. */
function findSpeakers(r, k, origin){
  var pr = r.provenance || {}, d = disclosure(k + "find", origin === "voices" ? "Separate the voices again" : "Find who is speaking", "ctl-find"), msg = h("div",{class:"hint", role:"status"});
  var long = function(btn, label, fn){ return async function(){
    if (blockWhileBusy()) return; S.busy = true; btn.disabled = true; S.abort = new AbortController(); msg.textContent = label;
    try { var b = await fn(S.abort.signal); S.busy = false; S.abort = null; if (b && b.outcome === "nothing_established") { msg.textContent = "The words don't show where the speaker changes, so nothing was changed."; await reload(b); return; } closeDrawer("controls", true); await reload(b); }
    catch(e){ msg.textContent = errCopy(e); btn.disabled = false; if (e && e.code === "cloud_not_configured") { S.engines = null; renderControls(true); } }
    finally { S.busy = false; S.abort = null; }
  }; };
  if (origin !== "voices" && !pr.structure) {
    var wb = h("button",{class:"btn quiet", type:"button", text:"Work out who is speaking from the words"});
    wb.addEventListener("click", function(){ if (!ensureAI(d, function(){ wb.click(); })) return; return long(wb, "Reading the text for changes of speaker… a few model passes.", function(signal){ return API.speakersFromWords(r.id, signal); })(); });
    d.append(ctlItem(wb, h("p",{class:"hint",text:"Labels only where the words show a change of speaker (a question answered, a guest introduced, a clip played), checked by a second pass. The words are never changed. A few model passes, billed to your key; the reading starts again."})));
  }
  var e = S.engines, info = r.import && r.import.episodeInfo || {}, known = !!(info.audioUrl || (r.import && r.import.url && info.guid));
  var link = keep(h("input",{type:"url", placeholder: known ? "Leave empty to use the episode this text came from" : "The episode's link or its audio file"}), k + "voices-link");
  var vb = h("button",{class:"btn quiet", type:"button", text:"Separate voices from the recording"});
  vb.addEventListener("click", long(vb, "Sending the recording to Deepgram and lining its voices up with the text… this can take a minute or two.", function(signal){ return API.voices(r.id, link.value.trim(), signal); }));
  var voice = h("div",{class:"ctl-item"}, field("Recording", link), vb, h("p",{class:"hint",text:"The audio goes to Deepgram and is billed to your Deepgram key. Every word of this text stays; only the labels come from the recording. Voices are numbered; you can name them after. The reading starts again."}));
  if (e && !e.cloud.configured) {
    var dk = h("input",{type:"password", autocomplete:"off", placeholder:"Deepgram API key", "aria-label":"Deepgram API key"});
    var dsv = h("button",{class:"btn quiet", type:"button", text:"Save Deepgram key", onclick:async function(){ dsv.disabled = true; try { await API.setSetting("DEEPGRAM_API_KEY", dk.value); dk.value = ""; S.engines = await API.engines(); renderControls(true); say("Key saved."); } catch(err){ dsv.disabled = false; say(errCopy(err)); } }});
    vb.disabled = true;
    voice.append(h("p",{class:"hint",text:"Needs a Deepgram key first. It is written to .env on this computer and sent only to Deepgram."}), h("div",{class:"row"}, dk, dsv));
  }
  d.append(voice, msg);
  return d;
}
function pictures(r, ta, k){
  var img = h("input",{id:"f-img",type:"file",accept:"image/png,image/jpeg,image/webp,image/gif",multiple:"",class:"file-input",tabindex:"-1","aria-hidden":"true"});
  var btn = h("button",{class:"btn quiet",type:"button",text:"Add text from pictures",onclick:function(){ img.click(); }});
  var note = h("p",{class:"hint",text:"Pictures (screenshots of quotes) are transcribed by the model and added to the text above as turns labeled IMAGE. The pictures are kept with the reading."});
  img.addEventListener("change", async function(){
    var files = Array.prototype.slice.call(img.files||[]).slice(0, 8); if (!files.length) return;
    btn.textContent = "Transcribing…";
    try {
      var images = []; for (var i = 0; i < files.length; i++) images.push({mediaType: files[i].type, data: await fileToBase64(files[i])});
      var res = await API.sample(P.transcribe, {images: images, purpose:"transcribe"});
      var pieces = String(res.text||"").split(/\n---\n/);
      ta.value = (ta.value.trim() ? ta.value.trim() + "\n\n" : "") + pieces.map(function(t,i){ return "IMAGE " + (i+1) + ": " + t.trim(); }).join("\n\n"); UI.drafts[k + "text"] = ta.value;
      for (var j = 0; j < files.length; j++){ try { await API.addAttachment(r.id, {name:files[j].name||"", mediaType:files[j].type, data:images[j].data, transcribedText:(pieces[j]||"").trim()}); } catch(e){} }
      note.textContent = "Added to the text above. Press Save and read again to read it.";
    } catch(e){ note.textContent = errCopy(e); }
    btn.textContent = "Add text from pictures"; img.value = "";
  });
  return ctlItem(btn, img, note);
}
function ctlApp(){
  var s = h("section",{class:"ctl-group", id:"ctl-app", tabindex:"-1", "aria-labelledby":"ctl-app-h"}, h("h2",{id:"ctl-app-h", text:"App and files"}));
  var r = run();
  // model key
  var m = ctlItem(h("h3",{text:"Model"}), h("p",{text: S.ai ? (S.ai.mock ? "Test responder (mock). Readings are placeholders, not a model's work." : "Anthropic key set. Readings use " + S.ai.model + "; each reading and review is billed to that key.") : "No model key yet. The app asks for it the first time a reading needs it."}));
  if (!S.ai || !S.ai.mock) {
    var key = h("input",{type:"password", autocomplete:"off", placeholder:"sk-ant-…", "aria-label":"Anthropic API key"});
    var sv = h("button",{class:"btn quiet", type:"button", text: S.ai ? "Replace key" : "Save key", onclick:async function(){ sv.disabled = true; try { var out = await API.setKey(key.value); key.value = ""; S.ai = out.ai; say("Key saved."); renderControls(true); } catch(e){ sv.disabled = false; say(errCopy(e)); } }});
    m.append(h("div",{class:"row"}, key, sv), h("p",{class:"hint",text:"The key is written to .env on this computer. It is never shown here or sent anywhere except Anthropic."}));
  }
  s.append(m);
  // transcription
  var e = S.engines, tr = ctlItem(h("h3",{text:"Audio to text"}));
  if (!e) tr.append(h("p",{class:"hint",text:"Checking…"}));
  else {
    tr.append(h("p",{text:"On this computer: " + (e.local.installed ? "installed. Free and private; slow; no speaker names." : "not installed. The app offers to install it (about 480 MB) the first time it is needed.")}));
    tr.append(h("p",{text:"Deepgram: " + (e.cloud.configured ? "key set. Fast, with speakers numbered by voice; the audio is sent to Deepgram and billed to your Deepgram key." : "no key. Fast and paid; the audio is sent to Deepgram.")}));
    if (e.local.installed && e.cloud.configured) {
      var pref = h("select",{"aria-label":"Which to use"}, h("option",{value:"local",text:"Use this computer",selected:e.prefer === "local" ? "selected" : null}), h("option",{value:"cloud",text:"Use Deepgram",selected:e.prefer === "cloud" ? "selected" : null}));
      pref.addEventListener("change", async function(){ try { await API.preferEngine(pref.value); S.engines = await API.engines(); say("Saved."); } catch(err){ say(errCopy(err)); } });
      tr.append(field("Which to use", pref));
    }
    if (!e.cloud.configured) { var dk = h("input",{type:"password", autocomplete:"off", placeholder:"Deepgram API key", "aria-label":"Deepgram API key"}); var dsv = h("button",{class:"btn quiet", type:"button", text:"Save Deepgram key", onclick:async function(){ dsv.disabled = true; try { await API.setSetting("DEEPGRAM_API_KEY", dk.value); dk.value = ""; S.engines = await API.engines(); renderControls(true); say("Key saved."); } catch(err){ dsv.disabled = false; say(errCopy(err)); } }}); tr.append(h("div",{class:"row"}, dk, dsv)); }
  }
  s.append(tr);
  // downloads
  if (r && r.id) {
    var dl = ctlItem(h("h3",{text:"Downloads"}));
    dl.append(h("ul",{class:"links"},
      h("li",{}, h("a",{href:"/api/runs/" + r.id + "/export.md?level=hs", download:"", text:"Readable version (Markdown, high school)"})),
      h("li",{}, h("a",{href:"/api/runs/" + r.id + "/export.md?level=g5", download:"", text:"Readable version (Markdown, fifth grade)"})),
      h("li",{}, h("a",{href:"/api/runs/" + r.id + "/export.json", download:"", text:"Full record (claims JSON)"})),
      h("li",{}, h("a",{href:"/api/runs/" + r.id + "/obligations.json", download:"", text:"Checkable claims for Receipts (JSON)"})),
      r.intake && r.intake.file ? h("li",{}, h("a",{href:"/api/runs/" + r.id + "/original-input.txt", target:"_blank", text:"The original upload"})) : null));
    dl.append(h("p",{class:"hint",text:"The readable version leaves out held readings and says so. The full record keeps everything: saved claim types, quote checks, model-call records and every source decision."}));
    s.append(dl);
  }
  // diagnostics
  var dg = disclosure("ctl-diag", "Version and diagnostics", "ctl-diag"), kv = h("dl",{class:"kv"});
  var row = function(k2, v){ kv.append(h("dt",{text:k2}), h("dd",{text:v})); };
  row("Version", S.health ? S.health.version : "unknown");
  row("Data folder", S.health ? S.health.dataDir : "unknown");
  row("Source search", S.research ? (S.research.mock ? "mock" : "Crossref, PubMed, OpenAlex, GDELT") : "not configured");
  if (r && r.id) {
    row("Reading id", r.id);
    row("Text", S.turns.filter(function(t){ return !t.heading; }).length + " turns, " + (S.b.transcript || "").length.toLocaleString() + " characters · sha256 " + (r.input && r.input.sha256 || "").slice(0, 16) + "…");
    var tq = 0, mq = 0; S.b.passages.forEach(function(p){ if (p.quoteCheck) { tq += p.quoteCheck.quotes; mq += p.quoteCheck.matched; } });
    if (tq) row("Quotes", mq + " of " + tq + " match the saved text (checked on every load)");
    row("Readings", S.b.passages.filter(isReady).length + " of " + S.b.passages.length + " ready");
  }
  dg.append(kv);
  if (r && r.processing) dg.append(h("pre",{class:"small",text:JSON.stringify(Object.assign({}, r.processing, {segmentCalls:undefined}), null, 2)}));
  s.append(dg);
  // trash, at the bottom
  if (r && r.id && !r.example) {
    var tz = ctlItem();
    var del = h("button",{class:"btn quiet danger", type:"button", text:"Move this reading to the trash", onclick:function(){
      clear(tz); tz.append(h("p",{text:"Move “" + (r.title || "this reading") + "” to the trash? It is moved to the trash folder inside the data folder and can be restored from Readings."}),
        h("div",{class:"row"}, h("button",{class:"btn danger", type:"button", text:"Move to trash", onclick:async function(){ if (blockWhileBusy()) return; try { await API.deleteRun(r.id); S.runId = null; S.b = null; storeSet("deflate-run", null); closeDrawer("controls", true); await refreshList(); newReading(); say("Moved to the trash."); } catch(e){ say(errCopy(e)); } }}), h("button",{class:"btn quiet", type:"button", text:"Keep it", onclick:function(){ renderControls(true); }})));
    }});
    tz.append(del); tz.className = "ctl-item danger-zone"; s.append(tz);
  }
  return s;
}

/* Who said what: the preparation record, the optional attribution check, and per-turn corrections. */
function renderWhoSaid(){
  var r = run(), pr = r.provenance || {overrides:{},flags:[]}, ro = readOnly(), b = h("div",{class:"who-body"});
  var confirmed = attributionOk(), prep = r.preparation;
  if (pr.notApplicable){ b.append(h("p",{class:"hint",text:pr.method || "Nothing to attribute."})); return b; }
  b.append(h("p",{text: confirmed ? "Speaker preparation passed." + (prep && prep.corrections ? " " + plural(prep.corrections.length, "supported change was", "supported changes were") + " applied before reading." : "") : "The reading is held while speaker labels are unresolved. A transcript with reliable labels, or the recording, is needed for the rest."}));
  if (prep) b.append(h("p",{class:"hint",text:prep.method}));
  var speakers = speakerLabels(S.turns), ov = overrides();
  if (pr.transcriptNote) b.append(h("p",{class:"hint",text:pr.transcriptNote}));
  if ((r.provenanceHistory||[]).length) b.append(h("p",{class:"hint",text:plural(r.provenanceHistory.length, "earlier set") + " of attribution decisions " + (r.provenanceHistory.length === 1 ? "is" : "are") + " kept in the run file."}));
  if (pr.shiftNote) b.append(h("p",{class:"note",text:"Shift detected: " + pr.shiftNote}));
  if (!ro){
    var msg = h("div"), auditBtn = h("button",{class:"btn quiet",type:"button",text: pr.auditedAt ? "Check attribution again with the model" : "Check attribution with the model",onclick:function(){ if (!ensureAI(b, function(){ auditBtn.click(); })) return; runAudit(msg, auditBtn); }});
    b.append(h("div",{class:"row"}, auditBtn), h("p",{class:"hint",text:"Optional. Flags turns whose words conflict with their label. One model pass per long section, billed to your key."}), msg);
  }
  if ((pr.flags||[]).length){
    b.append(h("p",{class:"ctl-label",text:"Flagged turns"}));
    pr.flags.forEach(function(f){
      var t = S.turns[f.turn]; if (!t) return;
      var sel = h("select",{disabled:ro?"":null,"aria-label":"Speaker of turn " + t.i});
      speakers.forEach(function(k){ sel.append(h("option",{value:k,text:speakerName(k), selected: effSpeaker(t) === k ? "selected":null})); });
      sel.addEventListener("change", function(){ setOverride(t.i, sel.value); });
      var apply = (!ro && f.likely && f.likely !== "UNSURE" && speakers.indexOf(f.likely) !== -1 && effSpeaker(t) !== f.likely) ? h("button",{class:"btn quiet",type:"button",text:"Use suggestion",onclick:function(){ setOverride(t.i, f.likely); }}) : null;
      b.append(h("div",{class:"flag"}, h("span",{class:"n",text:"[" + t.i + "]"}),
        h("div",{}, h("p",{class:"q",text:t.text.length > 320 ? t.text.slice(0,320) + "…" : t.text}),
          h("p",{class:"hint",text:"Labeled " + f.labeled + " · likely " + (f.likely||"?") + (f.cue ? " · cue: “" + f.cue + "”" : "")}),
          h("div",{class:"row"}, sel, apply, ov[String(t.i)] ? h("span",{class:"hint",text:"corrected"}) : null))));
    });
  }
  var det = disclosure("turns-" + r.id, "Every turn" + (ro ? "" : ", with its speaker"), "turns");
  var list = h("div",{class:"turns"}), PAGE = 80, page = UI.turnsPage || 0, pager = h("div",{class:"row"});
  function drawTurns(){
    clear(list);
    S.turns.slice(page*PAGE, page*PAGE+PAGE).forEach(function(t){
      var row = h("div",{class:"turn-row" + (t.heading ? " heading":"") + (ov[String(t.i)] ? " changed":"")});
      row.append(h("span",{class:"n",text:"[" + t.i + "]"}));
      if (t.heading){ row.append(h("span",{class:"txt",text:t.text})); }
      else { var sel = h("select",{disabled:ro?"":null,"aria-label":"Speaker of turn " + t.i}); speakers.forEach(function(k){ sel.append(h("option",{value:k,text:speakerName(k), selected: effSpeaker(t) === k ? "selected":null})); }); sel.addEventListener("change", function(){ if (S.busy) { blockWhileBusy(); sel.value = effSpeaker(t); return; } setOverride(t.i, sel.value); }); row.append(sel, h("span",{class:"txt",text:t.text})); }
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
    var confirmBtn = h("button",{class:"btn quiet",type:"button",text: pr.confirmedAt ? "Confirm attribution again" : "Confirm attribution from a reliable recording",onclick:async function(){
      if (blockWhileBusy()) return; S.busy = true;
      try {
        var prov = JSON.parse(JSON.stringify(r.provenance || {}));
        prov.confirmedAt = nowISO(); prov.confirmedBy = "person at this computer";
        prov.method = (prov.auditedAt ? "Content-cue audit by the model, then " : "") + "per-turn confirmation by a person. " + Object.keys(prov.overrides||{}).length + " labels corrected.";
        var nb = await API.saveRun(r.id, {provenance: prov, status: r.status === "draft" ? "attributed" : r.status});
        S.busy = false; await refreshList(); await reload(nb);
      } catch(e){ S.busy = false; say("Could not save: " + errCopy(e)); }
    }});
    b.append(h("div",{class:"row"}, confirmBtn), h("p",{class:"hint",text:"Confirming says you checked every label against the recording. Changing a label makes readings that used it out of date."}));
  }
  if (pr.confirmedAt) b.append(h("p",{class:"hint",text:"Confirmed " + fmtDate(pr.confirmedAt) + (pr.confirmedBy ? " by " + pr.confirmedBy : "") + ". " + (pr.method||"")}));
  return b;
}
async function setOverride(i, key){
  if (blockWhileBusy()) return;
  var r = run(); if (!r || readOnly()) return;
  var prov = JSON.parse(JSON.stringify(r.provenance || {})); prov.overrides = prov.overrides || {};
  if (S.turns[i].label === key) delete prov.overrides[String(i)]; else prov.overrides[String(i)] = key;
  delete prov.confirmedAt; delete prov.confirmedBy;
  S.busy = true;
  try { var nb = await API.saveRun(r.id, {provenance: prov}); S.busy = false; await reload(nb); } catch(e){ say(errCopy(e)); }
  finally { S.busy = false; }
}
async function runAudit(msg, btn){
  if (!S.ai || S.busy) return;
  var r = run(); S.busy = true; btn.disabled = true; clear(msg);
  var ranges = chunkRanges(S.turns, 60000), flags = [], shiftNotes = [];
  try {
    for (var c = 0; c < ranges.length; c++){
      msg.replaceChildren(h("p",{class:"hint",text:"Checking section " + (c+1) + " of " + ranges.length + "…"}));
      S.abort = new AbortController();
      var out = (await API.sample(P.audit(r, fmtTurns(ranges[c][0], ranges[c][1], {})), {json:true, signal:S.abort.signal, purpose:"audit"})).data;
      (out && out.flags || []).forEach(function(f){ if (typeof f.turn === "number" && S.turns[f.turn]) flags.push({turn:f.turn, labeled:String(f.labeled||S.turns[f.turn].label), likely:String(f.likely||"UNSURE").toUpperCase(), confidence: typeof f.confidence==="number"?f.confidence:null, cue:String(f.cue||"").slice(0,200)}); });
      if (out && out.shift && out.shift.detected && out.shift.note) shiftNotes.push(String(out.shift.note));
    }
    var prov = JSON.parse(JSON.stringify(r.provenance || {overrides:{}}));
    prov.flags = flags.sort(function(a,b){ return a.turn-b.turn; }); prov.auditedAt = nowISO(); prov.auditedBy = analyzedByLabel(); prov.shiftNote = shiftNotes.join(" "); prov.labelsFound = speakerLabels(S.turns);
    delete prov.confirmedAt; delete prov.confirmedBy;
    var nb = await API.saveRun(r.id, {provenance: prov});
    S.busy = false; await reload(nb); say(plural(flags.length, "turn") + " flagged.");
  } catch(e){ msg.replaceChildren(h("p",{class:"note err",text:errCopy(e)})); btn.disabled = false; }
  S.busy = false; S.abort = null;
}
/* Records a re-split parked on the run: sources, searches and rejections whose claims no longer exist. */
function renderOrphans(r){
  var box = h("div",{class:"note"}, h("p",{text:plural(r.orphans.length, "set") + " of records " + (r.orphans.length===1?"is":"are") + " waiting to be reattached: sources, searches or decisions whose claim is not in a current reading. Nothing was lost."}));
  var claims = []; S.b.passages.forEach(function(p){ if (p.status === "done" && p.analysis) (p.analysis.claims||[]).forEach(function(c){ claims.push({pid:p.id, idx:c.id, label:(p.title||p.id) + " · " + c.text.slice(0,80)}); }); });
  r.orphans.forEach(function(o){
    var line = h("div",{class:"orphan"});
    line.append(h("p",{class:"ct",text:"“" + o.claimText + "”" + (o.speaker ? " — " + speakerName(o.speaker) : "")}), h("p",{class:"hint",text:"From “" + (o.from && o.from.title || o.from && o.from.passage || "?") + "”, parked " + fmtDate(o.parkedAt) + ": " + [(o.receipts||[]).length ? plural(o.receipts.length, "source") : "", (o.searches||[]).length ? plural(o.searches.length, "search", "searches") : "", (o.rejections||[]).length ? plural(o.rejections.length, "rejection") : ""].filter(Boolean).join(", ")}));
    if (!readOnly() && claims.length){
      var sel = h("select",{"aria-label":"Claim to reattach to"}); claims.forEach(function(c){ sel.append(h("option",{value:c.pid + ":" + c.idx,text:c.label})); });
      var btn = h("button",{class:"btn quiet",type:"button",text:"Reattach to this claim",onclick:async function(){ btn.disabled = true; var v = sel.value.split(":"); try { await reload(await API.attachOrphan(r.id, o.id, v[0], v[1])); } catch(e){ say(errCopy(e)); btn.disabled = false; } }});
      line.append(h("div",{class:"row"}, sel, btn));
    }
    box.append(line);
  });
  return box;
}

/* ---------- User Guide: one Markdown file (docs/guide.md), rendered here with plain DOM, no HTML from the file ---------- */
function slug(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function inline(tag, text){
  var el = h(tag), re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g, last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) el.append(document.createTextNode(text.slice(last, m.index)));
    var t = m[0];
    if (t.slice(0,2) === "**") el.append(h("strong",{text:t.slice(2,-2)}));
    else if (t.charAt(0) === "`") el.append(h("code",{text:t.slice(1,-1)}));
    else if (t.charAt(0) === "[") { var mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t), href = mm[2], ext = /^https?:/.test(href); el.append(h("a",{href: /^(https?:|#|\/)/.test(href) ? href : "#", text:mm[1], target: ext ? "_blank" : null, rel: ext ? "noopener" : null})); }
    else el.append(h("em",{text:t.slice(1,-1)}));
    last = m.index + t.length;
  }
  if (last < text.length) el.append(document.createTextNode(text.slice(last)));
  return el;
}
function markdown(src){
  var out = h("div",{class:"guide-body"}), lines = String(src).replace(/\r/g, "").split("\n"), list = null, ordered = false, para = [];
  function flush(){ if (para.length) { out.append(inline("p", para.join(" "))); para = []; } }
  lines.forEach(function(l){
    var m;
    if (/^\s*$/.test(l)) { flush(); list = null; return; }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) { flush(); list = null; var tag = ["h1","h2","h3"][m[1].length - 1], el = inline(tag, m[2]); if (tag === "h2") { el.id = "guide-" + slug(m[2]); el.setAttribute("tabindex", "-1"); } out.append(el); return; }
    if ((m = /^\s*(?:[-*]|(\d+)\.)\s+(.*)$/.exec(l))) { flush(); var isOl = !!m[1]; if (!list || ordered !== isOl) { list = h(isOl ? "ol" : "ul"); ordered = isOl; out.append(list); } list.append(inline("li", m[2])); return; }
    if (list && /^\s{2,}\S/.test(l)) { list.lastChild && list.lastChild.append(document.createTextNode(" " + l.trim())); return; }
    para.push(l.trim());
  });
  flush();
  return out;
}
async function showGuide(section){
  if (UI.drawer) closeDrawer(UI.drawer, true);
  S.view = "guide";
  var g = $("guideView"); if (!g) return;
  if (view) view.hidden = true; if (welcome) welcome.hidden = true; g.hidden = false;
  try { if (!/^#guide/.test(location.hash)) location.hash = "guide"; } catch(e){}
  if (!S.guideText) { try { var res = await fetch("/guide.md"); S.guideText = res.ok ? await res.text() : ""; } catch(e){ S.guideText = ""; } }
  clear(g);
  var back = function(){ return h("button",{type:"button", class:"btn quiet back", text: S.runId ? "Back to your reading" : "Back to the start", onclick:leaveGuide}); };
  g.append(back());
  if (!S.guideText) { g.append(h("p",{text:"The guide could not be loaded. It is the file docs/guide.md in the app folder."})); return; }
  var body = markdown(S.guideText), toc = h("nav",{class:"guide-toc", "aria-label":"Guide sections"}), ol = h("ol");
  body.querySelectorAll("h2").forEach(function(x){ ol.append(h("li",{}, h("a",{href:"#" + x.id, text:x.textContent, onclick:function(e){ e.preventDefault(); goGuide(x.id); }}))); });
  toc.append(ol);
  var h1 = body.querySelector("h1"); if (h1) { body.removeChild(h1); g.append(h1); }
  g.append(toc, body, back());
  if (section) goGuide("guide-" + section); else { var t = g.querySelector("h1"); if (t && hasFn(t, "focus")) { t.setAttribute("tabindex", "-1"); t.focus(); } window.scrollTo && window.scrollTo(0, 0); }
}
function goGuide(id){ var el = $(id); if (!el) return; if (hasFn(el, "scrollIntoView")) el.scrollIntoView({block:"start"}); if (hasFn(el, "focus")) el.focus({preventScroll:true}); }
function leaveGuide(){ S.view = S.runId ? "run" : "new"; var g = $("guideView"); if (g) g.hidden = true; if (S.runId) { S.rendered = null; selectRun(S.runId); } else newReading(); }

window.addEventListener("hashchange", function(){
  var hsh = location.hash || "";
  if (/^#guide/.test(hsh)) { if (S.view !== "guide") showGuide(hsh.slice(7)); else if (hsh.length > 7) goGuide("guide-" + hsh.slice(7)); return; }
  var id = hashRun();
  if (S.view === "guide" && (id || !hsh)) { S.view = id ? "run" : "new"; S.rendered = null; }
  if (id && (id !== S.runId || S.view !== "run") && S.runs.some(function(r){ return r.id === id; })) selectRun(id);
});
boot();
})();
