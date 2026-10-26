"use client";

import { useState } from "react";
import { Canvas } from "@/components/Canvas";
import { TextPreview } from "@/components/TextPreview";
import { useFontStore } from "@/store/fontStore";
import { CHAR_SLOTS } from "@/lib/charset";
import { Pencil, Trash2, Eraser, Waves, Feather } from "lucide-react";

interface GlyphInput {
  codepoint: number;
  char: string;
  strokes: { x: number; y: number }[][];
}

export default function Editor() {
  const {
    glyphs,
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
  } = useFontStore();

  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState("gfont" as "gfont" | "ttf");
  const [previewMode, setPreviewModeState] = useState(false);

  const handleExport = async () => {
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
        body: JSON.stringify({ name: "fontku", glyphs: glyphInputs, format: exportFormat }),
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
    } catch (e) {
      console.error(e);
      alert("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const TOOLS: Array<{ label: string; key: "pen" | "hapus" | "eraser" | "halus" | "stylus"; icon: React.ReactNode }> = [
    { label: "Pen", key: "pen", icon: <Pencil size={16} /> },
    { label: "Hapus", key: "hapus", icon: <Trash2 size={16} /> },
    { label: "Eraser", key: "eraser", icon: <Eraser size={16} /> },
    { label: "Halus", key: "halus", icon: <Waves size={16} /> },
    { label: "Stylus", key: "stylus", icon: <Feather size={16} /> },
  ];

  const TOOL_COLOR: Record<string, string> = {
    pen: "bg-blue-500 text-white shadow-blue-200",
    hapus: "bg-red-500 text-white shadow-red-200",
    eraser: "bg-green-500 text-white shadow-green-200",
    halus: "bg-yellow-500 text-white shadow-yellow-200",
    stylus: "bg-purple-500 text-white shadow-purple-200",
  };

  const getToolStyle = (key: string) =>
    TOOL_COLOR[key];

  const toggleTool = (tool: "pen" | "hapus" | "eraser" | "halus" | "stylus") =>
    setActiveTool(tool);

  const togglePreviewMode = () => {
    setPreviewMode(!previewMode);
    setPreviewModeState(!previewMode);
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-900">
      <header className="flex items-center justify-between p-4 bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          FontKu - Font Trajectory Designer
        </h1>
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as "gfont" | "ttf")}
            className="text-sm border border-zinc-300 rounded-md px-2 py-1 bg-white dark:bg-zinc-800"
          >
            <option value="gfont">.gfont</option>
            <option value="ttf">.ttf</option>
          </select>
          <div className="flex items-center gap-2">
            <button
              onClick={undoLastStroke}
              disabled={undoStack.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-zinc-700 bg-white rounded-md border border-zinc-300 hover:bg-zinc-50 dark:text-zinc-100 dark:bg-zinc-700 dark:border-zinc-600 dark:hover:bg-zinc-600 disabled:opacity-50"
            >
              Undo
            </button>
            <button
              onClick={redoLastStroke}
              disabled={redoStack.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-zinc-700 bg-white rounded-md border border-zinc-300 hover:bg-zinc-50 dark:text-zinc-100 dark:bg-zinc-700 dark:border-zinc-600 dark:hover:bg-zinc-600 disabled:opacity-50"
            >
              Redo
            </button>
            <button
              onClick={togglePreviewMode}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                previewMode
                  ? "text-white bg-purple-600 hover:bg-purple-700"
                  : "text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-50 dark:text-zinc-100 dark:bg-zinc-700 dark:border-zinc-600 dark:hover:bg-zinc-600"
              }`}
            >
              {previewMode ? "Exit Preview" : "Preview"}
            </button>
            <button
              onClick={reset}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-zinc-700 bg-white rounded-md border border-zinc-300 hover:bg-zinc-50 dark:text-zinc-100 dark:bg-zinc-700 dark:border-zinc-600 dark:hover:bg-zinc-600"
            >
              Clear All
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-row flex-1 overflow-hidden min-h-0">
        {/* Tools topbar */}
        <div className="flex-1 flex items-center justify-center p-2 bg-white dark:bg-zinc-900">
          <div className="flex gap-4 flex-wrap justify-center w-full max-w-xs">
            {TOOLS.map(({ label, key, icon }) => (
              <button
                key={key}
                onClick={() => toggleTool(key)}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all shadow-sm ${getToolStyle(key)}`}
              >
                <span className="text-sm">{icon}</span>
                <span className="text-[10px] font-medium tracking-tight uppercase">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex-1 flex items-center justify-center min-w-0 min-h-0 p-4">
          <div className="relative w-full max-w-[min(500px,calc(100vh-160px))] aspect-square rounded-md shadow-sm">
            <Canvas />
            {activeCodepoint && (
              <div className="absolute top-2 left-2 px-2 py-1 text-sm font-mono bg-black/50 text-black rounded">
                {String.fromCharCode(activeCodepoint)} ({activeCodepoint})
              </div>
            )}
            {previewMode && (
              <div className="absolute top-2 right-2 px-2 py-1 text-xs font-medium text-white bg-purple-600 rounded">
                Preview Mode - Simulated Writing
              </div>
            )}
          </div>
        </div>

        {/* Character slots panel */}
        <aside className="w-64 shrink-0 overflow-y-auto p-4 bg-white dark:bg-zinc-800 border-l border-zinc-200 dark:border-zinc-700 flex flex-col gap-6">
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
                    className={`w-10 h-10 rounded-md text-sm font-medium transition-colors flex items-center justify-center ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : hasGlyph
                          ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {slot.char}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Live Preview
            </h2>
            <TextPreview />
          </div>
        </aside>
      </div>

      <footer className="p-3 text-xs text-zinc-500 dark:text-zinc-400">
        Click a character slot, draw on the canvas, then press Export .gfont or .ttf
      </footer>
    </div>
  );
}