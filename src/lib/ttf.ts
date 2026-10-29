import * as opentype from "opentype.js";
import { ttfToWoff2 } from "./woff2";
import { glyphToSvg } from "./glyph-svg";
import { buildSpecimen } from "./specimen";
import JSZip from "jszip";
import polygonClipping from "polygon-clipping";
import { getStrokePoints, type StrokeOptions, type StrokePoint } from "perfect-freehand";
import { getEasingFunction } from "./easings";
import { simulatedPressures, taperToOption, type PenLike } from "./stroke-options";

const EM = 1000;
const CANVAS_EM = 500;
const BASELINE_Y = 360;
/** Scale factor: canvas is 500-EM, TTF is 1000-EM */
const SCALE = EM / CANVAS_EM; // 2


export interface TtfPoint { x: number; y: number; pressure?: number; }

export interface GlyphAdjust {
  /** extra advance before this glyph, px in canvas EM units */
  spaceBefore?: number;
  /** extra advance after this glyph, px */
  spaceAfter?: number;
  /** vertical shift up/down, canvas px (positive = up) */
  verticalOffset?: number;
  /** per-glyph scale in percent, default 100 */
  scale?: number;
}

export interface TtfOptions {
  /** Stroke refinement via perfect-freehand */
  strokeSize?: number;
  strokeThinning?: number;
  strokeStreamline?: number;
  strokeSmoothing?: number;
  /** Pressure easing name (see easings.ts); default linear */
  strokeEasing?: string;
  /** Taper distances in canvas EM units; true = taper the whole stroke */
  strokeTaperStart?: number | boolean;
  strokeTaperEnd?: number | boolean;
  strokeEasingStart?: string;
  strokeEasingEnd?: string;
  /** Velocity-based pressure simulation, default true (matches canvas) */
  strokeSimulatePressure?: boolean;
  /** Multiplier applied to glyph advance width to control letter spacing */
  letterSpacingMultiplier?: number;
  /** Refine stage: extra advance width before each glyph (px) */
  spaceBefore?: number;
  /** Refine stage: extra advance width after each glyph (px) */
  spaceAfter?: number;
  /** Refine stage: vertical shift up/down (em units * SCALE) - per glyph */
  verticalOffsets?: number[];
  /** Refine stage: glyph scale percent */
  scale?: number;
  /** Per-glyph overrides, keyed by codepoint */
  glyphAdjust?: Record<number, GlyphAdjust>;
}

/** Default TTF options — tuned for solid small-size glyphs and normal spacing.
 * strokeSize=30 → outline ~60 EM units thick (~6% of EM), visible down to 12px. */
export const DEFAULT_TTF_OPTIONS: Required<TtfOptions> = {
  strokeSize: 30,
  strokeThinning: 0.5,
  strokeStreamline: 0.5,
  strokeSmoothing: 0.5,
  strokeEasing: "linear",
  strokeTaperStart: 0,
  strokeTaperEnd: 0,
  strokeEasingStart: "",
  strokeEasingEnd: "",
  strokeSimulatePressure: true,
  letterSpacingMultiplier: 1.15,
  spaceBefore: 0,
  spaceAfter: 0,
  verticalOffsets: [],
  scale: 100,
  glyphAdjust: {},
};

/** Pen settings → TTF stroke options. Single mapping used by the live preview
 *  and the export, so what the user tunes is what gets downloaded. */
export function penToTtfOptions(ps: PenLike): TtfOptions {
  return {
    strokeSize: ps.size,
    strokeThinning: ps.thinning,
    strokeStreamline: ps.streamline,
    strokeSmoothing: ps.smoothing,
    strokeEasing: ps.easing,
    strokeTaperStart: ps.taperStart,
    strokeTaperEnd: ps.taperEnd,
    strokeEasingStart: ps.easingStart,
    strokeEasingEnd: ps.easingEnd,
    strokeSimulatePressure: ps.simulatePressure ?? true,
  };
}

