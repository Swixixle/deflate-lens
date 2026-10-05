"use strict";
/* Small synthetic recordings for the upload tests (0.14.1): real container headers and real tag layouts around a few
   silent frames. Nothing here is a real recording; the people and the show are invented. */

// an MPEG-1 Layer III frame header (128 kbps, 44.1 kHz) followed by silence: 417 bytes a frame
const frame = () => { const f = Buffer.alloc(417); f[0] = 0xFF; f[1] = 0xFB; f[2] = 0x90; f[3] = 0x64; return f; };
const frames = n => Buffer.concat(Array.from({ length: n }, frame));
const syncsafe = n => Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
const u32be = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const u32le = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const utf16 = s => Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(s, "utf16le")]);
const utf16be = s => Buffer.concat([Buffer.from([0xFE, 0xFF]), Buffer.from(s, "utf16le").swap16()]);

/* ID3v2.3 or 2.4 frames. `enc`: 0 Latin-1, 1 UTF-16 with a byte-order mark (little-endian, or big-endian with `be`), 3
   UTF-8 (2.4). */
function str(s, enc, be) { return enc === 3 ? Buffer.from(s, "utf8") : enc === 1 ? (be ? utf16be(s) : utf16(s)) : Buffer.from(s, "latin1"); }
function id3Frame(ver, id, payload) { return Buffer.concat([Buffer.from(id, "latin1"), ver === 4 ? syncsafe(payload.length) : u32be(payload.length), Buffer.from([0, 0]), payload]); }
function textFrame(ver, id, value, enc, be) { return id3Frame(ver, id, Buffer.concat([Buffer.from([enc]), str(value, enc, be)])); }
function commFrame(ver, desc, value, enc, be) {
  const term = enc === 1 || enc === 2 ? Buffer.from([0, 0]) : Buffer.from([0]);
  return id3Frame(ver, "COMM", Buffer.concat([Buffer.from([enc]), Buffer.from("eng", "latin1"), str(desc, enc, be), term, str(value, enc, be)]));
}
function mp3(tags = {}, opts = {}) {
  const ver = opts.ver || 3, enc = opts.enc !== undefined ? opts.enc : ver === 4 ? 3 : 1, be = !!opts.be, fr = [];
  const map = { title: "TIT2", artist: "TPE1", albumArtist: "TPE2", album: "TALB" };
  for (const [k, id] of Object.entries(map)) if (tags[k]) fr.push(textFrame(ver, id, tags[k], enc, be));
  if (opts.itunesComment) fr.push(commFrame(ver, "iTunNORM", " 00000A2B 00000B3C 0000F1E1", enc, be)); // iTunes writes numbers into a comment
  if (tags.comment) fr.push(commFrame(ver, "", tags.comment, enc, be));
  const body = Buffer.concat(fr.concat([Buffer.alloc(32)])); // padding after the frames
  return Buffer.concat([Buffer.from("ID3", "latin1"), Buffer.from([ver, 0, 0]), syncsafe(body.length), body, frames(opts.frames || 24)]);
}
/* ID3v2.2: three-letter frame ids and three-byte sizes. */
function mp3v22(tags = {}) {
  const f = (id, v) => { const p = Buffer.concat([Buffer.from([0]), Buffer.from(v, "latin1")]); const n = Buffer.alloc(3); n.writeUIntBE(p.length, 0, 3); return Buffer.concat([Buffer.from(id, "latin1"), n, p]); };
  const body = Buffer.concat([tags.title ? f("TT2", tags.title) : Buffer.alloc(0), tags.artist ? f("TP1", tags.artist) : Buffer.alloc(0), tags.album ? f("TAL", tags.album) : Buffer.alloc(0), Buffer.alloc(16)]);
  return Buffer.concat([Buffer.from("ID3", "latin1"), Buffer.from([2, 0, 0]), syncsafe(body.length), body, frames(8)]);
}
/* An MP3 without any tag: frames from the first byte. */
const bareMp3 = (n = 24) => frames(n);

/* MP4/M4A: ftyp, the audio (mdat), and moov with udta → meta → ilst, moov after the audio as most encoders write it. */
function box(type, ...parts) { const body = Buffer.concat(parts); return Buffer.concat([u32be(8 + body.length), Buffer.from(type, "latin1"), body]); }
function m4a(tags = {}, opts = {}) {
  const ftyp = box("ftyp", Buffer.from("M4A ", "latin1"), u32be(512), Buffer.from("M4A mp42isom", "latin1"));
  const item = (type, value) => box(type, box("data", u32be(1), u32be(0), Buffer.from(value, "utf8")));
  const names = { title: "©nam", artist: "©ART", albumArtist: "aART", album: "©alb", comment: "©cmt", description: "desc" };
  const items = Object.entries(names).filter(([k]) => tags[k]).map(([k, t]) => item(t, tags[k]));
  const udta = items.length ? box("udta", box("meta", u32be(0), box("hdlr", Buffer.alloc(25)), box("ilst", ...items))) : Buffer.alloc(0);
  const moov = box("moov", box("mvhd", Buffer.alloc(100)), udta);
  const mdat = box("mdat", Buffer.alloc(opts.audioBytes || 4000));
  return Buffer.concat(opts.moovFirst ? [ftyp, moov, mdat] : [ftyp, mdat, moov]);
}
/* WAV: fmt, the samples, then a LIST INFO chunk. */
function wav(tags = {}) {
  const chunk = (id, body) => Buffer.concat([Buffer.from(id, "latin1"), u32le(body.length), body, body.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
  const fmt = Buffer.alloc(16); fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(16000, 4); fmt.writeUInt32LE(32000, 8); fmt.writeUInt16LE(2, 12); fmt.writeUInt16LE(16, 14);
  const ids = { title: "INAM", artist: "IART", album: "IPRD", comment: "ICMT" };
  const info = Buffer.concat([Buffer.from("INFO", "latin1"), ...Object.entries(ids).filter(([k]) => tags[k]).map(([k, id]) => chunk(id, Buffer.concat([Buffer.from(tags[k], "utf8"), Buffer.from([0])])))]);
  const body = Buffer.concat([Buffer.from("WAVE", "latin1"), chunk("fmt ", fmt), chunk("data", Buffer.alloc(3200)), chunk("LIST", info)]);
  return Buffer.concat([Buffer.from("RIFF", "latin1"), u32le(body.length), body]);
}
const ogg = () => Buffer.concat([Buffer.from("OggS", "latin1"), Buffer.alloc(200)]);
const flac = () => Buffer.concat([Buffer.from("fLaC", "latin1"), Buffer.alloc(200)]);
const adts = () => Buffer.concat([Buffer.from([0xFF, 0xF1, 0x50, 0x80, 0x02, 0x1F, 0xFC]), Buffer.alloc(200)]);
const webm = () => Buffer.concat([Buffer.from([0x1A, 0x45, 0xDF, 0xA3]), Buffer.alloc(200)]);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(200)]);

module.exports = { mp3, mp3v22, bareMp3, m4a, wav, ogg, flac, adts, webm, png };
