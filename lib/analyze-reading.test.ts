import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_QUESTIONS,
  analyzeReading,
  scoreAxisLabels,
  type AnalysisClient,
} from './analyze-reading';

type Request = Parameters<AnalysisClient['systemOne']>[0];
type Result = Awaited<ReturnType<AnalysisClient['systemOne']>>;

type ScoreSpec = {
  /** 段階0から順の確率 */
  probabilities: number[];
  score: number;
  confidence: number;
};

type ChoiceSpec = {
  probabilities: Record<string, number>;
  choice: string;
  confidence: number;
};

type AnswerSpec = {
  plausibility: number;
  commonness: ScoreSpec;
  inventiveness: ScoreSpec;
  reviewPriority: ScoreSpec;
  readingType: ChoiceSpec;
  errorKind: ChoiceSpec;
};

const DEFAULTS: AnswerSpec = {
  plausibility: 0.95,
  commonness: {
    probabilities: [0.01, 0.04, 0.15, 0.3, 0.5],
    score: 3.24,
    confidence: 0.82,
  },
  inventiveness: {
    probabilities: [0.6, 0.2, 0.1, 0.07, 0.03],
    score: 0.73,
    confidence: 0.71,
  },
  reviewPriority: {
    probabilities: [0.7, 0.2, 0.05, 0.03, 0.02],
    score: 0.47,
    confidence: 0.76,
  },
  readingType: {
    probabilities: {
      音読み: 0.1,
      訓読み: 0.75,
      名乗り: 0.1,
      当て字: 0.03,
      不一致: 0.02,
    },
    choice: '訓読み',
    confidence: 0.8,
  },
  errorKind: {
    probabilities: {
      問題なし: 0.9,
      区切りずれ: 0.03,
      濁音の違い: 0.03,
      類似漢字の混同: 0.02,
      無関係: 0.02,
    },
    choice: '問題なし',
    confidence: 0.91,
  },
};

/** legend は実際のルーブリック定義から組み立て、テスト側に文言を複製しない */
function scoreAnswer(criteria: readonly unknown[], spec: ScoreSpec) {
  return {
    type: 'score',
    score: spec.score,
    confidence: spec.confidence,
    legend: Object.fromEntries(criteria.map((label, index) => [index, label])),
    probabilities: Object.fromEntries(
      spec.probabilities.map((probability, index) => [index, probability]),
    ),
  };
}

function choiceAnswer(spec: ChoiceSpec) {
  return {
    type: 'choice',
    choice: spec.choice,
    confidence: spec.confidence,
    probabilities: spec.probabilities,
  };
}

/**
 * TypeSafe APIを呼ばずに6問ぶんの回答を返すスタブ。
 *
 * SystemOneResult の legend / probabilities はルーブリックのリテラル型で
 * キー付けされているため、動的に組み立てた回答は構造的に一致しない。
 * スタブ組み立ての1か所だけキャストする。
 */
function mockJev(overrides: Partial<AnswerSpec> = {}) {
  const spec: AnswerSpec = { ...DEFAULTS, ...overrides };
  const calls: Request[] = [];

  const client: AnalysisClient = {
    systemOne: async (request) => {
      calls.push(request);
      return {
        model: 'jev-1.13.0',
        answers: {
          isPlausibleReading: { type: 'noul', noul: spec.plausibility },
          commonness: scoreAnswer(
            ANALYSIS_QUESTIONS.commonness.criteria,
            spec.commonness,
          ),
          inventiveness: scoreAnswer(
            ANALYSIS_QUESTIONS.inventiveness.criteria,
            spec.inventiveness,
          ),
          reviewPriority: scoreAnswer(
            ANALYSIS_QUESTIONS.reviewPriority.criteria,
            spec.reviewPriority,
          ),
          readingType: choiceAnswer(spec.readingType),
          errorKind: choiceAnswer(spec.errorKind),
        },
        usage: { input_tokens: 412, output_tokens: 57 },
      } as unknown as Result;
    },
  };

  return { client, calls };
}

