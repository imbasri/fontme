"use client";

import { useFontStore } from "@/store/fontStore";
import { EASING_KEYS, getEasingFunction } from "@/lib/easings";
import { X, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PenSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PenSettingsPanel({ isOpen, onClose }: PenSettingsPanelProps) {
  const { penSettings, updatePenSettings, resetPenSettings } = useFontStore();

  const slider = (name: string, min: number, max: number, step: number, value: number, onChange: (v: number) => void, format?: (v: number) => string) => (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-medium text-zinc-700 dark:text-zinc-200">
        <span>{name}</span>
        <span className="font-mono text-blue-600 dark:text-blue-400">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => resetPenSettings()}
        className="w-full h-2 appearance-none bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer accent-blue-600 dark:accent-blue-400 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-zinc-300 [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-zinc-300"
      />
    </div>
  );

  const selectEasing = (label: string, value: string, onChange: (v: string) => void) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-zinc-300 dark:border-zinc-600 rounded-md px-3 py-1.5 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 cursor-pointer"
      >
        {EASING_KEYS.map((key) => (
          <option key={key} value={key}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</option>
        ))}
      </select>
    </div>
  );

  const checkbox = (label: string, checked: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <label className={cn("flex items-center justify-between text-xs", disabled && "opacity-50 cursor-not-allowed")}>
      <span className="text-zinc-700 dark:text-zinc-200">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 accent-blue-600 dark:accent-blue-400 disabled:cursor-not-allowed"
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

  const section = (title: string, children: React.ReactNode) => (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{title}</h3>
      <div className="space-y-4 pt-2 border-t border-zinc-200 dark:border-zinc-700">{children}</div>
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
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Stroke Settings */}
        <section title="Stroke">
          <div className="space-y-4">
            {slider("Size", 1, 100, 1, penSettings.size, (v) => updatePenSettings({ size: Math.round(v) }))}
            {slider("Thinning", -0.99, 0.99, 0.01, penSettings.thinning, (v) => updatePenSettings({ thinning: v }), (v) => v.toFixed(2))}
            {slider("Streamline", 0.01, 0.99, 0.01, penSettings.streamline, (v) => updatePenSettings({ streamline: v }), (v) => v.toFixed(2))}
            {slider("Smoothing", 0.01, 0.99, 0.01, penSettings.smoothing, (v) => updatePenSettings({ smoothing: v }), (v) => v.toFixed(2))}
            {selectEasing("Easing", penSettings.easing, (v) => updatePenSettings({ easing: v }))}
          </div>
        </section>

        {/* Start Settings */}
        <section title="Start">
          <div className="space-y-4">
            {slider("Taper", 0, 100, 1, penSettings.taperStart, (v) => updatePenSettings({ taperStart: Math.round(v) }))}
            {checkbox("Cap", penSettings.capStart, (v) => updatePenSettings({ capStart: v }), penSettings.taperStart > 0)}
            {penSettings.taperStart > 0 && selectEasing("Easing", penSettings.easingStart, (v) => updatePenSettings({ easingStart: v }))}
          </div>
        </section>

        {/* End Settings */}
        <section title="End">
          <div className="space-y-4">
            {slider("Taper", 0, 100, 1, penSettings.taperEnd, (v) => updatePenSettings({ taperEnd: Math.round(v) }))}
            {checkbox("Cap", penSettings.capEnd, (v) => updatePenSettings({ capEnd: v }), penSettings.taperEnd > 0)}
            {penSettings.taperEnd > 0 && selectEasing("Easing", penSettings.easingEnd, (v) => updatePenSettings({ easingEnd: v }))}
          </div>
        </section>

        {/* Fill / Stroke Settings */}
        <section title="Fill & Stroke">
          <div className="space-y-4">
            {checkbox("Fill", penSettings.isFilled, (v) => updatePenSettings({ isFilled: v }))}
            {penSettings.isFilled && colorPicker("Fill Color", penSettings.fill, (v) => updatePenSettings({ fill: v }))}
            {slider("Stroke Width", 0, 100, 1, penSettings.strokeWidth, (v) => updatePenSettings({ strokeWidth: Math.round(v) }))}
            {colorPicker("Stroke Color", penSettings.strokeColor, (v) => updatePenSettings({ strokeColor: v }))}
          </div>
        </section>

        {/* Reset */}
        <button
          onClick={resetPenSettings}
          className="w-full px-4 py-2.5 text-sm font-medium text-center text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-600 transition-colors"
        >
          Reset to Defaults
        </button>
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