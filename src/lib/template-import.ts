// Import a filled-in fontku template PNG back into stroke data (draw store).
// The sheet must be the 9×11 grid our exporter produces (or any image with
// that exact layout). In each cell we threshold dark pixels and trace them
// into one stroke in em space (500 units).

import { useFontStore, Point } from "@/store/fontStore";
import { CHAR_SLOTS } from "./charset";
import { cellForIndex, CELL_W, CELL_H, TEMPLATE_W, TEMPLATE_H, EM } from "./template-grid";

const DARK_THRESHOLD = 200; // pixel brightness below this = ink

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

export async function importTemplate(file: File): Promise<{ imported: number; total: number }> {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;
  await img.decode();
  URL.revokeObjectURL(url);

  // Downscale/upscale to exact template size so cells align with CHAR_SLOTS
  const canvas = document.createElement("canvas");
  canvas.width = TEMPLATE_W;
  canvas.height = TEMPLATE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const { glyphs } = useFontStore.getState();
  let imported = 0;

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
  });

  void glyphs; // keep lint quiet about unused destructure
  return { imported, total: CHAR_SLOTS.length };
}
