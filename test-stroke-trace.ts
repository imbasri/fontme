/**
 * Self-check: stroke tracing on a simple thick horizontal line.
 * Run: npx tsx test-stroke-trace.ts
 */
import { labelComponents, traceComponent, withPressure, decimate, CELL_W_EXPORT, CELL_H_EXPORT, EM_EXPORT } from "./src/lib/template-import";
import { CELL_W_INT, CELL_H_INT } from "./src/lib/template-grid";

const w = CELL_W_INT, h = CELL_H_INT;
const mask = new Uint8Array(w * h);

// Simple thick horizontal line: y=100, x=50..200, 10px thick
for (let x = 50; x <= 200; x++) {
  for (let dy = -5; dy <= 5; dy++) {
    const y = 100 + dy;
    if (y >= 0 && y < h) mask[y * w + x] = 1;
  }
}

const inkCount = [...mask.values()].filter(v => v).length;
console.log("Ink pixels:", inkCount);

const comps = labelComponents(mask, w, h);
console.log("Components:", comps.length);
if (comps.length === 0) { console.log("FAIL: no ink"); process.exit(1); }

const largest = comps.reduce((a, b) => (a.size > b.size ? a : b));
console.log("Largest component:", largest.size);

const path = traceComponent(largest, w, h, mask);
console.log("Path length:", path.length);
if (path.length < 50) { console.log("FAIL: path too short"); process.exit(1); }

const wp = withPressure(path, largest, w, h);
const decimated = decimate(wp, 3);
console.log("Decimated points:", decimated.length);

const firstX = (decimated[0].x / EM_EXPORT) * w;
const firstY = (decimated[0].y / EM_EXPORT) * h;
const lastX = (decimated[decimated.length - 1].x / EM_EXPORT) * w;
const lastY = (decimated[decimated.length - 1].y / EM_EXPORT) * h;
console.log(`Start px: (${firstX.toFixed(0)},${firstY.toFixed(0)}) expected ~(50,100)`);
console.log(`End   px: (${lastX.toFixed(0)},${lastY.toFixed(0)}) expected ~(200,100)`);

const ok =
  Math.abs(firstX - 50) < 15 &&
  Math.abs(firstY - 100) < 15 &&
  Math.abs(lastX - 200) < 15 &&
  Math.abs(lastY - 100) < 15;
console.log(ok ? "PASS ✓" : "FAIL ✗");
process.exit(ok ? 0 : 1);