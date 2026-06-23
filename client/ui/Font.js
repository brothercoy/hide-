// Resolve the font through Vite so it points at the correct (hashed) asset URL in
// both dev and the production build — a bare 'PxPlus_IBM_VGA_8x16.ttf' string is
// NOT rewritten by Vite and 404s once assets are hashed into /assets/.
import fontUrl from '../PxPlus_IBM_VGA_8x16.ttf?url';

export let otFont = null;
let _fullCharW = null;

export function charWidth(fontSize) {
    if (!otFont) return 0;
    // If no fontSize given, return advance width at the last loaded base size
    return fontSize
        ? otFont.getAdvanceWidth('M', fontSize)
        : _fullCharW;
}

export function initFont(fontSize) {
    return new Promise((resolve, reject) => {
        opentype.load(fontUrl, (err, font) => {
            if (err) { reject(err); return; }
            otFont = font;
            _fullCharW = font.getAdvanceWidth('M', fontSize);
            resolve(font);
        });
    });
}