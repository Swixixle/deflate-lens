"use strict";
/* A recording a person uploads (0.14.1): what kind of file it is, from its first bytes, and what the file's own tags say
   about it (title, artist, album, comment). Those tags and the file's name are the only listing an uploaded recording
   has: an episode downloaded from a podcast usually carries the show as its album, the host or the show's author as its
   artist and the episode's title; a recording made by the person usually carries nothing, and then only its name is
   there. Nothing here decodes audio or changes the file; tags that cannot be read are simply absent.

   Read: ID3v2.2–2.4 (MP3), the iTunes-style item list of MP4 and M4A files, and the INFO list of WAV files. Ogg, FLAC,
   AAC and WebM files are recognised and transcribed but their tags are not read. */
const fsp = require("fs/promises");

const FORMATS = {
  mp3: { name: "MP3", mime: "audio/mpeg" },
  mp4: { name: "M4A or MP4", mime: "audio/mp4" },
  wav: { name: "WAV", mime: "audio/wav" },
  ogg: { name: "Ogg", mime: "audio/ogg" },
  flac: { name: "FLAC", mime: "audio/flac" },
  aac: { name: "AAC", mime: "audio/aac" },
  webm: { name: "WebM", mime: "audio/webm" },
};
const MAX_TAG_BYTES = 16 * 1024 * 1024, MAX_MOOV_BYTES = 64 * 1024 * 1024;

/* The format from the first bytes, or null for anything that is not a recording the app can send on. */
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  const s = (a, b) => buf.toString("latin1", a, b);
  if (s(0, 3) === "ID3") return "mp3";
  if (buf[0] === 0xFF && (buf[1] & 0xF6) === 0xF0) return "aac"; // ADTS: sync, then layer 00
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0 && ((buf[1] >> 3) & 3) !== 1 && ((buf[1] >> 1) & 3) !== 0) return "mp3"; // an MPEG audio frame
  if (s(4, 8) === "ftyp") return "mp4";
  if (s(0, 4) === "RIFF" && s(8, 12) === "WAVE") return "wav";
  if (s(0, 4) === "OggS") return "ogg";
  if (s(0, 4) === "fLaC") return "flac";
  if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return "webm";
  return null;
}

async function readAt(fh, pos, len) { const b = Buffer.alloc(Math.max(0, len)); const { bytesRead } = await fh.read(b, 0, b.length, pos); return b.subarray(0, bytesRead); }
const syncsafe = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
function unsync(b) { const out = []; for (let i = 0; i < b.length; i++) { out.push(b[i]); if (b[i] === 0xFF && b[i + 1] === 0x00) i++; } return Buffer.from(out); }
function swap16(b) { const c = Buffer.from(b.subarray(0, b.length - (b.length % 2))); return c.swap16(); }
function decode(buf, enc) {
  if (enc === 0) return buf.toString("latin1");
  if (enc === 3) return buf.toString("utf8");
  if (enc === 1) {
    if (buf[0] === 0xFE && buf[1] === 0xFF) return swap16(buf.subarray(2)).toString("utf16le");
    if (buf[0] === 0xFF && buf[1] === 0xFE) return buf.subarray(2).toString("utf16le");
    return buf.toString("utf16le");
  }
  if (enc === 2) return swap16(buf).toString("utf16le");
  return buf.toString("latin1");
}
// several values (ID3v2.4 separates them with NUL) are kept, joined; a trailing NUL is dropped
const tidy = s => String(s || "").split("\u0000").map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean).join(", ");
/* A text frame's value, or a COMM/TXXX frame's description and value (the description ends at a NUL of the encoding's
   width, two bytes on an even boundary for UTF-16). */