export interface TtfGlyphInput {
  codepoint: number;
  char: string;
  strokes: TtfPoint[][];
  strokeWidth?: number;
}

const SEG = 8;

function ring(cx: number, cy: number, r: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Disks sampled along perfect-freehand's smoothed centerline with its per-point
 * radius (effective pressure + taper, exactly as the canvas renders it);
 * unioned instead of one self-intersecting ring, which leaves gaps. */
function strokeToDisks(
  stroke: TtfPoint[],
  size: number,
  opts: Required<TtfOptions>,
): Array<Array<[number, number]>> {
  // Everything here works in TTF space (canvas coords and pen settings are
  // scaled up front) so the point filter, pressure simulation and taper
  // distances behave exactly as they do on the canvas.
  const raw = stroke.map((p) => [p.x * SCALE, p.y * SCALE, p.pressure ?? 0.5] as [number, number, number]);
  const strokeOpts: StrokeOptions = {
    size,
    thinning: opts.strokeThinning,
    smoothing: opts.strokeSmoothing,
    streamline: opts.strokeStreamline,
    simulatePressure: opts.strokeSimulatePressure,
    last: true,
  };
  const pts = getStrokePoints(raw, strokeOpts);
  const pressures = opts.strokeSimulatePressure !== false
    ? simulatedPressures(pts, strokeOpts)
    : pts.map((p) => p.pressure);

  const easing = getEasingFunction(opts.strokeEasing) ?? ((t: number) => t);
  const totalLength = pts.length > 0 ? pts[pts.length - 1].runningLength : 0;
  // Same taper distance rule as perfect-freehand: true = full stroke length.
  // Settings are canvas units, runningLength is TTF space → scale them.
  const taperDistance = (t: number | boolean | undefined) => {
    const v = taperToOption(t ?? 0);
    return v === true ? Math.max(size, totalLength) : typeof v === "number" ? v * SCALE : 0;
  };
  const taperStart = taperDistance(opts.strokeTaperStart);
  const taperEnd = taperDistance(opts.strokeTaperEnd);
  // Library defaults when no easing name is given.
  const startEase = getEasingFunction(opts.strokeEasingStart) ?? ((t: number) => t * (2 - t));
  const endEase = getEasingFunction(opts.strokeEasingEnd) ?? ((t: number) => --t * t * t + 1);

  const radiusOf = (p: StrokePoint, i: number) => {
    const r = opts.strokeThinning
      ? size * easing(0.5 - opts.strokeThinning * (0.5 - (pressures[i] ?? p.pressure)))
      : size / 2;
    const s = p.runningLength < taperStart ? startEase(p.runningLength / taperStart) : 1;
    const e = totalLength - p.runningLength < taperEnd ? endEase((totalLength - p.runningLength) / taperEnd) : 1;
    return Math.max(0.01, r * Math.min(s, e));
  };

  const disks: Array<Array<[number, number]>> = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const ra = radiusOf(a, i);
    if (ra <= 0) continue;
    if (i === 0) {
      disks.push(ring(a.point[0], a.point[1], ra));
      continue;
    }
    const b = pts[i - 1];
    const rb = radiusOf(b, i - 1);
    if (rb <= 0) {
      disks.push(ring(a.point[0], a.point[1], ra));
      continue;
    }
    const [x0, y0] = b.point;
    const [x1, y1] = a.point;
    const d = Math.hypot(x1 - x0, y1 - y0);
    // Smallest local radius keeps the gap below every disk's step; at least one
    // disk per segment keeps sparsely sampled strokes continuous.
    const n = Math.max(1, Math.ceil(d / Math.max(Math.min(ra, rb) * 0.8, 0.5)));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      disks.push(ring(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, rb + (ra - rb) * t));
    }
  }
  return disks;
}

