// Per-chapter character sets for the solo campaign. Each country's rounds use ONLY glyphs unique
// to that chapter — nothing that appears in (or is pixel-identical to) another chapter's set.
//
// The Greek pool was built empirically: every Greek letter whose OUTLINE in PxPlus_IBM_VGA_8x16
// is byte-identical to an ASCII glyph was excluded (Α=A Β=B Ε=E Ζ=Z Η=H Ι=I Κ=K Μ=M Ν=N Ο=O Ρ=P
// Τ=T Υ=Y Χ=X, ο=o), leaving 34 truly-unique glyphs.
//
// A charset = { glyphs, conflicts, confusion }:
//   glyphs     — the chapter's full pool (a string; field noise draws from it)
//   conflicts  — rotation look-alikes: a group's members never share a round with each other
//   confusion  — makeConfusion(tiers): the chapter's ACK-style look-alike ladder
// Chapters without an entry (USA) fall back to the ASCII set built into gameSim/confusables.
import { makeConfusion } from './confusables.js';

// ---- GREECE (chapter c2) ------------------------------------------------------------------------
// (Γ is in the pool as noise but appears in NO pair/subgroup tiers — its font rendering doesn't
// genuinely resemble anything, so it must never be the camouflage.)
const GREEK_GLYPHS = 'ΓΔΘΛΞΠΣΦΨΩαβγδεζηθικλμνξπρσςτυφχψω';

// Perception tiers, same shape as confusables.js's ASCII CONFUSION_TIERS:
// tier 0 broad families → tier 1 subgroups → tier 2 near-identical pairs.
const GREEK_TIERS = [
    // ---- Tier 0: broad families ----
    [
        ['Θ', 'Φ', 'θ', 'φ', 'σ', 'ς', 'δ', 'β', 'ρ', 'α', 'ε'],   // rounds / bowls
        ['Δ', 'Λ', 'λ', 'χ'],                                       // angular strokes
        ['Γ', 'Π', 'π', 'τ', 'η', 'ι'],                             // stems & bars
        ['Ω', 'Ψ', 'ω', 'ψ', 'μ', 'υ', 'ν', 'γ'],                   // prongs / open bowls
        ['Ξ', 'Σ', 'ζ', 'ξ', 'κ'],                                  // zigzags / stacked strokes
    ],
    // ---- Tier 1: subgroups ----
    [
        ['Θ', 'Φ'], ['θ', 'φ'], ['θ', 'σ'], ['σ', 'ς', 'δ'], ['ε', 'ξ', 'ζ'], ['β', 'ρ'], ['α', 'δ'],
        ['Δ', 'Λ', 'λ'], ['κ', 'χ'],
        ['Π', 'π', 'η'], ['ι', 'τ'],
        ['Ω', 'ω'], ['Ψ', 'ψ'], ['ω', 'ψ'], ['μ', 'ν', 'υ', 'η'],
        ['Ξ', 'Σ'],
    ],
    // ---- Tier 2: pairs (the final-level "two options") — only the CLOSEST pairings survive here
    // (Ξ/Σ demoted to tier 1; ι/τ, θ/σ, η/μ promoted in). γ/λ turned out to look nothing alike
    // (γ renders as a ribbon twist) — that pairing lives on as the authored LEVEL 1 sea instead.
    [
        ['Θ', 'Φ'], ['θ', 'φ'], ['θ', 'σ'], ['σ', 'δ'], ['α', 'δ'],
        ['ζ', 'ς'], ['ε', 'ξ'], ['β', 'ρ'],
        ['ν', 'υ'], ['ω', 'ψ'], ['ι', 'τ'], ['η', 'μ'],
        ['Δ', 'Λ'], ['Π', 'π'],
    ],
];

// Rotation-ambiguous pairs: NONE for Greek — γ/λ and η/μ were considered, judged distinct enough
// upside down, and instead promoted to tier-2 decoy pairs (Greece's level 12 is γ among λ's).
const GREEK_CONFLICT_GROUPS = [];

function buildConflicts(groups) {
    const m = {};
    for (const g of groups) for (const c of g) m[c] = g.filter(x => x !== c);
    return m;
}

// ---- RUSSIA (chapter c3) ------------------------------------------------------------------------
// 43 glyphs; excluded as outline-identical to ASCII or the Greek pool: А=A В=B Е=E К=K М=M Н=H
// О=O Р=P С=C Т=T Х=X, Г=Γ П=Π Ф=Φ, а е о р с у х. (Л, У, З all survived — their VGA outlines
// genuinely differ from Λ, Y, 3.)
const CYRILLIC_GLYPHS = 'БДЖЗИЙЛУЦЧШЩЪЫЬЭЮЯбвгджзийклмнптфцчшщъыьэюя';

