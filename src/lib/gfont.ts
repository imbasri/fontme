/**
 * .gfont binary builder — reverse-engineered from contoh_gfont.gfont
 *
 * File layout:
 *   [int32 BE = 8] + [TEA-encrypted metadata] + [ZIP of glyph entries]
 *
 * Each ZIP entry:
 *   name:    decimal codepoint string ("65", "48", "8216_8217", …)
 *   method:  8 (deflate, raw stream — use zlib.deflateRawSync / inflateRawSync)
 *   flags:   0x0808 (bit 3 = data descriptor, bit 11 = UTF-8 filename)
 *
 *   Inflated payload:
 *     uint16 BE  strokeCount
 *     UTF-8      character code(s), terminated by 0x00
 *     float32 BE x, float32 BE y, repeated
 *     0x01       padding bytes to fill
 */

import zlib from "zlib";

interface Point { x: number; y: number; }

// ── TEA ────────────────────────────────────────────────────────────────
const TEA_KEY: number[] = [0x00000008, 0x00000000, 0x00000000, 0x00000000];
// ponytail: TEA key is a placeholder — real key unknown. Add when key is discovered.

function teaEncrypt(plain: Buffer): Buffer {
  const padded = Buffer.alloc(Math.ceil(plain.length / 8) * 8, 0);
  plain.copy(padded, 0);
  const out = Buffer.alloc(padded.length);
  for (let off = 0; off < padded.length; off += 8) {
    let v0 = padded.readUInt32BE(off) | 0;
    let v1 = padded.readUInt32BE(off + 4) | 0;
    let sum = 0;
    const delta = 0x9e3779b9;
    for (let i = 0; i < 32; i++) {
      sum = (sum + delta) | 0;
      v0 = (v0 + ((((v1 << 4) + TEA_KEY[0]) ^ (v1 >>> 16)) + TEA_KEY[2])) | 0;
      v1 = (v1 + ((((v0 << 4) + TEA_KEY[1]) ^ (v0 >>> 16)) + TEA_KEY[3])) | 0;
      v0 = (v0 + sum) | 0;
      v1 = (v1 + sum) | 0;
    }
    out.writeUInt32BE(v0 >>> 0, off);
    out.writeUInt32BE(v1 >>> 0, off + 4);
  }
  return out;
}

// ── CRC32 ─────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ── Glyph payload encoder ─────────────────────────────────────────────
function encodeGlyph(codepoint: number, strokes: Point[][]): Buffer {
  const charBuf = Buffer.from(String.fromCodePoint(codepoint), "utf8");
  const strokeCount = strokes.length;

  // header: uint16 BE strokeCount + UTF-8 char + 0x00 terminator
  const headerLen = 2 + charBuf.length + 1;

  // coordinates: each point is 8 bytes (float32 BE x + float32 BE y)
  const totalPoints = strokes.reduce((s, st) => s + st.length, 0);
  const coordLen = totalPoints * 8;

  // 0x01 padding to fill remaining space (no fixed size, just trailing pad)
  const buf = Buffer.alloc(headerLen + coordLen);

  // write header
  buf.writeUInt16BE(strokeCount, 0);
  charBuf.copy(buf, 2);
  buf.writeUInt8(0, 2 + charBuf.length); // 0x00 terminator

  // write coordinates
  let off = headerLen;
  for (const stroke of strokes) {
    for (const { x, y } of stroke) {
      const xBuf = Buffer.alloc(4);
      const yBuf = Buffer.alloc(4);
      new DataView(xBuf.buffer).setFloat32(0, x, false); // BE
      new DataView(yBuf.buffer).setFloat32(0, y, false); // BE
      xBuf.copy(buf, off);
      yBuf.copy(buf, off + 4);
      off += 8;
    }
  }
  return buf;
}

interface ZipEntry { name: string; data: Buffer; }

function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  const zlib = require("zlib");

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const compSize = compressed.length;
    const uncompSize = data.length;

    // ── local file header (flags 0x0808: data descriptor + UTF-8) ────
    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);           // version needed
    lh.writeUInt16LE(0x0808, 6);       // flags
    lh.writeUInt16LE(8, 8);           // method: deflate
    lh.writeUInt16LE(0, 10);          // mod time
    lh.writeUInt16LE(0, 12);          // mod date
    lh.writeUInt32LE(0, 14);          // crc32 = 0 (data descriptor)
    lh.writeUInt32LE(0, 18);          // compSize = 0
    lh.writeUInt32LE(0, 22);          // uncompSize = 0
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);          // extra field length
    nameBuf.copy(lh, 30);

    locals.push(lh);
    locals.push(compressed);

    // data descriptor: 0x08074b50 sig + crc + compSize + uncompSize
    const dd = Buffer.alloc(16);
    dd.writeUInt32LE(0x08074b50, 0);
    dd.writeUInt32LE(crc, 4);
    dd.writeUInt32LE(compSize, 8);
    dd.writeUInt32LE(uncompSize, 12);
    locals.push(dd);

    // ── central directory entry ───────────────────────────────────────
    const ce = Buffer.alloc(46 + nameBuf.length);
    ce.writeUInt32LE(0x02014b50, 0);
    ce.writeUInt16LE(20, 4);          // version made by
    ce.writeUInt16LE(20, 6);          // version needed
    ce.writeUInt16LE(0x0808, 8);      // flags
    ce.writeUInt16LE(8, 10);          // method: deflate
    ce.writeUInt16LE(0, 12);          // mod time
    ce.writeUInt16LE(0, 14);          // mod date
    ce.writeUInt32LE(crc, 16);
    ce.writeUInt32LE(compSize, 20);
    ce.writeUInt32LE(uncompSize, 24);
    ce.writeUInt16LE(nameBuf.length, 28);
    ce.writeUInt16LE(0, 30);          // extra field length
    ce.writeUInt16LE(0, 32);          // comment length
    ce.writeUInt16LE(0, 34);          // disk start
    ce.writeUInt16LE(0, 36);          // internal attrs
    ce.writeUInt32LE(0, 38);          // external attrs
    ce.writeUInt32LE(offset, 42);      // local header offset
    nameBuf.copy(ce, 46);

    centrals.push(ce);
    offset += lh.length + compressed.length + dd.length;
  }

  const localBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(centrals);

  // ── EOCD ────────────────────────────────────────────────────────────
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localBuf, centralBuf, eocd]);
}

// ── Public API ─────────────────────────────────────────────────────────
export interface GlyphPayload {
  codepoint: number;
  char: string;
  strokes: Point[][];
}

export function buildGfont(glyphs: GlyphPayload[]): Buffer {
  const zipEntries = glyphs
    .filter(g => g.strokes.length > 0)
    .map(g => ({ name: String(g.codepoint), data: encodeGlyph(g.codepoint, g.strokes) }));

  const zipBuf = buildZip(zipEntries);

  const metadata = JSON.stringify({
    format: "gfont",
    version: 1,
    glyphCount: glyphs.length,
    codepoints: glyphs.map(g => g.codepoint),
    createdAt: new Date().toISOString(),
  });
  const metaBuf = Buffer.from(metadata, "utf8");
  const encrypted = teaEncrypt(metaBuf);

  const header = Buffer.alloc(4 + encrypted.length);
  header.writeUInt32BE(8, 0);
  encrypted.copy(header, 4);

  return Buffer.concat([header, zipBuf]);
}
