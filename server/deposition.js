"use strict";
/* The deposition exporter (W1 of the Nikodemus extraction rulings, 2026-10-16):
   Deflate's half of the records connection. Nikodemus imports one signed
   package at a time through its federation door (nikodemus.deposition.v1,
   Ed25519 over the RFC 8785 canonical payload, a key the owner pins there
   out of band). This module only EXPORTS: it signs what the store already
   holds and serves it on three GET routes; it reads nothing new, starts
   nothing, and never calls a model.

   The payload carries the claims export whole (deflate-lens/claims@0.7,
   exportClaims.js) PLUS the retained transcript text — deliberately: the
   claims export names transcripts by SHA-256 without the text, and an
   uploaded recording is deleted after transcription, so the text is what
   survives, and the text travels. What does NOT survive is declared in the
   envelope's gaps rather than smoothed over: earlier transcript versions
   kept only by hash, and source audio not retained.

   The key: generated once, Ed25519, kept in <dataDir>/deposition-key.json
   (0600). The public key and its fingerprint are served on /api/deposition/key
   for the owner to read and pin in Nikodemus themselves — the fingerprint is
   sha256 over the raw 32-byte public key, prefixed "ed25519:sha256:", the
   same computation all three producers share. A package never carries the
   public key as something to trust; Nikodemus ignores keys found in
   packages by design.

   Canonicalization is RFC 8785 (JCS). In JavaScript that is JSON.stringify
   serialization with object keys sorted by UTF-16 code units and non-finite
   numbers refused — ES6 serialization is what the RFC specifies, so the
   implementation below is small and exact. Nikodemus verifies with the
   Python jcs package; the cross-language fixtures in its suite
   (tests/fixtures/producers/deflate.*) prove byte equality: a package
   signed by THIS code verifies there, and survives key-order shuffling. */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const METHOD = "deflate.deposition.v1";
const ENVELOPE_SCHEMA = "nikodemus.deposition.v1";
const PAYLOAD_SCHEMA = "deflate-lens/deposition@1";
const KEY_ID_PREFIX = "ed25519:sha256:";

/* RFC 8785. Undefined object members are omitted (as JSON.stringify does);
   undefined in an array becomes null (as JSON.stringify does); a non-finite
   number is a refusal, never "null" — a package that cannot be canonicalized
   exactly must not exist. */
function canonicalize(v) {
  if (v === null || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") {
    if (!isFinite(v)) throw new Error("a non-finite number cannot be canonicalized (RFC 8785)");
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return "[" + v.map(x => (x === undefined ? "null" : canonicalize(x))).join(",") + "]";
  if (typeof v === "object") {
    const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalize(v[k])).join(",") + "}";
  }
  throw new Error("cannot canonicalize a " + typeof v);
}

function sha256hex(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

function rawPublicKey(publicKey) {
  const der = publicKey.export({ type: "spki", format: "der" });
  return der.subarray(der.length - 32);                     // the raw 32-byte Ed25519 key, the tail of its SPKI DER
}

function keyIdOf(raw32) { return KEY_ID_PREFIX + sha256hex(raw32); }

/* The signing key, generated once and kept beside the data it signs.
   Rotation is deletion: remove the file, a new key is made, and the owner
   pins the new one in Nikodemus — packages under the old key stay verified
   there as long as that key stays pinned. */
function loadOrCreateKey(dataDir) {
  const file = path.join(dataDir, "deposition-key.json");
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    if (d && d.privateKeyPem && d.publicKeyRawB64) return d;
  } catch (e) { /* absent or unreadable: a new key is made below */ }
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const raw = rawPublicKey(publicKey);
  const d = {
    algorithm: "Ed25519",
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyRawB64: raw.toString("base64"),
    keyId: keyIdOf(raw),
    createdAt: new Date().toISOString(),
    note: "the deposition signing key — pin publicKeyRawB64 in Nikodemus yourself, out of band; never send this file anywhere",
  };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(d, null, 1), { mode: 0o600 });
  return d;
}

/* The pure half: payload in, signed envelope out. The fixtures generator
   and the Nikodemus suite exercise exactly this, so what the tests prove
   is what the routes serve. */
function signedEnvelope({ runId, payload, key, version, gaps }) {
  const canonical = Buffer.from(canonicalize(payload), "utf8");
  const digest = sha256hex(canonical);
  const privateKey = crypto.createPrivateKey(key.privateKeyPem);
  const signature = crypto.sign(null, canonical, privateKey);       // Ed25519: algorithm must be null
  return {
    schema: ENVELOPE_SCHEMA,
    producer: { id: "deflate", display: "Deflate Lens", version: String(version || "") },
    object: { type: "reading_run", id: String(runId) },
    recorded_at: new Date().toISOString(),
    payload_media_type: "application/json",
    payload_sha256: digest,
    signature: { algorithm: "Ed25519", method: METHOD, trusted_key_id: key.keyId, value: signature.toString("base64") },
    gaps: gaps || [],
    source_times: [],
    payload,
  };
}

/* What this run no longer holds, said plainly in the envelope. */
function gapsFor(run, transcriptText) {
  const gaps = [];
  const earlier = (run.inputHistory || []).length;
  if (earlier) gaps.push({ kind: "earlier_transcript_versions", detail: earlier + " earlier text version(s) are named by SHA-256 in claims.run.transcript.earlierVersions; versions edited before 0.12.1 kept only the hash, not the text" });
  const file = run.import && run.import.file;
  if (file && file.name) gaps.push({ kind: "source_audio_not_retained", detail: "the uploaded recording was deleted after transcription, by design; its name, size and SHA-256 are in claims.run.import.file" });
  if (!transcriptText) gaps.push({ kind: "no_transcript_text", detail: "this run has no saved transcript text (a claim-only run, or an empty text)" });
  return gaps;
}

function createDeposition({ store, version, buildExport }) {
  let key = null;
  const theKey = () => (key = key || loadOrCreateKey(store.dataDir));
  return {
    keyInfo() {
      const k = theKey();
      return {
        key_id: k.keyId, algorithm: "Ed25519", public_key_b64: k.publicKeyRawB64, created_at: k.createdAt,
        pin_in_nikodemus: "register this app as the Deflate Lens instrument on Nikodemus's Investigation Rooms page, then pin public_key_b64 there yourself — out of band, never from a package",
      };
    },
    async buildDeposition(b) {
      const run = b.run || {};
      const text = typeof b.transcript === "string" ? b.transcript : "";
      const payload = {
        schema: PAYLOAD_SCHEMA,
        claims: buildExport(b),
        transcript: {
          included: true,
          text,
          characters: text.length,
          sha256: sha256hex(Buffer.from(text, "utf8")),
          note: "the run's transcript as saved now; claims.run.transcript names the original input's hash and earlier versions by hash",
        },
      };
      return signedEnvelope({ runId: run.id, payload, key: theKey(), version, gaps: gapsFor(run, text) });
    },
  };
}

module.exports = { createDeposition, signedEnvelope, canonicalize, loadOrCreateKey, sha256hex, keyIdOf, METHOD, ENVELOPE_SCHEMA, PAYLOAD_SCHEMA };
