"use client";

import { useEffect, useRef, useState } from "react";
import { useFontStore, Point } from "@/store/fontStore";
import { getStroke } from "perfect-freehand";
import { getEasingFunction } from "@/lib/easings";

const EM = 500;
const VIEW_PX = 180;     // magnified view size
const MINIMAP_PX = 120;  // minimap size
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
  const minimapRef = useRef<HTMLCanvasElement>(null);

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

  // Minimap
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

    // Strokes
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
    const viewX = Math.max(0, Math.min(EM - viewW_em, position.x - viewW_em / 2));
    const viewY = Math.max(0, Math.min(EM - viewW_em, position.y - viewW_em / 2));
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(s(viewX), s(viewY), s(viewW_em), s(viewW_em));
    ctx.fillStyle = "rgba(239,68,68,0.08)";
    ctx.fillRect(s(viewX), s(viewY), s(viewW_em), s(viewW_em));

    // Crosshair at mouse position
    ctx.strokeStyle = "rgba(239,68,68,0.9)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(s(position.x) - 8, s(position.y)); ctx.lineTo(s(position.x) + 8, s(position.y));
    ctx.moveTo(s(position.x), s(position.y) - 8); ctx.lineTo(s(position.x), s(position.y) + 8);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [strokes, liveStroke, zoom, position, capHeight, xHeight, baselineY, descenderY]);

  return (
    <div
      className="w-[330px] shrink-0 flex flex-col gap-2 z-40 pointer-events-auto bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xl p-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onClose}
          title="Close magnifier"
          className="w-7 h-7 rounded-md flex items-center justify-center bg-zinc-900/80 text-white text-sm hover:bg-zinc-700"
        >
          ×
        </button>
        <span className="text-xs font-mono text-zinc-600 dark:text-zinc-300 flex-1 text-center">
          {zoom.toFixed(1)}×
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.5))}
            className="w-6 h-6 text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            title="Zoom out"
          >
            −
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.5))}
            className="w-6 h-6 text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {/* Magnified view */}
      <div className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-md bg-white dark:bg-zinc-800 relative">
        <canvas
          ref={viewRef}
          className="cursor-crosshair"
          style={{ width: VIEW_PX, height: VIEW_PX }}
        />
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-700">
          Scroll to zoom · follows mouse
        </div>
      </div>

      {/* Minimap */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-md bg-white dark:bg-zinc-800">
        <canvas
          ref={minimapRef}
          className="cursor-move touch-none"
          style={{ width: MINIMAP_PX, height: MINIMAP_PX }}
        />
        <div className="px-2 py-1 text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-700">
          Full canvas · red rect = viewport · red crosshair = mouse
        </div>
      </div>
    </div>
  );
}