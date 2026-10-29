import { compress } from "woff2-encoder";

/**
 * Convert a TTF/OpenType font buffer to WOFF2 using woff2-encoder.
 */
export async function ttfToWoff2(ttfBuffer: Buffer): Promise<Uint8Array> {
  return compress(new Uint8Array(ttfBuffer));
}
