import type { Metadata, Viewport } from 'next';

import { sans } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'AtlasQuarry',
  description: '法人内システム内製化プロジェクトのためのプロジェクト管理ツール',
};

/**
 * モバイルファースト（CLAUDE.md UI規約）。
 * ズームを禁止しないのは、拡大できないと読めない利用者を締め出すため。
 *
 * **`viewportFit: 'cover'` は使わない。**
 *
 * 下部タブが Safari のツールバーに半分隠れるのを直そうとして一度入れたが、逆効果だった。
 * 実機で測ったところ `env(safe-area-inset-bottom)` は **0px** を返す。
 * Safari はツールバーを出している間このインセットを 0 と報告する一方、`cover` は
 * レイアウトを**ツールバーの裏まで広げる**。広げた分を埋める余白がもらえないので、
 * `position: fixed; bottom: 0` の下部タブがそのままツールバーの下に潜る。
 *
 * `cover` を外せば、iOS はレイアウトビューポート自体をセーフエリア内に収めてくれる。
 * 端まで色を敷きたい要求は無いので、こちらが正しい。
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
