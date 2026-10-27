"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

// Canvas em space is 500 units, y-down (y=0 = top of cell).
const GUIDELINES = [
  {
    name: "Cap Height",
    y: 10,
    color: "#10b981",
    desc: "Top of capital letters (A–Z).",
  },
  {
    name: "x-Height",
    y: 110,
    color: "#3b82f6",
    desc: "Top of lowercase round letters (a, c, e).",
  },
  {
    name: "Baseline",
    y: 360,
    color: "#ef4444",
    desc: "Where letters sit. Keep strokes on this line.",
  },
  {
    name: "Descender",
    y: 475,
    color: "#f59e0b",
    desc: "Bottom of letters with stems (g, j, p).",
  },
];

export function GuidelinesInfo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        title="Guidelines"
        className="flex items-center justify-center w-8 h-8 rounded-lg border-2 border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
      >
        <Info size={16} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Guidelines"
          className="absolute z-50 top-full right-0 mt-2 w-64 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg p-3 space-y-2"
        >
          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">
            Guidelines
          </p>
          {GUIDELINES.map((g) => (
            <div key={g.name} className="flex items-start gap-2 text-xs">
              <span
                className="mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: g.color }}
                aria-hidden
              />
              <div className="leading-tight">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {g.name}
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {" "}
                  (y={g.y}) — {g.desc}
                </span>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 pt-1 border-t border-zinc-100 dark:border-zinc-700">
            500-unit em space, y-down.
          </p>
        </div>
      )}
    </div>
  );
}