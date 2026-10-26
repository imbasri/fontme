// Import a filled-in fontku template (PNG or PDF) back into stroke data.
// Pipeline per cell:
//   1. Binary mask (dark, grayish ink only — skips colored template guides)
//   2. Connected-component labeling (each pen-down mark → one stroke)
//   3. Greedy centerline traversal from endpoint → ordered points = pen trajectory
//   4. Pressure estimated from local stroke thickness
// Result = one or more strokes per cell, matching the user's handwriting.

import { useFontStore, Point } from "@/store/fontStore";
import { CHAR_SLOTS } from "./charset";
import { cellForIndex, CELL_W, CELL_H, CELL_W_INT, CELL_H_INT, TEMPLATE_W, TEMPLATE_H, EM } from "./template-grid";

export const DARK_THRESHOLD = 130; // dark gray/black ink only (ballpoint ≈ 30–60)
export const SAT_THRESHOLD = 35; // channel spread above this = colored (template guides), skip
export const CELL_W_EXPORT = CELL_W;
export const CELL_H_EXPORT = CELL_H;
export const EM_EXPORT = EM;
const DIRS: [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

export function getBinaryMask(
  src: HTMLCanvasElement,
  col: number,
  row: number
): { mask: Uint8Array; w: number; h: number } {
  const w = CELL_W_INT, h = CELL_H_INT;
  const ctx = src.getContext("2d")!;
  const data = ctx.getImageData(col * w, row * h, w, h).data;
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
  return { mask, w, h };
}

function neighborCount(mask: Uint8Array, w: number, h: number, idx: number, x: number, y: number): number {
  let n = 0;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny * w + nx]) n++;
  }
  return n;
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

/** Greedy centerline traversal: start at an endpoint, follow the path. */
export function traceComponent(comp: Set<number>, w: number, h: number, mask: Uint8Array): Point[] {
  const has = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;

  // Find endpoints (degree-1 pixels)
  const endpoints: [number, number][] = [];
  for (const idx of comp) {
    const x = idx % w, y = Math.floor(idx / w);
    if (neighborCount(mask, w, h, idx, x, y) <= 1) {
      endpoints.push([x, y]);
    }
  }

  let start: [number, number];
  if (endpoints.length >= 2) {
    endpoints.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    start = endpoints[0];
  } else if (endpoints.length === 1) {
    start = endpoints[0];
  } else {
    let minIdx = Infinity, best: [number, number] = [0, 0];
    for (const idx of comp) {
      if (idx < minIdx) {
        minIdx = idx;
        best = [idx % w, Math.floor(idx / w)];
      }
    }
    start = best;
  }

  // Use comp as fast "visited" check (comp is the set of ink pixels in this component)
  const path: Point[] = [];
  const used = new Set<number>();
  let cx = start[0], cy = start[1];
  let prevX = cx, prevY = cy; // for direction

  while (true) {
    path.push({ x: cx, y: cy });
    used.add(cy * w + cx);

    // Direction vector
    const dirX = cx - prevX, dirY = cy - prevY;

    // Find best next: prefer continuing direction, else any unvisited neighbor
    let bestX = -1, bestY = -1, bestPriority = Infinity;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!has(nx, ny) || used.has(ny * w + nx)) continue;
      // Direction continuity score (lower = better)
      let priority: number;
      if (dirX === 0 && dirY === 0) {
        priority = 0;
      } else {
        priority = -(dx * dirX + dy * dirY);
      }
      if (priority < bestPriority) {
        bestPriority = priority;
        bestX = nx;
        bestY = ny;
      }
    }

    if (bestX < 0) break;
    prevX = cx;
    prevY = cy;
    cx = bestX;
    cy = bestY;
  }

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