const CYRILLIC_TIERS = [
    // ---- Tier 0: broad families ----
    [
        ['Ш', 'Щ', 'ш', 'щ', 'Ц', 'ц'],                         // combs (multi-stem + tails)
        ['И', 'Й', 'и', 'й', 'п', 'н', 'Л', 'л', 'Д', 'д', 'м'],// stems / gates / legs
        ['Ъ', 'Ы', 'Ь', 'ъ', 'ы', 'ь', 'Б', 'б', 'в'],          // signs — bowls on stems
        ['З', 'з', 'Э', 'э'],                                   // з/э curves
        ['Ж', 'ж', 'к', 'У', 'Ч', 'ч'],                         // spiky / crossed
        ['Ю', 'ю', 'ф'],                                        // round with attachments
        ['Я', 'я'],                                             // mirrored R
        ['г', 'т'],                                             // small bars
    ],
    // ---- Tier 1: subgroups ----
    [
        ['Ш', 'Щ', 'ш', 'щ'], ['Ц', 'ц', 'щ'],
        ['И', 'Й', 'и', 'й'], ['п', 'н', 'м'], ['Л', 'л', 'Д', 'д'], ['м', 'л'],
        ['Ъ', 'Ы', 'Ь', 'ъ', 'ы', 'ь'], ['Б', 'в', 'Ь', 'б'],
        ['З', 'з', 'Э', 'э'],
        ['Ж', 'ж', 'к'], ['У', 'Ч', 'ч'],
        ['Ю', 'ю'], ['Я', 'я'], ['г', 'т'],
    ],
    // ---- Tier 2: pairs (the final-level "two options") ----
    [
        ['Ш', 'Щ'], ['ш', 'щ'], ['Ц', 'ц'],
        ['И', 'Й'], ['и', 'й'], ['п', 'н'], ['Л', 'л'], ['Д', 'д'],
        ['Ы', 'Ь'], ['ъ', 'ь'], ['Б', 'Ь'],
        ['З', 'Э'], ['з', 'э'],
        ['Ж', 'ж'], ['Ч', 'ч'], ['Ю', 'ю'], ['Я', 'я'],
    ],
];

// ---- ISRAEL (chapter c5) ------------------------------------------------------------------------
// All 27 Hebrew glyphs (22 letters + 5 final forms) are outline-unique against ASCII, Greek and
// Cyrillic — the whole alphabet ships. No cases; the confusables are Hebrew's classic mix-ups.
const HEBREW_GLYPHS = 'אבגדהוזחטיכךלמםנןסעפףצץקרשת';

const HEBREW_TIERS = [
    // ---- Tier 0: broad families ----
    [
        ['ו', 'ן', 'ז', 'י', 'ל'],            // bare stems (vav/final-nun/zayin/yod/lamed)
        ['ד', 'ר', 'ך'],                       // top-corner shapes
        ['ח', 'ה', 'ת', 'ק'],                  // gates (two legs under a roof)
        ['ב', 'כ', 'נ', 'ג'],                  // bent-bottom shapes
        ['ם', 'ס', 'ט', 'מ'],                  // boxes (closed / near-closed)
        ['ע', 'צ', 'ץ', 'א', 'ש'],             // branchy / diagonal
        ['פ', 'ף'],                            // pe curls
        ['ך', 'ן', 'ף', 'ץ', 'ק'],             // descenders (the final forms + qof)
    ],
    // ---- Tier 1: subgroups ----
    [
        ['ו', 'ז', 'ן'], ['י', 'ו'],
        ['ד', 'ר'], ['ד', 'ך'],
        ['ח', 'ה', 'ת'], ['ה', 'ק'],
        ['ב', 'כ', 'נ'], ['ג', 'נ'],
        ['ם', 'ס'], ['ט', 'מ'],
        ['ע', 'צ'], ['צ', 'ץ'],
        ['פ', 'ף'], ['ך', 'ן', 'ף', 'ץ'],
    ],
    // ---- Tier 2: pairs (the final-level "two options") — Hebrew's canonical look-alikes ----
    [
        ['ד', 'ר'], ['ך', 'ד'],
        ['ח', 'ה'], ['ה', 'ת'],
        ['ב', 'כ'], ['ג', 'נ'],
        ['ם', 'ס'], ['ט', 'מ'],
        ['ו', 'ן'], ['ז', 'ו'],
        ['ע', 'צ'], ['פ', 'ף'],
    ],
];

// ---- JAPAN (chapter c4) -------------------------------------------------------------------------
// HALF-WIDTH katakana (JIS X 0201) — the narrow terminal-era forms whose proportions match the
// VGA cell, rendered from the fusion-pixel-ja companion font. 46 base kana + the 9 small forms
// (size pairs, same trick as Cyrillic's case pairs). Voiced forms deliberately excluded.
const KANA_GLYPHS = 'ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';

