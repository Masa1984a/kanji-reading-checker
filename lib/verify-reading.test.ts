import { describe, expect, it } from 'vitest';
import {
  type JevClient,
  READING_QUESTIONS,
  verifyReading,
} from './verify-reading';

type Request = Parameters<JevClient['systemOne']>[0];

/**
 * TypeSafe APIを実際に呼ばず、Noulの確率だけを返すスタブ。
 * calls に渡されたリクエストを記録し、送信内容も検証できるようにする。
 */
function mockJev(noulValue: number) {
  const calls: Request[] = [];

  const client: JevClient = {
    systemOne: async (request) => {
      calls.push(request);
      return {
        model: 'jev-1.13.0',
        answers: {
          isPlausibleReading: { type: 'noul' as const, noul: noulValue },
        },
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    },
  };

  return { client, calls };
}

describe('verifyReading', () => {
  it('probabilityが高い場合は plausible を返す', async () => {
    const result = await verifyReading(
      { kanji: '山田太郎', kana: 'やまだたろう' },
      mockJev(0.97).client,
    );
    expect(result.verdict).toBe('plausible');
    expect(result.probability).toBe(0.97);
  });

  it('probabilityが中間帯の場合は review を返す', async () => {
    const result = await verifyReading(
      { kanji: '一二三', kana: 'ひふみ' },
      mockJev(0.55).client,
    );
    expect(result.verdict).toBe('review');
  });

  it('probabilityが低い場合は unlikely を返す', async () => {
    const result = await verifyReading(
      { kanji: '田中', kana: 'すずき' },
      mockJev(0.05).client,
    );
    expect(result.verdict).toBe('unlikely');
  });

  it('閾値の境界値(0.85 / 0.3)を正しく分類する', async () => {
    const atPlausible = await verifyReading(
      { kanji: '鈴木', kana: 'すずき' },
      mockJev(0.85).client,
    );
    expect(atPlausible.verdict).toBe('plausible');

    const atUnlikely = await verifyReading(
      { kanji: '鈴木', kana: 'すずき' },
      mockJev(0.3).client,
    );
    expect(atUnlikely.verdict).toBe('unlikely');
  });

  it('kanji または kana が空の場合はエラーを投げる', async () => {
    await expect(
      verifyReading({ kanji: '', kana: 'たろう' }, mockJev(0.9).client),
    ).rejects.toThrow();

    await expect(
      verifyReading({ kanji: '太郎', kana: '' }, mockJev(0.9).client),
    ).rejects.toThrow();
  });

  it('前後の空白を除いた氏名をNoul質問とともに送る', async () => {
    const { client, calls } = mockJev(0.9);

    await verifyReading({ kanji: '  佐藤  ', kana: ' さとう ' }, client);

    expect(calls).toHaveLength(1);
    expect(calls[0].state).toEqual({ 漢字氏名: '佐藤', ふりがな: 'さとう' });
    expect(calls[0].questions).toBe(READING_QUESTIONS);
    expect(calls[0].questions.isPlausibleReading.type).toBe('noul');
  });

  it('カタカナ・半角カナのふりがなをひらがなに正規化して送る', async () => {
    const katakana = mockJev(0.9);
    await verifyReading({ kanji: '山田太郎', kana: 'ヤマダタロウ' }, katakana.client);
    expect(katakana.calls[0].state).toEqual({
      漢字氏名: '山田太郎',
      ふりがな: 'やまだたろう',
    });

    const halfwidth = mockJev(0.9);
    await verifyReading({ kanji: '鈴木', kana: 'ｽｽﾞｷ' }, halfwidth.client);
    expect(halfwidth.calls[0].state).toEqual({
      漢字氏名: '鈴木',
      ふりがな: 'すずき',
    });
  });

  it('ひらがな・カタカナ・半角カナのどれで入力しても同じ値がJevに渡る', async () => {
    const expected = { 漢字氏名: '山田太郎', ふりがな: 'やまだたろう' };

    for (const kana of ['やまだたろう', 'ヤマダタロウ', 'ﾔﾏﾀﾞﾀﾛｳ']) {
      const { client, calls } = mockJev(0.9);
      await verifyReading({ kanji: '山田太郎', kana }, client);
      expect(calls[0].state, kana).toEqual(expected);
    }
  });

  it('APIが失敗した場合は例外をそのまま伝播する', async () => {
    const failing: JevClient = {
      systemOne: async () => {
        throw new Error('rate limited');
      },
    };

    await expect(
      verifyReading({ kanji: '山田', kana: 'やまだ' }, failing),
    ).rejects.toThrow('rate limited');
  });
});
