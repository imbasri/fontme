import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

import { getStroke } from "perfect-freehand";

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface Glyph {
  codepoint: number;
  char: string;
  strokes: Point[][];
}

export interface PenSettings {
  size: number;
  thinning: number;
  streamline: number;
  smoothing: number;
  easing: string;
  taperStart: number;
  taperEnd: number;
  capStart: boolean;
  capEnd: boolean;
  easingStart: string;
  easingEnd: string;
  fill: string;
  strokeColor: string;
  strokeWidth: number;
  isFilled: boolean;
}

const DEFAULT_PEN_SETTINGS: PenSettings = {
  size: 8,
  thinning: 0.5,
  streamline: 0.5,
  smoothing: 0.5,
  easing: "linear",
  taperStart: 0,
  taperEnd: 0,
  capStart: true,
  capEnd: true,
  easingStart: "linear",
  easingEnd: "linear",
  fill: "#000000",
  strokeColor: "#000000",
  strokeWidth: 0,
  isFilled: true,
};

interface FontState {
  glyphs: Record<number, Glyph>;
  activeCodepoint: number | null;
  currentStroke: Point[];
  isRecording: boolean;
  baselineY: number;
  xHeight: number;
  capHeight: number;
  descenderY: number;
  penSettings: PenSettings;

  undoStack: Point[][][];
  redoStack: Point[][][];
  isPreviewMode: boolean;

  activeTool: "pen" | "hapus" | "eraser" | "halus" | "stylus";

  updatePenSettings: (updates: Partial<PenSettings>) => void;
  resetPenSettings: () => void;
  getActivePenSettings: () => PenSettings;

  startStroke: (x: number, y: number) => void;
  addPoint: (x: number, y: number, pressure?: number) => void;
  endStroke: () => void;
  selectGlyph: (codepoint: number) => void;
  setGuidelines: (baseline: number, xHeight: number, capHeight: number, descender: number) => void;
  clearCurrentStroke: () => void;
  undoLastStroke: () => void;
  redoLastStroke: () => void;
  deleteGlyph: (codepoint: number) => void;
  reset: () => void;
  setPreviewMode: (active: boolean) => void;
  setActiveTool: (tool: "pen" | "hapus" | "eraser" | "halus" | "stylus") => void;
}

const DEFAULT_GUIDELINES = {
  // 500-unit em space, y-down (y=0=atas, y=500=bawah)
  // Ideal font proportions (1000 upm): ascender≈800, cap≈700, xHeight≈500, descender≈-250
  // Mapped to canvas 500: cap≈10, xHeight≈110, descender≈475 (baseline≈360)
  // TTF mapping y' = (360 - y) * 2 → cap=700, xH=500, desc=-230
  baselineY: 360,
  xHeight: 110,
  capHeight: 10,
  descenderY: 475,
};

