"use strict";
/* Private replays of real runs whose identification went wrong (0.14.2). A real transcript is never committed: each case
   lives outside the repository, in the folder DEFLATE_PRIVATE_REPLAY names, one folder per case holding the run's
   run.json and transcript.txt as the app saved them, model-answer.json (the identification's answer, rebuilt from the
   saved record: the app keeps hashes of model answers, not their text), confirm-answer.json (the second reading's answer,
   0.14.5; none was ever made by the production model for a saved run, so it is a stand-in's, and says so) and
   expected.json:
     { "names": { "SPEAKER 1": "…", "SPEAKER 2": "…" }, "modelCluesHold": true, "reidentifies": true }
   Without that folder the test is skipped. Nothing is sent anywhere: the model's part is the saved answer, and any other
   prompt fails the test. Run: DEFLATE_PRIVATE_REPLAY=/path/to/cases node --test test/private-replay.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { Store } = require("../server/store");
const I = require("../server/identify");

const dir = process.env.DEFLATE_PRIVATE_REPLAY || "";
const cases = dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => fs.existsSync(path.join(dir, n, "expected.json"))).sort() : [];

test("private replays of saved identifications (skipped without DEFLATE_PRIVATE_REPLAY)", { skip: cases.length ? false : "no private replay folder" }, async () => {
  for (const name of cases) {
    const at = path.join(dir, name), expected = JSON.parse(fs.readFileSync(path.join(at, "expected.json"), "utf8"));
    const answer = JSON.parse(fs.readFileSync(path.join(at, "model-answer.json"), "utf8")); delete answer._note;
    const cf = path.join(at, "confirm-answer.json"), confirm = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, "utf8")) : null; if (confirm) delete confirm._note;
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "deflate-replay-")), id = "r_replay" + name.replace(/[^A-Za-z0-9]/g, "").slice(0, 20);
    try {
      await fs.promises.mkdir(path.join(tmp, "runs", id), { recursive: true });
      for (const f of ["run.json", "transcript.txt"]) await fs.promises.copyFile(path.join(at, f), path.join(tmp, "runs", id, f));
      const store = new Store(tmp); await store.init();
      const ai = { kind: "replay", model: "replay", mock: false, async sample({ prompt }) {
        const p = String(prompt), second = p.startsWith("Check the names given to the voices.");
        if (!p.startsWith("Who is each voice in this conversation?") && !second) throw Object.assign(new Error("a replay answers only the identification and its second reading"), { code: "replay" });
        assert.ok(!second || confirm, name + ": the case has no confirm-answer.json for the second reading");
        const data = second ? confirm : answer;
        return { data, text: JSON.stringify(data), model: "replay", requestId: "replay", stopReason: "end_turn", usage: null };
      } };
      // a run identified by an earlier version, with voices left unnamed, is identified again when it is next read
      if (expected.reidentifies !== undefined) assert.equal(I.needsIdentification(await store.bundle(id)), expected.reidentifies, name + ": identified again on the next reading");
      const out = await I.identifySpeakers({ ai, store, id });
      const got = Object.fromEntries(Object.keys(expected.names).map(k => [k, (out.record.decisions.find(d => d.key === k) || {}).name || null]));
      assert.deepEqual(got, expected.names, name + ": " + JSON.stringify(out.record.unnamed));
      if (expected.modelCluesHold) {
        const failed = out.record.evidence.filter(e => /model/.test(e.source) && !e.ok);
        assert.deepEqual(failed.map(e => [e.key, e.kind, e.why]), [], name + ": the saved answer's clues should hold up");
      }
      // a voice with clues that did not hold up is never explained as one nothing names
      for (const u of out.record.unnamed) if (out.record.evidence.some(e => e.key === u.key && !e.ok && !["addresses_other", "denies", "mentions"].includes(e.kind))) assert.doesNotMatch(u.why, /^Nothing in the conversation/, name + " " + u.key);
    } finally { await fs.promises.rm(tmp, { recursive: true, force: true }); }
  }
});
