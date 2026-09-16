// Resolve fonts through Vite so they point at the correct (hashed) asset URLs in
// both dev and the production build — a bare 'PxPlus_IBM_VGA_8x16.ttf' string is
// NOT rewritten by Vite and 404s once assets are hashed into /assets/.
//
// Fonts:
//   IBMVGA          — the game's face: ASCII + Greek + Cyrillic + Hebrew (chapters 1-3, 5)
//   fusion-pixel-ja — katakana subset of Fusion Pixel 12px monospaced (JAPAN chapter)
//   fusion-pixel-zh — hanzi candidate subset of the zh_hans variant (CHINA chapter)
// The companions are tiny (~16 KB each) subsets built with fontTools from the OFL-licensed
// Fusion Pixel Font (github.com/TakWolf/fusion-pixel-font) — see FUSION-PIXEL-OFL.txt.
import fontUrl from '../PxPlus_IBM_VGA_8x16.ttf?url';
import kanaUrl from '../fusion-pixel-ja.ttf?url';
import hanziUrl from '../fusion-pixel-zh.ttf?url';

export let otFont = null;
let kanaFont = null;
let hanziFont = null;
let _fullCharW = null;

export function charWidth(fontSize) {
    if (!otFont) return 0;
    // If no fontSize given, return advance width at the last loaded base size
    return fontSize
        ? otFont.getAdvanceWidth('M', fontSize)
        : _fullCharW;
}

// The font that OWNS a glyph: the VGA font wins for everything it covers; the companion
// pixel fonts fill in what it lacks (kana, hanzi). Falls back to the VGA font so a truly
// unknown char degrades to its .notdef instead of crashing.
export function fontForChar(char) {
    if (otFont && otFont.charToGlyphIndex(char) > 0) return otFont;
    if (kanaFont && kanaFont.charToGlyphIndex(char) > 0) return kanaFont;
    if (hanziFont && hanziFont.charToGlyphIndex(char) > 0) return hanziFont;
    return otFont;
}

const loadOne = (url) => new Promise((resolve, reject) => {
    opentype.load(url, (err, font) => err ? reject(err) : resolve(font));
});

export function initFont(fontSize) {
    // The companions are non-fatal: if one fails to load, its chapters lose their glyphs
    // but the game (and every other chapter) still runs.
    return Promise.all([
        loadOne(fontUrl),
        loadOne(kanaUrl).catch(() => null),
        loadOne(hanziUrl).catch(() => null),
    ]).then(([main, kana, hanzi]) => {
        otFont = main;
        kanaFont = kana;
        hanziFont = hanzi;
        _fullCharW = main.getAdvanceWidth('M', fontSize);
        return main;
    });
}
