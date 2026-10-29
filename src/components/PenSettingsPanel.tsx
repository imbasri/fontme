"use client";

import { useFontStore } from "@/store/fontStore";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASING_KEYS } from "@/lib/easings";

interface PenSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const EASING_OPTIONS = EASING_KEYS.map((value) => ({ value, label: value }));

export function PenSettingsPanel({ isOpen, onClose }: PenSettingsPanelProps) {
  const { penSettings, updatePenSettings } = useFontStore();

  const section = (label: string, children: React.ReactNode, hint?: string) => (
    <div>
      <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">{label}</label>
      <div className="space-y-3">{children}</div>
      {hint && <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</p>}
    </div>
  );

  const slider = (name: string, min: number, max: number, step: number, value: number, onChange: (v: number) => void, format?: (v: number) => string) => (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-medium text-zinc-700 dark:text-zinc-200">
        <span>{name}</span>
        <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => {}}
        className="w-full h-2 appearance-none bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer accent-blue-600 dark:accent-blue-400 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-zinc-300 [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-zinc-300"
      />
    </div>
  );

  const select = (name: string, value: string, options: { value: string; label: string }[], onChange: (v: string) => void) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{name}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-zinc-300 dark:border-zinc-600 rounded-md px-3 py-2 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );

  const toggle = (name: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer">
      <span>{name}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-blue-600 dark:accent-blue-400 cursor-pointer"
      />
    </label>
  );

  const colorPicker = (label: string, value: string, onChange: (v: string) => void) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{label}</label>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 rounded-md border border-zinc-300 dark:border-zinc-600 p-1 cursor-pointer bg-transparent"
      />
    </div>
  );

  if (!isOpen) return null;

  return (
    <aside className={cn(
      "fixed inset-y-0 left-0 z-40 w-72 bg-white dark:bg-zinc-800 border-r border-zinc-200 dark:border-zinc-700 flex flex-col transition-transform duration-200 ease-out",
      isOpen ? "translate-x-0" : "-translate-x-full"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Pen Settings</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400"
          aria-label="Close settings"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {section("Stroke",
          <>
            {slider("Stroke size", 1, 40, 1, penSettings.size, (v) => updatePenSettings({ size: Math.round(v) }))}
            {slider("Thinning", -1, 1, 0.01, penSettings.thinning, (v) => updatePenSettings({ thinning: v }), (v) => v.toFixed(2))}
            {slider("Smoothing", 0.01, 0.99, 0.01, penSettings.smoothing, (v) => updatePenSettings({ smoothing: v }), (v) => v.toFixed(2))}
          </>,
          "Thinning uses the pressure recorded while drawing"
        )}

        {section("Ink",
          colorPicker("Color", penSettings.fill, (v) => updatePenSettings({ fill: v, strokeColor: v }))
        )}

        <details className="group border-t border-zinc-200 dark:border-zinc-700 pt-4">
          <summary className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
            Advanced
            <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-4 space-y-5">
            {section("Streamline",
              slider("Streamline", 0, 0.99, 0.01, penSettings.streamline, (v) => updatePenSettings({ streamline: v }), (v) => v.toFixed(2))
            )}

            {section("Taper",
              <>
                {slider("Taper start", 0, 100, 1, penSettings.taperStart, (v) => updatePenSettings({ taperStart: v }))}
                {slider("Taper end", 0, 100, 1, penSettings.taperEnd, (v) => updatePenSettings({ taperEnd: v }))}
              </>,
              "100 = taper the whole stroke"
            )}

            {section("Caps",
              <>
                {toggle("Round cap start", penSettings.capStart, (v) => updatePenSettings({ capStart: v }))}
                {toggle("Round cap end", penSettings.capEnd, (v) => updatePenSettings({ capEnd: v }))}
              </>
            )}

            {section("Pressure",
              <>
                {select("Easing", penSettings.easing, EASING_OPTIONS, (v) => updatePenSettings({ easing: v }))}
                {toggle("Simulate from speed", penSettings.simulatePressure, (v) => updatePenSettings({ simulatePressure: v }))}
                {select("Taper start easing", penSettings.easingStart, [{ value: "", label: "Default" }, ...EASING_OPTIONS], (v) => updatePenSettings({ easingStart: v }))}
                {select("Taper end easing", penSettings.easingEnd, [{ value: "", label: "Default" }, ...EASING_OPTIONS], (v) => updatePenSettings({ easingEnd: v }))}
              </>,
              "Off = use the pressure recorded while drawing"
            )}

            {section("Letter spacing",
              slider("Spacing", 0.5, 2, 0.05, penSettings.letterSpacingMultiplier, (v) => updatePenSettings({ letterSpacingMultiplier: v }), (v) => v.toFixed(2))
            )}
          </div>
        </details>
      </div>

      {/* Overlay backdrop for mobile */}
      <div
        className="fixed inset-0 bg-black/30 dark:bg-black/50 z-[-1] lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
    </aside>
  );
}
