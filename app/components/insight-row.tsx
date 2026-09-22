import styles from './insight-row.module.css';

export type DistributionEntry = {
  label: string;
  probability: number;
  /** 最尤・選択されたラベルを強調する */
  highlighted?: boolean;
  /** 段階値など、ラベル手前の小さな見出し */
  badge?: string;
  /** ホバーで出す補足(モデルに渡したルーブリックの原文など) */
  hint?: string;
};

type Props = {
  name: string;
  primitive: 'noul' | 'choice' | 'score';
  /** 大きく出す結論。scoreなら期待値、choiceなら選択ラベル */
  headline: string;
  /** 結論の補足。scoreなら最尤段階のラベル */
  headlineNote?: string;
  /** noul は confidence を返さないため undefined になる */
  confidence?: number;
  /** confidence が無い場合に理由を添える */
  annotation?: string;
  distribution: DistributionEntry[];
};

/**
 * 観点1つぶんを1行に収める。
 * 確率分布は縦棒ではなくインラインのテキストで並べ、一画面に6観点が入る密度にしている。
 */
export function InsightRow({
  name,
  primitive,
  headline,
  headlineNote,
  confidence,
  annotation,
  distribution,
}: Props) {
  return (
    <div className={styles.row}>
      <div className={styles.name}>
        <span className={styles.nameLabel}>{name}</span>
        <code className={styles.primitive}>{primitive}</code>
      </div>

      <div className={styles.body}>
        <p className={styles.headlineLine}>
          <strong className={styles.headline}>{headline}</strong>
          {headlineNote && (
            <span className={styles.headlineNote}>{headlineNote}</span>
          )}
          {confidence === undefined ? (
            <span className={styles.annotation}>{annotation}</span>
          ) : (
            <span className={styles.confidence}>
              confidence <b>{formatPercent(confidence)}</b>
              <span className={styles.confTrack}>
                <span
                  className={styles.confFill}
                  style={{ width: `${toPercent(confidence)}%` }}
                />
              </span>
            </span>
          )}
        </p>

        <ul className={styles.distribution}>
          {distribution.map((entry) => (
            <li
              key={entry.label}
              className={entry.highlighted ? styles.entryTop : styles.entry}
              title={entry.hint}
            >
              {entry.badge !== undefined && (
                <span className={styles.badge}>{entry.badge}</span>
              )}
              <span className={styles.entryLabel}>{entry.label}</span>
              <b className={styles.entryValue}>
                {formatPercent(entry.probability)}
              </b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** 0未満・1超・NaNが来ても描画が壊れないように丸める */
function toPercent(probability: number): number {
  if (!Number.isFinite(probability)) return 0;
  return Math.min(100, Math.max(0, probability * 100));
}

export function formatPercent(probability: number): string {
  return `${toPercent(probability).toFixed(1)}%`;
}