const KANA_TIERS = [
    // ---- Tier 0: broad families ----
    [
        ['ﾉ', 'ﾒ', 'ｿ', 'ﾝ', 'ｼ', 'ﾂ', 'ﾐ', 'ｯ', 'ﾍ'],                 // diagonal strokes
        ['ｦ', 'ｵ', 'ｫ', 'ｶ', 'ｷ', 'ｻ', 'ｾ', 'ﾁ', 'ﾃ', 'ﾄ', 'ﾅ', 'ﾈ', 'ﾎ', 'ﾋ', 'ﾓ'],       // crossed stems
        ['ｳ', 'ﾜ', 'ｸ', 'ｹ', 'ﾀ', 'ﾌ', 'ﾗ', 'ｩ', 'ｽ', 'ﾇ'],            // claws / hooks
        ['ｺ', 'ﾕ', 'ﾖ', 'ﾛ', 'ｴ', 'ﾆ', 'ｭ', 'ｮ', 'ｪ'],                 // boxes / brackets
        ['ｱ', 'ｲ', 'ｧ', 'ｨ', 'ﾔ', 'ｬ', 'ﾏ', 'ﾑ'],                      // angular open shapes
        ['ﾊ', 'ﾘ', 'ﾙ', 'ﾚ'],                                          // twin strokes
    ],
    // ---- Tier 1: subgroups ----
    [
        ['ｼ', 'ﾂ', 'ｯ', 'ﾐ'], ['ｿ', 'ﾝ'], ['ﾉ', 'ﾒ', 'ﾍ'], ['ﾁ', 'ﾃ'],
        ['ｸ', 'ﾀ', 'ｹ'], ['ｳ', 'ﾜ', 'ｩ'], ['ﾌ', 'ﾗ'], ['ｽ', 'ﾇ'],
        ['ﾅ', 'ｵ', 'ｫ'], ['ﾈ', 'ﾎ'], ['ｻ', 'ｷ'], ['ｾ', 'ﾓ', 'ﾋ'], ['ｶ', 'ｦ'], ['ﾄ', 'ｲ'],
        ['ｺ', 'ﾕ', 'ｭ'], ['ﾖ', 'ｮ', 'ｴ', 'ｪ'], ['ﾛ', 'ｺ'], ['ﾆ', 'ｴ'],
        ['ｱ', 'ｧ', 'ﾏ', 'ﾑ'], ['ﾔ', 'ｬ'],
        ['ﾘ', 'ﾙ', 'ﾚ'],
    ],
    // ---- Tier 2: pairs — the kana classics (ｼ/ﾂ and ｿ/ﾝ are famous) + size pairs ----
    [
        ['ｼ', 'ﾂ'], ['ｿ', 'ﾝ'], ['ﾁ', 'ﾃ'], ['ｸ', 'ﾀ'], ['ｳ', 'ﾜ'], ['ﾌ', 'ﾗ'], ['ｽ', 'ﾇ'],
        ['ﾅ', 'ｵ'], ['ﾈ', 'ﾎ'], ['ｻ', 'ｷ'], ['ｾ', 'ﾓ'], ['ﾒ', 'ﾉ'], ['ﾙ', 'ﾚ'],
        ['ﾂ', 'ｯ'], ['ﾔ', 'ｬ'], ['ﾕ', 'ｭ'], ['ﾖ', 'ｮ'], ['ｱ', 'ｧ'],
    ],
];

// ---- CHINA (chapter c6) -------------------------------------------------------------------------
// 130 simplified hanzi curated around the classic confusion clusters (土/士, 日/曰, 未/末, 己/已/巳,
// 戊/戌/戍, 田/由/甲/申 …), rendered from the fusion-pixel-zh companion font (rescaled so a hanzi
// body is exactly 0.625 em — the same ink height as a VGA capital). Glyphs outside the tiers are
// noise-only, like Greek's Γ.
const HANZI_GLYPHS =
    '一二三四五六七八九十人入大太犬天夫失矢夭无土士王玉主干千于日曰白百目自旦但未末木本禾米来' +
    '力刀刃办万方勿匆己已巳乃及戊戌戍成咸爪瓜免兔辛幸鸟乌田由甲申电口中回因困国贝见页儿几凡风' +
    '门问间闪今令石右古占手毛乎水永冰雨两山出击川州小少尘立位午牛生年史吏更曼云去丢东车轮';