export const useFontStore = create<FontState>()(
  devtools(
    persist(
      (set, get) => ({
        glyphs: {},
        activeCodepoint: null,
        currentStroke: [],
        isRecording: false,
        ...DEFAULT_GUIDELINES,
        undoStack: [],
        redoStack: [],
        isPreviewMode: false,
        activeTool: "pen",
        penSettings: { ...DEFAULT_PEN_SETTINGS },

        startStroke: (x, y) => {
          set({ currentStroke: [{ x, y, pressure: 0.5 }], isRecording: true });
        },

        addPoint: (x, y, pressure) => {
          const { currentStroke, activeTool } = get();
          if (!currentStroke.length) {
            set({ currentStroke: [{ x, y, pressure: pressure ?? 0.5 }] });
            return;
          }
          const last = currentStroke[currentStroke.length - 1];
          // Skip duplicate points to keep payload small
          if (Math.abs(last.x - x) < 0.5 && Math.abs(last.y - y) < 0.5) return;
          // Smoothing: EMA blend — 0 = new point (raw), 1 = fully smoothed to last point.
          // pen → 0 (raw/responsive), halus → adaptive Atrament-style, stylus → 0.3 (light)
          let smoothAmt: number;
          if (activeTool === "halus") {
            // Atrament-style: smoothing=0.85, adaptive by distance (fast motion → less smoothing)
            const dist = Math.hypot(x - last.x, y - last.y);
            const adaptive = 0.85 + (dist - 60) / 3000;
            smoothAmt = Math.min(0.87, adaptive);
          } else if (activeTool === "stylus") {
            smoothAmt = 0.3;
          } else {
            smoothAmt = 0;
          }
          const newX = last.x + (x - last.x) * (1 - smoothAmt);
          const newY = last.y + (y - last.y) * (1 - smoothAmt);
          set({ currentStroke: [...currentStroke, { x: newX, y: newY, pressure: pressure ?? 0.5 }] });
        },

        endStroke: () => {
          const { activeCodepoint, currentStroke, glyphs, undoStack } = get();
          if (!activeCodepoint || currentStroke.length < 2) {
            set({ currentStroke: [], isRecording: false });
            return;
          }
          const char = String.fromCodePoint(activeCodepoint);
          const existing = glyphs[activeCodepoint];
          const strokes = existing ? [...existing.strokes, currentStroke] : [currentStroke];
          set({
            glyphs: {
              ...glyphs,
              [activeCodepoint]: { codepoint: activeCodepoint, char, strokes },
            },
            currentStroke: [],
            isRecording: false,
            undoStack: [...undoStack, existing ? existing.strokes : []],
            redoStack: [],
          });
        },

        selectGlyph: (codepoint) => {
          set({ activeCodepoint: codepoint, currentStroke: [], isRecording: false });
        },

        setGuidelines: (baseline, xHeight, capHeight, descender) => {
          set({ baselineY: baseline, xHeight, capHeight, descenderY: descender });
        },

        clearCurrentStroke: () => {
          set({ currentStroke: [], isRecording: false });
        },

        undoLastStroke: () => {
          const { activeCodepoint, glyphs, undoStack, redoStack } = get();
          if (!activeCodepoint || undoStack.length === 0) return;
          const prevStrokes = undoStack[undoStack.length - 1];
          const currentGlyph = glyphs[activeCodepoint];
          if (!currentGlyph) return;
          const prevStr = String.fromCodePoint(activeCodepoint);
          set({
            glyphs: {
              ...glyphs,
              [activeCodepoint]: { codepoint: activeCodepoint, char: prevStr, strokes: prevStrokes },
            },
            undoStack: undoStack.slice(0, -1),
            redoStack: [...redoStack, currentGlyph.strokes],
          });
        },

        redoLastStroke: () => {
          const { activeCodepoint, glyphs, undoStack, redoStack } = get();
          if (!activeCodepoint || redoStack.length === 0) return;
          const newStrokes = redoStack[redoStack.length - 1];
          const currentGlyph = glyphs[activeCodepoint];
          if (!currentGlyph) return;
          const curStr = String.fromCodePoint(activeCodepoint);
          set({
            glyphs: {
              ...glyphs,
              [activeCodepoint]: { codepoint: activeCodepoint, char: curStr, strokes: newStrokes },
            },
            undoStack: [...undoStack, currentGlyph.strokes],
            redoStack: redoStack.slice(0, -1),
          });
        },

        deleteGlyph: (codepoint) => {
          const { glyphs, activeCodepoint, undoStack } = get();
          const currentGlyph = glyphs[codepoint];
          if (!currentGlyph) return;
          const { [codepoint]: _, ...rest } = glyphs;
          set({
            glyphs: rest,
            activeCodepoint: activeCodepoint === codepoint ? null : activeCodepoint,
            undoStack: [...undoStack, currentGlyph.strokes],
            redoStack: [],
          });
        },

        reset: () => {
          set({ glyphs: {}, activeCodepoint: null, currentStroke: [], isRecording: false, undoStack: [], redoStack: [] });
        },

        setPreviewMode: (active: boolean) => {
          set({ isPreviewMode: active });
        },

        setActiveTool: (tool: "pen" | "hapus" | "eraser" | "halus" | "stylus") => {
          set({ activeTool: tool });
        },

        updatePenSettings: (updates) => {
          set((state) => ({ penSettings: { ...state.penSettings, ...updates } }));
        },

        resetPenSettings: () => {
          set({ penSettings: { ...DEFAULT_PEN_SETTINGS } });
        },

        getActivePenSettings: () => get().penSettings,
      }),
      {
        name: "font_ku_store",
        partialize: (state) => ({
          glyphs: state.glyphs,
          baselineY: state.baselineY,
          xHeight: state.xHeight,
          capHeight: state.capHeight,
          descenderY: state.descenderY,
          activeTool: state.activeTool,
          penSettings: state.penSettings,
        }),
      }
    )
  )
);
