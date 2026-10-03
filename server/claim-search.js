"use strict";
const Q = require("./quality");
function createClaimSearch(store, research) {
  async function loadClaim(id, pid, cid) {
    const b = await store.bundle(id); if (!b) { const e = new Error("run not found"); e.status = 404; throw e; }
    const p = b.passages.find(x => x.id === pid); if (!p || !p.analysis) { const e = new Error("passage not found or not analysed"); e.status = 404; throw e; }
    const i = (p.analysis.claims || []).findIndex(x => x.id === cid); const c = i === -1 ? null : p.analysis.claims[i];
    if (!c) { const e = new Error("that claim is not in the current reading of this passage"); e.status = 404; e.code = "claim_not_current"; throw e; }
    return { b, p, c, i };
  }
  function provisionalReasons(b, p) {
    const out = (p.stale || []).slice();
    const pr = b.run.provenance || {};
    if (Q.attributionGate(b).status !== "ready") out.push("speaker preparation is unresolved");
    if (p.readingGate && p.readingGate.status !== "ready") out.push("reading held before display");
    return out;
  }
  return async function searchClaim(id, pid, cid, expectedReadingRev) {
    if (!research) throw Object.assign(new Error("research is not configured"), { status: 503, code: "no_research" });
    const { b, p, c, i } = await loadClaim(id, pid, cid);
    if (b.run.example) throw Object.assign(new Error("the supplied example is read-only; copy it to search"), { status: 403 });
    if (expectedReadingRev != null && expectedReadingRev !== (p.readingRev || 0)) throw Object.assign(new Error("the card changed since you looked; reload and search again"), { status: 409, code: "stale_reading" });
    const readingRev = p.readingRev || 0, provisional = provisionalReasons(b, p);
    const startedWith = { claimId: c.id, claimText: c.text, speaker: c.speaker || "", readingRev };
    const out = await research.searchClaim({ run: b.run, passage: p, claim: c, idx: i, limit: 8 });   // no lock held while the services answer
    const attempts = out.attempts.map(a => Object.assign({ runStartedAt: out.startedAt, readingRev, provisional: provisional.length ? provisional : undefined }, a));
    // commit into the latest document; if the claim is gone from the current reading, park the result instead
    let fresh = [], parked = null, late = false;
    try {
      await store.mutateClaim(id, pid, c.id, (claim, cur) => {
        late = (cur.readingRev || 0) !== readingRev;
        claim.obligation = out.obligation;
        claim.searches = (claim.searches || []).concat(attempts.map(a => late ? Object.assign({ late: true, attachedReadingRev: cur.readingRev || 0 }, a) : a));
        const keep = (claim.candidates || []).filter(x => x.status !== "candidate");
        const decidedKeys = new Set(keep.map(x => x.doi ? "doi:" + x.doi : "id:" + x.id));
        fresh = out.candidates.filter(x => !decidedKeys.has(x.doi ? "doi:" + x.doi : "id:" + x.id));
        claim.candidates = keep.concat(fresh);
        claim.lastSearchedAt = out.finishedAt;
      });
    } catch (e) {
      if (e.code !== "claim_not_current") throw e;
      parked = await store.parkRecords(id, { claimId: startedWith.claimId, claimText: startedWith.claimText, speaker: startedWith.speaker, from: { reading: readingRev, passage: pid, title: p.title || "", turnStart: p.turnStart, turnEnd: p.turnEnd }, searches: attempts.map(a => Object.assign({ late: true }, a)), candidates: out.candidates, obligation: out.obligation, why: "the reading changed while the search ran; the claim is no longer in it" });
    }
    return { attempts, candidates: parked ? [] : fresh, obligation: out.obligation, provisional, late, parked: parked ? {id:parked.id,why:parked.why} : null, bundle: await store.bundle(id) };
  };
}
module.exports = { createClaimSearch };
