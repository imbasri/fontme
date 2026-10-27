"use client";

import { useEffect, useRef } from "react";
import { useFontStore, Point } from "@/store/fontStore";
import { getStroke } from "perfect-freehand";
import { getEasingFunction } from "@/lib/easings";

const EM = 500;
const VIEW_PX = 180;    // magnified view size (px)
const MIN_ZOOM = 1.5;
const MAX_ZOOM = 5;

interface MagnifierPanelProps {
  position: { x: number; y: number };
  zoom: number;
  setZoom: (fn: (z: number) => number) => void;
  onClose: () => void;
}

export function MagnifierPanel({ position, zoom, setZoom, onClose }: MagnifierPanelProps) {
  const viewRef = useRef<HTMLCanvasElement>(null);

  const {
    activeCodepoint,
    currentStroke,
    glyphs,
    isPreviewMode,
    penSettings,
    baselineY,
    xHeight,
    capHeight,
    descenderY,
  } = useFontStore();

  const activeGlyph = activeCodepoint ? glyphs[activeCodepoint] : null;
  const strokes = activeGlyph ? activeGlyph.strokes : [];
  const liveStroke = currentStroke.length ? [currentStroke] : [];

  // Scroll to zoom
  useEffect(() => {
    const canvas = viewRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 0.15 : -0.15;
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + factor * z)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  // Paint magnified view centered on mouse position
  useEffect(() => {
    const canvas = viewRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = VIEW_PX, h = VIEW_PX;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    const viewW_em = VIEW_PX / zoom;
    const viewX = Math.max(0, Math.min(EM - viewW_em, position.x - viewW_em / 2));
    const viewY = Math.max(0, Math.min(EM - viewW_em, position.y - viewW_em / 2));

    const guideColors = [
      { y: capHeight, c: "#10b981" },
      { y: xHeight, c: "#3b82f6" },
      { y: baselineY, c: "#ef4444" },
      { y: descenderY, c: "#f59e0b" },
    ];

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();

    // Guidelines
    for (const g of guideColors) {
      const py = ((g.y - viewY) / viewW_em) * VIEW_PX;
      if (py < 0 || py > VIEW_PX) continue;
      ctx.strokeStyle = g.c;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(VIEW_PX, py);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Grid (50 em intervals)
    ctx.strokeStyle = "#f0f0f0";
    ctx.lineWidth = 1;
    for (let ex = 0; ex <= EM; ex += 50) {
      const px = ((ex - viewX) / viewW_em) * VIEW_PX;
      if (px < -1 || px > VIEW_PX + 1) continue;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, VIEW_PX); ctx.stroke();
    }
    for (let ey = 0; ey <= EM; ey += 50) {
      const py = ((ey - viewY) / viewW_em) * VIEW_PX;
      if (py < -1 || py > VIEW_PX + 1) continue;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(VIEW_PX, py); ctx.stroke();
    }

    // Crosshair at center (mouse position)
    const cx = VIEW_PX / 2;
    const cy = VIEW_PX / 2;
    ctx.strokeStyle = "rgba(239,68,68,0.8)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy); ctx.lineTo(cx + 15, cy); ctx.stroke();
    ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy + 15); ctx.stroke();
    ctx.setLineDash([]);

    // Strokes
    const drawStrokes = (strokesArr: Point[][], colorOverride?: string) => {
      for (const s of strokesArr) {
        if (s.length < 2) continue;
        const pts = s.map((p) => [
          ((p.x - viewX) / viewW_em) * VIEW_PX,
          ((p.y - viewY) / viewW_em) * VIEW_PX,
          p.pressure ?? 0.5,
        ] as [number, number, number]);
        const taperStartVal = penSettings.taperStart === 100 ? true : penSettings.taperStart;
        const taperEndVal = penSettings.taperEnd === 100 ? true : penSettings.taperEnd;
        const opts = {
          size: penSettings.size,
          thinning: penSettings.thinning,
          streamline: penSettings.streamline,
          smoothing: penSettings.smoothing,
          easing: getEasingFunction(penSettings.easing),
          simulatePressure: true,
          start: { cap: penSettings.capStart, taper: taperStartVal, easing: getEasingFunction(penSettings.easingStart) },
          end: { cap: penSettings.capEnd, taper: taperEndVal, easing: getEasingFunction(penSettings.easingEnd) },
          last: true,
        };
        const outline = getStroke(pts, opts);
        if (outline.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(outline[0][0], outline[0][1]);
        for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i][0], outline[i][1]);
        ctx.closePath();
        if (penSettings.isFilled) { ctx.fillStyle = colorOverride ?? (penSettings.isFilled ? penSettings.fill : "transparent"); ctx.fill(); }
        if (penSettings.strokeWidth > 0) {
          ctx.strokeStyle = colorOverride ?? penSettings.strokeColor;
          ctx.lineWidth = penSettings.strokeWidth;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.stroke();
        }
      }
    };

    drawStrokes(strokes);
    drawStrokes(liveStroke, "#3b82f6");

    ctx.restore();
  }, [strokes, liveStroke, zoom, position, isPreviewMode, penSettings, capHeight, xHeight, baselineY, descenderY]);


  return (
    <div
      className="w-[200px] shrink-0 flex flex-col gap-1 z-40 pointer-events-auto bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-lg p-1"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Magnified view */}
      <div className="rounded-md border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-white dark:bg-zinc-800 relative">
        <canvas
          ref={viewRef}
          className="cursor-crosshair"
          style={{ width: VIEW_PX, height: VIEW_PX }}
        />
        {/* Top bar overlay */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between gap-1 px-1.5 py-0.5 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm">
          <button
            onClick={onClose}
            title="Close magnifier"
            className="w-5 h-5 rounded flex items-center justify-center bg-zinc-900/80 text-white text-[10px] hover:bg-zinc-700"
          >
            ×
          </button>
          <span className="text-[10px] font-mono text-zinc-600 dark:text-zinc-300">
            {zoom.toFixed(1)}×
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.5))}
              className="w-5 h-5 text-[10px] rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              title="Zoom out"
            >
              −
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.5))}
              className="w-5 h-5 text-[10px] rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              title="Zoom in"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}