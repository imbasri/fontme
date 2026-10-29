// 1-page template PNG: 9×11 grid (96 slots, last row 6 cells), matching fontkrea_template.png at A4 300 DPI (2480×3508).
// Cell interior maps to the same 500-unit em space as the editor canvas.

import { CHAR_SLOTS } from "./charset";
import { getStroke } from "perfect-freehand";
import { buildStrokeOptions, type PenLike } from "./stroke-options";
import { useFontStore, type Point } from "@/store/fontStore";

// A4 at 300 DPI = 2480×3508 px
// Grid offset: top margin for title + labels, left/right margins for edge labels
export const GRID_MARGIN_TOP = 72;   // title + marker space
export const GRID_MARGIN_LEFT = 16;  // left edge label space
export const GRID_MARGIN_RIGHT = 16; // right edge label space
export const GRID_MARGIN_BOTTOM = 72; // footer + marker space

export const TEMPLATE_COLS = 9;
export const TEMPLATE_ROWS = 11;
export const TEMPLATE_W = 2480;
export const TEMPLATE_H = 3508;
export const GRID_W = TEMPLATE_W - GRID_MARGIN_LEFT - GRID_MARGIN_RIGHT;
export const GRID_H = TEMPLATE_H - GRID_MARGIN_TOP - GRID_MARGIN_BOTTOM;
export const CELL_W = GRID_W / TEMPLATE_COLS; // ~271
export const CELL_H = GRID_H / TEMPLATE_ROWS; // ~304
// Label gap: empty space above each box for its character label (outside the box)
export const BOX_PAD_TOP = 40;
// Integer cell sizes for pixel-level indexing (masks, getImageData)
export const CELL_W_INT = Math.round(CELL_W);
export const CELL_H_INT = Math.round(CELL_H - BOX_PAD_TOP); // readable box height only

// Grid origin in canvas coords (top-left of row-0, col-0 cell)
export const GRID_X0 = GRID_MARGIN_LEFT;
export const GRID_Y0 = GRID_MARGIN_TOP;

// 500 em-space mapping (matches fontStore defaults, y-down)
export const EM = 500;

/** Convert canvas 500-unit em-space to cell pixel-space for a given cell (col, row). */
export function cellForIndex(index: number): { col: number; row: number } | null {
  if (index >= CHAR_SLOTS.length) return null;
  const row = Math.floor(index / TEMPLATE_COLS);
  const col = index % TEMPLATE_COLS;
  if (row >= TEMPLATE_ROWS) return null;
  return { col, row };
}

/** Paint one stroke (em-space points) onto the canvas at a cell origin, using perfect-freehand. */
function paintStroke(ctx: CanvasRenderingContext2D, points: Point[], ox: number, oy: number, ps: PenLike & { fill?: string }) {
  if (points.length < 2) return;
  const scale = CELL_H / EM;
  const emPoints = points.map(p => [p.x * scale, p.y * scale, 0.5] as [number, number, number]);
  const o = buildStrokeOptions(ps);
  const scaledTaper = (t: boolean | number | undefined) => (typeof t === "number" ? t * scale : t);
  const outline = getStroke(emPoints, {
    ...o,
    size: (o.size ?? 16) * scale,
    start: { ...o.start, taper: scaledTaper(o.start?.taper) },
    end: { ...o.end, taper: scaledTaper(o.end?.taper) },
  });
  if (outline.length < 3) return;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i][0], outline[i][1]);
  ctx.closePath();
  ctx.fillStyle = ps.fill ?? "#000000";
  ctx.fill();
  ctx.restore();
}

/** Draw the 9×11 template grid with guidelines and character labels.
 *  Optionally overlay pen strokes per cell (strokes[i] = 500 em-space). */
export function drawTemplate(
  canvas: HTMLCanvasElement,
  strokes: Array<Array<Point[] | null>>
) {
  canvas.width = TEMPLATE_W;
  canvas.height = TEMPLATE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, TEMPLATE_W, TEMPLATE_H);

  // Corner markers (black registration squares — import pipeline masks these out)
  const MS = 40, MM = 20;
  const markers: [number, number][] = [
    [MM, MM],
    [TEMPLATE_W - MM - MS, MM],
    [MM, TEMPLATE_H - MM - MS],
    [TEMPLATE_W - MM - MS, TEMPLATE_H - MM - MS],
  ];
  for (const [mx, my] of markers) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(mx, my, MS, MS);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(mx + 10, my + 10, MS - 20, MS - 20);
  }

  // Header — centered black title at top (outside the grid area)
  ctx.fillStyle = "#000000";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("FontKu glyph template", TEMPLATE_W / 2, 45);
  ctx.textAlign = "left";

  // Labels are in the 40px gap above each box, fully outside the box border
  for (let i = 0; i < CHAR_SLOTS.length; i++) {
    const cell = cellForIndex(i);
    if (!cell) continue;
    const ox = GRID_X0 + cell.col * CELL_W;
    const oy = GRID_Y0 + cell.row * CELL_H;
    const boxX = ox;
    const boxY = oy + BOX_PAD_TOP;
    const boxW = CELL_W;
    const boxH = CELL_H - BOX_PAD_TOP;

    // cell border (single clean box, no guidelines)
    ctx.strokeStyle = "#d4d4d8";
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW, boxH);

    // slot label in the gap above the box (outside, not inside)
    ctx.fillStyle = "#9ca3af";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(CHAR_SLOTS[i].char, ox + 8, oy + BOX_PAD_TOP - 8);
    ctx.textAlign = "left";

    // strokes for this cell: 500 em-space → box px, using perfect-freehand
    const cellStrokes = strokes[i];
    if (cellStrokes) {
      const ps = useFontStore.getState().penSettings;
      for (const s of cellStrokes) {
        if (!s || s.length < 2) continue;
        paintStroke(ctx, s, boxX, boxY, ps);
      }
    }
  }

  // Footer instruction + brand (outside the grid, at bottom)
  ctx.fillStyle = "#6b7280";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Keep all four markers visible. Fill only the empty character boxes.", TEMPLATE_W / 2, TEMPLATE_H - 30);
  ctx.textAlign = "right";
  ctx.fillText("fontku", TEMPLATE_W - 40, TEMPLATE_H - 30);
  ctx.textAlign = "left";
}

/** Download a blank (or filled) template sheet as fontku-template.pdf (A4 at 300 DPI). */
export function downloadTemplatePdf(strokes?: Array<Array<Point[] | null>>) {
  const canvas = document.createElement("canvas");
  canvas.width = TEMPLATE_W;
  canvas.height = TEMPLATE_H;
  drawTemplate(canvas, strokes ?? Array(CHAR_SLOTS.length).fill(null));

  // Convert canvas to PDF using jsPDF
  import("jspdf").then((module) => {
    const { default: jsPDF } = module;
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: [TEMPLATE_W, TEMPLATE_H],
    });
    const imgData = canvas.toDataURL("image/png");
    pdf.addImage(imgData, "PNG", 0, 0, TEMPLATE_W, TEMPLATE_H);
    pdf.save("fontku-template.pdf");
  });
}