const HANZI_TIERS = [
    // ---- Tier 0: broad families ----
    [
        ['一', '二', '三', '十', '干', '千', '于', '土', '士', '王', '玉', '主'],       // strokes & stems
        ['日', '曰', '白', '百', '目', '自', '旦', '但', '田', '由', '甲', '申', '电'], // sun/eye boxes
        ['口', '中', '回', '因', '困', '国'],                                          // mouths / enclosures
        ['未', '末', '木', '本', '禾', '米', '来'],                                    // trees & grain
        ['人', '入', '八', '大', '太', '犬', '天', '夫', '失', '矢', '夭', '无'],       // person / sky
        ['己', '已', '巳', '乃', '及', '勿', '匆', '刀', '力', '刃', '办', '万', '方'], // hooks & blades
        ['戊', '戌', '戍', '成', '咸'],                                               // battle-axes
        ['门', '问', '间', '闪', '儿', '几', '凡', '风', '贝', '见', '页'],             // frames & legs
        ['爪', '瓜', '免', '兔', '鸟', '乌'],                                          // creatures
        ['山', '出', '击', '川', '州', '水', '永', '冰', '雨', '两'],                   // mountains & water
        ['小', '少', '尘', '六', '立', '位', '云', '去', '丢'],                        // dots & stands
        ['手', '毛', '乎', '午', '牛', '生', '年'],                                    // hands & horns
        ['石', '右', '古', '占', '史', '吏', '更', '曼'],                              // stones & mouths-below
        ['辛', '幸', '东', '车', '轮'],                                               // stacked crosses
        ['今', '令'],
    ],
    // ---- Tier 1: subgroups ----
    [
        ['土', '士', '王', '玉', '主'], ['干', '千', '于', '十'], ['一', '二', '三'],
        ['日', '曰', '目', '自', '白', '百', '旦'], ['田', '由', '甲', '申', '电'], ['口', '回', '国', '因', '困'],
        ['未', '末', '木', '本', '禾', '来'],
        ['天', '夫', '失', '矢', '夭', '无'], ['大', '太', '犬'], ['人', '入', '八'],
        ['己', '已', '巳'], ['刀', '力', '刃', '办'], ['万', '方', '勿', '匆'], ['乃', '及'],
        ['戊', '戌', '戍', '成', '咸'],
        ['门', '问', '间', '闪'], ['儿', '几', '凡', '风'], ['贝', '见', '页'],
        ['爪', '瓜'], ['免', '兔'], ['鸟', '乌'],
        ['山', '出', '击'], ['川', '州'], ['水', '永', '冰'], ['雨', '两'],
        ['小', '少', '尘'], ['六', '立', '位'], ['云', '去', '丢'],
        ['手', '毛', '乎'], ['午', '牛', '生', '年'],
        ['石', '右', '古', '占'], ['史', '吏', '更', '曼'],
        ['辛', '幸'], ['东', '车', '轮'], ['今', '令'],
    ],
    // ---- Tier 2: pairs — the canonical hanzi traps ----
    [
        ['土', '士'], ['玉', '主'], ['干', '千'], ['干', '于'],
        ['日', '曰'], ['目', '自'], ['白', '百'], ['旦', '但'],
        ['田', '由'], ['由', '甲'], ['甲', '申'], ['口', '回'], ['因', '困'],
        ['未', '末'], ['木', '本'], ['禾', '来'],
        ['天', '夫'], ['夫', '失'], ['天', '夭'], ['大', '太'], ['太', '犬'], ['人', '入'],
        ['己', '已'], ['已', '巳'], ['刀', '刃'], ['勿', '匆'], ['乃', '及'],
        ['戊', '戌'], ['戌', '戍'],
        ['门', '问'], ['问', '间'], ['儿', '几'], ['几', '凡'], ['贝', '见'],
        ['爪', '瓜'], ['免', '兔'], ['鸟', '乌'],
        ['川', '州'], ['水', '永'], ['雨', '两'], ['山', '出'],
        ['小', '少'], ['云', '去'], ['去', '丢'],
        ['手', '毛'], ['午', '牛'], ['生', '年'],
        ['石', '右'], ['古', '占'], ['史', '吏'], ['吏', '更'],
        ['辛', '幸'], ['东', '车'], ['今', '令'],
    ],
];

export const CHARSETS = {
    c2: {
        glyphs: GREEK_GLYPHS,
        conflicts: buildConflicts(GREEK_CONFLICT_GROUPS),
        confusion: makeConfusion(GREEK_TIERS),
    },
    c3: {
        glyphs: CYRILLIC_GLYPHS,
        conflicts: buildConflicts([]),   // none yet — playtesting decides
        confusion: makeConfusion(CYRILLIC_TIERS),
    },
    c4: {
        glyphs: KANA_GLYPHS,
        conflicts: buildConflicts([]),   // none yet — playtesting decides
        confusion: makeConfusion(KANA_TIERS),
    },
    c5: {
        glyphs: HEBREW_GLYPHS,
        conflicts: buildConflicts([]),   // none yet — playtesting decides
        confusion: makeConfusion(HEBREW_TIERS),
    },
    c6: {
        glyphs: HANZI_GLYPHS,
        conflicts: buildConflicts([]),   // none yet — playtesting decides
        confusion: makeConfusion(HANZI_TIERS),
    },
};
