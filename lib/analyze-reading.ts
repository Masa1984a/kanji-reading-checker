import { choice, score } from '@typesafe-ai/sdk';
import { getJevClient, type JevClientFor } from './jev-client';
import { normalizeKana, normalizeKanji } from './normalize-reading';
import {
  READING_QUESTIONS,
  toVerdict,
  type ReadingCheckInput,
  type ReadingVerdict,
} from './verify-reading';

/**
 * デモ用の評価パネル。Jevの3プリミティブを観点ごとに使い分ける。
 *
 * - `noul`  … 二値の命題。確率1個のみで confidence は返らない
 * - `choice` … 排他的な分類。選択ラベル + 全ラベルの確率分布 + confidence
 * - `score`  … 順序のある段階。確率加重の期待値(小数) + 分布 + confidence
 *
 * 質問を何問並べてもサーバー側で並列評価され、HTTPの往復は1回だけ。
 * ただし instructions / criteria の全文が入力トークンに乗るため、
 * 入力コストは問題数にほぼ比例する(README参照)。
 */
export const ANALYSIS_QUESTIONS = {
  // 主判定。lib/verify-reading.ts と同じ文言を再利用し、
  // 閾値ロジックによる3段階判定との比較に使う
  ...READING_QUESTIONS,

  commonness: score(
    'How common is this kana reading for this kanji personal name in Japan?',
    [
      'Cannot be a reading of this kanji at all',
      'Extremely rare, or newly invented',
      'Unusual, but real examples exist',
      'Common',
      'The most natural, dictionary-attested reading',
    ],
  ),

  readingType: choice('How does the kana reading derive from the kanji?', {
    音読み: 'Built from standard on-yomi (Sino-Japanese) readings',
    訓読み: 'Built from standard kun-yomi (native Japanese) readings',
    名乗り:
      'Nanori — a reading attested for personal names but not in general vocabulary',
    当て字:
      'A creative or auspicious assignment with no standard phonetic basis in the kanji',
    不一致: 'The kana does not derive from the kanji at all',
  }),

  errorKind: choice(
    'If the reading looks wrong, what kind of mistake most likely explains it?',
    {
      問題なし: 'The reading is consistent; there is no mistake to explain',
      区切りずれ:
        'The surname/given-name boundary is misaligned between the kanji and the kana',
      濁音の違い:
        'Differs only in voicing (dakuten/handakuten), gemination, or vowel length',
      類似漢字の混同:
        'A visually similar kanji was likely substituted, for example 斉 / 斎 / 齊',
      無関係:
        'The kana is unrelated to the kanji and cannot be explained as a simple slip',
    },
  ),

  inventiveness: score(
    'How far does this naming depart from established readings of the kanji? Judge inventiveness only — an inventive name is not an incorrect one.',
    [
      'Traditional; found across generations',
      'Very ordinary',
      'Somewhat modern',
      'Inventive, in line with recent naming trends',
      'Highly inventive; departs far from established readings',
    ],
  ),

  reviewPriority: score(
    'How urgently does a human need to confirm this reading with the person themselves?',
    [
      'No check needed',
      'Check only if there is time',
      'Should be checked',
      'Needs checking',
      'Must be confirmed with the person directly',
    ],
  ),
} as const;

/**
 * score の画面表示用ラベル。
 *
 * モデルに渡すルーブリック(`criteria`)は calibration を変えたくないので英文のまま
 * 維持し、日本語ラベルだけ別に持つ。`criteria` と同じ順序・同じ長さであることを
 * lib/analyze-reading.test.ts で検証している。
 */
const SCORE_LABELS_JA = {
  commonness: [
    '読みとして成立しない',
    '極めて稀・新しい造語',
    '珍しいが実例はある',
    '一般的',
    '最も自然・辞書的',
  ],
  inventiveness: [
    '伝統的',
    'ごく一般的',
    'やや現代的',
    '創作的(近年の傾向)',
    '強く創作的',
  ],
  reviewPriority: [
    '確認不要',
    '余裕があれば確認',
    '確認すべき',
    '要確認',
    '本人への確認が必須',
  ],
} as const;

export type ScoreAxis = keyof typeof SCORE_LABELS_JA;

/** score の軸ごとの、モデル向けルーブリックと表示ラベルの対応 */
export function scoreAxisLabels(axis: ScoreAxis): {
  criteria: readonly unknown[];
  labels: readonly string[];
} {
  return {
    criteria: ANALYSIS_QUESTIONS[axis].criteria,
    labels: SCORE_LABELS_JA[axis],
  };
}

export type AnalysisQuestions = typeof ANALYSIS_QUESTIONS;

/** テストで差し替えるためのクライアント型 */
export type AnalysisClient = JevClientFor<AnalysisQuestions>;

export type ReadingTypeLabel = keyof AnalysisQuestions['readingType']['criteria'] &
  string;
export type ErrorKindLabel = keyof AnalysisQuestions['errorKind']['criteria'] &
  string;

/** 段階ごとの確率 */
export type ScoreLevel = {
  value: number;
  /** 画面表示用の日本語ラベル */
  label: string;
  /** モデルに渡したルーブリックの原文 */
  criterion: string;
  probability: number;
};