function described(data, skip) {
  const enc = data[0], rest = data.subarray(1 + skip), width = enc === 1 || enc === 2 ? 2 : 1;
  let cut = -1;
  if (width === 1) cut = rest.indexOf(0);
  else for (let i = 0; i + 1 < rest.length; i += 2) if (rest[i] === 0 && rest[i + 1] === 0) { cut = i; break; }
  if (cut === -1) return { desc: "", value: tidy(decode(rest, enc)) };
  const head = rest.subarray(0, cut);
  let tail = rest.subarray(cut + width);
  // each UTF-16 string carries its own byte-order mark; a value written without one is read in the description's order
  const hasBom = b => (b[0] === 0xFF && b[1] === 0xFE) || (b[0] === 0xFE && b[1] === 0xFF);
  if (enc === 1 && !hasBom(tail) && head[0] === 0xFE && head[1] === 0xFF) tail = Buffer.concat([Buffer.from([0xFE, 0xFF]), tail]);
  return { desc: tidy(decode(head, enc)), value: tidy(decode(tail, enc)) };
}
const ID3_TEXT = { TIT2: "title", TT2: "title", TPE1: "artist", TP1: "artist", TPE2: "albumArtist", TP2: "albumArtist", TALB: "album", TAL: "album", TIT3: "subtitle", TT3: "subtitle", TDRC: "date", TYER: "date", TYE: "date", TDES: "description" };
async function id3(file) {
  const fh = await fsp.open(file, "r");
  try {
    const h = await readAt(fh, 0, 10);
    if (h.length < 10 || h.toString("latin1", 0, 3) !== "ID3") return {};
    const ver = h[3], flags = h[5], size = syncsafe(h, 6);
    if (ver < 2 || ver > 4 || size <= 0) return {};
    let body = await readAt(fh, 10, Math.min(size, MAX_TAG_BYTES));
    if ((flags & 0x80) && ver < 4) body = unsync(body); // the whole tag unsynchronised (2.2, 2.3)
    let pos = 0;
    if (ver === 3 && (flags & 0x40) && body.length >= 4) pos = 4 + body.readUInt32BE(0);
    if (ver === 4 && (flags & 0x40) && body.length >= 4) pos = syncsafe(body, 0);
    const idLen = ver === 2 ? 3 : 4, hdr = ver === 2 ? 6 : 10, out = {};
    while (pos + hdr <= body.length) {
      const id = body.toString("latin1", pos, pos + idLen);
      if (!/^[A-Z0-9]+$/.test(id)) break; // padding
      const len = ver === 2 ? body.readUIntBE(pos + 3, 3) : ver === 4 ? syncsafe(body, pos + 4) : body.readUInt32BE(pos + 4);
      const ff = ver === 2 ? 0 : body.readUInt16BE(pos + 8) & 0xFF;
      let data = body.subarray(pos + hdr, pos + hdr + len);
      pos += hdr + len;
      if (!len || data.length < len) continue;
      if (ver === 3) { if (ff & 0xC0) continue; if (ff & 0x20) data = data.subarray(1); }  // compressed or encrypted: skipped; a group id byte
      if (ver === 4) { if (ff & 0x0C) continue; if (ff & 0x40) data = data.subarray(1); if (ff & 0x02) data = unsync(data); if (ff & 0x01) data = data.subarray(4); }
      if (!data.length) continue;
      if (id === "COMM" || id === "COM") {
        const c = described(data, 3);
        if (c.value && !/^iTun/i.test(c.desc) && !out.comment) out.comment = c.value; // iTunes writes its own numbers into comments
      } else if (id === "TXXX" || id === "TXX") {
        const c = described(data, 0);
        if (c.value && /^(?:description|comment|summary|synopsis)$/i.test(c.desc) && !out.description) out.description = c.value;
      } else if (ID3_TEXT[id] && !out[ID3_TEXT[id]]) {
        // a field with several values (2.4 separates them with NUL) is read as its first: the main artist, the title
        const v = tidy(decode(data.subarray(1), data[0]).split("\u0000").find(x => x.trim()) || ""); if (v) out[ID3_TEXT[id]] = v;
      }
    }
    return out;
  } finally { await fh.close(); }
}

