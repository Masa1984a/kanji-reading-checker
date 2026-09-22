import { describe, expect, it } from 'vitest';
import { parseReadingRequest } from './reading-request';

describe('parseReadingRequest', () => {
  it('漢字とふりがなが揃っていれば受理する', () => {
    const parsed = parseReadingRequest({ kanji: '山田', kana: 'やまだ' });

    expect(parsed).toEqual({
      ok: true,
      input: { kanji: '山田', kana: 'やまだ' },
    });
  });

  it('余分なキーは無視する', () => {
    const parsed = parseReadingRequest({
      kanji: '山田',
      kana: 'やまだ',
      model: 'gpt-4',
    });

    expect(parsed).toEqual({
      ok: true,
      input: { kanji: '山田', kana: 'やまだ' },
    });
  });

  it('欠落・空文字・空白のみ・型違いはすべて拒否する', () => {
    const invalid: unknown[] = [
      null,
      undefined,
      {},
      { kanji: '山田' },
      { kana: 'やまだ' },
      { kanji: '', kana: 'やまだ' },
      { kanji: '山田', kana: '   ' },
      { kanji: 123, kana: 'やまだ' },
      { kanji: '山田', kana: ['やまだ'] },
    ];

    for (const body of invalid) {
      const parsed = parseReadingRequest(body);
      expect(parsed.ok, JSON.stringify(body)).toBe(false);
    }
  });
});
