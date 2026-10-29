// Import a filled-in fontku template (PNG or PDF) back into stroke data.
// Pipeline per cell:
//   1. Binary mask (dark, grayish ink only — skips colored template guides)
//   2. Connected-component labeling (each pen-down mark → one stroke)
//   3. Greedy centerline traversal from endpoint → ordered points = pen trajectory
//   4. Pressure estimated from local stroke thickness
// Result = one or more strokes per cell, matching the user's handwriting.

import { useFontStore, Point } from "@/store/fontStore";
import { CHAR_SLOTS } from "./charset";
import { cellForIndex, CELL_W, CELL_H, CELL_W_INT, CELL_H_INT, TEMPLATE_W, TEMPLATE_H, EM, GRID_X0, GRID_Y0, BOX_PAD_TOP } from "./template-grid";

export const DARK_THRESHOLD = 130; // dark gray/black ink only (ballpoint ≈ 30–60)
export const SAT_THRESHOLD = 35; // channel spread above this = colored (template guides), skip
export const CELL_W_EXPORT = CELL_W;
export const CELL_H_EXPORT = CELL_H;
export const EM_EXPORT = EM;
// Corner marker size (matches template-grid.ts drawing). Masked out so they aren't read as ink.
export const MARKER_SIZE = 40;
export const MARKER_MARGIN = 20;

const DIRS: [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

/** Zero out any corner-marker pixels that fall inside this cell. */
function maskOutCornerMarkers(
  mask: Uint8Array,
  w: number,
  h: number,
  col: number,
  row: number,
  cellPxW: number,
  cellPxH: number
): void {
  const markers: [number, number][] = [
    [MARKER_MARGIN, MARKER_MARGIN],
    [TEMPLATE_W - MARKER_MARGIN - MARKER_SIZE, MARKER_MARGIN],
    [MARKER_MARGIN, TEMPLATE_H - MARKER_MARGIN - MARKER_SIZE],
    [TEMPLATE_W - MARKER_MARGIN - MARKER_SIZE, TEMPLATE_H - MARKER_MARGIN - MARKER_SIZE],
  ];
  const cellX0 = GRID_X0 + col * cellPxW, cellY0 = GRID_Y0 + row * cellPxH;
  const cellX1 = cellX0 + cellPxW, cellY1 = cellY0 + cellPxH;
  for (const [mx, my] of markers) {
    // Only touches this cell if marker bounds overlap cell bounds
    if (mx + MARKER_SIZE <= cellX0 || mx >= cellX1 || my + MARKER_SIZE <= cellY0 || my >= cellY1)
      continue;
    const sx0 = Math.max(mx - cellX0, 0), sx1 = Math.min(mx + MARKER_SIZE - cellX0, w);
    const sy0 = Math.max(my - cellY0, 0), sy1 = Math.min(my + MARKER_SIZE - cellY0, h);
    for (let sy = sy0; sy < sy1; sy++) {
      for (let sx = sx0; sx < sx1; sx++) {
        mask[sy * w + sx] = 0;
      }
    }
  }
}

export function getBinaryMask(
  src: HTMLCanvasElement,
  col: number,
  row: number
): { mask: Uint8Array; w: number; h: number } {
  const w = CELL_W_INT, h = CELL_H_INT;
  const ctx = src.getContext("2d")!;
  // Read from box top (below the 40px label gap, BOX_PAD_TOP), not cell top.
  // X aligns: cell width == box width. Y needs the label-gap offset.
  const data = ctx.getImageData(
    GRID_X0 + col * w,
    Math.round(GRID_Y0 + row * CELL_H + BOX_PAD_TOP),
    w, h
  ).data;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 128) continue;
      const brightness = (r + g + b) / 3;
      if (brightness >= DARK_THRESHOLD) continue;
      if (Math.max(r, g, b) - Math.min(r, g, b) > SAT_THRESHOLD) continue;
      mask[y * w + x] = 1;
    }
  }
  maskOutCornerMarkers(mask, w, h, col, row, CELL_W_INT, CELL_H_INT);
  return { mask, w, h };
}

