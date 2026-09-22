'use client';

import { useState, type FormEvent } from 'react';
import { CodeDecision, JevValues } from './components/analysis-report';
import type { ReadingAnalysis } from '@/lib/analyze-reading';
import styles from './page.module.css';

type ApiError = { error: string };

/** デモの導線。それぞれ別の観点が際立つ例を選んでいる */
const PRESETS = [
  { kanji: '山田太郎', kana: 'やまだたろう', note: '典型的な読み' },
  { kanji: '一二三', kana: 'ひふみ', note: '難読だが実在する名乗り' },
  { kanji: '光', kana: 'らいと', note: '当て字・創作性が高い' },
  { kanji: '山崎', kana: 'やまさき', note: '濁音の揺れ' },
  { kanji: '斉藤', kana: 'さいとう', note: '類似漢字(斉/斎/齊)' },
  { kanji: '田中', kana: 'すずき', note: '明確な不一致' },
  { kanji: '鈴木', kana: 'ｽｽﾞｷ', note: '半角カナ入力 → ひらがなに正規化' },
] as const;

export default function DemoPage() {
  const [kanji, setKanji] = useState('');
  const [kana, setKana] = useState('');
  const [analysis, setAnalysis] = useState<ReadingAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const canSubmit =
    kanji.trim().length > 0 && kana.trim().length > 0 && !isLoading;

  async function analyze(nextKanji: string, nextKana: string) {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/analyze-reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kanji: nextKanji, kana: nextKana }),
      });

      const data: ReadingAnalysis | ApiError = await response.json();

      if (!response.ok || 'error' in data) {
        setAnalysis(null);
        setError('error' in data ? data.error : '評価に失敗しました');
        return;
      }

      setAnalysis(data);
    } catch {
      setAnalysis(null);
      setError('通信エラーが発生しました。ネットワーク接続を確認してください。');
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    void analyze(kanji.trim(), kana.trim());
  }

  function handlePreset(preset: (typeof PRESETS)[number]) {
    setKanji(preset.kanji);
    setKana(preset.kana);
    void analyze(preset.kanji, preset.kana);
  }

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <h1 className={styles.title}>読み方判定デモ</h1>
          <p className={styles.subtitle}>
            Jev / TypeSafe System One — 判断はモデル、処理はコード
          </p>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.grid}>
          <div className={styles.column}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>1. 氏名とふりがな</h2>

              <form className={styles.form} onSubmit={handleSubmit}>
                <div className={styles.fields}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="demo-kanji">
                      氏名(漢字)
                    </label>
                    <input
                      id="demo-kanji"
                      className={styles.input}
                      value={kanji}
                      onChange={(event) => setKanji(event.target.value)}
                      placeholder="山田太郎"
                      autoComplete="off"
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="demo-kana">
                      ふりがな
                    </label>
                    <input
                      id="demo-kana"
                      className={styles.input}
                      value={kana}
                      onChange={(event) => setKana(event.target.value)}
                      placeholder="やまだたろう"
                      autoComplete="off"
                    />
                  </div>
                </div>

                <p className={styles.hint}>
                  ひらがな・カタカナ・半角カナのいずれでも構いません。ひらがなに正規化して判定します。
                </p>

                <ul className={styles.presets}>
                  {PRESETS.map((preset) => (
                    <li key={`${preset.kanji}/${preset.kana}`}>
                      <button
                        type="button"
                        className={styles.preset}
                        onClick={() => handlePreset(preset)}
                        disabled={isLoading}
                        title={preset.note}
                      >
                        {preset.kanji}／{preset.kana}
                      </button>
                    </li>
                  ))}
                </ul>

                <button
                  className={styles.submit}
                  type="submit"
                  disabled={!canSubmit}
                >
                  {isLoading ? '評価中…' : '判定する'}
                </button>
              </form>

              <p className={styles.caption}>
                入力はこのページから当サーバーへ送られ、サーバーから Jev
                へ渡されます。APIキーはブラウザへ渡しません。
              </p>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>3. こちらのコードが決めたこと</h2>

              {analysis && !error ? (
                <CodeDecision analysis={analysis} />
              ) : (
                <p className={styles.placeholder}>
                  Jev は値を返すだけです。何をするかは、しきい値を使って自分たちのコードが決めます。
                </p>
              )}
            </section>
          </div>

          <section className={`${styles.card} ${styles.cardAccent}`}>
            <h2 className={styles.cardTitle}>2. Jev が返した値</h2>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            {analysis && !error && <JevValues analysis={analysis} />}

            {!analysis && !error && (
              <p className={styles.placeholder}>
                サンプルを押すか、氏名とふりがなを入力して「判定する」を実行すると、
                <code>noul</code> / <code>choice</code> / <code>score</code>{' '}
                の6観点がここに並びます。
              </p>
            )}
          </section>
        </div>

        <p className={styles.footer}>
          いずれの観点も「日本語の人名としてどの程度典型的か」の推定であり、戸籍上の正誤を保証するものではありません。創作性が高いことは誤りを意味しません。当て字・名乗りは正当な読みとして実在します。
        </p>
      </div>
    </div>
  );
}
