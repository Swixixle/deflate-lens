"use strict";
/* Neutral filler for the identification scenarios: lower case, no names, no cue words. */
const FILL = [
  " and the numbers moved again this month, which surprised almost everyone who follows the market closely.",
  " but the board keeps saying the plan is on schedule, and the workers on the floor are not so sure about that.",
  " the price of coal went up, the price of power went up, and the margins at the plant got thinner every quarter.",
];
const pad = n => { let s = ""; for (let i = 0; i < n; i++) s += FILL[i % FILL.length]; return s; };
module.exports = { pad };
