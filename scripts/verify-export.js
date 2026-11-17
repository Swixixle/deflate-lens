#!/usr/bin/env node
"use strict";
/* Checks a claims export against a transcript file, with nothing but the two files:

     node scripts/verify-export.js <export.deflate.json> <transcript.txt>

   It recomputes the SHA-256 of the transcript file's text (UTF-8, exactly as stored; a changed line ending is a changed
   text) and compares it with run.transcript.sha256 in the export. Then, card by card, it says whether each reading was
   made from exactly that text (basedOn.inputHash equal), from an earlier version the run remembers, or from a text the
   export cannot name. It also lists the model-call records the cards carry. It proves that the export and the file
   describe the same text; it does not and cannot prove that any reading is fair. Exit code 0 when the transcript matches,
   1 when it does not, 2 on a usage error. */
const fs = require("fs");
const crypto = require("crypto");

function sha256(s) { return crypto.createHash("sha256").update(String(s), "utf8").digest("hex"); }

function verify(exp, transcriptText) {
  const want = exp && exp.run && exp.run.transcript && exp.run.transcript.sha256 || "";
  const have = sha256(transcriptText);
  const earlier = new Map(((exp.run && exp.run.transcript && exp.run.transcript.earlierVersions) || []).map(v => [v.sha256, v]));
  const passages = (exp.passages || []).map(p => {
    const h = p.basedOn && p.basedOn.inputHash || "";
    const where = !h ? "no hash recorded (origin unknown or legacy reading)" : h === have ? "read from exactly this text" : earlier.has(h) ? "read from an earlier version of the text (replaced " + (earlier.get(h).replacedAt || "?") + ")" : "read from a text this export does not name";
    return { id: p.id, title: p.title, inputHash: h, where, stale: p.stale || [], call: p.provenance && p.provenance.recorded ? { requestId: p.provenance.requestId || "", model: p.provenance.modelReturned || "", at: p.provenance.at || "", promptHash: p.provenance.promptHash || "", outputHash: p.provenance.outputHash || "" } : null };
  });
  return { schema: exp.schema || "", transcriptMatches: !!want && want === have, exportSha256: want, fileSha256: have, fileChars: transcriptText.length, exportChars: exp.run && exp.run.transcript && exp.run.transcript.characters, passages };
}

function main(argv) {
  const [exportPath, transcriptPath] = argv;
  if (!exportPath || !transcriptPath) { console.error("usage: node scripts/verify-export.js <export.deflate.json> <transcript.txt>"); return 2; }
  let exp, text;
  try { exp = JSON.parse(fs.readFileSync(exportPath, "utf8")); } catch (e) { console.error("cannot read the export: " + e.message); return 2; }
  if (!exp || typeof exp !== "object" || !exp.run) { console.error("that file is not a Deflate Lens claims export (no run field)"); return 2; }
  try { text = fs.readFileSync(transcriptPath, "utf8"); } catch (e) { console.error("cannot read the transcript: " + e.message); return 2; }
  const r = verify(exp, text);
  if (!r.transcriptMatches && r.exportSha256) { // say when the only difference is one the eye would miss
    const variants = { "a byte-order mark at the start": text.replace(/^\uFEFF/, ""), "CRLF line endings": text.replace(/\r\n/g, "\n"), "a trailing newline": text.replace(/\n+$/, ""), "both a byte-order mark and CRLF line endings": text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"), "CRLF line endings and a trailing newline": text.replace(/\r\n/g, "\n").replace(/\n+$/, "") };
    for (const [what, t] of Object.entries(variants)) if (sha256(t) === r.exportSha256) { r.hint = "the file differs from the exported text only by " + what; break; }
  }
  console.log("export schema:      " + (r.schema || "(none)"));
  console.log("export sha256:      " + (r.exportSha256 || "(none; the run was exported before 0.8.0)"));
  console.log("file sha256:        " + r.fileSha256 + "  (" + r.fileChars + " characters" + (r.exportChars != null && r.exportChars !== r.fileChars ? "; the export says " + r.exportChars : "") + ")");
  console.log("transcript matches: " + (r.transcriptMatches ? "yes" : "NO" + (r.hint ? "  (" + r.hint + ")" : "")));
  r.passages.forEach(p => console.log("  " + p.id + "  " + p.where + (p.stale.length ? "  [stale: " + p.stale.join("; ") + "]" : "") + (p.call ? "  model call " + (p.call.requestId || "(no request id)") + (p.call.model ? " " + p.call.model : "") : "  no model-call record")));
  if (!r.passages.length) console.log("  (no finished cards in the export)");
  return r.transcriptMatches ? 0 : 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { verify, sha256 };
