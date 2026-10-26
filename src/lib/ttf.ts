import * as opentype from "opentype.js";

const EM = 1000; // TTF still uses 1000-unit em
const BASELINE_Y = 360; // canvas baseline position (matches fontStore DEFAULT_GUIDELINES, 500-unit canvas)
const SCALE = 2; // canvas 500-unit → TTF 1000-unit

export interface TtfPoint { x: number; y: number; }
export interface TtfGlyphInput {
  codepoint: number;
  char: string;
  strokes: TtfPoint[][];
  strokeWidth?: number; // default 3
}

export function buildTtf(glyphs: TtfGlyphInput[]): Buffer {
  // Build glyph objects first
  const otGlyphs: opentype.Glyph[] = [];
  for (const g of glyphs) {
    const path = new opentype.Path();
    for (const stroke of g.strokes) {
      if (stroke.length < 2) continue;
      const halfW = (g.strokeWidth ? g.strokeWidth / 2 : 3) * SCALE;
      const left: number[] = [];
      const right: number[] = [];
      for (let i = 0; i < stroke.length; i++) {
        const p = stroke[i];
        let dx = 0, dy = 0;
        if (i > 0) { dx = p.x - stroke[i - 1].x; dy = p.y - stroke[i - 1].y; }
        else if (i < stroke.length - 1) { dx = stroke[i + 1].x - p.x; dy = stroke[i + 1].y - p.y; }
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        // Map canvas y-down (500-unit) to TTF y-up (1000-unit): scale *2, y' = (360 - y) * 2
        const y = (BASELINE_Y - p.y) * SCALE;
        const nx = (-dy / len) * halfW, ny = (dx / len) * halfW;
        left.push(p.x * SCALE + nx, y + ny);
        right.push(p.x * SCALE - nx, y - ny);
      }
      if (left.length >= 4) {
        path.moveTo(left[0], left[1]);
        for (let i = 2; i < left.length; i += 2) path.lineTo(left[i], left[i + 1]);
        for (let i = right.length - 2; i >= 0; i -= 2) path.lineTo(right[i], right[i + 1]);
        path.close();
      }
    }
    otGlyphs.push(new opentype.Glyph({
      unicode: g.codepoint,
      name: g.char,
      path,
      advanceWidth: 800,
    }));
  }

  const font = new opentype.Font({
    familyName: "FontKu",
    styleName: "Regular",
    unitsPerEm: 1000,
    ascender: 750,   // canvas cap=10 → y'=(360-10)*2=700 (margin 50)
    descender: -250, // canvas descender=475 → y'=(360-475)*2=-230 (margin 20)
    glyphs: otGlyphs,
  });

  return Buffer.from(font.toArrayBuffer());
}

export function createTtfFromGlyphs(
  glyphs: TtfGlyphInput[],
  onProgress?: (done: number, total: number) => void
): Buffer {
  const total = glyphs.length;
  for (let i = 0; i < total; i++) onProgress?.(i + 1, total);
  return buildTtf(glyphs);
}
