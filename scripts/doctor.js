"use strict";
/* `npm run doctor`: checks the things that usually go wrong before the first start. */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const major = Number(process.versions.node.split(".")[0]);
console.log("Node " + process.versions.node + (major >= 18 ? "  ok" : "  TOO OLD: install Node 18 or newer from https://nodejs.org"));
console.log(fs.existsSync(path.join(root, "node_modules", "express")) ? "Dependencies installed  ok" : "Dependencies missing: run  npm install");
const envPath = path.join(root, ".env");
if (!fs.existsSync(envPath)) console.log(".env missing: run  cp .env.example .env  and add your ANTHROPIC_API_KEY");
else {
  require("dotenv").config({ path: envPath });
  if (process.env.DEFLATE_MOCK_AI === "1") console.log(".env: DEFLATE_MOCK_AI=1, so analyses will be MOCK placeholders");
  else if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(process.env.ANTHROPIC_API_KEY || "")) console.log(".env: no model key yet; the example works, and the page asks for the key once when real analysis is requested");
  else console.log(".env: API key present (" + process.env.ANTHROPIC_API_KEY.slice(0, 10) + "…)  ok");
  console.log("Model: " + (process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5 (default)"));
  if (process.env.DEFLATE_MOCK_RESEARCH === "1") console.log("Research: DEFLATE_MOCK_RESEARCH=1, so Search sources returns MOCK candidates");
  else console.log("Research: Crossref + PubMed" + (process.env.OPENALEX_API_KEY ? " + OpenAlex" : " (OpenAlex off: add OPENALEX_API_KEY to turn it on)") + (process.env.RESEARCH_CONTACT_EMAIL ? "; contact email set" : "; set RESEARCH_CONTACT_EMAIL so Crossref serves you from its polite pool") + (process.env.NCBI_API_KEY ? "; NCBI key set" : ""));
}
const dataDir = process.env.DATA_DIR ? path.resolve(root, process.env.DATA_DIR) : path.join(root, "data");
console.log("Data folder: " + dataDir + (fs.existsSync(dataDir) ? "  (exists)" : "  (will be created on first start)"));
console.log("Start with:  npm start   then open http://localhost:" + (process.env.PORT || 3123));
