import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '読み方判定デモ | Jev (TypeSafe AI) の多観点評価',
  description:
    'Jev (TypeSafe AI) の noul / choice / score を使い、漢字氏名とふりがなの組み合わせを6観点から同時に評価します。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
