"use strict";
/* Local configuration written by the app itself: the .env file next to the project. The page can set a few named
   settings, each once, when first needed: the Anthropic API key (real analysis), the Deepgram key (cloud
   transcription), which transcription engine to prefer, and which listed model writes the readings. A key is written to .env on this computer, kept in the
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

/* A value as the .env line must hold it so that dotenv reads back exactly that value (0.14.8): plain when it has
   nothing dotenv treats specially, in single quotes (taken literally) when it has a "#" (a comment otherwise), spaces or
   a leading quote. Checked by parsing the line back; a value that cannot round-trip is refused before anything is
   written, so a setting that was accepted is the setting the next start reads. */
function envValue(name, v) {
  const plain = !/[#\s"'`\\]/.test(v) ? v : !v.includes("'") ? "'" + v + "'" : null;
  let back = null; try { back = plain === null ? null : require("dotenv").parse(name + "=" + plain + "\n")[name]; } catch (e) {}
  if (back !== v) throw Object.assign(new Error("That value cannot be stored in .env as it is (it mixes characters .env reads specially). Nothing was saved."), { status: 400, code: "bad_key_shape" });
  return plain;
}
function looksLikeAnthropicKey(k) { return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(String(k || "").trim()); }
/* What the page may set, and the shape each value must have. Nothing else in .env is reachable from the browser. */
const SETTABLE = {
  ANTHROPIC_API_KEY: { test: looksLikeAnthropicKey, secret: true, bad: "That does not look like an Anthropic API key (they start with sk-ant-). Nothing was saved." },
  DEEPGRAM_API_KEY: { test: k => /^[A-Za-z0-9]{32,64}$/.test(k), secret: true, bad: "That does not look like a Deepgram API key (a long run of letters and digits). Nothing was saved." },
  TRANSCRIBE_PREFER: { test: k => k === "local" || k === "cloud", secret: false, bad: "The preferred engine must be local or cloud." },
  // which model writes the readings (0.14.7): any Claude model by its id, or an OpenAI-compatible service's address,
  // key (optional: Ollama needs none) and model
  ANTHROPIC_MODEL: { test: k => require("./ai").CLAUDE_ID.test(k), secret: false, bad: "That does not look like a Claude model id (they start with claude-). Nothing was saved." },
  MODEL_PROVIDER: { test: k => k === "anthropic" || k === "openai-compatible", secret: false, bad: "The provider must be anthropic or openai-compatible." },
  OPENAI_BASE_URL: { test: k => !!require("./ai").serviceAddress(k), secret: false, bad: "That is not a usable address for a model service (https, or http on this computer). Nothing was saved." },
  OPENAI_API_KEY: { test: k => /^[\x21-\x7e]{8,400}$/.test(k), secret: true, bad: "That does not look like an API key. Nothing was saved." },
  OPENAI_MODEL: { test: k => require("./ai").OTHER_ID.test(k), secret: false, bad: "That does not look like a model id. Nothing was saved." },
  // the address the saved key belongs to (0.14.8): a key is sent only to the service it was saved for
  OPENAI_API_KEY_FOR: { test: k => !!require("./ai").serviceAddress(k), secret: false, bad: "That is not a usable address for a model service. Nothing was saved." },
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
      fs.writeFileSync(envPath, upsertEnvLine(text, "ANTHROPIC_API_KEY", envValue("ANTHROPIC_API_KEY", k)), { mode: 0o600 });
      try { fs.chmodSync(envPath, 0o600); } catch (e) {}
      return { saved: true, file: envPath };
    },
    hasKey() { const t = readEnvFile(envPath); return !!(t && /^\s*ANTHROPIC_API_KEY\s*=\s*sk-ant-/m.test(t)); },
    /* Set one named setting from the closed list. Returns the name and whether it was a secret, never the value. */
    set(name, value) {
      const spec = Object.prototype.hasOwnProperty.call(SETTABLE, name) ? SETTABLE[name] : null; if (!spec) { const e = new Error("that setting cannot be changed from the page"); e.status = 400; e.code = "not_settable"; throw e; }
      const v = String(value || "").trim();
      if (!spec.test(v)) { const e = new Error(spec.bad); e.status = 400; e.code = "bad_key_shape"; throw e; }
      const line = envValue(name, v);
      let text = readEnvFile(envPath);
      if (text === null) text = (examplePath && readEnvFile(examplePath)) || "";
      fs.writeFileSync(envPath, upsertEnvLine(text, name, line), { mode: 0o600 });
      try { fs.chmodSync(envPath, 0o600); } catch (e) {}
      return { saved: true, name, secret: spec.secret, file: envPath, value: spec.secret ? undefined : v };
    },
    /* Several settings from the closed list, checked together and written in one write (0.14.8): `values` to set,
       `clears` to empty. Nothing is written unless every value passes, so .env never holds half of a choice. */
    setMany(values, clears) {
      const lines = Object.entries(values || {}).map(([name, value]) => {
        const spec = Object.prototype.hasOwnProperty.call(SETTABLE, name) ? SETTABLE[name] : null; if (!spec) { const e = new Error("that setting cannot be changed from the page"); e.status = 400; e.code = "not_settable"; throw e; }
        const v = String(value || "").trim();
        if (!spec.test(v)) { const e = new Error(spec.bad); e.status = 400; e.code = "bad_key_shape"; throw e; }
        return [name, envValue(name, v)];
      });
      for (const name of clears || []) if (!Object.prototype.hasOwnProperty.call(SETTABLE, name)) { const e = new Error("that setting cannot be changed from the page"); e.status = 400; e.code = "not_settable"; throw e; }
      let text = readEnvFile(envPath);
      if (text === null) text = (examplePath && readEnvFile(examplePath)) || "";
      for (const [name, line] of lines) text = upsertEnvLine(text, name, line);
      for (const name of clears || []) text = upsertEnvLine(text, name, "");
      fs.writeFileSync(envPath, text, { mode: 0o600 });
      try { fs.chmodSync(envPath, 0o600); } catch (e) {}
      return { saved: true, names: lines.map(l => l[0]), cleared: clears || [] };
    },
    /* Empty one setting from the closed list (an OpenAI-compatible service that needs no key, 0.14.7). */
    clear(name) {
      if (!Object.prototype.hasOwnProperty.call(SETTABLE, name)) { const e = new Error("that setting cannot be changed from the page"); e.status = 400; e.code = "not_settable"; throw e; }
      const text = readEnvFile(envPath); if (text === null) return { cleared: false, name };
      fs.writeFileSync(envPath, upsertEnvLine(text, name, ""), { mode: 0o600 });
      try { fs.chmodSync(envPath, 0o600); } catch (e) {}
      return { cleared: true, name };
    },
  };
}

module.exports = { createSettings, upsertEnvLine, looksLikeAnthropicKey, envValue, SETTABLE };
