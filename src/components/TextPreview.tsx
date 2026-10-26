"use client";

import { useFontStore } from "@/store/fontStore";
import { useEffect, useRef } from "react";

const EM = 500;

export function TextPreview() {
  const { glyphs, activeCodepoint } = useFontStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = 280;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const glyph = activeCodepoint ? glyphs[activeCodepoint] : null;

    if (glyph && glyph.strokes.length) {
      // Bounding box of all strokes, to center and fit
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const stroke of glyph.strokes) {
        for (const p of stroke) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      }
      const glyphW = maxX - minX;
      const glyphH = maxY - minY;
      const fitScale = Math.min((w - 40) / glyphW, (h - 40) / glyphH, 1);
      const offsetX = (w - glyphW * fitScale) / 2 - minX * fitScale;
      const offsetY = (h - glyphH * fitScale) / 2 - minY * fitScale;

      for (const stroke of glyph.strokes) {
        if (stroke.length < 2) continue;
        ctx.strokeStyle = "#1f2937";
        ctx.lineWidth = 3 * fitScale; // same relative weight as canvas (3 em units)
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(offsetX + stroke[0].x * fitScale, offsetY + stroke[0].y * fitScale);
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo(offsetX + stroke[i].x * fitScale, offsetY + stroke[i].y * fitScale);
        }
        ctx.stroke();
      }
    } else {
      // No glyph drawn yet — placeholder box
      ctx.strokeStyle = "#e5e5e5";
      ctx.lineWidth = 1;
      ctx.strokeRect(20, 20, w - 40, h - 40);
    }
  }, [glyphs, activeCodepoint]);

  return (
    <div className="w-full" ref={containerRef}>
      <div className="mt-2 rounded-md shadow-sm">
        <canvas ref={canvasRef} className="block w-full bg-white rounded-md border border-zinc-200" style={{ height: 280 }} />
      </div>
    </div>
  );
}
