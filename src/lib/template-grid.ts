// 1-page template PNG: 10×10 grid, one character per cell, touching baseline.
// Cell interior maps to the same 500-unit em space as the editor canvas.

import { CHAR_SLOTS } from "./charset";

export const TEMPLATE_COLS = 10;
export const TEMPLATE_ROWS = 10;
export const CELL = 100; // px per cell
export const TEMPLATE_W = TEMPLATE_COLS * CELL;
export const TEMPLATE_H = TEMPLATE_ROWS * CELL;

// 500 em-space guideline ratios (matches fontStore defaults, y-down)
export const EM = 500;
const CAP = 10;
const XH = 110;
const BASE = 360;
const DESC = 475;

// px position of an em-space y value inside one cell
const emToCellY = (y: number) => (y / EM) * CELL;

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

/** Draw a blank template sheet into a canvas. `strokes` = Point[][] per CHAR_SLOTS index. */
export function drawTemplate(
  canvas: HTMLCanvasElement,
  strokes: Array<Array<{ x: number; y: number; pressure?: number }[] | null>>
) {
  canvas.width = TEMPLATE_W;
  canvas.height = TEMPLATE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, TEMPLATE_W, TEMPLATE_H);

  for (let i = 0; i < CHAR_SLOTS.length; i++) {
    const cell = cellForIndex(i);
    if (!cell) continue;
    const ox = cell.col * CELL;
    const oy = cell.row * CELL;

    // cell border
    ctx.strokeStyle = "#d4d4d8";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, CELL, CELL);

    // guidelines (dashed, colored like editor)
    const guide = (yv: number, color: string, label: string) => {
      const y = oy + emToCellY(yv);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(ox + 4, y);
      ctx.lineTo(ox + CELL - 4, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = "6px sans-serif";
      ctx.fillText(label, ox + 6, y - 2);
    };
    guide(CAP, "#10b981", "cap");
    guide(XH, "#3b82f6", "x");
    guide(BASE, "#ef4444", "base");
    guide(DESC, "#f59e0b", "desc");

    // slot label (top-left, light gray like the reference template)
    ctx.fillStyle = "#e4e4e7";
    ctx.font = "bold 9px sans-serif";
    ctx.fillText(cell.char, ox + 4, oy + 12);

    // strokes for this cell: 500 em-space → cell px, simple thick round lines
    const cellStrokes = strokes[i];
    if (cellStrokes) {
      ctx.strokeStyle = "#18181b";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const s of cellStrokes) {
        if (!s || s.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(ox + (s[0].x / EM) * CELL, oy + (s[0].y / EM) * CELL);
        for (let j = 1; j < s.length; j++) {
          ctx.lineTo(ox + (s[j].x / EM) * CELL, oy + (s[j].y / EM) * CELL);
        }
        ctx.stroke();
      }
    }
  }
}

/** Download a blank (or filled) template sheet as fontku-template.png. */
export function downloadTemplate(strokes?: Array<Array<{ x: number; y: number; pressure?: number }[] | null>>) {
  const canvas = document.createElement("canvas");
  drawTemplate(canvas, strokes ?? Array(CHAR_SLOTS.length).fill(null));
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fontku-template.png";
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
