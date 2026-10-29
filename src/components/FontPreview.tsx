"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { buildFont, penToTtfOptions, type TtfOptions } from "@/lib/ttf";
import { useFontStore } from "@/store/fontStore";

export interface GlyphInput {
  codepoint: number;
  char: string;
  strokes: { x: number; y: number }[][];
}

export interface GlyphAdjust {
  spaceBefore?: number;
  spaceAfter?: number;
  verticalOffset?: number;
  scale?: number;
}

interface RefineValues {
  spaceBefore: number;
  spaceAfter: number;
  verticalAlignment: number;
  scale: number;
  verticalGlyphOffsets?: number[];
  glyphAdjust?: Record<number, GlyphAdjust>;
}

interface FontPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  glyphs: GlyphInput[];
  refineValues: RefineValues;
  setRefineValues: React.Dispatch<React.SetStateAction<RefineValues>>;
  activeCodepoint?: number | null;
}

type Stage = "refine" | "build";

const DEFAULT_PREVIEW = "Welcome to your new font.";

const SLIDER_THUMB =
  "[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-zinc-300 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm dark:[&::-webkit-slider-thumb]:border-zinc-500 dark:[&::-webkit-slider-thumb]:bg-zinc-900 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white dark:[&::-moz-range-thumb]:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-400";

function AdjustSlider({
  label,
  value,
  min,
  max,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-4 text-[13px] text-zinc-600 dark:text-zinc-300">
        <span>{label}</span>
        <span className="min-w-10 text-right font-mono text-[11px] tabular-nums text-zinc-900 dark:text-zinc-100">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        aria-label={label}
        className={`mt-3 h-1 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 dark:bg-zinc-700 ${SLIDER_THUMB}`}
      />
    </label>
  );
}