describe('ANALYSIS_QUESTIONS', () => {
  it('6問すべてを定義し、観点ごとにプリミティブを使い分けている', () => {
    expect(Object.keys(ANALYSIS_QUESTIONS)).toHaveLength(6);
    expect(ANALYSIS_QUESTIONS.isPlausibleReading.type).toBe('noul');
    expect(ANALYSIS_QUESTIONS.commonness.type).toBe('score');
    expect(ANALYSIS_QUESTIONS.inventiveness.type).toBe('score');
    expect(ANALYSIS_QUESTIONS.reviewPriority.type).toBe('score');
    expect(ANALYSIS_QUESTIONS.readingType.type).toBe('choice');
    expect(ANALYSIS_QUESTIONS.errorKind.type).toBe('choice');
  });

  it('score の表示ラベルはルーブリックと同じ段階数を持つ', () => {
    const scoreKeys = [
      'commonness',
      'inventiveness',
      'reviewPriority',
    ] as const;

    for (const axis of scoreKeys) {
      const { criteria, labels } = scoreAxisLabels(axis);
      expect(labels.length, axis).toBe(criteria.length);
      expect(labels.every((label) => label.length > 0), axis).toBe(true);
    }
  });

  it('score の criteria は2〜10段階の範囲内 (SDKの制約)', () => {
    const scoreKeys = [
      'commonness',
      'inventiveness',
      'reviewPriority',
    ] as const;

    for (const key of scoreKeys) {
      const { criteria } = ANALYSIS_QUESTIONS[key];
      expect(criteria.length).toBeGreaterThanOrEqual(2);
      expect(criteria.length).toBeLessThanOrEqual(10);
    }
  });
});

