"use strict";
/* 0.14.3: a model accounts for every voice it is asked about (server/identify.js, checkAnswer), and an answer that leaves
   one out is asked for again; a voice still without a decision keeps its number. Most scripted answers in the scenario
   sets test one clue each. `plus` adds what a careful model says of the voices a case is not about: the host who opens
   the show (`opens`), a guest introduced by name, or a voice left unnamed with why (`unnamed`). Some answers are left
   partial on purpose, where the voices left out are not expected to be named. */
const opens = (label, name, quote, turn) => ({ label, name, evidence: [{ kind: "hosts_show", turn: turn || 0, quote }] });
const unnamed = (label, why) => ({ label, why: why || "nothing in the words names this voice" });
const plus = (answer, voices, rest) => ({ voices: (voices || []).concat(answer.voices || []), unnamed: (answer.unnamed || []).concat(rest || []) });
module.exports = { opens, unnamed, plus };