export function FontPreview({
  isOpen,
  onClose,
  glyphs,
  refineValues,
  setRefineValues,
  activeCodepoint,
}: FontPreviewProps) {
  const { penSettings } = useFontStore();
  const [stage, setStage] = useState<Stage>("refine");
  const [selected, setSelected] = useState<number | null>(activeCodepoint ?? glyphs[0]?.codepoint ?? null);
  const [previewText, setPreviewText] = useState(DEFAULT_PREVIEW);
  const [fontUrl, setFontUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const ttfOptions = {
    ...penToTtfOptions(penSettings),
    letterSpacingMultiplier: penSettings.letterSpacingMultiplier,
    spaceBefore: refineValues.spaceBefore,
    spaceAfter: refineValues.spaceAfter,
    scale: refineValues.scale,
    verticalOffsets: refineValues.verticalGlyphOffsets,
    glyphAdjust: refineValues.glyphAdjust,
  } as TtfOptions & { glyphAdjust?: Record<number, GlyphAdjust> };

  // Rebuild only when the values that affect the font actually change
  const buildKey = JSON.stringify(ttfOptions);

  useEffect(() => {
    if (!isOpen || glyphs.length === 0) return;
    let cancelled = false;
    let loadedFont: FontFace | null = null;
    setBuilding(true);

    // Debounce so dragging a slider doesn't queue a font build per pixel
    const timer = setTimeout(async () => {
      try {
        const font = buildFont(glyphs, ttfOptions);
        const buf = new Uint8Array(font.toArrayBuffer());
        // btoa requires a binary string; chunk to avoid call stack limits
        let binary = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.length; i += CHUNK) {
          binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
        }
        const url = `data:font/ttf;base64,${btoa(binary)}`;

        loadedFont = new FontFace("FontKu", `url(${url})`);
        await loadedFont.load();
        if (cancelled) return;
        document.fonts.add(loadedFont);
        setFontUrl(url);
      } catch (e) {
        console.error("preview font build:", e);
      } finally {
        if (!cancelled) setBuilding(false);
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (loadedFont) document.fonts.delete(loadedFont);
    };
  }, [buildKey, isOpen, glyphs]);

  if (!isOpen) return null;

  const sortedGlyphs = [...glyphs].sort((a, b) => a.codepoint - b.codepoint);
  const targetCodepoint = glyphs.some((g) => g.codepoint === selected)
    ? selected
    : sortedGlyphs[0]?.codepoint ?? null;
  const target = glyphs.find((g) => g.codepoint === targetCodepoint);
  // Per-glyph adjust values; slider shows the letter's own value (0/100 default)
  const adjust = (targetCodepoint != null && refineValues.glyphAdjust?.[targetCodepoint]) || {};

  const setAdjust = (field: keyof GlyphAdjust, value: number) => {
    if (targetCodepoint == null) return;
    setRefineValues((p) => ({
      ...p,
      glyphAdjust: {
        ...p.glyphAdjust,
        [targetCodepoint]: { ...p.glyphAdjust?.[targetCodepoint], [field]: value },
      },
    }));
  };

  const fontStyle = (enabled: boolean) => ({
    fontFamily: enabled && fontUrl ? "'FontKu'" : undefined,
  });

  const handleExport = () => {
    if (!fontUrl) return;
    const a = document.createElement("a");
    a.href = fontUrl;
    a.download = "fontku.ttf";
    a.click();
  };

  const TAB: { key: "draw" | Stage; label: string }[] = [
    { key: "draw", label: "Draw" },
    { key: "refine", label: "Refine" },
    { key: "build", label: "Build" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#faf9f7] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-10 flex justify-center border-b border-zinc-200/70 bg-[#faf9f7]/85 px-6 py-4 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-950/85">
        <div
          role="tablist"
          aria-label="Font stages"
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-800 dark:bg-zinc-900"
        >
          {TAB.map(({ key, label }) => {
            const active = stage === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                aria-label={key === "draw" ? "Back to drawing" : `${label} stage`}
                onClick={() => (key === "draw" ? onClose() : setStage(key))}
                className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </header>

      {stage === "refine" ? (
        <main className="mx-auto w-full max-w-3xl px-6 pb-24 pt-14 sm:pt-20">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            Refine
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Perfect the spacing</h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            See your letters in real words. Adjust spacing, shift alignment, tweak scale.
          </p>

          {/* paper specimen */}
          <div className="mt-10 rounded-2xl border border-zinc-200/80 bg-[#fcfbf8] p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-24px_rgba(0,0,0,0.25)] dark:border-zinc-800 dark:bg-zinc-900 sm:p-12">
            {/* Letters the user actually drew, all pinned to a shared baseline.
               Space before/after and vertical offset react immediately (no font
               build round-trip) so slider moves are perceptible at once. */}
            <div className="relative">
              {/* Baseline rule: the 1em line box holds the text at 80% from
                  top (ascender 800 / total 1000), so the baseline sits 20%
                  above the bottom edge. */}
              <div
                className="absolute inset-x-0 h-px bg-zinc-300 dark:bg-zinc-600"
                aria-hidden="true"
                style={{ bottom: "20%" }}
              />
              <div className="flex items-baseline gap-0 text-[40px] leading-none text-zinc-900 sm:text-[64px]">
                {sortedGlyphs.map((g) => {
                  const a = refineValues.glyphAdjust?.[g.codepoint] ?? {};
                  // Per-glyph values only — no fallback to global refineValues,
                  // so adjusting one letter never shifts the others.
                  const sb = a.spaceBefore ?? 0;
                  const sa = a.spaceAfter ?? 0;
                  const vo = a.verticalOffset ?? 0;
                  const sc = (a.scale ?? 100) / 100;
                  return (
                    <button
                      key={g.codepoint}
                      onClick={() => setSelected(g.codepoint)}
                      aria-label={`Edit letter ${g.char}`}
                      aria-pressed={targetCodepoint === g.codepoint}
                      className={`shrink-0 cursor-pointer appearance-none border-0 bg-transparent p-0 outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900/40 ${
                        targetCodepoint === g.codepoint
                          ? "text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400"
                      }`}
                      style={{
                        ...fontStyle(fontUrl != null),
                        opacity: fontUrl ? 1 : 0.3,
                        // Match the built font: spaceBefore/After are canvas EM px,
                        // ×SCALE=2 TTF units, /1000 → 0.002em. verticalOffset same.
                        marginLeft: `${sb * 0.002}em`,
                        marginRight: `${sa * 0.002}em`,
                        transform: `translateY(${vo * -0.002}em) scale(${sc})`,
                        // Baseline sits 0.8em from the top of the 1em line box
                        // (ascender 800 / descender 200); scale around it so the
                        // letter grows from its own baseline, not the em box floor.
                        transformOrigin: "center 80%",
                        display: "inline-block",
                      }}
                    >
                      {g.char}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* adjustments for the selected letter */}
          <section className="mt-8 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 sm:p-7">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Adjustments
              </h2>
              <span className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                Letter
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  style={fontStyle(fontUrl != null)}
                >
                  {target?.char ?? "–"}
                </span>
              </span>
            </div>

            <div className="mt-6 space-y-6">
              <AdjustSlider
                label="Space before"
                value={adjust.spaceBefore ?? 0}
                min={-50}
                max={50}
                onChange={(v) => setAdjust("spaceBefore", v)}
              />
              <AdjustSlider
                label="Space after"
                value={adjust.spaceAfter ?? 0}
                min={-50}
                max={50}
                onChange={(v) => setAdjust("spaceAfter", v)}
              />
              <AdjustSlider
                label="Vertical alignment"
                value={adjust.verticalOffset ?? 0}
                min={-50}
                max={50}
                onChange={(v) => setAdjust("verticalOffset", v)}
              />
              <AdjustSlider
                label="Scale"
                value={adjust.scale ?? 100}
                min={50}
                max={150}
                unit="%"
                onChange={(v) => setAdjust("scale", v)}
              />
            </div>

            <div className="mt-8 border-t border-zinc-200/80 pt-6 dark:border-zinc-800">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Letters
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {sortedGlyphs.map((g) => {
                  const isSelected = g.codepoint === targetCodepoint;
                  const isAdjusted = !!refineValues.glyphAdjust?.[g.codepoint];
                  return (
                    <button
                      key={g.codepoint}
                      onClick={() => setSelected(g.codepoint)}
                      aria-pressed={isSelected}
                      aria-label={`Edit letter ${g.char}`}
                      className={`relative flex h-11 w-11 items-center justify-center rounded-xl border text-lg transition-colors ${
                        isSelected
                          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-500"
                      }`}
                      style={fontStyle(fontUrl != null)}
                    >
                      {g.char}
                      {isAdjusted && (
                        <span className="absolute right-1.5 top-1.5 h-1 w-1 rounded-full bg-current opacity-60" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </main>
      ) : (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-16 pt-14 sm:pt-20">
          <div className="text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Build
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Try it in your own words</h1>
          </div>

          <label htmlFor="font-preview-text" className="sr-only">
            Preview text
          </label>
          <textarea
            id="font-preview-text"
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder="Type here…"
            className="mt-12 w-full resize-none border-0 bg-transparent p-0 text-3xl leading-snug tracking-tight outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700 sm:text-4xl"
            style={{ ...fontStyle(fontUrl != null), opacity: fontUrl ? 1 : 0.35 }}
          />

          {previewText.trim() === "" && (
            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              Nothing typed yet — write a word or two and it appears in your font.
            </p>
          )}

          <div className="mt-auto flex flex-col items-center gap-3 pt-16">
            <button
              onClick={handleExport}
              disabled={!fontUrl || building}
              aria-label="Download font"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-7 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              <Download size={16} />
              {building ? "Building…" : "Download font"}
            </button>
            <p className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">fontku.ttf</p>
          </div>
        </main>
      )}
    </div>
  );
}
