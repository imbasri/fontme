// 1-page template PNG: 9×11 grid (96 slots, last row 6 cells), matching fontkrea_template.png at A4 300 DPI (2480×3508).
// Cell interior maps to the same 500-unit em space as the editor canvas.

import { CHAR_SLOTS } from "./charset";
import { getStroke } from "perfect-freehand";
import { getEasingFunction } from "./easings";
import { useFontStore, type Point } from "@/store/fontStore";

// A4 at 300 DPI = 2480×3508 px, 9 cols × 11 rows = 96 slots (CHAR_SLOTS.length)
export const TEMPLATE_COLS = 9;
export const TEMPLATE_ROWS = 11;
export const TEMPLATE_W = 2480;
export const TEMPLATE_H = 3508;
export const CELL_W = TEMPLATE_W / TEMPLATE_COLS; // ~275.56
export const CELL_H = TEMPLATE_H / TEMPLATE_ROWS; // ~318.91

// 500 em-space guideline ratios (matches fontStore defaults, y-down)
export const EM = 500;
const CAP = 10;
const XH = 110;
const BASE = 360;
const DESC = 475;

// px position of an em-space y value inside one cell
const emToCellY = (y: number) => (y / EM) * CELL_H;

export interface CellInfo {
  row: number;
  col: number;
  codepoint: number;
  char: string;
}

export function cellForIndex(i: number): CellInfo | null {
  if (i >= CHAR_SLOTS.length) return null;
  return {
    row: Math.floor(i / TEMPLATE_COLS),
    col: i % TEMPLATE_COLS,
    codepoint: CHAR_SLOTS[i].codepoint,
    char: CHAR_SLOTS[i].char,
  };
}

export function indexForCodepoint(codepoint: number): number {
  return CHAR_SLOTS.findIndex((s) => s.codepoint === codepoint);
}

/** Paint a single perfect-freehand stroke onto a cell-relative context. */
function paintStroke(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  ox: number,
  oy: number,
  ps: ReturnType<typeof useFontStore.getState>["penSettings"]
) {
  if (pts.length < 2) return;
  const taperStartVal: number | boolean = ps.taperStart === 100 ? true : ps.taperStart;
  const taperEndVal: number | boolean = ps.taperEnd === 100 ? true : ps.taperEnd;
  const outline = getStroke(
    pts.map((p) => [p.x, p.y, p.pressure ?? 0.5] as [number, number, number]),
    {
      size: ps.size,
      thinning: ps.thinning,
      streamline: ps.streamline,
      smoothing: ps.smoothing,
      easing: getEasingFunction(ps.easing),
      simulatePressure: true,
      start: { cap: ps.capStart, taper: taperStartVal, easing: getEasingFunction(ps.easingStart) },
      end: { cap: ps.capEnd, taper: taperEndVal, easing: getEasingFunction(ps.easingEnd) },
      last: true,
    }
  );
  if (outline.length < 3) return;

  const sx = CELL_W / EM;
  const sy = CELL_H / EM;
  ctx.beginPath();
  ctx.moveTo(ox + outline[0][0] * sx, oy + outline[0][1] * sy);
  for (let i = 1; i < outline.length; i++) {
    ctx.lineTo(ox + outline[i][0] * sx, oy + outline[i][1] * sy);
  }
  ctx.closePath();

  if (ps.isFilled) {
    ctx.fillStyle = ps.fill;
    ctx.fill();
  }
  if (ps.strokeWidth > 0) {
    ctx.strokeStyle = ps.strokeColor;
    ctx.lineWidth = ps.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

/** Draw a template sheet into a canvas. `strokes` = Point[][] per CHAR_SLOTS index. */
export function drawTemplate(
  canvas: HTMLCanvasElement,
  strokes: Array<Array<Point[] | null>>
) {
  canvas.width = TEMPLATE_W;
  canvas.height = TEMPLATE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, TEMPLATE_W, TEMPLATE_H);

  // Header
  ctx.fillStyle = "#52525b";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText("FontKu Template — All Characters", 16, 24);
  ctx.font = "11px sans-serif";
  ctx.fillText("Write one character per cell, touching the baseline", 16, 40);

  for (let i = 0; i < CHAR_SLOTS.length; i++) {
    const cell = cellForIndex(i);
    if (!cell) continue;
    const ox = cell.col * CELL_W;
    const oy = cell.row * CELL_H;

    // cell border
    ctx.strokeStyle = "#d4d4d8";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, CELL_W, CELL_H);

    // guidelines (dashed, colored like editor)
    const guide = (yv: number, color: string, label: string) => {
      const y = oy + emToCellY(yv);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(ox + 4, y);
      ctx.lineTo(ox + CELL_W - 4, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = "bold 9px sans-serif";
      ctx.fillText(label, ox + 6, y - 3);
    };
    guide(CAP, "#10b981", "cap");
    guide(XH, "#3b82f6", "x");
    guide(BASE, "#ef4444", "base");
    guide(DESC, "#f59e0b", "desc");

    // slot label (top-left, light gray like the reference template)
    ctx.fillStyle = "#e4e4e7";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(cell.char, ox + 4, oy + 14);

    // strokes for this cell: 500 em-space → cell px, using perfect-freehand
    const cellStrokes = strokes[i];
    if (cellStrokes) {
      const ps = useFontStore.getState().penSettings;
      for (const s of cellStrokes) {
        if (!s || s.length < 2) continue;
        paintStroke(ctx, s, ox, oy, ps);
      }
    }
  }
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