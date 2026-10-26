// Import a filled-in fontku template (PNG or PDF) back into stroke data (draw store).
// The sheet must be the 9×11 grid our exporter produces (or any image with
// that exact layout). In each cell we threshold dark pixels and trace them
// into one stroke in em space (500 units).

import { useFontStore, Point } from "@/store/fontStore";
import { CHAR_SLOTS } from "./charset";
import { cellForIndex, CELL_W, CELL_H, TEMPLATE_W, TEMPLATE_H, EM } from "./template-grid";

const DARK_THRESHOLD = 200; // pixel brightness below this = ink

/** Load a PNG file into a canvas of exact template size. */
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
  const pdfjs = await import("pdfjs-dist");
  const pdfjsLib = pdfjs.default ?? pdfjs;

  // Set up worker from CDN (avoids bundling the separate worker file)
  const workerSrc = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  // Render at template size
  const viewport = page.getViewport({ scale: TEMPLATE_W / 612 });
  const canvas = document.createElement("canvas");
  canvas.width = TEMPLATE_W;
  canvas.height = Math.round(viewport.height * (TEMPLATE_H / viewport.height));

  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const renderTask = page.render({
    canvasContext: ctx,
    viewport,
    canvas,
  });
  await renderTask.promise;

  // If PDF is slightly different size, resize to exact template dimensions
  if (canvas.width !== TEMPLATE_W || canvas.height !== TEMPLATE_H) {
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

function cellToEmPoints(
  src: HTMLCanvasElement | HTMLImageElement,
  col: number,
  row: number
): Point[] {
  const tmp = document.createElement("canvas");
  tmp.width = CELL_W;
  tmp.height = CELL_H;
  const ctx = tmp.getContext("2d")!;
  ctx.drawImage(src, col * CELL_W, row * CELL_H, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
  const { data } = ctx.getImageData(0, 0, CELL_W, CELL_H);

  const pts: Point[] = [];
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) {
      const i = (y * CELL_W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 128) continue;
      const brightness = (r + g + b) / 3;
      if (brightness < DARK_THRESHOLD) {
        pts.push({
          x: (x / CELL_W) * EM,
          y: (y / CELL_H) * EM,
          pressure: 1 - brightness / DARK_THRESHOLD, // darker = heavier
        });
      }
    }
  }
  return pts;
}

/** Simple resample: keep every Nth pixel point so strokes stay light. */
function decimate(pts: Point[], step = 4): Point[] {
  if (pts.length <= step) return pts;
  const out: Point[] = [pts[0]];
  for (let i = step; i < pts.length; i += step) out.push(pts[i]);
  return out;
}

export async function importTemplate(file: File): Promise<{ imported: number; total: number; importedGlyphs: string[] }> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const canvas = isPdf ? await loadPdfToCanvas(file) : await loadPngToCanvas(file);

  const { glyphs } = useFontStore.getState();
  let imported = 0;
  const importedGlyphs: string[] = [];

  CHAR_SLOTS.forEach((slot, i) => {
    const cell = cellForIndex(i);
    if (!cell) return;
    const raw = cellToEmPoints(canvas, cell.col, cell.row);
    if (raw.length < 2) return; // empty cell

    const strokes = [decimate(raw)];
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

  void glyphs; // keep lint quiet about unused destructure
  return { imported, total: CHAR_SLOTS.length, importedGlyphs };
}
