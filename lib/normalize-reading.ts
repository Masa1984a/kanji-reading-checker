/**
 * カタカナ→ひらがなの対応がある範囲。
 *
 * ヷヸヹヺ (U+30F7〜U+30FA) には対応するひらがなが存在しないため、意図的に除いている。
 * U+30FD〜U+30FE は繰り返し記号 (ヽヾ → ゝゞ) で、こちらは対応がある。
 */
const KATAKANA_RANGES: readonly (readonly [number, number])[] = [
  [0x30a1, 0x30f6], // ァ〜ヶ
  [0x30fd, 0x30fe], // ヽヾ
];

/** ひらがなとカタカナのコードポイント差 */
const KATAKANA_TO_HIRAGANA_OFFSET = 0x60;

/** 連続する空白(全角空白を含む)を半角スペース1つに畳んで前後を落とす */
function collapseSpaces(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/**
 * ふりがなをひらがなに正規化する。
 *
 * 1. NFKC で半角カナを全角カナにする。濁点・半濁点は1文字に合成される
 *    (`ﾀ` + `ﾞ` → `ダ`)。全角空白も半角スペースになる。
 * 2. カタカナをひらがなに送る。長音符 `ー` はひらがな表記でも使うため残す。
 * 3. 空白を畳む。姓名の区切りは「誤りの種別」の判定材料になるので、
 *    区切りは消さずスペース1つとして保つ。
 *
 * ひらがな・カタカナ以外(ローマ字など)は弾かずそのまま通す。表記が読みとして
 * 妥当かの判断自体はJevに委ねる。
 */
export function normalizeKana(input: string): string {
  const composed = input.normalize('NFKC');

  const hiragana = Array.from(composed, (char) => {
    const codePoint = char.codePointAt(0);

    if (codePoint === undefined) return char;

    const isKatakana = KATAKANA_RANGES.some(
      ([start, end]) => codePoint >= start && codePoint <= end,
    );

    return isKatakana
      ? String.fromCodePoint(codePoint - KATAKANA_TO_HIRAGANA_OFFSET)
      : char;
  }).join('');

  return collapseSpaces(hiragana);
}

/**
 * 漢字氏名を正規化する。空白を畳むだけ。
 *
 * ふりがな側と違いNFKCをかけない。互換漢字(例: U+FA10 塚 → U+585A 塚)が
 * 書き換わると、氏名として別の字を送ることになるため。
 */
export function normalizeKanji(input: string): string {
  return collapseSpaces(input);
}
