"use client";

import { useFontStore } from "@/store/fontStore";
import { EASING_KEYS } from "@/lib/easings";
import { X } from "lucide-react";

interface PenSettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function PenSettingsPanel({ open, onClose }: PenSettingsPanelProps) {
  const { penSettings, updatePenSettings, resetPenSettings } = useFontStore();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/30 dark:bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Pen Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(100vh-120px)]">
          {/* Stroke Settings */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
                Size
              </label>
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={penSettings.size}
                onChange={(e) => updatePenSettings({ size: parseInt(e.target.value, 10) })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                <span>1</span>
                <span>{penSettings.size}</span>
                <span>100</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
                Thinning
              </label>
              <input
                type="range"
                min={-0.99}
                max={0.99}
                step={0.01}
                value={penSettings.thinning}
                onChange={(e) => updatePenSettings({ thinning: parseFloat(e.target.value) })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                <span>-0.99</span>
                <span>{penSettings.thinning.toFixed(2)}</span>
                <span>0.99</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
                Streamline
              </label>
              <input
                type="range"
                min={0.01}
                max={0.99}
                step={0.01}
                value={penSettings.streamline}
                onChange={(e) => updatePenSettings({ streamline: parseFloat(e.target.value) })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                <span>0.01</span>
                <span>{penSettings.streamline.toFixed(2)}</span>
                <span>0.99</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
                Smoothing
              </label>
              <input
                type="range"
                min={0.01}
                max={0.99}
                step={0.01}
                value={penSettings.smoothing}
                onChange={(e) => updatePenSettings({ smoothing: parseFloat(e.target.value) })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                <span>0.01</span>
                <span>{penSettings.smoothing.toFixed(2)}</span>
                <span>0.99</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
                Easing
              </label>
              <select
                value={penSettings.easing}
                onChange={(e) => updatePenSettings({ easing: e.target.value })}
                className="w-full text-sm border border-zinc-300 dark:border-zinc-600 rounded-md px-3 py-1.5 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
              >
                {EASING_KEYS.map((key) => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Start Settings */}
          <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-700 space-y-4">
            <h3 className="text-xs font-medium text-zinc-700 dark:text-zinc-200">Start</h3>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
                Taper Start
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={penSettings.taperStart}
                onChange={(e) => updatePenSettings({ taperStart: parseInt(e.target.value, 10) })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                <span>0</span>
                <span>{penSettings.taperStart}</span>
                <span>100</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-700 dark:text-zinc-200">Cap Start</label>
              <input
                type="checkbox"
                checked={penSettings.capStart}
                onChange={(e) => updatePenSettings({ capStart: e.target.checked })}
                disabled={penSettings.taperStart > 0}
                className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-600 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed"
              />
            </div>

            {penSettings.taperStart > 0 && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
                  Easing Start
                </label>
                <select
                  value={penSettings.easingStart}
                  onChange={(e) => updatePenSettings({ easingStart: e.target.value })}
                  className="w-full text-sm border border-zinc-300 dark:border-zinc-600 rounded-md px-3 py-1.5 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                >
                  {EASING_KEYS.map((key) => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* End Settings */}
          <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-700 space-y-4">
            <h3 className="text-xs font-medium text-zinc-700 dark:text-zinc-200">End</h3>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
                Taper End
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={penSettings.taperEnd}
                onChange={(e) => updatePenSettings({ taperEnd: parseInt(e.target.value, 10) })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                <span>0</span>
                <span>{penSettings.taperEnd}</span>
                <span>100</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-700 dark:text-zinc-200">Cap End</label>
              <input
                type="checkbox"
                checked={penSettings.capEnd}
                onChange={(e) => updatePenSettings({ capEnd: e.target.checked })}
                disabled={penSettings.taperEnd > 0}
                className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-600 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed"
              />
            </div>

            {penSettings.taperEnd > 0 && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
                  Easing End
                </label>
                <select
                  value={penSettings.easingEnd}
                  onChange={(e) => updatePenSettings({ easingEnd: e.target.value })}
                  className="w-full text-sm border border-zinc-300 dark:border-zinc-600 rounded-md px-3 py-1.5 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                >
                  {EASING_KEYS.map((key) => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Fill Settings */}
          <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-700 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-700 dark:text-zinc-200">Fill</label>
              <input
                type="checkbox"
                checked={penSettings.isFilled}
                onChange={(e) => updatePenSettings({ isFilled: e.target.checked })}
                className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-600 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
                Fill Color
              </label>
              <input
                type="color"
                value={penSettings.fill}
                onChange={(e) => updatePenSettings({ fill: e.target.value })}
                className="w-full h-10 rounded-md border border-zinc-300 dark:border-zinc-600 p-1 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
                Stroke Width
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={penSettings.strokeWidth}
                onChange={(e) => updatePenSettings({ strokeWidth: parseInt(e.target.value, 10) })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                <span>0</span>
                <span>{penSettings.strokeWidth}</span>
                <span>100</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
                Stroke Color
              </label>
              <input
                type="color"
                value={penSettings.strokeColor}
                onChange={(e) => updatePenSettings({ strokeColor: e.target.value })}
                className="w-full h-10 rounded-md border border-zinc-300 dark:border-zinc-600 p-1 cursor-pointer"
              />
            </div>
          </div>

          {/* Reset button */}
          <button
            onClick={resetPenSettings}
            className="w-full mt-6 px-4 py-2 text-sm font-medium text-center text-zinc-700 dark:text-zinc-100 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-600"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}