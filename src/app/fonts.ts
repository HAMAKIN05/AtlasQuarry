import { JetBrains_Mono, Zen_Kaku_Gothic_New } from 'next/font/google';

/**
 * 書体。
 *
 * `next/font/google` はビルド時にフォントを取得してアプリと一緒に配信する。
 * 実行時に外部へ取りに行かないので、VPS 上の自己完結を崩さない。
 *
 * 本文は **Zen Kaku Gothic New**。日本語のゴシックで、字面が素直で癖がなく、
 * 画数の多い漢字が小さい字でも潰れない。システムフォント任せだと端末ごとに
 * 別物になり、詰めや太さの設計が効かない。
 *
 * タスク番号・日付・件数は **JetBrains Mono**。桁が揃うことに意味がある値なので、
 * 本文と役割を分ける。
 */
export const sans = Zen_Kaku_Gothic_New({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans-loaded',
  // 日本語グリフは Google 側が unicode-range で分割配信する。
  // preload すると全サブセットを先読みしてしまうため切る
  preload: false,
});

export const mono = JetBrains_Mono({
  weight: ['400', '600'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono-loaded',
});
