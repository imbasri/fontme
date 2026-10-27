"use client";

import { useEffect, useRef, useState } from "react";
import { useFontStore, Point } from "@/store/fontStore";
import { getStroke } from "perfect-freehand";
import { getEasingFunction } from "@/lib/easings";

// 500-unit em space, y-down (y=0=atas, y=500=bawah). cap=10, xHeight=110, baseline=360, descender=475
const EM = 500;

export function Canvas({ onMouseMoveEm }: { onMouseMoveEm?: (pt: { x: number; y: number }) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const {
    activeCodepoint,
    currentStroke,
    baselineY,
    xHeight,
    capHeight,
    descenderY,
    startStroke,
    addPoint,
    endStroke,
    glyphs,
    activeTool,
    isPreviewMode,
    clearCurrentStroke,
    penSettings,
  } = useFontStore();

  const activeGlyph = activeCodepoint ? glyphs[activeCodepoint] : null;
  const strokes = activeGlyph ? activeGlyph.strokes : [];
  const liveStroke = currentStroke.length ? [currentStroke] : [];
  const previewFrame = useRef(0);

  // 500-unit em space, y-down (y=0=top, cap=10, xHeight=110, baseline=360, descender=475)
  const size = 500;

  const toEmCoord = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * EM,
      y: ((clientY - rect.top) / rect.height) * EM,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPreviewMode) return;
    if (activeTool === "hapus") {
      // Hapus: delete nearest point
      const { x, y } = toEmCoord(e.clientX, e.clientY);
      if (!activeCodepoint) return;
      const glyph = glyphs[activeCodepoint];
      if (!glyph) return;

      let minDist = Infinity;
      let targetStrokeIdx = -1;
      let targetPointIdx = -1;

      for (let i = 0; i < glyph.strokes.length; i++) {
        for (let j = 0; j < glyph.strokes[i].length; j++) {
          const dx = glyph.strokes[i][j].x - x;
          const dy = glyph.strokes[i][j].y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist && dist < 15) {
            minDist = dist;
            targetStrokeIdx = i;
            targetPointIdx = j;
          }
        }
      }

      if (targetStrokeIdx !== -1 && targetPointIdx !== -1) {
        const newStrokes = glyph.strokes.map((s, si) =>
          si === targetStrokeIdx
            ? s.filter((_, pi) => pi !== targetPointIdx)
            : s
        ).filter(s => s.length >= 2);

        useFontStore.setState({
          glyphs: {
            ...glyphs,
            [activeCodepoint]: { ...glyph, strokes: newStrokes },
          },
        });
      }
    } else if (activeTool === "eraser") {
      // Eraser: delete entire stroke whose nearest point is under cursor
      const { x, y } = toEmCoord(e.clientX, e.clientY);
      if (!activeCodepoint) return;
      const glyph = glyphs[activeCodepoint];
      if (!glyph) return;

      let targetStrokeIdx = -1;
      let minDist = Infinity;

      for (let i = 0; i < glyph.strokes.length; i++) {
        const stroke = glyph.strokes[i];
        if (stroke.length === 0) continue;
        for (let j = 0; j < stroke.length; j++) {
          const dx = stroke[j].x - x;
          const dy = stroke[j].y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist && dist < 15) {
            minDist = dist;
            targetStrokeIdx = i;
          }
        }
      }

      if (targetStrokeIdx !== -1) {
        const newStrokes = glyph.strokes.filter((_, i) => i !== targetStrokeIdx);
        useFontStore.setState({
          glyphs: {
            ...glyphs,
            [activeCodepoint]: { ...glyph, strokes: newStrokes },
          },
        });
      }
    }

    // Pen/halus/stylus: start stroke; smoothing & stylus pressure handled in addPoint
    if (activeTool === "pen" || activeTool === "halus" || activeTool === "stylus") {
      const { x, y } = toEmCoord(e.clientX, e.clientY);
      const pressure = activeTool === "stylus" ? (e.pressure || 0.5) : 0.5;
      startStroke(x, y);
      setIsDrawing(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = toEmCoord(e.clientX, e.clientY);
    onMouseMoveEm?.({ x, y });
    if (!isDrawing || isPreviewMode) return;
    if (activeTool === "hapus" || activeTool === "eraser") return;
    addPoint(x, y, e.pressure);
  };

  const onPointerUp = () => {
    if (isPreviewMode) return;
    endStroke();
    setIsDrawing(false);
  };

  // Shared grid + guideline painter
  const paintGuides = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#e5e5e5";
    ctx.lineWidth = 1;
    // Grid — only vertical/horizontal every 50
    for (let x = 0; x <= w; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y <= h; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    // 4 guideline bands: 2 at top (cap/xHeight), 2 at bottom (baseline/descender)
    const guide = (yv: number, color: string, dash: number[], label: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(0, yv); ctx.lineTo(w, yv); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = "bold 12px sans-serif";
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, 8, yv - 6);
      // Subtle right-side tick to show where the line ends
      ctx.fillRect(w - 8, yv - 1, 8, 2);
    };
    guide(capHeight,   "#10b981", [5, 5], "cap");        // y=10 top
    guide(xHeight,     "#3b82f6", [5, 5], "x-height");   // y=110 mid-top
    guide(baselineY,   "#ef4444", [8, 5], "baseline");   // y=360 mid-bottom
    guide(descenderY,  "#f59e0b", [5, 5], "descender");  // y=475 bottom

    // Top/bottom em-square boundaries so the user knows the full extent
    ctx.strokeStyle = "#a1a1aa";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, h); ctx.stroke();
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "11px sans-serif";
    ctx.fillText("0", 6, 12);
    ctx.fillText("500", 6, h - 6);
  };

  const paintStroke = (
    ctx: CanvasRenderingContext2D,
    stroke: Point[],
    color: string,
    upTo?: number
  ) => {
    const pts = upTo !== undefined ? stroke.slice(0, upTo + 1) : stroke;
    if (pts.length < 2) return;
    ctx.setLineDash([]);
    const taperStartVal: number | boolean = penSettings.taperStart === 100 ? true : penSettings.taperStart;
    const taperEndVal: number | boolean = penSettings.taperEnd === 100 ? true : penSettings.taperEnd;
    const strokeOptions = {
      size: penSettings.size,
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
      pts.map((p) => [p.x, p.y, p.pressure ?? 0.5] as [number, number, number]),
      strokeOptions
    );
    if (outlinePts.length < 3) return;

    ctx.beginPath();
    ctx.moveTo(outlinePts[0][0], outlinePts[0][1]);
    for (let i = 1; i < outlinePts.length; i++) {
      ctx.lineTo(outlinePts[i][0], outlinePts[i][1]);
    }
    ctx.closePath();

    if (penSettings.isFilled) {
      ctx.fillStyle = color;
      ctx.fill();
    }

    if (penSettings.strokeWidth > 0) {
      ctx.strokeStyle = penSettings.strokeColor;
      ctx.lineWidth = penSettings.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  };

  // Normal render
  useEffect(() => {
    if (isPreviewMode) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w = size, h = size;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintGuides(ctx, w, h);
      for (const s of strokes) paintStroke(ctx, s, penSettings.isFilled ? penSettings.fill : "transparent");
      for (const s of liveStroke) paintStroke(ctx, s, penSettings.isFilled ? penSettings.fill : "transparent");
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelled = true; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [strokes, liveStroke, isPreviewMode, baselineY, xHeight, capHeight, descenderY, size, penSettings]);

  // Preview mode: animate stroke by stroke
  useEffect(() => {
    if (!isPreviewMode) return;
    let cancelled = false;
    let frame = 0;
    const totalPoints = strokes.reduce((s, st) => s + st.length, 0);
    const totalFrames = totalPoints * 5 + 60;

    const tick = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w = size, h = size;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintGuides(ctx, w, h);

      const done = Math.min(Math.floor(frame / 5), strokes.length);
      for (let i = 0; i < done; i++) paintStroke(ctx, strokes[i], penSettings.isFilled ? penSettings.fill : "transparent");

      if (done < strokes.length) {
        const upto = Math.min((frame % 5) + 1, strokes[done].length);
        paintStroke(ctx, strokes[done], penSettings.isFilled ? penSettings.fill : "transparent", upto);
        const pen = strokes[done][upto - 1];
        if (pen) {
          ctx.fillStyle = "#3b82f6";
          ctx.beginPath(); ctx.arc(pen.x, pen.y, 6, 0, Math.PI * 2); ctx.fill();
        }
      }
      frame++;
      if (frame > totalFrames) frame = 0;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelled = true; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [strokes, isPreviewMode, baselineY, xHeight, capHeight, descenderY, size, penSettings]);

  const canvasStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
  };

  return (
    <div className="rounded-md shadow-sm">
      <canvas
        ref={canvasRef}
        className="cursor-crosshair touch-none bg-white rounded-md border border-zinc-200"
        style={canvasStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
    </div>
  );
}