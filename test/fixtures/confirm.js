"use strict";
/* The second reading (0.14.5) for tests that are about something else: a stand-in that confirms every name put to it,
   quoting the first words of that voice's own first turn, as the prompt shows them. Tests of the second reading itself
   script its answers, or use the stand-in model's recorded answers (identify-confirm.json, identify-misread.json). */
const CONFIRM_START = "Check the names given to the voices.";
const isConfirm = prompt => String(prompt || "").startsWith(CONFIRM_START);
function confirmAll(prompt) {
  const p = String(prompt), voices = [];
  const asked = [...(p.split("\nVOICES TO CHECK:\n")[1] || "").split("\n\n")[0].matchAll(/^- (.+?), given the name /gm)].map(m => m[1]);
  const turns = [...(p.split("\nTURNS (")[1] || "").matchAll(/^\[(\d+)\] ([^:\n]+): (.*)$/gm)].map(m => ({ i: +m[1], key: m[2], text: m[3] }));
  for (const key of asked) {
    const t = turns.find(x => x.key === key); if (!t) continue;
    voices.push({ label: key, verdict: "is", turn: t.i, quote: t.text.split(/\s+/).slice(0, 6).join(" ").replace(/[,.;:!?…]+$/, ""), why: "test stand-in: confirms every name" });
  }
  return { voices };
}
module.exports = { CONFIRM_START, isConfirm, confirmAll };