/* MP4/M4A: moov → udta → meta → ilst, wherever moov sits (often after the audio). */
function boxes(buf, from, to) {
  const out = [];
  for (let o = from; o + 8 <= to && out.length < 4096;) {
    let size = buf.readUInt32BE(o), hdr = 8;
    const type = buf.toString("latin1", o + 4, o + 8);
    if (size === 1) { if (o + 16 > to) break; size = Number(buf.readBigUInt64BE(o + 8)); hdr = 16; }
    else if (size === 0) size = to - o;
    if (size < hdr || o + size > to) break;
    out.push({ type, start: o + hdr, end: o + size });
    o += size;
  }
  return out;
}
const MP4_ITEMS = { "©nam": "title", "©ART": "artist", aART: "albumArtist", "©alb": "album", "©cmt": "comment", desc: "description", ldes: "longDescription", "©day": "date", "©st3": "subtitle" };
async function mp4Tags(file) {
  const fh = await fsp.open(file, "r");
  try {
    const { size: total } = await fh.stat();
    let moov = null;
    for (let o = 0, n = 0; o + 8 <= total && n < 1024; n++) {
      const h = await readAt(fh, o, 16); if (h.length < 8) break;
      let size = h.readUInt32BE(0), hdr = 8; const type = h.toString("latin1", 4, 8);
      if (size === 1) { if (h.length < 16) break; size = Number(h.readBigUInt64BE(8)); hdr = 16; } else if (size === 0) size = total - o;
      if (size < hdr) break;
      if (type === "moov") { moov = { start: o + hdr, size: size - hdr }; break; }
      o += size;
    }
    if (!moov || moov.size > MAX_MOOV_BYTES) return {};
    const body = await readAt(fh, moov.start, moov.size);
    const udta = boxes(body, 0, body.length).find(b => b.type === "udta"); if (!udta) return {};
    const meta = boxes(body, udta.start, udta.end).find(b => b.type === "meta"); if (!meta) return {};
    // an ISO meta box starts with version and flags; a QuickTime one goes straight to its children
    const first = meta.start + 4 <= meta.end ? body.toString("latin1", meta.start + 4, meta.start + 8) : "";
    const kids = boxes(body, ["hdlr", "ilst", "keys", "free"].includes(first) ? meta.start : meta.start + 4, meta.end);
    const ilst = kids.find(b => b.type === "ilst"); if (!ilst) return {};
    const out = {};
    for (const item of boxes(body, ilst.start, ilst.end)) {
      const key = MP4_ITEMS[item.type]; if (!key || out[key]) continue;
      const data = boxes(body, item.start, item.end).find(b => b.type === "data"); if (!data || data.end - data.start < 8) continue;
      const kind = body.readUInt32BE(data.start) & 0xFFFFFF, value = body.subarray(data.start + 8, data.end);
      const v = kind === 1 ? value.toString("utf8") : kind === 2 ? swap16(value).toString("utf16le") : "";
      if (tidy(v)) out[key] = tidy(v);
    }
    if (!out.comment && out.longDescription) out.comment = out.longDescription;
    delete out.longDescription;
    return out;
  } finally { await fh.close(); }
}

/* WAV: the RIFF INFO list (INAM title, IART artist, IPRD album, ICMT comment, ICRD date), wherever it sits. */
const WAV_ITEMS = { INAM: "title", IART: "artist", IPRD: "album", ICMT: "comment", ICRD: "date" };
async function wavInfo(file) {
  const fh = await fsp.open(file, "r");
  try {
    const { size: total } = await fh.stat(), out = {};
    for (let o = 12, n = 0; o + 8 <= total && n < 256; n++) {
      const h = await readAt(fh, o, 12); if (h.length < 8) break;
      const id = h.toString("latin1", 0, 4), size = h.readUInt32LE(4);
      if (id === "LIST" && h.toString("latin1", 8, 12) === "INFO" && size <= MAX_TAG_BYTES) {
        const list = await readAt(fh, o + 12, size - 4);
        for (let p = 0; p + 8 <= list.length;) {
          const sid = list.toString("latin1", p, p + 4), sl = list.readUInt32LE(p + 4);
          const key = WAV_ITEMS[sid], v = tidy(list.subarray(p + 8, p + 8 + sl).toString("utf8"));
          if (key && v && !out[key]) out[key] = v;
          p += 8 + sl + (sl % 2);
        }
      }
      o += 8 + size + (size % 2);
    }
    return out;
  } finally { await fh.close(); }
}

/* The tags as the listing uses them, trimmed and bounded. Unreadable tags are no tags. */
async function tags(file, format) {
  let t = {};
  try { t = format === "mp3" ? await id3(file) : format === "mp4" ? await mp4Tags(file) : format === "wav" ? await wavInfo(file) : {}; } catch (e) { t = {}; }
  const cap = (s, n) => String(s || "").slice(0, n).trim();
  const comment = t.comment || t.description || t.subtitle || "";
  const out = { title: cap(t.title, 300), artist: cap(t.artist, 120), albumArtist: cap(t.albumArtist, 120), album: cap(t.album, 300), comment: cap(comment, 2000), date: cap(t.date, 40) };
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}
/* A file name as a title: no extension, separators read as spaces ("Interview_Dana_Reyes-final.m4a" → "Interview Dana
   Reyes-final"). */
function titleFromName(name) {
  return String(name || "").replace(/^.*[\\/]/, "").replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

module.exports = { sniff, tags, titleFromName, FORMATS, id3, mp4Tags, wavInfo };
