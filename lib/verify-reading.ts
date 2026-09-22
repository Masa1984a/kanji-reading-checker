import { noul } from '@typesafe-ai/sdk';
import { getJevClient, type JevClientFor } from './jev-client';
import { normalizeKana, normalizeKanji } from './normalize-reading';

export type ReadingCheckInput = {
  /** 漢字表記の氏名 (例: "山田太郎") */
  kanji: string;
  /** ふりがな。ひらがな・カタカナ・半角カナのいずれでも可 (例: "やまだたろう") */
  kana: string;
};

export type ReadingVerdict = 'plausible' | 'review' | 'unlikely';

export type ReadingCheckResult = {
  verdict: ReadingVerdict;
  /** 「この読み方は妥当である」という命題が真である確率 (0〜1) */
  probability: number;
};

// probability がこの値以上なら、一般的な読み方として扱う
const PLAUSIBLE_THRESHOLD = 0.85;
// probability がこの値以下なら、非標準な読み方として扱う
const UNLIKELY_THRESHOLD = 0.3;
// 上記2つの閾値の間は「要確認」として人によるレビューに回す。
// 実データで probability と実際の正誤を比較しながら調整することを推奨(README参照)。

/**
 * Noulの確率を3段階のverdictに落とす。
 * 閾値の唯一の定義箇所。デモ画面(lib/analyze-reading.ts)からも参照する。
 */
export function toVerdict(probability: number): ReadingVerdict {
  if (probability >= PLAUSIBLE_THRESHOLD) {
    return 'plausible';
  }
  if (probability <= UNLIKELY_THRESHOLD) {
    return 'unlikely';
  }
  return 'review';
}

/**
 * Jevに投げる質問。Noul(yes/no)を1問だけ使い、真である確率を受け取る。
 */
export const READING_QUESTIONS = {
  isPlausibleReading: noul(
    'Given a Japanese personal name written in kanji and a proposed kana reading (furigana), estimate the probability that the kana is a standard or plausible reading for that kanji name in Japan.',
    {
      true: 'The kana matches a dictionary-attested, common, or well-known reading for this kanji name, including widely used irregular name readings (nanori).',
      false:
        'The kana does not plausibly correspond to the kanji — for example, mismatched characters, wrong length, or a reading with no known connection to the kanji.',
    },
  ),
} as const;

export type ReadingQuestions = typeof READING_QUESTIONS;

/** テストで差し替えるためのクライアント型 */
export type JevClient = JevClientFor<ReadingQuestions>;

/**
 * 漢字氏名とふりがなの組み合わせが、日本語の人名として
 * どの程度一般的・典型的かをJevで確率判定する。
 *
 * 注意: これは「読みの一般性」の推定であり、戸籍上の正誤を保証するものではない。
 * 当て字・特殊な読み(いわゆるキラキラネーム等)は現実に存在するため、
 * unlikely判定 = 誤りとは限らない。
 *
 * 注意: 氏名は個人情報にあたる。TypeSafeはユーザーデータでの学習を行わないと
 * 明言しているが、Zero Data Retentionはエンタープライズ契約での提供となるため、
 * 本番運用で必須なら privacy@typesafe.ai に問い合わせること(README参照)。
 */
export async function verifyReading(
  input: ReadingCheckInput,
  client?: JevClient,
): Promise<ReadingCheckResult> {
  // ふりがなはカタカナ・半角カナで来ても表記ゆれが判定に乗らないよう
  // ひらがなに正規化して送る (lib/normalize-reading.ts)
  const kanji = normalizeKanji(input.kanji);
  const kana = normalizeKana(input.kana);

  if (!kanji || !kana) {
    throw new Error('kanji と kana は空にできません');
  }

  // リトライ(429/5xx/接続エラー)とタイムアウトはSDKが既定で処理するため、
  // ここでは再試行を実装しない。
  const jev = client ?? getJevClient();

  const result = await jev.systemOne({
    state: {
      漢字氏名: kanji,
      ふりがな: kana,
    },
    questions: READING_QUESTIONS,
  });

  const probability = result.answers.isPlausibleReading.noul;

  return { verdict: toVerdict(probability), probability };
}
