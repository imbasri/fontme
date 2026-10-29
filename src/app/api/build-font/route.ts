import { NextRequest, NextResponse } from "next/server";
import { buildGfont } from "@/lib/gfont";
import { buildTtf, buildFontPack, type TtfOptions } from "@/lib/ttf";

interface Point { x: number; y: number; pressure?: number; }
interface GlyphInput {
  codepoint: number;
  char: string;
  strokes: Point[][];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      name: string;
      glyphs: GlyphInput[];
      format?: "gfont" | "ttf" | "pack";
      ttfOptions?: TtfOptions;
    };
    const { name, glyphs, format, ttfOptions } = body;
    const opts: TtfOptions = ttfOptions ?? {};

    if (!Array.isArray(glyphs) || glyphs.length === 0) {
      return NextResponse.json({ error: "No glyphs provided" }, { status: 400 });
    }

    for (const g of glyphs) {
      if (typeof g.codepoint !== "number" || g.codepoint < 0 || g.codepoint > 0x10FFFF) {
        return NextResponse.json({ error: `Invalid codepoint: ${g.codepoint}` }, { status: 400 });
      }
      if (!Array.isArray(g.strokes) || g.strokes.length === 0) {
        return NextResponse.json({ error: `Glyph ${g.codepoint} has no strokes` }, { status: 400 });
      }
    }

    if (format === "ttf") {
      const buffer = buildTtf(glyphs, opts);
      return new NextResponse(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
        {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${name || "fontku"}.ttf"`,
            "Content-Length": String(buffer.byteLength),
          },
        }
      );
    }

    if (format === "pack") {
      const zipBuffer = await buildFontPack(glyphs, name || "fontku", opts);
      return new NextResponse(
        zipBuffer.buffer.slice(zipBuffer.byteOffset, zipBuffer.byteOffset + zipBuffer.byteLength) as ArrayBuffer,
        {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${name || "fontku"}-pack.zip"`,
            "Content-Length": String(zipBuffer.byteLength),
          },
        }
      );
    }

    const buffer = buildGfont(glyphs);
    return new NextResponse(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
      {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${name || "fontku"}.gfont"`,
          "Content-Length": String(buffer.byteLength),
        },
      }
    );
  } catch (err) {
    console.error("build-font error:", err);
    return NextResponse.json({ error: "Failed to build font" }, { status: 500 });
  }
}