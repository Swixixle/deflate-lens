"use strict";
/* Entry point: `npm start`. Reads .env, starts the server on localhost, prints the address. Ctrl+C stops it. */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { createApp } = require("./app");
const { createAI } = require("./ai");
const { createResearch } = require("./research/index");

const PORT = Number(process.env.PORT || 3123);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

const ai = createAI(process.env);
const research = createResearch(process.env);
// bound to this computer (the default): only requests addressed to it by its own names are answered (see app.js)
const loopback = HOST === "localhost" || HOST === "::1" || /^127\./.test(HOST);
const { app, ready, state } = createApp({ dataDir: DATA_DIR, ai, research, envPath: path.join(__dirname, "..", ".env"), allowedHosts: loopback ? [...new Set(["127.0.0.1", "localhost", "::1", HOST])] : null });

ready.then(() => {
  const server = app.listen(PORT, HOST, () => {
    const url = "http://" + (HOST === "0.0.0.0" ? "localhost" : HOST) + ":" + PORT;
    console.log("");
    console.log("  Deflate Lens is running.");
    console.log("  Open this address in your browser:  " + url);
    console.log("  Data folder:                         " + path.resolve(DATA_DIR));
    if (!ai) console.log("  Model:                               none configured. The supplied example works; real analysis asks for your Anthropic API key once (saved to .env on this computer).");
    else if (ai.mock) console.log("  Model:                               MOCK (DEFLATE_MOCK_AI=1). Analyses will be placeholders, not real readings.");
    else console.log("  Model:                               " + ai.model + " (Anthropic API; usage is billed to your key)");
    console.log("  Research:                            " + (research.config.mock ? "MOCK (DEFLATE_MOCK_RESEARCH=1)" : "Crossref + PubMed + GDELT news" + (research.config.openalexKey ? " + OpenAlex" : " (OpenAlex off: no OPENALEX_API_KEY)") + (research.config.contact ? "" : "; set RESEARCH_CONTACT_EMAIL for the polite pools")));
    console.log("  Stop with Ctrl+C. Start again later with: npm start");
    console.log("");
  });
  // an uploaded recording can take longer than Node's five-minute limit on a whole request to arrive; the upload route
  // gives up on a transfer that stalls instead (app.js)
  server.requestTimeout = 0;
  server.on("error", e => {
    if (e.code === "EADDRINUSE") { console.error("Port " + PORT + " is already in use. Stop the other program, or start with a different port:  PORT=3124 npm start"); process.exit(1); }
    throw e;
  });
  const stop = () => { console.log("\n  Stopping Deflate Lens. Your work is saved in " + path.resolve(DATA_DIR)); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
}).catch(e => { console.error("Could not start:", e); process.exit(1); });
