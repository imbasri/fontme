import * as opentype from "opentype.js";

/**
 * Convert an opentype.js glyph to an SVG string.
 * viewBox "0 0 em em" with scale(1,-1) to flip y-down→y-up for SVG.
 */
export function glyphToSvg(font: opentype.Font, codepoint: number): string {
  const glyph = font.glyphs.get(codepoint);
  if (!glyph) return "";

  const path = glyph.getPath(0, 0, 1000);
  const pathData = path.toPathData(2);

  const em = font.unitsPerEm || 1000;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${em} ${em}" width="${em}" height="${em}">
  <g transform="scale(1,-1) translate(0,-${em})">
    <path d="${pathData}" fill="currentColor"/>
  </g>
</svg>`;
}

/**
 * Generate SVGs for all glyphs with unicode values.
 * Returns a map char → svg string.
 */
export function generateGlyphSvgs(font: opentype.Font): Record<string, string> {
  const result: Record<string, string> = {};
  // Iterate by codepoint (GlyphSet has no iterator)
  for (let cp = 32; cp <= 0x10FFFF; cp++) {
    if (cp >= 58 && cp <= 64 || (cp >= 91 && cp <= 96 && cp !== 92 && cp !== 94 && cp !== 96)) continue;
    const glyph = font.glyphs.get(cp);
    if (!glyph || !glyph.unicode || glyph.unicode === 0) continue;
    const char = String.fromCodePoint(cp);
    result[char] = glyphToSvg(font, cp);
  }
  return result;
}