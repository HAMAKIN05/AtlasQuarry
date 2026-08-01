import { JetBrains_Mono } from 'next/font/google';

/**
 * 書体。
 *
 * 本文の **Zen Kaku Gothic New は Fontsource（npm）で自己ホスト**している。
 * `next/font/google` は日本語サブセットを扱えず（`subsets` に 'japanese' が無い）、
 * latin だけ取ると**日本語が端末のフォントに落ちて設計が効かない**。実際にそうなっていた。
 * Fontsource は unicode-range で 10 分割された woff2 を配るので、
 * ブラウザは実際に使う範囲だけを取りに行く。読み込みは globals.css の @import。
 *
 * タスク番号・日付・件数は **JetBrains Mono**。ここは latin だけで足りるので next/font でよい。
 * 桁が揃うことに意味がある値なので、本文と役割を分ける。
 */
export const mono = JetBrains_Mono({
  weight: ['400', '600'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono-loaded',
});
