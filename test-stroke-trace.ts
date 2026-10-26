/**
 * Self-check: stroke tracing pipeline.
 * Run: npx tsx test-stroke-trace.ts
 */
import { labelComponents, traceComponent, withPressure, decimate, EM_EXPORT } from "./src/lib/template-import";
import { CELL_W_INT, CELL_H_INT } from "./src/lib/template-grid";

function test(label: string, mask: Uint8Array, w: number, h: number): boolean {
  const comps = labelComponents(mask, w, h);
  console.log(`\n[${label}] Components:`, comps.length);

  let allOk = true;
  for (let i = 0; i < comps.length; i++) {
    const comp = comps[i];
    const path = traceComponent(comp, w, h, mask);
    const decimated = decimate(withPressure(path, comp, w, h), 3);
    const first = decimated[0];
    const last = decimated[decimated.length - 1];
    console.log(
      `  Stroke ${i + 1}: path=${path.length}, pts=${decimated.length}, start=(${(first.x / EM_EXPORT) * w | 0},${(first.y / EM_EXPORT) * h | 0}), end=(${(last.x / EM_EXPORT) * w | 0},${(last.y / EM_EXPORT) * h | 0})`
    );
    if (path.length < 10) { console.log(`  FAIL: stroke ${i + 1} too short`); allOk = false; }
  }
  return allOk;
}

const w = CELL_W_INT, h = CELL_H_INT;

// Test 1: thick horizontal line
{
  const mask = new Uint8Array(w * h);
  for (let x = 50; x <= 200; x++)
    for (let dy = -5; dy <= 5; dy++) {
      const y = 100 + dy;
      if (y >= 0 && y < h) mask[y * w + x] = 1;
    }
  if (!test("thick line", mask, w, h)) process.exit(1);
}

// Test 2: two separate strokes (an "X" shape — 2 crossing strokes)
{
  const mask = new Uint8Array(w * h);
  // Stroke 1: top-left to bottom-right diagonal, 5px thick
  for (let t = 0; t <= 1; t += 0.005) {
    const cx = Math.round(40 + t * 180);
    const cy = Math.round(40 + t * 200);
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++) {
        const px = cx + dx, py = cy + dy;
        if (px >= 0 && py >= 0 && px < w && py < h) mask[py * w + px] = 1;
      }
  }
  // Stroke 2: top-right to bottom-left diagonal, 5px thick
  for (let t = 0; t <= 1; t += 0.005) {
    const cx = Math.round(220 - t * 180);
    const cy = Math.round(40 + t * 200);
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++) {
        const px = cx + dx, py = cy + dy;
        if (px >= 0 && py >= 0 && px < w && py < h) mask[py * w + px] = 1;
      }
  }
  const ok = test("X (2 crossing strokes)", mask, w, h);
  // X should produce exactly 1 component (crossing joins them) — or 2 if they don't overlap
  const comps = labelComponents(mask, w, h);
  console.log(`  Expected 1–2 components, got ${comps.length}`);
  if (!ok) process.exit(1);
}

// Test 3: two fully separate strokes (parallel lines)
{
  const mask = new Uint8Array(w * h);
  // Line 1: y=80, x=30..240
  for (let x = 30; x <= 240; x++)
    for (let dy = -3; dy <= 3; dy++) {
      const y = 80 + dy;
      if (y >= 0 && y < h) mask[y * w + x] = 1;
    }
  // Line 2: y=200, x=30..240
  for (let x = 30; x <= 240; x++)
    for (let dy = -3; dy <= 3; dy++) {
      const y = 200 + dy;
      if (y >= 0 && y < h) mask[y * w + x] = 1;
    }
  const ok = test("2 parallel lines", mask, w, h);
  if (!ok) process.exit(1);
}

console.log("\nALL PASS ✓");
