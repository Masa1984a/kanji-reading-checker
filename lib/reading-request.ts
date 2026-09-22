import type { ReadingCheckInput } from './verify-reading';

export type ParsedReadingRequest =
  | { ok: true; input: ReadingCheckInput }
  | { ok: false; error: string };

/**
 * リクエストボディから氏名とふりがなを取り出す。
 * /api/verify-reading と /api/analyze-reading で共通。
 */
export function parseReadingRequest(body: unknown): ParsedReadingRequest {
  const { kanji, kana } = (body ?? {}) as Record<string, unknown>;

  if (
    typeof kanji !== 'string' ||
    typeof kana !== 'string' ||
    !kanji.trim() ||
    !kana.trim()
  ) {
    return {
      ok: false,
      error: '氏名(漢字)とふりがなの両方を入力してください',
    };
  }

  return { ok: true, input: { kanji, kana } };
}
