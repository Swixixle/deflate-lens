"use strict";
/* `npm run doctor`: checks the things that usually go wrong before the first start. */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const [major, minor] = process.versions.node.split(".").map(Number);
console.log("Node " + process.versions.node + ((major > 18 || (major === 18 && minor >= 17)) ? "  ok" : "  TOO OLD: install Node 18.17 or newer from https://nodejs.org"));
{ const deps = require("./deps").lockedDependencies(root); console.log(deps.ok ? "Dependencies installed  ok" : "Dependencies: " + (deps.why || "missing") + "; run  npm run setup"); }
const envPath = path.join(root, ".env");
if (!fs.existsSync(envPath)) console.log(".env missing: run  npm run setup  (the page asks for a key when needed)");
else {
  require("dotenv").config({ path: envPath });
  if (process.env.DEFLATE_MOCK_AI === "1") console.log(".env: DEFLATE_MOCK_AI=1, so analyses will be MOCK placeholders");
  else if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(process.env.ANTHROPIC_API_KEY || "")) console.log(".env: no model key yet; source search works, and the page asks for the key once when preparation or analysis is requested");
  else console.log(".env: API key present  ok");
  console.log("Model: " + (process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5 (default)"));
  if (process.env.DEFLATE_MOCK_RESEARCH === "1") console.log("Research: DEFLATE_MOCK_RESEARCH=1, so Search sources returns MOCK candidates");
  else console.log("Research: Crossref + PubMed + GDELT news (" + (process.env.NEWS_LANGUAGE === undefined ? "english" : (process.env.NEWS_LANGUAGE || "any language")) + ")" + (process.env.OPENALEX_API_KEY ? " + OpenAlex" : " (OpenAlex off: add OPENALEX_API_KEY to turn it on)") + (process.env.RESEARCH_CONTACT_EMAIL ? "; contact email set" : "; set RESEARCH_CONTACT_EMAIL so Crossref serves you from its polite pool") + (process.env.NCBI_API_KEY ? "; NCBI key set" : ""));
}
const dataDir = process.env.DATA_DIR ? path.resolve(root, process.env.DATA_DIR) : path.join(root, "data");
console.log("Data folder: " + dataDir + (fs.existsSync(dataDir) ? "  (exists)" : "  (will be created on first start)"));
console.log("Start with:  npm start   then open http://localhost:" + (process.env.PORT || 3123));