export type ScoreInsight = {
  /** 確率加重の期待値。段階の間の小数になりうる (例: 2.4) */
  score: number;
  /** 最も確率が高い段階 */
  likeliest: number;
  /** 期待値に対する確信度。「自信を持って中間」と「判断がつかない」を区別できる */
  confidence: number;
  /** 段階の昇順 */
  levels: ScoreLevel[];
};

export type ChoiceOption<L extends string = string> = {
  label: L;
  probability: number;
};

export type ChoiceInsight<L extends string = string> = {
  choice: L;
  confidence: number;
  /** 確率の降順 */
  options: ChoiceOption<L>[];
};

export type ReadingAnalysis = {
  /** 正規化後の漢字氏名。実際にJevへ送った値 */
  kanji: string;
  /** 正規化後のふりがな(ひらがな)。実際にJevへ送った値 */
  kana: string;
  /** noul: 「妥当な読みである」確率 (0〜1)。noul に confidence はない */
  plausibility: number;
  /** 上の確率を既存の閾値ロジックに通した3段階判定。多観点との比較用 */
  verdict: ReadingVerdict;
  commonness: ScoreInsight;
  readingType: ChoiceInsight<ReadingTypeLabel>;
  errorKind: ChoiceInsight<ErrorKindLabel>;
  inventiveness: ScoreInsight;
  reviewPriority: ScoreInsight;
  /** 6問すべてを1リクエストで評価したときの消費トークン */
  usage: { inputTokens: number; outputTokens: number };
  /** 呼び出しの実測所要時間(ミリ秒) */
  latencyMs: number;
  model: string;
};

/**
 * 漢字氏名とふりがなを6観点で同時に評価する(1リクエスト)。
 *
 * 注意: `inventiveness` が高いことは誤りを意味しない。当て字・名乗りは
 * 正当な読みとして実在するため、`plausibility` が低く `readingType` が
 * `名乗り` のようなケースは「誤入力ではない非典型な読み」を示す。
 *
 * 注意: 氏名は個人情報にあたる。Zero Data Retentionはエンタープライズ契約での
 * 提供となるため、本番運用で必須なら privacy@typesafe.ai に問い合わせること。
 */
export async function analyzeReading(
  input: ReadingCheckInput,
  client?: AnalysisClient,
): Promise<ReadingAnalysis> {
  const kanji = normalizeKanji(input.kanji);
  const kana = normalizeKana(input.kana);

  if (!kanji || !kana) {
    throw new Error('kanji と kana は空にできません');
  }

  const jev = client ?? getJevClient();
  const startedAt = performance.now();

  const result = await jev.systemOne({
    state: {
      漢字氏名: kanji,
      ふりがな: kana,
    },
    questions: ANALYSIS_QUESTIONS,
  });

  const latencyMs = Math.round(performance.now() - startedAt);
  const { answers } = result;
  const plausibility = answers.isPlausibleReading.noul;

  return {
    kanji,
    kana,
    plausibility,
    verdict: toVerdict(plausibility),
    commonness: toScoreInsight(answers.commonness, 'commonness'),
    readingType: toChoiceInsight(answers.readingType),
    errorKind: toChoiceInsight(answers.errorKind),
    inventiveness: toScoreInsight(answers.inventiveness, 'inventiveness'),
    reviewPriority: toScoreInsight(answers.reviewPriority, 'reviewPriority'),
    usage: {
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
    },
    latencyMs,
    model: result.model,
  };
}

function toScoreInsight(
  answer: {
    readonly score: number;
    readonly confidence: number;
    readonly legend: Readonly<Record<string, unknown>>;
    readonly probabilities: Readonly<Record<string, number>>;
  },
  axis: ScoreAxis,
): ScoreInsight {
  const labels = SCORE_LABELS_JA[axis];

  const levels: ScoreLevel[] = Object.entries(answer.probabilities)
    .map(([key, probability]) => {
      const value = Number(key);
      const criterion = asText(answer.legend[key]);
      return {
        value,
        // 日本語ラベルが用意されていない段階が返っても原文にフォールバックする
        label: labels[value] ?? criterion,
        criterion,
        probability,
      };
    })
    .sort((a, b) => a.value - b.value);

  return {
    score: answer.score,
    likeliest: argmax(levels)?.value ?? 0,
    confidence: answer.confidence,
    levels,
  };
}

function toChoiceInsight<L extends string>(answer: {
  readonly choice: L;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<string, number>>;
}): ChoiceInsight<L> {
  return {
    choice: answer.choice,
    confidence: answer.confidence,
    options: Object.entries(answer.probabilities)
      .map(([label, probability]) => ({ label: label as L, probability }))
      .sort((a, b) => b.probability - a.probability),
  };
}

/** 確率が最大の要素。空配列なら undefined */
function argmax<T extends { probability: number }>(items: T[]): T | undefined {
  return items.reduce<T | undefined>(
    (best, item) => (best && best.probability >= item.probability ? best : item),
    undefined,
  );
}

/** ルーブリックの説明文は文字列以外も取りうるため、表示用に文字列化する */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}