/**
 * Merge a glyph's stroke outlines into one solid contour set, keeping real
 * counters (holes) while removing the white gaps that appear where strokes
 * cross. Every ring is emitted with the winding polygon-clipping produces
 * (exterior and holes wound opposite), which is what the TTF nonzero fill rule
 * expects.
 */
function unionGlyph(groups: [number, number][][][]): [number, number][][] {
  if (groups.length === 0) return [];
  // Union each stroke separately, then union the results. One giant union of
  // every disk in a dense glyph makes polygon-clipping fail outright ("Unable
  // to complete output ring"); per-stroke groups stay well inside its limits.
  const perStroke: number[][][][] = [];
  for (const group of groups) {
    if (group.length === 0) continue;
    const polys = group.map((ring) => [ring]);
    const merged = polygonClipping.union(polys[0], ...polys.slice(1)) as unknown as number[][][][];
    for (const poly of merged) perStroke.push(poly);
  }
  if (perStroke.length === 0) return [];
  const all = perStroke.length === 1
    ? perStroke
    : ((polygonClipping.union as any)(perStroke[0], ...perStroke.slice(1)) as unknown as number[][][][]);
  const rings: [number, number][][] = [];
  for (const poly of all) {
    if (!Array.isArray(poly) || poly.length === 0) continue;
    for (const ring of poly) {
      if (Array.isArray(ring) && ring.length >= 3 && Math.abs(signedArea(ring as unknown as [number, number][])) >= 1) {
        rings.push(simplifyRing(ring as unknown as [number, number][]));
      }
    }
  }
  return rings;
}

/** Drop points within `tol` of the segment between their neighbours (0.5 EM
 *  units = 0.05%, invisible). Hairline strokes union into tens of thousands of
 *  near-collinear points, and opentype's `Math.min.apply(null, coords)` overflows
 *  the call stack above ~60k. */
function simplifyRing(pts: [number, number][], tol = 0.5): [number, number][] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const tol2 = tol * tol;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const dx = pts[b][0] - ax;
    const dy = pts[b][1] - ay;
    const len2 = dx * dx + dy * dy;
    let best = -1;
    let bi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] - ax;
      const py = pts[i][1] - ay;
      const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
      const ex = px - t * dx;
      const ey = py - t * dy;
      const d2 = ex * ex + ey * ey;
      if (d2 > best) {
        best = d2;
        bi = i;
      }
    }
    if (best > tol2 && bi > 0) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  const out = pts.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : pts;
}

function signedArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return a / 2;
}

