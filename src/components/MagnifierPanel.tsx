"use client";

import { useEffect, useRef, useState } from "react";
import { useFontStore, Point } from "@/store/fontStore";
import { getStroke } from "perfect-freehand";
import { getEasingFunction } from "@/lib/easings";

// Reuses the same stroke-painting logic as Canvas but scoped to a zoomed viewport.
// The panel is purely a read-only view — it does not affect drawing.

const EM = 500;
const MINIMAP_PX = 130; // minimap canvas display size
const VIEW_PX = 320;    // magnified view display size
const MIN_ZOOM = 1.5;
const MAX_ZOOM = 5;
const DEFAULT_ZOOM = 3;

export function MagnifierPanel({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pan, setPan] = useState({ x: EM / 2, y: EM / 2 }); // center of zoomed view in em coords

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

  // Clamp pan so the zoomed view never goes outside the em-space
  const clampPan = (px: number, py: number, z: number) => {
    const halfW = (VIEW_PX / (2 * z)) * (EM / VIEW_PX); // in em units: view width in em
    const viewW_em = VIEW_PX / z;
    const cx = Math.max(viewW_em / 2, Math.min(EM - viewW_em / 2, px));
    const cy = Math.max(viewW_em / 2, Math.min(EM - viewW_em / 2, py));
    return { x: cx, y: cy };
  };

  const setPanClamped = (px: number, py: number, z = zoom) => {
    setPan(clampPan(px, py, z));
  };

  // Scroll to zoom, centered on cursor
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 0.15 : -0.15;
      setZoom((z) => {
        const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + factor * z));
        setPanClamped(pan.x, pan.y, nz);
        return nz;
      });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [pan, zoom]);

  // Drag to pan the zoomed view (via minimap rectangle)
  const minimapPointer = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const emX = ((e.clientX - rect.left) / rect.width) * EM;
    const emY = ((e.clientY - rect.top) / rect.height) * EM;
    setPanClamped(emX, emY);
  };

  const paintStroke = (
    ctx: CanvasRenderingContext2D,
    stroke: Point[],
    color: string,
    transform: { zoom: number; panX: number; panY: number; viewW: number }
  ) => {
    const { zoom: z, panX: cx, panY: cy, viewW: VW } = transform;
    // Map em-coord to canvas-pixel in the zoomed view
    const mapX = (ex: number) => ((ex - (cx - VW / 2)) / VW) * VW;
    const mapY = (ey: number) => ((ey - (cy - VW / 2)) / VW) * VW;

    if (stroke.length < 2) return;
    const taperStartVal: number | boolean = penSettings.taperStart === 100 ? true : penSettings.taperStart;
    const taperEndVal: number | boolean = penSettings.taperEnd === 100 ? true : penSettings.taperEnd;
    const strokeOptions = {
      size: penSettings.size / z,
      thinning: penSettings.thinning,
      streamline: penSettings.streamline,
      smoothing: penSettings.smoothing,
      easing: getEasingFunction(penSettings.easing),
      simulatePressure: true,
      start: {
        cap: penSettings.capStart,
        taper: taperStartVal,
        easing: getEasingFunction(penSettings.easingStart),
      },
      end: {
        cap: penSettings.capEnd,
        taper: taperEndVal,
        easing: getEasingFunction(penSettings.easingEnd),
      },
      last: true,
    };
    const outlinePts = getStroke(
      stroke.map((p) => [p.x, p.y, p.pressure ?? 0.5] as [number, number, number]),
      strokeOptions
    );
    if (outlinePts.length < 3) return;

    ctx.beginPath();
    ctx.moveTo(mapX(outlinePts[0][0]), mapY(outlinePts[0][1]));
    for (let i = 1; i < outlinePts.length; i++) {
      ctx.lineTo(mapX(outlinePts[i][0]), mapY(outlinePts[i][1]));
    }
    ctx.closePath();

    if (penSettings.isFilled) {
      ctx.fillStyle = color;
      ctx.fill();
    }
    if (penSettings.strokeWidth > 0) {
      ctx.strokeStyle = penSettings.strokeColor;
      ctx.lineWidth = penSettings.strokeWidth / z;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  };

  // Draw magnified view
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = VIEW_PX, h = VIEW_PX;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    const viewW_em = VIEW_PX / zoom;
    const viewX = Math.max(0, Math.min(EM - viewW_em, pan.x - viewW_em / 2));
    const viewY = Math.max(0, Math.min(EM - viewW_em, pan.y - viewW_em / 2));

    const guideColors: Record<string, string> = {
      cap: "#10b981",
      xHeight: "#3b82f6",
      baseline: "#ef4444",
      descender: "#f59e0b",
    };
    const guideYs = [
      { y: capHeight, c: guideColors.cap },
      { y: xHeight, c: guideColors.xHeight },
      { y: baselineY, c: guideColors.baseline },
      { y: descenderY, c: guideColors.descender },
    ];

    ctx.save();
    // Clip to view area
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();

    // Draw guidelines (scaled into view)
    const scale = (vy: number) => ((vy - viewY) / viewW_em) * VIEW_PX;
    for (const g of guideYs) {
      const py = scale(g.y);
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

    // Grid
    ctx.strokeStyle = "#f0f0f0";
    ctx.lineWidth = 1;
    const step = 50 * zoom / (VIEW_PX / viewW_em); // keep grid at 50 em intervals
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

    // Strokes
    const transform = { zoom, panX: pan.x, panY: pan.y, viewW: VIEW_PX };
    const viewTransform = { ...transform, panX: viewX, panY: viewY };
    // Use a simpler approach: scale em-coord directly
    const paintIn = (stroke: Point[], color: string) => {
      const pts = stroke.map((p) => [
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
      if (outline.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(outline[0][0], outline[0][1]);
      for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i][0], outline[i][1]);
      ctx.closePath();
      if (penSettings.isFilled) { ctx.fillStyle = color; ctx.fill(); }
      if (penSettings.strokeWidth > 0) {
        ctx.strokeStyle = penSettings.strokeColor;
        ctx.lineWidth = penSettings.strokeWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    };

    for (const s of strokes) paintIn(s, penSettings.isFilled ? penSettings.fill : "transparent");
    for (const s of liveStroke) paintIn(s, penSettings.isFilled ? penSettings.fill : "transparent");
    ctx.restore();
  }, [strokes, liveStroke, zoom, pan, isPreviewMode, penSettings, capHeight, xHeight, baselineY, descenderY]);

  // Draw minimap (full em-space, viewport rectangle, draggable)
  useEffect(() => {
    const minimap = minimapRef.current;
    if (!minimap) return;
    const dpr = window.devicePixelRatio || 1;
    minimap.width = MINIMAP_PX * dpr;
    minimap.height = MINIMAP_PX * dpr;
    const ctx = minimap.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, MINIMAP_PX, MINIMAP_PX);

    const s = (v: number) => (v / EM) * MINIMAP_PX;

    // Guidelines
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#10b981"; ctx.beginPath(); ctx.moveTo(0, s(capHeight)); ctx.lineTo(MINIMAP_PX, s(capHeight)); ctx.stroke();
    ctx.strokeStyle = "#3b82f6"; ctx.beginPath(); ctx.moveTo(0, s(xHeight)); ctx.lineTo(MINIMAP_PX, s(xHeight)); ctx.stroke();
    ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(0, s(baselineY)); ctx.lineTo(MINIMAP_PX, s(baselineY)); ctx.stroke();
    ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(0, s(descenderY)); ctx.lineTo(MINIMAP_PX, s(descenderY)); ctx.stroke();
    ctx.setLineDash([]);

    // Strokes (tiny)
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.8;
    for (const st of strokes) {
      if (st.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s(st[0].x), s(st[0].y));
      for (let i = 1; i < st.length; i++) ctx.lineTo(s(st[i].x), s(st[i].y));
      ctx.stroke();
    }
    for (const st of liveStroke) {
      if (st.length < 2) continue;
      ctx.strokeStyle = "#3b82f6";
      ctx.beginPath();
      ctx.moveTo(s(st[0].x), s(st[0].y));
      for (let i = 1; i < st.length; i++) ctx.lineTo(s(st[i].x), s(st[i].y));
      ctx.stroke();
      ctx.strokeStyle = "#333";
    }

    // Viewport rectangle
    const viewW_em = VIEW_PX / zoom;
    const viewX = Math.max(0, Math.min(EM - viewW_em, pan.x - viewW_em / 2));
    const viewY = Math.max(0, Math.min(EM - viewW_em, pan.y - viewW_em / 2));
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(s(viewX), s(viewY), s(viewW_em), s(viewW_em));
    ctx.fillStyle = "rgba(239,68,68,0.08)";
    ctx.fillRect(s(viewX), s(viewY), s(viewW_em), s(viewW_em));
  }, [strokes, liveStroke, zoom, pan, capHeight, xHeight, baselineY, descenderY]);

  return (
    <div className="absolute left-3 top-3 bottom-3 flex flex-col gap-2 z-40 pointer-events-auto"
         onPointerDown={(e) => e.stopPropagation()}>
      {/* Close button + zoom controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onClose}
          title="Close magnifier"
          className="w-7 h-7 rounded-md flex items-center justify-center bg-zinc-900/80 text-white text-sm hover:bg-zinc-700"
        >
          ×
        </button>
        <span className="text-xs font-mono text-zinc-600 dark:text-zinc-300">
          {zoom.toFixed(1)}×
        </span>
        <button onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.5))}
                className="w-6 h-6 text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700">
          −
        </button>
        <button onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.5))}
                className="w-6 h-6 text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700">
          +
        </button>
      </div>

      {/* Magnified view */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-md bg-white dark:bg-zinc-800">
        <canvas
          ref={canvasRef}
          className="cursor-crosshair"
          style={{ width: VIEW_PX, height: VIEW_PX }}
        />
        <div className="px-2 py-1 text-[10px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-700">
          Scroll to zoom · drag minimap to pan
        </div>
      </div>

      {/* Minimap */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-md bg-white dark:bg-zinc-800">
        <canvas
          ref={minimapRef}
          onPointerDown={minimapPointer}
          onPointerMove={minimapPointer}
          className="cursor-move touch-none"
          style={{ width: MINIMAP_PX, height: MINIMAP_PX }}
        />
        <div className="px-2 py-1 text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-700">
          Full canvas · red rect = viewport
        </div>
      </div>
    </div>
  );
}
