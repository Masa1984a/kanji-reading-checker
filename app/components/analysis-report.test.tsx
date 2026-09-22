import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ReadingAnalysis, ScoreInsight } from '@/lib/analyze-reading';
import {
  CodeDecision,
  JevValues,
  formatScore,
  interpret,
} from './analysis-report';

function scoreInsight(
  probabilities: number[],
  score: number,
  confidence: number,
): ScoreInsight {
  const levels = probabilities.map((probability, value) => ({
    value,
    label: `段階${value}`,
    criterion: `level ${value}`,
    probability,
  }));

  const likeliest = levels.reduce((best, level) =>
    level.probability > best.probability ? level : best,
  ).value;

  return { score, confidence, likeliest, levels };
}

/** 「当て字だが誤入力ではない」ケース。観点ごとの値が交差する例 */
const ANALYSIS: ReadingAnalysis = {
  kanji: '光',
  kana: 'らいと',
  plausibility: 0.41,
  verdict: 'review',
  commonness: scoreInsight([0.05, 0.42, 0.36, 0.13, 0.04], 1.62, 0.58),
  inventiveness: scoreInsight([0.01, 0.03, 0.09, 0.22, 0.65], 3.47, 0.86),
  reviewPriority: scoreInsight([0.06, 0.14, 0.31, 0.37, 0.12], 2.35, 0.72),
  readingType: {
    choice: '当て字',
    confidence: 0.79,
    options: [
      { label: '当て字', probability: 0.74 },
      { label: '名乗り', probability: 0.14 },
      { label: '訓読み', probability: 0.06 },
      { label: '音読み', probability: 0.04 },
      { label: '不一致', probability: 0.02 },
    ],
  },
  errorKind: {
    choice: '問題なし',
    confidence: 0.83,
    options: [
      { label: '問題なし', probability: 0.83 },
      { label: '無関係', probability: 0.08 },
      { label: '区切りずれ', probability: 0.04 },
      { label: '濁音の違い', probability: 0.03 },
      { label: '類似漢字の混同', probability: 0.02 },
    ],
  },
  usage: { inputTokens: 1184, outputTokens: 96 },
  latencyMs: 148,
  model: 'jev-1.13.0',
};

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('formatScore', () => {
  it('期待値と段階数の上限を表示する', () => {
    expect(formatScore(ANALYSIS.commonness)).toBe('1.62 / 4');
    expect(formatScore(ANALYSIS.inventiveness)).toBe('3.47 / 4');
  });

  it('段階が空でも壊れない', () => {
    expect(
      formatScore({ score: 0, confidence: 0, likeliest: 0, levels: [] }),
    ).toBe('0.00 / 0');
  });
});

describe('interpret', () => {
  it('誤り種別が立っていればその修正を促す', () => {
    const message = interpret({
      ...ANALYSIS,
      errorKind: {
        choice: '濁音の違い',
        confidence: 0.77,
        options: ANALYSIS.errorKind.options,
      },
    });
    expect(message).toContain('濁音の違い');
    expect(message).toContain('77.0%');
  });

  it('妥当性が低く誤り種別が問題なしなら「非典型だが正当」と説明する', () => {
    expect(interpret(ANALYSIS)).toContain('非典型だが正当な読み');
    expect(interpret(ANALYSIS)).toContain('当て字');
  });

  it('一般的と判定されつつ創作性が高い場合を区別する', () => {
    const message = interpret({
      ...ANALYSIS,
      plausibility: 0.93,
      verdict: 'plausible',
    });
    expect(message).toContain('正しいが珍しい');
  });

  it('confidence が低い場合は判断材料不足として説明する', () => {
    const message = interpret({
      ...ANALYSIS,
      plausibility: 0.93,
      verdict: 'plausible',
      commonness: scoreInsight([0.2, 0.2, 0.2, 0.2, 0.2], 2.0, 0.31),
      inventiveness: scoreInsight([0.7, 0.2, 0.05, 0.03, 0.02], 0.45, 0.8),
    });
    expect(message).toContain('判断材料の不足');
    expect(message).toContain('31.0%');
  });

  it('すべて整合している場合は優先度を示す', () => {
    const message = interpret({
      ...ANALYSIS,
      plausibility: 0.96,
      verdict: 'plausible',
      inventiveness: scoreInsight([0.7, 0.2, 0.05, 0.03, 0.02], 0.45, 0.8),
    });
    expect(message).toContain('6観点すべてが整合');
    expect(message).toContain('2.35 / 4');
  });
});