/** Connected components (8-connectivity) → return array of Sets of linear indices. */
export function labelComponents(mask: Uint8Array, w: number, h: number): Set<number>[] {
  const visited = new Uint8Array(w * h);
  const comps: Set<number>[] = [];
  for (let idx = 0; idx < w * h; idx++) {
    if (!mask[idx] || visited[idx]) continue;
    const comp = new Set<number>();
    const queue = [idx];
    visited[idx] = 1;
    while (queue.length) {
      const cur = queue.pop()!;
      comp.add(cur);
      const cx = cur % w, cy = Math.floor(cur / w);
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        const nidx = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[nidx] && !visited[nidx]) {
          visited[nidx] = 1;
          queue.push(nidx);
        }
      }
    }
    comps.push(comp);
  }
  return comps;
}

/** Zhang-Suen thinning: reduce a component to a 1px-wide skeleton. Returns a new Set of indices. */
function skeletonize(comp: Set<number>, w: number, h: number, mask: Uint8Array): Set<number> {
  // Work on a copy
  const skel = new Set<number>(comp);
  const is = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && skel.has(y * w + x);

  // 8-neighbors in clockwise order starting from top (P2..P9 around P1)
  const nbrs = (x: number, y: number): [number, number][] => [
    [x, y - 1], [x + 1, y - 1], [x + 1, y], [x + 1, y + 1],
    [x, y + 1], [x - 1, y + 1], [x - 1, y], [x - 1, y - 1],
  ];

  const transitions = (x: number, y: number): number => {
    const n = nbrs(x, y);
    let t = 0;
    for (let i = 0; i < 8; i++) {
      if (!is(n[i][0], n[i][1]) && is(n[(i + 1) % 8][0], n[(i + 1) % 8][1])) t++;
    }
    return t;
  };

  let changed = true;
  while (changed) {
    changed = false;

    // Sub-iteration 1: remove south-east boundary pixels
    const toRemove: number[] = [];
    for (const idx of skel) {
      const x = idx % w, y = Math.floor(idx / w);
      const n = nbrs(x, y);
      const b = n.filter(([nx, ny]) => is(nx, ny)).length; // B(P1)
      if (b < 2 || b > 6) continue;
      // Preserve corner junctions: corner pixels have both vertical and horizontal neighbors
      const p2 = is(n[0][0], n[0][1]), p4 = is(n[2][0], n[2][1]), p6 = is(n[4][0], n[4][1]), p8 = is(n[6][0], n[6][1]);
      if ((p2 && p6) && (p4 && p8)) continue; // corner: vertical + horizontal meet
      const a = transitions(x, y); // A(P1)
      if (a !== 1) continue;
      if (p2 && p4 && p6) continue;
      if (p4 && p6 && p8) continue;
      toRemove.push(idx);
    }
    for (const idx of toRemove) { skel.delete(idx); changed = true; }

    // Sub-iteration 2: remove north-west boundary pixels
    const toRemove2: number[] = [];
    for (const idx of skel) {
      const x = idx % w, y = Math.floor(idx / w);
      const n = nbrs(x, y);
      const b = n.filter(([nx, ny]) => is(nx, ny)).length;
      if (b < 2 || b > 6) continue;
      const p2 = is(n[0][0], n[0][1]), p4 = is(n[2][0], n[2][1]), p6 = is(n[4][0], n[4][1]), p8 = is(n[6][0], n[6][1]);
      if ((p2 && p6) && (p4 && p8)) continue;
      const a = transitions(x, y);
      if (a !== 1) continue;
      if (p2 && p4 && p8) continue;
      if (p2 && p6 && p8) continue;
      toRemove2.push(idx);
    }
    for (const idx of toRemove2) { skel.delete(idx); changed = true; }
  }

  return skel;
}

