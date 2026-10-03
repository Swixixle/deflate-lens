"use strict";
/* Local configuration written by the app itself: the .env file next to the project. The page can set a few named
   settings, each once, when first needed: the Anthropic API key (real analysis), the Deepgram key (cloud
   transcription), and which transcription engine to prefer. A key is written to .env on this computer, kept in the
   server's memory, and never returned to the browser, logged, or echoed. Existing lines in .env are preserved; only
   the one line is added or replaced. */
const fs = require("fs");
const path = require("path");

function readEnvFile(file) { try { return fs.readFileSync(file, "utf8"); } catch (e) { if (e.code === "ENOENT") return null; throw e; } }

/* Set one KEY=value in a .env text, keeping every other line (comments included). */
function upsertEnvLine(text, key, value) {
  const lines = (text || "").split(/\r?\n/);
  const re = new RegExp("^\\s*#?\\s*" + key + "\\s*=");
  let done = false;
  const out = lines.map(l => { if (!done && re.test(l)) { done = true; return key + "=" + value; } return l; });
  if (!done) { while (out.length && out[out.length - 1] === "") out.pop(); out.push(key + "=" + value); }
  return out.join("\n").replace(/\n*$/, "\n");
}

function looksLikeAnthropicKey(k) { return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(String(k || "").trim()); }
/* What the page may set, and the shape each value must have. Nothing else in .env is reachable from the browser. */
const SETTABLE = {
  ANTHROPIC_API_KEY: { test: looksLikeAnthropicKey, secret: true, bad: "That does not look like an Anthropic API key (they start with sk-ant-). Nothing was saved." },
  DEEPGRAM_API_KEY: { test: k => /^[A-Za-z0-9]{32,64}$/.test(k), secret: true, bad: "That does not look like a Deepgram API key (a long run of letters and digits). Nothing was saved." },
  TRANSCRIBE_PREFER: { test: k => k === "local" || k === "cloud", secret: false, bad: "The preferred engine must be local or cloud." },
};

function createSettings({ envPath, examplePath }) {
  return {
    envPath,
    /* Write the key. Returns nothing about the key itself. */
    setAnthropicKey(key) {
      const k = String(key || "").trim();
      if (!looksLikeAnthropicKey(k)) { const e = new Error("That does not look like an Anthropic API key (they start with sk-ant-). Nothing was saved."); e.status = 400; e.code = "bad_key_shape"; throw e; }
      let text = readEnvFile(envPath);
      if (text === null) text = (examplePath && readEnvFile(examplePath)) || "";
      fs.writeFileSync(envPath, upsertEnvLine(text, "ANTHROPIC_API_KEY", k), { mode: 0o600 });
      try { fs.chmodSync(envPath, 0o600); } catch (e) {}
      return { saved: true, file: envPath };
    },
    hasKey() { const t = readEnvFile(envPath); return !!(t && /^\s*ANTHROPIC_API_KEY\s*=\s*sk-ant-/m.test(t)); },
    /* Set one named setting from the closed list. Returns the name and whether it was a secret, never the value. */
    set(name, value) {
      const spec = Object.prototype.hasOwnProperty.call(SETTABLE, name) ? SETTABLE[name] : null; if (!spec) { const e = new Error("that setting cannot be changed from the page"); e.status = 400; e.code = "not_settable"; throw e; }
      const v = String(value || "").trim();
      if (!spec.test(v)) { const e = new Error(spec.bad); e.status = 400; e.code = "bad_key_shape"; throw e; }
      let text = readEnvFile(envPath);
      if (text === null) text = (examplePath && readEnvFile(examplePath)) || "";
      fs.writeFileSync(envPath, upsertEnvLine(text, name, v), { mode: 0o600 });
      try { fs.chmodSync(envPath, 0o600); } catch (e) {}
      return { saved: true, name, secret: spec.secret, file: envPath, value: spec.secret ? undefined : v };
    },
  };
}

module.exports = { createSettings, upsertEnvLine, looksLikeAnthropicKey, SETTABLE };
