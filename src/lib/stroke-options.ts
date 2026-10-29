import type { StrokeOptions, StrokePoint } from "perfect-freehand";
import { getEasingFunction } from "./easings";

/** Every pen-settings field that affects stroke shape (fontStore.PenSettings fits). */
export interface PenLike {
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
  /** Velocity-based pressure simulation; false = use the recorded pressure. */
  simulatePressure?: boolean;
}

/** Perfect-freehand: taper 100 (slider max) means "taper the whole stroke". */
export const taperToOption = (t: number | boolean): number | boolean => (t === 100 ? true : t);

/** Single source of truth for pen settings → perfect-freehand options.
 *  Used by the editor canvas, magnifier, template sheet and TTF export alike. */
export function buildStrokeOptions(
  ps: PenLike,
  overrides: { simulatePressure?: boolean } = {},
): StrokeOptions {
  return {
    size: ps.size,
    thinning: ps.thinning,
    streamline: ps.streamline,
    smoothing: ps.smoothing,
    easing: getEasingFunction(ps.easing),
    simulatePressure: overrides.simulatePressure ?? ps.simulatePressure ?? true,
    start: { cap: ps.capStart, taper: taperToOption(ps.taperStart), easing: getEasingFunction(ps.easingStart) },
    end: { cap: ps.capEnd, taper: taperToOption(ps.taperEnd), easing: getEasingFunction(ps.easingEnd) },
    last: true,
  };
}

const RATE_OF_PRESSURE_CHANGE = 0.275;

/** Copies perfect-freehand's internal simulatePressure(prev, distance, size).
 *  Re-check against getStrokeOutlinePoints on library upgrade. */
const simulate = (prev: number, distance: number, size: number) => {
  const sp = Math.min(1, distance / size);
  return Math.min(1, prev + (Math.min(1, 1 - sp) - prev) * (sp * RATE_OF_PRESSURE_CHANGE));
};

/** Effective per-point pressure for a stroke, mirroring the library's own
 *  velocity simulation (first point defaults to 0.25) so the TTF export can
 *  reuse the canvas pressure profile. Index-aligned with getStrokePoints(). */
export function simulatedPressures(
  pts: StrokePoint[],
  opts: StrokeOptions,
): number[] {
  const size = opts.size ?? 16;
  if (pts.length === 0) return [];
  // computeInitialPressure: average the first ~10 simulated pressures to avoid fat starts.
  let prev = pts.slice(0, 10).reduce((acc, p) => (acc + simulate(acc, p.distance, size)) / 2, pts[0].pressure);
  return pts.map((p) => (prev = simulate(prev, p.distance, size)));
}
