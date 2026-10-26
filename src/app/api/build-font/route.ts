import { NextRequest, NextResponse } from "next/server";
import { buildGfont } from "@/lib/gfont";
import { buildTtf } from "@/lib/ttf";

interface Point { x: number; y: number; }
interface GlyphInput {
  codepoint: number;
  char: string;
  strokes: Point[][];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { name: string; glyphs: GlyphInput[]; format?: "gfont" | "ttf" };
    const { name, glyphs, format } = body;

    if (!Array.isArray(glyphs) || glyphs.length === 0) {
      return NextResponse.json({ error: "No glyphs provided" }, { status: 400 });
    }

    // Basic validation: each glyph needs a valid codepoint and non-empty strokes
    for (const g of glyphs) {
      if (typeof g.codepoint !== "number" || g.codepoint < 0 || g.codepoint > 0x10FFFF) {
        return NextResponse.json({ error: `Invalid codepoint: ${g.codepoint}` }, { status: 400 });
      }
      if (!Array.isArray(g.strokes) || g.strokes.length === 0) {
        return NextResponse.json({ error: `Glyph ${g.codepoint} has no strokes` }, { status: 400 });
      }
    }

    if (format === "ttf") {
      const buffer = buildTtf(glyphs);
      const filename = `${name || "custom"}.ttf`;
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
      return new NextResponse(arrayBuffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(buffer.byteLength),
        },
      });
    }

    const buffer = buildGfont(glyphs);
    const filename = `${name || "custom"}.gfont`;
    
    // Convert Buffer to ArrayBuffer for NextResponse
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (err) {
    console.error("build-font error:", err);
    return NextResponse.json({ error: "Failed to build font" }, { status: 500 });
  }
}
