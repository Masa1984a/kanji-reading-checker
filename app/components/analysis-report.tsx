import type {
  ChoiceInsight,
  ReadingAnalysis,
  ScoreInsight,
} from '@/lib/analyze-reading';
import {
  InsightRow,
  formatPercent,
  type DistributionEntry,
} from './insight-row';
import styles from './analysis-report.module.css';

const VERDICT_LABEL = {
  plausible: '一般的',
  review: '要確認',
  unlikely: '非標準',
} as const;

/**
 * Jevが返した6観点の値。ここでは値をそのまま並べるだけで、
 * しきい値による判断は CodeDecision 側で行う。
 */
export function JevValues({ analysis }: { analysis: ReadingAnalysis }) {
  return (
    <div className={styles.values}>
      <InsightRow
        name="読みの妥当性"
        primitive="noul"
        headline={formatPercent(analysis.plausibility)}
        annotation="← noul に confidence はありません"
        distribution={[
          {
            label: '妥当',
            probability: analysis.plausibility,
            highlighted: analysis.plausibility >= 0.5,
          },
          {
            label: '非妥当',
            probability: 1 - analysis.plausibility,
            highlighted: analysis.plausibility < 0.5,
          },
        ]}
      />

      <InsightRow
        name="読みの一般性"
        primitive="score"
        headline={formatScore(analysis.commonness)}
        headlineNote={likeliestLabel(analysis.commonness)}
        confidence={analysis.commonness.confidence}
        distribution={toScoreEntries(analysis.commonness)}
      />

      <InsightRow
        name="読みの成立根拠"
        primitive="choice"
        headline={analysis.readingType.choice}
        confidence={analysis.readingType.confidence}
        distribution={toChoiceEntries(analysis.readingType)}
      />

      <InsightRow
        name="誤りの種別"
        primitive="choice"
        headline={analysis.errorKind.choice}
        confidence={analysis.errorKind.confidence}
        distribution={toChoiceEntries(analysis.errorKind)}
      />

      <InsightRow
        name="創作性"
        primitive="score"
        headline={formatScore(analysis.inventiveness)}
        headlineNote={likeliestLabel(analysis.inventiveness)}
        confidence={analysis.inventiveness.confidence}
        distribution={toScoreEntries(analysis.inventiveness)}
      />

      <InsightRow
        name="確認の優先度"
        primitive="score"
        headline={formatScore(analysis.reviewPriority)}
        headlineNote={likeliestLabel(analysis.reviewPriority)}
        confidence={analysis.reviewPriority.confidence}
        distribution={toScoreEntries(analysis.reviewPriority)}
      />

      <p className={styles.meta}>
        <span>
          判定対象 <b>{analysis.kanji}</b> / <b>{analysis.kana}</b>
        </span>
        <span>model {analysis.model}</span>
        <span>
          入力 {analysis.usage.inputTokens.toLocaleString('ja-JP')} トークン
        </span>
        <span>
          出力 {analysis.usage.outputTokens.toLocaleString('ja-JP')} トークン
        </span>
        <span>往復 {analysis.latencyMs}ms(通信込み)</span>
        <span>6問を1リクエストで並列評価</span>
      </p>
    </div>
  );
}

/**
 * Jevは値を返すだけで、どう扱うかはしきい値を持つこちらのコードが決める。
 */
export function CodeDecision({ analysis }: { analysis: ReadingAnalysis }) {
  return (
    <div className={styles.decision}>
      <div className={styles.verdictLine}>
        <span className={`${styles.verdict} ${styles[analysis.verdict]}`}>
          {VERDICT_LABEL[analysis.verdict]}
        </span>
        <code className={styles.rule}>
          plausibility {formatPercent(analysis.plausibility)} → 0.85以上=一般的
          / 0.3以下=非標準 / それ以外=要確認
        </code>
      </div>
      <p className={styles.interpretation}>{interpret(analysis)}</p>
    </div>
  );
}

/** 期待値を「1.62 / 4」の形にする。分母は段階数から求める */
export function formatScore(insight: ScoreInsight): string {
  const max = Math.max(0, insight.levels.length - 1);
  return `${insight.score.toFixed(2)} / ${max}`;
}

function likeliestLabel(insight: ScoreInsight): string | undefined {
  return insight.levels.find((level) => level.value === insight.likeliest)
    ?.label;
}

function toScoreEntries(insight: ScoreInsight): DistributionEntry[] {
  return insight.levels.map((level) => ({
    label: level.label,
    probability: level.probability,
    highlighted: level.value === insight.likeliest,
    badge: String(level.value),
    hint: level.criterion,
  }));
}

function toChoiceEntries(insight: ChoiceInsight): DistributionEntry[] {
  return insight.options.map((option) => ({
    label: option.label,
    probability: option.probability,
    highlighted: option.label === insight.choice,
  }));
}

/**
 * 観点をまたいで読み解いた一行コメント。
 * 単一の確率では表せない組み合わせを言語化するのがデモの主眼。
 */
export function interpret(analysis: ReadingAnalysis): string {
  const { verdict, readingType, errorKind, inventiveness, commonness } =
    analysis;

  if (errorKind.choice !== '問題なし' && errorKind.confidence >= 0.5) {
    return `誤りの種別として「${errorKind.choice}」が最有力です(confidence ${formatPercent(errorKind.confidence)})。この型なら修正候補を機械的に提示できます。`;
  }

  if (verdict !== 'plausible') {
    return `妥当性は ${formatPercent(analysis.plausibility)} と低めですが、誤りの種別は「問題なし」、成立根拠は「${readingType.choice}」です。誤入力ではなく、非典型だが正当な読みである可能性が高いパターンです。`;
  }

  if (commonness.confidence < 0.5) {
    return `一般性の confidence が ${formatPercent(commonness.confidence)} と低く、モデル自身が判断材料の不足を示しています。noul の確率だけではこの状態を検出できません。`;
  }

  if (inventiveness.likeliest >= 3) {
    return `一般的な読みと判定されつつ、創作性は高めです(${formatScore(inventiveness)})。「正しいが珍しい」を一般性とは別軸で表せています。`;
  }

  return `6観点すべてが整合しています。確認の優先度は ${formatScore(analysis.reviewPriority)} です。`;
}
