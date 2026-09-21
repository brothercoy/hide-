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
// opentype is BUNDLED, not pulled from a CDN at runtime. It used to be a <script> tag pointing at
// cdnjs, which made the whole game depend on a third party being reachable: the boot gate waits on
// the fonts, so if that script didn't run the screen stayed black forever with nothing to explain
// it. That is fatal for a build handed out as a zip (itch.io) and for a game whose solo half is
// otherwise entirely offline. Pinned to 1.3.4 — the exact version the CDN served, so glyph
// rendering is unchanged.
import * as opentypeNS from 'opentype.js';
const opentype = opentypeNS.default?.parse ? opentypeNS.default : opentypeNS;

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

// fetch + parse rather than opentype.load(): load() goes through XMLHttpRequest and carries a
// Node/browser branch, while this is the plain modern path and gives a real error to catch.
const loadOne = (url) => fetch(url)
    .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} fetching ${url}`)))
    .then(buf => opentype.parse(buf));

export function initFont(fontSize) {
    // The CSS @font-face fonts must ALSO be force-loaded: canvas fillText doesn't trigger a
    // font fetch on its own, so without this the first "Find: X" frames of a kana/hanzi chapter
    // draw in a fallback face and visibly snap once the real font arrives. Non-fatal.
    const cssFonts = (typeof document !== 'undefined' && document.fonts)
        ? Promise.all(['IBMVGA', 'PixelJA', 'PixelZH'].map(
            fam => document.fonts.load(`16px "${fam}"`).catch(() => {})))
        : Promise.resolve();
    // The companions are non-fatal: if one fails to load, its chapters lose their glyphs
    // but the game (and every other chapter) still runs.
    return Promise.all([
        loadOne(fontUrl),
        loadOne(kanaUrl).catch(() => null),
        loadOne(hanziUrl).catch(() => null),
        cssFonts,
    ]).then(([main, kana, hanzi]) => {
        otFont = main;
        kanaFont = kana;
        hanziFont = hanzi;
        _fullCharW = main.getAdvanceWidth('M', fontSize);
        return main;
    });
}
