"use strict";
/* The one place the app talks to a model. The browser never sees the API key: the page posts a prompt
   to /api/sample and this module forwards it to Anthropic's Messages API with the key from .env.
   DEFLATE_MOCK_AI=1 swaps in a canned responder so the whole workflow can be exercised (and tested)
   without a key or a bill. Mock output is labelled MOCK everywhere it appears. */

const DEFAULT_MODEL = "claude-sonnet-5-5";
/* A ceiling, not a target: a reading of a long passage at two levels can exceed 8,000 output tokens, and an answer cut
   off at the limit is billed and unusable. Override with ANTHROPIC_MAX_TOKENS. */
const DEFAULT_MAX_TOKENS = 16000;

function parseJSONLoose(text) {
  const s = String(text || "").trim();
  try { return JSON.parse(s); } catch (e) {}
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch (e) {} }
  const a = s.search(/[\[{]/), b = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (a !== -1 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {} }
  const err = new Error("The model's reply was not well-formed JSON."); err.code = "invalid_json"; err.text = s; throw err;
}

/* The provider's answer as the app uses it. A JSON answer that cannot be read keeps the provider's identifiers, stop
   reason and usage on the error, so the failed call is still on record; an answer stopped by the length limit is named
   "truncated" rather than "not well-formed", because the remedy differs (a shorter answer, not a retry as is). */
function parseReply(text, meta, json) {
  if (!json) return Object.assign({ text }, meta);
  try { return Object.assign({ data: parseJSONLoose(text), text }, meta); }
  catch (e) {
    e.meta = meta;
    if (meta && meta.stopReason === "max_tokens") { e.code = "truncated"; e.message = "The model's answer was cut off at its length limit before the JSON was complete."; }
    throw e;
  }
}

function createAnthropicAI({ apiKey, model, maxTokens }) {
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const mdl = model || DEFAULT_MODEL;
  return {
    kind: "anthropic", model: mdl, mock: false,
    async sample({ prompt, json, images, signal }) {
      const content = [];
      (images || []).forEach(im => content.push({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.data } }));
      content.push({ type: "text", text: String(prompt || "") });
      let res;
      try {
        res = await client.messages.create({ model: mdl, max_tokens: maxTokens || DEFAULT_MAX_TOKENS, messages: [{ role: "user", content }] }, { signal });
      } catch (e) {
        const err = new Error(e && e.message ? e.message : "model request failed");
        err.code = e && e.status === 401 ? "bad_key" : e && e.status === 429 ? "rate_limited" : e && e.name === "AbortError" ? "cancelled" : "upstream_error";
        err.status = e && e.status;
        throw err;
      }
      const text = (res.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
      const usage = res.usage ? { input: res.usage.input_tokens, output: res.usage.output_tokens } : null;
      // the provider's own identifiers travel with the answer so the server can record which call produced which reading
      const meta = { usage, model: res.model || mdl, requestId: res.id || "", stopReason: res.stop_reason || "" };
      return parseReply(text, meta, json); // a failed parse still carries the provider's id, model, usage and stop reason
    }
  };
}

/* Canned responder. Recognises each prompt by its opening words and returns the right JSON shape. */
function createMockAI() {
  function turnsFrom(prompt) {
    const out = [];
    const re = /^\[(\d+)\] ([^:]+): (.*)$/gm; let m;
    while ((m = re.exec(prompt))) out.push({ i: +m[1], label: m[2].trim(), text: m[3] });
    return out;
  }
  return {
    kind: "mock", model: "mock", mock: true,
    async sample({ prompt, json }) {
      const p = String(prompt || "");
      let data;
      if (/^(Prepare transcript speaker labels|Review transcript speaker labels independently)/.test(p)) {
        const t = turnsFrom(p);
        data = { decisions: t.map(x => ({ turn: x.i, status: "keep", speaker: x.label, evidenceKind: "source_label", evidenceQuote: "", reason: "MOCK: keeps undisputed fixture labels; no real check." })) };
      } else if (p.startsWith("Assign speakers to an unlabeled transcript")) {
        // fixture: each paragraph is a turn, names rotate; the real model reads the words
        const names = JSON.parse((p.match(/The speakers are: (\[[^\]]*\])/) || [0, "[]"])[1]);
        const text = p.split("\nText:\n")[1] || "";
        data = { turns: text.split(/\n\s*\n/).filter(x => x.trim()).map((para, i) => ({ speaker: names.length ? names[i % names.length] : "UNKNOWN", start: para.trim().split(/\s+/).slice(0, 6).join(" "), evidenceKind: "conversational_role", reason: "MOCK: paragraphs rotate through the names; no real reading." })) };
      } else if (p.startsWith("Review these speaker assignments independently")) {
        const n = (p.split("\nTurns:\n")[1] || "").split("\n").filter(l => /^\[\d+\]/.test(l));
        data = { verdicts: n.map((l, i) => ({ index: i, agree: !/MOCK-DISAGREE/.test(l), speaker: (l.match(/^\[\d+\] ([^:]+):/) || [0, "UNKNOWN"])[1], reason: "MOCK: agrees unless the turn says MOCK-DISAGREE." })) };
      } else if (p.startsWith("This transcript has no speaker labels. Work out who is speaking")) {
        // fixture: one voice throughout, no change of speaker, no clip; the real model reads the words
        const m = /\nNumbered paragraphs:\n\[(\d+)\] (.*)/.exec(p);
        data = { segments: m ? [{ para: +m[1], start: m[2].split(/\s+/).slice(0, 6).join(" "), voice: "A", change: { kind: "none", quote: "" } }] : [], clips: [], names: [], voices: [{ voice: "A", role: "MOCK: not read" }] };
      } else if (p.startsWith("Find recordings played")) {
        data = { clips: [], ads: [] };
      } else if (p.startsWith("Review a speaker structure independently")) {
        const n = ((p.split("\nSegments:\n")[1] || "").match(/^\[\d+\]/gm) || []).length;
        data = { verdicts: Array.from({ length: n }, (_, i) => ({ segment: i, agree: true, reason: "MOCK" })), names: [] };
      } else if (p.startsWith("Who is each voice in this conversation?")) {
        // fixture: no clues of its own; the app's own reading of the words and the listing decides. The real model quotes
        // the words that show who each voice is, and every quotation is checked before it counts.
        data = { voices: [], unnamed: [] };
      } else if (p.startsWith("Correct a reading.")) {
        // fixture: each named field gets " (MOCK corrected)" appended; nothing else changes
        let reading = {}; try { reading = JSON.parse((p.split("\n\nREADING:\n")[1] || "").split("\n\nPROBLEMS:\n")[0]); } catch (e) {}
        const problems = (p.split("\n\nPROBLEMS:\n")[1] || "").split("\n").map(l => l.replace(/^\d+\.\s*/, "")).filter(Boolean);
        const get = path => path.split(/\.|(?=\[)/).reduce((x, k) => x == null ? undefined : k.startsWith("[") ? x[Number(k.slice(1, -1))] : x[k], reading);
        const changes = [];
        for (const pr of problems) {
          if (/quotation|quote/.test(pr) && !changes.some(c => c.path === "asSaid")) {
            // quote the passage's first turn, as the mock reading does
            const t = turnsFrom((p.split(/\nPASSAGE \(turns [^\n]*\n/)[1] || "").split(/\n\nCONTEXT AFTER|\n\nREADING:/)[0])[0];
            if (t) changes.push({ path: "asSaid", value: [{ turn: t.i, speaker: t.label, quote: t.text.split(/\s+/).slice(0, 12).join(" ") }] });
            continue;
          }
          const m = /^((?:claims\[\d+\]\.(?:plain|basis|settle))|deflated|defense|revision|jump)\.(hs|g5)\b/.exec(pr) || (/pivot|concern|jump/.test(pr) ? [0, "jump", "hs"] : [0, "deflated", "hs"]);
          const path = m[1] + "." + m[2], old = get(path);
          if (typeof old === "string" && !changes.some(c => c.path === path)) changes.push({ path, value: old + " (MOCK corrected)" });
        }
        data = { changes };
      } else if (p.startsWith("Review a corrected reading")) {
        // fixture: every problem named before is resolved and nothing else is wrong; the real model reviews the whole reading
        const n = ((p.split("\n\nPROBLEMS:\n")[1] || "").split("\n\nCHANGES:\n")[0].match(/^\d+\./gm) || []).length;
        data = { resolved: Array.from({ length: n }, () => true), approved: true, issues: [] };
      } else if (p.startsWith("Review this reading before it is shown")) {
        data = { approved: true, issues: [] }; // fixture-only; the UI still labels every output as MOCK
      } else
      if (p.startsWith("Transcribe all text")) return { text: "[MOCK transcription] no image reader in mock mode", usage: null, model: "mock" };
      else if (p.startsWith("Help a reader understand this passage accurately.") && p.includes("This is ONE claim exactly as a person typed it")) {
        // reading-2, one typed claim: a checkable claim, never graded true or false; no reasoning to judge
        const claim = (p.split("The claim:\n")[1] || "").trim();
        data = { deflated: { hs: "MOCK plain version of: " + claim, g5: "MOCK simple version of: " + claim }, type: "claim", basis: { hs: "MOCK: a checkable claim; mock mode checks nothing.", g5: "MOCK: something you could check." }, wouldSettle: "MOCK: a real model run.", settle: { hs: "MOCK: what would check it (high school).", g5: "MOCK: what would check it (fifth grade)." }, expectedSources: ["academic_paper"], searchQuery: "MOCK query " + claim.split(" ").slice(0, 3).join(" "), judgments: { evidence: "n/a", inference: "n/a" } };
      } else if (p.startsWith("Help a reader understand this passage accurately.")) {
        // reading-2, one passage. Only the PASSAGE turns are read (context turns are for interpretation, never quoted).
        // A turn containing "That shows" or "so everyone" gets a concern whose pivot is quoted verbatim and which partly
        // stands after the fair reading; anything else stands as said. This exercises both card shapes; it is not a reading.
        const body = (p.split(/\nPASSAGE \(turns [^\n]*\n/)[1] || "").split(/\n\nCONTEXT AFTER|\nNot shown: /)[0];
        const t = turnsFrom(body); const first = t[0] || { i: 0, label: "SPEAKER", text: "" };
        const quote = first.text.split(" ").slice(0, 12).join(" ");
        const hit = t.find(x => /\b(That shows|so everyone)\b/.test(x.text));
        const pivot = hit ? (hit.text.match(/\b(?:That shows|so everyone)\b[^.?!]*/) || [""])[0].split(" ").slice(0, 10).join(" ") : "";
        data = {
          asSaid: [{ turn: first.i, speaker: first.label, quote }].concat(hit && hit.i !== first.i ? [{ turn: hit.i, speaker: hit.label, quote: hit.text.split(" ").slice(0, 14).join(" ") }] : []),
          deflated: { hs: "MOCK plain words (high school): " + quote, g5: "MOCK plain words (fifth grade): " + quote },
          fidelity: { grade: "faithful", notes: { hs: "MOCK: no fidelity check was performed.", g5: "MOCK: not checked." } },
          jump: hit ? { present: true, pivot, hs: "MOCK concern (high school): the conclusion after \u201c" + pivot + "\u201d reaches past the reasons given.", g5: "MOCK concern (fifth grade): the ending says more than the reasons show." } : { present: false, pivot: "", hs: "MOCK: no concern raised in mock mode.", g5: "MOCK: no concern." },
          defense: { hs: "MOCK fair reading (high school): the strongest reasonable sense of these words.", g5: "MOCK fair reading (fifth grade): the best way to understand what was meant." },
          revision: hit ? { jumpSurvives: "partly", hs: "MOCK what follows (high school): part of the concern stands; the narrower point holds.", g5: "MOCK what follows (fifth grade): the small point holds; the big one needs more." } : { jumpSurvives: "", hs: "MOCK what follows (high school): the point stands as stated.", g5: "MOCK what follows (fifth grade): the point stands." },
          claims: [
            { text: "MOCK claim from turn " + first.i, speaker: first.label, type: "unscorable", plain: { hs: "MOCK plain (high school).", g5: "MOCK plain (fifth grade)." }, basis: { hs: "MOCK basis.", g5: "MOCK basis." }, status: "unchecked", wouldSettle: "A real model run.", settle: { hs: "MOCK: a real model run would say.", g5: "MOCK: a real run." } },
            { text: "MOCK checkable claim from turn " + first.i + " (exists so the source search can be exercised without a model)", speaker: first.label, type: "claim", plain: { hs: "MOCK plain claim (high school).", g5: "MOCK plain claim (fifth grade)." }, basis: { hs: "MOCK: no support is given in this passage.", g5: "MOCK: the passage does not show support." }, status: "unchecked", wouldSettle: "MOCK: a study.", settle: { hs: "MOCK: a study (high school).", g5: "MOCK: a study (fifth grade)." }, expectedSources: ["academic_paper"], searchQuery: "mock query " + first.i },
          ],
          judgments: { evidence: "n/a", inference: hit ? "gap" : "n/a" }
        };
      } else if (p.startsWith("Below are the final readings of")) {
        data = { patterns: [], survived: { hs: "MOCK: the closing overview is not computed in mock mode.", g5: "MOCK: not computed." } };
      } else if (p.startsWith("You are a deflation reader grading ONE claim")) {
        const claim = (p.split("The claim:\n")[1] || "").trim();
        data = { deflated: { hs: "MOCK plain version of: " + claim, g5: "MOCK simple version of: " + claim }, type: "unsupported", basis: { hs: "MOCK: typed as unsupported because mock mode knows nothing.", g5: "MOCK basis." }, wouldSettle: "MOCK: a real model run.", settle: { hs: "MOCK: what would settle it (senior high).", g5: "MOCK: what would settle it (fifth grade)." }, expectedSources: ["academic_paper"], searchQuery: "MOCK query " + claim.split(" ").slice(0, 3).join(" "), hidden: [], judgments: { evidence: "n/a", inference: "n/a" } };
      } else if (p.startsWith("You are checking speaker attribution")) {
        const t = turnsFrom(p);
        const flags = t.filter(x => /\bmy (wife|daughter|podcast|clinical practice|book)\b/i.test(x.text)).slice(0, 5).map(x => ({ turn: x.i, labeled: x.label, likely: "UNSURE", confidence: 0.5, cue: "MOCK: self-reference found" }));
        data = { flags, shift: { detected: false, note: "" } };
      } else if (p.startsWith("Split this transcript")) {
        const t = turnsFrom(p); const passages = [];
        for (let i = 0; i < t.length; i += 8) { const seg = t.slice(i, i + 8); passages.push({ title: "MOCK passage " + (passages.length + 1), turnStart: seg[0].i, turnEnd: seg[seg.length - 1].i, stake: "MOCK: what is at issue in turns " + seg[0].i + "–" + seg[seg.length - 1].i }); }
        data = { passages };
      } else if (p.startsWith("You are a deflation reader")) {
        const t = turnsFrom(p); const first = t[0] || { i: 0, label: "SPEAKER", text: "" };
        const quote = first.text.split(" ").slice(0, 12).join(" ");
        data = {
          asSaid: [{ turn: first.i, speaker: first.label, quote }],
          deflated: { hs: "MOCK deflation (senior high): " + quote, g5: "MOCK deflation (fifth grade): " + quote },
          fidelity: { grade: "faithful", notes: { hs: "MOCK: no fidelity check was performed.", g5: "MOCK: not checked." } },
          jump: { present: false, pivot: "", hs: "MOCK: no jump analysis in mock mode.", g5: "MOCK: not analysed." },
          defense: { hs: "MOCK: no defense written.", g5: "MOCK: none." },
          revision: { jumpSurvives: "no", hs: "MOCK: nothing to revise.", g5: "MOCK: nothing." },
          claims: [
            { text: "MOCK claim from turn " + first.i, speaker: first.label, type: "unscorable", plain: { hs: "MOCK plain (senior high).", g5: "MOCK plain (fifth grade)." }, basis: { hs: "MOCK basis.", g5: "MOCK basis." }, status: "unchecked", wouldSettle: "A real model run.", settle: { hs: "MOCK: a real model run would say.", g5: "MOCK: a real run." } },
            { text: "MOCK empirical claim from turn " + first.i + " (exists so the Search sources path can be exercised without a model)", speaker: first.label, type: "fact", plain: { hs: "MOCK plain claim (senior high).", g5: "MOCK plain claim (fifth grade)." }, basis: { hs: "MOCK basis.", g5: "MOCK basis." }, status: "unchecked", wouldSettle: "MOCK: a study.", settle: { hs: "MOCK: a study (senior high).", g5: "MOCK: a study (fifth grade)." }, expectedSources: ["academic_paper"], searchQuery: "mock query " + first.i },
          ],
          judgments: { evidence: "n/a", inference: "n/a" }
        };
      } else if (/^Below are the (full )?results of deflating/.test(p)) {
        data = { patterns: [{ title: { hs: "MOCK pattern", g5: "MOCK pattern" }, body: { hs: "MOCK: patterns are not computed in mock mode.", g5: "MOCK." }, passages: [...p.matchAll(/^### (p\d{3}) /gm)].slice(0, 2).map(m => m[1]) }], survived: { hs: "MOCK: not computed.", g5: "MOCK." } };
      } else data = { note: "MOCK: unrecognised prompt" };
      const text = JSON.stringify(data);
      const meta = { usage: null, model: "mock", requestId: "mock_" + Math.random().toString(36).slice(2, 8), stopReason: "end_turn" };
      return json ? Object.assign({ data, text }, meta) : Object.assign({ text }, meta);
    }
  };
}

function createAI(env) {
  if (env.DEFLATE_MOCK_AI === "1" || env.DEFLATE_MOCK_AI === "true") return createMockAI();
  // a placeholder such as sk-ant-... is not a key; the page then asks for one instead of failing on first use
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(String(env.ANTHROPIC_API_KEY || "").trim())) return null;
  return createAnthropicAI({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL, maxTokens: env.ANTHROPIC_MAX_TOKENS ? Number(env.ANTHROPIC_MAX_TOKENS) : undefined });
}

module.exports = { createAI, createMockAI, createAnthropicAI, parseJSONLoose, parseReply, DEFAULT_MODEL, DEFAULT_MAX_TOKENS };