/** Build the opentype.Font object from glyph data */
export function buildFont(glyphs: TtfGlyphInput[], options: TtfOptions = {}): opentype.Font {
  const opts = { ...DEFAULT_TTF_OPTIONS, ...options };
  // Stroke size is defined in canvas EM (500) space; the outline is built
  // directly in TTF space (strokeToDisks scales the points), so strokeSize is
  // scaled by the same factor to keep the exported stroke exactly as thick
  // (relatively) as the pen stroke the user drew on the canvas.
  const strokeSizeTtf = Math.round((opts.strokeSize ?? DEFAULT_TTF_OPTIONS.strokeSize) * SCALE);
  const vOffsets = opts.verticalOffsets ?? [];
  const otGlyphs: opentype.Glyph[] = [];
  for (let gi = 0; gi < glyphs.length; gi++) {
    const g = glyphs[gi];
    const path = new opentype.Path();
    const adj = opts.glyphAdjust?.[g.codepoint];
    const vOff = (adj?.verticalOffset ?? vOffsets[gi] ?? 0) * SCALE;
    const gs = (adj?.scale ?? 100) / 100;

    const groups: [number, number][][][] = [];
    for (const stroke of g.strokes) {
      if (stroke.length < 2) continue;
      groups.push(strokeToDisks(stroke, strokeSizeTtf, opts));
    }

    const rings = unionGlyph(groups);
    let minX = Infinity, maxX = -Infinity;
    // strokeToDisks already returns TTF-space coords; only gs/vOff remain.
    for (const ring of rings) {
      path.moveTo(ring[0][0] * gs, (BASELINE_Y * SCALE - ring[0][1]) * gs + vOff * gs);
      for (let i = 1; i < ring.length; i++) {
        path.lineTo(ring[i][0] * gs, (BASELINE_Y * SCALE - ring[i][1]) * gs + vOff * gs);
      }
      path.close();
      for (const [ox] of ring) {
        const tx = ox * gs;
        if (tx < minX) minX = tx;
        if (tx > maxX) maxX = tx;
      }
    }

    let adv: number;
    if (g.codepoint === 32) {
      adv = 500;
    } else if (maxX > minX) {
      const glyphW = maxX - minX;
      // Base advance from glyph width + letter spacing multiplier
      let baseAdv = Math.round(Math.max(400, Math.min(800, glyphW * opts.letterSpacingMultiplier)));
      // Per-glyph spacing is canvas px → TTF EM; global value stays raw (legacy).
      baseAdv = Math.round(
        baseAdv +
          (adj?.spaceBefore !== undefined ? adj.spaceBefore * SCALE : opts.spaceBefore) +
          (adj?.spaceAfter !== undefined ? adj.spaceAfter * SCALE : opts.spaceAfter),
      );
      adv = baseAdv;
    } else {
      adv = 500;
    }

    // Apply scale factor to glyph advance width
    const scaleFactor = opts.scale / 100;

    otGlyphs.push(new opentype.Glyph({
      unicode: g.codepoint,
      name: g.char,
      path,
      advanceWidth: Math.round(adv * scaleFactor),
    }));
  }

  return new opentype.Font({
    familyName: "FontKu",
    styleName: "Regular",
    unitsPerEm: EM,
    // Metrics match the canvas: baseline at 360/500, top at 0, bottom at 500.
    // In TTF space (y-up, baseline=0): top = 720, bottom = -280.
    ascender: Math.round(BASELINE_Y * SCALE * (opts.scale / 100)),
    descender: Math.round(-(CANVAS_EM - BASELINE_Y) * SCALE * (opts.scale / 100)),
    glyphs: otGlyphs,
  });
}

/** Build a TTF font buffer from glyph data */
export function buildTtf(glyphs: TtfGlyphInput[], options?: TtfOptions): Buffer {
  const font = buildFont(glyphs, options);
  return Buffer.from(font.toArrayBuffer());
}

/** Build a complete font pack (TTF, WOFF2, SVGs, specimen) */
export async function buildFontPack(glyphs: TtfGlyphInput[], name: string, options?: TtfOptions): Promise<Buffer> {
  const font = buildFont(glyphs, options);
  const ttfBuffer = Buffer.from(font.toArrayBuffer());

  // Build WOFF2
  const woff2Buffer = await ttfToWoff2(ttfBuffer);

  // Build SVGs for each glyph
  const svgPaths: Record<string, string> = {};
  for (const g of glyphs) {
    svgPaths[g.char] = glyphToSvg(font, g.codepoint);
  }

  // Build specimen
  const specimenHtml = buildSpecimen(font, name);

  // Create ZIP archive
  const zip = new JSZip();
  zip.file(`${name}.ttf`, ttfBuffer);
  zip.file(`${name}.woff2`, Buffer.from(woff2Buffer));

  // Add glyph SVGs
  const glyphFolder = zip.folder("glyphs");
  if (glyphFolder) {
    for (const [char, svg] of Object.entries(svgPaths)) {
      glyphFolder.file(`${char}.svg`, svg);
    }
  }

  // Add specimen
  zip.file("specimen.html", specimenHtml);

  // Generate the ZIP buffer
  const zipBuffer = await zip.generateAsync({ type: "uint8array" });
  return Buffer.from(zipBuffer);
}