describe('JevValues', () => {
  const markup = renderToStaticMarkup(<JevValues analysis={ANALYSIS} />);

  it('6観点すべてを描画する', () => {
    for (const name of [
      '読みの妥当性',
      '読みの一般性',
      '読みの成立根拠',
      '誤りの種別',
      '創作性',
      '確認の優先度',
    ]) {
      expect(markup).toContain(name);
    }
  });

  it('観点ごとに使ったプリミティブを表示する', () => {
    expect(occurrences(markup, '>noul<')).toBe(1);
    expect(occurrences(markup, '>choice<')).toBe(2);
    expect(occurrences(markup, '>score<')).toBe(3);
  });

  it('noul には confidence を表示しない', () => {
    // confidence を持つ5観点ぶんだけバーが出る (noul には出ない)
    expect(occurrences(markup, 'width:')).toBe(5);
    // 5観点の confidence はすべて数値で出ている
    for (const value of ['58.0%', '79.0%', '83.0%', '86.0%', '72.0%']) {
      expect(markup, value).toContain(value);
    }
    // noul 行に注記は出さない
    expect(markup).not.toContain('confidence はありません');
  });

  it('score は期待値と最尤段階のラベル、choice は選択ラベルを見出しに出す', () => {
    expect(markup).toContain('1.62 / 4');
    expect(markup).toContain('3.47 / 4');
    expect(markup).toContain('2.35 / 4');
    expect(markup).toContain('当て字');
    expect(markup).toContain('問題なし');
    // commonness の最尤は段階1、inventiveness は段階4
    expect(markup).toContain('段階1');
    expect(markup).toContain('段階4');
  });

  it('確率分布を全ラベルぶん並べる', () => {
    // noul 2 + score 3問 × 5 + choice 2問 × 5 = 27
    expect(occurrences(markup, '<li')).toBe(27);
    expect(markup).toContain('74.0%');
    expect(markup).toContain('42.0%');
    expect(markup).toContain('41.0%');
    // noul の裏側 (1 - plausibility)
    expect(markup).toContain('59.0%');
  });

  it('モデルへ渡したルーブリック原文をホバー用に持つ', () => {
    expect(occurrences(markup, 'title="level 0"')).toBe(3);
  });

  it('1行のメタに判定対象・モデル・トークン・往復時間を出す', () => {
    expect(markup).toContain('判定対象');
    expect(markup).toContain('光');
    expect(markup).toContain('らいと');
    expect(markup).toContain('jev-1.13.0');
    expect(markup).toContain('1,184');
    expect(markup).toContain('148ms');
    expect(markup).toContain('6問を1リクエストで並列評価');
  });
});

describe('CodeDecision', () => {
  it('しきい値による判定と、その規則を並べて示す', () => {
    const markup = renderToStaticMarkup(<CodeDecision analysis={ANALYSIS} />);

    expect(markup).toContain('要確認');
    expect(markup).toContain('0.85以上=一般的');
    expect(markup).toContain('非典型だが正当な読み');
  });

  it('verdict ごとにラベルが変わる', () => {
    const plausible = renderToStaticMarkup(
      <CodeDecision analysis={{ ...ANALYSIS, verdict: 'plausible' }} />,
    );
    expect(plausible).toContain('一般的');

    const unlikely = renderToStaticMarkup(
      <CodeDecision analysis={{ ...ANALYSIS, verdict: 'unlikely' }} />,
    );
    expect(unlikely).toContain('非標準');
  });
});
