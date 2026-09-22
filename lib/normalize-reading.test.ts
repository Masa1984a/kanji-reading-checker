import { describe, expect, it } from 'vitest';
import { normalizeKana, normalizeKanji } from './normalize-reading';

describe('normalizeKana', () => {
  it('ひらがなはそのまま通す', () => {
    expect(normalizeKana('やまだたろう')).toBe('やまだたろう');
  });

  it('カタカナをひらがなにする', () => {
    expect(normalizeKana('ヤマダタロウ')).toBe('やまだたろう');
    expect(normalizeKana('サイトウ')).toBe('さいとう');
  });

  it('半角カナをひらがなにする', () => {
    expect(normalizeKana('ﾔﾏﾀﾞﾀﾛｳ')).toBe('やまだたろう');
    expect(normalizeKana('ｽｽﾞｷ')).toBe('すずき');
  });

  it('半角の濁点・半濁点を1文字に合成する', () => {
    expect(normalizeKana('ｶﾞ')).toBe('が');
    expect(normalizeKana('ﾊﾟ')).toBe('ぱ');
    // 合成されるので、文字数は結合前より減る
    expect(normalizeKana('ﾀﾞ')).toHaveLength(1);
  });

  it('小書き文字・促音・拗音も変換する', () => {
    expect(normalizeKana('ァィゥェォッャュョ')).toBe('ぁぃぅぇぉっゃゅょ');
    expect(normalizeKana('キョウコ')).toBe('きょうこ');
  });

  it('長音符は残す', () => {
    expect(normalizeKana('ジョージ')).toBe('じょーじ');
    expect(normalizeKana('ﾙｰｽ')).toBe('るーす');
  });

  it('ヴはひらがなのゔにする', () => {
    expect(normalizeKana('ヴィクター')).toBe('ゔぃくたー');
  });

  it('対応するひらがなが無いヷヸヹヺはカタカナのまま残す', () => {
    expect(normalizeKana('ヷヸヹヺ')).toBe('ヷヸヹヺ');
  });

  it('全角空白と連続空白を半角スペース1つに畳む', () => {
    expect(normalizeKana('ヤマダ　タロウ')).toBe('やまだ たろう');
    expect(normalizeKana('やまだ   たろう')).toBe('やまだ たろう');
    expect(normalizeKana('  やまだ たろう  ')).toBe('やまだ たろう');
  });

  it('姓名の区切りは消さずに残す(誤りの種別の判定材料になる)', () => {
    expect(normalizeKana('ヤマダ タロウ')).toContain(' ');
  });

  it('カタカナ・ひらがな・半角カナが混在していても揃える', () => {
    expect(normalizeKana('ヤマダたろウ')).toBe('やまだたろう');
    expect(normalizeKana('ﾔﾏﾀﾞたろう')).toBe('やまだたろう');
  });

  it('ひらがな・カタカナ以外は弾かずそのまま通す', () => {
    expect(normalizeKana('yamada taro')).toBe('yamada taro');
    expect(normalizeKana('山田')).toBe('山田');
  });

  it('空白のみの入力は空文字になる(呼び出し側の空判定に載る)', () => {
    expect(normalizeKana('   ')).toBe('');
    expect(normalizeKana('　')).toBe('');
  });
});

describe('normalizeKanji', () => {
  it('空白を畳むだけで字は変えない', () => {
    expect(normalizeKanji('  山田 太郎 ')).toBe('山田 太郎');
    expect(normalizeKanji('山田　太郎')).toBe('山田 太郎');
  });

  it('互換漢字をNFKCで書き換えない(氏名の字が変わってしまうため)', () => {
    // U+FA10 (互換漢字の「塚」)。NFKCをかけると U+585A に変わってしまう
    const compatibility = '塚';
    expect(normalizeKanji(compatibility)).toBe(compatibility);
    expect(normalizeKanji(compatibility)).not.toBe(
      compatibility.normalize('NFKC'),
    );
  });

  it('カタカナ・ひらがなはそのまま(漢字欄の内容は判断しない)', () => {
    expect(normalizeKanji('ヤマダ')).toBe('ヤマダ');
  });

  it('空白のみの入力は空文字になる', () => {
    expect(normalizeKanji('　 ')).toBe('');
  });
});