/** Greedy centerline traversal: start at an endpoint, follow the path. */
export function traceComponent(comp: Set<number>, w: number, h: number, mask: Uint8Array): Point[] {
  // Skeletonize first so BFS traces the actual pen trajectory, not a shortcut across a thick blob
  const skel = skeletonize(comp, w, h, mask);
  const skelMask = new Uint8Array(w * h);
  for (const idx of skel) skelMask[idx] = 1;

  // Find endpoints (degree-1 pixels) on the skeleton
  const endpoints: [number, number][] = [];
  for (const idx of skel) {
    const x = idx % w, y = Math.floor(idx / w);
    let deg = 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && skelMask[ny * w + nx]) deg++;
    }
    if (deg <= 1) endpoints.push([x, y]);
  }

  const startIdxs = endpoints.length
    ? endpoints.map(([x, y]) => y * w + x)
    : (() => {
        // Closed loop — pick top-leftmost pixel
        let minY = h, minX = w, idx = -1;
        for (const i of skel) {
          const x = i % w, y = Math.floor(i / w);
          if (y < minY || (y === minY && x < minX)) { minY = y; minX = x; idx = i; }
        }
        return [idx];
      })();

  const path: Point[] = [];

  // With exactly 2 endpoints (tree skeleton): longest path = BFS between the two endpoints
  if (startIdxs.length === 2) {
    const [a, b] = startIdxs;
    // BFS from b, tracking parents; walk back to a for the full a→b path
    const parent = new Int32Array(w * h).fill(-1);
    const distB = new Int32Array(w * h).fill(-1);
    const q2: number[] = [b];
    distB[b] = 0;
    for (let head = 0; head < q2.length; head++) {
      const cur = q2[head];
      const cx = cur % w, cy = Math.floor(cur / w);
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nidx = ny * w + nx;
        if (!skelMask[nidx] || distB[nidx] >= 0) continue;
        distB[nidx] = distB[cur] + 1;
        parent[nidx] = cur;
        q2.push(nidx);
      }
    }
    // Walk from a following parents toward b
    let cur = a;
    while (cur >= 0) {
      path.push({ x: cur % w, y: Math.floor(cur / w) });
      cur = parent[cur];
    }
    // `a` reached `b` via parent walk → path is a→...→b already
    return path;
  }

  // Closed loop or 3+ endpoints: pick topmost endpoint (or top-leftmost pixel), BFS to farthest
  let startIdx: number;
  if (startIdxs.length > 0) {
    startIdx = startIdxs[0];
  } else {
    startIdx = Array.from(skel)[0];
  }
  const dist = new Int32Array(w * h).fill(-1);
  const parent = new Int32Array(w * h).fill(-1);
  const queue: number[] = [startIdx];
  dist[startIdx] = 0;
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head++];
    const cx = cur % w, cy = Math.floor(cur / w);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nidx = ny * w + nx;
      if (!skelMask[nidx] || dist[nidx] >= 0) continue;
      dist[nidx] = dist[cur] + 1;
      parent[nidx] = cur;
      queue.push(nidx);
    }
  }

  let farthest = startIdx, maxDist = 0;
  for (const idx of startIdxs) {
    if (dist[idx] > maxDist) { maxDist = dist[idx]; farthest = idx; }
  }
  if (maxDist === 0) {
    for (const idx of skel) {
      if (dist[idx] > maxDist) { maxDist = dist[idx]; farthest = idx; }
    }
  }

  let cur = farthest;
  while (cur >= 0) {
    path.push({ x: cur % w, y: Math.floor(cur / w) });
    cur = parent[cur];
  }
  path.reverse();

  return path;
}