describe('analyzeReading', () => {
  it('6問を1リクエストでまとめて送る', async () => {
    const { client, calls } = mockJev();

    await analyzeReading({ kanji: '山田太郎', kana: 'やまだたろう' }, client);

    expect(calls).toHaveLength(1);
    expect(calls[0].questions).toBe(ANALYSIS_QUESTIONS);
    expect(calls[0].state).toEqual({
      漢字氏名: '山田太郎',
      ふりがな: 'やまだたろう',
    });
  });

  it('前後の空白を除いた氏名を送り、結果にも含める', async () => {
    const { client, calls } = mockJev();

    const result = await analyzeReading(
      { kanji: '  佐藤  ', kana: ' さとう ' },
      client,
    );

    expect(calls[0].state).toEqual({ 漢字氏名: '佐藤', ふりがな: 'さとう' });
    expect(result.kanji).toBe('佐藤');
    expect(result.kana).toBe('さとう');
  });

  it('ふりがなをひらがなに正規化して送り、結果にも正規化後の値を返す', async () => {
    const { client, calls } = mockJev();

    const result = await analyzeReading(
      { kanji: '鈴木　一郎', kana: 'ｽｽﾞｷ　ｲﾁﾛｳ' },
      client,
    );

    // 姓名の区切りは「誤りの種別」の判定材料なので、半角スペースとして保つ
    expect(calls[0].state).toEqual({
      漢字氏名: '鈴木 一郎',
      ふりがな: 'すずき いちろう',
    });
    expect(result.kanji).toBe('鈴木 一郎');
    expect(result.kana).toBe('すずき いちろう');
  });

  it('noul の確率と、閾値ロジックによる verdict の両方を返す', async () => {
    const plausible = await analyzeReading(
      { kanji: '鈴木', kana: 'すずき' },
      mockJev({ plausibility: 0.97 }).client,
    );
    expect(plausible.plausibility).toBe(0.97);
    expect(plausible.verdict).toBe('plausible');

    const review = await analyzeReading(
      { kanji: '一二三', kana: 'ひふみ' },
      mockJev({ plausibility: 0.55 }).client,
    );
    expect(review.verdict).toBe('review');

    const unlikely = await analyzeReading(
      { kanji: '田中', kana: 'すずき' },
      mockJev({ plausibility: 0.05 }).client,
    );
    expect(unlikely.verdict).toBe('unlikely');
  });

  it('score は期待値・確信度・最尤の段階・ルーブリック付きの分布を返す', async () => {
    const { client } = mockJev({
      commonness: {
        probabilities: [0.02, 0.08, 0.6, 0.2, 0.1],
        score: 2.28,
        confidence: 0.64,
      },
    });

    const { commonness } = await analyzeReading(
      { kanji: '月', kana: 'るな' },
      client,
    );

    expect(commonness.score).toBe(2.28);
    expect(commonness.confidence).toBe(0.64);
    expect(commonness.likeliest).toBe(2);
    // 段階の昇順に並び、表示用の日本語ラベルと legend の原文の両方を持つ
    expect(commonness.levels.map((level) => level.value)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(commonness.levels[2].label).toBe('珍しいが実例はある');
    expect(commonness.levels[2].criterion).toBe(
      ANALYSIS_QUESTIONS.commonness.criteria[2],
    );
    expect(commonness.levels[2].probability).toBe(0.6);
  });

  it('choice は選択ラベルと確率降順の分布を返す', async () => {
    const { client } = mockJev({
      readingType: {
        probabilities: {
          音読み: 0.05,
          訓読み: 0.1,
          名乗り: 0.7,
          当て字: 0.13,
          不一致: 0.02,
        },
        choice: '名乗り',
        confidence: 0.88,
      },
    });

    const { readingType } = await analyzeReading(
      { kanji: '颯太', kana: 'そうた' },
      client,
    );

    expect(readingType.choice).toBe('名乗り');
    expect(readingType.confidence).toBe(0.88);
    expect(readingType.options.map((option) => option.label)).toEqual([
      '名乗り',
      '当て字',
      '訓読み',
      '音読み',
      '不一致',
    ]);
    expect(readingType.options[0].probability).toBe(0.7);
  });

  it('創作性が高いことと、読みとして誤りであることは独立して返る', async () => {
    const { client } = mockJev({
      plausibility: 0.4,
      inventiveness: {
        probabilities: [0.01, 0.04, 0.1, 0.25, 0.6],
        score: 3.39,
        confidence: 0.85,
      },
      readingType: {
        probabilities: {
          音読み: 0.02,
          訓読み: 0.03,
          名乗り: 0.15,
          当て字: 0.78,
          不一致: 0.02,
        },
        choice: '当て字',
        confidence: 0.81,
      },
    });

    const result = await analyzeReading({ kanji: '光', kana: 'らいと' }, client);

    // 「非典型だが誤入力ではない」= review + 高い創作性 + 誤り種別は問題なし
    expect(result.verdict).toBe('review');
    expect(result.inventiveness.likeliest).toBe(4);
    expect(result.readingType.choice).toBe('当て字');
    expect(result.errorKind.choice).toBe('問題なし');
  });

  it('モデル名・トークン使用量・レイテンシを返す', async () => {
    const result = await analyzeReading(
      { kanji: '山田', kana: 'やまだ' },
      mockJev().client,
    );

    expect(result.model).toBe('jev-1.13.0');
    expect(result.usage).toEqual({ inputTokens: 412, outputTokens: 57 });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.latencyMs)).toBe(true);
  });

  it('kanji または kana が空の場合はAPIを呼ばずにエラーを投げる', async () => {
    const { client, calls } = mockJev();

    await expect(
      analyzeReading({ kanji: '', kana: 'たろう' }, client),
    ).rejects.toThrow();
    await expect(
      analyzeReading({ kanji: '太郎', kana: '  ' }, client),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('APIが失敗した場合は例外をそのまま伝播する', async () => {
    const failing: AnalysisClient = {
      systemOne: async () => {
        throw new Error('rate limited');
      },
    };

    await expect(
      analyzeReading({ kanji: '山田', kana: 'やまだ' }, failing),
    ).rejects.toThrow('rate limited');
  });
});
