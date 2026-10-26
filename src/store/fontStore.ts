import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export interface Point {
  x: number;
  y: number;
}

export interface Glyph {
  codepoint: number;
  char: string;
  strokes: Point[][];
}

interface FontState {
  glyphs: Record<number, Glyph>;
  activeCodepoint: number | null;
  currentStroke: Point[];
  isRecording: boolean;
  baselineY: number;
  xHeight: number;
  capHeight: number;
  descenderY: number;

  undoStack: Point[][][];
  redoStack: Point[][][];
  isPreviewMode: boolean;

  startStroke: (x: number, y: number) => void;
  addPoint: (x: number, y: number) => void;
  endStroke: () => void;
  selectGlyph: (codepoint: number) => void;
  setGuidelines: (baseline: number, xHeight: number, capHeight: number, descender: number) => void;
  clearCurrentStroke: () => void;
  undoLastStroke: () => void;
  redoLastStroke: () => void;
  deleteGlyph: (codepoint: number) => void;
  reset: () => void;
  setPreviewMode: (active: boolean) => void;
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

        startStroke: (x, y) => {
          set({ currentStroke: [{ x, y }], isRecording: true });
        },

        addPoint: (x, y) => {
          const { currentStroke } = get();
          if (!currentStroke.length) return;
          const last = currentStroke[currentStroke.length - 1];
          // Skip duplicate points to keep payload small
          if (Math.abs(last.x - x) < 0.5 && Math.abs(last.y - y) < 0.5) return;
          set({ currentStroke: [...currentStroke, { x, y }] });
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
      }),
      {
        name: "font_ku_store",
        partialize: (state) => ({
          glyphs: state.glyphs,
          baselineY: state.baselineY,
          xHeight: state.xHeight,
          capHeight: state.capHeight,
          descenderY: state.descenderY,
        }),
      }
    )
  )
);