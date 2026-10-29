"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Canvas } from "@/components/Canvas";
import { Confetti } from "@/components/ui/confetti";
import { BorderBeam } from "@/components/ui/border-beam";
import { PenSettingsPanel } from "@/components/PenSettingsPanel";
import { useFontStore } from "@/store/fontStore";
import { CHAR_SLOTS } from "@/lib/charset";
import { penToTtfOptions } from "@/lib/ttf";
import { downloadTemplatePdf } from "@/lib/template-grid";
import { importTemplate } from "@/lib/template-import";
import { Eraser, Feather, Settings, Download, Upload, Search, Ruler } from "lucide-react";
import { GuidelinesInfo } from "@/components/GuidelinesInfo";
import { MagnifierPanel } from "@/components/MagnifierPanel";
import { FontPreview } from "@/components/FontPreview";
import type { GlyphAdjust } from "@/components/FontPreview";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";

interface GlyphInput {
  codepoint: number;
  char: string;
  strokes: { x: number; y: number }[][];
}

export default function Editor() {
  const {
    activeCodepoint,
    selectGlyph,
    reset,
    undoLastStroke,
    redoLastStroke,
    undoStack,
    redoStack,
    setPreviewMode,
    activeTool,
    setActiveTool,
    penSettings,
    updatePenSettings,
    getActivePenSettings,
  } = useFontStore();

  const { glyphs } = useFontStore();
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<"gfont" | "ttf">("ttf");
  const [previewMode, setPreviewModeState] = useState(false);
  const [magnifierOpen, setMagnifierOpen] = useState(false);
  const [mouseEmPos, setMouseEmPos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(3);
  const [showPenSettings, setShowPenSettings] = useState(false);
  const [showRefine, setShowRefine] = useState(false);
  const [refineValues, setRefineValues] = useState<{
    spaceBefore: number;
    spaceAfter: number;
    verticalAlignment: number;
    scale: number;
    verticalGlyphOffsets?: number[];
    glyphAdjust?: Record<number, GlyphAdjust>;
  }>({
    spaceBefore: 0,
    spaceAfter: 0,
    verticalAlignment: 0,
    scale: 100,
  });
  const [hasGlyphs, setHasGlyphs] = useState(false);

  // Memoized glyph array — stable reference so FontPreview doesn't re-build on every render
  const memoizedGlyphs = useMemo(
    () =>
      Object.values(glyphs)
        .filter(g => g.strokes.length > 0)
        .map(g => ({
          codepoint: g.codepoint,
          char: g.char,
          strokes: g.strokes,
        })),
    [glyphs]
  );
  const templateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHasGlyphs(Object.values(glyphs).some(g => g.strokes.length > 0));
  }, [glyphs]);

  const handleExport = async () => {
    if (!hasGlyphs) return;
    setExporting(true);
    try {
      const glyphInputs: GlyphInput[] =
        Object.entries(glyphs)
          .filter(([, glyph]) => glyph.strokes.length > 0)
          .map(([codepoint, glyph]) => ({
            codepoint: parseInt(codepoint, 10),
            char: String.fromCodePoint(parseInt(codepoint, 10)),
            strokes: glyph.strokes,
          }));

      const response = await fetch("/api/build-font", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "fontku",
          glyphs: glyphInputs,
          format: exportFormat,
          ttfOptions: exportFormat === "ttf" ? {
            ...penToTtfOptions(penSettings),
            letterSpacingMultiplier: penSettings.letterSpacingMultiplier,
            spaceBefore: refineValues.spaceBefore,
            spaceAfter: refineValues.spaceAfter,
            verticalOffsets: refineValues.verticalGlyphOffsets,
            scale: refineValues.scale,
            glyphAdjust: refineValues.glyphAdjust,
          } : undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        alert("Error: " + err.error);
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fontku.${exportFormat}`;
      a.click();
      window.URL.revokeObjectURL(url);

      import("canvas-confetti").then(({ default: confetti }) =>
        confetti({ particleCount: 100, spread: 100, origin: { y: 0.7 } })
      );
    } catch (e) {
      console.error(e);
      alert("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleSaveLocal = () => {
    try {
      const all = useFontStore.getState();
      localStorage.setItem("fontku_saves", JSON.stringify(all.glyphs));
      alert("Tersimpan! Buka kembali halaman ini kapan saja untuk melanjutkan.");
    } catch {
      alert("Gagal menyimpan — mungkin localStorage penuh.");
    }
  };

  const handleLoadLocal = () => {
    try {
      const raw = localStorage.getItem("fontku_saves");
      if (!raw) {
        alert("Belum ada simpanan di browser.");
        return;
      }
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") throw new Error("invalid");
      useFontStore.setState({ glyphs: saved });
      setHasGlyphs(Object.values(saved).some((g: any) => g?.strokes?.length > 0));
      alert("Simpanan dimuat.");
    } catch {
      alert("Gagal memuat simpanan.");
    }
  };

  const handleImportTemplate = async (file: File | null) => {
    if (!file) return;
    try {
      const result = await importTemplate(file);
      setHasGlyphs(result.imported > 0);
      if (result.imported === 0) {
        alert("No ink detected in any cell. Check that the template was filled with dark ink and re-scan/photograph at good contrast.");
        return;
      }
      const list = result.importedGlyphs.length > 20
        ? result.importedGlyphs.slice(0, 20).join(" ") + ` … (${result.importedGlyphs.length} total)`
        : result.importedGlyphs.join(" ");
      alert(`Imported ${result.imported}/${result.total} glyphs:\n\n${list}\n\nOpen the character slots panel to review each glyph.`);
    } catch (e) {
      alert("Import failed: template not recognized\n" + (e instanceof Error ? e.message : String(e)));
      console.error(e);
    }
  };

  const TOOLS: Array<{ label: string; key: "eraser" | "stylus"; tooltip: string; icon: React.ReactNode }> = [
    { label: "Eraser", key: "eraser", tooltip: "Delete nearest stroke under cursor", icon: <Eraser size={16} /> },
    { label: "Stylus", key: "stylus", tooltip: "Light smoothing, balanced flow", icon: <Feather size={16} /> },
  ];

  // Active tool gets strong background + border; inactive gets muted neutral
  const getToolStyle = (key: string) =>
    key === activeTool
      ? "border-2 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 shadow-md"
      : "border-2 border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500";

  const toggleTool = (tool: "eraser" | "stylus") =>
    setActiveTool(tool);

  const nextSlot = () => {
    const idx = activeCodepoint != null
      ? CHAR_SLOTS.findIndex(s => s.codepoint === activeCodepoint)
      : -1;
    const next = CHAR_SLOTS[(idx + 1 + CHAR_SLOTS.length) % CHAR_SLOTS.length];
    selectGlyph(next.codepoint);
  };

  const prevSlot = () => {
    const idx = activeCodepoint != null
      ? CHAR_SLOTS.findIndex(s => s.codepoint === activeCodepoint)
      : CHAR_SLOTS.length; // -1 from next index, so start at 0
    const prev = CHAR_SLOTS[(idx - 1 + CHAR_SLOTS.length) % CHAR_SLOTS.length];
    selectGlyph(prev.codepoint);
  };

  const togglePreviewMode = () => {
    setPreviewMode(!previewMode);
    setPreviewModeState(!previewMode);
  };

  return (
    <>
      <PenSettingsPanel isOpen={showPenSettings} onClose={() => setShowPenSettings(false)} />

      <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-900">
        {/* Navbar */}
        <header className="flex items-center justify-between p-4 bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            FontKu - Font Trajectory Designer
          </h1>
          <AnimatedThemeToggler
            variant="circle"
            duration={400}
            className="w-9 h-9 rounded-full flex items-center justify-center border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          />
        </header>

        {/* Tools topbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700 h-14">
          <div className="flex items-center gap-2">
            {TOOLS.map(({ key, icon, tooltip }) => (
              <button
                key={key}
                onClick={() => toggleTool(key)}
                title={tooltip}
                className={`w-9 h-9 rounded-lg border-2 transition-all flex items-center justify-center ${getToolStyle(key)}`}
              >
                {icon}
              </button>
            ))}
            <button
              onClick={() => setShowPenSettings(true)}
              title="Pen settings"
              className="w-9 h-9 rounded-lg border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 transition-all flex items-center justify-center"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={() => setShowRefine(true)}
              title="Perfect spacing"
              className={`w-9 h-9 rounded-lg border-2 transition-all flex items-center justify-center ${showRefine ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400" : "border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"}`}
            >
              <Ruler size={16} />
            </button>
            <GuidelinesInfo />
            <button
              onClick={() => setMagnifierOpen((v) => !v)}
              title="Magnifier"
              className={`w-9 h-9 rounded-lg border-2 transition-all flex items-center justify-center ${magnifierOpen ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400" : "border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"}`}
            >
              <Search size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={undoLastStroke}
              disabled={undoStack.length === 0}
              title="Undo"
              className="w-8 h-8 rounded-md border transition-colors text-sm font-medium text-zinc-700 dark:text-zinc-100 bg-white dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-600 disabled:opacity-40 flex items-center justify-center"
            >
              ↩
            </button>
            <button
              onClick={redoLastStroke}
              disabled={redoStack.length === 0}
              title="Redo"
              className="w-8 h-8 rounded-md border transition-colors text-sm font-medium text-zinc-700 dark:text-zinc-100 bg-white dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-600 disabled:opacity-40 flex items-center justify-center"
            >
              ↪
            </button>
            <button
              onClick={togglePreviewMode}
              title="Preview"
              className={`w-8 h-8 rounded-md border transition-colors text-sm font-medium ${previewMode ? "border-purple-500 bg-purple-600 text-white" : "border-zinc-300 bg-white dark:bg-zinc-700 text-zinc-700 dark:text-zinc-100 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-600 flex items-center justify-center"}`}
            >
              {previewMode ? "✖" : "👁"}
            </button>
            <button
              onClick={reset}
              title="Clear all"
              className="w-8 h-8 rounded-md border transition-colors text-sm font-medium text-zinc-700 dark:text-zinc-100 bg-white dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-600 flex items-center justify-center"
            >
              ✕
            </button>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as "gfont" | "ttf")}
              className="text-sm border border-zinc-300 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-800"
            >
              <option value="gfont">.gfont</option>
              <option value="ttf">.ttf</option>
            </select>
            <button
              onClick={handleExport}
              disabled={!hasGlyphs || exporting}
              title="Export"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 bg-blue-600 text-white border-blue-600 hover:bg-blue-500 hover:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
            >
              <Download size={16} />
              <span className="tracking-tight">{exporting ? "Exporting..." : `Export`}</span>
            </button>
            <button
              onClick={handleSaveLocal}
              title="Save to browser"
              className="w-8 h-8 rounded-md border transition-colors text-sm font-medium text-zinc-700 dark:text-zinc-100 bg-white dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-600 flex items-center justify-center"
            >
              💾
            </button>
            <button
              onClick={handleLoadLocal}
              title="Load from browser"
              className="w-8 h-8 rounded-md border transition-colors text-sm font-medium text-zinc-700 dark:text-zinc-100 bg-white dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-600 flex items-center justify-center"
            >
              📂
            </button>
            <input
              ref={templateInputRef}
              type="file"
              accept="image/png,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => handleImportTemplate(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => templateInputRef.current?.click()}
              title="Import"
              className="w-8 h-8 rounded-md border transition-colors text-sm font-medium text-zinc-700 dark:text-zinc-100 bg-white dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-600 flex items-center justify-center"
            >
              <Upload size={14} />
            </button>
            <button
              onClick={() => downloadTemplatePdf()}
              title="Template"
              className="w-8 h-8 rounded-md border transition-colors text-sm font-medium text-zinc-700 dark:text-zinc-100 bg-white dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-600 flex items-center justify-center"
            >
              <Download size={14} />
            </button>
          </div>
        </div>

        {/* Main area: canvas + character slots */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Canvas area */}
          <div className="flex-1 flex flex-col items-center justify-center min-w-0 min-h-0 p-6 gap-3">
            {/* Prev / Next slot nav */}
            <div className="flex items-center gap-3">
              <button
                onClick={prevSlot}
                title="Previous slot"
                className="w-9 h-9 rounded-lg flex items-center justify-center border-2 border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-lg font-medium"
              >
                ←
              </button>
              <span className="text-sm font-mono text-zinc-500 dark:text-zinc-400 min-w-[80px] text-center">
                {activeCodepoint != null ? `${String.fromCharCode(activeCodepoint)} (${activeCodepoint})` : "—"}
              </span>
              <button
                onClick={nextSlot}
                title="Next slot"
                className="w-9 h-9 rounded-lg flex items-center justify-center border-2 border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-lg font-medium"
              >
                →
              </button>
            </div>
            <div className="relative w-full max-w-[min(600px,calc(100vh-240px))] aspect-square rounded-md shadow-sm">
              <BorderBeam size={50} colorFrom="#10b981" colorTo="#3b82f6" borderWidth={2} />
              <Canvas onMouseMoveEm={setMouseEmPos} />
              {activeCodepoint && (
                <div className="absolute top-3 left-3 px-2.5 py-1.5 text-sm font-mono bg-black/50 text-white rounded">
                  {String.fromCharCode(activeCodepoint)} ({activeCodepoint})
                </div>
              )}
              {previewMode && (
                <div className="absolute top-3 right-3 px-2.5 py-1.5 text-xs font-medium text-white bg-purple-600 rounded">
                  Preview Mode - Simulated Writing
                </div>
              )}
            </div>
          </div>

          {/* Magnifier Panel */}
          {magnifierOpen && (
            <MagnifierPanel
              position={mouseEmPos ?? { x: 250, y: 250 }}
              zoom={zoom}
              setZoom={setZoom}
              onClose={() => setMagnifierOpen(false)}
            />
          )}

        {showRefine && hasGlyphs && (
          <FontPreview
            isOpen={showRefine}
            onClose={() => setShowRefine(false)}
            glyphs={memoizedGlyphs}
            refineValues={refineValues}
            setRefineValues={setRefineValues}
            activeCodepoint={activeCodepoint}
          />
        )}

        {/* Character slots panel */}
          <aside className="w-80 shrink-0 overflow-y-auto p-4 bg-white dark:bg-zinc-800 border-l border-zinc-200 dark:border-zinc-700 flex flex-col gap-6">
            <div>
              <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Character Slots
              </h2>
              <div className="grid grid-cols-5 gap-1">
                {CHAR_SLOTS.map(slot => {
                  const hasGlyph = !!glyphs[slot.codepoint] && glyphs[slot.codepoint].strokes.some(s => s.length >= 2);
                  const isActive = activeCodepoint === slot.codepoint;
                  return (
                    <button
                      key={slot.codepoint}
                      onClick={() => selectGlyph(slot.codepoint)}
                      className={`w-10 h-10 rounded-md text-sm font-medium transition-colors flex items-center justify-center relative ${
                        isActive
                          ? "bg-blue-600 text-white ring-2 ring-blue-400"
                          : hasGlyph
                            ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-600 ring-1 ring-green-400"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {slot.char}
                      {hasGlyph && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full border border-white dark:border-zinc-900" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

          </aside>
        </div>

        <footer className="p-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 text-center border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
          Click a character slot, draw on the canvas, then press Export .gfont or .ttf
        </footer>
      </div>
    </>
  );
}
