declare module "fontkit" {
  interface FontOptions {
    name?: string;
    unitsPerEm?: number;
    ascender?: number;
    descender?: number;
  }
  interface GlyphData {
    width: number;
    path?: any;
    codePoint?: number;
  }
  interface Font {
    addGlyph(char: string, data: GlyphData): void;
    toTTF(): Uint8Array;
  }
  const fontkit: {
    create: (opts: FontOptions) => Font;
    parse: (data: Uint8Array | ArrayBuffer, byteOffset?: number, length?: number) => Font;
  };
  export = fontkit;
}