/** Estimate pressure from local perpendicular stroke thickness. */
export function withPressure(path: Point[], comp: Set<number>, w: number, h: number): Point[] {
  return path.map((p, i) => {
    // Direction vector from neighbors
    let dx: number, dy: number;
    if (i === 0) {
      const n = path[i + 1];
      dx = n.x - p.x; dy = n.y - p.y;
    } else if (i === path.length - 1) {
      const n = path[i - 1];
      dx = p.x - n.x; dy = p.y - n.y;
    } else {
      const n = path[i + 1], p2 = path[i - 1];
      dx = n.x - p2.x; dy = n.y - p2.y;
    }
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;

    let halfThickness = 0;
    // + perpendicular
    for (let d = 1; d <= 12; d++) {
      const sx = Math.round(p.x + d * px);
      const sy = Math.round(p.y + d * py);
      if (sx >= 0 && sy >= 0 && sx < w && sy < h && comp.has(sy * w + sx)) halfThickness = d;
      else break;
    }
    // - perpendicular
    for (let d = 1; d <= 12; d++) {
      const sx = Math.round(p.x - d * px);
      const sy = Math.round(p.y - d * py);
      if (sx >= 0 && sy >= 0 && sx < w && sy < h && comp.has(sy * w + sx)) halfThickness = Math.max(halfThickness, d);
      else break;
    }

    const thickness = halfThickness * 2 + 1;
    const pressure = Math.min(1, Math.max(0.2, (thickness - 1) / 8));
    return { x: (p.x / CELL_W) * EM, y: (p.y / CELL_H) * EM, pressure };
  });
}

/** Decimate a path to keep it light. */
export function decimate(pts: Point[], step = 3): Point[] {
  if (pts.length <= step) return pts;
  const out: Point[] = [pts[0]];
  for (let i = step; i < pts.length; i += step) out.push(pts[i]);
  if (pts[pts.length - 1] !== out[out.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

/** PNG load */
async function loadPngToCanvas(file: File): Promise<HTMLCanvasElement> {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;
  await img.decode();
  URL.revokeObjectURL(url);

  const canvas = document.createElement("canvas");
  canvas.width = TEMPLATE_W;
  canvas.height = TEMPLATE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Load a PDF file into a canvas of exact template size using pdfjs-dist. */
async function loadPdfToCanvas(file: File): Promise<HTMLCanvasElement> {
  // Bundle the worker locally so it works offline
  const pdfjsLib = await import("pdfjs-dist");
  const worker = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url));
  (pdfjsLib as any).GlobalWorkerOptions.workerPort = worker;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const page = await pdf.getPage(1);

  // Render at template width; scale = TEMPLATE_W / native page width
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = TEMPLATE_W / baseViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = TEMPLATE_W;
  canvas.height = Math.round(viewport.height);

  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  // Normalize height to TEMPLATE_H if PDF aspect differs slightly
  if (canvas.height !== TEMPLATE_H) {
    const out = document.createElement("canvas");
    out.width = TEMPLATE_W;
    out.height = TEMPLATE_H;
    const outCtx = out.getContext("2d")!;
    outCtx.fillStyle = "#ffffff";
    outCtx.fillRect(0, 0, TEMPLATE_W, TEMPLATE_H);
    outCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, TEMPLATE_W, TEMPLATE_H);
    return out;
  }
  return canvas;
}

export async function importTemplate(file: File): Promise<{ imported: number; total: number; importedGlyphs: string[] }> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const canvas = isPdf ? await loadPdfToCanvas(file) : await loadPngToCanvas(file);
  const ctx = canvas.getContext("2d")!;

  let imported = 0;
  const importedGlyphs: string[] = [];

  CHAR_SLOTS.forEach((slot, i) => {
    const cell = cellForIndex(i);
    if (!cell) return;
    const { mask, w, h } = getBinaryMask(ctx.canvas, cell.col, cell.row);

    const comps = labelComponents(mask, w, h);
    const strokes: Point[][] = [];
    for (const comp of comps) {
      const rawPath = traceComponent(comp, w, h, mask);
      if (rawPath.length < 2) continue;
      const withPressurePath = withPressure(rawPath, comp, w, h);
      strokes.push(decimate(withPressurePath));
    }

    if (strokes.length === 0) return;

    useFontStore.setState((s) => ({
      glyphs: {
        ...s.glyphs,
        [slot.codepoint]: {
          codepoint: slot.codepoint,
          char: slot.char,
          strokes: [...(s.glyphs[slot.codepoint]?.strokes ?? []), ...strokes],
        },
      },
    }));
    imported++;
    importedGlyphs.push(slot.char);
  });

  return { imported, total: CHAR_SLOTS.length, importedGlyphs };
}